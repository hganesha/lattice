import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const GENERATOR_VERSION = '1.0.0'

// Maps each generated entity type to a key in the studio entity-icon catalog
// (apps/studio/src/entityIcons.tsx). Keeps seeded industry ontologies on real
// icons instead of the old 2-letter codes. Unmapped ids fall back to 'box'.
const ICON_KEYS = {
  // energy
  well: 'factory', operator: 'organization', field_service_job: 'workflow', production_measurement: 'chart',
  // healthcare
  patient: 'person', provider: 'health', clinical_encounter: 'event', healthcare_claim: 'money',
  care_authorization: 'shield', diagnostic_result: 'chart', payer: 'organization',
  // manufacturing
  part_material: 'box', supplier: 'organization', purchase_order: 'clipboard', receiving_record: 'truck',
  quality_inspection: 'gauge', nonconformance: 'flag', corrective_action: 'workflow', bill_of_materials: 'layers',
  // legal
  legal_party: 'people', agreement: 'document', legal_matter: 'briefcase', court_filing: 'landmark',
  regulatory_submission: 'clipboard', statement_of_work: 'clipboard',
  // financial services
  customer_party: 'person', financial_institution: 'landmark', loan_facility: 'money', collateral: 'shield',
  guaranty: 'lock', financial_account: 'card', compliance_case: 'clipboard', payment_obligation: 'money',
  mortgage_property: 'key', credit_agreement: 'document', applicant_financial_profile: 'chart',
  regulatory_filing: 'clipboard', third_party_risk: 'gauge', merchant_profile: 'card', investment_profile: 'trend',
  // insurance
  insurance_policy: 'document', insured_party: 'person', insurance_claim: 'clipboard', loss_event: 'event',
  coverage: 'shield', insurance_organization: 'organization', claim_adjustment: 'gauge',
  // real estate
  real_property: 'organization', real_estate_party: 'people', lease: 'document', property_transaction: 'handshake',
  title_record: 'clipboard', closing: 'key', property_management: 'briefcase', rent_roll: 'chart',
  // airline
  air_carrier: 'organization', aircraft: 'plane', airport: 'airport', flight: 'route',
  dispatch_release: 'clipboard', crew_member: 'pilot', crew_duty_record: 'clock', maintenance_record: 'wrench',
  airworthiness_release: 'badgeCheck', safety_event: 'alert', passenger_journey: 'ticket', consumer_remedy: 'receipt',
  tarmac_delay_event: 'timer', dangerous_goods_shipment: 'package', regulatory_requirement: 'policy',
  // telecommunications / network virtual operator
  communications_provider: 'radioTower', wholesale_network_agreement: 'handshake', subscriber: 'person',
  customer_account: 'card', service_subscription: 'simCard', service_plan: 'tag', service_order: 'workflow',
  network_resource: 'router', service_address: 'location', telephone_number: 'smartphone', number_port_order: 'phoneForwarded',
  usage_record: 'activity', charge: 'receipt', service_quality_measurement: 'signal', network_incident: 'alert',
  emergency_service_record: 'siren', privacy_authorization: 'lock', robocall_compliance_profile: 'phoneCall',
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const schemaRoot = resolve(scriptDirectory, '../../Schemas')
const workspaceSchemaRoot = resolve(scriptDirectory, '../schemas')
const outputFile = resolve(scriptDirectory, '../packages/contracts/src/generatedIndustryOntologies.ts')
const reportFile = resolve(scriptDirectory, '../docs/generated-ontology-report.json')

const configs = {
  telecommunications: industry('Telecommunications / NVO', 'Shared telecommunications and network virtual operator semantics for subscribers, services, host-network access, numbering, service fulfillment, usage and charging, service assurance, emergency communications, privacy, and regulatory compliance.', [
    entity('communications_provider', 'Communications Provider', 'Provider Ecosystem', 'CP', 'A facilities-based carrier, mobile virtual network operator, mobile virtual network enabler, reseller, interconnected VoIP provider, or other communications service provider.', ['provider', 'carrier', 'operator', 'mvno', 'nvo', 'ocn', 'frn', 'service_provider']),
    entity('wholesale_network_agreement', 'Wholesale Network Agreement', 'Provider Ecosystem', 'WA', 'The governed commercial and technical agreement under which a virtual operator uses a host provider network, numbering, roaming, interconnection, or support capability.', ['wholesale', 'host_network', 'agreement', 'interconnection', 'roaming', 'sla', 'settlement']),
    entity('subscriber', 'Subscriber', 'Customer', 'SU', 'A privacy-minimized person or organization receiving communications service.', ['subscriber', 'customer', 'party', 'identity_verification']),
    entity('customer_account', 'Customer Account', 'Customer', 'CA', 'The governed billing and service relationship for one or more subscriptions.', ['account', 'billing_cycle', 'credit_class', 'account_status']),
    entity('service_subscription', 'Service Subscription', 'Product and Service', 'SS', 'An active or pending voice, messaging, broadband, IoT, or bundled service instance.', ['subscription', 'service_id', 'service_type', 'service_status', 'activation', 'suspension', 'termination']),
    entity('service_plan', 'Service Plan', 'Product and Service', 'SP', 'A marketed product offering with price, allowance, performance, network-management, and eligibility terms.', ['plan', 'product_offering', 'price', 'allowance', 'speed', 'latency', 'label', 'network_management']),
    entity('service_order', 'Service Order', 'Fulfillment', 'SO', 'A request to qualify, activate, modify, suspend, resume, or terminate a service.', ['service_order', 'order_action', 'order_status', 'requested_completion', 'completed_at', 'provisioning']),
    entity('network_resource', 'Network Resource', 'Network and OSS', 'NR', 'A logical or physical access, core, transport, interconnect, SIM, eSIM, device, network function, circuit, or coverage resource.', ['network_resource', 'resource_id', 'sim', 'esim', 'imsi', 'iccid', 'imei', 'network_function', 'circuit', 'cell', 'coverage', 'apn', 'slice']),
    entity('service_address', 'Service Address', 'Network and OSS', 'SA', 'A service, billing, installation, dispatchable, or emergency-service location represented at the minimum necessary precision.', ['service_address', 'address', 'location', 'rate_center', 'zip_code', 'psap', 'geographic']),
    entity('telephone_number', 'Telephone Number', 'Numbering', 'TN', 'A NANP or other governed telephone-number resource and its routing, assignment, and portability state.', ['telephone_number', 'ported_number', 'tn', 'npa_nxx', 'routing_number', 'number_status', 'lrn']),
    entity('number_port_order', 'Number Port Order', 'Numbering', 'NP', 'A port-in or port-out request, its validation data, interval classification, authorization, due date, and completion state.', ['number_port', 'port_order', 'lsr', 'port_', 'desired_due_date', 'agency_authority', 'passcode', 'foc']),
    entity('usage_record', 'Usage Record', 'Usage and Charging', 'UR', 'A privacy-minimized voice, messaging, data, roaming, or event usage record used for assurance and charging.', ['usage', 'cdr', 'session', 'call', 'message', 'data_volume', 'duration', 'roaming_usage']),
    entity('charge', 'Charge', 'Usage and Charging', 'CH', 'A rated recurring, one-time, usage, roaming, tax, fee, credit, or adjustment amount.', ['charge', 'rated_amount', 'tax', 'fee', 'credit', 'adjustment', 'currency']),
    entity('service_quality_measurement', 'Service Quality Measurement', 'Service Assurance', 'SQ', 'A measured availability, accessibility, retainability, speed, latency, packet-loss, completion, or customer-impact indicator.', ['quality', 'availability', 'accessibility', 'retainability', 'throughput', 'latency', 'packet_loss', 'completion_rate', 'user_minutes']),
    entity('network_incident', 'Network Incident', 'Service Assurance', 'NI', 'An outage, degradation, alarm, root cause, restoration action, or regulatory reporting event affecting communications services.', ['incident', 'outage', 'alarm', 'degradation', 'root_cause', 'restoration', 'nors', 'affected_service']),
    entity('emergency_service_record', 'Emergency Service Record', 'Public Safety', 'ES', 'A minimized record of 911 or text-to-911 routing, location delivery, service availability, PSAP impact, testing, or certification evidence.', ['emergency', '911', 'e911', 'text_to_911', 'psap', 'dispatchable_location', 'location_accuracy', 'bounce_back']),
    entity('privacy_authorization', 'Privacy Authorization', 'Privacy and Trust', 'PA', 'A customer authorization, authentication, access, disclosure, marketing-use, revocation, or audit record for CPNI and related protected data.', ['privacy', 'cpni', 'consent', 'approval', 'authorization', 'authentication', 'disclosure', 'marketing', 'revocation', 'access_log']),
    entity('robocall_compliance_profile', 'Robocall Compliance Profile', 'Trust and Interconnection', 'RC', 'A provider profile for caller-ID authentication, robocall mitigation, traceback response, upstream-provider diligence, and filing evidence.', ['robocall', 'stir_shaken', 'attestation', 'traceback', 'mitigation', 'rmd', 'caller_id']),
    entity('regulatory_requirement', 'Regulatory Requirement', 'Governance', 'RQ', 'A versioned FCC, state commission, numbering-administrator, public-safety, privacy, or technical requirement with applicability and deadlines.', ['regulation', 'cfr', 'fcc', 'requirement', 'compliance', 'citation', 'deadline', 'regulator']),
  ], [
    relation('provides', 'communications_provider', 'service_subscription'),
    relation('governed_by_wholesale_agreement', 'communications_provider', 'wholesale_network_agreement'),
    relation('holds', 'subscriber', 'customer_account'),
    relation('contains_subscription', 'customer_account', 'service_subscription'),
    relation('uses_plan', 'service_subscription', 'service_plan'),
    relation('fulfilled_by', 'service_subscription', 'service_order'),
    relation('uses_resource', 'service_subscription', 'network_resource'),
    relation('served_at', 'service_subscription', 'service_address'),
    relation('assigned_number', 'service_subscription', 'telephone_number'),
    relation('ported_by', 'telephone_number', 'number_port_order'),
    relation('generates_usage', 'service_subscription', 'usage_record'),
    relation('rated_as', 'usage_record', 'charge'),
    relation('measured_by', 'service_subscription', 'service_quality_measurement'),
    relation('affects_resource', 'network_incident', 'network_resource'),
    relation('degrades_service', 'network_incident', 'service_subscription'),
    relation('impacts_emergency_service', 'network_incident', 'emergency_service_record'),
    relation('emergency_record_for', 'emergency_service_record', 'service_subscription'),
    relation('authorizes_account_use', 'privacy_authorization', 'customer_account'),
    relation('provider_has_robocall_profile', 'communications_provider', 'robocall_compliance_profile'),
    relation('provider_subject_to', 'communications_provider', 'regulatory_requirement'),
    relation('port_subject_to', 'number_port_order', 'regulatory_requirement'),
    relation('incident_subject_to', 'network_incident', 'regulatory_requirement'),
    relation('privacy_subject_to', 'privacy_authorization', 'regulatory_requirement'),
    relation('emergency_service_subject_to', 'emergency_service_record', 'regulatory_requirement'),
  ]),
  airline: industry('Airline', 'Shared Part 121 airline operations, aircraft, airport, dispatch, crew, maintenance, safety, passenger-protection, security, and dangerous-goods semantics.', [
    entity('air_carrier', 'Air Carrier', 'Organizations', 'AC', 'A certificated air carrier accountable for operational control, airworthiness, safety, security, and passenger obligations.', ['air_carrier', 'carrier', 'certificate_holder', 'operator']),
    entity('aircraft', 'Aircraft', 'Fleet', 'AR', 'A governed transport aircraft, its identity, configuration, operating status, and technical condition.', ['aircraft', 'tail_number', 'registration_number', 'fleet_type', 'airframe', 'engine']),
    entity('airport', 'Airport', 'Network', 'AP', 'An origin, destination, alternate, diversion, or delay airport and its operational conditions.', ['airport', 'aerodrome', 'runway', 'gate', 'station']),
    entity('flight', 'Flight', 'Operations', 'FL', 'A scheduled or operated flight leg with route, timing, weather, fuel, weight, and operating context.', ['flight', 'origin', 'destination', 'route', 'departure', 'arrival', 'alternate', 'fuel', 'weight', 'payload', 'weather', 'notam']),
    entity('dispatch_release', 'Dispatch Release', 'Operational Control', 'DR', 'The controlled authorization record jointly used by the pilot in command and aircraft dispatcher for a Part 121 flight.', ['dispatch_release', 'release_status', 'dispatcher', 'operational_control', 'pilot_in_command', 'dispatch_authorized', 'release_amendment']),
    entity('crew_member', 'Crew Member', 'People', 'CM', 'A pilot, flight attendant, dispatcher, mechanic, or other certificated or assigned operational person.', ['crew_member', 'captain', 'first_officer', 'flight_attendant', 'dispatcher_certificate', 'mechanic']),
    entity('crew_duty_record', 'Crew Duty Record', 'People', 'CD', 'A record of assignment, flight duty period, cumulative time, rest, acclimation, and fatigue status.', ['duty', 'rest', 'fatigue', 'fit_for_duty', 'acclimated', 'sleep_opportunity', 'extension_authorization']),
    entity('maintenance_record', 'Maintenance Record', 'Airworthiness', 'MR', 'A discrepancy, inspection, maintenance action, alteration, deferral, or service-difficulty record for an aircraft.', ['maintenance', 'defect', 'discrepancy', 'corrective', 'inspection', 'mel', 'cddl', 'work_order', 'service_difficulty']),
    entity('airworthiness_release', 'Airworthiness Release', 'Airworthiness', 'AW', 'A signed airworthiness release or aircraft-log entry supporting return to service after maintenance.', ['airworthiness', 'return_to_service', 'authorized_mechanic', 'release_signature', 'release_signed', 'safe_operation', 'known_unairworthy', 'required_inspections', 'record_retain']),
    entity('safety_event', 'Safety Event', 'Safety Management', 'SE', 'A reported hazard, incident, malfunction, risk assessment, or corrective action within the carrier safety management system.', ['safety_event', 'incident', 'hazard', 'risk', 'malfunction', 'failure', 'sms', 'corrective_action', 'immediate_action']),
    entity('passenger_journey', 'Passenger Journey', 'Passenger Service', 'PJ', 'A governed itinerary, ticket, reservation, checked bag, class of service, and delivered ancillary service.', ['passenger', 'itinerary', 'ticket', 'reservation', 'checked_bag', 'ancillary', 'class_of_service', 'accessibility_feature']),
    entity('consumer_remedy', 'Consumer Remedy', 'Passenger Service', 'CR', 'A refund, rebooking, voucher, credit, notification, or other passenger remedy and its disposition.', ['refund', 'remedy', 'voucher', 'credit', 'rebooking', 'merchant_of_record', 'payment_method', 'alternative_transportation']),
    entity('tarmac_delay_event', 'Tarmac Delay Event', 'Passenger Service', 'TD', 'A ground delay with deplaning, care, notification, exception, and reporting evidence.', ['tarmac', 'deplane', 'food_water', 'lavatory', 'medical_attention', 'delay_notification']),
    entity('dangerous_goods_shipment', 'Dangerous Goods Shipment', 'Cargo and Security', 'DG', 'A cargo or dangerous-goods consignment with classification, acceptance, handling, screening, and loading controls.', ['dangerous_goods', 'hazmat', 'shipment', 'proper_shipping', 'un_number', 'packing', 'cargo', 'known_shipper', 'security_screening', 'air_waybill', 'shipper', 'acceptance_check', 'loading_position', 'pilot_notification', 'emergency_response', 'package_count', 'quantity_per_package']),
    entity('regulatory_requirement', 'Regulatory Requirement', 'Governance', 'RQ', 'A versioned FAA, DOT, TSA, NTSB, or other applicable requirement, citation, applicability rule, and reporting deadline.', ['regulation', 'cfr', 'rule', 'requirement', 'compliance', 'reporting_deadline', 'regulator']),
  ], [
    relation('operates', 'air_carrier', 'flight'),
    relation('assigned_aircraft', 'flight', 'aircraft'),
    relation('departs_from', 'flight', 'airport'),
    relation('arrives_at', 'flight', 'airport'),
    relation('authorized_by', 'flight', 'dispatch_release'),
    relation('staffed_by', 'flight', 'crew_member'),
    relation('governed_by_duty_record', 'crew_member', 'crew_duty_record'),
    relation('maintained_through', 'aircraft', 'maintenance_record'),
    relation('released_by', 'aircraft', 'airworthiness_release'),
    relation('produces_safety_event', 'flight', 'safety_event'),
    relation('carries_journey', 'flight', 'passenger_journey'),
    relation('creates_remedy', 'passenger_journey', 'consumer_remedy'),
    relation('experiences_tarmac_delay', 'flight', 'tarmac_delay_event'),
    relation('transports', 'flight', 'dangerous_goods_shipment'),
    relation('flight_subject_to', 'flight', 'regulatory_requirement'),
    relation('maintenance_subject_to', 'maintenance_record', 'regulatory_requirement'),
    relation('remedy_subject_to', 'consumer_remedy', 'regulatory_requirement'),
    relation('delay_subject_to', 'tarmac_delay_event', 'regulatory_requirement'),
    relation('shipment_subject_to', 'dangerous_goods_shipment', 'regulatory_requirement'),
  ]),
  energy: industry('Energy', 'Shared upstream, field-service, production, and well lifecycle semantics.', [
    entity('well', 'Well', 'Assets', 'WL', 'A governed well across drilling, completion, and production.', ['well', 'api_well', 'field', 'formation', 'depth', 'casing', 'hole', 'mud', 'completion', 'perforated', 'stimulation', 'choke']),
    entity('operator', 'Operator', 'Organizations', 'OP', 'An organization accountable for operating an energy asset.', ['operator', 'company_representative', 'customer_representative', 'report_preparer']),
    entity('field_service_job', 'Field Service Job', 'Operations', 'FS', 'A governed unit of field work, labor, equipment, and material.', ['ticket', 'service', 'job', 'labor', 'equipment', 'material', 'supervisor', 'contractor', 'approval']),
    entity('production_measurement', 'Production Measurement', 'Operations', 'PM', 'A dated measurement of produced volumes, inventory, sales, or downtime.', ['production', 'oil', 'gas', 'water', 'ngl', 'inventory', 'sales', 'flared', 'downtime']),
  ], [relation('operated_by', 'well', 'operator'), relation('performed_at', 'field_service_job', 'well'), relation('measures', 'production_measurement', 'well')]),
  healthcare: industry('Healthcare', 'Shared patient, provider, clinical, claims, diagnostic, payer, and authorization semantics.', [
    entity('patient', 'Patient', 'Care Participants', 'PT', 'A person receiving governed healthcare services.', ['patient', 'member']),
    entity('provider', 'Provider', 'Care Participants', 'PR', 'A practitioner or organization delivering healthcare services.', ['provider', 'npi', 'pathologist', 'facility', 'department']),
    entity('clinical_encounter', 'Clinical Encounter', 'Care Delivery', 'CE', 'A governed episode of assessment, diagnosis, treatment, or follow-up.', ['note', 'service', 'complaint', 'subjective', 'objective', 'vitals', 'bp', 'hr', 'temp', 'rr', 'spo2', 'weight', 'diagnosis', 'icd10', 'medication', 'follow_up']),
    entity('healthcare_claim', 'Healthcare Claim', 'Financial', 'HC', 'A request for payment for healthcare services.', ['claim', 'billed', 'allowed', 'paid', 'responsibility', 'denial', 'remark']),
    entity('care_authorization', 'Care Authorization', 'Controls', 'AU', 'A governed request and decision permitting healthcare services.', ['authorization', 'request', 'decision', 'expiration', 'units', 'criteria', 'appeal']),
    entity('diagnostic_result', 'Diagnostic Result', 'Diagnostics', 'DR', 'A laboratory or diagnostic observation with reference and status context.', ['report', 'collection', 'received', 'specimen', 'test', 'loinc', 'result', 'reference_range', 'critical', 'clinical_notes']),
    entity('payer', 'Payer', 'Organizations', 'PY', 'An organization or plan responsible for healthcare coverage.', ['payer', 'plan', 'group_number']),
  ], [relation('receives', 'patient', 'clinical_encounter'), relation('delivered_by', 'clinical_encounter', 'provider'), relation('billed_as', 'clinical_encounter', 'healthcare_claim'), relation('governed_by', 'clinical_encounter', 'care_authorization'), relation('covered_by', 'patient', 'payer'), relation('produces', 'clinical_encounter', 'diagnostic_result')]),
  manufacturing: industry('Manufacturing', 'Shared product, supplier, procurement, receiving, inspection, and quality semantics.', [
    entity('part_material', 'Part or Material', 'Product', 'PT', 'A governed component, material, or finished part.', ['part', 'material', 'component', 'commodity', 'lot', 'specification']),
    entity('supplier', 'Supplier', 'Organizations', 'SP', 'An organization supplying parts, material, or services.', ['supplier', 'vendor']),
    entity('purchase_order', 'Purchase Order', 'Procurement', 'PO', 'An authorized commitment to purchase goods or services.', ['purchase_order', 'po_date', 'buyer', 'ship_to', 'delivery', 'payment', 'incoterms', 'line_items', 'subtotal', 'tax', 'total']),
    entity('receiving_record', 'Receiving Record', 'Procurement', 'RR', 'A record of goods received against a purchase commitment.', ['receiving', 'receipt', 'packing_slip', 'carrier', 'received', 'shortage', 'overage', 'hold']),
    entity('quality_inspection', 'Quality Inspection', 'Quality', 'QI', 'A governed inspection of material or product characteristics.', ['inspection', 'sample', 'characteristic', 'defect', 'disposition', 'inspector']),
    entity('nonconformance', 'Nonconformance', 'Quality', 'NC', 'A deviation from an approved specification or process.', ['ncr', 'nonconformance', 'containment', 'root_cause', 'quantity_affected', 'mrb', 'closure']),
    entity('corrective_action', 'Corrective and Preventive Action', 'Quality', 'CA', 'A governed action plan that corrects causes and prevents recurrence.', ['capa', 'corrective', 'preventive', 'effectiveness', 'owner', 'target_completion']),
    entity('bill_of_materials', 'Bill of Materials', 'Product', 'BM', 'A versioned definition of components required for a parent part.', ['bom', 'revision', 'parent_part', 'engineering_change']),
  ], [relation('supplied_by', 'part_material', 'supplier'), relation('orders', 'purchase_order', 'part_material'), relation('fulfilled_by', 'purchase_order', 'receiving_record'), relation('inspects', 'quality_inspection', 'part_material'), relation('identifies', 'quality_inspection', 'nonconformance'), relation('resolved_by', 'nonconformance', 'corrective_action'), relation('defines', 'bill_of_materials', 'part_material')]),
  legal: industry('Legal', 'Shared agreement, party, matter, filing, regulatory, and statement-of-work semantics.', [
    entity('legal_party', 'Legal Party', 'Parties', 'LP', 'A person or organization participating in a legal obligation or matter.', ['party', 'client', 'vendor', 'plaintiff', 'defendant', 'attorney', 'law_firm', 'submitting_entity']),
    entity('agreement', 'Agreement', 'Contracts', 'AG', 'A governed legal agreement and its operative terms.', ['agreement', 'effective', 'expiration', 'renewal', 'amendment', 'governing_law', 'confidentiality', 'arbitration', 'obligation']),
    entity('legal_matter', 'Legal Matter', 'Disputes', 'LM', 'A governed dispute, case, or legal engagement.', ['matter', 'case', 'claim', 'motion', 'discovery', 'settlement', 'exposure']),
    entity('court_filing', 'Court Filing', 'Disputes', 'CF', 'A document formally submitted in a court proceeding.', ['filing', 'court', 'judge', 'hearing', 'jurisdiction', 'relief', 'jury', 'pages']),
    entity('regulatory_submission', 'Regulatory Submission', 'Regulatory', 'RS', 'A governed submission to a regulator and its disposition.', ['submission', 'regulator', 'review_division', 'acceptance', 'material_change']),
    entity('statement_of_work', 'Statement of Work', 'Contracts', 'SW', 'A governed definition of project scope, deliverables, price, and acceptance.', ['sow', 'project', 'deliverable', 'pricing', 'contract_value', 'payment_schedule', 'acceptance_criteria', 'change_order', 'ip_ownership']),
  ], [relation('has_party', 'agreement', 'legal_party'), relation('involves', 'legal_matter', 'legal_party'), relation('contains', 'legal_matter', 'court_filing'), relation('submitted_by', 'regulatory_submission', 'legal_party'), relation('governed_by', 'statement_of_work', 'agreement')]),
  fs: industry('Financial Services', 'Shared customer, lending, collateral, account, compliance, payment, and mortgage semantics.', [
    entity('customer_party', 'Customer Party', 'Parties', 'CP', 'A person or organization receiving financial services.', ['customer', 'applicant', 'borrower', 'subject', 'beneficial_owner', 'contact', 'tax_id', 'industry', 'naics', 'address']),
    entity('financial_institution', 'Financial Institution', 'Organizations', 'FI', 'A lender, filing institution, bank, or relationship owner.', ['lender', 'institution', 'relationship_manager', 'underwriter', 'branch', 'investigator']),
    entity('loan_facility', 'Loan or Credit Facility', 'Lending', 'LF', 'A governed extension or proposed extension of credit.', ['loan', 'facility', 'commitment', 'exposure', 'term', 'purpose', 'risk_rating', 'probability_of_default', 'dscr', 'leverage', 'liquidity', 'covenant', 'approval']),
    entity('collateral', 'Collateral', 'Lending', 'CL', 'Property or rights pledged to secure an obligation.', ['collateral', 'appraisal', 'valuation', 'lien', 'advance_rate', 'borrowing_base', 'perfection']),
    entity('guaranty', 'Guaranty', 'Lending', 'GU', 'A commitment by a guarantor to satisfy governed obligations.', ['guarantor', 'guaranty', 'guaranteed', 'liability', 'joint_and_several', 'payment_on_demand', 'waiver', 'termination']),
    entity('financial_account', 'Financial Account', 'Accounts', 'FA', 'A governed account or trust relationship.', ['account', 'trust', 'ownership', 'signature', 'signer']),
    entity('compliance_case', 'Compliance Case', 'Compliance', 'CC', 'A KYC, AML, suspicious activity, issue, or third-party risk case.', ['sar', 'kyc', 'cdd', 'suspicious', 'activity', 'compliance', 'issue', 'risk_assessment', 'policy_exception', 'law_enforcement']),
    entity('payment_obligation', 'Payment Obligation', 'Payments', 'PO', 'An invoice or payment amount owed between parties.', ['invoice', 'vendor', 'purchase_order', 'subtotal', 'tax', 'shipping', 'discount', 'total', 'due_date', 'currency']),
    entity('mortgage_property', 'Mortgage Property', 'Mortgage', 'MP', 'Real property and valuation context securing mortgage credit.', ['property', 'mortgage', 'occupancy', 'purchase_price', 'down_payment', 'ltv', 'appraised']),
    entity('credit_agreement', 'Credit Agreement', 'Lending', 'CA', 'The governed terms, covenants, pricing, defaults, and remedies of a credit arrangement.', ['agreement', 'covenant', 'maturity', 'interest', 'amortization', 'default', 'remedies', 'waiver', 'tranche', 'benchmark', 'pricing', 'prepayment', 'assignment', 'governing_law', 'reserve', 'schedule']),
    entity('applicant_financial_profile', 'Applicant Financial Profile', 'Underwriting', 'AF', 'Employment, income, debt, assets, housing, and demographic context used in underwriting.', ['coborrower', 'income', 'employer', 'employment', 'debt', 'housing', 'ethnicity', 'race', 'sex', 'years_on_job', 'self_employed', 'net_worth', 'assets', 'liabilities', 'judgment', 'bankruptcy', 'foreclosure']),
    entity('regulatory_filing', 'Regulatory Filing', 'Regulatory', 'RF', 'A governed filing, reporting package, submission, and validation record.', ['filing', 'regulator', 'reporting', 'report', 'submission', 'attestation', 'preparer', 'validation', 'reviewer', 'review_date']),
    entity('third_party_risk', 'Third Party Risk Profile', 'Risk', 'TP', 'A governed assessment of third-party criticality, controls, evidence, and remediation.', ['business_continuity', 'information_security', 'soc_report', 'criticality', 'data_access', 'outsourcing', 'subcontractor', 'control', 'evidence', 'corrective_action', 'risk_domain', 'severity']),
    entity('merchant_profile', 'Merchant Profile', 'Payments', 'MR', 'A merchant onboarding, volume, channel, and chargeback risk profile.', ['merchant', 'ticket', 'volume', 'chargeback', 'processing', 'refund', 'website', 'category', 'business_type', 'years_in_business']),
    entity('investment_profile', 'Investment Profile', 'Wealth', 'IV', 'A governed investment objective, risk, source-of-funds, and fiduciary profile.', ['investment', 'risk_tolerance', 'source_of_funds', 'retirement', 'trustee', 'beneficiary', 'fiduciary']),
  ], [relation('borrows_from', 'customer_party', 'financial_institution'), relation('obligated_under', 'customer_party', 'loan_facility'), relation('secured_by', 'loan_facility', 'collateral'), relation('supported_by', 'loan_facility', 'guaranty'), relation('holds', 'customer_party', 'financial_account'), relation('subject_of', 'customer_party', 'compliance_case'), relation('owes', 'customer_party', 'payment_obligation'), relation('secured_by_property', 'loan_facility', 'mortgage_property'), relation('governed_by', 'loan_facility', 'credit_agreement'), relation('underwritten_with', 'customer_party', 'applicant_financial_profile'), relation('reported_through', 'financial_institution', 'regulatory_filing'), relation('evaluates', 'third_party_risk', 'customer_party'), relation('onboards', 'financial_institution', 'merchant_profile'), relation('advises_with', 'customer_party', 'investment_profile')]),
  insurance: industry('Insurance', 'Shared policy, insured, claim, loss, coverage, carrier, producer, and adjustment semantics.', [
    entity('insurance_policy', 'Insurance Policy', 'Policy', 'IP', 'A governed contract of insurance and its period and terms.', ['policy', 'effective', 'expiration', 'premium', 'deductible', 'endorsement', 'cancellation']),
    entity('insured_party', 'Insured Party', 'Parties', 'IN', 'A person or organization protected by an insurance policy.', ['insured', 'applicant', 'claimant', 'certificate_holder', 'loss_payee', 'mortgagee', 'additional_insured']),
    entity('insurance_claim', 'Insurance Claim', 'Claims', 'IC', 'A request for coverage or payment following a loss.', ['claim', 'reported', 'reserve', 'paid', 'denial', 'appeal', 'documents_received', 'next_action']),
    entity('loss_event', 'Loss Event', 'Claims', 'LE', 'An occurrence that may trigger insurance coverage.', ['loss', 'cause', 'location', 'injury', 'police', 'mitigation', 'damage', 'salvage', 'subrogation']),
    entity('coverage', 'Coverage', 'Policy', 'CV', 'A governed coverage grant, limit, exclusion, or position.', ['coverage', 'limit', 'covered', 'provision', 'reservation_of_rights', 'other_insurance']),
    entity('insurance_organization', 'Insurance Organization', 'Organizations', 'IO', 'A carrier, producer, or adjusting organization.', ['carrier', 'producer', 'adjuster', 'sender']),
    entity('claim_adjustment', 'Claim Adjustment', 'Claims', 'CA', 'A governed valuation and recommended disposition of a claim.', ['adjuster', 'inspection', 'estimated', 'actual_cash_value', 'replacement_cost', 'recommended', 'payment', 'open_items']),
  ], [relation('covers', 'insurance_policy', 'insured_party'), relation('issued_by', 'insurance_policy', 'insurance_organization'), relation('governs', 'insurance_policy', 'insurance_claim'), relation('arises_from', 'insurance_claim', 'loss_event'), relation('evaluated_as', 'insurance_claim', 'claim_adjustment'), relation('contains', 'insurance_policy', 'coverage')]),
  real_estate: industry('Real Estate', 'Shared property, party, lease, transaction, title, closing, management, and rent-roll semantics.', [
    entity('real_property', 'Real Property', 'Property', 'RP', 'A governed parcel, building, premises, or unit.', ['property', 'premises', 'legal_description', 'parcel', 'county', 'state', 'unit', 'suite', 'occupancy', 'vacant']),
    entity('real_estate_party', 'Real Estate Party', 'Parties', 'RE', 'A buyer, seller, owner, tenant, landlord, manager, or settlement party.', ['buyer', 'seller', 'owner', 'tenant', 'landlord', 'manager', 'grantor', 'grantee', 'agent', 'title_company', 'insured', 'guarantor']),
    entity('lease', 'Lease', 'Leasing', 'LS', 'A governed right to occupy real property under agreed terms.', ['lease', 'rent', 'security_deposit', 'renewal', 'use_clause', 'assignment', 'subletting', 'default', 'offset']),
    entity('property_transaction', 'Property Transaction', 'Transactions', 'TX', 'A governed purchase, sale, financing, or transfer of real property.', ['purchase', 'agreement', 'earnest', 'closing_date', 'due_diligence', 'contingency', 'consideration', 'transfer_tax']),
    entity('title_record', 'Title Record', 'Title', 'TR', 'A deed, title commitment, vesting, recording, requirement, or exception.', ['deed', 'title', 'vesting', 'recording', 'commitment', 'estate', 'requirement', 'exception']),
    entity('closing', 'Closing', 'Transactions', 'CL', 'The settlement of a real estate transaction and its funds.', ['closing', 'settlement', 'cash_to_close', 'proceeds', 'proration', 'charge', 'payoff']),
    entity('property_management', 'Property Management', 'Management', 'PM', 'A governed arrangement for operating and reporting on real property.', ['management', 'manager', 'fee', 'collect_rent', 'bank_account', 'reporting', 'termination_notice']),
    entity('rent_roll', 'Rent Roll', 'Management', 'RR', 'A dated schedule of occupancy, tenants, and rent for a property.', ['rent_roll', 'tenant_entries', 'scheduled_rent', 'delinquent', 'occupied', 'vacant', 'report_preparer']),
  ], [relation('describes', 'lease', 'real_property'), relation('has_party', 'lease', 'real_estate_party'), relation('transfers', 'property_transaction', 'real_property'), relation('involves', 'property_transaction', 'real_estate_party'), relation('evidenced_by', 'real_property', 'title_record'), relation('settled_at', 'property_transaction', 'closing'), relation('managed_by', 'real_property', 'property_management'), relation('summarized_by', 'real_property', 'rent_roll')]),
}

const catalogs = new Map([
  [schemaRoot, JSON.parse(await readFile(join(schemaRoot, 'schema_catalog.json'), 'utf8'))],
  [workspaceSchemaRoot, JSON.parse(await readFile(join(workspaceSchemaRoot, 'schema_catalog.json'), 'utf8'))],
])
const generated = []
for (const [vertical, config] of Object.entries(configs)) generated.push(await generate(vertical, config))

await mkdir(dirname(outputFile), { recursive: true })
const source = `/* This file is generated by scripts/generate-industry-ontologies.mjs. Do not edit directly. */\nimport type { GeneratedIndustryOntology } from './types.js'\n\nexport const generatedIndustryOntologyCatalog: GeneratedIndustryOntology[] = ${JSON.stringify(generated, null, 2)}\n`
await writeFile(outputFile, source, 'utf8')
await writeFile(reportFile, `${JSON.stringify(generated.map(({ ontology, provenance }) => ({ industry: ontology.domain, ontologyId: ontology.id, entities: ontology.entityTypes.length, relationships: ontology.relationshipTypes.length, ...provenance.coverage, unmappedFields: provenance.unmappedFields })), null, 2)}\n`, 'utf8')
console.log(`Generated ${generated.length} industry ontologies from ${generated.reduce((sum, item) => sum + item.provenance.coverage.formCount, 0)} forms.`)

async function generate(vertical, config) {
  const sourceRoot = await schemaSourceRoot(vertical)
  const catalogVersion = catalogs.get(sourceRoot)?.schema_catalog_version ?? 'unversioned'
  const directory = join(sourceRoot, vertical)
  const formDirectories = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  const forms = []
  for (const formDirectory of formDirectories) {
    const path = join(directory, formDirectory, 'fields.json')
    try { forms.push(JSON.parse(await readFile(path, 'utf8'))) } catch (error) { if (error?.code !== 'ENOENT') throw error }
  }
  const entitySources = {}
  const propertySources = {}
  const mappedFields = new Set()
  const entityTypes = config.entities.map((definition, index) => {
    const occurrences = forms.flatMap((form) => form.fields.filter((field) => matches(field.name, definition.patterns)).map((field) => ({ field, form })))
    entitySources[definition.id] = [...new Set(occurrences.map(({ form }) => form.document_type))].sort()
    for (const { field, form } of occurrences) mappedFields.add(`${form.document_type}:${field.name}`)
    const grouped = Map.groupBy(occurrences, ({ field }) => field.name)
    const properties = [...grouped.entries()].map(([name, values]) => {
      const propertyId = `${definition.id}.${name}`
      propertySources[propertyId] = [...new Set(values.map(({ form }) => form.document_type))].sort()
      const exemplar = values.find(({ field }) => field.description?.trim())?.field ?? values[0].field
      return {
        id: propertyId,
        name: titleCase(name),
        dataType: dataType(exemplar.type),
        description: exemplar.description?.trim() || `${titleCase(name)} derived from industry forms.`,
        required: values.every(({ field }) => field.required === true),
        identifier: identifier(name),
        _frequency: values.length,
      }
    }).sort((left, right) => Number(right.required) - Number(left.required) || right._frequency - left._frequency || left.id.localeCompare(right.id)).slice(0, 40).map(({ _frequency, ...property }) => property)
    return { id: definition.id, label: definition.label, description: definition.description, group: definition.group, icon: ICON_KEYS[definition.id] ?? 'box', properties, evidenceStatus: 'TEMPLATE_DERIVED', approvalStatus: 'DRAFT', impact: 'HIGH' }
  }).filter((type) => type.properties.length > 0)
  const typeIds = new Set(entityTypes.map((type) => type.id))
  const relationshipTypes = config.relations.filter((item) => typeIds.has(item.sourceTypeId) && typeIds.has(item.targetTypeId)).map((item) => ({ ...item, label: item.id.toLocaleUpperCase(), cardinality: 'MANY_TO_MANY', description: `${titleCase(item.sourceTypeId)} ${item.id.replaceAll('_', ' ')} ${titleCase(item.targetTypeId)}.`, impact: 'HIGH' }))
  const semantic = { entityTypes, relationshipTypes }
  const digest = `sha256:${createHash('sha256').update(JSON.stringify(semantic)).digest('hex')}`
  const sourceFieldCount = forms.reduce((sum, form) => sum + form.fields.length, 0)
  const ontologyDomain = vertical === 'fs' ? 'financial_services' : vertical
  const ontologySlug = ontologyDomain.replaceAll('_', '-')
  const ontology = { id: `${ontologySlug}-ontology`, workspaceId: `workspace-${ontologySlug}`, name: `${config.name} Ontology`, description: config.description, domain: ontologyDomain, version: '0.1.0', digest, releaseStatus: 'UNPUBLISHED', entityTypes, relationshipTypes, schemaLayout: Object.fromEntries(entityTypes.map((type, index) => [type.id, { x: 70 + (index % 3) * 285, y: 50 + Math.floor(index / 3) * 145 }])) }
  const unmappedFields = [...new Set(forms.flatMap((form) => form.fields.filter((field) => !mappedFields.has(`${form.document_type}:${field.name}`)).map((field) => field.name)))].sort()
  return { ontology, provenance: { generatorVersion: GENERATOR_VERSION, sourceSchemaCatalogVersion: catalogVersion, sourceForms: forms.map((form) => ({ documentType: form.document_type, family: form.family, schemaVersion: form.schema_version, fieldCount: form.fields.length })), entitySources, propertySources, unmappedFields, coverage: { formCount: forms.length, sourceFieldCount, mappedFieldCount: mappedFields.size, unmappedFieldCount: sourceFieldCount - mappedFields.size, mappedPercent: sourceFieldCount === 0 ? 0 : Math.round(mappedFields.size / sourceFieldCount * 1000) / 10 } } }
}

async function schemaSourceRoot(vertical) {
  for (const root of [workspaceSchemaRoot, schemaRoot]) {
    try {
      await readdir(join(root, vertical))
      return root
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  throw new Error(`No schema source directory found for ${vertical}`)
}

function industry(name, description, entities, relations) { return { name, description, entities, relations } }
function entity(id, label, group, icon, description, patterns) { return { id, label, group, icon, description, patterns } }
function relation(id, sourceTypeId, targetTypeId) { return { id, sourceTypeId, targetTypeId } }
function matches(name, patterns) { return patterns.some((pattern) => name === pattern || name.startsWith(`${pattern}_`) || name.endsWith(`_${pattern}`) || name.includes(`_${pattern}_`)) }
function identifier(name) { return /(^|_)(id|number|npi|mrn|reference)$/.test(name) || /_(id|number|npi|mrn|reference)$/.test(name) }
function dataType(type) { if (type === 'number') return 'decimal'; if (type === 'integer') return 'integer'; if (type === 'boolean') return 'boolean'; if (type === 'date') return 'date'; return 'string' }
function titleCase(value) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase()) }
