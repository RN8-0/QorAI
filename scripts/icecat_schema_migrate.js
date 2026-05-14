/**
 * Qor AI — Icecat Schema Migration
 * Adds gtin / mpn / icecatId fields to the PocketBase `products` collection.
 * Safe to run multiple times (skips already-existing fields).
 *
 * Usage:  node scripts/icecat_schema_migrate.js
 */
'use strict';

const { req } = require('../migration/pb');

const NEW_FIELDS = [
  { name: 'gtin',     type: 'text',   max: 200, min: 0 },
  { name: 'mpn',      type: 'text',   max: 200, min: 0 },
  { name: 'icecatId', type: 'number' },
];

async function main() {
  const res = await req('GET', '/api/collections/products');
  if (res.status !== 200) throw new Error('Cannot read products collection: ' + JSON.stringify(res.body));

  const schema  = res.body;
  const existing = new Set((schema.fields || []).map(f => f.name));
  const toAdd    = NEW_FIELDS.filter(f => !existing.has(f.name));

  if (!toAdd.length) {
    console.log('[schema] Already up to date — gtin, mpn, icecatId are present.');
    return;
  }

  const patched = await req('PATCH', '/api/collections/products', {
    ...schema,
    fields: [...(schema.fields || []), ...toAdd],
  });

  if (patched.status !== 200) throw new Error('Patch failed: ' + JSON.stringify(patched.body));
  console.log('[schema] Added fields: ' + toAdd.map(f => f.name).join(', '));
}

main().catch(e => { console.error('[schema] FAIL:', e.message); process.exit(1); });
