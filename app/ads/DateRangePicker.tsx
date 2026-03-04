'use client'

import { useDateRange } from './DateRangeContext'

export default function DateRangePicker() {
  const { startDate, endDate, setStartDate, setEndDate, minDate, maxDate, loading } = useDateRange()

  if (loading) return null

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 12.5,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    outline: 'none',
  }

  return (
    <div className="date-range-picker" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <input
        type="date"
        value={startDate}
        min={minDate}
        max={endDate}
        onChange={e => setStartDate(e.target.value)}
        style={inputStyle}
      />
      <span style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1 }}>–</span>
      <input
        type="date"
        value={endDate}
        min={startDate}
        max={maxDate}
        onChange={e => setEndDate(e.target.value)}
        style={inputStyle}
      />
    </div>
  )
}
