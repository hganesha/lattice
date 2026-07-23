import { useState } from 'react'
import { IconChevronLeft, IconChevronRight } from './icons'

interface PanelCollapseButtonProps {
  collapsed: boolean
  collapseLabel: string
  expandLabel: string
  panelId: string
  side: 'left' | 'right'
  onToggle: () => void
}

export function PanelCollapseButton({
  collapsed,
  collapseLabel,
  expandLabel,
  panelId,
  side,
  onToggle,
}: PanelCollapseButtonProps) {
  const label = collapsed ? expandLabel : collapseLabel
  const pointsLeft = side === 'right' ? collapsed : !collapsed

  return <button
    type="button"
    className="panel-collapse-button"
    aria-controls={panelId}
    aria-expanded={!collapsed}
    aria-label={label}
    title={label}
    onClick={onToggle}
  >
    {pointsLeft ? <IconChevronLeft /> : <IconChevronRight />}
  </button>
}

export function usePersistentCollapsed(storageKey: string) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) === 'true'
    } catch {
      return false
    }
  })

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current
      try {
        window.localStorage.setItem(storageKey, String(next))
      } catch {
        // Keep the in-memory preference when browser storage is unavailable.
      }
      return next
    })
  }

  return { collapsed, toggleCollapsed }
}
