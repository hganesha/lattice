import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toast } from './Toast'

afterEach(() => vi.useRealTimers())

describe('Toast', () => {
  it('announces a transient message and supports manual dismissal', () => {
    const onDismiss = vi.fn()
    render(<Toast message="Ontology saved" closeLabel="Close" onDismiss={onDismiss} />)

    expect(screen.getByRole('status')).toHaveTextContent('Ontology saved')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('dismisses automatically after the configured duration', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<Toast message="Import complete" closeLabel="Close" onDismiss={onDismiss} durationMs={3000} />)

    vi.advanceTimersByTime(2999)
    expect(onDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('uses an assertive alert for errors', () => {
    render(<Toast message="Publish failed" closeLabel="Close" onDismiss={() => undefined} tone="error" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Publish failed')
  })
})
