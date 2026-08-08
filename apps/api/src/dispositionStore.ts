import { createHash, randomUUID } from 'node:crypto'
import type { DispositionPage, DispositionQuery, DispositionRecord, RetentionPolicy } from '@lattice/contracts'
import { FileLedgerStorage, type LedgerStorage } from './governanceLedger.js'

/** Decision §11.3 — the trail is capped, then aged out of view, never silently dropped. */
export const retentionDays = 90
export const retentionMaximumRecords = 5000

export const defaultPageSize = 25
export const maximumPageSize = 200

export type DispositionInput = Omit<DispositionRecord, 'id' | 'artifactDigest' | 'attestationIds'> & { attestationIds?: string[] }

/** Builds the record so the caller can attest over it before it is persisted. */
export function buildDisposition(input: DispositionInput): DispositionRecord {
  const body: Omit<DispositionRecord, 'artifactDigest'> = {
    id: `disp_${randomUUID()}`,
    ...input,
    attestationIds: input.attestationIds ?? [],
  }
  const { attestationIds: _attestationIds, ...digestable } = body
  return { ...body, artifactDigest: `sha256:${createHash('sha256').update(JSON.stringify(digestable)).digest('hex')}` }
}

/**
 * The disposition trail, kept as an append-only ledger.
 *
 * Retention used to *move* overflow into a second archive file, and that cannot survive the move
 * to a ledger: relocating a row breaks the hash chain it belongs to, and the storage seam has no
 * delete for exactly that reason. So retention is now read-side only. Every disposition ever
 * appended stays in the ledger; the reads surface only what the policy still retains, and
 * `archivedCount` reports how many have aged out of the window rather than how many were moved.
 * Nothing is deleted — including any `disposition-archive.json` an earlier build left behind,
 * which is no longer read or written.
 */
export class DispositionStore {
  constructor(private readonly storage: LedgerStorage<DispositionRecord>) {}

  static async open(filePath: string): Promise<DispositionStore> {
    return new DispositionStore(await FileLedgerStorage.open<DispositionRecord>(filePath, 'records', 'Disposition'))
  }

  async all(tenantId: string | undefined): Promise<DispositionRecord[]> {
    return (await this.retained(tenantId)).records
  }

  async get(dispositionId: string, tenantId: string | undefined): Promise<DispositionRecord | undefined> {
    const { records } = await this.retained(tenantId)
    return records.find((candidate) => candidate.id === dispositionId)
  }

  async append(record: DispositionRecord, tenantId: string | undefined): Promise<DispositionRecord> {
    return this.storage.append({ ...record, ...(tenantId ? { tenantId } : {}) })
  }

  async query(query: DispositionQuery, tenantId: string | undefined): Promise<DispositionPage> {
    const limit = Math.min(Math.max(Math.trunc(query.limit ?? defaultPageSize), 1), maximumPageSize)
    const { records } = await this.retained(tenantId)
    const matched = records
      .filter((record) => matches(record, query))
      .sort((left, right) => (left.createdAt === right.createdAt ? right.id.localeCompare(left.id) : right.createdAt.localeCompare(left.createdAt)))
    const offset = query.cursor ? matched.findIndex((record) => record.id === query.cursor) + 1 : 0
    const page = matched.slice(offset, offset + limit)
    const nextCursor = offset + limit < matched.length ? page.at(-1)?.id : undefined
    return {
      records: page,
      total: matched.length,
      ...(nextCursor ? { nextCursor } : {}),
    }
  }

  async retention(tenantId: string | undefined): Promise<RetentionPolicy> {
    const { records, beyondWindow } = await this.retained(tenantId)
    const oldest = [...records].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]
    return {
      dispositionRetentionDays: retentionDays,
      dispositionMaximumRecords: retentionMaximumRecords,
      archivedCount: beyondWindow,
      ...(oldest ? { oldestRetainedAt: oldest.createdAt } : {}),
    }
  }

  /**
   * The tenant's dispositions that the policy still surfaces, in ledger order.
   *
   * Age and count are applied together, as the archiving pass applied them: anything older than
   * the window falls out first, then the oldest of what remains until the cap is met. Scoping to
   * the tenant before applying the cap keeps one tenant's volume from pushing another tenant's
   * records out of view, which a single shared file could not distinguish.
   */
  private async retained(tenantId: string | undefined): Promise<{ records: DispositionRecord[]; beyondWindow: number }> {
    const owned = (await this.storage.list()).filter((record) => record.tenantId === tenantId)
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60_000
    const withinAge = [...owned]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .filter((record) => new Date(record.createdAt).getTime() >= cutoff)
    const kept = new Set(withinAge.slice(Math.max(0, withinAge.length - retentionMaximumRecords)).map((record) => record.id))
    return { records: owned.filter((record) => kept.has(record.id)), beyondWindow: owned.length - kept.size }
  }
}

function matches(record: DispositionRecord, query: DispositionQuery): boolean {
  if (query.contractId && record.contractId !== query.contractId) return false
  if (query.workspaceId && record.workspaceId !== query.workspaceId) return false
  if (query.decision && record.decision !== query.decision) return false
  if (query.purposeId && record.purposeId !== query.purposeId) return false
  if (query.riskTier && record.riskTier !== query.riskTier) return false
  if (query.principalId && record.principalId !== query.principalId) return false
  if (query.mode && record.mode !== query.mode) return false
  if (query.from && record.createdAt < query.from) return false
  if (query.to && record.createdAt > query.to) return false
  return true
}
