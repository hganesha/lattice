import type { ContextContract, ReleaseRuntimeStatus, ReleaseStatus } from '@lattice/contracts'
import { releaseTone, runtimeTone } from './formatters'
import type { HeroFact } from './SurfaceState'
import type { MessageKey } from './i18n/messages'

/**
 * The facts a governed surface's hero carries about the object it is acting on.
 *
 * Compiler, Runtime approvals, Policy profiles and both binding surfaces used to
 * open with a fixed explainer — "Turn risk into runtime behavior", "Connect
 * governed meaning to operational data" — that reads the same on every visit and
 * for every contract. None of them said *which* contract you were about to
 * change, at what version pin, or whether it was published. That identity was
 * three sections down in a panel header, and on Compiler and Runtime approvals it
 * was nowhere on the page.
 *
 * These builders exist so the five surfaces answer that question the same way.
 * A surface only asks for the facts it does not already state above itself: the
 * two binding surfaces sit under the summary strip, which already reports
 * contract status, so they take the version pin and scope and leave release
 * state to the strip.
 */

type Translate = (key: MessageKey) => string

const releaseStatusKeys: Readonly<Record<ReleaseStatus, MessageKey>> = {
  UNPUBLISHED: 'statusDraft',
  CANDIDATE: 'statusCandidate',
  PUBLISHED: 'statusPublished',
  SUSPENDED: 'statusSuspended',
  RETIRED: 'statusRetired',
}

const runtimeStatusKeys: Readonly<Record<ReleaseRuntimeStatus, MessageKey>> = {
  NO_RELEASE: 'statusNoRelease',
  ACTIVE: 'statusActive',
  SUSPENDED: 'statusSuspended',
}

/** Release state and the version it is pinned at — one fact, because they are
 * only meaningful together. "Published" without a version cannot be matched to
 * anything in the registry. */
export function releaseFact(t: Translate, contract: ContextContract): HeroFact {
  return {
    label: t('heroFactRelease'),
    value: `${t(releaseStatusKeys[contract.releaseStatus])} · v${contract.version}`,
    tone: releaseTone(contract.releaseStatus),
  }
}

export function runtimeFact(t: Translate, status: ReleaseRuntimeStatus): HeroFact {
  return { label: t('heroFactRuntime'), value: t(runtimeStatusKeys[status]), tone: runtimeTone(status) }
}

/**
 * The version the mappings on this surface are pinned at.
 *
 * Scope-aware on purpose. The shared-ontology binding surface is handed a
 * contract synthesized from the workspace ontology (App.tsx
 * `workspaceBindingContract`), which keeps the seed contract's `versions` — so
 * reading `versions.bindings` there would report one arbitrary contract's pin
 * as if it governed the whole ontology. The ontology's own version is the one
 * contracts inherit from, and it is what the summary strip above already shows.
 */
export function bindingsPinFact(t: Translate, contract: ContextContract, scope: 'ONTOLOGY' | 'CONTRACT'): HeroFact {
  if (scope === 'ONTOLOGY') return { label: t('heroFactOntologyVersion'), value: `v${contract.ontologyRef?.version ?? '0.0.0'}` }
  return { label: t('heroFactBindingsPin'), value: contract.versions.bindings }
}

export function policyPinFact(t: Translate, contract: ContextContract): HeroFact {
  return { label: t('heroFactPolicyPin'), value: contract.versions.policy }
}

export function scopeFact(t: Translate, scope: 'ONTOLOGY' | 'CONTRACT'): HeroFact {
  return { label: t('heroFactScope'), value: t(scope === 'ONTOLOGY' ? 'heroScopeSharedOntology' : 'heroScopeContract') }
}
