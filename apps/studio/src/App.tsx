import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import {
  counterpartyRiskContract,
  type ContextContract,
  type ContractRegistryEntry,
  type ContractSummary,
  type IndustryWorkspace,
  type WorkspaceSummary,
} from '@lattice/contracts'
import { NavItem } from './NavItem'
import {
  IconNetwork,
  IconLink,
  IconFileText,
  IconPlay,
  IconShieldCheck,
  IconPlug,
  IconUserCheck,
  IconScale,
  IconInbox,
  IconFileSearch,
  IconGitBranch,
  IconDownload,
  IconPlus,
  IconLoader,
} from './icons'
import { SummaryCard } from './SummaryCard'
import { AppearanceSettings } from './AppearanceSettings'
import { Brand } from './Brand'
import { ConfirmDialog } from './ConfirmDialog'
import { IndustryWorkspaceIcon } from './IndustryWorkspaceIcon'
import { API_URL } from './api'
import { useMessages, type MessageKey } from './i18n/messages'

const WorkspaceOntologyStudio = lazy(() => import('./WorkspaceOntologyStudio').then((module) => ({ default: module.WorkspaceOntologyStudio })))
const NewContractWizard = lazy(() => import('./NewContractWizard').then((module) => ({ default: module.NewContractWizard })))
const SourceBindingStudio = lazy(() => import('./SourceBindingStudio').then((module) => ({ default: module.SourceBindingStudio })))
const AssuranceStudio = lazy(() => import('./AssuranceStudio').then((module) => ({ default: module.AssuranceStudio })))
const ReviewQueueStudio = lazy(() => import('./ReviewQueueStudio').then((module) => ({ default: module.ReviewQueueStudio })))
const PolicyStudio = lazy(() => import('./PolicyStudio').then((module) => ({ default: module.PolicyStudio })))
const RuntimeStudio = lazy(() => import('./RuntimeStudio').then((module) => ({ default: module.RuntimeStudio })))
const EvidenceRegistryStudio = lazy(() => import('./EvidenceRegistryStudio').then((module) => ({ default: module.EvidenceRegistryStudio })))
const ReleaseManagementStudio = lazy(() => import('./ReleaseManagementStudio').then((module) => ({ default: module.ReleaseManagementStudio })))
const RuntimeApprovalStudio = lazy(() => import('./RuntimeApprovalStudio').then((module) => ({ default: module.RuntimeApprovalStudio })))
const ContractsStudio = lazy(() => import('./ContractsStudio').then((module) => ({ default: module.ContractsStudio })))
const ImportStudio = lazy(() => import('./ImportStudio').then((module) => ({ default: module.ImportStudio })))
const WelcomeStudio = lazy(() => import('./WelcomeStudio').then((module) => ({ default: module.WelcomeStudio })))

const ACTIVE_CONTRACT_KEY = 'lattice:active-contract'
const ACTIVE_WORKSPACE_KEY = 'lattice:active-workspace'
const WELCOME_DISMISSED_KEY = 'lattice:welcome-dismissed'

type StudioMode = 'ontology' | 'ontology-bindings' | 'runtime' | 'runtime-approvals' | 'bindings' | 'assurance' | 'policies' | 'reviews' | 'evidence' | 'releases' | 'contracts'
type CountKind = 'contracts' | 'ontology-bindings' | 'tests' | 'bindings' | 'policies' | 'reviews' | 'evidence'

const workspaceNavigation: ReadonlyArray<{ mode: StudioMode; icon: ReactNode; label: MessageKey; count?: CountKind }> = [
  { mode: 'ontology', icon: <IconNetwork />, label: 'navSharedOntology' },
  { mode: 'ontology-bindings', icon: <IconLink />, label: 'navOntologyBindings', count: 'ontology-bindings' },
  { mode: 'contracts', icon: <IconFileText />, label: 'navContracts', count: 'contracts' },
]

const contractNavigation: ReadonlyArray<{ mode: StudioMode; icon: ReactNode; label: MessageKey; count?: CountKind }> = [
  { mode: 'runtime', icon: <IconPlay />, label: 'navCompiler' },
  { mode: 'assurance', icon: <IconShieldCheck />, label: 'navAssurance', count: 'tests' },
  { mode: 'bindings', icon: <IconPlug />, label: 'navSourceBindings', count: 'bindings' },
]

const governanceNavigation: ReadonlyArray<{ mode: StudioMode; icon: ReactNode; label: MessageKey; count?: CountKind }> = [
  { mode: 'runtime-approvals', icon: <IconUserCheck />, label: 'navRuntimeApprovals' },
  { mode: 'policies', icon: <IconScale />, label: 'navPolicyProfiles', count: 'policies' },
  { mode: 'reviews', icon: <IconInbox />, label: 'navReviewQueue', count: 'reviews' },
  { mode: 'evidence', icon: <IconFileSearch />, label: 'navEvidenceRegistry', count: 'evidence' },
  { mode: 'releases', icon: <IconGitBranch />, label: 'navReleaseHistory' },
]

export function App() {
  const { t } = useMessages()
  const [contract, setContract] = useState<ContextContract>(loadContractDraft)
  const [studioMode, setStudioMode] = useState<StudioMode>('ontology')
  const [draftDirty, setDraftDirty] = useState(false)
  const [contracts, setContracts] = useState<ContractSummary[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [workspace, setWorkspace] = useState<IndustryWorkspace>()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [welcomeOpen, setWelcomeOpen] = useState(() => localStorage.getItem(WELCOME_DISMISSED_KEY) !== 'true')
  const [pendingNavigation, setPendingNavigation] = useState<{ kind: 'CONTRACT' | 'WORKSPACE'; id: string }>()
  const [shareState, setShareState] = useState<'IDLE' | 'COPIED' | 'FAILED'>('IDLE')
  const [saveState, setSaveState] = useState<'IDLE' | 'SAVING' | 'FAILED'>('IDLE')
  const [apiHealth, setApiHealth] = useState<{ status: 'CHECKING' | 'HEALTHY' | 'OFFLINE'; latencyMs?: number }>({ status: 'CHECKING' })
  const reviewQueueCount = contract.entityTypes.filter((type) => ['DRAFT', 'IN_REVIEW', 'REJECTED'].includes(type.approvalStatus)).length + contract.bindings.filter((binding) => ['DRAFT', 'IN_REVIEW', 'REJECTED'].includes(binding.approvalStatus)).length + contract.policies.filter((policy) => ['DRAFT', 'IN_REVIEW', 'REJECTED'].includes(policy.approvalStatus)).length
  const runtimeStatus = contracts.find((summary) => summary.contractId === contract.id)?.runtimeStatus ?? (contract.releaseStatus === 'PUBLISHED' ? 'ACTIVE' : 'NO_RELEASE')
  const workspaceContracts = contracts.filter((summary) => !workspace || summary.workspaceId === workspace.id)
  const hasActiveWorkspaceContract = workspaceContracts.some((summary) => summary.contractId === contract.id)
  const navigationCounts: Record<CountKind, number> = {
    contracts: workspaceContracts.length,
    'ontology-bindings': workspace?.ontology.bindings?.length ?? 0,
    tests: hasActiveWorkspaceContract ? contract.tests.length : 0,
    bindings: hasActiveWorkspaceContract ? contract.bindings.length : 0,
    policies: hasActiveWorkspaceContract ? contract.policies.length : 0,
    reviews: hasActiveWorkspaceContract ? reviewQueueCount : 0,
    evidence: hasActiveWorkspaceContract ? contract.evidence.length : 0,
  }
  const activeNavigation = [...workspaceNavigation, ...contractNavigation, ...governanceNavigation].find((item) => item.mode === studioMode)!
  const workspaceMode = studioMode === 'ontology' || studioMode === 'ontology-bindings'
  const summaryCards = buildSummaryCards({ t, workspaceMode, workspace, workspaceContracts, contract, hasActiveWorkspaceContract, draftDirty, runtimeStatus })

  useEffect(() => {
    const controller = new AbortController()
    const activeContractId = new URL(window.location.href).searchParams.get('contract') ?? localStorage.getItem(ACTIVE_CONTRACT_KEY) ?? counterpartyRiskContract.id
    void Promise.all([
      fetch(`${API_URL}/v1/contracts`, { signal: controller.signal }),
      fetch(`${API_URL}/v1/contracts/${activeContractId}`, { signal: controller.signal }),
      fetch(`${API_URL}/v1/workspaces`, { signal: controller.signal }),
    ]).then(async ([listResponse, entryResponse, workspaceListResponse]) => {
        if (listResponse.ok) setContracts(await listResponse.json() as ContractSummary[])
        const workspaceSummaries = workspaceListResponse.ok ? await workspaceListResponse.json() as WorkspaceSummary[] : []
        setWorkspaces(workspaceSummaries)
        if (entryResponse.ok) {
          const entry = await entryResponse.json() as ContractRegistryEntry
          setContract(entry.draft)
          localStorage.setItem('lattice:contract-draft', JSON.stringify(entry.draft))
          const workspaceId = new URL(window.location.href).searchParams.get('workspace') ?? localStorage.getItem(ACTIVE_WORKSPACE_KEY) ?? entry.draft.ontologyRef?.workspaceId ?? workspaceSummaries.find((item) => item.domain === entry.draft.domain)?.id
          if (workspaceId) {
            const workspaceResponse = await fetch(`${API_URL}/v1/workspaces/${workspaceId}`, { signal: controller.signal })
            if (workspaceResponse.ok) setWorkspace(await workspaceResponse.json() as IndustryWorkspace)
          }
        }
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    async function checkHealth() {
      const startedAt = performance.now()
      try {
        const response = await fetch(`${API_URL}/health`, { signal: controller.signal })
        if (!response.ok) throw new Error(`Health returned ${response.status}`)
        setApiHealth({ status: 'HEALTHY', latencyMs: Math.max(1, Math.round(performance.now() - startedAt)) })
      } catch {
        if (!controller.signal.aborted) setApiHealth({ status: 'OFFLINE' })
      }
    }
    void checkHealth()
    const interval = window.setInterval(() => void checkHealth(), 30_000)
    return () => { controller.abort(); window.clearInterval(interval) }
  }, [])

  async function selectContract(contractId: string, skipDirtyCheck = false) {
    if (!skipDirtyCheck && draftDirty) {
      setPendingNavigation({ kind: 'CONTRACT', id: contractId })
      return
    }
    const response = await fetch(`${API_URL}/v1/contracts/${contractId}`)
    if (!response.ok) return
    const entry = await response.json() as ContractRegistryEntry
    setContract(entry.draft)
    setDraftDirty(false)
    localStorage.setItem(ACTIVE_CONTRACT_KEY, entry.contractId)
    localStorage.setItem('lattice:contract-draft', JSON.stringify(entry.draft))
  }

  async function selectWorkspace(workspaceId: string, skipDirtyCheck = false) {
    if (!skipDirtyCheck && draftDirty) {
      setPendingNavigation({ kind: 'WORKSPACE', id: workspaceId })
      return
    }
    const response = await fetch(`${API_URL}/v1/workspaces/${workspaceId}`)
    if (!response.ok) return
    const nextWorkspace = await response.json() as IndustryWorkspace
    setWorkspace(nextWorkspace)
    setDraftDirty(false)
    setStudioMode('ontology')
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId)
    const nextContract = contracts.find((item) => item.workspaceId === nextWorkspace.id)
    if (nextContract && nextContract.contractId !== contract.id) await selectContract(nextContract.contractId, true)
    if (!nextContract) localStorage.removeItem(ACTIVE_CONTRACT_KEY)
  }

  async function handleContractCreated(entry: ContractRegistryEntry) {
    const listResponse = await fetch(`${API_URL}/v1/contracts`)
    if (listResponse.ok) setContracts(await listResponse.json() as ContractSummary[])
    setContract(entry.draft)
    setDraftDirty(false)
    setStudioMode('contracts')
    setWizardOpen(false)
    localStorage.setItem(ACTIVE_CONTRACT_KEY, entry.contractId)
    localStorage.setItem('lattice:contract-draft', JSON.stringify(entry.draft))
    const workspaceId = entry.draft.ontologyRef?.workspaceId
    if (workspaceId) {
      const response = await fetch(`${API_URL}/v1/workspaces/${workspaceId}`)
      if (response.ok) setWorkspace(await response.json() as IndustryWorkspace)
    }
  }

  async function handleRegistryChange(entry: ContractRegistryEntry) {
    setContract(entry.draft)
    setDraftDirty(false)
    localStorage.setItem('lattice:contract-draft', JSON.stringify(entry.draft))
    const listResponse = await fetch(`${API_URL}/v1/contracts`)
    if (listResponse.ok) setContracts(await listResponse.json() as ContractSummary[])
  }

  function handleWorkspaceChange(updated: IndustryWorkspace) {
    setWorkspace(updated)
    setContracts((current) => current.map((summary) => summary.workspaceId === updated.id ? {
      ...summary,
      ontologyVersion: updated.ontology.version,
      conceptScopeCount: updated.ontology.entityTypes.length,
      entityTypeCount: updated.ontology.entityTypes.length,
      relationshipTypeCount: updated.ontology.relationshipTypes.length,
      updatedAt: updated.updatedAt,
    } : summary))
    setContract((current) => {
      const conceptScope = current.conceptScope ?? current.entityTypes.map((type) => type.id)
      const scope = new Set(conceptScope)
      return {
        ...current,
        ontologyRef: { workspaceId: updated.id, ontologyId: updated.ontology.id, version: updated.ontology.version, digest: updated.ontology.digest },
        conceptScope,
        entityTypes: structuredClone(updated.ontology.entityTypes.filter((type) => scope.has(type.id))),
        relationshipTypes: structuredClone(updated.ontology.relationshipTypes.filter((relationship) => scope.has(relationship.sourceTypeId) && scope.has(relationship.targetTypeId))),
        schemaLayout: Object.fromEntries(Object.entries(updated.ontology.schemaLayout).filter(([id]) => scope.has(id))),
      }
    })
  }

  async function shareContract() {
    const url = new URL(window.location.href)
    url.searchParams.set('contract', contract.id)
    window.history.replaceState({}, '', url)
    try {
      await navigator.clipboard.writeText(url.toString())
      setShareState('COPIED')
    } catch {
      setShareState('FAILED')
    }
    window.setTimeout(() => setShareState('IDLE'), 2200)
  }

  async function saveContractDraft() {
    if (workspaceMode || !draftDirty || saveState === 'SAVING') return
    setSaveState('SAVING')
    try {
      const response = await fetch(`${API_URL}/v1/contracts/${contract.id}`, {
        method: 'PUT',
        headers: { Authorization: 'Bearer studio-demo', 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract }),
      })
      if (!response.ok) throw new Error(`Registry returned ${response.status}`)
      await handleRegistryChange(await response.json() as ContractRegistryEntry)
      setSaveState('IDLE')
    } catch {
      setSaveState('FAILED')
    }
  }

  async function saveWorkspaceOntology() {
    if (!workspace || !workspaceMode || !draftDirty || saveState === 'SAVING') return
    setSaveState('SAVING')
    try {
      const response = await fetch(`${API_URL}/v1/workspaces/${workspace.id}/ontology`, {
        method: 'PUT',
        headers: { Authorization: 'Bearer studio-demo', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ontology: workspace.ontology }),
      })
      if (!response.ok) throw new Error(`Registry returned ${response.status}`)
      const updated = await response.json() as IndustryWorkspace
      handleWorkspaceChange(updated)
      setDraftDirty(false)
      setSaveState('IDLE')
    } catch {
      setSaveState('FAILED')
    }
  }

  async function saveActiveDraft() {
    if (workspaceMode) await saveWorkspaceOntology()
    else await saveContractDraft()
  }

  function closeWelcome() {
    localStorage.setItem(WELCOME_DISMISSED_KEY, 'true')
    setWelcomeOpen(false)
  }

  async function exploreExample(contractId: string) {
    await selectContract(contractId, true)
    closeWelcome()
    setStudioMode('runtime')
  }

  function confirmNavigation() {
    const pending = pendingNavigation
    setPendingNavigation(undefined)
    if (!pending) return
    if (pending.kind === 'CONTRACT') void selectContract(pending.id, true)
    else void selectWorkspace(pending.id, true)
  }

  function navigateTo(mode: StudioMode) {
    const contractRequired = !workspaceNavigation.some((item) => item.mode === mode)
    setStudioMode(contractRequired && !hasActiveWorkspaceContract ? 'contracts' : mode)
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-switcher"><span className="workspace-icon"><IndustryWorkspaceIcon domain={workspace?.domain} /></span><div><label htmlFor="active-workspace">{t('industryWorkspace')}</label><select id="active-workspace" value={workspace?.id ?? ''} onChange={(event) => void selectWorkspace(event.target.value)}>{!workspace && <option value="">{t('workspaceLoading')}</option>}{workspaces.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><span>{workspace ? t('workspaceFoundationMeta', { types: workspace.ontology.entityTypes.length, contracts: workspace.contractIds.length }) : t('crossIndustryPlane')}</span></div></div>
        <nav>
          {workspaceNavigation.map((item) => <NavItem icon={item.icon} label={t(item.label)} count={item.count ? String(navigationCounts[item.count]) : undefined} active={studioMode === item.mode} onClick={() => navigateTo(item.mode)} key={item.mode} />)}
          <div className="nav-label">{t('contractWorkspace')}</div>
          {contractNavigation.map((item) => <NavItem icon={item.icon} label={t(item.label)} count={item.count ? String(navigationCounts[item.count]) : undefined} active={studioMode === item.mode} onClick={() => navigateTo(item.mode)} key={item.mode} />)}
          <NavItem icon={<IconDownload />} label={t('ontologyImportSchema')} onClick={() => setImportOpen(true)} />
          <div className="nav-label">{t('navGovernance')}</div>
          {governanceNavigation.map((item) => <NavItem icon={item.icon} label={t(item.label)} count={item.count ? String(navigationCounts[item.count]) : undefined} active={studioMode === item.mode} onClick={() => navigateTo(item.mode)} key={item.mode} />)}
          <NavItem icon={<IconPlus />} label={t('navNewContextContract')} onClick={() => setWizardOpen(true)} />
        </nav>
        <div className="sidebar-footer"><span className={`status-dot ${apiHealth.status.toLocaleLowerCase()}`}/><div><b>{apiHealth.status === 'HEALTHY' ? t('runtimeHealthy') : apiHealth.status === 'OFFLINE' ? t('runtimeOffline') : t('runtimeChecking')}</b><span>{apiHealth.status === 'HEALTHY' ? t('runtimeLatency', { latency: apiHealth.latencyMs ?? 0 }) : apiHealth.status === 'OFFLINE' ? t('runtimeUnreachable') : t('runtimeProbing')}</span></div></div>
      </aside>

      <main>
        <header>
          <div><div className="eyebrow">{t('contextStudio')} / {workspace?.name ?? contract.domain}</div><h1>{t(activeNavigation.label)}</h1></div>
          <div className="header-actions">
            {(workspaceMode || hasActiveWorkspaceContract) && <span className={`draft-state ${draftDirty ? 'dirty' : ''}`}>{saveState === 'FAILED' ? t('headerSaveFailed') : draftDirty ? t('unsavedDraft') : t('draftSaved')}</span>}
            {(workspaceMode ? Boolean(workspace) : hasActiveWorkspaceContract) && <button className="release" onClick={() => void saveActiveDraft()} disabled={!draftDirty || saveState === 'SAVING'}>{saveState === 'SAVING' ? t('commonSaving') : t('commonSaveDraft')}</button>}
            <button className="ghost" onClick={() => setWelcomeOpen(true)}>{t('welcomeHelp')}</button>
            <AppearanceSettings />
            {hasActiveWorkspaceContract && <button className="ghost" onClick={() => void shareContract()} title={shareState === 'FAILED' ? t('linkClipboardDenied') : undefined}>{shareState === 'COPIED' ? t('linkCopied') : shareState === 'FAILED' ? t('linkReady') : t('share')}</button>}
            <span className="avatar">HG</span>
          </div>
        </header>

        <section className="summary-grid">
          {summaryCards.map((card) => <SummaryCard {...card} key={card.label} />)}
        </section>

        <Suspense fallback={<StudioLoading label={t(activeNavigation.label)} />}>
          {studioMode === 'ontology' ? workspace ? <WorkspaceOntologyStudio key={workspace.id} workspace={workspace} seedContract={contract} onWorkspaceDraftChange={setWorkspace} onDirtyChange={setDraftDirty} /> : <div className="runtime-empty"><span aria-hidden="true"><IconLoader /></span><h3>{t('workspaceLoading')}</h3></div> : studioMode === 'ontology-bindings' ? workspace ? <SourceBindingStudio contract={workspaceBindingContract(workspace, contract)} scope="ONTOLOGY" workspaceId={workspace.id} onChange={(next) => { setWorkspace((current) => current ? { ...current, ontology: { ...current.ontology, bindings: next.bindings } } : current); setDraftDirty(true) }} onDirtyChange={setDraftDirty} onOpenOntology={() => setStudioMode('ontology')} /> : <div className="runtime-empty"><span aria-hidden="true"><IconLoader /></span><h3>{t('workspaceLoading')}</h3></div> : studioMode === 'contracts' ? <ContractsStudio contracts={workspaceContracts} activeContractId={contract.id} onSelect={(id) => void selectContract(id)} onCreate={() => setWizardOpen(true)} /> : studioMode === 'runtime-approvals' ? <RuntimeApprovalStudio contract={contract} onChange={setContract} onDirtyChange={setDraftDirty} onOpenReviews={() => setStudioMode('reviews')} onOpenAssurance={() => setStudioMode('assurance')} onManageRelease={() => setStudioMode('releases')} /> : studioMode === 'bindings' ? <SourceBindingStudio contract={contract} onChange={setContract} onDirtyChange={setDraftDirty} onOpenOntology={() => setStudioMode('ontology')} /> : studioMode === 'assurance' ? <AssuranceStudio contract={contract} onChange={setContract} onDirtyChange={setDraftDirty} /> : studioMode === 'policies' ? <PolicyStudio contract={contract} onChange={setContract} onDirtyChange={setDraftDirty} /> : studioMode === 'reviews' ? <ReviewQueueStudio contract={contract} onChange={setContract} onDirtyChange={setDraftDirty} /> : studioMode === 'evidence' ? <EvidenceRegistryStudio contract={contract} /> : studioMode === 'releases' ? <ReleaseManagementStudio contract={contract} onRegistryChange={(entry) => void handleRegistryChange(entry)} onManageDraft={() => setStudioMode('contracts')} /> : <RuntimeStudio key={contract.id} contract={contract} runtimeStatus={runtimeStatus} onChange={setContract} onDirtyChange={setDraftDirty} onManageRelease={() => setStudioMode('releases')} onOpenAssurance={() => setStudioMode('assurance')} />}
        </Suspense>
      </main>
      <Suspense fallback={null}>
        {wizardOpen && <NewContractWizard {...(workspace ? { workspace } : {})} onClose={() => setWizardOpen(false)} onCreated={(entry) => void handleContractCreated(entry)} />}
        {importOpen && <ImportStudio contract={workspace ? workspaceBindingContract(workspace, contract) : contract} onClose={() => setImportOpen(false)} onApply={(next) => {
          if (workspace) setWorkspace({ ...workspace, ontology: { ...workspace.ontology, entityTypes: next.entityTypes, relationshipTypes: next.relationshipTypes, schemaLayout: next.schemaLayout ?? {} } })
          else setContract(next)
          setDraftDirty(true)
          setImportOpen(false)
          setStudioMode('ontology')
        }} />}
        {welcomeOpen && <WelcomeStudio contracts={contracts} onClose={closeWelcome} onExplore={(id) => void exploreExample(id)} onCreate={() => { closeWelcome(); setWizardOpen(true) }} />}
      </Suspense>
      {pendingNavigation && <ConfirmDialog title={t('discardChangesTitle')} description={t('discardChanges')} cancelLabel={t('commonCancel')} confirmLabel={t('discardChangesConfirm')} onCancel={() => setPendingNavigation(undefined)} onConfirm={confirmNavigation} />}
    </div>
  )
}

function StudioLoading({ label }: { label: string }) {
  return <div className="runtime-empty" role="status"><span aria-hidden="true"><IconLoader /></span><h3>{label}</h3></div>
}

interface SummaryCardModel {
  label: string
  value: string
  meta: string
  tone: 'amber' | 'blue' | 'green' | 'lime'
}

interface SummaryCardContext {
  t: ReturnType<typeof useMessages>['t']
  workspaceMode: boolean
  workspace: IndustryWorkspace | undefined
  workspaceContracts: ContractSummary[]
  contract: ContextContract
  hasActiveWorkspaceContract: boolean
  draftDirty: boolean
  runtimeStatus: ContractSummary['runtimeStatus']
}

function buildSummaryCards({ t, workspaceMode, workspace, workspaceContracts, contract, hasActiveWorkspaceContract, draftDirty, runtimeStatus }: SummaryCardContext): SummaryCardModel[] {
  if (workspaceMode) return [
    {
      label: t('summaryOntologyStatus'),
      value: workspace?.ontology.releaseStatus === 'PUBLISHED' && !draftDirty ? t('statusPublished') : t('statusDraft'),
      meta: `v${workspace?.ontology.version ?? '0.0.0'} · ${t('workspaceOntologyFoundation')}`,
      tone: draftDirty || workspace?.ontology.releaseStatus === 'UNPUBLISHED' ? 'amber' : 'green',
    },
    {
      label: t('summaryEntityTypes'),
      value: String(workspace?.ontology.entityTypes.length ?? 0),
      meta: workspace?.ontologyGeneration
        ? t('workspaceGeneratedMeta', { forms: workspace.ontologyGeneration.sourceFormCount, mapped: workspace.ontologyGeneration.mappedPercent })
        : t('workspaceSharedAcrossContracts', { count: workspace?.contractIds.length ?? 0 }),
      tone: 'lime',
    },
    {
      label: t('summaryRelationships'),
      value: String(workspace?.ontology.relationshipTypes.length ?? 0),
      meta: t('typedDirectional'),
      tone: 'blue',
    },
    {
      label: t('summaryContracts'),
      value: String(workspaceContracts.length),
      meta: t('workspaceDecisionContracts'),
      tone: 'blue',
    },
  ]

  const noContract = !hasActiveWorkspaceContract
  const noTests = noContract || contract.tests.length === 0
  const contractDraft = draftDirty || contract.releaseStatus === 'UNPUBLISHED'
  return [
    {
      label: t('summaryContractStatus'),
      value: noContract ? t('statusNoContract') : runtimeStatus === 'SUSPENDED' ? t('statusSuspended') : contractDraft ? t('statusDraft') : t('statusPublished'),
      meta: noContract ? t('contractsCreateFirst') : `${contract.version} · ${runtimeStatus === 'SUSPENDED' ? t('runtimePaused') : draftDirty ? t('unpublishedChanges') : t('registrySynchronized')}`,
      tone: noContract || runtimeStatus === 'SUSPENDED' || contractDraft ? 'amber' : 'green',
    },
    {
      label: t('summaryEntityTypes'),
      value: String(noContract ? 0 : contract.entityTypes.length),
      meta: t('contractsScope'),
      tone: 'lime',
    },
    {
      label: t('summaryRelationships'),
      value: String(noContract ? 0 : contract.relationshipTypes.length),
      meta: t('typedDirectional'),
      tone: 'blue',
    },
    {
      label: t('summaryAssurance'),
      value: noContract ? '0 / 0' : `${contract.tests.filter((test) => test.status === 'PASS').length} / ${contract.tests.length}`,
      meta: noTests ? t('noTestsConfigured') : t('structuralGatesPassing'),
      tone: noTests ? 'amber' : 'green',
    },
  ]
}

function workspaceBindingContract(workspace: IndustryWorkspace, seed: ContextContract): ContextContract {
  return {
    ...seed,
    name: `${workspace.ontology.name} · master and reference data`,
    domain: workspace.domain,
    ontologyRef: { workspaceId: workspace.id, ontologyId: workspace.ontology.id, version: workspace.ontology.version, digest: workspace.ontology.digest },
    conceptScope: workspace.ontology.entityTypes.map((type) => type.id),
    entityTypes: workspace.ontology.entityTypes,
    relationshipTypes: workspace.ontology.relationshipTypes,
    bindings: workspace.ontology.bindings ?? [],
    schemaLayout: workspace.ontology.schemaLayout,
  }
}

function loadContractDraft(): ContextContract {
  try {
    const saved = localStorage.getItem('lattice:contract-draft')
    return saved ? JSON.parse(saved) as ContextContract : structuredClone(counterpartyRiskContract)
  } catch {
    return structuredClone(counterpartyRiskContract)
  }
}
