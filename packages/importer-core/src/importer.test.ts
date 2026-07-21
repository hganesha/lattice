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
