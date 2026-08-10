import { useCallback, useEffect, useRef } from 'react'
import { Overlay } from './Overlay'
import { useMessages } from './i18n/messages'

interface IntroDialogProps {
  onClose: () => void
}

export function IntroDialog({ onClose }: IntroDialogProps) {
  const { t } = useMessages()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const closeOnEscape = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    closeButtonRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
      iframeRef.current?.contentWindow?.removeEventListener('keydown', closeOnEscape)
      previouslyFocusedRef.current?.focus()
    }
  }, [closeOnEscape])

  function handleFrameLoad() {
    iframeRef.current?.contentWindow?.addEventListener('keydown', closeOnEscape)
  }

  return <Overlay variant="dialog" bare onClose={onClose}>
    <section className="intro-dialog" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <header className="intro-dialog-header">
        <div>
          <span className="panel-kicker">{t('introKicker')}</span>
          <h2 id="intro-title">{t('introTitle')}</h2>
        </div>
        <button ref={closeButtonRef} type="button" aria-label={t('introClose')} onClick={onClose}>×</button>
      </header>
      <iframe
        ref={iframeRef}
        src={`${import.meta.env.BASE_URL}lattice-intro.html`}
        title={t('introFrameTitle')}
        onLoad={handleFrameLoad}
      />
    </section>
  </Overlay>
}
