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
  IconHistory,
  IconActivity,
  IconFlask,
  IconTarget,
  IconRadar,
  IconBan,
  IconUsers,
  IconSiren,
  IconSearch,
  IconChevronDown,
  IconInfo,
  IconHelpCircle,
  IconShare,
  IconCheck,
} from './icons'
import { SummaryCard } from './SummaryCard'
import { AppearanceSettings } from './AppearanceSettings'
import { Brand } from './Brand'
import { ConfirmDialog } from './ConfirmDialog'
import { IndustryWorkspaceIcon } from './IndustryWorkspaceIcon'
import { AccountControl } from './AccountControl'
import { IntroDialog } from './IntroDialog'
import { EmptyState, IconChiclet } from './SurfaceState'
import { titleCase } from './formatters'
import { API_URL, apiAuthHeaders, apiFetch } from './api'
import { buildPath, navigate, navigateToPath, surfaceOwnsDraft, surfaceShowsSummary, useRoute, workspaceSurfaces, type SurfaceId } from './router'
import { useMessages, type MessageKey } from './i18n/messages'
import { PanelCollapseButton, usePersistentCollapsed } from './PanelCollapseButton'

const WorkspaceOntologyStudio = lazy(() => import('./WorkspaceOntologyStudio').then((module) => ({ default: module.WorkspaceOntologyStudio })))
const NewContractWizard = lazy(() => import('./NewContractWizard').then((module) => ({ default: module.NewContractWizard })))
const SourceBindingStudio = lazy(() => import('./SourceBindingStudio').then((module) => ({ default: module.SourceBindingStudio })))
const AssuranceStudio = lazy(() => import('./AssuranceStudio').then((module) => ({ default: module.AssuranceStudio })))
const PolicyStudio = lazy(() => import('./PolicyStudio').then((module) => ({ default: module.PolicyStudio })))
const RuntimeStudio = lazy(() => import('./RuntimeStudio').then((module) => ({ default: module.RuntimeStudio })))
const EvidenceRegistryStudio = lazy(() => import('./EvidenceRegistryStudio').then((module) => ({ default: module.EvidenceRegistryStudio })))
const ReleaseManagementStudio = lazy(() => import('./ReleaseManagementStudio').then((module) => ({ default: module.ReleaseManagementStudio })))
const RuntimeApprovalStudio = lazy(() => import('./RuntimeApprovalStudio').then((module) => ({ default: module.RuntimeApprovalStudio })))
const ContractsStudio = lazy(() => import('./ContractsStudio').then((module) => ({ default: module.ContractsStudio })))
const ContractEditorStudio = lazy(() => import('./ContractEditorStudio').then((module) => ({ default: module.ContractEditorStudio })))
const IntegrationsStudio = lazy(() => import('./IntegrationsStudio').then((module) => ({ default: module.IntegrationsStudio })))
const ImportStudio = lazy(() => import('./ImportStudio').then((module) => ({ default: module.ImportStudio })))
const WelcomeStudio = lazy(() => import('./WelcomeStudio').then((module) => ({ default: module.WelcomeStudio })))
const DispositionTrailStudio = lazy(() => import('./DispositionTrailStudio').then((module) => ({ default: module.DispositionTrailStudio })))
const ExecutionsStudio = lazy(() => import('./ExecutionsStudio').then((module) => ({ default: module.ExecutionsStudio })))
const CaseSetStudio = lazy(() => import('./CaseSetStudio').then((module) => ({ default: module.CaseSetStudio })))
const EvaluationRunsStudio = lazy(() => import('./EvaluationRunsStudio').then((module) => ({ default: module.EvaluationRunsStudio })))
const ReviewInboxStudio = lazy(() => import('./ReviewInboxStudio').then((module) => ({ default: module.ReviewInboxStudio })))
const NegativeDecisionStudio = lazy(() => import('./NegativeDecisionStudio').then((module) => ({ default: module.NegativeDecisionStudio })))
const DriftStudio = lazy(() => import('./DriftStudio').then((module) => ({ default: module.DriftStudio })))
const IdentitiesStudio = lazy(() => import('./IdentitiesStudio').then((module) => ({ default: module.IdentitiesStudio })))
const EmergencyAuthStudio = lazy(() => import('./EmergencyAuthStudio').then((module) => ({ default: module.EmergencyAuthStudio })))
const ActivityFeedStudio = lazy(() => import('./ActivityFeedStudio').then((module) => ({ default: module.ActivityFeedStudio })))
const CommandPalette = lazy(() => import('./CommandPalette').then((module) => ({ default: module.CommandPalette })))

const ACTIVE_CONTRACT_KEY = 'lattice:active-contract'
const ACTIVE_WORKSPACE_KEY = 'lattice:active-workspace'
const WELCOME_DISMISSED_KEY = 'lattice:welcome-dismissed'
/** Long enough that typing does not queue a request per keystroke, short enough to feel automatic. */
const AUTOSAVE_IDLE_MS = 2000

type CountKind = 'contracts' | 'ontology-bindings' | 'tests' | 'bindings' | 'policies' | 'reviews' | 'evidence'

interface NavEntry {
  surface: SurfaceId
  icon: ReactNode
  label: MessageKey
  count?: CountKind
}

/**
 * Task-shaped information architecture (E2, fixes G9). The object-centric list —
 * Ontology / Bindings / Contracts / Compiler / Assurance / Policies / … — is a correct
 * data model and a useless job model. These four groups are the jobs.
 */
const navigationGroups: ReadonlyArray<{ label: MessageKey; items: readonly NavEntry[] }> = [
  {
    label: 'navGroupBuild',
    items: [
      { surface: 'ontology', icon: <IconNetwork />, label: 'navSharedOntology' },
      { surface: 'ontology-bindings', icon: <IconLink />, label: 'navOntologyBindings', count: 'ontology-bindings' },
      { surface: 'contracts', icon: <IconFileText />, label: 'navContracts', count: 'contracts' },
      { surface: 'contract-editor', icon: <IconFileText />, label: 'navContractEditor' },
      { surface: 'bindings', icon: <IconPlug />, label: 'navSourceBindings', count: 'bindings' },
    ],
  },
  {
    label: 'navGroupOperate',
    items: [
      { surface: 'compiler', icon: <IconPlay />, label: 'navCompiler' },
      { surface: 'dispositions', icon: <IconHistory />, label: 'navDispositionTrail' },
      { surface: 'executions', icon: <IconActivity />, label: 'navExecutions' },
      { surface: 'integrations', icon: <IconPlug />, label: 'navIntegrations' },
      { surface: 'runtime-approvals', icon: <IconUserCheck />, label: 'navRuntimeApprovals' },
      { surface: 'emergency', icon: <IconSiren />, label: 'navEmergencyAuthorization' },
    ],
  },
  {
    label: 'navGroupGovern',
    items: [
      { surface: 'reviews', icon: <IconInbox />, label: 'navReviewInbox', count: 'reviews' },
      { surface: 'policies', icon: <IconScale />, label: 'navPolicyProfiles', count: 'policies' },
      { surface: 'evidence', icon: <IconFileSearch />, label: 'navEvidenceRegistry', count: 'evidence' },
      { surface: 'negative-decisions', icon: <IconBan />, label: 'navNegativeDecisions' },
      { surface: 'identities', icon: <IconUsers />, label: 'navIdentities' },
      { surface: 'releases', icon: <IconGitBranch />, label: 'navReleaseHistory' },
    ],
  },
  {
    label: 'navGroupAssure',
    items: [
      { surface: 'assurance', icon: <IconShieldCheck />, label: 'navAssurance', count: 'tests' },
      { surface: 'evaluations', icon: <IconFlask />, label: 'navEvaluations' },
      { surface: 'case-sets', icon: <IconTarget />, label: 'navCaseSets' },
      { surface: 'drift', icon: <IconRadar />, label: 'navDriftSourceHealth' },
    ],
  },
]

const allNavigation: readonly NavEntry[] = navigationGroups.flatMap((group) => group.items)

const NAV_GROUPS_KEY = 'lattice:nav-groups-open'

function loadOpenNavGroups(): readonly string[] {
  try {
    const saved = localStorage.getItem(NAV_GROUPS_KEY)
    const parsed: unknown = saved ? JSON.parse(saved) : null
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

/** Named so the empty state can explain the prerequisite instead of silently redirecting (G8). */
const surfacePrerequisite: Partial<Record<SurfaceId, MessageKey>> = {
  'contract-editor': 'emptyNeedsContractEditor',
  compiler: 'emptyNeedsContractCompiler',
  bindings: 'emptyNeedsContractBindings',
  assurance: 'emptyNeedsContractAssurance',
  policies: 'emptyNeedsContractPolicies',
  evidence: 'emptyNeedsContractEvidence',
  releases: 'emptyNeedsContractReleases',
  dispositions: 'emptyNeedsContractDispositions',
  executions: 'emptyNeedsContractExecutions',
  'runtime-approvals': 'emptyNeedsContractApprovals',
  evaluations: 'emptyNeedsContractEvaluations',
  emergency: 'emptyNeedsContractEmergency',
}

export function App() {
  const { t } = useMessages()
  const route = useRoute()
  const [contract, setContract] = useState<ContextContract>(loadContractDraft)
  const [dirtySurfaces, setDirtySurfaces] = useState<Partial<Record<SurfaceId, boolean>>>({})
  const [contracts, setContracts] = useState<ContractSummary[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [workspace, setWorkspace] = useState<IndustryWorkspace>()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [welcomeOpen, setWelcomeOpen] = useState(() => localStorage.getItem(WELCOME_DISMISSED_KEY) !== 'true')
  const [introOpen, setIntroOpen] = useState(false)
  const { collapsed: navigationCollapsed, toggleCollapsed: toggleNavigation } = usePersistentCollapsed('lattice:navigation-collapsed')
  const [openNavGroups, setOpenNavGroups] = useState<readonly string[]>(loadOpenNavGroups)
  const [pendingNavigation, setPendingNavigation] = useState<{ kind: 'CONTRACT' | 'WORKSPACE'; id: string; target?: SurfaceId }>()
  const [shareState, setShareState] = useState<'IDLE' | 'COPIED' | 'FAILED'>('IDLE')
  const [saveState, setSaveState] = useState<'IDLE' | 'SAVING' | 'FAILED'>('IDLE')
  const [apiHealth, setApiHealth] = useState<{ status: 'CHECKING' | 'HEALTHY' | 'OFFLINE'; latencyMs?: number }>({ status: 'CHECKING' })

  const surface = route.surface
  const draftDirty = Object.values(dirtySurfaces).some(Boolean)
  const reviewQueueCount = contract.entityTypes.filter((type) => ['DRAFT', 'IN_REVIEW', 'REJECTED'].includes(type.approvalStatus)).length + contract.bindings.filter((binding) => ['DRAFT', 'IN_REVIEW', 'REJECTED'].includes(binding.approvalStatus)).length + contract.policies.filter((policy) => ['DRAFT', 'IN_REVIEW', 'REJECTED'].includes(policy.approvalStatus)).length
  const runtimeStatus = contracts.find((summary) => summary.contractId === contract.id)?.runtimeStatus ?? (contract.releaseStatus === 'PUBLISHED' ? 'ACTIVE' : 'NO_RELEASE')
  const workspaceContracts = contracts.filter((summary) => !workspace || summary.workspaceId === workspace.id)
  const viewedContractId = route.contractId ?? contract.id
  const hasActiveWorkspaceContract = workspaceContracts.some((summary) => summary.contractId === viewedContractId)
  const navigationCounts: Record<CountKind, number> = {
    contracts: workspaceContracts.length,
    'ontology-bindings': workspace?.ontology.bindings?.length ?? 0,
    tests: hasActiveWorkspaceContract ? contract.tests.length : 0,
    bindings: hasActiveWorkspaceContract ? contract.bindings.length : 0,
    policies: hasActiveWorkspaceContract ? contract.policies.length : 0,
    reviews: hasActiveWorkspaceContract ? reviewQueueCount : 0,
    evidence: hasActiveWorkspaceContract ? contract.evidence.length : 0,
  }
  const activeNavigation = allNavigation.find((item) => item.surface === surface)
  const workspaceMode = surface === 'ontology' || surface === 'ontology-bindings'
  // Draft state belongs to the surfaces that can edit one. Elsewhere it is a
  // permanently disabled button and a reassurance about something the screen
  // cannot change — but keep it visible if an edit is still unsaved, so
  // navigating away never hides pending work.
  const showDraftControls = (workspaceMode || hasActiveWorkspaceContract) && (surfaceOwnsDraft(surface) || draftDirty || saveState !== 'IDLE')
  // Autosave persists the draft on a debounce, so a Save button that is only ever
  // enabled by the same condition autosave fires on is a disabled button almost
  // all the time — and on these eight surfaces it also pushed the header action
  // row onto five wrapped lines and squeezed the breadcrumb into an ellipsis.
  // Render it when there is genuinely something to save or retry.
  const showSaveDraftButton = showDraftControls && (draftDirty || saveState !== 'IDLE') && (workspaceMode ? Boolean(workspace) : hasActiveWorkspaceContract)
  // The header names the contract exactly where a surface reads one. The
  // workspace-only surfaces have no contract to name, and saying so would be a
  // lie about which record the screen is showing — they fall back to the
  // workspace, which is what they actually operate on.
  const headerContext = !workspaceSurfaces.includes(surface) && hasActiveWorkspaceContract
    ? contract.name
    : workspace?.name ?? titleCase(contract.domain)
  const contractRequired = !workspaceSurfaces.includes(surface) && !route.detailId
  const contractMissing = contractRequired && !hasActiveWorkspaceContract
  const summaryCards = buildSummaryCards({ t, workspaceMode, workspace, workspaceContracts, contract, hasActiveWorkspaceContract, draftDirty, runtimeStatus })

  useEffect(() => {
    const controller = new AbortController()
    const initial = new URL(window.location.href)
    /*
     * The path as it was when this started. Restoring the last active contract is only correct
     * while the user has not gone anywhere: these fetches can land after a contract has been
     * created or selected, and applying a stale result then silently throws that away.
     */
    const startedAtPath = window.location.pathname
    const superseded = () => window.location.pathname !== startedAtPath
    const activeContractId = initial.searchParams.get('contract') ?? currentContractIdFromPath() ?? localStorage.getItem(ACTIVE_CONTRACT_KEY) ?? counterpartyRiskContract.id
    void Promise.all([
      fetch(`${API_URL}/v1/contracts`, { headers: apiAuthHeaders(), signal: controller.signal }),
      fetch(`${API_URL}/v1/contracts/${activeContractId}`, { headers: apiAuthHeaders(), signal: controller.signal }),
      fetch(`${API_URL}/v1/workspaces`, { headers: apiAuthHeaders(), signal: controller.signal }),
    ]).then(async ([listResponse, entryResponse, workspaceListResponse]) => {
        if (listResponse.ok) setContracts(await listResponse.json() as ContractSummary[])
        const workspaceSummaries = workspaceListResponse.ok ? await workspaceListResponse.json() as WorkspaceSummary[] : []
        setWorkspaces(workspaceSummaries)
        if (superseded()) return
        if (entryResponse.ok) {
          const entry = await entryResponse.json() as ContractRegistryEntry
          setContract(entry.draft)
          localStorage.setItem('lattice:contract-draft', JSON.stringify(entry.draft))
          const workspaceId = initial.searchParams.get('workspace') ?? currentWorkspaceIdFromPath() ?? localStorage.getItem(ACTIVE_WORKSPACE_KEY) ?? entry.draft.ontologyRef?.workspaceId ?? workspaceSummaries.find((item) => item.domain === entry.draft.domain)?.id
          if (workspaceId) {
            const workspaceResponse = await fetch(`${API_URL}/v1/workspaces/${workspaceId}`, { headers: apiAuthHeaders(), signal: controller.signal })
            if (workspaceResponse.ok) {
              const loaded = await workspaceResponse.json() as IndustryWorkspace
              if (superseded()) return
              setWorkspace(loaded)
              navigate({ workspaceId: loaded.id, contractId: entry.contractId, surface: parseRouteSurface() }, { replace: true })
              return
            }
          }
          if (!superseded()) navigate({ contractId: entry.contractId, surface: parseRouteSurface() }, { replace: true })
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  /** A deep link that names a different contract than the loaded one wins. */
  useEffect(() => {
    if (!route.contractId || route.contractId === contract.id) return
    void loadContract(route.contractId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.contractId])

  useEffect(() => {
    if (!route.workspaceId || route.workspaceId === workspace?.id) return
    if (!workspaces.some((summary) => summary.id === route.workspaceId)) return
    void loadWorkspace(route.workspaceId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.workspaceId, workspaces.length])

  function setSurfaceDirty(target: SurfaceId, dirty: boolean) {
    setDirtySurfaces((current) => current[target] === dirty ? current : { ...current, [target]: dirty })
  }

  async function loadContract(contractId: string) {
    const response = await fetch(`${API_URL}/v1/contracts/${contractId}`, { headers: apiAuthHeaders() })
    if (!response.ok) return
    const entry = await response.json() as ContractRegistryEntry
    setContract(entry.draft)
    setDirtySurfaces({})
    localStorage.setItem(ACTIVE_CONTRACT_KEY, entry.contractId)
    localStorage.setItem('lattice:contract-draft', JSON.stringify(entry.draft))
  }

  async function loadWorkspace(workspaceId: string) {
    const response = await fetch(`${API_URL}/v1/workspaces/${workspaceId}`, { headers: apiAuthHeaders() })
    if (!response.ok) return
    setWorkspace(await response.json() as IndustryWorkspace)
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId)
  }

  function selectContract(contractId: string, skipDirtyCheck = false, target?: SurfaceId) {
    if (!skipDirtyCheck && draftDirty) {
      setPendingNavigation({ kind: 'CONTRACT', id: contractId, ...(target ? { target } : {}) })
      return
    }
    navigate({ ...(workspace ? { workspaceId: workspace.id } : {}), contractId, surface: target ?? surface })
  }

  async function selectWorkspace(workspaceId: string, skipDirtyCheck = false) {
    if (!skipDirtyCheck && draftDirty) {
      setPendingNavigation({ kind: 'WORKSPACE', id: workspaceId })
      return
    }
    await loadWorkspace(workspaceId)
    const nextContract = contracts.find((item) => item.workspaceId === workspaceId)
    setDirtySurfaces({})
    if (nextContract) {
      if (nextContract.contractId !== contract.id) await loadContract(nextContract.contractId)
      navigate({ workspaceId, contractId: nextContract.contractId, surface: 'ontology' })
    } else {
      localStorage.removeItem(ACTIVE_CONTRACT_KEY)
      navigate({ workspaceId, surface: 'ontology' })
    }
  }

  async function handleContractCreated(entry: ContractRegistryEntry) {
    const listResponse = await fetch(`${API_URL}/v1/contracts`, { headers: apiAuthHeaders() })
    if (listResponse.ok) setContracts(await listResponse.json() as ContractSummary[])
    setContract(entry.draft)
    setDirtySurfaces({})
    setWizardOpen(false)
    localStorage.setItem(ACTIVE_CONTRACT_KEY, entry.contractId)
    localStorage.setItem('lattice:contract-draft', JSON.stringify(entry.draft))
    const workspaceId = entry.draft.ontologyRef?.workspaceId
    if (workspaceId) {
      const response = await fetch(`${API_URL}/v1/workspaces/${workspaceId}`, { headers: apiAuthHeaders() })
      if (response.ok) setWorkspace(await response.json() as IndustryWorkspace)
    }
    navigate({ ...(workspaceId ? { workspaceId } : {}), contractId: entry.contractId, surface: 'contracts' })
  }

  async function handleRegistryChange(entry: ContractRegistryEntry) {
    setContract(entry.draft)
    setDirtySurfaces({})
    localStorage.setItem('lattice:contract-draft', JSON.stringify(entry.draft))
    const listResponse = await fetch(`${API_URL}/v1/contracts`, { headers: apiAuthHeaders() })
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

  /** Shares the current *view*, not just the contract (E1). */
  async function shareView() {
    const url = new URL(buildPath({ ...(workspace ? { workspaceId: workspace.id } : {}), ...(hasActiveWorkspaceContract ? { contractId: contract.id } : {}), surface, ...(route.detailId ? { detailId: route.detailId } : {}) }), window.location.origin)
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
      const entry = await apiFetch<ContractRegistryEntry>(`/v1/contracts/${contract.id}`, { method: 'PUT', json: { contract } })
      await handleRegistryChange(entry)
      setSaveState('IDLE')
    } catch {
      setSaveState('FAILED')
    }
  }

  async function saveWorkspaceOntology() {
    if (!workspace || !workspaceMode || !draftDirty || saveState === 'SAVING') return
    setSaveState('SAVING')
    try {
      const updated = await apiFetch<IndustryWorkspace>(`/v1/workspaces/${workspace.id}/ontology`, { method: 'PUT', json: { ontology: workspace.ontology } })
      handleWorkspaceChange(updated)
      setDirtySurfaces({})
      setSaveState('IDLE')
    } catch {
      setSaveState('FAILED')
    }
  }

  async function saveActiveDraft() {
    if (workspaceMode) await saveWorkspaceOntology()
    else await saveContractDraft()
  }

  /*
   * Autosave (E22). Debounced on the draft itself, so each edit restarts the clock and a burst of
   * typing costs one request. It stops after a failure rather than retrying on a timer: the header
   * reports it, and the Save button is the deliberate retry.
   */
  useEffect(() => {
    if (!draftDirty || saveState !== 'IDLE') return
    if (workspaceMode ? !workspace : !hasActiveWorkspaceContract) return
    const timer = window.setTimeout(() => void saveActiveDraft(), AUTOSAVE_IDLE_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftDirty, saveState, workspaceMode, contract, workspace])

  function closeWelcome() {
    localStorage.setItem(WELCOME_DISMISSED_KEY, 'true')
    setWelcomeOpen(false)
  }

  async function exploreExample(contractId: string) {
    await loadContract(contractId)
    closeWelcome()
    const summary = contracts.find((item) => item.contractId === contractId)
    navigate({ ...(summary?.workspaceId ? { workspaceId: summary.workspaceId } : {}), contractId, surface: 'compiler' })
  }

  function confirmNavigation() {
    const pending = pendingNavigation
    setPendingNavigation(undefined)
    setDirtySurfaces({})
    if (!pending) return
    if (pending.kind === 'CONTRACT') selectContract(pending.id, true, pending.target)
    else void selectWorkspace(pending.id, true)
  }

  function navigateTo(target: SurfaceId, detailId?: string) {
    navigate({ ...(workspace ? { workspaceId: workspace.id } : {}), ...(hasActiveWorkspaceContract ? { contractId: contract.id } : {}), surface: target, ...(detailId ? { detailId } : {}) })
  }

  const surfaceNavigation = { onNavigate: navigateTo, onNavigatePath: navigateToPath }

  return (
    <div className={`shell ${navigationCollapsed ? 'nav-collapsed' : ''}`}>
      <aside className="sidebar" id="primary-navigation">
        <div className="sidebar-brand-row">
          <Brand />
          <PanelCollapseButton
            collapsed={navigationCollapsed}
            collapseLabel={t('collapseNavigation')}
            expandLabel={t('expandNavigation')}
            panelId="primary-navigation"
            side="left"
            onToggle={toggleNavigation}
          />
        </div>
        <div className="workspace-switcher"><span className="workspace-icon"><IndustryWorkspaceIcon domain={workspace?.domain} /></span><div><label htmlFor="active-workspace">{t('industryWorkspace')}</label><select id="active-workspace" value={workspace?.id ?? ''} onChange={(event) => void selectWorkspace(event.target.value)}>{!workspace && <option value="">{t('workspaceLoading')}</option>}{workspaces.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><span>{workspace ? t('workspaceFoundationMeta', { types: workspace.ontology.entityTypes.length, contracts: workspace.contractIds.length }) : t('crossIndustryPlane')}</span></div></div>
        <nav>
          <NavItem icon={<IconSearch />} label={t('navSearch')} count="⌘K" onClick={() => setPaletteOpen(true)} />
          <NavItem icon={<IconActivity />} label={t('navActivity')} active={surface === 'activity'} onClick={() => navigateTo('activity')} />
          {navigationGroups.map((group) => {
            // The group holding the current surface stays open: collapsing the
            // user's own location is disorienting, so it is not a toggle target.
            const holdsActive = group.items.some((item) => item.surface === surface)
            const open = holdsActive || openNavGroups.includes(group.label)
            const pending = group.items.reduce((total, item) => total + (item.count ? navigationCounts[item.count] : 0), 0)
            return <div className="nav-group" key={group.label}>
              <button
                type="button"
                className="nav-group-toggle"
                aria-expanded={open}
                aria-controls={`nav-group-${group.label}`}
                onClick={() => setOpenNavGroups((previous) => {
                  const next = previous.includes(group.label)
                    ? previous.filter((entry) => entry !== group.label)
                    : [...previous, group.label]
                  localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(next))
                  return next
                })}
              >
                <span className="nav-label">{t(group.label)}</span>
                {!open && pending > 0 && <em className="nav-group-count">{pending}</em>}
                <span className="nav-group-chevron" aria-hidden="true"><IconChevronDown /></span>
              </button>
              <div className="nav-group-items" id={`nav-group-${group.label}`} hidden={!open}>
                {group.items.map((item) => <NavItem icon={item.icon} label={t(item.label)} count={item.count ? String(navigationCounts[item.count]) : undefined} active={surface === item.surface} onClick={() => navigateTo(item.surface)} key={item.surface} />)}
                {group.label === 'navGroupBuild' && <>
                  <NavItem icon={<IconDownload />} label={t('ontologyImportSchema')} onClick={() => setImportOpen(true)} />
                  <NavItem icon={<IconPlus />} label={t('navNewContextContract')} onClick={() => setWizardOpen(true)} />
                </>}
              </div>
            </div>
          })}
        </nav>
        <div className="sidebar-footer"><span className={`status-dot ${apiHealth.status.toLocaleLowerCase()}`}/><div><b>{apiHealth.status === 'HEALTHY' ? t('runtimeHealthy') : apiHealth.status === 'OFFLINE' ? t('runtimeOffline') : t('runtimeChecking')}</b><span>{apiHealth.status === 'HEALTHY' ? t('runtimeLatency', { latency: apiHealth.latencyMs ?? 0 }) : apiHealth.status === 'OFFLINE' ? t('runtimeUnreachable') : t('runtimeProbing')}</span></div></div>
      </aside>

      <main>
        <header>
          <div className="header-identity">
            {/* Names the record this surface reads, which on the contract-scoped
              * surfaces was stated nowhere. One segment, not a workspace/contract
              * trail: the header has ~230px next to its controls, and two segments
              * competing for it clipped both. The sidebar switcher already names
              * the workspace, so the contract is the segment that earns the line. */}
            <div className="eyebrow header-context" title={headerContext}>{headerContext}</div>
            <h1>{activeNavigation ? t(activeNavigation.label) : t(surface === 'activity' ? 'navActivity' : 'navSharedOntology')}</h1>
          </div>
          <div className="header-actions">
            {showDraftControls && <span className={`draft-state ${saveState === 'SAVING' ? 'saving' : draftDirty ? 'dirty' : ''}`} aria-live="polite">{saveState === 'FAILED' ? t('headerSaveFailed') : saveState === 'SAVING' ? t('headerSaving') : draftDirty ? t('headerAutosavePending') : t('draftSaved')}</span>}
            {showSaveDraftButton && <button className="release" onClick={() => void saveActiveDraft()} disabled={saveState === 'SAVING'}>{saveState === 'SAVING' ? t('commonSaving') : saveState === 'FAILED' ? t('commonRetrySave') : t('commonSaveDraft')}</button>}
            {/* Icon chiclets. Six labelled controls read as six competing
              * decisions; none of them is one the page is asking you to make.
              * The name moves to a tooltip and stays on the element as an
              * aria-label, so it is deferred rather than dropped. Save draft
              * keeps its words — it is the only one here with a consequence. */}
            <IconChiclet icon={<IconInfo />} label={t('introOpen')} onClick={() => setIntroOpen(true)} />
            <IconChiclet icon={<IconHelpCircle />} label={t('welcomeHelp')} onClick={() => setWelcomeOpen(true)} />
            <AppearanceSettings />
            <IconChiclet
              icon={shareState === 'COPIED' ? <IconCheck /> : <IconShare />}
              label={shareState === 'COPIED' ? t('linkCopied') : shareState === 'FAILED' ? t('linkClipboardDenied') : t('shareView')}
              onClick={() => void shareView()}
            />
            <AccountControl />
          </div>
        </header>

        {surfaceShowsSummary(surface) && <section className="summary-grid">
          {summaryCards.map((card) => <SummaryCard {...card} key={card.label} />)}
        </section>}

        <Suspense fallback={<StudioLoading label={activeNavigation ? t(activeNavigation.label) : t('navActivity')} />}>
          {contractMissing
            ? <EmptyState title={t('emptyNoContractTitle')} description={t(surfacePrerequisite[surface] ?? 'emptyNeedsContractGeneric')} icon={<IconFileText />} actionLabel={t('contractsNew')} onAction={() => setWizardOpen(true)} {...(workspaceContracts.length > 0 ? { secondaryLabel: t('emptyChooseContract'), onSecondary: () => navigateTo('contracts') } : {})} />
            : renderSurface()}
        </Suspense>
      </main>
      <Suspense fallback={null}>
        {paletteOpen && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} {...(workspace ? { workspaceId: workspace.id } : {})} contracts={workspaceContracts} onNavigatePath={navigateToPath} onSelectContract={(id) => selectContract(id)} />}
        {wizardOpen && <NewContractWizard {...(workspace ? { workspace } : {})} onClose={() => setWizardOpen(false)} onCreated={(entry) => void handleContractCreated(entry)} />}
        {importOpen && <ImportStudio contract={workspace ? workspaceBindingContract(workspace, contract) : contract} onClose={() => setImportOpen(false)} onApply={(next) => {
          if (workspace) setWorkspace({ ...workspace, ontology: { ...workspace.ontology, entityTypes: next.entityTypes, relationshipTypes: next.relationshipTypes, schemaLayout: next.schemaLayout ?? {} } })
          else setContract(next)
          setSurfaceDirty('ontology', true)
          setImportOpen(false)
          navigateTo('ontology')
        }} />}
        {introOpen && <IntroDialog onClose={() => setIntroOpen(false)} />}
        {welcomeOpen && <WelcomeStudio contracts={contracts} onClose={closeWelcome} onExplore={(id) => void exploreExample(id)} onCreate={() => { closeWelcome(); setWizardOpen(true) }} />}
      </Suspense>
      {pendingNavigation && <ConfirmDialog title={t('discardChangesTitle')} description={t('discardChanges')} cancelLabel={t('commonCancel')} confirmLabel={t('discardChangesConfirm')} onCancel={() => setPendingNavigation(undefined)} onConfirm={confirmNavigation} />}
    </div>
  )

  function renderSurface(): ReactNode {
    switch (surface) {
      case 'ontology':
        return workspace ? <WorkspaceOntologyStudio key={workspace.id} workspace={workspace} seedContract={contract} onWorkspaceDraftChange={setWorkspace} onDirtyChange={(dirty) => setSurfaceDirty('ontology', dirty)} /> : <StudioLoading label={t('workspaceLoading')} />
      case 'ontology-bindings':
        return workspace ? <SourceBindingStudio contract={workspaceBindingContract(workspace, contract)} scope="ONTOLOGY" workspaceId={workspace.id} onChange={(next) => { setWorkspace((current) => current ? { ...current, ontology: { ...current.ontology, bindings: next.bindings } } : current); setSurfaceDirty('ontology-bindings', true) }} onDirtyChange={(dirty) => setSurfaceDirty('ontology-bindings', dirty)} onOpenOntology={() => navigateTo('ontology')} /> : <StudioLoading label={t('workspaceLoading')} />
      case 'contracts':
        return <ContractsStudio contracts={workspaceContracts} activeContractId={contract.id} onSelect={(id) => selectContract(id, false, 'compiler')} onEdit={(id) => selectContract(id, false, 'contract-editor')} onCreate={() => setWizardOpen(true)} />
      case 'contract-editor':
        return <ContractEditorStudio contract={contract} onChange={setContract} onDirtyChange={(dirty) => setSurfaceDirty('contract-editor', dirty)} onBack={() => navigateTo('contracts')} />
      case 'integrations':
        return <IntegrationsStudio />
      case 'bindings':
        return <SourceBindingStudio contract={contract} onChange={setContract} onDirtyChange={(dirty) => setSurfaceDirty('bindings', dirty)} onOpenOntology={() => navigateTo('ontology')} />
      case 'compiler':
        return <RuntimeStudio key={contract.id} contract={contract} runtimeStatus={runtimeStatus} onChange={setContract} onDirtyChange={(dirty) => setSurfaceDirty('compiler', dirty)} onManageRelease={() => navigateTo('releases')} onOpenAssurance={() => navigateTo('assurance')} {...surfaceNavigation} />
      case 'dispositions':
        return <DispositionTrailStudio contract={contract} {...(workspace ? { workspaceId: workspace.id } : {})} {...(route.detailId ? { detailId: route.detailId } : {})} {...surfaceNavigation} />
      case 'executions':
        return <ExecutionsStudio contract={contract} {...surfaceNavigation} />
      case 'runtime-approvals':
        return <RuntimeApprovalStudio contract={contract} onChange={setContract} onDirtyChange={(dirty) => setSurfaceDirty('runtime-approvals', dirty)} onOpenReviews={() => navigateTo('reviews')} onOpenAssurance={() => navigateTo('assurance')} onManageRelease={() => navigateTo('releases')} />
      case 'emergency':
        return <EmergencyAuthStudio {...(workspace ? { workspaceId: workspace.id } : {})} contract={contract} {...(route.detailId ? { detailId: route.detailId } : {})} {...surfaceNavigation} />
      case 'reviews':
        return <ReviewInboxStudio {...(workspace ? { workspaceId: workspace.id } : {})} contracts={workspaceContracts} activeContractId={contract.id} {...(route.detailId ? { detailId: route.detailId } : {})} onSelectContract={(id) => selectContract(id)} {...surfaceNavigation} />
      case 'policies':
        return <PolicyStudio contract={contract} onChange={setContract} onDirtyChange={(dirty) => setSurfaceDirty('policies', dirty)} />
      case 'evidence':
        return <EvidenceRegistryStudio contract={contract} />
      case 'negative-decisions':
        return <NegativeDecisionStudio {...(workspace ? { workspaceId: workspace.id } : {})} contract={contract} {...(route.detailId ? { detailId: route.detailId } : {})} {...surfaceNavigation} />
      case 'identities':
        return <IdentitiesStudio {...(workspace ? { workspaceId: workspace.id } : {})} {...(route.detailId ? { detailId: route.detailId } : {})} {...surfaceNavigation} />
      case 'releases':
        return <ReleaseManagementStudio contract={contract} onRegistryChange={(entry) => void handleRegistryChange(entry)} onManageDraft={() => navigateTo('contracts')} />
      case 'assurance':
        return <AssuranceStudio contract={contract} onChange={setContract} onDirtyChange={(dirty) => setSurfaceDirty('assurance', dirty)} />
      case 'evaluations':
        return <EvaluationRunsStudio contract={contract} {...(workspace ? { workspaceId: workspace.id } : {})} {...(route.detailId ? { detailId: route.detailId } : {})} {...surfaceNavigation} />
      case 'case-sets':
        return <CaseSetStudio contract={contract} {...(workspace ? { workspaceId: workspace.id } : {})} {...(route.detailId ? { detailId: route.detailId } : {})} {...surfaceNavigation} />
      case 'drift':
        return <DriftStudio {...(workspace ? { workspaceId: workspace.id } : {})} contract={contract} {...(route.detailId ? { detailId: route.detailId } : {})} {...surfaceNavigation} />
      case 'activity':
        return <ActivityFeedStudio {...(workspace ? { workspaceId: workspace.id } : {})} contract={contract} onNavigatePath={navigateToPath} />
    }
  }
}

function parseRouteSurface(): SurfaceId {
  return new URL(window.location.href).pathname.split('/').filter(Boolean).find((segment) => (['ontology', 'ontology-bindings', 'contracts', 'bindings', 'compiler', 'dispositions', 'executions', 'runtime-approvals', 'reviews', 'policies', 'evidence', 'negative-decisions', 'releases', 'assurance', 'evaluations', 'case-sets', 'drift', 'identities', 'emergency', 'activity'] as string[]).includes(segment)) as SurfaceId | undefined ?? 'ontology'
}

function currentContractIdFromPath(): string | undefined {
  const segments = window.location.pathname.split('/').filter(Boolean)
  const index = segments.indexOf('c')
  return index >= 0 && segments[index + 1] ? decodeURIComponent(segments[index + 1]!) : undefined
}

function currentWorkspaceIdFromPath(): string | undefined {
  const segments = window.location.pathname.split('/').filter(Boolean)
  return segments[0] === 'w' && segments[1] ? decodeURIComponent(segments[1]) : undefined
}

function StudioLoading({ label }: { label: string }) {
  return <div className="runtime-empty" role="status"><span aria-hidden="true"><IconLoader /></span><h3>{label}</h3></div>
}

interface SummaryCardModel {
  label: string
  value: string
  meta: string
  tone: 'warning' | 'info' | 'success' | 'brand'
  onClick?: () => void
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
  const go = (surface: SurfaceId) => () => navigate({ ...(workspace ? { workspaceId: workspace.id } : {}), ...(hasActiveWorkspaceContract ? { contractId: contract.id } : {}), surface })
  if (workspaceMode) return [
    {
      label: t('summaryOntologyStatus'),
      value: workspace?.ontology.releaseStatus === 'PUBLISHED' && !draftDirty ? t('statusPublished') : t('statusDraft'),
      meta: `v${workspace?.ontology.version ?? '0.0.0'} · ${t('workspaceOntologyFoundation')}`,
      tone: draftDirty || workspace?.ontology.releaseStatus === 'UNPUBLISHED' ? 'warning' : 'success',
      onClick: go('ontology'),
    },
    {
      label: t('summaryEntityTypes'),
      value: String(workspace?.ontology.entityTypes.length ?? 0),
      meta: workspace?.ontologyGeneration
        ? t('workspaceGeneratedMeta', { forms: workspace.ontologyGeneration.sourceFormCount, mapped: workspace.ontologyGeneration.mappedPercent })
        : t('workspaceSharedAcrossContracts', { count: workspace?.contractIds.length ?? 0 }),
      tone: 'brand',
      onClick: go('ontology'),
    },
    {
      label: t('summaryRelationships'),
      value: String(workspace?.ontology.relationshipTypes.length ?? 0),
      meta: t('typedDirectional'),
      tone: 'info',
      onClick: go('ontology'),
    },
    {
      label: t('summaryContracts'),
      value: String(workspaceContracts.length),
      meta: t('workspaceDecisionContracts'),
      tone: 'info',
      onClick: go('contracts'),
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
      tone: noContract || runtimeStatus === 'SUSPENDED' || contractDraft ? 'warning' : 'success',
      onClick: go('releases'),
    },
    {
      label: t('summaryEntityTypes'),
      value: String(noContract ? 0 : contract.entityTypes.length),
      meta: t('contractsScope'),
      tone: 'brand',
      onClick: go('ontology'),
    },
    {
      label: t('summaryRelationships'),
      value: String(noContract ? 0 : contract.relationshipTypes.length),
      meta: t('typedDirectional'),
      tone: 'info',
      onClick: go('ontology'),
    },
    {
      label: t('summaryAssurance'),
      value: noContract ? '0 / 0' : `${contract.tests.filter((test) => test.status === 'PASS').length} / ${contract.tests.length}`,
      meta: noTests ? t('noTestsConfigured') : t('structuralGatesPassing'),
      tone: noTests ? 'warning' : 'success',
      onClick: go('assurance'),
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
