import { combineIntentCandidates, resolveLexicalIntent, type EmbeddingProvider, type IntentResolver, type SemanticCandidate } from '@lattice/compiler-core'
import type { CompileRequest, ContextContract, IntentResolution } from '@lattice/contracts'

/**
 * Semantic intent resolution backed by the persisted, release-scoped embedding index.
 *
 * The alternative — embedding a contract's whole corpus into process memory on first use — pays
 * the embedding cost again on every cold start and every replica, keeps an unbounded cache, and
 * cannot pin the embedding profile to the release it describes. The database schema already
 * models this properly: vectors belong to one immutable release, with the provider, model, and
 * dimensions fixed alongside them, so a release can never mix vectors from two embedding spaces.
 *
 * Only the query is embedded here. The corpus is embedded once when the release is published, by
 * the worker the migration provisions.
 */
export class PersistedIntentResolver implements IntentResolver {
  constructor(
    private readonly input: {
      projectUrl: URL
      publishableKey: string
      organizationId: string
      authorization: string
      embeddingProvider: EmbeddingProvider
      fetchImpl?: typeof fetch
    },
  ) {}

  async resolve(request: CompileRequest, contract: ContextContract): Promise<IntentResolution> {
    const lexical = resolveLexicalIntent(request, contract)
    try {
      const query = request.purpose?.trim()
        ? `${request.question.trim()}\nPurpose: ${request.purpose.trim()}`
        : request.question.trim()
      const [queryVector] = await this.input.embeddingProvider.embed([query])
      if (!queryVector?.length) throw new Error('Embedding provider returned no query vector.')

      const matches = await this.match(contract, queryVector)
      // An index that has not finished embedding is not an error: the release is simply not
      // searchable yet, and lexical resolution is a correct answer rather than a failure.
      if (matches.length === 0) {
        return { ...lexical, degradedReason: 'No persisted intent index is ready for this release; lexical resolution applied.' }
      }

      return combineIntentCandidates({
        lexical,
        contract,
        semanticByOperation: groupByOperation(matches),
        modelVersion: matches[0]!.model,
        indexDigest: matches[0]!.index_digest,
        resolverVersion: 'persisted-intent-v1',
      })
    } catch {
      // The sanitized reason is deliberate: a question and an API key must never reach a log
      // through a degradation message.
      return { ...lexical, degradedReason: 'Persisted intent index unavailable; lexical resolution applied.' }
    }
  }

  private async match(contract: ContextContract, queryVector: number[]): Promise<IntentMatch[]> {
    const url = new URL('/rest/v1/rpc/match_contract_intents', this.input.projectUrl)
    const response = await (this.input.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: {
        apikey: this.input.publishableKey,
        Authorization: this.input.authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        target_organization_id: this.input.organizationId,
        target_contract_id: contract.id,
        target_release_digest: contract.digest,
        query_embedding: queryVector,
        match_threshold: 0,
        match_count: 50,
      }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`INTENT_INDEX_QUERY_FAILED:${response.status}`)

    const rows = await response.json() as IntentMatch[]
    return Array.isArray(rows) ? rows.filter(isUsableMatch) : []
  }
}

interface IntentMatch {
  operation_id: string
  question_id: string | null
  document_kind: string
  similarity: number
  model: string
  index_digest: string
}

function isUsableMatch(row: IntentMatch): boolean {
  return Boolean(row?.operation_id)
    && typeof row.similarity === 'number'
    && Number.isFinite(row.similarity)
    && Boolean(row.model)
    && Boolean(row.index_digest)
}

/**
 * An operation's score is its best-matching document, and the questions credited are those
 * within a small margin of it — the same rule the in-memory index applies, so the compiler's
 * calibrated gates see identical numbers from either source.
 */
function groupByOperation(matches: IntentMatch[]): Map<string, SemanticCandidate> {
  const byOperation = new Map<string, IntentMatch[]>()
  for (const match of matches) {
    const current = byOperation.get(match.operation_id) ?? []
    current.push(match)
    byOperation.set(match.operation_id, current)
  }

  return new Map([...byOperation.entries()].map(([operationId, rows]) => {
    const score = clampScore(Math.max(...rows.map((row) => row.similarity)))
    const matchedQuestionIds = rows
      .filter((row) => row.question_id && clampScore(row.similarity) >= score - 0.03)
      .sort((left, right) => right.similarity - left.similarity)
      .map((row) => row.question_id!)
    return [operationId, { score, matchedQuestionIds }]
  }))
}

/** Cosine similarity is bounded to [-1, 1]; the compiler's gates assume a non-negative score. */
function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1_000_000) / 1_000_000
}
