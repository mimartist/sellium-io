'use client'

import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const monthLabels: Record<string, string> = {
  '2026-01': 'Ocak 2026',
  '2026-02': 'Şubat 2026',
}

interface CardData {
  title: string
  href: string
  icon: string
  color: string
  kpis: { label: string; value: string }[]
}

export default function AdsOverviewPage() {
  const [month, setMonth] = useState('2026-01')
  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<CardData[]>([])

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      const startDate = `${month}-01`
      const [y, m] = month.split('-').map(Number)
      const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

      const [campaigns, products, searchTerms, brand] = await Promise.all([
        supabase.from('amazon_ads').select('spend,sales,acos,clicks').gte('date', startDate).lt('date', nextMonth),
        supabase.from('ad_product_performance').select('spend,sales_7d,acos,roas').gte('date', startDate).lt('date', nextMonth),
        supabase.from('ad_search_terms').select('spend,clicks,conversion_rate,search_term').gte('date', startDate).lt('date', nextMonth),
        supabase.from('ad_brand_performance').select('impressions,spend,brand_searches,new_to_brand_orders').gte('date', startDate).lt('date', nextMonth),
      ])

      const cData = campaigns.data || []
      const cSpend = cData.reduce((s, r) => s + Number(r.spend), 0)
      const cSales = cData.reduce((s, r) => s + Number(r.sales), 0)
      const cAcos = cSales > 0 ? (cSpend / cSales) * 100 : 0

      const pData = products.data || []
      const pSpend = pData.reduce((s, r) => s + Number(r.spend), 0)
      const pSales = pData.reduce((s, r) => s + Number(r.sales_7d), 0)
      const pAcos = pSales > 0 ? (pSpend / pSales) * 100 : 0

      const sData = searchTerms.data || []
      const sSpend = sData.reduce((s, r) => s + Number(r.spend), 0)
      const sClicks = sData.reduce((s, r) => s + Number(r.clicks), 0)
      const uniqueTerms = new Set(sData.map(r => r.search_term)).size

      const bData = brand.data || []
      const bSpend = bData.reduce((s, r) => s + Number(r.spend), 0)
      const bImpressions = bData.reduce((s, r) => s + Number(r.impressions), 0)
      const bNtb = bData.reduce((s, r) => s + Number(r.new_to_brand_orders), 0)

      setCards([
        {
          title: 'Kampanyalar',
          href: '/ads/campaigns',
          icon: '◬',
          color: '#6366f1',
          kpis: [
            { label: 'Spend', value: `€${cSpend.toLocaleString('de-DE', { maximumFractionDigits: 0 })}` },
            { label: 'Satış', value: `€${cSales.toLocaleString('de-DE', { maximumFractionDigits: 0 })}` },
            { label: 'ACOS', value: `%${cAcos.toFixed(1)}` },
          ],
        },
        {
          title: 'Ürün Performansı',
          href: '/ads/products',
          icon: '◈',
          color: '#10b981',
          kpis: [
            { label: 'Spend', value: `€${pSpend.toLocaleString('de-DE', { maximumFractionDigits: 0 })}` },
            { label: 'Satış', value: `€${pSales.toLocaleString('de-DE', { maximumFractionDigits: 0 })}` },
            { label: 'ACOS', value: `%${pAcos.toFixed(1)}` },
          ],
        },
        {
          title: 'Arama Terimleri',
          href: '/ads/keywords',
          icon: '◉',
          color: '#f59e0b',
          kpis: [
            { label: 'Terim Sayısı', value: uniqueTerms.toLocaleString('de-DE') },
            { label: 'Spend', value: `€${sSpend.toLocaleString('de-DE', { maximumFractionDigits: 0 })}` },
            { label: 'Tıklama', value: sClicks.toLocaleString('de-DE') },
          ],
        },
        {
          title: 'Brand Performansı',
          href: '/ads/brand',
          icon: '◎',
          color: '#a78bfa',
          kpis: [
            { label: 'Gösterim', value: bImpressions.toLocaleString('de-DE') },
            { label: 'Spend', value: `€${bSpend.toLocaleString('de-DE', { maximumFractionDigits: 0 })}` },
            { label: 'NTB Sipariş', value: bNtb.toLocaleString('de-DE') },
          ],
        },
      ])
      setLoading(false)
    }
    fetchAll()
  }, [month])

  return (
    <div>
      {/* HEADER */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Reklam Genel Bakış</h1>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>Amazon Ads · {monthLabels[month]}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {Object.entries(monthLabels).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setMonth(value)}
              style={{
                background: month === value ? '#6366f1' : 'var(--bg-card)',
                border: `1px solid ${month === value ? '#6366f1' : 'var(--border-color)'}`,
                borderRadius: 8, padding: '7px 14px', fontSize: 12.5,
                color: month === value ? 'white' : '#6b7280', cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#6b7280', fontSize: 14 }}>Veriler yükleniyor...</div>
      ) : (
        <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {cards.map((card, i) => (
            <Link key={card.href} href={card.href} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 24,
                position: 'relative', overflow: 'hidden', cursor: 'pointer',
                transition: 'border-color 0.2s, transform 0.2s',
                opacity: 0, animation: `fadeInUp 0.6s ease-out ${i * 0.12}s forwards`,
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = card.color; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <div style={{ position: 'absolute', top: 0, right: 0, width: 90, height: 90, borderRadius: '0 16px 0 90px', background: card.color, opacity: 0.07 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, background: `${card.color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: card.color,
                  }}>
                    {card.icon}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{card.title}</div>
                  <div style={{ marginLeft: 'auto', fontSize: 18, color: '#6b7280' }}>→</div>
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  {card.kpis.map(kpi => (
                    <div key={kpi.label}>
                      <div style={{ fontSize: 10.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{kpi.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px', animation: `numberCount 0.5s ease-out ${0.3 + i * 0.1}s both` }}>{kpi.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
