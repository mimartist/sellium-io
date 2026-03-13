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

// Country code map for flag images (Windows doesn't render flag emojis)
const MARKETPLACE_COUNTRY_CODE: Record<string, string> = {
  'Amazon.de': 'de', 'Amazon.fr': 'fr', 'Amazon.es': 'es', 'Amazon.it': 'it',
  'Amazon.co.uk': 'gb', 'Amazon.nl': 'nl', 'Amazon.pl': 'pl', 'Amazon.ie': 'ie',
  'Amazon.com.be': 'be', 'Amazon.se': 'se', 'Amazon.ae': 'ae',
}
const FlagImg = ({ marketplace, size = 16 }: { marketplace: string; size?: number }) => {
  const code = MARKETPLACE_COUNTRY_CODE[marketplace]
  if (!code) return null
  return <img src={`https://flagcdn.com/w40/${code}.png`} alt={code} style={{ width: size, height: Math.round(size * 0.75), borderRadius: 2, objectFit: 'cover', display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />
}

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

// 2025 ad spend from Amazon Ads invoices (EUR, excl VAT / KDV hariç)
const AD_INVOICE_DATA: Record<string, number> = {
  '2025-01': 398.66,
  '2025-02': 433.36,
  '2025-03': 1670.60,
  '2025-04': 1557.30,
  '2025-05': 1457.91,
  '2025-06': 1549.85,
  '2025-07': 2066.31,
  '2025-08': 1711.16,
  '2025-09': 2524.36,
  '2025-10': 3332.02,
  '2025-11': 2368.42,
  '2025-12': 2333.44,
}

// FBA Returns data from Amazon returns report (real data)
const FBA_RETURNS: { date: string; sku: string; qty: number; reason: string }[] = [
  { date: '2026-03-13', sku: 'MMS2370XXL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-03-13', sku: 'MMS2451XL', qty: 1, reason: 'APPAREL_STYLE' },
  { date: '2026-03-11', sku: 'MMS2470L', qty: 1, reason: 'MISORDERED' },
  { date: '2026-03-10', sku: 'MMS2450XL', qty: 1, reason: 'APPAREL_STYLE' },
  { date: '2026-03-09', sku: 'MMS2451L', qty: 1, reason: 'APPAREL_TOO_LARGE' },
  { date: '2026-03-06', sku: 'MMS2440XL', qty: 1, reason: 'NO_REASON_GIVEN' },
  { date: '2026-03-06', sku: 'MMS2371M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-03-05', sku: 'MMS2460L', qty: 1, reason: 'NO_REASON_GIVEN' },
  { date: '2026-03-04', sku: 'MMS2451M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-03-04', sku: 'MMS2470M', qty: 1, reason: 'NO_REASON_GIVEN' },
  { date: '2026-03-04', sku: 'MMS2450XXL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-03-04', sku: 'MMS2451XL', qty: 1, reason: 'APPAREL_TOO_LARGE' },
  { date: '2026-03-03', sku: 'MMS2451XL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-03-02', sku: 'MMS2471XL', qty: 1, reason: 'ORDERED_WRONG_ITEM' },
  { date: '2026-02-27', sku: 'MMS2460L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-02-27', sku: 'MMS2470L', qty: 1, reason: 'MISORDERED' },
  { date: '2026-02-27', sku: 'MMS2470M', qty: 1, reason: 'MISORDERED' },
  { date: '2026-02-26', sku: 'MMS2450L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-02-26', sku: 'MMS2450L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-02-25', sku: 'MMS2470XXL', qty: 1, reason: 'APPAREL_STYLE' },
  { date: '2026-02-25', sku: 'MMS2371S', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-02-23', sku: 'MMS2460XL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-02-23', sku: 'MMS2001S', qty: 1, reason: 'NO_REASON_GIVEN' },
  { date: '2026-02-20', sku: 'MMS2370S', qty: 1, reason: 'APPAREL_TOO_LARGE' },
  { date: '2026-02-20', sku: 'MMS2451M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-02-19', sku: 'MMS2371S', qty: 1, reason: 'MISORDERED' },
  { date: '2026-02-19', sku: 'MMS2371S', qty: 1, reason: 'MISORDERED' },
  { date: '2026-02-18', sku: 'MMS2450XXL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-02-18', sku: 'MMS2451XXL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-02-17', sku: 'MMS2371L', qty: 1, reason: 'APPAREL_STYLE' },
  { date: '2026-02-13', sku: 'MMS2451XL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-02-12', sku: 'MMS2450S', qty: 1, reason: 'UNDELIVERABLE_UNKNOWN' },
  { date: '2026-02-12', sku: 'MMS2451L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-02-12', sku: 'MMS2450L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-02-12', sku: 'MMS2450L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-02-12', sku: 'MMS2461XL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-02-11', sku: 'MMS2391S', qty: 1, reason: 'UNDELIVERABLE_UNKNOWN' },
  { date: '2026-02-10', sku: 'MMS2003M', qty: 1, reason: 'UNDELIVERABLE_UNKNOWN' },
  { date: '2026-02-10', sku: 'MMS2370L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-02-04', sku: 'MMS2500XL', qty: 1, reason: 'UNDELIVERABLE_UNKNOWN' },
  { date: '2026-02-03', sku: 'MMS2451L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-02-03', sku: 'MMS2450XL', qty: 1, reason: 'APPAREL_STYLE' },
  { date: '2026-02-03', sku: 'MMS2370L', qty: 1, reason: 'APPAREL_STYLE' },
  { date: '2026-01-30', sku: 'MMS2451M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-30', sku: 'MMS2451L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-29', sku: 'MMS2460S', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-29', sku: 'MMS2461S', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-29', sku: 'MMS2451XXL', qty: 1, reason: 'ORDERED_WRONG_ITEM' },
  { date: '2026-01-28', sku: 'MMS2371XXL', qty: 1, reason: 'ORDERED_WRONG_ITEM' },
  { date: '2026-01-28', sku: 'MMS2450XL', qty: 1, reason: 'MISORDERED' },
  { date: '2026-01-28', sku: 'MMS2370S', qty: 1, reason: 'APPAREL_STYLE' },
  { date: '2026-01-26', sku: 'MMS2371XXL', qty: 1, reason: 'APPAREL_STYLE' },
  { date: '2026-01-26', sku: 'MMS2451M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-26', sku: 'MMS2461L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-25', sku: 'MMS2370L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-23', sku: 'MMS2450S', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-23', sku: 'MMS2460S', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-23', sku: 'MMS2460XL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-23', sku: 'MMS2460M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-23', sku: 'MMS2451XL', qty: 1, reason: 'APPAREL_STYLE' },
  { date: '2026-01-23', sku: 'MMS2371XXL', qty: 1, reason: 'ORDERED_WRONG_ITEM' },
  { date: '2026-01-22', sku: 'MMS2460M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-22', sku: 'MMS2461M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-21', sku: 'MMS2460XL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-21', sku: 'MMS2460L', qty: 1, reason: 'APPAREL_STYLE' },
  { date: '2026-01-20', sku: 'MMS2451L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-20', sku: 'MMS2451M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-18', sku: 'MMS2461M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-17', sku: 'MMS2451M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-16', sku: 'MMS2450L', qty: 1, reason: 'UNDELIVERABLE_UNKNOWN' },
  { date: '2026-01-16', sku: 'MMS2460M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-16', sku: 'MMS2451L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-16', sku: 'MMS2450L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-16', sku: 'MMS2450XXL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-14', sku: 'MMS2451M', qty: 1, reason: 'APPAREL_STYLE' },
  { date: '2026-01-14', sku: 'MMS2450S', qty: 1, reason: 'APPAREL_STYLE' },
  { date: '2026-01-14', sku: 'MMS2370XXL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-14', sku: 'MMS2451M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-14', sku: 'MMS2450M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-13', sku: 'MMS2490M', qty: 1, reason: 'UNDELIVERABLE_UNKNOWN' },
  { date: '2026-01-13', sku: 'MMS2371L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-12', sku: 'MMS2451XL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-11', sku: 'MMS2370XL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-11', sku: 'MMS2450XXL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-11', sku: 'MMS2460M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-08', sku: 'MMS2450L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-08', sku: 'MMS2451L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-07', sku: 'MMS2370L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-07', sku: 'MMS2370XL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-07', sku: 'MMS2450XXL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-07', sku: 'MMS2451S', qty: 1, reason: 'APPAREL_TOO_LARGE' },
  { date: '2026-01-06', sku: 'MMS2451S', qty: 1, reason: 'APPAREL_STYLE' },
  { date: '2026-01-05', sku: 'MMS2371XXL', qty: 1, reason: 'NO_REASON_GIVEN' },
  { date: '2026-01-02', sku: 'MMS2450XXL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2026-01-02', sku: 'MMS2450XXL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2025-12-30', sku: 'MMS2441XL', qty: 1, reason: 'UNDELIVERABLE_UNKNOWN' },
  { date: '2025-12-29', sku: 'MMS1001M', qty: 1, reason: 'UNDELIVERABLE_REFUSED' },
  { date: '2025-12-28', sku: 'MMS2450S', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2025-12-23', sku: 'MMS2450XXL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2025-12-22', sku: 'MMS2460L', qty: 1, reason: 'ORDERED_WRONG_ITEM' },
  { date: '2025-12-20', sku: 'MMS2461L', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2025-12-19', sku: 'MMS2450L', qty: 1, reason: 'NO_REASON_GIVEN' },
  { date: '2025-12-18', sku: 'MMS2451XXL', qty: 1, reason: 'APPAREL_STYLE' },
  { date: '2025-12-18', sku: 'MMS2450S', qty: 1, reason: 'APPAREL_STYLE' },
  { date: '2025-12-17', sku: 'MMS2461XL', qty: 1, reason: 'NOT_AS_DESCRIBED' },
  { date: '2025-12-17', sku: 'MMS2461XL', qty: 1, reason: 'NOT_AS_DESCRIBED' },
  { date: '2025-12-15', sku: 'MMS2450M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2025-12-13', sku: 'MMS2450M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2025-12-12', sku: 'MMS2461L', qty: 1, reason: 'APPAREL_TOO_LARGE' },
  { date: '2025-12-12', sku: 'MMS2460M', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2025-12-12', sku: 'MMS2451S', qty: 1, reason: 'APPAREL_STYLE' },
  { date: '2025-12-10', sku: 'MMS2451S', qty: 1, reason: 'UNWANTED_ITEM' },
  { date: '2025-12-08', sku: 'MMS1003XXL', qty: 1, reason: 'UNDELIVERABLE_REFUSED' },
  { date: '2025-12-08', sku: 'MMS1001XL', qty: 1, reason: 'UNDELIVERABLE_REFUSED' },
  { date: '2025-12-01', sku: 'MMS2450XL', qty: 1, reason: 'APPAREL_TOO_SMALL' },
  { date: '2025-12-01', sku: 'MMS2461L', qty: 1, reason: 'NOT_AS_DESCRIBED' },
  { date: '2025-11-22', sku: 'MMS2432L', qty: 1, reason: 'UNDELIVERABLE_REFUSED' },
  { date: '2025-11-18', sku: 'MMS2001S', qty: 1, reason: 'UNDELIVERABLE_UNKNOWN' },
  { date: '2025-11-18', sku: 'MMS2001S', qty: 1, reason: 'UNDELIVERABLE_UNKNOWN' },
  { date: '2025-11-04', sku: 'MMS2380S', qty: 1, reason: 'UNDELIVERABLE_UNKNOWN' },
]

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
  // Fatura verisi varsa onu kullan, yoksa RPC'den gelen veriyi kullan
  const invoiceCur = selectedMonth !== 'all' ? AD_INVOICE_DATA[selectedMonth] : undefined
  const invoicePrev = prevMonthStr !== 'all' ? AD_INVOICE_DATA[prevMonthStr] : undefined
  let displayAd = invoiceCur !== undefined ? invoiceCur : adSpend.currentTotal
  let displayAdPrev = invoicePrev !== undefined ? invoicePrev : adSpend.prevTotal
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

  // ========== Net Profit ({t("common.vatIncluded")}) ==========
  // Settlement verileri (sales, fees, refunds, promo) zaten KDV dahil.
  // COGS ve Subscription KDV haric → %19 KDV ekle.
  // Ad Spend → sadece Almanya (Amazon.de) payina %19 KDV ekle (diger ulkelerde reklam KDV'si yok).
  const VAT_RATE = 0.19

  const curCogsWithVat = cur.cogs * (1 + VAT_RATE)
  const prevCogsWithVat = prev.cogs * (1 + VAT_RATE)
  const curSubWithVat = cur.subscription * (1 + VAT_RATE)
  const prevSubWithVat = prev.subscription * (1 + VAT_RATE)

  // Almanya satis oranini hesapla → reklam KDV'si sadece bu orana uygulanir
  const calcDeRatio = (month: string) => {
    const rows = month === 'all' ? [...rawData] : rawData.filter((r: any) => r.report_month === month)
    const totalSales = rows.reduce((s: number, r: any) => s + (Number(r.sales) || 0), 0)
    const deSales = rows.filter((r: any) => r.marketplace === 'Amazon.de').reduce((s: number, r: any) => s + (Number(r.sales) || 0), 0)
    return totalSales > 0 ? deSales / totalSales : 1
  }
  const curDeRatio = calcDeRatio(selectedMonth)
  const prevDeRatio = calcDeRatio(prevMonthStr)

  // Ad spend: Almanya payi × 1.19, geri kalan KDV'siz
  const curAdWithVat = displayAd * curDeRatio * (1 + VAT_RATE) + displayAd * (1 - curDeRatio)
  const prevAdWithVat = displayAdPrev * prevDeRatio * (1 + VAT_RATE) + displayAdPrev * (1 - prevDeRatio)

  const curNetProfit = cur.sales - cur.promo - cur.refunds - curTotalFees - curCogsWithVat - curSubWithVat - curAdWithVat
  const prevNetProfit = prev.sales - prev.promo - prev.refunds - prevTotalFees - prevCogsWithVat - prevSubWithVat - prevAdWithVat
  const curMargin = cur.sales > 0 ? (curNetProfit / cur.sales) * 100 : 0
  const prevMargin = prev.sales > 0 ? (prevNetProfit / prev.sales) * 100 : 0
  const curAcos = cur.sales > 0 ? (curAdWithVat / cur.sales) * 100 : 0
  const prevAcos = prev.sales > 0 ? (prevAdWithVat / prev.sales) * 100 : 0

  const prevPrevTotalFees = prevPrev.commission + prevPrev.fba + prevPrev.storage + prevPrev.return_mgmt + prevPrev.digital_fba + prevPrev.digital_sell
  const prevPrevCogsWithVat = prevPrev.cogs * (1 + VAT_RATE)
  const prevPrevSubWithVat = prevPrev.subscription * (1 + VAT_RATE)
  const prevPrevNetProfit = prevPrev.sales - prevPrev.promo - prevPrev.refunds - prevPrevTotalFees - prevPrevCogsWithVat - prevPrevSubWithVat

  // ========== Monthly trend chart ==========
  const allMonths = useMemo(() => {
    const set = new Set<string>()
    rawData.forEach((r: any) => set.add(r.report_month))
    return [...set].sort()
  }, [rawData])

  const monthlyChartData = allMonths.map(m => {
    const d = aggregateMonth(m, selectedMarketplace)
    const fees = d.commission + d.fba + d.storage + d.return_mgmt + d.digital_fba + d.digital_sell
    // Fatura verisi varsa onu kullan, yoksa secili ay ise RPC verisini kullan
    const invoiceAd = AD_INVOICE_DATA[m]
    let ad = invoiceAd !== undefined ? invoiceAd : (m === selectedMonth ? displayAd : m === prevMonthStr ? displayAdPrev : 0)
    const deR = calcDeRatio(m)
    const adVat = ad * deR * (1 + VAT_RATE) + ad * (1 - deR)
    const cogsVat = d.cogs * (1 + VAT_RATE)
    const subVat = d.subscription * (1 + VAT_RATE)
    const net = d.sales - d.promo - d.refunds - fees - cogsVat - subVat - adVat
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
    // Fatura verisi varsa onu kullan, yoksa RPC verisini kullan
    const adTotal = (selectedMonth !== 'all' && AD_INVOICE_DATA[selectedMonth] !== undefined)
      ? AD_INVOICE_DATA[selectedMonth]
      : adSpend.currentTotal
    Object.values(grouped).forEach(mp => {
      const ratio = totalSales > 0 ? mp.sales / totalSales : 0
      const adRaw = adTotal * ratio
      // Almanya icin reklam KDV'si %19, diger ulkeler KDV'siz
      mp.adSpend = mp.marketplace === 'Amazon.de' ? adRaw * (1 + VAT_RATE) : adRaw
      const cogsVat = mp.cogs * (1 + VAT_RATE)
      mp.netProfit = mp.sales - mp.fees - mp.adSpend - cogsVat - mp.refunds
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
  const [topRefundProducts, setTopRefundProducts] = useState<{ title: string; sku: string; refunds: number; refundCount: number; refundRate: number; topReason?: string }[]>([])
  const [champHistory, setChampHistory] = useState<{ month: string; sales: number; units: number }[]>([])

  useEffect(() => {
    async function fetchTopProducts() {
      let q = supabase
        .from('all_orders')
        .select('sku, quantity, item_price, order_status')
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

      const skuSales: Record<string, { units: number; sales: number }> = {}
      orders?.forEach((o: any) => {
        const sku = o.sku || ''
        if (!sku) return
        if (!skuSales[sku]) skuSales[sku] = { units: 0, sales: 0 }
        if (o.order_status === 'Shipped') {
          skuSales[sku].units += Number(o.quantity) || 0
          skuSales[sku].sales += Number(o.item_price) || 0
        }
      })

      const allSkus = Object.entries(skuSales)
      setTopProducts(
        allSkus.sort((a, b) => b[1].sales - a[1].sales).slice(0, 5)
          .map(([sku, d]) => ({ title: skuTitle[sku] || sku, sku, units: d.units, sales: d.sales, stock: skuStock[sku]?.stock, avgPrice: skuStock[sku]?.price }))
      )
      // Use FBA_RETURNS real data for refund products
      const filteredReturns = selectedMonth === 'all'
        ? FBA_RETURNS
        : FBA_RETURNS.filter(r => r.date.substring(0, 7) === selectedMonth)
      const returnMap: Record<string, { qty: number; reasons: Record<string, number> }> = {}
      filteredReturns.forEach(r => {
        const skuGroup = r.sku.substring(0, 7)
        if (!returnMap[skuGroup]) returnMap[skuGroup] = { qty: 0, reasons: {} }
        returnMap[skuGroup].qty += r.qty
        returnMap[skuGroup].reasons[r.reason] = (returnMap[skuGroup].reasons[r.reason] || 0) + r.qty
      })
      const returnAll = Object.entries(returnMap).map(([skuGroup, d]) => {
        const matchingSku = Object.keys(skuSales).find(s => s.startsWith(skuGroup))
        const salesData = matchingSku ? skuSales[matchingSku] : null
        const avgPrice = salesData && salesData.units > 0 ? salesData.sales / salesData.units : (skuStock[skuGroup + 'M']?.price || skuStock[skuGroup + 'L']?.price || 20)
        const topReason = Object.entries(d.reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
        const groupShipped = Object.entries(skuSales).filter(([s]) => s.startsWith(skuGroup)).reduce((sum, [, v]) => sum + v.units, 0)
        const totalQty = groupShipped + d.qty
        return { title: skuGroup, sku: skuGroup, refunds: d.qty * avgPrice, refundCount: d.qty, refundRate: totalQty > 0 ? (d.qty / totalQty) * 100 : 0, topReason }
      })
      setTopRefundProducts(returnAll.sort((a, b) => b.refunds - a.refunds).slice(0, 5))

      // Fetch champion's last 2 months performance
      const champSku = allSkus.sort((a, b) => b[1].sales - a[1].sales)[0]?.[0]
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
      pool.push({ priority: 1, type: 'SATIŞ ALARMI', color: COLORS.red, title: 'Satışlarda sert düşüş', desc: `Satışlar geçen aya göre %${Math.abs(salesChange).toFixed(1)} düştü (${fmtNum(prev.sales)} → ${fmtNum(cur.sales)}). Fiyatlandırma, stok durumu ve listing kalitesini kontrol edin.` })
    } else if (salesChange < -3) {
      pool.push({ priority: 3, type: 'SATIŞ TRENDİ', color: COLORS.orange, title: 'Satışlar hafif düşüşte', desc: `Satışlar %${Math.abs(salesChange).toFixed(1)} azaldı. Mevsimsel olabilir — kampanya ve görünürlüğü artırın.` })
    } else if (salesChange > 15) {
      pool.push({ priority: 4, type: 'SATIŞ ARTIŞI', color: COLORS.green, title: 'Satışlar güçlü büyüyor', desc: `Satışlar %${salesChange.toFixed(1)} arttı! Stok durumunu kontrol edin ve bu ivmeyi sürdürmek için reklam bütçesini optimize edin.` })
    } else {
      pool.push({ priority: 6, type: 'SATIŞLAR', color: COLORS.accent, title: 'Satışlar stabil', desc: `Satışlar geçen aya göre %${salesChange >= 0 ? '+' : ''}${salesChange.toFixed(1)} değişti. ${fmtNum(cur.sales)} ciro ile stabil seyrediyor.` })
    }

    const profitChange = pctChange(curNetProfit, prevNetProfit)
    if (curNetProfit < 0) {
      pool.push({ priority: 1, type: 'KÂR ALARMI', color: COLORS.red, title: 'Zarar ediyorsunuz!', desc: `Net kâr ${fmtNum(curNetProfit)} ile negatif. Marj %${curMargin.toFixed(1)}. Acil maliyet analizi gerekiyor.` })
    } else if (profitChange < -15) {
      pool.push({ priority: 2, type: 'KÂRLILIK', color: COLORS.red, title: 'Kârlılık hızla düşüyor', desc: `Net kâr %${Math.abs(profitChange).toFixed(1)} düştü (${fmtNum(prevNetProfit)} → ${fmtNum(curNetProfit)}). Marj %${prevMargin.toFixed(1)}'den %${curMargin.toFixed(1)}'e geriledi.` })
    } else if (profitChange > 10) {
      pool.push({ priority: 5, type: 'KÂRLILIK', color: COLORS.green, title: 'Kârlılık artıyor', desc: `Net kâr %${profitChange.toFixed(1)} arttı (${fmtNum(curNetProfit)}). Marj %${curMargin.toFixed(1)} — başarılı bir ay.` })
    } else {
      pool.push({ priority: 6, type: 'KÂRLILIK', color: COLORS.accent, title: 'Kâr stabil', desc: `Net kâr ${fmtNum(curNetProfit)}, marj %${curMargin.toFixed(1)}. Geçen aya göre %${profitChange >= 0 ? '+' : ''}${profitChange.toFixed(1)} değişim.` })
    }

    const refundRate = cur.sales > 0 ? (cur.refunds / cur.sales) * 100 : 0
    const prevRefundRate = prev.sales > 0 ? (prev.refunds / prev.sales) * 100 : 0
    const refundChange = pctChange(cur.refunds, prev.refunds)
    if (refundRate > 8) {
      pool.push({ priority: 1, type: 'İADE ALARMI', color: COLORS.red, title: 'İade oranı kritik seviyede', desc: `İade oranı %${refundRate.toFixed(1)} (${fmtNum(cur.refunds)}). Geçen ay %${prevRefundRate.toFixed(1)} idi. Ürün kalitesi ve listing açıklamaları acil gözden geçirilmeli.` })
    } else if (refundChange > 20 && cur.refunds > 100) {
      pool.push({ priority: 2, type: 'İADE UYARISI', color: COLORS.orange, title: 'İadeler artıyor', desc: `İadeler %${refundChange.toFixed(0)} arttı (${fmtNum(prev.refunds)} → ${fmtNum(cur.refunds)}). En çok iade edilen ürünleri inceleyin.` })
    } else if (refundChange < -10) {
      pool.push({ priority: 6, type: 'İADELER', color: COLORS.green, title: 'İadeler azalıyor', desc: `İadeler %${Math.abs(refundChange).toFixed(0)} düştü. Oran %${refundRate.toFixed(1)} — sağlıklı seviye.` })
    } else {
      pool.push({ priority: 7, type: 'İADELER', color: COLORS.accent, title: 'İade oranı stabil', desc: `İade oranı %${refundRate.toFixed(1)} (${fmtNum(cur.refunds)}). Normal seviyelerde.` })
    }

    const promoRate = cur.sales > 0 ? (cur.promo / cur.sales) * 100 : 0
    const prevPromoRate = prev.sales > 0 ? (prev.promo / prev.sales) * 100 : 0
    const promoChange = pctChange(cur.promo, prev.promo)
    if (promoRate > 10) {
      pool.push({ priority: 2, type: 'PROMOSYON', color: COLORS.red, title: 'Promosyon maliyeti çok yüksek', desc: `Promosyonlar satışların %${promoRate.toFixed(1)}'ini oluşturuyor (${fmtNum(cur.promo)}). İndirim stratejisini gözden geçirin.` })
    } else if (promoChange > 30 && cur.promo > 50) {
      pool.push({ priority: 3, type: 'PROMOSYON', color: COLORS.orange, title: 'Promosyon harcaması arttı', desc: `Promosyonlar %${promoChange.toFixed(0)} arttı (${fmtNum(cur.promo)}). Kupon ROI'sini kontrol edin.` })
    } else {
      pool.push({ priority: 7, type: 'PROMOSYON', color: COLORS.accent, title: 'Promosyonlar dengeli', desc: `Promosyonlar ${fmtNum(cur.promo)}, satışların %${promoRate.toFixed(1)}'i. Dengeli strateji.` })
    }

    const adChange = pctChange(curAdWithVat, prevAdWithVat)
    if (curAcos > 40) {
      pool.push({ priority: 1, type: 'REKLAM ALARMI', color: COLORS.red, title: 'Reklam verimliliği kritik', desc: `TCoS %${curAcos.toFixed(1)} — çok yüksek (${fmtNum(curAdWithVat)}). Düşük ROAS kampanyaları acilen durdurulmalı.` })
    } else if (curAcos > 25) {
      pool.push({ priority: 3, type: 'REKLAMLAR', color: COLORS.orange, title: 'Reklam optimizasyonu gerekli', desc: `TCoS %${curAcos.toFixed(1)} (${fmtNum(curAdWithVat)}). Geçen ay %${prevAcos.toFixed(1)} idi.` })
    } else if (curAcos < 15 && displayAd > 0) {
      pool.push({ priority: 4, type: 'REKLAM FIRSATI', color: COLORS.green, title: 'Reklamlar çok verimli', desc: `TCoS %${curAcos.toFixed(1)} — mükemmel. Satış hacmini artırmak için bütçeyi yükseltin.` })
    } else {
      pool.push({ priority: 6, type: 'REKLAMLAR', color: COLORS.accent, title: 'Reklam performansı iyi', desc: `TCoS %${curAcos.toFixed(1)} (${fmtNum(curAdWithVat)}). Verimli harcama devam ediyor.` })
    }

    pool.sort((a, b) => a.priority - b.priority)
    return pool.slice(0, 5).map(({ priority, ...rest }) => rest)
  }, [cur, prev, curNetProfit, prevNetProfit, curAcos, prevAcos, curMargin, prevMargin, curAdWithVat, prevAdWithVat, displayAd])

  // ========== Quick actions ==========
  const quickActions = useMemo(() => {
    const actions: { status: string; statusColor: string; label: string }[] = []

    if (curAcos > 30) actions.push({ status: 'Acil', statusColor: COLORS.red, label: 'Yüksek ACoS kampanyalarını durdur' })
    if (cur.refunds > prev.refunds * 1.2 && prev.refunds > 0) actions.push({ status: 'Acil', statusColor: COLORS.red, label: 'İade artışını araştır' })

    const lowStockMps = mpGrouped.filter(mp => mp.sales > 500 && mp.margin < 5)
    if (lowStockMps.length > 0) actions.push({ status: 'Planlı', statusColor: COLORS.accent, label: lowStockMps[0].marketplace + ' marjını iyileştir' })

    if (displayAd > 0 && curAcos < 25) actions.push({ status: 'Planlı', statusColor: COLORS.accent, label: 'SB bütçesini artır' })
    if (curMargin > prevMargin) actions.push({ status: 'Tamam', statusColor: COLORS.green, label: 'Marj optimizasyonu başarılı' })

    if (actions.length === 0) actions.push({ status: 'Bilgi', statusColor: COLORS.accent, label: 'Yeni aksiyon gerekmiyor' })
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
    { label: t("dashboard.adSpend").toUpperCase() + ` (${t("common.vatIncluded")})`, value: fmtNum(curAdWithVat), change: pctChange(curAdWithVat, prevAdWithVat), icon: KpiIcons.spend, bars: [50, 55, 58, 60, 62, 65, 68], color: '#64748B', light: '#E2E8F0', iconBg: '#F8FAFC' },
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
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 18, marginTop: 4 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
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
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
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
            { l: t('dashboard.metricSales'), v: fmtNum(cur.sales), c: pctChange(cur.sales, prev.sales) },
            { l: t('dashboard.metricProfit'), v: fmtNum(curNetProfit), c: pctChange(curNetProfit, prevNetProfit) },
            { l: t('dashboard.metricUnits'), v: cur.units.toLocaleString('de-DE'), c: pctChange(cur.units, prev.units) },
            { l: t('dashboard.metricAdSpend'), v: fmtNum(displayAd), c: pctChange(displayAd, displayAdPrev) },
            { l: t('dashboard.metricRefunds'), v: fmtNum(cur.refunds), c: pctChange(cur.refunds, prev.refunds) },
            { l: t('dashboard.metricPromo'), v: fmtNum(cur.promo), c: pctChange(cur.promo, prev.promo) },
            { l: t('dashboard.metricFees'), v: fmtNum(curTotalFees), c: pctChange(curTotalFees, prevTotalFees) },
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
            const barColors = ['#16A34A', '#22C55E', '#4ADE80', '#86EFAC', '#BBF7D0']
            return topProducts.slice(0, 5).map((p, i) => {
              const pct = maxSales > 0 ? (p.sales / maxSales) * 100 : 0
              const imgInfo = getImgBySku(p.sku)
              const imgUrl = imgInfo?.image_url
              return (
                <div key={i} style={{ marginBottom: i < 4 ? 6 : 0, borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, background: `${barColors[i]}15`, borderRadius: 8, transition: 'width 0.5s ease' }} />
                  <div className="flex items-center justify-between" style={{ position: 'relative', padding: '8px 12px' }}>
                    <div className="flex items-center gap-[10px]">
                      <span className="flex items-center justify-center shrink-0 text-[11px] mc-sub font-bold" style={{ width: 22, height: 22, borderRadius: '50%', background: barColors[i], color: '#fff' }}>{i + 1}</span>
                      {imgUrl ? (
                        <img src={imgUrl} alt={p.sku} style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
                      ) : (
                        <ImgPlaceholder size={28} />
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className="text-[13px] mc-body font-semibold" style={{ color: COLORS.text }}>{p.sku}</span>
                        <span className="text-[10px]" style={{ color: COLORS.sub }}>{p.units} {t("dashboard.unitsSold")} · %{((p.sales / (topProducts.reduce((s, x) => s + x.sales, 0) || 1)) * 100).toFixed(1)}</span>
                      </div>
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

        {/* Top 5 İade */}
        <div style={{ ...CARD_STYLE, padding: '18px 20px' }}>
          <div className="flex items-center gap-2 mb-[14px]">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#FEE2E2', color: COLORS.red }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 14l-4-4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 10h11a4 4 0 010 8h-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span className="text-sm font-bold mc-title" style={{ color: COLORS.text }}>{t("dashboard.topRefunds")}</span>
          </div>
          {topRefundProducts.length > 0 ? (() => {
            const maxRefund = topRefundProducts[0]?.refunds || 1
            const barColors = ['#DC2626', '#EF4444', '#F87171', '#FCA5A5', '#FECACA']
            return topRefundProducts.slice(0, 5).map((p, i) => {
              const pct = maxRefund > 0 ? (p.refunds / maxRefund) * 100 : 0
              const imgInfo = getImgBySku(p.sku)
              const imgUrl = imgInfo?.image_url
              return (
                <div key={i} style={{ marginBottom: i < 4 ? 6 : 0, borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, background: `${barColors[i]}15`, borderRadius: 8, transition: 'width 0.5s ease' }} />
                  <div className="flex items-center justify-between" style={{ position: 'relative', padding: '8px 12px' }}>
                    <div className="flex items-center gap-[10px]">
                      <span className="flex items-center justify-center shrink-0 text-[11px] mc-sub font-bold" style={{ width: 22, height: 22, borderRadius: '50%', background: barColors[i], color: '#fff' }}>{i + 1}</span>
                      {imgUrl ? (
                        <img src={imgUrl} alt={p.sku} style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
                      ) : (
                        <ImgPlaceholder size={28} />
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className="text-[13px] mc-body font-semibold" style={{ color: COLORS.text }}>{p.sku}</span>
                        <span className="text-[10px]" style={{ color: COLORS.sub }}>{p.refundCount} {t("dashboard.unitsCancelled")} · %{p.refundRate.toFixed(1)}</span>
                      </div>
                    </div>
                    <span className="text-[13px] mc-body font-bold" style={{ color: barColors[i] }}>{fmtNum(p.refunds)}</span>
                  </div>
                </div>
              )
            })
          })() : (
            <div className="text-center py-4" style={{ color: COLORS.sub, fontSize: 12 }}>
              {topProducts.length > 0 ? t("dashboard.noRefunds") : t("common.loading")}
            </div>
          )}
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
                  {/* Units Sold */}
                  <tr className="table-row-hover" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: COLORS.text }}>{t("dashboard.unitsSold")}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: COLORS.green }}>{cur.units.toLocaleString('de-DE')}</td>
                    {hasPrev && <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, color: '#64748B' }}>{prev.units.toLocaleString('de-DE')}</td>}
                    {plChangeCell(cur.units, prev.units)}
                  </tr>
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
                  {/* Refund Rate */}
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}`, background: '#FAFBFE' }}>
                    <td style={{ padding: '6px 12px 6px 24px', fontSize: 11, color: COLORS.sub }}>Refund Rate</td>
                    <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: cur.sales > 0 && (cur.refunds / cur.sales) * 100 > 10 ? COLORS.red : COLORS.sub }}>{cur.sales > 0 ? `%${(cur.refunds / cur.sales * 100).toFixed(1)}` : '%0'}</td>
                    {hasPrev && <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: 11, color: '#64748B' }}>{prev.sales > 0 ? `%${(prev.refunds / prev.sales * 100).toFixed(1)}` : '%0'}</td>}
                    <td></td>
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
                  {/* COGS ({t("common.vatIncluded")}) */}
                  <tr className="table-row-hover" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: COLORS.text }}>{t("dashboard.cogs")} <span style={{ fontSize: 10, color: COLORS.sub }}>({t("common.vatIncluded")})</span></td>
                    {plCell(-curCogsWithVat)}
                    {hasPrev && plPrevCell(-prevCogsWithVat)}
                    {plChangeCell(curCogsWithVat, prevCogsWithVat, true)}
                  </tr>
                  {/* Subscription ({t("common.vatIncluded")}) */}
                  <tr className="table-row-hover" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: COLORS.text }}>{t("dashboard.subscription")} <span style={{ fontSize: 10, color: COLORS.sub }}>({t("common.vatIncluded")})</span></td>
                    {plCell(-curSubWithVat)}
                    {hasPrev && plPrevCell(-prevSubWithVat)}
                    {plChangeCell(curSubWithVat, prevSubWithVat, true)}
                  </tr>
                  {/* Advertising ({t("common.vatIncluded")}) - expandable */}
                  <tr className="table-row-hover cursor-pointer" onClick={() => setAdsExpanded(!adsExpanded)} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: COLORS.text }}>{adsExpanded ? '\u25BC' : '\u25B6'} {t("dashboard.adSpend")} <span style={{ fontSize: 10, color: COLORS.sub }}>({t("common.vatIncluded")})</span></td>
                    {plCell(-curAdWithVat)}
                    {hasPrev && plPrevCell(-prevAdWithVat)}
                    {plChangeCell(curAdWithVat, prevAdWithVat, true)}
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
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: COLORS.text }}>{'\u25B8'} {t("dashboard.netProfit")} <span style={{ fontSize: 10, color: COLORS.sub, fontWeight: 400 }}>({t("common.vatIncluded")})</span></td>
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
                      <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: COLORS.text }}><FlagImg marketplace={mp.marketplace} /> {mp.marketplace}</td>
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
