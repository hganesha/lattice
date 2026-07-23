import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react'
import type {
  ContextContract,
  ContractRegistryEntry,
  ContractRelease,
  EntityTypeDefinition,
  IndustryOntology,
  PropertyDefinition,
  RelationshipTypeDefinition,
} from '@lattice/contracts'
import { API_URL, apiAuthHeaders } from './api'
import { ImportStudio } from './ImportStudio'
import { useMessages } from './i18n/messages'
import { OntologyLaneNode, type OntologyLaneNodeType } from './OntologyLaneNode'
import { OntologyEntityNode } from './OntologyEntityNode'
import { buildOntologyIsometricLayout, buildOntologyLaneLayout } from './ontologyLaneLayout'
import { Toast } from './Toast'
import { DomainGroupField } from './DomainGroupField'
import { EntityIconPicker } from './EntityIconPicker'
import { EntityIcon, DEFAULT_ENTITY_ICON } from './entityIcons'
import { downloadJson, downloadOntology } from './jsonExport'
import { IconAutoLayout, IconIsometric, IconRows } from './icons'

const ontologyNodeTypes = { ontologyLane: OntologyLaneNode, ontologyEntity: OntologyEntityNode }

type BuilderDialog = 'entity' | 'relationship' | 'property' | 'publish' | null
type OntologyLayoutMode = 'lanes' | 'isometric'

interface OntologyBuilderProps {
  contract: ContextContract
  onChange: (contract: ContextContract) => void
  onDirtyChange: (dirty: boolean) => void
  mode?: 'contract' | 'workspace'
  exportDocument?: ContextContract | IndustryOntology
}

export function OntologyBuilder({ contract, onChange, onDirtyChange, mode = 'contract', exportDocument = contract }: OntologyBuilderProps) {
  const { t, formatDate } = useMessages()
  const [selectedTypeId, setSelectedTypeId] = useState(contract.entityTypes[0]?.id ?? '')
  const [dialog, setDialog] = useState<BuilderDialog>(null)
  const [notice, setNotice] = useState('')
  const [pendingConnection, setPendingConnection] = useState<Connection>()
  const [releases, setReleases] = useState<ContractRelease[]>([])
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [inspectorTab, setInspectorTab] = useState<'DEFINITION' | 'RELATIONSHIPS'>('DEFINITION')
  const [layoutMode, setLayoutMode] = useState<OntologyLayoutMode>('lanes')
  const [autoLayoutEnabled, setAutoLayoutEnabled] = useState(true)
  const [manualLayout, setManualLayout] = useState<NonNullable<ContextContract['schemaLayout']>>(contract.schemaLayout ?? {})

  const selectedType = contract.entityTypes.find((type) => type.id === selectedTypeId)
  const selectedRelationships = useMemo(() => contract.relationshipTypes.filter((relationship) =>
    relationship.sourceTypeId === selectedTypeId || relationship.targetTypeId === selectedTypeId,
  ), [contract.relationshipTypes, selectedTypeId])
  const issues = useMemo(() => validateContract(contract, mode === 'workspace'), [contract, mode])
  const domainGroupLabel = t('ontologyDomainGroup')
  const propsLabel = t('ontologyProperties').toLocaleLowerCase()
  const domainGroups = useMemo(() => uniqueDomainGroups(contract.entityTypes), [contract.entityTypes])
  const laneLayout = useMemo(() => buildOntologyLaneLayout(contract.entityTypes), [contract.entityTypes])
  const isometricLayout = useMemo(() => buildOntologyIsometricLayout(contract.entityTypes), [contract.entityTypes])
  const displayLayout = layoutMode === 'isometric' ? isometricLayout : laneLayout
  const lanePositions = useMemo(() => autoLayoutEnabled
    ? laneLayout.positions
    : { ...laneLayout.positions, ...manualLayout }, [autoLayoutEnabled, laneLayout.positions, manualLayout])
  const resolvedPositions = layoutMode === 'isometric' ? isometricLayout.positions : lanePositions
  const derivedNodes = useMemo<Node[]>(() => [
    ...displayLayout.lanes.map((lane): OntologyLaneNodeType => ({
      id: `__lane_${lane.id}`,
      type: 'ontologyLane',
      position: lane.position,
      data: { label: lane.label, count: lane.entityTypeIds.length, kindLabel: domainGroupLabel },
      style: { width: lane.width, height: lane.height },
      className: 'ontology-lane-node',
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      zIndex: -1,
    })),
    ...contract.entityTypes.map((type) => ({
      id: type.id,
      type: 'ontologyEntity',
      position: resolvedPositions[type.id]!,
      data: { icon: type.icon, label: type.label, propertyCount: type.properties.length, propsLabel: propsLabel },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      className: `ontology-flow-node ${type.approvalStatus === 'APPROVED' ? 'approved' : 'draft'} ${selectedTypeId === type.id ? 'selected' : ''}`,
      zIndex: 2,
    })),
  ], [contract.entityTypes, displayLayout.lanes, domainGroupLabel, propsLabel, resolvedPositions, selectedTypeId])
  const [graphNodes, setGraphNodes, onNodesChange] = useNodesState(derivedNodes)
  const graphEdges = useMemo<Edge[]>(() => contract.relationshipTypes.map((relationship) => ({
    id: relationship.id,
    source: relationship.sourceTypeId,
    target: relationship.targetTypeId,
    label: relationship.label,
    type: layoutMode === 'isometric' ? 'straight' : 'smoothstep',
    ...(layoutMode === 'lanes' ? { pathOptions: { offset: 44, borderRadius: 8 } } : {}),
    labelShowBg: true,
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 4,
    className: 'ontology-flow-edge',
  })), [contract.relationshipTypes, layoutMode])

  useEffect(() => {
    if (mode === 'workspace') return
    const controller = new AbortController()
    setReleases([])
    void fetch(`${API_URL}/v1/contracts/${contract.id}`, { headers: apiAuthHeaders(), signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<ContractRegistryEntry> : undefined)
      .then((entry) => { if (entry) setReleases(entry.releases) })
      .catch(() => undefined)
    return () => controller.abort()
  }, [contract.id, mode])

  useEffect(() => {
    if (!contract.entityTypes.some((type) => type.id === selectedTypeId)) {
      setSelectedTypeId(contract.entityTypes[0]?.id ?? '')
    }
  }, [contract.entityTypes, selectedTypeId])

  useEffect(() => {
    setAutoLayoutEnabled(true)
    setManualLayout(contract.schemaLayout ?? {})
  }, [contract.id])

  useEffect(() => {
    setGraphNodes(derivedNodes)
  }, [derivedNodes, setGraphNodes])

  function commit(next: ContextContract) {
    onChange(next)
    onDirtyChange(true)
    setNotice(t('ontologyUnsavedNotice'))
  }

  function addEntityType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const label = String(data.get('label') ?? '').trim()
    const id = uniqueId(slugify(label), contract.entityTypes.map((type) => type.id))
    const entityType: EntityTypeDefinition = {
      id,
      label,
      description: String(data.get('description') ?? '').trim(),
      group: String(data.get('group') ?? 'Core').trim() || 'Core',
      icon: String(data.get('icon') ?? '').trim() || DEFAULT_ENTITY_ICON,
      properties: [],
      evidenceStatus: 'DECLARED',
      approvalStatus: 'DRAFT',
      impact: String(data.get('impact') ?? 'MEDIUM') as EntityTypeDefinition['impact'],
    }
    const entityTypes = [...contract.entityTypes, entityType]
    commit({
      ...contract,
      entityTypes,
      schemaLayout: buildOntologyLaneLayout(entityTypes).positions,
    })
    setSelectedTypeId(entityType.id)
    setDialog(null)
  }

  function addRelationship(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const label = String(data.get('label') ?? '').trim()
    const relationship: RelationshipTypeDefinition = {
      id: uniqueId(slugify(label), contract.relationshipTypes.map((type) => type.id)),
      label: label.toLocaleUpperCase().replaceAll(' ', '_'),
      sourceTypeId: String(data.get('sourceTypeId')),
      targetTypeId: String(data.get('targetTypeId')),
      cardinality: String(data.get('cardinality')) as RelationshipTypeDefinition['cardinality'],
      description: String(data.get('description') ?? '').trim(),
      impact: String(data.get('impact') ?? 'MEDIUM') as RelationshipTypeDefinition['impact'],
    }
    commit({ ...contract, relationshipTypes: [...contract.relationshipTypes, relationship] })
    setPendingConnection(undefined)
    setDialog(null)
  }

  function addProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedType) return
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const property: PropertyDefinition = {
      id: `${selectedType.id}.${slugify(name)}`,
      name,
      dataType: String(data.get('dataType')) as PropertyDefinition['dataType'],
      description: String(data.get('description') ?? '').trim(),
      required: data.get('required') === 'on',
      identifier: data.get('identifier') === 'on',
    }
    updateSelected({ properties: [...selectedType.properties, property] })
    setDialog(null)
  }

  function updateSelected(patch: Partial<EntityTypeDefinition>) {
    if (!selectedType) return
    const entityTypes = contract.entityTypes.map((type) => type.id === selectedType.id ? { ...type, ...patch } : type)
    if (patch.group !== undefined) {
      setManualLayout((current) => {
        const next = { ...current }
        delete next[selectedType.id]
        return next
      })
    }
    commit({
      ...contract,
      entityTypes,
      ...(patch.group !== undefined ? { schemaLayout: buildOntologyLaneLayout(entityTypes).positions } : {}),
    })
  }

  async function publishContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    try {
      const response = await fetch(`${API_URL}/v1/contracts/${contract.id}/releases`, {
        method: 'POST',
        headers: { ...apiAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract,
          bump: String(data.get('bump')),
          notes: String(data.get('notes') ?? ''),
        }),
      })
      const payload = await response.json() as { entry?: ContractRegistryEntry; release?: ContractRelease; issues?: string[]; error?: string }
      if (!response.ok || !payload.entry || !payload.release) throw new Error(payload.issues?.join(' ') || payload.error || `Publish failed (${response.status})`)
      onChange(payload.release.contract)
      onDirtyChange(false)
      localStorage.setItem('lattice:contract-draft', JSON.stringify(payload.release.contract))
      setReleases(payload.entry.releases)
      setDialog(null)
      setNotice(`Published ${payload.release.version} · ${payload.release.digest.slice(0, 22)}…`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('ontologyPublishFailed'))
    } finally {
      setSaving(false)
    }
  }

  function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target) return
    setPendingConnection(connection)
    setDialog('relationship')
  }

  function toggleAutoLayout() {
    if (layoutMode === 'isometric') return
    if (autoLayoutEnabled) {
      const positions = Object.fromEntries(graphNodes
        .filter((node) => !node.id.startsWith('__lane_'))
        .map((node) => [node.id, node.position]))
      setManualLayout(positions)
      setAutoLayoutEnabled(false)
      return
    }
    setAutoLayoutEnabled(true)
    setManualLayout(laneLayout.positions)
    commit({ ...contract, schemaLayout: laneLayout.positions })
    setNotice(t('ontologyLayoutNotice'))
  }

  function persistManualPosition(node: Node) {
    if (autoLayoutEnabled || node.id.startsWith('__lane_')) return
    const schemaLayout = { ...manualLayout, [node.id]: node.position }
    setManualLayout(schemaLayout)
    commit({ ...contract, schemaLayout })
  }

  function exportArtifact(format: 'JSON' | 'RDF_XML' | 'TURTLE') {
    if (format === 'JSON') downloadJson(exportDocument)
    else downloadOntology(exportDocument, format)
    setNotice(t('ontologyExportContextNotice', {
      kind: t(mode === 'workspace' ? 'ontologyExportKindOntology' : 'ontologyExportKindContract'),
      format: format === 'RDF_XML' ? 'RDF/XML' : format === 'TURTLE' ? 'Turtle' : 'JSON',
    }))
  }

  return (
    <>
      {notice && <Toast message={notice} closeLabel={t('commonClose')} onDismiss={() => setNotice('')} />}

      <div className="builder-workbench">
        <section className="schema-panel panel">
          <div className="panel-header ontology-model-header">
            <div><span className="panel-kicker"></span><h2>{contract.name}</h2></div>
            <div className="ontology-model-tools">
              <div className="builder-meta"><span>{t('ontologyTypeCount', { count: contract.entityTypes.length })}</span><span>{t('ontologyRelationCount', { count: contract.relationshipTypes.length })}</span><button onClick={() => exportArtifact('JSON')}>{t('ontologyExportPackageJson')}</button><button onClick={() => exportArtifact('RDF_XML')}>{t('ontologyExportSemanticRdf')}</button><button onClick={() => exportArtifact('TURTLE')}>{t('ontologyExportSemanticTurtle')}</button></div>
              <div className="model-actions">
                <button className="ghost import-launch" onClick={() => setImportOpen(true)}>{t('ontologyImportSchema')}</button>
                <button className="ghost" onClick={() => setDialog('relationship')}>{t('ontologyAddRelationship')}</button>
                <button className="ghost" onClick={() => setDialog('entity')}>{t('ontologyAddEntityType')}</button>
                {mode === 'contract' && <button className="release" onClick={() => setDialog('publish')} disabled={saving || issues.length > 0}>{t('ontologyPublishRelease')}</button>}
              </div>
            </div>
          </div>
          <div className={`schema-canvas flow-mode ontology-canvas-${layoutMode}`}>
            <div className="canvas-layout-controls">
              <div className="layout-view-selector" role="group" aria-label={t('ontologyLayoutView')}>
                <button type="button" aria-label={t('ontologyLayoutLanes')} title={t('ontologyLayoutLanes')} aria-pressed={layoutMode === 'lanes'} className={layoutMode === 'lanes' ? 'selected' : ''} onClick={() => setLayoutMode('lanes')}><IconRows /></button>
                <button type="button" aria-label={t('ontologyLayoutIsometric')} title={t('ontologyLayoutIsometric')} aria-pressed={layoutMode === 'isometric'} className={layoutMode === 'isometric' ? 'selected' : ''} onClick={() => setLayoutMode('isometric')}><IconIsometric /></button>
              </div>
              <button className={`ghost layout-toggle ${autoLayoutEnabled ? 'active' : ''}`} aria-label={t('ontologyAutoLayout')} title={t('ontologyAutoLayout')} aria-pressed={autoLayoutEnabled} disabled={layoutMode === 'isometric'} onClick={toggleAutoLayout}><IconAutoLayout /></button>
            </div>
            <ReactFlow
              key={layoutMode}
              nodes={graphNodes}
              edges={graphEdges}
              onNodesChange={onNodesChange}
              onNodeDragStop={(_event, node) => persistManualPosition(node)}
              onNodeClick={(_event, node) => { if (!node.id.startsWith('__lane_')) setSelectedTypeId(node.id) }}
              onConnect={handleConnect}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              minZoom={0.35}
              maxZoom={1.8}
              snapToGrid
              snapGrid={[15, 15]}
              nodesDraggable={layoutMode === 'lanes' && !autoLayoutEnabled}
              nodeTypes={ontologyNodeTypes}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={18} size={1} color="#28302e" />
              <MiniMap pannable zoomable nodeColor={(node) => node.className?.includes('draft') ? '#d9a04f' : '#8bd14e'} maskColor="#080b0dcc" />
              <Controls showInteractive={false} />
            </ReactFlow>
            {contract.entityTypes.length === 0 && <div className="empty-canvas"><span>◇</span><h3>{t('ontologyEmptyTitle')}</h3><p>{t('ontologyEmptyDescription')}</p><button className="release" onClick={() => setDialog('entity')}>{t('ontologyCreateFirstType')}</button></div>}
            <div className="canvas-hint"><span>{t('ontologyConnectNodes')}</span></div>
          </div>
          <div className="relation-strip">
            <div className="relation-strip-heading"><span>{t('ontologyRelationshipTypes').toLocaleUpperCase()}</span><button onClick={() => setDialog('relationship')}>{t('ontologyAdd')}</button></div>
            <div className="relation-list" tabIndex={0} aria-label={t('ontologyRelationshipTypes')}>
              {contract.relationshipTypes.map((relation) => <div className="relation-chip" key={relation.id}><span>{typeLabel(contract, relation.sourceTypeId)}</span><b>— {relation.label} →</b><span>{typeLabel(contract, relation.targetTypeId)}</span><em>{relation.cardinality.replaceAll('_', ' : ')}</em></div>)}
            </div>
          </div>
          {mode === 'contract' && <div className="release-history">
            <div className="relation-strip-heading"><span>{t('ontologyReleaseHistory').toLocaleUpperCase()}</span><em>{t('ontologyImmutableVersions', { count: releases.length })}</em></div>
            <div className="release-list">{releases.slice().reverse().slice(0, 4).map((release) => <div key={release.digest}><b>v{release.version}</b><span>{release.notes}</span><code>{release.digest.slice(0, 18)}…</code><time>{formatDate(release.publishedAt, { dateStyle: 'medium' })}</time></div>)}</div>
          </div>}
        </section>

        <aside className="builder-inspector panel">
          <div className="inspector-tabs" role="tablist" aria-label={t('ontologyInspectorLabel')}>
            <button id="ontology-definition-tab" role="tab" aria-controls="ontology-definition-panel" aria-selected={inspectorTab === 'DEFINITION'} className={inspectorTab === 'DEFINITION' ? 'active' : ''} onClick={() => setInspectorTab('DEFINITION')}>{t('ontologyTypeDefinition')}</button>
            <button id="ontology-relationships-tab" role="tab" aria-controls="ontology-relationships-panel" aria-selected={inspectorTab === 'RELATIONSHIPS'} className={inspectorTab === 'RELATIONSHIPS' ? 'active' : ''} onClick={() => setInspectorTab('RELATIONSHIPS')}>{t('summaryRelationships')}</button>
          </div>
          {selectedType && inspectorTab === 'DEFINITION' ? <div id="ontology-definition-panel" className="type-form" role="tabpanel" aria-labelledby="ontology-definition-tab">
            <div className="entity-title"><span className="large-icon"><EntityIcon icon={selectedType.icon} /></span><div><span>{t('ontologyEntityType').toLocaleUpperCase()}</span><h3>{selectedType.label}</h3><code>{selectedType.id}</code></div></div>
            <label>{t('ontologyDisplayName')}<input value={selectedType.label} onChange={(event) => updateSelected({ label: event.target.value })} /></label>
            <label>{t('ontologyDescription')}<textarea value={selectedType.description} onChange={(event) => updateSelected({ description: event.target.value })} /></label>
            <EntityIconPicker key={selectedType.id} value={selectedType.icon} onChange={(icon) => updateSelected({ icon })} label={t('ontologyIcon')} />
            <div className="form-split"><DomainGroupField key={selectedType.id} groups={domainGroups} label={t('ontologyDomainGroup')} value={selectedType.group} addGroupLabel={t('ontologyAddDomainGroup')} newGroupLabel={t('ontologyNewDomainGroup')} newGroupPlaceholder={t('ontologyNewDomainGroupPlaceholder')} onChange={(group) => updateSelected({ group })} /><label>{t('ontologyImpact')}<select value={selectedType.impact} onChange={(event) => updateSelected({ impact: event.target.value as EntityTypeDefinition['impact'] })}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label></div>
            <div className="property-heading"><div><span>{t('ontologyProperties').toLocaleUpperCase()}</span><em>{selectedType.properties.length}</em></div><button onClick={() => setDialog('property')}>{t('ontologyAddProperty')}</button></div>
            <div className="property-list">
              {selectedType.properties.length === 0 && <div className="empty-properties"><span>◇</span><b>{t('ontologyNoProperties')}</b><small>{t('ontologyNoPropertiesDescription')}</small></div>}
              {selectedType.properties.map((property) => <div className="property-row" key={property.id}><span className="property-symbol">{property.identifier ? '#' : '•'}</span><div><b>{property.name}</b><small>{property.dataType}{property.required ? ` · ${t('ontologyRequired')}` : ''}</small></div><code>{property.id.split('.').at(-1)}</code></div>)}
            </div>
          </div> : selectedType && inspectorTab === 'RELATIONSHIPS' ? <div id="ontology-relationships-panel" className="relationship-inspector" role="tabpanel" aria-labelledby="ontology-relationships-tab">
            <div className="entity-title"><span className="large-icon">↔</span><div><span>{t('ontologyRelationshipTypes').toLocaleUpperCase()}</span><h3>{selectedType.label}</h3><code>{selectedType.id}</code></div></div>
            <div className="relationship-inspector-heading"><span>{t('summaryRelationships').toLocaleUpperCase()}</span><em>{selectedRelationships.length}</em></div>
            <div className="relationship-inspector-list">
              {selectedRelationships.length === 0 && <div className="empty-properties"><span>↔</span><b>{t('ontologyNoRelationships')}</b><small>{t('ontologyNoRelationshipsDescription')}</small></div>}
              {selectedRelationships.map((relationship) => {
                const isSelfRelationship = relationship.sourceTypeId === selectedType.id && relationship.targetTypeId === selectedType.id
                const direction = isSelfRelationship ? 'self' : relationship.sourceTypeId === selectedType.id ? 'outgoing' : 'incoming'
                const directionLabel = isSelfRelationship ? t('ontologySelfRelationship') : direction === 'outgoing' ? t('ontologyOutgoing') : t('ontologyIncoming')
                return <article className="inspector-relationship-card" key={relationship.id}>
                  <header><span className={`relationship-direction ${direction}`}>{directionLabel}</span><b>{relationship.label}</b><em className={`relationship-impact ${relationship.impact.toLocaleLowerCase()}`}>{relationship.impact}</em></header>
                  <div className="relationship-path"><span><small>{t('ontologySourceType')}</small><b>{typeLabel(contract, relationship.sourceTypeId)}</b></span><i aria-hidden="true">→</i><span><small>{t('ontologyTargetType')}</small><b>{typeLabel(contract, relationship.targetTypeId)}</b></span></div>
                  {relationship.description && <p>{relationship.description}</p>}
                  <footer><code>{relationship.id}</code><span>{t('ontologyCardinality')} · {relationship.cardinality.replaceAll('_', ' : ')}</span></footer>
                </article>
              })}
            </div>
          </div> : <div className="empty-properties"><span>◇</span><b>{t('ontologySelectEntity')}</b></div>}
        </aside>
      </div>

      <section className="validation-panel">
        <div><span className={issues.length === 0 ? 'validation-pass' : 'validation-warn'}>{issues.length === 0 ? '✓' : '!'}</span><div><span>{t('ontologyContractValidation').toLocaleUpperCase()}</span><b>{issues.length === 0 ? t('ontologySchemaValid') : t('ontologyIssues', { count: issues.length })}</b></div></div>
        <div className="validation-checks"><span className={issues.some((issue) => issue.includes('entity type is required')) ? 'fail' : 'pass'}>{t('ontologyEntityModel')}</span><span className="pass">{t('ontologyUniqueIdentifiers')}</span><span className={issues.some((issue) => issue.includes('relationship')) ? 'fail' : 'pass'}>{t('ontologyValidEndpoints')}</span><span className={issues.some((issue) => issue.includes('description')) ? 'fail' : 'pass'}>{t('ontologyDocumentedTypes')}</span></div>
      </section>

      {dialog && <BuilderModal dialog={dialog} contract={contract} domainGroups={domainGroups} selectedType={selectedType} pendingConnection={pendingConnection} releases={releases} saving={saving} onClose={() => { setDialog(null); setPendingConnection(undefined) }} onEntity={addEntityType} onRelationship={addRelationship} onProperty={addProperty} onPublish={publishContract} />}
      {importOpen && <ImportStudio contract={contract} onClose={() => setImportOpen(false)} onApply={(next, summary) => { commit(next); setNotice(summary); setImportOpen(false) }} />}
    </>
  )
}

interface BuilderModalProps {
  dialog: Exclude<BuilderDialog, null>
  contract: ContextContract
  domainGroups: string[]
  selectedType: EntityTypeDefinition | undefined
  pendingConnection: Connection | undefined
  releases: ContractRelease[]
  saving: boolean
  onClose: () => void
  onEntity: (event: FormEvent<HTMLFormElement>) => void
  onRelationship: (event: FormEvent<HTMLFormElement>) => void
  onProperty: (event: FormEvent<HTMLFormElement>) => void
  onPublish: (event: FormEvent<HTMLFormElement>) => void
}

function BuilderModal({ dialog, contract, domainGroups, selectedType, pendingConnection, releases, saving, onClose, onEntity, onRelationship, onProperty, onPublish }: BuilderModalProps) {
  const { t } = useMessages()
  const [selectedBump, setSelectedBump] = useState<'major' | 'minor' | 'patch'>('minor')
  const title = dialog === 'entity' ? t('ontologyCreateEntityTitle') : dialog === 'relationship' ? t('ontologyConnectEntitiesTitle') : dialog === 'publish' ? t('ontologyPublishTitle') : t('ontologyAddPropertyTitle', { label: selectedType?.label ?? '' })
  const submit = dialog === 'entity' ? onEntity : dialog === 'relationship' ? onRelationship : dialog === 'publish' ? onPublish : onProperty
  return <div className="modal-backdrop builder-drawer-backdrop" role="presentation">
    <section className="builder-modal builder-drawer" role="complementary" aria-labelledby="builder-modal-title">
      <div className="modal-header"><div><span className="panel-kicker">{t('ontologySchemaChange').toLocaleUpperCase()}</span><h2 id="builder-modal-title">{title}</h2></div><button aria-label={t('ontologyCloseDialog')} onClick={onClose}>×</button></div>
      <form onSubmit={submit}>
        {dialog === 'entity' && <>
          <label>{t('ontologyDisplayName')}<input name="label" required autoFocus placeholder={t('ontologyExampleCareEpisode')} /></label>
          <label>{t('ontologyDescription')}<textarea name="description" required placeholder={t('ontologyConceptMeaning')} /></label>
          <div className="form-split"><DomainGroupField groups={domainGroups} label={t('ontologyDomainGroup')} value={domainGroups[0] ?? ''} addGroupLabel={t('ontologyAddDomainGroup')} newGroupLabel={t('ontologyNewDomainGroup')} newGroupPlaceholder={t('ontologyNewDomainGroupPlaceholder')} name="group" /><label>{t('ontologyImpact')}<select name="impact" defaultValue="MEDIUM"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label></div>
          <EntityIconPicker name="icon" value={DEFAULT_ENTITY_ICON} onChange={() => undefined} label={t('ontologyIcon')} />
        </>}
        {dialog === 'relationship' && <>
          <label>{t('ontologyRelationshipLabel')}<input name="label" required autoFocus placeholder={t('ontologyExampleGovernedBy')} /></label>
          <div className="form-split"><label>{t('ontologySourceType')}<select name="sourceTypeId" defaultValue={pendingConnection?.source ?? contract.entityTypes[0]?.id}>{contract.entityTypes.map((type) => <option value={type.id} key={type.id}>{type.label}</option>)}</select></label><label>{t('ontologyTargetType')}<select name="targetTypeId" defaultValue={pendingConnection?.target ?? contract.entityTypes[0]?.id}>{contract.entityTypes.map((type) => <option value={type.id} key={type.id}>{type.label}</option>)}</select></label></div>
          <label>{t('ontologyCardinality')}<select name="cardinality" defaultValue="MANY_TO_ONE"><option>ONE_TO_ONE</option><option>ONE_TO_MANY</option><option>MANY_TO_ONE</option><option>MANY_TO_MANY</option></select></label>
          <label>{t('ontologyDescription')}<textarea name="description" required placeholder={t('ontologyConnectionMeaning')} /></label>
          <label>{t('ontologyImpact')}<select name="impact" defaultValue="MEDIUM"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label>
        </>}
        {dialog === 'property' && <>
          <label>{t('ontologyPropertyName')}<input name="name" required autoFocus placeholder={t('ontologyExampleIdentifier')} /></label>
          <label>{t('ontologyDataType')}<select name="dataType" defaultValue="string"><option>string</option><option>integer</option><option>decimal</option><option>boolean</option><option>date</option><option>datetime</option><option>enum</option></select></label>
          <label>{t('ontologyDescription')}<textarea name="description" required placeholder={t('ontologyAttributeMeaning')} /></label>
          <div className="checkbox-row"><label><input type="checkbox" name="required" /> {t('ontologyRequired')}</label><label><input type="checkbox" name="identifier" /> {t('ontologyIdentifier')}</label></div>
        </>}
        {dialog === 'publish' && <>
          <div className="publish-summary"><span className="validation-pass">✓</span><div><b>{t('ontologyStructuralPass')}</b><small>{t('ontologyPublishSummary', { types: contract.entityTypes.length, relationships: contract.relationshipTypes.length, tests: contract.tests.filter((test) => test.status === 'PASS').length })}</small></div></div>
          <label>{t('ontologyVersionIncrement')}<select name="bump" value={selectedBump} onChange={(event) => setSelectedBump(event.target.value as typeof selectedBump)}><option value="patch">{t('ontologyPatchOption')}</option><option value="minor">{t('ontologyMinorOption')}</option><option value="major">{t('ontologyMajorOption')}</option></select></label>
          <label>{t('ontologyReleaseNotes')}<textarea name="notes" required placeholder={t('ontologyReleaseNotesPlaceholder')} /></label>
          <div className="next-version">{t('ontologyCurrent').toLocaleUpperCase()} <b>v{releases.at(-1)?.version ?? contract.version}</b><span>→</span>{t('ontologyNext').toLocaleUpperCase()} <b>{previewVersion(releases.at(-1)?.version ?? contract.version, selectedBump)}</b></div>
        </>}
        <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>{t('commonCancel')}</button><button className="release" type="submit" disabled={saving}>{saving ? t('ontologyWorking') : dialog === 'entity' ? t('ontologyCreateType') : dialog === 'relationship' ? t('ontologyCreateRelationship') : dialog === 'publish' ? t('ontologyValidatePublish') : t('ontologyAddProperty')}</button></div>
      </form>
    </section>
  </div>
}

function validateContract(contract: ContextContract, ontologyOnly = false): string[] {
  const issues: string[] = []
  const ids = contract.entityTypes.map((type) => type.id)
  if (ids.length === 0) issues.push('At least one entity type is required before publishing.')
  if (!ontologyOnly && contract.competencyQuestions.length === 0) issues.push('At least one competency question is required before publishing.')
  if (new Set(ids).size !== ids.length) issues.push('Entity type identifiers must be unique.')
  for (const type of contract.entityTypes) {
    if (!type.description.trim()) issues.push(`${type.label} needs a description.`)
    const propertyIds = type.properties.map((property) => property.id)
    if (new Set(propertyIds).size !== propertyIds.length) issues.push(`${type.label} has duplicate property identifiers.`)
  }
  for (const relationship of contract.relationshipTypes) {
    if (!ids.includes(relationship.sourceTypeId) || !ids.includes(relationship.targetTypeId)) issues.push(`${relationship.label} relationship has an invalid endpoint.`)
  }
  return issues
}

function uniqueDomainGroups(entityTypes: EntityTypeDefinition[]): string[] {
  const groups = new Map<string, string>()
  for (const entityType of entityTypes) {
    const group = entityType.group.trim()
    if (group && !groups.has(group.toLocaleLowerCase())) groups.set(group.toLocaleLowerCase(), group)
  }
  return [...groups.values()]
}

function slugify(value: string): string {
  return value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'untitled'
}

function uniqueId(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base
  let suffix = 2
  while (existing.includes(`${base}_${suffix}`)) suffix += 1
  return `${base}_${suffix}`
}

function typeLabel(contract: ContextContract, id: string): string {
  return contract.entityTypes.find((type) => type.id === id)?.label ?? id
}

function previewVersion(version: string, bump: 'major' | 'minor' | 'patch'): string {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map((part) => Number.parseInt(part, 10) || 0)
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}
