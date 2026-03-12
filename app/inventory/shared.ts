import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export interface StockRow {
  msku: string
  asin: string
  product_name: string
  price: number
  current_stock: number
  inbound_total: number
  avg_daily_sales: number
  days_of_stock: number
  stock_status: string
  daily_revenue_loss: number
  sales_30d: number
  parent_asin: string
  storage_fee_monthly: number
}

export function extractSize(sku: string): string {
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

export const PRODUCT_KEYWORDS = ['Slip', 'Tanga', 'Brazilian', 'Top', 'Boxershorts', 'Hipster', 'Soft Bra', 'Bra', 'Brief', 'Panty']

export function extractProductGroup(row: StockRow): string {
  if (row.product_name) {
    for (const kw of PRODUCT_KEYWORDS) {
      if (row.product_name.toLowerCase().includes(kw.toLowerCase())) return kw
    }
  }
  return row.msku.substring(0, 7)
}

const MONTH_NAMES: Record<number, string> = {
  0: 'Jan', 1: 'Feb', 2: 'Mar', 3: 'Apr', 4: 'May', 5: 'Jun',
  6: 'Jul', 7: 'Aug', 8: 'Sep', 9: 'Oct', 10: 'Nov', 11: 'Dec',
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
}

export const fmtNum = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 0 })
export const fmtCur = (v: number) => `€${v.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`
export const fmtDec = (v: number, d = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

export const STOCK_SELECT_FIELDS = 'msku, asin, product_name, price, current_stock, inbound_total, avg_daily_sales, days_of_stock, stock_status, daily_revenue_loss, sales_30d, parent_asin, storage_fee_monthly'
