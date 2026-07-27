import { describe, expect, it } from 'vitest'
import { contractSuggestionsFor } from './contractSuggestions'

describe('contract suggestions', () => {
  it('offers airline operational and regulatory workflows', () => {
    expect(contractSuggestionsFor('Airline').workflows.map(({ value }) => value)).toContain('dispatch_release')
    expect(contractSuggestionsFor('airline').workflows.map(({ value }) => value)).toContain('airworthiness_release')
    expect(contractSuggestionsFor('airline').owners.map(({ value }) => value)).toContain('System Operations Control')
  })

  it('returns industry-specific workflows and owners', () => {
    expect(contractSuggestionsFor('Real Estate').workflows.map(({ value }) => value)).toContain('lease_administration')
    expect(contractSuggestionsFor('energy').owners.map(({ value }) => value)).toContain('Grid Operations')
  })

  it('falls back to cross-industry suggestions', () => {
    expect(contractSuggestionsFor('emerging-industry').workflows.map(({ value }) => value)).toContain('policy_governance')
  })
})
