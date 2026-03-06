'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import DashboardShell from '../components/DashboardShell'
import { DateRangeProvider } from './DateRangeContext'
import DateRangePicker from './DateRangePicker'

const sidebarItems = [
  { icon: '⬡', label: 'Dashboard', href: '/' },
  { icon: '◈', label: 'Karlılık', href: '#' },
  { icon: '◫', label: 'Stok', href: '#' },
  { icon: '◬', label: 'Reklam', href: '/ads', active: true },
  { icon: '◉', label: 'Rakip Analizi', href: '#' },
  { icon: '◌', label: 'İçerik', href: '#' },
  { icon: '◎', label: 'AI Öneriler', href: '#' },
  { icon: '◱', label: 'Raporlar', href: '#' },
]

const tabs = [
  { label: 'Genel Bakış', href: '/ads' },
  { label: 'Kampanyalar', href: '/ads/campaigns' },
  { label: 'Ürün Performansı', href: '/ads/products' },
  { label: 'Arama Terimleri', href: '/ads/keywords' },
  { label: 'Brand', href: '/ads/brand' },
]

export default function AdsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const isActiveTab = (href: string) => {
    if (href === '/ads') return pathname === '/ads'
    return pathname.startsWith(href)
  }

  const sidebarContent = (
    <>
      <div style={{ padding: '0 18px 20px', borderBottom: '1px solid var(--border-color)', marginBottom: 16 }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Sellometrix<span style={{ color: '#6366f1' }}>.io</span></div>
        </Link>
        <div style={{ fontSize: 10, color: '#6b7280', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 2 }}>AI Commerce OS</div>
      </div>
      {sidebarItems.map((item, i) => (
        <Link key={i} href={item.href} style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: 13,
            color: item.active ? '#6366f1' : '#6b7280',
            background: item.active ? 'rgba(99,102,241,0.1)' : 'transparent',
            marginBottom: 2, cursor: 'pointer',
          }}>
            <span>{item.icon}</span><span>{item.label}</span>
          </div>
        </Link>
      ))}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, borderTop: '1px solid var(--border-color)' }}>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#6366f1,#a78bfa)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'white', fontSize: 11 }}>M</div>
          <div><div style={{ fontSize: 12.5, fontWeight: 600 }}>Mimosso</div><div style={{ fontSize: 10, color: '#6b7280' }}>amazon.de</div></div>
        </div>
        <button onClick={handleLogout} style={{
          width: '100%', padding: '7px 0', background: 'transparent', border: '1px solid var(--border-color)',
          borderRadius: 8, color: '#6b7280', fontSize: 12, cursor: 'pointer', transition: 'color 0.2s',
        }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#f43f5e'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
        >
          Çıkış Yap
        </button>
      </div>
    </>
  )

  return (
    <DateRangeProvider>
      <DashboardShell sidebar={sidebarContent}>

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
