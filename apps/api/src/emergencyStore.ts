import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CreateEmergencyAuthorizationRequest, EmergencyAuthorization, EmergencyRetrospectiveRequest } from '@lattice/contracts'
import { canonicalJson, type AttestationSigner } from './attestations.js'

interface EmergencyDocument {
  schemaVersion: '1.0'
  authorizations: EmergencyAuthorization[]
}

/**
 * Break-glass (E18): a signed, time-boxed, identity-bound artifact. The grant path and the
 * retrospective queue live in the same store because a break-glass without a review queue is
 * just a bypass.
 */
export class EmergencyStore {
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(private readonly filePath: string, private document: EmergencyDocument, private readonly signer: AttestationSigner) {}

  static async open(filePath: string, signer: AttestationSigner): Promise<EmergencyStore> {
    try {
      return new EmergencyStore(filePath, JSON.parse(await readFile(filePath, 'utf8')) as EmergencyDocument, signer)
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
      const store = new EmergencyStore(filePath, { schemaVersion: '1.0', authorizations: [] }, signer)
      await store.persist()
      return store
    }
  }

  list(query: { contractId?: string; workspaceId?: string; status?: EmergencyAuthorization['status'] } = {}, now = new Date()): EmergencyAuthorization[] {
    return this.document.authorizations
      .filter((item) => (!query.contractId || item.contractId === query.contractId) && (!query.workspaceId || item.workspaceId === query.workspaceId))
      .map((item) => withStatus(item, now))
      .filter((item) => !query.status || item.status === query.status)
      .reverse()
  }

  /** Every grant lands here, used or not. */
  retrospectiveQueue(now = new Date()): EmergencyAuthorization[] {
    return this.list({}, now).filter((item) => !item.retrospective && item.status !== 'PENDING')
  }

  get(authorizationId: string, now = new Date()): EmergencyAuthorization | undefined {
    const authorization = this.document.authorizations.find((candidate) => candidate.id === authorizationId)
    return authorization ? withStatus(authorization, now) : undefined
  }

  async create(request: CreateEmergencyAuthorizationRequest, requestedBy: string, now = new Date()): Promise<EmergencyAuthorization> {
    const requestedAt = now.toISOString()
    const body = {
      id: `emergency_${randomUUID()}`,
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
    const authorization: EmergencyAuthorization = {
      ...body,
      signature: await this.signer.sign(Buffer.from(canonicalJson(body))),
      artifactDigest: digest(body),
    }
    this.document.authorizations.push(authorization)
    await this.persist()
    return withStatus(authorization, now)
  }

  async approve(authorizationId: string, role: string, rationale: string, principalId: string, now = new Date()): Promise<EmergencyAuthorization> {
    const index = this.document.authorizations.findIndex((candidate) => candidate.id === authorizationId)
    const existing = this.document.authorizations[index]
    if (!existing) throw new Error('EMERGENCY_AUTHORIZATION_NOT_FOUND')
    if (existing.status === 'REVOKED' || existing.status === 'DENIED') throw new Error('EMERGENCY_AUTHORIZATION_CLOSED')
    if (!existing.requiredApproverRoles.includes(role)) throw new Error('EMERGENCY_APPROVER_ROLE_NOT_REQUIRED')
    if (existing.approvals.some((approval) => approval.role === role)) throw new Error('EMERGENCY_ROLE_ALREADY_APPROVED')
    const approvals = [...existing.approvals, { principalId, role, approvedAt: now.toISOString(), rationale }]
    const complete = existing.requiredApproverRoles.every((required) => approvals.some((approval) => approval.role === required))
    const next: EmergencyAuthorization = { ...existing, approvals, status: complete ? 'ACTIVE' : 'PENDING' }
    this.document.authorizations[index] = next
    await this.persist()
    return withStatus(next, now)
  }

  async recordRetrospective(authorizationId: string, request: EmergencyRetrospectiveRequest, reviewedBy: string, now = new Date()): Promise<EmergencyAuthorization> {
    const index = this.document.authorizations.findIndex((candidate) => candidate.id === authorizationId)
    const existing = this.document.authorizations[index]
    if (!existing) throw new Error('EMERGENCY_AUTHORIZATION_NOT_FOUND')
    if (existing.retrospective) throw new Error('EMERGENCY_RETROSPECTIVE_ALREADY_RECORDED')
    const next: EmergencyAuthorization = {
      ...existing,
      retrospective: { reviewedBy, reviewedAt: now.toISOString(), verdict: request.verdict, notes: request.notes },
    }
    this.document.authorizations[index] = next
    await this.persist()
    return withStatus(next, now)
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

function withStatus(authorization: EmergencyAuthorization, now: Date): EmergencyAuthorization {
  const clone = structuredClone(authorization)
  if (clone.status !== 'ACTIVE') return clone
  if (new Date(clone.validUntil).getTime() <= now.getTime()) return { ...clone, status: 'EXPIRED' }
  return clone
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
