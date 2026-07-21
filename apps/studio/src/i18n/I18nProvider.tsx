import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { IntlProvider } from 'react-intl'
import { spanishMessages } from './es-ES'
import { messages } from './messages'

export type AppLocale = 'en-US' | 'es-ES' | 'en-XA'

const LOCALE_KEY = 'lattice:locale'
const localeLabels: Record<AppLocale, string> = { 'en-US': 'English', 'es-ES': 'Español', 'en-XA': 'Pseudo' }

interface LocaleContextValue {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  localeLabels: Record<AppLocale, string>
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined)

function detectLocale(): AppLocale {
  const stored = localStorage.getItem(LOCALE_KEY)
  if (stored === 'en-US' || stored === 'es-ES' || stored === 'en-XA') return stored
  return navigator.languages.some((locale) => locale.toLocaleLowerCase().startsWith('es')) ? 'es-ES' : 'en-US'
}

function pseudoMessages(): Record<string, string> {
  return Object.fromEntries(Object.values(messages).map((message) => [message.id, `［!! ${message.defaultMessage ?? message.id} !!］`]))
}

export function LatticeI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(detectLocale)
  const translatedMessages = useMemo<Record<string, string>>(() => locale === 'es-ES' ? Object.fromEntries(Object.entries(spanishMessages).map(([key, value]) => [messages[key as keyof typeof messages].id, value])) : locale === 'en-XA' ? pseudoMessages() : {}, [locale])

  useEffect(() => {
    localStorage.setItem(LOCALE_KEY, locale)
    document.documentElement.lang = locale
    document.documentElement.dir = 'ltr'
  }, [locale])

  return <LocaleContext.Provider value={{ locale, setLocale, localeLabels }}><IntlProvider locale={locale} defaultLocale="en-US" messages={translatedMessages} onError={(error) => { if (error.code !== 'MISSING_TRANSLATION') console.error(error) }}>{children}</IntlProvider></LocaleContext.Provider>
}

export function useLocale() {
  const value = useContext(LocaleContext)
  if (!value) throw new Error('useLocale must be used inside LatticeI18nProvider')
  return value
}
