'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import KpiCard from '@/components/ui/KpiCard'
import { KpiIcons } from '@/components/ui/KpiIcons'
import AIInsights, { type Insight } from '@/components/ui/AIInsights'
import { ImgPlaceholder } from '@/components/ui/Badges'
import { useProductImages } from '@/hooks/useProductImages'
import { COLORS, CARD_STYLE, SELECT_STYLE, TH_STYLE } from '@/lib/design-tokens'
import { useTranslation } from '@/lib/i18n'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MP_MAP: Record<string, string> = {
  'Amazon.de': 'DE', 'Amazon.fr': 'FR', 'Amazon.es': 'ES',
  'Amazon.it': 'IT', 'Amazon.co.uk': 'GB', 'Amazon.nl': 'NL',
  'Amazon.com.be': 'BE', 'Amazon.pl': 'PL', 'Amazon.se': 'SE',
  'Amazon.ie': 'IE',
}

const MARKETPLACE_OPTIONS = [
  { value: 'all', label: 'All Marketplaces' },
  { value: 'Amazon.de', label: 'Amazon.de' },
  { value: 'Amazon.fr', label: 'Amazon.fr' },
  { value: 'Amazon.es', label: 'Amazon.es' },
  { value: 'Amazon.it', label: 'Amazon.it' },
  { value: 'Amazon.co.uk', label: 'Amazon.co.uk' },
  { value: 'Amazon.nl', label: 'Amazon.nl' },
  { value: 'Amazon.pl', label: 'Amazon.pl' },
  { value: 'Amazon.ie', label: 'Amazon.ie' },
  { value: 'Amazon.com.be', label: 'Amazon.com.be' },
  { value: 'Amazon.se', label: 'Amazon.se' },
]

interface SkuRow {
  sku: string
  skuGroup: string
  parentAsin: string
  parentTitle: string
  units: number
  avgPrice: number
  cogs: number
  commission: number
  fba: number
  storage: number
  returnMgmt: number
  digital: number
  adSpend: number
  totalCost: number
  breakeven: number
  profitPerUnit: number
  margin: number
  maxDiscount: number
  hasEconData: boolean
}

interface ColorGroup {
  skuGroup: string
  rows: SkuRow[]
  totalUnits: number
  avgPrice: number
  cogs: number
  commission: number
  fba: number
  storage: number
  returnDig: number
  totalCost: number
  breakeven: number
  profitPerUnit: number
  margin: number
  maxDiscount: number
  hasEconData: boolean
}

interface ParentGroup {
  parentAsin: string
  title: string
  colorGroups: ColorGroup[]
  totalUnits: number
  avgPrice: number
  totalCost: number
  profitPerUnit: number
  margin: number
}

type SortKey = 'units' | 'avgPrice' | 'cogs' | 'commission' | 'fba' | 'storage' | 'adSpend' | 'totalCost' | 'breakeven' | 'profitPerUnit' | 'margin' | 'maxDiscount'

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

const n = (v: any) => Number(v) || 0

const fmtEur = (v: number | null | undefined, dec = 2) => {
  const val = n(v)
  if (val < 0) return `-${Math.abs(val).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec })} €`
  return `${val.toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec })} €`
}
const fmtPct = (v: number | null | undefined) => `%${n(v).toFixed(1)}`

function getCommissionRate(price: number): number {
  return price < 20 ? 0.10 : 0.15
}

// Paginated fetch helper (Supabase 1000 row limit)
async function fetchAll(query: any): Promise<any[]> {
  const PAGE = 1000
  let all: any[] = []
  let offset = 0
  while (true) {
    const { data } = await query.range(offset, offset + PAGE - 1)
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}

export default function COGSPage() {
  const { t } = useTranslation()
  const { getBySku, asinFromSku, getByAsin } = useProductImages()
  const monthOptions = useMemo(() => generateMonthOptions(), [])
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0])
  const [selectedMarketplace, setSelectedMarketplace] = useState('all')
  const [loading, setLoading] = useState(true)
  const [skuRows, setSkuRows] = useState<SkuRow[]>([])
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [selectedSku, setSelectedSku] = useState<string | null>(null)
  const [discountPct, setDiscountPct] = useState(0)

  const [sortKey, setSortKey] = useState<SortKey>('units')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [editPackCost, setEditPackCost] = useState('')
  const [editOtherCost, setEditOtherCost] = useState('')
  const [costTab, setCostTab] = useState<string>('combined')
  const [isMobile, setIsMobile] = useState(false)

  // ========== FETCH ==========
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const { startDate, endDate } = getMonthRange(selectedMonth)

      // Build queries
      let ordersQ = supabase
        .from('all_orders')
        .select('sku, marketplace, quantity, item_price')
        .eq('order_status', 'Shipped')
        .gte('purchase_date', startDate)
        .lte('purchase_date', endDate)
      if (selectedMarketplace !== 'all') {
        ordersQ = ordersQ.eq('marketplace', selectedMarketplace)
      }

      const econQ = supabase
        .from('sku_economics')
        .select('sku, marketplace, units_sold, commission, fba, storage, return_mgmt, digital_fba, digital_sell')

      const cogsQ = supabase
        .from('sku_cogs')
        .select('sku_prefix, pack_cost_eur, other_cost_eur, valid_from, valid_to')

      let adsQ = supabase
        .from('ad_product_performance')
        .select('sku, spend')
        .gte('date', startDate)
        .lte('date', endDate)

      // Also fetch monthly_pl for fallback fee estimation
      let plQ = supabase
        .from('monthly_pl')
        .select('marketplace, units, sales, commission, fba, storage, return_mgmt, digital_fba, digital_sell')
        .eq('report_month', selectedMonth)

      const parentQ = supabase
        .from('parent_asin_map')
        .select('parent_asin, child_asin, sku, title')

      // Fetch all in parallel (with pagination for large tables)
      const [orders, econ, cogs, ads, parentMapRes, plRes] = await Promise.all([
        fetchAll(ordersQ),
        fetchAll(econQ),
        fetchAll(cogsQ),
        fetchAll(adsQ),
        supabase.from('parent_asin_map').select('parent_asin, child_asin, sku, title'),
        plQ,
      ])

      const parentMap = parentMapRes.data || []
      const plData = plRes.data || []

      // --- SKU to parent ASIN mapping ---
      const skuToParent: Record<string, { parentAsin: string; title: string }> = {}
      parentMap.forEach((p: any) => {
        if (p.sku) {
          skuToParent[p.sku] = { parentAsin: p.parent_asin || '', title: p.title || '' }
        }
      })

      // --- Orders: group by SKU ---
      const skuMap: Record<string, { units: number; totalSales: number }> = {}
      orders.forEach((o: any) => {
        const sku = o.sku || ''
        if (!sku) return
        if (!skuMap[sku]) skuMap[sku] = { units: 0, totalSales: 0 }
        skuMap[sku].units += n(o.quantity)
        skuMap[sku].totalSales += n(o.item_price)
      })

      // --- Economics: weighted avg per SKU (SUM(fee)/SUM(units_sold)) ---
      const allowedMpCodes = new Set(Object.values(MP_MAP))
      const econMap: Record<string, { totalUnits: number; totalComm: number; totalFba: number; totalStorage: number; totalReturn: number; totalDigital: number }> = {}
      econ.forEach((e: any) => {
        if (!allowedMpCodes.has(e.marketplace)) return
        const sku = e.sku || ''
        if (!sku) return
        if (selectedMarketplace !== 'all') {
          const mpCode = MP_MAP[selectedMarketplace]
          if (e.marketplace !== mpCode) return
        }
        if (!econMap[sku]) econMap[sku] = { totalUnits: 0, totalComm: 0, totalFba: 0, totalStorage: 0, totalReturn: 0, totalDigital: 0 }
        const u = n(e.units_sold)
        econMap[sku].totalUnits += u
        econMap[sku].totalComm += n(e.commission)
        econMap[sku].totalFba += n(e.fba)
        econMap[sku].totalStorage += n(e.storage)
        econMap[sku].totalReturn += n(e.return_mgmt)
        econMap[sku].totalDigital += n(e.digital_fba) + n(e.digital_sell)
      })

      // --- Fallback: estimate per-unit Amazon fees from monthly_pl ---
      let plTotalUnits = 0, plTotalComm = 0, plTotalFba = 0, plTotalStorage = 0, plTotalReturn = 0, plTotalDigital = 0
      plData.forEach((r: any) => {
        if (selectedMarketplace !== 'all' && r.marketplace !== selectedMarketplace) return
        plTotalUnits += n(r.units)
        plTotalComm += n(r.commission)
        plTotalFba += n(r.fba)
        plTotalStorage += n(r.storage)
        plTotalReturn += n(r.return_mgmt)
        plTotalDigital += n(r.digital_fba) + n(r.digital_sell)
      })
      const fallbackCommPerUnit = plTotalUnits > 0 ? plTotalComm / plTotalUnits : 0
      const fallbackFbaPerUnit = plTotalUnits > 0 ? plTotalFba / plTotalUnits : 0
      const fallbackStoragePerUnit = plTotalUnits > 0 ? plTotalStorage / plTotalUnits : 0
      const fallbackReturnPerUnit = plTotalUnits > 0 ? plTotalReturn / plTotalUnits : 0
      const fallbackDigitalPerUnit = plTotalUnits > 0 ? plTotalDigital / plTotalUnits : 0

      // --- COGS: valid record for month ---
      const cogsMap: Record<string, { packCost: number; otherCost: number }> = {}
      cogs.forEach((c: any) => {
        const prefix = c.sku_prefix || ''
        const validFrom = c.valid_from || '2000-01-01'
        const validTo = c.valid_to || '9999-12-31'
        if (startDate >= validFrom && startDate <= validTo) {
          cogsMap[prefix] = { packCost: n(c.pack_cost_eur), otherCost: n(c.other_cost_eur) }
        }
      })

      // --- Ads: sum spend by SKU ---
      const adMap: Record<string, number> = {}
      ads.forEach((a: any) => {
        const sku = a.sku || ''
        if (!sku) return
        adMap[sku] = (adMap[sku] || 0) + n(a.spend)
      })

      // --- Build rows ---
      const rows: SkuRow[] = []
      Object.entries(skuMap).forEach(([sku, data]) => {
        if (data.units <= 0) return
        const avgPrice = data.totalSales / data.units
        const skuGroup = sku.substring(0, 7)

        // Parent ASIN
        const parentInfo = skuToParent[sku] || { parentAsin: skuGroup, title: '' }

        // Economics - use sku_economics if available, otherwise fallback to monthly_pl estimates
        const ec = econMap[sku]
        const hasEconData = !!(ec && ec.totalUnits > 0)
        let commPerUnit = 0, fbaPerUnit = 0, storagePerUnit = 0, returnPerUnit = 0, digitalPerUnit = 0
        if (hasEconData) {
          commPerUnit = ec.totalComm / ec.totalUnits
          fbaPerUnit = ec.totalFba / ec.totalUnits
          storagePerUnit = ec.totalStorage / ec.totalUnits
          returnPerUnit = ec.totalReturn / ec.totalUnits
          digitalPerUnit = ec.totalDigital / ec.totalUnits
        } else {
          // Fallback: use monthly_pl average per unit
          commPerUnit = fallbackCommPerUnit > 0 ? fallbackCommPerUnit : avgPrice * getCommissionRate(avgPrice)
          fbaPerUnit = fallbackFbaPerUnit
          storagePerUnit = fallbackStoragePerUnit
          returnPerUnit = fallbackReturnPerUnit
          digitalPerUnit = fallbackDigitalPerUnit
        }

        // COGS
        const cogsData = cogsMap[skuGroup] || { packCost: 0, otherCost: 0 }
        const cogsPerUnit = cogsData.packCost + cogsData.otherCost

        // Ad spend
        const adPerUnit = (adMap[sku] || 0) / data.units

        // Totals
        const totalCost = cogsPerUnit + commPerUnit + fbaPerUnit + storagePerUnit + returnPerUnit + digitalPerUnit + adPerUnit
        const profitPerUnit = avgPrice - totalCost
        const margin = avgPrice > 0 ? (profitPerUnit / avgPrice) * 100 : 0
        const maxDiscount = avgPrice > 0 ? Math.max(0, ((avgPrice - totalCost) / avgPrice) * 100) : 0

        rows.push({
          sku, skuGroup,
          parentAsin: parentInfo.parentAsin,
          parentTitle: parentInfo.title,
          units: data.units, avgPrice,
          cogs: cogsPerUnit, commission: commPerUnit, fba: fbaPerUnit,
          storage: storagePerUnit, returnMgmt: returnPerUnit, digital: digitalPerUnit,
          adSpend: adPerUnit, totalCost, breakeven: totalCost,
          profitPerUnit, margin, maxDiscount, hasEconData,
        })
      })

      setSkuRows(rows)
      setLoading(false)

      // Auto-select first SKU by units
      if (rows.length > 0) {
        const best = [...rows].sort((a, b) => b.units - a.units)[0]
        setSelectedSku(best.sku)
        setDiscountPct(0)
      }
    } catch (err) {
      console.error('COGS fetch error:', err)
      setLoading(false)
    }
  }, [selectedMonth, selectedMarketplace])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (isMobile && costTab === 'combined') setCostTab('breakdown')
    if (!isMobile && (costTab === 'breakdown' || costTab === 'edit')) setCostTab('combined')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile])

  // ========== 3-Level grouping: Parent ASIN > Color Group > SKU ==========
  const parentGroups = useMemo(() => {
    // Step 1: Group SKUs into color groups (LEFT(sku,7))
    const colorMap: Record<string, ColorGroup> = {}
    skuRows.forEach(row => {
      const key = row.skuGroup
      if (!colorMap[key]) {
        colorMap[key] = { skuGroup: key, rows: [], totalUnits: 0, avgPrice: 0, cogs: 0, commission: 0, fba: 0, storage: 0, returnDig: 0, totalCost: 0, breakeven: 0, profitPerUnit: 0, margin: 0, maxDiscount: 0, hasEconData: false }
      }
      colorMap[key].rows.push(row)
      colorMap[key].totalUnits += row.units
    })

    // Calculate weighted averages for each color group
    Object.values(colorMap).forEach(g => {
      if (g.totalUnits === 0) return
      let tSales = 0, tCogs = 0, tComm = 0, tFba = 0, tStorage = 0, tRetDig = 0, tCost = 0
      let anyEcon = false
      g.rows.forEach(r => {
        tSales += r.avgPrice * r.units
        tCogs += r.cogs * r.units
        tComm += r.commission * r.units
        tFba += r.fba * r.units
        tStorage += r.storage * r.units
        tRetDig += (r.returnMgmt + r.digital) * r.units
        tCost += r.totalCost * r.units
        if (r.hasEconData) anyEcon = true
      })
      g.avgPrice = tSales / g.totalUnits
      g.cogs = tCogs / g.totalUnits
      g.commission = tComm / g.totalUnits
      g.fba = tFba / g.totalUnits
      g.storage = tStorage / g.totalUnits
      g.returnDig = tRetDig / g.totalUnits
      g.totalCost = tCost / g.totalUnits
      g.breakeven = g.totalCost
      g.profitPerUnit = g.avgPrice - g.totalCost
      g.margin = g.avgPrice > 0 ? (g.profitPerUnit / g.avgPrice) * 100 : 0
      g.maxDiscount = g.avgPrice > 0 ? Math.max(0, ((g.avgPrice - g.totalCost) / g.avgPrice) * 100) : 0
      g.hasEconData = anyEcon
      g.rows.sort((a, b) => a.sku.localeCompare(b.sku))
    })

    // Step 2: Group color groups into parent ASINs
    const parentMap2: Record<string, ParentGroup> = {}
    Object.values(colorMap).forEach(cg => {
      const firstRow = cg.rows[0]
      const pAsin = firstRow?.parentAsin || cg.skuGroup
      const pTitle = firstRow?.parentTitle || ''
      if (!parentMap2[pAsin]) {
        parentMap2[pAsin] = { parentAsin: pAsin, title: pTitle, colorGroups: [], totalUnits: 0, avgPrice: 0, totalCost: 0, profitPerUnit: 0, margin: 0 }
      }
      parentMap2[pAsin].colorGroups.push(cg)
      parentMap2[pAsin].totalUnits += cg.totalUnits
      if (!parentMap2[pAsin].title && pTitle) parentMap2[pAsin].title = pTitle
    })

    // Sort color groups by skuGroup within each parent
    Object.values(parentMap2).forEach(pg => {
      pg.colorGroups.sort((a, b) => a.skuGroup.localeCompare(b.skuGroup))
    })

    // Weighted averages for parent
    Object.values(parentMap2).forEach(pg => {
      if (pg.totalUnits === 0) return
      let tSales = 0, tCost = 0
      pg.colorGroups.forEach(cg => {
        tSales += cg.avgPrice * cg.totalUnits
        tCost += cg.totalCost * cg.totalUnits
      })
      pg.avgPrice = tSales / pg.totalUnits
      pg.totalCost = tCost / pg.totalUnits
      pg.profitPerUnit = pg.avgPrice - pg.totalCost
      pg.margin = pg.avgPrice > 0 ? (pg.profitPerUnit / pg.avgPrice) * 100 : 0
    })

    // Sort
    const sorted = Object.values(parentMap2)
    sorted.sort((a, b) => {
      const aVal = sortKey === 'units' ? a.totalUnits : sortKey === 'avgPrice' ? a.avgPrice : sortKey === 'totalCost' ? a.totalCost : sortKey === 'profitPerUnit' ? a.profitPerUnit : sortKey === 'margin' ? a.margin : a.totalUnits
      const bVal = sortKey === 'units' ? b.totalUnits : sortKey === 'avgPrice' ? b.avgPrice : sortKey === 'totalCost' ? b.totalCost : sortKey === 'profitPerUnit' ? b.profitPerUnit : sortKey === 'margin' ? b.margin : b.totalUnits
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal
    })
    return sorted
  }, [skuRows, sortKey, sortDir])

  // ========== KPIs ==========
  const avgMargin = useMemo(() => {
    if (skuRows.length === 0) return 0
    const totalSales = skuRows.reduce((s, r) => s + r.avgPrice * r.units, 0)
    const totalProfit = skuRows.reduce((s, r) => s + r.profitPerUnit * r.units, 0)
    return totalSales > 0 ? (totalProfit / totalSales) * 100 : 0
  }, [skuRows])

  const lossMakingSkus = useMemo(() => skuRows.filter(r => r.margin < 0), [skuRows])
  const bestSku = useMemo(() => skuRows.length > 0 ? [...skuRows].sort((a, b) => b.profitPerUnit - a.profitPerUnit)[0] : null, [skuRows])
  const avgBreakeven = useMemo(() => {
    if (skuRows.length === 0) return 0
    const totalUnits = skuRows.reduce((s, r) => s + r.units, 0)
    return totalUnits > 0 ? skuRows.reduce((s, r) => s + r.breakeven * r.units, 0) / totalUnits : 0
  }, [skuRows])
  const avgMaxDiscount = useMemo(() => {
    if (skuRows.length === 0) return 0
    const totalUnits = skuRows.reduce((s, r) => s + r.units, 0)
    return totalUnits > 0 ? skuRows.reduce((s, r) => s + r.maxDiscount * r.units, 0) / totalUnits : 0
  }, [skuRows])

  // ========== Selected SKU ==========
  const sel = useMemo(() => skuRows.find(r => r.sku === selectedSku) || null, [skuRows, selectedSku])

  // ========== SKU list for dropdown ==========
  const skuOptions = useMemo(() => {
    return [...skuRows].sort((a, b) => a.sku.localeCompare(b.sku)).map(r => ({
      sku: r.sku,
      label: r.parentTitle
        ? `${r.sku} - ${r.parentTitle.substring(0, 40)}`
        : r.sku
    }))
  }, [skuRows])

  // ========== Cost Bars ==========
  const costBarsData = useMemo(() => {
    if (!sel) return []
    return [
      { label: t('cogs.sellingPrice'), value: sel.avgPrice, color: COLORS.costBars[0] },
      { label: t('cogs.cogs'), value: -sel.cogs, color: COLORS.costBars[1] },
      { label: t('cogs.commission'), value: -sel.commission, color: COLORS.costBars[2] },
      { label: t('cogs.fbaShipping'), value: -sel.fba, color: COLORS.costBars[3] },
      { label: t('cogs.storage'), value: -sel.storage, color: COLORS.costBars[4] },
      { label: t('cogs.returnsDigital'), value: -(sel.returnMgmt + sel.digital), color: COLORS.costBars[5] },
      { label: t('cogs.ads'), value: -sel.adSpend, color: COLORS.costBars[6] },
      { label: t('cogs.netProfit'), value: sel.profitPerUnit, color: COLORS.profitBar },
    ]
  }, [sel])
  const maxBarVal = useMemo(() => costBarsData.length > 0 ? Math.max(...costBarsData.map(b => Math.abs(b.value))) : 1, [costBarsData])

  // ========== Discount simulator ==========
  const discountTable = useMemo(() => {
    if (!sel) return []
    const steps = []
    for (let pct = 0; pct <= 50; pct += 5) {
      const newPrice = sel.avgPrice * (1 - pct / 100)
      const newComm = newPrice * getCommissionRate(newPrice)
      const nonCommCost = sel.cogs + sel.fba + sel.storage + sel.returnMgmt + sel.digital + sel.adSpend
      const newProfit = newPrice - nonCommCost - newComm
      const newMargin = newPrice > 0 ? (newProfit / newPrice) * 100 : 0
      let status = '✅'
      if (newMargin < 0) status = '❌'
      else if (newMargin < 10) status = '⚠️'
      const commNote = (sel.avgPrice >= 20 && newPrice < 20) ? '\uD83D\uDCA1 %10' : ''
      steps.push({ pct, newPrice, profit: newProfit, margin: newMargin, status, commNote })
    }
    return steps
  }, [sel])

  const selectedDiscountRow = useMemo(() => {
    if (!sel) return null
    const newPrice = sel.avgPrice * (1 - discountPct / 100)
    const newComm = newPrice * getCommissionRate(newPrice)
    const nonCommCost = sel.cogs + sel.fba + sel.storage + sel.returnMgmt + sel.digital + sel.adSpend
    const newProfit = newPrice - nonCommCost - newComm
    const newMargin = newPrice > 0 ? (newProfit / newPrice) * 100 : 0
    return { newPrice, profit: newProfit, margin: newMargin }
  }, [sel, discountPct])

  // ========== Scatter ==========
  const scatterData = useMemo(() => {
    return parentGroups.map(pg => ({
      name: pg.title ? pg.title.substring(0, 30) : pg.parentAsin,
      x: pg.totalUnits,
      y: pg.margin,
      z: Math.max(Math.abs(pg.profitPerUnit * pg.totalUnits), 1),
      profit: pg.profitPerUnit * pg.totalUnits,
    }))
  }, [parentGroups])

  const medianUnits = useMemo(() => {
    if (scatterData.length === 0) return 0
    const sorted = [...scatterData].sort((a, b) => a.x - b.x)
    return sorted[Math.floor(sorted.length / 2)].x
  }, [scatterData])

  // ========== AI Insights ==========
  const aiInsights = useMemo((): Insight[] => {
    if (skuRows.length === 0) return []
    const insights: Insight[] = []

    // Worst SKU by ad spend ratio
    const sorted = [...skuRows].filter(r => r.adSpend > 0).sort((a, b) => (b.adSpend / b.avgPrice) - (a.adSpend / a.avgPrice))
    const worstAd = sorted[0]
    if (worstAd && worstAd.margin < 5) {
      insights.push({
        type: 'PROFITABILITY',
        title: `${worstAd.skuGroup} ${worstAd.margin < 0 ? 'is losing money' : 'has low margin'} — high ad cost`,
        desc: `Ad spend per unit ${fmtEur(worstAd.adSpend)} consumes ${((worstAd.adSpend / worstAd.avgPrice) * 100).toFixed(0)}% of the selling price in ${worstAd.skuGroup} group. ${fmtEur(worstAd.profitPerUnit)} ${worstAd.margin < 0 ? 'loss' : 'profit'} per unit. Reduce ad budget and focus on organic sales.`,
        color: COLORS.red,
      })
    }

    // Best margin SKU with low volume
    const bestMarginLowVol = [...skuRows].filter(r => r.margin > 30).sort((a, b) => a.units - b.units)[0]
    if (bestMarginLowVol) {
      insights.push({
        type: 'EFFICIENCY',
        title: `${bestMarginLowVol.skuGroup} is a star — increase traffic`,
        desc: `Efficient with ${bestMarginLowVol.margin.toFixed(1)}% margin but only ${bestMarginLowVol.units} units sold. Increase SP campaign bids to drive more traffic.`,
        color: COLORS.accent,
      })
    }

    // Commission threshold opportunity
    const nearThreshold = skuRows.filter(r => r.avgPrice > 19 && r.avgPrice < 21)
    if (nearThreshold.length > 0) {
      const groups = [...new Set(nearThreshold.map(r => r.skuGroup))]
      insights.push({
        type: 'COST',
        title: `Commission threshold opportunity — ${groups.length} product groups near 20€`,
        desc: `${groups.join(', ')} products are at the 20€ commission threshold. Pricing at 19.99€ reduces commission from 15% to 10% — ~1€ savings per unit.`,
        color: COLORS.green,
      })
    }

    if (insights.length === 0) {
      insights.push({
        type: 'INFO',
        title: `Overview — ${lossMakingSkus.length} loss-making SKUs`,
        desc: `Average margin ${avgMargin.toFixed(1)}%. ${lossMakingSkus.length > 0 ? `${lossMakingSkus.length} SKUs are losing money — review their ad and cost structure.` : 'All products are profitable.'}`,
        color: COLORS.accent,
      })
    }

    return insights
  }, [skuRows, avgMargin, lossMakingSkus])

  // ========== Save COGS ==========
  const saveCost = async (skuPrefix: string) => {
    try {
      const newPackCost = parseFloat(editPackCost) || 0
      const newOtherCost = parseFloat(editOtherCost) || 0
      const today = new Date().toISOString().split('T')[0]

      await supabase.from('sku_cogs').update({ valid_to: today }).eq('sku_prefix', skuPrefix).is('valid_to', null)
      await supabase.from('sku_cogs').insert({
        sku_prefix: skuPrefix, pack_cost_eur: newPackCost, other_cost_eur: newOtherCost,
        unit_cost_eur: newPackCost, valid_from: today, valid_to: null,
        notes: `Manual update - ${today}`,
      })
      setEditingGroup(null)
      fetchData()
    } catch (err) {
      console.error('Save COGS error:', err)
    }
  }

  // ========== Sort ==========
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }
  const sortIcon = (key: SortKey) => sortKey !== key ? ' ⇅' : sortDir === 'asc' ? ' ↑' : ' ↓'

  const marginColor = (m: number) => m >= 35 ? COLORS.green : m >= 25 ? COLORS.orange : m >= 15 ? '#FB923C' : m >= 0 ? COLORS.orange : COLORS.red

  const marginBadge = (margin: number) => {
    const c = marginColor(margin)
    return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: `${c}18`, color: c }}>{fmtPct(margin)}</span>
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${COLORS.border}`, borderTopColor: COLORS.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ color: COLORS.sub, fontSize: 13 }}>{t('common.loading')}</div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, margin: 0 }}>{t('cogs.title')}</h1>
          <p style={{ fontSize: 13, color: COLORS.sub, margin: '2px 0 0' }}>{t('cogs.subtitle')} · {selectedMonth}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={SELECT_STYLE}>
            {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={selectedMarketplace} onChange={e => setSelectedMarketplace(e.target.value)} style={SELECT_STYLE}>
            {MARKETPLACE_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.value === 'all' ? t('common.allMarketplaces') : m.label}</option>)}
          </select>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <KpiCard
          label={t('cogs.avgMargin')} value={fmtPct(avgMargin)}
          change={lossMakingSkus.length > 0 ? `${lossMakingSkus.length} ${t('cogs.lossMaking')}` : t('cogs.allProfitable')} up={avgMargin > 0}
          icon={KpiIcons.margin} bars={[55, 60, 58, 62, 68, 72, 75]}
          color={COLORS.green} light={COLORS.greenLighter} iconBg={COLORS.greenLight}
        />
        <KpiCard
          label={t('cogs.lossMakingSku')} value={String(lossMakingSkus.length)}
          change={lossMakingSkus.length === 0 ? t('cogs.great') : t('cogs.review')} up={lossMakingSkus.length === 0}
          icon={KpiIcons.warning} bars={[90, 85, 78, 72, 68, 60, 55]}
          color={COLORS.red} light={COLORS.redLighter} iconBg={COLORS.redLight}
        />
        <KpiCard
          label={t('cogs.mostProfitable')} value={bestSku ? bestSku.skuGroup : '—'}
          change={bestSku ? `${fmtPct(bestSku.margin)} ${t('cogs.margin')}` : ''} up={true}
          icon={KpiIcons.brand} bars={[40, 48, 55, 60, 68, 75, 85]}
          color={COLORS.accent} light="#C7D2FE" iconBg={COLORS.accentLight}
        />
        <KpiCard
          label={t('cogs.avgBreakeven')} value={fmtEur(avgBreakeven)}
          change={`${t('cogs.maxDisc')}: ${fmtPct(avgMaxDiscount)}`} up={true}
          icon={KpiIcons.clock} bars={[65, 62, 60, 58, 56, 55, 54]}
          color={COLORS.orange} light={COLORS.orangeLighter} iconBg={COLORS.orangeLight}
        />
      </div>

      {/* AI Insights */}
      <AIInsights
        title={t('cogs.aiInsightsTitle')}
        subtitle={t('cogs.aiInsightsSubtitle')}
        insights={aiInsights}
      />

      {/* 3-Level Product Table */}
      <div style={{ ...CARD_STYLE, padding: 0, marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>{t('cogs.productProfitTable')}</div>
          <div style={{ fontSize: 12, color: COLORS.sub }}>{parentGroups.length} {t('cogs.productGroups')} · {skuRows.length} SKU</div>
        </div>
        <div className="modern-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>
                <th style={{ ...TH_STYLE, padding: '8px 10px 8px 20px', textAlign: 'left', minWidth: 200 }}>{t('cogs.product')}</th>
                {([
                  ['units', t('cogs.units')], ['avgPrice', t('cogs.avgPrice')], ['cogs', t('cogs.cogs')], ['commission', t('cogs.commission')],
                  ['fba', 'FBA'], ['storage', t('cogs.storage')], ['adSpend', t('cogs.ads')], ['breakeven', t('cogs.breakeven')],
                  ['profitPerUnit', t('cogs.profitPerUnit')], ['margin', t('cogs.marginPct')], ['maxDiscount', t('cogs.maxDiscCol')],
                ] as [string, string][]).map(([key, label]) => (
                  <th key={key} onClick={() => handleSort(key as SortKey)}
                    style={{ ...TH_STYLE, padding: '8px 10px', textAlign: 'right', cursor: 'pointer', color: sortKey === key ? COLORS.accent : COLORS.sub }}>
                    {label}{sortIcon(key as SortKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parentGroups.map(pg => {
                const isParentExpanded = expandedParents.has(pg.parentAsin)
                const skuCount = pg.colorGroups.reduce((s, cg) => s + cg.rows.length, 0)
                const parentSkuPrefix = pg.colorGroups[0]?.skuGroup?.substring(0, 7) || ''
                const displayTitle = pg.title
                  ? (pg.title.length > 45 ? pg.title.substring(0, 45) + '...' : pg.title)
                  : pg.parentAsin

                return (
                  <React.Fragment key={pg.parentAsin}>
                    {/* Level 1: Parent ASIN */}
                    <tr
                      className="cogs-tr"
                      style={{ borderBottom: `1px solid ${COLORS.border}`, cursor: 'pointer', transition: 'background .15s' }}
                      onClick={() => {
                        setExpandedParents(prev => {
                          const next = new Set(prev)
                          next.has(pg.parentAsin) ? next.delete(pg.parentAsin) : next.add(pg.parentAsin)
                          return next
                        })
                        if (pg.colorGroups[0]?.rows[0]) {
                          setSelectedSku(pg.colorGroups[0].rows[0].sku)
                          setDiscountPct(0)
                        }
                      }}
                    >
                      <td style={{ padding: '8px 10px 8px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {(() => {
                            // Try all child SKUs to find one with an image
                            let foundInfo = null as any
                            let foundAsin = null as string | null
                            for (const cg of pg.colorGroups) {
                              for (const r of cg.rows) {
                                const info = getBySku(r.sku)
                                if (info?.image_url) { foundInfo = info; foundAsin = asinFromSku(r.sku); break }
                              }
                              if (foundInfo) break
                            }
                            // Also try parent ASIN directly
                            if (!foundInfo && pg.parentAsin) {
                              const pInfo = getByAsin(pg.parentAsin)
                              if (pInfo?.image_url) { foundInfo = pInfo; foundAsin = pg.parentAsin }
                            }
                            return foundInfo?.image_url ? (
                              <a href={`/products/${foundAsin}`} onClick={e => e.stopPropagation()} style={{ lineHeight: 0, flexShrink: 0 }}>
                                <img src={foundInfo.image_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', border: `1px solid ${COLORS.border}`, flexShrink: 0 }} />
                              </a>
                            ) : <ImgPlaceholder size={32} />
                          })()}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.accent }}>{parentSkuPrefix}</div>
                            <div style={{ fontSize: 11, color: COLORS.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skuCount} SKU · {pg.totalUnits.toLocaleString('de-DE')} adet</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: COLORS.text }}>{pg.totalUnits.toLocaleString('de-DE')}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtEur(pg.avgPrice)}</td>
                      <td colSpan={4} />
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtEur(pg.totalCost)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: pg.profitPerUnit >= 0 ? COLORS.green : COLORS.red }}>{fmtEur(pg.profitPerUnit)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{marginBadge(pg.margin)}</td>
                      <td />
                    </tr>

                    {/* Level 2: Color groups */}
                    {isParentExpanded && pg.colorGroups.map(cg => {
                      const isGroupExpanded = expandedGroups.has(cg.skuGroup)
                      const hasMultipleSizes = cg.rows.length > 1
                      return (
                        <React.Fragment key={cg.skuGroup}>
                          <tr
                            className="cogs-tr"
                            style={{ borderBottom: `1px solid ${COLORS.border}`, cursor: 'pointer', background: '#FAFBFE' }}
                            onClick={() => {
                              if (hasMultipleSizes) {
                                setExpandedGroups(prev => {
                                  const next = new Set(prev)
                                  next.has(cg.skuGroup) ? next.delete(cg.skuGroup) : next.add(cg.skuGroup)
                                  return next
                                })
                              }
                              setSelectedSku(cg.rows[0].sku)
                              setDiscountPct(0)
                            }}
                          >
                            <td style={{ padding: '6px 10px 6px 48px', fontSize: 12, color: COLORS.accent, fontWeight: 500 }}>
                              {hasMultipleSizes && <span style={{ marginRight: 5, fontSize: 8 }}>{isGroupExpanded ? '▼' : '▶'}</span>}
                              {cg.skuGroup}
                              {hasMultipleSizes && <span style={{ fontSize: 10, color: COLORS.sub, marginLeft: 6 }}>({cg.rows.length} {t('cogs.sizes')})</span>}
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, fontWeight: 500, color: COLORS.text }}>{cg.totalUnits.toLocaleString('de-DE')}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtEur(cg.avgPrice)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtEur(cg.cogs)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtEur(cg.commission)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtEur(cg.fba)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtEur(cg.rows.reduce((s, r) => s + r.adSpend * r.units, 0) / cg.totalUnits)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtEur(cg.breakeven)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: cg.profitPerUnit >= 0 ? COLORS.green : COLORS.red }}>{fmtEur(cg.profitPerUnit)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right' }}>{marginBadge(cg.margin)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, fontWeight: 500, color: cg.maxDiscount > 30 ? COLORS.green : cg.maxDiscount > 15 ? COLORS.orange : COLORS.red }}>{fmtPct(cg.maxDiscount)}</td>
                          </tr>

                          {/* Level 3: Individual SKUs */}
                          {isGroupExpanded && cg.rows.map(row => (
                            <tr
                              key={row.sku}
                              style={{ borderBottom: `1px solid ${COLORS.border}`, background: selectedSku === row.sku ? '#F8FAFC' : 'transparent', cursor: 'pointer' }}
                              onClick={e => { e.stopPropagation(); setSelectedSku(row.sku); setDiscountPct(0) }}
                            >
                              <td style={{ padding: '6px 10px 6px 64px', fontSize: 12, color: selectedSku === row.sku ? COLORS.accent : '#64748B', fontWeight: 500 }}>
                                {selectedSku === row.sku && '● '}{row.sku}
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{row.units.toLocaleString('de-DE')}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtEur(row.avgPrice)}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtEur(row.cogs)}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtEur(row.commission)}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtEur(row.fba)}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtEur(row.adSpend)}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtEur(row.breakeven)}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: row.profitPerUnit >= 0 ? COLORS.green : COLORS.red }}>{fmtEur(row.profitPerUnit)}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right' }}>{marginBadge(row.margin)}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 12, color: COLORS.sub }}>{fmtPct(row.maxDiscount)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      )
                    })}
                  </React.Fragment>
                )
              })}
              {parentGroups.length === 0 && (
                <tr><td colSpan={12} style={{ padding: 30, textAlign: 'center', color: COLORS.sub }}>{t('cogs.noData')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost Detail Card — combined tabs */}
      {sel && (
        <div style={{ ...CARD_STYLE, padding: 0, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {(() => {
                  const info = getBySku(sel.sku)
                  const asin = asinFromSku(sel.sku)
                  return info?.image_url ? (
                    <a href={`/products/${asin}`} style={{ lineHeight: 0 }}>
                      <img src={info.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: `1px solid ${COLORS.border}` }} />
                    </a>
                  ) : <ImgPlaceholder size={40} />
                })()}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>{sel.skuGroup}</div>
                  <div style={{ fontSize: 12, color: COLORS.sub }}>{sel.parentTitle ? sel.parentTitle.substring(0, 40) : sel.sku}</div>
                </div>
              </div>
              <select
                value={selectedSku || ''}
                onChange={e => { setSelectedSku(e.target.value); setDiscountPct(0) }}
                style={{ ...SELECT_STYLE, fontSize: 12 }}
              >
                {skuOptions.map(opt => (
                  <option key={opt.sku} value={opt.sku}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 0 }}>
              {isMobile ? (
                [{ id: 'breakdown', l: t('cogs.costBreakdown') }, { id: 'edit', l: t('cogs.costEditing') }, { id: 'discount', l: t('cogs.discountSimulator') }].map(tab => (
                  <button key={tab.id} onClick={() => setCostTab(tab.id)} style={{
                    padding: '10px 14px', border: 'none', background: 'transparent', fontSize: 12,
                    fontWeight: costTab === tab.id ? 600 : 400, color: costTab === tab.id ? COLORS.accent : COLORS.sub,
                    borderBottom: costTab === tab.id ? `2px solid ${COLORS.accent}` : '2px solid transparent', cursor: 'pointer',
                  }}>{tab.l}</button>
                ))
              ) : (
                [{ id: 'combined', l: `${t('cogs.costBreakdown')} & ${t('cogs.costEditing')}` }, { id: 'discount', l: t('cogs.discountSimulator') }].map(tab => (
                  <button key={tab.id} onClick={() => setCostTab(tab.id)} style={{
                    padding: '10px 20px', border: 'none', background: 'transparent', fontSize: 13,
                    fontWeight: costTab === tab.id ? 600 : 400, color: costTab === tab.id ? COLORS.accent : COLORS.sub,
                    borderBottom: costTab === tab.id ? `2px solid ${COLORS.accent}` : '2px solid transparent', cursor: 'pointer',
                  }}>{tab.l}</button>
                ))
              )}
            </div>
          </div>

          <div style={{ padding: 24 }}>
            {/* Desktop: combined side by side */}
            {costTab === 'combined' && !isMobile && (
              <div className="grid-2" style={{ alignItems: 'stretch' }}>
                {/* LEFT: Cost Breakdown */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>{t('cogs.costBreakdown')}</div>
                  <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 18 }}>{t('cogs.fromPriceToProfit')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    {costBarsData.map((b, i) => {
                      const pct = Math.abs(b.value) / maxBarVal * 100
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                          <div style={{ width: 90, textAlign: 'right', paddingRight: 14, fontSize: 12, color: COLORS.sub, fontWeight: 400, flexShrink: 0 }}>{b.label}</div>
                          <div style={{ flex: 1, position: 'relative', height: 24, background: '#F8FAFC', borderRadius: 6 }}>
                            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: b.color, borderRadius: 6, minWidth: 4, transition: 'width .3s' }} />
                          </div>
                          <div style={{ width: 65, textAlign: 'right', fontSize: 12, fontWeight: 600, color: COLORS.text, flexShrink: 0, paddingLeft: 10 }}>
                            {b.value >= 0 ? '' : '−'}{Math.abs(b.value).toFixed(2)} €
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ marginTop: 12, padding: '12px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.red }}>{t('cogs.breakeven')}: {fmtEur(sel.breakeven)}</span>
                    <span style={{ fontSize: 12, color: '#64748B' }}>· {t('cogs.belowBreakeven')}</span>
                  </div>
                </div>

                {/* RIGHT: Cost Edit */}
                <div style={{ borderLeft: `1px solid ${COLORS.border}`, paddingLeft: 24, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>{t('cogs.costEditing')}</div>
                  <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 14 }}>{t('cogs.updateCogs')}</div>
                  {editingGroup === sel.skuGroup ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                      <div>
                        <label style={{ fontSize: 11, color: COLORS.sub, display: 'block', marginBottom: 4 }}>{t('cogs.packagingCost')} (€)</label>
                        <input type="number" step="0.01" value={editPackCost} onChange={e => setEditPackCost(e.target.value)} style={{ ...SELECT_STYLE, width: '100%' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: COLORS.sub, display: 'block', marginBottom: 4 }}>{t('cogs.otherCost')} (€)</label>
                        <input type="number" step="0.01" value={editOtherCost} onChange={e => setEditOtherCost(e.target.value)} style={{ ...SELECT_STYLE, width: '100%' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => saveCost(sel.skuGroup)} style={{ flex: 1, padding: 12, borderRadius: 10, background: COLORS.accent, color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>{t('common.save')}</button>
                        <button onClick={() => setEditingGroup(null)} style={{ flex: 1, padding: 12, borderRadius: 10, background: '#F8FAFC', color: COLORS.sub, fontSize: 13, fontWeight: 600, border: `1px solid ${COLORS.border}`, cursor: 'pointer' }}>{t('common.cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ flex: 1 }}>
                      {[
                        { l: t('cogs.cogsUnit'), v: sel.cogs }, { l: t('cogs.commissionUnit'), v: sel.commission }, { l: t('cogs.fbaShippingUnit'), v: sel.fba },
                        { l: t('cogs.storageUnit'), v: sel.storage }, { l: t('cogs.returnsDigitalUnit'), v: sel.returnMgmt + sel.digital }, { l: t('cogs.adsUnit'), v: sel.adSpend },
                      ].map((r, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid #F8FAFC` }}>
                          <span style={{ fontSize: 13, color: '#64748B' }}>{r.l}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{fmtEur(r.v)}</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: `2px solid ${COLORS.border}`, marginTop: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{t('cogs.totalCost')}</span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>{fmtEur(sel.totalCost)}</span>
                      </div>
                      {!sel.hasEconData && (
                        <div style={{ fontSize: 11, color: COLORS.orange, marginBottom: 8 }}>{t('cogs.feesEstimated')}</div>
                      )}
                      <button onClick={() => { setEditingGroup(sel.skuGroup); setEditPackCost(sel.cogs.toFixed(2)); setEditOtherCost('0') }}
                        style={{ width: '100%', padding: 12, borderRadius: 10, background: COLORS.accent, color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                        {t('cogs.editCost')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Mobile: breakdown only */}
            {costTab === 'breakdown' && isMobile && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>{t('cogs.costBreakdown')}</div>
                <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 18 }}>{t('cogs.fromPriceToProfit')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {costBarsData.map((b, i) => {
                    const pct = Math.abs(b.value) / maxBarVal * 100
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: 80, textAlign: 'right', paddingRight: 10, fontSize: 11, color: COLORS.sub, fontWeight: 400, flexShrink: 0 }}>{b.label}</div>
                        <div style={{ flex: 1, position: 'relative', height: 22, background: '#F8FAFC', borderRadius: 6 }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: b.color, borderRadius: 6, minWidth: 4 }} />
                        </div>
                        <div style={{ width: 60, textAlign: 'right', fontSize: 11, fontWeight: 600, color: COLORS.text, flexShrink: 0, paddingLeft: 8 }}>
                          {b.value >= 0 ? '' : '−'}{Math.abs(b.value).toFixed(2)} €
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.red }}>{t('cogs.breakeven')}: {fmtEur(sel.breakeven)}</span>
                  <span style={{ fontSize: 12, color: '#64748B' }}>· {t('cogs.belowBreakeven')}</span>
                </div>
              </div>
            )}

            {/* Mobile: edit only */}
            {costTab === 'edit' && isMobile && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>{t('cogs.costEditing')}</div>
                <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 14 }}>{t('cogs.updateCogs')}</div>
                {editingGroup === sel.skuGroup ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, color: COLORS.sub, display: 'block', marginBottom: 4 }}>{t('cogs.packagingCost')} (€)</label>
                      <input type="number" step="0.01" value={editPackCost} onChange={e => setEditPackCost(e.target.value)} style={{ ...SELECT_STYLE, width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: COLORS.sub, display: 'block', marginBottom: 4 }}>{t('cogs.otherCost')} (€)</label>
                      <input type="number" step="0.01" value={editOtherCost} onChange={e => setEditOtherCost(e.target.value)} style={{ ...SELECT_STYLE, width: '100%' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => saveCost(sel.skuGroup)} style={{ flex: 1, padding: 12, borderRadius: 10, background: COLORS.accent, color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>{t('common.save')}</button>
                      <button onClick={() => setEditingGroup(null)} style={{ flex: 1, padding: 12, borderRadius: 10, background: '#F8FAFC', color: COLORS.sub, fontSize: 13, fontWeight: 600, border: `1px solid ${COLORS.border}`, cursor: 'pointer' }}>{t('common.cancel')}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {[
                      { l: t('cogs.cogsUnit'), v: sel.cogs }, { l: t('cogs.commissionUnit'), v: sel.commission }, { l: t('cogs.fbaShippingUnit'), v: sel.fba },
                      { l: t('cogs.storageUnit'), v: sel.storage }, { l: t('cogs.returnsDigitalUnit'), v: sel.returnMgmt + sel.digital }, { l: t('cogs.adsUnit'), v: sel.adSpend },
                    ].map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #F8FAFC' }}>
                        <span style={{ fontSize: 13, color: '#64748B' }}>{r.l}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{fmtEur(r.v)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: `2px solid ${COLORS.border}`, marginTop: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{t('cogs.totalCost')}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>{fmtEur(sel.totalCost)}</span>
                    </div>
                    {!sel.hasEconData && (
                      <div style={{ fontSize: 11, color: COLORS.orange, marginTop: 10, marginBottom: 8 }}>{t('cogs.feesEstimated')}</div>
                    )}
                    <button onClick={() => { setEditingGroup(sel.skuGroup); setEditPackCost(sel.cogs.toFixed(2)); setEditOtherCost('0') }}
                      style={{ width: '100%', padding: 12, borderRadius: 10, background: COLORS.accent, color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      {t('cogs.editCost')}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Discount Simulator */}
            {costTab === 'discount' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: COLORS.sub }}>%0</span>
                  <div style={{ flex: 1 }}>
                    <input type="range" min={0} max={50} value={discountPct}
                      onChange={e => { const v = Number(e.target.value); if (!isNaN(v)) setDiscountPct(v) }}
                      style={{ width: '100%', accentColor: COLORS.accent }} />
                  </div>
                  <span style={{ fontSize: 12, color: COLORS.sub }}>%50</span>
                </div>
                <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: COLORS.accent, marginBottom: 16 }}>%{discountPct} {t('cogs.discount').toLowerCase()}</div>

                {selectedDiscountRow && (
                  <div style={{ display: 'flex', gap: 16, marginBottom: 18, padding: '14px 18px', background: '#F8FAFC', borderRadius: 10 }}>
                    {[
                      { l: t('cogs.newPrice'), v: fmtEur(selectedDiscountRow.newPrice) },
                      { l: t('cogs.profitPerUnit'), v: fmtEur(selectedDiscountRow.profit), c: selectedDiscountRow.profit >= 0 ? COLORS.green : COLORS.red },
                      { l: t('cogs.marginPct'), v: fmtPct(selectedDiscountRow.margin), c: selectedDiscountRow.margin >= 0 ? COLORS.green : COLORS.red },
                    ].map((m, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: COLORS.sub, letterSpacing: '.05em', marginBottom: 3 }}>{m.l}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: m.c || COLORS.text }}>{m.v}</div>
                      </div>
                    ))}
                  </div>
                )}

                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>
                      {[t('cogs.discount'), t('cogs.newPrice'), t('cogs.profitPerUnit'), t('cogs.marginPct'), t('cogs.status')].map(h => (
                        <th key={h} style={{ ...TH_STYLE, padding: '7px 10px', textAlign: 'right' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {discountTable.map(row => (
                      <tr key={row.pct} onClick={() => setDiscountPct(row.pct)}
                        style={{ borderBottom: `1px solid #F8FAFC`, cursor: 'pointer', background: discountPct === row.pct ? `${COLORS.accent}10` : 'transparent' }}>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: COLORS.accent }}>%{row.pct}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, color: '#64748B' }}>{fmtEur(row.newPrice)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: row.profit >= 0 ? COLORS.green : COLORS.red }}>{fmtEur(row.profit)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{marginBadge(row.margin)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 11 }}>{row.margin >= 15 ? '✅' : row.margin >= 0 ? '⚡' : '⚠️'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 14, fontSize: 11, color: COLORS.sub }}>
                  {t('cogs.maxDiscountInfo')} <span style={{ fontWeight: 600, color: COLORS.green }}>%{sel.maxDiscount.toFixed(0)}</span>
                  {sel.avgPrice > 20 && (
                    <span style={{ color: COLORS.orange, marginLeft: 6 }}>{t('cogs.commissionAdvantage')}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profitability Scatter Map */}
      <div style={{ ...CARD_STYLE, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>{t('cogs.profitabilityMap')}</div>
        <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 16 }}>{t('cogs.profitabilityMapDesc')}</div>
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
            <XAxis dataKey="x" type="number" name="Units" tick={{ fontSize: 11, fill: COLORS.sub }} axisLine={false} tickLine={false} />
            <YAxis dataKey="y" type="number" name="Margin%" tick={{ fontSize: 11, fill: COLORS.sub }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} domain={[-10, 50]} />
            <ZAxis dataKey="z" range={[80, 500]} />
            <Tooltip content={({ active, payload }: any) => active && payload?.[0] ? (
              <div style={{ background: COLORS.text, borderRadius: 8, padding: '10px 16px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{payload[0].payload.name}</div>
                <div style={{ fontSize: 12, color: COLORS.sub }}>{payload[0].payload.x} units · {payload[0].payload.y.toFixed(1)}% margin</div>
              </div>
            ) : null} />
            <Scatter data={scatterData}>
              {scatterData.map((entry, i) => {
                let color: string = COLORS.accent
                if (entry.x >= medianUnits && entry.y >= 20) color = COLORS.green
                else if (entry.x < medianUnits && entry.y >= 20) color = COLORS.accent
                else if (entry.x >= medianUnits && entry.y < 20) color = COLORS.orange
                else color = COLORS.red
                return <Cell key={i} fill={color} fillOpacity={0.75} />
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 8 }}>
          {[
            { l: t('cogs.legendStar'), c: COLORS.green },
            { l: t('cogs.legendNiche'), c: COLORS.accent },
            { l: t('cogs.legendVolume'), c: COLORS.orange },
            { l: t('cogs.legendProblem'), c: COLORS.red },
          ].map((lg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: COLORS.sub }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: lg.c }} />{lg.l}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
