import { ContextCompiler } from '@lattice/compiler-core'
import type {
  ContextContract,
  CounterfactualChange,
  CounterfactualResult,
  DispositionRecord,
  DriftEvent,
  RiskTier,
} from '@lattice/contracts'

const highRiskTiers: readonly RiskTier[] = ['PLANNING_DECISION', 'OPERATIONAL_ACTION']

export interface ReplayInput {
  event: DriftEvent
  /** Dispositions still inside the retention window; the counterfactual never claims more. */
  dispositions: DispositionRecord[]
  /** The contract as it stands after the drift. */
  contract: ContextContract
  /** Tenant the replay runs within, mirroring the original compile. */
  tenantId?: string
  now?: Date
}

/**
 * Recompiles each retained disposition's question against the post-drift contract and reports how
 * many decisions would differ. `method` is always RECONSTRUCTED: nothing is re-executed against
 * live sources, and the result must never be presented as though it were.
 */
export function replayDrift(input: ReplayInput): CounterfactualResult {
  const now = input.now ?? new Date()
  const candidates = input.dispositions
    .filter((record) => !input.event.contractId || record.contractId === input.event.contractId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  const changes: CounterfactualChange[] = []

  for (const record of candidates) {
    let sequence = 0
    const asOf = new Date(record.createdAt)
    const compiler = new ContextCompiler(input.contract, {
      now: () => asOf,
      id: () => `${input.event.id}_${record.id}_${sequence++}`,
    })
    // Replayed as the principal the original decision was issued to, so the reconstruction is
    // subject to the same plan-subject rule the original compile was.
    const replayed = compiler.compile(
      { question: record.question, contractId: input.contract.id, purposeId: record.purposeId, asOf: record.createdAt },
      { principalId: record.principalId, ...(input.tenantId ? { tenantId: input.tenantId } : {}) },
    )
    if (replayed.decision === record.decision) continue
    changes.push({
      dispositionId: record.id,
      question: record.question,
      purposeId: record.purposeId,
      riskTier: record.riskTier,
      before: record.decision,
      after: replayed.decision,
      reasonCodes: replayed.reasonCodes,
      createdAt: record.createdAt,
    })
  }

  const highRiskChanged = changes.filter((change) => highRiskTiers.includes(change.riskTier)).length
  const first = candidates[0]
  const last = candidates.at(-1)
  return {
    driftEventId: input.event.id,
    window: { from: first?.createdAt ?? input.event.detectedAt, to: last?.createdAt ?? input.event.detectedAt },
    evaluated: candidates.length,
    changed: changes.length,
    highRiskChanged,
    computedAt: now.toISOString(),
    method: 'RECONSTRUCTED',
    summary: candidates.length === 0
      ? 'No dispositions are retained for this contract, so no decision can be shown to change.'
      : `${changes.length} of the last ${candidates.length} dispositions would have changed, including ${highRiskChanged} high-risk.`,
    changes,
  }
}
