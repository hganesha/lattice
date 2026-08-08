import type { DelegationGrant, Principal, PrincipalKind } from '@lattice/contracts'

/**
 * Deterministic layered layout for the delegation graph (E15).
 *
 * Modelled on `ontologyLaneLayout.ts`: pure, side-effect free, and driven entirely by the
 * data. It replaces the prototype's hand-placed coordinates (`Identities.tsx:45-54`, which
 * positions eight known ids by hand and drops every principal it has not heard of).
 *
 * Principals are layered by delegation depth — depth 0 is a principal nobody delegated to,
 * depth n+1 is the deepest delegator plus one. Cycles are tolerated: depth is capped at
 * `principals.length - 1` so relaxation always terminates.
 */

export const DELEGATION_NODE_WIDTH = 188
export const DELEGATION_NODE_HEIGHT = 54
export const DELEGATION_COLUMN_GAP = 112
export const DELEGATION_ROW_GAP = 28
export const DELEGATION_LAYER_LABEL_HEIGHT = 26
export const DELEGATION_CANVAS_PADDING = 24

export interface DelegationNode {
  id: string
  label: string
  kind: PrincipalKind
  status: Principal['status']
  /** Layer index, left to right. */
  depth: number
  /** Position within the layer, top to bottom. */
  row: number
  x: number
  y: number
  incoming: number
  outgoing: number
  activeGrants: number
}

export interface DelegationEdge {
  id: string
  fromId: string
  toId: string
  status: DelegationGrant['status']
  /** ACTIVE grants only; EXPIRED / REVOKED / EXHAUSTED edges must read as inactive. */
  active: boolean
  scopeCount: number
  /** `maximumActions - consumedActions`, floored at zero. Remaining budget, never consumed. */
  remainingActions: number
  path: string
  labelX: number
  labelY: number
}

export interface DelegationLayer {
  depth: number
  x: number
  y: number
  width: number
  height: number
  principalIds: string[]
}

export interface DelegationLayout {
  nodes: DelegationNode[]
  edges: DelegationEdge[]
  layers: DelegationLayer[]
  width: number
  height: number
  /** Grants whose endpoints are not in `principals`; surfaced rather than silently dropped. */
  danglingGrantIds: string[]
}

export function buildDelegationLayout(principals: Principal[], grants: DelegationGrant[]): DelegationLayout {
  if (principals.length === 0) return { nodes: [], edges: [], layers: [], width: 0, height: 0, danglingGrantIds: [] }

  const known = new Map(principals.map((principal) => [principal.id, principal]))
  const linked = grants.filter((grant) => known.has(grant.fromPrincipalId) && known.has(grant.toPrincipalId))
  const danglingGrantIds = grants.filter((grant) => !known.has(grant.fromPrincipalId) || !known.has(grant.toPrincipalId)).map((grant) => grant.id)
  const depths = resolveDepths(principals, linked)

  const rowByPrincipal = new Map<string, number>()
  const layerMembers = new Map<number, string[]>()
  for (const principal of principals) {
    const depth = depths.get(principal.id) ?? 0
    const members = layerMembers.get(depth) ?? []
    rowByPrincipal.set(principal.id, members.length)
    layerMembers.set(depth, [...members, principal.id])
  }

  const depthValues = [...layerMembers.keys()].sort((left, right) => left - right)
  const columnByDepth = new Map(depthValues.map((depth, column) => [depth, column]))
  const nodes = principals.map((principal): DelegationNode => {
    const depth = depths.get(principal.id) ?? 0
    const row = rowByPrincipal.get(principal.id) ?? 0
    return {
      id: principal.id,
      label: principal.displayName,
      kind: principal.kind,
      status: principal.status,
      depth,
      row,
      x: columnX(columnByDepth.get(depth) ?? 0),
      y: rowY(row),
      incoming: linked.filter((grant) => grant.toPrincipalId === principal.id).length,
      outgoing: linked.filter((grant) => grant.fromPrincipalId === principal.id).length,
      activeGrants: linked.filter((grant) => grant.status === 'ACTIVE' && (grant.toPrincipalId === principal.id || grant.fromPrincipalId === principal.id)).length,
    }
  })

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const edges = linked.map((grant): DelegationEdge => {
    const from = nodeById.get(grant.fromPrincipalId)!
    const to = nodeById.get(grant.toPrincipalId)!
    const startX = from.x + DELEGATION_NODE_WIDTH
    const startY = from.y + DELEGATION_NODE_HEIGHT / 2
    const endX = to.x
    const endY = to.y + DELEGATION_NODE_HEIGHT / 2
    const forward = endX > startX
    const bend = forward ? (startX + endX) / 2 : startX + DELEGATION_COLUMN_GAP / 2
    return {
      id: grant.id,
      fromId: grant.fromPrincipalId,
      toId: grant.toPrincipalId,
      status: grant.status,
      active: grant.status === 'ACTIVE',
      scopeCount: grant.scope.length,
      remainingActions: Math.max(0, grant.maximumActions - grant.consumedActions),
      path: forward
        ? `M${round(startX)},${round(startY)} C${round(bend)},${round(startY)} ${round(bend)},${round(endY)} ${round(endX)},${round(endY)}`
        : `M${round(startX)},${round(startY)} C${round(bend)},${round(startY - DELEGATION_ROW_GAP)} ${round(endX - DELEGATION_COLUMN_GAP / 2)},${round(endY - DELEGATION_ROW_GAP)} ${round(endX)},${round(endY)}`,
      labelX: round(forward ? bend : (startX + endX) / 2),
      labelY: round((startY + endY) / 2 - 10),
    }
  })

  const layers = depthValues.map((depth): DelegationLayer => {
    const principalIds = layerMembers.get(depth) ?? []
    return {
      depth,
      x: columnX(columnByDepth.get(depth) ?? 0) - DELEGATION_CANVAS_PADDING / 2,
      y: DELEGATION_CANVAS_PADDING / 2,
      width: DELEGATION_NODE_WIDTH + DELEGATION_CANVAS_PADDING,
      height: DELEGATION_LAYER_LABEL_HEIGHT + principalIds.length * DELEGATION_NODE_HEIGHT + Math.max(0, principalIds.length - 1) * DELEGATION_ROW_GAP + DELEGATION_CANVAS_PADDING,
      principalIds,
    }
  })

  const maximumRows = Math.max(...depthValues.map((depth) => (layerMembers.get(depth) ?? []).length))
  return {
    nodes,
    edges,
    layers,
    width: DELEGATION_CANVAS_PADDING * 2 + depthValues.length * DELEGATION_NODE_WIDTH + Math.max(0, depthValues.length - 1) * DELEGATION_COLUMN_GAP,
    height: DELEGATION_CANVAS_PADDING * 2 + DELEGATION_LAYER_LABEL_HEIGHT + maximumRows * DELEGATION_NODE_HEIGHT + Math.max(0, maximumRows - 1) * DELEGATION_ROW_GAP,
    danglingGrantIds,
  }
}

/** Grants touching `principalId` in either direction — the click-to-filter predicate. */
export function grantsForPrincipal(grants: DelegationGrant[], principalId: string | undefined): DelegationGrant[] {
  if (!principalId) return grants
  return grants.filter((grant) => grant.fromPrincipalId === principalId || grant.toPrincipalId === principalId)
}

/** Next node id for arrow-key traversal: left/right change layer, up/down move within one. */
export function stepDelegationFocus(layout: DelegationLayout, currentId: string, direction: 'left' | 'right' | 'up' | 'down'): string | undefined {
  const current = layout.nodes.find((node) => node.id === currentId)
  if (!current) return layout.nodes[0]?.id
  if (direction === 'up' || direction === 'down') {
    const column = layout.nodes.filter((node) => node.depth === current.depth).sort((left, right) => left.row - right.row)
    const index = column.findIndex((node) => node.id === currentId)
    return column[direction === 'up' ? index - 1 : index + 1]?.id
  }
  const depths = [...new Set(layout.nodes.map((node) => node.depth))].sort((left, right) => left - right)
  const position = depths.indexOf(current.depth)
  const targetDepth = depths[direction === 'left' ? position - 1 : position + 1]
  if (targetDepth === undefined) return undefined
  const candidates = layout.nodes.filter((node) => node.depth === targetDepth).sort((left, right) => left.row - right.row)
  return (candidates.find((node) => node.row === current.row) ?? candidates[candidates.length - 1])?.id
}

function resolveDepths(principals: Principal[], grants: DelegationGrant[]): Map<string, number> {
  const incoming = new Map<string, string[]>()
  for (const grant of grants) {
    if (grant.fromPrincipalId === grant.toPrincipalId) continue
    incoming.set(grant.toPrincipalId, [...(incoming.get(grant.toPrincipalId) ?? []), grant.fromPrincipalId])
  }
  const ceiling = Math.max(0, principals.length - 1)
  const depths = new Map(principals.map((principal) => [principal.id, 0]))
  for (let pass = 0; pass <= ceiling; pass += 1) {
    let changed = false
    for (const principal of principals) {
      const sources = incoming.get(principal.id) ?? []
      if (sources.length === 0) continue
      const candidate = Math.min(ceiling, Math.max(...sources.map((source) => depths.get(source) ?? 0)) + 1)
      if (candidate > (depths.get(principal.id) ?? 0)) {
        depths.set(principal.id, candidate)
        changed = true
      }
    }
    if (!changed) break
  }
  return depths
}

function columnX(column: number): number {
  return DELEGATION_CANVAS_PADDING + column * (DELEGATION_NODE_WIDTH + DELEGATION_COLUMN_GAP)
}

function rowY(row: number): number {
  return DELEGATION_CANVAS_PADDING + DELEGATION_LAYER_LABEL_HEIGHT + row * (DELEGATION_NODE_HEIGHT + DELEGATION_ROW_GAP)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
