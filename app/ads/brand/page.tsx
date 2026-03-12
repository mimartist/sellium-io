'use client'

import { createClient } from '@supabase/supabase-js'
import { useEffect, useState, useMemo } from 'react'
import { useDateRange, formatDateTR } from '../DateRangeContext'
import { useTranslation } from '@/lib/i18n'
import { COLORS, CARD_STYLE, TH_STYLE } from '@/lib/design-tokens'
import KpiCard from '@/components/ui/KpiCard'
import { KpiIcons } from '@/components/ui/KpiIcons'
import AIInsights from '@/components/ui/AIInsights'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface BrandRow {
  id: number; date: string; campaign_name: string; keyword: string; match_type: string
  impressions: number; viewable_impressions: number; top_of_search_rate: number; clicks: number
  ctr: number; cpc: number; spend: number; sales_14d: number; orders_14d: number
  new_to_brand_orders: number; new_to_brand_sales: number; brand_searches: number; detail_page_views: number
}

interface BrandAgg {
  campaign_name: string; impressions: number; clicks: number; spend: number; sales: number
  orders: number; brand_searches: number; ntb_orders: number; ntb_sales: number; dpv: number; acos: number
}

interface AiInsight {
  id: number; insight_type: string; title: string; content: string
  priority: 'high' | 'normal' | 'low'; status: string; created_at: string
}

type SortKey = keyof BrandAgg
type SortDir = 'asc' | 'desc'

// Vivid for text/badges
const acosColor = (v: number) => v < 25 ? '#059669' : v < 40 ? '#D97706' : '#DC2626'
// Semantic badge backgrounds
const acosBadgeBg = (v: number) => v < 25 ? '#ECFDF5' : v < 35 ? '#FFFBEB' : v < 60 ? '#FFF7ED' : '#FEF2F2'

export default function BrandPage() {
  const { t } = useTranslation()
  const { startDate, endDate, isAllTime } = useDateRange()
  const [rawData, setRawData] = useState<BrandRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('spend')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [aiInsights, setAiInsights] = useState<AiInsight[]>([])

  useEffect(() => {
    if (!startDate || !endDate) return
    const fetchData = async () => {
      setLoading(true)

      const [brandRes, aiRes] = await Promise.all([
        supabase.from('ad_brand_performance').select('*').gte('date', startDate).lte('date', endDate),
        supabase.from('ai_insights').select('*').eq('insight_type', 'budget_allocation').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
      ])

      setAiInsights((aiRes.data || []) as AiInsight[])

      const data = brandRes.data
      const deduped = (() => {
        const map: Record<string, BrandRow> = {}
        ;(data as BrandRow[] || []).forEach(r => {
          const key = `${r.date}|${r.campaign_name}|${r.keyword}`
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
    const totalImpressions = rawData.reduce((s, r) => s + Number(r.impressions), 0)
    const totalBrandSearches = rawData.reduce((s, r) => s + Number(r.brand_searches), 0)
    const totalNtbOrders = rawData.reduce((s, r) => s + Number(r.new_to_brand_orders), 0)
    const totalSpend = rawData.reduce((s, r) => s + Number(r.spend), 0)
    const totalSales = rawData.reduce((s, r) => s + Number(r.sales_14d), 0)
    const acos = totalSales > 0 ? (totalSpend / totalSales) * 100 : 0
    return { totalImpressions, totalBrandSearches, totalNtbOrders, totalSpend, totalSales, acos }
  }, [rawData])

  const campaignData = useMemo(() => {
    const map: Record<string, BrandAgg> = {}
    rawData.forEach(r => {
      const key = r.campaign_name
      if (!map[key]) map[key] = { campaign_name: r.campaign_name, impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, brand_searches: 0, ntb_orders: 0, ntb_sales: 0, dpv: 0, acos: 0 }
      map[key].impressions += Number(r.impressions); map[key].clicks += Number(r.clicks)
      map[key].spend += Number(r.spend); map[key].sales += Number(r.sales_14d)
      map[key].orders += Number(r.orders_14d); map[key].brand_searches += Number(r.brand_searches)
      map[key].ntb_orders += Number(r.new_to_brand_orders); map[key].ntb_sales += Number(r.new_to_brand_sales)
      map[key].dpv += Number(r.detail_page_views)
    })
    Object.values(map).forEach(c => { c.acos = c.sales > 0 ? (c.spend / c.sales) * 100 : 0 })
    return Object.values(map)
  }, [rawData])

  const sorted = useMemo(() => {
    return [...campaignData].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
  }, [campaignData, sortKey, sortDir])

  const handleSort = (key: SortKey) => { if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('desc') } }
  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  const thStyle: React.CSSProperties = { ...TH_STYLE, padding: '12px 16px', textAlign: 'left', cursor: 'pointer', borderBottom: `2px solid ${COLORS.border}`, userSelect: 'none' }
  const tdStyle: React.CSSProperties = { padding: '11px 16px', fontSize: 13, color: '#475569', borderBottom: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap' }

  // Brand search trend
  const dailyMap: Record<string, number> = {}
  rawData.forEach(r => { dailyMap[r.date] = (dailyMap[r.date] || 0) + Number(r.brand_searches) })
  const days = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b))
  const totalSearches = days.reduce((s, [, v]) => s + v, 0)
  const maxDay = Math.max(...days.map(([, v]) => v), 1)
  const ntbTotal = rawData.reduce((s, r) => s + Number(r.new_to_brand_orders), 0)
  const ntbSalesTotal = rawData.reduce((s, r) => s + Number(r.new_to_brand_sales), 0)

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: COLORS.text }}>{t("adsBrand.title")}</h1>
          <p style={{ fontSize: 12, color: COLORS.sub, marginTop: 3 }}>{t("adsBrand.subtitle")} · {formatDateTR(startDate)} – {formatDateTR(endDate)}</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: COLORS.sub, fontSize: 14 }}>{t("ads.loadingData")}</div>
      ) : (
        <>
          {/* KPI CARDS */}
          <div className="grid-4" style={{ marginBottom: 20 }}>
            <KpiCard label={t("adsBrand.totalImpressions")} value={kpis.totalImpressions.toLocaleString('de-DE')} change={`${campaignData.length} ${t("adsBrand.campaigns")}`} up icon={KpiIcons.impressions} color={COLORS.accent} light="#C7D2FE" iconBg="#EEF2FF" bars={[50, 55, 60, 65, 70, 68, 72]} />
            <KpiCard label={t("adsBrand.brandSearches")} value={kpis.totalBrandSearches.toLocaleString('de-DE')} change={kpis.totalBrandSearches < 50 ? t("adsBrand.lowVolume") : t("adsBrand.normalVolume")} up={kpis.totalBrandSearches >= 50} icon={KpiIcons.clicks} color="#7C3AED" light="#DDD6FE" iconBg="#F5F3FF" bars={[30, 35, 40, 38, 42, 45, 50]} />
            <KpiCard label={t("adsBrand.ntbOrders")} value={kpis.totalNtbOrders.toLocaleString('de-DE')} change={t("adsBrand.targetAbove5")} up={kpis.totalNtbOrders >= 5} icon={KpiIcons.sales} color={COLORS.green} light="#A7F3D0" iconBg="#ECFDF5" bars={[20, 25, 30, 28, 32, 35, 40]} />
            <KpiCard label={t("adsBrand.totalSpend")} value={`€${kpis.totalSpend.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`} change={`ACOS %${kpis.acos.toFixed(1)}`} up={kpis.acos <= 35} icon={KpiIcons.spend} color={COLORS.red} light="#FECACA" iconBg="#FEF2F2" bars={[50, 55, 60, 62, 65, 68, 72]} />
          </div>

          {/* INSIGHT CARDS: Brand Trend + NTB */}
          {rawData.length > 0 && (
            <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div style={{ ...CARD_STYLE, padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(124,58,237,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#7C3AED' }}>~</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{t("adsBrand.brandSearchTrend")}</div>
                  <div style={{ fontSize: 10, color: '#7C3AED', marginLeft: 'auto', fontWeight: 600 }}>{totalSearches.toLocaleString('de-DE')} TOTAL</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40, marginBottom: 8 }}>
                  {days.map(([date, val], i) => (
                    <div key={date} style={{ flex: 1, background: '#7C3AED', borderRadius: '2px 2px 0 0', opacity: 0.6 + (val / maxDay) * 0.4, height: `${Math.max((val / maxDay) * 100, 4)}%`, transformOrigin: 'bottom center', transform: 'scaleY(0)', animation: `barGrow 0.5s ease-out ${0.5 + i * 0.02}s forwards` }} title={`${date}: ${val}`} />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: COLORS.sub }}>
                  <span>{days.length > 0 ? days[0][0].slice(5) : ''}</span>
                  <span>{days.length > 0 ? days[days.length - 1][0].slice(5) : ''}</span>
                </div>
              </div>
              <div style={{ ...CARD_STYLE, padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#10b981' }}>+</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>New-to-Brand Summary</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: COLORS.sub, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>NTB SİPARİŞ</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#059669' }}>{ntbTotal.toLocaleString('de-DE')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: COLORS.sub, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>NTB SATIŞ</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#059669' }}>€{ntbSalesTotal.toLocaleString('de-DE', { maximumFractionDigits: 0 })}</div>
                  </div>
                </div>
                {kpis.totalSpend > 0 && (
                  <div style={{ marginTop: 12, padding: '8px 12px', background: COLORS.bg, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: COLORS.sub }}>NTB Maliyet/Sipariş</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: ntbTotal > 0 ? '#D97706' : COLORS.sub }}>{ntbTotal > 0 ? `€${(kpis.totalSpend / ntbTotal).toFixed(2)}` : '—'}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI INSIGHTS */}
          {aiInsights.length > 0 && (
            <AIInsights
              title="AI Brand Insights"
              subtitle="Brand awareness and new-to-brand performance recommendations"
              insights={aiInsights.map(ins => ({
                type: ins.priority === 'high' ? 'CRITICAL' : ins.priority === 'normal' ? 'BRAND' : 'INFO',
                title: ins.title,
                desc: ins.content,
                color: ins.priority === 'high' ? COLORS.red : ins.priority === 'normal' ? '#7C3AED' : COLORS.green,
              }))}
            />
          )}

          {/* TABLE */}
          <div style={{ ...CARD_STYLE, padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>Brand Kampanya Performansı</div>
              <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 2 }}>{sorted.length} kampanya</div>
            </div>
            <div className="modern-scroll" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={{ ...thStyle, textAlign: 'left', minWidth: 200 }} onClick={() => handleSort('campaign_name')}>Kampanya{sortIcon('campaign_name')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('impressions')}>Gösterim{sortIcon('impressions')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('clicks')}>Tıklama{sortIcon('clicks')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('spend')}>Spend{sortIcon('spend')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('sales')}>Satış{sortIcon('sales')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('orders')}>Sipariş{sortIcon('orders')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('brand_searches')}>Brand Arama{sortIcon('brand_searches')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('ntb_orders')}>NTB{sortIcon('ntb_orders')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('acos')}>ACOS{sortIcon('acos')}</th>
                </tr></thead>
                <tbody>
                  {sorted.map((c, i) => (
                    <tr key={i} style={{ transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ ...tdStyle, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', color: COLORS.text, fontWeight: 500 }}>{c.campaign_name}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.impressions.toLocaleString('de-DE')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.clicks.toLocaleString('de-DE')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: COLORS.text }}>€{c.spend.toFixed(2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: c.sales > 0 ? '#059669' : COLORS.sub }}>€{c.sales.toFixed(2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.orders}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.brand_searches.toLocaleString('de-DE')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#7C3AED', fontWeight: 600 }}>{c.ntb_orders}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {c.acos > 0 ? (
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, background: acosBadgeBg(c.acos), color: acosColor(c.acos), fontWeight: 600, fontSize: 12 }}>
                            %{c.acos.toFixed(1)}
                          </span>
                        ) : (
                          <span style={{ color: COLORS.sub }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && <tr><td colSpan={9} style={{ ...tdStyle, textAlign: 'center', color: COLORS.sub, padding: 30 }}>Bu tarih aralığında veri yok</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
