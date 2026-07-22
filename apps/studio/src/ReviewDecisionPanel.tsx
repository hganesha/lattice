import { useState, type FormEvent } from 'react'
import type { CreateReviewDecisionRequest, ReviewRequestArtifact } from '@lattice/contracts'
import { API_URL, apiAuthHeaders } from './api'
import { useMessages } from './i18n/messages'

interface ReviewDecisionPanelProps {
  review: ReviewRequestArtifact
  onClose: () => void
  onDecided: (review: ReviewRequestArtifact) => void
}

export function ReviewDecisionPanel({ review, onClose, onDecided }: ReviewDecisionPanelProps) {
  const { t } = useMessages()
  const [decision, setDecision] = useState<CreateReviewDecisionRequest['decision']>('APPROVED')
  const [rationale, setRationale] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/v1/reviews/${review.id}/decisions`, {
        method: 'POST',
        headers: { ...apiAuthHeaders('studio-reviewer'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, rationale }),
      })
      const payload = await response.json() as ReviewRequestArtifact & { error?: string; message?: string }
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Decision failed (${response.status})`)
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
      <form onSubmit={(event) => void submit(event)}>
        <fieldset><legend>{t('reviewDecision')}</legend><label className={decision === 'APPROVED' ? 'selected' : ''}><input type="radio" name="decision" value="APPROVED" checked={decision === 'APPROVED'} onChange={() => setDecision('APPROVED')} /><span>✓</span><div><b>{t('reviewApprove')}</b><small>{t('reviewApproveDescription')}</small></div></label><label className={decision === 'APPROVED_WITH_EXCEPTION' ? 'selected exception' : ''}><input type="radio" name="decision" value="APPROVED_WITH_EXCEPTION" checked={decision === 'APPROVED_WITH_EXCEPTION'} onChange={() => setDecision('APPROVED_WITH_EXCEPTION')} /><span>!</span><div><b>{t('reviewApproveException')}</b><small>{t('reviewApproveExceptionDescription')}</small></div></label><label className={decision === 'REJECTED' ? 'selected rejected' : ''}><input type="radio" name="decision" value="REJECTED" checked={decision === 'REJECTED'} onChange={() => setDecision('REJECTED')} /><span>×</span><div><b>{t('reviewReject')}</b><small>{t('reviewRejectDescription')}</small></div></label></fieldset>
        <label className="rationale-field">{t('reviewRationale')}<textarea value={rationale} onChange={(event) => setRationale(event.target.value)} minLength={12} required placeholder={t('reviewRationalePlaceholder')} autoFocus /><small>{t('reviewCharacterMinimum', { count: rationale.length, minimum: 12 })}</small></label>
        {error && <div className="wizard-error" role="alert">{error}</div>}
        <div className="decision-integrity"><span>⌁</span><p>{t('reviewIntegrity')}</p></div>
        <footer><button type="button" className="ghost" onClick={onClose}>{t('commonCancel')}</button><button className="release" type="submit" disabled={submitting || rationale.trim().length < 12}>{submitting ? t('reviewRecording') : t('reviewRecordDecision')}</button></footer>
      </form>
    </section>
  </div>
}
