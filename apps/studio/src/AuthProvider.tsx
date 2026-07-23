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

type PasswordSetupMode = 'invite' | 'recovery'

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
  const [passwordSetupMode, setPasswordSetupMode] = useState<PasswordSetupMode | undefined>(authActionFromLocation)
  const [authError] = useState(authErrorFromLocation)
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY') setPasswordSetupMode('recovery')
      setSession(nextSession)
    })
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
  if (!session) return <SignInPanel initialError={authError} />
  const requiredPasswordSetup = passwordSetupMode ?? (requiresInvitePasswordSetup(session.user) ? 'invite' : undefined)
  if (requiredPasswordSetup) return <PasswordSetupPanel mode={requiredPasswordSetup} onUpdated={(user) => {
    setSession((current) => current ? { ...current, user } : current)
    setPasswordSetupMode(undefined)
    clearAuthParameters()
  }} />
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

function SignInPanel({ initialError = '' }: { initialError?: string }) {
  const { t } = useMessages()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [recovering, setRecovering] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState(initialError)
  const [notice, setNotice] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || working) return
    setWorking(true)
    setError('')
    setNotice('')
    if (recovering) {
      const result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: passwordRecoveryRedirectUrl() })
      if (result.error) setError(result.error.message)
      else setNotice(t('authRecoverySent'))
    } else {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (result.error) setError(result.error.message)
    }
    setWorking(false)
  }

  function changeMode(nextRecovering: boolean) {
    setRecovering(nextRecovering)
    setError('')
    setNotice('')
    setPassword('')
  }

  return <main className="auth-shell"><form className="auth-card" onSubmit={(event) => void submit(event)}>
    <span className="auth-mark">⌁</span>
    <p className="panel-kicker">{t('authKicker')}</p>
    <h1>{t(recovering ? 'authForgotTitle' : 'authTitle')}</h1>
    <p>{t(recovering ? 'authForgotDescription' : 'authDescription')}</p>
    <label>{t('authEmail')}<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    {!recovering && <label>{t('authPassword')}<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
    {error && <div className="auth-error" role="alert">{error}</div>}
    {notice && <div className="auth-notice" role="status">{notice}</div>}
    <button className="release" type="submit" disabled={working}>{working ? t(recovering ? 'authRecoverySending' : 'authSigningIn') : t(recovering ? 'authRecoverySend' : 'authSignIn')}</button>
    <button className="auth-link" type="button" onClick={() => changeMode(!recovering)}>{t(recovering ? 'authBackToSignIn' : 'authForgotPassword')}</button>
  </form></main>
}

function PasswordSetupPanel({ mode, onUpdated }: { mode: PasswordSetupMode; onUpdated(user: User): void }) {
  const { t } = useMessages()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || working) return
    setError('')
    if (!passwordMeetsPolicy(password)) {
      setError(t('authPasswordRequirements'))
      return
    }
    if (password !== confirmation) {
      setError(t('authPasswordMismatch'))
      return
    }
    setWorking(true)
    const result = await supabase.auth.updateUser({ password, data: { lattice_invite_completed: true } })
    if (result.error) setError(result.error.message)
    else if (result.data.user) onUpdated(result.data.user)
    setWorking(false)
  }

  return <main className="auth-shell"><form className="auth-card" onSubmit={(event) => void submit(event)}>
    <span className="auth-mark">⌁</span>
    <p className="panel-kicker">{t(mode === 'invite' ? 'authInviteKicker' : 'authRecoveryKicker')}</p>
    <h1>{t(mode === 'invite' ? 'authInviteTitle' : 'authRecoveryTitle')}</h1>
    <p>{t(mode === 'invite' ? 'authInviteDescription' : 'authRecoveryDescription')}</p>
    <label>{t('authNewPassword')}<input type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <p className="auth-help">{t('authPasswordRequirements')}</p>
    <label>{t('authConfirmPassword')}<input type="password" autoComplete="new-password" minLength={10} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
    {error && <div className="auth-error" role="alert">{error}</div>}
    <button className="release" type="submit" disabled={working}>{working ? t('authPasswordSaving') : t('authPasswordSave')}</button>
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

function authActionFromLocation(): PasswordSetupMode | undefined {
  if (typeof window === 'undefined') return undefined
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const action = search.get('auth_action') ?? search.get('type') ?? hash.get('type')
  if (action === 'invite') return 'invite'
  if (action === 'recovery' || action === 'update-password') return 'recovery'
  return undefined
}

function authErrorFromLocation(): string {
  if (typeof window === 'undefined') return ''
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return search.get('error_description') ?? hash.get('error_description') ?? ''
}

function requiresInvitePasswordSetup(user: User): boolean {
  return Boolean(user.invited_at && user.user_metadata?.lattice_invite_completed !== true)
}

function passwordMeetsPolicy(password: string): boolean {
  return password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password)
}

function passwordRecoveryRedirectUrl(): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('auth_action', 'update-password')
  return url.toString()
}

function clearAuthParameters(): void {
  const url = new URL(window.location.href)
  for (const parameter of ['auth_action', 'code', 'error', 'error_code', 'error_description', 'type']) url.searchParams.delete(parameter)
  url.hash = ''
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`)
}
