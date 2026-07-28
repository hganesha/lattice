import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { counterpartyRiskContract } from '@lattice/contracts'
import { ContractRegistry, type RegistryDocument } from './registry.js'
import { SupabaseRegistryStorage } from './supabaseRegistry.js'

const organizationId = '78dc4be7-cd24-43ad-97f8-83cddfbf43a0'
const principalId = '1351f96b-8103-4851-b7c2-a9e4f60dde1b'
const authorization = 'Bearer user-access-token'
const config = { projectUrl: new URL('https://project.supabase.co'), publishableKey: 'sb_publishable_example' }

test('reads registry rows through the caller JWT and an explicit organization filter', async () => {
  const calls: Array<{ url: URL; headers: Headers }> = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    calls.push({ url, headers: new Headers(init?.headers) })
    return Response.json([])
  }
  const storage = new SupabaseRegistryStorage(config, organizationId, principalId, authorization, fetcher)

  assert.equal(await storage.read(), undefined)
  assert.equal(calls.length, 4)
  for (const call of calls) {
    assert.equal(call.url.searchParams.get('organization_id'), `eq.${organizationId}`)
    assert.equal(call.headers.get('authorization'), authorization)
    assert.equal(call.headers.get('apikey'), config.publishableKey)
  }
})

test('writes only organization-scoped registry rows and attributes changes to the caller', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-supabase-registry-'))
  const source = await ContractRegistry.open(join(directory, 'registry.json'), counterpartyRiskContract)
  const workspace = source.getWorkspace('workspace-financial-services')!
  const entry = source.get(counterpartyRiskContract.id)!
  const document: RegistryDocument = {
    schemaVersion: '1.1',
    entries: { [entry.contractId]: entry },
    workspaces: { [workspace.id]: workspace },
  }
  const calls: Array<{ url: URL; headers: Headers; rows: Array<Record<string, unknown>> }> = []
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({
      url: new URL(String(input)),
      headers: new Headers(init?.headers),
      rows: JSON.parse(String(init?.body)) as Array<Record<string, unknown>>,
    })
    return new Response(null, { status: 201 })
  }
  const storage = new SupabaseRegistryStorage(config, organizationId, principalId, authorization, fetcher)

  await storage.write(document)

  assert.deepEqual(calls.map((call) => call.url.pathname), ['/rest/v1/workspaces', '/rest/v1/contracts', '/rest/v1/contract_releases'])
  for (const call of calls) {
    assert.equal(call.headers.get('authorization'), authorization)
    assert.equal(call.headers.get('apikey'), config.publishableKey)
    assert.ok(call.rows.length > 0)
    assert.ok(call.rows.every((row) => row.organization_id === organizationId))
    assert.ok(call.rows.every((row) => row.organization_id !== 'another-organization'))
  }
  assert.ok(calls[0]!.rows.every((row) => row.created_by === principalId))
  assert.ok(calls[1]!.rows.every((row) => row.created_by === principalId && row.updated_by === principalId))
  assert.ok(calls[2]!.rows.every((row) => row.published_by === principalId))
})

test('rejects malformed tenant identity or non-bearer authorization before a request is made', () => {
  assert.throws(() => new SupabaseRegistryStorage(config, 'organization-from-body', principalId, authorization), /SUPABASE_REGISTRY_IDENTITY_INVALID/)
  assert.throws(() => new SupabaseRegistryStorage(config, organizationId, principalId, 'service-role-secret'), /SUPABASE_REGISTRY_AUTHORIZATION_INVALID/)
})
