import assert from 'node:assert/strict'
import test from 'node:test'
import { coreOntology, generatedIndustryOntologyCatalog } from '@lattice/contracts'

test('generates provenance-backed ontologies for every implemented schema industry', () => {
  assert.equal(generatedIndustryOntologyCatalog.length, 7)
  assert.equal(generatedIndustryOntologyCatalog.reduce((sum, artifact) => sum + artifact.provenance.coverage.formCount, 0), 55)
  assert.equal(generatedIndustryOntologyCatalog.reduce((sum, artifact) => sum + artifact.provenance.coverage.sourceFieldCount, 0), 1043)

  for (const artifact of generatedIndustryOntologyCatalog) {
    const typeIds = new Set(artifact.ontology.entityTypes.map((type) => type.id))
    assert.equal(typeIds.size, artifact.ontology.entityTypes.length)
    assert.ok(artifact.provenance.coverage.mappedPercent >= 70, `${artifact.ontology.domain} coverage fell below 70%`)
    assert.ok(artifact.ontology.relationshipTypes.every((relationship) => typeIds.has(relationship.sourceTypeId) && typeIds.has(relationship.targetTypeId)))
    assert.ok(artifact.ontology.entityTypes.every((type) => type.properties.every((property) => artifact.provenance.propertySources[property.id]?.length)))
  }
})

test('ships a published, property-bearing cross-industry Core ontology', () => {
  assert.equal(coreOntology.releaseStatus, 'PUBLISHED')
  assert.deepEqual(coreOntology.entityTypes.map((type) => type.id), ['person', 'organization', 'agent', 'location', 'document', 'event', 'asset', 'policy'])
  assert.ok(coreOntology.entityTypes.every((type) => type.approvalStatus === 'APPROVED' && type.properties.length >= 3))
  const typeIds = new Set(coreOntology.entityTypes.map((type) => type.id))
  assert.ok(coreOntology.relationshipTypes.every((relationship) => typeIds.has(relationship.sourceTypeId) && typeIds.has(relationship.targetTypeId)))
})
