import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { BindingExecutionResult, ExecutionReceipt, SignedExecutionPlan } from '@lattice/contracts'
import { ArtifactChainBrokenError, linkArtifact, nextChainState, verifyChain } from './hashChain.js'

interface ExecutionDocument {
  schemaVersion: '1.0'
  receipts: ExecutionReceipt[]
}

export class ExecutionStore {
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(private readonly filePath: string, private document: ExecutionDocument) {}

  static async open(filePath: string): Promise<ExecutionStore> {
    try {
      const document = JSON.parse(await readFile(filePath, 'utf8')) as ExecutionDocument
      // An execution ledger that cannot be trusted is worse than none, so a broken chain stops
      // the service rather than being served as if it were sound.
      const verification = verifyChain(document.receipts, receiptContentDigest)
      if (!verification.valid) throw new ArtifactChainBrokenError('Execution', verification)
      return new ExecutionStore(filePath, document)
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
      const store = new ExecutionStore(filePath, { schemaVersion: '1.0', receipts: [] })
      await store.persist()
      return store
    }
  }

  list(contractId: string, tenantId: string | undefined): ExecutionReceipt[] {
    return this.document.receipts
      .filter((receipt) => receipt.contractId === contractId && receipt.tenantId === tenantId)
      .map((receipt) => structuredClone(receipt))
      .reverse()
  }

  /**
   * A plan's nonce is spent only by an attempt that got past authorization. A rejected
   * attempt is still recorded for audit, but it must not destroy an approved plan — otherwise
   * one unauthorized call is enough to force a whole compile and approval cycle again.
   * The lookup is deliberately not tenant-scoped: a plan identifier is single-use globally.
   */
  findConsumedByPlanId(planId: string): ExecutionReceipt | undefined {
    const receipt = this.document.receipts.find((candidate) => candidate.planId === planId && candidate.status !== 'DENIED')
    return receipt ? structuredClone(receipt) : undefined
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
    if (this.findConsumedByPlanId(input.plan.planId)) throw new Error('PLAN_NONCE_ALREADY_CONSUMED')
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
    const artifactDigest = digest(unsigned)
    const { previousDigest, sequence } = nextChainState(this.document.receipts)
    const receipt: ExecutionReceipt = {
      id: `execution_${randomUUID()}`,
      ...unsigned,
      artifactDigest,
      chain: linkArtifact(previousDigest, artifactDigest, sequence),
    }
    this.document.receipts.push(receipt)
    await this.persist()
    return structuredClone(receipt)
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
