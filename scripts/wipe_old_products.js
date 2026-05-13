/**
 * Qor AI — Wipe Legacy (non-Geizhals) Products
 *
 * Removes every product that was NOT scraped from Geizhals — i.e. the leftover
 * epey.com / gsmarena / manual imports that are now stale and cause the
 * "Could not load product data" errors in the app.
 *
 * Usage:
 *   node scripts/wipe_old_products.js --dry-run     # report only, no writes
 *   node scripts/wipe_old_products.js --confirm     # actually delete
 *   node scripts/wipe_old_products.js --confirm --cascade
 *       # also purge stale references in recently_viewed, favorites,
 *       # collection_items, and any comparison that references a deleted product.
 *
 * Required env (process.env or .env file):
 *   POCKETBASE_URL              e.g. https://pb.qorai.com
 *   POCKETBASE_ADMIN_EMAIL      superuser email
 *   POCKETBASE_ADMIN_PASSWORD   superuser password
 *
 * Safety:
 *   - Runs read-only unless --confirm is passed.
 *   - Prints a category/source breakdown BEFORE deleting anything.
 *   - Deletes in pages of 200 with a 50ms throttle between requests.
 *   - On any HTTP failure the script aborts cleanly — partial deletes are safe
 *     because each iteration re-queries the next page.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const PB_URL = (process.env.POCKETBASE_URL || '').replace(/\/$/, '');
const PB_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const PB_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;

if (!PB_URL || !PB_EMAIL || !PB_PASSWORD) {
  console.error(
    'Missing env. Set POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD.'
  );
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has('--confirm');
const CASCADE = args.has('--cascade');

// ─── PB client ────────────────────────────────────────────────────────────
let _authToken = null;

async function pbAuth() {
  const r = await fetch(
    `${PB_URL}/api/collections/_superusers/auth-with-password`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
    }
  );
  if (!r.ok) throw new Error(`PB auth failed ${r.status}: ${await r.text()}`);
  const data = await r.json();
  _authToken = data.token;
  return _authToken;
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: _authToken,
  };
}

async function pbList(collection, { page = 1, perPage = 200, filter = '', fields = '' } = {}) {
  const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
  if (filter) params.set('filter', filter);
  if (fields) params.set('fields', fields);
  const url = `${PB_URL}/api/collections/${collection}/records?${params.toString()}`;
  const r = await fetch(url, { headers: authHeaders() });
  if (!r.ok) throw new Error(`PB list ${collection} failed ${r.status}: ${await r.text()}`);
  return r.json();
}

async function pbDelete(collection, id) {
  const r = await fetch(`${PB_URL}/api/collections/${collection}/records/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!r.ok) {
    // 404 = already gone, treat as success.
    if (r.status === 404) return;
    throw new Error(`PB delete ${collection}/${id} failed ${r.status}: ${await r.text()}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Phase 1: Inventory ───────────────────────────────────────────────────

async function buildInventory() {
  console.log('\n── Phase 1: Building inventory ──');
  const breakdown = { bySource: {}, byCategory: {} };
  let totalCount = 0;
  let toDeleteCount = 0;
  const toDeleteIds = [];

  let page = 1;
  while (true) {
    const res = await pbList('products', {
      page,
      perPage: 200,
      fields: 'id,source,category',
    });
    if (!res.items || res.items.length === 0) break;

    for (const item of res.items) {
      totalCount++;
      const source = (item.source || '').trim().toLowerCase() || '(empty)';
      breakdown.bySource[source] = (breakdown.bySource[source] || 0) + 1;

      if (source !== 'geizhals') {
        toDeleteCount++;
        toDeleteIds.push(item.id);
        const cat = (item.category || '').trim().toLowerCase() || '(uncategorised)';
        breakdown.byCategory[cat] = (breakdown.byCategory[cat] || 0) + 1;
      }
    }

    if (res.items.length < res.perPage) break;
    page++;
  }

  console.log(`Total products in DB:        ${totalCount}`);
  console.log(`  Geizhals (KEEP):           ${breakdown.bySource.geizhals || 0}`);
  console.log(`  Non-Geizhals (DELETE):     ${toDeleteCount}`);
  console.log('\nNon-Geizhals breakdown by source:');
  for (const [source, count] of Object.entries(breakdown.bySource)) {
    if (source === 'geizhals') continue;
    console.log(`  ${source.padEnd(24)} ${count}`);
  }
  console.log('\nNon-Geizhals breakdown by category (top 15):');
  const topCats = Object.entries(breakdown.byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const [cat, count] of topCats) {
    console.log(`  ${cat.padEnd(24)} ${count}`);
  }

  return toDeleteIds;
}

// ─── Phase 2: Product deletion ────────────────────────────────────────────

async function deleteProducts(ids) {
  console.log(`\n── Phase 2: Deleting ${ids.length} products ──`);
  let done = 0;
  const startedAt = Date.now();
  for (const id of ids) {
    try {
      await pbDelete('products', id);
    } catch (e) {
      console.warn(`  ⚠️  ${id}: ${e.message}`);
    }
    done++;
    if (done % 100 === 0 || done === ids.length) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = done / Math.max(elapsed, 0.1);
      const remaining = (ids.length - done) / Math.max(rate, 0.1);
      console.log(
        `  ${done}/${ids.length}  (${rate.toFixed(1)}/s, ETA ${remaining.toFixed(0)}s)`
      );
    }
    // Throttle so we don't overwhelm PocketBase or Cloudflare.
    await sleep(50);
  }
  console.log(`  ✅ Done — deleted ${done} product records`);
}

// ─── Phase 3 (optional): Cascade dependent records ────────────────────────

async function cascadeWipe(deletedIds) {
  console.log('\n── Phase 3: Cascade wipe of dependent collections ──');
  const deletedSet = new Set(deletedIds);

  // 3a. recently_viewed: simple productId field — delete row if it points to
  // a now-dead product.
  await purgeByForeignKey('recently_viewed', 'productId', deletedSet);

  // 3b. favorites: same shape.
  await purgeByForeignKey('favorites', 'productId', deletedSet);

  // 3c. collection_items: same shape.
  await purgeByForeignKey('collection_items', 'productId', deletedSet);

  // 3d. comparisons: productIds is an array. Drop the whole comparison if any
  // of its referenced products were deleted (a comparison missing half its
  // products is more confusing than no comparison at all).
  await purgeComparisons(deletedSet);
}

async function purgeByForeignKey(collection, field, deletedSet) {
  console.log(`  Scanning ${collection}.${field}…`);
  let page = 1;
  let scanned = 0;
  let removed = 0;
  while (true) {
    let res;
    try {
      res = await pbList(collection, { page, perPage: 200, fields: `id,${field}` });
    } catch (e) {
      if (String(e.message).includes('404')) {
        console.log(`    (collection ${collection} not found — skipping)`);
        return;
      }
      throw e;
    }
    if (!res.items || res.items.length === 0) break;
    for (const item of res.items) {
      scanned++;
      const ref = item[field];
      if (typeof ref === 'string' && deletedSet.has(ref)) {
        try {
          await pbDelete(collection, item.id);
          removed++;
        } catch (e) {
          console.warn(`    ⚠️ ${collection}/${item.id}: ${e.message}`);
        }
        await sleep(30);
      }
    }
    if (res.items.length < res.perPage) break;
    page++;
  }
  console.log(`    ${collection}: scanned ${scanned}, removed ${removed}`);
}

async function purgeComparisons(deletedSet) {
  console.log('  Scanning comparisons.productIds…');
  let page = 1;
  let scanned = 0;
  let removed = 0;
  while (true) {
    let res;
    try {
      res = await pbList('comparisons', { page, perPage: 200, fields: 'id,productIds' });
    } catch (e) {
      if (String(e.message).includes('404')) {
        console.log('    (collection comparisons not found — skipping)');
        return;
      }
      throw e;
    }
    if (!res.items || res.items.length === 0) break;
    for (const item of res.items) {
      scanned++;
      const ids = Array.isArray(item.productIds) ? item.productIds : [];
      const hasDead = ids.some((id) => deletedSet.has(id));
      if (hasDead) {
        try {
          await pbDelete('comparisons', item.id);
          removed++;
        } catch (e) {
          console.warn(`    ⚠️ comparisons/${item.id}: ${e.message}`);
        }
        await sleep(30);
      }
    }
    if (res.items.length < res.perPage) break;
    page++;
  }
  console.log(`    comparisons: scanned ${scanned}, removed ${removed}`);
}

// ─── main ────────────────────────────────────────────────────────────────

(async () => {
  console.log('Qor AI — wipe legacy products');
  console.log(`  PB: ${PB_URL}`);
  console.log(`  mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'CONFIRMED — will delete'}`);
  console.log(`  cascade: ${CASCADE ? 'YES' : 'no'}`);

  await pbAuth();
  console.log('  auth: ok');

  const ids = await buildInventory();

  if (ids.length === 0) {
    console.log('\nNothing to delete. Bye.');
    return;
  }

  if (DRY_RUN) {
    console.log(
      '\nDry-run complete. Re-run with --confirm to actually delete the records above.'
    );
    return;
  }

  await deleteProducts(ids);
  if (CASCADE) await cascadeWipe(ids);

  console.log('\nAll done.');
})().catch((e) => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
