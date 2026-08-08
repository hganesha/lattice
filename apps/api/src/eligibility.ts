import {
  assuranceAtLeast,
  permittedUseLabels,
  permittedUseOrder,
  permittedUseRiskTier,
  useAssuranceFloor,
  type AssuranceRun,
  type ContextContract,
  type ContractRegistryEntry,
  type DeploymentStatus,
  type DispositionRecord,
  type DriftEvent,
  type EligibilityCell,
  type EligibilityMatrix,
  type EvidenceAssuranceLevel,
  type FourAxisState,
  type GovernanceStatus,
  type GuardrailPolicy,
  type PermittedUse,
  type ReviewRequestArtifact,
  type SourceBinding,
  type SourceHealth,
} from '@lattice/contracts'

export interface EligibilityInput {
  entry: ContractRegistryEntry
  contract: ContextContract
  assuranceRuns: AssuranceRun[]
  reviews: ReviewRequestArtifact[]
  driftEvents: DriftEvent[]
  dispositions: DispositionRecord[]
  /** An unattended action needs a live grant that reaches the operational tier. */
  autonomousGrantAvailable: boolean
  now?: Date
}

/**
 * Per-use eligibility (E11). The four axes are the explanation; the headline is the highest use
 * permitted right now. There is deliberately no composite score anywhere in this file.
 */
export function buildEligibility(input: EligibilityInput): EligibilityMatrix[] {
  const now = input.now ?? new Date()
  const computedAt = now.toISOString()
  const deployment = deploymentStatusFor(input.entry, input.contract, input.dispositions)
  const openReviews = input.reviews.filter((review) => review.status === 'OPEN')
  const openDrift = input.driftEvents.filter((event) => event.status === 'OPEN' || event.status === 'ACKNOWLEDGED')
  const matrices: EligibilityMatrix[] = []

  const contractHealth = worstHealth(input.contract.bindings.map((binding) => bindingHealth(binding, openDrift)))
  const contractState: FourAxisState = {
    evidenceAssurance: input.contract.state?.evidenceAssurance ?? contractAssurance(input.contract, input.assuranceRuns),
    governanceStatus: input.contract.state?.governanceStatus ?? contractGovernance(input.contract, openReviews),
    deploymentStatus: input.contract.state?.deploymentStatus ?? deployment,
    sourceHealth: input.contract.state?.sourceHealth ?? contractHealth,
  }
  matrices.push(matrix('CONTRACT', input.contract.id, input.contract.name, contractState, computedAt, input.autonomousGrantAvailable))

  for (const binding of input.contract.bindings) {
    const state: FourAxisState = {
      evidenceAssurance: binding.state?.evidenceAssurance ?? bindingAssurance(binding, now),
      governanceStatus: binding.state?.governanceStatus ?? subjectGovernance(binding.approvalStatus, openReviews.some((review) => review.targetKind === 'SOURCE_BINDING' && review.targetId === binding.id)),
      deploymentStatus: binding.state?.deploymentStatus ?? deployment,
      sourceHealth: binding.state?.sourceHealth ?? bindingHealth(binding, openDrift),
    }
    matrices.push(matrix('SOURCE_BINDING', binding.id, binding.sourceSystem, state, computedAt, input.autonomousGrantAvailable))
  }

  for (const policy of input.contract.policies) {
    const state: FourAxisState = {
      evidenceAssurance: policyAssurance(policy, input.assuranceRuns),
      governanceStatus: subjectGovernance(policy.approvalStatus, openReviews.some((review) => review.targetKind === 'POLICY' && review.targetId === policy.id)),
      deploymentStatus: deployment,
      sourceHealth: contractHealth,
    }
    matrices.push(matrix('POLICY', policy.id, policy.label, state, computedAt, input.autonomousGrantAvailable))
  }

  return matrices
}

function matrix(
  subjectKind: EligibilityMatrix['subjectKind'],
  subjectId: string,
  subjectLabel: string,
  state: FourAxisState,
  computedAt: string,
  autonomousGrantAvailable: boolean,
): EligibilityMatrix {
  const cells = permittedUseOrder.map((use) => cellFor(use, state, autonomousGrantAvailable))
  const highest = [...cells].reverse().find((cell) => cell.permitted)
  const firstBlocked = cells.find((cell) => !cell.permitted)
  const primaryAnswer = highest
    ? `${subjectLabel} is cleared up to ${permittedUseLabels[highest.use].toLocaleLowerCase()}${firstBlocked ? `; ${permittedUseLabels[firstBlocked.use].toLocaleLowerCase()} is blocked because ${firstBlocked.blockedBy.join(' and ')}.` : '.'}`
    : `${subjectLabel} permits no use right now because ${cells[0]?.blockedBy.join(' and ') ?? 'its state is unknown'}.`
  return { subjectKind, subjectId, subjectLabel, computedAt, state, primaryAnswer, cells }
}

function cellFor(use: PermittedUse, state: FourAxisState, autonomousGrantAvailable: boolean): EligibilityCell {
  const floor = useAssuranceFloor[use]
  const blockedBy: string[] = []

  if (!assuranceAtLeast(state.evidenceAssurance, floor)) blockedBy.push(`evidence assurance is ${state.evidenceAssurance.toLocaleLowerCase()} and ${floor.toLocaleLowerCase()} is required`)

  const informationalOnly = use === 'INFORMATIONAL_READ'
  if (state.governanceStatus === 'UNGOVERNED' || state.governanceStatus === 'REVOKED') blockedBy.push(`governance status is ${state.governanceStatus.toLocaleLowerCase()}`)
  else if (state.governanceStatus !== 'APPROVED' && !informationalOnly) blockedBy.push(`governance status is ${state.governanceStatus.replaceAll('_', ' ').toLocaleLowerCase()} rather than approved`)

  if (state.deploymentStatus === 'SHADOW' && !informationalOnly) blockedBy.push('the contract is only deployed in shadow, where dispositions explain but do not authorize')
  else if (state.deploymentStatus !== 'ACTIVE' && state.deploymentStatus !== 'SHADOW') blockedBy.push(`deployment status is ${state.deploymentStatus.toLocaleLowerCase()}`)

  if (state.sourceHealth === 'BROKEN') blockedBy.push('a bound source is broken')
  else if (state.sourceHealth === 'DEGRADED' && use !== 'INFORMATIONAL_READ' && use !== 'ANALYTICAL_REPORTING') blockedBy.push('a bound source is degraded')
  else if (state.sourceHealth === 'UNKNOWN' && !informationalOnly) blockedBy.push('source health has never been established')

  if (use === 'AUTONOMOUS_ACTION' && !autonomousGrantAvailable) blockedBy.push('no active delegation grant reaches the operational-action tier')

  return { use, riskTier: permittedUseRiskTier[use], permitted: blockedBy.length === 0, requiredEvidenceAssurance: floor, blockedBy }
}

/* ------------------------------------------------------------------ *
 * Axis derivation — every value below comes from stored state.
 * ------------------------------------------------------------------ */

function contractAssurance(contract: ContextContract, assuranceRuns: AssuranceRun[]): EvidenceAssuranceLevel {
  if (contract.evidence.length === 0) return 'UNVERIFIED'
  const evidenced = contract.evidence.filter((record) => record.status === 'DIRECTLY_EVIDENCED').length
  const conflicting = contract.evidence.some((record) => record.status === 'CONFLICTING' || record.status === 'UNVERIFIED')
  const latest = [...assuranceRuns].sort((left, right) => left.completedAt.localeCompare(right.completedAt)).at(-1)
  const certified = contract.bindings.length > 0 && contract.bindings.every((binding) => binding.certification !== undefined)
  if (conflicting) return 'OBSERVED'
  if (evidenced === 0) return 'OBSERVED'
  if (evidenced < contract.evidence.length) return 'CORROBORATED'
  if (!latest || latest.status === 'FAIL') return 'CORROBORATED'
  return certified ? 'CERTIFIED' : 'VALIDATED'
}

function policyAssurance(policy: GuardrailPolicy, assuranceRuns: AssuranceRun[]): EvidenceAssuranceLevel {
  const latest = [...assuranceRuns].sort((left, right) => left.completedAt.localeCompare(right.completedAt)).at(-1)
  const policyChecks = latest?.checks.filter((check) => check.category === 'POLICY') ?? []
  if (policyChecks.length === 0) return 'OBSERVED'
  if (policyChecks.some((check) => check.status === 'FAIL')) return 'OBSERVED'
  if (policyChecks.some((check) => check.status === 'WARNING')) return 'CORROBORATED'
  return isApproved(policy.approvalStatus) ? 'VALIDATED' : 'CORROBORATED'
}

function bindingAssurance(binding: SourceBinding, now: Date): EvidenceAssuranceLevel {
  const certification = binding.certification
  const certified = certification !== undefined && (!certification.expiresAt || new Date(certification.expiresAt).getTime() > now.getTime())
  if (certified && isApproved(binding.approvalStatus)) return 'CERTIFIED'
  if (binding.healthStatus === 'INVALID') return 'UNVERIFIED'
  if (!isApproved(binding.approvalStatus)) return binding.healthStatus === 'VALID' ? 'CORROBORATED' : 'OBSERVED'
  if (binding.healthStatus === 'VALID' && (binding.mappings ?? []).length > 0) return 'VALIDATED'
  return 'CORROBORATED'
}

function contractGovernance(contract: ContextContract, openReviews: ReviewRequestArtifact[]): GovernanceStatus {
  if (openReviews.length > 0) return 'UNDER_REVIEW'
  if (contract.entityTypes.length === 0) return 'UNGOVERNED'
  if (contract.entityTypes.some((type) => type.approvalStatus === 'REJECTED')) return 'REVOKED'
  if (contract.entityTypes.every((type) => isApproved(type.approvalStatus)) && contract.policies.every((policy) => isApproved(policy.approvalStatus))) return 'APPROVED'
  if (contract.entityTypes.some((type) => type.approvalStatus === 'IN_REVIEW')) return 'UNDER_REVIEW'
  return 'PROPOSED'
}

function subjectGovernance(approvalStatus: string, underReview: boolean): GovernanceStatus {
  if (approvalStatus === 'REJECTED' || approvalStatus === 'DEPRECATED' || approvalStatus === 'SUPERSEDED') return 'REVOKED'
  if (underReview || approvalStatus === 'IN_REVIEW') return 'UNDER_REVIEW'
  if (isApproved(approvalStatus)) return 'APPROVED'
  return 'PROPOSED'
}

/** SHADOW is the honest name for a contract that has only ever produced dry-run dispositions. */
function deploymentStatusFor(entry: ContractRegistryEntry, contract: ContextContract, dispositions: DispositionRecord[]): DeploymentStatus {
  if (contract.releaseStatus === 'RETIRED') return 'RETIRED'
  if (entry.runtimeStatus === 'SUSPENDED') return 'SUSPENDED'
  if (entry.releases.length > 0 && entry.runtimeStatus === 'ACTIVE') return 'ACTIVE'
  const forContract = dispositions.filter((record) => record.contractId === contract.id)
  if (forContract.length > 0 && forContract.every((record) => record.mode === 'DRY_RUN')) return 'SHADOW'
  return 'NONE'
}

function bindingHealth(binding: SourceBinding, openDrift: DriftEvent[]): SourceHealth {
  const related = openDrift.filter((event) => event.subject.id === binding.id || event.subject.label.startsWith(binding.sourceSystem))
  if (binding.healthStatus === 'INVALID' || related.some((event) => event.severity === 'CRITICAL')) return 'BROKEN'
  if (binding.healthStatus === 'WARNING' || related.length > 0) return 'DEGRADED'
  if (binding.healthStatus === 'VALID') return 'HEALTHY'
  return 'UNKNOWN'
}

function worstHealth(values: SourceHealth[]): SourceHealth {
  if (values.length === 0) return 'UNKNOWN'
  if (values.includes('BROKEN')) return 'BROKEN'
  if (values.includes('DEGRADED')) return 'DEGRADED'
  if (values.includes('UNKNOWN')) return 'UNKNOWN'
  return 'HEALTHY'
}

function isApproved(status: string): boolean {
  return status === 'APPROVED' || status === 'APPROVED_WITH_EXCEPTION'
}
