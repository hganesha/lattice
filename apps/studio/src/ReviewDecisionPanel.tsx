import { useState, type FormEvent } from 'react'
import type { CreateReviewDecisionRequest, NegativeDecision, ReviewRequestArtifact, StructuredRejection } from '@lattice/contracts'
import { apiFetch, loadSession } from './api'
import { BlastRadiusPanel } from './BlastRadiusPanel'
import { navigateToPath } from './router'
import { useMessages } from './i18n/messages'
import { useGovernanceMessages } from './i18n/messages.governance'
import './governance.css'

/**
 * The review decision panel now carries two governance-depth additions:
 * E17 — the blast radius of the target, inline, so approval is never blind; and
 * E13 — a typed rejection capture that turns "no" into a durable negative decision.
 */

interface ReviewDecisionPanelProps {
  review: ReviewRequestArtifact
  onClose: () => void
  onDecided: (review: ReviewRequestArtifact) => void
}

type RejectionScope = NegativeDecision['applicability']['scope']

function splitList(value: string): string[] {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean)
}

function toIsoDate(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
}

export function ReviewDecisionPanel({ review, onClose, onDecided }: ReviewDecisionPanelProps) {
  const { t } = useMessages()
  const { t: g } = useGovernanceMessages()
  const [decision, setDecision] = useState<CreateReviewDecisionRequest['decision']>('APPROVED')
  const [rationale, setRationale] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [prohibitedSubject, setProhibitedSubject] = useState(review.targetLabel)
  const [sourceSystem, setSourceSystem] = useState('')
  const [bindingId, setBindingId] = useState(review.targetKind === 'SOURCE_BINDING' ? review.targetId : '')
  const [targetTypeId, setTargetTypeId] = useState(review.targetKind === 'ENTITY_TYPE' ? review.targetId : '')
  const [targetPropertyId, setTargetPropertyId] = useState('')
  const [scope, setScope] = useState<RejectionScope>('CONTRACT')
  const [contractClasses, setContractClasses] = useState('')
  const [grain, setGrain] = useState('')
  const [reviewBy, setReviewBy] = useState('')
  const [exceptionDescription, setExceptionDescription] = useState('')
  const [exceptionExpiresAt, setExceptionExpiresAt] = useState('')

  function buildRejection(): StructuredRejection {
    const expiresAt = toIsoDate(exceptionExpiresAt)
    return {
      prohibited: {
        subject: prohibitedSubject.trim(),
        ...(sourceSystem.trim() ? { sourceSystem: sourceSystem.trim() } : {}),
        ...(bindingId.trim() ? { bindingId: bindingId.trim() } : {}),
        ...(targetTypeId.trim() ? { targetTypeId: targetTypeId.trim() } : {}),
        ...(targetPropertyId.trim() ? { targetPropertyId: targetPropertyId.trim() } : {}),
      },
      applicability: { scope, contractClasses: splitList(contractClasses), grain: splitList(grain) },
      reviewBy: toIsoDate(reviewBy),
      ...(exceptionDescription.trim() && expiresAt ? { exceptions: [{ description: exceptionDescription.trim(), approvedBy: loadSession().principalId, expiresAt }] } : {}),
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (decision === 'REJECTED') {
      if (!prohibitedSubject.trim() || !toIsoDate(reviewBy)) { setError(g('rejectionIncomplete')); return }
      if (exceptionDescription.trim() && !toIsoDate(exceptionExpiresAt)) { setError(g('rejectionExceptionNeedsExpiry')); return }
    }
    setSubmitting(true)
    setError('')
    try {
      const payload = await apiFetch<ReviewRequestArtifact>(`/v1/reviews/${encodeURIComponent(review.id)}/decisions`, { method: 'POST', json: { decision, rationale, ...(decision === 'REJECTED' ? { structuredRejection: buildRejection() } : {}) } })
      onDecided(payload)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('reviewRecordFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="modal-backdrop review-decision-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="review-decision-panel" role="dialog" aria-modal="true" aria-labelledby="review-decision-title">
      <header><div><span className="panel-kicker">{t('reviewDecisionKicker')}</span><h2 id="review-decision-title">{t('reviewDecisionTitle', { label: review.targetLabel })}</h2><p>{t('reviewImpact', { kind: review.targetKind.replaceAll('_', ' ').toLocaleLowerCase(), impact: review.impact })}</p></div><button aria-label={t('reviewClosePanel')} onClick={onClose}>×</button></header>
      <div className="review-context"><div><span>{t('reviewSubmittedBy')}</span><b>{review.submittedBy}</b></div><div><span>{t('reviewContractVersion')}</span><b>{review.contractVersion}</b></div><div><span>{t('reviewEvidence')}</span><b>{t('reviewReferences', { count: review.evidenceRefs.length })}</b></div></div>
      <BlastRadiusPanel reviewId={review.id} onNavigatePath={(path) => { navigateToPath(path); onClose() }} />
      <form onSubmit={(event) => void submit(event)}>
        <fieldset><legend>{t('reviewDecision')}</legend><label className={decision === 'APPROVED' ? 'selected' : ''}><input type="radio" name="decision" value="APPROVED" checked={decision === 'APPROVED'} onChange={() => setDecision('APPROVED')} /><span>✓</span><div><b>{t('reviewApprove')}</b><small>{t('reviewApproveDescription')}</small></div></label><label className={decision === 'APPROVED_WITH_EXCEPTION' ? 'selected exception' : ''}><input type="radio" name="decision" value="APPROVED_WITH_EXCEPTION" checked={decision === 'APPROVED_WITH_EXCEPTION'} onChange={() => setDecision('APPROVED_WITH_EXCEPTION')} /><span>!</span><div><b>{t('reviewApproveException')}</b><small>{t('reviewApproveExceptionDescription')}</small></div></label><label className={decision === 'REJECTED' ? 'selected rejected' : ''}><input type="radio" name="decision" value="REJECTED" checked={decision === 'REJECTED'} onChange={() => setDecision('REJECTED')} /><span>×</span><div><b>{t('reviewReject')}</b><small>{t('reviewRejectDescription')}</small></div></label></fieldset>
        <label className="rationale-field">{t('reviewRationale')}<textarea value={rationale} onChange={(event) => setRationale(event.target.value)} minLength={12} required placeholder={t('reviewRationalePlaceholder')} autoFocus /><small>{t('reviewCharacterMinimum', { count: rationale.length, minimum: 12 })}</small></label>

        {decision === 'REJECTED' && <div className="gov-form" role="group" aria-label={g('rejectionTitle')}>
          <div><span className="gov-kicker">{g('rejectionTitle')}</span><p className="gov-hint">{g('rejectionDescription')}</p></div>
          <label className="gov-field"><span>{g('rejectionSubject')}</span><input value={prohibitedSubject} onChange={(event) => setProhibitedSubject(event.target.value)} placeholder={g('rejectionSubjectPlaceholder')} required /></label>
          <div className="gov-field-row">
            <label className="gov-field"><span>{g('rejectionSourceSystem')}</span><input value={sourceSystem} onChange={(event) => setSourceSystem(event.target.value)} placeholder={g('rejectionSourcePlaceholder')} /><small>{g('rejectionOptionalHint')}</small></label>
            <label className="gov-field"><span>{g('rejectionBinding')}</span><input value={bindingId} onChange={(event) => setBindingId(event.target.value)} /><small>{g('rejectionOptionalHint')}</small></label>
          </div>
          <div className="gov-field-row">
            <label className="gov-field"><span>{g('rejectionTargetType')}</span><input value={targetTypeId} onChange={(event) => setTargetTypeId(event.target.value)} /><small>{g('rejectionOptionalHint')}</small></label>
            <label className="gov-field"><span>{g('rejectionTargetProperty')}</span><input value={targetPropertyId} onChange={(event) => setTargetPropertyId(event.target.value)} /><small>{g('rejectionOptionalHint')}</small></label>
          </div>
          <div className="gov-field-row">
            <label className="gov-field"><span>{g('rejectionScope')}</span><select value={scope} onChange={(event) => setScope(event.target.value as RejectionScope)}><option value="CONTRACT">{g('negativeScopeContract')}</option><option value="WORKSPACE">{g('negativeScopeWorkspace')}</option><option value="GLOBAL">{g('negativeScopeGlobal')}</option></select></label>
            <label className="gov-field"><span>{g('rejectionContractClasses')}</span><input value={contractClasses} onChange={(event) => setContractClasses(event.target.value)} /><small>{g('rejectionCommaHint')}</small></label>
            <label className="gov-field"><span>{g('rejectionGrain')}</span><input value={grain} onChange={(event) => setGrain(event.target.value)} /><small>{g('rejectionCommaHint')}</small></label>
          </div>
          <label className="gov-field"><span>{g('rejectionReviewBy')}</span><input type="date" value={reviewBy} onChange={(event) => setReviewBy(event.target.value)} required /><small>{g('rejectionReviewByHint')}</small></label>
          <div className="gov-field-row">
            <label className="gov-field"><span>{g('rejectionExceptionDescription')}</span><input value={exceptionDescription} onChange={(event) => setExceptionDescription(event.target.value)} placeholder={g('rejectionExceptionPlaceholder')} /><small>{g('rejectionOptionalHint')}</small></label>
            <label className="gov-field"><span>{g('rejectionExceptionExpires')}</span><input type="date" value={exceptionExpiresAt} onChange={(event) => setExceptionExpiresAt(event.target.value)} /><small>{g('rejectionExceptionNeedsExpiry')}</small></label>
          </div>
        </div>}

        {error && <div className="wizard-error" role="alert">{error}</div>}
        <div className="decision-integrity"><span>⌁</span><p>{t('reviewIntegrity')}</p></div>
        <footer><button type="button" className="ghost" onClick={onClose}>{t('commonCancel')}</button><button className="release" type="submit" disabled={submitting || rationale.trim().length < 12}>{submitting ? t('reviewRecording') : t('reviewRecordDecision')}</button></footer>
      </form>
    </section>
  </div>
}
