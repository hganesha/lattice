import { useState, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { counterpartyRiskContract } from '@lattice/contracts'
import type { Node } from '@xyflow/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LatticeI18nProvider } from './i18n/I18nProvider'
import { OntologyBuilder } from './OntologyBuilder'

vi.mock('@xyflow/react', () => ({
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Position: { Left: 'left', Right: 'right' },
  ReactFlow: ({ nodes, onNodeClick, children }: { nodes: Node[]; onNodeClick?: (event: React.MouseEvent, node: Node) => void; children: ReactNode }) => <div data-testid="ontology-graph">
    {nodes.filter((node) => !node.id.startsWith('__lane_')).map((node) => <button key={node.id} aria-label={`Select ${node.id}`} onClick={(event) => onNodeClick?.(event, node)}>{String(node.data.label)}</button>)}
    {children}
  </div>,
  useNodesState: (initialNodes: Node[]) => {
    const [nodes, setNodes] = useState(initialNodes)
    return [nodes, setNodes, () => undefined]
  },
}))

vi.mock('./jsonExport', () => ({
  downloadJson: vi.fn(),
  downloadOntology: vi.fn(),
}))

describe('OntologyBuilder inspector', () => {
  beforeEach(() => localStorage.removeItem('lattice:inspector-collapsed'))

  it('shows relationship details for the selected ontology node', () => {
    render(<LatticeI18nProvider><OntologyBuilder contract={counterpartyRiskContract} mode="workspace" onChange={() => undefined} onDirtyChange={() => undefined} /></LatticeI18nProvider>)

    const jsonExport = screen.getByRole('button', { name: 'Export package JSON ↗' })
    expect(jsonExport).toBeVisible()
    expect(screen.getByRole('button', { name: 'Export semantic RDF/XML ↗' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Export semantic Turtle ↗' })).toBeVisible()
    fireEvent.click(jsonExport)
    expect(screen.getByText('Ontology exported as JSON')).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Type definition' })).toHaveAttribute('aria-selected', 'true')
    const relationshipsTab = screen.getByRole('tab', { name: 'Relationships' })
    fireEvent.click(relationshipsTab)

    expect(relationshipsTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Relationships' })).toBeVisible()
    expect(screen.getByText('TRADES_WITH')).toBeVisible()
    expect(screen.getByText('Incoming')).toBeVisible()
    expect(screen.getAllByText('Outgoing')).toHaveLength(2)
    expect(screen.getAllByText('MANY : TO : MANY')).not.toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Select position' }))
    expect(screen.getByRole('heading', { name: 'Position' })).toBeVisible()
    expect(screen.getByText('REFERENCES')).toBeVisible()
    expect(screen.queryByText('TRADES_WITH')).not.toBeInTheDocument()
  })

  it('identifies a contract export in contract mode', () => {
    render(<LatticeI18nProvider><OntologyBuilder contract={counterpartyRiskContract} mode="contract" onChange={() => undefined} onDirtyChange={() => undefined} /></LatticeI18nProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'Export package JSON ↗' }))

    expect(screen.getByText('Context Contract exported as JSON')).toBeVisible()
  })

  it('switches to an isometric projection without persisting new schema positions', () => {
    const onChange = vi.fn()
    render(<LatticeI18nProvider><OntologyBuilder contract={counterpartyRiskContract} mode="workspace" onChange={onChange} onDirtyChange={() => undefined} /></LatticeI18nProvider>)

    const lanes = screen.getByRole('button', { name: 'Lanes' })
    const isometric = screen.getByRole('button', { name: 'Isometric' })
    expect(lanes).toHaveAttribute('aria-pressed', 'true')
    expect(isometric).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(isometric)

    expect(lanes).toHaveAttribute('aria-pressed', 'false')
    expect(isometric).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Auto-layout/ })).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('collapses the inspector without losing its selected tab', () => {
    const { container } = render(<LatticeI18nProvider><OntologyBuilder contract={counterpartyRiskContract} mode="workspace" onChange={() => undefined} onDirtyChange={() => undefined} /></LatticeI18nProvider>)

    fireEvent.click(screen.getByRole('tab', { name: 'Relationships' }))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse inspector' }))

    expect(container.querySelector('.builder-workbench')).toHaveClass('inspector-collapsed')
    expect(screen.queryByRole('tab', { name: 'Relationships' })).not.toBeInTheDocument()
    expect(localStorage.getItem('lattice:inspector-collapsed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Expand inspector' }))

    expect(screen.getByRole('tab', { name: 'Relationships' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('TRADES_WITH')).toBeVisible()
  })
})
