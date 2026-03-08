'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import DashboardShell from '../components/DashboardShell'
import Sidebar from '../components/Sidebar'
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, ScatterChart, Scatter, ZAxis, Cell,
} from 'recharts'

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

type SortKey = 'units' | 'avgPrice' | 'cogs' | 'commission' | 'fba' | 'storage' | 'totalCost' | 'breakeven' | 'profitPerUnit' | 'margin' | 'maxDiscount'

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
const fmtOrDash = (v: number | null | undefined, hasData: boolean) => hasData ? fmtEur(v) : '—'

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

      const parentQ = supabase
        .from('parent_asin_map')
        .select('parent_asin, child_asin, sku, title')

      // Fetch all in parallel (with pagination for large tables)
      const [orders, econ, cogs, ads, parentMapRes] = await Promise.all([
        fetchAll(ordersQ),
        fetchAll(econQ),
        fetchAll(cogsQ),
        fetchAll(adsQ),
        supabase.from('parent_asin_map').select('parent_asin, child_asin, sku, title'),
      ])

      const parentMap = parentMapRes.data || []

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

        // Economics
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
          commPerUnit = avgPrice * getCommissionRate(avgPrice)
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
    })

    // Step 2: Group color groups into parent ASINs
    const parentMap: Record<string, ParentGroup> = {}
    Object.values(colorMap).forEach(cg => {
      // Find parent ASIN from first row
      const firstRow = cg.rows[0]
      const pAsin = firstRow?.parentAsin || cg.skuGroup
      const pTitle = firstRow?.parentTitle || ''
      if (!parentMap[pAsin]) {
        parentMap[pAsin] = { parentAsin: pAsin, title: pTitle, colorGroups: [], totalUnits: 0, avgPrice: 0, totalCost: 0, profitPerUnit: 0, margin: 0 }
      }
      parentMap[pAsin].colorGroups.push(cg)
      parentMap[pAsin].totalUnits += cg.totalUnits
      // Use first title we find
      if (!parentMap[pAsin].title && pTitle) parentMap[pAsin].title = pTitle
    })

    // Weighted averages for parent
    Object.values(parentMap).forEach(pg => {
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

    // Sort by sortKey (use totalUnits for parent level)
    const sorted = Object.values(parentMap)
    sorted.sort((a, b) => sortDir === 'asc' ? a.totalUnits - b.totalUnits : b.totalUnits - a.totalUnits)
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

  // ========== Waterfall ==========
  const waterfallData = useMemo(() => {
    if (!sel) return []
    return [
      { name: 'Satış Fiyatı', value: sel.avgPrice, fill: '#22c55e' },
      { name: 'COGS', value: -sel.cogs, fill: '#ef4444' },
      { name: 'Komisyon', value: -sel.commission, fill: '#ef4444' },
      { name: 'FBA', value: -sel.fba, fill: '#ef4444' },
      { name: 'Depolama', value: -sel.storage, fill: '#f59e0b' },
      { name: 'İade+Digital', value: -(sel.returnMgmt + sel.digital), fill: '#f59e0b' },
      { name: 'Reklam', value: -sel.adSpend, fill: '#f59e0b' },
      { name: 'Net Kâr', value: sel.profitPerUnit, fill: sel.profitPerUnit >= 0 ? '#3b82f6' : '#ef4444' },
    ]
  }, [sel])

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
      const commNote = (sel.avgPrice >= 20 && newPrice < 20) ? '💡 %10' : ''
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
        notes: `Manuel güncelleme - ${today}`,
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

  const marginBadge = (margin: number) => {
    let bg = '#22c55e20', color = '#22c55e'
    if (margin < 10) { bg = '#ef444420'; color = '#ef4444' }
    else if (margin < 30) { bg = '#f59e0b20'; color = '#f59e0b' }
    return <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: bg, color }}>{fmtPct(margin)}</span>
  }

  // ========== Styles ==========
  const cardStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20 }
  const selectStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }
  const th: React.CSSProperties = { padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 11, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '8px', fontSize: 12, fontFamily: 'monospace' }
  const tooltipStyle = { contentStyle: { background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)' }, labelStyle: { color: 'var(--text-secondary)' } }
  const btnStyle: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', minHeight: 44 }

  if (loading) {
    return (
      <DashboardShell sidebar={<Sidebar />}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: '3px solid var(--border-color)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Veriler yükleniyor...</div>
          </div>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell sidebar={<Sidebar />}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>💰 COGS & Karlılık</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '3px 0 0' }}>SKU bazlı maliyet ve kârlılık analizi · {selectedMonth}</p>
        </div>
        <div className="header-controls" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={selectStyle}>
            {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={selectedMarketplace} onChange={e => setSelectedMarketplace(e.target.value)} style={selectStyle}>
            {MARKETPLACE_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0s forwards' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>ORT. MARJ</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: avgMargin >= 0 ? '#22c55e' : '#ef4444' }}>{fmtPct(avgMargin)}</div>
        </div>
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0.1s forwards' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>ZARAR EDEN SKU</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: lossMakingSkus.length > 0 ? '#ef4444' : '#22c55e' }}>{lossMakingSkus.length}</div>
          {lossMakingSkus.length > 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{lossMakingSkus.slice(0, 3).map(s => s.sku.substring(0, 10)).join(', ')}</div>}
        </div>
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0.2s forwards' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>EN KÂRLI ÜRÜN</div>
          {bestSku ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bestSku.sku}</div>
              <div style={{ fontSize: 12, color: '#22c55e' }}>{fmtEur(bestSku.profitPerUnit)}/birim · {fmtPct(bestSku.margin)}</div>
            </>
          ) : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>—</div>}
        </div>
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0.3s forwards' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>ORT. BREAKEVEN</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtEur(avgBreakeven)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Maks indirim: {fmtPct(avgMaxDiscount)}</div>
        </div>
      </div>

      {/* 3-Level Table */}
      <div style={{ ...cardStyle, marginBottom: 20, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0.4s forwards' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Ürün Karlılık Tablosu</div>
        <div className="pl-table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ ...th, textAlign: 'left', minWidth: 220 }}>Ürün</th>
                {([
                  ['units', 'Adet'], ['avgPrice', 'Ort.Fiyat'], ['cogs', 'COGS'], ['commission', 'Komisyon'],
                  ['fba', 'FBA'], ['storage', 'Depolama'], ['totalCost', 'Top.Maliyet'], ['breakeven', 'Breakeven'],
                  ['profitPerUnit', 'Kâr/birim'], ['margin', 'Marj%'], ['maxDiscount', 'Maks İnd.%'],
                ] as const).map(([key, label]) => (
                  <th key={key} onClick={() => handleSort(key as SortKey)} style={{ ...th, textAlign: 'right', color: sortKey === key ? '#6366f1' : 'var(--text-secondary)' }}>
                    {label}{sortIcon(key as SortKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parentGroups.map(pg => {
                const isParentExpanded = expandedParents.has(pg.parentAsin)
                const skuCount = pg.colorGroups.reduce((s, cg) => s + cg.rows.length, 0)
                const displayTitle = pg.title ? pg.title.substring(0, 35) : pg.parentAsin

                return (
                  <React.Fragment key={pg.parentAsin}>
                    {/* Level 1: Parent ASIN */}
                    <tr
                      style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer', transition: 'background 0.15s', background: 'rgba(99,102,241,0.02)' }}
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
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.02)'}
                    >
                      <td style={{ ...td, fontWeight: 700, fontSize: 13 }}>
                        <span style={{ marginRight: 6, fontSize: 10 }}>{isParentExpanded ? '▼' : '▶'}</span>
                        {displayTitle}
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8 }}>{skuCount} SKU · {pg.totalUnits.toLocaleString('de-DE')} adet</span>
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{pg.totalUnits.toLocaleString('de-DE')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtEur(pg.avgPrice)}</td>
                      <td colSpan={5} />
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmtEur(pg.totalCost)}</td>
                      <td style={{ ...td, textAlign: 'right', color: pg.profitPerUnit >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{fmtEur(pg.profitPerUnit)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{marginBadge(pg.margin)}</td>
                      <td />
                    </tr>

                    {/* Level 2: Color groups */}
                    {isParentExpanded && pg.colorGroups.map(cg => {
                      const isGroupExpanded = expandedGroups.has(cg.skuGroup)
                      const hasMultipleSizes = cg.rows.length > 1
                      return (
                        <React.Fragment key={cg.skuGroup}>
                          <tr
                            style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer', transition: 'background 0.15s', background: 'var(--bg-sub-row)' }}
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
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.04)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-sub-row)'}
                          >
                            <td style={{ ...td, paddingLeft: 28, fontWeight: 600, fontSize: 12.5 }}>
                              {hasMultipleSizes && <span style={{ marginRight: 6, fontSize: 9 }}>{isGroupExpanded ? '▼' : '▶'}</span>}
                              {cg.skuGroup}
                              {hasMultipleSizes && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>({cg.rows.length} beden)</span>}
                            </td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{cg.totalUnits.toLocaleString('de-DE')}</td>
                            <td style={{ ...td, textAlign: 'right' }}>{fmtEur(cg.avgPrice)}</td>
                            <td style={{ ...td, textAlign: 'right' }}>{fmtEur(cg.cogs)}</td>
                            <td style={{ ...td, textAlign: 'right' }}>{fmtOrDash(cg.commission, cg.hasEconData)}</td>
                            <td style={{ ...td, textAlign: 'right' }}>{fmtOrDash(cg.fba, cg.hasEconData)}</td>
                            <td style={{ ...td, textAlign: 'right' }}>{fmtOrDash(cg.storage, cg.hasEconData)}</td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmtEur(cg.totalCost)}</td>
                            <td style={{ ...td, textAlign: 'right', color: '#f59e0b' }}>{fmtEur(cg.breakeven)}</td>
                            <td style={{ ...td, textAlign: 'right', color: cg.profitPerUnit >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{fmtEur(cg.profitPerUnit)}</td>
                            <td style={{ ...td, textAlign: 'right' }}>{marginBadge(cg.margin)}</td>
                            <td style={{ ...td, textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtPct(cg.maxDiscount)}</td>
                          </tr>

                          {/* Level 3: Individual SKUs (sizes) */}
                          {isGroupExpanded && cg.rows.map(row => (
                            <tr
                              key={row.sku}
                              style={{ borderBottom: '1px solid var(--border-color)', background: selectedSku === row.sku ? 'rgba(99,102,241,0.08)' : 'transparent', cursor: 'pointer' }}
                              onClick={e => { e.stopPropagation(); setSelectedSku(row.sku); setDiscountPct(0) }}
                            >
                              <td style={{ ...td, paddingLeft: 52, fontSize: 11, color: selectedSku === row.sku ? '#6366f1' : 'var(--text-secondary)' }}>
                                {selectedSku === row.sku && '● '}{row.sku}
                              </td>
                              <td style={{ ...td, textAlign: 'right', fontSize: 11 }}>{row.units.toLocaleString('de-DE')}</td>
                              <td style={{ ...td, textAlign: 'right', fontSize: 11 }}>{fmtEur(row.avgPrice)}</td>
                              <td style={{ ...td, textAlign: 'right', fontSize: 11 }}>{fmtEur(row.cogs)}</td>
                              <td style={{ ...td, textAlign: 'right', fontSize: 11 }}>{fmtOrDash(row.commission, row.hasEconData)}</td>
                              <td style={{ ...td, textAlign: 'right', fontSize: 11 }}>{fmtOrDash(row.fba, row.hasEconData)}</td>
                              <td style={{ ...td, textAlign: 'right', fontSize: 11 }}>{fmtOrDash(row.storage, row.hasEconData)}</td>
                              <td style={{ ...td, textAlign: 'right', fontSize: 11 }}>{fmtEur(row.totalCost)}</td>
                              <td style={{ ...td, textAlign: 'right', fontSize: 11, color: '#f59e0b' }}>{fmtEur(row.breakeven)}</td>
                              <td style={{ ...td, textAlign: 'right', fontSize: 11, color: row.profitPerUnit >= 0 ? '#22c55e' : '#ef4444' }}>{fmtEur(row.profitPerUnit)}</td>
                              <td style={{ ...td, textAlign: 'right' }}>{marginBadge(row.margin)}</td>
                              <td style={{ ...td, textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)' }}>{fmtPct(row.maxDiscount)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      )
                    })}
                  </React.Fragment>
                )
              })}
              {parentGroups.length === 0 && (
                <tr><td colSpan={12} style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>Bu ay için veri bulunamadı</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Waterfall + Maliyet Düzenleme */}
      {sel && (
        <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0.5s forwards' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Maliyet Kırılımı</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>{sel.sku} · Fiyattan kâra giden yol</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={waterfallData} layout="vertical" margin={{ left: 80, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmtEur(v, 0)} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} width={75} />
                <Tooltip {...tooltipStyle} formatter={(value: any) => [fmtEur(Math.abs(n(value))), '']} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {waterfallData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 8, fontSize: 12 }}>
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>Breakeven: {fmtEur(sel.breakeven)}</span>
              <span style={{ color: 'var(--text-muted)', marginLeft: 12 }}>Bu fiyatın altında zarar</span>
            </div>
          </div>

          <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0.55s forwards' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Maliyet Düzenleme</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>{sel.skuGroup} · COGS güncelle</div>

            {editingGroup === sel.skuGroup ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Paketleme Maliyeti (€)</label>
                  <input type="number" step="0.01" value={editPackCost} onChange={e => setEditPackCost(e.target.value)} style={{ ...selectStyle, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Diğer Maliyet (€)</label>
                  <input type="number" step="0.01" value={editOtherCost} onChange={e => setEditOtherCost(e.target.value)} style={{ ...selectStyle, width: '100%' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => saveCost(sel.skuGroup)} style={{ ...btnStyle, background: '#6366f1', color: 'white', flex: 1 }}>Kaydet</button>
                  <button onClick={() => setEditingGroup(null)} style={{ ...btnStyle, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', flex: 1 }}>İptal</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {[
                    ['COGS/birim', sel.cogs], ['Komisyon/birim', sel.commission], ['FBA/birim', sel.fba],
                    ['Depolama/birim', sel.storage], ['İade+Digital/birim', sel.returnMgmt + sel.digital],
                    ['Reklam/birim', sel.adSpend], ['Toplam Maliyet', sel.totalCost],
                  ].map(([label, val], i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label as string}</span>
                      <span style={{ fontSize: 13, fontWeight: i === 6 ? 700 : 600 }}>{fmtEur(val as number)}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => { setEditingGroup(sel.skuGroup); setEditPackCost(sel.cogs.toFixed(2)); setEditOtherCost('0') }} style={{ ...btnStyle, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', width: '100%' }}>
                  Maliyeti Düzenle
                </button>
                <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)', padding: '8px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
                  Komisyon kuralı: Satış &lt; 20€ → %10 | Satış ≥ 20€ → %15
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* İndirim Simülatörü */}
      {sel && (
        <div style={{ ...cardStyle, marginBottom: 20, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0.6s forwards' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>İndirim Simülatörü</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>{sel.sku}</div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>%0</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: discountPct > sel.maxDiscount ? '#ef4444' : '#6366f1' }}>%{discountPct} indirim</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>%50</span>
            </div>
            <input type="range" min={0} max={50} step={1} value={discountPct}
              onChange={e => { const v = Number(e.target.value); if (!isNaN(v)) setDiscountPct(v) }}
              style={{ width: '100%', accentColor: discountPct > sel.maxDiscount ? '#ef4444' : '#6366f1' }}
            />
            {selectedDiscountRow && (
              <div style={{ display: 'flex', gap: 20, marginTop: 10, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
                <div><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Yeni Fiyat</span><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtEur(selectedDiscountRow.newPrice)}</div></div>
                <div><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Kâr/birim</span><div style={{ fontSize: 14, fontWeight: 700, color: selectedDiscountRow.profit >= 0 ? '#22c55e' : '#ef4444' }}>{fmtEur(selectedDiscountRow.profit)}</div></div>
                <div><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Marj</span><div style={{ fontSize: 14, fontWeight: 700, color: selectedDiscountRow.margin >= 0 ? '#22c55e' : '#ef4444' }}>{fmtPct(selectedDiscountRow.margin)}</div></div>
              </div>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ ...th, textAlign: 'left', cursor: 'default' }}>İndirim</th>
                  <th style={{ ...th, textAlign: 'right', cursor: 'default' }}>Yeni Fiyat</th>
                  <th style={{ ...th, textAlign: 'right', cursor: 'default' }}>Kâr/birim</th>
                  <th style={{ ...th, textAlign: 'right', cursor: 'default' }}>Marj%</th>
                  <th style={{ ...th, textAlign: 'center', cursor: 'default' }}>Durum</th>
                  <th style={{ ...th, textAlign: 'center', cursor: 'default' }}>Not</th>
                </tr>
              </thead>
              <tbody>
                {discountTable.map(row => (
                  <tr key={row.pct} style={{ borderBottom: '1px solid var(--border-color)', background: row.pct === discountPct ? 'rgba(99,102,241,0.08)' : 'transparent', fontWeight: row.pct === discountPct ? 600 : 400 }}>
                    <td style={td}>%{row.pct}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtEur(row.newPrice)}</td>
                    <td style={{ ...td, textAlign: 'right', color: row.profit >= 0 ? '#22c55e' : '#ef4444' }}>{fmtEur(row.profit)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{marginBadge(row.margin)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{row.status}</td>
                    <td style={{ ...td, textAlign: 'center', fontSize: 11 }}>{row.commNote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
            Bu ürün maksimum <strong style={{ color: '#f59e0b' }}>%{sel.maxDiscount.toFixed(0)}</strong> indirim kaldırır.
            {sel.avgPrice >= 20 && sel.avgPrice * (1 - sel.maxDiscount / 100) < 20 && (
              <span style={{ color: '#06b6d4', marginLeft: 6 }}>Fiyat 20€ altına düşerse komisyon %15→%10 avantajı devreye girer.</span>
            )}
          </div>
        </div>
      )}

      {/* Scatter */}
      <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0.7s forwards' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Karlılık Haritası</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>X: Satış adedi · Y: Marj% · Boyut: Toplam kâr</div>
        <ResponsiveContainer width="100%" height={350}>
          <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis type="number" dataKey="x" name="Adet" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="number" dataKey="y" name="Marj%" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
            <ZAxis type="number" dataKey="z" range={[50, 400]} />
            <Tooltip {...tooltipStyle} content={({ active, payload }: any) => {
              if (!active || !payload?.[0]) return null
              const d = payload[0].payload
              return (
                <div style={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.name}</div>
                  <div>Adet: {n(d.x).toLocaleString('de-DE')}</div>
                  <div>Marj: {fmtPct(d.y)}</div>
                  <div>Toplam Kâr: {fmtEur(d.profit, 0)}</div>
                </div>
              )
            }} />
            <Scatter data={scatterData}>
              {scatterData.map((entry, i) => {
                let color = '#6366f1'
                if (entry.x >= medianUnits && entry.y >= 20) color = '#22c55e'
                else if (entry.x < medianUnits && entry.y >= 20) color = '#3b82f6'
                else if (entry.x >= medianUnits && entry.y < 20) color = '#f59e0b'
                else color = '#ef4444'
                return <Cell key={i} fill={color} fillOpacity={0.7} />
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
          {[
            { color: '#22c55e', label: '⭐ Yıldız' },
            { color: '#3b82f6', label: '💤 Niş' },
            { color: '#f59e0b', label: '⚠️ Hacim' },
            { color: '#ef4444', label: '❌ Sorunlu' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color }} />
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  )
}
