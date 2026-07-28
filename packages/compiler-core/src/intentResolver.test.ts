import assert from 'node:assert/strict'
import test from 'node:test'
import {
  counterpartyRiskContract,
  type ContextContract,
  type IntentResolution,
  type RiskTier,
} from '@lattice/contracts'
import { ContextCompiler } from './compiler.js'
import { HybridIntentResolver, type EmbeddingProvider } from './intentResolver.js'

test('hybrid resolution maps a paraphrase to the governed operation through question vectors', async () => {
  const contract = intentContract()
  const resolver = new HybridIntentResolver(new ExampleEmbeddingProvider())
  const resolution = await resolver.resolve({
    question: 'How much could we lose if Arcadia defaults?',
  }, contract)

  assert.equal(resolution.method, 'HYBRID')
  assert.equal(resolution.candidates[0]?.operationId, 'risk.exposure')
  assert.equal(resolution.candidates[0]?.semanticScore, 1)
  assert.deepEqual(resolution.candidates[0]?.matchedQuestionIds, ['cq-exposure'])
})

test('compiler accepts a strong, unambiguous semantic candidate before deterministic policy gates', () => {
  const contract = intentContract()
  const resolution = intentResolution([
    ['risk.exposure', 0.91, 0],
    ['risk.collateral', 0.41, 0],
  ])
  const result = new ContextCompiler(contract, { id: () => 'semantic' }).compile({
    question: 'How much could we lose if Arcadia defaults?',
  }, { intentResolution: resolution })

  assert.equal(result.decision, 'RESOLVED')
  assert.equal(result.plan?.operation, 'risk.exposure')
  assert.equal(result.intentResolution?.indexDigest, 'sha256:test-index')
})

test('compiler asks for operation clarification when semantic candidates are too close', () => {
  const contract = intentContract()
  const resolution = intentResolution([
    ['risk.exposure', 0.89, 0],
    ['risk.collateral', 0.85, 0],
  ])
  const result = new ContextCompiler(contract, { id: () => 'ambiguous' }).compile({
    question: 'What protection do we have if Arcadia defaults?',
  }, { intentResolution: resolution })

  assert.equal(result.decision, 'CLARIFICATION_REQUIRED')
  assert.deepEqual(result.reasonCodes, ['AMBIGUOUS_OPERATION'])
  assert.equal(result.clarification?.kind, 'OPERATION')
  assert.deepEqual(
    result.clarification?.kind === 'OPERATION'
      ? result.clarification.candidates.map((candidate) => candidate.operationId)
      : [],
    ['risk.exposure', 'risk.collateral'],
  )
})

test('semantic-only operational actions require explicit confirmation', () => {
  const contract = intentContract('OPERATIONAL_ACTION')
  const resolution = intentResolution([['risk.exposure', 0.98, 0]])
  const result = new ContextCompiler(contract, { id: () => 'operational' }).compile({
    question: 'Take action on the Arcadia limit.',
  }, { intentResolution: resolution })

  assert.equal(result.decision, 'CLARIFICATION_REQUIRED')
  assert.deepEqual(result.reasonCodes, ['SEMANTIC_OPERATION_CONFIRMATION_REQUIRED'])

  const confirmed = new ContextCompiler(contract, { id: () => 'confirmed' }).compile({
    question: 'Take action on the Arcadia limit.',
  }, { intentResolution: resolution, selectedOperationId: 'risk.exposure' })
  assert.equal(confirmed.decision, 'RESOLVED')
  assert.equal(confirmed.plan?.intent.acceptance, 'USER_CONFIRMED')
})

test('confirmed operation context survives a subsequent entity clarification', () => {
  const contract = intentContract()
  contract.operations[0]!.requiredEntityTypes = ['counterparty']
  const resolution = intentResolution([['risk.exposure', 0.91, 0]])
  const compiler = new ContextCompiler(contract, {
    id: () => 'continuation',
    now: () => new Date('2026-07-19T00:00:00.000Z'),
  })
  const request = { question: 'How much could we lose if Arcadia defaults?' }

  const entityClarification = compiler.compile(request, { intentResolution: resolution })
  assert.equal(entityClarification.clarification?.kind, 'ENTITY')

  const continued = compiler.compile({
    ...request,
    selections: { counterparty: 'CP-0103' },
  }, {
    intentResolution: resolution,
    selectedOperationId: 'risk.exposure',
  })
  assert.equal(continued.decision, 'RESOLVED')
  assert.equal(continued.plan?.operation, 'risk.exposure')
  assert.deepEqual(continued.plan?.arguments.counterparty, { entityId: 'CP-0103' })
})

test('hybrid resolver degrades to lexical candidates when embeddings are unavailable', async () => {
  const contract = intentContract()
  const resolver = new HybridIntentResolver({
    modelVersion: 'unavailable-model',
    async embed() {
      throw new Error('embedding service unavailable')
    },
  })
  const resolution = await resolver.resolve({ question: 'Show exposure.' }, contract)

  assert.equal(resolution.method, 'LEXICAL')
  assert.match(resolution.degradedReason ?? '', /unavailable/)
  assert.equal(resolution.candidates[0]?.operationId, 'risk.exposure')
})

class ExampleEmbeddingProvider implements EmbeddingProvider {
  readonly modelVersion = 'example-semantic-v1'

  async embed(inputs: string[]): Promise<number[][]> {
    return inputs.map((input) => {
      const normalized = input.toLocaleLowerCase()
      if (normalized.includes('could we lose') || normalized.includes('current exposure')) return [1, 0]
      if (normalized.includes('collateral')) return [0, 1]
      return [0.5, 0.5]
    })
  }
}

function intentContract(exposureRiskTier: RiskTier = 'ANALYTICAL'): ContextContract {
  const contract = structuredClone(counterpartyRiskContract)
  contract.competencyQuestions = [
    {
      id: 'cq-exposure',
      question: 'What is our current exposure to this counterparty?',
      expectedAnswerShape: 'Exposure by legal entity',
      impact: 'HIGH',
      owner: 'Credit Risk',
      testIds: [],
      operationId: 'risk.exposure',
    },
    {
      id: 'cq-collateral',
      question: 'What collateral protects this counterparty exposure?',
      expectedAnswerShape: 'Collateral positions',
      impact: 'HIGH',
      owner: 'Credit Risk',
      testIds: [],
      operationId: 'risk.collateral',
    },
  ]
  contract.operations = [
    {
      id: 'risk.exposure',
      label: 'Counterparty exposure',
      description: 'Return governed current exposure.',
      keywords: ['exposure'],
      requiredEntityTypes: [],
      metricIds: [],
      relationshipPath: [],
      sourceBindingIds: [],
      riskTier: exposureRiskTier,
      requiredPermissions: [],
      expectedResultSchema: 'Exposure[]',
    },
    {
      id: 'risk.collateral',
      label: 'Collateral availability',
      description: 'Return governed collateral positions.',
      keywords: ['collateral'],
      requiredEntityTypes: [],
      metricIds: [],
      relationshipPath: [],
      sourceBindingIds: [],
      riskTier: 'ANALYTICAL',
      requiredPermissions: [],
      expectedResultSchema: 'Collateral[]',
    },
  ]
  contract.policies = [
    ...contract.policies.filter((policy) => !['ANALYTICAL', 'OPERATIONAL_ACTION'].includes(policy.riskTier)),
    policy('ANALYTICAL'),
    policy('OPERATIONAL_ACTION'),
  ]
  return contract
}

function policy(riskTier: RiskTier): ContextContract['policies'][number] {
  return {
    id: `policy-${riskTier.toLocaleLowerCase()}`,
    label: `${riskTier} policy`,
    description: 'Approved runtime policy.',
    riskTier,
    minimumEvidenceStrength: 'MODERATE',
    maximumEvidenceAgeMinutes: 1_440,
    approvalRequired: false,
    version: '1.0.0',
    owner: 'Context Governance',
    approvalStatus: 'APPROVED',
  }
}

function intentResolution(candidates: Array<[string, number, number]>): IntentResolution {
  return {
    resolverVersion: 'test-hybrid-v1',
    method: 'HYBRID',
    modelVersion: 'test-model-v1',
    indexDigest: 'sha256:test-index',
    candidates: candidates.map(([operationId, semanticScore, lexicalScore]) => ({
      operationId,
      matchedQuestionIds: [],
      lexicalScore,
      semanticScore,
      aggregateScore: semanticScore,
      rationale: [`Test semantic score ${semanticScore}.`],
    })),
  }
}
