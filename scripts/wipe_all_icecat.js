'use strict';

/**
 * wipe_all_icecat.js
 *
 * Deletes EVERY product whose `source` field is "icecat". This is the
 * one-shot wipe used when the project pivots away from Icecat as a data
 * source.  Epey-, Geizhals-, Amazon-, eBay- and admin-sourced products
 * are untouched (they use different `source` values).
 *
 * Safety:
 *   - Defaults to dry-run.  Pass --yes to actually delete.
 *   - Prints per-page samples so you can sanity-check before committing.
 *   - Re-fetches page 1 between deletes (the table shrinks each batch),
 *     so the loop terminates when 0 Icecat products are left.
 *
 * Usage:
 *   node scripts/wipe_all_icecat.js                # dry-run
 *   node scripts/wipe_all_icecat.js --yes          # actually delete
 *   node scripts/wipe_all_icecat.js --yes --perPage=500
 */

const { req } = require('../migration/pb');

function opt(name, fallback = '') {
  const pref = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : fallback;
}

const YES = process.argv.includes('--yes');
const DRY_RUN = !YES;
const PER_PAGE = Math.max(50, Math.min(1000, Number(opt('perPage', '300')) || 300));
const FILTER = 'source="icecat"';

async function countTotal() {
  const r = await req('GET',
    `/api/collections/products/records?perPage=1&page=1&skipTotal=0&filter=${encodeURIComponent(FILTER)}&fields=id`);
  if (r.status !== 200) {
    throw new Error(`count failed: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  }
  return Number(r.body.totalItems || 0);
}

async function fetchBatch(page) {
  const fields = 'id,name,brand,category,icecatId,specsCount,techScore';
  const r = await req('GET',
    `/api/collections/products/records?perPage=${PER_PAGE}&page=${page}&sort=created&filter=${encodeURIComponent(FILTER)}&fields=${encodeURIComponent(fields)}`);
  if (r.status !== 200) {
    throw new Error(`fetch failed: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  }
  return r.body;
}

async function deleteOne(id) {
  const r = await req('DELETE', `/api/collections/products/records/${id}`);
  if (![200, 204].includes(r.status)) {
    console.warn(`  ! delete failed ${id}: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    return false;
  }
  return true;
}

async function main() {
  const total = await countTotal();
  console.log(`source="icecat" products in PocketBase: ${total}`);
  if (total === 0) {
    console.log('Nothing to do.');
    return;
  }

  if (DRY_RUN) {
    console.log(`DRY-RUN — sampling pages (use --yes to actually delete).`);
    const body = await fetchBatch(1);
    const items = body.items || [];
    const sample = items.slice(0, 12)
      .map(p => ` - ${p.icecatId || '?'} | ${p.category} | ${p.brand || ''} ${String(p.name || '').slice(0, 80)}`)
      .join('\n');
    console.log(sample);
    console.log(`\nWould delete ${total} products. Re-run with --yes to commit.`);
    return;
  }

  let deleted = 0;
  let failed = 0;
  const t0 = Date.now();

  while (true) {
    const body = await fetchBatch(1);
    const items = body.items || [];
    if (!items.length) break;

    const sample = items.slice(0, 3)
      .map(p => `${p.icecatId || '?'}:${p.category}:${p.brand || ''}`)
      .join(' | ');
    console.log(`deleting batch of ${items.length} (${deleted}/${total} done) — ${sample}`);

    for (const p of items) {
      const ok = await deleteOne(p.id);
      if (ok) deleted++; else failed++;
    }
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone — deleted ${deleted}/${total} (failed: ${failed}) in ${dt}s.`);
}

main().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
