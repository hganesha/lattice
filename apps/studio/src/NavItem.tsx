import type { ReactNode } from 'react'

interface NavItemProps {
  icon: ReactNode
  label: string
  active?: boolean
  count?: string | undefined
  onClick?: () => void
}

export function NavItem({ icon, label, active, count, onClick }: NavItemProps) {
  return <button className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} title={label} onClick={onClick}><span className="nav-icon" aria-hidden="true">{icon}</span><span>{label}</span>{count && <em>{count}</em>}</button>
}
