/* eslint-disable */
// Tüm kategorilerdeki anormal RAM/storage/battery vb. değerlerini bulur.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const PB = process.env.POCKETBASE_URL;
const EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const PW = process.env.POCKETBASE_ADMIN_PASSWORD;

async function pbAuth() {
  const r = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: EMAIL, password: PW }),
  });
  if (!r.ok) throw new Error('PB auth failed: ' + r.status);
  return (await r.json()).token;
}

async function fetchAll(token, category) {
  const all = []; let page = 1;
  while (true) {
    const url = `${PB}/api/collections/products/records?page=${page}&perPage=200&filter=${encodeURIComponent(`category="${category}"`)}`;
    const r = await fetch(url, { headers: { Authorization: token } });
    if (!r.ok) throw new Error('PB fetch failed: ' + r.status);
    const j = await r.json();
    all.push(...j.items);
    if (j.items.length < 200 || page >= j.totalPages) break;
    page++;
  }
  return all;
}

function parseGb(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(tb|gb|mb|kb|t|g|m|k)?/i);
  if (!m) return null;
  let v = parseFloat(m[1].replace(',', '.'));
  const u = (m[2] || '').toLowerCase();
  if (u === 'tb' || u === 't') v *= 1024;
  else if (u === 'mb' || u === 'm') v /= 1024;
  else if (u === 'kb' || u === 'k') v /= (1024 * 1024);
  return v;
}

function parseNum(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  const m = s.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  return parseFloat(m[1].replace(',', '.'));
}

// Tüm spec key isimlerini düz dizide topla (nested + sections + flat)
function* walkSpecs(p) {
  const seen = new Set();
  const visit = (obj, section = null) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        visit(v, k);
      } else {
        const val = String(v ?? '').trim();
        const sig = `${section || ''}|${k}|${val}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        // ts-ignore yield via outer generator
      }
    }
  };
  // Just iterate everything we can find:
  const out = [];
  const visitOut = (obj, section = null) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        visitOut(v, k);
      } else {
        out.push({ section, key: k, val: String(v ?? '').trim() });
      }
    }
  };
  visitOut(p.specs || {});
  visitOut(p.specSections || {});
  for (const o of out) yield o;
}

const RAM_KEYS = /^(ram|memory|memory \(ram\)|bellek)$/i;
const STORAGE_KEYS = /^(storage|hard disk \(ssd\) size|ssd size|storage capacity|depolama|hard disk size|ssd capacity|internal storage|hafıza)$/i;
const BATTERY_KEYS = /battery (capacity|power)|batarya kapasitesi/i;
const SCREEN_KEYS = /^(display size|screen size|ekran boyutu)$/i;

(async () => {
  const token = await pbAuth();

  // Kategori listesi
  const cats = ['smartphones', 'tablets', 'laptops', 'desktops', 'monitors', 'tvs',
    'headphones', 'smartwatches', 'cameras'];

  const issues = [];

  for (const cat of cats) {
    const products = await fetchAll(token, cat);
    console.log(`[${cat}] ${products.length} ürün taranıyor...`);

    for (const p of products) {
      const ramVals = [], storageVals = [], batVals = [], screenVals = [];
      const allFields = [];

      for (const { section, key, val } of walkSpecs(p)) {
        if (!val) continue;
        allFields.push({ section, key, val });
        if (RAM_KEYS.test(key)) {
          const gb = parseGb(val);
          if (gb != null) ramVals.push({ key, val, gb, section });
        }
        if (STORAGE_KEYS.test(key)) {
          const gb = parseGb(val);
          if (gb != null) storageVals.push({ key, val, gb, section });
        }
        if (BATTERY_KEYS.test(key)) {
          const mah = parseNum(val);
          if (mah != null) batVals.push({ key, val, mah, section });
        }
        if (SCREEN_KEYS.test(key)) {
          const inch = parseNum(val);
          if (inch != null) screenVals.push({ key, val, inch, section });
        }
      }

      // Anomali kuralları (kategoriye göre)
      const isPhone = cat === 'smartphones';
      const isLaptop = cat === 'laptops' || cat === 'desktops';
      const isTablet = cat === 'tablets';

      // Sadece açıkça hatalı (parse/typing/swap) kayıtları yakala — eski düşük-spec ürünleri rahat bırak
      for (const r of ramVals) {
        // Telefon RAM > 64GB → kesin hata (storage ile karışmış olabilir)
        if (isPhone && r.gb > 64) issues.push({ cat, p, type: 'RAM_OUTLIER', issue: `RAM=${r.gb}GB (telefon için imkansız — muhtemelen storage)`, field: r });
        if (isTablet && r.gb > 32) issues.push({ cat, p, type: 'RAM_OUTLIER', issue: `RAM=${r.gb}GB (tablet için imkansız)`, field: r });
        if (isLaptop && r.gb > 512) issues.push({ cat, p, type: 'RAM_OUTLIER', issue: `RAM=${r.gb}GB (laptop için imkansız)`, field: r });
      }
      for (const s of storageVals) {
        if (isPhone && s.gb > 2048) issues.push({ cat, p, type: 'STORAGE_OUTLIER', issue: `Storage=${s.gb}GB (telefon için anormal)`, field: s });
        if (isLaptop && s.gb > 32768) issues.push({ cat, p, type: 'STORAGE_OUTLIER', issue: `Storage=${s.gb}GB (laptop için anormal)`, field: s });
      }
      for (const b of batVals) {
        if (isPhone && b.mah > 15000) issues.push({ cat, p, type: 'BATTERY_OUTLIER', issue: `Battery=${b.mah}mAh (telefon için imkansız)`, field: b });
      }
      for (const sc of screenVals) {
        if (isPhone && sc.inch > 9) issues.push({ cat, p, type: 'SCREEN_OUTLIER', issue: `Screen=${sc.inch}" (telefon için anormal — tablet olabilir)`, field: sc });
        if (isLaptop && cat === 'laptops' && (sc.inch < 8 || sc.inch > 22)) issues.push({ cat, p, type: 'SCREEN_OUTLIER', issue: `Screen=${sc.inch}" (laptop aralığı dışında)`, field: sc });
      }
    }
  }

  // Rapor
  console.log('\n' + '='.repeat(80));
  console.log(`HATALI VERİ RAPORU — toplam ${issues.length} anomali`);
  console.log('='.repeat(80));

  const byCat = {};
  for (const x of issues) {
    if (!byCat[x.cat]) byCat[x.cat] = [];
    byCat[x.cat].push(x);
  }

  for (const [cat, list] of Object.entries(byCat)) {
    console.log(`\n### ${cat.toUpperCase()} (${list.length} hata)`);
    for (const x of list) {
      console.log(`  • [${x.type}] ${x.p.name}`);
      console.log(`     id=${x.p.id}  slug=${x.p.slug || '-'}`);
      console.log(`     ${x.issue}`);
      console.log(`     field: section="${x.field.section || ''}" key="${x.field.key}" val="${x.field.val}"`);
    }
  }

  // CSV de üret
  const fs = require('fs');
  const csv = ['category,product_id,product_name,slug,issue_type,issue,field_section,field_key,field_value'];
  for (const x of issues) {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    csv.push([x.cat, x.p.id, esc(x.p.name), x.p.slug || '', x.type, esc(x.issue), esc(x.field.section || ''), esc(x.field.key), esc(x.field.val)].join(','));
  }
  fs.writeFileSync(require('path').join(__dirname, 'bad_data_report.csv'), csv.join('\n'), 'utf8');
  console.log(`\n📝 CSV: migration/bad_data_report.csv (${issues.length} satır)`);
})().catch(e => { console.error(e); process.exit(1); });
