/**
 * Qor AI Scraper Proxy — Stealth Edition v4.0 (Sequential, Strict Selectors)
 *
 * Uses puppeteer-extra + StealthPlugin to bypass Cloudflare/bot protection.
 * Runs on the admin's machine — requests use YOUR own IP address.
 *
 * CRITICAL FIXES:
 * 1. STRICT selectors for category links — ONLY scrapes links inside the
 *    main product listing container (#productlist / .productlist).
 *    Sidebar, carousel, "Top-10", "Popular" links are NEVER collected.
 * 2. Parallel-friendly product detail proxy with plain HTTPS fast path.
 *    Products are processed one-by-one with configurable delays.
 *
 * Usage:
 *   node scripts/scraper-proxy.js [port]
 *   Default port: 3456
 *
 * Endpoints:
 *   GET /health                     -> proxy status
 *   GET /?url=<epey-url>            -> fetch single page HTML
 *   GET /category-links?url=<cat>   -> fetch ONLY product links from category
 *   GET /scrape-category?catUrl=..  -> sequential scrape: links + detail data
 *   GET /scrape-product?name=..     -> search & scrape single product
 */

const http = require('http');
const https = require('https');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const puppeteerExtra = require(path.join(rootDir, 'node_modules', 'puppeteer-extra'));
const StealthPlugin = require(path.join(rootDir, 'node_modules', 'puppeteer-extra-plugin-stealth'));

puppeteerExtra.use(StealthPlugin());

// puppeteer-real-browser uses `rebrowser-patches` to neutralise the CDP-level
// `Runtime.Enable` detection that Cloudflare Turnstile leans on. Combined
// with its built-in `turnstile: true` flag (auto-completes the JS challenge)
// this clears site Cloudflare walls without manual clicks. Loaded lazily
// so the proxy still boots if the dependency is missing — we fall back to
// the legacy puppeteer-extra launcher in that case.
let realBrowserConnect = null;
try {
  realBrowserConnect = require(path.join(rootDir, 'node_modules', 'puppeteer-real-browser')).connect;
} catch (_e) {
  console.warn('  ⚠️  puppeteer-real-browser not installed — using puppeteer-extra fallback.');
}

const PORT = parseInt(process.argv[2]) || 3456;
const SERVER_STARTED_AT = new Date();

function readDotEnv(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const i = trimmed.indexOf('=');
      if (i <= 0) continue;
      out[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
    }
    return out;
  } catch {
    return {};
  }
}

function deepSeekApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  const rootEnv = readDotEnv(path.join(rootDir, '.env'));
  if (rootEnv.DEEPSEEK_API_KEY) return rootEnv.DEEPSEEK_API_KEY;
  try {
    const buildScript = fs.readFileSync(path.join(rootDir, 'scripts', 'build-dictionary.js'), 'utf8');
    const m = buildScript.match(/DEEPSEEK_API_KEY\s*=\s*['"]([^'"]+)['"]/);
    if (m && m[1]) return m[1];
  } catch {}
  return '';
}

function postJson(url, payload, headers = {}, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(payload || {});
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
      timeout: timeoutMs,
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        let body = raw;
        try { body = JSON.parse(raw || '{}'); } catch {}
        resolve({ statusCode: res.statusCode || 0, body, raw });
      });
    });
    req.on('timeout', () => req.destroy(new Error('deepseek_proxy_timeout')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ─── Icecat ingestion state (managed via /icecat/* endpoints) ────────────
let icecatProc = null;
let icecatLog  = '';

function isIcecatRunning() {
  return !!(icecatProc && !icecatProc.killed && icecatProc.exitCode === null);
}

// ─── Affiliate offer sync (sync_offers.js child process) ─────────────────
let offersProc = null;
let offersLog  = '';

function isOffersRunning() {
  return !!(offersProc && !offersProc.killed && offersProc.exitCode === null);
}

// ─── FlareSolverr (optional CF-bypass sidecar) ───────────────────────────
// FlareSolverr is a Docker container that solves Cloudflare challenges using
// undetected-chromedriver. When it's running on http://localhost:8191/v1 the
// proxy will route HTML fetches through it FIRST and only fall back to the
// local Puppeteer browser if FlareSolverr is unreachable. This eliminates
// 95%+ of Cloudflare interactions in normal operation — zero manual clicks.
//
// Setup (one-time):
//   docker run -d --name flaresolverr -p 8191:8191 \
//     --restart unless-stopped ghcr.io/flaresolverr/flaresolverr:latest
//
// Override URL via env: FLARESOLVERR_URL=http://host:port/v1
const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1';
let flaresolverrSession = null;       // session id we reuse for cookie persistence
let flaresolverrAvailable = false;    // toggled by health probe
let flaresolverrFailureCount = 0;     // consecutive failures → temp disable
const ADMIN_DIR = path.join(rootDir, 'admin');
const MIME = {
  '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml',
  '.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf',
  '.bat':'text/plain','.txt':'text/plain'
};
const ALLOWED_ORIGINS = [
  'https://z1221ae58okr865xdquykps8.46.225.95.201.sslip.io',
  'http://localhost:3456',
  'http://127.0.0.1:3456',
  'http://localhost:5000',
  'http://localhost:5002',
  'http://127.0.0.1:5000',
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

function _randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function findChromePath() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

let browser = null;
let activePage = null;
let requestCount = 0;
let sessionCookies = null;
let currentUA = _randomUA();

// Auto-restart browser every N successful navigations.
// Lowered from 200 → 80 because Cloudflare starts flagging the session
// fingerprint (cookies + TLS + behaviour) much earlier than memory becomes
// an issue. Restarting at 80 gives us a fresh `__cf_bm` token before the
// flag turns into a hard challenge wall.
const BROWSER_RESTART_AFTER = 80;
let _browserCycle = 0;

// The engine label is exposed via /health for debugging. Toggled when the
// initial browser is launched.
let browserEngine = 'unknown';
let browserQueue = Promise.resolve();

function withBrowserLock(task) {
  const run = browserQueue.then(task, task);
  browserQueue = run.catch(() => {});
  return run;
}

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  const chromePath = findChromePath();
  if (!chromePath) throw new Error('Chrome or Edge was not found. Please install Chrome or Edge.');

  const launchArgs = [
    '--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
    '--window-size=1366,768','--disable-blink-features=AutomationControlled',
    '--disable-infobars','--disable-notifications','--lang=tr-TR,tr',
    '--ignore-gpu-blocklist','--enable-gpu-rasterization',
    // Suppress automation-only banners and side-channel signals.
    '--no-default-browser-check','--no-first-run',
    '--disable-features=IsolateOrigins,site-per-process,Translate',
    '--disable-site-isolation-trials',
  ];

  // ── Primary: puppeteer-real-browser (rebrowser-patched, turnstile-aware) ──
  if (realBrowserConnect) {
    try {
      console.log(`  🚀 Starting Chrome via puppeteer-real-browser…`);
      const result = await realBrowserConnect({
        headless: false,
        // turnstile=true makes the package poll for the Cloudflare Turnstile
        // iframe and auto-click the checkbox / wait for the JS challenge to
        // self-resolve. This is the feature that kills the manual-tab-click
        // requirement.
        turnstile: true,
        // Provide our Chrome path so the package doesn't pull a separate one.
        customConfig: { chromePath },
        connectOption: { defaultViewport: null },
        args: launchArgs,
        // Linux-only flag; safe to pass on Windows (ignored).
        disableXvfb: true,
        // Keep the default arg list except `--enable-automation` (the strongest
        // bot signal after `navigator.webdriver`).
        ignoreAllFlags: false,
      });
      browser = result.browser;
      // The initial page from connect() is fingerprint-cleaned — reuse it.
      activePage = result.page;
      browserEngine = 'puppeteer-real-browser';
      console.log('  ✅ Chrome started via puppeteer-real-browser (CDP patched, turnstile auto-solve ON)');
      return browser;
    } catch (e) {
      console.warn(`  ⚠️  puppeteer-real-browser failed (${e.message}). Falling back to puppeteer-extra.`);
      browser = null;
      activePage = null;
    }
  }

  // ── Fallback: legacy puppeteer-extra + stealth-plugin ──
  console.log(`  🚀 Starting Chrome via puppeteer-extra: ${chromePath}`);
  browser = await puppeteerExtra.launch({
    executablePath: chromePath,
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: launchArgs,
    defaultViewport: { width: 1366, height: 768 },
    ignoreHTTPSErrors: true,
  });
  browserEngine = 'puppeteer-extra-stealth';
  console.log('  ✅ Chrome started via puppeteer-extra (stealth fallback)');
  return browser;
}

async function _restartBrowser() {
  console.log(`  ♻️  Auto-restarting browser after ${requestCount} requests to release memory...`);
  try { if (activePage && !activePage.isClosed()) await activePage.close(); } catch {}
  activePage = null;
  try { if (browser) await browser.close(); } catch {}
  browser = null;
  _browserCycle = 0;
  // sessionCookies stay — re-applied to the fresh page below
}

async function getPage() {
  // Trigger full browser restart cycle if threshold reached
  if (_browserCycle >= BROWSER_RESTART_AFTER) {
    await _restartBrowser();
  }
  const b = await getBrowser();
  // Rotate UA every 20 requests (cheap — just an http header swap on next nav)
  if (requestCount > 0 && requestCount % 20 === 0) currentUA = _randomUA();
  // Reuse existing page whenever possible. puppeteer-real-browser hands us a
  // pre-warmed page in connect(); creating a NEW tab via newPage() during
  // a CF-active session frequently raises "Protocol error (Target.createTarget):
  // Failed to open a new tab" because the CDP is busy with the Turnstile
  // iframe. Rotating tabs every 80 requests was already cosmetic for the
  // scraper target, so we keep one warmed tab and rotate the browser instead.
  if (activePage && !activePage.isClosed()) {
    if (activePage.__qoraiInitialised) return activePage;
  } else {
    activePage = await b.newPage();
  }
  await activePage.setUserAgent(currentUA);
  await activePage.setExtraHTTPHeaders({
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'DNT': '1','Upgrade-Insecure-Requests': '1',
  });
  // Defensive bot-signal patches that run BEFORE any site script.
  // stealth-plugin covers most of these but Cloudflare's Turnstile keeps
  // adding new sub-checks; layering our own keeps us ahead.
  await activePage.evaluateOnNewDocument(() => {
    // Always report the tab as focused — `document.hasFocus() === false` is
    // a strong bot signal because tabs always have focus when the user is
    // actively browsing.
    Object.defineProperty(document, 'hasFocus', { value: () => true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
    Object.defineProperty(document, 'hidden', { get: () => false });
    // navigator.webdriver = false (stealth handles this but redundancy is cheap)
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // Plausible plugin / mimeType counts (empty arrays look bot-like)
    Object.defineProperty(navigator, 'languages', { get: () => ['tr-TR', 'tr', 'en-US', 'en'] });
  });
  // FIX: Do NOT call setRequestInterception here — it leaks when the page is
  // reused across requests and causes "Request is already handled" errors.
  if (sessionCookies?.length) await activePage.setCookie(...sessionCookies);
  activePage.__qoraiInitialised = true;
  return activePage;
}

function _humanDelay(min = 500, max = 1500) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise(r => setTimeout(r, ms));
}

async function _humanScroll(page) {
  try {
    // Real mouse movement → Cloudflare's challenge JS captures `mousemove`
    // and `pointermove` events as proof of human presence. Without this,
    // the only mouse data the page sees is whatever the user happens to
    // do in the visible window, which is often nothing.
    const rx1 = 200 + Math.floor(Math.random() * 900);
    const ry1 = 150 + Math.floor(Math.random() * 500);
    const rx2 = 200 + Math.floor(Math.random() * 900);
    const ry2 = 150 + Math.floor(Math.random() * 500);
    await page.mouse.move(rx1, ry1, { steps: 15 + Math.floor(Math.random() * 15) });
    await _humanDelay(120, 280);
    await page.mouse.move(rx2, ry2, { steps: 20 + Math.floor(Math.random() * 20) });
    await page.evaluate(() => { window.scrollBy(0, Math.floor(Math.random() * 300 + 100)); });
    await _humanDelay(200, 600);
  } catch {}
}

function _isChallengeTitle(title) {
  // Expanded: covers Cloudflare Turnstile, DDoS-Guard, and common CF variants
  return /Just a moment|Checking your browser|DDoS-Guard|Please Wait|Nur einen Moment|Sichere Verbindung|Einen Moment|Verbindung wird|Attention Required|Access denied|403 Forbidden|Enable JavaScript/i.test(title || '');
}

function _isChallengeContent(html) {
  if (!html) return false;
  // Detect a CF challenge by DOM fingerprints in the raw HTML.
  // NOTE: do NOT match 'cdn-cgi/challenge-platform' — Cloudflare injects that
  // invisible bot-management script into EVERY page it serves, challenge or
  // not. Matching it flagged every real Epey page as a challenge, which killed
  // the plain-HTTP fast path and forced everything through slow Puppeteer.
  // A genuine challenge page also carries one of the specific tokens below.
  return (
    html.includes('cf-browser-verification') ||
    html.includes('cf_challenge') ||
    html.includes('cf-turnstile') ||
    html.includes('__cf_chl') ||
    html.includes('jschl-answer') ||
    html.includes('Checking if the site connection is secure') ||
    html.includes('Überprüfung ob die Verbindung')
  );
}

async function _resetActivePage() {
  try { if (activePage && !activePage.isClosed()) await activePage.close(); } catch {}
  activePage = null;
}

// ─── FlareSolverr client ────────────────────────────────────────────────
// We talk to FlareSolverr via its single POST /v1 endpoint. All commands
// share the same envelope: {cmd, url, session, maxTimeout, ...}.
async function _flarePost(body) {
  const res = await fetch(FLARESOLVERR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`flaresolverr http-${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error(`flaresolverr ${data.status}: ${data.message || ''}`);
  return data;
}

// Probe FlareSolverr health. Called on startup and again after every N
// failures so a momentarily-down sidecar doesn't permanently disable the
// fast path.
async function _checkFlareSolverr() {
  try {
    const res = await fetch(FLARESOLVERR_URL.replace(/\/v1$/, '/'), {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`http-${res.status}`);
    flaresolverrAvailable = true;
    flaresolverrFailureCount = 0;
    if (!flaresolverrSession) {
      // Create a long-lived session — keeps cookies & CF-cleared state across
      // requests, dramatically reducing per-request latency.
      try {
        const data = await _flarePost({ cmd: 'sessions.create', session: `qorai-${Date.now()}` });
        flaresolverrSession = data.session;
        console.log(`  🛡️  FlareSolverr session: ${flaresolverrSession}`);
      } catch (e) {
        console.warn(`  ⚠️  FlareSolverr session create failed (will run sessionless): ${e.message}`);
      }
    }
    return true;
  } catch (e) {
    flaresolverrAvailable = false;
    return false;
  }
}

async function fetchWithFlareSolverr(url) {
  const body = {
    cmd: 'request.get',
    url,
    maxTimeout: 60000,
  };
  if (flaresolverrSession) body.session = flaresolverrSession;
  const data = await _flarePost(body);
  const sol = data.solution || {};
  const html = sol.response || '';
  const status = sol.status || 200;
  // FlareSolverr returns the post-CF page; if status === 200 it's clean.
  // Still run our challenge detector as a safety net.
  const isChallenge = _isChallengeContent(html) || _isChallengeTitle(sol.title || '');
  return { html, status, isChallenge };
}

// Unified HTML fetch dispatcher. Tries FlareSolverr first when available;
// falls back to local Puppeteer otherwise. After 3 consecutive Flare
// failures we re-probe its health to decide if it's permanently down.
async function fetchHtml(url, opts = {}) {
  // A request that needs a custom Referer (Epey gallery pages) must go through
  // local Puppeteer — FlareSolverr cannot set per-request headers.
  if (flaresolverrAvailable && !opts.referer) {
    try {
      const result = await fetchWithFlareSolverr(url);
      if (!result.isChallenge && result.status !== 403 && result.html) {
        flaresolverrFailureCount = 0;
        return result;
      }
      // Challenge or empty → treat as failure for fallback decision
      throw new Error(result.isChallenge ? 'flare-challenge-leaked' : `flare-empty-${result.status}`);
    } catch (e) {
      flaresolverrFailureCount++;
      console.warn(`  ⚠️  FlareSolverr fail (${flaresolverrFailureCount}): ${e.message} → Puppeteer fallback`);
      if (flaresolverrFailureCount >= 3) {
        // Re-probe asynchronously; don't block this request.
        _checkFlareSolverr().catch(() => {});
      }
    }
  }
  return fetchWithPuppeteer(url, opts);
}

// Plain HTTPS GET — ~10x faster than a Puppeteer render. Epey serves most
// product detail pages to a normal browser-like request without a Cloudflare
// challenge; when it doesn't, the caller falls back to fetchHtml(). Follows
// redirects and transparently decompresses gzip/deflate/br.
function plainFetch(url, redirects = 4, referer = '') {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { return resolve({ html: '', status: 0 }); }
    // sessionCookies is an array of Puppeteer cookie objects — the Cloudflare
    // cf_clearance captured by the last browser load. Serialise it into a real
    // Cookie header so this plain request inherits the same clearance (it is
    // bound to currentUA, which Puppeteer also uses).
    const cookieHeader = (Array.isArray(sessionCookies) && sessionCookies.length)
      ? sessionCookies.map(c => `${c.name}=${c.value}`).join('; ')
      : '';
    const reqOpts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      timeout: 15000,
      headers: {
        'User-Agent': currentUA || _randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Upgrade-Insecure-Requests': '1',
        ...(referer ? { 'Referer': referer } : {}),
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
      },
    };
    const r = https.request(reqOpts, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        let next;
        try { next = new URL(res.headers.location, url).href; } catch { return resolve({ html: '', status: 0 }); }
        return resolve(plainFetch(next, redirects - 1, referer));
      }
      let stream = res;
      const enc = String(res.headers['content-encoding'] || '').toLowerCase();
      try {
        if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
      } catch { /* fall back to raw */ }
      const chunks = [];
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8'), status: res.statusCode || 0 }));
      stream.on('error', () => resolve({ html: '', status: res.statusCode || 0 }));
    });
    r.on('error', () => resolve({ html: '', status: 0 }));
    r.on('timeout', () => { r.destroy(); resolve({ html: '', status: 0 }); });
    r.end();
  });
}

// Plain HTTPS POST (form-urlencoded) — drives Epey's /kat/listele/ AJAX
// listing endpoint without a browser. ~50x faster than a Puppeteer render
// and it actually works: the in-page AJAX path broke because page.setContent
// leaves the document origin off epey.com, so the relative fetch 404s.
function plainPost(url, formObj, referer = '') {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { return resolve({ html: '', status: 0 }); }
    const body = new URLSearchParams(formObj || {}).toString();
    const cookieHeader = (Array.isArray(sessionCookies) && sessionCookies.length)
      ? sessionCookies.map(c => `${c.name}=${c.value}`).join('; ')
      : '';
    const reqOpts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      timeout: 15000,
      headers: {
        'User-Agent': currentUA || _randomUA(),
        'Accept': 'text/html, */*; q=0.01',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Length': Buffer.byteLength(body),
        ...(referer ? { 'Referer': referer } : {}),
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
      },
    };
    const r = https.request(reqOpts, (res) => {
      let stream = res;
      const enc = String(res.headers['content-encoding'] || '').toLowerCase();
      try {
        if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
      } catch { /* fall back to raw */ }
      const chunks = [];
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8'), status: res.statusCode || 0 }));
      stream.on('error', () => resolve({ html: '', status: res.statusCode || 0 }));
    });
    r.on('error', () => resolve({ html: '', status: 0 }));
    r.on('timeout', () => { r.destroy(); resolve({ html: '', status: 0 }); });
    r.write(body);
    r.end();
  });
}

// ── Server-side listing parsing (regex) — mirrors the in-page extractors so
//    /category-links and /listing-ajax run with NO browser at all. ──────────
const _PRODUCT_LINK_RE = /^\/[a-z0-9][a-z0-9/-]*\/[a-z0-9][a-z0-9._-]*\.html$/i;

// requirePrefix (e.g. "/akilli-telefonlar/") scopes results to the category,
// dropping cross-category links from "popular"/sidebar widgets in the page.
function extractListingLinksFromHtml(html, maxLinks = 1000, requirePrefix = '') {
  const seen = new Set();
  const links = [];
  const re = /(?:href|data-href|data-url)\s*=\s*["']([^"']+?\.html)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null && links.length < maxLinks) {
    let href = m[1].trim();
    if (/^https?:/i.test(href)) { try { href = new URL(href).pathname; } catch { continue; } }
    if (!href.startsWith('/')) href = '/' + href;
    if (!_PRODUCT_LINK_RE.test(href)) continue;
    if (/-resimleri\.html$/i.test(href)) continue;
    if (/\/(karsilastir|sayfa|yardim|hakkimizda|iletisim)\//i.test(href)) continue;
    if (requirePrefix && !href.toLowerCase().startsWith(requirePrefix.toLowerCase())) continue;
    const full = 'https://www.epey.com' + href;
    if (seen.has(full)) continue;
    seen.add(full);
    links.push(full);
  }
  return links;
}

function extractListingLinksWithPrefixFallback(html, maxLinks = 1000, requirePrefix = '') {
  const strict = extractListingLinksFromHtml(html, maxLinks, requirePrefix);
  if (strict.length || !requirePrefix) return strict;
  const unescaped = String(html || '')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
  if (unescaped !== String(html || '')) {
    const decodedStrict = extractListingLinksFromHtml(unescaped, maxLinks, requirePrefix);
    if (decodedStrict.length) return decodedStrict;
  }
  const loose = extractListingLinksFromHtml(html, maxLinks, '');
  if (loose.length) {
    console.warn(`  ⚠️ prefix "${requirePrefix}" matched 0 links; using unscoped listing links (${loose.length})`);
    return loose;
  }
  if (unescaped !== String(html || '')) {
    const decodedLoose = extractListingLinksFromHtml(unescaped, maxLinks, '');
    if (decodedLoose.length) {
      console.warn(`  ⚠️ decoded escaped AJAX listing links (${decodedLoose.length})`);
      return decodedLoose;
    }
  }
  return [];
}

function productPrefixFromLinks(links, fallbackPrefix = '') {
  const prefixes = new Set();
  for (const link of links || []) {
    try {
      const first = new URL(link).pathname.split('/').filter(Boolean)[0];
      if (first) prefixes.add(`/${first}/`);
    } catch {}
  }
  if (prefixes.size === 1) return [...prefixes][0];
  if (prefixes.size > 1) return '';
  return fallbackPrefix || '';
}

// Epey embeds the AJAX pagination tokens (category id + a per-session "cerez"
// nonce + page size) in an inline script on the category page.
const EPEY_AJAX_PAGE_SIZE = 31;

function extractAjaxParams(html) {
  const kid = String(html).match(/kategori_id\s*:\s*['"]?(\d+)/i);
  if (!kid) return null;
  const cerez = String(html).match(/cerez\s*:\s*['"]([^'"]+)['"]/i);
  const limit = String(html).match(/limit\s*:\s*['"]?(\d+)/i);
  return {
    kategoriId: kid[1],
    cerez: cerez ? cerez[1] : '',
    detectedLimit: Math.max(1, parseInt(limit?.[1] || String(EPEY_AJAX_PAGE_SIZE), 10) || EPEY_AJAX_PAGE_SIZE),
    limit: EPEY_AJAX_PAGE_SIZE,
  };
}

// The unfiltered category listing caps deep pagination at ~2.5k products, but
// a FILTERED query is not capped. So we pick one sidebar filter group whose
// options PARTITION the whole catalog — a single-value feature that has a
// "Belirtilmemiş" (unspecified) option, e.g. 5G: Var + Yok + Belirtilmemiş.
// Selecting every option of that group = no real constraint = the COMPLETE
// catalog, reachable page by page in one stream.
//
// Sidebar option markup:
//   <input ... onClick="filtre('GROUPID:VALUEID')"><label>…Name (count)</label>
// Returns { groupId, values:['GID:VID',…], total } or null.
function extractBestFilter(html) {
  const source = String(html || '');
  const groups = new Map(); // groupId -> { values:Set, total, hasUnspecified }

  const addOption = (gid, vid, name, rawCount) => {
    if (!gid || !vid) return;
    const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
    const count = parseInt(String(rawCount || '0').replace(/\./g, ''), 10) || 0;
    let g = groups.get(gid);
    if (!g) { g = { values: new Map(), total: 0, hasUnspecified: false }; groups.set(gid, g); }
    if (!g.values.has(vid)) { g.values.set(vid, count); g.total += count; }
    if (/^belirtilmemiş/i.test(cleanName)) g.hasUnspecified = true;
  };

  // Common markup: input onclick="filtre('5711:464004')" followed by label text.
  const strict = /onclick=["'][^"']*filtre\(['"]?(\d+):(\d+)['"]?\)[^"']*["'][\s\S]{0,500}?<label\b[^>]*>([\s\S]{0,220}?)<\/label>/gi;
  let m;
  while ((m = strict.exec(source)) !== null) {
    const text = m[3].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const count = text.match(/\(([\d.]+)\)/);
    addOption(m[1], m[2], text.replace(/\s*\([\d.]+\)\s*$/, ''), count?.[1]);
  }

  // Fallback: find every filtre(GID:VID) token and inspect nearby text.
  const loose = /filtre\(['"]?(\d+):(\d+)['"]?\)/gi;
  while ((m = loose.exec(source)) !== null) {
    const chunk = source.slice(m.index, m.index + 700);
    const text = chunk.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const count = text.match(/\(([\d.]+)\)/);
    const name = text.split(/\([\d.]+\)/)[0].replace(/.*filtre\(['"]?\d+:\d+['"]?\).*/i, '').trim();
    addOption(m[1], m[2], name, count?.[1]);
  }

  // A clean partition needs the catch-all "Belirtilmemiş" option. Among
  // those, take the group covering the most products; tie-break on fewer
  // options.
  let best = null;
  for (const [gid, g] of groups) {
    if (!g.hasUnspecified) continue;
    if (!best || g.total > best.total ||
        (g.total === best.total && g.values.size < best.size)) {
      best = { groupId: gid, total: g.total, size: g.values.size, values: [...g.values.keys()] };
    }
  }
  if (!best) return null;
  return {
    groupId: best.groupId,
    total: best.total,
    values: best.values.map(vid => `${best.groupId}:${vid}`),
  };
}

// Return the TOP-K candidate partition filters (best first) so the scraper
// can chain multiple coverage passes when the primary filter doesn't cover
// every product. Epey's default category listing hides discontinued items,
// but a non-default filter selection lifts that constraint — picking many
// different filter groups (RAM, screen size, year, etc.) maximises union
// coverage when iterated in sequence.
//
// Returns array of { groupId, total, values: ['gid:vid', ...] } sorted by
// total descending. Catch-all ("Belirtilmemiş") groups are preferred but not
// required; if no group has the catch-all we fall back to the largest
// available groups.
function extractTopFilters(html, limit = 4) {
  const source = String(html || '');
  const groups = new Map();
  const addOption = (gid, vid, name, rawCount) => {
    if (!gid || !vid) return;
    const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
    const count = parseInt(String(rawCount || '0').replace(/\./g, ''), 10) || 0;
    let g = groups.get(gid);
    if (!g) { g = { values: new Map(), total: 0, hasUnspecified: false }; groups.set(gid, g); }
    if (!g.values.has(vid)) { g.values.set(vid, count); g.total += count; }
    if (/^belirtilmemiş/i.test(cleanName)) g.hasUnspecified = true;
  };
  const strict = /onclick=["'][^"']*filtre\(['"]?(\d+):(\d+)['"]?\)[^"']*["'][\s\S]{0,500}?<label\b[^>]*>([\s\S]{0,220}?)<\/label>/gi;
  let m;
  while ((m = strict.exec(source)) !== null) {
    const text = m[3].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const count = text.match(/\(([\d.]+)\)/);
    addOption(m[1], m[2], text.replace(/\s*\([\d.]+\)\s*$/, ''), count?.[1]);
  }
  const loose = /filtre\(['"]?(\d+):(\d+)['"]?\)/gi;
  while ((m = loose.exec(source)) !== null) {
    const chunk = source.slice(m.index, m.index + 700);
    const text = chunk.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const count = text.match(/\(([\d.]+)\)/);
    const name = text.split(/\([\d.]+\)/)[0].replace(/.*filtre\(['"]?\d+:\d+['"]?\).*/i, '').trim();
    addOption(m[1], m[2], name, count?.[1]);
  }
  const ranked = [];
  for (const [gid, g] of groups) {
    if (g.values.size < 2) continue; // single-value groups can't partition
    ranked.push({
      groupId: gid,
      total: g.total,
      size: g.values.size,
      hasUnspecified: g.hasUnspecified,
      values: [...g.values.keys()].map(vid => `${gid}:${vid}`),
    });
  }
  // Prefer (a) groups with "Belirtilmemiş" catch-all, (b) higher total
  // coverage, (c) fewer options so each partition pull is bigger.
  ranked.sort((a, b) => {
    if (a.hasUnspecified !== b.hasUnspecified) return a.hasUnspecified ? -1 : 1;
    if (b.total !== a.total) return b.total - a.total;
    return a.size - b.size;
  });
  return ranked.slice(0, Math.max(1, limit)).map(g => ({
    groupId: g.groupId,
    total: g.total,
    values: g.values,
    hasUnspecified: g.hasUnspecified,
  }));
}

function extractBrandFilter(html) {
  const source = String(html || '');
  const values = [];
  const seen = new Set();
  const re = /filtre\(['"]?(marka:\d+)['"]?\)[^>]*>[\s\S]{0,260}?<label\b[^>]*>([\s\S]{0,220}?)<\/label>/gi;
  let m;
  while ((m = re.exec(source)) !== null) {
    const value = m[1];
    if (seen.has(value)) continue;
    const text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const count = parseInt((text.match(/\(([\d.]+)\)/)?.[1] || '0').replace(/\./g, ''), 10) || 0;
    if (count <= 0) continue;
    seen.add(value);
    values.push({
      value,
      name: text.replace(/\s*\([\d.]+\)\s*$/, '').trim(),
      count,
    });
  }
  values.sort((a, b) => b.count - a.count);
  return values.length
    ? { groupId: 'marka', total: values.reduce((n, x) => n + x.count, 0), values }
    : null;
}

function extractFeaturedBrandPages(html, requirePrefix = '') {
  const source = String(html || '');
  const prefix = String(requirePrefix || '').replace(/^\/|\/$/g, '');
  if (!prefix) return null;
  const values = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,260}?)<\/a>/gi;
  let m;
  while ((m = re.exec(source)) !== null) {
    let href = m[1].trim();
    if (!href) continue;
    if (/^https?:/i.test(href)) {
      try { href = new URL(href).pathname; } catch { continue; }
    }
    if (!href.startsWith('/')) href = '/' + href;
    const path = href.replace(/^\/|\/$/g, '');
    const parts = path.split('/').filter(Boolean);
    if (parts.length !== 2 || parts[0] !== prefix) continue;
    const text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const count = parseInt((text.match(/\(([\d.]+)\)/)?.[1] || '0').replace(/\./g, ''), 10) || 0;
    if (count <= 0) continue;
    const fullUrl = `https://www.epey.com/${parts[0]}/${parts[1]}/`;
    if (seen.has(fullUrl)) continue;
    seen.add(fullUrl);
    values.push({
      value: fullUrl,
      url: fullUrl,
      slug: parts[1],
      name: text.replace(/\s*\([\d.]+\)\s*$/, '').trim() || parts[1],
      count,
    });
  }
  values.sort((a, b) => b.count - a.count);
  return values.length
    ? { groupId: 'brand-pages', total: values.reduce((n, x) => n + x.count, 0), values }
    : null;
}

// Highest page number referenced by the listing's pagination block.
function extractMaxListingPage(html, catPath) {
  if (!catPath) return 1;
  const esc = catPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${esc}/(\\d{1,5})/`, 'gi');
  let m, max = 1;
  while ((m = re.exec(html)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > max && n < 100000) max = n;
  }
  return max;
}

async function fetchWithPuppeteer(url, opts = {}) {
  const { waitChallenge = true, _attempt = 0, referer = '' } = opts;
  const page = await getPage();
  requestCount++;
  _browserCycle++;

  // Per-site header overrides. Geizhals' Cloudflare wall blocks the default
  // TR locale; pretending to be a German visitor (de-DE + geizhals.de
  // referer) lifts the block in most cases.
  const lowerUrl = String(url || '').toLowerCase();
  const isGeizhals = /(^|\.)geizhals\.(eu|at|de|com)\//.test(lowerUrl);
  const perSiteHeaders = isGeizhals ? {
    'Accept-Language': 'de-DE,de;q=0.9,en;q=0.7',
    'Referer': referer || 'https://geizhals.de/',
  } : (referer ? { Referer: referer } : null);

  try {
    if (perSiteHeaders) {
      try { await page.setExtraHTTPHeaders(perSiteHeaders); } catch {}
    }
    // FIX: Use 'domcontentloaded' instead of 'networkidle0'.
    // 'networkidle0' hangs on Cloudflare challenge pages because CF keeps
    // polling its own verification endpoints indefinitely, preventing idle.
    // 'domcontentloaded' fires as soon as the HTML is parsed — we then check
    // the title ourselves and wait manually if needed.
    let response;
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (navErr) {
      // Navigation timeout is OK — the page might still be partially loaded
      console.warn(`  ⚠️ Navigation timeout (continuing): ${navErr.message}`);
    } finally {
      // Clear per-site headers so they don't leak into the next navigation.
      if (perSiteHeaders) { try { await page.setExtraHTTPHeaders({}); } catch {} }
    }
    const status = response ? response.status() : 0;

    // Small settle delay after DOM content loaded. Kept short — once the CF
    // clearance cookie is set Epey is not re-challenging, so the long
    // anti-bot pauses below are only needed on an actual challenge.
    await _humanDelay(200, 400);

    let title = await page.title().catch(() => '');
    const rawHtml = await page.content().catch(() => '');
    let isChallenge = _isChallengeTitle(title) || _isChallengeContent(rawHtml);

    if (isChallenge && waitChallenge) {
      // puppeteer-real-browser auto-resolves the Turnstile JS challenge in
      // ~5-20s by polling the iframe; we just have to give it time and re-read
      // the page. No manual click required.
      console.log(`  ⏳ Cloudflare challenge — turnstile auto-solver working… ("${title.substring(0, 50)}")`);
      const POLL_INTERVAL = 2500;
      const MAX_WAIT = 45000; // give the auto-solver up to 45s before giving up
      let waited = 0;
      while (waited < MAX_WAIT) {
        await _humanDelay(POLL_INTERVAL, POLL_INTERVAL);
        waited += POLL_INTERVAL;
        title = await page.title().catch(() => '');
        const html2 = await page.content().catch(() => '');
        isChallenge = _isChallengeTitle(title) || _isChallengeContent(html2);
        if (!isChallenge) {
          console.log(`  ✅ Challenge auto-solved after ${(waited / 1000).toFixed(0)}s: "${title.substring(0, 50)}"`);
          break;
        }
        if (waited % 10000 < POLL_INTERVAL) {
          console.log(`  ⏳ Still solving… (${(waited / 1000).toFixed(0)}s / ${(MAX_WAIT / 1000).toFixed(0)}s)`);
        }
      }
      if (isChallenge) {
        console.log(`  ❌ Auto-solver could not clear challenge in ${(MAX_WAIT / 1000).toFixed(0)}s.`);
      }
    }

    if (isChallenge) {
      // Still challenged — keep the human-like mouse/scroll theatrics.
      await _humanScroll(page);
      await _humanDelay(300, 600);
    } else {
      // Clean page: a single quick scroll to the bottom triggers lazy-loaded
      // gallery thumbnails. No artificial pauses — this is the hot path.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await _humanDelay(120, 220);

      // ── EPEY PRODUCT DETAIL: expand every collapsed spec section ──────
      // Epey hides ~half of the spec table behind "Tüm Özellikler" expanders
      // (display:none until clicked). The scraper used to read 42/125 specs
      // because parseSpecs() only sees visible DOM. We reveal everything
      // before reading page.content() so the parser receives the full table.
      const isEpeyProductDetail =
        /(^|\.)epey\.com\//i.test(lowerUrl) && /\.html(?:[?#]|$)/i.test(lowerUrl);
      if (isEpeyProductDetail) {
        try {
          await page.evaluate(() => {
            // 1. Click every plausible "show more" / "tüm özellikler" toggle.
            const toggleRe = /tüm[\s_-]*özellik|daha fazla|detayl(?:ı|i)|gizli|expand|all\s*spec|tümünü/i;
            document.querySelectorAll('a, button, span, div, [onclick]')
              .forEach(el => {
                const t = (el.textContent || '').trim();
                if (t.length < 80 && toggleRe.test(t)) {
                  try { el.click(); } catch {}
                }
              });
            // 2. Force-show anything still hidden by inline style or class
            //    (Epey toggles via 'gizli' / 'd-none' / inline display:none).
            const showAll = (root) => {
              root.querySelectorAll(
                '[style*="display: none"], [style*="display:none"], .gizli, .hidden, .d-none, .collapse'
              ).forEach(el => {
                try {
                  el.style.display = '';
                  el.style.visibility = '';
                  el.classList.remove('gizli', 'hidden', 'd-none');
                  el.classList.add('show', 'in');
                } catch {}
              });
            };
            showAll(document);
            // Some sections are wrapped in <details> — open them all.
            document.querySelectorAll('details').forEach(d => { d.open = true; });
          });
          // Give the DOM a beat to settle if any JS re-runs after the clicks.
          await _humanDelay(180, 320);
        } catch (expandErr) {
          console.warn(`  ⚠️ Epey spec-expand pass failed: ${expandErr.message}`);
        }
      }
    }

    if (status === 404) return { html: null, status: 404, isChallenge: false };
    // Collect cookies on every successful real page load
    if (!isChallenge) {
      const cookies = await page.cookies().catch(() => []);
      if (cookies.length > 0) sessionCookies = cookies;
    }
    const html = await page.content();
    return { html, status: status || 200, isChallenge };
  } catch (err) {
    console.error(`  ❌ Fetch error (attempt ${_attempt + 1}): ${err.message}`);
    // Page or browser is likely broken — reset and retry once with a fresh page
    await _resetActivePage();
    if (_attempt < 1) {
      console.log('  🔁 Retrying once with a fresh page...');
      await _humanDelay(1500, 2500);
      return fetchWithPuppeteer(url, { ...opts, _attempt: _attempt + 1 });
    }
    throw err;
  }
}

async function fetchWithBrowserFetch(url) {
  await withBrowserLock(async () => {
    const page = await getPage();
    let onEpey = false;
    try { onEpey = /(^|\.)epey\.com$/i.test(new URL(page.url()).hostname); } catch {}
    if (!onEpey) await fetchWithPuppeteer('https://www.epey.com/');
  });
  const page = activePage;
  if (!page || page.isClosed()) return { html: '', status: 0, isChallenge: false };
  requestCount++;
  const result = await page.evaluate(async (target) => {
    try {
      const r = await fetch(target, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      return { html: await r.text(), status: r.status };
    } catch (e) {
      return { html: '', status: 0, error: e.message };
    }
  }, url);
  const html = result?.html || '';
  return {
    html,
    status: result?.status || 0,
    isChallenge: _isChallengeContent(html),
  };
}

function setCORSHeaders(res, origin) {
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || '');
  const allowed = !origin || origin === 'null' || isLocal || ALLOWED_ORIGINS.includes(origin)
    ? (origin && origin !== 'null' ? origin : '*')
    : ALLOWED_ORIGINS[0];
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Target-URL');
  res.setHeader('Access-Control-Expose-Headers', 'X-Response-URL, X-Status-Code');
}

/* ═══════════════════════════════════════════
   STRICT category link extraction (NO sidebar/carousel)
   ═══════════════════════════════════════════ */
async function extractCategoryLinks(page) {
  return await page.evaluate(() => {
    const results = [];
    const seen = new Set();
    const productLinkRe = /^\/[a-z0-9][a-z0-9\/-]*\/[a-z0-9][a-z0-9._-]*\.html$/i;

    const containers = document.querySelectorAll(
      '#listele, .urunler, .listele, .urun-listesi, main, #content, .content'
    );

    const scopes = containers.length > 0
      ? Array.from(containers)
      : [document.querySelector('main') || document.querySelector('#content') || document.querySelector('.content') || document.body];

    for (const scope of scopes) {
      if (!scope) continue;
      const links = scope.querySelectorAll('a[href], [data-href], [data-url], [onclick]');
      for (const a of links) {
        let href = (a.getAttribute('href') || a.getAttribute('data-href') || a.getAttribute('data-url') || '').trim();
        if (!href) {
          const m = String(a.getAttribute('onclick') || '').match(/['"]([^'"]+\.html)['"]/i);
          if (m) href = m[1];
        }
        if (!href) continue;
        if (href.startsWith('http')) {
          try { href = new URL(href).pathname; } catch { continue; }
        }
        if (!href.startsWith('/')) href = '/' + href;
        if (!productLinkRe.test(href)) continue;
        if (/-resimleri\.html$/i.test(href) || /\/(karsilastir|sayfa|yardim|hakkimizda|iletisim)\//i.test(href)) continue;
        if (seen.has(href)) continue;
        seen.add(href);
        results.push('https://www.epey.com' + href);
      }
      if (results.length) break;
    }
    return results;
  });
}

async function extractListingPaginationLinks(page) {
  return await page.evaluate(() => {
    const pages = [];
    const seen = new Set();
    const current = new URL(location.href);
    const basePath = current.pathname.replace(/\/\d+\/?$/i, '/');
    const add = (href) => {
      if (!href) return;
      let u;
      try { u = new URL(href, location.origin); } catch { return; }
      if (!/(\.|^)epey\.com$/i.test(u.hostname)) return;
      if (/\.html$/i.test(u.pathname)) return;
      if (u.pathname === current.pathname) return;
      if (!u.pathname.startsWith(basePath)) return;
      const canonical = `${u.origin}${u.pathname}${u.search || ''}`;
      if (seen.has(canonical)) return;
      seen.add(canonical);
      pages.push(canonical);
    };
    document.querySelectorAll('.sayfalama a[href], .sayfa a[href], .pagination a[href], [class*="sayfa"] a[href], [class*="pagination"] a[href]').forEach(a => add(a.getAttribute('href')));
    return pages.slice(0, 20);
  });
}

async function extractEpeyAjaxListingLinks(page, maxLinks = 200) {
  return await page.evaluate(async (maxLinks) => {
    const html = document.documentElement.innerHTML;
    const catMatch = html.match(/kategori_id\s*:\s*['"]?(\d+)/i);
    const cerezMatch = html.match(/cerez\s*:\s*['"]([^'"]+)['"]/i);
    if (!catMatch || !cerezMatch || typeof fetch !== 'function') return [];

    const limitMatch = html.match(/limit\s*:\s*['"]?(\d+)/i);
    const totalText = document.querySelector('#temizle .toplam, .toplam')?.textContent || '';
    const totalMatch = totalText.replace(/\./g, '').match(/(\d+)/);
    const limit = Math.max(1, parseInt(limitMatch?.[1] || '31', 10) || 31);
    const total = Math.max(limit, parseInt(totalMatch?.[1] || String(limit), 10) || limit);
    const maxPages = Math.min(Math.ceil(total / limit), Math.ceil(Math.max(1, maxLinks) / limit) + 2, 80);
    const productLinkRe = /^\/[a-z0-9][a-z0-9\/-]*\/[a-z0-9][a-z0-9._-]*\.html$/i;
    const seen = new Set();
    const results = [];

    const addFromHtml = (fragment) => {
      const doc = new DOMParser().parseFromString(fragment || '', 'text/html');
      doc.querySelectorAll('a[href], [data-href], [data-url], [onclick]').forEach(a => {
        let href = (a.getAttribute('href') || a.getAttribute('data-href') || a.getAttribute('data-url') || '').trim();
        if (!href) {
          const m = String(a.getAttribute('onclick') || '').match(/['"]([^'"]+\.html)['"]/i);
          if (m) href = m[1];
        }
        if (!href) return;
        if (href.startsWith('http')) {
          try { href = new URL(href).pathname; } catch { return; }
        }
        if (!href.startsWith('/')) href = '/' + href;
        if (!productLinkRe.test(href) || /-resimleri\.html$/i.test(href)) return;
        const full = 'https://www.epey.com' + href;
        if (seen.has(full)) return;
        seen.add(full);
        results.push(full);
      });
    };

    for (let pageNo = 2; pageNo <= maxPages && results.length < maxLinks; pageNo++) {
      try {
        const body = new URLSearchParams({
          kategori_id: catMatch[1],
          cerez: cerezMatch[1],
          limit: String(limit),
          sayfa: String(pageNo),
        });
        const res = await fetch('/kat/listele/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body,
          credentials: 'include',
        });
        if (!res.ok) break;
        const before = results.length;
        addFromHtml(await res.text());
        if (results.length === before) break;
      } catch {
        break;
      }
    }
    return results.slice(0, maxLinks);
  }, Math.max(1, Math.min(1000, parseInt(maxLinks, 10) || 200)));
}

/* ═══════════════════════════════════════════
   Product detail extraction (runs in browser context)
   ═══════════════════════════════════════════ */
async function extractProductDetail(page) {
  return await page.evaluate(() => {
    const r = { name: '', images: [], specs: {}, gtin: '', mpn: '', url: location.href };

    // Name
    const h1 = document.querySelector('h1');
    if (h1) {
      const clone = h1.cloneNode(true);
      clone.querySelectorAll('small, .subtitle, .variant').forEach(el => el.remove());
      r.name = clone.textContent.trim();
    }

    // Images — Epey product CDN only; skip brand/category/logo/spec assets.
    const seenImg = new Set();
    const addImg = (raw) => {
      let clean = String(raw || '').trim();
      if (!clean) return;
      if (clean.startsWith('//')) clean = 'https:' + clean;
      if (!clean.includes('resim.epey.com')) return;
      if (/\/(?:tema|marka|kategori|logo|site|grup)\//i.test(clean)) return;
      if (/(favicon|yildiz|profil|yukleniyor|loading|placeholder)/i.test(clean)) return;
      clean = clean.split(/[?#]/)[0];
      if (!/\.(?:jpe?g|png|webp|avif)$/i.test(clean)) return;
      const key = clean.toLowerCase().replace(/\/[zbsmtck]_/i, '/_').replace(/\.(jpe?g|png|webp|avif)$/i, '');
      if (!seenImg.has(key) && r.images.length < 8) { seenImg.add(key); r.images.push(clean); }
    };
    const og = document.querySelector('meta[property="og:image"], meta[name="twitter:image"], link[rel="image_src"]');
    addImg(og?.getAttribute('content') || og?.getAttribute('href'));
    document.querySelectorAll('#resimBuyuk img, #resimBuyuk a, #resimk img, #resimk a, .galerim img, .galerik img, a[href*="resim.epey.com"]').forEach(img => {
      for (const attr of ['src', 'data-src', 'data-lazy', 'data-original', 'data-zoom', 'data-big', 'data-full', 'data-image', 'href']) {
        const val = img.getAttribute(attr);
        addImg(val);
      }
    });

    const scan = (k, v) => {
      k = String(k || '').replace(/:$/, '').trim();
      v = String(v || '').replace(/\s+/g, ' ').trim();
      if (!k || !v || k.length > 180 || v.length > 1200) return;
      if (!r.gtin && /\b(ean|gtin|barkod|upc)\b/i.test(k)) {
        const m = v.match(/\b\d{8,14}\b/);
        if (m) r.gtin = m[0];
      }
      if (!r.mpn && /(mpn|üretici kodu|urun kodu|ürün kodu|model kodu|part number)/i.test(k)) {
        r.mpn = v.split(/\s*[|,;]\s*/)[0].slice(0, 200);
      }
      r.specs[k] = v;
    };
    document.querySelectorAll('#ozellikler li, .ozellikler li').forEach(li => {
      const key = li.querySelector('strong, b, .baslik, .cell:first-child');
      if (!key) return;
      const clone = li.cloneNode(true);
      clone.querySelectorAll('strong, b, .baslik, .cell:first-child, script, style').forEach(x => x.remove());
      scan(key.textContent, clone.textContent);
    });
    document.querySelectorAll('table tr').forEach(row => {
      const cells = row.querySelectorAll('th,td');
      if (cells.length >= 2) scan(cells[0].textContent, cells[1].textContent);
    });

    return r;
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';

  if (req.method === 'OPTIONS') {
    setCORSHeaders(res, origin);
    res.writeHead(204);
    res.end();
    return;
  }

  // ── Static Files ──
  if (req.url === '/' || req.url === '/admin' || req.url.startsWith('/admin/') || req.url.startsWith('/js/') || req.url.startsWith('/css/') || req.url === '/index.html' || req.url.match(/\.(html|js|css|png|jpg|svg|ico|json|bat|txt)$/)) {
    let filePath = req.url;
    if (filePath.startsWith('/admin/')) filePath = filePath.slice(6);
    else if (filePath === '/admin') filePath = '/index.html';
    if (filePath === '/') filePath = '/index.html';
    filePath = filePath.split('?')[0].replace(/^\//, '');
    const fullPath = path.join(ADMIN_DIR, filePath);
    if (!fullPath.startsWith(ADMIN_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache','Expires': '0'
        });
        res.end(fs.readFileSync(fullPath));
        return;
      }
    } catch {}
  }

  setCORSHeaders(res, origin);

  // ── Local DeepSeek proxy for admin bulk dictionary translation ─────────
  // The remote PocketBase hook can spend/update user credit records. Bulk
  // dictionary jobs are admin maintenance, so route them through this local
  // proxy to avoid PB record-update failures while keeping the API key off the
  // browser.
  if (req.url === '/ai/deepseek' && req.method === 'POST') {
    let body = '';
    req.on('data', c => {
      body += c;
      if (body.length > 12 * 1024 * 1024) req.destroy(new Error('request_too_large'));
    });
    req.on('end', async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        if (!payload.messages) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: "missing 'messages' in body" }));
          return;
        }
        const key = deepSeekApiKey();
        if (!key) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'DEEPSEEK_API_KEY not configured for local proxy' }));
          return;
        }
        const upstream = await postJson('https://api.deepseek.com/chat/completions', {
          model: payload.model || 'deepseek-chat',
          messages: payload.messages,
          ...(payload.temperature !== undefined ? { temperature: payload.temperature } : {}),
          ...(payload.max_tokens !== undefined ? { max_tokens: payload.max_tokens } : {}),
          ...(payload.response_format ? { response_format: payload.response_format } : {}),
          ...(payload.stream !== undefined ? { stream: payload.stream } : {}),
        }, { Authorization: `Bearer ${key}` }, 120000);
        res.writeHead(upstream.statusCode || 502, { 'Content-Type': 'application/json' });
        res.end(typeof upstream.body === 'string' ? upstream.body : JSON.stringify(upstream.body || {}));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'local_deepseek_proxy_failed', detail: e.message || String(e) }));
      }
    });
    return;
  }

  // ── Icecat Open Catalog Ingestion ──────────────────────────────────────
  // POST /icecat/start  body: {cats, langs, limit, workers, delay, resume}
  // GET  /icecat/status -> {running, progress, logTail}
  // POST /icecat/stop
  if (req.url === '/icecat/start' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const opts = body ? JSON.parse(body) : {};
        if (isIcecatRunning()) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Icecat already running' }));
          return;
        }
        const cats = String(opts.cats || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!cats.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Select at least one Icecat category' }));
          return;
        }
        const args = ['scripts/icecat_ingest.js'];
        if (opts.resume)  args.push('--resume');
        args.push(`--cats=${cats.join(',')}`);
        if (opts.langs)   args.push(`--langs=${opts.langs}`);
        if (opts.limit)   args.push(`--limit=${opts.limit}`);
        if (opts.maxTotalProducts) args.push(`--maxTotalProducts=${opts.maxTotalProducts}`);
        if (opts.minYear) args.push(`--minYear=${opts.minYear}`);
        if (opts.minIcecatId) args.push(`--minIcecatId=${opts.minIcecatId}`);
        if (opts.workers) args.push(`--workers=${opts.workers}`);
        if (opts.delay)   args.push(`--delay=${opts.delay}`);
        // Optional brand filter — only products of this brand are saved.
        const brand = String(opts.brand || '').trim().replace(/[^\p{L}\p{N} .&+-]/gu, '').slice(0, 60);
        if (brand) args.push(`--brand=${brand}`);
        const { spawn } = require('child_process');
        icecatLog = '';
        icecatProc = spawn('node', args, { cwd: rootDir, env: process.env });
        icecatProc.stdout.on('data', d => { icecatLog += d.toString(); if (icecatLog.length > 50000) icecatLog = icecatLog.slice(-40000); });
        icecatProc.stderr.on('data', d => { icecatLog += d.toString(); if (icecatLog.length > 50000) icecatLog = icecatLog.slice(-40000); });
        icecatProc.on('exit', code => { icecatLog += `\n[icecat] exited with code ${code}\n`; });
        console.log(`  🧊 /icecat/start args=${args.join(' ')}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, pid: icecatProc.pid, args }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  if (req.url === '/icecat/status') {
    let progress = null;
    try { progress = JSON.parse(fs.readFileSync(path.join(rootDir, 'scripts', 'icecat_progress.json'), 'utf8')); } catch {}
    let queueSize = 0;
    try { queueSize = fs.readFileSync(path.join(rootDir, 'scripts', 'icecat_queue.jsonl'), 'utf8').split('\n').filter(Boolean).length; } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      running: isIcecatRunning(),
      pid: icecatProc?.pid || null,
      progress, queueSize,
      logTail: icecatLog.slice(-4000),
    }));
    return;
  }
  if (req.url === '/icecat/stop' && req.method === 'POST') {
    if (isIcecatRunning()) {
      try { icecatProc.kill('SIGTERM'); } catch {}
      console.log('  🧊 /icecat/stop — process killed');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // POST /icecat/reset — wipe queue + progress so the next start does a
  // clean Phase 1 rebuild. Does NOT touch PocketBase records (those are
  // upserted by slug — re-running just refreshes them).
  if (req.url === '/icecat/reset' && req.method === 'POST') {
    if (isIcecatRunning()) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Stop the ingest first' }));
      return;
    }
    const wiped = [];
    for (const f of ['icecat_queue.jsonl', 'icecat_queue_meta.json', 'icecat_progress.json']) {
      const p = path.join(rootDir, 'scripts', f);
      try { fs.unlinkSync(p); wiped.push(f); } catch {}
    }
    icecatLog = '';
    console.log(`  🧊 /icecat/reset — wiped ${wiped.join(', ') || '(nothing)'}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, wiped }));
    return;
  }

  // GET /icecat/discover — returns the cached top-N category list produced by
  // `node scripts/icecat_discover_cats.js`. Read-only — admin UI uses this to
  // show counts when the user is picking categories.
  if (req.url.startsWith('/icecat/discover')) {
    const namedPath = path.join(rootDir, 'scripts', 'icecat_cats_named.json');
    const rawPath   = path.join(rootDir, 'scripts', 'icecat_cats.json');
    let body = null;
    try { body = JSON.parse(fs.readFileSync(namedPath, 'utf8')); } catch {}
    if (!body) { try { body = JSON.parse(fs.readFileSync(rawPath, 'utf8')); } catch {} }
    if (!body) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No discovery cache. Run: node scripts/icecat_discover_cats.js' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
    return;
  }

  // ── Affiliate offer sync ───────────────────────────────────────────────
  // POST /offers/sync  body: {cat, missingOnly, limit}  → spawns sync_offers.js
  // GET  /offers/status -> {running, logTail}
  // POST /offers/stop
  if (req.url === '/offers/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        if (isOffersRunning()) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Offer sync already running' }));
          return;
        }
        const opts = body ? JSON.parse(body) : {};
        const args = ['scripts/sync_offers.js', '--auto'];
        if (opts.missingOnly !== false) args.push('--missing-only');
        const cat = String(opts.cat || '').replace(/[^a-z0-9_-]/gi, '');
        if (cat) args.push(`--cat=${cat}`);
        const limit = parseInt(opts.limit, 10);
        if (limit > 0) args.push(`--limit=${limit}`);
        const { spawn } = require('child_process');
        offersLog = '';
        offersProc = spawn('node', args, { cwd: rootDir, env: process.env });
        offersProc.stdout.on('data', d => { offersLog += d.toString(); if (offersLog.length > 50000) offersLog = offersLog.slice(-40000); });
        offersProc.stderr.on('data', d => { offersLog += d.toString(); if (offersLog.length > 50000) offersLog = offersLog.slice(-40000); });
        offersProc.on('exit', code => { offersLog += `\n[offers] exited with code ${code}\n`; });
        console.log(`  💰 /offers/sync args=${args.join(' ')}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, pid: offersProc.pid, args }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  if (req.url === '/offers/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ running: isOffersRunning(), logTail: offersLog.slice(-6000) }));
    return;
  }
  if (req.url === '/offers/stop' && req.method === 'POST') {
    if (isOffersRunning()) {
      try { offersProc.kill('SIGTERM'); } catch {}
      console.log('  💰 /offers/stop — process killed');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── Reset Session ──
  // Hard-wipes the Cloudflare-flagged fingerprint: drops cookies, rotates
  // the user-agent, and kills the browser so the next /category-links call
  // boots a brand-new Chrome instance with zero accumulated state.
  // Called by admin/js/scraper.js whenever a page exhausts its retry budget
  // or after every N successful pages as a proactive cooldown.
  if (req.url === '/reset-session') {
    try {
      console.log('  🧹 /reset-session — wiping cookies, UA, and browser');
      sessionCookies = null;
      currentUA = _randomUA();
      try { if (activePage && !activePage.isClosed()) await activePage.close(); } catch {}
      activePage = null;
      try { if (browser) await browser.close(); } catch {}
      browser = null;
      _browserCycle = 0;
      // Reset FlareSolverr session too, if we have one.
      if (flaresolverrSession) {
        try {
          await _flarePost({ cmd: 'sessions.destroy', session: flaresolverrSession });
        } catch (_) {}
        flaresolverrSession = null;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ua: currentUA.substring(0, 80) }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // ── Health ──
  if (req.url === '/health' || req.url.startsWith('/health?')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      status: 'ok',
      version: '4.3.3-geizhals-generic-fetch',
      pid: process.pid,
      port: PORT,
      startedAt: SERVER_STARTED_AT.toISOString(),
      uptimeSec: process.uptime(),
      engine: flaresolverrAvailable ? `flaresolverr (${browserEngine} fallback)` : browserEngine,
      flaresolverr: { available: flaresolverrAvailable, session: flaresolverrSession, failures: flaresolverrFailureCount, url: FLARESOLVERR_URL },
      requests: requestCount, browserConnected: browser ? browser.isConnected() : false,
      hasCookies: sessionCookies ? sessionCookies.length : 0,
      userAgent: currentUA.substring(0, 80),
    }));
    return;
  }

  // ── Category Links (strict, no detail) ──
  // Loads the category page in the real browser (Cloudflare 403s plain Node
  // requests), then parses links + brand filters + AJAX tokens server-side.
  // The caller drives per-brand pagination page-by-page via /listing-ajax.
  if (req.url.startsWith('/category-links')) {
    try {
      const urlObj = new URL(req.url, `http://localhost:${PORT}`);
      const targetUrl = urlObj.searchParams.get('url');
      const maxLinks = Math.max(1, Math.min(10000, parseInt(urlObj.searchParams.get('max') || '200', 10) || 200));
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing ?url=...' }));
        return;
      }

      console.log(`  🔗 Category links: ${targetUrl}`);
      let result = null;

      {
        const t0 = Date.now();
        const html = await withBrowserLock(async () => {
          const r = await fetchHtml(targetUrl);
          if (!r.html) { const e = new Error('Failed to load category page'); e.status = r.status; throw e; }
          return r.html;
        });
        let catPath = '';
        try { catPath = new URL(targetUrl).pathname.replace(/^\/|\/$/g, '').replace(/\/\d+$/, ''); } catch {}
        const prefix = catPath ? `/${catPath.split('/')[0]}/` : '';
        const links = extractListingLinksWithPrefixFallback(html, maxLinks, prefix);
        const productPrefix = productPrefixFromLinks(links, prefix);
        const ajax = extractAjaxParams(html);
        // Primary filter (largest "Belirtilmemiş" catch-all partition).
        const filter = extractBestFilter(html);
        // Top-K candidate filters: when the primary partition under-counts,
        // the scraper falls through to the next-best filter group (RAM
        // range, screen size, year, etc.) for additional coverage. Each
        // filter group selects a different slice of the catalog so their
        // union covers more than any single group on its own.
        const filtersTopK = extractTopFilters(html, 4);
        const brandFilter = extractBrandFilter(html);
        const featuredBrandFilter = extractFeaturedBrandPages(html, prefix);
        const bestBrandFilter = featuredBrandFilter && (!brandFilter || featuredBrandFilter.total > brandFilter.total)
          ? featuredBrandFilter
          : brandFilter;
        console.log(`  📄 category-links (${((Date.now() - t0) / 1000).toFixed(1)}s): ${links.length} on p1` +
          `${filter ? ` · filter group ${filter.groupId} (~${filter.total} ürün)` : ' · no partition filter'}` +
          `${filtersTopK.length > 1 ? ` · +${filtersTopK.length - 1} fallback filter groups` : ''}` +
          `${bestBrandFilter ? ` · brand partitions ${bestBrandFilter.values.length} (~${bestBrandFilter.total} ürün)` : ''}` +
          `${productPrefix !== prefix ? ` · product prefix ${productPrefix}` : ''}`);
        result = {
          links, pages: [],
          ajax: ajax
            ? { kategoriId: ajax.kategoriId, cerez: ajax.cerez, limit: EPEY_AJAX_PAGE_SIZE,
                base: targetUrl, prefix: productPrefix }
            : null,
          filter,
          filtersTopK,
          brandFilter: bestBrandFilter,
        };
      }

      console.log(`  ✅ ${result.links.length} product links extracted`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        count: result.links.length,
        links: result.links,
        pages: result.pages || [],
        ajax: result.ajax || null,
        filter: result.filter || null,
        brandFilter: result.brandFilter || null,
      }));
    } catch (err) {
      if (err.extractionFailed) {
        console.error(`  ❌ extractCategoryLinks threw: ${err.message}`);
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'extraction_failed', message: err.message }));
        return;
      }
      if (err.message === 'Failed to load category page') {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, status: err.status }));
        return;
      }
      // FINAL safety net — ALWAYS return JSON, NEVER HTML
      console.error(`  ❌ /category-links fatal: ${err.message}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'category_links_failed',
        message: err.message
      }));
    }
    return;
  }

  // ── Listing AJAX page (one /kat/listele/ page) ──
  // Epey's listing AJAX must be POSTed from INSIDE the browser: Cloudflare
  // 403s any plain Node request, and the fetch has to be same-origin so it
  // carries cf_clearance. The caller drives pagination one page at a time so
  // the admin log can show live per-page progress.
  if (req.url.startsWith('/listing-ajax')) {
    try {
      const urlObj = new URL(req.url, `http://localhost:${PORT}`);
      const kid = urlObj.searchParams.get('kid');
      const limit = urlObj.searchParams.get('limit') || String(EPEY_AJAX_PAGE_SIZE);
      const pageNo = urlObj.searchParams.get('page') || '1';
      const base = urlObj.searchParams.get('base') || 'https://www.epey.com/akilli-telefonlar/';
      const prefix = urlObj.searchParams.get('prefix') || '';
      const cerez = urlObj.searchParams.get('cerez') || '';
      const debug = urlObj.searchParams.get('debug') === '1';
      // Filter values, e.g. ["5711:464004","5711:464003","5711:1118558"] —
      // all options of one partitioning group. Sent as PHP-array filtrele[].
      // Selecting every option = no real constraint, but it puts Epey in
      // FILTERED-listing mode, which is not capped at ~2.5k like the default.
      const fvs = urlObj.searchParams.getAll('fv').filter(Boolean);
      if (!kid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing kid' }));
        return;
      }
      const html = await withBrowserLock(async () => {
        const page = await getPage();
        // The /kat/listele/ fetch must run from an epey.com document in THIS
        // (local Puppeteer) browser so it is same-origin and sends
        // cf_clearance. Navigate the local page there once via Puppeteer
        // directly (not fetchHtml — that may route through FlareSolverr and
        // leave the local page elsewhere). Later pages reuse the document.
        let onEpey = false;
        try { onEpey = /(^|\.)epey\.com$/i.test(new URL(page.url()).hostname); } catch {}
        if (!onEpey) await fetchWithPuppeteer(base);
        return await page.evaluate(async (kidV, limitV, sayfaV, cerezV, filterVals) => {
          try {
            const body = new URLSearchParams();
            body.append('kategori_id', String(kidV));
            if (cerezV) body.append('cerez', String(cerezV));
            body.append('limit', String(limitV));
            body.append('sayfa', String(sayfaV));
            for (const v of (filterVals || [])) body.append('filtrele[]', v);
            const r = await fetch('/kat/listele/', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
              },
              body: body.toString(),
              credentials: 'include',
            });
            return r.ok ? await r.text() : '';
          } catch { return ''; }
        }, kid, limit, pageNo, cerez, fvs);
      });
      const links = extractListingLinksWithPrefixFallback(html || '', 2000, prefix);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        count: links.length,
        links,
        status: html ? 200 : 0,
        ...(debug ? {
          rawLength: String(html || '').length,
          rawSnippet: String(html || '').slice(0, 1200),
        } : {}),
      }));
    } catch (err) {
      console.error(`  ❌ /listing-ajax: ${err.message}`);
      // Return JSON 200 with empty links so the caller treats it as an empty
      // page (and ends the stream) rather than aborting the whole scrape.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: 0, links: [], status: 0, error: err.message }));
    }
    return;
  }

  // ── Scrape Category (sequential detail scrape) ──
  if (req.url.startsWith('/scrape-category')) {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const catUrl = urlObj.searchParams.get('catUrl');
    const max = parseInt(urlObj.searchParams.get('max')) || 50;
    const delay = parseInt(urlObj.searchParams.get('delay')) || 3000;
    if (!catUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing ?catUrl=...' }));
      return;
    }
    try {
      console.log(`  📂 Scrape category: ${catUrl} (max=${max}, delay=${delay}ms)`);
      const page = await getPage();
      const { html } = await fetchHtml(catUrl);
      if (!html) throw new Error('Category page failed to load');

      let links = await extractCategoryLinks(page);
      if (links.length === 0) {
        // Retry once with a small scroll to trigger lazy loaders
        await _humanScroll(page);
        await _humanDelay(1500, 2500);
        links = await extractCategoryLinks(page);
      }
      if (links.length > max) links = links.slice(0, max);
      console.log(`  → ${links.length} links to scrape sequentially`);

      const products = [];
      for (let i = 0; i < links.length; i++) {
        const url = links[i];
        console.log(`    [${i + 1}/${links.length}] → ${url}`);
        try {
          const { html: pHtml } = await fetchHtml(url);
          if (!pHtml) {
            console.log(`    ⚠️ empty page`);
            continue;
          }
          const detail = await extractProductDetail(page);
          if (detail.name) {
            detail.sourceUrl = url;
            products.push(detail);
            console.log(`    ✅ ${detail.name.substring(0, 60)} (${Object.keys(detail.specs).length} specs, ${detail.images.length} imgs)`);
          } else {
            console.log(`    ⚠️ no name found`);
          }
        } catch (innerErr) {
          console.log(`    ❌ error: ${innerErr.message}`);
        }
        // SEQUENTIAL delay between products
        if (i < links.length - 1) {
          await _humanDelay(delay, delay + 500);
        }
      }

      console.log(`  ✅ Category scrape complete: ${products.length} products`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: products.length, products }));
    } catch (err) {
      console.error(`  ❌ scrape-category error: ${err.message}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── Scrape Product by name ──
  if (req.url.startsWith('/scrape-product')) {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const productName = urlObj.searchParams.get('name') || '';
    if (!productName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing ?name=...' }));
      return;
    }
    try {
      console.log(`  🔍 Searching: ${productName}`);
      const data = await withBrowserLock(async () => {
        const page = await getPage();
        await page.goto('https://www.epey.com/ara/?ara=' + encodeURIComponent(productName), { waitUntil: 'domcontentloaded', timeout: 20000 });
        const productUrl = await page.evaluate(() => {
          for (const a of document.querySelectorAll('a[href$=".html"]')) {
            const h = a.getAttribute('href') || '';
            if (/\/[a-z0-9][a-z0-9\/-]*\/[a-z0-9][a-z0-9._-]*\.html$/i.test(h) && !/-resimleri\.html$/i.test(h)) return h;
          }
          return null;
        });
        if (!productUrl) {
          const err = new Error('Not found');
          err.statusCode = 404;
          throw err;
        }
        const fullUrl = productUrl.startsWith('http') ? productUrl : 'https://www.epey.com' + productUrl;
        await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await _humanDelay(500, 1000);
        const detail = await extractProductDetail(page);
        detail.sourceUrl = fullUrl;
        return detail;
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(err.statusCode || 502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── Generic proxy fetch (single page) ──
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const targetUrl = req.headers['x-target-url'] || urlObj.searchParams.get('url');
  // Optional Referer — Epey's image-gallery pages (…-resimleri.html) return a
  // 404 unless the request carries a Referer pointing at the product page.
  const referer = req.headers['x-referer'] || urlObj.searchParams.get('referer') || '';

  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing URL. Use ?url=... or the X-Target-URL header.' }));
    return;
  }

  let parsed;
  try { parsed = new URL(targetUrl); } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid URL.' }));
    return;
  }
  const allowedGenericHost =
    parsed.hostname.endsWith('epey.com') ||
    /(^|\.)geizhals\.(eu|at|de|com)$/i.test(parsed.hostname);
  if (!allowedGenericHost) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Only epey.com and geizhals.* domains are allowed.' }));
    return;
  }

  try {
    console.log(`  [${requestCount + 1}] → ${targetUrl}`);
    // Fast path: product/detail HTML on Epey is usually reachable with a
    // normal browser-like HTTPS request. This path is NOT browser-locked, so
    // the admin can fetch many product detail pages in parallel. If Epey ever
    // returns a real challenge/403/empty body, we fall back to Puppeteer below.
    const fast = await plainFetch(targetUrl, 4, referer);
    if (fast.html && fast.status >= 200 && fast.status < 400 && !_isChallengeContent(fast.html)) {
      requestCount++;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Status-Code', String(fast.status || 200));
      res.setHeader('X-Fetch-Engine', 'plain');
      res.writeHead(200);
      res.end(fast.html);
      return;
    }
    const browserFetch = await fetchWithBrowserFetch(targetUrl);
    if (browserFetch.html && browserFetch.status >= 200 && browserFetch.status < 400 && !browserFetch.isChallenge) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Status-Code', String(browserFetch.status || 200));
      res.setHeader('X-Fetch-Engine', 'browser-fetch');
      res.writeHead(200);
      res.end(browserFetch.html);
      return;
    }
    // Cloudflare JA3-fingerprints Node's TLS stack, so a plain https request
    // (GET or POST) to epey.com is always answered with a 403 challenge — only
    // the real browser gets through. Everything therefore goes via Puppeteer.
    // `referer` is forwarded so Epey's gallery pages (…-resimleri.html), which
    // 404 without a Referer, load correctly.
    let { html, status } = await withBrowserLock(() => fetchHtml(targetUrl, { referer }));
    if (!html || status === 404) {
      res.setHeader('X-Status-Code', '404');
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Page not found (404).' }));
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Status-Code', String(status));
    res.setHeader('X-Fetch-Engine', 'puppeteer');
    res.writeHead(200);
    res.end(html);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
  }
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.log(`\n  ✅ Qor AI Scraper Proxy is already running on http://localhost:${PORT}`);
    console.log(`  Health: http://localhost:${PORT}/health\n`);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, async () => {
  console.log(`\n  ⚡ Qor AI Scraper Proxy v4.3.3 — http://localhost:${PORT}`);
  console.log(`  🖥️  Admin Panel: http://localhost:${PORT}/`);
  console.log(`  🛡️  puppeteer-extra-plugin-stealth enabled`);
  console.log(`  📡 STRICT selectors — NO sidebar/carousel links`);
  console.log(`  ⚡ Product details: plain HTTPS fast path + Puppeteer fallback`);

  // Probe FlareSolverr first — if it's running we'll route through it.
  console.log(`  🔍 Probing FlareSolverr at ${FLARESOLVERR_URL}…`);
  const ok = await _checkFlareSolverr();
  if (ok) {
    console.log(`  ✅ FlareSolverr active → CF challenges auto-solved, manual clicking gone`);
  } else {
    console.log(`  ⚠️  FlareSolverr not running (Docker container?). Falling back to local Puppeteer.`);
    console.log(`     Run:  docker run -d --name flaresolverr -p 8191:8191 --restart unless-stopped ghcr.io/flaresolverr/flaresolverr:latest`);
  }
  // Re-check FlareSolverr health every 60s so a late-started container is
  // picked up automatically without restarting the proxy.
  setInterval(() => { _checkFlareSolverr().catch(() => {}); }, 60000);

  try {
    await getBrowser();
    console.log(`\n  ✅ Proxy ready. Test: http://localhost:${PORT}/health\n`);
  } catch (err) {
    console.error(`\n  ❌ Chrome could not be started: ${err.message}\n`);
  }
});

async function _destroyFlareSession() {
  if (!flaresolverrSession) return;
  try { await _flarePost({ cmd: 'sessions.destroy', session: flaresolverrSession }); } catch {}
}

process.on('SIGINT', async () => {
  console.log('\n  Stopping proxy...');
  await _destroyFlareSession();
  if (browser) await browser.close().catch(() => {});
  process.exit();
});
process.on('SIGTERM', async () => {
  await _destroyFlareSession();
  if (browser) await browser.close().catch(() => {});
  process.exit();
});
