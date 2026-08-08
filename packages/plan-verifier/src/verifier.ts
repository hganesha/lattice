import { createPublicKey, verify, type JsonWebKey } from 'node:crypto'
import type { SignedExecutionPlan } from '@lattice/contracts'

/**
 * Offline verification of a Lattice execution plan.
 *
 * The point of signing a plan is that whoever acts on it can check it without trusting the
 * service that issued it. That requires verification to live outside the API — which is what
 * this is: fetch the JWKS once, then verify plans with no further calls.
 *
 * Verification is deliberately more than a signature check. A valid signature over an expired
 * plan, a plan for a different contract release, or a plan issued to somebody else is not a
 * plan you should act on, and an executor that only checks the signature will act on all three.
 */

export interface PlanVerificationInput {
  plan: SignedExecutionPlan
  /** The `keys` array from `GET /v1/keys`. */
  jwks: Array<JsonWebKey & { kid?: string }>
  /** Who is about to act on the plan. Verification fails if it was issued to anyone else. */
  principalId?: string
  tenantId?: string
  /** Digest of the contract release the executor believes is active. */
  expectedContractDigest?: string
  now?: Date
}

export type PlanVerificationFailure =
  | 'SIGNING_KEY_UNKNOWN'
  | 'SIGNATURE_INVALID'
  | 'PLAN_EXPIRED'
  | 'PRINCIPAL_MISMATCH'
  | 'TENANT_MISMATCH'
  | 'CONTRACT_DIGEST_MISMATCH'
  | 'UNSUPPORTED_ALGORITHM'

export interface PlanVerificationResult {
  valid: boolean
  /** Every reason the plan was rejected, so a caller can report all of them at once. */
  failures: PlanVerificationFailure[]
  keyId: string
  expiresAt: string
  /** Whether the decision behind this plan came from live sources or documented samples. */
  grounding: SignedExecutionPlan['grounding']
}

export function verifyExecutionPlan(input: PlanVerificationInput): PlanVerificationResult {
  const { plan } = input
  const now = input.now ?? new Date()
  const failures: PlanVerificationFailure[] = []

  if (plan.signatureAlgorithm !== 'Ed25519' && plan.signatureAlgorithm !== 'ES256') {
    failures.push('UNSUPPORTED_ALGORITHM')
  } else {
    const jwk = input.jwks.find((candidate) => candidate.kid === plan.keyId)
    if (!jwk) failures.push('SIGNING_KEY_UNKNOWN')
    else if (!signatureMatches(plan, jwk)) failures.push('SIGNATURE_INVALID')
  }

  if (Number.isNaN(Date.parse(plan.expiresAt)) || new Date(plan.expiresAt) <= now) failures.push('PLAN_EXPIRED')
  if (input.principalId !== undefined && plan.principalId !== input.principalId) failures.push('PRINCIPAL_MISMATCH')
  if (input.tenantId !== undefined && (plan.tenantId ?? undefined) !== input.tenantId) failures.push('TENANT_MISMATCH')
  if (input.expectedContractDigest !== undefined && plan.contractDigest !== input.expectedContractDigest) {
    failures.push('CONTRACT_DIGEST_MISMATCH')
  }

  return {
    valid: failures.length === 0,
    failures,
    keyId: plan.keyId,
    expiresAt: plan.expiresAt,
    grounding: plan.grounding,
  }
}

/**
 * The signature covers the plan exactly as it was before the signing fields were added, so they
 * are removed in the same order the issuer added them and the remainder is re-serialized.
 */
function signatureMatches(plan: SignedExecutionPlan, jwk: JsonWebKey): boolean {
  const { keyId: _keyId, signatureAlgorithm, signature, ...unsigned } = plan
  const payload = Buffer.from(JSON.stringify(unsigned))
  try {
    const key = createPublicKey({ key: jwk, format: 'jwk' })
    if (signatureAlgorithm === 'Ed25519') {
      return verify(null, payload, key, Buffer.from(signature, 'base64url'))
    }
    // ES256 signatures follow the JWS convention of raw r||s rather than DER, whichever KMS
    // produced them, so verification must be told not to expect DER.
    return verify('sha256', payload, { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))
  } catch {
    return false
  }
}

/** Human-readable reason for each failure, for surfacing to an operator. */
export function explainVerificationFailure(failure: PlanVerificationFailure): string {
  switch (failure) {
    case 'SIGNING_KEY_UNKNOWN':
      return 'The plan names a signing key this JWKS does not contain. Refresh the key set; if it is still missing, the plan was not issued by this service.'
    case 'SIGNATURE_INVALID':
      return 'The signature does not match the plan contents. The plan has been altered since it was issued.'
    case 'PLAN_EXPIRED':
      return 'The plan is past its expiry. Compile the question again.'
    case 'PRINCIPAL_MISMATCH':
      return 'The plan was issued to a different principal. A plan is a capability for one subject.'
    case 'TENANT_MISMATCH':
      return 'The plan was issued in a different tenant.'
    case 'CONTRACT_DIGEST_MISMATCH':
      return 'The plan is pinned to a different contract release than the one you consider active.'
    case 'UNSUPPORTED_ALGORITHM':
      return 'The plan is signed with an algorithm this verifier does not support. Only Ed25519 and ES256 are recognized.'
  }
}
