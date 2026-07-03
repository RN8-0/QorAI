/**
 * Qor AI — Geizhals "best offer" DE price connector
 *
 * Geizhals-sourced products (source='geizhals.eu', ~421) get their EUR price
 * from their own Geizhals page: the offer list is cheapest-first, so we take
 * offer-index-0 (price in `gh_price`, merchant in `data-merchant-name`, link =
 * the geizhals /redir/ URL the site's own visitors click). ANY merchant counts
 * — the user's Amazon-only rule applies to TR; for DE the goal is a real price
 * on the page. No affiliate wrap (affiliateUrl empty): monetisation for DE
 * comes later (Amazon PA-API / Awin once approved); showing the price is the
 * point today.
 *
 * Fetch goes through curl for the same reason as epey_amazon: bot walls
 * fingerprint Node's TLS stack, while curl with a desktop UA gets a plain 200.
 * Datacenter IPs are blocked by these sites → runs on the user's PC only.
 *
 * Config (optional): GEIZHALS_ENABLED=0 kill switch, GEIZHALS_FETCH_GAP_MS.
 */
'use strict';

const { execFile } = require('child_process');

const ENV = process.env;
const GAP_MS = Math.max(400, Number(ENV.GEIZHALS_FETCH_GAP_MS || 1100));
const EXPIRES_MS = 50 * 60 * 60 * 1000; // survive a missed nightly run
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function curlGet(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', [
      '-sS', '--compressed', '--location', '--max-time', '25',
      '-A', UA,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: de-DE,de;q=0.9,en;q=0.7',
      '-w', '\n__HTTP_STATUS__:%{http_code}',
      url,
    ], { maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout = '') => {
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
    if (wait > 0) await new Promise(r => setTimeout(r, wait + Math.floor(Math.random() * 250)));
    lastFetchAt = Date.now();
    return curlGet(url);
  };
  const p = fetchChain.then(run, run);
  fetchChain = p.catch(() => {});
  return p;
}

// "€ 1.274,88" (de-DE) → 1274.88
function parseEur(text) {
  const m = String(text || '').replace(/\s/g, '').match(/€([\d.]+(?:,\d{1,2})?)/);
  if (!m) return 0;
  return Number(m[1].replace(/\./g, '').replace(',', '.')) || 0;
}

// Cheapest offer row: Geizhals renders the list price-ascending, so
// offer-index-0 is the best. Row: gh_price → redir href → data-merchant-name.
function bestOfferRow(html) {
  const m = html.match(/id="offer-index-0"[\s\S]{0,4000}?class="gh_price">([^<]+)<[\s\S]{0,4000}?href="(https:\/\/geizhals\.eu\/redir\/[^"]+)"[^>]*data-merchant-name="([^"]+)"/i);
  if (!m) return null;
  const price = parseEur(m[1]);
  if (!(price > 0)) return null;
  return { price, url: m[2], merchant: m[3] };
}

module.exports = {
  id: 'geizhals_best',

  isConfigured() {
    return ENV.GEIZHALS_ENABLED !== '0';
  },

  async searchOffers(product) {
    const src = String(product.sourceUrl || '').trim();
    if (!src || !/geizhals\.(eu|de|at)\//i.test(src)) return [];
    const res = await politeFetch(src);
    if (res.status === 404 || res.status === 410) return []; // page gone → clear
    if (res.status !== 200) throw new Error(`geizhals ${res.status}`);
    const best = bestOfferRow(res.text);
    if (!best) return [];
    const now = Date.now();
    return [{
      productId: product.id,
      store: best.merchant,
      network: 'geizhals_best',
      country: 'DE',
      price: best.price,
      shipping: 0,
      totalPrice: best.price,
      currency: 'EUR',
      priceText: `€ ${best.price.toFixed(2).replace('.', ',')}`,
      url: best.url,
      affiliateUrl: '',
      condition: 'new',
      inStock: true,
      availability: 'in_stock',
      matchConfidence: 1, // the product's own Geizhals page
      source: 'geizhals',
      lastCheckedAt: new Date(now).toISOString(),
      priceUpdatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + EXPIRES_MS).toISOString(),
    }];
  },
};
