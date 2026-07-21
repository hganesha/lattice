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
- `@lattice/api`: dependency-light HTTP API with a persistent contract registry, immutable assurance and review artifacts, versioned releases, safe draft restoration, runtime suspension, server-derived identity, Ed25519 plan signing, plan verification, and clarification continuation.
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

Run `pnpm generate:ontologies` after adding or changing industry forms under `../Schemas`. The generator currently derives seven provenance-backed industry ontologies from 55 implemented forms and publishes a field-coverage report in `docs/generated-ontology-report.json`. See [form-schema ontology generation](docs/ontology-generation.md).

Use the sun/moon and text-size switches in the header to toggle light or dark mode and the normal or large text scale. Both preferences are stored locally in the browser. The contrast-bearing foreground/background theme tokens meet WCAG AA contrast for normal text; the normal interface type floor is 12px, with a 13.5px large-text option.

The Studio ships with an English (`en-US`) source catalog, a Spanish (`es-ES`) translation, and a runtime-generated expanded pseudo-locale (`en-XA`) for finding untranslated text and layouts that cannot accommodate longer translations. Choose a language from the header dropdown; the preference is stored in the browser, and dates, times, numbers, and plurals use the active locale. Run `pnpm --filter @lattice/studio i18n:check` to extract and compile the source catalog. User-authored ontology content and server-provided evidence remain source data rather than being silently translated. RTL layout is not yet certified; see [docs/localization.md](docs/localization.md).

The Studio opens on the active industry workspace's **Shared ontology**. Fundamental entities and relationships are authored once at workspace level. **Contracts** then shows the decision contracts layered on that foundation; its labeled quick switch and contract cards control compiler, bindings, policy, assurance, evidence, and release views. Creating a contract inside a workspace includes an explicit concept-scope step so a contract inherits only the Core and industry concepts relevant to its decisions. Outside a workspace, the wizard offers the same seven generated packs that ship in the registry: financial services, energy, healthcare, manufacturing, legal, insurance, and real estate. Their draft types include the real governed properties and relationships from the generated catalog.

Open **Compiler** to inspect governed objects and relationships in a domain-neutral graph or table, trace their evidence, and compile the contract's competency question. The first-run guide can compile any active published example immediately, before authoring. The Grid example resolves its outage, traverses the governed `AFFECTED_ASSET` relationship, and returns a short-lived Ed25519-signed execution plan pinned to contract `0.1.1`.

Within a workspace, drag types to arrange the canvas, draw between node handles to create relationships, and edit properties in the inspector. The always-visible header save persists the active shared-ontology or contract draft; publish remains a separate governed release action. **Import schema** is available from navigation and the ontology canvas. It accepts OpenAPI, JSON Schema, RDF/XML, Turtle, or CSV; previews OWL classes, datatype properties, object properties, schema references, and inferred tabular fields; and lets an author merge, create, or skip every collision before staging an unpublished shared-ontology draft. The ontology header exports the current model as native Lattice JSON, standards-compatible RDF/XML, or Turtle. Switch to **Compiler** to compile questions against a contract's latest published release.

Open workspace-level **Ontology bindings** to map shared master or reference data once, or contract-level **Source bindings** for decision-specific sources. Both support Databricks, Microsoft Fabric, Snowflake, BigQuery, PostgreSQL, Kafka, S3/ADLS/OneLake, and OpenAPI. API bindings discover response fields from OpenAPI; data-platform bindings ingest a declared row or event schema. Both flows suggest property mappings and stage the endpoint, read-only resource/query scope, external credential reference, freshness limit, permissions, and source checksum. Credential values are deliberately excluded.

The Studio reads its connector catalog from the API and can validate endpoint shape, resource scope, query safety, credential resolution, and runtime-driver availability for every staged binding. Databricks, Snowflake, and BigQuery have built-in HTTPS dispatchers and resolve bearer credentials declared as `env:VARIABLE_NAME`. Microsoft Fabric, PostgreSQL, Kafka, and object-storage transports dispatch through a separately operated local connector runtime configured with `LATTICE_CONNECTOR_GATEWAY_URL=http://127.0.0.1:<port>`. That gateway receives `POST /v1/execute` with the governed binding; platform credentials remain in that runtime rather than in the contract or browser.

Open **Assurance** to link competency questions to implemented operations and execute deterministic structural, question, mapping, policy, and release gates against the current draft. Each run is stored as a digest-backed immutable artifact, rendered as an evidence trace, and synchronized into contract test status. Critical failures block publishing.

Open **Policy profiles** to cover each implemented operation risk tier with executable evidence-strength, freshness, and human-escalation rules. Recommended baselines can be staged for uncovered tiers, while custom profiles remain editable and version pinned. The compiler enforces these settings, and missing or unapproved policies block release.

Open **Review queue** to submit semantic types, source bindings, and runtime policies for governance approval. Authenticated authors and reviewers are recorded separately; approval, approval-with-exception, and rejection all require a rationale. Requests and decisions are immutable digest-backed artifacts, and successful decisions become expert-decision evidence on the contract. Unapproved claims are blocked from publishing.

Open **Evidence registry** to filter provenance artifacts by class and freshness, inspect validity and content digests, and trace each artifact to dependent context objects, relationships, bindings, review decisions, or assurance runs.

Open **Release history** to inspect immutable releases and their version pins, compare any release with the working contract, view semantic-version and downstream-impact suggestions, suspend or resume runtime compilation, or restore an older release as a new unpublished draft. Restoration and suspension never rewrite release history.

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
| `POST /v1/contracts/:id/restores` | Restore an immutable release as a new unpublished draft without moving the live pointer. |
| `POST /v1/contracts/:id/runtime-status` | Suspend or resume runtime compilation without mutating releases. |
| `POST /v1/imports/preview` | Analyze an authenticated OpenAPI/JSON Schema source and return a non-mutating, checksum-stamped proposal. |
| `POST /v1/bindings/preview` | Discover OpenAPI operations or tabular fields and flatten them for semantic mapping. |
| `GET /v1/connectors` | List the single-workspace governed connector catalog and runtime metadata. |
| `POST /v1/connectors/validate` | Validate resource scope, read-only query safety, credential resolution, and runtime-driver availability. |
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

The current milestone proves the visual schema-authoring/import/versioning loop, standards and tabular ingestion, a provider-neutral binding catalog with validation and dispatch seams, safe release-to-draft restoration with working-copy diffs, and the compile/clarify/escalate/abstain/sign/approve/execute loop. Multi-tenant storage remains intentionally deferred. The remaining implementation milestones are native Fabric/PostgreSQL/Kafka/object-storage gateway packages, live provider schema discovery, release-to-release diff exports and controlled live-pointer rollback, OIDC/JWKS authentication, append-only evidence and audit storage, richer purpose-aware policy expressions, and additional industry packs.

## Design principles

1. Contracts before graphs.
2. Evidence before assertion.
3. Compilation before execution.
4. Signed plans before tool calls.
5. Clarification and abstention are first-class successful outcomes.
6. One core runtime; many independently versioned industry packs.
