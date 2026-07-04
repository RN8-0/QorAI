/**
 * Qor AI — Newegg US price connector (search-page scrape)
 *
 * THE US price source that actually works without a proxy: amazon.com
 * captchas both Hetzner's whole ASN and (under load) the home IP, while
 * newegg.com serves fully server-rendered search results to a plain curl
 * from the home connection (probed 2026-07-04: 200, 36 cards, no captcha).
 * Newegg's catalog is tech-only — exactly this catalog's shape.
 *
 * Per product: one search request → first ORGANIC, NEW-condition card whose
 * title passes the strict token matcher (amazon_page.titleMatches — digit
 * tokens digit-bounded, TR category words stopworded) → card price.
 * No per-product /dp fetch needed: the card carries price + canonical URL.
 *
 * Guards, same philosophy as amazon_direct:
 *   - SKIP_FRESH: a product whose newegg row is <20h old is skipped without
 *     touching the network (nightly/manual reruns stay cheap).
 *   - Cross-market referee: the cheapest existing offer (any market, USD)
 *     bounds the accepted price to [1/3.5, 3.5]× — a wrong match must not
 *     publish a wild price.
 *   - Transient trouble (bot wall / 5xx / timeout) THROWS — the runner then
 *     leaves existing rows untouched. A definite no-match returns [] and
 *     clears the stale row (delisted).
 *
 * Config: NEWEGG_ENABLED=0 kill switch, NEWEGG_GAP_MS (default 4500),
 *         NEWEGG_SKIP_FRESH_H (default 20).
 * No affiliate program wired yet — url === affiliateUrl (user monetises
 * Amazon today; Newegg/CJ can be added as a tag format later).
 */
'use strict';

const { execFile } = require('child_process');
const { req } = require('../../migration/pb');
const { toUsd } = require('../lib/offers');
const { searchQuery, titleMatches } = require('../lib/amazon_page');

const ENV = process.env;
const GAP_MS = Math.max(1500, Number(ENV.NEWEGG_GAP_MS || 4500));
const SKIP_FRESH_MS = Math.max(1, Number(ENV.NEWEGG_SKIP_FRESH_H || 20)) * 60 * 60 * 1000;
const EXPIRES_MS = 50 * 60 * 60 * 1000; // survive one missed daily run
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const esc = v => String(v || '').replace(/"/g, '\\"');

function curlGet(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', [
      '-sS', '--compressed', '--location', '--max-time', '30',
      '-A', UA,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '-w', '\n__HTTP_STATUS__:%{http_code}',
      url,
    ], { maxBuffer: 24 * 1024 * 1024, windowsHide: true }, (err, stdout = '') => {
      const m = String(stdout).match(/\n__HTTP_STATUS__:(\d{3})\s*$/);
      if (m) resolve({ status: Number(m[1]), text: String(stdout).slice(0, m.index) });
      else reject(err || new Error('curl: no status marker'));
    });
  });
}

let fetchChain = Promise.resolve();
let lastFetchAt = 0;
function politeFetch(url) {
  const run = async () => {
    const wait = lastFetchAt + GAP_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait + Math.floor(Math.random() * 700)));
    lastFetchAt = Date.now();
    return curlGet(url);
  };
  const p = fetchChain.then(run, run);
  fetchChain = p.catch(() => {});
  return p;
}

// Consecutive transient failures trip a run-level breaker so a walled night
// fails fast instead of hammering; one Newegg host only, so no per-market map.
const MAX_STRIKES = 5;
let strikes = 0;
let breakerAt = 0;
const BREAKER_COOLDOWN_MS = Math.max(5, Number(ENV.NEWEGG_BREAKER_COOLDOWN_MIN || 30)) * 60 * 1000;

function decodeEntities(s) {
  return String(s).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

/** "$<strong>143</strong><sup>.00</sup>" inside a price-current block → 143.00 */
function parseCardPrice(block) {
  const m = block.match(/class="price-current"[^>]*>[\s\S]{0,200}?\$<strong>([\d,]+)<\/strong>(?:<sup>\.?(\d{1,2})<\/sup>)?/);
  if (!m) return 0;
  const whole = Number(m[1].replace(/,/g, ''));
  const cents = m[2] ? Number(`0.${m[2]}`) : 0;
  const v = whole + cents;
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
}

// Variant markers: a matching title carrying one of these words when the
// PRODUCT name doesn't is probably the bigger sibling ("G502 X" query, first
// card "G502 X PLUS Wireless" $143 vs the plain wired $62 — live case).
// Tokens shared with the product name don't count against a card.
const VARIANT_WORDS = ['plus', 'pro', 'max', 'ultra', 'mini', 'lite', 'wireless', 'lightspeed', 'bluetooth', 'superlight'];

/** Best organic, NEW-condition, token-matching card: fewest variant words the
 *  product name doesn't have, then the shortest title (closest model). */
function bestCard(html, productName) {
  const nameFold = ` ${String(productName).toLowerCase()} `;
  const candidates = [];
  const cells = String(html || '').split(/class="item-cell"/).slice(1);
  for (const cell of cells) {
    const block = cell.slice(0, 9000);
    // Sponsored placements can be a rival product — organic results only.
    if (/is-sponsored|txt-ads|item-sponsored/i.test(block.slice(0, 2500))) continue;
    // Attribute order varies (href before class on live pages) — anchor the
    // match on the class via lookahead, capture href wherever it sits.
    const a = block.match(/<a\b(?=[^>]*class="item-title")[^>]*href="(https:\/\/www\.newegg\.com\/[^"]+)"[^>]*>([\s\S]{0,600}?)<\/a>/);
    if (!a) continue;
    const url = a[1].split('?')[0];
    const title = decodeEntities(a[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!title) continue;
    // Open-box / refurb cards carry used prices — new condition only.
    if (/open box|refurbished|renewed|\bused\b|for parts/i.test(title)) continue;
    if (!titleMatches(productName, title)) continue;
    const price = parseCardPrice(block);
    if (!(price > 0)) continue;
    const t = ` ${title.toLowerCase()} `;
    const extra = VARIANT_WORDS.filter(w => t.includes(` ${w} `) && !nameFold.includes(` ${w} `)).length;
    candidates.push({ url, title, price, extra });
    if (candidates.length >= 10) break;
  }
  if (!candidates.length) return null;
  candidates.sort((x, y) => (x.extra - y.extra) || (x.title.length - y.title.length));
  return candidates[0];
}

/** Own-row freshness + cheapest existing price (USD) as the sanity referee. */
async function loadContext(productId) {
  const filter = `productId="${esc(productId)}" && price>0`;
  const r = await req('GET',
    `/api/collections/offers/records?perPage=50&fields=network,country,price,currency,lastCheckedAt&filter=${encodeURIComponent(filter)}`);
  if (r.status !== 200) throw new Error(`offer context ${r.status}`);
  const items = r.body.items || [];
  let refUsd = 0;
  let ownCheckedAt = 0;
  for (const o of items) {
    if (o.network === 'newegg') {
      const t = Date.parse(o.lastCheckedAt || '');
      if (Number.isFinite(t)) ownCheckedAt = Math.max(ownCheckedAt, t);
    }
    const usd = toUsd(o.price, o.currency);
    if (usd > 0 && (refUsd === 0 || usd < refUsd)) refUsd = usd;
  }
  return { refUsd, ownCheckedAt };
}

module.exports = {
  id: 'newegg',

  isConfigured() {
    return ENV.NEWEGG_ENABLED !== '0';
  },

  async searchOffers(product) {
    if (breakerAt && Date.now() - breakerAt < BREAKER_COOLDOWN_MS) {
      throw new Error('newegg breaker open');
    }
    if (breakerAt) { breakerAt = 0; strikes = MAX_STRIKES - 1; } // half-open probe
    const name = String(product.name || '').trim();
    if (name.length < 6) return [];

    const { refUsd, ownCheckedAt } = await loadContext(product.id);
    if (Date.now() - ownCheckedAt < SKIP_FRESH_MS) return null; // fresh — leave rows untouched, no network

    // Newegg's search chokes on parenthesised part codes ("(RZ01-05250100-…)")
    // that Amazon tolerates — drop non-capacity parens from the QUERY (the
    // token matcher never used them anyway).
    const q = encodeURIComponent(
      searchQuery(name).replace(/\((?![^)]*(?:gb|tb))[^)]*\)/gi, ' ').replace(/\s+/g, ' ').trim()
    ).slice(0, 200);
    let res;
    try {
      res = await politeFetch(`https://www.newegg.com/p/pl?d=${q}`);
    } catch (e) {
      strikes++;
      if (strikes >= MAX_STRIKES && !breakerAt) { breakerAt = Date.now(); console.log(`  ! newegg: breaker open (${e.message})`); }
      throw e; // transient — runner keeps existing rows
    }
    if (res.status !== 200 || /Are you a human|captcha/i.test(res.text.slice(0, 20000))) {
      strikes++;
      if (strikes >= MAX_STRIKES && !breakerAt) { breakerAt = Date.now(); console.log(`  ! newegg: breaker open (wall/${res.status})`); }
      throw new Error(`newegg wall ${res.status}`);
    }
    strikes = 0;

    const hit = bestCard(res.text, name);
    if (!hit) return []; // definite no-match → stale newegg row clears

    // Referee: a matched card wildly off every known price is a wrong match.
    if (refUsd > 0 && (hit.price > refUsd * 3.5 || hit.price < refUsd / 3.5)) {
      console.log(`  ! newegg sanity: ${hit.price} USD vs ref ~$${refUsd.toFixed(0)} — skipped (${hit.title.slice(0, 50)})`);
      return [];
    }

    const now = Date.now();
    return [{
      productId: product.id,
      store: 'Newegg',
      network: 'newegg',
      country: 'US',
      price: hit.price,
      shipping: 0,
      totalPrice: hit.price,
      currency: 'USD',
      priceText: `$${hit.price.toFixed(2)}`,
      url: hit.url,
      affiliateUrl: hit.url,
      condition: 'new',
      inStock: true,
      availability: 'in_stock',
      matchConfidence: 0.85, // strict-token search match (no shared ASIN to verify)
      source: 'newegg',
      lastCheckedAt: new Date(now).toISOString(),
      priceUpdatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + EXPIRES_MS).toISOString(),
    }];
  },
};
