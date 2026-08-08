export const API_URL = import.meta.env.VITE_API_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:8787'

const SESSION_KEY = 'lattice:session-principal'

export interface StudioSession {
  token: string
  principalId: string
  displayName: string
  initials: string
  roles: string[]
}

/**
 * The signed-in principal. Still a demo token exchange rather than a real IdP, but the
 * identity now comes from one place instead of a hard-coded `Bearer studio-demo` per call
 * and a hard-coded `HG` avatar (G6).
 */
export function loadSession(): StudioSession {
  try {
    const saved = localStorage.getItem(SESSION_KEY)
    if (saved) return JSON.parse(saved) as StudioSession
  } catch {
    // fall through to the default session
  }
  return defaultSession
}

export const defaultSession: StudioSession = {
  token: 'studio-demo',
  principalId: 'principal_studio_demo',
  displayName: 'Studio Demo Steward',
  initials: 'SD',
  roles: ['DATA_STEWARD', 'SEMANTIC_OWNER'],
}

export function saveSession(session: StudioSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${loadSession().token}`, ...extra }
}

export interface ApiError extends Error {
  status: number
  code?: string
}

/** Thin typed fetch: attaches identity, parses JSON, and surfaces the API's own error code. */
export async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: authHeaders({ ...(json === undefined ? {} : { 'Content-Type': 'application/json' }), ...(headers as Record<string, string> | undefined) }),
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) as T & { error?: string; message?: string } : undefined
  if (!response.ok) {
    const error = new Error(payload?.message ?? payload?.error ?? `Request failed with ${response.status}`) as ApiError
    error.status = response.status
    if (payload?.error) error.code = payload.error
    throw error
  }
  return payload as T
}
