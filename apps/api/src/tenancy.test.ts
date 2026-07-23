import assert from 'node:assert/strict'
import test from 'node:test'
import { applyTenantMembership, createSupabaseTenantMembershipResolver, tenantMembershipResolverFromEnvironment } from './tenancy.js'

test('resolves an organization role through the user-scoped Supabase Data API', async () => {
  const calls: Array<{ url: string; headers: Headers }> = []
  const resolver = createSupabaseTenantMembershipResolver('https://project.supabase.co', 'sb_publishable_example', async (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) })
    return new Response(JSON.stringify([{ role: 'REVIEWER' }]), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  const organizationId = '78dc4be7-cd24-43ad-97f8-83cddfbf43a0'
  const principalId = '1351f96b-8103-4851-b7c2-a9e4f60dde1b'

  assert.equal(await resolver.resolve('Bearer user-access-token', organizationId, principalId), 'REVIEWER')
  assert.equal(calls.length, 1)
  assert.match(calls[0]!.url, /organization_id=eq\.78dc4be7/)
  assert.equal(calls[0]!.headers.get('authorization'), 'Bearer user-access-token')
  assert.equal(calls[0]!.headers.get('apikey'), 'sb_publishable_example')
})

test('rejects malformed tenant identifiers before contacting Supabase', async () => {
  let called = false
  const resolver = createSupabaseTenantMembershipResolver('https://project.supabase.co', 'sb_publishable_example', async () => {
    called = true
    return new Response('[]')
  })

  assert.equal(await resolver.resolve('Bearer token', 'organization-from-request-body', 'user-1'), undefined)
  assert.equal(called, false)
})

test('applies the validated organization and membership role to request identity', () => {
  const identity = applyTenantMembership({ principalId: 'user-1', roles: [], scopes: [] }, 'organization-1', 'AUTHOR')
  assert.equal(identity.tenantId, 'organization-1')
  assert.deepEqual(identity.roles, ['AUTHOR'])
})

test('accepts Supabase tenancy values injected by Vercel Marketplace', async () => {
  const keys = ['LATTICE_SUPABASE_URL', 'LATTICE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'] as const
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  try {
    for (const key of keys) delete process.env[key]
    process.env.SUPABASE_URL = 'https://project.supabase.co'
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_example'
    const resolver = tenantMembershipResolverFromEnvironment()
    assert.ok(resolver)
    assert.equal(await resolver.resolve('Bearer token', 'invalid-organization', 'invalid-user'), undefined)
  } finally {
    for (const key of keys) previous[key] === undefined ? delete process.env[key] : process.env[key] = previous[key]
  }
})
