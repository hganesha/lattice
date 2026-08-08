import type {
  ArtifactChainLink,
  EvidenceStrength,
  ImpactLevel,
  RiskTier,
  RuntimeDecision,
} from './types.js'

/* ------------------------------------------------------------------ *
 * Declared purpose (E4) — purpose is declared, never inferred from text.
 * ------------------------------------------------------------------ */

export type PurposeAudience = 'INTERNAL' | 'PARTNER' | 'CUSTOMER' | 'REGULATOR' | 'PUBLIC'
export type Reversibility = 'REVERSIBLE' | 'PARTIALLY_REVERSIBLE' | 'IRREVERSIBLE'

export interface RiskTierDerivation {
  riskTier: RiskTier
  purposeId: string
  purposeTier: RiskTier
  operationTier?: RiskTier
  operationId?: string
  reason: string
  minimumEvidenceStrength: EvidenceStrength
  maximumEvidenceAgeMinutes: number
  approvalRequired: boolean
  policyId?: string
}

/* ------------------------------------------------------------------ *
 * Disposition trail (E5) — every compile persists, dry-run included.
 * ------------------------------------------------------------------ */

export type DispositionMode = 'DRY_RUN' | 'AUTHORIZED'

/** Distinguishes a decision rebuilt from retained inputs from one re-executed against current data (§3.2.F). */
export type DispositionProvenance = 'RECONSTRUCTED' | 'RE_EXECUTED'

export interface CompilationRecord {
  contract: { id: string; version: string; digest: string }
  ontology?: { workspaceId: string; ontologyId: string; version: string; digest: string }
  bindings: Array<{ id: string; version: string; sourceSystem: string }>
  policies: Array<{ id: string; version: string; riskTier: RiskTier }>
  metrics: Array<{ id: string; version: string }>
  compilerVersion: string
  evaluatedAt: string
}

export type PrincipalKind = 'HUMAN' | 'AGENT' | 'SERVICE'

export interface PrincipalChainLink {
  principalId: string
  displayName: string
  kind: PrincipalKind
  role: string
  via: 'AUTHENTICATION' | 'DELEGATION' | 'SERVICE_ACCOUNT'
  grantId?: string
  scope?: string[]
  expiresAt?: string
}

export interface DispositionRecord {
  id: string
  /** Tenant that owns this artifact. Reads and writes are scoped to it. */
  tenantId?: string
  /** Position in this ledger's hash chain, assigned by storage on append. */
  chain?: ArtifactChainLink
  contractId: string
  contractVersion: string
  workspaceId?: string
  mode: DispositionMode
  /** False for every dry-run: the disposition explains, it does not authorize. */
  authorizing: boolean
  question: string
  purposeId: string
  purposeLabel: string
  riskTier: RiskTier
  riskDerivation: RiskTierDerivation
  decision: RuntimeDecision
  reasonCodes: string[]
  explanation: string[]
  operationId?: string
  planId?: string
  approvalId?: string
  clarificationId?: string
  principalId: string
  principalChain: PrincipalChainLink[]
  compilation: CompilationRecord
  evidenceRefs: string[]
  attestationIds: string[]
  latencyMs: number
  createdAt: string
  provenance: DispositionProvenance
  evalRunId?: string
  artifactDigest: string
}

export interface DispositionQuery {
  contractId?: string
  workspaceId?: string
  decision?: RuntimeDecision
  purposeId?: string
  riskTier?: RiskTier
  principalId?: string
  mode?: DispositionMode
  from?: string
  to?: string
  cursor?: string
  limit?: number
}

export interface DispositionPage {
  records: DispositionRecord[]
  total: number
  nextCursor?: string
}

/* ------------------------------------------------------------------ *
 * Attestations (E16) — replaces asserted tamper-evidence with the real thing.
 * ------------------------------------------------------------------ */

export type AttestationSubjectKind =
  | 'DISPOSITION'
  | 'EXECUTION'
  | 'ASSURANCE_RUN'
  | 'EVAL_RUN'
  | 'REVIEW_DECISION'
  | 'RELEASE'
  | 'EMERGENCY_AUTHORIZATION'

export type AttestationPredicate =
  | 'lattice.disposition.v1'
  | 'lattice.execution.v1'
  | 'lattice.assurance.v1'
  | 'lattice.evaluation.v1'
  | 'lattice.review.v1'
  | 'lattice.release.v1'
  | 'lattice.emergency.v1'

export interface Attestation {
  id: string
  /** Tenant that owns this artifact. Reads and writes are scoped to it. */
  tenantId?: string
  /** Position in this ledger's hash chain, assigned by storage on append. */
  chain?: ArtifactChainLink
  subjectKind: AttestationSubjectKind
  subjectId: string
  predicateType: AttestationPredicate
  /** Named serialization so a verifier can reproduce the digest. */
  canonicalization: 'JSON_SORTED_KEYS_SHA256'
  payloadDigest: string
  signerId: string
  /** The role the signer held when signing, not the role they hold now. */
  signerRoleAtSigning: string
  keyId: string
  signatureAlgorithm: 'Ed25519'
  signature: string
  issuedAt: string
  expiresAt?: string
  revocation?: { revokedAt: string; reason: string }
  logIndex: number
  logRoot: string
}

export type AttestationCheckId =
  | 'KEY_KNOWN'
  | 'SIGNATURE'
  | 'PAYLOAD_DIGEST'
  | 'FRESHNESS'
  | 'REVOCATION'
  | 'LOG_INCLUSION'

export interface AttestationVerification {
  attestationId: string
  verified: boolean
  verifiedAt: string
  keyId: string
  checks: Array<{ id: AttestationCheckId; status: 'PASS' | 'FAIL' | 'UNAVAILABLE'; message: string }>
}

/* ------------------------------------------------------------------ *
 * Case sets and evaluation (E6–E10).
 * ------------------------------------------------------------------ */

export type EvalExpectedOutcome = 'PLAN' | 'CLARIFICATION' | 'APPROVAL' | 'ABSTENTION'

export type EvalCaseType =
  | 'HAPPY_PATH'
  | 'REGRESSION'
  | 'AMBIGUITY'
  | 'APPROVAL'
  | 'ABSTENTION'
  | 'ADVERSARIAL'
  | 'CROSS_DOMAIN'

export interface EvalCaseExpectation {
  outcome: EvalExpectedOutcome
  /** Runtime decisions accepted as correct for this case. */
  decisions: RuntimeDecision[]
  reasonCodes?: string[]
  operationId?: string
  forbiddenOperationIds?: string[]
  requiredEvidenceRefs?: string[]
  requiredPolicyIds?: string[]
  clarificationEntityTypeId?: string
  clarificationCandidateIds?: string[]
  maximumRiskTier?: RiskTier
}

export interface EvalCase {
  id: string
  caseType: EvalCaseType
  question: string
  purposeId: string
  contractId: string
  workspaceId?: string
  selections?: Record<string, string>
  asOf?: string
  expected: EvalCaseExpectation
  tags: string[]
  riskTier: RiskTier
  /** Failure mode this case is designed to catch. */
  failureMode?: EvalFailureCategory
  goldRationale: string
  reviewedBy: string
  reviewedAt: string
}

export interface CaseSet {
  id: string
  /** Tenant that owns this artifact. Reads and writes are scoped to it. */
  tenantId?: string
  /** Position in this ledger's hash chain, assigned by storage on append. */
  chain?: ArtifactChainLink
  /** Digest of the artifact as stored. `digest` covers the cases; this covers the whole record. */
  artifactDigest?: string
  name: string
  description: string
  version: string
  scope: 'CONTRACT' | 'WORKSPACE' | 'GLOBAL'
  contractId?: string
  workspaceId?: string
  owner: string
  createdAt: string
  updatedAt: string
  digest: string
  cases: EvalCase[]
}

export interface CaseSetSummary {
  id: string
  name: string
  description: string
  version: string
  scope: CaseSet['scope']
  contractId?: string
  workspaceId?: string
  owner: string
  updatedAt: string
  digest: string
  caseCount: number
  caseTypeCounts: Partial<Record<EvalCaseType, number>>
}

export interface CreateCaseSetRequest {
  name: string
  description: string
  scope: CaseSet['scope']
  contractId?: string
  workspaceId?: string
  owner: string
  cases?: EvalCase[]
}

export interface UpsertCaseRequest {
  case: EvalCase
}

/** Hard gates are pass/fail and are never folded into the weighted score. */
export type EvalGateId =
  | 'WRONG_OUTCOME'
  | 'UNSAFE_PLAN_EMITTED'
  | 'REQUIRED_EVIDENCE_MISSING'
  | 'POLICY_OR_APPROVAL_VIOLATED'
  | 'UNSUPPORTED_ACTION_UNDER_WEAK_EVIDENCE'

export interface EvalGateResult {
  id: EvalGateId
  label: string
  status: 'PASS' | 'FAIL'
  message: string
}

export type EvalDimension = 'OUTCOME' | 'GOVERNANCE' | 'EVIDENCE' | 'CLARIFICATION' | 'RUNTIME'

export interface EvalDimensionScore {
  dimension: EvalDimension
  /** Percentage weight from lattice-eval.md §3. */
  weight: number
  /** 0–1. */
  score: number
  rationale: string
}

export type EvalFailureCategory = 'CONTRACT' | 'BINDING' | 'PROMPT_RESOLVER' | 'POLICY' | 'EVIDENCE' | 'RUNTIME'

export type EvalFailureActionKind =
  | 'OPEN_BINDING'
  | 'OPEN_POLICY'
  | 'OPEN_CONTRACT'
  | 'OPEN_DISPOSITION'
  | 'CREATE_REVIEW'
  | 'PROMOTE_CASE'

export interface EvalFailureAction {
  kind: EvalFailureActionKind
  label: string
  targetId: string
  /** Concrete studio route; suggestions must never dead-end (§4.2). */
  route: string
}

export interface EvalFailure {
  category: EvalFailureCategory
  severity: ImpactLevel
  summary: string
  remediation: string
  actions: EvalFailureAction[]
}

export interface EvalCaseResult {
  caseId: string
  caseType: EvalCaseType
  question: string
  purposeId: string
  riskTier: RiskTier
  /** GATE_FAIL suppresses the weighted score entirely. */
  status: 'PASS' | 'FAIL' | 'GATE_FAIL'
  gatesPassed: boolean
  gates: EvalGateResult[]
  dimensions: EvalDimensionScore[]
  /** 0–100. Undefined whenever a hard gate failed — a gated case has no score. */
  weightedScore?: number
  expectedOutcome: EvalExpectedOutcome
  actualDecision: RuntimeDecision
  reasonCodes: string[]
  explanation: string[]
  dispositionId?: string
  latencyMs: number
  failure?: EvalFailure
}

export type EvalRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED'

export interface EvalRunSummaryStats {
  total: number
  passed: number
  failed: number
  gateFailures: number
  /** Mean weighted score across ungated cases only; undefined when every case gated. */
  weightedScore?: number
  medianLatencyMs: number
  p95LatencyMs: number
}

export interface EvalRun {
  id: string
  /** Tenant that owns this artifact. Reads and writes are scoped to it. */
  tenantId?: string
  /** Position in this ledger's hash chain, assigned by storage on append. */
  chain?: ArtifactChainLink
  name: string
  caseSetId: string
  caseSetVersion: string
  caseSetDigest: string
  contractId: string
  contractVersion: string
  contractDigest: string
  workspaceId?: string
  mode: DispositionMode
  environment: string
  status: EvalRunStatus
  triggeredBy: string
  startedAt: string
  completedAt?: string
  summary: EvalRunSummaryStats
  gateSummary: Partial<Record<EvalGateId, number>>
  failureSummary: Partial<Record<EvalFailureCategory, number>>
  results: EvalCaseResult[]
  baselineRunId?: string
  evidenceRecordId?: string
  artifactDigest: string
}

export type EvalRunSummary = Omit<EvalRun, 'results'>

export interface CreateEvalRunRequest {
  caseSetId: string
  contractId: string
  name?: string
  mode?: DispositionMode
  environment?: string
  caseIds?: string[]
  baselineRunId?: string
}

export type EvalDiffStatus = 'FIXED' | 'REGRESSED' | 'UNCHANGED_PASS' | 'UNCHANGED_FAIL' | 'NEW' | 'REMOVED'

export interface EvalDiffEntry {
  caseId: string
  question: string
  caseType: EvalCaseType
  status: EvalDiffStatus
  baseline?: { status: EvalCaseResult['status']; gatesPassed: boolean; weightedScore?: number; decision: RuntimeDecision }
  candidate?: { status: EvalCaseResult['status']; gatesPassed: boolean; weightedScore?: number; decision: RuntimeDecision }
}

export interface EvalRunDiff {
  runId: string
  baselineRunId: string
  generatedAt: string
  /** Verdict a PR check can gate on: any regression or new gate failure fails. */
  verdict: 'PASS' | 'FAIL'
  /** Single line a CI comment can quote verbatim. */
  ciSummary: string
  summary: Record<EvalDiffStatus, number>
  gateDelta: Partial<Record<EvalGateId, number>>
  entries: EvalDiffEntry[]
}

/* ------------------------------------------------------------------ *
 * Four-axis state and per-use eligibility (E11).
 * ------------------------------------------------------------------ */

export type EvidenceAssuranceLevel = 'UNVERIFIED' | 'OBSERVED' | 'CORROBORATED' | 'VALIDATED' | 'CERTIFIED'
export type GovernanceStatus = 'UNGOVERNED' | 'PROPOSED' | 'UNDER_REVIEW' | 'APPROVED' | 'REVOKED'
export type DeploymentStatus = 'NONE' | 'SHADOW' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
export type SourceHealth = 'UNKNOWN' | 'HEALTHY' | 'DEGRADED' | 'BROKEN'

export interface FourAxisState {
  evidenceAssurance: EvidenceAssuranceLevel
  governanceStatus: GovernanceStatus
  deploymentStatus: DeploymentStatus
  sourceHealth: SourceHealth
}

export type PermittedUse =
  | 'INFORMATIONAL_READ'
  | 'ANALYTICAL_REPORTING'
  | 'PLANNING_DECISION'
  | 'OPERATIONAL_ACTION'
  | 'AUTONOMOUS_ACTION'

export interface EligibilityCell {
  use: PermittedUse
  riskTier: RiskTier
  permitted: boolean
  requiredEvidenceAssurance: EvidenceAssuranceLevel
  /** Human-readable axis failures; empty when permitted. */
  blockedBy: string[]
}

export interface EligibilityMatrix {
  subjectKind: 'CONTRACT' | 'SOURCE_BINDING' | 'POLICY'
  subjectId: string
  subjectLabel: string
  computedAt: string
  state: FourAxisState
  /** The one answer a steward reads first. The four axes are the explanation, not the headline. */
  primaryAnswer: string
  cells: EligibilityCell[]
}

/* ------------------------------------------------------------------ *
 * Review routing, blast radius, negative decisions (E12, E13, E17).
 * ------------------------------------------------------------------ */

export type ReviewRouting = 'PARALLEL' | 'SEQUENTIAL'

export interface ReviewAssignment {
  role: string
  principalId?: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DELEGATED' | 'SKIPPED'
  /** Order matters only when routing is SEQUENTIAL. */
  order: number
  delegatedToPrincipalId?: string
  delegatedReason?: string
  decidedAt?: string
}

export interface ReviewRoutingPlan {
  routing: ReviewRouting
  quorum: number
  assignments: ReviewAssignment[]
  slaHours: number
  dueAt: string
  escalateToRole?: string
  escalatedAt?: string
}

export interface BlastRadiusDependent {
  kind: 'OPERATION' | 'CONTRACT' | 'METRIC' | 'SOURCE_BINDING' | 'POLICY' | 'COMPETENCY_QUESTION' | 'ENTITY_TYPE'
  id: string
  label: string
  impact: ImpactLevel
  route: string
}

export interface BlastRadius {
  subjectKind: string
  subjectId: string
  computedAt: string
  dependents: BlastRadiusDependent[]
  /** Dispositions in the retention window that touched the subject. */
  affectedDispositions: number
  highRiskAffected: number
  summary: string
}

export interface NegativeDecisionException {
  id: string
  description: string
  approvedBy: string
  approvedAt: string
  expiresAt: string
}

export interface NegativeDecision {
  id: string
  /** Tenant that owns this artifact. Reads and writes are scoped to it. */
  tenantId?: string
  /** Position in this ledger's hash chain, assigned by storage on append. */
  chain?: ArtifactChainLink
  workspaceId: string
  contractId?: string
  prohibited: {
    subject: string
    sourceSystem?: string
    bindingId?: string
    targetTypeId?: string
    targetPropertyId?: string
  }
  applicability: {
    scope: 'CONTRACT' | 'WORKSPACE' | 'GLOBAL'
    contractClasses: string[]
    grain: string[]
  }
  rationale: string
  decidedBy: string
  decidedAt: string
  effectiveFrom: string
  /** Never `expires: never` — a negative decision is revisited, not permanent. */
  reviewBy: string
  exceptions: NegativeDecisionException[]
  reviewId?: string
  supersededById?: string
  status: 'ACTIVE' | 'DUE_FOR_REVIEW' | 'SUPERSEDED' | 'WITHDRAWN'
  artifactDigest: string
}

export interface CreateNegativeDecisionRequest {
  workspaceId: string
  contractId?: string
  prohibited: NegativeDecision['prohibited']
  applicability: NegativeDecision['applicability']
  rationale: string
  effectiveFrom?: string
  reviewBy: string
  /** `approvedBy` is filled from the authenticated principal; a client may not assert it. */
  exceptions?: Array<Omit<NegativeDecisionException, 'id' | 'approvedAt' | 'approvedBy'> & { approvedBy?: string }>
  reviewId?: string
}

/** Structured rejection captured alongside a REJECTED review decision. */
export interface StructuredRejection {
  prohibited: NegativeDecision['prohibited']
  applicability: NegativeDecision['applicability']
  reviewBy: string
  exceptions?: Array<Omit<NegativeDecisionException, 'id' | 'approvedAt' | 'approvedBy'> & { approvedBy?: string }>
}

/* ------------------------------------------------------------------ *
 * Drift, source health, counterfactual replay (E14).
 * ------------------------------------------------------------------ */

export type DriftKind =
  | 'FIELD_RENAMED'
  | 'FORMULA_CHANGED'
  | 'GRAIN_CHANGED'
  | 'UNIT_CHANGED'
  | 'CERTIFICATION_LOST'
  | 'FRESHNESS_DEGRADED'
  | 'SCHEMA_CHANGED'
  | 'BINDING_REMOVED'
  | 'SEMANTIC_DEFINITION_CHANGED'

export interface CounterfactualChange {
  dispositionId: string
  question: string
  purposeId: string
  riskTier: RiskTier
  before: RuntimeDecision
  after: RuntimeDecision
  reasonCodes: string[]
  createdAt: string
}

export interface CounterfactualResult {
  driftEventId: string
  window: { from: string; to: string }
  evaluated: number
  changed: number
  highRiskChanged: number
  computedAt: string
  /** Reconstructed from retained inputs — never claimed as a re-execution. */
  method: 'RECONSTRUCTED'
  /** The headline sentence: "N of the last M dispositions would have changed, including K high-risk." */
  summary: string
  changes: CounterfactualChange[]
}

export interface DriftEvent {
  id: string
  /** Tenant that owns this artifact. Reads and writes are scoped to it. */
  tenantId?: string
  /** Position in this ledger's hash chain, assigned by storage on append. */
  chain?: ArtifactChainLink
  workspaceId: string
  contractId?: string
  kind: DriftKind
  severity: ImpactLevel
  subject: {
    kind: 'SOURCE_BINDING' | 'METRIC' | 'ENTITY_TYPE' | 'PROPERTY' | 'ONTOLOGY' | 'POLICY'
    id: string
    label: string
  }
  detectedAt: string
  fromVersion: string
  toVersion: string
  before: string
  after: string
  detail: string
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SUPPRESSED'
  counterfactual?: CounterfactualResult
  artifactDigest: string
}

export interface SourceHealthRecord {
  bindingId: string
  sourceSystem: string
  contractId: string
  health: SourceHealth
  freshnessMinutes: number
  lastCheckedAt: string
  openDriftEvents: number
  approvalStatus: string
  detail: string
}

export type DriftAction = 'SUSPEND_HIGH_RISK' | 'ALLOW_READ_ONLY' | 'OPEN_REVIEW' | 'ACKNOWLEDGE' | 'RESOLVE'

export interface DriftActionRequest {
  action: DriftAction
  rationale: string
}

/* ------------------------------------------------------------------ *
 * Identity, delegation, autonomy (E15).
 * ------------------------------------------------------------------ */

export type AutonomyTier = 'A0' | 'A1' | 'A2' | 'A3' | 'A4'

export interface AutonomyTierDefinition {
  tier: AutonomyTier
  label: string
  description: string
  maximumRiskTier: RiskTier
  humanApprovalRequired: boolean
}

export interface Principal {
  id: string
  /** Tenant that owns this artifact. Reads and writes are scoped to it. */
  tenantId?: string
  /** Position in this ledger's hash chain, assigned by storage on append. */
  chain?: ArtifactChainLink
  artifactDigest?: string
  displayName: string
  kind: PrincipalKind
  roles: string[]
  workspaceIds: string[]
  email?: string
  authentication: {
    method: 'OIDC' | 'MTLS' | 'API_TOKEN' | 'DEMO_TOKEN'
    issuer: string
    assuranceLevel: 'AAL1' | 'AAL2' | 'AAL3'
    lastAuthenticatedAt?: string
  }
  workloadIdentity?: { platform: string; identifier: string }
  autonomyTier?: AutonomyTier
  ownerPrincipalId?: string
  status: 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
  createdAt: string
}

export interface DelegationGrant {
  id: string
  /** Tenant that owns this artifact. Reads and writes are scoped to it. */
  tenantId?: string
  /** Position in this ledger's hash chain, assigned by storage on append. */
  chain?: ArtifactChainLink
  fromPrincipalId: string
  toPrincipalId: string
  scope: string[]
  purposeIds: string[]
  audience: PurposeAudience
  issuedAt: string
  expiresAt: string
  maximumActions: number
  consumedActions: number
  riskTierCeiling: RiskTier
  contractIds: string[]
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'EXHAUSTED'
  artifactDigest: string
}

export interface IdentityGraph {
  principals: Principal[]
  grants: DelegationGrant[]
  autonomyTiers: AutonomyTierDefinition[]
}

/* ------------------------------------------------------------------ *
 * Emergency authorization (E18) — grant path and retrospective queue ship together.
 * ------------------------------------------------------------------ */

export interface EmergencyAuthorization {
  id: string
  /** Tenant that owns this artifact. Reads and writes are scoped to it. */
  tenantId?: string
  /** Position in this ledger's hash chain, assigned by storage on append. */
  chain?: ArtifactChainLink
  contractId: string
  workspaceId?: string
  requestedBy: string
  requestedAt: string
  justification: string
  maximumActions: number
  consumedActions: number
  validFrom: string
  validUntil: string
  requiredApproverRoles: string[]
  approvals: Array<{ principalId: string; role: string; approvedAt: string; rationale: string }>
  compensatingControls: string[]
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'DENIED'
  /** Every grant lands here whether or not it was used. */
  retrospective?: {
    reviewedBy: string
    reviewedAt: string
    verdict: 'JUSTIFIED' | 'UNJUSTIFIED' | 'PROCESS_GAP'
    notes: string
  }
  keyId: string
  signature: string
  artifactDigest: string
}

export interface CreateEmergencyAuthorizationRequest {
  contractId: string
  workspaceId?: string
  justification: string
  maximumActions: number
  validMinutes: number
  requiredApproverRoles: string[]
  compensatingControls: string[]
}

export interface EmergencyRetrospectiveRequest {
  verdict: 'JUSTIFIED' | 'UNJUSTIFIED' | 'PROCESS_GAP'
  notes: string
}

/* ------------------------------------------------------------------ *
 * Activity feed (E21).
 * ------------------------------------------------------------------ */

export type ActivityKind =
  | 'DISPOSITION'
  | 'ASSURANCE_RUN'
  | 'EVAL_RUN'
  | 'DRIFT_EVENT'
  | 'REVIEW_OPENED'
  | 'REVIEW_DECIDED'
  | 'RELEASE'
  | 'EMERGENCY_AUTHORIZATION'
  | 'NEGATIVE_DECISION'

export interface ActivityEvent {
  id: string
  kind: ActivityKind
  title: string
  detail: string
  at: string
  route: string
  severity?: ImpactLevel
  actor?: string
  /** True when the event is waiting on the calling principal. */
  awaitingMe?: boolean
}

/* ------------------------------------------------------------------ *
 * Command palette search (E19) — scoped entity search, not a substring filter.
 * ------------------------------------------------------------------ */

export type SearchResultKind =
  | 'SURFACE'
  | 'WORKSPACE'
  | 'CONTRACT'
  | 'DISPOSITION'
  | 'EVAL_RUN'
  | 'CASE_SET'
  | 'REVIEW'
  | 'DRIFT_EVENT'
  | 'PRINCIPAL'
  | 'SOURCE_BINDING'
  | 'POLICY'
  | 'ENTITY_TYPE'

export interface SearchResult {
  id: string
  kind: SearchResultKind
  title: string
  subtitle: string
  route: string
  /** Higher ranks first. Relevance only — never presented as a confidence figure. */
  score: number
}

/* ------------------------------------------------------------------ *
 * Retention (decision §11.3) — the trail is capped, then archived, never silently dropped.
 * ------------------------------------------------------------------ */

export interface RetentionPolicy {
  dispositionRetentionDays: number
  dispositionMaximumRecords: number
  archivedCount: number
  oldestRetainedAt?: string
}

