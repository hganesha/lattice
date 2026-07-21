# Lattice — UX Reimagine: Interface, Language, and Standardization

_Assessment date: 2026-07-20 · Scope: `apps/studio` visual + interaction layer only (styles, components, icons, copy, controls) · Companion to [lattice-improvements.md](lattice-improvements.md), which covers product/feature strategy. This document is purely UX/UI: no feature or architecture recommendations._

---

## 0. How to read this

This is a design critique, not a product critique. Lattice's *ideas* are sound and its *copy* is genuinely good; what holds the interface back from state-of-the-art is that it carries **two design systems at once** and resolves the conflict with `!important`. Everything below flows from that. Recommendations are ordered by leverage: fix the token layer first and 60% of the visual inconsistency disappears for free.

**What is already SOTA-grade and must be preserved:**

- Dark/light theming with a real tokenized palette in [appearance.css](apps/studio/src/appearance.css) (`--surface`, `--text`, `--border` scales for both modes).
- `:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px }` — a proper, high-contrast, keyboard-only focus ring ([appearance.css:66](apps/studio/src/appearance.css:66)).
- `@media (prefers-reduced-motion: reduce)` honored on animations ([appearance.css:81](apps/studio/src/appearance.css:81)).
- A user-facing text-scale toggle (`--ui-font-min` 12px → 13.5px) and WCAG-AA-aware contrast tokens.
- The microcopy: verb-first, benefit-led, consistently sentence-cased, fully externalized through `defineMessages` with translator `description` fields ([messages.ts](apps/studio/src/i18n/messages.ts)). "See the payoff before you author anything" is a better empty-state headline than most shipping products have.

The problems are structural and visual, and they are fixable without touching a single feature.

---

## 1. The root cause: two design systems in one codebase

[styles.css](apps/studio/src/styles.css) (the base, ~916 lines across the split files) is written entirely in **hardcoded hex** at a **6–8px type scale**:

```css
.nav-item { ... color: #838b8e; font-size: 11px; }
.schema-type-card small { color: #626c6d; font: 6px DM Mono; }
.relation-chip b { color: #aeb7b3; font: 500 6px DM Mono; }
```

[appearance.css](apps/studio/src/appearance.css) then layers a **CSS-variable token system** on top and forces it to win with `!important` on nearly every rule:

```css
.nav-item { color: var(--text-secondary) !important; font-size: 13px !important; }
:where(p,label,small,code,time,dt,dd) { font-size: var(--ui-font-min) !important; }
```

So the app is a 6px hardcoded-hex dark theme with a 12px tokenized theme stapled over it. This is the origin of most UX debt:

- **Every new component must be authored twice** — once in base hex, once in the override layer — or it silently ships in the wrong palette in light mode.
- **`!important` is load-bearing**, which means the cascade is unusable for future work; the next developer cannot override anything cleanly.
- **Two sources of truth for every value** (a color exists as both `#eef2ef` and `var(--text)`), and they drift.

**Recommendation P0 — collapse to one token layer.** Delete the hardcoded hex from `styles.css`, promote the `appearance.css` variables to the single source of truth, and remove the `!important` flood. Concretely: define the full token set (color, type, space, radius, shadow, z-index) in `:root`, author every rule against `var(--*)`, and let the `data-theme` attribute do the theming with zero `!important`. This is a mechanical refactor — no visual redesign required to *start* — and it is the precondition for everything else in this document being maintainable.

---

## 2. Color

**Current state.** A single lime accent — `#b7f44a` in base, `#8bd32f`/`--accent` in the token layer — does the work of *six* semantic roles: brand mark, primary button (`.release`), active nav indicator, success state, canvas selection highlight, and evidence "exact/verified" markers. Meanwhile `.compile-button` is a *different* primary (white/`--text` background), so the app has two competing "this is the main action" colors depending on which screen you're on ([styles.css:26,28](apps/studio/src/styles.css:26)).

**Why it's a problem.** When brand = success = primary = selection, the user cannot decode meaning from color. A green node could mean "this is selected," "this passed," or "this is the accent" — the interface has taught them nothing. SOTA systems (Radix Colors, Tailwind, Material 3, IBM Carbon) all separate **brand** from **functional/semantic** color precisely so success-green never collides with brand-green.

**Recommendation P1 — a semantic color scale.** Introduce distinct token families and stop overloading:

| Role | Today | Proposed |
|---|---|---|
| Brand | lime (also everything else) | Keep lime **only** for the logo mark and one brand moment |
| Primary action | lime `.release` **and** white `.compile-button` | One primary token; one button style; everywhere |
| Success / pass | lime (same as brand) | A green that is *not* the brand lime |
| Warning | `#e2af64`/amber (ad hoc hexes) | `--warning` token |
| Danger | `--danger` (exists, good) | Keep, apply consistently (`.ghost.danger` is ad hoc) |
| Info / markets | `#61a7ff` blue (ad hoc) | `--info` token |
| Selection | lime | `--focus`-adjacent, distinct from success |

Each should carry a full step ramp (bg / border / text / solid) as Radix does, so contrast is guaranteed in both themes. The focus blue (`--focus: #70aef7`) is already correctly distinct — use it as the model.

**Also:** the neon glow aesthetic (`box-shadow: 0 0 24px #a9ed462c`, `0 0 30px #8ddd3010`, accent-tinted radial gradients on ~8 surfaces) reads as 2019 "cyberpunk dashboard," not 2026. SOTA dark UIs (Linear, Vercel, Fabric itself) use near-flat surfaces with a single subtle elevation shadow and reserve glow for genuinely active/live elements. Pull the glow back to one or two intentional moments (the live compile bar, the signed-plan pill) and let everything else sit flat.

---

## 3. Typography

**Current state.** The base type scale bottoms out at **6px** (`font: 6px DM Mono` appears throughout — relation chips, release cards, footers, type-card captions). `appearance.css` rescues legibility by forcing floors via `:where()` + `!important`, but the *design* was composed at sizes no human should read.

**Why it's a problem.** 6–8px monospace is below the accessibility floor and below every mainstream minimum (Apple HIG 11pt min, Material 12sp min for captions). The `!important` floor patches *rendered* size but not the *composed* rhythm — line-height, spacing, and truncation were all tuned for 6px, so at the enforced 12px many labels crowd or ellipsis-truncate (`.node-copy small`, `.schema-type-card small` all have `white-space:nowrap; text-overflow:ellipsis`).

**Recommendation P1 — a native type ramp.** Rebuild the scale so the *authored* sizes are the *rendered* sizes:

```
--text-xs: 12px   (meta, captions — hard floor, never smaller)
--text-sm: 13px   (secondary body, table cells)
--text-base: 14px (body — the default)
--text-lg: 16px   (section subheads, h3)
--text-xl: 20px   (panel titles, h2)
--text-2xl: 27px  (page title, h1)
```

Then delete the `!important` font-size floor entirely — it becomes unnecessary. Keep the three families but tighten roles: **Inter** for all UI text, **Manrope** for display headings (already the case), **DM Mono** for *data only* (IDs, digests, code, versions) — not for 7px UI labels, which is its most common misuse today (`.nav-label`, `.workspace-switcher label`, `.summary-label` are all mono at ≤8px). UI micro-labels should be Inter at `--text-xs`, uppercase via CSS.

**Two standardization fixes:**
- **ALL-CAPS is applied in JavaScript** via `.toLocaleUpperCase()` in JSX (dozens of call sites: `t('contextStudio').toLocaleUpperCase()`, etc.). This is presentation logic in the render tree, it breaks for locales with casing rules, and it means the same visual treatment is inconsistent where a developer forgot the call. Move all of it to `text-transform: uppercase` in CSS on the label classes.
- **Self-host the fonts.** `@import url('https://fonts.googleapis.com/...')` at the top of [styles.css:1](apps/studio/src/styles.css:1) is render-blocking, adds an external dependency, leaks the user's IP to Google, and will break under strict CSP (relevant the moment you ship the shareable static export from the companion doc). Bundle the woff2s via Vite.

---

## 4. Iconography

**Current state.** Navigation and type icons are **abstract Unicode geometric glyphs** with no semantic relationship to their function:

```
◎ Shared ontology   ⇆ Ontology bindings   ◇ Contracts   ✦ Compiler
✓ Assurance         ⇄ Source bindings     ◉ Runtime approvals
◆ Policy profiles   ◴ Review queue        ▣ Evidence registry   ↗ Releases
```

Entity types render as **two-letter monospace initials** in colored tiles (`PE` Person, `OR` Organization, `AG` Agent — [coreOntology.ts](packages/contracts/src/coreOntology.ts)).

**Why it's a problem.** These are not an icon system — they're typographic ornaments. `◎` (Person) vs `◉` (Runtime approvals) vs `◆` (Policy) vs `◇` (Contracts) are visually near-identical filled/hollow shape pairs a user cannot learn or distinguish at a glance; `⇆` and `⇄` (Ontology bindings vs Source bindings) are the *same arrow* in two directions for two different destinations. Unicode glyphs also render differently per OS/font, don't baseline-align consistently, and can't carry state color cleanly. The prior review already flagged the duplicate-`⌘` bug this class of choice produces.

**Recommendation P0 — adopt a real icon library.** Lucide or Phosphor (both MIT, tree-shakeable, 1000+ icons, designed on a consistent grid with matching stroke weight). Map semantically so the icon *teaches* the function:

| Nav item | Proposed Lucide icon |
|---|---|
| Shared ontology | `network` / `share-2` |
| Ontology bindings | `link` |
| Contracts | `file-text` |
| Compiler / runtime | `play` / `terminal` |
| Assurance | `shield-check` |
| Source bindings | `plug` |
| Runtime approvals | `user-check` |
| Policy profiles | `scale` / `shield` |
| Review queue | `inbox` |
| Evidence registry | `file-search` |
| Releases | `git-branch` / `package` |

For the eight Core entity types, either commission eight simple glyph icons or keep the initials but treat them as an intentional monogram system (consistent tile, weight, and a documented rule) rather than ad hoc. Icons should carry `aria-hidden="true"` with the text label as the accessible name (the nav already pairs label text, which is good).

---

## 5. Windows, overlays, and layout

**Current state — five bespoke overlay implementations**, each with its own backdrop, z-index, and dismissal behavior:

| Window | Backdrop | z-index | Notes |
|---|---|---|---|
| Builder modal | `#030506bc` + blur | 100 | Centered |
| Wizard | inherits, `wizard-backdrop` | 200 | 1010×700 fixed |
| Welcome | `welcome-backdrop` | 260 | radial-gradient panel |
| Confirm dialog | `confirm-backdrop` | 300 | |
| Drawer | **transparent, `pointer-events:none`** | (inline) | no scrim, no click-out |
| Toast | — | 500 | |

**Why it's a problem.** The z-index ladder (100/200/260/300/500) is an arbitrary sequence of magic numbers — the next overlay author guesses a bigger number and hopes. Dismissal is inconsistent: the drawer has no scrim and can't be dismissed by click-outside (its backdrop is `pointer-events:none`), while modals can. Only the welcome dialog demonstrably sets `role="dialog" aria-modal="true"` with a labelled title; the others need auditing for the same. There is no shared focus-trap, no shared Escape-to-close, no shared scroll-lock.

**Recommendation P1 — one dialog primitive + a z-index scale.** Build (or adopt — Radix Dialog is the reference) a single overlay component that provides scrim, focus trap, `Escape` close, scroll lock, `role="dialog"`/`aria-modal`/`aria-labelledby`, and return-focus-on-close *once*, then render modal / wizard / welcome / confirm / drawer as variants of it. Replace the magic z-indexes with a token scale:

```
--z-base: 0; --z-dropdown: 100; --z-sticky: 200;
--z-overlay: 1000; --z-modal: 1100; --z-toast: 1200;
```

**Layout:** `body { min-width: 1180px }` ([styles.css:5](apps/studio/src/styles.css:5)) is a hard desktop floor — the app is unusable below that and there is no tablet/mobile story at all. Even if Lattice is legitimately a desktop authoring tool (defensible), the sidebar should collapse and the two-column workbenches (`minmax(660px,1fr) 305px`) should stack gracefully on smaller laptops rather than clip. At minimum, replace the hard `min-width` with a responsive breakdown so a 13″ MacBook (1280px, common) isn't at the ragged edge. The `@media(max-width:1300px)` rule exists but only nudges paddings; it doesn't restructure.

---

## 6. Controls & components

**Buttons.** Three overlapping styles — `.ghost`, `.release` (lime, "primary"), `.compile-button` (white/text, also "primary") — with no documented hierarchy, plus one-off `.ghost.danger`. A SOTA button system is a small closed set: **primary / secondary / tertiary(ghost) / danger**, each with hover/active/disabled/loading states, one component, variant prop. Today "the primary action" is lime on most screens and white on the compiler, which trains the eye wrong. Consolidate to a single `<Button variant>` and pick *one* primary color (§2).

**Selects.** Native `<select>` styled three different ways: borderless in the workspace switcher, bordered mini in the contract switcher (8px font!), and a third treatment in `.contract-canvas-selector`. Standardize one select control (or adopt a headless listbox for the richer ones), with consistent height (≥38px target — appearance.css already sets this for some), padding, and chevron.

**Segmented controls.** Two implementations of the same pattern — the polished `.segmented-control` in the appearance menu ([appearance.css:164](apps/studio/src/appearance.css:164)) and the ad hoc `.view-controls` (Map/Table toggle). Promote the good one to a shared component and retire the other.

**Inputs.** Reasonably consistent through the token layer, and focus rings are good. The remaining issue is the base 8px font on `.type-form`/`.builder-modal` inputs, fixed only by the `!important` floor — resolved once §3 lands.

**Decorative-but-dead affordance.** The compile button renders `⌘↵` but only plain `Enter` is wired ([RuntimeStudio.tsx:79-80](apps/studio/src/RuntimeStudio.tsx:79)). A control that advertises a shortcut it doesn't honor erodes trust in every other affordance. Either wire ⌘↵ or drop the hint (also noted in the companion doc).

**Touch/hit targets.** The token layer sets many controls to ≥38px (good), but base chips, mini-selects, and icon buttons (`.contract-switcher button` 32px, `.toast-close` 28px) fall below the 44px SOTA/WCAG 2.5.5 target-size guidance. Normalize interactive minimums.

---

## 7. Language & standardization

The *writing* is strong; the *standardization of the writing's presentation and vocabulary* is where the work is.

**Keep:** sentence case throughout, verb-first CTAs ("Create your first contract," "Compile example"), externalized strings with descriptions, ICU plurals in the es-ES catalog. This is above-average discipline.

**Fix:**

1. **Casing lives in JS, not CSS** (§3) — `.toLocaleUpperCase()` scattered across JSX is a standardization hazard; move to `text-transform`.
2. **Terminology load is unmanaged.** The interface introduces — with no in-context definition — *contract, concept scope, binding (ontology vs source vs contract), evidence strength, freshness window, risk tier, assurance gate, abstention, materialization, runtime suspension*. That's a graduate vocabulary delivered cold. Standardize a **single canonical term per concept** (audit for drift: "source binding" vs "data binding" vs "connector"), publish an in-product glossary, and attach first-use tooltips/popovers on each term's debut. This is a UX-writing standardization task, distinct from the education feature in the companion doc — here the ask is *consistency and definition*, not *teaching*.
3. **Empty states are uneven.** Some are excellent (the runtime map's "⌁ + load example"); others are a bare glyph + a loading word (`<span>⌘</span><h3>{workspaceLoading}</h3>` appears as a fallback in [App.tsx:316](apps/studio/src/App.tsx:316)). Standardize an empty-state pattern: icon + one-line what + one-line why + one action.
4. **Number, date, unit formatting** is correctly locale-aware via `formatDate` — verify it's used *everywhere* (some raw `.version`/count interpolations bypass it).

---

## 8. Accessibility & motion (standards conformance)

**Strong:** focus-visible rings, reduced-motion, text-scale control, AA contrast tokens, labelled welcome dialog, checkbox `accent-color`.

**Gaps to close for SOTA conformance:**

- **Dialog a11y is inconsistent** across the five overlays (§5) — only welcome is verified. All need `role="dialog"`, `aria-modal`, labelled title, focus trap, Escape.
- **The canvas.** The React Flow ontology/runtime graph is pointer-only; there is no keyboard path to select/inspect a node, and no text-equivalent beyond the Table view (which exists for runtime — good — but not for the authoring canvas). SOTA node-editors (and WCAG) expect keyboard operability. At minimum, ensure the Table/list view is a complete equivalent for authoring too.
- **Color-only status.** Approval/pass/fail and evidence strength lean on color (green/amber/red dots and bars). Pair with shape or text so colorblind users aren't excluded (the badges do carry text — extend that everywhere the bare dots appear).
- **Target sizes** below 44px (§6).

---

## 9. Aesthetic direction — where SOTA is heading

If §1–§8 are the "make it consistent" pass, this is the "make it feel 2026" pass. The current look is *competent dark dashboard with neon accents*. The reference class it should aim at — Linear, Vercel, Fabric's own IQ surfaces, Retool's newer shell — shares a recognizable language:

- **Flatter surfaces, fewer glows.** One elevation shadow, used sparingly; glow reserved for genuinely live state.
- **More generous whitespace.** Lattice is *dense* — the 6px origins left tight rhythm even after the floor. Increase base spacing unit to 4px-grid with real breathing room in panels and cards.
- **Quieter borders, stronger hierarchy from type and space** rather than from boxes-within-boxes (the current UI nests bordered containers 3–4 deep; e.g. summary-grid → summary-card, workbench → panel → panel-header).
- **One confident accent**, used rarely, against a calm neutral field — the opposite of today's accent-everywhere.
- **Micro-interactions with restraint** — the `drawer-enter`/`toast-enter` animations are tasteful; extend that quality (hover, selection, state transitions) rather than adding more glow.

None of this requires new features. It's a token pass (§1), a color pass (§2), a type pass (§3), and a spacing pass — after which the same screens read as a modern product.

---

## 10. Prioritized UX roadmap

| Priority | Item | Section | Effort | Leverage |
|---|---|---|---|---|
| **P0** | Collapse to one token layer; delete hardcoded hex + `!important` flood | §1 | Medium | Unblocks everything; kills most inconsistency for free |
| **P0** | Adopt a real icon library (Lucide/Phosphor), map semantically | §4 | Small | Immediate legibility + learnability; fixes duplicate-glyph class of bug |
| **P0** | Wire or remove the `⌘↵` hint | §6 | Trivial | Trust |
| **P1** | Semantic color scale (brand ≠ success ≠ primary ≠ selection) | §2 | Medium | Meaning becomes decodable from color |
| **P1** | Native type ramp (12px floor, delete size-`!important`); self-host fonts; casing → CSS | §3 | Medium | Readability + standardization |
| **P1** | One dialog primitive + z-index token scale; unify overlay dismissal/a11y | §5 | Medium | Consistency + accessibility conformance |
| **P1** | Button/select/segmented-control consolidation into a component set | §6 | Medium | Predictable controls |
| **P1** | Terminology standardization + in-product glossary + first-use tooltips | §7 | Medium | Lowers the vocabulary wall |
| **P2** | Responsive down to 1280px; sidebar collapse; graceful workbench stacking | §5 | Medium | Common-laptop usability |
| **P2** | Canvas keyboard operability + complete table equivalents; color-not-only status | §8 | Medium | A11y conformance |
| **P2** | Aesthetic pass: flatten glows, widen spacing, quiet borders | §9 | Medium | Modern feel |

**North-star UX metrics.** Track (1) **components authored against tokens vs. raw hex** — target 100%, currently ~50/50; (2) **`!important` count in the stylesheet** — target near-zero, currently pervasive; (3) **distinct overlay implementations** — target 1, currently 5; (4) **minimum rendered font size** — target ≥12px by design (not by patch), currently 6px composed.

---

## 11. Bottom line

Lattice's interface is not *bad* — it's *doubled*. A carefully tokenized, theme-aware, accessible design system is running underneath a hardcoded 6px dark theme it has to override with `!important` on every rule, and the visual language (neon glows, geometric-glyph "icons," overloaded lime, graduate vocabulary) reads a design generation behind the product's ambition. The fix is not a redesign; it's a **consolidation**: one token layer, one icon set, one semantic palette, one type ramp, one dialog, one button family. Do that, and the same screens — with the same excellent copy and the same real accessibility groundwork — will read as state-of-the-art. The best signal here is that the *good* system already exists in the codebase ([appearance.css](apps/studio/src/appearance.css)); the work is mostly deleting the old one and letting the good one win without a fight.
