import { randomUUID } from 'node:crypto'
import type {
  CompileRequest,
  CompileResponse,
  ContextContract,
  EntityRecord,
  EvidenceStrength,
  OperationDefinition,
  UnsignedExecutionPlan,
} from '@lattice/contracts'

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
}

export class ContextCompiler {
  readonly contract: ContextContract
  private readonly now: () => Date
  private readonly id: () => string
  private readonly planTtlMinutes: number

  constructor(contract: ContextContract, options: CompilerOptions = {}) {
    this.contract = contract
    this.now = options.now ?? (() => new Date())
    this.id = options.id ?? randomUUID
    this.planTtlMinutes = options.planTtlMinutes ?? 10
  }

  compile(request: CompileRequest): CompileResponse {
    const resolutionId = `res_${this.id()}`
    const operation = this.selectOperation(request.question)

    if (!operation) {
      return this.response(resolutionId, 'UNSUPPORTED', ['NO_SUPPORTED_OPERATION'], [
        'The question does not map to an operation published by this context contract.',
      ])
    }

    if (request.contractVersion && request.contractVersion !== this.contract.version) {
      return this.response(resolutionId, 'DENIED', ['CONTRACT_VERSION_MISMATCH'], [
        `Requested contract ${request.contractVersion}; active contract is ${this.contract.version}.`,
      ])
    }

    const policy = this.contract.policies.find((candidate) => candidate.riskTier === operation.riskTier)
    if (!policy) {
      return this.response(resolutionId, 'DENIED', ['POLICY_PROFILE_MISSING'], [
        `${operation.label} has no approved runtime policy for ${operation.riskTier.toLocaleLowerCase().replaceAll('_', ' ')} risk.`,
      ])
    }
    if (!['APPROVED', 'APPROVED_WITH_EXCEPTION'].includes(policy.approvalStatus)) {
      return this.response(resolutionId, 'DENIED', ['POLICY_NOT_APPROVED'], [
        `${policy.label} must be approved before it can govern runtime compilation.`,
      ])
    }

    const argumentsByType: Record<string, EntityRecord> = {}

    for (const typeId of operation.requiredEntityTypes) {
      const selectedId = request.selections?.[typeId]
      const selected = selectedId
        ? this.contract.entities.find((entity) => entity.id === selectedId && entity.typeId === typeId)
        : undefined

      if (selectedId && !selected) {
        return this.response(resolutionId, 'DENIED', ['INVALID_ENTITY_SELECTION'], [
          `${selectedId} is not a valid ${typeId} in the active contract.`,
        ])
      }

      const lexicalCandidates = selected ? [selected] : this.resolveEntities(request.question, typeId)
      const candidates = lexicalCandidates.length > 0 ? lexicalCandidates : this.resolveRelatedEntities(argumentsByType, typeId)

      if (candidates.length === 0) {
        return this.response(resolutionId, 'INSUFFICIENT_EVIDENCE', ['REQUIRED_ENTITY_UNRESOLVED'], [
          `No evidenced ${typeId} could be resolved from the question.`,
        ])
      }

      if (candidates.length > 1) {
        const clarificationId = `clar_${this.id()}`
        return {
          ...this.response(resolutionId, 'CLARIFICATION_REQUIRED', ['AMBIGUOUS_ENTITY'], [
            `Multiple ${typeId} records match the language in the question.`,
          ]),
          clarification: {
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
        return this.response(resolutionId, 'INSUFFICIENT_EVIDENCE', ['EVIDENCE_BELOW_POLICY_THRESHOLD'], [
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
      return this.response(resolutionId, 'STALE_CONTEXT', ['EVIDENCE_OUTSIDE_VALIDITY_WINDOW'], [
        'One or more required evidence records are outside their declared validity window.',
      ])
    }

    const asOf = this.asOf(request)
    const staleEvidence = Object.values(argumentsByType)
      .flatMap((entity) => entity.evidenceRefs)
      .map((evidenceId) => this.contract.evidence.find((item) => item.id === evidenceId))
      .filter((evidence) => evidence && asOf.getTime() - new Date(evidence.observedAt).getTime() > policy.maximumEvidenceAgeMinutes * 60_000)

    if (staleEvidence.length > 0) {
      return this.response(resolutionId, 'STALE_CONTEXT', ['EVIDENCE_EXCEEDS_POLICY_FRESHNESS'], [
        `${staleEvidence.length} evidence record${staleEvidence.length === 1 ? '' : 's'} exceed the ${policy.maximumEvidenceAgeMinutes}-minute freshness window in ${policy.label}.`,
      ])
    }

    if (policy.approvalRequired) {
      return {
        ...this.response(resolutionId, 'APPROVAL_REQUIRED', ['RUNTIME_APPROVAL_REQUIRED'], [
          `${policy.label} requires a human approval before ${operation.label} can execute.`,
        ]),
        pendingPlan: this.buildPlan(resolutionId, operation, argumentsByType),
      }
    }

    const plan = this.buildPlan(resolutionId, operation, argumentsByType)
    return {
      ...this.response(resolutionId, 'RESOLVED', ['CONTEXT_COMPILED'], [
        `Resolved ${operation.label} against ${this.contract.name}.`,
        'Semantic, policy, source-binding, and evidence versions are pinned in the plan.',
      ]),
      plan,
    }
  }

  private response(
    resolutionId: string,
    decision: CompileResponse['decision'],
    reasonCodes: string[],
    explanation: string[],
  ): CompileResponse {
    return { resolutionId, decision, reasonCodes, explanation, versions: this.contract.versions }
  }

  private selectOperation(question: string): OperationDefinition | undefined {
    const normalizedQuestion = normalize(question)
    const scored = this.contract.operations
      .map((operation) => ({
        operation,
        score: operation.keywords.reduce(
          (score, keyword) => score + (normalizedQuestion.includes(normalize(keyword)) ? keyword.split(/\s+/).length : 0),
          0,
        ),
      }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.operation.id.localeCompare(right.operation.id))

    return scored[0]?.operation
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
      schemaVersion: '1.0',
      planId: `plan_${this.id()}`,
      resolutionId,
      decision: 'RESOLVED',
      riskTier: operation.riskTier,
      operation: operation.id,
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
