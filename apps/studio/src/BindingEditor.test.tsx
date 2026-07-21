import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { connectorCatalog, counterpartyRiskContract } from '@lattice/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BindingEditor } from './BindingEditor'
import { LatticeI18nProvider } from './i18n/I18nProvider'

afterEach(() => vi.unstubAllGlobals())

describe('BindingEditor live discovery', () => {
  it('requests governed Databricks metadata without requiring a pasted schema', async () => {
    const user = userEvent.setup()
    const preview = {
      id: 'binding_preview_databricks',
      contractId: counterpartyRiskContract.id,
      sourceName: 'operations.grid.current_outages',
      sourceChecksum: `sha256:${'a'.repeat(64)}`,
      createdAt: '2026-07-21T00:00:00.000Z',
      operations: [{
        id: 'databricks.query_current_outages',
        operationId: 'databricks.query_current_outages',
        method: 'QUERY',
        path: 'operations.grid.current_outages',
        summary: 'Query operations.grid.current_outages',
        expectedResultSchema: 'current_outages_row',
        fields: [{ path: '$.event_id', label: 'Event Id', dataType: 'string', required: true }],
      }],
      warnings: [],
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ connectors: connectorCatalog }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(preview), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    render(<LatticeI18nProvider><BindingEditor contract={structuredClone(counterpartyRiskContract)} onCancel={vi.fn()} onApply={vi.fn()} /></LatticeI18nProvider>)

    const databricksConnector = screen.getByRole('button', { name: /Databricks/i })
    expect(databricksConnector.querySelector('img')).toHaveAttribute('src', expect.stringContaining('databricks'))
    expect(screen.getByRole('button', { name: /Microsoft Fabric/i }).querySelector('img')).toHaveAttribute('src', expect.stringContaining('fabric'))
    expect(screen.getByRole('button', { name: /Snowflake/i }).querySelector('img')).toHaveAttribute('src', expect.stringContaining('snowflake'))
    expect(screen.getByRole('button', { name: /Google BigQuery/i }).querySelector('img')).toHaveAttribute('src', expect.stringContaining('bigquery'))
    expect(screen.getByRole('button', { name: /PostgreSQL/i }).querySelector('img')).toHaveAttribute('src', expect.stringContaining('postgres'))
    expect(screen.getByRole('button', { name: /Apache Kafka/i }).querySelector('img')).toHaveAttribute('src', expect.stringContaining('kafka'))
    expect(screen.getByRole('button', { name: /S3 \/ ADLS \/ OneLake/i }).querySelector('img')).toHaveAttribute('src', expect.stringContaining('amazon-s3'))
    expect(screen.getByRole('button', { name: /OpenAPI \/ REST/i }).querySelector('img')).toHaveAttribute('src', expect.stringContaining('restapi'))
    await user.click(databricksConnector)
    expect(screen.getByRole('checkbox', { name: /Discover from the live provider/i })).toBeChecked()
    expect(screen.queryByLabelText(/Column schema/i)).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Governed source object'), 'operations.grid.current_outages')
    await user.type(screen.getByLabelText('Endpoint'), 'https://dbc-example.cloud.databricks.com')
    await user.type(screen.getByLabelText('Warehouse'), 'warehouse-id')
    await user.type(screen.getByLabelText('Catalog'), 'operations')
    await user.type(screen.getByLabelText('Schema'), 'grid')
    await user.type(screen.getByLabelText('Object'), 'current_outages')
    await user.click(screen.getByRole('button', { name: /Discover live fields/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toMatch(/\/v1\/connectors\/discover$/)
    const body = JSON.parse(String(init.body)) as { binding: { connector: { provider: string; credentialRef: string; resource: Record<string, string> } } }
    expect(body.binding.connector).toMatchObject({
      provider: 'DATABRICKS',
      credentialRef: 'env:DATABRICKS_OAUTH_TOKEN',
      resource: { warehouse: 'warehouse-id', catalog: 'operations', schema: 'grid', object: 'current_outages' },
    })
    expect(await screen.findByText('Query operations.grid.current_outages')).toBeVisible()
  })
})
