import { createHash, randomUUID } from 'node:crypto'
import type { CreateReviewRequest, ReviewDecisionArtifact, ReviewDecisionValue, ReviewRequestArtifact } from '@lattice/contracts'
import { FileLedgerStorage, type LedgerStorage } from './governanceLedger.js'

/**
 * Governance reviews, kept as an append-only ledger.
 *
 * Deciding a review used to overwrite the open artifact in place. The backing table has select
 * and insert policies and deliberately no update, because a ledger you can rewrite proves
 * nothing — so a decision is appended as a superseding artifact carrying the same review id, and
 * the current state of a review is the last artifact written for it. That also means the record
 * of who opened a review survives the decision, which overwriting destroyed.
 */
export class ReviewStore {
  constructor(private readonly storage: LedgerStorage<ReviewRequestArtifact>) {}

  static async open(filePath: string): Promise<ReviewStore> {
    return new ReviewStore(await FileLedgerStorage.open<ReviewRequestArtifact>(filePath, 'reviews', 'Review'))
  }

  async list(contractId: string, tenantId: string | undefined): Promise<ReviewRequestArtifact[]> {
    const reviews = await this.current()
    return reviews.filter((review) => review.contractId === contractId && review.tenantId === tenantId).reverse()
  }

  async get(reviewId: string, tenantId: string | undefined): Promise<ReviewRequestArtifact | undefined> {
    const reviews = await this.current()
    return reviews.find((candidate) => candidate.id === reviewId && candidate.tenantId === tenantId)
  }

  async create(input: CreateReviewRequest, submittedBy: string, tenantId: string | undefined, now = new Date()): Promise<ReviewRequestArtifact> {
    const reviews = await this.current()
    const existing = reviews.find((review) => review.tenantId === tenantId && review.contractId === input.contractId && review.targetKind === input.targetKind && review.targetId === input.targetId && review.status === 'OPEN')
    if (existing) return structuredClone(existing)
    const submittedAt = now.toISOString()
    const unsigned = { ...(tenantId ? { tenantId } : {}), ...input, submittedAt, submittedBy }
    return this.storage.append({
      id: `review_${randomUUID()}`,
      ...unsigned,
      status: 'OPEN',
      artifactDigest: digest(unsigned),
    })
  }

  async decide(reviewId: string, decision: ReviewDecisionValue, rationale: string, decidedBy: string, tenantId: string | undefined, now = new Date()): Promise<ReviewRequestArtifact> {
    const review = await this.get(reviewId, tenantId)
    if (!review) throw new Error('REVIEW_NOT_FOUND')
    if (review.status === 'DECIDED') throw new Error('REVIEW_ALREADY_DECIDED')
    // These approvals are exactly what unblocks publishing, so the author cannot be the
    // reviewer. Runtime approvals have always enforced this; governance reviews did not.
    if (review.submittedBy === decidedBy) throw new Error('REVIEW_SEPARATION_REQUIRED')
    const decidedAt = now.toISOString()
    const unsignedDecision = { reviewId, decision, rationale, decidedAt, decidedBy }
    const artifact: ReviewDecisionArtifact = { id: `decision_${randomUUID()}`, ...unsignedDecision, artifactDigest: digest(unsignedDecision) }
    // Keyed by the decision, identified as the review: a distinct row describing the same review.
    return this.storage.append({ ...review, status: 'DECIDED', decision: artifact }, artifact.id)
  }

  /**
   * Folds the ledger down to the latest artifact for each review.
   *
   * Ledger order is chain order, so the last artifact bearing a review's id is its current state.
   */
  private async current(): Promise<ReviewRequestArtifact[]> {
    const byReview = new Map<string, ReviewRequestArtifact>()
    for (const artifact of await this.storage.list()) byReview.set(artifact.id, artifact)
    return [...byReview.values()]
  }
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
