import { useEffect, useState } from 'react'
import { IconMoon, IconRows, IconSun } from './icons'
import { IconChiclet } from './SurfaceState'
import { useLocale, type AppLocale } from './i18n/I18nProvider'
import { useMessages } from './i18n/messages'

/** Short codes so the picker holds a chiclet's width; the full names stay in the options. */
const localeCodes: Record<AppLocale, string> = { 'en-US': 'EN', 'es-ES': 'ES', 'en-XA': 'XA' }

type ThemePreference = 'LIGHT' | 'DARK'
type TextScale = 'COMFORTABLE' | 'LARGE'
type Density = 'COMFORTABLE' | 'COMPACT'

const THEME_KEY = 'lattice:theme'
const TEXT_SCALE_KEY = 'lattice:text-scale'
const DENSITY_KEY = 'lattice:density'

function storedTheme(): ThemePreference {
  const value = localStorage.getItem(THEME_KEY)
  return value === 'LIGHT' || value === 'DARK' ? value : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'DARK' : 'LIGHT'
}

function storedTextScale(): TextScale {
  return localStorage.getItem(TEXT_SCALE_KEY) === 'LARGE' ? 'LARGE' : 'COMFORTABLE'
}

function storedDensity(): Density {
  return localStorage.getItem(DENSITY_KEY) === 'COMPACT' ? 'COMPACT' : 'COMFORTABLE'
}

/**
 * Apply an appearance change without animating it.
 *
 * Theme, text scale and density all change many tokens at once, and controls
 * carry colour and size transitions so hover feels responsive. Without this the
 * whole UI cross-fades between palettes and spends a beat half-converted. The
 * `transient` layer suppresses transitions while the attribute is set; the
 * forced reflow commits the new values inside that window, and the attribute
 * comes off on the next frame so ordinary interaction still animates.
 */
function applyInstantly(change: () => void) {
  const root = document.documentElement
  root.dataset.switchingTheme = 'true'
  change()
  void root.offsetHeight
  // requestAnimationFrame does not fire in a hidden or backgrounded tab. On its
  // own it would leave the attribute set, and the app would come back to the
  // foreground with every transition permanently suppressed. The timer is the
  // guarantee; clearing twice is harmless.
  const clear = () => { delete root.dataset.switchingTheme }
  requestAnimationFrame(clear)
  setTimeout(clear, 100)
}

export function AppearanceSettings() {
  const { locale, setLocale, localeLabels } = useLocale()
  const { t } = useMessages()
  const [theme, setTheme] = useState<ThemePreference>(storedTheme)
  const [textScale, setTextScale] = useState<TextScale>(storedTextScale)
  const [density, setDensity] = useState<Density>(storedDensity)

  useEffect(() => {
    applyInstantly(() => {
      document.documentElement.dataset.theme = theme.toLocaleLowerCase()
      document.documentElement.dataset.themePreference = theme.toLocaleLowerCase()
    })
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    applyInstantly(() => { document.documentElement.dataset.textScale = textScale.toLocaleLowerCase() })
    localStorage.setItem(TEXT_SCALE_KEY, textScale)
  }, [textScale])

  useEffect(() => {
    applyInstantly(() => { document.documentElement.dataset.density = density.toLocaleLowerCase() })
    localStorage.setItem(DENSITY_KEY, density)
  }, [density])

  const themeLabel = theme === 'LIGHT' ? t('themeLight') : t('themeDark')
  const textScaleLabel = textScale === 'COMFORTABLE' ? t('textDefault') : t('textLarge')
  const densityLabel = density === 'COMFORTABLE' ? t('densityComfortable') : t('densityCompact')

  // Each toggle names its *current* value, not the one it would switch to: the
  // tooltip is the only place the setting is legible once the label is off the
  // button face, so it has to report state rather than restate the action.
  return <div className="display-controls" role="group" aria-label={t('appearanceSettings')}>
    <IconChiclet
      className="theme-toggle"
      icon={theme === 'LIGHT' ? <IconSun /> : <IconMoon />}
      label={`${t('theme')}: ${themeLabel}`}
      pressed={theme === 'DARK'}
      onClick={() => setTheme((current) => current === 'LIGHT' ? 'DARK' : 'LIGHT')}
    />
    <IconChiclet
      className="text-scale-toggle"
      icon={<span className="text-scale-symbol" aria-hidden="true">Aa</span>}
      label={`${t('textSize')}: ${textScaleLabel}`}
      pressed={textScale === 'LARGE'}
      onClick={() => setTextScale((current) => current === 'COMFORTABLE' ? 'LARGE' : 'COMFORTABLE')}
    />
    <IconChiclet
      className="density-toggle"
      icon={<IconRows />}
      label={`${t('density')}: ${densityLabel}`}
      pressed={density === 'COMPACT'}
      onClick={() => setDensity((current) => current === 'COMFORTABLE' ? 'COMPACT' : 'COMFORTABLE')}
    />
    {/* A select cannot become an icon without losing its value, so it shrinks to
      * the locale's short code and keeps the full name in the option list. */}
    <label className="language-picker" data-tooltip={t('language')}>
      <span className="visually-hidden">{t('language')}</span>
      <select aria-label={t('language')} value={locale} onChange={(event) => setLocale(event.target.value as AppLocale)}>
        {(Object.entries(localeLabels) as Array<[AppLocale, string]>).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
      </select>
      <span className="language-code" aria-hidden="true">{localeCodes[locale]}</span>
    </label>
  </div>
}
