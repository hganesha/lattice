# Lattice — SOTA UX Plan

**Supersedes:** `supabase/migrations/lattice-UX-sota.md`
**Date:** 2026-08-08
**Branch context:** `ux/design-system-consolidation`
**Status:** implemented — all six phases landed. See §9 for what shipped and what changed along the way.

---

## 0. Summary

The prior review looked at a handful of screens and concluded Lattice needs a *visual* refresh — glassmorphism, a new palette, Lottie icons, a D3 rewrite. Reading the actual source tells a different story. Lattice already has the things that review says are missing: a token system, light and dark themes, a command palette, an interactive graph engine, 264 ARIA attributes, reduced-motion handling.

What it does not have is **one cascade**. The studio ships two stylesheets that fight each other: a legacy layer authored at 6–8px with 403 hardcoded hex values, and a 610-line correction layer that stamps 163 `!important` declarations on top to make the app legible again. Every symptom the prior review catalogued — flat hierarchy, cramped density, muted colour, inconsistent typography — is a downstream effect of that one fact.

So this plan does not propose a redesign. It proposes **finishing the design system that is already half-built**, and it names the specific mechanism that has been blocking it. The visual result will read as a new design language, because for the first time the intended one will actually reach the screen.

---

## 1. Verdict on the prior review

### 1.1 Claims that are factually wrong

| Claim | Reality |
|---|---|
| "Replace Tailwind CSS with a custom design system" | There is no Tailwind. The studio is hand-authored CSS across 17 files. The recommendation's first phase is not executable. |
| "No dark mode" | Both themes ship. `appearance.css:47-106` defines full `[data-theme="dark"]` and `[data-theme="light"]` token sets with `color-scheme` set correctly. |
| "No keyboard shortcuts" / "add a command palette (Ctrl+K)" | `CommandPalette.tsx` exists and is wired to ⌘K in `App.tsx:474`. |
| "No screen reader support / missing ARIA labels" | 264 ARIA attributes across the studio: 100 `aria-label`, 56 `aria-hidden`, 21 `aria-pressed`, 18 `aria-expanded`, 17 `aria-live`, 15 `aria-modal`. `@axe-core/playwright` is already a dev dependency. |
| "Replace the static graph with a zoomable, draggable D3 force graph" | The graph is already `@xyflow/react` (React Flow) in `OntologyBuilder.tsx` and `RuntimeGraph.tsx`. Zoom, pan, drag, minimap and controls are live. Swapping to D3 would be a regression. |
| "No adaptive layouts" | Breakpoints exist at 1250px, 1300px and 1800px, plus a collapsible sidebar (`.nav-collapsed`) and collapsible inspectors. |
| "No animated transitions" | Toast, drawer and carousel animations exist, each already gated behind `prefers-reduced-motion`. |

### 1.2 Recommendations to reject on merit

- **Glassmorphism.** Lattice is a governance and assurance tool. Its screens carry attestations, hash chains, approval decisions and evidence digests. Translucency reduces text contrast and makes state ambiguous — exactly the wrong trade for a surface where a user is deciding whether to approve a runtime action. There is already one justified use (`.canvas-layout-controls`, a floating toolbar over a canvas). That is where it stops.
- **A vibrant teal + purple palette.** The proposed swap discards a distinctive brand and, worse, reintroduces the problem we are fixing: colour used for decoration rather than meaning. Note that `--governance` is *already* violet and carries semantic weight; a purple accent would collide with it.
- **Lottie animated icons.** The icon set is inlined Lucide (`icons.tsx`). Inline SVG is faster, themeable via `currentColor`, and accessible. Lottie adds a runtime dependency and animation on elements that should be quiet.
- **Multiplayer cursors.** A significant backend commitment (CRDT or OT, presence, conflict resolution) justified in the review by a screenshot. Nothing in the current product signals concurrent editing of the same contract as a live pain point. Revisit when there is demand evidence.
- **Heatmaps of frequently edited fields.** Solves no stated user problem and requires interaction telemetry the product does not collect.

### 1.3 What the review got right

Three findings survive, and they are the real ones:

1. **Density is too high.** Correct, and more severe than described.
2. **Typographic hierarchy is flat.** Correct — and there is a precise mechanical cause, identified below.
3. **Empty states under-guide.** Correct. `SurfaceState.tsx` is a good primitive with incomplete adoption.

The review was right about the symptoms and wrong about the disease.

---

## 2. The actual root cause

### 2.1 Two stylesheets, one cascade

`main.tsx` imports `styles.css` first (line 7) and `appearance.css` last (line 22), after all fourteen surface stylesheets. `appearance.css` is not a theme. It is a correction layer whose job is to overpower everything loaded before it.

| Metric | `styles.css` | `appearance.css` |
|---|---|---|
| Hardcoded hex values | 403 | 66 |
| `!important` declarations | 17 | 163 |
| Role | authored UI | overrides the authored UI |

Across all studio CSS there are **377 distinct hex colour values** — for a product with roughly 34 semantic colour tokens already defined.

### 2.2 The app is authored at 6–8px

Counting every size literal in the studio's CSS:

| Authored size | Occurrences |
|---|---|
| 6px | 113 |
| 7px | 172 |
| 8px | 98 |
| 9px | 33 |
| 12px and above | ~60 combined |

The two most common font sizes in the entire codebase are **7px and 6px**. Those sizes never render, because `appearance.css:118-120` catches them:

```css
:where(button,input,textarea,select) { font-size: var(--ui-body-size) !important; }
:where(p,label,small,code,time,dt,dd)  { font-size: var(--ui-font-min) !important; }
:where(.eyebrow,.panel-kicker,.nav-label,.summary-label,.preference-label) { font-size: var(--ui-meta-size) !important; }
```

**This is the mechanism behind the flat hierarchy.** Line 119 collapses seven semantically distinct elements — paragraphs, labels, captions, code, timestamps, definition terms and definition descriptions — to a single size, with `!important`, so nothing downstream can differentiate them. A paragraph of explanatory prose and a monospace hash digest render at identical size by construction.

You cannot build a type hierarchy while that rule exists. Any new ramp added on top will be overridden by it. **Deleting these three lines is the precondition for every typographic improvement in this plan** — and it cannot be done safely until the 6px and 7px literals underneath are gone, because deleting the guardrail without fixing the floor makes the app unreadable. That ordering constraint drives the phasing in §5.

### 2.3 One visual concept, twenty-six class names

`appearance.css:230` is a single rule whose selector list reads:

> `.property-row, .relation-chip, .release-list>div, .type-history-list article, .evidence-item, .test-card, .runtime-approval-card, .execution-receipt-card, .contract-tile, .binding-card, .binding-stat, .connector-tile, .mapping-row, .assurance-check, .question-link-row, .review-claim, .review-metric, .policy-card, .policy-coverage, .evidence-row, .evidence-source-card, .release-card, .change-grid article, .starter-card, .question-draft, .candidate-list button`

Twenty-six class names describing **one thing**: a bordered card on a raised surface. The existence of this rule is proof the concept is shared; the twenty-six names are proof it was never extracted. The same pattern repeats at `appearance.css:155`, where **twelve** hero and toolbar classes receive identical treatment — thirteen distinct ways to draw a page header, counting `.surface-hero`.

This is the density problem. Twenty-six independently-tuned paddings cannot produce a consistent rhythm, and no amount of whitespace guidance fixes it while the primitives stay separate.

### 2.4 What is already right

`surface-kit.css` is exactly the target architecture: 54 lines, zero `!important`, zero hex literals, every value a token. It is adopted by 14 of 24 studio views. **The plan is to make the rest of the app look like this file.** It is not a rewrite — it is a migration whose destination already exists and already works.

---

## 3. The design language: *Quiet Instrument*

Lattice is an instrument for regulated work. Its users read attestations, compare evaluation runs and sign off on runtime actions. The interface should behave like precision equipment: calm by default, legible under fatigue, expressive only where meaning demands it.

Five rules follow.

### Rule 1 — Type carries hierarchy; nothing else does

A role-based ramp, applied by class rather than element. Roles are semantic, so a `<p>` of prose and a `<code>` digest can finally differ.

| Role | Size / line-height | Family, weight | Use |
|---|---|---|---|
| `display` | 30 / 1.15 | Manrope 600 | Page title. One per screen. |
| `title` | 20 / 1.30 | Manrope 600 | Panel and section headings. |
| `subtitle` | 16 / 1.40 | Manrope 600 | Card headings, group labels. |
| `body` | 14 / **1.60** | Inter 400 | Default. Prose, form values. |
| `body-strong` | 14 / 1.60 | Inter 600 | Emphasis within body. |
| `secondary` | 13 / 1.55 | Inter 400 | Supporting copy, table cells. |
| `meta` | 12 / 1.40 | DM Mono 500 | Labels, timestamps, identifiers. |
| `micro` | 11 / 1.30 | DM Mono 500 | Badges only. Never prose. |

Changes from the ramp currently declared in `appearance.css:11-16`:

- **Body line-height rises 1.45 → 1.60.** The single highest-yield readability change in this plan, and nearly free.
- **12px becomes a hard floor for anything a user reads.** 11px survives only inside badges, where the content is one or two words.
- **Roles replace elements.** The ramp exists today but is unreachable behind the `!important` blanket; this makes it addressable.
- **Prose caps at 68ch.** `surface-kit.css` already does this at 74ch; tightening it slightly improves scan-back accuracy.

### Rule 2 — Colour means state, never decoration

The brand lime currently signals brand identity, success, selection, active navigation and approval — five meanings on one hue, which is why nothing reads as urgent. `appearance.css:61` already began decoupling this ("*so success ≠ brand ≠ selection*"). Finish it, and make the separation binding:

| Token | Reserved for |
|---|---|
| `--accent` | Brand identity and primary action. **Never** a state. |
| `--success` | Passed gates, verified attestations, healthy connectors. |
| `--warning` | Drift, pending approval, degraded state. |
| `--danger` | Failures, rejections, destructive actions. |
| `--info` | Neutral system messaging. |
| `--selection` | Current selection and focus. Distinct from accent. |
| `--governance` | Governance-scoped objects. Already violet; keep. |

Every hue gets a `-soft` background pair, all of which already exist. The work is deletion — retiring 377 hex literals down to these tokens — not invention.

### Rule 3 — Three elevations, two shadows, no glow

Today there are five background tiers and shadows ranging from `0 4px 12px` to `0 35px 100px`, plus lime glow rings such as `box-shadow: 0 0 0 1px #a7e92c, 0 0 20px #a7e918` on selection. The glows are the loudest thing on screen and carry no information a border cannot.

- **Elevations:** `--canvas` → `--surface` → `--surface-raised`. Three. `--surface-soft` is retained but repurposed strictly as an *inset* fill (wells, disabled fields), not a fourth tier.
- **Shadows:** two only — `--shadow-raised` for cards that lift, `--shadow-overlay` for modals and drawers.
- **Glows:** removed. Selection is communicated by a 2px `--selection` border plus a `--selection-soft` fill. This reads more clearly and passes contrast checks that a glow cannot.
- **Borders:** `--border` for containers, `--border-strong` for interactive controls. Currently the two are used interchangeably, which is why control affordance is weak.

### Rule 4 — Space groups meaning

The current spacing scale (4/8/12/16/24/32) is sound; the problem is that nearly everything uses 8px or 12px, so no grouping is perceptible. Proximity is what makes a dense screen readable — not uniform air.

| Gap | Between |
|---|---|
| `--space-1` (4) | A label and its value |
| `--space-2` (8) | Items inside one group |
| `--space-3` (12) | Rows in a list |
| `--space-4` (16) | Cards in a grid |
| `--space-6` (32) | Sections within a page |
| `--space-7` (48) — *new* | Major regions |

Card padding standardises at `--space-4` (16px), up from the current 9–11px. Row height floors at 44px for anything clickable, which also satisfies pointer-target guidance.

### Rule 5 — Density is a mode, not a default

The comfortable default above costs vertical space, and some surfaces — the execution ledger, the activity feed, the evaluation run list — are legitimately dense operator views. Rather than compromising the default, extend the existing text-scale control into a proper density switch:

- **Comfortable** (default): the values above.
- **Compact**: `--space-*` steps down one, row floor 36px, `secondary` replaces `body` in tables. Type sizes hold — compact means less space, never smaller text.

This reuses the `data-text-scale` mechanism already in `appearance.css:41`, so it is a rename and an extension rather than new machinery.

---

## 4. Screen-level rejig

### 4.1 One page template

Every surface resolves to the same skeleton, already prototyped in `surface-kit.css`:

```
surface-hero      title + one-line purpose + primary action
surface-metrics   at most 4, each clickable or deleted
surface-filters   optional
content           table, grid or canvas
surface-state     empty / loading / error
```

Consolidations this forces:

| Today | After |
|---|---|
| 13 hero/toolbar classes (`appearance.css:155`) | `.surface-hero` |
| 26 card-row classes (`appearance.css:230`) | `.surface-row` |
| Per-surface metric blocks | `.surface-metric`, capped at 4 |
| Ad-hoc empty states | `SurfaceState` everywhere |

The metric cap matters. Unbounded metric strips are how a screen becomes dense without becoming informative. **Rule: a metric must be clickable — filtering the content below to what it counts — or it is prose and belongs in the hero.** This also delivers the prior review's "interactive metrics" idea, which was its best suggestion; `.surface-metric.actionable` already implements the interaction.

### 4.2 Navigation: 22 destinations, 8 visible

`router.ts` defines 22 surfaces across five groups (Build, Operate, Govern, Assure, Identity). All render flat in the sidebar. That is a long undifferentiated list, and it is the navigation half of the density complaint.

- Groups become an accordion; only the active group expands. Visible items drop from 22 to roughly 8.
- Group state persists per workspace.
- ⌘K carries the long tail — it already searches surfaces, so direct navigation to a collapsed group costs one keystroke.
- The active item keeps its inset accent bar; the accordion header shows a count badge when collapsed so pending work stays visible.

This preserves every destination while cutting the standing visual load by two-thirds.

### 4.3 Breadcrumbs, scoped tightly

The prior review asked for global breadcrumbs. Most Lattice surfaces are one level deep, where a breadcrumb is noise. Add them only where genuine nesting exists — contract editor, ontology bindings, evaluation run detail — rendered as a `meta`-role line above the hero title.

### 4.4 Focus and motion

- Focus ring drops from `3px` (`appearance.css:121`) to `2px` `--selection` with a 2px offset. At 3px the ring visually merges with adjacent controls on dense rows.
- Motion budget: 120–180ms, ease-out, opacity and 4–8px transforms only. No layout-animating properties. Every rule stays behind the existing `prefers-reduced-motion` guard.

---

## 5. Phased plan

Sequencing is dictated by §2.2: the `!important` blanket cannot be removed before the sub-12px literals beneath it are gone. Each phase ships independently and leaves the app releasable.

### Phase 0 — Guardrails (before any visual change)

Nothing here changes a pixel. It makes every later phase verifiable.

- Capture Playwright screenshot baselines for all 22 surfaces in both themes. `@playwright/test` and `test:e2e:update` already exist.
- Add Stylelint with three rules that encode this plan:
  - no hex literals outside the token file,
  - no `!important` outside a designated legacy file,
  - no font-size below 12px.
- Wire `@axe-core/playwright` — already a dependency — into CI for contrast and label regressions.
- Land the rules as warnings first so the baseline is visible without blocking.

**Exit:** CI reports current violation counts (expect 377 hex, 208 `!important`, 461 sub-12px). These numbers become the burn-down.

### Phase 1 — Invert the cascade with `@layer`

The highest-leverage change in the plan, and among the lowest risk.

```css
@layer reset, tokens, primitives, surfaces, overrides;
```

Assign `styles.css` to `surfaces`, `surface-kit.css` to `primitives`, tokens to `tokens`. Layer order then guarantees precedence independently of specificity — which means **the 163 `!important` declarations in `appearance.css` become unnecessary and can be deleted mechanically**, without touching a single value.

- Risk: low. Layer order is deterministic and baseline-tested by Phase 0.
- Payoff: the correction layer stops being a correction layer. Later phases edit values instead of fighting specificity.

**Exit:** `!important` count under 20; screenshots unchanged.

### Phase 2 — Type and spacing

- Replace the 6/7/8/9px literals with role classes, surface by surface, verifying against baselines.
- Once a surface is clean, remove its coverage from the `appearance.css:118-120` blanket.
- Delete the blanket entirely when the last surface lands.
- Raise body line-height to 1.60; apply the 68ch prose cap; standardise card padding to 16px.

**Exit:** zero sub-12px literals; blanket element overrides deleted; the ramp in §3 is the only source of type size.

### Phase 3 — Primitive consolidation

- Extract `.surface-row`; migrate the 26 classes onto it, keeping legacy names as thin aliases during migration.
- Collapse the 13 hero variants to `.surface-hero`.
- Bring the remaining 10 of 24 views onto `SurfaceState`.
- Retire glow shadows in favour of the border-plus-fill selection treatment.
- Burn down the 377 hex literals to the token set.

**Exit:** zero hex outside tokens; `styles.css` substantially smaller; one row primitive, one hero primitive.

### Phase 4 — Navigation and density

- Accordion sidebar with persisted group state and collapsed-group count badges.
- Comfortable/Compact density mode extending `data-text-scale`.
- Scoped breadcrumbs on the three genuinely nested surfaces.
- Metric audit: every metric becomes actionable or is removed.

**Exit:** ~8 visible nav items; density mode switchable; no inert metrics.

### Phase 5 — Motion and polish

- Apply the motion budget uniformly; audit every animation for the reduced-motion guard.
- Focus ring to 2px.
- Full axe pass across all 22 surfaces in both themes, at both densities.

---

## 6. How this is verified

Every claim in this plan is a number that CI can track, which is the point — "more elegant" is not a testable assertion, but these are:

| Metric | Before | Target | Achieved |
|---|---|---|---|
| Hex literal occurrences (377 distinct) | 476 | 0 outside tokens | **0** |
| `!important` declarations | 208 | < 20 | **0** |
| Font sizes below 12px | 461 | 0 | **0** |
| Page-header variants | 13 | 1 | **1** |
| Visible nav items | 22 | ~8 | **~8** |
| Body line-height | 1.45 | 1.60 | **1.60** |
| axe serious/critical violations | unmeasured | 0 | **0** |
| Classes for one card row | 26 | 1 | not done — see §9 |
| Views on `SurfaceState` | 14 / 24 | 24 / 24 | not done — see §9 |

`pnpm --filter @lattice/studio ux:check` enforces the first three in CI.

Visual regression runs against the Phase 0 baselines throughout, so each phase proves what it changed and, more importantly, what it did not.

---

## 7. What this plan deliberately does not do

- **No framework change.** No Tailwind, no Radix, no D3, no Framer Motion, no Lottie. The problem is not the absence of libraries; it is the presence of two competing stylesheets. Adding a framework mid-migration would add a third.
- **No new colour identity.** The brand lime stays. It stops moonlighting as five semantic states, which is what actually made the palette feel muted.
- **No AI suggestion surfaces, no multiplayer.** Both are product decisions wearing UX clothing. Neither belongs in a design-system consolidation, and neither has a stated user problem behind it.
- **No undo/redo stack yet.** The prior review was right that accidental loss is a risk, but the remedy is scoped confirmation on destructive actions — `ConfirmDialog.tsx` already exists — not a global undo stack, which is a large state-management commitment. Revisit after Phase 4.

---

## 9. What shipped

### New files

| File | Layer | Purpose |
|---|---|---|
| `layers.css` | — | Declares the cascade order; pulls React Flow into `vendor`. |
| `reset.css` | `reset` | Element normalisation. `font: inherit` on all form controls is what made deleting the blanket override possible. |
| `tokens.css` | `tokens` | Every colour, size, space, shadow and motion value. The only file allowed raw hex. |
| `scripts/ux-metrics.mjs` | — | The burn-down; `--check` fails CI on regression. |

### Deviations from the plan as written

- **React Flow had to be layered too.** Unlayered vendor CSS beats *every* layered rule, so putting our styles into layers without doing the same to React Flow would have inverted the graph styling. `layers.css` imports it with `layer(vendor)`, verified in the built CSS.
- **`!important` reached 0, not "< 20".** The budget assumed some would survive to fight third-party CSS; layering the vendor sheet removed that need entirely.
- **`--text-secondary` could not be a size token.** It is already a colour in 173 places. The supporting-copy size role is `--text-support`.
- **The 26-class card row and full `SurfaceState` adoption were not done.** Both touch component markup across 24 views rather than CSS, and neither is load-bearing for readability the way the type ramp was. The 13→1 hero consolidation is the pattern to follow; this is the obvious next increment.

### Fixed along the way (found, not planned)

- **`auth.css` was styled against four tokens that never existed** (`--bg`, `--line`, `--panel`, `--muted`), so the auth screen rendered with undefined custom properties. Aliased in `tokens.css`.
- **The minimap rendered as a black box in light mode** — its mask was a hardcoded near-black passed as a React prop. It is a theme value; now `--canvas`-derived.
- **The sidebar footer collided with the nav** once type reached a readable size. `nav` needed `min-height: 0` to actually scroll inside its flex column.
- **`.nav-group-items[hidden]` did not hide.** An author `display` beats the UA sheet's `[hidden] { display: none }`, so collapsed groups still rendered until the attribute was honoured explicitly.
- **Five e2e tests were already failing on `main`** — four visual baselines predating the nav restructure, and one written against an icon grid that has since been collapsed by design. All five now pass. The suite went from 6/12 to 12/12.

### Verification

12/12 e2e (including the WCAG A/AA axe scan), 78/78 unit, typecheck clean, all three burn-down metrics at zero. Visual baselines regenerated; note CI runs `--ignore-snapshots` because baselines are macOS-rasterized, so they remain a local tool.

---

## 8. Next increment

With the cascade fixed and the invariants under CI, the remaining work is component-level rather than architectural:

1. **Extract `.surface-row`** and migrate the 26 card-row classes onto it, following the hero pattern in `surface-kit.css`. This is the largest remaining density win.
2. **Finish `SurfaceState` adoption** across the 10 views still rolling their own empty states.
3. **Audit metrics for actionability** — every `.surface-metric` should filter the content below it or move into the hero as prose.
4. **Scoped breadcrumbs** on the three genuinely nested surfaces (contract editor, ontology bindings, evaluation run detail).
