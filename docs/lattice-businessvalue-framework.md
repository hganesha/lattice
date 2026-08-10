# Lattice contracts as a semantic control and acceleration layer

The strongest version of Lattice is not another agent competing with Genie or Fabric. It is a **shared, governed context runtime** that sits in front of platform agents.

Today, platform agents commonly assemble context at request time:


Question
  → inspect permitted schemas and metadata
  → choose datasets
  → infer business definitions
  → generate code
  → execute
  → interpret results
  → formulate answer


Fabric documents that its data agent accesses source schemas with the user’s credentials and combines the user query with schema information when constructing the prompt. Supporting context contributes to billed token consumption. 

Genie similarly relies on Unity Catalog metadata, agent instructions, example SQL, SQL expressions, and an agent-specific knowledge store when generating SQL-backed answers. 

Lattice can move much of that work from **per-question discovery** to **governed, reusable compilation**:


Question
  → resolve authorized Lattice contract
  → retrieve exact semantic bindings
  → enforce trust and evidence policy
  → invoke platform agent with bounded context
  → validate generated code and evidence
  → return signed answer record


The economic proposition is therefore broader than token savings:

> **Compile enterprise context once, govern it deliberately, and reuse it across thousands of agent executions.**

---

## 1. What a Lattice contract would cache

A useful contract should contain more than terminology or an ontology mapping.

yaml
contract:
  id: customer-net-revenue
  version: 4.2.0

  intent_patterns:
    - "What was net revenue for {customer}?"
    - "Show customer revenue after returns"
    - "How much recognized revenue came from {customer}?"

  concepts:
    customer:
      type: lattice.Organization
    net_revenue:
      type: lattice.FinancialMeasure

  semantic_bindings:
    databricks:
      metric_view: finance.customer_net_revenue
      dimensions:
        customer: customer_id
        period: fiscal_period

    fabric:
      semantic_model: commercial-finance
      measure: "[Net Recognized Revenue]"
      dimensions:
        customer: Customer[CustomerId]
        period: FiscalCalendar[Period]

  entity_resolution:
    customer:
      required_identifier: enterprise_customer_id
      minimum_confidence: 1.0

  query_templates:
    databricks:
      type: metric_view_query
      permitted_assets:
        - finance.customer_net_revenue

    fabric:
      type: dax
      permitted_measures:
        - "[Net Recognized Revenue]"

  evidence_policy:
    maximum_age: PT4H
    source_certification: certified
    lineage_required: true

  answer_policy:
    required_fields:
      - customer_id
      - period
      - net_revenue
      - currency
    citation_required: true

  trust_policy:
    permitted_use:
      - analytical_answer
      - executive_reporting
    prohibited_use:
      - credit_decision
      - revenue_recognition_adjustment

  authorization:
    status: active
    approved_by:
      - finance-data-owner
      - revenue-controller


This package avoids rediscovering the following for every question:

- which definition of revenue applies;
- which semantic model or metric view to use;
- how the customer identity maps;
- which dimensions and joins are valid;
- which source is certified;
- what freshness is required;
- which outputs are acceptable;
- and for what purpose the answer may be used.

---

# 2. Value area one: consistency and accuracy

## Baseline problem

Agent accuracy is not solely an LLM problem. It is also a context-selection problem.

Two agents can answer the same question differently because they:

- select different source systems;
- interpret the same business term differently;
- choose different joins or grains;
- use booked revenue versus recognized revenue;
- apply different date logic;
- include or exclude returns;
- resolve the entity differently;
- or retrieve different metadata.

Fabric itself emphasizes that answer quality depends on how well semantic models, data-source descriptions, instructions, and examples are prepared. Its orchestrator selects a source and invokes tools such as DAX generation, validation, and execution. 

Genie likewise recommends curated instructions, table metadata, example SQL, and standardized SQL expressions for common business concepts. 

## Lattice impact

Lattice provides a common contract that both agents consume:


Question asked through Genie
       ┐
       ├── same Lattice contract
       │   same concept
       │   same entity rules
       │   same metric definition
       │   same freshness requirements
       │   same allowed sources
       │
Question asked through Fabric
       ┘


This does not guarantee identical presentation, but it can ensure that the **underlying business claim** is constructed consistently.

## Plausible improvement range

Public platform documentation does not provide enough information to estimate a universal accuracy uplift. The following is therefore a planning range rather than a measured industry benchmark.

For repetitive, well-defined analytical questions:

| Current failure rate | Contract-assisted failure rate | Relative reduction |
|---:|---:|---:|
| 5% | 2–3% | 40–60% |
| 10% | 3–5% | 50–70% |
| 20% | 5–10% | 50–75% |

“Failure” should include more than syntactically invalid code:

- wrong metric;
- wrong source;
- incorrect grain;
- ambiguous entity;
- stale result;
- missing filter;
- inconsistent definition;
- unsupported interpretation.

The highest gains should occur when:

- questions repeat;
- metrics are business-specific;
- the data estate is large;
- several agents access overlapping domains;
- and definitions differ across systems.

The gains will be smaller when the platform agent already operates over a small, carefully curated semantic model.

---

# 3. Value area two: trust boundaries

Contracts could be more valuable for trust than for cost.

A platform agent generally performs three logically different tasks:

1. **Understand the question.**
2. **Choose and execute data operations.**
3. **State a business conclusion.**

Without a separate control plane, the same probabilistic process may influence all three.

Lattice can divide those responsibilities:


Platform agent
- interprets language
- generates candidate code
- summarizes results

Lattice contract
- defines admissible meaning
- limits data and operations
- determines evidence requirements
- validates purpose and authority
- records the decision


## Four enforcement points

### Before execution

Lattice determines:

- whether the user may invoke the contract;
- whether the requested purpose is allowed;
- which sources and fields may be accessed;
- whether clarification is required;
- and whether human approval is needed.

### During code generation

The contract constrains:

- allowed datasets;
- measures;
- relationships;
- query operations;
- row limits;
- time ranges;
- execution budgets;
- and forbidden functions.

### After execution

Lattice validates:

- result schema;
- source lineage;
- data freshness;
- row-level scope;
- metric identity;
- returned units;
- and whether evidence actually supports the answer.

### Before answer release

Lattice can require:

- citations;
- uncertainty disclosure;
- approval;
- redaction;
- or abstention.

## Important distinction

A platform authorization check might establish:

> The user is permitted to read this table.

A Lattice trust policy can establish:

> This certified measure, calculated from these sources and no older than four hours, may be used to answer an executive-reporting question—but may not be used to approve credit.

That is a much more granular trust boundary.

---

# 4. Value area three: token savings

## Where tokens are consumed

A platform agent may include some combination of:

- table and column descriptions;
- relationships;
- semantic-model metadata;
- instructions;
- example queries;
- source descriptions;
- prior conversation;
- candidate source metadata;
- retrieved documentation;
- generated query attempts;
- validation failures;
- and repair prompts.

Fabric explicitly states that both the natural-language request and supporting context generate tokens. 

Lattice can replace a large, dynamically assembled context package with a compact contract projection:


Full catalog context:                   Contract projection:

87 tables                              Contract: revenue-by-customer@4.2
1,340 columns                          Metric: net_recognized_revenue
126 relationships                     Entity key: customer_id
24 source descriptions                Grain: customer × fiscal period
30 example queries                    Source: certified metric view
business instructions                 Required filters: status=posted
                                      Output schema: ...


## Illustrative per-query token model

| Context component | Without Lattice | With Lattice |
|---|---:|---:|
| Agent/system instructions | 3,000 | 2,000 |
| Catalog and schema context | 12,000 | 1,500 |
| Semantic definitions/examples | 8,000 | 2,000 |
| Source-selection reasoning | 4,000 | 500 |
| Retry and repair context | 5,000 | 1,500 |
| User question and answer | 3,000 | 3,000 |
| **Total** | **35,000** | **10,500** |

Illustrative reduction:


(35,000 − 10,500) / 35,000 ≈ 70%


A realistic planning range is:

- **20–40%** reduction for already curated agents;
- **40–70%** for broad agents scanning substantial schemas;
- **60–85%** for highly repetitive questions currently requiring repeated discovery and repair.

These estimates assume that the platform permits Lattice to supply concise, source-constrained context. If the platform still injects its full schema context regardless, the token savings would be significantly lower.

## Monthly token economics

The formula is:


Monthly savings =
questions per month
× tokens avoided per question
÷ 1,000,000
× blended token cost


### Example: medium-scale deployment

Assume:

- 100,000 questions per month;
- 25,000 tokens avoided per question;
- blended token cost of $5–$15 per million tokens.


Tokens avoided:
100,000 × 25,000 = 2.5 billion tokens/month


Estimated direct model-cost reduction:

| Blended cost | Monthly saving | Annual saving |
|---:|---:|---:|
| $5 per million | $12,500 | $150,000 |
| $10 per million | $25,000 | $300,000 |
| $15 per million | $37,500 | $450,000 |

### Sensitivity by volume

Assuming 25,000 tokens saved per question:

| Questions/month | Tokens saved | At $5/M | At $15/M |
|---:|---:|---:|---:|
| 10,000 | 250 million | $1,250 | $3,750 |
| 100,000 | 2.5 billion | $12,500 | $37,500 |
| 1,000,000 | 25 billion | $125,000 | $375,000 |

These numbers represent model-token savings only. They exclude platform-capacity charges, query compute, metadata operations, contract infrastructure, and Lattice licensing.

## Critical observation

Token savings alone may not justify Lattice at smaller scale.

At 10,000 questions a month, a few thousand dollars of monthly token savings can easily be offset by integration and governance costs.

The token case becomes compelling when:

- query volume is high;
- schemas are large;
- prompts are context-heavy;
- several agents duplicate discovery;
- or agents frequently retry failed queries.

---

# 5. Value area four: latency and speed

Lattice can reduce latency in three areas.

## Semantic discovery

Instead of searching catalogs and selecting candidate sources at runtime, Lattice retrieves a precompiled binding.

## Prompt processing

A smaller prompt generally requires less model processing than a very large context package.

## Query repair

A contract-supplied query shape, grain, measures, and filters can reduce execution failures and regeneration loops.

## Illustrative latency model

| Stage | Without contract | With contract |
|---|---:|---:|
| Schema/catalog discovery | 2–8 seconds | 50–300 milliseconds |
| Source and metric selection | 1–4 seconds | 50–200 milliseconds |
| Initial model reasoning | 2–8 seconds | 1–4 seconds |
| Query generation/validation | 2–6 seconds | 1–3 seconds |
| Query execution | 1–10 seconds | 1–10 seconds |
| Repair probability contribution | 0–15 seconds average | 0–4 seconds average |
| **Typical total** | **8–35 seconds** | **3–15 seconds** |

A plausible goal is:

- **30–60% lower median latency** for recognized contract-covered questions;
- **50–80% lower semantic-resolution latency**;
- **20–50% lower end-to-end latency**, since database execution may remain unchanged.

These are architectural estimates, not published platform benchmarks.

## Time-value illustration

At 100,000 questions per month and 10 seconds saved per question:


1,000,000 seconds saved
≈ 278 hours of cumulative waiting


Not all waiting translates into productive labor. Assuming only 20% is economically recoverable:


278 × 20% = 56 productive hours


At a loaded labor cost of $75–$150 per hour:


Monthly productivity value ≈ $4,200–$8,400


Latency value can be much higher for:

- interactive operational decisions;
- contact-center workflows;
- embedded customer experiences;
- or chained multi-agent processes where delays compound.

---

# 6. Accuracy and rework may be the largest measurable benefit

Suppose an organization runs 100,000 questions per month.

Assume Lattice reduces materially wrong or unusable answers from 8% to 4%:


4,000 fewer failed answers per month


If each failure costs an average of five minutes to detect, verify, rerun, or correct:


4,000 × 5 minutes = 333 hours/month


At a loaded cost of $75–$150 per hour:


Monthly rework savings = $25,000–$50,000
Annual rework savings = $300,000–$600,000


This estimate excludes the cost of incorrect answers that are not detected.

For consequential workflows, avoided error exposure can outweigh token and labor savings by orders of magnitude, although that value is more difficult to attribute.

---

# 7. Platform-compute savings

Contracts may also reduce:

- catalog API calls;
- metadata lookups;
- XMLA metadata access;
- graph traversals;
- SQL validation calls;
- failed SQL or DAX executions;
- warehouse startup and runtime;
- result retries;
- and repeated code-interpreter runs.

Fabric’s agent architecture can invoke DAX generation, validation, and execution against semantic models, and ontology-backed queries can incur graph-operation consumption. 

A reasonable planning range for contract-covered workloads is:

- **20–60% fewer metadata operations**;
- **15–40% fewer query-generation retries**;
- **5–25% lower analytical compute associated with failed or redundant executions**.

The actual value depends heavily on whether catalog scanning is performed by the agent, cached internally by the platform, or billed as part of existing reserved capacity.

---

# 8. Combined example business case

Consider an organization with:

- 250,000 agent questions per month;
- three agent platforms;
- 60% of questions matching reusable intent patterns;
- 25,000 tokens avoided on contract-covered questions;
- $8 per million blended token cost;
- eight seconds of latency reduction;
- failure rate reduced from 9% to 5%;
- five minutes of rework per failed answer;
- $100 per hour loaded labor rate.

## Direct token savings


250,000 × 60% × 25,000 ÷ 1,000,000 × $8
= $30,000 per month


## Rework savings

Eligible contract-covered questions:


250,000 × 60% = 150,000


Avoided failures:


150,000 × (9% − 5%) = 6,000


Avoided rework:


6,000 × 5 minutes = 500 hours


Value:


500 × $100 = $50,000 per month


## Recoverable latency value

Total time saved:


150,000 × 8 seconds = 333 hours


Assuming 20% is productive time:


333 × 20% × $100 ≈ $6,700 per month


## Query and platform compute

Assume a conservative additional:


$5,000–$15,000 per month


## Total illustrative benefit

| Benefit | Monthly | Annual |
|---|---:|---:|
| Token reduction | $30,000 | $360,000 |
| Reduced answer rework | $50,000 | $600,000 |
| Recoverable latency | $6,700 | $80,400 |
| Platform/query compute | $5,000–$15,000 | $60,000–$180,000 |
| **Total** | **$91,700–$101,700** | **$1.10M–$1.22M** |

This excludes:

- avoided compliance incidents;
- better executive decision quality;
- reduced agent-development effort;
- faster onboarding of new data domains;
- and reuse across additional platforms.

It also excludes the cost of building and operating Lattice.

---

# 9. Cost of Lattice

A credible business case must account for the semantic control plane itself.

## Initial costs

- connectors to Genie, Unity Catalog, Fabric, and other catalogs;
- ontology mappings;
- contract-authoring tools;
- governance workflow integration;
- evaluation datasets;
- identity and policy integration;
- executor validation;
- migration of existing agent instructions.

## Recurring costs

- contract stewardship;
- semantic drift monitoring;
- approval operations;
- infrastructure;
- source synchronization;
- evaluation;
- auditing;
- incident response;
- and contract deprecation.

For a mature enterprise deployment, annual operating cost could plausibly range from several hundred thousand dollars to more than $1 million, depending on breadth and regulatory requirements.

Consequently, the previous illustrative deployment has a strong ROI only if Lattice can:

- cover a substantial portion of questions;
- automate most low-risk contract governance;
- reuse contracts across multiple platforms;
- and materially reduce answer failures.

---

# 10. Break-even analysis

Let:

- \(Q\) = monthly questions;
- \(C\) = contract coverage;
- \(T\) = tokens saved per covered question;
- \(P\) = token cost per million;
- \(E\) = reduction in failure rate;
- \(M\) = minutes saved per avoided failure;
- \(L\) = labor cost per hour;
- \(O\) = monthly Lattice operating cost.

Then approximate monthly value is:


Token value =
Q × C × T ÷ 1,000,000 × P

Rework value =
Q × C × E × M ÷ 60 × L


Break-even occurs when:


Token value + rework value + compute value + latency value ≥ O


Example with:

- 25,000 tokens saved;
- $8/M tokens;
- 4 percentage-point failure improvement;
- five minutes saved;
- $100/hour labor;
- 60% coverage.

Value per contract-covered query:


Token value:
25,000 ÷ 1,000,000 × $8 = $0.20

Rework value:
4% × 5/60 × $100 = $0.33

Combined:
≈ $0.53 per covered question


At 60% coverage, value per submitted question is approximately:


$0.53 × 60% = $0.32


For $50,000 monthly Lattice operating cost:


Break-even volume ≈ 157,000 questions per month


Compute, latency, and risk benefits would lower that break-even point.

---

# 11. Where Lattice creates the most value

## High-value conditions

Lattice is attractive when:

- multiple agent platforms use the same enterprise concepts;
- users repeatedly ask related questions;
- catalogs are large and fragmented;
- semantic definitions vary across domains;
- mistakes create significant rework or risk;
- answers require evidence and freshness guarantees;
- agents execute code or actions;
- source discovery is currently repeated at runtime;
- the organization needs reproducible answers.

## Low-value conditions

Lattice may be unnecessary or uneconomic when:

- there is one small, curated semantic model;
- questions are mostly unique and exploratory;
- agents already receive narrowly scoped metadata;
- platform caching eliminates most scan cost;
- there is little cross-platform reuse;
- answers have low consequence;
- semantic governance is weak or lacks accountable owners.

---

# 12. Critical risks

## Contracts can become a second semantic-model estate

Without careful design, Lattice may duplicate:

- Fabric measures;
- Unity Catalog definitions;
- Genie instructions;
- business glossaries;
- and platform access policies.

It should reference native semantics wherever possible, not copy them.

## Stale contracts can improve consistency while reducing correctness

A stale contract may produce the same wrong answer every time.

Consistency is not inherently accuracy. Lattice requires:

- change detection;
- source-version pinning;
- compatibility testing;
- review deadlines;
- and automatic suspension on material drift.

## Governance can become a bottleneck

Requiring human approval for every new question would destroy the speed advantage.

Lattice should approve reusable **intent classes**, not individual phrasings, and automate low-risk amendments.

## Platform agents may not expose sufficient control

Savings depend on whether Genie and Fabric permit:

- source allowlists;
- compact context injection;
- contract-based query constraints;
- generated-code inspection;
- and execution-result validation.

Where platforms still perform their own full discovery, Lattice may add trust but deliver less token or latency improvement.

## Measuring accuracy is difficult

Organizations need a test set with:

- expected semantic interpretation;
- acceptable source;
- expected result;
- required evidence;
- and policy disposition.

Without that, claims of accuracy improvement will remain anecdotal.

---

# 13. Recommended product architecture


                    ┌─────────────────────────┐
                    │ User or calling agent   │
                    └────────────┬────────────┘
                                 │ question
                                 ▼
                    ┌─────────────────────────┐
                    │ Lattice Contract Router │
                    │ intent + identity       │
                    └────────────┬────────────┘
                                 │
                 ┌───────────────┴────────────────┐
                 │                                │
        recognized contract              no valid contract
                 │                                │
                 ▼                                ▼
    ┌────────────────────────┐       ┌────────────────────────┐
    │ Authorized projection  │       │ Discovery and proposal │
    │ concepts               │       │ scan catalogs          │
    │ bindings               │       │ propose bindings       │
    │ source constraints     │       │ governance workflow    │
    │ query shape            │       └────────────────────────┘
    │ evidence policy        │
    └───────────┬────────────┘
                │ bounded request
        ┌───────┴─────────┐
        ▼                 ▼
┌──────────────┐  ┌──────────────┐
│ Genie Agent  │  │ Fabric Agent │
│ generate/run │  │ generate/run │
└──────┬───────┘  └──────┬───────┘
       └──────────┬───────┘
                  │ code + results + lineage
                  ▼
       ┌────────────────────────┐
       │ Lattice Evidence Gate  │
       │ validate semantics     │
       │ validate freshness     │
       │ validate result        │
       │ enforce purpose        │
       └───────────┬────────────┘
                   ▼
       signed answer | approval
       clarification | abstention


---

# 14. The strategic value proposition

Lattice should avoid claiming only that it makes agents “more accurate.” That is difficult to prove and overlaps with native platform roadmaps.

A more defensible claim is:

> **Lattice converts repeatedly rediscovered agent context into reusable, authorized execution contracts.**

Those contracts create four measurable outcomes:

1. **Semantic consistency:** the same business question resolves to the same governed definition across agents.
2. **Bounded execution:** generated code is constrained by identity, purpose, sources, operations, and evidence requirements.
3. **Lower runtime cost:** reusable bindings reduce catalog context, prompt size, metadata calls, and retries.
4. **Faster responses:** agents begin with an authorized query path rather than rediscovering one.

The commercial hierarchy is likely:


1. Reduced risk and stronger control
2. Reduced errors and human rework
3. Faster cross-platform agent development
4. Token and platform-compute savings
5. User-perceived latency


Token reduction is easy to demonstrate, but **answer rework, contract reuse, and risk reduction are likely to produce more enterprise value**.