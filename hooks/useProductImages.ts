'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export interface ProductInfo {
  asin: string
  image_url: string | null
  title: string | null
}

/**
 * Hook that fetches product images and ASINs from product_registry.
 * Returns a map of ASIN → { image_url, title } for quick lookup.
 * Also provides a skuToAsin map from fba_daily_inventory.
 */
export function useProductImages() {
  const [imageMap, setImageMap] = useState<Record<string, ProductInfo>>({})
  const [skuToAsin, setSkuToAsin] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function load() {
      const [regRes, invRes] = await Promise.all([
        supabase.from('product_registry').select('asin, image_url, title'),
        supabase.from('fba_daily_inventory').select('asin, msku').not('asin', 'is', null).not('msku', 'is', null),
      ])

      const map: Record<string, ProductInfo> = {}
      ;(regRes.data || []).forEach((r: any) => {
        if (r.asin) map[r.asin] = { asin: r.asin, image_url: r.image_url, title: r.title }
      })
      setImageMap(map)

      const sMap: Record<string, string> = {}
      ;(invRes.data || []).forEach((r: any) => {
        if (r.msku && r.asin) sMap[r.msku] = r.asin
      })
      setSkuToAsin(sMap)
      setLoaded(true)
    }
    load()
  }, [])

  /** Get product info by ASIN */
  const getByAsin = (asin: string): ProductInfo | null => imageMap[asin] || null

  /** Get product info by SKU (looks up ASIN first) */
  const getBySku = (sku: string): ProductInfo | null => {
    const asin = skuToAsin[sku]
    if (asin) return imageMap[asin] || null
    return null
  }

  /** Get ASIN from SKU */
  const asinFromSku = (sku: string): string | null => skuToAsin[sku] || null

  /**
   * Extract base SKU prefix by removing trailing size suffix.
   * e.g. MMS2461M → MMS2461, MMS2461XXL → MMS2461
   */
  const skuPrefix = (sku: string): string => {
    return sku.replace(/(XXXL|XXL|XL|XS|S|M|L)$/i, '')
  }

  /**
   * Get product info by SKU with sibling fallback.
   * If direct SKU has no image, tries other SKUs with the same base prefix.
   */
  const getBySkuWithFallback = (sku: string): ProductInfo | null => {
    // Direct lookup first
    const direct = getBySku(sku)
    if (direct?.image_url) return direct

    // Try sibling SKUs with same prefix
    const prefix = skuPrefix(sku)
    if (!prefix) return direct
    for (const [otherSku, otherAsin] of Object.entries(skuToAsin)) {
      if (otherSku === sku) continue
      if (otherSku.startsWith(prefix)) {
        const info = imageMap[otherAsin]
        if (info?.image_url) return info
      }
    }
    return direct
  }

  /**
   * Get ASIN from SKU with sibling fallback.
   * If direct SKU has no ASIN with image, tries siblings.
   */
  const asinFromSkuWithFallback = (sku: string): string | null => {
    const directAsin = skuToAsin[sku]
    if (directAsin && imageMap[directAsin]?.image_url) return directAsin

    const prefix = skuPrefix(sku)
    if (!prefix) return directAsin || null
    for (const [otherSku, otherAsin] of Object.entries(skuToAsin)) {
      if (otherSku === sku) continue
      if (otherSku.startsWith(prefix)) {
        const info = imageMap[otherAsin]
        if (info?.image_url) return otherAsin
      }
    }
    return directAsin || null
  }

  return { imageMap, skuToAsin, loaded, getByAsin, getBySku, asinFromSku, getBySkuWithFallback, asinFromSkuWithFallback }
}
