import { createHash, randomUUID } from 'node:crypto'
import type { EvalRun, EvalRunSummary } from '@lattice/contracts'
import { FileLedgerStorage, type LedgerStorage } from './governanceLedger.js'

/**
 * Eval runs, kept as an append-only ledger.
 *
 * A run's terminal fields used to be amended in place. The backing table has select and insert
 * policies and deliberately no update, so a status transition — a cancellation — is appended as a
 * superseding artifact carrying the same run id under a storage key of its own, and the current
 * state of a run is the last artifact written for it. The evidence that the run was started, and
 * by whom, therefore survives the transition that ended it.
 */
export class EvalRunStore {
  constructor(private readonly storage: LedgerStorage<EvalRun>) {}

  static async open(filePath: string): Promise<EvalRunStore> {
    return new EvalRunStore(await FileLedgerStorage.open<EvalRun>(filePath, 'runs', 'Eval run'))
  }

  async list(query: { contractId?: string; caseSetId?: string; environment?: string }, tenantId: string | undefined): Promise<EvalRunSummary[]> {
    const runs = await this.current(tenantId)
    return runs
      .filter((run) => (!query.contractId || run.contractId === query.contractId)
        && (!query.caseSetId || run.caseSetId === query.caseSetId)
        && (!query.environment || run.environment === query.environment))
      .map((run) => summarizeRun(run))
      .reverse()
  }

  /** The environments runs actually carry. The filter offers these and never an invented list. */
  async environments(contractId: string | undefined, tenantId: string | undefined): Promise<string[]> {
    const runs = await this.current(tenantId)
    return [...new Set(runs
      .filter((run) => !contractId || run.contractId === contractId)
      .map((run) => run.environment))].sort()
  }

  async all(tenantId: string | undefined): Promise<EvalRun[]> {
    return this.current(tenantId)
  }

  async get(runId: string, tenantId: string | undefined): Promise<EvalRun | undefined> {
    const runs = await this.current(tenantId)
    return runs.find((candidate) => candidate.id === runId)
  }

  async append(run: EvalRun, tenantId: string | undefined): Promise<EvalRun> {
    const runs = await this.current(tenantId)
    if (runs.some((candidate) => candidate.id === run.id)) throw new Error('EVAL_RUN_IMMUTABLE')
    return this.storage.append({ ...run, ...(tenantId ? { tenantId } : {}) })
  }

  async replace(run: EvalRun, tenantId: string | undefined): Promise<EvalRun> {
    const existing = await this.get(run.id, tenantId)
    if (!existing) throw new Error('EVAL_RUN_NOT_FOUND')
    const superseding = { ...run, ...(tenantId ? { tenantId } : {}) }
    /*
     * The digest is recomputed rather than carried over from the run being superseded. Two
     * reasons, and both are load-bearing: a chain link over a stale digest vouches for content
     * that has since changed, and the ledger keys artifacts by digest, so a successor that repeats
     * its predecessor's digest cannot be stored at all.
     */
    return this.storage.append({ ...superseding, artifactDigest: digestOf(superseding) }, `${run.id}_${randomUUID()}`)
  }

  /**
   * Folds the ledger down to the latest artifact for each run.
   *
   * Ledger order is chain order, so the last artifact bearing a run's id is its current state.
   * The tenant filter comes first so an artifact belonging to another tenant can never shadow one
   * of this tenant's runs.
   */
  private async current(tenantId: string | undefined): Promise<EvalRun[]> {
    const byRun = new Map<string, EvalRun>()
    for (const run of await this.storage.list()) if (run.tenantId === tenantId) byRun.set(run.id, run)
    return [...byRun.values()]
  }
}

/** The list view never carries per-case results; a 64-case run is not a list payload. */
export function summarizeRun(run: EvalRun): EvalRunSummary {
  const { results: _results, ...summary } = structuredClone(run)
  return summary
}

/** Matches the harness: sha256 over the run without the fields storage assigns to it. */
function digestOf(run: EvalRun): string {
  const { artifactDigest: _artifactDigest, chain: _chain, ...body } = run
  return `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`
}
