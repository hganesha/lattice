import type { EntityTypeDefinition } from '@lattice/contracts'

export const ONTOLOGY_NODE_WIDTH = 220
export const ONTOLOGY_NODE_HEIGHT = 64
export const ONTOLOGY_LANE_WIDTH = 252

// Wide connector corridors keep relationship labels clear of both lane borders and entity cards.
const LANE_GAP = 96
const LANE_ROW_GAP = 56
const LANE_HEADER_HEIGHT = 34
const LANE_PADDING = 16
const NODE_GAP = 24
const LANE_STAGGER = 28
const CANVAS_PADDING = 28
const MAX_LANES_PER_ROW = 4

export interface OntologyLane {
  id: string
  label: string
  entityTypeIds: string[]
  position: { x: number; y: number }
  width: number
  height: number
}

export interface OntologyLaneLayout {
  positions: Record<string, { x: number; y: number }>
  lanes: OntologyLane[]
  width: number
  height: number
}

/** Builds stable left-to-right semantic lanes from each entity type's domain group. */
export function buildOntologyLaneLayout(entityTypes: EntityTypeDefinition[]): OntologyLaneLayout {
  const grouped = new Map<string, { label: string; types: EntityTypeDefinition[] }>()
  for (const entityType of entityTypes) {
    const group = entityType.group.trim() || 'Ungrouped'
    const key = group.toLocaleLowerCase()
    const existing = grouped.get(key)
    grouped.set(key, existing
      ? { ...existing, types: [...existing.types, entityType] }
      : { label: group, types: [entityType] })
  }

  const groups = [...grouped.values()].map(({ label, types }) => [label, types] as const)
  const positions: OntologyLaneLayout['positions'] = {}
  const rows = chunk(groups, MAX_LANES_PER_ROW)
  const rowHeights = rows.map((row) => laneHeightFor(Math.max(1, ...row.map(([, types]) => types.length)), row.length))
  const rowOffsets = rowHeights.map((_, rowIndex) => CANVAS_PADDING
    + rowHeights.slice(0, rowIndex).reduce((sum, height) => sum + height + LANE_ROW_GAP, 0))

  const lanes = groups.map(([label, types], laneIndex): OntologyLane => {
    const rowIndex = Math.floor(laneIndex / MAX_LANES_PER_ROW)
    const columnIndex = laneIndex % MAX_LANES_PER_ROW
    const x = CANVAS_PADDING + columnIndex * (ONTOLOGY_LANE_WIDTH + LANE_GAP)
    const y = rowOffsets[rowIndex]!
    const stagger = columnIndex % 2 === 0 ? 0 : LANE_STAGGER
    types.forEach((type, nodeIndex) => {
      positions[type.id] = {
        x: x + LANE_PADDING,
        y: y + LANE_HEADER_HEIGHT + LANE_PADDING + stagger
          + nodeIndex * (ONTOLOGY_NODE_HEIGHT + NODE_GAP),
      }
    })
    return {
      id: slugifyLane(label),
      label,
      entityTypeIds: types.map((type) => type.id),
      position: { x, y },
      width: ONTOLOGY_LANE_WIDTH,
      height: rowHeights[rowIndex]!,
    }
  })

  return {
    positions,
    lanes,
    width: groups.length === 0 ? 0 : CANVAS_PADDING * 2
      + Math.min(groups.length, MAX_LANES_PER_ROW) * ONTOLOGY_LANE_WIDTH
      + Math.max(0, Math.min(groups.length, MAX_LANES_PER_ROW) - 1) * LANE_GAP,
    height: groups.length === 0 ? 0 : CANVAS_PADDING * 2
      + rowHeights.reduce((sum, height) => sum + height, 0)
      + Math.max(0, rows.length - 1) * LANE_ROW_GAP,
  }
}

function laneHeightFor(nodeCount: number, laneCount: number): number {
  return LANE_HEADER_HEIGHT + LANE_PADDING * 2
    + nodeCount * ONTOLOGY_NODE_HEIGHT
    + Math.max(0, nodeCount - 1) * NODE_GAP
    + (laneCount > 1 ? LANE_STAGGER : 0)
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))
}

function slugifyLane(label: string): string {
  return label.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, '-') || 'ungrouped'
}
