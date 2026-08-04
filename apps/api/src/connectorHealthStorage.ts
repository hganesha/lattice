import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ConnectorHealthRecord } from '@lattice/contracts'
import { secureProjectUrl, totalFromContentRange, validUuid, type SupabaseRegistryConfig } from './supabaseRegistry.js'

/**
 * Where connector health probes are kept.
 *
 * Health records are their own ledger rather than governed artifacts: they are not scoped to a
 * contract, and they carry no artifact digest of their own — the database derives one from the
 * document when it chains the record.
 */
export interface ConnectorHealthStorage {
  list(): Promise<ConnectorHealthRecord[]>
  append(record: ConnectorHealthRecord): Promise<ConnectorHealthRecord>
}

export class FileConnectorHealthStorage implements ConnectorHealthStorage {
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(private readonly filePath: string, private records: ConnectorHealthRecord[]) {}

  static async open(filePath: string): Promise<FileConnectorHealthStorage> {
    try {
      const document = JSON.parse(await readFile(filePath, 'utf8')) as { records?: ConnectorHealthRecord[] }
      return new FileConnectorHealthStorage(filePath, document.records ?? [])
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
      const storage = new FileConnectorHealthStorage(filePath, [])
      await storage.persist()
      return storage
    }
  }

  async list(): Promise<ConnectorHealthRecord[]> {
    return this.records.map((record) => structuredClone(record))
  }

  async append(record: ConnectorHealthRecord): Promise<ConnectorHealthRecord> {
    this.records.push(record)
    await this.persist()
    return structuredClone(record)
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true })
      const temporaryPath = `${this.filePath}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify({ schemaVersion: '1.0', records: this.records }, null, 2)}\n`, 'utf8')
      await rename(temporaryPath, this.filePath)
    })
    await this.writeQueue
  }
}

interface ConnectorHealthRow {
  document: ConnectorHealthRecord
}

/** Connector health in Postgres, chained by `append_connector_health` for the same reasons. */
export class SupabaseConnectorHealthStorage implements ConnectorHealthStorage {
  private readonly projectUrl: URL
  private readonly headers: Record<string, string>

  constructor(
    config: SupabaseRegistryConfig,
    private readonly organizationId: string,
    authorization: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!validUuid(organizationId)) throw new Error('SUPABASE_CONNECTOR_HEALTH_IDENTITY_INVALID')
    if (!/^Bearer [^\s]+$/i.test(authorization)) throw new Error('SUPABASE_CONNECTOR_HEALTH_AUTHORIZATION_INVALID')
    if (!config.publishableKey.trim()) throw new Error('SUPABASE_PUBLISHABLE_KEY_REQUIRED')
    this.projectUrl = secureProjectUrl(config.projectUrl.toString())
    this.headers = {
      apikey: config.publishableKey,
      Authorization: authorization,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
  }

  async list(): Promise<ConnectorHealthRecord[]> {
    const url = new URL('/rest/v1/connector_health', this.projectUrl)
    url.searchParams.set('organization_id', `eq.${this.organizationId}`)
    url.searchParams.set('select', 'document')
    url.searchParams.set('order', 'chain_sequence.asc')

    const response = await this.fetcher(url, {
      headers: { ...this.headers, Prefer: 'count=exact' },
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`SUPABASE_CONNECTOR_HEALTH_READ_FAILED:${response.status}`)
    const rows = await response.json() as ConnectorHealthRow[]

    const total = totalFromContentRange(response.headers.get('content-range'))
    if (total !== undefined && total > rows.length) {
      throw new Error(`SUPABASE_CONNECTOR_HEALTH_READ_TRUNCATED:${rows.length}/${total}`)
    }
    return rows.map((row) => structuredClone(row.document))
  }

  async append(record: ConnectorHealthRecord): Promise<ConnectorHealthRecord> {
    const url = new URL('/rest/v1/rpc/append_connector_health', this.projectUrl)
    const response = await this.fetcher(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        target_organization_id: this.organizationId,
        target_id: record.id,
        target_binding_id: record.bindingId,
        target_provider: record.provider,
        target_status: record.status,
        target_document: record,
      }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`SUPABASE_CONNECTOR_HEALTH_APPEND_FAILED:${response.status}`)
    return structuredClone(record)
  }
}
