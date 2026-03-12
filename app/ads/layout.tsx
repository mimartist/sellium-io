'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { DateRangeProvider } from './DateRangeContext'
import DateRangePicker from './DateRangePicker'
import { COLORS } from '@/lib/design-tokens'
import { useTranslation } from '@/lib/i18n'

const tabs = [
  { key: 'adsLayout.overview', href: '/ads' },
  { key: 'adsLayout.campaigns', href: '/ads/campaigns' },
  { key: 'adsLayout.productPerf', href: '/ads/products' },
  { key: 'adsLayout.searchTerms', href: '/ads/keywords' },
  { key: 'adsLayout.brand', href: '/ads/brand' },
]

export default function AdsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { t } = useTranslation()

  const isActiveTab = (href: string) => {
    if (href === '/ads') return pathname === '/ads'
    return pathname.startsWith(href)
  }

  return (
    <DateRangeProvider>
      {/* HEADER: DATE PICKER + TABS */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <DateRangePicker />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #F1F5F9' }}>
          {tabs.map((tab, idx) => {
            const active = isActiveTab(tab.href)
            return (
              <div key={tab.href} style={{ display: 'flex', alignItems: 'center' }}>
                {idx > 0 && <span style={{ color: '#E2E8F0', fontSize: 14, userSelect: 'none' }}>|</span>}
                <Link href={tab.href} style={{ textDecoration: 'none' }}>
                  <div style={{
                    padding: '10px 10px',
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    color: active ? COLORS.accent : '#475569',
                    borderBottom: active ? `2px solid ${COLORS.accent}` : '2px solid transparent',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    marginBottom: -1,
                  }}>
                    {t(tab.key)}
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      </div>

      {children}
    </DateRangeProvider>
  )
}
