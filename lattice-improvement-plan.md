# Lattice — Functionality & UX Improvement Plan

_Assessment date: 2026-07-20 · Scope: `lattice/` (studio, api, packages)_

## 1. What Lattice is, and what it gets right

Lattice is an ontology-first "context compiler" for governed AI: an industry workspace owns a shared, versioned ontology, and Context Contracts layer decision-specific questions, bindings, policy, evidence, assurance, and releases on top. The compiler turns a question into one of four explicit outcomes — signed plan, clarification, approval requirement, or evidence-backed abstention.

The engineering is genuinely strong and should be **preserved**, not rewritten:

- Clean monorepo separation: pure `compiler-core`, `importer-core`, typed `contracts`, dependency-light `api`, React `studio`.
- Immutable, digest-backed releases / assurance runs / review artifacts with atomic JSON persistence and temp-file rename.
- Real governance semantics: authorship separated from approval, Ed25519 plan signing + verification, publish gates that re-check server-side so the UI can't bypass them.
- Deterministic ontology generation from form schemas with a provenance coverage report.
- Thoughtful appearance/i18n/accessibility groundwork (theme tokens, WCAG AA contrast, locale-aware dates/numbers).

The problems below are almost entirely about **onboarding friction, UX consistency, and finishing the wiring** — not about the core architecture.

---

## 2. Findings

### Theme A — Missing basic ontologies / hard to get started

| # | Finding | Evidence |
|---|---|---|
| A1 | **No universal/foundational ontology.** Every workspace is a full industry (financial services, energy, healthcare, manufacturing, legal, insurance). There is no generic "Core" foundation (Person, Organization, Document, Event, Location, Agent, Policy) to start from or to reuse across industries — which is exactly the "contracts before graphs, one core many packs" story the docs describe. | `seedGeneratedOntologies` in [registry.ts](apps/api/src/registry.ts) seeds only industry packs; no core pack. |
| A2 | **New contracts are empty scaffolding.** Starter entity types are created with `properties: []`, so a freshly created contract has type shells but no attributes, no bindings, no operations, no policies — the author faces a blank governance apparatus. | `starterSchema()` → every `type(...)` has `properties: []` ([registry.ts:390](apps/api/src/registry.ts)). |
| A3 | **Very high "time to first value."** Nothing compiles until a contract is *published*, and publishing requires approved entities **and** valid bindings **and** matching approved policies **and** passing assurance tests (`validateContract`). A new user cannot see the compile/clarify/abstain payoff without completing the entire 11-step loop first. | `validateContract` blockers in [registry.ts](apps/api/src/registry.ts); compile button disabled unless `releaseStatus === 'PUBLISHED'` in [RuntimeStudio.tsx:80](apps/studio/src/RuntimeStudio.tsx). |
| A4 | **No onboarding, tour, sample walkthrough, or empty-state guidance at the app level.** A grep for onboard/tour/welcome/getting-started/help finds nothing. The user lands directly on a draggable canvas for the counterparty-risk example with an 11-item governance nav and dense vocabulary (assurance, runtime approvals, policy profiles, evidence registry). | No onboarding component exists in `apps/studio/src`. |
| A5 | **Wizard starter set is inconsistent with the seeded packs.** The New Contract wizard offers `blank / healthcare / energy / software`, but the seeded workspaces are financial-services / energy / healthcare / manufacturing / legal / insurance. "Software" has no matching pack; manufacturing/legal/insurance aren't offered as starters. Inside a workspace the starter choice is suppressed entirely (forced to the shared ontology). | `starters` array in [NewContractWizard.tsx:22](apps/studio/src/NewContractWizard.tsx). |
| A6 | **Generated ontologies are shallow.** 4–8 entities each, ~75–87% field coverage, all `DRAFT` + `TEMPLATE_DERIVED`. Useful as a seed, but not a "basic ontology" a user can trust or learn from without heavy authoring. | [docs/generated-ontology-report.json](docs/generated-ontology-report.json). |

### Theme B — Inconsistent / messy UX

| # | Finding | Evidence |
|---|---|---|
| B1 | **Duplicate, always-both-active nav item (bug).** "Runtime map" and "Compiler" are two separate sidebar entries that both set/read `studioMode === 'runtime'`. They render the same view and **both highlight as active simultaneously**. One is effectively dead. | [App.tsx:183-184](apps/studio/src/App.tsx). |
| B2 | **i18n is half-wired.** ~6 major panels are hardcoded English — `ReviewQueueStudio`, `PolicyStudio`, `PolicyEditor`, `ReleaseManagementStudio`, `RuntimeApprovalStudio`, `EvidenceRegistryStudio` — while every other panel uses `t()`. Switching to Spanish leaves half the app in English. | e.g. literal `"Separate authorship from approval"` in [ReviewQueueStudio.tsx:115](apps/studio/src/ReviewQueueStudio.tsx); no `useMessages` import in those files. |
| B3 | **README overstates localization.** It claims the studio ships with `en-US`, `es-ES`, and `en-XA` catalogs; only `lang/en-US.json` exists, `es-ES.ts` exists as source, and there is no `en-XA`. Combined with B2, advertised locale support does not actually hold. | [README.md:39](README.md) vs. `apps/studio/lang/`. |
| B4 | **Ambiguous glyph iconography.** The nav uses abstract symbols (⌘ ◇ ⌁ ✓ ⇄ ◎ ◈ ◴ ⌂ ↗) with no legend, and the **same ⌘ glyph is reused** for both "Shared ontology" and the duplicate "Compiler." Hard to scan; meaning isn't learnable. | [App.tsx:179-193](apps/studio/src/App.tsx). |
| B5 | **Two overlapping ways to switch contracts.** A `<select>` contract switcher in the sidebar *and* the Contracts tile grid do the same job with different affordances and different metadata, with no indication they're the same action. | sidebar `contract-switcher` in [App.tsx:182](apps/studio/src/App.tsx) vs. [ContractsStudio.tsx](apps/studio/src/ContractsStudio.tsx). |
| B6 | **Inconsistent save model.** There is no global save; each panel has its own "Save draft" button (ontology, bindings, assurance, policy, review) placed differently, while the header only shows a passive "Draft saved / Unsaved" chip. Users can't predict where "save" lives. | per-panel save buttons across studios; header chip in [App.tsx:201](apps/studio/src/App.tsx). |
| B7 | **Native `window.confirm` for discard-changes** clashes with the otherwise custom, polished UI and can't be styled or localized consistently. | `selectContract` / `selectWorkspace` in [App.tsx:89,100](apps/studio/src/App.tsx). |
| B8 | **Mode-dependent summary cards.** The four summary cards silently change label, value, meta, and tone based on `studioMode` via deeply nested ternaries, so the same card position means different things in different views. | [App.tsx:204-209](apps/studio/src/App.tsx). |
| B9 | **Maintainability drag (dev-facing UX).** Header, nav, and summary sections are single massive JSX lines with 4–6-level nested ternaries. This is where B1/B8-class bugs hide. | [App.tsx:177,200,205-208](apps/studio/src/App.tsx). |

### Theme C — Components not fully wired

| # | Finding | Evidence |
|---|---|---|
| C1 | **Dead duplicate view** (see B1): the "Compiler" nav entry adds no destination of its own. | [App.tsx:184](apps/studio/src/App.tsx). |
| C2 | **Import Studio is only reachable inside the ontology canvas** (a button in `OntologyBuilder`), not from nav, and only in the ontology view — so schema import is undiscoverable from the contract-authoring flow it feeds. | `ImportStudio` referenced only by [OntologyBuilder.tsx:335](apps/studio/src/OntologyBuilder.tsx). |
| C3 | **"Manage release" appears only in the runtime header,** but Release History is also a nav item — two entry points, one conditional and easy to miss. | conditional button in [App.tsx:201](apps/studio/src/App.tsx). |
| C4 | **Binding "New" is gated on a non-obvious precondition** (every entity type has zero properties → button disabled) with no inline explanation of why. This is the A2 emptiness surfacing as a dead-looking control. | disabled condition in [SourceBindingStudio.tsx:110](apps/studio/src/SourceBindingStudio.tsx). |

---

## 3. Recommendations (prioritized)

### P0 — Quick, high-impact fixes (hours, not days)

1. **Delete the duplicate "Compiler" nav item** (B1/C1) or repoint it to a distinct destination. If a separate compiler surface is wanted, give it its own `studioMode`; otherwise merge into "Runtime map." _One-line fix in [App.tsx:184](apps/studio/src/App.tsx)._
2. **Fix the localization gap and README claim** (B3): either add the `es-ES.json`/`en-XA` catalogs the README promises, or correct the README to state en-US only. Pick one so docs match reality.
3. **Add labels to nav icons / stop reusing ⌘** (B4): pair each glyph with its existing text label consistently and give each item a unique icon.
4. **Explain gated controls inline** (C4): when "New binding" is disabled, show "Add properties to an entity type first →" linking to the ontology view.

### P1 — Onboarding & "basic ontologies" (the core of the user's concern)

5. **Ship a "Core" foundational ontology pack** (A1): a small, high-quality, *published* set of universal concepts (Person, Organization, Agent, Document, Event, Location, Asset, Policy) with real properties and relationships, marked `APPROVED`. New workspaces/contracts can extend it instead of starting blank. This is the missing "basic ontology" and directly supports the "one core, many packs" design principle.
6. **Give starters real properties** (A2): populate `starterSchema()` entity types with a few governed properties each (ids, labels, timestamps, key attributes) so a new contract is explorable immediately rather than an empty shell.
7. **Add a guided first-run experience** (A4): a dismissible welcome/tour that (a) explains the question→…→audit loop in one screen, (b) offers "Explore the published Grid Outage example" as a one-click path to a *working* compile, and (c) points to "Create your first contract." Empty states in each studio should teach the next action.
8. **Add a "Try it now" fast path** (A3): let users run the compiler against the **already-published** counterparty and grid examples from the first screen, before they author anything — so the payoff is visible in <60 seconds. (The examples already exist; just surface them.)
9. **Reconcile wizard starters with seeded packs** (A5): offer the same industries that actually ship (add manufacturing/legal/insurance, drop or implement "software"), and inside a workspace let the author pick a starting concept scope rather than forcing full/blank.

### P2 — UX consistency & wiring polish

10. **Unify the save model** (B6): a single, always-visible save affordance in the header that saves the active draft, with per-panel buttons removed or made secondary. Autosave-on-navigate would remove the discard prompt entirely.
11. **Replace `window.confirm`** (B7) with the existing modal/dialog styling and route the copy through `t()`.
12. **Complete i18n on the six hardcoded panels** (B2) so locale switching is coherent.
13. **Collapse the two contract-switching affordances** (B5): make the sidebar select and the Contracts grid visibly the same action (e.g., grid is the "manage" view, select is the quick-switch), or drop one.
14. **Surface Import Studio from nav** (C2) or from the Bindings/Contracts flow, not only the canvas.
15. **Refactor `App.tsx` view/label logic** (B8/B9): extract a `studioMode → {title, icon, summaryCards}` config map instead of inline nested ternaries. Kills a class of "both active"/"wrong label" bugs and makes the nav data-driven.

---

## 4. Suggested sequencing

| Phase | Focus | Items |
|---|---|---|
| **Phase 1 (this week)** | Stop the bleeding | P0 #1–4 + P2 #15 (App.tsx refactor makes the rest safe) |
| **Phase 2** | Lower the floor | P1 #5–8 (core pack, real starter props, first-run tour, "try it now") |
| **Phase 3** | Consistency | P1 #9, P2 #10–14 |

**North-star metric:** time from first launch to a first successful `compile` result. Today that requires the full authoring loop; the goal is to make it a single click against a published example, with a clear, guided path to authoring your own afterward.

---

## 5. Notes / assumptions

- This review is static (code + docs); I did not run the studio, so severity on visual-only items (B4, B8) is estimated from source.
- All file/line references are to the state of `lattice/` at the assessment date and may shift as the code changes.
- Nothing here proposes changing the core architecture, the governance model, or the release/signing guarantees — those are the product's strongest assets.
