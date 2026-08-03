import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { counterpartyRiskContract, type ContractRegistryEntry, type ContractSummary, type IndustryWorkspace } from '@lattice/contracts'
import { App } from './App'
import { LatticeI18nProvider } from './i18n/I18nProvider'

describe('Studio shell', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('lattice:welcome-dismissed', 'true')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('starts ontology-first and lazy-loads the contract workspace on navigation', async () => {
    const user = userEvent.setup()
    const { container } = render(<LatticeI18nProvider><App /></LatticeI18nProvider>)

    expect(container.querySelector('.brand-mark img')).toHaveAttribute('src', expect.stringContaining('lattice-app-icon'))
    expect(screen.getByRole('button', { name: 'Shared ontology' })).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByRole('button', { name: /^Contracts/ }))

    expect(await screen.findByRole('heading', { name: 'Choose a decision contract' })).toBeVisible()
    expect(screen.getByLabelText('Active contract')).toBeDisabled()
    expect(screen.getByLabelText('Active contract')).toHaveTextContent('No contracts in this industry')
    expect(screen.getByRole('button', { name: /^Contracts/ })).toHaveAttribute('aria-current', 'page')
  })

  it('collapses the navigation to a persistent icon rail', async () => {
    const user = userEvent.setup()
    const { container } = render(<LatticeI18nProvider><App /></LatticeI18nProvider>)

    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }))

    expect(container.querySelector('.shell')).toHaveClass('nav-collapsed')
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute('aria-expanded', 'false')
    expect(localStorage.getItem('lattice:navigation-collapsed')).toBe('true')
  })

  it('opens the self-contained introduction from the Studio header', async () => {
    const user = userEvent.setup()
    render(<LatticeI18nProvider><App /></LatticeI18nProvider>)

    await user.click(screen.getByRole('button', { name: 'Intro' }))

    expect(screen.getByRole('dialog', { name: 'Introduction to Lattice' })).toBeVisible()
    expect(screen.getByTitle('Lattice introduction')).toHaveAttribute('src', '/lattice-intro.html')

    await user.click(screen.getByRole('button', { name: 'Close introduction' }))
    expect(screen.queryByRole('dialog', { name: 'Introduction to Lattice' })).not.toBeInTheDocument()
  })

  it('opens a selected existing contract in its workspace', async () => {
    const user = userEvent.setup()
    const workspaceId = 'workspace-financial-services'
    const ontologyRef = { workspaceId, ontologyId: 'ontology-financial-services', version: '0.1.0', digest: 'ontology-digest' }
    const firstContract = { ...structuredClone(counterpartyRiskContract), ontologyRef }
    const secondContract = { ...structuredClone(counterpartyRiskContract), id: 'contract-existing-example', name: 'Existing Example', workflow: 'existing_example', ontologyRef, entities: [], relationships: [] }
    const entries: Record<string, ContractRegistryEntry> = {
      [firstContract.id]: { contractId: firstContract.id, draft: firstContract, updatedAt: '2026-07-27T20:00:00.000Z', releases: [], runtimeStatus: 'NO_RELEASE' },
      [secondContract.id]: { contractId: secondContract.id, draft: secondContract, updatedAt: '2026-07-27T20:00:00.000Z', releases: [], runtimeStatus: 'NO_RELEASE' },
    }
    const summaries: ContractSummary[] = Object.values(entries).map((entry) => ({
      contractId: entry.contractId,
      workspaceId,
      ontologyVersion: ontologyRef.version,
      conceptScopeCount: entry.draft.entityTypes.length,
      name: entry.draft.name,
      domain: entry.draft.domain,
      workflow: entry.draft.workflow,
      draftVersion: entry.draft.version,
      releaseStatus: entry.draft.releaseStatus,
      updatedAt: entry.updatedAt,
      entityTypeCount: entry.draft.entityTypes.length,
      relationshipTypeCount: entry.draft.relationshipTypes.length,
      releaseCount: 0,
      runtimeStatus: entry.runtimeStatus,
    }))
    const workspace: IndustryWorkspace = {
      id: workspaceId,
      name: 'Financial Services Workspace',
      description: 'Test workspace',
      domain: firstContract.domain,
      ontology: {
        id: ontologyRef.ontologyId,
        workspaceId,
        name: 'Financial Services Ontology',
        description: 'Test ontology',
        domain: firstContract.domain,
        version: ontologyRef.version,
        digest: ontologyRef.digest,
        releaseStatus: 'UNPUBLISHED',
        entityTypes: firstContract.entityTypes,
        relationshipTypes: firstContract.relationshipTypes,
        schemaLayout: firstContract.schemaLayout ?? {},
      },
      contractIds: Object.keys(entries),
      updatedAt: '2026-07-27T20:00:00.000Z',
    }
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/health')) return Response.json({ status: 'ok' })
      if (url.endsWith('/v1/contracts')) return Response.json(summaries)
      if (url.endsWith('/v1/workspaces')) return Response.json([{ id: workspace.id, name: workspace.name, domain: workspace.domain, description: workspace.description, ontologyVersion: workspace.ontology.version, entityTypeCount: workspace.ontology.entityTypes.length, relationshipTypeCount: workspace.ontology.relationshipTypes.length, contractCount: workspace.contractIds.length, updatedAt: workspace.updatedAt }])
      if (url.endsWith(`/v1/workspaces/${workspaceId}`)) return Response.json(workspace)
      const entry = Object.values(entries).find((item) => url.endsWith(`/v1/contracts/${item.contractId}`))
      return entry ? Response.json(entry) : new Response(null, { status: 404 })
    }))

    render(<LatticeI18nProvider><App /></LatticeI18nProvider>)
    await screen.findByText('Financial Services Workspace')
    await user.click(screen.getByRole('button', { name: /^Contracts/ }))
    await user.selectOptions(screen.getByLabelText('Active contract'), secondContract.id)

    expect(await screen.findByRole('heading', { name: 'Compiler' })).toBeVisible()
    expect(localStorage.getItem('lattice:active-contract')).toBe(secondContract.id)
  })
})
