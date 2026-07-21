import { useState } from 'react'

const NEW_GROUP = '__new_domain_group__'

interface DomainGroupFieldProps {
  groups: string[]
  label: string
  value: string
  addGroupLabel: string
  newGroupLabel: string
  newGroupPlaceholder: string
  name?: string
  onChange?: (group: string) => void
}

export function DomainGroupField({ groups, label, value, addGroupLabel, newGroupLabel, newGroupPlaceholder, name, onChange }: DomainGroupFieldProps) {
  const canonicalValue = groups.find((group) => group.toLocaleLowerCase() === value.toLocaleLowerCase()) ?? value
  const [selection, setSelection] = useState(canonicalValue || groups[0] || NEW_GROUP)
  const [customGroup, setCustomGroup] = useState('')
  const creatingGroup = selection === NEW_GROUP
  const resolvedValue = creatingGroup ? customGroup.trim() : selection

  function selectGroup(next: string) {
    setSelection(next)
    if (next !== NEW_GROUP) onChange?.(next)
  }

  function commitCustomGroup() {
    const group = customGroup.trim()
    if (group) onChange?.(group)
  }

  return <label className="domain-group-field">
    {label}
    <select aria-label={label} value={selection} onChange={(event) => selectGroup(event.target.value)}>
      {groups.map((group) => <option value={group} key={group.toLocaleLowerCase()}>{group}</option>)}
      <option value={NEW_GROUP}>{addGroupLabel}</option>
    </select>
    {creatingGroup && <input
      aria-label={newGroupLabel}
      value={customGroup}
      onChange={(event) => setCustomGroup(event.target.value)}
      onBlur={commitCustomGroup}
      placeholder={newGroupPlaceholder}
      required
      autoFocus
    />}
    {name && <input type="hidden" name={name} value={resolvedValue} />}
  </label>
}
