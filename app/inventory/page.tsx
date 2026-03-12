'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart,
} from 'recharts'
import KpiCard from '@/components/ui/KpiCard'
import { KpiIcons } from '@/components/ui/KpiIcons'
import AIInsights, { type Insight } from '@/components/ui/AIInsights'
import { StockStatusBadge, ImgPlaceholder } from '@/components/ui/Badges'
import ProductCell from '@/components/ui/ProductCell'
import { useProductImages } from '@/hooks/useProductImages'
import { COLORS, CARD_STYLE, SELECT_STYLE, TH_STYLE, STOCK_STATUS } from '@/lib/design-tokens'
import { useTranslation } from '@/lib/i18n'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface StockRow {
  msku: string
  asin: string
  fnsku: string
  product_name: string
  price: number
  current_stock: number
  reserved: number
  unsellable: number
  inbound_working: number
  inbound_shipped: number
  inbound_receiving: number
  inbound_total: number
  total_quantity: number
  snapshot_date: string
  sales_30d: number
  sales_90d: number
  sales_year: number
  avg_daily_sales: number
  days_of_stock: number
  returns_total: number
  storage_fee_monthly: number
  weight: number
  product_size_tier: string
  sessions: number
  cvr: number
  buy_box_pct: number
  revenue: number
  orders: number
  refund_rate: number
  parent_asin: string
  stock_status: string
  daily_revenue_loss: number
}

interface MonthlyShipment {
  month: string
  units: number
}

type StockStatus = 'all' | 'out' | 'critical' | 'warning' | 'healthy' | 'overstock' | 'dead' | 'inactive'
type SortKey = 'msku' | 'current_stock' | 'inbound_total' | 'avg_daily_sales' | 'sales_30d' | 'sales_year' | 'sessions' | 'cvr' | 'buy_box_pct' | 'days_of_stock' | 'daily_revenue_loss'
type SortDir = 'asc' | 'desc'
type MiddleTab = 'ai' | 'lowcvr' | 'stars'

const fmtNum = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 0 })
const fmtCur = (v: number) => `€${v.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`
const fmtDec = (v: number, d = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

const sizeBarColors = COLORS.costBars

function extractSize(sku: string): string {
  if (!sku) return 'Other'
  const upper = sku.toUpperCase()
  if (upper.endsWith('XXXL')) return 'XXXL'
  if (upper.endsWith('XXL')) return 'XXL'
  if (upper.endsWith('XL')) return 'XL'
  if (upper.endsWith('XS')) return 'XS'
  if (upper.endsWith('S')) return 'S'
  if (upper.endsWith('M')) return 'M'
  if (upper.endsWith('L')) return 'L'
  return 'Other'
}

const MONTH_ABBR: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  const shortYear = y.substring(2)
  const monthName = MONTH_ABBR[m] || m
  if (m === '01' || m === '03') return `${monthName} ${shortYear}`
  return monthName
}

export default function InventoryPage() {
  const { t } = useTranslation()
  const { getBySkuWithFallback: getBySku, asinFromSkuWithFallback: asinFromSku } = useProductImages()
  const [data, setData] = useState<StockRow[]>([])
  const [monthlyShipments, setMonthlyShipments] = useState<MonthlyShipment[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StockStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('daily_revenue_loss')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedRow, setSelectedRow] = useState<StockRow | null>(null)
  const [middleTab, setMiddleTab] = useState<MiddleTab>('ai')
  const [expandedInsight, setExpandedInsight] = useState<number | null>(null)
  const [aiApiInsights, setAiApiInsights] = useState<{ type: string; title: string; description: string; action: string; color: string; priority: number }[] | null>(null)
  const [aiApiLoading, setAiApiLoading] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data: stockData } = await supabase
        .from('v_stock_analysis')
        .select('*')
      setData(stockData || [])

      const { data: monthlyPl } = await supabase
        .from('monthly_pl')
        .select('report_month, units')
        .order('report_month', { ascending: true })

      const monthMap: Record<string, number> = {}
      monthlyPl?.forEach((r: any) => {
        const m = (r.report_month || '').substring(0, 7)
        if (m) monthMap[m] = (monthMap[m] || 0) + (Number(r.units) || 0)
      })
      const sorted = Object.entries(monthMap)
        .map(([month, units]) => ({ month, units }))
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-12)
      setMonthlyShipments(sorted)
      setLoading(false)
    }
    fetchData()
  }, [])

  // Fetch AI insights from Anthropic API
  useEffect(() => {
    if (data.length === 0) return
    async function fetchAiInsights() {
      setAiApiLoading(true)
      try {
        const outOfStock = data.filter(r => r.stock_status === 'out')
        const critical = data.filter(r => r.stock_status === 'critical')
        const overstock = data.filter(r => r.stock_status === 'overstock')
        const dead = data.filter(r => r.stock_status === 'dead')
        const lowCvr = data.filter(r => (r.sessions || 0) > 300 && (r.cvr || 0) < 5 && (r.cvr || 0) > 0)
        const highCvr = data.filter(r => (r.cvr || 0) > 12 && (r.sessions || 0) > 50)
        const totalLoss = outOfStock.reduce((s, r) => s + (r.daily_revenue_loss || 0), 0)

        const sizeDist: Record<string, { sales: number; outCount: number; stock: number }> = {}
        data.forEach(r => {
          const sz = extractSize(r.msku)
          if (!sizeDist[sz]) sizeDist[sz] = { sales: 0, outCount: 0, stock: 0 }
          sizeDist[sz].sales += Number(r.sales_year || 0)
          sizeDist[sz].stock += Number(r.current_stock || 0)
          if (r.stock_status === 'out') sizeDist[sz].outCount++
        })

        const summary = {
          outOfStockCount: outOfStock.length,
          totalDailyLoss: totalLoss.toFixed(0),
          topLossProducts: outOfStock.sort((a, b) => (b.daily_revenue_loss || 0) - (a.daily_revenue_loss || 0)).slice(0, 5).map(d => `${d.msku} (€${(d.daily_revenue_loss || 0).toFixed(0)}/gun, CVR %${(d.cvr || 0).toFixed(1)})`).join(', '),
          criticalCount: critical.length,
          topCriticalProducts: critical.sort((a, b) => (a.days_of_stock || 0) - (b.days_of_stock || 0)).slice(0, 5).map(d => `${d.msku} (${(d.days_of_stock || 0).toFixed(0)} gun, CVR %${(d.cvr || 0).toFixed(1)})`).join(', '),
          overstockCount: overstock.length,
          overstockUnits: overstock.reduce((s, d) => s + (d.current_stock || 0), 0),
          deadCount: dead.length,
          deadUnits: dead.reduce((s, d) => s + (d.current_stock || 0), 0),
          lowCvrCount: lowCvr.length,
          topLowCvr: lowCvr.slice(0, 3).map(d => `${d.msku} (${d.sessions} sessions, CVR %${(d.cvr || 0).toFixed(1)})`).join(', '),
          highCvrCount: highCvr.length,
          topHighCvr: highCvr.slice(0, 5).map(d => `${d.msku} (CVR %${(d.cvr || 0).toFixed(1)}, stock: ${d.current_stock})`).join(', '),
          sizeDistribution: Object.entries(sizeDist).map(([sz, d]) => `${sz}: ${d.sales} sales, ${d.outCount} out of stock, ${d.stock} stock`).join(' | '),
        }

        const res = await fetch('/api/stock-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(summary),
        })
        const result = await res.json()
        if (result.insights) setAiApiInsights(result.insights)
      } catch {
        // fallback to local insights
      }
      setAiApiLoading(false)
    }
    fetchAiInsights()
  }, [data])

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { out: 0, critical: 0, warning: 0, healthy: 0, overstock: 0, dead: 0, inactive: 0 }
    data.forEach(r => { if (r.stock_status && counts[r.stock_status] !== undefined) counts[r.stock_status]++ })
    return counts
  }, [data])

  const totalStock = useMemo(() => data.reduce((s, r) => s + (r.current_stock || 0), 0), [data])
  const totalStorage = useMemo(() => data.reduce((s, r) => s + (r.storage_fee_monthly || 0), 0), [data])
  const totalDailyLoss = useMemo(() => data.filter(r => r.stock_status === 'out').reduce((s, r) => s + (r.daily_revenue_loss || 0), 0), [data])

  // Filter & sort
  const filteredData = useMemo(() => {
    let rows = [...data]
    if (statusFilter !== 'all') rows = rows.filter(r => r.stock_status === statusFilter)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter(r =>
        (r.msku || '').toLowerCase().includes(q) ||
        (r.product_name || '').toLowerCase().includes(q) ||
        (r.asin || '').toLowerCase().includes(q)
      )
    }
    rows.sort((a, b) => {
      const aV = a[sortKey] ?? 0
      const bV = b[sortKey] ?? 0
      if (typeof aV === 'string' && typeof bV === 'string') return sortDir === 'asc' ? aV.localeCompare(bV) : bV.localeCompare(aV)
      return sortDir === 'asc' ? (aV as number) - (bV as number) : (bV as number) - (aV as number)
    })
    return rows
  }, [data, statusFilter, searchQuery, sortKey, sortDir])

  // Size distribution — by yearly sales SUM, not SKU count
  const sizeDistribution = useMemo(() => {
    const sizes: Record<string, { sales: number; outCount: number }> = {}
    data.forEach(r => {
      const s = extractSize(r.msku)
      if (!sizes[s]) sizes[s] = { sales: 0, outCount: 0 }
      sizes[s].sales += Number(r.sales_year || 0)
      if (r.stock_status === 'out') sizes[s].outCount++
    })
    const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Other']
    return order
      .filter(s => sizes[s])
      .map(name => ({
        name,
        sales: Math.round(sizes[name].sales),
        outCount: sizes[name].outCount,
        fill: name === 'M' ? '#ef4444' : (name === 'XXL' || name === 'XXXL') ? '#3b82f6' : '#6366f1',
      }))
  }, [data])

  // Low CVR products (sessions > 300, cvr < 5)
  const lowCvrProducts = useMemo(() =>
    data.filter(r => (r.sessions || 0) > 300 && (r.cvr || 0) < 5)
      .sort((a, b) => (a.cvr || 0) - (b.cvr || 0))
      .slice(0, 15)
  , [data])

  // Star products (cvr > 12)
  const starProducts = useMemo(() =>
    data.filter(r => (r.cvr || 0) > 12 && (r.sessions || 0) > 50)
      .sort((a, b) => (b.cvr || 0) - (a.cvr || 0))
      .slice(0, 15)
  , [data])

  // AI Insights
  const aiInsights = useMemo(() => {
    const insights: { type: string; title: string; desc: string; detail: string; color: string; priority: number }[] = []

    // 1. Out of stock loss — specific SKU and numbers
    const outOfStock = data.filter(r => r.stock_status === 'out').sort((a, b) => (b.daily_revenue_loss || 0) - (a.daily_revenue_loss || 0))
    const dailyLoss = outOfStock.reduce((s, r) => s + (r.daily_revenue_loss || 0), 0)
    if (outOfStock.length > 0) {
      const topLoss = outOfStock.slice(0, 3)
      const detailLines = topLoss.map(r => {
        const cvrInfo = (r.cvr || 0) > 10 ? ` CVR %${fmtDec(r.cvr)} — high-converting product out of stock!` : ''
        return `${r.msku}: ${fmtCur(r.daily_revenue_loss || 0)}/day loss${cvrInfo}`
      }).join(' | ')
      insights.push({
        type: 'Stock Loss', title: `${outOfStock.length} products out of stock, daily ${fmtCur(dailyLoss)} loss`,
        desc: `You are losing an estimated ${fmtCur(dailyLoss)} daily revenue due to out-of-stock products.`,
        detail: `${detailLines}${outOfStock.length > 3 ? ` and ${outOfStock.length - 3} more products.` : '.'} Place urgent orders.`,
        color: '#ef4444', priority: 1,
      })
    }

    // 2. Critical stock warning — days and sales velocity
    const critical = data.filter(r => r.stock_status === 'critical').sort((a, b) => (a.days_of_stock || 0) - (b.days_of_stock || 0))
    if (critical.length > 0) {
      const topCritical = critical.slice(0, 4)
      const detailLines = topCritical.map(r =>
        `${r.msku}: ${r.days_of_stock?.toFixed(0) || 0} days left, ${fmtDec(r.avg_daily_sales || 0)} units/day sales`
      ).join(' | ')
      insights.push({
        type: 'Critical Stock', title: `${critical.length} products at critical level`,
        desc: `These products may run out of stock within 7 days.`,
        detail: `${detailLines}. Take quick action from the order planning page.`,
        color: '#f97316', priority: 2,
      })
    }

    // 3. CVR opportunity — highest traffic low CVR products
    const highTrafficLowCvr = data.filter(r => (r.sessions || 0) > 500 && (r.cvr || 0) < 5 && (r.cvr || 0) > 0)
      .sort((a, b) => (b.sessions || 0) - (a.sessions || 0))
    if (highTrafficLowCvr.length > 0) {
      const potentialRevenue = highTrafficLowCvr.reduce((s, r) => {
        const potentialOrders = (r.sessions || 0) * 0.05
        return s + potentialOrders * (r.price || 0)
      }, 0)
      const topItems = highTrafficLowCvr.slice(0, 3)
      const detailLines = topItems.map(r =>
        `${r.msku}: ${fmtNum(r.sessions || 0)} sessions, CVR %${fmtDec(r.cvr || 0)}, price ${fmtCur(r.price || 0)}`
      ).join(' | ')
      insights.push({
        type: 'CVR Opportunity', title: `${highTrafficLowCvr.length} products with CVR improvement opportunity`,
        desc: `High traffic but low conversion rate. Estimated additional revenue if CVR reaches 5%: ${fmtCur(potentialRevenue)}.`,
        detail: `${detailLines}. Listing optimization, A+ content and price review recommended.`,
        color: '#6366f1', priority: 3,
      })
    }

    // 4. Size analysis — yearly sales and out-of-stock count
    const sizeGroups = sizeDistribution.filter(s => s.name !== 'Other')
    if (sizeGroups.length > 0) {
      const topSaleSize = [...sizeGroups].sort((a, b) => b.sales - a.sales)[0]
      const mostOutSize = [...sizeGroups].sort((a, b) => b.outCount - a.outCount)[0]
      insights.push({
        type: 'Size Analysis', title: `Best selling size: ${topSaleSize.name} (${fmtNum(topSaleSize.sales)} units/year)`,
        desc: `Most out-of-stock size: ${mostOutSize.name} (${mostOutSize.outCount} SKUs out of stock).`,
        detail: `Size distribution: ${sizeGroups.slice(0, 6).map(s => `${s.name}: ${fmtNum(s.sales)} sales, ${s.outCount} out of stock`).join(', ')}. Prioritize out-of-stock sizes.`,
        color: '#f59e0b', priority: 4,
      })
    }

    // 5. Storage cost — specific products
    const highStorageFee = data.filter(r => (r.storage_fee_monthly || 0) > 50).sort((a, b) => (b.storage_fee_monthly || 0) - (a.storage_fee_monthly || 0))
    if (highStorageFee.length > 0) {
      const totalHighFee = highStorageFee.reduce((s, r) => s + (r.storage_fee_monthly || 0), 0)
      const topFee = highStorageFee.slice(0, 3)
      const detailLines = topFee.map(r =>
        `${r.msku}: ${fmtCur(r.storage_fee_monthly || 0)}/month, ${fmtDec(r.avg_daily_sales || 0)} units/day sales, ${r.days_of_stock?.toFixed(0) || '?'} days stock`
      ).join(' | ')
      insights.push({
        type: 'Cost', title: `${highStorageFee.length} products with high storage (${fmtCur(totalHighFee)}/month)`,
        desc: `Total monthly storage: ${fmtCur(totalStorage)}. High-cost products need attention.`,
        detail: `${detailLines}. Consider removal or price reduction for low-selling products.`,
        color: '#f59e0b', priority: 5,
      })
    }

    // 6. Star products — stock status
    if (starProducts.length > 0) {
      const topStars = starProducts.slice(0, 3)
      const detailLines = topStars.map(r => {
        const stockWarn = r.stock_status === 'out' ? ' — OUT OF STOCK!' : r.stock_status === 'critical' ? ` — ${r.days_of_stock?.toFixed(0)} days left!` : ` — ${fmtNum(r.current_stock || 0)} units in stock`
        return `${r.msku}: CVR %${fmtDec(r.cvr || 0)}, ${fmtNum(r.sessions || 0)} sessions${stockWarn}`
      }).join(' | ')
      insights.push({
        type: 'Star Products', title: `${starProducts.length} products with 12%+ CVR performing brilliantly`,
        desc: `These products have very high conversion rates.`,
        detail: `${detailLines}. Never let these products go out of stock and increase ad budget.`,
        color: '#22c55e', priority: 6,
      })
    }

    return insights.sort((a, b) => a.priority - b.priority).slice(0, 6)
  }, [data, sizeDistribution, starProducts, totalStorage])

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }, [sortKey])

  const sortIndicator = (key: SortKey) => sortKey !== key ? ' ⇅' : sortDir === 'asc' ? ' ↑' : ' ↓'

  const getCvrColor = (cvr: number) => {
    if (cvr >= 12) return COLORS.green
    if (cvr >= 8) return COLORS.text
    if (cvr >= 5) return COLORS.orange
    return COLORS.red
  }

  const getDetailMessage = (row: StockRow) => {
    switch (row.stock_status) {
      case 'out': return `This product is out of stock! You are losing an estimated ${fmtCur(row.daily_revenue_loss || 0)} daily revenue. Place an urgent order.`
      case 'critical': return `Stock will run out in ${row.days_of_stock?.toFixed(0) || 0} days. Create an order immediately from the order planning page.`
      case 'warning': return `Stock level is low (${row.days_of_stock?.toFixed(0) || 0} days). Plan an order soon.`
      case 'healthy': return `Stock level is healthy (${row.days_of_stock?.toFixed(0) || 0} days). No issues at current sales velocity.`
      case 'overstock': return `Overstock! ${row.days_of_stock?.toFixed(0) || 0} days of stock available. Consider promotions or price reductions to lower storage costs.`
      case 'dead': return `Dead stock. This product is not selling. Consider removal order or deep discount to liquidate stock.`
      default: return `Product is inactive. Check the listing.`
    }
  }

  // Map AI insights to AIInsights component format — show local insights immediately, replace with API results when ready
  const mappedInsights = useMemo((): Insight[] => {
    // Always use local insights first, replace with API insights when available
    if (aiApiInsights) {
      return aiApiInsights.map((ins: any) => ({
        type: ins.type,
        title: ins.title,
        desc: ins.description,
        color: ins.color,
      }))
    }
    return aiInsights.map((ins: any) => ({
      type: ins.type,
      title: ins.title,
      desc: ins.detail || ins.desc,
      color: ins.color,
    }))
  }, [aiApiInsights, aiInsights])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${COLORS.border}`, borderTopColor: COLORS.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ color: COLORS.sub, fontSize: 13 }}>Loading inventory data...</div>
        </div>
      </div>
    )
  }

  const snapshotDate = data[0]?.snapshot_date || ''
  const maxSizeSales = Math.max(...sizeDistribution.map(d => d.sales)) || 1

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, margin: 0 }}>{t("inventory.title")}</h1>
          <p style={{ fontSize: 13, color: COLORS.sub, margin: '2px 0 0' }}>
            {snapshotDate && `${t("inventory.lastUpdated")}: ${snapshotDate} · `}{t("inventory.fbaStatus")} · {data.length} SKU
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {statusCounts.out > 0 && (
            <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: COLORS.redLight, color: COLORS.red }}>
              {statusCounts.out} {t("inventory.outOfStock")} · {fmtCur(totalDailyLoss)}/day
            </span>
          )}
          {statusCounts.critical > 0 && (
            <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: COLORS.orangeLight, color: '#D97706' }}>
              {statusCounts.critical} {t("inventory.critical")}
            </span>
          )}
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <KpiCard label={t("inventory.totalStock")} value={fmtNum(totalStock)} change={`${data.length} SKU`} up={true}
          icon={KpiIcons.stock} bars={[50, 55, 60, 58, 62, 65, 68]} color={COLORS.accent} light="#C7D2FE" iconBg={COLORS.accentLight} />
        <KpiCard label={t("inventory.outLabel")} value={String(statusCounts.out)} change={`${fmtCur(totalDailyLoss)}${t("inventory.dayLoss")}`} up={false}
          icon={KpiIcons.warning} bars={[90, 85, 80, 75, 72, 68, 65]} color={COLORS.red} light={COLORS.redLighter} iconBg={COLORS.redLight} />
        <KpiCard label={t("inventory.criticalDays")} value={String(statusCounts.critical)} change={t("inventory.urgentOrder")} up={false}
          icon={KpiIcons.clock} bars={[70, 65, 60, 55, 50, 48, 45]} color={COLORS.orange} light={COLORS.orangeLighter} iconBg={COLORS.orangeLight} />
        <KpiCard label={t("inventory.storageMonth")} value={fmtCur(totalStorage)} change={`${data.length} ${t("common.records")}`} up={true}
          icon={KpiIcons.spend} bars={[60, 62, 65, 63, 60, 58, 55]} color={COLORS.orange} light={COLORS.orangeLighter} iconBg={COLORS.orangeLight} />
      </div>

      {/* Charts: Trend + Size */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div style={{ ...CARD_STYLE, padding: '18px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, marginBottom: 2 }}>{t("inventory.monthlyTrend")}</div>
          <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 14 }}>{t("inventory.unitsSold")} · {t("inventory.last12")}</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthlyShipments} margin={{ top: 5, right: 0, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="0" stroke={COLORS.border} vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: COLORS.sub }} dy={6} tickFormatter={v => formatMonthLabel(v)} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: COLORS.muted }} />
              <Tooltip content={({ active, payload, label }: any) => active && payload?.[0] ? (
                <div style={{ background: COLORS.text, borderRadius: 8, padding: '8px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{payload[0].value} units</div>
                  <div style={{ fontSize: 11, color: COLORS.sub }}>{label}</div>
                </div>
              ) : null} />
              <Bar dataKey="units" radius={[4, 4, 0, 0]} fill={COLORS.accent} opacity={0.8} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ ...CARD_STYLE, padding: '18px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, marginBottom: 2 }}>{t("inventory.sizeDist")}</div>
          <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 14 }}>{t("inventory.basedOnYearly")}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sizeDistribution.map((sz, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 36, textAlign: 'right', fontSize: 12, fontWeight: 600, color: COLORS.text }}>{sz.name}</div>
                <div style={{ flex: 1, position: 'relative', height: 20, background: '#F8FAFC', borderRadius: 5 }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${sz.sales / maxSizeSales * 100}%`, background: sizeBarColors[i % sizeBarColors.length], borderRadius: 5, opacity: 0.8 }} />
                </div>
                <div style={{ width: 45, textAlign: 'right', fontSize: 11, fontWeight: 600, color: COLORS.text }}>{fmtNum(sz.sales)}</div>
                {sz.outCount >= 5 && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: COLORS.redLight, color: COLORS.red }}>{sz.outCount}⚠</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Low CVR + Star Products */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div style={{ ...CARD_STYLE, padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.red }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{t("inventory.lowCvr")}</span>
            <span style={{ fontSize: 11, color: COLORS.sub, marginLeft: 4 }}>{t("inventory.highTrafficLowCvr")}</span>
          </div>
          {lowCvrProducts.slice(0, 5).map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? `1px solid #F8FAFC` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {getBySku(d.msku)?.image_url ? (
                  <a href={`/products/${asinFromSku(d.msku)}`} onClick={e => e.stopPropagation()} style={{ lineHeight: 0 }}>
                    <img src={getBySku(d.msku)!.image_url!} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover', border: `1px solid ${COLORS.border}` }} />
                  </a>
                ) : <ImgPlaceholder size={24} />}
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.accent }}>{d.msku}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 11, color: COLORS.sub }}>{fmtNum(d.sessions || 0)} sessions</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: COLORS.redLight, color: COLORS.red }}>%{fmtDec(d.cvr || 0)}</span>
              </div>
            </div>
          ))}
          {lowCvrProducts.length === 0 && <div style={{ fontSize: 12, color: COLORS.sub, padding: 16, textAlign: 'center' }}>{t("inventory.noLowCvr")}</div>}
        </div>

        <div style={{ ...CARD_STYLE, padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.green }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{t("inventory.starProducts")}</span>
            <span style={{ fontSize: 11, color: COLORS.sub, marginLeft: 4 }}>{t("inventory.starDesc")}</span>
          </div>
          {starProducts.slice(0, 5).map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? `1px solid #F8FAFC` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {getBySku(d.msku)?.image_url ? (
                  <a href={`/products/${asinFromSku(d.msku)}`} onClick={e => e.stopPropagation()} style={{ lineHeight: 0 }}>
                    <img src={getBySku(d.msku)!.image_url!} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover', border: `1px solid ${COLORS.border}` }} />
                  </a>
                ) : <ImgPlaceholder size={24} />}
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.accent }}>{d.msku}</span>
                  {d.stock_status === 'out' && <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 6, padding: '1px 6px', borderRadius: 8, background: COLORS.redLight, color: COLORS.red, whiteSpace: 'nowrap' }}>OUT OF STOCK</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 11, color: COLORS.sub }}>{fmtNum(d.sessions || 0)} sessions</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: COLORS.greenLight, color: COLORS.green }}>%{fmtDec(d.cvr || 0)}</span>
              </div>
            </div>
          ))}
          {starProducts.length === 0 && <div style={{ fontSize: 12, color: COLORS.sub, padding: 16, textAlign: 'center' }}>{t("inventory.noStar")}</div>}
        </div>
      </div>

      {/* AI Insights — show local insights immediately, replace with API results when ready */}
      {mappedInsights.length > 0 && (
        <AIInsights
          title={t("inventory.aiTitle")}
          subtitle={aiApiLoading ? t("inventory.generatingAi") : t("inventory.aiSubtitle")}
          insights={mappedInsights}
        />
      )}

      {/* Filter Bar */}
      <div style={{ ...CARD_STYLE, padding: '12px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(['all', 'out', 'critical', 'warning', 'healthy', 'overstock', 'dead', 'inactive'] as StockStatus[]).map(s => {
            const labels: Record<string, string> = { all: t("common.all"), out: t("status.out"), critical: t("status.critical"), warning: t("status.warning"), healthy: t("status.healthy"), overstock: t("status.overstock"), dead: t("status.dead"), inactive: t("status.inactive") }
            return (
              <button key={s} onClick={() => { setStatusFilter(s); setSelectedRow(null) }} style={{
                padding: '5px 12px', borderRadius: 8, border: '1px solid #E2E8F0', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                background: statusFilter === s ? COLORS.text : '#fff', color: statusFilter === s ? '#fff' : '#64748B',
              }}>
                {s === 'all' ? `${labels[s]} (${data.length})` : `${labels[s]} (${statusCounts[s] || 0})`}
              </button>
            )
          })}
        </div>
        <div style={{ flex: 1 }} />
        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={t("common.searchSku")}
          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12, outline: 'none', width: 140 }} />
        <select value={`${sortKey}-${sortDir}`} onChange={e => { const [k, d] = e.target.value.split('-'); setSortKey(k as SortKey); setSortDir(d as SortDir) }}
          style={{ ...SELECT_STYLE, fontSize: 12, padding: '7px 28px 7px 10px' }}>
          <option value="daily_revenue_loss-desc">{t("inventory.urgency")}</option>
          <option value="sales_year-desc">{t("inventory.yearlySales")}</option>
          <option value="cvr-desc">CVR</option>
          <option value="sessions-desc">Traffic</option>
          <option value="current_stock-asc">Stock</option>
        </select>
      </div>

      {/* Main Table */}
      <div style={{ ...CARD_STYLE, padding: 0, overflow: 'hidden', marginBottom: 20 }}>
        <div className="modern-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>
                {[
                  { k: '' as any, l: 'Status', align: 'left' as const, sort: false },
                  { k: 'msku' as SortKey, l: 'SKU', align: 'left' as const, sort: true },
                  { k: 'current_stock' as SortKey, l: 'Stock', align: 'right' as const, sort: true },
                  { k: 'inbound_total' as SortKey, l: 'Inbound', align: 'right' as const, sort: true },
                  { k: 'avg_daily_sales' as SortKey, l: 'D.Sales', align: 'right' as const, sort: true },
                  { k: 'sales_30d' as SortKey, l: '30d', align: 'right' as const, sort: true },
                  { k: 'sales_year' as SortKey, l: 'Yearly', align: 'right' as const, sort: true },
                  { k: 'sessions' as SortKey, l: 'Sessions', align: 'right' as const, sort: true },
                  { k: 'cvr' as SortKey, l: 'CVR', align: 'right' as const, sort: true },
                  { k: 'buy_box_pct' as SortKey, l: 'Buy Box', align: 'right' as const, sort: true },
                  { k: 'days_of_stock' as SortKey, l: 'Days Left', align: 'right' as const, sort: true },
                  { k: 'daily_revenue_loss' as SortKey, l: 'Loss/day', align: 'right' as const, sort: true },
                ].map((h, hi) => (
                  <th key={hi} onClick={h.sort ? () => handleSort(h.k) : undefined}
                    style={{ ...TH_STYLE, padding: '9px 12px', textAlign: h.align, cursor: h.sort ? 'pointer' : 'default', color: sortKey === h.k ? COLORS.accent : COLORS.sub }}>
                    {h.l}{h.sort ? sortIndicator(h.k) : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredData.slice(0, 100).map((row, i) => (
                <tr key={i} className="stk-tr"
                  onClick={() => setSelectedRow(selectedRow?.msku === row.msku ? null : row)}
                  style={{ borderBottom: `1px solid #F8FAFC`, cursor: 'pointer', background: selectedRow?.msku === row.msku ? '#F0F2FF' : 'transparent', transition: 'background .15s' }}>
                  <td style={{ padding: '8px 12px' }}><StockStatusBadge status={row.stock_status as keyof typeof STOCK_STATUS} /></td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {getBySku(row.msku)?.image_url ? (
                        <a href={`/products/${asinFromSku(row.msku)}`} onClick={e => e.stopPropagation()} style={{ lineHeight: 0, flexShrink: 0 }}>
                          <img src={getBySku(row.msku)!.image_url!} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover', border: `1px solid ${COLORS.border}`, flexShrink: 0 }} />
                        </a>
                      ) : <ImgPlaceholder size={30} />}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.accent }}>{row.msku}</div>
                        <div style={{ fontSize: 10, color: COLORS.sub }}>{(row.product_name || '').substring(0, 30)}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: row.current_stock === 0 ? COLORS.red : COLORS.text }}>{fmtNum(row.current_stock || 0)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: (row.inbound_total || 0) > 0 ? COLORS.green : COLORS.muted }}>{(row.inbound_total || 0) > 0 ? fmtNum(row.inbound_total) : '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtDec(row.avg_daily_sales || 0)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtNum(row.sales_30d || 0)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: COLORS.text }}>{fmtNum(row.sales_year || 0)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtNum(row.sessions || 0)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: getCvrColor(row.cvr || 0) }}>{(row.cvr || 0) > 0 ? `%${fmtDec(row.cvr)}` : '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{(row.buy_box_pct || 0) > 0 ? `%${fmtDec(row.buy_box_pct)}` : '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: (row.days_of_stock || 0) <= 14 ? COLORS.red : (row.days_of_stock || 0) <= 30 ? COLORS.orange : '#64748B' }}>{(row.days_of_stock || 999) >= 999 ? '∞' : fmtDec(row.days_of_stock || 0, 0)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: (row.daily_revenue_loss || 0) > 0 ? COLORS.red : COLORS.muted }}>{(row.daily_revenue_loss || 0) > 0 ? `€${fmtDec(row.daily_revenue_loss, 0)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredData.length > 100 && (
          <div style={{ padding: '10px 16px', fontSize: 11, color: COLORS.sub, borderTop: `1px solid ${COLORS.border}` }}>
            {t("common.showing", {limit: 100, total: filteredData.length})}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedRow && (
        <div style={{ ...CARD_STYLE, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>{selectedRow.msku}</div>
              <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 2 }}>{(selectedRow.product_name || '').substring(0, 60)}</div>
            </div>
            <StockStatusBadge status={selectedRow.stock_status as keyof typeof STOCK_STATUS} />
          </div>

          <div className="grid-4" style={{ marginBottom: 14, gap: 10 }}>
            {[
              { label: 'Current Stock', value: fmtNum(selectedRow.current_stock || 0) },
              { label: 'Inbound', value: fmtNum(selectedRow.inbound_total || 0) },
              { label: 'D. Sales', value: fmtDec(selectedRow.avg_daily_sales || 0) },
              { label: 'Price', value: fmtCur(selectedRow.price || 0) },
              { label: 'CVR', value: `%${fmtDec(selectedRow.cvr || 0)}` },
              { label: 'Storage', value: fmtCur(selectedRow.storage_fee_monthly || 0) },
              { label: 'Refund', value: `%${fmtDec(selectedRow.refund_rate || 0)}` },
              { label: 'Days Left', value: (selectedRow.days_of_stock || 999) >= 999 ? '∞' : fmtDec(selectedRow.days_of_stock || 0, 0) },
            ].map((m, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '10px 6px', background: '#F8FAFC', borderRadius: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: COLORS.sub, letterSpacing: '.05em', marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{m.value}</div>
              </div>
            ))}
          </div>

          <div style={{ padding: '12px 16px', background: 'linear-gradient(160deg, #e2e6ea, #eef0f3, #f5f7fa)', borderRadius: 10, fontSize: 13, color: '#64748B', lineHeight: 1.6 }}>
            {getDetailMessage(selectedRow)}
          </div>
        </div>
      )}
    </>
  )
}
