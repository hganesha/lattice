import { generatedIndustryOntologyCatalog } from './generatedIndustryOntologies.js'
import type {
  ContextContract,
  EntityRecord,
  EntityTypeDefinition,
  RelationshipAssertion,
  RelationshipTypeDefinition,
} from './types.js'

/**
 * Fully-seeded airline demo contract — the airline counterpart to `counterpartyRiskContract`.
 *
 * The three `airlineExampleContracts` are REFERENCE contracts: they carry no entity instances and
 * materialize a single synthetic world from their sample payloads at compile time. That is enough
 * to demonstrate a simulated read, but it cannot back a gold case set (the evaluation endpoint
 * compiles the registry draft without materializing it) and it can only ever produce one entity
 * per type, so it can never exercise entity ambiguity.
 *
 * This contract instead seeds a real, hand-authored world — two flights that share the bare
 * `LT121` designator so the stem is genuinely ambiguous, one governed dispatch release, crew,
 * duty record, and the Part 121 rule set — with a fixed evidence observation time so the freshness
 * boundary is testable. Its single operation is OPERATIONAL_ACTION and its governing policy
 * requires a human approval, so a ready flight compiles to an approval gate, never to a silent
 * authorization: the contract is decision support, never operational control.
 */

const approved = 'APPROVED' as const

const airlineArtifact = generatedIndustryOntologyCatalog.find((artifact) => artifact.ontology.domain === 'airline')
if (!airlineArtifact) throw new Error('Generated airline ontology is unavailable.')
const airlineOntology = airlineArtifact.ontology

/**
 * Entity types this contract governs. Drawn from the shared airline ontology and filtered to the
 * dispatch-release scope so the graph stays legible.
 */
const dispatchScope = [
  'air_carrier',
  'aircraft',
  'airport',
  'flight',
  'dispatch_release',
  'crew_member',
  'crew_duty_record',
  'regulatory_requirement',
] as const

const scope = new Set<string>(dispatchScope)

const entityTypes: EntityTypeDefinition[] = airlineOntology.entityTypes
  .filter((type) => scope.has(type.id))
  .map((type) => ({ ...structuredClone(type), approvalStatus: approved }))

const relationshipTypes: RelationshipTypeDefinition[] = airlineOntology.relationshipTypes
  .filter((relationship) => scope.has(relationship.sourceTypeId) && scope.has(relationship.targetTypeId))
  .map((relationship) => structuredClone(relationship))

const schemaLayout = Object.fromEntries(
  Object.entries(airlineOntology.schemaLayout).filter(([id]) => scope.has(id)),
)

/**
 * When the operations-control read model was observed. Every seeded entity references this single
 * governed observation, so the freshness window is anchored to one timestamp: a question asked
 * within 15 minutes of it resolves, and one asked later abstains.
 */
export const airlineDispatchObservedAt = '2026-07-27T20:00:00.000Z'

const opsEvidence = ['ev-airline-ops-read']

function airEntity(
  id: string,
  typeId: string,
  label: string,
  aliases: string[],
  properties: EntityRecord['properties'],
  evidenceStrength: EntityRecord['evidenceStrength'] = 'STRONG',
): EntityRecord {
  return { id, typeId, label, aliases, properties, evidenceRefs: opsEvidence, evidenceStrength, validFrom: airlineDispatchObservedAt }
}

/*
 * FLT-LT121-N121LT and FLT-LT121-N272LT both operate as "LT121": the first is today's departure,
 * the second is the prior day's delayed operation still open in the system. The bare designator is
 * therefore ambiguous, while "LT121 tail N121LT" resolves to exactly one. Only FLT-LT121-N121LT
 * carries the downstream dispatch, crew, and rule relationships, so it is the one that assembles a
 * complete readiness picture.
 */
const entities: EntityRecord[] = [
  airEntity('AC-LATTICE', 'air_carrier', 'Lattice Air', ['Lattice Airlines', 'LT'], { air_carrier_name: 'Lattice Air', certificate_holder_number: 'LTA-0121', marketing_carrier_name: 'Lattice Air' }, 'EXACT'),
  airEntity('ACFT-N121LT', 'aircraft', 'N121LT', ['tail N121LT', 'ship 121'], { aircraft_tail_number: 'N121LT', aircraft_type: 'A320', airframe_total_hours: 21840 }, 'EXACT'),
  airEntity('ACFT-N272LT', 'aircraft', 'N272LT', ['tail N272LT', 'ship 272'], { aircraft_tail_number: 'N272LT', aircraft_type: 'A320' }, 'EXACT'),
  airEntity('APT-KSEA', 'airport', 'KSEA', ['Seattle-Tacoma', 'SEA'], { airport_code: 'KSEA', origin_airport_code: 'KSEA' }, 'EXACT'),
  airEntity('APT-KSFO', 'airport', 'KSFO', ['San Francisco', 'SFO'], { airport_code: 'KSFO', destination_airport_code: 'KSFO' }, 'EXACT'),
  airEntity('FLT-LT121-N121LT', 'flight', 'LT121', ['LT121 tail N121LT', 'Lattice Air 121 tail N121LT'], { flight_number: 'LT121', origin_airport_code: 'KSEA', destination_airport_code: 'KSFO', planned_fuel_quantity: 19800, reserve_fuel_minutes: 45, flight_cancelled: false }, 'EXACT'),
  airEntity('FLT-LT121-N272LT', 'flight', 'LT121', ['LT121 tail N272LT', 'Lattice Air 121 tail N272LT'], { flight_number: 'LT121', origin_airport_code: 'KSEA', destination_airport_code: 'KSFO', flight_cancelled: false }, 'EXACT'),
  airEntity('DR-LT121-01', 'dispatch_release', 'DR-LT121-01', ['dispatch release DR-LT121-01'], { dispatch_release_number: 'DR-LT121-01', release_status: 'PENDING_AUTHORIZATION', dispatcher_name: 'A. Rivera', dispatcher_certificate_number: 'ADX-4471', pilot_in_command_name: 'J. Okafor' }, 'EXACT'),
  airEntity('CRW-PIC-887', 'crew_member', 'Capt. J. Okafor', ['pilot in command Okafor', 'PIC-887'], { crew_member_id: 'PIC-887', crew_member_name: 'J. Okafor', crew_member_role: 'PIC' }, 'EXACT'),
  airEntity('CDR-PIC-887', 'crew_duty_record', 'Duty record PIC-887', ['crew duty record PIC-887'], { fit_for_duty_attestation: true, flight_duty_period_minutes: 540, rest_minutes: 660, fatigue_reported: false }, 'EXACT'),
  airEntity('REG-PART121-DISPATCH', 'regulatory_requirement', 'Part 121 dispatch requirements', ['14 CFR Part 121 subparts T and U'], { regulation_citations: '14 CFR 121.533; 121.593; 121.601; 121.639; 117.25', compliance_status: 'EVIDENCE_COMPLETE', regulator_name: 'FAA' }, 'EXACT'),
]

function rel(id: string, typeId: string, sourceEntityId: string, targetEntityId: string, assertionClass: RelationshipAssertion['assertionClass'] = 'ASSERTED'): RelationshipAssertion {
  return { id, typeId, sourceEntityId, targetEntityId, assertionClass, evidenceRefs: opsEvidence, approvalStatus: approved, validFrom: airlineDispatchObservedAt }
}

const relationships: RelationshipAssertion[] = [
  rel('rel-air-1', 'operates', 'AC-LATTICE', 'FLT-LT121-N121LT'),
  rel('rel-air-2', 'operates', 'AC-LATTICE', 'FLT-LT121-N272LT'),
  rel('rel-air-3', 'assigned_aircraft', 'FLT-LT121-N121LT', 'ACFT-N121LT'),
  rel('rel-air-4', 'assigned_aircraft', 'FLT-LT121-N272LT', 'ACFT-N272LT'),
  rel('rel-air-5', 'departs_from', 'FLT-LT121-N121LT', 'APT-KSEA'),
  rel('rel-air-6', 'arrives_at', 'FLT-LT121-N121LT', 'APT-KSFO'),
  rel('rel-air-7', 'authorized_by', 'FLT-LT121-N121LT', 'DR-LT121-01'),
  rel('rel-air-8', 'staffed_by', 'FLT-LT121-N121LT', 'CRW-PIC-887'),
  rel('rel-air-9', 'governed_by_duty_record', 'CRW-PIC-887', 'CDR-PIC-887'),
  rel('rel-air-10', 'flight_subject_to', 'FLT-LT121-N121LT', 'REG-PART121-DISPATCH', 'DERIVED'),
]

export const airlineDispatchOperationId = 'airline.assess_dispatch_release_demo'
export const airlineDispatchPolicyId = 'policy-airline-dispatch-authority'

/**
 * A read-only source binding over the shared Postgres demo schema (`lattice_demo`). It is keyed on
 * the flight designator the operations-control system recognizes, not on Lattice's own entity id,
 * and runs as a live connector read. When `LATTICE_DEMO_POSTGRES_URL` is unset the compile path is
 * unaffected — only `/execute` reaches the database — so evaluation and the Studio work offline.
 *
 * The declared endpoint carries host and port only; the credential (host, port, database, and the
 * secret) is resolved from the environment reference, and `validatePostgresScope` pins the binding
 * to that one database. Set the endpoint host to your Supabase host to enable live execution.
 */
const dispatchBinding: ContextContract['bindings'][number] = {
  id: 'binding-airline-dispatch-demo@1',
  scope: 'CONTRACT',
  sourceSystem: 'Airline Operations Control (demo)',
  operationId: airlineDispatchOperationId,
  environment: 'demo',
  freshnessMinutes: 15,
  requiredPermissions: ['airline.dispatch.read'],
  expectedResultSchema: 'airline_dispatch_release_context_v1',
  version: '1.0.0',
  approvalStatus: approved,
  adapterType: 'DATABASE',
  executionMode: 'CONNECTOR',
  endpoint: 'postgres://db.replace-with-supabase-ref.supabase.co:5432',
  method: 'READ',
  healthStatus: 'NOT_TESTED',
  connector: {
    provider: 'POSTGRESQL',
    transport: 'POSTGRES_WIRE',
    credentialRef: 'env:LATTICE_DEMO_POSTGRES_URL',
    resource: { database: 'postgres', schema: 'lattice_demo', object: 'dispatch_release_context' },
    queryTemplate: 'SELECT flight_number, aircraft_tail_number, release_number, release_status, fit_for_duty, planned_fuel_kg, reserve_fuel_minutes, weather_summary, notam_summary, regulation_citations, observed_at FROM lattice_demo.dispatch_release_context WHERE flight_number = $1',
    parameterStyle: 'POSITIONAL',
    parameterOrder: ['flight_number'],
    readOnly: true,
    maximumRows: 50,
  },
  parameters: [
    { name: 'flight_number', targetTypeId: 'flight', targetPropertyId: 'flight.flight_number' },
  ],
  mappings: [
    { sourcePath: '$.flight_number', targetTypeId: 'flight', targetPropertyId: 'flight.flight_number', sourceDataType: 'string', confidence: 'EXACT' },
    { sourcePath: '$.aircraft_tail_number', targetTypeId: 'aircraft', targetPropertyId: 'aircraft.aircraft_tail_number', sourceDataType: 'string', confidence: 'EXACT' },
    { sourcePath: '$.release_status', targetTypeId: 'dispatch_release', targetPropertyId: 'dispatch_release.release_status', sourceDataType: 'string', confidence: 'EXACT' },
    { sourcePath: '$.fit_for_duty', targetTypeId: 'crew_duty_record', targetPropertyId: 'crew_duty_record.fit_for_duty_attestation', sourceDataType: 'boolean', confidence: 'EXACT' },
    { sourcePath: '$.regulation_citations', targetTypeId: 'regulatory_requirement', targetPropertyId: 'regulatory_requirement.regulation_citations', sourceDataType: 'string', confidence: 'EXACT' },
  ],
}

export const airlineDispatchDemoContract: ContextContract = {
  id: 'contract-airline-dispatch',
  name: 'Part 121 Dispatch Release Assurance (Demo)',
  description: 'Fully-seeded decision support for a dispatcher and pilot in command assessing whether the evidence required to authorize, amend, delay, redispatch, or cancel a domestic Part 121 flight is complete. This contract never grants operational control or substitutes for certificated judgment.',
  domain: 'airline',
  workflow: 'dispatch_release_assurance',
  version: '1.0.0',
  releaseStatus: 'PUBLISHED',
  runtimeMode: 'LIVE',
  digest: 'sha256:dev-airline-dispatch-contract-1',
  versions: {
    contract: 'airline-dispatch@1.0.0',
    semantic: 'airline@0.1.0',
    policy: 'airline-dispatch-policy@1.0.0',
    bindings: 'airline-dispatch-bindings@1.0.0',
    api: 'compile@1.0',
  },
  conceptScope: [...dispatchScope],
  competencyQuestions: [
    {
      id: 'cq-airline-dispatch-ready',
      question: 'Is flight LT121 on tail N121LT ready for dispatcher and pilot-in-command release under the applicable Part 121 operational-control procedures?',
      expectedAnswerShape: 'Readiness outcome, unresolved blockers, fuel and weather evidence, crew-duty evidence, applicable citations, and the required human authorization.',
      impact: 'CRITICAL',
      owner: 'System Operations Control',
      testIds: ['test-airline-dispatch-required-context', 'test-airline-dispatch-human-authority', 'test-airline-dispatch-abstain-stale'],
      operationId: airlineDispatchOperationId,
    },
  ],
  entityTypes,
  entities,
  relationshipTypes,
  relationships,
  metrics: [],
  evidence: [
    { id: 'ev-airline-ops-read', type: 'DATA_BINDING', title: 'Operations control read model', source: 'Airline Operations Control (demo)', locator: 'lattice_demo.dispatch_release_context', checksum: 'sha256:airline-ops-read', observedAt: airlineDispatchObservedAt, validFrom: airlineDispatchObservedAt, status: 'DIRECTLY_EVIDENCED' },
    { id: 'ev-14-cfr-121-533', type: 'TEMPLATE', title: '14 CFR 121.533 — domestic operational control', source: 'Electronic Code of Federal Regulations', locator: 'https://www.ecfr.gov/current/title-14/part-121/section-121.533', checksum: 'sha256:reference-ev-14-cfr-121-533', observedAt: airlineDispatchObservedAt, validFrom: airlineDispatchObservedAt, status: 'TEMPLATE_DERIVED' },
    { id: 'ev-14-cfr-121-639', type: 'TEMPLATE', title: '14 CFR 121.639 — domestic fuel supply', source: 'Electronic Code of Federal Regulations', locator: 'https://www.ecfr.gov/current/title-14/part-121/section-121.639', checksum: 'sha256:reference-ev-14-cfr-121-639', observedAt: airlineDispatchObservedAt, validFrom: airlineDispatchObservedAt, status: 'TEMPLATE_DERIVED' },
    { id: 'ev-14-cfr-117-25', type: 'TEMPLATE', title: '14 CFR 117.25 — flightcrew rest period', source: 'Electronic Code of Federal Regulations', locator: 'https://www.ecfr.gov/current/title-14/part-117/section-117.25', checksum: 'sha256:reference-ev-14-cfr-117-25', observedAt: airlineDispatchObservedAt, validFrom: airlineDispatchObservedAt, status: 'TEMPLATE_DERIVED' },
  ],
  bindings: [dispatchBinding],
  operations: [
    {
      id: airlineDispatchOperationId,
      label: 'Assess dispatch-release readiness',
      description: 'Assembles current operational-control, aircraft, airport, weather, fuel, release, and crew-duty evidence and identifies blockers for certificated review. Never authorizes the flight.',
      keywords: ['dispatch', 'release', 'flight', 'fuel', 'weather', 'notam', 'crew legality', 'operational control'],
      requiredEntityTypes: ['flight', 'aircraft', 'dispatch_release', 'crew_member', 'crew_duty_record', 'regulatory_requirement'],
      metricIds: [],
      relationshipPath: ['operates', 'assigned_aircraft', 'authorized_by', 'staffed_by', 'governed_by_duty_record', 'flight_subject_to'],
      sourceBindingIds: ['binding-airline-dispatch-demo@1'],
      riskTier: 'OPERATIONAL_ACTION',
      requiredPermissions: ['airline.dispatch.read'],
      expectedResultSchema: 'airline_dispatch_release_assessment_v1',
    },
  ],
  purposes: [
    { id: 'situational_awareness', label: 'Situational awareness', description: 'Read governed dispatch context to understand the current state. No action is taken from the answer.', audience: 'INTERNAL', reversibility: 'REVERSIBLE', baseRiskTier: 'INFORMATIONAL', retentionDays: 30 },
    { id: 'flight_readiness_review', label: 'Flight readiness review', description: 'Assemble the governed evidence a dispatcher and pilot in command weigh before a release decision.', audience: 'INTERNAL', reversibility: 'PARTIALLY_REVERSIBLE', baseRiskTier: 'ANALYTICAL', retentionDays: 90 },
    { id: 'dispatch_release_decision', label: 'Dispatch release decision', description: 'Support the certificated decision to authorize, amend, delay, redispatch, or cancel a Part 121 flight. The decision itself remains with the dispatcher and pilot in command.', audience: 'INTERNAL', reversibility: 'PARTIALLY_REVERSIBLE', baseRiskTier: 'OPERATIONAL_ACTION', obligations: ['Record the release disposition and its evidence against the flight.'], jurisdictions: ['US'], retentionDays: 1825 },
  ],
  policies: [
    { id: airlineDispatchPolicyId, label: 'Certificated dispatch authority', description: 'Requires fresh, strong evidence and an explicit human approval; only the assigned aircraft dispatcher and pilot in command may exercise their regulatory authority.', riskTier: 'OPERATIONAL_ACTION', minimumEvidenceStrength: 'STRONG', maximumEvidenceAgeMinutes: 15, approvalRequired: true, version: '1.0.0', owner: 'Director of Operations Control', approvalStatus: approved, purposeRequired: false, permittedPurposeIds: ['situational_awareness', 'flight_readiness_review', 'dispatch_release_decision'] },
  ],
  tests: [
    { id: 'test-airline-dispatch-required-context', type: 'QUESTION', label: 'Requires flight, aircraft, release, crew-duty, fuel, weather, and rule context.', status: 'PASS', lastRun: airlineDispatchObservedAt, affectedClaimIds: [airlineDispatchOperationId] },
    { id: 'test-airline-dispatch-human-authority', type: 'ABSTENTION', label: 'Never represents decision support as dispatcher or pilot authorization.', status: 'PASS', lastRun: airlineDispatchObservedAt, affectedClaimIds: [airlineDispatchPolicyId] },
    { id: 'test-airline-dispatch-abstain-stale', type: 'MAPPING', label: 'Abstains when operational evidence exceeds the 15-minute freshness limit.', status: 'PASS', lastRun: airlineDispatchObservedAt, affectedClaimIds: ['binding-airline-dispatch-demo@1'] },
  ],
  schemaLayout,
}
