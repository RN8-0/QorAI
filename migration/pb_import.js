// Import NDJSON exports from firebase-export/ into PocketBase.
// Usage: node pb_import.js            -> imports all known collections
//        node pb_import.js products   -> imports only products
// Skips docs that are already present (based on a `firestoreId` column convention: we store
// the original Firestore doc id in a text field `slug` for products/categories/etc, and in
// `firestoreId` fallback otherwise).
const fs = require('fs');
const path = require('path');
const { raw, req, auth } = require('./pb');

const EXPORT_DIR = path.join(__dirname, 'firebase-export');
const CONCURRENCY = 20;
const BATCH_REPORT = 500;

// Map firestore collection -> PB collection + row transformer
// Each transformer receives {__id, ...data} and returns {row, idKey} where
// idKey is the unique field PB uses to detect duplicates (for idempotent re-runs).
const MAPPERS = {
  products: {
    pbName: 'products',
    idKey: 'slug',
    transform: (d) => ({
      slug: d.__id,
      name: d.name || '',
      brand: d.brand || '',
      category: d.category || '',
      source: d.source || '',
      sourceUrl: d.sourceUrl || '',
      imageUrl: d.imageUrl || '',
      images: d.images || null,
      specs: d.specs || null,
      specSections: d.specSections || null,
      keySpecs: d.keySpecs || null,
      techScore: typeof d.techScore === 'number' ? d.techScore : null,
      price_raw: d.price_raw || '',
      price_segment: d.price_segment || '',
      specsCount: typeof d.specsCount === 'number' ? d.specsCount : null,
      variantGroup: d.variantGroup || '',
      scrapedAt: fsTs(d.scrapedAt),
    }),
  },
  categories: {
    pbName: 'categories',
    idKey: 'slug',
    transform: (d) => ({
      slug: d.id || d.__id,
      name: d.name || '',
      nameEn: d.nameEn || '',
      icon: d.icon || '',
      emoji: d.emoji || '',
      order: d.order ?? null,
      isActive: !!d.isActive,
      productCount: d.productCount ?? null,
      subcategories: d.subcategories || null,
    }),
  },
  category_templates: {
    pbName: 'category_templates',
    idKey: 'slug',
    transform: (d) => ({
      slug: d.id || d.__id,
      name: d.name || '',
      icon: d.icon || '',
      specFields: d.specFields || null,
    }),
  },
  subscriptions: {
    pbName: 'subscriptions',
    idKey: 'slug',
    transform: (d) => ({
      slug: d.id || d.__id,
      name: d.name || '',
      category: d.category || '',
      logo: d.logo || '',
      website: d.website || '',
      affiliateUrl: d.affiliateUrl || '',
      isActive: !!d.isActive,
      description: d.description || '',
      pros: d.pros || null,
      cons: d.cons || null,
      platforms: d.platforms || null,
      plans: d.plans || null,
    }),
  },
  subscription_services: {
    pbName: 'subscription_services',
    idKey: 'slug',
    transform: (d) => ({
      slug: d.id || d.__id,
      name: d.name || '',
      category: d.category || '',
      logo: d.logo || '',
      websiteUrl: d.websiteUrl || '',
      website: d.website || '',
      features: d.features || null,
      pricing: d.pricing || null,
      platforms: d.platforms || null,
    }),
  },
  price_history: {
    pbName: 'price_history',
    idKey: 'productId',
    transform: (d) => ({
      productId: d.productId || d.__id,
      productName: d.productName || '',
      prices: d.prices || null,
      lowestPrice: typeof d.lowestPrice === 'number' ? d.lowestPrice : null,
      lowestStore: d.lowestStore || '',
      scrapedAt: fsTs(d.scrapedAt),
    }),
  },
  comparison_reviews: {
    pbName: 'comparison_reviews',
    idKey: null,
    transform: (d) => ({
      productIds: d.productIds || null,
      displayName: d.displayName || '',
      docKey: d.docKey || d.__id,
      userId: d.userId || '',
      reviewText: d.reviewText || '',
      timestamp: fsTs(d.timestamp),
    }),
  },
  app_config: {
    pbName: 'app_config',
    idKey: 'key',
    transform: (d) => ({
      key: d.__id,
      value: { ...d },
    }),
  },
  reviews: {
    pbName: 'reviews',
    idKey: null,
    transform: (d) => ({
      firestoreId: d.__id,
      productId: d.productId || '',
      userId: d.userId || '',
      rating: typeof d.rating === 'number' ? d.rating : null,
      text: d.text || '',
      helpful: d.helpful ?? null,
      reported: !!d.reported,
      createdAt: fsTs(d.createdAt),
    }),
  },
  trends: {
    pbName: 'trends',
    idKey: 'slug',
    transform: (d) => ({
      slug: d.id || d.__id,
      category: d.category || '',
      country: d.country || '',
      period: d.period || '',
      weekStart: d.weekStart || '',
      weekEnd: d.weekEnd || '',
      items: d.items || null,
      source: d.source || '',
      createdAt: fsTs(d.createdAt),
    }),
  },
  user_links: {
    pbName: 'user_links',
    idKey: null,
    transform: (d) => ({
      firestoreId: d.__id,
      userId: d.userId || '',
      url: d.url || '',
      category: d.category || '',
      aiScore: typeof d.aiScore === 'number' ? d.aiScore : null,
      aiAnalysis: d.aiAnalysis || null,
      ogMetadata: d.ogMetadata || null,
      createdAt: fsTs(d.createdAt),
    }),
  },
  scraper_sources: {
    pbName: 'scraper_sources',
    idKey: null,
    transform: (d) => ({
      firestoreId: d.__id,
      failureCount: typeof d.failureCount === 'number' ? d.failureCount : 0,
      lastSuccessfulScrape: fsTs(d.lastSuccessfulScrape),
    }),
  },
  scraper_logs: {
    pbName: 'scraper_logs',
    idKey: null,
    transform: (d) => ({
      type: d.type || 'manual',
      status: d.status || 'running',
      startedAt: fsTs(d.startedAt),
      completedAt: fsTs(d.completedAt),
      sourceId: d.sourceId || '',
      brandId: d.brandId || '',
      categoryId: d.categoryId || '',
      productsFound: typeof d.productsFound === 'number' ? d.productsFound : 0,
      productsAdded: typeof d.productsAdded === 'number' ? d.productsAdded : 0,
      productsDuplicate: typeof d.productsDuplicate === 'number' ? d.productsDuplicate : 0,
      productsFailed: typeof d.productsFailed === 'number' ? d.productsFailed : 0,
      errorMessage: d.errorMessage || '',
      details: d.details || null,
    }),
  },
  users: {
    pbName: 'users',
    idKey: null,
    transform: (d) => ({
      firestoreId: d.__id,
      fcmToken: d.fcmToken || '',
      platform: d.platform || '',
      country: d.country || '',
    }),
  },
};

function fsTs(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (v && v.__type === 'timestamp') {
    return new Date(v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6)).toISOString().replace('T', ' ').replace('Z', 'Z');
  }
  return '';
}

async function getExistingIds(pbName, idKey) {
  if (!idKey) return new Set();
  const existing = new Set();
  let page = 1;
  while (true) {
    const r = await req('GET', `/api/collections/${pbName}/records?perPage=500&fields=${idKey}&page=${page}`);
    if (r.status !== 200) throw new Error(`list ${pbName}: ${r.status} ${JSON.stringify(r.body)}`);
    for (const row of r.body.items) existing.add(row[idKey]);
    if (r.body.items.length < 500) break;
    page++;
  }
  return existing;
}

function postRecord(pbName, row, token) {
  return raw('POST', `/api/collections/${pbName}/records`, row, {
    Authorization: token,
  }).catch((e) => ({ status: 0, body: String(e) }));
}

async function importCollection(fsName) {
  const mapper = MAPPERS[fsName];
  if (!mapper) { console.log(`[${fsName}] no mapper, skip`); return; }
  const file = path.join(EXPORT_DIR, `${fsName}.ndjson`);
  if (!fs.existsSync(file)) { console.log(`[${fsName}] no file, skip`); return; }
  const stat = fs.statSync(file);
  if (stat.size === 0) { console.log(`[${fsName}] empty file, skip`); return; }

  const token = await auth();
  const existing = await getExistingIds(mapper.pbName, mapper.idKey);
  console.log(`[${fsName}] ${existing.size} already in PB`);

  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  console.log(`[${fsName}] ${lines.length} rows in export`);

  let done = 0, skipped = 0, failed = 0;
  const t0 = Date.now();

  // Parallel workers
  let idx = 0;
  const next = () => idx < lines.length ? lines[idx++] : null;
  async function worker() {
    while (true) {
      const line = next(); if (!line) return;
      let doc; try { doc = JSON.parse(line); } catch { failed++; continue; }
      const row = mapper.transform(doc);
      if (mapper.idKey && existing.has(row[mapper.idKey])) { skipped++; continue; }
      const r = await postRecord(mapper.pbName, row, token);
      if (r.status === 200 || r.status === 201) {
        done++;
      } else {
        failed++;
        if (failed < 5) console.error(`[${fsName}] fail:`, r.status, r.body.slice ? r.body.slice(0, 200) : r.body);
      }
      if ((done + skipped + failed) % BATCH_REPORT === 0) {
        const rate = ((done + skipped + failed) / ((Date.now() - t0) / 1000)).toFixed(0);
        process.stdout.write(`\r[${fsName}] ${done} imported, ${skipped} skipped, ${failed} failed (${rate}/s)`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(`\r[${fsName}] DONE: ${done} imported, ${skipped} skipped, ${failed} failed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

(async () => {
  const only = process.argv[2];
  const order = only ? [only] : Object.keys(MAPPERS).filter((name) => name !== 'users');
  for (const c of order) {
    try { await importCollection(c); }
    catch (e) { console.error(`[${c}] ERROR:`, e.message); }
  }
  console.log('All done.');
  process.exit(0);
})();
