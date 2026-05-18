// ═══════════════════════════════════════════════════════════════
//  Typesense — product search & listing
//  Same engine / collection the Flutter app uses (lib/core/pb_client.dart).
//  The key below is a read-only, search-scoped key — safe in the client.
// ═══════════════════════════════════════════════════════════════

const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_KEY = '9l6gsRj1V9NuXAagocxHJbhmaMgQex9GP7NRFqtT';
const TS_COLLECTION = 'products';

const LIGHT_FIELDS =
  'id,name,imageUrl,category,subcategory,brand,slug,techScore,trendScore,price_segment,' +
  'lowestPriceUSD,keySpecsText,filterTokens,screenSizeValue,batteryCapacityValue,weightValueKg';

async function tsSearchRaw(params) {
  const qs = new URLSearchParams(params).toString();
  const url = `${TS_URL}/collections/${TS_COLLECTION}/documents/search?${qs}`;
  const res = await fetch(url, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } });
  if (!res.ok) throw new Error(`Typesense ${res.status}`);
  return res.json();
}

// A Typesense doc carries the full PocketBase record as a `_raw` JSON
// string. We hydrate from it when present so detail/compare views get
// every field; the light fields alone are enough for grid cards.
export function docToProduct(doc) {
  let base = {};
  if (doc && doc._raw) {
    try { base = JSON.parse(doc._raw); } catch { base = {}; }
  }
  return {
    ...base,
    id: doc.id,
    name: base.name || doc.name || '',
    brand: base.brand || doc.brand || '',
    category: base.category || doc.category || '',
    subcategory: base.subcategory || doc.subcategory || '',
    imageUrl: base.imageUrl || base.imageURL || doc.imageUrl || '',
    techScore: base.techScore != null ? base.techScore : doc.techScore || 0,
    trendScore: base.trendScore != null ? base.trendScore : doc.trendScore || 0,
    price_segment: base.price_segment || doc.price_segment || '',
    lowestPriceUSD: doc.lowestPriceUSD || base.lowestPriceUSD || 0,
    slug: base.slug || doc.slug || '',
    keySpecsText: doc.keySpecsText || '',
    filterTokens: Array.isArray(doc.filterTokens) ? doc.filterTokens : [],
    screenSizeValue: doc.screenSizeValue || 0,
    batteryCapacityValue: doc.batteryCapacityValue || 0,
    weightValueKg: doc.weightValueKg || 0,
  };
}

// Loads the whole catalog: page 1 first (so the UI paints instantly),
// then the rest in parallel. onFirstBatch(products, total) fires early.
export async function loadAllProducts(onFirstBatch, opts = {}) {
  const perPage = 250;
  const fields = opts.fields || LIGHT_FIELDS;
  const fetchPage = (page) =>
    tsSearchRaw({
      q: '*', query_by: 'name', sort_by: 'techScore:desc',
      per_page: perPage, page, include_fields: fields,
    });

  const first = await fetchPage(1);
  const total = first.found || 0;
  const all = (first.hits || []).map((h) => docToProduct(h.document));
  if (typeof onFirstBatch === 'function') onFirstBatch(all.slice(), total);

  const lastPage = Math.ceil(total / perPage);
  if (lastPage > 1) {
    const rest = [];
    for (let p = 2; p <= lastPage; p++) rest.push(fetchPage(p));
    const pages = await Promise.all(rest);
    pages.forEach((res) =>
      (res.hits || []).forEach((h) => all.push(docToProduct(h.document))),
    );
  }
  return all;
}

// Typo-tolerant search, ranked by relevance then tech score.
export async function searchProducts(query, limit = 40) {
  const q = (query || '').trim();
  if (!q) return [];
  const res = await tsSearchRaw({
    q, query_by: 'name,brand,keySpecsText,category',
    query_by_weights: '5,3,1,2',
    sort_by: '_text_match:desc,techScore:desc',
    per_page: Math.min(limit, 250), include_fields: LIGHT_FIELDS,
  });
  return (res.hits || []).map((h) => docToProduct(h.document));
}

export async function getByCategory(category, limit = 250) {
  const res = await tsSearchRaw({
    q: '*', query_by: 'name',
    filter_by: `category:=\`${category}\``,
    sort_by: 'techScore:desc',
    per_page: Math.min(limit, 250), include_fields: LIGHT_FIELDS,
  });
  return (res.hits || []).map((h) => docToProduct(h.document));
}

// Full record (with specs) via Typesense's direct document endpoint.
export async function getProduct(id) {
  const url = `${TS_URL}/collections/${TS_COLLECTION}/documents/${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } });
  if (!res.ok) return null;
  return docToProduct(await res.json());
}

// Products in the same category with the closest tech scores.
export async function getSimilar(category, techScore, excludeId, limit = 12) {
  if (!category) return [];
  const pool = await getByCategory(category, 120);
  const score = Number(techScore) || 0;
  return pool
    .filter((p) => p.id !== excludeId && p.name && p.imageUrl)
    .sort(
      (a, b) =>
        Math.abs((a.techScore || 0) - score) - Math.abs((b.techScore || 0) - score),
    )
    .slice(0, limit);
}

// Total products + distinct category count.
export async function getStats() {
  const res = await tsSearchRaw({
    q: '*', query_by: 'name', per_page: 1,
    facet_by: 'category', max_facet_values: 100,
  });
  const facet = (res.facet_counts || []).find((f) => f.field_name === 'category');
  return {
    total: res.found || 0,
    categories: facet ? facet.counts.length : 0,
    categoryCounts: facet ? facet.counts : [],
  };
}
