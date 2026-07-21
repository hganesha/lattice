import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContractsStudio } from './ContractsStudio'
import { LatticeI18nProvider } from './i18n/I18nProvider'

describe('ContractsStudio localization', () => {
  it('renders the selected Spanish catalog', () => {
    localStorage.setItem('lattice:locale', 'es-ES')

    render(<LatticeI18nProvider><ContractsStudio contracts={[]} activeContractId="none" onSelect={() => undefined} onCreate={() => undefined} /></LatticeI18nProvider>)

    expect(screen.getByRole('heading', { name: 'Elija un contrato de decisión' })).toBeVisible()
    expect(document.documentElement).toHaveAttribute('lang', 'es-ES')
  })
})
