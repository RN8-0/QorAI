/**
 * Compair Scraper Proxy — Puppeteer Edition
 * 
 * Uses a real Chrome browser to bypass Cloudflare protection.
 * Runs on the admin's machine using admin's IP address.
 *
 * Usage:
 *   node scripts/scraper-proxy.js [port]
 *   Default port: 3456
 *
 * The admin panel connects to http://localhost:3456
 */

const http = require('http');
const puppeteer = require('puppeteer-core');

const PORT = parseInt(process.argv[2]) || 3456;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ALLOWED_ORIGINS = [
  'https://compair-admin-panel.web.app',
  'https://compair-admin-panel.firebaseapp.com',
  'http://localhost:5000',
  'http://localhost:5002',
  'http://127.0.0.1:5000',
];

let browser = null;
let browserPage = null;
let requestCount = 0;

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  console.log('  🚀 Launching Chrome...');
  browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: { width: 1920, height: 1080 },
  });
  console.log('  ✅ Chrome launched');
  return browser;
}

async function getPage() {
  const b = await getBrowser();
  // Reuse page or create new one every 50 requests to keep memory clean
  if (browserPage && !browserPage.isClosed() && requestCount % 50 !== 0) {
    return browserPage;
  }
  if (browserPage && !browserPage.isClosed()) {
    await browserPage.close().catch(() => {});
  }
  browserPage = await b.newPage();
  // Stealth: override navigator.webdriver
  await browserPage.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
  });
  await browserPage.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );
  await browserPage.setExtraHTTPHeaders({
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  });
  return browserPage;
}

async function fetchWithPuppeteer(url) {
  const page = await getPage();
  requestCount++;
  try {
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    // Wait for Cloudflare challenge if present
    const title = await page.title();
    if (title.includes('Just a moment') || title.includes('Checking')) {
      console.log(`  ⏳ Cloudflare challenge detected, waiting...`);
      await page.waitForFunction(
        () => !document.title.includes('Just a moment') && !document.title.includes('Checking'),
        { timeout: 15000 }
      ).catch(() => {});
      // Extra wait for page to fully load
      await new Promise(r => setTimeout(r, 2000));
    }
    const html = await page.content();
    return html;
  } catch (err) {
    console.error(`  ❌ Fetch error: ${err.message}`);
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
      version: '2.0.0',
      engine: 'puppeteer',
      requests: requestCount,
      browserConnected: browser ? browser.isConnected() : false,
    }));
    return;
  }

  // Get target URL
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const targetUrl = req.headers['x-target-url'] || urlObj.searchParams.get('url');

  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing target URL. Use ?url=... or X-Target-URL header' }));
    return;
  }

  // Only allow epey.com
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid URL' }));
    return;
  }

  if (!parsed.hostname.endsWith('epey.com')) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Only epey.com domains are allowed' }));
    return;
  }

  try {
    console.log(`  → ${targetUrl}`);
    const html = await fetchWithPuppeteer(targetUrl);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Status-Code', '200');
    res.writeHead(200);
    res.end(html);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
  }
});

server.listen(PORT, async () => {
  console.log(`\n  ⚡ Compair Scraper Proxy v2.0 (Puppeteer) on http://localhost:${PORT}`);
  console.log(`  🌐 Uses Chrome browser — bypasses Cloudflare`);
  console.log(`  📡 Requests use YOUR IP address`);
  console.log(`  🔒 Only epey.com domains are allowed\n`);
  // Pre-launch browser
  try {
    await getBrowser();
    console.log(`  Test: http://localhost:${PORT}/health\n`);
  } catch (err) {
    console.error(`  ❌ Failed to launch Chrome: ${err.message}`);
    console.error(`  Make sure Chrome is installed at: ${CHROME_PATH}`);
  }
});

// Cleanup on exit
process.on('SIGINT', async () => {
  if (browser) await browser.close().catch(() => {});
  process.exit();
});
process.on('SIGTERM', async () => {
  if (browser) await browser.close().catch(() => {});
  process.exit();
});
