import { connectorTemplate, type ConnectorValidationResult, type SourceBinding } from '@lattice/contracts'

type JsonObject = Record<string, unknown>

const builtInHttpProviders = new Set(['OPENAPI', 'DATABRICKS', 'SNOWFLAKE', 'BIGQUERY'])

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
  checks.push({ id: 'credential', status: credentialState === 'MISSING' ? 'FAIL' : credentialState === 'AVAILABLE' ? 'PASS' : 'INFO', message: credentialState === 'AVAILABLE' ? 'Credential reference resolves in this runtime.' : credentialState === 'EXTERNAL' ? 'Credential reference is delegated to the external connector runtime.' : 'Credential reference is missing or unresolved.' })
  const gatewayAvailable = Boolean(process.env.LATTICE_CONNECTOR_GATEWAY_URL)
  const driver = builtInHttpProviders.has(binding.connector.provider) ? 'BUILT_IN_HTTP' : gatewayAvailable ? 'EXTERNAL_GATEWAY' : 'NOT_AVAILABLE'
  checks.push({ id: 'driver', status: driver === 'NOT_AVAILABLE' ? 'INFO' : 'PASS', message: driver === 'BUILT_IN_HTTP' ? 'A built-in HTTPS driver is available.' : driver === 'EXTERNAL_GATEWAY' ? 'The external connector gateway is configured.' : 'This transport requires LATTICE_CONNECTOR_GATEWAY_URL at execution time.' })
  const invalid = checks.some((check) => check.status === 'FAIL' && check.id !== 'credential') || !binding.connector.readOnly
  const executable = !invalid && (credentialState === 'AVAILABLE' && driver === 'BUILT_IN_HTTP' || gatewayAvailable)
  return { provider: binding.connector.provider, status: invalid ? 'INVALID' : executable ? 'READY' : 'CONFIGURED', driver, credentialState, checks }
}

export async function executeConnector(binding: SourceBinding): Promise<JsonObject> {
  if (!binding.connector) throw new Error('CONNECTOR_CONFIG_REQUIRED')
  const validation = validateConnectorBinding(binding)
  if (validation.status === 'INVALID') throw new Error('CONNECTOR_CONFIG_INVALID')
  const token = resolveEnvironmentCredential(binding.connector.credentialRef)
  if (token && builtInHttpProviders.has(binding.connector.provider)) {
    if (binding.connector.provider === 'DATABRICKS') return executeDatabricks(binding, token)
    if (binding.connector.provider === 'SNOWFLAKE') return executeSnowflake(binding, token)
    if (binding.connector.provider === 'BIGQUERY') return executeBigQuery(binding, token)
  }
  const gateway = process.env.LATTICE_CONNECTOR_GATEWAY_URL
  if (gateway) return executeGateway(gateway, binding)
  if (!token) throw new Error(`CREDENTIAL_RESOLVER_NOT_CONFIGURED:${binding.connector.credentialRef}`)
  throw new Error(`CONNECTOR_DRIVER_NOT_AVAILABLE:${binding.connector.provider}`)
}

async function executeDatabricks(binding: SourceBinding, token: string): Promise<JsonObject> {
  const connector = binding.connector!
  const endpoint = providerUrl(binding, '/api/2.0/sql/statements', ['databricks.com', 'azuredatabricks.net'])
  const payload = await postJson(endpoint, token, {
    warehouse_id: connector.resource.warehouse,
    catalog: connector.resource.catalog,
    schema: connector.resource.schema,
    statement: connector.queryTemplate,
    wait_timeout: '10s',
    on_wait_timeout: 'CANCEL',
    disposition: 'INLINE',
    format: 'JSON_ARRAY',
  })
  const status = objectValue(payload.status)?.state
  if (status && status !== 'SUCCEEDED') throw new Error(`DATABRICKS_STATEMENT_${String(status)}`)
  const columns = arrayValue(objectValue(objectValue(payload.manifest)?.schema)?.columns).map((column) => String(objectValue(column)?.name ?? ''))
  const row = arrayValue(objectValue(payload.result)?.data_array)[0]
  return rowRecord(columns, arrayValue(row))
}

async function executeSnowflake(binding: SourceBinding, token: string): Promise<JsonObject> {
  const connector = binding.connector!
  const endpoint = providerUrl(binding, '/api/v2/statements', ['snowflakecomputing.com'])
  const payload = await postJson(endpoint, token, {
    statement: connector.queryTemplate,
    warehouse: connector.resource.warehouse,
    database: connector.resource.database,
    schema: connector.resource.schema,
    timeout: 30,
  })
  const columns = arrayValue(objectValue(payload.resultSetMetaData)?.rowType).map((column) => String(objectValue(column)?.name ?? ''))
  const row = arrayValue(payload.data)[0]
  return rowRecord(columns, arrayValue(row))
}

async function executeBigQuery(binding: SourceBinding, token: string): Promise<JsonObject> {
  const connector = binding.connector!
  const project = encodeURIComponent(connector.resource.project ?? '')
  const endpoint = new URL(`/bigquery/v2/projects/${project}/queries`, providerUrl(binding, '', ['bigquery.googleapis.com']))
  const payload = await postJson(endpoint, token, { query: connector.queryTemplate, useLegacySql: false })
  const columns = arrayValue(objectValue(payload.schema)?.fields).map((field) => String(objectValue(field)?.name ?? ''))
  const firstRow = objectValue(arrayValue(payload.rows)[0])
  const cells = arrayValue(firstRow?.f).map((cell) => objectValue(cell)?.v)
  return rowRecord(columns, cells)
}

async function executeGateway(gateway: string, binding: SourceBinding): Promise<JsonObject> {
  const endpoint = new URL('/v1/execute', gateway)
  if (!['127.0.0.1', 'localhost'].includes(endpoint.hostname)) throw new Error('CONNECTOR_GATEWAY_HOST_NOT_ALLOWLISTED')
  return postJson(endpoint, undefined, { binding })
}

async function postJson(endpoint: URL, token: string | undefined, body: JsonObject): Promise<JsonObject> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), redirect: 'error', signal: controller.signal })
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
    try { return new URL(endpoint).protocol === 'https:' } catch { return false }
  }
  return !/\s/.test(endpoint)
}

function isReadOnlyQuery(query: string | undefined): boolean {
  if (!query?.trim()) return false
  const normalized = query.trim().replace(/;\s*$/, '')
  return /^(select|with)\b/i.test(normalized) && !/;/.test(normalized) && !/\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|call|execute)\b/i.test(normalized)
}

function credentialStateFor(reference: string): ConnectorValidationResult['credentialState'] {
  if (!reference.trim()) return 'MISSING'
  if (reference.startsWith('env:')) return resolveEnvironmentCredential(reference) ? 'AVAILABLE' : 'MISSING'
  return 'EXTERNAL'
}

function resolveEnvironmentCredential(reference: string): string | undefined {
  if (!reference.startsWith('env:')) return undefined
  const name = reference.slice(4)
  return /^[A-Z][A-Z0-9_]+$/.test(name) ? process.env[name] : undefined
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
