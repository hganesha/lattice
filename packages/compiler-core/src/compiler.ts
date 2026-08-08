import { randomUUID } from 'node:crypto'
import type {
  CompileRequest,
  CompileResponse,
  ContextContract,
  ContextGrounding,
  EntityRecord,
  EvidenceStrength,
  GuardrailPolicy,
  IntentResolution,
  OperationDefinition,
  PinnedPurpose,
  RiskTier,
  UnsignedExecutionPlan,
} from '@lattice/contracts'
import { resolveLexicalIntent } from './intentResolver.js'

const evidenceRank: Record<EvidenceStrength, number> = {
  INSUFFICIENT: 0,
  WEAK: 1,
  MODERATE: 2,
  STRONG: 3,
  EXACT: 4,
}

export interface CompilerOptions {
  now?: () => Date
  id?: () => string
  planTtlMinutes?: number
  intentPolicy?: Partial<Record<RiskTier, Partial<IntentGate>>>
}

export interface CompileContext {
  intentResolution?: IntentResolution
  selectedOperationId?: string
  /**
   * Principal the plan is issued to. Signed into the plan and enforced when it is later
   * verified or executed, so a plan is a capability for one subject rather than a bearer token.
   * Compilation fails closed when a plan would be built without it.
   */
  principalId?: string
  /** Tenant the plan is issued within. Signed into the plan alongside the principal. */
  tenantId?: string
}

export interface IntentGate {
  minimumSupportedScore: number
  automaticAcceptanceScore: number
  minimumCandidateMargin: number
  confirmSemanticOnly: boolean
}

export class ContextCompiler {
  readonly contract: ContextContract
  private readonly now: () => Date
  private readonly id: () => string
  private readonly planTtlMinutes: number
  private readonly intentPolicy: Record<RiskTier, IntentGate>

  constructor(contract: ContextContract, options: CompilerOptions = {}) {
    this.contract = contract
    this.now = options.now ?? (() => new Date())
    this.id = options.id ?? randomUUID
    this.planTtlMinutes = options.planTtlMinutes ?? 10
    this.intentPolicy = mergeIntentPolicy(options.intentPolicy)
  }

  compile(request: CompileRequest, context: CompileContext = {}): CompileResponse {
    const resolutionId = `res_${this.id()}`
    const intentResolution = context.intentResolution ?? resolveLexicalIntent(request, this.contract)
    const respond = (decision: CompileResponse['decision'], reasonCodes: string[], explanation: string[]) =>
      this.response(resolutionId, decision, reasonCodes, explanation, intentResolution)

    if (request.contractVersion && request.contractVersion !== this.contract.version) {
      return respond('DENIED', ['CONTRACT_VERSION_MISMATCH'], [
        `Requested contract ${request.contractVersion}; active contract is ${this.contract.version}.`,
      ])
    }

    const selectedOperation = context.selectedOperationId
      ? this.contract.operations.find((operation) => operation.id === context.selectedOperationId)
      : undefined
    const selectedCandidate = context.selectedOperationId
      ? intentResolution.candidates.find((candidate) => candidate.operationId === context.selectedOperationId)
      : undefined
    if (context.selectedOperationId && (!selectedOperation || !selectedCandidate)) {
      return respond('DENIED', ['INVALID_OPERATION_SELECTION'], [
        `${context.selectedOperationId} is not a proposed operation in the active contract resolution.`,
      ])
    }

    const candidateOperations = intentResolution.candidates.flatMap((candidate) => {
      const operation = this.contract.operations.find((item) => item.id === candidate.operationId)
      return operation ? [{ candidate, operation }] : []
    })
    const strongest = candidateOperations[0]
    if (!selectedOperation && !strongest) {
      return respond('UNSUPPORTED', ['NO_SUPPORTED_OPERATION'], [
        'The question does not map to an operation published by this context contract.',
      ])
    }

    if (!selectedOperation && strongest) {
      const gate = this.intentPolicy[strongest.operation.riskTier]
      const runnerUp = candidateOperations[1]
      const margin = strongest.candidate.aggregateScore - (runnerUp?.candidate.aggregateScore ?? 0)
      if (strongest.candidate.aggregateScore < gate.minimumSupportedScore) {
        return respond('UNSUPPORTED', ['NO_SUPPORTED_OPERATION'], [
          `The closest operation was ${strongest.operation.label} at ${strongest.candidate.aggregateScore.toFixed(3)}, below the supported-intent threshold ${gate.minimumSupportedScore.toFixed(3)}.`,
        ])
      }

      const semanticOnlyConfirmation = gate.confirmSemanticOnly
        && strongest.candidate.lexicalScore === 0
        && (strongest.candidate.semanticScore ?? 0) > 0
      const belowAcceptance = strongest.candidate.aggregateScore < gate.automaticAcceptanceScore
      const ambiguous = Boolean(runnerUp) && margin < gate.minimumCandidateMargin
      if (semanticOnlyConfirmation || belowAcceptance || ambiguous) {
        const candidates = candidateOperations
          .filter(({ candidate }) => candidate.aggregateScore >= gate.minimumSupportedScore)
          .slice(0, 3)
          .map(({ candidate, operation }) => ({
            operationId: operation.id,
            label: operation.label,
            description: operation.description,
            riskTier: operation.riskTier,
            expectedAnswerShape: this.contract.competencyQuestions.find((question) => question.operationId === operation.id)?.expectedAnswerShape ?? operation.expectedResultSchema,
            score: candidate.aggregateScore,
            rationale: candidate.rationale,
          }))
        return {
          ...respond('CLARIFICATION_REQUIRED', [
            semanticOnlyConfirmation ? 'SEMANTIC_OPERATION_CONFIRMATION_REQUIRED' : ambiguous ? 'AMBIGUOUS_OPERATION' : 'LOW_INTENT_CONFIDENCE',
          ], [
            semanticOnlyConfirmation
              ? `${strongest.operation.label} was proposed only by semantic similarity and requires explicit confirmation at ${strongest.operation.riskTier.toLocaleLowerCase().replaceAll('_', ' ')} risk.`
              : ambiguous
                ? `Multiple governed operations are plausible; the leading margin ${margin.toFixed(3)} is below ${gate.minimumCandidateMargin.toFixed(3)}.`
                : `${strongest.operation.label} is plausible, but its score ${strongest.candidate.aggregateScore.toFixed(3)} is below the automatic threshold ${gate.automaticAcceptanceScore.toFixed(3)}.`,
          ]),
          clarification: {
            kind: 'OPERATION',
            id: `clar_${this.id()}`,
            prompt: 'Which governed operation best matches what you want to do?',
            candidates,
          },
        }
      }
    }

    const operation = selectedOperation ?? strongest?.operation
    if (!operation) {
      return respond('UNSUPPORTED', ['NO_SUPPORTED_OPERATION'], [
        'The question does not map to an operation published by this context contract.',
      ])
    }

    const policy = this.contract.policies.find((candidate) => candidate.riskTier === operation.riskTier)
    if (!policy) {
      return respond('DENIED', ['POLICY_PROFILE_MISSING'], [
        `${operation.label} has no approved runtime policy for ${operation.riskTier.toLocaleLowerCase().replaceAll('_', ' ')} risk.`,
      ])
    }
    if (!['APPROVED', 'APPROVED_WITH_EXCEPTION'].includes(policy.approvalStatus)) {
      return respond('DENIED', ['POLICY_NOT_APPROVED'], [
        `${policy.label} must be approved before it can govern runtime compilation.`,
      ])
    }

    const purpose = this.resolvePurpose(request, policy)
    if ('reasonCode' in purpose) {
      return respond('DENIED', [purpose.reasonCode], [purpose.explanation])
    }

    const argumentsByType: Record<string, EntityRecord> = {}

    for (const typeId of operation.requiredEntityTypes) {
      const selectedId = request.selections?.[typeId]
      const selected = selectedId
        ? this.contract.entities.find((entity) => entity.id === selectedId && entity.typeId === typeId)
        : undefined

      if (selectedId && !selected) {
        return respond('DENIED', ['INVALID_ENTITY_SELECTION'], [
          `${selectedId} is not a valid ${typeId} in the active contract.`,
        ])
      }

      const lexicalCandidates = selected ? [selected] : this.resolveEntities(request.question, typeId)
      const candidates = lexicalCandidates.length > 0 ? lexicalCandidates : this.resolveRelatedEntities(argumentsByType, typeId)

      if (candidates.length === 0) {
        return respond('INSUFFICIENT_EVIDENCE', ['REQUIRED_ENTITY_UNRESOLVED'], [
          `No evidenced ${typeId} could be resolved from the question.`,
        ])
      }

      if (candidates.length > 1) {
        const clarificationId = `clar_${this.id()}`
        return {
          ...respond('CLARIFICATION_REQUIRED', ['AMBIGUOUS_ENTITY'], [
            `Multiple ${typeId} records match the language in the question.`,
          ]),
          clarification: {
            kind: 'ENTITY',
            id: clarificationId,
            prompt: `Which ${typeId.replaceAll('_', ' ')} did you mean?`,
            entityTypeId: typeId,
            candidates: candidates.map((entity) => ({
              entityId: entity.id,
              label: entity.label,
              typeId: entity.typeId,
              evidenceStrength: entity.evidenceStrength,
              rationale: `Matched a governed name or alias; supported by ${entity.evidenceRefs.length} evidence record(s).`,
            })),
          },
        }
      }

      const entity = candidates[0]
      if (!entity) continue
      if (evidenceRank[entity.evidenceStrength] < evidenceRank[policy.minimumEvidenceStrength]) {
        return respond('INSUFFICIENT_EVIDENCE', ['EVIDENCE_BELOW_POLICY_THRESHOLD'], [
          `${entity.label} has ${entity.evidenceStrength.toLowerCase()} evidence; ${policy.minimumEvidenceStrength.toLowerCase()} is required.`,
        ])
      }

      argumentsByType[typeId] = entity
    }

    const invalidEvidence = Object.values(argumentsByType)
      .flatMap((entity) => entity.evidenceRefs)
      .map((evidenceId) => this.contract.evidence.find((item) => item.id === evidenceId))
      .filter((evidence) => evidence && evidence.validUntil && new Date(evidence.validUntil) < this.asOf(request))

    if (invalidEvidence.length > 0) {
      return respond('STALE_CONTEXT', ['EVIDENCE_OUTSIDE_VALIDITY_WINDOW'], [
        'One or more required evidence records are outside their declared validity window.',
      ])
    }

    const asOf = this.asOf(request)
    const staleEvidence = Object.values(argumentsByType)
      .flatMap((entity) => entity.evidenceRefs)
      .map((evidenceId) => this.contract.evidence.find((item) => item.id === evidenceId))
      .filter((evidence) => evidence && asOf.getTime() - new Date(evidence.observedAt).getTime() > policy.maximumEvidenceAgeMinutes * 60_000)

    if (staleEvidence.length > 0) {
      return respond('STALE_CONTEXT', ['EVIDENCE_EXCEEDS_POLICY_FRESHNESS'], [
        `${staleEvidence.length} evidence record${staleEvidence.length === 1 ? '' : 's'} exceed the ${policy.maximumEvidenceAgeMinutes}-minute freshness window in ${policy.label}.`,
      ])
    }

    const principalId = context.principalId
    if (!principalId) {
      return respond('DENIED', ['PLAN_SUBJECT_REQUIRED'], [
        'An execution plan cannot be issued without an authenticated principal to bind it to.',
      ])
    }

    const grounding = this.groundingFor(argumentsByType)
    const subject = { principalId, ...(context.tenantId ? { tenantId: context.tenantId } : {}) }
    const plan = this.buildPlan(resolutionId, operation, argumentsByType, intentResolution, Boolean(selectedOperation), subject, grounding, purpose.purpose)

    if (policy.approvalRequired) {
      return {
        ...respond('APPROVAL_REQUIRED', ['RUNTIME_APPROVAL_REQUIRED'], [
          `${policy.label} requires a human approval before ${operation.label} can execute.`,
        ]),
        grounding,
        pendingPlan: plan,
      }
    }

    return {
      ...respond('RESOLVED', ['CONTEXT_COMPILED'], [
        `Resolved ${operation.label} against ${this.contract.name}.`,
        'Semantic, policy, source-binding, and evidence versions are pinned in the plan.',
        ...(grounding === 'SIMULATED'
          ? ['Context was resolved from documented sample payloads, not live source reads.']
          : []),
      ]),
      grounding,
      plan,
    }
  }

  /**
   * Resolves the declared purpose a decision is compiled under.
   *
   * Purpose limitation only means something if an unrecognized or impermissible purpose stops
   * the decision, so this fails closed on both. A policy that does not require a purpose still
   * pins one when the caller names it, because an audit trail benefits either way.
   */
  private resolvePurpose(
    request: CompileRequest,
    policy: GuardrailPolicy,
  ): { purpose?: PinnedPurpose } | { reasonCode: string; explanation: string } {
    const stated = request.purpose?.trim()
    const purposeId = request.purposeId?.trim()

    if (!purposeId) {
      if (policy.purposeRequired) {
        const available = (this.contract.purposes ?? []).map((candidate) => candidate.id)
        return {
          reasonCode: 'PURPOSE_REQUIRED',
          explanation: available.length > 0
            ? `${policy.label} requires a declared purpose. This contract permits: ${available.join(', ')}.`
            : `${policy.label} requires a declared purpose, but this contract declares none.`,
        }
      }
      return {}
    }

    const declared = (this.contract.purposes ?? []).find((candidate) => candidate.id === purposeId)
    if (!declared) {
      return {
        reasonCode: 'PURPOSE_NOT_DECLARED',
        explanation: `${purposeId} is not a purpose declared by ${this.contract.name}.`,
      }
    }

    const permitted = policy.permittedPurposeIds ?? []
    if (permitted.length > 0 && !permitted.includes(declared.id)) {
      return {
        reasonCode: 'PURPOSE_NOT_PERMITTED_AT_RISK_TIER',
        explanation: `${declared.label} is not permitted for ${policy.label}; permitted purposes are ${permitted.join(', ')}.`,
      }
    }

    return {
      purpose: {
        id: declared.id,
        label: declared.label,
        ...(declared.obligations?.length ? { obligations: [...declared.obligations] } : {}),
        ...(declared.jurisdictions?.length ? { jurisdictions: [...declared.jurisdictions] } : {}),
        ...(declared.retentionDays !== undefined ? { retentionDays: declared.retentionDays } : {}),
        ...(stated ? { statedPurpose: stated } : {}),
      },
    }
  }

  /**
   * A decision is only as live as its weakest supporting record: one simulated evidence
   * record makes the whole resolution simulated.
   */
  private groundingFor(argumentsByType: Record<string, EntityRecord>): ContextGrounding {
    const simulated = Object.values(argumentsByType)
      .flatMap((entity) => entity.evidenceRefs)
      .some((evidenceId) => this.contract.evidence.find((item) => item.id === evidenceId)?.status === 'SIMULATED')
    return simulated ? 'SIMULATED' : 'LIVE'
  }

  private response(
    resolutionId: string,
    decision: CompileResponse['decision'],
    reasonCodes: string[],
    explanation: string[],
    intentResolution?: IntentResolution,
  ): CompileResponse {
    return { resolutionId, decision, reasonCodes, explanation, versions: this.contract.versions, ...(intentResolution ? { intentResolution } : {}) }
  }

  private resolveEntities(question: string, typeId: string): EntityRecord[] {
    const normalizedQuestion = normalize(question)
    const questionTokens = new Set(normalizedQuestion.split(' ').filter((token) => token.length > 2))
    const entities = this.contract.entities.filter((entity) => entity.typeId === typeId)
    const matches = entities
      .map((entity) => {
        const phrases = [entity.label, ...entity.aliases].map(normalize)
        const phraseScore = Math.max(
          ...phrases.map((phrase) => (normalizedQuestion.includes(phrase) ? phrase.split(' ').length : 0)),
        )
        const tokenScore = Math.max(
          ...phrases.map((phrase) => phrase.split(' ').filter((token) => questionTokens.has(token)).length),
        )
        return { entity, phraseScore, tokenScore }
      })
      .filter(({ phraseScore, tokenScore }) => phraseScore > 0 || tokenScore > 0)

    const strongestPhrase = Math.max(0, ...matches.map((match) => match.phraseScore))
    if (strongestPhrase > 1) {
      return matches.filter((match) => match.phraseScore === strongestPhrase).map((match) => match.entity)
    }

    const strongestToken = Math.max(strongestPhrase, ...matches.map((match) => match.tokenScore))
    return matches
      .filter((match) => Math.max(match.phraseScore, match.tokenScore) === strongestToken)
      .map((match) => match.entity)
  }

  private resolveRelatedEntities(argumentsByType: Record<string, EntityRecord>, targetTypeId: string): EntityRecord[] {
    const resolvedIds = new Set(Object.values(argumentsByType).map((entity) => entity.id))
    const relatedIds = new Set<string>()
    for (const relationship of this.contract.relationships) {
      if (resolvedIds.has(relationship.sourceEntityId)) relatedIds.add(relationship.targetEntityId)
      if (resolvedIds.has(relationship.targetEntityId)) relatedIds.add(relationship.sourceEntityId)
    }
    return this.contract.entities.filter((entity) => entity.typeId === targetTypeId && relatedIds.has(entity.id))
  }

  private buildPlan(
    resolutionId: string,
    operation: OperationDefinition,
    argumentsByType: Record<string, EntityRecord>,
    intentResolution: IntentResolution,
    operationConfirmed: boolean,
    subject: { principalId: string; tenantId?: string },
    grounding: ContextGrounding,
    purpose: PinnedPurpose | undefined,
  ): UnsignedExecutionPlan {
    const now = this.now()
    const evidenceRefs = new Set(Object.values(argumentsByType).flatMap((entity) => entity.evidenceRefs))
    const selectedEntityIds = new Set(Object.values(argumentsByType).map((entity) => entity.id))

    for (const relation of this.contract.relationships) {
      if (selectedEntityIds.has(relation.sourceEntityId) || selectedEntityIds.has(relation.targetEntityId)) {
        relation.evidenceRefs.forEach((evidenceId) => evidenceRefs.add(evidenceId))
      }
    }

    return {
      schemaVersion: '1.1',
      planId: `plan_${this.id()}`,
      resolutionId,
      decision: 'RESOLVED',
      riskTier: operation.riskTier,
      principalId: subject.principalId,
      ...(subject.tenantId ? { tenantId: subject.tenantId } : {}),
      grounding,
      ...(purpose ? { purpose } : {}),
      operation: operation.id,
      intent: intentDecisionEvidence(intentResolution, operation.id, this.intentPolicy[operation.riskTier], operationConfirmed),
      arguments: Object.fromEntries(
        Object.entries(argumentsByType).map(([typeId, entity]) => [typeId, { entityId: entity.id }]),
      ),
      metrics: operation.metricIds.map((metricId) => {
        const metric = this.contract.metrics.find((candidate) => candidate.id === metricId)
        return { id: metricId, version: metric?.version ?? 'unknown' }
      }),
      sourceBindings: operation.sourceBindingIds,
      requiredPermissions: operation.requiredPermissions,
      expectedResultSchema: operation.expectedResultSchema,
      evidenceRefs: [...evidenceRefs].sort(),
      versions: this.contract.versions,
      contractDigest: this.contract.digest,
      expiresAt: new Date(now.getTime() + this.planTtlMinutes * 60_000).toISOString(),
      nonce: this.id(),
    }
  }

  private asOf(request: CompileRequest): Date {
    return request.asOf ? new Date(request.asOf) : this.now()
  }
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const defaultIntentPolicy: Record<RiskTier, IntentGate> = {
  INFORMATIONAL: {
    minimumSupportedScore: 0.52,
    automaticAcceptanceScore: 0.76,
    minimumCandidateMargin: 0.05,
    confirmSemanticOnly: false,
  },
  ANALYTICAL: {
    minimumSupportedScore: 0.56,
    automaticAcceptanceScore: 0.82,
    minimumCandidateMargin: 0.08,
    confirmSemanticOnly: false,
  },
  PLANNING_DECISION: {
    minimumSupportedScore: 0.62,
    automaticAcceptanceScore: 0.88,
    minimumCandidateMargin: 0.12,
    confirmSemanticOnly: true,
  },
  OPERATIONAL_ACTION: {
    minimumSupportedScore: 0.68,
    automaticAcceptanceScore: 0.93,
    minimumCandidateMargin: 0.16,
    confirmSemanticOnly: true,
  },
}

function mergeIntentPolicy(overrides: CompilerOptions['intentPolicy']): Record<RiskTier, IntentGate> {
  return Object.fromEntries(Object.entries(defaultIntentPolicy).map(([riskTier, policy]) => [
    riskTier,
    { ...policy, ...(overrides?.[riskTier as RiskTier] ?? {}) },
  ])) as Record<RiskTier, IntentGate>
}

function intentDecisionEvidence(
  intentResolution: IntentResolution,
  operationId: string,
  gate: IntentGate,
  operationConfirmed: boolean,
): UnsignedExecutionPlan['intent'] {
  const candidate = intentResolution.candidates.find((item) => item.operationId === operationId)
  const strongestOther = intentResolution.candidates.find((item) => item.operationId !== operationId)
  return {
    resolverVersion: intentResolution.resolverVersion,
    method: intentResolution.method,
    indexDigest: intentResolution.indexDigest,
    ...(intentResolution.modelVersion ? { modelVersion: intentResolution.modelVersion } : {}),
    operationId,
    matchedQuestionIds: candidate?.matchedQuestionIds ?? [],
    lexicalScore: candidate?.lexicalScore ?? 0,
    ...(candidate?.semanticScore !== undefined ? { semanticScore: candidate.semanticScore } : {}),
    aggregateScore: candidate?.aggregateScore ?? 0,
    acceptance: operationConfirmed ? 'USER_CONFIRMED' : 'AUTOMATIC',
    candidateMargin: (candidate?.aggregateScore ?? 0) - (strongestOther?.aggregateScore ?? 0),
    thresholds: {
      minimumSupportedScore: gate.minimumSupportedScore,
      automaticAcceptanceScore: gate.automaticAcceptanceScore,
      minimumCandidateMargin: gate.minimumCandidateMargin,
    },
  }
}
