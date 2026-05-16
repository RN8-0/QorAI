/**
 * Qor AI — configuration-level catalog dedupe
 *
 * Icecat ships every SKU separately, so one laptop model can have thousands
 * of rows that differ only by colour / reseller / keyboard language / region.
 * This keeps ONE row per real configuration (distinct CPU / RAM / storage /
 * GPU / screen) and deletes the cosmetic duplicates — versus.com style.
 *
 *   keep   : best row per (category + configKey)
 *   delete : the cosmetic dupes, plus every junk-brand row (QA_test…)
 *
 * The survivor is chosen as: real manufacturer over reseller, then has-image,
 * then most specs, then techScore. Survivors get their configKey written so
 * the ingestor can skip future duplicates.
 *
 *   node scripts/dedupe_configs.js --dry    preview (no writes)
 *   node scripts/dedupe_configs.js          apply
 */
'use strict';

const { req } = require('../migration/pb');
const { configKey, isRefurbisherBrand, isJunkBrand } = require('./lib/config_key');

const DRY = process.argv.includes('--dry');
const CONCURRENCY = 16;
const FIELDS = 'id,name,brand,category,variantGroup,specsCount,techScore,imageUrl,source,configKey';

async function fetchAll() {
  const out = [];
  let page = 1;
  for (;;) {
    const r = await req('GET', `/api/collections/products/records?perPage=500&page=${page}&sort=id&fields=${FIELDS}`);
    if (r.status !== 200) throw new Error(`fetch page ${page}: ${JSON.stringify(r.body).slice(0, 200)}`);
    const items = r.body.items || [];
    out.push(...items);
    if (items.length < 500 || page >= (r.body.totalPages || 1)) break;
    page++;
  }
  return out;
}

async function runPool(items, worker, label) {
  let i = 0, done = 0;
  async function next() {
    while (i < items.length) {
      await worker(items[i++]);
      if (++done % 1000 === 0) console.log(`   …${label} ${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next));
}

// Higher tuple = better survivor.
function rank(p) {
  return [
    isRefurbisherBrand(p.brand) ? 0 : 1,
    p.imageUrl ? 1 : 0,
    Number(p.specsCount) || 0,
    Number(p.techScore) || 0,
  ];
}
function better(a, b) {
  const ra = rank(a), rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i] ? a : b;
  return String(a.id) <= String(b.id) ? a : b;
}

async function main() {
  console.log(`\n  Configuration dedupe ${DRY ? '(DRY RUN)' : ''}\n`);
  const products = await fetchAll();
  console.log(`  ${products.length} products loaded`);

  const groups = new Map();
  const junk = [];
  for (const p of products) {
    if (isJunkBrand(p.brand)) { junk.push(p); continue; }
    const ck = configKey(p.name, p.brand);
    const key = ck ? `${p.category || ''}|${ck}` : `${p.category || ''}|__solo__${p.id}`;
    let g = groups.get(key);
    if (!g) groups.set(key, g = { ck, items: [] });
    g.items.push(p);
  }

  const survivors = [];
  const toDelete = [...junk];
  let dupeGroups = 0;
  for (const g of groups.values()) {
    let win = g.items[0];
    for (let i = 1; i < g.items.length; i++) win = better(win, g.items[i]);
    win._ck = g.ck;
    survivors.push(win);
    const losers = g.items.filter(p => p.id !== win.id);
    if (losers.length) dupeGroups++;
    toDelete.push(...losers);
  }

  console.log(`  ${groups.size} distinct configurations (survivors)`);
  console.log(`  ${dupeGroups} configs had cosmetic duplicates`);
  console.log(`  ${junk.length} junk-brand rows (QA_test etc.)`);
  console.log(`  → ${toDelete.length} rows to delete, ${survivors.length} to keep\n`);

  // Sample so the operator can sanity-check before the destructive run.
  const big = [...groups.values()].sort((a, b) => b.items.length - a.items.length).slice(0, 6);
  console.log('  Largest dupe groups (kept 1, rest deleted):');
  for (const g of big) {
    const w = g.items.reduce((x, y) => better(x, y));
    console.log(`    ${String(g.items.length).padStart(5)}×  ${(w.brand || '?')} — ${(w.name || '').slice(0, 60)}`);
  }
  console.log('');

  if (DRY) { console.log('  Dry run — nothing written.\n'); return; }

  let del = 0, delFail = 0;
  await runPool(toDelete, async (p) => {
    const r = await req('DELETE', `/api/collections/products/records/${p.id}`);
    if (r.status === 204 || r.status === 200) del++;
    else { delFail++; if (delFail <= 8) console.log(`   ! delete ${p.id}: ${r.status}`); }
  }, 'deleted');
  console.log(`  deleted ${del} (${delFail} failed)`);

  let patched = 0, patchFail = 0;
  await runPool(survivors, async (p) => {
    if (p.configKey === p._ck) { patched++; return; } // already set
    const r = await req('PATCH', `/api/collections/products/records/${p.id}`, { configKey: p._ck });
    if (r.status === 200) patched++;
    else { patchFail++; if (patchFail <= 8) console.log(`   ! patch ${p.id}: ${r.status}`); }
  }, 'tagged');
  console.log(`  tagged ${patched} survivors with configKey (${patchFail} failed)`);

  console.log(`\n  Done — catalog ${products.length} → ${survivors.length} rows.\n`);
}

main().catch(e => { console.error('  ✗', e.message); process.exit(1); });
