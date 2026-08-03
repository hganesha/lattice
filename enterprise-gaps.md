# Lattice enterprise gaps

A critical review of the current Studio + Context API, verified against a running build on 2 August 2026 (`main` @ `4e10d2b`). The focus is what has to change before an enterprise can put this next to Databricks/Snowflake/Fabric, its data catalog, and its agent factory.

`docs/architecture.md` already carries an honest "Current boundaries and intentional gaps" table. This document deliberately does **not** restate it. It covers two things that table does not: (1) defects and design risks in what is already built, and (2) the integration surface with existing enterprise data and agent platforms, which is currently absent rather than deferred.

> **Status.** The six P0 items in §4 have since been implemented and verified; each is marked **FIXED** inline with what changed. Everything marked P1 or P2 is still open. The verification transcript in §1 records the behaviour *before* those fixes — §1.1 records the same sequence after.

---

## 1. Verification performed

| Check | Result |
|---|---|
| `pnpm build` (all 6 packages) | Pass |
| `pnpm test` | Pass — 145 tests (compiler-core 14, importer-core 8, exporter-core 4, api 58, studio 61 across 21 files) |
| `packages/contracts` test count | **0** — 16,488 lines of generated ontology and 868 lines of contract types are untested in their own package |
| README "Try the compiler" curl | **Fails** — returns 422 `STALE_CONTEXT` / `EVIDENCE_EXCEEDS_POLICY_FRESHNESS` |
| Full runtime loop (compile → approve → resume → execute) on `contract-airline-dispatch-release` | Works end to end, `status: SUCCESS` |
| Cross-principal plan access | **No isolation** — see 2.2 |

Live transcript of the working loop (dev auth, four distinct bearer tokens):

```
POST /v1/compile            (alice) → 202 APPROVAL_REQUIRED, OPERATIONAL_ACTION, lexicalScore 1.0, acceptance AUTOMATIC
POST /v1/runtime-approvals/…/decisions (bob)   → 201  (separation of duty correctly enforced)
POST /v1/runtime-approvals/…/resume    (carol) → 200  signed plan issued
POST /v1/plans/…/execute               (dave)  → 200  SUCCESS
```

`dave` never compiled, never requested, never approved, and is in no way bound to the plan. That is finding 2.2.

The plan that came back carried `contractDigest: "sha256:reference-contract-airline-dispatch-release-1"` — a literal placeholder, not a content hash (`packages/contracts/src/airlineContracts.ts:360`, `telecommunicationsContracts.ts:265`, `counterpartyContract.ts:13`). Every seeded reference contract — the airline and telco regulatory packs that are the demo centrepiece — has a fake digest, so the digest pin on those plans proves nothing. Real publishes hash correctly (`apps/api/src/registry.ts:181`). *Still open.*

## 1.1 Verification after the P0 fixes

The same sequence, replayed against the patched build with four distinct dev identities:

```
POST /v1/compile              (alice) → 202  grounding SIMULATED, plan.grounding SIMULATED,
                                             plan bound to alice/tenant_dev, schemaVersion 1.1
POST /v1/runtime-approvals/…/decisions (bob)   → 201  separation of duty still enforced
POST /v1/runtime-approvals/…/resume    (carol) → 200  plan re-bound to carol, the operator who will act
POST /v1/plans/…/verify                (dave)  → 404  PLAN_NOT_FOUND
POST /v1/plans/…/execute               (dave)  → 404  PLAN_NOT_FOUND
POST /v1/plans/…/execute  (carol, declaring
                     her own permissions)      → 400  PERMISSIONS_IN_BODY_FORBIDDEN
POST /v1/plans/…/execute               (carol) → 200  SUCCESS, permissions derived from her token
```

Unit and browser suites: 164 unit tests pass (compiler-core 18, importer-core 8, exporter-core 4, api 74, studio 63 across 21 files) and 9 Playwright tests pass. `packages/contracts` still has no tests of its own.

---

## 2. Correctness and security findings in what is built

Ranked by what would stop a security review.

### 2.1 Execution permissions are self-asserted by the caller — P0 · FIXED

`apps/api/src/server.ts:846-848` takes `grantedPermissions` **from the request body** and checks the plan's `requiredPermissions` against it.

```
POST /v1/plans/{id}/execute  { "grantedPermissions": ["airline.dispatch.read"] }  → SUCCESS
```

The client declares its own entitlements. There is no derivation from the token, no scope check, no entitlement service. Every permission string in every contract and every `requiredPermissions` gate in the compiler is decorative at runtime. This is the single most damaging finding: it invalidates the "permissions are governed" claim for the entire product.

Fix: derive granted permissions server-side from the verified token (scopes/roles/group claims) or from an entitlement callout, and treat a body-supplied list the same way `/v1/compile` already treats a body-supplied `principalId` — reject it (`server.ts:670`).

**Fixed.** `resolveGrantedPermissions` in `apps/api/src/authorization.ts` derives permissions from the identity's verified scopes and strips any scope containing a wildcard, so an issuer cannot mint blanket authority; the development authenticator is the only source of the `lattice:*` wildcard, keyed off `authenticationMode`. `/v1/plans/:id/execute` returns 400 `PERMISSIONS_IN_BODY_FORBIDDEN` for a body that asserts entitlements, and the Studio no longer echoes the plan's own requirements back at the API.

### 2.2 Signed plans are unbound bearer capabilities — P0 · FIXED

`UnsignedExecutionPlan` (`packages/contracts/src/types.ts:757`) has no subject: no `principalId`, no `tenantId`, no `organizationId`, no audience. `plans` and `planContractIds` are global process maps (`server.ts:67-68`), and `/v1/plans/:id/verify` and `/execute` check only authentication, never ownership. Consequences:

- Any authenticated principal in any organization can execute or verify any live plan.
- A plan captured from a log or a response body is replayable by anyone until `expiresAt`.
- **Denial of service on another org's approvals:** a failed permission check still writes a receipt and burns the nonce (`server.ts:850-864`). Verified — a deliberately wrong `grantedPermissions` call returned `DENIED`, and the immediately following correct call returned `PLAN_NONCE_ALREADY_CONSUMED`. One unauthorized call destroys an approved, human-signed-off operational plan and forces the whole compile/approve cycle again.

Fix: sign `principalId` + `tenantId` + `audience` into the plan, verify them on execute, scope the plan store by tenant, and only consume the nonce on an attempt that passed authorization.

**Fixed.** `UnsignedExecutionPlan` gained signed `principalId` and `tenantId` fields (`schemaVersion` 1.1), and the compiler fails closed with `PLAN_SUBJECT_REQUIRED` rather than issuing an unbound plan. `apps/api/src/planStore.ts` replaces the global maps with a `SubjectScopedStore` that returns a plan only to the subject it was issued to and sweeps entries past retention; paused clarifications are scoped the same way. Verify and execute both answer 404 for anyone else, so the response cannot be used to probe for live plan identifiers. `ExecutionStore.findConsumedByPlanId` ignores `DENIED` receipts, so a rejected attempt is still audited but no longer destroys an approved plan. Resume re-binds the renewed plan to the operator resuming it.

### 2.3 `DEVELOPER` role and `lattice:*` scope bypass every role gate in production — P0 · FIXED

`apps/api/src/authorization.ts:31`:

```ts
if (identity.scopes.includes('lattice:*') || identity.roles.includes('DEVELOPER')) return true
```

This bypass exists for the dev authenticator (`auth.ts:100-101`), but the check runs on **every** identity, including OIDC-verified ones. `roles` is populated straight from the configured roles claim (`auth.ts:82`, default `roles` or Supabase `app_metadata.roles`), and `applyTenantMembership` merges the org role into that same array without clearing IdP-supplied values (`tenancy.ts:47-52`). Any enterprise IdP that emits a group or role literally named `DEVELOPER` — a very common name — grants that user rollback, publish, runtime-status, and plan-execute authority in every organization they can reach.

Fix: gate the bypass on the authenticator that produced the identity, not on a role string; better, delete it and give the dev authenticator an explicit `OWNER` role.

**Fixed.** `RequestIdentity` carries `authenticationMode: 'DEVELOPMENT' | 'OIDC'`, set by the authenticator that produced it, and `hasOrganizationRole` keys the bypass off that. An OIDC identity carrying `roles: ['DEVELOPER']` and `scopes: ['lattice:*']` now fails every role gate, which `authorization.test.ts` asserts directly.

### 2.4 Governance reviews have no separation of duties — P1 · FIXED

`runtimeApprovalStore.decide` correctly refuses self-approval (`apps/api/src/runtimeApprovalStore.ts:66`). `ReviewStore.decide` (`reviewStore.ts:53-65`) does not: the same principal can submit a semantic type, source binding, or policy for review and approve it. Those approvals are exactly what unblocks publishing (`registry.ts:376, 401, 411`). An author with the `AUTHOR` + `REVIEWER` combination — or the `DEVELOPER` bypass above — can self-certify a contract to production.

Also, "immutable digest-backed artifacts" is by convention only: the record is replaced in place in a mutable JSON array, with no hash chain, no append-only storage, and no anti-rollback. Deleting or editing `data/review-artifacts.json` leaves no trace.

**Fixed.** `ReviewStore.decide` now refuses when the submitter is the decider, matching the rule
runtime approvals always enforced.

Tamper evidence landed for the two genuinely append-only ledgers, assurance runs and execution
receipts: each artifact is chained to its predecessor, and the store refuses to load when the
chain does not verify, so removal, reordering, insertion, or an edit is detectable rather than
silent. Writing that check surfaced a hole in the first cut — chaining `artifactDigest` alone
still let someone edit a field and leave the stale digest in place — so verification now
recomputes the receipt's digest from its content.

**Still open.** Reviews and runtime approvals mutate in place when decided, so chaining them
needs an event-sourced redesign rather than a field. And this is tamper *evidence*, not
resistance: anyone with write access can rewrite the whole chain. Making that impossible needs an
external anchor — a signed head, a WORM store, or a witness — which belongs with the KMS work in
P1.7.

### 2.5 Simulated sample data is signed as `EXACT`, `DIRECTLY_EVIDENCED` evidence — P1 · FIXED

`materializeSimulatedContext` runs inside `/v1/compile` and `/v1/clarifications/:id` for any published contract (`server.ts:685, 715`). For every required entity type with no real record, it fabricates one from the binding's `samplePayload` and stamps it `evidenceStrength: 'EXACT'` with an evidence record of `status: 'DIRECTLY_EVIDENCED'` and `observedAt: now` (`packages/contracts/src/simulatedContext.ts:40-49, 79-91`).

Verified on the published `contract-airline-dispatch-release`: all six required entity types resolved to synthetic samples, the plan's only evidence was `simulated-observation-binding-airline-ops-control@1`, and the `OPERATIONAL_ACTION` sailed through the policy's evidence-strength and freshness gates because the synthetic evidence is always maximally strong and always fresh.

Three problems compound:

1. The signed plan has no field distinguishing simulated from live grounding. A downstream agent that verifies the signature gets a valid, EXACT-evidence plan built from a hardcoded fixture. Only the post-hoc execution receipt records `mode: SIMULATED`.
2. The Studio never surfaces it either — no component reads `executionMode` for display (only `BindingEditor` writes it).
3. Because the synthetic entity absorbs every alias from mapped properties and operation keywords (`simulatedContext.ts:44`), it matches nearly any question. The airline question named no flight, yet a flight, aircraft, crew member, and dispatch release all "resolved". The abstention path — advertised as a first-class outcome — is unreachable for these contracts.

Fix: propagate a `grounding: 'SIMULATED' | 'LIVE'` field into the plan and the compile response, refuse to sign `PLANNING_DECISION`/`OPERATIONAL_ACTION` plans grounded in simulation, cap synthetic evidence at `WEAK`, and badge it in the Studio.

**Fixed, with one deliberate deviation.** `ContextGrounding` is computed by the compiler from the evidence actually backing the resolved arguments, and pinned into both the compile response and the signed plan. Synthetic evidence now carries `status: 'SIMULATED'` and is capped at `STRONG` rather than `EXACT`. Materialization is gated on the contract publishing `runtimeMode: 'REFERENCE'`, and `validateContract` refuses to publish a `SIMULATED` binding without that declaration — so a leftover sample payload on an ordinary contract resolves nothing and abstention is reachable again. The Studio badges simulated resolutions in the compiler view.

The deviation: synthetic evidence is capped at `STRONG`, not `WEAK`, and high-risk simulated plans are still signed rather than refused. Both reference packs set `minimumEvidenceStrength: 'STRONG'`, so either change would disable the shipped airline and telco demos, which are `OPERATIONAL_ACTION` by nature. The opt-in `runtimeMode` declaration is the substantive control — explicit, reviewable, and part of the published release and its digest. Revisit if reference packs stop being the demo centrepiece.

### 2.6 Ephemeral in-process signing key and plan store — P1 · FIXED

`generateKeyPairSync('ed25519')` at module load (`server.ts:70`). This is listed as a known gap, but the operational blast radius is worth stating: on Vercel (a deployment target the README documents) every serverless instance mints its own key, so `/v1/keys/current` returns a key that cannot verify a plan issued by a sibling instance, and `/v1/plans/:id/verify` 404s for any plan issued by another instance. The system is single-instance-only today, and there is no `Cache-Control`, key history, or `kid`-addressed JWKS to grow into. `plans`, `planContractIds`, and `clarifications` are unbounded `Map`s that never expire — a slow memory leak and a store of live capabilities that survives long past `expiresAt`.

**Fixed.** The key comes from configuration, its identifier is the key's own RFC 7638 thumbprint
so it cannot be reused for a different key, and retired keys are retained through a rotation so
plans signed before it keep verifying until they expire. `GET /v1/keys` publishes the set. An
unconfigured key still generates one for local development, but the server warns and refuses to
start with `NODE_ENV=production`.

`@lattice/plan-verifier` is the standalone library the review asked for: it verifies a plan from
the JWKS alone with no call back to the API, and checks signature, expiry, the subject the plan
was issued to, and the release it is pinned to — because a valid signature over an expired plan,
or one issued to somebody else, is not a plan anyone should act on. Verified against a live
server: a plan verified offline as its subject, failed for another principal, failed when
tampered with, and the key identifier was unchanged across a restart.

**Still open.** The private key is held in process memory rather than a KMS or HSM, and the plan
and clarification stores are still per-process (bounded and expiring, but not shared). The
`PlanSigner` interface is deliberately narrow — sign bytes, publish public keys — so a managed
KMS is a drop-in without anything above it changing.

### 2.7 Execution receipts persist raw source values — P1 · FIXED

`BindingExecutionResult.mappedValues[].value` holds the actual value read from the source (`types.ts:832-846`), and receipts go to `data/execution-receipts.json` verbatim. Verified: the receipt contains `LT121`, `N121LT`, `DR-LT121-01`. The moment a binding reads a customer record, a CPNI field, or a passenger PNR — and the shipped telco pack has a `cpni_access` contract — the audit store becomes an uncontrolled, unclassified, unretained copy of production data. There is no classification model to know that, no redaction, no retention, and no encryption boundary.

**Fixed.** `ClassificationAssertion` now sits on ontology properties and binding mappings, carrying
the sensitivity, regime categories, and which catalog asserted it. Disclosure into a receipt is
graded by that classification: PUBLIC and INTERNAL values are retained so receipts stay debuggable,
CONFIDENTIAL values are reduced to a per-tenant salted digest that still proves two reads saw the
same value, and RESTRICTED values are recorded as having been read and nothing more. Where the
ontology and the source system disagree, the stricter assertion wins, and unclassified data
defaults to INTERNAL rather than PUBLIC.

Verified against the shipped telco CPNI contract: the subscriber account reference is `WITHHELD`,
the authentication method is `DIGEST`, and the operational fields stay readable — with the raw
receipt JSON containing neither protected value.

**Still open.** Retention and an encryption boundary for the receipt store, which belong with the
append-only ledger in 2.4/P1.13.

### 2.8 Multi-tenancy stops at the contract registry — P1 · FIXED

`assuranceStore`, `reviewStore`, `runtimeApprovalStore`, `executionStore`, and `connectorHealthStore` are opened once at module scope from local JSON files (`server.ts:53-57`) and are used **regardless** of whether Supabase mode is active. Only the contract registry is tenant-aware (`server.ts:101-112`). So in a Supabase deployment: contracts are RLS-isolated per organization, while assurance runs, review decisions, runtime approvals, execution receipts, and connector health are in one shared file with no organization column and no filtering. `GET /v1/reviews?contractId=…` returns any org's reviews to any authenticated caller who knows a contract id.

**Fixed.** Every one of those artifacts carries a `tenantId`, stamped from the authenticated identity on write and required to match on every read, decision, and resume. Cross-tenant reads and decisions are covered by tests in each store. Two caveats: this is filtering in the application, not a storage boundary — the durable fix is still the normalized Postgres cutover with RLS — and artifacts written before this change have no `tenantId`, so they are invisible to every tenant and need a one-time backfill if they matter.

### 2.9 The whole registry is re-read from Postgres on every request — P1 · FIXED

`server.ts:101` constructs a `SupabaseRegistryStorage` and calls `ContractRegistry.openStorage` **per request**, and `read()` (`supabaseRegistry.ts:89-131`) pulls *all* workspaces, *all* contract drafts, and *every release's full contract JSON* in four unpaginated PostgREST calls with a 5-second timeout, then runs the full hydrate/seed/repair pipeline over it (`registry.ts:50-68`). With nine seeded industry ontologies plus release history, a single `GET /health`-adjacent authenticated call moves megabytes. There is no per-contract read, no cache, no `limit` (PostgREST's default row cap will silently truncate at scale), and no ETag.

Writes are read-modify-write with snapshot-diff upserts and **no optimistic concurrency** (`supabaseRegistry.ts:133-196`). The `writeQueue` that serialized writes for the file registry (`registry.ts:271`) is per-instance, and the instance now lives for one request — so concurrent draft saves silently clobber each other, cross-instance and even in-instance.

**Fixed.** The runtime path — compile, clarify, and active-contract reads — now fetches only the
release it needs, two targeted queries instead of four unbounded ones. Published releases are
content-addressed and immutable, so they are served from a bounded LRU cache that can never go
stale: a different release has a different digest and therefore a different key.

Contract writes are conditional on the `updated_at` the request read, so a concurrent edit now
raises `CONTRACT_MODIFIED_CONCURRENTLY` (409) instead of silently winning. Reads ask PostgREST
for an exact count and refuse a short answer, because a registry quietly missing contracts is
worse than one that fails loudly.

**Still open.** The authoring routes continue to load the full document, and the file-registry
fallback remains. The normalized per-contract cutover is a larger change to the registry
abstraction than the runtime path required.

### 2.10 Intent resolution defects — P2 but safety-relevant

- **A single keyword substring auto-fires an operational action.** `intentResolver.ts:141-147` scores any matched keyword at ≥0.95, above the `OPERATIONAL_ACTION` automatic-acceptance threshold of 0.93 (`compiler.ts:380-385`). Verified: "…exposure…" scored 0.96 on a `PLANNING_DECISION`; the airline question scored 1.0 and was accepted `AUTOMATIC`. A question that merely *mentions* a keyword ("why was the refund denied?") routes to the refund action.
- **The semantic-confirmation gate is trivially defeated.** `confirmSemanticOnly` only triggers when `lexicalScore === 0` (`compiler.ts:102-104`). A weak lexical overlap of 0.45 plus a strong semantic score aggregates above 0.93 (`intentResolver.ts:61-63`) and is accepted with no confirmation.
- **Every compile makes a synchronous embedding call** with a 10-second timeout (`intentResolver.ts:52`), and the first compile after any cold start embeds the entire contract's operation and question corpus inline (`intentResolver.ts:108-125`). The cache is an unbounded per-process `Map` keyed by contract digest (`intentResolver.ts:39`) — on serverless, that is a full re-embed per cold lambda, per contract, forever. There is no query cache, no bulk pre-warm, no cost ceiling.
- **The pgvector work is not wired.** `supabase/migrations/20260728182130_contract_intent_embeddings.sql` builds a full release-scoped, organization-scoped, provider-pinned embedding store with pgmq/pg_cron/pg_net worker plumbing — 631 lines, plus a 353-line test — and nothing in `apps/api` or `packages/compiler-core` references it. `intentResolverFromEnvironment` (`embeddingProvider.ts:65`) only ever builds the in-memory hybrid resolver. Two divergent designs for the same capability now exist; one of them is dead.
- **Degradation is invisible.** When the embedding endpoint fails, resolution silently falls back to lexical and records `degradedReason` (`intentResolver.ts:88-95`) — which no Studio component reads. An operator cannot tell that semantic routing is down.

### 2.11 The data plane can return exactly one row — P1 · FIXED

Every native adapter returns a single row: `boundedQuery` wraps the template in `LIMIT 1` (`connectors.ts:609-612`), Postgres takes `result.rows[0]`, Fabric passes `maxRows: 1`, Databricks/Snowflake/BigQuery take `data_array[0]` / `rows[0]`, and `rowRecord` flattens one row to an object (`connectors.ts:651`). No aggregation, no result sets, no pagination, no streaming. "What is our exposure across all counterparties?" is not expressible. That is a large fraction of the analytical questions an enterprise will bring.

Related defects in the same layer:

- **Snowflake and BigQuery ignore plan arguments entirely** (`connectors.ts:216-240`) — no parameter binding, and the raw `queryTemplate` is sent unwrapped. Two of five native providers return the same static answer regardless of which entity the compiler resolved.
- **Postgres binds parameters positionally from `Object.values(parameters)`** (`connectors.ts:250`), so `$1`/`$2` depend on the JavaScript key-insertion order of `requiredEntityTypes`. Adding or reordering a required entity type silently rebinds every parameter in the query.
- **Arguments carry Lattice entity ids, not source keys.** `argumentValue` passes `entity.entityId` (`connectors.ts:623`) — e.g. `sample-contract-airline-dispatch-release-flight`. There is no source-key/natural-key mapping and no entity-resolution layer, so a parameterised query against a real warehouse has nothing meaningful to filter on.
- **Read-only enforcement is a regex blocklist** (`connectors.ts:397-401`). Postgres gets a genuine `BEGIN READ ONLY`; Databricks, Snowflake, BigQuery, and Fabric get only the regex. A `SELECT` that calls a side-effecting UDF or stored procedure passes.
- **`HTTP` execution mode is loopback-only** (`adapters.ts:42`), so the OpenAPI binding path — the most common enterprise integration — cannot reach any real service in a deployed environment.

**Fixed, except the loopback restriction.** Bindings now return bounded result sets: a default
ceiling of 50 rows, a hard cap of 1,000 that no contract can raise, and an honest `truncated`
flag — the adapters ask for one row more than the ceiling precisely so a receipt can distinguish
"exactly the limit" from "more than the limit". Receipts and the MCP surface are row-shaped
rather than assuming a single record.

Snowflake and BigQuery bind plan arguments — positionally via SQL API bindings and by name via
`queryParameters` respectively — so all five native providers now answer the question the
compiler actually resolved rather than a static template. Postgres no longer binds from object
key order: a positional query must declare `parameterOrder`, and both connector validation and
the publish gate refuse a binding that does not, so adding a required entity type can no longer
silently rebind a query.

Source-key mapping closes the other half. A binding declares which governed property supplies
each query parameter, and the value is read from the resolved entity at execution — so the
warehouse is filtered on the LEI it recognizes rather than on `CP-0103`, which it has never seen.
The key is declared per binding, not per entity, because the same counterparty is keyed
differently in different systems. Resolution happens at execution rather than being pinned into
the plan: these are natural keys — account numbers, subscriber identifiers — and the signed plan
travels much further than a receipt does. Both the connector validation and the publish gate
require the bound property to exist and to be marked as identifying.

**Also addressed.** The read-only check now strips comments before matching, so `/*;*/ DROP`
cannot hide behind one, and rejects the function classes that read files, reach the network, or
mutate behind a `SELECT`. It is still a blocklist and not a SQL parser — only PostgreSQL gets a
real guarantee, from its `READ ONLY` transaction — and the code says so; the durable fix is a
read-only role on the provider side. HTTP bindings can now reach an explicitly allowlisted host
over HTTPS via `LATTICE_HTTP_SOURCE_HOSTS` rather than loopback only, which made the mode useless
in any deployed environment; opening it unconditionally would have turned a governed binding into
an SSRF primitive.

### 2.12 Freshness is asserted at authoring time, not measured at read time — P1

The policy freshness gate compares `policy.maximumEvidenceAgeMinutes` against `evidence.observedAt` (`compiler.ts:227-236`), a field baked into the immutable release. Nothing reads the actual currency of the source: no Delta commit timestamp, no Snowflake `LAST_ALTERED`, no watermark column, no `connectorHealthStore` freshness signal (which exists, and is never consulted by the compiler). This is why the README's flagship demo now returns `STALE_CONTEXT` — the seed timestamps aged out. In production it fails the other way: a contract published six months ago with `observedAt: <publish time>` will happily claim freshness it does not have, or a genuinely live read will be rejected because the release's static timestamp is old.

### 2.13 Assurance never executes anything — P2 · PARTIALLY ADDRESSED

`apps/api/src/assurance.ts` is entirely static document validation: entity types exist, endpoints resolve, descriptions are non-empty, mappings resolve, policies cover risk tiers. It never compiles a competency question, never checks that the resolver routes it to the intended operation, never probes a binding, and never compares results to an expectation. `ContextTest` declares `DATA`, `AGENT`, `CHANGE`, and `ABSTENTION` types (`types.ts:394`) that nothing produces.

The consequence for the newest feature is direct: intent resolution is now model-dependent (embedding provider, model version, thresholds), and there is **no golden-question regression suite** anywhere. Changing the embedding model, editing a keyword, or adding an operation can silently reroute production questions with nothing to catch it.

**Fixed for routing.** Assurance now compiles every competency question the contract publishes and
fails when one no longer routes to the operation its author linked it to — the drift that a
retuned keyword, a changed threshold, or a swapped model actually causes. A refusal still counts
as correct routing when it names the linked operation, because reaching the right decision and
then being stopped by an evidence or approval gate is the system working. The gate is
deliberately lexical-only: an assurance run must not depend on a network call to an embedding
endpoint.

**Still open.** Answer-level assertions, binding probes, and the `DATA`, `AGENT`, and `ABSTENTION`
test types the model declares but nothing produces.

### 2.14 Engineering-maturity gaps

- **No CI.** ~~There is no `.github/` at all.~~ **Fixed** — `.github/workflows/ci.yml` runs install, build, typecheck, unit tests, and an i18n-catalog drift check; a browser job runs the Playwright behaviour and accessibility suite; a database job applies migrations from scratch, runs the pgTAP tests, and fails on Supabase security advisories. Two notes: the visual snapshot baselines are macOS-rasterized and cannot match a Linux runner, so CI runs Playwright with `--ignore-snapshots` and asserts behaviour and accessibility only; and those committed baselines are also stale against the current ontology canvas locally, which needs a deliberate `test:e2e:update` once someone confirms the visual drift is intended.
- **No observability.** Zero OpenTelemetry, zero metrics, three `console.info` calls in the entire API. No request ids, no trace propagation into connector calls, no latency/error/cost telemetry for the compile path.
- **No rate limiting or request quotas** on any route, including the embedding-backed compile path that costs money per call.
- **No shared HTTP client in the Studio** — 41 raw `fetch` call sites across 15 components, each with its own error handling, no 401→re-auth, no cancellation, no retry, no correlation id.
- **`packages/contracts` has no tests**, despite owning the type system, the connector catalog, `simulatedContext`, `releaseDiff`, and 16k lines of generated ontology. **Partly fixed** — its `test` script never compiled, so it silently ran nothing; it now builds and runs, with the agent tool projection covered. The rest of the package is still untested.
- Access tokens live in `sessionStorage` (`apps/studio/src/api.ts:7`) — XSS-exfiltratable; enterprises will ask for httpOnly cookies or a BFF.

---

## 3. Enterprise integration gaps

This is the part that is not in the architecture doc's gap table. The findings above are bugs and hardening. The following are *missing surfaces* — and they determine whether Lattice can be adopted at all, independent of code quality.

### 3.1 Identity: the query does not run as the user

Lattice resolves one credential per binding — `env:`, vault, workload identity, or broker (`connectors.ts:418-462`) — and runs every user's query through it. That means:

- **Unity Catalog row filters and column masks, Snowflake row access policies and dynamic masking, BigQuery authorized views and policy tags, and Fabric OneLake security are all bypassed.** The service principal's grants apply, not the asking user's. Every enterprise data-governance team will fail this at first review, because the platform-native access controls they spent years building are silently short-circuited.
- Lattice compensates with its own `requiredPermissions` strings — which are, per finding 2.1, supplied by the caller.

What enterprises expect instead: OAuth on-behalf-of / token exchange (Entra ID OBO, Databricks U2M, Snowflake OAuth), so the warehouse enforces its own policies and Lattice's contract becomes an *additional* constraint rather than a replacement. Failing that, at minimum a documented "trusted service principal with least-privilege views" pattern plus verified user-attribute pass-through (`SESSION_CONTEXT`, `current_user`, query tags) so the platform can apply its own filters.

This is the highest-value architectural change in this document. Everything else is smaller.

### 3.2 Data catalog and glossary federation: absent — PARTIALLY ADDRESSED

Every target enterprise already has Purview, Unity Catalog, Collibra, Alation, Atlan, or Dataplex, and each of those already owns: the business glossary, data classification, ownership/stewardship, lineage, and policy tags. Lattice today defines its own ontology from scratch and exports OWL RDF/XML and Turtle (`packages/exporter-core`). Discovery reads column names and types only (`connectors.ts:275-333`) — it drops tags, classifications, comments, constraints, and lineage.

Predictable outcome: the data governance team sees Lattice as a **second, competing glossary** and blocks it.

What is needed:

- **Import**: glossary terms and classifications from Purview/Collibra/Unity Catalog as first-class, linkable ontology concepts, with `sameAs`/`closeMatch` mappings rather than copies.
- **Classification propagation**: a sensitivity/classification field on properties and bindings, inherited from the catalog, enforced by policy (mask, refuse, require purpose) and honoured by receipts (finding 2.7).
- **Export**: contracts and ontologies back to the catalog as governed assets — SKOS for the glossary, DCAT for the dataset, and OpenLineage events for compile/execute so lineage tools show "this agent decision consumed these tables".
- **Ownership federation**: `owner` is a free-text string everywhere (`types.ts:48, 118, 390, 603`). It needs to resolve to a directory principal so approvals can route.

**Landed.** Classification propagation is in: the model, the resolution rules, and enforcement at
the one place governed data would otherwise be copied into an audit artifact (2.7). Assertions
carry `source: 'CATALOG' | 'AUTHOR'` plus the catalog name and a locator, so a federated tag is
distinguishable from a local guess and can be re-synchronized.

**Still open.** The vendor adapters themselves — Purview, Collibra, Unity Catalog, Dataplex — plus
glossary term import with `sameAs`/`closeMatch` mappings, SKOS/DCAT export, OpenLineage emission,
and ownership federation. The classification assertion is the interface those adapters populate;
nothing about it presumes a particular catalog.

### 3.3 The semantic layer already exists and Lattice re-derives it

Enterprises have dbt semantic models, Databricks Metric Views, Snowflake semantic views, Cube, and Power BI datasets. `MetricDefinition` (`types.ts:110`) carries an id and a version and is pinned into the plan — it is not backed by any of those. Two definitions of "exposure" will exist, they will disagree, and finance will side with the one in the warehouse.

Lattice should bind metrics to the platform's semantic layer by reference (dbt Semantic Layer / MetricFlow, Databricks metric view, Snowflake semantic view) and pin *that* object's version, rather than owning a parallel metric registry. The differentiating claim — "compilation, evidence, and signed plans" — does not require owning metric definitions, and owning them creates an adoption fight the product cannot win.

### 3.4 Agent factory integration: no supported surface — PARTIALLY ADDRESSED

The Context API is an idiosyncratic REST API with no machine-readable description — no OpenAPI document, no MCP server, no tool/function schemas. Enterprises standardizing on Bedrock AgentCore, Azure AI Foundry Agent Service, Databricks Agent Bricks, Vertex Agent Builder, Agentforce, or in-house LangGraph will each have to hand-roll a client, discover the compile/clarify/approve/execute state machine by reading the README, and reimplement plan verification.

The minimum viable surface:

- **An MCP server** exposing `compile`, `clarify`, `verify`, and `execute` as tools, so any MCP-capable agent runtime picks Lattice up with zero glue. This is the single highest-leverage integration in the product.
- **A published OpenAPI 3.1 document** generated from the route table, plus typed clients.
- **A verification library** (npm + PyPI) so an executor can check signature, expiry, `kid`, digest, and audience without calling back — which is the entire point of signing, and is impossible today because verification requires the issuing process's memory (finding 2.6).
- **Tool-schema projection**: emit each governed operation as an OpenAI/Anthropic tool definition, so the contract's operations become the agent's tools directly and the "contract is the deployable artifact" claim becomes literally true.
- **OpenTelemetry GenAI semantic-convention traces** on the compile path, so decisions land in Datadog/Dynatrace/Arize/LangSmith alongside the rest of the agent trace.
- **A2A / multi-agent delegation**: a plan issued to agent A and handed to agent B currently works by accident (finding 2.2). It should work by design, with delegation recorded.

**Landed.** `apps/mcp-server` exposes the governed loop as six MCP tools over stdio and streamable
HTTP, so an MCP-capable runtime consumes Lattice with no glue. The API describes itself at
`GET /openapi.json`, and a drift test fails the build if a route is added without appearing there.
`projectGovernedTools` in `@lattice/contracts` emits each governed operation as an Anthropic- or
OpenAI-shaped tool definition carrying its risk tier, required permissions, required governed
entity types, and approval requirement — with the tool description stating plainly that selecting
it compiles rather than executes, so the projection strengthens the confirmation path instead of
bypassing it.

**Still open.** The standalone verification library is deliberately deferred: the signing key is
still ephemeral and per-process (2.6), so a library could only verify against the instance that
issued the plan. It lands with KMS signing in P1.7. OpenTelemetry GenAI traces (P1.15) and
recorded A2A delegation remain open, and the MCP server acts as a single service identity, so the
data platform still sees a service principal rather than the asking user (3.1).

### 3.5 Purpose limitation is declared but never enforced — FIXED

`CompileRequest.purpose` exists (`types.ts:680`) and is used for exactly one thing: enriching the embedding query string (`intentResolver.ts:49-51`). It is never validated against an allowed-purpose list, never pinned into the plan, never recorded in the receipt, and never consulted by any policy. `GuardrailPolicy` (`types.ts:381`) has no purpose, obligation, jurisdiction, residency, retention, or consent dimension.

For GDPR/CPRA purpose limitation, for EU AI Act "intended purpose" documentation, and for HIPAA minimum-necessary, this is the field that regulators actually ask about. A product whose thesis is *governed* context needs purpose to be a policy input, an audit field, and a plan-level pin — not a prompt-engineering hint.

**Fixed.** Contracts declare purposes with obligations, jurisdictions, and retention. A policy can
require one and restrict a risk tier to a subset. The compiler fails closed on both an undeclared
purpose and one the tier does not permit, and pins the declared purpose — with the caller's own
free-text statement alongside it — into the signed plan and the execution receipt. The shipped
CPNI contract declares the three uses 47 CFR 64.2005 distinguishes and permits only two at its
operational tier. The purposes are discoverable through the MCP surface so an agent can name one
rather than guess.

### 3.6 Deployment topology and scale

- Single-process, single-instance by construction (findings 2.6, 2.8, 2.9). The documented Vercel target is incompatible with the in-memory key, plan store, clarification store, and JSON artifact stores — which on Vercel land in `tmpdir()` (`server.ts:51`) and vanish per invocation.
- No horizontal scaling story, no shared cache, no queue, no durable nonce store, no leader election for the release pointer.
- Air-gapped / sovereign deployment — a hard requirement for the airline, telco, government, and defence packs already shipped — has no story: Supabase is assumed, the embedding endpoint is assumed reachable, and there is no self-hosted profile.
- No backup/restore, no export/import of an entire workspace, no DR runbook, no data-residency configuration.

### 3.7 Change management at enterprise scale

Release diffing, restore, and rollback are genuinely good and better than most comparable tools. What is missing is the scale dimension:

- **No cross-contract impact analysis.** Changing a shared workspace ontology rewrites every dependent contract draft in place (`registry.ts:101-106`) with no preview of which published contracts and which live agents are affected.
- **No environment promotion.** There is one registry. Dev → test → prod promotion, per-environment bindings and credentials, and "publish to staging first" do not exist. `SourceBinding.environment` is a free-text string that nothing enforces.
- **No deprecation lifecycle.** `ReleaseStatus` has `RETIRED` but there is no sunset window, no consumer notification, and no way to find which agents are still compiling against a retired release.
- **No bulk/API-first authoring.** Everything assumes the Studio. Enterprises with 500 contracts will want contracts-as-code in Git with CI validation — which is the natural fit for a design that is already file- and digest-oriented, and would pair well with the existing release-diff artifact.

### 3.8 The ontology packs will not survive contact with a real enterprise

Nine generated industry ontologies (16,488 lines) derived from 74 forms are an excellent demo asset and a genuine differentiator versus a blank canvas. But no bank will adopt a generated "financial services" ontology wholesale; they have FIBO, ACORD, or an internal model. What is needed is the *merge* path: import an existing standard (FIBO, HL7 FHIR, ACORD, eTOM, ISO 20022), align it to Core, and keep both provenance chains — the importer already has RDF/Turtle ingestion and collision analysis, so this is closer than it looks.

---

## 4. Priorities

**P0 — required before any external pilot. All six are now implemented and verified.** These were not "hardening"; they were correctness of the core claim.

1. ~~Derive granted permissions server-side; reject body-supplied entitlements (2.1).~~ **Done.**
2. ~~Bind plans to subject + tenant; scope the plan store; consume the nonce only after authorization passes (2.2).~~ **Done.** Audience binding is deferred with the KMS work in P1.7, since it only becomes meaningful once a third party can verify a plan offline.
3. ~~Remove the `DEVELOPER` / `lattice:*` bypass from the production authorization path (2.3).~~ **Done.**
4. ~~Mark simulated grounding in the compile response and the plan; cap synthetic evidence strength; gate simulation on an explicit contract declaration (2.5).~~ **Done**, except refusing to sign high-risk simulated plans — see the deviation noted in 2.5.
5. ~~Tenant-scope the assurance, review, approval, execution, and connector-health stores (2.8).~~ **Done** at the application layer; the storage-level boundary still depends on the P1.11 registry cutover.
6. ~~Stand up CI running build, tests, typecheck, Playwright, and Supabase advisors (2.14).~~ **Done.**

**P1 — required for a design-partner deployment.**

7. ~~`kid`-addressed JWKS, key history, and a standalone verification library (2.6, 3.4).~~ **Done.** Moving the private key into a managed KMS or HSM remains, and is now a matter of implementing one narrow interface.
8. User-identity propagation to the data platform — OBO/token exchange — so native row/column security applies (3.1).
9. ~~Result sets, real parameter binding, and source-key mapping (2.11).~~ **Done.** The read-only regex blocklist and the loopback-only HTTP mode remain.
10. Measured freshness from the source system, replacing authoring-time `observedAt` (2.12).
11. ~~Per-contract reads, caching, and optimistic concurrency in the Supabase registry (2.9).~~ **Done** for the runtime path; the authoring routes still load the full document.
12. ~~Classification-aware receipts: redaction for `mappedValues` (2.7).~~ **Done** — delivered ahead of P1 because the classification model in P2.17 is what it depends on. Retention and an encryption boundary remain open.
13. ~~Separation of duties on governance reviews; append-only, hash-chained artifact ledger (2.4).~~ **Done** for reviews and the two append-only ledgers; in-place-mutating artifacts and an external anchor remain.
14. ~~A golden-question regression suite executed by assurance, gating publish (2.13).~~ **Done** for routing; answer-level assertions remain.
15. OpenTelemetry traces and metrics across compile, resolve, and execute (2.14).

**P2 — required for enterprise GA.**

16. ~~MCP server + OpenAPI document + tool-schema projection (3.4).~~ **Done**, except the offline verification library, which is blocked on KMS signing in P1.7.
17. Catalog federation (3.2). **Classification propagation done**; glossary import, SKOS/DCAT export, OpenLineage emission, and the vendor adapters remain.
18. Semantic-layer binding for metrics instead of a parallel metric registry (3.3).
19. ~~Purpose as a first-class policy input, plan pin, and audit field; obligations, residency, retention (3.5).~~ **Done.**
20. Environment promotion, contracts-as-code, cross-contract impact analysis, deprecation lifecycle (3.7).
21. Resolve the two competing embedding designs — wire the pgvector migration or delete it (2.10).
22. Self-hosted / air-gapped deployment profile (3.6).

---

## 5. What is genuinely strong

Worth stating plainly, because the findings above are unrelenting and the product is not weak:

- The **compile → clarify → escalate → abstain → sign → approve → execute** loop is real, works end to end, and is a materially better idea than the graph-editor products it is positioned against. Clarification and abstention as first-class successful outcomes is the right call.
- **Risk-tiered intent gates with recorded thresholds, margins, and scores pinned into the plan** (`compiler.ts:395-421`) is a governance primitive almost nobody else ships. The thresholds are wrong today (2.10), but the mechanism is right.
- **Separation of duties on runtime approvals** is correctly implemented and correctly enforced — verified live.
- **Release diff, restore, controlled rollback, and runtime suspension** with actor-attributed audit events are more mature than most comparable tools.
- **Credential handling** — server-only resolution, no secrets in contracts or exports, HTTPS/loopback enforcement, expiry validation, broker response size limits — is careful, well-tested work.
- **Accessibility, i18n, and the pseudo-locale pipeline** are unusually thorough for a product at this stage and will save real time later.
- The team **documents its own gaps honestly** in `docs/architecture.md`, which is rarer than it should be and makes this review's job narrower.

The gap is not vision or craft. It is that the product currently proves the loop against fixtures, while the enterprise value depends entirely on the loop being true against a live, access-controlled, catalogued data platform — and on an agent factory being able to consume it without hand-rolling a client.
