/**
 * Qor AI — Versus.com Image Bot
 *
 * imageURL alanı boş veya epey.com olan ürünlere versus.com'dan
 * og:image meta tag'i üzerinden görsel çekip PB file storage'a yükler.
 *
 * Kullanım:
 *   node scripts/versus_image_bot.js [--dry-run] [--limit=5]
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// ─── Config ─────────────────────────────────────────────────────────────────

const envFile = fs.readFileSync(path.join(__dirname, '..', 'migration', '.env'), 'utf8');
const env = Object.fromEntries(
  envFile.split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

const PB_URL = env.POCKETBASE_URL;
const PB_EMAIL = env.POCKETBASE_ADMIN_EMAIL;
const PB_PASS = env.POCKETBASE_ADMIN_PASSWORD;

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '5', 10);
const FIELD_NAME = 'productImages';
const MAX_WIDTH = 800;

// ─── Logging ────────────────────────────────────────────────────────────────

function log(msg, lvl = 'info') {
  const ts = new Date().toISOString().slice(11, 19);
  const p = { info: 'ℹ️', ok: '✅', warn: '⚠️', err: '❌' }[lvl] || '  ';
  console.log(`[${ts}] ${p} ${msg}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── PB Auth ────────────────────────────────────────────────────────────────

let pbToken = null;

async function pbAuth() {
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASS }),
  });
  const data = await res.json();
  pbToken = data.token;
  return pbToken;
}

async function pbFetch(urlPath, opts = {}) {
  if (!pbToken) await pbAuth();
  let res = await fetch(`${PB_URL}${urlPath}`, { ...opts, headers: { ...opts.headers, 'Authorization': pbToken } });
  if (res.status === 401) { await pbAuth(); res = await fetch(`${PB_URL}${urlPath}`, { ...opts, headers: { ...opts.headers, 'Authorization': pbToken } }); }
  return res;
}

// ─── Slugify ────────────────────────────────────────────────────────────────

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-+/g, '-');
}

// ─── Versus.com Scraper (Puppeteer Stealth) ─────────────────────────────────

let puppeteerBrowser = null;
let puppeteerPage = null;

async function getPuppeteer() {
  if (puppeteerBrowser?.isConnected()) return;

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
  if (!chromePath) throw new Error('Chrome/Edge bulunamadi');

  puppeteerBrowser = await puppeteerExtra.launch({
    executablePath: chromePath, headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled', '--lang=tr-TR,tr'],
    defaultViewport: { width: 1366, height: 768 },
    ignoreHTTPSErrors: true,
  });

  puppeteerPage = await puppeteerBrowser.newPage();
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  await puppeteerPage.setUserAgent(ua);
  await puppeteerPage.setExtraHTTPHeaders({ 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8' });

  // Block unnecessary resources
  await puppeteerPage.setRequestInterception(true);
  puppeteerPage.on('request', req => {
    const t = req.resourceType();
    if (['image', 'stylesheet', 'font', 'media'].includes(t)) req.abort();
    else req.continue();
  });
}

/**
 * Fetch versus.com page via Puppeteer and extract og:image.
 * Strategy: Direct slug URL → extract og:image meta tag.
 * Slug: lowercase, only a-z0-9 and hyphens.
 * Returns { imageUrl, sourceUrl } or null.
 */
async function extractVersusImage(productName, brand) {
  try {
    await getPuppeteer();

    // Generate clean slug: strip brand prefix from name, remove specs in parens
    let cleanName = productName;
    if (brand && cleanName.toLowerCase().startsWith(brand.toLowerCase())) {
      cleanName = cleanName.substring(brand.length).trim();
    }
    // Also strip common brand typos/prefixes
    cleanName = cleanName.replace(/^xiaom\b/i, '').trim();
    // Remove parenthetical specs like "(42 mm)", "(512 GB)", "[2024]" etc
    cleanName = cleanName.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

    // If name became empty after stripping, use original
    if (!cleanName) cleanName = productName;

    const slug = slugify((brand ? brand + ' ' : '') + cleanName);
    if (!slug || slug.length < 2) return null;

    const url = 'https://versus.com/tr/' + slug;
    log(`  Slug: ${url.substring(0, 80)}`);

    try {
      await puppeteerPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    } catch {
      return null;
    }

    // Extract the real product image (not og:image banner)
    // versus.com loads product images as: images.versus.io/objects/{slug}.front.master.{ts}.jpg
    const imageUrl = await puppeteerPage.evaluate(() => {
      // Find img with .front.master. in src (high-res product render)
      const imgs = [...document.querySelectorAll('img')];
      for (const img of imgs) {
        if (img.src && img.src.includes('.front.master.')) {
          return img.src;
        }
      }
      // Fallback: any images.versus.io/objects/ image > 200px wide
      for (const img of imgs) {
        if (img.src && img.src.includes('images.versus.io/objects/') && img.width > 200) {
          return img.src;
        }
      }
      return null;
    });

    if (imageUrl) {
      log(`  Gorsel: ${imageUrl.substring(0, 80)}...`, 'ok');
      return { imageUrl, sourceUrl: puppeteerPage.url() };
    }

    return null;
  } catch (e) {
    log(`  Versus hatasi: ${e.message}`, 'err');
    return null;
  }
}

// ─── Image Processing ───────────────────────────────────────────────────────

async function processImage(imageUrl) {
  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;

    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // WebP formatinda, max 800px genislik
    const processed = await sharp(buffer)
      .resize(MAX_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    return { buffer: processed, contentType: 'image/webp' };
  } catch (e) {
    log(`  Islenemedi: ${e.message}`, 'warn');
    return null;
  }
}

// ─── PB Upload ──────────────────────────────────────────────────────────────

async function uploadToPB(productId, imageBuffer) {
  const filename = 'versus.webp';
  const boundary = '----VsBot' + Date.now();
  const CRLF = '\r\n';

  const header = '--' + boundary + CRLF +
    'Content-Disposition: form-data; name="' + FIELD_NAME + '"; filename="' + filename + '"' + CRLF +
    'Content-Type: image/webp' + CRLF + CRLF;
  const footer = CRLF + '--' + boundary + '--' + CRLF;

  const body = Buffer.concat([Buffer.from(header), imageBuffer, Buffer.from(footer)]);

  const res = await pbFetch(`/api/collections/products/records/${productId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
    body,
  });

  if (!res.ok) throw new Error(`Upload ${res.status}`);

  const record = await res.json();
  const rawFiles = record[FIELD_NAME] || [];
  const files = Array.isArray(rawFiles) ? rawFiles : [rawFiles];
  const uploaded = files.find(f => f?.includes('.webp'));
  if (!uploaded) throw new Error('Dosya yok');

  const newUrl = `${PB_URL}/api/files/products/${productId}/${uploaded}`;

  // Update imageURL/images
  await pbFetch(`/api/collections/products/records/${productId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageURL: newUrl, imageUrl: newUrl, images: [newUrl] }),
  });

  return newUrl;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════');
  console.log('  Qor AI — Versus Image Bot');
  console.log('═══════════════════════════════');
  log(`Limit: ${LIMIT} | Dry-run: ${DRY_RUN ? 'EVET' : 'HAYIR'}`);

  let processed = 0, success = 0, skipped = 0, error = 0;

  while (processed < LIMIT) {
    // Prioritize known vs.com brands that have good coverage
    const vsBrands = ['Apple', 'Samsung', 'Xiaomi', 'Oppo', 'OnePlus', 'Google', 'Nothing', 'Huawei', 'Realme', 'Asus', 'Lenovo', 'Motorola', 'Nokia', 'Sony', 'Honor'];

    for (const brand of vsBrands) {
      if (processed >= LIMIT) break;
      // Only smartphones — versus.com doesn't have other categories
      const catFilter = encodeURIComponent(`brand = '${brand}' && category = 'smartphones'`);
      const res = await pbFetch(`/api/collections/products/records?perPage=10&sort=-updated&filter=${catFilter}`);
      const data = await res.json();

      const targets = data.items.filter(p => {
        const img = (p.imageURL || p.imageUrl || '').trim();
        if (!img) return true;
        if (img.includes('epey.com')) return true;
        if (img.includes('resim.epey')) return true;
        return false;
      });

      if (targets.length === 0) continue;

      for (const product of targets) {
      if (processed >= LIMIT) break;

      const name = product.name || '';
      const brand = product.brand || '';
      const fullName = brand ? `${brand} ${name}` : name;
      const oldImg = (product.imageURL || product.imageUrl || '') || '(bos)';
      processed++;

      log(`[${processed}/${LIMIT}] ${fullName.substring(0, 60)}`);
      log(`  Eski: ${oldImg.substring(0, 60)}`);

      if (DRY_RUN) {
        const found = await extractVersusImage(name, brand);
        if (found) log(`  [DRY-RUN] Bulundu: ${found.imageUrl.substring(0, 60)}`, 'ok');
        else log(`  [DRY-RUN] Bulunamadi`, 'warn');
        success++;
        await sleep(3000 + Math.random() * 2000);
        continue;
      }

      // Gercek mod
      const found = await extractVersusImage(name, brand);
      if (!found) {
        log(`  Bulunamadi, atlaniyor`, 'warn');
        skipped++;
        await sleep(3000 + Math.random() * 2000);
        continue;
      }

      const processedImg = await processImage(found.imageUrl);
      if (!processedImg) {
        log(`  Indirilemedi`, 'err');
        error++;
        await sleep(3000 + Math.random() * 2000);
        continue;
      }

      const sizeKb = Math.round(processedImg.buffer.length / 1024);
      log(`  WebP: ${sizeKb} KB`);

      try {
        const newUrl = await uploadToPB(product.id, processedImg.buffer);
        log(`  Yuklendi ✅`, 'ok');
        success++;
      } catch (e) {
        log(`  Upload hatasi: ${e.message}`, 'err');
        error++;
      }

      await sleep(3000 + Math.random() * 2000);
    }
    } // end for brand loop
  } // end while

  if (puppeteerBrowser) await puppeteerBrowser.close().catch(() => {});

  console.log('');
  console.log('═══════════════════════════════');
  console.log(`  Tamamlandi`);
  console.log(`  Basarili: ${success} | Hata: ${error} | Atlanan: ${skipped}`);
  console.log('═══════════════════════════════');
}

main().catch(e => {
  console.error('FATAL:', e.message);
  if (puppeteerBrowser) puppeteerBrowser.close().catch(() => {});
  process.exit(1);
});
