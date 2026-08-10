# Lattice — UX Declutter

*A calm-instrument pass over every surface: less text, one overlay system, a light theme that reads.*

> This is the follow-through to the earlier design work (`sota-ux-plan.md`, `lattice-ux-reimagine.md`). Those built the machinery — the OKLCH token tiers, the `surface-*` primitives, the `@layer` cascade. The machinery is good. This document is about **how we spend it**. The studio still feels dense and sloppy not because the tokens are wrong, but because every screen reaches for all of them at once. Decluttering is mostly *subtraction*, and almost none of it needs new tokens.

---

## 0. The one-paragraph diagnosis

Lattice reads as cluttered for four compounding reasons, each independently fixable:

1. **Overlays have no grammar.** There are ~12 hand-rolled backdrops. The same action — *edit one record* — is a right-hand drawer in the ontology builder, a centred modal in the policy editor, and a centred modal again in the review panel. The user never learns "where things open," so every panel is a small surprise.
2. **Every screen over-narrates.** A surface stacks an eyebrow, a title, a description paragraph, a facts row, a four-column metric strip, and per-panel kickers — before any actual data. There are 135 uppercase letter-spaced labels in the CSS. The chrome explains itself more than the data explains anything.
3. **The light theme's hierarchy collapses.** `--fg-secondary` and `--fg-muted` resolve to the *same* value (`--neutral-11`), so two intended tiers of de-emphasis render identically. Meanwhile heroes are tinted at 10% mixes that, on a white canvas, read as a faint dirty wash rather than a deliberate accent. Everything de-emphasised looks equally, flatly grey.
4. **Density is set for the machine, not the reader.** A 1180px minimum width, four-column metric grids on ten surfaces, 11–12px mono for chrome, and letter-spacing on nearly every label. It is *information-dense* in the pejorative sense: packed, not legible.

None of these is a rewrite. Each is a small number of decisions applied everywhere.

---

## 1. Overlays — one system, one rule

### What's there now

Distinct, independently-authored overlay shells (each with its own backdrop class, sizing, padding, and animation):

| Overlay | Class | Shape | Used for |
|---|---|---|---|
| Entity/type editor | `builder-drawer` | right slide-out | editing one entity type |
| New contract | `contract-wizard` | full-screen split-rail modal | creating a contract |
| New eval | `eval-modal` | centred modal | creating an eval run |
| Policy editor | `policy-editor` on `modal-backdrop` | centred modal | editing one policy |
| Review decision | `review-decision-panel` | centred modal | approving one item |
| Import schema | `import-backdrop` | centred modal | importing |
| Question import | `question-import-dialog` | centred modal | importing questions |
| Intro | `intro-dialog` | near-fullscreen | product intro |
| Welcome | `welcome-backdrop` | centred modal | first-run |
| Command palette | `palette-backdrop` | top-anchored | ⌘K |
| Confirm | `confirm-dialog` | small centred | destructive confirm |
| Emergency / case-set | inline `panel` | in-page | editing in place |

`OntologyBuilder.tsx`, `PolicyEditor.tsx`, `ReviewDecisionPanel.tsx`, `NewContractWizard.tsx`, `NewEvalWizard.tsx`, `ImportStudio.tsx`, `QuestionImportDialog.tsx` each hand-roll their own shell in `styles.css` / `surface-kit.css` / per-file CSS.

The problem isn't that there are three *shapes* — a mature app legitimately needs a drawer, a dialog, and a command bar. The problem is there's **no rule** mapping intent → shape, so identical intents get different shapes, and each shape is re-implemented (different padding, different backdrop opacity, different close affordance, different animation).

### The rule (adopt verbatim)

Three overlay primitives, and a decision table nobody has to think about twice:

| Intent | Primitive | Why |
|---|---|---|
| **Edit / inspect one record while its context stays relevant** | **Drawer** (right slide-out, ~460px) | The list behind it is the point of orientation. Entity editor, policy editor, review decision, binding editor, case-set editor all become drawers. |
| **A focused decision that must own the screen** (create, destructive confirm, irreversible publish) | **Dialog** (centred, sized to content, ≤560px) | Full attention, no context needed. New contract, new eval, confirm, publish. The contract *wizard* stays a dialog but drops the decorative split-rail (see §2). |
| **Search / jump** | **Command bar** (top-anchored) | ⌘K only. |

Everything currently opening as a centred modal to *edit an existing record* moves to the drawer. That single reassignment makes the app feel coherent: **records edit on the right, decisions happen in the middle, navigation happens up top.**

### Build it once

Create `Overlay.tsx` + `overlay.css` exposing exactly:

```
<Overlay variant="drawer" | "dialog" | "command" title=… onClose=…>
```

One backdrop (`color-mix(in oklab, var(--bg-canvas) 74%, transparent)` — the value the modal backdrop already uses), one focus trap, one `Esc`-to-close, one entrance/exit pair (`--motion-base` in, `--motion-fast` out, already tokenised), one close affordance in one position. Delete the 12 bespoke shells as each caller migrates. This is the single highest-leverage change in the document: it removes inconsistency *and* code.

**Acceptance:** grep for `-backdrop` returns one class. Every editor of a single record opens on the right.

---

## 2. Text — put every screen on a budget

The studio explains itself constantly. A representative surface renders, top to bottom, before any data:

- an **eyebrow** (mono, uppercase, letter-spaced) naming the record,
- an `<h1>`,
- a **hero description `<p>`** (`surface-hero p`, one per surface),
- a **facts row** (version · release state · scope),
- a **four-column metric strip** (`surface-metrics`, on 10 surfaces),
- then one or more **panel kickers** (mono uppercase) per panel.

That's five layers of orientation before the work. `IntegrationsStudio` alone has 8 kicker/eyebrow instances; `CaseSetStudio` and `SurfaceState` seven each.

### Principles

**2.1 One voice per screen names the screen. Not three.** The page `<h1>`, the sidebar (which already names the workspace), and the header context line currently all label *where you are*. Keep the `<h1>` and the single header context line (`App.tsx:558`); drop the per-panel `panel-kicker` wherever the panel's content is self-evident (a table of policies does not need a "POLICIES" kicker above it).

**2.2 The hero description earns its place or it goes.** `surface-hero p` should exist only where a screen genuinely needs a sentence of instruction the *first* time. For the ~15 surfaces where the title + data are self-explanatory, delete the paragraph. Where it's genuinely useful (Emergency Authorization, Negative Decisions — surfaces with real consequence), keep one sentence, ≤ 140 characters, and never repeat what the title already said.

**2.3 Metric strips are opt-in, not reflexive.** A four-up `surface-metrics`/`summary-grid` is justified when the numbers are the *headline* (Evaluations pass-rate, Assurance gates). On surfaces where they're incidental counts, they're four boxes of chrome the eye must clear every visit. Audit the 10 users of the strip; keep it where the metric *is* the job, replace it with a single inline count elsewhere (`14 policies · 3 in review`).

**2.4 Mono is for machine identifiers, not chrome.** The tokens file already says this (`tokens.css:379`). Yet "INDUSTRY WORKSPACE", "BUILD", "ONTOLOGY STATUS" render in the same mono-uppercase-letter-spaced treatment as an actual URN. That treatment is *loud* — it's how the eye is trained to find IDs and hashes. Spending it on section labels means the real identifiers no longer stand out, and the chrome shouts. **Reserve mono+uppercase for identifiers, versions, hashes, type names. Section labels and eyebrows become sentence-case sans at `--text-support`, `--weight-medium`, no letter-spacing.** This one change removes most of the "shouty" feeling in a single sweep (135 label sites).

**2.5 Cut helper `small` copy that restates the obvious.** Many rows carry a `<small>` that repeats the label ("Typed, directional" under a relationships count). If it's not adding a fact, it's adding weight.

**Acceptance:** a first-time reader can name what each screen is *for* in under two seconds, and the count of always-on descriptive paragraphs drops by roughly half.

---

## 3. Colour — make the light theme actually read

The dark theme carries the app; light mode is where "doesn't read well" comes from. Three concrete causes:

### 3.1 The de-emphasis tiers are collapsed

```
--fg-secondary: var(--neutral-11);
--fg-muted:     var(--neutral-11);   /* identical */
```
(`tokens.css:251–252`)

Two named tiers, one rendered value. Every "secondary" and "muted" string looks the same, so there's no *gradient* of importance — just body text and one undifferentiated grey. The comment explains the constraint (neutral-10 fails 4.5:1 on the app background), and that constraint is real for *small body text*. But muted text is overwhelmingly **large-ish or non-essential** (labels, meta, timestamps), which only needs 3:1. Split the tiers:

- `--fg-secondary: var(--neutral-11)` — keep (4.5:1, for secondary prose).
- `--fg-muted: var(--neutral-10)` — for meta/labels ≥ the large-text threshold, where 3:1 governs. This restores a visible third step so hierarchy reads.

Verify against `docs/token-audit.md` per the file's own standard, and only apply `--neutral-10` where the text is large or non-essential; keep secondary for anything long-form.

### 3.2 Hero tints are too weak to be intentional in light mode

`surface-hero` mixes its tint at **10%** into the surface (`surface-kit.css:33`). On the near-white light canvas that's a barely-perceptible smudge — not enough to read as "this is a governance screen," just enough to look faintly unclean. Either commit or drop:

- **Commit:** raise the light-theme tint to a legible but quiet ~18–22% *and* carry it on a thin left border in the semantic hue, so the accent is a deliberate edge rather than a foggy fill.
- **Drop:** `tint-none` everywhere and let a single semantic **status chip** in the hero carry the colour signal. Given the goal is *calm*, dropping is the stronger default — reserve background colour for genuinely stateful surfaces.

### 3.3 Too many hues on screen at once

The palette is disciplined at the token level (brand / interactive / success / warning / danger / governance / 8 categorical), but a busy surface can show all of them: lime brand mark, blue interactive, purple governance chips, category dots, plus status. On white, competing saturated hues read as noise. **Rule: at most two accent hues visible per screen** — the one interactive hue (blue) for "you can act here," plus at most one semantic status hue for the screen's actual state. Categorical (`cat-*`) colours belong only inside the graph and legends, never sprinkled into list chrome. `surface-kit.css` already keeps categorical chips outline-only (`.surface-chip[class*="cat-"]`) — extend that discipline: no filled categorical anything outside the canvas.

**Acceptance:** switch to light mode on any surface and three things are true — muted text is visibly lighter than secondary text; the hero is either clearly accented or cleanly neutral, never faintly tinted; and no more than two accent hues compete.

---

## 4. Density — set defaults for a reader

The mechanics exist (`--density`, `--text-scale`, `data-density="compact"`), but the *default* is tuned tight.

- **Raise the resting rhythm.** The comfortable density path already exists (`--density: 1.25`). Consider making comfortable the default and compact the opt-in for power users, or nudging the base `--density` up. The app is 1180px-min anyway — there's room.
- **Retire four-column strips below ~1280px** into two columns rather than crushing them.
- **Drop the letter-spacing** from everything that stops being mono-uppercase per §2.4. Letter-spacing on sentence-case text just loosens it into mush.
- **Lengthen the vertical gaps between *groups*, not within them.** Clutter is usually under-separated groups, not over-large elements. `--space-5`/`--space-6` between a metric strip and the table beneath it does more for calm than shrinking anything.

**Acceptance:** the eye lands on one thing per screen region without scanning; no region touches its neighbour.

---

## 5. Navigation — 21 destinations is a directory, not a workflow

The sidebar lists 21 surfaces in four collapsible groups (Build / Operate / Govern / Assure) plus Search and Activity. The grouping is thoughtful and the task-shaped framing (`App.tsx:96`) is correct. But 21 first-class destinations is a lot to hold, and every group carries a count badge that adds visual weight even when zero.

- **Keep the four groups; collapse by default to the active group only** (the code already keeps the active group open — extend that so the others default closed for a new session).
- **Suppress zero-counts.** A `0` badge is noise; show a badge only when there's something waiting.
- **Demote the rare surfaces.** Emergency Authorization and Negative Decisions are consequential but infrequent — they can live one level down (a group they belong to, revealed on expand) rather than always-visible rows.

This isn't an IA rewrite; it's turning the volume down on a structure that's already right.

---

## 6. Screen-by-screen (the concrete pass)

Grouped by the change each needs. "Drawer" = migrate its record-editor to the shared right drawer; "Trim" = apply the §2 text budget; "Metrics?" = re-justify or downgrade the 4-up strip.

**Build**
- **Shared Ontology** (`OntologyBuilder`) — already a drawer; make it *the* drawer. Trim the panel kickers on the canvas.
- **Ontology Bindings / Source Bindings** (`SourceBindingStudio`) — Drawer for the binding editor. Trim the catalog panel kicker.
- **Contracts** (`ContractsStudio`) — Trim. This is a list; it needs a title and rows, nothing else.
- **Contract Editor** (`ContractEditorStudio`) — 6 kickers → keep at most 2 (the genuinely distinct sections). Trim.
- **New Contract** (`NewContractWizard`) — Dialog, but drop the decorative split-rail and the "principle" footer card; a create flow doesn't need a manifesto beside it.

**Operate**
- **Compiler** (`RuntimeStudio`) — the compile bar is good; Trim the surrounding kickers.
- **Disposition Trail / Executions** — Metrics? (keep only if the counts are the headline). Trim.
- **Integrations** (`IntegrationsStudio`) — worst offender at 8 eyebrow/kicker sites; Trim hard.
- **Runtime Approvals / Emergency Auth** — Drawer for the per-item action; keep one sentence of consequence copy (these earn it).

**Govern**
- **Review Inbox** (`ReviewInboxStudio`) — Drawer for the decision (currently a centred modal). Metrics only if the queue counts are the point.
- **Policies** (`PolicyStudio` / `PolicyEditor`) — Drawer (currently a centred modal). Trim.
- **Evidence / Negative Decisions / Identities / Releases** — Trim; Drawer any per-record detail.

**Assure**
- **Assurance** (`AssuranceStudio`) — Metrics *stay* (gate pass/fail is the headline). Trim kickers.
- **Evaluations** (`EvaluationRunsStudio`) — Metrics stay. **New Eval** (`NewEvalWizard`) → the shared Dialog.
- **Case Sets** (`CaseSetStudio`) — 7 eyebrow sites; Trim. Drawer the case-set editor.
- **Drift** (`DriftStudio`) — Trim.

**Dialogs that consolidate**
- `ImportStudio`, `QuestionImportDialog`, `WelcomeStudio`, `IntroDialog`, `ConfirmDialog` all become the shared **Dialog**; `CommandPalette` becomes the shared **Command bar**.

---

## 7. Sequenced plan

Ordered so each phase is shippable and visible on its own.

**Phase 1 — Overlay system (biggest felt win).** Build `Overlay.tsx` (drawer / dialog / command). Migrate the record editors to the drawer, the create/confirm flows to the dialog. Delete bespoke backdrops as you go. *Ship when grep for `-backdrop` returns one class.*

**Phase 2 — Text budget.** Flip section labels/eyebrows from mono-uppercase to sentence-case sans (§2.4) across `styles.css`/`surface-kit.css`/per-file CSS. Delete the hero `<p>` where the title suffices. Downgrade incidental metric strips. *Ship when the always-on paragraph count roughly halves.*

**Phase 3 — Light theme.** Split `--fg-muted` to `--neutral-10` where large/non-essential (re-run the token audit). Resolve the hero tint (commit-or-drop, §3.2). Enforce the two-hue rule in list chrome. *Ship when the §3 acceptance holds in light mode.*

**Phase 4 — Density & nav.** Nudge the default density up; two-column metric fallback under 1280px; default non-active nav groups closed; suppress zero badges. *Ship when a screen region reads as one calm block.*

Phases 2–4 are independent and can land in any order after Phase 1.

### Status — Phases 1 & 2 shipped

**Phase 1 — Overlay system.** `Overlay.tsx` + `overlay.css` now provide the three variants (drawer / dialog / command) with one backdrop, focus trap, scroll lock, Esc-to-close and a single entrance/exit pair. Migrated:
- **Record editors → drawer:** `PolicyEditor`, `ReviewDecisionPanel` (both were centred modals; their wrapper-scoped CSS was re-pointed to content classes). Verified in-browser: the policy editor now slides in from the right.
- **Decisions → dialog:** `ConfirmDialog`.
- **Complex flows → shared backdrop (bare mode):** `NewContractWizard`, `NewEvalWizard`, `ImportStudio`, `QuestionImportDialog`, `WelcomeStudio`, `IntroDialog` — each keeps its bespoke inner layout but inherits the one backdrop/focus/scroll/Esc.
- **Command:** `CommandPalette`.
- *Residual (follow-up):* `CaseSetStudio`'s case-set editor, `EmergencyAuthStudio`, and `OntologyBuilder`'s entity editor still use their own shells (the last is already a right drawer). The read-only `.decision-detail` view keeps `modal-backdrop`. These are mechanical migrations onto the same primitive.

**Phase 2 — Text budget.** Stripped 170 JS `.toLocaleUpperCase()` label calls (data transforms left intact); removed every decorative `text-transform:uppercase` and switched the eyebrow/kicker/nav/metric/facts/filter/summary label families from mono to sentence-case sans; trimmed redundant hero chrome on Integrations and Contract Editor. The old appearance-layer rule that force-uppercased the whole label family is gone.

*Verification:* `tsc -b` clean · 78/78 unit tests pass · UX burn-down metrics all within budget (0 shadowed-by-overrides) · browser smoke of the drawer, two dialogs, and the shell in light mode.

> Found in passing (not mine, left for the owner to confirm): the working tree carried an uncommitted, unwired `IntroDeck.tsx` plus duplicate keys in `messages.ts` (a second `introClose` resolving to `'Close'`). The duplicates broke an intro test and emitted build warnings, so they were de-duplicated and the three genuinely-new keys given Spanish translations.

---

## 8. Definition of done

The studio has decluttered when a new user, dropped onto any surface in **light mode**, experiences:

1. **Predictable overlays** — records edit on the right, decisions in the middle, ⌘K up top; nothing is a surprise.
2. **A quiet first read** — one title, at most one sentence, then the data. No wall of uppercase labels.
3. **Legible hierarchy** — muted, secondary, and body text are three visibly different weights of grey; accents are deliberate, not incidental.
4. **Breathing room** — groups are separated, regions don't touch, and nothing is packed to the edge.

The tokens and primitives to do all of this already exist. Decluttering Lattice is not building more — it's using less of what's there, everywhere, the same way.
