/**
 * Qor AI — Awin offer connector  (search-link mode)
 *
 * Awin brokers a single publisher account across many retailers (MediaMarkt,
 * Saturn, Cyberport, Currys, AO …). There is NO public price API on the free
 * tier, so — exactly like the Amazon connector — this runs in SEARCH-LINK mode:
 *   - no API call, no rate limit, no price
 *   - one Awin-tracked deep link to each merchant's on-site SEARCH for the
 *     product is produced (the `ued` destination is the merchant search URL)
 *   - `priceUnknown: true` so the front-end renders "<Shop>'ta Görüntüle →"
 *     instead of a price tag
 *
 * IMPORTANT: an Awin merchant id (`awinmid`) is account-specific and only
 * exists once you have been APPROVED for that merchant's program. So every
 * merchant id is read from migration/.env (AWIN_MID_<KEY>). A merchant with no
 * id configured is silently skipped — this connector therefore emits links
 * ONLY for shops you've actually joined, and otherwise no-ops cleanly.
 *
 * Credentials (migration/.env):
 *   AWIN_PUBLISHER_ID        your Awin publisher id (a.k.a. awinaffid)
 *   AWIN_MARKETS             optional CSV of markets to emit (default: DE,GB)
 *   AWIN_MID_MEDIAMARKT_DE   per-merchant Awin id, one per approved shop:
 *   AWIN_MID_SATURN_DE       …
 *   AWIN_MID_CYBERPORT_DE
 *   AWIN_MID_ALTERNATE_DE
 *   AWIN_MID_NBB_DE
 *   AWIN_MID_CURRYS_GB
 *   AWIN_MID_AO_GB
 *   AWIN_MID_EBUYER_GB
 *   AWIN_MID_SCAN_GB
 *
 * Without AWIN_PUBLISHER_ID + at least one merchant id, searchOffers() is a
 * no-op (returns []).
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
const PUBLISHER_ID = ENV.AWIN_PUBLISHER_ID || '';

const enc = (s) => encodeURIComponent(s);

// Known electronics retailers reachable through Awin, with each shop's on-site
// search URL pattern. The `env` key names the migration/.env var that carries
// that shop's Awin merchant id once you're approved for it.
const MERCHANTS = {
  DE: [
    { key: 'MEDIAMARKT_DE', store: 'MediaMarkt', env: 'AWIN_MID_MEDIAMARKT_DE', currency: 'EUR', lang: 'de', flag: '🇩🇪', search: q => `https://www.mediamarkt.de/de/search.html?query=${enc(q)}` },
    { key: 'SATURN_DE',     store: 'Saturn',     env: 'AWIN_MID_SATURN_DE',     currency: 'EUR', lang: 'de', flag: '🇩🇪', search: q => `https://www.saturn.de/de/search.html?query=${enc(q)}` },
    { key: 'CYBERPORT_DE',  store: 'Cyberport',  env: 'AWIN_MID_CYBERPORT_DE',  currency: 'EUR', lang: 'de', flag: '🇩🇪', search: q => `https://www.cyberport.de/suche?q=${enc(q)}` },
    { key: 'ALTERNATE_DE',  store: 'Alternate',  env: 'AWIN_MID_ALTERNATE_DE',  currency: 'EUR', lang: 'de', flag: '🇩🇪', search: q => `https://www.alternate.de/listing.xhtml?q=${enc(q)}` },
    { key: 'NBB_DE',        store: 'notebooksbilliger', env: 'AWIN_MID_NBB_DE',  currency: 'EUR', lang: 'de', flag: '🇩🇪', search: q => `https://www.notebooksbilliger.de/produkte/${enc(q)}` },
  ],
  GB: [
    { key: 'CURRYS_GB', store: 'Currys', env: 'AWIN_MID_CURRYS_GB', currency: 'GBP', lang: 'en', flag: '🇬🇧', search: q => `https://www.currys.co.uk/search?q=${enc(q)}` },
    { key: 'AO_GB',     store: 'AO.com', env: 'AWIN_MID_AO_GB',     currency: 'GBP', lang: 'en', flag: '🇬🇧', search: q => `https://ao.com/search/?searchString=${enc(q)}` },
    { key: 'EBUYER_GB', store: 'Ebuyer', env: 'AWIN_MID_EBUYER_GB', currency: 'GBP', lang: 'en', flag: '🇬🇧', search: q => `https://www.ebuyer.com/search?q=${enc(q)}` },
    { key: 'SCAN_GB',   store: 'Scan',   env: 'AWIN_MID_SCAN_GB',   currency: 'GBP', lang: 'en', flag: '🇬🇧', search: q => `https://www.scan.co.uk/search?q=${enc(q)}` },
  ],
  // Awin's Turkish retailer coverage is thin — TR is better served by a
  // GelirOrtaklari / Admitad connector (Trendyol, Hepsiburada, Teknosa…).
  TR: [],
};

const ACTIVE_MARKETS = (ENV.AWIN_MARKETS || 'DE,GB')
  .split(',').map(s => s.trim().toUpperCase()).filter(c => MERCHANTS[c]);

function midFor(merchant) {
  return (ENV[merchant.env] || '').trim();
}

// Every approved merchant (has both a publisher id and a configured awinmid).
function activeMerchants() {
  if (!PUBLISHER_ID) return [];
  const out = [];
  for (const country of ACTIVE_MARKETS) {
    for (const m of MERCHANTS[country]) {
      if (midFor(m)) out.push({ ...m, country, mid: midFor(m) });
    }
  }
  return out;
}

const isConfigured = () => activeMerchants().length > 0;

// Same keyword heuristic as the Amazon connector: strip the spec tail so the
// shop search returns the right model. "Motorola moto g37 16.9 cm…" → "Motorola moto g37".
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

/**
 * One offer per approved Awin merchant. Search-link mode: no API, no price.
 */
async function searchOffers(product) {
  const merchants = activeMerchants();
  if (!merchants.length) return [];
  const kw = buildKeywordQuery(product);
  if (!kw) return [];

  const out = [];
  for (const m of merchants) {
    const url = m.search(kw);
    out.push({
      gtin: String(product.gtin || ''),
      mpn: product.mpn || '',
      brand: product.brand || '',
      store: m.store,
      network: 'awin',
      country: m.country,
      price: 0,
      priceUnknown: true,
      currency: m.currency,
      url,
      affiliateUrl: buildAffiliateUrl('awin', url, { country: m.country, mid: m.mid, clickref: `qorai-${(product.id || '').slice(0, 12)}` }),
      condition: 'new',
      inStock: true,
      source: 'awin-search',
      lang: m.lang,
      flag: m.flag,
    });
  }
  return out;
}

async function getRateLimit() { return null; }

// Search-link mode is free (no HTTP call).
const CALLS_PER_PRODUCT = 0;

module.exports = {
  searchOffers, isConfigured, getRateLimit, CALLS_PER_PRODUCT, id: 'awin',
  MERCHANTS, ACTIVE_MARKETS,
};
