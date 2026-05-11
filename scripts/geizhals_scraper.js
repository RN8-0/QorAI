/**
 * geizhals.eu → PocketBase Scraper
 * Scrapes: name, price, specs (comma-split), images → PB
 */
const axios = require('axios');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const envFile = fs.readFileSync(path.join(__dirname, '..', 'migration', '.env'), 'utf8');
const env = Object.fromEntries(envFile.split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
}));
const PB = env.POCKETBASE_URL;
const FIELD = 'productImages';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const rootDir = path.resolve(__dirname, '..');
const pptr = require(path.join(rootDir, 'node_modules', 'puppeteer-extra'));
pptr.use(require(path.join(rootDir, 'node_modules', 'puppeteer-extra-plugin-stealth'))());
const chromePaths = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
const chromePath = chromePaths.find(p => { try { return fs.existsSync(p); } catch { return false; } });

const PRODUCTS = ['iPhone 16', 'Samsung Galaxy S25 Ultra', 'Xiaomi 14', 'Google Pixel 9 Pro', 'OnePlus 12', 'Sony Xperia 1 VI', 'Nothing Phone 2', 'iPad Air M2', 'Samsung Galaxy Tab S9', 'Apple Watch Ultra 2', 'MacBook Air M4', 'Dell XPS 15', 'RTX 5090', 'PlayStation 5', 'AirPods Pro 3', 'Samsung 990 Pro', 'LG C4 OLED', 'Intel i9-14900K', 'AMD Ryzen 7 9800X3D', 'Nintendo Switch 2', 'Xiaomi 15', 'Samsung Galaxy S24', 'iPhone 15 Pro', 'Google Pixel 8', 'OnePlus 11', 'Xiaomi 13', 'Honor Magic 6', 'Motorola Edge 50', 'Asus ROG Phone 9', 'Nothing Phone 3', 'Huawei P70', 'Oppo Find X8', 'Realme GT 7', 'Vivo X100', 'Samsung A55', 'Xiaomi Redmi Note 14', 'Xiaomi Poco X7', 'OnePlus Nord 4', 'Samsung M55', 'Realme 13 Pro', 'Samsung Tab S10', 'Xiaomi Pad 7', 'Lenovo Tab P12', 'Samsung Watch 7', 'Huawei Watch GT 5', 'Garmin Venu 4', 'Fitbit Charge 7', 'Apple Watch SE 3', 'Xiaomi Band 9', 'Samsung Buds 3', 'Sony WH-1000XM6', 'JBL Tour Pro 3', 'Bose QC Ultra', 'Sony WF-1000XM6', 'Canon EOS R6 III', 'Sony A7 V', 'Nikon Z6 III', 'GoPro Hero 14', 'DJI Mini 5 Pro', 'DJI Osmo Pocket 4', 'Kindle Scribe 2', 'Samsung Odyssey G9', 'LG UltraGear 45', 'Asus ROG Swift OLED', 'Dell UltraSharp 32', 'Razer Blade 16', 'MSI Titan 18', 'ASUS Zenbook 14', 'HP Spectre x360', 'Lenovo Yoga 9i', 'Framework 16', 'Surface Pro 11', 'Apple Mac Mini M4', 'Intel NUC 14', 'Corsair K70', 'Logitech G915', 'Razer DeathAdder V4', 'SteelSeries Arctis Nova Pro', 'Elgato Stream Deck', 'Samsung T9 SSD', 'WD Black SN850X', 'Crucial T700', 'Seagate FireCuda', 'Corsair RM1000x', 'NZXT H7', 'Fractal North', 'Lian Li O11', 'Noctua NH-D16', 'Arctic Liquid Freezer III', 'ASUS ROG Strix X870E', 'MSI MAG Z890', 'Gigabyte Aorus Master', 'ASRock Taichi', 'TP-Link Archer BE900', 'Netgear Orbi 970', 'Synology DS923+', 'QNAP TS-464', 'Ubiquiti Dream Machine SE'];
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let pbTok = null;
async function pbAuth() {
  const r = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }) });
  pbTok = (await r.json()).token;
}
async function pbFetch(p, o = {}) {
  if (!pbTok) await pbAuth();
  let r = await fetch(`${PB}${p}`, { ...o, headers: { ...o.headers, 'Authorization': pbTok } });
  if (r.status === 401) { await pbAuth(); r = await fetch(`${PB}${p}`, { ...o, headers: { ...o.headers, 'Authorization': pbTok } }); }
  return r;
}

async function searchGeizhals(browser, query) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' });
  await page.setRequestInterception(true);
  page.on('request', req => { if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort(); else req.continue(); });
  await page.goto('https://geizhals.eu/?fs=' + encodeURIComponent(query), { waitUntil: 'domcontentloaded', timeout: 20000 });
  try { await page.waitForSelector('a[href*="-a"][href*=".html"]', { timeout: 10000 }); } catch { await page.close(); return null; }
  const url = await page.evaluate(() => {
    for (const a of document.querySelectorAll('a[href*="-a"][href*=".html"]')) {
      const h = a.getAttribute('href') || '';
      if (h.match(/-a\d+\.html$/)) return h;
    }
    return null;
  });
  await page.close();
  return url ? (url.startsWith('http') ? url : 'https://geizhals.eu' + url) : null;
}

async function scrapeProduct(browser, url) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' });
  await page.setRequestInterception(true);
  page.on('request', req => { if (['image','stylesheet','font','media'].includes(req.resourceType())) req.abort(); else req.continue(); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 600)); // faster, no need to wait for price widgets

  const data = await page.evaluate(() => {
    const r = { name: '', imgs: [], specs: {} };
    r.name = (document.querySelector('h1')?.textContent || '').trim();
    const seen = new Set();
    document.querySelectorAll('img[src*="gzhls.at/pix/"]').forEach(img => {
      const s = img.src || '';
      if (s.includes('-n.webp')) { const h = s.split('/').pop()?.split('-')[0] || ''; if (!seen.has(h)) { seen.add(h); r.imgs.push(s); } }
    });
    // ALL spec grids (not just the first one!)
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
  await page.close();
  return data;
}

async function downloadImage(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    return await sharp(Buffer.from(ab)).resize(800, null, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch { return null; }
}

async function saveToPB(product, imgBuf, category) {
  const slug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
  const body = {
    name: product.name, brand: '', category: category, subcategory: '', imageURL: '',
    slug: slug,
    price_raw: 0,
    specs: product.specs,
    lastUpdated: new Date().toISOString(), isActive: true, source: 'geizhals.eu',
  };
  const cr = await pbFetch('/api/collections/products/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await cr.json();
  if (!cr.ok) { console.log('  PB create err:', JSON.stringify(data).substring(0, 150)); return null; }
  const pid = data.id;
  console.log('  Created:', pid.substring(0, 12));

  if (imgBuf) {
    const b = '----GH' + Date.now(); const crlf = '\r\n';
    const h = `--${b}${crlf}Content-Disposition: form-data; name="${FIELD}"; filename="geizhals.webp"${crlf}Content-Type: image/webp${crlf}${crlf}`;
    const mb = Buffer.concat([Buffer.from(h), imgBuf, Buffer.from(`${crlf}--${b}--${crlf}`)]);
    const ir = await pbFetch(`/api/collections/products/records/${pid}`, { method: 'PATCH', headers: { 'Content-Type': `multipart/form-data; boundary=${b}` }, body: mb });
    if (ir.ok) {
      const rec = await ir.json();
      const rf = rec[FIELD] || [];
      const files = Array.isArray(rf) ? rf : [rf];
      const up = files.find(f => f?.includes('.webp'));
      if (up) {
        const imgUrl = `${PB}/api/files/products/${pid}/${up}`;
        await pbFetch(`/api/collections/products/records/${pid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageURL: imgUrl, imageUrl: imgUrl, images: [imgUrl] }) });
      }
    }
  }
  return pid;
}

function guessCategory(name) {
  const n = name.toLowerCase();
  if (n.includes('watch') || n.includes('ultra')) return 'smartwatches';
  if (n.includes('ipad') || n.includes('tab')) return 'tablets';
  return 'smartphones';
}

(async () => {
  if (!chromePath) { console.log('Chrome yok!'); process.exit(1); }
  console.log('geizhals.eu → PocketBase\n' + '='.repeat(50));
  const browser = await pptr.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled', '--lang=de-DE'], defaultViewport: { width: 1366, height: 768 } });

  for (let i = 0; i < PRODUCTS.length; i++) {
    const q = PRODUCTS[i];
    console.log(`\n[${i + 1}/${PRODUCTS.length}] ${q}`);
    try {
      const url = await searchGeizhals(browser, q);
      if (!url) { console.log('  Bulunamadi'); continue; }
      console.log('  Scraping:', url.substring(0, 70));
      const p = await scrapeProduct(browser, url);
      console.log('  Name:', p.name.substring(0, 60));
      console.log('  Images:', p.imgs.length, 'Specs:', Object.keys(p.specs).length);

      if (p.imgs[0]) { buf = await downloadImage(p.imgs[0]); }
      else { console.log('  (no img, saving specs only)'); }

      const cat = guessCategory(p.name);
      const pid = await saveToPB(p, buf, cat);
      if (pid) console.log('  ⭐', pid.substring(0, 10));
    } catch (e) { console.log('  ❌', e.message.substring(0, 60)); }
    await sleep(1500 + Math.random() * 1000);
  }

  await browser.close();
  console.log('\nDone ✅ Admin paneli yenile');
})();
