import { useEffect, useState } from 'react'
import { connectorCatalog, type ConnectorProvider, type ConnectorTemplate } from '@lattice/contracts'
import { API_URL } from './api'
import { useMessages } from './i18n/messages'

interface ConnectorPickerProps {
  onCancel: () => void
  onSelect: (provider: ConnectorProvider) => void
}

const featured = new Set<ConnectorProvider>(['DATABRICKS', 'MICROSOFT_FABRIC', 'SNOWFLAKE'])

export function ConnectorPicker({ onCancel, onSelect }: ConnectorPickerProps) {
  const { t } = useMessages()
  const [connectors, setConnectors] = useState<ConnectorTemplate[]>(connectorCatalog)
  const [catalogState, setCatalogState] = useState<'LOADING' | 'LIVE' | 'FALLBACK'>('LOADING')

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`${API_URL}/v1/connectors`, { headers: { Authorization: 'Bearer studio-demo' }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Connector catalog returned ${response.status}`)
        const payload = await response.json() as { connectors: ConnectorTemplate[] }
        setConnectors(payload.connectors)
        setCatalogState('LIVE')
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== 'AbortError') setCatalogState('FALLBACK')
      })
    return () => controller.abort()
  }, [])

  return <section className="connector-picker">
    <header className="binding-editor-header"><div><button className="ghost" onClick={onCancel}>{t('connectorBackBindings')}</button><span className="panel-kicker">{t('connectorCatalog').toLocaleUpperCase()}</span><h2>{t('connectorChoosePlane')}</h2></div><span className="workspace-mode">{t('connectorWorkspaceMode').toLocaleUpperCase()}</span></header>
    <div className="connector-picker-body">
      <div className="connector-picker-intro"><div><span className="panel-kicker">{t('connectorGovernedAdapters').toLocaleUpperCase()} · {(catalogState === 'LIVE' ? t('connectorApiSynchronized') : catalogState === 'FALLBACK' ? t('connectorLocalFallback') : t('connectorSynchronizing')).toLocaleUpperCase()}</span><h3>{t('connectorIntroTitle')}</h3><p>{t('connectorIntroDescription')}</p></div><div className="connector-count"><b>{connectors.length}</b><span>{t('connectorTypes').toLocaleUpperCase()}</span></div></div>
      <div className="connector-grid">
        {connectors.map((connector) => <button className={`connector-tile ${featured.has(connector.id) ? 'featured' : ''}`} onClick={() => onSelect(connector.id)} key={connector.id}>
          <div className="connector-tile-top"><span className="connector-monogram">{monogram(connector.label)}</span><span className="connector-category">{connector.category.replace('_', ' ')}</span></div>
          <h3>{connector.label}</h3>
          <p>{connector.description}</p>
          <div className="connector-tile-meta"><span>{connector.transport}</span><span>{connector.operationVerb}</span><span>{t('connectorReadOnly').toLocaleUpperCase()}</span></div>
          <strong>{t('connectorConfigure')}</strong>
        </button>)}
      </div>
    </div>
    <footer className="binding-editor-footer"><div><span>{t('connectorCredentialBoundary')}</span></div></footer>
  </section>
}

function monogram(label: string): string {
  return label.split(/[ /]+/).map((word) => word[0]).join('').slice(0, 3).toLocaleUpperCase()
}
