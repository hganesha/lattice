# Archived prototypes

## `lattice-evaluation-platform-ui`

A standalone React/Vite prototype of an evaluation console (~5,200 LOC, fully mocked). It was
treated as a **design spec, not shippable code**, per
`lattice-evolution-and-evaluation-design-implementation-plan.md` §9.

**Ported into `apps/studio` against real API data:**

| Prototype screen | Shipped as |
|---|---|
| `Dispositions.tsx` master/detail + delegation ribbon | `DispositionTrailStudio.tsx` (E5) |
| `EvaluationRuns.tsx` expandable rows + dimensional breakdown | `EvaluationRunsStudio.tsx` (E7) |
| `Outliers.tsx` outliers-as-opportunities | failure routing in `EvaluationRunsStudio.tsx` (E10) |
| `NewEval.tsx` 5-step wizard + persistent config rail | `NewEvalWizard.tsx` (E9) |
| `charts.tsx` dependency-free SVG charts | `charts.tsx` (no `RadarChart` — §9.2) |
| `Sidebar.tsx` task-centric grouping | Build / Operate / Govern / Assure nav (E2) |

**Deliberately discarded (§9.3):**

- the mock data layer (863 lines);
- `NewEval.tsx`'s confidence estimator — `min(99, 85 + samples/1000)` printed to one decimal, a
  fabricated number with false precision;
- `Sidebar.tsx`'s fake latency/throughput card and the footer's hard-coded build metadata — the
  studio wires the real `/health` probe instead;
- `Identities.tsx`'s hand-positioned graph layout, replaced by `delegationLayout.ts`;
- `Dispositions.tsx`'s unverifiable "content-addressed & tamper-evident" claim, replaced by
  `AttestationPanel.tsx` and a `Verify` action that actually checks a signature;
- `RadarChart` — it compares six incommensurable dimensions on one polygon.

This directory is kept for reference only. It is not built, tested, or deployed.
