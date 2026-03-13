'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart,
} from 'recharts'
import KpiCard from '@/components/ui/KpiCard'
import { KpiIcons } from '@/components/ui/KpiIcons'
import { COLORS, CARD_STYLE, TH_STYLE } from '@/lib/design-tokens'
import { useTranslation } from '@/lib/i18n'
import { useProductImages } from '@/hooks/useProductImages'
import { ImgPlaceholder } from '@/components/ui/Badges'
import {
  supabase, StockRow, extractSize, extractProductGroup, formatDate,
  fmtNum, fmtCur, fmtDec, STOCK_SELECT_FIELDS,
} from '../shared'

interface OrderRow extends StockRow {
  selected: boolean
  growthSales: number
  targetStock: number
  orderQty: number
  estimatedCost: number
  estimatedRevenue: number
  deadline: string
  priority: 'acil' | 'yuksek' | 'normal' | 'dusuk'
}

const PRIORITY_COLORS: Record<string, { color: string; bg: string }> = {
  acil: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  yuksek: { color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  normal: { color: COLORS.accent, bg: 'rgba(91,95,199,0.1)' },
  dusuk: { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
}

/* ── Styles ── */
const tdStyle: React.CSSProperties = { padding: '11px 12px', fontSize: 13, color: '#475569', borderBottom: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap' }
const sliderTrackStyle: React.CSSProperties = { width: '100%', height: 6, appearance: 'none' as any, borderRadius: 4, outline: 'none', cursor: 'pointer' }

export default function OrderPlanningPage() {
  const { t } = useTranslation()
  const priorityLabels: Record<string, string> = { acil: t("inventoryOrders.urgent"), yuksek: t("inventoryOrders.high"), normal: t("inventoryOrders.normal"), dusuk: t("inventoryOrders.low") }
  const { getBySkuWithFallback: getBySku, asinFromSkuWithFallback: asinFromSku } = useProductImages()
  const [rawData, setRawData] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)

  const [leadTime, setLeadTime] = useState(45)
  const [safetyBuffer, setSafetyBuffer] = useState(30)
  const [growthRate, setGrowthRate] = useState(15)

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data } = await supabase.from('v_stock_analysis').select(STOCK_SELECT_FIELDS)
      setRawData(data || [])
      setLoading(false)
    }
    fetchData()
  }, [])

  const orderRows: OrderRow[] = useMemo(() => {
    const growthMultiplier = 1 + growthRate / 100
    return rawData
      .filter(r => (r.avg_daily_sales || 0) > 0)
      .map(r => {
        const growthSales = (r.avg_daily_sales || 0) * growthMultiplier
        const targetStock = growthSales * (leadTime + safetyBuffer)
        const currentAvailable = (r.current_stock || 0) + (r.inbound_total || 0)
        const orderQty = Math.max(0, Math.ceil(targetStock - currentAvailable))
        const estimatedCost = orderQty * (r.price || 0) * 0.23
        const estimatedCostVat = estimatedCost * 0.19
        const estimatedCostWithVat = estimatedCost + estimatedCostVat
        const estimatedRevenue = orderQty * (r.price || 0)
        const daysLeft = r.days_of_stock || 0
        const deadlineDate = new Date()
        deadlineDate.setDate(deadlineDate.getDate() + Math.max(0, Math.floor(daysLeft) - leadTime))
        const deadline = deadlineDate.toISOString().substring(0, 10)
        let priority: 'acil' | 'yuksek' | 'normal' | 'dusuk' = 'normal'
        if (r.stock_status === 'out' || daysLeft < 7) priority = 'acil'
        else if (r.stock_status === 'critical' || daysLeft < 14) priority = 'yuksek'
        else if (daysLeft > 90) priority = 'dusuk'
        return { ...r, selected: selectedItems.has(r.msku), growthSales, targetStock, orderQty, estimatedCost, estimatedRevenue, deadline, priority }
      })
      .filter(r => r.orderQty > 0)
      .sort((a, b) => {
        const priorityOrder = { acil: 0, yuksek: 1, normal: 2, dusuk: 3 }
        return priorityOrder[a.priority] - priorityOrder[b.priority]
      })
  }, [rawData, leadTime, safetyBuffer, growthRate, selectedItems])

  const selectedRows = useMemo(() => orderRows.filter(r => selectedItems.has(r.msku)), [orderRows, selectedItems])
  const summaryRows = selectedRows.length > 0 ? selectedRows : orderRows
  const totalOrderQty = summaryRows.reduce((s, r) => s + r.orderQty, 0)
  const totalCost = summaryRows.reduce((s, r) => s + r.estimatedCost, 0)
  const totalCostVat = totalCost * 0.19
  const totalCostWithVat = totalCost + totalCostVat
  const totalRevenue = summaryRows.reduce((s, r) => s + r.estimatedRevenue, 0)
  const roi = totalCostWithVat > 0 ? ((totalRevenue - totalCostWithVat) / totalCostWithVat) * 100 : 0

  const groupDistribution = useMemo(() => {
    const groups: Record<string, { name: string; qty: number; cost: number }> = {}
    summaryRows.forEach(r => {
      const group = extractProductGroup(r)
      if (!groups[group]) groups[group] = { name: group, qty: 0, cost: 0 }
      groups[group].qty += r.orderQty
      groups[group].cost += r.estimatedCost
    })
    return Object.values(groups).sort((a, b) => b.qty - a.qty).slice(0, 10)
  }, [summaryRows])

  const toggleItem = useCallback((msku: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(msku)) next.delete(msku); else next.add(msku)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectAll) setSelectedItems(new Set())
    else setSelectedItems(new Set(orderRows.map(r => r.msku)))
    setSelectAll(!selectAll)
  }, [selectAll, orderRows])

  const exportOrderCSV = useCallback(() => {
    const BOM = '\uFEFF'
    const headers = ['Priority', 'SKU', 'Size', 'Stock', 'Inbound', 'D.Sales', 'Target Stock', 'Order Qty', 'Cost', 'Revenue', 'Deadline']
    const rows = (selectedRows.length > 0 ? selectedRows : orderRows).map(r => [
      priorityLabels[r.priority] || r.priority, r.msku, extractSize(r.msku),
      r.current_stock || 0, r.inbound_total || 0, fmtDec(r.avg_daily_sales || 0),
      Math.ceil(r.targetStock), r.orderQty, fmtDec(r.estimatedCost, 0), fmtDec(r.estimatedRevenue, 0), r.deadline,
    ])
    const csv = BOM + [headers, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `order_plan_${new Date().toISOString().substring(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }, [selectedRows, orderRows])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${COLORS.border}`, borderTopColor: COLORS.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ color: COLORS.sub, fontSize: 13 }}>{t("inventoryOrders.calculating")}</div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: COLORS.text }}>{t("inventoryOrders.title")}</h1>
          <p style={{ fontSize: 13, color: COLORS.sub, marginTop: 2, margin: 0 }}>
            {t("inventoryOrders.subtitle")} · {rawData.length} SKU · {orderRows.length} {t("inventoryOrders.ordersNeeded")}
          </p>
        </div>
        <button onClick={exportOrderCSV} style={{
          padding: '8px 16px', fontSize: 12, fontWeight: 600, borderRadius: 8,
          background: COLORS.accentLight, border: '1px solid rgba(91,95,199,0.3)',
          color: COLORS.accent, cursor: 'pointer',
        }}>
          {t("common.exportCsv")}
        </button>
      </div>

      {/* KPI CARDS */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <KpiCard label={t("inventoryOrders.selectedProducts")} value={selectedRows.length > 0 ? `${selectedRows.length}` : `${orderRows.length} (${t("common.all")})`} change={`${rawData.length} SKU total`} up={true}
          icon={KpiIcons.stock} bars={[50, 55, 60, 58, 62, 65, 68]} color={COLORS.accent} light="#C7D2FE" iconBg={COLORS.accentLight} />
        <KpiCard label={t("inventoryOrders.totalOrderQty")} value={fmtNum(totalOrderQty) + ' units'} change={`${orderRows.length} products`} up={true}
          icon={KpiIcons.orders} bars={[40, 45, 50, 55, 60, 65, 70]} color="#a78bfa" light="#E8DEFF" iconBg="#F3EEFF" />
        <KpiCard label={t("inventoryOrders.estimatedCost") + ` (${t("common.vatIncluded")})`} value={fmtCur(totalCostWithVat)} change={`${t("common.cost")} ${fmtCur(totalCost)} + ${t("common.vat")} ${fmtCur(totalCostVat)}`} up={false}
          icon={KpiIcons.spend} bars={[60, 62, 65, 63, 60, 58, 55]} color={COLORS.orange} light={COLORS.orangeLighter} iconBg={COLORS.orangeLight} />
        <KpiCard label={t("inventoryOrders.expectedRevenue")} value={fmtCur(totalRevenue)} change={`${t("inventoryOrders.roi")}: %${fmtDec(roi, 0)}`} up={true}
          icon={KpiIcons.revenue} bars={[30, 35, 42, 50, 58, 65, 72]} color={COLORS.green} light={COLORS.greenLighter} iconBg={COLORS.greenLight} />
      </div>

      {/* PARAMETERS + INVESTMENT SUMMARY */}
      <div style={{ ...CARD_STYLE, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, marginBottom: 2 }}>{t("inventoryOrders.parameters")}</div>
        <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 16 }}>{t("inventoryOrders.parametersDesc")}</div>
        <div className="inv-slider-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#475569' }}>{t("inventoryOrders.leadTime")}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.accent }}>{leadTime} days</span>
            </div>
            <input type="range" min={15} max={120} value={leadTime} onChange={e => setLeadTime(Number(e.target.value))}
              style={{ ...sliderTrackStyle, background: `linear-gradient(to right, ${COLORS.accent} ${((leadTime - 15) / 105) * 100}%, #E2E8F0 ${((leadTime - 15) / 105) * 100}%)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: COLORS.sub, marginTop: 4 }}>
              <span>15 days</span><span>120 days</span>
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#475569' }}>{t("inventoryOrders.safetyBuffer")}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b' }}>{safetyBuffer} days</span>
            </div>
            <input type="range" min={0} max={90} value={safetyBuffer} onChange={e => setSafetyBuffer(Number(e.target.value))}
              style={{ ...sliderTrackStyle, background: `linear-gradient(to right, #f59e0b ${(safetyBuffer / 90) * 100}%, #E2E8F0 ${(safetyBuffer / 90) * 100}%)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: COLORS.sub, marginTop: 4 }}>
              <span>0 days</span><span>90 days</span>
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#475569' }}>{t("inventoryOrders.growthEstimate")}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#22c55e' }}>%{growthRate}</span>
            </div>
            <input type="range" min={0} max={50} value={growthRate} onChange={e => setGrowthRate(Number(e.target.value))}
              style={{ ...sliderTrackStyle, background: `linear-gradient(to right, #22c55e ${(growthRate / 50) * 100}%, #E2E8F0 ${(growthRate / 50) * 100}%)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: COLORS.sub, marginTop: 4 }}>
              <span>%0</span><span>%50</span>
            </div>
          </div>
        </div>
        {/* Investment / Revenue / ROI — inline inside Parameters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, borderTop: `1px solid ${COLORS.border}`, paddingTop: 16 }}>
          {[
            { label: t("inventoryOrders.investment") + ` (${t("common.vatIncluded")})`, value: fmtCur(totalCostWithVat), sub: `${t("common.cost")} ${fmtCur(totalCost)} + ${t("common.vat")} ${fmtCur(totalCostVat)}`, color: '#f59e0b' },
            { label: t("inventoryOrders.expectedRevenue"), value: fmtCur(totalRevenue), sub: '', color: '#22c55e' },
            { label: t("inventoryOrders.estimatedRoi"), value: `%${fmtDec(roi, 0)}`, sub: '', color: roi > 100 ? '#22c55e' : '#f59e0b' },
          ].map((item, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '12px 8px', background: '#F8FAFC', borderRadius: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.sub, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.value}</div>
              {item.sub && <div style={{ fontSize: 10, color: COLORS.sub, marginTop: 2 }}>{item.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* GROUP DISTRIBUTION + TIMELINE */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div style={{ ...CARD_STYLE, padding: '18px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, marginBottom: 2 }}>{t("inventoryOrders.productGroupDist")}</div>
          <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 14 }}>Top 10 groups by order quantity</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={groupDistribution} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis type="number" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#475569', fontSize: 9 }} axisLine={false} tickLine={false} width={80} tickFormatter={v => v.length > 12 ? v.substring(0, 12) + '..' : v} />
              <Tooltip contentStyle={{ background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12, color: COLORS.text }} labelStyle={{ color: '#475569' }} formatter={(value: any) => [fmtNum(Number(value)), 'Units']} />
              <Bar dataKey="qty" fill={COLORS.accent} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Timeline */}
        <div style={{ ...CARD_STYLE, padding: '18px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, marginBottom: 2 }}>{t("inventoryOrders.deliveryTimeline")}</div>
          <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 16 }}>Based on {leadTime} days lead time</div>
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            {[
              { label: t("inventoryOrders.orderPlaced"), date: new Date().toISOString().substring(0, 10), color: COLORS.accent },
              { label: t("inventoryOrders.productionComplete"), date: (() => { const d = new Date(); d.setDate(d.getDate() + Math.floor(leadTime * 0.4)); return d.toISOString().substring(0, 10) })(), color: '#f59e0b' },
              { label: t("inventoryOrders.shipmentStarted"), date: (() => { const d = new Date(); d.setDate(d.getDate() + Math.floor(leadTime * 0.6)); return d.toISOString().substring(0, 10) })(), color: '#a78bfa' },
              { label: t("inventoryOrders.fbaDelivery"), date: (() => { const d = new Date(); d.setDate(d.getDate() + leadTime); return d.toISOString().substring(0, 10) })(), color: '#22c55e' },
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < 3 ? 16 : 0, position: 'relative' }}>
                <div style={{ position: 'absolute', left: -20, width: 10, height: 10, borderRadius: '50%', background: step.color, border: '2px solid #fff' }} />
                {i < 3 && <div style={{ position: 'absolute', left: -16, top: 16, width: 2, height: 28, background: COLORS.border }} />}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.text }}>{step.label}</div>
                  <div style={{ fontSize: 11, color: '#475569' }}>{formatDate(step.date)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ORDER TABLE */}
      <div style={{ ...CARD_STYLE, padding: 0, overflow: 'hidden' }}>
        <div className="modern-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1000 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>
                <th style={{ ...TH_STYLE, padding: '12px 12px', width: 40 }}>
                  <input type="checkbox" checked={selectAll} onChange={handleSelectAll} style={{ cursor: 'pointer', width: 14, height: 14 }} />
                </th>
                {[t("inventoryOrders.priority"), 'SKU', t("inventoryOrders.size"), 'Stock', 'Inbound', 'D.Sales', 'Target', 'ORDER', 'Cost', 'Revenue', 'Deadline'].map((h, i) => (
                  <th key={h} style={{ ...TH_STYLE, padding: '12px 12px', textAlign: i >= 4 ? 'right' : 'left', fontWeight: h === 'ORDER' ? 700 : 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orderRows.slice(0, 100).map((row, i) => {
                const prCfg = { ...(PRIORITY_COLORS[row.priority] || PRIORITY_COLORS.normal), label: priorityLabels[row.priority] || row.priority }
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}`, background: selectedItems.has(row.msku) ? '#F8FAFC' : 'transparent', transition: 'background 0.15s' }}
                    onMouseEnter={e => { if (!selectedItems.has(row.msku)) (e.currentTarget as HTMLElement).style.background = '#FAFBFC' }}
                    onMouseLeave={e => { if (!selectedItems.has(row.msku)) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <td style={tdStyle}>
                      <input type="checkbox" checked={selectedItems.has(row.msku)} onChange={() => toggleItem(row.msku)} style={{ cursor: 'pointer', width: 14, height: 14 }} />
                    </td>
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, color: prCfg.color, background: prCfg.bg }}>{prCfg.label}</span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12, fontWeight: 500, color: COLORS.text }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {getBySku(row.msku)?.image_url ? (
                          <a href={`/products/${asinFromSku(row.msku)}`} onClick={e => e.stopPropagation()} style={{ lineHeight: 0 }}>
                            <img src={getBySku(row.msku)!.image_url!} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', border: `1px solid ${COLORS.border}` }} />
                          </a>
                        ) : <ImgPlaceholder size={28} />}
                        {row.msku}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: COLORS.sub }}>{extractSize(row.msku)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(row.current_stock || 0)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: (row.inbound_total || 0) > 0 ? COLORS.accent : COLORS.sub }}>{fmtNum(row.inbound_total || 0)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtDec(row.avg_daily_sales || 0)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: COLORS.sub }}>{fmtNum(Math.ceil(row.targetStock))}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontSize: 13, color: COLORS.accent }}>{fmtNum(row.orderQty)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtCur(row.estimatedCost)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#22c55e' }}>{fmtCur(row.estimatedRevenue)}</td>
                    <td style={{ ...tdStyle, fontSize: 11, color: row.priority === 'acil' ? '#ef4444' : '#475569' }}>{formatDate(row.deadline)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {orderRows.length > 100 && (
          <div style={{ padding: '10px 16px', fontSize: 11, color: COLORS.sub, borderTop: `1px solid ${COLORS.border}` }}>
            {t("common.showing", {limit: 100, total: orderRows.length})}
          </div>
        )}
      </div>
    </>
  )
}
