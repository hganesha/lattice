import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { counterpartyRiskContract, type ContractRegistryEntry, type ContractSummary, type IndustryWorkspace } from '@lattice/contracts'
import { App } from './App'
import { LatticeI18nProvider } from './i18n/I18nProvider'

describe('Studio shell', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('lattice:welcome-dismissed', 'true')
    window.history.replaceState({}, '', '/')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  })

  afterEach(() => vi.unstubAllGlobals())

  function navigation() {
    return within(screen.getByRole('navigation'))
  }

  it('starts ontology-first and lazy-loads the contract workspace on navigation', async () => {
    const user = userEvent.setup()
    const { container } = render(<LatticeI18nProvider><App /></LatticeI18nProvider>)

    expect(container.querySelector('.brand-mark img')).toHaveAttribute('src', expect.stringContaining('lattice-app-icon'))
    expect(navigation().getByRole('button', { name: 'Shared ontology' })).toHaveAttribute('aria-current', 'page')

    await user.click(navigation().getByRole('button', { name: /^Contracts/ }))

    expect(await screen.findByRole('heading', { name: 'Choose a decision contract' })).toBeVisible()
    expect(screen.getByLabelText('Active contract')).toBeDisabled()
    expect(screen.getByLabelText('Active contract')).toHaveTextContent('No contracts in this industry')
    expect(navigation().getByRole('button', { name: /^Contracts/ })).toHaveAttribute('aria-current', 'page')
  })

  it('groups navigation by job rather than by object type', async () => {
    const user = userEvent.setup()
    render(<LatticeI18nProvider><App /></LatticeI18nProvider>)

    for (const group of ['Build', 'Operate', 'Govern', 'Assure']) {
      expect(navigation().getByRole('button', { name: new RegExp(`^${group}`) })).toBeVisible()
    }

    // Only the group holding the current surface starts expanded, so the other
    // groups' destinations are reachable in one keystroke rather than standing
    // open. The three loops the plan closes each still get a surface.
    expect(navigation().getByRole('button', { name: /^Build/ })).toHaveAttribute('aria-expanded', 'true')
    expect(navigation().getByRole('button', { name: /^Operate/ })).toHaveAttribute('aria-expanded', 'false')

    await user.click(navigation().getByRole('button', { name: /^Operate/ }))
    expect(navigation().getByRole('button', { name: /^Disposition trail/ })).toBeVisible()

    await user.click(navigation().getByRole('button', { name: /^Assure/ }))
    expect(navigation().getByRole('button', { name: /^Evaluations/ })).toBeVisible()
    expect(navigation().getByRole('button', { name: /^Drift & source health/ })).toBeVisible()
  })

  it('keeps the group holding the current surface expanded', async () => {
    const user = userEvent.setup()
    render(<LatticeI18nProvider><App /></LatticeI18nProvider>)

    // Collapsing the group you are standing in would hide your own location.
    await user.click(navigation().getByRole('button', { name: /^Build/ }))

    expect(navigation().getByRole('button', { name: /^Build/ })).toHaveAttribute('aria-expanded', 'true')
    expect(navigation().getByRole('button', { name: 'Shared ontology' })).toBeVisible()
  })

  it('puts the current surface in the URL so a view is linkable', async () => {
    const user = userEvent.setup()
    render(<LatticeI18nProvider><App /></LatticeI18nProvider>)

    await user.click(navigation().getByRole('button', { name: /^Contracts/ }))

    expect(window.location.pathname).toContain('/contracts')
  })

  it('explains the missing prerequisite instead of silently redirecting', async () => {
    // The compiler needs a contract; with none selected the old shell bounced you to the
    // contract list with no message, which reads as a bug (G8).
    window.history.replaceState({}, '', '/compiler')
    render(<LatticeI18nProvider><App /></LatticeI18nProvider>)

    expect(await screen.findByRole('heading', { name: 'This surface needs a decision contract' })).toBeVisible()
    expect(screen.getByText(/dry-run it immediately, without publishing/)).toBeVisible()
  })

  it('collapses the navigation to a persistent icon rail', async () => {
    const user = userEvent.setup()
    const { container } = render(<LatticeI18nProvider><App /></LatticeI18nProvider>)

    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }))

    expect(container.querySelector('.shell')).toHaveClass('nav-collapsed')
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute('aria-expanded', 'false')
    expect(localStorage.getItem('lattice:navigation-collapsed')).toBe('true')
  })

  it('opens the introduction from the Studio header and can be closed via Escape or the close button', async () => {
    const user = userEvent.setup()
    render(<LatticeI18nProvider><App /></LatticeI18nProvider>)

    await user.click(screen.getByRole('button', { name: 'Intro' }))

    const deck = await screen.findByRole('dialog', { name: 'Introduction to Lattice' })
    // The deck is a standalone document in `public/`, not a bundled route.
    expect(screen.getByTitle('Lattice introduction')).toHaveAttribute('src', '/lattice-intro.html')

    // Close with Escape
    await user.keyboard('{Escape}')
    expect(deck).not.toBeInTheDocument()

    // Re-open and close with the Close button
    await user.click(screen.getByRole('button', { name: 'Intro' }))
    await screen.findByRole('dialog', { name: 'Introduction to Lattice' })
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
    await user.click(navigation().getByRole('button', { name: /^Contracts/ }))
    await user.selectOptions(screen.getByLabelText('Active contract'), secondContract.id)

    // The nav and the page both label this view, so target the page heading specifically.
    expect(await screen.findByRole('heading', { name: 'Compiler', level: 1 })).toBeVisible()
    expect(localStorage.getItem('lattice:active-contract')).toBe(secondContract.id)
  })
})
