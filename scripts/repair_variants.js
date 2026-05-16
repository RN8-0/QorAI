/**
 * Qor AI — variant grouping backfill
 *
 * Icecat publishes every SKU (each colour / keyboard layout / minor config)
 * as its own product, so the catalog holds thousands of near-identical rows.
 * They already share a `variantGroup`. This script designates ONE primary
 * record per (category + variantGroup) family and writes the family size, so
 * the admin product list can show one card per model instead of per SKU:
 *
 *   variantPrimary = true   → the representative shown in the grouped list
 *   variantCount            → number of SKUs in the family (on the primary)
 *
 * The primary is the most complete record (most specs, then techScore).
 * Idempotent — only writes records whose state actually changes.
 *
 *   node scripts/repair_variants.js          apply
 *   node scripts/repair_variants.js --dry    preview only
 */
'use strict';

const { req } = require('../migration/pb');

const DRY = process.argv.includes('--dry');
const CONCURRENCY = 14;
const FIELDS = 'id,category,brand,variantGroup,specsCount,techScore,variantPrimary,variantCount';

function familyKey(p) {
  const cat = String(p.category || '').trim().toLowerCase();
  const vg = String(p.variantGroup || '').trim().toLowerCase();
  // variantGroup already encodes brand+model; fall back to id so a product
  // with no group is its own single-item family rather than merged blindly.
  return vg ? `${cat}|${vg}` : `${cat}|__solo__${p.id}`;
}

async function fetchAll() {
  const out = [];
  let page = 1;
  for (;;) {
    const r = await req('GET', `/api/collections/products/records?perPage=500&page=${page}&sort=id&fields=${FIELDS}`);
    if (r.status !== 200) throw new Error(`fetch page ${page} failed: ${JSON.stringify(r.body).slice(0, 200)}`);
    const items = r.body.items || [];
    out.push(...items);
    if (items.length < 500 || page >= (r.body.totalPages || 1)) break;
    page++;
  }
  return out;
}

async function runPool(items, worker) {
  let i = 0, done = 0;
  async function next() {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
      if (++done % 500 === 0) console.log(`   …${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next));
}

function pickPrimary(group) {
  return group.slice().sort((a, b) => {
    const sc = (Number(b.specsCount) || 0) - (Number(a.specsCount) || 0);
    if (sc) return sc;
    const ts = (Number(b.techScore) || 0) - (Number(a.techScore) || 0);
    if (ts) return ts;
    return String(a.id).localeCompare(String(b.id));
  })[0];
}

async function main() {
  console.log(`\n  Variant grouping backfill ${DRY ? '(DRY RUN)' : ''}\n`);

  const products = await fetchAll();
  console.log(`  ${products.length} products loaded`);

  const families = new Map();
  for (const p of products) {
    const k = familyKey(p);
    (families.get(k) || families.set(k, []).get(k)).push(p);
  }
  console.log(`  ${families.size} variant families\n`);

  // Build the desired state, then collect only the records that must change.
  const updates = [];
  let multiFamilies = 0;
  for (const group of families.values()) {
    const primary = pickPrimary(group);
    const count = group.length;
    if (count > 1) multiFamilies++;
    for (const p of group) {
      const wantPrimary = p.id === primary.id;
      const wantCount = wantPrimary ? count : 0;
      if (Boolean(p.variantPrimary) !== wantPrimary || (Number(p.variantCount) || 0) !== wantCount) {
        updates.push({ id: p.id, data: { variantPrimary: wantPrimary, variantCount: wantCount } });
      }
    }
  }

  console.log(`  ${multiFamilies} families have >1 SKU`);
  console.log(`  ${updates.length} record(s) need updating\n`);

  if (DRY) { console.log('  (dry run — nothing written)\n'); return; }
  if (!updates.length) { console.log('  Already up to date.\n'); return; }

  let ok = 0, fail = 0;
  await runPool(updates, async (u) => {
    const r = await req('PATCH', `/api/collections/products/records/${u.id}`, u.data);
    if (r.status === 200) ok++;
    else { fail++; if (fail <= 8) console.log(`   ! ${u.id}: ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`); }
  });

  console.log(`\n  Done — ${ok} updated, ${fail} failed.\n`);
}

main().catch(e => { console.error('  ✗', e.message); process.exit(1); });
