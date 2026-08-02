import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AssuranceRun } from '@lattice/contracts'

interface AssuranceDocument {
  schemaVersion: '1.0'
  runs: AssuranceRun[]
}

export class AssuranceStore {
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(private readonly filePath: string, private document: AssuranceDocument) {}

  static async open(filePath: string): Promise<AssuranceStore> {
    try {
      return new AssuranceStore(filePath, JSON.parse(await readFile(filePath, 'utf8')) as AssuranceDocument)
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
      const store = new AssuranceStore(filePath, { schemaVersion: '1.0', runs: [] })
      await store.persist()
      return store
    }
  }

  list(contractId: string, tenantId: string | undefined): AssuranceRun[] {
    return this.document.runs
      .filter((run) => run.contractId === contractId && run.tenantId === tenantId)
      .map((run) => structuredClone(run))
      .reverse()
  }

  get(runId: string, tenantId: string | undefined): AssuranceRun | undefined {
    const run = this.document.runs.find((candidate) => candidate.id === runId && candidate.tenantId === tenantId)
    return run ? structuredClone(run) : undefined
  }

  async append(run: AssuranceRun, tenantId: string | undefined): Promise<AssuranceRun> {
    if (this.document.runs.some((candidate) => candidate.id === run.id)) throw new Error('ASSURANCE_RUN_IMMUTABLE')
    const owned: AssuranceRun = { ...structuredClone(run), ...(tenantId ? { tenantId } : {}) }
    this.document.runs.push(owned)
    await this.persist()
    return structuredClone(owned)
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
