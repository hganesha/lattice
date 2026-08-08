import { createHash, randomUUID } from 'node:crypto'
import type { CreateEmergencyAuthorizationRequest, EmergencyAuthorization, EmergencyRetrospectiveRequest } from '@lattice/contracts'
import { canonicalJson, type AttestationSigner } from './attestations.js'
import { FileLedgerStorage, type LedgerStorage } from './governanceLedger.js'

/**
 * Break-glass (E18): a signed, time-boxed, identity-bound artifact. The grant path and the
 * retrospective queue live in the same store because a break-glass without a review queue is
 * just a bypass.
 *
 * Kept as an append-only ledger, because a bypass whose record can be edited afterwards is
 * indistinguishable from one that never happened. Approving a grant and reviewing it in
 * retrospect each append a superseding artifact carrying the same authorization id, so the
 * sequence of approvals — and the gap before the retrospective — survives in the ledger.
 */
export class EmergencyStore {
  constructor(private readonly storage: LedgerStorage<EmergencyAuthorization>, private readonly signer: AttestationSigner) {}

  static async open(filePath: string, signer: AttestationSigner): Promise<EmergencyStore> {
    return new EmergencyStore(
      await FileLedgerStorage.open<EmergencyAuthorization>(filePath, 'authorizations', 'Emergency authorization'),
      signer,
    )
  }

  async list(query: { contractId?: string; workspaceId?: string; status?: EmergencyAuthorization['status'] }, tenantId: string | undefined, now = new Date()): Promise<EmergencyAuthorization[]> {
    const authorizations = await this.current()
    return authorizations
      .filter((item) => item.tenantId === tenantId && (!query.contractId || item.contractId === query.contractId) && (!query.workspaceId || item.workspaceId === query.workspaceId))
      .map((item) => withStatus(item, now))
      .filter((item) => !query.status || item.status === query.status)
      .reverse()
  }

  /** Every grant lands here, used or not. */
  async retrospectiveQueue(tenantId: string | undefined, now = new Date()): Promise<EmergencyAuthorization[]> {
    const authorizations = await this.list({}, tenantId, now)
    return authorizations.filter((item) => !item.retrospective && item.status !== 'PENDING')
  }

  async get(authorizationId: string, tenantId: string | undefined, now = new Date()): Promise<EmergencyAuthorization | undefined> {
    const authorization = await this.raw(authorizationId, tenantId)
    return authorization ? withStatus(authorization, now) : undefined
  }

  async create(request: CreateEmergencyAuthorizationRequest, requestedBy: string, tenantId: string | undefined, now = new Date()): Promise<EmergencyAuthorization> {
    const requestedAt = now.toISOString()
    const body = {
      id: `emergency_${randomUUID()}`,
      ...(tenantId ? { tenantId } : {}),
      contractId: request.contractId,
      ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
      requestedBy,
      requestedAt,
      justification: request.justification,
      maximumActions: request.maximumActions,
      consumedActions: 0,
      validFrom: requestedAt,
      validUntil: new Date(now.getTime() + request.validMinutes * 60_000).toISOString(),
      requiredApproverRoles: [...request.requiredApproverRoles],
      approvals: [] as EmergencyAuthorization['approvals'],
      compensatingControls: [...request.compensatingControls],
      status: 'PENDING' as const,
      keyId: this.signer.activeKeyId,
    }
    const authorization = await this.storage.append({
      ...body,
      signature: await this.signer.sign(Buffer.from(canonicalJson(body))),
      artifactDigest: digest(body),
    })
    return withStatus(authorization, now)
  }

  async approve(authorizationId: string, role: string, rationale: string, principalId: string, tenantId: string | undefined, now = new Date()): Promise<EmergencyAuthorization> {
    const existing = await this.raw(authorizationId, tenantId)
    if (!existing) throw new Error('EMERGENCY_AUTHORIZATION_NOT_FOUND')
    if (existing.status === 'REVOKED' || existing.status === 'DENIED') throw new Error('EMERGENCY_AUTHORIZATION_CLOSED')
    if (!existing.requiredApproverRoles.includes(role)) throw new Error('EMERGENCY_APPROVER_ROLE_NOT_REQUIRED')
    if (existing.approvals.some((approval) => approval.role === role)) throw new Error('EMERGENCY_ROLE_ALREADY_APPROVED')
    const approvals = [...existing.approvals, { principalId, role, approvedAt: now.toISOString(), rationale }]
    const complete = existing.requiredApproverRoles.every((required) => approvals.some((approval) => approval.role === required))
    // Keyed by the approval, identified as the authorization: a distinct row for the same grant.
    // The signature and digest stay as minted, because they attest to the grant that was asked
    // for; re-signing each approval would make the artifact vouch for its own later state.
    const next = await this.storage.append(
      { ...existing, approvals, status: complete ? 'ACTIVE' : 'PENDING' },
      `emergency_approval_${randomUUID()}`,
    )
    return withStatus(next, now)
  }

  async recordRetrospective(authorizationId: string, request: EmergencyRetrospectiveRequest, reviewedBy: string, tenantId: string | undefined, now = new Date()): Promise<EmergencyAuthorization> {
    const existing = await this.raw(authorizationId, tenantId)
    if (!existing) throw new Error('EMERGENCY_AUTHORIZATION_NOT_FOUND')
    if (existing.retrospective) throw new Error('EMERGENCY_RETROSPECTIVE_ALREADY_RECORDED')
    const next = await this.storage.append(
      {
        ...existing,
        retrospective: { reviewedBy, reviewedAt: now.toISOString(), verdict: request.verdict, notes: request.notes },
      },
      `emergency_retrospective_${randomUUID()}`,
    )
    return withStatus(next, now)
  }

  /** The stored artifact, before expiry is derived, which a successor must not inherit as its status. */
  private async raw(authorizationId: string, tenantId: string | undefined): Promise<EmergencyAuthorization | undefined> {
    const authorizations = await this.current()
    return authorizations.find((candidate) => candidate.id === authorizationId && candidate.tenantId === tenantId)
  }

  /**
   * Folds the ledger down to the latest artifact for each authorization.
   *
   * Ledger order is chain order, so the last artifact bearing an authorization's id is its
   * current state.
   */
  private async current(): Promise<EmergencyAuthorization[]> {
    const byAuthorization = new Map<string, EmergencyAuthorization>()
    for (const artifact of await this.storage.list()) byAuthorization.set(artifact.id, artifact)
    return [...byAuthorization.values()]
  }
}

function withStatus(authorization: EmergencyAuthorization, now: Date): EmergencyAuthorization {
  const clone = structuredClone(authorization)
  if (clone.status !== 'ACTIVE') return clone
  if (new Date(clone.validUntil).getTime() <= now.getTime()) return { ...clone, status: 'EXPIRED' }
  return clone
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
