'use client'

import { createClient } from '@supabase/supabase-js'
import { useEffect, useState, useMemo } from 'react'
import { useDateRange, formatDateTR } from '../DateRangeContext'

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

const acosColor = (v: number) => v < 25 ? '#10b981' : v < 40 ? '#f59e0b' : '#f43f5e'
const priorityColor = (p: string) => p === 'high' ? '#f43f5e' : p === 'normal' ? '#f59e0b' : '#10b981'
const priorityBg = (p: string) => p === 'high' ? 'rgba(244,63,94,0.12)' : p === 'normal' ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)'

export default function ProductsPage() {
  const { startDate, endDate } = useDateRange()
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
  }, [startDate, endDate])

  const updateInsightStatus = async (id: number, status: 'applied' | 'dismissed') => {
    await supabase.from('ai_insights').update({ status }).eq('id', id)
    setAiInsights(prev => prev.filter(i => i.id !== id))
  }

  const kpis = useMemo(() => {
    const totalSpend = rawData.reduce((s, r) => s + Number(r.spend), 0)
    const totalSales = rawData.reduce((s, r) => s + Number(r.sales_7d), 0)
    const acos = totalSales > 0 ? (totalSpend / totalSales) * 100 : 0
    const roas = totalSpend > 0 ? totalSales / totalSpend : 0
    return { totalSpend, totalSales, acos, roas }
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

  const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 10.5, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-color)', userSelect: 'none' }
  const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--bg-elevated)', whiteSpace: 'nowrap' }

  const worst3 = useMemo(() => [...insightSkus].filter(s => Number(s.calc_acos) > 0).sort((a, b) => Number(b.calc_acos) - Number(a.calc_acos)).slice(0, 3), [insightSkus])
  const best3 = useMemo(() => [...insightSkus].filter(s => Number(s.calc_acos) > 0 && Number(s.total_sales) > 0).sort((a, b) => Number(a.calc_acos) - Number(b.calc_acos)).slice(0, 3), [insightSkus])

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>SP Ürün Performansı</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>Sponsored Products · {formatDateTR(startDate)} – {formatDateTR(endDate)}</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-secondary)', fontSize: 14 }}>Veriler yükleniyor...</div>
      ) : (
        <>
          {/* KPI CARDS */}
          <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'TOPLAM SPEND', value: `€${kpis.totalSpend.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`, color: '#f43f5e' },
              { label: 'TOPLAM SATIŞ', value: `€${kpis.totalSales.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`, color: '#10b981' },
              { label: 'ORT. ACOS', value: `%${kpis.acos.toFixed(1)}`, color: acosColor(kpis.acos) },
              { label: 'ORT. ROAS', value: `${kpis.roas.toFixed(2)}x`, color: '#6366f1' },
            ].map((kpi, i) => (
              <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '14px 16px', position: 'relative', overflow: 'hidden', opacity: 0, animation: `fadeInUp 0.6s ease-out ${i * 0.1}s forwards` }}>
                <div style={{ position: 'absolute', top: 0, right: 0, width: 50, height: 50, borderRadius: '0 14px 0 50px', background: kpi.color, opacity: 0.07 }} />
                <div style={{ fontSize: 9.5, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{kpi.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px', animation: `numberCount 0.5s ease-out ${0.3 + i * 0.1}s both` }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* INSIGHT CARDS */}
          {insightSkus.length > 0 && (
            <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderLeft: '3px solid #f43f5e', borderRadius: 14, padding: '16px 20px', opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.45s forwards' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(244,63,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#f43f5e' }}>↓</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>En Kötü Performans</div>
                  <div style={{ fontSize: 10, color: '#f43f5e', marginLeft: 'auto', fontWeight: 600 }}>YÜKSEK ACOS</div>
                </div>
                {worst3.map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 2 ? '1px solid var(--bg-elevated)' : 'none' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{s.sku}</div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                      <span style={{ color: '#f43f5e', fontWeight: 600 }}>ACOS %{Number(s.calc_acos).toFixed(1)}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>€{Number(s.total_spend).toFixed(0)} spend</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderLeft: '3px solid #10b981', borderRadius: 14, padding: '16px 20px', opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.5s forwards' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#10b981' }}>↑</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>En İyi Performans</div>
                  <div style={{ fontSize: 10, color: '#10b981', marginLeft: 'auto', fontWeight: 600 }}>DÜŞÜK ACOS</div>
                </div>
                {best3.map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 2 ? '1px solid var(--bg-elevated)' : 'none' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{s.sku}</div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>ACOS %{Number(s.calc_acos).toFixed(1)}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>€{Number(s.total_sales).toFixed(0)} satış</span>
                    </div>
                  </div>
                ))}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>SKU Bazlı Performans</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{filtered.length} ürün</div>
              </div>
              <input type="text" placeholder="SKU veya ASIN ara..." value={search} onChange={e => setSearch(e.target.value)} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, color: 'var(--text-primary)', outline: 'none', width: 220 }} />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {([['sku','SKU'],['asin','ASIN'],['impressions','Gösterim'],['clicks','Tıklama'],['spend','Spend'],['sales','Satış'],['orders','Sipariş'],['units','Adet'],['acos','ACOS'],['roas','ROAS']] as [SortKey,string][]).map(([key,label]) => (
                    <th key={key} onClick={() => handleSort(key)} style={{ ...thStyle, textAlign: ['impressions','clicks','spend','sales','orders','units','acos','roas'].includes(key) ? 'right' : 'left' }}>{label}{sortIcon(key)}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr key={i} style={{ transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ ...tdStyle, fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.sku}</td>
                      <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-muted)' }}>{s.asin}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{s.impressions.toLocaleString('de-DE')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{s.clicks.toLocaleString('de-DE')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>€{s.spend.toFixed(2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#10b981' }}>€{s.sales.toFixed(2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{s.orders}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{s.units}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: acosColor(s.acos) }}>%{s.acos.toFixed(1)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{s.roas.toFixed(2)}x</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={10} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)', padding: 30 }}>{search ? 'Sonuç bulunamadı' : 'Bu tarih aralığı için veri yok'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
