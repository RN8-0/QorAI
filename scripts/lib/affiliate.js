/**
 * Qor AI — affiliate deep-link builder
 *
 * Wraps a raw retailer URL into a tracked affiliate link. Credentials live in
 * migration/.env (never in the repo); when a network has no credentials the
 * plain URL is returned so nothing breaks.
 *
 *   migration/.env keys (add when you join each program):
 *     AMAZON_TAG            default Amazon Associates store id
 *     AMAZON_TAG_DE / _US…  per-country override (Amazon tags are per-marketplace)
 *     EBAY_CAMPID           eBay Partner Network campaign id
 *     AWIN_PUBLISHER_ID     Awin publisher id (for Awin-brokered shops)
 */
'use strict';

const fs = require('fs');
const path = require('path');

function loadEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'migration', '.env'), 'utf8');
    return Object.fromEntries(
      raw.split(/\r?\n/)
        .filter(l => l && !l.startsWith('#') && l.includes('='))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
    );
  } catch { return {}; }
}
const ENV = loadEnv();

function amazonUrl(url, country) {
  const tag = ENV[`AMAZON_TAG_${String(country || '').toUpperCase()}`] || ENV.AMAZON_TAG || '';
  if (!tag) return url;
  try { const u = new URL(url); u.searchParams.set('tag', tag); return u.toString(); }
  catch { return url; }
}

function ebayUrl(url, _country) {
  const campid = ENV.EBAY_CAMPID || '';
  if (!campid) return url;
  // eBay Partner Network smart-link (rover) wrapper.
  return `https://rover.ebay.com/rover/1/711-53200-19255-0/1` +
    `?mpre=${encodeURIComponent(url)}&campid=${campid}&toolid=10001`;
}

function awinUrl(url, _country) {
  const pub = ENV.AWIN_PUBLISHER_ID || '';
  const mid = ENV.AWIN_MERCHANT_ID || '';
  if (!pub || !mid) return url;
  return `https://www.awin1.com/cread.php?awinmid=${mid}&awinaffid=${pub}` +
    `&ued=${encodeURIComponent(url)}`;
}

/**
 * @param {string} network  amazon | ebay | awin | direct | geizhals | …
 * @param {string} url      raw retailer URL
 * @param {{country?:string}} opts
 * @returns {string} affiliate-wrapped URL (or the plain URL if not configured)
 */
function buildAffiliateUrl(network, url, opts = {}) {
  if (!url) return '';
  switch (String(network || '').toLowerCase()) {
    case 'amazon': return amazonUrl(url, opts.country);
    case 'ebay':   return ebayUrl(url, opts.country);
    case 'awin':   return awinUrl(url, opts.country);
    default:       return url; // direct / geizhals deep links need no wrap
  }
}

/** True when at least one affiliate program is configured. */
function hasAnyAffiliateConfig() {
  return !!(ENV.AMAZON_TAG || ENV.EBAY_CAMPID || ENV.AWIN_PUBLISHER_ID ||
    Object.keys(ENV).some(k => k.startsWith('AMAZON_TAG_')));
}

module.exports = { buildAffiliateUrl, hasAnyAffiliateConfig };
