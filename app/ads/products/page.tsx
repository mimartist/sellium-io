'use client'

import { createClient } from '@supabase/supabase-js'
import { useEffect, useState, useMemo } from 'react'
import { useDateRange, formatDateTR } from '../DateRangeContext'
import { COLORS, CARD_STYLE, TH_STYLE } from '@/lib/design-tokens'
import KpiCard from '@/components/ui/KpiCard'
import { KpiIcons } from '@/components/ui/KpiIcons'
import AIInsights from '@/components/ui/AIInsights'
import { ImgPlaceholder } from '@/components/ui/Badges'
import { useProductImages } from '@/hooks/useProductImages'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface ProductRow {
  id: number; date: string; campaign_name: string; ad_group: string; sku: string; asin: string
  impressions: number; clicks: number; ctr: number; cpc: number; spend: number
  sales_7d: number; orders_7d: number; units_7d: number; acos: number; roas: number; conversion_rate: number
}

interface SkuAgg {
  sku: string; asin: string; impressions: number; clicks: number; spend: number
  sales: number; orders: number; units: number; acos: number; roas: number
}

interface InsightSku {
  sku: string; asin: string; total_spend: number; total_sales: number; total_clicks: number
  total_orders: number; calc_acos: number; calc_roas: number; period: string
}

interface AiInsight {
  id: number; insight_type: string; title: string; content: string
  priority: 'high' | 'normal' | 'low'; status: string; created_at: string
}

type SortKey = keyof SkuAgg
type SortDir = 'asc' | 'desc'

// Vivid for text/badges
const acosColor = (v: number) => v < 25 ? '#059669' : v < 40 ? '#D97706' : '#DC2626'
// Semantic badge backgrounds (green→yellow→orange→red)
const acosBadgeBg = (v: number) => v < 25 ? '#ECFDF5' : v < 35 ? '#FFFBEB' : v < 60 ? '#FFF7ED' : '#FEF2F2'

export default function ProductsPage() {
  const { getBySkuWithFallback: getBySku, asinFromSkuWithFallback: asinFromSku } = useProductImages()
  const { startDate, endDate, isAllTime } = useDateRange()
  const [rawData, setRawData] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('spend')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [insightSkus, setInsightSkus] = useState<InsightSku[]>([])
  const [aiInsights, setAiInsights] = useState<AiInsight[]>([])

  useEffect(() => {
    if (!startDate || !endDate) return
    const fetchData = async () => {
      setLoading(true)

      const [prodRes, skuRes, aiRes] = await Promise.all([
        supabase.from('ad_product_performance').select('*').gte('date', startDate).lte('date', endDate),
        supabase.from('insight_sku_performance').select('*').eq('period', 'last_30d').limit(20),
        supabase.from('ai_insights').select('*').eq('insight_type', 'sku_optimization').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
      ])

      setInsightSkus((skuRes.data || []) as InsightSku[])
      setAiInsights((aiRes.data || []) as AiInsight[])

      const data = prodRes.data
      const deduped = (() => {
        const map: Record<string, ProductRow> = {}
        ;(data as ProductRow[] || []).forEach(r => {
          const key = `${r.date}|${r.sku}|${r.campaign_name}|${r.ad_group}`
          if (!map[key] || r.id > map[key].id) map[key] = r
        })
        return Object.values(map)
      })()
      setRawData(deduped)
      setLoading(false)
    }
    fetchData()
  }, [startDate, endDate, isAllTime])

  const updateInsightStatus = async (id: number, status: 'applied' | 'dismissed') => {
    await supabase.from('ai_insights').update({ status }).eq('id', id)
    setAiInsights(prev => prev.filter(i => i.id !== id))
  }

  const kpis = useMemo(() => {
    const totalSpend = rawData.reduce((s, r) => s + Number(r.spend), 0)
    const totalSales = rawData.reduce((s, r) => s + Number(r.sales_7d), 0)
    const totalClicks = rawData.reduce((s, r) => s + Number(r.clicks), 0)
    const totalOrders = rawData.reduce((s, r) => s + Number(r.orders_7d), 0)
    const acos = totalSales > 0 ? (totalSpend / totalSales) * 100 : 0
    const roas = totalSpend > 0 ? totalSales / totalSpend : 0
    return { totalSpend, totalSales, totalClicks, totalOrders, acos, roas }
  }, [rawData])

  const skuData = useMemo(() => {
    const map: Record<string, SkuAgg> = {}
    rawData.forEach(r => {
      if (!map[r.sku]) map[r.sku] = { sku: r.sku, asin: r.asin, impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, units: 0, acos: 0, roas: 0 }
      map[r.sku].impressions += Number(r.impressions); map[r.sku].clicks += Number(r.clicks)
      map[r.sku].spend += Number(r.spend); map[r.sku].sales += Number(r.sales_7d)
      map[r.sku].orders += Number(r.orders_7d); map[r.sku].units += Number(r.units_7d)
      if (r.asin) map[r.sku].asin = r.asin
    })
    Object.values(map).forEach(s => {
      s.acos = s.sales > 0 ? (s.spend / s.sales) * 100 : 0
      s.roas = s.spend > 0 ? s.sales / s.spend : 0
    })
    return Object.values(map)
  }, [rawData])

  const filtered = useMemo(() => {
    return skuData
      .filter(s => s.sku.toLowerCase().includes(search.toLowerCase()) || s.asin.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey]
        if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
        return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      })
  }, [skuData, search, sortKey, sortDir])

  const handleSort = (key: SortKey) => { if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('desc') } }
  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  const thStyle: React.CSSProperties = { ...TH_STYLE, padding: '12px 16px', textAlign: 'left', cursor: 'pointer', borderBottom: `2px solid ${COLORS.border}`, userSelect: 'none' }
  const tdStyle: React.CSSProperties = { padding: '11px 16px', fontSize: 13, color: '#475569', borderBottom: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap' }

  const worst3 = useMemo(() => [...insightSkus].filter(s => Number(s.calc_acos) > 0).sort((a, b) => Number(b.calc_acos) - Number(a.calc_acos)).slice(0, 3), [insightSkus])
  const best3 = useMemo(() => [...insightSkus].filter(s => Number(s.calc_acos) > 0 && Number(s.total_sales) > 0).sort((a, b) => Number(a.calc_acos) - Number(b.calc_acos)).slice(0, 3), [insightSkus])

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: COLORS.text }}>SP Product Performance</h1>
          <p style={{ fontSize: 12, color: COLORS.sub, marginTop: 3 }}>Sponsored Products · {formatDateTR(startDate)} – {formatDateTR(endDate)}</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: COLORS.sub, fontSize: 14 }}>Loading data...</div>
      ) : (
        <>
          {/* KPI CARDS */}
          <div className="grid-4" style={{ marginBottom: 20 }}>
            <KpiCard label="TOTAL SPEND" value={`€${kpis.totalSpend.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`} change={`${skuData.length} products`} icon={KpiIcons.spend} color={COLORS.red} light="#FECACA" iconBg="#FEF2F2" bars={[50, 55, 60, 62, 65, 68, 72]} />
            <KpiCard label="SALES" value={`€${kpis.totalSales.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`} change={`${kpis.totalOrders} orders`} up icon={KpiIcons.sales} color={COLORS.green} light="#A7F3D0" iconBg="#ECFDF5" bars={[85, 80, 75, 72, 68, 65, 60]} />
            <KpiCard label="ACOS" value={`%${kpis.acos.toFixed(1)}`} change={`target %35`} up={kpis.acos <= 35} icon={KpiIcons.acos} color={COLORS.orange} light="#FDE68A" iconBg="#FFFBEB" bars={[40, 45, 48, 50, 52, 55, 58]} />
            <KpiCard label="ROAS" value={`${kpis.roas.toFixed(2)}x`} change={`target 2.5x`} up={kpis.roas >= 2.5} icon={KpiIcons.roas} color={COLORS.accent} light="#C7D2FE" iconBg="#EEF2FF" bars={[75, 70, 65, 60, 58, 55, 52]} />
          </div>

          {/* INSIGHT CARDS */}
          {insightSkus.length > 0 && (
            <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div style={{ ...CARD_STYLE, padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(244,63,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#f43f5e' }}>↓</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>Worst Performers</div>
                  <div style={{ fontSize: 10, color: '#f43f5e', marginLeft: 'auto', fontWeight: 600 }}>HIGH ACOS</div>
                </div>
                {worst3.map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 2 ? `1px solid ${COLORS.border}` : 'none' }}>
                    <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{s.sku}</div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                      <span style={{ color: '#f43f5e', fontWeight: 600 }}>ACOS %{Number(s.calc_acos).toFixed(1)}</span>
                      <span style={{ color: COLORS.sub }}>€{Number(s.total_spend).toFixed(0)} spend</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ ...CARD_STYLE, padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#10b981' }}>↑</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>Best Performers</div>
                  <div style={{ fontSize: 10, color: '#10b981', marginLeft: 'auto', fontWeight: 600 }}>LOW ACOS</div>
                </div>
                {best3.map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 2 ? `1px solid ${COLORS.border}` : 'none' }}>
                    <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{s.sku}</div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>ACOS %{Number(s.calc_acos).toFixed(1)}</span>
                      <span style={{ color: COLORS.sub }}>€{Number(s.total_sales).toFixed(0)} sales</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI INSIGHTS */}
          {aiInsights.length > 0 && (
            <AIInsights
              title="AI Product Insights"
              subtitle="SKU optimization and product performance recommendations"
              insights={aiInsights.map(ins => ({
                type: ins.priority === 'high' ? 'CRITICAL' : ins.priority === 'normal' ? 'OPTIMIZATION' : 'INFO',
                title: ins.title,
                desc: ins.content,
                color: ins.priority === 'high' ? COLORS.red : ins.priority === 'normal' ? COLORS.orange : COLORS.green,
              }))}
            />
          )}

          {/* TABLE */}
          <div style={{ ...CARD_STYLE, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>SKU Based Performance</div>
                <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 2 }}>{filtered.length} products</div>
              </div>
              <input type="text" placeholder="Search SKU or ASIN..." value={search} onChange={e => setSearch(e.target.value)} style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '7px 14px', fontSize: 12.5, color: COLORS.text, outline: 'none', width: 220 }} />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={{ ...thStyle, textAlign: 'left', minWidth: 200 }}>Product</th>
                  <th style={{ ...thStyle, textAlign: 'left' }} onClick={() => handleSort('asin')}>ASIN{sortIcon('asin')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('impressions')}>Impressions{sortIcon('impressions')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('clicks')}>Clicks{sortIcon('clicks')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('spend')}>Spend{sortIcon('spend')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('sales')}>Sales{sortIcon('sales')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('orders')}>Orders{sortIcon('orders')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('units')}>Units{sortIcon('units')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('acos')}>ACOS{sortIcon('acos')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('roas')}>ROAS{sortIcon('roas')}</th>
                </tr></thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr key={i} style={{ transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {(getBySku(s.sku)?.image_url || (s.asin && getBySku(s.sku) === null)) ? (
                            (() => {
                              const info = getBySku(s.sku)
                              const imgUrl = info?.image_url
                              const linkAsin = asinFromSku(s.sku) || s.asin
                              return imgUrl ? (
                                <a href={`/products/${linkAsin}`} onClick={e => e.stopPropagation()} style={{ lineHeight: 0 }}>
                                  <img src={imgUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', border: `1px solid ${COLORS.border}` }} />
                                </a>
                              ) : <ImgPlaceholder size={32} />
                            })()
                          ) : <ImgPlaceholder size={32} />}
                          <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: COLORS.text }}>{s.sku}</span>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontSize: 11, color: COLORS.accent, fontWeight: 500 }}>
                        {s.asin ? <a href={`/products/${s.asin}`} style={{ color: COLORS.accent, textDecoration: 'none' }}>{s.asin}</a> : '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{s.impressions.toLocaleString('de-DE')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{s.clicks.toLocaleString('de-DE')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>€{s.spend.toFixed(2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#059669' }}>€{s.sales.toFixed(2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{s.orders}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{s.units}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, background: acosBadgeBg(s.acos), color: acosColor(s.acos), fontWeight: 600, fontSize: 12 }}>
                          %{s.acos.toFixed(1)}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: s.roas >= 2 ? '#059669' : s.roas > 0 ? '#DC2626' : COLORS.sub }}>
                        {s.roas.toFixed(2)}x
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={10} style={{ ...tdStyle, textAlign: 'center', color: COLORS.sub, padding: 30 }}>{search ? 'No results found' : 'No data for this date range'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
