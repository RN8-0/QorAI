/**
 * Qor AI — offers schema patch
 *
 * Safe + idempotent. Adds the fields needed for dynamic prices, freshness,
 * offer matching and affiliate click routing without deleting existing offers.
 *
 *   node scripts/patch_offers_schema.js
 */
'use strict';

const { req } = require('../migration/pb');

const NEW_FIELDS = [
  { name: 'merchantProductId', type: 'text', max: 140 },
  { name: 'title', type: 'text', max: 500 },
  { name: 'shipping', type: 'number', min: 0 },
  { name: 'totalPrice', type: 'number', min: 0 },
  { name: 'availability', type: 'text', max: 40 },
  { name: 'priceUnknown', type: 'bool' },
  { name: 'matchConfidence', type: 'number', min: 0, max: 1 },
  { name: 'offerKey', type: 'text', max: 255 },
  { name: 'lastCheckedAt', type: 'date' },
  { name: 'priceUpdatedAt', type: 'date' },
  { name: 'expiresAt', type: 'date' },
];

const NEW_INDEXES = [
  'CREATE INDEX `idx_offers_offerKey` ON `offers` (`offerKey`)',
  'CREATE INDEX `idx_offers_fresh` ON `offers` (`productId`, `country`, `expiresAt`)',
];

function indexName(sql) {
  return (sql.match(/INDEX `?([^`\s]+)`?/i) || [])[1] || '';
}

async function main() {
  const get = await req('GET', '/api/collections/offers');
  if (get.status === 404) {
    console.log('  offers collection missing — creating it first.');
    require('./create_offers_collection');
    return;
  }
  if (get.status !== 200) {
    throw new Error(`fetch offers collection failed: ${JSON.stringify(get.body).slice(0, 300)}`);
  }

  const col = get.body;
  const fields = (col.fields || []).slice();
  const haveField = new Set(fields.map(f => f.name));
  let addedFields = 0;
  for (const f of NEW_FIELDS) {
    if (haveField.has(f.name)) {
      console.log(`  = field ${f.name} already present`);
    } else {
      fields.push(f);
      addedFields++;
      console.log(`  + field ${f.name} (${f.type})`);
    }
  }

  const indexes = (col.indexes || []).slice();
  const haveIndex = new Set(indexes.map(indexName));
  let addedIndexes = 0;
  for (const ix of NEW_INDEXES) {
    const name = indexName(ix);
    if (haveIndex.has(name)) {
      console.log(`  = index ${name} already present`);
    } else {
      indexes.push(ix);
      addedIndexes++;
      console.log(`  + index ${name}`);
    }
  }

  if (!addedFields && !addedIndexes) {
    console.log('\n  Nothing to do — offers schema already patched.\n');
    return;
  }

  const patch = await req('PATCH', '/api/collections/offers', { fields, indexes });
  if (patch.status !== 200) {
    throw new Error(`offers schema patch failed: ${JSON.stringify(patch.body).slice(0, 500)}`);
  }
  console.log(`\n  Done — ${addedFields} field(s), ${addedIndexes} index(es) added.\n`);
}

main().catch(e => { console.error('  ✗', e.message); process.exit(1); });
