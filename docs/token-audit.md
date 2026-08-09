# Design token audit

The studio's token system, before and after replacing the hand-authored flat
palette with generated OKLCH ramps and a semantic tier. "Before" is the state
at commit `d6c7614`; "after" is the working tree. Every number below is
computed, not estimated — regenerate with the scripts described at the bottom.

## Summary

| | before | after |
|---|---|---|
| Contrast checks failed | 9 / 24 | 3 / 24 |
| Colour values hand-authored per theme | ~62 | 0 (generated from 7 OKLCH ramps) |
| Distinct blues meaning "interactive" | 3 (`--info`, `--selection`, `--focus`) | 1 |
| Tokens for graph/node semantics | 1 (`--canvas-grid`) | 15 |
| Density switch redefines | 5 space tokens + `--row-min` | 1 multiplier |

## Contrast

Text targets WCAG AA 4.5:1. Control borders target 1.4.11 non-text 3:1.
Decorative borders (`--border`) have no target and are listed for reference.

| theme | pair | before | after | target | before | after |
|---|---|--:|--:|--:|---|---|
| light | text on surface | 16.74 | 13.42 | 4.5 | pass | pass |
| light | secondary on surface | 8.41 | 5.14 | 4.5 | pass | pass |
| light | muted on surface | 4.93 | 5.14 | 4.5 | pass | pass |
| light | **accent on surface** | **3.44** | **4.89** | 4.5 | **FAIL** | pass |
| light | **success on surface** | **4.07** | **4.86** | 4.5 | **FAIL** | pass |
| light | **warning on surface** | **4.03** | **5.25** | 4.5 | **FAIL** | pass |
| light | danger on surface | 5.78 | 5.56 | 4.5 | pass | pass |
| light | info on surface | 4.88 | 5.17 | 4.5 | pass | pass |
| light | governance on surface | 5.64 | 5.45 | 4.5 | pass | pass |
| light | decorative border on surface | 1.49 | 1.32 | — | – | – |
| light | **control border on surface** | **2.52** | **3.15** | 3 | **FAIL** | pass |
| dark | text on surface | 16.56 | 14.89 | 4.5 | pass | pass |
| dark | secondary on surface | 8.55 | 8.74 | 4.5 | pass | pass |
| dark | muted on surface | 5.61 | 8.74 | 4.5 | pass | pass |
| dark | accent on surface | 9.77 | 9.03 | 4.5 | pass | pass |
| dark | success on surface | 7.74 | 9.06 | 4.5 | pass | pass |
| dark | warning on surface | 8.99 | 8.57 | 4.5 | pass | pass |
| dark | danger on surface | 6.84 | 8.32 | 4.5 | pass | pass |
| dark | info on surface | 7.23 | 8.76 | 4.5 | pass | pass |
| dark | governance on surface | 6.91 | 8.44 | 4.5 | pass | pass |
| dark | decorative border on surface | 1.70 | 1.57 | — | – | – |
| dark | **control border on surface** | **2.53** | **5.22** | 3 | **FAIL** | pass |

The new values sit lower at the top end (13.4 vs 16.7) because pure
`#ffffff` and near-black were pulled in one step; that headroom buys the
mid-scale steps that were previously missing.

### Cross-theme symmetry

The clearest single defect in the old file. `--accent` is the same token
in both themes but carries wildly different visual weight:

| token | before light | before dark | after light | after dark |
|---|--:|--:|--:|--:|
| accent | 3.44 | 9.77 | 4.89 | 9.03 |
| success | 4.07 | 7.74 | 4.86 | 9.06 |
| warning | 4.03 | 8.99 | 5.25 | 8.57 |

A component tuned to look right in dark mode is under-emphasised in light mode
by a factor of nearly 3. The ramps fix the OKLCH lightness stop per
step, so the ratio is a property of the *step*, not of the theme.

## Elevation

Fill deltas in the old file were fine (~0.02 OKLCH L per step). The problem
is the border: `--border` at 1.49:1 (light) / 1.70:1 (dark) means a card edge
dissolves into its background, so the fill step has nothing to terminate
against. Fill, border and shadow are now one `--bg-* / --border-* / --shadow-*`
triple per elevation level.

**Correction.** An earlier draft of this document claimed `--shadow-raised` and
`--shadow-overlay` were being defeated by `box-shadow: none` in ten places.
That was wrong. All eight occurrences in `styles.css` were checked against
every selector in the studio that sets a non-`none` shadow, and none of them
cancelled anything — they were leftovers from a glow treatment that had already
been deleted. They have been removed as dead code, but they were never
suppressing elevation.

## Categorical palette for the graph

Lattice is an ontology editor that had no tokens for node or edge category. Eight
categorical colours were selected by search over OKLCH hue and lightness,
scored on worst-case pairwise separation under simulated deuteranopia and
protanopia (Viénot LMS):

| palette | min pairwise separation (light) | (dark) |
|---|--:|--:|
| naive equal-lightness 8-hue wheel | 6 | 21 |
| **adopted (staggered lightness)** | **69** | **92** |

Equal-lightness categorical palettes always collapse under CVD — hue is the
only channel carrying information. Staggering lightness makes luminance a
second channel, which is what produces the order-of-magnitude improvement.

## Migration status

**Complete.** All 17 studio CSS surfaces reference only the semantic tier. The
compatibility block that re-exported the 45 legacy token names has been removed
from `tokens.css` — nothing referenced it any more, so the old vocabulary is
gone rather than merely deprecated.

| | before | after |
|---|--:|--:|
| Legacy token references | 2,764 | **0** |
| Files using legacy names | 17 | **0** |
| `--accent*` references | 307 | **0** |
| Hardcoded `px` in `font:` shorthands | 56 | **0** |
| Hardcoded font-family names | 502 | **0** |

Re-check at any time:

```
cd apps/studio/src && python3 ../../../scripts/tokens/migrate.py --dry *.css
```

A file that prints no decisions and produces no diff is migrated.

### How `--accent` resolved

307 references carrying six unrelated meanings. Resolved by selector
semantics, property, and ramp step — a colour used as text takes the ramp's
text step (11), because step 9 measures **2.97:1** as light-mode text on its
own soft background and would have failed AA everywhere it was used for a
label:

Breakdown of the 190 decisions the script made across the 15 scripted files
(`styles.css`'s 75 and `surface-kit.css`'s were mapped by hand earlier):

| meaning | → | count |
|---|---|--:|
| selection / active / hover / links / icon tints | `--interactive-fill` / `-text` / `-bg` | 134 |
| brand identity + primary CTA | `--brand-fill` / `-text` / `-bg` | 30 |
| success, approved, verified, pass, healthy, ready, valid | `--status-success-*` | 11 |
| emphasis value text | `--fg-default` | 8 |
| focus rings | `--focus-ring` | 6 |
| neutral chip fill | `--bg-hover` | 1 |

### Defects and gaps the migration surfaced

1. **`.mini-dot` was defined twice.** A global copy in `styles.css` (`@layer
   surfaces`) overrode the primitive in `surface-kit.css` (`@layer primitives`),
   forcing `.green` and `.lime` both to `--accent` — success and brand rendered
   as the same colour — and shrinking the dot from 7px to 5px. Only four of the
   seven tones were redefined, so the component was styled by two files at once.
2. **Six tokens were missing**, each found because real usage had to name its
   intent: `--border-hover`, `--tracking-display`, `--measure-narrow`,
   `--text-headline` (24px), `--text-hero` (34px), and the `--status-*-solid`
   slots. The type ramp had no step between 20px and 28px, so `styles.css`
   hardcoded 22/23/25px, and none between 28px and the 32/37px score readouts.
3. **`--accent` was doing loading-state duty.** `.surface-state.loading` tinted
   its spinner with the brand colour; now `--interactive-text`.
4. **`appearance.css` re-declares 76 of `styles.css`'s selectors** in the same
   cascade layer, winning purely by import order. `.sidebar`'s background and
   `h1`'s font size in `styles.css` are both dead as a result. A token migration
   cannot fix this — the two files need merging or an explicit layer split — and
   it means verifying `styles.css` in isolation is unreliable.

### Corrections to earlier drafts of this document

- **`box-shadow: none` was not suppressing elevation.** An earlier draft claimed
  ten such declarations were defeating `--shadow-raised`. All eight in
  `styles.css` were checked against every selector in the studio that sets a
  non-`none` shadow; none cancelled anything. They were leftovers from a deleted
  glow treatment, and have been removed as dead code. The elevation problem was
  the border weakness alone.
- **The `.sidebar` `rgba(10, 12, 14, .93)` hardcode was dead, not harmful.** An
  earlier draft blamed it for the sidebar staying near-black in light mode.
  `appearance.css` already overrode that background with the `--sidebar` token.
  It is now `var(--bg-subtle)` so the file is correct standalone, but it was
  never producing a visible defect.

## TSX-side: tones name meanings, categories leave the status ramp

The CSS migration left one problem it could not reach: class names still named
paint. `Tone` was a union of colour words driving `.mini-dot`/`.surface-chip`
classes across ~20 files.

**`Tone` renamed to meanings** — `green→success`, `amber→warning`, `red→danger`,
`blue→info`, `lime→brand`, `violet→governance`, `muted→neutral` — across the
union, every tone-mapping function, all 11 CSS variant families and every
call site.

**Eval case types moved off the status ramp** onto `CategoryTone`
(`cat-1..8` → `--cat-*`). The old mapping read `HAPPY_PATH` as "success" and
`ADVERSARIAL` as "danger", implying a verdict the case type does not carry — a
happy-path case has not passed anything merely by existing. `formatters.ts` now
draws the line explicitly: status tones are for values with valence or ordering,
categorical tones for kinds that are merely different.

**`domainGroupColors.ts` moved onto the same ramp.** It hand-rolled twelve HSL
hues at a single lightness (`hsl(H 62% 42%)`) — the equal-lightness wheel that
measures a worst-case pairwise separation of **6** under simulated deuteranopia.
The `--cat-*` tokens measure **69 light / 92 dark**. The trade is repeating
after eight groups instead of twelve; eight separable colours beat twelve
several viewers cannot distinguish, and the lane labels and legend carry the
meaning regardless.

**`SurfaceState.tsx` stopped re-declaring the union** inline (it had drifted —
its copy was missing `neutral`) and now imports `Tone`.

### Defects found and fixed during the TSX pass

1. **Two dead token references in TypeScript.** `domainGroupColors.ts` fell back
   to `var(--border-strong)` / `var(--surface-soft)` — both deleted with the
   compatibility block. The CSS-only migration had no way to see them. Any
   future token removal must grep `.ts`/`.tsx` as well as `.css`.
2. **32 unstyled classes across 12 files.** The first rename pass only caught
   tone values in quoted literals; static `className="surface-chip muted"`
   strings and JSX `tone="blue"` attributes were missed, leaving classes with no
   matching CSS rule. Found by diffing emitted class names against defined
   selectors, not by reading the diff.
3. **`.identity-chip.brand` was never styled** — and had been broken as
   `.identity-chip.lime` since it was written, rendering the autonomy-tier chip
   as a default grey chip. Rule added.
4. **A class-name collision the rename created.** The `brand` tone value
   collides with `.brand`, the sidebar wordmark, which sits in `@layer surfaces`
   and therefore beat `.surface-chip.brand` in `@layer primitives` — brand chips
   rendered at 17px Manrope with the wordmark's padding. The wordmark is one
   component with one call site and had no business claiming the bare word; it
   is now `.brand-lockup`.

### Still open

`outcomeTones` in `CaseSetStudio.tsx` maps four expected outcomes
(PLAN / CLARIFICATION / APPROVAL / ABSTENTION) onto status tones. By the rule
above these are categorical too — an abstention is not a warning. They were left
alone because the eight-colour ramp cannot separately encode seven case types
*and* four outcomes on the same row, and the better fix is probably to stop
colouring the outcome chip at all rather than to give it a second palette. That
is a design decision, not a mechanical one.

## Reproducing

The generator and audit scripts are throwaway (OKLCH→sRGB, WCAG contrast, CVD
simulation, ~150 lines total, no dependencies). If the ramps are adopted they
should move into `scripts/` and run in CI alongside `pnpm ux:check`, so a
hand-edited hex that breaks a contrast target fails the build rather than
shipping.
