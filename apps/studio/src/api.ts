export const API_URL = import.meta.env.VITE_API_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:8787'

const ACCESS_TOKEN_KEY = 'lattice:oidc-access-token'
const ACTIVE_ORGANIZATION_KEY = 'lattice:active-organization'

export function apiAuthHeaders(developmentToken = 'studio-demo'): Record<string, string> {
  const accessToken = typeof sessionStorage === 'undefined' ? undefined : sessionStorage.getItem(ACCESS_TOKEN_KEY)?.trim()
  const organizationId = typeof sessionStorage === 'undefined' ? undefined : sessionStorage.getItem(ACTIVE_ORGANIZATION_KEY)?.trim()
  const token = accessToken || (import.meta.env.DEV ? developmentToken : '')
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(organizationId ? { 'X-Lattice-Organization': organizationId } : {}),
  }
}

export function setApiAccessToken(accessToken: string): void {
  const normalized = accessToken.trim()
  if (!normalized) throw new Error('OIDC_ACCESS_TOKEN_REQUIRED')
  sessionStorage.setItem(ACCESS_TOKEN_KEY, normalized)
}

export function clearApiAccessToken(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY)
}

export function setActiveOrganizationId(organizationId: string): void {
  const normalized = organizationId.trim()
  if (!normalized) throw new Error('ACTIVE_ORGANIZATION_REQUIRED')
  sessionStorage.setItem(ACTIVE_ORGANIZATION_KEY, normalized)
}

export function clearActiveOrganizationId(): void {
  sessionStorage.removeItem(ACTIVE_ORGANIZATION_KEY)
}
