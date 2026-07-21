import { useState, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { counterpartyRiskContract } from '@lattice/contracts'
import type { Node } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'
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

describe('OntologyBuilder inspector', () => {
  it('shows relationship details for the selected ontology node', () => {
    render(<LatticeI18nProvider><OntologyBuilder contract={counterpartyRiskContract} mode="workspace" onChange={() => undefined} onDirtyChange={() => undefined} /></LatticeI18nProvider>)

    expect(screen.getByRole('button', { name: 'Export JSON ↗' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Export RDF/XML ↗' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Export Turtle ↗' })).toBeVisible()
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
})
