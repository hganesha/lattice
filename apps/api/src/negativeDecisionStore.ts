import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { BindingPreview, CreateNegativeDecisionRequest, NegativeDecision } from '@lattice/contracts'

interface NegativeDecisionDocument {
  schemaVersion: '1.0'
  decisions: NegativeDecision[]
}

export class NegativeDecisionStore {
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(private readonly filePath: string, private document: NegativeDecisionDocument) {}

  static async open(filePath: string): Promise<NegativeDecisionStore> {
    try {
      return new NegativeDecisionStore(filePath, JSON.parse(await readFile(filePath, 'utf8')) as NegativeDecisionDocument)
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
      const store = new NegativeDecisionStore(filePath, { schemaVersion: '1.0', decisions: [] })
      await store.persist()
      return store
    }
  }

  list(query: { workspaceId?: string; contractId?: string } = {}, now = new Date()): NegativeDecision[] {
    return this.document.decisions
      .filter((decision) => (!query.workspaceId || decision.workspaceId === query.workspaceId) && (!query.contractId || decision.contractId === query.contractId))
      .map((decision) => withStatus(decision, now))
      .reverse()
  }

  /** Everything still in force — the set discovery must consult before proposing a mapping. */
  inForce(now = new Date()): NegativeDecision[] {
    return this.list({}, now).filter((decision) => decision.status === 'ACTIVE' || decision.status === 'DUE_FOR_REVIEW')
  }

  get(decisionId: string, now = new Date()): NegativeDecision | undefined {
    const decision = this.document.decisions.find((candidate) => candidate.id === decisionId)
    return decision ? withStatus(decision, now) : undefined
  }

  async create(request: CreateNegativeDecisionRequest, decidedBy: string, now = new Date()): Promise<NegativeDecision> {
    const decidedAt = now.toISOString()
    const body: Omit<NegativeDecision, 'artifactDigest'> = {
      id: `negative_${randomUUID()}`,
      workspaceId: request.workspaceId,
      ...(request.contractId ? { contractId: request.contractId } : {}),
      prohibited: structuredClone(request.prohibited),
      applicability: structuredClone(request.applicability),
      rationale: request.rationale,
      decidedBy,
      decidedAt,
      effectiveFrom: request.effectiveFrom ?? decidedAt,
      reviewBy: request.reviewBy,
      exceptions: (request.exceptions ?? []).map((exception) => ({ ...exception, id: `exception_${randomUUID()}`, approvedAt: decidedAt })),
      ...(request.reviewId ? { reviewId: request.reviewId } : {}),
      status: 'ACTIVE',
    }
    const decision: NegativeDecision = { ...body, artifactDigest: digest(body) }
    this.document.decisions.push(decision)
    await this.persist()
    return withStatus(decision, now)
  }

  /** A negative decision is revisited, never permanent — withdrawal keeps the original rationale visible. */
  async withdraw(decisionId: string, rationale: string, withdrawnBy: string, now = new Date()): Promise<NegativeDecision> {
    const index = this.document.decisions.findIndex((candidate) => candidate.id === decisionId)
    const existing = this.document.decisions[index]
    if (!existing) throw new Error('NEGATIVE_DECISION_NOT_FOUND')
    if (existing.status === 'WITHDRAWN') throw new Error('NEGATIVE_DECISION_ALREADY_WITHDRAWN')
    const { artifactDigest: _digest, ...body } = existing
    const withdrawn: NegativeDecision = {
      ...body,
      rationale: `${existing.rationale}\n\nWithdrawn ${now.toISOString()} by ${withdrawnBy}: ${rationale}`,
      status: 'WITHDRAWN',
      artifactDigest: digest({ ...body, status: 'WITHDRAWN' }),
    }
    this.document.decisions[index] = withdrawn
    await this.persist()
    return structuredClone(withdrawn)
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true })
      const temporaryPath = `${this.filePath}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify(this.document, null, 2)}\n`, 'utf8')
      await rename(temporaryPath, this.filePath)
    })
    await this.writeQueue
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
