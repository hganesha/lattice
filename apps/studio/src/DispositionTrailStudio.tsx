import { useEffect, useMemo, useState } from 'react'
import type { CompilationRecord, ContextContract, DeclaredPurpose, DispositionMode, DispositionPage, DispositionRecord, PrincipalChainLink, RiskTier, RuntimeDecision } from '@lattice/contracts'
import { useResource } from './useResource'
import { EmptyState, ErrorState, LoadingState, MetricTile, Pagination, SurfaceHero } from './SurfaceState'
import { decisionTone, durationLabel, riskTone, shortDigest } from './formatters'
import { AttestationPanel } from './AttestationPanel'
import { decisionMessageKeys, delegationViaMessageKeys, dispositionModeMessageKeys, evidenceStrengthMessageKeys, principalKindMessageKeys, provenanceMessageKeys, riskTierMessageKeys, useDispositionMessages } from './i18n/messages.disposition'
import { routes, type SurfaceId } from './router'
import { IconAlertTriangle, IconFileSearch, IconFlask, IconHistory, IconInbox, IconLink, IconPlug, IconScale, IconShieldCheck, IconUserCheck, IconUsers, IconZap } from './icons'
import './disposition-trail.css'

/**
 * E5 — the Disposition Trail. Master/detail modelled on the eval prototype's best screen
 * (`Dispositions.tsx:167-260`), against real API data and with its two defects corrected:
 * real cursor pagination instead of a scroll box, and no unverifiable tamper-evidence claim.
 */

interface DispositionTrailStudioProps {
  contract: ContextContract
  workspaceId?: string
  detailId?: string
  onNavigate: (surface: SurfaceId, detailId?: string) => void
  onNavigatePath: (path: string) => void
}

const pageSize = 25
const decisionOptions: readonly RuntimeDecision[] = ['RESOLVED', 'CLARIFICATION_REQUIRED', 'APPROVAL_REQUIRED', 'INSUFFICIENT_EVIDENCE', 'STALE_CONTEXT', 'DENIED', 'UNSUPPORTED', 'DEGRADED']
const riskOptions: readonly RiskTier[] = ['INFORMATIONAL', 'ANALYTICAL', 'PLANNING_DECISION', 'OPERATIONAL_ACTION']
const modeOptions: readonly DispositionMode[] = ['DRY_RUN', 'AUTHORIZED']

function toIso(local: string): string {
  if (!local) return ''
  const parsed = new Date(local)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
}

export function DispositionTrailStudio({ contract, workspaceId, detailId, onNavigate, onNavigatePath }: DispositionTrailStudioProps) {
  const { t, formatDate, formatNumber } = useDispositionMessages()
  const [decision, setDecision] = useState<RuntimeDecision | ''>('')
  const [purposeId, setPurposeId] = useState('')
  const [riskTier, setRiskTier] = useState<RiskTier | ''>('')
  const [principalId, setPrincipalId] = useState('')
  const [scope, setScope] = useState<'CONTRACT' | 'WORKSPACE'>('CONTRACT')
  const [mode, setMode] = useState<DispositionMode | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const [cursors, setCursors] = useState<string[]>([''])
  const [selectedId, setSelectedId] = useState(detailId ?? '')

  const purposes = useResource<DeclaredPurpose[]>(`/v1/purposes?domain=${encodeURIComponent(contract.domain)}&contractId=${encodeURIComponent(contract.id)}`, [contract.domain])
  const cursor = cursors[page] ?? ''
  const filterKey = [decision, purposeId, riskTier, principalId.trim(), scope, mode, from, to, contract.id, workspaceId ?? ''].join('|')

  const listPath = useMemo(() => {
    const params = new URLSearchParams()
    if (scope === 'CONTRACT') params.set('contractId', contract.id)
    else if (workspaceId) params.set('workspaceId', workspaceId)
    if (decision) params.set('decision', decision)
    if (purposeId) params.set('purposeId', purposeId)
    if (riskTier) params.set('riskTier', riskTier)
    if (principalId.trim()) params.set('principalId', principalId.trim())
    if (mode) params.set('mode', mode)
    const fromIso = toIso(from)
    const toIsoValue = toIso(to)
    if (fromIso) params.set('from', fromIso)
    if (toIsoValue) params.set('to', toIsoValue)
    params.set('limit', String(pageSize))
    if (cursor) params.set('cursor', cursor)
    return `/v1/dispositions?${params.toString()}`
  }, [contract.id, cursor, decision, from, mode, principalId, purposeId, riskTier, scope, to, workspaceId])

  const list = useResource<DispositionPage>(listPath)
  const detail = useResource<DispositionRecord>(selectedId ? `/v1/dispositions/${encodeURIComponent(selectedId)}` : undefined)
  const records = list.data?.records ?? []
  const total = list.data?.total ?? 0
  const firstId = list.data?.records[0]?.id ?? ''
  const filtered = Boolean(decision || purposeId || riskTier || principalId.trim() || mode || from || to || scope === 'WORKSPACE')

  useEffect(() => { setPage(0); setCursors(['']) }, [filterKey])
  useEffect(() => { if (detailId) setSelectedId(detailId) }, [detailId])
  useEffect(() => { if (!selectedId && firstId) setSelectedId(firstId) }, [firstId, selectedId])

  function select(id: string) {
    setSelectedId(id)
    onNavigate('dispositions', id)
  }

  function goToPage(next: number) {
    if (next === page || next < 0) return
    if (next > page) {
      const nextCursor = list.data?.nextCursor
      if (!nextCursor) return
      setCursors((current) => current.length > next ? current : [...current, nextCursor])
    }
    setPage(next)
  }

  function clearFilters() {
    setDecision('')
    setPurposeId('')
    setRiskTier('')
    setPrincipalId('')
    setScope('CONTRACT')
    setMode('')
    setFrom('')
    setTo('')
  }

  const authorizingCount = records.filter((record) => record.authorizing).length
  const dryRunCount = records.filter((record) => record.mode === 'DRY_RUN').length
  const approvalCount = records.filter((record) => record.decision === 'APPROVAL_REQUIRED').length
  const purposeOptions = purposes.data ?? []

  return <section className="disposition-page">
    <SurfaceHero kicker={t('dispositionKicker').toLocaleUpperCase()} title={t('dispositionTitle')} description={t('dispositionDescription')}><button className="ghost" onClick={() => onNavigate('compiler')}>{t('dispositionEmptyAction')}</button></SurfaceHero>
    <div className="surface-metrics"><MetricTile label={t('dispositionMetricTotal').toLocaleUpperCase()} value={formatNumber(total)} meta={t('dispositionMetricTotalMeta')} tone="info" /><MetricTile label={t('dispositionMetricAuthorizing').toLocaleUpperCase()} value={formatNumber(authorizingCount)} meta={t('dispositionMetricAuthorizingMeta')} tone="success" /><MetricTile label={t('dispositionMetricDryRun').toLocaleUpperCase()} value={formatNumber(dryRunCount)} meta={t('dispositionMetricDryRunMeta')} tone="warning" /><MetricTile label={t('dispositionMetricApproval').toLocaleUpperCase()} value={formatNumber(approvalCount)} meta={t('dispositionMetricApprovalMeta')} tone="governance" /></div>

    <div className="disposition-layout">
      <main className="disposition-list-panel panel">
        <header className="disposition-list-header"><div><span className="panel-kicker">{t('dispositionListHeading').toLocaleUpperCase()}</span><h2>{scope === 'CONTRACT' ? contract.name : t('dispositionFilterWorkspace')}</h2></div></header>
        <div className="surface-filters" role="group" aria-label={t('dispositionFiltersLabel')}>
          <label>{t('dispositionFilterScope')}<select value={scope} onChange={(event) => setScope(event.target.value === 'WORKSPACE' ? 'WORKSPACE' : 'CONTRACT')} disabled={!workspaceId}><option value="CONTRACT">{t('dispositionFilterThisContract')}</option><option value="WORKSPACE">{t('dispositionFilterWorkspace')}</option></select></label>
          <label>{t('dispositionFilterVerdict')}<select value={decision} onChange={(event) => setDecision(event.target.value as RuntimeDecision | '')}><option value="">{t('dispositionFilterAll')}</option>{decisionOptions.map((option) => <option value={option} key={option}>{t(decisionMessageKeys[option])}</option>)}</select></label>
          {purposeOptions.length > 0 && <label>{t('dispositionFilterPurpose')}<select value={purposeId} onChange={(event) => setPurposeId(event.target.value)}><option value="">{t('dispositionFilterAll')}</option>{purposeOptions.map((purpose) => <option value={purpose.id} key={purpose.id}>{purpose.label}</option>)}</select></label>}
          <label>{t('dispositionFilterRisk')}<select value={riskTier} onChange={(event) => setRiskTier(event.target.value as RiskTier | '')}><option value="">{t('dispositionFilterAll')}</option>{riskOptions.map((option) => <option value={option} key={option}>{t(riskTierMessageKeys[option])}</option>)}</select></label>
          <label>{t('dispositionFilterMode')}<select value={mode} onChange={(event) => setMode(event.target.value as DispositionMode | '')}><option value="">{t('dispositionFilterAll')}</option>{modeOptions.map((option) => <option value={option} key={option}>{t(dispositionModeMessageKeys[option])}</option>)}</select></label>
          <label>{t('dispositionFilterPrincipal')}<input value={principalId} placeholder={t('dispositionFilterPrincipalPlaceholder')} onChange={(event) => setPrincipalId(event.target.value)} /></label>
          <label>{t('dispositionFilterFrom')}<input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>{t('dispositionFilterTo')}<input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          {filtered && <button className="ghost" onClick={clearFilters}>{t('dispositionClearFilters')}</button>}
        </div>

        {list.status === 'LOADING' && <LoadingState label={t('dispositionLoadingList')} />}
        {list.status === 'ERROR' && <ErrorState title={t('dispositionListError')} detail={list.error} retryLabel={t('dispositionRetry')} onRetry={list.reload} />}
        {list.status === 'READY' && records.length === 0 && (filtered
          ? <EmptyState title={t('dispositionFilteredEmptyTitle')} description={t('dispositionFilteredEmptyDescription')} icon={<IconFileSearch />} actionLabel={t('dispositionClearFilters')} onAction={clearFilters} />
          : <EmptyState title={t('dispositionEmptyTitle')} description={t('dispositionEmptyDescription')} icon={<IconInbox />} actionLabel={t('dispositionEmptyAction')} onAction={() => onNavigate('compiler')} />)}
        {records.length > 0 && <ul className="disposition-rows">{records.map((record) => <li key={record.id}><button type="button" className={`disposition-row ${selectedId === record.id ? 'selected' : ''}`} aria-current={selectedId === record.id ? 'true' : undefined} onClick={() => select(record.id)}>
          <span className={`disposition-rail ${decisionTone(record.decision)}`} aria-hidden="true" />
          <span className="disposition-row-main">
            <span className="disposition-row-head"><code>{record.id}</code><span className={`disposition-chip ${decisionTone(record.decision)}`}>{t(decisionMessageKeys[record.decision])}</span>{!record.authorizing && <span className="disposition-chip warning">{t(dispositionModeMessageKeys[record.mode])}</span>}</span>
            <span className="disposition-row-question">{record.question}</span>
            <span className="disposition-row-meta"><em>{record.purposeLabel}</em><span className={`disposition-chip ${riskTone(record.riskTier)}`}>{t(riskTierMessageKeys[record.riskTier])}</span><span>{record.principalId}</span></span>
          </span>
          <span className="disposition-row-side"><time dateTime={record.createdAt}>{formatDate(record.createdAt, { dateStyle: 'short', timeStyle: 'short' })}</time><small>{durationLabel(record.latencyMs)}</small></span>
        </button></li>)}</ul>}
        {records.length > 0 && <Pagination page={page} pageSize={pageSize} total={total} onPage={goToPage} labels={{ previous: t('dispositionPaginationPrevious'), next: t('dispositionPaginationNext'), range: (rangeFrom, rangeTo, rangeTotal) => t('dispositionPaginationRange', { from: rangeFrom, to: rangeTo, total: rangeTotal }) }} />}
      </main>

      <aside className="disposition-detail-panel panel">
        {detail.status === 'IDLE' && <EmptyState title={t('dispositionSelectPrompt')} description={t('dispositionSelectPromptDescription')} icon={<IconHistory />} />}
        {detail.status === 'LOADING' && <LoadingState label={t('dispositionLoadingDetail')} />}
        {detail.status === 'ERROR' && <ErrorState title={t('dispositionDetailError')} detail={detail.error} retryLabel={t('dispositionRetry')} onRetry={detail.reload} />}
        {detail.status === 'READY' && detail.data && <DispositionDetail record={detail.data} onNavigatePath={onNavigatePath} />}
      </aside>
    </div>
  </section>
}

function DispositionDetail({ record, onNavigatePath }: { record: DispositionRecord; onNavigatePath: (path: string) => void }) {
  const { t, formatDate } = useDispositionMessages()
  const [verifyingRef, setVerifyingRef] = useState('')
  const provenance = provenanceMessageKeys[record.provenance]
  const bannerTone = record.mode === 'DRY_RUN' ? 'dry-run' : record.authorizing ? 'authorized' : 'flagged'
  const bannerTitle = record.mode === 'DRY_RUN' ? 'dispositionModeBannerDryRunTitle' : record.authorizing ? 'dispositionModeBannerAuthorizedTitle' : 'dispositionModeBannerRevokedTitle'
  const bannerBody = record.mode === 'DRY_RUN' ? 'dispositionModeBannerDryRunBody' : record.authorizing ? 'dispositionModeBannerAuthorizedBody' : 'dispositionModeBannerRevokedBody'

  return <article className="disposition-detail">
    <header className="disposition-detail-head"><div><span className="panel-kicker">{t('dispositionSectionRecord').toLocaleUpperCase()}</span><h2><code>{record.id}</code></h2></div><span className={`disposition-chip ${decisionTone(record.decision)} large`}>{t(decisionMessageKeys[record.decision])}</span></header>

    <div className={`disposition-banner ${bannerTone}`} role="status" aria-live="polite"><span aria-hidden="true">{record.mode === 'DRY_RUN' ? <IconFlask /> : record.authorizing ? <IconShieldCheck /> : <IconAlertTriangle />}</span><div><b>{t(bannerTitle)}</b><p>{t(bannerBody)}</p></div></div>

    <section className="disposition-section">
      <h3>{t('dispositionSectionIntent')}</h3>
      <blockquote className="disposition-intent">{record.question}</blockquote>
      <dl className="disposition-facts">
        <div><dt>{t('dispositionDeclaredPurpose')}</dt><dd>{record.purposeLabel} <code>{record.purposeId}</code></dd></div>
        <div><dt>{t('dispositionRiskDerivation')}</dt><dd><span className={`disposition-chip ${riskTone(record.riskTier)}`}>{t(riskTierMessageKeys[record.riskTier])}</span> {record.riskDerivation.reason}</dd></div>
        <div><dt>{t('dispositionPurposeFloor')}</dt><dd>{t(riskTierMessageKeys[record.riskDerivation.purposeTier])}</dd></div>
        <div><dt>{t('dispositionOperationTier')}</dt><dd>{record.riskDerivation.operationTier ? `${t(riskTierMessageKeys[record.riskDerivation.operationTier])} · ${record.riskDerivation.operationId ?? ''}` : t('dispositionNoOperation')}</dd></div>
        <div><dt>{t('compilerRiskMinimumEvidence')}</dt><dd>{t(evidenceStrengthMessageKeys[record.riskDerivation.minimumEvidenceStrength])}</dd></div>
        <div><dt>{t('compilerRiskMaximumAge')}</dt><dd>{t('compilerRiskMinutes', { count: record.riskDerivation.maximumEvidenceAgeMinutes })}</dd></div>
        <div><dt>{t('compilerRiskApproval')}</dt><dd>{record.riskDerivation.approvalRequired ? t('compilerRiskApprovalRequired') : t('compilerRiskApprovalNotRequired')}</dd></div>
        {record.riskDerivation.policyId && <div><dt>{t('compilerRiskPolicy')}</dt><dd><code>{record.riskDerivation.policyId}</code></dd></div>}
      </dl>
    </section>

    <section className="disposition-section">
      <h3>{t('dispositionSectionChain')}</h3>
      {record.principalChain.length === 0 ? <p className="disposition-note">{t('dispositionChainEmpty')}</p> : <ol className="chain-ribbon" aria-label={t('dispositionChainLabel')}>
        {record.principalChain.map((link, index) => <li className="chain-item" key={`${link.principalId}:${index}`}><ChainLink link={link} /><span className="chain-arrow" aria-hidden="true">→</span></li>)}
        <li className="chain-item"><span className={`chain-verdict ${decisionTone(record.decision)}`}><IconShieldCheck /> {t(decisionMessageKeys[record.decision])}</span></li>
      </ol>}
    </section>

    <section className="disposition-section">
      <h3>{t('dispositionSectionVerdict')}</h3>
      <div className="disposition-reason-codes">{record.reasonCodes.length === 0 ? <p className="disposition-note">{t('dispositionNoReasonCodes')}</p> : record.reasonCodes.map((code) => <code className="reason-code" key={code}>{code}</code>)}</div>
      {record.explanation.length > 0 && <ul className="disposition-explanation">{record.explanation.map((line, index) => <li key={`${index}:${line}`}>{line}</li>)}</ul>}
      <dl className="disposition-facts">
        {record.operationId && <div><dt>{t('dispositionOperation')}</dt><dd><code>{record.operationId}</code></dd></div>}
        {record.planId && <div><dt>{t('dispositionPlan')}</dt><dd><code>{record.planId}</code></dd></div>}
        {record.approvalId && <div><dt>{t('dispositionApproval')}</dt><dd><code>{record.approvalId}</code></dd></div>}
        {record.clarificationId && <div><dt>{t('dispositionClarification')}</dt><dd><code>{record.clarificationId}</code></dd></div>}
      </dl>
    </section>

    <section className="disposition-section">
      <h3>{t('dispositionSectionPins')}</h3>
      <p className="disposition-note">{t('dispositionPinsIntro')}</p>
      <VersionPins compilation={record.compilation} />
    </section>

    <section className="disposition-section">
      <h3>{t('dispositionSectionEvidence')} <small>{t('dispositionEvidenceCount', { count: record.evidenceRefs.length })}</small></h3>
      {record.evidenceRefs.length === 0 ? <p className="disposition-note">{t('dispositionEvidenceNone')}</p> : <ul className="evidence-refs">{record.evidenceRefs.map((ref) => <li key={ref}><code>{ref}</code><button type="button" className="ghost" aria-expanded={verifyingRef === ref} onClick={() => setVerifyingRef((current) => current === ref ? '' : ref)}><IconLink /> {verifyingRef === ref ? t('dispositionEvidenceHide') : t('dispositionEvidenceVerify')}</button></li>)}</ul>}
      {verifyingRef && <div className="evidence-verification"><p className="disposition-note">{t('dispositionEvidenceScope', { ref: verifyingRef })}</p><AttestationPanel subjectKind="DISPOSITION" subjectId={record.id} /></div>}
    </section>

    <section className="disposition-section">
      <h3>{t('dispositionSectionExecution')}</h3>
      <dl className="disposition-facts">
        <div><dt>{t('dispositionLatency')}</dt><dd>{durationLabel(record.latencyMs)}</dd></div>
        <div><dt>{t('dispositionCreatedAt')}</dt><dd>{formatDate(record.createdAt, { dateStyle: 'medium', timeStyle: 'medium' })}</dd></div>
      </dl>
      <div className={`provenance-marker ${record.provenance === 'RECONSTRUCTED' ? 'reconstructed' : 're-executed'}`}><span className="provenance-label">{t('dispositionProvenance')}</span><b>{t(provenance.label)}</b><p>{t(provenance.detail)}</p></div>
    </section>

    <section className="disposition-section">
      <h3>{t('dispositionSectionRecord')}</h3>
      <dl className="disposition-facts">
        <div><dt>{t('dispositionMode')}</dt><dd>{t(dispositionModeMessageKeys[record.mode])}</dd></div>
        <div><dt>{t('dispositionAuthorizing')}</dt><dd>{record.authorizing ? t('dispositionAuthorizingYes') : t('dispositionAuthorizingNo')}</dd></div>
        <div><dt>{t('dispositionPrincipal')}</dt><dd><code>{record.principalId}</code></dd></div>
        <div><dt>{t('dispositionArtifactDigest')}</dt><dd><code title={record.artifactDigest}>{record.artifactDigest}</code></dd></div>
        {record.evalRunId && <div><dt>{t('dispositionEvalRun')}</dt><dd><button type="button" className="linklike" onClick={() => onNavigatePath(routes.evalRun(record.evalRunId ?? ''))}><code>{record.evalRunId}</code></button></dd></div>}
      </dl>
    </section>
  </article>
}

function ChainLink({ link }: { link: PrincipalChainLink }) {
  const { t, formatDate } = useDispositionMessages()
  const Glyph = link.kind === 'HUMAN' ? IconUserCheck : link.kind === 'AGENT' ? IconZap : IconPlug
  return <span className={`chain-link ${link.kind.toLocaleLowerCase()}`}>
    <span className="chain-glyph" aria-hidden="true"><Glyph /></span>
    <span className="chain-body">
      <b>{link.displayName}</b>
      <span className="chain-kind">{t(principalKindMessageKeys[link.kind])} · {link.role}</span>
      <span className="chain-via">{t('dispositionChainVia')}: {t(delegationViaMessageKeys[link.via])}</span>
      {link.grantId && <span className="chain-detail">{t('dispositionChainGrant')} <code>{link.grantId}</code></span>}
      {link.scope && link.scope.length > 0 && <span className="chain-detail">{t('dispositionChainScope')}: {link.scope.join(', ')}</span>}
      {link.expiresAt && <span className="chain-detail">{t('dispositionChainExpires')} {formatDate(link.expiresAt, { dateStyle: 'short', timeStyle: 'short' })}</span>}
    </span>
  </span>
}

function VersionPins({ compilation }: { compilation: CompilationRecord | undefined }) {
  const { t, formatDate } = useDispositionMessages()
  if (!compilation) return <p className="disposition-note warn">{t('dispositionPinsMissing')}</p>
  return <div className="pin-grid">
    <div className="pin-group"><span className="pin-label">{t('dispositionPinContract')}</span><div className="pin-items"><span className="pin-item"><b>{compilation.contract.id}</b><em>{t('dispositionPinVersion', { version: compilation.contract.version })}</em><code title={compilation.contract.digest}>{shortDigest(compilation.contract.digest)}</code></span></div></div>
    <div className="pin-group"><span className="pin-label">{t('dispositionPinOntology')}</span><div className="pin-items">{compilation.ontology ? <span className="pin-item"><b>{compilation.ontology.ontologyId}</b><em>{t('dispositionPinVersion', { version: compilation.ontology.version })}</em><code title={compilation.ontology.digest}>{shortDigest(compilation.ontology.digest)}</code></span> : <span className="pin-empty">{t('dispositionPinNone')}</span>}</div></div>
    <div className="pin-group"><span className="pin-label">{t('dispositionPinBindings')}</span><div className="pin-items">{compilation.bindings.length === 0 ? <span className="pin-empty">{t('dispositionPinNone')}</span> : compilation.bindings.map((binding) => <span className="pin-item" key={binding.id}><b>{binding.sourceSystem}</b><em>{t('dispositionPinVersion', { version: binding.version })}</em><code>{binding.id}</code></span>)}</div></div>
    <div className="pin-group"><span className="pin-label">{t('dispositionPinPolicies')}</span><div className="pin-items">{compilation.policies.length === 0 ? <span className="pin-empty">{t('dispositionPinNone')}</span> : compilation.policies.map((policy) => <span className="pin-item" key={policy.id}><b>{policy.id}</b><em>{t('dispositionPinVersion', { version: policy.version })}</em><code>{t(riskTierMessageKeys[policy.riskTier])}</code></span>)}</div></div>
    <div className="pin-group"><span className="pin-label">{t('dispositionPinMetrics')}</span><div className="pin-items">{compilation.metrics.length === 0 ? <span className="pin-empty">{t('dispositionPinNone')}</span> : compilation.metrics.map((metric) => <span className="pin-item" key={metric.id}><b>{metric.id}</b><em>{t('dispositionPinVersion', { version: metric.version })}</em></span>)}</div></div>
    <div className="pin-group"><span className="pin-label">{t('dispositionPinCompiler')}</span><div className="pin-items"><span className="pin-item"><b>{compilation.compilerVersion}</b><em>{t('dispositionPinEvaluatedAt')}</em><code>{formatDate(compilation.evaluatedAt, { dateStyle: 'medium', timeStyle: 'medium' })}</code></span></div></div>
  </div>
}
