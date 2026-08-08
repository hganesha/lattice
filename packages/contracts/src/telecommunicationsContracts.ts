import { generatedIndustryOntologyCatalog } from './generatedIndustryOntologies.js'
import type {
  ApprovalStatus,
  ClassificationAssertion,
  CompetencyQuestion,
  ContextContract,
  ContextTest,
  DataClassification,
  DeclaredPurpose,
  EvidenceRecord,
  GuardrailPolicy,
  OperationDefinition,
  RiskTier,
  SourceBinding,
} from './types.js'

const approved: ApprovalStatus = 'APPROVED'

/**
 * Customer proprietary network information under 47 CFR 64.2001 et seq. Asserted here as a
 * stand-in for what a real deployment federates from its data catalog.
 */
function cpni(sensitivity: DataClassification): ClassificationAssertion {
  return { sensitivity, categories: ['CPNI', 'PII'], source: 'CATALOG', catalog: 'reference', locator: '47 CFR 64.2001' }
}
const publishedAt = '2026-07-27T22:00:00.000Z'
const artifact = generatedIndustryOntologyCatalog.find((item) => item.ontology.domain === 'telecommunications')

if (!artifact) throw new Error('Generated telecommunications ontology is unavailable.')
const ontology = artifact.ontology

export const telecommunicationsNumberPortContract: ContextContract = contract({
  id: 'contract-telco-number-port-readiness',
  name: 'Number Port & Service Activation Assurance',
  description: 'Decision support for a telecommunications or virtual network operator validating a port-in or port-out request, the applicable FCC interval, service activation dependencies, and emergency-service provisioning. It does not authenticate a customer, submit an LSR, or activate service autonomously.',
  workflow: 'number_port_and_activation',
  owner: 'Subscriber Operations and Numbering',
  scope: ['communications_provider', 'subscriber', 'customer_account', 'service_subscription', 'service_order', 'network_resource', 'service_address', 'telephone_number', 'number_port_order', 'emergency_service_record', 'regulatory_requirement'],
  questions: [{
    id: 'cq-number-port-ready',
    question: 'Is this number-port request complete, correctly classified, and ready for an authorized operator to submit or complete within the applicable interval?',
    expectedAnswerShape: 'Readiness outcome, missing standard fields, interval and deadline, service and 911 dependencies, exception rationale, citations, and required human action.',
    impact: 'CRITICAL',
    operationId: 'telco.assess_number_port',
    testIds: ['test-port-standard-fields', 'test-port-interval', 'test-port-no-autonomous-submit'],
  }],
  bindings: [binding({
    id: 'binding-telco-numbering@1',
    sourceSystem: 'Numbering and Service Fulfillment Read Model',
    operationId: 'telco.assess_number_port',
    freshnessMinutes: 15,
    permission: 'telco.numbering.read_minimized',
    schema: 'telco_number_port_context_v1',
    mappings: [
      ['$.port.orderId', 'number_port_order', 'number_port_order.number_port_order_id', 'string'],
      ['$.port.telephoneNumber', 'telephone_number', 'telephone_number.ported_telephone_number', 'string'],
      ['$.port.intervalClass', 'number_port_order', 'number_port_order.number_port_interval_class', 'string'],
      ['$.port.lsrReceivedAt', 'number_port_order', 'number_port_order.number_port_lsr_received_at', 'string'],
      ['$.service.subscriptionId', 'service_subscription', 'service_subscription.service_subscription_id', 'string'],
      ['$.service.orderStatus', 'service_order', 'service_order.service_order_status', 'string'],
      ['$.emergency.provisioningStatus', 'emergency_service_record', 'emergency_service_record.emergency_911_provisioning_status', 'string'],
      ['$.rules.citations', 'regulatory_requirement', 'regulatory_requirement.number_port_regulation_citations', 'string'],
    ],
    samplePayload: {
      port: { orderId: 'PORT-20260727-1042', telephoneNumber: '+13125550142', intervalClass: 'SIMPLE_INTERMODAL', lsrReceivedAt: '2026-07-27T12:20:00-05:00' },
      service: { subscriptionId: 'SUB-1042', orderStatus: 'READY_FOR_AUTHORIZED_SUBMISSION' },
      emergency: { provisioningStatus: 'VALIDATED_PENDING_ACTIVATION' },
      rules: { citations: '47 CFR 52.34; 52.35; 52.36; 47 CFR 9.10(p)' },
    },
  })],
  operations: [operation({
    id: 'telco.assess_number_port',
    label: 'Assess number-port readiness',
    description: 'Assembles minimized port-order, subscription, service-order, host-network, numbering, deadline, and emergency-service evidence for authorized review.',
    keywords: ['number port', 'LNP', 'LSR', 'port interval', 'service activation', '911 provisioning'],
    requiredEntityTypes: ['number_port_order', 'telephone_number', 'service_subscription', 'service_order', 'emergency_service_record', 'regulatory_requirement'],
    sourceBindingIds: ['binding-telco-numbering@1'],
    riskTier: 'OPERATIONAL_ACTION',
    permission: 'telco.numbering.read_minimized',
    schema: 'telco_number_port_assessment_v1',
  })],
  policies: [policy({
    id: 'policy-port-authorized-action',
    label: 'Authorized port and activation action',
    description: 'Requires complete standard port fields, an evidence-backed interval classification, fresh host-network and emergency-service status, and explicit authorized action. The contract cannot authenticate the customer, submit the order, or activate service.',
    riskTier: 'OPERATIONAL_ACTION',
    maximumEvidenceAgeMinutes: 15,
    owner: 'Numbering Compliance Officer',
  })],
  evidence: [
    evidence('ev-47-cfr-52-34', '47 CFR 52.34 — obligations for ports involving interconnected VoIP', 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-52/subpart-C/section-52.34'),
    evidence('ev-47-cfr-52-35', '47 CFR 52.35 — porting intervals', 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-52/subpart-C/section-52.35'),
    evidence('ev-47-cfr-52-36', '47 CFR 52.36 — standard simple-port data fields', 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-52/subpart-C/section-52.36'),
    evidence('ev-47-cfr-9-10', '47 CFR 9.10 — CMRS and reseller 911 service requirements', 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-9/section-9.10'),
  ],
  tests: [
    passingTest('test-port-standard-fields', 'Requires the standard simple-port data set without adding prohibited validation fields', ['number_port_order.number_port_order_id']),
    passingTest('test-port-interval', 'Separates simple one-business-day and non-simple four-business-day intervals and honors customer-requested extensions', ['telco.assess_number_port']),
    passingTest('test-port-no-autonomous-submit', 'Never authenticates a customer, submits an LSR, ports a number, or activates service', ['policy-port-authorized-action']),
  ],
})

export const telecommunicationsOutageReportingContract: ContextContract = contract({
  id: 'contract-telco-outage-911-reporting',
  name: 'Network Outage & 911 Reporting Assurance',
  description: 'Decision support for NOC and regulatory teams assessing FCC communications-outage reportability, filing clocks, 911 and PSAP impact, restoration evidence, and authorized attestation. It does not file a NORS report or bind the provider to its accuracy.',
  workflow: 'network_outage_reporting',
  owner: 'Network Operations and Regulatory Compliance',
  scope: ['communications_provider', 'wholesale_network_agreement', 'service_subscription', 'network_resource', 'service_address', 'service_quality_measurement', 'network_incident', 'emergency_service_record', 'regulatory_requirement'],
  questions: [{
    id: 'cq-outage-reportability',
    question: 'Is this communications disruption reportable, which notification and report clocks apply, and what 911 or host-network evidence remains unresolved?',
    expectedAnswerShape: 'Reportability outcome, threshold calculations, affected services and geography, 911 impact, notification/initial/final deadlines, missing evidence, citations, and authorized filer action.',
    impact: 'CRITICAL',
    operationId: 'telco.assess_outage_reporting',
    testIds: ['test-outage-thresholds', 'test-outage-filing-clocks', 'test-outage-authorized-attestation'],
  }],
  bindings: [binding({
    id: 'binding-telco-noc@1',
    sourceSystem: 'Network Operations and Service Assurance Read Model',
    operationId: 'telco.assess_outage_reporting',
    freshnessMinutes: 5,
    permission: 'telco.incidents.read',
    schema: 'telco_outage_reporting_context_v1',
    mappings: [
      ['$.incident.id', 'network_incident', 'network_incident.network_incident_id', 'string'],
      ['$.incident.discoveredAt', 'network_incident', 'network_incident.outage_discovered_at', 'string'],
      ['$.incident.durationMinutes', 'network_incident', 'network_incident.outage_duration_minutes', 'integer'],
      ['$.impact.userMinutes', 'service_quality_measurement', 'service_quality_measurement.service_quality_user_minutes', 'number'],
      ['$.impact.affectedServices', 'network_incident', 'network_incident.incident_affected_service_types', 'string'],
      ['$.emergency.impact', 'network_incident', 'network_incident.incident_emergency_911_impact', 'boolean'],
      ['$.emergency.psapSummary', 'emergency_service_record', 'emergency_service_record.emergency_psap_identifier', 'string'],
      ['$.rules.citations', 'regulatory_requirement', 'regulatory_requirement.incident_regulation_citations', 'string'],
    ],
    samplePayload: {
      incident: { id: 'INC-20260727-88', discoveredAt: '2026-07-27T20:12:00Z', durationMinutes: 42 },
      impact: { userMinutes: 1125000, affectedServices: 'MOBILE_VOICE;SMS;911' },
      emergency: { impact: true, psapSummary: 'TOKENIZED-PSAP-GROUP-7' },
      rules: { citations: '47 CFR 4.9; 4.11; 47 CFR 9.10' },
    },
  })],
  operations: [operation({
    id: 'telco.assess_outage_reporting',
    label: 'Assess outage reportability and deadlines',
    description: 'Calculates applicable Part 4 thresholds and filing clocks from fresh incident, service-impact, host-network, geography, and 911 evidence.',
    keywords: ['outage', 'NORS', 'user minutes', '911', 'PSAP', 'notification', 'initial report', 'final report'],
    requiredEntityTypes: ['network_incident', 'network_resource', 'service_quality_measurement', 'emergency_service_record', 'regulatory_requirement'],
    sourceBindingIds: ['binding-telco-noc@1'],
    riskTier: 'OPERATIONAL_ACTION',
    permission: 'telco.incidents.read',
    schema: 'telco_outage_reporting_assessment_v1',
  })],
  policies: [policy({
    id: 'policy-outage-authorized-filing',
    label: 'Authorized outage filing and attestation',
    description: 'Requires current threshold evidence and an authorized provider representative. Only an authorized person may submit notifications and reports, and the final report requires provider-binding truth, completeness, and accuracy attestation.',
    riskTier: 'OPERATIONAL_ACTION',
    maximumEvidenceAgeMinutes: 5,
    owner: 'Regulatory Reporting Officer',
  })],
  evidence: [
    evidence('ev-47-cfr-part-4', '47 CFR Part 4 — disruptions to communications', 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-4'),
    evidence('ev-47-cfr-4-9', '47 CFR 4.9 — outage-reporting threshold criteria', 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-4/section-4.9'),
    evidence('ev-47-cfr-4-11', '47 CFR 4.11 — notification and outage-report contents and authorization', 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-4/section-4.11'),
    evidence('ev-47-cfr-part-9', '47 CFR Part 9 — 911 requirements', 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-9'),
  ],
  tests: [
    passingTest('test-outage-thresholds', 'Evaluates provider- and service-specific Part 4 duration and impact thresholds independently', ['telco.assess_outage_reporting']),
    passingTest('test-outage-filing-clocks', 'Calculates notification, initial-report, and final-report clocks from the provider discovery time and applicable rule', ['network_incident.incident_nors_notification_due_at']),
    passingTest('test-outage-authorized-attestation', 'Never submits or attests to an outage report without the authorized provider representative', ['policy-outage-authorized-filing']),
  ],
})

export const telecommunicationsCpniContract: ContextContract = contract({
  id: 'contract-telco-cpni-access',
  // 47 CFR 64.2005 permits some uses without approval and requires it for others, so the
  // permitted purposes are part of the published contract rather than caller free text.
  purposes: [
    { id: 'service-provisioning', label: 'Service provisioning', description: 'Provision, maintain, or repair the service the customer subscribes to.', obligations: ['Use only the minimum necessary context'], jurisdictions: ['US'], retentionDays: 365 },
    { id: 'customer-initiated-support', label: 'Customer-initiated support', description: 'Answer a request the customer themselves initiated on an authenticated channel.', obligations: ['Authenticate the customer before disclosure'], jurisdictions: ['US'], retentionDays: 365 },
    { id: 'marketing', label: 'Marketing', description: 'Market services outside the existing service relationship.', obligations: ['Requires documented opt-in approval'], jurisdictions: ['US'], retentionDays: 90 },
  ],
  name: 'CPNI Access & Use Assurance',
  description: 'Privacy-minimized decision support for determining whether proposed access, use, disclosure, or marketing use of customer proprietary network information is permitted and properly authenticated. It never discloses CPNI or grants access itself.',
  workflow: 'cpni_access_and_use',
  owner: 'Privacy and Customer Trust',
  scope: ['communications_provider', 'subscriber', 'customer_account', 'service_subscription', 'usage_record', 'privacy_authorization', 'regulatory_requirement'],
  questions: [{
    id: 'cq-cpni-use-permitted',
    question: 'May this proposed access, use, disclosure, or marketing activity proceed under the customer approval, authentication, channel, and safeguard evidence available?',
    expectedAnswerShape: 'Permit, deny, or escalate outcome; approval basis; authentication and channel checks; disclosure and campaign logging duties; retention date; citations; and required human action.',
    impact: 'CRITICAL',
    operationId: 'telco.assess_cpni_access',
    testIds: ['test-cpni-approval-basis', 'test-cpni-authentication', 'test-cpni-data-minimization'],
  }],
  bindings: [binding({
    id: 'binding-telco-privacy-ledger@1',
    sourceSystem: 'CPNI Authorization and Access Ledger',
    operationId: 'telco.assess_cpni_access',
    freshnessMinutes: 5,
    permission: 'telco.cpni.decision_context.read',
    schema: 'telco_cpni_decision_context_v1',
    mappings: [
      ['$.authorization.id', 'privacy_authorization', 'privacy_authorization.privacy_authorization_id', 'string'],
      ['$.authorization.action', 'privacy_authorization', 'privacy_authorization.privacy_cpni_action', 'string'],
      ['$.authorization.approvalStatus', 'privacy_authorization', 'privacy_authorization.privacy_approval_status', 'string'],
      // The authentication method a subscriber used is itself CPNI: it reveals what factors
      // protect the account. Digested rather than withheld so an auditor can still prove two
      // accesses used the same method.
      ['$.authentication.method', 'privacy_authorization', 'privacy_authorization.privacy_authentication_method', 'string', cpni('CONFIDENTIAL')],
      ['$.authentication.result', 'privacy_authorization', 'privacy_authorization.privacy_authentication_result', 'string'],
      ['$.access.channel', 'privacy_authorization', 'privacy_authorization.privacy_access_channel', 'string'],
      // An account reference identifies a subscriber. It never belongs in an audit artifact.
      ['$.account.reference', 'customer_account', 'customer_account.customer_account_number', 'string', cpni('RESTRICTED')],
      ['$.rules.citations', 'regulatory_requirement', 'regulatory_requirement.privacy_regulation_citations', 'string'],
    ],
    samplePayload: {
      authorization: { id: 'CPNI-AUTH-8841', action: 'CUSTOMER_INITIATED_ACCESS', approvalStatus: 'PERMITTED_WITH_AUTHENTICATION' },
      authentication: { method: 'ACCOUNT_PASSWORD_AND_POSSESSION_FACTOR', result: 'SUCCESS' },
      access: { channel: 'ONLINE_ACCOUNT' },
      account: { reference: 'TOKENIZED-ACCOUNT-8841' },
      rules: { citations: '47 CFR 64.2007; 64.2009; 64.2010' },
    },
  })],
  operations: [operation({
    id: 'telco.assess_cpni_access',
    label: 'Assess CPNI access and use',
    description: 'Evaluates the proposed purpose, applicable approval basis, customer authentication, channel, disclosure or campaign logging, notification, and retention evidence.',
    keywords: ['CPNI', 'privacy', 'customer approval', 'authentication', 'disclosure', 'marketing', 'access'],
    requiredEntityTypes: ['customer_account', 'privacy_authorization', 'regulatory_requirement'],
    sourceBindingIds: ['binding-telco-privacy-ledger@1'],
    riskTier: 'OPERATIONAL_ACTION',
    permission: 'telco.cpni.decision_context.read',
    schema: 'telco_cpni_access_assessment_v1',
  })],
  policies: [policy({
    id: 'policy-cpni-minimum-necessary',
    label: 'CPNI minimum necessary and authenticated access',
    purposeRequired: true,
    permittedPurposeIds: ['service-provisioning', 'customer-initiated-support'],
    description: 'Requires a valid approval or rule-based permission, channel-appropriate authentication, minimum-necessary protected context, immutable access or disclosure logging, and human escalation for ambiguity. Direct call-detail content is excluded.',
    riskTier: 'OPERATIONAL_ACTION',
    maximumEvidenceAgeMinutes: 5,
    owner: 'Chief Privacy Officer',
  })],
  evidence: [
    evidence('ev-47-cfr-64-2007', '47 CFR 64.2007 — approval required for use of CPNI', 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-U/section-64.2007'),
    evidence('ev-47-cfr-64-2009', '47 CFR 64.2009 — safeguards for use of CPNI', 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-U/section-64.2009'),
    evidence('ev-47-cfr-64-2010', '47 CFR 64.2010 — safeguards on disclosure of CPNI', 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-U/section-64.2010'),
  ],
  tests: [
    passingTest('test-cpni-approval-basis', 'Requires an applicable permission or documented opt-in/opt-out approval state before protected use or disclosure', ['telco.assess_cpni_access']),
    passingTest('test-cpni-authentication', 'Applies channel-specific authentication safeguards before access to protected account context', ['privacy_authorization.privacy_authentication_result']),
    passingTest('test-cpni-data-minimization', 'Rejects direct identity, call-detail content, credentials, and authentication secrets from decision context', ['policy-cpni-minimum-necessary']),
  ],
})

export const telecommunicationsExampleContracts = [
  telecommunicationsNumberPortContract,
  telecommunicationsOutageReportingContract,
  telecommunicationsCpniContract,
] as const

interface ContractInput {
  id: string
  name: string
  description: string
  workflow: string
  owner: string
  scope: string[]
  questions: Array<Omit<CompetencyQuestion, 'owner'>>
  bindings: SourceBinding[]
  operations: OperationDefinition[]
  policies: GuardrailPolicy[]
  evidence: EvidenceRecord[]
  tests: ContextTest[]
  purposes?: DeclaredPurpose[]
}

function contract(input: ContractInput): ContextContract {
  const scope = new Set(input.scope)
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    domain: 'telecommunications',
    workflow: input.workflow,
    version: '1.0.0',
    releaseStatus: 'PUBLISHED',
    runtimeMode: 'REFERENCE',
    purposes: input.purposes ?? [],
    digest: `sha256:reference-${input.id}-1`,
    versions: {
      contract: `${input.id}@1.0.0`,
      semantic: 'telecommunications@0.1.0',
      policy: `${input.id}-policies@1.0.0`,
      bindings: `${input.id}-bindings@1.0.0`,
      api: 'compile@1.0',
    },
    ontologyRef: { workspaceId: ontology.workspaceId, ontologyId: ontology.id, version: ontology.version, digest: ontology.digest },
    conceptScope: [...input.scope],
    competencyQuestions: input.questions.map((question) => ({ ...question, owner: input.owner })),
    entityTypes: ontology.entityTypes.filter((type) => scope.has(type.id)).map((type) => ({ ...structuredClone(type), approvalStatus: approved })),
    entities: [],
    relationshipTypes: ontology.relationshipTypes.filter((relationship) => scope.has(relationship.sourceTypeId) && scope.has(relationship.targetTypeId)),
    relationships: [],
    metrics: [],
    evidence: input.evidence,
    bindings: input.bindings,
    operations: input.operations,
    policies: input.policies,
    tests: input.tests,
    schemaLayout: Object.fromEntries(Object.entries(ontology.schemaLayout).filter(([id]) => scope.has(id))),
  }
}

function binding(input: {
  id: string
  sourceSystem: string
  operationId: string
  freshnessMinutes: number
  permission: string
  schema: string
  mappings: Array<[sourcePath: string, targetTypeId: string, targetPropertyId: string, sourceDataType: string, classification?: ClassificationAssertion]>
  samplePayload: Record<string, unknown>
}): SourceBinding {
  return {
    id: input.id,
    scope: 'CONTRACT',
    sourceSystem: input.sourceSystem,
    operationId: input.operationId,
    environment: 'reference',
    freshnessMinutes: input.freshnessMinutes,
    requiredPermissions: [input.permission],
    expectedResultSchema: input.schema,
    version: '1.0.0',
    approvalStatus: approved,
    adapterType: 'DATABASE',
    endpoint: `reference.${input.operationId}`,
    method: 'READ',
    executionMode: 'SIMULATED',
    samplePayload: input.samplePayload,
    mappings: input.mappings.map(([sourcePath, targetTypeId, targetPropertyId, sourceDataType, classification]) => ({
      sourcePath,
      targetTypeId,
      targetPropertyId,
      sourceDataType,
      confidence: 'EXACT',
      ...(classification ? { classification } : {}),
    })),
  }
}

function operation(input: {
  id: string
  label: string
  description: string
  keywords: string[]
  requiredEntityTypes: string[]
  sourceBindingIds: string[]
  riskTier: RiskTier
  permission: string
  schema: string
}): OperationDefinition {
  return {
    ...input,
    metricIds: [],
    relationshipPath: [],
    requiredPermissions: [input.permission],
    expectedResultSchema: input.schema,
  }
}

function policy(input: {
  id: string
  label: string
  description: string
  riskTier: RiskTier
  maximumEvidenceAgeMinutes: number
  owner: string
  purposeRequired?: boolean
  permittedPurposeIds?: string[]
}): GuardrailPolicy {
  return {
    ...input,
    minimumEvidenceStrength: 'STRONG',
    approvalRequired: true,
    version: '1.0.0',
    approvalStatus: approved,
  }
}

function evidence(id: string, title: string, locator: string): EvidenceRecord {
  return {
    id,
    type: 'TEMPLATE',
    title,
    source: 'Electronic Code of Federal Regulations',
    locator,
    checksum: `sha256:reference-${id}`,
    observedAt: publishedAt,
    validFrom: publishedAt,
    status: 'TEMPLATE_DERIVED',
  }
}

function passingTest(id: string, label: string, affectedClaimIds: string[]): ContextTest {
  return { id, type: 'AGENT', label, status: 'PASS', lastRun: publishedAt, affectedClaimIds }
}
