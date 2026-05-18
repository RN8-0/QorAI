// ═══════════════════════════════════════════════════════════════
//  QOR AI WEBSITE — Typesense Client
//  Product listing & search backed by Typesense — the same engine
//  the mobile app uses (see lib/core/pb_client.dart). Fast, fuzzy,
//  uncapped. Auth still goes through PocketBase (js/pb_client.js).
// ═══════════════════════════════════════════════════════════════

// Search-only API key — read-only, safe to ship in client JS.
// Mirrors kTypesenseApiKey / kTypesenseUrl in the Flutter app.
const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_KEY = '9l6gsRj1V9NuXAagocxHJbhmaMgQex9GP7NRFqtT';
const TS_COLLECTION = 'products';

// Light field set for grid cards — keeps payloads small so products
// stream in fast. The heavy `_raw` blob is fetched only on demand.
const TS_LIGHT_FIELDS =
  'id,name,imageUrl,category,subcategory,brand,slug,techScore,trendScore,price_segment,lowestPriceUSD,keySpecsText';

// ─── Low-level search ────────────────────────────────────────────
async function tsSearchRaw(params) {
  const qs = new URLSearchParams(params).toString();
  const url = `${TS_URL}/collections/${TS_COLLECTION}/documents/search?${qs}`;
  const res = await fetch(url, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } });
  if (!res.ok) {
    throw new Error(`Typesense ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ─── Doc → product object ────────────────────────────────────────
// When `_raw` (full PocketBase record) is present we hydrate from it
// so the shape matches what the mobile app and detail views expect.
// Otherwise the light Typesense fields are enough for grid cards.
function tsDocToProduct(doc) {
  let base = {};
  if (doc && doc._raw) {
    try { base = JSON.parse(doc._raw); } catch (_) { base = {}; }
  }
  return {
    ...base,
    id: doc.id,
    name: base.name || doc.name || '',
    brand: base.brand || doc.brand || '',
    category: base.category || doc.category || '',
    subcategory: base.subcategory || doc.subcategory || '',
    imageUrl: base.imageUrl || base.imageURL || doc.imageUrl || '',
    techScore: base.techScore != null ? base.techScore : (doc.techScore || 0),
    trendScore: base.trendScore != null ? base.trendScore : (doc.trendScore || 0),
    price_segment: base.price_segment || doc.price_segment || '',
    lowestPriceUSD: doc.lowestPriceUSD || 0,
    slug: base.slug || doc.slug || '',
  };
}

// ─── Load the whole catalog (fast) ───────────────────────────────
// Fetches page 1 first so the UI can paint immediately, then pulls
// the remaining pages in parallel. `onFirstBatch(products, total)`
// fires after page 1; the resolved promise holds every product.
async function tsLoadAllProducts(onFirstBatch, opts = {}) {
  const perPage = 250;
  const fields = opts.fields || TS_LIGHT_FIELDS;

  const fetchPage = (page) => tsSearchRaw({
    q: '*',
    query_by: 'name',
    sort_by: 'techScore:desc',
    per_page: perPage,
    page,
    include_fields: fields,
  });

  const first = await fetchPage(1);
  const total = first.found || 0;
  const all = (first.hits || []).map(h => tsDocToProduct(h.document));
  if (typeof onFirstBatch === 'function') onFirstBatch(all.slice(), total);

  const lastPage = Math.ceil(total / perPage);
  if (lastPage > 1) {
    const rest = [];
    for (let p = 2; p <= lastPage; p++) rest.push(fetchPage(p));
    const pages = await Promise.all(rest);
    pages.forEach(res => {
      (res.hits || []).forEach(h => all.push(tsDocToProduct(h.document)));
    });
  }
  return all;
}

// ─── Fuzzy search ────────────────────────────────────────────────
// Typo-tolerant, ranked by text match then tech score.
async function tsSearchProducts(query, limit = 60) {
  const q = (query || '').trim();
  if (!q) return [];
  const res = await tsSearchRaw({
    q,
    query_by: 'name,brand,keySpecsText,category',
    query_by_weights: '5,3,1,2',
    sort_by: '_text_match:desc,techScore:desc',
    per_page: Math.min(limit, 250),
    include_fields: TS_LIGHT_FIELDS,
  });
  return (res.hits || []).map(h => tsDocToProduct(h.document));
}

// ─── Products by category ────────────────────────────────────────
async function tsGetByCategory(category, limit = 250) {
  const res = await tsSearchRaw({
    q: '*',
    query_by: 'name',
    filter_by: `category:=\`${category}\``,
    sort_by: 'techScore:desc',
    per_page: Math.min(limit, 250),
    include_fields: TS_LIGHT_FIELDS,
  });
  return (res.hits || []).map(h => tsDocToProduct(h.document));
}

// ─── Single product (full record with specs) ─────────────────────
// Uses Typesense's direct document endpoint — returns every field,
// including the `_raw` PocketBase blob the comparison table needs.
async function tsGetProduct(id) {
  const url = `${TS_URL}/collections/${TS_COLLECTION}/documents/${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } });
  if (!res.ok) return null;
  return tsDocToProduct(await res.json());
}

// ─── Catalog stats (total + category count) ──────────────────────
async function tsStats() {
  const res = await tsSearchRaw({
    q: '*',
    query_by: 'name',
    per_page: 1,
    facet_by: 'category',
    max_facet_values: 100,
  });
  const facet = (res.facet_counts || []).find(f => f.field_name === 'category');
  return {
    total: res.found || 0,
    categories: facet ? facet.counts.length : 0,
  };
}
