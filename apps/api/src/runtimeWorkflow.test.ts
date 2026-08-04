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
    schemaVersion: '1.1', planId: 'plan-runtime-test', resolutionId: 'resolution-test', decision: 'RESOLVED',
    riskTier: 'PLANNING_DECISION', principalId: 'requester', tenantId: 'tenant_a', grounding: 'SIMULATED',
    operation: 'grid.get_outage_context', arguments: {}, metrics: [],
    intent: { resolverVersion: 'test-resolver', method: 'LEXICAL', indexDigest: 'sha256:test-index', operationId: 'grid.get_outage_context', matchedQuestionIds: [], lexicalScore: 1, aggregateScore: 1, acceptance: 'AUTOMATIC', candidateMargin: 1, thresholds: { minimumSupportedScore: 0.5, automaticAcceptanceScore: 0.75, minimumCandidateMargin: 0.05 } },
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
    tenantId: 'tenant_a',
    contractId: 'contract-grid-outage-response', contractVersion: '0.2.0', contractDigest: signed.contractDigest,
    operationId: signed.operation, policyId: 'policy-grid', riskTier: signed.riskTier, requestedBy: 'requester', pendingPlan: signed,
  }, new Date('2026-07-19T20:00:00.000Z'))

  await assert.rejects(() => store.decide(approval.id, 'APPROVED', 'Current evidence is sufficient.', 'requester', 'tenant_a'), /SEPARATION_REQUIRED/)
  const decided = await store.decide(approval.id, 'APPROVED', 'Current evidence is sufficient.', 'reviewer', 'tenant_a', new Date('2026-07-19T21:00:00.000Z'))
  assert.equal(decided.status, 'APPROVED')
  const resumed = await store.markResumed(approval.id, signed.planId, 'tenant_a')
  assert.equal(resumed.status, 'RESUMED')
  assert.equal((await (await RuntimeApprovalStore.open(join(directory, 'approvals.json'))).get(approval.id, 'tenant_a'))?.status, 'RESUMED')
})

test('a runtime approval cannot be decided or resumed from another tenant', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-runtime-approval-tenancy-'))
  const store = await RuntimeApprovalStore.open(join(directory, 'approvals.json'))
  const signed = plan()
  const approval = await store.create({
    tenantId: 'tenant_a',
    contractId: 'contract-grid-outage-response', contractVersion: '0.2.0', contractDigest: signed.contractDigest,
    operationId: signed.operation, policyId: 'policy-grid', riskTier: signed.riskTier, requestedBy: 'requester', pendingPlan: signed,
  }, new Date('2026-07-19T20:00:00.000Z'))

  assert.equal((await store.list('contract-grid-outage-response', 'tenant_b')).length, 0)
  assert.equal(await store.get(approval.id, 'tenant_b'), undefined)
  await assert.rejects(() => store.decide(approval.id, 'APPROVED', 'Approving another tenant request.', 'reviewer', 'tenant_b'), /RUNTIME_APPROVAL_NOT_FOUND/)
  await assert.rejects(() => store.markResumed(approval.id, signed.planId, 'tenant_b'), /RUNTIME_APPROVAL_NOT_FOUND/)
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
  assert.equal(results[0]?.rowCount, 1)
  assert.equal(results[0]?.truncated, false)
  assert.equal(results[0]?.rows[0]?.values[0]?.value, 'OUTAGE-NORTH-042')

  const directory = await mkdtemp(join(tmpdir(), 'lattice-execution-'))
  const store = await ExecutionStore.open(join(directory, 'receipts.json'))
  await store.append({ tenantId: 'tenant_a', contractId: contract.id, contractVersion: '0.2.0', plan: signed, principalId: 'agent', status: 'SUCCESS', startedAt: '2026-07-19T20:00:00.000Z', completedAt: '2026-07-19T20:00:01.000Z', grantedPermissions: ['grid.outage.read'], bindingResults: results })
  await assert.rejects(() => store.append({ tenantId: 'tenant_a', contractId: contract.id, contractVersion: '0.2.0', plan: signed, principalId: 'agent', status: 'SUCCESS', startedAt: '2026-07-19T20:00:00.000Z', completedAt: '2026-07-19T20:00:01.000Z', grantedPermissions: ['grid.outage.read'], bindingResults: results }), /NONCE_ALREADY_CONSUMED/)
  assert.equal((await store.list(contract.id, 'tenant_b')).length, 0)
})

test('a denied attempt is recorded for audit without spending the plan nonce', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-execution-denied-'))
  const store = await ExecutionStore.open(join(directory, 'receipts.json'))
  const signed = plan()
  const timestamps = { startedAt: '2026-07-19T20:00:00.000Z', completedAt: '2026-07-19T20:00:01.000Z' }

  await store.append({ tenantId: 'tenant_a', contractId: 'contract-grid-outage-response', contractVersion: '0.2.0', plan: signed, principalId: 'intruder', status: 'DENIED', ...timestamps, grantedPermissions: [], bindingResults: [] })
  assert.equal(await store.findConsumedByPlanId(signed.planId), undefined)

  const receipt = await store.append({ tenantId: 'tenant_a', contractId: 'contract-grid-outage-response', contractVersion: '0.2.0', plan: signed, principalId: 'agent', status: 'SUCCESS', ...timestamps, grantedPermissions: ['grid.outage.read'], bindingResults: [] })
  assert.equal((await store.findConsumedByPlanId(signed.planId))?.id, receipt.id)
  assert.equal((await store.list('contract-grid-outage-response', 'tenant_a')).length, 2)
})
