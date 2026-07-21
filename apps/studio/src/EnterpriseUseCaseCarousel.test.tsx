import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { EnterpriseUseCaseCarousel } from './EnterpriseUseCaseCarousel'
import { LatticeI18nProvider } from './i18n/I18nProvider'

describe('EnterpriseUseCaseCarousel', () => {
  it('moves between sourced enterprise patterns with accessible controls', async () => {
    const user = userEvent.setup()
    localStorage.setItem('lattice:locale', 'en-US')
    render(<LatticeI18nProvider><EnterpriseUseCaseCarousel /></LatticeI18nProvider>)

    expect(screen.getByRole('heading', { name: 'Aggregate risk exposure across fragmented books' })).toBeVisible()
    expect(screen.getByRole('link', { name: /Basel Committee · BCBS 239/ })).toHaveAttribute('href', 'https://www.bis.org/publ/bcbs239.htm')

    await user.click(screen.getByRole('button', { name: 'Next enterprise use case' }))

    expect(screen.getByRole('heading', { name: 'Decide prior authorization with traceable clinical context' })).toBeVisible()
    expect(screen.getByText('2 / 4')).toBeVisible()
    expect(screen.getByRole('link', { name: /Centers for Medicare & Medicaid Services/ })).toHaveAttribute('href', expect.stringContaining('cms-0057-f'))
  })
})
