'use client'

import { useState, useRef, useEffect } from 'react'
import { useDateRange, formatDateTR } from './DateRangeContext'

const DAYS_TR = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct']
const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return { year: y, month: m - 1, day: d }
}

function isBetween(date: string, start: string, end: string) {
  return date >= start && date <= end
}

type Preset = { label: string; getRange: (min: string, max: string) => [string, string] }

const presets: Preset[] = [
  {
    label: 'Bugün',
    getRange: () => {
      const t = new Date()
      const s = toDateStr(t.getFullYear(), t.getMonth(), t.getDate())
      return [s, s]
    },
  },
  {
    label: 'Dün',
    getRange: () => {
      const t = new Date(); t.setDate(t.getDate() - 1)
      const s = toDateStr(t.getFullYear(), t.getMonth(), t.getDate())
      return [s, s]
    },
  },
  {
    label: 'Son 7 Gün',
    getRange: () => {
      const e = new Date()
      const s = new Date(); s.setDate(s.getDate() - 6)
      return [toDateStr(s.getFullYear(), s.getMonth(), s.getDate()), toDateStr(e.getFullYear(), e.getMonth(), e.getDate())]
    },
  },
  {
    label: 'Bu Ay',
    getRange: () => {
      const t = new Date()
      return [toDateStr(t.getFullYear(), t.getMonth(), 1), toDateStr(t.getFullYear(), t.getMonth(), t.getDate())]
    },
  },
  {
    label: 'Tüm Zamanlar',
    getRange: (min, max) => [min, max],
  },
]

function CalendarMonth({
  year, month, tempStart, tempEnd, onDayClick, minDate, maxDate,
}: {
  year: number; month: number; tempStart: string; tempEnd: string
  onDayClick: (date: string) => void; minDate: string; maxDate: string
}) {
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfWeek(year, month)
  const prevMonthDays = getDaysInMonth(year, month === 0 ? 11 : month - 1)

  const cells: { day: number; current: boolean; dateStr: string }[] = []

  for (let i = 0; i < firstDay; i++) {
    const d = prevMonthDays - firstDay + 1 + i
    const pm = month === 0 ? 11 : month - 1
    const py = month === 0 ? year - 1 : year
    cells.push({ day: d, current: false, dateStr: toDateStr(py, pm, d) })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true, dateStr: toDateStr(year, month, d) })
  }
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    const nm = month === 11 ? 0 : month + 1
    const ny = month === 11 ? year + 1 : year
    cells.push({ day: d, current: false, dateStr: toDateStr(ny, nm, d) })
  }

  const rows: typeof cells[] = []
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7))
  }

  return (
    <div style={{ minWidth: 240 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: 6 }}>
        {DAYS_TR.map(d => (
          <div key={d} style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '4px 0', fontWeight: 600 }}>{d}</div>
        ))}
      </div>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center' }}>
          {row.map((cell, ci) => {
            const isStart = cell.dateStr === tempStart
            const isEnd = cell.dateStr === tempEnd
            const inRange = tempStart && tempEnd && isBetween(cell.dateStr, tempStart, tempEnd)
            const disabled = cell.dateStr < minDate || cell.dateStr > maxDate
            const isEdge = isStart || isEnd

            return (
              <div
                key={ci}
                onClick={() => !disabled && cell.current && onDayClick(cell.dateStr)}
                style={{
                  padding: '6px 0',
                  fontSize: 12.5,
                  cursor: disabled || !cell.current ? 'default' : 'pointer',
                  color: !cell.current ? 'var(--text-secondary)' : disabled ? 'var(--text-secondary)' : isEdge ? '#fff' : inRange ? '#6366f1' : 'var(--text-primary)',
                  opacity: !cell.current ? 0.3 : disabled ? 0.4 : 1,
                  background: isEdge ? '#6366f1' : inRange ? 'rgba(99,102,241,0.1)' : 'transparent',
                  borderRadius: isStart ? '50% 0 0 50%' : isEnd ? '0 50% 50% 0' : (isStart && isEnd) ? '50%' : 0,
                  fontWeight: isEdge ? 700 : 400,
                  transition: 'background 0.15s, color 0.15s',
                  position: 'relative',
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: '50%',
                  background: isEdge ? '#6366f1' : 'transparent',
                  color: isEdge ? '#fff' : 'inherit',
                }}>
                  {cell.day}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default function DateRangePicker() {
  const { startDate, endDate, setStartDate, setEndDate, minDate, maxDate, loading } = useDateRange()
  const [open, setOpen] = useState(false)
  const [tempStart, setTempStart] = useState(startDate)
  const [tempEnd, setTempEnd] = useState(endDate)
  const [selectingEnd, setSelectingEnd] = useState(false)
  const [leftMonth, setLeftMonth] = useState(0)
  const [leftYear, setLeftYear] = useState(2026)
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (startDate) {
      const p = parseDate(startDate)
      setLeftYear(p.year)
      setLeftMonth(p.month)
      setTempStart(startDate)
      setTempEnd(endDate)
    }
  }, [startDate, endDate])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (loading) return null

  const rightMonth = leftMonth === 11 ? 0 : leftMonth + 1
  const rightYear = leftMonth === 11 ? leftYear + 1 : leftYear

  const prevMonth = () => {
    if (leftMonth === 0) { setLeftMonth(11); setLeftYear(leftYear - 1) }
    else setLeftMonth(leftMonth - 1)
  }
  const nextMonth = () => {
    if (leftMonth === 11) { setLeftMonth(0); setLeftYear(leftYear + 1) }
    else setLeftMonth(leftMonth + 1)
  }

  const handleDayClick = (date: string) => {
    setActivePreset(null)
    if (!selectingEnd) {
      setTempStart(date)
      setTempEnd('')
      setSelectingEnd(true)
    } else {
      if (date < tempStart) {
        setTempStart(date)
        setTempEnd(tempStart)
      } else {
        setTempEnd(date)
      }
      setSelectingEnd(false)
    }
  }

  const handlePreset = (preset: Preset) => {
    const [s, e] = preset.getRange(minDate, maxDate)
    setTempStart(s)
    setTempEnd(e)
    setSelectingEnd(false)
    setActivePreset(preset.label)
    const p = parseDate(s)
    setLeftYear(p.year)
    setLeftMonth(p.month)
  }

  const handleApply = () => {
    if (tempStart && tempEnd) {
      setStartDate(tempStart)
      setEndDate(tempEnd)
      setOpen(false)
    }
  }

  const handleCancel = () => {
    setTempStart(startDate)
    setTempEnd(endDate)
    setSelectingEnd(false)
    setActivePreset(null)
    setOpen(false)
  }

  const navBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
    color: 'var(--text-secondary)', padding: '4px 8px', borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        className="date-range-trigger"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-color)',
          borderRadius: 8, padding: '6px 12px', fontSize: 12.5,
          color: 'var(--text-primary)', cursor: 'pointer', outline: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span>{formatDateTR(startDate)} – {formatDateTR(endDate)}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="date-picker-popup" style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          zIndex: 1000, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', minWidth: 620,
        }}>
          <div style={{ display: 'flex', flex: 1 }}>
            {/* Presets */}
            <div className="date-picker-presets" style={{
              borderRight: '1px solid var(--border-color)', padding: '16px 0',
              minWidth: 130, display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, padding: '4px 16px 12px', color: 'var(--text-primary)' }}>
                Tarih Seç
              </div>
              {presets.map(p => (
                <button
                  key={p.label}
                  onClick={() => handlePreset(p)}
                  style={{
                    background: activePreset === p.label ? 'rgba(99,102,241,0.1)' : 'transparent',
                    border: 'none', padding: '8px 16px', fontSize: 12.5, cursor: 'pointer',
                    color: activePreset === p.label ? '#6366f1' : 'var(--text-muted)',
                    textAlign: 'left', fontWeight: activePreset === p.label ? 600 : 400,
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Calendars */}
            <div style={{ display: 'flex', gap: 0, flex: 1 }}>
              {/* Left Calendar */}
              <div style={{ flex: 1, padding: '16px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <button onClick={prevMonth} style={navBtn}>&lt;</button>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{MONTHS_TR[leftMonth]} {leftYear}</div>
                  <button onClick={nextMonth} style={navBtn}>&gt;</button>
                </div>
                <CalendarMonth
                  year={leftYear} month={leftMonth}
                  tempStart={tempStart} tempEnd={tempEnd}
                  onDayClick={handleDayClick} minDate={minDate} maxDate={maxDate}
                />
              </div>

              {/* Right Calendar */}
              <div style={{ flex: 1, padding: '16px 16px', borderLeft: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <button onClick={prevMonth} style={navBtn}>&lt;</button>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{MONTHS_TR[rightMonth]} {rightYear}</div>
                  <button onClick={nextMonth} style={navBtn}>&gt;</button>
                </div>
                <CalendarMonth
                  year={rightYear} month={rightMonth}
                  tempStart={tempStart} tempEnd={tempEnd}
                  onDayClick={handleDayClick} minDate={minDate} maxDate={maxDate}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            padding: '12px 16px', borderTop: '1px solid var(--border-color)',
          }}>
            <button
              onClick={handleCancel}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-color)',
                borderRadius: 8, padding: '8px 24px', fontSize: 13,
                color: 'var(--text-primary)', cursor: 'pointer',
              }}
            >
              Vazgeç
            </button>
            <button
              onClick={handleApply}
              style={{
                background: '#6366f1', border: 'none', borderRadius: 8,
                padding: '8px 24px', fontSize: 13, color: '#fff',
                cursor: tempStart && tempEnd ? 'pointer' : 'not-allowed',
                opacity: tempStart && tempEnd ? 1 : 0.5, fontWeight: 600,
              }}
            >
              Uygula
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
