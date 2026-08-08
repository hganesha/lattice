import { useEffect, useMemo, useState } from 'react'
import type { ContextContract, NegativeDecision } from '@lattice/contracts'
import { apiFetch } from './api'
import { useResource } from './useResource'
import { EmptyState, ErrorState, LoadingState, MetricTile, Pagination, SurfaceHero } from './SurfaceState'
import { shortDigest } from './formatters'
import { negativeScopeMessageKeys, negativeStatusMessageKeys, useGovernanceMessages } from './i18n/messages.governance'
import { routes, type SurfaceId } from './router'
import { Toast } from './Toast'
import { IconAlertTriangle, IconArrowUpRight, IconBan, IconFileSearch } from './icons'
import './governance.css'

/**
 * E13 — the Negative Decision Registry (evolution §C). A rejection recorded once is never
 * re-proposed, and every prohibition carries a review-by date: there is no "expires: never".
 */

type ScopeFilter = '' | NegativeDecision['applicability']['scope']
type StatusFilter = '' | NegativeDecision['status']

interface NegativeDecisionStudioProps {
  workspaceId?: string
  contract: ContextContract
  detailId?: string
  onNavigate: (surface: SurfaceId, detailId?: string) => void
  onNavigatePath: (path: string) => void
}

const pageSize = 20
const scopeOptions: readonly NegativeDecision['applicability']['scope'][] = ['CONTRACT', 'WORKSPACE', 'GLOBAL']
const statusOptions: readonly NegativeDecision['status'][] = ['ACTIVE', 'DUE_FOR_REVIEW', 'SUPERSEDED', 'WITHDRAWN']

function statusTone(status: NegativeDecision['status']): string {
  if (status === 'ACTIVE') return 'red'
  if (status === 'DUE_FOR_REVIEW') return 'amber'
  if (status === 'SUPERSEDED') return 'blue'
  return 'muted'
}

export function NegativeDecisionStudio({ workspaceId, contract, detailId, onNavigate, onNavigatePath }: NegativeDecisionStudioProps) {
  const { t, formatDate, formatNumber } = useGovernanceMessages()
  const [scope, setScope] = useState<ScopeFilter>('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [subjectQuery, setSubjectQuery] = useState('')
  const [selectedId, setSelectedId] = useState(detailId ?? '')
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawReason, setWithdrawReason] = useState('')
  const [withdrawError, setWithdrawError] = useState('')
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')
  const [page, setPage] = useState(0)

  const listPath = useMemo(() => {
    const params = new URLSearchParams()
    if (workspaceId) params.set('workspaceId', workspaceId)
    else params.set('contractId', contract.id)
    return `/v1/negative-decisions?${params.toString()}`
  }, [contract.id, workspaceId])

  const registry = useResource<NegativeDecision[]>(listPath)
  const detail = useResource<NegativeDecision>(selectedId ? `/v1/negative-decisions/${encodeURIComponent(selectedId)}` : undefined, [selectedId])
  const all = useMemo(() => registry.data ?? [], [registry.data])
  const query = subjectQuery.trim().toLocaleLowerCase()

  const visible = useMemo(() => all.filter((entry) => {
    if (scope && entry.applicability.scope !== scope) return false
    if (status && entry.status !== status) return false
    if (!query) return true
    return entry.prohibited.subject.toLocaleLowerCase().includes(query) || (entry.prohibited.sourceSystem ?? '').toLocaleLowerCase().includes(query)
  }), [all, query, scope, status])

  const pageItems = visible.slice(page * pageSize, page * pageSize + pageSize)
  const firstId = visible[0]?.id ?? ''
  const activeCount = all.filter((entry) => entry.status === 'ACTIVE').length
  const dueCount = all.filter((entry) => entry.status === 'DUE_FOR_REVIEW').length
  const exceptionCount = all.reduce((sum, entry) => sum + entry.exceptions.length, 0)
  const withdrawnCount = all.filter((entry) => entry.status === 'WITHDRAWN').length
  const filterKey = `${scope}|${status}|${query}`

  useEffect(() => { setPage(0) }, [filterKey])
  useEffect(() => { if (detailId) setSelectedId(detailId) }, [detailId])
  useEffect(() => { if (!selectedId && firstId) setSelectedId(firstId) }, [firstId, selectedId])

  function select(id: string) {
    setSelectedId(id)
    setWithdrawOpen(false)
    setWithdrawError('')
    onNavigate('negative-decisions', id)
  }

  async function withdraw(id: string) {
    if (!withdrawReason.trim()) { setWithdrawError(t('negativeWithdrawFailed')); return }
    setWorking(true)
    setWithdrawError('')
    try {
      const updated = await apiFetch<NegativeDecision>(`/v1/negative-decisions/${encodeURIComponent(id)}/withdraw`, { method: 'POST', json: { rationale: withdrawReason.trim() } })
      detail.set(updated)
      setNotice(t('negativeWithdrawDone'))
      setWithdrawOpen(false)
      setWithdrawReason('')
      registry.reload()
    } catch (caught) {
      setWithdrawError(caught instanceof Error ? caught.message : t('negativeWithdrawFailed'))
    } finally {
      setWorking(false)
    }
  }

  return <section className="negative-page">
    <SurfaceHero kicker={t('negativeKicker').toLocaleUpperCase()} title={t('negativeTitle')} description={t('negativeDescription')}><button className="ghost" onClick={() => onNavigate('reviews')}>{t('negativeOriginReview')}</button></SurfaceHero>
    {notice && <Toast message={notice} closeLabel={t('negativeClose')} onDismiss={() => setNotice('')} tone="success" />}
    <div className="surface-metrics">
      <MetricTile label={t('negativeMetricActive')} value={formatNumber(activeCount)} meta={t('negativeMetricActiveMeta')} tone="red" onClick={() => setStatus('ACTIVE')} />
      <MetricTile label={t('negativeMetricDue')} value={formatNumber(dueCount)} meta={t('negativeMetricDueMeta')} tone="amber" onClick={() => setStatus('DUE_FOR_REVIEW')} />
      <MetricTile label={t('negativeMetricExceptions')} value={formatNumber(exceptionCount)} meta={t('negativeMetricExceptionsMeta')} tone="blue" />
      <MetricTile label={t('negativeMetricWithdrawn')} value={formatNumber(withdrawnCount)} meta={t('negativeMetricWithdrawnMeta')} tone="lime" onClick={() => setStatus('WITHDRAWN')} />
    </div>

    <div className="negative-layout">
      <main className="gov-panel">
        <div className="surface-filters" role="group" aria-label={t('negativeFilterStatus')}>
          <label>{t('negativeFilterScope')}<select value={scope} onChange={(event) => setScope(event.target.value as ScopeFilter)}><option value="">{t('negativeScopeAll')}</option>{scopeOptions.map((option) => <option value={option} key={option}>{t(negativeScopeMessageKeys[option])}</option>)}</select></label>
          <label>{t('negativeFilterStatus')}<select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}><option value="">{t('negativeStatusAll')}</option>{statusOptions.map((option) => <option value={option} key={option}>{t(negativeStatusMessageKeys[option])}</option>)}</select></label>
          <label>{t('negativeFilterSubject')}<input value={subjectQuery} onChange={(event) => setSubjectQuery(event.target.value)} placeholder={t('negativeSubjectPlaceholder')} /></label>
          <span className="gov-meta" role="status" aria-live="polite">{t('negativeLive', { count: visible.length })}</span>
        </div>

        {registry.status === 'LOADING' && <LoadingState label={t('negativeLoading')} />}
        {registry.status === 'ERROR' && <ErrorState title={t('negativeErrorTitle')} detail={registry.error} retryLabel={t('negativeRetry')} onRetry={registry.reload} />}
        {registry.status === 'READY' && visible.length === 0 && <EmptyState title={t('negativeEmptyTitle')} description={t('negativeEmptyDescription')} icon={<IconFileSearch />} actionLabel={t('negativeOpenReview')} onAction={() => onNavigate('reviews')} />}

        {pageItems.length > 0 && <div className="negative-list">{pageItems.map((entry) => <button type="button" className="negative-row" key={entry.id} aria-current={selectedId === entry.id ? 'true' : undefined} onClick={() => select(entry.id)}>
          <span aria-hidden="true"><IconBan /></span>
          <span>
            <b>{entry.prohibited.subject}</b>
            <p>{entry.rationale}</p>
            <footer>
              <span className={`surface-chip ${statusTone(entry.status)}`}>{t(negativeStatusMessageKeys[entry.status])}</span>
              <span className="surface-chip muted">{t(negativeScopeMessageKeys[entry.applicability.scope])}</span>
              {entry.prohibited.sourceSystem && <span className="surface-chip blue">{entry.prohibited.sourceSystem}</span>}
              <span className={`surface-chip ${entry.status === 'DUE_FOR_REVIEW' ? 'amber' : 'muted'}`}>{t('negativeReviewBy')} {formatDate(entry.reviewBy, { dateStyle: 'medium' })}</span>
            </footer>
          </span>
          <time dateTime={entry.decidedAt} className="gov-meta">{formatDate(entry.decidedAt, { dateStyle: 'short' })}</time>
        </button>)}</div>}

        {visible.length > 0 && <Pagination page={page} pageSize={pageSize} total={visible.length} onPage={(next) => setPage(Math.max(0, next))} labels={{ previous: t('negativePrevious'), next: t('negativeNext'), range: (from, to, total) => t('negativeRange', { from, to, total }) }} />}
      </main>

      <aside className="gov-panel negative-detail">
        {detail.status === 'IDLE' && <EmptyState title={t('negativeEmptyTitle')} description={t('negativeSelectPrompt')} icon={<IconBan />} />}
        {detail.status === 'LOADING' && <LoadingState label={t('negativeLoading')} />}
        {detail.status === 'ERROR' && <ErrorState title={t('negativeErrorTitle')} detail={detail.error} retryLabel={t('negativeRetry')} onRetry={detail.reload} />}
        {detail.status === 'READY' && detail.data && <>
          <header><div><span className="gov-kicker">{t('negativeProhibits')}</span><h3>{detail.data.prohibited.subject}</h3></div><span className={`surface-chip ${statusTone(detail.data.status)}`}>{t(negativeStatusMessageKeys[detail.data.status])}</span></header>
          {detail.data.status === 'DUE_FOR_REVIEW' && <p className="gov-warning" role="status" aria-live="polite"><IconAlertTriangle /> {t('negativeDueWarning')}</p>}
          <blockquote>{detail.data.rationale}</blockquote>
          <dl className="gov-dl">
            <div><dt>{t('negativeDecidedBy')}</dt><dd>{detail.data.decidedBy}</dd></div>
            <div><dt>{t('negativeDecidedAt')}</dt><dd>{formatDate(detail.data.decidedAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
            <div><dt>{t('negativeEffectiveFrom')}</dt><dd>{formatDate(detail.data.effectiveFrom, { dateStyle: 'medium' })}</dd></div>
            <div><dt>{t('negativeReviewBy')}</dt><dd>{formatDate(detail.data.reviewBy, { dateStyle: 'medium' })}</dd></div>
            <div><dt>{t('negativeApplicability')}</dt><dd>{t(negativeScopeMessageKeys[detail.data.applicability.scope])}</dd></div>
            <div><dt>{t('negativeContractClasses')}</dt><dd>{detail.data.applicability.contractClasses.length > 0 ? detail.data.applicability.contractClasses.join(', ') : t('negativeAnyClass')}</dd></div>
            <div><dt>{t('negativeGrain')}</dt><dd>{detail.data.applicability.grain.length > 0 ? detail.data.applicability.grain.join(', ') : t('negativeAnyGrain')}</dd></div>
            {detail.data.prohibited.sourceSystem && <div><dt>{t('negativeSource')}</dt><dd><code className="gov-code">{detail.data.prohibited.sourceSystem}</code></dd></div>}
            {detail.data.prohibited.bindingId && <div><dt>{t('negativeBinding')}</dt><dd><code className="gov-code">{detail.data.prohibited.bindingId}</code></dd></div>}
            {detail.data.prohibited.targetTypeId && <div><dt>{t('negativeTargetType')}</dt><dd><code className="gov-code">{detail.data.prohibited.targetTypeId}</code></dd></div>}
            {detail.data.prohibited.targetPropertyId && <div><dt>{t('negativeTargetProperty')}</dt><dd><code className="gov-code">{detail.data.prohibited.targetPropertyId}</code></dd></div>}
            {detail.data.supersededById && <div><dt>{t('negativeStatusSuperseded')}</dt><dd>{t('negativeSupersededBy', { id: detail.data.supersededById })}</dd></div>}
            <div><dt>{t('negativeDigest')}</dt><dd><code className="gov-code" title={detail.data.artifactDigest}>{shortDigest(detail.data.artifactDigest)}</code></dd></div>
          </dl>

          <div className="negative-exceptions">
            <h5>{t('negativeExceptions')}</h5>
            {detail.data.exceptions.length === 0 ? <p>{t('negativeNoExceptions')}</p> : detail.data.exceptions.map((exception) => { const expired = Date.parse(exception.expiresAt) < Date.now(); return <article key={exception.id}>
              <p>{exception.description}</p>
              <footer><span className={`surface-chip ${expired ? 'muted' : 'amber'}`}>{t(expired ? 'negativeExceptionExpired' : 'negativeExceptionExpires', { at: formatDate(exception.expiresAt, { dateStyle: 'medium' }) })}</span><span className="gov-meta">{t('negativeExceptionApproved', { name: exception.approvedBy })}</span></footer>
            </article> })}
          </div>

          <div className="gov-actions gov-actions-padded">
            {detail.data.reviewId && <button type="button" className="gov-button" onClick={() => onNavigatePath(routes.review(detail.data?.reviewId ?? ''))}>{t('negativeOpenReview')} <IconArrowUpRight /></button>}
            {detail.data.status !== 'WITHDRAWN' && <button type="button" className="gov-button danger" aria-expanded={withdrawOpen} onClick={() => setWithdrawOpen((current) => !current)}>{t('negativeWithdraw')}</button>}
          </div>

          {withdrawOpen && detail.data.status !== 'WITHDRAWN' && <div className="gov-form" role="group" aria-label={t('negativeWithdraw')}>
            <label className="gov-field"><span>{t('negativeWithdrawReason')}</span><textarea value={withdrawReason} onChange={(event) => setWithdrawReason(event.target.value)} placeholder={t('negativeWithdrawPlaceholder')} /></label>
            {withdrawError && <p className="gov-error" role="alert">{withdrawError}</p>}
            <div className="gov-actions">
              <button type="button" className="gov-button danger" disabled={working || withdrawReason.trim().length === 0} onClick={() => void withdraw(detail.data?.id ?? '')}>{working ? t('negativeWithdrawWorking') : t('negativeWithdrawConfirm')}</button>
              <button type="button" className="gov-button" onClick={() => setWithdrawOpen(false)}>{t('negativeWithdrawCancel')}</button>
            </div>
          </div>}
        </>}
      </aside>
    </div>
  </section>
}
