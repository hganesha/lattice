import { useMemo } from 'react'
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react'
import type { ContextContract } from '@lattice/contracts'

interface RuntimeGraphProps {
  contract: ContextContract
  selectedId: string
  onSelect: (entityId: string) => void
}

export function RuntimeGraph({ contract, selectedId, onSelect }: RuntimeGraphProps) {
  const nodes = useMemo<Node[]>(() => contract.entities.map((entity, index) => {
    const type = contract.entityTypes.find((candidate) => candidate.id === entity.typeId)
    const position = runtimePosition(index, contract.entities.length)
    return {
      id: entity.id,
      position,
      selected: entity.id === selectedId,
      data: { label: `${type?.icon ?? '◇'}  ${entity.label}\n${type?.label ?? entity.typeId} · ${entity.evidenceStrength}` },
      className: `runtime-flow-node ${entity.evidenceStrength.toLocaleLowerCase()}`,
      draggable: false,
      selectable: true,
    }
  }), [contract.entities, contract.entityTypes, selectedId])
  const edges = useMemo<Edge[]>(() => contract.relationships.map((relationship) => ({
    id: relationship.id,
    source: relationship.sourceEntityId,
    target: relationship.targetEntityId,
    label: contract.relationshipTypes.find((type) => type.id === relationship.typeId)?.label ?? relationship.typeId,
    type: 'smoothstep',
    className: 'runtime-flow-edge',
    animated: relationship.assertionClass === 'DERIVED' || relationship.assertionClass === 'INFERRED',
  })), [contract.relationshipTypes, contract.relationships])

  return <div className="runtime-graph">
    <ReactFlow nodes={nodes} edges={edges} onNodeClick={(_event, node) => onSelect(node.id)} fitView fitViewOptions={{ padding: .3 }} minZoom={.35} maxZoom={1.7} nodesConnectable={false} elementsSelectable proOptions={{ hideAttribution: true }}>
      <Background gap={18} size={1} color="#28302e" />
      <MiniMap pannable zoomable nodeColor={(node) => node.selected ? '#b7f44a' : '#41604b'} maskColor="#080b0dcc" />
      <Controls showInteractive={false} />
    </ReactFlow>
  </div>
}

function runtimePosition(index: number, total: number): { x: number; y: number } {
  if (total <= 2) return { x: 90 + index * 340, y: 125 + index * 65 }
  return { x: 60 + (index % 3) * 275, y: 55 + Math.floor(index / 3) * 145 }
}
