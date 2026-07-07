#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
//  Qor AI — pahalı ürünlerdeki AKSESUAR-fiyatı uyumsuzluklarını temizler.
//  Kök neden: refreshProductRollup her ülke için EN UCUZ teklifi fiyat yapıyordu;
//  Pixel 10 Pro (TR'de satılmıyor) TR aramasında bir kılıfı ₺199.98'e eşleyince
//  telefonun TR fiyatı ₺200 olmuştu. Bu script prices map'inde kategori tabanının
//  (scripts/lib/price_sanity.js) altında kalan ülke fiyatlarını siler ve
//  lowestPrice*'ı KALAN fiyatlardan yeniden hesaplar.
//  DRY varsayılan; uygulamak için:  node scripts/fix_bogus_prices.js --confirm
// ─────────────────────────────────────────────────────────────────────────
const { req } = require('../migration/pb');
const { FX_TO_USD } = require('./fx_rates');
const {
  isPlausibleLocalPrice, COUNTRY_CURRENCY, categoryMinUsd,
} = require('./lib/price_sanity');

const CONFIRM = process.argv.includes('--confirm');
const PAGE = 500;

function toUsd(amount, country) {
  const cur = COUNTRY_CURRENCY[String(country || '').toUpperCase()];
  const rate = cur ? FX_TO_USD[cur] : 0;
  return rate > 0 ? Number(amount) * rate : 0;
}

(async () => {
  let page = 1;
  let total = 0;
  let scanned = 0;
  let fixed = 0;
  const examples = [];
  for (;;) {
    const r = await req('GET',
      `/api/collections/products/records?perPage=${PAGE}&page=${page}` +
      `&fields=id,name,category,prices,lowestPrice,lowestPriceCurrency,lowestPriceUSD`);
    if (r.status !== 200) { console.error('fetch failed', r.status, JSON.stringify(r.body).slice(0, 200)); process.exit(1); }
    const items = r.body.items || [];
    total = r.body.totalItems || total;
    for (const p of items) {
      scanned++;
      const prices = p.prices && typeof p.prices === 'object' ? p.prices : null;
      if (!prices || !(categoryMinUsd(p.category) > 0)) continue; // sadece tabanı olan kategoriler
      const bad = [];
      const kept = {};
      for (const [country, amt] of Object.entries(prices)) {
        const a = Number(amt);
        if (a > 0 && !isPlausibleLocalPrice(p.category, a, country, FX_TO_USD)) bad.push([country, a]);
        else kept[country] = amt;
      }
      if (!bad.length) continue;
      // lowest* → kalan makul fiyatların en ucuzu (USD ile karşılaştır)
      let lo = 0;
      let loUsd = Infinity;
      let loCur = '';
      for (const [country, amt] of Object.entries(kept)) {
        const u = toUsd(amt, country);
        if (u > 0 && u < loUsd) { loUsd = u; lo = Number(amt); loCur = COUNTRY_CURRENCY[country.toUpperCase()] || ''; }
      }
      const payload = {
        prices: kept,
        lowestPrice: lo || 0,
        lowestPriceCurrency: lo ? loCur : '',
        lowestPriceUSD: lo ? Math.round(loUsd * 100) / 100 : 0,
      };
      fixed++;
      if (examples.length < 40) {
        examples.push(`  • ${p.name} [${p.category}] — sil: ${bad.map(([c, a]) => `${c}=${a}`).join(', ')}` +
          ` → lowest ${payload.lowestPrice || '—'} ${payload.lowestPriceCurrency}`);
      }
      if (CONFIRM) {
        const w = await req('PATCH', `/api/collections/products/records/${p.id}`, payload);
        if (w.status !== 200) console.error('  PATCH FAILED', p.id, w.status, JSON.stringify(w.body).slice(0, 160));
      }
    }
    if (items.length < PAGE) break;
    page++;
  }
  console.log(`\n${CONFIRM ? 'FIXED' : 'WOULD FIX'} ${fixed} product(s) with implausible (accessory-mismatch) prices — scanned ${scanned}/${total}.`);
  if (examples.length) console.log(examples.join('\n'));
  if (!CONFIRM) console.log('\n(DRY RUN — apply with:  node scripts/fix_bogus_prices.js --confirm )');
})().catch((e) => { console.error(e); process.exit(1); });
