'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart,
} from 'recharts'
import KpiCard from '@/components/ui/KpiCard'
import { KpiIcons } from '@/components/ui/KpiIcons'
import AIInsights from '@/components/ui/AIInsights'
import { ImgPlaceholder } from '@/components/ui/Badges'
import { useProductImages } from '@/hooks/useProductImages'
import { COLORS, CARD_STYLE, SELECT_STYLE } from '@/lib/design-tokens'
import { useTranslation } from '@/lib/i18n'

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
  // First the current month, then "all", then the rest
  const first = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
  months.push(first)
  months.push('all')
  cur.setMonth(cur.getMonth() - 1)
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
  if (month === 'all') return 'all' // No previous for all time
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

// Change badge component
const ChangeBadge = ({ text, up }: { text: string; up: boolean }) => (
  <span
    className="rounded-[20px] whitespace-nowrap"
    style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px',
      background: up ? COLORS.greenLight : COLORS.redLight,
      color: up ? COLORS.green : COLORS.red,
    }}
  >
    {text}
  </span>
)

// Custom tooltip
const ChartTooltip = ({ active, payload, label }: any) =>
  active && payload?.[0] ? (
    <div style={{ background: '#1E293B', borderRadius: 8, padding: '8px 14px', boxShadow: '0 4px 12px rgba(0,0,0,.15)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
        {`\u20AC${payload[0].value?.toLocaleString('de-DE')}`}
      </div>
      <div style={{ fontSize: 11, color: '#94A3B8' }}>{label}</div>
    </div>
  ) : null

// Insight priority → border color
const insightBorder = (p: number) => [COLORS.red, '#F97316', '#8B5CF6', '#EC4899', COLORS.green][p - 1] || COLORS.sub

export default function DashboardPage() {
  const { t } = useTranslation()
  const { getBySkuWithFallback: getImgBySku, asinFromSkuWithFallback: asinFromSku } = useProductImages()
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

  const [btmTab, setBtmTab] = useState<'pl' | 'mkt'>('pl')

  // ========== 1. Fetch monthly_pl ==========
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

  // ========== 2. Ad spend data ==========
  useEffect(() => {
    async function fetchAdSpend() {
      const curStart = selectedMonth === 'all' ? '2025-01-01' : getMonthRange(selectedMonth).startDate
      const curEnd = selectedMonth === 'all' ? '2026-12-31' : getMonthRange(selectedMonth).endDate
      const prevMonthStr = selectedMonth === 'all' ? 'all' : getPrevMonth(selectedMonth)
      const prevStart = prevMonthStr === 'all' ? '2024-01-01' : getMonthRange(prevMonthStr).startDate
      const prevEnd = prevMonthStr === 'all' ? '2024-12-31' : getMonthRange(prevMonthStr).endDate

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

  // ========== 3. Daily data ==========
  useEffect(() => {
    async function fetchDaily() {
      let query = supabase
        .from('daily_pl')
        .select('purchase_day, units, sales, est_net_profit, marketplace')
        .order('purchase_day')

      if (selectedMonth !== 'all') {
        query = query.eq('report_month', selectedMonth)
      }

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

  // ========== Aggregate monthly P&L ==========
  const aggregateMonth = (month: string, marketplace: string): PLMonth => {
    let rows = month === 'all' ? [...rawData] : rawData.filter((r: any) => r.report_month === month)
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
  const hasPrev = selectedMonth !== 'all' && prev.sales > 0

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
    const allCurRows = selectedMonth === 'all' ? [...rawData] : rawData.filter((r: any) => r.report_month === selectedMonth)
    const mpCurSales = allCurRows
      .filter((r: any) => r.marketplace === selectedMarketplace)
      .reduce((s: number, r: any) => s + (Number(r.sales) || 0), 0)
    const allCurSales = allCurRows.reduce((s: number, r: any) => s + (Number(r.sales) || 0), 0)
    const curRatio = allCurSales > 0 ? mpCurSales / allCurSales : 0

    displayAd = adSpend.currentTotal * curRatio
    displaySp = adSpend.currentSp * curRatio
    displaySb = adSpend.currentSb * curRatio

    const allPrevRows = prevMonthStr === 'all' ? [...rawData] : rawData.filter((r: any) => r.report_month === prevMonthStr)
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

  // ========== Mini bars from monthly trend ==========
  const generateBars = (key: 'sales' | 'netProfit') => {
    const last7 = monthlyChartData.slice(-7)
    if (last7.length === 0) return [40, 50, 60, 55, 70, 65, 80]
    const vals = last7.map(d => d[key])
    const max = Math.max(...vals.map(Math.abs), 1)
    return vals.map(v => Math.max(Math.round((Math.abs(v) / max) * 100), 5))
  }

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
    const filtered = selectedMonth === 'all' ? [...rawData] : rawData.filter((r: any) => r.report_month === selectedMonth)
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

  // ========== Top products ==========
  const [topProducts, setTopProducts] = useState<{ title: string; sku: string; units: number; sales: number; stock?: number; avgPrice?: number }[]>([])
  const [topRefundProducts, setTopRefundProducts] = useState<{ title: string; sku: string; refunds: number; refundRate: number }[]>([])
  const [champHistory, setChampHistory] = useState<{ month: string; sales: number; units: number }[]>([])

  useEffect(() => {
    async function fetchTopProducts() {
      let q = supabase
        .from('all_orders')
        .select('sku, quantity, item_price, order_status')
        .neq('marketplace', 'Non-Amazon')
      if (selectedMonth !== 'all') {
        const { startDate, endDate } = getMonthRange(selectedMonth)
        q = q.gte('purchase_date', startDate).lte('purchase_date', endDate)
      }
      if (selectedMarketplace !== 'all') q = q.eq('marketplace', selectedMarketplace)

      const { data: orders } = await q.limit(5000)
      const [{ data: parentMap }, { data: stockData }] = await Promise.all([
        supabase.from('parent_asin_map').select('sku, title'),
        supabase.from('v_stock_analysis').select('msku, current_stock, price'),
      ])

      const skuTitle: Record<string, string> = {}
      parentMap?.forEach((p: any) => { if (p.sku && p.title) skuTitle[p.sku] = p.title })
      const skuStock: Record<string, { stock: number; price: number }> = {}
      stockData?.forEach((s: any) => { if (s.msku) skuStock[s.msku] = { stock: s.current_stock || 0, price: s.price || 0 } })

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
      setTopProducts(
        allSkus.sort((a, b) => b[1].units - a[1].units).slice(0, 5)
          .map(([sku, d]) => ({ title: skuTitle[sku] || sku, sku, units: d.units, sales: d.sales, stock: skuStock[sku]?.stock, avgPrice: skuStock[sku]?.price }))
      )
      setTopRefundProducts(
        allSkus.filter(([, d]) => d.refunds > 0).sort((a, b) => b[1].refunds - a[1].refunds).slice(0, 5)
          .map(([sku, d]) => ({ title: skuTitle[sku] || sku, sku, refunds: d.refunds, refundRate: d.sales > 0 ? (d.refunds / d.sales) * 100 : 0 }))
      )

      // Fetch champion's last 2 months performance
      const champSku = allSkus.sort((a, b) => b[1].units - a[1].units)[0]?.[0]
      if (champSku) {
        const now = new Date()
        const histMonths: { month: string; sales: number; units: number }[] = []
        for (let mi = 2; mi >= 1; mi--) {
          const d = new Date(now.getFullYear(), now.getMonth() - mi, 1)
          const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          const { startDate, endDate } = getMonthRange(mKey)
          let hq = supabase.from('all_orders').select('quantity, item_price, order_status').eq('sku', champSku).gte('purchase_date', startDate).lte('purchase_date', endDate)
          if (selectedMarketplace !== 'all') hq = hq.eq('marketplace', selectedMarketplace)
          const { data: hData } = await hq.limit(2000)
          let mSales = 0, mUnits = 0
          hData?.forEach((o: any) => {
            if (o.order_status === 'Shipped') { mUnits += Number(o.quantity) || 0; mSales += Number(o.item_price) || 0 }
          })
          const shortMonth = new Date(d.getFullYear(), d.getMonth(), 1).toLocaleString('en', { month: 'short' })
          histMonths.push({ month: shortMonth, sales: mSales, units: mUnits })
        }
        setChampHistory(histMonths)
      }
    }
    if (!loading) fetchTopProducts()
  }, [selectedMonth, selectedMarketplace, loading])

  // ========== AI Insights ==========
  const aiInsights = useMemo(() => {
    const pool: { priority: number; type: string; color: string; title: string; desc: string }[] = []

    const salesChange = pctChange(cur.sales, prev.sales)
    if (salesChange < -10) {
      pool.push({ priority: 1, type: 'SALES ALERT', color: COLORS.red, title: 'Sharp drop in sales', desc: `Sales dropped ${Math.abs(salesChange).toFixed(1)}% vs last month (\u20ac${Math.round(prev.sales).toLocaleString('de-DE')} \u2192 \u20ac${Math.round(cur.sales).toLocaleString('de-DE')}). Check pricing, stock status, and listing quality.` })
    } else if (salesChange < -3) {
      pool.push({ priority: 3, type: 'SALES TREND', color: COLORS.orange, title: 'Sales slightly declining', desc: `Sales decreased ${Math.abs(salesChange).toFixed(1)}%. May be seasonal — increase campaigns and visibility.` })
    } else if (salesChange > 15) {
      pool.push({ priority: 4, type: 'SALES GROWTH', color: COLORS.green, title: 'Sales growing strongly', desc: `Sales up ${salesChange.toFixed(1)}%! Check stock status and optimize ad budget to sustain this momentum.` })
    } else {
      pool.push({ priority: 6, type: 'SALES', color: COLORS.accent, title: 'Sales stable', desc: `Sales changed %${salesChange >= 0 ? '+' : ''}${salesChange.toFixed(1)} vs last month. Stable at \u20ac${Math.round(cur.sales).toLocaleString('de-DE')} revenue.` })
    }

    const profitChange = pctChange(curNetProfit, prevNetProfit)
    if (curNetProfit < 0) {
      pool.push({ priority: 1, type: 'PROFIT ALERT', color: COLORS.red, title: 'You are losing money!', desc: `Net profit is negative at ${fmtNum(curNetProfit)}. Margin ${curMargin.toFixed(1)}%. Urgent cost analysis needed.` })
    } else if (profitChange < -15) {
      pool.push({ priority: 2, type: 'PROFITABILITY', color: COLORS.red, title: 'Profitability dropping fast', desc: `Net profit dropped ${Math.abs(profitChange).toFixed(1)}% (${fmtNum(prevNetProfit)} \u2192 ${fmtNum(curNetProfit)}). Margin declined from ${prevMargin.toFixed(1)}% to ${curMargin.toFixed(1)}%.` })
    } else if (profitChange > 10) {
      pool.push({ priority: 5, type: 'PROFITABILITY', color: COLORS.green, title: 'Profitability increasing', desc: `Net profit up ${profitChange.toFixed(1)}% (${fmtNum(curNetProfit)}). Margin at ${curMargin.toFixed(1)}% — a successful month.` })
    } else {
      pool.push({ priority: 6, type: 'PROFITABILITY', color: COLORS.accent, title: 'Profit stable', desc: `Net profit ${fmtNum(curNetProfit)}, margin ${curMargin.toFixed(1)}%. Change of %${profitChange >= 0 ? '+' : ''}${profitChange.toFixed(1)} vs last month.` })
    }

    const refundRate = cur.sales > 0 ? (cur.refunds / cur.sales) * 100 : 0
    const prevRefundRate = prev.sales > 0 ? (prev.refunds / prev.sales) * 100 : 0
    const refundChange = pctChange(cur.refunds, prev.refunds)
    if (refundRate > 8) {
      pool.push({ priority: 1, type: 'RETURN ALARM', color: COLORS.red, title: 'Return rate at critical level', desc: `Return rate ${refundRate.toFixed(1)}% (${fmtNum(cur.refunds)}). Last month was ${prevRefundRate.toFixed(1)}%. Product quality and listing descriptions need urgent review.` })
    } else if (refundChange > 20 && cur.refunds > 100) {
      pool.push({ priority: 2, type: 'RETURN ALERT', color: COLORS.orange, title: 'Returns increasing', desc: `Returns up ${refundChange.toFixed(0)}% (${fmtNum(prev.refunds)} \u2192 ${fmtNum(cur.refunds)}). Review the most returned products.` })
    } else if (refundChange < -10) {
      pool.push({ priority: 6, type: 'RETURNS', color: COLORS.green, title: 'Returns decreasing', desc: `Returns down ${Math.abs(refundChange).toFixed(0)}%. Rate at ${refundRate.toFixed(1)}% — healthy level.` })
    } else {
      pool.push({ priority: 7, type: 'RETURNS', color: COLORS.accent, title: 'Return rate stable', desc: `Return rate ${refundRate.toFixed(1)}% (${fmtNum(cur.refunds)}). At normal levels.` })
    }

    const promoRate = cur.sales > 0 ? (cur.promo / cur.sales) * 100 : 0
    const prevPromoRate = prev.sales > 0 ? (prev.promo / prev.sales) * 100 : 0
    const promoChange = pctChange(cur.promo, prev.promo)
    if (promoRate > 10) {
      pool.push({ priority: 2, type: 'PROMO', color: COLORS.red, title: 'Promo cost too high', desc: `Promos make up ${promoRate.toFixed(1)}% of sales (${fmtNum(cur.promo)}). Review discount strategy.` })
    } else if (promoChange > 30 && cur.promo > 50) {
      pool.push({ priority: 3, type: 'PROMO', color: COLORS.orange, title: 'Promo spending increased', desc: `Promos up ${promoChange.toFixed(0)}% (${fmtNum(cur.promo)}). Check coupon ROI.` })
    } else {
      pool.push({ priority: 7, type: 'PROMO', color: COLORS.accent, title: 'Promos balanced', desc: `Promos ${fmtNum(cur.promo)}, ${promoRate.toFixed(1)}% of sales. Balanced strategy.` })
    }

    const adChange = pctChange(displayAd, displayAdPrev)
    if (curAcos > 40) {
      pool.push({ priority: 1, type: 'AD ALARM', color: COLORS.red, title: 'Ad efficiency critical', desc: `TCoS at ${curAcos.toFixed(1)}% — very high (${fmtNum(displayAd)}). Low ROAS campaigns should be paused immediately.` })
    } else if (curAcos > 25) {
      pool.push({ priority: 3, type: 'ADS', color: COLORS.orange, title: 'Ad optimization needed', desc: `TCoS ${curAcos.toFixed(1)}% (${fmtNum(displayAd)}). Last month was ${prevAcos.toFixed(1)}%.` })
    } else if (curAcos < 15 && displayAd > 0) {
      pool.push({ priority: 4, type: 'AD OPPORTUNITY', color: COLORS.green, title: 'Ads very efficient', desc: `TCoS at ${curAcos.toFixed(1)}% — excellent. Increase budget to grow sales volume.` })
    } else {
      pool.push({ priority: 6, type: 'ADS', color: COLORS.accent, title: 'Ad performance good', desc: `TCoS ${curAcos.toFixed(1)}% (${fmtNum(displayAd)}). Efficient spending continues.` })
    }

    pool.sort((a, b) => a.priority - b.priority)
    return pool.slice(0, 5).map(({ priority, ...rest }) => rest)
  }, [cur, prev, curNetProfit, prevNetProfit, curAcos, prevAcos, curMargin, prevMargin, displayAd, displayAdPrev])

  // ========== Quick actions ==========
  const quickActions = useMemo(() => {
    const actions: { status: string; statusColor: string; label: string }[] = []

    if (curAcos > 30) actions.push({ status: 'Urgent', statusColor: COLORS.red, label: 'Pause high ACoS campaigns' })
    if (cur.refunds > prev.refunds * 1.2 && prev.refunds > 0) actions.push({ status: 'Urgent', statusColor: COLORS.red, label: 'Investigate return increase' })

    const lowStockMps = mpGrouped.filter(mp => mp.sales > 500 && mp.margin < 5)
    if (lowStockMps.length > 0) actions.push({ status: 'Planned', statusColor: COLORS.accent, label: 'Improve ' + lowStockMps[0].marketplace + ' margin' })

    if (displayAd > 0 && curAcos < 25) actions.push({ status: 'Planned', statusColor: COLORS.accent, label: 'Increase SB budget' })
    if (curMargin > prevMargin) actions.push({ status: 'Done', statusColor: COLORS.green, label: 'Margin optimization successful' })

    if (actions.length === 0) actions.push({ status: 'Info', statusColor: COLORS.accent, label: 'No new actions needed' })
    return actions
  }, [curAcos, cur.refunds, prev.refunds, mpGrouped, displayAd, curMargin, prevMargin])

  // ========== KPI Config ==========
  const salesBars = generateBars('sales')
  const profitBars = generateBars('netProfit')
  const kpiConfigs = [
    { label: t("dashboard.totalSales").toUpperCase(), value: fmtNum(cur.sales), change: pctChange(cur.sales, prev.sales), icon: KpiIcons.sales, bars: salesBars, color: COLORS.green, light: COLORS.greenLighter, iconBg: COLORS.greenLight },
    { label: t("dashboard.totalUnits").toUpperCase(), value: cur.units.toLocaleString('de-DE'), change: pctChange(cur.units, prev.units), icon: KpiIcons.stock, bars: [40, 55, 48, 62, 70, 65, 78], color: COLORS.accent, light: '#C7D2FE', iconBg: COLORS.accentLight },
    { label: t("dashboard.netProfit").toUpperCase(), value: fmtNum(curNetProfit), change: pctChange(curNetProfit, prevNetProfit), icon: KpiIcons.revenue, bars: profitBars, color: curNetProfit >= 0 ? COLORS.green : COLORS.red, light: curNetProfit >= 0 ? COLORS.greenLighter : COLORS.redLighter, iconBg: curNetProfit >= 0 ? COLORS.greenLight : COLORS.redLight },
    { label: t("dashboard.margin").toUpperCase(), value: fmtPct(curMargin), change: curMargin - prevMargin, icon: KpiIcons.margin, bars: [80, 75, 70, 65, 55, 48, 40], color: COLORS.orange, light: COLORS.orangeLighter, iconBg: COLORS.orangeLight },
    { label: t("dashboard.adSpend").toUpperCase(), value: fmtNum(displayAd), change: pctChange(displayAd, displayAdPrev), icon: KpiIcons.spend, bars: [50, 55, 58, 60, 62, 65, 68], color: '#64748B', light: '#E2E8F0', iconBg: '#F8FAFC' },
    { label: 'TCOS', value: fmtPct(curAcos), change: curAcos - prevAcos, icon: KpiIcons.acos, bars: [55, 58, 60, 58, 62, 64, 66], color: curAcos < 25 ? COLORS.green : curAcos < 40 ? COLORS.orange : COLORS.red, light: curAcos < 25 ? COLORS.greenLighter : curAcos < 40 ? COLORS.orangeLighter : COLORS.redLighter, iconBg: curAcos < 25 ? COLORS.greenLight : curAcos < 40 ? COLORS.orangeLight : COLORS.redLight },
  ]

  // ========== P&L helpers ==========
  const plCell = (val: number) => (
    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 500, color: val >= 0 ? COLORS.green : COLORS.red }}>{fmtNum(val)}</td>
  )
  const plPrevCell = (val: number) => (
    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, color: '#64748B' }}>{fmtNum(val)}</td>
  )
  const plChangeCell = (c: number, p: number, invertColor?: boolean) => {
    const change = pctChange(c, p)
    const up = invertColor ? change < 0 : change > 0
    return (
      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: up ? COLORS.green : COLORS.red }}>
        {change > 0 ? '\u2191' : '\u2193'} {Math.abs(change).toFixed(1)}%
      </td>
    )
  }

  // ========== RENDER ==========
  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '60vh' }}>
        <div className="text-center">
          <div className="skeleton" style={{ width: 48, height: 48, borderRadius: '50%', margin: '0 auto 12px' }} />
          <div style={{ color: COLORS.sub, fontSize: 13 }}>Loading data...</div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold m-0" style={{ color: COLORS.text }}>{t("dashboard.title")}</h1>
          <p className="text-[13px] mt-[2px] m-0" style={{ color: COLORS.sub }}>{t("dashboard.subtitle")}</p>
        </div>
        <div className="flex gap-[10px] flex-wrap">
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={SELECT_STYLE}>
            {monthOptions.map(m => <option key={m} value={m}>{m === 'all' ? `⏳ ${t("dashboard.allTime")}` : m}</option>)}
          </select>
          <select value={selectedMarketplace} onChange={e => setSelectedMarketplace(e.target.value)} style={SELECT_STYLE}>
            {MARKETPLACE_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.flag} {m.value === 'all' ? t("common.allMarketplaces") : m.label}</option>)}
          </select>
        </div>
      </div>

      {/* 6 KPI CARDS */}
      <div className="grid-6" style={{ marginBottom: 20 }}>
        {kpiConfigs.map((k, i) => (
          <KpiCard
            key={i}
            label={k.label}
            value={k.value}
            change={`${k.change > 0 ? '\u2191' : '\u2193'}${Math.abs(k.change).toFixed(1)}%`}
            up={k.change > 0}
            icon={k.icon}
            bars={k.bars}
            color={k.color}
            light={k.light}
            iconBg={k.iconBg}
          />
        ))}
      </div>

      {/* CHARTS ROW */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Monthly Trend */}
        <div style={{ ...CARD_STYLE, padding: '20px 24px', minWidth: 0 }}>
          <div className="text-base font-bold mb-[2px]" style={{ color: COLORS.text }}>{t("dashboard.dailyTrend")}</div>
          <div className="text-xs mb-4" style={{ color: COLORS.sub }}>{t("dashboard.sales")} vs {t("dashboard.netProfit")}</div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={monthlyChartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="0" stroke={COLORS.border} vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: COLORS.sub }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: COLORS.muted }} tickFormatter={v => `\u20AC${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="sales" radius={[4, 4, 0, 0]} fill={COLORS.accent} opacity={0.8} barSize={24} />
              <Line type="monotone" dataKey="netProfit" stroke="#1E293B" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Daily Trend */}
        <div style={{ ...CARD_STYLE, padding: '20px 24px', minWidth: 0 }}>
          <div className="flex justify-between items-start mb-4 flex-wrap gap-[6px]">
            <div>
              <div className="text-base font-bold" style={{ color: COLORS.text }}>{t("dashboard.dailyTrend")}</div>
              <div className="text-xs" style={{ color: COLORS.sub }}>{selectedMonth === 'all' ? t("dashboard.allTime") : selectedMonth}</div>
            </div>
            <div className="flex gap-[3px]">
              {[
                { label: '7d', range: '7d' as DailyRange },
                { label: '14d', range: '14d' as DailyRange },
                { label: 'Month', range: 'month' as DailyRange },
                { label: 'Custom', range: 'custom' as DailyRange },
              ].map(t => (
                <button
                  key={t.range}
                  onClick={() => setDailyRange(t.range)}
                  className="cursor-pointer"
                  style={{
                    padding: '4px 8px', borderRadius: 6, border: '1px solid #E2E8F0',
                    background: dailyRange === t.range ? '#1E293B' : '#fff',
                    color: dailyRange === t.range ? '#fff' : '#64748B',
                    fontSize: 10, fontWeight: 500,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {dailyRange === 'custom' && (
            <div className="flex gap-2 mb-3 items-center flex-wrap">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ ...SELECT_STYLE, padding: '4px 8px', fontSize: 11 }} />
              <span style={{ color: COLORS.sub, fontSize: 11 }}>\u2013</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ ...SELECT_STYLE, padding: '4px 8px', fontSize: 11 }} />
            </div>
          )}
          {dailyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={dailyChartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="0" stroke={COLORS.border} vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: COLORS.sub }} dy={6} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: COLORS.muted }} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="sales" stroke={COLORS.accent} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="netProfit" stroke={COLORS.green} strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center" style={{ height: 200, color: COLORS.sub, fontSize: 13 }}>
              No daily data found for this month
            </div>
          )}
        </div>
      </div>

      {/* 4 MINI CARDS */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        {/* Ayin Sampiyonu */}
        {topProducts.length > 0 ? (() => {
          const champ = topProducts[0]
          const champImg = getImgBySku(champ.sku)
          const champAsin = asinFromSku(champ.sku)
          const champName = (champ.title || champ.sku).substring(0, 70)
          return (
            <div style={{ ...CARD_STYLE, padding: '18px 20px', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLORS.accentLight, color: COLORS.accent }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" /></svg></div>
                <span className="mc-title" style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{t("dashboard.bestseller")}</span>
              </div>
              {/* Product info: text left, image right */}
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="mc-body" style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, lineHeight: '1.4' }}>{champName}</div>
                  <div className="mc-sub" style={{ fontSize: 11, color: COLORS.sub, marginTop: 3 }}>{champ.sku}</div>
                </div>
                {champImg?.image_url ? (
                  <a href={champAsin ? `/products/${champAsin}` : '#'} style={{ flexShrink: 0, lineHeight: 0 }}>
                    <img src={champImg.image_url} alt="" style={{ width: 68, height: 68, borderRadius: 12, objectFit: 'cover', border: `1px solid ${COLORS.border}` }} />
                  </a>
                ) : <ImgPlaceholder size={68} />}
              </div>
              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                <div>
                  <div className="mc-label" style={{ fontSize: 10, color: COLORS.sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{t("dashboard.unitsSold")}</div>
                  <div className="mc-val-lg" style={{ fontSize: 18, fontWeight: 700, color: COLORS.accent }}>{champ.units.toLocaleString('de-DE')}</div>
                </div>
                <div>
                  <div className="mc-label" style={{ fontSize: 10, color: COLORS.sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{t("dashboard.revenue")}</div>
                  <div className="mc-val-lg" style={{ fontSize: 18, fontWeight: 700, color: COLORS.green }}>{fmtNum(champ.sales)}</div>
                </div>
                <div>
                  <div className="mc-label" style={{ fontSize: 10, color: COLORS.sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>In Stock</div>
                  <div className="mc-val-sm" style={{ fontSize: 15, fontWeight: 600, color: (champ.stock || 0) === 0 ? COLORS.red : (champ.stock || 0) < 20 ? COLORS.orange : COLORS.text }}>{champ.stock != null ? champ.stock.toLocaleString('de-DE') : '—'}</div>
                </div>
                <div>
                  <div className="mc-label" style={{ fontSize: 10, color: COLORS.sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Avg Price</div>
                  <div className="mc-val-sm" style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>{champ.avgPrice ? `€${champ.avgPrice.toFixed(2)}` : '—'}</div>
                </div>
              </div>
              {/* Past months - text only */}
              {champHistory.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  {champHistory.map((h, i) => (
                    <div key={i} style={{ flex: 1, padding: '6px 8px', borderRadius: 8, background: '#F8FAFC' }}>
                      <div className="mc-sub" style={{ fontSize: 10, color: COLORS.sub, fontWeight: 500 }}>{h.month}</div>
                      <div className="mc-sub" style={{ fontSize: 12, fontWeight: 600, color: COLORS.muted }}>{h.units.toLocaleString('de-DE')} pcs</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })() : (
          <div style={{ ...CARD_STYLE, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: COLORS.sub }}>{t("dashboard.loadingBestseller")}</span>
          </div>
        )}

        {/* Bu Ay vs Gecen */}
        <div style={{ ...CARD_STYLE, padding: '18px 20px' }}>
          <div className="flex items-center gap-2 mb-[14px]">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: COLORS.accentLight, color: COLORS.accent }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="2" /></svg>
            </div>
            <span className="text-sm font-bold mc-title" style={{ color: COLORS.text }}>{t("dashboard.prevMonth")}</span>
          </div>
          {[
            { l: 'Sales', v: fmtNum(cur.sales), c: pctChange(cur.sales, prev.sales) },
            { l: 'Profit', v: fmtNum(curNetProfit), c: pctChange(curNetProfit, prevNetProfit) },
            { l: 'Units', v: cur.units.toLocaleString('de-DE'), c: pctChange(cur.units, prev.units) },
            { l: 'Ad Spend', v: fmtNum(displayAd), c: pctChange(displayAd, displayAdPrev) },
          ].map(r => (
            <div key={r.l} className="flex justify-between items-center py-2" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              <span className="text-[13px] mc-body" style={{ color: '#64748B' }}>{r.l}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold mc-body" style={{ color: COLORS.text }}>{r.v}</span>
                <ChangeBadge text={`${r.c > 0 ? '\u2191' : '\u2193'}${Math.abs(r.c).toFixed(1)}%`} up={r.c > 0} />
              </div>
            </div>
          ))}
        </div>

        {/* Top 5 Ürünler */}
        <div style={{ ...CARD_STYLE, padding: '18px 20px' }}>
          <div className="flex items-center gap-2 mb-[14px]">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#FEF3C7', color: COLORS.orange }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" /></svg>
            </div>
            <span className="text-sm font-bold mc-title" style={{ color: COLORS.text }}>{t("dashboard.topProducts")}</span>
          </div>
          {topProducts.length > 0 ? (() => {
            const maxSales = topProducts[0]?.sales || 1
            const barColors = ['#EA580C', '#F97316', '#FB923C', '#FDBA74', '#FED7AA']
            return topProducts.slice(0, 5).map((p, i) => {
              const pct = maxSales > 0 ? (p.sales / maxSales) * 100 : 0
              return (
                <div key={i} style={{ marginBottom: i < 4 ? 6 : 0, borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                  {/* Background bar */}
                  <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, background: `${barColors[i]}15`, borderRadius: 8, transition: 'width 0.5s ease' }} />
                  <div className="flex items-center justify-between" style={{ position: 'relative', padding: '8px 12px' }}>
                    <div className="flex items-center gap-[10px]">
                      <span className="flex items-center justify-center shrink-0 text-[11px] mc-sub font-bold" style={{ width: 22, height: 22, borderRadius: '50%', background: barColors[i], color: '#fff' }}>{i + 1}</span>
                      <span className="text-[13px] mc-body font-semibold" style={{ color: COLORS.text }}>{p.sku}</span>
                    </div>
                    <span className="text-[13px] mc-body font-bold" style={{ color: barColors[i] }}>{fmtNum(p.sales)}</span>
                  </div>
                </div>
              )
            })
          })() : (
            <div className="text-center py-4" style={{ color: COLORS.sub, fontSize: 12 }}>{t("common.loading")}</div>
          )}
        </div>

        {/* Hizli Aksiyonlar */}
        <div style={{ ...CARD_STYLE, padding: '18px 20px' }}>
          <div className="flex items-center gap-2 mb-[14px]">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#FDF2F8', color: '#EC4899' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" /></svg>
            </div>
            <span className="text-sm font-bold mc-title" style={{ color: COLORS.text }}>{t("dashboard.quickActions")}</span>
          </div>
          {quickActions.map((a, i) => (
            <div key={i} className="flex items-center justify-between mb-1 rounded-lg" style={{ padding: '10px 12px', background: '#F8FAFC' }}>
              <div className="flex items-center gap-2">
                <div className="rounded-full" style={{ width: 6, height: 6, background: a.statusColor }} />
                <span className="text-xs mc-body font-medium" style={{ color: COLORS.text }}>{a.label}</span>
              </div>
              <span className="text-[10px] mc-sub font-semibold" style={{ color: a.statusColor }}>{a.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI ONERILER */}
      <AIInsights
        title={t("dashboard.aiInsights")}
        subtitle={t("dashboard.aiSubtitle")}
        insights={aiInsights.map((ins, i) => ({
          type: ins.type,
          title: ins.title,
          desc: ins.desc,
          color: insightBorder(i + 1),
        }))}
      />

      {/* P&L + MARKETPLACE TABBED */}
      <div style={{ ...CARD_STYLE, padding: 0, overflow: 'hidden' }}>
        <div className="flex" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          {[
            { id: 'pl' as const, l: t("dashboard.costsFees") },
            { id: 'mkt' as const, l: t("dashboard.marketplacePerf") },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setBtmTab(t.id)}
              className="cursor-pointer"
              style={{
                padding: '14px 24px', border: 'none', background: 'transparent',
                fontSize: 14, fontWeight: btmTab === t.id ? 600 : 400,
                color: btmTab === t.id ? COLORS.accent : COLORS.sub,
                borderBottom: btmTab === t.id ? `2px solid ${COLORS.accent}` : '2px solid transparent',
              }}
            >
              {t.l}
            </button>
          ))}
        </div>

        <div style={{ padding: '20px 24px' }}>
          {btmTab === 'pl' && (
            <div className="modern-scroll" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>
                    {[t("dashboard.item"), selectedMonth === 'all' ? t("dashboard.allTime") : selectedMonth, ...(hasPrev && selectedMonth !== 'all' ? [prevMonthStr] : []), ...(selectedMonth !== 'all' ? [t("dashboard.change")] : [])].map((h, hi) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: hi === 0 ? 'left' : 'right', fontSize: 12, fontWeight: 600, color: COLORS.sub }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Sales */}
                  <tr className="table-row-hover" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: COLORS.text }}>{t("dashboard.sales")}</td>
                    {plCell(cur.sales)}
                    {hasPrev && plPrevCell(prev.sales)}
                    {plChangeCell(cur.sales, prev.sales)}
                  </tr>
                  {/* Promo */}
                  <tr className="table-row-hover" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: COLORS.text }}>{t("dashboard.promo")}</td>
                    {plCell(-cur.promo)}
                    {hasPrev && plPrevCell(-prev.promo)}
                    {plChangeCell(cur.promo, prev.promo, true)}
                  </tr>
                  {/* Refunds */}
                  <tr className="table-row-hover" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: COLORS.text }}>{t("dashboard.refunds")}</td>
                    {plCell(-cur.refunds)}
                    {hasPrev && plPrevCell(-prev.refunds)}
                    {plChangeCell(cur.refunds, prev.refunds, true)}
                  </tr>
                  {/* Amazon Fees - expandable */}
                  <tr className="table-row-hover cursor-pointer" onClick={() => setFeesExpanded(!feesExpanded)} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: COLORS.text }}>{feesExpanded ? '\u25BC' : '\u25B6'} {t("dashboard.fees")}</td>
                    {plCell(-curTotalFees)}
                    {hasPrev && plPrevCell(-prevTotalFees)}
                    {plChangeCell(curTotalFees, prevTotalFees, true)}
                  </tr>
                  {feesExpanded && [
                    { label: t("dashboard.commission"), curV: cur.commission, prevV: prev.commission },
                    { label: t("dashboard.fbaFees"), curV: cur.fba, prevV: prev.fba },
                    { label: t("dashboard.storageFees"), curV: cur.storage, prevV: prev.storage },
                    { label: t("dashboard.returnMgmt"), curV: cur.return_mgmt, prevV: prev.return_mgmt },
                    { label: t("dashboard.digitalServices"), curV: cur.digital_fba + cur.digital_sell, prevV: prev.digital_fba + prev.digital_sell },
                  ].map((sub, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}`, background: '#FAFBFE' }}>
                      <td style={{ padding: '10px 12px 10px 32px', fontSize: 12, color: COLORS.sub }}>{sub.label}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: COLORS.red }}>{fmtNum(-sub.curV)}</td>
                      {hasPrev && <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtNum(-sub.prevV)}</td>}
                      {plChangeCell(sub.curV, sub.prevV, true)}
                    </tr>
                  ))}
                  {/* COGS */}
                  <tr className="table-row-hover" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: COLORS.text }}>{t("dashboard.cogs")}</td>
                    {plCell(-cur.cogs)}
                    {hasPrev && plPrevCell(-prev.cogs)}
                    {plChangeCell(cur.cogs, prev.cogs, true)}
                  </tr>
                  {/* Subscription */}
                  <tr className="table-row-hover" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: COLORS.text }}>{t("dashboard.subscription")}</td>
                    {plCell(-cur.subscription)}
                    {hasPrev && plPrevCell(-prev.subscription)}
                    {plChangeCell(cur.subscription, prev.subscription, true)}
                  </tr>
                  {/* Advertising - expandable */}
                  <tr className="table-row-hover cursor-pointer" onClick={() => setAdsExpanded(!adsExpanded)} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: COLORS.text }}>{adsExpanded ? '\u25BC' : '\u25B6'} {t("dashboard.adSpend")}</td>
                    {plCell(-displayAd)}
                    {hasPrev && plPrevCell(-displayAdPrev)}
                    {plChangeCell(displayAd, displayAdPrev, true)}
                  </tr>
                  {adsExpanded && [
                    { label: 'SP (Sponsored Products)', curV: displaySp, prevV: displaySpPrev },
                    { label: 'SB (Sponsored Brands)', curV: displaySb, prevV: displaySbPrev },
                  ].map((sub, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}`, background: '#FAFBFE' }}>
                      <td style={{ padding: '10px 12px 10px 32px', fontSize: 12, color: COLORS.sub }}>{sub.label}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: COLORS.red }}>{fmtNum(-sub.curV)}</td>
                      {hasPrev && <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtNum(-sub.prevV)}</td>}
                      {plChangeCell(sub.curV, sub.prevV, true)}
                    </tr>
                  ))}
                  {/* Net Profit */}
                  <tr style={{ borderTop: `2px solid ${COLORS.border}`, background: '#FAFBFE' }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: COLORS.text }}>{'\u25B8'} {t("dashboard.netProfit")}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: curNetProfit >= 0 ? COLORS.green : COLORS.red }}>{fmtNum(curNetProfit)}</td>
                    {hasPrev && <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, color: '#64748B' }}>{fmtNum(prevNetProfit)}</td>}
                    {plChangeCell(curNetProfit, prevNetProfit)}
                  </tr>
                  {/* Margin */}
                  <tr style={{ background: '#FAFBFE' }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: COLORS.text }}>{'\u25B8'} {t("dashboard.margin")} %</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: curMargin >= 0 ? COLORS.green : COLORS.red }}>{fmtPct(curMargin)}</td>
                    {hasPrev && <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, color: '#64748B' }}>{fmtPct(prevMargin)}</td>}
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: curMargin >= prevMargin ? COLORS.green : COLORS.red }}>
                      {curMargin >= prevMargin ? '\u2191' : '\u2193'} {Math.abs(curMargin - prevMargin).toFixed(1)}pp
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {btmTab === 'mkt' && (
            <div className="modern-scroll" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>
                    {([
                      { key: 'marketplace' as SortKey, label: t("dashboard.byMarketplace"), align: 'left' },
                      { key: 'sales' as SortKey, label: `${t("dashboard.sales")} \u2193`, align: 'right' },
                      { key: 'units' as SortKey, label: t("dashboard.totalUnits"), align: 'right' },
                      { key: 'fees' as SortKey, label: t("dashboard.fees"), align: 'right' },
                      { key: 'adSpend' as SortKey, label: t("dashboard.adSpend"), align: 'right' },
                      { key: 'cogs' as SortKey, label: t("dashboard.cogs"), align: 'right' },
                      { key: 'netProfit' as SortKey, label: t("dashboard.netProfit"), align: 'right' },
                      { key: 'margin' as SortKey, label: t("dashboard.margin"), align: 'right' },
                    ]).map(h => (
                      <th
                        key={h.key}
                        onClick={() => handleMpSort(h.key)}
                        className="cursor-pointer select-none whitespace-nowrap"
                        style={{ padding: '10px 12px', textAlign: h.align as any, fontSize: 12, fontWeight: 600, color: mpSortKey === h.key ? COLORS.accent : COLORS.sub }}
                      >
                        {h.label}{sortIndicator(h.key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mpRows.map((mp, i) => (
                    <tr
                      key={i}
                      className="table-row-hover cursor-pointer"
                      style={{ borderBottom: `1px solid ${COLORS.border}` }}
                      onClick={() => setSelectedMarketplace(mp.marketplace)}
                    >
                      <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: COLORS.text }}>{MARKETPLACE_FLAG_MAP[mp.marketplace] || '\u{1F30D}'} {mp.marketplace}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: COLORS.text }}>{fmtNum(mp.sales)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, color: '#64748B' }}>{mp.units}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, color: COLORS.red }}>{fmtNum(mp.fees)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, color: COLORS.orange }}>{fmtNum(mp.adSpend)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, color: '#64748B' }}>{fmtNum(mp.cogs)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: mp.netProfit >= 0 ? COLORS.green : COLORS.red }}>{fmtNum(mp.netProfit)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: mp.margin >= 0 ? COLORS.green : COLORS.red }}>{fmtPct(mp.margin)}</td>
                    </tr>
                  ))}
                  {mpRows.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: COLORS.sub }}>No marketplace data found for this month</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
