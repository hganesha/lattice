import assert from 'node:assert/strict'
import test from 'node:test'
import { supabaseFailure } from './supabaseRegistry.js'
import { SupabaseGovernanceLedger } from './supabaseGovernanceLedger.js'
import type { ChainedArtifact } from './hashChain.js'

const config = { projectUrl: new URL('https://project.supabase.co'), publishableKey: 'sb_publishable_test' }
const organizationId = '11111111-1111-4111-8111-111111111111'

test('supabaseFailure carries the PostgREST explanation, not just the status', async () => {
  const response = new Response(JSON.stringify({
    code: '23503',
    message: 'insert or update on table "governed_artifacts" violates foreign key constraint',
    details: 'Key (organization_id, contract_id)=(…, ctr_counterparty_risk) is not present in table "contracts".',
    hint: null,
  }), { status: 409 })

  const error = await supabaseFailure('SUPABASE_LEDGER_APPEND_FAILED:ASSURANCE_RUN', response)

  assert.match(error.message, /SUPABASE_LEDGER_APPEND_FAILED:ASSURANCE_RUN:409/)
  // The SQLSTATE and the constraint are what identify the fix; the status alone does not.
  assert.match(error.message, /23503/)
  assert.match(error.message, /foreign key constraint/)
  assert.match(error.message, /not present in table "contracts"/)
})

test('supabaseFailure degrades to the status when the body is not PostgREST JSON', async () => {
  // A proxy or gateway can answer with HTML; failing to parse the explanation must not
  // replace the failure being explained.
  const error = await supabaseFailure('SUPABASE_REGISTRY_READ_FAILED:contracts', new Response('<html>502</html>', { status: 502 }))

  assert.match(error.message, /SUPABASE_REGISTRY_READ_FAILED:contracts:502/)
})

test('supabaseFailure survives an empty body', async () => {
  const error = await supabaseFailure('SUPABASE_LEDGER_READ_FAILED:REVIEW', new Response(null, { status: 401 }))

  assert.equal(error.message, 'SUPABASE_LEDGER_READ_FAILED:REVIEW:401')
})

test('a failed ledger append surfaces the database reason to the caller', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    code: '42883',
    message: 'function extensions.digest(text, unknown) does not exist',
  }), { status: 404 })

  const ledger = new SupabaseGovernanceLedger<ChainedArtifact & { contractId: string }>(
    config, organizationId, 'Bearer token', 'ASSURANCE_RUN', undefined, (document) => document, fetcher,
  )

  await assert.rejects(
    () => ledger.append({ id: 'run_1', artifactDigest: 'sha256:abc', contractId: 'ctr_1' }),
    /SUPABASE_LEDGER_APPEND_FAILED:ASSURANCE_RUN:404.*42883.*does not exist/s,
  )
})
