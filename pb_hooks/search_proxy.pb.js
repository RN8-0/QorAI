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
  const TS_KEY = $os.getenv('QORAI_TS_KEY') || 'BFc7h2MZhq5yct2GxzkClzQtzzCglKIb';
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
  const TS_KEY = $os.getenv('QORAI_TS_KEY') || 'BFc7h2MZhq5yct2GxzkClzQtzzCglKIb';
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
  const TS_KEY = $os.getenv('QORAI_TS_KEY') || 'BFc7h2MZhq5yct2GxzkClzQtzzCglKIb';
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
  const TS_KEY = $os.getenv('QORAI_TS_KEY') || 'BFc7h2MZhq5yct2GxzkClzQtzzCglKIb';
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

// ── Image proxy: GET /api/img?url=<image url> ───────────────────────────────
//  Makes blog image links robust regardless of host. The browser fails on
//  Wikipedia/Wikimedia "File:"/"Dosya:" *pages* and on hotlink-protected hosts;
//  this fetches server-side (real browser UA, no CORS/referrer issue) and
//  streams the bytes back from our own domain. Used as the on-error fallback by
//  the website + admin. HTML pages (not images) return 415 so the <img> hides.
//  NOTE: helpers are inlined — PB's JSVM runs each handler in an isolated scope.
routerAdd('GET', '/api/img', (e) => {
  try {
    let url = '';
    try { url = String(e.request.url.query().get('url') || '').trim(); } catch (_) {}
    if (!url) return e.json(400, { error: 'missing_url' });

    // Normalise common "page" URLs to a direct image URL.
    // Wikipedia/Wikimedia file pages → Special:FilePath (redirects to the file).
    const wiki = url.match(/^https?:\/\/[^/]*\bwiki(?:pedia|media)\.org\/wiki\/(?:File|Dosya|Datei|Fichier|Archivo):(.+)$/i);
    if (wiki) url = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + wiki[1];

    if (!/^https?:\/\//i.test(url)) return e.json(400, { error: 'bad_url' });

    // ── SSRF guard: block internal / private fetch targets ──────────────
    // /api/img fetches an attacker-supplied URL server-side. Without this an
    // attacker could reach loopback/LAN services, cloud metadata, or our own
    // Typesense/PB via the host IP or *.sslip.io. Named hosts that aren't
    // obviously internal stay allowed (blog images live on arbitrary public
    // hosts); we block literal private IPs + known-internal names. (DNS
    // rebinding is out of scope for the JSVM.)
    var _host = '';
    try {
      var _m = url.match(/^https?:\/\/([^/?#]+)/i);
      var _auth = _m ? _m[1] : '';
      var _at = _auth.lastIndexOf('@');
      if (_at >= 0) _auth = _auth.slice(_at + 1);
      var _v6 = _auth.match(/^\[([^\]]+)\]/);
      _host = (_v6 ? _v6[1] : _auth.split(':')[0]).toLowerCase();
    } catch (_) { _host = ''; }
    function _isBlockedHost(h) {
      if (!h) return true;
      if (h === 'localhost' || h === 'localhost.localdomain') return true;
      if (/(^|\.)(local|internal|lan|intranet|corp|home)$/.test(h)) return true;
      if (h === 'metadata.google.internal') return true;
      if (h.indexOf('sslip.io') !== -1) return true;      // our internal TS/PB hosts
      if (h.indexOf('46.225.95.201') !== -1) return true; // our host IP
      if (h.indexOf(':') !== -1) return true;             // IPv6 literal
      var ip = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (ip) {
        var a = +ip[1], b = +ip[2];
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 169 && b === 254) return true;          // link-local + cloud metadata
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
        if (a >= 224) return true;                         // multicast / reserved
      }
      return false;
    }
    if (_isBlockedHost(_host)) return e.json(400, { error: 'blocked_host' });

    const res = $http.send({
      method: 'GET', url,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept': 'image/*,*/*' },
      timeout: 15,
    });
    const hdr = res.headers || {};
    const ctRaw = hdr['Content-Type'] || hdr['content-type'] || [];
    const ct = String(Array.isArray(ctRaw) ? (ctRaw[0] || '') : ctRaw).toLowerCase();
    if (res.statusCode !== 200 || ct.indexOf('image/') !== 0) {
      return e.json(415, { error: 'not_an_image', status: res.statusCode, contentType: ct });
    }
    // CORS + cache so the website can canvas-read the image (logo brightness
    // detection) and browsers can cache the proxied bytes.
    try {
      const h = e.response.header();
      h.set('Access-Control-Allow-Origin', '*');
      h.set('Cache-Control', 'public, max-age=86400');
    } catch (_) {}
    return e.blob(200, ct, res.body);
  } catch (err) {
    return e.json(502, { error: 'fetch_failed', detail: String(err) });
  }
});

// ── /api/resolve-link — kısa/paylaşım linkini NİHAİ URL'e çözer ──────────
//
// NEDEN SUNUCUDA: kısaltılmış Amazon linkleri (amzn.eu/d/…, a.co/…) CİHAZDAN
// çözülemiyor. Ölçülen kanıt: aynı URL'e `curl` 301 dönerken Dart'ın
// `Dio`/`dart:io` HttpClient'ı 403 alıyor — Dart'ın TLS parmak izi bot olarak
// sınıflanıyor. Hiçbir istemci ayarıyla düzelmez; tek yol sunucu.
//
// İKİ YOLLU: `$http.send` sürüme göre yönlendirmeleri kendi izleyebilir.
//   1) Elle hop: 3xx + `Location` görürsek zinciri biz yürütürüz (her hop'ta
//      SSRF denetimi yapılabildiği için tercih edilen yol).
//   2) Otomatik izlendiyse ilk yanıt 2xx gelir ve `Location` yoktur → nihai
//      URL'i HTML'in `<link rel=canonical>` / `og:url` etiketinden okuruz.
//
// GÜVENLİK (SSRF): yalnız http/https; localhost, 127./10./172.16-31./192.168./
// 169.254. (bulut metadata) /100.64-127. ve IPv6 yerel aralıkları HER hop'ta
// engellenir; en fazla 5 yönlendirme; hop + toplam süre sınırı.
//
// NOT: PB JSVM her handler'ı İZOLE kapsamda koşturur — dosya kapsamındaki
// fonksiyonlar GÖRÜNMEZ, bu yüzden tüm yardımcılar handler'ın içindedir.
routerAdd('GET', '/api/resolve-link', (e) => {
  const MAX_HOPS = 5;
  const HOP_TIMEOUT_S = 8;
  const TOTAL_BUDGET_MS = 20000;
  const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

  function hostOf(u) {
    try {
      const m = String(u).match(/^https?:\/\/([^/?#]+)/i);
      if (!m) return '';
      let h = m[1];
      const at = h.lastIndexOf('@');
      if (at >= 0) h = h.slice(at + 1);
      if (h.charAt(0) === '[') return h.slice(1, h.indexOf(']')).toLowerCase();
      const colon = h.lastIndexOf(':');
      if (colon > 0) h = h.slice(0, colon);
      return h.toLowerCase();
    } catch (_) { return ''; }
  }

  function isBlockedHost(h) {
    if (!h) return true;
    if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
    if (h.length > 6 && h.slice(-6) === '.local') return true;
    if (h.indexOf('.internal') > 0) return true;
    const p = h.split('.');
    if (p.length === 4 && p.every((x) => /^\d{1,3}$/.test(x))) {
      const a = +p[0]; const b = +p[1];
      if (a === 127 || a === 10 || a === 0) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 169 && b === 254) return true;
      if (a === 100 && b >= 64 && b <= 127) return true;
      if (a >= 224) return true;
    }
    if (/^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
    return false;
  }

  function isSafeUrl(u) {
    if (!/^https?:\/\//i.test(String(u || ''))) return false;
    return !isBlockedHost(hostOf(u));
  }

  function absolutize(base, loc) {
    const l = String(loc || '').trim();
    if (!l) return '';
    if (/^https?:\/\//i.test(l)) return l;
    const m = String(base).match(/^(https?:)\/\/([^/?#]+)([^?#]*)/i);
    if (!m) return '';
    const scheme = m[1]; const host = m[2]; const path = m[3] || '/';
    if (l.indexOf('//') === 0) return scheme + l;
    if (l.charAt(0) === '/') return scheme + '//' + host + l;
    const dir = path.slice(0, path.lastIndexOf('/') + 1) || '/';
    return scheme + '//' + host + dir + l;
  }

  function headerOf(res, name) {
    try {
      const hs = res.headers || {};
      const v = hs[name] || hs[name.toLowerCase()] ||
        hs[name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()];
      return Array.isArray(v) ? String(v[0] || '') : String(v || '');
    } catch (_) { return ''; }
  }

  function titleOf(html) {
    const m = String(html || '').match(/<title[^>]*>([\s\S]{0,400}?)<\/title>/i);
    if (!m) return '';
    return m[1]
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 300);
  }

  // Otomatik yönlendirme durumunda nihai URL'i sayfanın kendisinden oku.
  function canonicalOf(html, base) {
    const s = String(html || '');
    let m = s.match(/<link[^>]+rel=["']?canonical["']?[^>]*href=["']([^"']+)["']/i)
      || s.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']?canonical["']?/i)
      || s.match(/<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i);
    if (!m) return '';
    const abs = absolutize(base, m[1]);
    return isSafeUrl(abs) ? abs : '';
  }

  const raw = String(e.request.url.query().get('url') || '').trim();
  if (!raw) return e.json(400, { error: 'url required' });
  if (raw.length > 2048) return e.json(400, { error: 'url too long' });
  if (!isSafeUrl(raw)) return e.json(400, { error: 'unsupported or blocked url' });

  const startedAt = Date.now();
  let current = raw;
  let title = '';
  let hops = 0;
  let status = 0;

  try {
    for (; hops < MAX_HOPS; hops++) {
      if (Date.now() - startedAt > TOTAL_BUDGET_MS) break;
      const res = $http.send({
        url: current,
        method: 'GET',
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: HOP_TIMEOUT_S,
      });
      status = res.statusCode || 0;

      const loc = headerOf(res, 'Location');
      if (status >= 300 && status < 400 && loc) {
        const next = absolutize(current, loc);
        if (!next || next === current) break;
        if (!isSafeUrl(next)) break;      // SSRF: iç ağa yönlendirme -> dur
        current = next;
        continue;
      }

      if (status >= 200 && status < 300) {
        const html = res.raw || '';
        title = titleOf(html);
        // Yönlendirmeler istemci tarafından otomatik izlendiyse `current` hâlâ
        // kısa link olur; sayfanın kendi kanonik adresi nihai URL'i verir.
        const canon = canonicalOf(html, current);
        if (canon && canon !== current) current = canon;
      }
      break;
    }
  } catch (err) {
    return e.json(200, { url: current, resolved: current !== raw, hops: hops, title: title, error: String(err) });
  }

  return e.json(200, {
    url: current,
    resolved: current !== raw,
    hops: hops,
    status: status,
    title: title,
  });
});
