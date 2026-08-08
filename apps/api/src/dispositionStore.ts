import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { DispositionPage, DispositionQuery, DispositionRecord, RetentionPolicy } from '@lattice/contracts'

interface DispositionDocument {
  schemaVersion: '1.0'
  records: DispositionRecord[]
}

interface ArchiveDocument {
  schemaVersion: '1.0'
  archivedCount: number
  records: DispositionRecord[]
}

/** Decision §11.3 — the trail is capped, then archived, never silently dropped. */
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

export class DispositionStore {
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(
    private readonly filePath: string,
    private readonly archivePath: string,
    private document: DispositionDocument,
    private archive: ArchiveDocument,
  ) {}

  static async open(filePath: string, archivePath: string): Promise<DispositionStore> {
    const document = await readDocument<DispositionDocument>(filePath, { schemaVersion: '1.0', records: [] })
    const archive = await readDocument<ArchiveDocument>(archivePath, { schemaVersion: '1.0', archivedCount: 0, records: [] })
    const store = new DispositionStore(filePath, archivePath, document, archive)
    await store.persist()
    return store
  }

  all(): DispositionRecord[] {
    return this.document.records.map((record) => structuredClone(record))
  }

  get(dispositionId: string): DispositionRecord | undefined {
    const record = this.document.records.find((candidate) => candidate.id === dispositionId)
    return record ? structuredClone(record) : undefined
  }

  async append(record: DispositionRecord): Promise<DispositionRecord> {
    this.document.records.push(structuredClone(record))
    await this.enforceRetention(new Date())
    await this.persist()
    return structuredClone(record)
  }

  query(query: DispositionQuery): DispositionPage {
    const limit = Math.min(Math.max(Math.trunc(query.limit ?? defaultPageSize), 1), maximumPageSize)
    const matched = this.document.records
      .filter((record) => matches(record, query))
      .sort((left, right) => (left.createdAt === right.createdAt ? right.id.localeCompare(left.id) : right.createdAt.localeCompare(left.createdAt)))
    const offset = query.cursor ? matched.findIndex((record) => record.id === query.cursor) + 1 : 0
    const page = matched.slice(offset, offset + limit)
    const nextCursor = offset + limit < matched.length ? page.at(-1)?.id : undefined
    return {
      records: page.map((record) => structuredClone(record)),
      total: matched.length,
      ...(nextCursor ? { nextCursor } : {}),
    }
  }

  retention(): RetentionPolicy {
    const oldest = [...this.document.records].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]
    return {
      dispositionRetentionDays: retentionDays,
      dispositionMaximumRecords: retentionMaximumRecords,
      archivedCount: this.archive.archivedCount,
      ...(oldest ? { oldestRetainedAt: oldest.createdAt } : {}),
    }
  }

  /** Overflow moves to the archive file and is counted. Nothing is deleted. */
  private async enforceRetention(now: Date): Promise<void> {
    const cutoff = now.getTime() - retentionDays * 24 * 60 * 60_000
    const ordered = [...this.document.records].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    const overflowByAge = ordered.filter((record) => new Date(record.createdAt).getTime() < cutoff)
    const overflowByCount = ordered.slice(0, Math.max(0, ordered.length - retentionMaximumRecords))
    const overflowIds = new Set([...overflowByAge, ...overflowByCount].map((record) => record.id))
    if (overflowIds.size === 0) return
    const archived = this.document.records.filter((record) => overflowIds.has(record.id))
    this.document.records = this.document.records.filter((record) => !overflowIds.has(record.id))
    this.archive = { ...this.archive, archivedCount: this.archive.archivedCount + archived.length, records: [...this.archive.records, ...archived] }
    await writeDocument(this.archivePath, this.archive)
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await writeDocument(this.filePath, this.document)
      await writeDocument(this.archivePath, this.archive)
    })
    await this.writeQueue
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

async function readDocument<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
    if (!missing) throw error
    return fallback
  }
}

async function writeDocument(filePath: string, document: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, filePath)
}
