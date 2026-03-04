-- ============================================================
-- SELLIUM.IO - TUM TABLOLAR ICIN DUPLICATE TEMIZLEME
-- Supabase SQL Editor'de calistirin
-- ============================================================
-- ADIM 1: Once kac duplicate var kontrol et (SADECE OKUMA)
-- ADIM 2: Duplicate'leri sil (en yuksek id kalir)
-- ADIM 3: UNIQUE index ekle (gelecekte duplicate onleme)
-- ============================================================


-- ************************************************************
-- ADIM 1: DUPLICATE SAYILARINI KONTROL ET (once bunu calistir)
-- ************************************************************

-- 1a. amazon_ads duplicate sayisi
SELECT 'amazon_ads' AS tablo,
  COUNT(*) AS toplam_satir,
  COUNT(*) - COUNT(DISTINCT (date, campaign_name, report_type)) AS duplicate_sayisi
FROM amazon_ads;

-- 1b. ad_product_performance duplicate sayisi
SELECT 'ad_product_performance' AS tablo,
  COUNT(*) AS toplam_satir,
  COUNT(*) - COUNT(DISTINCT (date, sku, campaign_name, ad_group)) AS duplicate_sayisi
FROM ad_product_performance;

-- 1c. ad_search_terms duplicate sayisi
SELECT 'ad_search_terms' AS tablo,
  COUNT(*) AS toplam_satir,
  COUNT(*) - COUNT(DISTINCT (date, campaign_name, ad_group, search_term)) AS duplicate_sayisi
FROM ad_search_terms;

-- 1d. ad_brand_performance duplicate sayisi
SELECT 'ad_brand_performance' AS tablo,
  COUNT(*) AS toplam_satir,
  COUNT(*) - COUNT(DISTINCT (date, campaign_name, keyword)) AS duplicate_sayisi
FROM ad_brand_performance;

-- 1e. amazon_sales duplicate sayisi (tum sutunlar except id, created_at)
SELECT 'amazon_sales' AS tablo,
  (SELECT COUNT(*) FROM amazon_sales) AS toplam_satir,
  (SELECT COUNT(*) FROM amazon_sales) -
  (SELECT COUNT(*) FROM (
    SELECT DISTINCT ON (date, sku, asin, marketplace) id FROM amazon_sales ORDER BY date, sku, asin, marketplace, id DESC
  ) t) AS duplicate_sayisi;

-- 1f. amazon_inventory duplicate sayisi
SELECT 'amazon_inventory' AS tablo,
  (SELECT COUNT(*) FROM amazon_inventory) AS toplam_satir,
  (SELECT COUNT(*) FROM amazon_inventory) -
  (SELECT COUNT(*) FROM (
    SELECT DISTINCT ON (sku, asin) id FROM amazon_inventory ORDER BY sku, asin, id DESC
  ) t) AS duplicate_sayisi;


-- ************************************************************
-- ADIM 2: DUPLICATE'LERI SIL (en yuksek id'yi tutar)
-- Her blogu tek tek calistirin!
-- ************************************************************

-- 2a. amazon_ads — dedup key: date + campaign_name + report_type
DELETE FROM amazon_ads
WHERE id NOT IN (
  SELECT MAX(id)
  FROM amazon_ads
  GROUP BY date, campaign_name, report_type
);
-- Kac satir silindi:
-- SELECT 'amazon_ads temizlendi' AS sonuc;

-- 2b. ad_product_performance — dedup key: date + sku + campaign_name + ad_group
DELETE FROM ad_product_performance
WHERE id NOT IN (
  SELECT MAX(id)
  FROM ad_product_performance
  GROUP BY date, sku, campaign_name, ad_group
);

-- 2c. ad_search_terms — dedup key: date + campaign_name + ad_group + search_term
DELETE FROM ad_search_terms
WHERE id NOT IN (
  SELECT MAX(id)
  FROM ad_search_terms
  GROUP BY date, campaign_name, ad_group, search_term
);

-- 2d. ad_brand_performance — dedup key: date + campaign_name + keyword
DELETE FROM ad_brand_performance
WHERE id NOT IN (
  SELECT MAX(id)
  FROM ad_brand_performance
  GROUP BY date, campaign_name, keyword
);


-- ************************************************************
-- ADIM 3: UNIQUE INDEX EKLE (gelecekte duplicate engelleme)
-- Bu sayede n8n INSERT yaptiginda duplicate otomatik reddedilir
-- veya ON CONFLICT ile UPSERT yapilabilir
-- ************************************************************

-- 3a. amazon_ads
CREATE UNIQUE INDEX IF NOT EXISTS uq_amazon_ads_dedup
ON amazon_ads (date, campaign_name, report_type);

-- 3b. ad_product_performance
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_product_performance_dedup
ON ad_product_performance (date, sku, campaign_name, ad_group);

-- 3c. ad_search_terms
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_search_terms_dedup
ON ad_search_terms (date, campaign_name, ad_group, search_term);

-- 3d. ad_brand_performance
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_brand_performance_dedup
ON ad_brand_performance (date, campaign_name, keyword);


-- ************************************************************
-- ADIM 4: DIGER TABLOLAR ICIN GENEL TEMIZLIK FONKSIYONU
-- Tum sutunlari (id ve created_at haric) kontrol eder
-- ************************************************************

CREATE OR REPLACE FUNCTION dedup_table_all_columns(p_table text, p_id_col text DEFAULT 'id')
RETURNS integer AS $$
DECLARE
  cols text;
  del_count integer;
BEGIN
  -- id ve created_at haric tum sutunlari al
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = p_table
    AND column_name NOT IN (p_id_col, 'created_at');

  IF cols IS NULL THEN
    RAISE EXCEPTION 'Tablo bulunamadi: %', p_table;
  END IF;

  -- Duplicate satirlari sil (en yuksek id kalir)
  EXECUTE format(
    'DELETE FROM %I WHERE %I NOT IN (SELECT MAX(%I) FROM %I GROUP BY %s)',
    p_table, p_id_col, p_id_col, p_table, cols
  );

  GET DIAGNOSTICS del_count = ROW_COUNT;
  RAISE NOTICE '% tablosundan % duplicate satir silindi.', p_table, del_count;
  RETURN del_count;
END;
$$ LANGUAGE plpgsql;

-- Diger tablolari temizle (gerekirse calistirin):
-- SELECT dedup_table_all_columns('amazon_sales');
-- SELECT dedup_table_all_columns('shopify_sales');
-- SELECT dedup_table_all_columns('amazon_inventory');
-- SELECT dedup_table_all_columns('products');
-- SELECT dedup_table_all_columns('product_costs');
-- SELECT dedup_table_all_columns('ai_insights');
-- SELECT dedup_table_all_columns('profitability_reports');


-- ************************************************************
-- BONUS: Tum tablolari tek seferde temizle
-- ************************************************************
DO $$
DECLARE
  tbl text;
  cnt integer;
  tables text[] := ARRAY[
    'amazon_sales', 'shopify_sales', 'amazon_inventory',
    'products', 'product_costs', 'ai_insights', 'profitability_reports'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    BEGIN
      cnt := dedup_table_all_columns(tbl);
      RAISE NOTICE '% → % duplicate silindi', tbl, cnt;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '% → hata: %', tbl, SQLERRM;
    END;
  END LOOP;
END $$;
