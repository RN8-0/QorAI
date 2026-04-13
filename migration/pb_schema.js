// Compair PocketBase schema — creates all collections via PB admin API.
// Idempotent: if a collection exists, it's skipped (delete manually to recreate).
const { req } = require('./pb');

// PocketBase v0.23+ field type shorthand:
// { name, type, required?, max?, min?, options?, presentable? }
// Types: text, number, bool, email, url, date, autodate, json, relation, file, editor, select

const T = (name, o = {}) => ({ name, type: 'text', max: o.max || 2000, min: o.min || 0, ...o });
const N = (name, o = {}) => ({ name, type: 'number', ...o });
const B = (name, o = {}) => ({ name, type: 'bool', ...o });
const U = (name, o = {}) => ({ name, type: 'url', ...o });
const D = (name, o = {}) => ({ name, type: 'date', ...o });
const AD = (name, onCreate, onUpdate) => ({ name, type: 'autodate', onCreate: !!onCreate, onUpdate: !!onUpdate });
const J = (name, o = {}) => ({ name, type: 'json', maxSize: 2000000, ...o });
const R = (name, col, o = {}) => ({ name, type: 'relation', collectionId: col, maxSelect: o.maxSelect || 1, cascadeDelete: !!o.cascade, ...o });

// Helpers to add required id field
const withMeta = (fields) => [
  { name: 'id', type: 'text', primaryKey: true, system: true, required: true, autogeneratePattern: '[a-z0-9]{15}', min: 15, max: 15, pattern: '^[a-z0-9]+$' },
  ...fields,
  AD('created', true, false),
  AD('updated', true, true),
];

const collections = [
  {
    name: 'categories',
    type: 'base',
    fields: withMeta([
      T('slug', { required: true, presentable: true }),
      T('name', { required: true, presentable: true }),
      T('nameEn'),
      T('icon'),
      T('emoji'),
      N('order'),
      B('isActive'),
      N('productCount'),
      J('subcategories'),
    ]),
    indexes: ['CREATE UNIQUE INDEX `idx_categories_slug` ON `categories` (`slug`)'],
    listRule: '', viewRule: '', // public read
  },
  {
    name: 'category_templates',
    type: 'base',
    fields: withMeta([
      T('slug', { required: true, presentable: true }),
      T('name', { presentable: true }),
      T('icon'),
      J('specFields'),
    ]),
    indexes: ['CREATE UNIQUE INDEX `idx_cat_tmpl_slug` ON `category_templates` (`slug`)'],
    listRule: '', viewRule: '',
  },
  {
    name: 'products',
    type: 'base',
    fields: withMeta([
      T('slug', { required: true, max: 200, presentable: true }),
      T('name', { required: true, max: 500, presentable: true }),
      T('brand', { max: 200 }),
      T('category', { max: 100 }),
      T('source', { max: 100 }),
      U('sourceUrl'),
      U('imageUrl'),
      J('images'),
      J('specs'),
      J('specSections'),
      J('keySpecs'),
      N('techScore'),
      T('price_raw', { max: 200 }),
      T('price_segment', { max: 100 }),
      N('specsCount'),
      T('variantGroup', { max: 200 }),
      D('scrapedAt'),
    ]),
    indexes: [
      'CREATE UNIQUE INDEX `idx_products_slug` ON `products` (`slug`)',
      'CREATE INDEX `idx_products_category` ON `products` (`category`)',
      'CREATE INDEX `idx_products_brand` ON `products` (`brand`)',
      'CREATE INDEX `idx_products_tech` ON `products` (`techScore`)',
    ],
    listRule: '', viewRule: '',
  },
  {
    name: 'subscriptions',
    type: 'base',
    fields: withMeta([
      T('slug', { required: true, presentable: true }),
      T('name', { required: true, presentable: true }),
      T('category'),
      U('logo'),
      U('website'),
      U('affiliateUrl'),
      B('isActive'),
      T('description', { max: 5000 }),
      J('pros'),
      J('cons'),
      J('platforms'),
      J('plans'),
    ]),
    indexes: ['CREATE UNIQUE INDEX `idx_subs_slug` ON `subscriptions` (`slug`)'],
    listRule: '', viewRule: '',
  },
  {
    name: 'subscription_services',
    type: 'base',
    fields: withMeta([
      T('slug', { required: true, presentable: true }),
      T('name', { required: true, presentable: true }),
      T('category'),
      U('logo'),
      U('websiteUrl'),
      U('website'),
      J('features'),
      J('pricing'),
      J('platforms'),
    ]),
    indexes: ['CREATE UNIQUE INDEX `idx_sub_svc_slug` ON `subscription_services` (`slug`)'],
    listRule: '', viewRule: '',
  },
  {
    name: 'reviews',
    type: 'base',
    fields: withMeta([
      T('productId', { required: true }),
      T('userId'),
      N('rating'),
      T('text', { max: 5000 }),
      B('reported'),
      N('helpful'),
    ]),
    indexes: ['CREATE INDEX `idx_reviews_product` ON `reviews` (`productId`)'],
    listRule: '', viewRule: '',
  },
  {
    name: 'comparison_reviews',
    type: 'base',
    fields: withMeta([
      J('productIds'),
      T('displayName'),
      T('docKey'),
      T('userId'),
      T('reviewText', { max: 5000 }),
      D('timestamp'),
    ]),
    listRule: '', viewRule: '',
  },
  {
    name: 'price_history',
    type: 'base',
    fields: withMeta([
      T('productId', { required: true }),
      T('productName'),
      J('prices'),
      N('lowestPrice'),
      T('lowestStore'),
      D('scrapedAt'),
    ]),
    indexes: ['CREATE INDEX `idx_price_product` ON `price_history` (`productId`)'],
    listRule: '', viewRule: '',
  },
  {
    name: 'trends',
    type: 'base',
    fields: withMeta([
      T('category'),
      T('country'),
      T('period'),
      D('weekStart'),
      D('weekEnd'),
      J('items'),
      T('source'),
    ]),
    listRule: '', viewRule: '',
  },
  {
    name: 'user_links',
    type: 'base',
    fields: withMeta([
      T('userId', { required: true }),
      U('url', { required: true }),
      J('ogMetadata'),
      N('aiScore'),
      T('aiAnalysis', { max: 5000 }),
      T('category'),
    ]),
    indexes: ['CREATE INDEX `idx_user_links_user` ON `user_links` (`userId`)'],
    listRule: "@request.auth.id != '' && userId = @request.auth.id",
    viewRule: "@request.auth.id != '' && userId = @request.auth.id",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != '' && userId = @request.auth.id",
    deleteRule: "@request.auth.id != '' && userId = @request.auth.id",
  },
  {
    name: 'app_config',
    type: 'base',
    fields: withMeta([
      T('key', { required: true, presentable: true }),
      J('value'),
    ]),
    indexes: ['CREATE UNIQUE INDEX `idx_app_config_key` ON `app_config` (`key`)'],
    listRule: '', viewRule: '',
  },
  {
    name: 'scraper_sources',
    type: 'base',
    fields: withMeta([
      T('name', { presentable: true }),
      N('failureCount'),
      D('lastSuccessfulScrape'),
      J('data'),
    ]),
    listRule: null, viewRule: null, // admin only
  },
];

// Extend the default "users" auth collection with Compair-specific fields
async function extendUsers() {
  const r = await req('GET', '/api/collections/users');
  if (r.status !== 200) { console.log('[users] not found, skipping extension'); return; }
  const col = r.body;
  const extra = ['fcmToken', 'platform', 'country', 'fcmTokenUpdatedAt'];
  const existing = new Set(col.fields.map(f => f.name));
  const toAdd = [];
  if (!existing.has('fcmToken')) toAdd.push(T('fcmToken'));
  if (!existing.has('platform')) toAdd.push(T('platform', { max: 50 }));
  if (!existing.has('country')) toAdd.push(T('country', { max: 10 }));
  if (!existing.has('fcmTokenUpdatedAt')) toAdd.push(D('fcmTokenUpdatedAt'));
  if (toAdd.length === 0) { console.log('[users] already extended'); return; }
  const patched = { fields: [...col.fields, ...toAdd] };
  const p = await req('PATCH', `/api/collections/${col.id}`, patched);
  console.log('[users] extend:', p.status, p.body?.message || 'ok');
}

(async () => {
  // Step 1: create each collection if missing
  const existing = await req('GET', '/api/collections?perPage=200');
  const have = new Set(existing.body.items.map(c => c.name));
  for (const c of collections) {
    if (have.has(c.name)) { console.log(`[${c.name}] exists, skip`); continue; }
    const r = await req('POST', '/api/collections', c);
    if (r.status === 200 || r.status === 201) {
      console.log(`[${c.name}] created (${r.body.id})`);
    } else {
      console.error(`[${c.name}] FAILED:`, r.status, JSON.stringify(r.body));
    }
  }
  // Step 2: extend users auth collection
  await extendUsers();
  console.log('Done.');
})().catch(e => { console.error(e); process.exit(1); });
