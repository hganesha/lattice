import type { ContextContract, ReleaseChange, ReleaseChangeKind } from './types.js'

type Identified = { id: string }

interface DiffGroup {
  kind: ReleaseChangeKind
  before: readonly Identified[]
  after: readonly Identified[]
  label: (item: Identified) => string
  addedImpact: ReleaseChange['impact']
  changedImpact: ReleaseChange['impact']
  removedImpact: ReleaseChange['impact']
}

export function compareContracts(baseline: ContextContract, current: ContextContract): ReleaseChange[] {
  const changes: ReleaseChange[] = []
  const beforeMetadata = contractMetadata(baseline)
  const afterMetadata = contractMetadata(current)
  if (JSON.stringify(beforeMetadata) !== JSON.stringify(afterMetadata)) {
    changes.push({ id: baseline.id, kind: 'CONTRACT_METADATA', label: current.name, change: 'CHANGED', impact: baseline.domain !== current.domain || baseline.workflow !== current.workflow ? 'MAJOR' : 'PATCH' })
  }

  const groups: DiffGroup[] = [
    group('ENTITY_TYPE', baseline.entityTypes, current.entityTypes, 'label', 'MINOR', 'MAJOR', 'MAJOR'),
    group('RELATIONSHIP_TYPE', baseline.relationshipTypes, current.relationshipTypes, 'label', 'MINOR', 'MAJOR', 'MAJOR'),
    group('COMPETENCY_QUESTION', baseline.competencyQuestions, current.competencyQuestions, 'question', 'MINOR', 'PATCH', 'MAJOR'),
    group('OPERATION', baseline.operations, current.operations, 'label', 'MINOR', 'PATCH', 'MAJOR'),
    group('SOURCE_BINDING', baseline.bindings, current.bindings, 'sourceSystem', 'MINOR', 'PATCH', 'MAJOR'),
    group('POLICY', baseline.policies, current.policies, 'label', 'MINOR', 'PATCH', 'MAJOR'),
    group('METRIC', baseline.metrics, current.metrics, 'label', 'MINOR', 'PATCH', 'MAJOR'),
    group('CONTEXT_OBJECT', baseline.entities, current.entities, 'label', 'PATCH', 'PATCH', 'PATCH'),
    group('RELATIONSHIP_ASSERTION', baseline.relationships, current.relationships, 'id', 'PATCH', 'PATCH', 'PATCH'),
    group('EVIDENCE', baseline.evidence, current.evidence, 'title', 'PATCH', 'PATCH', 'PATCH'),
    group('TEST', baseline.tests, current.tests, 'label', 'PATCH', 'PATCH', 'PATCH'),
  ]
  for (const definition of groups) changes.push(...compareGroup(definition))
  return changes.sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id) || left.change.localeCompare(right.change))
}

export function suggestReleaseBump(changes: readonly ReleaseChange[]): 'NONE' | 'PATCH' | 'MINOR' | 'MAJOR' {
  if (changes.length === 0) return 'NONE'
  if (changes.some((change) => change.impact === 'MAJOR')) return 'MAJOR'
  if (changes.some((change) => change.impact === 'MINOR')) return 'MINOR'
  return 'PATCH'
}

function group<T extends Identified>(kind: ReleaseChangeKind, before: readonly T[], after: readonly T[], labelKey: keyof T, addedImpact: ReleaseChange['impact'], changedImpact: ReleaseChange['impact'], removedImpact: ReleaseChange['impact']): DiffGroup {
  return {
    kind,
    before,
    after,
    label: (item) => String((item as T)[labelKey] ?? item.id),
    addedImpact,
    changedImpact,
    removedImpact,
  }
}

function compareGroup(definition: DiffGroup): ReleaseChange[] {
  const changes: ReleaseChange[] = []
  const beforeById = new Map(definition.before.map((item) => [item.id, item]))
  const afterById = new Map(definition.after.map((item) => [item.id, item]))
  for (const item of definition.after) {
    const previous = beforeById.get(item.id)
    if (!previous) changes.push({ id: item.id, kind: definition.kind, label: definition.label(item), change: 'ADDED', impact: definition.addedImpact })
    else if (JSON.stringify(previous) !== JSON.stringify(item)) changes.push({ id: item.id, kind: definition.kind, label: definition.label(item), change: 'CHANGED', impact: definition.changedImpact })
  }
  for (const item of definition.before) {
    if (!afterById.has(item.id)) changes.push({ id: item.id, kind: definition.kind, label: definition.label(item), change: 'REMOVED', impact: definition.removedImpact })
  }
  return changes
}

function contractMetadata(contract: ContextContract) {
  return {
    name: contract.name,
    description: contract.description,
    domain: contract.domain,
    workflow: contract.workflow,
    conceptScope: contract.conceptScope ?? [],
    ontologyRef: contract.ontologyRef,
    versions: contract.versions,
  }
}
