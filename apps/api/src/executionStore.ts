import { createHash, randomUUID } from 'node:crypto'
import type { BindingExecutionResult, ExecutionReceipt, SignedExecutionPlan } from '@lattice/contracts'
import { FileLedgerStorage, type LedgerStorage } from './governanceLedger.js'

export class ExecutionStore {
  constructor(private readonly storage: LedgerStorage<ExecutionReceipt>) {}

  static async open(filePath: string): Promise<ExecutionStore> {
    // An execution ledger that cannot be trusted is worse than none, so a broken chain stops
    // the service rather than being served as if it were sound.
    return new ExecutionStore(
      await FileLedgerStorage.open<ExecutionReceipt>(filePath, 'receipts', 'Execution', receiptContentDigest),
    )
  }

  async list(contractId: string, tenantId: string | undefined): Promise<ExecutionReceipt[]> {
    const receipts = await this.storage.list()
    return receipts.filter((receipt) => receipt.contractId === contractId && receipt.tenantId === tenantId).reverse()
  }

  /**
   * A plan's nonce is spent only by an attempt that got past authorization. A rejected
   * attempt is still recorded for audit, but it must not destroy an approved plan — otherwise
   * one unauthorized call is enough to force a whole compile and approval cycle again.
   * The lookup is deliberately not tenant-scoped: a plan identifier is single-use globally.
   */
  async findConsumedByPlanId(planId: string): Promise<ExecutionReceipt | undefined> {
    const receipts = await this.storage.list()
    return receipts.find((candidate) => candidate.planId === planId && candidate.status !== 'DENIED')
  }

  async append(input: {
    tenantId?: string
    contractId: string
    contractVersion: string
    plan: SignedExecutionPlan
    principalId: string
    status: ExecutionReceipt['status']
    startedAt: string
    completedAt: string
    grantedPermissions: string[]
    bindingResults: BindingExecutionResult[]
  }): Promise<ExecutionReceipt> {
    if (await this.findConsumedByPlanId(input.plan.planId)) throw new Error('PLAN_NONCE_ALREADY_CONSUMED')
    const unsigned = {
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      contractId: input.contractId,
      contractVersion: input.contractVersion,
      contractDigest: input.plan.contractDigest,
      planId: input.plan.planId,
      operationId: input.plan.operation,
      // Carried from the signed plan so the audit trail records what the data was used for,
      // not just that it was read.
      ...(input.plan.purpose ? { purpose: input.plan.purpose } : {}),
      principalId: input.principalId,
      status: input.status,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      requiredPermissions: input.plan.requiredPermissions,
      grantedPermissions: input.grantedPermissions,
      evidenceRefs: input.plan.evidenceRefs,
      bindingResults: input.bindingResults,
    }
    return this.storage.append({
      id: `execution_${randomUUID()}`,
      ...unsigned,
      artifactDigest: digest(unsigned),
    } as ExecutionReceipt)
  }
}

/**
 * Recomputes a receipt's digest from its content, so an edit that leaves the stored digest
 * untouched is still caught. Mirrors exactly how `append` builds the digested payload.
 */
function receiptContentDigest(receipt: ExecutionReceipt): string {
  const { id: _id, artifactDigest: _artifactDigest, chain: _chain, ...unsigned } = receipt
  return digest(unsigned)
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
