import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { autonomyTierDefinitions, type AutonomyTierDefinition, type DelegationGrant, type IdentityGraph, type Principal, type PrincipalChainLink, type PrincipalKind, type PurposeAudience, type RiskTier } from '@lattice/contracts'
import { apiFetch } from './api'
import { useResource, type Resource } from './useResource'
import { EmptyState, ErrorState, LoadingState, MetricTile, Pagination, SurfaceHero } from './SurfaceState'
import { riskTone, shortDigest } from './formatters'
import { buildDelegationLayout, grantsForPrincipal, stepDelegationFocus, DELEGATION_NODE_HEIGHT, DELEGATION_NODE_WIDTH, type DelegationLayout } from './delegationLayout'
import { useIdentityMessages } from './i18n/messages.identity'
import { Toast } from './Toast'
import { routes, type SurfaceId } from './router'
import { IconBan, IconLink, IconNetwork, IconPlug, IconPlus, IconUserCheck, IconUsers, IconX, IconZap } from './icons'
import './identity.css'

/**
 * E15 — Identities & Delegation.
 *
 * Fixes G6: the signed-in principal comes from `GET /v1/session`, not a hard-coded avatar, and
 * every request carries the session identity through `apiFetch`. The graph is laid out by
 * `buildDelegationLayout` from the data — no hand-placed coordinates, and no principal is
 * silently dropped (dangling grants are reported instead).
 */

interface IdentitiesStudioProps {
  workspaceId?: string
  detailId?: string
  onNavigate: (surface: SurfaceId, detailId?: string) => void
  onNavigatePath: (path: string) => void
}

interface SessionResponse {
  principal: Principal
  chain: PrincipalChainLink[]
}

const directoryPageSize = 8
const grantPageSize = 10
const revokeMinimum = 24
const kindOptions: readonly PrincipalKind[] = ['HUMAN', 'AGENT', 'SERVICE']
const statusOptions: readonly Principal['status'][] = ['ACTIVE', 'SUSPENDED', 'RETIRED']
const audienceOptions: readonly PurposeAudience[] = ['INTERNAL', 'PARTNER', 'CUSTOMER', 'REGULATOR', 'PUBLIC']
const riskOptions: readonly RiskTier[] = ['INFORMATIONAL', 'ANALYTICAL', 'PLANNING_DECISION', 'OPERATIONAL_ACTION']

function kindGlyph(kind: PrincipalKind) {
  return kind === 'HUMAN' ? IconUserCheck : kind === 'AGENT' ? IconZap : IconPlug
}

function splitList(value: string): string[] {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean)
}

export function IdentitiesStudio({ workspaceId, detailId, onNavigate, onNavigatePath }: IdentitiesStudioProps) {
  const { t, formatDate, formatNumber } = useIdentityMessages()
  const graph = useResource<IdentityGraph>(`/v1/identity-graph${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`)
  const session = useResource<SessionResponse>('/v1/session')
  const [selectedId, setSelectedId] = useState(detailId ?? '')
  const [kind, setKind] = useState<PrincipalKind | ''>('')
  const [status, setStatus] = useState<Principal['status'] | ''>('')
  const [search, setSearch] = useState('')
  const [directoryPage, setDirectoryPage] = useState(0)
  const [grantPage, setGrantPage] = useState(0)
  const [issueOpen, setIssueOpen] = useState(false)
  const [revokeId, setRevokeId] = useState('')
  const [notice, setNotice] = useState('')
  const [noticeTone, setNoticeTone] = useState<'info' | 'success' | 'error'>('info')

  const principals = useMemo(() => graph.data?.principals ?? [], [graph.data])
  const grants = useMemo(() => graph.data?.grants ?? [], [graph.data])
  const tiers = graph.data?.autonomyTiers ?? autonomyTierDefinitions
  const layout = useMemo(() => buildDelegationLayout(principals, grants), [principals, grants])
  const filterKey = [kind, status, search.trim().toLocaleLowerCase()].join('|')

  useEffect(() => { if (detailId) setSelectedId(detailId) }, [detailId])
  useEffect(() => { setDirectoryPage(0) }, [filterKey])
  useEffect(() => { setGrantPage(0) }, [selectedId])

  const term = search.trim().toLocaleLowerCase()
  const filtered = principals.filter((principal) => {
    if (kind && principal.kind !== kind) return false
    if (status && principal.status !== status) return false
    if (!term) return true
    return [principal.displayName, principal.id, principal.email ?? '', ...principal.roles].some((field) => field.toLocaleLowerCase().includes(term))
  })
  const visible = filtered.slice(directoryPage * directoryPageSize, directoryPage * directoryPageSize + directoryPageSize)
  const scopedGrants = grantsForPrincipal(grants, selectedId || undefined)
  const visibleGrants = scopedGrants.slice(grantPage * grantPageSize, grantPage * grantPageSize + grantPageSize)
  const selectedPrincipal = principals.find((principal) => principal.id === selectedId)
  const filtering = Boolean(kind || status || term)

  const humans = principals.filter((principal) => principal.kind === 'HUMAN').length
  const agents = principals.filter((principal) => principal.kind === 'AGENT').length
  const services = principals.filter((principal) => principal.kind === 'SERVICE').length
  const tieredAgents = principals.filter((principal) => principal.kind === 'AGENT' && principal.autonomyTier).length
  const activeGrants = grants.filter((grant) => grant.status === 'ACTIVE').length
  const depth = layout.nodes.reduce((deepest, node) => Math.max(deepest, node.depth), 0)

  function selectPrincipal(id: string) {
    const next = selectedId === id ? '' : id
    setSelectedId(next)
    onNavigate('identities', next || undefined)
  }

  function announce(message: string, tone: 'info' | 'success' | 'error') {
    setNotice(message)
    setNoticeTone(tone)
  }

  function clearFilters() {
    setKind('')
    setStatus('')
    setSearch('')
  }

  return <section className="identity-page">
    <SurfaceHero kicker={t('identityKicker')} title={t('identityTitle')} description={t('identityDescription')}><button className="release" onClick={() => setIssueOpen((open) => !open)}><IconPlus /> {issueOpen ? t('identityIssueCancel') : t('identityIssue')}</button></SurfaceHero>

    {notice && <Toast message={notice} closeLabel={t('commonClose')} onDismiss={() => setNotice('')} tone={noticeTone} durationMs={6000} />}

    <div className="surface-metrics"><MetricTile label={t('identityMetricPrincipals')} value={formatNumber(principals.length)} meta={t('identityMetricPrincipalsMeta', { humans, agents, services })} tone="info" /><MetricTile label={t('identityMetricAgents')} value={formatNumber(tieredAgents)} meta={t('identityMetricAgentsMeta', { untiered: agents - tieredAgents })} tone="brand" /><MetricTile label={t('identityMetricActiveGrants')} value={formatNumber(activeGrants)} meta={t('identityMetricActiveGrantsMeta', { inactive: grants.length - activeGrants })} tone="success" /><MetricTile label={t('identityMetricDepth')} value={formatNumber(depth)} meta={t('identityMetricDepthMeta')} tone="governance" /></div>

    <SessionPanel resource={session} />

    {graph.status === 'LOADING' && <LoadingState label={t('identityLoading')} />}
    {graph.status === 'ERROR' && <ErrorState title={t('identityErrorTitle')} detail={graph.error} retryLabel={t('commonRetry')} onRetry={graph.reload} />}
    {graph.status === 'READY' && principals.length === 0 && <EmptyState title={t('identityEmptyTitle')} description={t('identityEmptyDescription')} icon={<IconUsers />} />}

    {issueOpen && principals.length > 0 && <IssueGrantForm principals={principals} defaultFromId={session.data?.principal.id ?? principals[0]?.id ?? ''} onCancel={() => { setIssueOpen(false); announce(t('identityIssueCancelled'), 'info') }} onIssued={(name) => { setIssueOpen(false); graph.reload(); announce(t('identityIssuedNotice', { name }), 'success') }} onFailed={(detail) => announce(`${t('identityIssueFailed')} ${detail}`, 'error')} />}

    {principals.length > 0 && <div className="identity-layout">
      <section className="panel identity-graph-panel">
        <header className="identity-panel-head"><div><span className="panel-kicker">{t('identityGraphKicker')}</span><h2>{t('identityGraphTitle')}</h2></div>{selectedPrincipal && <button className="ghost" onClick={() => selectPrincipal(selectedPrincipal.id)}><IconX /> {t('identityGraphClear')}</button>}</header>
        <p className="identity-hint">{t('identityGraphHint')}</p>
        {selectedPrincipal && <p className="identity-hint selected" role="status">{t('identityGraphSelected', { name: selectedPrincipal.displayName })}</p>}
        <DelegationGraph layout={layout} selectedId={selectedId} onSelect={selectPrincipal} onClear={() => { if (selectedId) selectPrincipal(selectedId) }} />
        {layout.danglingGrantIds.length > 0 && <p className="identity-hint warn">{t('identityGraphDangling', { count: layout.danglingGrantIds.length })}</p>}
      </section>

      <section className="panel identity-directory-panel">
        <header className="identity-panel-head"><div><span className="panel-kicker">{t('identityDirectoryKicker')}</span><h2>{t('identityDirectoryTitle')}</h2></div></header>
        <div className="surface-filters" role="group" aria-label={t('identityDirectoryKicker')}>
          <label>{t('identityFilterKind')}<select value={kind} onChange={(event) => setKind(event.target.value as PrincipalKind | '')}><option value="">{t('identityFilterAll')}</option>{kindOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>
          <label>{t('identityFilterStatus')}<select value={status} onChange={(event) => setStatus(event.target.value as Principal['status'] | '')}><option value="">{t('identityFilterAll')}</option>{statusOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>
          <label>{t('identityFilterSearch')}<input value={search} placeholder={t('identityFilterSearchPlaceholder')} onChange={(event) => setSearch(event.target.value)} /></label>
          {filtering && <button className="ghost" onClick={clearFilters}>{t('identityClearFilters')}</button>}
        </div>
        {filtered.length === 0 ? <EmptyState title={t('identityNoMatchTitle')} description={t('identityNoMatchDescription')} icon={<IconUsers />} actionLabel={t('identityClearFilters')} onAction={clearFilters} /> : <ul className="principal-list">{visible.map((principal) => <li key={principal.id}><PrincipalCard principal={principal} tiers={tiers} selected={principal.id === selectedId} onSelect={() => selectPrincipal(principal.id)} /></li>)}</ul>}
        {filtered.length > directoryPageSize && <Pagination page={directoryPage} pageSize={directoryPageSize} total={filtered.length} onPage={setDirectoryPage} labels={{ previous: t('commonPrevious'), next: t('commonNext'), range: (from, to, total) => t('commonRange', { from, to, total }) }} />}
      </section>
    </div>}

    {principals.length > 0 && <section className="panel identity-grants-panel">
      <header className="identity-panel-head"><div><span className="panel-kicker">{t('identityGrantsKicker')}</span><h2>{selectedPrincipal ? t('identityGrantsFor', { name: selectedPrincipal.displayName }) : t('identityGrantsAll')}</h2></div><span className="identity-count">{formatNumber(scopedGrants.length)}</span></header>
      {scopedGrants.length === 0 ? <EmptyState title={t('identityGrantsEmptyTitle')} description={t('identityGrantsEmptyDescription')} icon={<IconLink />} actionLabel={t('identityIssue')} onAction={() => setIssueOpen(true)} /> : <ul className="grant-list">{visibleGrants.map((grant) => <li key={grant.id}><GrantCard
        grant={grant}
        principals={principals}
        expanded={revokeId === grant.id}
        onToggleRevoke={() => setRevokeId((current) => current === grant.id ? '' : grant.id)}
        onRevoked={() => { setRevokeId(''); graph.reload(); announce(t('identityRevokedNotice', { id: grant.id }), 'success') }}
        onFailed={(detail) => announce(`${t('identityRevokeFailed')} ${detail}`, 'error')}
        onOpenContract={(contractId) => onNavigatePath(routes.surface(workspaceId, contractId, 'contracts'))}
      /></li>)}</ul>}
      {scopedGrants.length > grantPageSize && <Pagination page={grantPage} pageSize={grantPageSize} total={scopedGrants.length} onPage={setGrantPage} labels={{ previous: t('commonPrevious'), next: t('commonNext'), range: (from, to, total) => t('commonRange', { from, to, total }) }} />}
    </section>}
  </section>
}

/* ---- the signed-in principal, read from the API rather than hard-coded ---- */

function SessionPanel({ resource }: { resource: Resource<SessionResponse> }) {
  const { t, formatDate } = useIdentityMessages()
  if (resource.status === 'LOADING' || resource.status === 'IDLE') return <div className="panel identity-session"><LoadingState label={t('identityLoading')} /></div>
  // A session that does not resolve to a full principal is reported as unavailable rather than
  // rendered half-populated — an identity surface must not guess who you are.
  if (resource.status === 'ERROR' || !resource.data?.principal?.authentication) return <div className="panel identity-session"><p className="identity-hint warn">{t('identitySessionUnavailable')}</p></div>
  const { principal, chain } = resource.data
  const Glyph = kindGlyph(principal.kind)
  return <div className="panel identity-session">
    <div className="identity-session-head"><span className="principal-glyph" aria-hidden="true"><Glyph /></span><div><span className="panel-kicker">{t('identitySessionKicker')}</span><h2>{principal.displayName}</h2><p>{(principal.roles ?? []).join(' · ') || t('commonNone')}</p></div><span className={`identity-chip ${principal.status === 'ACTIVE' ? 'success' : 'neutral'}`}>{principal.status}</span></div>
    <dl className="identity-facts">
      <div><dt>{t('identityAuthMethod')}</dt><dd><code>{principal.authentication.method}</code></dd></div>
      <div><dt>{t('identityAuthIssuer')}</dt><dd>{principal.authentication.issuer}</dd></div>
      <div><dt>{t('identityAuthAssurance')}</dt><dd><code>{principal.authentication.assuranceLevel}</code></dd></div>
      <div><dt>{t('identityAuthLast')}</dt><dd>{principal.authentication.lastAuthenticatedAt ? formatDate(principal.authentication.lastAuthenticatedAt, { dateStyle: 'medium', timeStyle: 'short' }) : t('identityAuthNever')}</dd></div>
    </dl>
    <div className="identity-session-chain"><span className="identity-subhead">{t('identitySessionChain')}</span>{chain.length === 0 ? <p className="identity-hint">{t('commonNone')}</p> : <ol className="session-chain">{chain.map((link, index) => <li key={`${link.principalId}:${index}`}><b>{link.displayName}</b><span>{link.kind} · {link.role}</span><em>{t('identitySessionVia', { via: link.via })}</em>{link.expiresAt && <time dateTime={link.expiresAt}>{formatDate(link.expiresAt, { dateStyle: 'short', timeStyle: 'short' })}</time>}</li>)}</ol>}</div>
  </div>
}

/* ---- delegation graph: real layout, click-to-filter, arrow-key traversal ---- */

interface DelegationGraphProps {
  layout: DelegationLayout
  selectedId: string
  onSelect: (id: string) => void
  onClear: () => void
}

function DelegationGraph({ layout, selectedId, onSelect, onClear }: DelegationGraphProps) {
  const { t } = useIdentityMessages()
  const [focusId, setFocusId] = useState(layout.nodes[0]?.id ?? '')
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>())

  useEffect(() => {
    if (layout.nodes.some((node) => node.id === focusId)) return
    setFocusId(layout.nodes[0]?.id ?? '')
  }, [layout, focusId])

  function move(direction: 'left' | 'right' | 'up' | 'down') {
    const next = stepDelegationFocus(layout, focusId, direction)
    if (!next) return
    setFocusId(next)
    nodeRefs.current.get(next)?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const map: Record<string, 'left' | 'right' | 'up' | 'down'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
    const direction = map[event.key]
    if (direction) {
      event.preventDefault()
      move(direction)
      return
    }
    if (event.key === 'Escape' && selectedId) {
      event.preventDefault()
      onClear()
    }
  }

  if (layout.nodes.length === 0) return <p className="identity-hint">{t('commonNone')}</p>

  return <div className="delegation-canvas" role="group" aria-label={t('identityGraphRegion', { nodes: layout.nodes.length, edges: layout.edges.length })} onKeyDown={onKeyDown}>
    <div className="delegation-stage" style={{ width: layout.width, height: layout.height }}>
      <svg className="delegation-edges" width={layout.width} height={layout.height} aria-hidden="true" focusable="false">
        {layout.edges.map((edge) => <g className={`delegation-edge ${edge.active ? 'active' : 'inactive'} ${selectedId && (edge.fromId === selectedId || edge.toId === selectedId) ? 'highlighted' : ''}`} key={edge.id}>
          <path d={edge.path} fill="none" />
          <text x={edge.labelX} y={edge.labelY} textAnchor="middle">{t('identityGraphEdge', { remaining: edge.remainingActions, scope: edge.scopeCount })}</text>
        </g>)}
      </svg>
      {layout.layers.map((layer) => <span className="delegation-layer" key={layer.depth} style={{ left: layer.x, top: layer.y, width: layer.width }}>{t('identityGraphLayer', { depth: layer.depth })}</span>)}
      {layout.nodes.map((node) => <button
        type="button"
        key={node.id}
        ref={(element) => { if (element) nodeRefs.current.set(node.id, element); else nodeRefs.current.delete(node.id) }}
        className={`delegation-node ${node.kind.toLocaleLowerCase()} ${node.status !== 'ACTIVE' ? 'inactive' : ''} ${node.id === selectedId ? 'selected' : ''}`}
        style={{ left: node.x, top: node.y, width: DELEGATION_NODE_WIDTH, height: DELEGATION_NODE_HEIGHT }}
        tabIndex={node.id === focusId ? 0 : -1}
        aria-pressed={node.id === selectedId}
        aria-label={t('identityGraphNode', { name: node.label, kind: node.kind, depth: node.depth, incoming: node.incoming, outgoing: node.outgoing })}
        onFocus={() => setFocusId(node.id)}
        onClick={() => onSelect(node.id)}
      ><b>{node.label}</b><span>{node.kind} · {node.activeGrants}</span></button>)}
    </div>
  </div>
}

/* ---- principal directory card ---- */

function PrincipalCard({ principal, tiers, selected, onSelect }: { principal: Principal; tiers: readonly AutonomyTierDefinition[]; selected: boolean; onSelect: () => void }) {
  const { t, formatDate } = useIdentityMessages()
  const Glyph = kindGlyph(principal.kind)
  const tier = principal.autonomyTier ? tiers.find((definition) => definition.tier === principal.autonomyTier) : undefined
  return <article className={`principal-card ${selected ? 'selected' : ''} ${principal.status !== 'ACTIVE' ? 'inactive' : ''}`}>
    <header><span className={`principal-glyph ${principal.kind.toLocaleLowerCase()}`} aria-hidden="true"><Glyph /></span><div><h3>{principal.displayName}</h3><code>{principal.id}</code></div><span className={`identity-chip ${principal.status === 'ACTIVE' ? 'success' : principal.status === 'SUSPENDED' ? 'warning' : 'neutral'}`}>{principal.status}</span></header>
    <dl className="identity-facts">
      <div><dt>{t('identityRoles')}</dt><dd>{principal.roles.length > 0 ? principal.roles.join(', ') : t('commonNone')}</dd></div>
      <div><dt>{t('identityWorkspaces')}</dt><dd>{principal.workspaceIds.length > 0 ? principal.workspaceIds.join(', ') : t('commonNone')}</dd></div>
      <div><dt>{t('identityAuthentication')}</dt><dd><code>{principal.authentication.method}</code> · {principal.authentication.issuer} · <code>{principal.authentication.assuranceLevel}</code></dd></div>
      <div><dt>{t('identityAuthLast')}</dt><dd>{principal.authentication.lastAuthenticatedAt ? formatDate(principal.authentication.lastAuthenticatedAt, { dateStyle: 'medium', timeStyle: 'short' }) : t('identityAuthNever')}</dd></div>
      {principal.workloadIdentity && <div><dt>{t('identityWorkloadIdentity')}</dt><dd><code>{principal.workloadIdentity.platform}</code> {principal.workloadIdentity.identifier}</dd></div>}
      {principal.ownerPrincipalId && <div><dt>{t('identityOwner')}</dt><dd><code>{principal.ownerPrincipalId}</code></dd></div>}
      <div><dt>{t('identityCreated')}</dt><dd>{formatDate(principal.createdAt, { dateStyle: 'medium' })}</dd></div>
    </dl>
    {principal.kind === 'AGENT' && <div className={`autonomy-block ${tier ? '' : 'unset'}`}>
      <span className="identity-subhead">{t('identityAutonomy')}</span>
      {tier ? <><div className="autonomy-head"><span className="identity-chip brand">{tier.tier}</span><b>{tier.label}</b></div><p>{tier.description}</p><dl className="identity-facts tight"><div><dt>{t('identityAutonomyMaxRisk')}</dt><dd><span className={`identity-chip ${riskTone(tier.maximumRiskTier)}`}>{tier.maximumRiskTier}</span></dd></div><div><dt>{t('identityAutonomyApprovalRequired')}</dt><dd>{tier.humanApprovalRequired ? t('identityAutonomyApprovalRequired') : t('identityAutonomyApprovalNotRequired')}</dd></div></dl></> : <p className="identity-hint warn">{t('identityAutonomyUnset')}</p>}
    </div>}
    <footer><button className="ghost" onClick={onSelect} aria-pressed={selected}><IconNetwork /> {selected ? t('identityGraphClear') : t('identityOpenGrants')}</button></footer>
  </article>
}

/* ---- delegation grant card, with revoke ---- */

interface GrantCardProps {
  grant: DelegationGrant
  principals: Principal[]
  expanded: boolean
  onToggleRevoke: () => void
  onRevoked: () => void
  onFailed: (detail: string) => void
  onOpenContract: (contractId: string) => void
}

function GrantCard({ grant, principals, expanded, onToggleRevoke, onRevoked, onFailed, onOpenContract }: GrantCardProps) {
  const { t, formatDate, formatNumber } = useIdentityMessages()
  const [rationale, setRationale] = useState('')
  const [working, setWorking] = useState(false)
  const from = principals.find((principal) => principal.id === grant.fromPrincipalId)
  const to = principals.find((principal) => principal.id === grant.toPrincipalId)
  const remaining = Math.max(0, grant.maximumActions - grant.consumedActions)
  const active = grant.status === 'ACTIVE'
  const expired = new Date(grant.expiresAt).getTime() < Date.now()

  async function revoke() {
    if (rationale.trim().length < revokeMinimum) return
    setWorking(true)
    try {
      await apiFetch(`/v1/delegations/${encodeURIComponent(grant.id)}/revoke`, { method: 'POST', json: { rationale: rationale.trim() } })
      setRationale('')
      onRevoked()
    } catch (caught) {
      onFailed(caught instanceof Error ? caught.message : 'Request failed')
    } finally {
      setWorking(false)
    }
  }

  return <article className={`grant-card ${active ? '' : 'inactive'}`}>
    <header><div className="grant-chain"><b>{t('identityGrantChain', { from: from?.displayName ?? grant.fromPrincipalId, to: to?.displayName ?? grant.toPrincipalId })}</b><code>{grant.id}</code></div><span className={`identity-chip ${active ? 'success' : grant.status === 'REVOKED' ? 'danger' : 'neutral'}`}>{grant.status}</span></header>
    {!active && <p className="identity-hint warn">{t('identityGrantInactive')}</p>}
    <dl className="identity-facts">
      <div><dt>{t('identityGrantScope')}</dt><dd>{grant.scope.length > 0 ? <span className="chip-row">{grant.scope.map((entry) => <code className="scope-chip" key={entry}>{entry}</code>)}</span> : t('commonNone')}</dd></div>
      <div><dt>{t('identityGrantPurposes')}</dt><dd>{grant.purposeIds.length > 0 ? <span className="chip-row">{grant.purposeIds.map((entry) => <code className="scope-chip" key={entry}>{entry}</code>)}</span> : t('commonNone')}</dd></div>
      <div><dt>{t('identityGrantAudience')}</dt><dd><code>{grant.audience}</code></dd></div>
      <div><dt>{t('identityGrantCeiling')}</dt><dd><span className={`identity-chip ${riskTone(grant.riskTierCeiling)}`}>{grant.riskTierCeiling}</span></dd></div>
      <div><dt>{t('identityGrantIssued')}</dt><dd>{formatDate(grant.issuedAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
      <div><dt>{expired ? t('identityGrantExpired') : t('identityGrantExpires')}</dt><dd>{formatDate(grant.expiresAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
      <div><dt>{t('identityGrantContracts')}</dt><dd>{grant.contractIds.length === 0 ? t('identityGrantContractsAll') : <span className="chip-row">{grant.contractIds.map((contractId) => <button type="button" className="scope-chip linkish" key={contractId} onClick={() => onOpenContract(contractId)}>{contractId}</button>)}</span>}</dd></div>
      <div><dt>{t('identityGrantDigest')}</dt><dd><code title={grant.artifactDigest}>{shortDigest(grant.artifactDigest)}</code></dd></div>
    </dl>
    <div className="grant-budget"><span className="identity-subhead">{remaining === 0 ? t('identityGrantRemainingNone') : t('identityGrantRemaining', { remaining: formatNumber(remaining), maximum: formatNumber(grant.maximumActions) })}</span><span className="budget-track" aria-hidden="true"><i style={{ width: `${grant.maximumActions === 0 ? 0 : Math.round((remaining / grant.maximumActions) * 100)}%` }} /></span></div>
    <footer>{active && <button className="ghost" onClick={onToggleRevoke} aria-expanded={expanded}><IconBan /> {expanded ? t('commonCancel') : t('identityRevoke')}</button>}</footer>
    {expanded && active && <div className="revoke-form">
      <label htmlFor={`revoke-${grant.id}`}>{t('identityRevokeRationale')}</label>
      <textarea id={`revoke-${grant.id}`} value={rationale} placeholder={t('identityRevokePlaceholder')} onChange={(event) => setRationale(event.target.value)} />
      <div className="revoke-actions"><small>{t('identityRevokeMinimum', { count: rationale.trim().length, minimum: revokeMinimum })}</small><button className="release" disabled={working || rationale.trim().length < revokeMinimum} onClick={() => void revoke()}>{working ? t('identityRevokeWorking') : t('identityRevokeConfirm')}</button></div>
    </div>}
  </article>
}

/* ---- issue a grant ---- */

interface IssueGrantFormProps {
  principals: Principal[]
  defaultFromId: string
  onCancel: () => void
  onIssued: (name: string) => void
  onFailed: (detail: string) => void
}

function IssueGrantForm({ principals, defaultFromId, onCancel, onIssued, onFailed }: IssueGrantFormProps) {
  const { t } = useIdentityMessages()
  const [fromId, setFromId] = useState(defaultFromId)
  const [toId, setToId] = useState('')
  const [scope, setScope] = useState('')
  const [purposeIds, setPurposeIds] = useState('')
  const [audience, setAudience] = useState<PurposeAudience>('INTERNAL')
  const [ceiling, setCeiling] = useState<RiskTier>('ANALYTICAL')
  const [hours, setHours] = useState(8)
  const [maximumActions, setMaximumActions] = useState(25)
  const [contractIds, setContractIds] = useState('')
  const [working, setWorking] = useState(false)
  const complete = Boolean(fromId && toId && splitList(scope).length > 0)

  async function issue() {
    if (!complete) return
    setWorking(true)
    try {
      await apiFetch('/v1/delegations', {
        method: 'POST',
        json: {
          fromPrincipalId: fromId,
          toPrincipalId: toId,
          scope: splitList(scope),
          purposeIds: splitList(purposeIds),
          audience,
          riskTierCeiling: ceiling,
          maximumActions,
          expiresAt: new Date(Date.now() + hours * 3_600_000).toISOString(),
          contractIds: splitList(contractIds),
        },
      })
      onIssued(principals.find((principal) => principal.id === toId)?.displayName ?? toId)
    } catch (caught) {
      onFailed(caught instanceof Error ? caught.message : 'Request failed')
    } finally {
      setWorking(false)
    }
  }

  return <form className="panel issue-form" onSubmit={(event) => { event.preventDefault(); void issue() }}>
    <header><div><span className="panel-kicker">{t('identityIssue')}</span><h2>{t('identityIssueTitle')}</h2><p>{t('identityIssueDescription')}</p></div></header>
    <div className="issue-grid">
      <label>{t('identityIssueFrom')}<select value={fromId} onChange={(event) => setFromId(event.target.value)}>{principals.map((principal) => <option value={principal.id} key={principal.id}>{principal.displayName}</option>)}</select></label>
      <label>{t('identityIssueTo')}<select value={toId} onChange={(event) => setToId(event.target.value)} required><option value="">{t('identityFilterAll')}</option>{principals.filter((principal) => principal.id !== fromId).map((principal) => <option value={principal.id} key={principal.id}>{principal.displayName}</option>)}</select></label>
      <label>{t('identityIssueScope')}<input value={scope} placeholder={t('identityIssueScopePlaceholder')} onChange={(event) => setScope(event.target.value)} required /></label>
      <label>{t('identityIssuePurposes')}<input value={purposeIds} placeholder={t('identityIssuePurposesPlaceholder')} onChange={(event) => setPurposeIds(event.target.value)} /></label>
      <label>{t('identityIssueAudience')}<select value={audience} onChange={(event) => setAudience(event.target.value as PurposeAudience)}>{audienceOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>
      <label>{t('identityIssueCeiling')}<select value={ceiling} onChange={(event) => setCeiling(event.target.value as RiskTier)}>{riskOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>
      <label>{t('identityIssueHours')}<input type="number" min={1} max={720} value={hours} onChange={(event) => setHours(Math.max(1, Number(event.target.value) || 1))} /></label>
      <label>{t('identityIssueMaximumActions')}<input type="number" min={1} max={10000} value={maximumActions} onChange={(event) => setMaximumActions(Math.max(1, Number(event.target.value) || 1))} /></label>
      <label className="wide">{t('identityIssueContracts')}<input value={contractIds} placeholder={t('identityIssueContractsPlaceholder')} onChange={(event) => setContractIds(event.target.value)} /></label>
    </div>
    {!complete && <p className="identity-hint warn">{t('identityIssueIncomplete')}</p>}
    <footer><button type="button" className="ghost" onClick={onCancel}>{t('commonCancel')}</button><button type="submit" className="release" disabled={working || !complete}>{working ? t('identityIssueWorking') : t('identityIssueSubmit')}</button></footer>
  </form>
}
