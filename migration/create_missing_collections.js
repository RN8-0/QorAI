// Qor AI — Create all missing PocketBase collections
const { req } = require('./pb');

const T = (name, o = {}) => ({ name, type: 'text', max: o.max || 2000, min: o.min || 0, required: !!o.required });
const N = (name, o = {}) => ({ name, type: 'number', ...o });
const B = (name, o = {}) => ({ name, type: 'bool', ...o });
const D = (name, o = {}) => ({ name, type: 'date', ...o });
const AD = (name, onCreate, onUpdate) => ({ name, type: 'autodate', onCreate: !!onCreate, onUpdate: !!onUpdate });
const J = (name, o = {}) => ({ name, type: 'json', maxSize: 2000000, ...o });

const withMeta = (fields) => [
  { name: 'id', type: 'text', primaryKey: true, system: true, required: true, autogeneratePattern: '[a-z0-9]{15}', min: 15, max: 15, pattern: '^[a-z0-9]+$' },
  ...fields,
  AD('created', true, false),
  AD('updated', true, true),
];

const authRule = "@request.auth.id != ''";
const ownerRule = (field) => `@request.auth.id != '' && ${field} = @request.auth.id`;

const MISSING_COLLECTIONS = [
  {
    name: 'comparisons',
    type: 'base',
    fields: withMeta([
      T('userId', { required: true }),
      J('productIds'),          // list of product IDs
      T('title', { max: 500 }),
      J('notes'),
      B('isShared'),
      T('shareCode', { max: 50 }),
    ]),
    indexes: [
      'CREATE INDEX `idx_comparisons_user` ON `comparisons` (`userId`)',
      'CREATE UNIQUE INDEX `idx_comparisons_share` ON `comparisons` (`shareCode`)',
    ],
    listRule: ownerRule('userId'),
    viewRule: `@request.auth.id != '' && (userId = @request.auth.id || isShared = true)`,
    createRule: authRule,
    updateRule: ownerRule('userId'),
    deleteRule: ownerRule('userId'),
  },
  {
    name: 'recently_viewed',
    type: 'base',
    fields: withMeta([
      T('userId', { required: true }),
      T('productId', { required: true }),
      T('productName', { max: 500 }),
      T('category', { max: 100 }),
      D('viewedAt'),
    ]),
    indexes: [
      'CREATE INDEX `idx_rv_user` ON `recently_viewed` (`userId`)',
      'CREATE INDEX `idx_rv_viewed` ON `recently_viewed` (`viewedAt`)',
    ],
    listRule: ownerRule('userId'),
    viewRule: ownerRule('userId'),
    createRule: authRule,
    updateRule: ownerRule('userId'),
    deleteRule: ownerRule('userId'),
  },
  {
    name: 'review_replies',
    type: 'base',
    fields: withMeta([
      T('reviewId', { required: true }),
      T('userId', { required: true }),
      T('displayName', { max: 200 }),
      T('text', { max: 2000 }),
      B('reported'),
      N('helpful'),
    ]),
    indexes: ['CREATE INDEX `idx_rr_review` ON `review_replies` (`reviewId`)'],
    listRule: '',
    viewRule: '',
    createRule: authRule,
    updateRule: ownerRule('userId'),
    deleteRule: ownerRule('userId'),
  },
  {
    name: 'public_config',
    type: 'base',
    fields: withMeta([
      T('key', { required: true, max: 200 }),
      J('value'),
    ]),
    indexes: ['CREATE UNIQUE INDEX `idx_public_config_key` ON `public_config` (`key`)'],
    listRule: '',
    viewRule: '',
    createRule: null,
    updateRule: null,
    deleteRule: null,
  },
  {
    name: 'scraper_schedules',
    type: 'base',
    fields: withMeta([
      T('name', { required: true, max: 200 }),
      T('frequency', { max: 50 }),
      N('dayOfWeek'),
      N('dayOfMonth'),
      N('hour'),
      J('brandIds'),
      J('categoryIds'),
      B('isActive'),
      D('lastRun'),
      D('nextRun'),
    ]),
    indexes: ['CREATE INDEX `idx_scraper_schedules_name` ON `scraper_schedules` (`name`)'],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  },
  {
    name: 'scraper_logs',
    type: 'base',
    fields: withMeta([
      T('type', { max: 50 }),
      T('status', { max: 50 }),
      D('startedAt'),
      D('completedAt'),
      T('sourceId', { max: 50 }),
      T('brandId', { max: 50 }),
      T('categoryId', { max: 50 }),
      N('productsFound'),
      N('productsAdded'),
      N('productsDuplicate'),
      N('productsFailed'),
      T('errorMessage', { max: 5000 }),
      J('details'),
    ]),
    indexes: ['CREATE INDEX `idx_scraper_logs_startedAt` ON `scraper_logs` (`startedAt`)'],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  },
  {
    name: 'saved_analyses',
    type: 'base',
    fields: withMeta([
      T('userId', { required: true }),
      T('url', { max: 2000 }),
      T('title', { max: 500 }),
      T('category', { max: 100 }),
      J('analysisData'),
      N('aiScore'),
      T('aiSummary', { max: 5000 }),
      D('savedAt'),
    ]),
    indexes: ['CREATE INDEX `idx_sa_user` ON `saved_analyses` (`userId`)'],
    listRule: ownerRule('userId'),
    viewRule: ownerRule('userId'),
    createRule: authRule,
    updateRule: ownerRule('userId'),
    deleteRule: ownerRule('userId'),
  },
  {
    name: 'support_messages',
    type: 'base',
    fields: withMeta([
      T('userId'),
      T('displayName', { required: true, max: 200 }),
      { name: 'email', type: 'email', required: true },
      { name: 'message', type: 'editor', required: true },
      T('status', { max: 50 }),
      { name: 'adminReply', type: 'editor' },
      D('repliedAt'),
    ]),
    indexes: [
      'CREATE INDEX `idx_support_messages_user` ON `support_messages` (`userId`)',
      'CREATE INDEX `idx_support_messages_status` ON `support_messages` (`status`)',
    ],
    listRule: null,
    viewRule: null,
    createRule: authRule,
    updateRule: null,
    deleteRule: null,
  },
  {
    name: 'chat_conversations',
    type: 'base',
    fields: withMeta([
      T('userId', { required: true }),
      T('title', { max: 500 }),
      J('messages'),           // [{role, content, timestamp}]
      J('context'),            // product context
      T('model', { max: 100 }),
      D('lastMessageAt'),
      N('messageCount'),
    ]),
    indexes: [
      'CREATE INDEX `idx_chat_user` ON `chat_conversations` (`userId`)',
      'CREATE INDEX `idx_chat_last` ON `chat_conversations` (`lastMessageAt`)',
    ],
    listRule: ownerRule('userId'),
    viewRule: ownerRule('userId'),
    createRule: authRule,
    updateRule: ownerRule('userId'),
    deleteRule: ownerRule('userId'),
  },
  {
    name: 'ai_compare_cache',
    type: 'base',
    fields: withMeta([
      T('cacheKey', { required: true, max: 200 }),  // sortedProductIds_feature
      T('feature', { max: 100 }),
      J('data'),
      D('expiresAt'),
    ]),
    indexes: ['CREATE UNIQUE INDEX `idx_ai_cache_key` ON `ai_compare_cache` (`cacheKey`)'],
    listRule: '',
    viewRule: '',
    createRule: null,   // server only
    updateRule: null,
    deleteRule: null,
  },
  {
    name: 'affiliate_clicks',
    type: 'base',
    fields: withMeta([
      T('userId'),
      T('productId'),
      T('store', { max: 100 }),
      T('country', { max: 10 }),
      T('url', { max: 2000 }),
      D('clickedAt'),
    ]),
    indexes: ['CREATE INDEX `idx_ac_user` ON `affiliate_clicks` (`userId`)'],
    listRule: null,
    viewRule: null,
    createRule: '',  // anyone can log a click
    updateRule: null,
    deleteRule: null,
  },
];

(async () => {
  console.log('=== Qor AI — create missing collections ===\n');

  const existing = await req('GET', '/api/collections?perPage=200');
  const have = new Set(existing.body.items.map(c => c.name));

  for (const col of MISSING_COLLECTIONS) {
    if (have.has(col.name)) {
      console.log(`[${col.name}] already exists, skip`);
      continue;
    }
    const r = await req('POST', '/api/collections', col);
    if (r.status === 200 || r.status === 201) {
      console.log(`[${col.name}] ✓ created (${r.body.id})`);
    } else {
      console.error(`[${col.name}] ✗ FAILED:`, r.status, JSON.stringify(r.body));
    }
  }

  console.log('\nDone.');
})().catch(e => { console.error(e); process.exit(1); });
