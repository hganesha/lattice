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
  defaultPurposeId,
  deriveRiskTier,
  purposesForDomain,
  type AssuranceRunRequest,
  type CompileRequest,
  type CompileResponse,
  type BindingPreviewRequest,
  type ConnectorValidationRequest,
  type CreateCaseSetRequest,
  type CreateEmergencyAuthorizationRequest,
  type CreateEvalRunRequest,
  type CreateNegativeDecisionRequest,
  type CreateReviewDecisionRequest,
  type CreateReviewRequest,
  type CreateRuntimeApprovalDecisionRequest,
  type ContextContract,
  type ContractRegistryEntry,
  type ContractSummary,
  type CreateContractRequest,
  type CaseSet,
  type DeclaredPurpose,
  type DispositionMode,
  type DispositionQuery,
  type DriftActionRequest,
  type EmergencyRetrospectiveRequest,
  type EvalCase,
  type EvalRun,
  type ExecutePlanRequest,
  type ImportPreviewRequest,
  type IndustryOntology,
  type IndustryWorkspace,
  type PrincipalChainLink,
  type ReviewRequestArtifact,
  type ReviewRoutingPlan,
  type RiskTier,
  type RuntimeDecision,
  type SignedExecutionPlan,
  type StructuredRejection,
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
import { AttestationStore, createSigner, predicateForSubject } from './attestations.js'
import { buildDisposition, DispositionStore } from './dispositionStore.js'
import { CaseSetStore, summarize } from './caseSetStore.js'
import { counterpartyGoldCaseSet } from './seedCaseSets.js'
import { EvalRunStore } from './evalStore.js'
import { buildCompilationRecord, diffEvalRuns, runEvaluation } from './evalHarness.js'
import { consultNegativeDecisions, NegativeDecisionStore } from './negativeDecisionStore.js'
import { DriftStore } from './driftStore.js'
import { detectDrift, sourceHealthFor } from './driftDetector.js'
import { replayDrift } from './counterfactual.js'
import { PrincipalStore, type CreateDelegationGrantRequest } from './principalStore.js'
import { EmergencyStore } from './emergencyStore.js'
import { buildEligibility } from './eligibility.js'
import { computeBlastRadius, impactOfTarget } from './blastRadius.js'
import { buildActivity } from './activity.js'
import { search } from './search.js'

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
const signer = createSigner(keyId, privateKey, publicKey)
const attestationStore = await AttestationStore.open(join(dataDirectory, 'attestations.json'), signer)
const dispositionStore = await DispositionStore.open(join(dataDirectory, 'dispositions.json'), join(dataDirectory, 'disposition-archive.json'))
const caseSetStore = await CaseSetStore.open(join(dataDirectory, 'case-sets.json'))
const evalRunStore = await EvalRunStore.open(join(dataDirectory, 'eval-runs.json'))
const negativeDecisionStore = await NegativeDecisionStore.open(join(dataDirectory, 'negative-decisions.json'))
const driftStore = await DriftStore.open(join(dataDirectory, 'drift-events.json'))
const principalStore = await PrincipalStore.open(join(dataDirectory, 'principals.json'), join(dataDirectory, 'delegations.json'), registry.listWorkspaces().map((workspace) => workspace.id), registry.list().map((entry) => entry.contractId))
const emergencyStore = await EmergencyStore.open(join(dataDirectory, 'emergency-authorizations.json'), signer)
if (caseSetStore.all().length === 0) await caseSetStore.seed(counterpartyGoldCaseSet)

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
        const preview = previewBindingSource({ ...body, contractId: body.contractId ?? `ontology:${body.workspaceId}` })
        // Discovery consults the registry so a rejected mapping is annotated rather than silently re-proposed (E13).
        const suppressed = consultNegativeDecisions(preview, negativeDecisionStore.inForce(), {
          ...(body.contractId ? { contractId: body.contractId } : {}),
          ...(body.workspaceId ? { workspaceId: body.workspaceId } : {}),
          sourceName: body.sourceName,
        })
        send(response, 200, suppressed.length > 0 ? { ...preview, suppressed } : preview)
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
      // Workspace scope is what a steward across a dozen contracts actually needs (E12, fixes G5).
      const contractId = url.searchParams.get('contractId')
      const workspaceId = url.searchParams.get('workspaceId')
      if (!contractId && !workspaceId) {
        send(response, 400, { error: 'CONTRACT_OR_WORKSPACE_REQUIRED' })
        return
      }
      const scopedContractIds = contractId
        ? [contractId]
        : registry.list().filter((entry) => workspaceIdFor(entry) === workspaceId).map((entry) => entry.contractId)
      const assignedRole = url.searchParams.get('assignedRole')
      const status = url.searchParams.get('status')
      const reviews = scopedContractIds
        .flatMap((id) => reviewStore.list(id).map((review) => withRouting({ ...review, ...(workspaceId ? { workspaceId } : {}) })))
        .filter((review) => !status || review.status === status)
        .filter((review) => !assignedRole || (review.routingPlan?.assignments ?? []).some((assignment) => assignment.role === assignedRole))
        .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
      send(response, 200, reviews)
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
      const body = await readJson<CreateReviewDecisionRequest & { structuredRejection?: StructuredRejection }>(request)
      if (!['APPROVED', 'APPROVED_WITH_EXCEPTION', 'REJECTED'].includes(body.decision) || !body.rationale?.trim() || body.rationale.trim().length < 12) {
        send(response, 400, { error: 'INVALID_REVIEW_DECISION', message: 'A valid decision and rationale of at least 12 characters are required.' })
        return
      }
      try {
        const decided = await reviewStore.decide(reviewDecisionMatch[1], body.decision, body.rationale.trim(), principal.principalId)
        const entry = registry.get(decided.contractId)
        // A rejection with a typed capture becomes a negative decision, so the same mapping is never re-proposed (E13).
        let negativeDecisionId: string | undefined
        if (body.decision === 'REJECTED' && body.structuredRejection && entry) {
          const created = await negativeDecisionStore.create({
            workspaceId: workspaceIdFor(entry),
            contractId: entry.contractId,
            prohibited: body.structuredRejection.prohibited,
            applicability: body.structuredRejection.applicability,
            rationale: body.rationale.trim(),
            reviewBy: body.structuredRejection.reviewBy,
            ...(body.structuredRejection.exceptions ? { exceptions: body.structuredRejection.exceptions } : {}),
            reviewId: decided.id,
          }, principal.principalId)
          negativeDecisionId = created.id
        }
        if (decided.decision) {
          await attestationStore.mint({ subjectKind: 'REVIEW_DECISION', subjectId: decided.decision.id, predicateType: predicateForSubject.REVIEW_DECISION, subject: decided.decision, signerId: principal.principalId, signerRoleAtSigning: roleOf(principal.principalId) })
        }
        send(response, 201, withRouting({
          ...decided,
          ...(decided.decision ? { decision: { ...decided.decision, ...(body.structuredRejection ? { structuredRejection: body.structuredRejection } : {}), ...(negativeDecisionId ? { negativeDecisionId } : {}) } } : {}),
        }))
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
      const mode: DispositionMode = body.mode === 'DRY_RUN' ? 'DRY_RUN' : 'AUTHORIZED'
      const entry = registry.get(selectedContractId)
      // A dry-run compiles the draft so a new contract reaches the money moment without publishing (E3, G3).
      const selectedContract = mode === 'DRY_RUN' ? entry?.draft : registry.latestPublished(selectedContractId)
      if (!selectedContract) {
        send(response, mode === 'DRY_RUN' ? 404 : 409, mode === 'DRY_RUN'
          ? { error: 'CONTRACT_NOT_FOUND' }
          : { error: 'CONTRACT_NOT_PUBLISHED', message: 'Publish this contract before compiling authorized questions, or compile with mode DRY_RUN.' })
        return
      }
      const startedAt = process.hrtime.bigint()
      const compiled = new ContextCompiler(selectedContract).compile({ ...body, mode })
      const result = mode === 'DRY_RUN' ? compiled : await prepareCompile(compiled, selectedContract, principal.principalId)
      const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6
      if (result.clarification) {
        clarifications.set(result.clarification.id, {
          request: { ...body, mode },
          typeId: result.clarification.entityTypeId,
        })
      }
      const enriched = await recordDisposition({ result, contract: selectedContract, question: body.question, mode, purposeId: body.purposeId, principalId: principal.principalId, latencyMs })
      send(response, result.decision === 'RESOLVED' ? 200 : result.decision === 'APPROVAL_REQUIRED' ? 202 : 422, { ...enriched, principal })
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
      const pendingContractId = pending.request.contractId ?? counterpartyRiskContract.id
      const pendingMode: DispositionMode = pending.request.mode === 'DRY_RUN' ? 'DRY_RUN' : 'AUTHORIZED'
      const selectedContract = pendingMode === 'DRY_RUN' ? registry.get(pendingContractId)?.draft : registry.latestPublished(pendingContractId)
      if (!selectedContract) {
        send(response, 409, { error: 'CONTRACT_NOT_PUBLISHED' })
        return
      }
      const clarificationStartedAt = process.hrtime.bigint()
      const compiled = new ContextCompiler(selectedContract).compile({
        ...pending.request,
        selections: { ...pending.request.selections, [pending.typeId]: body.entityId },
      })
      const result = pendingMode === 'DRY_RUN' ? compiled : await prepareCompile(compiled, selectedContract, principal.principalId)
      const latencyMs = Number(process.hrtime.bigint() - clarificationStartedAt) / 1e6
      if (result.decision === 'RESOLVED') clarifications.delete(clarificationMatch[1])
      const enriched = await recordDisposition({ result, contract: selectedContract, question: pending.request.question, mode: pendingMode, purposeId: pending.request.purposeId, principalId: principal.principalId, latencyMs, clarificationId: clarificationMatch[1] })
      send(response, result.decision === 'RESOLVED' ? 200 : result.decision === 'APPROVAL_REQUIRED' ? 202 : 422, { ...enriched, principal })
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

    if (await handleEvolutionRoutes(request, response, url)) return

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

/* ------------------------------------------------------------------ *
 * Evolution & evaluation routes (E3–E19, E21).
 * ------------------------------------------------------------------ */

// eslint-disable-next-line complexity
async function handleEvolutionRoutes(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  const method = request.method ?? 'GET'
  const path = url.pathname

  /* ---- Declared purpose and derived risk tier (E4) ---- */

  if (method === 'GET' && path === '/v1/purposes') {
    const contractId = url.searchParams.get('contractId')
    const contract = contractId ? registry.get(contractId)?.draft : undefined
    const domain = url.searchParams.get('domain') ?? contract?.domain ?? ''
    const available = purposesForDomain(domain)
    const allowed = contract?.purposeIds
    send(response, 200, allowed && allowed.length > 0 ? available.filter((purpose) => allowed.includes(purpose.id)) : available satisfies DeclaredPurpose[])
    return true
  }

  if (method === 'POST' && path === '/v1/risk-tier') {
    if (!authenticate(request)) return unauthenticated(response)
    const body = await readJson<{ contractId?: string; purposeId?: string; operationId?: string }>(request)
    const contract = registry.get(body.contractId ?? '')?.draft
    if (!contract) {
      send(response, 404, { error: 'CONTRACT_NOT_FOUND' })
      return true
    }
    send(response, 200, deriveRiskTier(contract, body.purposeId ?? defaultPurposeId, body.operationId))
    return true
  }

  /* ---- Disposition trail (E5) ---- */

  if (method === 'GET' && path === '/v1/dispositions') {
    if (!authenticate(request)) return unauthenticated(response)
    const query: DispositionQuery = {
      ...optional('contractId', url), ...optional('workspaceId', url), ...optional('purposeId', url), ...optional('principalId', url), ...optional('cursor', url), ...optional('from', url), ...optional('to', url),
      ...(url.searchParams.get('decision') ? { decision: url.searchParams.get('decision') as RuntimeDecision } : {}),
      ...(url.searchParams.get('riskTier') ? { riskTier: url.searchParams.get('riskTier') as RiskTier } : {}),
      ...(url.searchParams.get('mode') ? { mode: url.searchParams.get('mode') as DispositionMode } : {}),
      ...(url.searchParams.get('limit') ? { limit: Number(url.searchParams.get('limit')) } : {}),
    }
    send(response, 200, dispositionStore.query(query))
    return true
  }

  const dispositionMatch = path.match(/^\/v1\/dispositions\/([^/]+)$/)
  if (method === 'GET' && dispositionMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const record = dispositionStore.get(dispositionMatch[1])
    if (!record) {
      send(response, 404, { error: 'DISPOSITION_NOT_FOUND' })
      return true
    }
    send(response, 200, record)
    return true
  }

  if (method === 'GET' && path === '/v1/retention') {
    if (!authenticate(request)) return unauthenticated(response)
    send(response, 200, dispositionStore.retention())
    return true
  }

  /* ---- Attestations (E16) ---- */

  if (method === 'GET' && path === '/v1/attestations') {
    if (!authenticate(request)) return unauthenticated(response)
    send(response, 200, attestationStore.list({ ...optional('subjectId', url), ...(url.searchParams.get('subjectKind') ? { subjectKind: url.searchParams.get('subjectKind') as Parameters<typeof attestationStore.list>[0] extends { subjectKind?: infer K } ? K : never } : {}) }))
    return true
  }

  const attestationVerifyMatch = path.match(/^\/v1\/attestations\/([^/]+)\/verify$/)
  if (method === 'POST' && attestationVerifyMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const attestation = attestationStore.get(attestationVerifyMatch[1])
    if (!attestation) {
      send(response, 404, { error: 'ATTESTATION_NOT_FOUND' })
      return true
    }
    const verification = attestationStore.verify(attestation.id, resolveAttestationSubject(attestation.subjectKind, attestation.subjectId), keyId)
    send(response, verification?.verified ? 200 : 422, verification)
    return true
  }

  const attestationMatch = path.match(/^\/v1\/attestations\/([^/]+)$/)
  if (method === 'GET' && attestationMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const attestation = attestationStore.get(attestationMatch[1])
    if (!attestation) {
      send(response, 404, { error: 'ATTESTATION_NOT_FOUND' })
      return true
    }
    send(response, 200, attestation)
    return true
  }

  /* ---- Case sets (E6) ---- */

  if (method === 'GET' && path === '/v1/case-sets') {
    if (!authenticate(request)) return unauthenticated(response)
    send(response, 200, caseSetStore.list({ ...optional('workspaceId', url), ...optional('contractId', url) }))
    return true
  }

  if (method === 'POST' && path === '/v1/case-sets') {
    if (!authenticate(request)) return unauthenticated(response)
    const body = await readJson<CreateCaseSetRequest>(request)
    if (!body.name?.trim() || !body.scope) {
      send(response, 400, { error: 'INVALID_CASE_SET', message: 'A name and a scope are required.' })
      return true
    }
    send(response, 201, await caseSetStore.create(body))
    return true
  }

  const caseSetCasesMatch = path.match(/^\/v1\/case-sets\/([^/]+)\/cases$/)
  if (caseSetCasesMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const caseSet = caseSetStore.get(caseSetCasesMatch[1])
    if (!caseSet) {
      send(response, 404, { error: 'CASE_SET_NOT_FOUND' })
      return true
    }
    if (method === 'GET') {
      send(response, 200, caseSet.cases)
      return true
    }
    if (method === 'POST') {
      const body = await readJson<{ case?: EvalCase }>(request)
      if (!body.case?.id || !body.case.question?.trim()) {
        send(response, 400, { error: 'INVALID_EVAL_CASE', message: 'A case id and question are required.' })
        return true
      }
      send(response, 200, await caseSetStore.upsertCase(caseSet.id, body.case))
      return true
    }
  }

  const caseSetMatch = path.match(/^\/v1\/case-sets\/([^/]+)$/)
  if (caseSetMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const caseSet = caseSetStore.get(caseSetMatch[1])
    if (!caseSet) {
      send(response, 404, { error: 'CASE_SET_NOT_FOUND' })
      return true
    }
    if (method === 'GET') {
      send(response, 200, caseSet)
      return true
    }
    if (method === 'PUT') {
      const body = await readJson<{ caseSet?: CaseSet }>(request)
      if (!body.caseSet || body.caseSet.id !== caseSet.id) {
        send(response, 400, { error: 'CASE_SET_ID_MISMATCH' })
        return true
      }
      send(response, 200, await caseSetStore.replace(caseSet.id, body.caseSet))
      return true
    }
  }

  /* ---- Evaluation runs, diff, failure routing (E7, E8, E10) ---- */

  if (method === 'GET' && path === '/v1/eval/runs') {
    if (!authenticate(request)) return unauthenticated(response)
    send(response, 200, evalRunStore.list({ ...optional('contractId', url), ...optional('caseSetId', url) }))
    return true
  }

  if (method === 'POST' && path === '/v1/eval/runs') {
    const principal = authenticate(request)
    if (!principal) return unauthenticated(response)
    const body = await readJson<CreateEvalRunRequest>(request)
    const caseSet = caseSetStore.get(body.caseSetId ?? '')
    const entry = registry.get(body.contractId ?? '')
    if (!caseSet || !entry) {
      send(response, 404, { error: caseSet ? 'CONTRACT_NOT_FOUND' : 'CASE_SET_NOT_FOUND' })
      return true
    }
    const mode: DispositionMode = body.mode === 'AUTHORIZED' ? 'AUTHORIZED' : 'DRY_RUN'
    const contract = mode === 'AUTHORIZED' ? registry.latestPublished(entry.contractId) ?? entry.draft : entry.draft
    const selected = body.caseIds?.length ? caseSet.cases.filter((evalCase) => body.caseIds!.includes(evalCase.id)) : caseSet.cases
    if (selected.length === 0) {
      send(response, 400, { error: 'NO_CASES_SELECTED' })
      return true
    }
    const now = new Date()
    const { run, dispositions } = runEvaluation({
      runId: `evalrun_${randomUUID()}`,
      name: body.name?.trim() || `${caseSet.name} · ${now.toISOString().slice(0, 16).replace('T', ' ')}`,
      caseSet,
      cases: selected,
      contract,
      ...(workspaceIdFor(entry) ? { workspaceId: workspaceIdFor(entry) } : {}),
      mode,
      environment: body.environment ?? 'local',
      triggeredBy: principal.principalId,
      principalChain: principalStore.chainFor(principal.principalId),
      ...(body.baselineRunId ? { baselineRunId: body.baselineRunId } : {}),
      now,
    })
    for (const record of dispositions) await dispositionStore.append(record)
    const evidence = evidenceForEvalRun(run)
    const stored = await evalRunStore.append({ ...run, evidenceRecordId: evidence.id })
    await attestationStore.mint({ subjectKind: 'EVAL_RUN', subjectId: stored.id, predicateType: predicateForSubject.EVAL_RUN, subject: stored, signerId: principal.principalId, signerRoleAtSigning: roleOf(principal.principalId) })
    send(response, 201, stored)
    return true
  }

  const evalDiffMatch = path.match(/^\/v1\/eval\/runs\/([^/]+)\/diff$/)
  if (method === 'GET' && evalDiffMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const candidate = evalRunStore.get(evalDiffMatch[1])
    const baseline = evalRunStore.get(url.searchParams.get('baseline') ?? '')
    if (!candidate || !baseline) {
      send(response, 404, { error: candidate ? 'BASELINE_RUN_NOT_FOUND' : 'EVAL_RUN_NOT_FOUND' })
      return true
    }
    send(response, 200, diffEvalRuns(candidate, baseline))
    return true
  }

  const evalCancelMatch = path.match(/^\/v1\/eval\/runs\/([^/]+)\/cancel$/)
  if (method === 'POST' && evalCancelMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const run = evalRunStore.get(evalCancelMatch[1])
    if (!run) {
      send(response, 404, { error: 'EVAL_RUN_NOT_FOUND' })
      return true
    }
    if (run.status !== 'RUNNING' && run.status !== 'QUEUED') {
      send(response, 409, { error: 'EVAL_RUN_ALREADY_FINISHED' })
      return true
    }
    send(response, 200, await evalRunStore.replace({ ...run, status: 'CANCELLED', completedAt: new Date().toISOString() }))
    return true
  }

  const evalRunMatch = path.match(/^\/v1\/eval\/runs\/([^/]+)$/)
  if (method === 'GET' && evalRunMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const run = evalRunStore.get(evalRunMatch[1])
    if (!run) {
      send(response, 404, { error: 'EVAL_RUN_NOT_FOUND' })
      return true
    }
    send(response, 200, run)
    return true
  }

  /* ---- Review inbox, routing, blast radius (E12, E17) ---- */

  const blastRadiusMatch = path.match(/^\/v1\/reviews\/([^/]+)\/blast-radius$/)
  if (method === 'GET' && blastRadiusMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const review = reviewStore.get(blastRadiusMatch[1])
    const entry = review ? registry.get(review.contractId) : undefined
    if (!review || !entry) {
      send(response, 404, { error: 'REVIEW_NOT_FOUND' })
      return true
    }
    send(response, 200, computeBlastRadius({
      contract: entry.draft,
      workspaceId: workspaceIdFor(entry),
      targetKind: review.targetKind,
      targetId: review.targetId,
      dispositions: dispositionStore.all().filter((record) => record.contractId === entry.contractId),
    }))
    return true
  }

  const reviewDelegateMatch = path.match(/^\/v1\/reviews\/([^/]+)\/delegate$/)
  if (method === 'POST' && reviewDelegateMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const review = reviewStore.get(reviewDelegateMatch[1])
    if (!review) {
      send(response, 404, { error: 'REVIEW_NOT_FOUND' })
      return true
    }
    const body = await readJson<{ role?: string; toPrincipalId?: string; reason?: string }>(request)
    if (!body.role || !body.toPrincipalId || !body.reason?.trim()) {
      send(response, 400, { error: 'INVALID_DELEGATION', message: 'A role, a delegate, and a reason are required.' })
      return true
    }
    const plan = routingPlanFor(review)
    const delegated: ReviewRoutingPlan = {
      ...plan,
      assignments: plan.assignments.map((assignment) => assignment.role === body.role
        ? { ...assignment, status: 'DELEGATED' as const, delegatedToPrincipalId: body.toPrincipalId!, delegatedReason: body.reason!.trim() }
        : assignment),
    }
    send(response, 200, { ...review, routingPlan: delegated })
    return true
  }

  const reviewMatch = path.match(/^\/v1\/reviews\/([^/]+)$/)
  if (method === 'GET' && reviewMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const review = reviewStore.get(reviewMatch[1])
    if (!review) {
      send(response, 404, { error: 'REVIEW_NOT_FOUND' })
      return true
    }
    send(response, 200, withRouting(review))
    return true
  }

  /* ---- Negative decisions (E13) ---- */

  if (method === 'GET' && path === '/v1/negative-decisions') {
    if (!authenticate(request)) return unauthenticated(response)
    send(response, 200, negativeDecisionStore.list({ ...optional('workspaceId', url), ...optional('contractId', url) }))
    return true
  }

  if (method === 'POST' && path === '/v1/negative-decisions') {
    const principal = authenticate(request)
    if (!principal) return unauthenticated(response)
    const body = await readJson<CreateNegativeDecisionRequest>(request)
    if (!body.workspaceId || !body.prohibited?.subject?.trim() || !body.rationale?.trim() || !body.reviewBy) {
      send(response, 400, { error: 'INVALID_NEGATIVE_DECISION', message: 'A workspace, a prohibited subject, a rationale, and a review-by date are required.' })
      return true
    }
    send(response, 201, await negativeDecisionStore.create(body, principal.principalId))
    return true
  }

  const negativeWithdrawMatch = path.match(/^\/v1\/negative-decisions\/([^/]+)\/withdraw$/)
  if (method === 'POST' && negativeWithdrawMatch?.[1]) {
    const principal = authenticate(request)
    if (!principal) return unauthenticated(response)
    const body = await readJson<{ rationale?: string }>(request)
    if (!body.rationale?.trim() || body.rationale.trim().length < 12) {
      send(response, 400, { error: 'RATIONALE_REQUIRED', message: 'A rationale of at least 12 characters is required.' })
      return true
    }
    try {
      send(response, 200, await negativeDecisionStore.withdraw(negativeWithdrawMatch[1], body.rationale.trim(), principal.principalId))
    } catch (error) {
      send(response, 404, { error: error instanceof Error ? error.message : 'NEGATIVE_DECISION_NOT_FOUND' })
    }
    return true
  }

  const negativeMatch = path.match(/^\/v1\/negative-decisions\/([^/]+)$/)
  if (method === 'GET' && negativeMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const decision = negativeDecisionStore.get(negativeMatch[1])
    if (!decision) {
      send(response, 404, { error: 'NEGATIVE_DECISION_NOT_FOUND' })
      return true
    }
    send(response, 200, decision)
    return true
  }

  /* ---- Drift, source health, counterfactual replay (E14) ---- */

  if (method === 'GET' && path === '/v1/drift') {
    if (!authenticate(request)) return unauthenticated(response)
    send(response, 200, driftStore.list({ ...optional('workspaceId', url), ...optional('contractId', url) }))
    return true
  }

  if (method === 'POST' && path === '/v1/drift/scan') {
    if (!authenticate(request)) return unauthenticated(response)
    const body = await readJson<{ workspaceId?: string }>(request)
    const detected = registry.list()
      .filter((entry) => !body.workspaceId || workspaceIdFor(entry) === body.workspaceId)
      .flatMap((entry) => detectDrift(entry, registry.getWorkspace(workspaceIdFor(entry))))
    send(response, 200, await driftStore.upsertMany(detected))
    return true
  }

  if (method === 'GET' && path === '/v1/source-health') {
    if (!authenticate(request)) return unauthenticated(response)
    const entry = registry.get(url.searchParams.get('contractId') ?? '')
    if (!entry) {
      send(response, 404, { error: 'CONTRACT_NOT_FOUND' })
      return true
    }
    send(response, 200, sourceHealthFor(entry.draft, driftStore.list({ contractId: entry.contractId })))
    return true
  }

  const driftReplayMatch = path.match(/^\/v1\/drift\/([^/]+)\/replay$/)
  if (method === 'POST' && driftReplayMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const event = driftStore.get(driftReplayMatch[1])
    const entry = event?.contractId ? registry.get(event.contractId) : undefined
    if (!event || !entry) {
      send(response, 404, { error: 'DRIFT_EVENT_NOT_FOUND' })
      return true
    }
    const counterfactual = replayDrift({
      event,
      dispositions: dispositionStore.all().filter((record) => record.contractId === entry.contractId && record.mode === 'AUTHORIZED'),
      contract: entry.draft,
    })
    await driftStore.replace({ ...event, counterfactual })
    send(response, 200, counterfactual)
    return true
  }

  const driftActionMatch = path.match(/^\/v1\/drift\/([^/]+)\/actions$/)
  if (method === 'POST' && driftActionMatch?.[1]) {
    const principal = authenticate(request)
    if (!principal) return unauthenticated(response)
    const event = driftStore.get(driftActionMatch[1])
    if (!event) {
      send(response, 404, { error: 'DRIFT_EVENT_NOT_FOUND' })
      return true
    }
    const body = await readJson<DriftActionRequest>(request)
    if (!body.rationale?.trim() || body.rationale.trim().length < 12) {
      send(response, 400, { error: 'RATIONALE_REQUIRED', message: 'A rationale of at least 12 characters is required.' })
      return true
    }
    const entry = event.contractId ? registry.get(event.contractId) : undefined
    if (body.action === 'SUSPEND_HIGH_RISK' && entry) await registry.setRuntimeStatus(entry.contractId, 'SUSPENDED')
    if (body.action === 'OPEN_REVIEW' && entry && event.subject.kind === 'SOURCE_BINDING') {
      await reviewStore.create({
        contractId: entry.contractId,
        contractVersion: entry.draft.version,
        targetKind: 'SOURCE_BINDING',
        targetId: event.subject.id,
        targetLabel: event.subject.label,
        impact: event.severity,
        evidenceRefs: [],
      }, principal.principalId)
    }
    const status = body.action === 'ACKNOWLEDGE' ? 'ACKNOWLEDGED' as const : body.action === 'RESOLVE' ? 'RESOLVED' as const : body.action === 'ALLOW_READ_ONLY' ? 'ACKNOWLEDGED' as const : event.status
    send(response, 200, await driftStore.replace({ ...event, status }))
    return true
  }

  const driftMatch = path.match(/^\/v1\/drift\/([^/]+)$/)
  if (method === 'GET' && driftMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const event = driftStore.get(driftMatch[1])
    if (!event) {
      send(response, 404, { error: 'DRIFT_EVENT_NOT_FOUND' })
      return true
    }
    send(response, 200, event)
    return true
  }

  /* ---- Per-use eligibility (E11) ---- */

  if (method === 'GET' && path === '/v1/eligibility') {
    if (!authenticate(request)) return unauthenticated(response)
    const entry = registry.get(url.searchParams.get('contractId') ?? '')
    if (!entry) {
      send(response, 404, { error: 'CONTRACT_NOT_FOUND' })
      return true
    }
    const workspaceId = workspaceIdFor(entry)
    send(response, 200, buildEligibility({
      entry,
      contract: entry.draft,
      assuranceRuns: assuranceStore.list(entry.contractId),
      reviews: reviewStore.list(entry.contractId),
      driftEvents: driftStore.list({ contractId: entry.contractId }),
      dispositions: dispositionStore.all().filter((record) => record.contractId === entry.contractId),
      autonomousGrantAvailable: principalStore.grants({ workspaceId }).some((grant) => grant.status === 'ACTIVE' && grant.riskTierCeiling === 'OPERATIONAL_ACTION'),
    }))
    return true
  }

  /* ---- Identity and delegation (E15) ---- */

  if (method === 'GET' && path === '/v1/session') {
    const identity = authenticate(request)
    if (!identity) return unauthenticated(response)
    // A bearer identity that is not in the declared directory is recorded as exactly what it
    // verifiably is, so the session always resolves to a real Principal rather than a chain link.
    if (!principalStore.get(identity.principalId)) {
      await principalStore.observe([identity.principalId], registry.listWorkspaces().map((workspace) => workspace.id))
    }
    send(response, 200, { principal: principalStore.get(identity.principalId), chain: principalStore.chainFor(identity.principalId) })
    return true
  }

  if (method === 'GET' && path === '/v1/principals') {
    if (!authenticate(request)) return unauthenticated(response)
    send(response, 200, principalStore.all(url.searchParams.get('workspaceId') ?? undefined))
    return true
  }

  if (method === 'GET' && path === '/v1/identity-graph') {
    if (!authenticate(request)) return unauthenticated(response)
    send(response, 200, principalStore.identityGraph(url.searchParams.get('workspaceId') ?? undefined))
    return true
  }

  if (method === 'GET' && path === '/v1/delegations') {
    if (!authenticate(request)) return unauthenticated(response)
    send(response, 200, principalStore.grants({ ...optional('workspaceId', url), ...optional('principalId', url) }))
    return true
  }

  if (method === 'POST' && path === '/v1/delegations') {
    const principal = authenticate(request)
    if (!principal) return unauthenticated(response)
    const body = await readJson<CreateDelegationGrantRequest>(request)
    if (!body.toPrincipalId || !Array.isArray(body.scope) || body.scope.length === 0 || !body.maximumActions) {
      send(response, 400, { error: 'INVALID_DELEGATION', message: 'A delegate, at least one scope, and a maximum action budget are required.' })
      return true
    }
    send(response, 201, await principalStore.createGrant(body, principal.principalId))
    return true
  }

  const grantRevokeMatch = path.match(/^\/v1\/delegations\/([^/]+)\/revoke$/)
  if (method === 'POST' && grantRevokeMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const body = await readJson<{ rationale?: string }>(request)
    if (!body.rationale?.trim()) {
      send(response, 400, { error: 'RATIONALE_REQUIRED' })
      return true
    }
    try {
      send(response, 200, await principalStore.revokeGrant(grantRevokeMatch[1], body.rationale.trim()))
    } catch (error) {
      send(response, 404, { error: error instanceof Error ? error.message : 'GRANT_NOT_FOUND' })
    }
    return true
  }

  const principalMatch = path.match(/^\/v1\/principals\/([^/]+)$/)
  if (method === 'GET' && principalMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const principal = principalStore.get(principalMatch[1])
    if (!principal) {
      send(response, 404, { error: 'PRINCIPAL_NOT_FOUND' })
      return true
    }
    send(response, 200, principal)
    return true
  }

  /* ---- Emergency authorization and its retrospective queue (E18) ---- */

  if (method === 'GET' && path === '/v1/emergency-authorizations') {
    if (!authenticate(request)) return unauthenticated(response)
    send(response, 200, emergencyStore.list({
      ...optional('contractId', url), ...optional('workspaceId', url),
      ...(url.searchParams.get('status') ? { status: url.searchParams.get('status') as Parameters<typeof emergencyStore.list>[0] extends { status?: infer S } ? S : never } : {}),
    }))
    return true
  }

  if (method === 'POST' && path === '/v1/emergency-authorizations') {
    const principal = authenticate(request)
    if (!principal) return unauthenticated(response)
    const body = await readJson<CreateEmergencyAuthorizationRequest>(request)
    if (!body.contractId || !registry.get(body.contractId)) {
      send(response, 404, { error: 'CONTRACT_NOT_FOUND' })
      return true
    }
    // Deliberately high friction: a thin justification is not an emergency.
    if (!body.justification?.trim() || body.justification.trim().length < 80 || !body.maximumActions || !body.validMinutes || !Array.isArray(body.requiredApproverRoles) || body.requiredApproverRoles.length === 0 || !Array.isArray(body.compensatingControls) || body.compensatingControls.length === 0) {
      send(response, 400, { error: 'INVALID_EMERGENCY_REQUEST', message: 'A justification of at least 80 characters, an action budget, a validity window, at least one approver role, and at least one compensating control are required.' })
      return true
    }
    const authorization = await emergencyStore.create(body, principal.principalId)
    await attestationStore.mint({ subjectKind: 'EMERGENCY_AUTHORIZATION', subjectId: authorization.id, predicateType: predicateForSubject.EMERGENCY_AUTHORIZATION, subject: authorization, signerId: principal.principalId, signerRoleAtSigning: roleOf(principal.principalId) })
    send(response, 201, authorization)
    return true
  }

  const emergencyApprovalMatch = path.match(/^\/v1\/emergency-authorizations\/([^/]+)\/approvals$/)
  if (method === 'POST' && emergencyApprovalMatch?.[1]) {
    const principal = authenticate(request)
    if (!principal) return unauthenticated(response)
    const body = await readJson<{ role?: string; rationale?: string }>(request)
    if (!body.role || !body.rationale?.trim() || body.rationale.trim().length < 12) {
      send(response, 400, { error: 'INVALID_EMERGENCY_APPROVAL', message: 'A role and a rationale of at least 12 characters are required.' })
      return true
    }
    try {
      send(response, 200, await emergencyStore.approve(emergencyApprovalMatch[1], body.role, body.rationale.trim(), principal.principalId))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'EMERGENCY_APPROVAL_FAILED'
      send(response, message === 'EMERGENCY_AUTHORIZATION_NOT_FOUND' ? 404 : 409, { error: message })
    }
    return true
  }

  const emergencyRetrospectiveMatch = path.match(/^\/v1\/emergency-authorizations\/([^/]+)\/retrospective$/)
  if (method === 'POST' && emergencyRetrospectiveMatch?.[1]) {
    const principal = authenticate(request)
    if (!principal) return unauthenticated(response)
    const body = await readJson<EmergencyRetrospectiveRequest>(request)
    if (!['JUSTIFIED', 'UNJUSTIFIED', 'PROCESS_GAP'].includes(body.verdict) || !body.notes?.trim()) {
      send(response, 400, { error: 'INVALID_RETROSPECTIVE', message: 'A verdict and notes are required.' })
      return true
    }
    try {
      send(response, 200, await emergencyStore.recordRetrospective(emergencyRetrospectiveMatch[1], body, principal.principalId))
    } catch (error) {
      send(response, 404, { error: error instanceof Error ? error.message : 'EMERGENCY_AUTHORIZATION_NOT_FOUND' })
    }
    return true
  }

  const emergencyMatch = path.match(/^\/v1\/emergency-authorizations\/([^/]+)$/)
  if (method === 'GET' && emergencyMatch?.[1]) {
    if (!authenticate(request)) return unauthenticated(response)
    const authorization = emergencyStore.get(emergencyMatch[1])
    if (!authorization) {
      send(response, 404, { error: 'EMERGENCY_AUTHORIZATION_NOT_FOUND' })
      return true
    }
    send(response, 200, authorization)
    return true
  }

  /* ---- Activity feed and command palette search (E19, E21) ---- */

  if (method === 'GET' && path === '/v1/activity') {
    const principal = authenticate(request)
    if (!principal) return unauthenticated(response)
    const workspaceId = url.searchParams.get('workspaceId') ?? undefined
    const contractId = url.searchParams.get('contractId') ?? undefined
    send(response, 200, buildActivity({
      ...(workspaceId ? { workspaceId } : {}),
      ...(contractId ? { contractId } : {}),
      limit: Math.min(Number(url.searchParams.get('limit') ?? 50), 200),
      entries: registry.list(),
      dispositions: dispositionStore.all(),
      assuranceRuns: registry.list().flatMap((entry) => assuranceStore.list(entry.contractId)),
      evalRuns: evalRunStore.list(),
      driftEvents: driftStore.all(),
      reviews: registry.list().flatMap((entry) => reviewStore.list(entry.contractId)),
      emergencyAuthorizations: emergencyStore.list(),
      negativeDecisions: negativeDecisionStore.list(),
      viewer: { principalId: principal.principalId, roles: principalStore.get(principal.principalId)?.roles ?? [] },
    }))
    return true
  }

  if (method === 'GET' && path === '/v1/search') {
    if (!authenticate(request)) return unauthenticated(response)
    const workspaceId = url.searchParams.get('workspaceId') ?? undefined
    send(response, 200, search({
      query: url.searchParams.get('q') ?? '',
      ...(workspaceId ? { workspaceId } : {}),
      workspaces: registry.listWorkspaces(),
      entries: registry.list(),
      dispositions: dispositionStore.all(),
      evalRuns: evalRunStore.list(),
      caseSets: caseSetStore.all().map((caseSet) => summarize(caseSet)),
      reviews: registry.list().flatMap((entry) => reviewStore.list(entry.contractId)),
      driftEvents: driftStore.all(),
      principals: principalStore.all(workspaceId),
    }))
    return true
  }

  return false
}

function unauthenticated(response: ServerResponse): boolean {
  send(response, 401, { error: 'UNAUTHENTICATED' })
  return true
}

function optional<K extends string>(key: K, url: URL): Partial<Record<K, string>> {
  const value = url.searchParams.get(key)
  return value ? { [key]: value } as Record<K, string> : {}
}

function workspaceIdFor(entry: ContractRegistryEntry): string {
  return entry.draft.ontologyRef?.workspaceId ?? `workspace-${entry.draft.domain}`
}

function roleOf(principalId: string): string {
  return principalStore.get(principalId)?.roles[0] ?? 'BEARER_TOKEN_IDENTITY'
}

/**
 * Approver routing the evolution doc leaves unspecified (§3.3.M). Derived from the target's
 * impact so it is consistent, and surfaced so a bottleneck is visible rather than mysterious.
 */
function routingPlanFor(review: ReviewRequestArtifact): ReviewRoutingPlan {
  const critical = review.impact === 'CRITICAL'
  const high = review.impact === 'HIGH'
  const roles = critical
    ? ['DOMAIN_OWNER', 'RISK_COMPLIANCE', 'SYSTEM_OWNER']
    : high ? ['DOMAIN_OWNER', 'RISK_COMPLIANCE'] : ['DOMAIN_OWNER']
  const slaHours = critical ? 24 : high ? 48 : 72
  const decidedAt = review.decision?.decidedAt
  return {
    routing: critical ? 'SEQUENTIAL' : 'PARALLEL',
    quorum: critical || high ? 2 : 1,
    assignments: roles.map((role, order) => ({
      role,
      status: review.status === 'DECIDED' ? (review.decision?.decision === 'REJECTED' ? 'REJECTED' as const : 'APPROVED' as const) : 'PENDING' as const,
      order,
      ...(decidedAt ? { decidedAt } : {}),
    })),
    slaHours,
    dueAt: new Date(new Date(review.submittedAt).getTime() + slaHours * 60 * 60_000).toISOString(),
    ...(critical ? { escalateToRole: 'SYSTEM_OWNER' } : {}),
  }
}

function withRouting(review: ReviewRequestArtifact): ReviewRequestArtifact {
  return { ...review, routingPlan: routingPlanFor(review) }
}

function evidenceForEvalRun(run: EvalRun) {
  return {
    id: `ev_${run.id}`,
    type: 'OBSERVATION' as const,
    title: `Evaluation run: ${run.name}`,
    source: 'Lattice evaluation harness',
    locator: `/v1/eval/runs/${run.id}`,
    checksum: run.artifactDigest,
    observedAt: run.completedAt ?? run.startedAt,
    validFrom: run.startedAt,
    status: run.summary.gateFailures > 0 ? 'CONFLICTING' as const : 'DIRECTLY_EVIDENCED' as const,
  }
}

/** Resolves the artifact an attestation covers so verification recomputes a real digest. */
function resolveAttestationSubject(subjectKind: string, subjectId: string): unknown {
  if (subjectKind === 'DISPOSITION') return dispositionStore.get(subjectId)
  if (subjectKind === 'EVAL_RUN') return evalRunStore.get(subjectId)
  if (subjectKind === 'EMERGENCY_AUTHORIZATION') return emergencyStore.get(subjectId)
  if (subjectKind === 'ASSURANCE_RUN') return assuranceStore.get(subjectId)
  if (subjectKind === 'EXECUTION') return registry.list().flatMap((entry) => executionStore.list(entry.contractId)).find((receipt) => receipt.id === subjectId)
  if (subjectKind === 'REVIEW_DECISION') return registry.list().flatMap((entry) => reviewStore.list(entry.contractId)).find((review) => review.decision?.id === subjectId)?.decision
  return undefined
}

interface RecordDispositionInput {
  result: CompileResponse
  contract: ContextContract
  question: string
  mode: DispositionMode
  purposeId: string | undefined
  principalId: string
  latencyMs: number
  clarificationId?: string
}

/**
 * Every compile persists — resolved, clarification, approval, abstention and denial alike.
 * Without this the core output of the product does not survive a second keystroke (G1).
 */
async function recordDisposition({ result, contract, question, mode, purposeId, principalId, latencyMs, clarificationId }: RecordDispositionInput): Promise<CompileResponse> {
  const now = new Date()
  const plan = result.plan ?? result.pendingPlan
  const operationId = plan?.operation
  const riskDerivation = deriveRiskTier(contract, purposeId ?? defaultPurposeId, operationId)
  const compilation = buildCompilationRecord(contract, plan, riskDerivation.riskTier, now.toISOString())
  const entry = registry.get(contract.id)
  const record = buildDisposition({
    contractId: contract.id,
    contractVersion: contract.version,
    ...(entry ? { workspaceId: workspaceIdFor(entry) } : {}),
    mode,
    authorizing: mode === 'AUTHORIZED',
    question,
    purposeId: riskDerivation.purposeId,
    purposeLabel: purposesForDomain(contract.domain).find((purpose) => purpose.id === riskDerivation.purposeId)?.label ?? riskDerivation.purposeId,
    riskTier: riskDerivation.riskTier,
    riskDerivation,
    decision: result.decision,
    reasonCodes: result.reasonCodes,
    explanation: result.explanation,
    ...(operationId ? { operationId } : {}),
    ...(result.plan && 'signature' in result.plan ? { planId: result.plan.planId } : {}),
    ...(result.approval ? { approvalId: result.approval.id } : {}),
    ...(clarificationId ?? result.clarification?.id ? { clarificationId: clarificationId ?? result.clarification!.id } : {}),
    principalId,
    principalChain: principalStore.chainFor(principalId),
    compilation,
    evidenceRefs: plan?.evidenceRefs ?? [],
    latencyMs,
    createdAt: now.toISOString(),
    provenance: 'RE_EXECUTED',
  })
  const attestation = await attestationStore.mint({ subjectKind: 'DISPOSITION', subjectId: record.id, predicateType: predicateForSubject.DISPOSITION, subject: record, signerId: principalId, signerRoleAtSigning: roleOf(principalId) })
  const stored = await dispositionStore.append({ ...record, attestationIds: [attestation.id] })
  return {
    ...result,
    dispositionId: stored.id,
    mode,
    authorizing: mode === 'AUTHORIZED',
    purposeId: riskDerivation.purposeId,
    riskDerivation,
    compilation,
  }
}

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
