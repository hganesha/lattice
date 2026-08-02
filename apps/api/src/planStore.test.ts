import assert from 'node:assert/strict'
import test from 'node:test'
import { SubjectScopedStore, sameSubject } from './planStore.js'

test('a stored value is returned to the subject it was issued to', () => {
  const store = new SubjectScopedStore<string>(60_000)
  store.set('plan_1', { principalId: 'alice', tenantId: 'tenant_a' }, 'payload')
  assert.equal(store.get('plan_1', { principalId: 'alice', tenantId: 'tenant_a' }), 'payload')
})

test('another principal in the same tenant cannot read the entry', () => {
  const store = new SubjectScopedStore<string>(60_000)
  store.set('plan_1', { principalId: 'alice', tenantId: 'tenant_a' }, 'payload')
  assert.equal(store.get('plan_1', { principalId: 'dave', tenantId: 'tenant_a' }), undefined)
})

test('the same principal identifier in another tenant cannot read the entry', () => {
  const store = new SubjectScopedStore<string>(60_000)
  store.set('plan_1', { principalId: 'alice', tenantId: 'tenant_a' }, 'payload')
  assert.equal(store.get('plan_1', { principalId: 'alice', tenantId: 'tenant_b' }), undefined)
})

test('a tenantless identity does not match a tenant-scoped entry', () => {
  const store = new SubjectScopedStore<string>(60_000)
  store.set('plan_1', { principalId: 'alice', tenantId: 'tenant_a' }, 'payload')
  assert.equal(store.get('plan_1', { principalId: 'alice' }), undefined)
})

test('entries are swept once they pass retention', () => {
  let clock = 1_000
  const store = new SubjectScopedStore<string>(60_000, () => clock)
  store.set('plan_1', { principalId: 'alice' }, 'payload')
  assert.equal(store.size, 1)
  clock += 60_001
  assert.equal(store.get('plan_1', { principalId: 'alice' }), undefined)
  assert.equal(store.size, 0)
})

test('an explicit retention deadline overrides the default', () => {
  let clock = 1_000
  const store = new SubjectScopedStore<string>(60_000, () => clock)
  store.set('plan_1', { principalId: 'alice' }, 'payload', clock + 10)
  clock += 11
  assert.equal(store.get('plan_1', { principalId: 'alice' }), undefined)
})

test('sameSubject treats a missing tenant and an empty tenant alike', () => {
  assert.equal(sameSubject({ principalId: 'alice' }, { principalId: 'alice' }), true)
  assert.equal(sameSubject({ principalId: 'alice' }, { principalId: 'alice', tenantId: 'tenant_a' }), false)
})
