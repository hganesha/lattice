import { createHash } from 'node:crypto'
import { ContextCompiler } from '@lattice/compiler-core'
import {
  deriveRiskTier,
  evalDimensionLabels,
  evalDimensionWeights,
  evalGateDefinitions,
  findPurpose,
  weightedScore,
  type CaseSet,
  type CompilationRecord,
  type CompileResponse,
  type ContextContract,
  type DispositionMode,
  type DispositionRecord,
  type EvalCase,
  type EvalCaseResult,
  type EvalDiffEntry,
  type EvalDiffStatus,
  type EvalDimension,
  type EvalDimensionScore,
  type EvalExpectedOutcome,
  type EvalFailure,
  type EvalFailureAction,
  type EvalFailureCategory,
  type EvalGateId,
  type EvalGateResult,
  type EvalRun,
  type EvalRunDiff,
  type EvidenceStrength,
  type GuardrailPolicy,
  type ImpactLevel,
  type PrincipalChainLink,
  type RiskTier,
  type RuntimeDecision,
  type UnsignedExecutionPlan,
} from '@lattice/contracts'
import { buildDisposition } from './dispositionStore.js'

const evidenceRank: Readonly<Record<EvidenceStrength, number>> = { INSUFFICIENT: 0, WEAK: 1, MODERATE: 2, STRONG: 3, EXACT: 4 }
const riskOrder: readonly RiskTier[] = ['INFORMATIONAL', 'ANALYTICAL', 'PLANNING_DECISION', 'OPERATIONAL_ACTION']
const gateLabels = new Map(evalGateDefinitions.map((definition) => [definition.id, definition.label]))

export interface RunEvaluationInput {
  runId: string
  name: string
  caseSet: CaseSet
  cases: EvalCase[]
  contract: ContextContract
  workspaceId?: string
  mode: DispositionMode
  environment: string
  triggeredBy: string
  principalChain: PrincipalChainLink[]
  baselineRunId?: string
  now: Date
}

export interface EvaluationOutput {
  run: EvalRun
  /** Built but not persisted; the caller appends them so the store stays the single writer. */
  dispositions: DispositionRecord[]
}

/**
 * Deterministic local harness (plan §10 — no LangSmith, no network). `now` and `id` are injected
 * into the compiler so the same case set against the same contract produces the same run, and
 * `latencyMs` is measured with the monotonic clock rather than asserted.
 */
export function runEvaluation(input: RunEvaluationInput): EvaluationOutput {
  const workspaceId = input.workspaceId ?? input.contract.ontologyRef?.workspaceId ?? input.caseSet.workspaceId ?? `workspace-${slug(input.contract.domain)}`
  const startedAt = input.now.toISOString()
  const results: EvalCaseResult[] = []
  const dispositions: DispositionRecord[] = []

  for (const evalCase of input.cases) {
    let sequence = 0
    const caseNow = evalCase.asOf ? new Date(evalCase.asOf) : input.now
    const compiler = new ContextCompiler(input.contract, {
      now: () => caseNow,
      id: () => `${input.runId}_${evalCase.id}_${sequence++}`,
    })
    const started = process.hrtime.bigint()
    const response = compiler.compile({
      question: evalCase.question,
      contractId: input.contract.id,
      purposeId: evalCase.purposeId,
      ...(evalCase.selections ? { selections: evalCase.selections } : {}),
      ...(evalCase.asOf ? { asOf: evalCase.asOf } : {}),
    })
    const latencyMs = Number(process.hrtime.bigint() - started) / 1_000_000
    const plan = response.plan ?? response.pendingPlan
    const derivation = deriveRiskTier(input.contract, evalCase.purposeId, plan?.operation)
    const policy = input.contract.policies.find((candidate) => candidate.id === derivation.policyId)
    const compilation = buildCompilationRecord(input.contract, plan, derivation.riskTier, caseNow.toISOString())

    const gates = evaluateGates(evalCase, response, plan, policy, input.contract)
    const dimensions = scoreDimensions(evalCase, response, plan, policy, input.contract)
    const gatesPassed = gates.every((gate) => gate.status === 'PASS')
    const score = weightedScore(gates, dimensions)
    const status: EvalCaseResult['status'] = !gatesPassed ? 'GATE_FAIL' : dimensions.every((dimension) => dimension.score >= 1) ? 'PASS' : 'FAIL'

    const disposition = buildDisposition({
      contractId: input.contract.id,
      contractVersion: input.contract.version,
      ...(workspaceId ? { workspaceId } : {}),
      mode: input.mode,
      /** An evaluation never authorizes an action, whatever mode the run declares. */
      authorizing: false,
      question: evalCase.question,
      purposeId: derivation.purposeId,
      purposeLabel: findPurpose(derivation.purposeId)?.label ?? derivation.purposeId,
      riskTier: derivation.riskTier,
      riskDerivation: derivation,
      decision: response.decision,
      reasonCodes: response.reasonCodes,
      explanation: response.explanation,
      ...(plan ? { operationId: plan.operation } : {}),
      ...(response.clarification ? { clarificationId: response.clarification.id } : {}),
      principalId: input.triggeredBy,
      principalChain: input.principalChain,
      compilation,
      evidenceRefs: plan?.evidenceRefs ?? [],
      latencyMs,
      createdAt: caseNow.toISOString(),
      provenance: 'RE_EXECUTED',
      evalRunId: input.runId,
    })
    dispositions.push(disposition)

    const failure = status === 'PASS' ? undefined : buildFailure(evalCase, gates, dimensions, input.contract, workspaceId, input.caseSet.id, disposition.id)
    results.push({
      caseId: evalCase.id,
      caseType: evalCase.caseType,
      question: evalCase.question,
      purposeId: evalCase.purposeId,
      riskTier: derivation.riskTier,
      status,
      gatesPassed,
      gates,
      dimensions,
      ...(score === undefined ? {} : { weightedScore: score }),
      expectedOutcome: evalCase.expected.outcome,
      actualDecision: response.decision,
      reasonCodes: response.reasonCodes,
      explanation: response.explanation,
      dispositionId: disposition.id,
      latencyMs,
      ...(failure ? { failure } : {}),
    })
  }

  const latencies = results.map((result) => result.latencyMs).sort((left, right) => left - right)
  const scored = results.filter((result) => result.weightedScore !== undefined).map((result) => result.weightedScore ?? 0)
  const gateSummary: Partial<Record<EvalGateId, number>> = {}
  for (const result of results) {
    for (const gate of result.gates) if (gate.status === 'FAIL') gateSummary[gate.id] = (gateSummary[gate.id] ?? 0) + 1
  }
  const failureSummary: Partial<Record<EvalFailureCategory, number>> = {}
  for (const result of results) {
    if (result.failure) failureSummary[result.failure.category] = (failureSummary[result.failure.category] ?? 0) + 1
  }

  const body: Omit<EvalRun, 'artifactDigest'> = {
    id: input.runId,
    name: input.name,
    caseSetId: input.caseSet.id,
    caseSetVersion: input.caseSet.version,
    caseSetDigest: input.caseSet.digest,
    contractId: input.contract.id,
    contractVersion: input.contract.version,
    contractDigest: input.contract.digest,
    ...(workspaceId ? { workspaceId } : {}),
    mode: input.mode,
    environment: input.environment,
    status: 'COMPLETED',
    triggeredBy: input.triggeredBy,
    startedAt,
    completedAt: new Date(input.now.getTime() + Math.round(latencies.reduce((sum, value) => sum + value, 0))).toISOString(),
    summary: {
      total: results.length,
      passed: results.filter((result) => result.status === 'PASS').length,
      failed: results.filter((result) => result.status === 'FAIL').length,
      gateFailures: results.filter((result) => result.status === 'GATE_FAIL').length,
      /** Mean over ungated cases only — a gated case has no score to average. */
      ...(scored.length > 0 ? { weightedScore: Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length) } : {}),
      medianLatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
    },
    gateSummary,
    failureSummary,
    results,
    ...(input.baselineRunId ? { baselineRunId: input.baselineRunId } : {}),
  }
  return { run: { ...body, artifactDigest: digest(body) }, dispositions }
}

/** Pins for every artifact the compile actually consulted (E5). */
export function buildCompilationRecord(
  contract: ContextContract,
  plan: UnsignedExecutionPlan | undefined,
  riskTier: RiskTier,
  evaluatedAt: string,
): CompilationRecord {
  const bindingIds = new Set(plan?.sourceBindings ?? [])
  const bindings = contract.bindings.filter((binding) => bindingIds.has(binding.id))
  const metricIds = new Set((plan?.metrics ?? []).map((metric) => metric.id))
  return {
    contract: { id: contract.id, version: contract.version, digest: contract.digest },
    ...(contract.ontologyRef ? { ontology: { ...contract.ontologyRef } } : {}),
    bindings: bindings.map((binding) => ({ id: binding.id, version: binding.version, sourceSystem: binding.sourceSystem })),
    policies: contract.policies.filter((policy) => policy.riskTier === riskTier).map((policy) => ({ id: policy.id, version: policy.version, riskTier: policy.riskTier })),
    metrics: contract.metrics.filter((metric) => metricIds.has(metric.id)).map((metric) => ({ id: metric.id, version: metric.version })),
    compilerVersion: contract.versions.api,
    evaluatedAt,
  }
}

export function diffEvalRuns(candidate: EvalRun, baseline: EvalRun): EvalRunDiff {
  const baselineById = new Map(baseline.results.map((result) => [result.caseId, result]))
  const candidateById = new Map(candidate.results.map((result) => [result.caseId, result]))
  const caseIds = [...new Set([...candidate.results.map((result) => result.caseId), ...baseline.results.map((result) => result.caseId)])].sort()
  const entries: EvalDiffEntry[] = []
  const summary: Record<EvalDiffStatus, number> = { FIXED: 0, REGRESSED: 0, UNCHANGED_PASS: 0, UNCHANGED_FAIL: 0, NEW: 0, REMOVED: 0 }

  for (const caseId of caseIds) {
    const before = baselineById.get(caseId)
    const after = candidateById.get(caseId)
    const status: EvalDiffStatus = !before ? 'NEW'
      : !after ? 'REMOVED'
      : before.status === 'PASS' && after.status === 'PASS' ? 'UNCHANGED_PASS'
      : before.status === 'PASS' ? 'REGRESSED'
      : after.status === 'PASS' ? 'FIXED'
      : 'UNCHANGED_FAIL'
    summary[status] += 1
    const source = after ?? before
    if (!source) continue
    entries.push({
      caseId,
      question: source.question,
      caseType: source.caseType,
      status,
      ...(before ? { baseline: { status: before.status, gatesPassed: before.gatesPassed, ...(before.weightedScore === undefined ? {} : { weightedScore: before.weightedScore }), decision: before.actualDecision } } : {}),
      ...(after ? { candidate: { status: after.status, gatesPassed: after.gatesPassed, ...(after.weightedScore === undefined ? {} : { weightedScore: after.weightedScore }), decision: after.actualDecision } } : {}),
    })
  }

  const newGateFailures = entries.filter((entry) => entry.status === 'NEW' && entry.candidate?.status === 'GATE_FAIL').length
  const gateDelta: Partial<Record<EvalGateId, number>> = {}
  for (const gate of evalGateDefinitions) {
    const delta = (candidate.gateSummary[gate.id] ?? 0) - (baseline.gateSummary[gate.id] ?? 0)
    if (delta !== 0) gateDelta[gate.id] = delta
  }
  const verdict: EvalRunDiff['verdict'] = summary.REGRESSED > 0 || newGateFailures > 0 ? 'FAIL' : 'PASS'
  const ciSummary = `${verdict} — ${candidate.id} vs baseline ${baseline.id}: ${summary.REGRESSED} regressed, ${newGateFailures} new gate failure${newGateFailures === 1 ? '' : 's'}, ${summary.FIXED} fixed, ${summary.UNCHANGED_PASS} unchanged pass, ${summary.UNCHANGED_FAIL} unchanged fail, ${summary.NEW} new, ${summary.REMOVED} removed.`

  return {
    runId: candidate.id,
    baselineRunId: baseline.id,
    generatedAt: new Date().toISOString(),
    verdict,
    ciSummary,
    summary,
    gateDelta,
    entries,
  }
}

/* ------------------------------------------------------------------ *
 * Hard gates — pass/fail, never folded into the weighted score.
 * ------------------------------------------------------------------ */

function evaluateGates(
  evalCase: EvalCase,
  response: CompileResponse,
  plan: UnsignedExecutionPlan | undefined,
  policy: GuardrailPolicy | undefined,
  contract: ContextContract,
): EvalGateResult[] {
  const expected = evalCase.expected
  const decisionAccepted = expected.decisions.includes(response.decision)
  const outcomeMatches = outcomeFor(response.decision) === expected.outcome
  const gates: EvalGateResult[] = []

  gates.push(gate('WRONG_OUTCOME', decisionAccepted && outcomeMatches,
    decisionAccepted && outcomeMatches
      ? `Returned ${response.decision}, which the gold case accepts as ${expected.outcome}.`
      : `Returned ${response.decision} (${outcomeFor(response.decision)}); the gold case accepts ${expected.decisions.join(' or ')} as ${expected.outcome}.`))

  const forbidden = expected.forbiddenOperationIds ?? []
  const planAllowed = expected.outcome === 'PLAN' || expected.outcome === 'APPROVAL'
  const unsafe = Boolean(plan) && (forbidden.includes(plan?.operation ?? '') || !planAllowed)
  gates.push(gate('UNSAFE_PLAN_EMITTED', !unsafe,
    !unsafe
      ? plan ? `Plan for ${plan.operation} is permitted by the gold case.` : 'No executable plan was emitted.'
      : `Emitted a plan for ${plan?.operation} while the gold case expects ${expected.outcome}.`))

  const requiredEvidence = expected.requiredEvidenceRefs ?? []
  const presentEvidence = plan?.evidenceRefs ?? []
  const missingEvidence = requiredEvidence.filter((reference) => !presentEvidence.includes(reference))
  gates.push(gate('REQUIRED_EVIDENCE_MISSING', missingEvidence.length === 0,
    missingEvidence.length === 0
      ? requiredEvidence.length === 0 ? 'The gold case requires no specific evidence.' : `All ${requiredEvidence.length} required evidence records are pinned.`
      : `Missing ${missingEvidence.join(', ')} from the compiled evidence set.`))

  const requiredPolicies = expected.requiredPolicyIds ?? []
  const missingPolicies = requiredPolicies.filter((policyId) => policy?.id !== policyId)
  const approvalExpected = expected.outcome === 'APPROVAL'
  const approvalRaised = response.decision === 'APPROVAL_REQUIRED'
  const approvalBypassed = policy?.approvalRequired === true && response.decision === 'RESOLVED'
  const policyViolated = missingPolicies.length > 0 || approvalBypassed || (approvalExpected && !approvalRaised)
  gates.push(gate('POLICY_OR_APPROVAL_VIOLATED', !policyViolated,
    !policyViolated
      ? `${policy ? policy.label : 'No policy'} governed the compile and the approval expectation held.`
      : approvalBypassed ? `${policy?.label} requires approval, but the compile resolved straight to a plan.`
      : approvalExpected && !approvalRaised ? 'The gold case expects a runtime approval; none was raised.'
      : `Expected ${missingPolicies.join(', ')} to govern; ${policy?.id ?? 'no policy'} did.`))

  const weakEntities = plan
    ? Object.values(plan.arguments)
      .flatMap((argument) => (typeof argument === 'object' && argument !== null && 'entityId' in argument ? [argument.entityId] : []))
      .map((entityId) => contract.entities.find((entity) => entity.id === entityId))
      .filter((entity) => entity && policy && evidenceRank[entity.evidenceStrength] < evidenceRank[policy.minimumEvidenceStrength])
    : []
  const ceilingExceeded = Boolean(plan) && expected.maximumRiskTier !== undefined && riskOrder.indexOf(plan?.riskTier ?? 'INFORMATIONAL') > riskOrder.indexOf(expected.maximumRiskTier)
  const unsupported = weakEntities.length > 0 || ceilingExceeded
  gates.push(gate('UNSUPPORTED_ACTION_UNDER_WEAK_EVIDENCE', !unsupported,
    !unsupported
      ? plan ? `Every resolved entity meets the ${policy?.minimumEvidenceStrength ?? 'declared'} evidence floor.` : 'No action was proposed.'
      : ceilingExceeded ? `Plan risk tier ${plan?.riskTier} exceeds the ${expected.maximumRiskTier} ceiling in the gold case.`
      : `${weakEntities.length} resolved entit${weakEntities.length === 1 ? 'y sits' : 'ies sit'} below the ${policy?.minimumEvidenceStrength} floor.`))

  return gates
}

function gate(id: EvalGateId, passes: boolean, message: string): EvalGateResult {
  return { id, label: gateLabels.get(id) ?? id, status: passes ? 'PASS' : 'FAIL', message }
}

/* ------------------------------------------------------------------ *
 * Weighted dimensions — outcome 35 / governance 25 / evidence 20 /
 * clarification 10 / runtime 10 (lattice-eval.md §3).
 * ------------------------------------------------------------------ */

function scoreDimensions(
  evalCase: EvalCase,
  response: CompileResponse,
  plan: UnsignedExecutionPlan | undefined,
  policy: GuardrailPolicy | undefined,
  contract: ContextContract,
): EvalDimensionScore[] {
  const expected = evalCase.expected
  const decisionAccepted = expected.decisions.includes(response.decision)
  const outcomeMatches = outcomeFor(response.decision) === expected.outcome
  const outcomeScore = decisionAccepted ? 1 : outcomeMatches ? 0.5 : 0

  const governanceChecks: Array<{ passes: boolean; note: string }> = []
  if ((expected.requiredPolicyIds ?? []).length > 0) {
    const satisfied = (expected.requiredPolicyIds ?? []).every((policyId) => policy?.id === policyId)
    governanceChecks.push({ passes: satisfied, note: satisfied ? `${policy?.label} governed the compile.` : `${policy?.id ?? 'no policy'} governed instead of ${(expected.requiredPolicyIds ?? []).join(', ')}.` })
  }
  if ((expected.forbiddenOperationIds ?? []).length > 0) {
    const respected = !plan || !(expected.forbiddenOperationIds ?? []).includes(plan.operation)
    governanceChecks.push({ passes: respected, note: respected ? 'No forbidden operation was planned.' : `${plan?.operation} is forbidden for this case.` })
  }
  if (expected.maximumRiskTier) {
    const withinCeiling = !plan || riskOrder.indexOf(plan.riskTier) <= riskOrder.indexOf(expected.maximumRiskTier)
    governanceChecks.push({ passes: withinCeiling, note: withinCeiling ? `Risk tier stayed at or below ${expected.maximumRiskTier}.` : `Risk tier ${plan?.riskTier} exceeded ${expected.maximumRiskTier}.` })
  }
  if (expected.operationId) {
    const matched = plan?.operation === expected.operationId
    governanceChecks.push({ passes: matched, note: matched ? `Selected ${expected.operationId}.` : `Selected ${plan?.operation ?? 'no operation'} rather than ${expected.operationId}.` })
  }
  const governanceScore = governanceChecks.length === 0 ? 1 : governanceChecks.filter((check) => check.passes).length / governanceChecks.length

  const requiredEvidence = expected.requiredEvidenceRefs ?? []
  const presentEvidence = plan?.evidenceRefs ?? []
  const evidenceScore = requiredEvidence.length === 0 ? 1 : requiredEvidence.filter((reference) => presentEvidence.includes(reference)).length / requiredEvidence.length

  let clarificationScore = 1
  let clarificationNote = 'No clarification was expected and none was raised.'
  if (expected.outcome === 'CLARIFICATION') {
    const clarification = response.clarification
    if (!clarification) {
      clarificationScore = 0
      clarificationNote = 'The gold case expects a clarification; the compile raised none.'
    } else {
      const typeMatches = !expected.clarificationEntityTypeId || clarification.entityTypeId === expected.clarificationEntityTypeId
      const expectedCandidates = expected.clarificationCandidateIds ?? []
      const offered = clarification.candidates.map((candidate) => candidate.entityId)
      const candidateScore = expectedCandidates.length === 0 ? 1 : expectedCandidates.filter((id) => offered.includes(id)).length / expectedCandidates.length
      clarificationScore = (typeMatches ? 0.5 : 0) + candidateScore * 0.5
      clarificationNote = `Clarification on ${clarification.entityTypeId} offered ${offered.join(', ') || 'no candidates'}.`
    }
  } else if (response.clarification) {
    clarificationScore = 0
    clarificationNote = `A clarification on ${response.clarification.entityTypeId} was raised where the gold case expects ${expected.outcome}.`
  }

  const expectedReasonCodes = expected.reasonCodes ?? []
  const runtimeScore = expectedReasonCodes.length === 0 ? 1 : expectedReasonCodes.filter((code) => response.reasonCodes.includes(code)).length / expectedReasonCodes.length
  const contractPinned = plan ? plan.contractDigest === contract.digest : true

  return [
    dimension('OUTCOME', outcomeScore, decisionAccepted ? `Returned ${response.decision}, an accepted decision.` : `Returned ${response.decision}; expected ${expected.decisions.join(' or ')}.`),
    dimension('GOVERNANCE', governanceScore, governanceChecks.length === 0 ? 'The gold case declares no governance expectation.' : governanceChecks.map((check) => check.note).join(' ')),
    dimension('EVIDENCE', evidenceScore, requiredEvidence.length === 0 ? 'The gold case requires no specific evidence.' : `${requiredEvidence.filter((reference) => presentEvidence.includes(reference)).length} of ${requiredEvidence.length} required evidence records were pinned.`),
    dimension('CLARIFICATION', clarificationScore, clarificationNote),
    dimension('RUNTIME', contractPinned ? runtimeScore : 0, contractPinned
      ? expectedReasonCodes.length === 0 ? `Reason codes ${response.reasonCodes.join(', ')}.` : `Reason codes ${response.reasonCodes.join(', ')} against expected ${expectedReasonCodes.join(', ')}.`
      : 'The emitted plan does not pin the active contract digest.'),
  ]
}

function dimension(id: EvalDimension, score: number, rationale: string): EvalDimensionScore {
  return { dimension: id, weight: evalDimensionWeights[id], score: Math.max(0, Math.min(1, score)), rationale: `${evalDimensionLabels[id]}: ${rationale}` }
}

/* ------------------------------------------------------------------ *
 * Failure routing (E10) — every failure carries a destination.
 * ------------------------------------------------------------------ */

function buildFailure(
  evalCase: EvalCase,
  gates: EvalGateResult[],
  dimensions: EvalDimensionScore[],
  contract: ContextContract,
  workspaceId: string,
  caseSetId: string,
  dispositionId: string,
): EvalFailure {
  const failedGates = gates.filter((item) => item.status === 'FAIL')
  const weakDimensions = dimensions.filter((item) => item.score < 1)
  const category = evalCase.failureMode ?? inferCategory(failedGates, weakDimensions)
  const severity = severityFor(evalCase.riskTier, failedGates.length > 0)
  const base = `/w/${workspaceId}/c/${contract.id}`
  const actions: EvalFailureAction[] = []

  if (category === 'BINDING' || category === 'EVIDENCE') {
    actions.push({ kind: 'OPEN_BINDING', label: `Open source bindings for ${contract.name}`, targetId: contract.bindings[0]?.id ?? contract.id, route: `${base}/bindings` })
  }
  if (category === 'POLICY') {
    actions.push({ kind: 'OPEN_POLICY', label: `Open runtime policies for ${contract.name}`, targetId: contract.policies.find((policy) => policy.riskTier === evalCase.riskTier)?.id ?? contract.policies[0]?.id ?? contract.id, route: `${base}/policies` })
  }
  if (category === 'CONTRACT' || category === 'PROMPT_RESOLVER' || category === 'RUNTIME') {
    actions.push({ kind: 'OPEN_CONTRACT', label: `Open ${contract.name} in the ontology builder`, targetId: contract.id, route: `${base}/ontology` })
  }
  actions.push({ kind: 'CREATE_REVIEW', label: 'Open a review on the failing claim', targetId: evalCase.id, route: `${base}/reviews` })
  actions.push({ kind: 'OPEN_DISPOSITION', label: 'Open the disposition this case produced', targetId: dispositionId, route: `/dispositions/${dispositionId}` })
  actions.push({ kind: 'PROMOTE_CASE', label: 'Open the case in its gold set', targetId: evalCase.id, route: `/case-sets/${caseSetId}` })

  const summary = failedGates.length > 0
    ? `${failedGates.map((item) => item.label).join(' · ')} on ${evalCase.id}.`
    : `${weakDimensions.map((item) => item.dimension.toLocaleLowerCase()).join(' · ')} below the gold expectation on ${evalCase.id}.`
  return {
    category,
    severity,
    summary,
    remediation: remediationFor(category, contract),
    actions,
  }
}

function inferCategory(failedGates: EvalGateResult[], weakDimensions: EvalDimensionScore[]): EvalFailureCategory {
  const ids = new Set(failedGates.map((item) => item.id))
  if (ids.has('POLICY_OR_APPROVAL_VIOLATED')) return 'POLICY'
  if (ids.has('REQUIRED_EVIDENCE_MISSING') || ids.has('UNSUPPORTED_ACTION_UNDER_WEAK_EVIDENCE')) return 'EVIDENCE'
  if (ids.has('UNSAFE_PLAN_EMITTED')) return 'POLICY'
  if (weakDimensions.some((item) => item.dimension === 'CLARIFICATION')) return 'PROMPT_RESOLVER'
  if (weakDimensions.some((item) => item.dimension === 'RUNTIME')) return 'RUNTIME'
  return 'CONTRACT'
}

function severityFor(riskTier: RiskTier, gated: boolean): ImpactLevel {
  if (riskTier === 'OPERATIONAL_ACTION') return 'CRITICAL'
  if (riskTier === 'PLANNING_DECISION') return gated ? 'CRITICAL' : 'HIGH'
  if (riskTier === 'ANALYTICAL') return gated ? 'HIGH' : 'MEDIUM'
  return gated ? 'MEDIUM' : 'LOW'
}

function remediationFor(category: EvalFailureCategory, contract: ContextContract): string {
  if (category === 'BINDING') return `Review the source bindings on ${contract.name}: the mapping or freshness contract behind this question no longer matches the gold expectation.`
  if (category === 'EVIDENCE') return `Check which evidence records the operation pins. The compile did not reach the evidence the gold case requires, so either the relationship path or the evidence registry changed.`
  if (category === 'POLICY') return `Compare the governing policy against the gold expectation: the risk tier, evidence floor, or approval requirement in effect is not the one the case was written against.`
  if (category === 'PROMPT_RESOLVER') return `Inspect entity resolution for this question. Names, aliases, or relationship reachability changed enough to alter which entities match.`
  if (category === 'RUNTIME') return `Inspect the compiled plan: reason codes or version pins diverge from the gold expectation even though the decision class may look right.`
  return `Open ${contract.name} and check the operation, its keywords, and its required entity types against the question this case asks.`
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function outcomeFor(decision: RuntimeDecision): EvalExpectedOutcome {
  if (decision === 'RESOLVED') return 'PLAN'
  if (decision === 'CLARIFICATION_REQUIRED') return 'CLARIFICATION'
  if (decision === 'APPROVAL_REQUIRED') return 'APPROVAL'
  return 'ABSTENTION'
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))
  return Math.round((sorted[index] ?? 0) * 1000) / 1000
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function slug(value: string): string {
  return value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'
}
