// Qor AI — Fix products collection missing fields
const { req } = require('./pb');

const T = (name, o = {}) => ({ name, type: 'text', max: o.max || 2000, min: o.min || 0, required: !!o.required, ...o });
const N = (name, o = {}) => ({ name, type: 'number', ...o });
const B = (name, o = {}) => ({ name, type: 'bool', ...o });
const U = (name, o = {}) => ({ name, type: 'url', ...o });
const D = (name, o = {}) => ({ name, type: 'date', ...o });
const J = (name, o = {}) => ({ name, type: 'json', maxSize: 2000000, ...o });

const REQUIRED_PRODUCT_FIELDS = [
  T('subcategory', { max: 100 }),
  T('description', { max: 10000 }),
  J('prices'),             // {US: 999.0, TR: 32000.0, ...}
  J('priceRange'),         // {current, currency, ...}
  J('affiliateLinks'),     // {amazon_us: '...', ...}
  J('ratings'),            // {expert, community, count}
  J('pros'),
  J('cons'),
  J('tags'),
  N('trendScore'),
  J('techSubscores'),      // {performance, display, battery, ...}
  B('isActive'),
  D('lastUpdated'),
];

(async () => {
  console.log('=== Qor AI — products schema fix ===\n');

  const r = await req('GET', '/api/collections/products');
  if (r.status !== 200) {
    console.error('Failed to get products collection:', r.status, r.body);
    process.exit(1);
  }

  const col = r.body;
  const existing = new Set(col.fields.map(f => f.name));
  console.log('Existing fields:', [...existing].join(', '));

  const toAdd = REQUIRED_PRODUCT_FIELDS.filter(f => !existing.has(f.name));
  if (toAdd.length === 0) {
    console.log('\n✓ All product fields already exist. Nothing to do.');
    return;
  }

  console.log('\nMissing fields to add:', toAdd.map(f => f.name).join(', '));

  const patched = { fields: [...col.fields, ...toAdd] };
  const p = await req('PATCH', `/api/collections/${col.id}`, patched);

  if (p.status === 200 || p.status === 201) {
    console.log('\n✓ products collection updated successfully!');
    console.log('Added fields:', toAdd.map(f => f.name).join(', '));
  } else {
    console.error('\n✗ Failed to update products:', p.status, JSON.stringify(p.body, null, 2));
    process.exit(1);
  }
})().catch(e => { console.error('Error:', e); process.exit(1); });
