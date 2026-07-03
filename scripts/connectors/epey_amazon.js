/**
 * Qor AI — Epey → Amazon.com.tr price connector
 *
 * The TR price source that needs NO affiliate-network approval and NO
 * scraper-proxy: every Epey-sourced product carries its epey.com page in
 * `sourceUrl`, Epey only gates by User-Agent (a desktop browser UA gets a
 * plain 200), and each store row on the page embeds the DIRECT store product
 * URL (URL-encoded, in `data-link`) plus the price in kuruş
 * (`urun_fiyat_sort`) and the shipping-included total in TL (`kargodahil`).
 *
 * We keep ONLY the Amazon.com.tr rows (the user's single TR affiliate
 * program), pick the cheapest, and write one offer:
 *   url          — direct https://www.amazon.com.tr/dp/<ASIN> (+ seller pin m=)
 *   affiliateUrl — same link with our Associates tag (fixes the old
 *                  search-page links: clicks now land on the product itself)
 *   expiresAt    — +26 h, so a nightly cron keeps the price visible all day
 *                  (the TR country TTL of 45 min is meant for live scrapes)
 *
 * Config (optional, migration/.env or process env):
 *   AMAZON_TR_TAG=qorai-21        Associates tag for amazon.com.tr
 *   EPEY_FETCH_GAP_MS=1100        global min gap between Epey fetches
 *   EPEY_AMAZON_ENABLED=0         kill switch
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function loadEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'migration', '.env'), 'utf8');
    return Object.fromEntries(raw.split(/\r?\n/)
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  } catch { return {}; }
}
const ENV = { ...loadEnv(), ...process.env };

const TAG = ENV.AMAZON_TR_TAG || 'qorai-21';
const GAP_MS = Math.max(400, Number(ENV.EPEY_FETCH_GAP_MS || 1100));
// 50 h: gece görevi bir gün atlarsa (PC kapalı) fiyatlar ertesi güne kadar
// kaybolmasın; StartWhenAvailable telafisi gelene dek fiyat görünür kalır.
const EXPIRES_MS = 50 * 60 * 60 * 1000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Epey's CDN fingerprints the TLS/HTTP stack: Node's fetch (undici) gets a 403
// even with full Chrome headers, while curl with the same UA gets a 200. So we
// shell out to curl — present on Windows (System32) and on the Linux host that
// runs the nightly cron. `-w` appends the status code on a final line.
function curlGet(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', [
      '-sS', '--compressed', '--location', '--max-time', '25',
      '-A', UA,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: tr-TR,tr;q=0.9,en;q=0.7',
      '-w', '\n__HTTP_STATUS__:%{http_code}',
      url,
    ], { maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout = '') => {
      const m = String(stdout).match(/\n__HTTP_STATUS__:(\d{3})\s*$/);
      if (m) {
        resolve({ status: Number(m[1]), text: String(stdout).slice(0, m.index) });
      } else {
        reject(err || new Error('curl: no status marker'));
      }
    });
  });
}

// Module-level pacing: one Epey fetch per GAP_MS across ALL workers, so the
// runner's concurrency only parallelises PocketBase writes, never the scrape.
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
  // Keep the chain alive even when a fetch rejects (timeouts, 5xx…).
  fetchChain = p.catch(() => {});
  return p;
}

function amazonUrlsFrom(decodedLink) {
  let u;
  try { u = new URL(decodedLink); } catch { return null; }
  if (!/(^|\.)amazon\.com\.tr$/i.test(u.hostname)) return null;
  const asin = (u.pathname.match(/\/dp\/([A-Z0-9]{10})/i) || [])[1] || '';
  if (!asin) return null;
  const direct = new URL(`https://www.amazon.com.tr/dp/${asin.toUpperCase()}`);
  const seller = u.searchParams.get('m');
  if (seller) direct.searchParams.set('m', seller); // pin the exact offer Epey priced
  const affiliate = new URL(direct.href);
  affiliate.searchParams.set('tag', TAG);
  return { asin: asin.toUpperCase(), url: direct.href, affiliateUrl: affiliate.href };
}

// Parse every store anchor on an Epey product page and return the Amazon rows.
// Row shape (see any epey product page): <a class="git c…" data-link="<encoded
// store URL>" …> … <span class="urun_fiyat_sort" …>8698400</span> …
// <span class="hide kargodahil">86994</span></a>
function amazonRows(html) {
  const rows = [];
  const re = /<a[^>]*class="git[^"]*"[^>]*data-link="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let decoded = '';
    try { decoded = decodeURIComponent(m[1]); } catch { continue; }
    const links = amazonUrlsFrom(decoded);
    if (!links) continue;
    const block = m[2];
    const sortKurus = Number((block.match(/urun_fiyat_sort[^>]*>\s*(\d+)\s*</i) || [])[1] || 0);
    if (!(sortKurus > 0)) continue;
    const price = Math.round(sortKurus) / 100; // kuruş → TL
    const withShipTl = Number((block.match(/class="hide kargodahil"[^>]*>\s*(\d+)\s*</i) || [])[1] || 0);
    // kargodahil is a rounded TL integer; trust it only when it's plausibly
    // "price + a shipping fee", otherwise fall back to the bare price.
    const totalPrice = (withShipTl >= price && withShipTl < price * 1.5) ? withShipTl : price;
    rows.push({ ...links, price, totalPrice });
  }
  return rows;
}

function formatTl(value) {
  try {
    return `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} TL`;
  } catch { return `${value} TL`; }
}

module.exports = {
  id: 'epey_amazon',

  isConfigured() {
    return ENV.EPEY_AMAZON_ENABLED !== '0';
  },

  /**
   * product → [offer] (cheapest Amazon.com.tr row) or [] when the page has no
   * Amazon listing (the runner then clears our stale offers for the product).
   * Transient blocks (403/429/5xx/network) THROW so existing offers survive.
   */
  async searchOffers(product) {
    const src = String(product.sourceUrl || '').trim();
    if (!src || !/epey\.com\//i.test(src)) return [];
    const res = await politeFetch(src);
    if (res.status === 404 || res.status === 410) return []; // page gone → clear
    if (res.status !== 200) throw new Error(`epey ${res.status}`);
    const html = res.text;
    const rows = amazonRows(html);
    if (!rows.length) return [];
    rows.sort((a, b) => a.price - b.price);
    const best = rows[0];
    const shipping = Math.max(0, Math.round((best.totalPrice - best.price) * 100) / 100);
    const now = Date.now();
    return [{
      productId: product.id,
      store: 'Amazon.com.tr',
      network: 'epey_amazon',
      country: 'TR',
      price: best.price,
      shipping,
      totalPrice: best.totalPrice,
      currency: 'TRY',
      priceText: formatTl(best.price),
      url: best.url,
      affiliateUrl: best.affiliateUrl,
      merchantProductId: best.asin,
      condition: 'new',
      inStock: true,
      availability: 'in_stock',
      matchConfidence: 1, // the product's own Epey page — not a name search
      source: 'epey',
      lastCheckedAt: new Date(now).toISOString(),
      priceUpdatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + EXPIRES_MS).toISOString(),
    }];
  },
};
