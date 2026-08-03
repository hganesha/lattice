import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { counterpartyRiskContract } from '@lattice/contracts'
import { runAssurance } from './assurance.js'
import { AssuranceStore } from './assuranceStore.js'

test('runs deterministic structural, question, mapping, and policy gates', () => {
  const run = runAssurance(counterpartyRiskContract, new Date('2026-07-19T12:00:00.000Z'))
  assert.equal(run.status, 'PASS')
  assert.equal(run.score, 100)
  assert.equal(run.summary.failed, 0)
  assert.equal(run.checks.some((check) => check.category === 'MAPPING'), true)
  assert.match(run.artifactDigest, /^sha256:[a-f0-9]{64}$/)
})

test('fails a competency question with no implemented operation', () => {
  const contract = structuredClone(counterpartyRiskContract)
  contract.competencyQuestions[0]!.operationId = 'missing.operation'
  const run = runAssurance(contract)
  assert.equal(run.status, 'FAIL')
  assert.equal(run.checks.find((check) => check.id.includes('.operation'))?.status, 'FAIL')
})

test('warns when an operation risk tier has no approved policy coverage', () => {
  const contract = structuredClone(counterpartyRiskContract)
  contract.policies = []
  const run = runAssurance(contract)
  assert.equal(run.status, 'WARNING')
  assert.equal(run.checks.find((check) => check.id === 'policy.coverage')?.status, 'WARNING')
})

test('compiles every governed question and confirms it still routes to its linked operation', () => {
  const run = runAssurance(counterpartyRiskContract, new Date('2026-07-19T00:00:00.000Z'))
  const resolution = run.checks.filter((check) => check.category === 'RESOLUTION')

  assert.equal(resolution.length, counterpartyRiskContract.competencyQuestions.length)
  assert.ok(resolution.length > 0, 'the reference contract should publish at least one governed question')
  assert.deepEqual(resolution.filter((check) => check.status !== 'PASS'), [])
})

test('a question that has been rerouted away from its operation fails assurance', () => {
  const contract = structuredClone(counterpartyRiskContract)
  const question = contract.competencyQuestions[0]!
  // Simulate the drift this gate exists to catch: the author relinks the question, or someone
  // retunes keywords so the resolver sends it elsewhere.
  question.operationId = 'risk.some_other_operation'

  const run = runAssurance(contract, new Date('2026-07-19T00:00:00.000Z'))
  const rerouted = run.checks.find((check) => check.id === `resolution.${question.id}`)

  assert.equal(rerouted?.status, 'FAIL')
  assert.match(rerouted?.message ?? '', /now routes to risk\.counterparty_exposure_assessment/)
  assert.equal(run.status, 'FAIL')
})

test('a contract with no governed questions produces no resolution checks', () => {
  const contract = structuredClone(counterpartyRiskContract)
  contract.competencyQuestions = []
  const run = runAssurance(contract, new Date('2026-07-19T00:00:00.000Z'))

  assert.deepEqual(run.checks.filter((check) => check.category === 'RESOLUTION'), [])
})

test('persists immutable assurance artifacts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-assurance-'))
  const store = await AssuranceStore.open(join(directory, 'runs.json'))
  const run = runAssurance(counterpartyRiskContract)
  await store.append(run, 'tenant_a')
  assert.equal(store.list(counterpartyRiskContract.id, 'tenant_a')[0]?.artifactDigest, run.artifactDigest)
  await assert.rejects(() => store.append(run, 'tenant_a'), /ASSURANCE_RUN_IMMUTABLE/)
})

test('assurance artifacts are not readable from another tenant', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-assurance-tenancy-'))
  const store = await AssuranceStore.open(join(directory, 'runs.json'))
  const run = await store.append(runAssurance(counterpartyRiskContract), 'tenant_a')
  assert.equal(store.list(counterpartyRiskContract.id, 'tenant_b').length, 0)
  assert.equal(store.get(run.id, 'tenant_b'), undefined)
  assert.equal(store.get(run.id, 'tenant_a')?.id, run.id)
})
