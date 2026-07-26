#!/usr/bin/env node
/**
 * Qor AI — vitrin-fiyatlı ürünlerin rollup onarımı (2026-07-26)
 *
 * Neden: `epey_store` (linksiz mağaza vitrini) teklifleri ilk sürümde rollup'a
 * HİÇ girmiyordu; Amazon satırı olmayan ürün 3 mağaza fiyatı yazılmasına rağmen
 * `prices:{}` / `pricedOfferCount:0` kalıyordu — yani kartta yine fiyat yoktu.
 * scripts/lib/offers.js düzeltildi (linkli fiyat öncelikli, yoksa vitrin fiyatı
 * gösterilir ama buy-box linki ÜRETİLMEZ). Bu script eski kodla yazılmış
 * ürünlerin rollup'ını YENİDEN HESAPLAR — hiç scrape yapmaz, yalnız PB okur/yazar.
 *
 *   node scripts/repair_store_only_rollups.js            (kuru çalışma: sayar)
 *   node scripts/repair_store_only_rollups.js --confirm  (onarır)
 */
'use strict';

const { req } = require('../migration/pb');
const { refreshProductRollup } = require('./lib/offers');

const CONFIRM = process.argv.includes('--confirm');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // epey_store teklifi olan TÜM ürün id'leri (sayfalı)
  const ids = new Set();
  let page = 1;
  for (;;) {
    const r = await req('GET',
      `/api/collections/offers/records?perPage=500&page=${page}&fields=productId&filter=${encodeURIComponent('network="epey_store"')}`);
    if (r.status !== 200) throw new Error(`offers sayfa ${page}: ${r.status}`);
    for (const o of (r.body.items || [])) if (o.productId) ids.add(o.productId);
    if (page >= (r.body.totalPages || 1)) break;
    page++;
  }
  const list = [...ids];
  console.log(`  vitrin teklifi olan ürün: ${list.length}`);

  // Bunlardan rollup'ı bozuk olanlar (fiyat yazılmış ama üründe görünmüyor)
  const broken = [];
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const filter = chunk.map((id) => `id="${id}"`).join(' || ');
    const r = await req('GET',
      `/api/collections/products/records?perPage=100&fields=id,category,pricedOfferCount,lowestPrice&filter=${encodeURIComponent(filter)}`);
    for (const p of (r.body.items || [])) {
      if (!(Number(p.pricedOfferCount) > 0) || !(Number(p.lowestPrice) > 0)) broken.push(p);
    }
  }
  console.log(`  rollup'ı bozuk (fiyat var ama görünmüyor): ${broken.length}`);
  if (!CONFIRM) { console.log('  kuru çalışma — onarmak için --confirm ekle'); return; }

  let ok = 0, fail = 0;
  for (let i = 0; i < broken.length; i++) {
    const p = broken[i];
    try { await refreshProductRollup(p.id, p.category); ok++; }
    catch (e) { fail++; console.log(`  ! ${p.id}: ${e.message}`); }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${broken.length} onarıldı`);
    await sleep(20); // PB'yi boğmayalım
  }
  console.log(`  bitti — ok=${ok} hata=${fail}`);
}

main().catch((e) => { console.log('  ✗ ' + e.message); process.exit(1); });
