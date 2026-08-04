import { randomUUID } from 'node:crypto'
import type { ConnectorHealthRecord, FreshnessStatus } from '@lattice/contracts'
import type { ConnectorHealthProbe } from './connectors.js'
import { FileConnectorHealthStorage, type ConnectorHealthStorage } from './connectorHealthStorage.js'

export class ConnectorHealthStore {
  constructor(private readonly storage: ConnectorHealthStorage) {}

  static async open(filePath: string): Promise<ConnectorHealthStore> {
    return new ConnectorHealthStore(await FileConnectorHealthStorage.open(filePath))
  }

  async list(tenantId: string | undefined, bindingId?: string): Promise<ConnectorHealthRecord[]> {
    const all = await this.storage.list()
    const owned = all.filter((record) => record.tenantId === tenantId)
    const records = bindingId ? owned.filter((record) => record.bindingId === bindingId) : owned
    const now = new Date().toISOString()
    // Freshness is relative to when it is asked for, not when it was recorded, so it is derived
    // on read rather than trusted from the stored row.
    return records
      .map((record) => ({ ...record, freshnessStatus: freshnessStatus(record.lastSuccessfulAt, record.maximumFreshnessMinutes, now) }))
      .reverse()
  }

  async latest(tenantId: string | undefined, bindingId: string): Promise<ConnectorHealthRecord | undefined> {
    return (await this.list(tenantId, bindingId))[0]
  }

  async append(probe: ConnectorHealthProbe, maximumFreshnessMinutes: number, tenantId: string | undefined): Promise<ConnectorHealthRecord> {
    const all = await this.storage.list()
    const previousSuccess = [...all].reverse().find((record) => record.tenantId === tenantId && record.bindingId === probe.bindingId && record.status === 'HEALTHY')
    const lastSuccessfulAt = probe.status === 'HEALTHY' ? probe.checkedAt : previousSuccess?.checkedAt
    return this.storage.append({
      id: `connector_health_${randomUUID()}`,
      ...(tenantId ? { tenantId } : {}),
      ...probe,
      maximumFreshnessMinutes,
      ...(lastSuccessfulAt ? { lastSuccessfulAt } : {}),
      freshnessStatus: freshnessStatus(lastSuccessfulAt, maximumFreshnessMinutes, probe.checkedAt),
    })
  }
}

function freshnessStatus(lastSuccessfulAt: string | undefined, maximumMinutes: number, checkedAt: string): FreshnessStatus {
  if (!lastSuccessfulAt || maximumMinutes <= 0) return 'INVALID'
  const ageMinutes = Math.max(0, Date.parse(checkedAt) - Date.parse(lastSuccessfulAt)) / 60_000
  if (ageMinutes <= maximumMinutes * 0.8) return 'CURRENT'
  if (ageMinutes <= maximumMinutes) return 'AGING'
  return 'STALE'
}
