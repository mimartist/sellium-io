'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ThemeToggle from './ThemeToggle'
import LogoutButton from './LogoutButton'

const MENU_ITEMS = [
  { icon: '📊', label: 'Dashboard', href: '/' },
  { icon: '💰', label: 'COGS & Karlılık', href: '/cogs' },
  { icon: '📢', label: 'Reklam Performansı', href: '/ads' },
  { icon: '📦', label: 'Ürün Performansı', href: '/products' },
  { icon: '🤖', label: 'AI Öneriler', href: '/ai' },
  { icon: '🌍', label: 'Platform Kıyaslama', href: '/platforms' },
]

export default function Sidebar() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <>
      <div style={{ padding: '0 18px 20px', borderBottom: '1px solid var(--border-color)', marginBottom: 16 }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Sellometrix<span style={{ color: '#6366f1' }}>.io</span></div>
        </Link>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 2 }}>AI Commerce OS</div>
      </div>
      {MENU_ITEMS.map((item, i) => {
        const active = isActive(item.href)
        return (
          <Link key={i} href={item.href} style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: 13,
              color: active ? '#6366f1' : 'var(--text-secondary)',
              background: active ? 'rgba(99,102,241,0.1)' : 'transparent',
              borderLeft: active ? '3px solid #6366f1' : '3px solid transparent',
              marginBottom: 2, cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}>
              <span>{item.icon}</span><span>{item.label}</span>
            </div>
          </Link>
        )
      })}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, borderTop: '1px solid var(--border-color)' }}>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#6366f1,#a78bfa)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'white', fontSize: 11 }}>M</div>
          <div><div style={{ fontSize: 12.5, fontWeight: 600 }}>Mimosso</div><div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>amazon.de</div></div>
        </div>
        <ThemeToggle />
        <LogoutButton />
      </div>
    </>
  )
}
