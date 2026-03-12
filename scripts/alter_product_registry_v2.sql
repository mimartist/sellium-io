-- Product Registry v2 — Add extra columns from Rainforest API
-- Run this in Supabase SQL Editor

-- Currency (EUR, USD, GBP etc.)
ALTER TABLE product_registry ADD COLUMN IF NOT EXISTS currency TEXT;

-- Parent ASIN (for variant grouping)
ALTER TABLE product_registry ADD COLUMN IF NOT EXISTS parent_asin TEXT;

-- Bestseller Rank (main category)
ALTER TABLE product_registry ADD COLUMN IF NOT EXISTS bestseller_rank INTEGER;

-- BSR Category name
ALTER TABLE product_registry ADD COLUMN IF NOT EXISTS bestseller_category TEXT;

-- Amazon product link
ALTER TABLE product_registry ADD COLUMN IF NOT EXISTS amazon_url TEXT;

-- Variant count
ALTER TABLE product_registry ADD COLUMN IF NOT EXISTS variant_count INTEGER;

-- Stock level from buybox
ALTER TABLE product_registry ADD COLUMN IF NOT EXISTS stock_level INTEGER;

-- Index for parent_asin lookups (useful for competitor/variant analysis)
CREATE INDEX IF NOT EXISTS idx_product_registry_parent_asin ON product_registry(parent_asin);
