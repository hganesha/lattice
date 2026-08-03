import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { counterpartyRiskContract } from '@lattice/contracts'
import { ContractRegistry, type RegistryDocument } from './registry.js'
import { ContractRegistryConflictError, SupabaseRegistryStorage, totalFromContentRange } from './supabaseRegistry.js'

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

test('a silently truncated read fails instead of serving an incomplete registry', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify([{ id: 'workspace-1', document: {}, created_by: principalId }]), {
    status: 200,
    // PostgREST reports the full count even when its row cap truncated the page.
    headers: { 'content-range': '0-0/97' },
  })
  const storage = new SupabaseRegistryStorage(config, organizationId, principalId, authorization, fetcher)

  await assert.rejects(() => storage.read(), /SUPABASE_REGISTRY_READ_TRUNCATED/)
})

test('parses the total out of a PostgREST content range', () => {
  assert.equal(totalFromContentRange('0-24/1234'), 1234)
  assert.equal(totalFromContentRange('*/0'), 0)
  assert.equal(totalFromContentRange('0-24/*'), undefined)
  assert.equal(totalFromContentRange(null), undefined)
})

test('reads one published release without loading the whole registry', async () => {
  const paths: string[] = []
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input))
    paths.push(url.pathname)
    if (url.pathname.endsWith('/contracts')) {
      return Response.json([{ runtime_status: 'ACTIVE', active_release_digest: counterpartyRiskContract.digest }])
    }
    return Response.json([{ contract: counterpartyRiskContract }])
  }
  const storage = new SupabaseRegistryStorage(config, organizationId, principalId, authorization, fetcher)

  const contract = await storage.readPublishedContract(counterpartyRiskContract.id)

  assert.equal(contract?.id, counterpartyRiskContract.id)
  // Two targeted reads, against the four unbounded ones a full registry load costs.
  assert.deepEqual(paths, ['/rest/v1/contracts', '/rest/v1/contract_releases'])
})

test('a suspended contract is not served as published', async () => {
  const fetcher: typeof fetch = async () => Response.json([{ runtime_status: 'SUSPENDED', active_release_digest: 'sha256:x' }])
  const storage = new SupabaseRegistryStorage(config, organizationId, principalId, authorization, fetcher)

  assert.equal(await storage.readPublishedContract(counterpartyRiskContract.id), undefined)
})

test('a concurrent edit conflicts instead of silently overwriting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-supabase-conflict-'))
  const source = await ContractRegistry.open(join(directory, 'registry.json'), counterpartyRiskContract)
  const entry = source.get(counterpartyRiskContract.id)!
  const workspace = source.getWorkspace('workspace-financial-services')!

  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    if ((init?.method ?? 'GET') === 'GET') {
      if (url.pathname.endsWith('/contracts')) {
        return Response.json([{
          id: entry.contractId, draft: entry.draft, runtime_status: entry.runtimeStatus,
          created_by: principalId, updated_at: '2026-08-01T00:00:00.000Z',
        }])
      }
      if (url.pathname.endsWith('/workspaces')) return Response.json([{ id: workspace.id, document: workspace, created_by: principalId }])
      return Response.json([])
    }
    // PATCH matched no row: someone else wrote after this instance read.
    if (init?.method === 'PATCH') return Response.json([])
    return new Response(null, { status: 201 })
  }
  const storage = new SupabaseRegistryStorage(config, organizationId, principalId, authorization, fetcher)
  const document = await storage.read()
  assert.ok(document)

  document.entries[entry.contractId]!.draft.name = 'Renamed by this request'
  await assert.rejects(() => storage.write(document), ContractRegistryConflictError)
})

test('an uncontended edit updates conditionally on what was read', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-supabase-conditional-'))
  const source = await ContractRegistry.open(join(directory, 'registry.json'), counterpartyRiskContract)
  const entry = source.get(counterpartyRiskContract.id)!
  const workspace = source.getWorkspace('workspace-financial-services')!
  const writes: Array<{ method: string; url: URL }> = []

  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    if ((init?.method ?? 'GET') === 'GET') {
      if (url.pathname.endsWith('/contracts')) {
        return Response.json([{
          id: entry.contractId, draft: entry.draft, runtime_status: entry.runtimeStatus,
          created_by: principalId, updated_at: '2026-08-01T00:00:00.000Z',
        }])
      }
      if (url.pathname.endsWith('/workspaces')) return Response.json([{ id: workspace.id, document: workspace, created_by: principalId }])
      return Response.json([])
    }
    writes.push({ method: init?.method ?? 'POST', url })
    return Response.json([{ id: entry.contractId }])
  }
  const storage = new SupabaseRegistryStorage(config, organizationId, principalId, authorization, fetcher)
  const document = await storage.read()
  document!.entries[entry.contractId]!.draft.name = 'Renamed by this request'

  await storage.write(document!)

  const patch = writes.find((write) => write.method === 'PATCH')
  assert.ok(patch, 'an existing contract should be updated conditionally rather than upserted')
  assert.equal(patch.url.searchParams.get('updated_at'), 'eq.2026-08-01T00:00:00.000Z')
  assert.equal(patch.url.searchParams.get('id'), `eq.${entry.contractId}`)
})
