/**
 * Scans current product catalogue for Turkish text leaking into EN
 * translations. Reads ALL products from PocketBase, normalises their
 * specs/specSections to spec atoms (keys + values + section names),
 * then for each atom checks the dictionary for an EN translation.
 *
 * Anything that:
 *   * is in Turkish, AND
 *   * has no dict entry OR has an entry that still contains Turkish
 *     residue ("Health ve", "Dolum", "Audioli", suffix-glue like
 *     "minutesda" / "hourslik")
 *
 * gets written to scripts/untranslated_atoms.json so the seed-dict
 * file can be expanded in one pass.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function loadEnv(p) {
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}
const env = { ...loadEnv(path.join(__dirname, '..', 'migration', '.env')), ...process.env };
const PB_URL = (env.POCKETBASE_URL || '').replace(/\/$/, '');
const PB_EMAIL = env.POCKETBASE_ADMIN_EMAIL;
const PB_PASSWORD = env.POCKETBASE_ADMIN_PASSWORD;

if (!PB_URL || !PB_EMAIL || !PB_PASSWORD) {
  console.error('Missing POCKETBASE_URL / EMAIL / PASSWORD in migration/.env');
  process.exit(1);
}

async function auth() {
  const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
  });
  if (!r.ok) throw new Error(`auth ${r.status}`);
  return (await r.json()).token;
}

async function listProducts(token) {
  const out = [];
  let page = 1;
  while (true) {
    const r = await fetch(
      `${PB_URL}/api/collections/products/records?perPage=200&page=${page}&fields=id,name,category,specs,specSections,multiLangSpecs,multiLangSections,nameTranslated`,
      { headers: { Authorization: token } },
    );
    if (!r.ok) throw new Error(`products list ${r.status}`);
    const j = await r.json();
    out.push(...(j.items || []));
    if (j.page >= j.totalPages || !j.items?.length) break;
    page++;
  }
  return out;
}

async function loadDict(token) {
  // Read all shards
  const r = await fetch(
    `${PB_URL}/api/collections/public_config/records?perPage=200&filter=${encodeURIComponent('key~"tr_translation_dict__part_"')}&fields=value`,
    { headers: { Authorization: token } },
  );
  if (!r.ok) return {};
  const { items } = await r.json();
  const dict = {};
  for (const it of items || []) {
    const terms = it.value?.terms || {};
    for (const [k, v] of Object.entries(terms)) dict[k] = v;
  }
  return dict;
}

function normalizeKey(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Detects whether a string looks like Turkish text that needs translation.
const TURKISH_CHARS = /[çğıİöşüÇĞİÖŞÜ]/;
const TURKISH_WORDS = new Set([
  've', 'ile', 'için', 'olan', 'olarak', 'gibi', 'kadar', 'sonra', 'önce',
  'arasında', 'altında', 'üzerinde', 'içinde', 'için', 'hatta',
  'evet', 'hayır', 'var', 'yok',
  // smartwatch / health
  'hava', 'resmi', 'tasarruf', 'dolum', 'takibi', 'takip', 'mesafe',
  'gelgit', 'spor', 'kilidi', 'kilit', 'kilitli', 'yapay', 'zeka',
  'sesli', 'audioli', 'mesaj', 'modu', 'modunda', 'günlük', 'haftalık',
  'aylık', 'çağrı', 'geçmişi', 'asistan', 'asistanı', 'bildirim',
  'bildirimi', 'kalori', 'oksijen', 'kandaki', 'kanda', 'hareketsizlik',
  'nefes', 'stres', 'ritim', 'tansiyon', 'ruh', 'hali', 'tavsiyesi',
  'kimlik', 'uyku', 'apnesi', 'aktivite', 'durum', 'cihaz', 'kontrol',
  'komut', 'sağlık', 'hatırlatıcısı', 'hatırlatıcı', 'ölçer',
  // generic
  'ailesi', 'aile', 'serisi', 'türü', 'tipi', 'modeli', 'üreticisi',
  'markası', 'sürümü', 'versiyonu', 'desteği', 'kapasitesi', 'frekansı',
  'boyutu', 'ağırlığı', 'genişliği', 'yüksekliği', 'derinliği', 'kalınlığı',
  'çıkış', 'yılı', 'çeyrek', 'jenerasyon', 'nesli', 'nesil', 'sayısı',
  'adet', 'adedi', 'birim', 'kanalı', 'yuvası', 'kart', 'okuyucu',
  'klavye', 'fare', 'pil', 'pili', 'şarj', 'şarjı', 'hızlı', 'kablosuz',
  'kablolu', 'ters', 'soğutma', 'fan', 'çekirdeği', 'çekirdek',
  'önbellek', 'iş', 'parçacığı', 'parçacık', 'bellek', 'hız', 'hızı',
  'türü', 'frekans', 'temel', 'artırılmış', 'verimlilik', 'performans',
  'genel', 'teknik', 'donanım', 'yazılım', 'işletim', 'sistemi',
  'sıcaklık', 'soket', 'transistör', 'mesafesi', 'işlemci', 'işlemcisi',
  'çarpan', 'desteklediği', 'teknolojiler', 'teknoloji', 'teknolojisi',
  'çıkanlar', 'öne', 'destekleği',
  // material / colors / display
  'gece', 'modu', 'safir', 'kristal', 'paslanmaz', 'çelik', 'mor',
  'sarı', 'kahverengi', 'turuncu', 'pembe', 'lacivert',
  'kavisli', 'düz', 'geniş', 'açılı', 'sürekli', 'çizik', 'dayanımı',
  'ışın', 'izleme', 'gölgeleme', 'ünitesi', 'akıcı', 'oyun', 'çözünürlüğü',
  'parlaklık', 'parlaklığı', 'panel', 'piksel', 'yoğunluğu',
  // mic / audio / camera
  'mikrofon', 'mikrofonlu', 'mikrofonu', 'hoparlör', 'hoparlörü',
  'kamera', 'kamerası', 'flaş', 'ön', 'arka', 'ana', 'ikinci', 'üçüncü',
  // batteries / charging
  'lityum', 'iyon', 'polimer', 'mah', 'çelik', 'dakika', 'saat', 'döngü',
  'dakikada', 'saatlik', 'ortalama', 'azami', 'asgari', 'minimum',
  // security / emergency
  'acil', 'emirgenci',
  'geriye', 'yön', 'yönü', 'aralığı', 'aralık',
  'güç', 'gücü', 'güvenlik', 'koruma', 'güçlü', 'şifre', 'şifreleme',
  'fabrika', 'fabrikasyon', 'kalibrasyon', 'kalibrasyonu',
  'üretim', 'üretimi',
  // numbers and counts (Turkish)
  'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz', 'on',
  'tane', 'çift', 'tek',
  // operating systems / brands w/ Turkish wrappers
  'kalp', 'monitör', 'monitörü', 'sağlık', 'yardımcı', 'yardımcısı',
  // walkietalkie, controls
  'el', 'eller', 'jest', 'jesti', 'jestler',
]);

const BROKEN_SUFFIX_RE = /\b[a-z]{3,}(?:sda|sde|sta|ste|sdan|sden|stan|sten|slik|slık|sluk|slük|sli|slı|slu|slü|nin|nun|nın|nün)\b/i;
const TR_VERY_FREQUENT_RE = /\b(?:ve|ile|için|olan|olarak|gibi|kadar|hatta|bile|sonra|önce|burada|orada|şurada|nasıl|neden|nerede|hangi|kim|ne|kaç|bir|iki|üç|dört|beş|adet|takibi|tavsiyesi|hücreli|hücre|ailesi|serisi|türü|sürümü|kapasitesi|sayısı|özellikleri|özelliği|özellik|teknolojisi|teknoloji|adedi|destekli|destekleği|desteği|sistemi|bilgileri|bilgisi|durum|durumu|cihaz|cihazı|cihazlar|kontrol|kontrolü|komut|komutu|modu|modunda|mesaj|mesajı|notu|hatırlatıcısı|hatırlatıcı|bildirimi|bildirim|bildirimleri|ölçer|sağlık|kalori|oksijen|kandaki|kanda|nefes|stres|ritim|tansiyon|ruh|hali|tavsiyesi|kimlik|uyku|apnesi|aktivite|kalp|nabız|nabızı|kavisli|safir|kristal|paslanmaz|çelik|hava|fabrika|kalibrasyonu|kalibrasyon|acil|durum|geriye|geri|ileri|kilit|kilidi|kilitli|sesli|sesi|spor|gelgit|yapay|zeka|tasarruf|dolum|şarj|şarjı|hızlı|kablosuz|kablolu|ters|soğutma|fan|önbellek|çekirdeği|çekirdek|iş|parçacığı|bellek|hızı|türü|frekansı|temel|artırılmış|verimlilik|performans|genel|teknik|donanım|yazılım|işletim|sistemi|sıcaklık|soket|transistör|mesafesi|işlemci|işlemcisi|çarpan|desteklediği|teknolojiler|teknoloji|çıkanlar|öne|gece|modu|çıkış|yılı|çeyrek|jenerasyon|nesli|nesil|sayısı|adet|birim|kanalı|yuvası|kart|okuyucu|klavye|fare|pil|pili|şarj|gücü|güvenlik|koruma|şifre|şifreleme|üretim|üretimi|fabrika|fabrikasyon|mikrofonlu|mikrofonu|hoparlör|kamera|kamerası|flaş|ön|arka|ana|ikinci|üçüncü|lityum|iyon|polimer|dakika|saat|döngü|dakikada|saatlik|ortalama|azami|asgari|tane|çift|tek)\b/i;

function looksTurkish(text) {
  const s = String(text || '');
  if (!s) return false;
  if (TURKISH_CHARS.test(s)) return true;
  if (BROKEN_SUFFIX_RE.test(s)) return true;
  if (TR_VERY_FREQUENT_RE.test(s)) return true;
  return false;
}

function collectAtoms(product, sink) {
  const seen = sink;
  const visit = (text) => {
    const s = String(text || '').trim();
    if (!s || s.length > 400) return;
    if (s.includes('\n')) {
      for (const line of s.split('\n')) {
        const t = line.trim();
        if (t) seen.add(t);
      }
    } else {
      seen.add(s);
    }
  };
  for (const [k, v] of Object.entries(product.specs || {})) {
    visit(k); visit(v);
  }
  for (const [sec, body] of Object.entries(product.specSections || {})) {
    visit(sec);
    if (body && typeof body === 'object') {
      for (const [k, v] of Object.entries(body)) { visit(k); visit(v); }
    }
  }
}

(async () => {
  const token = await auth();
  console.log('Authenticated.');
  const dict = await loadDict(token);
  console.log(`Dict size: ${Object.keys(dict).length}`);
  const products = await listProducts(token);
  console.log(`Products: ${products.length}`);

  const atoms = new Set();
  for (const p of products) collectAtoms(p, atoms);
  console.log(`Total unique atoms: ${atoms.size}`);

  const untranslated = [];
  const badTranslation = [];
  for (const atom of atoms) {
    if (!looksTurkish(atom)) continue;
    const key = normalizeKey(atom);
    const entry = dict[key];
    if (!entry) {
      untranslated.push(atom);
    } else if (entry.en) {
      const en = String(entry.en);
      // Translation exists but might still be broken (TR residue / suffix glue)
      if (TURKISH_CHARS.test(en) || TR_VERY_FREQUENT_RE.test(en) || BROKEN_SUFFIX_RE.test(en)) {
        badTranslation.push([atom, en]);
      }
    } else {
      untranslated.push(atom);
    }
  }

  untranslated.sort((a, b) => a.length - b.length || a.localeCompare(b, 'tr'));
  badTranslation.sort((a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0], 'tr'));

  const outPath = path.join(__dirname, 'untranslated_atoms.json');
  fs.writeFileSync(outPath, JSON.stringify({
    summary: {
      totalProducts: products.length,
      totalAtoms: atoms.size,
      missing: untranslated.length,
      badEnglish: badTranslation.length,
    },
    untranslated,
    badTranslation,
  }, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log(`  ${untranslated.length} missing translations`);
  console.log(`  ${badTranslation.length} bad existing translations`);
  if (untranslated.length) {
    console.log('\nSample missing:');
    untranslated.slice(0, 40).forEach(a => console.log('  ·', a));
  }
})().catch(e => { console.error(e); process.exit(1); });
