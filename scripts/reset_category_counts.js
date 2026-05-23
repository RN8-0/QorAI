'use strict';

/**
 * reset_category_counts.js
 *
 * Sets every `categories.productCount` to 0. The scraper UI reads these
 * counts to label kategoriler ("SMARTPHONES 8093 ÜRÜN" …) so after a
 * products-only wipe (when the typesense_sync hook didn't fire and the
 * `categories` collection was untouched) the labels stay stale until
 * either repair_categories.js or this script reconciles them.
 *
 * Usage:
 *   node scripts/reset_category_counts.js              # dry-run
 *   node scripts/reset_category_counts.js --yes        # actually reset
 */

const { req } = require('../migration/pb');

const YES = process.argv.includes('--yes');

async function listAllCategories() {
  const items = [];
  let page = 1;
  while (true) {
    const r = await req('GET',
      `/api/collections/categories/records?perPage=500&page=${page}&fields=id,slug,productCount&skipTotal=1`);
    if (r.status !== 200) {
      throw new Error(`list failed: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    }
    const batch = r.body.items || [];
    items.push(...batch);
    if (batch.length < 500) break;
    page++;
    if (page > 50) break;
  }
  return items;
}

async function patchOne(id, payload) {
  const r = await req('PATCH', `/api/collections/categories/records/${id}`, payload);
  if (![200, 204].includes(r.status)) {
    throw new Error(`patch ${id} status ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
  }
}

(async () => {
  const cats = await listAllCategories();
  const nonZero = cats.filter(c => Number(c.productCount) > 0);

  console.log(`Found ${cats.length} category records (${nonZero.length} with productCount > 0).`);

  if (nonZero.length === 0) {
    console.log('Nothing to do — every category is already at 0.');
    return;
  }

  console.log('\nTop 15 stale counts:');
  for (const c of nonZero
        .sort((a, b) => (b.productCount || 0) - (a.productCount || 0))
        .slice(0, 15)) {
    console.log(`  ${(c.slug || c.id).padEnd(24)} ${c.productCount}`);
  }

  if (!YES) {
    console.log('\nDRY-RUN — pass --yes to reset every one of them to 0.');
    return;
  }

  console.log('\nResetting…');
  let done = 0, failed = 0;
  for (const c of nonZero) {
    try {
      await patchOne(c.id, { productCount: 0 });
      done++;
      if (done % 10 === 0) process.stdout.write(`\r  ${done}/${nonZero.length}`);
    } catch (e) {
      failed++;
      console.warn(`\n  ! ${c.slug || c.id} → ${e.message.slice(0, 120)}`);
    }
  }
  if (done) process.stdout.write('\n');
  console.log(`\nDone — ${done}/${nonZero.length} reset (failed: ${failed}).`);
  console.log('Refresh the Scraper page in admin to see "0 ÜRÜN" labels.');
})().catch(err => {
  console.error('\nFATAL:', err.message || err);
  process.exit(1);
});
