import { describe, expect, it } from 'vitest'
import type { DelegationGrant, Principal } from '@lattice/contracts'
import {
  DELEGATION_NODE_HEIGHT,
  DELEGATION_NODE_WIDTH,
  buildDelegationLayout,
  grantsForPrincipal,
  stepDelegationFocus,
} from './delegationLayout'

function principal(id: string, kind: Principal['kind'] = 'HUMAN'): Principal {
  return {
    id, displayName: id, kind, roles: ['DATA_STEWARD'], workspaceIds: ['ws_default'],
    authentication: { method: 'OIDC', issuer: 'https://issuer.example', assuranceLevel: 'AAL2' },
    status: 'ACTIVE', createdAt: '2026-08-01T00:00:00.000Z',
  }
}

function grant(id: string, from: string, to: string, overrides: Partial<DelegationGrant> = {}): DelegationGrant {
  return {
    id, fromPrincipalId: from, toPrincipalId: to, scope: ['read:context'], purposeIds: ['purpose_ops'],
    audience: 'INTERNAL', issuedAt: '2026-08-01T00:00:00.000Z', expiresAt: '2026-09-01T00:00:00.000Z',
    maximumActions: 100, consumedActions: 25, riskTierCeiling: 'ANALYTICAL', contractIds: [],
    status: 'ACTIVE', artifactDigest: `sha256:${id}`, ...overrides,
  }
}

describe('delegation layout', () => {
  it('layers principals by delegation depth', () => {
    const principals = [principal('owner'), principal('agent', 'AGENT'), principal('worker', 'SERVICE')]
    const grants = [grant('g1', 'owner', 'agent'), grant('g2', 'agent', 'worker')]
    const layout = buildDelegationLayout(principals, grants)

    expect(layout.nodes.map((node) => [node.id, node.depth])).toEqual([['owner', 0], ['agent', 1], ['worker', 2]])
    expect(layout.layers.map((layer) => layer.principalIds)).toEqual([['owner'], ['agent'], ['worker']])
    expect(layout.nodes[0]!.x).toBeLessThan(layout.nodes[1]!.x)
    expect(layout.nodes[1]!.x).toBeLessThan(layout.nodes[2]!.x)
  })

  it('takes the longest path so a shortcut grant never pulls a delegate back a layer', () => {
    const principals = [principal('owner'), principal('lead'), principal('agent', 'AGENT')]
    const layout = buildDelegationLayout(principals, [grant('g1', 'owner', 'lead'), grant('g2', 'lead', 'agent'), grant('g3', 'owner', 'agent')])

    expect(layout.nodes.find((node) => node.id === 'agent')!.depth).toBe(2)
  })

  it('never overlaps two nodes and keeps every node inside the canvas', () => {
    const principals = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => principal(id))
    const layout = buildDelegationLayout(principals, [grant('g1', 'a', 'c'), grant('g2', 'a', 'd'), grant('g3', 'b', 'e'), grant('g4', 'c', 'f')])

    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0)
      expect(node.y).toBeGreaterThanOrEqual(0)
      expect(node.x + DELEGATION_NODE_WIDTH).toBeLessThanOrEqual(layout.width)
      expect(node.y + DELEGATION_NODE_HEIGHT).toBeLessThanOrEqual(layout.height)
    }
    for (let left = 0; left < layout.nodes.length; left += 1) {
      for (let right = left + 1; right < layout.nodes.length; right += 1) {
        const a = layout.nodes[left]!
        const b = layout.nodes[right]!
        const separated = a.x + DELEGATION_NODE_WIDTH <= b.x || b.x + DELEGATION_NODE_WIDTH <= a.x
          || a.y + DELEGATION_NODE_HEIGHT <= b.y || b.y + DELEGATION_NODE_HEIGHT <= a.y
        expect(separated, `${a.id} overlaps ${b.id}`).toBe(true)
      }
    }
  })

  it('terminates on a delegation cycle instead of relaxing forever', () => {
    const principals = [principal('a'), principal('b'), principal('c')]
    const layout = buildDelegationLayout(principals, [grant('g1', 'a', 'b'), grant('g2', 'b', 'c'), grant('g3', 'c', 'a')])

    expect(layout.nodes).toHaveLength(3)
    for (const node of layout.nodes) expect(node.depth).toBeLessThanOrEqual(principals.length - 1)
    expect(Number.isFinite(layout.width)).toBe(true)
  })

  it('is pure and deterministic — same input, same output, inputs untouched', () => {
    const principals = [principal('owner'), principal('agent', 'AGENT')]
    const grants = [grant('g1', 'owner', 'agent')]
    const snapshot = JSON.stringify({ principals, grants })

    expect(buildDelegationLayout(principals, grants)).toEqual(buildDelegationLayout(principals, grants))
    expect(JSON.stringify({ principals, grants })).toBe(snapshot)
  })

  it('reports remaining budget rather than consumed, and marks non-ACTIVE grants inactive', () => {
    const principals = [principal('owner'), principal('agent', 'AGENT'), principal('bot', 'AGENT')]
    const layout = buildDelegationLayout(principals, [
      grant('g1', 'owner', 'agent', { maximumActions: 500, consumedActions: 120 }),
      grant('g2', 'owner', 'bot', { status: 'REVOKED', maximumActions: 10, consumedActions: 40 }),
    ])

    expect(layout.edges[0]!.remainingActions).toBe(380)
    expect(layout.edges[0]!.active).toBe(true)
    expect(layout.edges[1]!.active).toBe(false)
    expect(layout.edges[1]!.remainingActions).toBe(0)
  })

  it('reports grants whose endpoints are unknown instead of dropping them silently', () => {
    const layout = buildDelegationLayout([principal('owner')], [grant('g1', 'owner', 'ghost')])

    expect(layout.edges).toHaveLength(0)
    expect(layout.danglingGrantIds).toEqual(['g1'])
  })

  it('returns an empty canvas for an empty directory', () => {
    expect(buildDelegationLayout([], [])).toEqual({ nodes: [], edges: [], layers: [], width: 0, height: 0, danglingGrantIds: [] })
  })

  it('filters grants to the selected principal in both directions', () => {
    const grants = [grant('g1', 'owner', 'agent'), grant('g2', 'agent', 'bot'), grant('g3', 'other', 'bot')]

    expect(grantsForPrincipal(grants, 'agent').map((item) => item.id)).toEqual(['g1', 'g2'])
    expect(grantsForPrincipal(grants, undefined)).toHaveLength(3)
  })

  it('walks the graph with arrow keys across layers and within a layer', () => {
    const principals = [principal('owner'), principal('peer'), principal('agent', 'AGENT')]
    const layout = buildDelegationLayout(principals, [grant('g1', 'owner', 'agent')])

    expect(stepDelegationFocus(layout, 'owner', 'down')).toBe('peer')
    expect(stepDelegationFocus(layout, 'peer', 'up')).toBe('owner')
    expect(stepDelegationFocus(layout, 'owner', 'right')).toBe('agent')
    expect(stepDelegationFocus(layout, 'agent', 'left')).toBe('owner')
    expect(stepDelegationFocus(layout, 'agent', 'right')).toBeUndefined()
    expect(stepDelegationFocus(layout, 'peer', 'down')).toBeUndefined()
  })
})
