import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { counterpartyRiskContract } from '@lattice/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LatticeI18nProvider } from './i18n/I18nProvider'
import { SourceBindingStudio } from './SourceBindingStudio'

afterEach(() => vi.unstubAllGlobals())

describe('SourceBindingStudio prerequisites', () => {
  it('explains and consistently enforces the property prerequisite', async () => {
    const user = userEvent.setup()
    const onOpenOntology = vi.fn()
    const contract = {
      ...structuredClone(counterpartyRiskContract),
      entityTypes: counterpartyRiskContract.entityTypes.map((type) => ({ ...type, properties: [] })),
      bindings: [],
    }

    render(<LatticeI18nProvider><SourceBindingStudio contract={contract} onChange={vi.fn()} onDirtyChange={vi.fn()} onOpenOntology={onOpenOntology} /></LatticeI18nProvider>)

    expect(screen.getByRole('button', { name: /New source binding/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Choose a connector/i })).toBeDisabled()
    expect(screen.getByText('An ontology with properties is required')).toBeVisible()

    await user.click(screen.getByRole('button', { name: /Add ontology properties/i }))
    expect(onOpenOntology).toHaveBeenCalledOnce()
  })

  it('runs and renders durable connector health telemetry', async () => {
    const user = userEvent.setup()
    const contract = structuredClone(counterpartyRiskContract)
    contract.bindings = [{
      ...contract.bindings[0]!,
      id: 'binding-fabric-health',
      sourceSystem: 'Fabric Risk Warehouse',
      adapterType: 'DATABASE',
      executionMode: 'CONNECTOR',
      endpoint: 'risk.datawarehouse.fabric.microsoft.com',
      method: 'QUERY',
      connector: {
        provider: 'MICROSOFT_FABRIC',
        transport: 'TDS',
        credentialRef: 'vault:fabric/risk-reader',
        resource: { workspace: 'risk', database: 'governed', schema: 'dbo', object: 'counterparty' },
        queryTemplate: 'SELECT id FROM dbo.counterparty',
        parameterStyle: 'NAMED',
        readOnly: true,
      },
    }]
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => init?.method === 'POST'
      ? new Response(JSON.stringify({ id: 'health-1', bindingId: 'binding-fabric-health', provider: 'MICROSOFT_FABRIC', status: 'HEALTHY', checkedAt: '2026-07-22T12:00:00.000Z', latencyMs: 38, credentialSource: 'BROKER', probe: 'LIVE_DISCOVERY', lastSuccessfulAt: '2026-07-22T12:00:00.000Z', freshnessStatus: 'CURRENT', maximumFreshnessMinutes: 60, checks: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response(JSON.stringify({ records: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    render(<LatticeI18nProvider><SourceBindingStudio contract={contract} onChange={vi.fn()} onDirtyChange={vi.fn()} onOpenOntology={vi.fn()} /></LatticeI18nProvider>)
    await user.click(screen.getByRole('button', { name: 'Check health' }))

    expect(await screen.findByText('HEALTHY')).toBeVisible()
    expect(screen.getByText(/38 ms · broker credential/i)).toBeVisible()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/v1/connectors/health'), expect.objectContaining({ method: 'POST' })))
  })
})
