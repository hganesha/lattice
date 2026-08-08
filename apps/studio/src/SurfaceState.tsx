import type { ReactNode } from 'react'
import { IconLoader } from './icons'

/**
 * Shared empty / loading / error / pagination primitives for every surface (E20).
 *
 * The empty state always names the missing prerequisite and offers the action that
 * resolves it — replacing the silent redirect at App.tsx:301 (G8).
 */

interface EmptyStateProps {
  title: string
  description: string
  icon?: ReactNode
  actionLabel?: string
  onAction?: () => void
  /** Keeps the action visible but inert. An empty state whose action is hidden
   * when unavailable stops explaining what the surface is for — the user cannot
   * tell the difference between "not yet" and "never". */
  actionDisabled?: boolean
  secondaryLabel?: string
  onSecondary?: () => void
  secondaryDisabled?: boolean
}

export function EmptyState({ title, description, icon, actionLabel, onAction, actionDisabled, secondaryLabel, onSecondary, secondaryDisabled }: EmptyStateProps) {
  return <div className="surface-state empty">
    {icon && <span className="surface-state-icon" aria-hidden="true">{icon}</span>}
    <h3>{title}</h3>
    <p>{description}</p>
    {(actionLabel || secondaryLabel) && <div className="surface-state-actions">
      {actionLabel && onAction && <button className="release" onClick={onAction} disabled={actionDisabled}>{actionLabel}</button>}
      {secondaryLabel && onSecondary && <button className="ghost" onClick={onSecondary} disabled={secondaryDisabled}>{secondaryLabel}</button>}
    </div>}
  </div>
}

export function LoadingState({ label }: { label: string }) {
  return <div className="surface-state loading" role="status" aria-live="polite"><span className="surface-state-icon" aria-hidden="true"><IconLoader /></span><h3>{label}</h3></div>
}

interface ErrorStateProps {
  title: string
  detail: string
  retryLabel?: string
  onRetry?: () => void
}

export function ErrorState({ title, detail, retryLabel, onRetry }: ErrorStateProps) {
  return <div className="surface-state error" role="alert"><span className="surface-state-icon" aria-hidden="true">!</span><h3>{title}</h3><p>{detail}</p>{retryLabel && onRetry && <div className="surface-state-actions"><button className="ghost" onClick={onRetry}>{retryLabel}</button></div>}</div>
}

interface SurfaceHeroProps {
  kicker: string
  title: string
  description: string
  children?: ReactNode
}

export function SurfaceHero({ kicker, title, description, children }: SurfaceHeroProps) {
  return <div className="surface-hero"><div><span className="panel-kicker">{kicker}</span><h2>{title}</h2><p>{description}</p></div>{children && <div className="surface-hero-actions">{children}</div>}</div>
}

interface MetricTileProps {
  label: string
  value: string
  meta: string
  tone?: 'amber' | 'blue' | 'green' | 'lime' | 'violet' | 'red'
  onClick?: () => void
}

export function MetricTile({ label, value, meta, tone = 'blue', onClick }: MetricTileProps) {
  const body = <><div><span>{label}</span><i className={`mini-dot ${tone}`} /></div><b>{value}</b><small>{meta}</small></>
  if (onClick) return <button className="surface-metric actionable" onClick={onClick} type="button">{body}</button>
  return <div className="surface-metric">{body}</div>
}

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  labels: { previous: string; next: string; range: (from: number, to: number, total: number) => string }
}

/** Real pagination — the prototype's `max-h-[640px]` scroll collapses at the scale it claims (§4.2). */
export function Pagination({ page, pageSize, total, onPage, labels }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)
  return <div className="surface-pagination"><span>{labels.range(from, to, total)}</span><div><button className="ghost" onClick={() => onPage(page - 1)} disabled={page <= 0}>{labels.previous}</button><button className="ghost" onClick={() => onPage(page + 1)} disabled={page + 1 >= pageCount}>{labels.next}</button></div></div>
}
