'use client'

import { useState, useEffect } from 'react'

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
    <div className="dashboard-root" style={{ display: 'flex', minHeight: '100vh', background: '#0d0f14', color: '#e8eaf0', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>

      {/* MOBILE HAMBURGER */}
      <button
        className="mobile-hamburger"
        onClick={() => setSidebarOpen(true)}
        style={{
          display: 'none',
          position: 'fixed',
          top: 14,
          left: 14,
          zIndex: 200,
          width: 40,
          height: 40,
          borderRadius: 10,
          background: '#13161e',
          border: '1px solid #222636',
          color: '#e8eaf0',
          fontSize: 20,
          cursor: 'pointer',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label="Menüyü aç"
      >
        ☰
      </button>

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
          background: '#13161e',
          borderRight: '1px solid #222636',
          padding: '20px 0',
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 150,
        }}
      >
        {sidebar}
      </aside>

      {/* MAIN */}
      <main className="dashboard-main" style={{ marginLeft: 210, flex: 1, padding: 28 }}>
        {children}
      </main>
    </div>
  )
}
