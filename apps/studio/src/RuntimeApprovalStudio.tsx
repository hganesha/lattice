import { useCallback, useEffect, useState } from 'react'
import {
  canLoadGridOutageExample,
  enableGridRuntimeApprovalExample,
  type ContextContract,
  type ExecutionReceipt,
  type RuntimeApprovalArtifact,
} from '@lattice/contracts'
import { ExecutionReceiptCard } from './ExecutionReceiptCard'
import { API_URL } from './api'
import { useMessages } from './i18n/messages'
import { Toast } from './Toast'

interface RuntimeApprovalStudioProps {
  contract: ContextContract
  onChange: (contract: ContextContract) => void
  onDirtyChange: (dirty: boolean) => void
  onOpenReviews: () => void
  onOpenAssurance: () => void
  onManageRelease: () => void
}

export function RuntimeApprovalStudio({ contract, onChange, onDirtyChange, onOpenReviews, onOpenAssurance, onManageRelease }: RuntimeApprovalStudioProps) {
  const { t } = useMessages()
  const [approvals, setApprovals] = useState<RuntimeApprovalArtifact[]>([])
  const [receipts, setReceipts] = useState<ExecutionReceipt[]>([])
  const [rationale, setRationale] = useState('Operational evidence is current and the prioritization scope is appropriate.')
  const [workingId, setWorkingId] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const headers = { Authorization: 'Bearer studio-runtime-reviewer' }
    const requestOptions: RequestInit = { headers, ...(signal ? { signal } : {}) }
    const [approvalResponse, executionResponse] = await Promise.all([
      fetch(`${API_URL}/v1/runtime-approvals?contractId=${encodeURIComponent(contract.id)}`, requestOptions),
      fetch(`${API_URL}/v1/executions?contractId=${encodeURIComponent(contract.id)}`, requestOptions),
    ])
    if (approvalResponse.ok) setApprovals(await approvalResponse.json() as RuntimeApprovalArtifact[])
    if (executionResponse.ok) setReceipts(await executionResponse.json() as ExecutionReceipt[])
  }, [contract.id])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal).catch(() => undefined)
    return () => controller.abort()
  }, [refresh])

  function configureApprovalExample() {
    onChange(enableGridRuntimeApprovalExample(contract))
    onDirtyChange(true)
    setError('Approval baseline staged as an unpublished draft. Approve the policy, run assurance, then publish v0.2.0.')
  }

  async function decide(approval: RuntimeApprovalArtifact, decision: 'APPROVED' | 'REJECTED') {
    setWorkingId(approval.id)
    setError('')
    try {
      const response = await fetch(`${API_URL}/v1/runtime-approvals/${approval.id}/decisions`, {
        method: 'POST',
        headers: { Authorization: 'Bearer studio-runtime-reviewer', 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, rationale }),
      })
      const payload = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? 'Decision failed')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Decision failed')
    } finally {
      setWorkingId('')
    }
  }

  async function resume(approval: RuntimeApprovalArtifact) {
    setWorkingId(approval.id)
    setError('')
    try {
      const response = await fetch(`${API_URL}/v1/runtime-approvals/${approval.id}/resume`, {
        method: 'POST',
        headers: { Authorization: 'Bearer studio-demo', 'Content-Type': 'application/json' },
        body: '{}',
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Resume failed')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Resume failed')
    } finally {
      setWorkingId('')
    }
  }

  async function execute(approval: RuntimeApprovalArtifact) {
    if (!approval.signedPlanId) return
    setWorkingId(approval.id)
    setError('')
    try {
      const response = await fetch(`${API_URL}/v1/plans/${approval.signedPlanId}/execute`, {
        method: 'POST',
        headers: { Authorization: 'Bearer studio-runtime-agent', 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantedPermissions: approval.pendingPlan.requiredPermissions }),
      })
      const payload = await response.json() as ExecutionReceipt & { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Execution failed')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Execution failed')
    } finally {
      setWorkingId('')
    }
  }

  const pendingCount = approvals.filter((approval) => approval.status === 'PENDING').length
  const governedOperation = contract.operations.find((operation) => operation.riskTier === 'PLANNING_DECISION' || operation.riskTier === 'OPERATIONAL_ACTION')
  const governedPolicy = governedOperation ? contract.policies.find((policy) => policy.riskTier === governedOperation.riskTier && policy.approvalRequired) : undefined

  return <section className="runtime-approval-studio">
    <section className="runtime-approval-hero panel">
      <div><span className="panel-kicker">{t('approvalCheckpoint').toLocaleUpperCase()}</span><h2>{t('approvalTitle')}</h2><p>{t('approvalDescription')}</p></div>
      <div className="approval-hero-stats"><span><b>{pendingCount}</b>{t('approvalPending')}</span><span><b>{receipts.length}</b>{t('approvalReceipts')}</span></div>
    </section>

    {!governedPolicy && canLoadGridOutageExample(contract) && <section className="approval-setup panel">
      <div><span className="panel-kicker">{t('approvalDemoBaseline').toLocaleUpperCase()}</span><h3>{t('approvalGovernOutage')}</h3><p>{t('approvalDemoDescription')}</p></div>
      <button className="release" onClick={configureApprovalExample}>{t('approvalStageBaseline')} →</button>
    </section>}

    {governedPolicy && contract.releaseStatus !== 'PUBLISHED' && <section className="approval-pipeline panel">
      <div><span>1</span><b>{t('approvalPolicyReview')}</b><small>{governedPolicy.approvalStatus}</small><button className="ghost" onClick={onOpenReviews}>{t('approvalOpenReviews')}</button></div>
      <div><span>2</span><b>{t('navAssurance')}</b><small>{t('approvalChecksPassing', { count: contract.tests.filter((test) => test.status === 'PASS').length })}</small><button className="ghost" onClick={onOpenAssurance}>{t('approvalRunAssurance')}</button></div>
      <div><span>3</span><b>{t('statusPublished')}</b><small>{t('approvalActivateRuntime')}</small><button className="release" onClick={onManageRelease}>{t('manageRelease')}</button></div>
    </section>}

    {error && <Toast message={`${t('approvalRuntimeWorkflow')} ${error}`} closeLabel={t('commonClose')} onDismiss={() => setError('')} />}

    <div className="approval-layout">
      <section className="approval-queue panel">
        <div className="panel-header"><div><span className="panel-kicker">{t('approvalQueue').toLocaleUpperCase()}</span><h2>{t('approvalRuntimeIntents')}</h2></div><button className="ghost" onClick={() => void refresh()}>{t('commonRefresh')}</button></div>
        {approvals.length === 0 ? <div className="runtime-empty compact"><span>◴</span><h3>{t('approvalEmptyTitle')}</h3><p>{t('approvalEmptyDescription')}</p></div> : approvals.map((approval) => <article className="runtime-approval-card" key={approval.id}>
          <div className="approval-card-heading"><div><span>{approval.riskTier.replaceAll('_', ' ')}</span><h3>{approval.operationId}</h3></div><span className={`runtime-status-pill ${approval.status.toLocaleLowerCase()}`}>{approval.status}</span></div>
          <p>{approval.id}</p>
          <div className="approval-facts"><span><b>{t('approvalRequester')}</b>{approval.requestedBy}</span><span><b>{t('approvalRelease')}</b>v{approval.contractVersion}</span><span><b>{t('approvalPermissions')}</b>{approval.pendingPlan.requiredPermissions.join(', ')}</span></div>
          {approval.status === 'PENDING' && <div className="approval-decision"><textarea aria-label={t('approvalRationale')} value={rationale} onChange={(event) => setRationale(event.target.value)} /><button className="ghost danger" disabled={workingId === approval.id} onClick={() => void decide(approval, 'REJECTED')}>{t('reviewReject')}</button><button className="release" disabled={workingId === approval.id} onClick={() => void decide(approval, 'APPROVED')}>{t('approvalApproveIntent')}</button></div>}
          {approval.status === 'APPROVED' && <button className="release wide" disabled={workingId === approval.id} onClick={() => void resume(approval)}>{t('approvalResumeSign')} →</button>}
          {approval.status === 'RESUMED' && !receipts.some((receipt) => receipt.planId === approval.signedPlanId) && <button className="release wide" disabled={workingId === approval.id} onClick={() => void execute(approval)}>{t('approvalExecute')} →</button>}
          {approval.decision && <div className="decision-proof"><b>{approval.decision.decidedBy}</b><span>{approval.decision.rationale}</span><code>{approval.decision.artifactDigest}</code></div>}
        </article>)}
      </section>
      <section className="execution-ledger panel">
        <div className="panel-header"><div><span className="panel-kicker">{t('approvalExecutionLedger').toLocaleUpperCase()}</span><h2>{t('approvalAdapterReceipts')}</h2></div></div>
        {receipts.length === 0 ? <div className="runtime-empty compact"><span>⌁</span><h3>{t('approvalNoPlans')}</h3><p>{t('approvalNoPlansDescription')}</p></div> : receipts.map((receipt) => <ExecutionReceiptCard receipt={receipt} key={receipt.id} />)}
      </section>
    </div>
  </section>
}
