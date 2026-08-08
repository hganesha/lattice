import { createHash, randomUUID } from 'node:crypto'
import type { RuntimeApprovalArtifact, RuntimeApprovalDecisionArtifact, UnsignedExecutionPlan } from '@lattice/contracts'
import { FileLedgerStorage, type LedgerStorage } from './governanceLedger.js'

/**
 * Runtime approvals, kept as an append-only ledger.
 *
 * Every state an approval passes through — pending, decided, expired, resumed — is appended as a
 * superseding artifact carrying the same approval id rather than overwriting the previous one.
 * The backing table has no update policy, and the history is worth keeping anyway: an approval
 * that was granted and later resumed is a different audit story from one that was simply resumed.
 */
export class RuntimeApprovalStore {
  constructor(private readonly storage: LedgerStorage<RuntimeApprovalArtifact>) {}

  static async open(filePath: string): Promise<RuntimeApprovalStore> {
    return new RuntimeApprovalStore(
      await FileLedgerStorage.open<RuntimeApprovalArtifact>(filePath, 'approvals', 'Runtime approval'),
    )
  }

  async list(contractId: string, tenantId: string | undefined): Promise<RuntimeApprovalArtifact[]> {
    const approvals = await this.current()
    return approvals.filter((approval) => approval.contractId === contractId && approval.tenantId === tenantId).reverse()
  }

  async get(approvalId: string, tenantId: string | undefined): Promise<RuntimeApprovalArtifact | undefined> {
    const approvals = await this.current()
    return approvals.find((candidate) => candidate.id === approvalId && candidate.tenantId === tenantId)
  }

  async create(input: {
    tenantId?: string
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
    return this.storage.append({
      id: `runtime_approval_${randomUUID()}`,
      ...unsigned,
      status: 'PENDING',
      artifactDigest: digest(unsigned),
    })
  }

  async decide(approvalId: string, decision: 'APPROVED' | 'REJECTED', rationale: string, decidedBy: string, tenantId: string | undefined, now = new Date()): Promise<RuntimeApprovalArtifact> {
    const approval = await this.get(approvalId, tenantId)
    if (!approval) throw new Error('RUNTIME_APPROVAL_NOT_FOUND')
    if (approval.status !== 'PENDING') throw new Error('RUNTIME_APPROVAL_ALREADY_DECIDED')
    if (approval.requestedBy === decidedBy) throw new Error('RUNTIME_APPROVAL_SEPARATION_REQUIRED')
    if (new Date(approval.expiresAt).getTime() <= now.getTime()) {
      await this.storage.append({ ...approval, status: 'EXPIRED' }, `runtime_expiry_${randomUUID()}`)
      throw new Error('RUNTIME_APPROVAL_EXPIRED')
    }
    const decidedAt = now.toISOString()
    const unsigned = { approvalId, decision, rationale, decidedAt, decidedBy }
    const artifact: RuntimeApprovalDecisionArtifact = {
      id: `runtime_decision_${randomUUID()}`,
      ...unsigned,
      artifactDigest: digest(unsigned),
    }
    return this.storage.append({ ...approval, status: decision, decision: artifact }, artifact.id)
  }

  async markResumed(approvalId: string, signedPlanId: string, tenantId: string | undefined, now = new Date()): Promise<RuntimeApprovalArtifact> {
    const approval = await this.get(approvalId, tenantId)
    if (!approval) throw new Error('RUNTIME_APPROVAL_NOT_FOUND')
    if (approval.status === 'RESUMED') return approval
    if (approval.status !== 'APPROVED') throw new Error('RUNTIME_APPROVAL_NOT_APPROVED')
    return this.storage.append(
      { ...approval, status: 'RESUMED', resumedAt: now.toISOString(), signedPlanId },
      `runtime_resume_${randomUUID()}`,
    )
  }

  /**
   * Folds the ledger down to the latest artifact for each approval.
   *
   * Ledger order is chain order, so the last artifact bearing an approval's id is its current
   * state.
   */
  private async current(): Promise<RuntimeApprovalArtifact[]> {
    const byApproval = new Map<string, RuntimeApprovalArtifact>()
    for (const artifact of await this.storage.list()) byApproval.set(artifact.id, artifact)
    return [...byApproval.values()]
  }
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
