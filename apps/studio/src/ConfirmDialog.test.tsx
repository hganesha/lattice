import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

function renderDialog(onCancel = vi.fn(), onConfirm = vi.fn()) {
  render(<ConfirmDialog title="Discard changes?" description="Your edits will be lost." cancelLabel="Keep editing" confirmLabel="Discard" onCancel={onCancel} onConfirm={onConfirm} />)
  return { onCancel, onConfirm }
}

describe('ConfirmDialog', () => {
  it('exposes an accessible alert dialog and cancels with Escape', () => {
    const { onCancel } = renderDialog()

    expect(screen.getByRole('alertdialog', { name: 'Discard changes?' })).toHaveAttribute('aria-modal', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('runs the explicit confirmation action', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
