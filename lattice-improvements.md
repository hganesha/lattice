# Lattice — Critical Product Review & Improvement Plan

_Assessment date: 2026-07-20 · Scope: `lattice/` (studio, api, packages, docs) · Method: full source review, test run (38/38 pass), feature comparison against [microsoft/Ontology-Playground](https://github.com/microsoft/Ontology-Playground)_

---

## 1. Executive verdict

Lattice's stated ambition is to **exceed the Microsoft Ontology Playground**. Today it does — but only on one axis, and it loses on the others.

- **Where Lattice already wins decisively:** governance and runtime. Microsoft's playground is a static learning toy — draw an ontology, export RDF, read a course. Lattice has an actual runtime: signed Ed25519 execution plans, immutable digest-backed releases, separation of authorship and approval, policy-gated compilation, evidence freshness enforcement, clarification/abstention as first-class outcomes, replay-protected execution receipts. Nothing in the Microsoft app is within years of this. The 38-test suite passing cleanly, the atomic temp-file-rename persistence, and the identity-in-body rejection ([server.ts:498](apps/api/src/server.ts)) show real engineering discipline.
- **Where Microsoft still wins:** approachability, standards interoperability, shareability, and learning. Their app round-trips RDF/XML (OWL classes, datatype/object properties, cardinalities), exports in the exact format Fabric IQ ingests, has a browsable community catalogue with deep links, an embeddable widget, 50-level undo/redo, a command palette, and a nine-course "Ontology School." Lattice has **none** of these: no RDF/OWL import or export anywhere in the codebase, no undo in the canvas, no shareable artifact that works without running two local servers, and a single welcome screen standing in for education.
- **The honest framing:** Lattice is not currently a better ontology playground; it is a much better ontology *product* wrapped in a harder-to-enter surface. "Exceeding the playground" requires winning the first ten minutes *and* the standards story, not just the enterprise depth. The good news: the gaps are additive features, not architectural rework. The architecture — pure compiler, trust-boundary API, contracts-before-graphs — is the right skeleton and should not change.

Credit where due: nearly every P0/P1 item from the previous improvement plan has landed. The published, property-bearing Core ontology ([coreOntology.ts](packages/contracts/src/coreOntology.ts)) with per-industry composition ([registry.ts:521](apps/api/src/registry.ts)), the Welcome Studio with one-click compile against published examples ([WelcomeStudio.tsx](apps/studio/src/WelcomeStudio.tsx)), data-driven navigation, a unified header save, a real ConfirmDialog, Import in the nav, API health indicator, and a fully translated es-ES catalog (749/749 keys) plus an en-XA pseudo-locale — all real, all verified in source. That iteration speed is itself an asset.

---

## 2. Head-to-head: Lattice vs. Microsoft Ontology Playground

| Capability | MS Playground | Lattice today | Verdict |
|---|---|---|---|
| Visual ontology editor (typed properties, cardinality) | Yes | Yes, plus groups/impact/evidence status | **Lattice** |
| Undo/redo | 50 levels | None | **MS** |
| Command palette / keyboard shortcuts | Yes | None (one Enter handler; the ⌘↵ hint on the compile button isn't even wired — see §4.3) | **MS** |
| RDF/XML + OWL round-trip import/export | Yes, Fabric-IQ-validated | **Absent entirely** | **MS, badly** |
| Schema import | RDF/OWL only | OpenAPI + JSON Schema with checksums, collision resolution, provenance | **Lattice** (different lane) |
| Pre-built catalogue | 6 official + community PRs | 7 generated industry packs + Core, provenance-backed | **Tie**; Lattice deeper, MS more browsable/contributable |
| Sharing | Zero-backend deep links + embeddable widget | `?contract=` URL that requires both local servers running | **MS** |
| Learning content | 9 courses, quizzes, presentation mode | One welcome modal | **MS** |
| Natural-language querying | Toy NL2Ontology preview | Deterministic compiler with typed outcomes — but lexical-only resolution (§4.1) | **Lattice on rigor, MS on forgiveness** |
| Governance, versioning, signing, evidence, policy, assurance | None | Extensive and tested | **Lattice, no contest** |
| Runs without install | Static site | Requires Node 22, pnpm, two processes | **MS** |
| AI-assisted ontology building | On roadmap, disabled | Absent | **Open lane — winnable** |

---

## 3. Strategic gaps (these decide whether "exceed" is true)

### 3.1 No standards interop is disqualifying for an ontology product — P0

`grep -ri "rdf|owl|turtle|sparql"` across studio and packages returns nothing. The only export is a raw contract-JSON download ([OntologyBuilder.tsx:298](apps/studio/src/OntologyBuilder.tsx:298)). An ontology tool that cannot speak OWL/RDF will be dismissed by exactly the audience that evaluates ontology tools, and it cannot claim superiority over a tool whose headline feature is Fabric-IQ-validated RDF round-trip.

**Recommendation — and the judo move:** implement RDF/XML (and Turtle) export of the shared ontology, then go one further than Microsoft: **export in the exact profile Fabric IQ ingests**. That repositions Lattice as *the governed authoring surface that can target Microsoft's own runtime* — you exceed the playground by making it optional. Import is second priority (map OWL classes → entity types, datatype properties → properties, object properties → relationships; route through the existing Import Studio proposal/collision pipeline so imports stay evidence-backed). The importer-core proposal architecture ([importer.ts](packages/importer-core/src/importer.ts)) is already the right seam; this is a new adapter, not a new system.

### 3.2 Nothing shareable exists — P0

Microsoft's ontologies travel: deep links, embed widget, zero backend. A Lattice contract cannot be shown to a colleague without them installing Node 22 and running `pnpm dev`. For a product trying to build mindshare, this is a growth ceiling.

**Recommendation:** a **static snapshot export** — one self-contained HTML file rendering the ontology graph, contract summary, competency questions, policy table, and release history, read-only. This fits the deliberately database-free ethos perfectly (it's just a file), is a weekend of work given the render components already exist, and gives every published release a durable, mailable artifact. Later, a hosted read-only viewer; the file format comes first.

### 3.3 The compiler's resolution quality will embarrass the compiler's governance — P0

The entire runtime pitch rests on `ContextCompiler`, and its two resolution steps are demo-grade:

- Operation selection is keyword-substring scoring ([compiler.ts:173](packages/compiler-core/src/compiler.ts:173)) — a question phrased differently from the authored keywords silently becomes `NO_SUPPORTED_OPERATION`.
- Entity resolution is token-overlap on labels/aliases ([compiler.ts:189](packages/compiler-core/src/compiler.ts:189)).

Determinism here is a *feature* — the guardrail spine should stay exact. But every real user's third question will abstain, and they will conclude the product doesn't work, not that their phrasing was off. The architecture doc already names "governed hybrid resolution with explainable candidate scores" as the production direction; it needs to be pulled forward because it is the demo-killer, not a scaling concern.

**Recommendation:** (a) define a `Resolver` interface in compiler-core now, with the lexical resolver as the default implementation; (b) add an optional embedding/LLM candidate-proposal stage whose output is *only ever* a ranked candidate list that the deterministic policy/evidence gates then accept, clarify on, or reject — AI proposes, the contract disposes. This preserves every governance guarantee while fixing recall. (c) Return the near-miss scores in `UNSUPPORTED`/`INSUFFICIENT_EVIDENCE` responses ("closest operation: exposure_summary, score 0.4") so failures teach instead of stonewalling.

### 3.4 AI-assisted authoring is an open lane Microsoft has conspicuously not shipped — P1

Their AI ontology builder is on the roadmap, disabled by default. Lattice has a structurally *better* place to put AI than they ever will: the Import Studio already treats external schemas as **evidence-backed proposals requiring review** ([architecture.md](docs/architecture.md), "Governed schema ingestion"). An LLM that drafts entity types, relationships, and competency questions from a plain-language domain description — emitted through that same proposal/collision/approval pipeline — is AI assistance that is *auditable by construction*. That's a story no playground can match: "AI drafts, governance decides." This should be the flagship differentiator of the next milestone.

### 3.5 Education is a single modal for a product with 10× the conceptual load — P1

Microsoft ships nine progressive courses for a tool whose whole vocabulary is "entity, property, relationship." Lattice asks users to internalize contracts, concept scopes, bindings, evidence strength, freshness windows, risk tiers, assurance gates, review separation, releases, and suspension — and offers a four-step welcome modal. The need scales with the concept count; the investment is currently inverted.

**Recommendation:** guided walkthroughs *built on the shipped examples* — "trace the grid outage from question to signed plan" as an interactive annotated tour (each governance nav item explains itself the first time with the example's real data), plus empty-state coaching per studio. Keep it in-product; a docs site can wait.

---

## 4. Product and engineering findings

### 4.1 The blank-starter path still creates an empty shell — P1 (carried over, unfixed)

`starterSchema('blank')` returns zero entity types and zero relationships, and the non-blank starters still create every type with `properties: []` ([registry.ts:388-453](apps/api/src/registry.ts:388)). A user who creates a standalone blank contract gets a canvas with nothing on it and a publish gate that will eventually tell them "At least one entity type is required." Inside a workspace the concept-scope picker mostly rescues this — but the starter cards (blank/healthcare/energy/software) also still don't match the seeded industry packs (financial-services/energy/healthcare/manufacturing/legal/insurance + core). Either populate the starters with governed properties (the Core `property()` helper makes this ~30 lines each) or default standalone creation to extend `workspace-core`, which now exists and is published.

### 4.2 There is no way to see *your own* data in the runtime map — P1

The runtime map's payoff moment — resolve, traverse `AFFECTED_ASSET`, signed plan — only exists for the two authored examples. `loadGridOutageExample` is hardcoded to the grid contract ([RuntimeStudio.tsx:29](apps/studio/src/RuntimeStudio.tsx:29)); a user's own contract has `entities: []` forever until they hand-author instance records, and no UI path creates them from a binding. The bindings preview already discovers response fields and tabular schemas — let it **materialize sample entities** (from a pasted sample payload or declared schema defaults) as `TEMPLATE_DERIVED` evidence-status records, so every author reaches "my question compiled against my objects" without waiting for live connector dispatch. This is the single highest-leverage activation fix.

### 4.3 Canvas parity debts — P1

- **No undo/redo.** A destructive mis-drag or accidental type deletion is unrecoverable short of discarding the draft. Match Microsoft's 50 steps; a bounded command stack over the contract draft is straightforward since state is already immutable-update-shaped.
- **No canvas search/filter.** Composed ontologies (Core + industry) are already ~12–20 types; imported real-world schemas will be hundreds. There is no way to find a node except visually.
- **The compile button advertises `⌘↵` but only plain Enter on the input is bound** ([RuntimeStudio.tsx:79-80](apps/studio/src/RuntimeStudio.tsx:79)). Wire the accelerator or drop the hint — an unwired shortcut hint quietly tells power users the polish is cosmetic.
- No keyboard-driven node manipulation or command palette; fast-follow after undo.

### 4.4 File-store integrity: light is fine, lossy is not — P1

Staying database-free is a legitimate choice and the atomic tmp-write-rename queue ([registry.ts:253](apps/api/src/registry.ts:253)) is well built. But three hazards exist *within* the no-database constraint:

1. **No optimistic concurrency.** `PUT /v1/contracts/:id` accepts any draft unconditionally. Two browser tabs (or two teammates on a shared instance) silently clobber each other — last write wins on a product whose entire brand is immutability and auditability. Add a `baseUpdatedAt`/digest precondition and return 409 on mismatch. Cheap, and it defines the semantics the future database must honor.
2. **Whole-registry rewrite on every save.** One JSON document holding every contract, release, and workspace is rewritten per mutation. Immutable releases deserve append-only or content-addressed per-release files (`data/releases/<digest>.json`) — this also makes the immutability claim *structural* rather than conventional, and shrinks the blast radius of a corrupt write.
3. **Dual source of truth for the draft.** The studio boots from `localStorage['lattice:contract-draft']` before the registry fetch resolves ([App.tsx:347](apps/studio/src/App.tsx:347)) and mirrors into localStorage on every change. A stale local copy can flash, and divergence between the two is unreconciled. Treat the server as authoritative, localStorage as a boot-time hint only, and drop the mirror writes once a conflict check exists.

Do all three now and the eventual database/store migration becomes an implementation swap behind an already-correct interface, instead of a semantics change.

### 4.5 Remaining UX consistency debts — P2

- **[App.tsx](apps/studio/src/App.tsx) single-line JSX monoliths persist** (header at line 305, summary cards 309–312, the entire eleven-way view switch at 316). The nav refactor proved the config-map pattern works; finish the job for the summary cards (mode → card config) and the view switch (mode → component map). This is where the last review's "both nav items active" class of bug lived; the remaining ternary nests are the same trap.
- **Contract-switching is still doubled** — sidebar workspace `<select>` plus the Contracts grid, with different metadata and no signposted relationship.
- The presentational components without `useMessages` (SummaryCard, NavItem, etc.) are fine — they take translated props — but `WorkspaceOntologyStudio` should be spot-checked for literals since it's a full studio.
- **README claims to verify:** it promises `pnpm --filter @lattice/studio i18n:check`; keep that green in CI so the 749/749 catalog parity doesn't rot, and note that `pnpm` isn't on PATH in a fresh shell here (works via `npx pnpm`) — a `corepack enable` line in the README would remove a first-run stumble.

### 4.6 Things to explicitly *not* do

- Don't rewrite the deterministic compiler to be "smarter" internally — bolt intelligence on as a candidate proposer (§3.3) and keep the core auditable.
- Don't add a database yet. §4.4's fixes buy the headroom; a store should arrive with multi-tenancy, not before.
- Don't chase Microsoft's gamification (quests, badges). Lattice's audience is practitioners; guided traces of real examples out-teach badges.
- Don't soften the publish gates to reduce friction — the friction fix is better starters, sample entities, and teaching, not weaker governance.

---

## 5. Prioritized roadmap

| Priority | Item | Section | Effort | Why it's ordered here |
|---|---|---|---|---|
| **P0** | RDF/XML + Turtle export, Fabric-IQ-compatible profile | 3.1 | Medium | Table stakes for credibility; the "target their runtime" story |
| **P0** | Resolver interface + near-miss explanations in failure payloads | 3.3 | Medium | The demo-killer; protects the runtime pitch |
| **P0** | Optimistic-concurrency precondition on draft PUT | 4.4 | Small | Data-loss class; defines future store semantics |
| **P0** | Wire or remove the ⌘↵ hint; canvas undo/redo | 4.3 | Small/Medium | Cheapest credibility repairs on the authoring surface |
| **P1** | Static single-file snapshot export (shareable artifact) | 3.2 | Medium | Growth ceiling; fits the no-database ethos |
| **P1** | Sample-entity materialization from bindings | 4.2 | Medium | Highest-leverage activation fix |
| **P1** | Populated starters / default-extend Core for standalone contracts | 4.1 | Small | Carried over from last plan; still the blank-shell trap |
| **P1** | LLM-drafted ontology proposals through the governed import pipeline | 3.4 | Large | The flagship differentiator; ship after export/resolver so it lands on a credible base |
| **P1** | Guided example-trace walkthroughs + per-studio empty-state coaching | 3.5 | Medium | Concept load demands it; reuses shipped examples |
| **P2** | RDF/OWL *import* adapter | 3.1 | Medium | After export proves the mapping |
| **P2** | Per-release content-addressed files; localStorage demotion | 4.4 | Medium | Structural immutability |
| **P2** | App.tsx summary-card/view-switch config maps; collapse dual contract switcher | 4.5 | Small | Finish the proven refactor |
| **P2** | Canvas search/filter, command palette | 4.3 | Medium | Needed before large imported ontologies arrive |

**North-star metrics.** Keep the previous plan's activation metric — time from first launch to first successful compile (the Welcome Studio has largely won this; protect it). Add two: **time from blank contract to a compiled question against the user's own entities** (currently effectively infinite — §4.2 is the fix), and **exported artifacts per published release** (zero today; §3.1/§3.2 create the loop that makes Lattice ontologies travel).

---

## 6. Bottom line

The previous review said the architecture was the asset and the wiring was the debt; the team then paid down almost all of that debt in days — the Core pack, the welcome flow, i18n, nav, and save-model fixes are all in and tested. The remaining distance to "exceeds the Microsoft Ontology Playground" is no longer polish. It is four strategic bets: **speak the standards (RDF/OWL out, then in), make ontologies travel (static snapshot export), make the compiler forgiving without making it less deterministic (pluggable resolver + explanations), and let AI draft inside the governance loop instead of around it.** Land those four and the comparison inverts permanently: Microsoft has a classroom; Lattice has a classroom *and* a courtroom *and* a runtime — and can export homework their runtime accepts.
