import type { RequestIdentity } from './auth.js'
import type { OrganizationRole } from './tenancy.js'

export function requiredOrganizationRoles(method: string | undefined, pathname: string): OrganizationRole[] | undefined {
  if (!method || method === 'GET' || method === 'OPTIONS') return undefined
  if (method === 'POST' && [
    '/v1/compile',
  ].includes(pathname)) return []
  if (method === 'POST' && (/^\/v1\/clarifications\/[^/]+$/.test(pathname) || /^\/v1\/plans\/[^/]+\/verify$/.test(pathname))) return []
  if (method === 'POST' && /^\/v1\/reviews\/[^/]+\/decisions$/.test(pathname)) return ['OWNER', 'ADMIN', 'REVIEWER']
  if (method === 'POST' && /^\/v1\/runtime-approvals\/[^/]+\/decisions$/.test(pathname)) return ['OWNER', 'ADMIN', 'REVIEWER', 'OPERATOR']
  if (method === 'POST' && (/^\/v1\/runtime-approvals\/[^/]+\/resume$/.test(pathname) || /^\/v1\/plans\/[^/]+\/execute$/.test(pathname))) return ['OWNER', 'ADMIN', 'OPERATOR']
  if (method === 'POST' && /^\/v1\/contracts\/[^/]+\/rollbacks$/.test(pathname)) return ['OWNER', 'ADMIN']
  if (method === 'POST' && /^\/v1\/contracts\/[^/]+\/runtime-status$/.test(pathname)) return ['OWNER', 'ADMIN', 'OPERATOR']
  if ((method === 'POST' || method === 'PUT') && (
    pathname === '/v1/contracts'
    || pathname === '/v1/imports/preview'
    || pathname === '/v1/bindings/preview'
    || pathname === '/v1/assurance/runs'
    || pathname === '/v1/reviews'
    || pathname.startsWith('/v1/connectors/')
    || /^\/v1\/workspaces\/[^/]+\/ontology$/.test(pathname)
    || /^\/v1\/contracts\/[^/]+$/.test(pathname)
    || /^\/v1\/contracts\/[^/]+\/(releases|restores)$/.test(pathname)
  )) return ['OWNER', 'ADMIN', 'AUTHOR']
  return ['OWNER', 'ADMIN']
}

export function hasOrganizationRole(identity: RequestIdentity, allowedRoles: OrganizationRole[]): boolean {
  if (allowedRoles.length === 0) return true
  // The blanket bypass is a development convenience only. Keying it off a role or scope
  // string would hand full authority to any identity provider that happens to emit a group
  // named DEVELOPER, so it is keyed off the authenticator that produced the identity.
  if (identity.authenticationMode === 'DEVELOPMENT') return true
  return allowedRoles.some((role) => identity.roles.includes(role))
}

const developmentWildcardPermission = 'lattice:*'

/**
 * Resolves what the caller is actually entitled to do, from the verified token alone.
 *
 * Execution permissions are never accepted from the request body: a client that declares its
 * own entitlements makes every permission gate in every contract a tautology. Production
 * identities are entitled to exactly the permission scopes their identity provider issued,
 * and wildcards are stripped so an issuer cannot mint blanket authority either.
 */
export function resolveGrantedPermissions(identity: RequestIdentity): string[] {
  if (identity.authenticationMode === 'DEVELOPMENT') return [developmentWildcardPermission]
  return [...new Set(identity.scopes.filter(isPermissionScope))]
}

export function missingPermissions(granted: string[], required: string[]): string[] {
  if (granted.includes(developmentWildcardPermission)) return []
  return required.filter((permission) => !granted.includes(permission))
}

function isPermissionScope(scope: string): boolean {
  const normalized = scope.trim()
  return normalized.length > 0 && normalized.length <= 200 && !normalized.includes('*')
}
