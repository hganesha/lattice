import assert from 'node:assert/strict'
import { generateKeyPairSync, sign, createHash, type KeyObject } from 'node:crypto'
import test from 'node:test'
import { counterpartyRiskContract, type SignedExecutionPlan, type UnsignedExecutionPlan } from '@lattice/contracts'
import { explainVerificationFailure, verifyExecutionPlan } from './verifier.js'

/** Mirrors how the API derives a key id, so a plan and a JWKS agree without sharing code. */
function thumbprint(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: 'jwk' }) as { crv?: string; kty?: string; x?: string }
  return createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x })).digest('base64url')
}

function issue(overrides: Partial<UnsignedExecutionPlan> = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const keyId = thumbprint(publicKey)
  const unsigned: UnsignedExecutionPlan = {
    schemaVersion: '1.1', planId: 'plan-1', resolutionId: 'res-1', decision: 'RESOLVED',
    riskTier: 'ANALYTICAL', principalId: 'agent-1', tenantId: 'tenant-a', grounding: 'LIVE',
    operation: 'risk.exposure', arguments: {}, metrics: [],
    intent: { resolverVersion: 'v', method: 'LEXICAL', indexDigest: 'sha256:i', operationId: 'risk.exposure', matchedQuestionIds: [], lexicalScore: 1, aggregateScore: 1, acceptance: 'AUTOMATIC', candidateMargin: 1, thresholds: { minimumSupportedScore: 0.5, automaticAcceptanceScore: 0.75, minimumCandidateMargin: 0.05 } },
    sourceBindings: [], requiredPermissions: [], expectedResultSchema: 'exposure@1', evidenceRefs: [],
    versions: counterpartyRiskContract.versions, contractDigest: 'sha256:contract',
    expiresAt: '2030-01-01T00:00:00.000Z', nonce: 'n-1',
    ...overrides,
  }
  const signature = sign(null, Buffer.from(JSON.stringify(unsigned)), privateKey).toString('base64url')
  const plan: SignedExecutionPlan = { ...unsigned, keyId, signatureAlgorithm: 'Ed25519', signature }
  const jwks = [{ ...(publicKey.export({ format: 'jwk' }) as object), kid: keyId, alg: 'EdDSA', use: 'sig' }]
  return { plan, jwks }
}

const now = new Date('2026-08-03T00:00:00.000Z')

test('verifies a well-formed plan from JWKS alone', () => {
  const { plan, jwks } = issue()
  const result = verifyExecutionPlan({ plan, jwks, now })

  assert.equal(result.valid, true)
  assert.deepEqual(result.failures, [])
  assert.equal(result.keyId, plan.keyId)
  assert.equal(result.grounding, 'LIVE')
})

test('a plan altered after issue fails the signature check', () => {
  const { plan, jwks } = issue()
  const tampered: SignedExecutionPlan = { ...plan, operation: 'risk.something_else' }

  const result = verifyExecutionPlan({ plan: tampered, jwks, now })
  assert.equal(result.valid, false)
  assert.deepEqual(result.failures, ['SIGNATURE_INVALID'])
})

test('a plan signed by an unknown key is rejected rather than trusted', () => {
  const { plan } = issue()
  const { jwks: otherKeys } = issue()

  const result = verifyExecutionPlan({ plan, jwks: otherKeys, now })
  assert.deepEqual(result.failures, ['SIGNING_KEY_UNKNOWN'])
})

test('a valid signature over an expired plan is still not actionable', () => {
  const { plan, jwks } = issue({ expiresAt: '2026-08-02T00:00:00.000Z' })

  const result = verifyExecutionPlan({ plan, jwks, now })
  assert.equal(result.valid, false)
  assert.deepEqual(result.failures, ['PLAN_EXPIRED'])
})

test('a plan issued to somebody else does not verify for this executor', () => {
  const { plan, jwks } = issue()

  assert.deepEqual(verifyExecutionPlan({ plan, jwks, now, principalId: 'agent-2' }).failures, ['PRINCIPAL_MISMATCH'])
  assert.deepEqual(verifyExecutionPlan({ plan, jwks, now, tenantId: 'tenant-b' }).failures, ['TENANT_MISMATCH'])
  assert.equal(verifyExecutionPlan({ plan, jwks, now, principalId: 'agent-1', tenantId: 'tenant-a' }).valid, true)
})

test('a plan pinned to a different release is rejected', () => {
  const { plan, jwks } = issue()

  const result = verifyExecutionPlan({ plan, jwks, now, expectedContractDigest: 'sha256:other' })
  assert.deepEqual(result.failures, ['CONTRACT_DIGEST_MISMATCH'])
})

test('every reason is reported at once rather than only the first', () => {
  const { plan, jwks } = issue({ expiresAt: '2026-08-02T00:00:00.000Z' })

  const result = verifyExecutionPlan({ plan, jwks, now, principalId: 'agent-2', expectedContractDigest: 'sha256:other' })
  assert.deepEqual(result.failures.sort(), ['CONTRACT_DIGEST_MISMATCH', 'PLAN_EXPIRED', 'PRINCIPAL_MISMATCH'])
})

test('simulated grounding is reported so an executor can refuse to act on a fixture', () => {
  const { plan, jwks } = issue({ grounding: 'SIMULATED' })
  assert.equal(verifyExecutionPlan({ plan, jwks, now }).grounding, 'SIMULATED')
})

test('every failure has an actionable explanation', () => {
  const failures = ['SIGNING_KEY_UNKNOWN', 'SIGNATURE_INVALID', 'PLAN_EXPIRED', 'PRINCIPAL_MISMATCH', 'TENANT_MISMATCH', 'CONTRACT_DIGEST_MISMATCH', 'UNSUPPORTED_ALGORITHM'] as const
  for (const failure of failures) {
    assert.ok(explainVerificationFailure(failure).length > 20, `${failure} needs a useful explanation`)
  }
})
