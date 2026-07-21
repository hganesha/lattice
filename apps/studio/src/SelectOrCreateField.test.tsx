import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SelectOrCreateField } from './SelectOrCreateField'

const props = {
  label: 'Workflow',
  value: '',
  options: [{ value: 'lease_administration', label: 'Lease administration' }],
  placeholder: 'Select a workflow',
  addLabel: '＋ Add custom workflow…',
  customLabel: 'Custom workflow',
  customPlaceholder: 'e.g. Portfolio review',
}

describe('SelectOrCreateField', () => {
  it('selects a recommended option', () => {
    const onChange = vi.fn()
    render(<SelectOrCreateField {...props} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Workflow' }), { target: { value: 'lease_administration' } })
    expect(onChange).toHaveBeenCalledWith('lease_administration')
  })

  it('reveals an inline custom value field', () => {
    const onChange = vi.fn()
    const { rerender } = render(<SelectOrCreateField {...props} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Workflow' }), { target: { value: '__create_new__' } })
    expect(onChange).toHaveBeenCalledWith('')

    rerender(<SelectOrCreateField {...props} value="portfolio_review" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom workflow' }), { target: { value: 'portfolio_review_v2' } })
    expect(onChange).toHaveBeenLastCalledWith('portfolio_review_v2')
  })
})
