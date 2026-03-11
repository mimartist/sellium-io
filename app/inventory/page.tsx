'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import DashboardShell from '../components/DashboardShell'
import Sidebar from '../components/Sidebar'
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart,
} from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface StockRow {
  msku: string
  asin: string
  fnsku: string
  product_name: string
  price: number
  current_stock: number
  reserved: number
  unsellable: number
  inbound_working: number
  inbound_shipped: number
  inbound_receiving: number
  inbound_total: number
  total_quantity: number
  snapshot_date: string
  sales_30d: number
  sales_90d: number
  sales_year: number
  avg_daily_sales: number
  days_of_stock: number
  returns_total: number
  storage_fee_monthly: number
  weight: number
  product_size_tier: string
  sessions: number
  cvr: number
  buy_box_pct: number
  revenue: number
  orders: number
  refund_rate: number
  parent_asin: string
  stock_status: string
  daily_revenue_loss: number
}

interface MonthlyShipment {
  month: string
  units: number
}

type StockStatus = 'all' | 'out' | 'critical' | 'warning' | 'healthy' | 'overstock' | 'dead' | 'inactive'
type SortKey = 'msku' | 'current_stock' | 'inbound_total' | 'avg_daily_sales' | 'sales_30d' | 'sales_year' | 'sessions' | 'cvr' | 'buy_box_pct' | 'days_of_stock' | 'daily_revenue_loss'
type SortDir = 'asc' | 'desc'
type MiddleTab = 'ai' | 'lowcvr' | 'stars'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  out: { label: 'Stoksuz', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  critical: { label: 'Kritik', color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  warning: { label: 'Uyari', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  healthy: { label: 'Saglikli', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  overstock: { label: 'Fazla Stok', color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
  dead: { label: 'Olu Stok', color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
  inactive: { label: 'Inaktif', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
}

const fmtNum = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 0 })
const fmtCur = (v: number) => `€${v.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`
const fmtDec = (v: number, d = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

function AIIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="aiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="33%" stopColor="#EA4335" />
          <stop offset="66%" stopColor="#FBBC05" />
          <stop offset="100%" stopColor="#34A853" />
        </linearGradient>
      </defs>
      <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="url(#aiGrad)" />
    </svg>
  )
}

function extractSize(msku: string): string {
  if (!msku) return 'Diger'
  const last = msku.split('-').pop()?.toUpperCase() || ''
  const sizeMap: Record<string, string> = {
    'XS': 'XS', 'S': 'S', 'M': 'M', 'L': 'L', 'XL': 'XL', 'XXL': 'XXL',
    '2XL': 'XXL', '3XL': '3XL', '4XL': '4XL', '5XL': '5XL',
  }
  return sizeMap[last] || 'Diger'
}

export default function InventoryPage() {
  const [data, setData] = useState<StockRow[]>([])
  const [monthlyShipments, setMonthlyShipments] = useState<MonthlyShipment[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StockStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('daily_revenue_loss')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedRow, setSelectedRow] = useState<StockRow | null>(null)
  const [middleTab, setMiddleTab] = useState<MiddleTab>('ai')
  const [expandedInsight, setExpandedInsight] = useState<number | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data: stockData } = await supabase
        .from('v_stock_analysis')
        .select('*')
      setData(stockData || [])

      const { data: shipments } = await supabase
        .from('fba_inventory_events')
        .select('event_date, quantity')
        .eq('event_type', 'Shipments')

      const monthMap: Record<string, number> = {}
      shipments?.forEach((s: any) => {
        const m = (s.event_date || '').substring(0, 7)
        if (m) monthMap[m] = (monthMap[m] || 0) + Math.abs(Number(s.quantity) || 0)
      })
      const sorted = Object.entries(monthMap)
        .map(([month, units]) => ({ month, units }))
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-12)
      setMonthlyShipments(sorted)
      setLoading(false)
    }
    fetchData()
  }, [])

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { out: 0, critical: 0, warning: 0, healthy: 0, overstock: 0, dead: 0, inactive: 0 }
    data.forEach(r => { if (r.stock_status && counts[r.stock_status] !== undefined) counts[r.stock_status]++ })
    return counts
  }, [data])

  const totalStock = useMemo(() => data.reduce((s, r) => s + (r.current_stock || 0), 0), [data])
  const totalStorage = useMemo(() => data.reduce((s, r) => s + (r.storage_fee_monthly || 0), 0), [data])
  const totalDailyLoss = useMemo(() => data.filter(r => r.stock_status === 'out').reduce((s, r) => s + (r.daily_revenue_loss || 0), 0), [data])

  // Filter & sort
  const filteredData = useMemo(() => {
    let rows = [...data]
    if (statusFilter !== 'all') rows = rows.filter(r => r.stock_status === statusFilter)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter(r =>
        (r.msku || '').toLowerCase().includes(q) ||
        (r.product_name || '').toLowerCase().includes(q) ||
        (r.asin || '').toLowerCase().includes(q)
      )
    }
    rows.sort((a, b) => {
      const aV = a[sortKey] ?? 0
      const bV = b[sortKey] ?? 0
      if (typeof aV === 'string' && typeof bV === 'string') return sortDir === 'asc' ? aV.localeCompare(bV) : bV.localeCompare(aV)
      return sortDir === 'asc' ? (aV as number) - (bV as number) : (bV as number) - (aV as number)
    })
    return rows
  }, [data, statusFilter, searchQuery, sortKey, sortDir])

  // Size distribution
  const sizeDistribution = useMemo(() => {
    const sizes: Record<string, number> = {}
    data.forEach(r => {
      const s = extractSize(r.msku)
      sizes[s] = (sizes[s] || 0) + 1
    })
    return Object.entries(sizes)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [data])

  // Low CVR products (sessions > 300, cvr < 5)
  const lowCvrProducts = useMemo(() =>
    data.filter(r => (r.sessions || 0) > 300 && (r.cvr || 0) < 5)
      .sort((a, b) => (a.cvr || 0) - (b.cvr || 0))
      .slice(0, 15)
  , [data])

  // Star products (cvr > 12)
  const starProducts = useMemo(() =>
    data.filter(r => (r.cvr || 0) > 12 && (r.sessions || 0) > 50)
      .sort((a, b) => (b.cvr || 0) - (a.cvr || 0))
      .slice(0, 15)
  , [data])

  // AI Insights
  const aiInsights = useMemo(() => {
    const insights: { type: string; title: string; desc: string; detail: string; color: string; priority: number }[] = []

    // 1. Stoksuz kayip
    const outOfStock = data.filter(r => r.stock_status === 'out')
    const dailyLoss = outOfStock.reduce((s, r) => s + (r.daily_revenue_loss || 0), 0)
    if (outOfStock.length > 0) {
      insights.push({
        type: 'Stok Kaybi', title: `${outOfStock.length} urun stoksuz, gunluk ${fmtCur(dailyLoss)} kayip`,
        desc: `Stoksuz urunler nedeniyle gunluk tahmini ${fmtCur(dailyLoss)} gelir kaybediyorsunuz.`,
        detail: `Stoksuz urunler: ${outOfStock.slice(0, 3).map(r => r.msku).join(', ')}${outOfStock.length > 3 ? ` ve ${outOfStock.length - 3} urun daha` : ''}. Acil siparis verin.`,
        color: '#ef4444', priority: 1,
      })
    }

    // 2. Kritik stok uyarisi
    const critical = data.filter(r => r.stock_status === 'critical')
    if (critical.length > 0) {
      insights.push({
        type: 'Kritik Stok', title: `${critical.length} urun kritik seviyede`,
        desc: `Bu urunlerin stoku 7 gun icinde tukenebilir.`,
        detail: `Kritik urunler: ${critical.slice(0, 3).map(r => `${r.msku} (${r.days_of_stock?.toFixed(0) || 0} gun)`).join(', ')}. Siparis planlama sayfasindan hizli aksiyon alin.`,
        color: '#f97316', priority: 2,
      })
    }

    // 3. CVR firsati
    const highTrafficLowCvr = data.filter(r => (r.sessions || 0) > 500 && (r.cvr || 0) < 5 && (r.cvr || 0) > 0)
    if (highTrafficLowCvr.length > 0) {
      const potentialRevenue = highTrafficLowCvr.reduce((s, r) => {
        const potentialOrders = (r.sessions || 0) * 0.05
        return s + potentialOrders * (r.price || 0)
      }, 0)
      insights.push({
        type: 'CVR Firsati', title: `${highTrafficLowCvr.length} urunde CVR iyilestirme firsati`,
        desc: `Yuksek trafik ama dusuk donus orani olan urunler var.`,
        detail: `CVR %5'e cikarsa tahmini ek gelir: ${fmtCur(potentialRevenue)}. Listing optimizasyonu, A+ icerik ve fiyat incelemesi onerilir.`,
        color: '#6366f1', priority: 3,
      })
    }

    // 4. Beden analizi
    const sizeGroups = sizeDistribution.filter(s => s.name !== 'Diger')
    if (sizeGroups.length > 0) {
      const topSize = sizeGroups[0]
      insights.push({
        type: 'Beden Analizi', title: `En yaygin beden: ${topSize.name} (${topSize.count} SKU)`,
        desc: `Beden dagilimi stok planlamasinda onemli bir gosterge.`,
        detail: `Beden dagilimi: ${sizeGroups.slice(0, 5).map(s => `${s.name}: ${s.count}`).join(', ')}. Satis hizina gore beden bazli siparis optimizasyonu yapin.`,
        color: '#f59e0b', priority: 4,
      })
    }

    // 5. Depolama maliyeti
    const highStorageFee = data.filter(r => (r.storage_fee_monthly || 0) > 50)
    if (highStorageFee.length > 0) {
      const totalHighFee = highStorageFee.reduce((s, r) => s + (r.storage_fee_monthly || 0), 0)
      insights.push({
        type: 'Maliyet', title: `${highStorageFee.length} urunde yuksek depolama maliyeti`,
        desc: `Toplam aylik depolama: ${fmtCur(totalStorage)}.`,
        detail: `Yuksek maliyetli urunler (>${fmtCur(50)}/ay): ${highStorageFee.slice(0, 3).map(r => `${r.msku} (${fmtCur(r.storage_fee_monthly || 0)})`).join(', ')}. Dusuk satisli urunlerde removal veya fiyat indirimi dusunun.`,
        color: '#f59e0b', priority: 5,
      })
    }

    // 6. Yildiz urunler
    if (starProducts.length > 0) {
      insights.push({
        type: 'Yildiz Urunler', title: `${starProducts.length} urun %12+ CVR ile parlak performans`,
        desc: `Bu urunler cok yuksek donus oranina sahip.`,
        detail: `En iyi CVR: ${starProducts.slice(0, 3).map(r => `${r.msku} (%${fmtDec(r.cvr || 0)})`).join(', ')}. Bu urunlerin stokunu asla bitirmeyin ve reklam butcesini artirin.`,
        color: '#22c55e', priority: 6,
      })
    }

    return insights.sort((a, b) => a.priority - b.priority).slice(0, 6)
  }, [data, sizeDistribution, starProducts, totalStorage])

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }, [sortKey])

  const sortIndicator = (key: SortKey) => sortKey !== key ? ' ⇅' : sortDir === 'asc' ? ' ↑' : ' ↓'

  const getCvrColor = (cvr: number) => {
    if (cvr >= 12) return '#22c55e'
    if (cvr >= 8) return 'var(--text-primary)'
    if (cvr >= 5) return '#f59e0b'
    return '#ef4444'
  }

  const getStatusBadge = (status: string) => {
    const cfg = STATUS_CONFIG[status] || { label: status, color: 'var(--text-secondary)', bg: 'transparent' }
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
        color: cfg.color, background: cfg.bg, whiteSpace: 'nowrap',
      }}>
        {cfg.label}
      </span>
    )
  }

  // Detail panel AI message
  const getDetailMessage = (row: StockRow) => {
    switch (row.stock_status) {
      case 'out': return `Bu urun stoksuz! Gunluk tahmini ${fmtCur(row.daily_revenue_loss || 0)} gelir kaybediyorsunuz. Acil siparis verin.`
      case 'critical': return `Stok ${row.days_of_stock?.toFixed(0) || 0} gun icinde tukenecek. Siparis planlama sayfasindan hemen siparis olusturun.`
      case 'warning': return `Stok seviyesi dusuk (${row.days_of_stock?.toFixed(0) || 0} gun). Yakin zamanda siparis planlayin.`
      case 'healthy': return `Stok seviyesi saglikli (${row.days_of_stock?.toFixed(0) || 0} gun). Mevcut satis hizinda sorun yok.`
      case 'overstock': return `Fazla stok! ${row.days_of_stock?.toFixed(0) || 0} gunluk stok var. Depolama maliyetini azaltmak icin promosyon veya fiyat indirimi dusunun.`
      case 'dead': return `Olu stok. Bu urun satilmiyor. Removal order veya buyuk indirim ile stoku eritmeyi dusunun.`
      default: return `Urun inaktif durumda. Listing'i kontrol edin.`
    }
  }

  // Styles
  const cardStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20 }
  const tooltipStyle = { contentStyle: { background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)' }, labelStyle: { color: 'var(--text-secondary)' } }
  const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 8px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }

  const sidebarContent = <Sidebar />

  if (loading) {
    return (
      <DashboardShell sidebar={sidebarContent}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: '3px solid var(--border-color)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Stok verileri yukleniyor...</div>
          </div>
        </div>
      </DashboardShell>
    )
  }

  const snapshotDate = data[0]?.snapshot_date || ''

  return (
    <DashboardShell sidebar={sidebarContent}>
      {/* HEADER */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Stok Takibi & Analiz</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, margin: 0 }}>
            {snapshotDate && `Son guncelleme: ${snapshotDate} · `}{data.length} SKU
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {statusCounts.out > 0 && (
            <div style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 11, fontWeight: 600, color: '#ef4444' }}>
              {statusCounts.out} Stoksuz · {fmtCur(totalDailyLoss)}/gun kayip
            </div>
          )}
          {statusCounts.critical > 0 && (
            <div style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', fontSize: 11, fontWeight: 600, color: '#f97316' }}>
              {statusCounts.critical} Kritik
            </div>
          )}
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'TOPLAM STOK', value: fmtNum(totalStock), color: '#6366f1', filter: 'all' as StockStatus },
          { label: 'STOKSUZ', value: fmtNum(statusCounts.out), color: '#ef4444', filter: 'out' as StockStatus },
          { label: 'KRITIK', value: fmtNum(statusCounts.critical), color: '#f97316', filter: 'critical' as StockStatus },
          { label: 'UYARI', value: fmtNum(statusCounts.warning), color: '#f59e0b', filter: 'warning' as StockStatus },
          { label: 'SAGLIKLI', value: fmtNum(statusCounts.healthy), color: '#22c55e', filter: 'healthy' as StockStatus },
          { label: 'FAZLA STOK', value: fmtNum(statusCounts.overstock), color: '#6366f1', filter: 'overstock' as StockStatus },
          { label: 'OLU STOK', value: fmtNum(statusCounts.dead), color: '#64748b', filter: 'dead' as StockStatus },
          { label: 'AYLIK DEPOLAMA', value: fmtCur(totalStorage), color: '#f59e0b', filter: 'all' as StockStatus },
        ].map((kpi, i) => (
          <div
            key={i}
            onClick={() => kpi.filter !== 'all' || i === 0 ? setStatusFilter(kpi.filter) : undefined}
            style={{
              ...cardStyle, padding: '14px 16px', position: 'relative', overflow: 'hidden',
              cursor: 'pointer', opacity: 0, animation: `fadeInUp 0.6s ease-out ${i * 0.08}s forwards`,
              border: statusFilter === kpi.filter && kpi.filter !== 'all' ? `1px solid ${kpi.color}` : '1px solid var(--border-color)',
            }}
          >
            <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: kpi.color, opacity: 0.08 }} />
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, marginBottom: 6 }}>{kpi.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* MIDDLE SECTION: 2 columns */}
      <div className="inv-mid-grid" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 14, marginBottom: 20 }}>
        {/* LEFT: Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Monthly shipment trend */}
          <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.5s forwards' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Aylik Sevkiyat Trendi</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={monthlyShipments}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => v.substring(5)} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} formatter={(value: any) => [fmtNum(Number(value)), 'Adet']} />
                <Bar dataKey="units" fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Size distribution */}
          <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.6s forwards' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Beden Dagilimi</div>
            {sizeDistribution.slice(0, 8).map((s, i) => {
              const maxCount = sizeDistribution[0]?.count || 1
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 36, textAlign: 'right' }}>{s.name}</span>
                  <div style={{ flex: 1, height: 14, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(s.count / maxCount) * 100}%`, background: '#6366f1', borderRadius: 4, transition: 'width 0.5s ease' }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 28 }}>{s.count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* RIGHT: Tabbed panel */}
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.55s forwards' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-color)', marginBottom: 16 }}>
            {([
              { key: 'ai' as MiddleTab, label: 'AI Oneriler' },
              { key: 'lowcvr' as MiddleTab, label: 'Dusuk CVR' },
              { key: 'stars' as MiddleTab, label: 'Yildiz Urunler' },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setMiddleTab(tab.key)}
                style={{
                  padding: '8px 16px', fontSize: 12, fontWeight: middleTab === tab.key ? 600 : 400,
                  color: middleTab === tab.key ? '#6366f1' : 'var(--text-secondary)',
                  borderBottom: middleTab === tab.key ? '2px solid #6366f1' : '2px solid transparent',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                }}
              >
                {tab.key === 'ai' && <AIIcon size={14} />} {tab.label}
              </button>
            ))}
          </div>

          {/* AI Insights Tab */}
          {middleTab === 'ai' && (
            <div style={{ background: 'var(--ai-gradient)', borderRadius: 10, padding: 16 }}>
              {aiInsights.map((insight, i) => (
                <div
                  key={i}
                  onClick={() => setExpandedInsight(expandedInsight === i ? null : i)}
                  style={{
                    borderLeft: `3px solid ${insight.color}`, padding: '10px 14px', marginBottom: 8,
                    background: 'var(--bg-card)', borderRadius: '0 8px 8px 0', cursor: 'pointer',
                    border: `1px solid var(--border-color)`, borderLeftColor: insight.color, borderLeftWidth: 3,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: insight.color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{insight.type}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{expandedInsight === i ? '▲' : '▼'}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{insight.title}</div>
                  {expandedInsight === i && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>{insight.detail}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Link href="/inventory/orders" style={{
                          padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 6,
                          background: `${insight.color}20`, color: insight.color, textDecoration: 'none',
                          border: `1px solid ${insight.color}40`,
                        }}>
                          Siparis Planla
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Low CVR Tab */}
          {middleTab === 'lowcvr' && (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Oturum &gt; 300 ve CVR &lt; %5 olan urunler</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th style={thStyle}>SKU</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Oturum</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>CVR</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Buy Box</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Gelir</th>
                  </tr>
                </thead>
                <tbody>
                  {lowCvrProducts.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '6px 8px', fontSize: 11 }}>{r.msku}</td>
                      <td style={{ padding: '6px 8px', fontSize: 12, textAlign: 'right' }}>{fmtNum(r.sessions || 0)}</td>
                      <td style={{ padding: '6px 8px', fontSize: 12, textAlign: 'right', color: getCvrColor(r.cvr || 0), fontWeight: 600 }}>%{fmtDec(r.cvr || 0)}</td>
                      <td style={{ padding: '6px 8px', fontSize: 12, textAlign: 'right' }}>%{fmtDec(r.buy_box_pct || 0)}</td>
                      <td style={{ padding: '6px 8px', fontSize: 12, textAlign: 'right' }}>{fmtCur(r.revenue || 0)}</td>
                    </tr>
                  ))}
                  {lowCvrProducts.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>Dusuk CVR urunu bulunamadi</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Star Products Tab */}
          {middleTab === 'stars' && (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>CVR &gt; %12 olan yildiz urunler</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th style={thStyle}>SKU</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>CVR</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Oturum</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Stok</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Gelir</th>
                  </tr>
                </thead>
                <tbody>
                  {starProducts.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '6px 8px', fontSize: 11 }}>{r.msku}</td>
                      <td style={{ padding: '6px 8px', fontSize: 12, textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>%{fmtDec(r.cvr || 0)}</td>
                      <td style={{ padding: '6px 8px', fontSize: 12, textAlign: 'right' }}>{fmtNum(r.sessions || 0)}</td>
                      <td style={{ padding: '6px 8px', fontSize: 12, textAlign: 'right' }}>{fmtNum(r.current_stock || 0)}</td>
                      <td style={{ padding: '6px 8px', fontSize: 12, textAlign: 'right' }}>{fmtCur(r.revenue || 0)}</td>
                    </tr>
                  ))}
                  {starProducts.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>Yildiz urun bulunamadi</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* FILTER BAR */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'out', 'critical', 'warning', 'healthy', 'overstock', 'dead', 'inactive'] as StockStatus[]).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '5px 12px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
              border: statusFilter === s ? '1px solid #6366f1' : '1px solid var(--border-color)',
              background: statusFilter === s ? 'rgba(99,102,241,0.15)' : 'transparent',
              color: statusFilter === s ? '#6366f1' : 'var(--text-secondary)',
              fontWeight: statusFilter === s ? 600 : 400,
            }}
          >
            {s === 'all' ? `Tumu (${data.length})` : `${STATUS_CONFIG[s]?.label || s} (${statusCounts[s] || 0})`}
          </button>
        ))}
        <input
          type="text"
          placeholder="SKU veya urun ara..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            marginLeft: 'auto', padding: '6px 12px', fontSize: 12, borderRadius: 8,
            background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
            outline: 'none', width: 200,
          }}
        />
        <select
          value={`${sortKey}-${sortDir}`}
          onChange={e => {
            const [k, d] = e.target.value.split('-')
            setSortKey(k as SortKey)
            setSortDir(d as SortDir)
          }}
          style={{
            padding: '6px 12px', fontSize: 12, borderRadius: 8,
            background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
            cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="daily_revenue_loss-desc">Kayip (Azalan)</option>
          <option value="current_stock-asc">Stok (Artan)</option>
          <option value="current_stock-desc">Stok (Azalan)</option>
          <option value="avg_daily_sales-desc">Gunluk Satis (Azalan)</option>
          <option value="days_of_stock-asc">Kalan Gun (Artan)</option>
          <option value="cvr-desc">CVR (Azalan)</option>
          <option value="sales_30d-desc">30g Satis (Azalan)</option>
        </select>
      </div>

      {/* MAIN TABLE */}
      <div className="table-container" style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1100 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={thStyle}>Durum</th>
                <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => handleSort('msku')}>SKU{sortIndicator('msku')}</th>
                <th style={thStyle}>Urun Adi</th>
                <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('current_stock')}>Stok{sortIndicator('current_stock')}</th>
                <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('inbound_total')}>Yoldaki{sortIndicator('inbound_total')}</th>
                <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('avg_daily_sales')}>G.Satis{sortIndicator('avg_daily_sales')}</th>
                <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('sales_30d')}>30g{sortIndicator('sales_30d')}</th>
                <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('sales_year')}>Yillik{sortIndicator('sales_year')}</th>
                <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('sessions')}>Oturum{sortIndicator('sessions')}</th>
                <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('cvr')}>CVR{sortIndicator('cvr')}</th>
                <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('buy_box_pct')}>BuyBox{sortIndicator('buy_box_pct')}</th>
                <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('days_of_stock')}>Gun{sortIndicator('days_of_stock')}</th>
                <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('daily_revenue_loss')}>Kayip/gun{sortIndicator('daily_revenue_loss')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.slice(0, 100).map((row, i) => (
                <tr
                  key={i}
                  onClick={() => setSelectedRow(selectedRow?.msku === row.msku ? null : row)}
                  style={{
                    borderBottom: '1px solid var(--border-color)', cursor: 'pointer',
                    background: selectedRow?.msku === row.msku ? 'var(--bg-elevated)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <td style={{ padding: '6px 8px' }}>{getStatusBadge(row.stock_status)}</td>
                  <td style={{ padding: '6px 8px', fontSize: 11, fontWeight: 500 }}>{row.msku}</td>
                  <td style={{ padding: '6px 8px', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(row.product_name || '').substring(0, 40)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500 }}>{fmtNum(row.current_stock || 0)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: (row.inbound_total || 0) > 0 ? '#6366f1' : 'var(--text-secondary)' }}>{fmtNum(row.inbound_total || 0)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtDec(row.avg_daily_sales || 0)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtNum(row.sales_30d || 0)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtNum(row.sales_year || 0)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtNum(row.sessions || 0)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: getCvrColor(row.cvr || 0), fontWeight: 600 }}>%{fmtDec(row.cvr || 0)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>%{fmtDec(row.buy_box_pct || 0)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: (row.days_of_stock || 0) < 7 ? '#ef4444' : (row.days_of_stock || 0) < 14 ? '#f59e0b' : 'var(--text-primary)', fontWeight: 500 }}>{fmtDec(row.days_of_stock || 0, 0)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: (row.daily_revenue_loss || 0) > 0 ? '#ef4444' : 'var(--text-secondary)', fontWeight: (row.daily_revenue_loss || 0) > 0 ? 600 : 400 }}>{(row.daily_revenue_loss || 0) > 0 ? fmtCur(row.daily_revenue_loss) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredData.length > 100 && (
          <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)' }}>
            {filteredData.length} urunden ilk 100 gosteriliyor
          </div>
        )}
      </div>

      {/* DETAIL PANEL */}
      {selectedRow && (
        <div style={{ ...cardStyle, marginTop: 14, opacity: 0, animation: 'fadeInUp 0.4s ease-out forwards' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{selectedRow.msku}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{(selectedRow.product_name || '').substring(0, 60)}</div>
            </div>
            {getStatusBadge(selectedRow.stock_status)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Mevcut Stok', value: fmtNum(selectedRow.current_stock || 0) },
              { label: 'Yoldaki', value: fmtNum(selectedRow.inbound_total || 0) },
              { label: 'G. Satis', value: fmtDec(selectedRow.avg_daily_sales || 0) },
              { label: 'Fiyat', value: fmtCur(selectedRow.price || 0) },
              { label: 'CVR', value: `%${fmtDec(selectedRow.cvr || 0)}` },
              { label: 'Depolama', value: fmtCur(selectedRow.storage_fee_monthly || 0) },
              { label: 'Iade', value: `%${fmtDec(selectedRow.refund_rate || 0)}` },
            ].map((m, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
                <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: 'var(--ai-gradient)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
            <AIIcon size={16} />
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {getDetailMessage(selectedRow)}
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}
