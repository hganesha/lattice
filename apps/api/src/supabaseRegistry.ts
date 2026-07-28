import type { ContractRegistryEntry, ContractRelease, IndustryWorkspace, ReleaseControlEvent } from '@lattice/contracts'
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
    if (contractRows.length > 0) await this.upsert('contracts', 'organization_id,id', contractRows)

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

  private async select<T>(table: string, fields: string, filters: Record<string, string> = {}): Promise<T[]> {
    const url = this.tableUrl(table)
    url.searchParams.set('organization_id', `eq.${this.organizationId}`)
    url.searchParams.set('select', fields)
    for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value)
    const response = await this.fetcher(url, { headers: this.headers, signal: AbortSignal.timeout(5_000) })
    if (!response.ok) throw new Error(`SUPABASE_REGISTRY_READ_FAILED:${table}:${response.status}`)
    return await response.json() as T[]
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

function secureProjectUrl(value: string): URL {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('SUPABASE_URL_INVALID') }
  const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !localHttp) || (localHttp && process.env.NODE_ENV === 'production') || url.username || url.password || url.hash) throw new Error('SUPABASE_URL_INVALID')
  return url
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
