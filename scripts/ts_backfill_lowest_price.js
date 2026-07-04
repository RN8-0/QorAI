#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  QOR AI — Typesense backfill: lowestPriceUSD + pricesByCountry + bestOfferExpiresAt
//
//  Adds the price rollup fields to the existing Typesense `products`
//  collection (without recreating it), then streams every PocketBase product
//  and patches the corresponding TS document with:
//    - lowestPriceUSD: freshly computed cross-market USD price (sorting)
//    - pricesByCountry: compact JSON of country-code→native price (lean cards)
//    - bestOfferExpiresAt: rollup freshness stamp (strict-country price gate)
//
//  Why a dedicated script (vs. just running migration/ts_index.js):
//    - Drop-recreate would invalidate the live index for ~1-2 minutes and
//      churn every other indexed field (filterTokens, screenSizeValue, ...),
//      which is wasted I/O when only one field is changing.
//    - This script is idempotent: running it twice does nothing the second
//      time. Safe to use as a CI / cron task whenever the FX table changes.
//
//  Usage:
//      node scripts/ts_backfill_lowest_price.js              # dry-run (no writes)
//      node scripts/ts_backfill_lowest_price.js --confirm    # apply changes
//      node scripts/ts_backfill_lowest_price.js --confirm --batch=500
//
//  Exit codes:
//      0 — success (or dry-run completed)
//      1 — fatal error (schema/import failure)
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');

// migration/ helpers expect to be required from inside the migration folder
// because they read ./.env relative to __dirname; we re-use them as-is.
const { req: tsReq } = require(path.join(__dirname, '..', 'migration', 'ts'));
const { req: pbReq } = require(path.join(__dirname, '..', 'migration', 'pb'));
const { lowestPriceUsd, FX_VERSION } = require(path.join(__dirname, 'fx_rates'));

const TS_COLLECTION = 'products';
// Kartların lean (_raw'sız) payload'ında ülke-bazlı fiyat gösterebilmek için
// lowestPriceUSD'nin yanına iki kompakt alan daha yazıyoruz:
//   - pricesByCountry: yalnız 2 harfli ülke kodu anahtarlı, JSON.stringify
//     edilmiş {"TR":1234.56,...} map'i (index:false → aranmaz ama döner)
//   - bestOfferExpiresAt: rollup tazelik damgası (priceForCountry bunu ister)
const NEW_FIELDS = [
  { name: 'lowestPriceUSD', type: 'float', optional: true },
  { name: 'pricesByCountry', type: 'string', optional: true, index: false },
  { name: 'bestOfferExpiresAt', type: 'string', optional: true, index: false },
];

// CLI flags ----------------------------------------------------------------
const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const PB_PAGE_SIZE = (() => {
  const f = args.find(a => a.startsWith('--pbBatch='));
  return f ? Math.max(50, parseInt(f.split('=')[1], 10) || 500) : 500;
})();
const TS_BATCH_SIZE = (() => {
  const f = args.find(a => a.startsWith('--batch='));
  return f ? Math.max(100, parseInt(f.split('=')[1], 10) || 1000) : 1000;
})();

const log = (...m) => console.log('[backfill]', ...m);
const warn = (...m) => console.warn('[backfill]', ...m);

async function ensureFields() {
  const r = await tsReq('GET', `/collections/${TS_COLLECTION}`);
  if (r.status !== 200) {
    throw new Error(`Cannot read collection: ${JSON.stringify(r.body).slice(0, 200)}`);
  }
  const fields = (r.body && r.body.fields) || [];
  const existing = new Set(fields.map(f => f.name));
  const missing = NEW_FIELDS.filter(f => !existing.has(f.name));
  if (!missing.length) {
    log(`fields ${NEW_FIELDS.map(f => f.name).join(', ')} already present, skipping schema alter`);
    return;
  }
  if (!CONFIRM) {
    log(`[dry-run] would PATCH /collections/${TS_COLLECTION} adding ${missing.map(f => `${f.name}:${f.type}`).join(', ')}`);
    return;
  }
  const patch = await tsReq('PATCH', `/collections/${TS_COLLECTION}`, {
    fields: missing,
  });
  if (patch.status !== 200) {
    throw new Error(`Schema alter failed (${patch.status}): ${JSON.stringify(patch.body).slice(0, 300)}`);
  }
  log(`schema altered: +${missing.map(f => f.name).join(', +')}`);
}

// PB `prices` map'inden SADECE 2 harfli BÜYÜK ülke kodu anahtarlarını (TR, DE,
// GB, US, ...) alır — legacy para-kodu anahtarları (TRY, EUR...) elenmiş olur —
// pozitif değerleri 2 ondalığa yuvarlayıp kompakt JSON string döndürür.
// Boş/geçersizse '' döner: idempotentlik için alan HER ZAMAN yazılır, böylece
// fiyatını kaybeden ürünün eski pricesByCountry değeri de temizlenir.
function compactCountryPrices(prices) {
  if (!prices || typeof prices !== 'object') return '';
  const out = {};
  for (const key of Object.keys(prices)) {
    if (!/^[A-Z]{2}$/.test(key)) continue;
    const n = Number(prices[key]);
    if (!(n > 0)) continue;
    out[key] = Math.round(n * 100) / 100;
  }
  return Object.keys(out).length ? JSON.stringify(out) : '';
}

async function pbPage(page) {
  const r = await pbReq(
    'GET',
    `/api/collections/products/records?perPage=${PB_PAGE_SIZE}&page=${page}&fields=id,prices,bestOfferExpiresAt`,
  );
  if (r.status !== 200) {
    throw new Error(`PB page ${page} failed: ${JSON.stringify(r.body).slice(0, 200)}`);
  }
  return r.body;
}

async function importBatch(docs) {
  if (!docs.length) return { ok: 0, fail: 0 };
  if (!CONFIRM) {
    return { ok: docs.length, fail: 0, skipped: true };
  }
  const jsonl = docs.map(d => JSON.stringify(d)).join('\n');
  const r = await tsReq(
    'POST',
    `/collections/${TS_COLLECTION}/documents/import?action=update`,
    jsonl,
    'text/plain',
  );
  if (r.status !== 200) {
    warn(`import HTTP ${r.status}: ${(r.body + '').slice(0, 300)}`);
    return { ok: 0, fail: docs.length };
  }
  const lines = (r.body + '').split('\n').filter(Boolean);
  let ok = 0, fail = 0;
  for (const line of lines) {
    try {
      const j = JSON.parse(line);
      if (j.success) ok++;
      else { fail++; if (fail < 3) warn('row fail:', line.slice(0, 200)); }
    } catch { fail++; }
  }
  return { ok, fail };
}

async function main() {
  log(`mode=${CONFIRM ? 'APPLY' : 'DRY-RUN'} fxVersion=${FX_VERSION} pbBatch=${PB_PAGE_SIZE} tsBatch=${TS_BATCH_SIZE}`);
  await ensureFields();

  const first = await pbPage(1);
  const total = first.totalItems;
  const pages = first.totalPages;
  log(`PB has ${total} products across ${pages} pages`);

  const t0 = Date.now();
  let okTotal = 0, failTotal = 0, processed = 0, withPrice = 0, zeroPrice = 0;
  let buffer = [];

  const flush = async () => {
    if (!buffer.length) return;
    const r = await importBatch(buffer);
    okTotal += r.ok; failTotal += r.fail;
    buffer = [];
  };

  const handleItems = async (items) => {
    for (const pb of items) {
      processed++;
      const usd = lowestPriceUsd(pb.prices);
      if (usd > 0) withPrice++; else zeroPrice++;
      buffer.push({
        id: pb.id,
        lowestPriceUSD: usd,
        pricesByCountry: compactCountryPrices(pb.prices),
        bestOfferExpiresAt: pb.bestOfferExpiresAt || '',
      });
      if (buffer.length >= TS_BATCH_SIZE) await flush();
    }
    const rate = (processed / Math.max(1, (Date.now() - t0) / 1000)).toFixed(0);
    process.stdout.write(`\r[backfill] processed=${processed}/${total} priced=${withPrice} zero=${zeroPrice} ok=${okTotal} fail=${failTotal} (${rate}/s)   `);
  };

  await handleItems(first.items);
  for (let p = 2; p <= pages; p++) {
    const page = await pbPage(p);
    await handleItems(page.items);
  }
  await flush();

  console.log();
  log(`DONE in ${((Date.now() - t0) / 1000).toFixed(1)}s — ok=${okTotal} fail=${failTotal} priced=${withPrice} zero=${zeroPrice}`);
  if (!CONFIRM) {
    log('DRY-RUN: no changes applied. Re-run with --confirm to apply.');
  }
}

main().catch(err => {
  console.error('[backfill] FATAL', err);
  process.exit(1);
});
