import { useEffect, useMemo, useState } from 'react'
import { Overlay } from './Overlay'
import type { CaseSet, CaseSetSummary, ContextContract, CreateEvalRunRequest, DispositionMode, EvalRun } from '@lattice/contracts'
import { apiFetch } from './api'
import { useResource } from './useResource'
import { EmptyState, ErrorState, LoadingState } from './SurfaceState'
import { shortDigest } from './formatters'
import { caseTypeKey, useEvaluationMessages } from './i18n/messages.evaluation'
import { IconCheck, IconFileText, IconFlask, IconPlay, IconShieldCheck, IconTarget, IconX } from './icons'
import './evaluation.css'

/**
 * E9 — the New Evaluation wizard. Keeps the prototype's 5-step shape and persistent
 * configuration rail (`NewEval.tsx:157-234`) and fixes everything §4.2 lists against it:
 *
 * - the dataset step is case-set selection, not a source picker with a sample slider;
 * - the fabricated confidence estimator is gone — only the real case count is shown;
 * - step dots and the Next button are gated by the *same* predicate;
 * - the run name is derived in render (no `useMemo` side effect, no setState during render);
 * - "Clear selection" clears, it does not invert a partial selection.
 */

type WizardStep = 'TARGET' | 'CASE_SET' | 'CASES' | 'MODE' | 'REVIEW'
type ScopeFilter = 'CONTRACT' | 'WORKSPACE' | 'GLOBAL'

const stepOrder: readonly WizardStep[] = ['TARGET', 'CASE_SET', 'CASES', 'MODE', 'REVIEW']
const stepLabelKeys = { TARGET: 'evalWizardStepTarget', CASE_SET: 'evalWizardStepCaseSet', CASES: 'evalWizardStepCases', MODE: 'evalWizardStepMode', REVIEW: 'evalWizardStepReview' } as const

export interface NewEvalWizardProps {
  contract: ContextContract
  workspaceId: string | undefined
  baselineOptions: Array<{ id: string; name: string }>
  onClose: () => void
  onLaunched: (run: EvalRun) => void
}

export function NewEvalWizard({ contract, workspaceId, baselineOptions, onClose, onLaunched }: NewEvalWizardProps) {
  const { t, formatNumber } = useEvaluationMessages()
  const [step, setStep] = useState<WizardStep>('TARGET')
  const [targetConfirmed, setTargetConfirmed] = useState(false)
  const [scope, setScope] = useState<ScopeFilter>('CONTRACT')
  const [caseSetId, setCaseSetId] = useState('')
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([])
  const [mode, setMode] = useState<DispositionMode>('DRY_RUN')
  const [environment, setEnvironment] = useState('development')
  const [baselineRunId, setBaselineRunId] = useState('')
  const [name, setName] = useState('')
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState('')

  const listPath = useMemo(() => {
    const params = new URLSearchParams()
    if (scope === 'CONTRACT') params.set('contractId', contract.id)
    if (scope === 'WORKSPACE' && workspaceId) params.set('workspaceId', workspaceId)
    const query = params.toString()
    return query ? `/v1/case-sets?${query}` : '/v1/case-sets'
  }, [contract.id, scope, workspaceId])

  const caseSets = useResource<CaseSetSummary[]>(listPath)
  const caseSetDetail = useResource<CaseSet>(caseSetId ? `/v1/case-sets/${encodeURIComponent(caseSetId)}` : undefined)
  const summaries = caseSets.data ?? []
  const selectedSummary = summaries.find((summary) => summary.id === caseSetId)
  const cases = useMemo(() => caseSetDetail.data?.cases ?? [], [caseSetDetail.data])
  const selectedCount = selectedCaseIds.length
  const derivedName = selectedSummary ? `${contract.name} × ${selectedSummary.name} v${selectedSummary.version}` : contract.name
  const effectiveName = name.trim() || derivedName

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  // Selection follows the loaded set. A data-load sync, not a render side effect.
  useEffect(() => { setSelectedCaseIds((caseSetDetail.data?.cases ?? []).map((entry) => entry.id)) }, [caseSetDetail.data])

  const complete: Readonly<Record<WizardStep, boolean>> = {
    TARGET: targetConfirmed,
    CASE_SET: Boolean(caseSetId),
    CASES: selectedCount > 0,
    MODE: environment.trim().length > 0,
    REVIEW: effectiveName.trim().length > 0,
  }

  /** One predicate gates the step dots and the Next button, unlike `NewEval.tsx:99` vs `257`. */
  function canReach(target: WizardStep): boolean {
    const index = stepOrder.indexOf(target)
    return stepOrder.slice(0, index).every((earlier) => complete[earlier])
  }

  const currentIndex = stepOrder.indexOf(step)
  const isLast = step === 'REVIEW'
  const canAdvance = complete[step]

  function goTo(target: WizardStep) { if (canReach(target)) setStep(target) }
  function next() { const target = stepOrder[currentIndex + 1]; if (target && canAdvance) setStep(target) }
  function back() { const target = stepOrder[currentIndex - 1]; if (target) setStep(target) }
  function toggleCase(id: string) { setSelectedCaseIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]) }

  async function launch() {
    setLaunching(true)
    setError('')
    const runsWholeSet = selectedCount === cases.length && cases.length > 0
    const request: CreateEvalRunRequest = {
      caseSetId,
      contractId: contract.id,
      name: effectiveName,
      mode,
      environment: environment.trim(),
      ...(runsWholeSet ? {} : { caseIds: selectedCaseIds }),
      ...(baselineRunId ? { baselineRunId } : {}),
    }
    try {
      onLaunched(await apiFetch<EvalRun>('/v1/eval/runs', { method: 'POST', json: request }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('evalWizardLaunchFailed'))
      setLaunching(false)
    }
  }

  return <Overlay variant="dialog" bare dismissOnBackdrop={false} onClose={onClose}>
    <section className="eval-wizard" role="dialog" aria-modal="true" aria-label={t('evalWizardTitle')}>
      <header className="eval-modal-head"><div><span className="eval-kicker">{t('evalRunKicker')}</span><h2>{t('evalWizardTitle')}</h2><p>{t('evalWizardDescription')}</p></div><button className="eval-modal-close" type="button" aria-label={t('evalWizardClose')} onClick={onClose}><IconX /></button></header>

      <nav className="eval-wizard-steps" aria-label={t('evalWizardStepsLabel')}>{stepOrder.map((entry, index) => { const reachable = canReach(entry); return <button type="button" className={`eval-wizard-step ${entry === step ? 'current' : ''} ${complete[entry] && entry !== step ? 'complete' : ''}`} key={entry} disabled={!reachable} aria-current={entry === step ? 'step' : undefined} title={reachable ? t('evalWizardStepNumber', { index: index + 1, total: stepOrder.length }) : t('evalWizardStepLocked')} onClick={() => goTo(entry)}><i aria-hidden="true">{complete[entry] && entry !== step ? <IconCheck /> : index + 1}</i>{t(stepLabelKeys[entry])}</button> })}</nav>

      <div className="eval-wizard-body">
        <div className="eval-wizard-main">
          {step === 'TARGET' && <>
            <h3>{t('evalWizardTargetTitle')}</h3>
            <p>{t('evalWizardTargetDescription')}</p>
            <ul className="eval-option-list"><li><button type="button" className={`eval-option ${targetConfirmed ? 'selected' : ''}`} aria-pressed={targetConfirmed} onClick={() => setTargetConfirmed((current) => !current)}>
              <span className="eval-option-glyph" aria-hidden="true"><IconTarget /></span>
              <span className="eval-option-body"><b>{contract.name}</b><small>{contract.description}</small><small>v{contract.version} · {shortDigest(contract.digest)} · {t('evalWizardTargetRelease')}: {contract.releaseStatus}</small></span>
              <span className={`surface-chip ${targetConfirmed ? 'brand' : 'neutral'}`}>{targetConfirmed ? t('evalWizardTargetSelected') : t('evalWizardTargetSelect')}</span>
            </button></li></ul>
          </>}

          {step === 'CASE_SET' && <>
            <h3>{t('evalWizardCaseSetTitle')}</h3>
            <p>{t('evalWizardCaseSetDescription')}</p>
            <div className="surface-filters" role="group" aria-label={t('caseSetFiltersLabel')}><label>{t('caseSetScopeFilter')}<select value={scope} onChange={(event) => setScope(event.target.value as ScopeFilter)}><option value="CONTRACT">{t('caseSetScopeThisContract')}</option><option value="WORKSPACE" disabled={!workspaceId}>{t('caseSetScopeThisWorkspace')}</option><option value="GLOBAL">{t('caseSetScopeGlobal')}</option></select></label></div>
            {caseSets.status === 'LOADING' && <LoadingState label={t('evalWizardCaseSetLoading')} />}
            {caseSets.status === 'ERROR' && <ErrorState title={t('evalWizardCaseSetFailed')} detail={caseSets.error} retryLabel={t('commonRetry')} onRetry={caseSets.reload} />}
            {caseSets.status === 'READY' && summaries.length === 0 && <EmptyState title={t('evalWizardCaseSetEmptyTitle')} description={t('evalWizardCaseSetEmptyDescription')} icon={<IconFileText />} />}
            {summaries.length > 0 && <ul className="eval-option-list">{summaries.map((summary) => <li key={summary.id}><button type="button" className={`eval-option ${caseSetId === summary.id ? 'selected' : ''}`} aria-pressed={caseSetId === summary.id} onClick={() => setCaseSetId(summary.id)}>
              <span className="eval-option-glyph" aria-hidden="true"><IconFileText /></span>
              <span className="eval-option-body"><b>{summary.name}</b><small>{summary.description}</small><small>{t('evalWizardCaseSetVersion', { version: summary.version, count: summary.caseCount })} · {shortDigest(summary.digest)}</small></span>
              <span className={`surface-chip ${caseSetId === summary.id ? 'brand' : 'neutral'}`}>{formatNumber(summary.caseCount)}</span>
            </button></li>)}</ul>}
          </>}

          {step === 'CASES' && <>
            <h3>{t('evalWizardCasesTitle')}</h3>
            <p>{t('evalWizardCasesDescription')}</p>
            {caseSetDetail.status === 'LOADING' && <LoadingState label={t('evalWizardCasesLoading')} />}
            {caseSetDetail.status === 'ERROR' && <ErrorState title={t('evalWizardCaseSetFailed')} detail={caseSetDetail.error} retryLabel={t('commonRetry')} onRetry={caseSetDetail.reload} />}
            {cases.length > 0 && <>
              <div className="eval-actions"><button className="ghost" onClick={() => setSelectedCaseIds(cases.map((entry) => entry.id))}>{t('evalWizardCasesSelectAll')}</button><button className="ghost" onClick={() => setSelectedCaseIds([])}>{t('evalWizardCasesClear')}</button><span className="eval-note muted">{t('evalWizardCasesSelected', { selected: selectedCount, total: cases.length })}</span></div>
              <div className="eval-case-picker">{cases.map((entry) => <label className="eval-case-pick" key={entry.id}><input type="checkbox" checked={selectedCaseIds.includes(entry.id)} onChange={() => toggleCase(entry.id)} /><span>{entry.question}</span><span className="surface-chip neutral">{t(caseTypeKey(entry.caseType))}</span></label>)}</div>
              {selectedCount === 0 && <p className="eval-note warn">{t('evalWizardCasesNoneSelected')}</p>}
            </>}
          </>}

          {step === 'MODE' && <>
            <h3>{t('evalWizardModeTitle')}</h3>
            <p>{t('evalWizardModeDescription')}</p>
            <ul className="eval-option-list">
              <li><button type="button" className={`eval-option ${mode === 'DRY_RUN' ? 'selected' : ''}`} aria-pressed={mode === 'DRY_RUN'} onClick={() => setMode('DRY_RUN')}><span className="eval-option-glyph" aria-hidden="true"><IconFlask /></span><span className="eval-option-body"><b>{t('modeDryRun')}</b><small>{t('evalWizardModeDryRunHint')}</small></span><span className={`surface-chip ${mode === 'DRY_RUN' ? 'brand' : 'neutral'}`}>{mode === 'DRY_RUN' ? <IconCheck /> : null}</span></button></li>
              <li><button type="button" className={`eval-option ${mode === 'AUTHORIZED' ? 'selected' : ''}`} aria-pressed={mode === 'AUTHORIZED'} onClick={() => setMode('AUTHORIZED')}><span className="eval-option-glyph" aria-hidden="true"><IconShieldCheck /></span><span className="eval-option-body"><b>{t('modeAuthorized')}</b><small>{t('evalWizardModeAuthorizedHint')}</small></span><span className={`surface-chip ${mode === 'AUTHORIZED' ? 'brand' : 'neutral'}`}>{mode === 'AUTHORIZED' ? <IconCheck /> : null}</span></button></li>
            </ul>
            <div className="eval-form-grid">
              <label className="eval-field"><span>{t('evalWizardEnvironment')}</span><input value={environment} onChange={(event) => setEnvironment(event.target.value)} /><small>{t('evalWizardEnvironmentHint')}</small></label>
              <label className="eval-field"><span>{t('evalWizardBaseline')}</span><select value={baselineRunId} onChange={(event) => setBaselineRunId(event.target.value)} disabled={baselineOptions.length === 0}><option value="">{t('evalWizardBaselineNone')}</option>{baselineOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select><small>{t('evalWizardBaselineHint')}</small></label>
            </div>
          </>}

          {step === 'REVIEW' && <>
            <h3>{t('evalWizardReviewTitle')}</h3>
            <p>{t('evalWizardReviewDescription')}</p>
            <div className="eval-form-grid wide"><label className="eval-field"><span>{t('evalWizardRunName')}</span><input value={name} placeholder={derivedName} onChange={(event) => setName(event.target.value)} /><small>{t('evalWizardRunNamePlaceholder')}</small></label></div>
            <dl className="eval-facts">
              <div><dt>{t('evalWizardRailContract')}</dt><dd>{contract.name} · v{contract.version} <code>{shortDigest(contract.digest)}</code></dd></div>
              <div><dt>{t('evalWizardRailCaseSet')}</dt><dd>{selectedSummary ? `${selectedSummary.name} · v${selectedSummary.version}` : t('commonNotSelected')} {selectedSummary && <code>{shortDigest(selectedSummary.digest)}</code>}</dd></div>
              <div><dt>{t('evalWizardRailCases')}</dt><dd>{t('evalWizardCasesSelected', { selected: selectedCount, total: cases.length })}</dd></div>
              <div><dt>{t('evalWizardRailMode')}</dt><dd>{mode === 'DRY_RUN' ? t('modeDryRun') : t('modeAuthorized')}</dd></div>
              <div><dt>{t('evalWizardEnvironment')}</dt><dd>{environment}</dd></div>
              <div><dt>{t('evalWizardBaseline')}</dt><dd>{baselineOptions.find((option) => option.id === baselineRunId)?.name ?? t('evalWizardBaselineNone')}</dd></div>
            </dl>
            {error && <p className="eval-error" role="alert">{error}</p>}
          </>}
        </div>

        <aside className="eval-wizard-rail">
          <span className="eval-kicker">{t('evalWizardRail')}</span>
          <dl>
            <div><dt>{t('evalWizardRailTarget')}</dt><dd className={targetConfirmed ? '' : 'empty'}>{targetConfirmed ? contract.name : t('commonNotSelected')}</dd></div>
            <div><dt>{t('evalWizardRailContract')}</dt><dd>v{contract.version} · {contract.releaseStatus}</dd></div>
            <div><dt>{t('evalWizardRailCaseSet')}</dt><dd className={selectedSummary ? '' : 'empty'}>{selectedSummary ? `${selectedSummary.name} v${selectedSummary.version}` : t('commonNotSelected')}</dd></div>
            <div><dt>{t('evalWizardRailCases')}</dt><dd className={selectedCount ? '' : 'empty'}>{cases.length > 0 ? t('evalWizardCasesSelected', { selected: selectedCount, total: cases.length }) : t('commonNotSelected')}</dd></div>
            <div><dt>{t('evalWizardRailMode')}</dt><dd>{mode === 'DRY_RUN' ? t('modeDryRun') : t('modeAuthorized')} · {environment || '—'}</dd></div>
          </dl>
        </aside>
      </div>

      <footer className="eval-wizard-foot">
        <button className="ghost" onClick={back} disabled={currentIndex === 0}>{t('evalWizardBack')}</button>
        <div className="eval-actions">
          <button className="ghost" onClick={onClose}>{t('commonCancel')}</button>
          {isLast
            ? <button className="release" onClick={() => void launch()} disabled={launching || !complete.REVIEW || !complete.CASES || !complete.CASE_SET || !complete.TARGET}><IconPlay /> {launching ? t('evalWizardLaunching') : t('evalWizardLaunch')}</button>
            : <button className="release" onClick={next} disabled={!canAdvance}>{t('commonNext')}</button>}
        </div>
      </footer>
    </section>
  </Overlay>
}
