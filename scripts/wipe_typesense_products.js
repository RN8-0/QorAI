'use strict';

/**
 * wipe_typesense_products.js
 *
 * Empties the Typesense `products` collection (keeps the schema intact).
 * Used after a PocketBase products wipe when the typesense_sync hook didn't
 * fire (batch deletes, manual SQL, or hooks disabled).
 *
 * Usage:
 *   node scripts/wipe_typesense_products.js                # dry-run
 *   node scripts/wipe_typesense_products.js --yes          # actually delete
 *   node scripts/wipe_typesense_products.js --yes --hard   # drop & recreate collection
 *
 * --hard drops the WHOLE collection (schema + data) — fastest for very
 * large doc counts. Schema is re-created automatically the first time a
 * product is upserted from PB.  Use plain --yes if you want to preserve
 * the schema (safer when downstream code relies on it).
 */

const { req } = require('../migration/ts');

const YES = process.argv.includes('--yes');
const HARD = process.argv.includes('--hard');

async function count() {
  const r = await req('GET', '/collections/products');
  if (r.status !== 200) {
    throw new Error(`collection lookup failed: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  }
  return Number(r.body.num_documents || 0);
}

async function dropCollection() {
  console.log('Dropping the entire products collection (schema + docs)…');
  const r = await req('DELETE', '/collections/products');
  if (r.status !== 200 && r.status !== 404) {
    throw new Error(`drop failed: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  }
  console.log(`  ✓ collection dropped (status ${r.status})`);
}

async function deleteAllDocuments() {
  // Typesense supports bulk-delete via filter; use a tautology that matches
  // every document. id is always present so `id:!=__never_match__` selects all.
  const filter = encodeURIComponent('id:!=__never_match_token__');
  const r = await req('DELETE',
    `/collections/products/documents?filter_by=${filter}&batch_size=1000`);
  if (r.status !== 200) {
    throw new Error(`bulk delete failed: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  }
  console.log(`  ✓ deleted ${r.body.num_deleted || 0} documents`);
  return Number(r.body.num_deleted || 0);
}

(async () => {
  const total = await count();
  console.log(`Typesense /collections/products num_documents = ${total.toLocaleString()}`);
  if (total === 0 && !HARD) {
    console.log('Nothing to delete.');
    return;
  }
  if (!YES) {
    console.log('\nDRY-RUN — pass --yes to actually wipe.');
    console.log(HARD ? '  (--hard set: collection would be dropped entirely.)'
                     : '  (Docs would be deleted; schema kept. Add --hard to drop the schema too.)');
    return;
  }
  if (HARD) {
    await dropCollection();
  } else {
    await deleteAllDocuments();
  }
  const after = await count().catch(() => -1);
  console.log(`\nDone. num_documents now = ${after === -1 ? '(collection gone)' : after.toLocaleString()}`);
})().catch(err => {
  console.error('\nFATAL:', err.message || err);
  process.exit(1);
});
