'use strict';

const { req } = require('../migration/pb');

const BAD_CATEGORIES = [
  'small_appliances',
  'coffee_makers',
  'dishwashers',
  'microwaves',
  'tumble_dryers',
  'washing_machines',
  'hobs',
  'fridge_freezers',
  'ovens',
  'vacuums',
  'smart_home',
  'led_bulbs',
];

const DRY_RUN = process.argv.includes('--dry-run');
const YES = process.argv.includes('--yes');

function esc(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function fetchBatch(page = 1) {
  const catFilter = BAD_CATEGORIES.map(cat => `category="${esc(cat)}"`).join(' || ');
  const filter = `source="icecat" && (${catFilter})`;
  const r = await req('GET',
    `/api/collections/products/records?perPage=200&page=${page}&filter=${encodeURIComponent(filter)}&fields=id,name,category,source`);
  if (r.status !== 200) throw new Error(`fetch bad icecat products: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body.items || [];
}

async function main() {
  if (!DRY_RUN && !YES) {
    throw new Error('Refusing to delete without --yes. Use --dry-run to count first.');
  }

  let total = 0;
  let page = 1;
  for (;;) {
    const items = await fetchBatch(DRY_RUN ? page : 1);
    if (!items.length) break;
    total += items.length;
    const sample = items.slice(0, 3).map(p => `${p.category}:${p.name || p.id}`).join(' | ');
    console.log(`${DRY_RUN ? 'would delete' : 'deleting'} ${items.length} source=icecat bad-category products${sample ? ` — ${sample}` : ''}`);
    if (DRY_RUN) {
      if (items.length < 200) break;
      page++;
      continue;
    }
    for (const item of items) {
      const r = await req('DELETE', `/api/collections/products/records/${item.id}`);
      if (![200, 204].includes(r.status)) {
        console.warn(`delete failed ${item.id}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
      }
    }
  }
  console.log(`${DRY_RUN ? 'dry-run total' : 'deleted total'}: ${total}`);
}

main().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
