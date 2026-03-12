'use client'

import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface DateRangeCtx {
  startDate: string
  endDate: string
  setStartDate: (d: string) => void
  setEndDate: (d: string) => void
  minDate: string
  maxDate: string
  months: string[]
  loading: boolean
  isAllTime: boolean
}

const DateRangeContext = createContext<DateRangeCtx>({
  startDate: '', endDate: '', setStartDate: () => {}, setEndDate: () => {},
  minDate: '', maxDate: '', months: [], loading: true, isAllTime: true,
})

export const useDateRange = () => useContext(DateRangeContext)


export const formatDateTR = (d: string) => {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}

function getMonthsInRange(start: string, end: string): string[] {
  if (!start || !end) return []
  const months: string[] = []
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [minDate, setMinDate] = useState('')
  const [maxDate, setMaxDate] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRange = async () => {
      // Fetch without brand_id filter for reliability
      const [minRes, maxRes] = await Promise.all([
        supabase.from('amazon_ads').select('date').order('date', { ascending: true }).limit(1),
        supabase.from('amazon_ads').select('date').order('date', { ascending: false }).limit(1),
      ])
      if (minRes.error) console.error('DateRange min error:', minRes.error)
      if (maxRes.error) console.error('DateRange max error:', maxRes.error)
      const min = minRes.data?.[0]?.date || ''
      const max = maxRes.data?.[0]?.date || ''
      console.log('DateRange fetched:', { min, max })
      setMinDate(min)
      setMaxDate(max)
      setStartDate(min)
      setEndDate(max)
      setLoading(false)
    }
    fetchRange()
  }, [])

  const months = useMemo(() => getMonthsInRange(startDate, endDate), [startDate, endDate])
  const isAllTime = !!(minDate && maxDate && startDate === minDate && endDate === maxDate)

  return (
    <DateRangeContext.Provider value={{ startDate, endDate, setStartDate, setEndDate, minDate, maxDate, months, loading, isAllTime }}>
      {children}
    </DateRangeContext.Provider>
  )
}
