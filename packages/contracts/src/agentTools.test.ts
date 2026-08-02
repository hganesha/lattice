import assert from 'node:assert/strict'
import test from 'node:test'
import { counterpartyRiskContract } from './counterpartyContract.js'
import { airlineExampleContracts } from './airlineContracts.js'
import { projectGovernedTools, toAnthropicTool, toOpenAIFunctionTool } from './agentTools.js'
import type { ContextContract } from './types.js'

test('projects every governed operation as one tool', () => {
  const tools = projectGovernedTools(counterpartyRiskContract)
  assert.equal(tools.length, counterpartyRiskContract.operations.length)
  assert.deepEqual(
    tools.map((tool) => tool.governance.operationId).sort(),
    counterpartyRiskContract.operations.map((operation) => operation.id).sort(),
  )
})

test('tool names satisfy the provider naming constraint', () => {
  for (const contract of [counterpartyRiskContract, ...airlineExampleContracts]) {
    for (const tool of projectGovernedTools(contract)) {
      assert.match(tool.name, /^[a-zA-Z0-9_-]{1,64}$/, `${tool.governance.operationId} produced an invalid tool name`)
    }
  }
})

test('colliding operation identifiers still produce distinct tool names', () => {
  const contract: ContextContract = {
    ...structuredClone(counterpartyRiskContract),
    operations: [
      { ...counterpartyRiskContract.operations[0]!, id: 'risk.exposure' },
      { ...counterpartyRiskContract.operations[0]!, id: 'risk-exposure' },
      { ...counterpartyRiskContract.operations[0]!, id: 'risk/exposure' },
    ],
  }
  const names = projectGovernedTools(contract).map((tool) => tool.name)
  assert.equal(new Set(names).size, 3)
})

test('pins the release and the controls a caller must respect', () => {
  const tool = projectGovernedTools(counterpartyRiskContract)[0]!
  const operation = counterpartyRiskContract.operations.find((candidate) => candidate.id === tool.governance.operationId)!
  const policy = counterpartyRiskContract.policies.find((candidate) => candidate.riskTier === operation.riskTier)!

  assert.equal(tool.governance.contractDigest, counterpartyRiskContract.digest)
  assert.equal(tool.governance.contractVersion, counterpartyRiskContract.version)
  assert.equal(tool.governance.riskTier, operation.riskTier)
  assert.deepEqual(tool.governance.requiredPermissions, operation.requiredPermissions)
  assert.equal(tool.governance.approvalRequired, policy.approvalRequired)
  assert.equal(tool.governance.minimumEvidenceStrength, policy.minimumEvidenceStrength)
})

test('the schema teaches the model which governed entity types the operation needs', () => {
  const tool = projectGovernedTools(counterpartyRiskContract)
    .find((candidate) => candidate.governance.requiredEntityTypes.length > 0)!

  assert.deepEqual(tool.inputSchema.required, ['question'])
  assert.equal(tool.inputSchema.additionalProperties, false)
  assert.deepEqual(
    Object.keys(tool.inputSchema.properties.selections?.properties ?? {}).sort(),
    [...tool.governance.requiredEntityTypes].sort(),
  )
})

test('an operation needing no governed context omits the selections property', () => {
  const contract: ContextContract = {
    ...structuredClone(counterpartyRiskContract),
    operations: [{ ...counterpartyRiskContract.operations[0]!, requiredEntityTypes: [] }],
  }
  const tool = projectGovernedTools(contract)[0]!
  assert.equal(tool.inputSchema.properties.selections, undefined)
  assert.deepEqual(Object.keys(tool.inputSchema.properties).sort(), ['purpose', 'question'])
})

test('the description tells the model that selecting a tool compiles rather than executes', () => {
  const contract = airlineExampleContracts[0]!
  const tool = projectGovernedTools(contract)[0]!

  assert.match(tool.description, /does not execute|cannot execute it/)
  assert.match(tool.description, /clarification request or an evidence-backed abstention/)
  assert.match(tool.description, /operational action risk/)
})

test('the risk ceiling withholds operations an agent is not cleared to propose', () => {
  const contract = airlineExampleContracts[0]!
  assert.ok(projectGovernedTools(contract).length > 0)
  assert.deepEqual(projectGovernedTools(contract, { maximumRiskTier: 'ANALYTICAL' }), [])
})

test('converts to the Anthropic and OpenAI tool shapes without losing the schema', () => {
  const tool = projectGovernedTools(counterpartyRiskContract)[0]!

  const anthropic = toAnthropicTool(tool)
  assert.equal(anthropic.name, tool.name)
  assert.deepEqual(anthropic.input_schema, tool.inputSchema)

  const openai = toOpenAIFunctionTool(tool)
  assert.equal(openai.type, 'function')
  assert.equal(openai.function.name, tool.name)
  assert.deepEqual(openai.function.parameters, tool.inputSchema)
})
