import React from 'react'
import ReactDOM from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import { App } from './App'
import { LatticeI18nProvider } from './i18n/I18nProvider'
import './styles.css'
import './import-studio.css'
import './binding-studio.css'
import './assurance-studio.css'
import './review-queue.css'
import './policy-studio.css'
import './runtime-studio.css'
import './evidence-registry.css'
import './release-management.css'
import './appearance.css'

const savedTheme = localStorage.getItem('lattice:theme')
const theme = savedTheme === 'LIGHT' ? 'light' : savedTheme === 'DARK' ? 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
document.documentElement.dataset.theme = theme
document.documentElement.dataset.themePreference = savedTheme?.toLocaleLowerCase() ?? 'system'
document.documentElement.dataset.textScale = localStorage.getItem('lattice:text-scale') === 'LARGE' ? 'large' : 'comfortable'
const savedLocale = localStorage.getItem('lattice:locale')
document.documentElement.lang = savedLocale === 'es-ES' || savedLocale === 'en-XA' ? savedLocale : 'en-US'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LatticeI18nProvider><App /></LatticeI18nProvider>
  </React.StrictMode>,
)
