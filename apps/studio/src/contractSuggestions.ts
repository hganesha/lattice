import type { SelectOrCreateOption } from './SelectOrCreateField'

interface ContractSuggestions {
  workflows: SelectOrCreateOption[]
  owners: SelectOrCreateOption[]
}

const suggestions: Record<string, ContractSuggestions> = {
  healthcare: catalog(
    ['care_authorization', 'clinical_eligibility', 'claims_review', 'patient_flow'],
    ['Clinical Policy', 'Care Management', 'Revenue Cycle', 'Clinical Operations'],
  ),
  energy: catalog(
    ['outage_prioritization', 'field_dispatch', 'restoration_planning', 'asset_maintenance'],
    ['Grid Operations', 'Field Operations', 'Reliability Engineering', 'Asset Management'],
  ),
  real_estate: catalog(
    ['lease_administration', 'property_acquisition', 'title_review', 'property_management'],
    ['Property Operations', 'Leasing', 'Transactions', 'Portfolio Management'],
  ),
  financial_services: catalog(
    ['counterparty_risk', 'credit_approval', 'collateral_management', 'regulatory_reporting'],
    ['Risk Management', 'Credit Risk', 'Treasury', 'Regulatory Compliance'],
  ),
  insurance: catalog(
    ['underwriting', 'claims_adjudication', 'policy_servicing', 'fraud_review'],
    ['Underwriting', 'Claims Operations', 'Policy Administration', 'Special Investigations'],
  ),
  legal: catalog(
    ['matter_intake', 'contract_review', 'litigation_management', 'regulatory_analysis'],
    ['Legal Operations', 'Commercial Legal', 'Litigation', 'Regulatory Counsel'],
  ),
  manufacturing: catalog(
    ['production_planning', 'quality_control', 'maintenance_planning', 'supplier_management'],
    ['Plant Operations', 'Quality Engineering', 'Maintenance', 'Supply Management'],
  ),
  core: catalog(
    ['policy_governance', 'case_management', 'approval_routing', 'portfolio_review'],
    ['Operations', 'Risk and Compliance', 'Data Governance', 'Program Management'],
  ),
}

export function contractSuggestionsFor(domain: string): ContractSuggestions {
  return suggestions[normalize(domain)] ?? suggestions.core!
}

function catalog(workflows: string[], owners: string[]): ContractSuggestions {
  return {
    workflows: workflows.map((value) => ({ value, label: humanize(value) })),
    owners: owners.map((value) => ({ value, label: value })),
  }
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function humanize(value: string): string {
  const words = value.replaceAll('_', ' ')
  return words.charAt(0).toLocaleUpperCase() + words.slice(1)
}
