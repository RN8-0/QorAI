/**
 * Qor AI — Epey → TR price connector (Amazon affiliate + mağaza vitrini)
 *
 * The TR price source that needs NO affiliate-network approval and NO
 * scraper-proxy: every Epey-sourced product carries its epey.com page in
 * `sourceUrl`, Epey only gates by User-Agent/TLS stack (curl with a desktop
 * UA gets a plain 200), and each store row on the page embeds the DIRECT
 * store product URL (URL-encoded, in `data-link`) plus the price in kuruş
 * (`urun_fiyat_sort`) and the shipping-included total in TL (`kargodahil`).
 *
 * Two kinds of offers per product page:
 *
 *  1. Amazon.com.tr (network `epey_amazon`) — the user's single TR affiliate
 *     program. Cheapest NEW-condition Amazon row, with our Associates tag:
 *       url          — direct https://www.amazon.com.tr/dp/<ASIN> (+ m= pin)
 *       affiliateUrl — same link with ?tag=
 *  2. En ucuz 3 mağaza (network `epey_store`) — Hepsiburada/Trendyol/N11…
 *     rows are written WITHOUT any url (display-only): the site shows only
 *     the store logo + price, never a link (no affiliate there). They are
 *     excluded from the product rollup (lowestPrice / prices{} / buy links)
 *     by scripts/lib/offers.js, so cards/blog/app pricing stays Amazon-based.
 *
 * Outlet/Yenilenmiş/2.el rows are skipped ENTIRELY — they used to be able to
 * win the "cheapest Amazon row" pick and send the affiliate click to a
 * refurbished listing priced far under the product's real price.
 *
 *   expiresAt — +50 h, so a nightly cron keeps the price visible all day and
 *   a single missed night (PC off) doesn't wipe the rows.
 *
 * Config (optional, migration/.env or process env):
 *   AMAZON_TR_TAG=qorai-21        Associates tag for amazon.com.tr
 *   EPEY_FETCH_GAP_MS=1100        global min gap between Epey fetches
 *   EPEY_AMAZON_ENABLED=0         kill switch
 *   EPEY_STORE_ROWS=3             how many cheapest store rows to keep (0=off)
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
const STORE_ROWS = Math.max(0, Math.min(6, Number(ENV.EPEY_STORE_ROWS ?? 3)));
// 72 h. Neden 50 değil (2026-07-26 ölçümü): kart fiyatını gösteren kapı
// `bestOfferExpiresAt` (web/src/lib/format.js rollupPriceIsFresh). Fiyatlı ürün
// ~9.900, gecelik tazeleme kotası 4000-6000 → her ürüne ~2 günde bir dokunulur.
// 50 saatlik ömür bu turla nefes nefese olduğu için sürekli "damgası dolmuş"
// bir kuyruk birikiyor ve o ürünler kartlarda fiyatsız görünüyordu. 72 saat,
// tur süresinin üstünde kalarak boşluğu kapatır; Epey fiyatları bu ölçekte
// gün içinde nadiren değişir, ürün sayfası zaten canlı teklifleri gösterir.
// 2026-08-07 — TTL, ROTASYON SÜRESİNDEN UZUN OLMAK ZORUNDA.
// Fiyatlı havuz 29.880 ürün, gecelik pass1 kotası 9.000 → havuz ~3,3 gecede bir
// tur atıyor. TTL 72 s (3 gün) bu turdan KISA olduğu için ürünler sıraları
// gelmeden bayatlıyor ve `rollupPriceIsFresh` kapısı kartta fiyatı gizliyordu.
// 6 gün = 3,3 günlük tur + kaçan bir gece payı. Fiyatın TİPİK yaşı yine ~1-3
// gün; 6 gün yalnız üst sınır.
const EXPIRES_MS = 144 * 60 * 60 * 1000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Epey'in listelediği mağazaların görünen adları. Listede olmayan bir domain
// gelirse addan otomatik türetilir (kök kelime baş harfi büyük) — yeni mağaza
// için kod değişikliği gerekmez.
const STORE_NAMES = {
  'hepsiburada.com': 'Hepsiburada',
  'trendyol.com': 'Trendyol',
  'n11.com': 'n11',
  'amazon.com.tr': 'Amazon.com.tr',
  'pazarama.com': 'Pazarama',
  'pttavm.com': 'PttAVM',
  'idefix.com': 'Idefix',
  'ciceksepeti.com': 'ÇiçekSepeti',
  'teknosa.com': 'Teknosa',
  'mediamarkt.com.tr': 'MediaMarkt',
  'vatanbilgisayar.com': 'Vatan Bilgisayar',
  'turkcell.com.tr': 'Turkcell Pasaj',
  'a101.com.tr': 'A101',
  'beymen.com': 'Beymen',
  'beko.com.tr': 'Beko',
  'arcelik.com.tr': 'Arçelik',
  'incehesap.com': 'İncehesap',
  'itopya.com': 'İtopya',
  'sinerji.gen.tr': 'Sinerji',
  'gamegaraj.com': 'Game Garaj',
  'samsung.com': 'Samsung',
  'apple.com': 'Apple',
};
function storeNameFor(host) {
  const h = String(host || '').replace(/^www\./i, '').toLowerCase();
  if (STORE_NAMES[h]) return STORE_NAMES[h];
  const root = h.split('.')[0] || h;
  return root ? root.charAt(0).toUpperCase() + root.slice(1) : 'Mağaza';
}

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
//
// UYARLANABILIR HIZ (2026-07-27): saatler süren koşularda Epey bizi kısmaya
// başlıyor — 2000 ürünlük turda 112 istek `status 0` (curl bağlantıyı hiç
// tamamlayamadı) ile düştü ve hız 0,8/s → 0,4/s'ye indi. Ardışık geçici
// hatalarda bekleme süresini kademeli artırıp başarıda geri indiriyoruz;
// böylece kısıtlamaya çarpınca yavaşlayıp kendimizi toparlıyoruz.
let fetchChain = Promise.resolve();
let lastFetchAt = 0;
let extraGapMs = 0;          // uyarlanabilir ek bekleme
const EXTRA_GAP_MAX = 6000;
function noteFetchOutcome(ok) {
  if (ok) extraGapMs = Math.max(0, Math.floor(extraGapMs * 0.6) - 100);
  else extraGapMs = Math.min(EXTRA_GAP_MAX, extraGapMs ? extraGapMs * 2 : 800);
}
function politeFetch(url) {
  const run = async () => {
    const wait = lastFetchAt + GAP_MS + extraGapMs - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait + Math.floor(Math.random() * 250)));
    lastFetchAt = Date.now();
    return curlGet(url);
  };
  const p = fetchChain.then(run, run);
  // Keep the chain alive even when a fetch rejects (timeouts, 5xx…).
  fetchChain = p.catch(() => {});
  return p;
}
// Geçici hatalarda (bağlantı düşmesi, 429, 5xx) ürünü hemen yakmadan yeniden
// dene. Kalıcı durumlar (200/404/410) ilk turda döner.
const TRANSIENT = new Set([0, 408, 425, 429, 500, 502, 503, 504]);
async function fetchWithRetry(url, tries = 3) {
  let last = { status: 0, text: '' };
  for (let i = 0; i < tries; i++) {
    try {
      const res = await politeFetch(url);
      last = res;
      if (!TRANSIENT.has(res.status)) { noteFetchOutcome(true); return res; }
      noteFetchOutcome(false);
    } catch (e) {
      noteFetchOutcome(false);
      last = { status: 0, text: '', err: e };
    }
    if (i < tries - 1) await new Promise(r => setTimeout(r, 1500 * (i + 1) + Math.floor(Math.random() * 700)));
  }
  return last;
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

// Parse EVERY store anchor on an Epey product page.
// Row shape (see any epey product page): <a class="git c…" data-link="<encoded
// store URL>" …> <span class="site_logo"><img src="…/site/idefix-com.png"
// alt="…"></span> … <strong class="outlet">Outlet/2.El Fiyatı</strong>? …
// <span class="urun_fiyat_sort" …>8698400</span> …
// <span class="hide kargodahil">86994.05</span></a>
function parseRows(html) {
  const rows = [];
  const re = /<a[^>]*class="git[^"]*"[^>]*data-link="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let decoded = '';
    try { decoded = decodeURIComponent(m[1]); } catch { continue; }
    let host = '';
    try { host = (new URL(decoded).hostname || '').replace(/^www\./i, '').toLowerCase(); } catch { continue; }
    if (!host) continue;
    const block = m[2];
    // Outlet / Yenilenmiş / 2. el satırları HİÇ alma — ne Amazon seçimi ne
    // mağaza vitrini ikinci el fiyat göstermeli.
    if (/class="outlet"/i.test(block) || /Yenilenmi|2\.\s*El|İkinci\s*El/i.test(block)) continue;
    const sortKurus = Number((block.match(/urun_fiyat_sort[^>]*>\s*(\d+)\s*</i) || [])[1] || 0);
    if (!(sortKurus > 0)) continue;
    const price = Math.round(sortKurus) / 100; // kuruş → TL
    const withShipTl = Number((block.match(/class="hide kargodahil"[^>]*>\s*(\d+(?:\.\d+)?)\s*</i) || [])[1] || 0);
    // kargodahil is a TL amount; trust it only when it's plausibly
    // "price + a shipping fee", otherwise fall back to the bare price.
    const totalPrice = (withShipTl >= price && withShipTl < price * 1.5) ? Math.round(withShipTl * 100) / 100 : price;
    rows.push({ host, decoded, price, totalPrice });
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
  // sync_offers cleans up stale rows per network before re-writing — this
  // connector owns BOTH networks.
  networks: ['epey_amazon', 'epey_store'],

  isConfigured() {
    return ENV.EPEY_AMAZON_ENABLED !== '0';
  },

  /**
   * product → offers: [cheapest Amazon.com.tr row (linked)] +
   * [top-N cheapest other stores (display-only, no url)].
   * [] when the page has no usable rows (the runner then clears our stale
   * offers for the product). Transient blocks (403/429/5xx/network) THROW so
   * existing offers survive.
   */
  async searchOffers(product) {
    const src = String(product.sourceUrl || '').trim();
    if (!src || !/epey\.com\//i.test(src)) return [];
    const res = await fetchWithRetry(src);
    if (res.status === 404 || res.status === 410) return []; // page gone → clear
    if (res.status !== 200) throw new Error(`epey ${res.status}`);
    const rows = parseRows(res.text);
    if (!rows.length) return [];
    const now = Date.now();
    const stamp = {
      condition: 'new',
      inStock: true,
      availability: 'in_stock',
      country: 'TR',
      currency: 'TRY',
      source: 'epey',
      lastCheckedAt: new Date(now).toISOString(),
      priceUpdatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + EXPIRES_MS).toISOString(),
    };
    const offers = [];

    // 1 — Amazon.com.tr: cheapest row with a resolvable /dp/ASIN link.
    const amazonRows = rows
      .map(r => ({ ...r, links: amazonUrlsFrom(r.decoded) }))
      .filter(r => r.links)
      .sort((a, b) => a.price - b.price);
    if (amazonRows.length) {
      const best = amazonRows[0];
      offers.push({
        ...stamp,
        productId: product.id,
        store: 'Amazon.com.tr',
        network: 'epey_amazon',
        price: best.price,
        shipping: Math.max(0, Math.round((best.totalPrice - best.price) * 100) / 100),
        totalPrice: best.totalPrice,
        priceText: formatTl(best.price),
        url: best.links.url,
        affiliateUrl: best.links.affiliateUrl,
        merchantProductId: best.links.asin,
        matchConfidence: 1, // the product's own Epey page — not a name search
      });
    }

    // 2 — mağaza vitrini: mağaza başına en ucuz satır, sonra en ucuz N mağaza.
    // url YAZILMAZ (affiliate yok → tıklanabilir olmamalı); merchantProductId
    // mağaza domainini taşır (dedupe anahtarı + sitede favicon kaynağı).
    if (STORE_ROWS > 0) {
      const cheapestByStore = new Map();
      for (const r of rows) {
        if (/(^|\.)amazon\.com\.tr$/i.test(r.host)) continue; // Amazon'un kendi satırı var
        const prev = cheapestByStore.get(r.host);
        if (!prev || r.price < prev.price) cheapestByStore.set(r.host, r);
      }
      const top = [...cheapestByStore.values()].sort((a, b) => a.price - b.price).slice(0, STORE_ROWS);
      for (const r of top) {
        offers.push({
          ...stamp,
          productId: product.id,
          store: storeNameFor(r.host),
          network: 'epey_store',
          price: r.price,
          shipping: Math.max(0, Math.round((r.totalPrice - r.price) * 100) / 100),
          totalPrice: r.totalPrice,
          priceText: formatTl(r.price),
          url: '',
          affiliateUrl: '',
          merchantProductId: r.host,
          matchConfidence: 1,
        });
      }
    }
    return offers;
  },
};
