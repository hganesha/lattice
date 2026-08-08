import { useEffect, useMemo, useState } from 'react'
import { compareContracts, suggestReleaseBump, type ContextContract, type ContractRegistryEntry, type ReleaseChange, type ReleaseDiffArtifact } from '@lattice/contracts'
import { API_URL, apiAuthHeaders } from './api'
import { ConfirmDialog } from './ConfirmDialog'
import { useMessages } from './i18n/messages'
import { Toast } from './Toast'
import { PanelCollapseButton, usePersistentCollapsed } from './PanelCollapseButton'
import { downloadJsonArtifact } from './jsonExport'

interface ReleaseManagementStudioProps {
  contract: ContextContract
  onRegistryChange: (entry: ContractRegistryEntry) => void
  onManageDraft: () => void
}

export function ReleaseManagementStudio({ contract, onRegistryChange, onManageDraft }: ReleaseManagementStudioProps) {
  const { t, formatDate } = useMessages()
  const { collapsed: inspectorCollapsed, toggleCollapsed: toggleInspector } = usePersistentCollapsed('lattice:inspector-collapsed')
  const registryUnavailableMessage = t('releaseRegistryUnavailable')
  const diffFailedMessage = t('releaseDiffFailed')
  const [entry, setEntry] = useState<ContractRegistryEntry>()
  const [selectedDigest, setSelectedDigest] = useState('')
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')
  const [pendingAction, setPendingAction] = useState<'SUSPEND' | 'RESTORE'>()
  const [comparisonDigest, setComparisonDigest] = useState('WORKING_DRAFT')
  const [releaseDiff, setReleaseDiff] = useState<ReleaseDiffArtifact>()
  const [diffLoading, setDiffLoading] = useState(false)
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [rollbackRationale, setRollbackRationale] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`${API_URL}/v1/contracts/${contract.id}`, { headers: apiAuthHeaders(), signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<ContractRegistryEntry> : undefined)
      .then((next) => {
        if (!next) return
        setEntry(next)
        setSelectedDigest((current) => current && next.releases.some((release) => release.digest === current) ? current : next.activeReleaseDigest ?? next.releases.at(-1)?.digest ?? '')
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setNotice(registryUnavailableMessage)
      })
    return () => controller.abort()
  }, [contract.id, registryUnavailableMessage])

  const selectedRelease = entry?.releases.find((release) => release.digest === selectedDigest)
  const activeRelease = entry?.releases.find((release) => release.digest === entry.activeReleaseDigest)
  const workingChanges = useMemo(() => selectedRelease ? compareContracts(selectedRelease.contract, contract) : [], [contract, selectedRelease])
  const changes = comparisonDigest === 'WORKING_DRAFT' ? workingChanges : releaseDiff?.changes ?? []
  const suggestedBump = comparisonDigest === 'WORKING_DRAFT' ? suggestReleaseBump(changes) : releaseDiff?.suggestedBump ?? 'NONE'
  const isSelectedCurrentDraft = selectedRelease?.digest === contract.digest
  const isSelectedActive = selectedRelease?.digest === entry?.activeReleaseDigest

  useEffect(() => {
    if (!selectedRelease || comparisonDigest === 'WORKING_DRAFT') {
      setReleaseDiff(undefined)
      setDiffLoading(false)
      return
    }
    const controller = new AbortController()
    setReleaseDiff(undefined)
    setDiffLoading(true)
    void fetch(`${API_URL}/v1/contracts/${contract.id}/diffs?from=${encodeURIComponent(selectedRelease.digest)}&to=${encodeURIComponent(comparisonDigest)}`, {
      headers: apiAuthHeaders('studio-release-manager'),
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json() as ReleaseDiffArtifact & { error?: string }
      if (!response.ok) throw new Error(payload.error ?? diffFailedMessage)
      setReleaseDiff(payload)
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setNotice(error instanceof Error ? error.message : diffFailedMessage)
    }).finally(() => { if (!controller.signal.aborted) setDiffLoading(false) })
    return () => controller.abort()
  }, [comparisonDigest, contract.id, diffFailedMessage, selectedRelease])

  async function changeRuntimeStatus(status: 'ACTIVE' | 'SUSPENDED', confirmed = false) {
    if (status === 'SUSPENDED' && !confirmed) { setPendingAction('SUSPEND'); return }
    setWorking(true)
    setNotice('')
    try {
      const response = await fetch(`${API_URL}/v1/contracts/${contract.id}/runtime-status`, { method: 'POST', headers: { ...apiAuthHeaders('studio-release-manager'), 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
      const payload = await response.json() as ContractRegistryEntry & { error?: string }
      if (!response.ok) throw new Error(payload.error ?? t('releaseRuntimeChangeFailed'))
      setEntry(payload)
      onRegistryChange(payload)
      setNotice(status === 'SUSPENDED' ? t('releaseSuspendedNotice') : t('releaseResumedNotice'))
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : t('releaseRuntimeChangeFailed'))
    } finally {
      setWorking(false)
    }
  }

  async function restoreSelected(confirmed = false) {
    if (!selectedRelease) return
    if (!confirmed) { setPendingAction('RESTORE'); return }
    setWorking(true)
    setNotice('')
    try {
      const response = await fetch(`${API_URL}/v1/contracts/${contract.id}/restores`, { method: 'POST', headers: { ...apiAuthHeaders('studio-release-manager'), 'Content-Type': 'application/json' }, body: JSON.stringify({ digest: selectedRelease.digest }) })
      const payload = await response.json() as ContractRegistryEntry & { error?: string }
      if (!response.ok) throw new Error(payload.error ?? t('releaseRestoreFailed'))
      setEntry(payload)
      onRegistryChange(payload)
      setNotice(t('releaseRestoredNotice', { version: selectedRelease.version }))
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : t('releaseRestoreFailed'))
    } finally {
      setWorking(false)
    }
  }

  async function rollbackSelected() {
    if (!selectedRelease || !rollbackRationale.trim()) return
    setWorking(true)
    setNotice('')
    try {
      const response = await fetch(`${API_URL}/v1/contracts/${contract.id}/rollbacks`, {
        method: 'POST',
        headers: { ...apiAuthHeaders('studio-release-manager'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ digest: selectedRelease.digest, rationale: rollbackRationale }),
      })
      const payload = await response.json() as { entry?: ContractRegistryEntry; error?: string }
      if (!response.ok || !payload.entry) throw new Error(payload.error ?? t('releaseRollbackFailed'))
      setEntry(payload.entry)
      onRegistryChange(payload.entry)
      setRollbackOpen(false)
      setRollbackRationale('')
      setNotice(t('releaseRollbackNotice', { version: selectedRelease.version }))
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : t('releaseRollbackFailed'))
    } finally {
      setWorking(false)
    }
  }

  function downloadDiff() {
    if (!releaseDiff) return
    downloadJsonArtifact(releaseDiff, `${contract.id}-${releaseDiff.fromRelease.version}-to-${releaseDiff.toRelease.version}-diff.json`)
    setNotice(t('releaseDiffDownloaded'))
  }

  function confirmPendingAction() {
    const action = pendingAction
    setPendingAction(undefined)
    if (action === 'SUSPEND') void changeRuntimeStatus('SUSPENDED', true)
    if (action === 'RESTORE') void restoreSelected(true)
  }

  return <section className="release-management-page">
    <div className="release-hero"><div><span className="panel-kicker">{t('releaseManagementKicker').toLocaleUpperCase()}</span><h2>{t('releaseManagementTitle')}</h2><p>{t('releaseManagementDescription')}</p></div><div><span className={`runtime-state ${(entry?.runtimeStatus ?? 'NO_RELEASE').toLocaleLowerCase()}`}><i />{entry?.runtimeStatus ? t('releaseRuntimeStatus', { status: entry.runtimeStatus.replaceAll('_', ' ') }) : t('commonLoading')}</span>{entry?.runtimeStatus === 'ACTIVE' ? <button className="danger-ghost" onClick={() => void changeRuntimeStatus('SUSPENDED')} disabled={working}>{t('releaseSuspendRuntime')}</button> : entry?.runtimeStatus === 'SUSPENDED' ? <button className="release" onClick={() => void changeRuntimeStatus('ACTIVE')} disabled={working}>{t('releaseResumeRuntime')}</button> : null}</div></div>
    {notice && <Toast message={notice} closeLabel={t('commonClose')} onDismiss={() => setNotice('')} />}
    <div className="release-stats"><article><span>{t('releaseImmutableReleases').toLocaleUpperCase()}</span><b>{entry?.releases.length ?? 0}</b><small>{t('releaseAppendOnly')}</small></article><article><span>{t('releaseActiveVersion').toLocaleUpperCase()}</span><b>{activeRelease ? `v${activeRelease.version}` : '—'}</b><small>{entry?.runtimeStatus === 'SUSPENDED' ? t('releaseRuntimeSuspended') : t('releaseServingCompilation')}</small></article><article><span>{t('releaseDraftDelta').toLocaleUpperCase()}</span><b>{changes.length}</b><small>{t('releaseAgainstSelected')}</small></article><article><span>{t('releaseSuggestedBump').toLocaleUpperCase()}</span><b>{suggestedBump}</b><small>{t('releaseBasedOnImpact')}</small></article></div>
    <div className={`release-layout ${inspectorCollapsed ? 'inspector-collapsed' : ''}`}>
      <main className="release-timeline panel"><header><div><span className="panel-kicker">{t('releaseTimeline').toLocaleUpperCase()}</span><h2>{contract.name}</h2></div><button className="release" onClick={onManageDraft}>{t('releaseManageDraft')} →</button></header><div className="release-list-full">{entry?.releases.length === 0 && <div className="release-empty"><span>◇</span><h3>{t('releaseEmptyTitle')}</h3><p>{t('releaseEmptyDescription')}</p></div>}{entry?.releases.slice().reverse().map((release) => <button className={`release-card ${selectedDigest === release.digest ? 'selected' : ''}`} onClick={() => { setSelectedDigest(release.digest); setRollbackOpen(false); setRollbackRationale('') }} key={release.digest}><span className="release-node"><i /></span><div><span><b>v{release.version}</b>{release.digest === entry.activeReleaseDigest && <em>{t('releaseActive').toLocaleUpperCase()}</em>}</span><h3>{release.notes}</h3><footer><time>{formatDate(release.publishedAt, { dateStyle: 'medium', timeStyle: 'short' })}</time><code>{release.digest.slice(0, 28)}…</code></footer></div><dl><div><dt>{t('contractsTypes')}</dt><dd>{release.contract.entityTypes.length}</dd></div><div><dt>{t('releaseBindings')}</dt><dd>{release.contract.bindings.length}</dd></div><div><dt>{t('releasePolicies')}</dt><dd>{release.contract.policies.length}</dd></div></dl></button>)}</div></main>
      <aside className={`release-detail collapsible-inspector panel ${inspectorCollapsed ? 'collapsed' : ''}`} id="release-inspector">
        <div className="collapsible-inspector-header">
          {!inspectorCollapsed && selectedRelease && <header><div><span className="panel-kicker">{t('releaseInspector').toLocaleUpperCase()}</span><h2>v{selectedRelease.version}</h2></div><span className={isSelectedActive ? 'active-release' : ''}>{isSelectedActive ? t('releaseLive').toLocaleUpperCase() : t('releaseHistorical').toLocaleUpperCase()}</span></header>}
          <PanelCollapseButton collapsed={inspectorCollapsed} collapseLabel={t('collapseInspector')} expandLabel={t('expandInspector')} panelId="release-inspector" side="right" onToggle={toggleInspector} />
        </div>
        {!inspectorCollapsed && (selectedRelease ? <>
        <div className="release-digest"><span>{t('releaseImmutableDigest').toLocaleUpperCase()}</span><code>{selectedRelease.digest}</code></div>
        <div className="release-notes"><span>{t('releaseNotes').toLocaleUpperCase()}</span><p>{selectedRelease.notes}</p></div>
        <dl className="release-versions"><div><dt>{t('releaseVersionSemantic').toLocaleUpperCase()}</dt><dd>{selectedRelease.contract.versions.semantic}</dd></div><div><dt>{t('releaseVersionPolicy').toLocaleUpperCase()}</dt><dd>{selectedRelease.contract.versions.policy}</dd></div><div><dt>{t('releaseVersionBindings').toLocaleUpperCase()}</dt><dd>{selectedRelease.contract.versions.bindings}</dd></div><div><dt>{t('releaseVersionApi').toLocaleUpperCase()}</dt><dd>{selectedRelease.contract.versions.api}</dd></div></dl>
        <button className="restore-button" onClick={() => void restoreSelected()} disabled={working || isSelectedCurrentDraft}>↶ {isSelectedCurrentDraft ? t('releaseDraftMatches') : t('releaseRestoreDraft')}</button>
        <button className="rollback-button" onClick={() => setRollbackOpen((current) => !current)} disabled={working || isSelectedActive}>⇠ {isSelectedActive ? t('releaseAlreadyActive') : t('releaseMakeActive')}</button>
        {rollbackOpen && !isSelectedActive && <div className="release-rollback-form">
          <label>{t('releaseRollbackRationale')}<textarea value={rollbackRationale} onChange={(event) => setRollbackRationale(event.target.value)} placeholder={t('releaseRollbackPlaceholder')} /></label>
          <p>{t('releaseRollbackWarning', { version: selectedRelease.version })}</p>
          <div><button className="ghost" onClick={() => { setRollbackOpen(false); setRollbackRationale('') }}>{t('commonCancel')}</button><button className="danger-ghost" onClick={() => void rollbackSelected()} disabled={working || !rollbackRationale.trim()}>{t('releaseConfirmRollback')}</button></div>
        </div>}
      </> : <div className="release-empty">{t('releaseSelectInspect')}</div>)}</aside>
    </div>
    <section className="release-impact panel"><header><div><span className="panel-kicker">{t('releaseDiffImpact').toLocaleUpperCase()}</span><h2>{selectedRelease ? comparisonDigest === 'WORKING_DRAFT' ? t('releaseWorkingComparison', { version: selectedRelease.version }) : t('releaseReleaseComparison', { from: selectedRelease.version, to: entry?.releases.find((release) => release.digest === comparisonDigest)?.version ?? '—' }) : t('releaseSelectBaseline')}</h2></div>{selectedRelease && <div className="release-diff-controls"><label>{t('releaseCompareTo')}<select value={comparisonDigest} onChange={(event) => setComparisonDigest(event.target.value)}><option value="WORKING_DRAFT">{t('releaseWorkingDraft')}</option>{entry?.releases.map((release) => <option key={release.digest} value={release.digest}>v{release.version}</option>)}</select></label>{releaseDiff && <button className="ghost" onClick={downloadDiff}>{t('releaseDownloadDiff')}</button>}<span className={`bump-pill ${suggestedBump.toLocaleLowerCase()}`}>{t('releaseVersionBump', { bump: suggestedBump }).toLocaleUpperCase()}</span></div>}</header>{diffLoading ? <div className="diff-empty"><div><b>{t('commonLoading')}</b></div></div> : changes.length === 0 ? <div className="diff-empty"><span>✓</span><div><b>{t('releaseNoDifferences')}</b><p>{t('releaseEquivalent')}</p></div></div> : <div className="change-grid">{changes.map((change) => <article key={`${change.kind}:${change.id}`}><span className={change.change.toLocaleLowerCase()}>{change.change[0]}</span><div><small>{changeKindLabel(change.kind, t)}</small><b>{change.label}</b><code>{change.id}</code></div><em className={change.impact.toLocaleLowerCase()}>{change.impact}</em></article>)}</div>}</section>
    {pendingAction && <ConfirmDialog title={pendingAction === 'SUSPEND' ? t('releaseSuspendTitle') : t('releaseRestoreTitle')} description={pendingAction === 'SUSPEND' ? t('releaseSuspendConfirm') : t('releaseRestoreConfirm', { version: selectedRelease?.version ?? '' })} cancelLabel={t('commonCancel')} confirmLabel={pendingAction === 'SUSPEND' ? t('releaseSuspendRuntime') : t('releaseRestoreDraft')} onCancel={() => setPendingAction(undefined)} onConfirm={confirmPendingAction} />}
  </section>
}

function changeKindLabel(kind: ReleaseChange['kind'], t: ReturnType<typeof useMessages>['t']): string {
  const keys = {
    CONTRACT_METADATA: 'releaseKindContractMetadata',
    ENTITY_TYPE: 'releaseKindEntityType',
    RELATIONSHIP_TYPE: 'releaseKindRelationship',
    COMPETENCY_QUESTION: 'releaseKindCompetencyQuestion',
    OPERATION: 'releaseKindOperation',
    SOURCE_BINDING: 'releaseKindSourceBinding',
    POLICY: 'releaseKindPolicy',
    METRIC: 'releaseKindMetric',
    CONTEXT_OBJECT: 'releaseKindContextObject',
    RELATIONSHIP_ASSERTION: 'releaseKindRelationshipAssertion',
    EVIDENCE: 'releaseKindEvidence',
    TEST: 'releaseKindTest',
  } as const
  return t(keys[kind])
}
