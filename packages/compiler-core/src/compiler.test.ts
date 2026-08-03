import assert from 'node:assert/strict'
import test from 'node:test'
import { counterpartyRiskContract, loadGridOutageExample, materializeSimulatedContext } from '@lattice/contracts'
import { airlineExampleContracts } from '@lattice/contracts/airline-contracts'
import { telecommunicationsExampleContracts } from '@lattice/contracts/telecommunications-contracts'
import type { ContextContract } from '@lattice/contracts'
import { ContextCompiler } from './compiler.js'

const subject = { principalId: 'principal_test', tenantId: 'tenant_test' }

/**
 * Supplies a purpose for contracts whose policy demands one, so the seeded packs still compile
 * to their approval gate rather than a purpose refusal.
 */
function permittedPurposeFor(contract: ContextContract): { purposeId?: string } {
  const requiring = contract.policies.find((policy) => policy.purposeRequired)
  if (!requiring) return {}
  const permitted = requiring.permittedPurposeIds?.[0] ?? contract.purposes?.[0]?.id
  return permitted ? { purposeId: permitted } : {}
}


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
  }, subject)

  assert.equal(result.decision, 'RESOLVED')
  assert.deepEqual(result.plan?.arguments.counterparty, { entityId: 'CP-0103' })
  assert.deepEqual(result.plan?.metrics.map((metric) => metric.id), ['net_current_exposure', 'limit_utilization'])
  assert.equal(result.plan?.versions.contract, 'counterparty-risk@1.0.0')
  assert.equal(result.plan?.intent.operationId, 'risk.counterparty_exposure_assessment')
  assert.equal(result.plan?.intent.method, 'LEXICAL')
})

test('binds the plan to the principal and tenant it was issued to', () => {
  const result = compiler().compile({
    question: 'What is our exposure and limit utilization for Arcadia Capital?',
  }, subject)

  assert.equal(result.plan?.principalId, 'principal_test')
  assert.equal(result.plan?.tenantId, 'tenant_test')
  assert.equal(result.plan?.schemaVersion, '1.1')
})

test('refuses to issue a plan that has no principal to bind it to', () => {
  const result = compiler().compile({
    question: 'What is our exposure and limit utilization for Arcadia Capital?',
  })

  assert.equal(result.decision, 'DENIED')
  assert.deepEqual(result.reasonCodes, ['PLAN_SUBJECT_REQUIRED'])
  assert.equal(result.plan, undefined)
})

test('reports live grounding when no simulated evidence supports the decision', () => {
  const result = compiler().compile({
    question: 'What is our exposure and limit utilization for Arcadia Capital?',
  }, subject)

  assert.equal(result.grounding, 'LIVE')
  assert.equal(result.plan?.grounding, 'LIVE')
})

test('emits a clarification contract for an ambiguous name', () => {
  const result = compiler().compile({ question: 'Show the counterparty exposure for Arcadia.' })

  assert.equal(result.decision, 'CLARIFICATION_REQUIRED')
  assert.equal(result.clarification?.kind, 'ENTITY')
  assert.deepEqual(
    result.clarification?.kind === 'ENTITY' ? result.clarification.candidates.map((candidate) => candidate.entityId) : [],
    ['CP-0103', 'CP-0188'],
  )
})

test('abstains when no governed entity can be resolved', () => {
  const result = compiler().compile({ question: 'Show counterparty exposure for Northstar.' })

  assert.equal(result.decision, 'INSUFFICIENT_EVIDENCE')
  assert.deepEqual(result.reasonCodes, ['REQUIRED_ENTITY_UNRESOLVED'])
})

test('compiles every seeded airline and telecommunications reference contract from its simulated binding', () => {
  const now = new Date('2026-07-28T12:00:00.000Z')
  for (const contract of [...airlineExampleContracts, ...telecommunicationsExampleContracts]) {
    const runtimeContract = materializeSimulatedContext(contract, now)
    const requiredTypes = new Set(runtimeContract.operations.flatMap((operation) => operation.requiredEntityTypes))
    assert.ok([...requiredTypes].every((typeId) => runtimeContract.entities.some((entity) => entity.typeId === typeId)), `${contract.id} should materialize every required entity type`)

    let id = 0
    const result = new ContextCompiler(runtimeContract, {
      now: () => now,
      id: () => `${contract.id}-${++id}`,
    }).compile({ question: contract.competencyQuestions[0]!.question, ...permittedPurposeFor(contract) }, subject)

    assert.equal(result.decision, 'APPROVAL_REQUIRED', `${contract.id} should compile to its human approval gate`)
    assert.ok(result.pendingPlan)
    assert.equal(result.reasonCodes.includes('REQUIRED_ENTITY_UNRESOLVED'), false)
    assert.equal(result.grounding, 'SIMULATED', `${contract.id} resolves from a sample payload and must say so`)
    assert.equal(result.pendingPlan?.grounding, 'SIMULATED', `${contract.id} must pin simulated grounding into the plan`)
  }
})

test('a contract that has not declared reference runtime mode resolves no simulated context', () => {
  const now = new Date('2026-07-28T12:00:00.000Z')
  const contract = airlineExampleContracts[0]!
  const asLiveContract = { ...structuredClone(contract), runtimeMode: 'LIVE' as const }
  const runtimeContract = materializeSimulatedContext(asLiveContract, now)

  assert.deepEqual(runtimeContract.entities, contract.entities)
  const result = new ContextCompiler(runtimeContract, { now: () => now, id: () => 'live' })
    .compile({ question: contract.competencyQuestions[0]!.question }, subject)
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
  const result = new ContextCompiler(contract, { now: () => new Date('2026-07-19T00:00:00.000Z'), id: () => 'freshness' }).compile({ question: 'Show Arcadia Capital exposure.' }, subject)

  assert.equal(result.decision, 'STALE_CONTEXT')
  assert.deepEqual(result.reasonCodes, ['EVIDENCE_EXCEEDS_POLICY_FRESHNESS'])
})

test('escalates when the governing policy requires runtime approval', () => {
  const contract = structuredClone(counterpartyRiskContract)
  contract.policies[0]!.approvalRequired = true
  const result = new ContextCompiler(contract, { now: () => new Date('2026-07-19T00:00:00.000Z'), id: () => 'approval' }).compile({ question: 'Show Arcadia Capital exposure.' }, subject)

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
  const result = new ContextCompiler(contract, { now: () => new Date('2026-07-19T20:05:00.000Z'), id: () => 'grid' }).compile({ question: 'Which outage should be prioritized?' }, subject)

  assert.equal(result.decision, 'RESOLVED')
  assert.deepEqual(result.plan?.arguments.grid_asset, { entityId: 'ASSET-SUB-NORTH-01' })
})

function purposeContract(overrides: Partial<ContextContract> = {}): ContextContract {
  const base = structuredClone(counterpartyRiskContract)
  return {
    ...base,
    purposes: [
      { id: 'credit-risk-review', label: 'Credit risk review', description: 'Assess counterparty exposure.', obligations: ['Retain for audit only'], jurisdictions: ['EU'], retentionDays: 90 },
      { id: 'marketing', label: 'Marketing analytics', description: 'Campaign targeting.' },
    ],
    policies: base.policies.map((policy) => ({ ...policy, purposeRequired: true, permittedPurposeIds: ['credit-risk-review'] })),
    ...overrides,
  }
}

function purposeCompiler(contract: ContextContract) {
  return new ContextCompiler(contract, { now: () => new Date('2026-07-19T00:00:00.000Z'), id: () => 'purpose' })
}

test('a policy that requires a purpose refuses to compile without one', () => {
  const result = purposeCompiler(purposeContract()).compile({ question: 'Show Arcadia Capital exposure.' }, subject)

  assert.equal(result.decision, 'DENIED')
  assert.deepEqual(result.reasonCodes, ['PURPOSE_REQUIRED'])
  assert.match(result.explanation[0] ?? '', /credit-risk-review/)
})

test('an undeclared purpose is refused rather than recorded', () => {
  const result = purposeCompiler(purposeContract())
    .compile({ question: 'Show Arcadia Capital exposure.', purposeId: 'debt-collection' }, subject)

  assert.equal(result.decision, 'DENIED')
  assert.deepEqual(result.reasonCodes, ['PURPOSE_NOT_DECLARED'])
})

test('a declared purpose the risk tier does not permit is refused', () => {
  const result = purposeCompiler(purposeContract())
    .compile({ question: 'Show Arcadia Capital exposure.', purposeId: 'marketing' }, subject)

  assert.equal(result.decision, 'DENIED')
  assert.deepEqual(result.reasonCodes, ['PURPOSE_NOT_PERMITTED_AT_RISK_TIER'])
})

test('a permitted purpose is pinned into the plan with its obligations', () => {
  const result = purposeCompiler(purposeContract()).compile(
    { question: 'Show Arcadia Capital exposure.', purposeId: 'credit-risk-review', purpose: 'Quarterly limit review' },
    subject,
  )

  assert.equal(result.decision, 'RESOLVED')
  assert.equal(result.plan?.purpose?.id, 'credit-risk-review')
  assert.deepEqual(result.plan?.purpose?.obligations, ['Retain for audit only'])
  assert.deepEqual(result.plan?.purpose?.jurisdictions, ['EU'])
  assert.equal(result.plan?.purpose?.retentionDays, 90)
  assert.equal(result.plan?.purpose?.statedPurpose, 'Quarterly limit review')
})

test('a contract without purpose requirements still pins one when the caller names it', () => {
  const contract = purposeContract()
  const relaxed: ContextContract = {
    ...contract,
    policies: contract.policies.map((policy) => ({ ...policy, purposeRequired: false, permittedPurposeIds: [] })),
  }
  const result = purposeCompiler(relaxed).compile({ question: 'Show Arcadia Capital exposure.', purposeId: 'marketing' }, subject)

  assert.equal(result.decision, 'RESOLVED')
  assert.equal(result.plan?.purpose?.id, 'marketing')
})

test('an unnamed purpose leaves the plan unpinned rather than inventing one', () => {
  const contract = purposeContract()
  const relaxed: ContextContract = {
    ...contract,
    policies: contract.policies.map((policy) => ({ ...policy, purposeRequired: false, permittedPurposeIds: [] })),
  }
  const result = purposeCompiler(relaxed).compile({ question: 'Show Arcadia Capital exposure.' }, subject)

  assert.equal(result.decision, 'RESOLVED')
  assert.equal(result.plan?.purpose, undefined)
})
