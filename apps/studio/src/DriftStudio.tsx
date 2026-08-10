import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { ContextContract, CounterfactualResult, DriftAction, DriftEvent, DriftKind, ImpactLevel, SourceHealthRecord } from '@lattice/contracts'
import { apiFetch } from './api'
import { useResource } from './useResource'
import { EmptyState, ErrorState, LoadingState, Pagination, SurfaceHero } from './SurfaceState'
import { impactTone, riskTone } from './formatters'
import { driftActionMessageKeys, driftKindMessageKeys, driftStatusMessageKeys, riskTierMessageKeys, runtimeDecisionMessageKeys, severityMessageKeys, sourceHealthMessageKeys, useGovernanceMessages } from './i18n/messages.governance'
import { routes, type SurfaceId } from './router'
import { Toast } from './Toast'
import { IconArrowUpRight, IconFlask, IconGitCompare, IconPlay, IconRadar, IconTarget } from './icons'
import './governance.css'

/**
 * E14 — drift and source health. Every event leads with its counterfactual: "N of the last M
 * dispositions would have changed, including K high-risk." A definition change only matters as a
 * decision change. The replay is RECONSTRUCTED from retained inputs and is labelled as such —
 * it is never presented as a re-execution against current data (§3.2.F).
 */

interface DriftStudioProps {
  workspaceId?: string
  contract: ContextContract
  detailId?: string
  onNavigate: (surface: SurfaceId, detailId?: string) => void
  onNavigatePath: (path: string) => void
}

const pageSize = 12
const statusOptions: readonly DriftEvent['status'][] = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'SUPPRESSED']
const severityOptions: readonly ImpactLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const kindOptions: readonly DriftKind[] = ['FIELD_RENAMED', 'FORMULA_CHANGED', 'GRAIN_CHANGED', 'UNIT_CHANGED', 'CERTIFICATION_LOST', 'FRESHNESS_DEGRADED', 'SCHEMA_CHANGED', 'BINDING_REMOVED', 'SEMANTIC_DEFINITION_CHANGED']
const driftActions: readonly DriftAction[] = ['SUSPEND_HIGH_RISK', 'ALLOW_READ_ONLY', 'OPEN_REVIEW', 'ACKNOWLEDGE', 'RESOLVE']

function severityClass(severity: ImpactLevel): string {
  return severity === 'CRITICAL' ? 'critical' : severity === 'HIGH' ? 'high' : ''
}

function healthTone(health: SourceHealthRecord['health']): string {
  if (health === 'HEALTHY') return 'success'
  if (health === 'DEGRADED') return 'warning'
  if (health === 'BROKEN') return 'danger'
  return 'neutral'
}

export function DriftStudio({ workspaceId, contract, detailId, onNavigate, onNavigatePath }: DriftStudioProps) {
  const { t, formatDate, formatNumber } = useGovernanceMessages()
  const [status, setStatus] = useState<'' | DriftEvent['status']>('')
  const [severity, setSeverity] = useState<'' | ImpactLevel>('')
  const [kind, setKind] = useState<'' | DriftKind>('')
  const [selectedId, setSelectedId] = useState(detailId ?? '')
  const [replays, setReplays] = useState<Record<string, CounterfactualResult>>({})
  const [replayingId, setReplayingId] = useState('')
  const [actionDraft, setActionDraft] = useState<'' | DriftAction>('')
  const [actionRationale, setActionRationale] = useState('')
  const [actionError, setActionError] = useState('')
  const [working, setWorking] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [notice, setNotice] = useState('')
  const [page, setPage] = useState(0)
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([])

  const listPath = useMemo(() => {
    const params = new URLSearchParams()
    if (workspaceId) params.set('workspaceId', workspaceId)
    else params.set('contractId', contract.id)
    return `/v1/drift?${params.toString()}`
  }, [contract.id, workspaceId])

  const events = useResource<DriftEvent[]>(listPath)
  const sources = useResource<SourceHealthRecord[]>(`/v1/source-health?contractId=${encodeURIComponent(contract.id)}`, [contract.id])
  const all = useMemo(() => events.data ?? [], [events.data])
  const visible = useMemo(() => all.filter((event) => (!status || event.status === status) && (!severity || event.severity === severity) && (!kind || event.kind === kind)), [all, kind, severity, status])
  const pageItems = visible.slice(page * pageSize, page * pageSize + pageSize)
  const selected = visible.find((event) => event.id === selectedId) ?? all.find((event) => event.id === selectedId)
  const counterfactual = selected ? replays[selected.id] ?? selected.counterfactual : undefined
  const filterKey = `${status}|${severity}|${kind}`

  useEffect(() => { setPage(0) }, [filterKey])
  useEffect(() => { if (detailId) setSelectedId(detailId) }, [detailId])

  function select(id: string) {
    setSelectedId(id)
    setActionDraft('')
    setActionError('')
    onNavigate('drift', id)
  }

  function onBoardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const current = cardRefs.current.findIndex((node) => node === document.activeElement)
    if (current < 0) return
    event.preventDefault()
    const last = pageItems.length - 1
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? last : ['ArrowRight', 'ArrowDown'].includes(event.key) ? Math.min(last, current + 1) : Math.max(0, current - 1)
    cardRefs.current[next]?.focus()
  }

  async function replay(id: string) {
    setReplayingId(id)
    setActionError('')
    try {
      const result = await apiFetch<CounterfactualResult>(`/v1/drift/${encodeURIComponent(id)}/replay`, { method: 'POST' })
      setReplays((current) => ({ ...current, [id]: result }))
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t('driftReplayFailed'))
    } finally {
      setReplayingId('')
    }
  }

  async function recordAction(id: string, action: DriftAction) {
    if (!actionRationale.trim()) { setActionError(t('driftActionFailed')); return }
    setWorking(true)
    setActionError('')
    try {
      await apiFetch(`/v1/drift/${encodeURIComponent(id)}/actions`, { method: 'POST', json: { action, rationale: actionRationale.trim() } })
      setNotice(t('driftActionDone', { action: t(driftActionMessageKeys[action]) }))
      setActionDraft('')
      setActionRationale('')
      events.reload()
      sources.reload()
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t('driftActionFailed'))
    } finally {
      setWorking(false)
    }
  }

  async function scan() {
    if (!workspaceId) { setNotice(t('driftScanNoWorkspace')); return }
    setScanning(true)
    try {
      await apiFetch('/v1/drift/scan', { method: 'POST', json: { workspaceId } })
      setNotice(t('driftScanDone'))
      events.reload()
      sources.reload()
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : t('driftScanFailed'))
    } finally {
      setScanning(false)
    }
  }

  return <section className="drift-page">
    <SurfaceHero kicker={t('driftKicker')} title={t('driftTitle')} description={t('driftDescription')}><button className="release" onClick={() => void scan()} disabled={scanning || !workspaceId}><IconRadar /> {scanning ? t('driftScanning') : t('driftScan')}</button></SurfaceHero>
    {notice && <Toast message={notice} closeLabel={t('driftClose')} onDismiss={() => setNotice('')} />}

    <div className="drift-layout">
      <main className="gov-panel">
        <header><div><span className="gov-kicker">{t('driftBoard')}</span><h3>{contract.name}</h3><p>{t('driftBoardHint')}</p></div><span className="gov-meta" role="status" aria-live="polite">{t('driftLive', { count: visible.length })}</span></header>
        <div className="surface-filters" role="group" aria-label={t('driftBoard')}>
          <label>{t('driftFilterStatus')}<select value={status} onChange={(event) => setStatus(event.target.value as '' | DriftEvent['status'])}><option value="">{t('driftAnyStatus')}</option>{statusOptions.map((option) => <option value={option} key={option}>{t(driftStatusMessageKeys[option])}</option>)}</select></label>
          <label>{t('driftFilterSeverity')}<select value={severity} onChange={(event) => setSeverity(event.target.value as '' | ImpactLevel)}><option value="">{t('driftAnySeverity')}</option>{severityOptions.map((option) => <option value={option} key={option}>{t(severityMessageKeys[option])}</option>)}</select></label>
          <label>{t('driftFilterKind')}<select value={kind} onChange={(event) => setKind(event.target.value as '' | DriftKind)}><option value="">{t('driftAnyKind')}</option>{kindOptions.map((option) => <option value={option} key={option}>{t(driftKindMessageKeys[option])}</option>)}</select></label>
        </div>

        {events.status === 'LOADING' && <LoadingState label={t('driftLoading')} />}
        {events.status === 'ERROR' && <ErrorState title={t('driftErrorTitle')} detail={events.error} retryLabel={t('driftRetry')} onRetry={events.reload} />}
        {events.status === 'READY' && visible.length === 0 && <EmptyState title={t('driftEmptyTitle')} description={t('driftEmptyDescription')} icon={<IconRadar />} {...(workspaceId ? { actionLabel: t('driftScan'), onAction: () => void scan() } : {})} />}

        {pageItems.length > 0 && <div className="drift-board" role="group" aria-label={t('driftBoard')} onKeyDown={onBoardKeyDown}>{pageItems.map((event, index) => {
          const result = replays[event.id] ?? event.counterfactual
          return <button type="button" className={`drift-card ${severityClass(event.severity)}`} key={event.id} ref={(node) => { cardRefs.current[index] = node }} aria-current={selectedId === event.id ? 'true' : undefined} onClick={() => select(event.id)}>
            <header>
              <span className="surface-chip governance">{t(driftKindMessageKeys[event.kind])}</span>
              <span className={`surface-chip ${impactTone(event.severity)}`}>{t(severityMessageKeys[event.severity])}</span>
              <span className="surface-chip neutral">{t(driftStatusMessageKeys[event.status])}</span>
            </header>
            <p className={`drift-headline ${result ? '' : 'pending'}`}>{result ? result.summary : t('driftCounterfactualPending')}</p>
            <p className="drift-subject">{event.subject.label} · <span className="gov-code">{event.subject.id}</span></p>
            <span className="drift-delta"><code className="before">{event.before}</code>→<code className="after">{event.after}</code><span className="surface-chip neutral">{t('driftVersions', { from: event.fromVersion, to: event.toVersion })}</span></span>
            <footer><span className="gov-meta">{t('driftDetected', { at: formatDate(event.detectedAt, { dateStyle: 'short', timeStyle: 'short' }) })}</span></footer>
          </button>
        })}</div>}

        {visible.length > 0 && <Pagination page={page} pageSize={pageSize} total={visible.length} onPage={(next) => setPage(Math.max(0, next))} labels={{ previous: t('driftPrevious'), next: t('driftNext'), range: (from, to, total) => t('driftRange', { from, to, total }) }} />}
      </main>

      <aside>
        <section className="gov-panel">
          {!selected && <EmptyState title={t('driftSelectTitle')} description={t('driftSelectPrompt')} icon={<IconGitCompare />} />}
          {selected && <>
            <header><div><span className="gov-kicker">{t(driftKindMessageKeys[selected.kind])}</span><h3>{selected.subject.label}</h3><p>{selected.detail}</p></div><span className={`surface-chip ${impactTone(selected.severity)}`}>{t(severityMessageKeys[selected.severity])}</span></header>

            {counterfactual ? <>
              <div className="drift-metrics">
                <div><span>{t('driftEvaluated')}</span><b>{formatNumber(counterfactual.evaluated)}</b><small>{t('driftEvaluatedMeta')}</small></div>
                <div><span>{t('driftChangedMetric')}</span><b>{formatNumber(counterfactual.changed)}</b><small>{t('driftChangedMeta')}</small></div>
                <div><span>{t('driftHighRiskMetric')}</span><b>{formatNumber(counterfactual.highRiskChanged)}</b><small>{t('driftHighRiskMeta')}</small></div>
              </div>
              <p className="gov-note"><IconFlask /> {t('driftReconstructed')}</p>
              <p className="gov-note">{t('driftWindow', { from: formatDate(counterfactual.window.from, { dateStyle: 'short' }), to: formatDate(counterfactual.window.to, { dateStyle: 'short' }) })} · {t('driftComputedAt', { at: formatDate(counterfactual.computedAt, { dateStyle: 'short', timeStyle: 'short' }) })}</p>
              <h4 className="gov-kicker gov-kicker-padded">{t('driftChanges')}</h4>
              {counterfactual.changes.length === 0 ? <p className="gov-inline-empty">{t('driftNoChanges')}</p> : <div className="drift-changes">{counterfactual.changes.map((change) => <div className="drift-change" key={change.dispositionId}>
                <div>
                  <p>{change.question}</p>
                  <footer>
                    <span className="surface-chip warning">{t('driftChangeDecision', { before: t(runtimeDecisionMessageKeys[change.before]), after: t(runtimeDecisionMessageKeys[change.after]) })}</span>
                    <span className={`surface-chip ${riskTone(change.riskTier)}`}>{t(riskTierMessageKeys[change.riskTier])}</span>
                    <span className="gov-meta">{formatDate(change.createdAt, { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </footer>
                </div>
                <button type="button" className="gov-link" onClick={() => onNavigatePath(routes.disposition(change.dispositionId))}>{t('driftOpenDisposition')} <IconArrowUpRight /></button>
              </div>)}</div>}
            </> : <>
              <p className="gov-inline-empty">{t('driftCounterfactualPending')}</p>
              <div className="gov-actions gov-actions-padded"><button type="button" className="gov-button primary" disabled={replayingId === selected.id} onClick={() => void replay(selected.id)}><IconPlay /> {replayingId === selected.id ? t('driftReplaying') : t('driftReplay')}</button></div>
            </>}

            <div className="gov-actions gov-actions-padded" role="group" aria-label={t('driftActions')}>
              {counterfactual && <button type="button" className="gov-button" disabled={replayingId === selected.id} onClick={() => void replay(selected.id)}><IconPlay /> {replayingId === selected.id ? t('driftReplaying') : t('driftReplay')}</button>}
              {driftActions.map((action) => <button type="button" className={`gov-button ${action === 'SUSPEND_HIGH_RISK' ? 'danger' : ''}`} key={action} aria-expanded={actionDraft === action} onClick={() => { setActionDraft((current) => current === action ? '' : action); setActionError('') }}>{t(driftActionMessageKeys[action])}</button>)}
            </div>

            {actionDraft && <div className="gov-form" role="group" aria-label={t(driftActionMessageKeys[actionDraft])}>
              <label className="gov-field"><span>{t('driftActionRationale')}</span><textarea value={actionRationale} onChange={(event) => setActionRationale(event.target.value)} placeholder={t('driftActionPlaceholder')} /></label>
              {actionError && <p className="gov-error" role="alert">{actionError}</p>}
              <div className="gov-actions">
                <button type="button" className="gov-button primary" disabled={working || actionRationale.trim().length === 0} onClick={() => void recordAction(selected.id, actionDraft)}>{working ? t('driftActionWorking') : t('driftActionConfirm')}</button>
                <button type="button" className="gov-button" onClick={() => setActionDraft('')}>{t('driftActionCancel')}</button>
              </div>
            </div>}
            {!actionDraft && actionError && <p className="gov-error gov-error-padded" role="alert">{actionError}</p>}
          </>}
        </section>

        <section className="gov-panel drift-sources">
          <header><div><span className="gov-kicker">{t('driftSourceHealth')}</span><h3>{t('driftSourceHealth')}</h3><p>{t('driftSourceHealthDescription')}</p></div><IconTarget /></header>
          {sources.status === 'LOADING' && <LoadingState label={t('driftLoading')} />}
          {sources.status === 'ERROR' && <ErrorState title={t('driftErrorTitle')} detail={sources.error} retryLabel={t('driftRetry')} onRetry={sources.reload} />}
          {sources.status === 'READY' && (sources.data ?? []).length === 0 && <p className="gov-inline-empty">{t('driftSourceEmpty')}</p>}
          {(sources.data ?? []).length > 0 && <div className="surface-scroll"><table className="drift-source-table">
            <thead><tr><th scope="col">{t('driftSourceBinding')}</th><th scope="col">{t('driftSourceSystem')}</th><th scope="col">{t('driftSourceState')}</th><th scope="col">{t('driftSourceFreshness')}</th><th scope="col">{t('driftSourceChecked')}</th><th scope="col">{t('driftSourceOpenEvents')}</th><th scope="col">{t('driftSourceApproval')}</th></tr></thead>
            <tbody>{(sources.data ?? []).map((record) => <tr key={record.bindingId}>
              <td><code className="gov-code">{record.bindingId}</code></td>
              <td>{record.sourceSystem}</td>
              <td><span className={`surface-chip ${healthTone(record.health)}`}>{t(sourceHealthMessageKeys[record.health])}</span></td>
              <td>{t('driftFreshnessMinutes', { count: record.freshnessMinutes })}</td>
              <td>{formatDate(record.lastCheckedAt, { dateStyle: 'short', timeStyle: 'short' })}</td>
              <td>{formatNumber(record.openDriftEvents)}</td>
              <td>{record.approvalStatus.replaceAll('_', ' ')}</td>
            </tr>)}</tbody>
          </table></div>}
        </section>
      </aside>
    </div>
  </section>
}
