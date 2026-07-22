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
  if (identity.scopes.includes('lattice:*') || identity.roles.includes('DEVELOPER')) return true
  return allowedRoles.some((role) => identity.roles.includes(role))
}
