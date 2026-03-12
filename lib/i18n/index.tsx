'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import en from './en'
import de from './de'
import tr from './tr'

export type Lang = 'en' | 'de' | 'tr'

const STORAGE_KEY = 'sellometrix-lang'
const DEFAULT_LANG: Lang = 'en'

const dictionaries: Record<Lang, Record<string, any>> = { en, de, tr }

export const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'de', label: 'DE', flag: '🇩🇪' },
  { code: 'tr', label: 'TR', flag: '🇹🇷' },
]

// Resolve nested key like "sidebar.dashboard" from dictionary object
function resolve(obj: Record<string, any>, key: string): string | undefined {
  const parts = key.split('.')
  let cur: any = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return typeof cur === 'string' ? cur : undefined
}

interface I18nCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nCtx>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (k) => k,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG)

  // Read from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Lang | null
      if (stored && dictionaries[stored]) {
        setLangState(stored)
        document.documentElement.lang = stored
      }
    } catch {}
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
      document.documentElement.lang = l
    } catch {}
  }, [])

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    let val = resolve(dictionaries[lang], key) ?? resolve(dictionaries['en'], key) ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        val = val.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v))
      }
    }
    return val
  }, [lang])

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useTranslation() {
  return useContext(I18nContext)
}
