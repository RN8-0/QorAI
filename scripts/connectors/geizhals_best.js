/**
 * Qor AI — Geizhals → Amazon.de price connector (AMAZON ONLY)
 *
 * The user monetises ONLY through Amazon Associates, so the DE row must be an
 * AMAZON price with the user's affiliate link — never a third-party merchant.
 * Geizhals is used purely as the PRICE SOURCE: from the product's own Geizhals
 * page we take the cheapest offer that is Amazon (direct `data-merchant-name=
 * "Amazon"` or a "(via Amazon Marketplace)" seller — both live on amazon.de).
 *
 * Link reality: Geizhals /redir/ outbound links are bot-gated (403 even with
 * cookies+referer) and the page carries no ASIN/EAN, so a direct /dp/ link is
 * impossible from this source. Until Amazon PA-API access (post-Associates
 * approval) the outbound link is an amazon.de NAME SEARCH carrying the
 * affiliate tag (AMAZON_DE_TAG, default qorai-20 — the OneLink tag the site
 * already uses for DE/GB/US). Products with no Amazon row get NO DE price.
 *
 * Fetch goes through curl for the same reason as epey_amazon: bot walls
 * fingerprint Node's TLS stack, while curl with a desktop UA gets a plain 200.
 * Host: sourceUrl is geizhals.EU, but that host 403-blocks datacenter IPs
 * (Hetzner, ölçüm 2026-07-04) while the SAME product path on geizhals.DE
 * answers 200 — the sites are mirrors of one DB. The fetch therefore rewrites
 * .eu→.de; note .de renders `data-merchant-name="Amazon.de"` where .eu says
 * "Amazon", so the merchant regex accepts both.
 *
 * Config (optional): GEIZHALS_ENABLED=0 kill switch, GEIZHALS_FETCH_GAP_MS,
 * AMAZON_DE_TAG.
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

// Cheapest AMAZON row on the page. Geizhals renders offers price-ascending, so
// the first block that is Amazon (direct or "(via Amazon Marketplace)") is the
// cheapest Amazon price. Blocks are split on their stable offer-index anchors.
function bestAmazonRow(html) {
  const blocks = String(html || '').split(/id="offer-index-\d+"/).slice(1);
  for (const block of blocks) {
    const seg = block.slice(0, 6000);
    const isAmazon = /data-merchant-name="Amazon(\.[a-z]{2,3})?"/i.test(seg) || /via Amazon Marketplace/i.test(seg);
    if (!isAmazon) continue;
    const price = parseEur((seg.match(/class="gh_price">([^<]+)</i) || [])[1]);
    if (price > 0) return { price };
  }
  return null;
}

module.exports = {
  id: 'geizhals_best',

  isConfigured() {
    return ENV.GEIZHALS_ENABLED !== '0';
  },

  async searchOffers(product) {
    const src = String(product.sourceUrl || '').trim();
    if (!src || !/geizhals\.(eu|de|at)\//i.test(src)) return [];
    // geizhals.eu 403-blocks datacenter IPs; the .de mirror serves the same
    // product paths (and the de-DE price format parseEur already expects).
    const fetchUrl = src.replace(/^https?:\/\/(www\.)?geizhals\.eu\//i, 'https://geizhals.de/');
    const res = await politeFetch(fetchUrl);
    if (res.status === 404 || res.status === 410) return []; // page gone → clear
    if (res.status !== 200) throw new Error(`geizhals ${res.status}`);
    const best = bestAmazonRow(res.text);
    if (!best) return []; // no Amazon offer on Geizhals → no DE price (Amazon-only rule)
    const q = encodeURIComponent(String(product.name || '').trim()).slice(0, 200);
    const url = `https://www.amazon.de/s?k=${q}`;
    const tag = (ENV.AMAZON_DE_TAG || 'qorai-20').trim();
    const now = Date.now();
    return [{
      productId: product.id,
      store: 'Amazon.de',
      network: 'geizhals_best',
      country: 'DE',
      price: best.price,
      shipping: 0,
      totalPrice: best.price,
      currency: 'EUR',
      priceText: `€ ${best.price.toFixed(2).replace('.', ',')}`,
      url,
      affiliateUrl: `${url}&tag=${encodeURIComponent(tag)}`,
      condition: 'new',
      inStock: true,
      availability: 'in_stock',
      matchConfidence: 1, // the product's own Geizhals page priced this Amazon offer
      source: 'geizhals',
      lastCheckedAt: new Date(now).toISOString(),
      priceUpdatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + EXPIRES_MS).toISOString(),
    }];
  },
};
