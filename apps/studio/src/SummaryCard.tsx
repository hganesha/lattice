interface SummaryCardProps {
  label: string
  value: string
  meta: string
  tone: string
  /** Click-through to the surface this card summarizes, filtered (E23). */
  onClick?: () => void
  actionLabel?: string
}

export function SummaryCard({ label, value, meta, tone, onClick, actionLabel }: SummaryCardProps) {
  const body = <><div className="summary-label">{label}<span className={`mini-dot ${tone}`}/></div><div className="summary-value">{value}</div><div className="summary-meta">{meta}</div></>
  if (!onClick) return <div className="summary-card">{body}</div>
  return <button className="summary-card actionable" onClick={onClick} type="button" aria-label={actionLabel ?? `${label}: ${value}`}>{body}</button>
}
