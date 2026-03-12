'use client'

import { createClient } from '@supabase/supabase-js'
import { useEffect, useState, useMemo } from 'react'
import { useDateRange, formatDateTR } from '../DateRangeContext'
import { COLORS, CARD_STYLE, TH_STYLE } from '@/lib/design-tokens'
import KpiCard from '@/components/ui/KpiCard'
import { KpiIcons } from '@/components/ui/KpiIcons'
import AIInsights from '@/components/ui/AIInsights'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface SearchTermRow {
  id: number; date: string; campaign_name: string; ad_group: string; keyword: string
  match_type: string; search_term: string; impressions: number; clicks: number; ctr: number
  cpc: number; spend: number; sales_7d: number; orders_7d: number; acos: number; roas: number; conversion_rate: number
}

interface TermAgg {
  search_term: string; impressions: number; clicks: number; spend: number; sales: number
  orders: number; acos: number; cvr: number; campaignCount: number
}

interface InsightNegKw {
  search_term: string; campaign_name: string; keyword: string; match_type: string
  total_spend: number; total_clicks: number; total_impressions: number; total_orders: number; period: string
}

interface InsightWasted {
  search_term: string; campaign_name: string; total_spend: number; total_clicks: number
  total_impressions: number; total_orders: number; period: string
}

interface AiInsight {
  id: number; insight_type: string; title: string; content: string
  priority: 'high' | 'normal' | 'low'; status: string; created_at: string
}

type SortKey = keyof TermAgg
type SortDir = 'asc' | 'desc'

// Vivid for text/badges
const acosColor = (v: number) => v < 25 ? '#059669' : v < 40 ? '#D97706' : '#DC2626'
// Semantic badge backgrounds
const acosBadgeBg = (v: number) => v < 25 ? '#ECFDF5' : v < 35 ? '#FFFBEB' : v < 60 ? '#FFF7ED' : '#FEF2F2'

export default function KeywordsPage() {
  const { startDate, endDate, isAllTime } = useDateRange()
  const [rawData, setRawData] = useState<SearchTermRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('spend')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [termFilter, setTermFilter] = useState<string>('all')
  const [insightNeg, setInsightNeg] = useState<InsightNegKw[]>([])
  const [insightWasted, setInsightWasted] = useState<InsightWasted[]>([])
  const [aiInsights, setAiInsights] = useState<AiInsight[]>([])

  useEffect(() => {
    if (!startDate || !endDate) return
    const fetchData = async () => {
      setLoading(true)

      const [stRes, negRes, wastedRes, aiRes] = await Promise.all([
        supabase.from('ad_search_terms').select('*').gte('date', startDate).lte('date', endDate),
        supabase.from('insight_negative_keyword_candidates').select('*').eq('period', 'last_30d').order('total_spend', { ascending: false }).limit(20),
        supabase.from('insight_wasted_spend').select('*').eq('period', 'last_30d').order('total_spend', { ascending: false }).limit(5),
        supabase.from('ai_insights').select('*').in('insight_type', ['negative_keywords', 'wasted_spend']).eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
      ])

      setInsightNeg((negRes.data || []) as InsightNegKw[])
      setInsightWasted((wastedRes.data || []) as InsightWasted[])
      setAiInsights((aiRes.data || []) as AiInsight[])

      const data = stRes.data
      const deduped = (() => {
        const map: Record<string, SearchTermRow> = {}
        ;(data as SearchTermRow[] || []).forEach(r => {
          const key = `${r.date}|${r.campaign_name}|${r.ad_group}|${r.search_term}`
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
    const uniqueTerms = new Set(rawData.map(r => r.search_term)).size
    const totalSpend = rawData.reduce((s, r) => s + Number(r.spend), 0)
    const totalClicks = rawData.reduce((s, r) => s + Number(r.clicks), 0)
    const totalOrders = rawData.reduce((s, r) => s + Number(r.orders_7d), 0)
    const totalImpressions = rawData.reduce((s, r) => s + Number(r.impressions), 0)
    const avgCvr = totalClicks > 0 ? (totalOrders / totalClicks) * 100 : 0
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
    return { uniqueTerms, totalSpend, avgCvr, totalClicks, totalOrders, ctr }
  }, [rawData])

  const termData = useMemo(() => {
    const map: Record<string, TermAgg> = {}
    rawData.forEach(r => {
      const key = r.search_term
      if (!map[key]) map[key] = { search_term: r.search_term, impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, acos: 0, cvr: 0, campaignCount: 0 }
      map[key].impressions += Number(r.impressions); map[key].clicks += Number(r.clicks)
      map[key].spend += Number(r.spend); map[key].sales += Number(r.sales_7d)
      map[key].orders += Number(r.orders_7d); map[key].campaignCount++
    })
    Object.values(map).forEach(t => {
      t.acos = t.sales > 0 ? (t.spend / t.sales) * 100 : 0
      t.cvr = t.clicks > 0 ? (t.orders / t.clicks) * 100 : 0
    })
    return Object.values(map)
  }, [rawData])

  const filtered = useMemo(() => {
    return termData
      .filter(t => {
        if (termFilter === 'negative') return t.cvr === 0 && t.spend > 0
        if (termFilter === 'converting') return t.orders > 0
        return true
      })
      .filter(t => t.search_term.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey]
        if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
        return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      })
  }, [termData, search, sortKey, sortDir, termFilter])

  const handleSort = (key: SortKey) => { if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('desc') } }
  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'
  const isNegativeCandidate = (t: TermAgg) => t.cvr === 0 && t.spend > 0
  const negCount = useMemo(() => termData.filter(t => t.cvr === 0 && t.spend > 0).length, [termData])
  const convCount = useMemo(() => termData.filter(t => t.orders > 0).length, [termData])

  const thStyle: React.CSSProperties = { ...TH_STYLE, padding: '12px 16px', textAlign: 'left', cursor: 'pointer', borderBottom: `2px solid ${COLORS.border}`, userSelect: 'none' }
  const tdStyle: React.CSSProperties = { padding: '11px 16px', fontSize: 13, color: '#475569', borderBottom: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap' }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: COLORS.text }}>Search Term Analysis</h1>
          <p style={{ fontSize: 12, color: COLORS.sub, marginTop: 3 }}>Search Terms · {formatDateTR(startDate)} – {formatDateTR(endDate)}</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: COLORS.sub, fontSize: 14 }}>Loading data...</div>
      ) : (
        <>
          {/* KPI CARDS */}
          <div className="grid-4" style={{ marginBottom: 20 }}>
            <KpiCard label="TOPLAM KEYWORD" value={kpis.uniqueTerms.toLocaleString('de-DE')} change={`${Math.round(kpis.uniqueTerms / 30)} terim/gün`} up icon={KpiIcons.impressions} color={COLORS.accent} light="#C7D2FE" iconBg="#EEF2FF" bars={[40, 50, 55, 60, 65, 70, 75]} />
            <KpiCard label="TOPLAM SPEND" value={`€${kpis.totalSpend.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`} change={`${kpis.uniqueTerms} terim`} icon={KpiIcons.spend} color={COLORS.red} light="#FECACA" iconBg="#FEF2F2" bars={[50, 55, 60, 62, 65, 68, 72]} />
            <KpiCard label="ORT. CVR" value={`%${kpis.avgCvr.toFixed(1)}`} change={`${kpis.totalOrders} dönüşüm`} up={kpis.avgCvr > 5} icon={KpiIcons.acos} color={COLORS.green} light="#A7F3D0" iconBg="#ECFDF5" bars={[60, 65, 58, 62, 55, 50, 48]} />
            <KpiCard label="TOPLAM TIKLAMA" value={kpis.totalClicks.toLocaleString('de-DE')} change={`CTR %${kpis.ctr.toFixed(2)}`} up icon={KpiIcons.clicks} color="#7C3AED" light="#DDD6FE" iconBg="#F5F3FF" bars={[45, 50, 55, 60, 58, 62, 68]} />
          </div>

          {/* INSIGHT CARDS */}
          {(insightNeg.length > 0 || insightWasted.length > 0) && (
            <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              {insightNeg.length > 0 && (
                <div style={{ ...CARD_STYLE, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(244,63,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#f43f5e' }}>✕</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>Negatif Keyword Adayları</div>
                    <div style={{ fontSize: 10, color: '#f43f5e', marginLeft: 'auto', fontWeight: 700, background: 'rgba(244,63,94,0.08)', padding: '2px 8px', borderRadius: 4 }}>{insightNeg.length} ADAY</div>
                  </div>
                  {insightNeg.slice(0, 5).map((n, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: i < 4 ? `1px solid ${COLORS.border}` : 'none' }}>
                      <div style={{ fontSize: 12, color: '#475569', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.search_term}</div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                        <span style={{ color: '#f43f5e', fontWeight: 600 }}>€{Number(n.total_spend).toFixed(2)}</span>
                        <span style={{ color: COLORS.sub }}>{n.total_clicks} tık</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {insightWasted.length > 0 && (
                <div style={{ ...CARD_STYLE, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#10b981' }}>↑</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>Dönüşüm Sağlayanlar</div>
                    <div style={{ fontSize: 10, color: '#10b981', marginLeft: 'auto', fontWeight: 600 }}>{insightWasted.filter(w => Number(w.total_orders) > 0).length} TERİM</div>
                  </div>
                  {insightWasted.filter(w => Number(w.total_orders) > 0).slice(0, 4).length > 0 ? (
                    insightWasted.filter(w => Number(w.total_orders) > 0).slice(0, 4).map((w, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 3 ? `1px solid ${COLORS.border}` : 'none' }}>
                        <div style={{ fontSize: 12, color: '#475569', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.search_term}</div>
                        <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                          <span style={{ color: '#10b981', fontWeight: 600 }}>CVR %{(Number(w.total_orders) / Math.max(Number(w.total_clicks), 1) * 100).toFixed(1)}</span>
                          <span style={{ color: COLORS.sub }}>€{Number(w.total_spend).toFixed(0)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    insightWasted.slice(0, 4).map((w, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 3 ? `1px solid ${COLORS.border}` : 'none' }}>
                        <div style={{ fontSize: 12, color: '#475569', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.search_term}</div>
                        <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                          <span style={{ color: '#f59e0b', fontWeight: 600 }}>€{Number(w.total_spend).toFixed(2)}</span>
                          <span style={{ color: COLORS.sub }}>{w.total_clicks} tık</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* AI INSIGHTS */}
          {aiInsights.length > 0 && (
            <AIInsights
              title="AI Keyword Insights"
              subtitle="Negative keyword candidates and wasted spend analysis"
              insights={aiInsights.map(ins => ({
                type: ins.priority === 'high' ? 'WASTED SPEND' : ins.priority === 'normal' ? 'OPTIMIZATION' : 'INFO',
                title: ins.title,
                desc: ins.content,
                color: ins.priority === 'high' ? COLORS.red : ins.priority === 'normal' ? COLORS.orange : COLORS.green,
              }))}
            />
          )}

          {/* TABLE */}
          <div style={{ ...CARD_STYLE, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>Arama Terimleri · {filtered.length} terim</div>
              </div>
              <input type="text" placeholder="Terim ara..." value={search} onChange={e => setSearch(e.target.value)} style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '7px 14px', fontSize: 12.5, color: COLORS.text, outline: 'none', width: 220 }} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {[
                { key: 'all', label: 'Tümü', count: termData.length, color: COLORS.accent },
                { key: 'negative', label: 'Negatif Adaylar', count: negCount, color: '#f43f5e' },
                { key: 'converting', label: 'Dönüşüm', count: convCount, color: '#059669' },
              ].map(opt => (
                <button key={opt.key} onClick={() => setTermFilter(opt.key)} style={{
                  padding: '5px 14px', fontSize: 11.5, borderRadius: 20, cursor: 'pointer', fontWeight: termFilter === opt.key ? 600 : 400,
                  background: termFilter === opt.key ? `${opt.color}18` : 'transparent',
                  color: termFilter === opt.key ? opt.color : '#475569',
                  border: termFilter === opt.key ? `1px solid ${opt.color}4d` : `1px solid ${COLORS.border}`,
                  transition: 'all 0.15s',
                }}>{opt.label} ({opt.count})</button>
              ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={{ ...thStyle, textAlign: 'left', minWidth: 220 }} onClick={() => handleSort('search_term')}>Arama Terimi{sortIcon('search_term')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('impressions')}>Gösterim{sortIcon('impressions')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('clicks')}>Tıklama{sortIcon('clicks')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('spend')}>Spend{sortIcon('spend')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('sales')}>Satış{sortIcon('sales')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('orders')}>Sipariş{sortIcon('orders')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('acos')}>ACOS{sortIcon('acos')}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('cvr')}>CVR{sortIcon('cvr')}</th>
                </tr></thead>
                <tbody>
                  {filtered.map((t, i) => {
                    const neg = isNegativeCandidate(t)
                    return (
                      <tr key={i} style={{ transition: 'background 0.15s', background: neg ? 'rgba(244,63,94,0.03)' : 'transparent' }} onMouseEnter={e => (e.currentTarget.style.background = neg ? 'rgba(244,63,94,0.07)' : 'rgba(99,102,241,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = neg ? 'rgba(244,63,94,0.03)' : 'transparent')}>
                        <td style={{ ...tdStyle, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', color: COLORS.text, fontWeight: 500 }}>
                          {neg && <span style={{ display: 'inline-block', color: '#DC2626', marginRight: 8, fontSize: 9, fontWeight: 700, background: '#FEF2F2', padding: '1px 6px', borderRadius: 4, verticalAlign: 'middle' }}>NEG</span>}
                          {t.search_term}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{t.impressions.toLocaleString('de-DE')}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{t.clicks.toLocaleString('de-DE')}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: COLORS.text }}>€{t.spend.toFixed(2)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: t.sales > 0 ? '#059669' : COLORS.sub }}>{t.sales > 0 ? `€${t.sales.toFixed(2)}` : '€0'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{t.orders}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          {t.acos > 0 ? (
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, background: acosBadgeBg(t.acos), color: acosColor(t.acos), fontWeight: 600, fontSize: 12 }}>
                              %{t.acos.toFixed(1)}
                            </span>
                          ) : (
                            <span style={{ color: COLORS.sub }}>—</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          {t.cvr > 0 ? (
                            <span style={{ fontWeight: 600, color: '#059669' }}>%{t.cvr.toFixed(0)}</span>
                          ) : (
                            <span style={{ color: COLORS.sub }}>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: COLORS.sub, padding: 30 }}>{search ? 'Sonuç bulunamadı' : 'Bu tarih aralığında veri yok'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
