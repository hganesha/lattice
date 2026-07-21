import assert from 'node:assert/strict'
import test from 'node:test'
import { counterpartyRiskContract, type EntityTypeDefinition, type RelationshipTypeDefinition } from '@lattice/contracts'
import { previewImport } from '@lattice/importer-core'
import { exportOntology, type OntologyExportDocument } from './ontologyExporter.js'

const service: EntityTypeDefinition = {
  id: 'service',
  label: 'Service & Offering',
  description: 'A governed <business> service.',
  group: 'Operations',
  icon: 'box',
  properties: [{
    id: 'service.service_id',
    name: 'Service ID',
    dataType: 'string',
    description: 'Stable service identifier.',
    required: true,
    identifier: true,
  }, {
    id: 'service.started_at',
    name: 'Started At',
    dataType: 'datetime',
    description: 'Service start time.',
  }],
  evidenceStatus: 'DECLARED',
  approvalStatus: 'APPROVED',
  impact: 'HIGH',
}

const system: EntityTypeDefinition = {
  id: 'system',
  label: 'System',
  description: 'A supporting system.',
  group: 'Technology',
  icon: 'box',
  properties: [],
  evidenceStatus: 'DIRECTLY_EVIDENCED',
  approvalStatus: 'APPROVED',
  impact: 'MEDIUM',
}

const dependsOn: RelationshipTypeDefinition = {
  id: 'depends_on',
  label: 'DEPENDS ON',
  sourceTypeId: 'service',
  targetTypeId: 'system',
  cardinality: 'MANY_TO_ONE',
  description: 'Connects a service to its supporting system.',
  impact: 'HIGH',
}

const document: OntologyExportDocument = {
  id: 'service-network',
  name: 'Service Network',
  description: 'Governed service dependencies.',
  domain: 'Operations',
  version: '1.2.0',
  entityTypes: [system, service],
  relationshipTypes: [dependsOn],
}

test('exports deterministic RDF/XML with escaped content and OWL semantics', () => {
  const first = exportOntology(document, 'RDF_XML')
  const reordered = exportOntology({ ...document, entityTypes: [service, system] }, 'RDF_XML')

  assert.equal(first.content, reordered.content)
  assert.equal(first.filename, 'service-network-1.2.0.rdf')
  assert.equal(first.mediaType, 'application/rdf+xml')
  assert.match(first.content, /<owl:Class rdf:about="https:\/\/lattice\.dev\/ontologies\/service-network\/1\.2\.0#service">/)
  assert.match(first.content, /Service &amp; Offering/)
  assert.match(first.content, /governed &lt;business&gt; service/)
  assert.match(first.content, /<rdfs:range rdf:resource="http:\/\/www\.w3\.org\/2001\/XMLSchema#dateTime"/)
})

test('round-trips RDF/XML through the governed import proposal pipeline', () => {
  const artifact = exportOntology(document, 'RDF_XML')
  const proposal = previewImport({ contract: counterpartyRiskContract, sourceName: artifact.filename, sourceText: artifact.content })

  assert.equal(proposal.format, 'RDF_XML')
  assert.deepEqual(proposal.entityTypes.map((item) => item.type.id), ['service', 'system'])
  assert.deepEqual(proposal.entityTypes[0]?.type.properties.map((property) => property.id), ['service.service_id', 'service.started_at'])
  assert.equal(proposal.entityTypes[0]?.type.properties[1]?.dataType, 'datetime')
  assert.deepEqual(proposal.relationshipTypes.map((item) => item.type.id), ['depends_on'])
  assert.equal(proposal.relationshipTypes[0]?.type.cardinality, 'MANY_TO_ONE')
  assert.deepEqual(proposal.relationshipTypes[0]?.warnings, [])
})

test('round-trips deterministic Turtle through the governed import proposal pipeline', () => {
  const artifact = exportOntology(document, 'TURTLE', { baseIri: 'https://example.com/ontologies/service-network#' })
  const proposal = previewImport({ contract: counterpartyRiskContract, sourceName: artifact.filename, sourceText: artifact.content })

  assert.equal(artifact.filename, 'service-network-1.2.0.ttl')
  assert.equal(artifact.ontologyIri, 'https://example.com/ontologies/service-network')
  assert.equal(proposal.format, 'TURTLE')
  assert.deepEqual(proposal.entityTypes.map((item) => item.type.id), ['service', 'system'])
  assert.deepEqual(proposal.entityTypes[0]?.type.properties.map((property) => property.id), ['service.service_id', 'service.started_at'])
  assert.equal(proposal.relationshipTypes[0]?.type.targetTypeId, 'system')
  assert.equal(proposal.relationshipTypes[0]?.type.cardinality, 'MANY_TO_ONE')
})

test('rejects non-HTTP base IRIs', () => {
  assert.throws(() => exportOntology(document, 'TURTLE', { baseIri: 'urn:lattice:test' }), /BASE_IRI_MUST_BE_HTTP_OR_HTTPS/)
})
