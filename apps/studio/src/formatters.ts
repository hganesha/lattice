import type { EvalCaseType, EvalDiffStatus, EvalGateId, ReleaseRuntimeStatus, ReleaseStatus, RuntimeDecision, ImpactLevel, RiskTier } from '@lattice/contracts'

/** Display helpers shared by the new surfaces so tone mapping is defined once. */

/**
 * Status tones. A tone names what a value *means*, never the paint used to draw
 * it, so a status can't be silently restyled by someone reaching for a colour.
 *
 * Reserved for values that carry valence or ordering — something is passing,
 * needs attention, or has failed. Data whose values are merely *different* from
 * one another belongs on `CategoryTone`: colouring a category green implies it
 * is the good one.
 */
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'governance' | 'neutral'

/**
 * Categorical tones for mutually-exclusive kinds with no ordering — eval case
 * types, domain groups, node classes.
 *
 * The eight are OKLCH-spaced with staggered lightness, chosen by search to
 * maximise worst-case separation under simulated deuteranopia and protanopia.
 * See docs/token-audit.md. Colour is never the only signal on these surfaces:
 * every chip keeps its label and every canvas its legend.
 */
export type CategoryTone = 'cat-1' | 'cat-2' | 'cat-3' | 'cat-4' | 'cat-5' | 'cat-6' | 'cat-7' | 'cat-8'

/** Anything that can tint a chip, dot or chart mark. */
export type ChartTone = Tone | CategoryTone

/**
 * Eval case types are a categorical axis, not a status one. The previous
 * mapping read HAPPY_PATH as "success" and ADVERSARIAL as "danger", which
 * implied a verdict the case type does not carry — a happy-path case has not
 * passed anything merely by existing.
 */
export function caseTypeTone(caseType: EvalCaseType): CategoryTone {
  const order: Readonly<Record<EvalCaseType, CategoryTone>> = {
    HAPPY_PATH: 'cat-1',
    REGRESSION: 'cat-2',
    AMBIGUITY: 'cat-3',
    APPROVAL: 'cat-4',
    ABSTENTION: 'cat-5',
    ADVERSARIAL: 'cat-6',
    CROSS_DOMAIN: 'cat-7',
  }
  return order[caseType]
}

export function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())
}

export function sentenceCase(value: string): string {
  const spaced = value.replaceAll('_', ' ').toLocaleLowerCase()
  return spaced.charAt(0).toLocaleUpperCase() + spaced.slice(1)
}

export function decisionTone(decision: RuntimeDecision): Tone {
  if (decision === 'RESOLVED') return 'success'
  if (decision === 'CLARIFICATION_REQUIRED') return 'info'
  if (decision === 'APPROVAL_REQUIRED') return 'governance'
  if (decision === 'DENIED' || decision === 'UNSUPPORTED') return 'danger'
  return 'warning'
}

export function riskTone(riskTier: RiskTier): Tone {
  if (riskTier === 'OPERATIONAL_ACTION') return 'danger'
  if (riskTier === 'PLANNING_DECISION') return 'warning'
  if (riskTier === 'ANALYTICAL') return 'info'
  return 'neutral'
}

export function impactTone(impact: ImpactLevel): Tone {
  if (impact === 'CRITICAL') return 'danger'
  if (impact === 'HIGH') return 'warning'
  if (impact === 'MEDIUM') return 'info'
  return 'neutral'
}

/**
 * An unpublished contract is `warning`, not `neutral`: it is the state in which
 * nothing the contract says can authorize anything, which is the single most
 * consequential fact a surface can tell an author about the object they are
 * editing. This matches the contract-status summary card.
 */
export function releaseTone(status: ReleaseStatus): Tone {
  if (status === 'PUBLISHED') return 'success'
  if (status === 'CANDIDATE') return 'info'
  if (status === 'SUSPENDED' || status === 'RETIRED') return 'danger'
  return 'warning'
}

export function runtimeTone(status: ReleaseRuntimeStatus): Tone {
  if (status === 'ACTIVE') return 'success'
  if (status === 'SUSPENDED') return 'danger'
  return 'warning'
}

export function diffTone(status: EvalDiffStatus): Tone {
  if (status === 'FIXED') return 'success'
  if (status === 'REGRESSED') return 'danger'
  if (status === 'NEW') return 'info'
  if (status === 'UNCHANGED_FAIL') return 'warning'
  if (status === 'REMOVED') return 'neutral'
  return 'neutral'
}

export const gateShortLabels: Readonly<Record<EvalGateId, string>> = {
  WRONG_OUTCOME: 'Outcome',
  UNSAFE_PLAN_EMITTED: 'Unsafe plan',
  REQUIRED_EVIDENCE_MISSING: 'Evidence',
  POLICY_OR_APPROVAL_VIOLATED: 'Policy',
  UNSUPPORTED_ACTION_UNDER_WEAK_EVIDENCE: 'Weak evidence',
}

/** Short digest for dense tables. Keeps the algorithm prefix so it is never mistaken for an id. */
export function shortDigest(digest: string | undefined): string {
  if (!digest) return '—'
  const [algorithm, value] = digest.split(':')
  return value ? `${algorithm}:${value.slice(0, 10)}…` : `${digest.slice(0, 12)}…`
}

export function durationLabel(milliseconds: number): string {
  // The local harness is sub-millisecond; rounding to "0 ms" reads as a missing measurement.
  if (milliseconds > 0 && milliseconds < 1) return '<1 ms'
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)} s`
  return `${Math.round(milliseconds / 60_000)} min`
}
