/**
 * Qor AI — Amazon product-page price core (all marketplaces, one parser)
 *
 * One engine for every Amazon storefront: a marketplace is a CONFIG ROW, not
 * a new scraper. Feasibility proven 2026-07-03 from this PC (residential IP):
 *   DE — session warmup + GLOW address-change (zip 10115) + i18n-prefs=EUR
 *        renders the real buy-box: `corePriceDisplay…` → 149,00 € (DT 770).
 *   GB — GLOW won't stick for TR IPs (page stays "Deliver to Turkey", no
 *        buy-box), but the twister dimension JSON still carries the page
 *        ASIN's own lowest new-offer price: `"SELECTED"… "3 options from
 *        £109.00"`. That JSON is signature #2.
 * The two signatures back each other up on every marketplace — if Amazon
 * redesigns one, the other still parses.
 *
 * Sessions live as curl cookie jars in scripts/.amazon-session/ (gitignored),
 * refreshed when older than JAR_MAX_AGE_H. Each marketplace HOST has its own
 * pace gate (AMAZON_DIRECT_GAP_MS, default 5000 ms + jitter, override per
 * market via AMAZON_DIRECT_GAP_MS_<CC>) — amazon.de / .co.uk / .com are
 * separate services, so pacing them independently triples throughput without
 * raising any single storefront's request rate.
 *
 * Failure contract (mirrors epey_amazon):
 *   resolved {ok:false, reason:'gone'|'no-price'}   definite "no offer here"
 *   thrown  Error (bot page, 5xx, timeout, wrong currency after retry)
 *           transient — callers must keep existing offers alive.
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

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const JAR_MAX_AGE_H = 20;
const JAR_DIR = path.join(__dirname, '..', '.amazon-session');
// Sessionless mode (AMAZON_DIRECT_NO_SESSION=1): skip warmup + GLOW + cookie
// jar entirely. On a datacenter IP (Hetzner) the homepage warmup answers 202
// and poisons the jar — every subsequent /dp/ fetch lands on the captcha —
// while the SAME /dp/ URL fetched bare returns the full product page.
// Sessionless fetches carry a static `i18n-prefs=<currency>` cookie header so
// the page renders in the marketplace currency instead of the visitor-geo one
// (amazon.com shows a TR visitor TRY export prices otherwise). No GLOW zip
// means the buy-box may hide, but the twister/olp signatures still price.
const NO_SESSION = ENV.AMAZON_DIRECT_NO_SESSION === '1';
// Per-market sessionless list: amazon.com captchas the session WARMUP itself
// even on a residential IP (verified 2026-07-04: fresh jar → bot page on
// every /dp/, the same URLs bare + static cookie → full page, twister gives
// the USD price) — so US defaults to sessionless everywhere. DE keeps its
// jar: GLOW zip 10115 renders the real buy-box.
const NO_SESSION_MARKETS = new Set(String(ENV.AMAZON_DIRECT_NO_SESSION_MARKETS ?? 'US')
  .split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
function sessionless(cc) { return NO_SESSION || NO_SESSION_MARKETS.has(cc); }

// Optional per-market egress proxy. Amazon blocks Hetzner's ENTIRE ASN — a
// fresh Ashburn (US) box got the same captcha wall as Falkenstein (measured
// 2026-07-04) — so amazon.com is unreachable from ANY Hetzner IP. When the
// user provisions a residential/mobile proxy, ONE env line turns US back on:
//   AMAZON_DIRECT_PROXY_URL=http://user:pass@host:port   (or socks5h://…)
//   AMAZON_DIRECT_PROXY_MARKETS=US                        (CSV, default US)
const PROXY_URL = String(ENV.AMAZON_DIRECT_PROXY_URL || '').trim();
const PROXY_MARKETS = new Set(String(ENV.AMAZON_DIRECT_PROXY_MARKETS ?? 'US')
  .split(',').map(s => s.trim().toUpperCase()).filter(Boolean));

// A marketplace is one row. To add US/FR/IT/ES later: add the row and put it
// in AMAZON_DIRECT_MARKETS — nothing else changes.
// zip must be a deliverable in-country address hint for GLOW; tag falls back
// AMAZON_TAG_<CC> → AMAZON_TAG. countryCode is what the offers schema stores.
const MARKETPLACES = {
  DE: { host: 'www.amazon.de',    currency: 'EUR', lang: 'de-DE,de;q=0.9,en;q=0.5', zip: '10115',    tagEnv: 'AMAZON_TAG_DE', store: 'Amazon.de' },
  GB: { host: 'www.amazon.co.uk', currency: 'GBP', lang: 'en-GB,en;q=0.9',          zip: 'E1 7AA',   tagEnv: 'AMAZON_TAG_UK', store: 'Amazon.co.uk' },
  US: { host: 'www.amazon.com',   currency: 'USD', lang: 'en-US,en;q=0.9',          zip: '10001',    tagEnv: 'AMAZON_TAG_US', store: 'Amazon.com' },
  TR: { host: 'www.amazon.com.tr', currency: 'TRY', lang: 'tr-TR,tr;q=0.9',         zip: '34000',    tagEnv: 'AMAZON_TR_TAG', store: 'Amazon.com.tr' },
};

function marketTag(cc) {
  const mk = MARKETPLACES[cc];
  return (mk && ENV[mk.tagEnv]) || ENV.AMAZON_TAG || '';
}

function jarPath(cc) { return path.join(JAR_DIR, `jar_${cc.toLowerCase()}.txt`); }

function curl(args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile('curl', args, { maxBuffer: 32 * 1024 * 1024, windowsHide: true, ...opts }, (err, stdout = '') => {
      const m = String(stdout).match(/\n__HTTP_STATUS__:(\d{3})\s*$/);
      if (m) resolve({ status: Number(m[1]), text: String(stdout).slice(0, m.index) });
      else reject(err || new Error('curl: no status marker'));
    });
  });
}

function baseArgs(cc) {
  const mk = MARKETPLACES[cc];
  const jar = jarPath(cc);
  return [
    '-sS', '--compressed', '--location', '--max-time', '35',
    '-A', UA,
    '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    '-H', `Accept-Language: ${mk.lang}`,
    ...(sessionless(cc) ? ['-H', `Cookie: i18n-prefs=${mk.currency}`] : ['-b', jar, '-c', jar]),
    ...(PROXY_URL && PROXY_MARKETS.has(cc) ? ['--proxy', PROXY_URL] : []),
    '-w', '\n__HTTP_STATUS__:%{http_code}',
  ];
}

// ---------------------------------------------------------------- sessions

/** Build/refresh the cookie-jar session for one marketplace:
 *  warmup GET (session cookies) → GLOW address-change POST (in-country zip)
 *  → force i18n-prefs=<currency> in the jar. Never throws on GLOW refusal —
 *  the twister-JSON signature still works without a stuck location. */
async function buildSession(cc) {
  const mk = MARKETPLACES[cc];
  fs.mkdirSync(JAR_DIR, { recursive: true });
  const jar = jarPath(cc);
  try { fs.unlinkSync(jar); } catch {}
  await curl([...baseArgs(cc), `https://${mk.host}/`, '-o', process.platform === 'win32' ? 'NUL' : '/dev/null']);
  await curl([
    ...baseArgs(cc),
    '-H', 'Content-Type: application/x-www-form-urlencoded',
    '-X', 'POST',
    '--data', `locationType=LOCATION_INPUT&zipCode=${encodeURIComponent(mk.zip)}&storeContext=generic&deviceType=web&pageType=Gateway&actionSource=glow`,
    `https://${mk.host}/portal-migration/hz/glow/address-change?actionSource=glow`,
    '-o', process.platform === 'win32' ? 'NUL' : '/dev/null',
  ]).catch(() => {});
  // Currency pin — the jar line wins over whatever the server picked (TRY).
  const domain = mk.host.replace(/^www\./, '.');
  fs.appendFileSync(jar, `${domain}\tTRUE\t/\tTRUE\t2082787200\ti18n-prefs\t${mk.currency}\n`);
}

async function ensureSession(cc) {
  if (sessionless(cc)) return; // bare fetches — no jar to build or refresh
  const jar = jarPath(cc);
  try {
    const age = Date.now() - fs.statSync(jar).mtimeMs;
    if (age < JAR_MAX_AGE_H * 3600 * 1000) return;
  } catch {}
  await buildSession(cc);
}

// ------------------------------------------------------------------ pacing

// One serial gate PER MARKETPLACE HOST: requests to the same storefront stay
// GAP_MS apart, but amazon.de / .co.uk / .com proceed in parallel — a product
// priced on three markets costs one gap, not three.
function gapMsFor(cc) {
  return Math.max(1500, Number(ENV[`AMAZON_DIRECT_GAP_MS_${cc}`] || ENV.AMAZON_DIRECT_GAP_MS || 5000));
}
const paceGates = {}; // cc → { chain, lastAt }
function politeCurl(cc, args) {
  const gate = paceGates[cc] || (paceGates[cc] = { chain: Promise.resolve(), lastAt: 0 });
  const run = async () => {
    const wait = gate.lastAt + gapMsFor(cc) - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait + Math.floor(Math.random() * 900)));
    gate.lastAt = Date.now();
    return curl(args);
  };
  const p = gate.chain.then(run, run);
  gate.chain = p.catch(() => {});
  return p;
}

// ----------------------------------------------------------------- parsing

function decodeEntities(s) {
  return String(s).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

/** "1.329,00 €" | "£109.00" | "TRY 808.12" | "3 options from £109.00"
 *  → { value, currency } | null.
 *  Free text may carry OTHER digits ("3 options from £109.00" must parse as
 *  109, not 3109) — when a currency-marked token exists, only it is read. */
function parseMoney(raw) {
  let text = decodeEntities(String(raw)).trim();
  const token = text.match(/(?:€|£|\$|₺|\bEUR\b|\bGBP\b|\bUSD\b|\bTRY\b)\s?[\d][\d.,]*|[\d][\d.,]*\s?(?:€|£|\$|₺|\bEUR\b|\bGBP\b|\bUSD\b|\bTRY\b)/);
  if (token) text = token[0];
  const currency = /€|\bEUR\b/.test(text) ? 'EUR' : /£|\bGBP\b/.test(text) ? 'GBP'
    : /\bTRY\b|₺/.test(text) ? 'TRY' : /\$|\bUSD\b/.test(text) ? 'USD' : '';
  let num = text.replace(/[^\d.,]/g, '');
  if (!num) return null;
  const lastDot = num.lastIndexOf('.');
  const lastComma = num.lastIndexOf(',');
  if (lastComma > lastDot) num = num.replace(/\./g, '').replace(',', '.');
  else num = num.replace(/,/g, '');
  const value = Number(num);
  return Number.isFinite(value) && value > 0 ? { value: Math.round(value * 100) / 100, currency } : null;
}

function isBotPage(html) {
  return /captcha|Robot Check|api-services-support@amazon/i.test(html.slice(0, 40000))
    && !/id="productTitle"/.test(html);
}

function availabilityText(html) {
  const i = html.indexOf('id="availability"');
  if (i < 0) return '';
  return decodeEntities(html.slice(i, i + 1200)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}

const UNAVAILABLE_RE = /derzeit nicht verf|currently unavailable|niet leverbaar|actuellement indisponible|non disponibile|no disponible/i;

/** Signature #1 — the desktop buy-box price regions. Only text INSIDE these
 *  regions is trusted, so related-product prices can never leak in. */
function priceFromBuyBox(html) {
  for (const id of ['corePriceDisplay_desktop_feature_div', 'corePrice_feature_div', 'apex_desktop']) {
    const i = html.indexOf(`id="${id}"`);
    if (i < 0) continue;
    const region = html.slice(i, i + 12000);
    const off = region.match(/class="a-offscreen">([^<]{1,40})</);
    if (off) { const p = parseMoney(off[1]); if (p) return { ...p, sig: 'buybox' }; }
    const whole = region.match(/a-price-whole">([\d.,]+)/);
    if (whole) {
      const frac = region.match(/a-price-fraction">(\d{1,2})/);
      const sym = region.match(/a-price-symbol">([^<]{1,6})</);
      const p = parseMoney(`${whole[1]}${frac ? ',' + frac[1] : ''} ${sym ? sym[1] : ''}`);
      if (p) return { ...p, sig: 'buybox' };
    }
  }
  return null;
}

/** Signature #2 — twister dimension JSON: the SELECTED variant's own lowest
 *  new-offer line ("3 options from £109.00"). Present even when the buy-box
 *  is suppressed for foreign-IP sessions. */
function priceFromTwisterOlp(html, asin) {
  const scopes = [];
  const selIdx = html.indexOf('"dimensionValueState":"SELECTED"');
  if (selIdx >= 0) scopes.push(html.slice(selIdx, selIdx + 4000));
  if (asin) {
    // Fallback scope: the block that names this exact ASIN as defaultAsin.
    const re = new RegExp(`"defaultAsin":"${asin}"[\\s\\S]{0,4000}`);
    const m = html.match(re);
    if (m) scopes.push(m[0]);
  }
  for (const scope of scopes) {
    const olp = scope.match(/"olpMessage":"([^"]{1,80})"[^}]{0,200}?"offerType":"newOffer"/)
      || scope.match(/"olpMessage":"([^"]{1,80}?(from|ab)[^"]{1,40})"/i);
    if (olp) { const p = parseMoney(olp[1]); if (p) return { ...p, sig: 'twister-olp' }; }
    const bare = scope.match(/"priceWithoutCurrencySymbol":"([\d.,]+)"/);
    if (bare) {
      const p = parseMoney(bare[1]);
      if (p) return { value: p.value, currency: '', sig: 'twister-olp-bare' };
    }
  }
  return null;
}

/** Signature #3 — classic "New & Used from" olp widget under the buy-box. */
function priceFromOlpDiv(html) {
  const i = html.indexOf('id="olp_feature_div"');
  if (i < 0) return null;
  const region = html.slice(i, i + 4000);
  const m = region.match(/(?:from|ab)\s*<[^>]*>\s*([^<]{1,30})</i)
    || region.match(/class="a-offscreen">([^<]{1,40})</);
  if (m) { const p = parseMoney(m[1]); if (p) return { ...p, sig: 'olp-div' }; }
  return null;
}

function extractPrice(html, asin, expectedCurrency) {
  const candidates = [priceFromBuyBox(html), priceFromTwisterOlp(html, asin), priceFromOlpDiv(html)]
    .filter(Boolean);
  if (!candidates.length) return null;
  // Prefer a candidate already in the marketplace currency, else first hit.
  const inCurrency = candidates.find(c => c.currency === expectedCurrency);
  if (inCurrency) return inCurrency;
  // Symbol-less twister value: trust it only when nothing contradicts it —
  // the i18n-prefs pin makes the page render in the marketplace currency.
  const bare = candidates.find(c => !c.currency);
  if (bare) return { ...bare, currency: expectedCurrency };
  return candidates[0];
}

// -------------------------------------------------------------------- main

/**
 * Fetch one ASIN's price on one marketplace.
 * Resolves { ok:true, price, currency, availability, title, sig }
 *       or { ok:false, reason:'gone'|'no-price', availability? }.
 * Throws on transient trouble (bot page, HTTP 5xx/403/429, wrong currency
 * twice in a row) — callers keep existing offers on throw.
 */
async function fetchAmazonPrice(cc, asin, { _retried } = {}) {
  const mk = MARKETPLACES[cc];
  if (!mk) throw new Error(`unknown marketplace ${cc}`);
  await ensureSession(cc);
  const res = await politeCurl(cc, [...baseArgs(cc), `https://${mk.host}/dp/${asin}`]);
  if (res.status === 404 || res.status === 410) return { ok: false, reason: 'gone' };
  if (res.status !== 200) throw new Error(`amazon ${cc} ${res.status}`);
  const html = res.text;
  if (isBotPage(html)) throw new Error(`amazon ${cc} bot page`);
  if (!/id="dp-container"|id="productTitle"/.test(html)) {
    // 200 without a product shell — treat like a soft 404 (deleted ASIN).
    return { ok: false, reason: 'gone' };
  }
  const title = decodeEntities((html.match(/id="productTitle"[^>]*>\s*([^<]{1,200})/) || [])[1] || '').trim();
  const availability = availabilityText(html);
  if (UNAVAILABLE_RE.test(availability)) return { ok: false, reason: 'no-price', availability };
  const price = extractPrice(html, asin, mk.currency);
  if (!price) return { ok: false, reason: 'no-price', availability };
  if (price.currency !== mk.currency) {
    // Session lost its currency pin (or GLOW state drifted) — rebuild once.
    // Sessionless markets have no jar to rebuild; a retry would repeat the
    // same static-cookie request, so fail straight to the transient contract.
    if (_retried || sessionless(cc)) throw new Error(`amazon ${cc} wrong currency ${price.currency}`);
    await buildSession(cc);
    return fetchAmazonPrice(cc, asin, { _retried: true });
  }
  return { ok: true, price: price.value, currency: price.currency, availability, title, sig: price.sig };
}

// -------------------------------------------------------- local ASIN search

// NFD strips combining diacritics (ü→u, ş→s, ğ→g) but Turkish dotless ı is
// its own letter and does NOT decompose — map it by hand or 'Kasası' never
// folds to 'kasasi'.
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

// Epey product names end in a TURKISH category tail ("… Robot Süpürge+Mop",
// "… Bilgisayar Kasası", "… Ekran Kartı") that never appears in EN/DE Amazon
// titles. As REQUIRED tokens those words made nearly every cross-market name
// search fail (only globally-shared TR ASINs ever priced on .com/.co.uk), and
// in the query they skew results. Folded forms (fold() strips diacritics);
// universal words (monitor, tablet, robot, laptop, fan, modem…) stay.
const TR_NAME_STOPWORDS = new Set([
  'supurge', 'mop', 'bilgisayar', 'kasasi', 'anakart', 'islemci', 'sogutucu',
  'sogutucusu', 'kulaklik', 'kulakligi', 'klavye', 'fare', 'oyun', 'kolu',
  'konsolu', 'yazici', 'tarayici', 'hoparlor', 'kamera', 'kamerasi', 'arac',
  'ici', 'akilli', 'saat', 'saati', 'bileklik', 'yuzuk', 'telefon', 'telefonu',
  'cep', 'sarj', 'cihazi', 'aleti', 'guc', 'kaynagi', 'ekran', 'karti',
  'bellek', 'okuyucu', 'kitap', 'gozlugu', 'gerceklik', 'sanal', 'donanim',
  'cuzdani', 'televizyon', 'projeksiyon', 'amfi', 'sistemi', 'oynatici',
  'medya', 'yonlendirici', 'soket', 'fani', 'kablosuz', 'kablolu',
  // 'flash': Epey "Flash Bellek" der ama Amazon basliklari "USB-Stick"/"USB
  // bellek"/"Flash Drive" arasinda gezer — zorunlu token olarak koca
  // flash_drives kategorisini eslesmez yapiyordu (marka+kapasite yeterli).
  'flash',
  'tasinabilir', 'dizustu', 'masaustu', 'aksesuari', 'aksesuar', 'yukseltici',
  'genisletici', 'kurutmali', 'temizleyici', 'suzgec', 'faresi', 'klavyesi',
  'yazicisi', 'hoparloru', 'konsol',
]);

/** Model-critical tokens: every token carrying a digit + words ≥4 chars (brand,
 *  series). ALL must appear in a result title, so "Galaxy S26 Ultra" can never
 *  match an S25 listing or a case/accessory. Turkish category words are
 *  dropped first — they cannot appear in a foreign-market title. Single bare
 *  digits stay: "Pad 4" vs "Pad 3" differ ONLY in that generation digit. */
function modelTokens(name) {
  // Parenthesised regional codes ("(SM-S948B)", "(2024)") rarely appear in
  // Amazon titles and would make the match impossible — drop them, but keep
  // capacity parens ("(1 TB)") since storage distinguishes real variants.
  const cleaned = fold(name).replace(/\((?![^)]*(?:gb|tb))[^)]*\)/g, ' ');
  return [...new Set(cleaned.replace(/[()/,+]/g, ' ').split(/\s+/)
    .filter(t => (/^\d+$/.test(t) ? t.length >= 1 : t.length >= 2 && (/\d/.test(t) || t.length >= 4))
      && !TR_NAME_STOPWORDS.has(t))
    .slice(0, 8))];
}

/** Substring match for model codes ("rs20", "wh-1000xm6" — dashes make exact
 *  word splits unreliable), but DIGIT-BOUNDED match for pure-number tokens:
 *  plain includes() let "512"/"3.4k" satisfy a required "12"/"4", which is how
 *  a OnePlus Pad 3 listing passed for the Pad 4 (live 2026-07-04). A number
 *  token must not touch another digit or a decimal point. */
function tokenInTitle(title, t) {
  if (!/^\d+$/.test(t)) return title.includes(t);
  return new RegExp(`(?<![\\d.])${t}(?![\\d.])`).test(title);
}

/** Does a fetched product-page title still look like OUR product? Used to
 *  re-validate STORED search-resolved ASINs on every price fetch: a wrong
 *  match written once (offers.merchantProductId) would otherwise refresh
 *  itself forever via direct /dp/ fetches and never face the search matcher
 *  again. Empty tokens/title verify as true — nothing to check against. */
function titleMatches(name, title) {
  if (!title) return true;
  const tokens = modelTokens(name);
  if (!tokens.length) return true;
  const t = fold(String(title));
  return tokens.every(tok => tokenInTitle(t, tok));
}

/** The search QUERY with the Turkish category tail removed ("Ezviz RS20 Pro
 *  Robot Süpürge+Mop" → "Ezviz RS20 Pro Robot") — original casing/diacritics
 *  kept for the surviving words; falls back to the full name if everything
 *  would be dropped. */
function searchQuery(name) {
  const words = String(name || '').split(/\s+/).filter(w => {
    const parts = fold(w).split(/[()/,+]/).filter(Boolean);
    return !parts.length || !parts.every(p => TR_NAME_STOPWORDS.has(p));
  });
  return (words.join(' ').trim() || String(name || '')).slice(0, 160);
}

/**
 * Resolve a product's LOCAL ASIN on one marketplace by name search.
 * TR ASINs mostly don't exist on DE/GB/US (regional catalogues), so ASIN-only
 * pricing strands every cross-market product — this is the bridge: one search
 * page, organic results only, strict token match, first hit wins.
 * Resolves { ok:true, asin } | { ok:false, reason:'no-match' }.
 * Throws on transient trouble (bot page, HTTP != 200) — same contract as
 * fetchAmazonPrice, so callers' strike/breaker logic applies unchanged.
 */
async function searchLocalAsin(cc, productName) {
  const mk = MARKETPLACES[cc];
  if (!mk) throw new Error(`unknown marketplace ${cc}`);
  const name = String(productName || '').trim();
  const tokens = modelTokens(name);
  if (name.length < 6 || !tokens.length) return { ok: false, reason: 'no-match' };
  await ensureSession(cc);
  const url = `https://${mk.host}/s?k=${encodeURIComponent(searchQuery(name)).slice(0, 220)}`;
  const res = await politeCurl(cc, [...baseArgs(cc), url]);
  if (res.status !== 200) throw new Error(`amazon ${cc} search ${res.status}`);
  const html = res.text;
  // Search pages never carry id="productTitle", and the WORD "captcha" appears
  // in normal pages' scripts — so isBotPage() would false-positive here. A real
  // wall is a tiny page or the explicit captcha form with zero result blocks.
  const hasResults = /data-asin="B0/.test(html);
  if (html.length < 60000 || (!hasResults && /validateCaptcha|opfcaptcha|Robot Check/i.test(html))) {
    throw new Error(`amazon ${cc} search bot page`);
  }
  if (!hasResults) return { ok: false, reason: 'no-match' };
  const blocks = html.split(/data-asin="/).slice(1);
  for (const raw of blocks) {
    const asin = (raw.match(/^(B0[A-Z0-9]{8})"/) || [])[1];
    if (!asin) continue;
    const block = raw.slice(0, 14000);
    // organic results only — a sponsored slot can be a rival/wrong product.
    // Markers must be the VISIBLE ad labels: JSON like "sponsored":false lives
    // in every organic block and must not disqualify it.
    if (/AdHolder|puis-sponsored-label|>\s*(Gesponsert|Sponsored|Sponsorlu)\s*</i.test(block.slice(0, 4000))) continue;
    const title = fold(decodeEntities(
      (block.match(/<h2[^>]*>[\s\S]{0,500}?<span[^>]*>([^<]{8,300})<\/span>/) || block.match(/alt="([^"]{10,300})"/) || [])[1] || ''));
    if (!title) continue;
    if (!tokens.every(t => tokenInTitle(title, t))) continue;
    return { ok: true, asin };
  }
  return { ok: false, reason: 'no-match' };
}

module.exports = { MARKETPLACES, marketTag, fetchAmazonPrice, searchLocalAsin, buildSession, parseMoney, modelTokens, searchQuery, titleMatches };
