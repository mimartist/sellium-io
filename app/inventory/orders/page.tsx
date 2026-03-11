'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import DashboardShell from '../../components/DashboardShell'
import Sidebar from '../../components/Sidebar'
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
  product_name: string
  price: number
  current_stock: number
  inbound_total: number
  avg_daily_sales: number
  days_of_stock: number
  stock_status: string
  daily_revenue_loss: number
  sales_30d: number
  parent_asin: string
  storage_fee_monthly: number
}

interface OrderRow extends StockRow {
  selected: boolean
  growthSales: number
  targetStock: number
  orderQty: number
  estimatedCost: number
  estimatedRevenue: number
  deadline: string
  priority: 'acil' | 'yuksek' | 'normal' | 'dusuk'
}

function extractSize(sku: string): string {
  if (!sku) return 'Diger'
  const upper = sku.toUpperCase()
  if (upper.endsWith('XXXL')) return 'XXXL'
  if (upper.endsWith('XXL')) return 'XXL'
  if (upper.endsWith('XL')) return 'XL'
  if (upper.endsWith('XS')) return 'XS'
  if (upper.endsWith('S')) return 'S'
  if (upper.endsWith('M')) return 'M'
  if (upper.endsWith('L')) return 'L'
  return 'Diger'
}

const PRODUCT_KEYWORDS = ['Slip', 'Tanga', 'Brazilian', 'Top', 'Boxershorts', 'Hipster', 'Soft Bra', 'Bra', 'Brief', 'Panty']

function extractProductGroup(row: StockRow): string {
  if (row.product_name) {
    for (const kw of PRODUCT_KEYWORDS) {
      if (row.product_name.toLowerCase().includes(kw.toLowerCase())) return kw
    }
  }
  return row.msku.substring(0, 7)
}

const TURKISH_MONTHS_LONG: Record<number, string> = {
  0: 'Ocak', 1: 'Subat', 2: 'Mart', 3: 'Nisan', 4: 'Mayis', 5: 'Haziran',
  6: 'Temmuz', 7: 'Agustos', 8: 'Eylul', 9: 'Ekim', 10: 'Kasim', 11: 'Aralik',
}

function formatTurkishDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getDate()} ${TURKISH_MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`
}

const fmtNum = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 0 })
const fmtCur = (v: number) => `€${v.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`
const fmtDec = (v: number, d = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  acil: { label: 'Acil', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  yuksek: { label: 'Yuksek', color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  normal: { label: 'Normal', color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
  dusuk: { label: 'Dusuk', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
}

type PageTab = 'order' | 'melt'

export default function OrderPlanningPage() {
  const [rawData, setRawData] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<PageTab>('order')

  // Slider parameters
  const [leadTime, setLeadTime] = useState(45)
  const [safetyBuffer, setSafetyBuffer] = useState(30)
  const [growthRate, setGrowthRate] = useState(15)

  // Selections
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)

  // Melt tab selections
  const [meltSelectedItems, setMeltSelectedItems] = useState<Set<string>>(new Set())
  const [meltSelectAll, setMeltSelectAll] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data } = await supabase
        .from('v_stock_analysis')
        .select('msku, asin, product_name, price, current_stock, inbound_total, avg_daily_sales, days_of_stock, stock_status, daily_revenue_loss, sales_30d, parent_asin, storage_fee_monthly')
      setRawData(data || [])
      setLoading(false)
    }
    fetchData()
  }, [])

  // ===== ORDER PLAN TAB =====
  const orderRows: OrderRow[] = useMemo(() => {
    const growthMultiplier = 1 + growthRate / 100
    return rawData
      .filter(r => (r.avg_daily_sales || 0) > 0)
      .map(r => {
        const growthSales = (r.avg_daily_sales || 0) * growthMultiplier
        const targetStock = growthSales * (leadTime + safetyBuffer)
        const currentAvailable = (r.current_stock || 0) + (r.inbound_total || 0)
        const orderQty = Math.max(0, Math.ceil(targetStock - currentAvailable))
        const estimatedCost = orderQty * (r.price || 0) * 0.23
        const estimatedRevenue = orderQty * (r.price || 0)
        const daysLeft = r.days_of_stock || 0
        const deadlineDate = new Date()
        deadlineDate.setDate(deadlineDate.getDate() + Math.max(0, Math.floor(daysLeft) - leadTime))
        const deadline = deadlineDate.toISOString().substring(0, 10)
        let priority: 'acil' | 'yuksek' | 'normal' | 'dusuk' = 'normal'
        if (r.stock_status === 'out' || daysLeft < 7) priority = 'acil'
        else if (r.stock_status === 'critical' || daysLeft < 14) priority = 'yuksek'
        else if (daysLeft > 90) priority = 'dusuk'
        return { ...r, selected: selectedItems.has(r.msku), growthSales, targetStock, orderQty, estimatedCost, estimatedRevenue, deadline, priority }
      })
      .filter(r => r.orderQty > 0)
      .sort((a, b) => {
        const priorityOrder = { acil: 0, yuksek: 1, normal: 2, dusuk: 3 }
        return priorityOrder[a.priority] - priorityOrder[b.priority]
      })
  }, [rawData, leadTime, safetyBuffer, growthRate, selectedItems])

  const selectedRows = useMemo(() => orderRows.filter(r => selectedItems.has(r.msku)), [orderRows, selectedItems])
  const summaryRows = selectedRows.length > 0 ? selectedRows : orderRows
  const totalOrderQty = summaryRows.reduce((s, r) => s + r.orderQty, 0)
  const totalCost = summaryRows.reduce((s, r) => s + r.estimatedCost, 0)
  const totalRevenue = summaryRows.reduce((s, r) => s + r.estimatedRevenue, 0)
  const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0

  // Product group distribution — use product group name instead of ASIN
  const groupDistribution = useMemo(() => {
    const groups: Record<string, { name: string; qty: number; cost: number }> = {}
    summaryRows.forEach(r => {
      const group = extractProductGroup(r)
      if (!groups[group]) groups[group] = { name: group, qty: 0, cost: 0 }
      groups[group].qty += r.orderQty
      groups[group].cost += r.estimatedCost
    })
    return Object.values(groups).sort((a, b) => b.qty - a.qty).slice(0, 10)
  }, [summaryRows])

  const toggleItem = useCallback((msku: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(msku)) next.delete(msku); else next.add(msku)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectAll) setSelectedItems(new Set())
    else setSelectedItems(new Set(orderRows.map(r => r.msku)))
    setSelectAll(!selectAll)
  }, [selectAll, orderRows])

  // CSV Export — Order tab
  const exportOrderCSV = useCallback(() => {
    const BOM = '\uFEFF'
    const headers = ['Oncelik', 'SKU', 'Beden', 'Stok', 'Yoldaki', 'G.Satis', 'Hedef Stok', 'Siparis Adet', 'Maliyet', 'Gelir', 'Son Tarih']
    const rows = (selectedRows.length > 0 ? selectedRows : orderRows).map(r => [
      PRIORITY_CONFIG[r.priority]?.label || r.priority, r.msku, extractSize(r.msku),
      r.current_stock || 0, r.inbound_total || 0, fmtDec(r.avg_daily_sales || 0),
      Math.ceil(r.targetStock), r.orderQty, fmtDec(r.estimatedCost, 0), fmtDec(r.estimatedRevenue, 0), r.deadline,
    ])
    const csv = BOM + [headers, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `siparis_plani_${new Date().toISOString().substring(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }, [selectedRows, orderRows])

  // ===== MELT PLAN TAB =====
  const meltRows = useMemo(() => {
    return rawData
      .filter(r => r.stock_status === 'overstock' || r.stock_status === 'dead')
      .map(r => {
        const dailySales = r.avg_daily_sales || 0
        const daysOfStock = r.days_of_stock || (dailySales > 0 ? (r.current_stock || 0) / dailySales : 9999)
        let action = ''
        let actionColor = ''
        let actionBg = ''
        let discountRate = 0

        if (dailySales === 0 || r.stock_status === 'dead') {
          action = "FBA'dan Geri Cek"
          actionColor = '#ef4444'
          actionBg = 'rgba(239,68,68,0.1)'
          discountRate = 0
        } else if (daysOfStock > 365) {
          action = '%30-50 Indirim Kampanyasi'
          actionColor = '#f97316'
          actionBg = 'rgba(249,115,22,0.1)'
          discountRate = 0.4
        } else if (daysOfStock > 180) {
          action = '%20-30 Indirim'
          actionColor = '#f59e0b'
          actionBg = 'rgba(245,158,11,0.1)'
          discountRate = 0.25
        } else {
          action = 'Reklam Butcesi Artir'
          actionColor = '#6366f1'
          actionBg = 'rgba(99,102,241,0.1)'
          discountRate = 0
        }

        const discountedPrice = (r.price || 0) * (1 - discountRate)
        const estimatedImpact = discountRate > 0 ? discountedPrice * (r.current_stock || 0) : 0

        return {
          ...r,
          daysOfStock,
          action,
          actionColor,
          actionBg,
          discountRate,
          estimatedImpact,
          storageFee: r.storage_fee_monthly || 0,
        }
      })
      .sort((a, b) => {
        if (a.stock_status === 'dead' && b.stock_status !== 'dead') return -1
        if (a.stock_status !== 'dead' && b.stock_status === 'dead') return 1
        return (b.storageFee) - (a.storageFee)
      })
  }, [rawData])

  // Melt KPIs
  const meltOverstockCount = useMemo(() => meltRows.filter(r => r.stock_status === 'overstock').reduce((s, r) => s + (r.current_stock || 0), 0), [meltRows])
  const meltDeadCount = useMemo(() => meltRows.filter(r => r.stock_status === 'dead').reduce((s, r) => s + (r.current_stock || 0), 0), [meltRows])
  const meltMonthlyStorage = useMemo(() => meltRows.reduce((s, r) => s + r.storageFee, 0), [meltRows])
  const meltAvgDays = useMemo(() => {
    const withSales = meltRows.filter(r => (r.avg_daily_sales || 0) > 0)
    if (withSales.length === 0) return 0
    return withSales.reduce((s, r) => s + r.daysOfStock, 0) / withSales.length
  }, [meltRows])

  // Melt summary
  const meltSummary = useMemo(() => {
    const deadRows = meltRows.filter(r => r.stock_status === 'dead')
    const deadStorage = deadRows.reduce((s, r) => s + r.storageFee, 0)
    const overstockRows = meltRows.filter(r => r.stock_status === 'overstock' && r.discountRate > 0)
    const overstockRevenue = overstockRows.reduce((s, r) => s + r.estimatedImpact, 0)
    return { deadCount: deadRows.length, deadStorage, overstockCount: overstockRows.length, overstockRevenue }
  }, [meltRows])

  const toggleMeltItem = useCallback((msku: string) => {
    setMeltSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(msku)) next.delete(msku); else next.add(msku)
      return next
    })
  }, [])

  const handleMeltSelectAll = useCallback(() => {
    if (meltSelectAll) setMeltSelectedItems(new Set())
    else setMeltSelectedItems(new Set(meltRows.map(r => r.msku)))
    setMeltSelectAll(!meltSelectAll)
  }, [meltSelectAll, meltRows])

  // CSV Export — Melt tab
  const exportMeltCSV = useCallback(() => {
    const BOM = '\uFEFF'
    const headers = ['SKU', 'Beden', 'Durum', 'Stok', 'Gunluk Satis', 'Kalan Gun', 'Aylik Depolama', 'Onerilen Aksiyon', 'Tahmini Etki']
    const exportRows = (meltSelectedItems.size > 0 ? meltRows.filter(r => meltSelectedItems.has(r.msku)) : meltRows)
    const rows = exportRows.map(r => [
      r.msku, extractSize(r.msku), r.stock_status === 'dead' ? 'Olu Stok' : 'Fazla Stok',
      r.current_stock || 0, fmtDec(r.avg_daily_sales || 0), r.daysOfStock > 9000 ? '-' : fmtDec(r.daysOfStock, 0),
      fmtDec(r.storageFee, 0), r.action, r.estimatedImpact > 0 ? fmtDec(r.estimatedImpact, 0) : '-',
    ])
    const csv = BOM + [headers, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `stok_eritme_plani_${new Date().toISOString().substring(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }, [meltSelectedItems, meltRows])

  // Styles
  const cardStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20 }
  const tooltipStyle = { contentStyle: { background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)' }, labelStyle: { color: 'var(--text-secondary)' } }
  const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }
  const tdStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 12 }
  const sliderTrackStyle: React.CSSProperties = { width: '100%', height: 6, appearance: 'none' as any, borderRadius: 4, outline: 'none', cursor: 'pointer' }

  const sidebarContent = <Sidebar />

  if (loading) {
    return (
      <DashboardShell sidebar={sidebarContent}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: '3px solid var(--border-color)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Siparis verileri hesaplaniyor...</div>
          </div>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell sidebar={sidebarContent}>
      {/* HEADER */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Siparis Planlama</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, margin: 0 }}>
            Stok analizi bazli otomatik siparis ve eritme plani · {rawData.length} SKU
          </p>
        </div>
        <button
          onClick={activeTab === 'order' ? exportOrderCSV : exportMeltCSV}
          style={{
            padding: '8px 16px', fontSize: 12, fontWeight: 600, borderRadius: 8,
            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
            color: '#6366f1', cursor: 'pointer',
          }}
        >
          CSV Indir
        </button>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-color)', marginBottom: 20 }}>
        {([
          { key: 'order' as PageTab, label: 'Siparis Plani', count: orderRows.length },
          { key: 'melt' as PageTab, label: 'Stok Eritme Plani', count: meltRows.length },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 20px', fontSize: 13, fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? '#6366f1' : 'var(--text-secondary)',
              borderBottom: activeTab === tab.key ? '2px solid #6366f1' : '2px solid transparent',
              background: 'transparent', border: 'none', cursor: 'pointer',
            }}
          >
            {tab.label} <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 4 }}>({tab.count})</span>
          </button>
        ))}
      </div>

      {/* ===== ORDER PLAN TAB ===== */}
      {activeTab === 'order' && (
        <>
          {/* SLIDERS */}
          <div style={{ ...cardStyle, marginBottom: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out forwards' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Parametreler</div>
            <div className="inv-slider-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Lead Time (Teslimat Suresi)</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#6366f1' }}>{leadTime} gun</span>
                </div>
                <input type="range" min={15} max={120} value={leadTime} onChange={e => setLeadTime(Number(e.target.value))}
                  style={{ ...sliderTrackStyle, background: `linear-gradient(to right, #6366f1 ${((leadTime - 15) / 105) * 100}%, var(--bg-elevated) ${((leadTime - 15) / 105) * 100}%)` }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  <span>15 gun</span><span>120 gun</span>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Guvenlik Tamponu</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b' }}>{safetyBuffer} gun</span>
                </div>
                <input type="range" min={0} max={90} value={safetyBuffer} onChange={e => setSafetyBuffer(Number(e.target.value))}
                  style={{ ...sliderTrackStyle, background: `linear-gradient(to right, #f59e0b ${(safetyBuffer / 90) * 100}%, var(--bg-elevated) ${(safetyBuffer / 90) * 100}%)` }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  <span>0 gun</span><span>90 gun</span>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Buyume Tahmini</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#22c55e' }}>%{growthRate}</span>
                </div>
                <input type="range" min={0} max={50} value={growthRate} onChange={e => setGrowthRate(Number(e.target.value))}
                  style={{ ...sliderTrackStyle, background: `linear-gradient(to right, #22c55e ${(growthRate / 50) * 100}%, var(--bg-elevated) ${(growthRate / 50) * 100}%)` }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  <span>%0</span><span>%50</span>
                </div>
              </div>
            </div>
          </div>

          {/* SUMMARY CARDS */}
          <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'SECILI URUN', value: selectedRows.length > 0 ? `${selectedRows.length}` : `${orderRows.length} (Tumu)`, color: '#6366f1' },
              { label: 'TOPLAM SIPARIS', value: fmtNum(totalOrderQty) + ' adet', color: '#a78bfa' },
              { label: 'TAHMINI MALIYET', value: fmtCur(totalCost), color: '#f59e0b' },
              { label: 'BEKLENEN GELIR', value: fmtCur(totalRevenue), color: '#22c55e' },
            ].map((kpi, i) => (
              <div key={i} style={{ ...cardStyle, padding: '14px 16px', position: 'relative', overflow: 'hidden', opacity: 0, animation: `fadeInUp 0.6s ease-out ${0.1 + i * 0.08}s forwards` }}>
                <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: kpi.color, opacity: 0.08 }} />
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, marginBottom: 6 }}>{kpi.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* GROUP DISTRIBUTION + TIMELINE */}
          <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.4s forwards' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Urun Grubu Dagilimi</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>Siparis adedine gore ilk 10 grup</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={groupDistribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis type="number" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 9 }} axisLine={false} tickLine={false} width={80} tickFormatter={v => v.length > 12 ? v.substring(0, 12) + '..' : v} />
                  <Tooltip {...tooltipStyle} formatter={(value: any) => [fmtNum(Number(value)), 'Adet']} />
                  <Bar dataKey="qty" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ROI & Timeline */}
            <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.45s forwards' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>ROI & Zaman Cizelgesi</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-elevated)', borderRadius: 8 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Yatirim</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#f59e0b' }}>{fmtCur(totalCost)}</div>
                </div>
                <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-elevated)', borderRadius: 8 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Beklenen Gelir</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#22c55e' }}>{fmtCur(totalRevenue)}</div>
                </div>
                <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-elevated)', borderRadius: 8 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Tahmini ROI</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: roi > 100 ? '#22c55e' : '#f59e0b' }}>%{fmtDec(roi, 0)}</div>
                </div>
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Zaman Cizelgesi</div>
              <div style={{ position: 'relative', paddingLeft: 20 }}>
                {[
                  { label: 'Siparis Verildi', date: new Date().toISOString().substring(0, 10), color: '#6366f1' },
                  { label: 'Uretim Tamamlandi', date: (() => { const d = new Date(); d.setDate(d.getDate() + Math.floor(leadTime * 0.4)); return d.toISOString().substring(0, 10) })(), color: '#f59e0b' },
                  { label: 'Sevkiyat Basladi', date: (() => { const d = new Date(); d.setDate(d.getDate() + Math.floor(leadTime * 0.6)); return d.toISOString().substring(0, 10) })(), color: '#a78bfa' },
                  { label: 'FBA Teslim', date: (() => { const d = new Date(); d.setDate(d.getDate() + leadTime); return d.toISOString().substring(0, 10) })(), color: '#22c55e' },
                ].map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: -20, width: 10, height: 10, borderRadius: '50%', background: step.color, border: '2px solid var(--bg-card)' }} />
                    {i < 3 && <div style={{ position: 'absolute', left: -16, top: 14, width: 2, height: 24, background: 'var(--border-color)' }} />}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{step.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{formatTurkishDate(step.date)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ORDER TABLE */}
          <div className="table-container" style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1000 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ ...thStyle, width: 40 }}>
                      <input type="checkbox" checked={selectAll} onChange={handleSelectAll} style={{ cursor: 'pointer', width: 14, height: 14 }} />
                    </th>
                    <th style={thStyle}>Oncelik</th>
                    <th style={thStyle}>SKU</th>
                    <th style={thStyle}>Beden</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Stok</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Yoldaki</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>G.Satis</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Hedef Stok</th>
                    <th style={{ ...thStyle, textAlign: 'right', fontWeight: 700 }}>SIPARIS</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Maliyet</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Gelir</th>
                    <th style={thStyle}>Son Tarih</th>
                  </tr>
                </thead>
                <tbody>
                  {orderRows.slice(0, 100).map((row, i) => {
                    const prCfg = PRIORITY_CONFIG[row.priority] || PRIORITY_CONFIG.normal
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', background: selectedItems.has(row.msku) ? 'var(--bg-elevated)' : 'transparent', transition: 'background 0.15s' }}>
                        <td style={tdStyle}>
                          <input type="checkbox" checked={selectedItems.has(row.msku)} onChange={() => toggleItem(row.msku)} style={{ cursor: 'pointer', width: 14, height: 14 }} />
                        </td>
                        <td style={tdStyle}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, color: prCfg.color, background: prCfg.bg }}>{prCfg.label}</span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: 11, fontWeight: 500 }}>{row.msku}</td>
                        <td style={{ ...tdStyle, fontSize: 12, color: 'var(--text-secondary)' }}>{extractSize(row.msku)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(row.current_stock || 0)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: (row.inbound_total || 0) > 0 ? '#6366f1' : 'var(--text-secondary)' }}>{fmtNum(row.inbound_total || 0)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtDec(row.avg_daily_sales || 0)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtNum(Math.ceil(row.targetStock))}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#6366f1' }}>{fmtNum(row.orderQty)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtCur(row.estimatedCost)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: '#22c55e' }}>{fmtCur(row.estimatedRevenue)}</td>
                        <td style={{ ...tdStyle, fontSize: 11, color: row.priority === 'acil' ? '#ef4444' : 'var(--text-secondary)' }}>{formatTurkishDate(row.deadline)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {orderRows.length > 100 && (
              <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)' }}>
                {orderRows.length} urunden ilk 100 gosteriliyor
              </div>
            )}
          </div>
        </>
      )}

      {/* ===== MELT PLAN TAB ===== */}
      {activeTab === 'melt' && (
        <>
          {/* MELT KPIs */}
          <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'TOPLAM FAZLA STOK', value: fmtNum(meltOverstockCount) + ' adet', color: '#6366f1' },
              { label: 'OLU STOK ADEDI', value: fmtNum(meltDeadCount) + ' adet', color: '#ef4444' },
              { label: 'AYLIK DEPOLAMA MALIYETI', value: fmtCur(meltMonthlyStorage), color: '#f59e0b' },
              { label: 'TAHMINI ERITME SURESI', value: meltAvgDays > 0 ? `${fmtNum(Math.round(meltAvgDays))} gun` : '-', color: '#a78bfa' },
            ].map((kpi, i) => (
              <div key={i} style={{ ...cardStyle, padding: '14px 16px', position: 'relative', overflow: 'hidden', opacity: 0, animation: `fadeInUp 0.6s ease-out ${0.1 + i * 0.08}s forwards` }}>
                <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: kpi.color, opacity: 0.08 }} />
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, marginBottom: 6 }}>{kpi.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* MELT TABLE */}
          <div className="table-container" style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1000 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ ...thStyle, width: 40 }}>
                      <input type="checkbox" checked={meltSelectAll} onChange={handleMeltSelectAll} style={{ cursor: 'pointer', width: 14, height: 14 }} />
                    </th>
                    <th style={thStyle}>SKU</th>
                    <th style={thStyle}>Beden</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Stok</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>G. Satis</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Kalan Gun</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Aylik Depolama</th>
                    <th style={thStyle}>Onerilen Aksiyon</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Tahmini Etki</th>
                  </tr>
                </thead>
                <tbody>
                  {meltRows.slice(0, 100).map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', background: meltSelectedItems.has(row.msku) ? 'var(--bg-elevated)' : 'transparent', transition: 'background 0.15s' }}>
                      <td style={tdStyle}>
                        <input type="checkbox" checked={meltSelectedItems.has(row.msku)} onChange={() => toggleMeltItem(row.msku)} style={{ cursor: 'pointer', width: 14, height: 14 }} />
                      </td>
                      <td style={{ ...tdStyle, fontSize: 11, fontWeight: 500 }}>{row.msku}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{extractSize(row.msku)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>{fmtNum(row.current_stock || 0)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtDec(row.avg_daily_sales || 0)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: row.daysOfStock > 365 ? '#ef4444' : row.daysOfStock > 180 ? '#f59e0b' : 'var(--text-primary)' }}>
                        {row.daysOfStock > 9000 ? '-' : fmtNum(Math.round(row.daysOfStock))}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtCur(row.storageFee)}</td>
                      <td style={tdStyle}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, color: row.actionColor, background: row.actionBg, whiteSpace: 'nowrap' }}>
                          {row.action}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: row.estimatedImpact > 0 ? '#22c55e' : 'var(--text-secondary)', fontWeight: row.estimatedImpact > 0 ? 600 : 400 }}>
                        {row.estimatedImpact > 0 ? fmtCur(row.estimatedImpact) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {meltRows.length > 100 && (
              <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)' }}>
                {meltRows.length} urunden ilk 100 gosteriliyor
              </div>
            )}
          </div>

          {/* MELT SUMMARY PANEL */}
          <div style={{ ...cardStyle, background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Ozet & Tavsiyeler</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {meltSummary.deadCount > 0 && (
                <div style={{ flex: 1, minWidth: 250, padding: 14, background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-color)', borderLeft: '3px solid #ef4444' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#ef4444' }}>Olu Stok Aksiyonu</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {meltSummary.deadCount} adet olu stok FBA&apos;dan geri cekilirse aylik <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmtCur(meltSummary.deadStorage)}</span> depolama tasarrufu saglanir.
                  </div>
                </div>
              )}
              {meltSummary.overstockCount > 0 && (
                <div style={{ flex: 1, minWidth: 250, padding: 14, background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-color)', borderLeft: '3px solid #f59e0b' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#f59e0b' }}>Fazla Stok Aksiyonu</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {meltSummary.overstockCount} adet fazla stoka indirim uygulanirsa tahmini <span style={{ fontWeight: 600, color: '#22c55e' }}>{fmtCur(meltSummary.overstockRevenue)}</span> gelir elde edilebilir.
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </DashboardShell>
  )
}
