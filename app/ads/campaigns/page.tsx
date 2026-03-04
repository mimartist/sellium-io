'use client'

import { createClient } from '@supabase/supabase-js'
import { useEffect, useState, useMemo } from 'react'
import { useDateRange, formatDateTR } from '../DateRangeContext'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface AdRow {
  id: number; date: string; campaign_name: string; campaign_type: string; portfolio: string
  country: string; status: string; budget: number; impressions: number; clicks: number
  ctr: number; spend: number; sales: number; orders_7d: number; acos: number; roas: number
  currency: string; report_type: string
}

interface CampaignAgg {
  campaign_name: string; campaign_type: string; status: string; impressions: number
  clicks: number; spend: number; sales: number; orders_7d: number; acos: number; roas: number
}

interface InsightCampaignEff {
  campaign_name: string; total_spend: number; total_sales: number; total_clicks: number
  total_impressions: number; total_orders: number; calc_acos: number; cvr: number; report_month: string
}

interface InsightWasted {
  search_term: string; campaign_name: string; total_spend: number; total_clicks: number
  total_impressions: number; total_orders: number; report_month: string
}

interface AiInsight {
  id: number; insight_type: string; title: string; content: string
  priority: 'high' | 'normal' | 'low'; status: string; created_at: string
}

type SortKey = keyof CampaignAgg
type SortDir = 'asc' | 'desc'

const acosColor = (v: number) => v < 25 ? '#10b981' : v < 40 ? '#f59e0b' : '#f43f5e'
const priorityColor = (p: string) => p === 'high' ? '#f43f5e' : p === 'normal' ? '#f59e0b' : '#10b981'
const priorityBg = (p: string) => p === 'high' ? 'rgba(244,63,94,0.12)' : p === 'normal' ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)'

export default function CampaignsPage() {
  const { startDate, endDate, months } = useDateRange()
  const [rawData, setRawData] = useState<AdRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('spend')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [insightCampaigns, setInsightCampaigns] = useState<InsightCampaignEff[]>([])
  const [insightWasted, setInsightWasted] = useState<InsightWasted[]>([])
  const [aiInsights, setAiInsights] = useState<AiInsight[]>([])

  useEffect(() => {
    if (!startDate || !endDate) return
    const fetchData = async () => {
      setLoading(true)

      const [adsRes, effRes, wastedRes, aiRes] = await Promise.all([
        supabase.from('amazon_ads').select('*').gte('date', startDate).lte('date', endDate),
        supabase.from('insight_campaign_efficiency').select('*').in('report_month', months).order('calc_acos', { ascending: false }).limit(10),
        supabase.from('insight_wasted_spend').select('*').in('report_month', months).order('total_spend', { ascending: false }).limit(5),
        supabase.from('ai_insights').select('*').eq('insight_type', 'budget_allocation').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
      ])

      setInsightCampaigns((effRes.data || []) as InsightCampaignEff[])
      setInsightWasted((wastedRes.data || []) as InsightWasted[])
      setAiInsights((aiRes.data || []) as AiInsight[])

      const data = adsRes.data
      const deduped = (() => {
        const map: Record<string, AdRow> = {}
        ;(data as AdRow[] || []).forEach(r => {
          const key = `${r.date}|${r.campaign_name}|${r.report_type}`
          if (!map[key] || r.id > map[key].id) map[key] = r
        })
        return Object.values(map)
      })()
      setRawData(deduped)
      setLoading(false)
    }
    fetchData()
  }, [startDate, endDate, months])

  const updateInsightStatus = async (id: number, status: 'applied' | 'dismissed') => {
    await supabase.from('ai_insights').update({ status }).eq('id', id)
    setAiInsights(prev => prev.filter(i => i.id !== id))
  }

  const kpis = useMemo(() => {
    const totalSpend = rawData.reduce((s, r) => s + Number(r.spend), 0)
    const totalSales = rawData.reduce((s, r) => s + Number(r.sales), 0)
    const totalClicks = rawData.reduce((s, r) => s + Number(r.clicks), 0)
    const totalOrders = rawData.reduce((s, r) => s + Number(r.orders_7d), 0)
    const acos = totalSales > 0 ? (totalSpend / totalSales) * 100 : 0
    const roas = totalSpend > 0 ? totalSales / totalSpend : 0
    return { totalSpend, totalSales, totalClicks, totalOrders, acos, roas }
  }, [rawData])

  const campaigns = useMemo(() => {
    const map: Record<string, CampaignAgg> = {}
    rawData.forEach(r => {
      const key = r.campaign_name
      if (!map[key]) map[key] = { campaign_name: r.campaign_name, campaign_type: r.campaign_type, status: r.status, impressions: 0, clicks: 0, spend: 0, sales: 0, orders_7d: 0, acos: 0, roas: 0 }
      map[key].impressions += Number(r.impressions); map[key].clicks += Number(r.clicks)
      map[key].spend += Number(r.spend); map[key].sales += Number(r.sales); map[key].orders_7d += Number(r.orders_7d)
    })
    Object.values(map).forEach(c => {
      c.acos = c.sales > 0 ? (c.spend / c.sales) * 100 : 0
      c.roas = c.spend > 0 ? c.sales / c.spend : 0
    })
    return Object.values(map)
  }, [rawData])

  const filtered = useMemo(() => {
    return campaigns
      .filter(c => c.campaign_name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey]
        if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
        return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      })
  }, [campaigns, search, sortKey, sortDir])

  const top10BySpend = useMemo(() => [...campaigns].sort((a, b) => b.spend - a.spend).slice(0, 10), [campaigns])
  const top10ByAcos = useMemo(() => [...campaigns].filter(c => c.acos > 0).sort((a, b) => b.acos - a.acos).slice(0, 10), [campaigns])

  const handleSort = (key: SortKey) => { if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('desc') } }
  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const maxSpendSales = Math.max(...top10BySpend.map(c => Math.max(c.spend, c.sales)), 1)
  const maxAcos = Math.max(...top10ByAcos.map(c => c.acos), 1)

  const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 10.5, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-color)', userSelect: 'none' }
  const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--bg-elevated)', whiteSpace: 'nowrap' }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Kampanya Özeti</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>Amazon Ads · {formatDateTR(startDate)} – {formatDateTR(endDate)}</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-secondary)', fontSize: 14 }}>Veriler yükleniyor...</div>
      ) : (
        <>
          {/* KPI CARDS */}
          <div className="kpi-grid-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'TOPLAM SPEND', value: `€${kpis.totalSpend.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`, color: '#f43f5e' },
              { label: 'SATIŞ', value: `€${kpis.totalSales.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`, color: '#10b981' },
              { label: 'ACOS', value: `%${kpis.acos.toFixed(1)}`, color: acosColor(kpis.acos) },
              { label: 'ROAS', value: `${kpis.roas.toFixed(2)}x`, color: '#6366f1' },
              { label: 'TIKLAMA', value: kpis.totalClicks.toLocaleString('de-DE'), color: '#a78bfa' },
              { label: 'SİPARİŞ', value: kpis.totalOrders.toLocaleString('de-DE'), color: '#f59e0b' },
            ].map((kpi, i) => (
              <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden', opacity: 0, animation: `fadeInUp 0.6s ease-out ${i * 0.1}s forwards` }}>
                <div style={{ position: 'absolute', top: 0, right: 0, width: 70, height: 70, borderRadius: '0 14px 0 70px', background: kpi.color, opacity: 0.07 }} />
                <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>{kpi.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-1px', animation: `numberCount 0.5s ease-out ${0.3 + i * 0.1}s both` }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* INSIGHT CARDS */}
          {(insightCampaigns.length > 0 || insightWasted.length > 0) && (
            <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              {insightCampaigns.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderLeft: '3px solid #f43f5e', borderRadius: 14, padding: '16px 20px', opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.5s forwards' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(244,63,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#f43f5e' }}>!</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>En Verimsiz Kampanyalar</div>
                    <div style={{ fontSize: 10, color: '#f43f5e', marginLeft: 'auto', fontWeight: 600 }}>YÜKSEK ACOS</div>
                  </div>
                  {insightCampaigns.filter(c => Number(c.calc_acos) > 40).slice(0, 3).map((c, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 2 ? '1px solid var(--bg-elevated)' : 'none' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.campaign_name}</div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                        <span style={{ color: '#f43f5e', fontWeight: 600 }}>ACOS %{Number(c.calc_acos).toFixed(1)}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>€{Number(c.total_spend).toFixed(0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {insightWasted.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderLeft: '3px solid #f59e0b', borderRadius: 14, padding: '16px 20px', opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.55s forwards' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#f59e0b' }}>$</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Boşa Harcama</div>
                    <div style={{ fontSize: 10, color: '#f59e0b', marginLeft: 'auto', fontWeight: 600 }}>€{insightWasted.reduce((s, w) => s + Number(w.total_spend), 0).toFixed(0)} TOPLAM</div>
                  </div>
                  {insightWasted.slice(0, 3).map((w, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 2 ? '1px solid var(--bg-elevated)' : 'none' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.search_term || w.campaign_name}</div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                        <span style={{ color: '#f59e0b', fontWeight: 600 }}>€{Number(w.total_spend).toFixed(2)}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{w.total_clicks} tık</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI INSIGHTS */}
          {aiInsights.length > 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.6s forwards' }}>
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

          {/* CHARTS ROW */}
          <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.65s forwards' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Spend vs Satış</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>Top 10 Kampanya</div>
              {top10BySpend.length === 0 ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>Veri yok</div> : top10BySpend.map((c, i) => {
                const spendW = (c.spend / maxSpendSales) * 100; const salesW = (c.sales / maxSpendSales) * 100
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.campaign_name.length > 45 ? c.campaign_name.substring(0, 45) + '...' : c.campaign_name}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 7, background: '#f43f5e', borderRadius: 4, width: `${Math.max(spendW, 1)}%`, marginBottom: 3, transformOrigin: 'left center', transform: 'scaleX(0)', animation: `barGrow 0.7s ease-out ${0.8 + i * 0.1}s forwards` }} />
                        <div style={{ height: 7, background: '#10b981', borderRadius: 4, width: `${Math.max(salesW, 1)}%`, transformOrigin: 'left center', transform: 'scaleX(0)', animation: `barGrow 0.7s ease-out ${0.85 + i * 0.1}s forwards` }} />
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', minWidth: 80, textAlign: 'right' }}>€{c.spend.toFixed(0)} / €{c.sales.toFixed(0)}</div>
                    </div>
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                {[{ color: '#f43f5e', label: 'Spend' }, { color: '#10b981', label: 'Satış' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}><div style={{ width: 10, height: 4, background: l.color, borderRadius: 2 }} />{l.label}</div>
                ))}
              </div>
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.75s forwards' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>ACOS Dağılımı</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>Top 10 Kampanya</div>
              {top10ByAcos.length === 0 ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>Veri yok</div> : top10ByAcos.map((c, i) => {
                const w = (c.acos / maxAcos) * 100
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }}>{c.campaign_name.length > 40 ? c.campaign_name.substring(0, 40) + '...' : c.campaign_name}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: acosColor(c.acos) }}>%{c.acos.toFixed(1)}</div>
                    </div>
                    <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4 }}>
                      <div style={{ height: '100%', width: `${Math.max(w, 1)}%`, background: acosColor(c.acos), borderRadius: 4, transformOrigin: 'left center', transform: 'scaleX(0)', animation: `barGrow 0.7s ease-out ${0.9 + i * 0.1}s forwards` }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                {[{ color: '#10b981', label: '< %25' }, { color: '#f59e0b', label: '< %40' }, { color: '#f43f5e', label: '> %40' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />{l.label}</div>
                ))}
              </div>
            </div>
          </div>

          {/* CAMPAIGN TABLE */}
          <div className="table-container" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.9s forwards' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Kampanya Detayları</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{filtered.length} kampanya</div>
              </div>
              <input type="text" placeholder="Kampanya ara..." value={search} onChange={e => setSearch(e.target.value)} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, color: 'var(--text-primary)', outline: 'none', width: 220 }} />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {([['campaign_name','Kampanya'],['campaign_type','Tür'],['status','Durum'],['impressions','Gösterim'],['clicks','Tıklama'],['spend','Spend'],['sales','Satış'],['orders_7d','Sipariş'],['acos','ACOS'],['roas','ROAS']] as [SortKey,string][]).map(([key,label]) => (
                    <th key={key} onClick={() => handleSort(key)} style={{ ...thStyle, textAlign: ['impressions','clicks','spend','sales','orders_7d','acos','roas'].includes(key) ? 'right' : 'left' }}>{label}{sortIcon(key)}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filtered.map((c, i) => (
                    <tr key={i} style={{ transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ ...tdStyle, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.campaign_name}</td>
                      <td style={tdStyle}><span style={{ background: c.campaign_type === 'Sponsored Products' ? 'rgba(99,102,241,0.12)' : c.campaign_type === 'Sponsored Brands' ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)', color: c.campaign_type === 'Sponsored Products' ? '#818cf8' : c.campaign_type === 'Sponsored Brands' ? '#f59e0b' : '#10b981', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{c.campaign_type === 'Sponsored Products' ? 'SP' : c.campaign_type === 'Sponsored Brands' ? 'SB' : c.campaign_type === 'Sponsored Display' ? 'SD' : c.campaign_type}</span></td>
                      <td style={tdStyle}><span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', marginRight: 6, background: c.status === 'ENABLED' ? '#10b981' : '#f43f5e' }} /><span style={{ fontSize: 12, color: c.status === 'ENABLED' ? 'var(--text-muted)' : 'var(--text-secondary)' }}>{c.status === 'ENABLED' ? 'Aktif' : c.status}</span></td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.impressions.toLocaleString('de-DE')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.clicks.toLocaleString('de-DE')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>€{c.spend.toFixed(2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#10b981' }}>€{c.sales.toFixed(2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.orders_7d}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: acosColor(c.acos) }}>%{c.acos.toFixed(1)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{c.roas.toFixed(2)}x</td>
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
