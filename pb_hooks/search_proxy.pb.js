/// <reference path="../pb_data/types.d.ts" />
// ════════════════════════════════════════════════════════════════════
//  Qor AI — Typesense search proxy (anti-scraping)
//  --------------------------------------------------------------------
//  Keeps the Typesense key server-side so the website can't be scraped
//  from its JS bundle. Bulk endpoints never return `_raw`, per_page is
//  capped, and a query without a category/term is refused.
//
//  NOTE: PocketBase's JSVM runs each routerAdd handler in an isolated
//  scope — it CANNOT see module-level consts/functions. So every helper
//  is defined inside each handler (same pattern as gemini.pb.js).
//
//  Endpoints: /api/qhome  /api/qts  /api/qproduct  /api/qsimilar
// ════════════════════════════════════════════════════════════════════

// ── /api/qhome — curated home feed ──────────────────────────────────
routerAdd('GET', '/api/qhome', (e) => {
  const TS_URL = $os.getenv('QORAI_TS_URL') || 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
  const TS_KEY = $os.getenv('QORAI_TS_KEY') || '9l6gsRj1V9NuXAagocxHJbhmaMgQex9GP7NRFqtT';
  const COL = 'products';
  const LF = 'id,name,imageUrl,category,subcategory,brand,slug,techScore,trendScore,price_segment,lowestPriceUSD,keySpecsText,filterTokens,screenSizeValue,batteryCapacityValue,weightValueKg';
  const lit = (v) => '`' + String(v).replace(/`/g, '') + '`';
  function tsSearch(params) {
    const qs = Object.keys(params)
      .filter((k) => params[k] !== '' && params[k] != null)
      .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])))
      .join('&');
    const res = $http.send({
      url: TS_URL + '/collections/' + COL + '/documents/search?' + qs,
      method: 'GET', headers: { 'X-TYPESENSE-API-KEY': TS_KEY }, timeout: 12,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) throw new Error('ts ' + res.statusCode);
    return res.json != null ? res.json : JSON.parse(res.raw || '{}');
  }
  const docs = (r) => ((r && r.hits) || []).map((h) => h.document);

  try {
    const catsParam = String(e.request.url.query().get('cats') || '').trim();
    const prefCats = catsParam
      ? catsParam.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean).slice(0, 5)
      : [];

    const trending = docs(tsSearch({
      q: '*', query_by: 'name', sort_by: 'trendScore:desc', per_page: 16, include_fields: LF,
    }));

    const forYou = docs(tsSearch({
      q: '*', query_by: 'name', sort_by: 'techScore:desc', per_page: 16, include_fields: LF,
      filter_by: prefCats.length ? 'category:[' + prefCats.map(lit).join(',') + ']' : '',
    }));

    let newArrivals = [];
    try {
      const recs = $app.findRecordsByFilter(COL, "created != ''", '-created', 16, 0);
      const ids = [];
      for (let i = 0; i < recs.length; i++) ids.push(recs[i].id);
      if (ids.length) {
        const byId = docs(tsSearch({
          q: '*', query_by: 'name', per_page: ids.length, include_fields: LF,
          filter_by: 'id:[' + ids.map(lit).join(',') + ']',
        }));
        const map = {};
        for (let i = 0; i < byId.length; i++) map[byId[i].id] = byId[i];
        for (let i = 0; i < ids.length; i++) if (map[ids[i]]) newArrivals.push(map[ids[i]]);
      }
    } catch (err) { newArrivals = []; }

    const facetRes = tsSearch({
      q: '*', query_by: 'name', per_page: 1, facet_by: 'category', max_facet_values: 100,
    });
    let categories = [];
    const fc = (facetRes.facet_counts || []).find((f) => f.field_name === 'category');
    if (fc) categories = fc.counts;

    return e.json(200, { trending, forYou, newArrivals, categories });
  } catch (err) {
    return e.json(502, { error: 'home_feed_failed', detail: String(err) });
  }
});

// ── /api/qts — constrained search + category listing + facets ───────
routerAdd('GET', '/api/qts', (e) => {
  const TS_URL = $os.getenv('QORAI_TS_URL') || 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
  const TS_KEY = $os.getenv('QORAI_TS_KEY') || '9l6gsRj1V9NuXAagocxHJbhmaMgQex9GP7NRFqtT';
  const COL = 'products';
  const LF = 'id,name,imageUrl,category,subcategory,brand,slug,techScore,trendScore,price_segment,lowestPriceUSD,keySpecsText,filterTokens,screenSizeValue,batteryCapacityValue,weightValueKg';
  const MAX_PER_PAGE = 40;
  const SORTS = {
    score: 'techScore:desc', trend: 'trendScore:desc',
    priceUp: 'lowestPriceUSD:asc', priceDown: 'lowestPriceUSD:desc',
  };
  const lit = (v) => '`' + String(v).replace(/`/g, '') + '`';
  const clampInt = (v, min, max, def) => {
    const n = parseInt(v, 10);
    return isNaN(n) ? def : Math.max(min, Math.min(max, n));
  };
  function tsSearch(params) {
    const qs = Object.keys(params)
      .filter((k) => params[k] !== '' && params[k] != null)
      .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])))
      .join('&');
    const res = $http.send({
      url: TS_URL + '/collections/' + COL + '/documents/search?' + qs,
      method: 'GET', headers: { 'X-TYPESENSE-API-KEY': TS_KEY }, timeout: 12,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) throw new Error('ts ' + res.statusCode);
    return res.json != null ? res.json : JSON.parse(res.raw || '{}');
  }
  const docs = (r) => ((r && r.hits) || []).map((h) => h.document);

  try {
    const qp = e.request.url.query();
    const rawQ = String(qp.get('q') || '').trim();
    const category = String(qp.get('category') || '').trim().toLowerCase();
    const brandsCsv = String(qp.get('brands') || '').trim();
    const segment = String(qp.get('segment') || '').trim();
    const tokensCsv = String(qp.get('tokens') || '').trim();
    const scoreBand = String(qp.get('score') || '').trim();
    const sortKey = String(qp.get('sort') || 'score').trim();
    const wantFacets = String(qp.get('facets') || '') === '1';

    const isSearch = rawQ.length > 0;
    if (!isSearch && !category) {
      return e.json(400, { error: 'category_or_query_required' });
    }

    const perPage = clampInt(qp.get('per_page'), 1, MAX_PER_PAGE, 24);
    const page = clampInt(qp.get('page'), 1, isSearch ? 8 : 60, 1);

    const filters = [];
    if (category) filters.push('category:=' + lit(category));
    if (brandsCsv) {
      const brands = brandsCsv.split(',').map((b) => b.trim()).filter(Boolean).slice(0, 12);
      if (brands.length) filters.push('brand:[' + brands.map(lit).join(',') + ']');
    }
    if (segment) filters.push('price_segment:=' + lit(segment));
    if (tokensCsv) {
      const tokens = tokensCsv.split(',').map((tk) => tk.trim()).filter(Boolean).slice(0, 16);
      if (tokens.length) filters.push('filterTokens:[' + tokens.map(lit).join(',') + ']');
    }
    if (scoreBand === 'high') filters.push('techScore:>=80');
    else if (scoreBand === 'mid') filters.push('techScore:[60..79]');
    else if (scoreBand === 'low') filters.push('techScore:<60');

    const params = {
      q: isSearch ? rawQ : '*',
      query_by: isSearch ? 'name,brand,keySpecsText,category' : 'name',
      per_page: perPage, page, include_fields: LF,
      sort_by: SORTS[sortKey] || SORTS.score,
    };
    if (isSearch) {
      params.query_by_weights = '5,3,1,2';
      params.sort_by = '_text_match:desc,' + (SORTS[sortKey] || SORTS.score);
    }
    if (filters.length) params.filter_by = filters.join(' && ');
    if (wantFacets) {
      params.facet_by = 'brand,price_segment,filterTokens';
      params.max_facet_values = 200;
    }

    const res = tsSearch(params);
    return e.json(200, {
      found: res.found || 0, page, hits: docs(res), facets: res.facet_counts || [],
    });
  } catch (err) {
    return e.json(502, { error: 'search_failed', detail: String(err) });
  }
});

// ── /api/qproduct — single full product (with specs) ────────────────
routerAdd('GET', '/api/qproduct', (e) => {
  const TS_URL = $os.getenv('QORAI_TS_URL') || 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
  const TS_KEY = $os.getenv('QORAI_TS_KEY') || '9l6gsRj1V9NuXAagocxHJbhmaMgQex9GP7NRFqtT';
  try {
    const id = String(e.request.url.query().get('id') || '').trim();
    if (!id) return e.json(400, { error: 'id_required' });
    const res = $http.send({
      url: TS_URL + '/collections/products/documents/' + encodeURIComponent(id),
      method: 'GET', headers: { 'X-TYPESENSE-API-KEY': TS_KEY }, timeout: 12,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) return e.json(404, { error: 'not_found' });
    return e.json(200, res.json != null ? res.json : JSON.parse(res.raw || '{}'));
  } catch (err) {
    return e.json(404, { error: 'not_found' });
  }
});

// ── /api/qsimilar — same category, nearest tech score ───────────────
routerAdd('GET', '/api/qsimilar', (e) => {
  const TS_URL = $os.getenv('QORAI_TS_URL') || 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
  const TS_KEY = $os.getenv('QORAI_TS_KEY') || '9l6gsRj1V9NuXAagocxHJbhmaMgQex9GP7NRFqtT';
  const COL = 'products';
  const LF = 'id,name,imageUrl,category,subcategory,brand,slug,techScore,trendScore,price_segment,lowestPriceUSD,keySpecsText,filterTokens,screenSizeValue,batteryCapacityValue,weightValueKg';
  const lit = (v) => '`' + String(v).replace(/`/g, '') + '`';
  try {
    const qp = e.request.url.query();
    const category = String(qp.get('category') || '').trim().toLowerCase();
    const exclude = String(qp.get('exclude') || '').trim();
    if (!category) return e.json(200, { hits: [] });
    const qs = 'q=*&query_by=name&filter_by=' + encodeURIComponent('category:=' + lit(category)) +
      '&sort_by=techScore%3Adesc&per_page=24&include_fields=' + encodeURIComponent(LF);
    const res = $http.send({
      url: TS_URL + '/collections/' + COL + '/documents/search?' + qs,
      method: 'GET', headers: { 'X-TYPESENSE-API-KEY': TS_KEY }, timeout: 12,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) return e.json(200, { hits: [] });
    const json = res.json != null ? res.json : JSON.parse(res.raw || '{}');
    const hits = ((json.hits) || []).map((h) => h.document)
      .filter((d) => d.id !== exclude).slice(0, 12);
    return e.json(200, { hits });
  } catch (err) {
    return e.json(200, { hits: [] });
  }
});
