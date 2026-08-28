#!/usr/bin/env node
/**
 * Qor AI — EPEY NABIZ İZLEYİCİSİ (tarama YOK)
 * ══════════════════════════════════════════════════════════════════
 * Epey'in ana sayfasında kategori bağımsız bir "Son Eklenen Ürünler"
 * bloğu var: siteye en son eklenen ~15 ürün, HANGİ kategoriden olursa
 * olsun. Kategori zaten URL yolunda (/laptop/..., /televizyon/...).
 *
 * Bu script TEK bir HTTPS isteği atar (~120 KB, Cloudflare tarayıcısı
 * gerekmez), oradaki ürün adreslerini PocketBase'e sorar ve YALNIZ
 * bilinmeyenler varsa ağır boru hattını (auto_discover --urls=…) uyandırır.
 * Yeni ürün yoksa hiçbir şey açılmaz, hiçbir tarayıcı başlamaz.
 *
 *   yeni ürün yoksa  → ~1 sn, 1 istek, sıfır yük
 *   yeni ürün varsa  → yalnız o adresler çekilir + çevrilir + puanlanır
 *
 * Gece 23:20'deki QorAI-ProductDiscovery emniyet ağıdır: iki nabız arasında
 * kayan pencereden düşen ürünleri kategori bazlı en-yeni listesinden toplar.
 *
 * Kullanım:
 *   node scripts/epey_watch.js              # bir kez bak, gerekirse çek
 *   node scripts/epey_watch.js --dry-run    # yalnız raporla, çekme
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn, execFile } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const EPEY_HOME = 'https://www.epey.com/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
// Aynı ürünü art arda koşularda tekrar denememek için: PB'ye yazılamamış
// (ör. bizde olmayan kategori) adresleri hatırla.
const STATE_FILE = path.join(process.env.USERPROFILE || process.env.HOME || rootDir, '.qorai-epey-watch.json');

function ts() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
function log(m) { console.log(`[${ts()}] ${m}`); }

function readDotEnv(file) {
  try {
    return Object.fromEntries(
      fs.readFileSync(file, 'utf8').split(/\r?\n/)
        .filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
        .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
    );
  } catch (_) { return {}; }
}
const env = { ...readDotEnv(path.join(rootDir, 'migration', '.env')), ...readDotEnv(path.join(rootDir, '.env')) };

function pbUrl() {
  try {
    const src = fs.readFileSync(path.join(rootDir, 'admin', 'js', 'pb_client.js'), 'utf8');
    const m = src.match(/const\s+PB_URL\s*=\s*['"]([^'"]+)['"]/);
    if (m && m[1]) return m[1].replace(/\/$/, '');
  } catch (_) { /* .env'e düş */ }
  return String(env.POCKETBASE_URL || '').replace(/\/$/, '');
}

function request(method, url, body, headers = {}, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      method, hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        Accept: 'application/json', 'User-Agent': UA,
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = text;
        try { parsed = JSON.parse(text); } catch (_) { /* düz metin */ }
        resolve({ status: res.statusCode || 0, body: parsed, text });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Epey'in CDN'i TLS/HTTP yığınını parmak izliyor: Node'un istemcisi tam Chrome
// başlıklarıyla bile 403 alıyor, aynı UA ile curl 200 dönüyor (ölçüldü
// 2026-08-04; scripts/connectors/epey_amazon.js aynı sebeple curl kullanıyor).
function curlGet(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', [
      '-sS', '--compressed', '--location', '--max-time', '25',
      '-A', UA,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: tr-TR,tr;q=0.9,en;q=0.7',
      '-w', '\n__HTTP_STATUS__:%{http_code}',
      url,
    ], { maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout = '') => {
      const m = String(stdout).match(/\n__HTTP_STATUS__:(\d{3})\s*$/);
      if (m) resolve({ status: Number(m[1]), text: String(stdout).slice(0, m.index) });
      else reject(err || new Error('curl: durum işareti yok'));
    });
  });
}

// Ana sayfadaki TÜM ürün adresleri. Popüler ürünler de gelir ama onlar zaten
// katalogda olduğu için PB kontrolünde elenir — ayrı bir "hangi blok" ayrımı
// yapmaya gerek yok, tek gerçek ölçüt PB'de var mı olmaması.
function extractProductUrls(html) {
  const out = [];
  const seen = new Set();
  const re = /href="(https:\/\/www\.epey\.com\/([a-z0-9-]+)\/([a-z0-9._-]+)\.html)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    const seg = m[2].toLowerCase();
    // Kategori kökü olmayan yardımcı sayfalar
    if (['info', 'haber', 'yardim', 'karsilastir', 'sayfa'].includes(seg)) continue;
    if (/-resimleri$/i.test(m[3])) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

// Bizim taradığımız Epey kategori yolları. Kaynak admin/js/categories.js —
// tek gerçek kaynak orası, burada kopyasını TUTMUYORUZ. Epey'de bizde hiç
// olmayan onlarca kategori var (daire-testere, tilki-kuyrugu, gonye-testere…);
// onları PB'ye sormadan eliyoruz, yoksa her 12 saatte bir boşuna tarayıcı
// açılırdı (bu ürünler asla katalogda "bulunmuş" sayılmaz).
function ourEpeyPaths() {
  try {
    const src = fs.readFileSync(path.join(rootDir, 'admin', 'js', 'categories.js'), 'utf8');
    const set = new Set();
    const re = /epeyPath:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(src)) !== null) set.add(m[1].toLowerCase().replace(/^\/|\/$/g, '').split('/')[0]);
    return set.size >= 20 ? set : null; // beklenenden az çıktıysa filtreye güvenme
  } catch (_) { return null; }
}

function slugFromUrl(url) {
  const m = String(url).match(/\/([a-z0-9._-]+)\.html$/i);
  return m ? m[1].toLowerCase() : '';
}

async function pbAuth(base) {
  const r = await request('POST', `${base}/api/collections/_superusers/auth-with-password`, {
    identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD,
  });
  if (r.status !== 200 || !r.body || !r.body.token) {
    throw new Error(`PB girişi başarısız (${r.status})`);
  }
  return r.body.token;
}

// Hangi adresler PB'de YOK? slug + sourceUrl ikilisine bakar.
// 12'lik batch: PB bu kurulumda ~4 KB'ı aşan filtreyi 400'lüyor.
async function findUnknown(base, token, urls) {
  const unknown = [];
  const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  for (let i = 0; i < urls.length; i += 12) {
    const slice = urls.slice(i, i + 12);
    const or = [];
    for (const u of slice) {
      const slug = slugFromUrl(u);
      if (slug) or.push(`slug="${esc(slug)}"`);
      or.push(`sourceUrl="${esc(u)}"`);
    }
    if (!or.length) continue;
    const q = `/api/collections/products/records?perPage=100&fields=id,slug,sourceUrl&sort=id&filter=${encodeURIComponent(or.join(' || '))}`;
    const r = await request('GET', `${base}${q}`, null, { Authorization: token }, 60000);
    if (r.status !== 200) throw new Error(`PB sorgusu ${r.status}`);
    const known = new Set();
    for (const it of (r.body.items || [])) {
      if (it.slug) known.add(String(it.slug).toLowerCase());
      if (it.sourceUrl) known.add(String(it.sourceUrl).toLowerCase());
    }
    for (const u of slice) {
      if (known.has(slugFromUrl(u)) || known.has(u.toLowerCase())) continue;
      unknown.push(u);
    }
  }
  return unknown;
}

// BEKLEYEN KUYRUK — 2026-08-28 ölçümü.
// Ana sayfanın "Son Eklenen" bloğu yalnız ~54 adres taşır ve kayan bir
// penceredir. Nabız 15 dk'da bir koşar AMA ortak kilit meşgulken atlanır:
// ölçüldü, 27.08'de 15:15 → 23:45 arası ONDÖRT tur üst üste atlandı (gece
// fiyat koşusu kilidi 16 saat tuttu). O pencerede Epey'e eklenen ürünler
// blokdan kayıp gidiyor ve nabız onları BİR DAHA görmüyordu.
// Çözüm: nabız artık kilitsiz koşuyor ve gördüğü bilinmeyen adresleri
// buraya yazıyor; ağır yol (auto_discover) kilidi ne zaman alırsa kuyruğu
// da işliyor. Böylece adres ana sayfadan düşse bile kaybolmuyor.
const PENDING_TTL_MS = 14 * 24 * 3600 * 1000;
const PENDING_MAX = 60;

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!s.tried) s.tried = {};
    if (!s.pending) s.pending = {};
    return s;
  } catch (_) { return { tried: {}, pending: {} }; }
}
function saveState(s) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch (_) { /* önemsiz */ }
}

(async () => {
  const base = pbUrl();
  if (!base) { log('HATA: PocketBase adresi yok (migration\\.env)'); process.exit(2); }

  // 1) TEK istek — tarama yok
  const home = await curlGet(EPEY_HOME);
  if (home.status !== 200) { log(`Epey ana sayfa ${home.status} — atlandı`); process.exit(0); }
  const allUrls = extractProductUrls(home.text || '');
  log(`ana sayfa: ${allUrls.length} ürün adresi (1 istek, ${Math.round((home.text || '').length / 1024)} KB)`);
  if (!allUrls.length) { log('adres bulunamadı — Epey şablonu değişmiş olabilir'); process.exit(1); }

  // Bizim kategorilerimiz dışındakileri PB'ye hiç sorma
  const ours = ourEpeyPaths();
  const urls = ours
    ? allUrls.filter((u) => ours.has((u.split('/')[3] || '').toLowerCase()))
    : allUrls;
  if (ours && urls.length !== allUrls.length) {
    log(`${allUrls.length - urls.length} adres bizde olmayan kategoride — elendi`);
  }
  if (!urls.length) { log('bizim kategorilerimizde ürün yok'); process.exit(0); }

  // 2) PB'de olmayanlar
  const token = await pbAuth(base);
  let unknown = await findUnknown(base, token, urls);

  // 3) ÜSTEL GERİ ÇEKİLME. Bir adres çekilip de PB'ye kendi slug'ıyla
  //    girmeyebilir: varyant sayfaları mevcut kayda BİRLEŞTİRİLİYOR
  //    ("...-vp-1", "...-vp-2" gibi). Böyle adresler her turda "katalogda yok"
  //    görünür ve sabit TTL ile sonsuza dek 12 saatte bir tarayıcı açtırırdı.
  //    Her başarısız denemede bekleme iki katına çıkar (12s → 24s → 48s…,
  //    en fazla 30 gün).
  const state = loadState();
  const now = Date.now();
  const BASE_TTL = 12 * 3600 * 1000;
  const MAX_TTL = 30 * 24 * 3600 * 1000;
  const ttlFor = (n) => Math.min(MAX_TTL, BASE_TTL * Math.pow(2, Math.max(0, n - 1)));
  const tried = {};
  for (const [u, rec] of Object.entries(state.tried || {})) {
    const e = typeof rec === 'number' ? { at: rec, n: 1 } : rec;
    if (now - e.at < ttlFor(e.n)) tried[u] = e;
  }
  state.tried = tried;
  const fresh = unknown.filter((u) => !tried[u]);
  const suppressed = unknown.length - fresh.length;
  unknown = fresh;

  log(`katalogda olmayan: ${unknown.length}${suppressed ? ` (+${suppressed} yakın zamanda denendi, atlandı)` : ''}`);

  // 4) BEKLEYEN KUYRUĞU birleştir. Bu turda görülenler kuyruğa eklenir; süresi
  //    dolmuş veya artık `tried` listesine düşmüş kayıtlar atılır.
  const pending = {};
  for (const [u, at] of Object.entries(state.pending || {})) {
    if (!tried[u] && now - Number(at || 0) < PENDING_TTL_MS) pending[u] = Number(at);
  }
  for (const u of unknown) if (!pending[u]) pending[u] = now;
  state.pending = pending;

  const queue = Object.keys(pending).slice(0, PENDING_MAX);
  const carried = queue.filter((u) => !unknown.includes(u)).length;
  if (carried) log(`kuyrukta bekleyen (önceki turlardan): ${carried}`);
  if (!queue.length) {
    saveState(state);
    log('yeni ürün yok — hiçbir şey başlatılmadı');
    process.exit(0);
  }
  for (const u of queue.slice(0, 20)) log(`  • ${u.replace('https://www.epey.com', '')}`);

  // Nabız (--dry-run) kilit ALMADAN koşar: tek HTTPS isteği + tek PB sorgusu.
  // Çekilecek iş varsa 10 ile çıkar, .cmd o zaman kilidi alıp gerçek koşuyu
  // başlatır. Kuyruk burada da yazılır ki kilit meşgulse bile adres kaybolmasın.
  if (DRY) { saveState(state); log(`--dry-run: ${queue.length} adres kuyrukta, çekme atlandı`); process.exit(10); }

  // 5) Yalnız bu adresler için ağır boru hattını uyandır
  for (const u of queue) {
    const prev = state.tried[u];
    state.tried[u] = { at: now, n: (prev && prev.n ? prev.n : 0) + 1 };
    delete state.pending[u];
  }
  saveState(state);
  log(`auto_discover --urls ile ${queue.length} ürün çekiliyor…`);
  const child = spawn(process.execPath, [
    path.join(rootDir, 'scripts', 'auto_discover.js'),
    `--urls=${queue.join(',')}`,
    // 1 SAAT YETMİYORDU. Ölçüldü 2026-08-28: 9 yeni ürün 40 saniyede çekildi
    // ama ardından gelen teknik puan adımı KATEGORİNİN TAMAMINI yeniden
    // puanlıyor (puan kategori içinde göreli, bu yüzden kısmi puanlama yanlış
    // olurdu) — laptops 10.350 ürün. Koşu 4.800'de 1 saat sınırına çarpıp
    // kesildi ve o gün gelen 6 laptop techScore=0 kaldı. Katalogda hâlâ 357
    // böyle ürün var. 3 saat = gece keşfiyle aynı bütçe.
    '--max-hours=3',
  ], { cwd: rootDir, stdio: 'inherit', windowsHide: true });
  child.on('exit', (code) => process.exit(code || 0));
})().catch((e) => { log(`HATA: ${e.message}`); process.exit(1); });
