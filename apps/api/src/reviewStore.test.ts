import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ReviewStore } from './reviewStore.js'

test('persists an immutable review request and rationale-backed decision', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-reviews-'))
  const store = await ReviewStore.open(join(directory, 'reviews.json'))
  const review = await store.create({ contractId: 'grid', contractVersion: '0.1.0', targetKind: 'SOURCE_BINDING', targetId: 'grid-api', targetLabel: 'Grid API', impact: 'HIGH', evidenceRefs: ['ev-grid'] }, 'principal_author', new Date('2026-07-19T12:00:00.000Z'))
  const decided = await store.decide(review.id, 'APPROVED', 'Mappings and freshness controls are acceptable.', 'principal_reviewer', new Date('2026-07-19T12:05:00.000Z'))

  assert.equal(decided.status, 'DECIDED')
  assert.equal(decided.decision?.decision, 'APPROVED')
  assert.match(decided.artifactDigest, /^sha256:/)
  assert.match(decided.decision?.artifactDigest ?? '', /^sha256:/)
  await assert.rejects(() => store.decide(review.id, 'REJECTED', 'Changed mind', 'principal_reviewer'), /REVIEW_ALREADY_DECIDED/)
})

test('returns an existing open review for the same claim', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-review-idempotent-'))
  const store = await ReviewStore.open(join(directory, 'reviews.json'))
  const input = { contractId: 'grid', contractVersion: '0.1.0', targetKind: 'ENTITY_TYPE' as const, targetId: 'outage', targetLabel: 'Outage', impact: 'HIGH' as const, evidenceRefs: [] }
  const first = await store.create(input, 'principal_author')
  const second = await store.create(input, 'principal_author')
  assert.equal(first.id, second.id)
  assert.equal(store.list('grid').length, 1)
})
