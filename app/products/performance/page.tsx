'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import KpiCard from '@/components/ui/KpiCard'
import { KpiIcons } from '@/components/ui/KpiIcons'
import AIInsights, { type Insight } from '@/components/ui/AIInsights'
import ProductCell from '@/components/ui/ProductCell'
import { useProductImages } from '@/hooks/useProductImages'
import { COLORS, CARD_STYLE, SELECT_STYLE, TH_STYLE } from '@/lib/design-tokens'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/* ── Styles ── */
const tdStyle: React.CSSProperties = { padding: '11px 12px', fontSize: 13, color: '#475569', borderBottom: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap' }

/* ── Helpers ── */
const fmtNum = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 0 })
const fmtCur = (v: number) => `€${v.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`
const fmtDec = (v: number, d = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
const n = (v: any) => Number(v) || 0

const MARKETPLACE_OPTIONS = [
  { value: 'all', label: 'All Marketplaces' },
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

interface ProductRow {
  parentAsin: string
  title: string
  skuCount: number
  units: number
  sales: number
  refunds: number
  refundRate: number
  avgPrice: number
  childSkus: string[]
}

type SortKey = 'units' | 'sales' | 'refunds' | 'refundRate' | 'avgPrice' | 'skuCount'
type SortDir = 'asc' | 'desc'

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

export default function ProductPerformancePage() {
  const { getByAsin, getBySkuWithFallback, asinFromSkuWithFallback } = useProductImages()
  const monthOptions = useMemo(() => generateMonthOptions(), [])
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0])
  const [selectedMarketplace, setSelectedMarketplace] = useState('all')
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('sales')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
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
        childSkus: [...d.skus],
      }))

      setProducts(rows)
      setLoading(false)
    }
    fetchData()
  }, [selectedMonth, selectedMarketplace])

  /* ── Computed values ── */
  const totalSales = useMemo(() => products.reduce((s, r) => s + r.sales, 0), [products])
  const totalUnits = useMemo(() => products.reduce((s, r) => s + r.units, 0), [products])
  const totalRefunds = useMemo(() => products.reduce((s, r) => s + r.refunds, 0), [products])

  /* ── Filter & Sort ── */
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

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }, [sortKey])

  const sortIcon = (key: SortKey) => sortKey !== key ? ' ⇅' : sortDir === 'asc' ? ' ↑' : ' ↓'

  /* ── AI Insights (local computation) ── */
  const insights = useMemo((): Insight[] => {
    if (products.length === 0) return []
    const result: Insight[] = []

    // 1. Top Sellers
    const sorted = [...products].sort((a, b) => b.sales - a.sales)
    const top3Sales = sorted.slice(0, 3).reduce((s, r) => s + r.sales, 0)
    const top3Pct = totalSales > 0 ? (top3Sales / totalSales) * 100 : 0
    if (sorted.length >= 3) {
      const topNames = sorted.slice(0, 3).map(r => `${r.title.substring(0, 40)}… (${fmtCur(r.sales)})`).join(' | ')
      result.push({
        type: 'Top Sellers',
        title: `Top 3 products account for ${fmtDec(top3Pct, 0)}% of total sales`,
        desc: topNames,
        color: COLORS.green,
      })
    }

    // 2. High Return Rate
    const highReturn = products.filter(r => r.refundRate > 10).sort((a, b) => b.refundRate - a.refundRate)
    if (highReturn.length > 0) {
      const topReturn = highReturn.slice(0, 3).map(r => `${r.title.substring(0, 35)}… (${fmtDec(r.refundRate)}%)`).join(' | ')
      result.push({
        type: 'Return Alert',
        title: `${highReturn.length} products with return rate above 10%`,
        desc: `${topReturn}. Review product listings and quality for these items.`,
        color: COLORS.red,
      })
    }

    // 3. Revenue Concentration Risk
    if (top3Pct > 60 && products.length > 5) {
      result.push({
        type: 'Revenue Risk',
        title: `Revenue concentration: top 3 products = ${fmtDec(top3Pct, 0)}%`,
        desc: `High dependency on a few products. Consider diversifying your catalog or boosting underperforming listings.`,
        color: COLORS.orange,
      })
    }

    // 4. Price Analysis
    if (products.length > 0) {
      const avgPrice = totalSales > 0 ? totalSales / totalUnits : 0
      const maxPrice = Math.max(...products.map(r => r.avgPrice))
      const minPrice = Math.min(...products.filter(r => r.avgPrice > 0).map(r => r.avgPrice))
      result.push({
        type: 'Price Insight',
        title: `Average product price: ${fmtCur(avgPrice)}`,
        desc: `Price range: ${fmtCur(minPrice)} – ${fmtCur(maxPrice)}. Products priced under €20 benefit from lower Amazon commission rates.`,
        color: COLORS.accent,
      })
    }

    // 5. Zero-sales products
    const zeroSales = products.filter(r => r.units === 0)
    if (zeroSales.length > 0) {
      result.push({
        type: 'No Sales',
        title: `${zeroSales.length} products with zero sales this period`,
        desc: `These products generated no revenue. Consider reviewing listings, pricing, or advertising strategy.`,
        color: '#64748B',
      })
    }

    return result
  }, [products, totalSales, totalUnits])

  /* ── Loading ── */
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${COLORS.border}`, borderTopColor: COLORS.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ color: COLORS.sub, fontSize: 13 }}>Loading product data...</div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: COLORS.text }}>Product Performance</h1>
          <p style={{ fontSize: 13, color: COLORS.sub, marginTop: 2, margin: 0 }}>
            Product-level sales and return analysis · {products.length} products
          </p>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <KpiCard label="TOTAL PRODUCTS" value={String(products.length)} change={`${selectedMonth}`} up={true}
          icon={KpiIcons.stock} bars={[40, 45, 50, 55, 58, 62, 65]} color={COLORS.accent} light="#C7D2FE" iconBg={COLORS.accentLight} />
        <KpiCard label="TOTAL SALES" value={fmtCur(totalSales)} change={`${fmtNum(totalUnits)} units sold`} up={true}
          icon={KpiIcons.revenue} bars={[50, 55, 60, 58, 62, 65, 70]} color={COLORS.green} light={COLORS.greenLighter} iconBg={COLORS.greenLight} />
        <KpiCard label="TOTAL UNITS" value={fmtNum(totalUnits)} change={`Avg. ${fmtCur(totalUnits > 0 ? totalSales / totalUnits : 0)}/unit`} up={true}
          icon={KpiIcons.orders} bars={[45, 48, 52, 55, 60, 58, 63]} color={COLORS.accent} light="#C7D2FE" iconBg={COLORS.accentLight} />
        <KpiCard label="TOTAL RETURNS" value={fmtCur(totalRefunds)} change={`${totalSales > 0 ? fmtDec((totalRefunds / totalSales) * 100) : '0'}% rate`} up={false}
          icon={KpiIcons.warning} bars={[80, 75, 70, 65, 60, 58, 55]} color={COLORS.red} light={COLORS.redLighter} iconBg={COLORS.redLight} />
      </div>

      {/* AI INSIGHTS */}
      {insights.length > 0 && (
        <AIInsights title="Product Insights" subtitle="Product performance analysis" insights={insights} />
      )}

      {/* FILTER BAR */}
      <div style={{ ...CARD_STYLE, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ ...SELECT_STYLE, fontSize: 12, padding: '7px 28px 7px 10px' }}>
          {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={selectedMarketplace} onChange={e => setSelectedMarketplace(e.target.value)} style={{ ...SELECT_STYLE, fontSize: 12, padding: '7px 28px 7px 10px' }}>
          {MARKETPLACE_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..."
          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12, outline: 'none', width: 200 }} />
      </div>

      {/* TABLE */}
      <div style={{ ...CARD_STYLE, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 800 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>
                <th style={{ ...TH_STYLE, padding: '12px 12px', textAlign: 'left', minWidth: 280 }}>Product</th>
                {[
                  { k: 'skuCount' as SortKey, l: 'SKUs', align: 'center' as const },
                  { k: 'units' as SortKey, l: 'Units', align: 'right' as const },
                  { k: 'sales' as SortKey, l: 'Sales', align: 'right' as const },
                  { k: 'avgPrice' as SortKey, l: 'Avg. Price', align: 'right' as const },
                  { k: 'refunds' as SortKey, l: 'Returns', align: 'right' as const },
                  { k: 'refundRate' as SortKey, l: 'Return %', align: 'right' as const },
                ].map(h => (
                  <th key={h.k} onClick={() => handleSort(h.k)}
                    style={{ ...TH_STYLE, padding: '12px 12px', textAlign: h.align, cursor: 'pointer', color: sortKey === h.k ? COLORS.accent : COLORS.sub }}>
                    {h.l}{sortIcon(h.k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}`, transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#FAFBFC'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <td style={{ ...tdStyle, padding: '10px 12px' }}>
                    {(() => {
                      // Try parent ASIN first, then child SKUs for image
                      let imgUrl = getByAsin(row.parentAsin)?.image_url || null
                      let linkAsin = row.parentAsin
                      if (!imgUrl) {
                        for (const sku of row.childSkus) {
                          const info = getBySkuWithFallback(sku)
                          if (info?.image_url) {
                            imgUrl = info.image_url
                            linkAsin = asinFromSkuWithFallback(sku) || row.parentAsin
                            break
                          }
                        }
                      }
                      return (
                        <ProductCell
                          title={row.title}
                          subtitle={row.parentAsin}
                          imageUrl={imgUrl}
                          asin={linkAsin}
                          size={32}
                          maxWidth={260}
                        />
                      )
                    })()}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: COLORS.sub }}>{row.skuCount}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>{fmtNum(row.units)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: COLORS.text }}>{fmtCur(row.sales)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtCur(row.avgPrice)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: COLORS.red }}>{fmtCur(row.refunds)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: row.refundRate > 10 ? 'rgba(239,68,68,0.1)' : row.refundRate > 5 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
                      color: row.refundRate > 10 ? COLORS.red : row.refundRate > 5 ? COLORS.orange : COLORS.green,
                    }}>
                      {fmtDec(row.refundRate)}%
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: COLORS.sub, fontSize: 13 }}>No products found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
