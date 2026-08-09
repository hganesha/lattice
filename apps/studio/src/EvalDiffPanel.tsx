import { useEffect, useMemo, useState } from 'react'
import type { EvalDiffEntry, EvalDiffStatus, EvalRunDiff } from '@lattice/contracts'
import { evalGateDefinitions } from '@lattice/contracts'
import { useResource } from './useResource'
import { EmptyState, ErrorState, LoadingState, Pagination } from './SurfaceState'
import { diffTone } from './formatters'
import { caseTypeKey, decisionKey, diffStatusKey, diffStatusOrder, gateKey, useEvaluationMessages } from './i18n/messages.evaluation'
import { IconArrowUpRight, IconCheck, IconFileSearch, IconGitCompare, IconX } from './icons'
import './evaluation.css'

/**
 * E8 — baseline diff. The screen CI gating actually needs (§6 E8): a per-case matrix against a
 * pinned baseline, regressions first, and a `ciSummary` a PR check can quote verbatim.
 */

export interface EvalDiffPanelProps {
  runId: string
  runName: string
  baselineRunId: string
  baselineOptions: Array<{ id: string; name: string }>
  onBaselineChange: (baselineRunId: string) => void
  onOpenRun: (runId: string) => void
}

const entryPageSize = 12

export function EvalDiffPanel({ runId, runName, baselineRunId, baselineOptions, onBaselineChange, onOpenRun }: EvalDiffPanelProps) {
  const { t, formatDate } = useEvaluationMessages()
  const [status, setStatus] = useState<EvalDiffStatus | ''>('')
  const [page, setPage] = useState(0)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')

  const diff = useResource<EvalRunDiff>(baselineRunId ? `/v1/eval/runs/${encodeURIComponent(runId)}/diff?baseline=${encodeURIComponent(baselineRunId)}` : undefined)
  const entries = useMemo(() => diff.data?.entries ?? [], [diff.data])
  const visible = useMemo(() => entries.filter((entry) => !status || entry.status === status), [entries, status])
  const regressions = visible.filter((entry) => entry.status === 'REGRESSED')
  const others = visible.filter((entry) => entry.status !== 'REGRESSED')
  const pagedOthers = others.slice(page * entryPageSize, page * entryPageSize + entryPageSize)
  const baselineName = baselineOptions.find((option) => option.id === baselineRunId)?.name ?? baselineRunId

  useEffect(() => { setPage(0) }, [status, baselineRunId])
  useEffect(() => { setCopied(false); setCopyError('') }, [diff.data])

  async function copySummary(summary: string) {
    try {
      await navigator.clipboard.writeText(summary)
      setCopied(true)
      setCopyError('')
    } catch {
      setCopied(false)
      setCopyError(t('evalDiffCopyFailed'))
    }
  }

  return <section className="eval-panel">
    <div className="eval-panel-head"><div><span className="eval-kicker">{t('evalRunCompareTitle')}</span><h3>{t('evalDiffTitle')}</h3><p className="eval-note">{t('evalDiffDescription')}</p></div></div>
    <div className="surface-filters" role="group" aria-label={t('evalDiffFiltersLabel')}>
      <label>{t('evalRunCompareBaseline')}<select value={baselineRunId} onChange={(event) => onBaselineChange(event.target.value)} disabled={baselineOptions.length === 0}><option value="">{t('evalRunCompareNone')}</option>{baselineOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>
      {diff.data && <label>{t('evalDiffFilterStatus')}<select value={status} onChange={(event) => setStatus(event.target.value as EvalDiffStatus | '')}><option value="">{t('commonAll')}</option>{diffStatusOrder.map((option) => <option value={option} key={option}>{t(diffStatusKey(option))}</option>)}</select></label>}
      {status && <button className="ghost" onClick={() => setStatus('')}>{t('commonClearFilters')}</button>}
      {baselineRunId && <button className="ghost" onClick={() => onOpenRun(baselineRunId)}><IconArrowUpRight /> {t('evalDiffOpenBaseline')}</button>}
    </div>

    {baselineOptions.length === 0 && <EmptyState title={t('evalRunCompareTitle')} description={t('evalRunCompareUnavailable')} icon={<IconGitCompare />} />}
    {baselineOptions.length > 0 && !baselineRunId && <EmptyState title={t('evalRunCompareTitle')} description={t('evalWizardBaselineHint')} icon={<IconGitCompare />} />}
    {diff.status === 'LOADING' && <LoadingState label={t('evalDiffLoading')} />}
    {diff.status === 'ERROR' && <ErrorState title={t('evalDiffLoadFailed')} detail={diff.error} retryLabel={t('commonRetry')} onRetry={diff.reload} />}

    {diff.status === 'READY' && diff.data && <>
      <div className={`eval-diff-verdict ${diff.data.verdict === 'PASS' ? 'pass' : 'fail'}`} role="status" aria-live="polite">
        <span className={`surface-chip ${diff.data.verdict === 'PASS' ? 'success' : 'danger'}`}>{diff.data.verdict === 'PASS' ? <IconCheck /> : <IconX />} {t('evalDiffVerdict')}: {diff.data.verdict === 'PASS' ? t('evalDiffVerdictPass') : t('evalDiffVerdictFail')}</span>
        <b>{t('evalDiffAgainst', { run: runName, baseline: baselineName })}</b>
        <span className="eval-note muted">{t('evalDiffGeneratedAt')} {formatDate(diff.data.generatedAt, { dateStyle: 'medium', timeStyle: 'short' })}</span>
      </div>

      <div className="eval-section">
        <div className="eval-diff-ci">
          <div className="eval-actions"><span className="eval-kicker">{t('evalDiffCiSummary')}</span><button className="ghost" onClick={() => void copySummary(diff.data?.ciSummary ?? '')}>{copied ? t('commonCopied') : t('commonCopy')}</button></div>
          <pre>{diff.data.ciSummary}</pre>
          <p className="eval-note muted">{t('evalDiffCiSummaryHint')}</p>
          {copyError && <p className="eval-note warn">{copyError}</p>}
        </div>
      </div>

      <div className="eval-section">
        <div className="eval-diff-counts">{diffStatusOrder.map((option) => <div className="eval-diff-count" key={option}><b>{diff.data?.summary[option] ?? 0}</b><span><i className={`mini-dot ${diffTone(option)}`} /> {t(diffStatusKey(option))}</span></div>)}</div>
      </div>

      <div className="eval-section">
        <h3>{t('evalDiffGateDelta')}</h3>
        {evalGateDefinitions.every((gate) => (diff.data?.gateDelta[gate.id] ?? 0) === 0)
          ? <p className="eval-note muted">{t('evalDiffGateDeltaNone')}</p>
          : <ul className="eval-gate-list">{evalGateDefinitions.filter((gate) => (diff.data?.gateDelta[gate.id] ?? 0) !== 0).map((gate) => { const delta = diff.data?.gateDelta[gate.id] ?? 0; return <li className={`eval-gate ${delta > 0 ? 'fail' : 'pass'}`} key={gate.id}><span className="eval-gate-glyph" aria-hidden="true">{delta > 0 ? <IconX /> : <IconCheck />}</span><span><b>{t(gateKey(gate.id))}</b><small>{gate.description}</small></span><span className={`surface-chip ${delta > 0 ? 'danger' : 'success'}`}>{delta > 0 ? `+${delta}` : delta}</span></li> })}</ul>}
      </div>

      {visible.length === 0 && <EmptyState title={t('evalDiffEmptyTitle')} description={t('evalDiffEmptyDescription')} icon={<IconFileSearch />} actionLabel={t('commonClearFilters')} onAction={() => setStatus('')} />}

      {regressions.length > 0 && <>
        <p className="eval-diff-group-title"><i className="mini-dot danger" /> {t('evalDiffGroupRegressed')} · {regressions.length}</p>
        <div className="eval-scroll"><DiffTable entries={regressions} /></div>
      </>}

      {others.length > 0 && <>
        <p className="eval-diff-group-title"><i className="mini-dot neutral" /> {t('evalDiffGroupOther')} · {others.length}</p>
        <div className="eval-scroll"><DiffTable entries={pagedOthers} /></div>
        {others.length > entryPageSize && <Pagination page={page} pageSize={entryPageSize} total={others.length} onPage={setPage} labels={{ previous: t('commonPrevious'), next: t('commonNext'), range: (from, to, total) => t('commonRange', { from, to, total }) }} />}
      </>}
    </>}
  </section>
}

function DiffTable({ entries }: { entries: EvalDiffEntry[] }) {
  const { t } = useEvaluationMessages()
  return <table className="eval-diff-rows">
    <thead><tr><th>{t('evalDiffColumnCase')}</th><th>{t('evalDiffFilterStatus')}</th><th>{t('evalDiffColumnBaseline')}</th><th>{t('evalDiffColumnCandidate')}</th></tr></thead>
    <tbody>{entries.map((entry) => <tr className={entry.status === 'REGRESSED' ? 'regressed' : ''} key={entry.caseId}>
      <td><div className="eval-diff-cell"><span>{entry.question}</span><small>{entry.caseId} · {t(caseTypeKey(entry.caseType))}</small></div></td>
      <td><span className={`surface-chip ${diffTone(entry.status)}`}>{t(diffStatusKey(entry.status))}</span></td>
      <td><DiffSide side={entry.baseline} /></td>
      <td><DiffSide side={entry.candidate} /></td>
    </tr>)}</tbody>
  </table>
}

function DiffSide({ side }: { side: EvalDiffEntry['baseline'] }) {
  const { t } = useEvaluationMessages()
  if (!side) return <span className="eval-note muted">{t('evalDiffAbsent')}</span>
  const score = side.gatesPassed ? side.weightedScore : undefined
  return <div className="eval-diff-cell">
    <span className={`surface-chip ${side.status === 'PASS' ? 'success' : side.status === 'GATE_FAIL' ? 'danger' : 'warning'}`}>{side.status === 'PASS' ? t('evalRunCaseStatusPass') : side.status === 'GATE_FAIL' ? t('evalRunCaseStatusGateFail') : t('evalRunCaseStatusFail')}</span>
    <small>{t(decisionKey(side.decision))} · {score === undefined ? t('evalRunGateFailed') : t('evalRunScoreValue', { score })}</small>
  </div>
}
