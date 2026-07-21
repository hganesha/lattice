import { useState } from 'react'
import { useMessages, type MessageKey } from './i18n/messages'

interface EnterpriseUseCase {
  id: string
  marker: string
  industry: MessageKey
  title: MessageKey
  driver: MessageKey
  decision: MessageKey
  latticePattern: MessageKey
  source: MessageKey
  sourceUrl: string
}

const enterpriseUseCases = [
  {
    id: 'bank-risk',
    marker: 'FS',
    industry: 'welcomeUseCaseBankingIndustry',
    title: 'welcomeUseCaseBankingTitle',
    driver: 'welcomeUseCaseBankingDriver',
    decision: 'welcomeUseCaseBankingDecision',
    latticePattern: 'welcomeUseCaseBankingPattern',
    source: 'welcomeUseCaseBankingSource',
    sourceUrl: 'https://www.bis.org/publ/bcbs239.htm',
  },
  {
    id: 'health-prior-authorization',
    marker: 'HC',
    industry: 'welcomeUseCaseHealthcareIndustry',
    title: 'welcomeUseCaseHealthcareTitle',
    driver: 'welcomeUseCaseHealthcareDriver',
    decision: 'welcomeUseCaseHealthcareDecision',
    latticePattern: 'welcomeUseCaseHealthcarePattern',
    source: 'welcomeUseCaseHealthcareSource',
    sourceUrl: 'https://www.cms.gov/newsroom/fact-sheets/cms-interoperability-prior-authorization-final-rule-cms-0057-f',
  },
  {
    id: 'pharma-traceability',
    marker: 'RX',
    industry: 'welcomeUseCasePharmaIndustry',
    title: 'welcomeUseCasePharmaTitle',
    driver: 'welcomeUseCasePharmaDriver',
    decision: 'welcomeUseCasePharmaDecision',
    latticePattern: 'welcomeUseCasePharmaPattern',
    source: 'welcomeUseCasePharmaSource',
    sourceUrl: 'https://www.fda.gov/drugs/drug-supply-chain-integrity/drug-supply-chain-security-act-dscsa',
  },
  {
    id: 'grid-restoration',
    marker: 'EN',
    industry: 'welcomeUseCaseEnergyIndustry',
    title: 'welcomeUseCaseEnergyTitle',
    driver: 'welcomeUseCaseEnergyDriver',
    decision: 'welcomeUseCaseEnergyDecision',
    latticePattern: 'welcomeUseCaseEnergyPattern',
    source: 'welcomeUseCaseEnergySource',
    sourceUrl: 'https://www.nerc.com/pa/Stand/Pages/default.aspx',
  },
] as const satisfies readonly EnterpriseUseCase[]

export function EnterpriseUseCaseCarousel() {
  const { t } = useMessages()
  const [activeIndex, setActiveIndex] = useState(0)
  const activeUseCase = enterpriseUseCases[activeIndex] ?? enterpriseUseCases[0]

  function move(direction: -1 | 1) {
    setActiveIndex((current) => (current + direction + enterpriseUseCases.length) % enterpriseUseCases.length)
  }

  return <section className="enterprise-use-cases" aria-labelledby="enterprise-use-cases-title" aria-roledescription="carousel">
    <header className="enterprise-use-cases-header">
      <div>
        <span className="panel-kicker">{t('welcomeEnterpriseKicker')}</span>
        <h2 id="enterprise-use-cases-title">{t('welcomeEnterpriseTitle')}</h2>
        <p>{t('welcomeEnterpriseDescription')}</p>
      </div>
      <div className="enterprise-carousel-controls">
        <button type="button" aria-label={t('welcomeEnterprisePrevious')} onClick={() => move(-1)}>←</button>
        <span aria-live="polite">{t('welcomeEnterprisePosition', { current: activeIndex + 1, total: enterpriseUseCases.length })}</span>
        <button type="button" aria-label={t('welcomeEnterpriseNext')} onClick={() => move(1)}>→</button>
      </div>
    </header>

    <article className="enterprise-use-case" role="group" aria-roledescription="slide" aria-label={t('welcomeEnterprisePosition', { current: activeIndex + 1, total: enterpriseUseCases.length })} key={activeUseCase.id}>
      <aside>
        <span className="enterprise-use-case-marker" aria-hidden="true">{activeUseCase.marker}</span>
        <b>{t(activeUseCase.industry)}</b>
        <small>{t('welcomeEnterpriseDocumented')}</small>
      </aside>
      <div className="enterprise-use-case-body">
        <h3>{t(activeUseCase.title)}</h3>
        <p className="enterprise-use-case-driver">{t(activeUseCase.driver)}</p>
        <dl>
          <div>
            <dt>{t('welcomeEnterpriseDecision')}</dt>
            <dd>{t(activeUseCase.decision)}</dd>
          </div>
          <div>
            <dt>{t('welcomeEnterpriseLatticePattern')}</dt>
            <dd>{t(activeUseCase.latticePattern)}</dd>
          </div>
        </dl>
        <a href={activeUseCase.sourceUrl} target="_blank" rel="noreferrer">{t('welcomeEnterpriseSource')}: {t(activeUseCase.source)} ↗</a>
      </div>
    </article>

    <nav className="enterprise-carousel-dots" aria-label={t('welcomeEnterpriseChooseCase')}>
      {enterpriseUseCases.map((useCase, index) => <button type="button" className={index === activeIndex ? 'active' : ''} aria-current={index === activeIndex ? 'true' : undefined} aria-label={t('welcomeEnterpriseGoToCase', { number: index + 1, title: t(useCase.title) })} onClick={() => setActiveIndex(index)} key={useCase.id}><span aria-hidden="true" /></button>)}
    </nav>
  </section>
}
