import { counterpartyRiskContract, generatedIndustryOntologyCatalog } from '@lattice/contracts'
import { describe, expect, it } from 'vitest'
import { buildJsonExport } from './jsonExport'

describe('JSON exports', () => {
  it('exports a workspace ontology without seed-contract metadata', () => {
    const ontology = generatedIndustryOntologyCatalog.find((artifact) => artifact.ontology.domain === 'real_estate')!.ontology
    const artifact = buildJsonExport(ontology)
    const exported = JSON.parse(artifact.content) as Record<string, unknown>

    expect(artifact.filename).toBe('real-estate-ontology-0.1.0.json')
    expect(exported.id).toBe('real-estate-ontology')
    expect(exported.workspaceId).toBe('workspace-real-estate')
    expect(exported.domain).toBe('real_estate')
    expect(exported).not.toHaveProperty('workflow')
    expect(exported).not.toHaveProperty('versions')
  })

  it('preserves the complete contract document for contract-mode exports', () => {
    const artifact = buildJsonExport(counterpartyRiskContract)
    const exported = JSON.parse(artifact.content) as Record<string, unknown>

    expect(artifact.filename).toBe('contract-counterparty-risk-1.0.0.json')
    expect(exported.workflow).toBe('counterparty_exposure_assurance')
    expect(exported).toHaveProperty('versions')
  })
})
