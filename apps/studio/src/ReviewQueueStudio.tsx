import { useEffect, useMemo, useState } from 'react'
import type { ApprovalStatus, ContextContract, EvidenceRecord, ReviewRequestArtifact, ReviewTargetKind } from '@lattice/contracts'
import { API_URL } from './api'
import { ReviewDecisionPanel } from './ReviewDecisionPanel'
import { useMessages } from './i18n/messages'
import { Toast } from './Toast'

type QueueFilter = 'ACTION_REQUIRED' | 'OPEN' | 'DECIDED' | 'ALL'

interface ReviewQueueStudioProps {
  contract: ContextContract
  onChange: (contract: ContextContract) => void
  onDirtyChange: (dirty: boolean) => void
}

interface ReviewClaim {
  kind: ReviewTargetKind
  id: string
  label: string
  description: string
  status: ApprovalStatus
  impact: ContextContract['entityTypes'][number]['impact']
  detail: string
  evidenceRefs: string[]
}

export function ReviewQueueStudio({ contract, onChange, onDirtyChange }: ReviewQueueStudioProps) {
  const { t, formatDate } = useMessages()
  const [reviews, setReviews] = useState<ReviewRequestArtifact[]>([])
  const [selectedReview, setSelectedReview] = useState<ReviewRequestArtifact>()
  const [filter, setFilter] = useState<QueueFilter>('ACTION_REQUIRED')
  const [submittingId, setSubmittingId] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`${API_URL}/v1/reviews?contractId=${encodeURIComponent(contract.id)}`, { headers: { Authorization: 'Bearer studio-demo' }, signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<ReviewRequestArtifact[]> : [])
      .then(setReviews)
      .catch(() => undefined)
    return () => controller.abort()
  }, [contract.id])

  const claims = useMemo<ReviewClaim[]>(() => [
    ...contract.entityTypes.map((type) => ({ kind: 'ENTITY_TYPE' as const, id: type.id, label: type.label, description: type.description, status: reviews.some((review) => review.targetKind === 'ENTITY_TYPE' && review.targetId === type.id && review.status === 'OPEN') ? 'IN_REVIEW' as const : type.approvalStatus, impact: type.impact, detail: t('reviewGovernedProperties', { count: type.properties.length }), evidenceRefs: contract.evidence.filter((evidence) => evidence.status === type.evidenceStatus || evidence.status === 'TEMPLATE_DERIVED').slice(-3).map((evidence) => evidence.id) })),
    ...contract.bindings.map((binding) => ({ kind: 'SOURCE_BINDING' as const, id: binding.id, label: binding.sourceSystem, description: `${binding.method ?? 'OP'} ${binding.endpoint ?? binding.operationId}`, status: reviews.some((review) => review.targetKind === 'SOURCE_BINDING' && review.targetId === binding.id && review.status === 'OPEN') ? 'IN_REVIEW' as const : binding.approvalStatus, impact: 'HIGH' as const, detail: t('reviewBindingDetail', { count: binding.mappings?.length ?? 0, minutes: binding.freshnessMinutes }), evidenceRefs: contract.evidence.filter((evidence) => evidence.checksum === binding.sourceChecksum || evidence.locator.includes(binding.sourceSystem)).map((evidence) => evidence.id) })),
    ...contract.policies.map((policy) => ({ kind: 'POLICY' as const, id: policy.id, label: policy.label, description: policy.description, status: reviews.some((review) => review.targetKind === 'POLICY' && review.targetId === policy.id && review.status === 'OPEN') ? 'IN_REVIEW' as const : policy.approvalStatus, impact: policy.riskTier === 'OPERATIONAL_ACTION' ? 'CRITICAL' as const : policy.riskTier === 'PLANNING_DECISION' ? 'HIGH' as const : 'MEDIUM' as const, detail: t('reviewPolicyDetail', { strength: policy.minimumEvidenceStrength, minutes: policy.maximumEvidenceAgeMinutes }), evidenceRefs: contract.evidence.filter((evidence) => evidence.locator.includes(policy.id)).map((evidence) => evidence.id) })),
  ], [contract.bindings, contract.entityTypes, contract.evidence, contract.policies, reviews, t])
  const visibleClaims = claims.filter((claim) => filter === 'ALL' || filter === 'ACTION_REQUIRED' && ['DRAFT', 'REJECTED'].includes(claim.status) || filter === 'OPEN' && claim.status === 'IN_REVIEW' || filter === 'DECIDED' && ['APPROVED', 'APPROVED_WITH_EXCEPTION'].includes(claim.status))
  const openCount = claims.filter((claim) => claim.status === 'IN_REVIEW').length
  const actionCount = claims.filter((claim) => ['DRAFT', 'REJECTED'].includes(claim.status)).length
  const approvedCount = claims.filter((claim) => ['APPROVED', 'APPROVED_WITH_EXCEPTION'].includes(claim.status)).length

  async function submitForReview(claim: ReviewClaim) {
    setSubmittingId(claim.id)
    setNotice('')
    try {
      const response = await fetch(`${API_URL}/v1/reviews`, {
        method: 'POST',
        headers: { Authorization: 'Bearer studio-author', 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: contract.id, contractVersion: contract.version, targetKind: claim.kind, targetId: claim.id, targetLabel: claim.label, impact: claim.impact, evidenceRefs: claim.evidenceRefs }),
      })
      const review = await response.json() as ReviewRequestArtifact & { error?: string }
      if (!response.ok) throw new Error(review.error ?? `Review API returned ${response.status}`)
      setReviews((current) => [review, ...current.filter((item) => item.id !== review.id)])
      updateClaimStatus(claim.kind, claim.id, 'IN_REVIEW')
      setSelectedReview(review)
      setNotice(t('reviewSubmittedNotice', { label: claim.label }))
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : t('reviewCreateFailed'))
    } finally {
      setSubmittingId('')
    }
  }

  function updateClaimStatus(kind: ReviewTargetKind, targetId: string, status: ApprovalStatus, evidence?: EvidenceRecord) {
    const next: ContextContract = {
      ...contract,
      releaseStatus: 'UNPUBLISHED',
      entityTypes: kind === 'ENTITY_TYPE' ? contract.entityTypes.map((type) => type.id === targetId ? { ...type, approvalStatus: status } : type) : contract.entityTypes,
      bindings: kind === 'SOURCE_BINDING' ? contract.bindings.map((binding) => binding.id === targetId ? { ...binding, approvalStatus: status } : binding) : contract.bindings,
      policies: kind === 'POLICY' ? contract.policies.map((policy) => policy.id === targetId ? { ...policy, approvalStatus: status } : policy) : contract.policies,
      evidence: evidence && !contract.evidence.some((item) => item.id === evidence.id) ? [...contract.evidence, evidence] : contract.evidence,
    }
    onChange(next)
    onDirtyChange(true)
  }

  function applyDecision(review: ReviewRequestArtifact) {
    if (!review.decision) return
    const decision = review.decision
    const evidence: EvidenceRecord = { id: `ev_${decision.id}`, type: 'EXPERT_DECISION', title: `${decision.decision.replaceAll('_', ' ')}: ${review.targetLabel}`, source: 'Lattice Review Queue', locator: `/v1/reviews/${review.id}`, checksum: decision.artifactDigest, observedAt: decision.decidedAt, validFrom: decision.decidedAt, status: decision.decision === 'REJECTED' ? 'CONFLICTING' : 'DIRECTLY_EVIDENCED' }
    updateClaimStatus(review.targetKind, review.targetId, decision.decision, evidence)
    setReviews((current) => [review, ...current.filter((item) => item.id !== review.id)])
    setSelectedReview(undefined)
    setNotice(t('reviewDecisionNotice', { label: review.targetLabel, decision: decision.decision.replaceAll('_', ' ').toLocaleLowerCase() }))
  }

  return <section className="review-queue-page">
    <div className="review-hero"><div><span className="panel-kicker">{t('reviewQueueKicker').toLocaleUpperCase()}</span><h2>{t('reviewQueueTitle')}</h2><p>{t('reviewQueueDescription')}</p></div></div>
    {notice && <Toast message={notice} closeLabel={t('commonClose')} onDismiss={() => setNotice('')} />}
    <div className="review-stats"><ReviewMetric label={t('reviewActionRequired').toLocaleUpperCase()} value={String(actionCount)} meta={t('reviewDraftRejected')} tone="amber" /><ReviewMetric label={t('reviewOpenReviews').toLocaleUpperCase()} value={String(openCount)} meta={t('reviewAwaitingDecision')} tone="blue" /><ReviewMetric label={t('reviewApproved').toLocaleUpperCase()} value={`${approvedCount} / ${claims.length}`} meta={t('policyReleaseEligible')} tone="green" /><ReviewMetric label={t('reviewDecisionArtifacts').toLocaleUpperCase()} value={String(reviews.filter((review) => review.status === 'DECIDED').length)} meta={t('reviewImmutableHistory')} tone="lime" /></div>
    <div className="review-layout">
      <main className="review-claims panel"><header><div><span className="panel-kicker">{t('reviewContractClaims').toLocaleUpperCase()}</span><h2>{contract.name}</h2></div><nav aria-label={t('reviewFilters')}>{(['ACTION_REQUIRED', 'OPEN', 'DECIDED', 'ALL'] as const).map((item) => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{t(item === 'ACTION_REQUIRED' ? 'reviewActionRequired' : item === 'OPEN' ? 'reviewFilterOpen' : item === 'DECIDED' ? 'reviewFilterDecided' : 'reviewFilterAll')}</button>)}</nav></header><div className="review-claim-list">{visibleClaims.length === 0 && <div className="review-empty"><span>✓</span><h3>{t('reviewEmptyTitle')}</h3><p>{t('reviewEmptyDescription')}</p></div>}{visibleClaims.map((claim) => { const review = reviews.find((item) => item.targetKind === claim.kind && item.targetId === claim.id && (item.status === 'OPEN' || claim.status !== 'IN_REVIEW')); return <article className="review-claim" key={`${claim.kind}:${claim.id}`}><div className={`claim-kind ${claim.kind.toLocaleLowerCase()}`}>{claim.kind === 'ENTITY_TYPE' ? 'TYPE' : claim.kind === 'POLICY' ? 'POL' : 'API'}</div><div className="claim-main"><div><h3>{claim.label}</h3><span className={`claim-status ${claim.status.toLocaleLowerCase()}`}>{claim.status.replaceAll('_', ' ')}</span><em>{claim.impact}</em></div><p>{claim.description}</p><footer><code>{claim.id}</code><span>{claim.detail}</span><span>{t('reviewEvidenceRefs', { count: claim.evidenceRefs.length })}</span></footer></div><div className="claim-action">{['DRAFT', 'REJECTED'].includes(claim.status) && <button className="release" onClick={() => void submitForReview(claim)} disabled={submittingId === claim.id}>{submittingId === claim.id ? t('reviewSubmitting') : `${t('reviewSubmit')} →`}</button>}{claim.status === 'IN_REVIEW' && review && <button className="review-button" onClick={() => setSelectedReview(review)}>{t('reviewOpen')} →</button>}{['APPROVED', 'APPROVED_WITH_EXCEPTION'].includes(claim.status) && review?.decision && <button className="history-button" onClick={() => setSelectedReview(review)}>{t('reviewViewDecision')}</button>}</div></article> })}</div></main>
      <aside className="review-history panel"><div className="panel-header"><div><span className="panel-kicker">{t('reviewDecisionLedger').toLocaleUpperCase()}</span><h2>{t('reviewRecentEvents')}</h2></div></div><div className="review-history-list">{reviews.length === 0 && <p>{t('reviewNoArtifacts')}</p>}{reviews.slice(0, 8).map((review) => <button onClick={() => setSelectedReview(review)} key={review.id}><i className={review.status.toLocaleLowerCase()} /><div><b>{review.targetLabel}</b><span>{review.status === 'OPEN' ? t('reviewSubmittedByName', { name: review.submittedBy }) : t('reviewDecidedByName', { decision: review.decision?.decision.replaceAll('_', ' ') ?? '', name: review.decision?.decidedBy ?? '' })}</span><time>{formatDate(review.decision?.decidedAt ?? review.submittedAt, { dateStyle: 'medium', timeStyle: 'short' })}</time></div></button>)}</div><div className="review-integrity"><span>⌁</span><div><b>{t('reviewAppendOnly')}</b><p>{t('reviewAppendOnlyDescription')}</p></div></div></aside>
    </div>
    {selectedReview && selectedReview.status === 'OPEN' && <ReviewDecisionPanel review={selectedReview} onClose={() => setSelectedReview(undefined)} onDecided={applyDecision} />}
    {selectedReview?.status === 'DECIDED' && <DecisionDetail review={selectedReview} onClose={() => setSelectedReview(undefined)} />}
  </section>
}

function ReviewMetric({ label, value, meta, tone }: { label: string; value: string; meta: string; tone: string }) {
  return <div className="review-metric"><div><span>{label}</span><i className={`mini-dot ${tone}`} /></div><b>{value}</b><small>{meta}</small></div>
}

function DecisionDetail({ review, onClose }: { review: ReviewRequestArtifact; onClose: () => void }) {
  const { t, formatDate } = useMessages()
  const decision = review.decision
  if (!decision) return null
  return <div className="modal-backdrop review-decision-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="decision-detail" role="dialog" aria-modal="true" aria-labelledby="decision-detail-title"><header><div><span className="panel-kicker">{t('reviewImmutableDecision').toLocaleUpperCase()}</span><h2 id="decision-detail-title">{review.targetLabel}</h2></div><button aria-label={t('reviewCloseDecisionDetail')} onClick={onClose}>×</button></header><div className={`decision-seal ${decision.decision.toLocaleLowerCase()}`}><span>{decision.decision === 'REJECTED' ? '×' : '✓'}</span><b>{decision.decision.replaceAll('_', ' ')}</b></div><blockquote>{decision.rationale}</blockquote><dl><div><dt>{t('reviewReviewer')}</dt><dd>{decision.decidedBy}</dd></div><div><dt>{t('reviewDecided')}</dt><dd>{formatDate(decision.decidedAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div><div><dt>{t('reviewTarget')}</dt><dd>{review.targetKind.replaceAll('_', ' ')}</dd></div></dl><div className="decision-digest"><span>{t('reviewDecisionDigest').toLocaleUpperCase()}</span><code>{decision.artifactDigest}</code></div><footer><button className="release" onClick={onClose}>{t('commonDone')}</button></footer></section></div>
}
