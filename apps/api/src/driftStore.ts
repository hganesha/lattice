import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { DriftEvent } from '@lattice/contracts'

interface DriftDocument {
  schemaVersion: '1.0'
  events: DriftEvent[]
}

export class DriftStore {
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(private readonly filePath: string, private document: DriftDocument) {}

  static async open(filePath: string): Promise<DriftStore> {
    try {
      return new DriftStore(filePath, JSON.parse(await readFile(filePath, 'utf8')) as DriftDocument)
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
      const store = new DriftStore(filePath, { schemaVersion: '1.0', events: [] })
      await store.persist()
      return store
    }
  }

  list(query: { workspaceId?: string; contractId?: string; status?: DriftEvent['status'] } = {}): DriftEvent[] {
    return this.document.events
      .filter((event) => (!query.workspaceId || event.workspaceId === query.workspaceId) && (!query.contractId || event.contractId === query.contractId) && (!query.status || event.status === query.status))
      .map((event) => structuredClone(event))
      .sort((left, right) => right.detectedAt.localeCompare(left.detectedAt))
  }

  all(): DriftEvent[] {
    return this.document.events.map((event) => structuredClone(event))
  }

  get(eventId: string): DriftEvent | undefined {
    const event = this.document.events.find((candidate) => candidate.id === eventId)
    return event ? structuredClone(event) : undefined
  }

  /** Ids are content-derived, so rescanning the same history adds nothing. */
  async upsertMany(events: DriftEvent[]): Promise<DriftEvent[]> {
    const added: DriftEvent[] = []
    for (const event of events) {
      if (this.document.events.some((candidate) => candidate.id === event.id)) continue
      this.document.events.push(structuredClone(event))
      added.push(structuredClone(event))
    }
    if (added.length > 0) await this.persist()
    return added
  }

  async replace(event: DriftEvent): Promise<DriftEvent> {
    const index = this.document.events.findIndex((candidate) => candidate.id === event.id)
    if (index < 0) throw new Error('DRIFT_EVENT_NOT_FOUND')
    this.document.events[index] = structuredClone(event)
    await this.persist()
    return structuredClone(event)
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
