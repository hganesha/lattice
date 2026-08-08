# Lattice — Evolution & Evaluation: Design & Implementation Plan

**Date:** 2026-08-07
**Scope:** Functional UX only. Design tokens, colour, type, and the in-flight `styles.css` consolidation are explicitly out of scope here (tracked separately in `lattice-ux-reimagine.md`).
**Inputs reviewed:**
- Merged product surface — `apps/studio` (11 studio modes), `apps/api` (17 routes), `packages/contracts` (~80 exported types)
- `docs/lattice-evolution.md` — target architecture + self-critique (1,300 lines)
- `docs/lattice-eval.md` — evaluation framework (two-layer harness + LangSmith)
- `lattice-evaluation-platform-ui/` — a standalone React/Vite prototype of an evaluation console (~5,200 LOC, fully mocked)

---

## 1. Method and verdict up front

I read the three sources as three different claims about the same product:

| Source | Claim | Status |
|---|---|---|
| `apps/studio` (merged) | "Lattice is a place to *author* governed context contracts" | **Built, and good at this** |
| `docs/lattice-evolution.md` | "Lattice is a place to *authorize* discovered context, continuously" | **Architected, zero UI** |
| `lattice-evaluation-platform-ui` + `docs/lattice-eval.md` | "Lattice is a place to *prove* the decisions were right" | **Prototyped, zero backend** |

The merged app builds artifacts. Neither of the other two loops exists in it. That is the gap, and it is the reason the product currently reads as an ontology editor rather than a control plane: **a user can create a contract but cannot ever see what it decided, whether those decisions were correct, or what changed under it.**

The single most damning observation from the audit: `RuntimeStudio` holds the compile result in `useState` (`RuntimeStudio.tsx:24`) and it is destroyed by the next compile. The core output of the entire product is not persisted to any user-visible surface. `docs/lattice-evolution.md` §9 calls decision reconstructability an invariant; today the decision does not survive a second keystroke.

---

## 2. Audit — the merged surface

### 2.1 What is genuinely strong

- **The compiler bar is the right money moment.** `RuntimeStudio.tsx:79-83` — one field, one question, ⌘↵, four possible outcomes (plan / clarification / approval / abstention). This is a clearer product statement than anything in the eval prototype.
- **Ontology-first workspace/contract split** (`App.tsx:54-72`) correctly separates shared semantics from decision scope, and `workspaceBindingContract()` (`App.tsx:443`) is a clean way to let bindings operate at either level.
- **Assurance produces an immutable artifact.** `AssuranceStudio.syncRunToContract()` writes checks back as `ContextTest[]` *and* mints an `EvidenceRecord` with the run digest (`AssuranceStudio.tsx:102-121`). That closing of the loop — a run becomes evidence — is exactly right and should be the template for eval runs.
- **Release gating is real**, not cosmetic: `canCompile` requires `releaseStatus === 'PUBLISHED' && runtimeStatus === 'ACTIVE'`.
- **Dirty-state discipline** with a `ConfirmDialog` interception on contract/workspace switch (`App.tsx:149-178`).

### 2.2 Functional gaps (ranked by damage)

| # | Gap | Evidence | Damage |
|---|---|---|---|
| G1 | **No disposition history.** Compile results are ephemeral. | `RuntimeStudio.tsx:24,71` | Breaks the doc's own "decision reconstructability" invariant. Nothing to audit, nothing to evaluate against. |
| G2 | **No URL routing.** 11 modes selected by `useState` and rendered from a single 1-line ternary chain. | `App.tsx:77,341` | No back button, no deep link to a review or run, no reload persistence, no shareable "look at this". `shareContract()` shares the contract, not the view. |
| G3 | **Publish cliff.** You cannot compile until you have published. | `RuntimeStudio.tsx:29` | New users never reach the money moment. There is no dry-run/shadow path, which the evolution doc §12 requires as a deployment mode anyway. |
| G4 | **No evaluation loop at all.** Assurance checks *structure*, not *behaviour*. | `AssuranceStudio.tsx` categories: STRUCTURAL/QUESTION/MAPPING/POLICY/RELEASE | `docs/lattice-eval.md` is 100% unimplemented. No datasets, no gold labels, no regression baseline, no CI gate. |
| G5 | **Reviews are per-contract only.** `ReviewQueueStudio contract={contract}` | `App.tsx:341` | A steward across 12 contracts must hop contracts to find their own work. There is no "what needs *me*" surface anywhere in the app. |
| G6 | **No identity or delegation surface.** Every request is `Authorization: 'Bearer studio-demo'`; the avatar is a hard-coded `HG`. | `App.tsx:247,332` | The evolution doc's §B ("identity is a first-class architectural concern, cannot wait until Phase 4") has no product expression at all. |
| G7 | **No drift / source-health surface.** | — | §10 of the evolution doc is the single strongest governance capability described and there is nowhere to see it. |
| G8 | **Silent redirect on empty state.** `navigateTo()` bounces you to `contracts` with no explanation when no contract exists. | `App.tsx:301-304` | Clicking "Compiler" and landing on a contract list with no message reads as a bug. |
| G9 | **Nav is object-centric, not task-centric.** Ontology / Bindings / Contracts / Compiler / Assurance / Policies / Reviews / Evidence / Releases. | `App.tsx:54-72` | Correct as a data model, useless as a job model. There is no "I am a risk owner, where do I start". |
| G10 | **Summary cards are inert.** Four fixed cards, no click-through, no drill-down. | `App.tsx:336-338, 382-441` | Wasted prime real estate on every screen. |
| G11 | **One global `draftDirty` boolean** set by many children, cleared only on save/select. | `App.tsx:78` | False-positive "unsaved changes" prompts; no per-surface granularity; no autosave. |
| G12 | **No search, no command palette, no activity feed.** | — | At 48 contracts (the eval prototype's own scale assumption) the sidebar switcher is the only navigation. |

---

## 3. Critical read — `docs/lattice-evolution.md`

This is a strong architecture document. It is also, from a product-surface point of view, **entirely artifact-centric**: 30+ YAML blocks and not one sentence about who is looking at a screen or what decision they are making. Every recommendation below translates its artifacts into surfaces.

### 3.1 Adopt as-is

**A. The four orthogonal state dimensions (§3.A).** Splitting `Observed→…→Deprecated` into *evidence assurance* / *governance status* / *deployment status* / *source health* is correct and is the best idea in the document.

> **But it is a UX hazard as written.** Four axes at 4–5 values each is up to 320 states. A steward cannot reason about a 4-tuple. The UI must derive **one primary answer — "what is this permitted to do right now?"** — and present the four axes only as the *explanation* for that answer, on demand. The document should state this as a design constraint; it currently does not.

**B. The scoped eligibility rule (§3.B).** `eligible(contract, use) = all required dependencies satisfy the assurance policy for that use` is far better than `trust = min(trust(binding_i))`. It also gives the UI its natural shape: a **per-use eligibility matrix** (rows = permitted uses, columns = risk class), not a single trust score. Build the matrix; never render a composite trust number.

**C. Negative decisions (§C).** The Negative Knowledge Registry is the one mechanism that makes governance cheaper over time instead of more expensive. `review_by` instead of `expires: never` is the right call.

**D. Counterfactual replay (§D).** *"14 of the last 200 recommendations would have changed, including two high-risk dispositions."* This is the highest-value single sentence in the document and it has no UI anywhere. It converts an abstract semantic change into a decision-impact statement a business owner can act on. **This should be the headline of every drift event, not a sub-feature of assurance.**

**E. Emergency authorization as an object (§4).** Modelling break-glass as a signed, time-boxed, identity-bound artifact — rather than "execute outside the contract system" — is correct and prevents an invisible second authorization system.

### 3.2 Adopt with modification

**F. "Decision reconstructability" over "full replayability" (§C, §5.5).** Right, and it has a direct UI consequence the document misses: the disposition detail screen must **visibly distinguish** "reconstructed from retained inputs" from "re-executed against current data". Those are different epistemic claims and a reviewer will conflate them unless the UI separates them.

**G. Trust-boundary evaluation (§5).** The doc asks "who is asking / what action / how reversible / what impact". `docs/BV-improvements.md` §3 correctly demolishes the assumption that purpose can be inferred from natural language. **Product consequence: purpose must be declared, not inferred.** The compiler bar needs a required *purpose* selector alongside the question, and the risk tier must be derived from `purpose × contract × operation` — never from the question text. This is a small UI change with large correctness implications.

**H. Autonomy tiers A0–A4 (§F).** Right to define Lattice-native levels rather than borrowing IMDA's. But a tier is a property of a principal, and there is no principal surface — so this is blocked behind the identity work, not independent of it.

**I. Standards profiles in an appendix (§2.A).** Correct. In the UI, standards should be **badges with a pinned version and digest**, exactly as the eval prototype renders them (`ContextContracts.tsx:127-134`), not a claimed conformance level.

### 3.3 Push back

**J. The document has no users.** Its §7 outline (15 sections) implies at least five distinct jobs — semantic owner, data steward, risk/compliance, platform engineer, agent owner — and the merged app gives all five the same nav. Before building against this document, the personas must be named, because §7's structure is a *document* outline, not an *information architecture*.

**K. §7 as IA would be wrong.** Reading order ≠ navigation order. "Threat model", "invariants", "scope and non-goals" are documentation, not screens. The product IA should be job-shaped (Build / Operate / Govern / Assure), with the document's conceptual model surfaced as inline explanation and a glossary.

**L. The learning loop (§11) is under-specified where it matters most.** "37 occurrences in 30 days → propose adding `PlannedDowntime`" is the right idea, but the doc never says what a reviewer sees when that proposal lands: which 37 questions, from whom, what the proposed change breaks, what it fixes. A proposal without its evidence trail and blast radius is unreviewable, and unreviewable proposals become a rubber-stamp queue — which is worse than no learning loop.

**M. §6 governance tiers describe approver *roles* but no *routing*.** "domain owner + risk/compliance + system owner + security" is a list, not a workflow. There is no statement of parallel vs. sequential approval, quorum, delegation-while-out-of-office, or SLA/escalation. This is the difference between a governance feature and a governance bottleneck, and it is the #1 risk called out in `docs/BV-improvements.md`.

---

## 4. Critical read — `lattice-evaluation-platform-ui`

A well-executed, fully-mocked prototype. Treated correctly it is a **design spec for three screens we should build**. Treated incorrectly it is 5,200 lines of plausible-looking fiction.

### 4.1 Steal these

| Idea | Where | Why |
|---|---|---|
| **Task-centric IA: Evaluate / Govern** | `Sidebar.tsx:25-32` | Two groups, six items, immediately legible. Directly fixes G9. |
| **Disposition master/detail** | `Dispositions.tsx:167-260` | Intent → delegation chain → evidence → policy ref → version pins → latency. This *is* the decision-reconstructability screen the evolution doc asks for. Best artifact in either codebase. |
| **Delegation chain as a horizontal ribbon terminating in the verdict** | `Dispositions.tsx:194-229` | Makes "under whose authority" instantly readable. Reuse verbatim. |
| **Expandable run rows with inline dimensional breakdown + flagged outliers** | `EvaluationRuns.tsx:225-231, 251-313` | Correct progressive disclosure: triage in the table, diagnose in the row, without losing place. |
| **Outliers as *improvement opportunities*, not just anomalies** | `Outliers.tsx:227-285` | The most product-minded idea in the prototype — expected→actual bar with a target marker, plus a suggested remediation. Converts a metric into a task. |
| **5-step wizard with a persistent configuration rail** | `NewEval.tsx:157-234` | The always-visible "Target / Contract / Dimensions / Samples" summary means you never lose the thread. Adopt for the eval wizard and retrofit into `NewContractWizard`. |
| **Single global query filtering every list view** | `App.tsx:19,28` | Cheap cross-view search. Adopt the *concept*; replace the implementation (see 4.2). |

### 4.2 Fix before adopting

- **Fabricated statistics.** `NewEval.tsx:223` renders confidence as `min(99, 85 + samples/1000)` to one decimal place. A made-up number with false precision, next to a real one, poisons every number on the screen. **Must not ship in any form.** Either compute a real interval from the case set or show sample count alone.
- **Trust theatre.** `Dispositions.tsx:246-248` asserts "Content-addressed & tamper-evident" beside evidence chips that cannot be verified and have no signature, signer, or inclusion proof. If we claim cryptographic properties we must ship a **Verify** action that actually calls `/v1/keys/current` and reports pass/fail — otherwise say nothing.
- **Silent no-op controls.** The Env segmented control filters `runs` only; `Dispositions`, `Outliers`, `Identities`, `ContextContracts` all `void env`. A control that appears to work and does nothing is worse than an absent one.
- **Wizard validation is inconsistent.** `StepDot` (`NewEval.tsx:99`) lets you jump straight to Review with nothing selected, while the Next button *is* gated (`NewEval.tsx:257-260`). Gate both, or gate neither.
- **Two real bugs to not carry over:** `useMemo` used for a side effect to auto-name the run (`NewEval.tsx:79-84` — setState during render, missing `name` dep), and "Deselect all" implemented as toggle-every-key (`NewEval.tsx:430-438`), which *inverts* a partial selection instead of clearing it.
- **Dead-end suggestions.** Every outlier carries a remediation string with no action attached. Each must route to a real destination — open binding / open policy / create review / add to gold set.
- **Hard-coded graph layout.** `Identities.tsx:45-54` positions eight known IDs by hand. Needs real layout (reuse `ontologyLaneLayout.ts`), plus click-to-filter, scope/expiry, and remaining delegation budget.
- **No pagination anywhere.** `max-h-[640px]` with overflow scroll on dispositions; unbounded run table. At the prototype's own claimed scale (184k dispositions/24h) both collapse.
- **Repeats G2.** The prototype uses the same `useState` view switch as the merged app. Do not carry the pattern across.
- **Fake system metadata.** `App.tsx:97` — "compiler v4.2.1 · region us-east-1 · build 0f3a7c" hard-coded in the footer, and the sidebar's "312 ms / 2.1k/s" status card (`Sidebar.tsx:139-148`). We already have a real health probe (`App.tsx:132-147`); wire that instead.

### 4.3 The prototype's own biggest miss

**It has no dataset or case management, and no run comparison.** `docs/lattice-eval.md` is built on versioned gold datasets (§4), failure categorisation (§7), and CI regression gates (§8). The prototype's "Dataset" step is a source picker plus a sample-size slider, and its only cross-run signal is a single `drift` number. **The two screens that make evaluation a discipline rather than a dashboard — the case set and the baseline diff — are exactly the two it does not have.** They are P1 below.

---

## 5. The three missing loops

```
  LOOP 1 — AUTHOR        LOOP 2 — OPERATE            LOOP 3 — PROVE
  (built)                (evolution doc, no UI)      (eval doc + prototype, no backend)

  ontology                question + purpose          case set (gold)
    → bindings              → compile                   → eval run
    → contract              → disposition               → scored vs. rubric
    → assurance             → execution receipt         → failures categorised
    → review                → drift detection           → baseline diff
    → release               → counterfactual replay     → routed to Loop 1
                            → proposal ─────────────────────────┘
```

Loop 1 is complete. Loop 2 exists in the API (`/v1/compile`, `/v1/executions`, `/v1/runtime-approvals`) but has almost no UI. Loop 3 does not exist at all. **Every enhancement below is scored by which loop it closes.**

---

## 6. Enhancement backlog

Effort: **S** ≤2d · **M** ≤1w · **L** >1w. Each item names its trigger source.

### P0 — Foundations (nothing else is worth building first)

**E1 · Route the application** · L · Loop 1/2/3 · *fixes G2*
Replace the `studioMode` state machine and the ternary chain at `App.tsx:341` with a real route table. Target shape: `/w/:workspaceId/c/:contractId/:surface`, plus addressable detail routes `/reviews/:reviewId`, `/dispositions/:id`, `/runs/:runId`. Keep `?contract=` / `?workspace=` working as redirects. Extend `shareContract()` to share the current *view*, not just the contract.
*Blocks E5, E7, E8, E12, E14 — every one of them needs a linkable detail page.*

**E2 · Task-shaped IA: Build / Operate / Govern / Assure** · M · *fixes G9*
Adopt the prototype's grouping discipline (`Sidebar.tsx:25-32`) at Lattice's scale:
- **Build** — Shared Ontology, Ontology Bindings, Contracts, Source Bindings
- **Operate** — Compiler, Disposition Trail, Executions, Runtime Approvals
- **Govern** — Review Inbox, Policies, Evidence, Negative Decisions, Releases
- **Assure** — Assurance Runs, Evaluations, Case Sets, Drift & Source Health

Replace the silent redirect (`App.tsx:301-304`, G8) with an explanatory empty state naming the missing prerequisite and offering the action that resolves it.

**E3 · Sandbox / dry-run compile** · M · Loop 2 · *fixes G3*
`POST /v1/compile` gains `mode: 'DRY_RUN' | 'AUTHORIZED'`. Dry-run compiles against the draft, returns a disposition explicitly marked **non-authorizing**, and persists to the trail flagged as such. This removes the onboarding cliff *and* implements the `Shadow` deployment status the evolution doc §3.A requires — one build, two requirements.

**E4 · Declared purpose on the compiler bar** · S · Loop 2 · *evolution §5 + BV-improvements §3*
Add a required purpose selector beside the question field (`RuntimeStudio.tsx:81`). Derive `RiskTier` from `purpose × contract × operation`, never from question text. Show the derived tier and its required evidence thresholds **before** compile, so the user sees the gate they are about to hit. `RiskTier` already exists in `types.ts:23`.

**E5 · Disposition Trail** · L · Loop 2 · *fixes G1 — highest single-item value*
New surface, master/detail, modelled directly on `Dispositions.tsx:167-260`. Every compile (dry-run and authorized) persists. Detail shows: authorized intent + declared purpose · principal chain · verdict · **version pins** (contract@v, ontology@v, each binding@v, each policy@v — the `compilation_record` from evolution §9) · evidence with a working **Verify** action · latency · reconstruct-vs-replay marker (§3.2.F). Filters: verdict, purpose, risk tier, principal, contract, time.
*Corrections vs. prototype: real pagination; no unverifiable tamper-evidence claims.*

### P1 — The evaluation loop

**E6 · Case Sets** · L · Loop 3 · *`lattice-eval.md` §4; the prototype's biggest miss*
Versioned gold datasets as root-level files (consistent with the deliberate database-free posture). Per case: question, purpose, contract/workspace context, expected outcome (`plan | clarification | approval | abstention`), expected evidence/policy requirements, expected clarification behaviour, tags (domain / risk tier / failure mode), and human-reviewed gold rationale. Case types: happy path, regression, ambiguity, approval, abstention, adversarial, cross-domain. Ship with the recommended first milestone — 50–100 cases (`lattice-eval.md` §10).

**E7 · Evaluation Runs** · L · Loop 3
Run list + expandable rows (`EvaluationRuns.tsx:225-313`), detail per case. Score against Lattice's **real** rubric from `lattice-eval.md` §3, not the prototype's generic six:
- **Hard gates** (pass/fail, never averaged): wrong outcome · unsafe plan emitted · required evidence missing · policy/approval violated · unsupported action under weak evidence
- **Weighted score**: outcome 35% · governance 25% · evidence 20% · clarification 10% · runtime 10%

Render gates as gates. A run with a failed hard gate must **not** display a 92% score next to it — that is the single most likely way this feature misleads.
Mint an `EvidenceRecord` per run, exactly as `AssuranceStudio.syncRunToContract()` already does (`AssuranceStudio.tsx:102-121`).

**E8 · Baseline diff / run comparison** · M · Loop 3 · *the screen CI gating actually needs*
Per-case matrix vs. a pinned baseline: **fixed · regressed · unchanged · new**. Summary line the PR check can quote verbatim. Without this, `lattice-eval.md` §8 (PR checks, release gates) cannot be implemented at all.

**E9 · New Evaluation wizard** · M · Loop 3
Adopt `NewEval.tsx`'s 5-step + persistent-config-rail structure. Changes: dataset step becomes **case-set selection** (not a sample slider); **delete the fabricated confidence estimator** (§4.2); gate step navigation consistently; fix the two carried bugs; Launch actually launches with an optimistic row, live progress, and cancel.

**E10 · Failure routing** · M · Loop 3 → Loop 1 · *`lattice-eval.md` §7*
Every failed case is categorised — contract · binding · prompt/resolver · policy · evidence · runtime — assigned a severity, and given **real actions**: open the binding, open the policy, create a review request, promote the corrected case into the gold set. This is the closure of Loop 3 back into Loop 1 and the reason the whole programme pays for itself.

### P2 — Governance depth

**E11 · Four-axis state, one primary answer** · M · Loop 2 · *evolution §3.A + §3.2.A*
Surface `evidence_assurance / governance_status / deployment_status / source_health` on contracts, bindings, and policies — but lead with the derived **"permitted uses right now"** eligibility matrix (§3.1.B). The four axes appear as the explanation on expand. Never render a composite trust score.

**E12 · Cross-contract Review Inbox** · M · Loop 1 · *fixes G5*
Promote `ReviewQueueStudio` from per-contract to a workspace-wide inbox: assigned-to-me, awaiting-my-role, SLA/age, blocked-by. Add the routing that evolution §6 omits (§3.3.M): parallel vs. sequential approval, quorum, out-of-office delegation, escalation.

**E13 · Structured rejection → Negative Decision Registry** · M · Loop 1 · *evolution §C*
Rejection becomes a typed capture — prohibited subject/source, applicability (contract classes, grain), rationale, decider, `effective_from`, `review_by`, exceptions — surfaced as a browsable registry, and consulted by discovery so the same rejected mapping is never re-proposed. `ReviewDecisionArtifact` (`types.ts:297`) needs extending.

**E14 · Drift & Source Health + counterfactual replay** · L · Loop 2 · *evolution §10 + §D — highest-value governance screen*
Board of drift events (renamed field, changed formula, altered grain/unit, certification loss, freshness degradation, schema change). Each event leads with the **counterfactual**: *"N of the last M dispositions would have changed, including K high-risk."* Drill into the specific dispositions that flip. Actions: suspend high-risk use · allow read-only · open review.

**E15 · Identities & Delegation** · L · Loop 2 · *fixes G6; evolution §B*
Principals (human / agent / service), delegation chains with **scope, purpose, audience, expiry, and remaining budget**, authentication context, workload identity, and per-agent autonomy tier A0–A4 (§3.2.H). Adopt the prototype's graph *idea*, replace its hard-coded layout with real layout + interaction. Retire the hard-coded `Bearer studio-demo` / `HG` avatar.

**E16 · Attestation viewer** · M · Loop 2 · *evolution §E*
Replaces §4.2's trust theatre with the real thing: canonical digest + serialization, typed predicates, signer identity **and the role held at signing time**, freshness, revocation state, log inclusion. A **Verify** button that calls `/v1/keys/current` (already implemented, `server.ts:454`) and reports an honest pass/fail.

**E17 · Blast radius inline in review decisions** · M · Loop 1
A reviewer approving a binding change must see, in the decision panel, what depends on it and what breaks. Same engine as E14's counterfactual, different entry point. Without it, §3.3.L's learning-loop proposals are unreviewable.

**E18 · Emergency authorization (break-glass)** · M · Loop 2 · *evolution §4*
Deliberately high-friction path: justification, max actions, validity window, required approvals, compensating controls — plus a **retrospective review queue** that surfaces every grant for after-the-fact review. Ship the retrospective queue in the same release as the grant path; a break-glass without a review queue is just a bypass.

### P3 — Quality of life

**E19 · Command palette (⌘K)** · M · *fixes G12* — scoped entity search across contracts, runs, dispositions, identities, reviews, plus navigation. Replaces the prototype's naive substring filter (`App.tsx:19`) — which, notably, `Overview` and `NewEval` ignore entirely.
**E20 · Real empty / loading / error states** on every new surface, with optimistic rows and cancel for long operations · M
**E21 · Activity feed** — assurance runs, eval runs, drift events, approvals awaiting me · M
**E22 · Per-surface dirty state + autosave** · M · *fixes G11* — replaces the single global boolean
**E23 · Actionable summary cards** · S · *fixes G10* — each card click-throughs to its surface, filtered
**E24 · Environment scoping** · S — make the env switch scope data, or remove it (§4.2)
**E25 · Accessibility on new surfaces** · M — `aria-expanded` on expandable rows, `aria-live` for run status, keyboard nav for the delegation and drift graphs

---

## 7. Phasing

| Phase | Weeks | Contents | Exit criterion |
|---|---|---|---|
| **0 — Foundations** | 1–3 | E1, E2, E3, E4 | Every surface is linkable; a new user compiles a question within 60s of first load without publishing anything |
| **1 — Prove the decision** | 4–6 | E5, E16, E23 | Any disposition from the last 30 days can be opened by URL, its version pins read, and its evidence verified |
| **2 — Evaluation loop** | 7–11 | E6, E7, E8, E9, E10 | A 100-case gold set runs on demand, produces a gated pass/fail plus a baseline diff, and every failure routes to a real destination |
| **3 — Governance depth** | 12–17 | E11, E12, E13, E14, E17 | A formula change on a bound source produces a drift event whose counterfactual names the exact dispositions that would flip |
| **4 — Identity & autonomy** | 18–22 | E15, E18, E24 | Every disposition traces to a verified principal chain with scope and expiry; break-glass grants land in a retrospective queue |
| **5 — Polish** | ongoing | E19, E20, E21, E22, E25 | — |

Phase order deliberately follows the evolution doc's §8 correction — **identity cannot wait until the end** — but is pragmatic about it: E4 (declared purpose) and E5 (principal chain in the trail) land in Phases 0–1, and the full principal model in Phase 4. Purpose and the chain are what the compiler needs; the directory can follow.

---

## 8. Backend & type work implied

**New/changed API routes** (`apps/api/src/server.ts`, currently 17 routes):

| Route | Purpose | Item |
|---|---|---|
| `POST /v1/compile` — add `mode`, `purpose` | dry-run + declared purpose | E3, E4 |
| `GET /v1/dispositions`, `GET /v1/dispositions/:id` | persisted trail + detail | E5 |
| `POST /v1/attestations/verify` | honest verification (extends `/v1/keys/current`) | E16 |
| `GET/POST /v1/case-sets`, `/v1/case-sets/:id/cases` | gold datasets | E6 |
| `GET/POST /v1/eval/runs`, `GET /v1/eval/runs/:id` | eval execution + results | E7 |
| `GET /v1/eval/runs/:id/diff?baseline=` | baseline comparison | E8 |
| `GET /v1/reviews` — add workspace scope | cross-contract inbox | E12 |
| `GET/POST /v1/negative-decisions` | rejection registry | E13 |
| `GET /v1/drift`, `POST /v1/drift/:id/replay` | drift + counterfactual | E14 |
| `GET /v1/principals`, `/v1/delegations` | identity surface | E15 |
| `POST /v1/emergency-authorizations` | break-glass + retrospective | E18 |

**New types** (`packages/contracts/src/types.ts`): `DispositionRecord`, `CompilationRecord` (version pins), `EvalCase`, `CaseSet`, `EvalRun`, `EvalCaseResult`, `EvalGateResult`, `NegativeDecision`, `DriftEvent`, `CounterfactualResult`, `Principal`, `DelegationGrant`, `AutonomyTier`, `EmergencyAuthorization`, `Attestation`.

**Extended types**: `ReviewDecisionArtifact` (structured rejection, E13) · `ContextContract` (four-axis state, E11) · `SourceBinding` (source health + drift, E14) · `CompileRequest`/`CompileResponse` (mode + purpose + pins, E3/E4/E5).

**Persistence**: follows the existing file-backed store pattern (`apps/api/data/*.json`, `reviewStore.ts`, `assuranceStore.ts`, `executionStore.ts`) — no database, consistent with the deliberate product posture. Dispositions are the one volume risk; if the trail outgrows a JSON file, cap retention and archive rather than introducing a DB.

---

## 9. Disposition of the prototype codebase

`lattice-evaluation-platform-ui/` is a separate Vite app with its own React tree, its own primitives, and 863 lines of mock data. **Do not merge it.** Treat it as a spec:

1. **Port the three screens** — Dispositions detail (→ E5), Runs list + expansion (→ E7), Outliers-as-opportunities (→ E10) — into `apps/studio`, against real API data.
2. **Port `charts.tsx` selectively** (`Sparkline`, `AreaTrend`, `Donut`, `Histogram`, `Scatter`) — dependency-free SVG, consistent with the existing no-heavy-deps posture. Skip `RadarChart`; the Human-vs-Agent radar (`Overview.tsx:363`) compares six incommensurable dimensions on one polygon and invites false readings.
3. **Discard**: the mock data layer, `Sidebar`'s fake latency/throughput card, the footer's fabricated build metadata, the confidence estimator, the hard-coded delegation layout.
4. **Archive the prototype** under `docs/prototypes/` once the three screens land, so the reference survives without implying it is shippable code.

---

## 10. Explicitly not doing

- **Rebuilding the ontology builder.** Loop 1 works; this plan adds to it and does not disturb it.
- **Adopting `lattice-evolution.md` §7 as the navigation structure.** It is a document outline (§3.3.K).
- **Building LangSmith integration in Phase 2.** `lattice-eval.md` §5 is right that it fits, but the local deterministic harness (§9 Phase 1) must exist and be trusted first. LangSmith is a Phase 3+ decision.
- **A composite trust score** anywhere in the UI (§3.1.B).
- **Any fabricated metric**, however plausible-looking (§4.2).
- **Design-token work** — separate track.

---

## 11. Decisions needed before Phase 0 ships

1. **Personas.** Which of the five implied jobs (semantic owner · data steward · risk/compliance · platform engineer · agent owner) does v1 optimise for? E2's IA hinges on this, and the evolution doc names none (§3.3.J).
2. **Purpose taxonomy.** E4 needs a closed, enumerable list of declarable purposes per domain. Who owns it — the workspace, the contract, or a global registry?
3. **Disposition retention.** How long is the trail, and what is archived vs. deleted? Drives E5's storage and E14's counterfactual window.
4. **Approval routing semantics.** Parallel or sequential? Quorum? SLA and escalation? (§3.3.M — the top governance-bottleneck risk in `BV-improvements.md`.)
5. **Case-set ownership.** Are gold cases per contract, per workspace, or global — and who is allowed to promote a corrected case into the gold set (E10)?
