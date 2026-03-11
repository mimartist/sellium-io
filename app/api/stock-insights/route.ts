import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const summary = await request.json()

  const prompt = `Sen bir Amazon FBA stok analisti ve danışmanısın. Aşağıdaki envanter verilerini analiz et ve Türkçe olarak 6 adet stratejik öneri üret.

VERİ ÖZETİ:
- Stoksuz ürünler: ${summary.outOfStockCount} SKU, günlük kayıp: €${summary.totalDailyLoss}
- En çok kayıp veren stoksuz ürünler: ${summary.topLossProducts}
- Kritik stok (<14 gün): ${summary.criticalCount} SKU
- Kritik ürünler: ${summary.topCriticalProducts}
- Fazla stok (>90 gün): ${summary.overstockCount} SKU, ${summary.overstockUnits} adet
- Ölü stok (0 satış): ${summary.deadCount} SKU, ${summary.deadUnits} adet
- Düşük CVR (>300 oturum, <%5 CVR): ${summary.lowCvrCount} ürün — en kötüler: ${summary.topLowCvr}
- Yıldız ürünler (CVR>%12): ${summary.highCvrCount} ürün — en iyiler: ${summary.topHighCvr}
- Beden dağılımı: ${summary.sizeDistribution}

Her öneri için şu JSON formatında yanıt ver (sadece JSON, başka metin yok):
[
  {
    "type": "ACİL|KRİTİK|VERİMLİLİK|BEDEN ANALİZİ|MALİYET|FIRSAT",
    "title": "Kısa ve etkileyici başlık",
    "description": "Detaylı açıklama — spesifik SKU'lar, rakamlar ve aksiyon adımları içermeli",
    "action": "Aksiyon butonu metni",
    "color": "#ef4444|#f59e0b|#3b82f6|#8b5cf6|#a855f7|#22c55e",
    "priority": 1-6
  }
]

6 öneri üret: 1) Stoksuz ürün acil aksiyonu, 2) Kritik stok uyarısı, 3) CVR optimizasyon fırsatı, 4) Beden dağılımı analizi, 5) Fazla stok eritme planı, 6) Yıldız ürün fırsatı.`

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
        { type: 'ACİL', title: `${summary.outOfStockCount} SKU stoksuz — günlük €${summary.totalDailyLoss} kayıp!`, description: `En çok kayıp veren ürünler: ${summary.topLossProducts}. Acil sipariş oluşturun.`, action: 'Siparis Planla', color: '#ef4444', priority: 1 },
        { type: 'KRİTİK', title: `${summary.criticalCount} SKU kritik stok seviyesinde`, description: `14 günden az stoğu kalan ürünler: ${summary.topCriticalProducts}. Hızlı sevkiyat planlanmalı.`, action: 'Kritik Stoklari Gor', color: '#f59e0b', priority: 2 },
        { type: 'VERİMLİLİK', title: `${summary.lowCvrCount} üründe düşük dönüşüm oranı`, description: `300+ oturum almasına rağmen %5 altında CVR: ${summary.topLowCvr}. Listing optimizasyonu yapılmalı.`, action: 'Listing Iyilestir', color: '#3b82f6', priority: 3 },
        { type: 'BEDEN ANALİZİ', title: 'Beden bazlı stok dengesizliği tespit edildi', description: `Beden dağılımı: ${summary.sizeDistribution}. Stoksuz bedenlere öncelik verin.`, action: 'Beden Planla', color: '#8b5cf6', priority: 4 },
        { type: 'MALİYET', title: `${summary.overstockCount} SKU fazla stokta — ${summary.overstockUnits} adet`, description: `90+ gün stoğu olan ürünler depolama maliyeti yaratıyor. İndirim veya FBA geri çekme değerlendirilmeli.`, action: 'Stok Eritme Plani', color: '#a855f7', priority: 5 },
        { type: 'FIRSAT', title: `${summary.highCvrCount} yıldız ürün fırsatı`, description: `CVR >%12 olan ürünler: ${summary.topHighCvr}. Bu ürünlerin stok seviyelerini artırın.`, action: 'Firsat Planla', color: '#22c55e', priority: 6 },
      ],
    })
  }
}
