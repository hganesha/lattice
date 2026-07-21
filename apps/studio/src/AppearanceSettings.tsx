import { useEffect, useState } from 'react'
import { useLocale, type AppLocale } from './i18n/I18nProvider'
import { useMessages } from './i18n/messages'

type ThemePreference = 'SYSTEM' | 'LIGHT' | 'DARK'
type TextScale = 'COMFORTABLE' | 'LARGE'

const THEME_KEY = 'lattice:theme'
const TEXT_SCALE_KEY = 'lattice:text-scale'

function storedTheme(): ThemePreference {
  const value = localStorage.getItem(THEME_KEY)
  return value === 'LIGHT' || value === 'DARK' ? value : 'SYSTEM'
}

function storedTextScale(): TextScale {
  return localStorage.getItem(TEXT_SCALE_KEY) === 'LARGE' ? 'LARGE' : 'COMFORTABLE'
}

export function AppearanceSettings() {
  const { locale, setLocale, localeLabels } = useLocale()
  const { t } = useMessages()
  const [theme, setTheme] = useState<ThemePreference>(storedTheme)
  const [textScale, setTextScale] = useState<TextScale>(storedTextScale)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      document.documentElement.dataset.theme = theme === 'SYSTEM' ? media.matches ? 'dark' : 'light' : theme.toLocaleLowerCase()
      document.documentElement.dataset.themePreference = theme.toLocaleLowerCase()
    }
    applyTheme()
    media.addEventListener('change', applyTheme)
    localStorage.setItem(THEME_KEY, theme)
    return () => media.removeEventListener('change', applyTheme)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.textScale = textScale.toLocaleLowerCase()
    localStorage.setItem(TEXT_SCALE_KEY, textScale)
  }, [textScale])

  return <details className="appearance-menu">
    <summary className="ghost" aria-label={t('appearanceSettings')}><span aria-hidden="true">◐</span><span>{t('appearance')}</span></summary>
    <div className="appearance-popover">
      <div><span className="preference-label">{t('theme').toLocaleUpperCase(locale)}</span><div className="segmented-control">{(['SYSTEM', 'LIGHT', 'DARK'] as const).map((option) => <button aria-pressed={theme === option} className={theme === option ? 'active' : ''} onClick={() => setTheme(option)} key={option}>{option === 'SYSTEM' ? t('themeAuto') : option === 'LIGHT' ? t('themeLight') : t('themeDark')}</button>)}</div></div>
      <div><span className="preference-label">{t('textSize').toLocaleUpperCase(locale)}</span><div className="segmented-control">{(['COMFORTABLE', 'LARGE'] as const).map((option) => <button aria-pressed={textScale === option} className={textScale === option ? 'active' : ''} onClick={() => setTextScale(option)} key={option}>{option === 'COMFORTABLE' ? t('textDefault') : t('textLarge')}</button>)}</div></div>
      <label className="language-status"><span>{t('language').toLocaleUpperCase(locale)}</span><select value={locale} onChange={(event) => setLocale(event.target.value as AppLocale)}>{(Object.entries(localeLabels) as Array<[AppLocale, string]>).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select><small>{t('localizationReady')}</small></label>
    </div>
  </details>
}
