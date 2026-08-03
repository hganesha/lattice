/**
 * Runs a governed query as the person who asked it, rather than as the service.
 *
 * This is the difference between "governed" being true and being a claim. A single service
 * credential means Unity Catalog row filters and column masks, Fabric's own security, and
 * Snowflake row access policies never see the asking user — the platform's access controls are
 * silently short-circuited, and Lattice's permission strings become the only thing standing in
 * their place.
 *
 * The caller's token is exchanged for one the data platform will accept. Entra and Okta spell
 * that differently — Entra's on-behalf-of flow versus RFC 8693 token exchange — so the shape is
 * an interface with an adapter each, and nothing downstream knows which is configured.
 */

export interface DelegatedToken {
  accessToken: string
  expiresAt?: string
}

export interface TokenExchange {
  readonly provider: 'ENTRA' | 'OKTA'
  /**
   * Exchanges the caller's own token for one scoped to a downstream resource.
   *
   * `scope` names the data platform: Azure Databricks and Fabric each have their own resource
   * identifier, so a token minted for one is useless against the other. That is the point —
   * a delegated token should be no more broadly usable than the query that needs it.
   */
  exchange(subjectToken: string, scope: string): Promise<DelegatedToken>
}

export interface TokenExchangeConfig {
  provider: 'ENTRA' | 'OKTA'
  tokenEndpoint: URL
  clientId: string
  clientSecret: string
}

const EXCHANGE_TIMEOUT_MS = 5_000

/**
 * Microsoft Entra ID on-behalf-of.
 *
 * Entra predates RFC 8693 and uses the JWT bearer grant with `requested_token_use=on_behalf_of`
 * rather than the standard token-exchange grant.
 */
export class EntraOnBehalfOfExchange implements TokenExchange {
  readonly provider = 'ENTRA' as const

  constructor(private readonly config: TokenExchangeConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  async exchange(subjectToken: string, scope: string): Promise<DelegatedToken> {
    return postTokenRequest(this.config, this.fetchImpl, {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      assertion: subjectToken,
      scope,
      requested_token_use: 'on_behalf_of',
    })
  }
}

/** Okta, using the standard RFC 8693 token-exchange grant. */
export class OktaTokenExchange implements TokenExchange {
  readonly provider = 'OKTA' as const

  constructor(private readonly config: TokenExchangeConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  async exchange(subjectToken: string, scope: string): Promise<DelegatedToken> {
    return postTokenRequest(this.config, this.fetchImpl, {
      grant_type: 'urn:ietf:params:oauth:token-exchange',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      subject_token: subjectToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      scope,
    })
  }
}

async function postTokenRequest(
  config: TokenExchangeConfig,
  fetchImpl: typeof fetch,
  form: Record<string, string>,
): Promise<DelegatedToken> {
  let response: Response
  try {
    response = await fetchImpl(config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(form).toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
    })
  } catch {
    throw new Error('DELEGATED_IDENTITY_EXCHANGE_UNREACHABLE')
  }

  if (!response.ok) {
    // The identity provider's body can name the subject and the scopes requested, so only the
    // status is surfaced. A failed exchange must not become a way to read tokens out of logs.
    throw new Error(`DELEGATED_IDENTITY_EXCHANGE_REJECTED:${response.status}`)
  }

  const payload = await response.json() as { access_token?: unknown; expires_in?: unknown }
  if (typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new Error('DELEGATED_IDENTITY_EXCHANGE_INVALID_RESPONSE')
  }

  const expiresIn = typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in) ? payload.expires_in : undefined
  return {
    accessToken: payload.access_token,
    ...(expiresIn !== undefined ? { expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString() } : {}),
  }
}

/**
 * Resource scopes the exchange requests, per provider.
 *
 * Azure Databricks has a fixed application identifier; Fabric's warehouse endpoint authenticates
 * against the Azure SQL resource. Both are overridable because a deployment may front them
 * differently.
 */
export const DEFAULT_DELEGATION_SCOPES: Record<string, string> = {
  DATABRICKS: '2ff814a6-3304-4ab8-85cb-cd0e6f879c1d/.default',
  MICROSOFT_FABRIC: 'https://database.windows.net/.default',
}

export function delegationScopeFor(provider: string, environment: NodeJS.ProcessEnv = process.env): string | undefined {
  const override = environment[`LATTICE_DELEGATION_SCOPE_${provider}`]?.trim()
  return override || DEFAULT_DELEGATION_SCOPES[provider]
}

/**
 * Builds the exchange from configuration.
 *
 * Returns undefined when nothing is configured, which leaves bindings running as the service
 * identity — the previous behaviour, now recorded on every receipt rather than assumed.
 */
export function tokenExchangeFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): TokenExchange | undefined {
  const provider = environment.LATTICE_DELEGATED_IDENTITY_PROVIDER?.trim().toUpperCase()
  if (!provider) return undefined
  if (provider !== 'ENTRA' && provider !== 'OKTA') {
    throw new Error('LATTICE_DELEGATED_IDENTITY_PROVIDER must be ENTRA or OKTA.')
  }

  const endpoint = environment.LATTICE_DELEGATED_IDENTITY_TOKEN_ENDPOINT?.trim()
  const clientId = environment.LATTICE_DELEGATED_IDENTITY_CLIENT_ID?.trim()
  const clientSecret = environment.LATTICE_DELEGATED_IDENTITY_CLIENT_SECRET?.trim()
  if (!endpoint || !clientId || !clientSecret) {
    throw new Error('Delegated identity requires LATTICE_DELEGATED_IDENTITY_TOKEN_ENDPOINT, _CLIENT_ID, and _CLIENT_SECRET.')
  }

  const config: TokenExchangeConfig = { provider, tokenEndpoint: secureEndpoint(endpoint), clientId, clientSecret }
  return provider === 'ENTRA' ? new EntraOnBehalfOfExchange(config, fetchImpl) : new OktaTokenExchange(config, fetchImpl)
}

function secureEndpoint(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('LATTICE_DELEGATED_IDENTITY_TOKEN_ENDPOINT is not a valid URL.')
  }
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(url.hostname)
  if (url.protocol !== 'https:' && !loopback) {
    throw new Error('LATTICE_DELEGATED_IDENTITY_TOKEN_ENDPOINT must use HTTPS.')
  }
  if (url.username || url.password) throw new Error('LATTICE_DELEGATED_IDENTITY_TOKEN_ENDPOINT must not embed credentials.')
  return url
}
