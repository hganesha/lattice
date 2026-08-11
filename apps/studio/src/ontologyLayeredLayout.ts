import type { EntityTypeDefinition, RelationshipTypeDefinition } from '@lattice/contracts'
import type { ElkNode } from 'elkjs/lib/elk-api'
import { ONTOLOGY_LANE_WIDTH, ONTOLOGY_NODE_HEIGHT, ONTOLOGY_NODE_WIDTH, type OntologyLaneLayout } from './ontologyLaneLayout'

// The lane and isometric layouts pack cards by which domain group they belong to; neither
// looks at how the entities actually connect. In a dense contract that leaves relationship
// edges crossing the whole canvas. This mode hands the graph to ELK's layered algorithm,
// which orders nodes to minimise crossings and routes edges orthogonally around them —
// the readable, connectivity-first view the grid packers can't produce.
const LAYERED_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  // Cards flow left-to-right, matching the entity nodes' Right→Left source/target handles.
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.spacing.nodeNodeBetweenLayers': '112',
  'elk.spacing.nodeNode': '46',
  'elk.spacing.edgeNode': '28',
  'elk.spacing.edgeEdge': '18',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  // Ties broken by authoring order keep the layout stable as the contract is edited.
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.mergeEdges': 'true',
}

// elkjs pulls in a web-worker build (~0.5 MB); importing it lazily keeps it out of the
// initial studio bundle and out of the synchronous test path entirely — it only loads the
// first time someone opens the layered view.
let elkPromise: Promise<{ layout(graph: ElkNode): Promise<ElkNode> }> | undefined
async function elkEngine() {
  if (!elkPromise) {
    elkPromise = import('elkjs/lib/elk.bundled.js').then(({ default: Elk }) => new Elk())
  }
  return elkPromise
}

const EMPTY_LAYOUT: OntologyLaneLayout = { positions: {}, lanes: [], width: 0, height: 0 }

/**
 * Computes a crossing-minimised, orthogonally-routed layered layout for the ontology graph.
 * Returns the same shape as the lane/isometric builders so the canvas can consume it
 * identically; the `lanes` it returns are group descriptors that feed the colour legend
 * rather than swimlane boxes — the layered view draws no lane frames.
 */
export async function buildOntologyLayeredLayout(
  entityTypes: EntityTypeDefinition[],
  relationshipTypes: RelationshipTypeDefinition[],
): Promise<OntologyLaneLayout> {
  if (entityTypes.length === 0) return EMPTY_LAYOUT

  const ids = new Set(entityTypes.map((type) => type.id))
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: LAYERED_OPTIONS,
    children: entityTypes.map((type) => ({ id: type.id, width: ONTOLOGY_NODE_WIDTH, height: ONTOLOGY_NODE_HEIGHT })),
    edges: relationshipTypes
      // Guard against relationships whose endpoints were removed but not yet cleaned up:
      // ELK throws on an edge that references an unknown node.
      .filter((relationship) => ids.has(relationship.sourceTypeId) && ids.has(relationship.targetTypeId))
      .map((relationship) => ({
        id: relationship.id,
        sources: [relationship.sourceTypeId],
        targets: [relationship.targetTypeId],
      })),
  }

  const elk = await elkEngine()
  const laid = await elk.layout(graph)

  const positions: OntologyLaneLayout['positions'] = {}
  for (const child of laid.children ?? []) {
    positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 }
  }

  return {
    positions,
    lanes: groupLanes(entityTypes),
    width: laid.width ?? 0,
    height: laid.height ?? 0,
  }
}

/** Group descriptors for the legend/palette — no on-canvas geometry in the layered view. */
function groupLanes(entityTypes: EntityTypeDefinition[]): OntologyLaneLayout['lanes'] {
  const grouped = new Map<string, { label: string; ids: string[] }>()
  for (const entityType of entityTypes) {
    const group = entityType.group.trim() || 'Ungrouped'
    const key = group.toLocaleLowerCase()
    const existing = grouped.get(key)
    if (existing) existing.ids.push(entityType.id)
    else grouped.set(key, { label: group, ids: [entityType.id] })
  }
  return [...grouped.values()].map(({ label, ids }) => ({
    id: label.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, '-') || 'ungrouped',
    label,
    entityTypeIds: ids,
    position: { x: 0, y: 0 },
    width: ONTOLOGY_LANE_WIDTH,
    height: 0,
  }))
}
