import { createHash, generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { URL } from 'node:url'
import { ContextCompiler } from '@lattice/compiler-core'
import { previewBindingSource, previewImport } from '@lattice/importer-core'
import {
  connectorCatalog,
  counterpartyRiskContract,
  type AssuranceRunRequest,
  type CompileRequest,
  type CompileResponse,
  type BindingPreviewRequest,
  type ConnectorValidationRequest,
  type CreateReviewDecisionRequest,
  type CreateReviewRequest,
  type CreateRuntimeApprovalDecisionRequest,
  type ContextContract,
  type ContractSummary,
  type CreateContractRequest,
  type ExecutePlanRequest,
  type ImportPreviewRequest,
  type IndustryOntology,
  type SignedExecutionPlan,
  type UnsignedExecutionPlan,
  type WorkspaceSummary,
} from '@lattice/contracts'
import { executeBindings } from './adapters.js'
import { runAssurance } from './assurance.js'
import { AssuranceStore } from './assuranceStore.js'
import { ContractRegistry, ContractValidationError, type PublishRequest } from './registry.js'
import { ReviewStore } from './reviewStore.js'
import { ExecutionStore } from './executionStore.js'
import { RuntimeApprovalStore } from './runtimeApprovalStore.js'
import { validateConnectorBinding } from './connectors.js'

const port = Number(process.env.PORT ?? 8787)
const studioOrigin = process.env.LATTICE_STUDIO_ORIGIN ?? 'http://127.0.0.1:5173'
const dataDirectory = process.env.LATTICE_DATA_DIR ?? (process.env.VERCEL ? join(tmpdir(), 'lattice-api-data') : join(process.cwd(), 'data'))
const registry = await ContractRegistry.open(join(dataDirectory, 'contract-registry.json'), counterpartyRiskContract)
const assuranceStore = await AssuranceStore.open(join(dataDirectory, 'assurance-runs.json'))
const reviewStore = await ReviewStore.open(join(dataDirectory, 'review-artifacts.json'))
const runtimeApprovalStore = await RuntimeApprovalStore.open(join(dataDirectory, 'runtime-approvals.json'))
const executionStore = await ExecutionStore.open(join(dataDirectory, 'execution-receipts.json'))
const clarifications = new Map<string, { request: CompileRequest; typeId: string }>()
const plans = new Map<string, SignedExecutionPlan>()
const planContractIds = new Map<string, string>()
const keyId = 'lattice-dev-ed25519-1'
const { privateKey, publicKey } = generateKeyPairSync('ed25519')

const server = createServer(async (request, response) => {
  setCors(response)
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end()
    return
  }

  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

    if (request.method === 'GET' && url.pathname === '/health') {
      send(response, 200, { status: 'ok', service: 'lattice-context-api' })
      return
    }

    if (request.method === 'GET' && url.pathname === '/v1/connectors') {
      if (!authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      send(response, 200, { workspaceMode: 'SINGLE_WORKSPACE', connectors: connectorCatalog })
      return
    }

    if (request.method === 'GET' && url.pathname === '/v1/workspaces') {
      const summaries: WorkspaceSummary[] = registry.listWorkspaces().map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        domain: workspace.domain,
        description: workspace.description,
        ontologyVersion: workspace.ontology.version,
        entityTypeCount: workspace.ontology.entityTypes.length,
        relationshipTypeCount: workspace.ontology.relationshipTypes.length,
        bindingCount: workspace.ontology.bindings?.length ?? 0,
        contractCount: workspace.contractIds.length,
        updatedAt: workspace.updatedAt,
        ...(workspace.ontologyGeneration ? { generatedFrom: { sourceFormCount: workspace.ontologyGeneration.sourceFormCount, mappedPercent: workspace.ontologyGeneration.mappedPercent } } : {}),
      }))
      send(response, 200, summaries)
      return
    }

    const workspaceMatch = url.pathname.match(/^\/v1\/workspaces\/([^/]+)$/)
    if (request.method === 'GET' && workspaceMatch?.[1]) {
      const workspace = registry.getWorkspace(workspaceMatch[1])
      if (!workspace) {
        send(response, 404, { error: 'WORKSPACE_NOT_FOUND' })
        return
      }
      send(response, 200, workspace)
      return
    }

    const workspaceOntologyMatch = url.pathname.match(/^\/v1\/workspaces\/([^/]+)\/ontology$/)
    if (request.method === 'PUT' && workspaceOntologyMatch?.[1]) {
      if (!authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const body = await readJson<{ ontology?: IndustryOntology }>(request)
      if (!body.ontology) {
        send(response, 400, { error: 'ONTOLOGY_REQUIRED' })
        return
      }
      try {
        send(response, 200, await registry.saveWorkspaceOntology(workspaceOntologyMatch[1], body.ontology))
      } catch (error) {
        if (error instanceof ContractValidationError) send(response, 422, { error: error.message, issues: error.issues })
        else send(response, 404, { error: error instanceof Error ? error.message : 'WORKSPACE_NOT_FOUND' })
      }
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/connectors/validate') {
      const identity = authenticate(request)
      if (!identity) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const body = await readJson<ConnectorValidationRequest>(request)
      if (!body.binding?.connector) {
        send(response, 400, { error: 'CONNECTOR_BINDING_REQUIRED' })
        return
      }
      const result = validateConnectorBinding(body.binding)
      console.info('[connector.validate]', { principalId: identity.principalId, bindingId: body.binding.id, provider: result.provider, status: result.status, driver: result.driver, credentialState: result.credentialState })
      send(response, result.status === 'INVALID' ? 422 : 200, result)
      return
    }

    if (request.method === 'GET' && url.pathname === '/v1/contracts/active') {
      const contractId = url.searchParams.get('contractId') ?? counterpartyRiskContract.id
      const published = registry.latestPublished(contractId)
      if (!published) {
        send(response, 404, { error: 'PUBLISHED_CONTRACT_NOT_FOUND' })
        return
      }
      send(response, 200, published)
      return
    }

    if (request.method === 'GET' && url.pathname === '/v1/contracts') {
      const summaries: ContractSummary[] = registry.list().map((entry) => {
        const latest = entry.releases.at(-1)
        return {
          contractId: entry.contractId,
          workspaceId: entry.draft.ontologyRef?.workspaceId ?? `workspace-${entry.draft.domain}`,
          ontologyVersion: entry.draft.ontologyRef?.version ?? entry.draft.versions.semantic.split('@').at(-1) ?? '0.0.0',
          conceptScopeCount: entry.draft.conceptScope?.length ?? entry.draft.entityTypes.length,
          name: entry.draft.name,
          domain: entry.draft.domain,
          workflow: entry.draft.workflow,
          draftVersion: entry.draft.version,
          releaseStatus: entry.draft.releaseStatus,
          updatedAt: entry.updatedAt,
          entityTypeCount: entry.draft.entityTypes.length,
          relationshipTypeCount: entry.draft.relationshipTypes.length,
          releaseCount: entry.releases.length,
          runtimeStatus: entry.runtimeStatus,
          ...(latest ? { latestRelease: {
            version: latest.version,
            digest: latest.digest,
            publishedAt: latest.publishedAt,
            notes: latest.notes,
          } } : {}),
        }
      })
      send(response, 200, summaries)
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/contracts') {
      if (!authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const body = await readJson<CreateContractRequest>(request)
      const missing = [body.name, body.description, body.domain, body.workflow, body.owner].some((value) => !value?.trim())
      if (missing || !Array.isArray(body.competencyQuestions) || body.competencyQuestions.length === 0) {
        send(response, 400, { error: 'INVALID_CONTRACT_BRIEF', message: 'Name, description, domain, workflow, owner, and at least one competency question are required.' })
        return
      }
      const entry = await registry.create(body)
      send(response, 201, entry)
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/imports/preview') {
      if (!authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const body = await readJson<ImportPreviewRequest>(request)
      if (!body.contractId?.trim() || !body.sourceName?.trim() || !body.sourceText?.trim()) {
        send(response, 400, { error: 'INVALID_IMPORT_SOURCE', message: 'Contract, source name, and schema text are required.' })
        return
      }
      const entry = registry.get(body.contractId)
      if (!entry) {
        send(response, 404, { error: 'CONTRACT_NOT_FOUND' })
        return
      }
      try {
        send(response, 200, previewImport({
          contract: entry.draft,
          sourceName: body.sourceName,
          sourceText: body.sourceText,
          format: body.format,
        }))
      } catch (error) {
        send(response, 422, {
          error: 'IMPORT_PREVIEW_FAILED',
          message: error instanceof Error ? error.message : 'The schema could not be analyzed.',
        })
      }
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/bindings/preview') {
      if (!authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const body = await readJson<BindingPreviewRequest>(request)
      if ((!body.contractId?.trim() && !body.workspaceId?.trim()) || !body.sourceName?.trim() || !body.sourceText?.trim()) {
        send(response, 400, { error: 'INVALID_BINDING_SOURCE', message: 'A contract or workspace, source name, and source schema text are required.' })
        return
      }
      if (body.contractId && !registry.get(body.contractId)) {
        send(response, 404, { error: 'CONTRACT_NOT_FOUND' })
        return
      }
      if (body.workspaceId && !registry.getWorkspace(body.workspaceId)) {
        send(response, 404, { error: 'WORKSPACE_NOT_FOUND' })
        return
      }
      try {
        send(response, 200, previewBindingSource({ ...body, contractId: body.contractId ?? `ontology:${body.workspaceId}` }))
      } catch (error) {
        send(response, 422, {
          error: 'BINDING_PREVIEW_FAILED',
          message: error instanceof Error ? error.message : 'The API source could not be analyzed.',
        })
      }
      return
    }

    if (request.method === 'GET' && url.pathname === '/v1/assurance/runs') {
      if (!authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const contractId = url.searchParams.get('contractId')
      if (!contractId) {
        send(response, 400, { error: 'CONTRACT_ID_REQUIRED' })
        return
      }
      send(response, 200, assuranceStore.list(contractId))
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/assurance/runs') {
      if (!authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const body = await readJson<AssuranceRunRequest>(request)
      if (!body.contract || body.contractId !== body.contract.id) {
        send(response, 400, { error: 'CONTRACT_ID_MISMATCH' })
        return
      }
      if (!registry.get(body.contractId)) {
        send(response, 404, { error: 'CONTRACT_NOT_FOUND' })
        return
      }
      send(response, 201, await assuranceStore.append(runAssurance(body.contract)))
      return
    }

    if (request.method === 'GET' && url.pathname === '/v1/reviews') {
      if (!authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const contractId = url.searchParams.get('contractId')
      if (!contractId) {
        send(response, 400, { error: 'CONTRACT_ID_REQUIRED' })
        return
      }
      send(response, 200, reviewStore.list(contractId))
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/reviews') {
      const principal = authenticate(request)
      if (!principal) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const body = await readJson<CreateReviewRequest>(request)
      const entry = registry.get(body.contractId)
      if (!entry) {
        send(response, 404, { error: 'CONTRACT_NOT_FOUND' })
        return
      }
      const entityType = body.targetKind === 'ENTITY_TYPE' ? entry.draft.entityTypes.find((type) => type.id === body.targetId) : undefined
      const binding = body.targetKind === 'SOURCE_BINDING' ? entry.draft.bindings.find((item) => item.id === body.targetId) : undefined
      const policy = body.targetKind === 'POLICY' ? entry.draft.policies.find((item) => item.id === body.targetId) : undefined
      if (!entityType && !binding && !policy) {
        send(response, 404, { error: 'REVIEW_TARGET_NOT_FOUND' })
        return
      }
      const review = await reviewStore.create({
        contractId: entry.contractId,
        contractVersion: entry.draft.version,
        targetKind: body.targetKind,
        targetId: body.targetId,
        targetLabel: entityType?.label ?? binding?.sourceSystem ?? policy!.label,
        impact: entityType?.impact ?? (policy?.riskTier === 'OPERATIONAL_ACTION' ? 'CRITICAL' : policy?.riskTier === 'PLANNING_DECISION' ? 'HIGH' : 'MEDIUM'),
        evidenceRefs: body.evidenceRefs ?? [],
      }, principal.principalId)
      send(response, 201, review)
      return
    }

    const reviewDecisionMatch = url.pathname.match(/^\/v1\/reviews\/([^/]+)\/decisions$/)
    if (request.method === 'POST' && reviewDecisionMatch?.[1]) {
      const principal = authenticate(request)
      if (!principal) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const body = await readJson<CreateReviewDecisionRequest>(request)
      if (!['APPROVED', 'APPROVED_WITH_EXCEPTION', 'REJECTED'].includes(body.decision) || !body.rationale?.trim() || body.rationale.trim().length < 12) {
        send(response, 400, { error: 'INVALID_REVIEW_DECISION', message: 'A valid decision and rationale of at least 12 characters are required.' })
        return
      }
      try {
        send(response, 201, await reviewStore.decide(reviewDecisionMatch[1], body.decision, body.rationale.trim(), principal.principalId))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'REVIEW_DECISION_FAILED'
        send(response, message === 'REVIEW_NOT_FOUND' ? 404 : 409, { error: message })
      }
      return
    }

    const assuranceRunMatch = url.pathname.match(/^\/v1\/assurance\/runs\/([^/]+)$/)
    if (request.method === 'GET' && assuranceRunMatch?.[1]) {
      if (!authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const run = assuranceStore.get(assuranceRunMatch[1])
      if (!run) {
        send(response, 404, { error: 'ASSURANCE_RUN_NOT_FOUND' })
        return
      }
      send(response, 200, run)
      return
    }

    const contractMatch = url.pathname.match(/^\/v1\/contracts\/([^/]+)$/)
    if (request.method === 'GET' && contractMatch?.[1]) {
      const entry = registry.get(contractMatch[1])
      if (!entry) {
        send(response, 404, { error: 'CONTRACT_NOT_FOUND' })
        return
      }
      send(response, 200, entry)
      return
    }

    if (request.method === 'PUT' && contractMatch?.[1]) {
      if (!authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const body = await readJson<{ contract?: ContextContract }>(request)
      if (!body.contract || body.contract.id !== contractMatch[1]) {
        send(response, 400, { error: 'CONTRACT_ID_MISMATCH' })
        return
      }
      send(response, 200, await registry.saveDraft(body.contract))
      return
    }

    const releaseMatch = url.pathname.match(/^\/v1\/contracts\/([^/]+)\/releases$/)
    if (request.method === 'POST' && releaseMatch?.[1]) {
      if (!authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const body = await readJson<PublishRequest>(request)
      if (!body.contract || body.contract.id !== releaseMatch[1]) {
        send(response, 400, { error: 'CONTRACT_ID_MISMATCH' })
        return
      }
      const published = await registry.publish(body)
      send(response, 201, published)
      return
    }

    const restoreMatch = url.pathname.match(/^\/v1\/contracts\/([^/]+)\/restores$/)
    if (request.method === 'POST' && restoreMatch?.[1]) {
      if (!authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const body = await readJson<{ digest?: string }>(request)
      if (!body.digest) {
        send(response, 400, { error: 'RELEASE_DIGEST_REQUIRED' })
        return
      }
      try {
        send(response, 200, await registry.restoreRelease(restoreMatch[1], body.digest))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'RESTORE_FAILED'
        send(response, message === 'CONTRACT_NOT_FOUND' || message === 'RELEASE_NOT_FOUND' ? 404 : 409, { error: message })
      }
      return
    }

    const runtimeStatusMatch = url.pathname.match(/^\/v1\/contracts\/([^/]+)\/runtime-status$/)
    if (request.method === 'POST' && runtimeStatusMatch?.[1]) {
      if (!authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const body = await readJson<{ status?: 'ACTIVE' | 'SUSPENDED' }>(request)
      if (!body.status || !['ACTIVE', 'SUSPENDED'].includes(body.status)) {
        send(response, 400, { error: 'INVALID_RUNTIME_STATUS' })
        return
      }
      try {
        send(response, 200, await registry.setRuntimeStatus(runtimeStatusMatch[1], body.status))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'RUNTIME_STATUS_FAILED'
        send(response, message === 'CONTRACT_NOT_FOUND' ? 404 : 409, { error: message })
      }
      return
    }

    if (request.method === 'GET' && url.pathname === '/v1/keys/current') {
      send(response, 200, {
        keyId,
        algorithm: 'Ed25519',
        publicKey: publicKey.export({ format: 'jwk' }),
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/v1/runtime-approvals') {
      if (!authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const contractId = url.searchParams.get('contractId')
      if (!contractId) {
        send(response, 400, { error: 'CONTRACT_ID_REQUIRED' })
        return
      }
      send(response, 200, runtimeApprovalStore.list(contractId))
      return
    }

    if (request.method === 'GET' && url.pathname === '/v1/executions') {
      if (!authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const contractId = url.searchParams.get('contractId')
      if (!contractId) {
        send(response, 400, { error: 'CONTRACT_ID_REQUIRED' })
        return
      }
      send(response, 200, executionStore.list(contractId))
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/compile') {
      const principal = authenticate(request)
      if (!principal) {
        send(response, 401, { error: 'UNAUTHENTICATED', message: 'Use a Bearer token; identity is derived from the token, never the request body.' })
        return
      }

      const body = await readJson<CompileRequest & { tenantId?: unknown; principalId?: unknown }>(request)
      if (body.tenantId !== undefined || body.principalId !== undefined) {
        send(response, 400, { error: 'IDENTITY_IN_BODY_FORBIDDEN', message: 'tenantId and principalId must come from authenticated server context.' })
        return
      }
      if (!body.question?.trim()) {
        send(response, 400, { error: 'QUESTION_REQUIRED' })
        return
      }

      const selectedContractId = body.contractId ?? counterpartyRiskContract.id
      const selectedContract = registry.latestPublished(selectedContractId)
      if (!selectedContract) {
        send(response, 409, { error: 'CONTRACT_NOT_PUBLISHED', message: 'Publish this contract before compiling runtime questions.' })
        return
      }
      const result = await prepareCompile(new ContextCompiler(selectedContract).compile(body), selectedContract, principal.principalId)
      if (result.clarification) {
        clarifications.set(result.clarification.id, {
          request: body,
          typeId: result.clarification.entityTypeId,
        })
      }
      send(response, result.decision === 'RESOLVED' ? 200 : result.decision === 'APPROVAL_REQUIRED' ? 202 : 422, { ...result, principal })
      return
    }

    const clarificationMatch = url.pathname.match(/^\/v1\/clarifications\/([^/]+)$/)
    if (request.method === 'POST' && clarificationMatch?.[1]) {
      const principal = authenticate(request)
      if (!principal) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const pending = clarifications.get(clarificationMatch[1])
      if (!pending) {
        send(response, 404, { error: 'CLARIFICATION_NOT_FOUND' })
        return
      }
      const body = await readJson<{ entityId?: string }>(request)
      if (!body.entityId) {
        send(response, 400, { error: 'ENTITY_ID_REQUIRED' })
        return
      }
      const selectedContract = registry.latestPublished(pending.request.contractId ?? counterpartyRiskContract.id)
      if (!selectedContract) {
        send(response, 409, { error: 'CONTRACT_NOT_PUBLISHED' })
        return
      }
      const result = await prepareCompile(
        new ContextCompiler(selectedContract).compile({
          ...pending.request,
          selections: { ...pending.request.selections, [pending.typeId]: body.entityId },
        }), selectedContract, principal.principalId,
      )
      if (result.decision === 'RESOLVED') clarifications.delete(clarificationMatch[1])
      send(response, result.decision === 'RESOLVED' ? 200 : result.decision === 'APPROVAL_REQUIRED' ? 202 : 422, { ...result, principal })
      return
    }

    const runtimeDecisionMatch = url.pathname.match(/^\/v1\/runtime-approvals\/([^/]+)\/decisions$/)
    if (request.method === 'POST' && runtimeDecisionMatch?.[1]) {
      const principal = authenticate(request)
      if (!principal) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const body = await readJson<CreateRuntimeApprovalDecisionRequest>(request)
      if (!['APPROVED', 'REJECTED'].includes(body.decision) || !body.rationale?.trim() || body.rationale.trim().length < 12) {
        send(response, 400, { error: 'INVALID_RUNTIME_DECISION', message: 'A decision and rationale of at least 12 characters are required.' })
        return
      }
      try {
        send(response, 201, await runtimeApprovalStore.decide(runtimeDecisionMatch[1], body.decision, body.rationale.trim(), principal.principalId))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'RUNTIME_APPROVAL_DECISION_FAILED'
        send(response, message === 'RUNTIME_APPROVAL_NOT_FOUND' ? 404 : 409, { error: message })
      }
      return
    }

    const runtimeResumeMatch = url.pathname.match(/^\/v1\/runtime-approvals\/([^/]+)\/resume$/)
    if (request.method === 'POST' && runtimeResumeMatch?.[1]) {
      if (!authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const approval = runtimeApprovalStore.get(runtimeResumeMatch[1])
      if (!approval) {
        send(response, 404, { error: 'RUNTIME_APPROVAL_NOT_FOUND' })
        return
      }
      if (approval.status === 'RESUMED' && approval.signedPlanId) {
        send(response, 200, { approval, plan: plans.get(approval.signedPlanId) })
        return
      }
      if (approval.status !== 'APPROVED') {
        send(response, 409, { error: 'RUNTIME_APPROVAL_NOT_APPROVED' })
        return
      }
      const activeContract = registry.latestPublished(approval.contractId)
      if (!activeContract || activeContract.digest !== approval.contractDigest) {
        send(response, 409, { error: 'APPROVED_RELEASE_NO_LONGER_ACTIVE' })
        return
      }
      const now = new Date()
      const renewedPlan: UnsignedExecutionPlan = {
        ...approval.pendingPlan,
        planId: `plan_${randomUUID()}`,
        expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
        nonce: randomUUID(),
      }
      const signedPlan = signAndStore(renewedPlan, approval.contractId)
      const resumed = await runtimeApprovalStore.markResumed(approval.id, signedPlan.planId, now)
      send(response, 200, { approval: resumed, plan: signedPlan })
      return
    }

    const verifyMatch = url.pathname.match(/^\/v1\/plans\/([^/]+)\/verify$/)
    if (request.method === 'POST' && verifyMatch?.[1]) {
      const plan = plans.get(verifyMatch[1])
      if (!plan) {
        send(response, 404, { error: 'PLAN_NOT_FOUND' })
        return
      }
      const valid = verifyPlan(plan)
      const expired = Date.now() > new Date(plan.expiresAt).getTime()
      send(response, valid && !expired ? 200 : 422, {
        planId: plan.planId,
        valid: valid && !expired,
        signatureValid: valid,
        expired,
        keyId: plan.keyId,
        contractDigest: plan.contractDigest,
      })
      return
    }

    const executeMatch = url.pathname.match(/^\/v1\/plans\/([^/]+)\/execute$/)
    if (request.method === 'POST' && executeMatch?.[1]) {
      const principal = authenticate(request)
      if (!principal) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const plan = plans.get(executeMatch[1])
      const contractId = planContractIds.get(executeMatch[1])
      if (!plan || !contractId) {
        send(response, 404, { error: 'PLAN_NOT_FOUND' })
        return
      }
      if (!verifyPlan(plan) || Date.now() > new Date(plan.expiresAt).getTime()) {
        send(response, 422, { error: 'PLAN_INVALID_OR_EXPIRED' })
        return
      }
      if (executionStore.findByPlanId(plan.planId)) {
        send(response, 409, { error: 'PLAN_NONCE_ALREADY_CONSUMED' })
        return
      }
      const activeContract = registry.latestPublished(contractId)
      if (!activeContract || activeContract.digest !== plan.contractDigest) {
        send(response, 409, { error: 'PLAN_RELEASE_NO_LONGER_ACTIVE' })
        return
      }
      const body = await readJson<ExecutePlanRequest>(request)
      const grantedPermissions = Array.isArray(body.grantedPermissions) ? [...new Set(body.grantedPermissions)] : []
      const missingPermissions = plan.requiredPermissions.filter((permission) => !grantedPermissions.includes(permission))
      const startedAt = new Date().toISOString()
      if (missingPermissions.length > 0) {
        const receipt = await executionStore.append({
          contractId,
          contractVersion: activeContract.version,
          plan,
          principalId: principal.principalId,
          status: 'DENIED',
          startedAt,
          completedAt: new Date().toISOString(),
          grantedPermissions,
          bindingResults: [],
        })
        send(response, 403, { error: 'REQUIRED_PERMISSION_MISSING', missingPermissions, receipt })
        return
      }
      const bindingResults = await executeBindings(plan, activeContract)
      const receipt = await executionStore.append({
        contractId,
        contractVersion: activeContract.version,
        plan,
        principalId: principal.principalId,
        status: bindingResults.every((result) => result.status === 'SUCCESS') ? 'SUCCESS' : 'FAILED',
        startedAt,
        completedAt: new Date().toISOString(),
        grantedPermissions,
        bindingResults,
      })
      send(response, receipt.status === 'SUCCESS' ? 200 : 502, receipt)
      return
    }

    send(response, 404, { error: 'NOT_FOUND' })
  } catch (error) {
    if (error instanceof ContractValidationError) {
      send(response, 422, { error: error.message, issues: error.issues })
      return
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    send(response, message === 'INVALID_JSON' || message === 'PAYLOAD_TOO_LARGE' ? 400 : 500, {
      error: message,
    })
  }
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Lattice Context API listening at http://127.0.0.1:${port}\n`)
})

async function prepareCompile(result: CompileResponse, contract: ContextContract, requestedBy: string): Promise<CompileResponse> {
  if (result.decision === 'APPROVAL_REQUIRED' && result.pendingPlan) {
    const operation = contract.operations.find((candidate) => candidate.id === result.pendingPlan?.operation)
    const policy = operation ? contract.policies.find((candidate) => candidate.riskTier === operation.riskTier) : undefined
    if (!operation || !policy) {
      const { pendingPlan: _pendingPlan, ...withoutPendingPlan } = result
      return withoutPendingPlan
    }
    const approval = await runtimeApprovalStore.create({
      contractId: contract.id,
      contractVersion: contract.version,
      contractDigest: contract.digest,
      operationId: operation.id,
      policyId: policy.id,
      riskTier: operation.riskTier,
      requestedBy,
      pendingPlan: result.pendingPlan,
    })
    return { ...result, approval }
  }
  return finalize(result, contract.id)
}

function finalize(result: CompileResponse, contractId: string): CompileResponse {
  if (!result.plan) return result
  const signed = signAndStore(result.plan, contractId)
  return { ...result, plan: signed }
}

function signAndStore(plan: UnsignedExecutionPlan, contractId: string): SignedExecutionPlan {
  const signed = signPlan(plan)
  plans.set(signed.planId, signed)
  planContractIds.set(signed.planId, contractId)
  return signed
}

function signPlan(plan: UnsignedExecutionPlan): SignedExecutionPlan {
  const payload = Buffer.from(JSON.stringify(plan))
  const signature = sign(null, payload, privateKey).toString('base64url')
  return { ...plan, keyId, signatureAlgorithm: 'Ed25519', signature }
}

function verifyPlan(plan: SignedExecutionPlan): boolean {
  const { keyId: _keyId, signatureAlgorithm: _algorithm, signature, ...unsigned } = plan
  return verify(null, Buffer.from(JSON.stringify(unsigned)), publicKey, Buffer.from(signature, 'base64url'))
}

function authenticate(request: IncomingMessage): { tenantId: string; principalId: string } | undefined {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer ') || authorization.length <= 7) return undefined
  const token = authorization.slice(7)
  return {
    tenantId: 'tenant_dev',
    principalId: `principal_${createHash('sha256').update(token).digest('hex').slice(0, 12)}`,
  }
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 256_000) throw new Error('PAYLOAD_TOO_LARGE')
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  } catch {
    throw new Error('INVALID_JSON')
  }
}

function setCors(response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', studioOrigin)
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body, null, 2))
}
