import type { ContextContract, ContractRegistryEntry, ContractRelease, IndustryWorkspace, ReleaseControlEvent } from '@lattice/contracts'
import type { RegistryDocument, RegistryStorage } from './registry.js'

interface SupabaseRegistryRowMetadata {
  workspaceCreators: Map<string, string>
  contractCreators: Map<string, string>
  releasePublishers: Map<string, string>
  releaseEventCreators: Map<string, string>
}

interface WorkspaceRow {
  id: string
  document: IndustryWorkspace
  created_by: string
}

interface ContractRow {
  id: string
  draft: ContractRegistryEntry['draft']
  runtime_status: ContractRegistryEntry['runtimeStatus']
  active_release_digest?: string | null
  created_by: string
  updated_at: string
}

interface ReleaseRow {
  contract_id: string
  digest: string
  version: string
  notes: string
  contract: ContractRelease['contract']
  published_by: string
  published_at: string
}

interface ReleaseEventRow {
  id: string
  contract_id: string
  document: ReleaseControlEvent
  created_by: string
}

export interface SupabaseRegistryConfig {
  projectUrl: URL
  publishableKey: string
}

export function supabaseRegistryConfigFromEnvironment(): SupabaseRegistryConfig | undefined {
  const supabaseUrl = (process.env.LATTICE_SUPABASE_URL ?? process.env.SUPABASE_URL)?.trim()
  const publishableKey = (process.env.LATTICE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY)?.trim()
  if (!supabaseUrl && !publishableKey) return undefined
  if (!supabaseUrl || !publishableKey) throw new Error('SUPABASE_REGISTRY_CONFIGURATION_INCOMPLETE')
  return { projectUrl: secureProjectUrl(supabaseUrl), publishableKey }
}

export class SupabaseRegistryStorage implements RegistryStorage {
  private readonly projectUrl: URL
  private readonly headers: Record<string, string>
  private readonly metadata: SupabaseRegistryRowMetadata = {
    workspaceCreators: new Map(),
    contractCreators: new Map(),
    releasePublishers: new Map(),
    releaseEventCreators: new Map(),
  }
  private workspaceSnapshots = new Map<string, string>()
  private contractSnapshots = new Map<string, string>()
  /** updated_at as it was when this instance read, used as the write precondition. */
  private contractUpdatedAt = new Map<string, string>()
  private releaseKeys = new Set<string>()
  private releaseEventIds = new Set<string>()

  constructor(
    config: SupabaseRegistryConfig,
    private readonly organizationId: string,
    private readonly principalId: string,
    authorization: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!validUuid(organizationId) || !validUuid(principalId)) throw new Error('SUPABASE_REGISTRY_IDENTITY_INVALID')
    if (!/^Bearer [^\s]+$/i.test(authorization)) throw new Error('SUPABASE_REGISTRY_AUTHORIZATION_INVALID')
    if (!config.publishableKey.trim()) throw new Error('SUPABASE_PUBLISHABLE_KEY_REQUIRED')
    this.projectUrl = secureProjectUrl(config.projectUrl.toString())
    this.headers = {
      apikey: config.publishableKey,
      Authorization: authorization,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
  }

  async read(): Promise<RegistryDocument | undefined> {
    const [workspaceRows, contractRows, releaseRows, releaseEventRows] = await Promise.all([
      this.select<WorkspaceRow>('workspaces', 'id,document,created_by'),
      this.select<ContractRow>('contracts', 'id,draft,runtime_status,active_release_digest,created_by,updated_at'),
      this.select<ReleaseRow>('contract_releases', 'contract_id,digest,version,notes,contract,published_by,published_at', { order: 'published_at.asc' }),
      this.select<ReleaseEventRow>('governed_artifacts', 'id,contract_id,document,created_by', { kind: 'eq.RELEASE_EVENT' }),
    ])
    if (workspaceRows.length === 0 && contractRows.length === 0) return undefined

    const workspaces = Object.fromEntries(workspaceRows.map((row) => [row.id, row.document]))
    const releasesByContract = groupBy(releaseRows, (row) => row.contract_id)
    const eventsByContract = groupBy(releaseEventRows, (row) => row.contract_id)
    const entries: Record<string, ContractRegistryEntry> = {}

    for (const row of workspaceRows) {
      this.metadata.workspaceCreators.set(row.id, row.created_by)
      this.workspaceSnapshots.set(row.id, stableJson(workspacePayload(this.organizationId, row.document, row.created_by)))
    }
    for (const row of releaseRows) {
      this.metadata.releasePublishers.set(releaseKey(row.contract_id, row.digest), row.published_by)
      this.releaseKeys.add(releaseKey(row.contract_id, row.digest))
    }
    for (const row of releaseEventRows) {
      this.metadata.releaseEventCreators.set(row.id, row.created_by)
      this.releaseEventIds.add(row.id)
    }
    for (const row of contractRows) {
      const entry: ContractRegistryEntry = {
        contractId: row.id,
        draft: row.draft,
        updatedAt: row.updated_at,
        releases: (releasesByContract.get(row.id) ?? []).map(releaseFromRow),
        runtimeStatus: row.runtime_status,
        ...(row.active_release_digest ? { activeReleaseDigest: row.active_release_digest } : {}),
        ...((eventsByContract.get(row.id)?.length ?? 0) > 0 ? { releaseEvents: eventsByContract.get(row.id)!.map((event) => event.document) } : {}),
      }
      entries[row.id] = entry
      this.metadata.contractCreators.set(row.id, row.created_by)
      this.contractUpdatedAt.set(row.id, row.updated_at)
      this.contractSnapshots.set(row.id, stableJson(contractPayload(this.organizationId, entry, workspaceIdFor(entry, workspaces), row.created_by, this.principalId)))
    }

    return { schemaVersion: '1.1', entries, workspaces }
  }

  async write(document: RegistryDocument): Promise<void> {
    const workspaces = document.workspaces ?? {}
    const workspaceRows = Object.values(workspaces).map((workspace) => workspacePayload(
      this.organizationId,
      workspace,
      this.metadata.workspaceCreators.get(workspace.id) ?? this.principalId,
    )).filter((row) => this.workspaceSnapshots.get(row.id) !== stableJson(row))

    const contractRows = Object.values(document.entries).map((entry) => contractPayload(
      this.organizationId,
      entry,
      workspaceIdFor(entry, workspaces),
      this.metadata.contractCreators.get(entry.contractId) ?? this.principalId,
      this.principalId,
    )).filter((row) => this.contractSnapshots.get(row.id) !== stableJson(row))

    if (workspaceRows.length > 0) await this.upsert('workspaces', 'organization_id,id', workspaceRows)
    for (const row of contractRows) await this.writeContractRow(row)

    const releaseRows = Object.values(document.entries).flatMap((entry) => entry.releases
      .filter((release) => !this.releaseKeys.has(releaseKey(entry.contractId, release.digest)))
      .map((release) => ({
        organization_id: this.organizationId,
        contract_id: entry.contractId,
        digest: release.digest,
        version: release.version,
        notes: release.notes,
        contract: release.contract,
        published_by: this.metadata.releasePublishers.get(releaseKey(entry.contractId, release.digest)) ?? this.principalId,
        published_at: release.publishedAt,
      })))
    if (releaseRows.length > 0) await this.upsert('contract_releases', 'organization_id,contract_id,digest', releaseRows, 'resolution=ignore-duplicates,return=minimal')

    const eventRows = Object.values(document.entries).flatMap((entry) => (entry.releaseEvents ?? [])
      .filter((event) => !this.releaseEventIds.has(event.id))
      .map((event) => ({
        organization_id: this.organizationId,
        id: event.id,
        contract_id: entry.contractId,
        kind: 'RELEASE_EVENT',
        artifact_digest: event.artifactDigest,
        document: event,
        created_by: this.metadata.releaseEventCreators.get(event.id) ?? this.principalId,
        created_at: event.occurredAt,
      })))
    if (eventRows.length > 0) await this.upsert('governed_artifacts', 'organization_id,id', eventRows, 'resolution=ignore-duplicates,return=minimal')

    for (const row of workspaceRows) {
      this.workspaceSnapshots.set(row.id, stableJson(row))
      this.metadata.workspaceCreators.set(row.id, row.created_by)
    }
    for (const row of contractRows) {
      this.contractSnapshots.set(row.id, stableJson(row))
      this.metadata.contractCreators.set(row.id, row.created_by)
    }
    for (const row of releaseRows) {
      this.releaseKeys.add(releaseKey(row.contract_id, row.digest))
      this.metadata.releasePublishers.set(releaseKey(row.contract_id, row.digest), row.published_by)
    }
    for (const row of eventRows) {
      this.releaseEventIds.add(row.id)
      this.metadata.releaseEventCreators.set(row.id, row.created_by)
    }
  }

  /**
   * Reads rows, refusing to return a silently short answer.
   *
   * PostgREST applies its own maximum-rows setting, so a large registry would come back
   * truncated with no error and the API would serve a registry that is quietly missing
   * contracts. Asking for an exact count and comparing it to what arrived turns that into a
   * loud failure.
   */
  private async select<T>(table: string, fields: string, filters: Record<string, string> = {}): Promise<T[]> {
    const url = this.tableUrl(table)
    url.searchParams.set('organization_id', `eq.${this.organizationId}`)
    url.searchParams.set('select', fields)
    for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value)
    const response = await this.fetcher(url, {
      headers: { ...this.headers, Prefer: 'count=exact' },
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`SUPABASE_REGISTRY_READ_FAILED:${table}:${response.status}`)
    const rows = await response.json() as T[]

    const total = totalFromContentRange(response.headers.get('content-range'))
    if (total !== undefined && total > rows.length) {
      throw new Error(`SUPABASE_REGISTRY_READ_TRUNCATED:${table}:${rows.length}/${total}`)
    }
    return rows
  }

  /**
   * Reads one published release without loading the organization's whole registry.
   *
   * The runtime path only ever needs a single active contract, and pulling every workspace,
   * draft, and release to answer one question is the difference between a request that scales
   * and one that does not.
   */
  async readPublishedContract(contractId: string): Promise<ContextContract | undefined> {
    const [contractRow] = await this.select<{ runtime_status: string; active_release_digest?: string | null }>(
      'contracts',
      'runtime_status,active_release_digest',
      { id: `eq.${contractId}` },
    )
    if (!contractRow || contractRow.runtime_status !== 'ACTIVE') return undefined

    const cacheKey = `${this.organizationId}:${contractId}:${contractRow.active_release_digest ?? 'latest'}`
    const cached = publishedReleaseCache.get(cacheKey)
    if (cached) return structuredClone(cached)

    const releases = await this.select<{ contract: ContextContract }>(
      'contract_releases',
      'contract,digest,published_at',
      contractRow.active_release_digest
        ? { contract_id: `eq.${contractId}`, digest: `eq.${contractRow.active_release_digest}` }
        : { contract_id: `eq.${contractId}`, order: 'published_at.desc', limit: '1' },
    )
    const contract = releases[0]?.contract
    if (!contract) return undefined

    // Releases are immutable and content-addressed, so caching one can never serve stale data.
    publishedReleaseCache.set(cacheKey, contract)
    return structuredClone(contract)
  }


  /**
   * Writes one contract row, refusing to overwrite a concurrent edit.
   *
   * The registry is read, modified, and written back on every request, so a plain upsert makes
   * the last writer win silently: two authors editing the same draft would see one change
   * vanish with no error. A row that existed when this instance read is updated only while its
   * updated_at still matches what was read; anything else is a conflict the caller must resolve
   * by re-reading.
   */
  private async writeContractRow(row: ReturnType<typeof contractPayload>): Promise<void> {
    const seenAt = this.contractUpdatedAt.get(row.id)
    if (seenAt === undefined) {
      await this.upsert('contracts', 'organization_id,id', [row])
      return
    }

    const url = this.tableUrl('contracts')
    url.searchParams.set('organization_id', `eq.${this.organizationId}`)
    url.searchParams.set('id', `eq.${row.id}`)
    url.searchParams.set('updated_at', `eq.${seenAt}`)
    const response = await this.fetcher(url, {
      method: 'PATCH',
      headers: { ...this.headers, Prefer: 'return=representation' },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`SUPABASE_REGISTRY_WRITE_FAILED:contracts:${response.status}`)

    const updated = await response.json() as unknown[]
    if (updated.length === 0) throw new ContractRegistryConflictError(row.id)
    this.contractUpdatedAt.set(row.id, row.updated_at)
  }

  private async upsert(table: string, conflictColumns: string, rows: object[], prefer = 'resolution=merge-duplicates,return=minimal'): Promise<void> {
    const url = this.tableUrl(table)
    url.searchParams.set('on_conflict', conflictColumns)
    const response = await this.fetcher(url, {
      method: 'POST',
      headers: { ...this.headers, Prefer: prefer },
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`SUPABASE_REGISTRY_WRITE_FAILED:${table}:${response.status}`)
  }

  private tableUrl(table: string): URL {
    return new URL(`/rest/v1/${table}`, this.projectUrl)
  }
}

function workspacePayload(organizationId: string, workspace: IndustryWorkspace, createdBy: string) {
  return {
    organization_id: organizationId,
    id: workspace.id,
    domain: workspace.domain,
    name: workspace.name,
    document: workspace,
    created_by: createdBy,
    updated_at: workspace.updatedAt,
  }
}

function contractPayload(organizationId: string, entry: ContractRegistryEntry, workspaceId: string, createdBy: string, updatedBy: string) {
  return {
    organization_id: organizationId,
    id: entry.contractId,
    workspace_id: workspaceId,
    name: entry.draft.name,
    domain: entry.draft.domain,
    draft: entry.draft,
    runtime_status: entry.runtimeStatus,
    active_release_digest: entry.activeReleaseDigest ?? null,
    created_by: createdBy,
    updated_by: updatedBy,
    updated_at: entry.updatedAt,
  }
}

function releaseFromRow(row: ReleaseRow): ContractRelease {
  return {
    version: row.version,
    digest: row.digest,
    publishedAt: row.published_at,
    notes: row.notes,
    contract: row.contract,
  }
}

function workspaceIdFor(entry: ContractRegistryEntry, workspaces: Record<string, IndustryWorkspace>): string {
  const referenced = entry.draft.ontologyRef?.workspaceId
  if (referenced && workspaces[referenced]) return referenced
  const containing = Object.values(workspaces).find((workspace) => workspace.contractIds.includes(entry.contractId))
  if (!containing) throw new Error(`CONTRACT_WORKSPACE_MISSING:${entry.contractId}`)
  return containing.id
}

function releaseKey(contractId: string, digest: string): string {
  return `${contractId}:${digest}`
}

function stableJson(value: unknown): string {
  return JSON.stringify(value)
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const row of rows) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row])
  return grouped
}

export function secureProjectUrl(value: string): URL {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('SUPABASE_URL_INVALID') }
  const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !localHttp) || (localHttp && process.env.NODE_ENV === 'production') || url.username || url.password || url.hash) throw new Error('SUPABASE_URL_INVALID')
  return url
}

export function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export class ContractRegistryConflictError extends Error {
  constructor(readonly contractId: string) {
    super(`${contractId} was modified by another writer since this request read it. Re-read and reapply the change.`)
    this.name = 'ContractRegistryConflictError'
  }
}

/**
 * Immutable published releases, keyed by content digest.
 *
 * Bounded so a long-lived process cannot accumulate every release an organization has ever
 * published. Entries can never go stale: a different release has a different digest and
 * therefore a different key.
 */
class ReleaseCache {
  private readonly entries = new Map<string, ContextContract>()

  constructor(private readonly maximumEntries: number) {}

  get(key: string): ContextContract | undefined {
    const value = this.entries.get(key)
    if (!value) return undefined
    // Refresh recency so the eviction order is least-recently-used.
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: string, value: ContextContract): void {
    this.entries.set(key, value)
    while (this.entries.size > this.maximumEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }
}

const publishedReleaseCache = new ReleaseCache(200)

/** PostgREST reports `items 0-24/1234`; the total is what follows the slash. */
export function totalFromContentRange(header: string | null): number | undefined {
  const total = header?.split('/')[1]
  if (!total || total === '*') return undefined
  const parsed = Number(total)
  return Number.isInteger(parsed) ? parsed : undefined
}
