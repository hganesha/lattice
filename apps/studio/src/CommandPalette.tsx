import { useEffect, useMemo, useRef, useState } from 'react'
import type { ContractSummary, SearchResult, SearchResultKind } from '@lattice/contracts'
import { apiFetch } from './api'
import { IconLoader, IconSearch } from './icons'
import { searchKindMessageKeys, searchKindOrder, useIdentityMessages } from './i18n/messages.identity'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  workspaceId?: string
  contracts: ContractSummary[]
  onNavigatePath: (path: string) => void
  onSelectContract: (contractId: string) => void
}

/**
 * Scoped entity search (E19, fixes G12). Replaces the prototype's naive substring filter with a
 * ranked server-side search; `score` is relevance and is never shown as a confidence figure.
 */
export function CommandPalette({ open, onClose, workspaceId, contracts, onNavigatePath, onSelectContract }: CommandPaletteProps) {
  const { t } = useIdentityMessages()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [status, setStatus] = useState<'IDLE' | 'SEARCHING' | 'READY' | 'ERROR'>('IDLE')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const returnFocusTo = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocusTo.current = document.activeElement
    inputRef.current?.focus()
    return () => { if (returnFocusTo.current instanceof HTMLElement) returnFocusTo.current.focus() }
  }, [open])

  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setStatus('IDLE')
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setStatus('SEARCHING')
      apiFetch<SearchResult[]>(`/v1/search?q=${encodeURIComponent(trimmed)}${workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : ''}`, { signal: controller.signal })
        .then((found) => { if (!controller.signal.aborted) { setResults(found); setActiveIndex(0); setStatus('READY') } })
        .catch(() => { if (!controller.signal.aborted) setStatus('ERROR') })
    }, 160)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [open, query, workspaceId])

  const grouped = useMemo(() => searchKindOrder
    .map((kind) => ({ kind, items: results.filter((result) => result.kind === kind) }))
    .filter((group) => group.items.length > 0), [results])
  const flat = useMemo(() => grouped.flatMap((group) => group.items), [grouped])

  if (!open) return null

  function choose(result: SearchResult) {
    if (result.kind === 'CONTRACT' && contracts.some((summary) => summary.contractId === result.id)) onSelectContract(result.id)
    else onNavigatePath(result.route)
    onClose()
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => flat.length === 0 ? 0 : (index + 1) % flat.length); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => flat.length === 0 ? 0 : (index - 1 + flat.length) % flat.length); return }
    if (event.key === 'Enter') {
      const selected = flat[activeIndex]
      if (selected) { event.preventDefault(); choose(selected) }
    }
  }

  const activeId = flat[activeIndex] ? `palette-option-${flat[activeIndex].id}` : undefined

  return <div className="modal-backdrop palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-label={t('paletteLabel')} onKeyDown={onKeyDown}>
      <div className="palette-input">
        <span aria-hidden="true">{status === 'SEARCHING' ? <IconLoader /> : <IconSearch />}</span>
        <input ref={inputRef} type="search" role="combobox" aria-expanded={flat.length > 0} aria-controls="palette-results" aria-autocomplete="list" {...(activeId ? { 'aria-activedescendant': activeId } : {})} placeholder={t('palettePlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t('paletteTitle')} />
        <button className="ghost" onClick={onClose} aria-label={t('paletteClose')}>Esc</button>
      </div>

      <div className="palette-results" id="palette-results" role="listbox" aria-label={t('paletteResultsLabel')}>
        {status === 'ERROR' && <p className="palette-note" role="alert">{t('paletteError')}</p>}
        {status === 'READY' && flat.length === 0 && <p className="palette-note">{t('paletteNoResults', { query: query.trim() })}<small>{t('paletteNoResultsHint')}</small></p>}
        {grouped.map((group) => <div className="palette-group" key={group.kind}>
          <div className="palette-group-label">{t(searchKindMessageKeys[group.kind as SearchResultKind])}</div>
          {group.items.map((result) => {
            const index = flat.indexOf(result)
            return <button id={`palette-option-${result.id}`} role="option" aria-selected={index === activeIndex} className={index === activeIndex ? 'active' : ''} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(result)} key={result.id}>
              <b>{result.title}</b><small>{result.subtitle}</small>
            </button>
          })}
        </div>)}
      </div>

      <footer className="palette-footer"><span>{t('paletteHint')}</span>{status === 'SEARCHING' ? <span>{t('paletteSearching')}</span> : status === 'READY' ? <span>{t('paletteResultCount', { count: flat.length })}</span> : null}</footer>
    </section>
  </div>
}
