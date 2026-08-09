import { useState } from 'react'
import type { ContextContract, EmergencyAuthorization } from '@lattice/contracts'
import { apiFetch } from './api'
import { EmptyState, ErrorState, LoadingState, MetricTile, SurfaceHero } from './SurfaceState'
import { useResource } from './useResource'
import { shortDigest } from './formatters'
import { IconAlertTriangle, IconSiren } from './icons'
import { emergencyStatusMessageKeys, useIdentityMessages } from './i18n/messages.identity'

interface EmergencyAuthStudioProps {
  workspaceId?: string
  contract: ContextContract
  detailId?: string
  onNavigate: (surface: 'reviews' | 'dispositions', detailId?: string) => void
  onNavigatePath: (path: string) => void
}

const JUSTIFICATION_MINIMUM = 80
const CONFIRM_PHRASE = 'BREAK GLASS'
const approverRoles = ['DOMAIN_OWNER', 'RISK_COMPLIANCE', 'SYSTEM_OWNER', 'SECURITY'] as const
const statuses: readonly EmergencyAuthorization['status'][] = ['PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED', 'DENIED'] as const
const verdicts = ['JUSTIFIED', 'UNJUSTIFIED', 'PROCESS_GAP'] as const

/**
 * Break-glass (E18). The grant path is deliberately high friction, and the retrospective queue
 * ships beside it — a break-glass without after-the-fact review is just a bypass.
 */
export function EmergencyAuthStudio({ workspaceId, contract, detailId, onNavigate, onNavigatePath }: EmergencyAuthStudioProps) {
  const { t, formatDate } = useIdentityMessages()
  const [statusFilter, setStatusFilter] = useState<EmergencyAuthorization['status'] | 'ALL'>('ALL')
  const [requestOpen, setRequestOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(detailId ?? '')
  const [notice, setNotice] = useState('')
  const grants = useResource<EmergencyAuthorization[]>(`/v1/emergency-authorizations?contractId=${encodeURIComponent(contract.id)}${workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : ''}`)
  const all = grants.data ?? []
  const visible = statusFilter === 'ALL' ? all : all.filter((grant) => grant.status === statusFilter)
  const retrospectiveQueue = all.filter((grant) => grant.status !== 'PENDING' && !grant.retrospective)
  const reviewed = all.filter((grant) => grant.retrospective)
  const selected = all.find((grant) => grant.id === selectedId) ?? all.find((grant) => grant.id === detailId)

  return <section className="emergency-page">
    <SurfaceHero kicker={t('emergencyKicker')} title={t('emergencyTitle')} description={t('emergencyDescription')}>
      <button className="danger-action" onClick={() => setRequestOpen(true)}>{t('emergencyRequestOpen')}</button>
    </SurfaceHero>

    <div className="emergency-warning" role="note"><span aria-hidden="true"><IconAlertTriangle /></span><div><b>{t('emergencyWarningTitle')}</b><p>{t('emergencyWarningBody', { contract: contract.name })}</p></div></div>

    <div className="surface-metrics">
      <MetricTile label={t('emergencyMetricActive')} value={String(all.filter((grant) => grant.status === 'ACTIVE').length)} meta={t('emergencyMetricActiveMeta')} tone="danger" />
      <MetricTile label={t('emergencyMetricPending')} value={String(all.filter((grant) => grant.status === 'PENDING').length)} meta={t('emergencyMetricPendingMeta')} tone="warning" />
      <MetricTile label={t('emergencyMetricRetrospective')} value={String(retrospectiveQueue.length)} meta={t('emergencyMetricRetrospectiveMeta')} tone="governance" />
      <MetricTile label={t('emergencyMetricReviewed')} value={String(reviewed.length)} meta={t('emergencyMetricReviewedMeta', { justified: reviewed.filter((grant) => grant.retrospective?.verdict === 'JUSTIFIED').length, gaps: reviewed.filter((grant) => grant.retrospective?.verdict === 'PROCESS_GAP').length })} tone="success" />
    </div>

    {notice && <p className="emergency-notice" role="status">{notice}</p>}
    {grants.status === 'LOADING' && <LoadingState label={t('emergencyLoading')} />}
    {grants.status === 'ERROR' && <ErrorState title={t('emergencyErrorTitle')} detail={grants.error} retryLabel={t('commonRetry')} onRetry={grants.reload} />}

    {grants.status === 'READY' && <>
      <section className="emergency-panel panel">
        <header><div><span className="panel-kicker">{t('emergencyRetroKicker')}</span><h2>{t('emergencyRetroTitle')}</h2><p>{t('emergencyRetroDescription')}</p></div></header>
        {retrospectiveQueue.length === 0
          ? <EmptyState title={t('emergencyRetroEmptyTitle')} description={t('emergencyRetroEmptyDescription')} icon={<IconSiren />} />
          : <div className="emergency-retro-list">{retrospectiveQueue.map((grant) => <RetrospectiveCard grant={grant} key={grant.id} />)}</div>}
      </section>

      <section className="emergency-panel panel">
        <header>
          <div><span className="panel-kicker">{t('emergencyListKicker')}</span><h2>{t('emergencyListTitle')}</h2></div>
          <label htmlFor="emergency-status">{t('emergencyFilterStatus')}<select id="emergency-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as EmergencyAuthorization['status'] | 'ALL')}><option value="ALL">{t('emergencyFilterAll')}</option>{statuses.map((status) => <option value={status} key={status}>{t(emergencyStatusMessageKeys[status])}</option>)}</select></label>
        </header>
        {all.length === 0
          ? <EmptyState title={t('emergencyEmptyTitle')} description={t('emergencyEmptyDescription')} icon={<IconSiren />} />
          : <ul className="emergency-list">{visible.map((grant) => <li key={grant.id}><button className={selected?.id === grant.id ? 'selected' : ''} aria-expanded={selected?.id === grant.id} onClick={() => setSelectedId(selected?.id === grant.id ? '' : grant.id)}>
            <span className={`surface-chip ${grant.status === 'ACTIVE' ? 'danger' : grant.status === 'PENDING' ? 'warning' : 'neutral'}`}>{t(emergencyStatusMessageKeys[grant.status])}</span>
            <span className="emergency-summary"><b>{grant.justification.slice(0, 96)}{grant.justification.length > 96 ? '…' : ''}</b><small>{t('emergencyBudgetValue', { consumed: grant.consumedActions, maximum: grant.maximumActions })} · {t('emergencyValidityRange', { from: formatDate(grant.validFrom, { dateStyle: 'short', timeStyle: 'short' }), until: formatDate(grant.validUntil, { dateStyle: 'short', timeStyle: 'short' }) })}</small></span>
            <time dateTime={grant.requestedAt}>{formatDate(grant.requestedAt, { dateStyle: 'medium', timeStyle: 'short' })}</time>
          </button>{selected?.id === grant.id && <GrantDetail grant={grant} />}</li>)}</ul>}
      </section>
    </>}

    {requestOpen && <RequestDialog />}
  </section>

  async function reload(message: string) {
    setNotice(message)
    grants.reload()
  }

  function GrantDetail({ grant }: { grant: EmergencyAuthorization }) {
    const [role, setRole] = useState(grant.requiredApproverRoles.find((required) => !grant.approvals.some((approval) => approval.role === required)) ?? '')
    const [rationale, setRationale] = useState('')
    const [working, setWorking] = useState(false)
    const [error, setError] = useState('')
    const outstanding = grant.requiredApproverRoles.filter((required) => !grant.approvals.some((approval) => approval.role === required))

    async function approve() {
      setWorking(true)
      setError('')
      try {
        await apiFetch(`/v1/emergency-authorizations/${grant.id}/approvals`, { method: 'POST', json: { role, rationale: rationale.trim() } })
        await reload(t('emergencyApprovalNotice', { role }))
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : t('emergencyApprovalFailed'))
      } finally {
        setWorking(false)
      }
    }

    return <div className="emergency-detail">
      <blockquote>{grant.justification}</blockquote>
      <dl>
        <div><dt>{t('emergencyContract')}</dt><dd>{grant.contractId}</dd></div>
        <div><dt>{t('emergencyRequestedBy')}</dt><dd>{grant.requestedBy}</dd></div>
        <div><dt>{t('emergencyRequestedAt')}</dt><dd>{formatDate(grant.requestedAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
        <div><dt>{t('emergencyValidity')}</dt><dd>{t('emergencyValidityRange', { from: formatDate(grant.validFrom, { dateStyle: 'short', timeStyle: 'short' }), until: formatDate(grant.validUntil, { dateStyle: 'short', timeStyle: 'short' }) })}</dd></div>
        <div><dt>{t('emergencyBudget')}</dt><dd>{t('emergencyBudgetValue', { consumed: grant.consumedActions, maximum: grant.maximumActions })}</dd></div>
        <div><dt>{t('emergencySigningKey')}</dt><dd><code>{grant.keyId}</code></dd></div>
        <div><dt>{t('emergencyDigest')}</dt><dd><code>{shortDigest(grant.artifactDigest)}</code></dd></div>
        <div><dt>{t('emergencySignature')}</dt><dd><code>{grant.signature.slice(0, 24)}…</code></dd></div>
      </dl>

      <section className="emergency-controls"><h4>{t('emergencyCompensatingControls')}</h4><ul>{grant.compensatingControls.map((control) => <li key={control}>{control}</li>)}</ul></section>

      <section className="emergency-approvals">
        <h4>{t('emergencyApprovals')}</h4>
        {grant.approvals.map((approval) => <p key={`${approval.role}:${approval.principalId}`}><b>{t('emergencyApprovalBy', { name: approval.principalId, role: approval.role })}</b><small>{approval.rationale}</small></p>)}
        {outstanding.length === 0 ? <p className="emergency-approvals-complete">{t('emergencyApprovalsComplete')}</p> : <>
          <p className="emergency-outstanding">{t('emergencyApprovalOutstanding', { roles: outstanding.join(', ') })}</p>
          {grant.status === 'PENDING' && <div className="emergency-approve-form">
            <label htmlFor={`approve-role-${grant.id}`}>{t('emergencyApprovalRole')}<select id={`approve-role-${grant.id}`} value={role} onChange={(event) => setRole(event.target.value)}>{outstanding.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
            <label htmlFor={`approve-rationale-${grant.id}`}>{t('emergencyApprovalRationale')}<textarea id={`approve-rationale-${grant.id}`} value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder={t('emergencyApprovalPlaceholder')} rows={3} /></label>
            {error && <p className="emergency-error" role="alert">{error}</p>}
            <button className="danger-action" onClick={() => void approve()} disabled={working || !role || rationale.trim().length < 12}>{working ? t('emergencyApprovalWorking') : t('emergencyApprovalSubmit')}</button>
          </div>}
        </>}
      </section>
    </div>
  }

  function RetrospectiveCard({ grant }: { grant: EmergencyAuthorization }) {
    const [verdict, setVerdict] = useState<typeof verdicts[number]>('JUSTIFIED')
    const [notes, setNotes] = useState('')
    const [working, setWorking] = useState(false)
    const [error, setError] = useState('')

    async function record() {
      setWorking(true)
      setError('')
      try {
        await apiFetch(`/v1/emergency-authorizations/${grant.id}/retrospective`, { method: 'POST', json: { verdict, notes: notes.trim() } })
        await reload(t('emergencyRetroRecorded', { id: grant.id }))
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : t('emergencyRetroFailed'))
      } finally {
        setWorking(false)
      }
    }

    return <article className="emergency-retro-card">
      <header><span className={`surface-chip ${grant.consumedActions === 0 ? 'neutral' : 'danger'}`}>{grant.consumedActions === 0 ? t('emergencyRetroUnused') : t('emergencyRetroUsed', { consumed: grant.consumedActions })}</span><time dateTime={grant.validUntil}>{formatDate(grant.validUntil, { dateStyle: 'medium', timeStyle: 'short' })}</time></header>
      <blockquote>{grant.justification}</blockquote>
      <div className="emergency-retro-form">
        <label htmlFor={`verdict-${grant.id}`}>{t('emergencyRetroVerdict')}<select id={`verdict-${grant.id}`} value={verdict} onChange={(event) => setVerdict(event.target.value as typeof verdicts[number])}>{verdicts.map((item) => <option value={item} key={item}>{t(item === 'JUSTIFIED' ? 'verdictJustified' : item === 'UNJUSTIFIED' ? 'verdictUnjustified' : 'verdictProcessGap')}</option>)}</select></label>
        <label htmlFor={`notes-${grant.id}`}>{t('emergencyRetroNotes')}<textarea id={`notes-${grant.id}`} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t('emergencyRetroNotesPlaceholder')} rows={3} /></label>
        {error && <p className="emergency-error" role="alert">{error}</p>}
        <div className="emergency-retro-actions">
          <button className="ghost" onClick={() => onNavigate('dispositions')}>{t('activityOpen', { title: t('emergencyContract') })}</button>
          <button className="release" onClick={() => void record()} disabled={working || notes.trim().length < 12}>{working ? t('emergencyRetroWorking') : t('emergencyRetroSubmit')}</button>
        </div>
      </div>
    </article>
  }

  function RequestDialog() {
    const [step, setStep] = useState(1)
    const [justification, setJustification] = useState('')
    const [maximumActions, setMaximumActions] = useState(3)
    const [validMinutes, setValidMinutes] = useState(60)
    const [roles, setRoles] = useState<string[]>(['DOMAIN_OWNER', 'RISK_COMPLIANCE'])
    const [controls, setControls] = useState<string[]>([''])
    const [acknowledged, setAcknowledged] = useState(false)
    const [phrase, setPhrase] = useState('')
    const [working, setWorking] = useState(false)
    const [error, setError] = useState('')
    const cleanControls = controls.map((control) => control.trim()).filter(Boolean)
    const stepOneValid = justification.trim().length >= JUSTIFICATION_MINIMUM
    const stepTwoValid = maximumActions > 0 && validMinutes > 0 && roles.length >= 2 && cleanControls.length > 0
    const stepThreeValid = acknowledged && phrase.trim().toLocaleUpperCase() === CONFIRM_PHRASE

    async function submit() {
      setWorking(true)
      setError('')
      try {
        const created = await apiFetch<EmergencyAuthorization>('/v1/emergency-authorizations', {
          method: 'POST',
          json: { contractId: contract.id, ...(workspaceId ? { workspaceId } : {}), justification: justification.trim(), maximumActions, validMinutes, requiredApproverRoles: roles, compensatingControls: cleanControls },
        })
        setRequestOpen(false)
        await reload(t('emergencyRequestedNotice', { id: created.id }))
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : t('emergencyRequestFailed'))
      } finally {
        setWorking(false)
      }
    }

    return <div className="modal-backdrop emergency-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRequestOpen(false) }}>
      <section className="emergency-request" role="dialog" aria-modal="true" aria-labelledby="emergency-request-title">
        <header><div><span className="panel-kicker">{t('emergencyRequestStep', { step })}</span><h2 id="emergency-request-title">{t('emergencyRequestTitle')}</h2></div><nav aria-label={t('emergencyRequestTitle')}>{[t('emergencyStepJustify'), t('emergencyStepBound'), t('emergencyStepConfirm')].map((label, index) => <span className={step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''} key={label}>{label}</span>)}</nav></header>

        {step === 1 && <div className="emergency-step">
          <label htmlFor="emergency-justification">{t('emergencyJustification')}<small>{t('emergencyJustificationHint')}</small><textarea id="emergency-justification" rows={7} value={justification} onChange={(event) => setJustification(event.target.value)} placeholder={t('emergencyJustificationPlaceholder')} /></label>
          <p className={stepOneValid ? 'emergency-count ok' : 'emergency-count'}>{t('emergencyJustificationMinimum', { count: justification.trim().length, minimum: JUSTIFICATION_MINIMUM })}</p>
        </div>}

        {step === 2 && <div className="emergency-step">
          <div className="emergency-grid">
            <label htmlFor="emergency-actions">{t('emergencyMaximumActions')}<small>{t('emergencyMaximumActionsHint')}</small><input id="emergency-actions" type="number" min={1} max={50} value={maximumActions} onChange={(event) => setMaximumActions(Number(event.target.value))} /></label>
            <label htmlFor="emergency-minutes">{t('emergencyValidMinutes')}<small>{t('emergencyValidMinutesHint')}</small><input id="emergency-minutes" type="number" min={5} max={1440} value={validMinutes} onChange={(event) => setValidMinutes(Number(event.target.value))} /></label>
          </div>
          <fieldset className="emergency-roles"><legend>{t('emergencyApproverRoles')}</legend><small>{t('emergencyApproverRolesHint')}</small>{approverRoles.map((role) => <label key={role}><input type="checkbox" checked={roles.includes(role)} onChange={(event) => setRoles((current) => event.target.checked ? [...current, role] : current.filter((item) => item !== role))} />{role.replaceAll('_', ' ')}</label>)}</fieldset>
          <fieldset className="emergency-controls-field"><legend>{t('emergencyCompensatingControls')}</legend><small>{t('emergencyCompensatingControlsHint')}</small>
            {controls.map((control, index) => <div className="emergency-control-row" key={index}>
              <input value={control} placeholder={t('emergencyControlPlaceholder')} aria-label={`${t('emergencyCompensatingControls')} ${index + 1}`} onChange={(event) => setControls((current) => current.map((item, position) => position === index ? event.target.value : item))} />
              {controls.length > 1 && <button className="ghost" aria-label={t('emergencyRemoveControl', { index: index + 1 })} onClick={() => setControls((current) => current.filter((_, position) => position !== index))}>×</button>}
            </div>)}
            <button className="ghost" onClick={() => setControls((current) => [...current, ''])}>{t('emergencyAddControl')}</button>
          </fieldset>
        </div>}

        {step === 3 && <div className="emergency-step">
          <p className="emergency-review">{t('emergencyReviewSummary', { actions: maximumActions, contract: contract.name, minutes: validMinutes, roles: roles.length, controls: cleanControls.length })}</p>
          <label className="emergency-acknowledge"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />{t('emergencyAcknowledge')}</label>
          <label htmlFor="emergency-phrase">{t('emergencyConfirmPhrase', { phrase: CONFIRM_PHRASE })}<input id="emergency-phrase" value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" /></label>
          {error && <p className="emergency-error" role="alert">{error}</p>}
        </div>}

        <footer>
          <button className="ghost" onClick={() => { setRequestOpen(false); setNotice(t('emergencyRequestCancelled')) }}>{t('emergencyRequestCancel')}</button>
          <span className="spacer" />
          {step > 1 && <button className="ghost" onClick={() => setStep(step - 1)}>{t('emergencyBack')}</button>}
          {step < 3 && <button className="release" onClick={() => setStep(step + 1)} disabled={step === 1 ? !stepOneValid : !stepTwoValid}>{t('emergencyContinue')}</button>}
          {step === 3 && <button className="danger-action" onClick={() => void submit()} disabled={working || !stepThreeValid}>{working ? t('emergencyWorking') : t('emergencySubmit')}</button>}
        </footer>
      </section>
    </div>
  }
}
