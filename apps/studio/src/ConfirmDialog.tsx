import { useEffect } from 'react'

interface ConfirmDialogProps {
  title: string
  description: string
  cancelLabel: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({ title, description, cancelLabel, confirmLabel, onCancel, onConfirm }: ConfirmDialogProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onCancel])

  return <div className="modal-backdrop confirm-backdrop" role="presentation"><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description"><span aria-hidden="true">!</span><h2 id="confirm-title">{title}</h2><p id="confirm-description">{description}</p><footer><button className="ghost" autoFocus onClick={onCancel}>{cancelLabel}</button><button className="danger-ghost" onClick={onConfirm}>{confirmLabel}</button></footer></section></div>
}
