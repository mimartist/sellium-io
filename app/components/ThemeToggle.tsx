'use client'

import { useState, useEffect } from 'react'

export default function ThemeToggle({ compact }: { compact?: boolean } = {}) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('sellometrix-theme') as 'dark' | 'light' | null
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved)
    }
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('sellometrix-theme', next)
  }

  if (compact) {
    return (
      <button
        onClick={toggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 44,
          height: 44,
          borderRadius: 10,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-secondary)',
          fontSize: 18,
          cursor: 'pointer',
        }}
        aria-label="Tema değiştir"
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '8px 12px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        color: 'var(--text-secondary)',
        fontSize: 12,
        cursor: 'pointer',
        marginBottom: 8,
      }}
    >
      <span>{theme === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode'}</span>
      <div style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: theme === 'light' ? '#6366f1' : '#333',
        position: 'relative',
        transition: 'background 0.2s',
      }}>
        <div style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          position: 'absolute',
          top: 2,
          left: theme === 'light' ? 18 : 2,
          transition: 'left 0.2s',
        }} />
      </div>
    </button>
  )
}
