/**
 * Qor AI — variantGroup backfill
 *
 * Recomputes every product's variantGroup with the current (improved)
 * modelFamilyKey so all configurations of one model collapse to a single
 * group — e.g. the Lenovo IdeaCentre A340-24IWL i3/i5 variants stop showing
 * up as separate cards.
 *
 *   node scripts/repair_variant_groups.js --dry    preview
 *   node scripts/repair_variant_groups.js          apply
 *
 * Run scripts/repair_variants.js afterwards to reconcile variantPrimary.
 */
'use strict';

const { req } = require('../migration/pb');
const { modelFamilyKey } = require('./lib/model_family');

const DRY = process.argv.includes('--dry');
const CONCURRENCY = 16;

async function fetchAll() {
  const out = [];
  let page = 1;
  for (;;) {
    const r = await req('GET', `/api/collections/products/records?perPage=500&page=${page}&sort=id&fields=id,name,brand,category,variantGroup`);
    if (r.status !== 200) throw new Error(`fetch page ${page}: ${r.status}`);
    out.push(...(r.body.items || []));
    if (page >= (r.body.totalPages || 1)) break;
    page++;
  }
  return out;
}

async function runPool(items, worker) {
  let i = 0, done = 0;
  async function next() {
    while (i < items.length) {
      await worker(items[i++]);
      if (++done % 500 === 0) console.log(`   …${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next));
}

async function main() {
  console.log(`\n  variantGroup backfill ${DRY ? '(DRY RUN)' : ''}\n`);
  const products = await fetchAll();
  console.log(`  ${products.length} products loaded`);

  const updates = [];
  const before = new Set(), after = new Set();
  for (const p of products) {
    before.add(p.variantGroup || '');
    const vg = modelFamilyKey({ name: p.name, brand: p.brand, category: p.category });
    after.add(vg);
    if (vg && vg !== p.variantGroup) updates.push({ id: p.id, vg });
  }
  console.log(`  model families: ${before.size} → ${after.size}`);
  console.log(`  ${updates.length} product(s) need a new variantGroup\n`);

  if (DRY) { console.log('  Dry run — nothing written.\n'); return; }
  if (!updates.length) { console.log('  Already up to date.\n'); return; }

  let ok = 0, fail = 0;
  await runPool(updates, async (u) => {
    const r = await req('PATCH', `/api/collections/products/records/${u.id}`, { variantGroup: u.vg });
    if (r.status === 200) ok++;
    else { fail++; if (fail <= 8) console.log(`   ! ${u.id}: ${r.status}`); }
  });
  console.log(`\n  Done — ${ok} updated, ${fail} failed. Now run repair_variants.js.\n`);
}

main().catch(e => { console.error('  ✗', e.message); process.exit(1); });
