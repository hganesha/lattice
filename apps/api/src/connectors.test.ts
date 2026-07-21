import assert from 'node:assert/strict'
import test from 'node:test'
import type { SourceBinding } from '@lattice/contracts'
import { executeConnector, validateConnectorBinding } from './connectors.js'

function databricksBinding(queryTemplate = 'SELECT id, status FROM governed.counterparty WHERE id = :id'): SourceBinding {
  return {
    id: 'binding_databricks_counterparty',
    sourceSystem: 'Databricks',
    operationId: 'counterparty.lookup',
    environment: 'test',
    freshnessMinutes: 15,
    requiredPermissions: ['databricks.sql.read'],
    expectedResultSchema: 'counterparty',
    version: '1',
    approvalStatus: 'APPROVED',
    endpoint: 'https://workspace.cloud.databricks.com',
    method: 'POST',
    executionMode: 'CONNECTOR',
    connector: {
      provider: 'DATABRICKS',
      transport: 'HTTPS',
      credentialRef: 'env:LATTICE_TEST_DATABRICKS_TOKEN',
      resource: { warehouse: 'warehouse-id', catalog: 'risk', schema: 'governed', object: 'counterparty' },
      queryTemplate,
      parameterStyle: 'NAMED',
      readOnly: true,
    },
  }
}

function fabricBinding(): SourceBinding {
  return {
    ...databricksBinding(),
    id: 'binding_fabric_counterparty',
    sourceSystem: 'Microsoft Fabric',
    endpoint: 'risk.datawarehouse.fabric.microsoft.com',
    requiredPermissions: ['fabric.warehouse.read'],
    connector: {
      provider: 'MICROSOFT_FABRIC',
      transport: 'TDS',
      credentialRef: 'managed-identity:fabric-runtime',
      resource: { workspace: 'risk', database: 'governed', schema: 'dbo', object: 'counterparty' },
      queryTemplate: 'SELECT id, status FROM dbo.counterparty WHERE id = @id',
      parameterStyle: 'NAMED',
      readOnly: true,
    },
  }
}

test('validates a built-in connector and resolves environment credentials', () => {
  process.env.LATTICE_TEST_DATABRICKS_TOKEN = 'test-token'
  try {
    const result = validateConnectorBinding(databricksBinding())
    assert.equal(result.status, 'READY')
    assert.equal(result.driver, 'BUILT_IN_HTTP')
    assert.equal(result.credentialState, 'AVAILABLE')
  } finally {
    delete process.env.LATTICE_TEST_DATABRICKS_TOKEN
  }
})

test('rejects mutating query templates before connector execution', () => {
  const result = validateConnectorBinding(databricksBinding('DELETE FROM governed.counterparty'))
  assert.equal(result.status, 'INVALID')
  assert.equal(result.checks.find((check) => check.id === 'query')?.status, 'FAIL')
})

test('dispatches external transports through the local connector gateway', async () => {
  const originalFetch = globalThis.fetch
  process.env.LATTICE_CONNECTOR_GATEWAY_URL = 'http://127.0.0.1:9797'
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'http://127.0.0.1:9797/v1/execute')
    assert.equal(init?.method, 'POST')
    const payload = JSON.parse(String(init?.body)) as { binding: SourceBinding }
    assert.equal(payload.binding.connector?.provider, 'MICROSOFT_FABRIC')
    return new Response(JSON.stringify({ id: 'cp-42', status: 'approved' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const validation = validateConnectorBinding(fabricBinding())
    assert.equal(validation.status, 'READY')
    assert.equal(validation.driver, 'EXTERNAL_GATEWAY')
    assert.deepEqual(await executeConnector(fabricBinding()), { id: 'cp-42', status: 'approved' })
  } finally {
    delete process.env.LATTICE_CONNECTOR_GATEWAY_URL
    globalThis.fetch = originalFetch
  }
})
