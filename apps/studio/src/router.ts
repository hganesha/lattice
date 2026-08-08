import { useCallback, useEffect, useState } from 'react'

/**
 * Dependency-free history router (E1).
 *
 * Grammar: `/w/{workspaceId}[/c/{contractId}]/{surface}[/{detailId}]`
 * Bare detail routes (`/dispositions/:id`, `/reviews/:id`, `/runs/:id`) are also addressable;
 * the surface adopts the record's own workspace and contract once it loads.
 */
export type SurfaceId =
  // Build
  | 'ontology'
  | 'ontology-bindings'
  | 'contracts'
  | 'contract-editor'
  | 'bindings'
  // Operate
  | 'compiler'
  | 'dispositions'
  | 'executions'
  | 'integrations'
  | 'runtime-approvals'
  // Govern
  | 'reviews'
  | 'policies'
  | 'evidence'
  | 'negative-decisions'
  | 'releases'
  // Assure
  | 'assurance'
  | 'evaluations'
  | 'case-sets'
  | 'drift'
  // Identity and operations
  | 'identities'
  | 'emergency'
  | 'activity'

export const surfaceIds: readonly SurfaceId[] = [
  'ontology', 'ontology-bindings', 'contracts', 'contract-editor', 'bindings',
  'compiler', 'dispositions', 'executions', 'integrations', 'runtime-approvals',
  'reviews', 'policies', 'evidence', 'negative-decisions', 'releases',
  'assurance', 'evaluations', 'case-sets', 'drift',
  'identities', 'emergency', 'activity',
] as const

/** Surfaces that read only workspace state and never require an active contract. */
export const workspaceSurfaces: readonly SurfaceId[] = [
  'ontology', 'ontology-bindings', 'contracts', 'reviews', 'drift', 'identities', 'negative-decisions', 'case-sets', 'activity', 'integrations',
] as const

export const defaultSurface: SurfaceId = 'ontology'

export interface Route {
  workspaceId?: string
  contractId?: string
  surface: SurfaceId
  detailId?: string
  search: string
}

/**
 * Route aliases. The plan specifies `/runs/:runId` as an addressable detail route (§6 E1), and the
 * API emits `/principals/:id` and `/emergency-authorizations/:id`; each maps onto the surface that
 * renders it, so a link from an activity feed or a failure action always resolves.
 */
const surfaceAliases: Readonly<Record<string, SurfaceId>> = {
  runs: 'evaluations',
  evaluation: 'evaluations',
  principals: 'identities',
  'emergency-authorizations': 'emergency',
  runtime: 'compiler',
}

function resolveSurface(value: string | undefined): SurfaceId | undefined {
  if (!value) return undefined
  if ((surfaceIds as readonly string[]).includes(value)) return value as SurfaceId
  return surfaceAliases[value]
}

export function parseRoute(href: string): Route {
  const url = new URL(href, 'http://localhost')
  const segments = url.pathname.split('/').filter(Boolean)
  let workspaceId: string | undefined
  let contractId: string | undefined
  let rest = segments

  if (rest[0] === 'w' && rest[1]) {
    workspaceId = decodeURIComponent(rest[1])
    rest = rest.slice(2)
  }
  if (rest[0] === 'c' && rest[1]) {
    contractId = decodeURIComponent(rest[1])
    rest = rest.slice(2)
  }

  // Legacy query links stay working as redirects.
  workspaceId ??= url.searchParams.get('workspace') ?? undefined
  contractId ??= url.searchParams.get('contract') ?? undefined

  const surface = resolveSurface(rest[0]) ?? defaultSurface
  const detailId = rest[1] ? decodeURIComponent(rest[1]) : undefined

  return {
    ...(workspaceId ? { workspaceId } : {}),
    ...(contractId ? { contractId } : {}),
    surface,
    ...(detailId ? { detailId } : {}),
    search: url.search,
  }
}

export function buildPath(route: Partial<Route>): string {
  const segments: string[] = []
  if (route.workspaceId) segments.push('w', encodeURIComponent(route.workspaceId))
  if (route.contractId) segments.push('c', encodeURIComponent(route.contractId))
  segments.push(route.surface ?? defaultSurface)
  if (route.detailId) segments.push(encodeURIComponent(route.detailId))
  return `/${segments.join('/')}${route.search ?? ''}`
}

const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function navigate(route: Partial<Route>, options: { replace?: boolean } = {}): void {
  const path = buildPath(route)
  if (path === `${window.location.pathname}${window.location.search}`) return
  if (options.replace) window.history.replaceState({}, '', path)
  else window.history.pushState({}, '', path)
  notify()
}

/** Navigates to a fully-formed path — used by routed actions that already carry a link. */
export function navigateToPath(path: string, options: { replace?: boolean } = {}): void {
  if (path === `${window.location.pathname}${window.location.search}`) return
  if (options.replace) window.history.replaceState({}, '', path)
  else window.history.pushState({}, '', path)
  notify()
}

export function currentRoute(): Route {
  return parseRoute(window.location.href)
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute)
  const sync = useCallback(() => setRoute(currentRoute()), [])

  useEffect(() => {
    listeners.add(sync)
    window.addEventListener('popstate', sync)
    return () => {
      listeners.delete(sync)
      window.removeEventListener('popstate', sync)
    }
  }, [sync])

  return route
}

/* ---- Route helpers shared by every surface, so links are built in one place. ---- */

export const routes = {
  surface: (workspaceId: string | undefined, contractId: string | undefined, surface: SurfaceId, detailId?: string) =>
    buildPath({ ...(workspaceId ? { workspaceId } : {}), ...(contractId ? { contractId } : {}), surface, ...(detailId ? { detailId } : {}) }),
  disposition: (id: string) => `/dispositions/${encodeURIComponent(id)}`,
  review: (id: string) => `/reviews/${encodeURIComponent(id)}`,
  evalRun: (id: string) => `/runs/${encodeURIComponent(id)}`,
  caseSet: (id: string) => `/case-sets/${encodeURIComponent(id)}`,
  drift: (id: string) => `/drift/${encodeURIComponent(id)}`,
  principal: (id: string) => `/principals/${encodeURIComponent(id)}`,
  emergency: (id: string) => `/emergency-authorizations/${encodeURIComponent(id)}`,
}
