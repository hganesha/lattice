import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { LatticeI18nProvider } from './i18n/I18nProvider'

describe('Studio shell', () => {
  beforeEach(() => {
    localStorage.setItem('lattice:welcome-dismissed', 'true')
    localStorage.removeItem('lattice:navigation-collapsed')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('starts ontology-first and lazy-loads the contract workspace on navigation', async () => {
    const user = userEvent.setup()
    const { container } = render(<LatticeI18nProvider><App /></LatticeI18nProvider>)

    expect(container.querySelector('.brand-mark img')).toHaveAttribute('src', expect.stringContaining('lattice-app-icon'))
    expect(screen.getByRole('button', { name: 'Shared ontology' })).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByRole('button', { name: /^Contracts/ }))

    expect(await screen.findByRole('heading', { name: 'Choose a decision contract' })).toBeVisible()
    expect(screen.getByLabelText('Active contract')).toBeDisabled()
    expect(screen.getByLabelText('Active contract')).toHaveTextContent('No contracts in this industry')
    expect(screen.getByRole('button', { name: /^Contracts/ })).toHaveAttribute('aria-current', 'page')
  })

  it('collapses the navigation to a persistent icon rail', async () => {
    const user = userEvent.setup()
    const { container } = render(<LatticeI18nProvider><App /></LatticeI18nProvider>)

    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }))

    expect(container.querySelector('.shell')).toHaveClass('nav-collapsed')
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute('aria-expanded', 'false')
    expect(localStorage.getItem('lattice:navigation-collapsed')).toBe('true')
  })
})
