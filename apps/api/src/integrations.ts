import type { IntegrationsSummary } from '@lattice/contracts'

/**
 * What this deployment is wired to.
 *
 * Every integration here is configured by environment variable and nothing else, which means the
 * only way to know whether a catalog is federating classifications, whether queries run as the
 * asking user, or whether plans are signed by a key that survives a restart, has been to read the
 * deployment's configuration. An operator cannot do that from the Studio, and "is this connected
 * to the right Collibra?" is the first question they ask.
 *
 * The summary reports what is configured, never the configuration. Endpoints appear as a hostname
 * so an operator can tell staging from production; tokens, secrets, and private keys are not
 * read at all, so there is nothing to redact and no way for a future field to leak one by
 * accident. The signing key id is the exception and is safe: it is a public thumbprint already
 * served at `/v1/keys` for offline verification.
 */
export interface IntegrationsInput {
  environment: NodeJS.ProcessEnv
  /** Whether the governance ledgers resolved to Postgres for this request. */
  supabaseConfigured: boolean
  signing: { algorithm: string; activeKeyId: string; ephemeral: boolean }
  telemetryEnabled: boolean
}

export function integrationsSummary(input: IntegrationsInput): IntegrationsSummary {
  const environment = input.environment

  const catalogProvider = environment.LATTICE_CATALOG_PROVIDER?.trim().toLocaleLowerCase()
  const delegationProvider = environment.LATTICE_DELEGATED_IDENTITY_PROVIDER?.trim().toLocaleUpperCase()
  const signingProvider = environment.LATTICE_SIGNING_PROVIDER?.trim().toLocaleUpperCase() || 'LOCAL'

  return {
    persistence: {
      backend: input.supabaseConfigured ? 'SUPABASE' : 'FILESYSTEM',
      // A filesystem ledger on a platform that discards the disk between invocations keeps no
      // history at all, which is worth stating plainly rather than leaving to be discovered.
      durable: input.supabaseConfigured || !environment.VERCEL,
    },
    catalog: catalogProvider === 'purview' || catalogProvider === 'unity-catalog' || catalogProvider === 'collibra'
      ? { configured: true, provider: catalogProvider, ...hostOf(environment.LATTICE_CATALOG_ENDPOINT) }
      : { configured: false },
    delegatedIdentity: delegationProvider === 'ENTRA' || delegationProvider === 'OKTA'
      ? { configured: true, provider: delegationProvider, ...hostOf(environment.LATTICE_DELEGATED_IDENTITY_TOKEN_ENDPOINT) }
      : { configured: false },
    signing: {
      provider: signingProvider === 'AZURE_KEY_VAULT' || signingProvider === 'AWS_KMS' ? signingProvider : 'LOCAL',
      algorithm: input.signing.algorithm,
      activeKeyId: input.signing.activeKeyId,
      ephemeral: input.signing.ephemeral,
    },
    telemetry: { enabled: input.telemetryEnabled },
  }
}

/**
 * The hostname of a configured endpoint, and only the hostname.
 *
 * Enough to tell one tenant or environment from another. A full URL can carry a path, a query, or
 * embedded credentials, none of which an operator needs to answer "which one is this?".
 */
function hostOf(endpoint: string | undefined): { host?: string } {
  const value = endpoint?.trim()
  if (!value) return {}
  try {
    return { host: new URL(value).hostname }
  } catch {
    return {}
  }
}
