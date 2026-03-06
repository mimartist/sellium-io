'use client'

import { createClient } from '@supabase/supabase-js'
import { useEffect, useState, useMemo } from 'react'
import { useDateRange, formatDateTR } from '../DateRangeContext'

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

const acosColor = (v: number) => v < 25 ? '#10b981' : v < 40 ? '#f59e0b' : '#f43f5e'
const priorityColor = (p: string) => p === 'high' ? '#f43f5e' : p === 'normal' ? '#f59e0b' : '#10b981'
const priorityBg = (p: string) => p === 'high' ? 'rgba(244,63,94,0.12)' : p === 'normal' ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)'

export default function BrandPage() {
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
    return { totalImpressions, totalBrandSearches, totalNtbOrders, totalSpend }
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

  const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 10.5, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-color)', userSelect: 'none' }
  const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--bg-elevated)', whiteSpace: 'nowrap' }

  // Brand arama trendi
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
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>SB Brand Performansı</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>Sponsored Brands · {formatDateTR(startDate)} – {formatDateTR(endDate)}</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-secondary)', fontSize: 14 }}>Veriler yükleniyor...</div>
      ) : (
        <>
          {/* KPI CARDS */}
          <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'TOPLAM GÖSTERİM', value: kpis.totalImpressions.toLocaleString('de-DE'), color: '#6366f1' },
              { label: 'BRAND SEARCHES', value: kpis.totalBrandSearches.toLocaleString('de-DE'), color: '#a78bfa' },
              { label: 'NTB SİPARİŞ', value: kpis.totalNtbOrders.toLocaleString('de-DE'), color: '#10b981' },
              { label: 'TOPLAM SPEND', value: `€${kpis.totalSpend.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`, color: '#f43f5e' },
            ].map((kpi, i) => (
              <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '14px 16px', position: 'relative', overflow: 'hidden', opacity: 0, animation: `fadeInUp 0.6s ease-out ${i * 0.1}s forwards` }}>
                <div style={{ position: 'absolute', top: 0, right: 0, width: 50, height: 50, borderRadius: '0 14px 0 50px', background: kpi.color, opacity: 0.07 }} />
                <div style={{ fontSize: 9.5, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{kpi.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px', animation: `numberCount 0.5s ease-out ${0.3 + i * 0.1}s both` }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* INSIGHT CARDS: Brand Trend + NTB */}
          {rawData.length > 0 && (
            <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderLeft: '3px solid #a78bfa', borderRadius: 14, padding: '16px 20px', opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.45s forwards' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(167,139,250,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#a78bfa' }}>~</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Brand Arama Trendi</div>
                  <div style={{ fontSize: 10, color: '#a78bfa', marginLeft: 'auto', fontWeight: 600 }}>{totalSearches.toLocaleString('de-DE')} TOPLAM</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40, marginBottom: 8 }}>
                  {days.map(([date, val], i) => (
                    <div key={date} style={{ flex: 1, background: '#a78bfa', borderRadius: '2px 2px 0 0', opacity: 0.6 + (val / maxDay) * 0.4, height: `${Math.max((val / maxDay) * 100, 4)}%`, transformOrigin: 'bottom center', transform: 'scaleY(0)', animation: `barGrow 0.5s ease-out ${0.5 + i * 0.02}s forwards` }} title={`${date}: ${val}`} />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)' }}>
                  <span>{days.length > 0 ? days[0][0].slice(5) : ''}</span>
                  <span>{days.length > 0 ? days[days.length - 1][0].slice(5) : ''}</span>
                </div>
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderLeft: '3px solid #10b981', borderRadius: 14, padding: '16px 20px', opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.5s forwards' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#10b981' }}>+</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>New-to-Brand Özet</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>NTB SİPARİŞ</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>{ntbTotal.toLocaleString('de-DE')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>NTB SATIŞ</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>€{ntbSalesTotal.toLocaleString('de-DE', { maximumFractionDigits: 0 })}</div>
                  </div>
                </div>
                {kpis.totalSpend > 0 && (
                  <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>NTB Maliyet/Sipariş</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: ntbTotal > 0 ? '#f59e0b' : 'var(--text-secondary)' }}>{ntbTotal > 0 ? `€${(kpis.totalSpend / ntbTotal).toFixed(2)}` : '-'}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI INSIGHTS */}
          {aiInsights.length > 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.55s forwards' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#6366f1', fontWeight: 700 }}>AI</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>AI Önerileri</div>
                <div style={{ fontSize: 10, color: '#6366f1', marginLeft: 'auto', fontWeight: 600 }}>{aiInsights.length} ÖNERİ</div>
              </div>
              {aiInsights.map((ins, i) => (
                <div key={ins.id} style={{ padding: '10px 0', borderBottom: i < aiInsights.length - 1 ? '1px solid var(--bg-elevated)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: priorityColor(ins.priority), background: priorityBg(ins.priority), padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>{ins.priority}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{ins.title}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>{ins.content}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => updateInsightStatus(ins.id, 'applied')} style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, padding: '4px 12px', fontSize: 11, color: '#10b981', cursor: 'pointer', fontWeight: 600 }}>Uygulandı</button>
                    <button onClick={() => updateInsightStatus(ins.id, 'dismissed')} style={{ background: 'rgba(107,114,128,0.12)', border: '1px solid rgba(107,114,128,0.3)', borderRadius: 6, padding: '4px 12px', fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>Geç</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TABLE */}
          <div className="table-container" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.6s forwards' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Kampanya Bazlı Brand Performansı</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{sorted.length} kampanya</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {([['campaign_name','Kampanya'],['impressions','Gösterim'],['clicks','Tıklama'],['spend','Spend'],['sales','Satış'],['orders','Sipariş'],['brand_searches','Brand Arama'],['ntb_orders','NTB Sipariş'],['ntb_sales','NTB Satış'],['dpv','DPV'],['acos','ACOS']] as [SortKey,string][]).map(([key,label]) => (
                    <th key={key} onClick={() => handleSort(key)} style={{ ...thStyle, textAlign: key !== 'campaign_name' ? 'right' : 'left' }}>{label}{sortIcon(key)}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {sorted.map((c, i) => (
                    <tr key={i} style={{ transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ ...tdStyle, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.campaign_name}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.impressions.toLocaleString('de-DE')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.clicks.toLocaleString('de-DE')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>€{c.spend.toFixed(2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#10b981' }}>€{c.sales.toFixed(2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.orders}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.brand_searches.toLocaleString('de-DE')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#a78bfa', fontWeight: 600 }}>{c.ntb_orders}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#a78bfa' }}>€{c.ntb_sales.toFixed(2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.dpv.toLocaleString('de-DE')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: acosColor(c.acos) }}>{c.acos > 0 ? `%${c.acos.toFixed(1)}` : '-'}</td>
                    </tr>
                  ))}
                  {sorted.length === 0 && <tr><td colSpan={11} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)', padding: 30 }}>Bu tarih aralığı için veri yok</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
