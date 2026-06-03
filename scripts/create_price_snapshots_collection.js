/**
 * Qor AI — create the `price_snapshots` collection
 *
 * Optional history table for charts and audits. `scripts/lib/offers.js`
 * writes one snapshot whenever a real priced offer is updated. If this
 * collection is not installed, offer sync still works; installing it unlocks
 * price history and "price changed" diagnostics.
 *
 *   node scripts/create_price_snapshots_collection.js
 */
'use strict';

const { req } = require('../migration/pb');

const COLLECTION = {
  name: 'price_snapshots',
  type: 'base',
  listRule: '',
  viewRule: '',
  createRule: null,
  updateRule: null,
  deleteRule: null,
  fields: [
    { name: 'offerId', type: 'text', max: 50 },
    { name: 'productId', type: 'text', max: 50 },
    { name: 'store', type: 'text', max: 100 },
    { name: 'network', type: 'text', max: 40 },
    { name: 'country', type: 'text', max: 4 },
    { name: 'price', type: 'number', min: 0 },
    { name: 'shipping', type: 'number', min: 0 },
    { name: 'totalPrice', type: 'number', min: 0 },
    { name: 'currency', type: 'text', max: 4 },
    { name: 'availability', type: 'text', max: 40 },
    { name: 'condition', type: 'text', max: 20 },
    { name: 'source', type: 'text', max: 60 },
    { name: 'checkedAt', type: 'date' },
    { name: 'created', type: 'autodate', onCreate: true },
  ],
  indexes: [
    'CREATE INDEX `idx_price_snapshots_offer` ON `price_snapshots` (`offerId`, `checkedAt`)',
    'CREATE INDEX `idx_price_snapshots_product` ON `price_snapshots` (`productId`, `country`, `checkedAt`)',
  ],
};

async function main() {
  const existing = await req('GET', '/api/collections/price_snapshots');
  if (existing.status === 200) {
    console.log('  price_snapshots collection already exists — nothing to do.');
    return;
  }
  const r = await req('POST', '/api/collections', COLLECTION);
  if (![200, 201].includes(r.status)) {
    throw new Error(`create failed (${r.status}): ${JSON.stringify(r.body).slice(0, 500)}`);
  }
  console.log('  ✓ price_snapshots collection created.');
}

main().catch(e => { console.error('  ✗', e.message); process.exit(1); });
