/**
 * Qor AI — eBay Image Bot (Tum Kategoriler)
 *
 * eBay Browse API ile tum kategorilerdeki urunlere gorsel ceker.
 * Her sey tek kaynaktan: smartphone, laptop, GPU, CPU, TV, kulaklik...
 *
 * Kaynak siralamasi:
 *   1. eBay Browse API (ucretsiz, 5000 cagri/gun)
 *   2. DuckDuckGo Images (yedek)
 *
 * Kullanim:
 *   node scripts/ebay_image_bot.js [--dry-run] [--limit=50] [--category=smartphones]
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

// ─── Config ─────────────────────────────────────────────────────────────────

const envFile = fs.readFileSync(path.join(__dirname, '..', 'migration', '.env'), 'utf8');
const env = Object.fromEntries(
  envFile.split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

const PB    = env.POCKETBASE_URL;
const PB_MAIL = env.POCKETBASE_ADMIN_EMAIL;
const PB_PASS = env.POCKETBASE_ADMIN_PASSWORD;

const EBAY_ID = env.EBAY_CLIENT_ID || '';
const EBAY_SEC = env.EBAY_CLIENT_SECRET || '';
const EBAY_BASIC = Buffer.from(`${EBAY_ID}:${EBAY_SEC}`).toString('base64');

const DRY     = process.argv.includes('--dry-run');
const LIMIT   = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10) || Infinity;
const ONLYCAT = process.argv.find(a => a.startsWith('--category='))?.split('=')[1] || null;

const FIELD = 'productImages';
const UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Tum kategoriler — akilli telefon/tablet GSMArena'dan geldi, atlanacak
const ALL_CATS = [
  'smartphones','tablets','laptops','desktops','cpus','gpus','ram','ssd',
  'motherboards','psu','cases','coolers','tvs','monitors','projectors',
  'headphones','speakers','microphones','smartwatches','cameras','dashcams',
  'webcams','consoles','keyboards','mice','routers','drones','smart-home',
  'robot-vacuums','e-readers'
];

// Kategoriler icin optimize edilmis arama terimleri
const CAT_SEARCH = {
  smartphones:   ' -case -cover -protector -screen -glass -film',
  tablets:       ' -case -cover -protector -screen',
  laptops:       ' -case -cover -sleeve -bag -charger -adapter',
  desktops:      ' -refurbished -parts',
  cpus:          ' -cooler -fan -heatsink',
  gpus:          ' -bracket -holder -stand -cooler',
  ram:           ' -cooler -heatsink',
  ssd:           ' -enclosure -case -adapter -cable',
  monitors:      ' -stand -mount -arm -cable',
  tvs:           ' -stand -mount -wall -bracket -remote',
  headphones:    ' -case -stand -cable -earpads -earbuds',
};

// ─── Logging ────────────────────────────────────────────────────────────────

function log(msg, lvl) {
  const ts = new Date().toISOString().slice(11, 19);
  const p = { i:'  ', ok:'✅', w:'⚠️', e:'❌', src:'🔍', ebay:'🛒', ddg:'🦆' }[lvl]||'  ';
  console.log(`[${ts}] ${p} ${msg}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── PB Auth ────────────────────────────────────────────────────────────────

let pbTok = null;
async function pbAuth() {
  const r = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_MAIL, password: PB_PASS }),
  });
  pbTok = (await r.json()).token;
}
async function pbFetch(p, o = {}) {
  if (!pbTok) await pbAuth();
  let r = await fetch(`${PB}${p}`, { ...o, headers: { ...o.headers, 'Authorization': pbTok } });
  if (r.status === 401) { await pbAuth(); r = await fetch(`${PB}${p}`, { ...o, headers: { ...o.headers, 'Authorization': pbTok } }); }
  return r;
}

// ─── Name Cleaning ──────────────────────────────────────────────────────────

function cleanName(s) {
  return String(s).replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
}

// ─── eBay API ───────────────────────────────────────────────────────────────

let ebayTok = null, ebayExp = 0;

async function ebayAuth() {
  if (ebayTok && Date.now() < ebayExp) return ebayTok;
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + EBAY_BASIC },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
    signal: AbortSignal.timeout(10000),
  });
  const d = await r.json();
  ebayTok = d.access_token;
  ebayExp = Date.now() + (d.expires_in - 60) * 1000;
  return ebayTok;
}

async function searchEbay(name, brand, category) {
  try {
    const token = await ebayAuth();
    const suffix = CAT_SEARCH[category] || '';
    const q = encodeURIComponent(`${brand || ''} ${cleanName(name)}${suffix}`.trim());
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&filter=conditions:{NEW}&limit=1`;

    const r = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json();
    if (!d.itemSummaries?.length) return null;

    const img = d.itemSummaries[0].image?.imageUrl || '';
    if (!img) return null;
    return img.replace(/s-l\d+\.jpg/, 's-l1600.jpg');
  } catch (e) {
    return null;
  }
}

// ─── DuckDuckGo Fallback ────────────────────────────────────────────────────

async function searchDdg(name, brand) {
  try {
    const query = encodeURIComponent(`${brand || ''} ${cleanName(name)} official product image`.trim());

    const ddg = await fetch(`https://duckduckgo.com/?q=${query}&iax=images&ia=images`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await ddg.text();
    const vqd = (html.match(/vqd=([0-9-]+)/) || [])[1];
    if (!vqd) return null;

    const imgR = await fetch(`https://duckduckgo.com/i.js?q=${query}&vqd=${vqd}&o=json&l=us-en&f=,,,`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000),
    });
    const data = await imgR.json();
    return data.results?.[0]?.image || null;
  } catch { return null; }
}

// ─── Image Processing ───────────────────────────────────────────────────────

async function processImage(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;

    const ct = r.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;

    const ab = await r.arrayBuffer();
    const buf = await sharp(Buffer.from(ab))
      .resize(800, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    return { buffer: buf, contentType: 'image/webp' };
  } catch { return null; }
}

// ─── PB Upload ──────────────────────────────────────────────────────────────

async function uploadToPB(pid, buf, source) {
  const fn = 'ebay.webp';
  const b = '----Ebay' + Date.now();
  const crlf = '\r\n';
  const h = `--${b}${crlf}Content-Disposition: form-data; name="${FIELD}"; filename="${fn}"${crlf}Content-Type: image/webp${crlf}${crlf}`;
  const body = Buffer.concat([Buffer.from(h), buf, Buffer.from(`${crlf}--${b}--${crlf}`)]);

  const r = await pbFetch(`/api/collections/products/records/${pid}`, {
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

  const url = `${PB}/api/files/products/${pid}/${up}`;
  await pbFetch(`/api/collections/products/records/${pid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageURL: url, imageUrl: url, images: [url], _imgSrc: source }),
  });
  return url;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Qor AI — eBay Image Bot (Tum Kat.)');
  console.log('═══════════════════════════════════════');
  log(`Limit: ${LIMIT===Infinity?'∞':LIMIT} | Dry: ${DRY?'EVET':'HAYIR'} | Cat: ${ONLYCAT||'TUMU'}`);

  const cats = ONLYCAT ? [ONLYCAT] : ALL_CATS;
  let done = 0, ok = 0, skip = 0, err = 0;
  const stats = { ebay: 0, ddg: 0 };

  for (const cat of cats) {
    if (done >= LIMIT) break;
    const filter = encodeURIComponent(`category = '${cat}'`);
    let page = 1;

    while (done < LIMIT) {
      const r = await pbFetch(`/api/collections/products/records?perPage=100&page=${page}&filter=${filter}&fields=id,name,brand,category,imageURL,imageUrl`);
      const data = await r.json();
      if (!data.items?.length) break;

      const targets = data.items.filter(p => {
        const img = (p.imageURL || p.imageUrl || '').trim();
        if (!img) return true;
        if (img.includes('epey')) return true;
        if (img.includes('resim.epey')) return true;
        return false;
      });

      for (const p of targets) {
        if (done >= LIMIT) break;

        const brand = p.brand || '';
        const cName = cleanName(p.name);
        const oldImg = (p.imageURL || p.imageUrl || '') || '(bos)';
        done++;

        log(`[${done}/${LIMIT===Infinity?'?':LIMIT}] ${cat}: ${cName.substring(0,50)}`);
        log(`  Eski: ${oldImg.substring(0, 60)}`, 'i');

        if (DRY) { ok++; continue; }

        // 1. eBay
        let imgUrl = null, source = null;
        imgUrl = await searchEbay(p.name, brand, cat);
        if (imgUrl) { source = 'eBay'; log(`  eBay buldu`, 'ebay'); }
        else {
          log(`  eBay bulamadi, DDG deneniyor...`, 'w');
          imgUrl = await searchDdg(p.name, brand);
          if (imgUrl) { source = 'DDG'; log(`  DDG buldu`, 'ddg'); }
          else { log(`  Hicbir kaynak bulamadi`, 'w'); skip++; await sleep(1000); continue; }
        }

        const img = await processImage(imgUrl);
        if (!img) { err++; await sleep(1000); continue; }

        log(`  WebP: ${Math.round(img.buffer.length/1024)} KB (${source})`);

        try {
          await uploadToPB(p.id, img.buffer, source);
          log(`  Yuklendi ✅`, 'ok');
          stats[source.toLowerCase()]++;
          ok++;
        } catch (e) {
          log(`  Upload: ${e.message}`, 'e');
          err++;
        }

        // eBay rate limit: 5000/gun → ~3.5/dk → her urunde ~17 sn
        // DDG daha hizli ama eBay agirlikli olacagi icin 15 sn delay
        await sleep(12000 + Math.random() * 6000);
      }

      if (data.items.length < 100) break;
      page++;
    }
  }

  console.log('');
  console.log('═══════════════════════════════════');
  console.log(`  Tamamlandi`);
  console.log(`  Basarili: ${ok} | Hata: ${err} | Atlanan: ${skip}`);
  console.log(`  Kaynak: eBay=${stats.ebay} | DDG=${stats.ddg}`);
  console.log('═══════════════════════════════════');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
