// ═══════════════════════════════════════════════════════════════
//  Product data layer — Qor AI website
//  --------------------------------------------------------------
//  All product reads go through the PocketBase search proxy
//  (pb_hooks/search_proxy.pb.js). The Typesense key never reaches
//  the browser, so the catalog can't be scraped from the bundle.
//  Results are paginated + light-field only; nothing bulk-loads.
// ═══════════════════════════════════════════════════════════════

import { PB_URL } from './pocketbase';

const API = `${PB_URL}/api`;

async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`proxy ${res.status}`);
  return res.json();
}

// A proxy doc carries the full PocketBase record as a `_raw` JSON string
// only on the single-product endpoint. List endpoints ship light fields
// alone — enough for grid cards, never the detailed spec blob.
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
    return { forYou: [], trending: [], newArrivals: [], categories: [] };
  }
}

// ── Search (typo-tolerant) ──────────────────────────────────────
export async function searchProducts(query, limit = 40) {
  const q = (query || '').trim();
  if (!q) return [];
  try {
    const data = await apiGet(`/qts?q=${encodeURIComponent(q)}&per_page=${Math.min(limit, 40)}`);
    return (data.hits || []).map(docToProduct);
  } catch {
    return [];
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
    return { found: 0, page, hits: [], facets: [] };
  }
}

// ── Single product (full record incl. specs) ────────────────────
export async function getProduct(id) {
  if (!id) return null;
  try {
    const doc = await apiGet(`/qproduct?id=${encodeURIComponent(id)}`);
    return docToProduct(doc);
  } catch {
    return null;
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
    return [];
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
