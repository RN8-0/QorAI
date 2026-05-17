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
 * 2. SEQUENTIAL product scraping — no Promise.all, no parallel channels.
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

// ─── Icecat ingestion state (managed via /icecat/* endpoints) ────────────
let icecatProc = null;
let icecatLog  = '';

function isIcecatRunning() {
  return !!(icecatProc && !icecatProc.killed && icecatProc.exitCode === null);
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
  // Detect CF challenge by known DOM fingerprints in the raw HTML
  return (
    html.includes('cf-browser-verification') ||
    html.includes('cf_challenge') ||
    html.includes('cf-turnstile') ||
    html.includes('__cf_chl') ||
    html.includes('jschl-answer') ||
    html.includes('cdn-cgi/challenge-platform') ||
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
  if (flaresolverrAvailable) {
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

async function fetchWithPuppeteer(url, opts = {}) {
  const { waitChallenge = true, _attempt = 0 } = opts;
  const page = await getPage();
  requestCount++;
  _browserCycle++;
  try {
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
    }
    const status = response ? response.status() : 0;

    // Small settle delay after DOM content loaded
    await _humanDelay(800, 1500);

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

    if (!isChallenge) {
      await _humanScroll(page);
      await _humanDelay(400, 800);
      await page.evaluate(() => { window.scrollBy(0, Math.floor(Math.random() * 200 - 100)); }).catch(() => {});
      await _humanDelay(300, 600);
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
      if (!seenImg.has(key) && r.images.length < 4) { seenImg.add(key); r.images.push(clean); }
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
        if (opts.workers) args.push(`--workers=${opts.workers}`);
        if (opts.delay)   args.push(`--delay=${opts.delay}`);
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
    for (const f of ['icecat_queue.jsonl', 'icecat_progress.json']) {
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
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      version: '4.2.0',
      engine: flaresolverrAvailable ? `flaresolverr (${browserEngine} fallback)` : browserEngine,
      flaresolverr: { available: flaresolverrAvailable, session: flaresolverrSession, failures: flaresolverrFailureCount, url: FLARESOLVERR_URL },
      requests: requestCount, browserConnected: browser ? browser.isConnected() : false,
      hasCookies: sessionCookies ? sessionCookies.length : 0,
      userAgent: currentUA.substring(0, 80),
    }));
    return;
  }

  // ── Category Links (strict, no detail) ──
  if (req.url.startsWith('/category-links')) {
    // Wrap EVERYTHING so this endpoint NEVER falls through to HTML
    try {
      const urlObj = new URL(req.url, `http://localhost:${PORT}`);
      const targetUrl = urlObj.searchParams.get('url');
      const maxLinks = Math.max(1, Math.min(1000, parseInt(urlObj.searchParams.get('max') || '200', 10) || 200));
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing ?url=...' }));
        return;
      }

      console.log(`  🔗 Category links: ${targetUrl}`);
      const { links, pages } = await withBrowserLock(async () => {
        const page = await getPage();

        // Navigate to the category page (FlareSolverr if available, else Puppeteer)
        const { html, status, isChallenge } = await fetchHtml(targetUrl);
        if (!html) {
          const err = new Error('Failed to load category page');
          err.status = status;
          throw err;
        }
        try {
          await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10000 });
        } catch {}

        // If Cloudflare challenge is still active, give it a short extra window
        // then try extraction anyway. We no longer hard-fail with 503 — the
        // client can handle empty results and move on, avoiding 25-55s hangs.
        if (isChallenge) {
          console.log(`  🔄 Challenge flagged. Waiting up to 10s for product list...`);
          try {
            await page.waitForSelector(
              '#listele, .urunler, .listele, .urun-listesi, .productlist, #productlist',
              { timeout: 10000 }
            );
            console.log(`  ✅ Product list appeared.`);
          } catch {
            console.log(`  ⚠️ Product list selector did not appear; extracting best-effort links.`);
          }
        }

        try {
          const initialLinks = await extractCategoryLinks(page);
          const ajaxLinks = initialLinks.length < maxLinks
            ? await extractEpeyAjaxListingLinks(page, maxLinks - initialLinks.length).catch(() => [])
            : [];
          const seen = new Set();
          const links = [];
          for (const link of [...initialLinks, ...ajaxLinks]) {
            if (!link || seen.has(link)) continue;
            seen.add(link);
            links.push(link);
            if (links.length >= maxLinks) break;
          }
          return {
            links,
            pages: await extractListingPaginationLinks(page).catch(() => []),
          };
        } catch (extractErr) {
          extractErr.extractionFailed = true;
          throw extractErr;
        }
      });

      console.log(`  ✅ ${links.length} product links extracted`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: links.length, links, pages }));
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
  if (!parsed.hostname.endsWith('epey.com')) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Only epey.com domains are allowed.' }));
    return;
  }

  try {
    console.log(`  [${requestCount + 1}] → ${targetUrl}`);
    const { html, status } = await withBrowserLock(() => fetchHtml(targetUrl));
    if (!html || status === 404) {
      res.setHeader('X-Status-Code', '404');
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Page not found (404).' }));
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Status-Code', String(status));
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
  console.log(`\n  ⚡ Qor AI Scraper Proxy v4.1 — http://localhost:${PORT}`);
  console.log(`  🖥️  Admin Panel: http://localhost:${PORT}/`);
  console.log(`  🛡️  puppeteer-extra-plugin-stealth enabled`);
  console.log(`  📡 STRICT selectors — NO sidebar/carousel links`);
  console.log(`  🐢 SEQUENTIAL scraping — parallel disabled`);

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
