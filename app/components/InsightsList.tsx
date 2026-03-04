'use client'

import { useState } from 'react'

interface Insight {
  id: number
  title: string
  content: string
  priority: string
}

const badgeStyle = (priority: string) => ({
  critical: { bg: 'rgba(244,63,94,0.15)', color: '#f43f5e', label: 'KRİTİK', icon: '🔴' },
  high: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'ÖNEMLİ', icon: '⚠️' },
  normal: { bg: 'rgba(99,102,241,0.15)', color: '#6366f1', label: 'BİLGİ', icon: '💡' },
}[priority] || { bg: 'rgba(99,102,241,0.15)', color: '#6366f1', label: 'BİLGİ', icon: '💡' })

export default function InsightsList({ insights }: { insights: Insight[] }) {
  const [visibleCount, setVisibleCount] = useState(10)
  const visible = insights.slice(0, visibleCount)

  return (
    <>
      {visible.map((ins, i) => {
        const b = badgeStyle(ins.priority)
        return (
          <div key={ins.id} style={{ display: 'flex', gap: 10, padding: '11px 0', borderBottom: i < visible.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: b.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>{b.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{ins.title}</div>
              <div style={{ fontSize: 11.5, color: '#9ca3af', lineHeight: 1.5 }}>{ins.content}</div>
            </div>
            <div style={{ background: b.bg, color: b.color, padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, flexShrink: 0, alignSelf: 'flex-start' }}>{b.label}</div>
          </div>
        )
      })}
      {visibleCount < insights.length && (
        <button
          onClick={() => setVisibleCount(prev => prev + 10)}
          style={{
            width: '100%',
            marginTop: 12,
            padding: '10px 0',
            background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 8,
            color: '#6366f1',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Daha Fazla Göster ({insights.length - visibleCount} kalan)
        </button>
      )}
    </>
  )
}
