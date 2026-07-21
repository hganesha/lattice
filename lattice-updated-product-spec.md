# Lattice — Verified Context for Enterprise AI

**Updated product vision, MVP specification, and full-scope product specification**

**Status:** Draft  
**Working name:** Lattice  
**Primary initial domain:** Supply-chain disruption exposure  
**Product category:** Enterprise AI context engineering and assurance

---

## 1. Executive Summary

Lattice helps enterprises put AI into production without forcing models to guess how the business works.

It discovers the minimum set of business entities, relationships, rules, metrics, source mappings, and evidence required for a specific AI or decision workflow. It then routes uncertain or high-impact claims to domain experts, tests whether the resulting context can answer the questions it was designed for, publishes that context into the customer’s existing data and AI stack, and monitors it for drift.

Lattice is not primarily an ontology editor, graph database, data catalog, master-data platform, or agent builder. Ontologies and semantic models are implementation mechanisms inside a larger product promise:

> **Lattice turns fragmented enterprise knowledge into verified, testable, and portable context that AI systems can use safely.**

The initial product focuses on one bounded, high-value workflow: **multi-tier supply-chain disruption exposure**.

The first version enables a manufacturer to connect product, BOM, supplier, facility, geography, and revenue data; generate a minimum dependency model; validate only the most consequential or uncertain claims; and answer questions such as:

- Which products are exposed if a supplier or facility becomes unavailable?
- Which customers and revenue are affected?
- Where do second-order supplier dependencies create hidden concentration risk?
- Which conclusions are based on confirmed data, and which remain uncertain?
- What breaks when a source schema, BOM, supplier mapping, or facility record changes?

The long-term product expands into a platform-neutral context assurance layer that supports multiple domains, agent workflows, semantic standards, data platforms, and governance models.

---

# 2. Product Thesis

## 2.1 The problem

Enterprise AI fails less often because the model lacks language capability and more often because it lacks trusted business context.

Critical knowledge is fragmented across:

- data warehouses and lakehouses;
- ERP, CRM, PLM, procurement, and operational systems;
- metric definitions and semantic models;
- policy and regulatory documents;
- spreadsheets and analyst models;
- data catalogs and lineage tools;
- employee expertise;
- undocumented joins, exceptions, and business rules.

An AI system asked to answer a business question must often infer:

- what a term means;
- which source is authoritative;
- which records refer to the same real-world entity;
- how tables should be joined;
- which relationships are valid;
- which rule applies;
- whether the available evidence is complete;
- when it should abstain.

Those inferences are often hidden, untested, and unauditable.

## 2.2 Why current approaches are insufficient

### Prompt engineering

Prompts can describe a small amount of business context but are difficult to govern, test, reuse, and keep synchronized with changing data.

### Retrieval-augmented generation

RAG can retrieve relevant documents, but document similarity alone does not establish identity, relationship direction, valid joins, cardinality, authority, or applicability.

### Semantic layers

Semantic layers govern metrics and analytical joins well, but often do not capture richer operational relationships, policy applicability, evidence lineage, and multi-hop dependencies.

### Knowledge graphs and ontology tools

Traditional tools can express rich domain structure but usually require specialist skills, extensive manual modeling, and long implementation cycles.

### Native data-platform context features

Data platforms increasingly generate semantic context automatically, but they are usually optimized for their own ecosystem. Enterprises still need domain-specific validation, cross-platform portability, expert review, evidence, testing, and change impact analysis.

## 2.3 Why now

Three shifts make the product timely:

1. **AI can draft useful context.** Models can inspect schemas, documents, queries, and data samples to propose entities, relationships, mappings, and rules.
2. **Enterprise AI creates urgent demand.** Organizations now need governed context for production agents, not only for documentation or analytics.
3. **The bottleneck has moved.** Drafting is becoming cheap. Validation, assurance, maintenance, and operational integration remain expensive.

## 2.4 Core product insight

The valuable unit is not an ontology.

The valuable unit is a **verified context package** for a defined workflow.

A context package includes:

- target questions and tasks;
- business concepts;
- typed relationships;
- constraints and rules;
- authoritative source mappings;
- evidence and provenance;
- human decisions;
- runtime representations;
- tests;
- quality and drift status.

---

# 3. Product Positioning

## 3.1 Category

**Enterprise AI Context Assurance**

Alternative category descriptions for different buyers:

- Verified business context for AI agents
- Context engineering platform
- Governed domain model for enterprise AI
- Agent context testing and observability
- Evidence-backed semantic layer
- Decision-context platform

The product may use ontology, graph, semantic-model, and schema standards internally, but external positioning should lead with business outcomes rather than ontology authoring.

## 3.2 Core value proposition

> **Lattice builds and validates the minimum business context an enterprise AI workflow needs, connects it to authoritative sources, proves it can answer the intended questions, and keeps it correct as the business changes.**

## 3.3 Supply-chain value proposition

> **Lattice creates a verified dependency model across products, components, suppliers, facilities, materials, geographies, and customers so teams and AI agents can trace disruption exposure, explain every conclusion, and detect when the underlying context has changed.**

## 3.4 Executive value proposition

> **Lattice reduces the cost and risk of enterprise AI by converting scattered business definitions and relationships into tested, governed context without requiring a large knowledge-engineering program.**

## 3.5 What makes Lattice different

Lattice is differentiated by the combination of:

1. **Workflow-first modeling**  
   It starts with concrete questions, decisions, and agent tasks rather than attempting to model the entire enterprise.

2. **Minimum sufficient context**  
   It generates only the concepts, relationships, rules, and mappings required by the target workflow.

3. **Impact-aware human review**  
   It prioritizes expert attention based on uncertainty, business impact, usage frequency, and downstream risk.

4. **Evidence on every material claim**  
   Every important definition, mapping, relationship, and rule can be traced to a source or an explicit expert decision.

5. **Context test suites**  
   The model is evaluated against the questions and tasks it must support.

6. **Platform-neutral publishing**  
   Lattice publishes into existing warehouses, lakehouses, graph stores, catalogs, semantic layers, and agent frameworks.

7. **Continuous context assurance**  
   It detects source drift, definition conflicts, broken mappings, unanswered questions, and changes that affect downstream workflows.

---

# 4. Product Principles

## 4.1 Model only what earns its keep

Every modeled element must support at least one:

- competency question;
- business decision;
- agent action;
- analytical query;
- policy obligation;
- data contract;
- runtime constraint.

Unused or speculative model elements should be excluded or explicitly quarantined.

## 4.2 Human attention is the scarce resource

The product should minimize domain-expert review time, not maximize generated content.

## 4.3 Confidence alone is not enough

Review priority must combine uncertainty with impact.

A medium-confidence join used in a high-value operational decision may deserve more attention than a low-confidence property that no workflow uses.

## 4.4 Evidence precedes trust

No consequential claim should be promoted to trusted status without:

- direct evidence;
- data support;
- an approved reusable template;
- or explicit human confirmation.

## 4.5 Tests define quality

A context model is useful only if it can correctly support the questions and actions it was built for.

## 4.6 Lattice complements the existing stack

Lattice should integrate with existing systems rather than attempt to replace:

- data platforms;
- catalogs;
- MDM systems;
- graph databases;
- semantic layers;
- BI tools;
- agent frameworks;
- governance systems.

## 4.7 Changes must be reviewable and reversible

All model, mapping, rule, and approval changes must be versioned, attributable, diffable, and reversible.

---

# 5. Primary Users and Buyers

## 5.1 Economic buyer

For the initial product:

- VP of Supply Chain
- Chief Procurement Officer
- Head of Supply-Chain Risk
- VP of Data and AI
- Head of Enterprise AI
- Chief Data Officer

## 5.2 Primary operators

### Supply-chain risk analyst

Needs to identify affected products, customers, revenue, suppliers, and facilities when a disruption occurs.

### Domain expert

Confirms business terminology, dependency logic, exceptions, and source authority.

### Data engineer or architect

Connects source systems, validates mappings, reviews keys and joins, and publishes runtime outputs.

### AI platform engineer

Uses the verified context package to ground agents, tools, RAG, analytics, and generated SQL.

### Context steward

Owns approvals, change review, model quality, and ongoing governance.

## 5.3 Initial job to be done

> When a supplier, facility, region, component, or material is disrupted, help me determine the complete downstream business impact quickly, explain how the answer was derived, identify missing evidence, and keep the dependency model current.

---

# 6. Core Concepts

## 6.1 Context Project

A bounded initiative with:

- a business owner;
- one or more target workflows;
- defined source systems;
- named domain experts;
- target questions;
- quality thresholds;
- a publication target.

Example: `Semiconductor Supply Disruption Exposure`.

## 6.2 Competency Question

A question the context package must answer correctly.

Example:

> Which finished products and customers are exposed if Facility F-103 becomes unavailable for 30 days?

Each competency question includes:

- question text;
- expected answer shape;
- required concepts and relationships;
- authoritative data sources;
- test fixtures;
- acceptable uncertainty;
- pass/fail criteria.

## 6.3 Context Package

The deployable unit produced by Lattice.

It contains:

- domain model;
- source mappings;
- business definitions;
- relationship definitions;
- constraints and rules;
- provenance;
- approvals;
- test suite;
- quality report;
- version metadata;
- runtime exports.

## 6.4 Claim

Any proposed statement about the business model, including:

- an entity type exists;
- a property belongs to an entity;
- two entity types can be related;
- a field maps to a property;
- a source is authoritative;
- two records represent the same real-world entity;
- a rule applies;
- a relationship has a specific cardinality;
- a metric is calculated in a certain way.

## 6.5 Evidence

Support for a claim, including:

- schema metadata;
- sample values;
- query history;
- documentation;
- policy text;
- regulation text;
- an approved template;
- an expert declaration;
- observed data patterns;
- lineage metadata.

## 6.6 Validation Decision

A human or policy decision that changes a claim state:

- accept;
- accept with modification;
- reject;
- defer;
- merge;
- split;
- mark as exception;
- request additional evidence.

## 6.7 Context Test

A deterministic or model-assisted test that verifies whether the context package supports the intended workflow.

## 6.8 Publication Target

A system that consumes the context package, such as:

- SQL views;
- dbt semantic models;
- Snowflake semantic views;
- Microsoft Fabric Ontology;
- Databricks semantic or agent context;
- Neo4j;
- Stardog;
- JSON-LD;
- LinkML;
- GraphQL;
- an agent context API;
- a custom application.

---

# 7. Trust and Status Model

## 7.1 Evidence status

Each claim has one evidence status:

- **Declared** — explicitly stated by an authorized user
- **Directly evidenced** — supported by a clear source artifact or data binding
- **Pattern-supported** — supported by repeated data or usage patterns
- **Template-derived** — inherited from an approved domain template
- **Weakly inferred** — proposed by a model with limited support
- **Conflicting evidence** — multiple sources disagree
- **Unverified** — no sufficient support has been established

## 7.2 Approval status

Each claim has one approval status:

- Draft
- In review
- Approved
- Approved with exception
- Rejected
- Deprecated
- Superseded

## 7.3 Impact level

Each claim has an impact classification:

- Low
- Medium
- High
- Critical

Impact is determined by:

- number of dependent questions;
- number of consuming systems;
- decision value;
- compliance or safety relevance;
- frequency of use;
- propagation depth.

## 7.4 Review priority

Review priority is calculated from:

\[
ReviewPriority =
Uncertainty \times Impact \times Usage \times ChangeRisk
\]

The exact scoring model may evolve, but the UI must always explain why an item is prioritized.

## 7.5 Confidence score

A numeric confidence score is optional and should not be exposed as false precision.

When shown, it must include:

- scoring basis;
- evidence inputs;
- calibration version;
- confidence interval or category;
- known limitations.

The default user experience should lead with evidence status and rationale.

---

# 8. The Lattice Workflow

```text
DEFINE → DISCOVER → DRAFT → REVIEW → TEST → PUBLISH → OBSERVE → EVOLVE
   ↑                                                               │
   └───────────────────────────────────────────────────────────────┘
```

## 8.1 Define

The user identifies:

- target workflow;
- business outcome;
- competency questions;
- decision owners;
- authoritative sources;
- risk tolerance;
- publication target.

## 8.2 Discover

Lattice inspects:

- schemas;
- metadata;
- sample data;
- data lineage;
- query history;
- documents;
- policies;
- existing semantic models;
- approved templates;
- optional user interviews.

## 8.3 Draft

Lattice proposes the minimum context model required to support the questions.

Each proposed claim includes:

- rationale;
- supporting evidence;
- expected downstream use;
- uncertainty;
- impact;
- proposed source binding.

## 8.4 Review

Lattice creates an impact-aware review queue.

Experts review:

- high-impact definitions;
- uncertain relationships;
- ambiguous source authority;
- critical joins;
- entity resolution proposals;
- exceptions;
- unsupported questions.

## 8.5 Test

Lattice runs:

- structural tests;
- source-mapping tests;
- competency-question tests;
- known-answer tests;
- contradiction tests;
- agent or SQL behavior tests;
- abstention tests.

## 8.6 Publish

The approved context package is compiled into one or more runtime targets.

## 8.7 Observe

Lattice records:

- questions asked;
- unanswered questions;
- failed tests;
- source changes;
- mapping failures;
- expert corrections;
- stale evidence;
- unused concepts;
- runtime errors.

## 8.8 Evolve

Lattice proposes a versioned changeset with:

- additions;
- modifications;
- deprecations;
- affected tests;
- affected agents;
- affected downstream systems;
- recommended reviewers.

---

# 9. MVP Specification

## 9.1 MVP objective

Prove that a domain expert and data engineer can create a trustworthy supply-chain disruption context package in hours rather than weeks, and that the package materially improves the speed, completeness, and auditability of disruption exposure analysis.

## 9.2 MVP target customer

A manufacturing, electronics, semiconductor, automotive, aerospace, or industrial company with:

- product and BOM data;
- supplier data;
- facility or location data;
- at least one active supply-chain-risk workflow;
- a warehouse, lakehouse, or accessible flat-file export;
- one named data owner;
- one named domain expert;
- 10–30 disruption questions.

## 9.3 MVP scope

The MVP supports one context project and one primary workflow:

> Multi-tier supply-chain disruption exposure.

### Required entity types

- Product
- Component
- Supplier
- Facility
- Geography
- Customer or Business Unit
- Optional Material

### Required relationship types

- Product `CONTAINS` Component
- Supplier `SUPPLIES` Component
- Supplier `OPERATES` Facility
- Facility `LOCATED_IN` Geography
- Product `SOLD_TO` Customer or attributed to Business Unit
- Component `MADE_OF` Material, optional
- Supplier `SUPPLIES_TO` Supplier, optional where multi-tier data exists

### Required business properties

- business identifier;
- source-system identifier;
- entity name;
- status;
- effective date;
- supplier tier;
- quantity or dependency amount;
- spend or revenue exposure where available;
- location;
- lead time where available;
- single-source flag or calculated concentration;
- data freshness;
- evidence status;
- approval status.

## 9.4 MVP inputs

### Supported input methods

- CSV upload
- Excel upload
- Parquet upload
- relational database read-only connection
- warehouse read-only connection
- schema metadata import
- PDF or markdown policy/document upload

### MVP data sources

At minimum:

- product master;
- BOM;
- supplier master;
- supplier-component mapping;
- supplier-facility mapping;
- facility/location data;
- customer or revenue mapping, optional but recommended.

## 9.5 MVP user flows

### Flow A: Create a context project

The user:

1. selects `Supply-Chain Disruption Exposure`;
2. identifies the business owner and reviewers;
3. enters or imports competency questions;
4. selects the desired output target;
5. connects or uploads source data.

### Flow B: Source profiling

Lattice profiles each source for:

- schema;
- candidate keys;
- null rates;
- duplicates;
- referential integrity;
- value distributions;
- likely entity types;
- likely relationships;
- freshness;
- sensitive fields;
- sample records.

The user can approve or override source classifications.

### Flow C: Minimum-model generation

Lattice proposes:

- entity types;
- relationship types;
- required properties;
- candidate source mappings;
- key and join mappings;
- data-quality issues;
- missing context required by the target questions.

The system must explain how every proposal supports one or more competency questions.

### Flow D: Review queue

The queue is ordered by:

- impact;
- uncertainty;
- number of blocked questions;
- downstream dependencies.

Each review card includes:

- proposed claim;
- business-language explanation;
- evidence;
- matching data samples;
- affected questions;
- impact;
- recommended action;
- accept, edit, reject, defer, and request-evidence actions.

### Flow E: Context test suite

The MVP supports three test types:

1. **Structural tests**
   - required entity types exist;
   - required relationships exist;
   - keys are mapped;
   - cardinalities are not contradicted by data.

2. **Data tests**
   - references resolve;
   - join coverage meets thresholds;
   - duplicates are within tolerance;
   - freshness is acceptable;
   - required properties are populated.

3. **Competency-question tests**
   - a deterministic query or graph traversal can produce the expected answer shape;
   - known fixtures return expected results;
   - missing evidence triggers an abstention or warning.

### Flow F: Exposure analysis

The user selects a disrupted:

- supplier;
- facility;
- geography;
- component;
- or material.

Lattice returns:

- directly affected products;
- indirectly affected products;
- affected customers or business units;
- revenue or spend exposure where available;
- dependency paths;
- confidence/evidence status;
- missing links;
- stale data warnings;
- explanation of how each conclusion was reached.

### Flow G: Publish

The MVP publishes:

- a versioned JSON context package;
- SQL views or queries;
- a graph-compatible export;
- a human-readable markdown specification.

Only one primary production adapter is required for the first release. SQL plus JSON is the recommended default.

### Flow H: Change detection

On source refresh, Lattice identifies:

- schema changes;
- missing fields;
- new unmapped values;
- changed joins;
- new suppliers, facilities, or products;
- changed BOM relationships;
- invalidated tests;
- affected questions.

It creates a reviewable changeset rather than regenerating the entire model.

## 9.6 MVP screens

### 1. Project overview

Shows:

- workflow;
- owners;
- source status;
- model status;
- test pass rate;
- review backlog;
- publication version;
- recent changes.

### 2. Question workspace

Shows:

- competency questions;
- status;
- required context;
- test coverage;
- blocked questions;
- expected output shape.

### 3. Source workspace

Shows:

- connected sources;
- profiling results;
- candidate entity mappings;
- data-quality findings;
- freshness;
- authoritative-source designation.

### 4. Context map

Shows:

- entity types;
- relationships;
- source bindings;
- evidence and approval status;
- question usage;
- only the model relevant to the selected workflow.

### 5. Review workspace

Shows the impact-aware validation queue.

### 6. Test workspace

Shows:

- tests;
- pass/fail status;
- sample outputs;
- affected claims;
- regression history.

### 7. Exposure explorer

Shows disruption results and dependency paths.

### 8. Changeset workspace

Shows proposed changes, affected questions, and required reviewers.

## 9.7 MVP AI capabilities

The MVP uses AI for:

- intake assistance;
- schema and document classification;
- candidate entity discovery;
- candidate relationship discovery;
- field-to-property mapping;
- business-language explanations;
- evidence summarization;
- review grouping;
- suggested competency questions;
- test generation;
- change summarization.

AI must not silently:

- merge entities;
- approve high-impact claims;
- change authoritative-source assignments;
- publish a new production version;
- make legal or compliance determinations;
- overwrite human decisions.

## 9.8 MVP deterministic capabilities

The MVP uses deterministic logic for:

- type validation;
- cardinality checks;
- referential integrity;
- duplicate detection;
- join coverage;
- required-field checks;
- versioning;
- diffs;
- test execution;
- approval policy enforcement;
- publication packaging.

## 9.9 MVP architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ Web Application                                             │
│ Project · Questions · Sources · Review · Tests · Exposure   │
├─────────────────────────────────────────────────────────────┤
│ Orchestration Layer                                         │
│ Intake · Drafting · Evidence Assembly · Review Prioritizer  │
├─────────────────────────────────────────────────────────────┤
│ Context Core                                                │
│ Meta-model · Claims · Evidence · Decisions · Versions       │
├─────────────────────────────────────────────────────────────┤
│ Validation Engine                                           │
│ Structural · Data · Question · Regression Tests             │
├─────────────────────────────────────────────────────────────┤
│ Source Layer                                                │
│ Files · SQL/Warehouse Connector · Documents                 │
├─────────────────────────────────────────────────────────────┤
│ Runtime Output                                              │
│ SQL · JSON · Graph Export · Markdown                        │
└─────────────────────────────────────────────────────────────┘
```

## 9.10 MVP meta-model

### ContextProject

- id
- name
- workflow_type
- owner
- reviewers
- risk_tolerance
- publication_targets
- status

### CompetencyQuestion

- id
- question
- expected_answer_shape
- priority
- owner
- quality_threshold
- status

### EntityType

- id
- name
- description
- parent_type
- evidence_status
- approval_status
- impact_level
- version

### RelationshipType

- id
- name
- source_type
- target_type
- direction
- cardinality
- description
- evidence_status
- approval_status
- impact_level

### Property

- id
- entity_or_relationship_type
- name
- data_type
- required
- description
- allowed_values
- sensitivity
- evidence_status
- approval_status

### Source

- id
- type
- connection
- owner
- authoritative_scope
- freshness
- sensitivity

### Mapping

- id
- source
- source_object
- source_field
- target_concept
- transformation
- join_logic
- coverage
- evidence_status
- approval_status

### Claim

- id
- claim_type
- subject
- predicate
- object
- rationale
- evidence_status
- approval_status
- impact_level
- uncertainty
- dependent_questions

### Evidence

- id
- source
- source_location
- excerpt_or_sample
- extraction_time
- effective_date
- evidence_type
- checksum

### Decision

- id
- claim
- action
- actor
- timestamp
- rationale
- previous_state
- new_state

### ContextTest

- id
- type
- question
- fixtures
- execution_logic
- threshold
- status
- last_run
- affected_claims

### ContextPackageVersion

- id
- project
- version
- change_summary
- approvals
- test_results
- publication_status
- created_at

## 9.11 MVP security and governance

The MVP must include:

- tenant isolation;
- encryption in transit and at rest;
- role-based access;
- read-only source connections;
- configurable sample-data limits;
- audit logs;
- approval logs;
- source credential isolation;
- export controls;
- private model or no-retention AI options where required.

## 9.12 MVP success metrics

### Activation

- time from project creation to first draft;
- percentage of required sources connected;
- percentage of target questions represented by tests.

### Efficiency

- domain-expert review time;
- number of review decisions;
- percentage of proposals accepted without edit;
- percentage of low-value review items eliminated through batching.

### Quality

- competency-question pass rate;
- critical false-positive rate;
- join coverage;
- unresolved high-impact claims;
- evidence coverage;
- abstention quality.

### Business outcome

- time to answer a disruption question;
- analyst hours saved;
- number of second-order dependencies detected;
- reduction in missed affected products;
- time to assess the impact of a source change.

### Suggested MVP targets

- first usable draft in under 60 minutes after ingestion;
- initial expert review in under 4 hours for a bounded domain;
- at least 65% of proposals accepted without modification;
- at least 85% of target questions passing agreed tests;
- under 2% critical false-positive rate;
- over 80% mapping coverage for fields required by target questions;
- change-impact assessment in under 30 minutes.

## 9.13 MVP non-goals

The MVP will not:

- model the entire enterprise;
- provide a proprietary graph database;
- replace customer MDM;
- perform unrestricted entity resolution;
- support every ontology standard;
- create legal conclusions;
- support broad regulatory monitoring;
- include a general-purpose agent runtime;
- replace data catalogs;
- replace semantic-layer products;
- provide autonomous production publishing;
- support more than one or two initial industry templates.

---

# 10. Post-MVP Expansion

Post-MVP work begins only after the initial workflow demonstrates measurable value.

## 10.1 Additional supply-chain workflows

- alternate-source analysis;
- supplier concentration;
- lead-time and recovery modeling;
- material provenance;
- regulatory evidence mapping;
- certificate and audit tracking;
- cost and margin exposure;
- product-change impact;
- supplier onboarding;
- scope-3 data lineage.

## 10.2 Broader source connectivity

- SAP
- Oracle
- Microsoft Dynamics
- Salesforce
- ServiceNow
- Snowflake
- Databricks
- Microsoft Fabric
- BigQuery
- Redshift
- dbt
- Collibra
- Alation
- Atlan
- Informatica
- Neo4j
- Stardog
- document repositories
- lineage systems
- event streams

## 10.3 Improved entity resolution

- configurable match policies;
- candidate clustering;
- survivorship rules;
- explainable merge evidence;
- reversible merge decisions;
- golden-record references;
- external identifier services.

## 10.4 Template system

Templates become versioned collections of:

- entity and relationship patterns;
- required properties;
- common mappings;
- competency questions;
- tests;
- regulatory concepts;
- review policies;
- known anti-patterns.

Templates should be composable and should never force unused concepts into a project.

## 10.5 Regulatory and policy context

Future regulatory support includes:

- official source retrieval;
- jurisdiction;
- applicability criteria;
- effective dates;
- amendments;
- obligations;
- required evidence;
- legal-review status;
- change monitoring.

All outputs must clearly distinguish:

- source text;
- machine interpretation;
- domain-expert approval;
- legal approval.

---

# 11. Full-Scope Product Vision

## 11.1 Full-scope objective

Become the platform-neutral system of record for enterprise AI context quality.

Lattice should help organizations create, validate, test, publish, observe, and evolve context packages across domains and platforms.

## 11.2 Full product modules

### Module 1: Workflow and Question Designer

Defines:

- target agents;
- decisions;
- tasks;
- competency questions;
- expected outputs;
- quality thresholds;
- risk levels;
- test fixtures.

### Module 2: Context Discovery

Discovers context from:

- data schemas;
- sample data;
- query logs;
- lineage;
- documents;
- APIs;
- application metadata;
- semantic models;
- knowledge graphs;
- tickets and operating procedures;
- expert interviews.

### Module 3: Domain Modeling

Supports:

- entity types;
- relationship types;
- properties;
- metrics;
- events;
- actions;
- policies;
- constraints;
- roles;
- state transitions;
- temporal validity;
- inheritance;
- composable domain packages.

### Module 4: Mapping and Identity

Supports:

- table and column mappings;
- API mappings;
- document-to-concept mappings;
- authoritative-source rules;
- entity resolution;
- identity crosswalks;
- survivorship rules;
- transformations;
- join contracts;
- mapping coverage.

### Module 5: Evidence and Provenance

Tracks:

- source lineage;
- extraction details;
- effective dates;
- supporting excerpts;
- data samples;
- reviewer decisions;
- policy lineage;
- derivation chains;
- trust status.

### Module 6: Expert Review and Stewardship

Provides:

- impact-aware queues;
- bulk approval;
- exception handling;
- reviewer routing;
- domain ownership;
- delegated stewardship;
- service-level targets;
- approval policies;
- sign-off workflows.

### Module 7: Context Testing

Supports:

- structural tests;
- mapping tests;
- data-quality tests;
- competency-question tests;
- agent behavior tests;
- SQL tests;
- retrieval tests;
- policy tests;
- known-answer tests;
- contradiction tests;
- abstention tests;
- regression tests;
- scenario tests.

### Module 8: Context Publishing

Publishes to:

- SQL;
- semantic layers;
- graph databases;
- RDF/OWL;
- SHACL;
- JSON-LD;
- LinkML;
- GraphQL;
- APIs;
- vector and retrieval metadata;
- agent tool schemas;
- MCP servers;
- policy engines;
- data contracts.

### Module 9: Context Runtime

Provides:

- versioned context API;
- context retrieval by task;
- relationship traversal;
- source resolution;
- policy checks;
- definition lookup;
- approved join lookup;
- evidence retrieval;
- query planning assistance;
- context package composition.

### Module 10: Context Observability

Monitors:

- runtime usage;
- failed questions;
- hallucination indicators;
- invalid joins;
- source drift;
- stale evidence;
- test regressions;
- unresolved conflicts;
- agent corrections;
- underused concepts;
- cost;
- latency;
- context contribution to answer quality.

### Module 11: Change and Impact Management

Supports:

- source-triggered changes;
- proposed model changes;
- semantic diffs;
- affected questions;
- affected agents;
- affected dashboards;
- affected policies;
- reviewer routing;
- rollback;
- migration plans;
- deprecation windows.

### Module 12: Template and Marketplace Ecosystem

Includes:

- industry templates;
- workflow templates;
- competency-question packs;
- test packs;
- regulatory overlays;
- connector mappings;
- publication adapters;
- partner-developed packages.

---

# 12. Full-Scope Domain Coverage

## 12.1 Supply chain and manufacturing

- product and BOM dependencies;
- supplier and facility networks;
- disruption exposure;
- provenance;
- regulatory traceability;
- quality events;
- maintenance;
- assets and equipment.

## 12.2 Financial services

- customers and counterparties;
- legal entities;
- instruments;
- exposures;
- portfolios;
- controls;
- KYC;
- regulatory obligations;
- risk aggregation.

## 12.3 Healthcare and life sciences

- patients;
- providers;
- encounters;
- claims;
- drugs;
- trials;
- adverse events;
- consent;
- clinical evidence;
- data-use constraints.

## 12.4 Customer and commercial operations

- accounts;
- contacts;
- contracts;
- products;
- entitlements;
- pricing;
- renewals;
- customer health;
- support relationships.

## 12.5 Enterprise operations

- teams;
- applications;
- services;
- infrastructure;
- ownership;
- dependencies;
- incidents;
- policies;
- operational procedures.

## 12.6 Energy and natural resources

- wells;
- fields;
- facilities;
- equipment;
- production;
- reserves;
- pipelines;
- emissions;
- regulatory obligations;
- maintenance and risk.

---

# 13. Full-Scope Technical Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│ EXPERIENCE LAYER                                                │
│ Projects · Questions · Modeling · Review · Tests · Observability│
├─────────────────────────────────────────────────────────────────┤
│ CONTEXT ORCHESTRATION                                           │
│ Discovery · Drafting · Evidence · Triage · Change Planning      │
├─────────────────────────────────────────────────────────────────┤
│ CONTEXT CONTROL PLANE                                           │
│ Claims · Decisions · Policies · Versions · Stewardship          │
├─────────────────────────────────────────────────────────────────┤
│ CONTEXT MODEL STORE                                             │
│ Concepts · Relationships · Rules · Metrics · Mappings · Identity│
├─────────────────────────────────────────────────────────────────┤
│ ASSURANCE ENGINE                                                │
│ Structural · Data · Agent · Retrieval · Policy · Regression     │
├─────────────────────────────────────────────────────────────────┤
│ EVIDENCE AND LINEAGE                                            │
│ Documents · Data Samples · Queries · Decisions · Derivations    │
├─────────────────────────────────────────────────────────────────┤
│ CONNECTOR AND ADAPTER LAYER                                     │
│ Data · Catalogs · Graphs · Documents · Platforms · Agents       │
├─────────────────────────────────────────────────────────────────┤
│ RUNTIME AND PUBLISHING                                          │
│ API · SQL · Graph · Semantic Views · MCP · Schemas · Contracts  │
├─────────────────────────────────────────────────────────────────┤
│ OBSERVABILITY                                                   │
│ Usage · Drift · Failures · Quality · Cost · Impact              │
└─────────────────────────────────────────────────────────────────┘
```

## 13.1 Storage model

The product should use a versioned canonical meta-model independent of any single output format.

Recommended implementation pattern:

- relational store for project, workflow, approval, and version metadata;
- graph-compatible representation for model relationships;
- object store for evidence artifacts;
- vector index for candidate discovery and semantic matching;
- immutable event log for decisions and changes;
- test-result store for regressions and observability.

Lattice should not require customers to adopt its internal storage as their production graph runtime.

## 13.2 Standards strategy

Lattice should interoperate with:

- RDF;
- OWL;
- SHACL;
- JSON-LD;
- LinkML;
- JSON Schema;
- GraphQL;
- OpenAPI;
- dbt semantic definitions;
- platform-specific semantic models;
- Open Semantic Interchange where viable.

Standards are adapters around the canonical context package, not the user experience.

## 13.3 AI architecture

AI capabilities should be decomposed into specialized tasks:

- source classification;
- schema interpretation;
- concept discovery;
- relation discovery;
- mapping proposals;
- evidence extraction;
- conflict detection;
- review explanation;
- question decomposition;
- test generation;
- change summarization.

Each AI-generated claim must be stored separately from its evidence and approval state.

## 13.4 Policy engine

The full product supports configurable policies such as:

- critical claims require two reviewers;
- regulatory claims require an approved source and legal reviewer;
- identity merges above a value threshold require human approval;
- low-impact mappings may auto-publish after passing tests;
- stale evidence blocks publication;
- failed regression tests block promotion.

---

# 14. Context Quality Model

## 14.1 Quality dimensions

### Correctness

Are definitions, relationships, rules, joins, and mappings accurate?

### Completeness

Can the context support the required questions and tasks?

### Authority

Are claims tied to approved sources and owners?

### Freshness

Are data, policies, and mappings current?

### Consistency

Do sources and model elements contradict one another?

### Testability

Can claims and workflows be verified?

### Explainability

Can a user inspect how a result was produced?

### Portability

Can the context be published into the required systems?

### Maintainability

Can changes be reviewed without rebuilding everything?

## 14.2 Context quality scorecard

Each context-package version reports:

- question pass rate;
- evidence coverage;
- approved high-impact claim percentage;
- mapping coverage;
- source freshness;
- unresolved conflict count;
- critical test failures;
- abstention correctness;
- downstream usage;
- change backlog.

A single composite score may be displayed, but underlying dimensions must remain visible.

---

# 15. Context Test Framework

## 15.1 Structural tests

- allowed entity and relationship types;
- cardinalities;
- required properties;
- inheritance validity;
- inverse relationship consistency;
- orphan detection;
- cycle constraints;
- enum validity.

## 15.2 Mapping tests

- source field exists;
- expected data type matches;
- transformation succeeds;
- join key coverage;
- authoritative source is available;
- expected uniqueness;
- mapping freshness.

## 15.3 Data tests

- null rates;
- duplicates;
- referential integrity;
- range checks;
- anomaly thresholds;
- temporal validity;
- sample coverage.

## 15.4 Question tests

- expected answer shape;
- expected result for known fixtures;
- required explanation;
- required evidence;
- uncertainty threshold;
- abstention behavior.

## 15.5 Agent tests

- correct tool selection;
- approved-source use;
- valid relationship traversal;
- valid join use;
- policy compliance;
- non-fabrication;
- response completeness;
- explanation quality.

## 15.6 Change tests

- affected questions identified;
- dependent mappings identified;
- regression suite executed;
- deprecations handled;
- version compatibility maintained.

---

# 16. Governance and Operating Model

## 16.1 Roles

- Context owner
- Domain steward
- Data steward
- AI product owner
- Reviewer
- Legal or compliance reviewer
- Publisher
- Consumer
- Administrator

## 16.2 Ownership model

Each high-impact model element must have:

- an owner;
- an authoritative source;
- a review policy;
- an effective date;
- a review frequency;
- dependent workflows.

## 16.3 Lifecycle

```text
Draft → In Review → Approved → Published → Observed
                         ↓
                  Changed / Deprecated
                         ↓
                     Revalidated
```

## 16.4 Auditability

The system records:

- who proposed a claim;
- whether AI was involved;
- which evidence supported it;
- who approved it;
- what tests passed;
- which version was published;
- which systems consumed it;
- what changed later.

---

# 17. Commercial Model

## 17.1 Initial engagement

The initial go-to-market motion should be a paid design-partner implementation:

- one workflow;
- one domain;
- three to five source systems;
- 10–30 competency questions;
- one production output;
- measurable baseline and success criteria.

## 17.2 Pricing principles

Potential pricing dimensions:

- active context projects;
- governed domains;
- connected sources;
- published context packages;
- consuming applications or agents;
- enterprise platform tier.

Avoid pricing based on:

- triples;
- nodes;
- properties;
- model tokens;
- number of expert decisions.

## 17.3 Expansion

Land:

- one disruption workflow.

Expand:

- additional products, business units, or geographies;
- additional supply-chain workflows;
- additional consuming agents;
- additional domains;
- enterprise governance and observability.

---

# 18. Defensibility

## 18.1 Validation telemetry

Over time, Lattice can learn:

- which proposals experts accept;
- where models fail;
- which evidence supports correct decisions;
- which relationship patterns vary by industry;
- which claims create downstream failures;
- how review priority should be calibrated.

## 18.2 Domain test libraries

Defensible assets include:

- competency-question libraries;
- expected traversal patterns;
- known-answer fixtures;
- mapping patterns;
- data-quality rules;
- exception patterns;
- regulatory applicability tests.

## 18.3 Cross-platform portability

Lattice can become the control plane that validates and synchronizes context across otherwise siloed data and AI platforms.

## 18.4 Workflow-specific context packages

The defensible artifact is not a generic ontology template. It is a validated combination of:

- domain model;
- mappings;
- tests;
- evidence;
- review policies;
- operational workflows.

---

# 19. Product Risks and Mitigations

## 19.1 Validation fatigue

**Risk:** Experts receive too many low-value decisions.

**Mitigation:**

- minimum-model generation;
- impact-aware triage;
- bulk review;
- policy-based approval;
- reusable decisions;
- trust approved template sections;
- measure expert minutes.

## 19.2 Platform commoditization

**Risk:** Data platforms generate enough semantic context natively.

**Mitigation:**

- remain platform-neutral;
- specialize in assurance and testing;
- support cross-platform models;
- build domain-specific context packages;
- integrate with native platform objects.

## 19.3 False precision

**Risk:** Confidence scores appear more rigorous than they are.

**Mitigation:**

- lead with evidence categories;
- expose scoring rationale;
- calibrate by claim type;
- use impact-aware review;
- avoid unexplained decimals.

## 19.4 Ontology bloat

**Risk:** AI proposes more concepts than the workflow needs.

**Mitigation:**

- every model element must map to a question, task, rule, or output;
- flag unused concepts;
- impose model budgets;
- default to excluding speculative elements.

## 19.5 Entity-resolution errors

**Risk:** Incorrect merges corrupt downstream conclusions.

**Mitigation:**

- never merge silently;
- show evidence;
- provide reversible decisions;
- separate identity confidence from model confidence;
- require approval for high-impact merges.

## 19.6 Regulatory liability

**Risk:** Machine-generated applicability claims are treated as legal conclusions.

**Mitigation:**

- preserve source text;
- track jurisdiction and effective date;
- distinguish machine interpretation from approval;
- require legal-review states;
- support explicit disclaimers and approval policies.

## 19.7 Services dependency

**Risk:** Every implementation becomes custom consulting.

**Mitigation:**

- standardize workflows;
- create reusable source profiles;
- package competency questions and tests;
- track implementation effort;
- productize repeated review and mapping patterns.

---

# 20. Delivery Roadmap

## Phase 0: Design Partner Validation

**Objective:** Validate demand and review economics before full product development.

Deliver:

- manual or semi-automated context discovery;
- minimum context model;
- expert review workflow;
- test suite;
- disruption analysis;
- measurable baseline.

Exit criteria:

- at least four of eight design partners commit to continued paid use;
- expert review time is materially lower than the baseline;
- target questions show measurable quality improvement;
- a repeatable source and workflow pattern emerges.

## Phase 1: MVP

Deliver:

- project and question intake;
- file and SQL ingestion;
- source profiling;
- minimum-model drafting;
- impact-aware review;
- evidence handling;
- structural, mapping, and question tests;
- exposure explorer;
- SQL, JSON, graph, and markdown outputs;
- source-change detection.

## Phase 2: Production Supply-Chain Product

Deliver:

- enterprise connectors;
- expanded identity resolution;
- scenario analysis;
- revenue and customer exposure;
- stewardship workflows;
- role-based policies;
- additional supply-chain templates;
- operational dashboards;
- production APIs.

## Phase 3: Multi-Workflow Context Assurance

Deliver:

- multiple context packages;
- reusable shared concepts;
- cross-project governance;
- agent testing;
- context observability;
- multiple publication adapters;
- regulatory evidence module;
- partner ecosystem.

## Phase 4: Enterprise Context Control Plane

Deliver:

- cross-platform synchronization;
- domain marketplace;
- enterprise policy engine;
- context runtime;
- agent and application telemetry;
- organization-wide context graph;
- lifecycle and dependency management across domains.

---

# 21. Go/No-Go Criteria

Proceed beyond MVP only if Lattice demonstrates:

1. A repeatable buyer with an active budget.
2. A bounded workflow with measurable value.
3. A significant reduction in expert and engineering effort.
4. Better correctness or completeness than conventional modeling alone.
5. A low critical-error rate.
6. Ongoing value from change detection and testing, not only initial generation.
7. A credible reason customers prefer Lattice alongside their native platform.

Pause or pivot if:

- customers only value the generated diagram;
- review requires more effort than manual workshops;
- every deployment requires a unique custom model;
- native-platform functionality consistently solves the use case;
- no buyer owns ongoing context maintenance;
- context quality does not improve agent or decision outcomes;
- customers will not pay after the initial project.

---

# 22. One-Sentence Version

> **Lattice builds, validates, tests, and maintains the minimum business context required for enterprise AI to produce correct, explainable, and auditable results.**

---

# 23. Short Product Narrative

Enterprise AI is often deployed on top of fragmented definitions, undocumented joins, inconsistent identities, and stale policies. The model is then expected to infer how the business works at runtime.

Lattice replaces that guesswork with a verified context package.

A team begins with the questions an agent or analyst must answer. Lattice inspects the relevant data and documents, drafts the minimum domain model and source mappings, attaches evidence to every material claim, and routes only consequential or uncertain decisions to experts. It then tests whether the context can support the target questions, publishes the approved package into the existing technology stack, and monitors it as data, policies, and usage change.

The result is not merely an ontology. It is a tested and governed contract between enterprise knowledge, enterprise data, and enterprise AI.
