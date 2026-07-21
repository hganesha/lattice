import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppearanceSettings } from './AppearanceSettings'
import { LatticeI18nProvider } from './i18n/I18nProvider'

describe('AppearanceSettings', () => {
  beforeEach(() => {
    localStorage.setItem('lattice:theme', 'LIGHT')
    localStorage.setItem('lattice:text-scale', 'COMFORTABLE')
    localStorage.setItem('lattice:locale', 'en-US')
  })

  it('exposes theme, text size, and language as direct header controls', async () => {
    const user = userEvent.setup()
    render(<LatticeI18nProvider><AppearanceSettings /></LatticeI18nProvider>)

    expect(screen.queryByRole('button', { name: 'Appearance' })).not.toBeInTheDocument()

    const themeToggle = screen.getByRole('button', { name: 'Theme: Light' })
    await user.click(themeToggle)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem('lattice:theme')).toBe('DARK')
    expect(themeToggle).toHaveAccessibleName('Theme: Dark')

    const textSizeToggle = screen.getByRole('button', { name: 'Text size: Normal' })
    await user.click(textSizeToggle)
    expect(document.documentElement).toHaveAttribute('data-text-scale', 'large')
    expect(localStorage.getItem('lattice:text-scale')).toBe('LARGE')
    expect(textSizeToggle).toHaveAccessibleName('Text size: Large')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'es-ES')
    expect(document.documentElement).toHaveAttribute('lang', 'es-ES')
    expect(localStorage.getItem('lattice:locale')).toBe('es-ES')
    expect(screen.getByRole('combobox', { name: 'Idioma' })).toHaveValue('es-ES')
  })
})
