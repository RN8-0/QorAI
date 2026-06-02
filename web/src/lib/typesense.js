// Product data layer for qorai.net.
//
// Keep this boring on purpose: the public website reads products directly from
// the Typesense search-only key. PocketBase remains for auth, reviews and AI,
// but catalog listing/search/detail no longer depends on PB hooks being live.

const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_KEY = '9l6gsRj1V9NuXAagocxHJbhmaMgQex9GP7NRFqtT';
const COLLECTION = 'products';
const SEARCH_PATH = `/collections/${COLLECTION}/documents/search`;
const LIST_FIELDS = [
  'id', 'name', 'imageUrl', 'category', 'subcategory', 'brand', 'slug',
  'techScore', 'trendScore', 'price_segment', 'lowestPriceUSD',
  'keySpecsText', 'filterTokens', 'screenSizeValue', 'batteryCapacityValue',
  'weightValueKg', '_raw',
].join(',');

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

// A Typesense doc carries the full PocketBase record as `_raw` only when the
// document endpoint is used. Search/list endpoints return lightweight fields.
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
    lowestPrice: base.lowestPrice || 0,
    lowestPriceCurrency: base.lowestPriceCurrency || '',
    lowestOfferUrl: base.lowestOfferUrl || '',
    lowestOfferStore: base.lowestOfferStore || '',
    prices: base.prices || {},
    affiliateLinksByCountry: base.affiliateLinksByCountry || {},
    slug: base.slug || doc.slug || '',
    keySpecsText: doc.keySpecsText || '',
    filterTokens: Array.isArray(doc.filterTokens) ? doc.filterTokens : [],
    screenSizeValue: doc.screenSizeValue || 0,
    batteryCapacityValue: doc.batteryCapacityValue || 0,
    weightValueKg: doc.weightValueKg || 0,
  };
}

async function searchDocs(params) {
  return tsGet(SEARCH_PATH, params);
}

export async function getHomeFeed(prefCats = []) {
  const cats = (prefCats || []).filter(Boolean).slice(0, 5);
  try {
    const [trendingRes, forYouRes, newRes, facetRes] = await Promise.all([
      searchDocs({
        q: '*', query_by: 'name', sort_by: 'trendScore:desc',
        per_page: 16, include_fields: LIST_FIELDS,
      }),
      searchDocs({
        q: '*', query_by: 'name', sort_by: 'techScore:desc',
        per_page: 16, include_fields: LIST_FIELDS,
        filter_by: cats.length ? `category:[${cats.map(lit).join(',')}]` : '',
      }),
      searchDocs({
        q: '*', query_by: 'name', sort_by: 'specsCount:desc',
        per_page: 16, include_fields: LIST_FIELDS,
      }),
      searchDocs({
        q: '*', query_by: 'name', per_page: 1,
        facet_by: 'category', max_facet_values: 100,
      }),
    ]);
    const categoryFacet = (facetRes.facet_counts || [])
      .find((facet) => facet.field_name === 'category');
    return {
      forYou: docs(forYouRes).map(docToProduct),
      trending: docs(trendingRes).map(docToProduct),
      newArrivals: docs(newRes).map(docToProduct),
      categories: categoryFacet ? categoryFacet.counts : [],
      total: Number(facetRes.found) || 0,
    };
  } catch (err) {
    console.warn('[catalog] home feed failed', err);
    return { forYou: [], trending: [], newArrivals: [], categories: [], total: 0 };
  }
}

export async function searchProducts(query, limit = 40) {
  const q = (query || '').trim();
  if (!q) return [];
  try {
    const data = await searchDocs({
      q,
      query_by: 'name,brand,keySpecsText,category',
      query_by_weights: '5,3,1,2',
      sort_by: '_text_match:desc,techScore:desc',
      per_page: Math.min(limit, 40),
      include_fields: LIST_FIELDS,
    });
    return docs(data).map(docToProduct);
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
      filters.push(`filterTokens:[${opts.tokens.slice(0, 16).map(lit).join(',')}]`);
    }
    if (opts.score === 'high') filters.push('techScore:>=80');
    else if (opts.score === 'mid') filters.push('techScore:[60..79]');
    else if (opts.score === 'low') filters.push('techScore:<60');

    const sortMap = {
      score: 'techScore:desc',
      trend: 'trendScore:desc',
      priceUp: 'lowestPriceUSD:asc',
      priceDown: 'lowestPriceUSD:desc',
    };
    const sort = sortMap[opts.sort] || sortMap.score;
    const data = await searchDocs({
      q: isSearch ? opts.q.trim() : '*',
      query_by: isSearch ? 'name,brand,keySpecsText,category' : 'name',
      query_by_weights: isSearch ? '5,3,1,2' : '',
      sort_by: isSearch ? `_text_match:desc,${sort}` : sort,
      filter_by: filters.join(' && '),
      page,
      per_page: perPage,
      include_fields: LIST_FIELDS,
      facet_by: opts.facets ? 'brand,price_segment,filterTokens' : '',
      max_facet_values: opts.facets ? 200 : '',
    });
    return {
      found: data.found || 0,
      page,
      hits: docs(data).map(docToProduct),
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
      .filter((doc) => doc.id !== excludeId)
      .slice(0, limit)
      .map(docToProduct);
  } catch (err) {
    console.warn('[catalog] similar failed', err);
    return [];
  }
}

export async function popularProducts(limit = 12) {
  try {
    const feed = await getHomeFeed();
    const pool = feed.forYou.length ? feed.forYou : feed.trending;
    return pool.slice(0, limit);
  } catch {
    return [];
  }
}
