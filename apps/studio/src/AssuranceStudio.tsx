import { useEffect, useMemo, useState } from 'react'
import type { AssuranceCheckCategory, AssuranceRun, ContextContract, ContextTest, EvidenceRecord } from '@lattice/contracts'
import { API_URL } from './api'
import { useMessages } from './i18n/messages'
import { Toast } from './Toast'

interface AssuranceStudioProps {
  contract: ContextContract
  onChange: (contract: ContextContract) => void
  onDirtyChange: (dirty: boolean) => void
}

export function AssuranceStudio({ contract, onChange, onDirtyChange }: AssuranceStudioProps) {
  const { t, formatTime, formatDate } = useMessages()
  const [runs, setRuns] = useState<AssuranceRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState('')
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState<'ALL' | AssuranceCheckCategory>('ALL')

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`${API_URL}/v1/assurance/runs?contractId=${encodeURIComponent(contract.id)}`, { headers: { Authorization: 'Bearer studio-demo' }, signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<AssuranceRun[]> : [])
      .then((history) => { setRuns(history); setSelectedRunId(history[0]?.id ?? '') })
      .catch(() => undefined)
    return () => controller.abort()
  }, [contract.id])

  const activeRun = runs.find((run) => run.id === selectedRunId) ?? runs[0]
  const visibleChecks = useMemo(() => activeRun?.checks.filter((check) => filter === 'ALL' || check.category === filter) ?? [], [activeRun, filter])
  const linkedQuestions = contract.competencyQuestions.filter((question) => contract.operations.some((operation) => operation.id === question.operationId)).length

  function linkQuestion(questionId: string, operationId: string) {
    onChange({ ...contract, releaseStatus: 'UNPUBLISHED', competencyQuestions: contract.competencyQuestions.map((question) => question.id === questionId ? { ...question, operationId } : question) })
    onDirtyChange(true)
    setNotice(t('assuranceMappingStaged'))
  }

  async function runSuite() {
    setRunning(true)
    setNotice('')
    try {
      const response = await fetch(`${API_URL}/v1/assurance/runs`, {
        method: 'POST',
        headers: { Authorization: 'Bearer studio-demo', 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: contract.id, contract }),
      })
      const payload = await response.json() as AssuranceRun & { error?: string }
      if (!response.ok) throw new Error(payload.error ?? `Assurance API returned ${response.status}`)
      setRuns((current) => [payload, ...current])
      setSelectedRunId(payload.id)
      const synced = syncRunToContract(contract, payload)
      onChange(synced)
      onDirtyChange(true)
      setNotice(t('assuranceCompletedNotice', payload.summary))
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : t('assuranceRunFailed'))
    } finally {
      setRunning(false)
    }
  }

  return <section className="assurance-studio-page">
    <div className="assurance-hero">
      <div><span className="panel-kicker">{t('assuranceKicker')}</span><h2>{t('assuranceTitle')}</h2><p>{t('assuranceDescription')}</p></div>
      <div className="assurance-actions"><button className="release" onClick={() => void runSuite()} disabled={running}>{running ? t('assuranceRunning') : t('assuranceRunSuite')}</button></div>
    </div>
    {notice && <Toast message={notice} closeLabel={t('commonClose')} onDismiss={() => setNotice('')} />}

    <div className="assurance-overview">
      <AssuranceMetric label={t('assuranceLatestScore')} value={activeRun ? `${activeRun.score}%` : '—'} meta={activeRun ? activeRun.status : t('assuranceNoRuns')} tone={activeRun?.status === 'FAIL' ? 'amber' : 'lime'} />
      <AssuranceMetric label={t('assuranceQuestionsLinked')} value={`${linkedQuestions} / ${contract.competencyQuestions.length}`} meta={t('assuranceQuestionOperation')} tone={linkedQuestions === contract.competencyQuestions.length ? 'green' : 'amber'} />
      <AssuranceMetric label={t('assuranceMappingTests')} value={String(contract.tests.filter((test) => test.type === 'MAPPING').length)} meta={t('assuranceSourceCoverage')} tone="blue" />
      <AssuranceMetric label={t('assuranceRunArtifacts')} value={String(runs.length)} meta={t('assuranceImmutableDigest')} tone="green" />
    </div>

    <section className="question-coverage panel">
      <div className="panel-header"><div><span className="panel-kicker">{t('assuranceCoverage')}</span><h2>{t('assuranceCoverageTitle')}</h2></div><span>{t('assuranceLinkedCount', { count: linkedQuestions })}</span></div>
      <div className="question-link-list">{contract.competencyQuestions.map((question) => { const linked = contract.operations.some((operation) => operation.id === question.operationId); return <article className="question-link-row" key={question.id}><span className={linked ? 'linked' : 'unlinked'}>{linked ? '✓' : '!'}</span><div><b>{question.question}</b><small>{question.expectedAnswerShape}</small></div><label>{t('assuranceOperation').toLocaleUpperCase()}<select value={question.operationId} onChange={(event) => linkQuestion(question.id, event.target.value)}><option value={question.operationId} disabled={!linked}>{linked ? t('assuranceCurrentOperation') : t('assuranceSelectOperation')}</option>{contract.operations.filter((operation) => operation.id !== question.operationId).map((operation) => <option value={operation.id} key={operation.id}>{operation.label} · {operation.id}</option>)}</select></label></article> })}</div>
    </section>

    <div className="assurance-results-layout">
      <main className="assurance-results panel">
        <div className="assurance-results-header"><div><span className="panel-kicker">{t('assuranceExecutionTrace')}</span><h2>{activeRun ? t('assuranceRunLabel', { id: activeRun.id.slice(-8) }) : t('assuranceGenerateTrace')}</h2></div>{activeRun && <div className="assurance-filters">{(['ALL', 'STRUCTURAL', 'QUESTION', 'MAPPING', 'POLICY', 'RELEASE'] as const).map((category) => <button className={filter === category ? 'active' : ''} onClick={() => setFilter(category)} key={category}>{category}</button>)}</div>}</div>
        {!activeRun && <div className="assurance-empty"><span>✓</span><h3>{t('assuranceEmptyTitle')}</h3><p>{t('assuranceEmptyDescription')}</p></div>}
        {activeRun && <div className="assurance-check-list">{visibleChecks.map((check) => <article className={`assurance-check ${check.status.toLocaleLowerCase()}`} key={check.id}><span>{check.status === 'PASS' ? '✓' : check.status === 'FAIL' ? '×' : '!'}</span><div><small>{check.category}</small><b>{check.label}</b><p>{check.message}</p><code>{check.affectedClaimIds.slice(0, 4).join(' · ') || t('assuranceContractWide')}{check.affectedClaimIds.length > 4 ? ` · +${check.affectedClaimIds.length - 4}` : ''}</code></div><em>{check.status}</em></article>)}</div>}
      </main>
      <aside className="assurance-readiness panel">
        <div className="panel-header"><div><span className="panel-kicker">{t('assurancePublishGate')}</span><h2>{t('assuranceReleaseReadiness')}</h2></div></div>
        {activeRun ? <><div className={`readiness-score ${activeRun.status.toLocaleLowerCase()}`}><div><b>{activeRun.score}</b><span>/ 100</span></div><strong>{activeRun.status === 'PASS' ? t('assuranceReady') : activeRun.status === 'WARNING' ? t('assuranceReadyWarnings') : t('assuranceBlocked')}</strong><p>{activeRun.summary.failed > 0 ? t('assuranceResolveFailures') : t('assuranceNoCriticalFailures')}</p></div><dl><div><dt>{t('assurancePassed')}</dt><dd className="pass">{activeRun.summary.passed}</dd></div><div><dt>{t('assuranceFailed')}</dt><dd className="fail">{activeRun.summary.failed}</dd></div><div><dt>{t('assuranceWarnings')}</dt><dd className="warn">{activeRun.summary.warnings}</dd></div><div><dt>{t('assuranceCompleted')}</dt><dd>{formatTime(activeRun.completedAt, { hour: '2-digit', minute: '2-digit' })}</dd></div></dl><div className="assurance-digest"><span>{t('assuranceImmutableArtifact')}</span><code>{activeRun.artifactDigest.slice(0, 31)}…</code><small>{t('assuranceContractVersion', { version: activeRun.contractVersion })}</small></div></> : <div className="assurance-readiness-empty">{t('assuranceNoDecision')}</div>}
        {runs.length > 0 && <div className="run-history"><span>{t('assuranceRunHistory')}</span>{runs.slice(0, 5).map((run) => <button className={run.id === activeRun?.id ? 'active' : ''} onClick={() => setSelectedRunId(run.id)} key={run.id}><i className={run.status.toLocaleLowerCase()} /> <b>{run.score}%</b><time>{formatDate(run.completedAt, { dateStyle: 'short', timeStyle: 'short' })}</time></button>)}</div>}
      </aside>
    </div>
  </section>
}

function AssuranceMetric({ label, value, meta, tone }: { label: string; value: string; meta: string; tone: string }) {
  return <div className="assurance-metric"><div><span>{label}</span><i className={`mini-dot ${tone}`} /></div><b>{value}</b><small>{meta}</small></div>
}

function syncRunToContract(contract: ContextContract, run: AssuranceRun): ContextContract {
  const testIds = new Set(run.checks.map((check) => `assurance_${sanitize(check.id)}`))
  const assuranceTests: ContextTest[] = run.checks.map((check) => ({
    id: `assurance_${sanitize(check.id)}`,
    type: categoryToTestType(check.category),
    label: check.label,
    status: check.status === 'WARNING' ? 'NOT_RUN' : check.status,
    lastRun: run.completedAt,
    affectedClaimIds: check.affectedClaimIds,
  }))
  const evidenceId = `ev_${run.id}`
  const evidence: EvidenceRecord = { id: evidenceId, type: 'OBSERVATION', title: `Assurance run ${run.id.slice(-8)}`, source: 'Lattice Assurance Runner', locator: `/v1/assurance/runs/${run.id}`, checksum: run.artifactDigest, observedAt: run.completedAt, validFrom: run.completedAt, status: run.status === 'FAIL' ? 'CONFLICTING' : 'DIRECTLY_EVIDENCED' }
  return {
    ...contract,
    releaseStatus: 'UNPUBLISHED',
    tests: [...contract.tests.filter((test) => !testIds.has(test.id) && !test.id.startsWith('assurance_')), ...assuranceTests],
    evidence: contract.evidence.some((item) => item.id === evidenceId) ? contract.evidence : [...contract.evidence, evidence],
    competencyQuestions: contract.competencyQuestions.map((question) => ({ ...question, testIds: [...new Set([...question.testIds, ...assuranceTests.filter((test) => test.affectedClaimIds.includes(question.id)).map((test) => test.id)])] })),
  }
}

function categoryToTestType(category: AssuranceCheckCategory): ContextTest['type'] {
  if (category === 'QUESTION') return 'QUESTION'
  if (category === 'MAPPING') return 'MAPPING'
  if (category === 'STRUCTURAL' || category === 'RELEASE') return 'STRUCTURAL'
  return 'CHANGE'
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_')
}
