const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://gpnoktpelhsmbkechqyf.supabase.co', 'sb_publishable_CShNPE1jWqMaaHMrwipysg_sOZ4LeD1');

function capitalize(mp) {
  if (!mp) return null;
  return mp.charAt(0).toUpperCase() + mp.slice(1);
}

async function loadAsinMap() {
  const map = {};
  // From product_registry (has msku → asin)
  let from = 0;
  while (true) {
    const { data } = await sb.from('product_registry').select('msku,asin,title').range(from, from + 999);
    if (!data || !data.length) break;
    data.forEach(x => {
      if (x.msku && x.asin) map[x.msku.toUpperCase()] = { asin: x.asin, title: x.title };
    });
    from += 1000;
    if (data.length < 1000) break;
  }
  // Fallback from sku_economics
  from = 0;
  while (true) {
    const { data } = await sb.from('sku_economics').select('msku,asin').range(from, from + 999);
    if (!data || !data.length) break;
    data.forEach(x => {
      if (x.msku && x.asin && !map[x.msku.toUpperCase()]) {
        map[x.msku.toUpperCase()] = { asin: x.asin, title: null };
      }
    });
    from += 1000;
    if (data.length < 1000) break;
  }
  return map;
}

async function main() {
  const MISSING_MONTHS = ['2025-05', '2025-06', '2025-11'];

  console.log('Loading ASIN map...');
  const asinMap = await loadAsinMap();
  console.log(`  ${Object.keys(asinMap).length} SKU→ASIN mappings`);

  // Load all order transactions for missing months
  console.log('\nLoading transactions...');
  let allTx = [];
  for (const month of MISSING_MONTHS) {
    let from = 0;
    while (true) {
      const { data } = await sb.from('transactions')
        .select('order_id,date,sku,description,quantity,marketplace,fulfilment,order_city,order_state,order_postal,country,currency,product_sales_eur,product_sales_tax_original,shipping_credits_original,shipping_credits_tax_original,giftwrap_credits_original,giftwrap_credits_tax_original,promotional_rebates_original,report_month')
        .eq('transaction_category', 'order')
        .eq('report_month', month)
        .range(from, from + 999);
      if (!data || !data.length) break;
      allTx = allTx.concat(data);
      from += 1000;
      if (data.length < 1000) break;
    }
  }
  console.log(`  ${allTx.length} order transactions loaded`);

  // Map to all_orders format
  const rows = allTx.map(t => {
    const sku = t.sku || '';
    const mapping = asinMap[sku.toUpperCase()] || {};

    return {
      amazon_order_id: t.order_id,
      purchase_date: t.date + 'T12:00:00+00:00', // approximate time
      purchase_day: t.date,
      report_month: t.report_month,
      order_status: 'Shipped',
      fulfillment_channel: t.fulfilment || 'Amazon',
      marketplace: capitalize(t.marketplace),
      sku: t.sku,
      asin: mapping.asin || null,
      product_name: t.description || mapping.title || null,
      quantity: t.quantity || 1,
      currency: t.currency || 'EUR',
      item_price: t.product_sales_eur || 0,
      item_tax: t.product_sales_tax_original || 0,
      shipping_price: t.shipping_credits_original || 0,
      shipping_tax: t.shipping_credits_tax_original || 0,
      giftwrap_price: t.giftwrap_credits_original || 0,
      giftwrap_tax: t.giftwrap_credits_tax_original || 0,
      item_promo_discount: Math.abs(t.promotional_rebates_original || 0),
      ship_promo_discount: 0,
      ship_country: t.country || null,
      ship_city: t.order_city || null,
      ship_postal_code: t.order_postal || null,
    };
  });

  console.log(`\nMapped ${rows.length} all_orders rows`);

  // Show summary per month
  const byMonth = {};
  rows.forEach(r => {
    if (!byMonth[r.report_month]) byMonth[r.report_month] = { count: 0, units: 0, sales: 0 };
    byMonth[r.report_month].count++;
    byMonth[r.report_month].units += r.quantity;
    byMonth[r.report_month].sales += r.item_price;
  });
  Object.entries(byMonth).sort().forEach(([m, v]) => {
    console.log(`  ${m}: ${v.count} orders, ${v.units} units, ${v.sales.toFixed(2)} EUR`);
  });

  // Insert
  console.log('\nInserting into all_orders...');
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await sb.from('all_orders').insert(batch);
    if (error) {
      console.error(`Error at batch ${i}:`, error);
      return;
    }
    process.stdout.write(`  ${Math.min(i + 100, rows.length)}/${rows.length}\r`);
  }
  console.log(`\nInserted ${rows.length} rows into all_orders`);

  // Verify views now show those months
  console.log('\nVerifying views...');
  for (const month of MISSING_MONTHS) {
    const { data, count } = await sb.from('monthly_pl')
      .select('marketplace,units,sales,net_profit', { count: 'exact' })
      .eq('report_month', month);
    if (data && data.length > 0) {
      const totalUnits = data.reduce((s, x) => s + (x.units || 0), 0);
      const totalSales = data.reduce((s, x) => s + (x.sales || 0), 0);
      const totalProfit = data.reduce((s, x) => s + (x.net_profit || 0), 0);
      console.log(`  ${month}: ${data.length} marketplaces, ${totalUnits} units, ${totalSales.toFixed(0)} EUR sales, ${totalProfit.toFixed(0)} EUR profit`);
    } else {
      console.log(`  ${month}: NO DATA in monthly_pl (view might need time)`);
    }
  }

  console.log('\n=== DONE ===');
}

main().catch(console.error);
