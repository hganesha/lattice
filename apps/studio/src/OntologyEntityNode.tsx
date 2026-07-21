import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { EntityIcon } from './entityIcons'

export type OntologyEntityNodeType = Node<{ icon: string; label: string; propertyCount: number; propsLabel: string }, 'ontologyEntity'>

export const OntologyEntityNode = memo(function OntologyEntityNode({ data }: NodeProps<OntologyEntityNodeType>) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div className="ontology-entity-content">
        <span className="ontology-entity-icon"><EntityIcon icon={data.icon} /></span>
        <div>
          <b>{data.label}</b>
          <small>{data.propertyCount} {data.propsLabel}</small>
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  )
})
