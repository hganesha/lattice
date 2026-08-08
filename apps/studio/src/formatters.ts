import type { EvalDiffStatus, EvalGateId, RuntimeDecision, ImpactLevel, RiskTier } from '@lattice/contracts'

/** Display helpers shared by the new surfaces so tone mapping is defined once. */

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'lime' | 'violet' | 'muted'

export function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())
}

export function sentenceCase(value: string): string {
  const spaced = value.replaceAll('_', ' ').toLocaleLowerCase()
  return spaced.charAt(0).toLocaleUpperCase() + spaced.slice(1)
}

export function decisionTone(decision: RuntimeDecision): Tone {
  if (decision === 'RESOLVED') return 'green'
  if (decision === 'CLARIFICATION_REQUIRED') return 'blue'
  if (decision === 'APPROVAL_REQUIRED') return 'violet'
  if (decision === 'DENIED' || decision === 'UNSUPPORTED') return 'red'
  return 'amber'
}

export function riskTone(riskTier: RiskTier): Tone {
  if (riskTier === 'OPERATIONAL_ACTION') return 'red'
  if (riskTier === 'PLANNING_DECISION') return 'amber'
  if (riskTier === 'ANALYTICAL') return 'blue'
  return 'muted'
}

export function impactTone(impact: ImpactLevel): Tone {
  if (impact === 'CRITICAL') return 'red'
  if (impact === 'HIGH') return 'amber'
  if (impact === 'MEDIUM') return 'blue'
  return 'muted'
}

export function diffTone(status: EvalDiffStatus): Tone {
  if (status === 'FIXED') return 'green'
  if (status === 'REGRESSED') return 'red'
  if (status === 'NEW') return 'blue'
  if (status === 'UNCHANGED_FAIL') return 'amber'
  if (status === 'REMOVED') return 'muted'
  return 'muted'
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
