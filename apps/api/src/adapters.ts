import { createHash } from 'node:crypto'
import { discloseMappedValue, type BindingExecutionResult, type ContextContract, type MappedRow, type SignedExecutionPlan, type SourceBinding } from '@lattice/contracts'
import { executeConnector, type ConnectorArgument, type ConnectorRows } from './connectors.js'

export interface ExecuteBindingsOptions {
  /** Scopes value digests to one tenant so they stay comparable within an audit trail only. */
  digestSalt?: string
}

/**
 * Hashes a confidential value for the receipt. Salting is what makes it a one-way record
 * rather than a lookup table: an unsalted digest of a low-cardinality field is reversible by
 * hashing every candidate.
 */
function saltedDigest(salt: string | undefined) {
  return (value: unknown): string => {
    const hash = createHash('sha256')
    if (salt) hash.update(salt)
    hash.update(' ')
    hash.update(JSON.stringify(value ?? null))
    return `sha256:${hash.digest('hex')}`
  }
}

export async function executeBindings(
  plan: SignedExecutionPlan,
  contract: ContextContract,
  options: ExecuteBindingsOptions = {},
): Promise<BindingExecutionResult[]> {
  return Promise.all(plan.sourceBindings.map(async (bindingId) => {
    const binding = contract.bindings.find((candidate) => candidate.id === bindingId)
    if (!binding) return failed(bindingId, 'Unknown source', 'SIMULATED', 'SOURCE_BINDING_NOT_FOUND')
    const startedAt = Date.now()
    try {
      const { rows, truncated } = await loadRows(binding, resolveBindingParameters(binding, plan, contract))
      const digest = saltedDigest(options.digestSalt)
      const mappings = binding.mappings ?? []

      const mappedRows: MappedRow[] = rows.map((row, rowIndex) => {
        // The raw value is read to confirm the mapping resolves, then immediately reduced to
        // whatever its classification permits a receipt to retain.
        const rawValues = mappings.map((mapping) => ({ mapping, value: readPath(row, mapping.sourcePath) }))
        if (rawValues.some((entry) => entry.value === undefined)) throw new Error('SOURCE_MAPPING_VALUE_MISSING')
        return {
          rowIndex,
          values: rawValues.map((entry) => discloseMappedValue(entry.mapping, entry.value, contract, digest)),
        }
      })

      return {
        bindingId,
        sourceSystem: binding.sourceSystem,
        mode: binding.executionMode ?? 'SIMULATED',
        status: 'SUCCESS' as const,
        durationMs: Date.now() - startedAt,
        responseDigest: digest(rows),
        rows: mappedRows,
        rowCount: mappedRows.length,
        truncated,
      }
    } catch (error) {
      return failed(binding.id, binding.sourceSystem, binding.executionMode ?? 'SIMULATED', error instanceof Error ? error.message : 'ADAPTER_EXECUTION_FAILED', Date.now() - startedAt)
    }
  }))
}

/**
 * Resolves the values a governed query is actually bound with.
 *
 * Plan arguments carry Lattice's own entity identifiers, which no source system recognizes, so a
 * binding declares which governed property supplies each parameter and that property's value is
 * read from the resolved entity.
 *
 * Deliberately resolved here rather than pinned into the plan: these are natural keys — account
 * numbers, subscriber identifiers — and the signed plan is passed around far more widely than a
 * receipt. Keeping them out of it means the plan stays free of source values, and the resolution
 * remains auditable from the contract and the entity it names.
 *
 * A binding that declares no parameters keeps the previous behaviour of passing entity
 * identifiers, so existing contracts continue to work; the publish gate flags them.
 */
export function resolveBindingParameters(
  binding: SourceBinding,
  plan: Pick<SignedExecutionPlan, 'arguments'>,
  contract: Pick<ContextContract, 'entities'>,
): Record<string, ConnectorArgument> {
  const declared = binding.parameters ?? []
  if (declared.length === 0) return plan.arguments

  return Object.fromEntries(declared.map((parameter) => {
    const argument = plan.arguments[parameter.targetTypeId]
    if (argument === undefined) throw new Error(`SOURCE_PARAMETER_UNRESOLVED:${parameter.name}`)

    const entityId = typeof argument === 'object' ? argument.entityId : String(argument)
    const entity = contract.entities.find((candidate) => candidate.id === entityId)
    if (!entity) throw new Error(`SOURCE_PARAMETER_ENTITY_NOT_FOUND:${parameter.name}`)

    const value = entity.properties[propertyKey(parameter.targetPropertyId)]
    if (value === undefined || value === null) throw new Error(`SOURCE_PARAMETER_KEY_MISSING:${parameter.name}`)

    return [parameter.name, value]
  }))
}

/** Properties are addressed as `entity_type.property`; the record keys them by the last segment. */
function propertyKey(propertyId: string): string {
  return propertyId.split('.').at(-1) ?? propertyId
}

/**
 * Decides whether an HTTP binding may reach a host.
 *
 * Loopback alone made this mode useless in any deployed environment, but opening it up
 * unconditionally would turn a governed binding into an SSRF primitive. Hosts are therefore
 * allowlisted explicitly through LATTICE_HTTP_SOURCE_HOSTS, and anything reached over plaintext
 * still has to be loopback.
 */
export function isAllowedHttpSource(endpoint: URL, environment: NodeJS.ProcessEnv = process.env): boolean {
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(endpoint.hostname)
  if (loopback) return true
  if (endpoint.protocol !== 'https:') return false

  const allowed = (environment.LATTICE_HTTP_SOURCE_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLocaleLowerCase())
    .filter(Boolean)

  const hostname = endpoint.hostname.toLocaleLowerCase()
  return allowed.some((host) => hostname === host || hostname.endsWith(`.${host}`))
}

/**
 * Reads a bounded result set.
 *
 * Sample payloads and HTTP sources describe a single object today, so they yield one row. A
 * connector returns as many as its row ceiling allows.
 */
async function loadRows(binding: SourceBinding, parameters: Record<string, ConnectorArgument>): Promise<ConnectorRows> {
  if (binding.executionMode === 'CONNECTOR') return executeConnector(binding, parameters)
  if ((binding.executionMode ?? 'SIMULATED') === 'SIMULATED') {
    if (!binding.samplePayload) throw new Error('SAMPLE_PAYLOAD_NOT_CONFIGURED')
    return { rows: [structuredClone(binding.samplePayload)], truncated: false }
  }
  if (!binding.endpoint) throw new Error('SOURCE_ENDPOINT_NOT_CONFIGURED')
  const endpoint = new URL(binding.endpoint)
  if (!isAllowedHttpSource(endpoint)) throw new Error('SOURCE_HOST_NOT_ALLOWLISTED')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_000)
  try {
    const response = await fetch(endpoint, { method: binding.method ?? 'GET', redirect: 'error', signal: controller.signal })
    if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`)
    const body = await response.json() as Record<string, unknown> | Array<Record<string, unknown>>
    return { rows: Array.isArray(body) ? body : [body], truncated: false }
  } finally {
    clearTimeout(timeout)
  }
}

function readPath(payload: Record<string, unknown>, path: string): unknown {
  return path.replace(/^\$\.?/, '').split('.').filter(Boolean).reduce<unknown>((current, segment) => {
    return typeof current === 'object' && current !== null ? (current as Record<string, unknown>)[segment] : undefined
  }, payload)
}

function failed(bindingId: string, sourceSystem: string, mode: 'SIMULATED' | 'HTTP' | 'CONNECTOR', error: string, durationMs = 0): BindingExecutionResult {
  return { bindingId, sourceSystem, mode, status: 'FAILED', durationMs, rows: [], rowCount: 0, truncated: false, error }
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
