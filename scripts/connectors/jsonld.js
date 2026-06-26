/**
 * Qor AI — JSON-LD price scraper connector
 *
 * Gets REAL merchant prices WITHOUT any affiliate-network or product-feed
 * approval — the gap that left the other three connectors (amazon/awin/admitad)
 * dormant. It fetches a merchant's product page through the local scraper-proxy
 * (puppeteer-stealth, so Cloudflare / bot walls are cleared the same way the
 * Epey catalogue scrape clears them) and reads schema.org Product `offers`
 * (price / priceCurrency / availability). JSON-LD is the most stable extraction
 * method — it's the merchant's own structured data, not fragile CSS.
 *
 * Price and affiliation are DECOUPLED on purpose: the displayed number comes
 * from the scrape; the outbound click is wrapped by buildAffiliateUrl() when
 * that merchant's program is configured, otherwise it's a plain direct link.
 * So you can show İnceHesap's price + your İnceHesap affiliate link even though
 * İnceHesap gives you "only a link, no feed".
 *
 * Config (migration/.env):
 *   SCRAPER_PROXY_URL=http://127.0.0.1:3456     (default; the running proxy)
 *   JSONLD_MARKETS=TR,DE,GB
 *   JSONLD_MERCHANTS=KEY|Store|Country|Currency|network|searchUrlTemplate|productLinkRegex ; …
 *
 * Example (one line per merchant, ';'-separated):
 *   INCEHESAP_TR|İnceHesap|TR|TRY|direct|https://www.incehesap.com/arama/?ara={q}|/[a-z0-9-]+-fiyati-\\d+
 *
 *   - searchUrlTemplate MUST contain {q}
 *   - productLinkRegex (optional) matches the href of a product page in the
 *     search results; omit it if the search page itself carries Product JSON-LD.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function loadEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'migration', '.env'), 'utf8');
    return Object.fromEntries(raw.split(/\r?\n/)
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  } catch { return {}; }
}

const ENV = loadEnv();
const PROXY = (ENV.SCRAPER_PROXY_URL || 'http://127.0.0.1:3456').replace(/\/+$/, '');
const ACTIVE_MARKETS = new Set((ENV.JSONLD_MARKETS || 'TR,DE,GB').split(',').map(s => s.trim().toUpperCase()).filter(Boolean));

// affiliate wrapper is shared with the other connectors
let buildAffiliateUrl = (_n, u) => u;
try { ({ buildAffiliateUrl } = require('../lib/affiliate')); } catch { /* keep direct links */ }

const enc = s => encodeURIComponent(String(s || ''));

function parseMerchants() {
  const raw = String(ENV.JSONLD_MERCHANTS || '').trim();
  if (!raw) return [];
  const out = [];
  for (const line of raw.split(/[;\r\n]+/).map(s => s.trim()).filter(Boolean)) {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 6) continue;
    const [key, store, country, currency, network, searchTemplate, productLinkRe] = parts;
    const c = String(country || '').toUpperCase();
    if (!ACTIVE_MARKETS.has(c)) continue;
    if (!searchTemplate || !searchTemplate.includes('{q}')) continue;
    let linkRe = null;
    if (productLinkRe) { try { linkRe = new RegExp(productLinkRe, 'i'); } catch { /* ignore bad regex */ } }
    out.push({ key, store, country: c, currency: currency || 'USD', network: (network || 'direct').toLowerCase(), searchTemplate, linkRe });
  }
  return out;
}

const MERCHANTS = parseMerchants();
const isConfigured = () => MERCHANTS.length > 0;

// Same query heuristic the amazon/admitad connectors use: drop the spec tail so
// the merchant search returns the model, not a noisy long string.
function buildKeywordQuery(product) {
  let name = String(product.name || '').replace(/\s+/g, ' ').trim();
  const cut = name.search(/\s(?:\d+(?:[.,]\d+)?\s*(?:cm|mm|inch|gb|tb|ghz|mhz|mah|wh|w)\b|\(\d|dual\s*sim|single\s*sim|android|windows|macos|chrome\s*os|wi-?fi|bluetooth|\d(?:g|G)\b|touchscreen)/i);
  if (cut > 10) name = name.slice(0, cut).trim();
  const brand = String(product.brand || '').trim();
  const brandFirst = brand.split(/\s+/)[0] || '';
  if (brandFirst && !name.toLowerCase().startsWith(brandFirst.toLowerCase())) name = `${brand} ${name}`.trim();
  return name.replace(/\s+/g, ' ').trim().slice(0, 120);
}

async function fetchViaProxy(url, { timeoutMs = 30000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${PROXY}/?url=${enc(url)}`, { signal: ctrl.signal });
    if (!res.ok) return '';
    return await res.text();
  } catch { return ''; }
  finally { clearTimeout(t); }
}

// Pull every <script type="application/ld+json"> block and flatten @graph.
function jsonLdNodes(html) {
  const nodes = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let parsed;
    try { parsed = JSON.parse(m[1].trim()); } catch { continue; }
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      if (item && Array.isArray(item['@graph'])) nodes.push(...item['@graph']);
      else if (item) nodes.push(item);
    }
  }
  return nodes;
}

const typeIs = (node, t) => {
  const at = node && node['@type'];
  return Array.isArray(at) ? at.map(String).includes(t) : String(at || '') === t;
};

// Read the first usable Offer out of a Product node (offers can be an Offer, an
// AggregateOffer, or an array of them).
function offerFromProduct(node) {
  let offers = node && node.offers;
  if (!offers) return null;
  offers = Array.isArray(offers) ? offers : [offers];
  for (const o of offers) {
    if (!o) continue;
    const price = Number(String(o.price ?? o.lowPrice ?? '').replace(/[^0-9.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    const currency = String(o.priceCurrency || '').toUpperCase();
    const avail = String(o.availability || '').toLowerCase();
    if (Number.isFinite(price) && price > 0) {
      return {
        price: Math.round(price * 100) / 100,
        currency,
        inStock: !avail || avail.includes('instock') || avail.includes('preorder'),
        gtin: String(node.gtin13 || node.gtin || node.gtin12 || node.gtin8 || '').trim(),
        mpn: String(node.mpn || '').trim(),
      };
    }
  }
  return null;
}

function extractProductOffer(html) {
  for (const node of jsonLdNodes(html)) {
    if (typeIs(node, 'Product')) {
      const off = offerFromProduct(node);
      if (off) return off;
    }
  }
  return null;
}

// Find the first product-page href in a search results page.
function firstProductLink(html, merchant) {
  if (!merchant.linkRe) return '';
  const hrefs = html.match(/href=["']([^"']+)["']/gi) || [];
  for (const h of hrefs) {
    const url = h.replace(/^href=["']/i, '').replace(/["']$/, '');
    if (merchant.linkRe.test(url)) {
      try { return new URL(url, merchant.base).toString(); } catch { return url.startsWith('http') ? url : ''; }
    }
  }
  return '';
}

async function offerForMerchant(product, kw, merchant) {
  const searchUrl = merchant.searchTemplate.replace('{q}', enc(kw));
  try { merchant.base = new URL(searchUrl).origin; } catch { /* leave undefined */ }
  const searchHtml = await fetchViaProxy(searchUrl);
  if (!searchHtml) return null;

  // 1) some merchants embed Product JSON-LD straight on the search/results page.
  let pageUrl = searchUrl;
  let off = extractProductOffer(searchHtml);

  // 2) otherwise follow the first product link and read its JSON-LD.
  if (!off && merchant.linkRe) {
    const link = firstProductLink(searchHtml, merchant);
    if (link) {
      const detailHtml = await fetchViaProxy(link);
      off = extractProductOffer(detailHtml);
      pageUrl = link;
    }
  }
  if (!off) return null;

  // gtin agreement raises confidence; otherwise it's a top-result guess.
  const wantGtin = String(product.gtin || '').trim();
  const matchConfidence = wantGtin && off.gtin && wantGtin === off.gtin ? 0.95 : (merchant.linkRe ? 0.6 : 0.5);

  return {
    gtin: wantGtin,
    mpn: product.mpn || '',
    brand: product.brand || '',
    store: merchant.store,
    network: merchant.network,
    country: merchant.country,
    price: off.price,
    priceUnknown: !(off.price > 0),
    currency: off.currency || merchant.currency,
    url: pageUrl,
    affiliateUrl: buildAffiliateUrl(merchant.network, pageUrl, { country: merchant.country }),
    condition: 'new',
    inStock: off.inStock,
    availability: off.inStock ? 'in_stock' : 'out_of_stock',
    source: 'jsonld-scrape',
    matchConfidence,
    lastCheckedAt: new Date().toISOString(),
  };
}

async function searchOffers(product) {
  if (!MERCHANTS.length) return [];
  const kw = buildKeywordQuery(product);
  if (!kw) return [];
  const out = [];
  for (const merchant of MERCHANTS) {
    try {
      const offer = await offerForMerchant(product, kw, merchant);
      if (offer) out.push(offer);
    } catch { /* one merchant failing must not abort the rest */ }
  }
  return out;
}

async function getRateLimit() { return null; }

module.exports = {
  id: 'jsonld',
  searchOffers,
  isConfigured,
  getRateLimit,
  CALLS_PER_PRODUCT: 0,
  MERCHANTS,
};
