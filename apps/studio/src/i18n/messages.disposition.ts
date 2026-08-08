import { defineMessages, useIntl, type PrimitiveType } from 'react-intl'
import type { DispositionMode, DispositionProvenance, EvidenceStrength, PrincipalChainLink, PrincipalKind, PurposeAudience, Reversibility, RiskTier, RuntimeDecision } from '@lattice/contracts'

/**
 * Loop 2 strings — compiler bar (E3/E4), disposition trail (E5), attestations (E16), executions.
 * Kept out of `messages.ts` so the Loop 2 surfaces own their catalogue; ids are namespaced
 * `compiler.*`, `disposition.*`, `attestation.*`, `execution.*`.
 */
export const dispositionMessages = defineMessages({
  /* ---- Compiler bar: declared purpose (E4) ---- */
  compilerPurpose: { id: 'compiler.purpose', defaultMessage: 'Declared purpose', description: 'Label for the required purpose selector beside the compiler question field.' },
  compilerPurposeRequired: { id: 'compiler.purposeRequired', defaultMessage: 'Select a purpose' },
  compilerPurposeLoading: { id: 'compiler.purposeLoading', defaultMessage: 'Loading purposes…' },
  compilerPurposeUnavailable: { id: 'compiler.purposeUnavailable', defaultMessage: 'Purpose catalogue unavailable — {detail}' },
  compilerPurposeDeclared: { id: 'compiler.purposeDeclared', defaultMessage: 'Purpose is declared, never inferred from the question text.' },
  compilerPurposeAudience: { id: 'compiler.purposeAudience', defaultMessage: 'Audience' },
  compilerPurposeReversibility: { id: 'compiler.purposeReversibility', defaultMessage: 'Reversibility' },

  /* ---- Compiler bar: mode (E3) ---- */
  compilerMode: { id: 'compiler.mode', defaultMessage: 'Compile mode' },
  compilerModeDryRun: { id: 'compiler.mode.dryRun', defaultMessage: 'Dry run' },
  compilerModeAuthorized: { id: 'compiler.mode.authorized', defaultMessage: 'Authorized' },
  compilerModeDryRunHint: { id: 'compiler.mode.dryRunHint', defaultMessage: 'Compiles the unpublished draft. The result explains the decision; it authorizes nothing.' },
  compilerModeAuthorizedHint: { id: 'compiler.mode.authorizedHint', defaultMessage: 'Needs a published contract on an active release. Produces a signed, authorizing disposition.' },
  compilerModeAuthorizedBlocked: { id: 'compiler.mode.authorizedBlocked', defaultMessage: 'Authorized mode needs a published contract on an active release. Dry run works on the draft right now.' },

  /* ---- Compiler bar: derived risk tier, shown before compile ---- */
  compilerRiskKicker: { id: 'compiler.risk.kicker', defaultMessage: 'Derived risk tier' },
  compilerRiskDeriving: { id: 'compiler.risk.deriving', defaultMessage: 'Deriving the risk tier…' },
  compilerRiskUnavailable: { id: 'compiler.risk.unavailable', defaultMessage: 'The risk tier could not be derived — {detail}' },
  compilerRiskSource: { id: 'compiler.risk.source', defaultMessage: 'Derived from purpose × contract × operation.' },
  compilerRiskMinimumEvidence: { id: 'compiler.risk.minimumEvidence', defaultMessage: 'Minimum evidence' },
  compilerRiskMaximumAge: { id: 'compiler.risk.maximumAge', defaultMessage: 'Maximum evidence age' },
  compilerRiskApproval: { id: 'compiler.risk.approval', defaultMessage: 'Human approval' },
  compilerRiskApprovalRequired: { id: 'compiler.risk.approvalRequired', defaultMessage: 'Required' },
  compilerRiskApprovalNotRequired: { id: 'compiler.risk.approvalNotRequired', defaultMessage: 'Not required' },
  compilerRiskPolicy: { id: 'compiler.risk.policy', defaultMessage: 'Governing policy' },
  compilerRiskMinutes: { id: 'compiler.risk.minutes', defaultMessage: '{count, plural, one {# minute} other {# minutes}}' },

  /* ---- Compiler bar: result banners ---- */
  compilerDryRunTitle: { id: 'compiler.dryRun.title', defaultMessage: 'Dry run — this result authorizes nothing' },
  compilerDryRunBody: { id: 'compiler.dryRun.body', defaultMessage: 'Compiled against the unpublished draft and written to the disposition trail as non-authorizing. No plan is signed and no operation may be executed from it.' },
  compilerAuthorizedTitle: { id: 'compiler.authorized.title', defaultMessage: 'Authorized compile' },
  compilerAuthorizedBody: { id: 'compiler.authorized.body', defaultMessage: 'Compiled against contract version {version}. The disposition retains the version pins the decision used.' },
  compilerOpenDisposition: { id: 'compiler.openDisposition', defaultMessage: 'Open disposition' },
  compilerNoDisposition: { id: 'compiler.noDisposition', defaultMessage: 'This compile returned no disposition id, so there is nothing to open in the trail.' },
  compilerViewTrail: { id: 'compiler.viewTrail', defaultMessage: 'Disposition trail' },
  compilerCompiling: { id: 'compiler.compiling', defaultMessage: 'Compiling…' },
  compilerCompileDryRun: { id: 'compiler.compileDryRun', defaultMessage: 'Dry-run compile' },
  compilerCompileAuthorized: { id: 'compiler.compileAuthorized', defaultMessage: 'Compile context' },
  compilerSelectPurposeFirst: { id: 'compiler.selectPurposeFirst', defaultMessage: 'Declare a purpose' },
  compilerSuspended: { id: 'compiler.suspended', defaultMessage: 'Runtime suspended' },

  /* ---- Disposition trail (E5) ---- */
  dispositionKicker: { id: 'disposition.kicker', defaultMessage: 'Decision trail' },
  dispositionTitle: { id: 'disposition.title', defaultMessage: 'Disposition Trail' },
  dispositionDescription: { id: 'disposition.description', defaultMessage: 'Every compile persists — dry run and authorized alike — with the declared purpose, principal chain, version pins, and evidence the decision actually used.' },
  dispositionListHeading: { id: 'disposition.listHeading', defaultMessage: 'Dispositions' },
  dispositionLoadingList: { id: 'disposition.loadingList', defaultMessage: 'Loading dispositions…' },
  dispositionLoadingDetail: { id: 'disposition.loadingDetail', defaultMessage: 'Loading disposition…' },
  dispositionListError: { id: 'disposition.listError', defaultMessage: 'The disposition trail could not be read' },
  dispositionDetailError: { id: 'disposition.detailError', defaultMessage: 'This disposition could not be read' },
  dispositionRetry: { id: 'disposition.retry', defaultMessage: 'Try again' },
  dispositionEmptyTitle: { id: 'disposition.emptyTitle', defaultMessage: 'No dispositions yet — compile a question' },
  dispositionEmptyDescription: { id: 'disposition.emptyDescription', defaultMessage: 'The trail fills the first time a question is compiled. A dry run works against the unpublished draft, so nothing needs publishing first.' },
  dispositionEmptyAction: { id: 'disposition.emptyAction', defaultMessage: 'Open the compiler' },
  dispositionFilteredEmptyTitle: { id: 'disposition.filteredEmptyTitle', defaultMessage: 'No dispositions match these filters' },
  dispositionFilteredEmptyDescription: { id: 'disposition.filteredEmptyDescription', defaultMessage: 'Widen the verdict, purpose, risk tier, principal, mode, or time range to see more of the trail.' },
  dispositionClearFilters: { id: 'disposition.clearFilters', defaultMessage: 'Clear filters' },
  dispositionSelectPrompt: { id: 'disposition.selectPrompt', defaultMessage: 'Select a disposition' },
  dispositionSelectPromptDescription: { id: 'disposition.selectPromptDescription', defaultMessage: 'Choose a row to reconstruct the decision: intent, authority, verdict, version pins, and evidence.' },

  dispositionFilterVerdict: { id: 'disposition.filter.verdict', defaultMessage: 'Verdict' },
  dispositionFilterPurpose: { id: 'disposition.filter.purpose', defaultMessage: 'Purpose' },
  dispositionFilterRisk: { id: 'disposition.filter.risk', defaultMessage: 'Risk tier' },
  dispositionFilterPrincipal: { id: 'disposition.filter.principal', defaultMessage: 'Principal' },
  dispositionFilterScope: { id: 'disposition.filter.scope', defaultMessage: 'Contract' },
  dispositionFilterMode: { id: 'disposition.filter.mode', defaultMessage: 'Mode' },
  dispositionFilterFrom: { id: 'disposition.filter.from', defaultMessage: 'From' },
  dispositionFilterTo: { id: 'disposition.filter.to', defaultMessage: 'To' },
  dispositionFilterAll: { id: 'disposition.filter.all', defaultMessage: 'All' },
  dispositionFilterThisContract: { id: 'disposition.filter.thisContract', defaultMessage: 'This contract' },
  dispositionFilterWorkspace: { id: 'disposition.filter.workspace', defaultMessage: 'Whole workspace' },
  dispositionFilterPrincipalPlaceholder: { id: 'disposition.filter.principalPlaceholder', defaultMessage: 'Principal id' },
  dispositionFiltersLabel: { id: 'disposition.filtersLabel', defaultMessage: 'Disposition filters' },

  dispositionMetricTotal: { id: 'disposition.metric.total', defaultMessage: 'In this view' },
  dispositionMetricTotalMeta: { id: 'disposition.metric.totalMeta', defaultMessage: 'matching the filters' },
  dispositionMetricAuthorizing: { id: 'disposition.metric.authorizing', defaultMessage: 'Authorizing' },
  dispositionMetricAuthorizingMeta: { id: 'disposition.metric.authorizingMeta', defaultMessage: 'on this page' },
  dispositionMetricDryRun: { id: 'disposition.metric.dryRun', defaultMessage: 'Dry run' },
  dispositionMetricDryRunMeta: { id: 'disposition.metric.dryRunMeta', defaultMessage: 'non-authorizing, on this page' },
  dispositionMetricApproval: { id: 'disposition.metric.approval', defaultMessage: 'Approval required' },
  dispositionMetricApprovalMeta: { id: 'disposition.metric.approvalMeta', defaultMessage: 'on this page' },

  dispositionPaginationRange: { id: 'disposition.pagination.range', defaultMessage: '{from}–{to} of {total}' },
  dispositionPaginationPrevious: { id: 'disposition.pagination.previous', defaultMessage: 'Previous' },
  dispositionPaginationNext: { id: 'disposition.pagination.next', defaultMessage: 'Next' },

  dispositionSectionIntent: { id: 'disposition.section.intent', defaultMessage: 'Authorized intent' },
  dispositionSectionChain: { id: 'disposition.section.chain', defaultMessage: 'Principal chain' },
  dispositionSectionVerdict: { id: 'disposition.section.verdict', defaultMessage: 'Verdict' },
  dispositionSectionPins: { id: 'disposition.section.pins', defaultMessage: 'Version pins' },
  dispositionSectionEvidence: { id: 'disposition.section.evidence', defaultMessage: 'Evidence references' },
  dispositionSectionExecution: { id: 'disposition.section.execution', defaultMessage: 'Latency and provenance' },
  dispositionSectionRecord: { id: 'disposition.section.record', defaultMessage: 'Record' },

  dispositionQuestion: { id: 'disposition.question', defaultMessage: 'Question' },
  dispositionDeclaredPurpose: { id: 'disposition.declaredPurpose', defaultMessage: 'Declared purpose' },
  dispositionRiskDerivation: { id: 'disposition.riskDerivation', defaultMessage: 'Risk derivation' },
  dispositionPurposeFloor: { id: 'disposition.purposeFloor', defaultMessage: 'Purpose floor' },
  dispositionOperationTier: { id: 'disposition.operationTier', defaultMessage: 'Operation tier' },
  dispositionNoOperation: { id: 'disposition.noOperation', defaultMessage: 'No operation bound' },

  dispositionChainVia: { id: 'disposition.chain.via', defaultMessage: 'Authority via' },
  dispositionChainScope: { id: 'disposition.chain.scope', defaultMessage: 'Scope' },
  dispositionChainExpires: { id: 'disposition.chain.expires', defaultMessage: 'Expires' },
  dispositionChainGrant: { id: 'disposition.chain.grant', defaultMessage: 'Grant' },
  dispositionChainEmpty: { id: 'disposition.chain.empty', defaultMessage: 'No principal chain was retained for this disposition.' },
  dispositionChainLabel: { id: 'disposition.chain.label', defaultMessage: 'Principal chain terminating in the verdict' },

  dispositionReasonCodes: { id: 'disposition.reasonCodes', defaultMessage: 'Reason codes' },
  dispositionExplanation: { id: 'disposition.explanation', defaultMessage: 'Explanation' },
  dispositionNoReasonCodes: { id: 'disposition.noReasonCodes', defaultMessage: 'No reason codes were recorded.' },
  dispositionOperation: { id: 'disposition.operation', defaultMessage: 'Operation' },
  dispositionPlan: { id: 'disposition.plan', defaultMessage: 'Plan' },
  dispositionApproval: { id: 'disposition.approval', defaultMessage: 'Approval' },
  dispositionClarification: { id: 'disposition.clarification', defaultMessage: 'Clarification' },

  dispositionPinsIntro: { id: 'disposition.pinsIntro', defaultMessage: 'Exactly what this decision was compiled against. This is the reconstructability record.' },
  dispositionPinContract: { id: 'disposition.pin.contract', defaultMessage: 'Contract' },
  dispositionPinOntology: { id: 'disposition.pin.ontology', defaultMessage: 'Ontology' },
  dispositionPinBindings: { id: 'disposition.pin.bindings', defaultMessage: 'Source bindings' },
  dispositionPinPolicies: { id: 'disposition.pin.policies', defaultMessage: 'Policies' },
  dispositionPinMetrics: { id: 'disposition.pin.metrics', defaultMessage: 'Metrics' },
  dispositionPinCompiler: { id: 'disposition.pin.compiler', defaultMessage: 'Compiler' },
  dispositionPinEvaluatedAt: { id: 'disposition.pin.evaluatedAt', defaultMessage: 'Evaluated at' },
  dispositionPinNone: { id: 'disposition.pin.none', defaultMessage: 'None pinned' },
  dispositionPinVersion: { id: 'disposition.pin.version', defaultMessage: 'v{version}' },
  dispositionPinsMissing: { id: 'disposition.pinsMissing', defaultMessage: 'No compilation record was retained, so this decision cannot be reconstructed from version pins.' },

  dispositionEvidenceCount: { id: 'disposition.evidenceCount', defaultMessage: '{count, plural, one {# reference} other {# references}}' },
  dispositionEvidenceNone: { id: 'disposition.evidenceNone', defaultMessage: 'No evidence was referenced by this decision.' },
  dispositionEvidenceVerify: { id: 'disposition.evidenceVerify', defaultMessage: 'Verify' },
  dispositionEvidenceHide: { id: 'disposition.evidenceHide', defaultMessage: 'Hide verification' },
  dispositionEvidenceScope: { id: 'disposition.evidenceScope', defaultMessage: 'Reference {ref} is covered by the disposition attestation below — the signed payload includes this reference list. Verification reports on that attestation, not on the source system.' },

  dispositionLatency: { id: 'disposition.latency', defaultMessage: 'Compile latency' },
  dispositionCreatedAt: { id: 'disposition.createdAt', defaultMessage: 'Compiled at' },
  dispositionProvenance: { id: 'disposition.provenance', defaultMessage: 'Provenance' },
  dispositionProvenanceReconstructed: { id: 'disposition.provenance.reconstructed', defaultMessage: 'Reconstructed from retained inputs' },
  dispositionProvenanceReconstructedDetail: { id: 'disposition.provenance.reconstructedDetail', defaultMessage: 'Rebuilt from the inputs retained at compile time. It says what the system decided then — not what it would decide against current data.' },
  dispositionProvenanceReExecuted: { id: 'disposition.provenance.reExecuted', defaultMessage: 'Re-executed against current data' },
  dispositionProvenanceReExecutedDetail: { id: 'disposition.provenance.reExecutedDetail', defaultMessage: 'Bindings were called again and the decision recomputed against data as it stands now. It is not a record of the original decision.' },

  dispositionModeBannerDryRunTitle: { id: 'disposition.modeBanner.dryRunTitle', defaultMessage: 'Dry run — non-authorizing' },
  dispositionModeBannerDryRunBody: { id: 'disposition.modeBanner.dryRunBody', defaultMessage: 'This disposition was compiled in dry-run mode against a draft. It is a record of reasoning, not an authorization, and no operation may be executed from it.' },
  dispositionModeBannerAuthorizedTitle: { id: 'disposition.modeBanner.authorizedTitle', defaultMessage: 'Authorizing disposition' },
  dispositionModeBannerAuthorizedBody: { id: 'disposition.modeBanner.authorizedBody', defaultMessage: 'Compiled in authorized mode against a published release.' },
  dispositionModeBannerRevokedTitle: { id: 'disposition.modeBanner.revokedTitle', defaultMessage: 'Authorized mode, non-authorizing result' },
  dispositionModeBannerRevokedBody: { id: 'disposition.modeBanner.revokedBody', defaultMessage: 'The compile ran in authorized mode but the record is flagged non-authorizing. Treat it as explanatory only.' },
  dispositionMode: { id: 'disposition.mode', defaultMessage: 'Mode' },
  dispositionAuthorizing: { id: 'disposition.authorizing', defaultMessage: 'Authorizing' },
  dispositionAuthorizingYes: { id: 'disposition.authorizingYes', defaultMessage: 'Yes' },
  dispositionAuthorizingNo: { id: 'disposition.authorizingNo', defaultMessage: 'No' },
  dispositionArtifactDigest: { id: 'disposition.artifactDigest', defaultMessage: 'Artifact digest' },
  dispositionEvalRun: { id: 'disposition.evalRun', defaultMessage: 'Evaluation run' },
  dispositionPrincipal: { id: 'disposition.principal', defaultMessage: 'Principal' },
  dispositionCopyLink: { id: 'disposition.copyLink', defaultMessage: 'Copy link' },
  dispositionLinkCopied: { id: 'disposition.linkCopied', defaultMessage: 'Link copied' },

  /* ---- Attestations (E16) ---- */
  attestationHeading: { id: 'attestation.heading', defaultMessage: 'Attestations' },
  attestationLoading: { id: 'attestation.loading', defaultMessage: 'Loading attestations…' },
  attestationError: { id: 'attestation.error', defaultMessage: 'Attestations could not be read' },
  attestationEmptyTitle: { id: 'attestation.emptyTitle', defaultMessage: 'No attestation for this subject' },
  attestationEmptyDescription: { id: 'attestation.emptyDescription', defaultMessage: 'Nothing has been signed over this record, so no integrity claim can be made about it here.' },
  attestationPredicate: { id: 'attestation.predicate', defaultMessage: 'Predicate' },
  attestationCanonicalization: { id: 'attestation.canonicalization', defaultMessage: 'Serialization' },
  attestationPayloadDigest: { id: 'attestation.payloadDigest', defaultMessage: 'Payload digest' },
  attestationSigner: { id: 'attestation.signer', defaultMessage: 'Signer' },
  attestationSignerRole: { id: 'attestation.signerRole', defaultMessage: 'Role held at signing' },
  attestationKey: { id: 'attestation.key', defaultMessage: 'Key' },
  attestationAlgorithm: { id: 'attestation.algorithm', defaultMessage: 'Algorithm' },
  attestationIssued: { id: 'attestation.issued', defaultMessage: 'Issued' },
  attestationExpires: { id: 'attestation.expires', defaultMessage: 'Expires' },
  attestationNoExpiry: { id: 'attestation.noExpiry', defaultMessage: 'No expiry set' },
  attestationExpired: { id: 'attestation.expired', defaultMessage: 'Expired' },
  attestationCurrent: { id: 'attestation.current', defaultMessage: 'Within validity' },
  attestationRevoked: { id: 'attestation.revoked', defaultMessage: 'Revoked' },
  attestationRevokedDetail: { id: 'attestation.revokedDetail', defaultMessage: 'Revoked {date} — {reason}' },
  attestationNotRevoked: { id: 'attestation.notRevoked', defaultMessage: 'Not revoked' },
  attestationLogInclusion: { id: 'attestation.logInclusion', defaultMessage: 'Transparency log' },
  attestationLogIndex: { id: 'attestation.logIndex', defaultMessage: 'Index {index}' },
  attestationLogRoot: { id: 'attestation.logRoot', defaultMessage: 'Root' },
  attestationVerify: { id: 'attestation.verify', defaultMessage: 'Verify' },
  attestationVerifying: { id: 'attestation.verifying', defaultMessage: 'Verifying…' },
  attestationReverify: { id: 'attestation.reverify', defaultMessage: 'Verify again' },
  attestationVerifyFailed: { id: 'attestation.verifyFailed', defaultMessage: 'Verification could not be run — {detail}' },
  attestationVerifiedTrue: { id: 'attestation.verifiedTrue', defaultMessage: 'All checks passed' },
  attestationVerifiedFalse: { id: 'attestation.verifiedFalse', defaultMessage: 'Verification did not pass' },
  attestationVerifiedAt: { id: 'attestation.verifiedAt', defaultMessage: 'Verified {date}' },
  attestationNotVerified: { id: 'attestation.notVerified', defaultMessage: 'Not verified in this session. Nothing here is an integrity claim until you run Verify.' },
  attestationCheckKeyKnown: { id: 'attestation.check.keyKnown', defaultMessage: 'Signing key is known' },
  attestationCheckSignature: { id: 'attestation.check.signature', defaultMessage: 'Signature' },
  attestationCheckPayloadDigest: { id: 'attestation.check.payloadDigest', defaultMessage: 'Payload digest' },
  attestationCheckFreshness: { id: 'attestation.check.freshness', defaultMessage: 'Freshness' },
  attestationCheckRevocation: { id: 'attestation.check.revocation', defaultMessage: 'Revocation' },
  attestationCheckLogInclusion: { id: 'attestation.check.logInclusion', defaultMessage: 'Log inclusion' },
  attestationStatusPass: { id: 'attestation.status.pass', defaultMessage: 'Pass' },
  attestationStatusFail: { id: 'attestation.status.fail', defaultMessage: 'Fail' },
  attestationStatusUnavailable: { id: 'attestation.status.unavailable', defaultMessage: 'Unavailable' },
  attestationChecksLabel: { id: 'attestation.checksLabel', defaultMessage: 'Verification checks' },

  /* ---- Executions ---- */
  executionKicker: { id: 'execution.kicker', defaultMessage: 'Runtime' },
  executionTitle: { id: 'execution.title', defaultMessage: 'Executions' },
  executionDescription: { id: 'execution.description', defaultMessage: 'Immutable receipts for every plan this contract executed — adapter results, the permissions actually granted, and the disposition the plan came from.' },
  executionLoading: { id: 'execution.loading', defaultMessage: 'Loading execution receipts…' },
  executionError: { id: 'execution.error', defaultMessage: 'Execution receipts could not be read' },
  executionEmptyTitle: { id: 'execution.emptyTitle', defaultMessage: 'No executions yet' },
  executionEmptyDescription: { id: 'execution.emptyDescription', defaultMessage: 'A receipt is written when a signed plan runs. Compile a question in authorized mode and execute the resulting plan.' },
  executionEmptyAction: { id: 'execution.emptyAction', defaultMessage: 'Open the compiler' },
  executionExpand: { id: 'execution.expand', defaultMessage: 'Show receipt detail' },
  executionCollapse: { id: 'execution.collapse', defaultMessage: 'Hide receipt detail' },
  executionPlan: { id: 'execution.plan', defaultMessage: 'Plan' },
  executionPrincipal: { id: 'execution.principal', defaultMessage: 'Principal' },
  executionStarted: { id: 'execution.started', defaultMessage: 'Started' },
  executionCompleted: { id: 'execution.completed', defaultMessage: 'Completed' },
  executionDuration: { id: 'execution.duration', defaultMessage: 'Duration' },
  executionBindingResults: { id: 'execution.bindingResults', defaultMessage: 'Binding results' },
  executionNoBindingResults: { id: 'execution.noBindingResults', defaultMessage: 'No adapter was called by this execution.' },
  executionMappedValues: { id: 'execution.mappedValues', defaultMessage: '{count, plural, one {# governed field} other {# governed fields}}' },
  executionPermissions: { id: 'execution.permissions', defaultMessage: 'Permissions' },
  executionRequired: { id: 'execution.required', defaultMessage: 'Required' },
  executionGranted: { id: 'execution.granted', defaultMessage: 'Granted' },
  executionMissingPermission: { id: 'execution.missingPermission', defaultMessage: 'Required but not granted' },
  executionNoPermissions: { id: 'execution.noPermissions', defaultMessage: 'None declared' },
  executionEvidence: { id: 'execution.evidence', defaultMessage: 'Evidence references' },
  executionOpenDisposition: { id: 'execution.openDisposition', defaultMessage: 'Open disposition' },
  executionNoDisposition: { id: 'execution.noDisposition', defaultMessage: 'No disposition in the trail references this plan.' },
  executionArtifactDigest: { id: 'execution.artifactDigest', defaultMessage: 'Receipt digest' },
  executionStatusSuccess: { id: 'execution.status.success', defaultMessage: 'Success' },
  executionStatusFailed: { id: 'execution.status.failed', defaultMessage: 'Failed' },
  executionStatusDenied: { id: 'execution.status.denied', defaultMessage: 'Denied' },
  executionAdapterMode: { id: 'execution.adapterMode', defaultMessage: '{mode} adapter' },

  /* ---- Shared enum labels ---- */
  decisionResolved: { id: 'disposition.decision.resolved', defaultMessage: 'Resolved' },
  decisionClarificationRequired: { id: 'disposition.decision.clarificationRequired', defaultMessage: 'Clarification required' },
  decisionApprovalRequired: { id: 'disposition.decision.approvalRequired', defaultMessage: 'Approval required' },
  decisionInsufficientEvidence: { id: 'disposition.decision.insufficientEvidence', defaultMessage: 'Insufficient evidence' },
  decisionStaleContext: { id: 'disposition.decision.staleContext', defaultMessage: 'Stale context' },
  decisionDenied: { id: 'disposition.decision.denied', defaultMessage: 'Denied' },
  decisionUnsupported: { id: 'disposition.decision.unsupported', defaultMessage: 'Unsupported' },
  decisionDegraded: { id: 'disposition.decision.degraded', defaultMessage: 'Degraded' },

  riskInformational: { id: 'disposition.risk.informational', defaultMessage: 'Informational' },
  riskAnalytical: { id: 'disposition.risk.analytical', defaultMessage: 'Analytical' },
  riskPlanningDecision: { id: 'disposition.risk.planningDecision', defaultMessage: 'Planning decision' },
  riskOperationalAction: { id: 'disposition.risk.operationalAction', defaultMessage: 'Operational action' },

  strengthExact: { id: 'disposition.strength.exact', defaultMessage: 'Exact' },
  strengthStrong: { id: 'disposition.strength.strong', defaultMessage: 'Strong' },
  strengthModerate: { id: 'disposition.strength.moderate', defaultMessage: 'Moderate' },
  strengthWeak: { id: 'disposition.strength.weak', defaultMessage: 'Weak' },
  strengthInsufficient: { id: 'disposition.strength.insufficient', defaultMessage: 'Insufficient' },

  kindHuman: { id: 'disposition.kind.human', defaultMessage: 'Human' },
  kindAgent: { id: 'disposition.kind.agent', defaultMessage: 'Agent' },
  kindService: { id: 'disposition.kind.service', defaultMessage: 'Service' },

  viaAuthentication: { id: 'disposition.via.authentication', defaultMessage: 'Authenticated directly' },
  viaDelegation: { id: 'disposition.via.delegation', defaultMessage: 'Delegated authority' },
  viaServiceAccount: { id: 'disposition.via.serviceAccount', defaultMessage: 'Service account' },

  audienceInternal: { id: 'disposition.audience.internal', defaultMessage: 'Internal' },
  audiencePartner: { id: 'disposition.audience.partner', defaultMessage: 'Partner' },
  audienceCustomer: { id: 'disposition.audience.customer', defaultMessage: 'Customer' },
  audienceRegulator: { id: 'disposition.audience.regulator', defaultMessage: 'Regulator' },
  audiencePublic: { id: 'disposition.audience.public', defaultMessage: 'Public' },

  reversibilityReversible: { id: 'disposition.reversibility.reversible', defaultMessage: 'Reversible' },
  reversibilityPartial: { id: 'disposition.reversibility.partial', defaultMessage: 'Partially reversible' },
  reversibilityIrreversible: { id: 'disposition.reversibility.irreversible', defaultMessage: 'Irreversible' },

  commonClose: { id: 'disposition.common.close', defaultMessage: 'Close' },
  commonNone: { id: 'disposition.common.none', defaultMessage: 'None' },
  commonUnknown: { id: 'disposition.common.unknown', defaultMessage: 'Not recorded' },
})

export type DispositionMessageKey = keyof typeof dispositionMessages

/* Enum → message-key maps. Kept beside the catalogue so no surface re-spells an enum label. */

export const decisionMessageKeys: Readonly<Record<RuntimeDecision, DispositionMessageKey>> = {
  RESOLVED: 'decisionResolved',
  CLARIFICATION_REQUIRED: 'decisionClarificationRequired',
  APPROVAL_REQUIRED: 'decisionApprovalRequired',
  INSUFFICIENT_EVIDENCE: 'decisionInsufficientEvidence',
  STALE_CONTEXT: 'decisionStaleContext',
  DENIED: 'decisionDenied',
  UNSUPPORTED: 'decisionUnsupported',
  DEGRADED: 'decisionDegraded',
}

export const riskTierMessageKeys: Readonly<Record<RiskTier, DispositionMessageKey>> = {
  INFORMATIONAL: 'riskInformational',
  ANALYTICAL: 'riskAnalytical',
  PLANNING_DECISION: 'riskPlanningDecision',
  OPERATIONAL_ACTION: 'riskOperationalAction',
}

export const evidenceStrengthMessageKeys: Readonly<Record<EvidenceStrength, DispositionMessageKey>> = {
  EXACT: 'strengthExact',
  STRONG: 'strengthStrong',
  MODERATE: 'strengthModerate',
  WEAK: 'strengthWeak',
  INSUFFICIENT: 'strengthInsufficient',
}

export const principalKindMessageKeys: Readonly<Record<PrincipalKind, DispositionMessageKey>> = {
  HUMAN: 'kindHuman',
  AGENT: 'kindAgent',
  SERVICE: 'kindService',
}

export const delegationViaMessageKeys: Readonly<Record<PrincipalChainLink['via'], DispositionMessageKey>> = {
  AUTHENTICATION: 'viaAuthentication',
  DELEGATION: 'viaDelegation',
  SERVICE_ACCOUNT: 'viaServiceAccount',
}

export const dispositionModeMessageKeys: Readonly<Record<DispositionMode, DispositionMessageKey>> = {
  DRY_RUN: 'compilerModeDryRun',
  AUTHORIZED: 'compilerModeAuthorized',
}

export const provenanceMessageKeys: Readonly<Record<DispositionProvenance, { label: DispositionMessageKey; detail: DispositionMessageKey }>> = {
  RECONSTRUCTED: { label: 'dispositionProvenanceReconstructed', detail: 'dispositionProvenanceReconstructedDetail' },
  RE_EXECUTED: { label: 'dispositionProvenanceReExecuted', detail: 'dispositionProvenanceReExecutedDetail' },
}

export const purposeAudienceMessageKeys: Readonly<Record<PurposeAudience, DispositionMessageKey>> = {
  INTERNAL: 'audienceInternal',
  PARTNER: 'audiencePartner',
  CUSTOMER: 'audienceCustomer',
  REGULATOR: 'audienceRegulator',
  PUBLIC: 'audiencePublic',
}

export const reversibilityMessageKeys: Readonly<Record<Reversibility, DispositionMessageKey>> = {
  REVERSIBLE: 'reversibilityReversible',
  PARTIALLY_REVERSIBLE: 'reversibilityPartial',
  IRREVERSIBLE: 'reversibilityIrreversible',
}

export function useDispositionMessages() {
  const intl = useIntl()
  return {
    t: (key: DispositionMessageKey, values?: Record<string, PrimitiveType>) => intl.formatMessage(dispositionMessages[key], values),
    formatDate: intl.formatDate,
    formatNumber: intl.formatNumber,
  }
}
