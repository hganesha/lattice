import { createHash } from 'node:crypto'
import type { BindingExecutionResult, ContextContract, SignedExecutionPlan, SourceBinding } from '@lattice/contracts'
import { executeConnector } from './connectors.js'

export async function executeBindings(plan: SignedExecutionPlan, contract: ContextContract): Promise<BindingExecutionResult[]> {
  return Promise.all(plan.sourceBindings.map(async (bindingId) => {
    const binding = contract.bindings.find((candidate) => candidate.id === bindingId)
    if (!binding) return failed(bindingId, 'Unknown source', 'SIMULATED', 'SOURCE_BINDING_NOT_FOUND')
    const startedAt = Date.now()
    try {
      const payload = await loadPayload(binding)
      const mappedValues = (binding.mappings ?? []).map((mapping) => ({
        sourcePath: mapping.sourcePath,
        targetTypeId: mapping.targetTypeId,
        targetPropertyId: mapping.targetPropertyId,
        value: readPath(payload, mapping.sourcePath),
      }))
      if (mappedValues.some((mapping) => mapping.value === undefined)) throw new Error('SOURCE_MAPPING_VALUE_MISSING')
      return {
        bindingId,
        sourceSystem: binding.sourceSystem,
        mode: binding.executionMode ?? 'SIMULATED',
        status: 'SUCCESS' as const,
        durationMs: Date.now() - startedAt,
        responseDigest: digest(payload),
        mappedValues,
      }
    } catch (error) {
      return failed(binding.id, binding.sourceSystem, binding.executionMode ?? 'SIMULATED', error instanceof Error ? error.message : 'ADAPTER_EXECUTION_FAILED', Date.now() - startedAt)
    }
  }))
}

async function loadPayload(binding: SourceBinding): Promise<Record<string, unknown>> {
  if (binding.executionMode === 'CONNECTOR') return executeConnector(binding)
  if ((binding.executionMode ?? 'SIMULATED') === 'SIMULATED') {
    if (!binding.samplePayload) throw new Error('SAMPLE_PAYLOAD_NOT_CONFIGURED')
    return structuredClone(binding.samplePayload)
  }
  if (!binding.endpoint) throw new Error('SOURCE_ENDPOINT_NOT_CONFIGURED')
  const endpoint = new URL(binding.endpoint)
  if (!['127.0.0.1', 'localhost'].includes(endpoint.hostname)) throw new Error('SOURCE_HOST_NOT_ALLOWLISTED')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_000)
  try {
    const response = await fetch(endpoint, { method: binding.method ?? 'GET', redirect: 'error', signal: controller.signal })
    if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`)
    return await response.json() as Record<string, unknown>
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
  return { bindingId, sourceSystem, mode, status: 'FAILED', durationMs, mappedValues: [], error }
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}
