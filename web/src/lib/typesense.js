// ═══════════════════════════════════════════════════════════════
//  Product data layer — Qor AI website
//  --------------------------------------------------------------
//  Primary path: the PocketBase search proxy (pb_hooks/search_proxy)
//  keeps the Typesense key server-side so the catalog can't be
//  scraped from the bundle.
//
//  Fallback path: if the proxy isn't deployed yet / is unreachable,
//  every call transparently falls back to a *constrained* direct
//  Typesense query so the site never breaks. Once the proxy hook is
//  confirmed live, set ALLOW_DIRECT_FALLBACK = false (and the key
//  below can be removed) for full anti-scraping protection.
// ═══════════════════════════════════════════════════════════════

import { PB_URL } from './pocketbase';

const API = `${PB_URL}/api`;

const ALLOW_DIRECT_FALLBACK = true;
const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_KEY = '9l6gsRj1V9NuXAagocxHJbhmaMgQex9GP7NRFqtT';
const TS_COLLECTION = 'products';
const LIGHT_FIELDS =
  'id,name,imageUrl,category,subcategory,brand,slug,techScore,trendScore,' +
  'price_segment,lowestPriceUSD,keySpecsText,filterTokens,screenSizeValue,' +
  'batteryCapacityValue,weightValueKg';
const SORT_MAP = {
  score: 'techScore:desc', trend: 'trendScore:desc',
  priceUp: 'lowestPriceUSD:asc', priceDown: 'lowestPriceUSD:desc',
};

async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`proxy ${res.status}`);
  return res.json();
}

// Direct (constrained) Typesense query — fallback only.
async function tsSearch(params) {
  if (!ALLOW_DIRECT_FALLBACK) throw new Error('proxy unavailable');
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(
    `${TS_URL}/collections/${TS_COLLECTION}/documents/search?${qs}`,
    { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } },
  );
  if (!res.ok) throw new Error(`typesense ${res.status}`);
  return res.json();
}
const tsHits = (r) => (r && r.hits ? r.hits.map((h) => h.document) : []);
const tsLit = (v) => '`' + String(v).replace(/`/g, '') + '`';

// A proxy/Typesense doc carries the full PocketBase record as a `_raw`
// JSON string only on the single-product endpoint. List results ship
// light fields alone — enough for grid cards, never the full spec blob.
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

// ── Home feed ───────────────────────────────────────────────────
// { forYou, trending, newArrivals, categories } — the exact sections
// the mobile app's home screen shows.
export async function getHomeFeed(prefCats = []) {
  const cats = (prefCats || []).filter(Boolean).slice(0, 5);
  try {
    const data = await apiGet(`/qhome${cats.length ? `?cats=${encodeURIComponent(cats.join(','))}` : ''}`);
    return {
      forYou: (data.forYou || []).map(docToProduct),
      trending: (data.trending || []).map(docToProduct),
      newArrivals: (data.newArrivals || []).map(docToProduct),
      categories: data.categories || [],
    };
  } catch {
    // Direct fallback — proxy not deployed yet.
    const base = { q: '*', query_by: 'name', include_fields: LIGHT_FIELDS, per_page: 16 };
    const [trendR, scoreR, facetR] = await Promise.all([
      tsSearch({ ...base, sort_by: 'trendScore:desc' }),
      tsSearch({
        ...base, sort_by: 'techScore:desc',
        ...(cats.length ? { filter_by: `category:[${cats.map(tsLit).join(',')}]` } : {}),
      }),
      tsSearch({ q: '*', query_by: 'name', per_page: 1, facet_by: 'category', max_facet_values: 100 }),
    ]);
    const fresh = await tsSearch({ ...base, sort_by: 'techScore:desc', page: 2 }).catch(() => null);
    const fc = (facetR.facet_counts || []).find((f) => f.field_name === 'category');
    return {
      forYou: tsHits(scoreR).map(docToProduct),
      trending: tsHits(trendR).map(docToProduct),
      newArrivals: fresh ? tsHits(fresh).map(docToProduct) : [],
      categories: fc ? fc.counts : [],
    };
  }
}

// ── Search (typo-tolerant) ──────────────────────────────────────
export async function searchProducts(query, limit = 40) {
  const q = (query || '').trim();
  if (!q) return [];
  const perPage = Math.min(limit, 40);
  try {
    const data = await apiGet(`/qts?q=${encodeURIComponent(q)}&per_page=${perPage}`);
    return (data.hits || []).map(docToProduct);
  } catch {
    const r = await tsSearch({
      q, query_by: 'name,brand,keySpecsText,category', query_by_weights: '5,3,1,2',
      sort_by: '_text_match:desc,techScore:desc', per_page: perPage, include_fields: LIGHT_FIELDS,
    });
    return tsHits(r).map(docToProduct);
  }
}

// ── Category listing + facets (epey-style filtered browse) ──────
export async function getCategoryPage(opts = {}) {
  const perPage = Math.min(opts.perPage || 24, 40);
  const page = opts.page || 1;
  try {
    const p = new URLSearchParams();
    if (opts.category) p.set('category', opts.category);
    if (opts.q) p.set('q', opts.q);
    if (opts.brands && opts.brands.length) p.set('brands', opts.brands.join(','));
    if (opts.segment) p.set('segment', opts.segment);
    if (opts.tokens && opts.tokens.length) p.set('tokens', opts.tokens.join(','));
    if (opts.score && opts.score !== 'all') p.set('score', opts.score);
    if (opts.sort) p.set('sort', opts.sort);
    p.set('page', String(page));
    p.set('per_page', String(perPage));
    if (opts.facets) p.set('facets', '1');
    const data = await apiGet(`/qts?${p.toString()}`);
    return {
      found: data.found || 0, page: data.page || page,
      hits: (data.hits || []).map(docToProduct), facets: data.facets || [],
    };
  } catch {
    const filters = [];
    if (opts.category) filters.push(`category:=${tsLit(opts.category)}`);
    if (opts.brands && opts.brands.length) filters.push(`brand:[${opts.brands.map(tsLit).join(',')}]`);
    if (opts.segment) filters.push(`price_segment:=${tsLit(opts.segment)}`);
    if (opts.tokens && opts.tokens.length) filters.push(`filterTokens:[${opts.tokens.map(tsLit).join(',')}]`);
    if (opts.score === 'high') filters.push('techScore:>=80');
    else if (opts.score === 'mid') filters.push('techScore:[60..79]');
    else if (opts.score === 'low') filters.push('techScore:<60');
    const isSearch = Boolean(opts.q);
    const params = {
      q: isSearch ? opts.q : '*',
      query_by: isSearch ? 'name,brand,keySpecsText,category' : 'name',
      per_page: perPage, page, include_fields: LIGHT_FIELDS,
      sort_by: isSearch
        ? `_text_match:desc,${SORT_MAP[opts.sort] || SORT_MAP.score}`
        : (SORT_MAP[opts.sort] || SORT_MAP.score),
    };
    if (filters.length) params.filter_by = filters.join(' && ');
    if (opts.facets) { params.facet_by = 'brand,price_segment,filterTokens'; params.max_facet_values = 200; }
    const r = await tsSearch(params);
    return {
      found: r.found || 0, page,
      hits: tsHits(r).map(docToProduct), facets: r.facet_counts || [],
    };
  }
}

// ── Single product (full record incl. specs) ────────────────────
export async function getProduct(id) {
  if (!id) return null;
  try {
    const doc = await apiGet(`/qproduct?id=${encodeURIComponent(id)}`);
    return docToProduct(doc);
  } catch {
    try {
      const res = await fetch(
        `${TS_URL}/collections/${TS_COLLECTION}/documents/${encodeURIComponent(id)}`,
        { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } },
      );
      if (!res.ok) return null;
      return docToProduct(await res.json());
    } catch {
      return null;
    }
  }
}

// ── Similar products for a detail page ──────────────────────────
export async function getSimilar(category, _techScore, excludeId, limit = 12) {
  if (!category) return [];
  try {
    const p = new URLSearchParams({ category });
    if (excludeId) p.set('exclude', excludeId);
    const data = await apiGet(`/qsimilar?${p.toString()}`);
    return (data.hits || []).map(docToProduct).slice(0, limit);
  } catch {
    try {
      const r = await tsSearch({
        q: '*', query_by: 'name', filter_by: `category:=${tsLit(category)}`,
        sort_by: 'techScore:desc', per_page: 24, include_fields: LIGHT_FIELDS,
      });
      return tsHits(r).map(docToProduct).filter((p) => p.id !== excludeId).slice(0, limit);
    } catch {
      return [];
    }
  }
}

// ── Popular products (compare picker, etc.) ─────────────────────
export async function popularProducts(limit = 12) {
  try {
    const feed = await getHomeFeed();
    const pool = feed.forYou.length ? feed.forYou : feed.trending;
    return pool.slice(0, limit);
  } catch {
    return [];
  }
}
