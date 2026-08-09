import { useEffect, useState } from 'react'
import { canLoadGridOutageExample, loadGridOutageExample, type CompileResponse, type ContextContract, type DeclaredPurpose, type DispositionMode, type ReleaseRuntimeStatus, type RiskTierDerivation } from '@lattice/contracts'
import { API_URL, apiAuthHeaders } from './api'
import { CompileResolution } from './CompileResolution'
import { RuntimeGraph } from './RuntimeGraph'
import { RuntimeInspector } from './RuntimeInspector'
import { useResource } from './useResource'
import { useMessages } from './i18n/messages'
import { evidenceStrengthMessageKeys, purposeAudienceMessageKeys, reversibilityMessageKeys, riskTierMessageKeys, useDispositionMessages } from './i18n/messages.disposition'
import { riskTone } from './formatters'
import { routes, type SurfaceId } from './router'
import { Toast } from './Toast'
import { IconAlertTriangle, IconArrowUpRight, IconFlask, IconShieldCheck, IconZap } from './icons'
import { PanelCollapseButton, usePersistentCollapsed } from './PanelCollapseButton'
import { SurfaceHero } from './SurfaceState'
import { releaseFact, runtimeFact } from './surfaceContext'

/**
 * E3 + E4 — the compiler bar declares a purpose and picks a mode before it compiles.
 *
 * Purpose is *declared*, never inferred from the question text, and the risk tier it derives
 * (purpose × contract × operation) is rendered with its evidence thresholds *before* compile so
 * the gate is visible in advance. Dry run works against the unpublished draft and its result is
 * banner-marked non-authorizing; only authorized mode keeps the published-release gate.
 */

interface RuntimeStudioProps {
  contract: ContextContract
  runtimeStatus: ReleaseRuntimeStatus
  onChange: (contract: ContextContract) => void
  onDirtyChange: (dirty: boolean) => void
  onManageRelease: () => void
  onOpenAssurance: () => void
  onNavigate: (surface: SurfaceId, detailId?: string) => void
  onNavigatePath: (path: string) => void
}

export function RuntimeStudio({ contract, runtimeStatus, onChange, onDirtyChange, onManageRelease, onOpenAssurance, onNavigate, onNavigatePath }: RuntimeStudioProps) {
  const { t, formatDate } = useMessages()
  const { t: d } = useDispositionMessages()
  const [question, setQuestion] = useState(contract.competencyQuestions[0]?.question ?? t('runtimeDefaultQuestion', { workflow: contract.workflow.replaceAll('_', ' ') }))
  const [purposeId, setPurposeId] = useState('')
  const [mode, setMode] = useState<DispositionMode>('DRY_RUN')
  const [derivation, setDerivation] = useState<RiskTierDerivation>()
  const [derivationError, setDerivationError] = useState('')
  const [deriving, setDeriving] = useState(false)
  const [result, setResult] = useState<CompileResponse>()
  const [selectedId, setSelectedId] = useState(contract.entities[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState('')
  const [view, setView] = useState<'MAP' | 'TABLE'>('MAP')
  const { collapsed: inspectorCollapsed, toggleCollapsed: toggleInspector } = usePersistentCollapsed('lattice:inspector-collapsed')

  const purposes = useResource<{ purposes: DeclaredPurpose[]; catalog: DeclaredPurpose[] }>(`/v1/purposes?domain=${encodeURIComponent(contract.domain)}&contractId=${encodeURIComponent(contract.id)}`)
  // Only what this contract declares is offered: the compiler denies any other purpose, so listing
  // the wider catalogue here would be offering choices guaranteed to be refused.
  const declaredPurposes = purposes.data?.purposes ?? []
  const purposeOptions = declaredPurposes
  const purpose = purposeOptions.find((option) => option.id === purposeId)
  const selected = contract.entities.find((entity) => entity.id === selectedId)
  const authorizedAvailable = contract.releaseStatus === 'PUBLISHED' && runtimeStatus === 'ACTIVE'
  // Purpose is required only where the contract declares purposes to choose from.
  const purposeRequired = declaredPurposes.length > 0
  const canCompile = !loading && (!purposeRequired || Boolean(purposeId)) && (mode === 'DRY_RUN' || authorizedAvailable)

  useEffect(() => {
    if (!purposeId) {
      setDerivation(undefined)
      setDerivationError('')
      return
    }
    const controller = new AbortController()
    setDeriving(true)
    setDerivationError('')
    fetch(`${API_URL}/v1/risk-tier`, { method: 'POST', headers: { ...apiAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ contractId: contract.id, purposeId }), signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as RiskTierDerivation & { error?: string; message?: string }
        if (controller.signal.aborted) return
        if (!response.ok) throw new Error(payload.message ?? payload.error ?? `API returned ${response.status}`)
        setDerivation(payload)
        setDeriving(false)
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return
        setDerivation(undefined)
        setDerivationError(caught instanceof Error ? caught.message : t('runtimeApiUnavailable'))
        setDeriving(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract.id, purposeId])

  function loadOperationalContext() {
    const next = loadGridOutageExample(contract)
    onChange(next)
    onDirtyChange(true)
    setSelectedId(next.entities.find((entity) => entity.typeId === 'outage_event')?.id ?? next.entities[0]?.id ?? '')
    setResult(undefined)
    setApiError(t('runtimeExampleStaged'))
  }

  async function compile() {
    if (!canCompile) return
    setLoading(true)
    setApiError('')
    try {
      const response = await fetch(`${API_URL}/v1/compile`, {
        method: 'POST',
        headers: { ...apiAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, contractId: contract.id, purposeId, mode }),
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

  async function resolveClarification(candidateId: string) {
    if (!result?.clarification) return
    // A clarification asks either which entity was meant or which operation to run.
    const clarificationKind = result.clarification.kind
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/v1/clarifications/${result.clarification.id}`, {
        method: 'POST',
        headers: { ...apiAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(clarificationKind === 'ENTITY' ? { entityId: candidateId } : { operationId: candidateId }),
      })
      setResult(await response.json() as CompileResponse)
      if (clarificationKind === 'ENTITY') setSelectedId(candidateId)
    } finally {
      setLoading(false)
    }
  }

  const compileLabel = loading ? d('compilerCompiling')
    : purposeRequired && !purposeId ? d('compilerSelectPurposeFirst')
    : mode === 'DRY_RUN' ? d('compilerCompileDryRun')
    : runtimeStatus === 'SUSPENDED' ? d('compilerSuspended')
    : d('compilerCompileAuthorized')

  return <section className="runtime-studio-page">
    {/* Which contract is about to be compiled, and whether it can authorize
      * anything. The compile bar below offers an Authorized mode that is inert
      * on an unpublished draft, so the release state has to be readable before
      * the choice is made, not after the button refuses. */}
    <SurfaceHero
      kicker={t('navCompiler').toLocaleUpperCase()}
      title={contract.name}
      facts={[releaseFact(t, contract), runtimeFact(t, runtimeStatus)]}
    />

    <section className="compiler-bar">
      <div className="spark" aria-hidden="true"><IconZap /></div>
      <div className="question-field"><label htmlFor="compiler-question">{t('runtimeCompileQuestion')}</label><input id="compiler-question" aria-label={t('runtimeQuestionLabel')} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void compile() }} /></div>
      <div className="purpose-field"><label htmlFor="compiler-purpose">{d('compilerPurpose')}</label><select id="compiler-purpose" value={purposeId} required={purposeRequired} aria-required={purposeRequired} onChange={(event) => setPurposeId(event.target.value)} disabled={purposes.status === 'LOADING' || !purposeRequired}><option value="">{purposes.status === 'LOADING' ? d('compilerPurposeLoading') : purposeRequired ? d('compilerPurposeRequired') : d('compilerPurposeNoneDeclared')}</option>{purposeOptions.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></div>
      <div className="mode-field" role="group" aria-label={d('compilerMode')}>
        <button type="button" className={mode === 'DRY_RUN' ? 'selected' : ''} aria-pressed={mode === 'DRY_RUN'} onClick={() => setMode('DRY_RUN')}><IconFlask /> {d('compilerModeDryRun')}</button>
        <button type="button" className={mode === 'AUTHORIZED' ? 'selected' : ''} aria-pressed={mode === 'AUTHORIZED'} disabled={!authorizedAvailable} title={authorizedAvailable ? d('compilerModeAuthorizedHint') : d('compilerModeAuthorizedBlocked')} onClick={() => setMode('AUTHORIZED')}><IconShieldCheck /> {d('compilerModeAuthorized')}</button>
      </div>
      <button className="compile-button" onClick={() => void compile()} disabled={!canCompile}>{compileLabel} <span className="kbd-hint">⌘↵</span></button>
    </section>

    <div className="compiler-context">
      <div className="compiler-declaration">
        <p className="compiler-hint">{d('compilerPurposeDeclared')}</p>
        {purposes.status === 'READY' && !purposeRequired && <p className="compiler-hint warn">{d('compilerPurposeNoneDeclaredHint')}</p>}
        {purposes.status === 'ERROR' && <p className="compiler-hint warn">{d('compilerPurposeUnavailable', { detail: purposes.error })}</p>}
        {purpose && (purpose.audience || purpose.reversibility) && <dl className="purpose-facts">{purpose.audience && <div><dt>{d('compilerPurposeAudience')}</dt><dd>{d(purposeAudienceMessageKeys[purpose.audience])}</dd></div>}{purpose.reversibility && <div><dt>{d('compilerPurposeReversibility')}</dt><dd>{d(reversibilityMessageKeys[purpose.reversibility])}</dd></div>}</dl>}
        {purpose && <p className="compiler-hint">{purpose.description}</p>}
        <p className="compiler-hint">{mode === 'DRY_RUN' ? d('compilerModeDryRunHint') : d('compilerModeAuthorizedHint')}</p>
        {!authorizedAvailable && <p className="compiler-hint warn">{d('compilerModeAuthorizedBlocked')}</p>}
      </div>

      <div className="risk-preview" aria-live="polite">
        <span className="panel-kicker">{d('compilerRiskKicker').toLocaleUpperCase()}</span>
        {!purposeId && <p className="compiler-hint">{d('compilerPurposeRequired')}</p>}
        {purposeId && deriving && <p className="compiler-hint">{d('compilerRiskDeriving')}</p>}
        {purposeId && !deriving && derivationError && <p className="compiler-hint warn">{d('compilerRiskUnavailable', { detail: derivationError })}</p>}
        {derivation && !deriving && <>
          <div className="risk-headline"><span className={`risk-chip ${riskTone(derivation.riskTier)}`}>{d(riskTierMessageKeys[derivation.riskTier])}</span><p>{derivation.reason}</p></div>
          <dl className="risk-thresholds">
            <div><dt>{d('compilerRiskMinimumEvidence')}</dt><dd>{d(evidenceStrengthMessageKeys[derivation.minimumEvidenceStrength])}</dd></div>
            <div><dt>{d('compilerRiskMaximumAge')}</dt><dd>{d('compilerRiskMinutes', { count: derivation.maximumEvidenceAgeMinutes })}</dd></div>
            <div><dt>{d('compilerRiskApproval')}</dt><dd>{derivation.approvalRequired ? d('compilerRiskApprovalRequired') : d('compilerRiskApprovalNotRequired')}</dd></div>
            {derivation.policyId && <div><dt>{d('compilerRiskPolicy')}</dt><dd><code>{derivation.policyId}</code></dd></div>}
          </dl>
          <small className="compiler-hint">{d('compilerRiskSource')}</small>
        </>}
      </div>
    </div>

    {apiError && <Toast
      message={`${contract.entities.length > 0 ? t('runtimeDraftContext') : t('runtimeUnavailable')} ${apiError}`}
      closeLabel={t('commonClose')}
      onDismiss={() => setApiError('')}
      tone={contract.entities.length > 0 ? 'info' : 'error'}
      durationMs={7000}
    />}

    {result && <div className={`compile-banner ${result.authorizing === false ? 'dry-run' : 'authorized'}`} role="status" aria-live="polite">
      <span aria-hidden="true">{result.authorizing === false ? <IconFlask /> : <IconShieldCheck />}</span>
      <div><b>{result.authorizing === false ? d('compilerDryRunTitle') : d('compilerAuthorizedTitle')}</b><p>{result.authorizing === false ? d('compilerDryRunBody') : d('compilerAuthorizedBody', { version: result.compilation?.contract.version ?? result.versions.contract })}</p></div>
      <div className="compile-banner-actions">{result.dispositionId ? <button className="ghost" onClick={() => onNavigatePath(routes.disposition(result.dispositionId ?? ''))}><IconArrowUpRight /> {d('compilerOpenDisposition')}</button> : <span className="compiler-hint"><IconAlertTriangle /> {d('compilerNoDisposition')}</span>}<button className="ghost" onClick={() => onNavigate('dispositions')}>{d('compilerViewTrail')}</button></div>
    </div>}
    {result && <CompileResolution result={result} onChoose={(id) => void resolveClarification(id)} />}

    <div className={`workbench runtime-workbench ${inspectorCollapsed ? 'inspector-collapsed' : ''}`}>
      <section className="map-panel panel">
        <div className="panel-header"><div><span className="panel-kicker">{t('runtimeObjectsKicker')}</span><h2>{t('runtimeMapTitle', { workflow: titleCase(contract.workflow) })}</h2></div><div className="view-controls"><button className={view === 'MAP' ? 'selected' : ''} onClick={() => setView('MAP')}>{t('runtimeMapView')}</button><button className={view === 'TABLE' ? 'selected' : ''} onClick={() => setView('TABLE')}>{t('runtimeTableView')}</button></div></div>
        <div className="legend"><span><i className="legend-dot exact"/>{t('runtimeExactEvidence')}</span><span><i className="legend-dot derived"/>{t('runtimeSupportedEvidence')}</span><span><i className="legend-line"/>{t('runtimeGovernedRelation')}</span></div>
        {contract.entities.length === 0 ? <div className="runtime-empty"><span>⌁</span><h3>{t('runtimeEmptyTitle')}</h3><p>{t('runtimeEmptyDescription')}</p>{canLoadGridOutageExample(contract) && <button className="release" onClick={loadOperationalContext}>{t('runtimeLoadGridExample')}</button>}</div> : view === 'MAP' ? <RuntimeGraph contract={contract} selectedId={selectedId} onSelect={setSelectedId} /> : <div className="runtime-table"><div className="runtime-table-head"><span>{t('runtimeObject').toLocaleUpperCase()}</span><span>{t('runtimeType').toLocaleUpperCase()}</span><span>{t('runtimeEvidence').toLocaleUpperCase()}</span><span>{t('runtimeValidFrom').toLocaleUpperCase()}</span></div>{contract.entities.map((entity) => <button className={selectedId === entity.id ? 'selected' : ''} onClick={() => setSelectedId(entity.id)} key={entity.id}><span><b>{entity.label}</b><code>{entity.id}</code></span><span>{contract.entityTypes.find((type) => type.id === entity.typeId)?.label ?? entity.typeId}</span><span className="runtime-strength">{entity.evidenceStrength}</span><time>{formatDate(entity.validFrom, { dateStyle: 'medium', timeStyle: 'short' })}</time></button>)}</div>}
        <div className="map-footer"><span>{t('runtimeObjectCount', { count: contract.entities.length })}</span><span>{t('runtimeRelationshipCount', { count: contract.relationships.length })}</span><span className="spacer"/><span>{runtimeStatus === 'SUSPENDED' ? t('runtimeSuspended') : contract.releaseStatus === 'PUBLISHED' ? t('runtimePublishedVersion', { version: contract.version }) : t('runtimeUnpublishedDraft')}</span></div>
      </section>

      <aside className={`inspector collapsible-inspector panel ${inspectorCollapsed ? 'collapsed' : ''}`} id="runtime-inspector">
        <div className="collapsible-inspector-header">
          {!inspectorCollapsed && <div className="inspector-tabs"><span className="active">{t('runtimeInspector')}</span></div>}
          <PanelCollapseButton collapsed={inspectorCollapsed} collapseLabel={t('collapseInspector')} expandLabel={t('expandInspector')} panelId="runtime-inspector" side="right" onToggle={toggleInspector} />
        </div>
        {!inspectorCollapsed && <RuntimeInspector entity={selected} contract={contract} />}
      </aside>
    </div>

    <section className="runtime-readiness"><div><span className="panel-kicker">{t('runtimeReadiness').toLocaleUpperCase()}</span><h2>{t('runtimeReadinessTitle')}</h2><p>{t('runtimeReadinessSummary', { operations: contract.operations.length, bindings: contract.bindings.length, policies: contract.policies.length })}</p></div><div><button className="ghost" onClick={onOpenAssurance}>{t('runtimeViewAssurance')}</button><button className="release" onClick={onManageRelease}>{contract.releaseStatus === 'PUBLISHED' ? `${t('manageRelease')} →` : t('runtimePublishContract')}</button></div></section>
  </section>
}

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())
}
