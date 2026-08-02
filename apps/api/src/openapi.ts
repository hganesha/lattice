/**
 * Machine-readable description of the Context API.
 *
 * Enterprises standardizing on an agent platform need to generate a client rather than read
 * the README and hand-roll one. This document is the contract for that; `openapi.test.ts`
 * fails if a route is added to the server without appearing here.
 *
 * Payload schemas for the agent-facing surface — compile, clarify, verify, execute — are
 * described in full. The authoring surface exchanges whole Context Contract documents, which
 * are large and versioned in `@lattice/contracts`; those are typed as objects that point at
 * the owning TypeScript type rather than duplicated here, because a schema copy that silently
 * drifts is worse than an honest pointer.
 */

export interface OpenApiDocument {
  openapi: string
  info: Record<string, unknown>
  servers: Array<Record<string, unknown>>
  security: Array<Record<string, string[]>>
  tags: Array<{ name: string; description: string }>
  paths: Record<string, Record<string, unknown>>
  components: Record<string, unknown>
}

const bearer = [{ bearerAuth: [] as string[] }]

function contractIdParameter(description: string) {
  return {
    name: 'contractId',
    in: 'query',
    required: true,
    schema: { type: 'string' },
    description,
  }
}

function pathParameter(name: string, description: string) {
  return { name, in: 'path', required: true, schema: { type: 'string' }, description }
}

function jsonBody(schema: Record<string, unknown>, required = true) {
  return { required, content: { 'application/json': { schema } } }
}

function jsonResponse(description: string, schema: Record<string, unknown>) {
  return { description, content: { 'application/json': { schema } } }
}

const errorResponse = jsonResponse('Request rejected. `error` carries a stable machine-readable code.', {
  $ref: '#/components/schemas/Error',
})

const opaqueDocument = (typeName: string, description: string) => ({
  type: 'object',
  additionalProperties: true,
  description: `${description} Shape is the \`${typeName}\` type exported by @lattice/contracts.`,
})

export const openApiDocument: OpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Lattice Context API',
    version: '1.1.0',
    summary: 'Compile natural-language questions into governed, signed, verifiable execution plans.',
    description: [
      'The Context API turns a question plus a published Context Contract into one of four explicit',
      'outcomes: a short-lived signed execution plan, a typed clarification request, an approval',
      'requirement, or an evidence-backed abstention.',
      '',
      'Identity is never taken from a request body. The authenticated principal determines the tenant,',
      'the organization role required for the route, and the permissions available at execution. Signed',
      'plans are issued to one subject and cannot be verified or executed by anyone else.',
    ].join('\n'),
    license: { name: 'MIT' },
  },
  servers: [{ url: 'http://127.0.0.1:8787', description: 'Local development' }],
  security: bearer,
  tags: [
    { name: 'Runtime', description: 'Compile questions, resolve clarifications, verify and execute plans.' },
    { name: 'Governance', description: 'Assurance runs, reviews, and runtime approvals.' },
    { name: 'Authoring', description: 'Workspaces, contracts, imports, and source bindings.' },
    { name: 'Releases', description: 'Immutable releases, diffs, restores, rollbacks, and runtime status.' },
    { name: 'Connectors', description: 'Governed connector catalog, validation, discovery, and health.' },
    { name: 'Service', description: 'Health, signing keys, and this description.' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Service'],
        operationId: 'getHealth',
        summary: 'Check API health.',
        security: [],
        responses: {
          200: jsonResponse('The service is running.', {
            type: 'object',
            properties: { status: { type: 'string' }, service: { type: 'string' } },
            required: ['status', 'service'],
          }),
        },
      },
    },
    '/openapi.json': {
      get: {
        tags: ['Service'],
        operationId: 'getOpenApiDocument',
        summary: 'Retrieve this OpenAPI description.',
        security: [],
        responses: { 200: jsonResponse('The OpenAPI 3.1 description of this API.', { type: 'object' }) },
      },
    },
    '/v1/keys/current': {
      get: {
        tags: ['Service'],
        operationId: 'getCurrentSigningKey',
        summary: 'Retrieve the current plan-signing public key.',
        description: 'The key is currently ephemeral and per-process, so a plan cannot yet be verified offline or across instances.',
        security: [],
        responses: {
          200: jsonResponse('The active public signing key as a JWK.', {
            type: 'object',
            properties: {
              keyId: { type: 'string' },
              algorithm: { type: 'string', const: 'Ed25519' },
              publicKey: { type: 'object', additionalProperties: true },
            },
            required: ['keyId', 'algorithm', 'publicKey'],
          }),
        },
      },
    },
    '/v1/compile': {
      post: {
        tags: ['Runtime'],
        operationId: 'compileQuestion',
        summary: 'Compile a question into an explicit runtime decision.',
        description: [
          'Returns exactly one governed outcome. 200 carries a signed plan, 202 an approval requirement,',
          'and 422 a clarification request, an abstention, or a denial — each with reason codes.',
          '',
          '`tenantId` and `principalId` in the body are rejected: identity comes from the bearer token.',
        ].join('\n'),
        requestBody: jsonBody({ $ref: '#/components/schemas/CompileRequest' }),
        responses: {
          200: jsonResponse('Resolved. The response carries a signed, short-lived execution plan.', { $ref: '#/components/schemas/CompileResponse' }),
          202: jsonResponse('A human approval is required before the pending plan can be signed for execution.', { $ref: '#/components/schemas/CompileResponse' }),
          400: errorResponse,
          401: errorResponse,
          409: errorResponse,
          422: jsonResponse('Clarification required, insufficient evidence, stale context, unsupported, or denied.', { $ref: '#/components/schemas/CompileResponse' }),
        },
      },
    },
    '/v1/clarifications/{clarificationId}': {
      post: {
        tags: ['Runtime'],
        operationId: 'resolveClarification',
        summary: 'Continue a paused resolution with a governed selection.',
        description: 'Only the principal the clarification was issued to may continue it.',
        parameters: [pathParameter('clarificationId', 'Identifier returned in the clarification contract.')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            entityId: { type: 'string', description: 'Chosen entity, for an ENTITY clarification.' },
            operationId: { type: 'string', description: 'Chosen operation, for an OPERATION clarification.' },
          },
          additionalProperties: false,
        }),
        responses: {
          200: jsonResponse('Resolved.', { $ref: '#/components/schemas/CompileResponse' }),
          202: jsonResponse('A human approval is required.', { $ref: '#/components/schemas/CompileResponse' }),
          400: errorResponse,
          401: errorResponse,
          404: errorResponse,
          409: errorResponse,
          422: jsonResponse('A further governed outcome.', { $ref: '#/components/schemas/CompileResponse' }),
        },
      },
    },
    '/v1/plans/{planId}/verify': {
      post: {
        tags: ['Runtime'],
        operationId: 'verifyPlan',
        summary: 'Verify signature, expiry, key, and contract digest for a plan.',
        description: 'A plan belonging to another subject is reported as absent rather than forbidden, so this cannot be used to probe for live plan identifiers.',
        parameters: [pathParameter('planId', 'Plan identifier.')],
        responses: {
          200: jsonResponse('The plan is valid and unexpired.', { $ref: '#/components/schemas/PlanVerification' }),
          401: errorResponse,
          404: errorResponse,
          422: jsonResponse('The plan failed signature or expiry verification.', { $ref: '#/components/schemas/PlanVerification' }),
        },
      },
    },
    '/v1/plans/{planId}/execute': {
      post: {
        tags: ['Runtime'],
        operationId: 'executePlan',
        summary: 'Execute a signed plan against its governed source bindings.',
        description: [
          'Granted permissions are derived from the authenticated identity. A body that asserts',
          '`grantedPermissions` is rejected with 400.',
          '',
          'A plan identifier is single-use, but only an attempt that passed authorization spends it:',
          'a 403 is recorded as a DENIED receipt and the plan remains executable.',
        ].join('\n'),
        parameters: [pathParameter('planId', 'Plan identifier.')],
        requestBody: jsonBody({ type: 'object', additionalProperties: false, description: 'No client-supplied authorization input.' }, false),
        responses: {
          200: jsonResponse('Every source binding succeeded.', { $ref: '#/components/schemas/ExecutionReceipt' }),
          400: errorResponse,
          401: errorResponse,
          403: jsonResponse('The identity lacks a permission the plan requires. A DENIED receipt is recorded.', {
            type: 'object',
            properties: {
              error: { type: 'string', const: 'REQUIRED_PERMISSION_MISSING' },
              missingPermissions: { type: 'array', items: { type: 'string' } },
              receipt: { $ref: '#/components/schemas/ExecutionReceipt' },
            },
            required: ['error', 'missingPermissions'],
          }),
          404: errorResponse,
          409: errorResponse,
          422: errorResponse,
          502: jsonResponse('At least one source binding failed. The receipt records which.', { $ref: '#/components/schemas/ExecutionReceipt' }),
        },
      },
    },
    '/v1/contracts': {
      get: {
        tags: ['Authoring'],
        operationId: 'listContracts',
        summary: 'List registry entries and their latest releases.',
        responses: {
          200: jsonResponse('Contract summaries.', { type: 'array', items: opaqueDocument('ContractSummary', 'Registry summary for one contract.') }),
          401: errorResponse,
        },
      },
      post: {
        tags: ['Authoring'],
        operationId: 'createContract',
        summary: 'Create a question-first contract from a blank or starter schema.',
        requestBody: jsonBody(opaqueDocument('CreateContractRequest', 'Name, description, domain, workflow, owner, and at least one competency question.')),
        responses: {
          201: jsonResponse('The created registry entry.', opaqueDocument('ContractRegistryEntry', 'Draft plus immutable release history.')),
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/v1/contracts/active': {
      get: {
        tags: ['Runtime'],
        operationId: 'getActiveContract',
        summary: 'Inspect the active published Context Contract.',
        parameters: [{ ...contractIdParameter('Contract to inspect.'), required: false }],
        responses: {
          200: jsonResponse('The active published contract.', opaqueDocument('ContextContract', 'A published, content-addressed Context Contract.')),
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/v1/contracts/{contractId}': {
      get: {
        tags: ['Authoring'],
        operationId: 'getContract',
        summary: 'Retrieve a draft and its immutable release history.',
        parameters: [pathParameter('contractId', 'Contract identifier.')],
        responses: {
          200: jsonResponse('The registry entry.', opaqueDocument('ContractRegistryEntry', 'Draft plus immutable release history.')),
          401: errorResponse,
          404: errorResponse,
        },
      },
      put: {
        tags: ['Authoring'],
        operationId: 'saveContractDraft',
        summary: 'Atomically persist an authenticated draft.',
        parameters: [pathParameter('contractId', 'Contract identifier.')],
        requestBody: jsonBody(opaqueDocument('ContextContract', 'The full draft contract to persist.')),
        responses: {
          200: jsonResponse('The persisted registry entry.', opaqueDocument('ContractRegistryEntry', 'Draft plus immutable release history.')),
          401: errorResponse,
          403: errorResponse,
          422: errorResponse,
        },
      },
    },
    '/v1/contracts/{contractId}/releases': {
      post: {
        tags: ['Releases'],
        operationId: 'publishRelease',
        summary: 'Validate, version, hash, and publish an immutable release.',
        parameters: [pathParameter('contractId', 'Contract identifier.')],
        requestBody: jsonBody(opaqueDocument('PublishRequest', 'The contract to publish, an optional semantic version bump, and release notes.')),
        responses: {
          201: jsonResponse('The new immutable release.', opaqueDocument('ContractRelease', 'Version, digest, publication time, and the frozen contract.')),
          401: errorResponse,
          403: errorResponse,
          422: jsonResponse('Publish gates failed. `issues` lists every unmet requirement.', { $ref: '#/components/schemas/ValidationError' }),
        },
      },
    },
    '/v1/contracts/{contractId}/diffs': {
      get: {
        tags: ['Releases'],
        operationId: 'diffReleases',
        summary: 'Compare two immutable releases and return a digest-backed change artifact.',
        parameters: [
          pathParameter('contractId', 'Contract identifier.'),
          { name: 'from', in: 'query', required: true, schema: { type: 'string' }, description: 'Digest of the baseline release.' },
          { name: 'to', in: 'query', required: false, schema: { type: 'string' }, description: 'Digest of the comparison release. Defaults to the working draft.' },
        ],
        responses: {
          200: jsonResponse('The change artifact.', opaqueDocument('ReleaseDiffArtifact', 'Digest-backed set of semantic, policy, binding, and operation changes.')),
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/v1/contracts/{contractId}/restores': {
      post: {
        tags: ['Releases'],
        operationId: 'restoreRelease',
        summary: 'Restore an immutable release as a new unpublished draft.',
        description: 'Never moves the live pointer and never rewrites release history.',
        parameters: [pathParameter('contractId', 'Contract identifier.')],
        requestBody: jsonBody({ type: 'object', properties: { digest: { type: 'string' } }, required: ['digest'] }),
        responses: {
          201: jsonResponse('The registry entry with the restored draft.', opaqueDocument('ContractRegistryEntry', 'Draft plus immutable release history.')),
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/v1/contracts/{contractId}/rollbacks': {
      post: {
        tags: ['Releases'],
        operationId: 'rollbackRelease',
        summary: 'Move the active release pointer with an attributed, mandatory rationale.',
        parameters: [pathParameter('contractId', 'Contract identifier.')],
        requestBody: jsonBody({
          type: 'object',
          properties: { digest: { type: 'string' }, rationale: { type: 'string', minLength: 12 } },
          required: ['digest', 'rationale'],
        }),
        responses: {
          201: jsonResponse('The updated entry and the appended audit event.', {
            type: 'object',
            properties: {
              entry: opaqueDocument('ContractRegistryEntry', 'Updated registry entry.'),
              event: opaqueDocument('ReleaseControlEvent', 'Append-only, actor-attributed control event.'),
            },
          }),
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/v1/contracts/{contractId}/release-events': {
      get: {
        tags: ['Releases'],
        operationId: 'listReleaseEvents',
        summary: 'List append-only active-release control events.',
        parameters: [pathParameter('contractId', 'Contract identifier.')],
        responses: {
          200: jsonResponse('Control events, oldest first.', { type: 'array', items: opaqueDocument('ReleaseControlEvent', 'Append-only control event.') }),
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/v1/contracts/{contractId}/runtime-status': {
      post: {
        tags: ['Releases'],
        operationId: 'setRuntimeStatus',
        summary: 'Suspend or resume runtime compilation without mutating releases.',
        parameters: [pathParameter('contractId', 'Contract identifier.')],
        requestBody: jsonBody({
          type: 'object',
          properties: { status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED'] } },
          required: ['status'],
        }),
        responses: {
          200: jsonResponse('The updated registry entry.', opaqueDocument('ContractRegistryEntry', 'Draft plus immutable release history.')),
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/v1/workspaces': {
      get: {
        tags: ['Authoring'],
        operationId: 'listWorkspaces',
        summary: 'List industry workspaces and shared ontology counts.',
        responses: {
          200: jsonResponse('Workspace summaries.', { type: 'array', items: opaqueDocument('WorkspaceSummary', 'Workspace summary.') }),
          401: errorResponse,
        },
      },
    },
    '/v1/workspaces/{workspaceId}': {
      get: {
        tags: ['Authoring'],
        operationId: 'getWorkspace',
        summary: 'Retrieve a workspace and its shared ontology.',
        parameters: [pathParameter('workspaceId', 'Workspace identifier.')],
        responses: {
          200: jsonResponse('The workspace.', opaqueDocument('IndustryWorkspace', 'Workspace with its shared ontology.')),
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/v1/workspaces/{workspaceId}/ontology': {
      put: {
        tags: ['Authoring'],
        operationId: 'saveWorkspaceOntology',
        summary: 'Persist the workspace ontology and synchronize contract compatibility snapshots.',
        parameters: [pathParameter('workspaceId', 'Workspace identifier.')],
        requestBody: jsonBody({
          type: 'object',
          properties: { ontology: opaqueDocument('IndustryOntology', 'The shared ontology to persist.') },
          required: ['ontology'],
        }),
        responses: {
          200: jsonResponse('The updated workspace.', opaqueDocument('IndustryWorkspace', 'Workspace with its shared ontology.')),
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          422: jsonResponse('The ontology failed validation.', { $ref: '#/components/schemas/ValidationError' }),
        },
      },
    },
    '/v1/imports/preview': {
      post: {
        tags: ['Authoring'],
        operationId: 'previewImport',
        summary: 'Analyze a schema source and return a non-mutating, checksum-stamped proposal.',
        description: 'Accepts OpenAPI, JSON Schema, RDF/XML, Turtle, or CSV.',
        requestBody: jsonBody(opaqueDocument('ImportPreviewRequest', 'Contract identifier, source name, source text, and optional format hint.')),
        responses: {
          200: jsonResponse('The import proposal.', opaqueDocument('ImportProposal', 'Proposed types, relationships, and collisions.')),
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          422: errorResponse,
        },
      },
    },
    '/v1/bindings/preview': {
      post: {
        tags: ['Authoring'],
        operationId: 'previewBinding',
        summary: 'Discover operations or tabular fields and flatten them for semantic mapping.',
        requestBody: jsonBody(opaqueDocument('BindingPreviewRequest', 'Contract or workspace scope, source name, and source text.')),
        responses: {
          200: jsonResponse('The binding preview.', opaqueDocument('BindingPreview', 'Discovered operations and response fields.')),
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          422: errorResponse,
        },
      },
    },
    '/v1/connectors': {
      get: {
        tags: ['Connectors'],
        operationId: 'listConnectors',
        summary: 'List the governed connector catalog and runtime metadata.',
        responses: {
          200: jsonResponse('The connector catalog.', {
            type: 'object',
            properties: {
              workspaceMode: { type: 'string' },
              connectors: { type: 'array', items: opaqueDocument('ConnectorTemplate', 'Provider template.') },
            },
          }),
          401: errorResponse,
        },
      },
    },
    '/v1/connectors/validate': {
      post: {
        tags: ['Connectors'],
        operationId: 'validateConnector',
        summary: 'Validate resource scope, read-only query safety, credential resolution, and driver availability.',
        requestBody: jsonBody({
          type: 'object',
          properties: { binding: opaqueDocument('SourceBinding', 'The staged binding to validate.') },
          required: ['binding'],
        }),
        responses: {
          200: jsonResponse('Validation result.', opaqueDocument('ConnectorValidationResult', 'Per-check status, driver, and credential state.')),
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          422: jsonResponse('The binding is invalid.', opaqueDocument('ConnectorValidationResult', 'Per-check status, driver, and credential state.')),
        },
      },
    },
    '/v1/connectors/discover': {
      post: {
        tags: ['Connectors'],
        operationId: 'discoverConnector',
        summary: 'Discover and normalize live provider fields within a governed binding scope.',
        requestBody: jsonBody(opaqueDocument('ConnectorDiscoveryRequest', 'Binding plus the contract or workspace scope it belongs to.')),
        responses: {
          200: jsonResponse('The discovered fields.', opaqueDocument('BindingPreview', 'Discovered operations and response fields.')),
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          422: errorResponse,
        },
      },
    },
    '/v1/connectors/health': {
      get: {
        tags: ['Connectors'],
        operationId: 'listConnectorHealth',
        summary: 'List durable connector health history for the caller\'s tenant.',
        parameters: [{ name: 'bindingId', in: 'query', required: false, schema: { type: 'string' }, description: 'Restrict to one binding.' }],
        responses: {
          200: jsonResponse('Health records, newest first.', {
            type: 'object',
            properties: { records: { type: 'array', items: opaqueDocument('ConnectorHealthRecord', 'One probe result.') } },
          }),
          401: errorResponse,
        },
      },
      post: {
        tags: ['Connectors'],
        operationId: 'probeConnectorHealth',
        summary: 'Resolve server-side credentials, run a safe provider probe, and persist telemetry.',
        requestBody: jsonBody({
          type: 'object',
          properties: { binding: opaqueDocument('SourceBinding', 'The binding to probe.') },
          required: ['binding'],
        }),
        responses: {
          200: jsonResponse('The persisted health record.', opaqueDocument('ConnectorHealthRecord', 'One probe result.')),
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    '/v1/assurance/runs': {
      get: {
        tags: ['Governance'],
        operationId: 'listAssuranceRuns',
        summary: 'List immutable assurance artifacts for a contract.',
        parameters: [contractIdParameter('Contract whose runs to list.')],
        responses: {
          200: jsonResponse('Assurance runs, newest first.', { type: 'array', items: opaqueDocument('AssuranceRun', 'Digest-backed assurance artifact.') }),
          400: errorResponse,
          401: errorResponse,
        },
      },
      post: {
        tags: ['Governance'],
        operationId: 'createAssuranceRun',
        summary: 'Execute deterministic contract gates and persist a digest-backed run.',
        requestBody: jsonBody(opaqueDocument('AssuranceRunRequest', 'Contract identifier and the draft contract to assure.')),
        responses: {
          201: jsonResponse('The persisted assurance run.', opaqueDocument('AssuranceRun', 'Digest-backed assurance artifact.')),
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/v1/assurance/runs/{runId}': {
      get: {
        tags: ['Governance'],
        operationId: 'getAssuranceRun',
        summary: 'Retrieve one immutable assurance artifact.',
        parameters: [pathParameter('runId', 'Assurance run identifier.')],
        responses: {
          200: jsonResponse('The assurance run.', opaqueDocument('AssuranceRun', 'Digest-backed assurance artifact.')),
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/v1/reviews': {
      get: {
        tags: ['Governance'],
        operationId: 'listReviews',
        summary: 'List open and decided governance reviews for a contract.',
        parameters: [contractIdParameter('Contract whose reviews to list.')],
        responses: {
          200: jsonResponse('Reviews, newest first.', { type: 'array', items: opaqueDocument('ReviewRequestArtifact', 'Digest-backed review request and decision.') }),
          400: errorResponse,
          401: errorResponse,
        },
      },
      post: {
        tags: ['Governance'],
        operationId: 'createReview',
        summary: 'Submit a contract claim for authenticated review.',
        requestBody: jsonBody(opaqueDocument('CreateReviewRequest', 'Contract, target kind, target identifier, impact, and evidence references.')),
        responses: {
          201: jsonResponse('The open review request.', opaqueDocument('ReviewRequestArtifact', 'Digest-backed review request.')),
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    '/v1/reviews/{reviewId}/decisions': {
      post: {
        tags: ['Governance'],
        operationId: 'decideReview',
        summary: 'Record a rationale-backed approval, exception, or rejection.',
        parameters: [pathParameter('reviewId', 'Review identifier.')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            decision: { type: 'string', enum: ['APPROVED', 'APPROVED_WITH_EXCEPTION', 'REJECTED'] },
            rationale: { type: 'string', minLength: 12 },
          },
          required: ['decision', 'rationale'],
        }),
        responses: {
          201: jsonResponse('The decided review.', opaqueDocument('ReviewRequestArtifact', 'Digest-backed review request and decision.')),
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/v1/runtime-approvals': {
      get: {
        tags: ['Governance'],
        operationId: 'listRuntimeApprovals',
        summary: 'List runtime approval requests for a contract.',
        parameters: [contractIdParameter('Contract whose approvals to list.')],
        responses: {
          200: jsonResponse('Approvals, newest first.', { type: 'array', items: opaqueDocument('RuntimeApprovalArtifact', 'Pending plan and its approval decision.') }),
          400: errorResponse,
          401: errorResponse,
        },
      },
    },
    '/v1/runtime-approvals/{approvalId}/decisions': {
      post: {
        tags: ['Governance'],
        operationId: 'decideRuntimeApproval',
        summary: 'Approve or reject a pending runtime approval.',
        description: 'Separation of duty is enforced: the principal who requested the approval cannot decide it.',
        parameters: [pathParameter('approvalId', 'Runtime approval identifier.')],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            decision: { type: 'string', enum: ['APPROVED', 'REJECTED'] },
            rationale: { type: 'string', minLength: 12 },
          },
          required: ['decision', 'rationale'],
        }),
        responses: {
          201: jsonResponse('The decided approval.', opaqueDocument('RuntimeApprovalArtifact', 'Pending plan and its approval decision.')),
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: jsonResponse('Already decided, expired, or the decider requested it.', { $ref: '#/components/schemas/Error' }),
        },
      },
    },
    '/v1/runtime-approvals/{approvalId}/resume': {
      post: {
        tags: ['Governance'],
        operationId: 'resumeRuntimeApproval',
        summary: 'Issue a signed plan for an approved runtime approval.',
        description: 'The renewed plan is bound to the operator resuming it, not to the original requester.',
        parameters: [pathParameter('approvalId', 'Runtime approval identifier.')],
        responses: {
          200: jsonResponse('The resumed approval and its signed plan.', {
            type: 'object',
            properties: {
              approval: opaqueDocument('RuntimeApprovalArtifact', 'The resumed approval.'),
              plan: { $ref: '#/components/schemas/SignedExecutionPlan' },
            },
          }),
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    '/v1/executions': {
      get: {
        tags: ['Runtime'],
        operationId: 'listExecutions',
        summary: 'List execution receipts for a contract.',
        parameters: [contractIdParameter('Contract whose receipts to list.')],
        responses: {
          200: jsonResponse('Receipts, newest first.', { type: 'array', items: { $ref: '#/components/schemas/ExecutionReceipt' } }),
          400: errorResponse,
          401: errorResponse,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: [
          'An OIDC or Supabase access token. The tenant, organization role, and the permissions',
          'available at execution are all derived from this token — never from a request body.',
          'Send the selected organization in the `X-Lattice-Organization` header when the deployment',
          'resolves membership through Supabase.',
        ].join(' '),
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string', description: 'Stable machine-readable code, for example `PLAN_NOT_FOUND`.' },
          message: { type: 'string', description: 'Human-readable explanation. Never contains secrets or source values.' },
        },
        required: ['error'],
      },
      ValidationError: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          issues: { type: 'array', items: { type: 'string' }, description: 'Every unmet requirement, not just the first.' },
        },
        required: ['error'],
      },
      CompileRequest: {
        type: 'object',
        properties: {
          question: { type: 'string', minLength: 1, description: 'The natural-language question to compile.' },
          contractId: { type: 'string', description: 'Contract to compile against. Defaults to the reference counterparty contract.' },
          contractVersion: { type: 'string', description: 'Fail unless the active release matches this version.' },
          purpose: { type: 'string', description: 'Why the answer is needed.' },
          asOf: { type: 'string', format: 'date-time', description: 'Evaluate evidence validity and freshness as of this instant.' },
          selections: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Governed entity identifiers keyed by entity type, to skip disambiguation.',
          },
        },
        required: ['question'],
        additionalProperties: false,
      },
      CompileResponse: {
        type: 'object',
        properties: {
          resolutionId: { type: 'string' },
          decision: {
            type: 'string',
            enum: ['RESOLVED', 'CLARIFICATION_REQUIRED', 'APPROVAL_REQUIRED', 'INSUFFICIENT_EVIDENCE', 'STALE_CONTEXT', 'UNSUPPORTED', 'DENIED'],
          },
          reasonCodes: { type: 'array', items: { type: 'string' } },
          explanation: { type: 'array', items: { type: 'string' } },
          grounding: {
            type: 'string',
            enum: ['LIVE', 'SIMULATED'],
            description: 'SIMULATED means the context came from documented sample payloads, not live source reads.',
          },
          versions: opaqueDocument('VersionPin', 'Pinned contract, semantic, policy, binding, and API versions.'),
          intentResolution: opaqueDocument('IntentResolution', 'Candidate operations with scores, thresholds, and resolver provenance.'),
          clarification: opaqueDocument('ClarificationContract', 'A typed entity or operation clarification request.'),
          plan: { $ref: '#/components/schemas/SignedExecutionPlan' },
          pendingPlan: opaqueDocument('UnsignedExecutionPlan', 'The plan that will be signed once a human approves.'),
          approval: opaqueDocument('RuntimeApprovalArtifact', 'The created runtime approval request.'),
        },
        required: ['resolutionId', 'decision', 'reasonCodes', 'explanation', 'versions'],
      },
      SignedExecutionPlan: {
        type: 'object',
        description: 'A short-lived capability issued to one subject.',
        properties: {
          schemaVersion: { type: 'string', const: '1.1' },
          planId: { type: 'string' },
          resolutionId: { type: 'string' },
          decision: { type: 'string', const: 'RESOLVED' },
          riskTier: { type: 'string', enum: ['INFORMATIONAL', 'ANALYTICAL', 'PLANNING_DECISION', 'OPERATIONAL_ACTION'] },
          principalId: { type: 'string', description: 'The only principal that may verify or execute this plan.' },
          tenantId: { type: 'string', description: 'The tenant the plan was issued within.' },
          grounding: { type: 'string', enum: ['LIVE', 'SIMULATED'] },
          operation: { type: 'string' },
          intent: opaqueDocument('IntentDecisionEvidence', 'Scores, thresholds, margin, and whether the operation was user-confirmed.'),
          arguments: { type: 'object', additionalProperties: true },
          metrics: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, version: { type: 'string' } } } },
          sourceBindings: { type: 'array', items: { type: 'string' } },
          requiredPermissions: { type: 'array', items: { type: 'string' } },
          expectedResultSchema: { type: 'string' },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
          versions: opaqueDocument('VersionPin', 'Pinned versions.'),
          contractDigest: { type: 'string' },
          expiresAt: { type: 'string', format: 'date-time' },
          nonce: { type: 'string', description: 'Single-use. Spent only by an attempt that passed authorization.' },
          keyId: { type: 'string' },
          signatureAlgorithm: { type: 'string', const: 'Ed25519' },
          signature: { type: 'string', description: 'base64url Ed25519 signature over the unsigned plan.' },
        },
        required: ['schemaVersion', 'planId', 'principalId', 'grounding', 'operation', 'contractDigest', 'expiresAt', 'nonce', 'keyId', 'signature'],
      },
      PlanVerification: {
        type: 'object',
        properties: {
          planId: { type: 'string' },
          valid: { type: 'boolean', description: 'True only when the signature verifies and the plan has not expired.' },
          signatureValid: { type: 'boolean' },
          expired: { type: 'boolean' },
          keyId: { type: 'string' },
          contractDigest: { type: 'string' },
        },
        required: ['planId', 'valid', 'signatureValid', 'expired'],
      },
      ExecutionReceipt: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tenantId: { type: 'string' },
          contractId: { type: 'string' },
          contractVersion: { type: 'string' },
          contractDigest: { type: 'string' },
          planId: { type: 'string' },
          operationId: { type: 'string' },
          principalId: { type: 'string' },
          status: { type: 'string', enum: ['SUCCESS', 'FAILED', 'DENIED'] },
          startedAt: { type: 'string', format: 'date-time' },
          completedAt: { type: 'string', format: 'date-time' },
          requiredPermissions: { type: 'array', items: { type: 'string' } },
          grantedPermissions: { type: 'array', items: { type: 'string' }, description: 'Derived from the identity, not the request.' },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
          bindingResults: {
            type: 'array',
            items: opaqueDocument('BindingExecutionResult', 'Per-binding outcome, including whether it read a live source or a sample.'),
          },
          artifactDigest: { type: 'string' },
        },
        required: ['id', 'contractId', 'planId', 'principalId', 'status', 'artifactDigest'],
      },
    },
  },
}
