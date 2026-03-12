import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/* ── Allowed tables (whitelist for security) ── */
const ALLOWED_TABLES = [
  'transactions', 'sku_economics', 'sku_cogs', 'ad_product_performance',
  'ad_search_terms', 'parent_asin_map', 'fba_daily_inventory',
  'v_stock_analysis', 'daily_pl', 'monthly_pl', 'product_registry',
]

/* ── Database schema for AI context ── */
const DB_SCHEMA = `
DATABASE SCHEMA (Supabase/PostgreSQL):

1. v_stock_analysis (32 cols) — Main inventory view with calculated fields:
   msku, asin, fnsku, product_name, price, current_stock, reserved, unsellable,
   inbound_working, inbound_shipped, inbound_receiving, inbound_total, total_quantity,
   snapshot_date, sales_30d, sales_90d, sales_year, avg_daily_sales, days_of_stock,
   returns_total, storage_fee_monthly, weight, product_size_tier, sessions, cvr,
   buy_box_pct, revenue, orders, refund_rate, parent_asin, stock_status, daily_revenue_loss
   stock_status values: 'out', 'critical', 'low', 'healthy', 'overstock'

2. monthly_pl (20 cols) — Monthly profit & loss:
   report_month, marketplace, units, sales, promo, commission, fba, storage,
   return_mgmt, digital_fba, digital_sell, total_fees, cogs, refunds, subscription,
   sp_spend, sb_spend, total_ad_spend, net_profit, margin_pct

3. daily_pl (30 cols) — Daily P&L per SKU:
   purchase_day, report_month, marketplace, sku, asin, units, sales, promo,
   commission_per_unit, fba_per_unit, est_commission, est_fba, est_storage, est_cogs,
   est_refunds, sp_spend, sp_attributed_sales, sp_clicks, sb_spend, sb_attributed_sales,
   total_ad_spend, est_net_profit

4. ad_product_performance (27 cols) — SP ads per product:
   date, report_month, campaign_name, ad_group, portfolio, country, sku, asin,
   impressions, clicks, ctr, cpc, spend, sales_7d, orders_7d, units_7d, acos, roas,
   conversion_rate

5. ad_search_terms (24 cols) — Search term report:
   date, report_month, campaign_name, ad_group, keyword, match_type, search_term,
   impressions, clicks, ctr, cpc, spend, sales_7d, orders_7d, units_7d, acos, roas,
   conversion_rate

6. sku_economics (36 cols) — SKU-level economics:
   marketplace, report_month, parent_asin, asin, fnsku, msku, avg_sale_price,
   units_sold, units_returned, units_net, sales, net_sales, fba_fees, selling_commission,
   monthly_storage, sp_ad_spend, total_fees, cogs, net_profit, net_profit_per_unit

7. sku_cogs (14 cols) — Cost of goods:
   sku_prefix, product_name, pack_qty, pack_cost_eur, unit_cost_eur, other_cost_eur,
   valid_from, valid_to, supplier_name, lead_time_days, min_order_qty

8. product_registry (24 cols) — Product catalog:
   asin, title, brand, image_url, price, rating, review_count, status, marketplace,
   parent_asin, msku

9. fba_daily_inventory (20 cols) — Raw daily inventory:
   msku, fnsku, asin, product_name, price, afn_fulfillable_quantity, afn_unsellable_quantity,
   afn_reserved_quantity, afn_total_quantity, afn_inbound_working_quantity,
   afn_inbound_shipped_quantity, afn_inbound_receiving_quantity, snapshot_date

10. parent_asin_map (4 cols) — Parent-child hierarchy:
    parent_asin, child_asin, sku, title

11. transactions (43 cols) — Settlement transactions:
    date, settlement_id, type, transaction_category, order_id, sku, quantity, marketplace,
    product_sales_eur, selling_fees_eur, fba_fees_eur, total_eur, is_order, is_refund, report_month
`

const SYSTEM_PROMPT = `You are the Sellometrix AI assistant for the Mimosso brand (Amazon FBA, 9 EU markets, DE primary).
You have access to the live database via the query_database tool. ALWAYS query real data — never guess or use outdated numbers.

${DB_SCHEMA}

QUERY TOOL USAGE:
- Use the query_database tool to fetch real data before answering
- You can call the tool multiple times for complex questions
- "select" is a comma-separated column list (use "*" for all columns)
- "filters" is an array of {column, operator, value} objects
  Operators: eq, neq, gt, gte, lt, lte, like, ilike, in, is
  For "in" operator, value should be a comma-separated string like "out,critical"
  For "is" operator, value should be "null" or "not.null"
- "order_by" is column name, prefix with "-" for descending (e.g. "-sales_year")
- "limit" max 50 rows
- For aggregations: query raw data and compute in your response
- For marketplace filtering: marketplace column uses country codes like "DE", "FR", "ES", "IT", "NL", "BE", "SE", "PL", "AT"

RULES:
- All monetary values are in EUR
- Reply in the SAME LANGUAGE as the user's message (Turkish if Turkish, English if English)
- Be concise and data-driven, use numbers
- Use Markdown formatting (tables, bold, bullet points)
- When listing products, include MSKU, name, and relevant metrics
- If a question is ambiguous, query the most relevant table and clarify
- For "top N" questions, always order by the relevant metric descending`

/* ── Tool definition ── */
const TOOLS = [
  {
    name: 'query_database',
    description: 'Query the Supabase database. Returns rows from the specified table with optional filters, ordering, and limit.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: {
          type: 'string',
          description: `Table or view name. Allowed: ${ALLOWED_TABLES.join(', ')}`,
        },
        select: {
          type: 'string',
          description: 'Columns to select, comma-separated. Use "*" for all columns. Example: "msku,current_stock,sales_year"',
        },
        filters: {
          type: 'array',
          description: 'Array of filter objects',
          items: {
            type: 'object',
            properties: {
              column: { type: 'string' },
              operator: {
                type: 'string',
                enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is'],
              },
              value: { type: 'string' },
            },
            required: ['column', 'operator', 'value'],
          },
        },
        order_by: {
          type: 'string',
          description: 'Column to order by. Prefix with "-" for descending. Example: "-sales_year"',
        },
        limit: {
          type: 'number',
          description: 'Max rows to return (1-50, default 20)',
        },
      },
      required: ['table', 'select'],
    },
  },
]

/* ── Execute Supabase query from tool call ── */
async function executeQuery(input: {
  table: string
  select: string
  filters?: { column: string; operator: string; value: string }[]
  order_by?: string
  limit?: number
}): Promise<{ data: any[] | null; error: string | null; count: number }> {
  const { table, select, filters, order_by, limit = 20 } = input

  if (!ALLOWED_TABLES.includes(table)) {
    return { data: null, error: `Table "${table}" is not allowed`, count: 0 }
  }

  const safeLimit = Math.min(Math.max(1, limit), 50)

  try {
    let query = supabase.from(table).select(select, { count: 'exact' })

    // Apply filters
    if (filters) {
      for (const f of filters) {
        switch (f.operator) {
          case 'eq': query = query.eq(f.column, f.value); break
          case 'neq': query = query.neq(f.column, f.value); break
          case 'gt': query = query.gt(f.column, f.value); break
          case 'gte': query = query.gte(f.column, f.value); break
          case 'lt': query = query.lt(f.column, f.value); break
          case 'lte': query = query.lte(f.column, f.value); break
          case 'like': query = query.like(f.column, f.value); break
          case 'ilike': query = query.ilike(f.column, f.value); break
          case 'in': query = query.in(f.column, f.value.split(',').map(v => v.trim())); break
          case 'is':
            if (f.value === 'null') query = query.is(f.column, null)
            else query = query.not(f.column, 'is', null)
            break
        }
      }
    }

    // Apply ordering
    if (order_by) {
      const desc = order_by.startsWith('-')
      const col = desc ? order_by.slice(1) : order_by
      query = query.order(col, { ascending: !desc })
    }

    query = query.limit(safeLimit)

    const { data, error, count } = await query

    if (error) {
      console.error('[AI-Chat] Supabase error:', error.message)
      return { data: null, error: error.message, count: 0 }
    }

    return {
      data: data || [],
      error: null,
      count: count || 0,
    }
  } catch (err: any) {
    console.error('[AI-Chat] Query execution error:', err)
    return { data: null, error: err.message || 'Query failed', count: 0 }
  }
}

/* ── Main API handler ── */
export async function POST(request: Request) {
  const { messages } = await request.json()

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
      return NextResponse.json({ reply: 'API key is not configured. Please set ANTHROPIC_API_KEY in .env.local' })
    }

    // Build messages for Anthropic API (only role + content)
    let aiMessages: any[] = messages.map((m: any) => ({
      role: m.role,
      content: m.content,
    }))

    let finalReply = ''
    let iterations = 0
    const MAX_ITERATIONS = 5

    while (iterations < MAX_ITERATIONS) {
      iterations++

      const body = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: aiMessages,
        tools: TOOLS,
      }

      console.log(`[AI-Chat] Iteration ${iterations}, messages: ${aiMessages.length}`)

      const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      })

      if (!aiResponse.ok) {
        const errText = await aiResponse.text()
        console.error(`[AI-Chat] API HTTP ${aiResponse.status}:`, errText)
        finalReply = `API error (${aiResponse.status}). Please try again.`
        break
      }

      const data = await aiResponse.json()
      console.log(`[AI-Chat] stop_reason: ${data.stop_reason}, content blocks: ${data.content?.length}`)

      if (data.error) {
        console.error('[AI-Chat] API error:', data.error)
        finalReply = `API error: ${data.error.message || 'Unknown error'}`
        break
      }

      // If stop_reason is "end_turn" — Claude is done, extract text
      if (data.stop_reason === 'end_turn') {
        const textParts = (data.content || [])
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
        finalReply = textParts.join('') || 'No response generated.'
        break
      }

      // If stop_reason is "tool_use" — Claude wants to call a tool
      if (data.stop_reason === 'tool_use') {
        const toolUseBlocks = (data.content || []).filter((b: any) => b.type === 'tool_use')

        // Add full assistant response (text + tool_use blocks)
        aiMessages.push({ role: 'assistant', content: data.content })

        // Execute each tool call
        const toolResults: any[] = []
        for (const toolBlock of toolUseBlocks) {
          if (toolBlock.name === 'query_database') {
            console.log(`[AI-Chat] Tool call: ${toolBlock.name}`, JSON.stringify(toolBlock.input).substring(0, 200))
            const result = await executeQuery(toolBlock.input)
            console.log(`[AI-Chat] Query result: ${result.count} rows, error: ${result.error}`)
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: JSON.stringify(result),
            })
          } else {
            // Unknown tool — return error
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: JSON.stringify({ error: `Unknown tool: ${toolBlock.name}` }),
              is_error: true,
            })
          }
        }

        // Add tool results as user message
        aiMessages.push({ role: 'user', content: toolResults })
        continue
      }

      // Any other stop_reason — extract whatever text we have
      const textParts = (data.content || [])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
      finalReply = textParts.join('') || 'Unexpected response. Please try again.'
      break
    }

    if (!finalReply) {
      finalReply = 'The analysis took too many steps. Please try a simpler question.'
    }

    return NextResponse.json({ reply: finalReply })
  } catch (err: any) {
    console.error('[AI-Chat] Unhandled error:', err)
    return NextResponse.json({ reply: `Error: ${err.message || 'Unknown error'}. Please try again.` })
  }
}
