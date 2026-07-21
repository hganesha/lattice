import { useState } from 'react'
import type { CompileResponse, ContractRegistryEntry, ContractSummary } from '@lattice/contracts'
import { API_URL } from './api'
import { useMessages } from './i18n/messages'

interface WelcomeStudioProps {
  contracts: ContractSummary[]
  onClose: () => void
  onExplore: (contractId: string) => void
  onCreate: () => void
}

export function WelcomeStudio({ contracts, onClose, onExplore, onCreate }: WelcomeStudioProps) {
  const { t } = useMessages()
  const published = contracts.filter((contract) => contract.runtimeStatus === 'ACTIVE')
  const [tryingId, setTryingId] = useState('')
  const [result, setResult] = useState<{ contractId: string; decision: CompileResponse['decision'] }>()
  const [error, setError] = useState('')

  async function tryExample(contractId: string) {
    setTryingId(contractId)
    setError('')
    try {
      const entryResponse = await fetch(`${API_URL}/v1/contracts/${contractId}`)
      if (!entryResponse.ok) throw new Error()
      const entry = await entryResponse.json() as ContractRegistryEntry
      const question = entry.draft.competencyQuestions[0]?.question
      if (!question) throw new Error()
      const compileResponse = await fetch(`${API_URL}/v1/compile`, { method: 'POST', headers: { Authorization: 'Bearer studio-demo', 'Content-Type': 'application/json' }, body: JSON.stringify({ contractId, question }) })
      const compiled = await compileResponse.json() as CompileResponse
      if (!compiled.decision) throw new Error()
      setResult({ contractId, decision: compiled.decision })
    } catch {
      setError(t('welcomeTryFailed'))
    } finally {
      setTryingId('')
    }
  }

  return <div className="modal-backdrop welcome-backdrop" role="presentation">
    <section className="welcome-studio" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <button className="welcome-close" aria-label={t('welcomeClose')} onClick={onClose}>×</button>
      <span className="panel-kicker">{t('welcomeKicker').toLocaleUpperCase()}</span>
      <h1 id="welcome-title">{t('welcomeTitle')}</h1>
      <p className="welcome-lead">{t('welcomeDescription')}</p>
      <ol className="welcome-flow">
        <li><span>1</span><div><b>{t('welcomeOntology')}</b><small>{t('welcomeOntologyDetail')}</small></div></li>
        <li><span>2</span><div><b>{t('welcomeContract')}</b><small>{t('welcomeContractDetail')}</small></div></li>
        <li><span>3</span><div><b>{t('welcomeCompile')}</b><small>{t('welcomeCompileDetail')}</small></div></li>
        <li><span>4</span><div><b>{t('welcomeAudit')}</b><small>{t('welcomeAuditDetail')}</small></div></li>
      </ol>
      <div className="welcome-examples">
        <div><span className="panel-kicker">{t('welcomeTryNow').toLocaleUpperCase()}</span><h2>{t('welcomePublishedExamples')}</h2></div>
        {published.map((example) => <button onClick={() => void tryExample(example.contractId)} disabled={Boolean(tryingId)} key={example.contractId}><span>✦</span><div><b>{example.name}</b><small>{example.domain.replaceAll('_', ' ')} · v{example.latestRelease?.version ?? example.draftVersion}</small></div><em>{tryingId === example.contractId ? t('runtimeCompiling') : t('welcomeCompileExample')} →</em></button>)}
        {published.length === 0 && <p>{t('welcomeNoExamples')}</p>}
        {result && <div className="welcome-result"><span>✓</span><div><b>{t('welcomeCompileResult', { decision: result.decision.replaceAll('_', ' ') })}</b><small>{t('welcomeCompileResultDetail')}</small></div><button className="ghost" onClick={() => onExplore(result.contractId)}>{t('welcomeOpenCompiler')} →</button></div>}
        {error && <p className="wizard-error">{error}</p>}
      </div>
      <footer><button className="ghost" onClick={onClose}>{t('welcomeExploreOntology')}</button><button className="release" onClick={onCreate}>{t('welcomeCreateContract')} →</button></footer>
    </section>
  </div>
}
