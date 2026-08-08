import { useState } from 'react'
import type { BlastRadius } from '@lattice/contracts'
import { useResource } from './useResource'
import { ErrorState, LoadingState } from './SurfaceState'
import { impactTone } from './formatters'
import { blastDependentMessageKeys, severityMessageKeys, useGovernanceMessages } from './i18n/messages.governance'
import { IconArrowUpRight, IconChevronDown, IconNetwork } from './icons'
import './governance.css'

/**
 * E17 — blast radius, mounted inside the review decision panel. A reviewer approving a binding
 * change sees what depends on it and what breaks *before* deciding; without it the learning-loop
 * proposals of §3.3.L are unreviewable.
 */

interface BlastRadiusPanelProps {
  reviewId: string
  onNavigatePath: (path: string) => void
}

export function BlastRadiusPanel({ reviewId, onNavigatePath }: BlastRadiusPanelProps) {
  const { t, formatDate, formatNumber } = useGovernanceMessages()
  const [open, setOpen] = useState(true)
  const radius = useResource<BlastRadius>(reviewId ? `/v1/reviews/${encodeURIComponent(reviewId)}/blast-radius` : undefined, [reviewId])
  const data = radius.data
  const empty = Boolean(data) && (data?.dependents.length ?? 0) === 0 && (data?.affectedDispositions ?? 0) === 0

  return <section className="blast-panel" aria-label={t('blastTitle')}>
    <header>
      <div><span className="gov-kicker">{t('blastKicker')}</span><h4>{t('blastTitle')}</h4></div>
      <button type="button" className="gov-button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{t('blastExpand')} <IconChevronDown /></button>
    </header>

    {open && <>
      {radius.status === 'LOADING' && <LoadingState label={t('blastLoading')} />}
      {radius.status === 'ERROR' && <ErrorState title={t('blastErrorTitle')} detail={radius.error} retryLabel={t('blastRetry')} onRetry={radius.reload} />}
      {data && empty && <div className="gov-inline-empty"><b>{t('blastEmptyTitle')}</b><p>{t('blastEmptyDescription')}</p></div>}
      {data && !empty && <>
        <p className="blast-summary">{data.summary}</p>
        <div className="blast-counts">
          <div><span>{t('blastDependents')}</span><b>{formatNumber(data.dependents.length)}</b><small>{t('blastDependentsMeta')}</small></div>
          <div><span>{t('blastAffected')}</span><b>{formatNumber(data.affectedDispositions)}</b><small>{t('blastAffectedMeta')}</small></div>
          <div><span>{t('blastHighRisk')}</span><b>{formatNumber(data.highRiskAffected)}</b><small>{t('blastHighRiskMeta')}</small></div>
        </div>
        {data.dependents.length > 0 && <div className="blast-dependents">{data.dependents.map((dependent) => <button type="button" className="blast-dependent" key={`${dependent.kind}:${dependent.id}`} aria-label={t('blastOpen', { label: dependent.label })} onClick={() => onNavigatePath(dependent.route)}>
          <span className={`surface-chip ${impactTone(dependent.impact)}`}>{t(severityMessageKeys[dependent.impact])}</span>
          <span><b>{dependent.label}</b><small className="gov-code">{t(blastDependentMessageKeys[dependent.kind])} · {dependent.id}</small></span>
          <IconArrowUpRight />
        </button>)}</div>}
        <p className="gov-note"><IconNetwork /> {t('blastComputed', { at: formatDate(data.computedAt, { dateStyle: 'medium', timeStyle: 'short' }) })}</p>
      </>}
    </>}
  </section>
}
