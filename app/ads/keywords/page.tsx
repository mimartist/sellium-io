'use client'

import { createClient } from '@supabase/supabase-js'
import { useEffect, useState, useMemo } from 'react'
import { useDateRange, formatDateTR } from '../DateRangeContext'

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

const acosColor = (v: number) => v < 25 ? '#10b981' : v < 40 ? '#f59e0b' : '#f43f5e'
const priorityColor = (p: string) => p === 'high' ? '#f43f5e' : p === 'normal' ? '#f59e0b' : '#10b981'
const priorityBg = (p: string) => p === 'high' ? 'rgba(244,63,94,0.12)' : p === 'normal' ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)'

export default function KeywordsPage() {
  const { startDate, endDate } = useDateRange()
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
  }, [startDate, endDate])

  const updateInsightStatus = async (id: number, status: 'applied' | 'dismissed') => {
    await supabase.from('ai_insights').update({ status }).eq('id', id)
    setAiInsights(prev => prev.filter(i => i.id !== id))
  }

  const kpis = useMemo(() => {
    const uniqueTerms = new Set(rawData.map(r => r.search_term)).size
    const totalSpend = rawData.reduce((s, r) => s + Number(r.spend), 0)
    const totalClicks = rawData.reduce((s, r) => s + Number(r.clicks), 0)
    const totalOrders = rawData.reduce((s, r) => s + Number(r.orders_7d), 0)
    const avgCvr = totalClicks > 0 ? (totalOrders / totalClicks) * 100 : 0
    return { uniqueTerms, totalSpend, avgCvr, totalClicks }
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

  const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 10.5, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-color)', userSelect: 'none' }
  const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--bg-elevated)', whiteSpace: 'nowrap' }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Arama Terimi Analizi</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>Search Terms · {formatDateTR(startDate)} – {formatDateTR(endDate)}</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-secondary)', fontSize: 14 }}>Veriler yükleniyor...</div>
      ) : (
        <>
          {/* KPI CARDS */}
          <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'TOPLAM KEYWORD', value: kpis.uniqueTerms.toLocaleString('de-DE'), color: '#6366f1' },
              { label: 'TOPLAM SPEND', value: `€${kpis.totalSpend.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`, color: '#f43f5e' },
              { label: 'ORT. CVR', value: `%${kpis.avgCvr.toFixed(1)}`, color: '#10b981' },
              { label: 'TOPLAM TIKLAMA', value: kpis.totalClicks.toLocaleString('de-DE'), color: '#a78bfa' },
            ].map((kpi, i) => (
              <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '14px 16px', position: 'relative', overflow: 'hidden', opacity: 0, animation: `fadeInUp 0.6s ease-out ${i * 0.1}s forwards` }}>
                <div style={{ position: 'absolute', top: 0, right: 0, width: 50, height: 50, borderRadius: '0 14px 0 50px', background: kpi.color, opacity: 0.07 }} />
                <div style={{ fontSize: 9.5, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{kpi.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px', animation: `numberCount 0.5s ease-out ${0.3 + i * 0.1}s both` }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* INSIGHT CARDS */}
          {(insightNeg.length > 0 || insightWasted.length > 0) && (
            <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              {insightNeg.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderLeft: '3px solid #f43f5e', borderRadius: 14, padding: '16px 20px', opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.45s forwards' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(244,63,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#f43f5e' }}>✕</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Negatif Keyword Adayları</div>
                    <div style={{ fontSize: 10, color: '#f43f5e', marginLeft: 'auto', fontWeight: 700, background: 'rgba(244,63,94,0.12)', padding: '2px 8px', borderRadius: 4 }}>{insightNeg.length} ADAY</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>Tıklama ≥ 3, sipariş = 0, spend &gt; €2</div>
                  {insightNeg.slice(0, 4).map((n, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: i < 3 ? '1px solid var(--bg-elevated)' : 'none' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.search_term}</div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                        <span style={{ color: '#f43f5e', fontWeight: 600 }}>€{Number(n.total_spend).toFixed(2)}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{n.total_clicks} tık</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {insightWasted.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderLeft: '3px solid #f59e0b', borderRadius: 14, padding: '16px 20px', opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.5s forwards' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#f59e0b' }}>$</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>En Çok Para Yakan</div>
                    <div style={{ fontSize: 10, color: '#f59e0b', marginLeft: 'auto', fontWeight: 600 }}>€{insightWasted.reduce((s, w) => s + Number(w.total_spend), 0).toFixed(0)} BOŞA HARCAMA</div>
                  </div>
                  {insightWasted.slice(0, 3).map((w, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 2 ? '1px solid var(--bg-elevated)' : 'none' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.search_term}</div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                        <span style={{ color: '#f59e0b', fontWeight: 600 }}>€{Number(w.total_spend).toFixed(2)}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{w.total_clicks} tık · 0 sipariş</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Arama Terimleri</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{filtered.length} terim</div>
              </div>
              <input type="text" placeholder="Terim ara..." value={search} onChange={e => setSearch(e.target.value)} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, color: 'var(--text-primary)', outline: 'none', width: 220 }} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {[
                { key: 'all', label: 'Tümü', count: termData.length, color: '#6366f1' },
                { key: 'negative', label: 'Negatif Adaylar', count: negCount, color: '#f43f5e' },
                { key: 'converting', label: 'Dönüşüm Sağlayanlar', count: convCount, color: '#10b981' },
              ].map(opt => (
                <button key={opt.key} onClick={() => setTermFilter(opt.key)} style={{
                  padding: '5px 12px', fontSize: 11.5, borderRadius: 6, cursor: 'pointer', fontWeight: termFilter === opt.key ? 600 : 400,
                  background: termFilter === opt.key ? `${opt.color}18` : 'var(--bg-elevated)',
                  color: termFilter === opt.key ? opt.color : 'var(--text-secondary)',
                  border: termFilter === opt.key ? `1px solid ${opt.color}4d` : '1px solid var(--border-color)',
                  transition: 'all 0.15s',
                }}>{opt.label} ({opt.count})</button>
              ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {([['search_term','Arama Terimi'],['impressions','Gösterim'],['clicks','Tıklama'],['spend','Spend'],['sales','Satış'],['orders','Sipariş'],['acos','ACOS'],['cvr','CVR']] as [SortKey,string][]).map(([key,label]) => (
                    <th key={key} onClick={() => handleSort(key)} style={{ ...thStyle, textAlign: key !== 'search_term' ? 'right' : 'left' }}>{label}{sortIcon(key)}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filtered.map((t, i) => {
                    const neg = isNegativeCandidate(t)
                    return (
                      <tr key={i} style={{ transition: 'background 0.15s', background: neg ? 'rgba(244,63,94,0.04)' : 'transparent' }} onMouseEnter={e => (e.currentTarget.style.background = neg ? 'rgba(244,63,94,0.08)' : 'rgba(99,102,241,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = neg ? 'rgba(244,63,94,0.04)' : 'transparent')}>
                        <td style={{ ...tdStyle, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{neg && <span style={{ color: '#f43f5e', marginRight: 6, fontSize: 10, fontWeight: 700 }}>NEG</span>}{t.search_term}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{t.impressions.toLocaleString('de-DE')}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{t.clicks.toLocaleString('de-DE')}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>€{t.spend.toFixed(2)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#10b981' }}>€{t.sales.toFixed(2)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{t.orders}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: t.acos > 0 ? acosColor(t.acos) : 'var(--text-secondary)' }}>{t.acos > 0 ? `%${t.acos.toFixed(1)}` : '-'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: t.cvr > 0 ? '#10b981' : '#f43f5e' }}>%{t.cvr.toFixed(1)}</td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)', padding: 30 }}>{search ? 'Sonuç bulunamadı' : 'Bu tarih aralığı için veri yok'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
