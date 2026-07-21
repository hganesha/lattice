import type { CompileResponse } from '@lattice/contracts'
import { useMessages } from './i18n/messages'

interface CompileResolutionProps {
  result: CompileResponse
  onChoose: (entityId: string) => void
}

export function CompileResolution({ result, onChoose }: CompileResolutionProps) {
  const { t, formatTime } = useMessages()
  const resolved = result.decision === 'RESOLVED'
  return <section className={`resolution ${resolved ? 'resolved' : 'attention'}`}>
    <div className="resolution-icon">{resolved ? '✓' : '?'}</div>
    <div className="resolution-copy"><span>{result.decision.replaceAll('_', ' ')}</span><b>{result.explanation[0]}</b>{result.plan && <small>{t('runtimeExpires', { operation: result.plan.operation, time: formatTime(result.plan.expiresAt, { hour: '2-digit', minute: '2-digit' }) })}</small>}{result.approval && <small>{t('runtimeUnsignedIntent', { id: result.approval.id })}</small>}</div>
    {result.clarification && <div className="candidate-list">{result.clarification.candidates.map((candidate) => <button key={candidate.entityId} onClick={() => onChoose(candidate.entityId)}><b>{candidate.label}</b><span>{candidate.entityId} · {candidate.evidenceStrength}</span></button>)}</div>}
    {result.plan && 'signature' in result.plan && <div className="signed-pill"><span>{t('runtimeSignedPlan').toLocaleUpperCase()}</span><small>{result.plan.keyId}</small></div>}
    {result.approval && <div className="signed-pill pending"><span>{t('runtimeApprovalPending').toLocaleUpperCase()}</span><small>{result.approval.riskTier.replaceAll('_', ' ')}</small></div>}
  </section>
}
