'use client'

import { useState, useEffect } from 'react'
import ThemeToggle from './ThemeToggle'

interface DashboardShellProps {
  sidebar: React.ReactNode
  children: React.ReactNode
}

export default function DashboardShell({ sidebar, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Close sidebar on route change or resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1024) setSidebarOpen(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  return (
    <div className="dashboard-root" style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>

      {/* MOBILE TOP BAR - hamburger + theme toggle */}
      {!sidebarOpen && (
        <div className="mobile-topbar" style={{ display: 'none', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200, padding: '10px 14px', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            className="mobile-hamburger"
            onClick={() => setSidebarOpen(true)}
            style={{
              display: 'flex',
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              fontSize: 22,
              cursor: 'pointer',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Menüyü aç"
          >
            ☰
          </button>
          <ThemeToggle compact />
        </div>
      )}

      {/* OVERLAY */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 140,
          }}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`dashboard-sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}
        style={{
          width: 210,
          background: 'var(--bg-card)',
          borderRight: '1px solid var(--border-color)',
          padding: '20px 0',
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 150,
        }}
      >
        {/* MOBILE CLOSE BUTTON */}
        <button
          className="mobile-close-btn"
          onClick={() => setSidebarOpen(false)}
          style={{
            display: 'none',
            position: 'absolute',
            top: 14,
            right: 14,
            zIndex: 160,
            width: 36,
            height: 36,
            borderRadius: 8,
            background: 'transparent',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            fontSize: 18,
            cursor: 'pointer',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Menüyü kapat"
        >
          ✕
        </button>
        {sidebar}
      </aside>

      {/* MAIN */}
      <main className="dashboard-main" style={{ marginLeft: 210, flex: 1, padding: 28 }}>
        {children}
      </main>
    </div>
  )
}
