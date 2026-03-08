'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import DashboardShell from '../components/DashboardShell'
import ThemeToggle from '../components/ThemeToggle'
import LogoutButton from '../components/LogoutButton'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart,
} from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MARKETPLACE_OPTIONS = [
  { value: 'all', label: 'All Marketplaces', flag: '\u{1F30D}' },
  { value: 'Amazon.de', label: 'Amazon.de', flag: '\u{1F1E9}\u{1F1EA}' },
  { value: 'Amazon.fr', label: 'Amazon.fr', flag: '\u{1F1EB}\u{1F1F7}' },
  { value: 'Amazon.es', label: 'Amazon.es', flag: '\u{1F1EA}\u{1F1F8}' },
  { value: 'Amazon.it', label: 'Amazon.it', flag: '\u{1F1EE}\u{1F1F9}' },
  { value: 'Amazon.co.uk', label: 'Amazon.co.uk', flag: '\u{1F1EC}\u{1F1E7}' },
  { value: 'Amazon.nl', label: 'Amazon.nl', flag: '\u{1F1F3}\u{1F1F1}' },
  { value: 'Amazon.pl', label: 'Amazon.pl', flag: '\u{1F1F5}\u{1F1F1}' },
  { value: 'Amazon.ie', label: 'Amazon.ie', flag: '\u{1F1EE}\u{1F1EA}' },
  { value: 'Amazon.com.be', label: 'Amazon.com.be', flag: '\u{1F1E7}\u{1F1EA}' },
  { value: 'Amazon.se', label: 'Amazon.se', flag: '\u{1F1F8}\u{1F1EA}' },
]

const MARKETPLACE_FLAG_MAP: Record<string, string> = {}
MARKETPLACE_OPTIONS.forEach(m => { MARKETPLACE_FLAG_MAP[m.value] = m.flag })

interface MonthlyRow {
  report_month: string
  units: number
  sales: number
  promo: number
  amazon_fees: number
  cogs: number
  refunds: number
  subscription: number
}

interface DailyRow {
  purchase_day: string
  units: number
  sales: number
  net_profit: number
}

function generateMonthOptions(): string[] {
  const months: string[] = []
  const start = new Date(2025, 0)
  const end = new Date(2026, 1)
  let cur = new Date(end)
  while (cur >= start) {
    months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
    cur.setMonth(cur.getMonth() - 1)
  }
  return months
}

const fmt = (v: number) => `\u20AC${v.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`
const fmtPct = (v: number) => `%${v.toFixed(1)}`
const pctChange = (cur: number, prev: number) => prev === 0 ? 0 : ((cur - prev) / Math.abs(prev)) * 100

type SortKey = 'marketplace' | 'sales' | 'units' | 'fees' | 'adSpend' | 'cogs' | 'netProfit' | 'margin'
type SortDir = 'asc' | 'desc'

export default function PLPage() {
  const monthOptions = useMemo(() => generateMonthOptions(), [])
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0])
  const [selectedMarketplace, setSelectedMarketplace] = useState('all')
  const [rawData, setRawData] = useState<any[]>([])
  const [dailyData, setDailyData] = useState<DailyRow[]>([])
  const [adData, setAdData] = useState<Record<string, { sp: number; sb: number }>>({})
  const [loading, setLoading] = useState(true)
  const [mpSortKey, setMpSortKey] = useState<SortKey>('sales')
  const [mpSortDir, setMpSortDir] = useState<SortDir>('desc')

  // Fetch all data
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const [mpRes, spRes, sbRes] = await Promise.all([
        supabase.from('monthly_pl').select('report_month, marketplace, units, sales, promo, commission, fba, storage, return_mgmt, digital_fba, digital_sell, cogs, refunds, subscription, sp_spend'),
        supabase.from('ad_product_performance').select('date, spend'),
        supabase.from('ad_brand_performance').select('date, spend'),
      ])

      setRawData(mpRes.data || [])

      const adMap: Record<string, { sp: number; sb: number }> = {}
      spRes.data?.forEach((r: any) => {
        const m = r.date?.substring(0, 7)
        if (!m) return
        if (!adMap[m]) adMap[m] = { sp: 0, sb: 0 }
        adMap[m].sp += Number(r.spend) || 0
      })
      sbRes.data?.forEach((r: any) => {
        const m = r.date?.substring(0, 7)
        if (!m) return
        if (!adMap[m]) adMap[m] = { sp: 0, sb: 0 }
        adMap[m].sb += Number(r.spend) || 0
      })
      setAdData(adMap)
      setLoading(false)
    }
    fetchData()
  }, [])

  // Fetch daily data when month or marketplace changes
  useEffect(() => {
    async function fetchDaily() {
      let query = supabase
        .from('daily_pl')
        .select('purchase_day, units, sales, est_net_profit, marketplace')
        .eq('report_month', selectedMonth)
        .order('purchase_day')

      if (selectedMarketplace !== 'all') {
        query = query.eq('marketplace', selectedMarketplace)
      }

      const { data } = await query

      const dayMap: Record<string, DailyRow> = {}
      data?.forEach((r: any) => {
        const d = r.purchase_day
        if (!dayMap[d]) dayMap[d] = { purchase_day: d, units: 0, sales: 0, net_profit: 0 }
        dayMap[d].units += Number(r.units) || 0
        dayMap[d].sales += Number(r.sales) || 0
        dayMap[d].net_profit += Number(r.est_net_profit) || 0
      })
      setDailyData(Object.values(dayMap).sort((a, b) => a.purchase_day.localeCompare(b.purchase_day)))
    }
    fetchDaily()
  }, [selectedMonth, selectedMarketplace])

  // Filter raw data by marketplace
  const filteredRaw = useMemo(() => {
    if (selectedMarketplace === 'all') return rawData
    return rawData.filter((r: any) => r.marketplace === selectedMarketplace)
  }, [rawData, selectedMarketplace])

  // Aggregate monthly from filtered raw
  const monthlyData = useMemo(() => {
    const monthMap: Record<string, MonthlyRow> = {}
    filteredRaw.forEach((r: any) => {
      const m = r.report_month
      if (!monthMap[m]) monthMap[m] = { report_month: m, units: 0, sales: 0, promo: 0, amazon_fees: 0, cogs: 0, refunds: 0, subscription: 0 }
      monthMap[m].units += Number(r.units) || 0
      monthMap[m].sales += Number(r.sales) || 0
      monthMap[m].promo += Number(r.promo) || 0
      monthMap[m].amazon_fees += (Number(r.commission) || 0) + (Number(r.fba) || 0) + (Number(r.storage) || 0) + (Number(r.return_mgmt) || 0) + (Number(r.digital_fba) || 0) + (Number(r.digital_sell) || 0)
      monthMap[m].cogs += Number(r.cogs) || 0
      monthMap[m].refunds += Number(r.refunds) || 0
      monthMap[m].subscription += Number(r.subscription) || 0
    })
    return Object.values(monthMap).sort((a, b) => b.report_month.localeCompare(a.report_month))
  }, [filteredRaw])

  // Ad spend: when marketplace selected, use sp_spend from monthly_pl (already distributed)
  // When "all", use the separate ad tables for total
  const getAdTotal = (month: string) => {
    if (selectedMarketplace === 'all') {
      const ad = adData[month] || { sp: 0, sb: 0 }
      return ad.sp + ad.sb
    }
    // For specific marketplace, sum sp_spend from filtered raw data for that month
    const rows = filteredRaw.filter((r: any) => r.report_month === month)
    return rows.reduce((sum: number, r: any) => sum + (Number(r.sp_spend) || 0), 0)
  }

  // Current & previous month
  const curIdx = monthlyData.findIndex(m => m.report_month === selectedMonth)
  const cur = monthlyData[curIdx] || { report_month: selectedMonth, units: 0, sales: 0, promo: 0, amazon_fees: 0, cogs: 0, refunds: 0, subscription: 0 }
  const prev = curIdx >= 0 && curIdx < monthlyData.length - 1 ? monthlyData[curIdx + 1] : null

  const curAdTotal = getAdTotal(selectedMonth)
  const prevAdTotal = prev ? getAdTotal(prev.report_month) : 0

  const curNetProfit = cur.sales - cur.promo - cur.refunds - cur.amazon_fees - cur.cogs - cur.subscription - curAdTotal
  const prevNetProfit = prev ? prev.sales - prev.promo - prev.refunds - prev.amazon_fees - prev.cogs - prev.subscription - prevAdTotal : 0
  const curMargin = cur.sales > 0 ? (curNetProfit / cur.sales) * 100 : 0
  const prevMargin = prev && prev.sales > 0 ? (prevNetProfit / prev.sales) * 100 : 0
  const curAcos = cur.sales > 0 ? (curAdTotal / cur.sales) * 100 : 0
  const prevAcos = prev && prev.sales > 0 ? (prevAdTotal / prev.sales) * 100 : 0

  // Monthly chart data
  const monthlyChartData = [...monthlyData].reverse().map(m => {
    const adTotal = getAdTotal(m.report_month)
    const net = m.sales - m.promo - m.refunds - m.amazon_fees - m.cogs - m.subscription - adTotal
    return {
      month: m.report_month.substring(2),
      sales: Math.round(m.sales),
      netProfit: Math.round(net),
    }
  })

  // Daily chart data
  const dailyChartData = dailyData.map(d => ({
    day: d.purchase_day.substring(8),
    sales: Math.round(d.sales),
    netProfit: Math.round(d.net_profit),
  }))

  // Marketplace breakdown (only for "all")
  const mpGrouped = useMemo(() => {
    const filtered = rawData.filter((r: any) => r.report_month === selectedMonth)
    const grouped: Record<string, { marketplace: string; units: number; sales: number; fees: number; adSpend: number; cogs: number; refunds: number; netProfit: number; margin: number }> = {}
    filtered.forEach((r: any) => {
      const mp = r.marketplace || 'Unknown'
      if (!grouped[mp]) grouped[mp] = { marketplace: mp, units: 0, sales: 0, fees: 0, adSpend: 0, cogs: 0, refunds: 0, netProfit: 0, margin: 0 }
      grouped[mp].units += Number(r.units) || 0
      grouped[mp].sales += Number(r.sales) || 0
      const fees = (Number(r.commission) || 0) + (Number(r.fba) || 0) + (Number(r.storage) || 0) + (Number(r.return_mgmt) || 0) + (Number(r.digital_fba) || 0) + (Number(r.digital_sell) || 0)
      grouped[mp].fees += fees
      grouped[mp].adSpend += Number(r.sp_spend) || 0
      grouped[mp].cogs += Number(r.cogs) || 0
      grouped[mp].refunds += Number(r.refunds) || 0
    })
    Object.values(grouped).forEach(mp => {
      mp.netProfit = mp.sales - mp.fees - mp.adSpend - mp.cogs - mp.refunds
      mp.margin = mp.sales > 0 ? (mp.netProfit / mp.sales) * 100 : 0
    })
    return Object.values(grouped)
  }, [rawData, selectedMonth])

  // Sorted marketplace rows
  const mpRows = useMemo(() => {
    const sorted = [...mpGrouped]
    sorted.sort((a, b) => {
      const aVal = a[mpSortKey as keyof typeof a]
      const bVal = b[mpSortKey as keyof typeof b]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return mpSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return mpSortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })
    return sorted
  }, [mpGrouped, mpSortKey, mpSortDir])

  const handleMpSort = (key: SortKey) => {
    if (mpSortKey === key) {
      setMpSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setMpSortKey(key)
      setMpSortDir('desc')
    }
  }

  const sortIndicator = (key: SortKey) => {
    if (mpSortKey !== key) return ' \u2195'
    return mpSortDir === 'asc' ? ' \u2191' : ' \u2193'
  }

  // P&L table rows
  const plRows = [
    { label: 'Sales', cur: cur.sales, prev: prev?.sales || 0, positive: true },
    { label: 'Promo', cur: -cur.promo, prev: -(prev?.promo || 0), positive: false },
    { label: 'Refunds', cur: -cur.refunds, prev: -(prev?.refunds || 0), positive: false },
    { label: 'Amazon Fees', cur: -cur.amazon_fees, prev: -(prev?.amazon_fees || 0), positive: false },
    { label: 'COGS', cur: -cur.cogs, prev: -(prev?.cogs || 0), positive: false },
    { label: 'Subscription', cur: -cur.subscription, prev: -(prev?.subscription || 0), positive: false },
    { label: 'Advertising (SP + SB)', cur: -curAdTotal, prev: -prevAdTotal, positive: false },
  ]
  const netRow = { label: 'Net Profit', cur: curNetProfit, prev: prevNetProfit }
  const marginRow = { label: 'Margin %', cur: curMargin, prev: prevMargin }

  const changeArrow = (change: number) => {
    if (change > 0) return { symbol: '\u2191', color: '#10b981' }
    if (change < 0) return { symbol: '\u2193', color: '#f43f5e' }
    return { symbol: '\u2192', color: 'var(--text-secondary)' }
  }

  const kpis = [
    { label: 'SATI\u015E', value: fmt(cur.sales), change: pctChange(cur.sales, prev?.sales || 0), color: '#6366f1' },
    { label: 'B\u0130R\u0130M', value: cur.units.toLocaleString('de-DE'), change: pctChange(cur.units, prev?.units || 0), color: '#a78bfa' },
    { label: 'NET K\u00C2R', value: fmt(curNetProfit), change: pctChange(curNetProfit, prevNetProfit), color: curNetProfit >= 0 ? '#10b981' : '#f43f5e' },
    { label: 'MARJ', value: fmtPct(curMargin), change: curMargin - prevMargin, color: curMargin >= 0 ? '#10b981' : '#f43f5e' },
    { label: 'REKLAM', value: fmt(curAdTotal), change: pctChange(curAdTotal, prevAdTotal), color: '#f59e0b' },
    { label: 'ACOS', value: fmtPct(curAcos), change: curAcos - prevAcos, color: curAcos < 25 ? '#10b981' : curAcos < 40 ? '#f59e0b' : '#f43f5e' },
  ]

  const tooltipStyle = {
    contentStyle: { background: '#1a1e29', border: '1px solid #222636', borderRadius: 8, fontSize: 12 },
    labelStyle: { color: '#9ca3af' },
  }

  const selectStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    padding: '7px 14px',
    fontSize: 12.5,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    outline: 'none',
  }

  const sidebarContent = (
    <>
      <div style={{ padding: '0 18px 20px', borderBottom: '1px solid var(--border-color)', marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Sellometrix<span style={{ color: '#6366f1' }}>.io</span></div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 2 }}>AI Commerce OS</div>
      </div>
      {[
        { icon: '\u2B21', label: 'Dashboard', href: '/' },
        { icon: '\u25C8', label: 'Karl\u0131l\u0131k', href: '/pl', active: true },
        { icon: '\u25EB', label: 'Stok', href: '#' },
        { icon: '\u25EC', label: 'Reklam', href: '/ads' },
        { icon: '\u25C9', label: 'Rakip Analizi', href: '#' },
        { icon: '\u25CC', label: '\u0130\u00E7erik', href: '#' },
        { icon: '\u25CE', label: 'AI \u00D6neriler', href: '#' },
        { icon: '\u25F1', label: 'Raporlar', href: '#' },
      ].map((item, i) => (
        <div key={i}>
          <Link href={item.href} style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: 13, color: item.active ? '#6366f1' : '#6b7280', background: item.active ? 'rgba(99,102,241,0.1)' : 'transparent', marginBottom: 2, cursor: 'pointer' }}>
              <span>{item.icon}</span><span>{item.label}</span>
            </div>
          </Link>
        </div>
      ))}
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

  if (loading) {
    return (
      <DashboardShell sidebar={sidebarContent}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: '3px solid var(--border-color)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Veriler y\u00FCkleniyor...</div>
          </div>
        </div>
      </DashboardShell>
    )
  }

  const selectedMpOption = MARKETPLACE_OPTIONS.find(m => m.value === selectedMarketplace)!

  return (
    <DashboardShell sidebar={sidebarContent}>
      {/* HEADER */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>P&L Dashboard</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            K\u00E2r & Zarar Analizi \u00B7 {selectedMonth}
            {selectedMarketplace !== 'all' && ` \u00B7 ${selectedMpOption.flag} ${selectedMpOption.label}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            style={selectStyle}
          >
            {monthOptions.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select
            value={selectedMarketplace}
            onChange={e => setSelectedMarketplace(e.target.value)}
            style={selectStyle}
          >
            {MARKETPLACE_OPTIONS.map(m => (
              <option key={m.value} value={m.value}>{m.flag} {m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="kpi-grid-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 20 }}>
        {kpis.map((kpi, i) => {
          const arrow = changeArrow(kpi.change)
          return (
            <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '14px 16px', position: 'relative', overflow: 'hidden', opacity: 0, animation: `fadeInUp 0.6s ease-out ${i * 0.1}s forwards` }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 45, height: 45, borderRadius: '0 14px 0 45px', background: kpi.color, opacity: 0.07 }} />
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{kpi.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-1px', marginBottom: 4 }}>{kpi.value}</div>
              <div style={{ fontSize: 11, color: arrow.color }}>
                {arrow.symbol} {kpi.change >= 0 ? '+' : ''}{kpi.change.toFixed(1)}% \u00F6nceki ay
              </div>
            </div>
          )
        })}
      </div>

      {/* CHARTS ROW */}
      <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        {/* Monthly Trend */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.6s forwards' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Ayl\u0131k Trend</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>Sat\u0131\u015F vs Net K\u00E2r</div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={monthlyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222636" />
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `\u20AC${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...tooltipStyle} formatter={(value: any, name: any) => [fmt(Number(value)), name === 'sales' ? 'Sat\u0131\u015F' : 'Net K\u00E2r']} />
              <Bar dataKey="sales" fill="#6366f1" radius={[4, 4, 0, 0]} name="sales" />
              <Line type="monotone" dataKey="netProfit" stroke="#10b981" strokeWidth={2.5} dot={{ fill: '#10b981', r: 4 }} name="netProfit" />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <div style={{ width: 12, height: 10, background: '#6366f1', borderRadius: 2 }} />Sat\u0131\u015F
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <div style={{ width: 12, height: 3, background: '#10b981', borderRadius: 2 }} />Net K\u00E2r
            </div>
          </div>
        </div>

        {/* Daily Trend */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.7s forwards' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>G\u00FCnl\u00FCk Sat\u0131\u015F Trendi</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>{selectedMonth}</div>
          {dailyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222636" />
                <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `\u20AC${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...tooltipStyle} formatter={(value: any, name: any) => [fmt(Number(value)), name === 'sales' ? 'Sat\u0131\u015F' : 'Net K\u00E2r']} />
                <Line type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="netProfit" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, color: 'var(--text-secondary)', fontSize: 13 }}>Bu ay i\u00E7in g\u00FCnl\u00FCk veri bulunamad\u0131</div>
          )}
          <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <div style={{ width: 12, height: 3, background: '#6366f1', borderRadius: 2 }} />Sat\u0131\u015F
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <div style={{ width: 12, height: 3, background: '#10b981', borderRadius: 2 }} />Net K\u00E2r
            </div>
          </div>
        </div>
      </div>

      {/* P&L TABLE */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, marginBottom: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.8s forwards' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>P&L Tablosu</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 12 }}>Kalem</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 12 }}>{selectedMonth}</th>
                {prev && <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 12 }}>{prev.report_month}</th>}
                <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 12 }}>De\u011Fi\u015Fim</th>
              </tr>
            </thead>
            <tbody>
              {plRows.map((row, i) => {
                const change = row.prev !== 0 ? ((row.cur - row.prev) / Math.abs(row.prev)) * 100 : 0
                const arrow = changeArrow(row.positive ? change : -change)
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text-primary)' }}>{row.label}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: row.cur >= 0 ? '#10b981' : '#f43f5e', fontWeight: 600 }}>{fmt(Math.abs(row.cur))}{row.cur < 0 ? ' \u2212' : ''}</td>
                    {prev && <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{fmt(Math.abs(row.prev))}{row.prev < 0 ? ' \u2212' : ''}</td>}
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: arrow.color, fontSize: 12 }}>
                      {arrow.symbol} {Math.abs(change).toFixed(1)}%
                    </td>
                  </tr>
                )
              })}
              {/* Net Profit Row */}
              <tr style={{ borderTop: '2px solid var(--border-color)', background: 'rgba(99,102,241,0.04)' }}>
                <td style={{ padding: '12px 12px', fontWeight: 700 }}>{netRow.label}</td>
                <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 700, fontSize: 15, color: netRow.cur >= 0 ? '#10b981' : '#f43f5e' }}>{fmt(netRow.cur)}</td>
                {prev && <td style={{ padding: '12px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600 }}>{fmt(netRow.prev)}</td>}
                <td style={{ padding: '12px 12px', textAlign: 'right', color: changeArrow(pctChange(netRow.cur, netRow.prev)).color, fontSize: 12, fontWeight: 600 }}>
                  {changeArrow(pctChange(netRow.cur, netRow.prev)).symbol} {Math.abs(pctChange(netRow.cur, netRow.prev)).toFixed(1)}%
                </td>
              </tr>
              {/* Margin Row */}
              <tr style={{ background: 'rgba(99,102,241,0.04)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{marginRow.label}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: marginRow.cur >= 0 ? '#10b981' : '#f43f5e' }}>{fmtPct(marginRow.cur)}</td>
                {prev && <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtPct(marginRow.prev)}</td>}
                <td style={{ padding: '10px 12px', textAlign: 'right', color: changeArrow(marginRow.cur - marginRow.prev).color, fontSize: 12 }}>
                  {changeArrow(marginRow.cur - marginRow.prev).symbol} {Math.abs(marginRow.cur - marginRow.prev).toFixed(1)}pp
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* MARKETPLACE BREAKDOWN - only when "All" selected */}
      {selectedMarketplace === 'all' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.9s forwards' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Marketplace K\u0131r\u0131l\u0131m\u0131</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {([
                    { key: 'marketplace' as SortKey, label: 'Marketplace', align: 'left' },
                    { key: 'sales' as SortKey, label: 'Sat\u0131\u015F', align: 'right' },
                    { key: 'units' as SortKey, label: 'Birim', align: 'right' },
                    { key: 'fees' as SortKey, label: 'Amazon Fees', align: 'right' },
                    { key: 'adSpend' as SortKey, label: 'Reklam', align: 'right' },
                    { key: 'cogs' as SortKey, label: 'COGS', align: 'right' },
                    { key: 'netProfit' as SortKey, label: 'Net K\u00E2r', align: 'right' },
                    { key: 'margin' as SortKey, label: 'Marj', align: 'right' },
                  ]).map(h => (
                    <th
                      key={h.key}
                      onClick={() => handleMpSort(h.key)}
                      style={{
                        textAlign: h.align as any,
                        padding: '10px 12px',
                        color: mpSortKey === h.key ? '#6366f1' : 'var(--text-secondary)',
                        fontWeight: 500,
                        fontSize: 12,
                        cursor: 'pointer',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h.label}{sortIndicator(h.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mpRows.map((mp, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => setSelectedMarketplace(mp.marketplace)}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                      {MARKETPLACE_FLAG_MAP[mp.marketplace] || '\u{1F30D}'} {mp.marketplace}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmt(mp.sales)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{mp.units.toLocaleString('de-DE')}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f43f5e' }}>{fmt(mp.fees)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b' }}>{fmt(mp.adSpend)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f43f5e' }}>{fmt(mp.cogs)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: mp.netProfit >= 0 ? '#10b981' : '#f43f5e' }}>{fmt(mp.netProfit)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: mp.margin >= 0 ? '#10b981' : '#f43f5e' }}>{fmtPct(mp.margin)}</td>
                  </tr>
                ))}
                {mpRows.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Bu ay i\u00E7in marketplace verisi bulunamad\u0131</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}
