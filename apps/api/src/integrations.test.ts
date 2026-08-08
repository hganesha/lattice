import assert from 'node:assert/strict'
import test from 'node:test'
import { integrationsSummary } from './integrations.js'

const signing = { algorithm: 'Ed25519', activeKeyId: 'thumbprint-abc', ephemeral: false }

function summary(environment: NodeJS.ProcessEnv, overrides: Partial<Parameters<typeof integrationsSummary>[0]> = {}) {
  return integrationsSummary({ environment, supabaseConfigured: true, signing, telemetryEnabled: false, ...overrides })
}

test('reports a federated catalog by provider and host', () => {
  const result = summary({
    LATTICE_CATALOG_PROVIDER: 'collibra',
    LATTICE_CATALOG_ENDPOINT: 'https://acme.collibra.com/rest/2.0',
  })

  assert.deepEqual(result.catalog, { configured: true, provider: 'collibra', host: 'acme.collibra.com' })
})

test('a secret is never read, so it cannot be reported', () => {
  // Every credential the deployment holds, set to values that would be unmistakable in output.
  const secrets = {
    LATTICE_CATALOG_TOKEN: 'catalog-token-SECRET',
    LATTICE_DELEGATED_IDENTITY_CLIENT_SECRET: 'delegation-secret-SECRET',
    LATTICE_SIGNING_KEY: 'signing-key-SECRET',
    LATTICE_SIGNING_AZURE_CLIENT_SECRET: 'azure-secret-SECRET',
    SUPABASE_PUBLISHABLE_KEY: 'supabase-key-SECRET',
  }
  const result = summary({
    ...secrets,
    LATTICE_CATALOG_PROVIDER: 'purview',
    LATTICE_CATALOG_ENDPOINT: 'https://acme.purview.azure.com',
    LATTICE_DELEGATED_IDENTITY_PROVIDER: 'entra',
    LATTICE_DELEGATED_IDENTITY_TOKEN_ENDPOINT: 'https://login.microsoftonline.com/tenant/oauth2/v2.0/token',
    LATTICE_SIGNING_PROVIDER: 'AZURE_KEY_VAULT',
  })

  const serialized = JSON.stringify(result)
  for (const value of Object.values(secrets)) {
    assert.ok(!serialized.includes(value), `${value} must not appear in the integrations summary`)
  }
  assert.ok(!serialized.includes('SECRET'), 'no credential may reach the response')
})

test('an endpoint is reduced to its hostname, dropping paths and embedded credentials', () => {
  const result = summary({
    LATTICE_CATALOG_PROVIDER: 'unity-catalog',
    LATTICE_CATALOG_ENDPOINT: 'https://user:password@dbc-1234.cloud.databricks.com/api/2.1/unity-catalog',
  })

  assert.equal(result.catalog.configured && result.catalog.host, 'dbc-1234.cloud.databricks.com')
  const serialized = JSON.stringify(result)
  assert.ok(!serialized.includes('password'), 'credentials embedded in a URL must not survive')
  assert.ok(!serialized.includes('/api/2.1'), 'the path is not reported')
})

test('an unconfigured integration reports absence rather than guessing', () => {
  const result = summary({})

  assert.deepEqual(result.catalog, { configured: false })
  assert.deepEqual(result.delegatedIdentity, { configured: false })
  assert.equal(result.signing.provider, 'LOCAL')
})

test('an unrecognized provider is not reported as configured', () => {
  const result = summary({ LATTICE_CATALOG_PROVIDER: 'alation', LATTICE_CATALOG_ENDPOINT: 'https://acme.alation.com' })

  assert.deepEqual(result.catalog, { configured: false })
})

test('ledgers on a discarded filesystem are reported as not durable', () => {
  // The failure this exists to make visible: the API runs, writes receipts, and loses them.
  const onVercel = summary({ VERCEL: '1' }, { supabaseConfigured: false })
  assert.deepEqual(onVercel.persistence, { backend: 'FILESYSTEM', durable: false })

  const local = summary({}, { supabaseConfigured: false })
  assert.deepEqual(local.persistence, { backend: 'FILESYSTEM', durable: true })

  const postgres = summary({ VERCEL: '1' }, { supabaseConfigured: true })
  assert.deepEqual(postgres.persistence, { backend: 'SUPABASE', durable: true })
})

test('an ephemeral signing key is surfaced, because plans stop verifying after a restart', () => {
  const result = summary({}, { signing: { ...signing, ephemeral: true } })

  assert.equal(result.signing.ephemeral, true)
  assert.equal(result.signing.activeKeyId, 'thumbprint-abc')
})
