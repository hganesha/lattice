import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  autonomyTierDefinitions,
  type DelegationGrant,
  type IdentityGraph,
  type Principal,
  type PrincipalChainLink,
  type PurposeAudience,
  type RiskTier,
} from '@lattice/contracts'

interface PrincipalDocument {
  schemaVersion: '1.0'
  principals: Principal[]
}

interface DelegationDocument {
  schemaVersion: '1.0'
  grants: DelegationGrant[]
}

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
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(
    private readonly principalsPath: string,
    private readonly delegationsPath: string,
    private principalDocument: PrincipalDocument,
    private delegationDocument: DelegationDocument,
  ) {}

  static async open(principalsPath: string, delegationsPath: string, workspaceIds: string[], contractIds: string[]): Promise<PrincipalStore> {
    const principalDocument = await read<PrincipalDocument>(principalsPath, { schemaVersion: '1.0', principals: declaredDirectory(workspaceIds) })
    const delegationDocument = await read<DelegationDocument>(delegationsPath, { schemaVersion: '1.0', grants: declaredGrants(contractIds) })
    const store = new PrincipalStore(principalsPath, delegationsPath, principalDocument, delegationDocument)
    await store.persist()
    return store
  }

  all(workspaceId?: string): Principal[] {
    return this.principalDocument.principals
      .filter((principal) => !workspaceId || principal.workspaceIds.includes(workspaceId))
      .map((principal) => structuredClone(principal))
  }

  get(principalId: string): Principal | undefined {
    const principal = this.principalDocument.principals.find((candidate) => candidate.id === principalId)
    return principal ? structuredClone(principal) : undefined
  }

  /**
   * Principals seen in review, execution and disposition artifacts are recorded as what they
   * verifiably are — a bearer token identity — rather than being guessed into the human directory.
   */
  async observe(principalIds: string[], workspaceIds: string[], now = new Date()): Promise<Principal[]> {
    const added: Principal[] = []
    for (const principalId of [...new Set(principalIds)]) {
      if (!principalId || this.principalDocument.principals.some((candidate) => candidate.id === principalId)) continue
      const principal: Principal = {
        id: principalId,
        displayName: principalId,
        kind: 'SERVICE',
        roles: ['Bearer token identity'],
        workspaceIds: [...workspaceIds],
        authentication: { method: 'DEMO_TOKEN', issuer: 'lattice-context-api', assuranceLevel: 'AAL1', lastAuthenticatedAt: now.toISOString() },
        status: 'ACTIVE',
        createdAt: now.toISOString(),
      }
      this.principalDocument.principals.push(principal)
      added.push(structuredClone(principal))
    }
    if (added.length > 0) await this.persist()
    return added
  }

  grants(query: { workspaceId?: string; principalId?: string } = {}, now = new Date()): DelegationGrant[] {
    const inWorkspace = (grant: DelegationGrant): boolean => {
      if (!query.workspaceId) return true
      const from = this.get(grant.fromPrincipalId)
      const to = this.get(grant.toPrincipalId)
      return Boolean(from?.workspaceIds.includes(query.workspaceId) || to?.workspaceIds.includes(query.workspaceId))
    }
    return this.delegationDocument.grants
      .filter((grant) => inWorkspace(grant) && (!query.principalId || grant.fromPrincipalId === query.principalId || grant.toPrincipalId === query.principalId))
      .map((grant) => withStatus(grant, now))
  }

  getGrant(grantId: string, now = new Date()): DelegationGrant | undefined {
    const grant = this.delegationDocument.grants.find((candidate) => candidate.id === grantId)
    return grant ? withStatus(grant, now) : undefined
  }

  async createGrant(request: CreateDelegationGrantRequest, fromPrincipalId: string, now = new Date()): Promise<DelegationGrant> {
    const issuedAt = now.toISOString()
    const expiresAt = request.expiresAt ?? new Date(now.getTime() + (request.validMinutes ?? 60) * 60_000).toISOString()
    const body: Omit<DelegationGrant, 'artifactDigest'> = {
      id: `grant_${randomUUID()}`,
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
    const grant: DelegationGrant = { ...body, artifactDigest: digest(body) }
    this.delegationDocument.grants.push(grant)
    await this.persist()
    return withStatus(grant, now)
  }

  async revokeGrant(grantId: string, rationale: string, now = new Date()): Promise<DelegationGrant> {
    const index = this.delegationDocument.grants.findIndex((candidate) => candidate.id === grantId)
    const existing = this.delegationDocument.grants[index]
    if (!existing) throw new Error('DELEGATION_GRANT_NOT_FOUND')
    if (existing.status === 'REVOKED') throw new Error('DELEGATION_GRANT_ALREADY_REVOKED')
    const { artifactDigest: _digest, ...body } = existing
    const revoked: DelegationGrant = { ...body, scope: [...body.scope, `revoked:${now.toISOString()}:${rationale}`], status: 'REVOKED', artifactDigest: digest({ ...body, status: 'REVOKED' }) }
    this.delegationDocument.grants[index] = revoked
    await this.persist()
    return structuredClone(revoked)
  }

  /** Budget is spent, not estimated: one action consumed per authorizing use. */
  async consume(grantId: string, now = new Date()): Promise<DelegationGrant | undefined> {
    const index = this.delegationDocument.grants.findIndex((candidate) => candidate.id === grantId)
    const existing = this.delegationDocument.grants[index]
    if (!existing) return undefined
    const next: DelegationGrant = { ...existing, consumedActions: existing.consumedActions + 1 }
    this.delegationDocument.grants[index] = next
    await this.persist()
    return withStatus(next, now)
  }

  /** The chain the disposition records: who acted, and under whose authority. */
  chainFor(principalId: string, now = new Date()): PrincipalChainLink[] {
    const principal = this.get(principalId)
    const head: PrincipalChainLink = principal
      ? {
        principalId: principal.id,
        displayName: principal.displayName,
        kind: principal.kind,
        role: principal.roles[0] ?? 'Unassigned',
        via: principal.kind === 'SERVICE' ? 'SERVICE_ACCOUNT' : 'AUTHENTICATION',
      }
      : { principalId, displayName: principalId, kind: 'SERVICE', role: 'Bearer token identity', via: 'SERVICE_ACCOUNT' }
    const delegations = this.grants({ principalId }, now)
      .filter((grant) => grant.toPrincipalId === principalId && grant.status === 'ACTIVE')
      .map((grant): PrincipalChainLink => {
        const from = this.get(grant.fromPrincipalId)
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

  identityGraph(workspaceId: string | undefined, now = new Date()): IdentityGraph {
    return {
      principals: this.all(workspaceId),
      grants: this.grants(workspaceId ? { workspaceId } : {}, now),
      autonomyTiers: [...autonomyTierDefinitions],
    }
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await write(this.principalsPath, this.principalDocument)
      await write(this.delegationsPath, this.delegationDocument)
    })
    await this.writeQueue
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

async function read<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
    if (!missing) throw error
    return fallback
  }
}

async function write(filePath: string, document: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, filePath)
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
