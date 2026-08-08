import { useEffect, useMemo, useState } from 'react'
import type { CaseSet, CaseSetSummary, ContextContract, CreateCaseSetRequest, DeclaredPurpose, EvalCase, EvalCaseExpectation, EvalCaseType, EvalExpectedOutcome, EvalFailureCategory, RiskTier, RuntimeDecision } from '@lattice/contracts'
import { apiFetch, loadSession } from './api'
import { useResource } from './useResource'
import { EmptyState, ErrorState, LoadingState, MetricTile, Pagination, SurfaceHero } from './SurfaceState'
import { riskTone, shortDigest, type Tone } from './formatters'
import { Donut, type DonutSegment } from './charts'
import { caseTypeKey, caseTypeOrder, decisionKey, expectedOutcomeOrder, failureCategoryKey, failureCategoryOrder, outcomeKey, riskTierKey, riskTierOrder, runtimeDecisionOrder, useEvaluationMessages } from './i18n/messages.evaluation'
import { routes, type SurfaceId } from './router'
import { IconChevronDown, IconFileSearch, IconFileText, IconInbox, IconPlay, IconPlus, IconTarget, IconUserCheck, IconX } from './icons'
import './evaluation.css'

/**
 * E6 — Case Sets. Versioned gold datasets, the screen the eval prototype never had (§4.3).
 *
 * Every case carries the full expectation `lattice-eval.md` §4 requires — question, declared
 * purpose, contract context, expected outcome, evidence and policy requirements, clarification
 * behaviour, tags, case type — plus the human-reviewed gold rationale with its reviewer and date.
 * All seven required case types are first-class filters.
 */

interface CaseSetStudioProps {
  contract: ContextContract
  workspaceId?: string
  detailId?: string
  onNavigate: (surface: SurfaceId, detailId?: string) => void
  onNavigatePath: (path: string) => void
}

type ScopeFilter = 'CONTRACT' | 'WORKSPACE' | 'GLOBAL'

const casePageSize = 8
const caseTypeTones: Readonly<Record<EvalCaseType, Tone>> = { HAPPY_PATH: 'green', REGRESSION: 'amber', AMBIGUITY: 'blue', APPROVAL: 'violet', ABSTENTION: 'muted', ADVERSARIAL: 'red', CROSS_DOMAIN: 'lime' }
const outcomeTones: Readonly<Record<EvalExpectedOutcome, Tone>> = { PLAN: 'green', CLARIFICATION: 'blue', APPROVAL: 'violet', ABSTENTION: 'amber' }

function splitList(value: string): string[] {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean)
}

function joinList(value: readonly string[] | undefined): string {
  return (value ?? []).join(', ')
}

function isCaseSet(value: unknown): value is CaseSet {
  return typeof value === 'object' && value !== null && Array.isArray((value as CaseSet).cases)
}

export function CaseSetStudio({ contract, workspaceId, detailId, onNavigate, onNavigatePath }: CaseSetStudioProps) {
  const { t, formatDate, formatNumber } = useEvaluationMessages()
  const [scope, setScope] = useState<ScopeFilter>('CONTRACT')
  const [selectedId, setSelectedId] = useState(detailId ?? '')
  const [caseType, setCaseType] = useState<EvalCaseType | ''>('')
  const [tag, setTag] = useState('')
  const [page, setPage] = useState(0)
  const [expandedCaseId, setExpandedCaseId] = useState('')
  const [editing, setEditing] = useState<{ mode: 'NEW' | 'EDIT'; value: EvalCase | undefined }>()
  const [creatingSet, setCreatingSet] = useState(false)
  const [editingSet, setEditingSet] = useState(false)
  const [notice, setNotice] = useState('')

  const listPath = useMemo(() => {
    const params = new URLSearchParams()
    if (scope === 'CONTRACT') params.set('contractId', contract.id)
    if (scope === 'WORKSPACE' && workspaceId) params.set('workspaceId', workspaceId)
    const query = params.toString()
    return query ? `/v1/case-sets?${query}` : '/v1/case-sets'
  }, [contract.id, scope, workspaceId])

  const list = useResource<CaseSetSummary[]>(listPath)
  const detail = useResource<CaseSet>(selectedId ? `/v1/case-sets/${encodeURIComponent(selectedId)}` : undefined)
  const purposes = useResource<DeclaredPurpose[]>(`/v1/purposes?domain=${encodeURIComponent(contract.domain)}&contractId=${encodeURIComponent(contract.id)}`)

  const summaries = list.data ?? []
  const firstId = summaries[0]?.id ?? ''
  const caseSet = detail.data
  const cases = useMemo(() => caseSet?.cases ?? [], [caseSet])
  const tagOptions = useMemo(() => [...new Set(cases.flatMap((entry) => entry.tags))].sort((left, right) => left.localeCompare(right)), [cases])
  const filteredCases = useMemo(() => cases.filter((entry) => (!caseType || entry.caseType === caseType) && (!tag || entry.tags.includes(tag))), [caseType, cases, tag])
  const pagedCases = filteredCases.slice(page * casePageSize, page * casePageSize + casePageSize)
  const filtered = Boolean(caseType || tag)

  useEffect(() => { if (detailId) setSelectedId(detailId) }, [detailId])
  useEffect(() => { if (!selectedId && firstId) setSelectedId(firstId) }, [firstId, selectedId])
  useEffect(() => { setPage(0); setExpandedCaseId('') }, [caseType, tag, selectedId])

  function select(id: string) {
    setSelectedId(id)
    onNavigate('case-sets', id)
  }

  function clearFilters() {
    setCaseType('')
    setTag('')
  }

  function applySaved(saved: unknown, message: string) {
    if (isCaseSet(saved)) detail.set(saved)
    else detail.reload()
    list.reload()
    setNotice(message)
  }

  const typeCounts = useMemo(() => caseTypeOrder.map((type) => ({ type, count: cases.filter((entry) => entry.caseType === type).length })), [cases])
  const segments: DonutSegment[] = typeCounts.filter((entry) => entry.count > 0).map((entry) => ({ label: t(caseTypeKey(entry.type)), value: entry.count, tone: caseTypeTones[entry.type] }))
  const reviewers = new Set(cases.map((entry) => entry.reviewedBy).filter(Boolean))
  const typesPresent = typeCounts.filter((entry) => entry.count > 0).length

  return <section className="case-set-page">
    <SurfaceHero kicker={t('caseSetKicker').toLocaleUpperCase()} title={t('caseSetTitle')} description={t('caseSetDescription')}><button className="release" onClick={() => setCreatingSet(true)}><IconPlus /> {t('caseSetNew')}</button></SurfaceHero>
    <div className="surface-metrics"><MetricTile label={t('caseSetMetricSets').toLocaleUpperCase()} value={formatNumber(summaries.length)} meta={t('caseSetMetricSetsMeta')} tone="blue" /><MetricTile label={t('caseSetMetricCases').toLocaleUpperCase()} value={formatNumber(cases.length)} meta={t('caseSetMetricCasesMeta')} tone="green" /><MetricTile label={t('caseSetMetricTypes').toLocaleUpperCase()} value={`${typesPresent}/${caseTypeOrder.length}`} meta={t('caseSetMetricTypesMeta')} tone="violet" /><MetricTile label={t('caseSetMetricReviewers').toLocaleUpperCase()} value={formatNumber(reviewers.size)} meta={t('caseSetMetricReviewersMeta')} tone="lime" /></div>

    {notice && <p className="eval-notice" role="status">{notice}</p>}

    <div className="case-set-layout">
      <main className="eval-panel">
        <div className="eval-panel-head"><div><span className="eval-kicker">{t('caseSetListKicker')}</span><h3>{scope === 'CONTRACT' ? contract.name : scope === 'WORKSPACE' ? t('caseSetScopeThisWorkspace') : t('caseSetScopeGlobal')}</h3></div></div>
        <div className="surface-filters" role="group" aria-label={t('caseSetFiltersLabel')}>
          <label>{t('caseSetScopeFilter')}<select value={scope} onChange={(event) => setScope(event.target.value as ScopeFilter)}><option value="CONTRACT">{t('caseSetScopeThisContract')}</option><option value="WORKSPACE" disabled={!workspaceId}>{t('caseSetScopeThisWorkspace')}</option><option value="GLOBAL">{t('caseSetScopeGlobal')}</option></select></label>
        </div>
        {list.status === 'LOADING' && <LoadingState label={t('caseSetLoading')} />}
        {list.status === 'ERROR' && <ErrorState title={t('caseSetLoadFailed')} detail={list.error} retryLabel={t('commonRetry')} onRetry={list.reload} />}
        {list.status === 'READY' && summaries.length === 0 && <EmptyState title={t('caseSetEmptyTitle')} description={t('caseSetEmptyDescription')} icon={<IconInbox />} actionLabel={t('caseSetNew')} onAction={() => setCreatingSet(true)} />}
        {summaries.length > 0 && <ul className="case-set-rows">{summaries.map((summary) => <li key={summary.id}><button type="button" className={`case-set-row ${selectedId === summary.id ? 'selected' : ''}`} aria-current={selectedId === summary.id ? 'true' : undefined} onClick={() => select(summary.id)}>
          <span className="case-set-row-head"><b>{summary.name}</b><span className="surface-chip blue">v{summary.version}</span></span>
          <p>{summary.description}</p>
          <span className="case-set-row-meta"><span>{t('caseSetCaseCount', { count: summary.caseCount })}</span><span>{shortDigest(summary.digest)}</span><span>{formatDate(summary.updatedAt, { dateStyle: 'short' })}</span></span>
          <span className="eval-chip-row">{caseTypeOrder.filter((type) => (summary.caseTypeCounts[type] ?? 0) > 0).map((type) => <span className={`surface-chip ${caseTypeTones[type]}`} key={type}>{t(caseTypeKey(type))} {summary.caseTypeCounts[type] ?? 0}</span>)}</span>
        </button></li>)}</ul>}
      </main>

      <section className="eval-panel">
        {detail.status === 'IDLE' && <EmptyState title={t('caseSetSelectTitle')} description={t('caseSetSelectDescription')} icon={<IconFileText />} />}
        {detail.status === 'LOADING' && <LoadingState label={t('caseSetLoading')} />}
        {detail.status === 'ERROR' && <ErrorState title={t('caseSetLoadFailed')} detail={detail.error} retryLabel={t('commonRetry')} onRetry={detail.reload} />}
        {detail.status === 'READY' && caseSet && <>
          <div className="case-set-detail-head">
            <div><span className="eval-kicker">{t('caseSetKicker')}</span><h2>{caseSet.name}</h2><p>{caseSet.description}</p></div>
            <div className="eval-actions"><button className="ghost" onClick={() => setEditingSet(true)}>{t('caseSetEditSet')}</button><button className="ghost" onClick={() => onNavigate('evaluations')}><IconPlay /> {t('caseSetEvaluate')}</button><button className="release" onClick={() => setEditing({ mode: 'NEW', value: undefined })}><IconPlus /> {t('caseSetAddCase')}</button></div>
          </div>

          <div className="eval-section">
            <dl className="eval-facts">
              <div><dt>{t('caseSetVersion')}</dt><dd>v{caseSet.version}</dd></div>
              <div><dt>{t('caseSetDigest')}</dt><dd><code title={caseSet.digest}>{shortDigest(caseSet.digest)}</code></dd></div>
              <div><dt>{t('caseSetOwner')}</dt><dd>{caseSet.owner}</dd></div>
              <div><dt>{t('caseSetUpdated')}</dt><dd>{formatDate(caseSet.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
              <div><dt>{t('caseSetFieldScope')}</dt><dd>{caseSet.scope === 'CONTRACT' ? t('caseSetScopeContract') : caseSet.scope === 'WORKSPACE' ? t('caseSetScopeWorkspace') : t('caseSetScopeGlobal')}</dd></div>
              {caseSet.contractId && <div><dt>{t('caseFieldContract')}</dt><dd><button type="button" className="eval-link" onClick={() => onNavigatePath(routes.surface(workspaceId, caseSet.contractId, 'contracts'))}><code>{caseSet.contractId}</code></button></dd></div>}
            </dl>
          </div>

          {segments.length > 0 && <div className="eval-section">
            <h3>{t('caseSetTypeDistribution')}</h3>
            <div className="case-set-distribution">
              <Donut segments={segments} label={t('caseSetTypeDistribution')} center={<><b>{formatNumber(cases.length)}</b><small>{t('caseSetMetricCases')}</small></>} />
              <ul className="case-set-legend">{typeCounts.filter((entry) => entry.count > 0).map((entry) => <li key={entry.type}><i className={`mini-dot ${caseTypeTones[entry.type]}`} /><span>{t(caseTypeKey(entry.type))}</span><b>{entry.count}</b></li>)}</ul>
            </div>
          </div>}

          <div className="eval-panel-head"><div><span className="eval-kicker">{t('caseSetCasesHeading')}</span><h3>{t('caseSetCaseCount', { count: filteredCases.length })}</h3></div></div>
          <div className="surface-filters" role="group" aria-label={t('caseSetCaseFiltersLabel')}>
            <label>{t('caseSetFilterType')}<select value={caseType} onChange={(event) => setCaseType(event.target.value as EvalCaseType | '')}><option value="">{t('commonAll')}</option>{caseTypeOrder.map((type) => <option value={type} key={type}>{t(caseTypeKey(type))}</option>)}</select></label>
            <label>{t('caseSetFilterTag')}<select value={tag} onChange={(event) => setTag(event.target.value)} disabled={tagOptions.length === 0}><option value="">{tagOptions.length === 0 ? t('caseSetNoTags') : t('commonAll')}</option>{tagOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>
            {filtered && <button className="ghost" onClick={clearFilters}>{t('commonClearFilters')}</button>}
          </div>

          {cases.length === 0 && <EmptyState title={t('caseSetCasesEmptyTitle')} description={t('caseSetCasesEmptyDescription')} icon={<IconTarget />} actionLabel={t('caseSetAddCase')} onAction={() => setEditing({ mode: 'NEW', value: undefined })} />}
          {cases.length > 0 && filteredCases.length === 0 && <EmptyState title={t('caseSetCasesFilteredTitle')} description={t('caseSetCasesFilteredDescription')} icon={<IconFileSearch />} actionLabel={t('commonClearFilters')} onAction={clearFilters} />}
          {pagedCases.length > 0 && <ul className="case-rows">{pagedCases.map((entry) => <li key={entry.id}>
            <button type="button" className="case-row" aria-expanded={expandedCaseId === entry.id} onClick={() => setExpandedCaseId((current) => current === entry.id ? '' : entry.id)}>
              <span className={`eval-expand-glyph ${expandedCaseId === entry.id ? 'open' : ''}`} aria-hidden="true"><IconChevronDown /></span>
              <span className="case-row-main"><b>{entry.question}</b><span className="eval-chip-row"><span className={`surface-chip ${caseTypeTones[entry.caseType]}`}>{t(caseTypeKey(entry.caseType))}</span><span className={`surface-chip ${outcomeTones[entry.expected.outcome]}`}>{t(outcomeKey(entry.expected.outcome))}</span><span className={`surface-chip ${riskTone(entry.riskTier)}`}>{t(riskTierKey(entry.riskTier))}</span>{entry.tags.map((entryTag) => <span className="surface-chip muted" key={entryTag}>{entryTag}</span>)}</span></span>
              <span className="case-row-side"><code className="eval-code">{entry.id}</code></span>
            </button>
            {expandedCaseId === entry.id && <CaseDetail caseValue={entry} purposes={purposes.data ?? []} onEdit={() => setEditing({ mode: 'EDIT', value: entry })} onOpenContract={() => onNavigatePath(routes.surface(workspaceId, entry.contractId, 'contracts'))} />}
          </li>)}</ul>}
          {filteredCases.length > casePageSize && <Pagination page={page} pageSize={casePageSize} total={filteredCases.length} onPage={setPage} labels={{ previous: t('commonPrevious'), next: t('commonNext'), range: (from, to, total) => t('commonRange', { from, to, total }) }} />}
        </>}
      </section>
    </div>

    {creatingSet && <CaseSetCreator contract={contract} workspaceId={workspaceId} onClose={() => setCreatingSet(false)} onCreated={(created) => { setCreatingSet(false); list.reload(); select(created.id); setNotice(t('caseSetCreatedNotice', { name: created.name })) }} />}
    {editingSet && caseSet && <CaseSetDetailsEditor caseSet={caseSet} onClose={() => setEditingSet(false)} onSaved={(saved) => { setEditingSet(false); applySaved(saved, t('caseSetSetSaved', { name: saved.name })) }} />}
    {editing && caseSet && <CaseEditor caseSet={caseSet} contract={contract} workspaceId={workspaceId} initial={editing.value} purposes={purposes.data ?? []} purposesFailed={purposes.status === 'ERROR'} onClose={() => setEditing(undefined)} onSaved={(saved) => { setEditing(undefined); applySaved(saved, t('caseSetCaseSaved', { name: caseSet.name })) }} />}
  </section>
}

/* ------------------------------- case detail ------------------------------ */

function CaseDetail({ caseValue, purposes, onEdit, onOpenContract }: { caseValue: EvalCase; purposes: DeclaredPurpose[]; onEdit: () => void; onOpenContract: () => void }) {
  const { t, formatDate } = useEvaluationMessages()
  const purpose = purposes.find((entry) => entry.id === caseValue.purposeId)
  const expected = caseValue.expected

  return <div className="case-detail">
    <blockquote>{caseValue.question}</blockquote>

    <section>
      <p className="eval-section-label">{t('caseSectionContext')}</p>
      <dl className="eval-facts">
        <div><dt>{t('caseFieldId')}</dt><dd><code>{caseValue.id}</code></dd></div>
        <div><dt>{t('caseFieldPurpose')}</dt><dd>{purpose ? `${purpose.label} ` : ''}<code>{caseValue.purposeId || t('caseNoPurpose')}</code></dd></div>
        <div><dt>{t('caseFieldContract')}</dt><dd><button type="button" className="eval-link" onClick={onOpenContract}><code>{caseValue.contractId}</code></button></dd></div>
        <div><dt>{t('caseFieldWorkspace')}</dt><dd><code>{caseValue.workspaceId ?? t('commonNone')}</code></dd></div>
        <div><dt>{t('caseFieldCaseType')}</dt><dd>{t(caseTypeKey(caseValue.caseType))}</dd></div>
        <div><dt>{t('caseFieldRiskTier')}</dt><dd><span className={`surface-chip ${riskTone(caseValue.riskTier)}`}>{t(riskTierKey(caseValue.riskTier))}</span></dd></div>
        <div><dt>{t('caseFieldFailureMode')}</dt><dd>{caseValue.failureMode ? t(failureCategoryKey(caseValue.failureMode)) : t('commonNone')}</dd></div>
        <div><dt>{t('caseFieldTags')}</dt><dd>{caseValue.tags.length === 0 ? t('caseSetNoTags') : <span className="eval-chip-row">{caseValue.tags.map((entryTag) => <span className="surface-chip muted" key={entryTag}>{entryTag}</span>)}</span>}</dd></div>
      </dl>
    </section>

    <section>
      <p className="eval-section-label">{t('caseSectionExpected')}</p>
      <dl className="eval-facts">
        <div><dt>{t('caseFieldExpectedOutcome')}</dt><dd><span className={`surface-chip ${outcomeTones[expected.outcome]}`}>{t(outcomeKey(expected.outcome))}</span></dd></div>
        <div><dt>{t('caseFieldExpectedDecisions')}</dt><dd>{expected.decisions.length === 0 ? t('commonNone') : expected.decisions.map((decision) => t(decisionKey(decision))).join(' · ')}</dd></div>
        <div><dt>{t('caseFieldRequiredEvidence')}</dt><dd>{expected.requiredEvidenceRefs?.length ? <span className="eval-chip-row">{expected.requiredEvidenceRefs.map((ref) => <code className="eval-reason-code" key={ref}>{ref}</code>)}</span> : t('commonNone')}</dd></div>
        <div><dt>{t('caseFieldRequiredPolicies')}</dt><dd>{expected.requiredPolicyIds?.length ? <span className="eval-chip-row">{expected.requiredPolicyIds.map((id) => <code className="eval-reason-code" key={id}>{id}</code>)}</span> : t('commonNone')}</dd></div>
        <div><dt>{t('caseFieldOperation')}</dt><dd><code>{expected.operationId ?? t('commonNone')}</code></dd></div>
        <div><dt>{t('caseFieldForbiddenOperations')}</dt><dd>{expected.forbiddenOperationIds?.length ? <span className="eval-chip-row">{expected.forbiddenOperationIds.map((id) => <code className="eval-reason-code" key={id}>{id}</code>)}</span> : t('commonNone')}</dd></div>
        <div><dt>{t('caseFieldClarificationType')}</dt><dd><code>{expected.clarificationEntityTypeId ?? t('commonNone')}</code></dd></div>
        <div><dt>{t('caseFieldClarificationCandidates')}</dt><dd>{expected.clarificationCandidateIds?.length ? expected.clarificationCandidateIds.join(', ') : t('commonNone')}</dd></div>
        <div><dt>{t('caseFieldMaximumRiskTier')}</dt><dd>{expected.maximumRiskTier ? t(riskTierKey(expected.maximumRiskTier)) : t('commonNone')}</dd></div>
        <div><dt>{t('evalRunCaseReasonCodes')}</dt><dd>{expected.reasonCodes?.length ? <span className="eval-chip-row">{expected.reasonCodes.map((code) => <code className="eval-reason-code" key={code}>{code}</code>)}</span> : t('commonNone')}</dd></div>
      </dl>
    </section>

    <section className="case-gold">
      <p className="eval-section-label">{t('caseSectionGold')}</p>
      <p>{caseValue.goldRationale}</p>
      <footer><IconUserCheck /> {t('caseReviewedByOn', { name: caseValue.reviewedBy, date: caseValue.reviewedAt ? formatDate(caseValue.reviewedAt, { dateStyle: 'medium' }) : '—' })}</footer>
    </section>

    <div className="eval-actions"><button className="ghost" onClick={onEdit}>{t('caseSetEditCase')}</button></div>
  </div>
}

/* ------------------------------- case editor ------------------------------ */

interface CaseDraft {
  id: string
  caseType: EvalCaseType
  question: string
  purposeId: string
  riskTier: RiskTier
  outcome: EvalExpectedOutcome
  decisions: RuntimeDecision[]
  reasonCodes: string
  operationId: string
  forbiddenOperationIds: string
  requiredEvidenceRefs: string
  requiredPolicyIds: string
  clarificationEntityTypeId: string
  clarificationCandidateIds: string
  maximumRiskTier: RiskTier | ''
  tags: string
  failureMode: EvalFailureCategory | ''
  goldRationale: string
  reviewedBy: string
  reviewedAt: string
}

function toDraft(initial: EvalCase | undefined, contract: ContextContract, purposes: DeclaredPurpose[]): CaseDraft {
  const session = loadSession()
  if (!initial) return {
    id: `case_${Date.now().toString(36)}`, caseType: 'HAPPY_PATH', question: '', purposeId: purposes[0]?.id ?? '', riskTier: 'ANALYTICAL', outcome: 'PLAN', decisions: ['RESOLVED'], reasonCodes: '', operationId: '',
    forbiddenOperationIds: '', requiredEvidenceRefs: '', requiredPolicyIds: '', clarificationEntityTypeId: '', clarificationCandidateIds: '', maximumRiskTier: '', tags: '', failureMode: '',
    goldRationale: '', reviewedBy: session.displayName, reviewedAt: new Date().toISOString().slice(0, 10),
  }
  void contract
  return {
    id: initial.id, caseType: initial.caseType, question: initial.question, purposeId: initial.purposeId, riskTier: initial.riskTier, outcome: initial.expected.outcome, decisions: [...initial.expected.decisions],
    reasonCodes: joinList(initial.expected.reasonCodes), operationId: initial.expected.operationId ?? '', forbiddenOperationIds: joinList(initial.expected.forbiddenOperationIds),
    requiredEvidenceRefs: joinList(initial.expected.requiredEvidenceRefs), requiredPolicyIds: joinList(initial.expected.requiredPolicyIds), clarificationEntityTypeId: initial.expected.clarificationEntityTypeId ?? '',
    clarificationCandidateIds: joinList(initial.expected.clarificationCandidateIds), maximumRiskTier: initial.expected.maximumRiskTier ?? '', tags: joinList(initial.tags), failureMode: initial.failureMode ?? '',
    goldRationale: initial.goldRationale, reviewedBy: initial.reviewedBy, reviewedAt: initial.reviewedAt ? initial.reviewedAt.slice(0, 10) : '',
  }
}

interface CaseEditorProps {
  caseSet: CaseSet
  contract: ContextContract
  workspaceId: string | undefined
  initial: EvalCase | undefined
  purposes: DeclaredPurpose[]
  purposesFailed: boolean
  onClose: () => void
  onSaved: (saved: unknown) => void
}

function CaseEditor({ caseSet, contract, workspaceId, initial, purposes, purposesFailed, onClose, onSaved }: CaseEditorProps) {
  const { t } = useEvaluationMessages()
  const [draft, setDraft] = useState<CaseDraft>(() => toDraft(initial, contract, purposes))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  function patch(next: Partial<CaseDraft>) { setDraft((current) => ({ ...current, ...next })) }
  function toggleDecision(decision: RuntimeDecision) { setDraft((current) => ({ ...current, decisions: current.decisions.includes(decision) ? current.decisions.filter((entry) => entry !== decision) : [...current.decisions, decision] })) }

  async function save() {
    if (!draft.question.trim() || !draft.goldRationale.trim()) { setError(t('caseSetCaseIncomplete')); return }
    setSaving(true)
    setError('')
    const expected: EvalCaseExpectation = {
      outcome: draft.outcome,
      decisions: draft.decisions,
      ...(splitList(draft.reasonCodes).length ? { reasonCodes: splitList(draft.reasonCodes) } : {}),
      ...(draft.operationId.trim() ? { operationId: draft.operationId.trim() } : {}),
      ...(splitList(draft.forbiddenOperationIds).length ? { forbiddenOperationIds: splitList(draft.forbiddenOperationIds) } : {}),
      ...(splitList(draft.requiredEvidenceRefs).length ? { requiredEvidenceRefs: splitList(draft.requiredEvidenceRefs) } : {}),
      ...(splitList(draft.requiredPolicyIds).length ? { requiredPolicyIds: splitList(draft.requiredPolicyIds) } : {}),
      ...(draft.clarificationEntityTypeId.trim() ? { clarificationEntityTypeId: draft.clarificationEntityTypeId.trim() } : {}),
      ...(splitList(draft.clarificationCandidateIds).length ? { clarificationCandidateIds: splitList(draft.clarificationCandidateIds) } : {}),
      ...(draft.maximumRiskTier ? { maximumRiskTier: draft.maximumRiskTier } : {}),
    }
    const value: EvalCase = {
      ...(initial ?? {}),
      id: draft.id.trim() || `case_${Date.now().toString(36)}`,
      caseType: draft.caseType,
      question: draft.question.trim(),
      purposeId: draft.purposeId,
      contractId: initial?.contractId ?? caseSet.contractId ?? contract.id,
      ...((initial?.workspaceId ?? caseSet.workspaceId ?? workspaceId) ? { workspaceId: initial?.workspaceId ?? caseSet.workspaceId ?? workspaceId ?? '' } : {}),
      expected,
      tags: splitList(draft.tags),
      riskTier: draft.riskTier,
      ...(draft.failureMode ? { failureMode: draft.failureMode } : {}),
      goldRationale: draft.goldRationale.trim(),
      reviewedBy: draft.reviewedBy.trim(),
      reviewedAt: draft.reviewedAt ? new Date(draft.reviewedAt).toISOString() : new Date().toISOString(),
    }
    try {
      const saved = await apiFetch<unknown>(`/v1/case-sets/${encodeURIComponent(caseSet.id)}/cases`, { method: 'POST', json: { case: value } })
      onSaved(saved)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('caseSetCaseSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return <div className="eval-modal-backdrop" role="presentation">
    <section className="eval-modal" role="dialog" aria-modal="true" aria-label={initial ? t('caseSetEditCase') : t('caseSetNewCase')}>
      <header className="eval-modal-head"><div><span className="eval-kicker">{caseSet.name} · v{caseSet.version}</span><h2>{initial ? t('caseSetEditCase') : t('caseSetNewCase')}</h2></div><button className="eval-modal-close" type="button" aria-label={t('commonClose')} onClick={onClose}><IconX /></button></header>
      <div className="eval-modal-body">
        {purposesFailed && <p className="eval-note warn">{t('casePurposesUnavailable')}</p>}
        <p className="eval-section-label">{t('caseSectionContext')}</p>
        <div className="eval-form-grid wide"><label className="eval-field"><span>{t('caseFieldQuestion')}</span><textarea value={draft.question} placeholder={t('caseQuestionPlaceholder')} onChange={(event) => patch({ question: event.target.value })} /></label></div>
        <div className="eval-form-grid">
          <label className="eval-field"><span>{t('caseFieldId')}</span><input value={draft.id} onChange={(event) => patch({ id: event.target.value })} readOnly={Boolean(initial)} /></label>
          <label className="eval-field"><span>{t('caseFieldPurpose')}</span><select value={draft.purposeId} onChange={(event) => patch({ purposeId: event.target.value })}><option value="">{t('caseNoPurpose')}</option>{purposes.map((purpose) => <option value={purpose.id} key={purpose.id}>{purpose.label}</option>)}</select></label>
          <label className="eval-field"><span>{t('caseFieldCaseType')}</span><select value={draft.caseType} onChange={(event) => patch({ caseType: event.target.value as EvalCaseType })}>{caseTypeOrder.map((type) => <option value={type} key={type}>{t(caseTypeKey(type))}</option>)}</select></label>
          <label className="eval-field"><span>{t('caseFieldRiskTier')}</span><select value={draft.riskTier} onChange={(event) => patch({ riskTier: event.target.value as RiskTier })}>{riskTierOrder.map((tier) => <option value={tier} key={tier}>{t(riskTierKey(tier))}</option>)}</select></label>
          <div className="eval-field"><span>{t('caseFieldContract')}</span><div className="eval-field-readonly">{initial?.contractId ?? caseSet.contractId ?? contract.id}</div></div>
          <div className="eval-field"><span>{t('caseFieldWorkspace')}</span><div className="eval-field-readonly">{initial?.workspaceId ?? caseSet.workspaceId ?? workspaceId ?? t('commonNone')}</div></div>
        </div>

        <p className="eval-section-label">{t('caseSectionExpected')}</p>
        <div className="eval-form-grid">
          <label className="eval-field"><span>{t('caseFieldExpectedOutcome')}</span><select value={draft.outcome} onChange={(event) => patch({ outcome: event.target.value as EvalExpectedOutcome })}>{expectedOutcomeOrder.map((outcome) => <option value={outcome} key={outcome}>{t(outcomeKey(outcome))}</option>)}</select></label>
          <label className="eval-field"><span>{t('caseFieldMaximumRiskTier')}</span><select value={draft.maximumRiskTier} onChange={(event) => patch({ maximumRiskTier: event.target.value as RiskTier | '' })}><option value="">{t('commonNone')}</option>{riskTierOrder.map((tier) => <option value={tier} key={tier}>{t(riskTierKey(tier))}</option>)}</select></label>
        </div>
        <div className="eval-field"><span>{t('caseFieldExpectedDecisions')}</span><div className="eval-toggle-grid">{runtimeDecisionOrder.map((decision) => <button type="button" className={`eval-toggle ${draft.decisions.includes(decision) ? 'on' : ''}`} aria-pressed={draft.decisions.includes(decision)} key={decision} onClick={() => toggleDecision(decision)}>{t(decisionKey(decision))}</button>)}</div></div>
        <div className="eval-form-grid">
          <label className="eval-field"><span>{t('caseFieldRequiredEvidence')}</span><input value={draft.requiredEvidenceRefs} onChange={(event) => patch({ requiredEvidenceRefs: event.target.value })} /><small>{t('commonCommaSeparated')}</small></label>
          <label className="eval-field"><span>{t('caseFieldRequiredPolicies')}</span><input value={draft.requiredPolicyIds} onChange={(event) => patch({ requiredPolicyIds: event.target.value })} /><small>{t('commonCommaSeparated')}</small></label>
          <label className="eval-field"><span>{t('caseFieldOperation')}</span><input value={draft.operationId} onChange={(event) => patch({ operationId: event.target.value })} /></label>
          <label className="eval-field"><span>{t('caseFieldForbiddenOperations')}</span><input value={draft.forbiddenOperationIds} onChange={(event) => patch({ forbiddenOperationIds: event.target.value })} /><small>{t('commonCommaSeparated')}</small></label>
          <label className="eval-field"><span>{t('caseFieldClarificationType')}</span><input value={draft.clarificationEntityTypeId} onChange={(event) => patch({ clarificationEntityTypeId: event.target.value })} /></label>
          <label className="eval-field"><span>{t('caseFieldClarificationCandidates')}</span><input value={draft.clarificationCandidateIds} onChange={(event) => patch({ clarificationCandidateIds: event.target.value })} /><small>{t('commonCommaSeparated')}</small></label>
          <label className="eval-field"><span>{t('evalRunCaseReasonCodes')}</span><input value={draft.reasonCodes} onChange={(event) => patch({ reasonCodes: event.target.value })} /><small>{t('commonCommaSeparated')}</small></label>
          <label className="eval-field"><span>{t('caseFieldFailureMode')}</span><select value={draft.failureMode} onChange={(event) => patch({ failureMode: event.target.value as EvalFailureCategory | '' })}><option value="">{t('commonNone')}</option>{failureCategoryOrder.map((category) => <option value={category} key={category}>{t(failureCategoryKey(category))}</option>)}</select></label>
          <label className="eval-field"><span>{t('caseFieldTags')}</span><input value={draft.tags} placeholder={t('caseTagsPlaceholder')} onChange={(event) => patch({ tags: event.target.value })} /><small>{t('commonCommaSeparated')}</small></label>
        </div>

        <p className="eval-section-label">{t('caseSectionGold')}</p>
        <div className="eval-form-grid wide"><label className="eval-field"><span>{t('caseFieldGoldRationale')}</span><textarea value={draft.goldRationale} placeholder={t('caseRationalePlaceholder')} onChange={(event) => patch({ goldRationale: event.target.value })} /></label></div>
        <div className="eval-form-grid">
          <label className="eval-field"><span>{t('caseFieldReviewedBy')}</span><input value={draft.reviewedBy} onChange={(event) => patch({ reviewedBy: event.target.value })} /></label>
          <label className="eval-field"><span>{t('caseFieldReviewedAt')}</span><input type="date" value={draft.reviewedAt} onChange={(event) => patch({ reviewedAt: event.target.value })} /></label>
        </div>
        {error && <p className="eval-error" role="alert">{error}</p>}
      </div>
      <footer className="eval-modal-foot"><button className="ghost" onClick={onClose}>{t('commonCancel')}</button><button className="release" onClick={() => void save()} disabled={saving}>{saving ? t('commonSaving') : t('commonSave')}</button></footer>
    </section>
  </div>
}

/* ---------------------------- set create + edit --------------------------- */

function CaseSetCreator({ contract, workspaceId, onClose, onCreated }: { contract: ContextContract; workspaceId: string | undefined; onClose: () => void; onCreated: (created: CaseSet) => void }) {
  const { t } = useEvaluationMessages()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<CaseSet['scope']>('CONTRACT')
  const [owner, setOwner] = useState(loadSession().displayName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function create() {
    setSaving(true)
    setError('')
    const request: CreateCaseSetRequest = {
      name: name.trim() || contract.name,
      description: description.trim(),
      scope,
      ...(scope === 'CONTRACT' ? { contractId: contract.id } : {}),
      ...(scope !== 'GLOBAL' && workspaceId ? { workspaceId } : {}),
      owner: owner.trim(),
    }
    try {
      onCreated(await apiFetch<CaseSet>('/v1/case-sets', { method: 'POST', json: request }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('caseSetCreateFailed'))
      setSaving(false)
    }
  }

  return <div className="eval-modal-backdrop" role="presentation">
    <section className="eval-modal narrow" role="dialog" aria-modal="true" aria-label={t('caseSetNewTitle')}>
      <header className="eval-modal-head"><div><span className="eval-kicker">{t('caseSetKicker')}</span><h2>{t('caseSetNewTitle')}</h2><p>{t('caseSetEmptyDescription')}</p></div><button className="eval-modal-close" type="button" aria-label={t('commonClose')} onClick={onClose}><IconX /></button></header>
      <div className="eval-modal-body">
        <div className="eval-form-grid wide">
          <label className="eval-field"><span>{t('caseSetFieldName')}</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="eval-field"><span>{t('caseSetFieldDescription')}</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="eval-field"><span>{t('caseSetFieldScope')}</span><select value={scope} onChange={(event) => setScope(event.target.value as CaseSet['scope'])}><option value="CONTRACT">{t('caseSetScopeContract')}</option><option value="WORKSPACE" disabled={!workspaceId}>{t('caseSetScopeWorkspace')}</option><option value="GLOBAL">{t('caseSetScopeGlobal')}</option></select></label>
          <label className="eval-field"><span>{t('caseSetFieldOwner')}</span><input value={owner} onChange={(event) => setOwner(event.target.value)} /></label>
        </div>
        {error && <p className="eval-error" role="alert">{error}</p>}
      </div>
      <footer className="eval-modal-foot"><button className="ghost" onClick={onClose}>{t('commonCancel')}</button><button className="release" onClick={() => void create()} disabled={saving}>{saving ? t('caseSetCreating') : t('caseSetCreate')}</button></footer>
    </section>
  </div>
}

function CaseSetDetailsEditor({ caseSet, onClose, onSaved }: { caseSet: CaseSet; onClose: () => void; onSaved: (saved: CaseSet) => void }) {
  const { t } = useEvaluationMessages()
  const [name, setName] = useState(caseSet.name)
  const [description, setDescription] = useState(caseSet.description)
  const [owner, setOwner] = useState(caseSet.owner)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      const saved = await apiFetch<CaseSet>(`/v1/case-sets/${encodeURIComponent(caseSet.id)}`, { method: 'PUT', json: { caseSet: { ...caseSet, name: name.trim() || caseSet.name, description: description.trim(), owner: owner.trim() || caseSet.owner } } })
      onSaved(isCaseSet(saved) ? saved : { ...caseSet, name, description, owner })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('caseSetSetSaveFailed'))
      setSaving(false)
    }
  }

  return <div className="eval-modal-backdrop" role="presentation">
    <section className="eval-modal narrow" role="dialog" aria-modal="true" aria-label={t('caseSetEditSetTitle')}>
      <header className="eval-modal-head"><div><span className="eval-kicker">v{caseSet.version} · {shortDigest(caseSet.digest)}</span><h2>{t('caseSetEditSetTitle')}</h2></div><button className="eval-modal-close" type="button" aria-label={t('commonClose')} onClick={onClose}><IconX /></button></header>
      <div className="eval-modal-body">
        <div className="eval-form-grid wide">
          <label className="eval-field"><span>{t('caseSetFieldName')}</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="eval-field"><span>{t('caseSetFieldDescription')}</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="eval-field"><span>{t('caseSetFieldOwner')}</span><input value={owner} onChange={(event) => setOwner(event.target.value)} /></label>
        </div>
        {error && <p className="eval-error" role="alert">{error}</p>}
      </div>
      <footer className="eval-modal-foot"><button className="ghost" onClick={onClose}>{t('commonCancel')}</button><button className="release" onClick={() => void save()} disabled={saving}>{saving ? t('commonSaving') : t('commonSave')}</button></footer>
    </section>
  </div>
}
