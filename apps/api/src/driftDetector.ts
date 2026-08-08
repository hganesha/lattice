import { createHash } from 'node:crypto'
import type {
  ContextContract,
  ContractRegistryEntry,
  DriftEvent,
  DriftKind,
  ImpactLevel,
  IndustryWorkspace,
  SourceBinding,
  SourceHealthRecord,
} from '@lattice/contracts'

interface DriftSubject {
  kind: DriftEvent['subject']['kind']
  id: string
  label: string
}

interface DetectionContext {
  workspaceId: string
  contractId?: string
  fromVersion: string
  toVersion: string
  detectedAt: string
}

/**
 * Drift is derived from real history only: consecutive published releases of a contract, and the
 * gap between the ontology version a release pinned and the workspace ontology now. A registry with
 * a single release and an unchanged ontology has no drift, and this function returns an empty list
 * rather than inventing one.
 */
export function detectDrift(entry: ContractRegistryEntry, workspace?: IndustryWorkspace): DriftEvent[] {
  const workspaceId = entry.draft.ontologyRef?.workspaceId ?? workspace?.id ?? `workspace-${slug(entry.draft.domain)}`
  const events: DriftEvent[] = []

  for (let index = 1; index < entry.releases.length; index += 1) {
    const before = entry.releases[index - 1]
    const after = entry.releases[index]
    if (!before || !after) continue
    events.push(...compareContracts(before.contract, after.contract, {
      workspaceId,
      contractId: entry.contractId,
      fromVersion: before.version,
      toVersion: after.version,
      detectedAt: after.publishedAt,
    }))
  }

  const latest = entry.releases.at(-1)
  if (workspace && latest) {
    const pinned = latest.contract.ontologyRef?.version
    const current = workspace.ontology.version
    if (pinned && current && pinned !== current) {
      events.push(...compareOntologySurface(latest.contract, workspace, {
        workspaceId,
        contractId: entry.contractId,
        fromVersion: pinned,
        toVersion: current,
        detectedAt: workspace.updatedAt,
      }))
    }
  }

  return events
}

function compareContracts(before: ContextContract, after: ContextContract, context: DetectionContext): DriftEvent[] {
  const events: DriftEvent[] = []

  for (const beforeBinding of before.bindings) {
    const afterBinding = after.bindings.find((candidate) => candidate.id === beforeBinding.id)
    const subject: DriftSubject = { kind: 'SOURCE_BINDING', id: beforeBinding.id, label: beforeBinding.sourceSystem }
    if (!afterBinding) {
      events.push(event('BINDING_REMOVED', 'CRITICAL', subject, context, beforeBinding.id, 'removed', `${beforeBinding.sourceSystem} is no longer bound in ${after.version}; every operation that named it now compiles without that source.`))
      continue
    }
    for (const mapping of beforeBinding.mappings ?? []) {
      const successor = (afterBinding.mappings ?? []).find((candidate) => candidate.targetTypeId === mapping.targetTypeId && candidate.targetPropertyId === mapping.targetPropertyId)
      if (successor && successor.sourcePath !== mapping.sourcePath) {
        events.push(event('FIELD_RENAMED', 'HIGH', { kind: 'PROPERTY', id: mapping.targetPropertyId, label: `${beforeBinding.sourceSystem} → ${mapping.targetPropertyId}` }, context, mapping.sourcePath, successor.sourcePath, `${beforeBinding.sourceSystem} now reads ${mapping.targetPropertyId} from ${successor.sourcePath} instead of ${mapping.sourcePath}.`))
      }
    }
    if (afterBinding.freshnessMinutes > beforeBinding.freshnessMinutes) {
      events.push(event('FRESHNESS_DEGRADED', afterBinding.freshnessMinutes >= beforeBinding.freshnessMinutes * 2 ? 'HIGH' : 'MEDIUM', subject, context, `${beforeBinding.freshnessMinutes} minutes`, `${afterBinding.freshnessMinutes} minutes`, `${beforeBinding.sourceSystem} now declares a ${afterBinding.freshnessMinutes}-minute freshness window, widened from ${beforeBinding.freshnessMinutes}.`))
    }
    if (afterBinding.expectedResultSchema !== beforeBinding.expectedResultSchema || afterBinding.sourceChecksum !== beforeBinding.sourceChecksum) {
      events.push(event('SCHEMA_CHANGED', 'MEDIUM', subject, context, `${beforeBinding.expectedResultSchema}${beforeBinding.sourceChecksum ? ` (${beforeBinding.sourceChecksum})` : ''}`, `${afterBinding.expectedResultSchema}${afterBinding.sourceChecksum ? ` (${afterBinding.sourceChecksum})` : ''}`, `${beforeBinding.sourceSystem} publishes a different response contract than the one the previous release pinned.`))
    }
    if (certificationOf(beforeBinding) && !certificationOf(afterBinding)) {
      events.push(event('CERTIFICATION_LOST', 'HIGH', subject, context, certificationOf(beforeBinding) ?? '', 'none', `${beforeBinding.sourceSystem} no longer carries the certification the previous release relied on.`))
    }
  }

  for (const beforeMetric of before.metrics) {
    const afterMetric = after.metrics.find((candidate) => candidate.id === beforeMetric.id)
    if (!afterMetric) continue
    const subject: DriftSubject = { kind: 'METRIC', id: beforeMetric.id, label: beforeMetric.label }
    if (afterMetric.formula !== beforeMetric.formula) {
      events.push(event('FORMULA_CHANGED', 'CRITICAL', subject, context, beforeMetric.formula, afterMetric.formula, `${beforeMetric.label} is computed differently in ${after.version}; every disposition that pinned it answered under the previous formula.`))
    }
    if (afterMetric.grain.join('|') !== beforeMetric.grain.join('|')) {
      events.push(event('GRAIN_CHANGED', 'HIGH', subject, context, beforeMetric.grain.join(', ') || 'none', afterMetric.grain.join(', ') || 'none', `${beforeMetric.label} is now reported at a different grain, so figures from the two releases are not comparable.`))
    }
  }

  for (const beforeType of before.entityTypes) {
    const afterType = after.entityTypes.find((candidate) => candidate.id === beforeType.id)
    if (!afterType) continue
    if (afterType.description !== beforeType.description) {
      events.push(event('SEMANTIC_DEFINITION_CHANGED', beforeType.impact, { kind: 'ENTITY_TYPE', id: beforeType.id, label: beforeType.label }, context, beforeType.description, afterType.description, `The governed meaning of ${beforeType.label} changed between ${context.fromVersion} and ${context.toVersion}.`))
    }
    for (const property of beforeType.properties) {
      const successor = afterType.properties.find((candidate) => candidate.id === property.id)
      if (successor && (successor.unit ?? '') !== (property.unit ?? '')) {
        events.push(event('UNIT_CHANGED', 'CRITICAL', { kind: 'PROPERTY', id: property.id, label: `${beforeType.label} · ${property.name}` }, context, property.unit ?? 'none', successor.unit ?? 'none', `${property.name} changed unit; stored figures carry the old unit and were never restated.`))
      }
    }
  }

  return events
}

/** The one workspace-level comparison with two real versions on both sides. */
function compareOntologySurface(contract: ContextContract, workspace: IndustryWorkspace, context: DetectionContext): DriftEvent[] {
  const events: DriftEvent[] = []
  for (const pinnedType of contract.entityTypes) {
    const currentType = workspace.ontology.entityTypes.find((candidate) => candidate.id === pinnedType.id)
    if (!currentType) continue
    if (currentType.description !== pinnedType.description) {
      events.push(event('SEMANTIC_DEFINITION_CHANGED', pinnedType.impact, { kind: 'ENTITY_TYPE', id: pinnedType.id, label: pinnedType.label }, context, pinnedType.description, currentType.description, `${pinnedType.label} means something different in ontology ${context.toVersion} than in the release that pinned ${context.fromVersion}.`))
    }
    for (const property of pinnedType.properties) {
      const currentProperty = currentType.properties.find((candidate) => candidate.id === property.id)
      if (currentProperty && (currentProperty.unit ?? '') !== (property.unit ?? '')) {
        events.push(event('UNIT_CHANGED', 'CRITICAL', { kind: 'PROPERTY', id: property.id, label: `${pinnedType.label} · ${property.name}` }, context, property.unit ?? 'none', currentProperty.unit ?? 'none', `${property.name} changed unit in the workspace ontology after the release pinned it.`))
      }
    }
  }
  return events
}

/** Health from declared binding state and open drift — never a synthetic uptime figure. */
export function sourceHealthFor(contract: ContextContract, driftEvents: DriftEvent[], now = new Date()): SourceHealthRecord[] {
  return contract.bindings.map((binding) => {
    const open = driftEvents.filter((item) => item.status === 'OPEN' && (item.subject.id === binding.id || item.subject.label.startsWith(binding.sourceSystem)))
    const declared = binding.healthStatus ?? 'NOT_TESTED'
    const health: SourceHealthRecord['health'] = open.some((item) => item.severity === 'CRITICAL') || declared === 'INVALID' ? 'BROKEN'
      : open.length > 0 || declared === 'WARNING' ? 'DEGRADED'
      : declared === 'VALID' ? 'HEALTHY'
      : 'UNKNOWN'
    return {
      bindingId: binding.id,
      sourceSystem: binding.sourceSystem,
      contractId: contract.id,
      health,
      freshnessMinutes: binding.freshnessMinutes,
      lastCheckedAt: now.toISOString(),
      openDriftEvents: open.length,
      approvalStatus: binding.approvalStatus,
      detail: health === 'HEALTHY'
        ? `${binding.sourceSystem} validated with a ${binding.freshnessMinutes}-minute freshness window and no open drift.`
        : health === 'UNKNOWN'
        ? `${binding.sourceSystem} has not been validated since it was bound; its declared health is ${declared}.`
        : `${binding.sourceSystem} has ${open.length} open drift event${open.length === 1 ? '' : 's'} and a declared health of ${declared}.`,
    }
  })
}

function event(kind: DriftKind, severity: ImpactLevel, subject: DriftSubject, context: DetectionContext, before: string, after: string, detail: string): DriftEvent {
  const body: Omit<DriftEvent, 'id' | 'artifactDigest'> = {
    workspaceId: context.workspaceId,
    ...(context.contractId ? { contractId: context.contractId } : {}),
    kind,
    severity,
    subject,
    detectedAt: context.detectedAt,
    fromVersion: context.fromVersion,
    toVersion: context.toVersion,
    before,
    after,
    detail,
    status: 'OPEN',
  }
  const identity = digest({ contractId: context.contractId, kind, subjectId: subject.id, fromVersion: context.fromVersion, toVersion: context.toVersion, before, after })
  return { id: `drift_${identity.slice(7, 31)}`, ...body, artifactDigest: digest(body) }
}

function certificationOf(binding: SourceBinding): string | undefined {
  if (!binding.certification) return undefined
  return `${binding.certification.authority} ${binding.certification.level} (${binding.certification.certifiedAt})`
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function slug(value: string): string {
  return value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'
}
