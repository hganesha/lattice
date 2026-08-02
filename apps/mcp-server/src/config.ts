/** Runtime configuration, resolved once at startup so a misconfiguration fails loudly. */
export interface LatticeMcpConfig {
  apiUrl: URL
  /**
   * The service identity this server acts as. Signed plans are issued to it, its token scopes
   * decide what it may execute, and it is never accepted as a tool parameter — a credential
   * that can be passed in through model context is a credential the model can leak.
   */
  accessToken: string
  organizationId?: string
}

export function configFromEnvironment(environment: NodeJS.ProcessEnv = process.env): LatticeMcpConfig {
  const rawUrl = environment.LATTICE_API_URL?.trim() || 'http://127.0.0.1:8787'
  const accessToken = environment.LATTICE_API_TOKEN?.trim()
  const organizationId = environment.LATTICE_ORGANIZATION_ID?.trim()

  if (!accessToken) {
    throw new Error('LATTICE_API_TOKEN is required: the MCP server acts as a governed service identity.')
  }

  return {
    apiUrl: secureApiUrl(rawUrl),
    accessToken,
    ...(organizationId ? { organizationId } : {}),
  }
}

/**
 * Bearer tokens must not cross a plaintext link. Loopback HTTP stays allowed so the server can
 * run against a local Context API during development.
 */
function secureApiUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`LATTICE_API_URL is not a valid URL: ${value}`)
  }
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('LATTICE_API_URL must use HTTPS, or HTTP on a loopback address for local development.')
  }
  if (url.username || url.password) {
    throw new Error('LATTICE_API_URL must not embed credentials.')
  }
  return url
}
