import { createHash, randomUUID } from 'node:crypto'
import type { CaseSet, CaseSetSummary, CreateCaseSetRequest, EvalCase, EvalCaseType } from '@lattice/contracts'
import { FileLedgerStorage, type LedgerStorage } from './governanceLedger.js'

/**
 * Evaluation case sets, kept as an append-only ledger.
 *
 * Editing a set used to overwrite it, which destroyed the version an eval run was scored against —
 * the one thing that makes a past score readable. Every edit is now a superseding artifact carrying
 * the same case-set id, so the set as it stood when a run used it survives, and the current state
 * of a set is the last artifact written for it.
 */

/**
 * A case set as stored. The contract type leaves `artifactDigest` optional because callers only
 * read it; a ledger artifact must always carry one, because that digest is what the chain links.
 */
export type CaseSetArtifact = CaseSet & { artifactDigest: string }

export class CaseSetStore {
  constructor(private readonly storage: LedgerStorage<CaseSetArtifact>) {}

  static async open(filePath: string): Promise<CaseSetStore> {
    return new CaseSetStore(await FileLedgerStorage.open<CaseSetArtifact>(filePath, 'caseSets', 'Case set'))
  }

  async list(query: { workspaceId?: string; contractId?: string } = {}, tenantId: string | undefined): Promise<CaseSetSummary[]> {
    const caseSets = await this.current()
    return caseSets
      .filter((caseSet) => caseSet.tenantId === tenantId && (!query.workspaceId || caseSet.workspaceId === query.workspaceId) && (!query.contractId || caseSet.contractId === query.contractId))
      .map((caseSet) => summarize(caseSet))
  }

  async all(tenantId: string | undefined): Promise<CaseSet[]> {
    const caseSets = await this.current()
    return caseSets.filter((caseSet) => caseSet.tenantId === tenantId)
  }

  async get(caseSetId: string, tenantId: string | undefined): Promise<CaseSet | undefined> {
    const caseSets = await this.current()
    return caseSets.find((candidate) => candidate.id === caseSetId && candidate.tenantId === tenantId)
  }

  async create(request: CreateCaseSetRequest, tenantId: string | undefined, now = new Date()): Promise<CaseSet> {
    const timestamp = now.toISOString()
    return this.storage.append(finalize({
      id: `caseset_${randomUUID()}`,
      ...(tenantId ? { tenantId } : {}),
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
    }))
  }

  /** Seeded only when the ledger held no case sets; an authored set is never overwritten. */
  async seed(caseSet: CaseSet, tenantId: string | undefined): Promise<CaseSet> {
    return this.storage.append(finalize(scoped(caseSet, tenantId)))
  }

  async replace(caseSetId: string, caseSet: CaseSet, tenantId: string | undefined, now = new Date()): Promise<CaseSet> {
    const existing = await this.get(caseSetId, tenantId)
    if (!existing) throw new Error('CASE_SET_NOT_FOUND')
    const next = finalize({ ...scoped(caseSet, tenantId), id: caseSetId, createdAt: existing.createdAt, updatedAt: now.toISOString(), version: bump(existing.version) })
    return this.storage.append(next, revisionKey(next))
  }

  async upsertCase(caseSetId: string, evalCase: EvalCase, tenantId: string | undefined, now = new Date()): Promise<CaseSet> {
    const existing = await this.get(caseSetId, tenantId)
    if (!existing) throw new Error('CASE_SET_NOT_FOUND')
    const cases = existing.cases.some((candidate) => candidate.id === evalCase.id)
      ? existing.cases.map((candidate) => (candidate.id === evalCase.id ? structuredClone(evalCase) : candidate))
      : [...existing.cases, structuredClone(evalCase)]
    const next = finalize({ ...existing, cases, updatedAt: now.toISOString(), version: bump(existing.version) })
    return this.storage.append(next, revisionKey(next))
  }

  /**
   * Folds the ledger down to the latest artifact for each case set.
   *
   * Ledger order is chain order, so the last artifact bearing a set's id is its current state.
   */
  private async current(): Promise<CaseSetArtifact[]> {
    const byCaseSet = new Map<string, CaseSetArtifact>()
    for (const artifact of await this.storage.list()) byCaseSet.set(artifact.id, artifact)
    return [...byCaseSet.values()]
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

/** The tenant is the server's to assign, so a payload may not assert one of its own. */
function scoped(caseSet: CaseSet, tenantId: string | undefined): CaseSet {
  const { tenantId: _tenantId, ...rest } = caseSet
  return { ...rest, ...(tenantId ? { tenantId } : {}) }
}

/**
 * Seals a case set: `digest` still covers the authored record, and `artifactDigest` covers that
 * sealed record so the chain link protects everything, including which tenant it belongs to.
 *
 * Both leave out the chain, which storage assigns on append. Carrying a predecessor's link into a
 * successor's digest would make the successor unverifiable the moment it is written.
 */
function finalize(caseSet: CaseSet): CaseSetArtifact {
  const { digest: _digest, artifactDigest: _artifactDigest, chain: _chain, ...digestable } = structuredClone(caseSet)
  const sealed = { ...digestable, digest: digestOf(digestable) }
  return { ...sealed, artifactDigest: digestOf(sealed) }
}

/**
 * The row is identified by the revision, the artifact by the case set.
 *
 * Every write bumps the version, so successive edits to one set never collide on a storage key.
 */
function revisionKey(caseSet: CaseSet): string {
  return `${caseSet.id}@${caseSet.version}`
}

function bump(version: string): string {
  const [major = 1, minor = 0, patch = 0] = version.split('.').map((part) => Number.parseInt(part, 10) || 0)
  return `${major}.${minor}.${patch + 1}`
}

function digestOf(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
