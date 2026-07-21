import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { counterpartyRiskContract } from '@lattice/contracts'
import { describe, expect, it, vi } from 'vitest'
import { LatticeI18nProvider } from './i18n/I18nProvider'
import { SourceBindingStudio } from './SourceBindingStudio'

describe('SourceBindingStudio prerequisites', () => {
  it('explains and consistently enforces the property prerequisite', async () => {
    const user = userEvent.setup()
    const onOpenOntology = vi.fn()
    const contract = {
      ...structuredClone(counterpartyRiskContract),
      entityTypes: counterpartyRiskContract.entityTypes.map((type) => ({ ...type, properties: [] })),
      bindings: [],
    }

    render(<LatticeI18nProvider><SourceBindingStudio contract={contract} onChange={vi.fn()} onDirtyChange={vi.fn()} onOpenOntology={onOpenOntology} /></LatticeI18nProvider>)

    expect(screen.getByRole('button', { name: /New source binding/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Choose a connector/i })).toBeDisabled()
    expect(screen.getByText('An ontology with properties is required')).toBeVisible()

    await user.click(screen.getByRole('button', { name: /Add ontology properties/i }))
    expect(onOpenOntology).toHaveBeenCalledOnce()
  })
})
