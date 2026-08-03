import assert from 'node:assert/strict'
import test from 'node:test'
import { counterpartyRiskContract } from '@lattice/contracts'
import { PersistedIntentResolver } from './persistedIntentIndex.js'

const operationId = counterpartyRiskContract.operations[0]!.id
const question = { question: 'How exposed are we if Arcadia Capital defaults?' }

interface StubEmbeddingProvider {
  modelVersion: string
  embed: (inputs: string[]) => Promise<number[][]>
}

const embeddingProvider: StubEmbeddingProvider = { modelVersion: 'test-model', embed: async () => [[0.1, 0.2, 0.3]] }

function resolverWith(respond: (body: Record<string, unknown>) => Response, provider: StubEmbeddingProvider = embeddingProvider) {
  const calls: Array<{ url: URL; headers: Headers; body: Record<string, unknown> }> = []
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    calls.push({ url: new URL(String(input)), headers: new Headers(init?.headers), body })
    return respond(body)
  }) as typeof fetch

  const resolver = new PersistedIntentResolver({
    projectUrl: new URL('https://project.supabase.co'),
    publishableKey: 'sb_publishable_example',
    organizationId: '78dc4be7-cd24-43ad-97f8-83cddfbf43a0',
    authorization: 'Bearer user-token',
    embeddingProvider: provider,
    fetchImpl,
  })
  return { resolver, calls }
}

function match(overrides: Record<string, unknown> = {}) {
  return {
    operation_id: operationId,
    question_id: null,
    document_kind: 'OPERATION',
    similarity: 0.91,
    model: 'openai/text-embedding-3-small',
    index_digest: 'sha256:index',
    ...overrides,
  }
}

test('queries the release-scoped index under the caller own token', async () => {
  const { resolver, calls } = resolverWith(() => Response.json([match()]))

  await resolver.resolve(question, counterpartyRiskContract)

  assert.equal(calls[0]?.url.pathname, '/rest/v1/rpc/match_contract_intents')
  assert.equal(calls[0]?.headers.get('authorization'), 'Bearer user-token')
  assert.equal(calls[0]?.body.target_contract_id, counterpartyRiskContract.id)
  // Pinned to the exact release, so vectors from another release can never be searched.
  assert.equal(calls[0]?.body.target_release_digest, counterpartyRiskContract.digest)
  assert.equal(calls[0]?.body.target_organization_id, '78dc4be7-cd24-43ad-97f8-83cddfbf43a0')
})

test('reports the model and index digest the database returned, not a local guess', async () => {
  const { resolver } = resolverWith(() => Response.json([match()]))

  const resolution = await resolver.resolve(question, counterpartyRiskContract)

  assert.equal(resolution.method, 'HYBRID')
  assert.equal(resolution.resolverVersion, 'persisted-intent-v1')
  assert.equal(resolution.modelVersion, 'openai/text-embedding-3-small')
  assert.equal(resolution.indexDigest, 'sha256:index')
  assert.equal(resolution.degradedReason, undefined)
})

test('an operation scores as its best matching document', async () => {
  const { resolver } = resolverWith(() => Response.json([
    match({ similarity: 0.42 }),
    match({ similarity: 0.88, question_id: 'cq-1', document_kind: 'QUESTION' }),
  ]))

  const resolution = await resolver.resolve(question, counterpartyRiskContract)
  const candidate = resolution.candidates.find((item) => item.operationId === operationId)

  assert.equal(candidate?.semanticScore, 0.88)
  assert.deepEqual(candidate?.matchedQuestionIds, ['cq-1'])
})

test('a release whose index is not ready resolves lexically rather than failing', async () => {
  const { resolver } = resolverWith(() => Response.json([]))

  const resolution = await resolver.resolve(question, counterpartyRiskContract)

  assert.equal(resolution.method, 'LEXICAL')
  assert.match(resolution.degradedReason ?? '', /No persisted intent index is ready/)
})

test('an unreachable index degrades to lexical without leaking the question', async () => {
  const { resolver } = resolverWith(() => new Response('nope', { status: 500 }))

  const resolution = await resolver.resolve(question, counterpartyRiskContract)

  assert.equal(resolution.method, 'LEXICAL')
  assert.match(resolution.degradedReason ?? '', /Persisted intent index unavailable/)
  assert.equal(resolution.degradedReason?.includes('Arcadia'), false)
})

test('a failing embedding provider degrades rather than throwing into the compile path', async () => {
  const failing = { modelVersion: 'test-model', embed: async () => { throw new Error('embedding endpoint down') } }
  const { resolver } = resolverWith(() => Response.json([match()]), failing)

  const resolution = await resolver.resolve(question, counterpartyRiskContract)

  assert.equal(resolution.method, 'LEXICAL')
  assert.match(resolution.degradedReason ?? '', /unavailable/)
})

test('malformed rows are discarded rather than scored', async () => {
  const { resolver } = resolverWith(() => Response.json([
    { operation_id: '', similarity: 0.99, model: 'm', index_digest: 'd' },
    { operation_id: operationId, similarity: Number.NaN, model: 'm', index_digest: 'd' },
  ]))

  const resolution = await resolver.resolve(question, counterpartyRiskContract)
  assert.equal(resolution.method, 'LEXICAL')
})

test('a similarity outside the valid range cannot inflate a score past the compiler gates', async () => {
  const { resolver } = resolverWith(() => Response.json([match({ similarity: 4.2 })]))

  const resolution = await resolver.resolve(question, counterpartyRiskContract)
  const candidate = resolution.candidates.find((item) => item.operationId === operationId)

  assert.equal(candidate?.semanticScore, 1)
})

test('the stated purpose is embedded with the question, matching the in-memory resolver', async () => {
  const embedded: string[][] = []
  const recording = { modelVersion: 'test-model', embed: async (inputs: string[]) => { embedded.push(inputs); return [[0.1]] } }
  const { resolver } = resolverWith(() => Response.json([match()]), recording)

  await resolver.resolve({ ...question, purpose: 'Quarterly limit review' }, counterpartyRiskContract)

  assert.match(embedded[0]?.[0] ?? '', /Purpose: Quarterly limit review/)
})
