import assert from 'node:assert/strict'
import test from 'node:test'
import { hasOrganizationRole, requiredOrganizationRoles } from './authorization.js'

test('assigns least-privilege roles to governed routes', () => {
  assert.deepEqual(requiredOrganizationRoles('GET', '/v1/contracts'), undefined)
  assert.deepEqual(requiredOrganizationRoles('POST', '/v1/compile'), [])
  assert.deepEqual(requiredOrganizationRoles('POST', '/v1/reviews/review-1/decisions'), ['OWNER', 'ADMIN', 'REVIEWER'])
  assert.deepEqual(requiredOrganizationRoles('POST', '/v1/contracts/contract-1/rollbacks'), ['OWNER', 'ADMIN'])
  assert.deepEqual(requiredOrganizationRoles('PUT', '/v1/contracts/contract-1'), ['OWNER', 'ADMIN', 'AUTHOR'])
  assert.deepEqual(requiredOrganizationRoles('DELETE', '/v1/contracts/contract-1'), ['OWNER', 'ADMIN'])
})

test('enforces organization roles while preserving the explicit development scope', () => {
  assert.equal(hasOrganizationRole({ principalId: 'reviewer', roles: ['REVIEWER'], scopes: [] }, ['OWNER', 'ADMIN', 'REVIEWER']), true)
  assert.equal(hasOrganizationRole({ principalId: 'viewer', roles: ['VIEWER'], scopes: [] }, ['OWNER', 'ADMIN', 'AUTHOR']), false)
  assert.equal(hasOrganizationRole({ principalId: 'developer', roles: ['DEVELOPER'], scopes: ['lattice:*'] }, ['OWNER']), true)
})
