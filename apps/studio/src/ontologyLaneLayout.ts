import type { EntityTypeDefinition } from '@lattice/contracts'

export const ONTOLOGY_NODE_WIDTH = 220
export const ONTOLOGY_NODE_HEIGHT = 64
export const ONTOLOGY_LANE_WIDTH = 252

// Each domain group is its own vertical lane; all lanes sit in a single row, so a group owns
// its column and the corridor between columns keeps relationship labels clear of the cards.
const LANE_GAP = 88
const LANE_HEADER_HEIGHT = 34
const LANE_PADDING = 16
const NODE_GAP = 24
const CANVAS_PADDING = 28

// Isometric mode keeps cards upright while arranging them on diagonal semantic planes.
const ISOMETRIC_LANES_PER_ROW = 3
const ISOMETRIC_LANE_GAP = 88
const ISOMETRIC_ROW_GAP = 104
const ISOMETRIC_COLUMN_STAGGER = 56
const ISOMETRIC_NODE_DEPTH = 28
const ISOMETRIC_NODE_GAP = 30

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

/**
 * Builds one vertical lane per domain group, arranged side by side in a single row. Each lane
 * holds a single group and stacks its entity cards top to bottom, so a group owns its column
 * and no two groups ever share a lane.
 */
export function buildOntologyLaneLayout(entityTypes: EntityTypeDefinition[]): OntologyLaneLayout {
  const groups = groupEntityTypes(entityTypes)
  const positions: OntologyLaneLayout['positions'] = {}
  let tallestLane = 0

  const lanes = groups.map(([label, types], laneIndex): OntologyLane => {
    const count = Math.max(1, types.length)
    const laneHeight = LANE_HEADER_HEIGHT + LANE_PADDING * 2
      + count * ONTOLOGY_NODE_HEIGHT + (count - 1) * NODE_GAP
    tallestLane = Math.max(tallestLane, laneHeight)
    const x = CANVAS_PADDING + laneIndex * (ONTOLOGY_LANE_WIDTH + LANE_GAP)
    const y = CANVAS_PADDING
    types.forEach((type, nodeIndex) => {
      positions[type.id] = {
        x: x + LANE_PADDING,
        y: y + LANE_HEADER_HEIGHT + LANE_PADDING + nodeIndex * (ONTOLOGY_NODE_HEIGHT + NODE_GAP),
      }
    })
    return {
      id: slugifyLane(label),
      label,
      entityTypeIds: types.map((type) => type.id),
      position: { x, y },
      width: ONTOLOGY_LANE_WIDTH,
      height: laneHeight,
    }
  })

  return {
    positions,
    lanes,
    width: groups.length === 0 ? 0 : CANVAS_PADDING * 2
      + groups.length * ONTOLOGY_LANE_WIDTH
      + Math.max(0, groups.length - 1) * LANE_GAP,
    height: groups.length === 0 ? 0 : CANVAS_PADDING * 2 + tallestLane,
  }
}

/** Builds a readable 2.5D projection without transforming React Flow's interaction plane. */
export function buildOntologyIsometricLayout(entityTypes: EntityTypeDefinition[]): OntologyLaneLayout {
  const groups = groupEntityTypes(entityTypes)
  const positions: OntologyLaneLayout['positions'] = {}
  const rows = chunk(groups, ISOMETRIC_LANES_PER_ROW)
  const rowHeights = rows.map((row) => Math.max(0, ...row.map(([, types], columnIndex) =>
    isometricLaneHeight(types.length) + columnIndex * ISOMETRIC_COLUMN_STAGGER,
  )))
  const rowOffsets = rowHeights.map((_, rowIndex) => CANVAS_PADDING
    + rowHeights.slice(0, rowIndex).reduce((sum, height) => sum + height + ISOMETRIC_ROW_GAP, 0))

  const lanes: OntologyLane[] = []
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!
    let x = CANVAS_PADDING
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const [label, types] = row[columnIndex]!
      const y = rowOffsets[rowIndex]! + columnIndex * ISOMETRIC_COLUMN_STAGGER
      const width = isometricLaneWidth(types.length)
      types.forEach((type, nodeIndex) => {
        positions[type.id] = {
          x: x + LANE_PADDING + nodeIndex * ISOMETRIC_NODE_DEPTH,
          y: y + LANE_HEADER_HEIGHT + LANE_PADDING
            + nodeIndex * (ONTOLOGY_NODE_HEIGHT + ISOMETRIC_NODE_GAP),
        }
      })
      lanes.push({
        id: slugifyLane(label),
        label,
        entityTypeIds: types.map((type) => type.id),
        position: { x, y },
        width,
        height: isometricLaneHeight(types.length),
      })
      x += width + ISOMETRIC_LANE_GAP
    }
  }

  const rowWidths = rows.map((row) => row.reduce((sum, [, types], index) =>
    sum + isometricLaneWidth(types.length) + (index === 0 ? 0 : ISOMETRIC_LANE_GAP), 0))

  return {
    positions,
    lanes,
    width: groups.length === 0 ? 0 : CANVAS_PADDING * 2 + Math.max(...rowWidths),
    height: groups.length === 0 ? 0 : CANVAS_PADDING * 2
      + rowHeights.reduce((sum, height) => sum + height, 0)
      + Math.max(0, rows.length - 1) * ISOMETRIC_ROW_GAP,
  }
}

function groupEntityTypes(entityTypes: EntityTypeDefinition[]): Array<readonly [string, EntityTypeDefinition[]]> {
  const grouped = new Map<string, { label: string; types: EntityTypeDefinition[] }>()
  for (const entityType of entityTypes) {
    const group = entityType.group.trim() || 'Ungrouped'
    const key = group.toLocaleLowerCase()
    const existing = grouped.get(key)
    grouped.set(key, existing
      ? { ...existing, types: [...existing.types, entityType] }
      : { label: group, types: [entityType] })
  }
  return [...grouped.values()].map(({ label, types }) => [label, types] as const)
}

function isometricLaneWidth(nodeCount: number): number {
  return ONTOLOGY_LANE_WIDTH + Math.max(0, nodeCount - 1) * ISOMETRIC_NODE_DEPTH
}

function isometricLaneHeight(nodeCount: number): number {
  return LANE_HEADER_HEIGHT + LANE_PADDING * 2
    + nodeCount * ONTOLOGY_NODE_HEIGHT
    + Math.max(0, nodeCount - 1) * ISOMETRIC_NODE_GAP
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))
}

function slugifyLane(label: string): string {
  return label.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, '-') || 'ungrouped'
}
