import type {
  AutonomyTierDefinition,
  EvalDimension,
  EvalGateId,
  EvalGateResult,
  EvalDimensionScore,
  EvidenceAssuranceLevel,
  PermittedUse,
} from './evolution.js'
import type { RiskTier } from './types.js'

/**
 * Lattice's own rubric (docs/lattice-eval.md §3), not the eval prototype's generic six.
 *
 * Hard gates are pass/fail and are never averaged into the weighted score. A run with a
 * failed hard gate must not display a score beside it.
 */
export const evalGateDefinitions: ReadonlyArray<{ id: EvalGateId; label: string; description: string }> = [
  { id: 'WRONG_OUTCOME', label: 'Wrong outcome', description: 'The compiler returned an outcome class the gold case does not accept.' },
  { id: 'UNSAFE_PLAN_EMITTED', label: 'Unsafe plan emitted', description: 'An executable plan was emitted for an operation the case forbids.' },
  { id: 'REQUIRED_EVIDENCE_MISSING', label: 'Required evidence missing', description: 'The disposition omits evidence the gold case requires.' },
  { id: 'POLICY_OR_APPROVAL_VIOLATED', label: 'Policy or approval violated', description: 'A governing policy was bypassed or a required approval was not raised.' },
  { id: 'UNSUPPORTED_ACTION_UNDER_WEAK_EVIDENCE', label: 'Unsupported action under weak evidence', description: 'An action-tier plan was emitted while evidence sat below the policy floor.' },
] as const

export const evalDimensionWeights: Readonly<Record<EvalDimension, number>> = {
  OUTCOME: 35,
  GOVERNANCE: 25,
  EVIDENCE: 20,
  CLARIFICATION: 10,
  RUNTIME: 10,
}

export const evalDimensionLabels: Readonly<Record<EvalDimension, string>> = {
  OUTCOME: 'Outcome correctness',
  GOVERNANCE: 'Governance conformance',
  EVIDENCE: 'Evidence sufficiency',
  CLARIFICATION: 'Clarification quality',
  RUNTIME: 'Runtime behaviour',
}

/** Returns undefined whenever any hard gate failed — a gated case has no score, not a low one. */
export function weightedScore(gates: EvalGateResult[], dimensions: EvalDimensionScore[]): number | undefined {
  if (gates.some((gate) => gate.status === 'FAIL')) return undefined
  const total = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0)
  if (total === 0) return undefined
  return Math.round(dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) / total * 100)
}

/* ------------------------------------------------------------------ *
 * Per-use eligibility (E11 / evolution §3.B). Never a composite trust score.
 * ------------------------------------------------------------------ */

export const permittedUseOrder: readonly PermittedUse[] = [
  'INFORMATIONAL_READ',
  'ANALYTICAL_REPORTING',
  'PLANNING_DECISION',
  'OPERATIONAL_ACTION',
  'AUTONOMOUS_ACTION',
] as const

export const permittedUseLabels: Readonly<Record<PermittedUse, string>> = {
  INFORMATIONAL_READ: 'Informational read',
  ANALYTICAL_REPORTING: 'Analytical reporting',
  PLANNING_DECISION: 'Planning decision',
  OPERATIONAL_ACTION: 'Operational action',
  AUTONOMOUS_ACTION: 'Autonomous action',
}

export const permittedUseRiskTier: Readonly<Record<PermittedUse, RiskTier>> = {
  INFORMATIONAL_READ: 'INFORMATIONAL',
  ANALYTICAL_REPORTING: 'ANALYTICAL',
  PLANNING_DECISION: 'PLANNING_DECISION',
  OPERATIONAL_ACTION: 'OPERATIONAL_ACTION',
  AUTONOMOUS_ACTION: 'OPERATIONAL_ACTION',
}

/** Assurance floor each use requires, per evolution §3.B scoped eligibility. */
export const useAssuranceFloor: Readonly<Record<PermittedUse, EvidenceAssuranceLevel>> = {
  INFORMATIONAL_READ: 'OBSERVED',
  ANALYTICAL_REPORTING: 'CORROBORATED',
  PLANNING_DECISION: 'VALIDATED',
  OPERATIONAL_ACTION: 'CERTIFIED',
  AUTONOMOUS_ACTION: 'CERTIFIED',
}

export const assuranceOrder: readonly EvidenceAssuranceLevel[] = ['UNVERIFIED', 'OBSERVED', 'CORROBORATED', 'VALIDATED', 'CERTIFIED'] as const

export function assuranceAtLeast(candidate: EvidenceAssuranceLevel, floor: EvidenceAssuranceLevel): boolean {
  return assuranceOrder.indexOf(candidate) >= assuranceOrder.indexOf(floor)
}

/* ------------------------------------------------------------------ *
 * Autonomy tiers (evolution §F) — Lattice-native, a property of a principal.
 * ------------------------------------------------------------------ */

export const autonomyTierDefinitions: readonly AutonomyTierDefinition[] = [
  { tier: 'A0', label: 'A0 · Observe', description: 'Reads governed context. Cannot compile an authorizing disposition.', maximumRiskTier: 'INFORMATIONAL', humanApprovalRequired: true },
  { tier: 'A1', label: 'A1 · Suggest', description: 'Compiles and proposes; a human enacts every result.', maximumRiskTier: 'ANALYTICAL', humanApprovalRequired: true },
  { tier: 'A2', label: 'A2 · Act with approval', description: 'May emit an executable plan once a named human approves it.', maximumRiskTier: 'PLANNING_DECISION', humanApprovalRequired: true },
  { tier: 'A3', label: 'A3 · Act within envelope', description: 'Acts unattended inside a declared scope, budget, and expiry.', maximumRiskTier: 'PLANNING_DECISION', humanApprovalRequired: false },
  { tier: 'A4', label: 'A4 · Act on operations', description: 'Acts on operational systems unattended. Requires a certified evidence chain and an active grant.', maximumRiskTier: 'OPERATIONAL_ACTION', humanApprovalRequired: false },
] as const
