import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CaseSet, CaseSetSummary, CreateCaseSetRequest, EvalCase, EvalCaseType } from '@lattice/contracts'

interface CaseSetDocument {
  schemaVersion: '1.0'
  caseSets: CaseSet[]
}

export class CaseSetStore {
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(private readonly filePath: string, private document: CaseSetDocument, readonly seeded: boolean) {}

  static async open(filePath: string): Promise<CaseSetStore> {
    try {
      return new CaseSetStore(filePath, JSON.parse(await readFile(filePath, 'utf8')) as CaseSetDocument, false)
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
      const store = new CaseSetStore(filePath, { schemaVersion: '1.0', caseSets: [] }, true)
      await store.persist()
      return store
    }
  }

  list(query: { workspaceId?: string; contractId?: string } = {}): CaseSetSummary[] {
    return this.document.caseSets
      .filter((caseSet) => (!query.workspaceId || caseSet.workspaceId === query.workspaceId) && (!query.contractId || caseSet.contractId === query.contractId))
      .map((caseSet) => summarize(caseSet))
  }

  all(): CaseSet[] {
    return this.document.caseSets.map((caseSet) => structuredClone(caseSet))
  }

  get(caseSetId: string): CaseSet | undefined {
    const caseSet = this.document.caseSets.find((candidate) => candidate.id === caseSetId)
    return caseSet ? structuredClone(caseSet) : undefined
  }

  async create(request: CreateCaseSetRequest, now = new Date()): Promise<CaseSet> {
    const timestamp = now.toISOString()
    const caseSet = finalize({
      id: `caseset_${randomUUID()}`,
      name: request.name,
      description: request.description,
      version: '1.0.0',
      scope: request.scope,
      ...(request.contractId ? { contractId: request.contractId } : {}),
      ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
      owner: request.owner,
      createdAt: timestamp,
      updatedAt: timestamp,
      digest: '',
      cases: request.cases ?? [],
    })
    this.document.caseSets.push(caseSet)
    await this.persist()
    return structuredClone(caseSet)
  }

  /** Seeded only when the store file was absent; an authored set is never overwritten. */
  async seed(caseSet: CaseSet): Promise<CaseSet> {
    const prepared = finalize(caseSet)
    this.document.caseSets.push(prepared)
    await this.persist()
    return structuredClone(prepared)
  }

  async replace(caseSetId: string, caseSet: CaseSet, now = new Date()): Promise<CaseSet> {
    const index = this.document.caseSets.findIndex((candidate) => candidate.id === caseSetId)
    const existing = this.document.caseSets[index]
    if (!existing) throw new Error('CASE_SET_NOT_FOUND')
    const next = finalize({ ...structuredClone(caseSet), id: caseSetId, createdAt: existing.createdAt, updatedAt: now.toISOString(), version: bump(existing.version) })
    this.document.caseSets[index] = next
    await this.persist()
    return structuredClone(next)
  }

  async upsertCase(caseSetId: string, evalCase: EvalCase, now = new Date()): Promise<CaseSet> {
    const index = this.document.caseSets.findIndex((candidate) => candidate.id === caseSetId)
    const existing = this.document.caseSets[index]
    if (!existing) throw new Error('CASE_SET_NOT_FOUND')
    const caseIndex = existing.cases.findIndex((candidate) => candidate.id === evalCase.id)
    const cases = caseIndex >= 0
      ? existing.cases.map((candidate, position) => (position === caseIndex ? structuredClone(evalCase) : candidate))
      : [...existing.cases, structuredClone(evalCase)]
    const next = finalize({ ...existing, cases, updatedAt: now.toISOString(), version: bump(existing.version) })
    this.document.caseSets[index] = next
    await this.persist()
    return structuredClone(next)
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

export function summarize(caseSet: CaseSet): CaseSetSummary {
  const caseTypeCounts: Partial<Record<EvalCaseType, number>> = {}
  for (const item of caseSet.cases) caseTypeCounts[item.caseType] = (caseTypeCounts[item.caseType] ?? 0) + 1
  return {
    id: caseSet.id,
    name: caseSet.name,
    description: caseSet.description,
    version: caseSet.version,
    scope: caseSet.scope,
    ...(caseSet.contractId ? { contractId: caseSet.contractId } : {}),
    ...(caseSet.workspaceId ? { workspaceId: caseSet.workspaceId } : {}),
    owner: caseSet.owner,
    updatedAt: caseSet.updatedAt,
    digest: caseSet.digest,
    caseCount: caseSet.cases.length,
    caseTypeCounts,
  }
}

function finalize(caseSet: CaseSet): CaseSet {
  const { digest: _digest, ...digestable } = caseSet
  return { ...structuredClone(caseSet), digest: `sha256:${createHash('sha256').update(JSON.stringify(digestable)).digest('hex')}` }
}

function bump(version: string): string {
  const [major = 1, minor = 0, patch = 0] = version.split('.').map((part) => Number.parseInt(part, 10) || 0)
  return `${major}.${minor}.${patch + 1}`
}
