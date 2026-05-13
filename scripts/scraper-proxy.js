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
 *   GET /?url=<geizhals-url>        -> fetch single page HTML
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

const PORT = parseInt(process.argv[2]) || 3456;
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

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  const chromePath = findChromePath();
  if (!chromePath) throw new Error('Chrome or Edge was not found. Please install Chrome or Edge.');

  console.log(`  🚀 Starting Chrome: ${chromePath}`);
  browser = await puppeteerExtra.launch({
    executablePath: chromePath,
    headless: false,
    args: [
      '--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
      '--window-size=1366,768','--disable-blink-features=AutomationControlled',
      '--disable-infobars','--disable-notifications','--lang=de-DE,de',
      '--ignore-gpu-blocklist','--enable-gpu-rasterization',
    ],
    defaultViewport: { width: 1366, height: 768 },
    ignoreHTTPSErrors: true,
  });

  console.log('  ✅ Chrome started with stealth mode enabled');
  // NOTE: No warmup page — avoids hitting Cloudflare immediately on startup.
  // Cookies will be collected naturally on the first real request.
  return browser;
}

async function getPage() {
  const b = await getBrowser();
  // Rotate UA every 20 requests
  if (requestCount % 20 === 0) currentUA = _randomUA();
  // Reuse existing page unless rotation threshold reached
  if (activePage && !activePage.isClosed() && requestCount % 80 !== 0) return activePage;
  if (activePage && !activePage.isClosed()) {
    await activePage.close().catch(() => {});
    activePage = null;
  }
  activePage = await b.newPage();
  await activePage.setUserAgent(currentUA);
  await activePage.setExtraHTTPHeaders({
    'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'DNT': '1','Upgrade-Insecure-Requests': '1',
  });
  // FIX: Do NOT call setRequestInterception here — it leaks when the page is
  // reused across requests and causes "Request is already handled" errors.
  if (sessionCookies?.length) await activePage.setCookie(...sessionCookies);
  return activePage;
}

function _humanDelay(min = 500, max = 1500) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise(r => setTimeout(r, ms));
}

async function _humanScroll(page) {
  try {
    await page.evaluate(() => { window.scrollBy(0, Math.floor(Math.random() * 300 + 100)); });
    await _humanDelay(200, 600);
  } catch {}
}

function _isChallengeTitle(title) {
  // Expanded: covers Cloudflare Turnstile, DDoS-Guard, and all known Geizhals CF variants
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

async function fetchWithPuppeteer(url, opts = {}) {
  const { waitChallenge = true, _attempt = 0 } = opts;
  const page = await getPage();
  requestCount++;
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
      console.log(`  ⏳ Challenge detected: "${title.substring(0, 60)}". Tarayıcı penceresinden Cloudflare'i geçin...`);
      // Wait up to 30 seconds for the user to manually solve the Cloudflare challenge
      // in the visible browser window (headless: false)
      const POLL_INTERVAL = 2000;
      const MAX_WAIT = 15000;
      let waited = 0;
      while (waited < MAX_WAIT) {
        await _humanDelay(POLL_INTERVAL, POLL_INTERVAL);
        waited += POLL_INTERVAL;
        title = await page.title().catch(() => '');
        const html2 = await page.content().catch(() => '');
        isChallenge = _isChallengeTitle(title) || _isChallengeContent(html2);
        if (!isChallenge) {
          console.log(`  ✅ Challenge solved after ${(waited / 1000).toFixed(0)}s: "${title.substring(0, 60)}"`);
          break;
        }
        console.log(`  ⏳ Still waiting... (${(waited / 1000).toFixed(0)}s / 30s) title: "${title.substring(0, 40)}"`);
      }
      if (isChallenge) {
        console.log(`  ❌ Challenge NOT solved after 30s.`);
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
    const productLinkRe = /-[av]\d+\.html$/i;

    // STRICT: only look inside known main listing containers
    const containers = document.querySelectorAll(
      '#productlist, .productlist, .productlist__item, .offer-list, [data-testid="product-list"]'
    );

    const scopes = containers.length > 0
      ? Array.from(containers)
      : [document.querySelector('main') || document.querySelector('#content') || document.querySelector('.content') || document.body];

    for (const scope of scopes) {
      if (!scope) continue;
      const links = scope.querySelectorAll('a[href]');
      for (const a of links) {
        let href = (a.getAttribute('href') || '').trim();
        if (!href) continue;
        if (href.startsWith('http')) {
          try { href = new URL(href).pathname; } catch { continue; }
        }
        if (!productLinkRe.test(href)) continue;
        if (!href.startsWith('/')) href = '/' + href;
        if (seen.has(href)) continue;
        seen.add(href);
        results.push('https://geizhals.eu' + href);
      }
    }
    return results;
  });
}

/* ═══════════════════════════════════════════
   Product detail extraction (runs in browser context)
   ═══════════════════════════════════════════ */
async function extractProductDetail(page) {
  return await page.evaluate(() => {
    const r = { name: '', images: [], specs: {}, url: location.href };

    // Name
    const h1 = document.querySelector('h1');
    if (h1) {
      const clone = h1.cloneNode(true);
      clone.querySelectorAll('small, .subtitle, .variant').forEach(el => el.remove());
      r.name = clone.textContent.trim();
    }

    // Images — only gzhls.at/pix/, upgrade size prefix
    const seenImg = new Set();
    document.querySelectorAll('img').forEach(img => {
      for (const attr of ['src', 'data-src', 'data-lazy', 'data-original']) {
        const val = img.getAttribute(attr);
        if (val && val.includes('gzhls.at/pix')) {
          const clean = val.trim().split(/[?#]/)[0].replace(/\/[ksmtc]_/g, '/-n.webp');
          if (!seenImg.has(clean)) { seenImg.add(clean); r.images.push(clean); }
          break;
        }
      }
    });
    document.querySelectorAll('a[href*="gzhls.at/pix/"]').forEach(a => {
      const href = a.getAttribute('href');
      if (href) {
        const clean = href.trim().split(/[?#]/)[0].replace(/\/[ksmtc]_/g, '/-n.webp');
        if (!seenImg.has(clean)) { seenImg.add(clean); r.images.push(clean); }
      }
    });

    // Specs — only the FIRST dl.specs-grid to avoid variant duplicates
    const firstGrid = document.querySelector('dl.specs-grid');
    if (firstGrid) {
      firstGrid.querySelectorAll('.specs-grid__item').forEach(item => {
        const dt = item.querySelector('dt');
        const dd = item.querySelector('dd');
        if (!dt || !dd) return;
        const k = dt.textContent.trim();
        let v = dd.textContent.trim().replace(/\s+/g, ' ');
        if (k && v && k.length > 1 && k.length < 80 && v.length < 800) {
          r.specs[k] = v;
        }
      });
    }

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

  // ── Health ──
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok', version: '4.0.0', engine: 'puppeteer-extra-stealth',
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
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing ?url=...' }));
        return;
      }

      console.log(`  🔗 Category links: ${targetUrl}`);
      const page = await getPage();

      // Navigate to the category page
      const { html, status, isChallenge } = await fetchWithPuppeteer(targetUrl);
      if (!html) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load category page', status }));
        return;
      }

      // If Cloudflare challenge is still active, give it a short extra window
      // then try extraction anyway. We no longer hard-fail with 503 — the
      // client can handle empty results and move on, avoiding 25-55s hangs.
      if (isChallenge) {
        console.log(`  🔄 Challenge flagged. Waiting up to 10s for product list...`);
        try {
          await page.waitForSelector(
            '.productlist, #productlist, .offer-list, [data-testid="product-list"]',
            { timeout: 10000 }
          );
          console.log(`  ✅ Product list appeared.`);
        } catch {
          console.log(`  ⚠️ Product list selector did not appear; extracting best-effort links.`);
        }
      }

      // Extract links from the now-clean page
      let links;
      try {
        links = await extractCategoryLinks(page);
      } catch (extractErr) {
        console.error(`  ❌ extractCategoryLinks threw: ${extractErr.message}`);
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'extraction_failed',
          message: extractErr.message
        }));
        return;
      }

      console.log(`  ✅ ${links.length} product links extracted`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: links.length, links }));
    } catch (err) {
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
      const { html } = await fetchWithPuppeteer(catUrl);
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
          const { html: pHtml } = await fetchWithPuppeteer(url);
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
      const page = await getPage();
      await page.goto('https://geizhals.eu/?fs=' + encodeURIComponent(productName), { waitUntil: 'domcontentloaded', timeout: 15000 });
      const productUrl = await page.evaluate(() => {
        for (const a of document.querySelectorAll('a[href*="-a"][href*=".html"]')) {
          const h = a.getAttribute('href') || '';
          if (/-a\d+\.html$/.test(h)) return h;
        }
        return null;
      });
      if (!productUrl) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }
      const fullUrl = productUrl.startsWith('http') ? productUrl : 'https://geizhals.eu' + productUrl;
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await _humanDelay(500, 1000);
      const data = await extractProductDetail(page);
      data.sourceUrl = fullUrl;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
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
  if (!parsed.hostname.endsWith('geizhals.eu') && !parsed.hostname.endsWith('geizhals.at') && !parsed.hostname.endsWith('geizhals.de')) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Only geizhals.eu domains are allowed.' }));
    return;
  }

  try {
    console.log(`  [${requestCount + 1}] → ${targetUrl}`);
    const { html, status } = await fetchWithPuppeteer(targetUrl);
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

server.listen(PORT, async () => {
  console.log(`\n  ⚡ Qor AI Scraper Proxy v4.0 — http://localhost:${PORT}`);
  console.log(`  🖥️  Admin Panel: http://localhost:${PORT}/`);
  console.log(`  🛡️  puppeteer-extra-plugin-stealth enabled`);
  console.log(`  📡 STRICT selectors — NO sidebar/carousel links`);
  console.log(`  🐢 SEQUENTIAL scraping — parallel disabled\n`);
  try {
    await getBrowser();
    console.log(`  ✅ Proxy ready. Test: http://localhost:${PORT}/health\n`);
  } catch (err) {
    console.error(`  ❌ Chrome could not be started: ${err.message}\n`);
  }
});

process.on('SIGINT', async () => {
  console.log('\n  Stopping proxy...');
  if (browser) await browser.close().catch(() => {});
  process.exit();
});
process.on('SIGTERM', async () => {
  if (browser) await browser.close().catch(() => {});
  process.exit();
});
