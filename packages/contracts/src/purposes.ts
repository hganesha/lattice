import type { RiskTierDerivation } from './evolution.js'
import type { ContextContract, DeclaredPurpose, EvidenceStrength, RiskTier } from './types.js'

/**
 * Closed purpose taxonomy (E4, decision §11.2).
 *
 * Ownership: this is the *global* registry. A workspace narrows it by domain; a contract
 * never invents a purpose. Purpose is declared by the caller and is never inferred from
 * the question text — see docs/BV-improvements.md §3.
 */
export const purposeCatalog: readonly DeclaredPurpose[] = [
  {
    id: 'situational_awareness',
    label: 'Situational awareness',
    description: 'Read governed context to understand the current state. No decision is taken from the answer.',
    audience: 'INTERNAL',
    reversibility: 'REVERSIBLE',
    baseRiskTier: 'INFORMATIONAL',
    domains: [],
  },
  {
    id: 'internal_analysis',
    label: 'Internal analysis',
    description: 'Analyse governed context for an internal study, model input, or exploratory question.',
    audience: 'INTERNAL',
    reversibility: 'REVERSIBLE',
    baseRiskTier: 'ANALYTICAL',
    domains: [],
  },
  {
    id: 'regulatory_reporting',
    label: 'Regulatory reporting',
    description: 'Produce a figure or narrative that will be filed with, or shown to, a regulator.',
    audience: 'REGULATOR',
    reversibility: 'PARTIALLY_REVERSIBLE',
    baseRiskTier: 'PLANNING_DECISION',
    domains: [],
  },
  {
    id: 'customer_communication',
    label: 'Customer communication',
    description: 'Answer that will be shown to, or relied on by, a customer or claimant.',
    audience: 'CUSTOMER',
    reversibility: 'PARTIALLY_REVERSIBLE',
    baseRiskTier: 'PLANNING_DECISION',
    domains: [],
  },
  {
    id: 'planning_decision',
    label: 'Planning decision',
    description: 'Input to a decision that commits budget, capacity, limits, or scheduling.',
    audience: 'INTERNAL',
    reversibility: 'PARTIALLY_REVERSIBLE',
    baseRiskTier: 'PLANNING_DECISION',
    domains: [],
  },
  {
    id: 'operational_action',
    label: 'Operational action',
    description: 'Drives an action in an operational system — dispatch, hold, release, suspend, pay.',
    audience: 'INTERNAL',
    reversibility: 'IRREVERSIBLE',
    baseRiskTier: 'OPERATIONAL_ACTION',
    domains: [],
  },
  {
    id: 'risk_limit_decision',
    label: 'Risk or limit decision',
    description: 'Sets, breaches, or releases a risk limit, exposure cap, or concentration threshold.',
    audience: 'INTERNAL',
    reversibility: 'PARTIALLY_REVERSIBLE',
    baseRiskTier: 'PLANNING_DECISION',
    domains: ['financial-services', 'insurance', 'energy'],
  },
  {
    id: 'clinical_coverage_decision',
    label: 'Clinical coverage decision',
    description: 'Approves, denies, or requests information on a coverage or authorization request.',
    audience: 'CUSTOMER',
    reversibility: 'PARTIALLY_REVERSIBLE',
    baseRiskTier: 'OPERATIONAL_ACTION',
    domains: ['healthcare'],
  },
  {
    id: 'safety_disposition',
    label: 'Safety disposition',
    description: 'Quarantines, releases, or escalates a product, asset, or site on safety grounds.',
    audience: 'INTERNAL',
    reversibility: 'IRREVERSIBLE',
    baseRiskTier: 'OPERATIONAL_ACTION',
    domains: ['manufacturing', 'energy', 'healthcare'],
  },
] as const

export const defaultPurposeId = 'situational_awareness'

/** Contract domains are written `financial_services` while pack ids use `financial-services`. */
function normalizeDomain(domain: string): string {
  return domain.trim().toLocaleLowerCase().replaceAll('_', '-')
}

export function purposesForDomain(domain: string): DeclaredPurpose[] {
  const needle = normalizeDomain(domain)
  return purposeCatalog.filter((purpose) => (purpose.domains ?? []).length === 0 || (purpose.domains ?? []).some((candidate: string) => normalizeDomain(candidate) === needle))
}

export function findPurpose(purposeId: string | undefined, declared: readonly DeclaredPurpose[] = []): DeclaredPurpose | undefined {
  // A purpose the contract declares wins over the global catalogue entry of the same id.
  return declared.find((purpose) => purpose.id === purposeId) ?? purposeCatalog.find((purpose) => purpose.id === purposeId)
}

const riskOrder: RiskTier[] = ['INFORMATIONAL', 'ANALYTICAL', 'PLANNING_DECISION', 'OPERATIONAL_ACTION']

export function maxRiskTier(a: RiskTier, b: RiskTier): RiskTier {
  return riskOrder.indexOf(a) >= riskOrder.indexOf(b) ? a : b
}

export function riskTierAtLeast(candidate: RiskTier, floor: RiskTier): boolean {
  return riskOrder.indexOf(candidate) >= riskOrder.indexOf(floor)
}

const strengthFloor: Record<RiskTier, EvidenceStrength> = {
  INFORMATIONAL: 'WEAK',
  ANALYTICAL: 'MODERATE',
  PLANNING_DECISION: 'STRONG',
  OPERATIONAL_ACTION: 'EXACT',
}

/**
 * Derives the risk tier from `purpose × contract × operation` — never from the question text.
 * The operation may raise the tier above the purpose floor; it can never lower it.
 */
export function deriveRiskTier(contract: ContextContract, purposeId: string, operationId?: string): RiskTierDerivation {
  const purpose = findPurpose(purposeId, contract.purposes ?? []) ?? findPurpose(defaultPurposeId)!
  // A contract-declared purpose need not state a floor; it starts at INFORMATIONAL and the
  // operation raises it. The operation can never lower whatever floor the purpose does state.
  const purposeTier: RiskTier = purpose.baseRiskTier ?? 'INFORMATIONAL'
  const operation = operationId ? contract.operations.find((candidate) => candidate.id === operationId) : undefined
  const riskTier = operation ? maxRiskTier(purposeTier, operation.riskTier) : purposeTier
  const policy = contract.policies.find((candidate) => candidate.riskTier === riskTier)
    ?? [...contract.policies].sort((a, b) => riskOrder.indexOf(b.riskTier) - riskOrder.indexOf(a.riskTier)).find((candidate) => riskTierAtLeast(candidate.riskTier, riskTier))

  return {
    riskTier,
    purposeId: purpose.id,
    purposeTier,
    ...(operation ? { operationTier: operation.riskTier, operationId: operation.id } : {}),
    reason: operation
      ? `${purpose.label} (${purposeTier.replaceAll('_', ' ').toLocaleLowerCase()}) combined with ${operation.label} (${operation.riskTier.replaceAll('_', ' ').toLocaleLowerCase()}).`
      : `${purpose.label} declares a ${purposeTier.replaceAll('_', ' ').toLocaleLowerCase()} floor; no operation is bound yet.`,
    minimumEvidenceStrength: policy?.minimumEvidenceStrength ?? strengthFloor[riskTier],
    maximumEvidenceAgeMinutes: policy?.maximumEvidenceAgeMinutes ?? (riskTier === 'OPERATIONAL_ACTION' ? 15 : riskTier === 'PLANNING_DECISION' ? 120 : 1440),
    approvalRequired: policy?.approvalRequired ?? riskTier === 'OPERATIONAL_ACTION',
    ...(policy ? { policyId: policy.id } : {}),
  }
}
