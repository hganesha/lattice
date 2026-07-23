# Lattice

Lattice is an industry-neutral context compiler for governed AI and automation. It turns a natural-language question plus a published Context Contract into one of four explicit outcomes:

- a short-lived, signed execution plan;
- a typed clarification request;
- an approval requirement;
- or an evidence-backed abstention.

Lattice is ontology-first. A published Core pack defines stable cross-industry concepts such as Person, Organization, Document, Event, Asset, and Policy. Each industry workspace composes that foundation with its own versioned entities, relationships, and reusable master/reference-data bindings. Decision-specific Context Contracts sit on top: they select a concept scope, inherit the matching shared bindings as pinned snapshots, and add competency questions, decision-local bindings, evidence, policy, tests, release state, and runtime resolution.

The workspace includes published **counterparty exposure assurance** and **grid outage response** examples. The compiler, runtime graph, and contract schema are deliberately domain-neutral so healthcare, public sector, manufacturing, software, and other industry packs can use the same product loop.

## What is implemented

- `@lattice/contracts`: typed industry workspace, shared ontology, ontology reference, concept scope, and Context Contract schemas.
- `@lattice/compiler-core`: deterministic operation/entity resolution, policy-driven evidence and freshness enforcement, runtime approval escalation, clarification contracts, abstention, and version-pinned plans.
- `@lattice/importer-core`: deterministic OpenAPI, JSON Schema, RDF/XML, Turtle, and CSV translation into checksum-stamped ontology proposals, operation discovery, response-field flattening, type inference, and collision analysis.
- `@lattice/exporter-core`: deterministic OWL ontology serialization to RDF/XML and Turtle with stable IRIs, XML escaping, datatype ranges, and Lattice governance annotations.
- `@lattice/api`: dependency-light HTTP API with OIDC/JWKS-verified identity, a persistent contract registry, immutable assurance and review artifacts, versioned releases, digest-backed release diffs, audited active-pointer rollback, safe draft restoration, runtime suspension, Ed25519 plan signing, plan verification, and clarification continuation.
- `@lattice/studio`: a React context studio with a draggable ontology canvas, schema Import Studio, Source Binding Studio, Policy Studio, Assurance Studio, Review Queue, Evidence Registry, Release Management, field mapping validation, publish gates, registry-backed drafts, and live question compilation.

## Start locally

Requires Node.js 22+ and pnpm.

```bash
pnpm install
pnpm build
pnpm test
pnpm dev
```

Open `http://127.0.0.1:5173`. The Context API listens on `http://127.0.0.1:8787`.

`pnpm dev` explicitly enables development authentication for the local Studio identities. Outside that development command, protected API routes deny access unless OIDC is configured:

```bash
export LATTICE_OIDC_ISSUER=https://identity.example.com
export LATTICE_OIDC_AUDIENCE=lattice-api
export LATTICE_OIDC_JWKS_URL=https://identity.example.com/.well-known/jwks.json
# Optional: RS256,ES256 by default
export LATTICE_OIDC_ALGORITHMS=RS256,ES256
# Optional claim mappings and single-workspace tenant fallback
export LATTICE_OIDC_TENANT_CLAIM=tid
export LATTICE_OIDC_PRINCIPAL_CLAIM=sub
export LATTICE_OIDC_ROLES_CLAIM=roles
export LATTICE_OIDC_DEFAULT_TENANT_ID=tenant-example
```

The API verifies the asymmetric signature, key ID, issuer, audience, token lifetime, maximum token age, and configured algorithm before trusting identity claims. Remote issuer and JWKS URLs require HTTPS; loopback HTTP is accepted only for local identity-provider testing. Studio reads its production access token from session storage through `setApiAccessToken`; built-in role-specific demo identities are emitted only by development builds. `LATTICE_DEV_AUTH=true` is rejected when `NODE_ENV=production`.

### Supabase production identity and tenancy

Lattice can use Supabase Auth and Postgres as its production identity and tenancy boundary. When Supabase is connected through Vercel Marketplace, Lattice directly consumes the injected `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; no duplicate Lattice-specific variables are required. The injected `POSTGRES_URL` is reserved for the pooled runtime repository connection and `POSTGRES_URL_NON_POOLING` for migrations. `POSTGRES_PRISMA_URL` is not used because Lattice does not use Prisma. The `LATTICE_SUPABASE_*` and `VITE_SUPABASE_*` aliases in `.env.supabase.example` remain available for non-Vercel local deployments.

The Studio uses PKCE sessions with automatic refresh, requires organization onboarding or membership, and sends the active organization in `X-Lattice-Organization`. The API derives the Supabase issuer and JWKS endpoint from the project URL, verifies asymmetric user JWTs locally, and confirms the selected organization through the user-scoped Supabase Data API before accepting protected requests. `SUPABASE_SECRET_KEY`, legacy `service_role`, `POSTGRES_PASSWORD`, and database connection URLs remain server-only and are never exposed through a browser prefix.

The versioned migration under `supabase/migrations` creates organizations, memberships, workspaces, contracts, immutable releases and governed artifacts, connector health, and append-only audit events. Every exposed table has RLS, explicit authenticated grants, no anonymous grants, and composite organization keys. Authorization comes from `organization_memberships`; editable `user_metadata` is never trusted. With Docker Desktop running, verify it using:

```bash
pnpm supabase:start
pnpm supabase:reset
pnpm supabase:test
pnpm exec supabase db advisors --local --type security
```

#### Invite-only access

Public and email signup are disabled in `supabase/config.toml`. A Before User Created Auth Hook checks `private.signup_email_allowlist`; the table is not exposed through the Data API and an empty list denies every new identity. Existing Auth users are not affected by this creation-time hook.

Before inviting someone, add their email in the Supabase SQL Editor. The helper trims whitespace, normalizes case, and safely re-enables an existing entry:

```sql
select private.allow_signup_email(
  'person@example.com',
  'Approved by workspace owner'
);
```

Direct Table Editor inserts are also normalized automatically, and `entry_type` defaults to `EMAIL`. To approve an exact domain instead, set `entry_type` to `DOMAIN`; subdomains are not included automatically. Entries can be disabled or assigned an `expires_at` timestamp. After allowlisting, send the invitation from **Authentication → Users → Send invitation**. The recipient follows the emailed link, creates a password in Lattice, and then completes organization onboarding. The sign-in screen also provides password recovery; both activation and recovery require the same 10-character lowercase, uppercase, number, and symbol policy configured in `supabase/config.toml`.

For every hosted environment, set **Authentication → URL Configuration → Site URL** to the deployed Studio origin and add the production and intended preview origins to **Redirect URLs**. Password recovery returns to the current Studio path with `?auth_action=update-password`, so the redirect allowlist must accept that URL (or an appropriate path wildcard). Configure custom SMTP before production use so invitation and recovery delivery is reliable. Also disable **Authentication → Sign In / Providers → Allow new users to sign up** and select `private.hook_restrict_signup_to_allowlist` under **Authentication → Hooks → Before User Created**. The repository config applies these controls to the local Supabase stack, but hosted Auth configuration must be selected for the intended project. Never invoke the invitation Admin API from the browser.

The current API registry still uses its atomic local JSON persistence adapter while the normalized Supabase repository adapter is completed. Do not treat that fallback as shared multi-tenant production storage; Supabase Auth and RLS are now wired, but production data cutover remains a separate migration step.

Run `pnpm generate:ontologies` after adding or changing industry forms under `../Schemas`. The generator currently derives seven provenance-backed industry ontologies from 55 implemented forms and publishes a field-coverage report in `docs/generated-ontology-report.json`. See [form-schema ontology generation](docs/ontology-generation.md).

Use the sun/moon and text-size switches in the header to toggle light or dark mode and the normal or large text scale. Both preferences are stored locally in the browser. The contrast-bearing foreground/background theme tokens meet WCAG AA contrast for normal text; the normal interface type floor is 12px, with a 13.5px large-text option.

The Studio ships with an English (`en-US`) source catalog, a Spanish (`es-ES`) translation, and a runtime-generated expanded pseudo-locale (`en-XA`) for finding untranslated text and layouts that cannot accommodate longer translations. Choose a language from the header dropdown; the preference is stored in the browser, and dates, times, numbers, and plurals use the active locale. Run `pnpm --filter @lattice/studio i18n:check` to extract and compile the source catalog. User-authored ontology content and server-provided evidence remain source data rather than being silently translated. RTL layout is not yet certified; see [docs/localization.md](docs/localization.md).

The Studio opens on the active industry workspace's **Shared ontology**. Fundamental entities and relationships are authored once at workspace level. **Contracts** then shows the decision contracts layered on that foundation; its labeled quick switch and contract cards control compiler, bindings, policy, assurance, evidence, and release views. Creating a contract inside a workspace includes an explicit concept-scope step so a contract inherits only the Core and industry concepts relevant to its decisions. Outside a workspace, the wizard offers the same seven generated packs that ship in the registry: financial services, energy, healthcare, manufacturing, legal, insurance, and real estate. Their draft types include the real governed properties and relationships from the generated catalog.

Open **Compiler** to inspect governed objects and relationships in a domain-neutral graph or table, trace their evidence, and compile the contract's competency question. The first-run guide can compile any active published example immediately, before authoring. The Grid example resolves its outage, traverses the governed `AFFECTED_ASSET` relationship, and returns a short-lived Ed25519-signed execution plan pinned to contract `0.1.1`.

Within a workspace, drag types to arrange the canvas, draw between node handles to create relationships, and edit properties in the inspector. The always-visible header save persists the active shared-ontology or contract draft; publish remains a separate governed release action. **Import schema** is available from navigation and the ontology canvas. It accepts OpenAPI, JSON Schema, RDF/XML, Turtle, or CSV; previews OWL classes, datatype properties, object properties, schema references, and inferred tabular fields; and lets an author merge, create, or skip every collision before staging an unpublished shared-ontology draft. The ontology header is context-aware: **package JSON** exports the active shared ontology or Context Contract with its governed bindings, while **semantic RDF/XML** and **semantic Turtle** serialize ontology meaning only. Portable JSON retains approved external credential references such as `env:`, `vault:`, workload identity, and managed identity, but strips sample payloads, embedded credential values, URL user information, fragments, and sensitive URL parameters. Switch to **Compiler** to compile questions against a contract's latest published release.

Open workspace-level **Ontology bindings** to map shared master or reference data once, or contract-level **Source bindings** for decision-specific sources. Both support Databricks, Microsoft Fabric, Snowflake, BigQuery, PostgreSQL, Kafka, S3/ADLS/OneLake, and OpenAPI. API bindings discover response fields from OpenAPI; Databricks, Microsoft Fabric, and PostgreSQL bindings can discover live provider metadata, while every data-platform binding can still ingest a declared row or event schema. Both flows suggest property mappings and stage the endpoint, read-only resource/query scope, external credential reference, freshness limit, permissions, and source checksum. Credential values are deliberately excluded.

The Studio reads its connector catalog from the API and can validate endpoint shape, resource scope, query safety, credential resolution, and runtime-driver availability for every staged binding. Databricks uses built-in HTTPS adapters for Unity Catalog discovery and Statement Execution; Microsoft Fabric uses encrypted native TDS with a Microsoft Entra SQL access token for `INFORMATION_SCHEMA` discovery and bounded T-SQL execution; PostgreSQL uses a native wire-protocol adapter for `information_schema` discovery and read-only transactions. Snowflake and BigQuery retain built-in HTTPS dispatchers. Kafka and object-storage transports remain delegated to a separately operated local connector runtime configured with `LATTICE_CONNECTOR_GATEWAY_URL=http://127.0.0.1:<port>`; further native connector expansion is deferred.

Credentials are resolved by a server-only chain. `env:VARIABLE_NAME` reads the process environment; vault, workload-identity, and managed-identity references can be handled by an injected runtime resolver or a credential broker configured with `LATTICE_CREDENTIAL_BROKER_URL` and optional `LATTICE_CREDENTIAL_BROKER_TOKEN`. Remote brokers must use HTTPS (loopback HTTP is allowed for local development) and implement `POST /v1/credentials/resolve`, accepting `{ reference, provider, resource }` and returning `{ value, expiresAt? }`. Empty, malformed, or expired responses are rejected. Secret values never enter contracts, browser responses, telemetry records, or logs.

Each connector card can run a health check. Native discovery adapters perform a non-mutating metadata probe; other adapters report configuration-only degraded status until a safe live probe exists. Results retain latency, credential source, sanitized failure code, last successful probe, and freshness state in the local connector-health ledger.

Open **Assurance** to link competency questions to implemented operations and execute deterministic structural, question, mapping, policy, and release gates against the current draft. Each run is stored as a digest-backed immutable artifact, rendered as an evidence trace, and synchronized into contract test status. Critical failures block publishing.

Open **Policy profiles** to cover each implemented operation risk tier with executable evidence-strength, freshness, and human-escalation rules. Recommended baselines can be staged for uncovered tiers, while custom profiles remain editable and version pinned. The compiler enforces these settings, and missing or unapproved policies block release.

Open **Review queue** to submit semantic types, source bindings, and runtime policies for governance approval. Authenticated authors and reviewers are recorded separately; approval, approval-with-exception, and rejection all require a rationale. Requests and decisions are immutable digest-backed artifacts, and successful decisions become expert-decision evidence on the contract. Unapproved claims are blocked from publishing.

Open **Evidence registry** to filter provenance artifacts by class and freshness, inspect validity and content digests, and trace each artifact to dependent context objects, relationships, bindings, review decisions, or assurance runs.

Open **Release history** to inspect immutable releases and their version pins, compare any two releases or a release with the working contract, download a digest-backed JSON diff, view semantic-version and downstream-impact suggestions, suspend or resume runtime compilation, restore an older release as a new unpublished draft, or move the active runtime pointer through a rationale-backed controlled rollback. Restoration, suspension, and rollback never rewrite release history; rollback appends an actor-attributed audit event.

## Try the compiler

```bash
curl -s http://127.0.0.1:8787/v1/compile \
  -H 'Authorization: Bearer local-demo' \
  -H 'Content-Type: application/json' \
  -d '{"question":"What is our exposure and limit utilization for Arcadia Capital?"}'
```

Use `Arcadia` instead of `Arcadia Capital` to exercise the typed clarification path. Use an unknown counterparty to exercise evidence-backed abstention.

## API surface

| Route | Purpose |
|---|---|
| `POST /v1/compile` | Compile a question into an explicit runtime decision. |
| `POST /v1/clarifications/:id` | Continue a paused resolution with a governed entity selection. |
| `POST /v1/plans/:id/verify` | Verify signature, expiry, key, and contract digest for a plan. |
| `GET /v1/contracts/active` | Inspect the active published Context Contract. |
| `GET /v1/workspaces` | List industry workspaces and shared ontology counts. |
| `GET /v1/workspaces/:id` | Retrieve a workspace and its shared ontology. |
| `PUT /v1/workspaces/:id/ontology` | Persist the workspace ontology and synchronize contract compatibility snapshots. |
| `GET /v1/contracts` | List registry entries and their latest releases. |
| `POST /v1/contracts` | Create an independent question-first contract from a blank or starter schema. |
| `GET /v1/contracts/:id` | Retrieve a draft and immutable release history. |
| `PUT /v1/contracts/:id` | Atomically persist an authenticated draft. |
| `POST /v1/contracts/:id/releases` | Validate, version, hash, and publish an immutable release. |
| `GET /v1/contracts/:id/diffs?from=:digest&to=:digest` | Compare two immutable releases and return a digest-backed change artifact. |
| `POST /v1/contracts/:id/restores` | Restore an immutable release as a new unpublished draft without moving the live pointer. |
| `POST /v1/contracts/:id/rollbacks` | Move the active release pointer with an authenticated actor and mandatory rationale. |
| `GET /v1/contracts/:id/release-events` | List append-only active-release control events. |
| `POST /v1/contracts/:id/runtime-status` | Suspend or resume runtime compilation without mutating releases. |
| `POST /v1/imports/preview` | Analyze an authenticated OpenAPI/JSON Schema source and return a non-mutating, checksum-stamped proposal. |
| `POST /v1/bindings/preview` | Discover OpenAPI operations or tabular fields and flatten them for semantic mapping. |
| `GET /v1/connectors` | List the single-workspace governed connector catalog and runtime metadata. |
| `POST /v1/connectors/validate` | Validate resource scope, read-only query safety, credential resolution, and runtime-driver availability. |
| `GET /v1/connectors/health?bindingId=:id` | List durable connector health history, optionally scoped to one binding. |
| `POST /v1/connectors/health` | Resolve server-side credentials, run a safe provider probe, and persist latency/freshness telemetry. |
| `POST /v1/connectors/discover` | Discover and normalize live Databricks, Microsoft Fabric, or PostgreSQL fields within a governed binding scope. |
| `GET /v1/assurance/runs?contractId=:id` | List immutable assurance artifacts for a contract. |
| `POST /v1/assurance/runs` | Execute deterministic contract gates and persist a digest-backed run. |
| `GET /v1/assurance/runs/:id` | Retrieve one immutable assurance artifact. |
| `GET /v1/reviews?contractId=:id` | List open and decided governance reviews. |
| `POST /v1/reviews` | Submit a contract claim for authenticated review. |
| `POST /v1/reviews/:id/decisions` | Record a rationale-backed approval, exception, or rejection. |
| `GET /v1/keys/current` | Retrieve the current public signing key. |
| `GET /health` | Check API health. |

## Repository layout

```text
apps/
  api/                 Context API and signing boundary
  studio/              Human authoring, assurance, and runtime UI
packages/
  compiler-core/       Pure deterministic compiler
  contracts/           Shared contract and plan types
  exporter-core/       Deterministic RDF/XML and Turtle serializer
  importer-core/       OpenAPI/JSON Schema proposal engine
docs/
  architecture.md      Product and technical architecture
```

## Next slices

The current milestone proves the visual schema-authoring/import/versioning loop, standards and tabular ingestion, a provider-neutral binding catalog, native Databricks, Microsoft Fabric, and PostgreSQL discovery/execution adapters, hardened server-only credential resolution, durable connector health telemetry, OIDC/JWKS authentication, digest-backed release comparison, safe release-to-draft restoration, controlled active-pointer rollback, and the compile/clarify/escalate/abstain/sign/approve/execute loop. Multi-tenant storage and further native connector expansion remain intentionally deferred. The next implementation milestones are a dedicated append-only evidence and audit ledger, richer purpose-aware policy expressions, server-side role/scope authorization, and additional industry packs.

## Design principles

1. Contracts before graphs.
2. Evidence before assertion.
3. Compilation before execution.
4. Signed plans before tool calls.
5. Clarification and abstention are first-class successful outcomes.
6. One core runtime; many independently versioned industry packs.
