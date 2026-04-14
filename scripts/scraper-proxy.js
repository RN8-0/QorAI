/**
 * Compair Scraper Proxy — Stealth Edition v3.0
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
const puppeteerCore = require(path.join(rootDir, 'node_modules', 'puppeteer-core'));

puppeteerExtra.use(StealthPlugin());
// Use puppeteer-core as the underlying engine
puppeteerExtra.use(require(path.join(rootDir, 'node_modules', 'puppeteer-extra-plugin-stealth'))());

const PORT = parseInt(process.argv[2]) || 3456;
const ALLOWED_ORIGINS = [
  'https://z1221ae58okr865xdquykps8.46.225.95.201.sslip.io',
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
let sessionCookies = null; // Cached cookies from epey.com homepage
const currentUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;

  const chromePath = findChromePath();
  if (!chromePath) {
    throw new Error('Chrome/Edge bulunamadı. Lütfen Chrome\'u yükleyin.');
  }

  console.log(`  🚀 Chrome başlatılıyor: ${chromePath}`);
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
      '--lang=tr-TR,tr',
      // Realistic GPU flags (not disabling GPU helps look more real)
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
    ],
    defaultViewport: { width: 1366, height: 768 },
    ignoreHTTPSErrors: true,
  });

  console.log('  ✅ Chrome başlatıldı (Stealth modu aktif)');

  // Pre-warm: visit epey.com homepage to get valid session cookies
  console.log('  🍪 epey.com oturumu başlatılıyor...');
  try {
    const warmPage = await browser.newPage();
    await warmPage.setUserAgent(currentUA);
    await warmPage.setExtraHTTPHeaders({
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'DNT': '1',
    });
    await warmPage.goto('https://www.epey.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await _humanDelay(1000, 2500);
    sessionCookies = await warmPage.cookies();
    await warmPage.close();
    console.log(`  ✅ Oturum hazır (${sessionCookies.length} cookie)`);
  } catch (e) {
    console.warn(`  ⚠️ Ön yükleme başarısız (önemli değil): ${e.message}`);
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
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
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
      title.includes('Please Wait');

    if (isChallenge) {
      console.log(`  ⏳ Bot koruması tespit edildi, bekleniyor...`);
      await page.waitForFunction(
        () => !document.title.includes('Just a moment') &&
              !document.title.includes('Checking') &&
              !document.title.includes('Please Wait'),
        { timeout: 20000 }
      ).catch(() => {});
      await _humanDelay(2000, 4000);
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
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Target-URL');
  res.setHeader('Access-Control-Expose-Headers', 'X-Response-URL, X-Status-Code');
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  setCORSHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

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

  // Get target URL
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const targetUrl = req.headers['x-target-url'] || urlObj.searchParams.get('url');

  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'URL eksik. ?url=... veya X-Target-URL header kullanın' }));
    return;
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Geçersiz URL' }));
    return;
  }

  if (!parsed.hostname.endsWith('epey.com')) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Sadece epey.com izinlidir' }));
    return;
  }

  try {
    console.log(`  [${requestCount + 1}] → ${targetUrl}`);
    const { html, status } = await fetchWithPuppeteer(targetUrl);

    if (!html || status === 404) {
      res.setHeader('X-Status-Code', '404');
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Sayfa bulunamadı (404)' }));
      return;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Status-Code', String(status));
    res.writeHead(200);
    res.end(html);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy hatası: ' + err.message }));
  }
});

server.listen(PORT, async () => {
  console.log(`\n  ⚡ Compair Scraper Proxy v3.0 (Stealth) — http://localhost:${PORT}`);
  console.log(`  🛡️  puppeteer-extra-plugin-stealth aktif`);
  console.log(`  📡 İstekler KENDİ IP adresinizi kullanır`);
  console.log(`  🔒 Sadece epey.com\'a izin verilir\n`);
  try {
    await getBrowser();
    console.log(`  ✅ Proxy hazır! Test: http://localhost:${PORT}/health\n`);
  } catch (err) {
    console.error(`  ❌ Chrome başlatılamadı: ${err.message}`);
    console.error(`  Chrome veya Edge yüklü olduğundan emin olun.\n`);
  }
});

process.on('SIGINT', async () => {
  console.log('\n  Proxy durduruluyor...');
  if (browser) await browser.close().catch(() => {});
  process.exit();
});
process.on('SIGTERM', async () => {
  if (browser) await browser.close().catch(() => {});
  process.exit();
});
