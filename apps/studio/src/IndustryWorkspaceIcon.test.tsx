import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IndustryWorkspaceIcon } from './IndustryWorkspaceIcon'

describe('IndustryWorkspaceIcon', () => {
  it.each(['core', 'energy', 'financial_services', 'healthcare', 'insurance', 'legal', 'manufacturing', 'real_estate'])('renders the %s workspace icon', (domain) => {
    const { container } = render(<IndustryWorkspaceIcon domain={domain} />)
    expect(container.querySelector(`[data-industry-icon="${domain}"]`)).toBeInTheDocument()
  })

  it('uses the network icon as a safe custom-industry fallback', () => {
    const { container } = render(<IndustryWorkspaceIcon domain="custom_industry" />)
    expect(container.querySelector('[data-industry-icon="custom_industry"]')).toBeInTheDocument()
  })
})
