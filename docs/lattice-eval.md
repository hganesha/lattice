
# Lattice Evaluation Framework

## Purpose

This document defines how to evaluate Lattice as a governed context system rather than as a simple prompt wrapper. The goal is to measure whether Lattice produces the right runtime outcome, uses the right evidence and policy controls, and remains reliable as contracts, bindings, and prompts evolve.

## Recommended approach

Use a two-layer evaluation strategy:

1. A deterministic local harness for fast regression and CI checks.
2. LangSmith or an equivalent evaluation platform for trace review, dataset management, human feedback, and ranking across runs.

This hybrid approach fits Lattice well because the core compiler and governance logic are deterministic, while the optional semantic-proposal layer may use LLM-assisted candidates.

---

## 1. Evaluation goals

The evaluation program should answer four questions:

- Does Lattice choose the correct outcome for each task?
- Does it honor evidence, approval, and policy constraints?
- Does it handle ambiguity and abstention correctly?
- Does it remain reliable, explainable, and economical over time?

---

## 2. What to evaluate

### 2.1 Outcome correctness

Measure whether the API returns the expected decision type:

- plan
- clarification
- approval required
- abstention

Each case should include a gold label for the expected outcome.

### 2.2 Governance correctness

Verify that Lattice behaves safely and correctly under governance rules:

- required evidence is present
- approval conditions are triggered when appropriate
- policies are respected
- high-risk decisions do not bypass controls

### 2.3 Clarification quality

For ambiguous questions, measure whether Lattice:

- identifies the ambiguity
- asks the right follow-up question
- avoids overconfident or premature conclusions

### 2.4 Evidence and trust quality

Measure whether the system distinguishes:

- observed semantics
- discovered semantics
- verified semantics
- authorized semantics

A strong system should not over-trust weak or unverified evidence.

### 2.5 Runtime quality

Track operational characteristics:

- latency
- determinism
- cost
- stability
- trace completeness

---

## 3. Evaluation dimensions

Use a scoring rubric with both hard-gate checks and weighted quality scores.

### Hard gates

A case should fail if any of the following happens:

- the outcome is incorrect
- an unsafe plan is emitted
- required evidence is missing
- policy or approval constraints are violated
- the system produces an unsupported action under weak evidence

### Weighted quality score

Score each case from 0 to 5:

- 5 = fully correct and well-governed
- 4 = correct with minor issues
- 3 = partially correct but needs review
- 2 = weak or unstable
- 1 = clearly incorrect
- 0 = unusable

Suggested weighting:

- outcome correctness: 35%
- governance quality: 25%
- evidence quality: 20%
- clarification quality: 10%
- runtime quality: 10%

---

## 4. Dataset design

Create a versioned evaluation dataset with labeled cases.

### Required case types

- happy path cases
- regression cases for known issues
- ambiguity cases
- approval cases
- abstention cases
- adversarial cases
- cross-domain cases

### Each case should include

- question
- contract or workspace context
- expected outcome
- expected evidence or policy requirements
- expected clarification behavior if applicable
- tags such as domain, risk level, and failure mode
- gold rationale reviewed by a human

A practical starting point is:

- 100–200 curated cases for PR checks
- 500+ cases for nightly or release evaluation

---

## 5. LangSmith integration

LangSmith is a strong fit for Lattice if you want:

- dataset versioning
- trace capture
- human review workflows
- ranking and regression analysis
- comparison across prompt, contract, and runtime changes

### Suggested workflow

1. Define an eval dataset in LangSmith.
2. Run each case against the Lattice API endpoint.
3. Capture:
   - input question
   - contract version
   - ontology snapshot
   - outcome
   - evidence used
   - policy result
   - latency and cost
4. Score the run with a custom evaluator.
5. Store human review feedback and gold labels.

### Recommended metadata to log

- contractId
- workspaceId
- contractVersion
- ontologyVersion
- promptVersion
- riskTier
- modelName if applicable
- evaluationCaseId
- runId

---

## 6. Example evaluator logic

An evaluator should check at least:

- outcome match
- policy compliance
- evidence sufficiency
- explanation quality
- latency threshold

A simple structure is:

```python
def evaluate_case(run_output, gold_case):
    score = 0
    reasons = []

    if run_output["outcome"] != gold_case["expected_outcome"]:
        reasons.append("wrong_outcome")
    else:
        score += 2

    if not run_output["policy_compliant"]:
        reasons.append("policy_violation")
    else:
        score += 1

    if not run_output["evidence_sufficient"]:
        reasons.append("insufficient_evidence")
    else:
        score += 1

    if run_output["latency_ms"] > 5000:
        reasons.append("slow")

    return {
        "score": score,
        "pass": len(reasons) == 0,
        "reasons": reasons,
    }
```

---

## 7. Ranking and review of results

Evaluation results should not only be scored; they should be reviewed and ranked.

### Ranking dimensions

- severity of failure
- impact on trust or governance
- frequency across domains
- whether the failure blocks release
- whether it is a regression from a prior baseline

### Review workflow

1. Group failures by category:
   - contract issue
   - binding issue
   - prompt issue
   - policy issue
   - evidence issue
   - runtime issue
2. Label each failure with severity:
   - critical
   - major
   - minor
3. Route critical issues to a domain reviewer or product owner.
4. Promote the corrected case into the gold dataset.

---

## 8. CI and release gates

Add evaluation to CI in two layers.

### Pull request checks

Run a fast eval suite for every PR touching:

- compiler logic
- policy rules
- prompt or resolver logic
- contract schema
- ontology or binding logic

Fail the PR if:

- any hard gate fails
- a critical regression appears
- weighted score drops below the baseline

### Nightly or release checks

Run the full curated suite and publish results to LangSmith or the internal store.

Release should be blocked if:

- critical cases fail
- governance correctness drops
- trust calibration regresses
- latency or cost crosses agreed thresholds

---

## 9. Minimal implementation plan

### Phase 1

- define a small gold dataset
- instrument the compile endpoint
- add a simple local evaluator
- publish basic pass/fail results

### Phase 2

- integrate LangSmith
- add trace logging and human review
- rank failures by severity and trend

### Phase 3

- connect evals to CI
- gate releases on regression thresholds
- add periodic benchmark refresh from real incidents and steward feedback

---

## 10. Recommended first milestone

Start with 50–100 high-value cases that cover:

- known counterparty exposure examples
- ambiguity cases
- approval-required cases
- weak-evidence abstention cases
- contract-changing cases

This will give you a useful signal quickly without overbuilding the system upfront.

---

## Final recommendation

Treat evaluation as a product discipline, not an afterthought. For Lattice, the highest-value evaluations are the ones that prove:

- the right decision occurs,
- the right governance controls are enforced,
- and the system remains explainable and trustworthy under pressure.

If you want, I can also turn this into a more concrete implementation plan with a Python harness and a sample LangSmith dataset schema.
