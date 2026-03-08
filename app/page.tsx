'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import DashboardShell from './components/DashboardShell'
import Sidebar from './components/Sidebar'
import {
  Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart,
} from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MARKETPLACE_OPTIONS = [
  { value: 'all', label: 'All Marketplaces', flag: '🌍' },
  { value: 'Amazon.de', label: 'Amazon.de', flag: '🇩🇪' },
  { value: 'Amazon.fr', label: 'Amazon.fr', flag: '🇫🇷' },
  { value: 'Amazon.es', label: 'Amazon.es', flag: '🇪🇸' },
  { value: 'Amazon.it', label: 'Amazon.it', flag: '🇮🇹' },
  { value: 'Amazon.co.uk', label: 'Amazon.co.uk', flag: '🇬🇧' },
  { value: 'Amazon.nl', label: 'Amazon.nl', flag: '🇳🇱' },
  { value: 'Amazon.pl', label: 'Amazon.pl', flag: '🇵🇱' },
  { value: 'Amazon.ie', label: 'Amazon.ie', flag: '🇮🇪' },
  { value: 'Amazon.com.be', label: 'Amazon.com.be', flag: '🇧🇪' },
  { value: 'Amazon.se', label: 'Amazon.se', flag: '🇸🇪' },
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
  if (v < 0) return `-€${Math.abs(v).toLocaleString('de-DE', { maximumFractionDigits: 0 })}`
  return `€${v.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`
}
const fmtPct = (v: number) => `%${v.toFixed(1)}`
const pctChange = (cur: number, prev: number) => prev === 0 ? 0 : ((cur - prev) / Math.abs(prev)) * 100

const emptyPL = (): PLMonth => ({ units: 0, sales: 0, promo: 0, refunds: 0, commission: 0, fba: 0, storage: 0, return_mgmt: 0, digital_fba: 0, digital_sell: 0, cogs: 0, subscription: 0 })

export default function DashboardPage() {
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

  // ========== 2. REKLAM VERİSİ — RPC ile server-side SUM ==========
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

  // ========== 3. Günlük veri ==========
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

  // 2 ay öncesi
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
  const sortIndicator = (key: SortKey) => mpSortKey !== key ? ' ⇅' : mpSortDir === 'asc' ? ' ↑' : ' ↓'

  // ========== Top 5 marketplace by sales & refunds ==========
  const topSellersMp = useMemo(() => {
    return [...mpGrouped].sort((a, b) => b.sales - a.sales).slice(0, 5)
  }, [mpGrouped])

  // ========== Top products ==========
  const [topProducts, setTopProducts] = useState<{ title: string; sku: string; units: number; sales: number }[]>([])
  const [topRefundProducts, setTopRefundProducts] = useState<{ title: string; sku: string; refunds: number; refundRate: number }[]>([])

  useEffect(() => {
    async function fetchTopProducts() {
      const { startDate, endDate } = getMonthRange(selectedMonth)
      let q = supabase
        .from('all_orders')
        .select('sku, quantity, item_price, order_status')
        .gte('purchase_date', startDate)
        .lte('purchase_date', endDate)
      if (selectedMarketplace !== 'all') q = q.eq('marketplace', selectedMarketplace)

      const { data: orders } = await q.limit(5000)
      const { data: parentMap } = await supabase.from('parent_asin_map').select('sku, title')

      const skuTitle: Record<string, string> = {}
      parentMap?.forEach((p: any) => { if (p.sku && p.title) skuTitle[p.sku] = p.title })

      const skuSales: Record<string, { units: number; sales: number; refunds: number }> = {}
      orders?.forEach((o: any) => {
        const sku = o.sku || ''
        if (!sku) return
        if (!skuSales[sku]) skuSales[sku] = { units: 0, sales: 0, refunds: 0 }
        if (o.order_status === 'Shipped') {
          skuSales[sku].units += Number(o.quantity) || 0
          skuSales[sku].sales += Number(o.item_price) || 0
        }
        const status = (o.order_status || '').toLowerCase()
        if (status === 'refunded' || status === 'return' || status === 'returned' || status === 'cancelled' || status.includes('refund') || status.includes('return')) {
          skuSales[sku].refunds += Math.abs(Number(o.item_price) || 0)
        }
      })

      const allSkus = Object.entries(skuSales)
      const topSellers = allSkus
        .sort((a, b) => b[1].units - a[1].units)
        .slice(0, 5)
        .map(([sku, d]) => ({ title: skuTitle[sku] || sku, sku, units: d.units, sales: d.sales }))
      setTopProducts(topSellers)

      const topRefunds = allSkus
        .filter(([, d]) => d.refunds > 0)
        .sort((a, b) => b[1].refunds - a[1].refunds)
        .slice(0, 5)
        .map(([sku, d]) => ({
          title: skuTitle[sku] || sku,
          sku,
          refunds: d.refunds,
          refundRate: d.sales > 0 ? (d.refunds / d.sales) * 100 : 0,
        }))
      setTopRefundProducts(topRefunds)
    }
    if (!loading) fetchTopProducts()
  }, [selectedMonth, selectedMarketplace, loading])

  // ========== AI Insights — always 5, priority-sorted, month-over-month ==========
  const aiInsights = useMemo(() => {
    const pool: { priority: number; icon: string; type: string; color: string; title: string; desc: string }[] = []

    // --- 1. Sales trend ---
    const salesChange = pctChange(cur.sales, prev.sales)
    if (salesChange < -10) {
      pool.push({ priority: 1, icon: '\uD83D\uDCC9', type: 'Sat\u0131\u015f Uyar\u0131s\u0131', color: '#ef4444', title: 'Sat\u0131\u015flarda sert d\u00fc\u015f\u00fc\u015f', desc: `Sat\u0131\u015flar ge\u00e7en aya g\u00f6re %${Math.abs(salesChange).toFixed(1)} d\u00fc\u015ft\u00fc (\u20ac${Math.round(prev.sales).toLocaleString('de-DE')} \u2192 \u20ac${Math.round(cur.sales).toLocaleString('de-DE')}). Fiyatland\u0131rma, stok durumu ve listing kalitesini kontrol edin.` })
    } else if (salesChange < -3) {
      pool.push({ priority: 3, icon: '\uD83D\uDCC9', type: 'Sat\u0131\u015f Trendi', color: '#f59e0b', title: 'Sat\u0131\u015flar hafif d\u00fc\u015f\u00fc\u015fte', desc: `Sat\u0131\u015flar %${Math.abs(salesChange).toFixed(1)} azald\u0131. Mevsimsel etki olabilir, kampanya ve g\u00f6r\u00fcn\u00fcrl\u00fck art\u0131r\u0131lmal\u0131.` })
    } else if (salesChange > 15) {
      pool.push({ priority: 4, icon: '\uD83D\uDE80', type: 'Sat\u0131\u015f B\u00fcy\u00fcme', color: '#10b981', title: 'Sat\u0131\u015flar g\u00fc\u00e7l\u00fc b\u00fcy\u00fcyor', desc: `Sat\u0131\u015flar %${salesChange.toFixed(1)} artt\u0131! Stok durumunu kontrol edin, bu ivmeyi s\u00fcrd\u00fcrmek i\u00e7in reklam b\u00fct\u00e7esini optimize edin.` })
    } else {
      pool.push({ priority: 6, icon: '\uD83D\uDCCA', type: 'Sat\u0131\u015f', color: '#6366f1', title: 'Sat\u0131\u015flar stabil', desc: `Sat\u0131\u015flar ge\u00e7en aya g\u00f6re %${salesChange >= 0 ? '+' : ''}${salesChange.toFixed(1)} de\u011fi\u015fti. \u20ac${Math.round(cur.sales).toLocaleString('de-DE')} ciro ile stabil seyir devam ediyor.` })
    }

    // --- 2. Profit analysis ---
    const profitChange = pctChange(curNetProfit, prevNetProfit)
    if (curNetProfit < 0) {
      pool.push({ priority: 1, icon: '\uD83D\uDEA8', type: 'K\u00e2r Uyar\u0131s\u0131', color: '#ef4444', title: 'Zarar ediyorsunuz!', desc: `Net k\u00e2r ${fmtNum(curNetProfit)} ile negatif. Marj %${curMargin.toFixed(1)}. Acil maliyet analizi yap\u0131n, d\u00fc\u015f\u00fck marjl\u0131 \u00fcr\u00fcnleri fiyatland\u0131r\u0131n veya duraklat\u0131n.` })
    } else if (profitChange < -15) {
      pool.push({ priority: 2, icon: '\uD83D\uDCC9', type: 'K\u00e2rl\u0131l\u0131k', color: '#ef4444', title: 'K\u00e2rl\u0131l\u0131k h\u0131zla d\u00fc\u015f\u00fcyor', desc: `Net k\u00e2r %${Math.abs(profitChange).toFixed(1)} d\u00fc\u015ft\u00fc (${fmtNum(prevNetProfit)} \u2192 ${fmtNum(curNetProfit)}). Marj %${prevMargin.toFixed(1)} dan %${curMargin.toFixed(1)} e geriledi. Maliyet kalemlerini inceleyin.` })
    } else if (profitChange > 10) {
      pool.push({ priority: 5, icon: '\uD83D\uDCC8', type: 'K\u00e2rl\u0131l\u0131k', color: '#10b981', title: 'K\u00e2rl\u0131l\u0131k art\u0131\u015fta', desc: `Net k\u00e2r %${profitChange.toFixed(1)} artt\u0131 (${fmtNum(curNetProfit)}). Marj %${curMargin.toFixed(1)} ile ba\u015far\u0131l\u0131 bir ay ge\u00e7iriyorsunuz.` })
    } else {
      pool.push({ priority: 6, icon: '\uD83D\uDCB0', type: 'K\u00e2rl\u0131l\u0131k', color: '#6366f1', title: 'K\u00e2r stabil', desc: `Net k\u00e2r ${fmtNum(curNetProfit)}, marj %${curMargin.toFixed(1)}. Ge\u00e7en aya g\u00f6re %${profitChange >= 0 ? '+' : ''}${profitChange.toFixed(1)} de\u011fi\u015fim.` })
    }

    // --- 3. Refund analysis ---
    const refundRate = cur.sales > 0 ? (cur.refunds / cur.sales) * 100 : 0
    const prevRefundRate = prev.sales > 0 ? (prev.refunds / prev.sales) * 100 : 0
    const refundChange = pctChange(cur.refunds, prev.refunds)
    if (refundRate > 8) {
      pool.push({ priority: 1, icon: '\uD83D\uDEA8', type: '\u0130ade Alarm\u0131', color: '#ef4444', title: '\u0130ade oran\u0131 kritik seviyede', desc: `\u0130ade oran\u0131 %${refundRate.toFixed(1)} (${fmtNum(cur.refunds)}). Ge\u00e7en ay %${prevRefundRate.toFixed(1)} idi. \u00dcr\u00fcn kalitesi ve listing a\u00e7\u0131klamalar\u0131 acil g\u00f6zden ge\u00e7irilmeli.` })
    } else if (refundChange > 20 && cur.refunds > 100) {
      pool.push({ priority: 2, icon: '\u26A0\uFE0F', type: '\u0130ade Uyar\u0131s\u0131', color: '#f59e0b', title: '\u0130adeler art\u0131\u015fta', desc: `\u0130adeler %${refundChange.toFixed(0)} artt\u0131 (${fmtNum(prev.refunds)} \u2192 ${fmtNum(cur.refunds)}). Oran %${refundRate.toFixed(1)}. En \u00e7ok iade edilen \u00fcr\u00fcnleri inceleyin.` })
    } else if (refundChange < -10) {
      pool.push({ priority: 6, icon: '\u2705', type: '\u0130ade', color: '#10b981', title: '\u0130adeler azal\u0131yor', desc: `\u0130adeler %${Math.abs(refundChange).toFixed(0)} azald\u0131. Oran %${refundRate.toFixed(1)} ile sa\u011fl\u0131kl\u0131 seviyede. Kalite iyile\u015ftirmeleri i\u015fe yar\u0131yor.` })
    } else {
      pool.push({ priority: 7, icon: '\uD83D\uDCE6', type: '\u0130ade', color: '#6366f1', title: '\u0130ade oran\u0131 stabil', desc: `\u0130ade oran\u0131 %${refundRate.toFixed(1)} (${fmtNum(cur.refunds)}). Ge\u00e7en ay %${prevRefundRate.toFixed(1)} idi. Normal seviyelerde.` })
    }

    // --- 4. Promo & discount impact ---
    const promoRate = cur.sales > 0 ? (cur.promo / cur.sales) * 100 : 0
    const prevPromoRate = prev.sales > 0 ? (prev.promo / prev.sales) * 100 : 0
    const promoChange = pctChange(cur.promo, prev.promo)
    if (promoRate > 10) {
      pool.push({ priority: 2, icon: '\uD83C\uDFF7\uFE0F', type: 'Promosyon', color: '#ef4444', title: 'Promosyon maliyeti \u00e7ok y\u00fcksek', desc: `Promosyonlar sat\u0131\u015f\u0131n %${promoRate.toFixed(1)} ini olu\u015fturuyor (${fmtNum(cur.promo)}). Ge\u00e7en ay %${prevPromoRate.toFixed(1)} idi. \u0130ndirim stratejisini g\u00f6zden ge\u00e7irin.` })
    } else if (promoChange > 30 && cur.promo > 50) {
      pool.push({ priority: 3, icon: '\uD83C\uDFF7\uFE0F', type: 'Promosyon', color: '#f59e0b', title: 'Promosyon harcamas\u0131 artt\u0131', desc: `Promosyonlar %${promoChange.toFixed(0)} artt\u0131 (${fmtNum(cur.promo)}). Sat\u0131\u015fa oran\u0131 %${promoRate.toFixed(1)}. Kupon ve indirim ROI'sini kontrol edin.` })
    } else if (cur.promo === 0 && cur.sales > 5000) {
      pool.push({ priority: 5, icon: '\uD83D\uDCA1', type: 'F\u0131rsat', color: '#10b981', title: 'Promosyon f\u0131rsat\u0131', desc: `Hi\u00e7 promosyon kullanm\u0131yorsunuz. Y\u00fcksek marjl\u0131 \u00fcr\u00fcnlerde k\u0131sa s\u00fcreli kuponlar sat\u0131\u015f h\u0131z\u0131n\u0131 art\u0131rabilir.` })
    } else {
      pool.push({ priority: 7, icon: '\uD83C\uDFF7\uFE0F', type: 'Promosyon', color: '#6366f1', title: 'Promosyon dengeli', desc: `Promosyonlar ${fmtNum(cur.promo)}, sat\u0131\u015fa oran\u0131 %${promoRate.toFixed(1)}. Ge\u00e7en ay: %${prevPromoRate.toFixed(1)}. Dengeli bir strateji izleniyor.` })
    }

    // --- 5. Ad spend analysis ---
    const adChange = pctChange(displayAd, displayAdPrev)
    if (curAcos > 40) {
      pool.push({ priority: 1, icon: '\uD83D\uDEA8', type: 'Reklam Alarm\u0131', color: '#ef4444', title: 'Reklam verimlili\u011fi kritik', desc: `TCoS %${curAcos.toFixed(1)} ile \u00e7ok y\u00fcksek (${fmtNum(displayAd)} harcama). D\u00fc\u015f\u00fck ROAS kampanyalar\u0131 acil durdurulmal\u0131, bid'ler d\u00fc\u015f\u00fcr\u00fclmeli.` })
    } else if (curAcos > 25) {
      pool.push({ priority: 3, icon: '\uD83D\uDCCA', type: 'Reklam', color: '#f59e0b', title: 'Reklam optimizasyonu gerekli', desc: `TCoS %${curAcos.toFixed(1)} (${fmtNum(displayAd)}). Ge\u00e7en ay %${prevAcos.toFixed(1)} idi. Anahtar kelime bazl\u0131 analiz yap\u0131p d\u00fc\u015f\u00fck performansl\u0131 hedefleri \u00e7\u0131kar\u0131n.` })
    } else if (curAcos < 15 && displayAd > 0) {
      pool.push({ priority: 4, icon: '\uD83D\uDCA1', type: 'Reklam F\u0131rsat\u0131', color: '#10b981', title: 'Reklam \u00e7ok verimli, b\u00fct\u00e7e art\u0131r\u0131labilir', desc: `TCoS %${curAcos.toFixed(1)} ile m\u00fckemmel verim. B\u00fct\u00e7eyi art\u0131rarak sat\u0131\u015f hacmini b\u00fcy\u00fctebilirsiniz. SP ve SB kampanyalar\u0131n\u0131 geni\u015fletin.` })
    } else if (displayAd === 0) {
      pool.push({ priority: 3, icon: '\uD83D\uDCA1', type: 'Reklam', color: '#f59e0b', title: 'Reklam harcamas\u0131 yok', desc: `Bu ay reklam harcaman\u0131z \u20ac0. Organik sat\u0131\u015f iyiyse de, SP kampanyalar\u0131yla g\u00f6r\u00fcn\u00fcrl\u00fc\u011f\u00fc art\u0131rmay\u0131 de\u011ferlendirin.` })
    } else {
      pool.push({ priority: 6, icon: '\uD83D\uDCCA', type: 'Reklam', color: '#6366f1', title: 'Reklam performans\u0131 iyi', desc: `TCoS %${curAcos.toFixed(1)} (${fmtNum(displayAd)}). Ge\u00e7en ay %${prevAcos.toFixed(1)} idi. Verimli harcama devam ediyor.` })
    }

    // Sort by priority (lower = more important), take top 5
    pool.sort((a, b) => a.priority - b.priority)
    return pool.slice(0, 5).map(({ priority, ...rest }) => rest)
  }, [cur, prev, curNetProfit, prevNetProfit, curAcos, prevAcos, curMargin, prevMargin, displayAd, displayAdPrev])

  // ========== Quick actions ==========
  const quickActions = useMemo(() => {
    const actions: { status: string; statusColor: string; label: string }[] = []

    if (curAcos > 30) actions.push({ status: 'Acil', statusColor: '#ef4444', label: 'Yüksek ACoS kampanyaları duraklat' })
    if (cur.refunds > prev.refunds * 1.2 && prev.refunds > 0) actions.push({ status: 'Acil', statusColor: '#ef4444', label: 'İade artışını incele' })

    const lowStockMps = mpGrouped.filter(mp => mp.sales > 500 && mp.margin < 5)
    if (lowStockMps.length > 0) actions.push({ status: 'Planlı', statusColor: '#6366f1', label: lowStockMps[0].marketplace + ' marjını iyileştir' })

    if (displayAd > 0 && curAcos < 25) actions.push({ status: 'Planlı', statusColor: '#6366f1', label: 'SB bütçesini artır' })
    if (curMargin > prevMargin) actions.push({ status: 'Tamamlandı', statusColor: '#10b981', label: 'Marj optimizasyonu başarılı' })

    if (actions.length === 0) actions.push({ status: 'Bilgi', statusColor: '#6366f1', label: 'Yeni aksiyon gerekmiyor' })

    return actions
  }, [curAcos, cur.refunds, prev.refunds, mpGrouped, displayAd, curMargin, prevMargin])

  // ========== KPIs ==========
  const changeArrow = (change: number) => {
    if (change > 0) return { symbol: '↑', color: '#10b981' }
    if (change < 0) return { symbol: '↓', color: '#ef4444' }
    return { symbol: '→', color: 'var(--text-secondary)' }
  }

  const kpis = [
    { label: 'SATIŞ', value: fmtNum(cur.sales), change: pctChange(cur.sales, prev.sales), color: '#6366f1' },
    { label: 'BİRİM', value: cur.units.toLocaleString('de-DE'), change: pctChange(cur.units, prev.units), color: '#a78bfa' },
    { label: 'NET KÂR', value: fmtNum(curNetProfit), change: pctChange(curNetProfit, prevNetProfit), color: curNetProfit >= 0 ? '#10b981' : '#ef4444' },
    { label: 'MARJ', value: fmtPct(curMargin), change: curMargin - prevMargin, color: curMargin >= 0 ? '#10b981' : '#ef4444' },
    { label: 'REKLAM', value: fmtNum(displayAd), change: pctChange(displayAd, displayAdPrev), color: '#f59e0b' },
    { label: 'TCOS', value: fmtPct(curAcos), change: curAcos - prevAcos, color: curAcos < 25 ? '#10b981' : curAcos < 40 ? '#f59e0b' : '#ef4444' },
  ]

  // ========== Styles ==========
  const tooltipStyle = { contentStyle: { background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)' }, labelStyle: { color: 'var(--text-secondary)' } }
  const selectStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }
  const rangeBtn = (active: boolean): React.CSSProperties => ({ padding: '5px 12px', fontSize: 11, borderRadius: 6, border: '1px solid', borderColor: active ? '#6366f1' : 'var(--border-color)', background: active ? 'rgba(99,102,241,0.15)' : 'transparent', color: active ? '#6366f1' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: active ? 600 : 400, minHeight: 44 })
  const thStyle = (align: string): React.CSSProperties => ({ textAlign: align as any, padding: '8px 8px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' })
  const cardStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20 }

  const plCell = (val: number) => {
    const color = val >= 0 ? '#10b981' : '#ef4444'
    return <td style={{ padding: '8px', textAlign: 'right', color, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtNum(val)}</td>
  }
  const plPrevCell = (val: number) => <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtNum(val)}</td>
  const plChangeCell = (c: number, p: number, invertColor?: boolean) => {
    const change = pctChange(c, p)
    const arrow = changeArrow(invertColor ? -change : change)
    return <td style={{ padding: '8px', textAlign: 'right', color: arrow.color, fontSize: 12, whiteSpace: 'nowrap' }}>{arrow.symbol} {Math.abs(change).toFixed(1)}%</td>
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

  const sidebarContent = <Sidebar />

  if (loading) {
    return (
      <DashboardShell sidebar={sidebarContent}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: '3px solid var(--border-color)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Veriler yükleniyor...</div>
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
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Dashboard</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, margin: 0 }}>
            Genel Bakış · {selectedMonth}
            {selectedMarketplace !== 'all' && ` · ${selectedMpOption.flag} ${selectedMpOption.label}`}
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

      {/* BÖLÜM 1: KPI CARDS */}
      <div className="kpi-grid-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 20 }}>
        {kpis.map((kpi, i) => {
          const arrow = changeArrow(kpi.change)
          return (
            <div key={i} style={{ ...cardStyle, padding: '14px 16px', position: 'relative', overflow: 'hidden', opacity: 0, animation: `fadeInUp 0.6s ease-out ${i * 0.1}s forwards` }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 45, height: 45, borderRadius: '0 14px 0 45px', background: kpi.color, opacity: 0.07 }} />
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{kpi.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-1px', marginBottom: 4 }}>{kpi.value}</div>
              <div style={{ fontSize: 11, color: arrow.color }}>{arrow.symbol} {kpi.change >= 0 ? '+' : ''}{kpi.change.toFixed(1)}% önceki ay</div>
            </div>
          )
        })}
      </div>

      {/* BÖLÜM 2: CHARTS ROW */}
      <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        {/* Monthly Trend */}
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.6s forwards' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Aylık Trend</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>Satış vs Net Kâr</div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={monthlyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...tooltipStyle} formatter={(value: any, name: any) => [fmtNum(Number(value)), name === 'sales' ? 'Satış' : 'Net Kâr']} />
              <Bar dataKey="sales" fill="#6366f1" radius={[4, 4, 0, 0]} name="sales" />
              <Line type="monotone" dataKey="netProfit" stroke="#10b981" strokeWidth={2.5} dot={{ fill: '#10b981', r: 4 }} name="netProfit" />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}><div style={{ width: 12, height: 10, background: '#6366f1', borderRadius: 2 }} />Satış</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}><div style={{ width: 12, height: 3, background: '#10b981', borderRadius: 2 }} />Net Kâr</div>
          </div>
        </div>

        {/* Daily Trend */}
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.7s forwards' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Günlük Satış Trendi</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{selectedMonth}</div>
            </div>
          </div>
          <div className="daily-range-bar" style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setDailyRange('7d')} style={rangeBtn(dailyRange === '7d')}>Son 7 gün</button>
            <button onClick={() => setDailyRange('14d')} style={rangeBtn(dailyRange === '14d')}>Son 14 gün</button>
            <button onClick={() => setDailyRange('month')} style={rangeBtn(dailyRange === 'month')}>Bu ay</button>
            <button onClick={() => setDailyRange('custom')} style={rangeBtn(dailyRange === 'custom')}>Özel aralık</button>
            {dailyRange === 'custom' && (
              <>
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ ...selectStyle, padding: '4px 8px', fontSize: 11 }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>–</span>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ ...selectStyle, padding: '4px 8px', fontSize: 11 }} />
              </>
            )}
          </div>
          {dailyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="day" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...tooltipStyle} formatter={(value: any, name: any) => [fmtNum(Number(value)), name === 'sales' ? 'Satış' : 'Net Kâr']} />
                <Line type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="netProfit" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 190, color: 'var(--text-secondary)', fontSize: 13 }}>Bu ay için günlük veri bulunamadı</div>
          )}
          <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}><div style={{ width: 12, height: 3, background: '#6366f1', borderRadius: 2 }} />Satış</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}><div style={{ width: 12, height: 3, background: '#10b981', borderRadius: 2 }} />Net Kâr</div>
          </div>
        </div>
      </div>

      {/* BÖLÜM 3: MINI CARDS */}
      <div className="mini-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {/* Bu Ay vs Geçen Ay */}
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.8s forwards', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #818cf8)', opacity: 0.06 }} />
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 3, height: 16, borderRadius: 2, background: '#6366f1', display: 'inline-block' }} />
            Bu Ay vs Ge\u00e7en Ay
          </div>
          {miniCompare('Sat\u0131\u015f', cur.sales, prev.sales)}
          {miniCompare('Net K\u00e2r', curNetProfit, prevNetProfit)}
          {miniCompare('Birim', cur.units, prev.units)}
          {miniCompare('Reklam', displayAd, displayAdPrev)}
        </div>

        {/* Geçen Ay vs 2 Ay Önce */}
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.85s forwards', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, #a78bfa, #c4b5fd)', opacity: 0.06 }} />
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 3, height: 16, borderRadius: 2, background: '#a78bfa', display: 'inline-block' }} />
            Ge\u00e7en Ay vs 2 Ay \u00d6nce
          </div>
          {miniCompare('Sat\u0131\u015f', prev.sales, prevPrev.sales)}
          {miniCompare('Net K\u00e2r', prevNetProfit, prevPrevNetProfit)}
          {miniCompare('Birim', prev.units, prevPrev.units)}
          {miniCompare('\u0130ade', prev.refunds, prevPrev.refunds)}
        </div>

        {/* En Çok Satan Ürünler */}
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.9s forwards', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #34d399)', opacity: 0.06 }} />
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 3, height: 16, borderRadius: 2, background: '#10b981', display: 'inline-block' }} />
            {'\uD83C\uDFC6'} En \u00c7ok Satan \u00dcr\u00fcnler
          </div>
          {topProducts.length > 0 ? topProducts.map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 8px', marginBottom: 4, borderRadius: 8, background: i === 0 ? 'rgba(16,185,129,0.06)' : 'transparent', gap: 8, transition: 'background 0.15s' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 600, marginBottom: 1 }}>{p.sku}</div>
                <div style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title.substring(0, 30)}</div>
                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 1 }}>{p.units.toLocaleString('de-DE')} adet</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0, color: '#10b981' }}>{fmtNum(p.sales)}</span>
            </div>
          )) : topSellersMp.map((mp, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < topSellersMp.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{MARKETPLACE_FLAG_MAP[mp.marketplace] || ''} {mp.marketplace.replace('Amazon.', '')}</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{fmtNum(mp.sales)}</span>
            </div>
          ))}
        </div>

        {/* En Çok İade Ürünler */}
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.95s forwards', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, #ef4444, #f87171)', opacity: 0.06 }} />
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 3, height: 16, borderRadius: 2, background: '#ef4444', display: 'inline-block' }} />
            {'\u26A0\uFE0F'} En \u00c7ok \u0130ade \u00dcr\u00fcnler
          </div>
          {topRefundProducts.length > 0 ? topRefundProducts.map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 8px', marginBottom: 4, borderRadius: 8, background: i === 0 ? 'rgba(239,68,68,0.06)' : 'transparent', gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 600, marginBottom: 1 }}>{p.sku}</div>
                <div style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title.substring(0, 30)}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>{fmtNum(p.refunds)}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>%{p.refundRate.toFixed(1)}</div>
              </div>
            </div>
          )) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 10px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>{'\u2705'}</div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>\u0130ade verisi bulunamad\u0131</div>
              <div style={{ fontSize: 10, marginTop: 4 }}>Bu d\u00f6nemde iade kayd\u0131 yok</div>
            </div>
          )}
        </div>
      </div>

      {/* BÖLÜM 4: AI ÖNERILER + HIZLI AKSİYONLAR */}
      <div className="ai-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 20 }}>
        {/* AI Öneriler */}
        <div style={{ ...cardStyle, background: 'var(--ai-gradient)', border: '1px solid var(--border-color)', opacity: 0, animation: 'fadeInUp 0.6s ease-out 1s forwards' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 18 }}>{'\uD83E\uDD16'}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>AI Öneriler</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Yapay zeka tabanlı içgörüler</div>
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

        {/* Hızlı Aksiyonlar */}
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 1.05s forwards' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Hızlı Aksiyonlar</div>
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

      {/* BÖLÜM 5: P&L TABLE */}
      <div style={{ ...cardStyle, marginBottom: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 1.1s forwards' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>P&L Tablosu</div>
        <div className="pl-table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={thStyle('left')}>Kalem</th>
                <th style={thStyle('right')}>{selectedMonth}</th>
                {hasPrev && <th style={thStyle('right')}>{prevMonthStr}</th>}
                <th style={thStyle('right')}>Değişim</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '8px' }}>Sales</td>
                {plCell(cur.sales)}
                {hasPrev && plPrevCell(prev.sales)}
                {plChangeCell(cur.sales, prev.sales)}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '8px' }}>Promo</td>
                {plCell(-cur.promo)}
                {hasPrev && plPrevCell(-prev.promo)}
                {plChangeCell(cur.promo, prev.promo, true)}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '8px' }}>Refunds</td>
                {plCell(-cur.refunds)}
                {hasPrev && plPrevCell(-prev.refunds)}
                {plChangeCell(cur.refunds, prev.refunds, true)}
              </tr>
              {/* Amazon Fees - expandable */}
              <tr style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }} onClick={() => setFeesExpanded(!feesExpanded)}>
                <td style={{ padding: '8px' }}>{feesExpanded ? '▼' : '▶'} Amazon Fees</td>
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
                <td style={{ padding: '8px' }}>COGS</td>
                {plCell(-cur.cogs)}
                {hasPrev && plPrevCell(-prev.cogs)}
                {plChangeCell(cur.cogs, prev.cogs, true)}
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '8px' }}>Subscription</td>
                {plCell(-cur.subscription)}
                {hasPrev && plPrevCell(-prev.subscription)}
                {plChangeCell(cur.subscription, prev.subscription, true)}
              </tr>
              {/* Advertising - expandable */}
              <tr style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }} onClick={() => setAdsExpanded(!adsExpanded)}>
                <td style={{ padding: '8px' }}>{adsExpanded ? '▼' : '▶'} Advertising (SP + SB)</td>
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

      {/* BÖLÜM 6: MARKETPLACE BREAKDOWN */}
      {selectedMarketplace === 'all' && (
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.6s ease-out 1.2s forwards' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Marketplace Kırılımı</div>
          <div className="mp-table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {([
                    { key: 'marketplace' as SortKey, label: 'Marketplace', align: 'left' },
                    { key: 'sales' as SortKey, label: 'Satış', align: 'right' },
                    { key: 'units' as SortKey, label: 'Birim', align: 'right' },
                    { key: 'fees' as SortKey, label: 'Amazon Fees', align: 'right' },
                    { key: 'adSpend' as SortKey, label: 'Reklam', align: 'right' },
                    { key: 'cogs' as SortKey, label: 'COGS', align: 'right' },
                    { key: 'netProfit' as SortKey, label: 'Net Kâr', align: 'right' },
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
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{MARKETPLACE_FLAG_MAP[mp.marketplace] || '🌍'} {mp.marketplace}</td>
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
                  <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Bu ay için marketplace verisi bulunamadı</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}
