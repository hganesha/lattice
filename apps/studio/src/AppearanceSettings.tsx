import { useEffect, useState } from 'react'
import { IconMoon, IconSun } from './icons'
import { useLocale, type AppLocale } from './i18n/I18nProvider'
import { useMessages } from './i18n/messages'

type ThemePreference = 'LIGHT' | 'DARK'
type TextScale = 'COMFORTABLE' | 'LARGE'

const THEME_KEY = 'lattice:theme'
const TEXT_SCALE_KEY = 'lattice:text-scale'

function storedTheme(): ThemePreference {
  const value = localStorage.getItem(THEME_KEY)
  return value === 'LIGHT' || value === 'DARK' ? value : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'DARK' : 'LIGHT'
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
    document.documentElement.dataset.theme = theme.toLocaleLowerCase()
    document.documentElement.dataset.themePreference = theme.toLocaleLowerCase()
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.textScale = textScale.toLocaleLowerCase()
    localStorage.setItem(TEXT_SCALE_KEY, textScale)
  }, [textScale])

  const themeLabel = theme === 'LIGHT' ? t('themeLight') : t('themeDark')
  const textScaleLabel = textScale === 'COMFORTABLE' ? t('textDefault') : t('textLarge')

  return <div className="display-controls" role="group" aria-label={t('appearanceSettings')}>
    <button
      className="ghost display-control theme-toggle"
      type="button"
      aria-label={`${t('theme')}: ${themeLabel}`}
      aria-pressed={theme === 'DARK'}
      title={`${t('theme')}: ${themeLabel}`}
      onClick={() => setTheme((current) => current === 'LIGHT' ? 'DARK' : 'LIGHT')}
    >
      {theme === 'LIGHT' ? <IconSun /> : <IconMoon />}
    </button>
    <button
      className="ghost display-control text-scale-toggle"
      type="button"
      aria-label={`${t('textSize')}: ${textScaleLabel}`}
      aria-pressed={textScale === 'LARGE'}
      title={`${t('textSize')}: ${textScaleLabel}`}
      onClick={() => setTextScale((current) => current === 'COMFORTABLE' ? 'LARGE' : 'COMFORTABLE')}
    >
      <span className="text-scale-symbol" aria-hidden="true">Aa</span>
      <span>{textScaleLabel}</span>
    </button>
    <label className="language-picker">
      <span className="visually-hidden">{t('language')}</span>
      <select aria-label={t('language')} value={locale} onChange={(event) => setLocale(event.target.value as AppLocale)}>
        {(Object.entries(localeLabels) as Array<[AppLocale, string]>).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
      </select>
    </label>
  </div>
}
