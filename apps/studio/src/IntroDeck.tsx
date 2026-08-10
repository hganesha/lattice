import { useEffect, useRef } from 'react'
import { useMessages } from './i18n/messages'

/** Served from `public/`, so it is a plain asset rather than part of the Studio bundle. */
export const INTRO_DECK_URL = '/lattice-intro.html'

interface IntroDeckProps {
  onClose: () => void
}

/**
 * Shows the enterprise briefing deck without leaving the Studio.
 *
 * The deck is a self-contained document driven by its own keyboard shortcuts — arrows and space
 * to move, G for the index, P to print — so it is embedded in a frame and given focus rather
 * than re-implemented. That also means Escape is handled here on the parent: once focus is
 * inside the frame, its key events never reach this document.
 */
export function IntroDeck({ onClose }: IntroDeckProps) {
  const { t } = useMessages()
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }

    document.addEventListener('keydown', closeOnEscape)
    // The page behind is inert while the deck is open, so it must not scroll under it.
    const restoreOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = restoreOverflow
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return <div className="modal-backdrop intro-backdrop" role="presentation">
    <section className="intro-deck" role="dialog" aria-modal="true" aria-label={t('introTitle')}>
      <header>
        <div>
          <span>{t('introEyebrow')}</span>
          <h2>{t('introTitle')}</h2>
        </div>
        <div className="intro-actions">
          <a className="ghost" href={INTRO_DECK_URL} target="_blank" rel="noreferrer">{t('introOpenInTab')}</a>
          <button className="ghost" onClick={onClose}>{t('introClose')}</button>
        </div>
      </header>
      <iframe
        ref={frame}
        src={INTRO_DECK_URL}
        title={t('introTitle')}
        // Focused on load so the deck's own arrow-key navigation works without a click first.
        onLoad={() => frame.current?.contentWindow?.focus()}
      />
      <p className="intro-hint">{t('introHint')}</p>
    </section>
  </div>
}
