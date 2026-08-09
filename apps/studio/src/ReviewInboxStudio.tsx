import { useEffect, useMemo, useState } from 'react'
import type { ContractSummary, Principal, ReviewAssignment, ReviewRequestArtifact, ReviewRoutingPlan } from '@lattice/contracts'
import { apiFetch } from './api'
import { useResource } from './useResource'
import { EmptyState, ErrorState, LoadingState, MetricTile, Pagination, SurfaceHero } from './SurfaceState'
import { impactTone } from './formatters'
import { assignmentStatusMessageKeys, reviewDecisionMessageKeys, severityMessageKeys, useGovernanceMessages } from './i18n/messages.governance'
import { routes, type SurfaceId } from './router'
import { Toast } from './Toast'
import { IconAlertTriangle, IconArrowUpRight, IconChevronDown, IconInbox, IconSiren, IconUserCheck, IconUsers } from './icons'
import './governance.css'

/**
 * E12 — the workspace-wide Review Inbox. `ReviewQueueStudio` stays the per-contract claim board;
 * this is the steward's own queue across every contract (fixes G5), and it renders the approval
 * routing the evolution doc omits (§3.3.M): parallel vs sequential, quorum, out-of-office
 * delegation, SLA countdown, escalation.
 */

type InboxView = 'ASSIGNED' | 'ROLE' | 'SLA' | 'BLOCKED' | 'ALL'

interface ReviewInboxStudioProps {
  workspaceId?: string
  contracts: ContractSummary[]
  activeContractId: string
  detailId?: string
  onSelectContract: (contractId: string) => void
  onNavigate: (surface: SurfaceId, detailId?: string) => void
  onNavigatePath: (path: string) => void
}

const pageSize = 12
const views: readonly InboxView[] = ['ASSIGNED', 'ROLE', 'SLA', 'BLOCKED', 'ALL']

function assignmentsOf(review: ReviewRequestArtifact): ReviewAssignment[] {
  return review.routingPlan?.assignments ?? []
}

function minutesToDue(review: ReviewRequestArtifact): number | undefined {
  const dueAt = review.routingPlan?.dueAt
  if (!dueAt) return undefined
  const parsed = Date.parse(dueAt)
  return Number.isNaN(parsed) ? undefined : Math.round((parsed - Date.now()) / 60_000)
}

function isOverdue(review: ReviewRequestArtifact): boolean {
  const minutes = minutesToDue(review)
  return review.status === 'OPEN' && minutes !== undefined && minutes < 0
}

function mineByName(review: ReviewRequestArtifact, principalId: string): boolean {
  return assignmentsOf(review).some((assignment) => assignment.principalId === principalId || assignment.delegatedToPrincipalId === principalId)
}

function claimableByRole(review: ReviewRequestArtifact, roles: string[]): boolean {
  return assignmentsOf(review).some((assignment) => assignment.status === 'PENDING' && !assignment.principalId && roles.includes(assignment.role))
}

function blockingRole(review: ReviewRequestArtifact, principalId: string, roles: string[]): string | undefined {
  const blocker = assignmentsOf(review).find((assignment) => assignment.status === 'PENDING' && assignment.principalId !== principalId && assignment.delegatedToPrincipalId !== principalId && !(!assignment.principalId && roles.includes(assignment.role)))
  return blocker?.role
}

export function ReviewInboxStudio({ workspaceId, contracts, activeContractId, detailId, onSelectContract, onNavigate, onNavigatePath }: ReviewInboxStudioProps) {
  const { t, formatDate, formatNumber } = useGovernanceMessages()
  // "Assigned to me" needs a real identity, so it comes from the API rather than from the browser.
  const sessionResource = useResource<{ principal?: Principal }>('/v1/session')
  const session = useMemo(() => ({
    principalId: sessionResource.data?.principal?.id ?? '',
    roles: sessionResource.data?.principal?.roles ?? [],
  }), [sessionResource.data])
  const [view, setView] = useState<InboxView>('ASSIGNED')
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'DECIDED' | ''>('OPEN')
  const [roleFilter, setRoleFilter] = useState('')
  const [contractFilter, setContractFilter] = useState('')
  const [expandedId, setExpandedId] = useState(detailId ?? '')
  const [delegating, setDelegating] = useState('')
  const [delegateTo, setDelegateTo] = useState('')
  const [delegateReason, setDelegateReason] = useState('')
  const [delegateError, setDelegateError] = useState('')
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')
  const [page, setPage] = useState(0)

  const listPath = useMemo(() => {
    const params = new URLSearchParams()
    if (workspaceId) params.set('workspaceId', workspaceId)
    else params.set('contractId', activeContractId)
    if (roleFilter) params.set('assignedRole', roleFilter)
    if (statusFilter) params.set('status', statusFilter)
    return `/v1/reviews?${params.toString()}`
  }, [activeContractId, roleFilter, statusFilter, workspaceId])

  const reviews = useResource<ReviewRequestArtifact[]>(listPath)
  const principals = useResource<Principal[]>(delegating ? `/v1/principals${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}` : undefined, [workspaceId, delegating])
  const all = useMemo(() => reviews.data ?? [], [reviews.data])
  const scoped = useMemo(() => all.filter((review) => !contractFilter || review.contractId === contractFilter), [all, contractFilter])
  const roleOptions = useMemo(() => [...new Set(all.flatMap((review) => assignmentsOf(review).map((assignment) => assignment.role)))].sort(), [all])

  const visible = useMemo(() => {
    const matched = scoped.filter((review) => {
      if (view === 'ALL') return true
      if (view === 'ASSIGNED') return mineByName(review, session.principalId)
      if (view === 'ROLE') return claimableByRole(review, session.roles)
      if (view === 'SLA') return Boolean(review.routingPlan?.dueAt)
      return Boolean(blockingRole(review, session.principalId, session.roles))
    })
    return [...matched].sort((left, right) => {
      if (view === 'SLA') return Date.parse(left.routingPlan?.dueAt ?? '') - Date.parse(right.routingPlan?.dueAt ?? '')
      if (isOverdue(left) !== isOverdue(right)) return isOverdue(left) ? -1 : 1
      return Date.parse(right.submittedAt) - Date.parse(left.submittedAt)
    })
  }, [scoped, session.principalId, session.roles, view])

  const pageItems = visible.slice(page * pageSize, page * pageSize + pageSize)
  const assignedCount = scoped.filter((review) => mineByName(review, session.principalId)).length
  const roleCount = scoped.filter((review) => claimableByRole(review, session.roles)).length
  const overdueCount = scoped.filter(isOverdue).length
  const escalatedCount = scoped.filter((review) => Boolean(review.routingPlan?.escalatedAt)).length
  const filterKey = `${view}|${statusFilter}|${roleFilter}|${contractFilter}`

  useEffect(() => { setPage(0) }, [filterKey])
  useEffect(() => { if (detailId) setExpandedId(detailId) }, [detailId])

  function slaLabel(minutes: number): string {
    const absolute = Math.abs(minutes)
    if (absolute >= 2880) return t(minutes < 0 ? 'inboxOverdueByDays' : 'inboxDueInDays', { days: Math.round(absolute / 1440) })
    return t(minutes < 0 ? 'inboxOverdueBy' : 'inboxDueIn', { hours: Math.max(1, Math.round(absolute / 60)) })
  }

  function contractName(contractId: string): string {
    return contracts.find((contract) => contract.contractId === contractId)?.name ?? t('inboxUnknownContract')
  }

  function openDelegation(reviewId: string, role: string) {
    setDelegating((current) => current === `${reviewId}|${role}` ? '' : `${reviewId}|${role}`)
    setDelegateTo('')
    setDelegateReason('')
    setDelegateError('')
  }

  async function submitDelegation(reviewId: string, role: string) {
    if (!delegateTo || !delegateReason.trim()) { setDelegateError(t('inboxDelegateFailed')); return }
    setWorking(true)
    setDelegateError('')
    try {
      await apiFetch(`/v1/reviews/${encodeURIComponent(reviewId)}/delegate`, { method: 'POST', json: { role, toPrincipalId: delegateTo, reason: delegateReason.trim() } })
      const chosen = (principals.data ?? []).find((principal) => principal.id === delegateTo)
      setNotice(t('inboxDelegateDone', { role, name: chosen?.displayName ?? delegateTo }))
      setDelegating('')
      reviews.reload()
    } catch (caught) {
      setDelegateError(caught instanceof Error ? caught.message : t('inboxDelegateFailed'))
    } finally {
      setWorking(false)
    }
  }

  const emptyDescription = view === 'ASSIGNED' ? t('inboxEmptyAssigned') : view === 'ROLE' ? t('inboxEmptyRole') : view === 'SLA' ? t('inboxEmptySla') : view === 'BLOCKED' ? t('inboxEmptyBlocked') : t('inboxEmptyAll')

  return <section className="inbox-page">
    <SurfaceHero kicker={t('inboxKicker').toLocaleUpperCase()} title={t('inboxTitle')} description={t('inboxDescription')}><button className="ghost" onClick={() => onNavigate('contracts')}>{t('inboxContractLabel')}</button></SurfaceHero>
    {notice && <Toast message={notice} closeLabel={t('inboxClose')} onDismiss={() => setNotice('')} tone="success" />}
    <div className="surface-metrics">
      <MetricTile label={t('inboxMetricAssigned')} value={formatNumber(assignedCount)} meta={t('inboxMetricAssignedMeta')} tone="info" onClick={() => setView('ASSIGNED')} />
      <MetricTile label={t('inboxMetricRole')} value={formatNumber(roleCount)} meta={t('inboxMetricRoleMeta')} tone="governance" onClick={() => setView('ROLE')} />
      <MetricTile label={t('inboxMetricOverdue')} value={formatNumber(overdueCount)} meta={t('inboxMetricOverdueMeta')} tone="danger" onClick={() => setView('SLA')} />
      <MetricTile label={t('inboxMetricEscalated')} value={formatNumber(escalatedCount)} meta={t('inboxMetricEscalatedMeta')} tone="warning" onClick={() => setView('ALL')} />
    </div>

    <div className="gov-panel">
      <div className="inbox-views" role="group" aria-label={t('inboxViews')}>{views.map((item) => <button type="button" key={item} aria-pressed={view === item} onClick={() => setView(item)}>{t(item === 'ASSIGNED' ? 'inboxViewAssigned' : item === 'ROLE' ? 'inboxViewRole' : item === 'SLA' ? 'inboxViewSla' : item === 'BLOCKED' ? 'inboxViewBlocked' : 'inboxViewAll')}</button>)}</div>
      <div className="surface-filters" role="group" aria-label={t('inboxViews')}>
        <label>{t('inboxStatus')}<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'OPEN' | 'DECIDED' | '')}><option value="">{t('inboxStatusAll')}</option><option value="OPEN">{t('inboxStatusOpen')}</option><option value="DECIDED">{t('inboxStatusDecided')}</option></select></label>
        <label>{t('inboxRole')}<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">{t('inboxRoleAll')}</option>{roleOptions.map((role) => <option value={role} key={role}>{role}</option>)}</select></label>
        <label>{t('inboxContractFilter')}<select value={contractFilter} onChange={(event) => setContractFilter(event.target.value)}><option value="">{t('inboxContractAll')}</option>{contracts.map((contract) => <option value={contract.contractId} key={contract.contractId}>{contract.name}</option>)}</select></label>
        <span className="gov-meta" role="status" aria-live="polite">{t('inboxLive', { count: visible.length })}</span>
      </div>

      {reviews.status === 'LOADING' && <LoadingState label={t('inboxLoading')} />}
      {reviews.status === 'ERROR' && <ErrorState title={t('inboxErrorTitle')} detail={reviews.error} retryLabel={t('eligibilityRetry')} onRetry={reviews.reload} />}
      {reviews.status === 'READY' && visible.length === 0 && <EmptyState title={t('inboxEmptyTitle')} description={emptyDescription} icon={<IconInbox />} actionLabel={t('inboxViewAll')} onAction={() => setView('ALL')} />}

      {pageItems.length > 0 && <div className="inbox-list">{pageItems.map((review) => {
        const expanded = expandedId === review.id
        const overdue = isOverdue(review)
        const minutes = minutesToDue(review)
        const plan = review.routingPlan
        const blocked = blockingRole(review, session.principalId, session.roles)
        return <div className={`inbox-row ${overdue ? 'overdue' : ''}`} key={review.id}>
          <button type="button" className="inbox-summary" aria-expanded={expanded} aria-label={t('inboxExpand', { label: review.targetLabel })} onClick={() => setExpandedId((current) => current === review.id ? '' : review.id)}>
            <span>
              <b className="inbox-title">{review.targetLabel}</b>
              <span className="inbox-summary-meta">
                <span className="surface-chip info">{contractName(review.contractId)}</span>
                <span className={`surface-chip ${impactTone(review.impact)}`}>{t(severityMessageKeys[review.impact])}</span>
                {plan && <span className="surface-chip governance">{t(plan.routing === 'PARALLEL' ? 'inboxRoutingParallel' : 'inboxRoutingSequential')}</span>}
                {plan && <span className="surface-chip neutral">{t('inboxQuorum', { approved: plan.assignments.filter((assignment) => assignment.status === 'APPROVED').length, quorum: plan.quorum })}</span>}
                {minutes !== undefined && <span className={`surface-chip ${overdue ? 'danger' : 'warning'}`}>{slaLabel(minutes)}</span>}
                {plan?.escalatedAt && plan.escalateToRole && <span className="surface-chip danger"><IconSiren /> {t('inboxEscalated', { role: plan.escalateToRole })}</span>}
                {blocked && <span className="surface-chip neutral">{t('inboxBlockedBy', { role: blocked })}</span>}
                {review.decision && <span className="surface-chip success">{t('inboxDecidedBy', { decision: t(reviewDecisionMessageKeys[review.decision.decision]), name: review.decision.decidedBy })}</span>}
              </span>
            </span>
            <span className="inbox-summary-right"><time dateTime={review.submittedAt}>{formatDate(review.submittedAt, { dateStyle: 'short', timeStyle: 'short' })}</time><IconChevronDown className="inbox-chevron" /></span>
          </button>
          {expanded && <div className="inbox-detail">
            <p className="gov-meta">{t('inboxSubmitted', { name: review.submittedBy })}</p>
            {plan ? <RoutingPlanView plan={plan} reviewId={review.id} delegating={delegating} delegateTo={delegateTo} delegateReason={delegateReason} delegateError={delegateError} working={working} principals={principals.data ?? []} onOpenDelegation={openDelegation} onDelegateTo={setDelegateTo} onDelegateReason={setDelegateReason} onSubmitDelegation={(role) => void submitDelegation(review.id, role)} /> : <p className="gov-inline-empty">{t('inboxNoRouting')}</p>}
            <div className="gov-actions">
              <button type="button" className="gov-button primary" onClick={() => onNavigatePath(routes.review(review.id))}>{t('inboxOpenReview')} <IconArrowUpRight /></button>
              <button type="button" className="gov-button" onClick={() => { onSelectContract(review.contractId); onNavigate('reviews') }}>{t('inboxOpenContract', { name: contractName(review.contractId) })}</button>
            </div>
          </div>}
        </div>
      })}</div>}

      {visible.length > 0 && <Pagination page={page} pageSize={pageSize} total={visible.length} onPage={(next) => setPage(Math.max(0, next))} labels={{ previous: t('inboxPrevious'), next: t('inboxNext'), range: (from, to, total) => t('inboxRange', { from, to, total }) }} />}
    </div>
  </section>
}

interface RoutingPlanViewProps {
  plan: ReviewRoutingPlan
  reviewId: string
  delegating: string
  delegateTo: string
  delegateReason: string
  delegateError: string
  working: boolean
  principals: Principal[]
  onOpenDelegation: (reviewId: string, role: string) => void
  onDelegateTo: (principalId: string) => void
  onDelegateReason: (reason: string) => void
  onSubmitDelegation: (role: string) => void
}

function RoutingPlanView({ plan, reviewId, delegating, delegateTo, delegateReason, delegateError, working, principals, onOpenDelegation, onDelegateTo, onDelegateReason, onSubmitDelegation }: RoutingPlanViewProps) {
  const { t, formatDate } = useGovernanceMessages()
  const approved = plan.assignments.filter((assignment) => assignment.status === 'APPROVED').length
  const ordered = [...plan.assignments].sort((left, right) => left.order - right.order)

  return <div className="inbox-routing">
    <header>
      <span className="surface-chip governance"><IconUsers /> {t(plan.routing === 'PARALLEL' ? 'inboxRoutingParallel' : 'inboxRoutingSequential')}</span>
      <span className="gov-meta">{t('inboxQuorum', { approved, quorum: plan.quorum })}</span>
      <span className="inbox-quorum-bar" aria-hidden="true">{Array.from({ length: Math.max(plan.quorum, 1) }, (_, index) => <i className={index < approved ? 'filled' : ''} key={index} />)}</span>
      <span className="gov-meta">{t('inboxSla', { hours: plan.slaHours, at: formatDate(plan.dueAt, { dateStyle: 'short', timeStyle: 'short' }) })}</span>
      {plan.escalateToRole && <span className={`surface-chip ${plan.escalatedAt ? 'danger' : 'neutral'}`}><IconAlertTriangle /> {t(plan.escalatedAt ? 'inboxEscalated' : 'inboxEscalationSet', { role: plan.escalateToRole })}</span>}
    </header>
    <h5 className="gov-kicker">{t('inboxAssignments')}</h5>
    {ordered.map((assignment) => {
      const key = `${reviewId}|${assignment.role}`
      const delegate = principals.find((principal) => principal.id === assignment.delegatedToPrincipalId)
      return <div key={`${assignment.role}:${assignment.order}`}>
        <div className="inbox-assignment">
          <span className="surface-chip neutral">{t('inboxStep', { order: assignment.order })}</span>
          <span><b>{assignment.role}</b><small>{assignment.delegatedToPrincipalId ? t('inboxDelegatedTo', { name: delegate?.displayName ?? assignment.delegatedToPrincipalId }) : assignment.principalId ? assignment.principalId : t('inboxUnclaimed')}{assignment.decidedAt ? ` · ${formatDate(assignment.decidedAt, { dateStyle: 'short', timeStyle: 'short' })}` : ''}</small></span>
          <span className="gov-actions">
            <span className={`surface-chip ${assignment.status === 'APPROVED' ? 'success' : assignment.status === 'REJECTED' ? 'danger' : assignment.status === 'DELEGATED' ? 'info' : 'neutral'}`}>{t(assignmentStatusMessageKeys[assignment.status])}</span>
            {assignment.status === 'PENDING' && <button type="button" className="gov-button" aria-expanded={delegating === key} onClick={() => onOpenDelegation(reviewId, assignment.role)}><IconUserCheck /> {t('inboxDelegate')}</button>}
          </span>
        </div>
        {delegating === key && <div className="gov-form" role="group" aria-label={t('inboxDelegateTitle', { role: assignment.role })}>
          <span className="gov-kicker">{t('inboxDelegateTitle', { role: assignment.role })}</span>
          {principals.length === 0
            ? <p className="gov-inline-empty">{t('inboxNoPrincipals')}</p>
            : <label className="gov-field"><span>{t('inboxDelegateTo')}</span><select value={delegateTo} onChange={(event) => onDelegateTo(event.target.value)}><option value="">{t('inboxDelegateChoose')}</option>{principals.map((principal) => <option value={principal.id} key={principal.id}>{principal.displayName} · {principal.roles.join(', ')}</option>)}</select></label>}
          <label className="gov-field"><span>{t('inboxDelegateReason')}</span><textarea value={delegateReason} onChange={(event) => onDelegateReason(event.target.value)} placeholder={t('inboxDelegateReasonPlaceholder')} /></label>
          {delegateError && <p className="gov-error" role="alert">{delegateError}</p>}
          <div className="gov-actions">
            <button type="button" className="gov-button primary" disabled={working || !delegateTo || delegateReason.trim().length === 0} onClick={() => onSubmitDelegation(assignment.role)}>{working ? t('inboxDelegateWorking') : t('inboxDelegateSubmit')}</button>
            <button type="button" className="gov-button" onClick={() => onOpenDelegation(reviewId, assignment.role)}>{t('inboxDelegateCancel')}</button>
          </div>
        </div>}
      </div>
    })}
  </div>
}
