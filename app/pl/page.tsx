'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import DashboardShell from '../components/DashboardShell'
import ThemeToggle from '../components/ThemeToggle'
import LogoutButton from '../components/LogoutButton'
import {
  Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart,
} from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MARKETPLACE_OPTIONS = [
  { value: 'all', label: 'All Marketplaces', flag: '\u{1F30D}' },
  { value: 'Amazon.de', label: 'Amazon.de', flag: '\u{1F1E9}\u{1F1EA}' },
  { value: 'Amazon.fr', label: 'Amazon.fr', flag: '\u{1F1EB}\u{1F1F7}' },
  { value: 'Amazon.es', label: 'Amazon.es', flag: '\u{1F1EA}\u{1F1F8}' },
  { value: 'Amazon.it', label: 'Amazon.it', flag: '\u{1F1EE}\u{1F1F9}' },
  { value: 'Amazon.co.uk', label: 'Amazon.co.uk', flag: '\u{1F1EC}\u{1F1E7}' },
  { value: 'Amazon.nl', label: 'Amazon.nl', flag: '\u{1F1F3}\u{1F1F1}' },
  { value: 'Amazon.pl', label: 'Amazon.pl', flag: '\u{1F1F5}\u{1F1F1}' },
  { value: 'Amazon.ie', label: 'Amazon.ie', flag: '\u{1F1EE}\u{1F1EA}' },
  { value: 'Amazon.com.be', label: 'Amazon.com.be', flag: '\u{1F1E7}\u{1F1EA}' },
  { value: 'Amazon.se', label: 'Amazon.se', flag: '\u{1F1F8}\u{1F1EA}' },
]

const MARKETPLACE_FLAG_MAP: Record<string, string> = {}
MARKETPLACE_OPTIONS.forEach(m => { MARKETPLACE_FLAG_MAP[m.value] = m.flag })

interface PLMonth {
  units: number; sales: number; promo: number; refunds: number
  commission: number; fba: number; storage: number; return_mgmt: number
  digital_fba: number; digital_sell: number
  cogs: number; subscription: number
}

interface DailyRow {
  purchase_day: string; units: number; sales: number; net_profit: number
}

type DailyRange = '7d' | '14d' | 'month' | 'custom'
type SortKey = 'marketplace' | 'sales' | 'units' | 'fees' | 'adSpend' | 'cogs' | 'netProfit' | 'margin'
type SortDir = 'asc' | 'desc'

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

function getPrevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const fmtNum = (v: number) => {
  if (v < 0) return `-\u20AC${Math.abs(v).toLocaleString('de-DE', { maximumFractionDigits: 0 })}`
  return `\u20AC${v.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`
}
const fmtPct = (v: number) => `%${v.toFixed(1)}`
const pctChange = (cur: number, prev: number) => prev === 0 ? 0 : ((cur - prev) / Math.abs(prev)) * 100

const emptyPL = (): PLMonth => ({ units: 0, sales: 0, promo: 0, refunds: 0, commission: 0, fba: 0, storage: 0, return_mgmt: 0, digital_fba: 0, digital_sell: 0, cogs: 0, subscription: 0 })

export default function PLPage() {
  const monthOptions = useMemo(() => generateMonthOptions(), [])
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0])
  const [selectedMarketplace, setSelectedMarketplace] = useState('all')
  const [rawData, setRawData] = useState<any[]>([])
  const [dailyData, setDailyData] = useState<DailyRow[]>([])
  const [loading, setLoading] = useState(true)

  const [adSpend, setAdSpend] = useState({
    currentSp: 0, currentSb: 0, currentTotal: 0,
    prevSp: 0, prevSb: 0, prevTotal: 0,
  })

  const [feesExpanded, setFeesExpanded] = useState(false)
  const [adsExpanded, setAdsExpanded] = useState(false)

  const [mpSortKey, setMpSortKey] = useState<SortKey>('sales')
  const [mpSortDir, setMpSortDir] = useState<SortDir>('desc')

  const [dailyRange, setDailyRange] = useState<DailyRange>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // ========== 1. Fetch monthly_pl (one time) ==========
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data } = await supabase
        .from('monthly_pl')
        .select('report_month, marketplace, units, sales, promo, commission, fba, storage, return_mgmt, digital_fba, digital_sell, cogs, refunds, subscription')
      setRawData(data || [])
      setLoading(false)
    }
    fetchData()
  }, [])

  // ========== 2. REKLAM VER\u0130S\u0130 \u2014 RPC ile server-side SUM ==========
  useEffect(() => {
    async function fetchAdSpend() {
      const { startDate: curStart, endDate: curEnd } = getMonthRange(selectedMonth)
      const prevMonthStr = getPrevMonth(selectedMonth)
      const { startDate: prevStart, endDate: prevEnd } = getMonthRange(prevMonthStr)

      const [curRes, prevRes] = await Promise.all([
        supabase.rpc('get_ad_spend', { start_date: curStart, end_date: curEnd }),
        supabase.rpc('get_ad_spend', { start_date: prevStart, end_date: prevEnd }),
      ])

      const curRow = curRes.data?.[0] || { sp_total: 0, sb_total: 0 }
      const prevRow = prevRes.data?.[0] || { sp_total: 0, sb_total: 0 }

      const curSp = Number(curRow.sp_total) || 0
      const curSb = Number(curRow.sb_total) || 0
      const prvSp = Number(prevRow.sp_total) || 0
      const prvSb = Number(prevRow.sb_total) || 0

      setAdSpend({
        currentSp: curSp, currentSb: curSb, currentTotal: curSp + curSb,
        prevSp: prvSp, prevSb: prvSb, prevTotal: prvSp + prvSb,
      })
    }
    fetchAdSpend()
  }, [selectedMonth])

  // ========== 3. G\u00FCnl\u00FCk veri ==========
  useEffect(() => {
    async function fetchDaily() {
      let query = supabase
        .from('daily_pl')
        .select('purchase_day, units, sales, est_net_profit, marketplace')
        .eq('report_month', selectedMonth)
        .order('purchase_day')

      if (selectedMarketplace !== 'all') {
        query = query.eq('marketplace', selectedMarketplace)
      }

      const { data } = await query
      const dayMap: Record<string, DailyRow> = {}
      data?.forEach((r: any) => {
        const d = r.purchase_day
        if (!dayMap[d]) dayMap[d] = { purchase_day: d, units: 0, sales: 0, net_profit: 0 }
        dayMap[d].units += Number(r.units) || 0
        dayMap[d].sales += Number(r.sales) || 0
        dayMap[d].net_profit += Number(r.est_net_profit) || 0
      })
      setDailyData(Object.values(dayMap).sort((a, b) => a.purchase_day.localeCompare(b.purchase_day)))
    }
    fetchDaily()
    setDailyRange('month')
    setCustomStart('')
    setCustomEnd('')
  }, [selectedMonth, selectedMarketplace])

  // ========== Aggregate monthly P&L from raw data ==========
  const aggregateMonth = (month: string, marketplace: string): PLMonth => {
    let rows = rawData.filter((r: any) => r.report_month === month)
    if (marketplace !== 'all') rows = rows.filter((r: any) => r.marketplace === marketplace)

    const result = emptyPL()
    rows.forEach((r: any) => {
      result.units += Number(r.units) || 0
      result.sales += Number(r.sales) || 0
      result.promo += Number(r.promo) || 0
      result.refunds += Number(r.refunds) || 0
      result.commission += Number(r.commission) || 0
      result.fba += Number(r.fba) || 0
      result.storage += Number(r.storage) || 0
      result.return_mgmt += Number(r.return_mgmt) || 0
      result.digital_fba += Number(r.digital_fba) || 0
      result.digital_sell += Number(r.digital_sell) || 0
      result.cogs += Number(r.cogs) || 0
      result.subscription += Number(r.subscription) || 0
    })
    return result
  }

  const cur = aggregateMonth(selectedMonth, selectedMarketplace)
  const prevMonthStr = getPrevMonth(selectedMonth)
  const prev = aggregateMonth(prevMonthStr, selectedMarketplace)
  const hasPrev = prev.sales > 0

  // 2 ay \u00F6ncesi
  const prevPrevMonthStr = getPrevMonth(prevMonthStr)
  const prevPrev = aggregateMonth(prevPrevMonthStr, selectedMarketplace)

  const curTotalFees = cur.commission + cur.fba + cur.storage + cur.return_mgmt + cur.digital_fba + cur.digital_sell
  const prevTotalFees = prev.commission + prev.fba + prev.storage + prev.return_mgmt + prev.digital_fba + prev.digital_sell

  // ========== Marketplace-aware ad spend ==========
  let displayAd = adSpend.currentTotal
  let displayAdPrev = adSpend.prevTotal
  let displaySp = adSpend.currentSp
  let displaySb = adSpend.currentSb
  let displaySpPrev = adSpend.prevSp
  let displaySbPrev = adSpend.prevSb

  if (selectedMarketplace !== 'all') {
    const allCurRows = rawData.filter((r: any) => r.report_month === selectedMonth)
    const mpCurSales = allCurRows
      .filter((r: any) => r.marketplace === selectedMarketplace)
      .reduce((s: number, r: any) => s + (Number(r.sales) || 0), 0)
    const allCurSales = allCurRows.reduce((s: number, r: any) => s + (Number(r.sales) || 0), 0)
    const curRatio = allCurSales > 0 ? mpCurSales / allCurSales : 0

    displayAd = adSpend.currentTotal * curRatio
    displaySp = adSpend.currentSp * curRatio
    displaySb = adSpend.currentSb * curRatio

    const allPrevRows = rawData.filter((r: any) => r.report_month === prevMonthStr)
    const mpPrevSales = allPrevRows
      .filter((r: any) => r.marketplace === selectedMarketplace)
      .reduce((s: number, r: any) => s + (Number(r.sales) || 0), 0)
    const allPrevSales = allPrevRows.reduce((s: number, r: any) => s + (Number(r.sales) || 0), 0)
    const prevRatio = allPrevSales > 0 ? mpPrevSales / allPrevSales : 0

    displayAdPrev = adSpend.prevTotal * prevRatio
    displaySpPrev = adSpend.prevSp * prevRatio
    displaySbPrev = adSpend.prevSb * prevRatio
  }

  // ========== Net Profit ==========
  const curNetProfit = cur.sales - cur.promo - cur.refunds - curTotalFees - cur.cogs - cur.subscription - displayAd
  const prevNetProfit = prev.sales - prev.promo - prev.refunds - prevTotalFees - prev.cogs - prev.subscription - displayAdPrev
  const curMargin = cur.sales > 0 ? (curNetProfit / cur.sales) * 100 : 0
  const prevMargin = prev.sales > 0 ? (prevNetProfit / prev.sales) * 100 : 0
  const curAcos = cur.sales > 0 ? (displayAd / cur.sales) * 100 : 0
  const prevAcos = prev.sales > 0 ? (displayAdPrev / prev.sales) * 100 : 0

  // prevPrev net profit (for mini card)
  const prevPrevTotalFees = prevPrev.commission + prevPrev.fba + prevPrev.storage + prevPrev.return_mgmt + prevPrev.digital_fba + prevPrev.digital_sell
  const prevPrevNetProfit = prevPrev.sales - prevPrev.promo - prevPrev.refunds - prevPrevTotalFees - prevPrev.cogs - prevPrev.subscription

  // ========== Monthly trend chart ==========
  const allMonths = useMemo(() => {
    const set = new Set<string>()
    rawData.forEach((r: any) => set.add(r.report_month))
    return [...set].sort()
  }, [rawData])

  const monthlyChartData = allMonths.map(m => {
    const d = aggregateMonth(m, selectedMarketplace)
    const fees = d.commission + d.fba + d.storage + d.return_mgmt + d.digital_fba + d.digital_sell
    let ad = 0
    if (m === selectedMonth) ad = displayAd
    else if (m === prevMonthStr) ad = displayAdPrev
    const net = d.sales - d.promo - d.refunds - fees - d.cogs - d.subscription - ad
    return { month: m.substring(2), sales: Math.round(d.sales), netProfit: Math.round(net) }
  })

  // ========== Daily chart ==========
  const filteredDailyData = useMemo(() => {
    if (dailyData.length === 0) return []
    if (dailyRange === 'month') return dailyData
    if (dailyRange === 'custom' && customStart && customEnd) {
      return dailyData.filter(d => d.purchase_day >= customStart && d.purchase_day <= customEnd)
    }
    const lastDay = dailyData[dailyData.length - 1]?.purchase_day
    if (!lastDay) return dailyData
    const lastDate = new Date(lastDay)
    const days = dailyRange === '7d' ? 7 : 14
    const cutoff = new Date(lastDate)
    cutoff.setDate(cutoff.getDate() - days + 1)
    const cutoffStr = cutoff.toISOString().substring(0, 10)
    return dailyData.filter(d => d.purchase_day >= cutoffStr)
  }, [dailyData, dailyRange, customStart, customEnd])

  const dailyChartData = filteredDailyData.map(d => ({
    day: d.purchase_day.substring(8),
    sales: Math.round(d.sales),
    netProfit: Math.round(d.net_profit),
  }))

  // ========== Marketplace breakdown ==========
  const mpGrouped = useMemo(() => {
    const filtered = rawData.filter((r: any) => r.report_month === selectedMonth)
    const totalSales = filtered.reduce((s: number, r: any) => s + (Number(r.sales) || 0), 0)

    const grouped: Record<string, { marketplace: string; units: number; sales: number; fees: number; adSpend: number; cogs: number; refunds: number; netProfit: number; margin: number }> = {}
    filtered.forEach((r: any) => {
      const mp = r.marketplace || 'Unknown'
      if (!grouped[mp]) grouped[mp] = { marketplace: mp, units: 0, sales: 0, fees: 0, adSpend: 0, cogs: 0, refunds: 0, netProfit: 0, margin: 0 }
      grouped[mp].units += Number(r.units) || 0
      grouped[mp].sales += Number(r.sales) || 0
      grouped[mp].fees += (Number(r.commission) || 0) + (Number(r.fba) || 0) + (Number(r.storage) || 0) + (Number(r.return_mgmt) || 0) + (Number(r.digital_fba) || 0) + (Number(r.digital_sell) || 0)
      grouped[mp].cogs += Number(r.cogs) || 0
      grouped[mp].refunds += Number(r.refunds) || 0
    })
    Object.values(grouped).forEach(mp => {
      const ratio = totalSales > 0 ? mp.sales / totalSales : 0
      mp.adSpend = adSpend.currentTotal * ratio
      mp.netProfit = mp.sales - mp.fees - mp.adSpend - mp.cogs - mp.refunds
      mp.margin = mp.sales > 0 ? (mp.netProfit / mp.sales) * 100 : 0
    })
    return Object.values(grouped)
  }, [rawData, selectedMonth, adSpend.currentTotal])

  const mpRows = useMemo(() => {
    const sorted = [...mpGrouped]
    sorted.sort((a, b) => {
      const aV = a[mpSortKey as keyof typeof a]
      const bV = b[mpSortKey as keyof typeof b]
      if (typeof aV === 'string' && typeof bV === 'string') return mpSortDir === 'asc' ? aV.localeCompare(bV) : bV.localeCompare(aV)
      return mpSortDir === 'asc' ? (aV as number) - (bV as number) : (bV as number) - (aV as number)
    })
    return sorted
  }, [mpGrouped, mpSortKey, mpSortDir])

  const handleMpSort = (key: SortKey) => {
    if (mpSortKey === key) setMpSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setMpSortKey(key); setMpSortDir('desc') }
  }
  const sortIndicator = (key: SortKey) => mpSortKey !== key ? ' \u21C5' : mpSortDir === 'asc' ? ' \u2191' : ' \u2193'

  // ========== Top 5 marketplace by sales & refunds ==========
  const topSellersMp = useMemo(() => {
    return [...mpGrouped].sort((a, b) => b.sales - a.sales).slice(0, 5)
  }, [mpGrouped])

  const topRefundsMp = useMemo(() => {
    return [...mpGrouped].sort((a, b) => b.refunds - a.refunds).slice(0, 5)
  }, [mpGrouped])

  // ========== AI Insights ==========
  const aiInsights = useMemo(() => {
    const insights: { icon: string; type: string; color: string; title: string; desc: string }[] = []

    // Refund rate check
    const refundRate = cur.sales > 0 ? (cur.refunds / cur.sales) * 100 : 0
    const prevRefundRate = prev.sales > 0 ? (prev.refunds / prev.sales) * 100 : 0
    if (refundRate > prevRefundRate + 1) {
      insights.push({ icon: '\u26A0\uFE0F', type: '\u0130ade Uyar\u0131s\u0131', color: '#ef4444', title: '\u0130ade oran\u0131 artt\u0131', desc: `Bu ay %${refundRate.toFixed(1)} iade oran\u0131, ge\u00E7en ay %${prevRefundRate.toFixed(1)} idi. \u00DCr\u00FCn kalite kontrol\u00FC \u00F6nerilir.` })
    }

    // Ad spend efficiency
    if (curAcos > 35) {
      insights.push({ icon: '\uD83D\uDCB0', type: 'Reklam Optimizasyonu', color: '#f59e0b', title: 'ACoS y\u00FCksek', desc: `ACoS %${curAcos.toFixed(1)} seviyesinde. D\u00FC\u015F\u00FCk performansl\u0131 kampanyalar\u0131 duraklat\u0131n veya bid\u2019leri d\u00FC\u015F\u00FCr\u00FCn.` })
    } else if (curAcos < 20 && displayAd > 0) {
      insights.push({ icon: '\uD83D\uDE80', type: 'F\u0131rsat', color: '#10b981', title: 'Reklam b\u00FCtçesi art\u0131r\u0131labilir', desc: `ACoS %${curAcos.toFixed(1)} ile \u00E7ok verimli. B\u00FCtçe art\u0131\u015F\u0131 de\u011Ferlendirilmeli.` })
    }

    // Margin trend
    if (curMargin < prevMargin - 3) {
      insights.push({ icon: '\uD83D\uDCC9', type: 'Trend', color: '#ef4444', title: 'Marj d\u00FC\u015F\u00FC\u015Fte', desc: `Marj %${prevMargin.toFixed(1)}\u2019den %${curMargin.toFixed(1)}\u2019e geriledi. Maliyet analizi yap\u0131n.` })
    } else if (curMargin > prevMargin + 3) {
      insights.push({ icon: '\uD83D\uDCC8', type: 'Trend', color: '#10b981', title: 'Marj y\u00FCkseldi', desc: `Marj %${prevMargin.toFixed(1)}\u2019den %${curMargin.toFixed(1)}\u2019e \u00E7\u0131kt\u0131. Ba\u015Far\u0131l\u0131 optimizasyon!` })
    }

    // FBA cost increase
    const fbaChange = pctChange(cur.fba, prev.fba)
    if (fbaChange > 15) {
      insights.push({ icon: '\uD83D\uDCE6', type: 'FBA Maliyet', color: '#f59e0b', title: 'FBA maliyetleri artt\u0131', desc: `FBA \u00FCcretleri %${fbaChange.toFixed(0)} artt\u0131. Boyut/a\u011F\u0131rl\u0131k optimizasyonu de\u011Ferlendirilmeli.` })
    }

    // Growing marketplace
    const growingMps = mpGrouped.filter(mp => {
      const prevMpRows = rawData.filter((r: any) => r.report_month === prevMonthStr && r.marketplace === mp.marketplace)
      const prevMpSales = prevMpRows.reduce((s: number, r: any) => s + (Number(r.sales) || 0), 0)
      return prevMpSales > 0 && mp.sales > prevMpSales * 1.3
    })
    if (growingMps.length > 0) {
      const mp = growingMps[0]
      insights.push({ icon: '\uD83C\uDF1F', type: 'B\u00FCy\u00FCme F\u0131rsat\u0131', color: '#6366f1', title: `${mp.marketplace} b\u00FCy\u00FCyor`, desc: `${mp.marketplace}\u2019da sat\u0131\u015Flar g\u00FC\u00E7l\u00FC b\u00FCy\u00FCme g\u00F6steriyor. Stok ve reklam b\u00FCtçesini art\u0131rmay\u0131 d\u00FC\u015F\u00FCn\u00FCn.` })
    }

    if (insights.length === 0) {
      insights.push({ icon: '\u2705', type: 'Genel', color: '#10b981', title: 'Her \u015Fey yolunda', desc: 'Bu ay i\u00E7in \u00F6nemli bir uyar\u0131 yok. Performans stabil g\u00F6r\u00FCn\u00FCyor.' })
    }

    return insights
  }, [cur, prev, curAcos, curMargin, prevMargin, displayAd, mpGrouped, rawData, prevMonthStr])

  // ========== Quick actions ==========
  const quickActions = useMemo(() => {
    const actions: { status: string; statusColor: string; label: string }[] = []

    if (curAcos > 30) actions.push({ status: 'Acil', statusColor: '#ef4444', label: 'Y\u00FCksek ACoS kampanyalar\u0131 duraklat' })
    if (cur.refunds > prev.refunds * 1.2 && prev.refunds > 0) actions.push({ status: 'Acil', statusColor: '#ef4444', label: '\u0130ade art\u0131\u015F\u0131n\u0131 incele' })

    const lowStockMps = mpGrouped.filter(mp => mp.sales > 500 && mp.margin < 5)
    if (lowStockMps.length > 0) actions.push({ status: 'Planl\u0131', statusColor: '#6366f1', label: `${lowStockMps[0].marketplace} marj\u0131n\u0131 iyile\u015Ftir` })

    if (displayAd > 0 && curAcos < 25) actions.push({ status: 'Planl\u0131', statusColor: '#6366f1', label: 'SB b\u00FCtçesini art\u0131r' })
    if (curMargin > prevMargin) actions.push({ status: 'Tamamland\u0131', statusColor: '#10b981', label: 'Marj optimizasyonu ba\u015Far\u0131l\u0131' })

    if (actions.length === 0) actions.push({ status: 'Bilgi', statusColor: '#6366f1', label: 'Yeni aksiyon gerekmiyor' })

    return actions
  }, [curAcos, cur.refunds, prev.refunds, mpGrouped, displayAd, curMargin, prevMargin])

  // ========== KPIs ==========
  const changeArrow = (change: number) => {
    if (change > 0) return { symbol: '\u2191', color: '#10b981' }
    if (change < 0) return { symbol: '\u2193', color: '#ef4444' }
    return { symbol: '\u2192', color: 'var(--text-secondary)' }
  }

  const kpis = [
    { label: 'SATI\u015E', value: fmtNum(cur.sales), change: pctChange(cur.sales, prev.sales), color: '#6366f1' },
    { label: 'B\u0130R\u0130M', value: cur.units.toLocaleString('de-DE'), change: pctChange(cur.units, prev.units), color: '#a78bfa' },
    { label: 'NET K\u00C2R', value: fmtNum(curNetProfit), change: pctChange(curNetProfit, prevNetProfit), color: curNetProfit >= 0 ? '#10b981' : '#ef4444' },
    { label: 'MARJ', value: fmtPct(curMargin), change: curMargin - prevMargin, color: curMargin >= 0 ? '#10b981' : '#ef4444' },
    { label: 'REKLAM', value: fmtNum(displayAd), change: pctChange(displayAd, displayAdPrev), color: '#f59e0b' },
    { label: 'ACOS', value: fmtPct(curAcos), change: curAcos - prevAcos, color: curAcos < 25 ? '#10b981' : curAcos < 40 ? '#f59e0b' : '#ef4444' },
  ]

  // ========== Styles ==========
  const tooltipStyle = { contentStyle: { background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)' }, labelStyle: { color: 'var(--text-secondary)' } }
  const selectStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }
  const rangeBtn = (active: boolean): React.CSSProperties => ({ padding: '5px 12px', fontSize: 11, borderRadius: 6, border: '1px solid', borderColor: active ? '#6366f1' : 'var(--border-color)', background: active ? 'rgba(99,102,241,0.15)' : 'transparent', color: active ? '#6366f1' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: active ? 600 : 400, minHeight: 44 })
  const thStyle = (align: string): React.CSSProperties => ({ textAlign: align as any, padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 12 })
  const cardStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20 }

  const plCell = (val: number) => {
    const color = val >= 0 ? '#10b981' : '#ef4444'
    return <td style={{ padding: '10px 12px', textAlign: 'right', color, fontWeight: 600 }}>{fmtNum(val)}</td>
  }
  const plPrevCell = (val: number) => <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtNum(val)}</td>
  const plChangeCell = (c: number, p: number, invertColor?: boolean) => {
    const change = pctChange(c, p)
    const arrow = changeArrow(invertColor ? -change : change)
    return <td style={{ padding: '10px 12px', textAlign: 'right', color: arrow.color, fontSize: 12 }}>{arrow.symbol} {Math.abs(change).toFixed(1)}%</td>
  }

  // ========== Mini card comparison helper ==========
  const miniCompare = (label: string, curVal: number, prevVal: number) => {
    const change = pctChange(curVal, prevVal)
    const arrow = changeArrow(change)
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-color)' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtNum(curVal)}</span>
          <span style={{ fontSize: 11, color: arrow.color, marginLeft: 6 }}>{arrow.symbol}{Math.abs(change).toFixed(1)}%</span>
        </div>
      </div>
    )
  }

  // Sidebar
  const sidebarContent = (
    <>
      <div style={{ padding: '0 18px 20px', borderBottom: '1px solid var(--border-color)', marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Sellometrix<span style={{ color: '#6366f1' }}>.io</span></div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 2 }}>AI Commerce OS</div>
      </div>
      {[
        { icon: '\u2B21', label: 'Dashboard', href: '/' },
        { icon: '\u25C8', label: 'Karl\u0131l\u0131k', href: '/pl', active: true },
        { icon: '\u25EB', label: 'Stok', href: '#' },
        { icon: '\u25EC', label: 'Reklam', href: '/ads' },
        { icon: '\u25C9', label: 'Rakip Analizi', href: '#' },
        { icon: '\u25CC', label: '\u0130\u00E7erik', href: '#' },
        { icon: '\u25CE', label: 'AI \u00D6neriler', href: '#' },
        { icon: '\u25F1', label: 'Raporlar', href: '#' },
      ].map((item, i) => (
        <div key={i}>
          <Link href={item.href} style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: 13, color: item.active ? '#6366f1' : 'var(--text-secondary)', background: item.active ? 'rgba(99,102,241,0.1)' : 'transparent', marginBottom: 2, cursor: 'pointer' }}>
              <span>{item.icon}</span><span>{item.label}</span>
            </div>
          </Link>
        </div>
      ))}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, borderTop: '1px solid var(--border-color)' }}>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#6366f1,#a78bfa)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'white', fontSize: 11 }}>M</div>
          <div><div style={{ fontSize: 12.5, fontWeight: 600 }}>Mimosso</div><div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>amazon.de</div></div>
        </div>
        <ThemeToggle />
        <LogoutButton />
      </div>
    </>
  )

  if (loading) {
    return (
      <DashboardShell sidebar={sidebarContent}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: '3px solid var(--border-color)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Veriler y\u00FCkleniyor...</div>
          </div>
        </div>
      </DashboardShell>
    )
  }

  const selectedMpOption = MARKETPLACE_OPTIONS.find(m => m.value === selectedMarketplace)!

  return (
    <DashboardShell sidebar={sidebarContent}>
      {/* HEADER */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>P&L Dashboard</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, margin: 0 }}>
            K\u00E2r & Zarar Analizi \u00B7 {selectedMonth}
            {selectedMarketplace !== 'all' && ` \u00B7 ${selectedMpOption.flag} ${selectedMpOption.label}`}
          </p>
        </div>
        <div className="header-controls" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={selectStyle}>
            {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={selectedMarketplace} onChange={e => setSelectedMarketplace(e.target.value)} style={selectStyle}>
            {MARKETPLACE_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.flag} {m.label}</option>)}
          </select>
        </div>
      </div>

      {/* B\u00D6L\u00DCM 1: KPI CARDS */}
      <div className="kpi-grid-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 20 }}>
        {kpis.map((kpi, i) => {
          const arrow = changeArrow(kpi.change)
          return (
            <div key={i} style={{ ...cardStyle, padding: '14px 16px', position: 'relative', overflow: 'hidden', opacity: 0, animation: `fadeInUp 0.6s ease-out ${i * 0.1}s forwards` }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 45, height: 45, borderRadius: '0 14px 0 45px', background: kpi.color, opacity: 0.07 }} />
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{kpi.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-1px', marginBottom: 4 }}>{kpi.value}</div>
              <div style={{ fontSize: 11, color: arrow.color }}>{arrow.symbol} {kpi.change >= 0 ? '+' : ''}{kpi.change.toFixed(1)}% \u00F6nceki ay</div>
            </div>
          )
        })}
      </div>

      {/* B\u00D6L\u00DCM 2: CHARTS ROW */}
      <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        {/* Monthly Trend */}
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.6s forwards' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Ayl\u0131k Trend</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>Sat\u0131\u015F vs Net K\u00E2r</div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={monthlyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `\u20AC${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...tooltipStyle} formatter={(value: any, name: any) => [fmtNum(Number(value)), name === 'sales' ? 'Sat\u0131\u015F' : 'Net K\u00E2r']} />
              <Bar dataKey="sales" fill="#6366f1" radius={[4, 4, 0, 0]} name="sales" />
              <Line type="monotone" dataKey="netProfit" stroke="#10b981" strokeWidth={2.5} dot={{ fill: '#10b981', r: 4 }} name="netProfit" />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}><div style={{ width: 12, height: 10, background: '#6366f1', borderRadius: 2 }} />Sat\u0131\u015F</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}><div style={{ width: 12, height: 3, background: '#10b981', borderRadius: 2 }} />Net K\u00E2r</div>
          </div>
        </div>

        {/* Daily Trend */}
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.7s forwards' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>G\u00FCnl\u00FCk Sat\u0131\u015F Trendi</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{selectedMonth}</div>
            </div>
          </div>
          <div className="daily-range-bar" style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setDailyRange('7d')} style={rangeBtn(dailyRange === '7d')}>Son 7 g\u00FCn</button>
            <button onClick={() => setDailyRange('14d')} style={rangeBtn(dailyRange === '14d')}>Son 14 g\u00FCn</button>
            <button onClick={() => setDailyRange('month')} style={rangeBtn(dailyRange === 'month')}>Bu ay</button>
            <button onClick={() => setDailyRange('custom')} style={rangeBtn(dailyRange === 'custom')}>\u00D6zel aral\u0131k</button>
            {dailyRange === 'custom' && (
              <>
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ ...selectStyle, padding: '4px 8px', fontSize: 11 }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>\u2013</span>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ ...selectStyle, padding: '4px 8px', fontSize: 11 }} />
              </>
            )}
          </div>
          {dailyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="day" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `\u20AC${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...tooltipStyle} formatter={(value: any, name: any) => [fmtNum(Number(value)), name === 'sales' ? 'Sat\u0131\u015F' : 'Net K\u00E2r']} />
                <Line type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="netProfit" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 190, color: 'var(--text-secondary)', fontSize: 13 }}>Bu ay i\u00E7in g\u00FCnl\u00FCk veri bulunamad\u0131</div>
          )}
          <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}><div style={{ width: 12, height: 3, background: '#6366f1', borderRadius: 2 }} />Sat\u0131\u015F</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}><div style={{ width: 12, height: 3, background: '#10b981', borderRadius: 2 }} />Net K\u00E2r</div>
          </div>
        </div>
      </div>

      {/* B\u00D6L\u00DCM 3: MINI CARDS */}
      <div className="mini-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {/* Bu Ay vs Ge\u00E7en Ay */}
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.8s forwards' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Bu Ay vs Ge\u00E7en Ay</div>
          {miniCompare('Sat\u0131\u015F', cur.sales, prev.sales)}
          {miniCompare('Net K\u00E2r', curNetProfit, prevNetProfit)}
          {miniCompare('Birim', cur.units, prev.units)}
          {miniCompare('Reklam', displayAd, displayAdPrev)}
        </div>

        {/* Ge\u00E7en Ay vs 2 Ay \u00D6nce */}
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.85s forwards' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Ge\u00E7en Ay vs 2 Ay \u00D6nce</div>
          {miniCompare('Sat\u0131\u015F', prev.sales, prevPrev.sales)}
          {miniCompare('Net K\u00E2r', prevNetProfit, prevPrevNetProfit)}
          {miniCompare('Birim', prev.units, prevPrev.units)}
          {miniCompare('\u0130ade', prev.refunds, prevPrev.refunds)}
        </div>

        {/* En \u00C7ok Satan Top 5 */}
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.9s forwards' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>\uD83C\uDFC6 En \u00C7ok Satan</div>
          {topSellersMp.map((mp, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: i < topSellersMp.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{MARKETPLACE_FLAG_MAP[mp.marketplace] || ''} {mp.marketplace.replace('Amazon.', '')}</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{fmtNum(mp.sales)}</span>
            </div>
          ))}
        </div>

        {/* En \u00C7ok \u0130ade Alan */}
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.95s forwards' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>\u26A0\uFE0F En \u00C7ok \u0130ade</div>
          {topRefundsMp.map((mp, i) => {
            const refRate = mp.sales > 0 ? (mp.refunds / mp.sales * 100) : 0
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: i < topRefundsMp.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{MARKETPLACE_FLAG_MAP[mp.marketplace] || ''} {mp.marketplace.replace('Amazon.', '')}</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#ef4444' }}>{fmtNum(mp.refunds)}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>%{refRate.toFixed(1)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* B\u00D6L\u00DCM 4: AI \u00D6NERILER + HIZLI AKS\u0130YONLAR */}
      <div className="ai-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 20 }}>
        {/* AI \u00D6neriler */}
        <div style={{ ...cardStyle, background: 'var(--ai-gradient)', border: '1px solid var(--border-color)', opacity: 0, animation: 'fadeInUp 0.6s ease-out 1s forwards' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 18 }}>\uD83E\uDD16</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>AI \u00D6neriler</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Yapay zeka tabanl\u0131 i\u00E7g\u00F6r\u00FCler</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {aiInsights.map((insight, i) => (
              <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '12px 14px', borderLeft: `3px solid ${insight.color}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span>{insight.icon}</span>
                  <span style={{ fontSize: 10, color: insight.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{insight.type}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{insight.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{insight.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* H\u0131zl\u0131 Aksiyonlar */}
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 1.05s forwards' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>H\u0131zl\u0131 Aksiyonlar</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {quickActions.map((action, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: action.statusColor, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{action.label}</div>
                  <div style={{ fontSize: 10, color: action.statusColor, marginTop: 2 }}>{action.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* B\u00D6L\u00DCM 5: P&L TABLE */}
      <div style={{ ...cardStyle, marginBottom: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 1.1s forwards' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>P&L Tablosu</div>
        <div className="pl-table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={thStyle('left')}>Kalem</th>
                <th style={thStyle('right')}>{selectedMonth}</th>
                {hasPrev && <th style={thStyle('right')}>{prevMonthStr}</th>}
                <th style={thStyle('right')}>De\u011Fi\u015Fim</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '10px 12px' }}>Sales</td>
                {plCell(cur.sales)}
                {hasPrev && plPrevCell(prev.sales)}
                {plChangeCell(cur.sales, prev.sales)}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '10px 12px' }}>Promo</td>
                {plCell(-cur.promo)}
                {hasPrev && plPrevCell(-prev.promo)}
                {plChangeCell(cur.promo, prev.promo, true)}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '10px 12px' }}>Refunds</td>
                {plCell(-cur.refunds)}
                {hasPrev && plPrevCell(-prev.refunds)}
                {plChangeCell(cur.refunds, prev.refunds, true)}
              </tr>
              {/* Amazon Fees - expandable */}
              <tr style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }} onClick={() => setFeesExpanded(!feesExpanded)}>
                <td style={{ padding: '10px 12px' }}>{feesExpanded ? '\u25BC' : '\u25B6'} Amazon Fees</td>
                {plCell(-curTotalFees)}
                {hasPrev && plPrevCell(-prevTotalFees)}
                {plChangeCell(curTotalFees, prevTotalFees, true)}
              </tr>
              {feesExpanded && (
                <>
                  {[
                    { label: 'Commission', curV: cur.commission, prevV: prev.commission },
                    { label: 'FBA Fees', curV: cur.fba, prevV: prev.fba },
                    { label: 'Storage & Aged', curV: cur.storage, prevV: prev.storage },
                    { label: 'Return Management', curV: cur.return_mgmt, prevV: prev.return_mgmt },
                    { label: 'Digital Services', curV: cur.digital_fba + cur.digital_sell, prevV: prev.digital_fba + prev.digital_sell },
                  ].map((sub, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-sub-row)' }}>
                      <td style={{ padding: '8px 12px 8px 32px', fontSize: 12, color: 'var(--text-secondary)' }}>{sub.label}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: '#ef4444' }}>{fmtNum(-sub.curV)}</td>
                      {hasPrev && <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtNum(-sub.prevV)}</td>}
                      {plChangeCell(sub.curV, sub.prevV, true)}
                    </tr>
                  ))}
                </>
              )}
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '10px 12px' }}>COGS</td>
                {plCell(-cur.cogs)}
                {hasPrev && plPrevCell(-prev.cogs)}
                {plChangeCell(cur.cogs, prev.cogs, true)}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '10px 12px' }}>Subscription</td>
                {plCell(-cur.subscription)}
                {hasPrev && plPrevCell(-prev.subscription)}
                {plChangeCell(cur.subscription, prev.subscription, true)}
              </tr>
              {/* Advertising - expandable */}
              <tr style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }} onClick={() => setAdsExpanded(!adsExpanded)}>
                <td style={{ padding: '10px 12px' }}>{adsExpanded ? '\u25BC' : '\u25B6'} Advertising (SP + SB)</td>
                {plCell(-displayAd)}
                {hasPrev && plPrevCell(-displayAdPrev)}
                {plChangeCell(displayAd, displayAdPrev, true)}
              </tr>
              {adsExpanded && (
                <>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-sub-row)' }}>
                    <td style={{ padding: '8px 12px 8px 32px', fontSize: 12, color: 'var(--text-secondary)' }}>SP (Sponsored Products)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: '#ef4444' }}>{fmtNum(-displaySp)}</td>
                    {hasPrev && <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtNum(-displaySpPrev)}</td>}
                    {plChangeCell(displaySp, displaySpPrev, true)}
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-sub-row)' }}>
                    <td style={{ padding: '8px 12px 8px 32px', fontSize: 12, color: 'var(--text-secondary)' }}>SB (Sponsored Brands)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: '#ef4444' }}>{fmtNum(-displaySb)}</td>
                    {hasPrev && <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtNum(-displaySbPrev)}</td>}
                    {plChangeCell(displaySb, displaySbPrev, true)}
                  </tr>
                </>
              )}
              {/* Net Profit */}
              <tr style={{ borderTop: '2px solid var(--border-color)', background: 'rgba(99,102,241,0.04)' }}>
                <td style={{ padding: '12px', fontWeight: 700 }}>Net Profit</td>
                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, fontSize: 15, color: curNetProfit >= 0 ? '#10b981' : '#ef4444' }}>{fmtNum(curNetProfit)}</td>
                {hasPrev && <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600 }}>{fmtNum(prevNetProfit)}</td>}
                <td style={{ padding: '12px', textAlign: 'right', color: changeArrow(pctChange(curNetProfit, prevNetProfit)).color, fontSize: 12, fontWeight: 600 }}>
                  {changeArrow(pctChange(curNetProfit, prevNetProfit)).symbol} {Math.abs(pctChange(curNetProfit, prevNetProfit)).toFixed(1)}%
                </td>
              </tr>
              <tr style={{ background: 'rgba(99,102,241,0.04)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>Margin %</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: curMargin >= 0 ? '#10b981' : '#ef4444' }}>{fmtPct(curMargin)}</td>
                {hasPrev && <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtPct(prevMargin)}</td>}
                <td style={{ padding: '10px 12px', textAlign: 'right', color: changeArrow(curMargin - prevMargin).color, fontSize: 12 }}>
                  {changeArrow(curMargin - prevMargin).symbol} {Math.abs(curMargin - prevMargin).toFixed(1)}pp
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* B\u00D6L\u00DCM 6: MARKETPLACE BREAKDOWN */}
      {selectedMarketplace === 'all' && (
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 1.2s forwards' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Marketplace K\u0131r\u0131l\u0131m\u0131</div>
          <div className="mp-table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {([
                    { key: 'marketplace' as SortKey, label: 'Marketplace', align: 'left' },
                    { key: 'sales' as SortKey, label: 'Sat\u0131\u015F', align: 'right' },
                    { key: 'units' as SortKey, label: 'Birim', align: 'right' },
                    { key: 'fees' as SortKey, label: 'Amazon Fees', align: 'right' },
                    { key: 'adSpend' as SortKey, label: 'Reklam', align: 'right' },
                    { key: 'cogs' as SortKey, label: 'COGS', align: 'right' },
                    { key: 'netProfit' as SortKey, label: 'Net K\u00E2r', align: 'right' },
                    { key: 'margin' as SortKey, label: 'Marj', align: 'right' },
                  ]).map(h => (
                    <th key={h.key} onClick={() => handleMpSort(h.key)} style={{ ...thStyle(h.align), color: mpSortKey === h.key ? '#6366f1' : 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                      {h.label}{sortIndicator(h.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mpRows.map((mp, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => setSelectedMarketplace(mp.marketplace)}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{MARKETPLACE_FLAG_MAP[mp.marketplace] || '\u{1F30D}'} {mp.marketplace}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmtNum(mp.sales)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{mp.units.toLocaleString('de-DE')}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ef4444' }}>{fmtNum(mp.fees)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b' }}>{fmtNum(mp.adSpend)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ef4444' }}>{fmtNum(mp.cogs)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: mp.netProfit >= 0 ? '#10b981' : '#ef4444' }}>{fmtNum(mp.netProfit)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: mp.margin >= 0 ? '#10b981' : '#ef4444' }}>{fmtPct(mp.margin)}</td>
                  </tr>
                ))}
                {mpRows.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Bu ay i\u00E7in marketplace verisi bulunamad\u0131</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}
