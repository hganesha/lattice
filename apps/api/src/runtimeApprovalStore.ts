import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { RuntimeApprovalArtifact, RuntimeApprovalDecisionArtifact, UnsignedExecutionPlan } from '@lattice/contracts'

interface RuntimeApprovalDocument {
  schemaVersion: '1.0'
  approvals: RuntimeApprovalArtifact[]
}

export class RuntimeApprovalStore {
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(private readonly filePath: string, private document: RuntimeApprovalDocument) {}

  static async open(filePath: string): Promise<RuntimeApprovalStore> {
    try {
      return new RuntimeApprovalStore(filePath, JSON.parse(await readFile(filePath, 'utf8')) as RuntimeApprovalDocument)
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
      const store = new RuntimeApprovalStore(filePath, { schemaVersion: '1.0', approvals: [] })
      await store.persist()
      return store
    }
  }

  list(contractId: string): RuntimeApprovalArtifact[] {
    return this.document.approvals.filter((approval) => approval.contractId === contractId).map((approval) => structuredClone(approval)).reverse()
  }

  get(approvalId: string): RuntimeApprovalArtifact | undefined {
    const approval = this.document.approvals.find((candidate) => candidate.id === approvalId)
    return approval ? structuredClone(approval) : undefined
  }

  async create(input: {
    contractId: string
    contractVersion: string
    contractDigest: string
    operationId: string
    policyId: string
    riskTier: RuntimeApprovalArtifact['riskTier']
    requestedBy: string
    pendingPlan: UnsignedExecutionPlan
  }, now = new Date()): Promise<RuntimeApprovalArtifact> {
    const requestedAt = now.toISOString()
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60_000).toISOString()
    const unsigned = { ...input, requestedAt, expiresAt }
    const approval: RuntimeApprovalArtifact = {
      id: `runtime_approval_${randomUUID()}`,
      ...unsigned,
      status: 'PENDING',
      artifactDigest: digest(unsigned),
    }
    this.document.approvals.push(approval)
    await this.persist()
    return structuredClone(approval)
  }

  async decide(approvalId: string, decision: 'APPROVED' | 'REJECTED', rationale: string, decidedBy: string, now = new Date()): Promise<RuntimeApprovalArtifact> {
    const index = this.document.approvals.findIndex((approval) => approval.id === approvalId)
    const approval = this.document.approvals[index]
    if (!approval) throw new Error('RUNTIME_APPROVAL_NOT_FOUND')
    if (approval.status !== 'PENDING') throw new Error('RUNTIME_APPROVAL_ALREADY_DECIDED')
    if (approval.requestedBy === decidedBy) throw new Error('RUNTIME_APPROVAL_SEPARATION_REQUIRED')
    if (new Date(approval.expiresAt).getTime() <= now.getTime()) {
      this.document.approvals[index] = { ...approval, status: 'EXPIRED' }
      await this.persist()
      throw new Error('RUNTIME_APPROVAL_EXPIRED')
    }
    const decidedAt = now.toISOString()
    const unsigned = { approvalId, decision, rationale, decidedAt, decidedBy }
    const artifact: RuntimeApprovalDecisionArtifact = {
      id: `runtime_decision_${randomUUID()}`,
      ...unsigned,
      artifactDigest: digest(unsigned),
    }
    const decided: RuntimeApprovalArtifact = { ...approval, status: decision, decision: artifact }
    this.document.approvals[index] = decided
    await this.persist()
    return structuredClone(decided)
  }

  async markResumed(approvalId: string, signedPlanId: string, now = new Date()): Promise<RuntimeApprovalArtifact> {
    const index = this.document.approvals.findIndex((approval) => approval.id === approvalId)
    const approval = this.document.approvals[index]
    if (!approval) throw new Error('RUNTIME_APPROVAL_NOT_FOUND')
    if (approval.status === 'RESUMED') return structuredClone(approval)
    if (approval.status !== 'APPROVED') throw new Error('RUNTIME_APPROVAL_NOT_APPROVED')
    const resumed: RuntimeApprovalArtifact = { ...approval, status: 'RESUMED', resumedAt: now.toISOString(), signedPlanId }
    this.document.approvals[index] = resumed
    await this.persist()
    return structuredClone(resumed)
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
