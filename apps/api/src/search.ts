import type {
  CaseSetSummary,
  ContractRegistryEntry,
  DispositionRecord,
  DriftEvent,
  EvalRunSummary,
  IndustryWorkspace,
  Principal,
  ReviewRequestArtifact,
  SearchResult,
  SearchResultKind,
} from '@lattice/contracts'

export interface SearchInput {
  query: string
  workspaceId?: string
  limit?: number
  workspaces: IndustryWorkspace[]
  entries: ContractRegistryEntry[]
  dispositions: DispositionRecord[]
  evalRuns: EvalRunSummary[]
  caseSets: CaseSetSummary[]
  reviews: ReviewRequestArtifact[]
  driftEvents: DriftEvent[]
  principals: Principal[]
}

const surfaces: ReadonlyArray<{ id: string; title: string; subtitle: string; suffix: string }> = [
  { id: 'surface-ontology', title: 'Ontology builder', subtitle: 'Entity types, relationships, and layout', suffix: 'ontology' },
  { id: 'surface-bindings', title: 'Source bindings', subtitle: 'Connectors, mappings, freshness', suffix: 'bindings' },
  { id: 'surface-policies', title: 'Runtime policies', subtitle: 'Risk tiers, evidence floors, approvals', suffix: 'policies' },
  { id: 'surface-reviews', title: 'Review queue', subtitle: 'Open governance decisions', suffix: 'reviews' },
  { id: 'surface-assurance', title: 'Assurance', subtitle: 'Structural, question, mapping and policy checks', suffix: 'assurance' },
  { id: 'surface-releases', title: 'Releases', subtitle: 'Published versions and restore points', suffix: 'releases' },
  { id: 'surface-runtime', title: 'Runtime', subtitle: 'Compile a governed question', suffix: 'runtime' },
]

/**
 * Scoped entity search (E19). `score` is relevance only — it is never a confidence figure and is
 * never rendered as a percentage of anything.
 */
export function search(input: SearchInput): SearchResult[] {
  const needle = normalize(input.query)
  if (needle.length === 0) return []
  const tokens = needle.split(' ').filter((token) => token.length > 1)
  const results: SearchResult[] = []
  const workspaceOf = new Map(input.entries.map((entry) => [entry.contractId, entry.draft.ontologyRef?.workspaceId ?? `workspace-${slug(entry.draft.domain)}`]))
  const inScope = (workspaceId: string | undefined): boolean => !input.workspaceId || workspaceId === input.workspaceId

  const add = (kind: SearchResultKind, id: string, title: string, subtitle: string, route: string, boost = 0): void => {
    const score = relevance(needle, tokens, [title, subtitle, id]) + boost
    if (score > 0) results.push({ id, kind, title, subtitle, route, score })
  }

  for (const workspace of input.workspaces) {
    if (!inScope(workspace.id)) continue
    add('WORKSPACE', workspace.id, workspace.name, `${workspace.ontology.entityTypes.length} entity types · ${workspace.contractIds.length} contracts`, `/w/${workspace.id}`, 6)
  }

  for (const entry of input.entries) {
    const workspaceId = workspaceOf.get(entry.contractId) ?? 'workspace'
    if (!inScope(workspaceId)) continue
    const base = `/w/${workspaceId}/c/${entry.contractId}`
    add('CONTRACT', entry.contractId, entry.draft.name, `${entry.draft.domain} · ${entry.draft.releaseStatus.toLocaleLowerCase()} · v${entry.draft.version}`, `${base}/ontology`, 8)
    for (const surface of surfaces) add('SURFACE', `${entry.contractId}:${surface.id}`, `${surface.title} — ${entry.draft.name}`, surface.subtitle, `${base}/${surface.suffix}`)
    for (const binding of entry.draft.bindings) add('SOURCE_BINDING', binding.id, binding.sourceSystem, `Binding on ${entry.draft.name} · ${binding.approvalStatus.toLocaleLowerCase()}`, `${base}/bindings`, 2)
    for (const policy of entry.draft.policies) add('POLICY', policy.id, policy.label, `${policy.riskTier.replaceAll('_', ' ').toLocaleLowerCase()} · minimum ${policy.minimumEvidenceStrength.toLocaleLowerCase()} evidence`, `${base}/policies`, 2)
    for (const type of entry.draft.entityTypes) add('ENTITY_TYPE', `${entry.contractId}:${type.id}`, type.label, `${type.group} · ${type.description}`, `${base}/ontology`, 1)
  }

  for (const record of input.dispositions) {
    if (!inScope(record.workspaceId)) continue
    add('DISPOSITION', record.id, record.question, `${record.decision.replaceAll('_', ' ').toLocaleLowerCase()} · ${record.purposeLabel} · ${record.createdAt}`, `/dispositions/${record.id}`, 3)
  }
  for (const run of input.evalRuns) {
    if (!inScope(run.workspaceId)) continue
    add('EVAL_RUN', run.id, run.name, `${run.summary.passed}/${run.summary.total} passed · ${run.status.toLocaleLowerCase()}`, `/runs/${run.id}`, 3)
  }
  for (const caseSet of input.caseSets) {
    if (!inScope(caseSet.workspaceId)) continue
    add('CASE_SET', caseSet.id, caseSet.name, `${caseSet.caseCount} cases · v${caseSet.version}`, `/case-sets/${caseSet.id}`, 3)
  }
  for (const review of input.reviews) {
    if (!inScope(review.workspaceId ?? workspaceOf.get(review.contractId))) continue
    add('REVIEW', review.id, review.targetLabel, `${review.status.toLocaleLowerCase()} review · ${review.targetKind.replaceAll('_', ' ').toLocaleLowerCase()}`, `/reviews/${review.id}`, 3)
  }
  for (const event of input.driftEvents) {
    if (!inScope(event.workspaceId)) continue
    add('DRIFT_EVENT', event.id, `${event.kind.replaceAll('_', ' ').toLocaleLowerCase()} · ${event.subject.label}`, event.detail, `/drift/${event.id}`, 3)
  }
  for (const principal of input.principals) {
    if (input.workspaceId && !principal.workspaceIds.includes(input.workspaceId)) continue
    add('PRINCIPAL', principal.id, principal.displayName, `${principal.kind.toLocaleLowerCase()} · ${principal.roles.join(', ') || 'no role'}`, `/principals/${principal.id}`, 4)
  }

  return results
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, input.limit ?? 25)
}

function relevance(needle: string, tokens: string[], fields: string[]): number {
  let score = 0
  fields.forEach((field, index) => {
    const value = normalize(field)
    const fieldWeight = index === 0 ? 3 : index === 1 ? 2 : 1
    if (value === needle) score += 60 * fieldWeight
    else if (value.startsWith(needle)) score += 25 * fieldWeight
    else if (value.includes(needle)) score += 15 * fieldWeight
    for (const token of tokens) if (value.includes(token)) score += 4 * fieldWeight
  })
  return score
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
}

function slug(value: string): string {
  return value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'
}
