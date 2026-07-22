import assert from 'node:assert/strict'
import test from 'node:test'
import type { SourceBinding } from '@lattice/contracts'
import { discoverConnector, executeConnector, probeConnectorHealth, validateConnectorBinding } from './connectors.js'

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

function fabricBinding(queryTemplate = 'SELECT id, status FROM dbo.counterparty WHERE id = @id'): SourceBinding {
  return {
    ...databricksBinding(),
    id: 'binding_fabric_counterparty',
    sourceSystem: 'Microsoft Fabric',
    endpoint: 'risk.datawarehouse.fabric.microsoft.com',
    requiredPermissions: ['fabric.warehouse.read'],
    connector: {
      provider: 'MICROSOFT_FABRIC',
      transport: 'TDS',
      credentialRef: 'env:LATTICE_TEST_FABRIC_TOKEN',
      resource: { workspace: 'risk', database: 'governed', schema: 'dbo', object: 'counterparty' },
      queryTemplate,
      parameterStyle: 'NAMED',
      readOnly: true,
    },
  }
}

function kafkaBinding(): SourceBinding {
  return {
    ...databricksBinding(),
    id: 'binding_kafka_counterparty',
    sourceSystem: 'Apache Kafka',
    endpoint: 'broker.example.internal:9093',
    requiredPermissions: ['kafka.topic.consume'],
    connector: {
      provider: 'KAFKA',
      transport: 'KAFKA',
      credentialRef: 'vault:kafka/context-consumer',
      resource: { topic: 'counterparty-events' },
      parameterStyle: 'NONE',
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

test('uses native Fabric TDS for information schema discovery and bounded parameterized execution', async () => {
  process.env.LATTICE_TEST_FABRIC_TOKEN = 'fabric-access-token'
  const configs: Array<{ server: string; port: number; database: string; token: string }> = []
  const queries: Array<{ text: string; parameters?: Record<string, string | number | boolean>; maxRows?: number }> = []
  let closeCount = 0
  const runtime = {
    createFabricClient: (config: { server: string; port: number; database: string; token: string }) => {
      configs.push(config)
      return {
        connect: async () => undefined,
        query: async (text: string, parameters?: Record<string, string | number | boolean>, maxRows?: number) => {
          queries.push({ text, ...(parameters ? { parameters } : {}), ...(maxRows === undefined ? {} : { maxRows }) })
          return text.includes('INFORMATION_SCHEMA.COLUMNS')
            ? [{ column_name: 'id', data_type: 'uniqueidentifier', is_nullable: 'NO', ordinal_position: 1 }, { column_name: 'exposure', data_type: 'decimal', is_nullable: 'YES', ordinal_position: 2 }]
            : [{ id: 'cp-42', status: 'approved' }]
        },
        close: () => { closeCount += 1 },
      }
    },
  }
  try {
    const validation = validateConnectorBinding(fabricBinding())
    const preview = await discoverConnector(fabricBinding(), 'contract-risk', 'governed.dbo.counterparty', runtime)
    const payload = await executeConnector(fabricBinding(), { id: { entityId: 'cp-42' } }, runtime)

    assert.equal(validation.status, 'READY')
    assert.equal(validation.driver, 'BUILT_IN_NATIVE')
    assert.deepEqual(configs[0], { server: 'risk.datawarehouse.fabric.microsoft.com', port: 1433, database: 'governed', token: 'fabric-access-token', connectTimeoutMs: 5_000, requestTimeoutMs: 12_000 })
    assert.deepEqual(queries[0]?.parameters, { database: 'governed', schema: 'dbo', object: 'counterparty' })
    assert.deepEqual(preview.operations[0]?.fields.map((field) => [field.path, field.dataType, field.required]), [['$.id', 'string', true], ['$.exposure', 'number', false]])
    assert.equal(queries[1]?.text, 'SELECT id, status FROM dbo.counterparty WHERE id = @id')
    assert.deepEqual(queries[1]?.parameters, { id: 'cp-42' })
    assert.equal(queries[1]?.maxRows, 1)
    assert.deepEqual(payload, { id: 'cp-42', status: 'approved' })
    assert.equal(closeCount, 2)
  } finally {
    delete process.env.LATTICE_TEST_FABRIC_TOKEN
  }
})

test('rejects Fabric endpoints outside the encrypted warehouse boundary', () => {
  const binding = fabricBinding()
  binding.endpoint = 'attacker.example.com:1433'
  assert.equal(validateConnectorBinding(binding).status, 'INVALID')
  binding.endpoint = 'risk.datawarehouse.fabric.microsoft.com:1444'
  assert.equal(validateConnectorBinding(binding).status, 'INVALID')
})

test('preserves Fabric CTE syntax and closes the TDS client when connection fails', async () => {
  process.env.LATTICE_TEST_FABRIC_TOKEN = 'fabric-access-token'
  const cte = 'WITH scoped AS (SELECT id FROM dbo.counterparty) SELECT id FROM scoped'
  let executedQuery = ''
  let executionClosed = false
  let failedConnectionClosed = false
  try {
    const payload = await executeConnector(fabricBinding(cte), {}, {
      createFabricClient: () => ({
        connect: async () => undefined,
        query: async (text, _parameters, maxRows) => {
          executedQuery = text
          assert.equal(maxRows, 1)
          return [{ id: 'cp-42' }]
        },
        close: () => { executionClosed = true },
      }),
    })
    assert.deepEqual(payload, { id: 'cp-42' })
    assert.equal(executedQuery, cte)
    assert.equal(executionClosed, true)

    await assert.rejects(
      executeConnector(fabricBinding(cte), {}, {
        createFabricClient: () => ({
          connect: async () => { throw new Error('TDS_CONNECT_FAILED') },
          query: async () => { throw new Error('query should not run') },
          close: () => { failedConnectionClosed = true },
        }),
      }),
      /TDS_CONNECT_FAILED/,
    )
    assert.equal(failedConnectionClosed, true)
  } finally {
    delete process.env.LATTICE_TEST_FABRIC_TOKEN
  }
})

test('resolves vault credentials through the server-side broker and reports sanitized live health', async () => {
  const binding = fabricBinding()
  binding.connector!.credentialRef = 'vault:fabric/risk-reader'
  process.env.LATTICE_CREDENTIAL_BROKER_URL = 'https://credentials.example.internal'
  process.env.LATTICE_CREDENTIAL_BROKER_TOKEN = 'broker-auth-secret'
  const brokerRequests: Array<{ url: string; authorization?: string; body: Record<string, unknown> }> = []
  try {
    const health = await probeConnectorHealth(binding, {
      fetch: async (input, init) => {
        brokerRequests.push({ url: String(input), ...(init?.headers && typeof init.headers === 'object' && !Array.isArray(init.headers) ? { authorization: (init.headers as Record<string, string>).Authorization } : {}), body: JSON.parse(String(init?.body)) as Record<string, unknown> })
        return new Response(JSON.stringify({ value: 'provider-access-secret', expiresAt: '2099-07-22T13:00:00.000Z' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
      createFabricClient: () => ({
        connect: async () => undefined,
        query: async () => [{ column_name: 'id', data_type: 'uniqueidentifier', is_nullable: 'NO', ordinal_position: 1 }],
        close: () => undefined,
      }),
    })

    assert.equal(health.status, 'HEALTHY')
    assert.equal(health.credentialSource, 'BROKER')
    assert.equal(health.probe, 'LIVE_DISCOVERY')
    assert.equal(brokerRequests[0]?.url, 'https://credentials.example.internal/v1/credentials/resolve')
    assert.equal(brokerRequests[0]?.authorization, 'Bearer broker-auth-secret')
    assert.deepEqual(brokerRequests[0]?.body, { reference: 'vault:fabric/risk-reader', provider: 'MICROSOFT_FABRIC', resource: { workspace: 'risk', database: 'governed', schema: 'dbo', object: 'counterparty' } })
    assert.doesNotMatch(JSON.stringify(health), /provider-access-secret|broker-auth-secret/)
  } finally {
    delete process.env.LATTICE_CREDENTIAL_BROKER_URL
    delete process.env.LATTICE_CREDENTIAL_BROKER_TOKEN
  }
})

test('rejects insecure remote credential brokers without exposing resolver details', async () => {
  const binding = fabricBinding()
  binding.connector!.credentialRef = 'vault:fabric/risk-reader'
  process.env.LATTICE_CREDENTIAL_BROKER_URL = 'http://credentials.example.internal'
  try {
    const health = await probeConnectorHealth(binding)
    assert.equal(health.status, 'UNHEALTHY')
    assert.equal(health.errorCode, 'CREDENTIAL_BROKER_TRANSPORT_NOT_ALLOWED')
    assert.doesNotMatch(JSON.stringify(health), /credentials\.example\.internal/)
  } finally {
    delete process.env.LATTICE_CREDENTIAL_BROKER_URL
  }
})

test('rejects expired credentials from injected runtime resolvers', async () => {
  const binding = fabricBinding()
  binding.connector!.credentialRef = 'managed-identity:fabric-runtime'
  const health = await probeConnectorHealth(binding, {
    credentialResolvers: [{
      id: 'managed-identity',
      supports: (reference) => reference.startsWith('managed-identity:'),
      resolve: async () => ({ value: 'expired-provider-secret', expiresAt: '2020-01-01T00:00:00.000Z' }),
    }],
  })
  assert.equal(health.status, 'UNHEALTHY')
  assert.equal(health.errorCode, 'CREDENTIAL_EXPIRED')
  assert.doesNotMatch(JSON.stringify(health), /expired-provider-secret/)
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
    assert.equal(payload.binding.connector?.provider, 'KAFKA')
    return new Response(JSON.stringify({ id: 'cp-42', status: 'approved' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const validation = validateConnectorBinding(kafkaBinding())
    assert.equal(validation.status, 'READY')
    assert.equal(validation.driver, 'EXTERNAL_GATEWAY')
    assert.deepEqual(await executeConnector(kafkaBinding()), { id: 'cp-42', status: 'approved' })
  } finally {
    delete process.env.LATTICE_CONNECTOR_GATEWAY_URL
    globalThis.fetch = originalFetch
  }
})
