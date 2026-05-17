/**
 * Qor AI — Full catalog wipe
 *
 * Deletes the ENTIRE product catalog so it can be rebuilt from scratch,
 * systematically, one category/brand at a time:
 *
 *   • products      — every record
 *   • categories    — every record (re-created automatically as new
 *                      products are scraped, via syncCategoryRecord)
 *   • dependent user data that would otherwise hold dead references:
 *       recently_viewed, favorites, collection_items, comparisons, offers
 *
 * Typesense is kept in sync automatically: PocketBase's typesense_sync hook
 * fires onRecordAfterDeleteSuccess for every deleted product.
 *
 * Credentials come from migration/.env (POCKETBASE_URL / _ADMIN_EMAIL /
 * _ADMIN_PASSWORD) through migration/pb.js.
 *
 * Usage:
 *   node scripts/wipe_all_catalog.js              # dry-run, counts only
 *   node scripts/wipe_all_catalog.js --confirm    # actually delete
 */
'use strict';

const { req, auth } = require('../migration/pb');

const CONFIRM = process.argv.includes('--confirm');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Collections wiped in full. products + categories rebuild the catalog;
// the rest only hold references that would dangle once products are gone.
const WIPE = ['products', 'categories', 'offers', 'recently_viewed', 'favorites', 'collection_items', 'comparisons'];

async function countOf(collection) {
  try {
    const r = await req('GET', `/api/collections/${collection}/records?perPage=1`);
    return r.status === 200 ? (r.body.totalItems || 0) : -1;
  } catch {
    return -1;
  }
}

async function wipeCollection(collection) {
  let deleted = 0;
  for (;;) {
    let r;
    try {
      r = await req('GET', `/api/collections/${collection}/records?perPage=200&fields=id`);
    } catch (e) {
      console.log(`  ! ${collection}: list failed — ${e.message}`);
      return deleted;
    }
    if (r.status === 404) {
      console.log(`  · ${collection}: collection not found — skipped`);
      return deleted;
    }
    if (r.status !== 200) {
      console.log(`  ! ${collection}: list status ${r.status}`);
      return deleted;
    }
    const items = r.body.items || [];
    if (!items.length) break;
    for (const it of items) {
      try {
        const d = await req('DELETE', `/api/collections/${collection}/records/${it.id}`);
        if (d.status === 204 || d.status === 200 || d.status === 404) deleted++;
        else console.log(`  ! ${collection}/${it.id}: delete status ${d.status}`);
      } catch (e) {
        console.log(`  ! ${collection}/${it.id}: ${e.message}`);
      }
      await sleep(25);
    }
    process.stdout.write(`\r  ${collection}: ${deleted} deleted…`);
  }
  if (deleted) process.stdout.write('\n');
  return deleted;
}

(async () => {
  console.log('\nQor AI — full catalog wipe');
  await auth();
  console.log('  auth: ok\n');

  console.log('Current record counts:');
  for (const c of WIPE) {
    const n = await countOf(c);
    console.log(`  ${c.padEnd(18)} ${n < 0 ? '(no collection)' : n.toLocaleString()}`);
  }

  if (!CONFIRM) {
    console.log('\nDRY-RUN — nothing deleted. Re-run with --confirm to wipe.');
    return;
  }

  console.log('\nWiping…');
  let total = 0;
  for (const c of WIPE) {
    total += await wipeCollection(c);
  }
  console.log(`\nDone — ${total.toLocaleString()} records deleted across ${WIPE.length} collections.`);
})().catch((e) => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
