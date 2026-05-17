/**
 * Qor AI — eBay offer connector (eBay Browse API)
 *
 * Searches eBay by a product's GTIN and returns offer objects ready for
 * scripts/lib/offers.js → upsertOffer().
 *
 * Credentials (migration/.env — get them at developer.ebay.com):
 *   EBAY_CLIENT_ID       application Client ID
 *   EBAY_CLIENT_SECRET   application Client Secret
 *   EBAY_MARKETPLACES    optional CSV, default "EBAY_US,EBAY_DE"
 *
 * Without credentials searchOffers() returns [] (no-op), so the rest of the
 * pipeline keeps working until the eBay program is set up.
 */
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const { buildAffiliateUrl } = require('../lib/affiliate');

function loadEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'migration', '.env'), 'utf8');
    return Object.fromEntries(raw.split(/\r?\n/)
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  } catch { return {}; }
}
const ENV = loadEnv();
const CLIENT_ID = ENV.EBAY_CLIENT_ID || '';
const CLIENT_SECRET = ENV.EBAY_CLIENT_SECRET || '';
const CAMPID = ENV.EBAY_CAMPID || '';
const MARKETPLACES = (ENV.EBAY_MARKETPLACES || 'EBAY_US,EBAY_DE').split(',').map(s => s.trim()).filter(Boolean);
const MARKET_COUNTRY = { EBAY_US: 'US', EBAY_DE: 'DE', EBAY_GB: 'GB', EBAY_AU: 'AU', EBAY_TR: 'TR' };

// Our category slug → eBay top-level category id. Restricting the search to
// the real product category keeps phone CASES out of phone results, laptop
// SLEEVES out of laptop results, etc. — the single biggest accuracy win.
const EBAY_CATEGORY = {
  smartphones: '9355', mobile_phones: '9355',
  laptops: '177', desktops: '171957', all_in_one_pcs: '171957',
  tablets: '171485',
  monitors: '80053', tvs: '11071',
  cpus: '164', motherboards: '1244', graphics_cards: '27386',
  ram: '170083', ssd: '175669', external_ssd: '175669',
  hard_drives: '56083', external_hdd: '171243',
  headphones: '112529', speakers: '14990',
  smartwatches: '178893',
  keyboards: '33963', mice: '23160',
  cameras: '31388', digital_cameras: '31388',
  printers: '1245',
};

// Conservative accessory filter — a backup for cases/covers that sellers
// mis-list inside the product category. Only unambiguous accessory words so
// a real device listing is never dropped.
const ACCESSORY_RE = /\b(case|cover|kılıf|kilif|sleeve|pouch|protector|tempered|screen\s*guard|bumper|\bskin\b|lanyard|for\s+(?:samsung|apple|iphone|ipad|xiaomi|huawei|lenovo|hp|dell|asus|sony|lg)\b|replacement\s+(?:screen|battery|part)|spare\s+part)\b/i;

// Broken / spare-parts listings — never a valid price for a working device.
const JUNK_RE = /\b(for\s+parts|not\s+working|spares?\s+(?:or\s+)?repairs?|faulty|defective|cracked|screen\s+only|lcd\s+only|digitizer|motherboard\s+only|board\s+only|housing\s+only)\b/i;

const isConfigured = () => !!(CLIENT_ID && CLIENT_SECRET);

function httpsJson(opts, body) {
  return new Promise((resolve, reject) => {
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d || '{}') }); } catch { resolve({ status: res.statusCode, body: {} }); } });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

let _token = null, _tokenExp = 0;
async function getToken() {
  if (_token && Date.now() < _tokenExp) return _token;
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const body = 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope');
  const r = await httpsJson({
    method: 'POST', hostname: 'api.ebay.com', path: '/identity/v1/oauth2/token',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
  }, body);
  if (r.status !== 200 || !r.body.access_token) throw new Error(`eBay OAuth failed (${r.status})`);
  _token = r.body.access_token;
  _tokenExp = Date.now() + (r.body.expires_in || 7000) * 1000 - 60000;
  return _token;
}

// Build a clean keyword query from a (often verbose) product name: keep the
// brand + model, drop the spec tail (screen size, RAM, OS, colour…) that would
// only confuse eBay's search. "Motorola moto g37 16.9 cm (6.67\") Dual SIM
// Android 16.0 5G 8 GB 256 GB…" → "Motorola moto g37".
function buildKeywordQuery(product) {
  let name = String(product.name || '').replace(/\s+/g, ' ').trim();
  const cut = name.search(/\s(?:\d+(?:[.,]\d+)?\s*(?:cm|mm|inch|gb|tb|ghz|mhz|mah|wh|w)\b|\(\d|dual\s*sim|single\s*sim|android|windows|macos|chrome\s*os|wi-?fi|bluetooth|\d(?:g|G)\b|touchscreen)/i);
  if (cut > 10) name = name.slice(0, cut).trim();
  const brand = String(product.brand || '').trim();
  const brandFirst = brand.split(/\s+/)[0] || '';
  if (brandFirst && !name.toLowerCase().startsWith(brandFirst.toLowerCase())) {
    name = `${brand} ${name}`.trim();
  }
  return name.replace(/\s+/g, ' ').trim().slice(0, 80);
}

// Distinctive model tokens — alphanumeric chunks that contain a digit
// (e.g. "g37", "s918b", "16"). A candidate eBay title must contain the brand
// and at least one of these, otherwise it's a different product.
function modelTokens(query) {
  return query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2 && /\d/.test(w));
}
function titleMatches(title, brandFirst, tokens) {
  const t = String(title || '').toLowerCase();
  if (ACCESSORY_RE.test(t)) return false;                       // case / cover / "for iPhone" …
  if (brandFirst && brandFirst.length > 1 && !t.includes(brandFirst.toLowerCase())) return false;
  if (tokens.length && !tokens.some(tok => t.includes(tok))) return false;
  return true;
}

/** Return offer objects for one product. */
async function searchOffers(product) {
  if (!isConfigured()) return [];
  const gtin = String(product.gtin || '').trim();
  const brand = String(product.brand || '').trim();
  const brandFirst = brand.split(/\s+/)[0] || '';
  const kw = buildKeywordQuery(product);
  const tokens = modelTokens(kw);
  if (!gtin && !kw) return [];

  const catId = EBAY_CATEGORY[String(product.category || '').trim()] || '';
  const token = await getToken();
  const out = [];
  for (const market of MARKETPLACES) {
    const country = MARKET_COUNTRY[market] || 'US';
    const hit = async (qs) => {
      const cat = catId ? `&category_ids=${catId}` : '';
      const headers = { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': market };
      // This header is what makes eBay return `itemAffiliateWebUrl` — a real,
      // working EPN-tracked deep link. Without it the API gives no affiliate
      // URL and the old rover.ebay.com fallback lands on a blank page.
      if (CAMPID) headers['X-EBAY-C-ENDUSERCTX'] = `affiliateCampaignId=${CAMPID}`;
      const r = await httpsJson({
        method: 'GET', hostname: 'api.ebay.com',
        path: `/buy/browse/v1/item_summary/search?${qs}${cat}&limit=10`,
        headers,
      });
      return (r.status === 200 && Array.isArray(r.body.itemSummaries)) ? r.body.itemSummaries : [];
    };

    // A usable listing has a price, is not "For parts or not working"
    // (eBay conditionId 7000) and is not a broken/spares listing.
    const usable = it => it.price && it.price.value
      && String(it.conditionId || '') !== '7000'
      && !JUNK_RE.test(String(it.title || ''));

    // GTIN is exact but eBay listings rarely carry one — fall back to a
    // validated keyword search so the product still gets an offer.
    let items = gtin ? await hit(`gtin=${encodeURIComponent(gtin)}`) : [];
    let matched = items.filter(usable);
    if (!matched.length && kw) {
      items = await hit(`q=${encodeURIComponent(kw)}`);
      matched = items.filter(it => usable(it) && titleMatches(it.title, brandFirst, tokens));
    }
    if (!matched.length) continue;

    // eBay conditionId is language-independent (the localized text is "Neu",
    // "Gebraucht"… on non-US sites). 1000/1500 = new, 2000-2750 = refurbished.
    const condOf = it => {
      const id = String(it.conditionId || '');
      if (id === '1000' || id === '1500') return 'new';
      if (/^2[0-7]/.test(id)) return 'refurbished';
      if (id) return 'used';
      return /new/i.test(it.condition || '') ? 'new' : 'used';
    };
    // Prefer new, then refurbished, then used; within a tier, the cheapest.
    const rank = { new: 0, refurbished: 1, used: 2 };
    const best = matched.sort((a, b) =>
      (rank[condOf(a)] - rank[condOf(b)]) ||
      (parseFloat(a.price.value) - parseFloat(b.price.value)))[0];
    const url = best.itemAffiliateWebUrl || best.itemWebUrl || '';
    out.push({
      gtin, mpn: product.mpn || '', brand,
      store: 'eBay', network: 'ebay', country,
      price: parseFloat(best.price.value) || 0,
      currency: best.price.currency || '',
      url,
      affiliateUrl: best.itemAffiliateWebUrl || buildAffiliateUrl('ebay', url, { country }),
      condition: condOf(best),
      inStock: true,
      source: 'ebay-browse',
    });
  }
  return out;
}

/** Live Browse-API daily quota for this app: { limit, remaining, reset }. */
async function getRateLimit() {
  if (!isConfigured()) return null;
  try {
    const token = await getToken();
    const r = await httpsJson({
      method: 'GET', hostname: 'api.ebay.com',
      path: '/developer/analytics/v1_beta/rate_limit/?api_context=buy&api_name=Browse',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status !== 200) return null;
    for (const g of (r.body.rateLimits || [])) {
      for (const rs of (g.resources || [])) {
        if (/(^|\.)browse$/i.test(rs.name || '')) {
          const rate = (rs.rates || [])[0];
          if (rate) return { limit: rate.limit, remaining: rate.remaining, reset: rate.reset };
        }
      }
    }
    return null;
  } catch { return null; }
}

// Roughly how many Browse calls one product costs: one per marketplace, plus
// a keyword retry when the GTIN lookup returns nothing.
const CALLS_PER_PRODUCT = MARKETPLACES.length * 2;

module.exports = { searchOffers, isConfigured, getRateLimit, CALLS_PER_PRODUCT, id: 'ebay' };
