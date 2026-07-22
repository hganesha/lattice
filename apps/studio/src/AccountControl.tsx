import { useLatticeAuth } from './AuthProvider'
import { useMessages } from './i18n/messages'

export function AccountControl() {
  const { t } = useMessages()
  const auth = useLatticeAuth()
  if (!auth.configured || !auth.user) return <span className="avatar">HG</span>
  const label = auth.user.email ?? auth.user.id
  const initials = label.split(/[@._-]/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase()).join('') || 'U'
  return <div className="account-control">
    {auth.memberships.length > 1 && <select aria-label={t('tenantActive')} value={auth.activeOrganizationId} onChange={(event) => auth.selectOrganization(event.target.value)}>
      {auth.memberships.map((membership) => <option key={membership.organizationId} value={membership.organizationId}>{membership.name}</option>)}
    </select>}
    <span className="avatar" title={label}>{initials}</span>
    <button className="ghost" onClick={() => void auth.signOut()}>{t('authSignOut')}</button>
  </div>
}
