import { useState, type FormEvent } from 'react'
import type { EvidenceStrength, GuardrailPolicy, RiskTier } from '@lattice/contracts'
import { useMessages } from './i18n/messages'
import { Overlay } from './Overlay'

interface PolicyEditorProps {
  policy?: GuardrailPolicy | undefined
  existingIds: string[]
  onClose: () => void
  onSave: (policy: GuardrailPolicy) => void
}

const riskTiers: RiskTier[] = ['INFORMATIONAL', 'ANALYTICAL', 'PLANNING_DECISION', 'OPERATIONAL_ACTION']
const evidenceStrengths: EvidenceStrength[] = ['WEAK', 'MODERATE', 'STRONG', 'EXACT']

export function PolicyEditor({ policy, existingIds, onClose, onSave }: PolicyEditorProps) {
  const { t } = useMessages()
  const [label, setLabel] = useState(policy?.label ?? '')
  const [description, setDescription] = useState(policy?.description ?? '')
  const [riskTier, setRiskTier] = useState<RiskTier>(policy?.riskTier ?? 'INFORMATIONAL')
  const [minimumEvidenceStrength, setMinimumEvidenceStrength] = useState<EvidenceStrength>(policy?.minimumEvidenceStrength ?? 'MODERATE')
  const [maximumEvidenceAgeMinutes, setMaximumEvidenceAgeMinutes] = useState(policy?.maximumEvidenceAgeMinutes ?? 1440)
  const [approvalRequired, setApprovalRequired] = useState(policy?.approvalRequired ?? false)
  const [owner, setOwner] = useState(policy?.owner ?? '')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const baseId = `policy-${slugify(label) || riskTier.toLocaleLowerCase()}`
    const id = policy?.id ?? uniqueId(baseId, existingIds)
    onSave({
      id,
      label: label.trim(),
      description: description.trim(),
      riskTier,
      minimumEvidenceStrength,
      maximumEvidenceAgeMinutes,
      approvalRequired,
      version: policy?.version ?? '0.1.0',
      owner: owner.trim(),
      approvalStatus: 'DRAFT',
    })
  }

  return <Overlay variant="drawer" title={policy ? t('policyEditorEdit') : t('policyEditorCreate')} closeLabel={t('policyEditorClose')} onClose={onClose} dismissOnBackdrop={false}>
    <form onSubmit={submit} className="overlay-form">
      <label>{t('policyEditorName')}<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t('policyEditorNamePlaceholder')} required autoFocus /></label>
      <label>{t('policyEditorDescription')}<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('policyEditorDescriptionPlaceholder')} required /></label>
      <div className="form-split"><label>{t('policyEditorRiskTier')}<select value={riskTier} onChange={(event) => setRiskTier(event.target.value as RiskTier)}>{riskTiers.map((tier) => <option value={tier} key={tier}>{tier.replaceAll('_', ' ')}</option>)}</select></label><label>{t('policyEditorMinimumEvidence')}<select value={minimumEvidenceStrength} onChange={(event) => setMinimumEvidenceStrength(event.target.value as EvidenceStrength)}>{evidenceStrengths.map((strength) => <option value={strength} key={strength}>{strength}</option>)}</select></label></div>
      <div className="form-split"><label>{t('policyEditorMaximumAge')}<input type="number" min="1" value={maximumEvidenceAgeMinutes} onChange={(event) => setMaximumEvidenceAgeMinutes(Number(event.target.value))} required /></label><label>{t('policyEditorOwner')}<input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder={t('policyEditorOwnerPlaceholder')} required /></label></div>
      <label className="policy-approval-toggle"><input type="checkbox" checked={approvalRequired} onChange={(event) => setApprovalRequired(event.target.checked)} /><span><b>{t('policyEditorRequireApproval')}</b><small>{t('policyEditorRequireApprovalDescription')}</small></span></label>
      <div className="policy-edit-warning">{t('policyEditorWarning')}</div>
      <div className="overlay-actions"><button type="button" className="ghost" onClick={onClose}>{t('commonCancel')}</button><button type="submit" className="release">{policy ? t('policyEditorStageUpdate') : t('policyEditorCreateAction')} →</button></div>
    </form>
  </Overlay>
}

function slugify(value: string): string {
  return value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function uniqueId(baseId: string, existingIds: string[]): string {
  if (!existingIds.includes(baseId)) return baseId
  let suffix = 2
  while (existingIds.includes(`${baseId}-${suffix}`)) suffix += 1
  return `${baseId}-${suffix}`
}
