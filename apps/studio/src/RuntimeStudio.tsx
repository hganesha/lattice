import { useState } from 'react'
import { canLoadGridOutageExample, loadGridOutageExample, type CompileResponse, type ContextContract, type ReleaseRuntimeStatus } from '@lattice/contracts'
import { API_URL } from './api'
import { CompileResolution } from './CompileResolution'
import { RuntimeGraph } from './RuntimeGraph'
import { RuntimeInspector } from './RuntimeInspector'
import { useMessages } from './i18n/messages'
import { Toast } from './Toast'

interface RuntimeStudioProps {
  contract: ContextContract
  runtimeStatus: ReleaseRuntimeStatus
  onChange: (contract: ContextContract) => void
  onDirtyChange: (dirty: boolean) => void
  onManageRelease: () => void
  onOpenAssurance: () => void
}

export function RuntimeStudio({ contract, runtimeStatus, onChange, onDirtyChange, onManageRelease, onOpenAssurance }: RuntimeStudioProps) {
  const { t, formatDate } = useMessages()
  const [question, setQuestion] = useState(contract.competencyQuestions[0]?.question ?? t('runtimeDefaultQuestion', { workflow: contract.workflow.replaceAll('_', ' ') }))
  const [result, setResult] = useState<CompileResponse>()
  const [selectedId, setSelectedId] = useState(contract.entities[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState('')
  const [view, setView] = useState<'MAP' | 'TABLE'>('MAP')
  const selected = contract.entities.find((entity) => entity.id === selectedId)

  function loadOperationalContext() {
    const next = loadGridOutageExample(contract)
    onChange(next)
    onDirtyChange(true)
    setSelectedId(next.entities.find((entity) => entity.typeId === 'outage_event')?.id ?? next.entities[0]?.id ?? '')
    setResult(undefined)
    setApiError(t('runtimeExampleStaged'))
  }

  async function compile() {
    setLoading(true)
    setApiError('')
    try {
      const response = await fetch(`${API_URL}/v1/compile`, {
        method: 'POST',
        headers: { Authorization: 'Bearer studio-demo', 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, contractId: contract.id }),
      })
      const payload = await response.json() as CompileResponse & { error?: string; message?: string }
      if (!response.ok && !payload.decision) throw new Error(payload.message ?? payload.error ?? `API returned ${response.status}`)
      setResult(payload)
      const candidatePlan = payload.plan ?? payload.pendingPlan
      const firstArgument = candidatePlan ? Object.values(candidatePlan.arguments).find((value): value is { entityId: string } => typeof value === 'object' && value !== null && 'entityId' in value) : undefined
      if (firstArgument) setSelectedId(firstArgument.entityId)
    } catch (error) {
      setApiError(error instanceof Error ? error.message : t('runtimeApiUnavailable'))
    } finally {
      setLoading(false)
    }
  }

  async function resolveClarification(entityId: string) {
    if (!result?.clarification) return
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/v1/clarifications/${result.clarification.id}`, {
        method: 'POST',
        headers: { Authorization: 'Bearer studio-demo', 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId }),
      })
      setResult(await response.json() as CompileResponse)
      setSelectedId(entityId)
    } finally {
      setLoading(false)
    }
  }

  return <section className="runtime-studio-page">
    <section className="compiler-bar">
      <div className="spark">✦</div>
      <div className="question-field"><label>{t('runtimeCompileQuestion').toLocaleUpperCase()}</label><input aria-label={t('runtimeQuestionLabel')} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void compile() }} /></div>
      <button className="compile-button" onClick={() => void compile()} disabled={loading || contract.releaseStatus !== 'PUBLISHED' || runtimeStatus !== 'ACTIVE'}>{loading ? t('runtimeCompiling') : runtimeStatus === 'SUSPENDED' ? t('runtimeSuspended') : contract.releaseStatus !== 'PUBLISHED' ? t('runtimePublishToCompile') : t('runtimeCompileContext')} <span>⌘↵</span></button>
    </section>

    {apiError && <Toast
      message={`${contract.entities.length > 0 ? t('runtimeDraftContext') : t('runtimeUnavailable')} ${apiError}`}
      closeLabel={t('commonClose')}
      onDismiss={() => setApiError('')}
      tone={contract.entities.length > 0 ? 'info' : 'error'}
      durationMs={7000}
    />}
    {result && <CompileResolution result={result} onChoose={(id) => void resolveClarification(id)} />}

    <div className="workbench runtime-workbench">
      <section className="map-panel panel">
        <div className="panel-header"><div><span className="panel-kicker">{t('runtimeObjectsKicker').toLocaleUpperCase()}</span><h2>{t('runtimeMapTitle', { workflow: titleCase(contract.workflow) })}</h2></div><div className="view-controls"><button className={view === 'MAP' ? 'selected' : ''} onClick={() => setView('MAP')}>{t('runtimeMapView')}</button><button className={view === 'TABLE' ? 'selected' : ''} onClick={() => setView('TABLE')}>{t('runtimeTableView')}</button></div></div>
        <div className="legend"><span><i className="legend-dot exact"/>{t('runtimeExactEvidence')}</span><span><i className="legend-dot derived"/>{t('runtimeSupportedEvidence')}</span><span><i className="legend-line"/>{t('runtimeGovernedRelation')}</span></div>
        {contract.entities.length === 0 ? <div className="runtime-empty"><span>⌁</span><h3>{t('runtimeEmptyTitle')}</h3><p>{t('runtimeEmptyDescription')}</p>{canLoadGridOutageExample(contract) && <button className="release" onClick={loadOperationalContext}>{t('runtimeLoadGridExample')}</button>}</div> : view === 'MAP' ? <RuntimeGraph contract={contract} selectedId={selectedId} onSelect={setSelectedId} /> : <div className="runtime-table"><div className="runtime-table-head"><span>{t('runtimeObject').toLocaleUpperCase()}</span><span>{t('runtimeType').toLocaleUpperCase()}</span><span>{t('runtimeEvidence').toLocaleUpperCase()}</span><span>{t('runtimeValidFrom').toLocaleUpperCase()}</span></div>{contract.entities.map((entity) => <button className={selectedId === entity.id ? 'selected' : ''} onClick={() => setSelectedId(entity.id)} key={entity.id}><span><b>{entity.label}</b><code>{entity.id}</code></span><span>{contract.entityTypes.find((type) => type.id === entity.typeId)?.label ?? entity.typeId}</span><span className="runtime-strength">{entity.evidenceStrength}</span><time>{formatDate(entity.validFrom, { dateStyle: 'medium', timeStyle: 'short' })}</time></button>)}</div>}
        <div className="map-footer"><span>{t('runtimeObjectCount', { count: contract.entities.length })}</span><span>{t('runtimeRelationshipCount', { count: contract.relationships.length })}</span><span className="spacer"/><span>{runtimeStatus === 'SUSPENDED' ? t('runtimeSuspended') : contract.releaseStatus === 'PUBLISHED' ? t('runtimePublishedVersion', { version: contract.version }) : t('runtimeUnpublishedDraft')}</span></div>
      </section>

      <aside className="inspector panel"><div className="inspector-tabs"><span className="active">{t('runtimeInspector')}</span></div><RuntimeInspector entity={selected} contract={contract} /></aside>
    </div>

    <section className="runtime-readiness"><div><span className="panel-kicker">{t('runtimeReadiness').toLocaleUpperCase()}</span><h2>{t('runtimeReadinessTitle')}</h2><p>{t('runtimeReadinessSummary', { operations: contract.operations.length, bindings: contract.bindings.length, policies: contract.policies.length })}</p></div><div><button className="ghost" onClick={onOpenAssurance}>{t('runtimeViewAssurance')}</button><button className="release" onClick={onManageRelease}>{contract.releaseStatus === 'PUBLISHED' ? `${t('manageRelease')} →` : t('runtimePublishContract')}</button></div></section>
  </section>
}

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())
}
