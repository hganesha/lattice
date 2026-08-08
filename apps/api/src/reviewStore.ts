import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  CreateReviewRequest,
  ImpactLevel,
  ReviewDecisionArtifact,
  ReviewDecisionValue,
  ReviewRequestArtifact,
  ReviewRoutingPlan,
  StructuredRejection,
} from '@lattice/contracts'

interface ReviewDocument {
  schemaVersion: '1.0'
  reviews: ReviewRequestArtifact[]
}

export interface ReviewQuery {
  contractId?: string
  workspaceId?: string
  status?: ReviewRequestArtifact['status']
  assignedRole?: string
}

export interface DecisionExtras {
  structuredRejection?: StructuredRejection
  negativeDecisionId?: string
}

export class ReviewStore {
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(private readonly filePath: string, private document: ReviewDocument) {}

  static async open(filePath: string): Promise<ReviewStore> {
    try {
      const store = new ReviewStore(filePath, JSON.parse(await readFile(filePath, 'utf8')) as ReviewDocument)
      await store.backfillRouting()
      return store
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
      const store = new ReviewStore(filePath, { schemaVersion: '1.0', reviews: [] })
      await store.persist()
      return store
    }
  }

  list(contractId: string): ReviewRequestArtifact[] {
    return this.query({ contractId })
  }

  /** The cross-contract inbox (E12): a workspace scope and role filter, not just one contract. */
  query(query: ReviewQuery): ReviewRequestArtifact[] {
    return this.document.reviews
      .filter((review) => (!query.contractId || review.contractId === query.contractId)
        && (!query.workspaceId || review.workspaceId === query.workspaceId)
        && (!query.status || review.status === query.status)
        && (!query.assignedRole || (review.routingPlan?.assignments ?? []).some((assignment) => assignment.role === query.assignedRole)))
      .map((review) => structuredClone(review))
      .reverse()
  }

  all(): ReviewRequestArtifact[] {
    return this.document.reviews.map((review) => structuredClone(review))
  }

  get(reviewId: string): ReviewRequestArtifact | undefined {
    const review = this.document.reviews.find((candidate) => candidate.id === reviewId)
    return review ? structuredClone(review) : undefined
  }

  async create(input: CreateReviewRequest & { workspaceId?: string }, submittedBy: string, now = new Date()): Promise<ReviewRequestArtifact> {
    const existing = this.document.reviews.find((review) => review.contractId === input.contractId && review.targetKind === input.targetKind && review.targetId === input.targetId && review.status === 'OPEN')
    if (existing) return structuredClone(existing)
    const submittedAt = now.toISOString()
    const { workspaceId, ...request } = input
    const unsigned = { ...request, submittedAt, submittedBy }
    const review: ReviewRequestArtifact = {
      id: `review_${randomUUID()}`,
      ...unsigned,
      ...(workspaceId ? { workspaceId } : {}),
      status: 'OPEN',
      artifactDigest: digest(unsigned),
      routingPlan: routingPlanFor(input.impact, submittedAt),
    }
    this.document.reviews.push(review)
    await this.persist()
    return structuredClone(review)
  }

  async decide(reviewId: string, decision: ReviewDecisionValue, rationale: string, decidedBy: string, now = new Date(), extras: DecisionExtras = {}): Promise<ReviewRequestArtifact> {
    const index = this.document.reviews.findIndex((review) => review.id === reviewId)
    const review = this.document.reviews[index]
    if (!review) throw new Error('REVIEW_NOT_FOUND')
    if (review.status === 'DECIDED') throw new Error('REVIEW_ALREADY_DECIDED')
    const decidedAt = now.toISOString()
    const unsignedDecision = { reviewId, decision, rationale, decidedAt, decidedBy }
    const artifact: ReviewDecisionArtifact = {
      id: `decision_${randomUUID()}`,
      ...unsignedDecision,
      artifactDigest: digest(unsignedDecision),
      ...(extras.structuredRejection ? { structuredRejection: structuredClone(extras.structuredRejection) } : {}),
      ...(extras.negativeDecisionId ? { negativeDecisionId: extras.negativeDecisionId } : {}),
    }
    const routingPlan = review.routingPlan
      ? {
        ...review.routingPlan,
        assignments: review.routingPlan.assignments.map((assignment, position) => (position === 0
          ? { ...assignment, status: decision === 'REJECTED' ? 'REJECTED' as const : 'APPROVED' as const, decidedAt }
          : assignment)),
      }
      : undefined
    const decided: ReviewRequestArtifact = { ...review, status: 'DECIDED', decision: artifact, ...(routingPlan ? { routingPlan } : {}) }
    this.document.reviews[index] = decided
    await this.persist()
    return structuredClone(decided)
  }

  /** Out-of-office delegation (E12) — the assignment moves, the review does not restart. */
  async delegate(reviewId: string, role: string, toPrincipalId: string, reason: string, now = new Date()): Promise<ReviewRequestArtifact> {
    const index = this.document.reviews.findIndex((review) => review.id === reviewId)
    const review = this.document.reviews[index]
    if (!review) throw new Error('REVIEW_NOT_FOUND')
    if (review.status === 'DECIDED') throw new Error('REVIEW_ALREADY_DECIDED')
    const plan = review.routingPlan ?? routingPlanFor(review.impact, review.submittedAt)
    if (!plan.assignments.some((assignment) => assignment.role === role)) throw new Error('REVIEW_ROLE_NOT_ASSIGNED')
    const routingPlan: ReviewRoutingPlan = {
      ...plan,
      assignments: plan.assignments.map((assignment) => (assignment.role === role
        ? { ...assignment, status: 'DELEGATED' as const, delegatedToPrincipalId: toPrincipalId, delegatedReason: reason, principalId: toPrincipalId, decidedAt: now.toISOString() }
        : assignment)),
    }
    const next: ReviewRequestArtifact = { ...review, routingPlan }
    this.document.reviews[index] = next
    await this.persist()
    return structuredClone(next)
  }

  private async backfillRouting(): Promise<void> {
    let changed = false
    this.document.reviews = this.document.reviews.map((review) => {
      if (review.routingPlan) return review
      changed = true
      return { ...review, routingPlan: routingPlanFor(review.impact, review.submittedAt) }
    })
    if (changed) await this.persist()
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

/**
 * Routing derived from the impact of the target (E12): a critical claim is reviewed in sequence by
 * two roles inside a day; anything else runs in parallel with a longer clock.
 */
export function routingPlanFor(impact: ImpactLevel, submittedAt: string): ReviewRoutingPlan {
  const submitted = new Date(submittedAt).getTime()
  if (impact === 'CRITICAL') {
    return {
      routing: 'SEQUENTIAL',
      quorum: 2,
      assignments: [
        { role: 'Semantic owner', status: 'PENDING', order: 1 },
        { role: 'Risk & compliance', status: 'PENDING', order: 2 },
      ],
      slaHours: 24,
      dueAt: new Date(submitted + 24 * 3_600_000).toISOString(),
      escalateToRole: 'Governance lead',
    }
  }
  if (impact === 'HIGH') {
    return {
      routing: 'PARALLEL',
      quorum: 2,
      assignments: [
        { role: 'Semantic owner', status: 'PENDING', order: 1 },
        { role: 'Data steward', status: 'PENDING', order: 1 },
      ],
      slaHours: 48,
      dueAt: new Date(submitted + 48 * 3_600_000).toISOString(),
      escalateToRole: 'Governance lead',
    }
  }
  return {
    routing: 'PARALLEL',
    quorum: 1,
    assignments: [{ role: 'Semantic owner', status: 'PENDING', order: 1 }],
    slaHours: 72,
    dueAt: new Date(submitted + 72 * 3_600_000).toISOString(),
  }
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
