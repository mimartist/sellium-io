'use client'

import { COLORS } from '@/lib/design-tokens'
import { ImgPlaceholder } from './Badges'

interface ProductCellProps {
  title: string
  subtitle?: string
  imageUrl?: string | null
  asin?: string | null
  size?: number
  maxWidth?: number
}

/**
 * Reusable product cell with thumbnail image + title + optional subtitle.
 * Image links to /products/[asin] detail page if asin is provided.
 */
export default function ProductCell({ title, subtitle, imageUrl, asin, size = 32, maxWidth = 240 }: ProductCellProps) {
  const imgElement = imageUrl ? (
    <img src={imageUrl} alt="" style={{
      width: size, height: size, borderRadius: 6, objectFit: 'cover',
      border: `1px solid ${COLORS.border}`, flexShrink: 0,
      cursor: asin ? 'pointer' : 'default',
    }} />
  ) : (
    <ImgPlaceholder size={size} />
  )

  const wrappedImg = asin ? (
    <a href={`/products/${asin}`} onClick={e => e.stopPropagation()} style={{ textDecoration: 'none', lineHeight: 0 }}>
      {imgElement}
    </a>
  ) : imgElement

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {wrappedImg}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: COLORS.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth,
        }}>
          {title || 'Awaiting data...'}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11, color: COLORS.sub, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}
