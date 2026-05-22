'use strict';
// Quick PB source breakdown — to verify we only deleted Icecat.
const { req } = require('../migration/pb');

async function count(filter) {
  const r = await req('GET',
    `/api/collections/products/records?perPage=1&page=1&skipTotal=0&filter=${encodeURIComponent(filter)}&fields=id`);
  if (r.status !== 200) throw new Error(`count failed: ${r.status}`);
  return Number(r.body.totalItems || 0);
}

(async () => {
  const sources = [
    ['icecat',            'source="icecat"'],
    ['epey.com / epey',   '(source="epey.com" || source="epey")'],
    ['geizhals.eu',       '(source="geizhals.eu" || source="geizhals")'],
    ['admin',             'source="admin"'],
    ['amazon-paapi',      'source="amazon-paapi"'],
    ['ebay-browse',       'source="ebay-browse"'],
    ['Legacy.eu',         'source="Legacy.eu"'],
    ['csv import',        'source~"mobile_products"'],
    ['all (total)',       ''],
  ];

  console.log('=== PocketBase products by source ===\n');
  let total = 0;
  for (const [label, filter] of sources) {
    try {
      const n = await count(filter);
      if (label === 'all (total)') total = n;
      console.log(`  ${label.padEnd(25)} ${n.toString().padStart(8)}`);
    } catch (e) {
      console.log(`  ${label.padEnd(25)}    ERROR (${e.message.slice(0, 60)})`);
    }
  }
  console.log('\n=== Category breakdown (top 20 by count) ===\n');
  try {
    const r = await req('GET',
      `/api/collections/products/records?perPage=500&page=1&skipTotal=0&filter=&fields=category&sort=created`);
    if (r.status === 200) {
      // Sample first page only — fast enough for a sanity check.
      const counts = {};
      for (const p of r.body.items || []) {
        const c = (p.category || '(none)').toLowerCase();
        counts[c] = (counts[c] || 0) + 1;
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      for (const [cat, n] of sorted.slice(0, 25)) {
        console.log(`  ${cat.padEnd(25)} ${n.toString().padStart(6)}`);
      }
      console.log(`\n  (sample of ${r.body.items.length} most-recently-created products)`);
    }
  } catch (e) {
    console.log(`  category sample failed: ${e.message}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
