import { createHash } from 'node:crypto'
import type {
  CompileRequest,
  ContextContract,
  IntentCandidate,
  IntentResolution,
  OperationDefinition,
} from '@lattice/contracts'

export interface IntentResolver {
  resolve(request: CompileRequest, contract: ContextContract): Promise<IntentResolution>
}

export interface EmbeddingProvider {
  readonly modelVersion: string
  embed(inputs: string[]): Promise<number[][]>
}

interface IntentDocument {
  operationId: string
  questionId?: string
  text: string
}

interface CachedIndex {
  indexDigest: string
  documents: IntentDocument[]
  vectors: number[][]
}

export class LexicalIntentResolver implements IntentResolver {
  async resolve(request: CompileRequest, contract: ContextContract): Promise<IntentResolution> {
    return resolveLexicalIntent(request, contract)
  }
}

export class HybridIntentResolver implements IntentResolver {
  private readonly embeddingProvider: EmbeddingProvider
  private readonly cache = new Map<string, Promise<CachedIndex>>()

  constructor(embeddingProvider: EmbeddingProvider) {
    this.embeddingProvider = embeddingProvider
  }

  async resolve(request: CompileRequest, contract: ContextContract): Promise<IntentResolution> {
    const lexical = resolveLexicalIntent(request, contract)
    try {
      const index = await this.indexFor(contract)
      const query = request.purpose?.trim()
        ? `${request.question.trim()}\nPurpose: ${request.purpose.trim()}`
        : request.question.trim()
      const [queryVector] = await this.embeddingProvider.embed([query])
      if (!queryVector || queryVector.length === 0) throw new Error('Embedding provider returned no query vector.')
      const semanticByOperation = semanticCandidates(queryVector, index)
      const lexicalByOperation = new Map(lexical.candidates.map((candidate) => [candidate.operationId, candidate]))
      const candidates = contract.operations.map((operation) => {
        const lexicalCandidate = lexicalByOperation.get(operation.id)
        const semanticCandidate = semanticByOperation.get(operation.id)
        const lexicalScore = lexicalCandidate?.lexicalScore ?? 0
        const semanticScore = semanticCandidate?.score ?? 0
        const aggregateScore = lexicalScore > 0
          ? Math.max(lexicalScore, roundScore(semanticScore * 0.75 + lexicalScore * 0.25))
          : semanticScore
        const rationale = [
          ...(lexicalCandidate?.rationale ?? []),
          ...(semanticCandidate ? [`Semantic similarity ${semanticCandidate.score.toFixed(3)} using ${this.embeddingProvider.modelVersion}.`] : []),
        ]
        return {
          operationId: operation.id,
          matchedQuestionIds: [...new Set([
            ...(lexicalCandidate?.matchedQuestionIds ?? []),
            ...(semanticCandidate?.matchedQuestionIds ?? []),
          ])],
          lexicalScore,
          semanticScore,
          aggregateScore,
          rationale,
        } satisfies IntentCandidate
      }).sort(compareCandidates).slice(0, 5)

      return {
        resolverVersion: 'hybrid-intent-v1',
        method: 'HYBRID',
        modelVersion: this.embeddingProvider.modelVersion,
        indexDigest: index.indexDigest,
        candidates,
      }
    } catch (error) {
      return {
        ...lexical,
        degradedReason: error instanceof Error
          ? 'Semantic resolver unavailable; lexical fallback applied.'
          : 'Semantic resolver failed; lexical fallback applied.',
      }
    }
  }

  private indexFor(contract: ContextContract): Promise<CachedIndex> {
    const cacheKey = `${contract.id}:${contract.digest}:${this.embeddingProvider.modelVersion}`
    const existing = this.cache.get(cacheKey)
    if (existing) return existing
    const created = this.buildIndex(contract)
    this.cache.set(cacheKey, created)
    created.catch(() => this.cache.delete(cacheKey))
    return created
  }

  private async buildIndex(contract: ContextContract): Promise<CachedIndex> {
    const documents = buildIntentDocuments(contract)
    const vectors = documents.length > 0
      ? await this.embeddingProvider.embed(documents.map((document) => document.text))
      : []
    if (vectors.length !== documents.length) {
      throw new Error(`Embedding provider returned ${vectors.length} vectors for ${documents.length} intent documents.`)
    }
    const dimensions = new Set(vectors.map((vector) => vector.length))
    if (dimensions.size > 1 || vectors.some((vector) => vector.length === 0 || vector.some((value) => !Number.isFinite(value)))) {
      throw new Error('Embedding provider returned inconsistent or invalid vectors.')
    }
    return {
      indexDigest: digestIntentIndex(contract, documents, this.embeddingProvider.modelVersion, vectors),
      documents,
      vectors,
    }
  }
}

export function resolveLexicalIntent(request: CompileRequest, contract: ContextContract): IntentResolution {
  const normalizedQuestion = normalize(request.question)
  const questionTokens = tokens(normalizedQuestion)
  const candidates = contract.operations.flatMap((operation) => {
    const linkedQuestions = contract.competencyQuestions.filter((question) => question.operationId === operation.id)
    const exactQuestion = linkedQuestions.find((question) => normalize(question.question) === normalizedQuestion)
    const matchedKeywords = operation.keywords.filter((keyword) => normalizedQuestion.includes(normalize(keyword)))
    const lexicalSurfaces = [
      operation.label,
      operation.description,
      ...linkedQuestions.map((question) => question.question),
    ]
    const overlapScore = Math.max(0, ...lexicalSurfaces.map((surface) => tokenOverlap(questionTokens, tokens(normalize(surface)))))
    const lexicalScore = exactQuestion
      ? 1
      : matchedKeywords.length > 0
        ? Math.min(0.99, 0.95 + matchedKeywords.reduce((count, keyword) => count + tokens(normalize(keyword)).size, 0) * 0.01)
        : overlapScore >= 0.5
          ? roundScore(overlapScore * 0.9)
          : 0
    if (lexicalScore === 0) return []
    const rationale = [
      ...(exactQuestion ? [`Exact governed question match: ${exactQuestion.id}.`] : []),
      ...(matchedKeywords.length > 0 ? [`Matched operation keyword${matchedKeywords.length === 1 ? '' : 's'}: ${matchedKeywords.join(', ')}.`] : []),
      ...(!exactQuestion && matchedKeywords.length === 0 ? [`Lexical token overlap ${overlapScore.toFixed(3)}.`] : []),
    ]
    return [{
      operationId: operation.id,
      matchedQuestionIds: exactQuestion ? [exactQuestion.id] : linkedQuestions.filter((question) => tokenOverlap(questionTokens, tokens(normalize(question.question))) >= 0.5).map((question) => question.id),
      lexicalScore,
      aggregateScore: lexicalScore,
      rationale,
    } satisfies IntentCandidate]
  }).sort(compareCandidates).slice(0, 5)

  return {
    resolverVersion: 'lexical-intent-v1',
    method: 'LEXICAL',
    indexDigest: digestIntentIndex(contract, buildIntentDocuments(contract), 'lexical'),
    candidates,
  }
}

function buildIntentDocuments(contract: ContextContract): IntentDocument[] {
  return contract.operations.flatMap((operation) => {
    const questions = contract.competencyQuestions.filter((question) => question.operationId === operation.id)
    const operationDocument: IntentDocument = {
      operationId: operation.id,
      text: operationText(operation, contract, questions.map((question) => question.question)),
    }
    return [
      operationDocument,
      ...questions.map((question) => ({
        operationId: operation.id,
        questionId: question.id,
        text: [
          question.question,
          `Expected answer: ${question.expectedAnswerShape}`,
          `Operation: ${operation.label}`,
          `Workflow: ${contract.workflow}`,
        ].join('\n'),
      })),
    ]
  })
}

function operationText(operation: OperationDefinition, contract: ContextContract, questions: string[]): string {
  return [
    `Operation: ${operation.label}`,
    operation.description,
    `Questions: ${questions.join(' | ')}`,
    `Expected result: ${operation.expectedResultSchema}`,
    `Keywords: ${operation.keywords.join(', ')}`,
    `Workflow: ${contract.workflow}`,
    `Contract purpose: ${contract.description}`,
    `Required context: ${operation.requiredEntityTypes.join(', ')}`,
    `Metrics: ${operation.metricIds.join(', ')}`,
  ].join('\n')
}

function semanticCandidates(queryVector: number[], index: CachedIndex): Map<string, { score: number; matchedQuestionIds: string[] }> {
  const scored = index.documents.map((document, indexPosition) => ({
    document,
    score: roundScore(Math.max(0, cosineSimilarity(queryVector, index.vectors[indexPosition] ?? []))),
  }))
  const byOperation = new Map<string, Array<{ document: IntentDocument; score: number }>>()
  for (const item of scored) {
    const current = byOperation.get(item.document.operationId) ?? []
    current.push(item)
    byOperation.set(item.document.operationId, current)
  }
  return new Map([...byOperation.entries()].map(([operationId, items]) => {
    const score = Math.max(0, ...items.map((item) => item.score))
    const matchedQuestionIds = items
      .filter((item) => item.document.questionId && item.score >= score - 0.03)
      .sort((left, right) => right.score - left.score)
      .map((item) => item.document.questionId!)
    return [operationId, { score, matchedQuestionIds }]
  }))
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0
    const rightValue = right[index] ?? 0
    dot += leftValue * rightValue
    leftMagnitude += leftValue * leftValue
    rightMagnitude += rightValue * rightValue
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude))
}

function tokenOverlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  const intersection = [...left].filter((token) => right.has(token)).length
  return intersection / Math.sqrt(left.size * right.size)
}

function tokens(value: string): Set<string> {
  return new Set(value.split(' ').filter((token) => token.length > 2 && !stopWords.has(token)))
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function digestIntentIndex(
  contract: ContextContract,
  documents: IntentDocument[],
  modelVersion: string,
  vectors?: number[][],
): string {
  return `sha256:${createHash('sha256').update(JSON.stringify({
    contractId: contract.id,
    contractDigest: contract.digest,
    modelVersion,
    documents,
    ...(vectors ? { vectors } : {}),
  })).digest('hex')}`
}

function compareCandidates(left: IntentCandidate, right: IntentCandidate): number {
  return right.aggregateScore - left.aggregateScore || left.operationId.localeCompare(right.operationId)
}

function roundScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

const stopWords = new Set([
  'and', 'are', 'can', 'for', 'from', 'how', 'into', 'our', 'the', 'this', 'what', 'when', 'where', 'which', 'who', 'with',
])
