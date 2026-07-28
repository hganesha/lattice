import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { counterpartyRiskContract, type ContextContract } from '@lattice/contracts'
import { ContractEditorStudio, definitionIssues } from './ContractEditorStudio'
import { LatticeI18nProvider } from './i18n/I18nProvider'

describe('ContractEditorStudio', () => {
  it('edits existing contract metadata and marks the draft dirty', async () => {
    const user = userEvent.setup()
    const onDirtyChange = vi.fn()

    function Harness() {
      const [contract, setContract] = useState<ContextContract>(() => structuredClone(counterpartyRiskContract))
      return <ContractEditorStudio contract={contract} onChange={setContract} onDirtyChange={onDirtyChange} onBack={() => undefined} />
    }

    render(<LatticeI18nProvider><Harness /></LatticeI18nProvider>)
    const name = screen.getByLabelText('Contract name')
    await user.clear(name)
    await user.type(name, 'Updated exposure contract')

    expect(name).toHaveValue('Updated exposure contract')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })

  it('surfaces missing compile definitions and repairs them through authoring controls', async () => {
    const user = userEvent.setup()
    const incomplete = {
      ...structuredClone(counterpartyRiskContract),
      competencyQuestions: [],
      operations: [],
    }

    expect(definitionIssues(incomplete)).toContain('contractEditorIssueNoQuestions')
    expect(definitionIssues(incomplete)).toContain('contractEditorIssueNoOperations')

    function Harness() {
      const [contract, setContract] = useState<ContextContract>(incomplete)
      return <ContractEditorStudio contract={contract} onChange={setContract} onDirtyChange={() => undefined} onBack={() => undefined} />
    }

    render(<LatticeI18nProvider><Harness /></LatticeI18nProvider>)
    await user.click(screen.getAllByRole('button', { name: '＋ Add operation' })[0]!)
    await user.click(screen.getAllByRole('button', { name: '＋ Add question' })[0]!)

    expect(screen.getByText('1 compiler operation')).toBeVisible()
    expect(screen.getByText('1 governed question')).toBeVisible()
    expect(screen.getByLabelText('Mapped operation')).not.toHaveValue('')
  })
})
