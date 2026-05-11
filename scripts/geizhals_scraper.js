/**
 * geizhals.eu Scraper — 10 Ürün Testi
 * Puppeteer search + axios product detail + comma-split specs
 */
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Puppeteer setup (from existing scraper-proxy structure)
const rootDir = path.resolve(__dirname, '..');
const puppeteerExtra = require(path.join(rootDir, 'node_modules', 'puppeteer-extra'));
const StealthPlugin = require(path.join(rootDir, 'node_modules', 'puppeteer-extra-plugin-stealth'));
puppeteerExtra.use(StealthPlugin());

const chromePaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chromePath = chromePaths.find(p => { try { return fs.existsSync(p); } catch { return false; } });

// Product names to search for
const PRODUCTS = [
  'iPhone 16', 'Samsung Galaxy S25 Ultra', 'Xiaomi 14', 'Google Pixel 9 Pro',
  'OnePlus 12', 'Sony Xperia 1 VI', 'Nothing Phone 2', 'iPad Air M2',
  'Samsung Galaxy Tab S9', 'Apple Watch Ultra 2'
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchGeizhals(browser, query) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' });

  // Block images/fonts for speed
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  const searchUrl = 'https://geizhals.eu/?fs=' + encodeURIComponent(query);
  console.log('  Searching:', searchUrl.substring(0, 80));
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Wait for product list to render
  try {
    await page.waitForSelector('a[href*="-a"][href*=".html"]', { timeout: 10000 });
  } catch {
    console.log('  No product links found on search page');
    await page.close();
    return null;
  }

  // Extract first product URL
  const productUrl = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="-a"][href*=".html"]');
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      if (href.match(/-a\d+\.html$/)) return href;
    }
    return null;
  });

  await page.close();
  return productUrl ? (productUrl.startsWith('http') ? productUrl : 'https://geizhals.eu' + productUrl) : null;
}

async function scrapeProduct(browser, url) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' });

  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
    else req.continue(); // Allow images now!
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Wait for specs to load
  await new Promise(r => setTimeout(r, 3000));

  const data = await page.evaluate(() => {
    const result = { name: '', price: '', images: [], specs: [] };

    // Name
    result.name = (document.querySelector('h1')?.textContent || document.title || '').trim();

    // Price — .gh_price span
    const priceEl = document.querySelector('.gh_price');
    if (priceEl) {
      result.price = priceEl.textContent.trim().replace(/[^0-9,.]/g, '').replace(',', '.');
    }

    // Images — main product images (unique by hash)
    const seen = new Set();
    document.querySelectorAll('img[src*="gzhls.at/pix/"]').forEach(img => {
      const src = img.src || '';
      if (src.includes('-n.webp')) {
        const hash = src.split('/').pop()?.split('-')[0] || '';
        if (!seen.has(hash)) { seen.add(hash); result.images.push(src); }
      }
    });

    // Specs — dl.specs-grid with div.specs-grid__item > dt/dd
    const specGrid = document.querySelector('dl.specs-grid');
    if (specGrid) {
      specGrid.querySelectorAll('.specs-grid__item, dt').forEach(row => {
        // Try to find key-value pair
        const keyEl = row.querySelector('dt') || row.querySelector('.specs-grid__label');
        const valEl = row.querySelector('dd') || row.querySelector('.specs-grid__value');
        // Or if the row itself is a dt/dd pair
        const key = keyEl ? keyEl.textContent.trim() : (row.tagName === 'DT' ? row.textContent.trim() : '');
        const val = valEl ? valEl.textContent.trim().replace(/\s+/g, ' ') : (row.tagName === 'DD' ? row.textContent.trim().replace(/\s+/g, ' ') : '');
        if (key && val && key.length > 1 && key.length < 80 && val.length < 500) {
          result.specs.push({ key, val });
        }
      });
    }

    return result;
  });

  await page.close();
  return data;
}

(async () => {
  if (!chromePath) { console.log('Chrome/Edge bulunamadi!'); process.exit(1); }

  console.log('geizhals.eu Scraper — Test');
  console.log('='.repeat(60));

  const browser = await puppeteerExtra.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled', '--lang=de-DE'],
    defaultViewport: { width: 1366, height: 768 },
  });

  let ok = 0, fail = 0;

  for (let i = 0; i < PRODUCTS.length; i++) {
    const query = PRODUCTS[i];
    console.log(`\n[${i + 1}/${PRODUCTS.length}] Araniyor: ${query}`);

    try {
      const url = await searchGeizhals(browser, query);
      if (!url) { fail++; console.log('  URL bulunamadi'); await sleep(3000); continue; }

      console.log('  URL:', url.substring(0, 80));
      const product = await scrapeProduct(browser, url);

      console.log('  İsim:', product.name.substring(0, 70));
      console.log('  Fiyat:', product.price ? '€' + product.price : '?');
      console.log('  Görsel:', product.images.length, 'adet');
      if (product.images[0]) console.log('    ', product.images[0].substring(0, 80));
      console.log('  Spesifikasyonlar (' + product.specs.length + '):');
      product.specs.slice(0, 20).forEach(s => {
        const valLines = s.val.split(/,\s*/).filter(Boolean);
        if (valLines.length > 1) {
          console.log(`    ${s.key}:`);
          valLines.forEach(l => console.log('      • ' + l));
        } else {
          console.log(`    ${s.key}: ${s.val.substring(0, 120)}`);
        }
      });
      if (product.specs.length > 20) console.log(`    ... ve ${product.specs.length - 20} daha`);
      ok++;
    } catch (e) {
      console.log('  HATA:', e.message.substring(0, 80));
      fail++;
    }

    await sleep(3000 + Math.random() * 2000);
  }

  await browser.close();
  console.log('\n' + '='.repeat(60));
  console.log(`Bitti: ${ok} basarili, ${fail} hatali`);
})();
