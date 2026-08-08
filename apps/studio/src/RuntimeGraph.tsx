import { useMemo } from 'react'
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import type { ContextContract } from '@lattice/contracts'
import { EntityIcon } from './entityIcons'

type RuntimeEntityNode = Node<{ icon: string; label: string; typeLabel: string; evidenceStrength: string }, 'runtimeEntity'>
const runtimeNodeTypes = { runtimeEntity: RuntimeEntityNodeView }

interface RuntimeGraphProps {
  contract: ContextContract
  selectedId: string
  onSelect: (entityId: string) => void
}

export function RuntimeGraph({ contract, selectedId, onSelect }: RuntimeGraphProps) {
  const nodes = useMemo<RuntimeEntityNode[]>(() => contract.entities.map((entity, index) => {
    const type = contract.entityTypes.find((candidate) => candidate.id === entity.typeId)
    const position = runtimePosition(index, contract.entities.length)
    return {
      id: entity.id,
      position,
      selected: entity.id === selectedId,
      type: 'runtimeEntity',
      data: { icon: type?.icon ?? 'box', label: entity.label, typeLabel: type?.label ?? entity.typeId, evidenceStrength: entity.evidenceStrength },
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
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={runtimeNodeTypes} onNodeClick={(_event, node) => onSelect(node.id)} fitView fitViewOptions={{ padding: .3 }} minZoom={.35} maxZoom={1.7} nodesConnectable={false} elementsSelectable proOptions={{ hideAttribution: true }}>
      <Background gap={18} size={1} color="#28302e" />
      <MiniMap pannable zoomable nodeColor={(node) => node.selected ? '#b7f44a' : '#41604b'} />
      <Controls showInteractive={false} />
    </ReactFlow>
  </div>
}

function RuntimeEntityNodeView({ data }: NodeProps<RuntimeEntityNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div className="runtime-node-content">
        <span><EntityIcon icon={data.icon} /></span>
        <div><b>{data.label}</b><small>{data.typeLabel} · {data.evidenceStrength}</small></div>
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  )
}

function runtimePosition(index: number, total: number): { x: number; y: number } {
  if (total <= 2) return { x: 90 + index * 340, y: 125 + index * 65 }
  return { x: 60 + (index % 3) * 275, y: 55 + Math.floor(index / 3) * 145 }
}
