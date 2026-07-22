import { counterpartyRiskContract, generatedIndustryOntologyCatalog } from '@lattice/contracts'
import { describe, expect, it } from 'vitest'
import { buildJsonExport } from './jsonExport'

describe('JSON exports', () => {
  it('exports a workspace ontology with safe binding references but without sample payloads', () => {
    const ontology = structuredClone(generatedIndustryOntologyCatalog.find((artifact) => artifact.ontology.domain === 'real_estate')!.ontology)
    ontology.bindings = [{
      ...counterpartyRiskContract.bindings[0]!,
      scope: 'ONTOLOGY',
      ontologyId: ontology.id,
      connector: {
        provider: 'POSTGRESQL',
        transport: 'POSTGRES_WIRE',
        credentialRef: 'vault:real-estate/reporting-reader',
        resource: { database: 'property', schema: 'governed', object: 'assets' },
        readOnly: true,
      },
      samplePayload: { assetId: 'asset-42' },
    }]
    const artifact = buildJsonExport(ontology)
    const exported = JSON.parse(artifact.content) as Record<string, unknown> & {
      bindings: Array<{ connector: { credentialRef: string }, samplePayload?: unknown }>
    }
    const exportedBinding = exported.bindings[0]!

    expect(artifact.filename).toBe('real-estate-ontology-0.1.0.json')
    expect(exported.id).toBe('real-estate-ontology')
    expect(exported.workspaceId).toBe('workspace-real-estate')
    expect(exported.domain).toBe('real_estate')
    expect(exported).not.toHaveProperty('workflow')
    expect(exported).not.toHaveProperty('versions')
    expect(exportedBinding.connector.credentialRef).toBe('vault:real-estate/reporting-reader')
    expect(exportedBinding).not.toHaveProperty('samplePayload')
  })

  it('preserves governed contract bindings while removing embedded credentials', () => {
    const contract = structuredClone(counterpartyRiskContract)
    contract.bindings[0] = {
      ...contract.bindings[0]!,
      endpoint: 'postgresql://reader:super-secret@db.example.internal:5432/governed?access_token=token-value&sslmode=require#private',
      connector: {
        provider: 'POSTGRESQL',
        transport: 'POSTGRES_WIRE',
        credentialRef: 'literal-secret-token',
        resource: { database: 'governed', schema: 'risk', object: 'positions' },
        readOnly: true,
      },
      samplePayload: { password: 'payload-secret', positionId: 'position-42' },
    }
    const artifact = buildJsonExport(contract)
    const exported = JSON.parse(artifact.content) as Record<string, unknown> & {
      bindings: Array<{ endpoint: string, connector: { credentialRef: string }, samplePayload?: unknown }>
    }
    const exportedBinding = exported.bindings[0]!
    const endpoint = new URL(exportedBinding.endpoint)

    expect(artifact.filename).toBe('contract-counterparty-risk-1.0.0.json')
    expect(exported.workflow).toBe('counterparty_exposure_assurance')
    expect(exported).toHaveProperty('versions')
    expect(exportedBinding.connector.credentialRef).toBe('[REDACTED]')
    expect(exportedBinding).not.toHaveProperty('samplePayload')
    expect(endpoint.username).toBe('')
    expect(endpoint.password).toBe('')
    expect(endpoint.hash).toBe('')
    expect(endpoint.searchParams.get('access_token')).toBe('[REDACTED]')
    expect(artifact.content).not.toContain('super-secret')
    expect(artifact.content).not.toContain('token-value')
    expect(artifact.content).not.toContain('payload-secret')
  })

  it('redacts sensitive fields recursively from every portable JSON export', () => {
    const document = {
      id: 'secret-boundary',
      version: '1.0.0',
      token: 'runtime-token',
      nested: { clientSecret: 'client-secret', authorization: 'Bearer hidden' },
      samplePayload: { harmless: false },
    }
    const artifact = buildJsonExport(document)
    const exported = JSON.parse(artifact.content) as Record<string, unknown>

    expect(exported.token).toBe('[REDACTED]')
    expect(exported.nested).toEqual({ clientSecret: '[REDACTED]', authorization: '[REDACTED]' })
    expect(exported).not.toHaveProperty('samplePayload')
    expect(artifact.content).not.toContain('runtime-token')
    expect(artifact.content).not.toContain('client-secret')
    expect(artifact.content).not.toContain('Bearer hidden')
  })
})
