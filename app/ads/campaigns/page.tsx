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
  total_impressions: number; total_orders: number; calc_acos: number; cvr: number; period: string
}

interface InsightWasted {
  search_term: string; campaign_name: string; total_spend: number; total_clicks: number
  total_impressions: number; total_orders: number; period: string
}

interface AiInsight {
  id: number; insight_type: string; title: string; content: string
  priority: 'high' | 'normal' | 'low'; status: string; created_at: string
}

type SortKey = keyof CampaignAgg
type SortDir = 'asc' | 'desc'

// costBars palette for bar charts (dark→light blue-gray)
const acosBarColor = (v: number) => v < 25 ? '#B0CDDA' : v < 40 ? '#7097A8' : '#4E6A8E'
// Vivid for text/badges
const acosColor = (v: number) => v < 25 ? '#059669' : v < 40 ? '#D97706' : '#DC2626'
// Semantic badge backgrounds (green→yellow→orange→red)
const acosBadgeBg = (v: number) => v < 25 ? '#ECFDF5' : v < 35 ? '#FFFBEB' : v < 60 ? '#FFF7ED' : '#FEF2F2'

export default function CampaignsPage() {
  const { t } = useTranslation()
  const { startDate, endDate, isAllTime } = useDateRange()
  const [rawData, setRawData] = useState<AdRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('spend')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [insightCampaigns, setInsightCampaigns] = useState<InsightCampaignEff[]>([])
  const [insightWasted, setInsightWasted] = useState<InsightWasted[]>([])
  const [aiInsights, setAiInsights] = useState<AiInsight[]>([])

  useEffect(() => {
    if (!startDate || !endDate) return
    const fetchData = async () => {
      setLoading(true)

      const [adsRes, effRes, wastedRes, aiRes] = await Promise.all([
        supabase.from('amazon_ads').select('*').gte('date', startDate).lte('date', endDate),
        supabase.from('insight_campaign_efficiency').select('*').eq('period', 'last_30d').order('calc_acos', { ascending: false }).limit(10),
        supabase.from('insight_wasted_spend').select('*').eq('period', 'last_30d').order('total_spend', { ascending: false }).limit(5),
        supabase.from('ai_insights').select('*').eq('insight_type', 'budget_allocation').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
      ])

      if (adsRes.error) console.error('Campaigns adsRes error:', adsRes.error)
      if (effRes.error) console.error('Campaigns effRes error:', effRes.error)
      if (wastedRes.error) console.error('Campaigns wastedRes error:', wastedRes.error)
      console.log('Campaigns query:', { startDate, endDate, isAllTime, rowCount: adsRes.data?.length, error: adsRes.error })

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
  }, [startDate, endDate, isAllTime])

  const updateInsightStatus = async (id: number, status: 'applied' | 'dismissed') => {
    await supabase.from('ai_insights').update({ status }).eq('id', id)
    setAiInsights(prev => prev.filter(i => i.id !== id))
  }

  const kpis = useMemo(() => {
    const totalSpend = rawData.reduce((s, r) => s + Number(r.spend), 0)
    const totalSales = rawData.reduce((s, r) => s + Number(r.sales), 0)
    const totalClicks = rawData.reduce((s, r) => s + Number(r.clicks), 0)
    const totalOrders = rawData.reduce((s, r) => s + Number(r.orders_7d), 0)
    const totalImpressions = rawData.reduce((s, r) => s + Number(r.impressions), 0)
    const acos = totalSales > 0 ? (totalSpend / totalSales) * 100 : 0
    const roas = totalSpend > 0 ? totalSales / totalSpend : 0
    return { totalSpend, totalSales, totalClicks, totalOrders, totalImpressions, acos, roas }
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

  const statusOptions = useMemo(() => {
    const statuses = new Set(campaigns.map(c => c.status))
    return Array.from(statuses)
  }, [campaigns])

  const filtered = useMemo(() => {
    return campaigns
      .filter(c => statusFilter === 'all' || c.status === statusFilter)
      .filter(c => c.campaign_name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey]
        if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
        return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      })
  }, [campaigns, search, sortKey, sortDir, statusFilter])

  const top10BySpend = useMemo(() => [...campaigns].sort((a, b) => b.spend - a.spend).slice(0, 10), [campaigns])
  const top10ByAcos = useMemo(() => [...campaigns].filter(c => c.acos > 0).sort((a, b) => b.acos - a.acos).slice(0, 10), [campaigns])

  const handleSort = (key: SortKey) => { if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('desc') } }
  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  const maxSpendSales = Math.max(...top10BySpend.map(c => Math.max(c.spend, c.sales)), 1)
  const maxAcos = Math.max(...top10ByAcos.map(c => c.acos), 1)

  const thStyle: React.CSSProperties = { ...TH_STYLE, padding: '12px 16px', textAlign: 'left', cursor: 'pointer', borderBottom: `2px solid ${COLORS.border}`, userSelect: 'none' }
  const tdStyle: React.CSSProperties = { padding: '11px 16px', fontSize: 13, color: '#475569', borderBottom: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap' }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: COLORS.text }}>{t("adsCampaigns.title")}</h1>
          <p style={{ fontSize: 12, color: COLORS.sub, marginTop: 3 }}>Amazon Ads · {formatDateTR(startDate)} – {formatDateTR(endDate)}</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: COLORS.sub, fontSize: 14 }}>{t("ads.loadingData")}</div>
      ) : (
        <>
          {/* KPI CARDS */}
          <div className="grid-6" style={{ marginBottom: 20 }}>
            <KpiCard label={t("ads.totalSpend")} value={`€${kpis.totalSpend.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`} change={`${campaigns.length} ${t("adsCampaigns.campaigns")}`} icon={KpiIcons.spend} color={COLORS.red} light="#FECACA" iconBg="#FEF2F2" bars={[50, 55, 60, 62, 65, 68, 72]} />
            <KpiCard label={t("ads.sales")} value={`€${kpis.totalSales.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`} change={`${kpis.totalOrders} orders`} up icon={KpiIcons.sales} color={COLORS.green} light="#A7F3D0" iconBg="#ECFDF5" bars={[85, 80, 75, 72, 68, 65, 60]} />
            <KpiCard label={t("ads.acos")} value={`%${kpis.acos.toFixed(1)}`} change={`target %35`} up={kpis.acos <= 35} icon={KpiIcons.acos} color={COLORS.orange} light="#FDE68A" iconBg="#FFFBEB" bars={[40, 45, 48, 50, 52, 55, 58]} />
            <KpiCard label={t("ads.roas")} value={`${kpis.roas.toFixed(2)}x`} change={`target 2.5x`} up={kpis.roas >= 2.5} icon={KpiIcons.roas} color={COLORS.accent} light="#C7D2FE" iconBg="#EEF2FF" bars={[75, 70, 65, 60, 58, 55, 52]} />
            <KpiCard label={t("ads.clicks")} value={kpis.totalClicks.toLocaleString('de-DE')} change={`CTR %${kpis.totalClicks > 0 && kpis.totalImpressions > 0 ? ((kpis.totalClicks / kpis.totalImpressions) * 100).toFixed(2) : '0'}`} icon={KpiIcons.clicks} color={COLORS.accent} light="#C7D2FE" iconBg="#EEF2FF" bars={[40, 45, 50, 55, 60, 65, 72]} />
            <KpiCard label={t("ads.impressions")} value={kpis.totalImpressions >= 1000000 ? `${(kpis.totalImpressions / 1000000).toFixed(1)}M` : kpis.totalImpressions.toLocaleString('de-DE')} change={`${campaigns.length} ${t("adsCampaigns.campaigns")}`} icon={KpiIcons.impressions} color="#7097A8" light="#B0CDDA" iconBg="#F0F7FA" bars={[60, 65, 70, 68, 72, 75, 78]} />
          </div>

          {/* INSIGHT CARDS */}
          {(insightCampaigns.length > 0 || insightWasted.length > 0) && (
            <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              {insightCampaigns.length > 0 && (
                <div style={{ ...CARD_STYLE, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(244,63,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#f43f5e' }}>!</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{t("adsCampaigns.leastEfficient")}</div>
                    <div style={{ fontSize: 10, color: '#f43f5e', marginLeft: 'auto', fontWeight: 600 }}>HIGH ACOS</div>
                  </div>
                  {insightCampaigns.filter(c => Number(c.calc_acos) > 40).slice(0, 3).map((c, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 2 ? `1px solid ${COLORS.border}` : 'none' }}>
                      <div style={{ fontSize: 12, color: '#475569', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.campaign_name}</div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                        <span style={{ color: '#f43f5e', fontWeight: 600 }}>ACOS %{Number(c.calc_acos).toFixed(1)}</span>
                        <span style={{ color: COLORS.sub }}>€{Number(c.total_spend).toFixed(0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {insightWasted.length > 0 && (
                <div style={{ ...CARD_STYLE, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#f59e0b' }}>$</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>Wasted Spend</div>
                    <div style={{ fontSize: 10, color: '#f59e0b', marginLeft: 'auto', fontWeight: 600 }}>€{insightWasted.reduce((s, w) => s + Number(w.total_spend), 0).toFixed(0)} TOTAL</div>
                  </div>
                  {insightWasted.slice(0, 3).map((w, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 2 ? `1px solid ${COLORS.border}` : 'none' }}>
                      <div style={{ fontSize: 12, color: '#475569', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.search_term || w.campaign_name}</div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                        <span style={{ color: '#f59e0b', fontWeight: 600 }}>€{Number(w.total_spend).toFixed(2)}</span>
                        <span style={{ color: COLORS.sub }}>{w.total_clicks} clicks</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI INSIGHTS */}
          {aiInsights.length > 0 && (
            <AIInsights
              title={t("adsCampaigns.aiTitle")}
              subtitle={t("adsCampaigns.aiSubtitle")}
              insights={aiInsights.map(ins => ({
                type: ins.priority === 'high' ? 'CRITICAL' : ins.priority === 'normal' ? 'OPTIMIZATION' : 'INFO',
                title: ins.title,
                desc: ins.content,
                color: ins.priority === 'high' ? COLORS.red : ins.priority === 'normal' ? COLORS.orange : COLORS.green,
              }))}
            />
          )}

          {/* CHARTS ROW */}
          <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div style={{ ...CARD_STYLE, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: COLORS.text }}>{t("adsCampaigns.spendVsSales")}</div>
              <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 16 }}>{t("adsCampaigns.top10")}</div>
              {top10BySpend.length === 0 ? <div style={{ textAlign: 'center', padding: 30, color: COLORS.sub }}>No data</div> : top10BySpend.map((c, i) => {
                const spendW = (c.spend / maxSpendSales) * 100; const salesW = (c.sales / maxSpendSales) * 100
                return (
                  <div key={i} style={{ minHeight: 38, marginBottom: 4 }}>
                    <div style={{ fontSize: 11, color: '#475569', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.campaign_name.length > 45 ? c.campaign_name.substring(0, 45) + '...' : c.campaign_name}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 6, background: '#4E6A8E', borderRadius: 4, width: `${Math.max(spendW, 1)}%`, marginBottom: 2, transformOrigin: 'left center', transform: 'scaleX(0)', animation: `barGrow 0.7s ease-out ${0.8 + i * 0.1}s forwards` }} />
                        <div style={{ height: 6, background: '#B0CDDA', borderRadius: 4, width: `${Math.max(salesW, 1)}%`, transformOrigin: 'left center', transform: 'scaleX(0)', animation: `barGrow 0.7s ease-out ${0.85 + i * 0.1}s forwards` }} />
                      </div>
                      <div style={{ fontSize: 10, color: COLORS.sub, minWidth: 80, textAlign: 'right' }}>€{c.spend.toFixed(0)} / €{c.sales.toFixed(0)}</div>
                    </div>
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                {[{ color: '#4E6A8E', label: 'Spend' }, { color: '#B0CDDA', label: 'Sales' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLORS.sub }}><div style={{ width: 10, height: 4, background: l.color, borderRadius: 2 }} />{l.label}</div>
                ))}
              </div>
            </div>
            <div style={{ ...CARD_STYLE, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: COLORS.text }}>{t("adsCampaigns.acosDistribution")}</div>
              <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 16 }}>{t("adsCampaigns.top10")}</div>
              {top10ByAcos.length === 0 ? <div style={{ textAlign: 'center', padding: 30, color: COLORS.sub }}>No data</div> : top10ByAcos.map((c, i) => {
                const w = (c.acos / maxAcos) * 100
                return (
                  <div key={i} style={{ minHeight: 38, marginBottom: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <div style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }}>{c.campaign_name.length > 40 ? c.campaign_name.substring(0, 40) + '...' : c.campaign_name}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: acosColor(c.acos) }}>%{c.acos.toFixed(1)}</div>
                    </div>
                    <div style={{ height: 14, background: COLORS.border, borderRadius: 4 }}>
                      <div style={{ height: '100%', width: `${Math.max(w, 1)}%`, background: acosBarColor(c.acos), borderRadius: 4, transformOrigin: 'left center', transform: 'scaleX(0)', animation: `barGrow 0.7s ease-out ${0.9 + i * 0.1}s forwards` }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                {[{ color: '#B0CDDA', label: '< %25' }, { color: '#7097A8', label: '< %40' }, { color: '#4E6A8E', label: '> %40' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: COLORS.sub }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />{l.label}</div>
                ))}
              </div>
            </div>
          </div>

          {/* CAMPAIGN TABLE */}
          <div className="table-container" style={{ ...CARD_STYLE, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderBottom: `1px solid ${COLORS.border}` }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {[{ key: 'all', label: t("common.all") }, ...statusOptions.map(s => ({ key: s, label: s === 'ENABLED' ? t("common.active") : s === 'PAUSED' ? t("common.paused") : s === 'ARCHIVED' ? t("common.archived") : s }))].map(opt => {
                  const count = opt.key === 'all' ? campaigns.length : campaigns.filter(c => c.status === opt.key).length
                  return (
                    <button key={opt.key} onClick={() => setStatusFilter(opt.key)} style={{
                      padding: '6px 14px', fontSize: 12, borderRadius: 20, cursor: 'pointer', fontWeight: statusFilter === opt.key ? 600 : 400,
                      background: statusFilter === opt.key ? COLORS.text : COLORS.bg,
                      color: statusFilter === opt.key ? '#fff' : '#475569',
                      border: statusFilter === opt.key ? `1px solid ${COLORS.text}` : `1px solid ${COLORS.border}`,
                      transition: 'all 0.15s',
                    }}>{opt.label} ({count})</button>
                  )
                })}
              </div>
              <input type="text" placeholder={t("adsCampaigns.searchCampaigns")} value={search} onChange={e => setSearch(e.target.value)} style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '7px 14px', fontSize: 12.5, color: COLORS.text, outline: 'none', width: 220 }} />
            </div>
            <div className="modern-scroll" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {([['campaign_name',t("ads.campaign")],['campaign_type',t("adsCampaigns.type")],['status',t("ads.status")],['impressions',t("ads.impressions")],['clicks',t("ads.clicks")],['spend',t("ads.spend")],['sales',t("ads.sales")],['orders_7d',t("ads.orders")],['acos','ACOS'],['roas','ROAS']] as [SortKey,string][]).map(([key,label], i) => (
                    <th key={key} onClick={() => handleSort(key)} style={{ ...thStyle, textAlign: ['impressions','clicks','spend','sales','orders_7d','acos','roas'].includes(key) ? 'right' : 'left', paddingLeft: i === 0 ? 24 : 16, paddingRight: i === 9 ? 24 : 16 }}>{label}{sortIcon(key)}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filtered.map((c, i) => (
                    <tr key={i} style={{ transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ ...tdStyle, paddingLeft: 24, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>{c.campaign_name}</td>
                      <td style={tdStyle}><span style={{ background: c.campaign_type === 'Sponsored Products' ? 'rgba(99,102,241,0.12)' : c.campaign_type === 'Sponsored Brands' ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)', color: c.campaign_type === 'Sponsored Products' ? '#818cf8' : c.campaign_type === 'Sponsored Brands' ? '#f59e0b' : '#10b981', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{c.campaign_type === 'Sponsored Products' ? 'SP' : c.campaign_type === 'Sponsored Brands' ? 'SB' : c.campaign_type === 'Sponsored Display' ? 'SD' : c.campaign_type}</span></td>
                      <td style={tdStyle}><span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', marginRight: 6, background: c.status === 'ENABLED' ? COLORS.green : c.status === 'PAUSED' ? COLORS.orange : COLORS.sub }} /><span style={{ fontSize: 12, color: COLORS.sub }}>{c.status === 'ENABLED' ? t("common.active") : c.status === 'PAUSED' ? t("common.paused") : c.status === 'ARCHIVED' ? t("common.archived") : c.status}</span></td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#475569' }}>{c.impressions.toLocaleString('de-DE')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#475569' }}>{c.clicks.toLocaleString('de-DE')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: COLORS.text }}>€{c.spend.toFixed(0)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: COLORS.green }}>€{c.sales.toFixed(0)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#475569' }}>{c.orders_7d}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: acosBadgeBg(c.acos), color: acosColor(c.acos) }}>
                          {c.acos > 0 ? `%${c.acos.toFixed(1)}` : '—'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', paddingRight: 24, fontWeight: 600, color: c.roas >= 2 ? COLORS.green : c.roas > 0 ? COLORS.red : COLORS.sub }}>{c.roas > 0 ? `${c.roas.toFixed(2)}x` : '—'}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={10} style={{ ...tdStyle, textAlign: 'center', color: COLORS.sub, padding: 30 }}>{search ? t("common.noResults") : t("common.noDataRange")}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
