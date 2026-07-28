import {
  HybridIntentResolver,
  LexicalIntentResolver,
  type EmbeddingProvider,
  type IntentResolver,
} from '@lattice/compiler-core'

interface EmbeddingResponse {
  data?: Array<{ index?: number; embedding?: unknown }>
  model?: string
  error?: { message?: string }
}

export class HttpEmbeddingProvider implements EmbeddingProvider {
  readonly modelVersion: string
  private readonly endpoint: string
  private readonly apiKey: string | undefined
  private readonly fetchImpl: typeof fetch

  constructor(input: {
    endpoint: string
    model: string
    apiKey?: string
    fetchImpl?: typeof fetch
  }) {
    this.endpoint = validateEndpoint(input.endpoint)
    this.modelVersion = input.model.trim()
    this.apiKey = input.apiKey?.trim() || undefined
    this.fetchImpl = input.fetchImpl ?? fetch
    if (!this.modelVersion) throw new Error('LATTICE_EMBEDDING_MODEL must not be empty.')
  }

  async embed(inputs: string[]): Promise<number[][]> {
    if (inputs.length === 0) return []
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: this.modelVersion, input: inputs, encoding_format: 'float' }),
      signal: AbortSignal.timeout(10_000),
    })
    const payload = await response.json() as EmbeddingResponse
    if (!response.ok) {
      throw new Error(`Embedding endpoint returned ${response.status}.`)
    }
    if (!Array.isArray(payload.data) || payload.data.length !== inputs.length) {
      throw new Error(`Embedding endpoint returned ${payload.data?.length ?? 0} vectors for ${inputs.length} inputs.`)
    }
    const vectors = [...payload.data]
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map((item) => {
        if (!Array.isArray(item.embedding) || item.embedding.length === 0 || item.embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
          throw new Error('Embedding endpoint returned an invalid vector.')
        }
        return item.embedding as number[]
      })
    const dimensions = new Set(vectors.map((vector) => vector.length))
    if (dimensions.size !== 1) throw new Error('Embedding endpoint returned vectors with inconsistent dimensions.')
    return vectors
  }
}

export function intentResolverFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): IntentResolver {
  const endpoint = environment.LATTICE_EMBEDDING_URL?.trim()
  const model = environment.LATTICE_EMBEDDING_MODEL?.trim()
  if (!endpoint && !model) return new LexicalIntentResolver()
  if (!endpoint || !model) {
    throw new Error('LATTICE_EMBEDDING_URL and LATTICE_EMBEDDING_MODEL must be configured together.')
  }
  return new HybridIntentResolver(new HttpEmbeddingProvider({
    endpoint,
    model,
    ...(environment.LATTICE_EMBEDDING_API_KEY ? { apiKey: environment.LATTICE_EMBEDDING_API_KEY } : {}),
    fetchImpl,
  }))
}

function validateEndpoint(value: string): string {
  const url = new URL(value)
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('LATTICE_EMBEDDING_URL must use HTTPS or an HTTP loopback address.')
  }
  return url.toString()
}
