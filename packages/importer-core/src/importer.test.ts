import assert from 'node:assert/strict'
import test from 'node:test'
import { counterpartyRiskContract } from '@lattice/contracts'
import { previewImport } from './importer.js'

test('previews OpenAPI schemas as governed entity and relationship proposals', () => {
  const proposal = previewImport({
    contract: counterpartyRiskContract,
    sourceName: 'outage-api.yaml',
    sourceText: `
openapi: 3.1.0
info: { title: Outage API, version: 1.0.0 }
components:
  schemas:
    GridAsset:
      description: A physical component of the grid.
      type: object
      required: [assetId]
      properties:
        assetId: { type: string, description: Governed asset identifier }
        voltageKv: { type: number }
    Outage:
      type: object
      properties:
        severity: { type: string, enum: [low, high, critical] }
        affectedAssets:
          type: array
          items: { $ref: '#/components/schemas/GridAsset' }
`,
  })

  assert.equal(proposal.format, 'OPENAPI')
  assert.deepEqual(proposal.entityTypes.map((type) => type.type.id), ['grid_asset', 'outage'])
  assert.equal(proposal.entityTypes[0]?.type.properties[0]?.identifier, true)
  assert.deepEqual(proposal.entityTypes[1]?.type.properties[0]?.allowedValues, ['low', 'high', 'critical'])
  assert.equal(proposal.relationshipTypes[0]?.type.cardinality, 'ONE_TO_MANY')
  assert.match(proposal.checksum, /^sha256:[a-f0-9]{64}$/)
})

test('detects collisions with existing ontology types', () => {
  const proposal = previewImport({
    contract: counterpartyRiskContract,
    sourceName: 'counterparty.json',
    sourceText: JSON.stringify({
      $defs: {
        Counterparty: { type: 'object', properties: { id: { type: 'string' } } },
      },
    }),
  })

  assert.equal(proposal.entityTypes[0]?.collision?.existingTypeId, 'counterparty')
  assert.equal(proposal.entityTypes[0]?.collision?.match, 'EXACT_ID')
})

test('previews RDF/XML OWL classes, datatype properties, and object properties', () => {
  const proposal = previewImport({
    contract: counterpartyRiskContract,
    sourceName: 'service-network.owl',
    sourceText: `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Class rdf:about="https://example.com/network#Service">
    <rdfs:label>Business Service</rdfs:label>
    <rdfs:comment>A governed service.</rdfs:comment>
  </owl:Class>
  <owl:Class rdf:about="https://example.com/network#System" />
  <owl:DatatypeProperty rdf:about="https://example.com/network#startedAt">
    <rdfs:domain rdf:resource="https://example.com/network#Service" />
    <rdfs:range rdf:resource="http://www.w3.org/2001/XMLSchema#dateTime" />
  </owl:DatatypeProperty>
  <owl:ObjectProperty rdf:about="https://example.com/network#dependsOn">
    <rdfs:domain rdf:resource="https://example.com/network#Service" />
    <rdfs:range rdf:resource="https://example.com/network#System" />
  </owl:ObjectProperty>
</rdf:RDF>`,
  })

  assert.equal(proposal.format, 'RDF_XML')
  assert.deepEqual(proposal.entityTypes.map((type) => type.type.id), ['service', 'system'])
  assert.equal(proposal.entityTypes[0]?.type.label, 'Business Service')
  assert.equal(proposal.entityTypes[0]?.type.properties[0]?.dataType, 'datetime')
  assert.equal(proposal.relationshipTypes[0]?.type.sourceTypeId, 'service')
  assert.equal(proposal.relationshipTypes[0]?.type.targetTypeId, 'system')
})

test('previews Turtle ontologies through the same governed proposal model', () => {
  const proposal = previewImport({
    contract: counterpartyRiskContract,
    sourceName: 'supply-chain.ttl',
    sourceText: `@prefix ex: <https://example.com/supply#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:Supplier a owl:Class ; rdfs:label "Supplier" .
ex:Facility a owl:Class ; rdfs:label "Facility" .
ex:active a owl:DatatypeProperty ; rdfs:domain ex:Supplier ; rdfs:range xsd:boolean .
ex:operates a owl:ObjectProperty ; rdfs:domain ex:Supplier ; rdfs:range ex:Facility .`,
  })

  assert.equal(proposal.format, 'TURTLE')
  assert.equal(proposal.entityTypes.length, 2)
  assert.equal(proposal.entityTypes[0]?.type.properties[0]?.dataType, 'boolean')
  assert.equal(proposal.relationshipTypes[0]?.type.id, 'operates')
})

test('previews CSV headers and sampled values as an inferred entity schema', () => {
  const proposal = previewImport({
    contract: counterpartyRiskContract,
    sourceName: 'service-events.csv',
    sourceText: `event_id,severity,active,occurred_at,amount,notes
evt-1,critical,true,2026-07-20T10:30:00Z,12.50,"line one, with comma"
evt-2,warning,false,2026-07-21T11:45:00Z,8.25,line two
evt-3,critical,true,2026-07-21T12:00:00Z,9.75,line three`,
  })

  assert.equal(proposal.format, 'CSV')
  assert.equal(proposal.entityTypes[0]?.type.id, 'service_events')
  assert.equal(proposal.entityTypes[0]?.type.properties.find((property) => property.id.endsWith('.event_id'))?.identifier, true)
  assert.equal(proposal.entityTypes[0]?.type.properties.find((property) => property.id.endsWith('.severity'))?.dataType, 'enum')
  assert.equal(proposal.entityTypes[0]?.type.properties.find((property) => property.id.endsWith('.active'))?.dataType, 'boolean')
  assert.equal(proposal.entityTypes[0]?.type.properties.find((property) => property.id.endsWith('.occurred_at'))?.dataType, 'datetime')
  assert.equal(proposal.entityTypes[0]?.type.properties.find((property) => property.id.endsWith('.amount'))?.dataType, 'decimal')
})
