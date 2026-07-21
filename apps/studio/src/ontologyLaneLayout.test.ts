import { describe, expect, it } from 'vitest'
import type { EntityTypeDefinition } from '@lattice/contracts'
import { buildOntologyLaneLayout, ONTOLOGY_NODE_HEIGHT, ONTOLOGY_NODE_WIDTH } from './ontologyLaneLayout'

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

  it('wraps wide ontologies into rows instead of shrinking every node', () => {
    const entities = ['One', 'Two', 'Three', 'Four', 'Five'].map((group) => entity(group.toLowerCase(), group))
    const layout = buildOntologyLaneLayout(entities)

    expect(layout.lanes[0]!.position.y).toBe(layout.lanes[3]!.position.y)
    expect(layout.lanes[4]!.position.y).toBeGreaterThan(layout.lanes[0]!.position.y + layout.lanes[0]!.height)
    expect(layout.width).toBeLessThan(1_400)
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
})
