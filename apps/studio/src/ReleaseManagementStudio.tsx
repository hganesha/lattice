import { useEffect, useMemo, useState } from 'react'
import type { ContextContract, ContractRegistryEntry, ContractRelease } from '@lattice/contracts'
import { API_URL } from './api'
import { ConfirmDialog } from './ConfirmDialog'
import { useMessages } from './i18n/messages'
import { Toast } from './Toast'

interface ReleaseManagementStudioProps {
  contract: ContextContract
  onRegistryChange: (entry: ContractRegistryEntry) => void
  onManageDraft: () => void
}

interface ContractChange {
  id: string
  kind: string
  label: string
  change: 'ADDED' | 'REMOVED' | 'CHANGED'
  impact: 'PATCH' | 'MINOR' | 'MAJOR'
}

export function ReleaseManagementStudio({ contract, onRegistryChange, onManageDraft }: ReleaseManagementStudioProps) {
  const { t, formatDate } = useMessages()
  const registryUnavailableMessage = t('releaseRegistryUnavailable')
  const [entry, setEntry] = useState<ContractRegistryEntry>()
  const [selectedDigest, setSelectedDigest] = useState('')
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')
  const [pendingAction, setPendingAction] = useState<'SUSPEND' | 'RESTORE'>()

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`${API_URL}/v1/contracts/${contract.id}`, { signal: controller.signal })
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
  const changes = useMemo(() => selectedRelease ? compareContracts(selectedRelease.contract, contract) : [], [contract, selectedRelease])
  const suggestedBump = suggestBump(changes)
  const isSelectedCurrentDraft = selectedRelease?.digest === contract.digest

  async function changeRuntimeStatus(status: 'ACTIVE' | 'SUSPENDED', confirmed = false) {
    if (status === 'SUSPENDED' && !confirmed) { setPendingAction('SUSPEND'); return }
    setWorking(true)
    setNotice('')
    try {
      const response = await fetch(`${API_URL}/v1/contracts/${contract.id}/runtime-status`, { method: 'POST', headers: { Authorization: 'Bearer studio-release-manager', 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
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
      const response = await fetch(`${API_URL}/v1/contracts/${contract.id}/restores`, { method: 'POST', headers: { Authorization: 'Bearer studio-release-manager', 'Content-Type': 'application/json' }, body: JSON.stringify({ digest: selectedRelease.digest }) })
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
    <div className="release-layout">
      <main className="release-timeline panel"><header><div><span className="panel-kicker">{t('releaseTimeline').toLocaleUpperCase()}</span><h2>{contract.name}</h2></div><button className="release" onClick={onManageDraft}>{t('releaseManageDraft')} →</button></header><div className="release-list-full">{entry?.releases.length === 0 && <div className="release-empty"><span>◇</span><h3>{t('releaseEmptyTitle')}</h3><p>{t('releaseEmptyDescription')}</p></div>}{entry?.releases.slice().reverse().map((release) => <button className={`release-card ${selectedDigest === release.digest ? 'selected' : ''}`} onClick={() => setSelectedDigest(release.digest)} key={release.digest}><span className="release-node"><i /></span><div><span><b>v{release.version}</b>{release.digest === entry.activeReleaseDigest && <em>{t('releaseActive').toLocaleUpperCase()}</em>}</span><h3>{release.notes}</h3><footer><time>{formatDate(release.publishedAt, { dateStyle: 'medium', timeStyle: 'short' })}</time><code>{release.digest.slice(0, 28)}…</code></footer></div><dl><div><dt>{t('contractsTypes')}</dt><dd>{release.contract.entityTypes.length}</dd></div><div><dt>{t('releaseBindings')}</dt><dd>{release.contract.bindings.length}</dd></div><div><dt>{t('releasePolicies')}</dt><dd>{release.contract.policies.length}</dd></div></dl></button>)}</div></main>
      <aside className="release-detail panel">{selectedRelease ? <><header><div><span className="panel-kicker">{t('releaseInspector').toLocaleUpperCase()}</span><h2>v{selectedRelease.version}</h2></div><span className={selectedRelease.digest === entry?.activeReleaseDigest ? 'active-release' : ''}>{selectedRelease.digest === entry?.activeReleaseDigest ? t('releaseLive').toLocaleUpperCase() : t('releaseHistorical').toLocaleUpperCase()}</span></header><div className="release-digest"><span>{t('releaseImmutableDigest').toLocaleUpperCase()}</span><code>{selectedRelease.digest}</code></div><div className="release-notes"><span>{t('releaseNotes').toLocaleUpperCase()}</span><p>{selectedRelease.notes}</p></div><dl className="release-versions"><div><dt>{t('releaseVersionSemantic').toLocaleUpperCase()}</dt><dd>{selectedRelease.contract.versions.semantic}</dd></div><div><dt>{t('releaseVersionPolicy').toLocaleUpperCase()}</dt><dd>{selectedRelease.contract.versions.policy}</dd></div><div><dt>{t('releaseVersionBindings').toLocaleUpperCase()}</dt><dd>{selectedRelease.contract.versions.bindings}</dd></div><div><dt>{t('releaseVersionApi').toLocaleUpperCase()}</dt><dd>{selectedRelease.contract.versions.api}</dd></div></dl><button className="restore-button" onClick={() => void restoreSelected()} disabled={working || isSelectedCurrentDraft}>↶ {isSelectedCurrentDraft ? t('releaseDraftMatches') : t('releaseRestoreDraft')}</button></> : <div className="release-empty">{t('releaseSelectInspect')}</div>}</aside>
    </div>
    <section className="release-impact panel"><header><div><span className="panel-kicker">{t('releaseDiffImpact').toLocaleUpperCase()}</span><h2>{selectedRelease ? t('releaseWorkingComparison', { version: selectedRelease.version }) : t('releaseSelectBaseline')}</h2></div>{selectedRelease && <span className={`bump-pill ${suggestedBump.toLocaleLowerCase()}`}>{t('releaseVersionBump', { bump: suggestedBump }).toLocaleUpperCase()}</span>}</header>{changes.length === 0 ? <div className="diff-empty"><span>✓</span><div><b>{t('releaseNoDifferences')}</b><p>{t('releaseEquivalent')}</p></div></div> : <div className="change-grid">{changes.map((change) => <article key={`${change.kind}:${change.id}`}><span className={change.change.toLocaleLowerCase()}>{change.change[0]}</span><div><small>{changeKindLabel(change.kind, t)}</small><b>{change.label}</b><code>{change.id}</code></div><em className={change.impact.toLocaleLowerCase()}>{change.impact}</em></article>)}</div>}</section>
    {pendingAction && <ConfirmDialog title={pendingAction === 'SUSPEND' ? t('releaseSuspendTitle') : t('releaseRestoreTitle')} description={pendingAction === 'SUSPEND' ? t('releaseSuspendConfirm') : t('releaseRestoreConfirm', { version: selectedRelease?.version ?? '' })} cancelLabel={t('commonCancel')} confirmLabel={pendingAction === 'SUSPEND' ? t('releaseSuspendRuntime') : t('releaseRestoreDraft')} onCancel={() => setPendingAction(undefined)} onConfirm={confirmPendingAction} />}
  </section>
}

function compareContracts(baseline: ContextContract, current: ContextContract): ContractChange[] {
  const groups = [
    ['ENTITY TYPE', baseline.entityTypes, current.entityTypes, 'label'],
    ['RELATIONSHIP', baseline.relationshipTypes, current.relationshipTypes, 'label'],
    ['OPERATION', baseline.operations, current.operations, 'label'],
    ['SOURCE BINDING', baseline.bindings, current.bindings, 'sourceSystem'],
    ['POLICY', baseline.policies, current.policies, 'label'],
    ['CONTEXT OBJECT', baseline.entities, current.entities, 'label'],
  ] as const
  const changes: ContractChange[] = []
  for (const [kind, before, after, labelKey] of groups) {
    const beforeById = new Map(before.map((item) => [item.id, item]))
    const afterById = new Map(after.map((item) => [item.id, item]))
    for (const item of after) {
      const previous = beforeById.get(item.id)
      const label = String(item[labelKey as keyof typeof item] ?? item.id)
      if (!previous) changes.push({ id: item.id, kind, label, change: 'ADDED', impact: kind === 'CONTEXT OBJECT' ? 'PATCH' : 'MINOR' })
      else if (JSON.stringify(previous) !== JSON.stringify(item)) changes.push({ id: item.id, kind, label, change: 'CHANGED', impact: kind === 'ENTITY TYPE' || kind === 'RELATIONSHIP' ? 'MAJOR' : 'PATCH' })
    }
    for (const item of before) if (!afterById.has(item.id)) changes.push({ id: item.id, kind, label: String(item[labelKey as keyof typeof item] ?? item.id), change: 'REMOVED', impact: kind === 'CONTEXT OBJECT' ? 'PATCH' : 'MAJOR' })
  }
  return changes
}

function suggestBump(changes: ContractChange[]): 'NONE' | 'PATCH' | 'MINOR' | 'MAJOR' {
  if (changes.length === 0) return 'NONE'
  if (changes.some((change) => change.impact === 'MAJOR')) return 'MAJOR'
  if (changes.some((change) => change.impact === 'MINOR')) return 'MINOR'
  return 'PATCH'
}

function changeKindLabel(kind: string, t: ReturnType<typeof useMessages>['t']): string {
  const keys = {
    'ENTITY TYPE': 'releaseKindEntityType',
    RELATIONSHIP: 'releaseKindRelationship',
    OPERATION: 'releaseKindOperation',
    'SOURCE BINDING': 'releaseKindSourceBinding',
    POLICY: 'releaseKindPolicy',
    'CONTEXT OBJECT': 'releaseKindContextObject',
  } as const
  return t(keys[kind as keyof typeof keys] ?? 'releaseKindContextObject')
}
