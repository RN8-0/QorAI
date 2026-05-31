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

function amazonUrl(url, opts = {}) {
  const country = String(opts.country || '').toUpperCase();
  const tag = ENV[`AMAZON_TAG_${country}`] || ENV.AMAZON_TAG || '';
  if (!tag) return url;
  try { const u = new URL(url); u.searchParams.set('tag', tag); return u.toString(); }
  catch { return url; }
}

// Awin deep link. The merchant id (awinmid) is account- AND merchant-specific
// — you only know it once you're approved for that shop's program — so the
// connector passes it per-offer via opts.mid. Falls back to a single
// AWIN_MERCHANT_ID env for the legacy single-merchant path. clickref carries a
// stable sub-id so we can attribute clicks back to the catalog in reports.
function awinUrl(url, opts = {}) {
  const pub = ENV.AWIN_PUBLISHER_ID || '';
  const mid = opts.mid || ENV.AWIN_MERCHANT_ID || '';
  if (!pub || !mid) return url;
  const clickref = encodeURIComponent(opts.clickref || 'qorai');
  return `https://www.awin1.com/cread.php?awinmid=${encodeURIComponent(mid)}` +
    `&awinaffid=${encodeURIComponent(pub)}&clickref=${clickref}` +
    `&ued=${encodeURIComponent(url)}`;
}

/**
 * @param {string} network  amazon | awin | direct | geizhals | …
 * @param {string} url      raw retailer URL
 * @param {{country?:string, mid?:string, clickref?:string}} opts
 * @returns {string} affiliate-wrapped URL (or the plain URL if not configured)
 */
function buildAffiliateUrl(network, url, opts = {}) {
  if (!url) return '';
  switch (String(network || '').toLowerCase()) {
    case 'amazon': return amazonUrl(url, opts);
    case 'awin':   return awinUrl(url, opts);
    default:       return url; // direct / geizhals deep links need no wrap
  }
}

/** True when at least one affiliate program is configured. */
function hasAnyAffiliateConfig() {
  return !!(ENV.AMAZON_TAG || ENV.AWIN_PUBLISHER_ID ||
    Object.keys(ENV).some(k => k.startsWith('AMAZON_TAG_')));
}

module.exports = { buildAffiliateUrl, hasAnyAffiliateConfig };
