import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const GENERATOR_VERSION = '1.0.0'
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const schemaRoot = resolve(scriptDirectory, '../../Schemas')
const outputFile = resolve(scriptDirectory, '../packages/contracts/src/generatedIndustryOntologies.ts')
const reportFile = resolve(scriptDirectory, '../docs/generated-ontology-report.json')

const configs = {
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

const catalog = JSON.parse(await readFile(join(schemaRoot, 'schema_catalog.json'), 'utf8'))
const generated = []
for (const [vertical, config] of Object.entries(configs)) generated.push(await generate(vertical, config, catalog.schema_catalog_version))

await mkdir(dirname(outputFile), { recursive: true })
const source = `/* This file is generated by scripts/generate-industry-ontologies.mjs. Do not edit directly. */\nimport type { GeneratedIndustryOntology } from './types.js'\n\nexport const generatedIndustryOntologyCatalog: GeneratedIndustryOntology[] = ${JSON.stringify(generated, null, 2)}\n`
await writeFile(outputFile, source, 'utf8')
await writeFile(reportFile, `${JSON.stringify(generated.map(({ ontology, provenance }) => ({ industry: ontology.domain, ontologyId: ontology.id, entities: ontology.entityTypes.length, relationships: ontology.relationshipTypes.length, ...provenance.coverage, unmappedFields: provenance.unmappedFields })), null, 2)}\n`, 'utf8')
console.log(`Generated ${generated.length} industry ontologies from ${generated.reduce((sum, item) => sum + item.provenance.coverage.formCount, 0)} forms.`)

async function generate(vertical, config, catalogVersion) {
  const directory = join(schemaRoot, vertical)
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
    return { id: definition.id, label: definition.label, description: definition.description, group: definition.group, icon: definition.icon, properties, evidenceStatus: 'TEMPLATE_DERIVED', approvalStatus: 'DRAFT', impact: 'HIGH' }
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

function industry(name, description, entities, relations) { return { name, description, entities, relations } }
function entity(id, label, group, icon, description, patterns) { return { id, label, group, icon, description, patterns } }
function relation(id, sourceTypeId, targetTypeId) { return { id, sourceTypeId, targetTypeId } }
function matches(name, patterns) { return patterns.some((pattern) => name === pattern || name.startsWith(`${pattern}_`) || name.endsWith(`_${pattern}`) || name.includes(`_${pattern}_`)) }
function identifier(name) { return /(^|_)(id|number|npi|mrn|reference)$/.test(name) || /_(id|number|npi|mrn|reference)$/.test(name) }
function dataType(type) { if (type === 'number') return 'decimal'; if (type === 'integer') return 'integer'; if (type === 'boolean') return 'boolean'; if (type === 'date') return 'date'; return 'string' }
function titleCase(value) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase()) }
