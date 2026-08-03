# @lattice/plan-verifier

Verifies a Lattice execution plan offline, from a JWKS alone.

The point of signing a plan is that whoever acts on it can check it **without trusting the
service that issued it**. That only holds if verification lives outside the API — which is what
this is. Fetch the key set once, then verify plans with no further calls.

```ts
import { verifyExecutionPlan, explainVerificationFailure } from '@lattice/plan-verifier'

const { keys } = await fetch('https://lattice.example.com/v1/keys').then((r) => r.json())

const result = verifyExecutionPlan({
  plan,
  jwks: keys,
  principalId: 'agent-service-principal',   // who is about to act
  tenantId: 'organization-uuid',
  expectedContractDigest: activeDigest,     // the release you believe is current
})

if (!result.valid) {
  throw new Error(result.failures.map(explainVerificationFailure).join(' '))
}
if (result.grounding === 'SIMULATED') {
  throw new Error('This plan was resolved from documented samples, not live sources.')
}
```

## Why it checks more than the signature

A valid signature over an expired plan, a plan pinned to a different contract release, or a plan
issued to somebody else is **not** a plan you should act on — and an executor that only checks
the signature will act on all three. So verification reports:

| Failure | Meaning |
|---|---|
| `SIGNATURE_INVALID` | The plan was altered after it was issued. |
| `SIGNING_KEY_UNKNOWN` | The plan names a key this JWKS does not contain. |
| `PLAN_EXPIRED` | Plans are short-lived; compile the question again. |
| `PRINCIPAL_MISMATCH` | A plan is a capability for one subject, not a bearer token. |
| `TENANT_MISMATCH` | Issued in a different tenant. |
| `CONTRACT_DIGEST_MISMATCH` | Pinned to a release other than the one you consider active. |
| `UNSUPPORTED_ALGORITHM` | Signed with an algorithm this verifier does not support. |

Every applicable failure is returned at once, so an operator sees all of them rather than
fixing one and rediscovering the next.

`grounding` is reported separately because it is not a validity question: a `SIMULATED` plan can
be perfectly valid and still must not be presented as a live answer.

## Key rotation

`GET /v1/keys` returns retired keys alongside the active one, so a plan signed before a rotation
keeps verifying until it expires. Refresh the key set when you encounter `SIGNING_KEY_UNKNOWN`;
if it is still missing afterwards, the plan was not issued by that service.
