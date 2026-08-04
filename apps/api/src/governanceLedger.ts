import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ArtifactChainBrokenError, linkArtifact, nextChainState, verifyChain, type ChainedArtifact, type ContentDigest } from './hashChain.js'

/**
 * Where an append-only governance ledger keeps its artifacts.
 *
 * The five ledgers — assurance runs, reviews, runtime approvals, execution receipts, connector
 * health — were each a JSON file read at startup and rewritten on every append. That works for a
 * single long-lived process and not at all for anything else: a serverless invocation gets a
 * private, empty, disposable filesystem, so receipts would be written and then thrown away, and
 * two instances would disagree about what happened.
 *
 * Separating storage from the ledger logic lets the same store run against a file locally and
 * against Postgres in a deployment, without the chaining rules being written twice.
 */
export interface LedgerStorage<T extends ChainedArtifact> {
  /** Every artifact in this ledger, oldest first. */
  list(): Promise<T[]>
  /**
   * Appends one artifact and returns it as stored, including the chain link.
   *
   * The link is assigned by the storage rather than the caller, because deciding your own
   * sequence and predecessor is exactly the tampering the chain exists to make visible.
   *
   * `storageKey` separates the row's identity from the artifact's. A ledger that cannot update
   * records expresses a change of state by appending a superseding artifact, and that successor
   * describes the same review or approval — so it carries the same artifact id while needing a
   * distinct key of its own. Defaults to the artifact id, which is what append-only ledgers use.
   */
  append(record: T, storageKey?: string): Promise<T>
}

interface LedgerDocument<T> {
  schemaVersion: '1.0'
  records: T[]
}

/**
 * A ledger in a JSON file, for local development.
 *
 * Chain state is derived from the records already held, which is safe here only because a single
 * process owns the file. The Postgres implementation cannot make that assumption and derives the
 * link inside the database instead.
 */
export class FileLedgerStorage<T extends ChainedArtifact> implements LedgerStorage<T> {
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(
    private readonly filePath: string,
    private document: LedgerDocument<T>,
    private readonly recordsKey: string,
  ) {}

  /**
   * @param recordsKey the property the existing on-disk format stores its array under, so
   * ledgers written before this seam existed are still readable.
   */
  static async open<T extends ChainedArtifact>(
    filePath: string,
    recordsKey: string,
    label: string,
    contentDigest?: ContentDigest<T>,
  ): Promise<FileLedgerStorage<T>> {
    try {
      const raw = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>
      const records = (raw[recordsKey] ?? []) as T[]
      const verification = verifyChain(records, contentDigest)
      if (!verification.valid) throw new ArtifactChainBrokenError(label, verification)
      return new FileLedgerStorage<T>(filePath, { schemaVersion: '1.0', records }, recordsKey)
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
      const storage = new FileLedgerStorage<T>(filePath, { schemaVersion: '1.0', records: [] }, recordsKey)
      await storage.persist()
      return storage
    }
  }

  async list(): Promise<T[]> {
    return this.document.records.map((record) => structuredClone(record))
  }

  async append(record: T, _storageKey?: string): Promise<T> {
    // A file ledger has no row identity to collide, so the successor is simply the later record.
    const { previousDigest, sequence } = nextChainState(this.document.records)
    const linked = { ...record, chain: linkArtifact(previousDigest, record.artifactDigest, sequence) }
    this.document.records.push(linked)
    await this.persist()
    return structuredClone(linked)
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true })
      const payload = { schemaVersion: this.document.schemaVersion, [this.recordsKey]: this.document.records }
      const temporaryPath = `${this.filePath}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
      await rename(temporaryPath, this.filePath)
    })
    await this.writeQueue
  }
}
