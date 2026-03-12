const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://gpnoktpelhsmbkechqyf.supabase.co',
  'sb_publishable_CShNPE1jWqMaaHMrwipysg_sOZ4LeD1'
);

const FILES = [
  "G:/Drive'ım/Mimosso/Amazon/SKU/2025-08.csv",
  "G:/Drive'ım/Mimosso/Amazon/SKU/2025-09.csv",
  "G:/Drive'ım/Mimosso/Amazon/SKU/2025-10.csv",
];

// Parse CSV with proper handling of commas inside parentheses in headers
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  // Remove BOM
  if (lines[0].charCodeAt(0) === 0xFEFF) lines[0] = lines[0].slice(1);
  const headers = lines[0].split(',');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',');
    const row = {};
    headers.forEach((h, j) => row[h.trim()] = (vals[j] || '').trim());
    rows.push(row);
  }
  return rows;
}

function parseDate(mmddyyyy) {
  // MM/DD/YYYY → YYYY-MM-DD
  const [m, d, y] = mmddyyyy.split('/');
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

function num(v) {
  if (!v || v === '') return 0;
  return parseFloat(v) || 0;
}

function mapRow(r) {
  const startDate = parseDate(r['Başlangıç tarihi']);
  const endDate = parseDate(r['Bitiş tarihi']);
  const reportMonth = startDate.slice(0, 7); // YYYY-MM

  const unitsSold = num(r['Satış komisyonu adet']);
  const fbaCount = num(r['Amazon Lojistik ücretleri adet']);

  // Use commission count as units_sold (each sale triggers a commission)
  // units_net = units_sold (no returns data in this report)
  const unitsNet = unitsSold;

  const fbaFees = num(r['Toplam Amazon Lojistik ücretleri']);
  const fbaBase = num(r['Toplam Taban lojistik ücreti']);
  const sellingCommission = num(r['Toplam Satış komisyonu']);
  const commissionRefunds = num(r['Toplam Satış Komisyonu Para İadeleri']);
  const monthlyStorage = num(r['Toplam Aylık envanter depolama ücreti']);
  const storageSurcharge = num(r['Toplam Depolama kullanımı ek ücreti']);
  const digitalServicesFba = num(r['Toplam Dijital hizmetler ücreti (Amazon Lojistik ücretleri)']);
  const digitalServicesSelling = num(r['Toplam Dijital hizmetler ücreti (Amazon\'da satış ücretleri)']);
  const returnManagement = num(r['Toplam İade yönetimi ücreti']);
  const spAdSpend = num(r['Toplam Sponsored Products ücreti']);
  const inventoryReimbursement = num(r['Toplam Amazon Lojistik Envanter Geri Ödemesi']);

  // total_fees = all fees except sp_ad_spend (matching July pattern)
  const totalFees = fbaFees + sellingCommission + commissionRefunds + monthlyStorage
    + storageSurcharge + digitalServicesFba + digitalServicesSelling + returnManagement;

  // COGS and other_cost: CSV has per-unit, DB stores total
  const cogsPerUnit = num(r['Birim başına Satılan ürünlerin maliyeti']);
  const otherCostPerUnit = num(r['Birim başına Diğer maliyet']);
  const cogs = cogsPerUnit * unitsNet;
  const otherCost = otherCostPerUnit * unitsNet;

  return {
    marketplace: r['Amazon mağazası'],
    report_month: reportMonth,
    start_date: startDate,
    end_date: endDate,
    parent_asin: r['Ana ürün ASIN\'i'] || null,
    asin: r['ASIN'] || null,
    fnsku: r['FNSKU'] || null,
    msku: r['MSKU'] || null,
    currency: r['Para birimi kodu'] || 'EUR',
    avg_sale_price: 0,
    units_sold: unitsSold,
    units_returned: 0,
    units_net: unitsNet,
    sales: 0,
    net_sales: 0,
    fba_fees: fbaFees,
    fba_base: fbaBase,
    fba_low_inventory: 0,
    fba_oversize: 0,
    selling_commission: sellingCommission,
    commission_refunds: commissionRefunds,
    monthly_storage: monthlyStorage,
    storage_surcharge: storageSurcharge,
    aged_inventory: 0,
    return_management: returnManagement,
    digital_services_fba: digitalServicesFba,
    digital_services_selling: digitalServicesSelling,
    sp_ad_spend: spAdSpend,
    total_fees: totalFees,
    inventory_reimbursement: inventoryReimbursement,
    cogs: cogs,
    other_cost: otherCost,
    net_profit: num(r['Toplam Net kazanç']),
    net_profit_per_unit: num(r['Satılan net birim başına net kazanç']),
  };
}

async function main() {
  for (const file of FILES) {
    console.log(`\n=== Processing: ${file} ===`);
    const text = fs.readFileSync(file, 'utf-8');
    const rows = parseCSV(text);
    console.log(`Parsed ${rows.length} rows`);

    const mapped = rows.map(mapRow);
    const month = mapped[0]?.report_month;
    console.log(`Report month: ${month}`);

    // Check if data already exists for this month
    const { count } = await sb.from('sku_economics')
      .select('id', { count: 'exact', head: true })
      .eq('report_month', month);

    if (count > 0) {
      console.log(`WARNING: ${count} rows already exist for ${month}. Deleting first...`);
      const { error: delErr } = await sb.from('sku_economics').delete().eq('report_month', month);
      if (delErr) { console.error('Delete error:', delErr); return; }
      console.log('Deleted existing rows.');
    }

    // Insert in batches of 100
    const BATCH = 100;
    let inserted = 0;
    for (let i = 0; i < mapped.length; i += BATCH) {
      const batch = mapped.slice(i, i + BATCH);
      const { error } = await sb.from('sku_economics').insert(batch);
      if (error) {
        console.error(`Error at batch ${i}:`, error);
        return;
      }
      inserted += batch.length;
      process.stdout.write(`  Inserted ${inserted}/${mapped.length}\r`);
    }
    console.log(`\nDone: ${inserted} rows inserted for ${month}`);
  }
}

main().catch(console.error);
