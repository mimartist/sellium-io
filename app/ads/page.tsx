'use client'

import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useDateRange, formatDateTR } from './DateRangeContext'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface CardData {
  title: string
  href: string
  icon: string
  color: string
  kpis: { label: string; value: string }[]
}

export default function AdsOverviewPage() {
  const { startDate, endDate, isAllTime } = useDateRange()
  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<CardData[]>([])

  useEffect(() => {
    if (!startDate || !endDate) return
    const fetchAll = async () => {
      setLoading(true)

      let q1 = supabase.from('amazon_ads').select('spend,sales,acos,clicks')
      let q2 = supabase.from('ad_product_performance').select('spend,sales_7d,acos,roas')
      let q3 = supabase.from('ad_search_terms').select('spend,clicks,conversion_rate,search_term')
      let q4 = supabase.from('ad_brand_performance').select('impressions,spend,brand_searches,new_to_brand_orders')
      if (!isAllTime) {
        q1 = q1.gte('date', startDate).lte('date', endDate)
        q2 = q2.gte('date', startDate).lte('date', endDate)
        q3 = q3.gte('date', startDate).lte('date', endDate)
        q4 = q4.gte('date', startDate).lte('date', endDate)
      }
      const [campaigns, products, searchTerms, brand] = await Promise.all([q1, q2, q3, q4])

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
  }, [startDate, endDate, isAllTime])

  return (
    <div>
      {/* HEADER */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Reklam Genel Bakış</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>Amazon Ads · {formatDateTR(startDate)} – {formatDateTR(endDate)}</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-secondary)', fontSize: 14 }}>Veriler yükleniyor...</div>
      ) : (
        <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {cards.map((card, i) => (
            <Link key={card.href} href={card.href} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="overview-card" style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '14px 16px',
                position: 'relative', overflow: 'hidden', cursor: 'pointer',
                transition: 'border-color 0.2s, transform 0.2s',
                opacity: 0, animation: `fadeInUp 0.6s ease-out ${i * 0.12}s forwards`,
                height: '100%', display: 'flex', flexDirection: 'column',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = card.color; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <div style={{ position: 'absolute', top: 0, right: 0, width: 50, height: 50, borderRadius: '0 14px 0 50px', background: card.color, opacity: 0.07 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7, background: `${card.color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: card.color, flexShrink: 0,
                  }}>
                    {card.icon}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{card.title}</div>
                  <div style={{ marginLeft: 'auto', fontSize: 14, color: 'var(--text-secondary)', flexShrink: 0 }}>→</div>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 'auto' }}>
                  {card.kpis.map(kpi => (
                    <div key={kpi.label} style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kpi.label}</div>
                      <div className="overview-card-value" style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.5px', animation: `numberCount 0.5s ease-out ${0.3 + i * 0.1}s both` }}>{kpi.value}</div>
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
