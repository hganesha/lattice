import { useMemo, useState } from 'react'
import type { EligibilityCell, EligibilityMatrix, RiskTier } from '@lattice/contracts'
import { permittedUseOrder } from '@lattice/contracts'
import { useResource } from './useResource'
import { EmptyState, ErrorState, LoadingState } from './SurfaceState'
import { assuranceMessageKeys, deploymentStatusMessageKeys, eligibilitySubjectMessageKeys, governanceStatusMessageKeys, permittedUseMessageKeys, riskTierMessageKeys, sourceHealthMessageKeys, useGovernanceMessages } from './i18n/messages.governance'
import { IconBan, IconChevronDown, IconCheck, IconScale, IconShieldCheck } from './icons'
import './governance.css'

/**
 * E11 — scoped eligibility. The headline is the derived answer ("what is this permitted to do
 * right now?"); the four axes are the explanation behind a disclosure. Four axes at 4–5 values
 * each is up to 320 states, which no steward can reason about as a tuple — and there is
 * deliberately no composite trust score anywhere on this panel (evolution §3.B).
 */

const riskOrder: readonly RiskTier[] = ['INFORMATIONAL', 'ANALYTICAL', 'PLANNING_DECISION', 'OPERATIONAL_ACTION']

export function EligibilityMatrixPanel({ contractId }: { contractId: string }) {
  const { t, formatDate } = useGovernanceMessages()
  const [subjectId, setSubjectId] = useState('')
  const [openCellKey, setOpenCellKey] = useState('')
  const [axesOpen, setAxesOpen] = useState(false)
  const matrices = useResource<EligibilityMatrix[]>(contractId ? `/v1/eligibility?contractId=${encodeURIComponent(contractId)}` : undefined, [contractId])
  const subjects = matrices.data ?? []
  const subject = subjects.find((entry) => `${entry.subjectKind}:${entry.subjectId}` === subjectId) ?? subjects[0]

  const cellIndex = useMemo(() => new Map((subject?.cells ?? []).map((cell) => [`${cell.use}|${cell.riskTier}`, cell])), [subject])
  const riskColumns = useMemo(() => riskOrder.filter((tier) => (subject?.cells ?? []).some((cell) => cell.riskTier === tier)), [subject])
  const useRows = useMemo(() => permittedUseOrder.filter((use) => (subject?.cells ?? []).some((cell) => cell.use === use)), [subject])
  const openCell = openCellKey ? cellIndex.get(openCellKey) : undefined
  const permittedCount = (subject?.cells ?? []).filter((cell) => cell.permitted).length
  const totalCount = subject?.cells.length ?? 0

  function selectSubject(entry: EligibilityMatrix) {
    setSubjectId(`${entry.subjectKind}:${entry.subjectId}`)
    setOpenCellKey('')
  }

  return <section className="gov-panel eligibility-panel" aria-label={t('eligibilityTitle')}>
    <header><div><span className="gov-kicker">{t('eligibilityKicker')}</span><h3>{t('eligibilityTitle')}</h3></div>{subject && <span className="gov-meta">{t('eligibilityComputed', { at: formatDate(subject.computedAt, { dateStyle: 'medium', timeStyle: 'short' }) })}</span>}</header>

    {matrices.status === 'LOADING' && <LoadingState label={t('eligibilityLoading')} />}
    {matrices.status === 'ERROR' && <ErrorState title={t('eligibilityErrorTitle')} detail={matrices.error} retryLabel={t('eligibilityRetry')} onRetry={matrices.reload} />}
    {matrices.status === 'READY' && !subject && <EmptyState title={t('eligibilityEmptyTitle')} description={t('eligibilityEmptyDescription')} icon={<IconScale />} />}

    {subject && <>
      {subjects.length > 1 && <div className="eligibility-subjects" role="group" aria-label={t('eligibilitySubjects')}>{subjects.map((entry) => { const key = `${entry.subjectKind}:${entry.subjectId}`; const active = key === `${subject.subjectKind}:${subject.subjectId}`; return <button type="button" key={key} aria-pressed={active} onClick={() => selectSubject(entry)}><i>{t(eligibilitySubjectMessageKeys[entry.subjectKind])}</i> {entry.subjectLabel}</button> })}</div>}

      <div className="eligibility-answer"><span aria-hidden="true"><IconScale /></span><div><h4>{subject.primaryAnswer}</h4><small>{t('eligibilitySummary', { permitted: permittedCount, total: totalCount })}</small></div></div>

      <div className="eligibility-scroll">
        <table className="eligibility-matrix">
          <caption>{t('eligibilityUse')} × {t('eligibilityRiskClass')}</caption>
          <thead><tr><th scope="col">{t('eligibilityUse')}</th>{riskColumns.map((tier) => <th scope="col" key={tier}>{t(riskTierMessageKeys[tier])}</th>)}</tr></thead>
          <tbody>{useRows.map((use) => <tr key={use}>
            <th scope="row">{t(permittedUseMessageKeys[use])}</th>
            {riskColumns.map((tier) => { const key = `${use}|${tier}`; const cell = cellIndex.get(key); return <td key={key}>{cell
              ? <button type="button" className={`eligibility-cell ${cell.permitted ? 'permitted' : 'blocked'}`} aria-expanded={openCellKey === key} aria-label={t('eligibilityCellLabel', { use: t(permittedUseMessageKeys[use]), risk: t(riskTierMessageKeys[tier]), state: cell.permitted ? t('eligibilityPermitted') : t('eligibilityBlocked') })} onClick={() => setOpenCellKey((current) => current === key ? '' : key)}>{cell.permitted ? <IconCheck /> : <IconBan />} {cell.permitted ? t('eligibilityPermitted') : t('eligibilityBlocked')}</button>
              : <span className="eligibility-none">{t('eligibilityNotOffered')}</span>}</td> })}
          </tr>)}</tbody>
        </table>
      </div>

      {openCell && <CellExplanation cell={openCell} />}

      <div className="eligibility-axes">
        <button type="button" aria-expanded={axesOpen} onClick={() => setAxesOpen((current) => !current)}>{t('eligibilityExplain')} <IconChevronDown /></button>
        {axesOpen && <>
          <dl className="eligibility-axis-grid">
            <div><dt>{t('eligibilityAxisEvidence')}</dt><dd>{t(assuranceMessageKeys[subject.state.evidenceAssurance])}</dd></div>
            <div><dt>{t('eligibilityAxisGovernance')}</dt><dd>{t(governanceStatusMessageKeys[subject.state.governanceStatus])}</dd></div>
            <div><dt>{t('eligibilityAxisDeployment')}</dt><dd>{t(deploymentStatusMessageKeys[subject.state.deploymentStatus])}</dd></div>
            <div><dt>{t('eligibilityAxisSourceHealth')}</dt><dd>{t(sourceHealthMessageKeys[subject.state.sourceHealth])}</dd></div>
          </dl>
          <p className="eligibility-detail">{t('eligibilityAxisNote')}</p>
        </>}
      </div>

      <p className="gov-note"><IconShieldCheck /> {t('eligibilityNoScore')}</p>
    </>}
  </section>
}

function CellExplanation({ cell }: { cell: EligibilityCell }) {
  const { t } = useGovernanceMessages()
  return <div className="eligibility-detail" role="status" aria-live="polite">
    <h5>{t(permittedUseMessageKeys[cell.use])} · {t(riskTierMessageKeys[cell.riskTier])}</h5>
    <p>{t('eligibilityFloor', { level: t(assuranceMessageKeys[cell.requiredEvidenceAssurance]) })}</p>
    {cell.permitted || cell.blockedBy.length === 0
      ? <p>{t('eligibilityNothingBlocks')}</p>
      : <><h5>{t('eligibilityBlockedByTitle')}</h5><ul>{cell.blockedBy.map((reason, index) => <li key={`${index}:${reason}`}>{reason}</li>)}</ul></>}
  </div>
}
