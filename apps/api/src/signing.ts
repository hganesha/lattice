import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type JsonWebKey, type KeyObject } from 'node:crypto'

/**
 * Plan signing, and the key material behind it.
 *
 * The key used to be generated per process, which meant a plan could only be verified by the
 * instance that issued it: a restart or a second replica invalidated every live plan, and
 * nothing outside the process could check one at all. Keys are now supplied by configuration,
 * identified by their own thumbprint, and retained across a rotation so plans signed by the
 * previous key keep verifying until they expire.
 *
 * The interface is deliberately narrow so a managed KMS or HSM is a drop-in: an implementation
 * only has to sign bytes and publish public keys. Nothing above this layer knows where the
 * private key lives.
 */
export interface PlanSigner {
  readonly activeKeyId: string
  sign(payload: Buffer): string
  /** Verifies against the named key, so a plan signed before a rotation still verifies. */
  verify(payload: Buffer, signature: string, keyId: string): boolean
  /** Every key a verifier should trust, newest first, as a JWKS `keys` array. */
  publicKeys(): Array<JsonWebKey & { kid: string; alg: string; use: string }>
}

interface SigningKey {
  keyId: string
  privateKey?: KeyObject
  publicKey: KeyObject
}

export class LocalPlanSigner implements PlanSigner {
  private readonly keys: SigningKey[]

  constructor(active: KeyObject, retired: KeyObject[] = []) {
    const activeKey = describeKey(active)
    this.keys = [activeKey, ...retired.map((key) => describeKey(key))]
  }

  get activeKeyId(): string {
    return this.keys[0]!.keyId
  }

  sign(payload: Buffer): string {
    const active = this.keys[0]!
    if (!active.privateKey) throw new Error('SIGNING_KEY_NOT_AVAILABLE')
    return sign(null, payload, active.privateKey).toString('base64url')
  }

  verify(payload: Buffer, signature: string, keyId: string): boolean {
    // Only the key the plan names is tried. Accepting any known key would let a plan signed by
    // a retired key pass as if it were current, which is exactly what a rotation is meant to end.
    const key = this.keys.find((candidate) => candidate.keyId === keyId)
    if (!key) return false
    try {
      return verify(null, payload, key.publicKey, Buffer.from(signature, 'base64url'))
    } catch {
      return false
    }
  }

  publicKeys(): Array<JsonWebKey & { kid: string; alg: string; use: string }> {
    return this.keys.map((key) => ({
      ...(key.publicKey.export({ format: 'jwk' }) as JsonWebKey),
      kid: key.keyId,
      alg: 'EdDSA',
      use: 'sig',
    }))
  }
}

/**
 * Derives a stable key identifier from the key itself, per RFC 7638.
 *
 * A hand-written identifier can be reused across two different keys, which silently breaks
 * verification. A thumbprint cannot: change the key and the identifier changes with it.
 */
export function keyThumbprint(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: 'jwk' }) as { crv?: string; kty?: string; x?: string }
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x })
  return createHash('sha256').update(canonical).digest('base64url')
}

function describeKey(key: KeyObject): SigningKey {
  const publicKey = key.type === 'private' ? createPublicKey(key) : key
  return {
    keyId: keyThumbprint(publicKey),
    ...(key.type === 'private' ? { privateKey: key } : {}),
    publicKey,
  }
}

export interface SignerFromEnvironmentResult {
  signer: PlanSigner
  /** True when no key was configured and an ephemeral one was generated for local development. */
  ephemeral: boolean
}

/**
 * Builds the signer from configuration.
 *
 * `LATTICE_SIGNING_KEY` is a PKCS#8 Ed25519 private key, PEM or base64-encoded PEM.
 * `LATTICE_SIGNING_KEYS_RETIRED` holds comma-separated public keys kept verifiable through a
 * rotation. Without a configured key the server generates one and reports it as ephemeral, which
 * the caller refuses to accept in production — an unverifiable audit trail is worse than none.
 */
export function planSignerFromEnvironment(environment: NodeJS.ProcessEnv = process.env): SignerFromEnvironmentResult {
  const configured = environment.LATTICE_SIGNING_KEY?.trim()
  if (!configured) {
    const { privateKey } = generateKeyPairSync('ed25519')
    return { signer: new LocalPlanSigner(privateKey), ephemeral: true }
  }

  const retired = (environment.LATTICE_SIGNING_KEYS_RETIRED ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
    .map((key) => readPublicKey(key))

  return { signer: new LocalPlanSigner(readPrivateKey(configured), retired), ephemeral: false }
}

function readPrivateKey(value: string): KeyObject {
  try {
    return createPrivateKey(decodePem(value))
  } catch {
    throw new Error('LATTICE_SIGNING_KEY must be a PKCS#8 Ed25519 private key, as PEM or base64-encoded PEM.')
  }
}

function readPublicKey(value: string): KeyObject {
  try {
    return createPublicKey(decodePem(value))
  } catch {
    throw new Error('LATTICE_SIGNING_KEYS_RETIRED must contain SPKI public keys, as PEM or base64-encoded PEM.')
  }
}

/** Accepts a PEM directly, or base64-encoded PEM for environments that mangle newlines. */
function decodePem(value: string): string {
  if (value.includes('-----BEGIN')) return value.replace(/\\n/g, '\n')
  return Buffer.from(value, 'base64').toString('utf8')
}
