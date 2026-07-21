import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { BindingExecutionResult, ExecutionReceipt, SignedExecutionPlan } from '@lattice/contracts'

interface ExecutionDocument {
  schemaVersion: '1.0'
  receipts: ExecutionReceipt[]
}

export class ExecutionStore {
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(private readonly filePath: string, private document: ExecutionDocument) {}

  static async open(filePath: string): Promise<ExecutionStore> {
    try {
      return new ExecutionStore(filePath, JSON.parse(await readFile(filePath, 'utf8')) as ExecutionDocument)
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
      const store = new ExecutionStore(filePath, { schemaVersion: '1.0', receipts: [] })
      await store.persist()
      return store
    }
  }

  list(contractId: string): ExecutionReceipt[] {
    return this.document.receipts.filter((receipt) => receipt.contractId === contractId).map((receipt) => structuredClone(receipt)).reverse()
  }

  findByPlanId(planId: string): ExecutionReceipt | undefined {
    const receipt = this.document.receipts.find((candidate) => candidate.planId === planId)
    return receipt ? structuredClone(receipt) : undefined
  }

  async append(input: {
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
    if (this.findByPlanId(input.plan.planId)) throw new Error('PLAN_NONCE_ALREADY_CONSUMED')
    const unsigned = {
      contractId: input.contractId,
      contractVersion: input.contractVersion,
      contractDigest: input.plan.contractDigest,
      planId: input.plan.planId,
      operationId: input.plan.operation,
      principalId: input.principalId,
      status: input.status,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      requiredPermissions: input.plan.requiredPermissions,
      grantedPermissions: input.grantedPermissions,
      evidenceRefs: input.plan.evidenceRefs,
      bindingResults: input.bindingResults,
    }
    const receipt: ExecutionReceipt = { id: `execution_${randomUUID()}`, ...unsigned, artifactDigest: digest(unsigned) }
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

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
