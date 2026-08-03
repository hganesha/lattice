import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CreateReviewRequest, ReviewDecisionArtifact, ReviewDecisionValue, ReviewRequestArtifact } from '@lattice/contracts'

interface ReviewDocument {
  schemaVersion: '1.0'
  reviews: ReviewRequestArtifact[]
}

export class ReviewStore {
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(private readonly filePath: string, private document: ReviewDocument) {}

  static async open(filePath: string): Promise<ReviewStore> {
    try {
      return new ReviewStore(filePath, JSON.parse(await readFile(filePath, 'utf8')) as ReviewDocument)
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
      const store = new ReviewStore(filePath, { schemaVersion: '1.0', reviews: [] })
      await store.persist()
      return store
    }
  }

  list(contractId: string, tenantId: string | undefined): ReviewRequestArtifact[] {
    return this.document.reviews
      .filter((review) => review.contractId === contractId && review.tenantId === tenantId)
      .map((review) => structuredClone(review))
      .reverse()
  }

  get(reviewId: string, tenantId: string | undefined): ReviewRequestArtifact | undefined {
    const review = this.document.reviews.find((candidate) => candidate.id === reviewId && candidate.tenantId === tenantId)
    return review ? structuredClone(review) : undefined
  }

  async create(input: CreateReviewRequest, submittedBy: string, tenantId: string | undefined, now = new Date()): Promise<ReviewRequestArtifact> {
    const existing = this.document.reviews.find((review) => review.tenantId === tenantId && review.contractId === input.contractId && review.targetKind === input.targetKind && review.targetId === input.targetId && review.status === 'OPEN')
    if (existing) return structuredClone(existing)
    const submittedAt = now.toISOString()
    const unsigned = { ...(tenantId ? { tenantId } : {}), ...input, submittedAt, submittedBy }
    const review: ReviewRequestArtifact = {
      id: `review_${randomUUID()}`,
      ...unsigned,
      status: 'OPEN',
      artifactDigest: digest(unsigned),
    }
    this.document.reviews.push(review)
    await this.persist()
    return structuredClone(review)
  }

  async decide(reviewId: string, decision: ReviewDecisionValue, rationale: string, decidedBy: string, tenantId: string | undefined, now = new Date()): Promise<ReviewRequestArtifact> {
    const index = this.document.reviews.findIndex((review) => review.id === reviewId && review.tenantId === tenantId)
    const review = this.document.reviews[index]
    if (!review) throw new Error('REVIEW_NOT_FOUND')
    if (review.status === 'DECIDED') throw new Error('REVIEW_ALREADY_DECIDED')
    // These approvals are exactly what unblocks publishing, so the author cannot be the
    // reviewer. Runtime approvals have always enforced this; governance reviews did not.
    if (review.submittedBy === decidedBy) throw new Error('REVIEW_SEPARATION_REQUIRED')
    const decidedAt = now.toISOString()
    const unsignedDecision = { reviewId, decision, rationale, decidedAt, decidedBy }
    const artifact: ReviewDecisionArtifact = { id: `decision_${randomUUID()}`, ...unsignedDecision, artifactDigest: digest(unsignedDecision) }
    const decided: ReviewRequestArtifact = { ...review, status: 'DECIDED', decision: artifact }
    this.document.reviews[index] = decided
    await this.persist()
    return structuredClone(decided)
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

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
