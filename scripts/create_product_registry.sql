-- Product Registry Table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS product_registry (
  id BIGSERIAL PRIMARY KEY,
  asin TEXT NOT NULL UNIQUE,
  parent_asin TEXT,
  title TEXT,
  brand TEXT,
  image_url TEXT,
  category TEXT,
  price NUMERIC(10,2),
  currency TEXT,
  rating NUMERIC(3,1),
  review_count INTEGER,
  bullet_points TEXT[],
  description TEXT,
  bestseller_rank INTEGER,
  bestseller_category TEXT,
  amazon_url TEXT,
  variant_count INTEGER,
  stock_level INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | fetching | active | error
  marketplace TEXT DEFAULT 'Amazon.de',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  fetched_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_registry_status ON product_registry(status);
CREATE INDEX IF NOT EXISTS idx_product_registry_asin ON product_registry(asin);
CREATE INDEX IF NOT EXISTS idx_product_registry_parent_asin ON product_registry(parent_asin);

-- Enable RLS (optional, disable if using anon key)
-- ALTER TABLE product_registry ENABLE ROW LEVEL SECURITY;
