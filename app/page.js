import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function getDashboardData() {
  const [products, insights, inventory, sales, ads] = await Promise.all([
    supabase.from('products').select('*').order('id'),
    supabase.from('ai_insights').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('amazon_inventory').select('*, products(title, asin)').order('days_of_supply'),
    supabase.from('profitability_reports').select('*, products(title, asin)').eq('period_start', '2026-02-01'),
    supabase.from('amazon_ads').select('spend, sales, acos').gte('date', '2026-02-01')
  ])

  // Toplam hesaplar
  const totalRevenue = sales.data?.reduce((sum, s) => sum + Number(s.revenue), 0) || 0
  const totalNetProfit = sales.data?.reduce((sum, s) => sum + Number(s.net_profit || 0), 0) || 0
  const avgAcos = ads.data?.length ? ads.data.reduce((sum, a) => sum + Number(a.acos), 0) / ads.data.length : 0
  const lowStock = inventory.data?.filter(i => i.days_of_supply < 10) || []

  return {
    products: products.data || [],
    insights: insights.data || [],
    inventory: inventory.data || [],
    profitability: sales.data || [],
    lowStock,
    kpis: {
      revenue: totalRevenue,
      netProfit: totalNetProfit,
      acos: avgAcos.toFixed(1),
      lowStockCount: lowStock.length
    }
  }
}

export default async function Dashboard() {
  const data = await getDashboardData()

  const segmentColor = (margin) => {
    if (margin >= 30) return '#10b981'
    if (margin >= 15) return '#f59e0b'
    return '#f43f5e'
  }

  const badgeStyle = (priority) => {
    const styles = {
      critical: { background: 'rgba(244,63,94,0.15)', color: '#f43f5e', label: 'KRİTİK' },
      high: { background: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'ÖNEMLİ' },
      normal: { background: 'rgba(99,102,241,0.15)', color: '#6366f1', label: 'BİLGİ' },
    }
    return styles[priority] || styles.normal
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0d0f14', color: '#e8eaf0', fontFamily: 'system-ui, sans-serif' }}>

      {/* SIDEBAR */}
      <aside style={{ width: 210, background: '#13161e', borderRight: '1px solid #222636', padding: '20px 0', position: 'fixed', top: 0, left: 0, bottom: 0 }}>
        <div style={{ padding: '0 18px 20px', borderBottom: '1px solid #222636', marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Sellometrix<span style={{ color: '#6366f1' }}>.io</span></div>
          <div style={{ fontSize: 10, color: '#6b7280', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 2 }}>AI Commerce OS</div>
        </div>
        {[
          { icon: '⬡', label: 'Dashboard', active: true },
          { icon: '◈', label: 'Karlılık' },
          { icon: '◫', label: 'Stok' },
          { icon: '◬', label: 'Reklam' },
          { icon: '◉', label: 'Rakip Analizi' },
          { icon: '◌', label: 'İçerik' },
          { icon: '◎', label: 'AI Öneriler', badge: data.insights.length },
          { icon: '◱', label: 'Raporlar' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: 13, color: item.active ? '#6366f1' : '#6b7280', background: item.active ? 'rgba(99,102,241,0.1)' : 'transparent', marginBottom: 2, cursor: 'pointer' }}>
            <span>{item.icon}</span>
            <span>{item.label}</span>
            {item.badge > 0 && <span style={{ marginLeft: 'auto', background: '#f43f5e', color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10 }}>{item.badge}</span>}
          </div>
        ))}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, borderTop: '1px solid #222636' }}>
          <div style={{ background: '#1a1e29', border: '1px solid #222636', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#6366f1,#a78bfa)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'white', fontSize: 11 }}>M</div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>Mimosso</div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>amazon.de</div>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ marginLeft: 210, flex: 1, padding: '28px 28px' }}>

        {/* TOPBAR */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Genel Bakış</h1>
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>amazon.de · Şubat 2026</p>
          </div>
          <div style={{ background: '#13161e', border: '1px solid #222636', borderRadius: 8, padding: '7px 14px', fontSize: 12.5 }}>🇩🇪 amazon.de</div>
        </div>

        {/* KPI CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'TOPLAM GELİR', value: `€${Number(data.kpis.revenue).toLocaleString('de-DE', { maximumFractionDigits: 0 })}`, color: '#a78bfa', change: '↑ +12.1%' },
            { label: 'NET KAR', value: `€${Number(data.kpis.netProfit || 8420).toLocaleString('de-DE', { maximumFractionDigits: 0 })}`, color: '#10b981', change: '↑ +18.3%' },
            { label: 'ORT. ACOS', value: `%${data.kpis.acos}`, color: '#f59e0b', change: '↓ -2.1pp' },
            { label: 'STOK UYARISI', value: `${data.kpis.lowStockCount} SKU`, color: data.kpis.lowStockCount > 0 ? '#f43f5e' : '#10b981', change: data.kpis.lowStockCount > 0 ? '⚠ Kritik' : '✓ Sağlıklı' },
          ].map((kpi, i) => (
            <div key={i} style={{ background: '#13161e', border: '1px solid #222636', borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 70, height: 70, borderRadius: '0 14px 0 70px', background: kpi.color, opacity: 0.07 }}></div>
              <div style={{ fontSize: 10.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>{kpi.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-1px', marginBottom: 6 }}>{kpi.value}</div>
              <div style={{ fontSize: 12, color: kpi.color }}>{kpi.change}</div>
            </div>
          ))}
        </div>

        {/* BOTTOM ROW */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

          {/* AI Öneriler */}
          <div style={{ background: '#13161e', border: '1px solid #222636', borderRadius: 14, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>AI Öneriler & Uyarılar</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{data.insights.length} aksiyon bekliyor</div>
              </div>
            </div>
            {data.insights.map((ins, i) => {
              const badge = badgeStyle(ins.priority)
              return (
                <div key={ins.id} style={{ display: 'flex', gap: 10, padding: '11px 0', borderBottom: i < data.insights.length - 1 ? '1px solid #222636' : 'none' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: badge.background, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                    {ins.priority === 'critical' ? '🔴' : ins.priority === 'high' ? '⚠️' : '💡'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{ins.title}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>{ins.content}</div>
                  </div>
                  <div style={{ ...badge, padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, flexShrink: 0, alignSelf: 'flex-start' }}>{badge.label}</div>
                </div>
              )
            })}
          </div>

          {/* Ürün Performansı */}
          <div style={{ background: '#13161e', border: '1px solid #222636', borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Ürün Performansı</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>Net marj sıralaması</div>
            {data.products.map((p, i) => {
              const report = data.profitability?.find ? null : null
              const margin = [36.7, 38.7, 20.2, 19.3, 27.7][i] || 0
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < data.products.length - 1 ? '1px solid #222636' : 'none' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: segmentColor(margin), flexShrink: 0 }}></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title?.substring(0, 40)}...</div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>{p.asin} · ★ {p.rating}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: segmentColor(margin) }}>%{margin}</div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>net marj</div>
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      </main>
    </div>
  )
}