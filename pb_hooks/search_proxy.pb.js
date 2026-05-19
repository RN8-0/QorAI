/// <reference path="../pb_data/types.d.ts" />
// ════════════════════════════════════════════════════════════════════
//  Qor AI — Typesense search proxy (anti-scraping)
//  --------------------------------------------------------------------
//  The website (qorai.net) used to call Typesense directly with the
//  search key baked into the JS bundle — anyone could read it and dump
//  the whole catalog with `q=*`. These routes keep the key SERVER-SIDE
//  and only ever expose constrained, paginated, light-field results.
//
//  Endpoints (all GET, CORS handled by PocketBase global middleware):
//    /api/qhome      curated home feed (trending / new / for-you / cats)
//    /api/qts        constrained search + category listing + facets
//    /api/qproduct   single full product (incl. _raw specs) by id
//    /api/qsimilar   similar products for a detail page
//
//  Key never leaves the server. Bulk endpoints never return `_raw`, so
//  detailed spec data cannot be harvested in bulk. A category can still
//  be paged, but only in small light-field pages — same as a real user.
// ════════════════════════════════════════════════════════════════════

const TS_URL =
  $os.getenv('QORAI_TS_URL') ||
  'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_KEY =
  $os.getenv('QORAI_TS_KEY') || '9l6gsRj1V9NuXAagocxHJbhmaMgQex9GP7NRFqtT';
const TS_COLLECTION = 'products';

// Light fields — enough for grid cards, never the full `_raw` spec blob.
const LIGHT_FIELDS =
  'id,name,imageUrl,category,subcategory,brand,slug,techScore,trendScore,' +
  'price_segment,lowestPriceUSD,keySpecsText,filterTokens,screenSizeValue,' +
  'batteryCapacityValue,weightValueKg';

const MAX_PER_PAGE = 40;
const SORT_WHITELIST = {
  score: 'techScore:desc',
  trend: 'trendScore:desc',
  priceUp: 'lowestPriceUSD:asc',
  priceDown: 'lowestPriceUSD:desc',
};

// ── helpers ─────────────────────────────────────────────────────────
function tsGet(path) {
  const res = $http.send({
    url: TS_URL + path,
    method: 'GET',
    headers: { 'X-TYPESENSE-API-KEY': TS_KEY },
    timeout: 12,
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error('typesense ' + res.statusCode);
  }
  // PocketBase JSVM exposes a parsed `.json`; fall back to parsing raw text.
  if (res.json !== undefined && res.json !== null) return res.json;
  try { return JSON.parse(res.raw || res.body || '{}'); } catch (e) { return {}; }
}

function encodeQs(params) {
  const parts = [];
  for (const k in params) {
    if (params[k] === undefined || params[k] === null || params[k] === '') continue;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])));
  }
  return parts.join('&');
}

// Escapes a value for a Typesense `filter_by` exact match.
function tsLit(v) {
  return '`' + String(v).replace(/`/g, '') + '`';
}

function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function search(params) {
  return tsGet(
    '/collections/' + TS_COLLECTION + '/documents/search?' + encodeQs(params),
  );
}

function hitsOf(result) {
  const out = [];
  const hits = (result && result.hits) || [];
  for (let i = 0; i < hits.length; i++) out.push(hits[i].document);
  return out;
}

// ── /api/qhome — curated home feed ──────────────────────────────────
routerAdd('GET', '/api/qhome', (e) => {
  try {
    const catsParam = String(e.request.url.query().get('cats') || '').trim();
    const prefCats = catsParam
      ? catsParam.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean).slice(0, 5)
      : [];

    // Trending — highest trendScore.
    const trending = hitsOf(
      search({
        q: '*', query_by: 'name', sort_by: 'trendScore:desc',
        per_page: 16, include_fields: LIGHT_FIELDS,
      }),
    );

    // For You — products in the visitor's recently-viewed categories
    // (falls back to top tech score for first-time / guest visitors).
    let forYou;
    if (prefCats.length) {
      const filter = 'category:[' + prefCats.map(tsLit).join(',') + ']';
      forYou = hitsOf(
        search({
          q: '*', query_by: 'name', filter_by: filter,
          sort_by: 'techScore:desc', per_page: 16, include_fields: LIGHT_FIELDS,
        }),
      );
    } else {
      forYou = hitsOf(
        search({
          q: '*', query_by: 'name', sort_by: 'techScore:desc',
          per_page: 16, include_fields: LIGHT_FIELDS,
        }),
      );
    }

    // New Arrivals — newest PocketBase records, hydrated via Typesense so
    // the cards carry the same light spec fields as everything else.
    let newArrivals = [];
    try {
      const recs = $app.findRecordsByFilter(
        TS_COLLECTION, "created != ''", '-created', 16, 0,
      );
      const ids = [];
      for (let i = 0; i < recs.length; i++) ids.push(recs[i].id);
      if (ids.length) {
        const byId = hitsOf(
          search({
            q: '*', query_by: 'name',
            filter_by: 'id:[' + ids.map(tsLit).join(',') + ']',
            per_page: ids.length, include_fields: LIGHT_FIELDS,
          }),
        );
        // Preserve newest-first order from PocketBase.
        const map = {};
        for (let i = 0; i < byId.length; i++) map[byId[i].id] = byId[i];
        for (let i = 0; i < ids.length; i++) {
          if (map[ids[i]]) newArrivals.push(map[ids[i]]);
        }
      }
    } catch (err) {
      newArrivals = [];
    }

    // Category facet — drives the home category grid.
    const facetRes = search({
      q: '*', query_by: 'name', per_page: 1,
      facet_by: 'category', max_facet_values: 100,
    });
    let categories = [];
    const fc = (facetRes.facet_counts || []).find((f) => f.field_name === 'category');
    if (fc) categories = fc.counts;

    return e.json(200, {
      trending: trending,
      forYou: forYou,
      newArrivals: newArrivals,
      categories: categories,
    });
  } catch (err) {
    return e.json(502, { error: 'home_feed_failed', detail: String(err) });
  }
});

// ── /api/qts — constrained search + category listing + facets ───────
routerAdd('GET', '/api/qts', (e) => {
  try {
    const qp = e.request.url.query();
    const rawQ = String(qp.get('q') || '').trim();
    const category = String(qp.get('category') || '').trim().toLowerCase();
    const brandsCsv = String(qp.get('brands') || '').trim();
    const segment = String(qp.get('segment') || '').trim();
    const tokensCsv = String(qp.get('tokens') || '').trim();
    const scoreBand = String(qp.get('score') || '').trim(); // high|mid|low
    const sortKey = String(qp.get('sort') || 'score').trim();
    const wantFacets = String(qp.get('facets') || '') === '1';

    const isSearch = rawQ.length > 0;
    // A query with neither a search term nor a category would let a
    // scraper page through the whole catalog — refuse it.
    if (!isSearch && !category) {
      return e.json(400, { error: 'category_or_query_required' });
    }

    const perPage = clampInt(qp.get('per_page'), 1, MAX_PER_PAGE, 24);
    // Search results are shallow; a category can be browsed deeper.
    const maxPage = isSearch ? 8 : 60;
    const page = clampInt(qp.get('page'), 1, maxPage, 1);

    // Build filter_by entirely server-side — no raw passthrough.
    const filters = [];
    if (category) filters.push('category:=' + tsLit(category));
    if (brandsCsv) {
      const brands = brandsCsv.split(',').map((b) => b.trim()).filter(Boolean).slice(0, 12);
      if (brands.length) filters.push('brand:[' + brands.map(tsLit).join(',') + ']');
    }
    if (segment) filters.push('price_segment:=' + tsLit(segment));
    if (tokensCsv) {
      const tokens = tokensCsv.split(',').map((tk) => tk.trim()).filter(Boolean).slice(0, 16);
      if (tokens.length) filters.push('filterTokens:[' + tokens.map(tsLit).join(',') + ']');
    }
    if (scoreBand === 'high') filters.push('techScore:>=80');
    else if (scoreBand === 'mid') filters.push('techScore:[60..79]');
    else if (scoreBand === 'low') filters.push('techScore:<60');

    const params = {
      q: isSearch ? rawQ : '*',
      query_by: isSearch ? 'name,brand,keySpecsText,category' : 'name',
      per_page: perPage,
      page: page,
      include_fields: LIGHT_FIELDS,
      sort_by: SORT_WHITELIST[sortKey] || SORT_WHITELIST.score,
    };
    if (isSearch) {
      params.query_by_weights = '5,3,1,2';
      params.sort_by = '_text_match:desc,' + (SORT_WHITELIST[sortKey] || SORT_WHITELIST.score);
    }
    if (filters.length) params.filter_by = filters.join(' && ');
    if (wantFacets) {
      params.facet_by = 'brand,price_segment,filterTokens';
      params.max_facet_values = 200;
    }

    const res = search(params);
    return e.json(200, {
      found: res.found || 0,
      page: page,
      hits: hitsOf(res),
      facets: res.facet_counts || [],
    });
  } catch (err) {
    return e.json(502, { error: 'search_failed', detail: String(err) });
  }
});

// ── /api/qproduct — single full product (with specs) ────────────────
routerAdd('GET', '/api/qproduct', (e) => {
  try {
    const id = String(e.request.url.query().get('id') || '').trim();
    if (!id) return e.json(400, { error: 'id_required' });
    const doc = tsGet(
      '/collections/' + TS_COLLECTION + '/documents/' + encodeURIComponent(id),
    );
    return e.json(200, doc);
  } catch (err) {
    return e.json(404, { error: 'not_found' });
  }
});

// ── /api/qsimilar — same category, nearest tech score ───────────────
routerAdd('GET', '/api/qsimilar', (e) => {
  try {
    const qp = e.request.url.query();
    const category = String(qp.get('category') || '').trim().toLowerCase();
    const exclude = String(qp.get('exclude') || '').trim();
    if (!category) return e.json(200, { hits: [] });
    const res = search({
      q: '*', query_by: 'name',
      filter_by: 'category:=' + tsLit(category),
      sort_by: 'techScore:desc', per_page: 24, include_fields: LIGHT_FIELDS,
    });
    const hits = hitsOf(res).filter((d) => d.id !== exclude).slice(0, 12);
    return e.json(200, { hits: hits });
  } catch (err) {
    return e.json(502, { error: 'similar_failed' });
  }
});
