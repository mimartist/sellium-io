'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { COLORS, CARD_STYLE } from '@/lib/design-tokens'
import { ImgPlaceholder } from '@/components/ui/Badges'
import { useTranslation } from '@/lib/i18n'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Product {
  id: number
  asin: string
  parent_asin: string | null
  title: string | null
  brand: string | null
  image_url: string | null
  category: string | null
  price: number | null
  currency: string | null
  rating: number | null
  review_count: number | null
  bullet_points: string | null
  description: string | null
  bestseller_rank: number | null
  bestseller_category: string | null
  amazon_url: string | null
  variant_count: number | null
  stock_level: number | null
  msku: string | null
  status: string
  marketplace: string | null
  created_at: string
  updated_at: string | null
  fetched_at: string | null
}

const STATUS_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending', bg: 'rgba(245,158,11,0.1)', color: '#F59E0B' },
  fetching: { label: 'Fetching...', bg: 'rgba(91,95,199,0.1)', color: '#5B5FC7' },
  active: { label: 'Active', bg: 'rgba(16,185,129,0.1)', color: '#10B981' },
  error: { label: 'Error', bg: 'rgba(239,68,68,0.1)', color: '#EF4444' },
}

const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: COLORS.sub, letterSpacing: '.02em', marginBottom: 4 }
const valueStyle: React.CSSProperties = { fontSize: 14, fontWeight: 500, color: COLORS.text }

export default function ProductDetailPage() {
  const { t } = useTranslation()
  const params = useParams()
  const router = useRouter()
  const asin = (params.asin as string || '').toUpperCase()

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!asin) return
    async function load() {
      const { data } = await supabase
        .from('product_registry')
        .select('*')
        .eq('asin', asin)
        .single()
      setProduct(data)
      setLoading(false)
    }
    load()
  }, [asin])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${COLORS.border}`, borderTopColor: COLORS.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ color: COLORS.sub, fontSize: 13 }}>{t('common.loading')}</div>
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div style={{ ...CARD_STYLE, padding: '50px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, marginBottom: 8 }}>{t('productDetail.notFound')}</div>
        <div style={{ fontSize: 13, color: COLORS.sub, marginBottom: 20 }}>ASIN <span style={{ fontFamily: 'monospace', color: COLORS.accent }}>{asin}</span> {t('productDetail.notFoundDesc')}</div>
        <Link href="/products" style={{ textDecoration: 'none' }}>
          <button style={{ padding: '9px 18px', fontSize: 12, fontWeight: 600, borderRadius: 8, background: COLORS.accent, border: 'none', color: '#fff', cursor: 'pointer' }}>
            {t('productDetail.backToProducts')}
          </button>
        </Link>
      </div>
    )
  }

  const st = STATUS_STYLES[product.status] || STATUS_STYLES.pending

  const stockLabel = product.stock_level === null ? null
    : product.stock_level === 0 ? { text: t('status.out'), color: COLORS.red, bg: COLORS.redLight }
    : product.stock_level <= 5 ? { text: `${t('productDetail.lowStock')} (${product.stock_level})`, color: COLORS.orange, bg: COLORS.orangeLight }
    : { text: `${t('productDetail.inStock')} (${product.stock_level})`, color: COLORS.green, bg: COLORS.greenLight }

  return (
    <>
      {/* BACK + HEADER */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.push('/products')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: COLORS.accent, fontWeight: 500, padding: 0, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          {t('productDetail.backToProducts')}
        </button>
      </div>

      {/* PRODUCT HERO */}
      <div style={{ ...CARD_STYLE, padding: '24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {/* Image */}
          <div style={{ flexShrink: 0 }}>
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.title || ''}
                style={{ width: 180, height: 180, borderRadius: 12, objectFit: 'contain', border: `1px solid ${COLORS.border}`, background: '#FAFBFC' }}
              />
            ) : (
              <div style={{ width: 180, height: 180, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: '#FAFBFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ImgPlaceholder size={64} />
              </div>
            )}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: st.bg, color: st.color }}>
                {product.status === 'pending' ? t('products.pendingStatus') : product.status === 'fetching' ? t('products.fetching') : product.status === 'active' ? t('products.activeStatus') : t('products.errorStatus')}
              </span>
              {stockLabel && (
                <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: stockLabel.bg, color: stockLabel.color }}>
                  {stockLabel.text}
                </span>
              )}
              <span style={{ fontSize: 11, color: COLORS.sub, fontFamily: 'monospace' }}>{product.marketplace}</span>
            </div>

            <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, margin: '0 0 6px 0', lineHeight: 1.4 }}>
              {product.title || t('products.awaitingData')}
            </h1>

            {product.brand && (
              <div style={{ fontSize: 13, color: COLORS.sub, marginBottom: 12 }}>
                {t('productDetail.by')} <span style={{ fontWeight: 600, color: COLORS.accent }}>{product.brand}</span>
              </div>
            )}

            {/* Price + Rating row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
              {product.price && (
                <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.text }}>
                  {product.currency === 'EUR' ? '€' : product.currency || '€'}{product.price.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                </div>
              )}
              {product.rating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 18, color: '#F59E0B' }}>★</span>
                  <span style={{ fontSize: 18, fontWeight: 600, color: COLORS.text }}>{product.rating}</span>
                  <span style={{ fontSize: 13, color: COLORS.sub }}>({product.review_count || 0} {t('productDetail.reviews')})</span>
                </div>
              )}
            </div>

            {/* ASIN + Parent ASIN + Amazon Link */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={labelStyle}>ASIN</div>
                <div style={{ ...valueStyle, fontFamily: 'monospace', fontSize: 13 }}>{product.asin}</div>
              </div>
              {product.msku && (
                <div>
                  <div style={labelStyle}>{t('products.msku')}</div>
                  <div style={{ ...valueStyle, fontFamily: 'monospace', fontSize: 13 }}>{product.msku}</div>
                </div>
              )}
              {product.parent_asin && (
                <div>
                  <div style={labelStyle}>{t('products.parentAsin').toUpperCase()}</div>
                  <div style={{ ...valueStyle, fontFamily: 'monospace', fontSize: 13 }}>{product.parent_asin}</div>
                </div>
              )}
              {product.variant_count && (
                <div>
                  <div style={labelStyle}>{t('products.variants').toUpperCase()}</div>
                  <div style={valueStyle}>{product.variant_count}</div>
                </div>
              )}
              {product.amazon_url && (
                <div>
                  <div style={labelStyle}>AMAZON</div>
                  <a href={product.amazon_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 500, color: COLORS.accent, textDecoration: 'none' }}>
                    {t('productDetail.viewOnAmazon')}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* DETAILS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 20 }}>

        {/* Bestseller Rank */}
        <div style={{ ...CARD_STYLE, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.orange }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{t('productDetail.bestsellerRank')}</span>
          </div>
          {product.bestseller_rank ? (
            <div>
              <div style={{ fontSize: 32, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>
                #{product.bestseller_rank.toLocaleString('de-DE')}
              </div>
              {product.bestseller_category && (
                <div style={{ fontSize: 12, color: COLORS.sub }}>{t('productDetail.inCategory')} {product.bestseller_category}</div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: COLORS.sub }}>{t('productDetail.noRankData')}</div>
          )}
        </div>

        {/* Category */}
        <div style={{ ...CARD_STYLE, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.accent }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{t('productDetail.category')}</span>
          </div>
          {product.category ? (
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
              {product.category.split(' > ').map((cat, i, arr) => (
                <span key={i}>
                  <span style={{ fontWeight: i === arr.length - 1 ? 600 : 400, color: i === arr.length - 1 ? COLORS.text : COLORS.sub }}>
                    {cat}
                  </span>
                  {i < arr.length - 1 && <span style={{ color: COLORS.muted, margin: '0 6px' }}>›</span>}
                </span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: COLORS.sub }}>{t('productDetail.noCategoryData')}</div>
          )}
        </div>
      </div>

      {/* DESCRIPTION */}
      {product.description && (
        <div style={{ ...CARD_STYLE, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.green }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{t('productDetail.description')}</span>
          </div>
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
            {product.description}
          </div>
        </div>
      )}

      {/* BULLET POINTS */}
      {product.bullet_points && (
        <div style={{ ...CARD_STYLE, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.blue }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{t('productDetail.keyFeatures')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {product.bullet_points.split(' || ').map((bp, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.accent, flexShrink: 0, marginTop: 6 }} />
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{bp}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* METADATA */}
      <div style={{ ...CARD_STYLE, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.muted }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{t('productDetail.metadata')}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div>
            <div style={labelStyle}>{t('products.added').toUpperCase()}</div>
            <div style={{ fontSize: 13, color: '#475569' }}>{new Date(product.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          {product.fetched_at && (
            <div>
              <div style={labelStyle}>{t('productDetail.lastFetched')}</div>
              <div style={{ fontSize: 13, color: '#475569' }}>{new Date(product.fetched_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          )}
          {product.updated_at && (
            <div>
              <div style={labelStyle}>{t('productDetail.updated')}</div>
              <div style={{ fontSize: 13, color: '#475569' }}>{new Date(product.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          )}
          <div>
            <div style={labelStyle}>{t('productDetail.marketplace')}</div>
            <div style={{ fontSize: 13, color: '#475569' }}>{product.marketplace || '—'}</div>
          </div>
        </div>
      </div>
    </>
  )
}
