import { createHash, randomUUID, sign, verify, type KeyObject } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Attestation, AttestationPredicate, AttestationSubjectKind, AttestationVerification } from '@lattice/contracts'

interface AttestationDocument {
  schemaVersion: '1.0'
  attestations: Attestation[]
}

/**
 * Structurally satisfied by `PlanSigner`, so an attestation is signed by the same governed key as
 * an execution plan — including a managed KMS — rather than by a second, ephemeral one. `verify`
 * takes the key id so an attestation signed before a rotation still verifies afterwards.
 */
export interface AttestationSigner {
  readonly activeKeyId: string
  sign(payload: Buffer): Promise<string>
  verify(payload: Buffer, signature: string, keyId: string): boolean
}

export interface MintAttestationInput {
  subjectKind: AttestationSubjectKind
  subjectId: string
  predicateType: AttestationPredicate
  subject: unknown
  signerId: string
  signerRoleAtSigning: string
  issuedAt?: string
  expiresAt?: string
}

export const predicateForSubject: Readonly<Record<AttestationSubjectKind, AttestationPredicate>> = {
  DISPOSITION: 'lattice.disposition.v1',
  EXECUTION: 'lattice.execution.v1',
  ASSURANCE_RUN: 'lattice.assurance.v1',
  EVAL_RUN: 'lattice.evaluation.v1',
  REVIEW_DECISION: 'lattice.review.v1',
  RELEASE: 'lattice.release.v1',
  EMERGENCY_AUTHORIZATION: 'lattice.emergency.v1',
}

/**
 * A local Ed25519 signer, for tests and for anything that has key material in hand. Production
 * passes the process-wide `PlanSigner` instead, which may be backed by a KMS.
 */
export function createSigner(keyId: string, privateKey: KeyObject, publicKey: KeyObject): AttestationSigner {
  return {
    activeKeyId: keyId,
    sign: async (payload) => sign(null, payload, privateKey).toString('base64url'),
    verify: (payload, signature) => {
      try {
        return verify(null, payload, publicKey, Buffer.from(signature, 'base64url'))
      } catch {
        return false
      }
    },
  }
}

/** Deterministic serialization with sorted keys — a verifier must be able to reproduce it. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
}

export function canonicalDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`
}

/** Strips the back-reference an artifact carries to its own attestations so mint and verify agree. */
export function attestationPayload(subject: unknown): unknown {
  if (!subject || typeof subject !== 'object' || Array.isArray(subject)) return subject
  const { attestationIds: _attestationIds, ...rest } = subject as Record<string, unknown>
  return rest
}

export class AttestationStore {
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(private readonly filePath: string, private document: AttestationDocument, private readonly signer: AttestationSigner) {}

  static async open(filePath: string, signer: AttestationSigner): Promise<AttestationStore> {
    try {
      return new AttestationStore(filePath, JSON.parse(await readFile(filePath, 'utf8')) as AttestationDocument, signer)
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
      const store = new AttestationStore(filePath, { schemaVersion: '1.0', attestations: [] }, signer)
      await store.persist()
      return store
    }
  }

  list(query: { subjectId?: string; subjectKind?: AttestationSubjectKind } = {}): Attestation[] {
    return this.document.attestations
      .filter((item) => (!query.subjectId || item.subjectId === query.subjectId) && (!query.subjectKind || item.subjectKind === query.subjectKind))
      .map((item) => structuredClone(item))
      .reverse()
  }

  get(attestationId: string): Attestation | undefined {
    const attestation = this.document.attestations.find((candidate) => candidate.id === attestationId)
    return attestation ? structuredClone(attestation) : undefined
  }

  async mint(input: MintAttestationInput): Promise<Attestation> {
    const payloadDigest = canonicalDigest(attestationPayload(input.subject))
    const logIndex = this.document.attestations.length
    const logRoot = chainRoot(this.document.attestations.at(-1)?.logRoot, payloadDigest)
    const body = {
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      predicateType: input.predicateType,
      canonicalization: 'JSON_SORTED_KEYS_SHA256' as const,
      payloadDigest,
      signerId: input.signerId,
      signerRoleAtSigning: input.signerRoleAtSigning,
      keyId: this.signer.activeKeyId,
      issuedAt: input.issuedAt ?? new Date().toISOString(),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      logIndex,
      logRoot,
    }
    const attestation: Attestation = {
      id: `att_${randomUUID()}`,
      ...body,
      signatureAlgorithm: 'Ed25519',
      signature: await this.signer.sign(Buffer.from(canonicalJson(body))),
    }
    this.document.attestations.push(attestation)
    await this.persist()
    return structuredClone(attestation)
  }

  /**
   * Every check is genuinely performed. A check that cannot be performed — an unresolvable
   * subject, an unknown key — reports UNAVAILABLE with an honest message, never PASS.
   */
  verify(attestationId: string, subject: unknown, currentKeyId: string, now = new Date()): AttestationVerification | undefined {
    const index = this.document.attestations.findIndex((candidate) => candidate.id === attestationId)
    const attestation = this.document.attestations[index]
    if (!attestation) return undefined
    const checks: AttestationVerification['checks'] = []

    checks.push(attestation.keyId === currentKeyId
      ? { id: 'KEY_KNOWN', status: 'PASS', message: `Signed with ${attestation.keyId}, which matches the key published at /v1/keys/current.` }
      : { id: 'KEY_KNOWN', status: 'FAIL', message: `Signed with ${attestation.keyId}; /v1/keys/current publishes ${currentKeyId}.` })

    const { id: _id, signature, signatureAlgorithm: _algorithm, ...body } = attestation
    const signatureValid = this.signer.verify(Buffer.from(canonicalJson(body)), signature, attestation.keyId)
    checks.push(signatureValid
      ? { id: 'SIGNATURE', status: 'PASS', message: 'Ed25519 signature verifies over the canonical attestation body.' }
      : { id: 'SIGNATURE', status: 'FAIL', message: 'Ed25519 signature does not verify over the canonical attestation body.' })

    if (subject === undefined) {
      checks.push({ id: 'PAYLOAD_DIGEST', status: 'UNAVAILABLE', message: `Subject ${attestation.subjectKind} ${attestation.subjectId} is no longer retained, so the digest cannot be recomputed.` })
    } else {
      const recomputed = canonicalDigest(attestationPayload(subject))
      checks.push(recomputed === attestation.payloadDigest
        ? { id: 'PAYLOAD_DIGEST', status: 'PASS', message: `Recomputed ${recomputed.slice(0, 23)}… from the stored subject and it matches.` }
        : { id: 'PAYLOAD_DIGEST', status: 'FAIL', message: `Stored subject digests to ${recomputed.slice(0, 23)}…; the attestation binds ${attestation.payloadDigest.slice(0, 23)}….` })
    }

    const expired = attestation.expiresAt ? new Date(attestation.expiresAt).getTime() < now.getTime() : false
    checks.push(expired
      ? { id: 'FRESHNESS', status: 'FAIL', message: `Expired at ${attestation.expiresAt}.` }
      : { id: 'FRESHNESS', status: 'PASS', message: attestation.expiresAt ? `Valid until ${attestation.expiresAt}.` : `Issued ${attestation.issuedAt}; no expiry was declared for this predicate.` })

    checks.push(attestation.revocation
      ? { id: 'REVOCATION', status: 'FAIL', message: `Revoked at ${attestation.revocation.revokedAt}: ${attestation.revocation.reason}` }
      : { id: 'REVOCATION', status: 'PASS', message: 'No revocation is recorded against this attestation in the local log.' })

    const recomputedRoot = chainRoot(this.document.attestations[index - 1]?.logRoot, attestation.payloadDigest)
    checks.push(recomputedRoot === attestation.logRoot && attestation.logIndex === index
      ? { id: 'LOG_INCLUSION', status: 'PASS', message: `Log entry ${attestation.logIndex} rechains to ${attestation.logRoot.slice(0, 23)}….` }
      : { id: 'LOG_INCLUSION', status: 'FAIL', message: `Log entry ${attestation.logIndex} does not rechain; recomputed ${recomputedRoot.slice(0, 23)}… at position ${index}.` })

    return {
      attestationId: attestation.id,
      verified: checks.every((item) => item.status === 'PASS'),
      verifiedAt: now.toISOString(),
      keyId: attestation.keyId,
      checks,
    }
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

function chainRoot(previousRoot: string | undefined, payloadDigest: string): string {
  return `sha256:${createHash('sha256').update(`${previousRoot ?? ''}|${payloadDigest}`).digest('hex')}`
}
