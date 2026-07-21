import { useEffect, useRef } from 'react'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

interface ToastProps {
  message: string
  closeLabel: string
  onDismiss: () => void
  tone?: ToastTone
  durationMs?: number
}

export function Toast({ message, closeLabel, onDismiss, tone = 'info', durationMs = 5000 }: ToastProps) {
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useEffect(() => {
    if (durationMs <= 0) return
    const timeout = window.setTimeout(() => dismissRef.current(), durationMs)
    return () => window.clearTimeout(timeout)
  }, [durationMs, message])

  return <div className="toast-viewport" aria-live={tone === 'error' ? 'assertive' : 'polite'} aria-atomic="true">
    <div className={`studio-toast ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="toast-indicator" aria-hidden="true" />
      <span className="toast-message">{message}</span>
      <button type="button" className="toast-close" aria-label={closeLabel} onClick={onDismiss}>×</button>
    </div>
  </div>
}
