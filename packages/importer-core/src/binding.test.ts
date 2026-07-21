import assert from 'node:assert/strict'
import test from 'node:test'
import { connectorCatalog, connectorTemplate } from '@lattice/contracts'
import { previewBindingSource } from './binding.js'

test('ships governed templates for major data platforms without embedded credentials', () => {
  for (const provider of ['DATABRICKS', 'MICROSOFT_FABRIC', 'SNOWFLAKE', 'BIGQUERY', 'POSTGRESQL'] as const) {
    const template = connectorTemplate(provider)
    assert.ok(template.credentialRefPlaceholder.includes(':'))
    assert.ok(template.docsUrl.startsWith('https://'))
  }
  assert.equal(new Set(connectorCatalog.map((item) => item.id)).size, connectorCatalog.length)
  assert.equal(connectorCatalog.some((item) => item.credentialRefPlaceholder.includes('actual-credential')), false)
})

test('discovers OpenAPI operations and flattens governed response fields', () => {
  const preview = previewBindingSource({
    contractId: 'grid_outage',
    sourceName: 'grid-api.yaml',
    sourceText: `
openapi: 3.1.0
info: { title: Grid API, version: 1.0.0 }
paths:
  /outages/{id}:
    get:
      operationId: getOutage
      summary: Get current outage
      responses:
        '200':
          description: Current outage
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Outage'
components:
  schemas:
    Outage:
      type: object
      required: [eventId]
      properties:
        eventId: { type: string }
        severity: { type: string, enum: [MINOR, MAJOR] }
        affected:
          type: object
          properties:
            assetId: { type: string }
`,
  })

  assert.equal(preview.operations[0]?.operationId, 'getOutage')
  assert.deepEqual(preview.operations[0]?.fields.map((field) => field.path), ['$.eventId', '$.severity', '$.affected.assetId'])
  assert.equal(preview.operations[0]?.fields[0]?.required, true)
  assert.equal(preview.operations[0]?.fields[1]?.dataType, 'enum')
  assert.match(preview.sourceChecksum, /^sha256:[a-f0-9]{64}$/)
})

test('discovers tabular fields for governed warehouse bindings', () => {
  const preview = previewBindingSource({
    contractId: 'grid_outage',
    sourceName: 'operations.current_outages',
    format: 'TABULAR_SCHEMA',
    operationId: 'grid.query_current_outages',
    operationLabel: 'Query current outages',
    sourceText: `
fields:
  - { name: event_id, type: varchar, nullable: false }
  - { name: severity, type: string, required: true }
  - { name: started_at, type: timestamp_ntz }
  - { name: customers_affected, type: bigint }
`,
  })

  assert.equal(preview.operations[0]?.method, 'QUERY')
  assert.equal(preview.operations[0]?.operationId, 'grid.query_current_outages')
  assert.deepEqual(preview.operations[0]?.fields.map((field) => field.dataType), ['string', 'string', 'date-time', 'integer'])
  assert.deepEqual(preview.operations[0]?.fields.map((field) => field.required), [true, true, false, false])
})
