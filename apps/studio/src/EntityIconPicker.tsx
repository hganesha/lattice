import { useEffect, useRef, useState } from 'react'
import { ENTITY_ICONS } from './entityIcons'
import { useMessages } from './i18n/messages'

interface EntityIconPickerProps {
  /** Currently selected icon key. */
  value: string
  /** Fired when the user picks an icon. */
  onChange: (icon: string) => void
  /** When set, a hidden input mirrors the selection so an uncontrolled <form> can read it via FormData. */
  name?: string
  label: string
}

/**
 * Selectable entity-type icon, collapsed to the current choice.
 *
 * The set is 57 icons. Rendering the whole grid pushed the fields that are read constantly —
 * domain group, criticality, the property list — most of a panel below the fold on every
 * selection, to keep permanently visible a control that is used about once per entity type.
 */
export function EntityIconPicker({ value, onChange, name, label }: EntityIconPickerProps) {
  const { t } = useMessages()
  const [selected, setSelected] = useState(value)
  const [open, setOpen] = useState(false)
  const grid = useRef<HTMLDivElement>(null)

  // Follows the incoming value: selecting a different entity type must not keep the previous icon.
  useEffect(() => setSelected(value), [value])

  // Focus moves into the grid on open, so the choice is reachable without a mouse.
  useEffect(() => {
    if (open) grid.current?.querySelector<HTMLButtonElement>('[aria-checked="true"], button')?.focus()
  }, [open])

  function pick(icon: string) {
    setSelected(icon)
    onChange(icon)
    setOpen(false)
  }

  const current = ENTITY_ICONS.find((option) => option.id === selected) ?? ENTITY_ICONS[0]
  const CurrentIcon = current?.Icon

  return (
    <div className="icon-picker">
      <span className="icon-picker-label">{label}</span>
      {name && <input type="hidden" name={name} value={selected} readOnly />}

      <button
        type="button"
        className="icon-picker-current"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className="icon-picker-swatch" aria-hidden="true">{CurrentIcon && <CurrentIcon />}</span>
        <b>{current?.label ?? selected}</b>
        <em>{t(open ? 'ontologyIconClose' : 'ontologyIconChoose')}</em>
      </button>

      {open && (
        <div className="icon-picker-grid" role="radiogroup" aria-label={label} ref={grid}>
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
      )}
    </div>
  )
}
