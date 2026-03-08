import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import LogoutButton from './components/LogoutButton'
import DashboardShell from './components/DashboardShell'
import InsightsList from './components/InsightsList'
import ThemeToggle from './components/ThemeToggle'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function getDashboardData() {
  const [products, insights, inventory, amazonSales, shopifySales, ads, costs] = await Promise.all([
    supabase.from('products').select('*').order('id'),
    supabase.from('ai_insights').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('amazon_inventory').select('*, products(title, asin)').order('days_of_supply'),
    supabase.from('amazon_sales').select('*').gte('date', '2026-02-01').order('date'),
    supabase.from('shopify_sales').select('*').gte('date', '2026-02-01').order('date'),
    supabase.from('amazon_ads').select('*').gte('date', '2026-02-01'),
    supabase.from('product_costs').select('*'),
  ])

  // Çift kayıtları temizle (aynı date+campaign+report_type → en yüksek id kalır)
  const adsDeduped = (() => {
    const map: Record<string, any> = {}
    ads.data?.forEach(r => {
      const key = `${r.date}|${r.campaign_name}|${r.report_type}`
      if (!map[key] || r.id > map[key].id) map[key] = r
    })
    return Object.values(map)
  })()

  const aRevenue = amazonSales.data?.reduce((s, r) => s + Number(r.revenue), 0) || 0
  const aFees = amazonSales.data?.reduce((s, r) => s + Number(r.amazon_fees) + Number(r.fba_fees) + Number(r.storage_fees), 0) || 0
  const aRefunds = amazonSales.data?.reduce((s, r) => s + Number(r.refund_amount), 0) || 0
  const adSpend = adsDeduped.reduce((s, r) => s + Number(r.spend), 0)
  const sRevenue = shopifySales.data?.reduce((s, r) => s + Number(r.revenue), 0) || 0
  const totalRevenue = aRevenue + sRevenue
  const totalCogs = costs.data?.reduce((s, r) => s + Number(r.cogs) + Number(r.shipping_cost) + Number(r.customs_duty) + Number(r.prep_cost), 0) || 0
  const netProfit = totalRevenue - aFees - adSpend - aRefunds - totalCogs - 848
  const avgAcos = adsDeduped.length ? (adsDeduped.reduce((s, r) => s + Number(r.acos), 0) / adsDeduped.length).toFixed(1) : 0
  const lowStock = inventory.data?.filter(i => i.days_of_supply < 10) || []

  // Günlük grafik verisi
  const dailyMap: Record<string, { revenue: number, profit: number }> = {}
  amazonSales.data?.forEach(s => {
    const d = s.date
    if (!dailyMap[d]) dailyMap[d] = { revenue: 0, profit: 0 }
    dailyMap[d].revenue += Number(s.revenue)
    dailyMap[d].profit += Number(s.revenue) - Number(s.amazon_fees) - Number(s.fba_fees) - Number(s.storage_fees) - Number(s.refund_amount)
  })
  const dailyData = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }))

  // Günlük reklam verisi
  const dailyAdMap: Record<string, { spend: number, sales: number }> = {}
  adsDeduped.forEach(a => {
    const d = a.date
    if (!dailyAdMap[d]) dailyAdMap[d] = { spend: 0, sales: 0 }
    dailyAdMap[d].spend += Number(a.spend)
    dailyAdMap[d].sales += Number(a.sales)
  })
  const dailyAdData = Object.entries(dailyAdMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }))

  // Top 5 kampanya (spend'e göre)
  const campaignMap: Record<string, { name: string, spend: number, sales: number, acos: number }> = {}
  adsDeduped.forEach(a => {
    const key = a.campaign_name
    if (!campaignMap[key]) campaignMap[key] = { name: a.campaign_name, spend: 0, sales: 0, acos: 0 }
    campaignMap[key].spend += Number(a.spend)
    campaignMap[key].sales += Number(a.sales)
  })
  Object.values(campaignMap).forEach(c => { c.acos = c.sales > 0 ? (c.spend / c.sales) * 100 : 0 })
  const topCampaigns = Object.values(campaignMap).sort((a, b) => b.spend - a.spend).slice(0, 5)

  // Ürün bazlı karlılık
  const productProfit: Record<number, { revenue: number, units: number, fees: number, adSpend: number, refunds: number, storage: number }> = {}
 amazonSales.data?.forEach(s => {
    if (!productProfit[s.product_id]) productProfit[s.product_id] = { revenue: 0, units: 0, fees: 0, adSpend: 0, refunds: 0, storage: 0 }
    productProfit[s.product_id].revenue += Number(s.revenue)
    productProfit[s.product_id].units += Number(s.units_sold)
    productProfit[s.product_id].fees += Number(s.amazon_fees) + Number(s.fba_fees)
    productProfit[s.product_id].refunds += Number(s.refund_amount)
    productProfit[s.product_id].storage += Number(s.storage_fees)
  })
  adsDeduped.forEach(a => {
    if (!productProfit[a.product_id]) productProfit[a.product_id] = { revenue: 0, units: 0, fees: 0, adSpend: 0, refunds: 0, storage: 0 }
    productProfit[a.product_id].adSpend += Number(a.spend)
  })

  return {
    products: products.data || [],
    insights: insights.data || [],
    lowStock,
    dailyData,
    dailyAdData,
    topCampaigns,
    productProfit,
    costs: costs.data || [],
    kpis: { totalRevenue, aRevenue, sRevenue, netProfit, avgAcos, lowStockCount: lowStock.length, adSpend },
  }
}

export default async function Dashboard() {
  const data = await getDashboardData()

  const maxRev = Math.max(...data.dailyData.map(d => d.revenue), 1)
  const chartW = 500
  const chartH = 140
  const points = data.dailyData.map((d, i) => {
    const x = (i / Math.max(data.dailyData.length - 1, 1)) * chartW
    const y = chartH - (d.revenue / maxRev) * chartH * 0.9
    return { x, y, ...d }
  })
  const revPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const profPath = points.map((p, i) => {
    const py = chartH - (p.profit / maxRev) * chartH * 0.9
    return `${i === 0 ? 'M' : 'L'}${p.x},${py}`
  }).join(' ')
  const revArea = `${revPath} L${chartW},${chartH} L0,${chartH} Z`
  const profArea = `${profPath} L${chartW},${chartH} L0,${chartH} Z`

  // Reklam grafiği verisi
  const adChartW = 460
  const adChartH = 130
  const maxAdVal = Math.max(...data.dailyAdData.map(d => Math.max(d.spend, d.sales)), 1)
  const adPoints = data.dailyAdData.map((d, i) => {
    const x = (i / Math.max(data.dailyAdData.length - 1, 1)) * adChartW
    const spendY = adChartH - (d.spend / maxAdVal) * adChartH * 0.9
    const salesY = adChartH - (d.sales / maxAdVal) * adChartH * 0.9
    return { x, spendY, salesY, ...d }
  })
  const adSpendPath = adPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.spendY}`).join(' ')
  const adSalesPath = adPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.salesY}`).join(' ')
  const adSpendArea = `${adSpendPath} L${adChartW},${adChartH} L0,${adChartH} Z`
  const adSalesArea = `${adSalesPath} L${adChartW},${adChartH} L0,${adChartH} Z`
  const maxCampSpend = Math.max(...data.topCampaigns.map(c => c.spend), 1)
  const acosColor = (v: number) => v < 25 ? '#10b981' : v < 40 ? '#f59e0b' : '#f43f5e'

  const segColor = (margin: number) => margin >= 30 ? '#10b981' : margin >= 15 ? '#f59e0b' : '#f43f5e'

  const badgeStyle = (priority: string) => ({
    critical: { bg: 'rgba(244,63,94,0.15)', color: '#f43f5e', label: 'KRİTİK', icon: '🔴' },
    high: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'ÖNEMLİ', icon: '⚠️' },
    normal: { bg: 'rgba(99,102,241,0.15)', color: '#6366f1', label: 'BİLGİ', icon: '💡' },
  }[priority] || { bg: 'rgba(99,102,241,0.15)', color: '#6366f1', label: 'BİLGİ', icon: '💡' })

  const aiScore = 82
  const circumference = 2 * Math.PI * 20
  const scoreOffset = circumference - (aiScore / 100) * circumference

  const sidebarContent = (
    <>
      <div style={{ padding: '0 18px 20px', borderBottom: '1px solid var(--border-color)', marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Sellometrix<span style={{ color: '#6366f1' }}>.io</span></div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 2 }}>AI Commerce OS</div>
      </div>
      {[
        { icon: '⬡', label: 'Dashboard', href: '/', active: true },
        { icon: '◈', label: 'Karlılık', href: '/pl' },
        { icon: '◫', label: 'Stok', href: '#' },
        { icon: '◬', label: 'Reklam', href: '/ads' },
        { icon: '◉', label: 'Rakip Analizi', href: '#' },
        { icon: '◌', label: 'İçerik', href: '#' },
        { icon: '◎', label: 'AI Öneriler', href: '#', badge: data.insights.length },
        { icon: '◱', label: 'Raporlar', href: '#' },
      ].map((item, i) => (
        <div key={i}>
          <Link href={item.href} style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: 13, color: item.active ? '#6366f1' : '#6b7280', background: item.active ? 'rgba(99,102,241,0.1)' : 'transparent', marginBottom: 2, cursor: 'pointer' }}>
              <span>{item.icon}</span><span>{item.label}</span>
              {item.badge ? <span style={{ marginLeft: 'auto', background: '#f43f5e', color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10 }}>{item.badge}</span> : null}
            </div>
          </Link>
        </div>
      ))}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, borderTop: '1px solid var(--border-color)' }}>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#6366f1,#a78bfa)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'white', fontSize: 11 }}>M</div>
          <div><div style={{ fontSize: 12.5, fontWeight: 600 }}>Mimosso</div><div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>amazon.de</div></div>
        </div>
        <ThemeToggle />
        <LogoutButton />
      </div>
    </>
  )

  return (
    <DashboardShell sidebar={sidebarContent}>

        {/* TOPBAR */}
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Genel Bakış</h1>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>amazon.de + Shopify · Şubat 2026</p>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '7px 14px', fontSize: 12.5 }}>🇩🇪 amazon.de ⌄</div>
        </div>

        {/* KPI CARDS */}
        <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'TOPLAM GELİR', value: `€${data.kpis.totalRevenue.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`, color: '#a78bfa', change: '↑ +12.1% geçen ay' },
            { label: 'NET KAR', value: `€${Math.max(data.kpis.netProfit, 0).toLocaleString('de-DE', { maximumFractionDigits: 0 })}`, color: '#10b981', change: '↑ +18.3% geçen ay' },
            { label: 'ORT. ACOS', value: `%${data.kpis.avgAcos}`, color: '#f59e0b', change: '↓ -2.1pp geçen ay' },
            { label: 'STOK UYARISI', value: `${data.kpis.lowStockCount} SKU`, color: data.kpis.lowStockCount > 0 ? '#f43f5e' : '#10b981', change: data.kpis.lowStockCount > 0 ? '⚠ Kritik seviye' : '✓ Sağlıklı' },
          ].map((kpi, i) => (
            <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '14px 16px', position: 'relative', overflow: 'hidden', opacity: 0, animation: `fadeInUp 0.6s ease-out ${i * 0.12}s forwards` }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 55, height: 55, borderRadius: '0 14px 0 55px', background: kpi.color, opacity: 0.07 }}></div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{kpi.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-1px', marginBottom: 4, animation: `numberCount 0.5s ease-out ${0.3 + i * 0.12}s both` }}>{kpi.value}</div>
              <div style={{ fontSize: 11, color: kpi.color }}>{kpi.change}</div>
            </div>
          ))}
        </div>

        {/* MIDDLE ROW */}
        <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14, marginBottom: 20 }}>

          {/* Gelir Grafiği */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.5s forwards' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Gelir & Karlılık Trendi</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Şubat 2026 · Amazon DE</div>
              </div>
            </div>
            <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: '100%', height: 160 }} preserveAspectRatio="none">
              <defs>
                <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3"/>
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0"/>
                </linearGradient>
                <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.3"/>
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map((y, i) => (
                <line key={y} x1="0" y1={chartH * y} x2={chartW} y2={chartH * y} stroke="var(--border-color)" strokeWidth="1" style={{ opacity: 0, animation: `areaFadeIn 0.5s ease-out ${i * 0.15}s forwards` }}/>
              ))}
              <path d={revArea} fill="url(#rg)" style={{ opacity: 0, animation: 'areaFadeIn 1s ease-out 0.8s forwards' }}/>
              <path d={revPath} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 1500, strokeDashoffset: 1500, animation: 'lineDrawIn 1.5s ease-out 0.2s forwards' }}/>
              <path d={profArea} fill="url(#pg)" style={{ opacity: 0, animation: 'areaFadeIn 1s ease-out 1s forwards' }}/>
              <path d={profPath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 1500, strokeDashoffset: 1500, animation: 'lineDrawIn 1.5s ease-out 0.5s forwards' }}/>
              {points.filter((_, i) => i % 3 === 0).map((p, i) => (
                <circle key={`rd${i}`} cx={p.x} cy={p.y} r={3} fill="#6366f1" style={{ opacity: 0, animation: `pulseGlow 2s ease-in-out ${1.2 + i * 0.15}s infinite, areaFadeIn 0.3s ease-out ${1.2 + i * 0.15}s forwards` }}/>
              ))}
            </svg>
            <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
              {[{ color: '#6366f1', label: 'Gelir' }, { color: '#10b981', label: 'Brüt Kar' }].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <div style={{ width: 10, height: 3, background: l.color, borderRadius: 2 }}></div>{l.label}
                </div>
              ))}
            </div>
          </div>

          {/* Platform + AI Skor */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.65s forwards' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Platform Karşılaştırma</div>

            {/* AI Skor */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
                <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="26" cy="26" r="20" fill="none" stroke="var(--bg-elevated)" strokeWidth="4"/>
                  <circle cx="26" cy="26" r="20" fill="none" stroke="#6366f1" strokeWidth="4"
                    strokeDasharray={circumference} strokeDashoffset={scoreOffset} strokeLinecap="round"/>
                </svg>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 13, fontWeight: 700, color: '#6366f1' }}>{aiScore}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>AI Sağlık Skoru</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Geçen haftadan +5 ↑</div>
              </div>
            </div>

            {/* Amazon */}
            <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🛒</div>
                <span style={{ fontSize: 13 }}>Amazon DE</span>
                <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600 }}>€{data.kpis.aRevenue.toLocaleString('de-DE', { maximumFractionDigits: 0 })}</span>
              </div>
              <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 2 }}>
                <div style={{ width: `${(data.kpis.aRevenue / data.kpis.totalRevenue * 100).toFixed(0)}%`, height: '100%', background: '#6366f1', borderRadius: 2, transformOrigin: 'left center', transform: 'scaleX(0)', animation: 'barGrow 0.8s ease-out 0.9s forwards' }}></div>
              </div>
              <div style={{ fontSize: 11, color: '#10b981', marginTop: 4 }}>%{(data.kpis.aRevenue / data.kpis.totalRevenue * 100).toFixed(0)} pay · ~%33 marj</div>
            </div>

            {/* Shopify */}
            <div style={{ padding: '10px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🏪</div>
                <span style={{ fontSize: 13 }}>Shopify</span>
                <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600 }}>€{data.kpis.sRevenue.toLocaleString('de-DE', { maximumFractionDigits: 0 })}</span>
              </div>
              <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 2 }}>
                <div style={{ width: `${(data.kpis.sRevenue / data.kpis.totalRevenue * 100).toFixed(0)}%`, height: '100%', background: '#10b981', borderRadius: 2, transformOrigin: 'left center', transform: 'scaleX(0)', animation: 'barGrow 0.8s ease-out 1.1s forwards' }}></div>
              </div>
              <div style={{ fontSize: 11, color: '#10b981', marginTop: 4 }}>%{(data.kpis.sRevenue / data.kpis.totalRevenue * 100).toFixed(0)} pay · ~%41 marj</div>
            </div>
          </div>
        </div>

        {/* AD PERFORMANCE ROW */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, marginBottom: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 0.8s forwards' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Reklam Performansı</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Şubat 2026 · Günlük Spend vs Satış + Top Kampanyalar</div>
            </div>
            <Link href="/ads/campaigns" style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none' }}>Detayları Gör →</Link>
          </div>
          <div className="chart-split-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
            {/* Sol: Günlük Spend vs Sales Area Chart */}
            <div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                {[{ color: '#f59e0b', label: 'Ad Spend' }, { color: '#10b981', label: 'Ad Sales' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                    <div style={{ width: 10, height: 3, background: l.color, borderRadius: 2 }}></div>{l.label}
                  </div>
                ))}
              </div>
              {data.dailyAdData.length > 0 ? (
                <svg viewBox={`0 0 ${adChartW} ${adChartH}`} style={{ width: '100%', height: 150 }} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="asg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25"/>
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="aslg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.25"/>
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  {[0.25, 0.5, 0.75].map((y, i) => (
                    <line key={y} x1="0" y1={adChartH * y} x2={adChartW} y2={adChartH * y} stroke="var(--border-color)" strokeWidth="1" style={{ opacity: 0, animation: `areaFadeIn 0.5s ease-out ${i * 0.15}s forwards` }}/>
                  ))}
                  <path d={adSalesArea} fill="url(#aslg)" style={{ opacity: 0, animation: 'areaFadeIn 1s ease-out 0.8s forwards' }}/>
                  <path d={adSalesPath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 1500, strokeDashoffset: 1500, animation: 'lineDrawIn 1.5s ease-out 0.2s forwards' }}/>
                  <path d={adSpendArea} fill="url(#asg)" style={{ opacity: 0, animation: 'areaFadeIn 1s ease-out 1s forwards' }}/>
                  <path d={adSpendPath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 1500, strokeDashoffset: 1500, animation: 'lineDrawIn 1.5s ease-out 0.5s forwards' }}/>
                  {adPoints.filter((_, i) => i % 4 === 0).map((p, i) => (
                    <circle key={`as${i}`} cx={p.x} cy={p.salesY} r={3} fill="#10b981" style={{ opacity: 0, animation: `pulseGlow 2s ease-in-out ${1.2 + i * 0.15}s infinite, areaFadeIn 0.3s ease-out ${1.2 + i * 0.15}s forwards` }}/>
                  ))}
                </svg>
              ) : (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Reklam verisi yok</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                <span>{data.dailyAdData[0]?.date?.substring(5) || ''}</span>
                <span>{data.dailyAdData[data.dailyAdData.length - 1]?.date?.substring(5) || ''}</span>
              </div>
            </div>

            {/* Sağ: Top 5 Kampanya Bar Chart */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Top 5 Kampanya (Spend)</div>
              {data.topCampaigns.map((c, i) => {
                const barW = (c.spend / maxCampSpend) * 100
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <div style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' }}>
                        {c.name.length > 30 ? c.name.substring(0, 30) + '...' : c.name}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: acosColor(c.acos) }}>ACOS %{c.acos.toFixed(1)}</div>
                    </div>
                    <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4 }}>
                      <div style={{ height: '100%', width: `${Math.max(barW, 2)}%`, background: 'linear-gradient(90deg, #f59e0b, #f97316)', borderRadius: 4, transformOrigin: 'left center', transform: 'scaleX(0)', animation: `barGrow 0.7s ease-out ${0.3 + i * 0.12}s forwards` }}></div>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>€{c.spend.toFixed(0)} spend · €{c.sales.toFixed(0)} satış</div>
                  </div>
                )
              })}
              {data.topCampaigns.length === 0 && (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)', fontSize: 12 }}>Kampanya verisi yok</div>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM ROW */}
        <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

          {/* AI Öneriler */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 1s forwards' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>AI Öneriler & Uyarılar</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{data.insights.length} aksiyon bekliyor</div>
              </div>
              <div style={{ fontSize: 12, color: '#6366f1', cursor: 'pointer' }}>Tümü →</div>
            </div>
            <InsightsList insights={data.insights} />
          </div>

          {/* Ürün Performansı */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, opacity: 0, animation: 'fadeInUp 0.6s ease-out 1.15s forwards' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Ürün Performansı</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>Top 10 · Net marj & satış sıralaması</div>
            {data.products
              .filter(p => {
                const pp = data.productProfit[p.id]
                return pp && pp.revenue > 0
              })
              .map(p => {
                const pp = data.productProfit[p.id]
                const cost = data.costs.find((c: any) => c.product_id === p.id)
                const unitCost = cost ? Number(cost.cogs) + Number(cost.shipping_cost) + Number(cost.customs_duty) + Number(cost.prep_cost) : 0
                const gross = pp.revenue - pp.fees - (pp.adSpend || 0) - (pp.refunds || 0) - (pp.storage || 0) - (unitCost * (pp.units || 1))
                const margin = Math.round((gross / pp.revenue) * 100)
                return { ...p, pp, gross, margin }
              })
              .sort((a, b) => b.pp.revenue - a.pp.revenue)
              .slice(0, 10)
              .map((p, i, arr) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid #222636' : 'none' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: segColor(p.margin), flexShrink: 0 }}></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title?.substring(0, 38)}...</div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{p.asin} · {p.pp.units} adet · ★{p.rating}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: segColor(p.margin) }}>%{p.margin}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>net marj</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
    </DashboardShell>
  )
}