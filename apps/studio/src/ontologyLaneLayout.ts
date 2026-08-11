import type { EntityTypeDefinition } from '@lattice/contracts'

export const ONTOLOGY_NODE_WIDTH = 220
export const ONTOLOGY_NODE_HEIGHT = 64
export const ONTOLOGY_LANE_WIDTH = 252

// Each domain group is its own vertical lane. Lanes are packed into columns like masonry:
// several small groups can stack in one column up to a height budget, so short lanes don't
// leave a tall empty gap, while the corridor between columns keeps edge labels clear.
const LANE_GAP = 88
const LANE_HEADER_HEIGHT = 34
const LANE_PADDING = 16
const NODE_GAP = 24
const CANVAS_PADDING = 28
// Vertical gap between two group blocks stacked in the same column.
const GROUP_GAP = 32
// Column height budget: at least this tall so a few small groups can share a column even when
// no single group is large; a taller group raises the budget so it still fits in one column.
const TARGET_LANE_HEIGHT = 480

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
 * Builds one vertical lane per domain group and packs the lanes into side-by-side columns
 * masonry-style: each lane stacks its entity cards top to bottom, and small lanes share a
 * column (up to a height budget) so a tall group next to several small ones doesn't leave a
 * column of empty space. Lanes are returned in authoring order regardless of where they land.
 */
export function buildOntologyLaneLayout(entityTypes: EntityTypeDefinition[]): OntologyLaneLayout {
  const groups = groupEntityTypes(entityTypes)
  if (groups.length === 0) return { positions: {}, lanes: [], width: 0, height: 0 }

  const blocks = groups.map(([label, types]) => ({ label, types, height: laneBlockHeight(types.length) }))
  const budget = Math.max(TARGET_LANE_HEIGHT, ...blocks.map((block) => block.height))

  // First-fit column packing, authoring order preserved: drop each lane into the first column
  // it still fits under the budget, otherwise open a new column. A lane taller than the
  // budget can't happen — the budget is raised to the tallest lane above.
  const columns: Array<{ blocks: typeof blocks; height: number }> = []
  for (const block of blocks) {
    const column = columns.find((candidate) => candidate.height + GROUP_GAP + block.height <= budget)
    if (column) {
      column.height += GROUP_GAP + block.height
      column.blocks.push(block)
    } else {
      columns.push({ blocks: [block], height: block.height })
    }
  }

  // Resolve each lane's top-left corner from the column it was packed into.
  const placement = new Map<(typeof blocks)[number], { x: number; y: number }>()
  columns.forEach((column, columnIndex) => {
    const x = CANVAS_PADDING + columnIndex * (ONTOLOGY_LANE_WIDTH + LANE_GAP)
    let y = CANVAS_PADDING
    for (const block of column.blocks) {
      placement.set(block, { x, y })
      y += block.height + GROUP_GAP
    }
  })

  const positions: OntologyLaneLayout['positions'] = {}
  const lanes = blocks.map((block): OntologyLane => {
    const { x, y } = placement.get(block)!
    block.types.forEach((type, nodeIndex) => {
      positions[type.id] = {
        x: x + LANE_PADDING,
        y: y + LANE_HEADER_HEIGHT + LANE_PADDING + nodeIndex * (ONTOLOGY_NODE_HEIGHT + NODE_GAP),
      }
    })
    return {
      id: slugifyLane(block.label),
      label: block.label,
      entityTypeIds: block.types.map((type) => type.id),
      position: { x, y },
      width: ONTOLOGY_LANE_WIDTH,
      height: block.height,
    }
  })

  const tallestColumn = Math.max(...columns.map((column) => column.height))
  return {
    positions,
    lanes,
    width: CANVAS_PADDING * 2 + columns.length * ONTOLOGY_LANE_WIDTH + Math.max(0, columns.length - 1) * LANE_GAP,
    height: CANVAS_PADDING * 2 + tallestColumn,
  }
}

/** Total height of one domain group's lane: header + padding + its stacked entity cards. */
function laneBlockHeight(entityCount: number): number {
  const count = Math.max(1, entityCount)
  return LANE_HEADER_HEIGHT + LANE_PADDING * 2 + count * ONTOLOGY_NODE_HEIGHT + (count - 1) * NODE_GAP
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
