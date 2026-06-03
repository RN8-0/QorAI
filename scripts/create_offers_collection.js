/**
 * Qor AI — create the `offers` collection
 *
 * One row per canonical retailer offer: live price + affiliate deep link.
 * Source-agnostic — merchant feeds, eBay Browse, Amazon PA-API, Awin,
 * Admitad/GelirOrtaklari etc. all write here through scripts/lib/offers.js.
 *
 * Icecat stays specs-only; it just supplies the canonical product plus its
 * gtin / mpn, which the offer connectors match against.
 *
 *   node scripts/create_offers_collection.js
 *
 * Idempotent: does nothing if the collection already exists.
 */
'use strict';

const { req } = require('../migration/pb');

const COLLECTION = {
  name: 'offers',
  type: 'base',
  // App reads offers (public, like products); only superusers write.
  listRule: '',
  viewRule: '',
  createRule: null,
  updateRule: null,
  deleteRule: null,
  fields: [
    { name: 'productId',         type: 'text', max: 50 },   // PB id of the product
    { name: 'gtin',              type: 'text', max: 50 },   // fallback match key
    { name: 'mpn',               type: 'text', max: 100 },
    { name: 'merchantProductId', type: 'text', max: 140 },
    { name: 'title',             type: 'text', max: 500 },
    { name: 'store',             type: 'text', max: 100 },  // MediaMarkt, Amazon…
    { name: 'network',           type: 'text', max: 40 },   // awin, ebay, admitad…
    { name: 'country',           type: 'text', max: 4 },    // TR, DE, GB…
    { name: 'price',             type: 'number', min: 0 },
    { name: 'shipping',          type: 'number', min: 0 },
    { name: 'totalPrice',        type: 'number', min: 0 },
    { name: 'currency',          type: 'text', max: 4 },
    { name: 'priceText',         type: 'text', max: 80 },
    { name: 'url',               type: 'text', max: 2500 }, // retailer URL
    { name: 'affiliateUrl',      type: 'text', max: 2500 }, // affiliate deep link
    { name: 'condition',         type: 'text', max: 20 },   // new / refurbished / used
    { name: 'availability',      type: 'text', max: 40 },   // in_stock / out_of_stock
    { name: 'inStock',           type: 'bool' },
    { name: 'priceUnknown',      type: 'bool' },
    { name: 'matchConfidence',   type: 'number', min: 0, max: 1 },
    { name: 'offerKey',          type: 'text', max: 255 },
    { name: 'source',            type: 'text', max: 60 },   // connector id
    { name: 'lastCheckedAt',     type: 'date' },
    { name: 'priceUpdatedAt',    type: 'date' },
    { name: 'expiresAt',         type: 'date' },
    { name: 'scrapedAt',         type: 'date' },
    { name: 'created',      type: 'autodate', onCreate: true },
    { name: 'updated',      type: 'autodate', onCreate: true, onUpdate: true },
  ],
  indexes: [
    'CREATE INDEX `idx_offers_productId` ON `offers` (`productId`)',
    'CREATE INDEX `idx_offers_gtin` ON `offers` (`gtin`)',
    'CREATE INDEX `idx_offers_dedup` ON `offers` (`productId`, `store`, `country`)',
    'CREATE INDEX `idx_offers_offerKey` ON `offers` (`offerKey`)',
    'CREATE INDEX `idx_offers_fresh` ON `offers` (`productId`, `country`, `expiresAt`)',
  ],
};

async function main() {
  const existing = await req('GET', '/api/collections/offers');
  if (existing.status === 200) {
    console.log('  offers collection already exists — nothing to do.');
    return;
  }
  const r = await req('POST', '/api/collections', COLLECTION);
  if (![200, 201].includes(r.status)) {
    throw new Error(`create failed (${r.status}): ${JSON.stringify(r.body).slice(0, 500)}`);
  }
  console.log('  ✓ offers collection created.');
}

main().catch(e => { console.error('  ✗', e.message); process.exit(1); });
