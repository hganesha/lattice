import { createHash, randomUUID } from 'node:crypto'
import type { BindingPreview, CreateNegativeDecisionRequest, NegativeDecision } from '@lattice/contracts'
import { FileLedgerStorage, type LedgerStorage } from './governanceLedger.js'

/**
 * Negative decisions, kept as an append-only ledger.
 *
 * Withdrawing one used to rewrite it in place, which is the one thing this record cannot allow: a
 * mapping was refused, and later permitted, and the point of keeping the refusal is that both are
 * visible. A withdrawal is now a superseding artifact carrying the same decision id, and the
 * current state of a decision is the last artifact written for it.
 */
export class NegativeDecisionStore {
  constructor(private readonly storage: LedgerStorage<NegativeDecision>) {}

  static async open(filePath: string): Promise<NegativeDecisionStore> {
    return new NegativeDecisionStore(await FileLedgerStorage.open<NegativeDecision>(filePath, 'decisions', 'Negative decision'))
  }

  async list(query: { workspaceId?: string; contractId?: string } = {}, tenantId: string | undefined, now = new Date()): Promise<NegativeDecision[]> {
    const decisions = await this.current()
    return decisions
      .filter((decision) => decision.tenantId === tenantId && (!query.workspaceId || decision.workspaceId === query.workspaceId) && (!query.contractId || decision.contractId === query.contractId))
      .map((decision) => withStatus(decision, now))
      .reverse()
  }

  /** Everything still in force — the set discovery must consult before proposing a mapping. */
  async inForce(tenantId: string | undefined, now = new Date()): Promise<NegativeDecision[]> {
    const decisions = await this.list({}, tenantId, now)
    return decisions.filter((decision) => decision.status === 'ACTIVE' || decision.status === 'DUE_FOR_REVIEW')
  }

  async get(decisionId: string, tenantId: string | undefined, now = new Date()): Promise<NegativeDecision | undefined> {
    const decisions = await this.current()
    const decision = decisions.find((candidate) => candidate.id === decisionId && candidate.tenantId === tenantId)
    return decision ? withStatus(decision, now) : undefined
  }

  async create(request: CreateNegativeDecisionRequest, decidedBy: string, tenantId: string | undefined, now = new Date()): Promise<NegativeDecision> {
    const decidedAt = now.toISOString()
    const body: Omit<NegativeDecision, 'artifactDigest'> = {
      id: `negative_${randomUUID()}`,
      ...(tenantId ? { tenantId } : {}),
      workspaceId: request.workspaceId,
      ...(request.contractId ? { contractId: request.contractId } : {}),
      prohibited: structuredClone(request.prohibited),
      applicability: structuredClone(request.applicability),
      rationale: request.rationale,
      decidedBy,
      decidedAt,
      effectiveFrom: request.effectiveFrom ?? decidedAt,
      reviewBy: request.reviewBy,
      // The approver is the authenticated decider unless one is explicitly recorded server-side.
      exceptions: (request.exceptions ?? []).map((exception) => ({ ...exception, approvedBy: exception.approvedBy ?? decidedBy, id: `exception_${randomUUID()}`, approvedAt: decidedAt })),
      ...(request.reviewId ? { reviewId: request.reviewId } : {}),
      status: 'ACTIVE',
    }
    const decision: NegativeDecision = { ...body, artifactDigest: digest(body) }
    return withStatus(await this.storage.append(decision), now)
  }

  /** A negative decision is revisited, never permanent — withdrawal keeps the original rationale visible. */
  async withdraw(decisionId: string, rationale: string, withdrawnBy: string, tenantId: string | undefined, now = new Date()): Promise<NegativeDecision> {
    const decisions = await this.current()
    // Read raw rather than through `get`, so the check sees the recorded status and not the
    // derived one: a decision due for review has not been withdrawn.
    const existing = decisions.find((candidate) => candidate.id === decisionId && candidate.tenantId === tenantId)
    if (!existing) throw new Error('NEGATIVE_DECISION_NOT_FOUND')
    if (existing.status === 'WITHDRAWN') throw new Error('NEGATIVE_DECISION_ALREADY_WITHDRAWN')
    // The chain link is dropped: storage assigns the successor its own, and digesting the
    // predecessor's would leave the new artifact unverifiable.
    const { artifactDigest: _digest, chain: _chain, ...body } = existing
    const withdrawn = {
      ...body,
      rationale: `${existing.rationale}\n\nWithdrawn ${now.toISOString()} by ${withdrawnBy}: ${rationale}`,
      status: 'WITHDRAWN' as const,
    }
    // Keyed by the withdrawal, identified as the decision: a distinct row describing the same one.
    return this.storage.append({ ...withdrawn, artifactDigest: digest(withdrawn) }, `withdrawal_${randomUUID()}`)
  }

  /**
   * Folds the ledger down to the latest artifact for each decision.
   *
   * Ledger order is chain order, so the last artifact bearing a decision's id is its current state.
   */
  private async current(): Promise<NegativeDecision[]> {
    const byDecision = new Map<string, NegativeDecision>()
    for (const artifact of await this.storage.list()) byDecision.set(artifact.id, artifact)
    return [...byDecision.values()]
  }
}

export interface SuppressedProposal {
  operationId: string
  /** Present when the negative decision names a specific field rather than the whole source. */
  sourceField?: string
  negativeDecisionId: string
  prohibitedSubject: string
  rationale: string
  decidedBy: string
  reviewBy: string
  /** An unexpired exception keeps the proposal, and says so. */
  exceptionId?: string
}

/**
 * Consulted by binding discovery (E13): a mapping a reviewer already rejected is annotated,
 * never silently dropped — the caller still sees the proposal and why it is suppressed.
 */
export function consultNegativeDecisions(
  preview: BindingPreview,
  decisions: NegativeDecision[],
  context: { contractId?: string; workspaceId?: string; sourceName: string },
  now = new Date(),
): SuppressedProposal[] {
  const suppressed: SuppressedProposal[] = []
  const source = normalize(context.sourceName)

  for (const decision of decisions) {
    if (decision.status !== 'ACTIVE' && decision.status !== 'DUE_FOR_REVIEW') continue
    if (new Date(decision.effectiveFrom).getTime() > now.getTime()) continue
    if (decision.applicability.scope === 'CONTRACT' && decision.contractId && decision.contractId !== context.contractId) continue
    if (decision.applicability.scope === 'WORKSPACE' && decision.workspaceId !== context.workspaceId) continue

    const prohibitedSource = decision.prohibited.sourceSystem ? normalize(decision.prohibited.sourceSystem) : ''
    const sourceMatches = prohibitedSource.length > 0 && (source.includes(prohibitedSource) || prohibitedSource.includes(source))
    const fieldNeedle = normalize(decision.prohibited.targetPropertyId ?? decision.prohibited.subject)
    const exception = decision.exceptions.find((candidate) => new Date(candidate.expiresAt).getTime() > now.getTime())

    for (const operation of preview.operations) {
      const bindingMatches = decision.prohibited.bindingId === operation.operationId || decision.prohibited.bindingId === operation.id
      const matchedFields = operation.fields.filter((field) => fieldNeedle.length > 2 && (normalize(field.path).includes(fieldNeedle) || normalize(field.label).includes(fieldNeedle)))
      if (!sourceMatches && !bindingMatches && matchedFields.length === 0) continue
      const entry = {
        operationId: operation.operationId,
        negativeDecisionId: decision.id,
        prohibitedSubject: decision.prohibited.subject,
        rationale: decision.rationale,
        decidedBy: decision.decidedBy,
        reviewBy: decision.reviewBy,
        ...(exception ? { exceptionId: exception.id } : {}),
      }
      if (matchedFields.length > 0) for (const field of matchedFields) suppressed.push({ ...entry, sourceField: field.path })
      else suppressed.push(entry)
    }
  }
  return suppressed
}

/** Status is derived, not scheduled: the review date passing is what flips it. */
function withStatus(decision: NegativeDecision, now: Date): NegativeDecision {
  const clone = structuredClone(decision)
  if (clone.status === 'ACTIVE' && new Date(clone.reviewBy).getTime() <= now.getTime()) return { ...clone, status: 'DUE_FOR_REVIEW' }
  return clone
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
