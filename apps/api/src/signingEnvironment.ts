import { EntraOnBehalfOfExchange } from './delegatedIdentity.js'
import type { PlanSigner } from './signing.js'
import { AwsKmsPlanSigner, AzureKeyVaultPlanSigner, awsKmsClientFromEnvironment } from './signingProviders.js'

/**
 * Builds a managed-key signer from configuration.
 *
 * Kept apart from `signing.ts` so the cloud adapters — and the AWS SDK behind one of them — are
 * only reached by a deployment that actually asked for them.
 */
export async function managedSignerFromEnvironment(
  provider: 'AZURE_KEY_VAULT' | 'AWS_KMS',
  environment: NodeJS.ProcessEnv,
): Promise<PlanSigner> {
  const retired = (environment.LATTICE_SIGNING_KEYS_RETIRED ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (provider === 'AZURE_KEY_VAULT') {
    const keyIdentifier = environment.LATTICE_SIGNING_KEY_ID?.trim()
    if (!keyIdentifier) throw new Error('LATTICE_SIGNING_KEY_ID must be the full Key Vault key identifier.')
    return AzureKeyVaultPlanSigner.create({
      keyIdentifier,
      retiredKeyIdentifiers: retired,
      accessToken: keyVaultTokenFromEnvironment(environment),
    })
  }

  const keyId = environment.LATTICE_SIGNING_KEY_ID?.trim()
  const region = environment.LATTICE_SIGNING_AWS_REGION?.trim() || environment.AWS_REGION?.trim()
  if (!keyId) throw new Error('LATTICE_SIGNING_KEY_ID must be the KMS key id, alias, or ARN.')
  if (!region) throw new Error('LATTICE_SIGNING_AWS_REGION or AWS_REGION must be set for AWS KMS signing.')

  return AwsKmsPlanSigner.create({
    keyId,
    retiredKeyIds: retired,
    client: await awsKmsClientFromEnvironment(region),
  })
}

/**
 * Obtains a Key Vault access token via Entra client credentials.
 *
 * Tokens are cached until shortly before expiry: Key Vault is called on every plan signature, and
 * minting a token per signature would add a second round trip to the hot path.
 */
function keyVaultTokenFromEnvironment(environment: NodeJS.ProcessEnv): () => Promise<string> {
  const tokenEndpoint = environment.LATTICE_SIGNING_AZURE_TOKEN_ENDPOINT?.trim()
  const clientId = environment.LATTICE_SIGNING_AZURE_CLIENT_ID?.trim()
  const clientSecret = environment.LATTICE_SIGNING_AZURE_CLIENT_SECRET?.trim()
  if (!tokenEndpoint || !clientId || !clientSecret) {
    throw new Error('Azure Key Vault signing requires LATTICE_SIGNING_AZURE_TOKEN_ENDPOINT, _CLIENT_ID, and _CLIENT_SECRET.')
  }

  let cached: { token: string; expiresAt: number } | undefined
  return async () => {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://vault.azure.net/.default',
      }).toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    // Only the status is surfaced: the body can name the application and its scopes.
    if (!response.ok) throw new Error(`AZURE_KEY_VAULT_TOKEN_FAILED:${response.status}`)

    const payload = await response.json() as { access_token?: unknown; expires_in?: unknown }
    if (typeof payload.access_token !== 'string') throw new Error('AZURE_KEY_VAULT_TOKEN_INVALID_RESPONSE')
    const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 300
    cached = { token: payload.access_token, expiresAt: Date.now() + expiresIn * 1_000 }
    return cached.token
  }
}

export { EntraOnBehalfOfExchange }
