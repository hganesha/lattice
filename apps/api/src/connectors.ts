import { createHash, randomUUID } from 'node:crypto'
import { Client, type ClientConfig, type QueryResult } from 'pg'
import { Connection, Request, TYPES, type ConnectionConfiguration } from 'tedious'
import { connectorTemplate, type BindingPreview, type BindingSourceField, type ConnectorHealthRecord, type ConnectorValidationResult, type SourceBinding } from '@lattice/contracts'

type JsonObject = Record<string, unknown>
type ConnectorArgument = { entityId: string } | string | number | boolean
type PostgresRow = Record<string, unknown>

interface PostgresClient {
  connect(): Promise<unknown>
  query(query: string | { text: string; values?: unknown[] }): Promise<QueryResult<PostgresRow>>
  end(): Promise<void>
}

export interface FabricClientConfig {
  server: string
  port: number
  database: string
  token: string
  connectTimeoutMs: number
  requestTimeoutMs: number
}

export interface FabricClient {
  connect(): Promise<void>
  query(text: string, parameters?: Record<string, string | number | boolean>, maxRows?: number): Promise<JsonObject[]>
  close(): void
}

export interface ResolvedConnectorCredential {
  value: string
  expiresAt?: string
}

export interface ConnectorCredentialResolver {
  id: string
  supports(reference: string): boolean
  resolve(context: { reference: string; binding: SourceBinding }): Promise<ResolvedConnectorCredential>
}

export type ConnectorHealthProbe = Omit<ConnectorHealthRecord, 'id' | 'lastSuccessfulAt' | 'freshnessStatus' | 'maximumFreshnessMinutes'>
type LocatedConnectorCredential = ResolvedConnectorCredential & { source: ConnectorHealthRecord['credentialSource'] }

export interface ConnectorRuntime {
  fetch?: typeof globalThis.fetch
  createPostgresClient?: (config: ClientConfig) => PostgresClient
  createFabricClient?: (config: FabricClientConfig) => FabricClient
  credentialResolvers?: ConnectorCredentialResolver[]
}

const builtInHttpProviders = new Set(['OPENAPI', 'DATABRICKS', 'SNOWFLAKE', 'BIGQUERY'])
const builtInNativeProviders = new Set(['POSTGRESQL', 'MICROSOFT_FABRIC'])
const liveDiscoveryProviders = new Set(['DATABRICKS', 'POSTGRESQL', 'MICROSOFT_FABRIC'])

export function validateConnectorBinding(binding: SourceBinding): ConnectorValidationResult {
  if (!binding.connector) throw new Error('CONNECTOR_CONFIG_REQUIRED')
  const template = connectorTemplate(binding.connector.provider)
  const checks: ConnectorValidationResult['checks'] = []
  const endpointValid = validEndpoint(binding.endpoint, template.transport)
  checks.push({ id: 'endpoint', status: endpointValid ? 'PASS' : 'FAIL', message: endpointValid ? `${template.transport} endpoint is declared.` : `A valid ${template.transport} endpoint is required.` })
  const missingResources = template.resourceFields.filter((field) => !binding.connector?.resource[field]?.trim())
  checks.push({ id: 'resource', status: missingResources.length === 0 ? 'PASS' : 'FAIL', message: missingResources.length === 0 ? 'Provider resource scope is complete.' : `Missing resource fields: ${missingResources.join(', ')}.` })
  const queryValid = template.operationVerb !== 'QUERY' || isReadOnlyQuery(binding.connector.queryTemplate)
  checks.push({ id: 'query', status: queryValid ? 'PASS' : 'FAIL', message: queryValid ? 'The operation is constrained to a read-only query or selector.' : 'Query bindings must contain one read-only SELECT or WITH statement.' })
  const credentialState = credentialStateFor(binding.connector.credentialRef)
  checks.push({ id: 'credential', status: credentialState === 'MISSING' ? 'FAIL' : credentialState === 'AVAILABLE' ? 'PASS' : 'INFO', message: credentialState === 'AVAILABLE' ? 'A credential resolver is configured in this runtime.' : credentialState === 'EXTERNAL' ? 'Credential reference is delegated to the external connector runtime.' : 'Credential reference is missing or unresolved.' })
  const gatewayAvailable = Boolean(process.env.LATTICE_CONNECTOR_GATEWAY_URL)
  const driver: ConnectorValidationResult['driver'] = builtInHttpProviders.has(binding.connector.provider) ? 'BUILT_IN_HTTP' : builtInNativeProviders.has(binding.connector.provider) ? 'BUILT_IN_NATIVE' : gatewayAvailable ? 'EXTERNAL_GATEWAY' : 'NOT_AVAILABLE'
  checks.push({ id: 'driver', status: driver === 'NOT_AVAILABLE' ? 'INFO' : 'PASS', message: driver === 'BUILT_IN_HTTP' ? 'A built-in HTTPS driver is available.' : driver === 'BUILT_IN_NATIVE' ? 'A built-in native driver is available.' : driver === 'EXTERNAL_GATEWAY' ? 'The external connector gateway is configured.' : 'This transport requires LATTICE_CONNECTOR_GATEWAY_URL at execution time.' })
  const invalid = checks.some((check) => check.status === 'FAIL' && check.id !== 'credential') || !binding.connector.readOnly
  const executable = !invalid && (credentialState === 'AVAILABLE' && (driver === 'BUILT_IN_HTTP' || driver === 'BUILT_IN_NATIVE') || gatewayAvailable)
  return { provider: binding.connector.provider, status: invalid ? 'INVALID' : executable ? 'READY' : 'CONFIGURED', driver, credentialState, checks }
}

export async function executeConnector(binding: SourceBinding, parameters: Record<string, ConnectorArgument> = {}, runtime: ConnectorRuntime = {}): Promise<JsonObject> {
  if (!binding.connector) throw new Error('CONNECTOR_CONFIG_REQUIRED')
  const validation = validateConnectorBinding(binding)
  if (validation.status === 'INVALID') throw new Error('CONNECTOR_CONFIG_INVALID')
  const resolved = builtInHttpProviders.has(binding.connector.provider) || builtInNativeProviders.has(binding.connector.provider)
    ? await resolveConnectorCredential(binding, runtime)
    : undefined
  const token = resolved?.value
  if (token && builtInHttpProviders.has(binding.connector.provider)) {
    if (binding.connector.provider === 'DATABRICKS') return executeDatabricks(binding, token, parameters, runtime)
    if (binding.connector.provider === 'SNOWFLAKE') return executeSnowflake(binding, token, runtime)
    if (binding.connector.provider === 'BIGQUERY') return executeBigQuery(binding, token, runtime)
  }
  if (token && binding.connector.provider === 'POSTGRESQL') return executePostgresql(binding, token, parameters, runtime)
  if (token && binding.connector.provider === 'MICROSOFT_FABRIC') return executeFabric(binding, token, parameters, runtime)
  const gateway = process.env.LATTICE_CONNECTOR_GATEWAY_URL
  if (gateway) return executeGateway(gateway, binding, parameters, runtime)
  if (!token) throw new Error(`CREDENTIAL_RESOLVER_NOT_CONFIGURED:${binding.connector.credentialRef}`)
  throw new Error(`CONNECTOR_DRIVER_NOT_AVAILABLE:${binding.connector.provider}`)
}

export async function discoverConnector(binding: SourceBinding, contractId: string, sourceName: string, runtime: ConnectorRuntime = {}): Promise<BindingPreview> {
  if (!binding.connector) throw new Error('CONNECTOR_CONFIG_REQUIRED')
  const validation = validateConnectorBinding(binding)
  if (validation.status === 'INVALID') throw new Error('CONNECTOR_CONFIG_INVALID')
  const resolved = liveDiscoveryProviders.has(binding.connector.provider) ? await resolveConnectorCredential(binding, runtime) : undefined
  const credential = resolved?.value
  let fields: BindingSourceField[]
  let canonicalMetadata: unknown
  if (binding.connector.provider === 'DATABRICKS' && credential) {
    const discovered = await discoverDatabricks(binding, credential, runtime)
    fields = discovered.fields
    canonicalMetadata = discovered.metadata
  } else if (binding.connector.provider === 'POSTGRESQL' && credential) {
    const discovered = await discoverPostgresql(binding, credential, runtime)
    fields = discovered.fields
    canonicalMetadata = discovered.metadata
  } else if (binding.connector.provider === 'MICROSOFT_FABRIC' && credential) {
    const discovered = await discoverFabric(binding, credential, runtime)
    fields = discovered.fields
    canonicalMetadata = discovered.metadata
  } else {
    const gateway = process.env.LATTICE_CONNECTOR_GATEWAY_URL
    if (!gateway) throw new Error(credential ? `CONNECTOR_DISCOVERY_NOT_AVAILABLE:${binding.connector.provider}` : `CREDENTIAL_RESOLVER_NOT_CONFIGURED:${binding.connector.credentialRef}`)
    return discoverGateway(gateway, binding, contractId, sourceName, runtime)
  }
  if (fields.length === 0) throw new Error('NO_SOURCE_FIELDS_FOUND')
  const operationId = binding.operationId.trim() || `${binding.connector.provider.toLocaleLowerCase()}.query_${slugify(sourceName)}`
  return {
    id: `binding_preview_${randomUUID()}`,
    contractId,
    sourceName,
    sourceChecksum: digest(canonicalMetadata),
    createdAt: new Date().toISOString(),
    operations: [{ id: operationId, operationId, method: 'QUERY', path: sourceName, summary: `Query ${sourceName}`, expectedResultSchema: binding.expectedResultSchema || `${slugify(sourceName)}_row`, fields }],
    warnings: [],
  }
}

export async function probeConnectorHealth(binding: SourceBinding, runtime: ConnectorRuntime = {}): Promise<ConnectorHealthProbe> {
  const startedAt = Date.now()
  const checkedAt = new Date().toISOString()
  const base = { bindingId: binding.id, provider: binding.connector?.provider ?? 'OPENAPI' as const, checkedAt }
  if (!binding.connector) return { ...base, status: 'UNHEALTHY', latencyMs: Date.now() - startedAt, credentialSource: 'UNRESOLVED', probe: 'CONFIGURATION_ONLY', checks: [{ id: 'binding', status: 'FAIL', message: 'Connector metadata is required for a health probe.' }], errorCode: 'CONNECTOR_CONFIG_REQUIRED' }

  const validation = validateConnectorBinding(binding)
  if (validation.status === 'INVALID' || validation.driver === 'NOT_AVAILABLE') {
    return {
      ...base,
      provider: binding.connector.provider,
      status: 'UNHEALTHY',
      latencyMs: Date.now() - startedAt,
      credentialSource: 'UNRESOLVED',
      probe: 'CONFIGURATION_ONLY',
      checks: validation.checks,
      errorCode: validation.status === 'INVALID' ? 'CONNECTOR_CONFIG_INVALID' : 'CONNECTOR_DRIVER_NOT_AVAILABLE',
    }
  }

  if (!liveDiscoveryProviders.has(binding.connector.provider)) {
    const delegated = validation.driver === 'EXTERNAL_GATEWAY'
    try {
      const credential = delegated ? undefined : await resolveConnectorCredential(binding, runtime)
      if (!delegated && !credential) throw new Error('CREDENTIAL_RESOLVER_NOT_CONFIGURED')
      return {
        ...base,
        provider: binding.connector.provider,
        status: 'DEGRADED',
        latencyMs: Date.now() - startedAt,
        credentialSource: delegated ? 'DELEGATED' : credential?.source ?? 'UNRESOLVED',
        probe: 'CONFIGURATION_ONLY',
        checks: [...validation.checks, { id: 'reachability', status: 'INFO', message: 'This adapter does not expose a non-invasive live metadata probe.' }],
      }
    } catch (error) {
      return failedHealthProbe(base, binding, validation, startedAt, error)
    }
  }

  let credentialSource: ConnectorHealthRecord['credentialSource'] = 'UNRESOLVED'
  try {
    const credential = await resolveConnectorCredential(binding, runtime)
    if (!credential) throw new Error('CREDENTIAL_RESOLVER_NOT_CONFIGURED')
    credentialSource = credential.source
    const sourceName = [binding.connector.resource.catalog, binding.connector.resource.database, binding.connector.resource.schema, binding.connector.resource.object].filter(Boolean).join('.')
    await discoverConnector(binding, `health:${binding.id}`, sourceName, { ...runtime, credentialResolvers: [fixedCredentialResolver(binding.connector.credentialRef, credential)] })
    return {
      ...base,
      provider: binding.connector.provider,
      status: 'HEALTHY',
      latencyMs: Date.now() - startedAt,
      credentialSource: credential.source,
      probe: 'LIVE_DISCOVERY',
      checks: [...validation.checks, { id: 'reachability', status: 'PASS', message: 'Provider metadata is reachable within the governed resource scope.' }],
    }
  } catch (error) {
    return failedHealthProbe(base, binding, validation, startedAt, error, credentialSource)
  }
}

async function executeDatabricks(binding: SourceBinding, token: string, parameters: Record<string, ConnectorArgument>, runtime: ConnectorRuntime): Promise<JsonObject> {
  const connector = binding.connector!
  const endpoint = providerUrl(binding, '/api/2.0/sql/statements', ['databricks.com', 'azuredatabricks.net'])
  const payload = await postJson(endpoint, token, {
    warehouse_id: connector.resource.warehouse,
    catalog: connector.resource.catalog,
    schema: connector.resource.schema,
    statement: boundedQuery(connector.queryTemplate),
    parameters: Object.entries(parameters).map(([name, value]) => ({ name, value: String(argumentValue(value)) })),
    wait_timeout: '10s',
    on_wait_timeout: 'CANCEL',
    disposition: 'INLINE',
    format: 'JSON_ARRAY',
  }, runtime)
  const status = objectValue(payload.status)?.state
  if (status && status !== 'SUCCEEDED') throw new Error(`DATABRICKS_STATEMENT_${String(status)}`)
  const columns = arrayValue(objectValue(objectValue(payload.manifest)?.schema)?.columns).map((column) => String(objectValue(column)?.name ?? ''))
  const row = arrayValue(objectValue(payload.result)?.data_array)[0]
  return rowRecord(columns, arrayValue(row))
}

async function executeSnowflake(binding: SourceBinding, token: string, runtime: ConnectorRuntime): Promise<JsonObject> {
  const connector = binding.connector!
  const endpoint = providerUrl(binding, '/api/v2/statements', ['snowflakecomputing.com'])
  const payload = await postJson(endpoint, token, {
    statement: connector.queryTemplate,
    warehouse: connector.resource.warehouse,
    database: connector.resource.database,
    schema: connector.resource.schema,
    timeout: 30,
  }, runtime)
  const columns = arrayValue(objectValue(payload.resultSetMetaData)?.rowType).map((column) => String(objectValue(column)?.name ?? ''))
  const row = arrayValue(payload.data)[0]
  return rowRecord(columns, arrayValue(row))
}

async function executeBigQuery(binding: SourceBinding, token: string, runtime: ConnectorRuntime): Promise<JsonObject> {
  const connector = binding.connector!
  const project = encodeURIComponent(connector.resource.project ?? '')
  const endpoint = new URL(`/bigquery/v2/projects/${project}/queries`, providerUrl(binding, '', ['bigquery.googleapis.com']))
  const payload = await postJson(endpoint, token, { query: connector.queryTemplate, useLegacySql: false }, runtime)
  const columns = arrayValue(objectValue(payload.schema)?.fields).map((field) => String(objectValue(field)?.name ?? ''))
  const firstRow = objectValue(arrayValue(payload.rows)[0])
  const cells = arrayValue(firstRow?.f).map((cell) => objectValue(cell)?.v)
  return rowRecord(columns, cells)
}

async function executePostgresql(binding: SourceBinding, connectionString: string, parameters: Record<string, ConnectorArgument>, runtime: ConnectorRuntime): Promise<JsonObject> {
  validatePostgresScope(binding, connectionString)
  const client = createPostgresClient(connectionString, runtime)
  await client.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN READ ONLY')
    transactionStarted = true
    const values = Object.values(parameters).map(argumentValue)
    const result = await client.query({ text: boundedQuery(binding.connector?.queryTemplate), values })
    if (!result.rows[0]) throw new Error('CONNECTOR_RESULT_EMPTY')
    return result.rows[0]
  } finally {
    if (transactionStarted) {
      try { await client.query('ROLLBACK') } finally { await client.end() }
    } else {
      await client.end()
    }
  }
}

async function executeFabric(binding: SourceBinding, token: string, parameters: Record<string, ConnectorArgument>, runtime: ConnectorRuntime): Promise<JsonObject> {
  const client = createFabricClient(binding, token, runtime)
  try {
    await client.connect()
    const result = await client.query(readOnlyTsqlQuery(binding.connector?.queryTemplate), fabricParameters(parameters), 1)
    if (!result[0]) throw new Error('CONNECTOR_RESULT_EMPTY')
    return result[0]
  } finally {
    client.close()
  }
}

async function discoverDatabricks(binding: SourceBinding, token: string, runtime: ConnectorRuntime): Promise<{ fields: BindingSourceField[]; metadata: unknown }> {
  const connector = binding.connector!
  const fullName = [connector.resource.catalog, connector.resource.schema, connector.resource.object].map((part) => part?.trim()).filter(Boolean).join('.')
  if (fullName.split('.').length !== 3) throw new Error('DATABRICKS_TABLE_SCOPE_INCOMPLETE')
  const endpoint = providerUrl(binding, `/api/2.1/unity-catalog/tables/${encodeURIComponent(fullName)}`, ['databricks.com', 'azuredatabricks.net'])
  const metadata = await getJson(endpoint, token, runtime)
  const columns = arrayValue(metadata.columns).map(objectValue).filter((column): column is JsonObject => Boolean(column)).sort((left, right) => numberValue(left.position) - numberValue(right.position))
  const fields = columns.flatMap((column) => {
    const name = stringValue(column.name)
    if (!name) return []
    return [{ path: `$.${name}`, label: humanize(name), dataType: normalizeProviderType(stringValue(column.type_name) ?? stringValue(column.type_text) ?? 'unknown'), required: column.nullable === false }]
  })
  return { fields, metadata: { full_name: metadata.full_name ?? fullName, columns: columns.map((column) => ({ name: column.name, type_name: column.type_name, type_text: column.type_text, nullable: column.nullable, position: column.position })) } }
}

async function discoverPostgresql(binding: SourceBinding, connectionString: string, runtime: ConnectorRuntime): Promise<{ fields: BindingSourceField[]; metadata: unknown }> {
  validatePostgresScope(binding, connectionString)
  const resource = binding.connector!.resource
  const client = createPostgresClient(connectionString, runtime)
  await client.connect()
  try {
    const result = await client.query({
      text: `SELECT column_name, data_type, udt_name, is_nullable, ordinal_position
FROM information_schema.columns
WHERE table_catalog = $1 AND table_schema = $2 AND table_name = $3
ORDER BY ordinal_position`,
      values: [resource.database, resource.schema, resource.object],
    })
    const fields = result.rows.flatMap((row) => {
      const name = stringValue(row.column_name)
      if (!name) return []
      return [{ path: `$.${name}`, label: humanize(name), dataType: normalizeProviderType(stringValue(row.data_type) ?? stringValue(row.udt_name) ?? 'unknown'), required: row.is_nullable === 'NO' }]
    })
    return { fields, metadata: result.rows.map((row) => ({ column_name: row.column_name, data_type: row.data_type, udt_name: row.udt_name, is_nullable: row.is_nullable, ordinal_position: row.ordinal_position })) }
  } finally {
    await client.end()
  }
}

async function discoverFabric(binding: SourceBinding, token: string, runtime: ConnectorRuntime): Promise<{ fields: BindingSourceField[]; metadata: unknown }> {
  const resource = binding.connector!.resource
  const client = createFabricClient(binding, token, runtime)
  try {
    await client.connect()
    const rows = await client.query(`SELECT COLUMN_NAME AS column_name, DATA_TYPE AS data_type, IS_NULLABLE AS is_nullable, ORDINAL_POSITION AS ordinal_position
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_CATALOG = @database AND TABLE_SCHEMA = @schema AND TABLE_NAME = @object
ORDER BY ORDINAL_POSITION`, { database: resource.database ?? '', schema: resource.schema ?? '', object: resource.object ?? '' })
    const fields = rows.flatMap((row) => {
      const name = stringValue(row.column_name)
      if (!name) return []
      return [{ path: `$.${name}`, label: humanize(name), dataType: normalizeProviderType(stringValue(row.data_type) ?? 'unknown'), required: row.is_nullable === 'NO' }]
    })
    return { fields, metadata: rows.map((row) => ({ column_name: row.column_name, data_type: row.data_type, is_nullable: row.is_nullable, ordinal_position: row.ordinal_position })) }
  } finally {
    client.close()
  }
}

async function executeGateway(gateway: string, binding: SourceBinding, parameters: Record<string, ConnectorArgument>, runtime: ConnectorRuntime): Promise<JsonObject> {
  const endpoint = new URL('/v1/execute', gateway)
  if (!['127.0.0.1', 'localhost'].includes(endpoint.hostname)) throw new Error('CONNECTOR_GATEWAY_HOST_NOT_ALLOWLISTED')
  return postJson(endpoint, undefined, { binding, parameters }, runtime)
}

async function discoverGateway(gateway: string, binding: SourceBinding, contractId: string, sourceName: string, runtime: ConnectorRuntime): Promise<BindingPreview> {
  const endpoint = new URL('/v1/discover', gateway)
  if (!['127.0.0.1', 'localhost'].includes(endpoint.hostname)) throw new Error('CONNECTOR_GATEWAY_HOST_NOT_ALLOWLISTED')
  return postJson(endpoint, undefined, { binding, contractId, sourceName }, runtime) as unknown as Promise<BindingPreview>
}

async function getJson(endpoint: URL, token: string, runtime: ConnectorRuntime): Promise<JsonObject> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await (runtime.fetch ?? globalThis.fetch)(endpoint, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: controller.signal })
    if (!response.ok) throw new Error(`CONNECTOR_HTTP_${response.status}`)
    return await response.json() as JsonObject
  } finally {
    clearTimeout(timeout)
  }
}

async function postJson(endpoint: URL, token: string | undefined, body: JsonObject, runtime: ConnectorRuntime = {}): Promise<JsonObject> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await (runtime.fetch ?? globalThis.fetch)(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), redirect: 'error', signal: controller.signal })
    if (!response.ok) throw new Error(`CONNECTOR_HTTP_${response.status}`)
    return await response.json() as JsonObject
  } finally {
    clearTimeout(timeout)
  }
}

function providerUrl(binding: SourceBinding, path: string, allowedSuffixes: string[]): URL {
  if (!binding.endpoint) throw new Error('SOURCE_ENDPOINT_NOT_CONFIGURED')
  const endpoint = new URL(binding.endpoint)
  if (endpoint.protocol !== 'https:' || !allowedSuffixes.some((suffix) => endpoint.hostname === suffix || endpoint.hostname.endsWith(`.${suffix}`))) throw new Error('CONNECTOR_HOST_NOT_ALLOWLISTED')
  return new URL(path, endpoint)
}

function validEndpoint(endpoint: string | undefined, transport: string): boolean {
  if (!endpoint?.trim()) return false
  if (transport === 'HTTPS') {
    try {
      const url = new URL(endpoint)
      return url.protocol === 'https:' && !url.username && !url.password
    } catch { return false }
  }
  if (transport === 'POSTGRES_WIRE') {
    try {
      const url = new URL(endpoint)
      return ['postgres:', 'postgresql:'].includes(url.protocol) && !url.username && !url.password
    } catch { return false }
  }
  if (transport === 'TDS') {
    try { parseFabricEndpoint(endpoint); return true } catch { return false }
  }
  return !/\s/.test(endpoint)
}

function isReadOnlyQuery(query: string | undefined): boolean {
  if (!query?.trim()) return false
  const normalized = query.trim().replace(/;\s*$/, '')
  return /^(select|with)\b/i.test(normalized) && !/;/.test(normalized) && !/\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|call|execute|into)\b/i.test(normalized)
}

function credentialStateFor(reference: string): ConnectorValidationResult['credentialState'] {
  if (!validCredentialReference(reference)) return 'MISSING'
  if (reference.startsWith('env:')) return resolveEnvironmentCredential(reference) ? 'AVAILABLE' : 'MISSING'
  if (process.env.LATTICE_CREDENTIAL_BROKER_URL) {
    try { return credentialBrokerEndpoint() ? 'AVAILABLE' : 'MISSING' } catch { return 'MISSING' }
  }
  return 'EXTERNAL'
}

function resolveEnvironmentCredential(reference: string): string | undefined {
  if (!reference.startsWith('env:')) return undefined
  const name = reference.slice(4)
  return /^[A-Z][A-Z0-9_]+$/.test(name) ? process.env[name] : undefined
}

async function resolveConnectorCredential(binding: SourceBinding, runtime: ConnectorRuntime): Promise<LocatedConnectorCredential | undefined> {
  const reference = binding.connector?.credentialRef.trim()
  if (!reference) return undefined
  if (!validCredentialReference(reference)) throw new Error('CREDENTIAL_REFERENCE_INVALID')
  if (reference.startsWith('env:')) {
    const value = resolveEnvironmentCredential(reference)
    return value ? { value, source: 'ENVIRONMENT' } : undefined
  }
  const resolver = runtime.credentialResolvers?.find((candidate) => candidate.supports(reference))
  if (resolver) {
    const credential = await resolver.resolve({ reference, binding })
    if (!credential.value) throw new Error('CREDENTIAL_RESOLVER_EMPTY_RESPONSE')
    validateCredentialExpiry(credential.expiresAt)
    return { ...credential, source: 'RUNTIME' }
  }
  const broker = credentialBrokerEndpoint()
  if (!broker) return undefined
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await (runtime.fetch ?? globalThis.fetch)(broker, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.LATTICE_CREDENTIAL_BROKER_TOKEN ? { Authorization: `Bearer ${process.env.LATTICE_CREDENTIAL_BROKER_TOKEN}` } : {}),
      },
      body: JSON.stringify({ reference, provider: binding.connector?.provider, resource: binding.connector?.resource }),
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`CREDENTIAL_BROKER_HTTP_${response.status}`)
    const declaredLength = Number(response.headers.get('content-length') ?? '0')
    if (declaredLength > 32_768) throw new Error('CREDENTIAL_BROKER_RESPONSE_TOO_LARGE')
    const responseText = await response.text()
    if (responseText.length > 32_768) throw new Error('CREDENTIAL_BROKER_RESPONSE_TOO_LARGE')
    let payload: { value?: unknown; expiresAt?: unknown }
    try { payload = JSON.parse(responseText) as { value?: unknown; expiresAt?: unknown } } catch { throw new Error('CREDENTIAL_BROKER_INVALID_RESPONSE') }
    if (typeof payload.value !== 'string' || !payload.value) throw new Error('CREDENTIAL_BROKER_INVALID_RESPONSE')
    if (payload.expiresAt !== undefined && typeof payload.expiresAt !== 'string') throw new Error('CREDENTIAL_EXPIRY_INVALID')
    validateCredentialExpiry(typeof payload.expiresAt === 'string' ? payload.expiresAt : undefined)
    return { value: payload.value, ...(typeof payload.expiresAt === 'string' ? { expiresAt: payload.expiresAt } : {}), source: 'BROKER' }
  } finally {
    clearTimeout(timeout)
  }
}

function validCredentialReference(reference: string): boolean {
  const normalized = reference.trim()
  return normalized.length <= 512 && /^[a-z][a-z0-9-]{1,31}:[^\s]+$/i.test(normalized)
}

function validateCredentialExpiry(expiresAt: string | undefined): void {
  if (!expiresAt) return
  const expiry = Date.parse(expiresAt)
  if (Number.isNaN(expiry)) throw new Error('CREDENTIAL_EXPIRY_INVALID')
  if (expiry <= Date.now()) throw new Error('CREDENTIAL_EXPIRED')
}

function credentialBrokerEndpoint(): URL | undefined {
  const configured = process.env.LATTICE_CREDENTIAL_BROKER_URL?.trim()
  if (!configured) return undefined
  let endpoint: URL
  try { endpoint = new URL('/v1/credentials/resolve', configured) } catch { throw new Error('CREDENTIAL_BROKER_URL_INVALID') }
  const localHttp = endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(endpoint.hostname)
  if (endpoint.protocol !== 'https:' && !localHttp) throw new Error('CREDENTIAL_BROKER_TRANSPORT_NOT_ALLOWED')
  if (endpoint.username || endpoint.password) throw new Error('CREDENTIAL_BROKER_URL_CREDENTIALS_NOT_ALLOWED')
  return endpoint
}

function fixedCredentialResolver(reference: string, credential: LocatedConnectorCredential): ConnectorCredentialResolver {
  return { id: 'health-probe', supports: (candidate) => candidate === reference, resolve: async () => ({ value: credential.value, ...(credential.expiresAt ? { expiresAt: credential.expiresAt } : {}) }) }
}

function failedHealthProbe(
  base: { bindingId: string; provider: 'OPENAPI' | 'DATABRICKS' | 'MICROSOFT_FABRIC' | 'SNOWFLAKE' | 'BIGQUERY' | 'POSTGRESQL' | 'KAFKA' | 'OBJECT_STORAGE'; checkedAt: string },
  binding: SourceBinding,
  validation: ConnectorValidationResult,
  startedAt: number,
  error: unknown,
  credentialSource: ConnectorHealthRecord['credentialSource'] = 'UNRESOLVED',
): ConnectorHealthProbe {
  const errorCode = connectorErrorCode(error)
  return {
    ...base,
    provider: binding.connector?.provider ?? base.provider,
    status: 'UNHEALTHY',
    latencyMs: Date.now() - startedAt,
    credentialSource,
    probe: liveDiscoveryProviders.has(binding.connector?.provider ?? '') ? 'LIVE_DISCOVERY' : 'CONFIGURATION_ONLY',
    checks: [...validation.checks, { id: 'reachability', status: 'FAIL', message: `Provider probe failed (${errorCode}).` }],
    errorCode,
  }
}

function connectorErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  const code = message.split(':', 1)[0]?.trim()
  return code && /^[A-Z][A-Z0-9_]{2,80}$/.test(code) ? code : 'CONNECTOR_PROBE_FAILED'
}

function createPostgresClient(connectionString: string, runtime: ConnectorRuntime): PostgresClient {
  const config: ClientConfig = {
    connectionString,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    query_timeout: 12_000,
    application_name: 'lattice-context-api',
  }
  return runtime.createPostgresClient?.(config) ?? new Client(config)
}

function createFabricClient(binding: SourceBinding, token: string, runtime: ConnectorRuntime): FabricClient {
  const endpoint = parseFabricEndpoint(binding.endpoint)
  const database = binding.connector?.resource.database?.trim()
  if (!database) throw new Error('FABRIC_DATABASE_SCOPE_INCOMPLETE')
  const config: FabricClientConfig = { server: endpoint.server, port: endpoint.port, database, token, connectTimeoutMs: 5_000, requestTimeoutMs: 12_000 }
  return runtime.createFabricClient?.(config) ?? tediousFabricClient(config)
}

function tediousFabricClient(config: FabricClientConfig): FabricClient {
  const connectionConfig: ConnectionConfiguration = {
    server: config.server,
    authentication: { type: 'azure-active-directory-access-token', options: { token: config.token } },
    options: {
      database: config.database,
      port: config.port,
      encrypt: true,
      trustServerCertificate: false,
      connectTimeout: config.connectTimeoutMs,
      requestTimeout: config.requestTimeoutMs,
      appName: 'lattice-context-api',
      rowCollectionOnRequestCompletion: false,
    },
  }
  const connection = new Connection(connectionConfig)
  return {
    connect: () => new Promise<void>((resolve, reject) => connection.connect((error) => error ? reject(error) : resolve())),
    query: (text, parameters = {}, maxRows) => new Promise<JsonObject[]>((resolve, reject) => {
      const rows: JsonObject[] = []
      let rowLimitReached = false
      const request = new Request(text, (error) => error && !rowLimitReached ? reject(error) : resolve(rows))
      request.on('row', (columns: Array<{ metadata: { colName: string }; value: unknown }>) => {
        if (maxRows === undefined || rows.length < maxRows) rows.push(Object.fromEntries(columns.map((column) => [column.metadata.colName, column.value])))
        if (!rowLimitReached && maxRows !== undefined && rows.length >= maxRows) {
          rowLimitReached = true
          request.cancel()
        }
      })
      for (const [name, value] of Object.entries(parameters)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`FABRIC_PARAMETER_NAME_INVALID:${name}`)
        request.addParameter(name, typeof value === 'boolean' ? TYPES.Bit : typeof value === 'number' ? TYPES.Float : TYPES.NVarChar, value)
      }
      connection.execSql(request)
    }),
    close: () => connection.close(),
  }
}

function parseFabricEndpoint(endpoint: string | undefined): { server: string; port: number } {
  if (!endpoint?.trim()) throw new Error('FABRIC_ENDPOINT_REQUIRED')
  const raw = endpoint.trim().replace(/,(\d+)$/, ':$1')
  let url: URL
  try { url = new URL(raw.includes('://') ? raw : `https://${raw}`) } catch { throw new Error('FABRIC_ENDPOINT_INVALID') }
  if (!['https:', 'tcp:'].includes(url.protocol) || url.username || url.password || (url.pathname && url.pathname !== '/') || url.search || url.hash) throw new Error('FABRIC_ENDPOINT_INVALID')
  if (!(url.hostname === 'datawarehouse.fabric.microsoft.com' || url.hostname.endsWith('.datawarehouse.fabric.microsoft.com'))) throw new Error('FABRIC_ENDPOINT_HOST_NOT_ALLOWLISTED')
  const port = url.port ? Number(url.port) : 1433
  if (port !== 1433) throw new Error('FABRIC_ENDPOINT_PORT_NOT_ALLOWED')
  return { server: url.hostname, port }
}

function validatePostgresScope(binding: SourceBinding, connectionString: string): void {
  const connector = binding.connector!
  let credentialUrl: URL
  let declaredUrl: URL
  try {
    credentialUrl = new URL(connectionString)
    declaredUrl = new URL(binding.endpoint ?? '')
  } catch {
    throw new Error('POSTGRES_CONNECTION_URL_INVALID')
  }
  if (!['postgres:', 'postgresql:'].includes(credentialUrl.protocol) || !['postgres:', 'postgresql:'].includes(declaredUrl.protocol)) throw new Error('POSTGRES_CONNECTION_URL_INVALID')
  if (declaredUrl.username || declaredUrl.password) throw new Error('POSTGRES_ENDPOINT_MUST_NOT_CONTAIN_CREDENTIALS')
  if (credentialUrl.hostname !== declaredUrl.hostname || normalizedPort(credentialUrl) !== normalizedPort(declaredUrl)) throw new Error('POSTGRES_ENDPOINT_SCOPE_MISMATCH')
  const credentialDatabase = decodeURIComponent(credentialUrl.pathname.replace(/^\//, ''))
  if (!connector.resource.database || credentialDatabase !== connector.resource.database) throw new Error('POSTGRES_DATABASE_SCOPE_MISMATCH')
}

function normalizedPort(url: URL): string {
  return url.port || '5432'
}

function boundedQuery(query: string | undefined): string {
  if (!query || !isReadOnlyQuery(query)) throw new Error('CONNECTOR_QUERY_NOT_READ_ONLY')
  return `SELECT * FROM (${query.trim().replace(/;\s*$/, '')}) AS lattice_source LIMIT 1`
}

function readOnlyTsqlQuery(query: string | undefined): string {
  if (!query || !isReadOnlyQuery(query)) throw new Error('CONNECTOR_QUERY_NOT_READ_ONLY')
  return query.trim().replace(/;\s*$/, '')
}

function fabricParameters(parameters: Record<string, ConnectorArgument>): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(parameters).map(([name, value]) => [name, argumentValue(value)]))
}

function argumentValue(value: ConnectorArgument): string | number | boolean {
  return typeof value === 'object' ? value.entityId : value
}

function normalizeProviderType(value: string): string {
  const normalized = value.toLocaleLowerCase().replace(/\(.+\)/, '').trim()
  if (['varchar', 'nvarchar', 'character varying', 'character', 'char', 'nchar', 'text', 'ntext', 'string', 'uuid', 'uniqueidentifier', 'variant', 'json', 'jsonb', 'time'].includes(normalized)) return 'string'
  if (['timestamp', 'timestamp without time zone', 'timestamp with time zone', 'timestamp_ntz', 'datetime', 'datetime2', 'datetimeoffset', 'smalldatetime'].includes(normalized)) return 'date-time'
  if (normalized === 'date') return 'date'
  if (['int', 'integer', 'smallint', 'bigint', 'tinyint', 'byte', 'short', 'long'].includes(normalized)) return 'integer'
  if (['decimal', 'numeric', 'float', 'double', 'double precision', 'real', 'number', 'money', 'smallmoney'].includes(normalized)) return 'number'
  if (['bool', 'boolean', 'bit'].includes(normalized)) return 'boolean'
  if (['array', 'struct', 'map', 'binary', 'varbinary', 'image', 'bytea'].includes(normalized)) return normalized
  return normalized || 'unknown'
}

function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())
}

function slugify(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'source'
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function rowRecord(columns: string[], values: unknown[]): JsonObject {
  if (columns.length === 0 || values.length === 0) throw new Error('CONNECTOR_RESULT_EMPTY')
  return Object.fromEntries(columns.map((column, index) => [column, values[index]]))
}

function objectValue(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : undefined
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number.MAX_SAFE_INTEGER
}
