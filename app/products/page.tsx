'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { COLORS, CARD_STYLE, TH_STYLE } from '@/lib/design-tokens'
import { ImgPlaceholder } from '@/components/ui/Badges'
import { useTranslation } from '@/lib/i18n'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/* ── Styles ── */
const tdStyle: React.CSSProperties = { padding: '11px 12px', fontSize: 13, color: '#475569', borderBottom: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap' }

interface ProductEntry {
  id: number
  asin: string
  parent_asin: string | null
  msku: string | null
  title: string | null
  brand: string | null
  image_url: string | null
  price: number | null
  rating: number | null
  review_count: number | null
  status: string
  marketplace: string
  created_at: string
  fetched_at: string | null
}

interface ParentGroup {
  parentAsin: string
  title: string | null
  brand: string | null
  image_url: string | null
  children: ProductEntry[]
  minPrice: number | null
  maxPrice: number | null
  avgRating: number | null
  totalReviews: number
}

const STATUS_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending', bg: 'rgba(245,158,11,0.1)', color: '#F59E0B' },
  fetching: { label: 'Fetching...', bg: 'rgba(91,95,199,0.1)', color: '#5B5FC7' },
  active: { label: 'Active', bg: 'rgba(16,185,129,0.1)', color: '#10B981' },
  error: { label: 'Error', bg: 'rgba(239,68,68,0.1)', color: '#EF4444' },
}

type ViewMode = 'child' | 'parent'

export default function MyProductsPage() {
  const { t } = useTranslation()
  const [products, setProducts] = useState<ProductEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('child')
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())

  const autoFillMsku = useCallback(async (products: any[]) => {
    const missing = products.filter(p => !p.msku)
    if (missing.length === 0) return

    const { data: inv } = await supabase
      .from('fba_daily_inventory')
      .select('asin, msku')
      .not('asin', 'is', null)
      .not('msku', 'is', null)

    const mskuMap: Record<string, string> = {}
    ;(inv || []).forEach((r: any) => { if (r.asin && r.msku) mskuMap[r.asin] = r.msku })

    const toUpdate = missing.filter(p => mskuMap[p.asin])
    if (toUpdate.length === 0) return

    for (const p of toUpdate) {
      await supabase.from('product_registry').update({ msku: mskuMap[p.asin] }).eq('asin', p.asin)
    }

    setProducts(prev => prev.map(p =>
      !p.msku && mskuMap[p.asin] ? { ...p, msku: mskuMap[p.asin] } : p
    ))
  }, [])

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from('product_registry')
      .select('*')
      .order('created_at', { ascending: false })

    const mapped = (data || []).map((r: any) => ({
      id: r.id,
      asin: r.asin,
      parent_asin: r.parent_asin || null,
      msku: r.msku || null,
      title: r.title,
      brand: r.brand,
      image_url: r.image_url,
      price: r.price,
      rating: r.rating,
      review_count: r.review_count,
      status: r.status || 'active',
      marketplace: r.marketplace || 'Amazon.de',
      created_at: r.created_at || new Date().toISOString(),
      fetched_at: r.fetched_at,
    }))
    setProducts(mapped)
    setLoading(false)
    autoFillMsku(mapped)
  }, [autoFillMsku])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  const handleDelete = async (asin: string) => {
    await supabase.from('product_registry').delete().eq('asin', asin)
    fetchProducts()
  }

  const handleMskuSave = async (asin: string, msku: string) => {
    const trimmed = msku.trim()
    await supabase.from('product_registry').update({ msku: trimmed || null }).eq('asin', asin)
    setProducts(prev => prev.map(p => p.asin === asin ? { ...p, msku: trimmed || null } : p))
  }

  /* ── Filter ── */
  const filtered = useMemo(() => {
    if (!search) return products
    const q = search.toLowerCase()
    return products.filter(p =>
      (p.asin || '').toLowerCase().includes(q) ||
      (p.title || '').toLowerCase().includes(q) ||
      (p.brand || '').toLowerCase().includes(q) ||
      (p.msku || '').toLowerCase().includes(q)
    )
  }, [products, search])

  /* ── Parent Grouping ── */
  const parentGroups = useMemo((): ParentGroup[] => {
    const groups: Record<string, ProductEntry[]> = {}
    filtered.forEach(p => {
      const key = p.parent_asin || p.asin
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    })

    return Object.entries(groups).map(([parentAsin, children]) => {
      const prices = children.map(c => c.price).filter((p): p is number => p !== null)
      const ratings = children.filter(c => c.rating !== null)
      const rep = children.find(c => c.image_url) || children[0]

      return {
        parentAsin,
        title: rep.title,
        brand: rep.brand,
        image_url: rep.image_url,
        children,
        minPrice: prices.length > 0 ? Math.min(...prices) : null,
        maxPrice: prices.length > 0 ? Math.max(...prices) : null,
        avgRating: ratings.length > 0 ? ratings.reduce((s, c) => s + (c.rating || 0), 0) / ratings.length : null,
        totalReviews: children.reduce((s, c) => s + (c.review_count || 0), 0),
      }
    }).sort((a, b) => b.children.length - a.children.length)
  }, [filtered])

  const toggleParent = (parentAsin: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev)
      if (next.has(parentAsin)) next.delete(parentAsin)
      else next.add(parentAsin)
      return next
    })
  }

  const pendingCount = products.filter(p => p.status === 'pending').length
  const activeCount = products.filter(p => p.status === 'active').length

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${COLORS.border}`, borderTopColor: COLORS.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ color: COLORS.sub, fontSize: 13 }}>{t('products.loadingProducts')}</div>
        </div>
      </div>
    )
  }

  /* ── Child Row (reused in both views) ── */
  const renderChildRow = (p: ProductEntry, indent = false) => {
    const st = STATUS_STYLES[p.status] || STATUS_STYLES.pending
    return (
      <tr key={p.id} style={{ borderBottom: `1px solid ${COLORS.border}`, transition: 'background 0.15s', cursor: 'pointer', background: indent ? '#FAFBFC' : 'transparent' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = indent ? '#F1F5F9' : '#FAFBFC'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = indent ? '#FAFBFC' : 'transparent'}
        onClick={() => window.location.href = `/products/${p.asin}`}
      >
        <td style={{ ...tdStyle, padding: '10px 12px', paddingLeft: indent ? 44 : 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {indent && <span style={{ color: COLORS.border, fontSize: 14 }}>└</span>}
            {p.image_url ? (
              <img src={p.image_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', border: `1px solid ${COLORS.border}` }} />
            ) : (
              <ImgPlaceholder size={36} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: indent ? 200 : 240 }}>
                {p.title || t('products.awaitingData')}
              </div>
              {p.brand && <div style={{ fontSize: 11, color: COLORS.sub, marginTop: 1 }}>{p.brand}</div>}
            </div>
          </div>
        </td>
        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12, color: COLORS.accent, fontWeight: 500 }}>{p.asin}</td>
        <td style={{ ...tdStyle, padding: '6px 8px' }} onClick={e => e.stopPropagation()}>
          <input
            defaultValue={p.msku || ''}
            placeholder="—"
            onBlur={e => handleMskuSave(p.asin, e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            style={{
              width: 110, padding: '4px 8px', borderRadius: 6, fontSize: 11, fontFamily: 'monospace',
              border: '1px solid transparent', outline: 'none', color: COLORS.text,
              background: 'transparent', transition: 'all 0.2s',
            }}
            onFocus={e => { e.target.style.border = `1px solid ${COLORS.accent}`; e.target.style.background = '#fff' }}
            onBlurCapture={e => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent' }}
          />
        </td>
        <td style={{ ...tdStyle, textAlign: 'center' }}>
          <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: st.bg, color: st.color }}>
            {p.status === 'pending' ? t('products.pendingStatus') : p.status === 'fetching' ? t('products.fetching') : p.status === 'active' ? t('products.activeStatus') : t('products.errorStatus')}
          </span>
        </td>
        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>{p.price ? `€${p.price.toLocaleString('de-DE', { minimumFractionDigits: 2 })}` : '—'}</td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          {p.rating ? (
            <span style={{ color: p.rating >= 4 ? COLORS.green : p.rating >= 3 ? COLORS.orange : COLORS.red, fontWeight: 500 }}>
              ★ {p.rating} <span style={{ color: COLORS.sub, fontWeight: 400 }}>({p.review_count || 0})</span>
            </span>
          ) : '—'}
        </td>
        <td style={{ ...tdStyle, fontSize: 11, color: COLORS.sub }}>
          {new Date(p.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
        </td>
        <td style={{ ...tdStyle, textAlign: 'center' }}>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(p.asin) }}
            style={{
              width: 24, height: 24, borderRadius: 6, border: 'none',
              background: 'transparent', color: COLORS.sub, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, transition: 'all 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = COLORS.redLight; (e.currentTarget as HTMLElement).style.color = COLORS.red }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = COLORS.sub }}
            title={t('products.removeProduct')}
          >
            ✕
          </button>
        </td>
      </tr>
    )
  }

  /* ── Parent Row ── */
  const renderParentRow = (group: ParentGroup) => {
    const expanded = expandedParents.has(group.parentAsin)
    const priceRange = group.minPrice !== null
      ? group.minPrice === group.maxPrice
        ? `€${group.minPrice.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`
        : `€${group.minPrice.toLocaleString('de-DE', { minimumFractionDigits: 2 })} – €${group.maxPrice!.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`
      : '—'

    return (
      <>
        <tr key={group.parentAsin} style={{ borderBottom: `1px solid ${COLORS.border}`, transition: 'background 0.15s', cursor: 'pointer', background: expanded ? 'rgba(91,95,199,0.03)' : 'transparent' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = expanded ? 'rgba(91,95,199,0.05)' : '#FAFBFC'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = expanded ? 'rgba(91,95,199,0.03)' : 'transparent'}
          onClick={() => toggleParent(group.parentAsin)}
        >
          <td style={{ ...tdStyle, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: COLORS.accent, width: 16, textAlign: 'center', flexShrink: 0, transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              {group.image_url ? (
                <img src={group.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: `1px solid ${COLORS.border}` }} />
              ) : (
                <ImgPlaceholder size={40} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                  {group.title || t('products.awaitingData')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  {group.brand && <span style={{ fontSize: 11, color: COLORS.sub }}>{group.brand}</span>}
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: COLORS.accentLight, color: COLORS.accent }}>
                    {group.children.length} {t('products.variants')}
                  </span>
                </div>
              </div>
            </div>
          </td>
          <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12, color: COLORS.sub, fontWeight: 500 }}>{group.parentAsin}</td>
          <td style={{ ...tdStyle, fontSize: 11, color: COLORS.sub }}>—</td>
          <td style={{ ...tdStyle, textAlign: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: COLORS.sub }}>
              {group.children.filter(c => c.status === 'active').length}/{group.children.length} {t('products.active')}
            </span>
          </td>
          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500, fontSize: 12 }}>{priceRange}</td>
          <td style={{ ...tdStyle, textAlign: 'right' }}>
            {group.avgRating ? (
              <span style={{ color: group.avgRating >= 4 ? COLORS.green : group.avgRating >= 3 ? COLORS.orange : COLORS.red, fontWeight: 500 }}>
                ★ {group.avgRating.toFixed(1)} <span style={{ color: COLORS.sub, fontWeight: 400 }}>({group.totalReviews})</span>
              </span>
            ) : '—'}
          </td>
          <td style={{ ...tdStyle, fontSize: 11, color: COLORS.sub }}></td>
          <td style={{ ...tdStyle, textAlign: 'center' }}></td>
        </tr>
        {expanded && group.children.map(child => renderChildRow(child, true))}
      </>
    )
  }

  return (
    <>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: COLORS.text }}>{t('products.title')}</h1>
          <p style={{ fontSize: 13, color: COLORS.sub, marginTop: 2, margin: 0 }}>
            {products.length} {t('products.registered')} · {activeCount} {t('products.active')} · {pendingCount} {t('products.pending')}
            {viewMode === 'parent' && ` · ${parentGroups.length} ${t('products.parentGroups')}`}
          </p>
        </div>
        <Link href="/products/add" style={{ textDecoration: 'none' }}>
          <button style={{
            padding: '9px 18px', fontSize: 12, fontWeight: 600, borderRadius: 8,
            background: COLORS.accent, border: 'none', color: '#fff', cursor: 'pointer',
          }}>
            {t('products.addProducts')}
          </button>
        </Link>
      </div>

      {/* PRODUCTS TABLE */}
      {products.length > 0 ? (
        <>
          {/* Search + View Toggle */}
          <div style={{ ...CARD_STYLE, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('products.searchPlaceholder')}
              style={{ flex: '1 1 200px', padding: '6px 10px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12, outline: 'none', minWidth: 150 }} />
            <div style={{ flex: '1 1 0', minWidth: 0 }} />

            {/* View Toggle */}
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${COLORS.border}` }}>
              {(['child', 'parent'] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    padding: '5px 14px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: viewMode === mode ? COLORS.accent : '#fff',
                    color: viewMode === mode ? '#fff' : COLORS.sub,
                    transition: 'all 0.2s',
                  }}
                >
                  {mode === 'child' ? t('products.allVariants') : t('products.byParent')}
                </button>
              ))}
            </div>

            <span style={{ fontSize: 11, color: COLORS.sub }}>
              {viewMode === 'child' ? `${filtered.length} ${t('products.of')} ${products.length} ${t('common.products')}` : `${parentGroups.length} ${t('products.parentGroups')}`}
            </span>
          </div>

          <div style={{ ...CARD_STYLE, padding: 0, overflow: 'hidden' }}>
            <div className="modern-scroll" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 750 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>
                    <th style={{ ...TH_STYLE, padding: '12px 12px', textAlign: 'left', minWidth: 300 }}>{t('products.product')}</th>
                    <th style={{ ...TH_STYLE, padding: '12px 12px', textAlign: 'left' }}>{viewMode === 'parent' ? t('products.parentAsin') : 'ASIN'}</th>
                    <th style={{ ...TH_STYLE, padding: '12px 12px', textAlign: 'left' }}>{t('products.msku')}</th>
                    <th style={{ ...TH_STYLE, padding: '12px 12px', textAlign: 'center' }}>{t('products.status')}</th>
                    <th style={{ ...TH_STYLE, padding: '12px 12px', textAlign: 'right' }}>{t('products.price')}</th>
                    <th style={{ ...TH_STYLE, padding: '12px 12px', textAlign: 'right' }}>{t('products.rating')}</th>
                    <th style={{ ...TH_STYLE, padding: '12px 12px', textAlign: 'left' }}>{t('products.added')}</th>
                    <th style={{ ...TH_STYLE, padding: '12px 12px', textAlign: 'center', width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {viewMode === 'child'
                    ? filtered.map(p => renderChildRow(p))
                    : parentGroups.map(g => renderParentRow(g))
                  }
                  {(viewMode === 'child' ? filtered.length : parentGroups.length) === 0 && (
                    <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: COLORS.sub, fontSize: 13 }}>{t('products.noProducts')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div style={{ ...CARD_STYLE, padding: '50px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, background: `linear-gradient(135deg, ${COLORS.accentLight}, rgba(91,95,199,0.15))`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
            fontSize: 28,
          }}>
            📦
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, marginBottom: 6 }}>{t('products.welcomeTitle')}</div>
          <div style={{ fontSize: 13, color: COLORS.sub, textAlign: 'center', maxWidth: 420, marginBottom: 24, lineHeight: 1.7 }}>
            {t('products.welcomeDesc')}
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              { step: '1', icon: '✏️', title: t('products.addAsins'), desc: t('products.addAsinsDesc') },
              { step: '2', icon: '⚡', title: t('products.autoFetch'), desc: t('products.autoFetchDesc') },
              { step: '3', icon: '📊', title: t('products.track'), desc: t('products.trackDesc') },
            ].map(s => (
              <div key={s.step} style={{
                textAlign: 'center', padding: '16px 18px', borderRadius: 12,
                background: '#FAFBFC', border: `1px solid ${COLORS.border}`, minWidth: 130,
              }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 2 }}>{s.title}</div>
                <div style={{ fontSize: 11, color: COLORS.sub }}>{s.desc}</div>
              </div>
            ))}
          </div>

          <Link href="/products/add" style={{ textDecoration: 'none' }}>
            <button style={{
              padding: '12px 28px', fontSize: 14, fontWeight: 600, borderRadius: 10,
              background: COLORS.accent, border: 'none', color: '#fff', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(91,95,199,0.25)', transition: 'all 0.2s',
            }}>
              {t('products.addFirst')}
            </button>
          </Link>
        </div>
      )}
    </>
  )
}
