import { createHash, randomUUID } from 'node:crypto'
import {
  autonomyTierDefinitions,
  type DelegationGrant,
  type IdentityGraph,
  type Principal,
  type PrincipalChainLink,
  type PurposeAudience,
  type RiskTier,
} from '@lattice/contracts'
import { FileLedgerStorage, type LedgerStorage } from './governanceLedger.js'

/**
 * Identity and delegation, kept as two append-only ledgers.
 *
 * Who a principal is and what they were lent authority to do are the two facts every disposition
 * cites, so neither can be quietly rewritten: suspending a principal or spending a grant's budget
 * appends a superseding artifact carrying the same id rather than overwriting the previous one.
 * Principals and grants stay in separate ledgers because they are separate artifact kinds in the
 * backing table, and a grant's chain should not be perturbed by directory churn.
 */

/**
 * A principal as this ledger stores it.
 *
 * `Principal.artifactDigest` is optional on the contract because directories written before
 * chaining existed have none; the ledger needs one to chain on, so everything appended here
 * carries it.
 */
/** Exported so the server can parameterise the Postgres ledger with the same narrowed shape. */
export type PrincipalArtifact = Principal & { artifactDigest: string }

export interface CreateDelegationGrantRequest {
  toPrincipalId: string
  scope: string[]
  purposeIds: string[]
  audience: PurposeAudience
  maximumActions: number
  riskTierCeiling: RiskTier
  contractIds: string[]
  validMinutes?: number
  expiresAt?: string
}

const declaredAt = '2026-07-20T09:00:00.000Z'

/** The declared directory: four humans, two agents, one service account (E15). */
function declaredDirectory(workspaceIds: string[]): Principal[] {
  const scope = workspaceIds.length > 0 ? workspaceIds : []
  const human = (id: string, displayName: string, email: string, roles: string[]): Principal => ({
    id, displayName, kind: 'HUMAN', roles, workspaceIds: [...scope], email,
    authentication: { method: 'OIDC', issuer: 'https://id.lattice.internal', assuranceLevel: 'AAL2' },
    status: 'ACTIVE', createdAt: declaredAt,
  })
  return [
    human('principal_human_lindqvist', 'Ingrid Lindqvist', 'ingrid.lindqvist@lattice.internal', ['Semantic owner', 'Contract owner']),
    human('principal_human_okafor', 'Chidi Okafor', 'chidi.okafor@lattice.internal', ['Data steward']),
    human('principal_human_navarro', 'Elena Navarro', 'elena.navarro@lattice.internal', ['Risk & compliance', 'Governance lead']),
    human('principal_human_bakshi', 'Ravi Bakshi', 'ravi.bakshi@lattice.internal', ['Platform engineer']),
    {
      id: 'principal_agent_exposure_analyst', displayName: 'Exposure Analyst Agent', kind: 'AGENT',
      roles: ['Agent · analysis'], workspaceIds: [...scope],
      authentication: { method: 'MTLS', issuer: 'spiffe://lattice.internal', assuranceLevel: 'AAL2' },
      workloadIdentity: { platform: 'kubernetes', identifier: 'spiffe://lattice.internal/ns/agents/sa/exposure-analyst' },
      autonomyTier: 'A1', ownerPrincipalId: 'principal_human_lindqvist', status: 'ACTIVE', createdAt: declaredAt,
    },
    {
      id: 'principal_agent_limit_monitor', displayName: 'Limit Monitor Agent', kind: 'AGENT',
      roles: ['Agent · monitoring'], workspaceIds: [...scope],
      authentication: { method: 'MTLS', issuer: 'spiffe://lattice.internal', assuranceLevel: 'AAL3' },
      workloadIdentity: { platform: 'kubernetes', identifier: 'spiffe://lattice.internal/ns/agents/sa/limit-monitor' },
      autonomyTier: 'A2', ownerPrincipalId: 'principal_human_navarro', status: 'ACTIVE', createdAt: declaredAt,
    },
    {
      id: 'principal_service_studio', displayName: 'Lattice Studio', kind: 'SERVICE',
      roles: ['Service account'], workspaceIds: [...scope],
      authentication: { method: 'API_TOKEN', issuer: 'lattice-context-api', assuranceLevel: 'AAL1' },
      workloadIdentity: { platform: 'lattice', identifier: 'service/lattice-studio' },
      ownerPrincipalId: 'principal_human_bakshi', status: 'ACTIVE', createdAt: declaredAt,
    },
  ]
}

function declaredGrants(contractIds: string[]): DelegationGrant[] {
  const issuedAt = declaredAt
  const expiresAt = '2026-10-20T09:00:00.000Z'
  const build = (fromPrincipalId: string, toPrincipalId: string, scope: string[], purposeIds: string[], audience: PurposeAudience, maximumActions: number, riskTierCeiling: RiskTier): DelegationGrant => {
    const body: Omit<DelegationGrant, 'artifactDigest'> = {
      id: `grant_${digest({ fromPrincipalId, toPrincipalId, issuedAt }).slice(7, 27)}`,
      fromPrincipalId, toPrincipalId, scope, purposeIds, audience, issuedAt, expiresAt,
      maximumActions, consumedActions: 0, riskTierCeiling, contractIds: [...contractIds], status: 'ACTIVE',
    }
    return { ...body, artifactDigest: digest(body) }
  }
  return [
    build('principal_human_lindqvist', 'principal_agent_exposure_analyst', ['risk.exposure.read'], ['situational_awareness', 'internal_analysis'], 'INTERNAL', 500, 'ANALYTICAL'),
    build('principal_human_navarro', 'principal_agent_limit_monitor', ['risk.exposure.read', 'risk.collateral.read'], ['risk_limit_decision'], 'INTERNAL', 100, 'PLANNING_DECISION'),
  ]
}

export class PrincipalStore {
  constructor(
    private readonly principals: LedgerStorage<PrincipalArtifact>,
    private readonly delegations: LedgerStorage<DelegationGrant>,
  ) {}

  static async open(principalsPath: string, delegationsPath: string, workspaceIds: string[], contractIds: string[]): Promise<PrincipalStore> {
    const store = new PrincipalStore(
      await FileLedgerStorage.open<PrincipalArtifact>(principalsPath, 'principals', 'Principal'),
      await FileLedgerStorage.open<DelegationGrant>(delegationsPath, 'grants', 'Delegation grant'),
    )
    await store.seedDeclared(workspaceIds, contractIds)
    return store
  }

  async all(workspaceId: string | undefined, tenantId: string | undefined): Promise<Principal[]> {
    const principals = await this.current()
    return principals.filter((principal) => principal.tenantId === tenantId && (!workspaceId || principal.workspaceIds.includes(workspaceId)))
  }

  async get(principalId: string, tenantId: string | undefined): Promise<Principal | undefined> {
    const principals = await this.current()
    return principals.find((candidate) => candidate.id === principalId && candidate.tenantId === tenantId)
  }

  /**
   * Principals seen in review, execution and disposition artifacts are recorded as what they
   * verifiably are — a bearer token identity — rather than being guessed into the human directory.
   *
   * Only genuinely new identities are appended. Re-recording one already in the directory would
   * add an artifact per request and bury the ledger under restatements of the same fact.
   */
  async observe(principalIds: string[], workspaceIds: string[], tenantId: string | undefined, now = new Date()): Promise<Principal[]> {
    const known = new Set((await this.all(undefined, tenantId)).map((principal) => principal.id))
    const added: Principal[] = []
    for (const principalId of [...new Set(principalIds)]) {
      if (!principalId || known.has(principalId)) continue
      const body: Principal = {
        id: principalId,
        ...(tenantId ? { tenantId } : {}),
        displayName: principalId,
        kind: 'SERVICE',
        roles: ['Bearer token identity'],
        workspaceIds: [...workspaceIds],
        authentication: { method: 'DEMO_TOKEN', issuer: 'lattice-context-api', assuranceLevel: 'AAL1', lastAuthenticatedAt: now.toISOString() },
        status: 'ACTIVE',
        createdAt: now.toISOString(),
      }
      added.push(await this.principals.append({ ...body, artifactDigest: digest(body) }))
      known.add(principalId)
    }
    return added
  }

  async grants(query: { workspaceId?: string; principalId?: string }, tenantId: string | undefined, now = new Date()): Promise<DelegationGrant[]> {
    // The directory is only needed to answer the workspace question, so it is not read otherwise.
    const directory = query.workspaceId ? await this.all(undefined, tenantId) : []
    const inWorkspace = (grant: DelegationGrant): boolean => {
      const workspaceId = query.workspaceId
      if (!workspaceId) return true
      const from = directory.find((candidate) => candidate.id === grant.fromPrincipalId)
      const to = directory.find((candidate) => candidate.id === grant.toPrincipalId)
      return Boolean(from?.workspaceIds.includes(workspaceId) || to?.workspaceIds.includes(workspaceId))
    }
    const grants = await this.currentGrants()
    return grants
      .filter((grant) => grant.tenantId === tenantId && inWorkspace(grant) && (!query.principalId || grant.fromPrincipalId === query.principalId || grant.toPrincipalId === query.principalId))
      .map((grant) => withStatus(grant, now))
  }

  async getGrant(grantId: string, tenantId: string | undefined, now = new Date()): Promise<DelegationGrant | undefined> {
    const grants = await this.currentGrants()
    const grant = grants.find((candidate) => candidate.id === grantId && candidate.tenantId === tenantId)
    return grant ? withStatus(grant, now) : undefined
  }

  async createGrant(request: CreateDelegationGrantRequest, fromPrincipalId: string, tenantId: string | undefined, now = new Date()): Promise<DelegationGrant> {
    const issuedAt = now.toISOString()
    const expiresAt = request.expiresAt ?? new Date(now.getTime() + (request.validMinutes ?? 60) * 60_000).toISOString()
    const body: Omit<DelegationGrant, 'artifactDigest'> = {
      id: `grant_${randomUUID()}`,
      ...(tenantId ? { tenantId } : {}),
      fromPrincipalId,
      toPrincipalId: request.toPrincipalId,
      scope: [...request.scope],
      purposeIds: [...request.purposeIds],
      audience: request.audience,
      issuedAt,
      expiresAt,
      maximumActions: request.maximumActions,
      consumedActions: 0,
      riskTierCeiling: request.riskTierCeiling,
      contractIds: [...request.contractIds],
      status: 'ACTIVE',
    }
    const grant = await this.delegations.append({ ...body, artifactDigest: digest(body) })
    return withStatus(grant, now)
  }

  async revokeGrant(grantId: string, rationale: string, tenantId: string | undefined, now = new Date()): Promise<DelegationGrant> {
    const existing = await this.rawGrant(grantId, tenantId)
    if (!existing) throw new Error('DELEGATION_GRANT_NOT_FOUND')
    if (existing.status === 'REVOKED') throw new Error('DELEGATION_GRANT_ALREADY_REVOKED')
    // The chain link belongs to the row that carried it, so the successor is digested without it.
    const { artifactDigest: _digest, chain: _chain, ...body } = existing
    const revoked: DelegationGrant = { ...body, scope: [...body.scope, `revoked:${now.toISOString()}:${rationale}`], status: 'REVOKED', artifactDigest: digest({ ...body, status: 'REVOKED' }) }
    // Keyed by the revocation, identified as the grant: a distinct row describing the same grant.
    return this.delegations.append(revoked, `grant_revocation_${randomUUID()}`)
  }

  /** Budget is spent, not estimated: one action consumed per authorizing use. */
  async consume(grantId: string, tenantId: string | undefined, now = new Date()): Promise<DelegationGrant | undefined> {
    const existing = await this.rawGrant(grantId, tenantId)
    if (!existing) return undefined
    const next = await this.delegations.append(
      { ...existing, consumedActions: existing.consumedActions + 1 },
      `grant_consumption_${randomUUID()}`,
    )
    return withStatus(next, now)
  }

  /** The chain the disposition records: who acted, and under whose authority. */
  async chainFor(principalId: string, tenantId: string | undefined, now = new Date()): Promise<PrincipalChainLink[]> {
    const directory = await this.all(undefined, tenantId)
    const principal = directory.find((candidate) => candidate.id === principalId)
    const head: PrincipalChainLink = principal
      ? {
        principalId: principal.id,
        displayName: principal.displayName,
        kind: principal.kind,
        role: principal.roles[0] ?? 'Unassigned',
        via: principal.kind === 'SERVICE' ? 'SERVICE_ACCOUNT' : 'AUTHENTICATION',
      }
      : { principalId, displayName: principalId, kind: 'SERVICE', role: 'Bearer token identity', via: 'SERVICE_ACCOUNT' }
    const grants = await this.grants({ principalId }, tenantId, now)
    const delegations = grants
      .filter((grant) => grant.toPrincipalId === principalId && grant.status === 'ACTIVE')
      .map((grant): PrincipalChainLink => {
        const from = directory.find((candidate) => candidate.id === grant.fromPrincipalId)
        return {
          principalId: grant.fromPrincipalId,
          displayName: from?.displayName ?? grant.fromPrincipalId,
          kind: from?.kind ?? 'HUMAN',
          role: from?.roles[0] ?? 'Unassigned',
          via: 'DELEGATION',
          grantId: grant.id,
          scope: grant.scope,
          expiresAt: grant.expiresAt,
        }
      })
    return [head, ...delegations]
  }

  async identityGraph(workspaceId: string | undefined, tenantId: string | undefined, now = new Date()): Promise<IdentityGraph> {
    return {
      principals: await this.all(workspaceId, tenantId),
      grants: await this.grants(workspaceId ? { workspaceId } : {}, tenantId, now),
      autonomyTiers: [...autonomyTierDefinitions],
    }
  }

  /**
   * Writes the declared directory and grants once, into a ledger that has never held any.
   *
   * They used to be a fallback document written whenever the file was absent. A ledger has no
   * document to fall back to, so the demo identities are appended like anything else — and only
   * when the ledger is empty, because seeding a ledger that already has history would restate
   * facts that are already recorded.
   */
  private async seedDeclared(workspaceIds: string[], contractIds: string[]): Promise<void> {
    if ((await this.principals.list()).length === 0) {
      for (const principal of declaredDirectory(workspaceIds)) {
        await this.principals.append({ ...principal, artifactDigest: digest(principal) })
      }
    }
    if ((await this.delegations.list()).length === 0) {
      for (const grant of declaredGrants(contractIds)) await this.delegations.append(grant)
    }
  }

  /** The stored grant, before expiry and exhaustion are derived, which a successor must not inherit. */
  private async rawGrant(grantId: string, tenantId: string | undefined): Promise<DelegationGrant | undefined> {
    const grants = await this.currentGrants()
    return grants.find((candidate) => candidate.id === grantId && candidate.tenantId === tenantId)
  }

  /**
   * Folds the principal ledger down to the latest artifact for each principal.
   *
   * Ledger order is chain order, so the last artifact bearing a principal's id is its current state.
   */
  private async current(): Promise<PrincipalArtifact[]> {
    const byPrincipal = new Map<string, PrincipalArtifact>()
    for (const artifact of await this.principals.list()) byPrincipal.set(artifact.id, artifact)
    return [...byPrincipal.values()]
  }

  /** Folds the delegation ledger down to the latest artifact for each grant. */
  private async currentGrants(): Promise<DelegationGrant[]> {
    const byGrant = new Map<string, DelegationGrant>()
    for (const artifact of await this.delegations.list()) byGrant.set(artifact.id, artifact)
    return [...byGrant.values()]
  }
}

/** Expiry and budget exhaustion are facts about the grant, so they are derived on every read. */
function withStatus(grant: DelegationGrant, now: Date): DelegationGrant {
  const clone = structuredClone(grant)
  if (clone.status !== 'ACTIVE') return clone
  if (new Date(clone.expiresAt).getTime() <= now.getTime()) return { ...clone, status: 'EXPIRED' }
  if (clone.consumedActions >= clone.maximumActions) return { ...clone, status: 'EXHAUSTED' }
  return clone
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
