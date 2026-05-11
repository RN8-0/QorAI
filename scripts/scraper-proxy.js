/**
 * Qor AI Scraper Proxy — Stealth Edition v3.0
 *
 * Uses puppeteer-extra + StealthPlugin to bypass Cloudflare/bot protection.
 * Runs on the admin's machine — requests use YOUR own IP address.
 *
 * Usage:
 *   node scripts/scraper-proxy.js [port]
 *   Default port: 3456
 *
 * The admin panel connects to http://localhost:3456
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

// Resolve puppeteer-extra from project root (not scripts/node_modules)
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

// Realistic user agents rotated per session
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

// Find Chrome executable path automatically
function findChromePath() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
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
let sessionCookies = null; // Cached cookies from geizhals.eu homepage
const currentUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;

  const chromePath = findChromePath();
  if (!chromePath) {
    throw new Error('Chrome or Edge was not found. Please install Chrome or Edge.');
  }

  console.log(`  🚀 Starting Chrome: ${chromePath}`);
  console.log(`  🎭 User-Agent: ${currentUA.substring(0, 60)}...`);

  browser = await puppeteerExtra.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1366,768',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--disable-notifications',
      '--lang=de-DE,de',
      // Realistic GPU flags (not disabling GPU helps look more real)
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
    ],
    defaultViewport: { width: 1366, height: 768 },
    ignoreHTTPSErrors: true,
  });

  console.log('  ✅ Chrome started with stealth mode enabled');

  // Pre-warm: visit geizhals.eu homepage to get valid session cookies
  console.log('  🍪 Preparing geizhals.eu session...');
  try {
    const warmPage = await browser.newPage();
    await warmPage.setUserAgent(currentUA);
    await warmPage.setExtraHTTPHeaders({
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'DNT': '1',
    });
    await warmPage.goto('https://geizhals.eu/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await _humanDelay(1000, 2500);
    sessionCookies = await warmPage.cookies();
    await warmPage.close();
    console.log(`  ✅ Session ready (${sessionCookies.length} cookies)`);
  } catch (e) {
    console.warn(`  ⚠️ Preload failed, continuing anyway: ${e.message}`);
  }

  return browser;
}

async function getPage() {
  const b = await getBrowser();

  // Refresh page every 80 requests to keep session clean
  if (activePage && !activePage.isClosed() && requestCount % 80 !== 0) {
    return activePage;
  }
  if (activePage && !activePage.isClosed()) {
    await activePage.close().catch(() => {});
  }

  activePage = await b.newPage();
  await activePage.setUserAgent(currentUA);
  await activePage.setExtraHTTPHeaders({
    'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'DNT': '1',
    'Upgrade-Insecure-Requests': '1',
  });

  // Restore session cookies
  if (sessionCookies && sessionCookies.length > 0) {
    await activePage.setCookie(...sessionCookies);
  }

  // Block unnecessary resources to speed up scraping
  await activePage.setRequestInterception(true);
  activePage.on('request', (req) => {
    const type = req.resourceType();
    if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  return activePage;
}

// Human-like random delay
function _humanDelay(min = 500, max = 1500) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise(r => setTimeout(r, ms));
}

// Simulate human scroll
async function _humanScroll(page) {
  try {
    await page.evaluate(() => {
      window.scrollBy(0, Math.floor(Math.random() * 300 + 100));
    });
    await _humanDelay(200, 600);
  } catch {}
}

async function fetchWithPuppeteer(url) {
  const page = await getPage();
  requestCount++;

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    const status = response ? response.status() : 0;

    // Handle Cloudflare challenge
    const title = await page.title();
    const isChallenge = title.includes('Just a moment') ||
      title.includes('Checking') ||
      title.includes('DDoS-Guard') ||
      title.includes('Please Wait') ||
      title.includes('Nur einen Moment') ||
      title.includes('Sichere Verbindung') ||
      title.includes('Sichere Verbindung wird überprüft');

    if (isChallenge) {
      console.log(`  ⏳ Bot korumasi tespit edildi: "${title.substring(0, 50)}", 5sn bekleniyor...`);
      // Short wait then return challenge page HTML - let caller handle it
      await _humanDelay(5000, 8000);
    }

    // Simulate human interaction
    await _humanScroll(page);

    // Handle 404
    if (status === 404) {
      return { html: null, status: 404 };
    }

    const html = await page.content();
    return { html, status: status || 200 };
  } catch (err) {
    console.error(`  ❌ Fetch hatası: ${err.message}`);
    throw err;
  }
}

function setCORSHeaders(res, origin) {
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || '');
  const allowed = !origin || origin === 'null' || isLocal || ALLOWED_ORIGINS.includes(origin) ? (origin && origin !== 'null' ? origin : '*') : ALLOWED_ORIGINS[0];
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Target-URL');
  res.setHeader('Access-Control-Expose-Headers', 'X-Response-URL, X-Status-Code');
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';

  if (req.method === 'OPTIONS') {
    setCORSHeaders(res, origin);
    res.writeHead(204);
    res.end();
    return;
  }

  // ── Admin Panel Static Files ──
  if (req.url === '/' || req.url === '/admin' || req.url.startsWith('/admin/') || req.url.startsWith('/js/') || req.url.startsWith('/css/') || req.url === '/index.html' || req.url.match(/\.(html|js|css|png|jpg|svg|ico|json|bat|txt)$/)) {
    let filePath = req.url;
    // Remove /admin prefix if present
    if (filePath.startsWith('/admin/')) filePath = filePath.slice(6);
    else if (filePath === '/admin') filePath = '/index.html';
    if (filePath === '/') filePath = '/index.html';
    // Remove leading slash and query string
    filePath = filePath.split('?')[0].replace(/^\//, '');
    const fullPath = path.join(ADMIN_DIR, filePath);
    // Security: prevent directory traversal
    if (!fullPath.startsWith(ADMIN_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.end(fs.readFileSync(fullPath));
        return;
      }
    } catch {}
    // Fall through to other routes
  }

  setCORSHeaders(res, origin);

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      version: '3.0.0',
      engine: 'puppeteer-extra-stealth',
      requests: requestCount,
      browserConnected: browser ? browser.isConnected() : false,
      hasCookies: sessionCookies ? sessionCookies.length : 0,
      userAgent: currentUA.substring(0, 80),
    }));
    return;
  }

  // Scrape product from geizhals by name
  if (req.url.startsWith('/scrape-product')) {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const productName = urlObj.searchParams.get('name') || '';
    const category = urlObj.searchParams.get('cat') || 'smartphones';
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
          if (h.match(/-a\d+\.html$/)) return h;
        }
        return null;
      });
      if (!productUrl) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); return; }

      const fullUrl = productUrl.startsWith('http') ? productUrl : 'https://geizhals.eu' + productUrl;
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await _humanDelay(500, 1000);

      const data = await page.evaluate(() => {
        const r = { name: '', imgs: [], specs: {} };
        r.name = (document.querySelector('h1')?.textContent || '').trim();
        document.querySelectorAll('img[src*="gzhls.at/pix/"]').forEach(img => {
          const s = img.src || '';
          if (s.includes('-n.webp')) r.imgs.push(s);
        });
        document.querySelectorAll('dl.specs-grid').forEach(grid => {
          grid.querySelectorAll('.specs-grid__item').forEach(item => {
            const k = (item.querySelector('dt') || item).textContent.trim();
            const vEl = item.querySelector('dd');
            let v = vEl ? vEl.textContent.trim().replace(/\s+/g, ' ') : '';
            if (k && v && k.length > 1 && k.length < 80 && v.length < 800) r.specs[k] = v;
          });
        });
        return r;
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const targetUrl = req.headers['x-target-url'] || urlObj.searchParams.get('url');

  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing URL. Use ?url=... or the X-Target-URL header.' }));
    return;
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
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
  console.log(`\n  ⚡ Qor AI Scraper Proxy v3.1 — http://localhost:${PORT}`);
  console.log(`  🖥️  Admin Panel: http://localhost:${PORT}/`);
  console.log(`  🛡️  puppeteer-extra-plugin-stealth enabled`);
  console.log(`  📡 Requests use your local IP address`);
  console.log(`  🔒 Only geizhals.eu domains are allowed\n`);
  try {
    await getBrowser();
    console.log(`  ✅ Proxy ready. Test: http://localhost:${PORT}/health\n`);
  } catch (err) {
    console.error(`  ❌ Chrome could not be started: ${err.message}`);
    console.error(`  Make sure Chrome or Edge is installed.\n`);
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
