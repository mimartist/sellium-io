import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const summary = await request.json()

  const prompt = `You are an Amazon FBA inventory analyst and consultant. Analyze the following inventory data and produce 6 strategic recommendations in English.

DATA SUMMARY:
- Out of stock products: ${summary.outOfStockCount} SKUs, daily loss: €${summary.totalDailyLoss}
- Top loss out-of-stock products: ${summary.topLossProducts}
- Critical stock (<14 days): ${summary.criticalCount} SKUs
- Critical products: ${summary.topCriticalProducts}
- Overstock (>90 days): ${summary.overstockCount} SKUs, ${summary.overstockUnits} units
- Dead stock (0 sales): ${summary.deadCount} SKUs, ${summary.deadUnits} units
- Low CVR (>300 sessions, <5% CVR): ${summary.lowCvrCount} products — worst: ${summary.topLowCvr}
- Star products (CVR>12%): ${summary.highCvrCount} products — best: ${summary.topHighCvr}
- Size distribution: ${summary.sizeDistribution}

Respond in the following JSON format for each recommendation (JSON only, no other text):
[
  {
    "type": "URGENT|CRITICAL|EFFICIENCY|SIZE ANALYSIS|COST|OPPORTUNITY",
    "title": "Short and impactful title",
    "description": "Detailed explanation — should include specific SKUs, numbers and action steps",
    "action": "Action button text",
    "color": "#ef4444|#f59e0b|#3b82f6|#8b5cf6|#a855f7|#22c55e",
    "priority": 1-6
  }
]

Generate 6 recommendations: 1) Out-of-stock urgent action, 2) Critical stock warning, 3) CVR optimization opportunity, 4) Size distribution analysis, 5) Overstock liquidation plan, 6) Star product opportunity.`

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
      throw new Error('API key not configured')
    }

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await aiResponse.json()
    const text = data.content[0].text
    const insights = JSON.parse(text.replace(/```json|```/g, '').trim())
    return NextResponse.json({ insights })
  } catch {
    return NextResponse.json({
      insights: [
        { type: 'URGENT', title: `${summary.outOfStockCount} SKUs out of stock — €${summary.totalDailyLoss}/day loss!`, description: `Top loss products: ${summary.topLossProducts}. Create urgent orders.`, action: 'Plan Order', color: '#ef4444', priority: 1 },
        { type: 'CRITICAL', title: `${summary.criticalCount} SKUs at critical stock level`, description: `Products with less than 14 days of stock: ${summary.topCriticalProducts}. Fast shipment should be planned.`, action: 'View Critical Stock', color: '#f59e0b', priority: 2 },
        { type: 'EFFICIENCY', title: `${summary.lowCvrCount} products with low conversion rate`, description: `Despite 300+ sessions, CVR below 5%: ${summary.topLowCvr}. Listing optimization needed.`, action: 'Improve Listings', color: '#3b82f6', priority: 3 },
        { type: 'SIZE ANALYSIS', title: 'Size-based stock imbalance detected', description: `Size distribution: ${summary.sizeDistribution}. Prioritize out-of-stock sizes.`, action: 'Plan Sizes', color: '#8b5cf6', priority: 4 },
        { type: 'COST', title: `${summary.overstockCount} SKUs overstocked — ${summary.overstockUnits} units`, description: `Products with 90+ days of stock are generating storage costs. Consider discounts or FBA removal.`, action: 'Liquidation Plan', color: '#a855f7', priority: 5 },
        { type: 'OPPORTUNITY', title: `${summary.highCvrCount} star product opportunities`, description: `Products with CVR >12%: ${summary.topHighCvr}. Increase stock levels for these products.`, action: 'Plan Opportunity', color: '#22c55e', priority: 6 },
      ],
    })
  }
}
