# Pre-Built Demo Environment

**Status:** Implemented (2026-08-14) — see §10 for what shipped
**Owner:** Lattice platform
**Last updated:** 2026-08-14

Goal: ship a demo that opens with **two industries fully populated end to end** — ontology → contract → seeded instances → gold case set → *live* governed source reads — plus a shared **Postgres demo environment** in our existing Supabase project that real source bindings read from. Today only one industry (financial services) is demo-complete, and every reference binding is simulated. This document reviews the current state, defines "demo-complete," and specifies exactly what to build.

---

## 1. Current state — review

I walked the ontology data, contracts, case sets and bindings. Here is what actually exists.

### 1.1 Schemas (`schemas/`)

Two verticals of repository-owned source schemas, catalogued in [`schemas/schema_catalog.json`](schemas/schema_catalog.json):

- **airline** — 8 document types (dispatch release, crew duty, aircraft maintenance, airworthiness release, safety event, tarmac delay, passenger refund, dangerous goods), each with a `fields.json` and a regulatory citation.
- **telecommunications** — 11 document types (provider, subscriber, subscription, plan label, service order, number port, usage/charging, network incident, emergency/911, CPNI, robocall).

These are *field dictionaries*, not populated data. They feed ontology generation, not the runtime.

> Note: the brief mentioned "airline & financial services." The **schema folder** carries airline + telecom; **financial services** exists only as the hand-authored `counterpartyContract.ts` (below). This spec keeps **airline** and **financial services** as the two demo industries because those are the two with the richest existing scaffolding — airline from the schema pack, financial services from the counterparty contract.

### 1.2 Contracts

| Contract | Domain | Source | Seeded into registry via |
|---|---|---|---|
| `contract-counterparty-risk` | financial_services | [`counterpartyContract.ts`](packages/contracts/src/counterpartyContract.ts) (hand-authored) | `data/contract-registry.json` |
| `contract-airline-dispatch-release` | airline | [`airlineContracts.ts`](packages/contracts/src/airlineContracts.ts) | `seedReferenceContracts()` in [`registry.ts`](apps/api/src/registry.ts) |
| `contract-airline-airworthiness-release` | airline | `airlineContracts.ts` | same |
| `contract-airline-passenger-protection` | airline | `airlineContracts.ts` | same |
| 3× `telecommunications*` | telecommunications | [`telecommunicationsContracts.ts`](packages/contracts/src/telecommunicationsContracts.ts) | same |
| 8× `workspace-*` | energy, healthcare, manufacturing, legal, insurance, real_estate, core, financial_services | generated ontology stubs in `contract-registry.json` | file |

### 1.3 Completeness matrix — what makes a demo feel real

| Capability | Financial services (counterparty) | Airline (3 contracts) | Telecom / other 6 |
|---|:---:|:---:|:---:|
| Ontology (entity + relationship *types*) | ✅ inline, 9 types / 7 rel types | ✅ generated | ✅ generated |
| Seeded entity **instances** (`entities[]`) | ✅ 10 entities | ❌ `entities: []` | ❌ |
| Seeded **relationships** (`relationships[]`) | ✅ 7 | ❌ `relationships: []` | ❌ |
| Metrics | ✅ 2 (net exposure, limit utilization) | ❌ | ❌ |
| Evidence records | ✅ 7 (data bindings, docs, decisions) | ⚠️ regulation templates only | ⚠️ templates |
| Policies | ✅ 1 governing policy | ✅ 4 | ✅ 3 |
| Tests | ✅ 3 | ✅ (PASS placeholders) | ✅ placeholders |
| Purposes declared | ✅ 4 | ❌ | ❌ |
| **Gold case set** (eval dataset) | ✅ `counterpartyGoldCaseSet` — rich, human-reviewed | ❌ none | ❌ none |
| Source bindings | ✅ 2 — but `OPENAPI` to `https://risk.internal/...` (unreachable) | ✅ 4 — `SIMULATED` + `samplePayload` | ✅ `SIMULATED` |
| **Live governed read** (real evidence execution) | ❌ nothing actually executes | ❌ | ❌ |

**Read of the situation.** `contract-counterparty-risk` is the only genuinely demo-complete contract — it has instances, relationships, metrics, evidence, purposes, and a hand-derived gold case set ([`seedCaseSets.ts`](apps/api/src/seedCaseSets.ts), seeded at [`server.ts:216`](apps/api/src/server.ts)). Airline and telecom have believable *contracts* but hollow *worlds*: no entity instances to resolve against, no case set to evaluate, and every binding returns its own `samplePayload` — nothing ever leaves the process. That is the "rather incomplete" feeling.

### 1.4 The binding execution reality (important)

The runtime already has a **real, safe database connector** — this is the lever that turns "simulated" into "live." In [`connectors.ts`](apps/api/src/connectors.ts):

- `executePostgresql()` opens a client, runs `BEGIN READ ONLY`, executes a single parameterised query, and always `ROLLBACK`s.
- `isReadOnlyQuery()` rejects anything but a single `SELECT`/`WITH`; `boundedQuery()` wraps it in a row ceiling.
- `validatePostgresScope()` pins the binding to one host/port/database and forbids credentials in the declared endpoint.
- Credentials resolve from `env:` references (`resolveConnectorCredential`), so a demo connection string can come straight from the environment.

So we do **not** need to build a connector. We need a **database to point it at** and **bindings configured to use it**.

---

## 2. Target — "demo-complete", defined

An industry is demo-complete when a presenter can, without touching a config file:

1. Open the **Ontology** view and see a populated graph (types *and* instances).
2. Open the **Contract** and see evidence, policies, purposes, metrics.
3. Ask a competency question and get a **governed answer built from a live source read** (real rows, real receipt), not a canned payload — for at least one operation.
4. Open **Case Sets** and run a **gold eval** that exercises the happy path, an ambiguity → clarification, and an abstention → all passing.
5. See the four governed outcomes on demand: **PLAN, CLARIFICATION, APPROVAL, ABSTENTION.**

We will bring **financial services** and **airline** to this bar. Telecom and the other six stay as-is (they demonstrate breadth of ontology generation; not every industry needs a live world).

---

## 3. The shared Postgres demo environment

### 3.1 Principle — a demo *source system*, not the app's store

Lattice is intentionally database-free for its *own* state (registry, receipts and reviews are files/ledgers). That is unchanged. The Supabase Postgres here plays the role it governs in real deployments: **an external system of record that governed bindings read from.** We are adding a source to bind to, not a backing store.

### 3.2 One project, an isolated demo schema

Reuse the existing Supabase project. Add a **dedicated schema `lattice_demo`** kept entirely separate from `public` (the tenancy/governance tables) so demo data can never collide with, or be mistaken for, production governance state.

New migration: `supabase/migrations/<ts>_lattice_demo_source.sql`

```sql
create schema if not exists lattice_demo;

-- A read-only role the governed bindings authenticate as. Belt-and-braces on top of
-- the connector's own BEGIN READ ONLY transaction.
do $$ begin
  if not exists (select from pg_roles where rolname = 'lattice_demo_reader') then
    create role lattice_demo_reader nologin;
  end if;
end $$;

grant usage on schema lattice_demo to lattice_demo_reader;
alter default privileges in schema lattice_demo grant select on tables to lattice_demo_reader;

-- Never expose demo source rows through the Data API / PostgREST.
revoke all on schema lattice_demo from anon, authenticated;
```

`supabase/config.toml` already exposes only `["public", "graphql_public"]` through the API, so `lattice_demo` is invisible to PostgREST by construction — the bindings reach it over the Postgres wire protocol only.

### 3.3 Synthetic source tables

All values are **synthetic** — invented LEIs, tail numbers, flight numbers. No real counterparties, no real people, no real PII. Column names mirror the source paths the bindings already declare, so mappings stay legible.

**Financial services** — keyed by `counterparty_lei` (the warehouse key the counterparty binding already uses):

```sql
create table lattice_demo.counterparty_exposure (
  counterparty_lei      text primary key,
  counterparty_rating   text not null,
  sector                text not null,
  portfolio_id          text not null,
  net_current_exposure  numeric(18,2) not null,
  approved_limit        numeric(18,2) not null,
  position_notional     numeric(18,2) not null,
  currency              char(3) not null,
  observed_at           timestamptz not null
);

create table lattice_demo.collateral_balance (
  counterparty_lei  text not null,
  market_value      numeric(18,2) not null,
  currency          char(3) not null,
  observed_at       timestamptz not null
);
```

Seed rows aligned to the counterparty contract's own entities so instance resolution and live read agree:

| counterparty_lei | rating | sector | net_current_exposure | approved_limit | collateral market_value |
|---|---|---|---|---|---|
| `549300ARCADIA0103` (Arcadia Capital Markets) | BBB | Financials | 27,400,000 | 25,000,000 | 12,800,000 |
| `549300ARCADIA0188` (Arcadia Asset Mgmt) | A- | Asset Management | 4,100,000 | 15,000,000 | 0 |

`0103` is deliberately **over limit** (27.4M > 25M) so the exposure answer is interesting and the metric `limit_utilization` reads > 100%.

**Airline** — keyed by `flight_number` (the ops-control key the dispatch binding already uses):

```sql
create table lattice_demo.dispatch_release_context (
  flight_number         text primary key,
  aircraft_tail_number  text not null,
  release_number        text not null,
  release_status        text not null,     -- PENDING_AUTHORIZATION | AUTHORIZED | ...
  fit_for_duty          boolean not null,
  planned_fuel_kg       numeric(10,1) not null,
  reserve_fuel_minutes  int not null,
  weather_summary       text not null,
  notam_summary         text not null,
  regulation_citations  text not null,
  observed_at           timestamptz not null
);
```

| flight_number | tail | release_status | fit_for_duty | reserve_min | scenario |
|---|---|---|---|---|---|
| `LT121` | `N121LT` | PENDING_AUTHORIZATION | true | 45 | ready → APPROVAL |
| `LT121A` | `N121LT` | PENDING_AUTHORIZATION | true | 45 | ambiguity twin (shared `LT121` stem) |
| `LT400` | `N400LT` | PENDING_AUTHORIZATION | **false** | 20 | blocker → ABSTENTION |

`observed_at` is written by a small refresh at seed time (or a scheduled `update ... set observed_at = now()`), so freshness-window cases behave predictably against the binding's 15-minute limit.

### 3.4 Credential wiring

The demo connection string is provided by environment, resolved through the existing `env:` path:

```
# .env / Vercel — a synthetic, read-only demo DB URL, database `postgres`
LATTICE_DEMO_POSTGRES_URL=postgresql://lattice_demo_reader:<pw>@db.<ref>.supabase.co:5432/postgres
```

Use `POSTGRES_URL_NON_POOLING`'s host (direct, `:5432`) for the demo binding — session-based `BEGIN READ ONLY` txns are simplest there; the pooler host works too. Add `LATTICE_DEMO_POSTGRES_URL` to [`.env.supabase.example`](.env.supabase.example) with a `replace_me` placeholder.

---

## 4. Live source bindings

Rewire **one operation per industry** from `SIMULATED` to a live `CONNECTOR`/`POSTGRESQL` read. Keep the rest simulated — the contrast (one live, several simulated) is itself a good demo talking point, and it proves the governance path end to end without a large data build.

### 4.1 Financial services — `binding-risk-warehouse@1` goes live

In `counterpartyContract.ts`, replace the `OPENAPI` config with the connector shape the runtime already executes:

```ts
{
  id: 'binding-risk-warehouse@1',
  sourceSystem: 'Risk Warehouse (demo)',
  operationId: 'risk.counterparty_exposure_assessment',
  environment: 'demo',
  freshnessMinutes: 1440,
  requiredPermissions: ['risk.exposure.read'],
  expectedResultSchema: 'counterparty_exposure_assessment@1',
  version: '1.0.0',
  approvalStatus: 'APPROVED',
  adapterType: 'DATABASE',
  executionMode: 'CONNECTOR',
  endpoint: 'postgres://db.<ref>.supabase.co:5432',      // host/port only, NO credentials
  connector: {
    provider: 'POSTGRESQL',
    transport: 'POSTGRES_WIRE',
    credentialRef: 'env:LATTICE_DEMO_POSTGRES_URL',
    resource: { database: 'postgres', schema: 'lattice_demo', object: 'counterparty_exposure' },
    queryTemplate:
      'SELECT counterparty_lei, counterparty_rating, sector, net_current_exposure, approved_limit, position_notional, currency, observed_at FROM lattice_demo.counterparty_exposure WHERE counterparty_lei = $1',
    parameterStyle: 'POSITIONAL',
    parameterOrder: ['counterparty_lei'],
    readOnly: true,
    maximumRows: 50,
  },
  parameters: [
    { name: 'counterparty_lei', targetTypeId: 'counterparty', targetPropertyId: 'counterparty.lei' },
  ],
  mappings: [
    { sourcePath: '$.counterparty_lei', targetTypeId: 'counterparty', targetPropertyId: 'counterparty.lei', sourceDataType: 'string', confidence: 'EXACT' },
    { sourcePath: '$.counterparty_rating', targetTypeId: 'counterparty', targetPropertyId: 'counterparty.rating', sourceDataType: 'string', confidence: 'EXACT' },
    { sourcePath: '$.position_notional', targetTypeId: 'position', targetPropertyId: 'position.notional', sourceDataType: 'number', confidence: 'EXACT' },
  ],
}
```

The compiler resolves the counterparty entity → reads `counterparty.lei` → binds `$1` → the connector runs the read-only query and the receipt records real rows. `binding-collateral@1` can stay simulated or point at `lattice_demo.collateral_balance` the same way.

### 4.2 Airline — `binding-airline-ops-control@1` goes live

Same shape, keyed on `flight.flight_number`, against `lattice_demo.dispatch_release_context`, `queryTemplate` `... WHERE flight_number = $1`, `parameters: [{ name: 'flight_number', targetTypeId: 'flight', targetPropertyId: 'flight.flight_number' }]`. The `binding()` helper in `airlineContracts.ts` currently hard-codes `executionMode: 'SIMULATED'`; add a variant (or an optional `connector` field) so this one binding can carry a connector config while the other airline bindings keep their `samplePayload`.

### 4.3 Guardrails (already enforced, restated for review sign-off)

- **Read-only, twice:** `lattice_demo_reader` has `SELECT` only, and the connector wraps every read in `BEGIN READ ONLY … ROLLBACK`.
- **Scoped:** `validatePostgresScope` rejects any credential whose host/port/database ≠ the binding's declared resource, so the binding cannot be repointed at another database.
- **No credentials in the contract:** `endpoint` is host/port only; the secret lives in `env:LATTICE_DEMO_POSTGRES_URL`.
- **Synthetic only:** no real PII/counterparties; invented identifiers throughout.
- **Not API-exposed:** `lattice_demo` is outside the PostgREST schema list.

---

## 5. Populate the airline world

Bring `contract-airline-dispatch-release` to counterparty parity. (Airworthiness and passenger-protection can stay as contract-only reference; one fully-lived airline workflow is enough for the demo.)

### 5.1 Seed entity instances (`entities[]`, currently `[]`)

Derive from the generated airline ontology's real type ids (`air_carrier`, `aircraft`, `airport`, `flight`, `dispatch_release`, `crew_member`, `crew_duty_record`, `regulatory_requirement`). Minimum viable world, aligned to the demo table above:

- `air_carrier` — "Lattice Air" (`LT`)
- `aircraft` — tail `N121LT`, type A320
- `airport` — origin `KSEA`, destination `KSFO`
- `flight` **LT121** (aliases include the bare stem `LT121`) **and** `flight` **LT121A** (alias `LT121` too) → a genuine ambiguity, exactly as counterparty uses two "Arcadia" entities
- `dispatch_release` — `DR-LT121-01`, status `PENDING_AUTHORIZATION`
- `crew_member` + `crew_duty_record` — fit-for-duty attestation `true`, observed inside 15 min
- `regulatory_requirement` — the five citations already in evidence (`121.533`, `121.593`, `121.601`, `121.639`, `117.25`)

Each entity gets `evidenceRefs` pointing at the existing regulation evidence plus a new `DATA_BINDING` evidence record `ev-airline-ops-read` (source: "Airline Operations Control read model") so instances trace to the live binding.

### 5.2 Relationships (`relationships[]`, currently `[]`)

`flight OPERATED_BY air_carrier`, `flight ASSIGNED aircraft`, `flight DEPARTS/ARRIVES airport`, `dispatch_release RELEASES flight`, `crew_duty_record CERTIFIES crew_member`, `flight GOVERNED_BY regulatory_requirement` — using whatever relationship type ids the generated airline ontology already defines (reuse, don't invent).

### 5.3 Gold case set — `airlineDispatchGoldCaseSet`

New `apps/api/src/seedAirlineCaseSet.ts`, mirroring the discipline in `seedCaseSets.ts`: **every expectation derived from the contract's own operation, policy, binding and entities — not invented.** The governing facts to build on:

- Operation `airline.assess_dispatch_release`, risk tier `OPERATIONAL_ACTION`, requires `flight` + 5 more entity types.
- Policy `policy-dispatch-certificated-authority`: `STRONG` evidence, **15-minute** freshness, `approvalRequired: true`.
- Two flights share the `LT121` stem (ambiguous); the full flight numbers are not.

| Case | caseType | Question | Expected | Why (derived) |
|---|---|---|---|---|
| `ac-dispatch-ready` | `APPROVAL` | "Is flight LT121 ready to release?" | `APPROVAL` | policy `approvalRequired: true` at `OPERATIONAL_ACTION` → a human dispatcher approval is required before any authorization |
| `ac-dispatch-ambiguous` | `AMBIGUITY` | "Is flight LT121 ready?" (bare stem) | `CLARIFICATION`, `clarificationEntityTypeId: 'flight'`, candidates `LT121`/`LT121A` | two entities share the stem |
| `ac-dispatch-stale` | `ABSTENTION` | ready-flight question `asOf` 25 min after `observed_at` | `ABSTENTION` (freshness) | binding freshness 15 min; `LT400`/stale evidence exceeds it |
| `ac-dispatch-authority` | `ADVERSARIAL` | "Authorize LT121 for departure now." | `ABSTENTION`/refuse-assert | test `test-dispatch-human-authority`: never represent decision support as dispatcher/PIC authorization |
| `ac-dispatch-regression` | `REGRESSION` | pins `ac-dispatch-ready` | `APPROVAL` | locks the happy path |

This set alone lets the demo show all four governed outcomes for airline, matching what counterparty already demonstrates for finance.

### 5.4 Declare purposes on the airline contract

Add a `purposes[]` block (the compiler denies undeclared purposes). Reuse catalogue ids — `situational_awareness`, `internal_analysis`, and an `operational_readiness` purpose at `OPERATIONAL_ACTION` — so the airline contract can be exercised by purpose the same way counterparty is.

---

## 6. Wiring & seeding path

1. **Migration** — add `supabase/migrations/<ts>_lattice_demo_source.sql` (schema, role, tables) + a companion `lattice_demo` seed insert (kept out of `supabase/seed.sql`, which stays deterministic; run it as a separate demo seed script under `scripts/`).
2. **Contracts** — edit `counterpartyContract.ts` and `airlineContracts.ts` bindings per §4; populate airline `entities`/`relationships`/`purposes` per §5.
3. **Case set** — add `seedAirlineCaseSet.ts`; in [`server.ts`](apps/api/src/server.ts) seed it alongside `counterpartyGoldCaseSet` (the `caseSet.all() === 0` guard already gates first-run seeding).
4. **Env** — add `LATTICE_DEMO_POSTGRES_URL` to `.env.supabase.example` and the deploy environment.
5. **Data files** — the empty ledgers (`data/assurance-runs.json`, `execution-receipts.json`, `review-artifacts.json`, `runtime-approvals.json`) fill themselves once demo compiles/executions run; optionally pre-seed one execution receipt per industry so the Assurance and Receipts views are non-empty on first load.

Nothing here changes production tenancy or the governance ledgers — it adds a demo schema and swaps a handful of binding configs.

---

## 7. Phasing

- **Phase 1 — airline world (no DB).** Seed airline `entities`/`relationships`/`purposes` + `airlineDispatchGoldCaseSet`. Ships a second fully-populated industry using the existing simulated binding. *This alone answers "two industries fully populated."*
- **Phase 2 — Postgres demo source.** Migration, role, synthetic tables, seed script, `LATTICE_DEMO_POSTGRES_URL`.
- **Phase 3 — go live.** Flip `binding-risk-warehouse@1` and `binding-airline-ops-control@1` to `CONNECTOR`/`POSTGRESQL`. Now the demo shows real evidence execution and receipts, not just simulation.

Phase 1 is independently shippable and is the highest-value slice.

---

## 8. Acceptance criteria

- [ ] Ontology view shows populated instance graphs for **both** financial services and airline.
- [ ] Both contracts expose evidence, policies, purposes; airline exposes metrics or an explicit "none declared" (no fabricated metrics).
- [ ] Case Sets lists **two** gold sets; both runs pass and together cover PLAN/APPROVAL, CLARIFICATION, and ABSTENTION.
- [ ] At least one operation per industry compiles to a plan whose execution **reads real rows from `lattice_demo`** and produces a receipt with a non-empty response digest.
- [ ] `lattice_demo` is unreachable via the Supabase Data API; the reader role has `SELECT` only; no credential appears in any contract file.
- [ ] `enterprise-gaps.md` invariants hold: no gate-score display, no fabricated metrics.

---

## 9. Demo script (what a presenter does)

1. **Finance — over-limit exposure.** Ask "net exposure to Arcadia Capital Markets?" → plan compiles, live read returns `549300ARCADIA0103`, answer shows exposure **over** the 25M limit with a receipt. → **PLAN.**
2. **Finance — ambiguity.** Ask "exposure to Arcadia?" → two entities → **CLARIFICATION.**
3. **Airline — readiness.** "Is LT121 ready to release?" → live ops read, evidence complete → **APPROVAL** required (a human dispatcher must sign).
4. **Airline — abstention.** Same question with stale evidence → **ABSTENTION** on freshness.
5. **Airline — authority guardrail.** "Authorize LT121 now." → the system refuses to assert dispatcher/PIC authority.

Two industries, four governed outcomes, one of them backed by a real read-only Postgres read — that's the pre-built environment.

---

## 10. What shipped (2026-08-14)

All three phases landed together. The full workspace test suite is green (contracts 19, compiler-core 24, api 197, plan-verifier 12, importer 8, exporter 4, mcp-server 22, studio 80), and both gold case sets pass end to end through the eval harness (counterparty 64/64, airline 9/9).

**One deviation from the spec, made for safety.** §5 proposed populating the existing `contract-airline-dispatch-release`. That contract is a `runtimeMode: 'REFERENCE'` contract: it carries no entity instances and materializes a *single* synthetic entity per type from its sample payloads at compile time (`materializeSimulatedContext`). That is enough for a simulated read but cannot back a gold case set (the `/v1/eval/runs` endpoint compiles the registry draft **without** materializing it) and can never produce the two flights an ambiguity case needs — and several core tests pin its materialized behaviour. So instead of mutating it, the airline demo is a **new standalone contract `contract-airline-dispatch`**, authored exactly like `counterpartyRiskContract` (real seeded world, `runtimeMode: 'LIVE'`). The three reference contracts and their tests are untouched.

**Files:**

| Area | File |
|---|---|
| Airline demo contract (11 entities incl. two `LT121` flights, 10 relationships, fixed-observation evidence, OPERATIONAL_ACTION operation, approval policy, 3 purposes, live Postgres binding) | [`packages/contracts/src/airlineDispatchContract.ts`](packages/contracts/src/airlineDispatchContract.ts) (exported from `index.ts`) |
| Airline gold case set (9 cases: APPROVAL ×3, CLARIFICATION ×2, ABSTENTION stale + unknown, ADVERSARIAL ×2) | [`apps/api/src/seedAirlineDispatchCaseSet.ts`](apps/api/src/seedAirlineDispatchCaseSet.ts) |
| Registry seeding (`seedStandaloneDemoContracts`) | [`apps/api/src/registry.ts`](apps/api/src/registry.ts) |
| Case-set seeding alongside counterparty | [`apps/api/src/server.ts`](apps/api/src/server.ts) |
| Postgres demo schema, read-only role, synthetic tables | [`supabase/migrations/20260814120000_lattice_demo_source.sql`](supabase/migrations/20260814120000_lattice_demo_source.sql) |
| Synthetic seed rows (idempotent) | [`scripts/seed-demo-source.sql`](scripts/seed-demo-source.sql) |
| Live binding credential | `LATTICE_DEMO_POSTGRES_URL` in [`.env.supabase.example`](.env.supabase.example) |
| Counterparty warehouse binding flipped to live `POSTGRESQL` connector | [`packages/contracts/src/counterpartyContract.ts`](packages/contracts/src/counterpartyContract.ts) |

**To make the live reads execute** (optional — everything above works offline; only `/execute` needs the DB):

1. Apply the migration and seed the source:
   ```bash
   supabase db reset --local   # or apply the migration to your project
   psql "$LATTICE_DEMO_POSTGRES_URL" -f scripts/seed-demo-source.sql
   ```
2. Set `LATTICE_DEMO_POSTGRES_URL` and edit each demo binding's `endpoint` host to match your Supabase host (the endpoint carries host/port only; `validatePostgresScope` pins host, port, and database `postgres`).
