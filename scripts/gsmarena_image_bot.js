/**
 * Qor AI — GSMArena Image Bot
 *
 * smartphones / tablets kategorisinde görseli eksik veya epey.com olan
 * ürünlere GSMArena'dan saf HTML kazıma ile görsel çeker.
 *
 * Yöntem:
 *   1. Ürün adındaki parantez içlerini temizle
 *   2. GSMArena search API → ilk sonuç linki
 *   3. Ürün sayfası → .specs-photo-main img src
 *   4. İndir → sharp ile WebP 800px → PocketBase'e yükle
 *
 * Kullanım:
 *   node scripts/gsmarena_image_bot.js [--dry-run] [--limit=5]
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const sharp = require('sharp');

// ─── Config ─────────────────────────────────────────────────────────────────

const envFile = fs.readFileSync(path.join(__dirname, '..', 'migration', '.env'), 'utf8');
const env = Object.fromEntries(
  envFile.split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

const PB = env.POCKETBASE_URL;
const PB_EMAIL = env.POCKETBASE_ADMIN_EMAIL;
const PB_PASS = env.POCKETBASE_ADMIN_PASSWORD;

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '5', 10);

const FIELD = 'productImages';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ─── Logging ────────────────────────────────────────────────────────────────

function log(msg, lvl) {
  const ts = new Date().toISOString().slice(11, 19);
  const p = { i: '  ', ok: '✅', w: '⚠️', e: '❌', src: '🔍' }[lvl] || '  ';
  console.log(`[${ts}] ${p} ${msg}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── PB Auth ────────────────────────────────────────────────────────────────

let token = null;
async function pbAuth() {
  const r = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASS }),
  });
  token = (await r.json()).token;
}
async function pbFetch(p, o = {}) {
  if (!token) await pbAuth();
  let r = await fetch(`${PB}${p}`, { ...o, headers: { ...o.headers, 'Authorization': token } });
  if (r.status === 401) { await pbAuth(); r = await fetch(`${PB}${p}`, { ...o, headers: { ...o.headers, 'Authorization': token } }); }
  return r;
}

// ─── Name Cleaning ──────────────────────────────────────────────────────────

/**
 * Remove parenthetical specs: "Apple iPhone 13 Pro Max (1 TB)" → "Apple iPhone 13 Pro Max"
 * Also remove bracket specs: "[2024]", storage/RAM combos etc.
 */
function cleanName(name, brand) {
  let n = String(name).replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').trim();
  // Remove duplicate spaces
  n = n.replace(/\s+/g, ' ').trim();
  // If brand is prefixed, keep it
  return n;
}

// ─── GSMArena Scraper ───────────────────────────────────────────────────────

const axiosInst = axios.create({
  headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
  timeout: 10000,
});

/**
 * Search GSMArena and extract the first product page URL.
 * Returns the product page path (e.g. "apple_iphone_13-11103.php") or null.
 */
async function searchGsmarena(query) {
  try {
    const res = await axiosInst.get('https://www.gsmarena.com/results.php3', {
      params: { sQuickSearch: 'yes', sName: query },
    });
    const $ = cheerio.load(res.data);
    const link = $('.makers a').first().attr('href');
    return link || null;
  } catch (e) {
    log(`GSMArena arama hatası: ${e.message}`, 'w');
    return null;
  }
}

/**
 * Extract the main product image from a GSMArena product page.
 * Returns full image URL or null.
 */
async function extractGsmarenaImage(pageUrl) {
  try {
    const res = await axiosInst.get(pageUrl);
    const $ = cheerio.load(res.data);
    let img = $('.specs-photo-main img').attr('src');

    if (!img) {
      // Fallback: any img inside specs-photo-main div > a
      img = $('.specs-photo-main a img').attr('src');
    }
    if (!img) return null;

    // Ensure full URL
    if (img.startsWith('//')) img = 'https:' + img;
    if (!img.startsWith('http')) img = 'https://www.gsmarena.com/' + img.replace(/^\//, '');
    return img;
  } catch (e) {
    log(`GSMArena sayfa hatası: ${e.message}`, 'w');
    return null;
  }
}

/**
 * Find product image via GSMArena.
 * Tries: "{brand} {name}" first, then "{name}" alone, then "{brand}" alone.
 * Returns { imageUrl } or null.
 */
async function findGsmarenaImage(name, brand) {
  const queries = [];

  // Query 1: Brand + name (most reliable)
  if (brand && name) queries.push(`${brand} ${name}`);
  // Query 2: Name alone
  if (name) queries.push(name);

  for (const q of queries) {
    const link = await searchGsmarena(q);
    if (!link) continue;

    const fullUrl = link.startsWith('http') ? link : `https://www.gsmarena.com/${link}`;
    const img = await extractGsmarenaImage(fullUrl);
    if (img) {
      log(`Bulundu: ${img.substring(0, 80)}`, 'ok');
      return { imageUrl: img };
    }
  }

  return null;
}

// ─── Image Processing ───────────────────────────────────────────────────────

async function processImage(url) {
  try {
    const res = await axiosInst.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': UA },
    });
    if (!res.data || res.data.length < 100) return null;

    const ct = res.headers['content-type'] || '';
    if (!ct.startsWith('image/')) return null;

    const buf = await sharp(Buffer.from(res.data))
      .resize(800, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    return { buffer: buf, contentType: 'image/webp' };
  } catch (e) {
    log(`İndirme/convert hatası: ${e.message}`, 'w');
    return null;
  }
}

// ─── PB Upload ──────────────────────────────────────────────────────────────

async function uploadToPB(productId, buf) {
  const fn = 'gsmarena.webp';
  const b = '----GSM' + Date.now();
  const crlf = '\r\n';
  const h = `--${b}${crlf}Content-Disposition: form-data; name="${FIELD}"; filename="${fn}"${crlf}Content-Type: image/webp${crlf}${crlf}`;
  const body = Buffer.concat([Buffer.from(h), buf, Buffer.from(`${crlf}--${b}--${crlf}`)]);

  const r = await pbFetch(`/api/collections/products/records/${productId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': `multipart/form-data; boundary=${b}` },
    body,
  });
  if (!r.ok) throw new Error(`Upload ${r.status}`);

  const rec = await r.json();
  const rf = rec[FIELD] || [];
  const files = Array.isArray(rf) ? rf : [rf];
  const up = files.find(f => f?.includes('.webp'));
  if (!up) throw new Error('Dosya yok');

  const url = `${PB}/api/files/products/${productId}/${up}`;
  await pbFetch(`/api/collections/products/records/${productId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageURL: url, imageUrl: url, images: [url] }),
  });
  return url;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════');
  console.log('  Qor AI — GSMArena Image Bot');
  console.log('═══════════════════════════════════');
  log(`Limit: ${LIMIT} | Dry-run: ${DRY_RUN ? 'EVET' : 'HAYIR'}`);

  const CATEGORIES = ['smartphones', 'tablets'];
  let done = 0, ok = 0, skip = 0, err = 0;

  for (const cat of CATEGORIES) {
    if (done >= LIMIT) break;
    const filter = encodeURIComponent(`category = '${cat}'`);
    let page = 1;

    while (done < LIMIT) {
      const r = await pbFetch(`/api/collections/products/records?perPage=50&page=${page}&filter=${filter}&sort=-updated`);
      const data = await r.json();
      if (!data.items?.length) break;

      const targets = data.items.filter(p => {
        const img = (p.imageURL || p.imageUrl || '').trim();
        if (!img) return true;
        if (img.includes('epey')) return true;
        return false;
      });

      for (const p of targets) {
        if (done >= LIMIT) break;

        const brand = p.brand || '';
        const cName = cleanName(p.name, brand);
        const oldImg = (p.imageURL || p.imageUrl || '') || '(boş)';
        done++;

        log(`[${done}/${LIMIT}] ${cat}: ${cName.substring(0, 55)}`);
        log(`  Eski: ${oldImg.substring(0, 60)}`, 'i');

        if (DRY_RUN) {
          const found = await findGsmarenaImage(cName, brand);
          if (found) log(`  [DRY-RUN] Bulundu: ${found.imageUrl.substring(0, 60)}`, 'ok');
          else log(`  [DRY-RUN] Bulunamadı`, 'w');
          ok++;
          await sleep(5000 + Math.random() * 3000);
          continue;
        }

        // Gerçek mod
        const found = await findGsmarenaImage(cName, brand);
        if (!found) { skip++; await sleep(5000 + Math.random() * 3000); continue; }

        const img = await processImage(found.imageUrl);
        if (!img) { err++; await sleep(5000 + Math.random() * 3000); continue; }

        log(`  WebP: ${Math.round(img.buffer.length / 1024)} KB`);

        try {
          await uploadToPB(p.id, img.buffer);
          log(`  Yüklendi ✅`, 'ok');
          ok++;
        } catch (e) {
          log(`  Upload hatası: ${e.message}`, 'e');
          err++;
        }

        // Anti-ban: 5-8 sn bekleme
        await sleep(5000 + Math.random() * 3000);
      }

      if (data.items.length < 50) break;
      page++;
    }
  }

  console.log('');
  console.log('═══════════════════════════════════');
  console.log(`  Tamamlandı`);
  console.log(`  Başarılı: ${ok} | Hata: ${err} | Atlanan: ${skip}`);
  console.log('═══════════════════════════════════');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
