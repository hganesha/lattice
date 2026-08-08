
## Lattice Evolution
Lattice may continuously discover and learn context, but only governed, versioned artifacts may influence authorization.

## Proposed operating model


Questions and requests
        ↓
Context discovery
        ↓
Candidate semantic bindings
        ↓
Candidate contract
        ↓
Governance review
        ↓
Authorized contract
        ↓
Deterministic compilation
        ↓
Signed plan / approval / clarification / abstention
```

This creates two distinct loops:

1. **The learning loop**, which observes changing enterprise context.
2. **The authorization loop**, which decides what context is trusted enough to govern actions.

## 1. Questions become semantic signals

Every submitted question should do more than produce an answer. It should become an observation about the organization’s evolving language and intent.

For example:

> “Which wells have exceeded their monthly production target but have unresolved integrity risks?”

Lattice should extract candidate concepts such as:

```yaml
concepts:
  - Well
  - ProductionTarget
  - MonthlyProduction
  - IntegrityRisk

relationships:
  - Well has ProductionTarget
  - Well produces MonthlyProduction
  - Well has IntegrityRisk

requested_operation:
  type: analytical_query

possible_constraints:
  - production_actual > production_target
  - integrity_risk.status != resolved
```

It should also capture ambiguity:

```yaml
unresolved_terms:
  - term: production_target
    candidates:
      - finance.monthly_target
      - operations.production_plan
      - regulatory.allowable_limit
```

The question therefore becomes a **context-discovery event**, not immediately an authoritative semantic definition.

## 2. Scan existing semantic sources

Lattice should maintain adapters for enterprise semantic systems, including:

- Databricks Genie and Unity Catalog
- Microsoft Fabric Ontology and semantic models
- Power BI models
- dbt Semantic Layer
- Snowflake Horizon and semantic views
- data catalogs
- business glossaries
- API specifications
- graph databases
- policy repositories
- lineage systems
- operational metadata

The scan should retrieve more than tables and columns. It should collect:

```yaml
semantic_evidence:
  concepts:
    - names
    - descriptions
    - aliases
    - identifiers

  relationships:
    - joins
    - graph edges
    - foreign keys
    - semantic relationships

  calculations:
    - metrics
    - measures
    - formulas
    - aggregation rules

  authority:
    - owner
    - steward
    - certification status
    - source system

  operational_context:
    - lineage
    - usage frequency
    - query history
    - freshness
    - quality status

  governance:
    - access policies
    - classifications
    - retention rules
    - regulatory tags
```

This allows Lattice to understand not only what a concept might mean, but also where the definition came from and how trustworthy it is.

## 3. Separate discovery from authority

Lattice should classify all imported semantics into trust levels.

A practical hierarchy would be:

| Level | Meaning | Permitted use |
|---|---|---|
| Observed | Inferred from questions, queries or usage | Suggestion only |
| Discovered | Found in an external catalog or semantic model | Candidate binding |
| Verified | Confirmed by an owner or automated evidence checks | May support low-risk compilation |
| Authorized | Approved through Lattice governance | May govern plans and actions |
| Deprecated | Previously authorized but superseded | Historical replay only |

This distinction is essential.

A Genie-derived relationship may be useful evidence, but it should not automatically become an authorization rule.

Likewise, a Fabric measure may define a KPI accurately, but that does not mean it is authorized to control an operational action.

## 4. Produce candidate bindings

When Lattice finds a likely match, it should create an explicit binding proposal.

```yaml
binding_candidate:
  lattice_property: Well.monthlyProduction

  source:
    platform: databricks
    catalog: production
    schema: gold
    asset: well_monthly_metrics
    field: total_oil_volume

  transformation:
    expression: sum(total_oil_volume)
    grain:
      - well_id
      - calendar_month

  evidence:
    semantic_similarity: 0.94
    lineage_verified: true
    owner_match: true
    certified_asset: true
    usage_count_90d: 482

  limitations:
    freshness_sla: 24h
    excludes_test_wells: true

  proposed_trust:
    level: verified

  status:
    value: pending_review
```

Bindings should never be opaque. They should include:

- source identity;
- semantic mapping;
- transformation logic;
- grain;
- unit;
- freshness;
- lineage;
- quality;
- ownership;
- confidence;
- known exclusions.

## 5. Determine the applicable trust boundary

Before selecting or generating a contract, Lattice should classify the request.

A trust-boundary evaluator could inspect:

```text
Who is asking?
What action is requested?
What data is involved?
Which systems would be affected?
How reversible is the action?
What is the potential financial, safety or regulatory impact?
Which semantic sources are being relied upon?
Are those sources authoritative enough for this risk class?
```

The result might be:

```yaml
trust_boundary:
  request_class: operational_decision
  risk_level: high

  required_semantic_trust:
    minimum: authorized

  required_evidence:
    - certified_source
    - freshness_under_15_minutes
    - lineage_verified
    - asset_owner_approval

  execution_constraints:
    human_approval: required
    signed_plan: required
    executor_allowlist: required
```

This prevents a low-confidence discovered binding from being used in a high-consequence workflow.

## 6. Resolve an existing contract or propose a new one

Lattice should first search its authorized contract registry.

There are three possible outcomes.

### Existing contract matches

```text
Question
→ recognized intent
→ authorized contract found
→ valid bindings found
→ compile
```

### Existing contract partially matches

```text
Question
→ contract found
→ missing concept or binding
→ create amendment proposal
```

### No contract matches

```text
Question
→ recurring or valuable intent detected
→ synthesize candidate contract
→ send through governance
```

A candidate contract might look like:

```yaml
contract:
  name: IdentifyWellsExceedingTargetWithIntegrityRisk
  version: 0.1-draft

  intent:
    type: query
    subject: Well

  inputs:
    - reporting_period

  concepts:
    - Well
    - ProductionTarget
    - ProductionActual
    - IntegrityRisk

  rules:
    - ProductionActual > ProductionTarget
    - IntegrityRisk.status != resolved

  bindings:
    production_actual:
      ref: binding://well-monthly-production/v3

    production_target:
      ref: binding://operations-target/v2

    integrity_risk:
      ref: binding://integrity-risk-register/v4

  evidence_policy:
    freshness:
      production_actual: 24h
      integrity_risk: 1h

    required_quality:
      minimum_score: 0.95

  output:
    type: governed_dataset

  authorization:
    status: draft
```

## 7. Governance should be risk-aware

Not every contract requires the same review process.

### Low-risk analytical contract

Examples:

- read-only query;
- non-sensitive data;
- no operational effect.

Possible approval:

```text
automated validation
+ data steward approval
```

### Medium-risk decision support

Examples:

- recommendation;
- prioritization;
- customer segmentation;
- maintenance scheduling.

Possible approval:

```text
semantic owner
+ policy owner
+ business owner
```

### High-risk action contract

Examples:

- shut down equipment;
- release payment;
- change customer eligibility;
- modify production parameters.

Possible approval:

```text
domain owner
+ risk/compliance
+ system owner
+ security
+ human-in-the-loop mandate
```

The governance workflow should validate:

- semantic correctness;
- binding accuracy;
- source authority;
- policy compliance;
- privacy and security;
- data quality;
- execution permissions;
- failure behavior;
- rollback behavior;
- approval requirements.

## 8. Authorization creates an immutable contract package

Once approved, Lattice should not merely mark the contract “approved.” It should issue a signed authorization package.

```yaml
authorized_contract:
  contract_id: ctr-well-risk-019
  version: 1.0.0

  semantic_hash: sha256:...
  binding_hash: sha256:...
  policy_hash: sha256:...

  approved_by:
    - role: domain_steward
      identity: user-184
    - role: risk_owner
      identity: user-327

  effective_from: 2026-08-06T17:00:00Z
  review_by: 2026-11-06T00:00:00Z

  permitted_use:
    - read_only_analysis
    - recommendation

  prohibited_use:
    - automatic_shutdown

  signature:
    algorithm: Ed25519
    value: ...
```

This package becomes the authoritative unit used by the compiler.

## 9. Runtime compilation uses only authorized context

At runtime, Lattice may still inspect live external context, but it should clearly separate:

```text
Authorized semantics
Used to make binding and policy decisions

Observed context
Used to improve interpretation and suggest changes
```

A runtime request should reference exact versions:

```yaml
compilation_record:
  request_id: req-7821
  contract: ctr-well-risk-019@1.0.0
  ontology: upstream-oil-gas@3.4.1

  bindings:
    production_actual: well-monthly-production@3
    production_target: operations-target@2
    integrity_risk: integrity-risk-register@4

  policies:
    - read-only-analysis@7
    - sensitive-operational-data@2

  result:
    disposition: plan_generated
```

This makes every result reproducible.

## 10. Evolving context should trigger drift detection

External catalogs and semantic models will change. Lattice should continuously compare authorized bindings against their current source definitions.

It should detect:

- renamed fields;
- changed metric formulas;
- altered grain;
- changed units;
- removed relationships;
- changed ownership;
- certification loss;
- freshness degradation;
- schema changes;
- policy changes;
- new conflicting definitions.

Example:

```yaml
drift_event:
  binding: operations-target@2
  severity: high

  detected_change:
    type: calculation_changed
    previous: monthly_target
    current: monthly_target_adjusted_for_downtime

  affected_contracts:
    - ctr-well-risk-019@1.0.0
    - ctr-production-variance-011@2.1.0

  disposition:
    suspend_high_risk_use: true
    allow_read_only_use: false
    review_required: true
```

A contract should never silently inherit a changed source definition.

## 11. Questions should improve Lattice without bypassing governance

Repeated questions can generate useful learning signals.

Suppose users repeatedly ask:

> “Show production variance excluding planned downtime.”

Lattice could identify that:

- an existing contract lacks a downtime adjustment;
- users are consistently introducing the same clarification;
- Fabric or Genie already contains an adjusted-production metric;
- the adjustment is likely a meaningful semantic concept.

Lattice should create a proposal:

```yaml
context_improvement_proposal:
  trigger:
    repeated_question_pattern: true
    occurrences_30d: 37

  proposed_change:
    add_concept: PlannedDowntime
    add_metric: AdjustedProductionVariance

  supporting_sources:
    - fabric://operations-model/AdjustedVariance
    - databricks://metric-view/adjusted_production_variance

  impact:
    contracts_affected: 4

  status:
    governance_review
```

Thus Lattice learns from usage, but the learning is converted into a governed change request rather than silently changing behavior.

## 12. Recommended component architecture

```text
┌─────────────────────────────────────────────┐
│ Question and Intent Gateway                 │
│ Natural language, API and agent requests    │
└───────────────────┬─────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ Context Discovery Engine                    │
│ Entity extraction, intent detection,        │
│ ambiguity detection and pattern learning    │
└───────────────────┬─────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ Semantic Federation Layer                   │
│ Genie, Fabric, Unity, dbt, catalogs, APIs    │
└───────────────────┬─────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ Binding and Trust Evaluator                 │
│ Mapping, provenance, confidence, freshness, │
│ authority, quality and risk classification  │
└───────────────────┬─────────────────────────┘
                    │
          ┌─────────┴──────────┐
          ▼                    ▼
┌──────────────────┐  ┌───────────────────────┐
│ Authorized       │  │ Candidate Context     │
│ Contract Registry│  │ and Contract Proposals│
└────────┬─────────┘  └───────────┬───────────┘
         │                        ▼
         │             ┌───────────────────────┐
         │             │ Governance Workflow   │
         │             │ Review, test, approve │
         │             └───────────┬───────────┘
         │                         │
         └──────────────┬──────────┘
                        ▼
┌─────────────────────────────────────────────┐
│ Deterministic Context Compiler              │
│ Policy, evidence, freshness and approvals   │
└───────────────────┬─────────────────────────┘
                    ▼
┌─────────────────────────────────────────────┐
│ Signed Outcome                              │
│ Plan, clarification, approval or abstention │
└─────────────────────────────────────────────┘
```

## 13. Contract states

A formal lifecycle would make the system easier to govern:

```text
Observed
   ↓
Discovered
   ↓
Proposed
   ↓
Validated
   ↓
Approved
   ↓
Authorized
   ↓
Active
   ↓
Suspended / Deprecated / Superseded
```

Each transition should have explicit criteria.

| Transition | Requirement |
|---|---|
| Observed → Discovered | Semantic evidence found |
| Discovered → Proposed | Viable concepts and bindings identified |
| Proposed → Validated | Schema, quality, policy and tests pass |
| Validated → Approved | Required humans or authorities approve |
| Approved → Authorized | Contract signed and versioned |
| Authorized → Active | Effective date and runtime dependencies satisfied |
| Active → Suspended | Drift, policy failure or evidence failure |
| Active → Superseded | New authorized version published |

## 14. The central safety invariant

The architecture should enforce this invariant:

> No discovered, inferred or externally learned semantic artifact may directly authorize an enterprise action.

Only an authorized Lattice contract may do that.

External systems can contribute:

- meaning;
- relationships;
- candidate metrics;
- data bindings;
- lineage;
- evidence;
- usage signals.

But Lattice retains authority over:

- acceptable meaning;
- required evidence;
- applicable policy;
- risk level;
- approval;
- execution scope;
- plan signing.

## Refined product definition

This evolution changes the positioning of Lattice:

> **Lattice is a continuously learning context-governance platform that discovers enterprise semantics from questions, catalogs and operational systems, converts them into governed Context Contracts, and compiles authorized intent into auditable actions.**

An even more concise formulation is:

> **Discover dynamically. Authorize deliberately. Execute deterministically.**

## Updates to document

## Overall feedback



# 1. Feedback that should be adopted

## A. Adversarial threat model

This is the most important omission in the current document.

The existing “scan semantic sources” section assumes that imported metadata is trustworthy enough to inspect and score. In an agentic environment, catalog descriptions, MCP tool definitions, glossary entries, API specifications, lineage records, and model-generated metadata must all be considered potentially malicious.

The MCP statistic should be corrected, however. A recent measurement study identified **7,973 live remote MCP servers**, of which **40.55% exposed their tools without authentication**. It did not find that all approximately 8,000 servers lacked authentication. 

Add a dedicated threat-model section covering:

- malicious or compromised semantic sources;
- indirect prompt injection through metadata;
- tool-description poisoning;
- lookalike assets and namespace squatting;
- compromised federation adapters;
- source-identity spoofing;
- stale or replayed evidence;
- cross-tenant semantic leakage;
- confused-deputy and excessive-authority failures;
- dependency and software-supply-chain compromise.

I would rename **Semantic Quarantine & Sanitizer** to something like:

> **Untrusted Semantic Intake Zone**

“Sanitizer” implies that malicious semantic content can reliably be cleaned. Prompt injection is semantic, not merely syntactic. The controls need to include isolation, provenance labels, schema normalization, capability restrictions, source authentication and downstream policy enforcement—not just text filtering.

---

## B. Identity and delegation

This should become a first-class architectural concern.

NIST launched its AI Agent Standards Initiative on February 17, 2026, with agent security, identity and interoperable protocols as explicit pillars. Its NCCoE identity and authorization work specifically addresses identification, authentication, authorization, auditing, non-repudiation and prompt-injection controls for agents. 

The document should model at least:

```yaml
principal_chain:
  subject: human:user-184
  actor: agent:maintenance-planner-27
  delegations:
    - from: human:user-184
      to: agent:maintenance-planner-27
      scope: [read_production, propose_maintenance]
      purpose: well_integrity_review
      audience: lattice-compiler
      expires_at: ...
  authentication_context:
    method: oidc
    assurance_level: ...
  workload_identity:
    type: spiffe | cloud_managed_identity | enterprise_nhi
  proof_of_possession: ...
```

Do not hard-code SPIFFE as the identity model. Treat it as one supported workload-identity mechanism alongside cloud managed identities, OIDC, OAuth delegation and enterprise non-human-identity systems.

A critical compiler question should become:

> Who is the subject, who is the current actor, under whose authority is the actor operating, for what purpose, and with what remaining delegation budget?

---

## C. Negative knowledge

The Negative Knowledge Registry is an excellent addition and potentially differentiating.

The document should make rejections durable so Lattice does not repeatedly rediscover and repropose known-bad mappings.

I would modify the proposed design in one respect: avoid making `expires: never` the default. Negative decisions can become stale as source systems and definitions change.

Use:

```yaml
negative_decision:
  id: d-112
  decision: prohibit_binding
  subject: Well.productionTarget
  prohibited_source: finance.monthly_target
  applicability:
    contract_classes: [operational]
    grain: calendar_month
  rationale: ...
  decided_by: ...
  effective_from: ...
  review_by: ...
  exceptions: []
  status: active
```

Some prohibitions can be indefinite, but every decision should remain reviewable and versioned.

---

## D. Expanded assurance capabilities

The following additions are all valuable:

- behavioral drift;
- counterfactual replay;
- blast-radius analysis;
- oversight-utilization measures;
- recertification scheduling;
- shadow operation;
- immediate revocation.

Counterfactual replay is especially strong because it converts an abstract semantic change into decision impact:

> “The definition changed” becomes “14 of the last 200 recommendations would have changed, including two high-risk dispositions.”

That is a much more compelling governance capability.

---

## E. Attestations rather than a naked signature

The feedback is directionally correct that an Ed25519 signature field alone is insufficient.

The in-toto attestation framework, DSSE envelopes, identity-bound signing and transparency logs provide proven patterns. Sigstore’s implementation binds short-lived signing certificates to OIDC identities, records signing events in Rekor, and supports verification of in-toto predicates against CUE and Rego policies. 

Lattice should adopt the pattern, but not necessarily the public infrastructure:

> **Canonical artifact digest + typed attestation predicates + identity-bound signatures + append-only authorization log + policy-based verification**

For many enterprises, a private transparency service, enterprise CA, KMS or HSM-backed signer may be more appropriate than public Rekor and public Sigstore identities.

The document also needs to define:

- canonical serialization before hashing;
- digest algorithms and algorithm agility;
- predicate schemas;
- signer identity and role requirements;
- attestation freshness;
- revocation;
- log inclusion proofs;
- approval separation-of-duties;
- what happens when a signer’s role later changes.

---

# 2. Feedback that should be adopted with modification

## A. Standards-based contracts

The strategic idea is correct:

> Lattice should not compete by inventing another representation for datasets and semantic models.

ODCS 3.1 is real and includes relationships and stricter validation. ODPS has already reached version 1.0. Bitol, however, is currently described as an **LF AI & Data incubation project**, not a graduated project. 

The semantic standard requires more caution. Open Semantic Interchange has recently become **Apache Ossie**, and the current repository identifies the core specification as a draft `0.2.0.dev0`. Therefore, the proposed `osi/v1.0` references should not be put into the document as stable architecture. 

I recommend framing this as:

```yaml
context_contract_manifest:
  id: ctr-well-risk-019
  version: 1.0.0

  semantic_artifacts:
    - profile: apache-ossie
      profile_version: lattice-ossie-profile/0.1
      source_version: pinned
      digest: sha256:...

  data_contracts:
    - profile: odcs/3.1
      ref: ...
      digest: sha256:...

  product_descriptor:
    profile: odps/1.0
    required: false

  lattice_authorization:
    ...
```

The stable product concept should be:

> Lattice references or embeds standards-based semantic and data artifacts, then adds the authorization, evidence, delegation and action-governance layer those standards do not provide.

Put exact product versions in an **implementation profile appendix**, not in the core conceptual definition. This will keep the document from becoming stale every quarter.

---

## B. Five-plane architecture

The five-plane architecture is useful, but it should not replace the simple pipeline at the beginning.

The existing pipeline is an effective explanation of the operating model. Keep it as the reader’s first view:

```text
Question
→ discovery
→ proposal
→ governance
→ authorization
→ deterministic compilation
→ disposition
```

Then introduce the five planes as the **reference architecture** that implements the model.

I would also rename one plane:

- Identity & Delegation Plane
- Discovery Plane
- Governance & Evidence Plane
- Authorization & Compilation Plane
- Assurance Plane

“Evidence” belongs in the governance plane because the system is not merely approving contracts; it is establishing why approval remains valid.

---

## C. Platform-native semantics

The Databricks and Microsoft examples are useful, but their maturity needs to be represented accurately.

Databricks made Unity Catalog Business Semantics generally available on April 2, 2026. Microsoft Fabric IQ Ontology currently remains a preview feature. 

Therefore:

- describe these as federation sources, not dependencies;
- label preview capabilities explicitly;
- avoid assuming that every platform-native semantic artifact is portable;
- retain legacy BI and catalog adapters because most enterprises will operate in a mixed environment for years.

---

## D. MCP transport

Lattice should support MCP in both directions:

- as a client consuming external context and tools;
- as a governed server exposing authorized capabilities.

But I would reject this sentence:

> “Governed MCP server as the sole context source for downstream agents.”

MCP should be an interface, not the trust boundary.

Lattice may also need:

- REST and event-driven APIs;
- SQL or semantic query interfaces;
- policy decision APIs;
- batch exports;
- streaming change notifications;
- internal SDKs.

The trust boundary must be enforced at every egress interface. Otherwise, MCP becomes a single protocol dependency, bottleneck and potential point of failure.

---

## E. ACAP alignment

ACAP is relevant and maps naturally to Lattice’s authorization profile. The World Economic Forum describes it as a deployment-level governance and authorization instrument connecting delegation policy, system design and operational oversight. 

However, it should be called a **reference framework or alignment target**, not an established technical standard.

A good formulation would be:

> Lattice authorization profiles may be mapped to ACAP-style deployment authorization records, while retaining an independent machine-enforceable contract representation.

---

## F. Autonomy tiers

The document should define autonomy levels, but it should not attribute the proposed L0–L4 taxonomy to IMDA without stronger sourcing.

The official IMDA framework emphasizes risk bounding, meaningful human accountability, lifecycle controls, approved services and different levels of human involvement. Its updated version includes risk-tiered case studies. The exact standardized “Agent Identity Card plus L0–L4” construction in the feedback is not established by the official materials I reviewed. 

Define a Lattice-native model, such as:

| Level | Agent authority |
|---|---|
| A0 | Observe and retrieve only |
| A1 | Analyze and propose |
| A2 | Execute reversible actions after approval |
| A3 | Execute bounded reversible actions autonomously |
| A4 | Execute consequential actions within a tightly governed mandate |

Then provide external mappings when the relevant frameworks mature.

---

# 3. Concepts that need deeper restructuring

## A. Separate trust, authorization and lifecycle

This is the most important conceptual improvement I would make.

The current document combines several different ideas in one hierarchy:

```text
Observed → Discovered → Verified → Authorized → Deprecated
```

These are not the same kind of state.

Use separate dimensions.

### Evidence assurance

```text
Observed → Corroborated → Verified → Certified
```

This describes how strong the evidence is.

### Governance status

```text
Draft → Approved → Authorized → Revoked / Expired
```

This describes whether the artifact is permitted to govern behavior.

### Deployment status

```text
Inactive → Shadow → Active → Suspended → Retired
```

This describes how it is being used operationally.

### Source health

```text
Current → Drifted → Quarantined → Unavailable
```

This describes the condition of dependencies.

A contract can then be:

```yaml
evidence_assurance: verified
governance_status: authorized
deployment_status: shadow
source_health: current
```

This is much clearer than forcing all conditions into one lifecycle.

---

## B. Modify the weakest-link rule

The proposed weakest-link rule is directionally right but too blunt:

```text
trust(contract) = min(trust(binding_i))
```

Not every referenced artifact has the same relevance to every permitted use. A low-confidence description or optional display label should not necessarily downgrade the authorization of a calculation.

Use a scoped rule:

> Every normative dependency used for a disposition must independently meet the minimum assurance threshold for that disposition and risk class.

In other words:

```text
eligible(contract, use) =
  all required dependencies satisfy
  the assurance policy for that use
```

This preserves fail-closed behavior without reducing multidimensional evidence to one ordinal number.

---

## C. Modify “trust decay”

Evidence should age, but it should not silently mutate from Verified to Discovered.

A better model is:

```yaml
verification:
  status: verified
  verified_at: ...
  valid_until: ...
  current_state: expired
```

Preserve historical truth:

> The binding was verified on a certain date, but that verification is no longer valid for current authorization.

This is more auditable than retroactively changing its historical trust classification.

---

## D. Reframe “full replayability”

Perfect replay is not always possible when decisions depend on changing operational data, external APIs, real-time conditions or nondeterministic upstream systems.

Replace:

> Full replayability

with:

> **Decision reconstructability and bounded replayability**

Every disposition should retain enough information to determine:

- which principal chain was used;
- which artifacts and policies were used;
- what evidence was available;
- which data snapshot, query result or source version was used;
- which compiler version ran;
- why the disposition was selected.

When exact input snapshots are retained, exact replay may be possible. Otherwise, Lattice should clearly distinguish historical reconstruction from counterfactual re-execution.

---

# 4. Lifecycle changes

Shadow, Expired, Revoked and break-glass should all be added, but not as one linear chain.

In particular, **Shadow is a deployment mode**, not a stage of semantic maturity.

Break-glass should also not mean “execute outside the contract system.” That creates an invisible alternative authorization system.

Model it as an emergency authorization object:

```yaml
emergency_authorization:
  id: bg-2026-0041
  principal: ...
  scope: ...
  justification: ...
  maximum_actions: 1
  valid_for: 20m
  required_approvals:
    - incident_commander
    - system_owner
  compensating_controls:
    - enhanced_logging
    - live_observer
  retrospective_review_due: ...
```

The emergency path should still be identity-bound, time-bound, signed and logged.

---

# 5. Revised invariant set

The seven-invariant direction is good, with two edits:

1. Change **“Everything expires”** to **“Every authorization grant expires.”** Audit history and evidence records should not disappear merely because authority expires.
2. Change **“Full replayability”** to **“Decision reconstructability.”**

My proposed set:

1. **No unauthorized influence** — discovered context cannot authorize actions.
2. **Dependency-complete assurance** — every normative dependency must meet the risk-specific evidence threshold.
3. **Fail closed** — no silent fallback from authorized to inferred context.
4. **Every grant expires** — authorization is always time-bound and recertifiable.
5. **Decision reconstructability** — every disposition can be explained from version-pinned records and retained inputs.
6. **No self-authorization** — proposers cannot approve their own artifacts or authority expansion.
7. **Provable authorization history** — authorization, revocation and emergency grants are committed to an append-only log.
8. **Bounded delegation** — no actor may delegate more authority than it possesses.
9. **Capability containment** — the executor cannot exceed the capability envelope authorized by the compiler.

---

# 6. Regulatory wording that should be corrected

The statement that the EU AI Act enters “full effect in August 2026” should be removed.

As of August 6, 2026, the Act remains staged. Transparency obligations took effect on August 2, 2026, while the amended implementation schedule extends other provisions, including parts of the high-risk regime, through 2027. 

Also avoid saying the Act universally requires “model cards.” Use the Act’s more precise concepts:

- technical documentation;
- data governance;
- logging and record-keeping;
- risk management;
- human oversight;
- post-market monitoring;
- transparency obligations;
- quality-management evidence.

The Lattice claim should be:

> Lattice can produce evidence useful for regulatory and internal-control obligations; the exact applicability depends on the system, role, jurisdiction and use case.

Do not position Lattice itself as proving compliance.

---

# 7. Recommended revised document structure

I recommend this outline:

## 1. Executive thesis

Keep the two-loop insight and refined product definition.

## 2. Scope and non-goals

Explicitly state that Lattice does not prove semantic correctness, replace IAM, replace source-system governance or make an unsafe executor safe.

## 3. Core invariants

Introduce the revised invariant set early.

## 4. Two-loop operating model

Keep the existing pipeline and question-as-telemetry concept.

## 5. Trust membrane

Explain what can and cannot cross from discovery into authorization.

## 6. Identity, delegation and capability model

Add principals, actor/subject distinctions, delegation chains and autonomy ceilings.

## 7. Untrusted semantic intake and threat model

Add source authentication, tainting, isolation, conflict handling and poisoning scenarios.

## 8. Evidence and assurance model

Separate evidence confidence from authorization and lifecycle.

## 9. Context Contract composition

Describe the Lattice manifest plus ODCS, ODPS and semantic-interchange profiles.

## 10. Governance and authorization

Cover reviews, negative decisions, separation of duties and typed attestations.

## 11. Deterministic compilation

Define exactly which steps are deterministic and what inputs must be pinned.

## 12. Deployment lifecycle

Describe shadow, active, suspended, expired, revoked and emergency authorization.

## 13. Assurance and monitoring

Cover drift, counterfactual replay, blast radius and oversight effectiveness.

## 14. Reference architecture

Introduce the five planes here.

## 15. Delivery phases

Present the roadmap.

## Appendix A: Standards profiles

Keep fast-changing version mappings out of the conceptual core.

## Appendix B: Threat scenarios

Walk through malicious MCP, metadata injection, compromised steward, stale approvals and sub-agent authority escalation.

---

# 8. Recommended build phasing

The proposed phasing is mostly correct, but identity cannot wait until Phase 4.

### Phase 0 — Define

Threat model, invariants, canonical artifact model, policy model and assurance taxonomy.

### Phase 1 — Govern

Minimum viable identity and delegation, contract registry, negative decisions, authorization workflow, attestation bundle, compiler and ledger.

### Phase 2 — Federate safely

Authenticated adapters, untrusted intake zone, source snapshots, conflicts, provenance and drift detection.

### Phase 3 — Assure

Shadow mode, behavioral monitoring, counterfactual replay, blast-radius analysis, recertification and revocation.

### Phase 4 — Learn and delegate

Question-driven proposals, pattern learning, broader sub-agent delegation and governed context distribution.

The learning loop should indeed come after the trust membrane exists. But a basic principal and delegation model must exist before any authorization package can be meaningful.

---

# 9. Revised positioning

I would slightly reduce the “prove everything” language because cryptographic evidence can prove what was approved, signed and executed—it cannot prove that the underlying business meaning was objectively correct.

A stronger and more defensible formulation is:

> **Lattice is a context-governance control plane for humans and AI agents. It discovers enterprise semantics, converts them into standards-aligned Context Contracts, and deterministically compiles authorized intent—bound to verified identities, delegation constraints and evidence—into governed, auditable dispositions.**
>
> **Discover dynamically. Authorize deliberately. Execute deterministically. Evidence every decision.**

The central strategic conclusion from the feedback is right:

> Lattice should not try to own the portable representation of meaning. It should own the enforceable decision about which meaning, evidence, identity and delegated authority may influence an enterprise action.