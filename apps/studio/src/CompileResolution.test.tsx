import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CompileResponse } from '@lattice/contracts'
import { CompileResolution } from './CompileResolution'
import { LatticeI18nProvider } from './i18n/I18nProvider'

describe('CompileResolution', () => {
  it('renders operation clarification candidates and returns the selected operation ID', async () => {
    const user = userEvent.setup()
    const onChoose = vi.fn()
    const result: CompileResponse = {
      resolutionId: 'res-intent',
      decision: 'CLARIFICATION_REQUIRED',
      reasonCodes: ['AMBIGUOUS_OPERATION'],
      explanation: ['Multiple governed operations are plausible.'],
      versions: {
        contract: 'contract@1',
        semantic: 'semantic@1',
        policy: 'policy@1',
        bindings: 'bindings@1',
        api: 'compile@1',
      },
      clarification: {
        kind: 'OPERATION',
        id: 'clar-intent',
        prompt: 'Which operation?',
        candidates: [{
          operationId: 'risk.exposure',
          label: 'Counterparty exposure',
          description: 'Return governed exposure.',
          riskTier: 'ANALYTICAL',
          expectedAnswerShape: 'Exposure[]',
          score: 0.89,
          rationale: ['Semantic similarity 0.890.'],
        }],
      },
    }

    render(<LatticeI18nProvider><CompileResolution result={result} onChoose={onChoose} /></LatticeI18nProvider>)
    await user.click(screen.getByRole('button', { name: /Counterparty exposure/ }))

    expect(onChoose).toHaveBeenCalledWith('risk.exposure')
    expect(screen.getByText('ANALYTICAL · score 0.890')).toBeVisible()
  })
})
