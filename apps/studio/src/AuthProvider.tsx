import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { clearApiAccessToken, clearActiveOrganizationId, setActiveOrganizationId, setApiAccessToken } from './api'
import { useMessages } from './i18n/messages'
import { supabase } from './supabase'

interface OrganizationMembership {
  organizationId: string
  name: string
  slug: string
  role: string
}

interface AuthContextValue {
  configured: boolean
  user?: User
  memberships: OrganizationMembership[]
  activeOrganizationId?: string
  selectOrganization(organizationId: string): void
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  configured: false,
  memberships: [],
  selectOrganization: () => undefined,
  signOut: async () => undefined,
})

export function useLatticeAuth(): AuthContextValue {
  return useContext(AuthContext)
}

export function LatticeAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>()
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([])
  const [membershipsLoading, setMembershipsLoading] = useState(Boolean(supabase))
  const [activeOrganizationId, setActiveOrganization] = useState<string>()
  const [membershipRevision, setMembershipRevision] = useState(0)

  useEffect(() => {
    if (!supabase) {
      setSession(null)
      setMembershipsLoading(false)
      return
    }
    let active = true
    void supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => { if (active) setSession(nextSession) })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !session) {
      clearApiAccessToken()
      clearActiveOrganizationId()
      setMemberships([])
      setActiveOrganization(undefined)
      setMembershipsLoading(false)
      return
    }
    let active = true
    setApiAccessToken(session.access_token)
    setMembershipsLoading(true)
    void loadMemberships().then((nextMemberships) => {
      if (!active) return
      setMemberships(nextMemberships)
      const saved = sessionStorage.getItem('lattice:active-organization')
      const nextActive = nextMemberships.some((membership) => membership.organizationId === saved)
        ? saved!
        : nextMemberships[0]?.organizationId
      setActiveOrganization(nextActive)
      if (nextActive) setActiveOrganizationId(nextActive)
      else clearActiveOrganizationId()
      setMembershipsLoading(false)
    }).catch(() => {
      if (!active) return
      setMemberships([])
      setMembershipsLoading(false)
    })
    return () => { active = false }
  }, [membershipRevision, session])

  const selectOrganization = useCallback((organizationId: string) => {
    if (!memberships.some((membership) => membership.organizationId === organizationId)) return
    setActiveOrganizationId(organizationId)
    setActiveOrganization(organizationId)
    window.location.reload()
  }, [memberships])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    clearApiAccessToken()
    clearActiveOrganizationId()
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    configured: Boolean(supabase),
    ...(session?.user ? { user: session.user } : {}),
    memberships,
    ...(activeOrganizationId ? { activeOrganizationId } : {}),
    selectOrganization,
    signOut,
  }), [activeOrganizationId, memberships, selectOrganization, session?.user, signOut])

  if (!supabase) return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  if (session === undefined || membershipsLoading) return <AuthLoading />
  if (!session) return <SignInPanel />
  if (memberships.length === 0) return <OrganizationOnboarding onCreated={() => setMembershipRevision((revision) => revision + 1)} />
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

async function loadMemberships(): Promise<OrganizationMembership[]> {
  if (!supabase) return []
  const { data: membershipRows, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
  if (membershipError) throw membershipError
  const organizationIds = (membershipRows ?? []).map((membership) => String(membership.organization_id))
  if (organizationIds.length === 0) return []
  const { data: organizations, error: organizationError } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .in('id', organizationIds)
  if (organizationError) throw organizationError
  const organizationsById = new Map((organizations ?? []).map((organization) => [String(organization.id), organization]))
  return (membershipRows ?? []).flatMap((membership) => {
    const organization = organizationsById.get(String(membership.organization_id))
    return organization ? [{
      organizationId: String(organization.id),
      name: String(organization.name),
      slug: String(organization.slug),
      role: String(membership.role),
    }] : []
  })
}

function AuthLoading() {
  const { t } = useMessages()
  return <main className="auth-shell"><div className="auth-card" role="status"><span className="auth-mark">⌁</span><h1>{t('authLoading')}</h1></div></main>
}

function SignInPanel() {
  const { t } = useMessages()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || working) return
    setWorking(true)
    setError('')
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (result.error) setError(result.error.message)
    setWorking(false)
  }

  return <main className="auth-shell"><form className="auth-card" onSubmit={(event) => void submit(event)}>
    <span className="auth-mark">⌁</span>
    <p className="panel-kicker">{t('authKicker')}</p>
    <h1>{t('authTitle')}</h1>
    <p>{t('authDescription')}</p>
    <label>{t('authEmail')}<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label>{t('authPassword')}<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    {error && <div className="auth-error" role="alert">{error}</div>}
    <button className="release" type="submit" disabled={working}>{working ? t('authSigningIn') : t('authSignIn')}</button>
  </form></main>
}

function OrganizationOnboarding({ onCreated }: { onCreated(): void }) {
  const { t } = useMessages()
  const [name, setName] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || working) return
    setWorking(true)
    setError('')
    const slug = organizationSlug(name)
    const { error: organizationError } = await supabase.rpc('create_organization', { organization_name: name.trim(), organization_slug: slug })
    if (organizationError) setError(organizationError.message)
    else onCreated()
    setWorking(false)
  }

  return <main className="auth-shell"><form className="auth-card" onSubmit={(event) => void submit(event)}>
    <span className="auth-mark">⌁</span>
    <p className="panel-kicker">{t('tenantKicker')}</p>
    <h1>{t('tenantTitle')}</h1>
    <p>{t('tenantDescription')}</p>
    <label>{t('tenantName')}<input required minLength={2} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label>
    {error && <div className="auth-error" role="alert">{error}</div>}
    <button className="release" type="submit" disabled={working || organizationSlug(name).length < 2}>{working ? t('tenantCreating') : t('tenantCreate')}</button>
  </form></main>
}

function organizationSlug(value: string): string {
  return value.trim().toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}
