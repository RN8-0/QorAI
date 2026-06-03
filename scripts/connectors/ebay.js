/**
 * Qor AI — eBay Browse API offer connector
 *
 * eBay is useful only when it is strictly filtered. This connector searches
 * fixed-price NEW items only (`conditionIds:{1000}`), skips auctions and used
 * inventory, then writes exact priced offers through scripts/lib/offers.js.
 *
 * Credentials (migration/.env):
 *   EBAY_CLIENT_ID
 *   EBAY_CLIENT_SECRET
 *   EBAY_MARKETS=GB,DE,US        optional; default GB,DE
 *   EBAY_CAMPAIGN_ID             optional ePN campaign id for affiliate URLs
 *   EBAY_CAMPAIGN_ID_GB/_DE      optional per-market ePN override
 */
'use strict';

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

const MARKETPLACES = {
  US: { marketplaceId: 'EBAY_US', currency: 'USD', country: 'US' },
  GB: { marketplaceId: 'EBAY_GB', currency: 'GBP', country: 'GB' },
  UK: { marketplaceId: 'EBAY_GB', currency: 'GBP', country: 'GB' },
  DE: { marketplaceId: 'EBAY_DE', currency: 'EUR', country: 'DE' },
  FR: { marketplaceId: 'EBAY_FR', currency: 'EUR', country: 'FR' },
  IT: { marketplaceId: 'EBAY_IT', currency: 'EUR', country: 'IT' },
  ES: { marketplaceId: 'EBAY_ES', currency: 'EUR', country: 'ES' },
  AU: { marketplaceId: 'EBAY_AU', currency: 'AUD', country: 'AU' },
};

const ACTIVE = (ENV.EBAY_MARKETS || 'GB,DE')
  .split(',')
  .map(s => s.trim().toUpperCase())
  .map(s => (s === 'UK' ? 'GB' : s))
  .filter(c => MARKETPLACES[c]);

let token = null;
let tokenExpiresAt = 0;

const isConfigured = () => Boolean(CLIENT_ID && CLIENT_SECRET && ACTIVE.length);

async function getToken() {
  if (token && Date.now() < tokenExpiresAt - 60_000) return token;
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    }).toString(),
  });
  if (!res.ok) throw new Error(`eBay token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  token = body.access_token;
  tokenExpiresAt = Date.now() + (Number(body.expires_in) || 3600) * 1000;
  return token;
}

function buildKeywordQuery(product) {
  let name = String(product.name || '').replace(/\s+/g, ' ').trim();
  const cut = name.search(/\s(?:\d+(?:[.,]\d+)?\s*(?:cm|mm|inch|gb|tb|ghz|mhz|mah|wh|w)\b|\(\d|dual\s*sim|single\s*sim|android|windows|macos|chrome\s*os|wi-?fi|bluetooth|\d(?:g|G)\b|touchscreen)/i);
  if (cut > 10) name = name.slice(0, cut).trim();
  const brand = String(product.brand || '').trim();
  const brandFirst = brand.split(/\s+/)[0] || '';
  if (brandFirst && !name.toLowerCase().startsWith(brandFirst.toLowerCase())) {
    name = `${brand} ${name}`.trim();
  }
  return name.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function titleLooksRelevant(product, title) {
  const hay = String(title || '').toLowerCase();
  const brand = String(product.brand || '').toLowerCase().trim();
  const mpn = String(product.mpn || '').toLowerCase().trim();
  if (brand && !hay.includes(brand.split(/\s+/)[0])) return false;
  if (mpn && mpn.length >= 4 && hay.includes(mpn)) return true;
  const tokens = buildKeywordQuery(product).toLowerCase()
    .split(/[^a-z0-9ğüşöçıİ]+/i)
    .filter(t => t.length >= 3)
    .slice(0, 5);
  const matched = tokens.filter(t => hay.includes(t)).length;
  return matched >= Math.min(3, tokens.length);
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function searchMarketplace(product, code) {
  const market = MARKETPLACES[code];
  const access = await getToken();
  const q = String(product.gtin || '').trim() || buildKeywordQuery(product);
  if (!q) return [];
  const params = new URLSearchParams({
    q,
    limit: '10',
    filter: 'buyingOptions:{FIXED_PRICE},conditionIds:{1000}',
  });
  const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
    headers: {
      Authorization: `Bearer ${access}`,
      'X-EBAY-C-MARKETPLACE-ID': market.marketplaceId,
    },
  });
  if (!res.ok) throw new Error(`eBay ${market.marketplaceId} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const items = Array.isArray(body.itemSummaries) ? body.itemSummaries : [];
  return items
    .filter(item => String(item.conditionId || '') === '1000')
    .filter(item => Array.isArray(item.buyingOptions) && item.buyingOptions.includes('FIXED_PRICE'))
    .filter(item => titleLooksRelevant(product, item.title))
    .map(item => {
      const price = money(item.price?.value);
      const shipping = money(item.shippingOptions?.[0]?.shippingCost?.value);
      const currency = item.price?.currency || market.currency;
      const url = item.itemWebUrl || item.itemHref || '';
      return {
        gtin: String(product.gtin || ''),
        mpn: product.mpn || '',
        brand: product.brand || '',
        merchantProductId: item.itemId || '',
        title: item.title || '',
        store: 'eBay',
        network: 'ebay',
        country: market.country,
        price,
        shipping,
        totalPrice: price > 0 ? Math.round((price + shipping) * 100) / 100 : 0,
        currency,
        url,
        affiliateUrl: buildAffiliateUrl('ebay', url, { country: market.country, clickref: `qorai-${(product.id || '').slice(0, 12)}` }),
        condition: 'new',
        availability: 'in_stock',
        inStock: true,
        source: 'ebay-browse',
        matchConfidence: product.gtin ? 0.82 : 0.72,
      };
    })
    .filter(offer => offer.price > 0 && offer.url)
    .sort((a, b) => a.totalPrice - b.totalPrice)
    .slice(0, 3);
}

async function searchOffers(product) {
  if (!isConfigured()) return [];
  const out = [];
  for (const code of ACTIVE) {
    const offers = await searchMarketplace(product, code);
    out.push(...offers);
  }
  return out;
}

async function getRateLimit() { return null; }

module.exports = {
  id: 'ebay',
  searchOffers,
  isConfigured,
  getRateLimit,
  CALLS_PER_PRODUCT: ACTIVE.length,
  MARKETPLACES,
  ACTIVE,
};
