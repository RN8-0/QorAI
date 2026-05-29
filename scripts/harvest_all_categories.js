/**
 * Walks every Epey category we ship, grabs a few sample product detail
 * pages from each, extracts every Turkish-looking atom (section header,
 * spec key, spec value, multi-line list entry), and writes the unique
 * set to scripts/harvested_atoms.json. The seed-dict author (i.e. me,
 * Claude) then translates that list and pushes a new seed.
 *
 * Designed to run against the local scraper proxy that the user already
 * has running (npm run scraper:proxy on http://localhost:3456). It does
 * NOT touch PocketBase or the Argos worker — pure read-only HTML harvest
 * through the proxy that already inherits cf_clearance from Puppeteer.
 *
 * Usage:
 *   npm run scraper:proxy        # if not already running
 *   node scripts/harvest_all_categories.js [--products=3]
 *
 * Output: scripts/harvested_atoms.json
 *   {
 *     summary: { categories, productsFetched, atomsFound, turkishAtoms },
 *     byCategory: { [epeyPath]: [turkish atoms…] },
 *     allTurkishAtoms: [unique, sorted]
 *   }
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PROXY = 'http://localhost:3456';
const PRODUCTS_PER_CATEGORY = Math.max(
  1,
  Math.min(8, Number((process.argv.find(a => a.startsWith('--products=')) || '').split('=')[1] || 3)),
);

// Pulled from `grep epeyPath admin/js/categories.js | sort -u`.
const CATEGORY_PATHS = [
  '3d-yazici', 'akilli-saat', 'akilli-telefonlar', 'akilli-yuzuk', 'anakart',
  'arac-ici-kamera', 'bellek-ram', 'bilgisayar-kasasi', 'drone',
  'e-kitap-okuyucu', 'ekran-karti', 'gimbal', 'goruntu-ve-ses-aktarici',
  'ip-kamera', 'islemci', 'islemci-sogutucu', 'kasa-fani', 'kulaklik',
  'laptop', 'laptop-sogutucu', 'lens', 'masaustu-bilgisayar',
  'medya-oynatici', 'mikrofon', 'modem', 'monitor', 'oyun-kolu',
  'oyun-konsolu', 'power-supply-psu', 'powerbank', 'projeksiyon-makinesi',
  'robot-supurge', 'router', 'sabit-disk', 'sanal-gerceklik', 'sarj-aleti',
  'ses-sistemi', 'tablet', 'televizyon', 'yazici',
];

const TURKISH_CHARS = /[çğıİöşüÇĞİÖŞÜ]/;
const TURKISH_WORD_BAG = new Set([
  've', 'ile', 'için', 'olan', 'olarak', 'gibi', 'kadar', 'sonra', 'önce',
  'evet', 'hayır', 'var', 'yok',
  'hava', 'resmi', 'tasarruf', 'dolum', 'takibi', 'takip', 'mesafe',
  'gelgit', 'spor', 'kilidi', 'kilit', 'kilitli', 'yapay', 'zeka',
  'sesli', 'audioli', 'mesaj', 'modu', 'modunda', 'gunluk', 'haftalik',
  'aylik', 'cagri', 'gecmisi', 'asistan', 'asistani', 'bildirim',
  'bildirimi', 'kalori', 'oksijen', 'kandaki', 'kanda', 'hareketsizlik',
  'nefes', 'stres', 'ritim', 'tansiyon', 'ruh', 'hali', 'tavsiyesi',
  'kimlik', 'uyku', 'apnesi', 'aktivite', 'durum', 'cihaz', 'kontrol',
  'komut', 'saglik', 'hatirlatici', 'olcer', 'ailesi', 'aile', 'serisi',
  'turu', 'tipi', 'modeli', 'ureticisi', 'markasi', 'surumu', 'versiyonu',
  'destegi', 'kapasitesi', 'frekansi', 'boyutu', 'agirligi', 'genisligi',
  'yuksekligi', 'derinligi', 'kalinligi', 'cikis', 'yili', 'ceyrek',
  'jenerasyon', 'nesli', 'nesil', 'sayisi', 'adet', 'adedi', 'birim',
  'kanali', 'yuvasi', 'kart', 'okuyucu', 'klavye', 'fare', 'pil', 'pili',
  'sarj', 'sarji', 'hizli', 'kablosuz', 'kablolu', 'ters', 'sogutma',
  'fan', 'cekirdegi', 'cekirdek', 'onbellek', 'parcacigi', 'parcacik',
  'bellek', 'hiz', 'hizi', 'temel', 'artirilmis', 'verimlilik', 'performans',
  'genel', 'teknik', 'donanim', 'yazilim', 'isletim', 'sistemi',
  'sicaklik', 'soket', 'transistor', 'mesafesi', 'islemci', 'islemcisi',
  'carpan', 'destekledigi', 'teknolojiler', 'teknoloji', 'teknolojisi',
  'cikanlar', 'one', 'gece', 'safir', 'kristal', 'paslanmaz', 'celik',
  'mor', 'sari', 'kahverengi', 'turuncu', 'pembe', 'lacivert', 'kavisli',
  'duz', 'genis', 'acili', 'surekli', 'cizik', 'dayanimi',
  'isin', 'izleme', 'golgeleme', 'unitesi', 'akici', 'oyun', 'cozunurlugu',
  'parlaklik', 'parlakligi', 'panel', 'piksel', 'yogunlugu',
  'mikrofon', 'mikrofonlu', 'mikrofonu', 'hoparlor', 'hoparloru',
  'kamera', 'kamerasi', 'flas', 'on', 'arka', 'ana', 'ikinci', 'ucuncu',
  'lityum', 'iyon', 'polimer', 'dakika', 'saat', 'dongu', 'dakikada',
  'saatlik', 'ortalama', 'azami', 'asgari', 'tane', 'cift', 'tek',
  'kalp', 'monitor', 'monitoru', 'yardimci', 'yardimcisi', 'el', 'jest',
  'kabin', 'kabinli', 'orta', 'dusuk', 'yuksek', 'lazer', 'inkjet',
  'mürekkep', 'murekkep', 'toner', 'fotograf', 'baski', 'baskili',
  'baski', 'cikti', 'tarayici', 'tarama', 'kopya', 'sayfa',
  'soguk', 'cuzdan', 'kripto', 'kuruyemis', 'sebze', 'meyve',
  'supurge', 'sopa', 'fanli', 'fansiz', 'hava', 'fanli',
]);
function foldedTurkish(s) {
  return String(s || '').toLowerCase()
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o')
    .replace(/ş/g, 's').replace(/ü/g, 'u');
}
function looksTurkish(text) {
  const s = String(text || '');
  if (!s) return false;
  if (TURKISH_CHARS.test(s)) return true;
  const folded = foldedTurkish(s);
  const tokens = folded.match(/[a-z]+/g) || [];
  return tokens.some(t => TURKISH_WORD_BAG.has(t));
}

async function proxyFetch(url) {
  const r = await fetch(`${PROXY}/?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`proxy ${r.status} for ${url}`);
  return r.text();
}

function extractProductUrls(html, prefix) {
  const re = /(?:href|data-href|data-url)\s*=\s*["']([^"']+?\.html)["']/gi;
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1];
    if (/^https?:/i.test(href)) {
      try { href = new URL(href).pathname; } catch { continue; }
    }
    if (!href.startsWith('/')) href = '/' + href;
    if (/-resimleri\.html$/i.test(href)) continue;
    if (!href.toLowerCase().startsWith(prefix.toLowerCase())) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push('https://www.epey.com' + href);
  }
  return out;
}

// Pull spec section names + keys + values from an Epey detail page.
function extractAtoms(html) {
  const atoms = new Set();
  const push = (s) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 300) return;
    atoms.add(t);
  };

  // Section headers under #ozellikler
  for (const m of html.matchAll(/<(?:h2|h3|h4|div)[^>]*class="[^"]*baslik[^"]*"[^>]*>([\s\S]*?)<\/(?:h2|h3|h4|div)>/gi)) {
    push(stripTags(m[1]));
  }

  // Spec rows: <li><strong>Key</strong>Value...</li> and table rows.
  for (const m of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const inner = m[1];
    const keyMatch = inner.match(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/i);
    if (!keyMatch) continue;
    const key = stripTags(keyMatch[1]);
    push(key);
    // Multi-value: bullets via <span> or text after the key.
    const remainder = inner.replace(keyMatch[0], '');
    for (const v of remainder.split(/<\/?li[^>]*>|<br[^>]*>/i)) {
      const t = stripTags(v);
      if (!t) continue;
      // Split top-level comma/newline groups for list values.
      for (const part of t.split(/\n|, | • /)) push(part);
    }
  }
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => stripTags(c[1]));
    if (cells.length >= 2) {
      push(cells[0]);
      for (const part of cells[1].split(/\n|, | • /)) push(part);
    }
  }
  return atoms;
}

function stripTags(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

(async () => {
  const byCategory = {};
  const allTurkish = new Set();
  let productsFetched = 0;
  let atomsFound = 0;

  for (let i = 0; i < CATEGORY_PATHS.length; i++) {
    const cat = CATEGORY_PATHS[i];
    const prefix = `/${cat}/`;
    process.stdout.write(`[${i + 1}/${CATEGORY_PATHS.length}] ${cat} … `);
    let listingHtml;
    try {
      listingHtml = await proxyFetch(`https://www.epey.com/${cat}/`);
    } catch (e) {
      console.log(`listing fail: ${e.message}`);
      byCategory[cat] = { error: e.message, atoms: [] };
      continue;
    }
    const urls = extractProductUrls(listingHtml, prefix).slice(0, PRODUCTS_PER_CATEGORY);
    if (!urls.length) {
      console.log('no products');
      byCategory[cat] = { error: 'no product urls', atoms: [] };
      continue;
    }
    const turkish = new Set();
    for (const url of urls) {
      let html;
      try { html = await proxyFetch(url); } catch (e) {
        console.log(`\n    ! ${url}: ${e.message}`);
        continue;
      }
      productsFetched++;
      const atoms = extractAtoms(html);
      atomsFound += atoms.size;
      for (const a of atoms) {
        if (looksTurkish(a)) {
          turkish.add(a);
          allTurkish.add(a);
        }
      }
    }
    byCategory[cat] = { productsTried: urls.length, atoms: [...turkish].sort((a,b)=>a.length-b.length || a.localeCompare(b,'tr')) };
    console.log(`${urls.length} products → ${turkish.size} TR atoms`);
  }

  const sortedAll = [...allTurkish].sort((a, b) => a.length - b.length || a.localeCompare(b, 'tr'));
  const out = {
    summary: {
      categories: CATEGORY_PATHS.length,
      productsFetched,
      atomsFound,
      turkishAtoms: sortedAll.length,
      productsPerCategory: PRODUCTS_PER_CATEGORY,
    },
    byCategory,
    allTurkishAtoms: sortedAll,
  };
  const outPath = path.join(__dirname, 'harvested_atoms.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log(`  ${CATEGORY_PATHS.length} categories, ${productsFetched} products, ${sortedAll.length} unique Turkish atoms`);
})().catch(e => { console.error(e); process.exit(1); });
