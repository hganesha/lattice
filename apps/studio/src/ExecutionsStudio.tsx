import { useMemo, useState } from 'react'
import type { BindingExecutionResult, ContextContract, DispositionPage, ExecutionReceipt } from '@lattice/contracts'
import { useResource } from './useResource'
import { EmptyState, ErrorState, LoadingState, MetricTile, Pagination, SurfaceHero } from './SurfaceState'
import { durationLabel, shortDigest, type Tone } from './formatters'
import { useDispositionMessages } from './i18n/messages.disposition'
import { routes, type SurfaceId } from './router'
import { IconArrowUpRight, IconChevronDown, IconInbox, IconPlay, IconPlug } from './icons'
import './disposition-trail.css'

/**
 * Execution receipts for the active contract. A receipt is the record of what actually ran:
 * adapter results, the permissions the runtime was *granted* against those it *required*, and
 * the disposition the plan came from. Nothing here is synthesised — the disposition link is
 * present only when a record in the trail actually references the plan.
 */

interface ExecutionsStudioProps {
  contract: ContextContract
  onNavigate: (surface: SurfaceId, detailId?: string) => void
  onNavigatePath: (path: string) => void
}

const pageSize = 15

function statusTone(status: ExecutionReceipt['status']): Tone {
  if (status === 'SUCCESS') return 'green'
  if (status === 'DENIED') return 'amber'
  return 'red'
}

export function ExecutionsStudio({ contract, onNavigate, onNavigatePath }: ExecutionsStudioProps) {
  const { t, formatDate, formatNumber } = useDispositionMessages()
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState('')

  const receipts = useResource<ExecutionReceipt[]>(`/v1/executions?contractId=${encodeURIComponent(contract.id)}`)
  const trail = useResource<DispositionPage>(`/v1/dispositions?contractId=${encodeURIComponent(contract.id)}&limit=100`)
  const records = useMemo(() => [...(receipts.data ?? [])].sort((left, right) => right.completedAt.localeCompare(left.completedAt)), [receipts.data])
  const dispositionByPlan = useMemo(() => {
    const map = new Map<string, string>()
    for (const record of trail.data?.records ?? []) if (record.planId) map.set(record.planId, record.id)
    return map
  }, [trail.data])

  const visible = records.slice(page * pageSize, page * pageSize + pageSize)
  const succeeded = records.filter((receipt) => receipt.status === 'SUCCESS').length
  const denied = records.filter((receipt) => receipt.status === 'DENIED').length
  const failed = records.filter((receipt) => receipt.status === 'FAILED').length

  return <section className="execution-page">
    <SurfaceHero kicker={t('executionKicker').toLocaleUpperCase()} title={t('executionTitle')} description={t('executionDescription')}><button className="ghost" onClick={() => onNavigate('dispositions')}>{t('compilerViewTrail')}</button></SurfaceHero>
    <div className="surface-metrics"><MetricTile label={t('executionTitle').toLocaleUpperCase()} value={formatNumber(records.length)} meta={contract.name} tone="blue" /><MetricTile label={t('executionStatusSuccess').toLocaleUpperCase()} value={formatNumber(succeeded)} meta={t('executionCompleted')} tone="green" /><MetricTile label={t('executionStatusFailed').toLocaleUpperCase()} value={formatNumber(failed)} meta={t('executionBindingResults')} tone="red" /><MetricTile label={t('executionStatusDenied').toLocaleUpperCase()} value={formatNumber(denied)} meta={t('executionPermissions')} tone="amber" /></div>

    <main className="panel execution-panel">
      {receipts.status === 'LOADING' && <LoadingState label={t('executionLoading')} />}
      {receipts.status === 'ERROR' && <ErrorState title={t('executionError')} detail={receipts.error} retryLabel={t('dispositionRetry')} onRetry={receipts.reload} />}
      {receipts.status === 'READY' && records.length === 0 && <EmptyState title={t('executionEmptyTitle')} description={t('executionEmptyDescription')} icon={<IconInbox />} actionLabel={t('executionEmptyAction')} onAction={() => onNavigate('compiler')} />}
      {visible.length > 0 && <ul className="execution-rows">{visible.map((receipt) => {
        const expanded = expandedId === receipt.id
        const dispositionId = dispositionByPlan.get(receipt.planId)
        const missing = receipt.requiredPermissions.filter((permission) => !receipt.grantedPermissions.includes(permission))
        return <li className={`execution-row ${expanded ? 'expanded' : ''}`} key={receipt.id}>
          <button type="button" className="execution-row-head" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? '' : receipt.id)}>
            <span className={`execution-rail ${statusTone(receipt.status)}`} aria-hidden="true" />
            <span className="execution-row-main"><span className="execution-row-title"><b>{receipt.operationId}</b><span className={`disposition-chip ${statusTone(receipt.status)}`}>{receipt.status === 'SUCCESS' ? t('executionStatusSuccess') : receipt.status === 'DENIED' ? t('executionStatusDenied') : t('executionStatusFailed')}</span>{missing.length > 0 && <span className="disposition-chip red">{t('executionMissingPermission')}</span>}</span><span className="execution-row-meta"><code>{receipt.planId}</code><span>{receipt.principalId}</span><span>{durationLabel(new Date(receipt.completedAt).getTime() - new Date(receipt.startedAt).getTime())}</span></span></span>
            <span className="execution-row-side"><time dateTime={receipt.completedAt}>{formatDate(receipt.completedAt, { dateStyle: 'short', timeStyle: 'short' })}</time><small>{expanded ? t('executionCollapse') : t('executionExpand')}</small></span>
            <span className={`execution-caret ${expanded ? 'open' : ''}`} aria-hidden="true"><IconChevronDown /></span>
          </button>
          {expanded && <div className="execution-detail">
            <dl className="disposition-facts">
              <div><dt>{t('executionPlan')}</dt><dd><code>{receipt.planId}</code></dd></div>
              <div><dt>{t('executionPrincipal')}</dt><dd><code>{receipt.principalId}</code></dd></div>
              <div><dt>{t('executionStarted')}</dt><dd>{formatDate(receipt.startedAt, { dateStyle: 'medium', timeStyle: 'medium' })}</dd></div>
              <div><dt>{t('executionCompleted')}</dt><dd>{formatDate(receipt.completedAt, { dateStyle: 'medium', timeStyle: 'medium' })}</dd></div>
              <div><dt>{t('executionDuration')}</dt><dd>{durationLabel(new Date(receipt.completedAt).getTime() - new Date(receipt.startedAt).getTime())}</dd></div>
              <div><dt>{t('executionArtifactDigest')}</dt><dd><code title={receipt.artifactDigest}>{shortDigest(receipt.artifactDigest)}</code></dd></div>
            </dl>

            <section className="execution-section"><h4>{t('executionPermissions')}</h4><div className="permission-grid"><div><span className="permission-label">{t('executionRequired')}</span><div className="permission-items">{receipt.requiredPermissions.length === 0 ? <span className="pin-empty">{t('executionNoPermissions')}</span> : receipt.requiredPermissions.map((permission) => <span className={`disposition-chip ${receipt.grantedPermissions.includes(permission) ? 'green' : 'red'}`} key={permission}>{permission}</span>)}</div></div><div><span className="permission-label">{t('executionGranted')}</span><div className="permission-items">{receipt.grantedPermissions.length === 0 ? <span className="pin-empty">{t('executionNoPermissions')}</span> : receipt.grantedPermissions.map((permission) => <span className="disposition-chip muted" key={permission}>{permission}</span>)}</div></div></div>{missing.length > 0 && <p className="disposition-note warn">{t('executionMissingPermission')}: {missing.join(', ')}</p>}</section>

            <section className="execution-section"><h4>{t('executionBindingResults')}</h4>{receipt.bindingResults.length === 0 ? <p className="disposition-note">{t('executionNoBindingResults')}</p> : <ul className="binding-results">{receipt.bindingResults.map((result) => <BindingResultRow result={result} key={result.bindingId} />)}</ul>}</section>

            <section className="execution-section"><h4>{t('executionEvidence')}</h4>{receipt.evidenceRefs.length === 0 ? <p className="disposition-note">{t('dispositionEvidenceNone')}</p> : <div className="disposition-reason-codes">{receipt.evidenceRefs.map((ref) => <code className="reason-code" key={ref}>{ref}</code>)}</div>}</section>

            <div className="execution-actions">{dispositionId ? <button type="button" className="ghost" onClick={() => onNavigatePath(routes.disposition(dispositionId))}><IconArrowUpRight /> {t('executionOpenDisposition')}</button> : <span className="disposition-note">{trail.status === 'ERROR' ? trail.error : t('executionNoDisposition')}</span>}</div>
          </div>}
        </li>
      })}</ul>}
      {records.length > pageSize && <Pagination page={page} pageSize={pageSize} total={records.length} onPage={(next) => { setPage(next); setExpandedId('') }} labels={{ previous: t('dispositionPaginationPrevious'), next: t('dispositionPaginationNext'), range: (from, to, total) => t('dispositionPaginationRange', { from, to, total }) }} />}
    </main>
  </section>
}

function BindingResultRow({ result }: { result: BindingExecutionResult }) {
  const { t } = useDispositionMessages()
  return <li className={`binding-result ${result.status.toLocaleLowerCase()}`}>
    <span className="binding-result-glyph" aria-hidden="true">{result.status === 'SUCCESS' ? <IconPlug /> : <IconPlay />}</span>
    <span className="binding-result-main"><b>{result.sourceSystem}</b><span className="binding-result-meta"><code>{result.bindingId}</code><span>{t('executionAdapterMode', { mode: result.mode })}</span><span>{durationLabel(result.durationMs)}</span></span>{result.status === 'SUCCESS' ? <span className="binding-result-meta">{t('executionMappedValues', { count: result.rows.reduce((total, row) => total + row.values.length, 0) })}{result.truncated && <span>{t('executionTruncated')}</span>}<span>{t('executionIdentityMode', { mode: result.identityMode })}</span>{result.responseDigest && <code title={result.responseDigest}>{shortDigest(result.responseDigest)}</code>}</span> : <span className="binding-result-error">{result.error ?? t('commonUnknown')}</span>}</span>
    <span className={`disposition-chip ${result.status === 'SUCCESS' ? 'green' : 'red'}`}>{result.status === 'SUCCESS' ? t('executionStatusSuccess') : t('executionStatusFailed')}</span>
  </li>
}
