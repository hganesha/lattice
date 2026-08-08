import assert from 'node:assert/strict'
import test from 'node:test'
import { SpanStatusCode, context, trace, type Attributes, type Span } from '@opentelemetry/api'
import type { CompileResponse, ExecutionReceipt } from '@lattice/contracts'
import { recordCompileDecision, recordExecution, registerTelemetry, withSpan } from './telemetry.js'

/**
 * A minimal recording provider.
 *
 * The API package depends only on @opentelemetry/api, which is inert until something registers a
 * provider — so asserting that spans are emitted needs one here. Without it these tests would
 * only prove the code does not throw, which is not the same as proving it records anything.
 */
interface RecordedSpan {
  name: string
  attributes: Attributes
  status?: { code: SpanStatusCode; message?: string }
  ended: boolean
}

const recorded: RecordedSpan[] = []

function recordingSpan(name: string, attributes: Attributes): Span & { record: RecordedSpan } {
  const record: RecordedSpan = { name, attributes: { ...attributes }, ended: false }
  recorded.push(record)
  const span = {
    record,
    setAttributes(next: Attributes) { Object.assign(record.attributes, next); return span },
    setAttribute(key: string, value: unknown) { record.attributes[key] = value as never; return span },
    setStatus(status: { code: SpanStatusCode; message?: string }) { record.status = status; return span },
    end() { record.ended = true },
    addEvent() { return span },
    recordException() { return span },
    updateName() { return span },
    isRecording() { return true },
    spanContext() { return { traceId: '0'.repeat(32), spanId: '0'.repeat(16), traceFlags: 1 } },
    addLink() { return span },
    addLinks() { return span },
  }
  return span as unknown as Span & { record: RecordedSpan }
}

trace.setGlobalTracerProvider({
  getTracer: () => ({
    startSpan: (name: string, options?: { attributes?: Attributes }) => recordingSpan(name, options?.attributes ?? {}),
    startActiveSpan: ((name: string, options: { attributes?: Attributes }, fn: (span: Span) => unknown) => {
      const span = recordingSpan(name, options?.attributes ?? {})
      return fn(span)
    }) as never,
  }),
} as never)

function spanNamed(name: string): RecordedSpan | undefined {
  return recorded.find((span) => span.name === name)
}

test('a span is opened, attributed, and ended', async () => {
  const result = await withSpan('lattice.test', { 'lattice.contract_id': 'contract-1' }, async () => 'value')

  assert.equal(result, 'value')
  const span = spanNamed('lattice.test')
  assert.equal(span?.attributes['lattice.contract_id'], 'contract-1')
  assert.equal(span?.ended, true)
})

test('a thrown error marks the span and still ends it', async () => {
  await assert.rejects(() => withSpan('lattice.failing', {}, async () => { throw new Error('boom') }))

  const span = spanNamed('lattice.failing')
  assert.equal(span?.status?.code, SpanStatusCode.ERROR)
  assert.equal(span?.ended, true)
})

const versions = { contract: 'c@1', semantic: 's@1', policy: 'p@1', bindings: 'b@1', api: 'a@1' }

test('the decision, not the question, is what the span records', async () => {
  const result: CompileResponse = {
    resolutionId: 'res-1',
    decision: 'APPROVAL_REQUIRED',
    reasonCodes: ['RUNTIME_APPROVAL_REQUIRED'],
    explanation: ['A human approval is required.'],
    grounding: 'SIMULATED',
    versions,
    intentResolution: {
      resolverVersion: 'persisted-intent-v1', method: 'HYBRID', indexDigest: 'sha256:i',
      candidates: [{ operationId: 'risk.exposure', matchedQuestionIds: [], lexicalScore: 0.2, aggregateScore: 0.87, rationale: [] }],
    },
    pendingPlan: { riskTier: 'OPERATIONAL_ACTION', operation: 'risk.exposure' } as never,
  }

  await withSpan('lattice.compile', {}, async (span) => { recordCompileDecision(span, result) })
  const span = spanNamed('lattice.compile')

  assert.equal(span?.attributes['lattice.decision'], 'APPROVAL_REQUIRED')
  assert.equal(span?.attributes['lattice.grounding'], 'SIMULATED')
  assert.equal(span?.attributes['lattice.risk_tier'], 'OPERATIONAL_ACTION')
  assert.equal(span?.attributes['lattice.intent.method'], 'HYBRID')
  assert.equal(span?.attributes['lattice.intent.top_score'], 0.87)

  // A trace backend is not an approved destination for a governed question.
  assert.equal(JSON.stringify(span?.attributes).toLowerCase().includes('arcadia'), false)
})

test('a governed refusal is not an error, but a denial is', async () => {
  const base: CompileResponse = { resolutionId: 'r', decision: 'INSUFFICIENT_EVIDENCE', reasonCodes: ['REQUIRED_ENTITY_UNRESOLVED'], explanation: [], versions }

  await withSpan('lattice.abstain', {}, async (span) => { recordCompileDecision(span, base) })
  assert.equal(spanNamed('lattice.abstain')?.status, undefined)

  await withSpan('lattice.denied', {}, async (span) => {
    recordCompileDecision(span, { ...base, decision: 'DENIED', reasonCodes: ['PURPOSE_REQUIRED'] })
  })
  assert.equal(spanNamed('lattice.denied')?.status?.code, SpanStatusCode.ERROR)
  assert.equal(spanNamed('lattice.denied')?.status?.message, 'PURPOSE_REQUIRED')
})

test('an execution span counts what was touched, never the values read', async () => {
  const receipt = {
    id: 'receipt-1', contractId: 'contract-1', contractVersion: '1.0.0', contractDigest: 'sha256:c',
    planId: 'plan-1', operationId: 'telco.assess_cpni_access', principalId: 'agent', status: 'SUCCESS',
    startedAt: 'x', completedAt: 'y', requiredPermissions: [], grantedPermissions: [], evidenceRefs: [],
    purpose: { id: 'customer-initiated-support', label: 'Support' },
    bindingResults: [{
      bindingId: 'b1', sourceSystem: 'CPNI ledger', mode: 'CONNECTOR', status: 'SUCCESS', durationMs: 3,
      identityMode: 'DELEGATED', rowCount: 2, truncated: true,
      rows: [{ rowIndex: 0, values: [
        { sourcePath: '$.a', targetTypeId: 't', targetPropertyId: 'p', value: 'TOKENIZED-ACCOUNT-8841', disclosure: 'VALUE', classification: 'INTERNAL' },
        { sourcePath: '$.b', targetTypeId: 't', targetPropertyId: 'q', disclosure: 'WITHHELD', classification: 'RESTRICTED' },
      ] }],
    }],
    artifactDigest: 'sha256:r',
  } as unknown as ExecutionReceipt

  await withSpan('lattice.execution_receipt', {}, async (span) => { recordExecution(span, receipt) })
  const span = spanNamed('lattice.execution_receipt')

  assert.equal(span?.attributes['lattice.execution.status'], 'SUCCESS')
  assert.equal(span?.attributes['lattice.execution.rows'], 2)
  assert.equal(span?.attributes['lattice.execution.truncated'], true)
  assert.equal(span?.attributes['lattice.execution.delegated_bindings'], 1)
  assert.equal(span?.attributes['lattice.execution.protected_values'], 1)
  assert.equal(span?.attributes['lattice.purpose'], 'customer-initiated-support')

  // Source values must not travel to a trace backend, whatever their classification.
  assert.equal(JSON.stringify(span?.attributes).includes('TOKENIZED-ACCOUNT-8841'), false)
})

test('a failed execution marks the span', async () => {
  const receipt = {
    id: 'r', contractId: 'c', contractVersion: '1', contractDigest: 'd', planId: 'p', operationId: 'op',
    principalId: 'a', status: 'FAILED', startedAt: 'x', completedAt: 'y',
    requiredPermissions: [], grantedPermissions: [], evidenceRefs: [], bindingResults: [], artifactDigest: 'x',
  } as unknown as ExecutionReceipt

  await withSpan('lattice.failed_execution', {}, async (span) => { recordExecution(span, receipt) })
  assert.equal(spanNamed('lattice.failed_execution')?.status?.code, SpanStatusCode.ERROR)
})

test('telemetry stays off unless the deployment asks for it', async () => {
  assert.equal(await registerTelemetry({}), false)
})

test('a tracer context is available without a registered SDK', () => {
  // The api package is inert rather than broken when nothing collects, which is what makes
  // instrumenting the hot path safe by default.
  assert.ok(context.active())
})
