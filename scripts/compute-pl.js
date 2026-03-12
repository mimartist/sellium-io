const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://gpnoktpelhsmbkechqyf.supabase.co', 'sb_publishable_CShNPE1jWqMaaHMrwipysg_sOZ4LeD1');

// ── Helpers ──
function capitalize(mp) {
  if (!mp) return null;
  // amazon.de → Amazon.de, amazon.co.uk → Amazon.co.uk, amazon.com.be → Amazon.com.be
  return mp.charAt(0).toUpperCase() + mp.slice(1);
}

function extractSkuPrefix(sku) {
  if (!sku) return null;
  const m = sku.match(/^(MMS\d+)/i);
  return m ? m[1].toUpperCase() : null;
}

function round2(n) { return Math.round(n * 100) / 100; }

// ── Load all data ──
async function loadAll() {
  console.log('Loading transactions...');
  let transactions = [];
  let from = 0;
  while (true) {
    const { data } = await sb.from('transactions')
      .select('date,report_month,transaction_category,marketplace,sku,quantity,product_sales_eur,promotional_rebates_original,selling_fees_eur,fba_fees_eur,other_transaction_fees_eur,other_eur,total_eur')
      .range(from, from + 999);
    if (!data || !data.length) break;
    transactions = transactions.concat(data);
    from += 1000;
    if (data.length < 1000) break;
  }
  console.log(`  ${transactions.length} transactions loaded`);

  console.log('Loading sku_cogs...');
  const { data: cogs } = await sb.from('sku_cogs').select('sku_prefix,pack_cost_eur,other_cost_eur');
  const cogsMap = {};
  cogs.forEach(c => { cogsMap[c.sku_prefix] = (c.pack_cost_eur || 0) + (c.other_cost_eur || 0); });
  console.log(`  ${cogs.length} COGS entries`);

  console.log('Loading ad spend...');
  let spSpend = {};
  from = 0;
  while (true) {
    const { data } = await sb.from('ad_product_performance').select('report_month,spend,country').range(from, from + 999);
    if (!data || !data.length) break;
    data.forEach(x => {
      const key = x.report_month;
      if (!spSpend[key]) spSpend[key] = 0;
      spSpend[key] += x.spend || 0;
    });
    from += 1000;
    if (data.length < 1000) break;
  }

  let sbSpend = {};
  from = 0;
  while (true) {
    const { data } = await sb.from('ad_brand_performance').select('report_month,spend').range(from, from + 999);
    if (!data || !data.length) break;
    data.forEach(x => {
      if (!sbSpend[x.report_month]) sbSpend[x.report_month] = 0;
      sbSpend[x.report_month] += x.spend || 0;
    });
    from += 1000;
    if (data.length < 1000) break;
  }
  console.log(`  SP months: ${Object.keys(spSpend)}, SB months: ${Object.keys(sbSpend)}`);

  return { transactions, cogsMap, spSpend, sbSpend };
}

// ── Compute monthly_pl ──
function computeMonthlyPL(transactions, cogsMap, spSpend, sbSpend) {
  // Group by month + marketplace
  const groups = {};
  transactions.forEach(t => {
    const month = t.report_month;
    if (!month) return;
    const mp = t.marketplace ? capitalize(t.marketplace) : null;
    const cat = t.transaction_category;

    // For service_fee/storage without marketplace, bucket them separately
    const key = `${month}|${mp || '__NONE__'}`;
    if (!groups[key]) groups[key] = {
      month, marketplace: mp,
      units: 0, sales: 0, promo: 0,
      commission: 0, fba: 0, storage: 0,
      return_mgmt: 0, digital_fees: 0,
      refunds: 0, cogs: 0,
    };
    const g = groups[key];

    if (cat === 'order') {
      g.units += t.quantity || 0;
      g.sales += t.product_sales_eur || 0;
      g.promo += Math.abs(t.promotional_rebates_original || 0);
      g.commission += Math.abs(t.selling_fees_eur || 0);
      g.fba += Math.abs(t.fba_fees_eur || 0);
      // COGS
      const prefix = extractSkuPrefix(t.sku);
      if (prefix && cogsMap[prefix]) {
        g.cogs += cogsMap[prefix] * (t.quantity || 0);
      }
    } else if (cat === 'refund') {
      g.refunds += Math.abs(t.product_sales_eur || 0);
      // Commission refund (positive selling_fees on refund) reduces commission
      // But we track refunds separately, commission refund is already net
    } else if (cat === 'storage_fee') {
      g.storage += Math.abs(t.other_eur || 0);
    } else if (cat === 'return_fee') {
      g.return_mgmt += Math.abs(t.total_eur || 0);
    } else if (cat === 'service_fee') {
      g.digital_fees += Math.abs(t.other_transaction_fees_eur || 0) + Math.abs(t.other_eur || 0);
    }
  });

  // Distribute __NONE__ marketplace fees (service_fee, some storage) to Amazon.de
  const months = [...new Set(Object.values(groups).map(g => g.month))].sort();
  months.forEach(month => {
    const noneKey = `${month}|__NONE__`;
    if (groups[noneKey]) {
      const deKey = `${month}|Amazon.de`;
      if (!groups[deKey]) groups[deKey] = {
        month, marketplace: 'Amazon.de',
        units: 0, sales: 0, promo: 0, commission: 0, fba: 0,
        storage: 0, return_mgmt: 0, digital_fees: 0, refunds: 0, cogs: 0,
      };
      // Add none fees to Amazon.de
      groups[deKey].storage += groups[noneKey].storage;
      groups[deKey].digital_fees += groups[noneKey].digital_fees;
      groups[deKey].return_mgmt += groups[noneKey].return_mgmt;
      delete groups[noneKey];
    }
  });

  // Build monthly_pl rows
  const results = [];
  for (const g of Object.values(groups)) {
    if (!g.marketplace) continue;
    const totalSales = g.sales;
    // Get marketplace share for subscription distribution
    const monthGroups = Object.values(groups).filter(x => x.month === g.month && x.marketplace);
    const totalMonthSales = monthGroups.reduce((s, x) => s + x.sales, 0);
    const salesShare = totalMonthSales > 0 ? g.sales / totalMonthSales : 0;

    const subscription = round2(39.99 * salesShare);
    const sp = round2((spSpend[g.month] || 0) * salesShare);
    const sb = round2((sbSpend[g.month] || 0) * salesShare);
    const totalAdSpend = round2(sp + sb);

    // total_fees = commission + fba + storage + return_mgmt + digital_fees
    const totalFees = round2(g.commission + g.fba + g.storage + g.return_mgmt + g.digital_fees);

    const netProfit = round2(g.sales - g.commission - g.fba - g.storage - g.return_mgmt -
      g.digital_fees - g.cogs - g.refunds - subscription - sp - sb);
    const marginPct = totalSales > 0 ? round2(netProfit / totalSales * 100) : 0;

    results.push({
      report_month: g.month,
      marketplace: g.marketplace,
      units: g.units,
      sales: round2(g.sales),
      promo: round2(g.promo),
      commission: round2(g.commission),
      fba: round2(g.fba),
      storage: round2(g.storage),
      return_mgmt: round2(g.return_mgmt),
      digital_fba: round2(g.digital_fees * 0.6), // approximate split
      digital_sell: round2(g.digital_fees * 0.4),
      total_fees: totalFees,
      cogs: round2(g.cogs),
      refunds: round2(g.refunds),
      subscription: subscription,
      sp_spend: sp,
      sb_spend: sb,
      total_ad_spend: totalAdSpend,
      net_profit: netProfit,
      margin_pct: marginPct,
    });
  }
  return results;
}

// ── Compute daily_pl ──
function computeDailyPL(transactions, cogsMap, spSpend, sbSpend) {
  // Group by date + marketplace + sku
  const groups = {};
  transactions.forEach(t => {
    if (!t.date || !t.report_month) return;
    const mp = t.marketplace ? capitalize(t.marketplace) : null;
    const cat = t.transaction_category;

    if (cat === 'order') {
      const key = `${t.date}|${mp}|${t.sku}`;
      if (!groups[key]) groups[key] = {
        purchase_day: t.date,
        report_month: t.report_month,
        marketplace: mp,
        sku: t.sku,
        units: 0, sales: 0, promo: 0,
        commission: 0, fba: 0, cogs: 0,
      };
      const g = groups[key];
      g.units += t.quantity || 0;
      g.sales += t.product_sales_eur || 0;
      g.promo += Math.abs(t.promotional_rebates_original || 0);
      g.commission += Math.abs(t.selling_fees_eur || 0);
      g.fba += Math.abs(t.fba_fees_eur || 0);
      const prefix = extractSkuPrefix(t.sku);
      if (prefix && cogsMap[prefix]) {
        g.cogs += cogsMap[prefix] * (t.quantity || 0);
      }
    }
  });

  // Compute daily totals for storage/refund/service distribution
  const dailyTotals = {}; // month → total sales for subscription calc
  Object.values(groups).forEach(g => {
    if (!dailyTotals[g.report_month]) dailyTotals[g.report_month] = { totalSales: 0, days: new Set() };
    dailyTotals[g.report_month].totalSales += g.sales;
    dailyTotals[g.report_month].days.add(g.purchase_day);
  });

  // Get storage/refund/service per month for estimation
  const monthFees = {};
  transactions.forEach(t => {
    if (!t.report_month) return;
    if (!monthFees[t.report_month]) monthFees[t.report_month] = { storage: 0, return_mgmt: 0, digital: 0, refunds: 0 };
    const mf = monthFees[t.report_month];
    if (t.transaction_category === 'storage_fee') mf.storage += Math.abs(t.other_eur || 0);
    else if (t.transaction_category === 'return_fee') mf.return_mgmt += Math.abs(t.total_eur || 0);
    else if (t.transaction_category === 'service_fee') mf.digital += Math.abs(t.other_transaction_fees_eur || 0) + Math.abs(t.other_eur || 0);
    else if (t.transaction_category === 'refund') mf.refunds += Math.abs(t.product_sales_eur || 0);
  });

  // Build daily_pl rows
  const results = [];
  for (const g of Object.values(groups)) {
    if (!g.marketplace || !g.sku) continue;
    const month = g.report_month;
    const totalMonthSales = dailyTotals[month]?.totalSales || 1;
    const salesShare = g.sales / totalMonthSales;
    const mf = monthFees[month] || { storage: 0, return_mgmt: 0, digital: 0, refunds: 0 };

    const commPerUnit = g.units > 0 ? round2(g.commission / g.units) : 0;
    const fbaPerUnit = g.units > 0 ? round2(g.fba / g.units) : 0;
    const estStorage = round2(mf.storage * salesShare);
    const estRefunds = round2(mf.refunds * salesShare);
    const estReturnMgmt = round2(mf.return_mgmt * salesShare);
    const subscription = round2(39.99 * salesShare);
    const sp = round2((spSpend[month] || 0) * salesShare);
    const sb = round2((sbSpend[month] || 0) * salesShare);

    const estNetProfit = round2(g.sales - g.commission - g.fba - estStorage -
      estReturnMgmt - round2(mf.digital * salesShare) - g.cogs - estRefunds - subscription - sp - sb);

    results.push({
      purchase_day: g.purchase_day,
      report_month: month,
      marketplace: g.marketplace,
      sku: g.sku,
      asin: null, // Will be filled from sku_economics mapping
      units: g.units,
      sales: round2(g.sales),
      promo: round2(g.promo),
      commission_per_unit: commPerUnit,
      fba_per_unit: fbaPerUnit,
      return_mgmt_per_unit: g.units > 0 ? round2(estReturnMgmt / g.units) : 0,
      digital_fba_per_unit: 0,
      digital_sell_per_unit: 0,
      est_commission: round2(g.commission),
      est_fba: round2(g.fba),
      est_return_mgmt: estReturnMgmt,
      est_digital_fba: 0,
      est_digital_sell: 0,
      est_storage: estStorage,
      est_cogs: round2(g.cogs),
      est_refunds: estRefunds,
      est_subscription: subscription,
      refund_source: 'settlement',
      sp_spend: sp,
      sp_attributed_sales: 0,
      sp_clicks: 0,
      sb_spend: sb,
      sb_attributed_sales: 0,
      total_ad_spend: round2(sp + sb),
      est_net_profit: estNetProfit,
    });
  }
  return results;
}

// ── ASIN mapping from sku_economics ──
async function loadAsinMap() {
  let map = {};
  let from = 0;
  while (true) {
    const { data } = await sb.from('sku_economics').select('asin,msku').range(from, from + 999);
    if (!data || !data.length) break;
    data.forEach(x => {
      if (x.msku && x.asin) {
        // msku in sku_economics is full MSKU like "amzn.gr.MMS2450S-..."
        // Extract SKU prefix+size from it
        const m = x.msku.match(/\b(MMS\d+\w*)/i);
        if (m) map[m[1].toUpperCase()] = x.asin;
      }
    });
    from += 1000;
    if (data.length < 1000) break;
  }
  console.log(`  ASIN map: ${Object.keys(map).length} entries`);
  return map;
}

// ── Main ──
async function main() {
  const MODE = process.argv[2] || 'verify'; // 'verify' or 'insert'

  const { transactions, cogsMap, spSpend, sbSpend } = await loadAll();

  // Compute monthly_pl
  console.log('\n=== Computing monthly_pl ===');
  const monthlyRows = computeMonthlyPL(transactions, cogsMap, spSpend, sbSpend);
  const monthlyByMonth = {};
  monthlyRows.forEach(r => {
    if (!monthlyByMonth[r.report_month]) monthlyByMonth[r.report_month] = [];
    monthlyByMonth[r.report_month].push(r);
  });
  console.log('Months computed:', Object.keys(monthlyByMonth).sort().join(', '));

  if (MODE === 'verify') {
    // Compare April 2025 with existing
    console.log('\n=== Verification: April 2025 Amazon.de ===');
    const computed = monthlyRows.find(r => r.report_month === '2025-04' && r.marketplace === 'Amazon.de');
    const { data: existing } = await sb.from('monthly_pl').select('*')
      .eq('report_month', '2025-04').eq('marketplace', 'Amazon.de').single();
    if (computed && existing) {
      const fields = ['units', 'sales', 'commission', 'fba', 'storage', 'cogs', 'refunds', 'subscription', 'net_profit', 'margin_pct'];
      console.log('Field'.padEnd(15), 'Computed'.padStart(12), 'Existing'.padStart(12), 'Diff'.padStart(10));
      fields.forEach(f => {
        const c = computed[f] || 0;
        const e = existing[f] || 0;
        const diff = round2(c - e);
        console.log(f.padEnd(15), String(c).padStart(12), String(e).padStart(12), String(diff).padStart(10));
      });
    }

    // Also check Jan 2025
    console.log('\n=== Verification: Jan 2025 Amazon.de ===');
    const compJan = monthlyRows.find(r => r.report_month === '2025-01' && r.marketplace === 'Amazon.de');
    const { data: exJan } = await sb.from('monthly_pl').select('*')
      .eq('report_month', '2025-01').eq('marketplace', 'Amazon.de').single();
    if (compJan && exJan) {
      const fields = ['units', 'sales', 'commission', 'fba', 'storage', 'cogs', 'refunds', 'subscription', 'net_profit'];
      console.log('Field'.padEnd(15), 'Computed'.padStart(12), 'Existing'.padStart(12), 'Diff'.padStart(10));
      fields.forEach(f => {
        const c = compJan[f] || 0;
        const e = exJan[f] || 0;
        const diff = round2(c - e);
        console.log(f.padEnd(15), String(c).padStart(12), String(e).padStart(12), String(diff).padStart(10));
      });
    }
    return;
  }

  if (MODE === 'insert') {
    // Check which months already exist
    let existingMonthlyMonths = new Set();
    let existingDailyMonths = new Set();
    let from2 = 0;
    while (true) {
      const { data } = await sb.from('monthly_pl').select('report_month').range(from2, from2 + 999);
      if (!data || !data.length) break;
      data.forEach(x => existingMonthlyMonths.add(x.report_month));
      from2 += 1000;
      if (data.length < 1000) break;
    }
    from2 = 0;
    while (true) {
      const { data } = await sb.from('daily_pl').select('report_month').range(from2, from2 + 999);
      if (!data || !data.length) break;
      data.forEach(x => existingDailyMonths.add(x.report_month));
      from2 += 1000;
      if (data.length < 1000) break;
    }
    console.log('Existing monthly_pl months:', [...existingMonthlyMonths].sort().join(', '));
    console.log('Existing daily_pl months:', [...existingDailyMonths].sort().join(', '));

    // Filter to only missing months
    const missingMonthly = monthlyRows.filter(r => !existingMonthlyMonths.has(r.report_month));
    const missingMonthlyMonths = [...new Set(missingMonthly.map(r => r.report_month))].sort();
    console.log(`\nMissing monthly_pl months: ${missingMonthlyMonths.join(', ')} (${missingMonthly.length} rows)`);

    // Load ASIN map for daily_pl
    console.log('\nLoading ASIN map...');
    const asinMap = await loadAsinMap();

    // Compute daily_pl
    console.log('\n=== Computing daily_pl ===');
    const dailyRows = computeDailyPL(transactions, cogsMap, spSpend, sbSpend);
    dailyRows.forEach(r => {
      if (r.sku && asinMap[r.sku.toUpperCase()]) {
        r.asin = asinMap[r.sku.toUpperCase()];
      }
    });

    const missingDaily = dailyRows.filter(r => !existingDailyMonths.has(r.report_month));
    const missingDailyMonths = [...new Set(missingDaily.map(r => r.report_month))].sort();
    console.log(`Missing daily_pl months: ${missingDailyMonths.join(', ')} (${missingDaily.length} rows)`);

    // Insert missing monthly_pl
    if (missingMonthly.length > 0) {
      console.log('\n--- Inserting monthly_pl ---');
      for (let i = 0; i < missingMonthly.length; i += 100) {
        const batch = missingMonthly.slice(i, i + 100);
        const { error } = await sb.from('monthly_pl').insert(batch);
        if (error) { console.error('Insert monthly_pl error at', i, error); return; }
      }
      console.log(`Inserted ${missingMonthly.length} monthly_pl rows for: ${missingMonthlyMonths.join(', ')}`);
    } else {
      console.log('\nNo missing monthly_pl months.');
    }

    // Insert missing daily_pl
    if (missingDaily.length > 0) {
      console.log('\n--- Inserting daily_pl ---');
      for (let i = 0; i < missingDaily.length; i += 100) {
        const batch = missingDaily.slice(i, i + 100);
        const { error } = await sb.from('daily_pl').insert(batch);
        if (error) { console.error('Insert daily_pl error at', i, error); return; }
      }
      console.log(`Inserted ${missingDaily.length} daily_pl rows for: ${missingDailyMonths.join(', ')}`);
    } else {
      console.log('\nNo missing daily_pl months.');
    }

    console.log('\n=== DONE ===');
  }
}

main().catch(console.error);
