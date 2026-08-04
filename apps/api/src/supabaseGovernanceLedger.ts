import type { ArtifactChainLink } from '@lattice/contracts'
import type { ChainedArtifact } from './hashChain.js'
import type { LedgerStorage } from './governanceLedger.js'
import { secureProjectUrl, totalFromContentRange, validUuid, type SupabaseRegistryConfig } from './supabaseRegistry.js'

/** The `kind` discriminator on `public.governed_artifacts`. */
export type GovernedArtifactKind = 'ASSURANCE_RUN' | 'REVIEW' | 'RUNTIME_APPROVAL' | 'EXECUTION_RECEIPT'

interface GovernedArtifactRow {
  id: string
  contract_id: string
  artifact_digest: string
  document: unknown
  chain_sequence: number | null
  previous_digest: string | null
  chain_digest: string | null
}

/**
 * An append-only governance ledger stored in Postgres.
 *
 * Reads go through PostgREST under the caller's own token, so row level security decides what is
 * visible rather than this code. Appends go through `append_governed_artifact`, because deriving
 * the chain link and inserting it have to be one statement: with several instances serving
 * requests, reading the head and then inserting would let two appends claim the same sequence and
 * fork the ledger.
 */
export class SupabaseGovernanceLedger<T extends ChainedArtifact> implements LedgerStorage<T> {
  private readonly projectUrl: URL
  private readonly headers: Record<string, string>

  constructor(
    config: SupabaseRegistryConfig,
    private readonly organizationId: string,
    authorization: string,
    private readonly kind: GovernedArtifactKind,
    /** Restricts the ledger to one contract, for the routes that ask per contract. */
    private readonly contractId: string | undefined,
    /** Reattaches the contract the artifact belongs to, which lives in a column rather than the document. */
    private readonly withContractId: (document: T, contractId: string) => T = (document) => document,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!validUuid(organizationId)) throw new Error('SUPABASE_LEDGER_IDENTITY_INVALID')
    if (!/^Bearer [^\s]+$/i.test(authorization)) throw new Error('SUPABASE_LEDGER_AUTHORIZATION_INVALID')
    if (!config.publishableKey.trim()) throw new Error('SUPABASE_PUBLISHABLE_KEY_REQUIRED')
    this.projectUrl = secureProjectUrl(config.projectUrl.toString())
    this.headers = {
      apikey: config.publishableKey,
      Authorization: authorization,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
  }

  async list(): Promise<T[]> {
    const url = new URL('/rest/v1/governed_artifacts', this.projectUrl)
    url.searchParams.set('organization_id', `eq.${this.organizationId}`)
    url.searchParams.set('kind', `eq.${this.kind}`)
    if (this.contractId) url.searchParams.set('contract_id', `eq.${this.contractId}`)
    url.searchParams.set('select', 'id,contract_id,artifact_digest,document,chain_sequence,previous_digest,chain_digest')
    // Chain order, not insertion time: verification walks the sequence.
    url.searchParams.set('order', 'chain_sequence.asc')

    const response = await this.fetcher(url, {
      headers: { ...this.headers, Prefer: 'count=exact' },
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`SUPABASE_LEDGER_READ_FAILED:${this.kind}:${response.status}`)
    const rows = await response.json() as GovernedArtifactRow[]

    // A silently truncated ledger reads as a shorter history, which is indistinguishable from
    // artifacts having been deleted. Refusing is the only honest answer.
    const total = totalFromContentRange(response.headers.get('content-range'))
    if (total !== undefined && total > rows.length) {
      throw new Error(`SUPABASE_LEDGER_READ_TRUNCATED:${this.kind}:${rows.length}/${total}`)
    }
    return rows.map((row) => this.recordFromRow(row))
  }

  async append(record: T, storageKey?: string): Promise<T> {
    const url = new URL('/rest/v1/rpc/append_governed_artifact', this.projectUrl)
    const contractId = this.contractId ?? contractIdOf(record)
    if (!contractId) throw new Error(`SUPABASE_LEDGER_CONTRACT_REQUIRED:${this.kind}`)

    const response = await this.fetcher(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        target_organization_id: this.organizationId,
        target_contract_id: contractId,
        target_kind: this.kind,
        target_id: storageKey ?? record.id,
        target_artifact_digest: record.artifactDigest,
        target_document: record,
      }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`SUPABASE_LEDGER_APPEND_FAILED:${this.kind}:${response.status}`)

    const row = await response.json() as GovernedArtifactRow | GovernedArtifactRow[]
    const stored = Array.isArray(row) ? row[0] : row
    if (!stored) throw new Error(`SUPABASE_LEDGER_APPEND_EMPTY:${this.kind}`)
    return this.recordFromRow(stored)
  }

  /** The chain lives in columns so the database can enforce it; the artifact carries it inline. */
  private recordFromRow(row: GovernedArtifactRow): T {
    const document = this.withContractId(structuredClone(row.document) as T, row.contract_id)
    if (row.chain_sequence === null || row.previous_digest === null || row.chain_digest === null) return document
    const chain: ArtifactChainLink = {
      sequence: row.chain_sequence,
      previousDigest: row.previous_digest,
      chainDigest: row.chain_digest,
    }
    return { ...document, chain }
  }
}

function contractIdOf(record: unknown): string | undefined {
  return typeof record === 'object' && record !== null && 'contractId' in record
    ? (record as { contractId?: string }).contractId
    : undefined
}
