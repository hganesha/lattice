import { Overlay } from './Overlay'

interface ConfirmDialogProps {
  title: string
  description: string
  cancelLabel: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({ title, description, cancelLabel, confirmLabel, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <Overlay
      variant="dialog"
      role="alertdialog"
      width="min(430px, calc(100vw - 2 * var(--space-5)))"
      title={title}
      closeLabel={cancelLabel}
      onClose={onCancel}
      footer={<>
        <button className="ghost" autoFocus onClick={onCancel}>{cancelLabel}</button>
        <button className="ghost danger" onClick={onConfirm}>{confirmLabel}</button>
      </>}
    >
      <p className="confirm-copy">{description}</p>
    </Overlay>
  )
}
