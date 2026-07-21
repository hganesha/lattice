import { useMemo, useState } from 'react'
import type {
  BindingFieldMapping,
  BindingOperationProposal,
  BindingPreview,
  ContextContract,
  ContextTest,
  EvidenceRecord,
  OperationDefinition,
  SourceBinding,
  ConnectorProvider,
  ConnectorResource,
} from '@lattice/contracts'
import { connectorTemplate } from '@lattice/contracts'
import { API_URL } from './api'
import { ConnectorPicker } from './ConnectorPicker'
import { useMessages } from './i18n/messages'

export interface BindingDraftResult {
  binding: SourceBinding
  evidence: EvidenceRecord
  operation: OperationDefinition
  test: ContextTest
}

interface BindingEditorProps {
  contract: ContextContract
  workspaceId?: string
  onCancel: () => void
  onApply: (result: BindingDraftResult) => void
}

const gridApiExample = `openapi: 3.1.0
info:
  title: Grid Operations API
  version: 1.0.0
servers:
  - url: https://grid.example.internal
paths:
  /outages/{eventId}:
    get:
      operationId: grid.get_outage_context
      summary: Get governed outage context
      responses:
        '200':
          description: Current outage context
          content:
            application/json:
              schema:
                type: object
                required: [eventId, startedAt, severity]
                properties:
                  eventId: { type: string }
                  startedAt: { type: string, format: date-time }
                  severity: { type: string, enum: [MINOR, MAJOR, CRITICAL] }
                  affectedAsset:
                    type: object
                    required: [assetId]
                    properties:
                      assetId: { type: string }
                      operationalStatus: { type: string }
`

export function BindingEditor({ contract, workspaceId, onCancel, onApply }: BindingEditorProps) {
  const { t } = useMessages()
  const [connectorId, setConnectorId] = useState<ConnectorProvider>()
  const [sourceName, setSourceName] = useState('')
  const [sourceSystem, setSourceSystem] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://api.example.internal')
  const [environment, setEnvironment] = useState('development')
  const [freshnessMinutes, setFreshnessMinutes] = useState(15)
  const [permission, setPermission] = useState('context.read')
  const [credentialRef, setCredentialRef] = useState('')
  const [resource, setResource] = useState<ConnectorResource>({})
  const [queryTemplate, setQueryTemplate] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [preview, setPreview] = useState<BindingPreview>()
  const [operationId, setOperationId] = useState('')
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [entitySelections, setEntitySelections] = useState<Record<string, string>>({})
  const [focusTypeId, setFocusTypeId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const operation = preview?.operations.find((item) => item.id === operationId) ?? preview?.operations[0]
  const propertyOptions = useMemo(() => contract.entityTypes.flatMap((type) => type.properties.map((property) => ({ type, property, value: `${type.id}|${property.id}` }))), [contract.entityTypes])
  const mappedCount = operation?.fields.filter((field) => mappings[field.path]).length ?? 0
  const requiredUnmapped = operation?.fields.filter((field) => field.required && !mappings[field.path]).length ?? 0
  const connector = connectorId ? connectorTemplate(connectorId) : undefined
  const missingResource = connector?.resourceFields.some((field) => !resource[field]?.trim()) ?? false

  function selectConnector(provider: ConnectorProvider) {
    const selected = connectorTemplate(provider)
    setConnectorId(provider)
    setSourceSystem(selected.label)
    setBaseUrl('')
    setCredentialRef(selected.credentialRefPlaceholder)
    setPermission(selected.permissionPlaceholder)
    setResource({})
    setQueryTemplate(selected.operationVerb === 'QUERY' ? 'SELECT * FROM <governed_object> WHERE <parameterized_filter>' : '')
    setSourceName('')
    setSourceText('')
    setPreview(undefined)
    setError('')
  }

  function loadExample() {
    setSourceName('grid-operations.openapi.yaml')
    setSourceSystem('Grid Operations API')
    setBaseUrl('https://grid.example.internal')
    setEnvironment('development')
    setFreshnessMinutes(5)
    setPermission('grid.outage.read')
    setCredentialRef('vault:grid/operations-api')
    setSourceText(gridApiExample)
    setPreview(undefined)
    setError('')
  }

  function loadTabularExample() {
    setSourceName('operations.current_outages')
    setSourceSystem(connector?.label ? `${connector.label} · Grid operations` : 'Grid operations')
    setBaseUrl(connector?.id === 'DATABRICKS' ? 'https://dbc-example.cloud.databricks.com' : connector?.id === 'SNOWFLAKE' ? 'https://example.snowflakecomputing.com' : connector?.id === 'MICROSOFT_FABRIC' ? 'workspace.datawarehouse.fabric.microsoft.com' : 'data.example.internal')
    setResource(connector?.id === 'DATABRICKS' ? { warehouse: 'warehouse-id', catalog: 'operations', schema: 'grid', object: 'current_outages' } : connector?.id === 'MICROSOFT_FABRIC' ? { workspace: 'grid-operations', database: 'OperationsWarehouse', schema: 'grid', object: 'current_outages' } : connector?.id === 'SNOWFLAKE' ? { warehouse: 'OPERATIONS_WH', database: 'OPERATIONS', schema: 'GRID', object: 'CURRENT_OUTAGES' } : { schema: 'operations', object: 'current_outages' })
    setQueryTemplate('SELECT event_id, severity, started_at, asset_id, customers_affected FROM operations.current_outages WHERE event_id = :event_id')
    setPermission(`${connector?.id.toLocaleLowerCase() ?? 'source'}.outage.read`)
    setSourceText(`fields:\n  - { name: event_id, type: string, required: true }\n  - { name: severity, type: string, required: true }\n  - { name: started_at, type: timestamp }\n  - { name: asset_id, type: string }\n  - { name: customers_affected, type: bigint }`)
    setPreview(undefined)
    setError('')
  }

  async function analyze() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/v1/bindings/preview`, {
        method: 'POST',
        headers: { Authorization: 'Bearer studio-demo', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(workspaceId ? { workspaceId } : { contractId: contract.id }),
          sourceName,
          sourceText,
          format: connector?.id === 'OPENAPI' ? 'OPENAPI' : 'TABULAR_SCHEMA',
          ...(connector?.id === 'OPENAPI' ? {} : { operationId: `${slugify(sourceSystem)}.${connector?.operationVerb.toLocaleLowerCase()}_${slugify(sourceName)}`, operationLabel: `${connector?.operationVerb === 'QUERY' ? 'Query' : connector?.operationVerb === 'SUBSCRIBE' ? 'Subscribe to' : 'Read'} ${sourceName}` }),
        }),
      })
      const payload = await response.json() as BindingPreview & { message?: string; error?: string }
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Preview failed (${response.status})`)
      const selected = payload.operations[0]
      const suggested = suggestMappings(selected, propertyOptions)
      setPreview(payload)
      setOperationId(selected?.id ?? '')
      setMappings(suggested)
      setEntitySelections(entitySelectionsFromMappings(suggested, propertyOptions))
      setFocusTypeId(dominantTargetType(suggested, propertyOptions) ?? '')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('bindingEditorAnalyzeFailed'))
    } finally {
      setLoading(false)
    }
  }

  function chooseOperation(id: string) {
    setOperationId(id)
    const selected = preview?.operations.find((item) => item.id === id)
    const suggested = suggestMappings(selected, propertyOptions)
    setMappings(suggested)
    setEntitySelections(entitySelectionsFromMappings(suggested, propertyOptions))
    setFocusTypeId(dominantTargetType(suggested, propertyOptions) ?? '')
  }

  function chooseEntityForField(fieldPath: string, typeId: string) {
    setEntitySelections((current) => ({ ...current, [fieldPath]: typeId }))
    const suggested = suggestTarget(fieldPath, propertyOptions.filter((option) => option.type.id === typeId))
    setMappings((current) => ({ ...current, [fieldPath]: suggested?.value ?? '' }))
  }

  function mapSuggestedToEntity() {
    if (!focusTypeId || !operation) return
    const focusedOptions = propertyOptions.filter((option) => option.type.id === focusTypeId)
    setEntitySelections((current) => ({ ...current, ...Object.fromEntries(operation.fields.map((field) => [field.path, current[field.path] || focusTypeId])) }))
    setMappings((current) => ({ ...current, ...Object.fromEntries(operation.fields.flatMap((field) => {
      if (current[field.path]) return []
      const target = suggestTarget(field.path, focusedOptions)
      return target ? [[field.path, target.value]] : []
    })) }))
  }

  function apply() {
    if (!preview || !operation || !connector || mappedCount === 0) return
    const id = uniqueId(`binding_${slugify(sourceSystem)}_${slugify(operation.operationId)}`, contract.bindings.map((binding) => binding.id))
    const fieldMappings: BindingFieldMapping[] = operation.fields.flatMap((field) => {
      const target = mappings[field.path]
      if (!target) return []
      const [targetTypeId = '', targetPropertyId = ''] = target.split('|')
      const suggested = suggestTarget(field.path, propertyOptions)?.value === target
      return [{ sourcePath: field.path, targetTypeId, targetPropertyId, sourceDataType: field.dataType, confidence: suggested ? 'SUGGESTED' as const : 'MANUAL' as const }]
    })
    const binding: SourceBinding = {
      id,
      sourceSystem: sourceSystem.trim(),
      operationId: operation.operationId,
      environment,
      freshnessMinutes,
      requiredPermissions: permission.split(',').map((item) => item.trim()).filter(Boolean),
      expectedResultSchema: operation.expectedResultSchema,
      version: '0.1.0',
      approvalStatus: 'DRAFT',
      adapterType: connector.adapterType,
      connector: { provider: connector.id, transport: connector.transport, credentialRef: credentialRef.trim(), resource, ...(queryTemplate.trim() ? { queryTemplate: queryTemplate.trim() } : {}), parameterStyle: connector.parameterStyle, readOnly: true },
      endpoint: connector.id === 'OPENAPI' ? `${baseUrl.replace(/\/$/, '')}${operation.path}` : baseUrl.trim(),
      method: connector.operationVerb,
      sourceChecksum: preview.sourceChecksum,
      mappings: fieldMappings,
      healthStatus: requiredUnmapped === 0 ? 'VALID' : 'WARNING',
      executionMode: connector.id === 'OPENAPI' ? 'HTTP' : 'CONNECTOR',
    }
    const timestamp = preview.createdAt
    const evidenceId = `ev_${id}`
    onApply({
      binding,
      evidence: { id: evidenceId, type: 'DATA_BINDING', title: `${sourceSystem} binding definition`, source: 'Lattice Source Binding Studio', locator: sourceName, checksum: preview.sourceChecksum, observedAt: timestamp, validFrom: timestamp, status: 'TEMPLATE_DERIVED' },
      operation: { id: operation.operationId, label: operation.summary, description: `Governed operation imported from ${sourceName}.`, keywords: operation.summary.toLocaleLowerCase().split(/\s+/), requiredEntityTypes: [...new Set(fieldMappings.map((mapping) => mapping.targetTypeId))], metricIds: [], relationshipPath: [], sourceBindingIds: [id], riskTier: 'INFORMATIONAL', requiredPermissions: binding.requiredPermissions, expectedResultSchema: operation.expectedResultSchema },
      test: { id: `test_mapping_${id}`, type: 'MAPPING', label: `${sourceSystem} response fields map to governed properties.`, status: requiredUnmapped === 0 ? 'PASS' : 'NOT_RUN', ...(requiredUnmapped === 0 ? { lastRun: timestamp } : {}), affectedClaimIds: [id, ...fieldMappings.map((mapping) => mapping.targetPropertyId)] },
    })
  }

  if (!connector) return <ConnectorPicker onCancel={onCancel} onSelect={selectConnector} />

  const isOpenApi = connector.id === 'OPENAPI'

  return <section className="binding-editor">
    <header className="binding-editor-header"><div><button className="ghost" onClick={() => setConnectorId(undefined)}>{t('bindingEditorBackConnectors')}</button><span className="panel-kicker">{t('bindingEditorNew', { provider: connector.label }).toLocaleUpperCase()}</span><h2>{preview ? t('bindingEditorMapSource') : t('bindingEditorConfigure', { provider: connector.label })}</h2></div><div className="binding-editor-steps"><span className={!preview ? 'active' : 'complete'}>{t('bindingEditorStepSource').toLocaleUpperCase()}</span><i>→</i><span className={preview ? 'active' : ''}>{t('bindingEditorStepMap').toLocaleUpperCase()}</span><i>→</i><span>{t('bindingEditorStepDraft').toLocaleUpperCase()}</span></div></header>
    {!preview ? <div className="binding-source-grid">
      <main className="binding-source-main panel"><div className="panel-header"><div><span className="panel-kicker">{(isOpenApi ? t('bindingEditorOpenApiDocument') : t('bindingEditorSourceSchema')).toLocaleUpperCase()}</span><h2>{isOpenApi ? t('bindingEditorDescribeSurface') : t('bindingEditorDeclareShape')}</h2></div><button className="ghost" onClick={isOpenApi ? loadExample : loadTabularExample}>{t('bindingEditorLoadExample')}</button></div><div className="binding-form-body"><label>{isOpenApi ? t('bindingEditorSourceDocumentName') : t('bindingEditorGovernedObject')}<input value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder={isOpenApi ? 'operations.openapi.yaml' : 'catalog.schema.table_or_view'} /></label><label>{isOpenApi ? t('bindingEditorOpenApiSource') : t('bindingEditorColumnSchema')}<textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder={isOpenApi ? t('bindingEditorOpenApiPlaceholder') : 'fields:\n  - { name: event_id, type: string, required: true }'} autoFocus /></label>{!isOpenApi && <label>{t('bindingEditorReadOnlyQuery')}<textarea className="query-template" value={queryTemplate} onChange={(event) => setQueryTemplate(event.target.value)} placeholder="SELECT governed_columns FROM governed_object WHERE id = :id" /></label>}</div></main>
      <aside className="binding-source-config panel"><div className="panel-header"><div><span className="panel-kicker">{t('bindingEditorRuntimeContract').toLocaleUpperCase()}</span><h2>{t('bindingEditorTransportReadOnly', { transport: connector.transport })}</h2></div></div><div className="binding-form-body"><label>{t('bindingEditorSourceSystem')}<input value={sourceSystem} onChange={(event) => setSourceSystem(event.target.value)} placeholder={connector.label} /></label><label>{t('bindingEditorEndpoint')}<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={connector.endpointPlaceholder} /></label>{connector.resourceFields.length > 0 && <div className="connector-resource-fields">{connector.resourceFields.map((field) => <label key={field}>{humanizeField(field)}<input value={resource[field] ?? ''} onChange={(event) => setResource((current) => ({ ...current, [field]: event.target.value }))} placeholder={field === 'object' ? t('bindingEditorObjectPlaceholder') : field} /></label>)}</div>}<label>{t('bindingEditorCredentialReference')}<input value={credentialRef} onChange={(event) => setCredentialRef(event.target.value)} placeholder={connector.credentialRefPlaceholder} /><small>{t('bindingEditorCredentialNote')}</small></label><div className="binding-form-split"><label>{t('bindingEditorEnvironment')}<select value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="development">{t('bindingEditorDevelopment')}</option><option value="staging">{t('bindingEditorStaging')}</option><option value="production">{t('bindingEditorProduction')}</option></select></label><label>{t('bindingEditorFreshness')}<input type="number" min="1" value={freshnessMinutes} onChange={(event) => setFreshnessMinutes(Number(event.target.value))} /></label></div><label>{t('bindingEditorPermissions')}<input value={permission} onChange={(event) => setPermission(event.target.value)} placeholder={connector.permissionPlaceholder} /><small>{t('bindingEditorPermissionsNote')}</small></label>{error && <div className="wizard-error" role="alert">{error}</div>}</div></aside>
    </div> : <div className="binding-map-grid">
      <main className="binding-mapping panel"><div className="panel-header"><div><span className="panel-kicker">{t('bindingEditorFieldMapping').toLocaleUpperCase()}</span><h2>{operation?.summary}</h2></div><select aria-label={t('bindingEditorApiOperation')} value={operation?.id} onChange={(event) => chooseOperation(event.target.value)}>{preview.operations.map((item) => <option value={item.id} key={item.id}>{item.method} {item.path} · {item.operationId}</option>)}</select></div><div className="mapping-entity-toolbar"><label>{t('bindingEditorFocusEntity')}<select value={focusTypeId} onChange={(event) => setFocusTypeId(event.target.value)}><option value="">{t('bindingEditorChooseEntity')}</option>{contract.entityTypes.filter((type) => type.properties.length > 0).map((type) => <option value={type.id} key={type.id}>{type.label} · {t('bindingEditorPropertyCount', { count: type.properties.length })}</option>)}</select></label><div><p>{t('bindingEditorFocusEntityDescription')}</p><button className="ghost" onClick={mapSuggestedToEntity} disabled={!focusTypeId}>{t('bindingEditorMapSuggested')}</button></div></div><div className="mapping-table"><div className="mapping-table-head"><span>{t('bindingEditorSourceField').toLocaleUpperCase()}</span><span>{t('runtimeType').toLocaleUpperCase()}</span><span>{t('bindingEditorEntity').toLocaleUpperCase()}</span><span>{t('bindingEditorProperty').toLocaleUpperCase()}</span><span>{t('summaryContractStatus').toLocaleUpperCase()}</span></div>{operation?.fields.map((field) => { const target = mappings[field.path] ?? ''; const targetOption = propertyOptions.find((option) => option.value === target); const selectedTypeId = entitySelections[field.path] ?? targetOption?.type.id ?? focusTypeId; const typeProperties = propertyOptions.filter((option) => option.type.id === selectedTypeId); const compatibility = target ? mappingCompatibility(field.dataType, targetOption?.property.dataType) : 'UNMAPPED'; return <div className="mapping-row" key={field.path}><div><code>{field.path}</code><small>{field.label}{field.required ? ` · ${t('ontologyRequired')}` : ''}</small></div><span>{field.dataType}</span><select aria-label={t('bindingEditorEntityFor', { field: field.path })} value={selectedTypeId} onChange={(event) => chooseEntityForField(field.path, event.target.value)}><option value="">{t('bindingEditorChooseEntity')}</option>{contract.entityTypes.filter((type) => type.properties.length > 0).map((type) => <option value={type.id} key={type.id}>{type.label}</option>)}</select><select aria-label={t('bindingEditorTargetFor', { field: field.path })} value={target} onChange={(event) => setMappings((current) => ({ ...current, [field.path]: event.target.value }))} disabled={!selectedTypeId}><option value="">{t('bindingEditorLeaveUnmapped')}</option>{typeProperties.map((option) => <option value={option.value} key={option.value}>{option.property.name} · {option.property.dataType}</option>)}</select><b className={compatibility.toLocaleLowerCase()}>{compatibility}</b></div>})}</div></main>
      <aside className="mapping-summary panel"><div className="panel-header"><div><span className="panel-kicker">{t('bindingEditorValidation').toLocaleUpperCase()}</span><h2>{t('bindingEditorReadiness')}</h2></div></div><div className="mapping-score"><b>{mappedCount}</b><span>{t('bindingEditorMappedScore', { mapped: mappedCount, total: operation?.fields.length ?? 0 })}</span></div><dl><div><dt>{t('bindingEditorOperation')}</dt><dd>{operation?.method} {operation?.path}</dd></div><div><dt>{t('bindingEditorRequiredUnmapped')}</dt><dd className={requiredUnmapped > 0 ? 'warning' : 'valid'}>{requiredUnmapped}</dd></div><div><dt>{t('bindingEditorFreshnessShort')}</dt><dd>≤ {freshnessMinutes} min</dd></div><div><dt>{t('bindingEditorEnvironment')}</dt><dd>{environment}</dd></div></dl><div className="mapping-provenance"><span>{t('bindingEditorSourceChecksum').toLocaleUpperCase()}</span><code>{preview.sourceChecksum.slice(0, 29)}…</code><small>{sourceName}</small></div>{preview.warnings.map((warning) => <div className="import-warning" key={warning}>! {warning}</div>)}</aside>
    </div>}
    <footer className="binding-editor-footer"><div><button className="ghost" onClick={preview ? () => setPreview(undefined) : () => setConnectorId(undefined)}>{preview ? t('bindingEditorBackSource') : t('bindingEditorBackCatalog')}</button><span>{preview ? t('bindingEditorMappingsStaged') : t('bindingEditorPreviewOnly')}</span></div>{preview ? <button className="release" onClick={apply} disabled={mappedCount === 0}>{t('bindingEditorStage')}</button> : <button className="release" onClick={() => void analyze()} disabled={loading || !sourceName.trim() || !sourceSystem.trim() || !sourceText.trim() || !baseUrl.trim() || !credentialRef.trim() || missingResource}>{loading ? t('bindingEditorDiscovering') : t('bindingEditorDiscover', { kind: isOpenApi ? t('bindingEditorOperations') : t('bindingEditorFields') })}</button>}</footer>
  </section>
}

function humanizeField(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())
}

interface PropertyOption {
  value: string
  type: ContextContract['entityTypes'][number]
  property: ContextContract['entityTypes'][number]['properties'][number]
}

function suggestMappings(operation: BindingOperationProposal | undefined, options: PropertyOption[]): Record<string, string> {
  return Object.fromEntries((operation?.fields ?? []).flatMap((field) => {
    const target = suggestTarget(field.path, options)
    return target ? [[field.path, target.value]] : []
  }))
}

function suggestTarget(path: string, options: PropertyOption[]): PropertyOption | undefined {
  const field = normalize(path.split('.').at(-1)?.replace('[]', '') ?? path)
  return options.find((option) => normalize(option.property.id.split('.').at(-1) ?? '') === field)
    ?? options.find((option) => normalize(option.property.name) === field)
    ?? options.find((option) => {
      const property = normalize(option.property.name)
      return field.length >= 5 && property.length >= 5 && (field.endsWith(property) || property.endsWith(field))
    })
}

function entitySelectionsFromMappings(mappings: Record<string, string>, options: PropertyOption[]): Record<string, string> {
  return Object.fromEntries(Object.entries(mappings).flatMap(([path, value]) => {
    const typeId = options.find((option) => option.value === value)?.type.id
    return typeId ? [[path, typeId]] : []
  }))
}

function dominantTargetType(mappings: Record<string, string>, options: PropertyOption[]): string | undefined {
  const counts = new Map<string, number>()
  for (const value of Object.values(mappings)) {
    const typeId = options.find((option) => option.value === value)?.type.id
    if (typeId) counts.set(typeId, (counts.get(typeId) ?? 0) + 1)
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0]
}

function mappingCompatibility(sourceType: string, targetType: string | undefined): 'COMPATIBLE' | 'REVIEW' | 'UNMAPPED' {
  if (!targetType) return 'UNMAPPED'
  const families: Record<string, string> = { string: 'text', enum: 'text', date: 'time', datetime: 'time', 'date-time': 'time', integer: 'number', decimal: 'number', number: 'number', boolean: 'boolean' }
  return families[sourceType] === families[targetType] ? 'COMPATIBLE' : 'REVIEW'
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
}

function slugify(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'source'
}

function uniqueId(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base
  let suffix = 2
  while (existing.includes(`${base}_${suffix}`)) suffix += 1
  return `${base}_${suffix}`
}
