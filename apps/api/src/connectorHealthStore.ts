import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ConnectorHealthRecord, FreshnessStatus } from '@lattice/contracts'
import type { ConnectorHealthProbe } from './connectors.js'

interface ConnectorHealthDocument {
  schemaVersion: '1.0'
  records: ConnectorHealthRecord[]
}

export class ConnectorHealthStore {
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(private readonly filePath: string, private document: ConnectorHealthDocument) {}

  static async open(filePath: string): Promise<ConnectorHealthStore> {
    try {
      return new ConnectorHealthStore(filePath, JSON.parse(await readFile(filePath, 'utf8')) as ConnectorHealthDocument)
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
      const store = new ConnectorHealthStore(filePath, { schemaVersion: '1.0', records: [] })
      await store.persist()
      return store
    }
  }

  list(bindingId?: string): ConnectorHealthRecord[] {
    const records = bindingId ? this.document.records.filter((record) => record.bindingId === bindingId) : this.document.records
    const now = new Date().toISOString()
    return records.map((record) => ({ ...structuredClone(record), freshnessStatus: freshnessStatus(record.lastSuccessfulAt, record.maximumFreshnessMinutes, now) })).reverse()
  }

  latest(bindingId: string): ConnectorHealthRecord | undefined {
    return this.list(bindingId)[0]
  }

  async append(probe: ConnectorHealthProbe, maximumFreshnessMinutes: number): Promise<ConnectorHealthRecord> {
    const previousSuccess = [...this.document.records].reverse().find((record) => record.bindingId === probe.bindingId && record.status === 'HEALTHY')
    const lastSuccessfulAt = probe.status === 'HEALTHY' ? probe.checkedAt : previousSuccess?.checkedAt
    const record: ConnectorHealthRecord = {
      id: `connector_health_${randomUUID()}`,
      ...probe,
      maximumFreshnessMinutes,
      ...(lastSuccessfulAt ? { lastSuccessfulAt } : {}),
      freshnessStatus: freshnessStatus(lastSuccessfulAt, maximumFreshnessMinutes, probe.checkedAt),
    }
    this.document.records.push(record)
    await this.persist()
    return structuredClone(record)
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

function freshnessStatus(lastSuccessfulAt: string | undefined, maximumMinutes: number, checkedAt: string): FreshnessStatus {
  if (!lastSuccessfulAt || maximumMinutes <= 0) return 'INVALID'
  const ageMinutes = Math.max(0, Date.parse(checkedAt) - Date.parse(lastSuccessfulAt)) / 60_000
  if (ageMinutes <= maximumMinutes * 0.8) return 'CURRENT'
  if (ageMinutes <= maximumMinutes) return 'AGING'
  return 'STALE'
}
