import { describe, expect, it } from 'vitest'
import type { EntityTypeDefinition } from '@lattice/contracts'
import { buildOntologyIsometricLayout, buildOntologyLaneLayout, ONTOLOGY_NODE_HEIGHT, ONTOLOGY_NODE_WIDTH } from './ontologyLaneLayout'

function entity(id: string, group: string): EntityTypeDefinition {
  return {
    id, label: id, group, description: `${id} description`, icon: 'EN', properties: [],
    evidenceStatus: 'DECLARED', approvalStatus: 'DRAFT', impact: 'MEDIUM',
  }
}

describe('ontology lane layout', () => {
  it('keeps every entity node in a semantic lane without overlaps', () => {
    const entities = [
      entity('party', 'Foundation'), entity('place', 'Foundation'), entity('asset', 'Foundation'),
      entity('well', 'Operations'), entity('field', 'Operations'), entity('permit', 'Governance'),
    ]
    const layout = buildOntologyLaneLayout(entities)
    expect(layout.lanes.map((lane) => lane.label)).toEqual(['Foundation', 'Operations', 'Governance'])

    for (const lane of layout.lanes) {
      for (const id of lane.entityTypeIds) {
        const position = layout.positions[id]!
        expect(position.x).toBeGreaterThan(lane.position.x)
        expect(position.x + ONTOLOGY_NODE_WIDTH).toBeLessThan(lane.position.x + lane.width)
        expect(position.y).toBeGreaterThan(lane.position.y)
        expect(position.y + ONTOLOGY_NODE_HEIGHT).toBeLessThan(lane.position.y + lane.height)
      }
    }

    for (let left = 0; left < entities.length; left += 1) {
      for (let right = left + 1; right < entities.length; right += 1) {
        const leftEntity = entities[left]!
        const rightEntity = entities[right]!
        const a = layout.positions[leftEntity.id]!
        const b = layout.positions[rightEntity.id]!
        const separated = a.x + ONTOLOGY_NODE_WIDTH <= b.x || b.x + ONTOLOGY_NODE_WIDTH <= a.x
          || a.y + ONTOLOGY_NODE_HEIGHT <= b.y || b.y + ONTOLOGY_NODE_HEIGHT <= a.y
        expect(separated, `${leftEntity.id} overlaps ${rightEntity.id}`).toBe(true)
      }
    }
  })

  it('packs small domain groups into shared columns without overlapping', () => {
    const entities = ['One', 'Two', 'Three', 'Four', 'Five'].map((group) => entity(group.toLowerCase(), group))
    const layout = buildOntologyLaneLayout(entities)

    expect(layout.lanes).toHaveLength(5)
    // Small single-entity groups share columns, so there are fewer distinct x positions than lanes.
    const columnXs = new Set(layout.lanes.map((lane) => lane.position.x))
    expect(columnXs.size).toBeLessThan(layout.lanes.length)

    // Lanes stacked in the same column never overlap vertically.
    for (const columnX of columnXs) {
      const stacked = layout.lanes
        .filter((lane) => lane.position.x === columnX)
        .sort((a, b) => a.position.y - b.position.y)
      for (let index = 1; index < stacked.length; index += 1) {
        expect(stacked[index]!.position.y).toBeGreaterThanOrEqual(
          stacked[index - 1]!.position.y + stacked[index - 1]!.height,
        )
      }
    }
  })

  it('stacks a lane\'s entities vertically rather than side by side', () => {
    const layout = buildOntologyLaneLayout([
      entity('alpha', 'Group'), entity('beta', 'Group'), entity('gamma', 'Group'),
    ])
    const at = (id: string) => layout.positions[id]!

    expect(at('beta').y).toBeGreaterThan(at('alpha').y)
    expect(at('gamma').y).toBeGreaterThan(at('beta').y)
    expect(at('alpha').x).toBe(at('beta').x)
    expect(at('beta').x).toBe(at('gamma').x)
  })

  it('treats domain group names as case-insensitive lane identities', () => {
    const layout = buildOntologyLaneLayout([
      entity('property', 'Property'),
      entity('new-property-type', 'property'),
    ])

    expect(layout.lanes).toHaveLength(1)
    expect(layout.lanes[0]?.label).toBe('Property')
    expect(layout.lanes[0]?.entityTypeIds).toEqual(['property', 'new-property-type'])
  })

  it('projects entities diagonally on collision-free isometric planes', () => {
    const entities = [
      entity('party', 'Foundation'), entity('place', 'Foundation'), entity('asset', 'Foundation'),
      entity('well', 'Operations'), entity('field', 'Operations'), entity('permit', 'Governance'),
    ]
    const layout = buildOntologyIsometricLayout(entities)

    expect(layout.lanes.map((lane) => lane.label)).toEqual(['Foundation', 'Operations', 'Governance'])
    expect(layout.positions.place!.x).toBeGreaterThan(layout.positions.party!.x)
    expect(layout.positions.place!.y).toBeGreaterThan(layout.positions.party!.y)

    for (const lane of layout.lanes) {
      for (const id of lane.entityTypeIds) {
        const position = layout.positions[id]!
        expect(position.x).toBeGreaterThan(lane.position.x)
        expect(position.x + ONTOLOGY_NODE_WIDTH).toBeLessThan(lane.position.x + lane.width)
        expect(position.y).toBeGreaterThan(lane.position.y)
        expect(position.y + ONTOLOGY_NODE_HEIGHT).toBeLessThan(lane.position.y + lane.height)
      }
    }

    for (let left = 0; left < entities.length; left += 1) {
      for (let right = left + 1; right < entities.length; right += 1) {
        const a = layout.positions[entities[left]!.id]!
        const b = layout.positions[entities[right]!.id]!
        const separated = a.x + ONTOLOGY_NODE_WIDTH <= b.x || b.x + ONTOLOGY_NODE_WIDTH <= a.x
          || a.y + ONTOLOGY_NODE_HEIGHT <= b.y || b.y + ONTOLOGY_NODE_HEIGHT <= a.y
        expect(separated, `${entities[left]!.id} overlaps ${entities[right]!.id}`).toBe(true)
      }
    }
  })
})
