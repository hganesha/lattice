import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import type {
  ContextContract,
  EntityTypeDefinition,
  ImportFormat,
  ImportProposal,
  ProposedEntityType,
  RelationshipTypeDefinition,
} from '@lattice/contracts'
import { API_URL } from './api'
import { useMessages } from './i18n/messages'
type CollisionResolution = 'MERGE' | 'CREATE' | 'SKIP'

interface ImportStudioProps {
  contract: ContextContract
  onClose: () => void
  onApply: (contract: ContextContract, summary: string) => void
}

const outageExample = `openapi: 3.1.0
info:
  title: Grid Operations API
  version: 1.0.0
components:
  schemas:
    GridAsset:
      description: A governed physical or virtual asset participating in grid operations.
      type: object
      required: [assetId, assetType]
      properties:
        assetId:
          type: string
          description: Stable asset identifier.
        assetType:
          type: string
          enum: [SUBSTATION, FEEDER, TRANSFORMER, DER]
        operationalStatus:
          type: string
          enum: [ONLINE, DEGRADED, OFFLINE]
    OutageEvent:
      description: A disruption affecting one or more grid assets.
      type: object
      required: [eventId, startedAt, affectedAsset]
      properties:
        eventId:
          type: string
        startedAt:
          type: string
          format: date-time
        severity:
          type: string
          enum: [MINOR, MAJOR, CRITICAL]
        affectedAsset:
          $ref: '#/components/schemas/GridAsset'
`

export function ImportStudio({ contract, onClose, onApply }: ImportStudioProps) {
  const { t, formatDate } = useMessages()
  const [sourceName, setSourceName] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [format, setFormat] = useState<ImportFormat>('AUTO')
  const [proposal, setProposal] = useState<ImportProposal>()
  const [selectedTypes, setSelectedTypes] = useState<Record<string, boolean>>({})
  const [selectedRelationships, setSelectedRelationships] = useState<Record<string, boolean>>({})
  const [resolutions, setResolutions] = useState<Record<string, CollisionResolution>>({})
  const [edits, setEdits] = useState<Record<string, { label: string; group: string }>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const selectionSummary = useMemo(() => {
    if (!proposal) return { types: 0, relationships: 0, properties: 0, merges: 0 }
    const entities = proposal.entityTypes.filter((item) => selectedTypes[item.sourceId] && resolutions[item.sourceId] !== 'SKIP')
    return {
      types: entities.filter((item) => !item.collision || resolutions[item.sourceId] === 'CREATE').length,
      relationships: proposal.relationshipTypes.filter((item) => selectedRelationships[item.sourceId]).length,
      properties: entities.reduce((count, item) => count + item.type.properties.length, 0),
      merges: entities.filter((item) => item.collision && resolutions[item.sourceId] === 'MERGE').length,
    }
  }, [proposal, resolutions, selectedRelationships, selectedTypes])

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setSourceName(file.name)
    setSourceText(await file.text())
    setProposal(undefined)
    setError('')
  }

  function loadExample() {
    setSourceName('grid-operations.openapi.yaml')
    setSourceText(outageExample)
    setFormat('AUTO')
    setProposal(undefined)
    setError('')
  }

  async function preview() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/v1/imports/preview`, {
        method: 'POST',
        headers: { Authorization: 'Bearer studio-demo', 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: contract.id, sourceName, sourceText, format }),
      })
      const payload = await response.json() as ImportProposal & { message?: string; error?: string }
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Preview failed (${response.status})`)
      const currentProposal = addUnsavedDraftCollisions(payload, contract)
      setProposal(currentProposal)
      setSelectedTypes(Object.fromEntries(currentProposal.entityTypes.map((item) => [item.sourceId, true])))
      setSelectedRelationships(Object.fromEntries(currentProposal.relationshipTypes.map((item) => [item.sourceId, true])))
      setResolutions(Object.fromEntries(currentProposal.entityTypes.map((item) => [item.sourceId, item.collision ? 'MERGE' : 'CREATE'])))
      setEdits(Object.fromEntries(currentProposal.entityTypes.map((item) => [item.sourceId, { label: item.type.label, group: item.type.group }])))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('importPreviewFailed'))
    } finally {
      setLoading(false)
    }
  }

  function applyImport() {
    if (!proposal) return
    const result = applyProposal(contract, proposal, selectedTypes, selectedRelationships, resolutions, edits)
    onApply(result.contract, result.summary)
  }

  return <div className="modal-backdrop import-backdrop" role="presentation">
    <section className="import-studio" role="complementary" aria-labelledby="import-studio-title">
      <header className="import-header">
        <div><span className="panel-kicker">{t('importKicker')}</span><h1 id="import-studio-title">{t('importTitle')}</h1><p>{t('importDescription')}</p></div>
        <div className="import-steps"><span className={!proposal ? 'active' : 'complete'}>{t('importStepSource')}</span><i>→</i><span className={proposal ? 'active' : ''}>{t('importStepReview')}</span><i>→</i><span>{t('importStepDraft')}</span></div>
        <button aria-label={t('importClose')} onClick={onClose}>×</button>
      </header>

      {!proposal ? <div className="import-source-layout">
        <section className="import-source-panel">
          <div className="import-section-title"><span>01</span><div><h2>{t('importBringSchema')}</h2><p>{t('importFormats')}</p></div></div>
          <label className="file-drop"><input type="file" accept=".json,.yaml,.yml,application/json,application/yaml" onChange={(event) => void readFile(event)} /><span>⇧</span><b>{t('importChooseFile')}</b><small>{t('importPasteAlongside')}</small></label>
          <div className="import-divider"><span>{t('importOr')}</span></div>
          <label>{t('importSchemaSource')}<textarea value={sourceText} onChange={(event) => { setSourceText(event.target.value); setProposal(undefined) }} placeholder={t('importPastePlaceholder')} autoFocus /></label>
        </section>
        <aside className="import-config-panel">
          <div className="import-section-title"><span>02</span><div><h2>{t('importSourceContext')}</h2><p>{t('importProvenanceDescription')}</p></div></div>
          <label>{t('importSourceName')}<input value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="customer-api.yaml" /></label>
          <label>{t('importSchemaFormat')}<select value={format} onChange={(event) => setFormat(event.target.value as ImportFormat)}><option value="AUTO">{t('importDetectAutomatically')}</option><option value="OPENAPI">OpenAPI</option><option value="JSON_SCHEMA">JSON Schema</option></select></label>
          <div className="import-safety"><b>{t('importNonDestructive')}</b><p>{t('importSafety')}</p></div>
          <button className="example-button" onClick={loadExample}>{t('importLoadExample')}</button>
          {error && <div className="wizard-error" role="alert">{error}</div>}
        </aside>
      </div> : <div className="import-review-layout">
        <main className="import-review-list">
          <div className="review-heading"><div><span className="panel-kicker">{t('importProposedTypes')}</span><h2>{t('importConceptsDiscovered', { count: proposal.entityTypes.length })}</h2></div><code>{proposal.format} · {proposal.checksum.slice(0, 18)}…</code></div>
          {proposal.entityTypes.map((item) => <EntityProposalRow key={item.sourceId} item={item} selected={selectedTypes[item.sourceId] ?? false} resolution={resolutions[item.sourceId] ?? 'CREATE'} edit={edits[item.sourceId] ?? { label: item.type.label, group: item.type.group }} onSelected={(selected) => setSelectedTypes((current) => ({ ...current, [item.sourceId]: selected }))} onResolution={(resolution) => setResolutions((current) => ({ ...current, [item.sourceId]: resolution }))} onEdit={(edit) => setEdits((current) => ({ ...current, [item.sourceId]: edit }))} />)}
          {proposal.relationshipTypes.length > 0 && <><div className="review-heading relationship-heading"><div><span className="panel-kicker">{t('importProposedRelationships')}</span><h2>{t('importReferencesDiscovered', { count: proposal.relationshipTypes.length })}</h2></div></div>{proposal.relationshipTypes.map((item) => <label className="relationship-proposal" key={item.sourceId}><input type="checkbox" checked={selectedRelationships[item.sourceId] ?? false} onChange={(event) => setSelectedRelationships((current) => ({ ...current, [item.sourceId]: event.target.checked }))} /><span><b>{item.type.label}</b><small>{item.type.sourceTypeId} → {item.type.targetTypeId} · {item.type.cardinality.replaceAll('_', ' ')}</small></span></label>)}</>}
        </main>
        <aside className="import-review-aside">
          <span className="panel-kicker">{t('importAffectedContract')}</span><h2>{contract.name}</h2><p>{t('importSelectedStaged')}</p>
          <dl><div><dt>{t('importNewTypes')}</dt><dd>+{selectionSummary.types}</dd></div><div><dt>{t('importMergeTargets')}</dt><dd>{selectionSummary.merges}</dd></div><div><dt>{t('importRelationships')}</dt><dd>+{selectionSummary.relationships}</dd></div><div><dt>{t('importPropertiesReviewed')}</dt><dd>{selectionSummary.properties}</dd></div></dl>
          <div className="provenance-card"><span>{t('importProvenanceRecord')}</span><b>{proposal.sourceName}</b><code>{proposal.checksum.slice(0, 26)}…</code><small>{formatDate(proposal.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</small></div>
          {proposal.warnings.map((warning) => <div className="import-warning" key={warning}>! {warning}</div>)}
        </aside>
      </div>}

      <footer className="import-footer"><div><button className="ghost" onClick={proposal ? () => setProposal(undefined) : onClose}>{proposal ? t('importBackSource') : t('commonCancel')}</button><span>{proposal ? t('importReviewLocal') : t('importPayloadLimit')}</span></div>{proposal ? <button className="release" onClick={applyImport} disabled={selectionSummary.types + selectionSummary.merges === 0}>{t('importApplyDraft')}</button> : <button className="release" onClick={() => void preview()} disabled={loading || !sourceName.trim() || !sourceText.trim()}>{loading ? t('importAnalyzing') : t('importAnalyze')}</button>}</footer>
    </section>
  </div>
}

interface EntityProposalRowProps {
  item: ProposedEntityType
  selected: boolean
  resolution: CollisionResolution
  edit: { label: string; group: string }
  onSelected: (selected: boolean) => void
  onResolution: (resolution: CollisionResolution) => void
  onEdit: (edit: { label: string; group: string }) => void
}

function EntityProposalRow({ item, selected, resolution, edit, onSelected, onResolution, onEdit }: EntityProposalRowProps) {
  const { t } = useMessages()
  return <article className={`entity-proposal ${selected ? 'selected' : ''}`}>
    <label className="proposal-check"><input type="checkbox" checked={selected} onChange={(event) => onSelected(event.target.checked)} /><span>{item.type.icon}</span></label>
    <div className="proposal-content">
      <div className="proposal-title"><div><input aria-label={`Label for ${item.sourceId}`} value={edit.label} onChange={(event) => onEdit({ ...edit, label: event.target.value })} /><code>{item.type.id}</code></div><span>{t('importPropertiesCount', { count: item.type.properties.length })}</span></div>
      <p>{item.type.description}</p>
      <div className="proposal-meta"><label>{t('importGroup').toLocaleUpperCase()} <input value={edit.group} onChange={(event) => onEdit({ ...edit, group: event.target.value })} /></label>{item.type.properties.slice(0, 4).map((property) => <span key={property.id}>{property.name} · {property.dataType}</span>)}{item.type.properties.length > 4 && <span>{t('importMore', { count: item.type.properties.length - 4 })}</span>}</div>
      {item.warnings.map((warning) => <small className="import-warning" key={warning}>! {warning}</small>)}
      {item.collision && <div className="collision-row"><div><b>{t('importCollision', { label: item.collision.existingLabel })}</b><small>{t('importInContract', { match: item.collision.match === 'EXACT_ID' ? t('importSameIdentifier') : t('importMatchingLabel') })}</small></div><select aria-label={`Collision resolution for ${item.sourceId}`} value={resolution} onChange={(event) => onResolution(event.target.value as CollisionResolution)}><option value="MERGE">{t('importMergeProperties')}</option><option value="CREATE">{t('importCreateSeparate')}</option><option value="SKIP">{t('importSkipType')}</option></select></div>}
    </div>
  </article>
}

function applyProposal(contract: ContextContract, proposal: ImportProposal, selectedTypes: Record<string, boolean>, selectedRelationships: Record<string, boolean>, resolutions: Record<string, CollisionResolution>, edits: Record<string, { label: string; group: string }>) {
  let entityTypes = [...contract.entityTypes]
  const importedIds = new Set(entityTypes.map((type) => type.id))
  const idMap = new Map<string, string>()
  const addedTypeIds: string[] = []
  let mergedTypes = 0
  let addedProperties = 0

  for (const item of proposal.entityTypes) {
    if (!selectedTypes[item.sourceId] || resolutions[item.sourceId] === 'SKIP') continue
    const edit = edits[item.sourceId] ?? { label: item.type.label, group: item.type.group }
    if (item.collision && resolutions[item.sourceId] === 'MERGE') {
      idMap.set(item.type.id, item.collision.existingTypeId)
      entityTypes = entityTypes.map((existing) => {
        if (existing.id !== item.collision?.existingTypeId) return existing
        const missing = item.type.properties.filter((property) => !existing.properties.some((current) => current.id === property.id || current.name.toLocaleLowerCase() === property.name.toLocaleLowerCase()))
        addedProperties += missing.length
        return { ...existing, properties: [...existing.properties, ...missing] }
      })
      mergedTypes += 1
      continue
    }
    const baseId = item.collision ? `${item.type.id}_imported` : item.type.id
    const id = uniqueId(baseId, importedIds)
    importedIds.add(id)
    idMap.set(item.type.id, id)
    const nextType: EntityTypeDefinition = { ...item.type, id, label: edit.label.trim() || item.type.label, group: edit.group.trim() || item.type.group, properties: item.type.properties.map((property) => ({ ...property, id: `${id}.${property.id.split('.').at(-1)}` })) }
    entityTypes.push(nextType)
    addedTypeIds.push(id)
    addedProperties += nextType.properties.length
  }

  const relationshipIds = new Set(contract.relationshipTypes.map((type) => type.id))
  const addedRelationships: RelationshipTypeDefinition[] = []
  for (const item of proposal.relationshipTypes) {
    if (!selectedRelationships[item.sourceId]) continue
    const sourceTypeId = idMap.get(item.type.sourceTypeId)
    const targetTypeId = idMap.get(item.type.targetTypeId)
    if (!sourceTypeId || !targetTypeId) continue
    const id = uniqueId(item.type.id, relationshipIds)
    relationshipIds.add(id)
    addedRelationships.push({ ...item.type, id, sourceTypeId, targetTypeId })
  }

  const evidenceId = `ev_import_${proposal.checksum.replace('sha256:', '').slice(0, 16)}`
  const evidence = contract.evidence.some((record) => record.id === evidenceId) ? contract.evidence : [...contract.evidence, {
    id: evidenceId,
    type: 'DOCUMENT' as const,
    title: `Imported ${proposal.sourceName}`,
    source: 'Lattice Import Studio',
    locator: proposal.sourceName,
    checksum: proposal.checksum,
    observedAt: proposal.createdAt,
    validFrom: proposal.createdAt,
    status: 'TEMPLATE_DERIVED' as const,
  }]
  const schemaLayout = { ...contract.schemaLayout }
  addedTypeIds.forEach((id, index) => { schemaLayout[id] = fallbackPosition(contract.entityTypes.length + index) })
  const nextContract = { ...contract, releaseStatus: 'UNPUBLISHED' as const, entityTypes, relationshipTypes: [...contract.relationshipTypes, ...addedRelationships], evidence, schemaLayout }
  return { contract: nextContract, summary: `Import staged: +${addedTypeIds.length} types, ${mergedTypes} merges, +${addedRelationships.length} relationships, +${addedProperties} properties` }
}

function addUnsavedDraftCollisions(proposal: ImportProposal, contract: ContextContract): ImportProposal {
  return {
    ...proposal,
    entityTypes: proposal.entityTypes.map((item) => {
      if (item.collision) return item
      const exact = contract.entityTypes.find((type) => type.id === item.type.id)
      if (exact) return { ...item, collision: { existingTypeId: exact.id, existingLabel: exact.label, match: 'EXACT_ID' as const } }
      const label = contract.entityTypes.find((type) => type.label.toLocaleLowerCase() === item.type.label.toLocaleLowerCase())
      return label ? { ...item, collision: { existingTypeId: label.id, existingLabel: label.label, match: 'LABEL' as const } } : item
    }),
  }
}

function uniqueId(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base
  let suffix = 2
  while (existing.has(`${base}_${suffix}`)) suffix += 1
  return `${base}_${suffix}`
}

function fallbackPosition(index: number): { x: number; y: number } {
  return { x: 70 + (index % 3) * 285, y: 50 + Math.floor(index / 3) * 135 }
}
