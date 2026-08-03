import { createPublicKey, verify, type JsonWebKey, type KeyObject } from 'node:crypto'
import type { PlanSignatureAlgorithm } from '@lattice/contracts'
import { keyThumbprint, type PlanSigner } from './signing.js'

/**
 * Plan signing where a managed KMS holds the private key.
 *
 * Neither AWS KMS nor Azure Key Vault will sign Ed25519, so a KMS-held key signs ES256 instead.
 * That is why the plan records its algorithm rather than assuming one: a verifier must be told,
 * not left to guess, and the same deployment may rotate from a local Ed25519 key to a managed
 * P-256 one without invalidating plans already in flight.
 *
 * Only signing crosses the network. Verification uses the public key, which is fetched once and
 * cached, so checking a plan costs neither a KMS call nor KMS quota.
 */

export interface RemoteSigningKey {
  keyId: string
  publicKey: KeyObject
  /** Provider handle for the key: an AWS key id or ARN, or a Key Vault key identifier. */
  reference: string
}

export abstract class RemotePlanSigner implements PlanSigner {
  protected constructor(
    private readonly active: RemoteSigningKey,
    private readonly retired: RemoteSigningKey[] = [],
  ) {}

  readonly algorithm: PlanSignatureAlgorithm = 'ES256'

  get activeKeyId(): string {
    return this.active.keyId
  }

  abstract signRemote(payload: Buffer, reference: string): Promise<Buffer>

  async sign(payload: Buffer): Promise<string> {
    const signature = await this.signRemote(payload, this.active.reference)
    return signature.toString('base64url')
  }

  verify(payload: Buffer, signature: string, keyId: string): boolean {
    const key = [this.active, ...this.retired].find((candidate) => candidate.keyId === keyId)
    if (!key) return false
    try {
      // JWS carries ECDSA signatures as raw r||s, so verification must be told not to expect DER.
      return verify('sha256', payload, { key: key.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))
    } catch {
      return false
    }
  }

  publicKeys(): Array<JsonWebKey & { kid: string; alg: string; use: string }> {
    return [this.active, ...this.retired].map((key) => ({
      ...(key.publicKey.export({ format: 'jwk' }) as JsonWebKey),
      kid: key.keyId,
      alg: 'ES256',
      use: 'sig',
    }))
  }
}

/**
 * Converts a DER-encoded ECDSA signature to the raw r||s form JWS requires.
 *
 * AWS KMS returns DER; Key Vault already returns raw. Emitting DER on the plan would produce
 * signatures no standard JWS verifier could check, so this normalizes at the boundary rather
 * than pushing the difference out to every consumer.
 */
export function derToRawSignature(der: Buffer, componentBytes = 32): Buffer {
  if (der[0] !== 0x30) throw new Error('ECDSA_SIGNATURE_NOT_DER')

  // SEQUENCE header, then two INTEGERs. Long-form lengths are possible on the outer sequence.
  let offset = der[1]! & 0x80 ? 2 + (der[1]! & 0x7f) : 2

  const readInteger = (): Buffer => {
    if (der[offset] !== 0x02) throw new Error('ECDSA_SIGNATURE_NOT_DER')
    const length = der[offset + 1]!
    const start = offset + 2
    offset = start + length
    // DER integers are signed, so a leading zero may pad a high bit; fixed-width raw has none.
    let value = der.subarray(start, start + length)
    while (value.length > componentBytes && value[0] === 0x00) value = value.subarray(1)
    if (value.length > componentBytes) throw new Error('ECDSA_SIGNATURE_COMPONENT_TOO_LARGE')
    return Buffer.concat([Buffer.alloc(componentBytes - value.length), value])
  }

  const r = readInteger()
  const s = readInteger()
  return Buffer.concat([r, s])
}

/** Rebuilds a public KeyObject from the coordinates a provider returns. */
export function publicKeyFromP256(x: Buffer, y: Buffer): KeyObject {
  return createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: x.toString('base64url'), y: y.toString('base64url') },
    format: 'jwk',
  })
}

export function remoteSigningKey(publicKey: KeyObject, reference: string): RemoteSigningKey {
  return { keyId: keyThumbprint(publicKey), publicKey, reference }
}
