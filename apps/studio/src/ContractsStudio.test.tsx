import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ContractSummary } from '@lattice/contracts'
import { ContractsStudio } from './ContractsStudio'
import { LatticeI18nProvider } from './i18n/I18nProvider'

describe('ContractsStudio localization', () => {
  it('renders the selected Spanish catalog', () => {
    localStorage.setItem('lattice:locale', 'es-ES')

    render(<LatticeI18nProvider><ContractsStudio contracts={[]} activeContractId="none" onSelect={() => undefined} onEdit={() => undefined} onCreate={() => undefined} /></LatticeI18nProvider>)

    expect(screen.getByRole('heading', { name: 'Elija un contrato de decisión' })).toBeVisible()
    expect(document.documentElement).toHaveAttribute('lang', 'es-ES')
  })

  it('exposes an explicit edit action for the active contract', async () => {
    localStorage.setItem('lattice:locale', 'en-US')
    const onEdit = vi.fn()
    const contract: ContractSummary = {
      contractId: 'contract-airline-dispatch',
      workspaceId: 'workspace-airline',
      name: 'Airline Dispatch Release',
      domain: 'airline',
      workflow: 'dispatch_release',
      draftVersion: '1.0.0',
      releaseStatus: 'PUBLISHED',
      ontologyVersion: '1.0.0',
      conceptScopeCount: 8,
      entityTypeCount: 8,
      relationshipTypeCount: 7,
      releaseCount: 1,
      runtimeStatus: 'ACTIVE',
      updatedAt: '2026-07-27T20:00:00.000Z',
    }

    render(<LatticeI18nProvider><ContractsStudio contracts={[contract]} activeContractId={contract.contractId} onSelect={() => undefined} onEdit={onEdit} onCreate={() => undefined} /></LatticeI18nProvider>)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Edit contract' }))

    expect(onEdit).toHaveBeenCalledWith(contract.contractId)
  })
})
