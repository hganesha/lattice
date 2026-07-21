export type EvidenceStatus =
  | 'DECLARED'
  | 'DIRECTLY_EVIDENCED'
  | 'PATTERN_SUPPORTED'
  | 'TEMPLATE_DERIVED'
  | 'CONFLICTING'
  | 'UNVERIFIED'

export type EvidenceStrength = 'EXACT' | 'STRONG' | 'MODERATE' | 'WEAK' | 'INSUFFICIENT'

export type ApprovalStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'APPROVED_WITH_EXCEPTION'
  | 'REJECTED'
  | 'DEPRECATED'
  | 'SUPERSEDED'

export type ReleaseStatus = 'UNPUBLISHED' | 'CANDIDATE' | 'PUBLISHED' | 'SUSPENDED' | 'RETIRED'
export type ImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type FreshnessStatus = 'CURRENT' | 'AGING' | 'STALE' | 'INVALID'
export type RiskTier = 'INFORMATIONAL' | 'ANALYTICAL' | 'PLANNING_DECISION' | 'OPERATIONAL_ACTION'

export type RuntimeDecision =
  | 'RESOLVED'
  | 'CLARIFICATION_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'STALE_CONTEXT'
  | 'DENIED'
  | 'UNSUPPORTED'
  | 'DEGRADED'

export interface VersionPin {
  contract: string
  semantic: string
  policy: string
  bindings: string
  api: string
}

export interface CompetencyQuestion {
  id: string
  question: string
  expectedAnswerShape: string
  impact: ImpactLevel
  owner: string
  testIds: string[]
  operationId: string
}

export interface PropertyDefinition {
  id: string
  name: string
  dataType: 'string' | 'integer' | 'decimal' | 'boolean' | 'date' | 'datetime' | 'enum'
  description: string
  required?: boolean
  identifier?: boolean
  allowedValues?: string[]
  unit?: string
}

export interface EntityTypeDefinition {
  id: string
  label: string
  description: string
  group: string
  icon: string
  properties: PropertyDefinition[]
  evidenceStatus: EvidenceStatus
  approvalStatus: ApprovalStatus
  impact: ImpactLevel
}

export interface EntityRecord {
  id: string
  typeId: string
  label: string
  aliases: string[]
  properties: Record<string, string | number | boolean | null>
  evidenceRefs: string[]
  evidenceStrength: EvidenceStrength
  validFrom: string
  validUntil?: string
}

export interface RelationshipTypeDefinition {
  id: string
  label: string
  sourceTypeId: string
  targetTypeId: string
  cardinality: 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'MANY_TO_MANY'
  description: string
  impact: ImpactLevel
}

export interface RelationshipAssertion {
  id: string
  typeId: string
  sourceEntityId: string
  targetEntityId: string
  assertionClass: 'ASSERTED' | 'DERIVED' | 'INFERRED' | 'OVERRIDDEN'
  evidenceRefs: string[]
  approvalStatus: ApprovalStatus
  validFrom: string
  validUntil?: string
}

export interface MetricDefinition {
  id: string
  label: string
  definition: string
  formula: string
  grain: string[]
  dimensions: string[]
  version: string
  owner: string
  approvalStatus: ApprovalStatus
}

export interface EvidenceRecord {
  id: string
  type: 'DATA_BINDING' | 'DOCUMENT' | 'EXPERT_DECISION' | 'TEMPLATE' | 'OBSERVATION'
  title: string
  source: string
  locator: string
  checksum: string
  observedAt: string
  validFrom: string
  validUntil?: string
  status: EvidenceStatus
}

export type ConnectorProvider = 'OPENAPI' | 'DATABRICKS' | 'MICROSOFT_FABRIC' | 'SNOWFLAKE' | 'BIGQUERY' | 'POSTGRESQL' | 'KAFKA' | 'OBJECT_STORAGE'
export type ConnectorTransport = 'HTTPS' | 'TDS' | 'POSTGRES_WIRE' | 'KAFKA' | 'OBJECT_STORAGE'
export type ConnectorAdapterType = 'OPENAPI' | 'DATABASE' | 'FILE' | 'EVENT_STREAM'

export interface ConnectorResource {
  workspace?: string
  warehouse?: string
  catalog?: string
  database?: string
  schema?: string
  object?: string
  project?: string
  topic?: string
  container?: string
}

export interface BindingConnectorConfig {
  provider: ConnectorProvider
  transport: ConnectorTransport
  credentialRef: string
  resource: ConnectorResource
  queryTemplate?: string
  parameterStyle?: 'NAMED' | 'POSITIONAL' | 'NONE'
  readOnly: boolean
}

export interface ConnectorTemplate {
  id: ConnectorProvider
  label: string
  category: 'API' | 'LAKEHOUSE' | 'WAREHOUSE' | 'DATABASE' | 'STREAM' | 'OBJECT_STORE'
  adapterType: ConnectorAdapterType
  transport: ConnectorTransport
  description: string
  endpointPlaceholder: string
  credentialRefPlaceholder: string
  permissionPlaceholder: string
  operationVerb: 'GET' | 'QUERY' | 'SUBSCRIBE' | 'READ'
  resourceFields: Array<keyof ConnectorResource>
  parameterStyle: 'NAMED' | 'POSITIONAL' | 'NONE'
  docsUrl: string
}

export interface SourceBinding {
  id: string
  /** Ownership boundary for the binding definition. Legacy bindings default to CONTRACT. */
  scope?: 'ONTOLOGY' | 'CONTRACT'
  /** Ontology that owns this binding when scope is ONTOLOGY. */
  ontologyId?: string
  sourceSystem: string
  operationId: string
  environment: string
  freshnessMinutes: number
  requiredPermissions: string[]
  expectedResultSchema: string
  version: string
  approvalStatus: ApprovalStatus
  adapterType?: ConnectorAdapterType
  connector?: BindingConnectorConfig
  endpoint?: string
  method?: string
  sourceChecksum?: string
  mappings?: BindingFieldMapping[]
  healthStatus?: 'NOT_TESTED' | 'VALID' | 'WARNING' | 'INVALID'
  executionMode?: 'SIMULATED' | 'HTTP' | 'CONNECTOR'
  samplePayload?: Record<string, unknown>
}

export interface ConnectorValidationRequest {
  binding: SourceBinding
}

export interface ConnectorValidationResult {
  provider: ConnectorProvider
  status: 'READY' | 'CONFIGURED' | 'INVALID'
  driver: 'BUILT_IN_HTTP' | 'EXTERNAL_GATEWAY' | 'NOT_AVAILABLE'
  credentialState: 'AVAILABLE' | 'EXTERNAL' | 'MISSING'
  checks: Array<{ id: string; status: 'PASS' | 'FAIL' | 'INFO'; message: string }>
}

export interface BindingFieldMapping {
  sourcePath: string
  targetTypeId: string
  targetPropertyId: string
  sourceDataType: string
  confidence: 'EXACT' | 'SUGGESTED' | 'MANUAL'
}

export interface BindingSourceField {
  path: string
  label: string
  dataType: string
  required: boolean
}

export interface BindingOperationProposal {
  id: string
  operationId: string
  method: string
  path: string
  summary: string
  expectedResultSchema: string
  fields: BindingSourceField[]
}

export interface BindingPreview {
  id: string
  contractId: string
  sourceName: string
  sourceChecksum: string
  createdAt: string
  operations: BindingOperationProposal[]
  warnings: string[]
}

export interface BindingPreviewRequest {
  contractId?: string
  workspaceId?: string
  sourceName: string
  sourceText: string
  format?: 'OPENAPI' | 'TABULAR_SCHEMA'
  operationId?: string
  operationLabel?: string
}

export type AssuranceCheckCategory = 'STRUCTURAL' | 'QUESTION' | 'MAPPING' | 'POLICY' | 'RELEASE'
export type AssuranceCheckStatus = 'PASS' | 'FAIL' | 'WARNING'

export interface AssuranceCheckResult {
  id: string
  category: AssuranceCheckCategory
  label: string
  status: AssuranceCheckStatus
  message: string
  affectedClaimIds: string[]
}

export interface AssuranceRun {
  id: string
  contractId: string
  contractVersion: string
  contractDigest: string
  startedAt: string
  completedAt: string
  status: AssuranceCheckStatus
  score: number
  artifactDigest: string
  checks: AssuranceCheckResult[]
  summary: {
    passed: number
    failed: number
    warnings: number
  }
}

export interface AssuranceRunRequest {
  contractId: string
  contract: ContextContract
}

export type ReviewTargetKind = 'ENTITY_TYPE' | 'SOURCE_BINDING' | 'POLICY'
export type ReviewDecisionValue = 'APPROVED' | 'APPROVED_WITH_EXCEPTION' | 'REJECTED'

export interface ReviewDecisionArtifact {
  id: string
  reviewId: string
  decision: ReviewDecisionValue
  rationale: string
  decidedAt: string
  decidedBy: string
  artifactDigest: string
}

export interface ReviewRequestArtifact {
  id: string
  contractId: string
  contractVersion: string
  targetKind: ReviewTargetKind
  targetId: string
  targetLabel: string
  impact: ImpactLevel
  submittedAt: string
  submittedBy: string
  status: 'OPEN' | 'DECIDED'
  evidenceRefs: string[]
  artifactDigest: string
  decision?: ReviewDecisionArtifact
}

export interface CreateReviewRequest {
  contractId: string
  contractVersion: string
  targetKind: ReviewTargetKind
  targetId: string
  targetLabel: string
  impact: ImpactLevel
  evidenceRefs: string[]
}

export interface CreateReviewDecisionRequest {
  decision: ReviewDecisionValue
  rationale: string
}

export interface OperationDefinition {
  id: string
  label: string
  description: string
  keywords: string[]
  requiredEntityTypes: string[]
  metricIds: string[]
  relationshipPath: string[]
  sourceBindingIds: string[]
  riskTier: RiskTier
  requiredPermissions: string[]
  expectedResultSchema: string
}

export interface GuardrailPolicy {
  id: string
  label: string
  description: string
  riskTier: RiskTier
  minimumEvidenceStrength: EvidenceStrength
  maximumEvidenceAgeMinutes: number
  approvalRequired: boolean
  version: string
  owner: string
  approvalStatus: ApprovalStatus
}

export interface ContextTest {
  id: string
  type: 'STRUCTURAL' | 'MAPPING' | 'DATA' | 'QUESTION' | 'AGENT' | 'CHANGE' | 'ABSTENTION'
  label: string
  status: 'PASS' | 'FAIL' | 'NOT_RUN'
  lastRun?: string
  affectedClaimIds: string[]
}

export interface OntologyReference {
  workspaceId: string
  ontologyId: string
  version: string
  digest: string
}

export interface IndustryOntology {
  id: string
  workspaceId: string
  name: string
  description: string
  domain: string
  version: string
  digest: string
  releaseStatus: ReleaseStatus
  composedFrom?: OntologyPackReference[]
  entityTypes: EntityTypeDefinition[]
  relationshipTypes: RelationshipTypeDefinition[]
  /** Shared master/reference-data bindings inherited by scoped contracts. */
  bindings?: SourceBinding[]
  schemaLayout: Record<string, { x: number; y: number }>
}

export interface OntologyPackReference {
  id: string
  version: string
  digest: string
  role: 'FOUNDATION' | 'INDUSTRY'
}

export interface IndustryWorkspace {
  id: string
  name: string
  description: string
  domain: string
  ontology: IndustryOntology
  contractIds: string[]
  updatedAt: string
  ontologyGeneration?: {
    generatorVersion: string
    sourceSchemaCatalogVersion: string
    sourceFormCount: number
    mappedPercent: number
    ontologyDigest: string
  }
  contractScopeModelVersion?: '1.0'
  ontologyCompositionVersion?: '1.0' | '1.1'
}

export interface WorkspaceSummary {
  id: string
  name: string
  domain: string
  description: string
  ontologyVersion: string
  entityTypeCount: number
  relationshipTypeCount: number
  bindingCount?: number
  contractCount: number
  updatedAt: string
  generatedFrom?: {
    sourceFormCount: number
    mappedPercent: number
  }
}

export interface GeneratedOntologyProvenance {
  generatorVersion: string
  sourceSchemaCatalogVersion: string
  sourceForms: Array<{ documentType: string; family: string; schemaVersion: string; fieldCount: number }>
  entitySources: Record<string, string[]>
  propertySources: Record<string, string[]>
  unmappedFields: string[]
  coverage: {
    formCount: number
    sourceFieldCount: number
    mappedFieldCount: number
    unmappedFieldCount: number
    mappedPercent: number
  }
}

export interface GeneratedIndustryOntology {
  ontology: IndustryOntology
  provenance: GeneratedOntologyProvenance
}

export interface ContextContract {
  id: string
  name: string
  description: string
  domain: string
  workflow: string
  version: string
  releaseStatus: ReleaseStatus
  digest: string
  versions: VersionPin
  competencyQuestions: CompetencyQuestion[]
  /** Reference to the workspace ontology. Embedded schema fields remain a runtime snapshot during migration. */
  ontologyRef?: OntologyReference
  /** Entity type identifiers from the shared ontology used by this decision contract. */
  conceptScope?: string[]
  entityTypes: EntityTypeDefinition[]
  entities: EntityRecord[]
  relationshipTypes: RelationshipTypeDefinition[]
  relationships: RelationshipAssertion[]
  metrics: MetricDefinition[]
  evidence: EvidenceRecord[]
  bindings: SourceBinding[]
  /** Version pins for ontology-owned binding snapshots embedded in bindings. */
  ontologyBindingRefs?: Array<{ id: string; version: string }>
  operations: OperationDefinition[]
  policies: GuardrailPolicy[]
  tests: ContextTest[]
  schemaLayout?: Record<string, { x: number; y: number }>
}

export interface ContractRelease {
  version: string
  digest: string
  publishedAt: string
  notes: string
  contract: ContextContract
}

export type ReleaseChangeKind =
  | 'CONTRACT_METADATA'
  | 'ENTITY_TYPE'
  | 'RELATIONSHIP_TYPE'
  | 'COMPETENCY_QUESTION'
  | 'OPERATION'
  | 'SOURCE_BINDING'
  | 'POLICY'
  | 'METRIC'
  | 'CONTEXT_OBJECT'
  | 'RELATIONSHIP_ASSERTION'
  | 'EVIDENCE'
  | 'TEST'

export interface ReleaseChange {
  id: string
  kind: ReleaseChangeKind
  label: string
  change: 'ADDED' | 'REMOVED' | 'CHANGED'
  impact: 'PATCH' | 'MINOR' | 'MAJOR'
}

export interface ReleaseDiffArtifact {
  id: string
  contractId: string
  fromRelease: { version: string; digest: string }
  toRelease: { version: string; digest: string }
  changes: ReleaseChange[]
  suggestedBump: 'NONE' | 'PATCH' | 'MINOR' | 'MAJOR'
  generatedAt: string
  artifactDigest: string
}

export interface ReleaseControlEvent {
  id: string
  contractId: string
  action: 'ACTIVE_RELEASE_ROLLED_BACK'
  fromRelease: { version: string; digest: string }
  toRelease: { version: string; digest: string }
  rationale: string
  actorId: string
  occurredAt: string
  artifactDigest: string
}

export interface ContractRegistryEntry {
  contractId: string
  draft: ContextContract
  updatedAt: string
  releases: ContractRelease[]
  runtimeStatus: ReleaseRuntimeStatus
  activeReleaseDigest?: string
  releaseEvents?: ReleaseControlEvent[]
}

export type ReleaseRuntimeStatus = 'NO_RELEASE' | 'ACTIVE' | 'SUSPENDED'

export type ContractStarter =
  | 'blank'
  | 'financial-services'
  | 'energy'
  | 'healthcare'
  | 'manufacturing'
  | 'legal'
  | 'insurance'
  | 'real-estate'

export interface CreateContractRequest {
  name: string
  description: string
  domain: string
  workflow: string
  owner: string
  starter: ContractStarter
  conceptScope?: string[]
  competencyQuestions: Array<{
    question: string
    expectedAnswerShape: string
    impact: ImpactLevel
  }>
}

export interface ContractSummary {
  contractId: string
  workspaceId: string
  ontologyVersion: string
  conceptScopeCount: number
  name: string
  domain: string
  workflow: string
  draftVersion: string
  releaseStatus: ReleaseStatus
  updatedAt: string
  entityTypeCount: number
  relationshipTypeCount: number
  releaseCount: number
  runtimeStatus: ReleaseRuntimeStatus
  latestRelease?: {
    version: string
    digest: string
    publishedAt: string
    notes: string
  }
}

export type ImportFormat = 'AUTO' | 'JSON_SCHEMA' | 'OPENAPI' | 'RDF_XML' | 'TURTLE' | 'CSV'

export interface ImportCollision {
  existingTypeId: string
  existingLabel: string
  match: 'EXACT_ID' | 'LABEL'
}

export interface ProposedEntityType {
  sourceId: string
  type: EntityTypeDefinition
  collision?: ImportCollision
  warnings: string[]
}

export interface ProposedRelationshipType {
  sourceId: string
  type: RelationshipTypeDefinition
  warnings: string[]
}

export interface ImportProposal {
  id: string
  contractId: string
  sourceName: string
  format: Exclude<ImportFormat, 'AUTO'>
  checksum: string
  createdAt: string
  entityTypes: ProposedEntityType[]
  relationshipTypes: ProposedRelationshipType[]
  warnings: string[]
}

export interface ImportPreviewRequest {
  contractId: string
  sourceName: string
  sourceText: string
  format: ImportFormat
}

export interface CompileRequest {
  question: string
  contractId?: string
  contractVersion?: string
  purpose?: string
  asOf?: string
  selections?: Record<string, string>
}

export interface ClarificationCandidate {
  entityId: string
  label: string
  typeId: string
  evidenceStrength: EvidenceStrength
  rationale: string
}

export interface ClarificationContract {
  id: string
  prompt: string
  entityTypeId: string
  candidates: ClarificationCandidate[]
}

export interface UnsignedExecutionPlan {
  schemaVersion: '1.0'
  planId: string
  resolutionId: string
  decision: 'RESOLVED'
  riskTier: RiskTier
  operation: string
  arguments: Record<string, { entityId: string } | string | number | boolean>
  metrics: Array<{ id: string; version: string }>
  sourceBindings: string[]
  requiredPermissions: string[]
  expectedResultSchema: string
  evidenceRefs: string[]
  versions: VersionPin
  contractDigest: string
  expiresAt: string
  nonce: string
}

export interface SignedExecutionPlan extends UnsignedExecutionPlan {
  keyId: string
  signatureAlgorithm: 'Ed25519'
  signature: string
}

export interface CompileResponse {
  resolutionId: string
  decision: RuntimeDecision
  reasonCodes: string[]
  explanation: string[]
  versions: VersionPin
  clarification?: ClarificationContract
  plan?: SignedExecutionPlan | UnsignedExecutionPlan
  pendingPlan?: UnsignedExecutionPlan
  approval?: RuntimeApprovalArtifact
}

export type RuntimeApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESUMED' | 'EXPIRED'

export interface RuntimeApprovalDecisionArtifact {
  id: string
  approvalId: string
  decision: 'APPROVED' | 'REJECTED'
  rationale: string
  decidedAt: string
  decidedBy: string
  artifactDigest: string
}

export interface RuntimeApprovalArtifact {
  id: string
  contractId: string
  contractVersion: string
  contractDigest: string
  operationId: string
  policyId: string
  riskTier: RiskTier
  requestedAt: string
  requestedBy: string
  expiresAt: string
  status: RuntimeApprovalStatus
  pendingPlan: UnsignedExecutionPlan
  artifactDigest: string
  decision?: RuntimeApprovalDecisionArtifact
  resumedAt?: string
  signedPlanId?: string
}

export interface CreateRuntimeApprovalDecisionRequest {
  decision: 'APPROVED' | 'REJECTED'
  rationale: string
}

export interface BindingExecutionResult {
  bindingId: string
  sourceSystem: string
  mode: 'SIMULATED' | 'HTTP' | 'CONNECTOR'
  status: 'SUCCESS' | 'FAILED'
  durationMs: number
  responseDigest?: string
  mappedValues: Array<{
    sourcePath: string
    targetTypeId: string
    targetPropertyId: string
    value: unknown
  }>
  error?: string
}

export interface ExecutionReceipt {
  id: string
  contractId: string
  contractVersion: string
  contractDigest: string
  planId: string
  operationId: string
  principalId: string
  status: 'SUCCESS' | 'FAILED' | 'DENIED'
  startedAt: string
  completedAt: string
  requiredPermissions: string[]
  grantedPermissions: string[]
  evidenceRefs: string[]
  bindingResults: BindingExecutionResult[]
  artifactDigest: string
}

export interface ExecutePlanRequest {
  grantedPermissions: string[]
}
