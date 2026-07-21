import { useState } from 'react'

const CREATE_NEW = '__create_new__'

export interface SelectOrCreateOption {
  value: string
  label: string
}

interface SelectOrCreateFieldProps {
  label: string
  value: string
  options: SelectOrCreateOption[]
  placeholder: string
  addLabel: string
  customLabel: string
  customPlaceholder: string
  required?: boolean
  onChange: (value: string) => void
}

export function SelectOrCreateField({ label, value, options, placeholder, addLabel, customLabel, customPlaceholder, required, onChange }: SelectOrCreateFieldProps) {
  const [creating, setCreating] = useState(false)

  function selectValue(next: string) {
    if (next === CREATE_NEW) {
      setCreating(true)
      onChange('')
      return
    }
    setCreating(false)
    onChange(next)
  }

  return <label className="select-or-create-field">
    {label}
    <select aria-label={label} value={creating ? CREATE_NEW : value} required={required} onChange={(event) => selectValue(event.target.value)}>
      <option value="" disabled>{placeholder}</option>
      {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
      <option value={CREATE_NEW}>{addLabel}</option>
    </select>
    {creating && <input aria-label={customLabel} value={value} required={required} autoFocus placeholder={customPlaceholder} onChange={(event) => onChange(event.target.value)} />}
  </label>
}
