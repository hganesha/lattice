import type {
  CompetencyQuestion,
  ContextContract,
  ImpactLevel,
  OperationDefinition,
  RiskTier,
} from '@lattice/contracts'

type ImportRow = Record<string, unknown>

export interface QuestionImportItem {
  sourceRow: number
  question: CompetencyQuestion
  selected: boolean
  issues: string[]
}

export interface OperationImportItem {
  sourceRow: number
  operation: OperationDefinition
  selected: boolean
  existing: boolean
  issues: string[]
}

export interface QuestionImportProposal {
  sourceName: string
  format: 'TXT' | 'CSV' | 'JSONL' | 'XLSX'
  questions: QuestionImportItem[]
  operations: OperationImportItem[]
  warnings: string[]
}

export async function parseQuestionImport(file: File, contract: ContextContract): Promise<QuestionImportProposal> {
  const extension = file.name.split('.').at(-1)?.toLocaleLowerCase()
  if (!extension || !['txt', 'csv', 'jsonl', 'xlsx'].includes(extension)) {
    throw new Error('Choose a .txt, .csv, .jsonl, or .xlsx file.')
  }

  if (file.size > 5 * 1024 * 1024) throw new Error('Question imports are limited to 5 MB.')

  if (extension === 'xlsx') {
    const { default: readXlsxFile, readSheetNames } = await import('read-excel-file')
    const sheetNames = await readSheetNames(file)
    const questionSheetName = sheetNames.find((name) => normalizeKey(name) === 'questions') ?? sheetNames[0]
    if (!questionSheetName) throw new Error('The workbook does not contain a Questions sheet.')
    const operationSheetName = sheetNames.find((name) => normalizeKey(name) === 'operations')
    const questions = worksheetRows(await readXlsxFile(file, { sheet: questionSheetName }))
    const operations = operationSheetName ? worksheetRows(await readXlsxFile(file, { sheet: operationSheetName })) : []
    return buildProposal(file.name, 'XLSX', questions, operations, contract)
  }

  const text = await file.text()
  if (extension === 'txt') {
    const questions = text.split(/\r?\n/).map((question) => question.trim()).filter(Boolean).map((question) => ({ question }))
    return buildProposal(file.name, 'TXT', questions, [], contract)
  }

  if (extension === 'jsonl') {
    const questions: ImportRow[] = []
    const operations: ImportRow[] = []
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (!line.trim()) continue
      let row: unknown
      try {
        row = JSON.parse(line)
      } catch {
        throw new Error(`Line ${index + 1} is not valid JSON.`)
      }
      if (!isRecord(row)) throw new Error(`Line ${index + 1} must contain a JSON object.`)
      const nestedOperation = isRecord(row.operation) ? row.operation : undefined
      const nestedQuestion = isRecord(row.question) ? row.question : undefined
      const kind = String(readValue(row, ['recordType', 'type', 'kind']) ?? '').toLocaleLowerCase()
      if (nestedOperation || kind === 'operation') operations.push(nestedOperation ?? row)
      else questions.push(nestedQuestion ?? row)
    }
    return buildProposal(file.name, 'JSONL', questions, operations, contract)
  }

  const rows = parseCsv(text)
  if (rows.length === 0) throw new Error('The CSV file does not contain any rows.')
  const headers = rows[0]!
  const questions: ImportRow[] = []
  const operations: ImportRow[] = []
  for (const values of rows.slice(1)) {
    if (values.every((value) => !value.trim())) continue
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
    const kind = String(readValue(row, ['recordType', 'type', 'kind']) ?? '').toLocaleLowerCase()
    if (kind === 'operation') operations.push(row)
    else questions.push(row)
  }
  return buildProposal(file.name, 'CSV', questions, operations, contract)
}

export function applyQuestionImport(
  contract: ContextContract,
  proposal: QuestionImportProposal,
): ContextContract {
  const operations = proposal.operations.filter((item) => item.selected && !item.existing).map((item) => item.operation)
  const importedOperationIds = new Set(operations.map((operation) => operation.id))
  const availableOperationIds = new Set([...contract.operations.map((operation) => operation.id), ...importedOperationIds])
  const questions = proposal.questions
    .filter((item) => item.selected)
    .map((item) => ({
      ...item.question,
      operationId: availableOperationIds.has(item.question.operationId) ? item.question.operationId : '',
    }))

  return {
    ...contract,
    releaseStatus: 'UNPUBLISHED',
    operations: [...contract.operations, ...operations],
    competencyQuestions: [...contract.competencyQuestions, ...questions],
  }
}

function buildProposal(
  sourceName: string,
  format: QuestionImportProposal['format'],
  questionRows: ImportRow[],
  operationRows: ImportRow[],
  contract: ContextContract,
): QuestionImportProposal {
  if (questionRows.length === 0 && operationRows.length === 0) throw new Error('The file does not contain any question or operation records.')

  const warnings: string[] = []
  const existingOperationIds = new Set(contract.operations.map((operation) => operation.id))
  const operationIds = new Set(existingOperationIds)
  const operations = operationRows.map((row, index) => normalizeOperation(row, index + 2, contract, operationIds))
  const candidateOperations = [...contract.operations, ...operations.map((item) => item.operation)]
  const questionIds = new Set(contract.competencyQuestions.map((question) => question.id))
  const existingQuestionText = new Set(contract.competencyQuestions.map((question) => normalizeText(question.question)))
  const defaultOwner = contract.competencyQuestions.find((question) => question.owner.trim())?.owner ?? 'Context Governance'
  const questions = questionRows.map((row, index) => normalizeQuestion(
    row,
    index + (format === 'TXT' || format === 'JSONL' ? 1 : 2),
    defaultOwner,
    candidateOperations,
    questionIds,
    existingQuestionText,
  ))

  const missingDetails = questions.filter((item) => !item.question.expectedAnswerShape).length
  const unmapped = questions.filter((item) => !item.question.operationId).length
  const duplicateCount = questions.filter((item) => !item.selected).length
  if (missingDetails > 0) warnings.push(`${missingDetails} question${missingDetails === 1 ? ' needs' : 's need'} an expected answer shape.`)
  if (unmapped > 0) warnings.push(`${unmapped} question${unmapped === 1 ? ' needs' : 's need'} an operation mapping.`)
  if (duplicateCount > 0) warnings.push(`${duplicateCount} duplicate question${duplicateCount === 1 ? ' was' : 's were'} deselected.`)
  if (operations.some((item) => item.selected && item.operation.sourceBindingIds.length === 0)) {
    warnings.push('Imported operations without valid source bindings remain declared, not implemented.')
  }

  return { sourceName, format, questions, operations, warnings }
}

function normalizeQuestion(
  row: ImportRow,
  sourceRow: number,
  defaultOwner: string,
  operations: OperationDefinition[],
  ids: Set<string>,
  existingQuestionText: Set<string>,
): QuestionImportItem {
  const rawQuestion = readValue(row, ['question', 'text', 'competencyQuestion', 'decisionQuestion'])
  const questionText = typeof rawQuestion === 'string' ? rawQuestion.trim() : String(rawQuestion ?? '').trim()
  const issues: string[] = []
  if (!questionText) issues.push('Question text is required.')

  const requestedId = stringValue(readValue(row, ['id', 'questionId', 'question_id']))
  const id = uniqueId(requestedId || `cq-${slugify(questionText).slice(0, 42) || sourceRow}`, ids)
  ids.add(id)

  const rawImpact = stringValue(readValue(row, ['impact', 'impactLevel', 'priority'])).toLocaleUpperCase()
  const impact = isImpactLevel(rawImpact) ? rawImpact : 'MEDIUM'
  if (rawImpact && !isImpactLevel(rawImpact)) issues.push(`Unknown impact "${rawImpact}"; defaulted to MEDIUM.`)

  const requestedOperationId = stringValue(readValue(row, ['operationId', 'operation', 'operation_id', 'implementedOperation']))
  let operationId = operations.some((operation) => operation.id === requestedOperationId) ? requestedOperationId : ''
  if (requestedOperationId && !operationId) issues.push(`Operation "${requestedOperationId}" is not available.`)
  if (!operationId && !requestedOperationId && questionText) {
    const matches = operations.filter((operation) => operationMatchesQuestion(operation, questionText))
    if (matches.length === 1) {
      operationId = matches[0]!.id
      issues.push(`Suggested operation "${operationId}" from its label or keywords.`)
    }
  }

  const expectedAnswerShape = stringValue(readValue(row, [
    'expectedAnswerShape',
    'answerShape',
    'expected_answer_shape',
    'resultShape',
  ]))
  const owner = stringValue(readValue(row, ['owner', 'steward', 'responsible'])) || defaultOwner
  if (!expectedAnswerShape) issues.push('Expected answer shape needs review.')
  if (!operationId) issues.push('Operation mapping needs review.')

  const duplicate = existingQuestionText.has(normalizeText(questionText))
  if (duplicate && questionText) issues.push('An equivalent question already exists in the contract.')
  existingQuestionText.add(normalizeText(questionText))

  return {
    sourceRow,
    selected: Boolean(questionText) && !duplicate,
    issues,
    question: {
      id,
      question: questionText,
      expectedAnswerShape,
      impact,
      owner,
      testIds: [],
      operationId,
    },
  }
}

function normalizeOperation(
  row: ImportRow,
  sourceRow: number,
  contract: ContextContract,
  ids: Set<string>,
): OperationImportItem {
  const label = stringValue(readValue(row, ['label', 'name', 'operationLabel']))
  const requestedId = stringValue(readValue(row, ['id', 'operationId', 'operation_id']))
  const baseId = requestedId || `operation.${slugify(label) || sourceRow}`
  const existing = contract.operations.find((operation) => operation.id === baseId)
  const issues: string[] = []
  if (!label && !requestedId) issues.push('Operation label or ID is required.')
  if (existing) {
    return {
      sourceRow,
      existing: true,
      selected: false,
      issues: [`Operation "${baseId}" already exists and will be reused.`],
      operation: existing,
    }
  }

  const riskValue = stringValue(readValue(row, ['riskTier', 'risk', 'risk_tier'])).toLocaleUpperCase()
  const riskTier = isRiskTier(riskValue) ? riskValue : 'ANALYTICAL'
  if (riskValue && !isRiskTier(riskValue)) issues.push(`Unknown risk tier "${riskValue}"; defaulted to ANALYTICAL.`)

  const requiredEntityTypes = validReferences(listValue(readValue(row, ['requiredEntityTypes', 'entityTypes', 'required_entity_types'])), contract.entityTypes.map((type) => type.id), 'entity type', issues)
  const sourceBindingIds = validReferences(listValue(readValue(row, ['sourceBindingIds', 'bindings', 'source_binding_ids'])), contract.bindings.map((binding) => binding.id), 'source binding', issues)
  const metricIds = validReferences(listValue(readValue(row, ['metricIds', 'metrics', 'metric_ids'])), contract.metrics.map((metric) => metric.id), 'metric', issues)
  const relationshipPath = validReferences(listValue(readValue(row, ['relationshipPath', 'relationships', 'relationship_path'])), contract.relationshipTypes.map((relationship) => relationship.id), 'relationship', issues)
  const expectedResultSchema = stringValue(readValue(row, ['expectedResultSchema', 'resultSchema', 'expected_result_schema']))
  const keywords = listValue(readValue(row, ['keywords', 'matchingKeywords', 'matching_keywords']))
  if (!expectedResultSchema) issues.push('Expected result schema needs review.')
  if (keywords.length === 0) issues.push('Matching keywords need review.')
  if (requiredEntityTypes.length === 0) issues.push('At least one valid required entity type is needed.')
  if (sourceBindingIds.length === 0) issues.push('No valid source binding is configured; this operation is not yet implemented.')

  const id = uniqueId(baseId, ids)
  ids.add(id)
  return {
    sourceRow,
    existing: false,
    selected: Boolean(label || requestedId),
    issues,
    operation: {
      id,
      label: label || humanizeId(id),
      description: stringValue(readValue(row, ['description', 'purpose'])) || `Imported operation proposal for ${label || humanizeId(id)}.`,
      keywords,
      requiredEntityTypes,
      metricIds,
      relationshipPath,
      sourceBindingIds,
      riskTier,
      requiredPermissions: listValue(readValue(row, ['requiredPermissions', 'permissions', 'required_permissions'])),
      expectedResultSchema,
    },
  }
}

function validReferences(values: string[], validValues: string[], label: string, issues: string[]): string[] {
  const valid = new Set(validValues)
  const unknown = values.filter((value) => !valid.has(value))
  if (unknown.length > 0) issues.push(`Unknown ${label} reference${unknown.length === 1 ? '' : 's'} ignored: ${unknown.join(', ')}.`)
  return values.filter((value) => valid.has(value))
}

function operationMatchesQuestion(operation: OperationDefinition, question: string): boolean {
  const normalized = normalizeText(question)
  const candidates = [operation.label, ...operation.keywords].map(normalizeText).filter((value) => value.length >= 4)
  return candidates.some((candidate) => normalized.includes(candidate))
}

function readValue(row: ImportRow, aliases: string[]): unknown {
  const normalizedAliases = new Set(aliases.map(normalizeKey))
  const entry = Object.entries(row).find(([key]) => normalizedAliases.has(normalizeKey(key)))
  return entry?.[1]
}

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

function stringValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function listValue(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map(stringValue).filter(Boolean))]
  const text = stringValue(value)
  if (!text) return []
  return [...new Set(text.split(/[;,|]/).map((item) => item.trim()).filter(Boolean))]
}

function slugify(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function humanizeId(value: string): string {
  return value.split(/[._-]/).filter(Boolean).map((part) => part[0]?.toLocaleUpperCase() + part.slice(1)).join(' ')
}

function uniqueId(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base
  let suffix = 2
  while (existing.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

function isImpactLevel(value: string): value is ImpactLevel {
  return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(value)
}

function isRiskTier(value: string): value is RiskTier {
  return ['INFORMATIONAL', 'ANALYTICAL', 'PLANNING_DECISION', 'OPERATIONAL_ACTION'].includes(value)
}

function isRecord(value: unknown): value is ImportRow {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(value)
      value = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(value)
      rows.push(row)
      row = []
      value = ''
    } else {
      value += character
    }
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted value.')
  if (value || row.length > 0) {
    row.push(value)
    rows.push(row)
  }
  return rows
}

function worksheetRows(rows: Array<Array<unknown>>): ImportRow[] {
  const [headerRow, ...dataRows] = rows
  if (!headerRow) return []
  const headers = headerRow.map(stringValue)
  return dataRows
    .filter((row) => row.some((value) => stringValue(value)))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
}
