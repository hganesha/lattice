import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { counterpartyRiskContract } from '@lattice/contracts'
import { applyQuestionImport, parseQuestionImport } from './questionImport'

describe('question import', () => {
  it('parses CSV questions, applies safe defaults, and reuses existing operations', async () => {
    const contract = structuredClone(counterpartyRiskContract)
    const operation = contract.operations[0]!
    const csv = [
      'question,expected answer shape,owner,impact,operation id',
      `"Which counterparties breach limits?","Rows of counterparties and breached limits",Credit Risk,HIGH,${operation.id}`,
      '"Which exposures need review?",,,,',
    ].join('\n')

    const proposal = await parseQuestionImport(textFile('questions.csv', csv, 'text/csv'), contract)

    expect(proposal.format).toBe('CSV')
    expect(proposal.questions).toHaveLength(2)
    expect(proposal.questions[0]?.question).toMatchObject({
      expectedAnswerShape: 'Rows of counterparties and breached limits',
      owner: 'Credit Risk',
      impact: 'HIGH',
      operationId: operation.id,
    })
    expect(proposal.questions[1]?.question.owner).toBe(contract.competencyQuestions[0]?.owner)
    expect(proposal.questions[1]?.question.impact).toBe('MEDIUM')
    expect(proposal.warnings).toContain('1 question needs an expected answer shape.')
  })

  it('imports mixed JSONL question and operation records without claiming an unbound operation is implemented', async () => {
    const contract = structuredClone(counterpartyRiskContract)
    const jsonl = [
      JSON.stringify({
        type: 'operation',
        id: 'risk.list_breaches',
        label: 'List breaches',
        description: 'List current governed limit breaches.',
        keywords: ['limit breaches'],
        requiredEntityTypes: [contract.entityTypes[0]?.id],
        expectedResultSchema: 'Breach[]',
      }),
      JSON.stringify({
        type: 'question',
        question: 'Which limit breaches require action?',
        expectedAnswerShape: 'Breach[]',
        owner: 'Credit Risk',
        impact: 'HIGH',
        operationId: 'risk.list_breaches',
      }),
    ].join('\n')

    const proposal = await parseQuestionImport(textFile('questions.jsonl', jsonl, 'application/x-ndjson'), contract)
    expect(proposal.operations).toHaveLength(1)
    expect(proposal.operations[0]?.operation.sourceBindingIds).toEqual([])
    expect(proposal.operations[0]?.issues).toContain('No valid source binding is configured; this operation is not yet implemented.')
    expect(proposal.questions[0]?.question.operationId).toBe('risk.list_breaches')

    const next = applyQuestionImport(contract, proposal)
    expect(next.operations.some((operation) => operation.id === 'risk.list_breaches')).toBe(true)
    expect(next.competencyQuestions.at(-1)?.operationId).toBe('risk.list_breaches')
    expect(next.releaseStatus).toBe('UNPUBLISHED')
  })

  it('reads Questions and Operations sheets from XLSX workbooks', async () => {
    const contract = structuredClone(counterpartyRiskContract)
    const bytes = workbookFile({
      Questions: [
        ['question', 'expectedAnswerShape', 'owner', 'impact', 'operationId'],
        ['What is the governed review queue?', 'Review item[]', 'Governance', 'MEDIUM', 'governance.review_queue'],
      ],
      Operations: [
        ['id', 'label', 'description', 'keywords', 'expectedResultSchema'],
        ['governance.review_queue', 'Review queue', 'Returns governed review items.', 'review queue', 'ReviewItem[]'],
      ],
    })

    const proposal = await parseQuestionImport(binaryFile('questions.xlsx', bytes), contract)

    expect(proposal.format).toBe('XLSX')
    expect(proposal.questions[0]?.question.question).toBe('What is the governed review queue?')
    expect(proposal.operations[0]?.operation.id).toBe('governance.review_queue')
  })

  it('deselects duplicate questions instead of overwriting the contract', async () => {
    const contract = structuredClone(counterpartyRiskContract)
    const existing = contract.competencyQuestions[0]!
    const proposal = await parseQuestionImport(textFile('questions.txt', `${existing.question}\nA new governed question?`), contract)

    expect(proposal.questions[0]?.selected).toBe(false)
    expect(proposal.questions[0]?.issues).toContain('An equivalent question already exists in the contract.')
    expect(proposal.questions[1]?.selected).toBe(true)
  })
})

function textFile(name: string, text: string, type = 'text/plain'): File {
  return new File([text], name, { type })
}

function binaryFile(name: string, bytes: ArrayBuffer): File {
  return new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

function workbookFile(sheets: Record<string, string[][]>): ArrayBuffer {
  const sheetEntries = Object.entries(sheets)
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetEntries.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`
  const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries.map(([name], index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`
  const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetEntries.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`
  const archive: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rootRelationships),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRelationships),
  }
  sheetEntries.forEach(([, rows], index) => {
    const sheetData = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`).join('')}</row>`).join('')
    archive[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData}</sheetData></worksheet>`)
  })
  const zipped = zipSync(archive)
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer
}

function columnName(index: number): string {
  let value = index + 1
  let name = ''
  while (value > 0) {
    value -= 1
    name = String.fromCharCode(65 + (value % 26)) + name
    value = Math.floor(value / 26)
  }
  return name
}

function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
