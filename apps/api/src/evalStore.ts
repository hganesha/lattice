import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { EvalRun, EvalRunSummary } from '@lattice/contracts'

interface EvalRunDocument {
  schemaVersion: '1.0'
  runs: EvalRun[]
}

/** An eval run is an artifact: appended once, then only its terminal fields are amended. */
export class EvalRunStore {
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(private readonly filePath: string, private document: EvalRunDocument) {}

  static async open(filePath: string): Promise<EvalRunStore> {
    try {
      return new EvalRunStore(filePath, JSON.parse(await readFile(filePath, 'utf8')) as EvalRunDocument)
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
      const store = new EvalRunStore(filePath, { schemaVersion: '1.0', runs: [] })
      await store.persist()
      return store
    }
  }

  list(query: { contractId?: string; caseSetId?: string; environment?: string } = {}): EvalRunSummary[] {
    return this.document.runs
      .filter((run) => (!query.contractId || run.contractId === query.contractId)
        && (!query.caseSetId || run.caseSetId === query.caseSetId)
        && (!query.environment || run.environment === query.environment))
      .map((run) => summarizeRun(run))
      .reverse()
  }

  /** The environments runs actually carry. The filter offers these and never an invented list. */
  environments(contractId?: string): string[] {
    return [...new Set(this.document.runs
      .filter((run) => !contractId || run.contractId === contractId)
      .map((run) => run.environment))].sort()
  }

  all(): EvalRun[] {
    return this.document.runs.map((run) => structuredClone(run))
  }

  get(runId: string): EvalRun | undefined {
    const run = this.document.runs.find((candidate) => candidate.id === runId)
    return run ? structuredClone(run) : undefined
  }

  async append(run: EvalRun): Promise<EvalRun> {
    if (this.document.runs.some((candidate) => candidate.id === run.id)) throw new Error('EVAL_RUN_IMMUTABLE')
    this.document.runs.push(structuredClone(run))
    await this.persist()
    return structuredClone(run)
  }

  async replace(run: EvalRun): Promise<EvalRun> {
    const index = this.document.runs.findIndex((candidate) => candidate.id === run.id)
    if (index < 0) throw new Error('EVAL_RUN_NOT_FOUND')
    this.document.runs[index] = structuredClone(run)
    await this.persist()
    return structuredClone(run)
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

/** The list view never carries per-case results; a 64-case run is not a list payload. */
export function summarizeRun(run: EvalRun): EvalRunSummary {
  const { results: _results, ...summary } = structuredClone(run)
  return summary
}
