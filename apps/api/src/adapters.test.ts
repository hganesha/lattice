import assert from 'node:assert/strict'
import test from 'node:test'
import { counterpartyRiskContract, type ContextContract, type SignedExecutionPlan, type SourceBinding } from '@lattice/contracts'
import { isAllowedHttpSource, resolveBindingParameters } from './adapters.js'

const plan = { arguments: { counterparty: { entityId: 'CP-0103' } } } as Pick<SignedExecutionPlan, 'arguments'>

function bindingWith(parameters: SourceBinding['parameters']): SourceBinding {
  const base = counterpartyRiskContract.bindings[0]!
  return { ...structuredClone(base), ...(parameters ? { parameters } : { parameters: [] }) }
}

test('binds the key the source system recognizes, not the Lattice identifier', () => {
  const resolved = resolveBindingParameters(
    bindingWith([{ name: 'counterparty_lei', targetTypeId: 'counterparty', targetPropertyId: 'counterparty.lei' }]),
    plan,
    counterpartyRiskContract,
  )

  assert.deepEqual(resolved, { counterparty_lei: '549300ARCADIA0103' })
  assert.equal(JSON.stringify(resolved).includes('CP-0103'), false)
})

test('the shipped counterparty binding declares its source key', () => {
  const resolved = resolveBindingParameters(counterpartyRiskContract.bindings[0]!, plan, counterpartyRiskContract)
  assert.deepEqual(resolved, { counterparty_lei: '549300ARCADIA0103' })
})

test('a binding that declares no parameters keeps passing entity identifiers', () => {
  const resolved = resolveBindingParameters(bindingWith(undefined), plan, counterpartyRiskContract)
  assert.deepEqual(resolved, plan.arguments)
})

test('an unresolved entity type fails rather than binding nothing', () => {
  assert.throws(
    () => resolveBindingParameters(
      bindingWith([{ name: 'other', targetTypeId: 'collateral', targetPropertyId: 'collateral.market_value' }]),
      plan,
      counterpartyRiskContract,
    ),
    /SOURCE_PARAMETER_UNRESOLVED:other/,
  )
})

test('an entity the contract does not contain fails rather than binding an identifier', () => {
  assert.throws(
    () => resolveBindingParameters(
      bindingWith([{ name: 'counterparty_lei', targetTypeId: 'counterparty', targetPropertyId: 'counterparty.lei' }]),
      { arguments: { counterparty: { entityId: 'CP-UNKNOWN' } } },
      counterpartyRiskContract,
    ),
    /SOURCE_PARAMETER_ENTITY_NOT_FOUND/,
  )
})

test('an entity missing the declared key fails rather than binding undefined', () => {
  const contract: ContextContract = {
    ...structuredClone(counterpartyRiskContract),
    entities: counterpartyRiskContract.entities.map((entity) => (
      entity.id === 'CP-0103' ? { ...structuredClone(entity), properties: { rating: 'BBB' } } : structuredClone(entity)
    )),
  }

  assert.throws(
    () => resolveBindingParameters(
      bindingWith([{ name: 'counterparty_lei', targetTypeId: 'counterparty', targetPropertyId: 'counterparty.lei' }]),
      plan,
      contract,
    ),
    /SOURCE_PARAMETER_KEY_MISSING:counterparty_lei/,
  )
})

test('an HTTP binding reaches only loopback or an explicitly allowlisted host', () => {
  const allowlisted = { LATTICE_HTTP_SOURCE_HOSTS: 'risk.internal, collateral.example.com' }

  assert.equal(isAllowedHttpSource(new URL('http://127.0.0.1:9000/v1/x'), {}), true)
  assert.equal(isAllowedHttpSource(new URL('http://localhost:9000/v1/x'), {}), true)

  // Opening this up unconditionally would make a governed binding an SSRF primitive.
  assert.equal(isAllowedHttpSource(new URL('https://risk.internal/v1/x'), {}), false)
  assert.equal(isAllowedHttpSource(new URL('https://risk.internal/v1/x'), allowlisted), true)
  assert.equal(isAllowedHttpSource(new URL('https://api.risk.internal/v1/x'), allowlisted), true)
  assert.equal(isAllowedHttpSource(new URL('https://attacker.example/v1/x'), allowlisted), false)

  // An allowlisted host still may not be reached over plaintext.
  assert.equal(isAllowedHttpSource(new URL('http://risk.internal/v1/x'), allowlisted), false)
  // Nor may a lookalike that merely ends with the allowed string.
  assert.equal(isAllowedHttpSource(new URL('https://evil-risk.internal/v1/x'), allowlisted), false)
})
