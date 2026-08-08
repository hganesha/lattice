import { createHash, randomUUID } from 'node:crypto'
import { ContextCompiler } from '@lattice/compiler-core'
import { connectorTemplate, materializeSimulatedContext, type AssuranceCheckResult, type AssuranceRun, type ContextContract } from '@lattice/contracts'

export function runAssurance(contract: ContextContract, now = new Date()): AssuranceRun {
  const startedAt = now.toISOString()
  const checks: AssuranceCheckResult[] = []
  const typeIds = new Set(contract.entityTypes.map((type) => type.id))
  const relationshipIds = new Set(contract.relationshipTypes.map((relationship) => relationship.id))
  const propertyIds = new Set(contract.entityTypes.flatMap((type) => type.properties.map((property) => property.id)))
  const bindingIds = new Set(contract.bindings.map((binding) => binding.id))

  checks.push(check(
    'structural.entity_model', 'STRUCTURAL', 'Ontology has governed entity types',
    contract.entityTypes.length > 0,
    contract.entityTypes.length > 0 ? `${contract.entityTypes.length} entity types are available.` : 'At least one entity type is required.',
    contract.entityTypes.map((type) => type.id),
  ))
  const endpointsValid = contract.relationshipTypes.every((relationship) => typeIds.has(relationship.sourceTypeId) && typeIds.has(relationship.targetTypeId))
  checks.push(check('structural.relationship_endpoints', 'STRUCTURAL', 'Relationship endpoints resolve', endpointsValid, endpointsValid ? `${contract.relationshipTypes.length} relationship definitions have valid endpoints.` : 'One or more relationship endpoints do not resolve.', [...relationshipIds]))
  const documented = contract.entityTypes.every((type) => type.description.trim() && type.properties.every((property) => property.description.trim()))
  checks.push(check('structural.documentation', 'STRUCTURAL', 'Semantic definitions are documented', documented, documented ? 'Entity types and properties include semantic descriptions.' : 'Every entity type and property needs a semantic description.', contract.entityTypes.map((type) => type.id)))
  const unapprovedTypes = contract.entityTypes.filter((type) => !isApproved(type.approvalStatus))
  if (unapprovedTypes.length > 0) checks.push(warning('release.semantic_approval', 'RELEASE', `${unapprovedTypes.length} semantic claims await approval`, 'Submit draft entity types to the Review Queue before publishing.', unapprovedTypes.map((type) => type.id)))
  else checks.push(check('release.semantic_approval', 'RELEASE', 'Semantic claims are approved', true, `${contract.entityTypes.length} entity types have governance approval.`, contract.entityTypes.map((type) => type.id)))

  for (const question of contract.competencyQuestions) {
    const operation = contract.operations.find((candidate) => candidate.id === question.operationId)
    checks.push(check(`question.${question.id}.operation`, 'QUESTION', `Competency question resolves to an operation`, Boolean(operation), operation ? `${question.question} → ${operation.label}` : `${question.question} is not linked to an implemented operation.`, [question.id, question.operationId]))
    if (!operation) continue
    const entityTypesValid = operation.requiredEntityTypes.length > 0 && operation.requiredEntityTypes.every((id) => typeIds.has(id))
    checks.push(check(`question.${question.id}.entities`, 'QUESTION', 'Operation requires valid entity context', entityTypesValid, entityTypesValid ? `Required context: ${operation.requiredEntityTypes.join(', ')}.` : 'The operation must require at least one valid ontology type.', [question.id, operation.id, ...operation.requiredEntityTypes]))
    const sourcesValid = operation.sourceBindingIds.length > 0 && operation.sourceBindingIds.every((id) => bindingIds.has(id))
    checks.push(check(`question.${question.id}.sources`, 'QUESTION', 'Operation has governed source bindings', sourcesValid, sourcesValid ? `${operation.sourceBindingIds.length} source bindings are available.` : 'The operation needs at least one valid source binding.', [question.id, operation.id, ...operation.sourceBindingIds]))
    const pathsValid = operation.relationshipPath.every((id) => relationshipIds.has(id))
    checks.push(check(`question.${question.id}.paths`, 'QUESTION', 'Operation relationship paths resolve', pathsValid, pathsValid ? 'All declared relationship paths resolve.' : 'One or more operation relationship paths are invalid.', [question.id, operation.id, ...operation.relationshipPath]))
  }

  for (const binding of contract.bindings) {
    const mappings = binding.mappings ?? []
    const mappingTargetsValid = mappings.length > 0 && mappings.every((mapping) => typeIds.has(mapping.targetTypeId) && propertyIds.has(mapping.targetPropertyId))
    checks.push(check(`mapping.${binding.id}.targets`, 'MAPPING', `${binding.sourceSystem} fields map to ontology properties`, mappingTargetsValid, mappingTargetsValid ? `${mappings.length} response fields have valid semantic targets.` : 'The binding needs at least one mapping and every target must resolve.', [binding.id, ...mappings.map((mapping) => mapping.targetPropertyId)]))
    const connectorReady = !binding.connector || (Boolean(binding.connector.credentialRef.trim()) && binding.connector.readOnly && connectorTemplate(binding.connector.provider).resourceFields.every((field) => binding.connector?.resource[field]?.trim()))
    const operational = binding.freshnessMinutes > 0 && binding.requiredPermissions.length > 0 && Boolean(binding.endpoint && binding.method) && connectorReady
    checks.push(check(`mapping.${binding.id}.runtime`, 'MAPPING', `${binding.sourceSystem} runtime contract is complete`, operational, operational ? `Freshness ≤ ${binding.freshnessMinutes} minutes; ${binding.requiredPermissions.length} permissions declared${binding.connector ? `; ${binding.connector.provider} via ${binding.connector.transport}.` : '.'}` : 'Endpoint, method, positive freshness, permissions, and a read-only external credential reference are required.', [binding.id]))
    if (!isApproved(binding.approvalStatus)) checks.push(warning(`release.${binding.id}.approval`, 'RELEASE', `${binding.sourceSystem} awaits approval`, 'The mapping is structurally valid but remains a draft governance claim.', [binding.id]))
  }

  const requiredRiskTiers = [...new Set(contract.operations.map((operation) => operation.riskTier))]
  const uncoveredRiskTiers = requiredRiskTiers.filter((riskTier) => !contract.policies.some((policy) => policy.riskTier === riskTier))
  if (requiredRiskTiers.length === 0 || uncoveredRiskTiers.length > 0) {
    const message = requiredRiskTiers.length === 0
      ? 'Add an implemented operation before assigning its runtime policy.'
      : `Add policy coverage for ${uncoveredRiskTiers.map((tier) => tier.replaceAll('_', ' ').toLocaleLowerCase()).join(', ')}.`
    checks.push(warning('policy.coverage', 'POLICY', 'Runtime policy coverage is incomplete', message, []))
  } else {
    checks.push(check('policy.coverage', 'POLICY', 'Every operation risk tier has a policy', true, `${requiredRiskTiers.length} operation risk tier${requiredRiskTiers.length === 1 ? '' : 's'} are governed.`, contract.policies.map((policy) => policy.id)))
  }

  const invalidPolicies = contract.policies.filter((policy) => !policy.label.trim() || !policy.description.trim() || !policy.owner.trim() || !policy.version.trim() || policy.maximumEvidenceAgeMinutes <= 0)
  checks.push(check('policy.validity', 'POLICY', 'Policy thresholds are complete', invalidPolicies.length === 0, invalidPolicies.length === 0 ? `${contract.policies.length} policies define owners, evidence thresholds, and positive freshness windows.` : `${invalidPolicies.length} policies have incomplete governance metadata or invalid thresholds.`, invalidPolicies.map((policy) => policy.id)))
  const unapprovedPolicies = contract.policies.filter((policy) => !isApproved(policy.approvalStatus))
  if (unapprovedPolicies.length > 0) checks.push(warning('release.policy_approval', 'RELEASE', `${unapprovedPolicies.length} runtime policies await approval`, 'Submit draft policy profiles to the Review Queue before publishing.', unapprovedPolicies.map((policy) => policy.id)))
  else if (contract.policies.length > 0) checks.push(check('release.policy_approval', 'RELEASE', 'Runtime policies are approved', true, `${contract.policies.length} policy profiles have governance approval.`, contract.policies.map((policy) => policy.id)))

  checks.push(...resolutionChecks(contract, now))

  const failed = checks.filter((item) => item.status === 'FAIL').length
  const warnings = checks.filter((item) => item.status === 'WARNING').length
  const passed = checks.filter((item) => item.status === 'PASS').length
  const score = Math.round((passed / Math.max(1, passed + failed)) * 100)
  const completedAt = new Date(now.getTime() + 1).toISOString()
  const unsigned = { contractId: contract.id, contractVersion: contract.version, contractDigest: contract.digest, startedAt, completedAt, checks }
  return {
    id: `assurance_${randomUUID()}`,
    ...unsigned,
    status: failed > 0 ? 'FAIL' : warnings > 0 ? 'WARNING' : 'PASS',
    score,
    artifactDigest: `sha256:${createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')}`,
    checks,
    summary: { passed, failed, warnings },
  }
}

/**
 * Compiles every competency question the contract publishes and asserts it still routes to the
 * operation the author linked it to.
 *
 * Every other gate here inspects the document. This one exercises the resolver, which is the
 * part that actually decides what a question does at runtime — and the part that silently
 * changes when someone edits a keyword, retunes a threshold, or swaps the embedding model.
 *
 * Deliberately lexical-only: the resolver's deterministic path is what must not regress, and an
 * assurance run cannot depend on a network call to an embedding endpoint.
 */
function resolutionChecks(contract: ContextContract, now: Date): AssuranceCheckResult[] {
  if (contract.competencyQuestions.length === 0) return []

  // Reference contracts resolve their entities from sample payloads; without this they would
  // abstain here for reasons that have nothing to do with routing.
  const runtimeContract = materializeSimulatedContext(contract, now)
  const compiler = new ContextCompiler(runtimeContract, { now: () => now })

  return contract.competencyQuestions.map((question) => {
    const id = `resolution.${question.id}`
    const label = 'Governed question routes to its linked operation'
    const claims = [question.id, question.operationId]

    const permittedPurposeId = permittedPurposeFor(runtimeContract, question.operationId)
    const result = compiler.compile(
      { question: question.question, ...(permittedPurposeId ? { purposeId: permittedPurposeId } : {}) },
      { principalId: 'assurance', tenantId: 'assurance' },
    )

    // A refusal that names the linked operation is still correct routing: the question reached
    // the right decision and was then stopped by an evidence, freshness, or approval gate.
    const routed = result.intentResolution?.candidates[0]?.operationId
    if (routed === question.operationId) {
      return check(id, 'RESOLUTION', label, true, `"${truncateQuestion(question.question)}" routes to ${question.operationId} (${result.decision}).`, claims)
    }

    if (!routed) {
      return check(id, 'RESOLUTION', label, false, `"${truncateQuestion(question.question)}" no longer resolves to any published operation; the compiler answered ${result.decision}.`, claims)
    }

    return check(id, 'RESOLUTION', label, false, `"${truncateQuestion(question.question)}" now routes to ${routed} rather than its linked ${question.operationId}.`, claims)
  })
}

/** Supplies a purpose where policy demands one, so routing is tested rather than the purpose gate. */
function permittedPurposeFor(contract: ContextContract, operationId: string): string | undefined {
  const riskTier = contract.operations.find((operation) => operation.id === operationId)?.riskTier
  const policy = contract.policies.find((candidate) => candidate.riskTier === riskTier)
  if (!policy?.purposeRequired) return undefined
  return policy.permittedPurposeIds?.[0] ?? contract.purposes?.[0]?.id
}

function truncateQuestion(question: string): string {
  return question.length <= 80 ? question : `${question.slice(0, 77)}...`
}

function check(id: string, category: AssuranceCheckResult['category'], label: string, passes: boolean, message: string, affectedClaimIds: string[]): AssuranceCheckResult {
  return { id, category, label, status: passes ? 'PASS' : 'FAIL', message, affectedClaimIds }
}

function warning(id: string, category: AssuranceCheckResult['category'], label: string, message: string, affectedClaimIds: string[]): AssuranceCheckResult {
  return { id, category, label, status: 'WARNING', message, affectedClaimIds }
}

function isApproved(status: string): boolean {
  return status === 'APPROVED' || status === 'APPROVED_WITH_EXCEPTION'
}
