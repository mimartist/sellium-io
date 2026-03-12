'use client'

import { createClient } from '@supabase/supabase-js'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useDateRange, formatDateTR } from './DateRangeContext'
import { useTranslation } from '@/lib/i18n'
import KpiCard from '@/components/ui/KpiCard'
import { KpiIcons } from '@/components/ui/KpiIcons'
import AIInsights, { type Insight } from '@/components/ui/AIInsights'
import { ImgPlaceholder } from '@/components/ui/Badges'
import { useProductImages } from '@/hooks/useProductImages'
import { COLORS, CARD_STYLE, TH_STYLE } from '@/lib/design-tokens'
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const acosColor = (v: number) => v <= 25 ? COLORS.green : v <= 40 ? '#F59E0B' : v <= 60 ? '#FB923C' : COLORS.red
const ACOS_COLORS = ['#3B4F6B', '#6B83A1', '#9BB0C7', '#C4D3E0']

interface CampRow { campaign_name: string; status: string; impressions: number; clicks: number; spend: number; sales: number; orders: number; acos: number; roas: number }
interface TermRow { term: string; spend: number; clicks: number; sales: number; orders: number; acos: number; cvr: number; neg: boolean }
interface ProdRow { sku: string; asin: string; spend: number; sales: number; orders: number; acos: number; roas: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ChartTooltip = ({ active, payload, label }: any) =>
  active && payload?.length ? (
    <div style={{ background: '#1E293B', borderRadius: 8, padding: '8px 14px', boxShadow: '0 4px 12px rgba(0,0,0,.15)' }}>
      {payload.map((p: { value: number; color: string }, i: number) => (
        <div key={i} style={{ fontSize: 12, fontWeight: 600, color: p.color || '#fff' }}>€{p.value?.toLocaleString('de-DE')}</div>
      ))}
      <div style={{ fontSize: 10, color: '#94A3B8' }}>{label}</div>
    </div>
  ) : null

export default function AdsOverviewPage() {
  const { t } = useTranslation()
  const { startDate, endDate, isAllTime } = useDateRange()
  const { getBySkuWithFallback: getBySku, getByAsin, loaded: imgLoaded } = useProductImages()
  const [loading, setLoading] = useState(true)
  const [rawKpi, setRawKpi] = useState({ spend: 0, sales: 0, acos: 0, roas: 0, clicks: 0, orders: 0 })
  const [campaigns, setCampaigns] = useState<CampRow[]>([])
  const [terms, setTerms] = useState<TermRow[]>([])
  const [products, setProducts] = useState<ProdRow[]>([])
  const [spendTrend, setSpendTrend] = useState<{ m: string; sp: number; sa: number }[]>([])
  const [acosDist, setAcosDist] = useState<{ name: string; value: number; pct: string; color: string }[]>([])

  useEffect(() => {
    if (!startDate || !endDate) return
    const fetchAll = async () => {
      setLoading(true)

      const [campRes, prodRes, termRes] = await Promise.all([
        supabase.from('amazon_ads').select('*').gte('date', startDate).lte('date', endDate),
        supabase.from('ad_product_performance').select('*').gte('date', startDate).lte('date', endDate),
        supabase.from('ad_search_terms').select('*').gte('date', startDate).lte('date', endDate),
      ])

      const cRaw = campRes.data || []
      const pRaw = prodRes.data || []
      const tRaw = termRes.data || []

      // Aggregate campaigns by name
      const campMap: Record<string, CampRow> = {}
      for (const r of cRaw) {
        const key = r.campaign_name
        if (!campMap[key]) campMap[key] = { campaign_name: key, status: r.status || 'Active', impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, acos: 0, roas: 0 }
        campMap[key].impressions += Number(r.impressions || 0)
        campMap[key].clicks += Number(r.clicks || 0)
        campMap[key].spend += Number(r.spend || 0)
        campMap[key].sales += Number(r.sales || 0)
        campMap[key].orders += Number(r.orders_7d || 0)
      }
      const campList = Object.values(campMap).map(c => ({
        ...c,
        acos: c.sales > 0 ? (c.spend / c.sales) * 100 : 0,
        roas: c.spend > 0 ? c.sales / c.spend : 0,
      })).sort((a, b) => b.spend - a.spend)
      setCampaigns(campList)

      // KPIs
      const totalSpend = campList.reduce((s, c) => s + c.spend, 0)
      const totalSales = campList.reduce((s, c) => s + c.sales, 0)
      const totalClicks = campList.reduce((s, c) => s + c.clicks, 0)
      const totalOrders = campList.reduce((s, c) => s + c.orders, 0)
      const totalAcos = totalSales > 0 ? (totalSpend / totalSales) * 100 : 0
      const totalRoas = totalSpend > 0 ? totalSales / totalSpend : 0
      setRawKpi({ spend: totalSpend, sales: totalSales, acos: totalAcos, roas: totalRoas, clicks: totalClicks, orders: totalOrders })

      // Monthly spend/sales trend
      const monthMap: Record<string, { sp: number; sa: number }> = {}
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      for (const r of cRaw) {
        const d = new Date(r.date)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (!monthMap[key]) monthMap[key] = { sp: 0, sa: 0 }
        monthMap[key].sp += Number(r.spend || 0)
        monthMap[key].sa += Number(r.sales || 0)
      }
      const trend = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({
        m: monthNames[parseInt(k.split('-')[1]) - 1],
        sp: Math.round(v.sp),
        sa: Math.round(v.sa),
      }))
      setSpendTrend(trend)

      // ACOS distribution
      const ranges = [
        { name: '<%25', min: 0, max: 25 },
        { name: '%25-40', min: 25, max: 40 },
        { name: '%40-60', min: 40, max: 60 },
        { name: '>%60', min: 60, max: Infinity },
      ]
      const activeCamps = campList.filter(c => c.acos > 0)
      const dist = ranges.map((r, i) => {
        const count = activeCamps.filter(c => c.acos >= r.min && c.acos < r.max).length
        return { name: r.name, value: count, pct: activeCamps.length > 0 ? `${((count / activeCamps.length) * 100).toFixed(1)}%` : '0%', color: ACOS_COLORS[i] }
      })
      setAcosDist(dist)

      // Aggregate products by SKU
      const prodMap: Record<string, ProdRow> = {}
      for (const r of pRaw) {
        const key = r.sku || r.asin
        if (!prodMap[key]) prodMap[key] = { sku: r.sku || '', asin: r.asin || '', spend: 0, sales: 0, orders: 0, acos: 0, roas: 0 }
        prodMap[key].spend += Number(r.spend || 0)
        prodMap[key].sales += Number(r.sales_7d || 0)
        prodMap[key].orders += Number(r.orders || r.orders_7d || 0)
      }
      const prodList = Object.values(prodMap).map(p => ({
        ...p,
        acos: p.sales > 0 ? (p.spend / p.sales) * 100 : 0,
        roas: p.spend > 0 ? p.sales / p.spend : 0,
      }))
      setProducts(prodList)

      // Aggregate search terms
      const termMap: Record<string, TermRow> = {}
      for (const r of tRaw) {
        const key = r.search_term || ''
        if (!termMap[key]) termMap[key] = { term: key, spend: 0, clicks: 0, sales: 0, orders: 0, acos: 0, cvr: 0, neg: false }
        termMap[key].spend += Number(r.spend || 0)
        termMap[key].clicks += Number(r.clicks || 0)
        termMap[key].sales += Number(r.sales || r.sales_7d || 0)
        termMap[key].orders += Number(r.orders || r.orders_7d || 0)
      }
      const termList = Object.values(termMap).map(t => ({
        ...t,
        acos: t.sales > 0 ? (t.spend / t.sales) * 100 : 0,
        cvr: t.clicks > 0 ? (t.orders / t.clicks) * 100 : 0,
        neg: t.spend > 0 && t.orders === 0,
      }))
      setTerms(termList)

      setLoading(false)
    }
    fetchAll()
  }, [startDate, endDate, isAllTime])

  // Derived data for summary cards
  const inefficientCamps = useMemo(() => campaigns.filter(c => c.acos > 100).sort((a, b) => b.acos - a.acos).slice(0, 3), [campaigns])
  const wastedTerms = useMemo(() => terms.filter(t => t.neg).sort((a, b) => b.spend - a.spend).slice(0, 3), [terms])
  const bestProducts = useMemo(() => products.filter(p => p.orders > 0).sort((a, b) => a.acos - b.acos).slice(0, 3), [products])
  const topTerms = useMemo(() => terms.filter(t => t.orders > 0).sort((a, b) => b.cvr - a.cvr).slice(0, 3), [terms])
  const totalWasted = useMemo(() => terms.filter(t => t.neg).reduce((s, t) => s + t.spend, 0), [terms])
  const convertingTermCount = useMemo(() => terms.filter(t => t.orders > 0).length, [terms])
  const top5Camps = useMemo(() => campaigns.slice(0, 5), [campaigns])

  const aiInsights = useMemo<Insight[]>(() => {
    if (rawKpi.spend === 0) return []
    const insights: Insight[] = []
    if (totalWasted > 10) {
      insights.push({ type: 'WASTED SPEND', title: `€${totalWasted.toFixed(0)} wasted spend — ${terms.filter(t => t.neg).length} negative keyword candidates`, desc: 'Search terms spending without generating sales. Add as negative keywords.', color: COLORS.red })
    }
    if (inefficientCamps.length > 0) {
      insights.push({ type: 'CAMPAIGN', title: `${inefficientCamps.length} campaigns ACOS 100%+ — pause or optimize`, desc: inefficientCamps.map(c => `${c.campaign_name.substring(0, 25)} (%${c.acos.toFixed(0)})`).join(', ') + ". Lower bids or pause.", color: COLORS.orange })
    }
    if (bestProducts.length > 0 && bestProducts[0].roas > 5) {
      insights.push({ type: 'EFFICIENCY', title: `${bestProducts[0].sku} ROAS ${bestProducts[0].roas.toFixed(1)}x — increase budget`, desc: `€${bestProducts[0].spend.toFixed(0)} spend generated €${bestProducts[0].sales.toFixed(0)} sales (ACOS %${bestProducts[0].acos.toFixed(1)}). Increase daily budget.`, color: COLORS.green })
    }
    if (convertingTermCount > 0) {
      insights.push({ type: 'SEARCH TERM', title: `${convertingTermCount} converting terms — add to exact match`, desc: "Add converting terms to exact match campaigns.", color: COLORS.accent })
    }
    if (rawKpi.acos > 35) {
      insights.push({ type: 'ACOS', title: `Average ACOS %${rawKpi.acos.toFixed(1)} — target should be %35`, desc: 'Your campaigns average ACOS is above target. Optimize high ACOS campaigns.', color: COLORS.orange })
    }
    return insights
  }, [rawKpi, totalWasted, terms, inefficientCamps, bestProducts, convertingTermCount])

  const statusBadge = (s: string) => {
    const m: Record<string, { bg: string; c: string }> = { Active: { bg: '#ECFDF5', c: COLORS.green }, Paused: { bg: '#FFFBEB', c: '#D97706' }, Archived: { bg: '#F8FAFC', c: '#64748B' } }
    const x = m[s] || m.Archived
    const statusLabel: Record<string, string> = { Active: t("common.active"), Paused: t("common.paused"), Archived: t("common.archived") }
    return <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: x.bg, color: x.c, whiteSpace: 'nowrap' }}>● {statusLabel[s] || s}</span>
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, margin: 0 }}>{t("ads.title")}</h1>
          <p style={{ fontSize: 13, color: COLORS.sub, margin: '2px 0 0' }}>{t("ads.subtitle")} · {formatDateTR(startDate)} – {formatDateTR(endDate)}</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: COLORS.sub, fontSize: 14 }}>{t("ads.loadingData")}</div>
      ) : (
        <>
          {/* 6 KPI Cards */}
          <div className="grid-6" style={{ marginBottom: 20 }}>
            <KpiCard label={t("ads.totalSpend")} value={`€${rawKpi.spend.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`} icon={KpiIcons.spend} color={COLORS.red} light="#FECACA" iconBg="#FEF2F2" bars={[50, 55, 60, 62, 65, 68, 72]} />
            <KpiCard label={t("ads.sales")} value={`€${rawKpi.sales.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`} icon={KpiIcons.sales} color={COLORS.green} light="#A7F3D0" iconBg="#ECFDF5" bars={[85, 80, 75, 72, 68, 65, 60]} />
            <KpiCard label={t("ads.acos")} value={`%${rawKpi.acos.toFixed(1)}`} icon={KpiIcons.acos} color={COLORS.orange} light="#FDE68A" iconBg="#FFFBEB" bars={[40, 45, 48, 50, 52, 55, 58]} />
            <KpiCard label={t("ads.roas")} value={`${rawKpi.roas.toFixed(2)}x`} icon={KpiIcons.roas} color={COLORS.accent} light="#C7D2FE" iconBg="#EEF2FF" bars={[75, 70, 65, 60, 58, 55, 52]} />
            <KpiCard label={t("ads.clicks")} value={rawKpi.clicks.toLocaleString('de-DE')} icon={KpiIcons.clicks} color={COLORS.accent} light="#C7D2FE" iconBg="#EEF2FF" bars={[40, 45, 50, 55, 60, 65, 72]} />
            <KpiCard label={t("ads.orders")} value={rawKpi.orders.toLocaleString('de-DE')} icon={KpiIcons.orders} color={COLORS.green} light="#A7F3D0" iconBg="#ECFDF5" bars={[70, 68, 65, 62, 60, 58, 55]} />
          </div>

          {/* Charts: Spend vs Sales + ACOS Distribution */}
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div style={{ ...CARD_STYLE, padding: '18px 22px' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, marginBottom: 2 }}>{t("ads.spendVsSales")}</div>
              <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 14 }}>{t("ads.monthlyComparison")}</div>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={spendTrend} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="0" stroke={COLORS.border} vertical={false} />
                  <XAxis dataKey="m" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: COLORS.sub }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: COLORS.sub }} tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="sp" name="Spend" radius={[4, 4, 0, 0]} fill="#4E6A8E" barSize={28} />
                  <Bar dataKey="sa" name="Sales" radius={[4, 4, 0, 0]} fill="#B0CDDA" barSize={28} />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: COLORS.sub }}><div style={{ width: 10, height: 10, borderRadius: 3, background: '#4E6A8E' }} />Spend</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: COLORS.sub }}><div style={{ width: 10, height: 10, borderRadius: 3, background: '#B0CDDA' }} />Sales</div>
              </div>
            </div>
            <div style={{ ...CARD_STYLE, padding: '18px 22px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, marginBottom: 2 }}>{t("ads.acosDistribution")}</div>
              <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 12 }}>{campaigns.filter(c => c.acos > 0).length} {t("ads.campaignBased")}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, flex: 1 }}>
                <div style={{ width: 150, height: 150, flexShrink: 0, position: 'relative' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={acosDist} cx="50%" cy="50%" innerRadius={42} outerRadius={68} dataKey="value" strokeWidth={2} stroke="#fff">{acosDist.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie></PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: COLORS.sub, fontWeight: 500 }}>{t("ads.total")}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.text }}>{campaigns.filter(c => c.acos > 0).length}</div>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  {acosDist.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: i < 3 ? '1px solid #F1F5F9' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                        <div style={{ width: 4, height: 28, borderRadius: 2, background: d.color }} />
                        <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>{d.name}</span>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, width: 30, textAlign: 'right' }}>{d.value}</span>
                      <span style={{ fontSize: 12, color: COLORS.sub, width: 55, textAlign: 'right' }}>{d.pct}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* ACOS Warning Summary */}
              {(() => {
                const activeCamps = campaigns.filter(c => c.acos > 0)
                const belowTarget = activeCamps.filter(c => c.acos <= 25).length
                const critical = activeCamps.filter(c => c.acos >= 60).length
                const avgAcos = activeCamps.length > 0 ? activeCamps.reduce((s, c) => s + c.acos, 0) / activeCamps.length : 0
                return activeCamps.length > 0 ? (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: '#FFFBEB', borderRadius: 8, fontSize: 11.5, color: '#92400E', lineHeight: 1.5 }}>
                    <strong>{belowTarget}</strong> campaigns below target ACOS (≤25%), <strong>{critical}</strong> campaigns at critical level (≥60%). Average ACOS <strong>%{avgAcos.toFixed(1)}</strong> — your target should be %35.
                  </div>
                ) : null
              })()}
            </div>
          </div>

          {/* 4 Summary Cards */}
          <div className="grid-4" style={{ marginBottom: 20 }}>
            {[
              { title: t("ads.leastEfficient"), badge: t("ads.highAcos"), bc: COLORS.red, items: inefficientCamps.map(c => ({ l: c.campaign_name.length > 22 ? c.campaign_name.substring(0, 22) + '…' : c.campaign_name, r: `%${c.acos.toFixed(0)}`, r2: `€${c.spend.toFixed(0)}`, rc: COLORS.red, img: false })) },
              { title: t("ads.wastedSpend"), badge: `€${totalWasted.toFixed(0)} TOTAL`, bc: COLORS.orange, items: wastedTerms.map(t => ({ l: t.term.length > 25 ? t.term.substring(0, 25) + '…' : t.term, r: `€${t.spend.toFixed(2)}`, r2: `${t.clicks} clicks`, rc: COLORS.red, img: false })) },
              { title: t("ads.topProducts"), badge: t("ads.lowAcos"), bc: COLORS.green, items: bestProducts.map(p => { const pi = getBySku(p.sku) || getByAsin(p.asin); return { l: p.sku, r: `%${p.acos.toFixed(1)}`, r2: `€${p.sales.toFixed(0)}`, rc: COLORS.green, img: true, imgUrl: pi?.image_url || null } }) },
              { title: t("ads.topTerms"), badge: `${convertingTermCount} ${t("ads.conversions")}`, bc: COLORS.accent, items: topTerms.map(t => ({ l: t.term, r: `CVR %${t.cvr.toFixed(0)}`, r2: `€${t.sales.toFixed(0)}`, rc: COLORS.green, img: false })) },
            ].map((c, ci) => (
              <div key={ci} style={{ ...CARD_STYLE, padding: '18px 20px', minWidth: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: c.bc }} /><span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{c.title}</span></div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: c.bc, flexShrink: 0 }}>{c.badge}</span>
                </div>
                {c.items.length > 0 ? c.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < 2 ? '1px solid #F8FAFC' : 'none', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                      {it.img && ((it as any).imgUrl ? <img src={(it as any).imgUrl} alt="" style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} /> : <ImgPlaceholder size={22} />)}
                      <span style={{ fontSize: 11, color: it.img ? COLORS.accent : '#475569', fontWeight: it.img ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{it.l}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: it.rc }}>{it.r}</span>
                      <span style={{ fontSize: 10, color: COLORS.sub, whiteSpace: 'nowrap' }}>{it.r2}</span>
                    </div>
                  </div>
                )) : <div style={{ fontSize: 12, color: COLORS.sub, padding: '12px 0' }}>{t("common.noData")}</div>}
              </div>
            ))}
          </div>

          {/* AI Insights */}
          {aiInsights.length > 0 && <AIInsights title={t("ads.aiTitle")} subtitle={t("ads.aiSubtitle")} insights={aiInsights} />}

          {/* Top 5 Campaign Table */}
          {top5Camps.length > 0 && (
            <div style={{ ...CARD_STYLE, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>{t("ads.top5Campaigns")}</div>
                <Link href="/ads/campaigns" style={{ fontSize: 12, fontWeight: 600, color: COLORS.accent, textDecoration: 'none' }}>{t("common.viewAll")}</Link>
              </div>
              <div className="modern-scroll" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 850 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #F1F5F9' }}>
                      {[t("ads.campaign"), t("ads.status"), t("ads.impressions"), t("ads.clicks"), t("ads.spend"), t("ads.sales"), t("ads.orders"), 'ACOS', 'ROAS'].map((h, i) => (
                        <th key={h} style={{ ...TH_STYLE, textAlign: i === 0 ? 'left' : 'right', padding: '10px 16px', paddingLeft: i === 0 ? 24 : 16, paddingRight: i === 8 ? 24 : 16 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {top5Camps.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                        <td style={{ padding: '10px 16px 10px 24px', fontSize: 12, fontWeight: 500, color: COLORS.text, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.campaign_name}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>{statusBadge(c.status)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, color: '#475569' }}>{c.impressions.toLocaleString('de-DE')}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, color: '#475569' }}>{c.clicks}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: COLORS.text }}>€{c.spend.toFixed(0)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: COLORS.green }}>€{c.sales.toFixed(0)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, color: '#475569' }}>{c.orders}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: acosColor(c.acos) + '18', color: acosColor(c.acos) }}>
                            {c.acos > 0 ? `%${c.acos.toFixed(1)}` : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px 10px 16px', paddingRight: 24, textAlign: 'right', fontSize: 12, fontWeight: 600, color: c.roas >= 2 ? COLORS.green : c.roas > 0 ? COLORS.red : COLORS.sub }}>
                          {c.roas > 0 ? `${c.roas.toFixed(2)}x` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
