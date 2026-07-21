import assert from 'node:assert/strict'
import test from 'node:test'
import { counterpartyRiskContract, loadGridOutageExample } from '@lattice/contracts'
import { ContextCompiler } from './compiler.js'

function compiler() {
  let id = 0
  return new ContextCompiler(counterpartyRiskContract, {
    now: () => new Date('2026-07-19T00:00:00.000Z'),
    id: () => String(++id).padStart(4, '0'),
  })
}

test('compiles a specific counterparty question into a pinned plan', () => {
  const result = compiler().compile({
    question: 'What is our exposure and limit utilization for Arcadia Capital?',
  })

  assert.equal(result.decision, 'RESOLVED')
  assert.deepEqual(result.plan?.arguments.counterparty, { entityId: 'CP-0103' })
  assert.deepEqual(result.plan?.metrics.map((metric) => metric.id), ['net_current_exposure', 'limit_utilization'])
  assert.equal(result.plan?.versions.contract, 'counterparty-risk@1.0.0')
})

test('emits a clarification contract for an ambiguous name', () => {
  const result = compiler().compile({ question: 'Show the counterparty exposure for Arcadia.' })

  assert.equal(result.decision, 'CLARIFICATION_REQUIRED')
  assert.deepEqual(
    result.clarification?.candidates.map((candidate) => candidate.entityId),
    ['CP-0103', 'CP-0188'],
  )
})

test('abstains when no governed entity can be resolved', () => {
  const result = compiler().compile({ question: 'Show counterparty exposure for Northstar.' })

  assert.equal(result.decision, 'INSUFFICIENT_EVIDENCE')
  assert.deepEqual(result.reasonCodes, ['REQUIRED_ENTITY_UNRESOLVED'])
})

test('rejects a mismatched contract version', () => {
  const result = compiler().compile({
    question: 'Show Arcadia Capital exposure.',
    contractVersion: '0.9.0',
  })

  assert.equal(result.decision, 'DENIED')
  assert.deepEqual(result.reasonCodes, ['CONTRACT_VERSION_MISMATCH'])
})

test('enforces policy freshness against observed evidence', () => {
  const contract = structuredClone(counterpartyRiskContract)
  contract.policies[0]!.maximumEvidenceAgeMinutes = 30
  const result = new ContextCompiler(contract, { now: () => new Date('2026-07-19T00:00:00.000Z'), id: () => 'freshness' }).compile({ question: 'Show Arcadia Capital exposure.' })

  assert.equal(result.decision, 'STALE_CONTEXT')
  assert.deepEqual(result.reasonCodes, ['EVIDENCE_EXCEEDS_POLICY_FRESHNESS'])
})

test('escalates when the governing policy requires runtime approval', () => {
  const contract = structuredClone(counterpartyRiskContract)
  contract.policies[0]!.approvalRequired = true
  const result = new ContextCompiler(contract, { now: () => new Date('2026-07-19T00:00:00.000Z'), id: () => 'approval' }).compile({ question: 'Show Arcadia Capital exposure.' })

  assert.equal(result.decision, 'APPROVAL_REQUIRED')
  assert.deepEqual(result.reasonCodes, ['RUNTIME_APPROVAL_REQUIRED'])
  assert.equal(result.plan, undefined)
  assert.equal(result.pendingPlan?.operation, 'risk.counterparty_exposure_assessment')
})

test('resolves required context through governed relationships', () => {
  const contract = loadGridOutageExample({
    ...structuredClone(counterpartyRiskContract),
    id: 'contract-grid-outage-response',
    name: 'Grid Outage Response',
    operations: [{
      id: 'grid.get_outage_context', label: 'Get governed outage context', description: 'Resolve outage context.', keywords: ['outage'], requiredEntityTypes: ['outage_event', 'grid_asset'], metricIds: [], relationshipPath: ['outage_event_affected_asset'], sourceBindingIds: [], riskTier: 'INFORMATIONAL', requiredPermissions: ['grid.outage.read'], expectedResultSchema: 'grid_outage@1',
    }],
    entityTypes: [
      { id: 'outage_event', label: 'Outage Event', description: 'A grid outage.', group: 'Operations', icon: 'OE', properties: [], evidenceStatus: 'DIRECTLY_EVIDENCED', approvalStatus: 'APPROVED', impact: 'CRITICAL' },
      { id: 'grid_asset', label: 'Grid Asset', description: 'A grid asset.', group: 'Network', icon: 'GA', properties: [], evidenceStatus: 'DIRECTLY_EVIDENCED', approvalStatus: 'APPROVED', impact: 'CRITICAL' },
    ],
    relationshipTypes: [{ id: 'outage_event_affected_asset', label: 'AFFECTED_ASSET', sourceTypeId: 'outage_event', targetTypeId: 'grid_asset', cardinality: 'MANY_TO_ONE', description: 'An outage affects an asset.', impact: 'CRITICAL' }],
    bindings: [],
    policies: [{ id: 'policy-informational', label: 'Informational baseline', description: 'Runtime context policy.', riskTier: 'INFORMATIONAL', minimumEvidenceStrength: 'MODERATE', maximumEvidenceAgeMinutes: 1440, approvalRequired: false, version: '0.1.0', owner: 'Grid Operations', approvalStatus: 'APPROVED' }],
  }, new Date('2026-07-19T20:00:00.000Z'))
  const result = new ContextCompiler(contract, { now: () => new Date('2026-07-19T20:05:00.000Z'), id: () => 'grid' }).compile({ question: 'Which outage should be prioritized?' })

  assert.equal(result.decision, 'RESOLVED')
  assert.deepEqual(result.plan?.arguments.grid_asset, { entityId: 'ASSET-SUB-NORTH-01' })
})
