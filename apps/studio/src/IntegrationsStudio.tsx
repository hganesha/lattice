import { useEffect, useState } from 'react'
import type { IntegrationsResponse } from '@lattice/contracts'
import { API_URL, apiAuthHeaders } from './api'
import { useMessages } from './i18n/messages'
import { IconPlug, IconShieldCheck, IconUserCheck, IconLoader, IconScale } from './icons'

type LoadState =
  | { status: 'LOADING' }
  | { status: 'READY'; integrations: IntegrationsResponse }
  | { status: 'FORBIDDEN' }
  | { status: 'FAILED' }

/**
 * What this deployment is wired to.
 *
 * Catalog federation, delegated identity, and plan signing are configured by environment variable
 * and were previously invisible: nothing in the Studio could tell you that Collibra was supplying
 * classifications, or that plans were being signed with a key that would not survive a restart.
 * The first question an operator asks is what this thing is actually connected to, and until now
 * the only way to answer it was to read the deployment's configuration.
 *
 * Read-only on purpose. Everything here is a credentialed connection, and a browser form is the
 * wrong place to enter credentials — the page reports what is configured and leaves changing it
 * to the deployment.
 */
export function IntegrationsStudio() {
  const { t, formatDate } = useMessages()
  const [state, setState] = useState<LoadState>({ status: 'LOADING' })

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`${API_URL}/v1/integrations`, { headers: apiAuthHeaders(), signal: controller.signal })
      .then(async (response) => {
        if (response.status === 403) return setState({ status: 'FORBIDDEN' })
        if (!response.ok) return setState({ status: 'FAILED' })
        setState({ status: 'READY', integrations: await response.json() as IntegrationsResponse })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'FAILED' })
      })
    return () => controller.abort()
  }, [])

  if (state.status === 'LOADING') {
    return <div className="runtime-empty"><span aria-hidden="true"><IconLoader /></span><h3>{t('integrationsLoading')}</h3></div>
  }
  if (state.status === 'FORBIDDEN') {
    return <div className="runtime-empty"><span aria-hidden="true"><IconShieldCheck /></span><h3>{t('integrationsForbidden')}</h3><p>{t('integrationsForbiddenDetail')}</p></div>
  }
  if (state.status === 'FAILED') {
    return <div className="runtime-empty"><span aria-hidden="true"><IconPlug /></span><h3>{t('integrationsUnavailable')}</h3><p>{t('integrationsUnavailableDetail')}</p></div>
  }

  const { persistence, catalog, delegatedIdentity, signing, telemetry, connectors } = state.integrations

  return <div className="integrations-studio">
    <section className="integrations-grid">
      <IntegrationCard
        icon={<IconScale />}
        kicker={t('integrationsCatalogKicker')}
        title={catalog.configured ? t(`integrationsCatalog${catalogKey(catalog.provider)}`) : t('integrationsNotConfigured')}
        state={catalog.configured ? 'ACTIVE' : 'INACTIVE'}
        detail={catalog.configured ? catalog.host ?? t('integrationsHostUnknown') : t('integrationsCatalogAbsent')}
      />
      <IntegrationCard
        icon={<IconUserCheck />}
        kicker={t('integrationsIdentityKicker')}
        title={delegatedIdentity.configured ? delegatedIdentity.provider : t('integrationsNotConfigured')}
        state={delegatedIdentity.configured ? 'ACTIVE' : 'INACTIVE'}
        detail={delegatedIdentity.configured ? delegatedIdentity.host ?? t('integrationsHostUnknown') : t('integrationsIdentityAbsent')}
      />
      <IntegrationCard
        icon={<IconShieldCheck />}
        kicker={t('integrationsSigningKicker')}
        title={t(`integrationsSigning${signingKey(signing.provider)}`)}
        // An ephemeral key is a correctness problem, not a preference: plans signed by one process
        // do not verify in the next, so the audit trail cannot be checked.
        state={signing.ephemeral ? 'WARNING' : 'ACTIVE'}
        detail={signing.ephemeral ? t('integrationsSigningEphemeral') : `${signing.algorithm} · ${signing.activeKeyId.slice(0, 12)}…`}
      />
      <IntegrationCard
        icon={<IconPlug />}
        kicker={t('integrationsPersistenceKicker')}
        title={t(persistence.backend === 'SUPABASE' ? 'integrationsPersistencePostgres' : 'integrationsPersistenceFiles')}
        state={persistence.durable ? 'ACTIVE' : 'WARNING'}
        detail={persistence.durable ? t('integrationsPersistenceDurable') : t('integrationsPersistenceEphemeral')}
      />
    </section>

    <section className="panel integrations-connectors">
      <header>
        <div>
          <span className="panel-kicker">{t('integrationsConnectorsKicker')}</span>
          <h2>{t('integrationsConnectorsTitle')}</h2>
        </div>
        <span className="integrations-telemetry">{t(telemetry.enabled ? 'integrationsTelemetryOn' : 'integrationsTelemetryOff')}</span>
      </header>
      {connectors.length === 0
        ? <p className="integrations-empty">{t('integrationsConnectorsEmpty')}</p>
        : <table className="integrations-table">
            <thead>
              <tr>
                <th>{t('integrationsColumnBinding')}</th>
                <th>{t('integrationsColumnProvider')}</th>
                <th>{t('integrationsColumnStatus')}</th>
                <th>{t('integrationsColumnFreshness')}</th>
                <th>{t('integrationsColumnChecked')}</th>
              </tr>
            </thead>
            <tbody>
              {connectors.map((record) => <tr key={record.id}>
                <td>{record.bindingId}</td>
                <td>{record.provider}</td>
                <td><span className={`runtime-status-pill ${record.status === 'HEALTHY' ? 'success' : 'failed'}`}>{record.status}</span></td>
                <td>{record.freshnessStatus}</td>
                <td><time dateTime={record.checkedAt}>{formatDate(record.checkedAt, { dateStyle: 'medium', timeStyle: 'short' })}</time></td>
              </tr>)}
            </tbody>
          </table>}
    </section>
  </div>
}

interface IntegrationCardProps {
  icon: React.ReactNode
  kicker: string
  title: string
  state: 'ACTIVE' | 'INACTIVE' | 'WARNING'
  detail: string
}

function IntegrationCard({ icon, kicker, title, state, detail }: IntegrationCardProps) {
  return <article className={`integration-card ${state.toLocaleLowerCase()}`}>
    <span aria-hidden="true">{icon}</span>
    <div>
      <span className="panel-kicker">{kicker}</span>
      <b>{title}</b>
      <small>{detail}</small>
    </div>
  </article>
}

function catalogKey(provider: 'purview' | 'unity-catalog' | 'collibra'): 'Purview' | 'UnityCatalog' | 'Collibra' {
  if (provider === 'purview') return 'Purview'
  return provider === 'unity-catalog' ? 'UnityCatalog' : 'Collibra'
}

function signingKey(provider: 'LOCAL' | 'AZURE_KEY_VAULT' | 'AWS_KMS'): 'Local' | 'AzureKeyVault' | 'AwsKms' {
  if (provider === 'AZURE_KEY_VAULT') return 'AzureKeyVault'
  return provider === 'AWS_KMS' ? 'AwsKms' : 'Local'
}
