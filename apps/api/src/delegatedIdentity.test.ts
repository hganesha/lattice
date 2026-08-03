import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_DELEGATION_SCOPES,
  EntraOnBehalfOfExchange,
  OktaTokenExchange,
  delegationScopeFor,
  tokenExchangeFromEnvironment,
} from './delegatedIdentity.js'

const config = {
  provider: 'ENTRA' as const,
  tokenEndpoint: new URL('https://login.microsoftonline.com/tenant/oauth2/v2.0/token'),
  clientId: 'lattice-api',
  clientSecret: 'secret',
}

function capturingFetch(response: () => Response) {
  const calls: Array<{ url: string; form: URLSearchParams }> = []
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), form: new URLSearchParams(String(init?.body)) })
    return response()
  }) as typeof fetch
  return { calls, fetchImpl }
}

const tokenResponse = () => Response.json({ access_token: 'downstream-token', expires_in: 3600 })

test('Entra uses the on-behalf-of flow it actually implements', async () => {
  const { calls, fetchImpl } = capturingFetch(tokenResponse)
  const exchange = new EntraOnBehalfOfExchange(config, fetchImpl)

  const token = await exchange.exchange('caller-token', DEFAULT_DELEGATION_SCOPES.DATABRICKS!)

  assert.equal(token.accessToken, 'downstream-token')
  assert.ok(token.expiresAt)
  assert.equal(calls[0]?.form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer')
  assert.equal(calls[0]?.form.get('requested_token_use'), 'on_behalf_of')
  assert.equal(calls[0]?.form.get('assertion'), 'caller-token')
})

test('Okta uses the standard RFC 8693 token exchange', async () => {
  const { calls, fetchImpl } = capturingFetch(tokenResponse)
  const exchange = new OktaTokenExchange({ ...config, provider: 'OKTA' }, fetchImpl)

  await exchange.exchange('caller-token', 'databricks/.default')

  assert.equal(calls[0]?.form.get('grant_type'), 'urn:ietf:params:oauth:token-exchange')
  assert.equal(calls[0]?.form.get('subject_token'), 'caller-token')
  assert.equal(calls[0]?.form.get('subject_token_type'), 'urn:ietf:params:oauth:token-type:access_token')
})

test('a token is scoped to one platform, so it is useless against another', async () => {
  const { calls, fetchImpl } = capturingFetch(tokenResponse)
  const exchange = new EntraOnBehalfOfExchange(config, fetchImpl)

  await exchange.exchange('caller-token', DEFAULT_DELEGATION_SCOPES.DATABRICKS!)
  await exchange.exchange('caller-token', DEFAULT_DELEGATION_SCOPES.MICROSOFT_FABRIC!)

  assert.notEqual(calls[0]?.form.get('scope'), calls[1]?.form.get('scope'))
  assert.equal(calls[0]?.form.get('scope'), DEFAULT_DELEGATION_SCOPES.DATABRICKS)
  assert.equal(calls[1]?.form.get('scope'), DEFAULT_DELEGATION_SCOPES.MICROSOFT_FABRIC)
})

test('a rejected exchange does not surface the identity provider body', async () => {
  const { fetchImpl } = capturingFetch(() => new Response(
    JSON.stringify({ error: 'invalid_grant', error_description: 'user alice@example.com lacks consent for scope x' }),
    { status: 400 },
  ))
  const exchange = new EntraOnBehalfOfExchange(config, fetchImpl)

  await assert.rejects(
    () => exchange.exchange('caller-token', 'scope'),
    (error: Error) => {
      assert.match(error.message, /DELEGATED_IDENTITY_EXCHANGE_REJECTED:400/)
      assert.equal(error.message.includes('alice@example.com'), false)
      return true
    },
  )
})

test('an unreachable identity provider is reported as such', async () => {
  const failing = (async () => { throw new Error('ECONNREFUSED') }) as typeof fetch
  const exchange = new EntraOnBehalfOfExchange(config, failing)

  await assert.rejects(() => exchange.exchange('caller-token', 'scope'), /DELEGATED_IDENTITY_EXCHANGE_UNREACHABLE/)
})

test('a response without a token is rejected rather than used', async () => {
  const { fetchImpl } = capturingFetch(() => Response.json({ token_type: 'Bearer' }))
  const exchange = new OktaTokenExchange({ ...config, provider: 'OKTA' }, fetchImpl)

  await assert.rejects(() => exchange.exchange('caller-token', 'scope'), /INVALID_RESPONSE/)
})

test('Databricks and Fabric have scopes, and a deployment can override them', () => {
  assert.ok(delegationScopeFor('DATABRICKS', {}))
  assert.ok(delegationScopeFor('MICROSOFT_FABRIC', {}))
  assert.equal(delegationScopeFor('SNOWFLAKE', {}), undefined)
  assert.equal(delegationScopeFor('DATABRICKS', { LATTICE_DELEGATION_SCOPE_DATABRICKS: 'custom/.default' }), 'custom/.default')
})

test('the exchange is built from configuration, and absent configuration means none', () => {
  assert.equal(tokenExchangeFromEnvironment({}), undefined)

  const entra = tokenExchangeFromEnvironment({
    LATTICE_DELEGATED_IDENTITY_PROVIDER: 'entra',
    LATTICE_DELEGATED_IDENTITY_TOKEN_ENDPOINT: 'https://login.microsoftonline.com/t/oauth2/v2.0/token',
    LATTICE_DELEGATED_IDENTITY_CLIENT_ID: 'id',
    LATTICE_DELEGATED_IDENTITY_CLIENT_SECRET: 'secret',
  })
  assert.equal(entra?.provider, 'ENTRA')

  const okta = tokenExchangeFromEnvironment({
    LATTICE_DELEGATED_IDENTITY_PROVIDER: 'OKTA',
    LATTICE_DELEGATED_IDENTITY_TOKEN_ENDPOINT: 'https://example.okta.com/oauth2/v1/token',
    LATTICE_DELEGATED_IDENTITY_CLIENT_ID: 'id',
    LATTICE_DELEGATED_IDENTITY_CLIENT_SECRET: 'secret',
  })
  assert.equal(okta?.provider, 'OKTA')
})

test('incomplete or insecure delegation configuration fails at startup', () => {
  assert.throws(
    () => tokenExchangeFromEnvironment({ LATTICE_DELEGATED_IDENTITY_PROVIDER: 'PING' }),
    /must be ENTRA or OKTA/,
  )
  assert.throws(
    () => tokenExchangeFromEnvironment({ LATTICE_DELEGATED_IDENTITY_PROVIDER: 'ENTRA' }),
    /_TOKEN_ENDPOINT, _CLIENT_ID, and _CLIENT_SECRET/,
  )
  assert.throws(
    () => tokenExchangeFromEnvironment({
      LATTICE_DELEGATED_IDENTITY_PROVIDER: 'ENTRA',
      LATTICE_DELEGATED_IDENTITY_TOKEN_ENDPOINT: 'http://login.example.com/token',
      LATTICE_DELEGATED_IDENTITY_CLIENT_ID: 'id',
      LATTICE_DELEGATED_IDENTITY_CLIENT_SECRET: 'secret',
    }),
    /must use HTTPS/,
  )
})
