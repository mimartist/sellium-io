'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import KpiCard from '@/components/ui/KpiCard'
import { KpiIcons } from '@/components/ui/KpiIcons'
import { COLORS, CARD_STYLE, TH_STYLE } from '@/lib/design-tokens'
import {
  supabase, StockRow, extractSize,
  fmtNum, fmtCur, fmtDec, STOCK_SELECT_FIELDS,
} from '../shared'
import { useProductImages } from '@/hooks/useProductImages'
import { ImgPlaceholder } from '@/components/ui/Badges'

/* ── Styles ── */
const tdStyle: React.CSSProperties = { padding: '11px 12px', fontSize: 13, color: '#475569', borderBottom: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap' }

export default function StockLiquidationPage() {
  const { getBySkuWithFallback: getBySku, asinFromSkuWithFallback: asinFromSku } = useProductImages()
  const [rawData, setRawData] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
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

  const meltRows = useMemo(() => {
    return rawData
      .filter(r => r.stock_status === 'overstock' || r.stock_status === 'dead')
      .map(r => {
        const dailySales = r.avg_daily_sales || 0
        const daysOfStock = r.days_of_stock || (dailySales > 0 ? (r.current_stock || 0) / dailySales : 9999)
        let action = ''
        let actionColor = ''
        let actionBg = ''
        let discountRate = 0

        if (dailySales === 0 || r.stock_status === 'dead') {
          action = 'Remove from FBA'
          actionColor = '#ef4444'
          actionBg = 'rgba(239,68,68,0.1)'
          discountRate = 0
        } else if (daysOfStock > 365) {
          action = '30-50% Discount Campaign'
          actionColor = '#f97316'
          actionBg = 'rgba(249,115,22,0.1)'
          discountRate = 0.4
        } else if (daysOfStock > 180) {
          action = '20-30% Discount'
          actionColor = '#f59e0b'
          actionBg = 'rgba(245,158,11,0.1)'
          discountRate = 0.25
        } else {
          action = 'Increase Ad Budget'
          actionColor = COLORS.accent
          actionBg = 'rgba(91,95,199,0.1)'
          discountRate = 0
        }

        const discountedPrice = (r.price || 0) * (1 - discountRate)
        const estimatedImpact = discountRate > 0 ? discountedPrice * (r.current_stock || 0) : 0

        return { ...r, daysOfStock, action, actionColor, actionBg, discountRate, estimatedImpact, storageFee: r.storage_fee_monthly || 0 }
      })
      .sort((a, b) => {
        if (a.stock_status === 'dead' && b.stock_status !== 'dead') return -1
        if (a.stock_status !== 'dead' && b.stock_status === 'dead') return 1
        return b.storageFee - a.storageFee
      })
  }, [rawData])

  const meltOverstockCount = useMemo(() => meltRows.filter(r => r.stock_status === 'overstock').reduce((s, r) => s + (r.current_stock || 0), 0), [meltRows])
  const meltDeadCount = useMemo(() => meltRows.filter(r => r.stock_status === 'dead').reduce((s, r) => s + (r.current_stock || 0), 0), [meltRows])
  const meltMonthlyStorage = useMemo(() => meltRows.reduce((s, r) => s + r.storageFee, 0), [meltRows])
  const meltAvgDays = useMemo(() => {
    const withSales = meltRows.filter(r => (r.avg_daily_sales || 0) > 0)
    if (withSales.length === 0) return 0
    return withSales.reduce((s, r) => s + r.daysOfStock, 0) / withSales.length
  }, [meltRows])

  const meltSummary = useMemo(() => {
    const deadRows = meltRows.filter(r => r.stock_status === 'dead')
    const deadStorage = deadRows.reduce((s, r) => s + r.storageFee, 0)
    const overstockRows = meltRows.filter(r => r.stock_status === 'overstock' && r.discountRate > 0)
    const overstockRevenue = overstockRows.reduce((s, r) => s + r.estimatedImpact, 0)
    return { deadCount: deadRows.length, deadStorage, overstockCount: overstockRows.length, overstockRevenue }
  }, [meltRows])

  const toggleItem = useCallback((msku: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(msku)) next.delete(msku); else next.add(msku)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectAll) setSelectedItems(new Set())
    else setSelectedItems(new Set(meltRows.map(r => r.msku)))
    setSelectAll(!selectAll)
  }, [selectAll, meltRows])

  const exportCSV = useCallback(() => {
    const BOM = '\uFEFF'
    const headers = ['SKU', 'Size', 'Status', 'Stock', 'Daily Sales', 'Days Left', 'Monthly Storage', 'Recommended Action', 'Estimated Impact']
    const exportRows = (selectedItems.size > 0 ? meltRows.filter(r => selectedItems.has(r.msku)) : meltRows)
    const rows = exportRows.map(r => [
      r.msku, extractSize(r.msku), r.stock_status === 'dead' ? 'Dead Stock' : 'Overstock',
      r.current_stock || 0, fmtDec(r.avg_daily_sales || 0), r.daysOfStock > 9000 ? '-' : fmtDec(r.daysOfStock, 0),
      fmtDec(r.storageFee, 0), r.action, r.estimatedImpact > 0 ? fmtDec(r.estimatedImpact, 0) : '-',
    ])
    const csv = BOM + [headers, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `stock_liquidation_${new Date().toISOString().substring(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }, [selectedItems, meltRows])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${COLORS.border}`, borderTopColor: COLORS.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ color: COLORS.sub, fontSize: 13 }}>Loading liquidation data...</div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: COLORS.text }}>Stock Liquidation</h1>
          <p style={{ fontSize: 13, color: COLORS.sub, marginTop: 2, margin: 0 }}>
            Overstock & dead stock analysis · {meltRows.length} products need action
          </p>
        </div>
        <button onClick={exportCSV} style={{
          padding: '8px 16px', fontSize: 12, fontWeight: 600, borderRadius: 8,
          background: COLORS.accentLight, border: '1px solid rgba(91,95,199,0.3)',
          color: COLORS.accent, cursor: 'pointer',
        }}>
          Export CSV
        </button>
      </div>

      {/* KPI CARDS */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <KpiCard label="TOTAL OVERSTOCK" value={fmtNum(meltOverstockCount) + ' units'} change={`${meltRows.filter(r => r.stock_status === 'overstock').length} products`} up={false}
          icon={KpiIcons.stock} bars={[70, 72, 74, 76, 78, 80, 82]} color={COLORS.accent} light="#C7D2FE" iconBg={COLORS.accentLight} />
        <KpiCard label="DEAD STOCK" value={fmtNum(meltDeadCount) + ' units'} change={`${meltRows.filter(r => r.stock_status === 'dead').length} products`} up={false}
          icon={KpiIcons.warning} bars={[90, 85, 80, 75, 70, 68, 65]} color={COLORS.red} light={COLORS.redLighter} iconBg={COLORS.redLight} />
        <KpiCard label="MONTHLY STORAGE" value={fmtCur(meltMonthlyStorage)} change="Storage cost" up={false}
          icon={KpiIcons.spend} bars={[60, 62, 65, 63, 60, 58, 55]} color={COLORS.orange} light={COLORS.orangeLighter} iconBg={COLORS.orangeLight} />
        <KpiCard label="AVG. LIQUIDATION TIME" value={meltAvgDays > 0 ? `${fmtNum(Math.round(meltAvgDays))} days` : '—'} change="Based on current sales" up={true}
          icon={KpiIcons.clock} bars={[40, 45, 50, 48, 45, 42, 40]} color="#a78bfa" light="#E8DEFF" iconBg="#F3EEFF" />
      </div>

      {/* SUMMARY & RECOMMENDATIONS */}
      {(meltSummary.deadCount > 0 || meltSummary.overstockCount > 0) && (
        <div className="grid-2" style={{ marginBottom: 20 }}>
          {meltSummary.deadCount > 0 && (
            <div style={{ ...CARD_STYLE, padding: '18px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.red }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Dead Stock Action</span>
              </div>
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
                Removing <span style={{ fontWeight: 700, color: COLORS.text }}>{meltSummary.deadCount} dead stock products</span> from FBA would save <span style={{ fontWeight: 700, color: COLORS.red }}>{fmtCur(meltSummary.deadStorage)}/month</span> in storage fees. Create a removal order for these items.
              </div>
            </div>
          )}
          {meltSummary.overstockCount > 0 && (
            <div style={{ ...CARD_STYLE, padding: '18px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.orange }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Overstock Action</span>
              </div>
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
                Applying discounts to <span style={{ fontWeight: 700, color: COLORS.text }}>{meltSummary.overstockCount} overstock products</span> could generate an estimated <span style={{ fontWeight: 700, color: COLORS.green }}>{fmtCur(meltSummary.overstockRevenue)}</span> in revenue and free up warehouse space.
              </div>
            </div>
          )}
        </div>
      )}

      {/* MELT TABLE */}
      <div style={{ ...CARD_STYLE, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1000 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>
                <th style={{ ...TH_STYLE, padding: '12px 12px', width: 40 }}>
                  <input type="checkbox" checked={selectAll} onChange={handleSelectAll} style={{ cursor: 'pointer', width: 14, height: 14 }} />
                </th>
                {['SKU', 'Size', 'Stock', 'D. Sales', 'Days Left', 'Monthly Storage', 'Recommended Action', 'Est. Impact'].map((h, i) => (
                  <th key={h} style={{ ...TH_STYLE, padding: '12px 12px', textAlign: i >= 3 ? (i >= 6 ? 'left' : 'right') : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {meltRows.slice(0, 100).map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}`, background: selectedItems.has(row.msku) ? '#F8FAFC' : 'transparent', transition: 'background 0.15s' }}
                  onMouseEnter={e => { if (!selectedItems.has(row.msku)) (e.currentTarget as HTMLElement).style.background = '#FAFBFC' }}
                  onMouseLeave={e => { if (!selectedItems.has(row.msku)) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <td style={tdStyle}>
                    <input type="checkbox" checked={selectedItems.has(row.msku)} onChange={() => toggleItem(row.msku)} style={{ cursor: 'pointer', width: 14, height: 14 }} />
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
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>{fmtNum(row.current_stock || 0)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtDec(row.avg_daily_sales || 0)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: row.daysOfStock > 365 ? '#ef4444' : row.daysOfStock > 180 ? '#f59e0b' : COLORS.text }}>
                    {row.daysOfStock > 9000 ? '—' : fmtNum(Math.round(row.daysOfStock))}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtCur(row.storageFee)}</td>
                  <td style={tdStyle}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, color: row.actionColor, background: row.actionBg, whiteSpace: 'nowrap' }}>
                      {row.action}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: row.estimatedImpact > 0 ? '#22c55e' : COLORS.sub, fontWeight: row.estimatedImpact > 0 ? 600 : 400 }}>
                    {row.estimatedImpact > 0 ? fmtCur(row.estimatedImpact) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {meltRows.length > 100 && (
          <div style={{ padding: '10px 16px', fontSize: 11, color: COLORS.sub, borderTop: `1px solid ${COLORS.border}` }}>
            Showing first 100 of {meltRows.length} products
          </div>
        )}
      </div>
    </>
  )
}
