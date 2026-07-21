import assert from 'node:assert/strict'
import test from 'node:test'
import type { SourceBinding } from '@lattice/contracts'
import { discoverConnector, executeConnector, validateConnectorBinding } from './connectors.js'

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

function postgresqlBinding(): SourceBinding {
  return {
    ...databricksBinding('SELECT id, status FROM public.counterparty WHERE id = $1'),
    id: 'binding_postgresql_counterparty',
    sourceSystem: 'PostgreSQL',
    endpoint: 'postgresql://db.example.internal:5432/governed',
    requiredPermissions: ['postgres.context.read'],
    connector: {
      provider: 'POSTGRESQL',
      transport: 'POSTGRES_WIRE',
      credentialRef: 'env:LATTICE_TEST_POSTGRES_URL',
      resource: { database: 'governed', schema: 'public', object: 'counterparty' },
      queryTemplate: 'SELECT id, status FROM public.counterparty WHERE id = $1',
      parameterStyle: 'POSITIONAL',
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

test('discovers Databricks Unity Catalog columns and binds plan arguments during execution', async () => {
  process.env.LATTICE_TEST_DATABRICKS_TOKEN = 'test-token'
  const requests: Array<{ url: string; method: string; body?: Record<string, unknown> }> = []
  const runtime = {
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), method: init?.method ?? 'GET', ...(init?.body ? { body: JSON.parse(String(init.body)) as Record<string, unknown> } : {}) })
      if ((init?.method ?? 'GET') === 'GET') return new Response(JSON.stringify({ full_name: 'risk.governed.counterparty', columns: [{ name: 'id', type_name: 'STRING', nullable: false, position: 0 }, { name: 'limit_amount', type_name: 'DECIMAL', nullable: true, position: 1 }] }), { status: 200 })
      return new Response(JSON.stringify({ status: { state: 'SUCCEEDED' }, manifest: { schema: { columns: [{ name: 'id' }, { name: 'status' }] } }, result: { data_array: [['cp-42', 'approved']] } }), { status: 200 })
    },
  }
  try {
    const preview = await discoverConnector(databricksBinding(), 'contract-risk', 'risk.governed.counterparty', runtime)
    const payload = await executeConnector(databricksBinding(), { id: { entityId: 'cp-42' } }, runtime)

    assert.equal(requests[0]?.url, 'https://workspace.cloud.databricks.com/api/2.1/unity-catalog/tables/risk.governed.counterparty')
    assert.deepEqual(preview.operations[0]?.fields.map((field) => [field.path, field.dataType, field.required]), [['$.id', 'string', true], ['$.limit_amount', 'number', false]])
    assert.deepEqual(payload, { id: 'cp-42', status: 'approved' })
    assert.match(String(requests[1]?.body?.statement), /LIMIT 1$/)
    assert.deepEqual(requests[1]?.body?.parameters, [{ name: 'id', value: 'cp-42' }])
  } finally {
    delete process.env.LATTICE_TEST_DATABRICKS_TOKEN
  }
})

test('uses the native PostgreSQL driver for catalog discovery and bounded parameterized execution', async () => {
  process.env.LATTICE_TEST_POSTGRES_URL = 'postgresql://context_reader:secret@db.example.internal:5432/governed'
  const discoveryQueries: Array<string | { text: string; values?: unknown[] }> = []
  let discoveryEnded = false
  const discoveryRuntime = {
    createPostgresClient: () => ({
      connect: async () => undefined,
      query: async (query: string | { text: string; values?: unknown[] }) => {
        discoveryQueries.push(query)
        return { rows: [{ column_name: 'id', data_type: 'uuid', udt_name: 'uuid', is_nullable: 'NO', ordinal_position: 1 }, { column_name: 'exposure', data_type: 'numeric', udt_name: 'numeric', is_nullable: 'YES', ordinal_position: 2 }] } as never
      },
      end: async () => { discoveryEnded = true },
    }),
  }
  const executionQueries: Array<string | { text: string; values?: unknown[] }> = []
  let executionEnded = false
  const executionRuntime = {
    createPostgresClient: () => ({
      connect: async () => undefined,
      query: async (query: string | { text: string; values?: unknown[] }) => {
        executionQueries.push(query)
        return typeof query === 'string' ? { rows: [] } as never : { rows: [{ id: 'cp-42', status: 'approved' }] } as never
      },
      end: async () => { executionEnded = true },
    }),
  }
  try {
    const validation = validateConnectorBinding(postgresqlBinding())
    const preview = await discoverConnector(postgresqlBinding(), 'contract-risk', 'public.counterparty', discoveryRuntime)
    const payload = await executeConnector(postgresqlBinding(), { id: { entityId: 'cp-42' } }, executionRuntime)

    assert.equal(validation.status, 'READY')
    assert.equal(validation.driver, 'BUILT_IN_NATIVE')
    assert.deepEqual((discoveryQueries[0] as { values: unknown[] }).values, ['governed', 'public', 'counterparty'])
    assert.deepEqual(preview.operations[0]?.fields.map((field) => [field.path, field.dataType, field.required]), [['$.id', 'string', true], ['$.exposure', 'number', false]])
    assert.equal(discoveryEnded, true)
    assert.equal(executionQueries[0], 'BEGIN READ ONLY')
    assert.match((executionQueries[1] as { text: string }).text, /LIMIT 1$/)
    assert.deepEqual((executionQueries[1] as { values: unknown[] }).values, ['cp-42'])
    assert.equal(executionQueries[2], 'ROLLBACK')
    assert.equal(executionEnded, true)
    assert.deepEqual(payload, { id: 'cp-42', status: 'approved' })
  } finally {
    delete process.env.LATTICE_TEST_POSTGRES_URL
  }
})

test('rejects PostgreSQL credentials in contract endpoints and connection scope mismatches', async () => {
  const embeddedCredentialBinding = postgresqlBinding()
  embeddedCredentialBinding.endpoint = 'postgresql://context_reader:secret@db.example.internal:5432/governed'
  assert.equal(validateConnectorBinding(embeddedCredentialBinding).status, 'INVALID')

  process.env.LATTICE_TEST_POSTGRES_URL = 'postgresql://context_reader:secret@other.example.internal:5432/governed'
  let clientCreated = false
  try {
    await assert.rejects(
      discoverConnector(postgresqlBinding(), 'contract-risk', 'public.counterparty', {
        createPostgresClient: () => {
          clientCreated = true
          throw new Error('client should not be created')
        },
      }),
      /POSTGRES_ENDPOINT_SCOPE_MISMATCH/,
    )
    assert.equal(clientCreated, false)
  } finally {
    delete process.env.LATTICE_TEST_POSTGRES_URL
  }
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
