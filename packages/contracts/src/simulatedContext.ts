import type { ContextContract, EntityRecord, EvidenceRecord, RelationshipAssertion, SourceBinding } from './types.js'

/**
 * Materializes governed runtime objects from SIMULATED binding payloads.
 *
 * Reference contracts remain immutable and content-addressed. The API calls this
 * at compile time so a documented sample binding behaves like a live read
 * without persisting synthetic operational observations into the release.
 */
export function materializeSimulatedContext(contract: ContextContract, now = new Date()): ContextContract {
  const simulatedBindings = contract.bindings.filter((binding) => binding.executionMode === 'SIMULATED' && binding.samplePayload)
  if (simulatedBindings.length === 0) return contract

  const requiredTypeIds = new Set(contract.operations.flatMap((operation) => operation.requiredEntityTypes))
  const existingTypeIds = new Set(contract.entities.map((entity) => entity.typeId))
  const missingTypeIds = [...requiredTypeIds].filter((typeId) => !existingTypeIds.has(typeId))
  if (missingTypeIds.length === 0) return contract

  const observedAt = now.toISOString()
  const evidence = simulatedBindings.map((binding) => bindingEvidence(binding, observedAt))
  const evidenceByBinding = new Map(simulatedBindings.map((binding, index) => [binding.id, evidence[index]!.id]))
  const additions = missingTypeIds.flatMap((typeId) => {
    const relatedOperations = contract.operations.filter((operation) => operation.requiredEntityTypes.includes(typeId))
    const relatedBindingIds = new Set(relatedOperations.flatMap((operation) => operation.sourceBindingIds))
    const relatedBindings = simulatedBindings.filter((binding) =>
      relatedBindingIds.has(binding.id) || binding.mappings?.some((mapping) => mapping.targetTypeId === typeId),
    )
    if (relatedBindings.length === 0) return []
    const type = contract.entityTypes.find((candidate) => candidate.id === typeId)
    const mappedProperties = Object.fromEntries(relatedBindings.flatMap((binding) =>
      (binding.mappings ?? [])
        .filter((mapping) => mapping.targetTypeId === typeId)
        .map((mapping) => [propertyKey(mapping.targetPropertyId), readPath(binding.samplePayload, mapping.sourcePath)] as const)
        .filter((entry): entry is readonly [string, string | number | boolean | null] => isEntityValue(entry[1])),
    ))
    const mappedAliases = Object.values(mappedProperties).filter((value): value is string => typeof value === 'string' && value.length > 0 && value.length <= 100)
    const operationAliases = relatedOperations.flatMap((operation) => operation.keywords)
    const evidenceRefs = [...new Set(relatedBindings.map((binding) => evidenceByBinding.get(binding.id)).filter((id): id is string => Boolean(id)))]
    const label = `${type?.label ?? humanize(typeId)} reference sample`
    const entity: EntityRecord = {
      id: `sample-${contract.id}-${typeId}`,
      typeId,
      label,
      aliases: [...new Set([type?.label ?? humanize(typeId), contract.workflow.replaceAll('_', ' '), ...operationAliases, ...mappedAliases])],
      properties: mappedProperties,
      evidenceRefs,
      evidenceStrength: 'EXACT',
      validFrom: observedAt,
    }
    return [entity]
  })

  const entities = [...contract.entities, ...additions]
  const entityByType = new Map(entities.map((entity) => [entity.typeId, entity]))
  const relationships: RelationshipAssertion[] = contract.relationshipTypes.flatMap((type) => {
    const source = entityByType.get(type.sourceTypeId)
    const target = entityByType.get(type.targetTypeId)
    if (!source || !target || contract.relationships.some((relationship) => relationship.typeId === type.id && relationship.sourceEntityId === source.id && relationship.targetEntityId === target.id)) return []
    return [{
      id: `sample-${contract.id}-${type.id}`,
      typeId: type.id,
      sourceEntityId: source.id,
      targetEntityId: target.id,
      assertionClass: 'ASSERTED',
      evidenceRefs: [...new Set([...source.evidenceRefs, ...target.evidenceRefs])],
      approvalStatus: 'APPROVED',
      validFrom: observedAt,
    }]
  })

  return {
    ...contract,
    entities,
    relationships: [...contract.relationships, ...relationships],
    evidence: [...contract.evidence, ...evidence.filter((item) => !contract.evidence.some((existing) => existing.id === item.id))],
  }
}

function bindingEvidence(binding: SourceBinding, observedAt: string): EvidenceRecord {
  return {
    id: `simulated-observation-${binding.id}`,
    type: 'OBSERVATION',
    title: `${binding.sourceSystem} simulated runtime observation`,
    source: binding.sourceSystem,
    locator: binding.endpoint ?? `simulated://${binding.id}`,
    checksum: `sha256:simulated-${binding.id}-${binding.version}`,
    observedAt,
    validFrom: observedAt,
    status: 'DIRECTLY_EVIDENCED',
  }
}

function readPath(payload: Record<string, unknown> | undefined, path: string): unknown {
  if (!payload || !path.startsWith('$.')) return undefined
  return path.slice(2).split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    return (value as Record<string, unknown>)[segment]
  }, payload)
}

function propertyKey(propertyId: string): string {
  return propertyId.split('.').at(-1) ?? propertyId
}

function isEntityValue(value: unknown): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())
}
