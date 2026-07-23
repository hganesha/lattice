import { useEffect, useMemo, useState } from 'react'
import type { ContextContract, EvidenceRecord, ReviewRequestArtifact } from '@lattice/contracts'
import { API_URL, apiAuthHeaders } from './api'
import { useMessages } from './i18n/messages'
import { PanelCollapseButton, usePersistentCollapsed } from './PanelCollapseButton'
type EvidenceFilter = 'ALL' | EvidenceRecord['type']

interface EvidenceRegistryStudioProps {
  contract: ContextContract
}

interface EvidenceDependency {
  id: string
  kind: string
  label: string
  detail: string
}

export function EvidenceRegistryStudio({ contract }: EvidenceRegistryStudioProps) {
  const { t, formatDate } = useMessages()
  const { collapsed: inspectorCollapsed, toggleCollapsed: toggleInspector } = usePersistentCollapsed('lattice:inspector-collapsed')
  const [filter, setFilter] = useState<EvidenceFilter>('ALL')
  const [selectedId, setSelectedId] = useState(contract.evidence[0]?.id ?? '')
  const [reviews, setReviews] = useState<ReviewRequestArtifact[]>([])
  const selected = contract.evidence.find((evidence) => evidence.id === selectedId) ?? contract.evidence[0]
  const now = Date.now()

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`${API_URL}/v1/reviews?contractId=${encodeURIComponent(contract.id)}`, { headers: apiAuthHeaders(), signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<ReviewRequestArtifact[]> : [])
      .then(setReviews)
      .catch(() => undefined)
    return () => controller.abort()
  }, [contract.id])

  const visibleEvidence = filter === 'ALL' ? contract.evidence : contract.evidence.filter((evidence) => evidence.type === filter)
  const freshnessCounts = useMemo(() => contract.evidence.reduce((counts, evidence) => {
    counts[freshness(evidence, now)] += 1
    return counts
  }, { CURRENT: 0, AGING: 0, STALE: 0, INVALID: 0 }), [contract.evidence, now])
  const dependencies = selected ? evidenceDependencies(contract, selected, reviews, t) : []
  const types = [...new Set(contract.evidence.map((evidence) => evidence.type))]

  return <section className="evidence-registry-page">
    <div className="evidence-hero"><div><span className="panel-kicker">{t('evidenceRegistryKicker').toLocaleUpperCase()}</span><h2>{t('evidenceRegistryTitle')}</h2><p>{t('evidenceRegistryDescription')}</p></div><div className="evidence-integrity"><span>⌁</span><div><b>{t('evidenceContentAddressed')}</b><small>{t('evidenceImmutableReferences', { count: contract.evidence.length })}</small></div></div></div>
    <div className="evidence-stats"><article><span>{t('evidenceTotalArtifacts').toLocaleUpperCase()}</span><b>{contract.evidence.length}</b><small>{t('evidenceClasses', { count: types.length })}</small></article><article><span>{t('evidenceCurrent').toLocaleUpperCase()}</span><b>{freshnessCounts.CURRENT}</b><small>{t('evidenceWithinDay')}</small></article><article><span>{t('evidenceAging').toLocaleUpperCase()}</span><b>{freshnessCounts.AGING}</b><small>{t('evidenceWithinWeek')}</small></article><article><span>{t('evidenceDependencyLinks').toLocaleUpperCase()}</span><b>{contract.evidence.reduce((total, evidence) => total + evidenceDependencies(contract, evidence, reviews, t).length, 0)}</b><small>{t('evidenceClaimsEvents')}</small></article></div>
    <div className={`evidence-layout ${inspectorCollapsed ? 'inspector-collapsed' : ''}`}>
      <main className="evidence-list-panel panel"><header><div><span className="panel-kicker">{t('evidenceProvenanceArtifacts').toLocaleUpperCase()}</span><h2>{contract.name}</h2></div><nav aria-label={t('evidenceFilters')}><button className={filter === 'ALL' ? 'active' : ''} onClick={() => setFilter('ALL')}>{t('reviewFilterAll').toLocaleUpperCase()}</button>{types.map((type) => <button className={filter === type ? 'active' : ''} onClick={() => setFilter(type)} key={type}>{shortType(type)}</button>)}</nav></header><div className="evidence-list">{visibleEvidence.map((evidence) => { const state = freshness(evidence, now); const linked = evidenceDependencies(contract, evidence, reviews, t).length; return <button className={`evidence-row ${selected?.id === evidence.id ? 'selected' : ''}`} onClick={() => setSelectedId(evidence.id)} key={evidence.id}><span className={`evidence-type-icon ${evidence.type.toLocaleLowerCase()}`}>{typeIcon(evidence.type)}</span><div><span><b>{evidence.title}</b><em className={state.toLocaleLowerCase()}>{freshnessLabel(state, t)}</em></span><p>{evidence.source} · {evidence.locator}</p><footer><code>{evidence.id}</code><span>{evidence.status.replaceAll('_', ' ')}</span><span>{t('evidenceDependencies', { count: linked })}</span></footer></div><time>{formatDate(evidence.observedAt, { dateStyle: 'medium', timeStyle: 'short' })}</time></button>})}</div></main>
      <aside className={`evidence-inspector collapsible-inspector panel ${inspectorCollapsed ? 'collapsed' : ''}`} id="evidence-inspector">
        <div className="collapsible-inspector-header">
          {!inspectorCollapsed && selected && <header><div><span className="panel-kicker">{t('evidenceDetail').toLocaleUpperCase()}</span><h2>{selected.title}</h2></div><span className={`evidence-freshness ${freshness(selected, now).toLocaleLowerCase()}`}>{freshnessLabel(freshness(selected, now), t)}</span></header>}
          <PanelCollapseButton collapsed={inspectorCollapsed} collapseLabel={t('collapseInspector')} expandLabel={t('expandInspector')} panelId="evidence-inspector" side="right" onToggle={toggleInspector} />
        </div>
        {!inspectorCollapsed && (selected ? <><div className="evidence-source-card"><span>{typeIcon(selected.type)}</span><div><b>{selected.source}</b><small>{selected.type.replaceAll('_', ' ')}</small></div></div><dl><div><dt>{t('evidenceObserved').toLocaleUpperCase()}</dt><dd>{formatDate(selected.observedAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div><div><dt>{t('evidenceValidFrom').toLocaleUpperCase()}</dt><dd>{formatDate(selected.validFrom, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div><div><dt>{t('evidenceValidUntil').toLocaleUpperCase()}</dt><dd>{selected.validUntil ? formatDate(selected.validUntil, { dateStyle: 'medium', timeStyle: 'short' }) : t('evidenceOpenEnded')}</dd></div><div><dt>{t('evidenceClaimStatus').toLocaleUpperCase()}</dt><dd>{selected.status.replaceAll('_', ' ')}</dd></div><div><dt>{t('evidenceLocator').toLocaleUpperCase()}</dt><dd>{selected.locator}</dd></div></dl><div className="evidence-checksum"><span>{t('evidenceContentDigest').toLocaleUpperCase()}</span><code>{selected.checksum}</code></div><section className="dependency-section"><div><span>{t('evidenceDependencyTrace').toLocaleUpperCase()}</span><b>{dependencies.length}</b></div>{dependencies.length === 0 && <p>{t('evidenceNoDirectClaim')}</p>}{dependencies.map((dependency) => <article key={`${dependency.kind}:${dependency.id}`}><span>{dependency.kind.slice(0, 3)}</span><div><b>{dependency.label}</b><small>{dependency.detail}</small></div></article>)}</section></> : <div className="evidence-empty">{t('evidenceNoArtifacts')}</div>)}
      </aside>
    </div>
  </section>
}

function freshness(evidence: EvidenceRecord, now: number): 'CURRENT' | 'AGING' | 'STALE' | 'INVALID' {
  if (evidence.validUntil && new Date(evidence.validUntil).getTime() < now) return 'INVALID'
  const age = now - new Date(evidence.observedAt).getTime()
  if (age <= 24 * 60 * 60_000) return 'CURRENT'
  if (age <= 7 * 24 * 60 * 60_000) return 'AGING'
  return 'STALE'
}

function evidenceDependencies(contract: ContextContract, evidence: EvidenceRecord, reviews: ReviewRequestArtifact[], t: ReturnType<typeof useMessages>['t']): EvidenceDependency[] {
  const dependencies: EvidenceDependency[] = []
  for (const entity of contract.entities.filter((item) => item.evidenceRefs.includes(evidence.id))) dependencies.push({ id: entity.id, kind: 'OBJECT', label: entity.label, detail: contract.entityTypes.find((type) => type.id === entity.typeId)?.label ?? entity.typeId })
  for (const relationship of contract.relationships.filter((item) => item.evidenceRefs.includes(evidence.id))) dependencies.push({ id: relationship.id, kind: 'RELATION', label: contract.relationshipTypes.find((type) => type.id === relationship.typeId)?.label ?? relationship.typeId, detail: `${relationship.sourceEntityId} → ${relationship.targetEntityId}` })
  for (const binding of contract.bindings.filter((item) => item.sourceChecksum === evidence.checksum || evidence.id.includes(item.id))) dependencies.push({ id: binding.id, kind: 'BINDING', label: binding.sourceSystem, detail: `${binding.method ?? 'OP'} ${binding.endpoint ?? binding.operationId}` })
  for (const review of reviews.filter((item) => item.decision?.artifactDigest === evidence.checksum)) dependencies.push({ id: review.id, kind: 'DECISION', label: review.targetLabel, detail: t('evidenceDecisionBy', { decision: review.decision?.decision.replaceAll('_', ' ') ?? '', name: review.decision?.decidedBy ?? '' }) })
  if (evidence.locator.startsWith('/v1/assurance/runs/')) dependencies.push({ id: evidence.locator, kind: 'ASSURANCE', label: t('evidenceAssuranceRun'), detail: t('evidenceSynchronizedChecks', { count: contract.tests.filter((test) => test.lastRun === evidence.observedAt).length }) })
  return dependencies
}

function freshnessLabel(state: ReturnType<typeof freshness>, t: ReturnType<typeof useMessages>['t']): string {
  return t(state === 'CURRENT' ? 'evidenceFreshnessCurrent' : state === 'AGING' ? 'evidenceFreshnessAging' : state === 'STALE' ? 'evidenceFreshnessStale' : 'evidenceFreshnessInvalid')
}

function typeIcon(type: EvidenceRecord['type']): string {
  if (type === 'DATA_BINDING') return 'API'
  if (type === 'EXPERT_DECISION') return 'DEC'
  if (type === 'OBSERVATION') return 'OBS'
  if (type === 'TEMPLATE') return 'TPL'
  return 'DOC'
}

function shortType(type: EvidenceRecord['type']): string {
  return type === 'EXPERT_DECISION' ? 'DECISION' : type === 'DATA_BINDING' ? 'BINDING' : type
}
