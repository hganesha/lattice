import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ReviewStore } from './reviewStore.js'

test('persists an immutable review request and rationale-backed decision', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-reviews-'))
  const store = await ReviewStore.open(join(directory, 'reviews.json'))
  const review = await store.create({ contractId: 'grid', contractVersion: '0.1.0', targetKind: 'SOURCE_BINDING', targetId: 'grid-api', targetLabel: 'Grid API', impact: 'HIGH', evidenceRefs: ['ev-grid'] }, 'principal_author', 'tenant_a', new Date('2026-07-19T12:00:00.000Z'))
  const decided = await store.decide(review.id, 'APPROVED', 'Mappings and freshness controls are acceptable.', 'principal_reviewer', 'tenant_a', new Date('2026-07-19T12:05:00.000Z'))

  assert.equal(decided.status, 'DECIDED')
  assert.equal(decided.decision?.decision, 'APPROVED')
  assert.match(decided.artifactDigest, /^sha256:/)
  assert.match(decided.decision?.artifactDigest ?? '', /^sha256:/)
  await assert.rejects(() => store.decide(review.id, 'REJECTED', 'Changed mind', 'principal_reviewer', 'tenant_a'), /REVIEW_ALREADY_DECIDED/)
})

test('reviews are not readable or decidable from another tenant', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-review-tenancy-'))
  const store = await ReviewStore.open(join(directory, 'reviews.json'))
  const review = await store.create({ contractId: 'grid', contractVersion: '0.1.0', targetKind: 'POLICY', targetId: 'policy-1', targetLabel: 'Policy', impact: 'HIGH', evidenceRefs: [] }, 'principal_author', 'tenant_a')

  assert.equal(store.list('grid', 'tenant_a').length, 1)
  assert.equal(store.list('grid', 'tenant_b').length, 0)
  assert.equal(store.get(review.id, 'tenant_b'), undefined)
  await assert.rejects(() => store.decide(review.id, 'APPROVED', 'Approving another tenant claim.', 'principal_intruder', 'tenant_b'), /REVIEW_NOT_FOUND/)
})

test('returns an existing open review for the same claim', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-review-idempotent-'))
  const store = await ReviewStore.open(join(directory, 'reviews.json'))
  const input = { contractId: 'grid', contractVersion: '0.1.0', targetKind: 'ENTITY_TYPE' as const, targetId: 'outage', targetLabel: 'Outage', impact: 'HIGH' as const, evidenceRefs: [] }
  const first = await store.create(input, 'principal_author', 'tenant_a')
  const second = await store.create(input, 'principal_author', 'tenant_a')
  assert.equal(first.id, second.id)
  assert.equal(store.list('grid', 'tenant_a').length, 1)
})
