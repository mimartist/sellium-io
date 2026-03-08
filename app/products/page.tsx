'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import DashboardShell from '../components/DashboardShell'
import Sidebar from '../components/Sidebar'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MARKETPLACE_OPTIONS = [
  { value: 'all', label: 'T\u00FCm Pazaryerleri' },
  { value: 'Amazon.de', label: 'Amazon.de' },
  { value: 'Amazon.fr', label: 'Amazon.fr' },
  { value: 'Amazon.es', label: 'Amazon.es' },
  { value: 'Amazon.it', label: 'Amazon.it' },
  { value: 'Amazon.co.uk', label: 'Amazon.co.uk' },
  { value: 'Amazon.nl', label: 'Amazon.nl' },
]

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

function getMonthRange(month: string) {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, '0')}` }
}

const n = (v: any) => Number(v) || 0
const fmtNum = (v: number) => `\u20AC${v.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`

interface ProductRow {
  parentAsin: string
  title: string
  skuCount: number
  units: number
  sales: number
  refunds: number
  refundRate: number
  avgPrice: number
}

type SortKey = 'units' | 'sales' | 'refunds' | 'refundRate' | 'avgPrice' | 'skuCount'

async function fetchAll(query: any): Promise<any[]> {
  const PAGE = 1000
  let all: any[] = []
  let offset = 0
  while (true) {
    const { data } = await query.range(offset, offset + PAGE - 1)
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}

export default function ProductsPage() {
  const monthOptions = useMemo(() => generateMonthOptions(), [])
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0])
  const [selectedMarketplace, setSelectedMarketplace] = useState('all')
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('units')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { startDate, endDate } = getMonthRange(selectedMonth)

      let ordersQ = supabase
        .from('all_orders')
        .select('sku, marketplace, quantity, item_price, order_status')
        .gte('purchase_date', startDate)
        .lte('purchase_date', endDate)
      if (selectedMarketplace !== 'all') {
        ordersQ = ordersQ.eq('marketplace', selectedMarketplace)
      }

      const [orders, parentMapRes] = await Promise.all([
        fetchAll(ordersQ),
        supabase.from('parent_asin_map').select('parent_asin, sku, title'),
      ])

      const parentMap = parentMapRes.data || []
      const skuToParent: Record<string, { parentAsin: string; title: string }> = {}
      parentMap.forEach((p: any) => {
        if (p.sku) skuToParent[p.sku] = { parentAsin: p.parent_asin || '', title: p.title || '' }
      })

      // Group by parent ASIN
      const grouped: Record<string, { title: string; skus: Set<string>; units: number; sales: number; refunds: number }> = {}
      orders.forEach((o: any) => {
        const sku = o.sku || ''
        if (!sku) return
        const info = skuToParent[sku] || { parentAsin: sku.substring(0, 7), title: '' }
        const key = info.parentAsin || sku.substring(0, 7)
        if (!grouped[key]) grouped[key] = { title: info.title, skus: new Set(), units: 0, sales: 0, refunds: 0 }
        grouped[key].skus.add(sku)
        if (!grouped[key].title && info.title) grouped[key].title = info.title

        if (o.order_status === 'Shipped') {
          grouped[key].units += n(o.quantity)
          grouped[key].sales += n(o.item_price)
        }
        if (o.order_status === 'Refunded' || o.order_status === 'Return') {
          grouped[key].refunds += n(o.item_price)
        }
      })

      const rows: ProductRow[] = Object.entries(grouped).map(([parentAsin, d]) => ({
        parentAsin,
        title: d.title || parentAsin,
        skuCount: d.skus.size,
        units: d.units,
        sales: d.sales,
        refunds: d.refunds,
        refundRate: d.sales > 0 ? (d.refunds / d.sales) * 100 : 0,
        avgPrice: d.units > 0 ? d.sales / d.units : 0,
      }))

      setProducts(rows)
      setLoading(false)
    }
    fetchData()
  }, [selectedMonth, selectedMarketplace])

  const filtered = useMemo(() => {
    let rows = products
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(r => r.title.toLowerCase().includes(q) || r.parentAsin.toLowerCase().includes(q))
    }
    rows = [...rows].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })
    return rows
  }, [products, search, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }
  const sortIcon = (key: SortKey) => sortKey !== key ? ' \u21C5' : sortDir === 'asc' ? ' \u2191' : ' \u2193'

  const cardStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20 }
  const selectStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }
  const th: React.CSSProperties = { padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 11, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '8px', fontSize: 12 }

  if (loading) {
    return (
      <DashboardShell sidebar={<Sidebar />}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: '3px solid var(--border-color)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Veriler y\u00FCkleniyor...</div>
          </div>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell sidebar={<Sidebar />}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>\u00DCr\u00FCn Performans\u0131</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '3px 0 0' }}>\u00DCr\u00FCn bazl\u0131 sat\u0131\u015F ve iade analizi \u00B7 {selectedMonth}</p>
        </div>
        <div className="header-controls" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={selectStyle}>
            {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={selectedMarketplace} onChange={e => setSelectedMarketplace(e.target.value)} style={selectStyle}>
            {MARKETPLACE_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>TOPLAM \u00DCR\u00DCN</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{products.length}</div>
        </div>
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>TOPLAM SATI\u015E</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#6366f1' }}>{fmtNum(products.reduce((s, r) => s + r.sales, 0))}</div>
        </div>
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>TOPLAM B\u0130R\u0130M</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{products.reduce((s, r) => s + r.units, 0).toLocaleString('de-DE')}</div>
        </div>
        <div style={{ ...cardStyle, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>\u0130ADE TOPLAM</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>{fmtNum(products.reduce((s, r) => s + r.refunds, 0))}</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 14 }}>
        <input
          type="text"
          placeholder="\u00DCr\u00FCn ara..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...selectStyle, width: '100%', maxWidth: 400, padding: '10px 14px' }}
        />
      </div>

      {/* Table */}
      <div style={{ ...cardStyle, padding: 16 }}>
        <div className="pl-table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ ...th, textAlign: 'left', minWidth: 250 }}>\u00DCr\u00FCn</th>
                <th style={th} onClick={() => handleSort('skuCount')}>SKU{sortIcon('skuCount')}</th>
                <th style={th} onClick={() => handleSort('units')}>Adet{sortIcon('units')}</th>
                <th style={th} onClick={() => handleSort('sales')}>Sat\u0131\u015F{sortIcon('sales')}</th>
                <th style={th} onClick={() => handleSort('avgPrice')}>Ort.Fiyat{sortIcon('avgPrice')}</th>
                <th style={th} onClick={() => handleSort('refunds')}>\u0130ade{sortIcon('refunds')}</th>
                <th style={th} onClick={() => handleSort('refundRate')}>\u0130ade%{sortIcon('refundRate')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ ...td, fontWeight: 500 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{row.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{row.parentAsin}</div>
                  </td>
                  <td style={{ ...td, textAlign: 'center', color: 'var(--text-secondary)' }}>{row.skuCount}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 500 }}>{row.units.toLocaleString('de-DE')}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 500 }}>{fmtNum(row.sales)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtNum(row.avgPrice)}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#ef4444' }}>{fmtNum(row.refunds)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: row.refundRate > 10 ? '#ef444420' : row.refundRate > 5 ? '#f59e0b20' : '#22c55e20',
                      color: row.refundRate > 10 ? '#ef4444' : row.refundRate > 5 ? '#f59e0b' : '#22c55e',
                    }}>
                      %{row.refundRate.toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>Veri bulunamad\u0131</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardShell>
  )
}
