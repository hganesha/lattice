import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { LatticeI18nProvider } from './i18n/I18nProvider'

describe('Studio shell', () => {
  beforeEach(() => {
    localStorage.setItem('lattice:welcome-dismissed', 'true')
    window.history.replaceState({}, '', '/')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  })

  afterEach(() => vi.unstubAllGlobals())

  function navigation() {
    return within(screen.getByRole('navigation'))
  }

  it('starts ontology-first and lazy-loads the contract workspace on navigation', async () => {
    const user = userEvent.setup()
    render(<LatticeI18nProvider><App /></LatticeI18nProvider>)

    expect(navigation().getByRole('button', { name: 'Shared ontology' })).toHaveAttribute('aria-current', 'page')

    await user.click(navigation().getByRole('button', { name: /^Contracts/ }))

    expect(await screen.findByRole('heading', { name: 'Choose a decision contract' })).toBeVisible()
    expect(screen.getByLabelText('Active contract')).toBeDisabled()
    expect(screen.getByLabelText('Active contract')).toHaveTextContent('No contracts in this industry')
    expect(navigation().getByRole('button', { name: /^Contracts/ })).toHaveAttribute('aria-current', 'page')
  })

  it('groups navigation by job rather than by object type', () => {
    render(<LatticeI18nProvider><App /></LatticeI18nProvider>)

    for (const group of ['Build', 'Operate', 'Govern', 'Assure']) {
      expect(navigation().getByText(group)).toBeVisible()
    }
    // The three loops the plan closes each get a surface.
    expect(navigation().getByRole('button', { name: /^Disposition trail/ })).toBeVisible()
    expect(navigation().getByRole('button', { name: /^Evaluations/ })).toBeVisible()
    expect(navigation().getByRole('button', { name: /^Drift & source health/ })).toBeVisible()
  })

  it('puts the current surface in the URL so a view is linkable', async () => {
    const user = userEvent.setup()
    render(<LatticeI18nProvider><App /></LatticeI18nProvider>)

    await user.click(navigation().getByRole('button', { name: /^Contracts/ }))

    expect(window.location.pathname).toContain('/contracts')
  })

  it('explains the missing prerequisite instead of silently redirecting', async () => {
    // The compiler needs a contract; with none selected the old shell bounced you to the
    // contract list with no message, which reads as a bug (G8).
    window.history.replaceState({}, '', '/compiler')
    render(<LatticeI18nProvider><App /></LatticeI18nProvider>)

    expect(await screen.findByRole('heading', { name: 'This surface needs a decision contract' })).toBeVisible()
    expect(screen.getByText(/dry-run it immediately, without publishing/)).toBeVisible()
  })
})
