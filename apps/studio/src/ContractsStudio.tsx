import type { ContractSummary } from '@lattice/contracts'
import { useMessages } from './i18n/messages'

interface ContractsStudioProps {
  contracts: ContractSummary[]
  activeContractId: string
  onSelect: (contractId: string) => void
  onCreate: () => void
}

export function ContractsStudio({ contracts, activeContractId, onSelect, onCreate }: ContractsStudioProps) {
  const { t, formatDate } = useMessages()
  const activeContract = contracts.find((contract) => contract.contractId === activeContractId)
  return <section className="contracts-studio-page">
    <div className="contracts-hero">
      <div><span className="panel-kicker">{t('contractsKicker').toLocaleUpperCase()}</span><h2>{t('contractsTitle')}</h2><p>{t('contractsDescription')}</p></div>
      <div className="contracts-hero-actions">
        <label className="contract-canvas-selector" htmlFor="active-contract">
          <span>{t('activeContract').toLocaleUpperCase()}</span>
          <select id="active-contract" aria-label={t('activeContract')} value={activeContract?.contractId ?? ''} disabled={contracts.length === 0} onChange={(event) => onSelect(event.target.value)}>
            {!activeContract && <option value="">{t('contractsNoWorkspaceContracts')}</option>}
            {contracts.map((contract) => <option value={contract.contractId} key={contract.contractId}>{contract.name}</option>)}
          </select>
          <small>{activeContract ? `${activeContract.workflow.replaceAll('_', ' ')} · v${activeContract.draftVersion}` : t('contractsCreateFirst')}</small>
        </label>
        <button className="release" onClick={onCreate}>{t('contractsNew')}</button>
      </div>
    </div>
    <div className="contracts-grid">{contracts.map((contract) => <button className={`contract-tile ${contract.contractId === activeContractId ? 'active' : ''}`} onClick={() => onSelect(contract.contractId)} key={contract.contractId}>
      <div><span className="contract-domain">{contract.domain.toLocaleUpperCase()}</span><span className={`runtime-state ${contract.runtimeStatus.toLocaleLowerCase()}`}><i />{contract.runtimeStatus.replaceAll('_', ' ')}</span></div>
      <h3>{contract.name}</h3><p>{contract.workflow}</p>
      <dl><div><dt>{t('contractsScope')}</dt><dd>{contract.conceptScopeCount}</dd></div><div><dt>{t('contractsOntology')}</dt><dd>v{contract.ontologyVersion}</dd></div><div><dt>{t('contractsReleases')}</dt><dd>{contract.releaseCount}</dd></div></dl>
      <footer><span>{contract.latestRelease ? `v${contract.latestRelease.version}` : t('contractsNoRelease')}</span><time>{formatDate(contract.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}</time></footer>
    </button>)}</div>
  </section>
}
