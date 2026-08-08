import type {
  BlastRadius,
  BlastRadiusDependent,
  ContextContract,
  DispositionRecord,
  ImpactLevel,
  ReviewTargetKind,
  RiskTier,
} from '@lattice/contracts'

const highRiskTiers: readonly RiskTier[] = ['PLANNING_DECISION', 'OPERATIONAL_ACTION']

export interface BlastRadiusInput {
  contract: ContextContract
  workspaceId: string
  targetKind: ReviewTargetKind
  targetId: string
  /** Only what the retention window still holds; the count never claims the whole history. */
  dispositions: DispositionRecord[]
  now?: Date
}

/**
 * What depends on the target and what breaks if it changes (E17). Everything below is read out of
 * the contract graph and the retained trail — nothing is estimated.
 */
export function computeBlastRadius(input: BlastRadiusInput): BlastRadius {
  const { contract, targetId, targetKind } = input
  const base = `/w/${input.workspaceId}/c/${contract.id}`
  const dependents: BlastRadiusDependent[] = []

  const binding = targetKind === 'SOURCE_BINDING' ? contract.bindings.find((candidate) => candidate.id === targetId) : undefined
  const policy = targetKind === 'POLICY' ? contract.policies.find((candidate) => candidate.id === targetId) : undefined
  const entityType = targetKind === 'ENTITY_TYPE' ? contract.entityTypes.find((candidate) => candidate.id === targetId) : undefined

  const operations = contract.operations.filter((operation) => {
    if (binding) return operation.sourceBindingIds.includes(binding.id)
    if (policy) return operation.riskTier === policy.riskTier
    if (entityType) return operation.requiredEntityTypes.includes(entityType.id)
    return false
  })
  const operationIds = new Set(operations.map((operation) => operation.id))

  for (const operation of operations) {
    dependents.push({ kind: 'OPERATION', id: operation.id, label: operation.label, impact: operation.riskTier === 'OPERATIONAL_ACTION' ? 'CRITICAL' : operation.riskTier === 'PLANNING_DECISION' ? 'HIGH' : 'MEDIUM', route: `${base}/ontology` })
  }
  for (const question of contract.competencyQuestions.filter((candidate) => operationIds.has(candidate.operationId))) {
    dependents.push({ kind: 'COMPETENCY_QUESTION', id: question.id, label: question.question, impact: question.impact, route: `${base}/questions` })
  }
  const metricIds = new Set(operations.flatMap((operation) => operation.metricIds))
  for (const metric of contract.metrics.filter((candidate) => metricIds.has(candidate.id))) {
    dependents.push({ kind: 'METRIC', id: metric.id, label: metric.label, impact: 'HIGH', route: `${base}/metrics` })
  }
  const bindingIds = new Set(operations.flatMap((operation) => operation.sourceBindingIds))
  for (const item of contract.bindings.filter((candidate) => bindingIds.has(candidate.id) && candidate.id !== targetId)) {
    dependents.push({ kind: 'SOURCE_BINDING', id: item.id, label: item.sourceSystem, impact: 'HIGH', route: `${base}/bindings` })
  }
  const riskTiers = new Set(operations.map((operation) => operation.riskTier))
  for (const item of contract.policies.filter((candidate) => riskTiers.has(candidate.riskTier) && candidate.id !== targetId)) {
    dependents.push({ kind: 'POLICY', id: item.id, label: item.label, impact: item.riskTier === 'OPERATIONAL_ACTION' ? 'CRITICAL' : 'HIGH', route: `${base}/policies` })
  }
  if (binding) {
    const typeIds = new Set((binding.mappings ?? []).map((mapping) => mapping.targetTypeId))
    for (const type of contract.entityTypes.filter((candidate) => typeIds.has(candidate.id))) {
      dependents.push({ kind: 'ENTITY_TYPE', id: type.id, label: type.label, impact: type.impact, route: `${base}/ontology` })
    }
  }
  if (entityType) {
    for (const item of contract.bindings.filter((candidate) => (candidate.mappings ?? []).some((mapping) => mapping.targetTypeId === entityType.id))) {
      dependents.push({ kind: 'SOURCE_BINDING', id: item.id, label: item.sourceSystem, impact: 'HIGH', route: `${base}/bindings` })
    }
  }

  const seen = new Set<string>()
  const unique = dependents.filter((dependent) => {
    const key = `${dependent.kind}:${dependent.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const touched = input.dispositions.filter((record) => record.contractId === contract.id && touches(record, targetId, operationIds))
  const highRiskAffected = touched.filter((record) => highRiskTiers.includes(record.riskTier)).length
  const label = binding?.sourceSystem ?? policy?.label ?? entityType?.label ?? targetId

  return {
    subjectKind: targetKind,
    subjectId: targetId,
    computedAt: (input.now ?? new Date()).toISOString(),
    dependents: unique,
    affectedDispositions: touched.length,
    highRiskAffected,
    summary: touched.length === 0
      ? `${unique.length} governed claim${unique.length === 1 ? '' : 's'} depend on ${label}; no retained disposition used it.`
      : `${unique.length} governed claim${unique.length === 1 ? '' : 's'} depend on ${label}, and ${touched.length} retained disposition${touched.length === 1 ? '' : 's'} used it, ${highRiskAffected} of them high-risk.`,
  }
}

function touches(record: DispositionRecord, targetId: string, operationIds: Set<string>): boolean {
  if (record.compilation.bindings.some((binding) => binding.id === targetId)) return true
  if (record.compilation.policies.some((policy) => policy.id === targetId)) return true
  if (record.compilation.metrics.some((metric) => metric.id === targetId)) return true
  return record.operationId !== undefined && operationIds.has(record.operationId)
}

export function impactOfTarget(contract: ContextContract, targetKind: ReviewTargetKind, targetId: string): ImpactLevel {
  if (targetKind === 'ENTITY_TYPE') return contract.entityTypes.find((type) => type.id === targetId)?.impact ?? 'MEDIUM'
  if (targetKind === 'POLICY') {
    const policy = contract.policies.find((candidate) => candidate.id === targetId)
    return policy?.riskTier === 'OPERATIONAL_ACTION' ? 'CRITICAL' : policy?.riskTier === 'PLANNING_DECISION' ? 'HIGH' : 'MEDIUM'
  }
  return 'HIGH'
}
