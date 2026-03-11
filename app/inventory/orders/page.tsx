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

function extractSize(msku: string): string {
  if (!msku) return 'Diger'
  const last = msku.split('-').pop()?.toUpperCase() || ''
  const sizeMap: Record<string, string> = {
    'XS': 'XS', 'S': 'S', 'M': 'M', 'L': 'L', 'XL': 'XL', 'XXL': 'XXL',
    '2XL': 'XXL', '3XL': '3XL', '4XL': '4XL', '5XL': '5XL',
  }
  return sizeMap[last] || 'Diger'
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

export default function OrderPlanningPage() {
  const [rawData, setRawData] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)

  // Slider parameters
  const [leadTime, setLeadTime] = useState(45)
  const [safetyBuffer, setSafetyBuffer] = useState(30)
  const [growthRate, setGrowthRate] = useState(15)

  // Selections
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data } = await supabase
        .from('v_stock_analysis')
        .select('msku, asin, product_name, price, current_stock, inbound_total, avg_daily_sales, days_of_stock, stock_status, daily_revenue_loss, sales_30d, parent_asin')
      setRawData(data || [])
      setLoading(false)
    }
    fetchData()
  }, [])

  // Calculate order quantities
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

        // Deadline calculation
        const daysLeft = r.days_of_stock || 0
        const deadlineDate = new Date()
        deadlineDate.setDate(deadlineDate.getDate() + Math.max(0, Math.floor(daysLeft) - leadTime))
        const deadline = deadlineDate.toISOString().substring(0, 10)

        // Priority
        let priority: 'acil' | 'yuksek' | 'normal' | 'dusuk' = 'normal'
        if (r.stock_status === 'out' || daysLeft < 7) priority = 'acil'
        else if (r.stock_status === 'critical' || daysLeft < 14) priority = 'yuksek'
        else if (daysLeft > 90) priority = 'dusuk'

        return {
          ...r,
          selected: selectedItems.has(r.msku),
          growthSales,
          targetStock,
          orderQty,
          estimatedCost,
          estimatedRevenue,
          deadline,
          priority,
        }
      })
      .filter(r => r.orderQty > 0)
      .sort((a, b) => {
        const priorityOrder = { acil: 0, yuksek: 1, normal: 2, dusuk: 3 }
        return priorityOrder[a.priority] - priorityOrder[b.priority]
      })
  }, [rawData, leadTime, safetyBuffer, growthRate, selectedItems])

  // Summary stats
  const selectedRows = useMemo(() => orderRows.filter(r => selectedItems.has(r.msku)), [orderRows, selectedItems])
  const summaryRows = selectedRows.length > 0 ? selectedRows : orderRows
  const totalOrderQty = summaryRows.reduce((s, r) => s + r.orderQty, 0)
  const totalCost = summaryRows.reduce((s, r) => s + r.estimatedCost, 0)
  const totalRevenue = summaryRows.reduce((s, r) => s + r.estimatedRevenue, 0)
  const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0

  // Product group distribution chart
  const groupDistribution = useMemo(() => {
    const groups: Record<string, { name: string; qty: number; cost: number }> = {}
    summaryRows.forEach(r => {
      const group = r.parent_asin || r.msku.split('-').slice(0, 2).join('-')
      if (!groups[group]) groups[group] = { name: group, qty: 0, cost: 0 }
      groups[group].qty += r.orderQty
      groups[group].cost += r.estimatedCost
    })
    return Object.values(groups)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)
  }, [summaryRows])

  // Toggle selection
  const toggleItem = useCallback((msku: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(msku)) next.delete(msku)
      else next.add(msku)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectAll) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(orderRows.map(r => r.msku)))
    }
    setSelectAll(!selectAll)
  }, [selectAll, orderRows])

  // CSV Export
  const exportCSV = useCallback(() => {
    const BOM = '\uFEFF'
    const headers = ['Oncelik', 'SKU', 'Beden', 'Stok', 'Yoldaki', 'G.Satis', 'Hedef Stok', 'Siparis Adet', 'Maliyet', 'Gelir', 'Son Tarih']
    const rows = (selectedRows.length > 0 ? selectedRows : orderRows).map(r => [
      PRIORITY_CONFIG[r.priority]?.label || r.priority,
      r.msku,
      extractSize(r.msku),
      r.current_stock || 0,
      r.inbound_total || 0,
      fmtDec(r.avg_daily_sales || 0),
      Math.ceil(r.targetStock),
      r.orderQty,
      fmtDec(r.estimatedCost, 0),
      fmtDec(r.estimatedRevenue, 0),
      r.deadline,
    ])
    const csv = BOM + [headers, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `siparis_plani_${new Date().toISOString().substring(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [selectedRows, orderRows])

  // Styles
  const cardStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20 }
  const tooltipStyle = { contentStyle: { background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)' }, labelStyle: { color: 'var(--text-secondary)' } }
  const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 8px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }

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
            Stok analizi bazli otomatik siparis hesaplama · {orderRows.length} urun
          </p>
        </div>
        <button
          onClick={exportCSV}
          style={{
            padding: '8px 16px', fontSize: 12, fontWeight: 600, borderRadius: 8,
            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
            color: '#6366f1', cursor: 'pointer',
          }}
        >
          CSV Indir
        </button>
      </div>

      {/* SLIDERS */}
      <div style={{ ...cardStyle, marginBottom: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out forwards' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Parametreler</div>
        <div className="inv-slider-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {/* Lead Time */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Lead Time (Teslimat Suresi)</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#6366f1' }}>{leadTime} gun</span>
            </div>
            <input
              type="range" min={15} max={120} value={leadTime}
              onChange={e => setLeadTime(Number(e.target.value))}
              style={{ ...sliderTrackStyle, background: `linear-gradient(to right, #6366f1 ${((leadTime - 15) / 105) * 100}%, var(--bg-elevated) ${((leadTime - 15) / 105) * 100}%)` }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              <span>15 gun</span><span>120 gun</span>
            </div>
          </div>

          {/* Safety Buffer */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Guvenlik Tamponu</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b' }}>{safetyBuffer} gun</span>
            </div>
            <input
              type="range" min={0} max={90} value={safetyBuffer}
              onChange={e => setSafetyBuffer(Number(e.target.value))}
              style={{ ...sliderTrackStyle, background: `linear-gradient(to right, #f59e0b ${(safetyBuffer / 90) * 100}%, var(--bg-elevated) ${(safetyBuffer / 90) * 100}%)` }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              <span>0 gun</span><span>90 gun</span>
            </div>
          </div>

          {/* Growth Rate */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Buyume Tahmini</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#22c55e' }}>%{growthRate}</span>
            </div>
            <input
              type="range" min={0} max={50} value={growthRate}
              onChange={e => setGrowthRate(Number(e.target.value))}
              style={{ ...sliderTrackStyle, background: `linear-gradient(to right, #22c55e ${(growthRate / 50) * 100}%, var(--bg-elevated) ${(growthRate / 50) * 100}%)` }}
            />
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
        {/* Group distribution chart */}
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

          {/* ROI */}
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

          {/* Timeline */}
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
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{step.date}</div>
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
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    style={{ cursor: 'pointer', width: 14, height: 14 }}
                  />
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
                  <tr
                    key={i}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      background: selectedItems.has(row.msku) ? 'var(--bg-elevated)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <td style={{ padding: '6px 8px' }}>
                      <input
                        type="checkbox"
                        checked={selectedItems.has(row.msku)}
                        onChange={() => toggleItem(row.msku)}
                        style={{ cursor: 'pointer', width: 14, height: 14 }}
                      />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, color: prCfg.color, background: prCfg.bg }}>
                        {prCfg.label}
                      </span>
                    </td>
                    <td style={{ padding: '6px 8px', fontSize: 11, fontWeight: 500 }}>{row.msku}</td>
                    <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-secondary)' }}>{extractSize(row.msku)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtNum(row.current_stock || 0)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: (row.inbound_total || 0) > 0 ? '#6366f1' : 'var(--text-secondary)' }}>{fmtNum(row.inbound_total || 0)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtDec(row.avg_daily_sales || 0)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtNum(Math.ceil(row.targetStock))}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#6366f1' }}>{fmtNum(row.orderQty)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtCur(row.estimatedCost)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#22c55e' }}>{fmtCur(row.estimatedRevenue)}</td>
                    <td style={{ padding: '6px 8px', fontSize: 11, color: row.priority === 'acil' ? '#ef4444' : 'var(--text-secondary)' }}>{row.deadline}</td>
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
    </DashboardShell>
  )
}
