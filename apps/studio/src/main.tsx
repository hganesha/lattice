import React from 'react'
import ReactDOM from 'react-dom/client'
// Declares the cascade order and pulls React Flow into the `vendor` layer.
// Must stay first: @layer order is fixed by first declaration.
import './layers.css'
import { App } from './App'
import { LatticeI18nProvider } from './i18n/I18nProvider'
import { LatticeAuthProvider } from './AuthProvider'
import './reset.css'
import './tokens.css'
import './styles.css'
import './surface-kit.css'
import './governance.css'
import './disposition-trail.css'
import './evaluation.css'
import './identity.css'
import './import-studio.css'
import './binding-studio.css'
import './assurance-studio.css'
import './review-queue.css'
import './policy-studio.css'
import './runtime-studio.css'
import './evidence-registry.css'
import './release-management.css'
import './contract-editor.css'
import './appearance.css'
import './auth.css'

const savedTheme = localStorage.getItem('lattice:theme')
const theme = savedTheme === 'LIGHT' ? 'light' : savedTheme === 'DARK' ? 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
document.documentElement.dataset.theme = theme
document.documentElement.dataset.themePreference = savedTheme?.toLocaleLowerCase() ?? 'system'
document.documentElement.dataset.textScale = localStorage.getItem('lattice:text-scale') === 'LARGE' ? 'large' : 'comfortable'
document.documentElement.dataset.density = localStorage.getItem('lattice:density') === 'COMPACT' ? 'compact' : 'comfortable'
const savedLocale = localStorage.getItem('lattice:locale')
document.documentElement.lang = savedLocale === 'es-ES' || savedLocale === 'en-XA' ? savedLocale : 'en-US'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LatticeI18nProvider><LatticeAuthProvider><App /></LatticeAuthProvider></LatticeI18nProvider>
  </React.StrictMode>,
)
