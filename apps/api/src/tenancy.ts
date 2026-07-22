import type { RequestIdentity } from './auth.js'

export type OrganizationRole = 'OWNER' | 'ADMIN' | 'AUTHOR' | 'REVIEWER' | 'OPERATOR' | 'VIEWER'

export interface TenantMembershipResolver {
  resolve(authorization: string | undefined, organizationId: string, principalId: string): Promise<OrganizationRole | undefined>
}

export function tenantMembershipResolverFromEnvironment(): TenantMembershipResolver | undefined {
  const supabaseUrl = process.env.LATTICE_SUPABASE_URL?.trim()
  const publishableKey = process.env.LATTICE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!supabaseUrl && !publishableKey) return undefined
  if (!supabaseUrl || !publishableKey) throw new Error('SUPABASE_TENANCY_CONFIGURATION_INCOMPLETE')
  return createSupabaseTenantMembershipResolver(supabaseUrl, publishableKey)
}

export function createSupabaseTenantMembershipResolver(supabaseUrl: string, publishableKey: string, fetcher: typeof fetch = fetch): TenantMembershipResolver {
  const projectUrl = secureProjectUrl(supabaseUrl)
  if (!publishableKey.trim()) throw new Error('SUPABASE_PUBLISHABLE_KEY_REQUIRED')
  return {
    async resolve(authorization, organizationId, principalId) {
      if (!authorization || !validUuid(organizationId) || !validUuid(principalId)) return undefined
      const query = new URL('/rest/v1/organization_memberships', projectUrl)
      query.searchParams.set('organization_id', `eq.${organizationId}`)
      query.searchParams.set('user_id', `eq.${principalId}`)
      query.searchParams.set('select', 'role')
      query.searchParams.set('limit', '1')
      const response = await fetcher(query, {
        headers: {
          apikey: publishableKey,
          Authorization: authorization,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5_000),
      })
      if (!response.ok) return undefined
      const rows = await response.json() as Array<{ role?: unknown }>
      const role = rows[0]?.role
      return isOrganizationRole(role) ? role : undefined
    },
  }
}

export function applyTenantMembership(identity: RequestIdentity, organizationId: string, role: OrganizationRole): RequestIdentity {
  return {
    ...identity,
    tenantId: organizationId,
    roles: [...new Set([...identity.roles, role])],
  }
}

function secureProjectUrl(value: string): URL {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('SUPABASE_URL_INVALID') }
  const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !localHttp) || (localHttp && process.env.NODE_ENV === 'production') || url.username || url.password || url.hash) throw new Error('SUPABASE_URL_INVALID')
  return url
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isOrganizationRole(value: unknown): value is OrganizationRole {
  return typeof value === 'string' && ['OWNER', 'ADMIN', 'AUTHOR', 'REVIEWER', 'OPERATOR', 'VIEWER'].includes(value)
}
