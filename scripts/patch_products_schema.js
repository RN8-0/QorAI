/**
 * Qor AI — products collection schema patch
 *
 * Adds the fields + indexes the admin and ingestor need so that:
 *   - newest-first pagination uses an index instead of a full sort scan
 *   - the Icecat upsert dedup lookup (icecatId/gtin/mpn) is indexed
 *   - server-side variant grouping is possible (variantPrimary + index)
 *
 * Safe + idempotent: only appends what is missing, never drops anything.
 *
 *   node scripts/patch_products_schema.js
 */
'use strict';

const { req } = require('../migration/pb');

const NEW_FIELDS = [
  { name: 'variantPrimary', type: 'bool' },
  { name: 'variantCount',   type: 'number', min: 0 },
];

const NEW_INDEXES = [
  'CREATE INDEX `idx_products_scrapedAt` ON `products` (`scrapedAt`)',
  'CREATE INDEX `idx_products_variantGroup` ON `products` (`variantGroup`)',
  'CREATE INDEX `idx_products_variantPrimary` ON `products` (`variantPrimary`)',
  'CREATE INDEX `idx_products_icecatId` ON `products` (`icecatId`)',
  'CREATE INDEX `idx_products_gtin` ON `products` (`gtin`)',
  'CREATE INDEX `idx_products_mpn` ON `products` (`mpn`)',
  // Composite indexes: the grouped product list filters variantPrimary AND
  // sorts at the same time. A single-column index can only serve one of the
  // two, forcing SQLite to scan thousands of recent non-primary rows. These
  // let the filter+sort be satisfied by one index.
  'CREATE INDEX `idx_products_vp_scraped` ON `products` (`variantPrimary`, `scrapedAt`)',
  'CREATE INDEX `idx_products_vp_score` ON `products` (`variantPrimary`, `techScore`)',
  // Grouped list + a brand or category filter: 3-column composites so the
  // filter and the sort are both index-served.
  'CREATE INDEX `idx_products_vp_brand` ON `products` (`variantPrimary`, `brand`, `scrapedAt`)',
  'CREATE INDEX `idx_products_vp_cat` ON `products` (`variantPrimary`, `category`, `scrapedAt`)',
];

async function main() {
  const get = await req('GET', '/api/collections/products');
  if (get.status !== 200) throw new Error(`fetch collection failed: ${JSON.stringify(get.body).slice(0, 200)}`);
  const col = get.body;

  const fields = (col.fields || []).slice();
  const haveField = new Set(fields.map(f => f.name));
  let addedFields = 0;
  for (const f of NEW_FIELDS) {
    if (!haveField.has(f.name)) { fields.push(f); addedFields++; console.log(`  + field ${f.name} (${f.type})`); }
    else console.log(`  = field ${f.name} already present`);
  }

  const indexes = (col.indexes || []).slice();
  const indexName = s => (s.match(/INDEX `?([^`\s]+)`?/i) || [])[1];
  const haveIndex = new Set(indexes.map(indexName));
  let addedIndexes = 0;
  for (const ix of NEW_INDEXES) {
    const n = indexName(ix);
    if (!haveIndex.has(n)) { indexes.push(ix); addedIndexes++; console.log(`  + index ${n}`); }
    else console.log(`  = index ${n} already present`);
  }

  if (!addedFields && !addedIndexes) { console.log('\n  Nothing to do — schema already patched.\n'); return; }

  const patch = await req('PATCH', '/api/collections/products', { fields, indexes });
  if (patch.status !== 200) throw new Error(`schema patch failed: ${JSON.stringify(patch.body).slice(0, 400)}`);
  console.log(`\n  Done — ${addedFields} field(s), ${addedIndexes} index(es) added.\n`);
}

main().catch(e => { console.error('  ✗', e.message); process.exit(1); });
