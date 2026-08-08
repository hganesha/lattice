import { generatedIndustryOntologyCatalog } from './generatedIndustryOntologies.js'
import type {
  ApprovalStatus,
  CompetencyQuestion,
  ContextContract,
  ContextTest,
  EvidenceRecord,
  GuardrailPolicy,
  OperationDefinition,
  RiskTier,
  SourceBinding,
} from './types.js'

const approved: ApprovalStatus = 'APPROVED'
const publishedAt = '2026-07-27T20:00:00.000Z'
const airlineArtifact = generatedIndustryOntologyCatalog.find((artifact) => artifact.ontology.domain === 'airline')

if (!airlineArtifact) throw new Error('Generated airline ontology is unavailable.')
const airlineOntology = airlineArtifact.ontology

const dispatchScope = [
  'air_carrier',
  'aircraft',
  'airport',
  'flight',
  'dispatch_release',
  'crew_member',
  'crew_duty_record',
  'regulatory_requirement',
]

const maintenanceScope = [
  'air_carrier',
  'aircraft',
  'crew_member',
  'maintenance_record',
  'airworthiness_release',
  'safety_event',
  'regulatory_requirement',
]

const passengerScope = [
  'air_carrier',
  'airport',
  'flight',
  'passenger_journey',
  'consumer_remedy',
  'tarmac_delay_event',
  'regulatory_requirement',
]

export const airlineDispatchReleaseContract: ContextContract = contract({
  id: 'contract-airline-dispatch-release',
  name: 'Part 121 Dispatch Release Assurance',
  description: 'Decision support for a dispatcher and pilot in command assessing whether the evidence required to authorize, amend, delay, redispatch, or cancel a domestic Part 121 flight is complete. This contract never grants operational control or substitutes for certificated judgment.',
  workflow: 'dispatch_release_assurance',
  scope: dispatchScope,
  owner: 'System Operations Control',
  questions: [{
    id: 'cq-dispatch-release-ready',
    question: 'Is the flight ready for dispatcher and pilot-in-command release under the applicable Part 121 operational-control procedures?',
    expectedAnswerShape: 'Readiness outcome, unresolved blockers, fuel and weather evidence, crew-duty evidence, applicable citations, and required human authorizations.',
    impact: 'CRITICAL',
    operationId: 'airline.assess_dispatch_release',
    testIds: ['test-dispatch-required-context', 'test-dispatch-human-authority', 'test-dispatch-abstain-stale'],
  }],
  bindings: [
    binding({
      id: 'binding-airline-ops-control@1',
      sourceSystem: 'Airline Operations Control Read Model',
      operationId: 'airline.assess_dispatch_release',
      freshnessMinutes: 15,
      permission: 'airline.dispatch.read',
      schema: 'airline_dispatch_release_context_v1',
      mappings: [
        ['$.flight.flightNumber', 'flight', 'flight.flight_number', 'string'],
        ['$.flight.aircraftTailNumber', 'aircraft', 'aircraft.aircraft_tail_number', 'string'],
        ['$.release.releaseNumber', 'dispatch_release', 'dispatch_release.dispatch_release_number', 'string'],
        ['$.release.status', 'dispatch_release', 'dispatch_release.release_status', 'string'],
        ['$.crew.fitForDuty', 'crew_duty_record', 'crew_duty_record.fit_for_duty_attestation', 'boolean'],
        ['$.rules.citations', 'regulatory_requirement', 'regulatory_requirement.regulation_citations', 'string'],
      ],
      samplePayload: {
        flight: { flightNumber: 'LT121', aircraftTailNumber: 'N121LT' },
        release: { releaseNumber: 'DR-LT121-01', status: 'PENDING_AUTHORIZATION' },
        crew: { fitForDuty: true },
        rules: { citations: '14 CFR 117.25; 121.533; 121.593; 121.601; 121.639' },
      },
    }),
  ],
  operations: [operation({
    id: 'airline.assess_dispatch_release',
    label: 'Assess dispatch-release readiness',
    description: 'Assembles current operational-control, aircraft, airport, weather, fuel, release, and crew-duty evidence and identifies blockers for certificated review.',
    keywords: ['dispatch', 'release', 'flight', 'fuel', 'weather', 'notam', 'crew legality', 'operational control'],
    requiredEntityTypes: ['flight', 'aircraft', 'dispatch_release', 'crew_member', 'crew_duty_record', 'regulatory_requirement'],
    sourceBindingIds: ['binding-airline-ops-control@1'],
    riskTier: 'OPERATIONAL_ACTION',
    permission: 'airline.dispatch.read',
    schema: 'airline_dispatch_release_assessment_v1',
  })],
  policies: [policy({
    id: 'policy-dispatch-certificated-authority',
    label: 'Certificated dispatch authority',
    description: 'Requires fresh, strong evidence and explicit human approval; only the assigned aircraft dispatcher and pilot in command may exercise their regulatory authority.',
    riskTier: 'OPERATIONAL_ACTION',
    maximumEvidenceAgeMinutes: 15,
    owner: 'Director of Operations Control',
  })],
  evidence: [
    regulationEvidence('ev-14-cfr-121-533', '14 CFR 121.533 — domestic operational control', 'https://www.ecfr.gov/current/title-14/part-121/section-121.533'),
    regulationEvidence('ev-14-cfr-121-593', '14 CFR 121.593 — domestic dispatching authority', 'https://www.ecfr.gov/current/title-14/part-121/section-121.593'),
    regulationEvidence('ev-14-cfr-121-601', '14 CFR 121.601 — dispatcher information to pilot in command', 'https://www.ecfr.gov/current/title-14/part-121/section-121.601'),
    regulationEvidence('ev-14-cfr-121-639', '14 CFR 121.639 — domestic fuel supply', 'https://www.ecfr.gov/current/title-14/part-121/section-121.639'),
    regulationEvidence('ev-14-cfr-117-25', '14 CFR 117.25 — flightcrew rest period', 'https://www.ecfr.gov/current/title-14/part-117/section-117.25'),
  ],
  tests: [
    passingTest('test-dispatch-required-context', 'Requires flight, aircraft, release, crew-duty, fuel, weather, and rule context', ['airline.assess_dispatch_release']),
    passingTest('test-dispatch-human-authority', 'Never represents decision support as dispatcher or pilot authorization', ['policy-dispatch-certificated-authority']),
    passingTest('test-dispatch-abstain-stale', 'Abstains when operational evidence exceeds the 15-minute freshness limit', ['binding-airline-ops-control@1']),
  ],
})

export const airlineAirworthinessReleaseContract: ContextContract = contract({
  id: 'contract-airline-airworthiness-release',
  name: 'Aircraft Return-to-Service Assurance',
  description: 'Decision support for maintenance control reviewing whether post-maintenance records support an authorized airworthiness release or aircraft-log entry under Part 121. The contract cannot sign a release or determine airworthiness independently.',
  workflow: 'airworthiness_release_assurance',
  scope: maintenanceScope,
  owner: 'Maintenance Control',
  questions: [{
    id: 'cq-return-to-service-ready',
    question: 'Is the post-maintenance evidence complete for an authorized person to decide whether this aircraft may return to service?',
    expectedAnswerShape: 'Release-readiness outcome, open discrepancies or deferrals, inspection and signer evidence, reportability flags, applicable citations, and required human action.',
    impact: 'CRITICAL',
    operationId: 'airline.assess_airworthiness_release',
    testIds: ['test-airworthiness-required-context', 'test-airworthiness-signer-authority', 'test-service-difficulty-escalation'],
  }],
  bindings: [
    binding({
      id: 'binding-maintenance-control@1',
      sourceSystem: 'Maintenance Control Read Model',
      operationId: 'airline.assess_airworthiness_release',
      freshnessMinutes: 30,
      permission: 'airline.maintenance.read',
      schema: 'airline_airworthiness_context_v1',
      mappings: [
        ['$.aircraft.tailNumber', 'aircraft', 'aircraft.aircraft_tail_number', 'string'],
        ['$.maintenance.recordNumber', 'maintenance_record', 'maintenance_record.maintenance_record_number', 'string'],
        ['$.maintenance.discrepancy', 'maintenance_record', 'maintenance_record.discrepancy_description', 'string'],
        ['$.release.releaseNumber', 'airworthiness_release', 'airworthiness_release.airworthiness_release_number', 'string'],
        ['$.release.safeOperation', 'airworthiness_release', 'airworthiness_release.safe_operation_condition', 'boolean'],
        ['$.rules.citations', 'regulatory_requirement', 'regulatory_requirement.regulation_citations', 'string'],
      ],
      samplePayload: {
        aircraft: { tailNumber: 'N121LT' },
        maintenance: { recordNumber: 'MX-N121LT-2044', discrepancy: 'Hydraulic quantity indication fault corrected and inspected.' },
        release: { releaseNumber: 'AW-N121LT-2044', safeOperation: true },
        rules: { citations: '14 CFR 121.363; 121.367; 121.703; 121.709' },
      },
    }),
  ],
  operations: [operation({
    id: 'airline.assess_airworthiness_release',
    label: 'Assess return-to-service evidence',
    description: 'Assembles maintenance, inspection, discrepancy, deferral, authorized-signer, safety-reporting, and regulatory evidence for maintenance-control review.',
    keywords: ['airworthiness', 'maintenance', 'return to service', 'release', 'log entry', 'service difficulty', 'mel'],
    requiredEntityTypes: ['aircraft', 'maintenance_record', 'airworthiness_release', 'crew_member', 'safety_event', 'regulatory_requirement'],
    sourceBindingIds: ['binding-maintenance-control@1'],
    riskTier: 'OPERATIONAL_ACTION',
    permission: 'airline.maintenance.read',
    schema: 'airline_airworthiness_release_assessment_v1',
  })],
  policies: [policy({
    id: 'policy-authorized-maintenance-release',
    label: 'Authorized maintenance release',
    description: 'Blocks autonomous release decisions and requires an authorized certificated signer, complete inspection evidence, no known unairworthy condition, and escalation of reportable service difficulties.',
    riskTier: 'OPERATIONAL_ACTION',
    maximumEvidenceAgeMinutes: 30,
    owner: 'Chief Inspector',
  })],
  evidence: [
    regulationEvidence('ev-14-cfr-121-363', '14 CFR 121.363 — responsibility for airworthiness', 'https://www.ecfr.gov/current/title-14/part-121/section-121.363'),
    regulationEvidence('ev-14-cfr-121-367', '14 CFR 121.367 — maintenance programs', 'https://www.ecfr.gov/current/title-14/part-121/section-121.367'),
    regulationEvidence('ev-14-cfr-121-703', '14 CFR 121.703 — service difficulty reports', 'https://www.ecfr.gov/current/title-14/part-121/section-121.703'),
    regulationEvidence('ev-14-cfr-121-709', '14 CFR 121.709 — airworthiness release or aircraft-log entry', 'https://www.ecfr.gov/current/title-14/part-121/section-121.709'),
  ],
  tests: [
    passingTest('test-airworthiness-required-context', 'Requires maintenance, inspection, discrepancy, signer, and return-to-service context', ['airline.assess_airworthiness_release']),
    passingTest('test-airworthiness-signer-authority', 'Never signs or represents a release without an authorized certificated person', ['policy-authorized-maintenance-release']),
    passingTest('test-service-difficulty-escalation', 'Escalates potentially reportable failures, malfunctions, and defects', ['maintenance_record.service_difficulty_reportable']),
  ],
})

export const airlinePassengerProtectionContract: ContextContract = contract({
  id: 'contract-airline-passenger-protection',
  name: 'Passenger Disruption & Refund Assurance',
  description: 'Privacy-minimized decision support for tarmac-delay care, deplaning and reporting obligations and for airline fare, baggage-fee, and ancillary-service refund cases under current DOT rules.',
  workflow: 'passenger_disruption_assurance',
  scope: passengerScope,
  owner: 'Customer Care and Regulatory Compliance',
  questions: [
    {
      id: 'cq-tarmac-delay-obligations',
      question: 'Which passenger-care, deplaning, notification, and reporting actions are due for this tarmac delay?',
      expectedAnswerShape: 'Time-ordered obligations, threshold clocks, documented exceptions, missing evidence, reporting deadline, and applicable citations.',
      impact: 'CRITICAL',
      operationId: 'airline.assess_tarmac_delay',
      testIds: ['test-tarmac-thresholds', 'test-tarmac-exceptions', 'test-tarmac-report-deadline'],
    },
    {
      id: 'cq-refund-eligibility',
      question: 'Is this privacy-safe passenger journey eligible for an automatic refund, and what evidence and deadline apply?',
      expectedAnswerShape: 'Eligibility outcome, reason, refundable components, timing rule, accepted alternatives, missing evidence, and applicable citations.',
      impact: 'HIGH',
      operationId: 'airline.assess_refund',
      testIds: ['test-refund-significant-change', 'test-refund-prompt-timing', 'test-refund-data-minimization'],
    },
  ],
  bindings: [
    binding({
      id: 'binding-irregular-operations@1',
      sourceSystem: 'Irregular Operations Read Model',
      operationId: 'airline.assess_tarmac_delay',
      freshnessMinutes: 5,
      permission: 'airline.irrops.read',
      schema: 'airline_tarmac_delay_context_v1',
      mappings: [
        ['$.flight.flightNumber', 'flight', 'flight.flight_number', 'string'],
        ['$.delay.airportCode', 'tarmac_delay_event', 'tarmac_delay_event.tarmac_delay_airport_code', 'string'],
        ['$.delay.elapsedMinutes', 'tarmac_delay_event', 'tarmac_delay_event.tarmac_delay_minutes', 'integer'],
        ['$.delay.lavatoryOperable', 'tarmac_delay_event', 'tarmac_delay_event.lavatory_operable', 'boolean'],
        ['$.rules.citations', 'regulatory_requirement', 'regulatory_requirement.regulation_citations', 'string'],
      ],
      samplePayload: {
        flight: { flightNumber: 'LT260' },
        delay: { airportCode: 'ORD', elapsedMinutes: 95, lavatoryOperable: true },
        rules: { citations: '14 CFR 259.4' },
      },
    }),
    binding({
      id: 'binding-passenger-remedies@1',
      sourceSystem: 'Passenger Remedies Read Model',
      operationId: 'airline.assess_refund',
      freshnessMinutes: 60,
      permission: 'airline.refunds.read_minimized',
      schema: 'airline_refund_context_v1',
      mappings: [
        ['$.journey.id', 'passenger_journey', 'passenger_journey.passenger_journey_id', 'string'],
        ['$.journey.itineraryType', 'passenger_journey', 'passenger_journey.itinerary_type', 'string'],
        ['$.flight.cancelled', 'flight', 'flight.flight_cancelled', 'boolean'],
        ['$.remedy.status', 'consumer_remedy', 'consumer_remedy.refund_status', 'string'],
        ['$.remedy.amount', 'consumer_remedy', 'consumer_remedy.refund_amount', 'number'],
        ['$.rules.citations', 'regulatory_requirement', 'regulatory_requirement.regulation_citations', 'string'],
      ],
      samplePayload: {
        journey: { id: 'JOURNEY-DEMO-260', itineraryType: 'DOMESTIC' },
        flight: { cancelled: true },
        remedy: { status: 'ELIGIBLE', amount: 425.20 },
        rules: { citations: '14 CFR Part 260' },
      },
    }),
  ],
  operations: [
    operation({
      id: 'airline.assess_tarmac_delay',
      label: 'Assess tarmac-delay obligations',
      description: 'Evaluates elapsed time, flight scope, care events, notification and deplaning evidence, documented exceptions, and written-report deadlines.',
      keywords: ['tarmac', 'delay', 'deplane', 'food', 'water', 'lavatory', 'notification', 'report'],
      requiredEntityTypes: ['flight', 'airport', 'tarmac_delay_event', 'regulatory_requirement'],
      sourceBindingIds: ['binding-irregular-operations@1'],
      riskTier: 'PLANNING_DECISION',
      permission: 'airline.irrops.read',
      schema: 'airline_tarmac_delay_assessment_v1',
    }),
    operation({
      id: 'airline.assess_refund',
      label: 'Assess passenger refund eligibility',
      description: 'Evaluates cancellation or significant change, unprovided ancillary service, delayed or lost baggage, accepted alternatives, merchant of record, and prompt-refund timing.',
      keywords: ['refund', 'cancelled flight', 'significant delay', 'baggage fee', 'ancillary service', 'rebooking', 'voucher'],
      requiredEntityTypes: ['flight', 'passenger_journey', 'consumer_remedy', 'regulatory_requirement'],
      sourceBindingIds: ['binding-passenger-remedies@1'],
      riskTier: 'ANALYTICAL',
      permission: 'airline.refunds.read_minimized',
      schema: 'airline_refund_assessment_v1',
    }),
  ],
  policies: [
    policy({
      id: 'policy-tarmac-delay-response',
      label: 'Time-critical passenger care',
      description: 'Requires five-minute operational evidence, explicit exception provenance, and human approval before representing any departure from the carrier contingency plan.',
      riskTier: 'PLANNING_DECISION',
      maximumEvidenceAgeMinutes: 5,
      owner: 'Irregular Operations Compliance',
    }),
    policy({
      id: 'policy-refund-data-minimization',
      label: 'Privacy-minimized refund assessment',
      description: 'Permits analytical refund assessment only from minimized journey, service, timing, acceptance, and payment-method context; direct personal and full payment identifiers are prohibited.',
      riskTier: 'ANALYTICAL',
      maximumEvidenceAgeMinutes: 60,
      owner: 'Customer Care Compliance',
      approvalRequired: false,
    }),
  ],
  evidence: [
    regulationEvidence('ev-14-cfr-259-4', '14 CFR 259.4 — contingency plan for lengthy tarmac delays', 'https://www.ecfr.gov/current/title-14/part-259/section-259.4'),
    regulationEvidence('ev-dot-tarmac-reporting', 'DOT 2026 guidance — reporting lengthy tarmac-delay incidents', 'https://www.transportation.gov/airconsumer/tarmac-delay-reporting-2026'),
    regulationEvidence('ev-14-cfr-260', '14 CFR Part 260 — refunds for fare and ancillary-service fees', 'https://www.ecfr.gov/current/title-14/part-260'),
    regulationEvidence('ev-dot-refunds', 'DOT passenger refund guidance', 'https://www.transportation.gov/individuals/aviation-consumer-protection/refunds'),
  ],
  tests: [
    passingTest('test-tarmac-thresholds', 'Separates domestic and international deplaning thresholds and the two-hour care clock', ['airline.assess_tarmac_delay']),
    passingTest('test-tarmac-exceptions', 'Requires safety, security, or air-traffic-control provenance for an exception', ['policy-tarmac-delay-response']),
    passingTest('test-tarmac-report-deadline', 'Identifies the 30-day written-report deadline when the reporting threshold is exceeded', ['tarmac_delay_event.tarmac_delay_minutes']),
    passingTest('test-refund-significant-change', 'Evaluates cancellation and each significant-change category independently', ['airline.assess_refund']),
    passingTest('test-refund-prompt-timing', 'Separates credit-card and other-payment prompt-refund timing', ['consumer_remedy.refund_due_date']),
    passingTest('test-refund-data-minimization', 'Rejects direct personal and full payment identifiers from the assessment context', ['policy-refund-data-minimization']),
  ],
})

export const airlineExampleContracts = [
  airlineDispatchReleaseContract,
  airlineAirworthinessReleaseContract,
  airlinePassengerProtectionContract,
] as const

interface ContractInput {
  id: string
  name: string
  description: string
  workflow: string
  scope: string[]
  owner: string
  questions: Array<Omit<CompetencyQuestion, 'owner'>>
  bindings: SourceBinding[]
  operations: OperationDefinition[]
  policies: GuardrailPolicy[]
  evidence: EvidenceRecord[]
  tests: ContextTest[]
}

function contract(input: ContractInput): ContextContract {
  const scope = new Set(input.scope)
  const entityTypes = airlineOntology.entityTypes
    .filter((type) => scope.has(type.id))
    .map((type) => ({ ...structuredClone(type), approvalStatus: approved }))
  const relationshipTypes = airlineOntology.relationshipTypes
    .filter((relationship) => scope.has(relationship.sourceTypeId) && scope.has(relationship.targetTypeId))

  return {
    id: input.id,
    name: input.name,
    description: input.description,
    domain: 'airline',
    workflow: input.workflow,
    version: '1.0.0',
    releaseStatus: 'PUBLISHED',
    runtimeMode: 'REFERENCE',
    digest: `sha256:reference-${input.id}-1`,
    versions: {
      contract: `${input.id}@1.0.0`,
      semantic: 'airline@0.1.0',
      policy: `${input.id}-policies@1.0.0`,
      bindings: `${input.id}-bindings@1.0.0`,
      api: 'compile@1.0',
    },
    conceptScope: [...input.scope],
    competencyQuestions: input.questions.map((question) => ({ ...question, owner: input.owner })),
    entityTypes,
    entities: [],
    relationshipTypes,
    relationships: [],
    metrics: [],
    evidence: input.evidence,
    bindings: input.bindings,
    operations: input.operations,
    policies: input.policies,
    tests: input.tests,
    schemaLayout: Object.fromEntries(Object.entries(airlineOntology.schemaLayout).filter(([id]) => scope.has(id))),
  }
}

interface BindingInput {
  id: string
  sourceSystem: string
  operationId: string
  freshnessMinutes: number
  permission: string
  schema: string
  mappings: Array<[sourcePath: string, targetTypeId: string, targetPropertyId: string, sourceDataType: string]>
  samplePayload: Record<string, unknown>
}

function binding(input: BindingInput): SourceBinding {
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
    mappings: input.mappings.map(([sourcePath, targetTypeId, targetPropertyId, sourceDataType]) => ({
      sourcePath,
      targetTypeId,
      targetPropertyId,
      sourceDataType,
      confidence: 'EXACT',
    })),
  }
}

interface OperationInput {
  id: string
  label: string
  description: string
  keywords: string[]
  requiredEntityTypes: string[]
  sourceBindingIds: string[]
  riskTier: RiskTier
  permission: string
  schema: string
}

function operation(input: OperationInput): OperationDefinition {
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
  approvalRequired?: boolean
}): GuardrailPolicy {
  return {
    ...input,
    minimumEvidenceStrength: 'STRONG',
    approvalRequired: input.approvalRequired ?? true,
    version: '1.0.0',
    approvalStatus: approved,
  }
}

function regulationEvidence(id: string, title: string, locator: string): EvidenceRecord {
  return {
    id,
    type: 'TEMPLATE',
    title,
    source: locator.includes('transportation.gov') ? 'U.S. Department of Transportation' : 'Electronic Code of Federal Regulations',
    locator,
    checksum: `sha256:reference-${id}`,
    observedAt: publishedAt,
    validFrom: publishedAt,
    status: 'TEMPLATE_DERIVED',
  }
}

function passingTest(id: string, label: string, affectedClaimIds: string[]): ContextTest {
  return {
    id,
    type: 'AGENT',
    label,
    status: 'PASS',
    lastRun: publishedAt,
    affectedClaimIds,
  }
}
