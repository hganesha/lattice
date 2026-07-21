import assert from 'node:assert/strict'
import test from 'node:test'
import { counterpartyRiskContract, type ContractRelease } from '@lattice/contracts'
import { buildReleaseDiffArtifact } from './releaseDiff.js'

test('builds a deterministic digest-backed release-to-release diff', () => {
  const baseline: ContractRelease = { version: '1.0.0', digest: 'sha256:baseline', publishedAt: '2026-07-20T10:00:00.000Z', notes: 'Baseline', contract: counterpartyRiskContract }
  const nextContract = structuredClone(counterpartyRiskContract)
  nextContract.description = 'Updated governed contract description.'
  nextContract.entityTypes[0]!.description = 'Changed semantic meaning.'
  nextContract.entityTypes.push({ id: 'jurisdiction', label: 'Jurisdiction', description: 'A governed jurisdiction.', group: 'Reference', icon: 'box', properties: [], evidenceStatus: 'DECLARED', approvalStatus: 'APPROVED', impact: 'MEDIUM' })
  const next: ContractRelease = { version: '2.0.0', digest: 'sha256:next', publishedAt: '2026-07-21T10:00:00.000Z', notes: 'Next', contract: nextContract }

  const first = buildReleaseDiffArtifact(counterpartyRiskContract.id, baseline, next)
  const second = buildReleaseDiffArtifact(counterpartyRiskContract.id, baseline, next)

  assert.deepEqual(first, second)
  assert.match(first.artifactDigest, /^sha256:[a-f0-9]{64}$/)
  assert.equal(first.suggestedBump, 'MAJOR')
  assert.ok(first.changes.some((change) => change.kind === 'CONTRACT_METADATA' && change.change === 'CHANGED'))
  assert.ok(first.changes.some((change) => change.id === 'jurisdiction' && change.change === 'ADDED'))
})
