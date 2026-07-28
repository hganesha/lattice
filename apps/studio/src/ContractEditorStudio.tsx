import type { CompetencyQuestion, ContextContract, ImpactLevel, OperationDefinition, RiskTier } from '@lattice/contracts'
import { useMessages, type MessageKey } from './i18n/messages'

interface ContractEditorStudioProps {
  contract: ContextContract
  onChange: (contract: ContextContract) => void
  onDirtyChange: (dirty: boolean) => void
  onBack: () => void
}

const impactLevels: ImpactLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const riskTiers: RiskTier[] = ['INFORMATIONAL', 'ANALYTICAL', 'PLANNING_DECISION', 'OPERATIONAL_ACTION']

export function ContractEditorStudio({ contract, onChange, onDirtyChange, onBack }: ContractEditorStudioProps) {
  const { t } = useMessages()
  const issues = definitionIssues(contract).map((key) => t(key))

  function stage(next: ContextContract) {
    onChange({ ...next, releaseStatus: 'UNPUBLISHED' })
    onDirtyChange(true)
  }

  function updateQuestion(id: string, patch: Partial<CompetencyQuestion>) {
    stage({ ...contract, competencyQuestions: contract.competencyQuestions.map((question) => question.id === id ? { ...question, ...patch } : question) })
  }

  function addQuestion() {
    const question: CompetencyQuestion = {
      id: uniqueId('question', contract.competencyQuestions.map((item) => item.id)),
      question: '',
      expectedAnswerShape: '',
      impact: 'MEDIUM',
      owner: contract.competencyQuestions[0]?.owner ?? '',
      testIds: [],
      operationId: contract.operations[0]?.id ?? '',
    }
    stage({ ...contract, competencyQuestions: [...contract.competencyQuestions, question] })
  }

  function removeQuestion(id: string) {
    stage({ ...contract, competencyQuestions: contract.competencyQuestions.filter((question) => question.id !== id) })
  }

  function updateOperation(id: string, patch: Partial<OperationDefinition>) {
    stage({ ...contract, operations: contract.operations.map((operation) => operation.id === id ? { ...operation, ...patch } : operation) })
  }

  function addOperation() {
    const operation: OperationDefinition = {
      id: uniqueId('operation', contract.operations.map((item) => item.id)),
      label: '',
      description: '',
      keywords: [],
      requiredEntityTypes: [],
      metricIds: [],
      relationshipPath: [],
      sourceBindingIds: [],
      riskTier: 'ANALYTICAL',
      requiredPermissions: [],
      expectedResultSchema: '',
    }
    stage({ ...contract, operations: [...contract.operations, operation] })
  }

  function removeOperation(id: string) {
    stage({
      ...contract,
      operations: contract.operations.filter((operation) => operation.id !== id),
      competencyQuestions: contract.competencyQuestions.map((question) => question.operationId === id ? { ...question, operationId: '' } : question),
    })
  }

  function toggleOperationValue(id: string, field: 'requiredEntityTypes' | 'sourceBindingIds', value: string) {
    const operation = contract.operations.find((item) => item.id === id)
    if (!operation) return
    const current = operation[field]
    updateOperation(id, { [field]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] })
  }

  return <section className="contract-editor-page">
    <div className="contract-editor-hero">
      <div>
        <button className="ghost" type="button" onClick={onBack}>← {t('navContracts')}</button>
        <span className="panel-kicker">{t('contractEditorKicker').toLocaleUpperCase()}</span>
        <h2>{t('contractEditorTitle')}</h2>
        <p>{t('contractEditorDescription')}</p>
      </div>
      <div className={`contract-definition-status ${issues.length > 0 ? 'incomplete' : 'ready'}`}>
        <span aria-hidden="true">{issues.length > 0 ? '!' : '✓'}</span>
        <div><b>{issues.length > 0 ? t('contractEditorIssues', { count: issues.length }) : t('contractEditorReady')}</b><small>{t('contractEditorSaveHint')}</small></div>
      </div>
    </div>

    <div className="contract-editor-layout">
      <main>
        <section className="contract-editor-section">
          <header><div><span className="panel-kicker">{t('contractEditorIdentity').toLocaleUpperCase()}</span><h3>{contract.name || t('contractEditorUntitled')}</h3></div><code>{contract.id}</code></header>
          <div className="contract-editor-fields contract-editor-identity-fields">
            <label>{t('wizardContractName')}<input value={contract.name} onChange={(event) => stage({ ...contract, name: event.target.value })} /></label>
            <label>{t('wizardDomain')}<input value={contract.domain} readOnly aria-readonly="true" /></label>
            <label className="wide">{t('wizardPurpose')}<textarea value={contract.description} onChange={(event) => stage({ ...contract, description: event.target.value })} /></label>
            <label className="wide">{t('wizardWorkflow')}<input value={contract.workflow} onChange={(event) => stage({ ...contract, workflow: event.target.value })} /></label>
          </div>
        </section>

        <section className="contract-editor-section">
          <header><div><span className="panel-kicker">{t('contractEditorQuestions').toLocaleUpperCase()}</span><h3>{t('contractEditorQuestionCount', { count: contract.competencyQuestions.length })}</h3></div><button className="ghost" type="button" onClick={addQuestion}>{t('contractEditorAddQuestion')}</button></header>
          <div className="contract-definition-list">
            {contract.competencyQuestions.map((question, index) => <article className="contract-question-card" key={question.id}>
              <div className="contract-definition-card-heading"><span>{t('wizardQuestionNumber', { number: String(index + 1).padStart(2, '0') }).toLocaleUpperCase()}</span><code>{question.id}</code><button type="button" onClick={() => removeQuestion(question.id)}>{t('commonRemove')}</button></div>
              <div className="contract-editor-fields">
                <label className="wide">{t('wizardDecisionQuestion')}<input value={question.question} onChange={(event) => updateQuestion(question.id, { question: event.target.value })} /></label>
                <label className="wide">{t('wizardAnswerShape')}<textarea value={question.expectedAnswerShape} onChange={(event) => updateQuestion(question.id, { expectedAnswerShape: event.target.value })} /></label>
                <label>{t('wizardOwner')}<input value={question.owner} onChange={(event) => updateQuestion(question.id, { owner: event.target.value })} /></label>
                <label>{t('wizardDecisionImpact')}<select value={question.impact} onChange={(event) => updateQuestion(question.id, { impact: event.target.value as ImpactLevel })}>{impactLevels.map((impact) => <option key={impact}>{impact}</option>)}</select></label>
                <label className="wide">{t('contractEditorMappedOperation')}<select value={question.operationId} onChange={(event) => updateQuestion(question.id, { operationId: event.target.value })}><option value="">{t('contractEditorChooseOperation')}</option>{contract.operations.map((operation) => <option value={operation.id} key={operation.id}>{operation.label || operation.id}</option>)}</select></label>
              </div>
            </article>)}
            {contract.competencyQuestions.length === 0 && <EmptyDefinition message={t('contractEditorNoQuestions')} action={t('contractEditorAddQuestion')} onAdd={addQuestion} />}
          </div>
        </section>

        <section className="contract-editor-section">
          <header><div><span className="panel-kicker">{t('contractEditorOperations').toLocaleUpperCase()}</span><h3>{t('contractEditorOperationCount', { count: contract.operations.length })}</h3></div><button className="ghost" type="button" onClick={addOperation}>{t('contractEditorAddOperation')}</button></header>
          <div className="contract-definition-list">
            {contract.operations.map((operation, index) => <article className="contract-operation-card" key={operation.id}>
              <div className="contract-definition-card-heading"><span>{t('contractEditorOperationNumber', { number: String(index + 1).padStart(2, '0') }).toLocaleUpperCase()}</span><code>{operation.id}</code><button type="button" onClick={() => removeOperation(operation.id)}>{t('commonRemove')}</button></div>
              <div className="contract-editor-fields">
                <label>{t('contractEditorOperationLabel')}<input value={operation.label} onChange={(event) => updateOperation(operation.id, { label: event.target.value })} /></label>
                <label>{t('contractEditorRiskTier')}<select value={operation.riskTier} onChange={(event) => updateOperation(operation.id, { riskTier: event.target.value as RiskTier })}>{riskTiers.map((tier) => <option key={tier}>{tier}</option>)}</select></label>
                <label className="wide">{t('contractEditorOperationDescription')}<textarea value={operation.description} onChange={(event) => updateOperation(operation.id, { description: event.target.value })} /></label>
                <label className="wide">{t('contractEditorKeywords')}<input value={operation.keywords.join(', ')} onChange={(event) => updateOperation(operation.id, { keywords: commaList(event.target.value) })} /><small>{t('contractEditorKeywordsHint')}</small></label>
                <label>{t('contractEditorResultSchema')}<input value={operation.expectedResultSchema} onChange={(event) => updateOperation(operation.id, { expectedResultSchema: event.target.value })} /></label>
                <label>{t('contractEditorPermissions')}<input value={operation.requiredPermissions.join(', ')} onChange={(event) => updateOperation(operation.id, { requiredPermissions: commaList(event.target.value) })} /></label>
              </div>
              <div className="contract-operation-scope">
                <fieldset><legend>{t('contractEditorContextTypes')}</legend><div>{contract.entityTypes.map((type) => <label key={type.id}><input type="checkbox" checked={operation.requiredEntityTypes.includes(type.id)} onChange={() => toggleOperationValue(operation.id, 'requiredEntityTypes', type.id)} /><span>{type.label}</span><code>{type.id}</code></label>)}</div></fieldset>
                <fieldset><legend>{t('contractEditorSourceBindings')}</legend><div>{contract.bindings.map((binding) => <label key={binding.id}><input type="checkbox" checked={operation.sourceBindingIds.includes(binding.id)} onChange={() => toggleOperationValue(operation.id, 'sourceBindingIds', binding.id)} /><span>{binding.sourceSystem}</span><code>{binding.id}</code></label>)}{contract.bindings.length === 0 && <p>{t('contractEditorNoBindings')}</p>}</div></fieldset>
              </div>
            </article>)}
            {contract.operations.length === 0 && <EmptyDefinition message={t('contractEditorNoOperations')} action={t('contractEditorAddOperation')} onAdd={addOperation} />}
          </div>
        </section>
      </main>

      <aside className="contract-editor-readiness">
        <span className="panel-kicker">{t('contractEditorReadiness').toLocaleUpperCase()}</span>
        <h3>{issues.length > 0 ? t('contractEditorNeedsAttention') : t('contractEditorReady')}</h3>
        <p>{t('contractEditorReadinessDescription')}</p>
        <ul>{issues.length > 0 ? issues.map((issue) => <li key={issue}><span>!</span>{issue}</li>) : <li className="ready"><span>✓</span>{t('contractEditorNoIssues')}</li>}</ul>
        <div><b>{t('contractEditorImmutableIds')}</b><p>{t('contractEditorImmutableIdsDescription')}</p></div>
      </aside>
    </div>
  </section>
}

function EmptyDefinition({ message, action, onAdd }: { message: string; action: string; onAdd: () => void }) {
  return <div className="contract-definition-empty"><span>◇</span><p>{message}</p><button className="release" type="button" onClick={onAdd}>{action}</button></div>
}

function commaList(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]
}

function uniqueId(prefix: string, existing: string[]): string {
  const base = `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  if (!existing.includes(base)) return base
  return uniqueId(prefix, existing)
}

export function definitionIssues(contract: ContextContract): MessageKey[] {
  const issues: MessageKey[] = []
  const operationIds = new Set(contract.operations.map((operation) => operation.id))
  const entityTypeIds = new Set(contract.entityTypes.map((type) => type.id))
  const bindingIds = new Set(contract.bindings.map((binding) => binding.id))
  if (!contract.name.trim() || !contract.description.trim() || !contract.workflow.trim()) issues.push('contractEditorIssueIdentity')
  if (contract.competencyQuestions.length === 0) issues.push('contractEditorIssueNoQuestions')
  if (contract.competencyQuestions.some((question) => !question.question.trim() || !question.expectedAnswerShape.trim() || !question.owner.trim())) issues.push('contractEditorIssueQuestionFields')
  if (contract.competencyQuestions.some((question) => !operationIds.has(question.operationId))) issues.push('contractEditorIssueQuestionMapping')
  if (contract.operations.length === 0) issues.push('contractEditorIssueNoOperations')
  if (contract.operations.some((operation) => !operation.label.trim() || !operation.description.trim() || operation.keywords.length === 0 || !operation.expectedResultSchema.trim())) issues.push('contractEditorIssueOperationFields')
  if (contract.operations.some((operation) => operation.requiredEntityTypes.length === 0 || operation.requiredEntityTypes.some((id) => !entityTypeIds.has(id)))) issues.push('contractEditorIssueContextTypes')
  if (contract.operations.some((operation) => operation.sourceBindingIds.length === 0 || operation.sourceBindingIds.some((id) => !bindingIds.has(id)))) issues.push('contractEditorIssueBindings')
  return issues
}
