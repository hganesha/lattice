import { createHash, type KeyObject } from 'node:crypto'
import { RemotePlanSigner, derToRawSignature, publicKeyFromP256, remoteSigningKey, type RemoteSigningKey } from './signingKms.js'

/**
 * Azure Key Vault and AWS KMS signers.
 *
 * Both hold the private key and never release it, which is the point: compromising the API no
 * longer compromises the ability to mint plans, and key use is logged and revocable on the
 * provider's side rather than only here.
 *
 * They differ in one detail that matters. Key Vault returns an ECDSA signature already in the
 * raw r||s form JWS expects; AWS KMS returns DER. Normalizing that here means a plan's signature
 * is the same shape whichever provider signed it, and any standard verifier can check it.
 */

const PROVIDER_TIMEOUT_MS = 10_000

export interface AzureKeyVaultOptions {
  /** Full key identifier, for example https://vault.vault.azure.net/keys/lattice-signing/abc123. */
  keyIdentifier: string
  /** Supplies an Entra access token for the Key Vault resource. */
  accessToken: () => Promise<string>
  retiredKeyIdentifiers?: string[]
  fetchImpl?: typeof fetch
}

export class AzureKeyVaultPlanSigner extends RemotePlanSigner {
  private constructor(
    active: RemoteSigningKey,
    retired: RemoteSigningKey[],
    private readonly options: AzureKeyVaultOptions,
  ) {
    super(active, retired)
  }

  static async create(options: AzureKeyVaultOptions): Promise<AzureKeyVaultPlanSigner> {
    const active = await AzureKeyVaultPlanSigner.readKey(options, options.keyIdentifier)
    const retired: RemoteSigningKey[] = []
    for (const identifier of options.retiredKeyIdentifiers ?? []) {
      retired.push(await AzureKeyVaultPlanSigner.readKey(options, identifier))
    }
    return new AzureKeyVaultPlanSigner(active, retired, options)
  }

  private static async readKey(options: AzureKeyVaultOptions, identifier: string): Promise<RemoteSigningKey> {
    const url = new URL(identifier)
    url.searchParams.set('api-version', '7.4')
    const response = await (options.fetchImpl ?? fetch)(url, {
      headers: { Authorization: `Bearer ${await options.accessToken()}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`AZURE_KEY_VAULT_KEY_READ_FAILED:${response.status}`)

    const payload = await response.json() as { key?: { kty?: string; crv?: string; x?: string; y?: string } }
    const key = payload.key
    if (key?.kty !== 'EC' && key?.kty !== 'EC-HSM') throw new Error('AZURE_KEY_VAULT_KEY_NOT_EC')
    if (key.crv !== 'P-256') throw new Error(`AZURE_KEY_VAULT_CURVE_UNSUPPORTED:${key.crv}`)
    if (!key.x || !key.y) throw new Error('AZURE_KEY_VAULT_KEY_INCOMPLETE')

    return remoteSigningKey(
      publicKeyFromP256(Buffer.from(key.x, 'base64url'), Buffer.from(key.y, 'base64url')),
      identifier,
    )
  }

  async signRemote(payload: Buffer, reference: string): Promise<Buffer> {
    // Key Vault signs a digest, not the message, so the payload is hashed here.
    const digest = createHash('sha256').update(payload).digest('base64url')
    const url = new URL(`${reference.replace(/\/$/, '')}/sign`)
    url.searchParams.set('api-version', '7.4')

    const response = await (this.options.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.options.accessToken()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ alg: 'ES256', value: digest }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`AZURE_KEY_VAULT_SIGN_FAILED:${response.status}`)

    const result = await response.json() as { value?: unknown }
    if (typeof result.value !== 'string') throw new Error('AZURE_KEY_VAULT_SIGN_INVALID_RESPONSE')
    // Already raw r||s; no conversion needed.
    return Buffer.from(result.value, 'base64url')
  }
}

export interface AwsKmsClient {
  send(command: { input: Record<string, unknown>; kind: 'GetPublicKey' | 'Sign' }): Promise<Record<string, unknown>>
}

export interface AwsKmsOptions {
  /** Key id, alias, or ARN. */
  keyId: string
  retiredKeyIds?: string[]
  /** Injected so the adapter is testable without the SDK or AWS credentials. */
  client: AwsKmsClient
}

export class AwsKmsPlanSigner extends RemotePlanSigner {
  private constructor(
    active: RemoteSigningKey,
    retired: RemoteSigningKey[],
    private readonly client: AwsKmsClient,
  ) {
    super(active, retired)
  }

  static async create(options: AwsKmsOptions): Promise<AwsKmsPlanSigner> {
    const active = await AwsKmsPlanSigner.readKey(options.client, options.keyId)
    const retired: RemoteSigningKey[] = []
    for (const keyId of options.retiredKeyIds ?? []) {
      retired.push(await AwsKmsPlanSigner.readKey(options.client, keyId))
    }
    return new AwsKmsPlanSigner(active, retired, options.client)
  }

  private static async readKey(client: AwsKmsClient, keyId: string): Promise<RemoteSigningKey> {
    const result = await client.send({ kind: 'GetPublicKey', input: { KeyId: keyId } })
    const spki = result.PublicKey as Uint8Array | undefined
    const spec = String(result.KeySpec ?? result.CustomerMasterKeySpec ?? '')
    if (!spki) throw new Error('AWS_KMS_PUBLIC_KEY_MISSING')
    if (spec !== 'ECC_NIST_P256') throw new Error(`AWS_KMS_KEY_SPEC_UNSUPPORTED:${spec || 'unknown'}`)

    const { createPublicKey } = await import('node:crypto')
    const publicKey: KeyObject = createPublicKey({ key: Buffer.from(spki), format: 'der', type: 'spki' })
    return remoteSigningKey(publicKey, keyId)
  }

  async signRemote(payload: Buffer, reference: string): Promise<Buffer> {
    const result = await this.client.send({
      kind: 'Sign',
      input: {
        KeyId: reference,
        Message: payload,
        MessageType: 'RAW',
        SigningAlgorithm: 'ECDSA_SHA_256',
      },
    })
    const signature = result.Signature as Uint8Array | undefined
    if (!signature) throw new Error('AWS_KMS_SIGN_INVALID_RESPONSE')
    // KMS returns DER; JWS requires raw r||s, so convert at the boundary rather than emitting a
    // signature no standard verifier could check.
    return derToRawSignature(Buffer.from(signature))
  }
}

/**
 * Wraps the AWS SDK behind the narrow client interface above.
 *
 * Imported lazily so a deployment that does not use AWS never loads the SDK, and so the adapter
 * stays unit-testable without credentials.
 */
export async function awsKmsClientFromEnvironment(region: string): Promise<AwsKmsClient> {
  const { KMSClient, GetPublicKeyCommand, SignCommand } = await import('@aws-sdk/client-kms')
  const client = new KMSClient({ region })
  return {
    async send(command) {
      const request = command.kind === 'GetPublicKey'
        ? new GetPublicKeyCommand(command.input as never)
        : new SignCommand(command.input as never)
      return client.send(request as never) as unknown as Promise<Record<string, unknown>>
    },
  }
}
