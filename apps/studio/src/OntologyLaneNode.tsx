import { memo } from 'react'
import type { CSSProperties } from 'react'
import type { Node, NodeProps } from '@xyflow/react'

export type OntologyLaneNodeType = Node<{ label: string; count: number; accent: string; soft: string }, 'ontologyLane'>

export const OntologyLaneNode = memo(function OntologyLaneNode({ data }: NodeProps<OntologyLaneNodeType>) {
  return (
    <div className="ontology-lane-content" style={{ '--lane-accent': data.accent, '--lane-soft': data.soft } as CSSProperties}>
      <span>{data.label}</span>
      <em>{data.count}</em>
    </div>
  )
})
