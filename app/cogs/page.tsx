'use client'

import React, { useState, useEffect, useMemo } from 'react'
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

function getPrevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const fmtEur = (v: number, dec = 2) => {
  if (v < 0) return `-${Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec })} €`
  return `${v.toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec })} €`
}
const fmtPct = (v: number) => `%${v.toFixed(1)}`

export default function COGSPage() {
  const monthOptions = useMemo(() => generateMonthOptions(), [])
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0])
  const [selectedMarketplace, setSelectedMarketplace] = useState('all')
  const [loading, setLoading] = useState(true)
  const [skuRows, setSkuRows] = useState<SkuRow[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [selectedSku, setSelectedSku] = useState<string | null>(null)
  const [discountPct, setDiscountPct] = useState(0)

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('units')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Cost editing
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [editPackCost, setEditPackCost] = useState('')
  const [editOtherCost, setEditOtherCost] = useState('')

  // ========== FETCH DATA ==========
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { startDate, endDate } = getMonthRange(selectedMonth)

      // 1. Orders
      let ordersQuery = supabase
        .from('all_orders')
        .select('sku, marketplace, quantity, item_price')
        .eq('order_status', 'Shipped')
        .gte('purchase_date', startDate)
        .lte('purchase_date', endDate)

      if (selectedMarketplace !== 'all') {
        ordersQuery = ordersQuery.eq('marketplace', selectedMarketplace)
      }

      // 2. SKU Economics (weighted fees)
      const econQuery = supabase
        .from('sku_economics')
        .select('sku, marketplace, units, commission, fba, storage, return_mgmt, digital_fba, digital_sell')

      // 3. SKU COGS (tarih filtreli)
      const cogsQuery = supabase
        .from('sku_cogs')
        .select('sku_prefix, pack_cost_eur, other_cost_eur, valid_from, valid_to')

      // 4. Ad spend per SKU
      const adsQuery = supabase
        .from('ad_product_performance')
        .select('sku, spend')
        .gte('date', startDate)
        .lte('date', endDate)

      const [ordersRes, econRes, cogsRes, adsRes] = await Promise.all([
        ordersQuery, econQuery, cogsQuery, adsQuery
      ])

      const orders = ordersRes.data || []
      const econ = econRes.data || []
      const cogs = cogsRes.data || []
      const ads = adsRes.data || []

      // --- Process orders: group by SKU ---
      const skuMap: Record<string, { units: number; totalSales: number }> = {}
      orders.forEach((o: any) => {
        const sku = o.sku || ''
        if (!sku) return
        if (!skuMap[sku]) skuMap[sku] = { units: 0, totalSales: 0 }
        skuMap[sku].units += Number(o.quantity) || 0
        skuMap[sku].totalSales += Number(o.item_price) || 0
      })

      // --- Process economics: weighted average per SKU ---
      // Filter by allowed marketplaces
      const allowedMpCodes = new Set(Object.values(MP_MAP))
      const filteredEcon = econ.filter((e: any) => allowedMpCodes.has(e.marketplace))

      const econMap: Record<string, { totalUnits: number; totalComm: number; totalFba: number; totalStorage: number; totalReturn: number; totalDigital: number }> = {}
      filteredEcon.forEach((e: any) => {
        const sku = e.sku || ''
        if (!sku) return
        // If marketplace filter active, only include matching
        if (selectedMarketplace !== 'all') {
          const mpCode = MP_MAP[selectedMarketplace]
          if (e.marketplace !== mpCode) return
        }
        if (!econMap[sku]) econMap[sku] = { totalUnits: 0, totalComm: 0, totalFba: 0, totalStorage: 0, totalReturn: 0, totalDigital: 0 }
        const u = Number(e.units) || 0
        econMap[sku].totalUnits += u
        econMap[sku].totalComm += Number(e.commission) || 0
        econMap[sku].totalFba += Number(e.fba) || 0
        econMap[sku].totalStorage += Number(e.storage) || 0
        econMap[sku].totalReturn += Number(e.return_mgmt) || 0
        econMap[sku].totalDigital += (Number(e.digital_fba) || 0) + (Number(e.digital_sell) || 0)
      })

      // --- Process COGS: find valid record for the month ---
      const cogsMap: Record<string, { packCost: number; otherCost: number }> = {}
      cogs.forEach((c: any) => {
        const prefix = c.sku_prefix || ''
        const validFrom = c.valid_from || '2000-01-01'
        const validTo = c.valid_to || '9999-12-31'
        // Check if this COGS record is valid for the selected month
        if (startDate >= validFrom && startDate <= validTo) {
          cogsMap[prefix] = {
            packCost: Number(c.pack_cost_eur) || 0,
            otherCost: Number(c.other_cost_eur) || 0,
          }
        }
      })

      // --- Process ads: sum spend by SKU ---
      const adMap: Record<string, number> = {}
      ads.forEach((a: any) => {
        const sku = a.sku || ''
        if (!sku) return
        adMap[sku] = (adMap[sku] || 0) + (Number(a.spend) || 0)
      })

      // --- Build SKU rows ---
      const rows: SkuRow[] = []
      Object.entries(skuMap).forEach(([sku, data]) => {
        if (data.units <= 0) return
        const avgPrice = data.totalSales / data.units
        const skuGroup = sku.substring(0, 7)

        // Economics (weighted average = total_fee / total_units)
        const ec = econMap[sku]
        let commPerUnit = 0, fbaPerUnit = 0, storagePerUnit = 0, returnPerUnit = 0, digitalPerUnit = 0
        if (ec && ec.totalUnits > 0) {
          commPerUnit = ec.totalComm / ec.totalUnits
          fbaPerUnit = ec.totalFba / ec.totalUnits
          storagePerUnit = ec.totalStorage / ec.totalUnits
          returnPerUnit = ec.totalReturn / ec.totalUnits
          digitalPerUnit = ec.totalDigital / ec.totalUnits
        } else {
          // Fallback: komisyon kuralı
          commPerUnit = avgPrice >= 20 ? avgPrice * 0.15 : avgPrice * 0.10
        }

        // COGS
        const cogsData = cogsMap[skuGroup] || { packCost: 0, otherCost: 0 }
        const cogsPerUnit = cogsData.packCost + cogsData.otherCost

        // Ad spend per unit
        const totalAdSpend = adMap[sku] || 0
        const adPerUnit = totalAdSpend / data.units

        // Totals
        const totalCost = cogsPerUnit + commPerUnit + fbaPerUnit + storagePerUnit + returnPerUnit + digitalPerUnit + adPerUnit
        const breakeven = totalCost
        const profitPerUnit = avgPrice - totalCost
        const margin = avgPrice > 0 ? (profitPerUnit / avgPrice) * 100 : 0
        const maxDiscount = avgPrice > 0 ? ((avgPrice - breakeven) / avgPrice) * 100 : 0

        rows.push({
          sku, skuGroup, units: data.units, avgPrice,
          cogs: cogsPerUnit, commission: commPerUnit, fba: fbaPerUnit,
          storage: storagePerUnit, returnMgmt: returnPerUnit, digital: digitalPerUnit,
          adSpend: adPerUnit, totalCost, breakeven,
          profitPerUnit, margin, maxDiscount: Math.max(0, maxDiscount),
        })
      })

      setSkuRows(rows)
      setLoading(false)
      if (rows.length > 0 && !selectedSku) {
        setSelectedSku(rows.sort((a, b) => b.units - a.units)[0].sku)
      }
    }
    fetchData()
  }, [selectedMonth, selectedMarketplace])

  // ========== Grouped data ==========
  const groupedData = useMemo(() => {
    const groups: Record<string, { skuGroup: string; rows: SkuRow[]; totalUnits: number; avgPrice: number; cogs: number; commission: number; fba: number; storage: number; totalCost: number; breakeven: number; profitPerUnit: number; margin: number; maxDiscount: number }> = {}

    skuRows.forEach(row => {
      if (!groups[row.skuGroup]) {
        groups[row.skuGroup] = { skuGroup: row.skuGroup, rows: [], totalUnits: 0, avgPrice: 0, cogs: 0, commission: 0, fba: 0, storage: 0, totalCost: 0, breakeven: 0, profitPerUnit: 0, margin: 0, maxDiscount: 0 }
      }
      groups[row.skuGroup].rows.push(row)
      groups[row.skuGroup].totalUnits += row.units
    })

    // Calculate weighted averages for group
    Object.values(groups).forEach(g => {
      if (g.totalUnits === 0) return
      let totalSales = 0, totalCogs = 0, totalComm = 0, totalFba = 0, totalStorage = 0, totalCostSum = 0
      g.rows.forEach(r => {
        totalSales += r.avgPrice * r.units
        totalCogs += r.cogs * r.units
        totalComm += r.commission * r.units
        totalFba += r.fba * r.units
        totalStorage += r.storage * r.units
        totalCostSum += r.totalCost * r.units
      })
      g.avgPrice = totalSales / g.totalUnits
      g.cogs = totalCogs / g.totalUnits
      g.commission = totalComm / g.totalUnits
      g.fba = totalFba / g.totalUnits
      g.storage = totalStorage / g.totalUnits
      g.totalCost = totalCostSum / g.totalUnits
      g.breakeven = g.totalCost
      g.profitPerUnit = g.avgPrice - g.totalCost
      g.margin = g.avgPrice > 0 ? (g.profitPerUnit / g.avgPrice) * 100 : 0
      g.maxDiscount = g.avgPrice > 0 ? Math.max(0, ((g.avgPrice - g.breakeven) / g.avgPrice) * 100) : 0
    })

    // Sort groups
    const sorted = Object.values(groups)
    sorted.sort((a, b) => {
      const aV = a[sortKey as keyof typeof a] as number
      const bV = b[sortKey as keyof typeof b] as number
      return sortDir === 'asc' ? aV - bV : bV - aV
    })
    return sorted
  }, [skuRows, sortKey, sortDir])

  // ========== KPI calculations ==========
  const avgMargin = useMemo(() => {
    if (skuRows.length === 0) return 0
    const totalUnits = skuRows.reduce((s, r) => s + r.units, 0)
    const totalProfit = skuRows.reduce((s, r) => s + r.profitPerUnit * r.units, 0)
    const totalSales = skuRows.reduce((s, r) => s + r.avgPrice * r.units, 0)
    return totalSales > 0 ? (totalProfit / totalSales) * 100 : 0
  }, [skuRows])

  const lossMakingSkus = useMemo(() => skuRows.filter(r => r.margin < 0), [skuRows])
  const bestSku = useMemo(() => skuRows.length > 0 ? [...skuRows].sort((a, b) => b.profitPerUnit - a.profitPerUnit)[0] : null, [skuRows])
  const avgBreakeven = useMemo(() => {
    if (skuRows.length === 0) return 0
    const totalUnits = skuRows.reduce((s, r) => s + r.units, 0)
    return skuRows.reduce((s, r) => s + r.breakeven * r.units, 0) / totalUnits
  }, [skuRows])
  const avgMaxDiscount = useMemo(() => {
    if (skuRows.length === 0) return 0
    const totalUnits = skuRows.reduce((s, r) => s + r.units, 0)
    return skuRows.reduce((s, r) => s + r.maxDiscount * r.units, 0) / totalUnits
  }, [skuRows])

  // Previous month margin for comparison
  const prevMonthStr = getPrevMonth(selectedMonth)

  // ========== Selected SKU data ==========
  const selectedSkuData = useMemo(() => skuRows.find(r => r.sku === selectedSku) || null, [skuRows, selectedSku])

  // ========== Waterfall chart data ==========
  const waterfallData = useMemo(() => {
    if (!selectedSkuData) return []
    const s = selectedSkuData
    return [
      { name: 'Satış Fiyatı', value: s.avgPrice, fill: '#22c55e' },
      { name: 'COGS', value: -s.cogs, fill: '#ef4444' },
      { name: 'Komisyon', value: -s.commission, fill: '#ef4444' },
      { name: 'FBA', value: -s.fba, fill: '#ef4444' },
      { name: 'Depolama', value: -s.storage, fill: '#f59e0b' },
      { name: 'İade+Digital', value: -(s.returnMgmt + s.digital), fill: '#f59e0b' },
      { name: 'Reklam', value: -s.adSpend, fill: '#f59e0b' },
      { name: 'Net Kâr', value: s.profitPerUnit, fill: s.profitPerUnit >= 0 ? '#3b82f6' : '#ef4444' },
    ]
  }, [selectedSkuData])

  // ========== Discount simulator ==========
  const discountTable = useMemo(() => {
    if (!selectedSkuData) return []
    const s = selectedSkuData
    const steps = []
    for (let pct = 0; pct <= 50; pct += 5) {
      const newPrice = s.avgPrice * (1 - pct / 100)
      // Recalculate commission based on new price
      const newComm = newPrice >= 20 ? newPrice * 0.15 : newPrice * 0.10
      const newTotalCost = s.cogs + newComm + s.fba + s.storage + s.returnMgmt + s.digital + s.adSpend
      const newProfit = newPrice - newTotalCost
      const newMargin = newPrice > 0 ? (newProfit / newPrice) * 100 : 0
      let status = '✅'
      if (newMargin < 0) status = '❌'
      else if (newMargin < 10) status = '⚠️'
      steps.push({ pct, newPrice, profit: newProfit, margin: newMargin, status })
    }
    return steps
  }, [selectedSkuData])

  // Selected discount row
  const selectedDiscountRow = useMemo(() => {
    if (!selectedSkuData) return null
    const s = selectedSkuData
    const newPrice = s.avgPrice * (1 - discountPct / 100)
    const newComm = newPrice >= 20 ? newPrice * 0.15 : newPrice * 0.10
    const newTotalCost = s.cogs + newComm + s.fba + s.storage + s.returnMgmt + s.digital + s.adSpend
    const newProfit = newPrice - newTotalCost
    const newMargin = newPrice > 0 ? (newProfit / newPrice) * 100 : 0
    return { newPrice, profit: newProfit, margin: newMargin }
  }, [selectedSkuData, discountPct])

  // ========== Scatter chart data ==========
  const scatterData = useMemo(() => {
    return groupedData.map(g => ({
      name: g.skuGroup,
      x: g.totalUnits,
      y: g.margin,
      z: Math.abs(g.profitPerUnit * g.totalUnits),
      profit: g.profitPerUnit * g.totalUnits,
    }))
  }, [groupedData])

  // ========== Save COGS ==========
  const saveCost = async (skuPrefix: string) => {
    const newPackCost = parseFloat(editPackCost) || 0
    const newOtherCost = parseFloat(editOtherCost) || 0
    const today = new Date().toISOString().split('T')[0]

    await supabase
      .from('sku_cogs')
      .update({ valid_to: today })
      .eq('sku_prefix', skuPrefix)
      .is('valid_to', null)

    await supabase
      .from('sku_cogs')
      .insert({
        sku_prefix: skuPrefix,
        pack_cost_eur: newPackCost,
        other_cost_eur: newOtherCost,
        unit_cost_eur: newPackCost,
        valid_from: today,
        valid_to: null,
        notes: `Manuel güncelleme - ${today}`,
      })

    setEditingGroup(null)
    // Refetch
    setLoading(true)
    window.location.reload()
  }

  // ========== Sort handler ==========
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }
  const sortIcon = (key: SortKey) => sortKey !== key ? ' ⇅' : sortDir === 'asc' ? ' ↑' : ' ↓'

  // ========== Margin badge ==========
  const marginBadge = (margin: number) => {
    let bg = '#22c55e20', color = '#22c55e'
    if (margin < 10) { bg = '#ef444420'; color = '#ef4444' }
    else if (margin < 30) { bg = '#f59e0b20'; color = '#f59e0b' }
    return <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: bg, color }}>{fmtPct(margin)}</span>
  }

  // ========== Styles ==========
  const cardStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20 }
  const selectStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }
  const thStyle: React.CSSProperties = { padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 11, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }
  const tdStyle: React.CSSProperties = { padding: '8px', fontSize: 12, fontFamily: 'monospace' }
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
      {/* A) Üst Bar */}
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

      {/* B) KPI Cards */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0s forwards' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>ORT. MARJ</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: avgMargin >= 0 ? '#22c55e' : '#ef4444' }}>{fmtPct(avgMargin)}</div>
        </div>
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0.1s forwards' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>ZARAR EDEN SKU</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: lossMakingSkus.length > 0 ? '#ef4444' : '#22c55e' }}>{lossMakingSkus.length}</div>
          {lossMakingSkus.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{lossMakingSkus.slice(0, 3).map(s => s.sku.substring(0, 10)).join(', ')}</div>
          )}
        </div>
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0.2s forwards' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>EN KÂRLI ÜRÜN</div>
          {bestSku ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bestSku.sku}</div>
              <div style={{ fontSize: 12, color: '#22c55e' }}>{fmtEur(bestSku.profitPerUnit)}/birim · {fmtPct(bestSku.margin)}</div>
            </>
          ) : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>-</div>}
        </div>
        <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0.3s forwards' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>ORT. BREAKEVEN</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtEur(avgBreakeven)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Maks indirim: {fmtPct(avgMaxDiscount)}</div>
        </div>
      </div>

      {/* C) Ürün Karlılık Tablosu */}
      <div style={{ ...cardStyle, marginBottom: 20, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0.4s forwards' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Ürün Karlılık Tablosu</div>
        <div className="pl-table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ ...thStyle, textAlign: 'left', minWidth: 160 }}>Ürün</th>
                {([
                  ['units', 'Adet'], ['avgPrice', 'Ort.Fiyat'], ['cogs', 'COGS'], ['commission', 'Komisyon'],
                  ['fba', 'FBA'], ['storage', 'Depolama'], ['totalCost', 'Top.Maliyet'], ['breakeven', 'Breakeven'],
                  ['profitPerUnit', 'Kâr/birim'], ['margin', 'Marj%'], ['maxDiscount', 'Maks İnd.%'],
                ] as const).map(([key, label]) => (
                  <th key={key} onClick={() => handleSort(key as SortKey)} style={{ ...thStyle, textAlign: 'right', color: sortKey === key ? '#6366f1' : 'var(--text-secondary)' }}>
                    {label}{sortIcon(key as SortKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedData.map(group => {
                const isExpanded = expandedGroups.has(group.skuGroup)
                const hasMultiple = group.rows.length > 1
                return (
                  <React.Fragment key={group.skuGroup}>
                    {/* Group row */}
                    <tr
                      style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer', transition: 'background 0.15s' }}
                      onClick={() => {
                        if (hasMultiple) {
                          setExpandedGroups(prev => {
                            const next = new Set(prev)
                            next.has(group.skuGroup) ? next.delete(group.skuGroup) : next.add(group.skuGroup)
                            return next
                          })
                        }
                        setSelectedSku(group.rows[0].sku)
                        setDiscountPct(0)
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ ...tdStyle, fontWeight: 600, fontSize: 13 }}>
                        {hasMultiple && <span style={{ marginRight: 6, fontSize: 10 }}>{isExpanded ? '▼' : '▶'}</span>}
                        {group.skuGroup}
                        {hasMultiple && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>({group.rows.length} beden)</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{group.totalUnits.toLocaleString('de-DE')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtEur(group.avgPrice)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtEur(group.cogs)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtEur(group.commission)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtEur(group.fba)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtEur(group.storage)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtEur(group.totalCost)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#f59e0b' }}>{fmtEur(group.breakeven)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: group.profitPerUnit >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{fmtEur(group.profitPerUnit)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{marginBadge(group.margin)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtPct(group.maxDiscount)}</td>
                    </tr>
                    {/* Expanded sub-rows */}
                    {isExpanded && group.rows.map(row => (
                      <tr
                        key={row.sku}
                        style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-sub-row)', cursor: 'pointer' }}
                        onClick={() => { setSelectedSku(row.sku); setDiscountPct(0) }}
                      >
                        <td style={{ ...tdStyle, paddingLeft: 28, fontSize: 11, color: selectedSku === row.sku ? '#6366f1' : 'var(--text-secondary)' }}>
                          {selectedSku === row.sku && '● '}{row.sku}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11 }}>{row.units.toLocaleString('de-DE')}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11 }}>{fmtEur(row.avgPrice)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11 }}>{fmtEur(row.cogs)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11 }}>{fmtEur(row.commission)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11 }}>{fmtEur(row.fba)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11 }}>{fmtEur(row.storage)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11 }}>{fmtEur(row.totalCost)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11, color: '#f59e0b' }}>{fmtEur(row.breakeven)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11, color: row.profitPerUnit >= 0 ? '#22c55e' : '#ef4444' }}>{fmtEur(row.profitPerUnit)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{marginBadge(row.margin)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)' }}>{fmtPct(row.maxDiscount)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
              {groupedData.length === 0 && (
                <tr><td colSpan={12} style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>Bu ay için veri bulunamadı</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* D+E) Waterfall + Maliyet Düzenleme */}
      {selectedSkuData && (
        <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          {/* D) Waterfall */}
          <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0.5s forwards' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Maliyet Kırılımı</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {selectedSkuData.sku} · Fiyattan kâra giden yol
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={waterfallData} layout="vertical" margin={{ left: 80, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmtEur(v, 0)} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} width={75} />
                <Tooltip {...tooltipStyle} formatter={(value: any) => [fmtEur(Math.abs(Number(value))), '']} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {waterfallData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 8, fontSize: 12 }}>
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>Breakeven: {fmtEur(selectedSkuData.breakeven)}</span>
              <span style={{ color: 'var(--text-muted)', marginLeft: 12 }}>Bu fiyatın altında zarar</span>
            </div>
          </div>

          {/* E) Maliyet Düzenleme */}
          <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0.55s forwards' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Maliyet Düzenleme</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {selectedSkuData.skuGroup} · COGS güncelle
            </div>

            {editingGroup === selectedSkuData.skuGroup ? (
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
                  <button onClick={() => saveCost(selectedSkuData.skuGroup)} style={{ ...btnStyle, background: '#6366f1', color: 'white', flex: 1 }}>Kaydet</button>
                  <button onClick={() => setEditingGroup(null)} style={{ ...btnStyle, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', flex: 1 }}>İptal</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>COGS/birim</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtEur(selectedSkuData.cogs)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Komisyon/birim</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtEur(selectedSkuData.commission)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>FBA/birim</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtEur(selectedSkuData.fba)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Toplam Maliyet</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{fmtEur(selectedSkuData.totalCost)}</span>
                  </div>
                </div>
                <button onClick={() => { setEditingGroup(selectedSkuData.skuGroup); setEditPackCost(selectedSkuData.cogs.toFixed(2)); setEditOtherCost('0') }} style={{ ...btnStyle, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', width: '100%' }}>
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

      {/* F) İndirim Simülatörü */}
      {selectedSkuData && (
        <div style={{ ...cardStyle, marginBottom: 20, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0.6s forwards' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>İndirim Simülatörü</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>{selectedSkuData.sku}</div>

          {/* Slider */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>%0</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: discountPct > selectedSkuData.maxDiscount ? '#ef4444' : '#6366f1' }}>%{discountPct} indirim</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>%50</span>
            </div>
            <input
              type="range" min="0" max="50" step="1" value={discountPct}
              onChange={e => setDiscountPct(Number(e.target.value))}
              style={{ width: '100%', accentColor: discountPct > selectedSkuData.maxDiscount ? '#ef4444' : '#6366f1' }}
            />
            {selectedDiscountRow && (
              <div style={{ display: 'flex', gap: 20, marginTop: 10, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
                <div><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Yeni Fiyat</span><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtEur(selectedDiscountRow.newPrice)}</div></div>
                <div><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Kâr/birim</span><div style={{ fontSize: 14, fontWeight: 700, color: selectedDiscountRow.profit >= 0 ? '#22c55e' : '#ef4444' }}>{fmtEur(selectedDiscountRow.profit)}</div></div>
                <div><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Marj</span><div style={{ fontSize: 14, fontWeight: 700, color: selectedDiscountRow.margin >= 0 ? '#22c55e' : '#ef4444' }}>{fmtPct(selectedDiscountRow.margin)}</div></div>
              </div>
            )}
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ ...thStyle, textAlign: 'left' }}>İndirim</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Yeni Fiyat</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Kâr/birim</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Marj%</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {discountTable.map(row => (
                  <tr key={row.pct} style={{
                    borderBottom: '1px solid var(--border-color)',
                    background: row.pct === discountPct ? 'rgba(99,102,241,0.08)' : 'transparent',
                    fontWeight: row.pct === discountPct ? 600 : 400,
                  }}>
                    <td style={{ ...tdStyle }}>%{row.pct}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtEur(row.newPrice)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: row.profit >= 0 ? '#22c55e' : '#ef4444' }}>{fmtEur(row.profit)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{marginBadge(row.margin)}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
            Bu ürün maksimum <strong style={{ color: '#f59e0b' }}>%{selectedSkuData.maxDiscount.toFixed(0)}</strong> indirim kaldırır.
            {selectedSkuData.avgPrice >= 20 && selectedSkuData.avgPrice * (1 - selectedSkuData.maxDiscount / 100) < 20 && (
              <span style={{ color: '#06b6d4', marginLeft: 6 }}>Fiyat 20€ altına düşerse komisyon %15→%10 avantajı devreye girer.</span>
            )}
          </div>
        </div>
      )}

      {/* G) Karlılık Haritası (Scatter) */}
      <div style={{ ...cardStyle, opacity: 0, animation: 'fadeInUp 0.5s ease-out 0.7s forwards' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Karlılık Haritası</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>X: Satış adedi · Y: Marj% · Boyut: Toplam kâr</div>

        {/* Kadran etiketleri */}
        <div style={{ position: 'relative' }}>
          <ResponsiveContainer width="100%" height={350}>
            <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis type="number" dataKey="x" name="Adet" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="number" dataKey="y" name="Marj%" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <ZAxis type="number" dataKey="z" range={[50, 400]} />
              <Tooltip
                {...tooltipStyle}
                content={({ active, payload }: any) => {
                  if (!active || !payload?.[0]) return null
                  const d = payload[0].payload
                  return (
                    <div style={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.name}</div>
                      <div>Adet: {d.x.toLocaleString('de-DE')}</div>
                      <div>Marj: {fmtPct(d.y)}</div>
                      <div>Toplam Kâr: {fmtEur(d.profit, 0)}</div>
                    </div>
                  )
                }}
              />
              <Scatter data={scatterData}>
                {scatterData.map((entry, i) => {
                  let color = '#6366f1'
                  const medianUnits = scatterData.length > 0 ? scatterData.sort((a, b) => a.x - b.x)[Math.floor(scatterData.length / 2)].x : 0
                  if (entry.x >= medianUnits && entry.y >= 20) color = '#22c55e'  // Yıldız
                  else if (entry.x < medianUnits && entry.y >= 20) color = '#3b82f6' // Niş
                  else if (entry.x >= medianUnits && entry.y < 20) color = '#f59e0b' // Hacim
                  else color = '#ef4444' // Sorunlu
                  return <Cell key={i} fill={color} fillOpacity={0.7} />
                })}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>

          {/* Legend */}
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
      </div>
    </DashboardShell>
  )
}
