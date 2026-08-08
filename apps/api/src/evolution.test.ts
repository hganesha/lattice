import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { counterpartyRiskContract, type CaseSet, type ContextContract, type ContractRegistryEntry, type EvalCase, type EvalRun } from '@lattice/contracts'
import { AttestationStore, createSigner, predicateForSubject } from './attestations.js'
import { buildDisposition, DispositionStore } from './dispositionStore.js'
import { CaseSetStore } from './caseSetStore.js'
import { diffEvalRuns, runEvaluation } from './evalHarness.js'
import { detectDrift } from './driftDetector.js'
import { replayDrift } from './counterfactual.js'

const now = new Date('2026-07-19T00:00:00.000Z')

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'lattice-evolution-test-'))
}

function goldCase(overrides: Partial<EvalCase> = {}): EvalCase {
  return {
    id: 'case-exposure',
    caseType: 'HAPPY_PATH',
    question: 'What is our exposure and limit utilization for Arcadia Capital?',
    purposeId: 'internal_analysis',
    contractId: counterpartyRiskContract.id,
    expected: { outcome: 'PLAN', decisions: ['RESOLVED'] },
    tags: [],
    riskTier: 'ANALYTICAL',
    goldRationale: 'The question names one counterparty with exact evidence, so a plan is correct.',
    reviewedBy: 'test',
    reviewedAt: now.toISOString(),
    ...overrides,
  }
}

function caseSetOf(cases: EvalCase[]): CaseSet {
  return {
    id: 'caseset-test',
    name: 'Test set',
    description: 'Fixture',
    version: '1.0.0',
    scope: 'CONTRACT',
    contractId: counterpartyRiskContract.id,
    owner: 'test',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    digest: 'sha256:test',
    cases,
  }
}

function evaluate(cases: EvalCase[], runId = 'run-a'): EvalRun {
  return runEvaluation({
    runId,
    name: runId,
    caseSet: caseSetOf(cases),
    cases,
    contract: structuredClone(counterpartyRiskContract),
    mode: 'DRY_RUN',
    environment: 'test',
    triggeredBy: 'principal_test',
    principalChain: [],
    now,
  }).run
}

test('a passing gold case scores and a wrong expectation fails the outcome gate without a score', () => {
  const passing = evaluate([goldCase()])
  assert.equal(passing.results[0]?.status, 'PASS')
  assert.equal(passing.results[0]?.gatesPassed, true)
  assert.ok((passing.results[0]?.weightedScore ?? 0) > 0)

  // The same question with an expectation the compiler cannot satisfy must trip a hard gate.
  const gated = evaluate([goldCase({ expected: { outcome: 'ABSTENTION', decisions: ['INSUFFICIENT_EVIDENCE'] } })])
  const result = gated.results[0]
  assert.equal(result?.status, 'GATE_FAIL')
  assert.equal(result?.gatesPassed, false)
  assert.ok(result?.gates.some((gate) => gate.id === 'WRONG_OUTCOME' && gate.status === 'FAIL'))

  // The plan's single most important rendering rule: a gated case has no score, not a low one.
  assert.equal(result?.weightedScore, undefined)
  assert.equal(gated.summary.weightedScore, undefined)
  assert.equal(gated.summary.gateFailures, 1)
})

test('every failed case is categorised and carries at least one routed action', () => {
  const gated = evaluate([goldCase({ expected: { outcome: 'ABSTENTION', decisions: ['INSUFFICIENT_EVIDENCE'] } })])
  const failure = gated.results[0]?.failure
  assert.ok(failure, 'a failed case must carry a failure')
  assert.ok(['CONTRACT', 'BINDING', 'PROMPT_RESOLVER', 'POLICY', 'EVIDENCE', 'RUNTIME'].includes(failure.category))
  assert.ok(failure.actions.length > 0, 'a remediation without an action is a dead end')
  for (const action of failure.actions) assert.ok(action.route.startsWith('/'), `route must be navigable: ${action.route}`)
})

test('the baseline diff classifies a regression and fails the CI verdict', () => {
  const baseline = evaluate([goldCase()], 'run-baseline')
  const candidate = evaluate([goldCase({ expected: { outcome: 'ABSTENTION', decisions: ['INSUFFICIENT_EVIDENCE'] } })], 'run-candidate')
  const diff = diffEvalRuns(candidate, baseline)

  assert.equal(diff.summary.REGRESSED, 1)
  assert.equal(diff.summary.FIXED, 0)
  assert.equal(diff.verdict, 'FAIL')
  assert.match(diff.ciSummary, /regressed/)
})

test('drift is detected from real release history and never invented', () => {
  const first = structuredClone(counterpartyRiskContract)
  const second = structuredClone(counterpartyRiskContract)
  const metric = second.metrics.find((candidate) => candidate.id === 'limit_utilization')
  assert.ok(metric)
  metric.formula = 'governed_exposure / (approved_limit * 0.9)'
  second.version = '1.1.0'

  const singleRelease: ContractRegistryEntry = {
    contractId: first.id,
    draft: first,
    updatedAt: now.toISOString(),
    runtimeStatus: 'ACTIVE',
    releases: [{ version: first.version, digest: first.digest, publishedAt: now.toISOString(), notes: '', contract: first }],
  }
  assert.deepEqual(detectDrift(singleRelease), [], 'one release is nothing to compare against')

  const twoReleases: ContractRegistryEntry = {
    ...singleRelease,
    releases: [
      ...singleRelease.releases,
      { version: second.version, digest: `${second.digest}-2`, publishedAt: now.toISOString(), notes: '', contract: second },
    ],
  }
  const events = detectDrift(twoReleases)
  const formulaChange = events.find((event) => event.kind === 'FORMULA_CHANGED')
  assert.ok(formulaChange, 'a changed metric formula is drift')
  assert.equal(formulaChange.subject.id, 'limit_utilization')
  assert.match(formulaChange.after, /0\.9/)
})

test('the counterfactual reports reconstruction, never re-execution', () => {
  const contract = structuredClone(counterpartyRiskContract)
  const record = buildDisposition({
    contractId: contract.id,
    contractVersion: contract.version,
    mode: 'AUTHORIZED',
    authorizing: true,
    question: 'Show Arcadia Capital exposure.',
    purposeId: 'internal_analysis',
    purposeLabel: 'Internal analysis',
    riskTier: 'ANALYTICAL',
    riskDerivation: { riskTier: 'ANALYTICAL', purposeId: 'internal_analysis', purposeTier: 'ANALYTICAL', reason: 'fixture', minimumEvidenceStrength: 'MODERATE', maximumEvidenceAgeMinutes: 1440, approvalRequired: false },
    decision: 'RESOLVED',
    reasonCodes: [],
    explanation: [],
    principalId: 'principal_test',
    principalChain: [],
    compilation: { contract: { id: contract.id, version: contract.version, digest: contract.digest }, bindings: [], policies: [], metrics: [], compilerVersion: 'test', evaluatedAt: now.toISOString() },
    evidenceRefs: [],
    latencyMs: 1,
    createdAt: now.toISOString(),
    provenance: 'RE_EXECUTED',
  })

  const event = detectDriftFixture(contract)
  const result = replayDrift({ event, dispositions: [record], contract, now })

  assert.equal(result.method, 'RECONSTRUCTED')
  assert.equal(result.evaluated, 1)
  assert.match(result.summary, /of the last 1 dispositions would have changed/)
})

function detectDriftFixture(contract: ContextContract) {
  return {
    id: 'drift-fixture',
    workspaceId: 'workspace-financial-services',
    contractId: contract.id,
    kind: 'FORMULA_CHANGED' as const,
    severity: 'CRITICAL' as const,
    subject: { kind: 'METRIC' as const, id: 'limit_utilization', label: 'Limit Utilization' },
    detectedAt: now.toISOString(),
    fromVersion: '1.0.0',
    toVersion: '1.1.0',
    before: 'a',
    after: 'b',
    detail: 'fixture',
    status: 'OPEN' as const,
    artifactDigest: 'sha256:fixture',
  }
}

test('attestation verification passes a good signature and fails a tampered payload', async () => {
  const directory = await scratch()
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const signer = createSigner('test-key', privateKey, publicKey)
  const store = await AttestationStore.open(join(directory, 'attestations.json'), signer)
  const tenantId = 'tenant_a'
  const subject = { id: 'disp_1', decision: 'RESOLVED', question: 'Show Arcadia Capital exposure.' }

  const attestation = await store.mint({
    subjectKind: 'DISPOSITION',
    subjectId: subject.id,
    predicateType: predicateForSubject.DISPOSITION,
    subject,
    signerId: 'principal_test',
    signerRoleAtSigning: 'DATA_STEWARD',
  }, tenantId)

  const good = await store.verify(attestation.id, subject, 'test-key', tenantId)
  assert.equal(good?.verified, true)
  assert.ok(good?.checks.every((check) => check.status !== 'FAIL'))

  const tampered = await store.verify(attestation.id, { ...subject, decision: 'DENIED' }, 'test-key', tenantId)
  assert.equal(tampered?.verified, false)
  assert.ok(tampered?.checks.some((check) => check.id === 'PAYLOAD_DIGEST' && check.status === 'FAIL'))

  // An unknown signing key must never report PASS.
  const wrongKey = await store.verify(attestation.id, subject, 'rotated-key', tenantId)
  assert.ok(wrongKey?.checks.some((check) => check.id === 'KEY_KNOWN' && check.status === 'FAIL'))
})

test('the disposition trail paginates and archives rather than dropping records', async () => {
  const directory = await scratch()
  const store = await DispositionStore.open(join(directory, 'dispositions.json'))
  const base = {
    contractId: 'contract-a',
    contractVersion: '1.0.0',
    mode: 'DRY_RUN' as const,
    authorizing: false,
    purposeId: 'internal_analysis',
    purposeLabel: 'Internal analysis',
    riskTier: 'ANALYTICAL' as const,
    riskDerivation: { riskTier: 'ANALYTICAL' as const, purposeId: 'internal_analysis', purposeTier: 'ANALYTICAL' as const, reason: 'fixture', minimumEvidenceStrength: 'MODERATE' as const, maximumEvidenceAgeMinutes: 1440, approvalRequired: false },
    decision: 'RESOLVED' as const,
    reasonCodes: [],
    explanation: [],
    principalId: 'principal_test',
    principalChain: [],
    compilation: { contract: { id: 'contract-a', version: '1.0.0', digest: 'sha256:a' }, bindings: [], policies: [], metrics: [], compilerVersion: 'test', evaluatedAt: now.toISOString() },
    evidenceRefs: [],
    latencyMs: 1,
    provenance: 'RE_EXECUTED' as const,
  }
  for (let index = 0; index < 30; index += 1) {
    await store.append(buildDisposition({ ...base, question: `q${index}`, createdAt: new Date(now.getTime() + index * 1000).toISOString() }), undefined)
  }

  const page = await store.query({ contractId: 'contract-a', limit: 10 }, undefined)
  assert.equal(page.records.length, 10)
  assert.equal(page.total, 30)
  assert.ok(page.nextCursor)

  const second = await store.query({ contractId: 'contract-a', limit: 10, ...(page.nextCursor ? { cursor: page.nextCursor } : {}) }, undefined)
  assert.equal(second.records.length, 10)
  assert.notEqual(second.records[0]?.id, page.records[0]?.id)

  assert.equal((await store.query({ contractId: 'contract-a', decision: 'DENIED' }, undefined)).total, 0)
  assert.equal((await store.retention(undefined)).dispositionRetentionDays, 90)
})

test('a case-set edit appends a superseding artifact instead of overwriting', async () => {
  const directory = await scratch()
  const path = join(directory, 'case-sets.json')
  const store = await CaseSetStore.open(path)
  const seeded = await store.seed(caseSetOf([goldCase()]), 'tenant_a')
  await store.upsertCase(seeded.id, goldCase({ id: 'case-second' }), 'tenant_a')

  // The ledger holds both states and the store folds them to the latest.
  const ledger = JSON.parse(await readFile(path, 'utf8')) as { caseSets: Array<{ id: string; chain: { sequence: number } }> }
  assert.equal(ledger.caseSets.length, 2, 'an edit appends rather than replaces')
  assert.deepEqual(ledger.caseSets.map((entry) => entry.chain.sequence), [0, 1])
  assert.equal(ledger.caseSets[0]?.id, ledger.caseSets[1]?.id, 'both artifacts describe the same case set')

  const current = await store.get(seeded.id, 'tenant_a')
  assert.equal(current?.cases.length, 2, 'reads see only the latest state')

  // Tenancy is enforced on read, not merely recorded.
  assert.equal(await store.get(seeded.id, 'tenant_b'), undefined)
})

test('a disposition is only visible to the tenant that wrote it', async () => {
  const directory = await scratch()
  const store = await DispositionStore.open(join(directory, 'dispositions.json'))
  const base = {
    contractId: 'contract-a',
    contractVersion: '1.0.0',
    mode: 'AUTHORIZED' as const,
    authorizing: true,
    question: 'q',
    purposeId: 'internal_analysis',
    purposeLabel: 'Internal analysis',
    riskTier: 'ANALYTICAL' as const,
    riskDerivation: { riskTier: 'ANALYTICAL' as const, purposeId: 'internal_analysis', purposeTier: 'ANALYTICAL' as const, reason: 'fixture', minimumEvidenceStrength: 'MODERATE' as const, maximumEvidenceAgeMinutes: 1440, approvalRequired: false },
    decision: 'RESOLVED' as const,
    reasonCodes: [],
    explanation: [],
    principalId: 'principal_test',
    principalChain: [],
    compilation: { contract: { id: 'contract-a', version: '1.0.0', digest: 'sha256:a' }, bindings: [], policies: [], metrics: [], compilerVersion: 'test', evaluatedAt: now.toISOString() },
    evidenceRefs: [],
    latencyMs: 1,
    createdAt: now.toISOString(),
    provenance: 'RE_EXECUTED' as const,
  }
  await store.append(buildDisposition(base), 'tenant_a')
  await store.append(buildDisposition({ ...base, question: 'other' }), 'tenant_b')

  assert.equal((await store.query({ contractId: 'contract-a' }, 'tenant_a')).total, 1)
  assert.equal((await store.query({ contractId: 'contract-a' }, 'tenant_b')).total, 1)
  assert.equal((await store.query({ contractId: 'contract-a' }, undefined)).total, 0)
})
