import type { AssuranceRun } from '@lattice/contracts'
import { FileLedgerStorage, type LedgerStorage } from './governanceLedger.js'

export class AssuranceStore {
  constructor(private readonly storage: LedgerStorage<AssuranceRun>) {}

  static async open(filePath: string): Promise<AssuranceStore> {
    // The assurance digest is computed by runAssurance over its own unsigned payload, so the
    // store cannot recompute it here; the chain still detects removal, reordering, and any
    // edit to the recorded digest itself.
    return new AssuranceStore(await FileLedgerStorage.open<AssuranceRun>(filePath, 'runs', 'Assurance'))
  }

  async list(contractId: string, tenantId: string | undefined): Promise<AssuranceRun[]> {
    const runs = await this.storage.list()
    return runs.filter((run) => run.contractId === contractId && run.tenantId === tenantId).reverse()
  }

  async get(runId: string, tenantId: string | undefined): Promise<AssuranceRun | undefined> {
    const runs = await this.storage.list()
    return runs.find((candidate) => candidate.id === runId && candidate.tenantId === tenantId)
  }

  async append(run: AssuranceRun, tenantId: string | undefined): Promise<AssuranceRun> {
    const runs = await this.storage.list()
    if (runs.some((candidate) => candidate.id === run.id)) throw new Error('ASSURANCE_RUN_IMMUTABLE')
    return this.storage.append({ ...structuredClone(run), ...(tenantId ? { tenantId } : {}) })
  }
}
