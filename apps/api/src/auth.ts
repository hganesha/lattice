import { createHash } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

export interface RequestIdentity {
  tenantId?: string
  principalId: string
  roles: string[]
  scopes: string[]
}

export interface Authenticator {
  authenticate(authorization: string | undefined): Promise<RequestIdentity | undefined>
}

export interface OidcAuthenticatorConfig {
  issuer: string
  audience: string
  jwksUrl: string
  algorithms: string[]
  tenantClaim: string
  principalClaim: string
  rolesClaim: string
  defaultTenantId?: string
  allowMissingTenant?: boolean
}

export function authenticatorFromEnvironment(): Authenticator {
  const supabaseUrl = process.env.LATTICE_SUPABASE_URL?.trim()
  const issuer = process.env.LATTICE_OIDC_ISSUER?.trim()
  const audience = process.env.LATTICE_OIDC_AUDIENCE?.trim()
  const jwksUrl = process.env.LATTICE_OIDC_JWKS_URL?.trim()
  if (supabaseUrl) {
    if (issuer || jwksUrl) throw new Error('OIDC_SUPABASE_CONFIGURATION_CONFLICT')
    const projectUrl = secureUrl(supabaseUrl, 'SUPABASE_URL_INVALID')
    const authIssuer = new URL('/auth/v1', projectUrl).toString().replace(/\/$/, '')
    return createOidcAuthenticator({
      issuer: authIssuer,
      audience: audience || 'authenticated',
      jwksUrl: `${authIssuer}/.well-known/jwks.json`,
      algorithms: oidcAlgorithms(process.env.LATTICE_OIDC_ALGORITHMS),
      tenantClaim: claimName(process.env.LATTICE_OIDC_TENANT_CLAIM ?? 'organization_id'),
      principalClaim: claimName(process.env.LATTICE_OIDC_PRINCIPAL_CLAIM ?? 'sub'),
      rolesClaim: claimName(process.env.LATTICE_OIDC_ROLES_CLAIM ?? 'app_metadata.roles'),
      allowMissingTenant: true,
    })
  }
  const oidcValues = [issuer, audience, jwksUrl]
  if (oidcValues.some(Boolean)) {
    if (!issuer || !audience || !jwksUrl) throw new Error('OIDC_CONFIGURATION_INCOMPLETE')
    return createOidcAuthenticator({
      issuer: validatedIssuer(issuer),
      audience,
      jwksUrl: secureUrl(jwksUrl, 'OIDC_JWKS_URL_INVALID').toString(),
      algorithms: oidcAlgorithms(process.env.LATTICE_OIDC_ALGORITHMS),
      tenantClaim: claimName(process.env.LATTICE_OIDC_TENANT_CLAIM ?? 'tid'),
      principalClaim: claimName(process.env.LATTICE_OIDC_PRINCIPAL_CLAIM ?? 'sub'),
      rolesClaim: claimName(process.env.LATTICE_OIDC_ROLES_CLAIM ?? 'roles'),
      ...(process.env.LATTICE_OIDC_DEFAULT_TENANT_ID?.trim() ? { defaultTenantId: process.env.LATTICE_OIDC_DEFAULT_TENANT_ID.trim() } : {}),
    })
  }
  if (process.env.LATTICE_DEV_AUTH === 'true') {
    if (process.env.NODE_ENV === 'production') throw new Error('DEV_AUTH_NOT_ALLOWED_IN_PRODUCTION')
    return developmentAuthenticator()
  }
  return { authenticate: async () => undefined }
}

export function createOidcAuthenticator(config: OidcAuthenticatorConfig, keyResolver?: JWTVerifyGetKey): Authenticator {
  const jwks = keyResolver ?? createRemoteJWKSet(new URL(config.jwksUrl), { timeoutDuration: 5_000, cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000 })
  return {
    async authenticate(authorization) {
      const token = bearerToken(authorization)
      if (!token) return undefined
      try {
        const { payload } = await jwtVerify(token, jwks, { issuer: config.issuer, audience: config.audience, algorithms: config.algorithms, clockTolerance: 5, maxTokenAge: '1h' })
        const principalId = stringClaim(nestedClaim(payload, config.principalClaim))
        const tenantId = stringClaim(nestedClaim(payload, config.tenantClaim)) ?? config.defaultTenantId
        if (!principalId || (!tenantId && !config.allowMissingTenant)) return undefined
        return {
          principalId,
          ...(tenantId ? { tenantId } : {}),
          roles: listClaim(nestedClaim(payload, config.rolesClaim)),
          scopes: typeof payload.scope === 'string' ? payload.scope.split(/\s+/).filter(Boolean) : [],
        }
      } catch {
        return undefined
      }
    },
  }
}

function developmentAuthenticator(): Authenticator {
  return {
    async authenticate(authorization) {
      const token = bearerToken(authorization)
      if (!token) return undefined
      return {
        tenantId: 'tenant_dev',
        principalId: `principal_${createHash('sha256').update(token).digest('hex').slice(0, 12)}`,
        roles: ['DEVELOPER'],
        scopes: ['lattice:*'],
      }
    },
  }
}

function bearerToken(authorization: string | undefined): string | undefined {
  if (!authorization || authorization.length > 16_391) return undefined
  const match = authorization.match(/^Bearer ([^\s]+)$/i)
  return match?.[1]
}

function secureUrl(value: string, errorCode: string): URL {
  let url: URL
  try { url = new URL(value) } catch { throw new Error(errorCode) }
  const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !localHttp) || (localHttp && process.env.NODE_ENV === 'production') || url.username || url.password || url.hash) throw new Error(errorCode)
  return url
}

function validatedIssuer(value: string): string {
  secureUrl(value, 'OIDC_ISSUER_INVALID')
  return value
}

function oidcAlgorithms(value: string | undefined): string[] {
  const algorithms = (value ?? 'RS256,ES256').split(',').map((algorithm) => algorithm.trim()).filter(Boolean)
  if (algorithms.length === 0 || algorithms.some((algorithm) => !/^(RS|PS|ES)(256|384|512)$/.test(algorithm))) throw new Error('OIDC_ALGORITHM_NOT_ALLOWED')
  return [...new Set(algorithms)]
}

function claimName(value: string): string {
  const name = value.trim()
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name)) throw new Error('OIDC_CLAIM_NAME_INVALID')
  return name
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function listClaim(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/[\s,]+/).filter(Boolean)
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) : []
}

function nestedClaim(payload: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (typeof value !== 'object' || value === null || !(segment in value)) return undefined
    return (value as Record<string, unknown>)[segment]
  }, payload)
}
