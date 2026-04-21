// Create Typesense 'products' collection and index all products from PocketBase.
// Typesense uses JSONL for bulk import (one JSON doc per line).
const http = require('http');
const { req: tsReq, BASE: TS_BASE } = require('./ts');
const { req: pbReq, BASE: PB_BASE } = require('./pb');

const COL = 'products';
const BATCH = 2000;

const schema = {
  name: COL,
  fields: [
    { name: 'id', type: 'string' }, // PB record id
    { name: 'slug', type: 'string' },
    { name: 'name', type: 'string' },
    { name: 'brand', type: 'string', facet: true, optional: true },
    { name: 'category', type: 'string', facet: true },
    { name: 'subcategory', type: 'string', facet: true, optional: true },
    { name: 'source', type: 'string', optional: true },
    { name: 'imageUrl', type: 'string', optional: true, index: false },
    { name: 'techScore', type: 'float' },
    { name: 'trendScore', type: 'float', optional: true },
    { name: 'price_segment', type: 'string', facet: true, optional: true },
    { name: 'specsCount', type: 'int32', optional: true },
    { name: 'keySpecsText', type: 'string', optional: true },
    { name: 'tags', type: 'string[]', optional: true, facet: true },
    // Full product data as JSON string — not indexed, just stored for hydration
    { name: '_raw', type: 'string', index: false, optional: true },
  ],
  default_sorting_field: 'techScore',
  token_separators: ['-', '_', '/', ' '],
};

async function ensureCollection() {
  const r = await tsReq('GET', `/collections/${COL}`);
  if (r.status === 200) {
    console.log(`[ts] collection '${COL}' exists, dropping to recreate`);
    await tsReq('DELETE', `/collections/${COL}`);
  }
  const c = await tsReq('POST', '/collections', schema);
  if (c.status !== 201) throw new Error('create: ' + JSON.stringify(c.body));
  console.log(`[ts] collection '${COL}' created`);
}

function flattenKeySpecs(ks) {
  if (!ks) return '';
  if (Array.isArray(ks)) return ks.map(x => typeof x === 'object' ? Object.values(x).join(' ') : String(x)).join(' ');
  if (typeof ks === 'object') return Object.values(ks).join(' ');
  return String(ks);
}

function toTsDoc(pb) {
  // Build _raw: full PB record for client-side hydration
  const raw = JSON.stringify(pb);
  return {
    id: pb.id,
    slug: pb.slug || '',
    name: pb.name || '',
    brand: pb.brand || '',
    category: pb.category || '',
    subcategory: pb.subcategory || '',
    source: pb.source || '',
    imageUrl: pb.imageUrl || pb.imageURL || '',
    techScore: typeof pb.techScore === 'number' ? pb.techScore : 0,
    trendScore: typeof pb.trendScore === 'number' ? pb.trendScore : 0,
    price_segment: pb.price_segment || '',
    specsCount: pb.specsCount || 0,
    keySpecsText: flattenKeySpecs(pb.keySpecs),
    tags: Array.isArray(pb.tags) ? pb.tags : [],
    _raw: raw,
  };
}

async function importBatch(docs) {
  // Typesense /documents/import expects JSONL
  const jsonl = docs.map(d => JSON.stringify(d)).join('\n');
  const r = await tsReq('POST', `/collections/${COL}/documents/import?action=upsert`, jsonl, 'text/plain');
  if (r.status !== 200) {
    console.error('import fail:', r.status, (r.body + '').slice(0, 300));
    return { ok: 0, fail: docs.length };
  }
  // Response is JSONL of per-doc results
  const lines = (r.body + '').split('\n').filter(Boolean);
  let ok = 0, fail = 0;
  for (const line of lines) {
    try { const j = JSON.parse(line); if (j.success) ok++; else { fail++; if (fail < 3) console.error('row fail:', line.slice(0, 200)); } }
    catch { fail++; }
  }
  return { ok, fail };
}

async function pbPage(page) {
  const r = await pbReq('GET', `/api/collections/products/records?perPage=${BATCH}&page=${page}`);
  if (r.status !== 200) throw new Error('pb list: ' + JSON.stringify(r.body));
  return r.body;
}

(async () => {
  await ensureCollection();
  const first = await pbPage(1);
  const total = first.totalItems;
  const pages = first.totalPages;
  console.log(`[pb] ${total} products across ${pages} pages`);

  const t0 = Date.now();
  let okTotal = 0, failTotal = 0, processed = 0;

  async function handlePage(items) {
    const docs = items.map(toTsDoc);
    const r = await importBatch(docs);
    okTotal += r.ok; failTotal += r.fail; processed += items.length;
    const rate = (processed / ((Date.now() - t0) / 1000)).toFixed(0);
    process.stdout.write(`\r[ts] ${okTotal} indexed, ${failTotal} failed (${rate}/s)   `);
  }

  await handlePage(first.items);
  for (let p = 2; p <= pages; p++) {
    const page = await pbPage(p);
    await handlePage(page.items);
  }
  console.log(`\n[ts] DONE: ${okTotal} indexed, ${failTotal} failed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
