import type { ContextContract, EntityRecord, EvidenceRecord, RelationshipAssertion } from './types.js'

const GRID_CONTRACT_ID = 'contract-grid-outage-response'
const OUTAGE_ID = 'OUTAGE-NORTH-042'
const ASSET_ID = 'ASSET-SUB-NORTH-01'
const EVIDENCE_ID = 'ev-grid-operations-outage-042'
const RELATIONSHIP_ID = 'rel-outage-042-affected-asset'

export function canLoadGridOutageExample(contract: ContextContract): boolean {
  return contract.id === GRID_CONTRACT_ID
    && contract.entityTypes.some((type) => type.id === 'outage_event')
    && contract.entityTypes.some((type) => type.id === 'grid_asset')
}

export function loadGridOutageExample(contract: ContextContract, now = new Date()): ContextContract {
  if (!canLoadGridOutageExample(contract)) return contract
  const observedAt = now.toISOString()
  const startedAt = new Date(now.getTime() - 24 * 60_000).toISOString()
  const evidence: EvidenceRecord = {
    id: EVIDENCE_ID,
    type: 'OBSERVATION',
    title: 'North River outage operational snapshot',
    source: 'Grid Operations API',
    locator: '/outages/OUTAGE-NORTH-042',
    checksum: 'sha256:grid-operations-outage-042-v1',
    observedAt,
    validFrom: startedAt,
    status: 'DIRECTLY_EVIDENCED',
  }
  const entities: EntityRecord[] = [
    {
      id: OUTAGE_ID,
      typeId: 'outage_event',
      label: 'North River Substation Outage',
      aliases: ['outage', 'North River outage', 'critical outage'],
      properties: { event_id: OUTAGE_ID, started_at: startedAt, severity: 'CRITICAL' },
      evidenceRefs: [EVIDENCE_ID],
      evidenceStrength: 'EXACT',
      validFrom: startedAt,
    },
    {
      id: ASSET_ID,
      typeId: 'grid_asset',
      label: 'North River Substation',
      aliases: ['grid', 'affected asset', 'North River grid asset'],
      properties: { asset_id: ASSET_ID, asset_type: 'SUBSTATION', operational_status: 'OFFLINE' },
      evidenceRefs: [EVIDENCE_ID],
      evidenceStrength: 'EXACT',
      validFrom: startedAt,
    },
  ]
  const relationship: RelationshipAssertion = {
    id: RELATIONSHIP_ID,
    typeId: 'outage_event_affected_asset',
    sourceEntityId: OUTAGE_ID,
    targetEntityId: ASSET_ID,
    assertionClass: 'ASSERTED',
    evidenceRefs: [EVIDENCE_ID],
    approvalStatus: 'APPROVED',
    validFrom: startedAt,
  }

  return {
    ...contract,
    releaseStatus: 'UNPUBLISHED',
    entities: mergeById(contract.entities, entities),
    relationships: mergeById(contract.relationships, [relationship]),
    evidence: mergeById(contract.evidence, [evidence]),
    operations: contract.operations.map((operation) => operation.id === 'grid.get_outage_context'
      ? { ...operation, relationshipPath: ['outage_event_affected_asset'] }
      : operation),
  }
}

export function enableGridRuntimeApprovalExample(contract: ContextContract, now = new Date()): ContextContract {
  const operational = loadGridOutageExample(contract, now)
  if (!canLoadGridOutageExample(operational)) return operational

  return {
    ...operational,
    releaseStatus: 'UNPUBLISHED',
    versions: {
      ...operational.versions,
      policy: 'contract-grid-outage-response-policies@0.2.0',
      bindings: 'contract-grid-outage-response-bindings@0.2.0',
    },
    operations: operational.operations.map((operation) => operation.id === 'grid.get_outage_context'
      ? { ...operation, riskTier: 'PLANNING_DECISION' }
      : operation),
    policies: operational.policies.map((policy) => ({
      ...policy,
      label: 'Grid prioritization approval',
      description: 'Requires an independent operator decision before outage prioritization context can execute.',
      riskTier: 'PLANNING_DECISION',
      minimumEvidenceStrength: 'STRONG',
      maximumEvidenceAgeMinutes: 60,
      approvalRequired: true,
      version: '0.2.0',
      approvalStatus: 'DRAFT',
    })),
    bindings: operational.bindings.map((binding) => binding.operationId === 'grid.get_outage_context'
      ? {
          ...binding,
          executionMode: 'SIMULATED',
          samplePayload: {
            eventId: OUTAGE_ID,
            startedAt: new Date(now.getTime() - 24 * 60_000).toISOString(),
            severity: 'CRITICAL',
            affectedAsset: { assetId: ASSET_ID, operationalStatus: 'OFFLINE' },
          },
        }
      : binding),
  }
}

function mergeById<T extends { id: string }>(current: T[], additions: T[]): T[] {
  const additionIds = new Set(additions.map((item) => item.id))
  return [...current.filter((item) => !additionIds.has(item.id)), ...additions]
}
