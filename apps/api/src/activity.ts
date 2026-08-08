import type {
  ActivityEvent,
  AssuranceRun,
  ContractRegistryEntry,
  DispositionRecord,
  DriftEvent,
  EmergencyAuthorization,
  EvalRunSummary,
  NegativeDecision,
  ReviewRequestArtifact,
} from '@lattice/contracts'

export interface ActivityInput {
  workspaceId?: string
  contractId?: string
  limit: number
  entries: ContractRegistryEntry[]
  dispositions: DispositionRecord[]
  assuranceRuns: AssuranceRun[]
  evalRuns: EvalRunSummary[]
  driftEvents: DriftEvent[]
  reviews: ReviewRequestArtifact[]
  emergencyAuthorizations: EmergencyAuthorization[]
  negativeDecisions: NegativeDecision[]
  viewer: { principalId: string; roles: string[] }
}

/** One merged, newest-first stream (E21). Every entry carries a route that actually resolves. */
export function buildActivity(input: ActivityInput): ActivityEvent[] {
  const workspaceOf = new Map(input.entries.map((entry) => [entry.contractId, entry.draft.ontologyRef?.workspaceId ?? `workspace-${slug(entry.draft.domain)}`]))
  const contractName = new Map(input.entries.map((entry) => [entry.contractId, entry.draft.name]))
  const events: ActivityEvent[] = []
  const base = (contractId: string): string => `/w/${workspaceOf.get(contractId) ?? 'workspace'}/c/${contractId}`

  for (const record of input.dispositions) {
    events.push({
      id: record.id,
      kind: 'DISPOSITION',
      title: `${record.decision.replaceAll('_', ' ').toLocaleLowerCase()} · ${record.question}`,
      detail: `${record.mode === 'DRY_RUN' ? 'Dry run' : 'Authorized'} compile for ${record.purposeLabel} at ${record.riskTier.replaceAll('_', ' ').toLocaleLowerCase()} risk.`,
      at: record.createdAt,
      route: `/dispositions/${record.id}`,
      actor: record.principalId,
      ...(record.riskTier === 'OPERATIONAL_ACTION' ? { severity: 'CRITICAL' as const } : record.riskTier === 'PLANNING_DECISION' ? { severity: 'HIGH' as const } : {}),
    })
  }

  for (const run of input.assuranceRuns) {
    events.push({
      id: run.id,
      kind: 'ASSURANCE_RUN',
      title: `Assurance ${run.status.toLocaleLowerCase()} on ${contractName.get(run.contractId) ?? run.contractId}`,
      detail: `${run.summary.passed} passed · ${run.summary.failed} failed · ${run.summary.warnings} warnings.`,
      at: run.completedAt,
      route: `${base(run.contractId)}/assurance`,
      ...(run.status === 'FAIL' ? { severity: 'HIGH' as const } : {}),
    })
  }

  for (const run of input.evalRuns) {
    events.push({
      id: run.id,
      kind: 'EVAL_RUN',
      title: `${run.name} · ${run.summary.passed}/${run.summary.total} passed`,
      detail: run.summary.gateFailures > 0
        ? `${run.summary.gateFailures} case${run.summary.gateFailures === 1 ? '' : 's'} failed a hard gate, so no score is shown for ${run.summary.gateFailures === 1 ? 'it' : 'them'}.`
        : `Weighted score ${run.summary.weightedScore ?? '—'} across ${run.summary.total} cases.`,
      at: run.completedAt ?? run.startedAt,
      route: `/runs/${run.id}`,
      actor: run.triggeredBy,
      ...(run.summary.gateFailures > 0 ? { severity: 'HIGH' as const } : {}),
    })
  }

  for (const event of input.driftEvents) {
    events.push({
      id: event.id,
      kind: 'DRIFT_EVENT',
      title: `${event.kind.replaceAll('_', ' ').toLocaleLowerCase()} · ${event.subject.label}`,
      detail: event.counterfactual?.summary ?? event.detail,
      at: event.detectedAt,
      route: `/drift/${event.id}`,
      severity: event.severity,
    })
  }

  for (const review of input.reviews) {
    const awaiting = review.status === 'OPEN' && awaitsViewer(review, input.viewer)
    events.push({
      id: review.id,
      kind: review.status === 'DECIDED' ? 'REVIEW_DECIDED' : 'REVIEW_OPENED',
      title: `${review.status === 'DECIDED' ? review.decision?.decision.replaceAll('_', ' ').toLocaleLowerCase() ?? 'decided' : 'review opened'} · ${review.targetLabel}`,
      detail: review.decision?.rationale ?? `${review.targetKind.replaceAll('_', ' ').toLocaleLowerCase()} awaiting ${review.routingPlan?.quorum ?? 1} approval${(review.routingPlan?.quorum ?? 1) === 1 ? '' : 's'} by ${review.routingPlan?.dueAt ?? 'the review SLA'}.`,
      at: review.decision?.decidedAt ?? review.submittedAt,
      route: `/reviews/${review.id}`,
      severity: review.impact,
      actor: review.decision?.decidedBy ?? review.submittedBy,
      ...(awaiting ? { awaitingMe: true } : {}),
    })
  }

  for (const entry of input.entries) {
    for (const release of entry.releases) {
      events.push({
        id: `${entry.contractId}@${release.version}`,
        kind: 'RELEASE',
        title: `${entry.draft.name} ${release.version} published`,
        detail: release.notes,
        at: release.publishedAt,
        route: `${base(entry.contractId)}/releases`,
      })
    }
  }

  for (const authorization of input.emergencyAuthorizations) {
    events.push({
      id: authorization.id,
      kind: 'EMERGENCY_AUTHORIZATION',
      title: `Emergency authorization ${authorization.status.toLocaleLowerCase()} on ${contractName.get(authorization.contractId) ?? authorization.contractId}`,
      detail: authorization.retrospective ? `Retrospective: ${authorization.retrospective.verdict.toLocaleLowerCase()}.` : authorization.justification,
      at: authorization.requestedAt,
      route: `/emergency-authorizations/${authorization.id}`,
      severity: 'CRITICAL',
      actor: authorization.requestedBy,
      ...(authorization.status === 'PENDING' && authorization.requiredApproverRoles.some((role) => input.viewer.roles.includes(role)) ? { awaitingMe: true } : {}),
    })
  }

  for (const decision of input.negativeDecisions) {
    events.push({
      id: decision.id,
      kind: 'NEGATIVE_DECISION',
      title: `Negative decision · ${decision.prohibited.subject}`,
      detail: `${decision.status.replaceAll('_', ' ').toLocaleLowerCase()}, revisited by ${decision.reviewBy}.`,
      at: decision.decidedAt,
      route: `/negative-decisions/${decision.id}`,
      actor: decision.decidedBy,
      ...(decision.status === 'DUE_FOR_REVIEW' ? { severity: 'MEDIUM' as const, awaitingMe: true } : {}),
    })
  }

  return events
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, Math.max(1, input.limit))
}

function awaitsViewer(review: ReviewRequestArtifact, viewer: { principalId: string; roles: string[] }): boolean {
  const assignments = review.routingPlan?.assignments ?? []
  if (assignments.length === 0) return false
  return assignments.some((assignment) => assignment.status === 'PENDING' && (assignment.principalId === viewer.principalId || viewer.roles.includes(assignment.role)))
}

function slug(value: string): string {
  return value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'
}
