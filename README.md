# Lattice

Lattice is an industry-neutral context compiler for governed AI and automation. It turns a natural-language question plus a published Context Contract into one of four explicit outcomes:

- a short-lived, signed execution plan;
- a typed clarification request;
- an approval requirement;
- or an evidence-backed abstention.

Lattice is ontology-first. A published Core pack defines stable cross-industry concepts such as Person, Organization, Document, Event, Asset, and Policy. Each industry workspace composes that foundation with its own versioned entities, relationships, and reusable master/reference-data bindings. Decision-specific Context Contracts sit on top: they select a concept scope, inherit the matching shared bindings as pinned snapshots, and add competency questions, decision-local bindings, evidence, policy, tests, release state, and runtime resolution.

The workspace includes published **counterparty exposure assurance**, **grid outage response**, **airline regulatory assurance**, and **telecommunications/NVO regulatory assurance** examples. The compiler, runtime graph, and contract schema are deliberately domain-neutral so healthcare, public sector, manufacturing, software, and other industry packs can use the same product loop.

## What is implemented

- `@lattice/contracts`: typed industry workspace, shared ontology, ontology reference, concept scope, and Context Contract schemas.
- `@lattice/compiler-core`: hybrid lexical/vector intent candidate resolution, deterministic risk-aware operation and entity gates, policy-driven evidence and freshness enforcement, runtime approval escalation, clarification contracts, abstention, and version-pinned plans.
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

Runtime authorization is derived entirely from that verified identity. The permissions a plan requires are checked against the caller's token scopes — a request body that asserts its own entitlements is rejected — and wildcard scopes are stripped, so an issuer cannot mint blanket authority. The blanket bypass used by the development identity mapper is keyed off the authenticator rather than a role name, so an external directory that happens to emit a group called `DEVELOPER` gains nothing. Signed plans carry the principal and tenant they were issued to, and verification and execution both fail closed for anyone else.

### Plan signing and offline verification

Execution plans are signed with Ed25519. Configure a persistent key so a plan stays verifiable
across restarts and replicas; without one the server generates an ephemeral key, warns, and
refuses to start at all when `NODE_ENV=production`:

```bash
export LATTICE_SIGNING_KEY="$(cat signing-key.pem)"          # PKCS#8 Ed25519, PEM or base64 PEM
export LATTICE_SIGNING_KEYS_RETIRED="$(cat previous.pub.pem)" # comma-separated, kept through a rotation
```

The key identifier is the key's own RFC 7638 thumbprint, so it can never be reused for a
different key. `GET /v1/keys` publishes every key a verifier should trust, retired ones included,
so a plan signed before a rotation keeps verifying until it expires.

`@lattice/plan-verifier` verifies a plan from that key set alone, with no call back to the API —
checking signature, expiry, the subject it was issued to, and the contract release it is pinned
to. See [packages/plan-verifier/README.md](packages/plan-verifier/README.md).

### Running queries as the asking user

By default a governed query runs as one shared service principal, which means Unity Catalog row
filters and column masks, and Microsoft Fabric's own security, never see the person who asked.
Set a binding's `identityMode` to `DELEGATED` and configure a token exchange to run it as them
instead. Okta uses RFC 8693 token exchange; Microsoft Entra ID uses its on-behalf-of flow:

```bash
export LATTICE_DELEGATED_IDENTITY_PROVIDER=ENTRA          # or OKTA
export LATTICE_DELEGATED_IDENTITY_TOKEN_ENDPOINT=https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token
export LATTICE_DELEGATED_IDENTITY_CLIENT_ID=<application id>
export LATTICE_DELEGATED_IDENTITY_CLIENT_SECRET=<client secret>
# Optional per-platform overrides; Databricks and Fabric have sensible defaults
export LATTICE_DELEGATION_SCOPE_DATABRICKS=2ff814a6-3304-4ab8-85cb-cd0e6f879c1d/.default
export LATTICE_DELEGATION_SCOPE_MICROSOFT_FABRIC=https://database.windows.net/.default
```

A `DELEGATED` binding **fails** rather than falling back to the service identity when no exchange
is configured: quietly running as the service principal would apply none of the platform's
controls while the receipt claimed the user's own entitlements had. Every execution receipt
records which identity was used, and the MCP surface warns when a result was read as a service.

### Federating classification from your data catalog

Your catalog already decides which columns are sensitive. Point Lattice at it and discovered
fields arrive pre-classified, so nobody re-decides it in the Studio:

```bash
export LATTICE_CATALOG_PROVIDER=purview                   # or unity-catalog, collibra
export LATTICE_CATALOG_ENDPOINT=https://<account>.purview.azure.com
export LATTICE_CATALOG_TOKEN=<read-only token>
# Unity Catalog only: which tag key carries sensitivity (default `sensitivity`)
export LATTICE_CATALOG_SENSITIVITY_TAG=sensitivity
```

Purview reads sensitivity labels and classification rules, Unity Catalog reads column tags, and
Collibra reads asset attributes. All three normalize onto one assertion carrying the catalog it
came from, and an unrecognized label is treated as confidential rather than ordinary. A catalog
that cannot be read leaves fields unlabelled rather than blocking discovery — it is never
reported as "nothing sensitive here".

### Optional semantic intent resolution

The Context API always has a deterministic lexical resolver. To add vector-backed paraphrase resolution, configure an HTTPS embedding endpoint that accepts `{ model, input, encoding_format }` and returns indexed float vectors under `data`. Loopback HTTP is allowed for local models:

```bash
export LATTICE_EMBEDDING_URL=https://embeddings.example.com/v1/embeddings
export LATTICE_EMBEDDING_MODEL=governed-intent-embedding-v1
export LATTICE_EMBEDDING_API_KEY=server-only-token # optional for local endpoints
```

When Supabase is configured, the API reads the persisted, release-scoped index the
`contract_intent_embeddings` migration provisions: vectors belong to one immutable release with
the provider, model, and dimensions pinned alongside them, so a release can never mix vectors
from two embedding spaces. Only the question is embedded at compile time; the corpus is embedded
once when the release is published. The index is queried through `match_contract_intents` under
the caller's own token, so RLS remains the data boundary. A release whose index is not yet ready
resolves lexically rather than failing.

Without Supabase, the API embeds published operation descriptions and linked competency questions into a contract-release-scoped in-memory index. The index is cached by contract digest and model version. Semantic candidates never bypass the compiler: risk-tier-specific score, margin, and confirmation gates decide whether to continue, ask the user to choose an operation, or return `UNSUPPORTED`. Planning and operational actions require confirmation when selected only by semantic similarity. If the embedding endpoint is unavailable, resolution degrades to lexical candidates and records the sanitized degradation reason in `intentResolution`; questions and API keys are not logged.

### Supabase production identity and tenancy

Lattice can use Supabase Auth and Postgres as its production identity and tenancy boundary. When Supabase is connected through Vercel Marketplace, Lattice directly consumes the injected `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; no duplicate Lattice-specific variables are required. The injected `POSTGRES_URL` is reserved for the pooled runtime repository connection and `POSTGRES_URL_NON_POOLING` for migrations. `POSTGRES_PRISMA_URL` is not used because Lattice does not use Prisma. The `LATTICE_SUPABASE_*` and `VITE_SUPABASE_*` aliases in `.env.supabase.example` remain available for non-Vercel local deployments.

The Studio uses PKCE sessions with automatic refresh, requires organization onboarding or membership, and sends the active organization in `X-Lattice-Organization`. The API derives the Supabase issuer and JWKS endpoint from the project URL, verifies asymmetric user JWTs locally, and confirms the selected organization through the user-scoped Supabase Data API before accepting protected requests. When Supabase is configured, workspace ontologies, contract drafts, immutable releases, and release-control events are also read and written through the caller's bearer token and selected organization, leaving RLS as the final data boundary. The JSON registry remains a local-development fallback only when Supabase is not configured. `SUPABASE_SECRET_KEY`, legacy `service_role`, `POSTGRES_PASSWORD`, and database connection URLs remain server-only and are never exposed through a browser prefix.

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

Run `pnpm generate:ontologies` after adding or changing industry forms under `../Schemas` or the repository-owned `schemas/` overrides. The generator currently derives nine provenance-backed industry ontologies from 74 implemented forms and 1,420 source fields, then publishes field coverage in `docs/generated-ontology-report.json`. See [form-schema ontology generation](docs/ontology-generation.md).

Use the sun/moon and text-size switches in the header to toggle light or dark mode and the normal or large text scale. Both preferences are stored locally in the browser. The contrast-bearing foreground/background theme tokens meet WCAG AA contrast for normal text; the normal interface type floor is 12px, with a 13.5px large-text option.

The Studio ships with an English (`en-US`) source catalog, a Spanish (`es-ES`) translation, and a runtime-generated expanded pseudo-locale (`en-XA`) for finding untranslated text and layouts that cannot accommodate longer translations. Choose a language from the header dropdown; the preference is stored in the browser, and dates, times, numbers, and plurals use the active locale. Run `pnpm --filter @lattice/studio i18n:check` to extract and compile the source catalog. User-authored ontology content and server-provided evidence remain source data rather than being silently translated. RTL layout is not yet certified; see [docs/localization.md](docs/localization.md).

The Studio opens on the active industry workspace's **Shared ontology**. Fundamental entities and relationships are authored once at workspace level. **Contracts** then shows the decision contracts layered on that foundation; its labeled quick switch and contract cards control compiler, bindings, policy, assurance, evidence, and release views. Creating a contract inside a workspace includes an explicit concept-scope step so a contract inherits only the Core and industry concepts relevant to its decisions. Outside a workspace, the wizard offers the same nine generated packs that ship in the registry: airline, telecommunications/NVO, financial services, energy, healthcare, manufacturing, legal, insurance, and real estate. Their draft types include the real governed properties and relationships from the generated catalog. The airline and telecommunications workspaces each seed three published, decision-support-only regulatory reference contracts; see [airline ontology and regulatory references](docs/airline-ontology.md) and [telecommunications/NVO ontology and regulatory references](docs/telecommunications-ontology.md).

Open **Compiler** to inspect governed objects and relationships in a domain-neutral graph or table, trace their evidence, and compile the contract's competency question. The first-run guide can compile any active published example immediately, before authoring. The Grid example resolves its outage, traverses the governed `AFFECTED_ASSET` relationship, and returns a short-lived Ed25519-signed execution plan pinned to contract `0.1.1`.

Within a workspace, drag types to arrange the canvas, draw between node handles to create relationships, and edit properties in the inspector. The always-visible header save persists the active shared-ontology or contract draft; publish remains a separate governed release action. **Import schema** is available from navigation and the ontology canvas. It accepts OpenAPI, JSON Schema, RDF/XML, Turtle, or CSV; previews OWL classes, datatype properties, object properties, schema references, and inferred tabular fields; and lets an author merge, create, or skip every collision before staging an unpublished shared-ontology draft. The ontology header is context-aware: **package JSON** exports the active shared ontology or Context Contract with its governed bindings, while **semantic RDF/XML** and **semantic Turtle** serialize ontology meaning only. Portable JSON retains approved external credential references such as `env:`, `vault:`, workload identity, and managed identity, but strips sample payloads, embedded credential values, URL user information, fragments, and sensitive URL parameters. Switch to **Compiler** to compile questions against a contract's latest published release.

Open workspace-level **Ontology bindings** to map shared master or reference data once, or contract-level **Source bindings** for decision-specific sources. Both support Databricks, Microsoft Fabric, Snowflake, BigQuery, PostgreSQL, Kafka, S3/ADLS/OneLake, and OpenAPI. API bindings discover response fields from OpenAPI; Databricks, Microsoft Fabric, and PostgreSQL bindings can discover live provider metadata, while every data-platform binding can still ingest a declared row or event schema. Both flows suggest property mappings and stage the endpoint, read-only resource/query scope, external credential reference, freshness limit, permissions, and source checksum. Credential values are deliberately excluded.

The Studio reads its connector catalog from the API and can validate endpoint shape, resource scope, query safety, credential resolution, and runtime-driver availability for every staged binding. Databricks uses built-in HTTPS adapters for Unity Catalog discovery and Statement Execution; Microsoft Fabric uses encrypted native TDS with a Microsoft Entra SQL access token for `INFORMATION_SCHEMA` discovery and bounded T-SQL execution; PostgreSQL uses a native wire-protocol adapter for `information_schema` discovery and read-only transactions. Snowflake and BigQuery retain built-in HTTPS dispatchers. Kafka and object-storage transports remain delegated to a separately operated local connector runtime configured with `LATTICE_CONNECTOR_GATEWAY_URL=http://127.0.0.1:<port>`; further native connector expansion is deferred.

HTTP source bindings reach loopback by default. To let one reach a real service, allowlist its
host explicitly — opening this up unconditionally would turn a governed binding into an SSRF
primitive, so plaintext remains loopback-only regardless:

```bash
export LATTICE_HTTP_SOURCE_HOSTS=risk.internal,collateral.example.com
```

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
| `POST /v1/plans/:id/verify` | Verify signature, expiry, key, and contract digest for a plan issued to the caller. |
| `POST /v1/plans/:id/execute` | Execute a plan issued to the caller, using permissions derived from the verified token. |
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
| `GET /openapi.json` | Retrieve the OpenAPI 3.1 description of this API. |
| `GET /health` | Check API health. |

The API describes itself at `GET /openapi.json`, so enterprises can generate a client instead of
hand-rolling one. A test fails the build if a route is added without appearing in that document.

## Use it from an agent

`@lattice/mcp-server` exposes the governed loop as MCP tools, so any MCP-capable agent runtime can
consume Lattice without writing a client. It acts as one governed service identity; plans are
issued to it and its token scopes decide what it may execute.

```bash
pnpm --filter @lattice/mcp-server build
LATTICE_API_URL=http://127.0.0.1:8787 LATTICE_API_TOKEN=local-demo \
  node apps/mcp-server/dist/index.js
```

See [apps/mcp-server/README.md](apps/mcp-server/README.md) for the tool reference, the streamable
HTTP transport, and the identity model. To drive an agent's own tool list from a contract,
`projectGovernedTools` in `@lattice/contracts` emits each governed operation as an
Anthropic- or OpenAI-shaped tool definition carrying its risk tier, required permissions, and
approval requirement.

## Repository layout

```text
apps/
  api/                 Context API and signing boundary
  mcp-server/          MCP surface over the governed runtime loop
  studio/              Human authoring, assurance, and runtime UI
packages/
  compiler-core/       Pure deterministic compiler
  plan-verifier/       Offline execution-plan verification
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
