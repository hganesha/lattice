import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { counterpartyRiskContract, enableGridRuntimeApprovalExample, type SignedExecutionPlan } from '@lattice/contracts'
import { executeBindings } from './adapters.js'
import { ExecutionStore } from './executionStore.js'
import { RuntimeApprovalStore } from './runtimeApprovalStore.js'

function plan(): SignedExecutionPlan {
  return {
    schemaVersion: '1.0', planId: 'plan-runtime-test', resolutionId: 'resolution-test', decision: 'RESOLVED',
    riskTier: 'PLANNING_DECISION', operation: 'grid.get_outage_context', arguments: {}, metrics: [],
    sourceBindings: ['binding_grid_operations_api_grid_get_outage_context'], requiredPermissions: ['grid.outage.read'],
    expectedResultSchema: 'grid_get_outage_context_response', evidenceRefs: ['evidence-1'], versions: counterpartyRiskContract.versions,
    contractDigest: 'sha256:test', expiresAt: '2026-07-20T00:00:00.000Z', nonce: 'nonce-test',
    keyId: 'test-key', signatureAlgorithm: 'Ed25519', signature: 'test-signature',
  }
}

test('runtime approval enforces separation of duties and resumes once', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-runtime-approval-'))
  const store = await RuntimeApprovalStore.open(join(directory, 'approvals.json'))
  const signed = plan()
  const approval = await store.create({
    contractId: 'contract-grid-outage-response', contractVersion: '0.2.0', contractDigest: signed.contractDigest,
    operationId: signed.operation, policyId: 'policy-grid', riskTier: signed.riskTier, requestedBy: 'requester', pendingPlan: signed,
  }, new Date('2026-07-19T20:00:00.000Z'))

  await assert.rejects(() => store.decide(approval.id, 'APPROVED', 'Current evidence is sufficient.', 'requester'), /SEPARATION_REQUIRED/)
  const decided = await store.decide(approval.id, 'APPROVED', 'Current evidence is sufficient.', 'reviewer', new Date('2026-07-19T21:00:00.000Z'))
  assert.equal(decided.status, 'APPROVED')
  const resumed = await store.markResumed(approval.id, signed.planId)
  assert.equal(resumed.status, 'RESUMED')
  assert.equal((await RuntimeApprovalStore.open(join(directory, 'approvals.json'))).get(approval.id)?.status, 'RESUMED')
})

test('sample adapter maps governed values and execution receipts prevent replay', async () => {
  const contract = enableGridRuntimeApprovalExample({
    ...structuredClone(counterpartyRiskContract),
    id: 'contract-grid-outage-response',
    entityTypes: [
      { id: 'outage_event', label: 'Outage Event', description: 'Outage.', group: 'Operations', icon: 'OE', properties: [{ id: 'outage_event.event_id', name: 'Event ID', dataType: 'string', description: 'ID.' }], evidenceStatus: 'DIRECTLY_EVIDENCED', approvalStatus: 'APPROVED', impact: 'HIGH' },
      { id: 'grid_asset', label: 'Grid Asset', description: 'Asset.', group: 'Network', icon: 'GA', properties: [{ id: 'grid_asset.asset_id', name: 'Asset ID', dataType: 'string', description: 'ID.' }], evidenceStatus: 'DIRECTLY_EVIDENCED', approvalStatus: 'APPROVED', impact: 'HIGH' },
    ],
    operations: [{ id: 'grid.get_outage_context', label: 'Grid context', description: 'Context.', keywords: ['outage'], requiredEntityTypes: [], metricIds: [], relationshipPath: [], sourceBindingIds: ['binding_grid_operations_api_grid_get_outage_context'], riskTier: 'INFORMATIONAL', requiredPermissions: ['grid.outage.read'], expectedResultSchema: 'grid' }],
    bindings: [{ id: 'binding_grid_operations_api_grid_get_outage_context', sourceSystem: 'Grid API', operationId: 'grid.get_outage_context', environment: 'test', freshnessMinutes: 5, requiredPermissions: ['grid.outage.read'], expectedResultSchema: 'grid', version: '1', approvalStatus: 'APPROVED', mappings: [{ sourcePath: '$.eventId', targetTypeId: 'outage_event', targetPropertyId: 'outage_event.event_id', sourceDataType: 'string', confidence: 'EXACT' }] }],
  }, new Date('2026-07-19T20:00:00.000Z'))
  const signed = plan()
  const results = await executeBindings(signed, contract)
  assert.equal(results[0]?.status, 'SUCCESS')
  assert.equal(results[0]?.mappedValues[0]?.value, 'OUTAGE-NORTH-042')

  const directory = await mkdtemp(join(tmpdir(), 'lattice-execution-'))
  const store = await ExecutionStore.open(join(directory, 'receipts.json'))
  await store.append({ contractId: contract.id, contractVersion: '0.2.0', plan: signed, principalId: 'agent', status: 'SUCCESS', startedAt: '2026-07-19T20:00:00.000Z', completedAt: '2026-07-19T20:00:01.000Z', grantedPermissions: ['grid.outage.read'], bindingResults: results })
  await assert.rejects(() => store.append({ contractId: contract.id, contractVersion: '0.2.0', plan: signed, principalId: 'agent', status: 'SUCCESS', startedAt: '2026-07-19T20:00:00.000Z', completedAt: '2026-07-19T20:00:01.000Z', grantedPermissions: ['grid.outage.read'], bindingResults: results }), /NONCE_ALREADY_CONSUMED/)
})
