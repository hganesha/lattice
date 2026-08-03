import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ContextApiClient } from './client.js'
import { createLatticeMcpServer } from './index.js'

interface StubCall {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

/** Records what the MCP server asked the Context API for, and replies with canned payloads. */
function stubApi(routes: Record<string, { status: number; body: unknown }>) {
  const calls: StubCall[] = []
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input))
    const key = `${init?.method ?? 'GET'} ${url.pathname}`
    calls.push({
      url: url.toString(),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    const route = routes[key]
    if (!route) return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404 })
    return new Response(JSON.stringify(route.body), { status: route.status })
  }) as typeof fetch
  return { calls, fetchImpl }
}

async function connect(routes: Record<string, { status: number; body: unknown }>) {
  const { calls, fetchImpl } = stubApi(routes)
  const apiClient = new ContextApiClient(
    { apiUrl: new URL('http://127.0.0.1:8787'), accessToken: 'service-token', organizationId: 'org-1' },
    fetchImpl,
  )
  const server = createLatticeMcpServer(apiClient)
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return { client, calls }
}

function textOf(result: unknown): string {
  return ((result as { content: Array<{ text: string }> }).content ?? []).map((part) => part.text).join('\n')
}

const activeContract = {
  id: 'contract-demo',
  name: 'Demo contract',
  description: 'Demo.',
  domain: 'demo',
  workflow: 'demo_workflow',
  version: '1.0.0',
  releaseStatus: 'PUBLISHED',
  digest: 'sha256:demo',
  versions: { contract: 'contract-demo@1.0.0', semantic: 's@1', policy: 'p@1', bindings: 'b@1', api: 'a@1' },
  competencyQuestions: [],
  entityTypes: [{ id: 'counterparty', label: 'Counterparty', description: 'A counterparty.', group: 'Risk', icon: 'CP', properties: [], evidenceStatus: 'DIRECTLY_EVIDENCED', approvalStatus: 'APPROVED', impact: 'HIGH' }],
  entities: [],
  relationshipTypes: [],
  relationships: [],
  metrics: [],
  evidence: [],
  bindings: [],
  operations: [{
    id: 'risk.exposure', label: 'Assess exposure', description: 'Assess counterparty exposure.', keywords: ['exposure'],
    requiredEntityTypes: ['counterparty'], metricIds: [], relationshipPath: [], sourceBindingIds: [],
    riskTier: 'ANALYTICAL', requiredPermissions: ['risk.read'], expectedResultSchema: 'exposure@1',
  }],
  policies: [{
    id: 'policy-analytical', label: 'Analytical', description: 'Baseline.', riskTier: 'ANALYTICAL',
    minimumEvidenceStrength: 'MODERATE', maximumEvidenceAgeMinutes: 1440, approvalRequired: false,
    version: '1.0.0', owner: 'Risk', approvalStatus: 'APPROVED',
  }],
  tests: [],
  purposes: [
    { id: 'credit-risk-review', label: 'Credit risk review', description: 'Assess exposure.', obligations: ['Audit only'], jurisdictions: ['EU'], retentionDays: 90 },
  ],
}

test('advertises the governed loop as MCP tools', async () => {
  const { client } = await connect({})
  const { tools } = await client.listTools()

  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    'lattice_compile_question',
    'lattice_describe_operations',
    'lattice_execute_plan',
    'lattice_list_contracts',
    'lattice_resolve_clarification',
    'lattice_verify_plan',
  ])
})

test('marks execution as the only non-read-only, irreversible tool', async () => {
  const { client } = await connect({})
  const { tools } = await client.listTools()
  const byName = new Map(tools.map((tool) => [tool.name, tool.annotations]))

  assert.equal(byName.get('lattice_list_contracts')?.readOnlyHint, true)
  assert.equal(byName.get('lattice_verify_plan')?.readOnlyHint, true)
  assert.equal(byName.get('lattice_execute_plan')?.readOnlyHint, false)
  assert.equal(byName.get('lattice_execute_plan')?.destructiveHint, true)
  assert.equal(byName.get('lattice_compile_question')?.destructiveHint, false)
})

test('authenticates as the service identity and never accepts a token as a parameter', async () => {
  const { client, calls } = await connect({ 'GET /v1/contracts': { status: 200, body: [] } })
  const { tools } = await client.listTools()

  for (const tool of tools) {
    const properties = Object.keys((tool.inputSchema.properties ?? {}) as Record<string, unknown>)
    assert.equal(properties.some((name) => /token|secret|credential|password/i.test(name)), false, `${tool.name} exposes a credential parameter`)
  }

  await client.callTool({ name: 'lattice_list_contracts', arguments: {} })
  assert.equal(calls[0]?.headers.Authorization, 'Bearer service-token')
  assert.equal(calls[0]?.headers['X-Lattice-Organization'], 'org-1')
})

test('lists only compilable contracts unless inactive ones are requested', async () => {
  const routes = {
    'GET /v1/contracts': {
      status: 200,
      body: [
        { contractId: 'active-1', name: 'Active', domain: 'risk', workflow: 'w', runtimeStatus: 'ACTIVE', latestRelease: { version: '1.0.0', digest: 'sha256:a' } },
        { contractId: 'suspended-1', name: 'Suspended', domain: 'risk', workflow: 'w', runtimeStatus: 'SUSPENDED' },
      ],
    },
  }
  const { client } = await connect(routes)

  const active = await client.callTool({ name: 'lattice_list_contracts', arguments: {} })
  assert.match(textOf(active), /active-1/)
  assert.doesNotMatch(textOf(active), /suspended-1/)

  const all = await client.callTool({ name: 'lattice_list_contracts', arguments: { include_inactive: true } })
  assert.match(textOf(all), /suspended-1/)
})

test('projects governed operations with the controls a caller must respect', async () => {
  const { client } = await connect({ 'GET /v1/contracts/active': { status: 200, body: activeContract } })
  const result = await client.callTool({ name: 'lattice_describe_operations', arguments: { contract_id: 'contract-demo' } })
  const text = textOf(result)

  assert.match(text, /risk\.exposure/)
  assert.match(text, /analytical risk/)
  assert.match(text, /Required permissions.*risk\.read/)
  assert.match(text, /does not execute the operation/)
})

test('a governed refusal is reported as an outcome, not a tool error', async () => {
  const { client } = await connect({
    'POST /v1/compile': {
      status: 422,
      body: {
        resolutionId: 'res-1',
        decision: 'INSUFFICIENT_EVIDENCE',
        reasonCodes: ['REQUIRED_ENTITY_UNRESOLVED'],
        explanation: ['No evidenced counterparty could be resolved from the question.'],
        versions: activeContract.versions,
      },
    },
  })

  const result = await client.callTool({ name: 'lattice_compile_question', arguments: { question: 'Exposure for Northstar?' } })
  assert.notEqual((result as { isError?: boolean }).isError, true)
  assert.match(textOf(result), /INSUFFICIENT EVIDENCE/)
  assert.match(textOf(result), /No evidenced counterparty/)
})

test('surfaces a clarification with the exact follow-up call to make', async () => {
  const { client } = await connect({
    'POST /v1/compile': {
      status: 422,
      body: {
        resolutionId: 'res-2',
        decision: 'CLARIFICATION_REQUIRED',
        reasonCodes: ['AMBIGUOUS_ENTITY'],
        explanation: ['Multiple counterparty records match.'],
        versions: activeContract.versions,
        clarification: {
          kind: 'ENTITY',
          id: 'clar-1',
          prompt: 'Which counterparty?',
          entityTypeId: 'counterparty',
          candidates: [{ entityId: 'CP-0103', label: 'Arcadia Capital', typeId: 'counterparty', evidenceStrength: 'EXACT', rationale: 'Matched an alias.' }],
        },
      },
    },
  })

  const text = textOf(await client.callTool({ name: 'lattice_compile_question', arguments: { question: 'Exposure for Arcadia?' } }))
  assert.match(text, /lattice_resolve_clarification/)
  assert.match(text, /clar-1/)
  assert.match(text, /CP-0103/)
})

test('warns loudly when a resolution was grounded in sample payloads', async () => {
  const { client } = await connect({
    'POST /v1/compile': {
      status: 200,
      body: {
        resolutionId: 'res-3',
        decision: 'RESOLVED',
        reasonCodes: ['CONTEXT_COMPILED'],
        explanation: ['Resolved.'],
        grounding: 'SIMULATED',
        versions: activeContract.versions,
        plan: {
          schemaVersion: '1.1', planId: 'plan-1', resolutionId: 'res-3', decision: 'RESOLVED', riskTier: 'ANALYTICAL',
          principalId: 'service', grounding: 'SIMULATED', operation: 'risk.exposure', arguments: {}, metrics: [],
          intent: {}, sourceBindings: [], requiredPermissions: ['risk.read'], expectedResultSchema: 'exposure@1',
          evidenceRefs: ['simulated-observation-1'], versions: activeContract.versions, contractDigest: 'sha256:demo',
          expiresAt: '2030-01-01T00:00:00.000Z', nonce: 'n', keyId: 'k', signatureAlgorithm: 'Ed25519', signature: 'sig',
        },
      },
    },
  })

  const text = textOf(await client.callTool({ name: 'lattice_compile_question', arguments: { question: 'Exposure?' } }))
  assert.match(text, /Sample data/)
  assert.match(text, /not live source reads/)
  assert.match(text, /plan-1/)
})

test('an approval requirement tells the agent it cannot self-approve', async () => {
  const { client } = await connect({
    'POST /v1/compile': {
      status: 202,
      body: {
        resolutionId: 'res-4',
        decision: 'APPROVAL_REQUIRED',
        reasonCodes: ['RUNTIME_APPROVAL_REQUIRED'],
        explanation: ['A human approval is required.'],
        versions: activeContract.versions,
        approval: { id: 'approval-1', operationId: 'risk.exposure', riskTier: 'OPERATIONAL_ACTION' },
      },
    },
  })

  const text = textOf(await client.callTool({ name: 'lattice_compile_question', arguments: { question: 'Release the flight?' } }))
  assert.match(text, /approval-1/)
  assert.match(text, /cannot approve on your behalf/)
})

test('execution sends no authorization input and reports the receipt', async () => {
  const { client, calls } = await connect({
    'POST /v1/plans/plan-1/execute': {
      status: 200,
      body: {
        id: 'receipt-1', contractId: 'contract-demo', contractVersion: '1.0.0', planId: 'plan-1',
        operationId: 'risk.exposure', principalId: 'service', status: 'SUCCESS',
        startedAt: '2026-08-02T00:00:00.000Z', completedAt: '2026-08-02T00:00:01.000Z',
        requiredPermissions: ['risk.read'], grantedPermissions: ['risk.read'], evidenceRefs: [],
        bindingResults: [{ bindingId: 'b1', sourceSystem: 'Risk warehouse', mode: 'CONNECTOR', status: 'SUCCESS', durationMs: 4, rowCount: 1, truncated: false, rows: [{ rowIndex: 0, values: [{ sourcePath: '$.x', targetTypeId: 'counterparty', targetPropertyId: 'counterparty.exposure', value: 42, disclosure: 'VALUE', classification: 'INTERNAL' }] }] }],
        artifactDigest: 'sha256:receipt',
      },
    },
  })

  const text = textOf(await client.callTool({ name: 'lattice_execute_plan', arguments: { plan_id: 'plan-1' } }))
  assert.deepEqual(calls[0]?.body, {})
  assert.match(text, /Execution SUCCESS/)
  assert.match(text, /counterparty\.exposure.*42/)
})

test('a spent plan produces an actionable error rather than a bare status', async () => {
  const { client } = await connect({
    'POST /v1/plans/plan-1/execute': { status: 409, body: { error: 'PLAN_NONCE_ALREADY_CONSUMED' } },
  })

  const result = await client.callTool({ name: 'lattice_execute_plan', arguments: { plan_id: 'plan-1' } })
  assert.equal((result as { isError?: boolean }).isError, true)
  assert.match(textOf(result), /already executed/)
  assert.match(textOf(result), /Compile the question again/)
})

test('an unreachable Context API is reported as a configuration problem', async () => {
  const failing = (async () => { throw new Error('ECONNREFUSED') }) as typeof fetch
  const apiClient = new ContextApiClient({ apiUrl: new URL('http://127.0.0.1:8787'), accessToken: 'token' }, failing)
  const server = createLatticeMcpServer(apiClient)
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  const result = await client.callTool({ name: 'lattice_list_contracts', arguments: {} })
  assert.equal((result as { isError?: boolean }).isError, true)
  assert.match(textOf(result), /Could not reach the Context API/)
  assert.match(textOf(result), /LATTICE_API_URL/)
})

test('resolving a clarification requires a choice', async () => {
  const { client } = await connect({})
  const result = await client.callTool({ name: 'lattice_resolve_clarification', arguments: { clarification_id: 'clar-1' } })
  assert.equal((result as { isError?: boolean }).isError, true)
  assert.match(textOf(result), /Provide entity_id .* or operation_id/)
})

test('a classified value is never reconstructed for the model from its receipt', async () => {
  const { client } = await connect({
    'POST /v1/plans/plan-1/execute': {
      status: 200,
      body: {
        id: 'receipt-2', contractId: 'contract-demo', contractVersion: '1.0.0', planId: 'plan-1',
        operationId: 'telco.assess_cpni_access', principalId: 'service', status: 'SUCCESS',
        startedAt: '2026-08-02T00:00:00.000Z', completedAt: '2026-08-02T00:00:01.000Z',
        requiredPermissions: [], grantedPermissions: [], evidenceRefs: [],
        bindingResults: [{
          bindingId: 'b1', sourceSystem: 'CPNI ledger', mode: 'CONNECTOR', status: 'SUCCESS', durationMs: 3,
          rowCount: 1, truncated: false,
          rows: [{ rowIndex: 0, values: [
            { sourcePath: '$.a', targetTypeId: 'customer_account', targetPropertyId: 'customer_account.number', disclosure: 'WITHHELD', classification: 'RESTRICTED', categories: ['CPNI'] },
            { sourcePath: '$.b', targetTypeId: 'privacy_authorization', targetPropertyId: 'privacy_authorization.method', valueDigest: 'sha256:abc', disclosure: 'DIGEST', classification: 'CONFIDENTIAL' },
            { sourcePath: '$.c', targetTypeId: 'privacy_authorization', targetPropertyId: 'privacy_authorization.channel', value: 'ONLINE', disclosure: 'VALUE', classification: 'INTERNAL' },
          ] }],
        }],
        artifactDigest: 'sha256:receipt',
      },
    },
  })

  const text = textOf(await client.callTool({ name: 'lattice_execute_plan', arguments: { plan_id: 'plan-1' } }))
  assert.match(text, /withheld — RESTRICTED \[CPNI\]/)
  assert.match(text, /sha256:abc \(digest — CONFIDENTIAL\)/)
  assert.match(text, /"ONLINE"/)
  assert.match(text, /2 value\(s\) were classified above internal/)
  assert.equal(text.includes('undefined'), false)
})

test('declared purposes are discoverable so an agent can name one when compiling', async () => {
  const { client } = await connect({ 'GET /v1/contracts/active': { status: 200, body: activeContract } })
  const text = textOf(await client.callTool({ name: 'lattice_describe_operations', arguments: { contract_id: 'contract-demo' } }))

  assert.match(text, /Declared purposes/)
  assert.match(text, /`credit-risk-review` — Credit risk review/)
  assert.match(text, /Obligations: Audit only/)
  assert.match(text, /Retain results for at most 90 days/)
})

test('the declared purpose is sent through to the Context API', async () => {
  const { client, calls } = await connect({
    'POST /v1/compile': {
      status: 200,
      body: { resolutionId: 'r', decision: 'RESOLVED', reasonCodes: [], explanation: ['ok'], versions: activeContract.versions },
    },
  })

  await client.callTool({
    name: 'lattice_compile_question',
    arguments: { question: 'Exposure?', purpose_id: 'credit-risk-review', purpose: 'Quarterly review' },
  })
  assert.equal((calls[0]?.body as { purposeId?: string }).purposeId, 'credit-risk-review')
  assert.equal((calls[0]?.body as { purpose?: string }).purpose, 'Quarterly review')
})
