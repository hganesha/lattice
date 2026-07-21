import { useMemo, useState } from 'react'
import type { ContextContract, GuardrailPolicy, RiskTier } from '@lattice/contracts'
import { PolicyEditor } from './PolicyEditor'
import { useMessages } from './i18n/messages'
import { Toast } from './Toast'

interface PolicyStudioProps {
  contract: ContextContract
  onChange: (contract: ContextContract) => void
  onDirtyChange: (dirty: boolean) => void
}

const riskTiers: RiskTier[] = ['INFORMATIONAL', 'ANALYTICAL', 'PLANNING_DECISION', 'OPERATIONAL_ACTION']

const recommended: Record<RiskTier, Pick<GuardrailPolicy, 'minimumEvidenceStrength' | 'maximumEvidenceAgeMinutes' | 'approvalRequired'>> = {
  INFORMATIONAL: { minimumEvidenceStrength: 'MODERATE', maximumEvidenceAgeMinutes: 1440, approvalRequired: false },
  ANALYTICAL: { minimumEvidenceStrength: 'STRONG', maximumEvidenceAgeMinutes: 240, approvalRequired: false },
  PLANNING_DECISION: { minimumEvidenceStrength: 'STRONG', maximumEvidenceAgeMinutes: 60, approvalRequired: true },
  OPERATIONAL_ACTION: { minimumEvidenceStrength: 'EXACT', maximumEvidenceAgeMinutes: 15, approvalRequired: true },
}

export function PolicyStudio({ contract, onChange, onDirtyChange }: PolicyStudioProps) {
  const { t } = useMessages()
  const [editingPolicy, setEditingPolicy] = useState<GuardrailPolicy | 'NEW'>()
  const [notice, setNotice] = useState('')
  const operationCounts = useMemo(() => Object.fromEntries(riskTiers.map((tier) => [tier, contract.operations.filter((operation) => operation.riskTier === tier).length])) as Record<RiskTier, number>, [contract.operations])
  const requiredTiers = riskTiers.filter((tier) => operationCounts[tier] > 0)
  const coveredTiers = requiredTiers.filter((tier) => contract.policies.some((policy) => policy.riskTier === tier))
  const approvedCount = contract.policies.filter((policy) => ['APPROVED', 'APPROVED_WITH_EXCEPTION'].includes(policy.approvalStatus)).length
  const escalationCount = contract.policies.filter((policy) => policy.approvalRequired).length

  function stagePolicies(policies: GuardrailPolicy[], message: string) {
    onChange({
      ...contract,
      releaseStatus: 'UNPUBLISHED',
      policies,
      versions: { ...contract.versions, policy: `${contract.id}-policies@0.1.0` },
    })
    onDirtyChange(true)
    setNotice(message)
  }

  function savePolicy(policy: GuardrailPolicy) {
    const exists = contract.policies.some((item) => item.id === policy.id)
    const policies = exists ? contract.policies.map((item) => item.id === policy.id ? policy : item) : [...contract.policies, policy]
    stagePolicies(policies, t('policyStagedNotice', { label: policy.label }))
    setEditingPolicy(undefined)
  }

  function addRecommendedBaseline() {
    const missingTiers = requiredTiers.filter((tier) => !contract.policies.some((policy) => policy.riskTier === tier))
    const baselineTiers = missingTiers.length > 0 ? missingTiers : requiredTiers.length === 0 ? ['INFORMATIONAL' as const] : []
    if (baselineTiers.length === 0) {
      setNotice(t('policyCoverageComplete'))
      return
    }
    const additions = baselineTiers.map((riskTier): GuardrailPolicy => ({
      id: uniquePolicyId(`policy-${riskTier.toLocaleLowerCase().replaceAll('_', '-')}`, contract.policies.map((policy) => policy.id)),
      label: `${titleCase(riskTier)} baseline`,
      description: `Governed evidence, freshness, and escalation requirements for ${riskTier.replaceAll('_', ' ').toLocaleLowerCase()} operations.`,
      riskTier,
      ...recommended[riskTier],
      version: '0.1.0',
      owner: contract.competencyQuestions[0]?.owner || 'Context Governance',
      approvalStatus: 'DRAFT',
    }))
    stagePolicies([...contract.policies, ...additions], t('policyBaselineStaged', { count: additions.length }))
  }

  return <section className="policy-studio-page">
    <div className="policy-hero"><div><span className="panel-kicker">{t('policyStudioKicker').toLocaleUpperCase()}</span><h2>{t('policyStudioTitle')}</h2><p>{t('policyStudioDescription')}</p></div><div><button className="ghost" onClick={addRecommendedBaseline}>＋ {t('policyRecommendedBaseline')}</button><button className="release" onClick={() => setEditingPolicy('NEW')}>{t('policyCreate')} →</button></div></div>
    {notice && <Toast message={notice} closeLabel={t('commonClose')} onDismiss={() => setNotice('')} />}
    <div className="policy-stats"><article><span>{t('policyProfiles').toLocaleUpperCase()}</span><b>{contract.policies.length}</b><small>{t('policyVersionPinned')}</small></article><article><span>{t('policyRiskCoverage').toLocaleUpperCase()}</span><b>{coveredTiers.length} / {requiredTiers.length}</b><small>{t('policyOperationTiers')}</small></article><article><span>{t('policyApproved').toLocaleUpperCase()}</span><b>{approvedCount} / {contract.policies.length}</b><small>{t('policyReleaseEligible')}</small></article><article><span>{t('policyHumanEscalation').toLocaleUpperCase()}</span><b>{escalationCount}</b><small>{t('policyApprovalGated')}</small></article></div>
    <div className="policy-layout">
      <main className="policy-profiles panel"><header><div><span className="panel-kicker">{t('policyGuardrailProfiles').toLocaleUpperCase()}</span><h2>{contract.name}</h2></div><span>{contract.versions.policy}</span></header><div className="policy-profile-list">{contract.policies.length === 0 && <div className="policy-empty"><span>◈</span><h3>{t('policyEmptyTitle')}</h3><p>{t('policyEmptyDescription')}</p><button className="release" onClick={addRecommendedBaseline}>{t('policyAddBaseline')} →</button></div>}{contract.policies.map((policy) => <article className="policy-card" key={policy.id}><div className="policy-tier-icon">{policy.riskTier.split('_').map((word) => word[0]).join('')}</div><div className="policy-card-main"><div><h3>{policy.label}</h3><span className={`claim-status ${policy.approvalStatus.toLocaleLowerCase()}`}>{policy.approvalStatus.replaceAll('_', ' ')}</span></div><p>{policy.description}</p><footer><code>{policy.id}</code><span>{t('policyOwner', { owner: policy.owner })}</span><span>v{policy.version}</span></footer></div><dl><div><dt>{t('policyEvidence')}</dt><dd>{policy.minimumEvidenceStrength}</dd></div><div><dt>{t('policyFreshness')}</dt><dd>≤ {formatAge(policy.maximumEvidenceAgeMinutes)}</dd></div><div><dt>{t('policyEscalation')}</dt><dd className={policy.approvalRequired ? 'required' : ''}>{policy.approvalRequired ? t('policyRequired').toLocaleUpperCase() : t('policyAutonomous').toLocaleUpperCase()}</dd></div></dl><button className="ghost" onClick={() => setEditingPolicy(policy)}>{t('commonEdit')}</button></article>)}</div></main>
      <aside className="policy-coverage panel"><div className="panel-header"><div><span className="panel-kicker">{t('policyRiskTierCoverage').toLocaleUpperCase()}</span><h2>{t('policyOperationControls')}</h2></div></div><div className="policy-tier-list">{riskTiers.map((tier) => { const policy = contract.policies.find((item) => item.riskTier === tier); const required = operationCounts[tier] > 0; return <div key={tier} className={required && !policy ? 'gap' : ''}><span className={policy ? 'covered' : required ? 'missing' : 'unused'}>{policy ? '✓' : required ? '!' : '–'}</span><div><b>{tier.replaceAll('_', ' ')}</b><small>{t('policyOperationCount', { count: operationCounts[tier] })}</small></div><em>{policy ? policy.minimumEvidenceStrength : required ? t('policyNeeded').toLocaleUpperCase() : t('policyNotUsed').toLocaleUpperCase()}</em></div>})}</div><div className="policy-principle"><span>⌁</span><div><b>{t('policyExecutableContext')}</b><p>{t('policyExecutableDescription')}</p></div></div></aside>
    </div>
    {editingPolicy && <PolicyEditor policy={editingPolicy === 'NEW' ? undefined : editingPolicy} existingIds={contract.policies.map((policy) => policy.id)} onClose={() => setEditingPolicy(undefined)} onSave={savePolicy} />}
  </section>
}

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').toLocaleLowerCase().replace(/\b\w/g, (character) => character.toLocaleUpperCase())
}

function formatAge(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440}d`
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`
  return `${minutes}m`
}

function uniquePolicyId(baseId: string, existingIds: string[]): string {
  if (!existingIds.includes(baseId)) return baseId
  let suffix = 2
  while (existingIds.includes(`${baseId}-${suffix}`)) suffix += 1
  return `${baseId}-${suffix}`
}
