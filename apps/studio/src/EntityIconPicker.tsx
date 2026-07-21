import { useState } from 'react'
import { ENTITY_ICONS } from './entityIcons'

interface EntityIconPickerProps {
  /** Currently selected icon key. */
  value: string
  /** Fired when the user picks an icon. */
  onChange: (icon: string) => void
  /** When set, a hidden input mirrors the selection so an uncontrolled <form> can read it via FormData. */
  name?: string
  label: string
}

/** Grid of selectable entity-type icons, replacing the old 2-letter text input. */
export function EntityIconPicker({ value, onChange, name, label }: EntityIconPickerProps) {
  const [selected, setSelected] = useState(value)

  function pick(icon: string) {
    setSelected(icon)
    onChange(icon)
  }

  return (
    <div className="icon-picker">
      <span className="icon-picker-label">{label}</span>
      {name && <input type="hidden" name={name} value={selected} readOnly />}
      <div className="icon-picker-grid" role="radiogroup" aria-label={label}>
        {ENTITY_ICONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected === option.id}
            aria-label={option.label}
            title={option.label}
            className={`icon-picker-option ${selected === option.id ? 'selected' : ''}`}
            onClick={() => pick(option.id)}
          >
            <option.Icon />
          </button>
        ))}
      </div>
    </div>
  )
}
