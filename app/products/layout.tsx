'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { COLORS } from '@/lib/design-tokens'

const tabs = [
  { label: 'Add Products', href: '/products/add' },
  { label: 'My Products', href: '/products' },
  { label: 'Performance', href: '/products/performance' },
]

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const isActiveTab = (href: string) => {
    if (href === '/products') return pathname === '/products'
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* TAB NAVIGATION */}
      <div style={{ marginBottom: 24 }}>
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
                    {tab.label}
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      </div>

      {children}
    </>
  )
}
