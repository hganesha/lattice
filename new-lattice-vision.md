# New Lattice Vision

**Verified context, compiled for action**

**Status:** Unified product direction  
**Working name:** Lattice  
**Product scope:** Cross-industry and cross-domain  
**Worked example:** Counterparty risk and exposure assurance  
**Category:** Enterprise context assurance and compilation

---

## 1. The decision

Lattice should not be built or sold as an AI ontology editor.

It should be built as the **platform-neutral control plane that turns fragmented enterprise knowledge into verified context contracts, proves those contracts against real workflows, and compiles them into safe runtime plans for AI and applications**.

The ontology builder, the Context API, the graph visualization, the pack factory, and the assurance workflow are not separate products. They are stages of one product loop:

```text
QUESTION
   -> DISCOVER
   -> MODEL
   -> BIND
   -> REVIEW
   -> TEST
   -> RELEASE
   -> COMPILE
   -> OBSERVE
   -> EVOLVE
```

The deployable unit is not an ontology file. It is a **Context Contract**: a versioned package of semantics, bindings, evidence, decisions, tests, policies, and runtime operations for a bounded workflow.

Lattice is domain-agnostic by design. The same contract and assurance machinery applies to financial risk, healthcare operations, clinical research, manufacturing, energy, customer operations, cybersecurity, regulatory compliance, and internal enterprise systems. Counterparty risk and exposure is a concrete reference scenario used to make the architecture testable; it is not the product boundary.

The primary product promise is:

> Lattice gives enterprise AI a verified model of what the business means, where the truth lives, what operations are allowed, and when the system must clarify, abstain, or ask for approval.

---

## 2. What the current visions already get right

The existing materials contain five strong ideas that belong in one system.

### 2.1 From the original ontology-builder vision

- A business description, its data, industry knowledge, and expert judgment can be compiled into a living semantic model.
- AI should draft; humans should validate consequential claims.
- Templates, research, and customer data have different trust profiles and must remain distinguishable.
- Provenance is not metadata decoration. It drives review.
- The model should compile to multiple targets instead of trapping the user in one graph technology.
- A navigable graph and catalog make the business legible to both humans and machines.

### 2.2 From the updated Lattice product spec

- Modeling must start from competency questions and workflows, not from a desire to model the whole enterprise.
- The right unit is minimum sufficient context for a defined outcome.
- Review priority combines uncertainty with impact, usage, and change risk.
- Context quality is demonstrated by tests, not by diagram completeness.
- Claims, evidence, decisions, mappings, tests, versions, and changesets are first-class product objects.
- Continuous assurance and change impact create recurring value after initial generation.

### 2.3 From the ContextGraph API and architecture

- Runtime context must resolve entities, metrics, relationships, source authority, and business intent before an agent acts.
- Public contracts should expose typed business operations, not SAP tables or generated SQL.
- Compilation and execution must be separate security boundaries.
- Runtime outcomes include clarification, abstention, stale context, insufficient evidence, and approval required—not just a best guess.
- Semantic, policy, binding, and API versions must be pinned into a signed execution plan.
- Deterministic resolution and policy paths must remain correct when LLMs are unavailable.

### 2.4 From the pack-building and onboarding specifications

- Industry packs require authoritative corpora, decomposition, structured extraction, multi-pass agreement, consistency gates, benchmark questions, and steward approval.
- Templates should accelerate Day 0 value without entering production as unverified truth.
- A tenant overlay extends a shared pack without mutating it.
- Bulk review and progressive activation are essential to avoiding validation fatigue.
- Runtime failures and steward corrections should improve a governed evaluation corpus, not silently rewrite production semantics.

### 2.5 From the sample graph UI

The UI demonstrates a useful visual grammar that is stronger than a generic force-directed graph:

- semantic zones for major categories;
- ordered lanes for entity subtypes;
- bundled corridors for relationships across zones;
- focal-node emphasis and neighborhood dimming;
- inferred versus validated visual treatment;
- filtering by type and relationship;
- progressive disclosure through collapse, pagination, and virtualization;
- an inspectable detail panel;
- a domain-agnostic graph contract.

This should become the spatial foundation of the Lattice workspace. It needs to be expanded from a topology viewer into an assurance and operations surface.

---

## 3. What Microsoft changes—and what it does not

Microsoft's open-source **Ontology Playground** and Microsoft's commercial **Fabric IQ Ontology** must be treated as two different comparators.

### 3.1 Ontology Playground is a strong learning and design experience

The repository is a static, open-source application for learning, authoring, visualizing, importing, exporting, and sharing small ontologies. Its strengths are:

- an approachable visual designer with live preview and undo/redo;
- real-time structural and Fabric naming validation;
- RDF/OWL round-trip and Fabric-compatible export;
- a curated catalogue and starter templates;
- deep links and an embeddable graph widget;
- guided tours, quests, courses, quizzes, and presentation mode;
- a path finder and query playground;
- a one-click community contribution workflow;
- direct push into a Fabric workspace.

These are meaningful product lessons. Microsoft has made ontology concepts understandable, shareable, and easy to try.

But the repository is deliberately a playground. Its core model is entity types, properties, relationships, and simple bindings. Its natural-language query experience is a local demo matcher. Its AI builder is a single generation call with basic shape validation. Its graph guidance targets small models, and its state is primarily client-side. It has no enterprise claim ledger, evidence chain, expert approval system, context test suite, bitemporal history, semantic release policy, source-authority model, signed runtime plan, or cross-platform execution boundary.

### 3.2 Fabric IQ is the real strategic comparator

Fabric IQ's product documentation now describes:

- entity types, instances, properties, relationships, rules, and constraints;
- OneLake data bindings and source lineage;
- graph-backed traversal, path analysis, and inference;
- natural-language ontology querying;
- ontology generation from Power BI semantic models;
- data and operations agent grounding;
- governed actions inside the Microsoft ecosystem.

That means Lattice cannot credibly differentiate with claims such as “ontologies ground agents,” “relationships replace hidden joins,” or “business terms can be queried instead of tables.” Microsoft already tells that story.

### 3.3 The correct competitive stance

Lattice should complement Fabric IQ, Snowflake, Databricks, dbt, Neo4j, Stardog, SAP, Oracle, and future native semantic platforms.

Its differentiation is the assurance and compilation layer above them:

| Capability | Ontology Playground | Fabric IQ Ontology | New Lattice |
|---|---|---|---|
| Learn and visually author an ontology | Strong | Product-native | Strong, workflow-guided |
| RDF/OWL import/export | Strong | Fabric-oriented | Adapter-based |
| Bind semantics to enterprise data | Illustrative | Strong in OneLake/Fabric | Cross-platform |
| Generate from existing models | One-shot AI description | Power BI semantic model | Multi-source evidence pipeline |
| Evidence per material claim | No | Source lineage, platform-defined | First-class claim/evidence ledger |
| Impact-aware expert review | No | Platform governance | Core workflow |
| Competency-question and agent tests | Demo queries | Platform query/agent experience | Release-blocking assurance suite |
| Semantic diffs and downstream impact | No | Platform lifecycle | Cross-system dependency graph |
| Portable verified release | RDF/JSON files | Fabric item | Signed Context Contract |
| Safe query-time compilation | No | Fabric-native query/action path | Vendor-neutral typed plan IR |
| Clarify/abstain/approve policy | No | Platform-specific | Explicit public contract |
| Bitemporal and replayable decisions | No | Instance/source timing | Semantic and operational bitemporality |
| Cross-platform context observability | No | Fabric telemetry | Core control-plane value |
| Public catalogue and education | Strong | Documentation/tutorials | Adopt as community and onboarding layer |

Lattice wins when an enterprise has multiple platforms, needs evidence and approval beyond platform-local governance, must prove context quality before agent release, or needs the same verified meaning compiled into more than one runtime.

---

## 4. Gaps in the current Lattice materials

The local specifications are ambitious and mostly aligned, but they still describe adjacent products rather than one fully resolved system.

### 4.1 Product gaps

#### The authoring-to-runtime contract is implicit

The builder produces models and the API consumes bundles, but the exact promotion contract between them is not defined. A Context Contract must be the single artifact that travels from draft through review, tests, release, runtime compilation, and observability.

#### The initial wedge still contains too much product

The full vision spans authoring, mapping, entity resolution, graph analysis, testing, runtime APIs, connectors, regulatory research, marketplace, and observability. The MVP must demonstrate one golden thread rather than shallow versions of every module.

#### The buyer and operator sequence is unresolved

The product alternates between a domain outcome buyer, a data/AI platform buyer, and an ontology author. The first engagement should center on one consequential workflow in the design partner's industry, operated jointly by a business operator, domain steward, and data engineer, with the AI platform team consuming the released contract. Counterparty exposure assurance is one worked example of this pattern, not a required entry market.

#### The “pack moat” is overstated without an operating system

Ontology content will be copied and native platforms will add templates. The defensible asset is the combination of pack content, benchmark questions, evidence patterns, accepted/rejected proposals, connector bindings, change migrations, and production outcome telemetry.

#### Collaboration is underspecified

Enterprise semantics require ownership, reviewer routing, branches, comments, exception handling, release approvals, deprecation windows, and merge conflict resolution. “Git-like” should become a concrete workflow, not a metaphor.

### 4.2 Meta-model gaps

The original model is too narrow for the later vision. A unified canonical model must cover:

- domain semantics: entity types, properties, relationships, metrics, events, actions, policies, constraints, and state transitions;
- operational meaning: sources, identity crosswalks, bindings, transforms, operation schemas, routes, and result schemas;
- assurance: claims, evidence, decisions, tests, impact, owners, exceptions, and quality thresholds;
- release management: packages, component versions, changesets, migrations, compatibility, and dependencies;
- runtime: resolutions, clarifications, plans, approvals, execution evidence, outcomes, and feedback.

### 4.3 Trust-model gaps

A boolean `validated` field and a decimal confidence score cannot represent enterprise trust.

Lattice needs independent axes:

| Axis | Example states |
|---|---|
| Evidence | Declared, directly evidenced, pattern-supported, template-derived, conflicting, unverified |
| Approval | Draft, in review, approved, exception, rejected, deprecated, superseded |
| Release | Unpublished, candidate, published, suspended, retired |
| Assertion | Proposed, asserted, derived, inferred, overridden |
| Freshness | Current, aging, stale, invalid |
| Impact | Low, medium, high, critical |
| Runtime decision | Resolved, clarify, approval required, insufficient evidence, stale, deny, unsupported |

Numeric confidence must only appear for claim classes with measured calibration.

### 4.4 API contradictions

The product API and architecture currently disagree in production-critical ways:

- tenant identity appears in request bodies and headers even though the architecture requires it to come from trusted identity claims;
- `/route` exposes raw SAP tables, fields, filters, and aggregation expressions even though the architecture requires source-neutral business operations;
- separately callable resolution and routing endpoints can bypass atomic guardrails;
- the clarification continuation endpoint is missing from the product spec;
- public examples show uncalibrated probability-like confidence values;
- plan signing, key discovery, rotation, and revocation are incomplete;
- some cache keys omit the semantic bundle digest or authorization scope;
- stale relationships are not consistently risk-tier aware.

The unified API must make `POST /v1/compile` the only endpoint that can authorize an execution plan. Registry and exploration endpoints are read-only and cannot be composed into execution authority by clients.

### 4.5 Architecture gaps

- The documents use inconsistent plane models.
- Bundle granularity conflicts with different refresh cadences.
- Relationship assertion lifecycle is not specified as a state machine.
- Connector capability manifests are required but undefined.
- Graph-substrate evaluation lacks a durable benchmark contract.
- Build-time pack creation, tenant onboarding, runtime compilation, execution, and feedback do not share one release object.

### 4.6 UX and visualization gaps

The current graph is visually compelling but the data contract is still a viewer contract.

It does not yet expose:

- type graph versus instance graph modes;
- claim, evidence, owner, approval, freshness, and impact overlays;
- competency-question coverage;
- physical source bindings and authoritative-source conflicts;
- temporal/as-of inspection;
- review actions on nodes, edges, mappings, or metrics;
- semantic diffs and blast radius;
- failed-test highlighting;
- multi-hop path explanation with missing-link states;
- release comparison;
- collaborative comments and assignments.

The layout also assumes a small number of named group slots. It should evolve into a reusable zone-layout grammar that supports domain-defined spatial templates, multiple scopes, and large-model overview/zoom behavior.

---

## 5. The unified product model

### 5.1 The product object hierarchy

```text
Context Workspace
  └── Context Project
        ├── Workflow
        ├── Competency Questions
        ├── Context Contract
        │     ├── Semantic Model
        │     ├── Operational Bindings
        │     ├── Assurance Ledger
        │     ├── Policy Set
        │     ├── Test Suite
        │     └── Runtime Operation Catalogue
        ├── ChangeSets
        └── Contract Releases
```

### 5.2 Context Contract

A Context Contract is the source-controlled, testable definition of how a bounded business workflow may be understood and executed.

It contains:

1. **Questions and operations** — what users and agents need to ask or do.
2. **Semantic model** — entities, relationships, properties, metrics, rules, events, actions, constraints, and time semantics.
3. **Bindings and identity** — authoritative sources, physical mappings, transforms, keys, aliases, entity-resolution policy, and result schemas.
4. **Claims and evidence** — why each consequential element exists and what supports it.
5. **Decisions and ownership** — who approved, changed, rejected, or excepted it.
6. **Tests** — structural, mapping, data, question, agent, policy, change, and abstention tests.
7. **Policies** — evidence thresholds, reviewer requirements, freshness rules, permissions, and risk-tier behavior.
8. **Runtime operations** — stable business operations that can compile into environment-specific execution.
9. **Release metadata** — versions, compatibility, dependencies, migrations, digests, signatures, and activation state.

### 5.3 Layering and reuse

```text
Global foundation
   -> Industry domain pack
      -> Workflow pack
         -> Tenant overlay
            -> Environment bindings
               -> Release-specific policy and operation bundle
```

Each layer extends the one above it. Overrides are explicit, reviewable, conflict-checked, and reversible. Tenant data never mutates a shared pack.

### 5.4 Claim lifecycle

```text
PROPOSED
   -> EVIDENCED
   -> IN_REVIEW
   -> APPROVED | APPROVED_WITH_EXCEPTION | REJECTED | DEFERRED
   -> CANDIDATE_RELEASE
   -> PUBLISHED
   -> SUPERSEDED | DEPRECATED | SUSPENDED
```

Evidence status, approval status, and release status remain separate fields. A well-evidenced claim can still be unapproved; an approved claim can later become stale; a published claim can be suspended without deleting its history.

---

## 6. The unified product experience

Lattice has one workspace with four tightly connected modes rather than separate products.

### 6.1 Design mode — define what must be true

The user starts with a workflow and competency questions. Lattice profiles sources, imports existing models, applies approved packs, and drafts the minimum context required.

The interface combines the best lessons of the existing graph and Microsoft's approachable designer:

- conversational intake plus explicit question editor;
- starter workflow packs instead of a blank canvas;
- form and graph editing with live validation and undo/redo;
- RDF/OWL, JSON-LD, LinkML, SQL/dbt, Fabric, and platform imports;
- a catalogue of trusted packs, examples, and learning content;
- shareable read-only views and an embeddable explorer.

Unlike a playground, every generated element arrives as a claim with rationale, provenance, expected use, evidence status, impact, and owner.

### 6.2 Assurance mode — decide what may be trusted

This is the product's center of gravity.

The review queue is ordered by:

```text
Priority = uncertainty × business impact × usage × change risk × blocked questions
```

Review can occur on an individual claim, a template section, a mapping group, or a changeset. Each review surface shows:

- the business-language claim;
- supporting and conflicting evidence;
- source samples and effective dates;
- affected questions, agents, operations, and releases;
- deterministic checks and failed tests;
- recommended reviewer and policy requirements;
- accept, edit, reject, split, merge, defer, except, or request evidence.

Bulk review is allowed only when the policy explains why the group is safe to batch.

### 6.3 Explore mode — see meaning, evidence, and impact

The existing zoned visualization becomes a multi-lens context map.

Core lenses:

| Lens | Visual question |
|---|---|
| Semantic | What concepts and relationships define this workflow? |
| Instance | What real entities and dependency paths exist now? |
| Evidence | Which elements are supported, conflicting, or unverified? |
| Binding | Which sources populate each concept, property, and edge? |
| Question | Which context supports or blocks this competency question? |
| Test | Where are failures and coverage gaps? |
| Change | What changed, and what is the blast radius? |
| Runtime | Which paths and definitions did an agent actually use? |
| Temporal | What was true, and what did Lattice know, at a chosen time? |

The visual grammar should retain semantic zones, lanes, corridors, focus-path dimming, filters, collapse, and virtualization. It should add:

- badges and borders for evidence, approval, freshness, and impact;
- path ribbons that show operation steps, source hops, and policy gates;
- ghost nodes and broken corridors for missing context;
- split-edge treatment for conflicting assertions;
- diff colors for added, changed, deprecated, and invalidated elements;
- a side panel that joins definition, evidence, decisions, tests, bindings, usage, and history;
- saved views tied to questions, incidents, releases, and review tasks.

### 6.4 Operate mode — release, compile, and observe

Approved contracts move through a PR-like release workspace:

1. inspect semantic diff;
2. see impacted questions, operations, agents, sources, and tests;
3. run required regression and conformance suites;
4. collect approvals;
5. compile immutable component bundles;
6. sign the composite release manifest;
7. publish to selected targets;
8. activate by version pointer;
9. observe runtime usage and failures;
10. roll back without rebuilding.

Runtime corrections create proposed changes or evaluation cases. They never mutate a published contract automatically.

---

## 7. The singular architecture

Use one experience layer over four operational planes.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ EXPERIENCE                                                           │
│ Questions · Studio · Context Map · Review · Tests · Releases · Ops   │
└──────────────────────────────────────────────────────────────────────┘
                                │
┌──────────────────────────────────────────────────────────────────────┐
│ 1. BUILD PLANE                                                       │
│ Ingest · Profile · Discover · Draft · Evidence · Steward · Pack Lab  │
│ Produces candidate Context Contracts and ChangeSets                  │
└──────────────────────────────────────────────────────────────────────┘
                                │ signed release
┌──────────────────────────────────────────────────────────────────────┐
│ 2. RUNTIME COMPILATION PLANE                                         │
│ Resolve · Classify · Validate · Guard · Route · Compile · Explain    │
│ Produces a signed, source-neutral Execution Plan IR                  │
└──────────────────────────────────────────────────────────────────────┘
                                │ verified plan
┌──────────────────────────────────────────────────────────────────────┐
│ 3. EXECUTION PLANE                                                   │
│ Managed gateway · Private gateway · Delegated executor · Compile-only│
│ Verifies · Rechecks policy · Binds · Executes · Normalizes           │
└──────────────────────────────────────────────────────────────────────┘
                                │ evidence/outcomes
┌──────────────────────────────────────────────────────────────────────┐
│ 4. FEEDBACK PLANE                                                    │
│ Usage · Drift · Failures · Corrections · Divergence · Eval Corpus    │
│ Proposes reviewed changes; never self-publishes                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.1 Shared control-plane services

The four planes share product-owned services:

- canonical Context Contract registry;
- claims, evidence, decisions, and stewardship service;
- component-version and release registry;
- policy and risk engine;
- test and evaluation workbench;
- identity and tenant isolation;
- connector and publication adapter registry;
- audit, observability, and dependency index.

### 7.2 Composite releases, independent components

A release is a signed composite manifest whose components can have independent cadences:

```json
{
  "contract": "domain-workflow@1.4.0",
  "components": {
    "semantic": "sha256:...",
    "aliases": "sha256:...",
    "metrics": "sha256:...",
    "relationships": "sha256:...",
    "bindings": "sha256:...",
    "policies": "sha256:...",
    "operations": "sha256:...",
    "tests": "sha256:..."
  },
  "compatibility": "compile-ir@1",
  "signature": "..."
}
```

An alias refresh need not rebuild an unchanged policy artifact, but activation always points to one immutable composite manifest. This resolves the current tension between atomic releases and component-specific refresh schedules.

### 7.3 Storage strategy

- PostgreSQL for authoritative project, contract, temporal, policy, decision, and release data;
- indexed typed edges in PostgreSQL for the initial graph substrate;
- object storage for evidence and immutable bundle artifacts;
- tenant-isolated vector stores for candidate generation only;
- append-only decision and runtime event log;
- test-result and observability stores;
- graph adapters behind an owned interface when benchmark evidence justifies them.

The internal store is not the required customer runtime.

---

## 8. Runtime API: one authoritative path

### 8.1 Primary endpoint

```http
POST /v1/compile
Authorization: Bearer <trusted-token>
Idempotency-Key: <client-key>
```

Tenant, principal, agent identity, scopes, and allowed purposes are derived from trusted identity claims. They are not accepted as ordinary request fields.

The compiler atomically:

1. pins contract, semantic, policy, binding, and API versions;
2. classifies intent, operation family, and risk tier;
3. resolves entities and metrics using evidence-producing resolvers;
4. validates directed, effective-dated relationships;
5. checks evidence sufficiency, freshness, authorization, and approval policy;
6. returns a clarification or non-permit outcome when required;
7. selects an approved source binding;
8. emits a signed source-neutral plan with expected result schema;
9. records the complete decision event.

### 8.2 Runtime outcomes

```text
RESOLVED
CLARIFICATION_REQUIRED
APPROVAL_REQUIRED
INSUFFICIENT_EVIDENCE
STALE_CONTEXT
DENIED
UNSUPPORTED
DEGRADED
```

### 8.3 Supporting endpoints

| Endpoint | Authority |
|---|---|
| `POST /v1/compile` | May produce an executable signed plan |
| `POST /v1/clarifications/{id}` | Continues and recompiles a prior request |
| `POST /v1/approvals/{id}` | Records required approval and recompiles under policy |
| `GET /v1/resolutions/{id}` | Read-only evidence, reason codes, versions, explanation |
| `POST /v1/plans/{id}/verify` | Verifies signature, expiry, nonce, versions, and schema |
| `POST /v1/plans/{id}/execute` | Optional managed/private execution trigger |
| `GET /v1/contracts/{version}` | Authorized contract metadata |
| `GET /v1/entities/{id}` | Read-only canonical entity view |
| `GET /v1/metrics/{id}` | Read-only approved metric definition |
| `GET /v1/releases/{version}/manifest` | Signed composite manifest |

Registry, graph exploration, and definition endpoints cannot independently authorize an operation.

### 8.4 Execution Plan IR

The public plan contains:

- stable business operation ID;
- typed entity and metric arguments;
- risk tier and decision outcome;
- approved source binding version, not physical query text;
- required permissions and local verification obligations;
- expected result schema;
- evidence references and reason codes;
- contract and component digests;
- expiry, nonce, key ID, and signature.

Connector-specific SQL, KQL, GQL, SAP APIs, or table fields exist only inside the binding adapter in the execution environment.

---

## 9. AI boundary

AI is used where it reduces authoring and review cost:

- intake and question decomposition;
- source and document classification;
- candidate concept, relationship, mapping, metric, and rule discovery;
- evidence extraction and summarization;
- conflict and gap detection;
- review grouping and explanation;
- test and benchmark proposal;
- changeset summarization;
- offline pack construction.

AI may propose runtime candidates only in allowed risk tiers and only as untrusted evidence.

AI must not:

- derive tenant identity;
- authorize a resolution or operation;
- select an unapproved source route;
- create a relationship path not present in a released contract;
- evaluate policy;
- sign a plan;
- merge high-impact identities silently;
- approve or publish a contract;
- invent explanation facts outside the structured decision record.

The MVP runtime fast path should require no LLM call.

---

## 10. Initial product pattern: the golden thread

The first release should prove one end-to-end path for a consequential workflow in a single design-partner domain. The implementation must use the cross-industry meta-model and extension system from the beginning, so the first example validates the product without hard-coding its vocabulary or architecture.

### 10.1 Target customer

An enterprise with a high-value AI or decision workflow; fragmented structured and unstructured sources; one accountable business owner; one domain steward; one data owner; and 10–30 important questions whose correctness, evidence, and change impact matter.

### 10.2 Golden-thread scenario

The domain-neutral pattern is:

> If a consequential business entity, condition, rule, or dependency changes, what outcomes are affected, which paths and evidence support the conclusion, what remains unknown, and which agents, decisions, or reports become unsafe?

Worked financial-services example:

> If Counterparty C-103 defaults or its credit rating drops two notches, which legal entities, portfolios, instruments, positions, collateral agreements, limits, capital metrics, and regulatory reports are affected; which exposure paths and evidence support the conclusion; what remains unknown; and which agents or decisions become unsafe?

Equivalent examples include:

- **Healthcare:** If a clinical policy or drug contraindication changes, which care pathways, patients, and decision-support agents are affected?
- **Life sciences:** If a trial protocol or source result is invalidated, which endpoints, submissions, claims, and models must be re-evaluated?
- **Manufacturing:** If a quality rule or equipment dependency changes, which production plans, batches, customers, and control decisions are affected?
- **Energy:** If Asset A or Pipeline P is unavailable, which production commitments, customers, and safety obligations are affected?
- **Customer operations:** If an entitlement or contract rule changes, which customers, products, renewals, and support actions are affected?
- **Cybersecurity:** If a vulnerability or control mapping changes, which assets, services, owners, policies, and response automations are affected?

### 10.3 Reference Context Contract

The counterparty-risk example uses a bounded contract rather than attempting to model an entire bank or asset manager.

Core entity types:

- Counterparty and Counterparty Group
- Legal Entity
- Instrument and Position
- Portfolio, Fund, or Trading Book
- Trade and Transaction
- Netting Agreement and Collateral Agreement
- Collateral
- Credit Limit
- Credit Rating
- Jurisdiction
- Regulatory Obligation and Regulatory Report

Core relationship types:

- Legal Entity `TRADES_WITH` Counterparty
- Counterparty `MEMBER_OF` Counterparty Group
- Position `REFERENCES` Instrument
- Position `HELD_IN` Portfolio
- Trade `GOVERNED_BY` Netting Agreement
- Collateral `SECURES` Agreement or Exposure
- Credit Limit `APPLIES_TO` Counterparty, Group, or Portfolio
- Counterparty `DOMICILED_IN` Jurisdiction
- Regulatory Obligation `GOVERNS` Legal Entity or Report

Core governed metrics:

- gross and net current exposure;
- potential future exposure;
- collateralized and uncollateralized exposure;
- limit utilization and breach amount;
- concentration by counterparty group, geography, instrument, and sector;
- wrong-way risk indicators;
- risk-weighted assets and capital impact where applicable.

Every identity, aggregation, netting rule, conversion rate, hierarchy, and source binding is represented as an evidence-backed claim with an effective date and an explicit owner.

### 10.4 Required flow

1. Create the project from the selected industry and workflow pack.
2. Enter or import competency questions and expected answer shapes.
3. Upload files or connect one read-only SQL/warehouse source.
4. Profile schemas, keys, quality, freshness, and sensitivity.
5. Draft the minimum entities, relationships, rules, metrics, and events required by the selected questions.
6. Propose source mappings, joins, aliases, and authoritative-source assignments.
7. Review only high-impact, ambiguous, conflicting, or question-blocking claims.
8. Run structural, mapping, data, known-answer, path, and abstention tests.
9. Explore the relevant impact, dependency, policy, or decision paths in the zoned context map.
10. Release a signed Context Contract.
11. Publish JSON and SQL outputs plus one primary platform adapter.
12. Compile at least one natural-language question into a governed read plan.
13. Detect a source schema, governed rule, or relationship change and show the semantic and downstream blast radius.

This integrates the builder and Context API without requiring the entire long-term platform.

### 10.5 MVP modules

- Workflow and question designer
- Source profiler
- Minimum-context drafting
- Context map
- Claim/evidence review queue
- Test workbench
- Scenario and impact explorer
- Changeset and release workspace
- Contract registry
- Compile, clarify, resolve, and verify APIs
- SQL/JSON publication plus one ecosystem adapter

### 10.6 MVP non-goals

- modeling the whole enterprise or shipping prebuilt packs for every industry in the first release;
- unrestricted entity resolution;
- broad regulatory interpretation;
- autonomous write actions;
- full connector marketplace;
- a public cross-industry pack marketplace;
- proprietary graph database;
- universal RDF/OWL reasoning;
- arbitrary graph query API;
- multi-agent orchestration platform.

### 10.7 Exit criteria

- first usable candidate contract in under 60 minutes after ingestion;
- initial expert review in under four hours for the bounded workflow;
- at least 85% of agreed competency questions passing;
- fewer than 2% critical false-positive paths in the design-partner corpus;
- over 80% coverage for question-required mappings;
- all material claims have evidence or an explicit approved exception;
- every runtime plan is version-pinned, policy-checked, and replayable;
- a source change produces an accurate affected-question and affected-release set;
- design partners pay for continued assurance after the initial build.

---

## 11. Product modules after the wedge

### Lattice Studio

Question-first authoring, imports, templates, graph/form editing, source profiling, mappings, and identity proposals.

### Lattice Assurance

Claims, evidence, impact-aware review, policies, tests, quality scorecards, and approvals.

### Lattice Map

The zoned, lane-based, multi-lens visualization for semantics, instances, evidence, bindings, questions, tests, changes, and runtime paths.

### Lattice Registry

Contracts, packs, components, versions, dependencies, compatibility, releases, migrations, and publication targets.

### Lattice Runtime

Resolution, clarification, source-neutral plan compilation, verification SDKs, and optional private/managed execution gateways.

### Lattice Observe

Usage, drift, failed questions, stale evidence, agent corrections, policy outcomes, evaluation cases, and change proposals.

### Lattice Exchange

Public learning catalogue, private enterprise pack registry, workflow/test packs, connectors, publication adapters, and community contributions.

The Playground-inspired catalogue and education layer belongs here, but trusted enterprise packs require a stronger publication pipeline: authoritative corpus, schema-constrained extraction, consensus, steward review, regression evaluation, signatures, and compatibility metadata.

---

## 12. Roadmap

### Phase 0 — contract and benchmark spike

- Canonical Context Contract schema
- Claim and relationship lifecycle
- Execution Plan IR and Ed25519 signing
- Composite manifest and component versioning
- PostgreSQL typed-edge benchmark against temporal, depth-4 traversal workloads
- Connector capability manifest
- 100–300 golden questions for the selected design-partner workflow

### Phase 1 — design-partner golden thread

- One design-partner workflow pack implemented on the domain-agnostic core
- File and SQL ingestion
- Minimum-model drafting
- Review, tests, context map, and scenario/impact explorer
- Signed release
- Compile/clarify/verify runtime
- One SQL/JSON target and one ecosystem adapter

### Phase 2 — production context assurance

- Enterprise connectors and private gateway
- Better entity resolution and reversible identity decisions
- Revenue/customer exposure and scenario analysis
- Stewardship SLAs, policy engine, and approval integration
- Context observability and production correction loop
- Fabric, Snowflake, Databricks, dbt, and graph adapters

### Phase 3 — multi-workflow control plane

- Shared concepts across Context Contracts
- Cross-project dependency and governance
- Agent, retrieval, and policy testing
- Multi-target synchronization
- Regulatory evidence module
- Private enterprise pack registry

### Phase 4 — ecosystem

- Additional industry and workflow packs
- Public learning catalogue and sandbox
- Partner-authored packs, tests, bindings, and adapters
- Embedded/OEM runtime
- Cross-platform semantic migration and synchronization

---

## 13. What to adopt from Ontology Playground

Adopt or emulate:

- low-friction visual authoring;
- live validation and undo/redo;
- import/export fidelity tests;
- catalogue discovery and starter templates;
- deep-linkable and embeddable read-only views;
- guided onboarding, progressive lessons, and quests;
- a contribution workflow that feels like a pull request;
- direct platform publishing adapters;
- a path finder that teaches the semantic model.

Do not carry forward:

- a one-shot AI ontology as a trusted result;
- client-local state as the governance system;
- a simple entity/property/relationship model as the full enterprise contract;
- boolean validation and unexplained numeric confidence;
- force-directed graphs as the only large-model layout;
- demo query matching as runtime context resolution;
- pasted bearer tokens as the enterprise connection model;
- Fabric compatibility as the product boundary.

---

## 14. The moat

Lattice's defensibility is not the graph or the ontology template by itself.

It compounds across:

1. **Workflow assurance libraries** — competency questions, expected traversals, abstention cases, and regression fixtures.
2. **Validation telemetry** — which claims experts accept, reject, modify, or repeatedly clarify by domain and evidence class.
3. **Operational bindings** — versioned patterns for translating stable business operations into real source systems.
4. **Cross-platform dependency intelligence** — knowledge of which meanings, agents, queries, policies, and outputs break when context changes.
5. **Portable release mechanics** — signed contracts, adapters, conformance suites, and migration tooling that reduce ecosystem lock-in.
6. **Review economics** — the ability to achieve high assurance with fewer expert minutes.

The most important proprietary metric is not nodes or API calls. It is:

> **Verified workflow coverage gained per expert hour.**

---

## 15. Positioning

### Category

**Enterprise Context Assurance and Compilation**

### One-line product

> Lattice builds, verifies, and continuously tests the business context an AI workflow needs, then compiles it into governed plans for any enterprise data platform.

### Worked financial-services example

> Lattice creates a verified exposure contract across counterparties, legal entities, instruments, positions, agreements, collateral, limits, portfolios, regulatory obligations, and sources—so teams and agents can calculate and explain risk without guessing identities, netting rules, metrics, joins, or evidence.

### Competitive version

> Native platforms make their own data understandable. Lattice proves and synchronizes business meaning across all of them.

### Internal product mantra

> **The graph shows the context. The ledger proves it. The tests qualify it. The compiler makes it actionable.**

---

## 16. Decisions now considered resolved

| Question | Decision |
|---|---|
| Is Lattice an ontology editor? | No. The editor is the design surface of a context assurance system. |
| Is ContextGraph a separate product? | No. It is Lattice Runtime, consuming released Context Contracts. |
| What is the deployable unit? | A signed, versioned Context Contract release. |
| What is the initial industry? | None is built into the product. Start with one design-partner workflow; counterparty risk and exposure assurance is the current worked example. |
| What is the primary differentiation? | Evidence, tests, expert decisions, change impact, portability, and safe compilation. |
| Does Lattice replace Fabric IQ or graph databases? | No. It can publish to and assure them. |
| Can LLM output become runtime truth directly? | No. LLM output is a candidate or untrusted evidence until policy and review promote it. |
| Can clients compose `/resolve` and `/route` into authority? | No. Only atomic `/v1/compile` can produce an executable plan. |
| How is tenant selected? | From trusted identity claims, never ordinary request data. |
| What does the public plan expose? | Stable business operations and typed arguments, never raw source query details. |
| Is confidence the trust model? | No. Evidence, approval, freshness, impact, and runtime decision are distinct; numeric confidence is calibrated selectively. |
| How are releases atomic with different content cadences? | Immutable component bundles referenced by one signed composite manifest. |
| What is the graph UI for? | Authoring, assurance, explanation, impact analysis, and runtime observability—not decoration. |

---

## 17. Source basis

This synthesis combines the repository's:

- `ontology-builder-spec.md`
- `lattice-updated-product-spec.md`
- `context-api/ContextGraph_API_Product_Spec.md`
- `context-api/ContextGraph_Comprehensive_Solution_Architecture_v1.1.md`
- `context-api/processing-paths`
- `context-api/bootstrap-onboarding.md`
- `context-api/kb-build-pipelines.md`
- `context-api/kb-build-prompt-architecture.md`
- `context-api/llm-context-graph-use.md`
- `context-api/Untitled-1.md`
- `product-ontology-graph/`

External comparison was made against:

- [Microsoft Ontology Playground](https://github.com/microsoft/Ontology-Playground)
- [Microsoft Fabric IQ ontology overview](https://learn.microsoft.com/en-us/fabric/iq/ontology/overview)
- [Microsoft Fabric IQ overview](https://learn.microsoft.com/en-us/fabric/iq/overview)
- [Fabric IQ ontology FAQ](https://learn.microsoft.com/en-us/fabric/iq/ontology/resources-frequently-asked-questions)

---

## 18. Final statement

The original ontology builder vision had the right insight: AI makes enterprise semantics affordable. The updated Lattice spec found the more valuable unit: a verified context package for a workflow. The Context API found the runtime consequence: business meaning must be resolved, governed, and compiled before an agent acts. The visualization found the right human surface: a structured map that makes complex business relationships navigable.

New Lattice is the system that joins those ideas.

It does not stop at drawing an ontology, and it does not begin with an opaque runtime API. It starts with a consequential question, builds only the context required to answer it, shows the evidence and uncertainty, asks experts for the minimum necessary judgment, proves the result with tests, releases it as a portable contract, compiles it safely at query time, and keeps it correct as the enterprise changes.
