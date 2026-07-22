import { afterEach, describe, expect, it } from 'vitest'
import { apiAuthHeaders, clearActiveOrganizationId, clearApiAccessToken, setActiveOrganizationId, setApiAccessToken } from './api'

afterEach(() => {
  clearApiAccessToken()
  clearActiveOrganizationId()
})

describe('Studio API authentication', () => {
  it('prefers a session-scoped OIDC access token over development identities', () => {
    expect(apiAuthHeaders('studio-author')).toEqual({ Authorization: 'Bearer studio-author' })
    setApiAccessToken('signed-oidc-access-token')
    expect(apiAuthHeaders('studio-author')).toEqual({ Authorization: 'Bearer signed-oidc-access-token' })
  })

  it('rejects empty access tokens', () => {
    expect(() => setApiAccessToken('   ')).toThrow('OIDC_ACCESS_TOKEN_REQUIRED')
  })

  it('propagates the active organization with the user access token', () => {
    setApiAccessToken('signed-oidc-access-token')
    setActiveOrganizationId('organization-42')

    expect(apiAuthHeaders()).toEqual({
      Authorization: 'Bearer signed-oidc-access-token',
      'X-Lattice-Organization': 'organization-42',
    })
  })
})
