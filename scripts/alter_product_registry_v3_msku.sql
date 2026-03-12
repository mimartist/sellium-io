-- Product Registry v3 — Add MSKU column
-- Run this in Supabase SQL Editor

ALTER TABLE product_registry ADD COLUMN IF NOT EXISTS msku TEXT;
