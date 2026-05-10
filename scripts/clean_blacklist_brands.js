/**
 * Qor AI — Blacklist Marka Temizleme Scripti
 *
 * products koleksiyonundan blacklist'teki markalara ait tüm ürünleri siler.
 * 50'şerli batch, aralarda 1.5sn delay — SQLite lock önlenir.
 *
 * Kullanım: node scripts/clean_blacklist_brands.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

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
const BATCH = 50;
const DELAY_MS = 1500;

const BLACKLIST = new Set([
  "360", "Amcrest", "Angel", "Artes", "Averdig", "Axis", "Botech", "Botslab",
  "Bullwark", "Cenova", "Colacam", "Concord", "Crea", "Dahua", "Digoo", "Dreame",
  "Ecovacs", "Elfobaby", "Ennetcam", "Escam", "Everest", "Evervox", "Eyfel",
  "Ezviz", "Foscam", "Fujitron", "Gigoo", "Glrtech", "Goldmaster", "Grandstream",
  "GreenTech", "Guardzilla", "HeimVision", "Heimvision", "HiLook", "Hikvision",
  "IQeye", "ISee", "Imilab", "Imou", "Jasboom", "Jovision", "Karel", "Kingboss",
  "Kodak", "MF", "Milesight", "Neutron", "Nexcom", "Next", "Osmart", "PaleTech",
  "Powermaster", "Reolink", "Ring", "Roborock", "Schwaiger", "Scs", "Smartvision",
  "Spy", "Sricam", "Trax", "Trili", "Uniview", "Uptech", "VGuard", "VStarcam",
  "Wyze", "Xrplus", "YI", "Yale", "Yoosee", "Zavio", "upTech"
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── PB Auth ────────────────────────────────────────────────────────────────

let token = null;

async function pbAuth() {
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASS }),
  });
  const data = await res.json();
  token = data.token;
  return token;
}

async function pbFetch(path, opts = {}) {
  if (!token) await pbAuth();
  let res = await fetch(`${PB_URL}${path}`, {
    ...opts,
    headers: { ...opts.headers, 'Authorization': token },
  });
  if (res.status === 401) { await pbAuth(); res = await fetch(`${PB_URL}${path}`, { ...opts, headers: { ...opts.headers, 'Authorization': token } }); }
  return res;
}

// ─── Fetch all brands from DB ───────────────────────────────────────────────

async function getAllBrands() {
  const brands = new Set();
  let page = 1;
  while (true) {
    const res = await pbFetch(`/api/collections/products/records?perPage=1000&page=${page}&fields=brand`);
    const data = await res.json();
    for (const item of data.items) {
      if (item.brand) brands.add(item.brand);
    }
    if (data.items.length < 1000) break;
    page++;
  }
  return [...brands].sort();
}

// ─── Fetch product IDs for a specific brand ─────────────────────────────────

async function getProductIdsByBrand(brand, exactBrand) {
  const ids = [];
  let page = 1;
  while (true) {
    const filter = encodeURIComponent(`brand = '${exactBrand}'`);
    const res = await pbFetch(`/api/collections/products/records?perPage=500&page=${page}&filter=${filter}&fields=id,name,brand`);
    const data = await res.json();
    for (const item of data.items) ids.push({ id: item.id, name: item.name, brand: item.brand });
    if (data.items.length < 500) break;
    page++;
  }
  return ids;
}

// ─── Delete in batches ──────────────────────────────────────────────────────

async function deleteBatch(ids) {
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    for (const item of batch) {
      try {
        await pbFetch(`/api/collections/products/records/${item.id}`, { method: 'DELETE' });
      } catch (e) {
        log(`  ⚠️  Silme hatası (${item.id}): ${e.message}`);
      }
    }
    if (i + BATCH < ids.length) await sleep(DELAY_MS);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  log('🔍 Veritabanındaki tüm markalar taranıyor...');
  const allBrands = await getAllBrands();
  log(`Toplam benzersiz marka: ${allBrands.length}`);

  // Case-insensitive eşleşme: DB'deki marka blacklist'te var mı?
  const blacklistLower = [...BLACKLIST].map(b => b.toLowerCase());
  const toDelete = allBrands.filter(b => blacklistLower.includes(b.toLowerCase()));

  if (toDelete.length === 0) {
    log('✅ Silinecek marka bulunamadı.');
    return;
  }

  log(`🎯 ${toDelete.length} blacklist markası bulundu: ${toDelete.join(', ')}`);

  let totalDeleted = 0;
  const perBrand = [];

  for (const brand of toDelete) {
    const products = await getProductIdsByBrand(brand, brand);
    if (products.length === 0) { log(`  ${brand}: 0 ürün`); continue; }

    log(`  ${brand}: ${products.length} ürün ${DRY_RUN ? '(silinecek)' : 'siliniyor...'}`);

    if (!DRY_RUN) {
      await deleteBatch(products);
    }
    perBrand.push({ brand, count: products.length });
    totalDeleted += products.length;

    if (!DRY_RUN) await sleep(DELAY_MS);
  }

  console.log('');
  console.log('═══════════════════════════════════');
  console.log(`  ${DRY_RUN ? '[DRY-RUN]' : '✅'} Temizlik tamamlandı`);
  console.log(`  Silinen marka: ${toDelete.length}`);
  console.log(`  Silinen ürün:  ${totalDeleted}`);
  perBrand.forEach(b => console.log(`    ${b.brand}: ${b.count}`));
  console.log('═══════════════════════════════════');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
