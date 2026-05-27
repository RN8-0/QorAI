/**
 * Qor AI — Amazon Associates offer connector
 *
 * Amazon's current API path is guarded behind Associates approval and
 * recent qualifying sales (Creators API / PA-API access is not available
 * to a brand-new account). Until the account is approved this connector
 * runs in SEARCH-LINK mode:
 *   - no API call, no rate limit, no credentials beyond the associates tag
 *   - one affiliate-tagged Amazon SEARCH URL is produced per marketplace
 *   - `priceUnknown: true` is set on every offer so the front-end renders
 *     "Amazon'da Görüntüle →" instead of a price tag
 *
 * Once Amazon API credentials land in migration/.env (AMAZON_ACCESS_KEY +
 * AMAZON_SECRET_KEY) a priced SearchItems path can be enabled here.
 *
 * Credentials (migration/.env):
 *   AMAZON_TAG               default associates tag (e.g. qorai-20)
 *   AMAZON_TAG_US / _DE / _UK / _FR / _ES / _IT / _BR / _TR …
 *                            per-marketplace tag (Amazon issues a separate
 *                            tag for every storefront — required, since a
 *                            US tag does not track on amazon.de etc.)
 *   AMAZON_MARKETPLACES      optional CSV (default: US,GB,DE,FR,ES,IT)
 *   AMAZON_ACCESS_KEY        (future) Creators/PA-API access key
 *   AMAZON_SECRET_KEY        (future) Creators/PA-API secret key
 *
 * Without any tag set, searchOffers() returns [] (no-op).
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
const DEFAULT_TAG = ENV.AMAZON_TAG || ENV.AMAZON_PARTNER_TAG || '';

// Marketplace metadata. host = storefront domain, currency = ISO 4217,
// lang = UI language the store is served in (used by downstream price
// rollup to route the right link per user locale), flag = emoji used in
// admin diagnostics.
const MARKETPLACES = {
  US: { host: 'amazon.com',      currency: 'USD', lang: 'en', flag: '🇺🇸' },
  GB: { host: 'amazon.co.uk',    currency: 'GBP', lang: 'en', flag: '🇬🇧' },
  DE: { host: 'amazon.de',       currency: 'EUR', lang: 'de', flag: '🇩🇪' },
  FR: { host: 'amazon.fr',       currency: 'EUR', lang: 'fr', flag: '🇫🇷' },
  ES: { host: 'amazon.es',       currency: 'EUR', lang: 'es', flag: '🇪🇸' },
  IT: { host: 'amazon.it',       currency: 'EUR', lang: 'it', flag: '🇮🇹' },
  NL: { host: 'amazon.nl',       currency: 'EUR', lang: 'nl', flag: '🇳🇱' },
  PL: { host: 'amazon.pl',       currency: 'PLN', lang: 'pl', flag: '🇵🇱' },
  SE: { host: 'amazon.se',       currency: 'SEK', lang: 'sv', flag: '🇸🇪' },
  BE: { host: 'amazon.com.be',   currency: 'EUR', lang: 'fr', flag: '🇧🇪' },
  TR: { host: 'amazon.com.tr',   currency: 'TRY', lang: 'tr', flag: '🇹🇷' },
  BR: { host: 'amazon.com.br',   currency: 'BRL', lang: 'pt', flag: '🇧🇷' },
  CA: { host: 'amazon.ca',       currency: 'CAD', lang: 'en', flag: '🇨🇦' },
  AU: { host: 'amazon.com.au',   currency: 'AUD', lang: 'en', flag: '🇦🇺' },
  MX: { host: 'amazon.com.mx',   currency: 'MXN', lang: 'es', flag: '🇲🇽' },
  JP: { host: 'amazon.co.jp',    currency: 'JPY', lang: 'ja', flag: '🇯🇵' },
};
// Default to the 6 markets matched to TARGET_LANGS rollout. BR requires a
// Brazilian bank account for payout and TR Amazon stock is partial — both
// stay opt-in via env override.
const ACTIVE = (ENV.AMAZON_MARKETPLACES || 'US,GB,DE,FR,ES,IT')
  .split(',').map(s => s.trim().toUpperCase()).filter(c => MARKETPLACES[c]);

// Reverse map: target language → preferred Amazon storefronts (in order).
// Consumed by the website's price rollup when picking the best link to
// surface for a given user locale.
const LANG_PREFERRED_MARKETS = {
  tr: ['DE', 'GB'],        // amazon.com.tr stock is thin; DE/GB ship intl
  en: ['US', 'GB', 'CA', 'AU'],
  de: ['DE'],
  fr: ['FR', 'BE'],
  es: ['ES', 'MX'],
  it: ['IT'],
  pt: ['ES', 'GB'],        // closest stocked storefronts to PT/BR locale
  ru: ['DE', 'GB'],        // no native RU site; ship from DE/GB
};

function tagFor(country) {
  return ENV[`AMAZON_TAG_${country}`] || DEFAULT_TAG;
}
const isConfigured = () => ACTIVE.some(c => tagFor(c));

// Build a clean search query from the product name. Same heuristic as the
// Strip the spec tail so amazon search returns the right
// model. "Motorola moto g37 16.9 cm (6.67")…" → "Motorola moto g37".
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

function _searchUrl(host, q) {
  return `https://www.${host}/s?k=${encodeURIComponent(q)}&i=electronics`;
}

/**
 * Return offer objects for one product across every configured Amazon
 * storefront. Search-link mode: no PA-API call, no price. Front-end
 * renders a "Amazon'da Görüntüle →" link instead of a price tag when
 * `priceUnknown: true` is set. Once PA-API credentials land we'll
 * switch the body to SearchItems + populate price / currency for real.
 */
async function searchOffers(product) {
  if (!isConfigured()) return [];
  const gtin = String(product.gtin || '').trim();
  const kw = buildKeywordQuery(product);
  if (!gtin && !kw) return [];

  const out = [];
  for (const country of ACTIVE) {
    const tag = tagFor(country);
    if (!tag) continue;
    const m = MARKETPLACES[country];
    // Prefer GTIN when present — Amazon redirects to the canonical product
    // page on a single match, which is the ideal landing for the click.
    const q = gtin || kw;
    const url = _searchUrl(m.host, q);
    out.push({
      gtin, mpn: product.mpn || '', brand: product.brand || '',
      store: 'Amazon', network: 'amazon', country,
      price: 0,                                 // unknown until PA-API
      priceUnknown: true,
      currency: m.currency,
      url,
      affiliateUrl: buildAffiliateUrl('amazon', url, { country }),
      condition: 'new',
      inStock: true,
      source: 'amazon-search',
      lang: m.lang,
      flag: m.flag,
    });
  }
  return out;
}

/** PA-API rate limit — null until credentials provisioned. */
async function getRateLimit() {
  // TODO: implement PA-API SearchItems quota lookup once
  // AMAZON_ACCESS_KEY / AMAZON_SECRET_KEY land in migration/.env.
  return null;
}

// Search-link mode is free (no HTTP call), so the offers runner can
// schedule it unlimited times.
const CALLS_PER_PRODUCT = 0;

module.exports = {
  searchOffers, isConfigured, getRateLimit, CALLS_PER_PRODUCT, id: 'amazon',
  MARKETPLACES, ACTIVE, LANG_PREFERRED_MARKETS,
};
