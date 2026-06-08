// Product data layer for qorai.net.
//
// Keep this boring on purpose: the public website reads products directly from
// the Typesense search-only key. PocketBase remains for auth, reviews and AI,
// but catalog listing/search/detail no longer depends on PB hooks being live.

import { productImageList } from './imageUrl';

const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
// Search-only scoped key (actions: documents:search,get on `products` only).
// NEVER embed the Typesense bootstrap/admin key in client code — it allows
// writes, deletes and key management. This key can only run searches.
const TS_KEY = 'BFc7h2MZhq5yct2GxzkClzQtzzCglKIb';
const COLLECTION = 'products';
const SEARCH_PATH = `/collections/${COLLECTION}/documents/search`;
const LIST_FIELDS = [
  'id', 'name', 'imageUrl', 'category', 'subcategory', 'brand', 'slug',
  'techScore', 'trendScore', 'price_segment', 'lowestPriceUSD',
  'keySpecsText', 'filterTokens', 'screenSizeValue', 'batteryCapacityValue',
  'weightValueKg', 'scrapedAtTs', 'updatedAtTs', '_raw',
].join(',');

const HOME_FEATURE_CATEGORIES = [
  'smartphones', 'tablets', 'laptops', 'desktops', 'monitors', 'tvs',
  'smartwatches', 'headphones', 'gaming_consoles', 'graphics_cards', 'cpus',
];

const HOME_TREND_CATEGORIES = [
  'smartphones', 'laptops', 'tablets', 'monitors', 'tvs', 'headphones',
  'smartwatches', 'gaming_consoles', 'graphics_cards', 'cpus', 'mice', 'keyboards',
];

const HOME_LOW_SIGNAL_CATEGORIES = new Set([
  'flash_drives', 'chargers', 'powerbanks', 'case_fans', 'cpu_coolers',
  'laptop_coolers', 'pc_cases', 'ups',
]);

function lit(v) {
  return `\`${String(v || '').replace(/`/g, '')}\``;
}

function toQuery(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

async function tsGet(path, params = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const qs = toQuery(params);
    const res = await fetch(`${TS_URL}${path}${qs ? `?${qs}` : ''}`, {
      headers: { 'X-TYPESENSE-API-KEY': TS_KEY },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`typesense ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function docs(result) {
  return ((result && result.hits) || []).map((hit) => hit.document);
}

function uniqueProducts(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function homeQualityFilter(product, { allowLowSignal = false } = {}) {
  if (!product?.id || !product?.name) return false;
  if (!allowLowSignal && HOME_LOW_SIGNAL_CATEGORIES.has(String(product.category || '').toLowerCase())) return false;
  return true;
}

function topFacetCategories(counts, limit = 10) {
  return (counts || [])
    .map((c) => ({ value: String(c.value || '').toLowerCase(), count: Number(c.count) || 0 }))
    .filter((c) => c.value && !HOME_LOW_SIGNAL_CATEGORIES.has(c.value))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((c) => c.value);
}

async function categoryBalancedProducts(categories, perCategory, sortBy, limit, opts = {}) {
  const results = await Promise.all(categories.map((category) =>
    searchDocs({
      q: '*',
      query_by: 'name',
      sort_by: sortBy,
      filter_by: `category:=${lit(category)}`,
      per_page: perCategory,
      include_fields: LIST_FIELDS,
    }).then((res) => docs(res).map(docToProduct)).catch(() => []),
  ));
  return uniqueProducts(results.flat())
    .filter((product) => homeQualityFilter(product, opts))
    .slice(0, limit);
}

async function topCategoryPicks(categoryCounts, limit = 10) {
  const cats = topFacetCategories(categoryCounts, limit * 2);
  const results = await Promise.all(cats.map((category) =>
    categoryBalancedProducts(
      [category],
      1,
      'techScore:desc,trendScore:desc,updatedAtTs:desc',
      1,
      { allowLowSignal: false },
    ).catch(() => []),
  ));
  return uniqueProducts(results.flat())
    .filter((product) => homeQualityFilter(product))
    .slice(0, limit);
}

function looksLikeLaptopCooler(product) {
  const text = [
    product?.name,
    product?.slug,
    product?.sourceUrl,
    product?.keySpecsText,
    product?._raw,
  ].filter(Boolean).join(' ').toLowerCase();
  return /laptop[\s-]*(soğutucu|sogutucu|cooler|cooling|stand|pad)/i.test(text)
    || /(soğutucu|sogutucu|cooler|cooling\s*pad|cooling\s*stand)[\s-]*laptop/i.test(text)
    || /\/laptop-sogutucu\//i.test(text);
}

export function productMatchesRequestedCategory(product, category) {
  const cat = String(category || '').toLowerCase();
  if (cat === 'laptops') return !looksLikeLaptopCooler(product);
  if (cat === 'laptop_coolers') {
    return String(product?.category || '').toLowerCase() === 'laptop_coolers'
      || looksLikeLaptopCooler(product);
  }
  return true;
}

// A Typesense doc carries the full PocketBase record as `_raw` only when the
// document endpoint is used. Search/list endpoints return lightweight fields.
export function docToProduct(doc) {
  let base = {};
  if (doc && doc._raw) {
    try { base = JSON.parse(doc._raw); } catch { base = {}; }
  }
  const cleanImages = productImageList({
    imageUrl: base.imageUrl || base.imageURL || doc.imageUrl || '',
    imageURL: base.imageURL,
    images: base.images,
  });
  const imageUrl = cleanImages[0] || '';
  return {
    ...base,
    id: doc.id,
    name: base.name || doc.name || '',
    brand: base.brand || doc.brand || '',
    category: base.category || doc.category || '',
    subcategory: base.subcategory || doc.subcategory || '',
    imageUrl,
    images: cleanImages,
    techScore: base.techScore != null ? base.techScore : doc.techScore || 0,
    trendScore: base.trendScore != null ? base.trendScore : doc.trendScore || 0,
    price_segment: base.price_segment || doc.price_segment || '',
    lowestPriceUSD: doc.lowestPriceUSD || base.lowestPriceUSD || 0,
    lowestPrice: base.lowestPrice || 0,
    lowestPriceCurrency: base.lowestPriceCurrency || '',
    lowestOfferUrl: base.lowestOfferUrl || '',
    lowestOfferStore: base.lowestOfferStore || '',
    offerCount: base.offerCount || 0,
    pricedOfferCount: base.pricedOfferCount || 0,
    bestOfferId: base.bestOfferId || '',
    bestOfferCheckedAt: base.bestOfferCheckedAt || '',
    bestOfferExpiresAt: base.bestOfferExpiresAt || '',
    prices: base.prices || {},
    affiliateLinksByCountry: base.affiliateLinksByCountry || {},
    source: base.source || doc.source || '',
    sourceUrl: base.sourceUrl || '',
    gtin: base.gtin || '',
    mpn: base.mpn || '',
    icecatId: base.icecatId || 0,
    description: base.description || '',
    variantGroup: base.variantGroup || '',
    variantCount: base.variantCount || 0,
    variantPrimary: base.variantPrimary,
    created: base.created || '',
    updated: base.updated || '',
    createdAt: base.createdAt || base.created || '',
    lastUpdated: base.lastUpdated || base.updated || '',
    slug: base.slug || doc.slug || '',
    keySpecsText: doc.keySpecsText || '',
    filterTokens: Array.isArray(doc.filterTokens) ? doc.filterTokens : [],
    screenSizeValue: doc.screenSizeValue || 0,
    batteryCapacityValue: doc.batteryCapacityValue || 0,
    weightValueKg: doc.weightValueKg || 0,
    scrapedAtTs: doc.scrapedAtTs || base.scrapedAtTs || 0,
    updatedAtTs: doc.updatedAtTs || base.updatedAtTs || 0,
  };
}

async function searchDocs(params) {
  return tsGet(SEARCH_PATH, params);
}

export async function getHomeFeed(prefCats = []) {
  const preferred = (prefCats || [])
    .map((cat) => String(cat || '').toLowerCase())
    .filter((cat) => cat && !HOME_LOW_SIGNAL_CATEGORIES.has(cat));
  const forYouCats = [...new Set([...preferred, ...HOME_FEATURE_CATEGORIES])].slice(0, 10);
  try {
    const [trending, forYou, newRes, spotlightRes, facetRes] = await Promise.all([
      categoryBalancedProducts(HOME_TREND_CATEGORIES, 2, 'trendScore:desc,updatedAtTs:desc,techScore:desc', 16),
      categoryBalancedProducts(forYouCats, 3, 'techScore:desc,trendScore:desc', 21),
      searchDocs({
        q: '*',
        query_by: 'name',
        sort_by: 'updatedAtTs:desc,scrapedAtTs:desc,techScore:desc',
        per_page: 40,
        include_fields: LIST_FIELDS,
      }),
      searchDocs({
        q: '*', query_by: 'name', sort_by: 'techScore:desc',
        per_page: 1, include_fields: LIST_FIELDS,
        filter_by: `category:=${lit('smartphones')}`,
      }),
      searchDocs({
        q: '*', query_by: 'name', per_page: 1,
        facet_by: 'category', max_facet_values: 100,
      }),
    ]);
    const categoryFacet = (facetRes.facet_counts || [])
      .find((facet) => facet.field_name === 'category');
    const categories = categoryFacet ? categoryFacet.counts : [];
    const heroPicks = await topCategoryPicks(categories, 10);
    return {
      forYou,
      trending,
      newArrivals: uniqueProducts(docs(newRes).map(docToProduct))
        .filter((product) => homeQualityFilter(product))
        .slice(0, 21),
      spotlight: docs(spotlightRes).map(docToProduct)[0] || null,
      heroPicks,
      categories,
      total: Number(facetRes.found) || 0,
    };
  } catch (err) {
    console.warn('[catalog] home feed failed', err);
    return { forYou: [], trending: [], newArrivals: [], spotlight: null, heroPicks: [], categories: [], total: 0 };
  }
}

export async function searchProducts(query, limit = 40) {
  const q = (query || '').trim();
  if (!q) return [];
  try {
    const data = await searchDocs({
      q,
      query_by: 'name,brand,keySpecsText,category,filterTokens',
      query_by_weights: '8,4,2,2,1',
      sort_by: '_text_match:desc,trendScore:desc,techScore:desc',
      per_page: Math.min(limit, 60),
      include_fields: LIST_FIELDS,
      prefix: 'true',
      num_typos: '2,1,1,0,0',
      drop_tokens_threshold: 1,
      typo_tokens_threshold: 1,
      prioritize_exact_match: 'true',
    });
    return uniqueProducts(docs(data).map(docToProduct));
  } catch (err) {
    console.warn('[catalog] search failed', err);
    return [];
  }
}

export async function getCategoryPage(opts = {}) {
  const perPage = Math.min(opts.perPage || 24, 40);
  const page = opts.page || 1;
  try {
    const isSearch = Boolean((opts.q || '').trim());
    const filters = [];
    if (opts.category) filters.push(`category:=${lit(String(opts.category).toLowerCase())}`);
    if (opts.brands && opts.brands.length) {
      filters.push(`brand:[${opts.brands.slice(0, 12).map(lit).join(',')}]`);
    }
    if (opts.segment) filters.push(`price_segment:=${lit(opts.segment)}`);
    if (opts.tokens && opts.tokens.length) {
      // Group tokens by prefix so it's OR within a group (RAM 8 or 16) and AND
      // across groups (RAM 8 AND Storage 256) — the expected filter behaviour.
      const byPrefix = {};
      opts.tokens.slice(0, 24).forEach((tk) => {
        const p = String(tk).split(':')[0];
        (byPrefix[p] = byPrefix[p] || []).push(tk);
      });
      Object.values(byPrefix).forEach((group) => {
        filters.push(`filterTokens:[${group.map(lit).join(',')}]`);
      });
    }
    if (opts.score === 'high') filters.push('techScore:>=80');
    else if (opts.score === 'mid') filters.push('techScore:[60..79]');
    else if (opts.score === 'low') filters.push('techScore:<60');

    const sortMap = {
      score: 'techScore:desc',
      trend: 'trendScore:desc',
      priceUp: 'lowestPriceUSD:asc',
      priceDown: 'lowestPriceUSD:desc',
      new: 'updatedAtTs:desc,scrapedAtTs:desc,techScore:desc',
    };
    const sort = sortMap[opts.sort] || sortMap.score;
    const data = await searchDocs({
      q: isSearch ? opts.q.trim() : '*',
      query_by: isSearch ? 'name,brand,keySpecsText,category,filterTokens' : 'name',
      query_by_weights: isSearch ? '8,4,2,2,1' : '',
      sort_by: isSearch ? `_text_match:desc,${sort}` : sort,
      filter_by: filters.join(' && '),
      page,
      per_page: perPage,
      include_fields: LIST_FIELDS,
      facet_by: opts.facets ? 'brand,price_segment,filterTokens' : '',
      max_facet_values: opts.facets ? 200 : '',
      prefix: isSearch ? 'true' : '',
      num_typos: isSearch ? '2,1,1,0,0' : '',
      drop_tokens_threshold: isSearch ? 1 : '',
      typo_tokens_threshold: isSearch ? 1 : '',
      prioritize_exact_match: isSearch ? 'true' : '',
    });
    const hits = docs(data)
      .map(docToProduct)
      .filter((p) => productMatchesRequestedCategory(p, opts.category));
    return {
      found: data.found || 0,
      page,
      hits,
      facets: data.facet_counts || [],
    };
  } catch (err) {
    console.warn('[catalog] category failed', err);
    return { found: 0, page, hits: [], facets: [] };
  }
}

export async function getProduct(id) {
  if (!id) return null;
  try {
    const doc = await tsGet(`/collections/${COLLECTION}/documents/${encodeURIComponent(id)}`);
    return docToProduct(doc);
  } catch (err) {
    console.warn('[catalog] product failed', err);
    return null;
  }
}

export async function getSimilar(category, _techScore, excludeId, limit = 12) {
  if (!category) return [];
  try {
    const data = await searchDocs({
      q: '*',
      query_by: 'name',
      filter_by: `category:=${lit(String(category).toLowerCase())}`,
      sort_by: 'techScore:desc',
      per_page: Math.max(limit + 4, 16),
      include_fields: LIST_FIELDS,
    });
    return docs(data)
      .map(docToProduct)
      .filter((p) => p.id !== excludeId)
      .filter((p) => productMatchesRequestedCategory(p, category))
      .slice(0, limit)
  } catch (err) {
    console.warn('[catalog] similar failed', err);
    return [];
  }
}

// Sibling SKUs in the same product family (different storage/RAM), used by the
// product page "Variants" strip. Returns [] when the group is unknown.
export async function getVariants(variantGroup, excludeId, limit = 24) {
  if (!variantGroup) return [];
  try {
    const data = await searchDocs({
      q: '*',
      query_by: 'name',
      filter_by: `variantGroup:=${lit(String(variantGroup))}`,
      sort_by: 'techScore:desc',
      per_page: Math.max(limit, 24),
      include_fields: LIST_FIELDS,
    });
    return docs(data).map(docToProduct).filter((p) => p.id && p.id !== excludeId);
  } catch (err) {
    console.warn('[catalog] variants failed', err);
    return [];
  }
}

export async function popularProducts(limit = 12, opts = {}) {
  try {
    const category = String(opts.category || '').toLowerCase();
    if (category) {
      const data = await searchDocs({
        q: '*',
        query_by: 'name',
        sort_by: 'trendScore:desc,techScore:desc,updatedAtTs:desc',
        filter_by: `category:=${lit(category)}`,
        per_page: Math.min(Math.max(limit + 8, 16), 40),
        include_fields: LIST_FIELDS,
      });
      return docs(data)
        .map(docToProduct)
        .filter((p) => productMatchesRequestedCategory(p, category))
        .slice(0, limit);
    }

    const preferredCategories = [...new Set([...HOME_FEATURE_CATEGORIES, ...HOME_TREND_CATEGORIES])]
      .filter((cat) => !HOME_LOW_SIGNAL_CATEGORIES.has(cat));
    const data = await searchDocs({
      q: '*',
      query_by: 'name',
      sort_by: 'trendScore:desc,techScore:desc,updatedAtTs:desc',
      filter_by: `category:[${preferredCategories.map(lit).join(',')}]`,
      per_page: Math.min(Math.max(limit + 8, 18), 40),
      include_fields: LIST_FIELDS,
    });
    const ranked = uniqueProducts(docs(data).map(docToProduct))
      .filter((product) => homeQualityFilter(product))
      .slice(0, limit);
    if (ranked.length) return ranked;

    const feed = await getHomeFeed();
    const pool = feed.forYou.length ? feed.forYou : feed.trending;
    return pool.slice(0, limit);
  } catch {
    return [];
  }
}
