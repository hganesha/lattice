import { SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api'
import type { CompileResponse, ExecutionReceipt } from '@lattice/contracts'

/**
 * Tracing for the governed loop.
 *
 * A decision that cannot be explained after the fact is not much better than an unexplained one,
 * and until now nothing recorded why a question resolved the way it did except the response
 * itself. These spans carry the governance facts — the decision, its reason codes, the risk tier,
 * whether the context was live, whose identity read the data — so a trace answers "why did this
 * happen" without reconstructing it from logs.
 *
 * Only `@opentelemetry/api` is used here, which is a no-op until something registers a provider.
 * On Vercel that is `@vercel/otel`; elsewhere it is whatever the deployment already runs. So this
 * costs nothing when nobody is collecting, and needs no configuration when somebody is.
 *
 * Questions, source values, and tokens are never attributes. A trace backend is not an approved
 * destination for governed data, and a span is exactly the kind of place that leak goes unnoticed.
 */

const tracer = trace.getTracer('lattice-context-api')

export async function withSpan<T>(name: string, attributes: Attributes, run: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await run(span)
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.name : 'error' })
      throw error
    } finally {
      span.end()
    }
  })
}

/** Records how a question was decided, without recording the question. */
export function recordCompileDecision(span: Span, result: CompileResponse): void {
  span.setAttributes({
    'lattice.decision': result.decision,
    'lattice.reason_codes': result.reasonCodes.join(','),
    ...(result.grounding ? { 'lattice.grounding': result.grounding } : {}),
    ...(result.plan ? { 'lattice.risk_tier': result.plan.riskTier, 'lattice.operation': result.plan.operation } : {}),
    ...(result.pendingPlan ? { 'lattice.risk_tier': result.pendingPlan.riskTier, 'lattice.operation': result.pendingPlan.operation } : {}),
    ...(result.intentResolution ? {
      'lattice.intent.method': result.intentResolution.method,
      'lattice.intent.resolver': result.intentResolution.resolverVersion,
      'lattice.intent.top_score': result.intentResolution.candidates[0]?.aggregateScore ?? 0,
      ...(result.intentResolution.degradedReason ? { 'lattice.intent.degraded': true } : {}),
    } : {}),
    ...(result.plan?.purpose ? { 'lattice.purpose': result.plan.purpose.id } : {}),
  })

  // A governed refusal is a correct outcome, not a failure, so only a denial marks the span.
  if (result.decision === 'DENIED') {
    span.setStatus({ code: SpanStatusCode.ERROR, message: result.reasonCodes[0] ?? 'DENIED' })
  }
}

/** Records what an execution touched, never the values it read. */
export function recordExecution(span: Span, receipt: ExecutionReceipt): void {
  const delegated = receipt.bindingResults.filter((binding) => binding.identityMode === 'DELEGATED').length
  const simulated = receipt.bindingResults.filter((binding) => binding.mode === 'SIMULATED').length
  const withheld = receipt.bindingResults
    .flatMap((binding) => binding.rows)
    .flatMap((row) => row.values)
    .filter((value) => value.disclosure !== 'VALUE').length

  span.setAttributes({
    'lattice.execution.status': receipt.status,
    'lattice.operation': receipt.operationId,
    'lattice.execution.bindings': receipt.bindingResults.length,
    'lattice.execution.rows': receipt.bindingResults.reduce((total, binding) => total + binding.rowCount, 0),
    'lattice.execution.truncated': receipt.bindingResults.some((binding) => binding.truncated),
    'lattice.execution.delegated_bindings': delegated,
    'lattice.execution.simulated_bindings': simulated,
    'lattice.execution.protected_values': withheld,
    ...(receipt.purpose ? { 'lattice.purpose': receipt.purpose.id } : {}),
  })

  if (receipt.status !== 'SUCCESS') {
    span.setStatus({ code: SpanStatusCode.ERROR, message: receipt.status })
  }
}

/**
 * Registers the Vercel exporter when running on Vercel.
 *
 * Imported lazily and failure-tolerant: telemetry that cannot start must never stop the service
 * from answering questions.
 */
export async function registerTelemetry(environment: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  if (!environment.VERCEL && !environment.LATTICE_OTEL_ENABLED) return false
  try {
    const { registerOTel } = await import('@vercel/otel')
    registerOTel({ serviceName: environment.LATTICE_OTEL_SERVICE_NAME?.trim() || 'lattice-context-api' })
    return true
  } catch (error) {
    process.stderr.write(`[telemetry] Tracing could not be registered: ${error instanceof Error ? error.message : 'unknown'}\n`)
    return false
  }
}
