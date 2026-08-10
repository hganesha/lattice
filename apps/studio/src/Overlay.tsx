import { useEffect, useId, useRef, type ReactNode } from 'react'
import { IconX } from './icons'
import './overlay.css'

/**
 * The one overlay. Replaces ~12 hand-rolled backdrops that each re-implemented
 * their own blur, focus handling, Esc-to-close and animation — and that used
 * the same shape (a centred modal) for actions that wanted three different
 * shapes. This is the grammar, not just the chrome:
 *
 *   drawer   Edit or inspect one record while the list behind it stays the
 *            point of orientation. Slides in from the right.
 *   dialog   A focused decision that must own the screen — create, confirm,
 *            publish. Centred, sized to its content.
 *   command  Search / jump. Anchored near the top.
 *
 * One backdrop, one focus trap, one scroll lock, one entrance/exit pair.
 *
 * Two modes:
 *   · default   Overlay owns the panel — a header (title + single close), a
 *               scrolling body, and an optional sticky footer. New editors and
 *               dialogs should use this and stop hand-rolling chrome.
 *   · bare      A behaviour-only wrapper: it supplies the backdrop, focus trap,
 *               scroll lock and Esc, and the child brings its own panel element
 *               (and its own role/aria). This is how a complex existing layout —
 *               a multi-column wizard — adopts the shared backdrop without being
 *               rebuilt.
 */
export type OverlayVariant = 'drawer' | 'dialog' | 'command'

interface OverlayProps {
  variant: OverlayVariant
  onClose: () => void
  children: ReactNode
  /** Header title (default mode). */
  title?: ReactNode
  /** Small label above the title. */
  eyebrow?: ReactNode
  /** Trailing header content — a status pill, a secondary action. */
  headerAccessory?: ReactNode
  /** Sticky footer, typically the primary/secondary buttons. */
  footer?: ReactNode
  role?: 'dialog' | 'alertdialog'
  closeLabel?: string
  /** Override the variant's default panel width (default mode only). */
  width?: string
  /** Extra class on the panel (default mode) or backdrop (bare mode). */
  panelClassName?: string
  /** Behaviour-only wrapper: the child is the panel. */
  bare?: boolean
  /** Backdrop click closes. Off for flows mid-edit that shouldn't lose work on a stray click. */
  dismissOnBackdrop?: boolean
}

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Overlay({
  variant,
  onClose,
  children,
  title,
  eyebrow,
  headerAccessory,
  footer,
  role = 'dialog',
  closeLabel = 'Close',
  width,
  panelClassName,
  bare = false,
  dismissOnBackdrop = true,
}: OverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const returnFocusTo = useRef<Element | null>(null)
  const headingId = useId()

  // Focus enters the overlay on open and returns to the trigger on close, so
  // keyboard and screen-reader users are never dropped back at the document top.
  useEffect(() => {
    returnFocusTo.current = document.activeElement
    const container = containerRef.current
    const first = container?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? container)?.focus()
    return () => { if (returnFocusTo.current instanceof HTMLElement) returnFocusTo.current.focus() }
  }, [])

  // Body scroll lock: an open overlay should not scroll the page underneath it.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  // Esc closes; Tab is trapped inside the overlay.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const container = containerRef.current
      if (!container) return
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) { event.preventDefault(); return }
      const firstElement = focusable[0]!
      const lastElement = focusable[focusable.length - 1]!
      const active = document.activeElement
      if (event.shiftKey && active === firstElement) { event.preventDefault(); lastElement.focus() }
      else if (!event.shiftKey && active === lastElement) { event.preventDefault(); firstElement.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const onBackdropMouseDown = (event: React.MouseEvent) => {
    if (dismissOnBackdrop && event.target === event.currentTarget) onClose()
  }

  if (bare) {
    return (
      <div
        ref={containerRef}
        className={`overlay-backdrop ${variant}${panelClassName ? ` ${panelClassName}` : ''}`}
        role="presentation"
        onMouseDown={onBackdropMouseDown}
      >
        {children}
      </div>
    )
  }

  const panelStyle = width ? { width } : undefined
  return (
    <div ref={containerRef} className={`overlay-backdrop ${variant}`} role="presentation" onMouseDown={onBackdropMouseDown}>
      <div
        className={`overlay-panel ${variant}${panelClassName ? ` ${panelClassName}` : ''}`}
        role={role}
        aria-modal="true"
        aria-labelledby={title ? headingId : undefined}
        tabIndex={-1}
        style={panelStyle}
      >
        {(title || headerAccessory) && (
          <header className="overlay-header">
            <div className="overlay-heading">
              {eyebrow && <span className="overlay-eyebrow">{eyebrow}</span>}
              {title && <h2 id={headingId} className="overlay-title">{title}</h2>}
            </div>
            {headerAccessory}
            <button type="button" className="overlay-close" aria-label={closeLabel} onClick={onClose}><IconX /></button>
          </header>
        )}
        <div className="overlay-body">{children}</div>
        {footer && <footer className="overlay-footer">{footer}</footer>}
      </div>
    </div>
  )
}
