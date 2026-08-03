import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import {
  DEFAULT_CLASSIFICATION,
  disclosureFor,
  discloseMappedValue,
  isAtLeast,
  resolveClassification,
  strictestClassification,
} from './classification.js'
import type { ClassificationAssertion, ContextContract, EntityTypeDefinition } from './types.js'

function contractWith(properties: EntityTypeDefinition['properties']): Pick<ContextContract, 'entityTypes'> {
  return {
    entityTypes: [{
      id: 'customer',
      label: 'Customer',
      description: 'A customer.',
      group: 'Party',
      icon: 'CU',
      properties,
      evidenceStatus: 'DIRECTLY_EVIDENCED',
      approvalStatus: 'APPROVED',
      impact: 'HIGH',
    }],
  }
}

function property(id: string, classification?: ClassificationAssertion): EntityTypeDefinition['properties'][number] {
  return {
    id,
    name: id,
    dataType: 'string',
    description: 'A property.',
    ...(classification ? { classification } : {}),
  }
}

const mapping = { sourcePath: '$.value', targetTypeId: 'customer', targetPropertyId: 'customer.ssn' }

/** Mirrors the salted hasher the API injects. */
function digestWith(salt: string) {
  return (value: unknown) => `sha256:${createHash('sha256').update(salt).update(' ').update(JSON.stringify(value ?? null)).digest('hex')}`
}

test('unclassified data is treated as internal rather than public', () => {
  const resolved = resolveClassification(mapping, contractWith([property('customer.ssn')]))
  assert.equal(resolved.sensitivity, DEFAULT_CLASSIFICATION)
  assert.equal(resolved.sensitivity, 'INTERNAL')
  assert.equal(resolved.disclosure, 'VALUE')
})

test('the source system wins when it classifies a column more strictly than the ontology', () => {
  const contract = contractWith([property('customer.ssn', { sensitivity: 'CONFIDENTIAL', source: 'AUTHOR' })])
  const resolved = resolveClassification(
    { ...mapping, classification: { sensitivity: 'RESTRICTED', source: 'CATALOG', catalog: 'unity-catalog' } },
    contract,
  )
  assert.equal(resolved.sensitivity, 'RESTRICTED')
})

test('the ontology wins when it classifies a property more strictly than the source', () => {
  const contract = contractWith([property('customer.ssn', { sensitivity: 'RESTRICTED', source: 'CATALOG' })])
  const resolved = resolveClassification(
    { ...mapping, classification: { sensitivity: 'INTERNAL', source: 'CATALOG' } },
    contract,
  )
  assert.equal(resolved.sensitivity, 'RESTRICTED')
})

test('regime categories accumulate across both assertions', () => {
  const contract = contractWith([property('customer.ssn', { sensitivity: 'CONFIDENTIAL', source: 'CATALOG', categories: ['PII'] })])
  const resolved = resolveClassification(
    { ...mapping, classification: { sensitivity: 'CONFIDENTIAL', source: 'CATALOG', categories: ['CPNI', 'PII'] } },
    contract,
  )
  assert.deepEqual(resolved.categories, ['CPNI', 'PII'])
})

test('disclosure is graded by sensitivity', () => {
  assert.equal(disclosureFor('PUBLIC'), 'VALUE')
  assert.equal(disclosureFor('INTERNAL'), 'VALUE')
  assert.equal(disclosureFor('CONFIDENTIAL'), 'DIGEST')
  assert.equal(disclosureFor('RESTRICTED'), 'WITHHELD')
})

test('a restricted value is recorded as read but never retained', () => {
  const contract = contractWith([property('customer.ssn', { sensitivity: 'RESTRICTED', source: 'CATALOG', categories: ['PII'] })])
  const record = discloseMappedValue(mapping, '123-45-6789', contract, digestWith('tenant-a'))

  assert.equal(record.disclosure, 'WITHHELD')
  assert.equal(record.value, undefined)
  assert.equal(record.valueDigest, undefined)
  assert.equal(record.targetPropertyId, 'customer.ssn')
  assert.deepEqual(record.categories, ['PII'])
  assert.equal(JSON.stringify(record).includes('123-45-6789'), false)
})

test('a confidential value is reduced to a digest that still proves equality', () => {
  const contract = contractWith([property('customer.ssn', { sensitivity: 'CONFIDENTIAL', source: 'CATALOG' })])
  const first = discloseMappedValue(mapping, 'ACC-1', contract, digestWith('tenant-a'))
  const second = discloseMappedValue(mapping, 'ACC-1', contract, digestWith('tenant-a'))
  const different = discloseMappedValue(mapping, 'ACC-2', contract, digestWith('tenant-a'))

  assert.equal(first.disclosure, 'DIGEST')
  assert.equal(first.value, undefined)
  assert.match(first.valueDigest ?? '', /^sha256:/)
  assert.equal(first.valueDigest, second.valueDigest)
  assert.notEqual(first.valueDigest, different.valueDigest)
  assert.equal(JSON.stringify(first).includes('ACC-1'), false)
})

test('digests are salted per tenant so they cannot be correlated across them', () => {
  const contract = contractWith([property('customer.ssn', { sensitivity: 'CONFIDENTIAL', source: 'CATALOG' })])
  const tenantA = discloseMappedValue(mapping, 'ACC-1', contract, digestWith('tenant-a'))
  const tenantB = discloseMappedValue(mapping, 'ACC-1', contract, digestWith('tenant-b'))

  assert.notEqual(tenantA.valueDigest, tenantB.valueDigest)
})

test('an internal value is retained so receipts stay useful for debugging', () => {
  const record = discloseMappedValue(mapping, 'LT121', contractWith([property('customer.ssn')]), digestWith('tenant-a'))
  assert.equal(record.disclosure, 'VALUE')
  assert.equal(record.value, 'LT121')
})

test('classification ordering helpers agree with the disclosure grades', () => {
  assert.equal(isAtLeast('RESTRICTED', 'CONFIDENTIAL'), true)
  assert.equal(isAtLeast('INTERNAL', 'CONFIDENTIAL'), false)
  assert.equal(strictestClassification(['PUBLIC', 'RESTRICTED', 'INTERNAL']), 'RESTRICTED')
  assert.equal(strictestClassification([]), 'PUBLIC')
})
