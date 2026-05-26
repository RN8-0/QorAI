const { req } = require('../migration/pb');

const productFields = [
  { name: 'id', type: 'text', primaryKey: true, system: true, required: true, autogeneratePattern: '[a-z0-9]{15}', min: 15, max: 15, pattern: '^[a-z0-9]+$' },
  { name: 'slug', type: 'text', required: true, max: 200, min: 0, presentable: true },
  { name: 'name', type: 'text', required: true, max: 500, min: 0, presentable: true },
  { name: 'brand', type: 'text', max: 200, min: 0 },
  { name: 'category', type: 'text', max: 100, min: 0 },
  { name: 'source', type: 'text', max: 100, min: 0 },
  { name: 'sourceUrl', type: 'url' },
  { name: 'imageUrl', type: 'url' },
  { name: 'images', type: 'json', maxSize: 2000000 },
  { name: 'specs', type: 'json', maxSize: 2000000 },
  { name: 'specSections', type: 'json', maxSize: 2000000 },
  { name: 'keySpecs', type: 'json', maxSize: 2000000 },
  // Multi-language payload written by the scraper translation pipeline.
  // Without these fields PB silently strips them on save and the modal
  // language picker shows every locale as "(fallback)".
  { name: 'multiLangSpecs',    type: 'json', maxSize: 5000000 },
  { name: 'multiLangSections', type: 'json', maxSize: 1000000 },
  { name: 'nameTranslated',    type: 'json', maxSize: 100000  },
  { name: 'specsEn',           type: 'json', maxSize: 2000000 },
  // Original source-language payload. For Epey this is Turkish; the
  // canonical specs above stay English for scoring/search.
  { name: 'sourceLang',         type: 'text', max: 10, min: 0 },
  { name: 'sourceSpecs',        type: 'json', maxSize: 5000000 },
  { name: 'sourceSpecSections', type: 'json', maxSize: 5000000 },
  { name: 'sourceKeySpecs',     type: 'json', maxSize: 2000000 },
  { name: 'techScore', type: 'number' },
  { name: 'price_raw', type: 'text', max: 200, min: 0 },
  { name: 'price_segment', type: 'text', max: 100, min: 0 },
  { name: 'specsCount', type: 'number' },
  { name: 'variantGroup', type: 'text', max: 200, min: 0 },
  { name: 'scrapedAt', type: 'date' },
  // Icecat Open Catalog fields (added 2026-05) — needed for affiliate matching
  { name: 'gtin',     type: 'text',   max: 200, min: 0 },
  { name: 'mpn',      type: 'text',   max: 200, min: 0 },
  { name: 'icecatId', type: 'number' },
  { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
  { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
];

const indexes = [
  'CREATE UNIQUE INDEX `idx_products_slug` ON `products` (`slug`)',
  'CREATE INDEX `idx_products_category` ON `products` (`category`)',
  'CREATE INDEX `idx_products_brand` ON `products` (`brand`)',
  'CREATE INDEX `idx_products_tech` ON `products` (`techScore`)',
];

async function main() {
  const collection = await req('GET', '/api/collections/products');
  if (collection.status !== 200) throw new Error(`Collection read failed: ${JSON.stringify(collection.body)}`);

  const existing = await req('GET', '/api/collections/products/records');
  if (existing.status !== 200) throw new Error(`List failed: ${JSON.stringify(existing.body)}`);
  for (const item of existing.body.items || []) {
    const deleted = await req('DELETE', `/api/collections/products/records/${item.id}`);
    if (![200, 204].includes(deleted.status)) throw new Error(`Delete ${item.id} failed: ${JSON.stringify(deleted.body)}`);
    console.log(`deleted stale product record ${item.id}`);
  }

  const patched = await req('PATCH', '/api/collections/products', {
    ...collection.body,
    fields: productFields,
    indexes,
    listRule: '',
    viewRule: '',
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });
  if (patched.status !== 200) throw new Error(`Patch failed: ${JSON.stringify(patched.body)}`);
  console.log(`products schema repaired, fields=${patched.body.fields.length}`);
}

main().catch(error => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
