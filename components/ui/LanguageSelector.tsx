'use client'

import { useTranslation, LANGUAGES } from '@/lib/i18n'
import { COLORS } from '@/lib/design-tokens'

export default function LanguageSelector() {
  const { lang, setLang } = useTranslation()

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
      {LANGUAGES.map((l, i) => (
        <span key={l.code} style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => setLang(l.code)}
            style={{
              padding: '4px 8px',
              border: 'none',
              fontSize: 12,
              fontWeight: lang === l.code ? 700 : 500,
              cursor: 'pointer',
              background: 'transparent',
              color: lang === l.code ? COLORS.accent : COLORS.sub,
              transition: 'all 0.15s',
            }}
          >
            {l.label}
          </button>
          {i < LANGUAGES.length - 1 && (
            <span style={{ color: '#E2E8F0', fontSize: 12, userSelect: 'none' }}>|</span>
          )}
        </span>
      ))}
    </div>
  )
}
