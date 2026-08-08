import assert from 'node:assert/strict'
import test from 'node:test'
import { HybridIntentResolver, LexicalIntentResolver } from '@lattice/compiler-core'
import { HttpEmbeddingProvider, intentResolverFromEnvironment } from './embeddingProvider.js'

test('uses lexical resolution when no embedding endpoint is configured', () => {
  const resolver = intentResolverFromEnvironment({}, async () => new Response())
  assert.ok(resolver instanceof LexicalIntentResolver)
})

test('configures a hybrid resolver only when endpoint and model are both present', () => {
  const resolver = intentResolverFromEnvironment({
    LATTICE_EMBEDDING_URL: 'https://embeddings.example.test/v1/embeddings',
    LATTICE_EMBEDDING_MODEL: 'semantic-model-v1',
  }, async () => new Response())
  assert.ok(resolver instanceof HybridIntentResolver)

  assert.throws(
    () => intentResolverFromEnvironment({ LATTICE_EMBEDDING_URL: 'https://embeddings.example.test/v1/embeddings' }),
    /configured together/,
  )
})

test('validates and preserves embedding response order', async () => {
  let authorization = ''
  const provider = new HttpEmbeddingProvider({
    endpoint: 'https://embeddings.example.test/v1/embeddings',
    model: 'semantic-model-v1',
    apiKey: 'test-key',
    fetchImpl: async (_input, init) => {
      authorization = new Headers(init?.headers).get('Authorization') ?? ''
      return Response.json({
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
      })
    },
  })

  assert.deepEqual(await provider.embed(['first', 'second']), [[1, 0], [0, 1]])
  assert.equal(authorization, 'Bearer test-key')
})

test('rejects insecure non-loopback embedding endpoints', () => {
  assert.throws(() => new HttpEmbeddingProvider({
    endpoint: 'http://embeddings.example.test/v1/embeddings',
    model: 'semantic-model-v1',
  }), /HTTPS/)
})
