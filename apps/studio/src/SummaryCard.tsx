interface SummaryCardProps {
  label: string
  value: string
  meta: string
  tone: string
}

export function SummaryCard({ label, value, meta, tone }: SummaryCardProps) {
  return <div className="summary-card"><div className="summary-label">{label}<span className={`mini-dot ${tone}`}/></div><div className="summary-value">{value}</div><div className="summary-meta">{meta}</div></div>
}
