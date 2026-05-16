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
const MARKETPLACES = (ENV.EBAY_MARKETPLACES || 'EBAY_US,EBAY_DE').split(',').map(s => s.trim()).filter(Boolean);
const MARKET_COUNTRY = { EBAY_US: 'US', EBAY_DE: 'DE', EBAY_GB: 'GB', EBAY_AU: 'AU', EBAY_TR: 'TR' };

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

/** Return offer objects for one product (matched by GTIN). */
async function searchOffers(product) {
  if (!isConfigured()) return [];
  const gtin = String(product.gtin || '').trim();
  if (!gtin) return [];
  const token = await getToken();
  const out = [];
  for (const market of MARKETPLACES) {
    const r = await httpsJson({
      method: 'GET', hostname: 'api.ebay.com',
      path: `/buy/browse/v1/item_summary/search?gtin=${encodeURIComponent(gtin)}&limit=3`,
      headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': market },
    });
    if (r.status !== 200 || !Array.isArray(r.body.itemSummaries)) continue;
    const country = MARKET_COUNTRY[market] || 'US';
    // Cheapest summary for this marketplace.
    const best = r.body.itemSummaries
      .filter(it => it.price && it.price.value)
      .sort((a, b) => parseFloat(a.price.value) - parseFloat(b.price.value))[0];
    if (!best) continue;
    const url = best.itemAffiliateWebUrl || best.itemWebUrl || '';
    out.push({
      gtin, mpn: product.mpn || '', brand: product.brand || '',
      store: 'eBay', network: 'ebay', country,
      price: parseFloat(best.price.value) || 0,
      currency: best.price.currency || '',
      url,
      affiliateUrl: best.itemAffiliateWebUrl || buildAffiliateUrl('ebay', url, { country }),
      condition: /new/i.test(best.condition || '') ? 'new' : (best.condition || 'used').toLowerCase(),
      inStock: true,
      source: 'ebay-browse',
    });
  }
  return out;
}

module.exports = { searchOffers, isConfigured, id: 'ebay' };
