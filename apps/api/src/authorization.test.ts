import assert from 'node:assert/strict'
import test from 'node:test'
import { hasOrganizationRole, missingPermissions, requiredOrganizationRoles, resolveGrantedPermissions } from './authorization.js'
import type { RequestIdentity } from './auth.js'

function identity(overrides: Partial<RequestIdentity> = {}): RequestIdentity {
  return { principalId: 'principal', roles: [], scopes: [], authenticationMode: 'OIDC', ...overrides }
}

test('assigns least-privilege roles to governed routes', () => {
  assert.deepEqual(requiredOrganizationRoles('GET', '/v1/contracts'), undefined)
  assert.deepEqual(requiredOrganizationRoles('POST', '/v1/compile'), [])
  assert.deepEqual(requiredOrganizationRoles('POST', '/v1/reviews/review-1/decisions'), ['OWNER', 'ADMIN', 'REVIEWER'])
  assert.deepEqual(requiredOrganizationRoles('POST', '/v1/contracts/contract-1/rollbacks'), ['OWNER', 'ADMIN'])
  assert.deepEqual(requiredOrganizationRoles('PUT', '/v1/contracts/contract-1'), ['OWNER', 'ADMIN', 'AUTHOR'])
  assert.deepEqual(requiredOrganizationRoles('DELETE', '/v1/contracts/contract-1'), ['OWNER', 'ADMIN'])
})

test('enforces organization roles while preserving the explicit development bypass', () => {
  assert.equal(hasOrganizationRole(identity({ roles: ['REVIEWER'] }), ['OWNER', 'ADMIN', 'REVIEWER']), true)
  assert.equal(hasOrganizationRole(identity({ roles: ['VIEWER'] }), ['OWNER', 'ADMIN', 'AUTHOR']), false)
  assert.equal(hasOrganizationRole(identity({ authenticationMode: 'DEVELOPMENT', roles: ['DEVELOPER'] }), ['OWNER']), true)
})

test('an identity provider cannot mint the development bypass with a role or scope name', () => {
  assert.equal(hasOrganizationRole(identity({ roles: ['DEVELOPER'] }), ['OWNER']), false)
  assert.equal(hasOrganizationRole(identity({ roles: ['DEVELOPER'], scopes: ['lattice:*'] }), ['OWNER', 'ADMIN']), false)
})

test('granted permissions come from verified scopes, never from a wildcard claim', () => {
  assert.deepEqual(resolveGrantedPermissions(identity({ scopes: ['airline.dispatch.read', 'crew.duty.read'] })), ['airline.dispatch.read', 'crew.duty.read'])
  assert.deepEqual(resolveGrantedPermissions(identity({ scopes: ['lattice:*', '*', 'airline.dispatch.read'] })), ['airline.dispatch.read'])
  assert.deepEqual(resolveGrantedPermissions(identity({ authenticationMode: 'DEVELOPMENT', scopes: ['lattice:*'] })), ['lattice:*'])
})

test('missing permissions are reported unless the development wildcard is present', () => {
  assert.deepEqual(missingPermissions(['airline.dispatch.read'], ['airline.dispatch.read']), [])
  assert.deepEqual(missingPermissions(['ops.dispatch.read'], ['airline.dispatch.read']), ['airline.dispatch.read'])
  assert.deepEqual(missingPermissions([], ['airline.dispatch.read']), ['airline.dispatch.read'])
  assert.deepEqual(missingPermissions(['lattice:*'], ['airline.dispatch.read']), [])
})
