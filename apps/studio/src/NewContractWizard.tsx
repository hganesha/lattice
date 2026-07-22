import { useEffect, useState, type FormEvent } from 'react'
import type { ContractRegistryEntry, ContractStarter, ImpactLevel, IndustryWorkspace } from '@lattice/contracts'
import { API_URL, apiAuthHeaders } from './api'
import { Brand } from './Brand'
import { useMessages } from './i18n/messages'
import { SelectOrCreateField } from './SelectOrCreateField'
import { contractSuggestionsFor } from './contractSuggestions'

interface NewContractWizardProps {
  onClose: () => void
  onCreated: (entry: ContractRegistryEntry) => void
  workspace?: IndustryWorkspace
}

interface QuestionDraft {
  id: string
  question: string
  expectedAnswerShape: string
  impact: ImpactLevel
}

export function NewContractWizard({ onClose, onCreated, workspace }: NewContractWizardProps) {
  const { t } = useMessages()
  const starters: Array<{ id: ContractStarter; icon: string; name: string; detail: string; objects: string }> = [
    { id: 'blank', icon: '◇', name: t('wizardStarterBlank'), detail: t('wizardStarterBlankDetail'), objects: t('wizardStarterCounts', { types: 0, relations: 0 }) },
    { id: 'financial-services', icon: 'FS', name: t('wizardStarterFinancialServices'), detail: t('wizardStarterFinancialServicesDetail'), objects: t('wizardStarterCounts', { types: 15, relations: 14 }) },
    { id: 'energy', icon: 'EN', name: t('wizardStarterEnergy'), detail: t('wizardStarterEnergyDetail'), objects: t('wizardStarterCounts', { types: 4, relations: 3 }) },
    { id: 'healthcare', icon: 'HC', name: t('wizardStarterHealthcare'), detail: t('wizardStarterHealthcareDetail'), objects: t('wizardStarterCounts', { types: 7, relations: 6 }) },
    { id: 'manufacturing', icon: 'MF', name: t('wizardStarterManufacturing'), detail: t('wizardStarterManufacturingDetail'), objects: t('wizardStarterCounts', { types: 8, relations: 7 }) },
    { id: 'legal', icon: 'LG', name: t('wizardStarterLegal'), detail: t('wizardStarterLegalDetail'), objects: t('wizardStarterCounts', { types: 6, relations: 5 }) },
    { id: 'insurance', icon: 'IN', name: t('wizardStarterInsurance'), detail: t('wizardStarterInsuranceDetail'), objects: t('wizardStarterCounts', { types: 7, relations: 6 }) },
    { id: 'real-estate', icon: 'RE', name: t('wizardStarterRealEstate'), detail: t('wizardStarterRealEstateDetail'), objects: t('wizardStarterCounts', { types: 8, relations: 8 }) },
  ]
  const [step, setStep] = useState(1)
  const [brief, setBrief] = useState({ name: '', description: '', domain: workspace?.domain ?? '', workflow: '', owner: '' })
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    { id: crypto.randomUUID(), question: '', expectedAnswerShape: '', impact: 'HIGH' },
  ])
  const [starter, setStarter] = useState<ContractStarter>('blank')
  const [conceptScope, setConceptScope] = useState<string[]>(() => recommendedScope(workspace))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const contractSuggestions = contractSuggestionsFor(brief.domain)

  const basicsValid = Object.values(brief).every((value) => value.trim().length > 0)
  const questionsValid = questions.length > 0 && questions.every((question) => question.question.trim() && question.expectedAnswerShape.trim())

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  function updateQuestion(id: string, patch: Partial<QuestionDraft>) {
    setQuestions((current) => current.map((question) => question.id === id ? { ...question, ...patch } : question))
  }

  function addQuestion() {
    setQuestions((current) => [...current, { id: crypto.randomUUID(), question: '', expectedAnswerShape: '', impact: 'MEDIUM' }])
  }

  function removeQuestion(id: string) {
    setQuestions((current) => current.filter((question) => question.id !== id))
  }

  async function createContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step < 3) {
      setStep((current) => current + 1)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/v1/contracts`, {
        method: 'POST',
        headers: { ...apiAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...brief,
          starter,
          ...(workspace ? { conceptScope } : {}),
          competencyQuestions: questions.map(({ question, expectedAnswerShape, impact }) => ({ question, expectedAnswerShape, impact })),
        }),
      })
      const payload = await response.json() as ContractRegistryEntry & { error?: string; message?: string }
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Creation failed (${response.status})`)
      onCreated(payload)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('wizardUnableCreate'))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="modal-backdrop wizard-backdrop" role="presentation">
    <section className="contract-wizard" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <aside className="wizard-rail">
        <Brand />
        <div className="wizard-rail-copy"><span>{t('wizardNewContract').toLocaleUpperCase()}</span><h2>{t('wizardDecisionsTitle')}</h2><p>{t('wizardDecisionsDescription')}</p></div>
        <ol>
          <WizardStep number={1} label={t('wizardStepBrief')} detail={t('wizardStepBriefDetail')} current={step} />
          <WizardStep number={2} label={t('wizardStepQuestions')} detail={t('wizardStepQuestionsDetail')} current={step} />
          <WizardStep number={3} label={t('wizardStepStarting')} detail={t('wizardStepStartingDetail')} current={step} />
        </ol>
        <div className="wizard-principle"><span>{t('wizardPrinciple').toLocaleUpperCase()}</span><b>{t('wizardContractsBeforeGraphs')}</b></div>
      </aside>

      <form className="wizard-main" onSubmit={(event) => void createContract(event)}>
        <div className="wizard-header"><div><span>{t('wizardStepOf', { step, total: 3 }).toLocaleUpperCase()}</span><h1 id="wizard-title">{step === 1 ? t('wizardDefineContract') : step === 2 ? t('wizardAddQuestions') : t('wizardChooseStarting')}</h1><p>{step === 1 ? t('wizardDefineDescription') : step === 2 ? t('wizardQuestionsDescription') : t('wizardStartingDescription')}</p></div><button type="button" aria-label={t('wizardClose')} onClick={onClose}>×</button></div>

        <div className="wizard-content">
          {step === 1 && <div className="wizard-fields">
            <label>{t('wizardContractName')}<input autoFocus required value={brief.name} onChange={(event) => setBrief({ ...brief, name: event.target.value })} placeholder={t('wizardContractNamePlaceholder')} /></label>
            <label>{t('wizardPurpose')}<textarea required value={brief.description} onChange={(event) => setBrief({ ...brief, description: event.target.value })} placeholder={t('wizardPurposePlaceholder')} /></label>
            {!workspace && <label>{t('wizardDomain')}<input required value={brief.domain} onChange={(event) => setBrief({ ...brief, domain: event.target.value })} placeholder={t('wizardHealthcarePlaceholder')} /></label>}
            <div className="form-split">
              <SelectOrCreateField label={t('wizardWorkflow')} value={brief.workflow} options={contractSuggestions.workflows} placeholder={t('wizardSelectWorkflow')} addLabel={t('wizardAddWorkflow')} customLabel={t('wizardCustomWorkflow')} customPlaceholder={t('wizardWorkflowPlaceholder')} required onChange={(workflow) => setBrief({ ...brief, workflow })} />
              <SelectOrCreateField label={t('wizardOwner')} value={brief.owner} options={contractSuggestions.owners} placeholder={t('wizardSelectOwner')} addLabel={t('wizardAddOwner')} customLabel={t('wizardCustomOwner')} customPlaceholder={t('wizardOwnerPlaceholder')} required onChange={(owner) => setBrief({ ...brief, owner })} />
            </div>
          </div>}

          {step === 2 && <div className="question-editor">
            {questions.map((question, questionIndex) => <section className="question-draft" key={question.id}>
              <div className="question-number"><span>{t('wizardQuestionNumber', { number: String(questionIndex + 1).padStart(2, '0') }).toLocaleUpperCase()}</span>{questions.length > 1 && <button type="button" onClick={() => removeQuestion(question.id)}>{t('commonRemove')}</button>}</div>
              <label>{t('wizardDecisionQuestion')}<input autoFocus={questionIndex === 0} required value={question.question} onChange={(event) => updateQuestion(question.id, { question: event.target.value })} placeholder={t('wizardDecisionQuestionPlaceholder')} /></label>
              <label>{t('wizardAnswerShape')}<textarea required value={question.expectedAnswerShape} onChange={(event) => updateQuestion(question.id, { expectedAnswerShape: event.target.value })} placeholder={t('wizardAnswerShapePlaceholder')} /></label>
              <label>{t('wizardDecisionImpact')}<select value={question.impact} onChange={(event) => updateQuestion(question.id, { impact: event.target.value as ImpactLevel })}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label>
            </section>)}
            <button className="add-question" type="button" onClick={addQuestion}>{t('wizardAddAnotherQuestion')}</button>
          </div>}

          {step === 3 && <div className="starter-grid">
            {workspace ? <div className="concept-scope-picker"><header><div><span className="starter-icon">◎</span><span><b>{workspace.ontology.name}</b><small>{t('wizardSharedOntologyDetail')}</small></span></div><em>{t('wizardScopeSelected', { selected: conceptScope.length, total: workspace.ontology.entityTypes.length })}</em></header><div className="scope-presets"><button type="button" onClick={() => setConceptScope(recommendedScope(workspace))}>{t('wizardScopeRecommended')}</button><button type="button" onClick={() => setConceptScope(workspace.ontology.entityTypes.map((type) => type.id))}>{t('wizardScopeEntire')}</button><button type="button" onClick={() => setConceptScope([])}>{t('wizardScopeClear')}</button></div><div className="scope-options">{workspace.ontology.entityTypes.map((type) => <label key={type.id}><input type="checkbox" checked={conceptScope.includes(type.id)} onChange={() => setConceptScope((current) => current.includes(type.id) ? current.filter((id) => id !== type.id) : [...current, type.id])} /><span className="starter-icon">{type.icon}</span><span><b>{type.label}</b><small>{type.group} · {type.properties.length} properties</small></span></label>)}</div></div> : starters.map((option) => <label className={`starter-card ${starter === option.id ? 'selected' : ''}`} key={option.id}><input type="radio" name="starter" value={option.id} checked={starter === option.id} onChange={() => setStarter(option.id)} /><span className="starter-icon">{option.icon}</span><span><b>{option.name}</b><small>{option.detail}</small><em>{option.objects}</em></span><i>{starter === option.id ? '✓' : ''}</i></label>)}
            <div className="starter-note"><span>⌁</span><p><b>{t('wizardStarterOwnership')}</b> {t('wizardStarterNote')}</p></div>
          </div>}
          {error && <div className="wizard-error" role="alert">{error}</div>}
        </div>

        <footer className="wizard-footer"><button className="ghost" type="button" onClick={step === 1 ? onClose : () => setStep((current) => current - 1)}>{step === 1 ? t('commonCancel') : `← ${t('commonBack')}`}</button><div><span>{step === 1 ? t('wizardNextQuestions') : step === 2 ? t('wizardNextStarting') : t('wizardStarterSelected', { name: workspace?.ontology.name ?? starters.find((option) => option.id === starter)?.name ?? '' })}</span><button className="release" type="submit" disabled={submitting || (step === 1 && !basicsValid) || (step === 2 && !questionsValid) || (step === 3 && Boolean(workspace) && conceptScope.length === 0)}>{submitting ? t('wizardCreating') : step < 3 ? t('wizardContinue') : t('wizardCreateContract')}</button></div></footer>
      </form>
    </section>
  </div>
}

function recommendedScope(workspace?: IndustryWorkspace): string[] {
  if (!workspace) return []
  const preferredCore = new Set(['person', 'organization', 'policy'])
  const core = workspace.ontology.entityTypes.filter((type) => preferredCore.has(type.id))
  const industry = workspace.ontology.entityTypes.filter((type) => type.group !== 'Core foundation').slice(0, 5)
  return [...new Set([...core, ...industry].map((type) => type.id))]
}

function WizardStep({ number, label, detail, current }: { number: number; label: string; detail: string; current: number }) {
  const state = number === current ? 'active' : number < current ? 'complete' : ''
  return <li className={state}><span>{number < current ? '✓' : number}</span><div><b>{label}</b><small>{detail}</small></div></li>
}
