import type { ContextContract, EntityRecord } from '@lattice/contracts'
import { useMessages } from './i18n/messages'

interface RuntimeInspectorProps {
  entity?: EntityRecord | undefined
  contract: ContextContract
}

export function RuntimeInspector({ entity, contract }: RuntimeInspectorProps) {
  const { t, formatDate } = useMessages()
  if (!entity) return <div className="runtime-inspector-empty"><span>◇</span><b>{t('runtimeSelectObject')}</b><p>{t('runtimeSelectDescription')}</p></div>
  const type = contract.entityTypes.find((candidate) => candidate.id === entity.typeId)
  const relationshipCount = contract.relationships.filter((relationship) => relationship.sourceEntityId === entity.id || relationship.targetEntityId === entity.id).length
  return <div className="inspector-body">
    <div className="entity-title"><span className="large-icon">{type?.icon}</span><div><span>{type?.label}</span><h3>{entity.label}</h3><code>{entity.id}</code></div></div>
    <div className="badges"><span className="badge approved">{t('runtimeGoverned')}</span><span className="badge critical">{t('runtimeImpact', { impact: type?.impact ?? 'MEDIUM' })}</span></div>
    <p>{type?.description}</p>
    <dl>
      <div><dt>{t('runtimeEvidenceStrength').toLocaleUpperCase()}</dt><dd><span className="strength-bars"><i/><i/><i/><i/></span>{entity.evidenceStrength}</dd></div>
      <div><dt>{t('runtimeValidFrom').toLocaleUpperCase()}</dt><dd>{formatDate(entity.validFrom, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</dd></div>
      <div><dt>{t('runtimeRelationships').toLocaleUpperCase()}</dt><dd>{t('runtimeGovernedLinks', { count: relationshipCount })}</dd></div>
      {Object.entries(entity.properties).slice(0, 5).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ').toUpperCase()}</dt><dd>{String(value)}</dd></div>)}
    </dl>
    <div className="evidence-block"><div className="evidence-heading"><span>{t('runtimeEvidence').toLocaleUpperCase()}</span><b>{entity.evidenceRefs.length}</b></div>{entity.evidenceRefs.map((id) => { const evidence = contract.evidence.find((item) => item.id === id); return <div className="evidence-item" key={id}><span>⌁</span><div><b>{evidence?.title ?? id}</b><small>{evidence?.source} · {evidence?.status.replaceAll('_', ' ')}</small></div><span className="verified">✓</span></div> })}</div>
  </div>
}
