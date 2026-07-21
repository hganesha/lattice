import { memo } from 'react'
import type { Node, NodeProps } from '@xyflow/react'

export type OntologyLaneNodeType = Node<{ label: string; count: number; kindLabel: string }, 'ontologyLane'>

export const OntologyLaneNode = memo(function OntologyLaneNode({ data }: NodeProps<OntologyLaneNodeType>) {
  return (
    <div className="ontology-lane-content">
      <span><small>{data.kindLabel}</small>{data.label}</span>
      <em>{data.count}</em>
    </div>
  )
})
