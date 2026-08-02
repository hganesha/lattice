import type { LatticeMcpConfig } from './config.js'

export const REQUEST_TIMEOUT_MS = 30_000

export interface ContextApiResult<T> {
  status: number
  ok: boolean
  body: T
}

/**
 * Thin client over the Context API.
 *
 * Deliberately does not throw on a non-2xx status: most of this API's interesting answers are
 * non-2xx by design — a clarification request is a 422, an approval requirement is a 202 — and
 * an agent needs the body either way. Only transport failures raise.
 */
export class ContextApiClient {
  constructor(
    private readonly config: LatticeMcpConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async get<T>(path: string, query: Record<string, string | undefined> = {}): Promise<ContextApiResult<T>> {
    const url = new URL(path, this.config.apiUrl)
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value)
    }
    return this.send<T>(url, 'GET')
  }

  async post<T>(path: string, body: unknown): Promise<ContextApiResult<T>> {
    return this.send<T>(new URL(path, this.config.apiUrl), 'POST', body)
  }

  private async send<T>(url: URL, method: 'GET' | 'POST', body?: unknown): Promise<ContextApiResult<T>> {
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(this.config.organizationId ? { 'X-Lattice-Organization': this.config.organizationId } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (cause) {
      throw new ContextApiUnreachableError(url, cause)
    }

    const text = await response.text()
    let parsed: unknown = undefined
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error(`The Context API returned a non-JSON body with status ${response.status}.`)
      }
    }
    return { status: response.status, ok: response.ok, body: parsed as T }
  }
}

export class ContextApiUnreachableError extends Error {
  constructor(url: URL, readonly cause: unknown) {
    super(`Could not reach the Context API at ${url.origin}. Check LATTICE_API_URL and that the service is running.`)
    this.name = 'ContextApiUnreachableError'
  }
}

/**
 * Turns an API failure into something an agent can act on rather than a bare status code.
 * The API's own `message` is included when present; it is written for operators and never
 * carries secrets or source values.
 */
export function explainFailure(result: ContextApiResult<{ error?: string; message?: string; issues?: string[] }>): string {
  const code = result.body?.error ?? `HTTP_${result.status}`
  const detail = result.body?.message ? ` ${result.body.message}` : ''
  const issues = result.body?.issues?.length ? `\nUnmet requirements:\n- ${result.body.issues.join('\n- ')}` : ''

  const guidance = guidanceFor(code, result.status)
  return `${code}.${detail}${guidance ? ` ${guidance}` : ''}${issues}`
}

function guidanceFor(code: string, status: number): string {
  switch (code) {
    case 'UNAUTHENTICATED':
    case 'UNAUTHENTICATED_OR_UNAUTHORIZED':
      return 'Check LATTICE_API_TOKEN, and LATTICE_ORGANIZATION_ID if the deployment resolves membership through Supabase.'
    case 'ORGANIZATION_ROLE_REQUIRED':
      return 'This service identity lacks the organization role this route requires.'
    case 'PLAN_NOT_FOUND':
      return 'The plan has expired, was already used, or was issued to a different principal. Compile the question again.'
    case 'PLAN_NONCE_ALREADY_CONSUMED':
      return 'This plan was already executed. Compile the question again to obtain a fresh plan.'
    case 'PLAN_RELEASE_NO_LONGER_ACTIVE':
      return 'The contract was republished or rolled back after the plan was issued. Compile the question again.'
    case 'PLAN_INVALID_OR_EXPIRED':
      return 'Plans are short-lived. Compile the question again and execute promptly.'
    case 'REQUIRED_PERMISSION_MISSING':
      return 'This service identity is missing a permission the plan requires. Permissions come from the token, not the request.'
    case 'CONTRACT_NOT_PUBLISHED':
      return 'Publish the contract, or use lattice_list_contracts to find one that is already active.'
    case 'CLARIFICATION_NOT_FOUND':
      return 'Clarifications are short-lived and belong to the principal that raised them. Compile the question again.'
    case 'PERMISSIONS_IN_BODY_FORBIDDEN':
      return 'This is a client bug: execution takes no authorization input.'
    default:
      return status === 404 ? 'Check the identifier.' : ''
  }
}
