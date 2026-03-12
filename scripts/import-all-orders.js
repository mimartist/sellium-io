const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://gpnoktpelhsmbkechqyf.supabase.co', 'sb_publishable_CShNPE1jWqMaaHMrwipysg_sOZ4LeD1');

const FILES = [
  "G:/Drive'ım/Mimosso/Amazon/All_Orders/2025-05.txt",
  "G:/Drive'ım/Mimosso/Amazon/All_Orders/2025-06.txt",
  "G:/Drive'ım/Mimosso/Amazon/All_Orders/2025-11.txt",
];

function parseTSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  // Remove BOM
  if (lines[0].charCodeAt(0) === 0xFEFF) lines[0] = lines[0].slice(1);
  const headers = lines[0].split('\t').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split('\t');
    const row = {};
    headers.forEach((h, j) => row[h] = (vals[j] || '').trim());
    rows.push(row);
  }
  return rows;
}

function num(v) {
  if (!v || v === '') return 0;
  return parseFloat(v) || 0;
}

function mapRow(r) {
  const purchaseDate = r['purchase-date'] || '';
  const purchaseDay = purchaseDate.slice(0, 10); // YYYY-MM-DD from ISO
  const reportMonth = purchaseDay.slice(0, 7); // YYYY-MM

  return {
    amazon_order_id: r['amazon-order-id'],
    purchase_date: purchaseDate,
    purchase_day: purchaseDay,
    report_month: reportMonth,
    order_status: r['order-status'] || 'Shipped',
    fulfillment_channel: r['fulfillment-channel'] || 'Amazon',
    marketplace: r['sales-channel'] || null, // Already "Amazon.de" format
    sku: r['sku'] || null,
    asin: r['asin'] || null,
    product_name: r['product-name'] || null,
    quantity: parseInt(r['quantity']) || 1,
    currency: r['currency'] || 'EUR',
    item_price: num(r['item-price']),
    item_tax: num(r['item-tax']),
    shipping_price: num(r['shipping-price']),
    shipping_tax: num(r['shipping-tax']),
    giftwrap_price: num(r['gift-wrap-price']),
    giftwrap_tax: num(r['gift-wrap-tax']),
    item_promo_discount: num(r['item-promotion-discount']),
    ship_promo_discount: num(r['ship-promotion-discount']),
    ship_country: r['ship-country'] || null,
    ship_city: r['ship-city'] || null,
    ship_postal_code: r['ship-postal-code'] || null,
  };
}

async function main() {
  for (const file of FILES) {
    console.log(`\n=== Processing: ${file} ===`);
    const text = fs.readFileSync(file, 'utf-8');
    const rows = parseTSV(text);
    console.log(`Parsed ${rows.length} rows`);

    // Filter only Shipped orders (view needs order_status = 'Shipped')
    const rawMapped = rows.filter(r => r['order-status'] === 'Shipped').map(mapRow);
    // Deduplicate by (amazon_order_id, sku) - aggregate quantity and prices
    const dedupMap = {};
    rawMapped.forEach(r => {
      const key = `${r.amazon_order_id}|${r.sku}`;
      if (!dedupMap[key]) {
        dedupMap[key] = { ...r };
      } else {
        dedupMap[key].quantity += r.quantity;
        dedupMap[key].item_price += r.item_price;
        dedupMap[key].item_tax += r.item_tax;
        dedupMap[key].shipping_price += r.shipping_price;
        dedupMap[key].item_promo_discount += r.item_promo_discount;
      }
    });
    const mapped = Object.values(dedupMap);
    console.log(`${rawMapped.length} Shipped orders → ${mapped.length} after dedup`);

    if (mapped.length === 0) continue;

    const month = mapped[0]?.report_month;
    console.log(`Report month: ${month}`);

    // Summary
    const units = mapped.reduce((s, r) => s + r.quantity, 0);
    const sales = mapped.reduce((s, r) => s + r.item_price, 0);
    const mps = {};
    mapped.forEach(r => {
      if (!mps[r.marketplace]) mps[r.marketplace] = 0;
      mps[r.marketplace]++;
    });
    console.log(`Units: ${units}, Sales: ${sales.toFixed(2)} EUR`);
    console.log('Marketplaces:', Object.entries(mps).map(([k, v]) => `${k}(${v})`).join(', '));

    // Upsert in batches (handles duplicates via unique constraint on amazon_order_id + sku)
    for (let i = 0; i < mapped.length; i += 100) {
      const batch = mapped.slice(i, i + 100);
      const { error } = await sb.from('all_orders').upsert(batch, {
        onConflict: 'amazon_order_id,sku',
        ignoreDuplicates: false,
      });
      if (error) {
        console.error(`Error at batch ${i}:`, error);
        console.error('First row:', JSON.stringify(batch[0], null, 2));
        return;
      }
      process.stdout.write(`  Upserted ${Math.min(i + 100, mapped.length)}/${mapped.length}\r`);
    }
    console.log(`\nDone: ${mapped.length} rows inserted for ${month}`);
  }

  // Verify views
  console.log('\n=== Verifying monthly_pl view ===');
  for (const month of ['2025-05', '2025-06', '2025-11']) {
    const { data } = await sb.from('monthly_pl')
      .select('marketplace,units,sales,net_profit')
      .eq('report_month', month);
    if (data && data.length > 0) {
      const u = data.reduce((s, x) => s + (x.units || 0), 0);
      const s = data.reduce((s, x) => s + (x.sales || 0), 0);
      const p = data.reduce((s, x) => s + (x.net_profit || 0), 0);
      console.log(`  ${month}: ${data.length} marketplaces, ${u} units, ${s.toFixed(0)} EUR sales, ${p.toFixed(0)} EUR profit`);
    } else {
      console.log(`  ${month}: no data yet`);
    }
  }
}

main().catch(console.error);
