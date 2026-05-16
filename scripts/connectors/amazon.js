/**
 * Qor AI — Amazon offer connector (Product Advertising API 5.0)
 *
 * Skeleton: structure + product→offer mapping are ready; the PA-API request
 * needs AWS SigV4 signing. Easiest path is the official SDK:
 *     npm i paapi5-nodejs-sdk
 * then fill _searchItems() below. Until credentials + signing are in place
 * searchOffers() returns [] so the pipeline keeps working.
 *
 * Credentials (migration/.env — get them at affiliate-program.amazon.*):
 *   AMAZON_ACCESS_KEY      PA-API access key
 *   AMAZON_SECRET_KEY      PA-API secret key
 *   AMAZON_PARTNER_TAG     Associates store id (also used by lib/affiliate)
 *   AMAZON_HOST            e.g. webservices.amazon.de   (per marketplace)
 *   AMAZON_REGION          e.g. eu-west-1
 *   AMAZON_COUNTRY         e.g. DE
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
const ACCESS = ENV.AMAZON_ACCESS_KEY || '';
const SECRET = ENV.AMAZON_SECRET_KEY || '';
const PARTNER = ENV.AMAZON_PARTNER_TAG || '';
const HOST = ENV.AMAZON_HOST || 'webservices.amazon.com';
const COUNTRY = (ENV.AMAZON_COUNTRY || 'US').toUpperCase();

const isConfigured = () => !!(ACCESS && SECRET && PARTNER);

/**
 * TODO: implement the PA-API 5.0 SearchItems call (SigV4-signed POST to
 * `https://${HOST}/paapi5/searchitems`, target
 * com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems).
 * Request body: { Keywords|ItemIds, SearchIndex, PartnerTag, PartnerType:'Associates',
 *   Marketplace, Resources:['Offers.Listings.Price','ItemInfo.ExternalIds',...] }.
 * Returns the raw SearchResult.Items array.
 */
async function _searchItems(_query) {
  return []; // not yet wired — see module header
}

/** Map a PA-API item to our offer shape. */
function _toOffer(item, product) {
  const listing = item?.Offers?.Listings?.[0];
  const amount = listing?.Price?.Amount;
  if (!amount) return null;
  const url = item?.DetailPageURL || '';
  return {
    gtin: product.gtin || '', mpn: product.mpn || '', brand: product.brand || '',
    store: 'Amazon', network: 'amazon', country: COUNTRY,
    price: Number(amount) || 0,
    currency: listing?.Price?.Currency || '',
    url,
    affiliateUrl: buildAffiliateUrl('amazon', url, { country: COUNTRY }),
    condition: listing?.Condition?.Value ? String(listing.Condition.Value).toLowerCase() : 'new',
    inStock: listing?.Availability?.Type !== 'OutOfStock',
    source: 'amazon-paapi',
  };
}

/** Return offer objects for one product (matched by GTIN/MPN). */
async function searchOffers(product) {
  if (!isConfigured()) return [];
  const query = String(product.gtin || product.mpn || product.name || '').trim();
  if (!query) return [];
  try {
    const items = await _searchItems(query);
    return items.map(it => _toOffer(it, product)).filter(Boolean);
  } catch (e) {
    console.warn('[amazon] search failed:', e.message);
    return [];
  }
}

module.exports = { searchOffers, isConfigured, id: 'amazon' };
