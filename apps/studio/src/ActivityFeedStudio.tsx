import { useMemo, useState } from 'react'
import type { ActivityEvent, ActivityKind, ContextContract, ImpactLevel } from '@lattice/contracts'
import { EmptyState, ErrorState, LoadingState, MetricTile, SurfaceHero } from './SurfaceState'
import { useResource } from './useResource'
import { impactTone } from './formatters'
import { IconActivity, IconArrowUpRight } from './icons'
import { activityKindMessageKeys, severityMessageKeys, useIdentityMessages } from './i18n/messages.identity'

interface ActivityFeedStudioProps {
  workspaceId?: string
  contract: ContextContract
  onNavigatePath: (path: string) => void
}

const ACTIVITY_LIMIT = 60
const severities: readonly ImpactLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const

/**
 * One merged stream across every governed artifact (E21). "Awaiting me" leads, because the only
 * question a steward opens this surface with is what is blocked on them.
 */
export function ActivityFeedStudio({ workspaceId, contract, onNavigatePath }: ActivityFeedStudioProps) {
  const { t, formatDate } = useIdentityMessages()
  const [kind, setKind] = useState<ActivityKind | 'ALL'>('ALL')
  const [severity, setSeverity] = useState<ImpactLevel | 'ALL'>('ALL')
  const query = new URLSearchParams({ limit: String(ACTIVITY_LIMIT), ...(workspaceId ? { workspaceId } : {}), ...(workspaceId ? {} : { contractId: contract.id }) })
  const events = useResource<ActivityEvent[]>(`/v1/activity?${query.toString()}`)
  const all = useMemo(() => events.data ?? [], [events.data])
  const kinds = useMemo(() => [...new Set(all.map((event) => event.kind))].sort(), [all])
  const visible = all.filter((event) => (kind === 'ALL' || event.kind === kind) && (severity === 'ALL' || event.severity === severity))
  const awaiting = visible.filter((event) => event.awaitingMe)
  const rest = visible.filter((event) => !event.awaitingMe)
  const filtered = kind !== 'ALL' || severity !== 'ALL'

  return <section className="activity-page">
    <SurfaceHero kicker={t('activityKicker')} title={t('activityTitle')} description={t('activityDescription')}>
      <button className="ghost" onClick={events.reload}>{t('activityReload')}</button>
    </SurfaceHero>

    <div className="surface-metrics">
      <MetricTile label={t('activityMetricEvents')} value={String(all.length)} meta={t('activityMetricEventsMeta', { limit: ACTIVITY_LIMIT })} tone="info" />
      <MetricTile label={t('activityMetricAwaiting')} value={String(all.filter((event) => event.awaitingMe).length)} meta={t('activityMetricAwaitingMeta')} tone="warning" />
      <MetricTile label={t('activityMetricCritical')} value={String(all.filter((event) => event.severity === 'CRITICAL').length)} meta={t('activityMetricCriticalMeta')} tone="danger" />
      <MetricTile label={t('activityMetricKinds')} value={String(kinds.length)} meta={t('activityMetricKindsMeta')} tone="brand" />
    </div>

    {events.status === 'LOADING' && <LoadingState label={t('activityLoading')} />}
    {events.status === 'ERROR' && <ErrorState title={t('activityErrorTitle')} detail={events.error} retryLabel={t('commonRetry')} onRetry={events.reload} />}

    {events.status === 'READY' && all.length === 0 && <EmptyState title={t('activityEmptyTitle')} description={t('activityEmptyDescription')} icon={<IconActivity />} />}

    {events.status === 'READY' && all.length > 0 && <>
      <div className="surface-filters" aria-live="polite">
        <label htmlFor="activity-kind">{t('activityFilterKind')}<select id="activity-kind" value={kind} onChange={(event) => setKind(event.target.value as ActivityKind | 'ALL')}><option value="ALL">{t('activityFilterAll')}</option>{kinds.map((item) => <option value={item} key={item}>{t(activityKindMessageKeys[item])}</option>)}</select></label>
        <label htmlFor="activity-severity">{t('activityFilterSeverity')}<select id="activity-severity" value={severity} onChange={(event) => setSeverity(event.target.value as ImpactLevel | 'ALL')}><option value="ALL">{t('activityFilterAll')}</option>{severities.map((item) => <option value={item} key={item}>{t(severityMessageKeys[item])}</option>)}</select></label>
        {filtered && <button className="ghost" onClick={() => { setKind('ALL'); setSeverity('ALL') }}>{t('activityClearFilters')}</button>}
        <span className="spacer" />
        <span>{t('activityUpdated', { count: visible.length })}</span>
      </div>

      <section className="activity-panel panel">
        <header><div><span className="panel-kicker">{t('activityAwaitingKicker')}</span><h2>{t('activityAwaitingTitle')}</h2><p>{t('activityAwaitingDescription')}</p></div></header>
        {awaiting.length === 0 ? <p className="activity-empty-line">{t('activityAwaitingEmpty')}</p> : <ul className="activity-list awaiting">{awaiting.map((event) => <ActivityRow event={event} onOpen={onNavigatePath} key={event.id} />)}</ul>}
      </section>

      <section className="activity-panel panel">
        <header><div><span className="panel-kicker">{t('activityStreamKicker')}</span><h2>{t('activityStreamTitle')}</h2></div></header>
        {rest.length === 0
          ? <EmptyState title={t('activityNoMatchTitle')} description={t('activityNoMatchDescription')} icon={<IconActivity />} />
          : <ul className="activity-list">{rest.map((event) => <ActivityRow event={event} onOpen={onNavigatePath} key={event.id} />)}</ul>}
      </section>
    </>}
  </section>

  function ActivityRow({ event, onOpen }: { event: ActivityEvent; onOpen: (path: string) => void }) {
    return <li className="activity-row">
      <button onClick={() => onOpen(event.route)} aria-label={t('activityOpen', { title: event.title })}>
        <span className={`surface-chip ${event.severity ? impactTone(event.severity) : 'neutral'}`}>{t(activityKindMessageKeys[event.kind])}</span>
        <span className="activity-body"><b>{event.title}</b><small>{event.detail}</small></span>
        <span className="activity-meta">
          {event.actor && <em>{t('activityActor', { actor: event.actor })}</em>}
          <time dateTime={event.at}>{formatDate(event.at, { dateStyle: 'medium', timeStyle: 'short' })}</time>
        </span>
        <span className="activity-open" aria-hidden="true"><IconArrowUpRight /></span>
      </button>
    </li>
  }
}
