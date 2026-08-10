import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Overlay } from './Overlay'
import type { ContextContract, ImpactLevel } from '@lattice/contracts'
import { useMessages } from './i18n/messages'
import {
  applyQuestionImport,
  parseQuestionImport,
  type QuestionImportItem,
  type QuestionImportProposal,
} from './questionImport'

interface QuestionImportDialogProps {
  contract: ContextContract
  onClose: () => void
  onApply: (contract: ContextContract, summary: string) => void
}

const impactLevels: ImpactLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

export function QuestionImportDialog({ contract, onClose, onApply }: QuestionImportDialogProps) {
  const { t } = useMessages()
  const [proposal, setProposal] = useState<QuestionImportProposal>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const selectedQuestionCount = proposal?.questions.filter((item) => item.selected).length ?? 0
  const selectedOperationCount = proposal?.operations.filter((item) => item.selected && !item.existing).length ?? 0
  const availableOperations = useMemo(() => [
    ...contract.operations,
    ...(proposal?.operations.filter((item) => item.selected && !item.existing).map((item) => item.operation) ?? []),
  ], [contract.operations, proposal])

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError('')
    try {
      setProposal(await parseQuestionImport(file, contract))
    } catch (caught) {
      setProposal(undefined)
      setError(caught instanceof Error ? caught.message : t('questionImportReadFailed'))
    } finally {
      setLoading(false)
      event.target.value = ''
    }
  }

  function updateQuestion(index: number, item: QuestionImportItem) {
    setProposal((current) => current ? {
      ...current,
      questions: current.questions.map((question, itemIndex) => itemIndex === index ? item : question),
    } : current)
  }

  function toggleOperation(index: number, selected: boolean) {
    setProposal((current) => current ? {
      ...current,
      operations: current.operations.map((operation, itemIndex) => itemIndex === index ? { ...operation, selected } : operation),
    } : current)
  }

  function applyImport() {
    if (!proposal || selectedQuestionCount === 0) return
    const next = applyQuestionImport(contract, proposal)
    onApply(next, t('questionImportAppliedSummary', {
      questions: selectedQuestionCount,
      operations: selectedOperationCount,
    }))
  }

  return <Overlay variant="dialog" bare dismissOnBackdrop={false} onClose={onClose}>
    <section className="question-import-dialog" role="dialog" aria-modal="true" aria-labelledby="question-import-title">
      <header>
        <div>
          <span className="panel-kicker">{t('questionImportKicker')}</span>
          <h1 id="question-import-title">{t('questionImportTitle')}</h1>
          <p>{t('questionImportDescription')}</p>
        </div>
        <button type="button" aria-label={t('questionImportClose')} onClick={onClose}>×</button>
      </header>

      {!proposal ? <main className="question-import-source">
        <label className="question-import-drop">
          <input type="file" accept=".txt,.csv,.jsonl,.xlsx,text/plain,text/csv,application/x-ndjson,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void readFile(event)} />
          <span>⇧</span>
          <b>{loading ? t('questionImportReading') : t('questionImportChooseFile')}</b>
          <small>{t('questionImportFormats')}</small>
        </label>
        <div className="question-import-guidance">
          <article><b>{t('questionImportQuestions')}</b><p>{t('questionImportQuestionColumns')}</p></article>
          <article><b>{t('questionImportOperations')}</b><p>{t('questionImportOperationColumns')}</p></article>
          <article><b>{t('questionImportDefaults')}</b><p>{t('questionImportDefaultsDescription')}</p></article>
        </div>
        {error && <div className="wizard-error" role="alert">{error}</div>}
      </main> : <main className="question-import-review">
        <div className="question-import-summary">
          <div><span className="panel-kicker">{proposal.format}</span><h2>{proposal.sourceName}</h2></div>
          <dl>
            <div><dt>{t('questionImportQuestions')}</dt><dd>{selectedQuestionCount} / {proposal.questions.length}</dd></div>
            <div><dt>{t('questionImportOperations')}</dt><dd>{selectedOperationCount}</dd></div>
          </dl>
        </div>

        {proposal.warnings.length > 0 && <div className="question-import-warnings">{proposal.warnings.map((warning) => <p key={warning}>! {warning}</p>)}</div>}

        {proposal.operations.length > 0 && <section className="question-import-operations">
          <div className="question-import-section-heading"><div><span className="panel-kicker">{t('questionImportOperationProposals')}</span><h2>{t('questionImportOperationCount', { count: proposal.operations.length })}</h2></div><p>{t('questionImportDeclaredWarning')}</p></div>
          {proposal.operations.map((item, index) => <label className={`question-import-operation ${item.selected ? 'selected' : ''}`} key={`${item.operation.id}-${item.sourceRow}`}>
            <input type="checkbox" checked={item.selected || item.existing} disabled={item.existing} onChange={(event) => toggleOperation(index, event.target.checked)} />
            <span><b>{item.operation.label}</b><code>{item.operation.id}</code><small>{item.existing ? t('questionImportExistingOperation') : item.operation.sourceBindingIds.length > 0 ? t('questionImportBoundOperation') : t('questionImportDeclaredOperation')}</small></span>
            <em>{item.operation.riskTier.replaceAll('_', ' ')}</em>
            {item.issues.length > 0 && <ul>{item.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
          </label>)}
        </section>}

        <section className="question-import-questions">
          <div className="question-import-section-heading"><div><span className="panel-kicker">{t('questionImportQuestionProposals')}</span><h2>{t('questionImportQuestionCount', { count: proposal.questions.length })}</h2></div><p>{t('questionImportReviewHint')}</p></div>
          {proposal.questions.map((item, index) => {
            const issues = liveQuestionIssues(item)
            return <article className={`question-import-question ${item.selected ? 'selected' : ''}`} key={`${item.question.id}-${item.sourceRow}`}>
              <div className="question-import-question-heading">
                <label><input type="checkbox" checked={item.selected} disabled={!item.question.question} onChange={(event) => updateQuestion(index, { ...item, selected: event.target.checked })} /><span>{t('questionImportRow', { row: item.sourceRow })}</span></label>
                <code>{item.question.id}</code>
              </div>
              <div className="question-import-fields">
                <label className="wide">{t('wizardDecisionQuestion')}<textarea value={item.question.question} onChange={(event) => updateQuestion(index, { ...item, question: { ...item.question, question: event.target.value } })} /></label>
                <label className="wide">{t('wizardAnswerShape')}<textarea value={item.question.expectedAnswerShape} placeholder={t('questionImportNeedsReview')} onChange={(event) => updateQuestion(index, { ...item, question: { ...item.question, expectedAnswerShape: event.target.value } })} /></label>
                <label>{t('wizardOwner')}<input value={item.question.owner} onChange={(event) => updateQuestion(index, { ...item, question: { ...item.question, owner: event.target.value } })} /></label>
                <label>{t('wizardDecisionImpact')}<select value={item.question.impact} onChange={(event) => updateQuestion(index, { ...item, question: { ...item.question, impact: event.target.value as ImpactLevel } })}>{impactLevels.map((impact) => <option key={impact}>{impact}</option>)}</select></label>
                <label className="wide">{t('contractEditorMappedOperation')}<select value={item.question.operationId} onChange={(event) => updateQuestion(index, { ...item, question: { ...item.question, operationId: event.target.value } })}><option value="">{t('contractEditorChooseOperation')}</option>{availableOperations.map((operation) => <option value={operation.id} key={operation.id}>{operation.label || operation.id}</option>)}</select></label>
              </div>
              {issues.length > 0 && <ul className="question-import-item-issues">{issues.map((issue) => <li key={issue}>! {issue}</li>)}</ul>}
            </article>
          })}
        </section>
      </main>}

      <footer>
        <div>
          {proposal && <button className="ghost" type="button" onClick={() => { setProposal(undefined); setError('') }}>{t('questionImportChooseAnother')}</button>}
          <span>{proposal ? t('questionImportReviewLocal') : t('questionImportNonDestructive')}</span>
        </div>
        <div><button className="ghost" type="button" onClick={onClose}>{t('commonCancel')}</button>{proposal && <button className="release" type="button" disabled={selectedQuestionCount === 0} onClick={applyImport}>{t('questionImportApply', { count: selectedQuestionCount })}</button>}</div>
      </footer>
    </section>
  </Overlay>
}

function liveQuestionIssues(item: QuestionImportItem): string[] {
  const issues = item.issues.filter((issue) => !issue.startsWith('Expected answer shape needs') && !issue.startsWith('Operation mapping needs'))
  if (!item.question.expectedAnswerShape.trim()) issues.push('Expected answer shape needs review.')
  if (!item.question.operationId) issues.push('Operation mapping needs review.')
  if (!item.question.owner.trim()) issues.push('Owner needs review.')
  return [...new Set(issues)]
}
