'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import DashboardShell from '../components/DashboardShell'
import Sidebar from '../components/Sidebar'
import { DateRangeProvider } from './DateRangeContext'
import DateRangePicker from './DateRangePicker'

const tabs = [
  { label: 'Genel Bakış', href: '/ads' },
  { label: 'Kampanyalar', href: '/ads/campaigns' },
  { label: 'Ürün Performansı', href: '/ads/products' },
  { label: 'Arama Terimleri', href: '/ads/keywords' },
  { label: 'Brand', href: '/ads/brand' },
]

export default function AdsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const isActiveTab = (href: string) => {
    if (href === '/ads') return pathname === '/ads'
    return pathname.startsWith(href)
  }

  return (
    <DateRangeProvider>
      <DashboardShell sidebar={<Sidebar />}>

        {/* HEADER: TABS + DATE PICKER */}
        <div className="ads-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, borderBottom: '1px solid var(--border-color)' }}>
          <div className="tab-nav" style={{ display: 'flex', gap: 4 }}>
            {tabs.map(tab => {
              const active = isActiveTab(tab.href)
              return (
                <Link key={tab.href} href={tab.href} style={{ textDecoration: 'none' }}>
                  <div style={{
                    padding: '10px 18px',
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'color 0.15s, border-color 0.15s',
                    marginBottom: -1,
                  }}>
                    {tab.label}
                  </div>
                </Link>
              )
            })}
          </div>
          <div style={{ paddingBottom: 8 }}>
            <DateRangePicker />
          </div>
        </div>

        {children}
      </DashboardShell>
    </DateRangeProvider>
  )
}
