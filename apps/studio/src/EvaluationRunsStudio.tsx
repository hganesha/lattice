import { useMemo, useState } from 'react'
import {
  evalDimensionWeights,
  evalGateDefinitions,
  type ContextContract,
  type EvalCaseResult,
  type EvalFailureAction,
  type EvalFailureCategory,
  type EvalRun,
  type EvalRunSummary,
} from '@lattice/contracts'
import { apiFetch } from './api'
import { EmptyState, ErrorState, LoadingState, MetricTile, Pagination, SurfaceHero } from './SurfaceState'
import { useResource } from './useResource'
import { durationLabel, shortDigest } from './formatters'
import { Histogram, Scatter, Sparkline } from './charts'
import { EvalDiffPanel } from './EvalDiffPanel'
import { NewEvalWizard } from './NewEvalWizard'
import { IconAlertTriangle, IconArrowUpRight, IconCheck, IconChevronDown, IconFlask, IconTarget, IconX } from './icons'
import {
  caseTypeKey,
  decisionKey,
  dimensionKey,
  failureCategoryKey,
  failureCategoryOrder,
  gateKey,
  impactKey,
  outcomeKey,
  riskTierKey,
  runStatusKey,
  useEvaluationMessages,
} from './i18n/messages.evaluation'
import './evaluation.css'

interface EvaluationRunsStudioProps {
  contract: ContextContract
  workspaceId?: string
  detailId?: string
  onNavigate: (surface: 'evaluations' | 'case-sets' | 'evidence', detailId?: string) => void
  onNavigatePath: (path: string) => void
}

const casePageSize = 12
const promoteMinimum = 24

/**
 * E7 + E10. Two rules govern this surface:
 *
 * 1. Hard gates render as gates. A gated run or case shows "gate failed", never a percentage —
 *    `weightedScore` is genuinely `undefined` in that state, so there is no number to print.
 * 2. Every failure carries routed actions that navigate somewhere real. No dead-end suggestions.
 */
export function EvaluationRunsStudio({ contract, workspaceId, detailId, onNavigate, onNavigatePath }: EvaluationRunsStudioProps) {
  const { t, formatDate } = useEvaluationMessages()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [caseSetFilter, setCaseSetFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [environmentFilter, setEnvironmentFilter] = useState('')
  const [expandedRunId, setExpandedRunId] = useState('')
  const runs = useResource<EvalRunSummary[]>(`/v1/eval/runs?contractId=${encodeURIComponent(contract.id)}${environmentFilter ? `&environment=${encodeURIComponent(environmentFilter)}` : ''}`)
  // Offered environments come from runs that exist; an environment nothing ran in is not a choice.
  const environments = useResource<EvalRunSummary[]>(`/v1/eval/runs?contractId=${encodeURIComponent(contract.id)}`)
  const environmentOptions = useMemo(() => [...new Set((environments.data ?? []).map((run) => run.environment))].sort(), [environments.data])
  const all = useMemo(() => runs.data ?? [], [runs.data])
  const caseSetIds = useMemo(() => [...new Set(all.map((run) => run.caseSetId))], [all])
  const visible = all.filter((run) => (!caseSetFilter || run.caseSetId === caseSetFilter) && (!statusFilter || run.status === statusFilter))
  const completed = useMemo(() => [...all].filter((run) => run.status === 'COMPLETED').reverse(), [all])
  const latest = completed.at(-1)
  const baselineOptions = completed.map((run) => ({ id: run.id, name: run.name }))

  if (detailId) return <RunDetail runId={detailId} />

  return <section className="eval-runs-page">
    <SurfaceHero kicker={t('evalRunKicker')} title={t('evalRunTitle')} description={t('evalRunDescription')}>
      <button className="release" onClick={() => setWizardOpen(true)}>{t('evalRunNew')}</button>
    </SurfaceHero>

    <div className="surface-metrics">
      <MetricTile label={t('evalRunMetricRuns')} value={String(all.length)} meta={t('evalRunMetricRunsMeta')} tone="info" />
      <MetricTile label={t('evalRunMetricGates')} value={latest ? String(latest.summary.gateFailures) : '—'} meta={t('evalRunMetricGatesMeta')} tone={latest && latest.summary.gateFailures > 0 ? 'danger' : 'success'} />
      <MetricTile label={t('evalRunMetricCases')} value={latest ? `${latest.summary.passed} / ${latest.summary.total}` : '—'} meta={t('evalRunMetricCasesMeta')} tone="brand" />
      <MetricTile label={t('evalRunMetricLatency')} value={latest ? durationLabel(latest.summary.p95LatencyMs) : '—'} meta={t('evalRunMetricLatencyMeta')} tone="governance" />
    </div>

    {notice && <p className="eval-notice" role="status">{notice}</p>}
    {runs.status === 'LOADING' && <LoadingState label={t('evalRunLoading')} />}
    {runs.status === 'ERROR' && <ErrorState title={t('evalRunLoadFailed')} detail={runs.error} retryLabel={t('commonRetry')} onRetry={runs.reload} />}
    {runs.status === 'READY' && all.length === 0 && <EmptyState title={t('evalRunEmptyTitle')} description={t('evalRunEmptyDescription')} icon={<IconFlask />} actionLabel={t('evalRunNew')} onAction={() => setWizardOpen(true)} secondaryLabel={t('evalRunOpenCaseSet')} onSecondary={() => onNavigate('case-sets')} />}

    {runs.status === 'READY' && all.length > 0 && <section className="eval-panel">
      <div className="eval-panel-head">
        <div><span className="eval-kicker">{t('evalRunListHeading')}</span><h2>{contract.name}</h2></div>
        <div className="surface-filters" aria-label={t('evalRunFiltersLabel')}>
          <label htmlFor="run-case-set">{t('evalRunFilterCaseSet')}<select id="run-case-set" value={caseSetFilter} onChange={(event) => setCaseSetFilter(event.target.value)}><option value="">{t('commonAll')}</option>{caseSetIds.map((id) => <option value={id} key={id}>{id}</option>)}</select></label>
          <label htmlFor="run-status">{t('evalRunFilterStatus')}<select id="run-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">{t('commonAll')}</option>{(['COMPLETED', 'RUNNING', 'QUEUED', 'CANCELLED', 'FAILED'] as const).map((status) => <option value={status} key={status}>{t(runStatusKey(status))}</option>)}</select></label>
          {environmentOptions.length > 1 && <label htmlFor="run-environment">{t('evalRunFilterEnvironment')}<select id="run-environment" value={environmentFilter} onChange={(event) => setEnvironmentFilter(event.target.value)}><option value="">{t('commonAll')}</option>{environmentOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>}
        </div>
      </div>

      {completed.length >= 2 && <div className="eval-section eval-failure-board">
        <div><span className="eval-section-label">{t('evalRunTrendLabel')}</span><Sparkline data={completed.map((run) => run.summary.passed)} label={t('evalRunTrendLabel')} tone="success" width={220} height={44} /></div>
        <div><span className="eval-section-label">{t('evalRunGateTrendLabel')}</span><Sparkline data={completed.map((run) => run.summary.gateFailures)} label={t('evalRunGateTrendLabel')} tone="danger" width={220} height={44} /></div>
      </div>}

      {visible.length === 0
        ? <EmptyState title={t('evalRunNoRuns')} description={t('evalRunNoRunsDescription')} icon={<IconFlask />} />
        : <div className="eval-scroll"><table className="eval-run-table">
          <thead><tr><th>{t('evalRunColumnRun')}</th><th>{t('evalRunColumnCases')}</th><th>{t('evalRunColumnGates')}</th><th>{t('evalRunColumnScore')}</th><th>{t('evalRunColumnLatency')}</th><th>{t('evalRunColumnStarted')}</th></tr></thead>
          {visible.map((run) => <RunRows run={run} key={run.id} />)}
        </table></div>}
    </section>}

    {wizardOpen && <NewEvalWizard contract={contract} workspaceId={workspaceId} baselineOptions={baselineOptions} onClose={() => setWizardOpen(false)} onLaunched={(run) => { setWizardOpen(false); setNotice(t('evalRunLaunchedNotice', { name: run.name })); runs.reload(); onNavigate('evaluations', run.id) }} />}
  </section>

  function RunRows({ run }: { run: EvalRunSummary }) {
    const expanded = expandedRunId === run.id
    const gated = run.summary.gateFailures > 0
    return <tbody>
      <tr className={expanded ? 'expanded' : ''}>
        <td>
          <button className="eval-run-toggle" aria-expanded={expanded} aria-label={t('evalRunExpand')} onClick={() => setExpandedRunId(expanded ? '' : run.id)}>
            <span className={`eval-expand-glyph ${expanded ? 'open' : ''}`} aria-hidden="true"><IconChevronDown /></span>
            <span><b>{run.name}</b><small>{t(runStatusKey(run.status))} · {run.caseSetId} v{run.caseSetVersion}</small></span>
          </button>
        </td>
        <td className="numeric">{run.summary.passed} / {run.summary.total}</td>
        <td><span className={`surface-chip ${gated ? 'danger' : 'success'}`}>{gated ? t('evalRunGateFailedCount', { count: run.summary.gateFailures }) : t('evalRunGatesClear')}</span></td>
        {/* A gated run has no score at all — there is no number to print here. */}
        <td><span className={gated ? 'eval-score suppressed' : 'eval-score'}>{gated ? t('evalRunGateFailed') : run.summary.weightedScore === undefined ? t('evalRunNoScore') : t('evalRunScoreValue', { score: run.summary.weightedScore })}</span></td>
        <td className="numeric">{durationLabel(run.summary.medianLatencyMs)} / {durationLabel(run.summary.p95LatencyMs)}</td>
        <td className="numeric"><time dateTime={run.startedAt}>{formatDate(run.startedAt, { dateStyle: 'short', timeStyle: 'short' })}</time></td>
      </tr>
      {expanded && <tr><td colSpan={6} style={{ padding: 0 }}><RunBreakdown run={run} /></td></tr>}
    </tbody>
  }

  function RunBreakdown({ run }: { run: EvalRunSummary }) {
    const gated = run.summary.gateFailures > 0
    const failureBins = failureCategoryOrder.map((category) => ({ label: t(failureCategoryKey(category)), value: run.failureSummary[category] ?? 0 })).filter((bin) => bin.value > 0)
    return <div className="eval-run-breakdown" aria-live="polite">
      <section>
        <h4>{t('evalRunGatesTitle')}</h4>
        <ul className="eval-gate-list">{evalGateDefinitions.map((definition) => {
          const failures = run.gateSummary[definition.id] ?? 0
          return <li className={`eval-gate ${failures > 0 ? 'fail' : 'pass'}`} key={definition.id}>
            <span className="eval-gate-glyph" aria-hidden="true">{failures > 0 ? <IconX /> : <IconCheck />}</span>
            <span><b>{t(gateKey(definition.id))}</b><small>{failures > 0 ? t('evalRunGateFail') : t('evalRunGatePass')} · {t('evalRunGateCases', { count: failures })}</small></span>
          </li>
        })}</ul>
      </section>

      <section>
        <h4>{t('evalRunMetadataTitle')}</h4>
        <dl className="eval-facts">
          <div><dt>{t('evalRunMetaCaseSet')}</dt><dd>{run.caseSetId} v{run.caseSetVersion}</dd></div>
          <div><dt>{t('evalRunMetaEnvironment')}</dt><dd>{run.environment}</dd></div>
          <div><dt>{t('evalRunMetaMode')}</dt><dd><code>{run.mode}</code></dd></div>
          <div><dt>{t('evalRunMetaTriggeredBy')}</dt><dd>{run.triggeredBy}</dd></div>
          <div><dt>{t('evalRunMetaCompleted')}</dt><dd>{run.completedAt ? formatDate(run.completedAt, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</dd></div>
          <div><dt>{t('evalRunMetaDigest')}</dt><dd><code>{shortDigest(run.artifactDigest)}</code></dd></div>
          <div><dt>{t('evalRunMetaEvidence')}</dt><dd>{run.evidenceRecordId ? <button className="eval-link" onClick={() => onNavigate('evidence')}>{run.evidenceRecordId}</button> : t('evalRunMetaEvidenceNone')}</dd></div>
        </dl>
        {gated && <p className="eval-note warn">{t('evalRunScoreSuppressed')}</p>}
      </section>

      <section>
        <h4>{t('evalRunFailureBoardTitle')}</h4>
        {failureBins.length === 0 ? <p className="eval-note muted">{t('evalRunFailureBoardEmpty')}</p> : <Histogram bins={failureBins} label={t('evalRunFailureBoardLabel')} tone="danger" />}
        <div className="eval-actions"><button className="release" onClick={() => onNavigate('evaluations', run.id)}>{t('evalRunOpen')} →</button></div>
      </section>
    </div>
  }

  function RunDetail({ runId }: { runId: string }) {
    const [resultStatus, setResultStatus] = useState('')
    const [category, setCategory] = useState<EvalFailureCategory | ''>('')
    const [page, setPage] = useState(0)
    const [expandedCaseId, setExpandedCaseId] = useState('')
    const [baselineRunId, setBaselineRunId] = useState('')
    const [cancelling, setCancelling] = useState(false)
    const [detailNotice, setDetailNotice] = useState('')
    const run = useResource<EvalRun>(`/v1/eval/runs/${encodeURIComponent(runId)}`)
    const results = useMemo(() => run.data?.results ?? [], [run.data])
    const filtered = results.filter((result) => (!resultStatus || result.status === resultStatus) && (!category || result.failure?.category === category))
    const paged = filtered.slice(page * casePageSize, (page + 1) * casePageSize)

    if (run.status === 'LOADING') return <LoadingState label={t('evalRunDetailLoading')} />
    if (run.status === 'ERROR') return <ErrorState title={t('evalRunDetailFailed')} detail={run.error} retryLabel={t('commonRetry')} onRetry={run.reload} />
    if (!run.data) return <EmptyState title={t('evalRunNotFoundTitle')} description={t('evalRunNotFoundDescription')} icon={<IconFlask />} actionLabel={t('evalRunBack')} onAction={() => onNavigate('evaluations')} />

    const detail = run.data
    const gated = detail.summary.gateFailures > 0
    const ungated = results.filter((result) => result.gatesPassed)
    const scatter = ungated.map((result) => ({
      x: Math.round((result.dimensions.find((dimension) => dimension.dimension === 'OUTCOME')?.score ?? 0) * 100),
      y: Math.round((result.dimensions.find((dimension) => dimension.dimension === 'GOVERNANCE')?.score ?? 0) * 100),
      outlier: result.status !== 'PASS',
      label: result.caseId,
    }))
    const others = baselineOptions.filter((option) => option.id !== detail.id)

    async function cancel() {
      setCancelling(true)
      try {
        await apiFetch(`/v1/eval/runs/${encodeURIComponent(detail.id)}/cancel`, { method: 'POST' })
        setDetailNotice(t('evalRunCancelledNotice', { name: detail.name }))
        run.reload()
      } catch (caught) {
        setDetailNotice(caught instanceof Error ? caught.message : t('evalRunCancelFailed'))
      } finally {
        setCancelling(false)
      }
    }

    return <section className="eval-runs-page">
      <section className="eval-panel">
        <div className="eval-run-detail-head">
          <div>
            <span className="eval-kicker">{t('evalRunKicker')}</span><h2>{detail.name}</h2>
            <div className="eval-run-status" role="status" aria-live="polite">{t('evalRunStatusLive', { name: detail.name, status: t(runStatusKey(detail.status)) })}</div>
          </div>
          <div className="eval-actions">
            <button className="ghost" onClick={() => onNavigate('evaluations')}>← {t('evalRunBack')}</button>
            {(detail.status === 'RUNNING' || detail.status === 'QUEUED') && <button className="ghost" onClick={() => void cancel()} disabled={cancelling}>{cancelling ? t('evalRunCancelling') : t('evalRunCancel')}</button>}
          </div>
        </div>
        {detailNotice && <p className="eval-notice" role="status">{detailNotice}</p>}
      </section>

      <div className="surface-metrics">
        <MetricTile label={t('evalRunMetricCases')} value={`${detail.summary.passed} / ${detail.summary.total}`} meta={t('evalRunCasesTitle')} tone="brand" />
        <MetricTile label={t('evalRunMetricGates')} value={String(detail.summary.gateFailures)} meta={t('evalRunGatesMeta')} tone={gated ? 'danger' : 'success'} />
        <MetricTile label={t('evalRunColumnScore')} value={gated || detail.summary.weightedScore === undefined ? t('evalRunGateFailed') : t('evalRunScoreValue', { score: detail.summary.weightedScore })} meta={gated ? t('evalRunScoreSuppressed') : t('evalRunDimensionsMeta', { count: ungated.length })} tone={gated ? 'danger' : 'success'} />
        <MetricTile label={t('evalRunMetricLatency')} value={durationLabel(detail.summary.p95LatencyMs)} meta={t('evalRunColumnLatency')} tone="governance" />
      </div>

      <div className="eval-run-grid">
        <section className="eval-panel">
          <div className="eval-panel-head"><div><span className="eval-kicker">{t('evalRunDimensionsTitle')}</span><h3>{t('evalRunDimensionsMeta', { count: ungated.length })}</h3></div></div>
          <div className="eval-section">
            {ungated.length === 0
              ? <p className="eval-note warn">{t('evalRunDimensionsNone')}</p>
              : <div className="eval-dimensions">{(Object.keys(evalDimensionWeights) as Array<keyof typeof evalDimensionWeights>).map((dimension) => {
                const scores = ungated.map((result) => result.dimensions.find((item) => item.dimension === dimension)?.score ?? 0)
                const mean = scores.length === 0 ? 0 : scores.reduce((sum, score) => sum + score, 0) / scores.length
                return <div key={dimension}>
                  <div className="eval-dimension-head"><span>{t(dimensionKey(dimension))}</span><em>{t('evalRunDimensionWeight', { weight: evalDimensionWeights[dimension] })}</em><b>{Math.round(mean * 100)}%</b></div>
                  <div className="eval-bar success"><i style={{ inlineSize: `${Math.round(mean * 100)}%` }} /></div>
                </div>
              })}</div>}
            {scatter.length > 1 && <div className="eval-section-label">{t('evalRunScatterTitle')}</div>}
            {scatter.length > 1 && <Scatter points={scatter} label={t('evalRunScatterLabel')} xLabel={t('evalRunScatterX')} yLabel={t('evalRunScatterY')} />}
          </div>
        </section>

        <section className="eval-panel">
          <div className="eval-panel-head"><div><span className="eval-kicker">{t('evalRunCompareTitle')}</span><h3>{t('evalRunCompareBaseline')}</h3></div></div>
          <div className="eval-section">
            {others.length === 0
              ? <p className="eval-note muted">{t('evalRunCompareUnavailable')}</p>
              : <EvalDiffPanel runId={detail.id} runName={detail.name} baselineRunId={baselineRunId} baselineOptions={others} onBaselineChange={setBaselineRunId} onOpenRun={(id) => onNavigate('evaluations', id)} />}
          </div>
        </section>
      </div>

      <section className="eval-panel">
        <div className="eval-panel-head">
          <div><span className="eval-kicker">{t('evalRunCasesTitle')}</span><h3>{detail.caseSetId} v{detail.caseSetVersion}</h3></div>
          <div className="surface-filters" aria-label={t('evalRunCaseFiltersLabel')}>
            <label htmlFor="case-status">{t('evalRunCaseFilterStatus')}<select id="case-status" value={resultStatus} onChange={(event) => { setResultStatus(event.target.value); setPage(0) }}><option value="">{t('commonAll')}</option><option value="PASS">{t('evalRunCaseStatusPass')}</option><option value="FAIL">{t('evalRunCaseStatusFail')}</option><option value="GATE_FAIL">{t('evalRunCaseStatusGateFail')}</option></select></label>
            <label htmlFor="case-category">{t('evalRunCaseFilterCategory')}<select id="case-category" value={category} onChange={(event) => { setCategory(event.target.value as EvalFailureCategory | ''); setPage(0) }}><option value="">{t('commonAll')}</option>{failureCategoryOrder.map((item) => <option value={item} key={item}>{t(failureCategoryKey(item))}</option>)}</select></label>
          </div>
        </div>

        {filtered.length === 0
          ? <EmptyState title={t('evalRunCasesEmptyTitle')} description={t('evalRunCasesEmptyDescription')} icon={<IconTarget />} />
          : <>
            <ul className="eval-case-rows">{paged.map((result) => <CaseRow result={result} caseSetId={detail.caseSetId} expanded={expandedCaseId === result.caseId} onToggle={() => setExpandedCaseId(expandedCaseId === result.caseId ? '' : result.caseId)} onPromoted={() => { run.reload(); setDetailNotice(t('evalRunPromotedNotice', { caseId: result.caseId })) }} key={result.caseId} />)}</ul>
            <Pagination page={page} pageSize={casePageSize} total={filtered.length} onPage={setPage} labels={{ previous: t('commonPrevious'), next: t('commonNext'), range: (from, to, total) => t('commonRange', { from, to, total }) }} />
          </>}
      </section>
    </section>
  }

  function CaseRow({ result, caseSetId, expanded, onToggle, onPromoted }: { result: EvalCaseResult; caseSetId: string; expanded: boolean; onToggle: () => void; onPromoted: () => void }) {
    const [promoting, setPromoting] = useState(false)
    const [rationale, setRationale] = useState('')
    const [promoteOpen, setPromoteOpen] = useState(false)
    const [error, setError] = useState('')
    const failedGates = result.gates.filter((gate) => gate.status === 'FAIL')

    async function promote() {
      setPromoting(true)
      setError('')
      try {
        await apiFetch(`/v1/case-sets/${encodeURIComponent(caseSetId)}/cases`, {
          method: 'POST',
          json: {
            case: {
              id: result.caseId,
              caseType: result.caseType,
              question: result.question,
              purposeId: result.purposeId,
              contractId: contract.id,
              expected: { outcome: result.expectedOutcome, decisions: [result.actualDecision], reasonCodes: result.reasonCodes },
              tags: ['promoted'],
              riskTier: result.riskTier,
              goldRationale: rationale.trim(),
              reviewedBy: 'studio',
              reviewedAt: new Date().toISOString(),
            },
          },
        })
        setPromoteOpen(false)
        onPromoted()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : t('evalRunPromoteFailed'))
      } finally {
        setPromoting(false)
      }
    }

    return <li>
      <button className={`eval-case-row ${result.status.toLocaleLowerCase().replaceAll('_', '-')}`} aria-expanded={expanded} aria-label={t('evalRunCaseExpandLabel')} onClick={onToggle}>
        <span className={`surface-chip ${result.status === 'PASS' ? 'success' : result.status === 'GATE_FAIL' ? 'danger' : 'warning'}`}>{result.status === 'PASS' ? t('evalRunCaseStatusPass') : result.status === 'GATE_FAIL' ? t('evalRunCaseStatusGateFail') : t('evalRunCaseStatusFail')}</span>
        <span><b>{result.question}</b><small><code>{result.caseId}</code> · {t(caseTypeKey(result.caseType))} · {t(riskTierKey(result.riskTier))}</small></span>
        {/* Suppressed, not zeroed: weightedScore is undefined whenever a gate failed. */}
        <span className={result.gatesPassed ? 'eval-score' : 'eval-score suppressed'}>{result.gatesPassed ? (result.weightedScore === undefined ? t('evalRunNoScore') : t('evalRunScoreValue', { score: result.weightedScore })) : t('evalRunGateFailed')}</span>
      </button>

      {expanded && <div className="eval-case-detail">
        <dl className="eval-facts">
          <div><dt>{t('evalRunCaseExpected')}</dt><dd>{t(outcomeKey(result.expectedOutcome))}</dd></div>
          <div><dt>{t('evalRunCaseActual')}</dt><dd>{t(decisionKey(result.actualDecision))}</dd></div>
          <div><dt>{t('evalRunCaseReasonCodes')}</dt><dd className="eval-chip-row">{result.reasonCodes.length > 0 ? result.reasonCodes.map((code) => <span className="eval-reason-code" key={code}>{code}</span>) : '—'}</dd></div>
          <div><dt>{t('evalRunCaseLatency')}</dt><dd>{durationLabel(result.latencyMs)}</dd></div>
        </dl>

        {result.explanation.length > 0 && <ul className="eval-explanation">{result.explanation.map((line) => <li key={line}>{line}</li>)}</ul>}

        {failedGates.length > 0 && <div>
          <div className="eval-section-label">{t('evalRunGatesTitle')}</div>
          <ul className="eval-gate-list">{failedGates.map((gate) => <li className="eval-gate fail" key={gate.id}><span className="eval-gate-glyph" aria-hidden="true"><IconX /></span><span><b>{t(gateKey(gate.id))}</b><small>{gate.message}</small></span></li>)}</ul>
          {!result.gatesPassed && <p className="eval-note warn">{t('evalRunCaseScoreSuppressed')}</p>}
        </div>}

        {result.gatesPassed && result.dimensions.length > 0 && <div>
          <div className="eval-section-label">{t('evalRunDimensionsTitle')}</div>
          <div className="eval-dimensions">{result.dimensions.map((dimension) => <div key={dimension.dimension}>
            <div className="eval-dimension-head"><span>{t(dimensionKey(dimension.dimension))}</span><em>{t('evalRunDimensionWeight', { weight: dimension.weight })}</em><b>{Math.round(dimension.score * 100)}%</b></div>
            <div className="eval-bar success"><i style={{ inlineSize: `${Math.round(dimension.score * 100)}%` }} /></div>
            <p className="eval-note muted">{dimension.rationale}</p>
          </div>)}</div>
        </div>}

        {result.failure && <div className={`eval-failure ${result.failure.severity.toLocaleLowerCase()}`}>
          <div className="eval-failure-head">
            <span aria-hidden="true"><IconAlertTriangle /></span><b>{t('evalRunFailureTitle')}</b>
            <span className="surface-chip warning">{t('evalRunFailureCategory')}: {t(failureCategoryKey(result.failure.category))}</span>
            <span className="surface-chip danger">{t('evalRunFailureSeverity')}: {t(impactKey(result.failure.severity))}</span>
          </div>
          <p>{result.failure.summary}</p>
          <p><b>{t('evalRunFailureRemediation')}</b> {result.failure.remediation}</p>
          {result.failure.actions.length === 0
            ? <p className="eval-note muted">{t('evalRunFailureNoActions')}</p>
            : <div className="eval-failure-actions">{result.failure.actions.map((action) => <FailureActionButton action={action} onPromote={() => setPromoteOpen(true)} key={`${action.kind}:${action.route}`} />)}</div>}
        </div>}

        <div className="eval-actions">
          {result.dispositionId
            ? <button className="ghost" onClick={() => onNavigatePath(`/dispositions/${result.dispositionId}`)}>{t('evalRunCaseDisposition')} <IconArrowUpRight /></button>
            : <span className="eval-note muted">{t('evalRunCaseNoDisposition')}</span>}
        </div>

        {promoteOpen && <div className="eval-failure">
          <div className="eval-failure-head"><b>{t('evalRunPromoteTitle')}</b></div>
          <p>{t('evalRunPromoteDescription', { caseId: result.caseId, caseSet: caseSetId })}</p>
          <label className="eval-field" htmlFor={`promote-${result.caseId}`}>{t('evalRunPromoteRationale')}<textarea id={`promote-${result.caseId}`} rows={3} value={rationale} onChange={(event) => setRationale(event.target.value)} /></label>
          {rationale.trim().length < promoteMinimum && <p className="eval-note muted">{t('evalRunPromoteMinimum')}</p>}
          {error && <p className="eval-error" role="alert">{error}</p>}
          <div className="eval-actions"><button className="ghost" onClick={() => setPromoteOpen(false)}>{t('commonCancel')}</button><button className="release" onClick={() => void promote()} disabled={promoting || rationale.trim().length < promoteMinimum}>{promoting ? t('evalRunPromoting') : t('evalRunPromoteConfirm')}</button></div>
        </div>}
      </div>}
    </li>
  }

  function FailureActionButton({ action, onPromote }: { action: EvalFailureAction; onPromote: () => void }) {
    return <button onClick={() => action.kind === 'PROMOTE_CASE' ? onPromote() : onNavigatePath(action.route)}>{action.label} <IconArrowUpRight /></button>
  }
}
