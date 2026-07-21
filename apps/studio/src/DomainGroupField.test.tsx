import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DomainGroupField } from './DomainGroupField'

const labels = {
  label: 'Domain group',
  addGroupLabel: '＋ Add new group…',
  newGroupLabel: 'New domain group',
  newGroupPlaceholder: 'e.g. Compliance',
}

describe('DomainGroupField', () => {
  it('selects a group from the ontology and canonicalizes its case', () => {
    const onChange = vi.fn()
    render(<DomainGroupField {...labels} groups={['Property', 'Parties']} value="property" onChange={onChange} />)

    expect(screen.getByRole('combobox', { name: 'Domain group' })).toHaveValue('Property')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Parties' } })
    expect(onChange).toHaveBeenCalledWith('Parties')
  })

  it('supports defining a new domain group', () => {
    const onChange = vi.fn()
    render(<DomainGroupField {...labels} groups={['Property']} value="Property" name="group" onChange={onChange} />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__new_domain_group__' } })
    const input = screen.getByRole('textbox', { name: 'New domain group' })
    fireEvent.change(input, { target: { value: 'Compliance' } })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith('Compliance')
    expect(document.querySelector<HTMLInputElement>('input[name="group"]')).toHaveValue('Compliance')
  })
})
