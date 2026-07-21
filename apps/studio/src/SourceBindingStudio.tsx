import { useMemo, useState } from 'react'
import type { ConnectorValidationResult, ContextContract, SourceBinding } from '@lattice/contracts'
import { BindingEditor, type BindingDraftResult } from './BindingEditor'
import { API_URL } from './api'
import { useMessages } from './i18n/messages'
import { ConfirmDialog } from './ConfirmDialog'
import { Toast } from './Toast'

interface SourceBindingStudioProps {
  contract: ContextContract
  scope?: 'ONTOLOGY' | 'CONTRACT'
  workspaceId?: string
  onChange: (contract: ContextContract) => void
  onDirtyChange: (dirty: boolean) => void
  onOpenOntology: () => void
}

export function SourceBindingStudio({ contract, scope = 'CONTRACT', workspaceId, onChange, onDirtyChange, onOpenOntology }: SourceBindingStudioProps) {
  const { t } = useMessages()
  const [editorOpen, setEditorOpen] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<SourceBinding>()
  const [notice, setNotice] = useState('')
  const [validatingId, setValidatingId] = useState('')
  const [validationResults, setValidationResults] = useState<Record<string, ConnectorValidationResult>>({})
  const stats = useMemo(() => ({
    mappedFields: contract.bindings.reduce((count, binding) => count + (binding.mappings?.length ?? 0), 0),
    valid: contract.bindings.filter((binding) => binding.healthStatus === 'VALID' || binding.approvalStatus === 'APPROVED').length,
    environments: new Set(contract.bindings.map((binding) => binding.environment)).size,
  }), [contract.bindings])

  function applyBinding(result: BindingDraftResult) {
    const ontologyId = contract.ontologyRef?.ontologyId
    const binding: SourceBinding = { ...result.binding, scope, ...(scope === 'ONTOLOGY' && ontologyId ? { ontologyId } : {}) }
    const existingOperation = contract.operations.find((operation) => operation.id === binding.operationId)
    const operations = existingOperation ? contract.operations.map((operation) => operation.id === binding.operationId ? {
      ...operation,
      sourceBindingIds: [...new Set([...operation.sourceBindingIds, binding.id])],
      requiredPermissions: [...new Set([...operation.requiredPermissions, ...binding.requiredPermissions])],
    } : operation) : [...contract.operations, result.operation]
    const next = {
      ...contract,
      releaseStatus: 'UNPUBLISHED' as const,
      versions: { ...contract.versions, bindings: `${contract.id}-bindings@${binding.version}` },
      bindings: [...contract.bindings, binding],
      operations,
      evidence: contract.evidence.some((item) => item.id === result.evidence.id) ? contract.evidence : [...contract.evidence, result.evidence],
      tests: [...contract.tests, result.test],
    }
    onChange(next)
    onDirtyChange(true)
    setNotice(t('bindingStagedNotice', { source: binding.sourceSystem, method: binding.method ?? 'OP', endpoint: binding.endpoint ?? binding.operationId, count: binding.mappings?.length ?? 0 }))
    setEditorOpen(false)
  }

  async function validateBinding(binding: SourceBinding) {
    if (!binding.connector) {
      setNotice(t('bindingLegacyValidation'))
      return
    }
    setValidatingId(binding.id)
    try {
      const response = await fetch(`${API_URL}/v1/connectors/validate`, { method: 'POST', headers: { Authorization: 'Bearer studio-demo', 'Content-Type': 'application/json' }, body: JSON.stringify({ binding }) })
      const result = await response.json() as ConnectorValidationResult & { error?: string }
      if (!response.ok && !result.status) throw new Error(result.error ?? `Connector validation returned ${response.status}`)
      setValidationResults((current) => ({ ...current, [binding.id]: result }))
      setNotice(t('bindingValidationNotice', { source: binding.sourceSystem, status: result.status.toLocaleLowerCase(), driver: result.driver.replaceAll('_', ' ').toLocaleLowerCase(), credential: result.credentialState.toLocaleLowerCase() }))
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : t('bindingValidationFailed'))
    } finally {
      setValidatingId('')
    }
  }

  function removeBinding(binding: SourceBinding) {
    onChange({
      ...contract,
      releaseStatus: 'UNPUBLISHED',
      bindings: contract.bindings.filter((item) => item.id !== binding.id),
      operations: contract.operations.map((operation) => ({ ...operation, sourceBindingIds: operation.sourceBindingIds.filter((id) => id !== binding.id) })),
      evidence: contract.evidence.filter((item) => item.checksum !== binding.sourceChecksum && item.id !== `ev_${binding.id}`),
      tests: contract.tests.filter((test) => !test.affectedClaimIds.includes(binding.id)),
    })
    onDirtyChange(true)
    setValidationResults((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== binding.id)))
    setNotice(t('bindingRemovedNotice', { source: binding.sourceSystem }))
    setPendingRemoval(undefined)
  }

  if (editorOpen) return <BindingEditor contract={contract} {...(workspaceId ? { workspaceId } : {})} onCancel={() => setEditorOpen(false)} onApply={applyBinding} />

  return <section className="binding-studio-page">
    <div className="binding-hero">
      <div><span className="panel-kicker">{t('bindingStudio').toLocaleUpperCase()}</span><h2>{scope === 'ONTOLOGY' ? t('bindingOntologyHeroTitle') : t('bindingHeroTitle')}</h2><p>{scope === 'ONTOLOGY' ? t('bindingOntologyHeroDescription') : t('bindingHeroDescription')}</p></div>
      <div className="binding-hero-actions"><button className="release" onClick={() => setEditorOpen(true)} disabled={contract.entityTypes.every((type) => type.properties.length === 0)}>{t('bindingNew')}</button></div>
    </div>
    {notice && <Toast message={notice} closeLabel={t('commonClose')} onDismiss={() => setNotice('')} />}
    {contract.entityTypes.every((type) => type.properties.length === 0) && <div className="binding-prerequisite"><span>◇</span><div><b>{t('bindingPrerequisite')}</b><p>{t('bindingPrerequisiteDescription')}</p></div><button className="ghost" onClick={onOpenOntology}>{t('bindingAddPropertiesAction')} →</button></div>}

    <div className="binding-stats">
      <BindingStat label={t('bindingStatBindings').toLocaleUpperCase()} value={String(contract.bindings.length)} meta={t('bindingStatAdapters')} tone="lime" />
      <BindingStat label={t('bindingStatMappedFields').toLocaleUpperCase()} value={String(stats.mappedFields)} meta={t('bindingStatSourceTarget')} tone="blue" />
      <BindingStat label={t('bindingStatHealth').toLocaleUpperCase()} value={`${stats.valid} / ${contract.bindings.length}`} meta={t('bindingStatValid')} tone="green" />
      <BindingStat label={t('bindingStatEnvironments').toLocaleUpperCase()} value={String(stats.environments)} meta={t('bindingStatBoundaries')} tone="amber" />
    </div>

    <div className="binding-layout">
      <main className="binding-catalog panel">
        <div className="panel-header"><div><span className="panel-kicker">{t(scope === 'ONTOLOGY' ? 'bindingOntologyBindings' : 'bindingContractBindings').toLocaleUpperCase()}</span><h2>{contract.name}</h2></div><span className="binding-count">{t('bindingConfiguredCount', { count: contract.bindings.length })}</span></div>
        <div className="binding-list">
          {contract.bindings.length === 0 && <div className="binding-empty"><span>⇄</span><h3>{t('bindingEmptyTitle')}</h3><p>{t('bindingEmptyDescription')}</p><button className="ghost" onClick={() => setEditorOpen(true)}>{t('bindingChooseConnector')}</button></div>}
          {contract.bindings.map((binding) => <BindingCard binding={binding} validation={validationResults[binding.id]} validating={validatingId === binding.id} onValidate={() => void validateBinding(binding)} {...(scope === 'ONTOLOGY' || binding.scope !== 'ONTOLOGY' ? { onRemove: () => setPendingRemoval(binding) } : {})} key={binding.id} />)}
        </div>
      </main>
      <aside className="binding-principles panel">
        <div className="panel-header"><div><span className="panel-kicker">{t('bindingTrustBoundary').toLocaleUpperCase()}</span><h2>{t('bindingGuarantees')}</h2></div></div>
        <ol><li><span>1</span><div><b>{t('bindingTypedOperation')}</b><p>{t('bindingTypedOperationDescription')}</p></div></li><li><span>2</span><div><b>{t('bindingSemanticMapping')}</b><p>{t('bindingSemanticMappingDescription')}</p></div></li><li><span>3</span><div><b>{t('bindingFreshnessContract')}</b><p>{t('bindingFreshnessDescription')}</p></div></li><li><span>4</span><div><b>{t('bindingPermissionDeclaration')}</b><p>{t('bindingPermissionDescription')}</p></div></li></ol>
        <div className="credential-note"><span>⌁</span><div><b>{t('bindingNoCredentials')}</b><p>{t('bindingNoCredentialsDescription')}</p></div></div>
      </aside>
    </div>
    {pendingRemoval && <ConfirmDialog title={t('bindingRemoveTitle')} description={t('bindingRemoveConfirm', { source: pendingRemoval.sourceSystem })} cancelLabel={t('commonCancel')} confirmLabel={t('commonRemove')} onCancel={() => setPendingRemoval(undefined)} onConfirm={() => removeBinding(pendingRemoval)} />}
  </section>
}

interface BindingCardProps {
  binding: SourceBinding
  validation: ConnectorValidationResult | undefined
  validating: boolean
  onValidate: () => void
  onRemove?: () => void
}

function BindingCard({ binding, validation, validating, onValidate, onRemove }: BindingCardProps) {
  const { t } = useMessages()
  const health = binding.healthStatus ?? (binding.approvalStatus === 'APPROVED' ? 'VALID' : 'NOT_TESTED')
  return <article className="binding-card">
    <div className="binding-card-icon">{binding.connector?.provider === 'MICROSOFT_FABRIC' ? 'FAB' : binding.connector?.provider === 'DATABRICKS' ? 'DBX' : binding.connector?.provider === 'SNOWFLAKE' ? 'SNF' : binding.adapterType === 'OPENAPI' ? 'API' : binding.adapterType === 'EVENT_STREAM' ? 'EVT' : binding.adapterType === 'FILE' ? 'OBJ' : 'DB'}</div>
    <div className="binding-card-main"><div><h3>{binding.sourceSystem}</h3><span className={`binding-health ${health.toLocaleLowerCase()}`}>{health.replaceAll('_', ' ')}</span>{binding.scope === 'ONTOLOGY' && <span className="connector-validation ready">{t('bindingSharedOntology')}</span>}{validation && <span className={`connector-validation ${validation.status.toLocaleLowerCase()}`}>{validation.status}</span>}</div><code>{binding.method ?? 'OP'} {binding.endpoint ?? binding.operationId}</code><p>{t('bindingRefreshMeta', { environment: binding.environment, minutes: binding.freshnessMinutes, version: binding.version, transport: binding.connector ? ` · ${binding.connector.transport}` : '' })}</p><div>{binding.connector && <span>{binding.connector.provider.replace('_', ' ')}</span>}{binding.requiredPermissions.map((permission) => <span key={permission}>{permission}</span>)}</div><div className="binding-card-actions"><button className="ghost" onClick={onValidate} disabled={validating || !binding.connector}>{validating ? t('commonValidating') : t('commonValidate')}</button>{onRemove && <button className="danger-link" onClick={onRemove}>{t('commonRemove')}</button>}</div></div>
    <div className="binding-card-metric"><b>{binding.mappings?.length ?? '—'}</b><span>{t('bindingMappings').toLocaleUpperCase()}</span>{validation && <small>{validation.driver.replaceAll('_', ' ')}</small>}</div>
  </article>
}

function BindingStat({ label, value, meta, tone }: { label: string; value: string; meta: string; tone: string }) {
  return <div className="binding-stat"><div><span>{label}</span><i className={`mini-dot ${tone}`} /></div><b>{value}</b><small>{meta}</small></div>
}
