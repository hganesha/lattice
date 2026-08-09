import type { ReactNode } from 'react'
import type { Tone } from './formatters'
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

/**
 * One fact about the object the surface is acting on — its version pin, its
 * release state, the scope it inherits from.
 *
 * A hero that only carries the feature's name and slogan is the same on every
 * visit; it cannot tell you *which* contract you are editing policies for, at
 * what version, or whether it is published. The facts strip is what makes the
 * bar context-aware, so it holds only what changes with the object.
 */
export interface HeroFact {
  label: string
  value: string
  tone?: Tone
}

interface SurfaceHeroProps {
  kicker: string
  /** The object being acted on, wherever the surface has one — the contract or
   * ontology name, not a restatement of the page title the app header already
   * shows. */
  title: string
  description?: string
  facts?: readonly HeroFact[]
  /** Names the semantic role the surface belongs to; see `.surface-hero` in surface-kit.css. */
  tint?: 'governance' | 'info' | 'warning' | 'none'
  children?: ReactNode
}

export function SurfaceHero({ kicker, title, description, facts, tint, children }: SurfaceHeroProps) {
  return <div className={tint ? `surface-hero tint-${tint}` : 'surface-hero'}>
    <div>
      <span className="panel-kicker">{kicker}</span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {facts && facts.length > 0 && <dl className="surface-hero-facts">
        {facts.map((fact) => <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.tone && <i className={`mini-dot ${fact.tone}`} aria-hidden="true" />}{fact.value}</dd>
        </div>)}
      </dl>}
    </div>
    {children && <div className="surface-hero-actions">{children}</div>}
  </div>
}

interface IconChicletProps {
  icon: ReactNode
  /** The button's name. Shown on hover and keyboard focus, and always exposed to
   * assistive tech — an icon-only control that carries its label only in a
   * tooltip is unnamed to anyone who cannot hover. */
  label: string
  onClick: () => void
  pressed?: boolean
  className?: string
}

/**
 * A square icon-only control with a deferred label.
 *
 * The page header ran six text buttons — Intro, Help, theme, text size, density,
 * Share view — none of which is a decision the page is asking you to make, and
 * together they crowded out the one line that names the contract. Icon chiclets
 * put that space back; the tooltip (`data-tooltip`, drawn in CSS) and the
 * aria-label keep the names reachable by pointer, keyboard and screen reader.
 */
export function IconChiclet({ icon, label, onClick, pressed, className }: IconChicletProps) {
  return <button
    type="button"
    className={`ghost icon-chiclet${className ? ` ${className}` : ''}`}
    aria-label={label}
    data-tooltip={label}
    {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
    onClick={onClick}
  >
    {icon}
  </button>
}

interface MetricTileProps {
  label: string
  value: string
  meta: string
  tone?: Tone
  onClick?: () => void
}

export function MetricTile({ label, value, meta, tone = 'info', onClick }: MetricTileProps) {
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
