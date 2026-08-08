import { render } from '@testing-library/react'
import { generatedIndustryOntologyCatalog } from '@lattice/contracts'
import { describe, expect, it } from 'vitest'
import { ENTITY_ICONS, EntityIcon, isKnownEntityIcon } from './entityIcons'

describe('entity icon catalog', () => {
  it('provides real vector icons for every generated ontology type', () => {
    const generatedIcons = [...new Set(generatedIndustryOntologyCatalog.flatMap((artifact) => artifact.ontology.entityTypes.map((type) => type.icon)))]
    expect(generatedIcons.every(isKnownEntityIcon)).toBe(true)

    const { container } = render(<>{generatedIcons.map((icon) => <EntityIcon icon={icon} key={icon} />)}</>)
    expect(container.querySelectorAll('svg')).toHaveLength(generatedIcons.length)
    expect(container.querySelector('.entity-icon-text')).not.toBeInTheDocument()
  })

  it('includes dedicated airline and telecommunications concepts in the picker', () => {
    const ids = ENTITY_ICONS.map((option) => option.id)
    expect(ids).toEqual(expect.arrayContaining(['plane', 'airport', 'pilot', 'wrench', 'radioTower', 'simCard', 'router', 'signal', 'phoneForwarded', 'siren']))
  })
})
