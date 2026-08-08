import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { URL } from 'node:url'
import { ContextCompiler, type IntentResolver } from '@lattice/compiler-core'
import { previewBindingSource, previewImport } from '@lattice/importer-core'
import {
  connectorCatalog,
  counterpartyRiskContract,
  defaultPurposeId,
  deriveRiskTier,
  materializeSimulatedContext,
  purposesForDomain,
  type AssuranceRunRequest,
  type CompileRequest,
  type CompileResponse,
  type BindingPreviewRequest,
  type ConnectorValidationRequest,
  type ConnectorDiscoveryRequest,
  type ConnectorHealthRequest,
  type CreateReviewDecisionRequest,
  type CreateReviewRequest,
  type CreateRuntimeApprovalDecisionRequest,
  type ContextContract,
  type ContractSummary,
  type BindingPreview,
  type SourceBinding,
  type CreateContractRequest,
  type ExecutePlanRequest,
  type ImportPreviewRequest,
  type IndustryOntology,
  type IntentResolution,
  type SignedExecutionPlan,
  type UnsignedExecutionPlan,
  type WorkspaceSummary,
  type AssuranceRun,
  type ReviewRequestArtifact,
  type RuntimeApprovalArtifact,
  type ExecutionReceipt,
  type CaseSet,
  type CreateCaseSetRequest,
  type CreateEmergencyAuthorizationRequest,
  type CreateEvalRunRequest,
  type CreateNegativeDecisionRequest,
  type ContractRegistryEntry,
  type DeclaredPurpose,
  type DispositionMode,
  type DispositionQuery,
  type DriftActionRequest,
  type EmergencyRetrospectiveRequest,
  type EvalCase,
  type EvalRun,
  type ReviewRoutingPlan,
  type RiskTier,
  type RuntimeDecision,
  type StructuredRejection,
} from '@lattice/contracts'
import { executeBindings, type ExecuteBindingsOptions } from './adapters.js'
import { runAssurance } from './assurance.js'
import { AssuranceStore } from './assuranceStore.js'
import { ContractRegistry, ContractValidationError, type PublishRequest } from './registry.js'
import { ReviewStore } from './reviewStore.js'
import { ExecutionStore } from './executionStore.js'
import { ConnectorHealthStore } from './connectorHealthStore.js'
import { RuntimeApprovalStore } from './runtimeApprovalStore.js'
import { discoverConnector, probeConnectorHealth, validateConnectorBinding } from './connectors.js'
import { buildReleaseDiffArtifact } from './releaseDiff.js'
import { authenticatorFromEnvironment, type RequestIdentity } from './auth.js'
import { applyTenantMembership, tenantMembershipResolverFromEnvironment } from './tenancy.js'
import { hasOrganizationRole, missingPermissions, requiredOrganizationRoles, resolveGrantedPermissions } from './authorization.js'
import type { OrganizationRole } from './tenancy.js'
import { integrationsSummary } from './integrations.js'
import { SubjectScopedStore, type Subject } from './planStore.js'
import { ContractRegistryConflictError, SupabaseRegistryStorage, supabaseRegistryConfigFromEnvironment, type SupabaseRegistryConfig } from './supabaseRegistry.js'
import { SupabaseGovernanceLedger, type GovernedArtifactKind } from './supabaseGovernanceLedger.js'
import { SupabaseConnectorHealthStorage } from './connectorHealthStorage.js'
import type { ChainedArtifact } from './hashChain.js'
import { embeddingProviderFromEnvironment, intentResolverFromEnvironment } from './embeddingProvider.js'
import { PersistedIntentResolver } from './persistedIntentIndex.js'
import { delegationScopeFor, tokenExchangeFromEnvironment } from './delegatedIdentity.js'
import { catalogSourceFromEnvironment } from './catalogFederation.js'
import { openApiDocument } from './openapi.js'
import { planSignerFromEnvironment } from './signing.js'
import { recordCompileDecision, recordExecution, registerTelemetry, withSpan } from './telemetry.js'
import { AttestationStore, predicateForSubject } from './attestations.js'
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
import { computeBlastRadius } from './blastRadius.js'
import { buildActivity } from './activity.js'
import { search } from './search.js'

const port = Number(process.env.PORT ?? 8787)
/**
 * Loopback by default, so a development API is not exposed to the local network by accident.
 * Anything hosting this for real — a container, a PaaS dyno — has to set `HOST=0.0.0.0`, because
 * a process bound to 127.0.0.1 refuses every connection that did not originate on the same box.
 */
const host = process.env.HOST ?? '127.0.0.1'
/**
 * Origins allowed to call this API from a browser, comma-separated.
 *
 * `localhost` and `127.0.0.1` are the same machine but different origins, and a Studio opened on
 * the wrong one has every response rejected by the browser with no error the page can see — it
 * just reports the runtime offline. Both spellings are allowed by default so that stops happening.
 *
 * A Studio served through a rewrite on its own origin never reaches this code: the browser sees a
 * same-origin request and does not run a CORS check at all.
 */
const allowedStudioOrigins = (process.env.LATTICE_STUDIO_ORIGIN ?? 'http://127.0.0.1:5173,http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const dataDirectory = process.env.LATTICE_DATA_DIR ?? (process.env.VERCEL ? join(tmpdir(), 'lattice-api-data') : join(process.cwd(), 'data'))
interface LocalStores {
  registry: ContractRegistry
  assurance: AssuranceStore
  review: ReviewStore
  runtimeApproval: RuntimeApprovalStore
  execution: ExecutionStore
  connectorHealth: ConnectorHealthStore
}

let localStoresPromise: Promise<LocalStores> | undefined

/**
 * The same five ledgers, backed by Postgres for one request.
 *
 * Each is scoped to the organization and to its artifact kind, and none is filtered to a contract
 * here: an execution receipt has to be findable by plan id across every contract, or a spent
 * nonce could be replayed under a different one.
 */
function governanceLedgers(config: SupabaseRegistryConfig, organizationId: string, authorization: string): Omit<LocalStores, 'registry'> {
  const ledger = <T extends ChainedArtifact>(kind: GovernedArtifactKind) =>
    new SupabaseGovernanceLedger<T>(config, organizationId, authorization, kind, undefined)

  return {
    assurance: new AssuranceStore(ledger<AssuranceRun>('ASSURANCE_RUN')),
    review: new ReviewStore(ledger<ReviewRequestArtifact>('REVIEW')),
    runtimeApproval: new RuntimeApprovalStore(ledger<RuntimeApprovalArtifact>('RUNTIME_APPROVAL')),
    execution: new ExecutionStore(ledger<ExecutionReceipt>('EXECUTION_RECEIPT')),
    connectorHealth: new ConnectorHealthStore(new SupabaseConnectorHealthStorage(config, organizationId, authorization)),
  }
}

/**
 * The file-backed stores, opened once and only if something actually reads them.
 *
 * These used to open at module load. On a serverless platform that is work done against a
 * filesystem that is private to one invocation and thrown away afterwards — ledgers written and
 * immediately lost. When Supabase is configured every request is served from Postgres instead and
 * these are never opened at all, which is what makes the deployed API stateless enough to run
 * there.
 */
function localStores(): Promise<LocalStores> {
  localStoresPromise ??= (async () => ({
    registry: await ContractRegistry.open(join(dataDirectory, 'contract-registry.json'), counterpartyRiskContract),
    assurance: await AssuranceStore.open(join(dataDirectory, 'assurance-runs.json')),
    review: await ReviewStore.open(join(dataDirectory, 'review-artifacts.json')),
    runtimeApproval: await RuntimeApprovalStore.open(join(dataDirectory, 'runtime-approvals.json')),
    execution: await ExecutionStore.open(join(dataDirectory, 'execution-receipts.json')),
    connectorHealth: await ConnectorHealthStore.open(join(dataDirectory, 'connector-health.json')),
  }))()
  return localStoresPromise
}
/**
 * The evolution and evaluation ledgers.
 *
 * Opened lazily and only if a route reads them, exactly like `localStores()`. These are
 * file-backed on every path, including the deployed one: unlike the five governance ledgers there
 * are no Supabase tables for dispositions, attestations, case sets, evaluation runs, negative
 * decisions, drift events, principals or emergency grants yet. On a serverless platform that means
 * they live for one invocation. Adding them to `supabaseGovernanceLedger.ts` and
 * `supabase/migrations/` is the outstanding work to make these surfaces durable in production.
 */
interface EvolutionStores {
  attestation: AttestationStore
  disposition: DispositionStore
  caseSet: CaseSetStore
  evalRun: EvalRunStore
  negativeDecision: NegativeDecisionStore
  drift: DriftStore
  principal: PrincipalStore
  emergency: EmergencyStore
}

let evolutionStoresPromise: Promise<EvolutionStores> | undefined

function evolutionStores(registry: ContractRegistry): Promise<EvolutionStores> {
  evolutionStoresPromise ??= (async () => {
    const caseSet = await CaseSetStore.open(join(dataDirectory, 'case-sets.json'))
    if (caseSet.all().length === 0) await caseSet.seed(counterpartyGoldCaseSet)
    return {
      attestation: await AttestationStore.open(join(dataDirectory, 'attestations.json'), planSigner),
      disposition: await DispositionStore.open(join(dataDirectory, 'dispositions.json'), join(dataDirectory, 'disposition-archive.json')),
      caseSet,
      evalRun: await EvalRunStore.open(join(dataDirectory, 'eval-runs.json')),
      negativeDecision: await NegativeDecisionStore.open(join(dataDirectory, 'negative-decisions.json')),
      drift: await DriftStore.open(join(dataDirectory, 'drift-events.json')),
      principal: await PrincipalStore.open(
        join(dataDirectory, 'principals.json'),
        join(dataDirectory, 'delegations.json'),
        registry.listWorkspaces().map((workspace) => workspace.id),
        registry.list().map((entry) => entry.contractId),
      ),
      emergency: await EmergencyStore.open(join(dataDirectory, 'emergency-authorizations.json'), planSigner),
    }
  })()
  return evolutionStoresPromise
}

const authenticator = authenticatorFromEnvironment()
const tenantMembershipResolver = tenantMembershipResolverFromEnvironment()
const supabaseRegistryConfig = supabaseRegistryConfigFromEnvironment()
const requestIdentityCache = new WeakMap<IncomingMessage, Promise<RequestIdentity | undefined>>()
type PendingClarification =
  | { kind: 'ENTITY'; request: CompileRequest; typeId: string; operationId: string; intentResolution: IntentResolution }
  | { kind: 'OPERATION'; request: CompileRequest; candidateOperationIds: string[]; intentResolution: IntentResolution }
const clarificationRetentionMs = 30 * 60_000
/** Kept past expiry so the owner still gets an "expired" answer rather than a bare 404. */
const expiredPlanGraceMs = 60 * 60_000
const clarifications = new SubjectScopedStore<PendingClarification>(clarificationRetentionMs)
const intentResolver = intentResolverFromEnvironment()
const embeddingProvider = embeddingProviderFromEnvironment()
const tokenExchange = tokenExchangeFromEnvironment()
const catalogSource = catalogSourceFromEnvironment()
if (catalogSource) {
  process.stderr.write(`[catalog] Classification federated from ${catalogSource.catalog}.\n`)
}
if (tokenExchange) {
  process.stderr.write(`[identity] Delegated identity enabled via ${tokenExchange.provider}; DELEGATED bindings run as the asking user.\n`)
}
const telemetryRegistered = await registerTelemetry()
if (telemetryRegistered) {
  process.stderr.write('[telemetry] Tracing registered; governed decisions and executions are exported as spans.\n')
}
const plans = new SubjectScopedStore<{ plan: SignedExecutionPlan; contractId: string }>(expiredPlanGraceMs)
const { signer: planSigner, ephemeral: ephemeralSigningKey } = await planSignerFromEnvironment()
if (ephemeralSigningKey && process.env.NODE_ENV === 'production') {
  throw new Error('LATTICE_SIGNING_KEY is required in production: an ephemeral key cannot verify a plan across restarts or replicas.')
}
if (ephemeralSigningKey) {
  process.stderr.write('[signing] No LATTICE_SIGNING_KEY configured; using an ephemeral development key. Plans will not verify across restarts.\n')
}

/**
 * Serves one request.
 *
 * Exported so a platform that owns the listening socket — a Vercel Function, say — can call it
 * directly. `(request, response)` is already the shape those runtimes hand a Node handler, so the
 * deployed API and the standalone server run exactly the same code rather than a copy of it.
 */
export async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  setCors(request, response)
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end()
    return
  }

  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    let requestIdentity: RequestIdentity | undefined

    if (request.method === 'GET' && url.pathname === '/health') {
      send(response, 200, { status: 'ok', service: 'lattice-context-api' })
      return
    }

    // Served unauthenticated: it describes the shape of the API, never its data, and a client
    // generator needs it before it has a token.
    if (request.method === 'GET' && url.pathname === '/openapi.json') {
      send(response, 200, openApiDocument)
      return
    }

    if (url.pathname.startsWith('/v1/') && !['/v1/keys/current', '/v1/keys'].includes(url.pathname)) {
      requestIdentity = await authenticate(request)
      if (!requestIdentity) {
        send(response, 401, { error: 'UNAUTHENTICATED_OR_UNAUTHORIZED', message: 'A valid user session and organization membership are required.' })
        return
      }
      const requiredRoles = requiredOrganizationRoles(request.method, url.pathname)
      if (requiredRoles && !hasOrganizationRole(requestIdentity, requiredRoles)) {
        send(response, 403, { error: 'ORGANIZATION_ROLE_REQUIRED', requiredRoles })
        return
      }
    }

    const supabaseStorage = requestIdentity && supabaseRegistryConfig
      ? new SupabaseRegistryStorage(
          supabaseRegistryConfig,
          requiredTenantId(requestIdentity),
          requestIdentity.principalId,
          request.headers.authorization ?? '',
        )
      : undefined

    /**
     * The governance ledgers for this request.
     *
     * Bound per request rather than per process because the Postgres ledgers read and write under
     * the caller's own token — that is what makes row level security, rather than this code, the
     * thing deciding which organization's artifacts are visible. Without Supabase configured they
     * fall back to the files, which is the local development path.
     */
    const ledgers = supabaseStorage && supabaseRegistryConfig && requestIdentity
      ? governanceLedgers(supabaseRegistryConfig, requiredTenantId(requestIdentity), request.headers.authorization ?? '')
      : await localStores()

    const assuranceStore = ledgers.assurance
    const reviewStore = ledgers.review
    const runtimeApprovalStore = ledgers.runtimeApproval
    const executionStore = ledgers.execution
    const connectorHealthStore = ledgers.connectorHealth
    // Resolved after `registry` below, which is the organization's registry for this request.

    /**
     * Loading the organization's whole registry costs the same whether a route needs one
     * contract or all of them, so the runtime path asks for just the release it compiles
     * against and everything else falls back to the full document.
     */
    const publishedContract = async (contractId: string): Promise<ContextContract | undefined> => (
      supabaseStorage
        ? supabaseStorage.readPublishedContract(contractId)
        : (await localStores()).registry.latestPublished(contractId)
    )

    const registry = supabaseStorage
      ? await ContractRegistry.openStorage(supabaseStorage, counterpartyRiskContract, { persistOnOpen: false })
      : (await localStores()).registry
    const evolution = await evolutionStores(registry)

    if (request.method === 'GET' && url.pathname === '/v1/connectors') {
      if (!await authenticate(request)) {
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
      if (!await authenticate(request)) {
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
      const identity = await authenticate(request)
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

    /**
     * What this deployment is wired to.
     *
     * Restricted to the roles that operate the deployment. It discloses no credentials, but the
     * shape of an environment — which catalog, which identity provider, whether signing is
     * managed — is operational detail a reader of governed data has no need for.
     */
    if (request.method === 'GET' && url.pathname === '/v1/integrations') {
      const identity = await authenticate(request)
      if (!identity) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const operatorRoles: OrganizationRole[] = ['OWNER', 'ADMIN', 'OPERATOR']
      if (!hasOrganizationRole(identity, operatorRoles)) {
        send(response, 403, { error: 'ORGANIZATION_ROLE_REQUIRED', requiredRoles: operatorRoles })
        return
      }
      send(response, 200, {
        ...integrationsSummary({
          environment: process.env,
          supabaseConfigured: Boolean(supabaseRegistryConfig),
          signing: {
            algorithm: planSigner.algorithm,
            activeKeyId: planSigner.activeKeyId,
            ephemeral: ephemeralSigningKey,
          },
          telemetryEnabled: telemetryRegistered,
        }),
        connectors: await connectorHealthStore.list(identity.tenantId),
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/v1/connectors/health') {
      const identity = await authenticate(request)
      if (!identity) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      send(response, 200, { records: await connectorHealthStore.list(identity.tenantId, url.searchParams.get('bindingId') ?? undefined) })
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/connectors/health') {
      const identity = await authenticate(request)
      if (!identity) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const body = await readJson<ConnectorHealthRequest>(request)
      if (!body.binding?.connector) {
        send(response, 400, { error: 'CONNECTOR_BINDING_REQUIRED' })
        return
      }
      const record = await connectorHealthStore.append(await probeConnectorHealth(body.binding), body.binding.freshnessMinutes, identity.tenantId)
      console.info('[connector.health]', { principalId: identity.principalId, bindingId: record.bindingId, provider: record.provider, status: record.status, latencyMs: record.latencyMs, credentialSource: record.credentialSource, errorCode: record.errorCode })
      send(response, 200, record)
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/connectors/discover') {
      const identity = await authenticate(request)
      if (!identity) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const body = await readJson<ConnectorDiscoveryRequest>(request)
      if (!body.binding?.connector || (!body.contractId?.trim() && !body.workspaceId?.trim())) {
        send(response, 400, { error: 'CONNECTOR_DISCOVERY_SCOPE_REQUIRED' })
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
        const contractId = body.contractId ?? `ontology:${body.workspaceId}`
        const sourceName = body.sourceName?.trim() || [body.binding.connector.resource.catalog, body.binding.connector.resource.database, body.binding.connector.resource.schema, body.binding.connector.resource.object].filter(Boolean).join('.')
        const preview = await discoverConnector(body.binding, contractId, sourceName)
        await applyCatalogClassifications(body.binding, preview)
        console.info('[connector.discover]', { principalId: identity.principalId, provider: body.binding.connector.provider, sourceName, fieldCount: preview.operations[0]?.fields.length ?? 0 })
        send(response, 200, preview)
      } catch (error) {
        send(response, 422, { error: 'CONNECTOR_DISCOVERY_FAILED', message: error instanceof Error ? error.message : 'Provider metadata could not be discovered.' })
      }
      return
    }

    if (request.method === 'GET' && url.pathname === '/v1/contracts/active') {
      const contractId = url.searchParams.get('contractId') ?? counterpartyRiskContract.id
      const published = await publishedContract(contractId)
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
      if (!await authenticate(request)) {
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
      if (!await authenticate(request)) {
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
      if (!await authenticate(request)) {
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
        // Annotated, never silently dropped: the caller still sees the proposal and why it is suppressed.
        const suppressed = consultNegativeDecisions(preview, evolution.negativeDecision.inForce(), {
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
      const identity = await authenticate(request)
      if (!identity) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const contractId = url.searchParams.get('contractId')
      if (!contractId) {
        send(response, 400, { error: 'CONTRACT_ID_REQUIRED' })
        return
      }
      send(response, 200, await assuranceStore.list(contractId, identity.tenantId))
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/assurance/runs') {
      const identity = await authenticate(request)
      if (!identity) {
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
      send(response, 201, await assuranceStore.append(runAssurance(body.contract), identity.tenantId))
      return
    }

    if (request.method === 'GET' && url.pathname === '/v1/reviews') {
      const identity = await authenticate(request)
      if (!identity) {
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
      const scoped = (await Promise.all(scopedContractIds.map((id) => reviewStore.list(id, identity.tenantId)))).flat()
      send(response, 200, scoped
        .map((review) => withRouting({ ...review, ...(workspaceId ? { workspaceId } : {}) }))
        .filter((review) => !status || review.status === status)
        .filter((review) => !assignedRole || (review.routingPlan?.assignments ?? []).some((assignment) => assignment.role === assignedRole))
        .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt)))
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/reviews') {
      const principal = await authenticate(request)
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
      }, principal.principalId, principal.tenantId)
      send(response, 201, review)
      return
    }

    const reviewDecisionMatch = url.pathname.match(/^\/v1\/reviews\/([^/]+)\/decisions$/)
    if (request.method === 'POST' && reviewDecisionMatch?.[1]) {
      const principal = await authenticate(request)
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
        const target = await reviewStore.get(reviewDecisionMatch[1], principal.tenantId)
        const entry = target ? registry.get(target.contractId) : undefined
        // A rejection with a typed capture becomes a negative decision, so the same mapping is
        // never silently re-proposed by discovery (E13).
        const negative = body.decision === 'REJECTED' && body.structuredRejection && entry && target
          ? await evolution.negativeDecision.create({
            workspaceId: workspaceIdFor(entry),
            contractId: entry.contractId,
            prohibited: body.structuredRejection.prohibited,
            applicability: body.structuredRejection.applicability,
            rationale: body.rationale.trim(),
            reviewBy: body.structuredRejection.reviewBy,
            ...(body.structuredRejection.exceptions ? { exceptions: body.structuredRejection.exceptions } : {}),
            reviewId: target.id,
          }, principal.principalId)
          : undefined
        const decided = await reviewStore.decide(reviewDecisionMatch[1], body.decision, body.rationale.trim(), principal.principalId, principal.tenantId, new Date(), {
          ...(body.structuredRejection ? { structuredRejection: body.structuredRejection } : {}),
          ...(negative ? { negativeDecisionId: negative.id } : {}),
        })
        if (decided.decision) {
          await evolution.attestation.mint({
            subjectKind: 'REVIEW_DECISION',
            subjectId: decided.decision.id,
            predicateType: predicateForSubject.REVIEW_DECISION,
            subject: decided.decision,
            signerId: principal.principalId,
            signerRoleAtSigning: evolution.principal.get(principal.principalId)?.roles[0] ?? 'BEARER_TOKEN_IDENTITY',
          })
        }
        send(response, 201, withRouting(decided))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'REVIEW_DECISION_FAILED'
        send(response, message === 'REVIEW_NOT_FOUND' ? 404 : 409, { error: message })
      }
      return
    }

    const assuranceRunMatch = url.pathname.match(/^\/v1\/assurance\/runs\/([^/]+)$/)
    if (request.method === 'GET' && assuranceRunMatch?.[1]) {
      const identity = await authenticate(request)
      if (!identity) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const run = await assuranceStore.get(assuranceRunMatch[1], identity.tenantId)
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
      if (!await authenticate(request)) {
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

    const releaseDiffMatch = url.pathname.match(/^\/v1\/contracts\/([^/]+)\/diffs$/)
    if (request.method === 'GET' && releaseDiffMatch?.[1]) {
      if (!await authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const fromDigest = url.searchParams.get('from')
      const toDigest = url.searchParams.get('to')
      if (!fromDigest || !toDigest) {
        send(response, 400, { error: 'RELEASE_DIFF_ENDPOINTS_REQUIRED' })
        return
      }
      const entry = registry.get(releaseDiffMatch[1])
      if (!entry) {
        send(response, 404, { error: 'CONTRACT_NOT_FOUND' })
        return
      }
      const from = entry.releases.find((release) => release.digest === fromDigest)
      const to = entry.releases.find((release) => release.digest === toDigest)
      if (!from || !to) {
        send(response, 404, { error: 'RELEASE_NOT_FOUND' })
        return
      }
      send(response, 200, buildReleaseDiffArtifact(entry.contractId, from, to))
      return
    }

    const releaseEventsMatch = url.pathname.match(/^\/v1\/contracts\/([^/]+)\/release-events$/)
    if (request.method === 'GET' && releaseEventsMatch?.[1]) {
      if (!await authenticate(request)) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const entry = registry.get(releaseEventsMatch[1])
      if (!entry) {
        send(response, 404, { error: 'CONTRACT_NOT_FOUND' })
        return
      }
      send(response, 200, entry.releaseEvents ?? [])
      return
    }

    const releaseMatch = url.pathname.match(/^\/v1\/contracts\/([^/]+)\/releases$/)
    if (request.method === 'POST' && releaseMatch?.[1]) {
      if (!await authenticate(request)) {
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
      if (!await authenticate(request)) {
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
      if (!await authenticate(request)) {
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

    const rollbackMatch = url.pathname.match(/^\/v1\/contracts\/([^/]+)\/rollbacks$/)
    if (request.method === 'POST' && rollbackMatch?.[1]) {
      const principal = await authenticate(request)
      if (!principal) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const body = await readJson<{ digest?: string; rationale?: string }>(request)
      if (!body.digest) {
        send(response, 400, { error: 'RELEASE_DIGEST_REQUIRED' })
        return
      }
      if (!body.rationale?.trim()) {
        send(response, 400, { error: 'ROLLBACK_RATIONALE_REQUIRED' })
        return
      }
      try {
        send(response, 200, await registry.rollbackRelease(rollbackMatch[1], body.digest, body.rationale, principal.principalId))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'ROLLBACK_FAILED'
        send(response, message === 'CONTRACT_NOT_FOUND' || message === 'RELEASE_NOT_FOUND' ? 404 : 409, { error: message })
      }
      return
    }

    if (request.method === 'GET' && url.pathname === '/v1/keys/current') {
      const [active] = planSigner.publicKeys()
      send(response, 200, { keyId: planSigner.activeKeyId, algorithm: 'Ed25519', publicKey: active })
      return
    }

    // Every key a verifier should trust, so a plan signed before a rotation can still be checked
    // offline for as long as it is valid.
    if (request.method === 'GET' && url.pathname === '/v1/keys') {
      send(response, 200, { keys: planSigner.publicKeys() })
      return
    }

    if (request.method === 'GET' && url.pathname === '/v1/runtime-approvals') {
      const identity = await authenticate(request)
      if (!identity) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const contractId = url.searchParams.get('contractId')
      if (!contractId) {
        send(response, 400, { error: 'CONTRACT_ID_REQUIRED' })
        return
      }
      send(response, 200, await runtimeApprovalStore.list(contractId, identity.tenantId))
      return
    }

    if (request.method === 'GET' && url.pathname === '/v1/executions') {
      const identity = await authenticate(request)
      if (!identity) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const contractId = url.searchParams.get('contractId')
      if (!contractId) {
        send(response, 400, { error: 'CONTRACT_ID_REQUIRED' })
        return
      }
      send(response, 200, await executionStore.list(contractId, identity.tenantId))
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/compile') {
      const principal = await authenticate(request)
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
      // DRY_RUN compiles the draft, so a contract reaches the money moment before it is published
      // (E3, fixes G3). It returns a disposition that explains and explicitly does not authorize.
      const compileMode: DispositionMode = body.mode === 'DRY_RUN' ? 'DRY_RUN' : 'AUTHORIZED'
      const selectedContract = compileMode === 'DRY_RUN'
        ? registry.get(selectedContractId)?.draft
        : await publishedContract(selectedContractId)
      if (!selectedContract) {
        send(response, compileMode === 'DRY_RUN' ? 404 : 409, compileMode === 'DRY_RUN'
          ? { error: 'CONTRACT_NOT_FOUND' }
          : { error: 'CONTRACT_NOT_PUBLISHED', message: 'Publish this contract before compiling authorized questions, or compile with mode DRY_RUN.' })
        return
      }
      const runtimeContract = materializeSimulatedContext(selectedContract)
      const compileStartedAt = process.hrtime.bigint()
      const result = await withSpan('lattice.compile', {
        'lattice.contract_id': runtimeContract.id,
        'lattice.contract_version': runtimeContract.version,
        'lattice.tenant_id': principal.tenantId ?? 'none',
      }, async (span) => {
        const resolver = resolverFor(principal, request)
        const intentResolution = await withSpan('lattice.resolve_intent', {}, async () => resolver.resolve(body, runtimeContract))
        const raw = new ContextCompiler(runtimeContract).compile(body, { intentResolution, ...subjectOf(principal) })
        // A dry run is never signed and never raises a runtime approval: it authorizes nothing.
        const compiled = compileMode === 'DRY_RUN' ? raw : await prepareCompile(raw, runtimeContract, principal, runtimeApprovalStore)
        rememberClarification(compiled, principal, body, intentResolution)
        recordCompileDecision(span, compiled)
        return compiled
      })
      const enriched = await recordDisposition(evolution, registry, {
        result,
        contract: runtimeContract,
        question: body.question,
        mode: compileMode,
        purposeId: body.purposeId,
        principalId: principal.principalId,
        latencyMs: Number(process.hrtime.bigint() - compileStartedAt) / 1e6,
      })
      send(response, result.decision === 'RESOLVED' ? 200 : result.decision === 'APPROVAL_REQUIRED' ? 202 : 422, { ...enriched, principal })
      return
    }

    const clarificationMatch = url.pathname.match(/^\/v1\/clarifications\/([^/]+)$/)
    if (request.method === 'POST' && clarificationMatch?.[1]) {
      const principal = await authenticate(request)
      if (!principal) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const pending = clarifications.get(clarificationMatch[1], subjectOf(principal))
      if (!pending) {
        send(response, 404, { error: 'CLARIFICATION_NOT_FOUND' })
        return
      }
      const body = await readJson<{ entityId?: string; operationId?: string }>(request)
      const selectedContract = await publishedContract(pending.request.contractId ?? counterpartyRiskContract.id)
      if (!selectedContract) {
        send(response, 409, { error: 'CONTRACT_NOT_PUBLISHED' })
        return
      }
      const runtimeContract = materializeSimulatedContext(selectedContract)
      const clarificationStartedAt = process.hrtime.bigint()
      if (pending.kind === 'ENTITY' && !body.entityId) {
        send(response, 400, { error: 'ENTITY_ID_REQUIRED' })
        return
      }
      if (pending.kind === 'OPERATION' && (!body.operationId || !pending.candidateOperationIds.includes(body.operationId))) {
        send(response, 400, { error: 'INVALID_OPERATION_SELECTION', candidates: pending.candidateOperationIds })
        return
      }
      const selectedOperationId = pending.kind === 'ENTITY' ? pending.operationId : body.operationId!
      const result = await prepareCompile(
        new ContextCompiler(runtimeContract).compile({
          ...pending.request,
          ...(pending.kind === 'ENTITY' ? {
            selections: { ...pending.request.selections, [pending.typeId]: body.entityId! },
          } : {}),
        }, {
          intentResolution: pending.intentResolution,
          selectedOperationId,
          ...subjectOf(principal),
        }), runtimeContract, principal, runtimeApprovalStore,
      )
      clarifications.delete(clarificationMatch[1])
      rememberClarification(result, principal, pending.request, pending.intentResolution, selectedOperationId)
      const enriched = await recordDisposition(evolution, registry, {
        result,
        contract: runtimeContract,
        question: pending.request.question,
        mode: pending.request.mode === 'DRY_RUN' ? 'DRY_RUN' : 'AUTHORIZED',
        purposeId: pending.request.purposeId,
        principalId: principal.principalId,
        latencyMs: Number(process.hrtime.bigint() - clarificationStartedAt) / 1e6,
        clarificationId: clarificationMatch[1],
      })
      send(response, result.decision === 'RESOLVED' ? 200 : result.decision === 'APPROVAL_REQUIRED' ? 202 : 422, { ...enriched, principal })
      return
    }

    const runtimeDecisionMatch = url.pathname.match(/^\/v1\/runtime-approvals\/([^/]+)\/decisions$/)
    if (request.method === 'POST' && runtimeDecisionMatch?.[1]) {
      const principal = await authenticate(request)
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
        send(response, 201, await runtimeApprovalStore.decide(runtimeDecisionMatch[1], body.decision, body.rationale.trim(), principal.principalId, principal.tenantId))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'RUNTIME_APPROVAL_DECISION_FAILED'
        send(response, message === 'RUNTIME_APPROVAL_NOT_FOUND' ? 404 : 409, { error: message })
      }
      return
    }

    const runtimeResumeMatch = url.pathname.match(/^\/v1\/runtime-approvals\/([^/]+)\/resume$/)
    if (request.method === 'POST' && runtimeResumeMatch?.[1]) {
      const principal = await authenticate(request)
      if (!principal) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const approval = await runtimeApprovalStore.get(runtimeResumeMatch[1], principal.tenantId)
      if (!approval) {
        send(response, 404, { error: 'RUNTIME_APPROVAL_NOT_FOUND' })
        return
      }
      if (approval.status === 'RESUMED' && approval.signedPlanId) {
        send(response, 200, { approval, plan: plans.get(approval.signedPlanId, subjectOf(principal))?.plan })
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
      // The renewed plan is re-bound to the operator resuming it, who holds the role required
      // to execute. The requester's original plan is never handed on as a bearer capability.
      const renewedPlan: UnsignedExecutionPlan = {
        ...approval.pendingPlan,
        planId: `plan_${randomUUID()}`,
        principalId: principal.principalId,
        ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
        expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
        nonce: randomUUID(),
      }
      const signedPlan = await signAndStore(renewedPlan, approval.contractId, principal)
      const resumed = await runtimeApprovalStore.markResumed(approval.id, signedPlan.planId, principal.tenantId, now)
      send(response, 200, { approval: resumed, plan: signedPlan })
      return
    }

    const verifyMatch = url.pathname.match(/^\/v1\/plans\/([^/]+)\/verify$/)
    if (request.method === 'POST' && verifyMatch?.[1]) {
      const principal = await authenticate(request)
      if (!principal) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      // A plan belonging to another subject is reported as absent rather than forbidden, so
      // the response cannot be used to probe for live plan identifiers.
      const plan = plans.get(verifyMatch[1], subjectOf(principal))?.plan
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
      const principal = await authenticate(request)
      if (!principal) {
        send(response, 401, { error: 'UNAUTHENTICATED' })
        return
      }
      const stored = plans.get(executeMatch[1], subjectOf(principal))
      if (!stored) {
        send(response, 404, { error: 'PLAN_NOT_FOUND' })
        return
      }
      const { plan, contractId } = stored
      const body = await readJson<ExecutePlanRequest & { grantedPermissions?: unknown }>(request)
      if (body.grantedPermissions !== undefined) {
        send(response, 400, {
          error: 'PERMISSIONS_IN_BODY_FORBIDDEN',
          message: 'Granted permissions are derived from the authenticated identity, never from the request body.',
        })
        return
      }
      if (!verifyPlan(plan) || Date.now() > new Date(plan.expiresAt).getTime()) {
        send(response, 422, { error: 'PLAN_INVALID_OR_EXPIRED' })
        return
      }
      if (await executionStore.findConsumedByPlanId(plan.planId)) {
        send(response, 409, { error: 'PLAN_NONCE_ALREADY_CONSUMED' })
        return
      }
      const activeContract = registry.latestPublished(contractId)
      if (!activeContract || activeContract.digest !== plan.contractDigest) {
        send(response, 409, { error: 'PLAN_RELEASE_NO_LONGER_ACTIVE' })
        return
      }
      const grantedPermissions = resolveGrantedPermissions(principal)
      const missing = missingPermissions(grantedPermissions, plan.requiredPermissions)
      const startedAt = new Date().toISOString()
      if (missing.length > 0) {
        // Recorded for audit, but deliberately not treated as consuming the plan's nonce.
        const receipt = await executionStore.append({
          ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
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
        send(response, 403, { error: 'REQUIRED_PERMISSION_MISSING', missingPermissions: missing, receipt })
        return
      }
      const bindingResults = await withSpan('lattice.execute_bindings', {
        'lattice.operation': plan.operation,
        'lattice.risk_tier': plan.riskTier,
        'lattice.grounding': plan.grounding,
        'lattice.bindings': plan.sourceBindings.length,
      }, async () => executeBindings(plan, activeContract, {
        ...(principal.tenantId ? { digestSalt: principal.tenantId } : {}),
        ...delegationFor(request),
      }))
      const receipt = await executionStore.append({
        ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
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
      await withSpan('lattice.execution_receipt', {}, async (span) => { recordExecution(span, receipt) })
      send(response, receipt.status === 'SUCCESS' ? 200 : 502, receipt)
      return
    }

    if (await handleEvolutionRoutes({ request, response, url, identity: requestIdentity, registry, evolution, assuranceStore, reviewStore, executionStore })) return

    send(response, 404, { error: 'NOT_FOUND' })
  } catch (error) {
    if (error instanceof ContractValidationError) {
      send(response, 422, { error: error.message, issues: error.issues })
      return
    }
    if (error instanceof ContractRegistryConflictError) {
      send(response, 409, { error: 'CONTRACT_MODIFIED_CONCURRENTLY', message: error.message })
      return
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    send(response, message === 'INVALID_JSON' || message === 'PAYLOAD_TOO_LARGE' ? 400 : 500, {
      error: message,
    })
  }
}

/**
 * Listens only when this module is the program being run.
 *
 * Imported as a handler — which is how the Vercel Function uses it — binding a port would either
 * fail or quietly hold one open for the lifetime of the invocation.
 */
if (process.env.LATTICE_DISABLE_LISTEN !== 'true') {
  createServer(handleRequest).listen(port, host, () => {
    process.stdout.write(`Lattice Context API listening at http://${host}:${port}\n`)
  })
}


/**
 * Chooses where semantic candidates come from for this request.
 *
 * The persisted index is release-scoped and read under the caller's own token, so it has to be
 * built per request rather than once at startup. Without Supabase or without an embedding
 * endpoint there is nothing to read, and the process-level resolver — lexical, or the in-memory
 * hybrid — answers instead.
 */

/**
 * Supplies the caller's own token so a DELEGATED binding runs as them.
 *
 * Without a configured exchange there is nothing to delegate with, and a binding that asked for
 * delegation fails rather than quietly running as the service principal — which would apply none
 * of the platform's row filters while the receipt claimed otherwise.
 */

/**
 * Labels discovered fields with the classification the data catalog already holds.
 *
 * Discovery is the moment an author first sees a source column, and it is the only moment they
 * are choosing what to map. Arriving pre-labelled is what stops a second, diverging judgement
 * being made in the Studio. A catalog that cannot be read leaves the fields unlabelled rather
 * than blocking discovery — but it is never reported as "nothing sensitive here".
 */
async function applyCatalogClassifications(binding: SourceBinding, preview: BindingPreview): Promise<void> {
  if (!catalogSource) return

  const resource = binding.connector?.resource
  const prefix = [resource?.catalog, resource?.database, resource?.schema, resource?.object].filter(Boolean).join('.')
  if (!prefix) return

  const columns = preview.operations.flatMap((operation) => operation.fields.map((field) => ({
    field,
    qualifiedName: `${prefix}.${field.path.replace(/^\$\./, '')}`,
  })))

  try {
    const assertions = await catalogSource.classify(columns.map((column) => ({ qualifiedName: column.qualifiedName })))
    for (const column of columns) {
      const assertion = assertions.get(column.qualifiedName)
      if (assertion) column.field.classification = assertion
    }
  } catch (error) {
    console.warn('[catalog.classify]', { catalog: catalogSource.catalog, error: error instanceof Error ? error.message : 'unknown' })
  }
}

function delegationFor(request: IncomingMessage): { delegation?: ExecuteBindingsOptions['delegation'] } {
  const subjectToken = request.headers.authorization?.replace(/^Bearer /i, '').trim()
  if (!tokenExchange || !subjectToken) return {}
  return {
    delegation: {
      subjectToken,
      exchange: (token, scope) => tokenExchange!.exchange(token, scope),
      scopeFor: (provider) => delegationScopeFor(provider),
    },
  }
}

function resolverFor(identity: RequestIdentity, request: IncomingMessage): IntentResolver {
  if (!supabaseRegistryConfig || !embeddingProvider || !identity.tenantId) return intentResolver
  return new PersistedIntentResolver({
    projectUrl: supabaseRegistryConfig.projectUrl,
    publishableKey: supabaseRegistryConfig.publishableKey,
    organizationId: identity.tenantId,
    authorization: request.headers.authorization ?? '',
    embeddingProvider,
  })
}


/* ------------------------------------------------------------------ *
 * Evolution & evaluation routes (E3–E19, E21).
 * ------------------------------------------------------------------ */

interface EvolutionContext {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  identity: RequestIdentity | undefined
  registry: ContractRegistry
  evolution: EvolutionStores
  assuranceStore: AssuranceStore
  reviewStore: ReviewStore
  executionStore: ExecutionStore
}

/**
 * Every `/v1/` path is already authenticated and role-checked by the caller, so these handlers
 * take the resolved identity rather than re-authenticating. Returning false means "not my route".
 */
// eslint-disable-next-line complexity
async function handleEvolutionRoutes({ request, response, url, identity, registry, evolution, assuranceStore, reviewStore, executionStore }: EvolutionContext): Promise<boolean> {
  const method = request.method ?? 'GET'
  const path = url.pathname
  const tenantId = identity?.tenantId
  const principalId = identity?.principalId ?? 'principal_anonymous'
  const roleOf = (id: string) => evolution.principal.get(id)?.roles[0] ?? 'BEARER_TOKEN_IDENTITY'

  /* ---- Declared purpose and derived risk tier (E4) ---- */

  if (method === 'GET' && path === '/v1/purposes') {
    const contractId = url.searchParams.get('contractId')
    const contract = contractId ? registry.get(contractId)?.draft : undefined
    const domain = url.searchParams.get('domain') ?? contract?.domain ?? ''
    const available = purposesForDomain(domain)
    /*
     * The contract is the authority. The compiler denies any purpose a contract has not declared,
     * so returning the global catalogue for a contract that declares none would offer choices that
     * are guaranteed to be refused. `catalog` is the starter set a steward can adopt; `purposes` is
     * what a caller may actually name right now.
     */
    const declared: DeclaredPurpose[] = contract?.purposes ?? []
    send(response, 200, contractId
      ? { purposes: declared, catalog: available.filter((purpose) => !declared.some((candidate) => candidate.id === purpose.id)) }
      : { purposes: available, catalog: [] })
    return true
  }

  if (method === 'POST' && path === '/v1/risk-tier') {
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
    const query: DispositionQuery = {
      ...optional('contractId', url), ...optional('workspaceId', url), ...optional('purposeId', url), ...optional('principalId', url), ...optional('cursor', url), ...optional('from', url), ...optional('to', url),
      ...(url.searchParams.get('decision') ? { decision: url.searchParams.get('decision') as RuntimeDecision } : {}),
      ...(url.searchParams.get('riskTier') ? { riskTier: url.searchParams.get('riskTier') as RiskTier } : {}),
      ...(url.searchParams.get('mode') ? { mode: url.searchParams.get('mode') as DispositionMode } : {}),
      ...(url.searchParams.get('limit') ? { limit: Number(url.searchParams.get('limit')) } : {}),
    }
    send(response, 200, evolution.disposition.query(query))
    return true
  }

  const dispositionMatch = path.match(/^\/v1\/dispositions\/([^/]+)$/)
  if (method === 'GET' && dispositionMatch?.[1]) {
    const record = evolution.disposition.get(dispositionMatch[1])
    if (!record) {
      send(response, 404, { error: 'DISPOSITION_NOT_FOUND' })
      return true
    }
    send(response, 200, record)
    return true
  }

  if (method === 'GET' && path === '/v1/retention') {
    send(response, 200, evolution.disposition.retention())
    return true
  }

  /* ---- Attestations (E16) ---- */

  if (method === 'GET' && path === '/v1/attestations') {
    send(response, 200, evolution.attestation.list({ ...optional('subjectId', url), ...(url.searchParams.get('subjectKind') ? { subjectKind: url.searchParams.get('subjectKind') as Parameters<typeof evolution.attestation.list>[0] extends { subjectKind?: infer K } ? K : never } : {}) }))
    return true
  }

  const attestationVerifyMatch = path.match(/^\/v1\/attestations\/([^/]+)\/verify$/)
  if (method === 'POST' && attestationVerifyMatch?.[1]) {
    const attestation = evolution.attestation.get(attestationVerifyMatch[1])
    if (!attestation) {
      send(response, 404, { error: 'ATTESTATION_NOT_FOUND' })
      return true
    }
    const subject = await resolveAttestationSubject({ request, response, url, identity, registry, evolution, assuranceStore, reviewStore, executionStore }, attestation.subjectKind, attestation.subjectId)
    const verification = evolution.attestation.verify(attestation.id, subject, planSigner.activeKeyId)
    send(response, verification?.verified ? 200 : 422, verification)
    return true
  }

  const attestationMatch = path.match(/^\/v1\/attestations\/([^/]+)$/)
  if (method === 'GET' && attestationMatch?.[1]) {
    const attestation = evolution.attestation.get(attestationMatch[1])
    if (!attestation) {
      send(response, 404, { error: 'ATTESTATION_NOT_FOUND' })
      return true
    }
    send(response, 200, attestation)
    return true
  }

  /* ---- Case sets (E6) ---- */

  if (method === 'GET' && path === '/v1/case-sets') {
    send(response, 200, evolution.caseSet.list({ ...optional('workspaceId', url), ...optional('contractId', url) }))
    return true
  }

  if (method === 'POST' && path === '/v1/case-sets') {
    const body = await readJson<CreateCaseSetRequest>(request)
    if (!body.name?.trim() || !body.scope) {
      send(response, 400, { error: 'INVALID_CASE_SET', message: 'A name and a scope are required.' })
      return true
    }
    send(response, 201, await evolution.caseSet.create(body))
    return true
  }

  const caseSetCasesMatch = path.match(/^\/v1\/case-sets\/([^/]+)\/cases$/)
  if (caseSetCasesMatch?.[1]) {
    const caseSet = evolution.caseSet.get(caseSetCasesMatch[1])
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
      send(response, 200, await evolution.caseSet.upsertCase(caseSet.id, body.case))
      return true
    }
  }

  const caseSetMatch = path.match(/^\/v1\/case-sets\/([^/]+)$/)
  if (caseSetMatch?.[1]) {
    const caseSet = evolution.caseSet.get(caseSetMatch[1])
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
      send(response, 200, await evolution.caseSet.replace(caseSet.id, body.caseSet))
      return true
    }
  }

  /* ---- Evaluation runs, diff, failure routing (E7, E8, E10) ---- */

  if (method === 'GET' && path === '/v1/eval/runs') {
    send(response, 200, evolution.evalRun.list({ ...optional('contractId', url), ...optional('caseSetId', url), ...optional('environment', url) }))
    return true
  }

  if (method === 'POST' && path === '/v1/eval/runs') {
    const body = await readJson<CreateEvalRunRequest>(request)
    const caseSet = evolution.caseSet.get(body.caseSetId ?? '')
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
      triggeredBy: principalId,
      ...(tenantId ? { tenantId } : {}),
      principalChain: evolution.principal.chainFor(principalId),
      ...(body.baselineRunId ? { baselineRunId: body.baselineRunId } : {}),
      now,
    })
    for (const record of dispositions) await evolution.disposition.append(record)
    const evidence = evidenceForEvalRun(run)
    const stored = await evolution.evalRun.append({ ...run, evidenceRecordId: evidence.id })
    await evolution.attestation.mint({ subjectKind: 'EVAL_RUN', subjectId: stored.id, predicateType: predicateForSubject.EVAL_RUN, subject: stored, signerId: principalId, signerRoleAtSigning: evolution.principal.get(principalId)?.roles[0] ?? 'BEARER_TOKEN_IDENTITY' })
    send(response, 201, stored)
    return true
  }

  const evalDiffMatch = path.match(/^\/v1\/eval\/runs\/([^/]+)\/diff$/)
  if (method === 'GET' && evalDiffMatch?.[1]) {
    const candidate = evolution.evalRun.get(evalDiffMatch[1])
    const baseline = evolution.evalRun.get(url.searchParams.get('baseline') ?? '')
    if (!candidate || !baseline) {
      send(response, 404, { error: candidate ? 'BASELINE_RUN_NOT_FOUND' : 'EVAL_RUN_NOT_FOUND' })
      return true
    }
    send(response, 200, diffEvalRuns(candidate, baseline))
    return true
  }

  const evalCancelMatch = path.match(/^\/v1\/eval\/runs\/([^/]+)\/cancel$/)
  if (method === 'POST' && evalCancelMatch?.[1]) {
    const run = evolution.evalRun.get(evalCancelMatch[1])
    if (!run) {
      send(response, 404, { error: 'EVAL_RUN_NOT_FOUND' })
      return true
    }
    if (run.status !== 'RUNNING' && run.status !== 'QUEUED') {
      send(response, 409, { error: 'EVAL_RUN_ALREADY_FINISHED' })
      return true
    }
    send(response, 200, await evolution.evalRun.replace({ ...run, status: 'CANCELLED', completedAt: new Date().toISOString() }))
    return true
  }

  const evalRunMatch = path.match(/^\/v1\/eval\/runs\/([^/]+)$/)
  if (method === 'GET' && evalRunMatch?.[1]) {
    const run = evolution.evalRun.get(evalRunMatch[1])
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
    const review = await reviewStore.get(blastRadiusMatch[1], tenantId)
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
      dispositions: evolution.disposition.all().filter((record) => record.contractId === entry.contractId),
    }))
    return true
  }

  const reviewDelegateMatch = path.match(/^\/v1\/reviews\/([^/]+)\/delegate$/)
  if (method === 'POST' && reviewDelegateMatch?.[1]) {
    const review = await reviewStore.get(reviewDelegateMatch[1], tenantId)
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
    const review = await reviewStore.get(reviewMatch[1], tenantId)
    if (!review) {
      send(response, 404, { error: 'REVIEW_NOT_FOUND' })
      return true
    }
    send(response, 200, withRouting(review))
    return true
  }

  /* ---- Negative decisions (E13) ---- */

  if (method === 'GET' && path === '/v1/negative-decisions') {
    send(response, 200, evolution.negativeDecision.list({ ...optional('workspaceId', url), ...optional('contractId', url) }))
    return true
  }

  if (method === 'POST' && path === '/v1/negative-decisions') {
    const body = await readJson<CreateNegativeDecisionRequest>(request)
    if (!body.workspaceId || !body.prohibited?.subject?.trim() || !body.rationale?.trim() || !body.reviewBy) {
      send(response, 400, { error: 'INVALID_NEGATIVE_DECISION', message: 'A workspace, a prohibited subject, a rationale, and a review-by date are required.' })
      return true
    }
    send(response, 201, await evolution.negativeDecision.create(body, principalId))
    return true
  }

  const negativeWithdrawMatch = path.match(/^\/v1\/negative-decisions\/([^/]+)\/withdraw$/)
  if (method === 'POST' && negativeWithdrawMatch?.[1]) {
    const body = await readJson<{ rationale?: string }>(request)
    if (!body.rationale?.trim() || body.rationale.trim().length < 12) {
      send(response, 400, { error: 'RATIONALE_REQUIRED', message: 'A rationale of at least 12 characters is required.' })
      return true
    }
    try {
      send(response, 200, await evolution.negativeDecision.withdraw(negativeWithdrawMatch[1], body.rationale.trim(), principalId))
    } catch (error) {
      send(response, 404, { error: error instanceof Error ? error.message : 'NEGATIVE_DECISION_NOT_FOUND' })
    }
    return true
  }

  const negativeMatch = path.match(/^\/v1\/negative-decisions\/([^/]+)$/)
  if (method === 'GET' && negativeMatch?.[1]) {
    const decision = evolution.negativeDecision.get(negativeMatch[1])
    if (!decision) {
      send(response, 404, { error: 'NEGATIVE_DECISION_NOT_FOUND' })
      return true
    }
    send(response, 200, decision)
    return true
  }

  /* ---- Drift, source health, counterfactual replay (E14) ---- */

  if (method === 'GET' && path === '/v1/drift') {
    send(response, 200, evolution.drift.list({ ...optional('workspaceId', url), ...optional('contractId', url) }))
    return true
  }

  if (method === 'POST' && path === '/v1/drift/scan') {
    const body = await readJson<{ workspaceId?: string }>(request)
    const detected = registry.list()
      .filter((entry) => !body.workspaceId || workspaceIdFor(entry) === body.workspaceId)
      .flatMap((entry) => detectDrift(entry, registry.getWorkspace(workspaceIdFor(entry))))
    send(response, 200, await evolution.drift.upsertMany(detected))
    return true
  }

  if (method === 'GET' && path === '/v1/source-health') {
    const entry = registry.get(url.searchParams.get('contractId') ?? '')
    if (!entry) {
      send(response, 404, { error: 'CONTRACT_NOT_FOUND' })
      return true
    }
    send(response, 200, sourceHealthFor(entry.draft, evolution.drift.list({ contractId: entry.contractId })))
    return true
  }

  const driftReplayMatch = path.match(/^\/v1\/drift\/([^/]+)\/replay$/)
  if (method === 'POST' && driftReplayMatch?.[1]) {
    const event = evolution.drift.get(driftReplayMatch[1])
    const entry = event?.contractId ? registry.get(event.contractId) : undefined
    if (!event || !entry) {
      send(response, 404, { error: 'DRIFT_EVENT_NOT_FOUND' })
      return true
    }
    const counterfactual = replayDrift({
      event,
      dispositions: evolution.disposition.all().filter((record) => record.contractId === entry.contractId && record.mode === 'AUTHORIZED'),
      contract: entry.draft,
      ...(tenantId ? { tenantId } : {}),
    })
    await evolution.drift.replace({ ...event, counterfactual })
    send(response, 200, counterfactual)
    return true
  }

  const driftActionMatch = path.match(/^\/v1\/drift\/([^/]+)\/actions$/)
  if (method === 'POST' && driftActionMatch?.[1]) {
    const event = evolution.drift.get(driftActionMatch[1])
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
      }, principalId, tenantId)
    }
    const status = body.action === 'ACKNOWLEDGE' ? 'ACKNOWLEDGED' as const : body.action === 'RESOLVE' ? 'RESOLVED' as const : body.action === 'ALLOW_READ_ONLY' ? 'ACKNOWLEDGED' as const : event.status
    send(response, 200, await evolution.drift.replace({ ...event, status }))
    return true
  }

  const driftMatch = path.match(/^\/v1\/drift\/([^/]+)$/)
  if (method === 'GET' && driftMatch?.[1]) {
    const event = evolution.drift.get(driftMatch[1])
    if (!event) {
      send(response, 404, { error: 'DRIFT_EVENT_NOT_FOUND' })
      return true
    }
    send(response, 200, event)
    return true
  }

  /* ---- Per-use eligibility (E11) ---- */

  if (method === 'GET' && path === '/v1/eligibility') {
    const entry = registry.get(url.searchParams.get('contractId') ?? '')
    if (!entry) {
      send(response, 404, { error: 'CONTRACT_NOT_FOUND' })
      return true
    }
    const workspaceId = workspaceIdFor(entry)
    send(response, 200, buildEligibility({
      entry,
      contract: entry.draft,
      assuranceRuns: await assuranceStore.list(entry.contractId, tenantId),
      reviews: await reviewStore.list(entry.contractId, tenantId),
      driftEvents: evolution.drift.list({ contractId: entry.contractId }),
      dispositions: evolution.disposition.all().filter((record) => record.contractId === entry.contractId),
      autonomousGrantAvailable: evolution.principal.grants({ workspaceId }).some((grant) => grant.status === 'ACTIVE' && grant.riskTierCeiling === 'OPERATIONAL_ACTION'),
    }))
    return true
  }

  /* ---- Identity and delegation (E15) ---- */

  if (method === 'GET' && path === '/v1/session') {
    // A bearer identity that is not in the declared directory is recorded as exactly what it
    // verifiably is, so the session always resolves to a real Principal rather than a chain link.
    if (!evolution.principal.get(principalId)) {
      await evolution.principal.observe([principalId], registry.listWorkspaces().map((workspace) => workspace.id))
    }
    send(response, 200, { principal: evolution.principal.get(principalId), chain: evolution.principal.chainFor(principalId) })
    return true
  }

  if (method === 'GET' && path === '/v1/principals') {
    send(response, 200, evolution.principal.all(url.searchParams.get('workspaceId') ?? undefined))
    return true
  }

  if (method === 'GET' && path === '/v1/identity-graph') {
    send(response, 200, evolution.principal.identityGraph(url.searchParams.get('workspaceId') ?? undefined))
    return true
  }

  if (method === 'GET' && path === '/v1/delegations') {
    send(response, 200, evolution.principal.grants({ ...optional('workspaceId', url), ...optional('principalId', url) }))
    return true
  }

  if (method === 'POST' && path === '/v1/delegations') {
    const body = await readJson<CreateDelegationGrantRequest>(request)
    if (!body.toPrincipalId || !Array.isArray(body.scope) || body.scope.length === 0 || !body.maximumActions) {
      send(response, 400, { error: 'INVALID_DELEGATION', message: 'A delegate, at least one scope, and a maximum action budget are required.' })
      return true
    }
    send(response, 201, await evolution.principal.createGrant(body, principalId))
    return true
  }

  const grantRevokeMatch = path.match(/^\/v1\/delegations\/([^/]+)\/revoke$/)
  if (method === 'POST' && grantRevokeMatch?.[1]) {
    const body = await readJson<{ rationale?: string }>(request)
    if (!body.rationale?.trim()) {
      send(response, 400, { error: 'RATIONALE_REQUIRED' })
      return true
    }
    try {
      send(response, 200, await evolution.principal.revokeGrant(grantRevokeMatch[1], body.rationale.trim()))
    } catch (error) {
      send(response, 404, { error: error instanceof Error ? error.message : 'GRANT_NOT_FOUND' })
    }
    return true
  }

  const principalMatch = path.match(/^\/v1\/principals\/([^/]+)$/)
  if (method === 'GET' && principalMatch?.[1]) {
    const principal = evolution.principal.get(principalMatch[1])
    if (!principal) {
      send(response, 404, { error: 'PRINCIPAL_NOT_FOUND' })
      return true
    }
    send(response, 200, principal)
    return true
  }

  /* ---- Emergency authorization and its retrospective queue (E18) ---- */

  if (method === 'GET' && path === '/v1/emergency-authorizations') {
    send(response, 200, evolution.emergency.list({
      ...optional('contractId', url), ...optional('workspaceId', url),
      ...(url.searchParams.get('status') ? { status: url.searchParams.get('status') as Parameters<typeof evolution.emergency.list>[0] extends { status?: infer S } ? S : never } : {}),
    }))
    return true
  }

  if (method === 'POST' && path === '/v1/emergency-authorizations') {
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
    const authorization = await evolution.emergency.create(body, principalId)
    await evolution.attestation.mint({ subjectKind: 'EMERGENCY_AUTHORIZATION', subjectId: authorization.id, predicateType: predicateForSubject.EMERGENCY_AUTHORIZATION, subject: authorization, signerId: principalId, signerRoleAtSigning: evolution.principal.get(principalId)?.roles[0] ?? 'BEARER_TOKEN_IDENTITY' })
    send(response, 201, authorization)
    return true
  }

  const emergencyApprovalMatch = path.match(/^\/v1\/emergency-authorizations\/([^/]+)\/approvals$/)
  if (method === 'POST' && emergencyApprovalMatch?.[1]) {
    const body = await readJson<{ role?: string; rationale?: string }>(request)
    if (!body.role || !body.rationale?.trim() || body.rationale.trim().length < 12) {
      send(response, 400, { error: 'INVALID_EMERGENCY_APPROVAL', message: 'A role and a rationale of at least 12 characters are required.' })
      return true
    }
    try {
      send(response, 200, await evolution.emergency.approve(emergencyApprovalMatch[1], body.role, body.rationale.trim(), principalId))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'EMERGENCY_APPROVAL_FAILED'
      send(response, message === 'EMERGENCY_AUTHORIZATION_NOT_FOUND' ? 404 : 409, { error: message })
    }
    return true
  }

  const emergencyRetrospectiveMatch = path.match(/^\/v1\/emergency-authorizations\/([^/]+)\/retrospective$/)
  if (method === 'POST' && emergencyRetrospectiveMatch?.[1]) {
    const body = await readJson<EmergencyRetrospectiveRequest>(request)
    if (!['JUSTIFIED', 'UNJUSTIFIED', 'PROCESS_GAP'].includes(body.verdict) || !body.notes?.trim()) {
      send(response, 400, { error: 'INVALID_RETROSPECTIVE', message: 'A verdict and notes are required.' })
      return true
    }
    try {
      send(response, 200, await evolution.emergency.recordRetrospective(emergencyRetrospectiveMatch[1], body, principalId))
    } catch (error) {
      send(response, 404, { error: error instanceof Error ? error.message : 'EMERGENCY_AUTHORIZATION_NOT_FOUND' })
    }
    return true
  }

  const emergencyMatch = path.match(/^\/v1\/emergency-authorizations\/([^/]+)$/)
  if (method === 'GET' && emergencyMatch?.[1]) {
    const authorization = evolution.emergency.get(emergencyMatch[1])
    if (!authorization) {
      send(response, 404, { error: 'EMERGENCY_AUTHORIZATION_NOT_FOUND' })
      return true
    }
    send(response, 200, authorization)
    return true
  }

  /* ---- Activity feed and command palette search (E19, E21) ---- */

  if (method === 'GET' && path === '/v1/activity') {
    const workspaceId = url.searchParams.get('workspaceId') ?? undefined
    const contractId = url.searchParams.get('contractId') ?? undefined
    send(response, 200, buildActivity({
      ...(workspaceId ? { workspaceId } : {}),
      ...(contractId ? { contractId } : {}),
      limit: Math.min(Number(url.searchParams.get('limit') ?? 50), 200),
      entries: registry.list(),
      dispositions: evolution.disposition.all(),
      assuranceRuns: (await Promise.all(registry.list().map((entry) => assuranceStore.list(entry.contractId, tenantId)))).flat(),
      evalRuns: evolution.evalRun.list(),
      driftEvents: evolution.drift.all(),
      reviews: (await Promise.all(registry.list().map((entry) => reviewStore.list(entry.contractId, tenantId)))).flat(),
      emergencyAuthorizations: evolution.emergency.list(),
      negativeDecisions: evolution.negativeDecision.list(),
      viewer: { principalId, roles: evolution.principal.get(principalId)?.roles ?? [] },
    }))
    return true
  }

  if (method === 'GET' && path === '/v1/search') {
    const workspaceId = url.searchParams.get('workspaceId') ?? undefined
    send(response, 200, search({
      query: url.searchParams.get('q') ?? '',
      ...(workspaceId ? { workspaceId } : {}),
      workspaces: registry.listWorkspaces(),
      entries: registry.list(),
      dispositions: evolution.disposition.all(),
      evalRuns: evolution.evalRun.list(),
      caseSets: evolution.caseSet.all().map((caseSet) => summarize(caseSet)),
      reviews: (await Promise.all(registry.list().map((entry) => reviewStore.list(entry.contractId, tenantId)))).flat(),
      driftEvents: evolution.drift.all(),
      principals: evolution.principal.all(workspaceId),
    }))
    return true
  }

  return false
}

function optional<K extends string>(key: K, url: URL): Partial<Record<K, string>> {
  const value = url.searchParams.get(key)
  return value ? { [key]: value } as Record<K, string> : {}
}

function workspaceIdFor(entry: ContractRegistryEntry): string {
  return entry.draft.ontologyRef?.workspaceId ?? `workspace-${entry.draft.domain}`
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
async function resolveAttestationSubject(context: EvolutionContext, subjectKind: string, subjectId: string): Promise<unknown> {
  const { registry, evolution, assuranceStore, reviewStore, executionStore } = context
  const tenantId = context.identity?.tenantId
  if (subjectKind === 'DISPOSITION') return evolution.disposition.get(subjectId)
  if (subjectKind === 'EVAL_RUN') return evolution.evalRun.get(subjectId)
  if (subjectKind === 'EMERGENCY_AUTHORIZATION') return evolution.emergency.get(subjectId)
  if (subjectKind === 'ASSURANCE_RUN') return assuranceStore.get(subjectId, tenantId)
  if (subjectKind === 'EXECUTION') {
    const receipts = (await Promise.all(registry.list().map((entry) => executionStore.list(entry.contractId, tenantId)))).flat()
    return receipts.find((receipt) => receipt.id === subjectId)
  }
  if (subjectKind === 'REVIEW_DECISION') {
    const reviews = (await Promise.all(registry.list().map((entry) => reviewStore.list(entry.contractId, tenantId)))).flat()
    return reviews.find((review) => review.decision?.id === subjectId)?.decision
  }
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
async function recordDisposition(evolution: EvolutionStores, registry: ContractRegistry, { result, contract, question, mode, purposeId, principalId, latencyMs, clarificationId }: RecordDispositionInput): Promise<CompileResponse> {
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
    principalChain: evolution.principal.chainFor(principalId),
    compilation,
    evidenceRefs: plan?.evidenceRefs ?? [],
    latencyMs,
    createdAt: now.toISOString(),
    provenance: 'RE_EXECUTED',
  })
  const attestation = await evolution.attestation.mint({ subjectKind: 'DISPOSITION', subjectId: record.id, predicateType: predicateForSubject.DISPOSITION, subject: record, signerId: principalId, signerRoleAtSigning: evolution.principal.get(principalId)?.roles[0] ?? 'BEARER_TOKEN_IDENTITY' })
  const stored = await evolution.disposition.append({ ...record, attestationIds: [attestation.id] })
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

async function prepareCompile(result: CompileResponse, contract: ContextContract, principal: RequestIdentity, runtimeApprovalStore: RuntimeApprovalStore): Promise<CompileResponse> {
  if (result.decision === 'APPROVAL_REQUIRED' && result.pendingPlan) {
    const operation = contract.operations.find((candidate) => candidate.id === result.pendingPlan?.operation)
    const policy = operation ? contract.policies.find((candidate) => candidate.riskTier === operation.riskTier) : undefined
    if (!operation || !policy) {
      const { pendingPlan: _pendingPlan, ...withoutPendingPlan } = result
      return withoutPendingPlan
    }
    const approval = await runtimeApprovalStore.create({
      ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
      contractId: contract.id,
      contractVersion: contract.version,
      contractDigest: contract.digest,
      operationId: operation.id,
      policyId: policy.id,
      riskTier: operation.riskTier,
      requestedBy: principal.principalId,
      pendingPlan: result.pendingPlan,
    })
    return { ...result, approval }
  }
  return finalize(result, contract.id, principal)
}

function rememberClarification(
  result: CompileResponse,
  principal: RequestIdentity,
  request: CompileRequest,
  intentResolution: IntentResolution,
  selectedOperationId?: string,
): void {
  if (!result.clarification) return
  const subject = subjectOf(principal)
  if (result.clarification.kind === 'OPERATION') {
    clarifications.set(result.clarification.id, subject, {
      kind: 'OPERATION',
      request,
      candidateOperationIds: result.clarification.candidates.map((candidate) => candidate.operationId),
      intentResolution,
    })
    return
  }
  const operationId = selectedOperationId ?? intentResolution.candidates[0]?.operationId
  if (!operationId) return
  clarifications.set(result.clarification.id, subject, {
    kind: 'ENTITY',
    request,
    typeId: result.clarification.entityTypeId,
    operationId,
    intentResolution,
  })
}

async function finalize(result: CompileResponse, contractId: string, principal: RequestIdentity): Promise<CompileResponse> {
  if (!result.plan) return result
  const signed = await signAndStore(result.plan, contractId, principal)
  return { ...result, plan: signed }
}

async function signAndStore(plan: UnsignedExecutionPlan, contractId: string, principal: RequestIdentity): Promise<SignedExecutionPlan> {
  const signed = await signPlan(plan)
  plans.set(signed.planId, subjectOf(principal), { plan: signed, contractId }, planRetentionUntil(signed))
  return signed
}

function planRetentionUntil(plan: SignedExecutionPlan): number {
  return new Date(plan.expiresAt).getTime() + expiredPlanGraceMs
}

function subjectOf(identity: RequestIdentity): Subject {
  return { principalId: identity.principalId, ...(identity.tenantId ? { tenantId: identity.tenantId } : {}) }
}

async function signPlan(plan: UnsignedExecutionPlan): Promise<SignedExecutionPlan> {
  const signature = await planSigner.sign(Buffer.from(JSON.stringify(plan)))
  return { ...plan, keyId: planSigner.activeKeyId, signatureAlgorithm: planSigner.algorithm, signature }
}

function verifyPlan(plan: SignedExecutionPlan): boolean {
  const { keyId, signatureAlgorithm: _algorithm, signature, ...unsigned } = plan
  return planSigner.verify(Buffer.from(JSON.stringify(unsigned)), signature, keyId)
}

async function authenticate(request: IncomingMessage): Promise<RequestIdentity | undefined> {
  const cached = requestIdentityCache.get(request)
  if (cached) return cached
  const resolution = resolveRequestIdentity(request)
  requestIdentityCache.set(request, resolution)
  return resolution
}

function requiredTenantId(identity: RequestIdentity): string {
  if (!identity.tenantId) throw new Error('SUPABASE_REGISTRY_TENANT_REQUIRED')
  return identity.tenantId
}

async function resolveRequestIdentity(request: IncomingMessage): Promise<RequestIdentity | undefined> {
  const identity = await authenticator.authenticate(request.headers.authorization)
  if (!identity) return undefined
  const organizationHeader = request.headers['x-lattice-organization']
  const requestedOrganizationId = Array.isArray(organizationHeader) ? undefined : organizationHeader?.trim()
  if (!tenantMembershipResolver) {
    if (requestedOrganizationId && identity.tenantId && requestedOrganizationId !== identity.tenantId) return undefined
    return identity
  }
  if (!requestedOrganizationId) return undefined
  try {
    const role = await tenantMembershipResolver.resolve(request.headers.authorization, requestedOrganizationId, identity.principalId)
    return role ? applyTenantMembership(identity, requestedOrganizationId, role) : undefined
  } catch {
    return undefined
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

/**
 * Echoes back the caller's own origin when it is allowed, rather than a single fixed value.
 * A browser only accepts the response when the header matches the requesting origin exactly, so
 * with several allowed origins the header has to depend on who is asking. Unrecognized origins
 * get the first allowed one, which is the same rejection they would get from a fixed header.
 */
function setCors(request: IncomingMessage, response: ServerResponse): void {
  const requestOrigin = request.headers.origin
  const allowedOrigin = requestOrigin && allowedStudioOrigins.includes(requestOrigin) ? requestOrigin : allowedStudioOrigins[0]
  if (allowedOrigin) response.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  // Caches keyed only on the URL would otherwise hand one origin's response to another.
  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Lattice-Organization')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body, null, 2))
}
