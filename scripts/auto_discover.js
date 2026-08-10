#!/usr/bin/env node
/**
 * Qor AI — OTOMATİK YENİ ÜRÜN KEŞFİ (başsız)
 * ══════════════════════════════════════════════════════════════════
 * Epey'e yeni ürün eklendiğinde katalogda da çıksın diye her gece koşar.
 * Fiyat sistemi gibi: PC açıksa kendiliğinden çalışır, elle müdahale yok.
 *
 * NEDEN PUPPETEER? Keşif boru hattının TAMAMI (URL toplama, Cloudflare
 * oturumu, tekrar-eleme, detay ayrıştırma, Türkçe→EN/DE sözlük çevirisi,
 * teknik puan motoru) admin panelinin tarayıcı kodunda yaşıyor — 20 bin
 * satır. Node'a kopyalamak ikinci bir gerçek kaynak yaratır ve iki taraf
 * ilk düzeltmede ayrışır. Bunun yerine aynı sayfayı başsız açıp
 * `window.qoraiAutoRun()` çağırıyoruz: elle koşu ile gece koşusu BİREBİR
 * aynı kodu çalıştırır.
 *
 * Zincir:  proxy hazırla → admin oturumu (PB superuser) → scrape →
 *          çeviri → teknik puan → public_config'e durum yaz
 * Fiyatlar bu zincirde DEĞİL: 03:10'daki QorAI-PriceRefresh görevi yeni
 * ürünleri kendi keşif pass'inde toplar (scripts/price_refresh.cmd).
 *
 * NOKTA ATIŞI (varsayılan): her kategorinin Epey'deki eklenme-tarihi sıralı
 * listesinden yalnız YENİ ürünler alınır; bir sayfada hiç yeni yoksa o kategori
 * bırakılır (sonrası zaten daha eski). Yeni ürünü olmayan kategori 1 istek eder.
 *
 * Kullanım:
 *   node scripts/auto_discover.js                     # tüm Epey kategorileri
 *   node scripts/auto_discover.js --categories=smartphones,laptops
 *   node scripts/auto_discover.js --newest-pages=15   # birikmiş kategoriler için derine in
 *   node scripts/auto_discover.js --full-catalog      # TAM katalog taraması (saatler sürer)
 *   node scripts/auto_discover.js --no-translate --no-score
 *   node scripts/auto_discover.js --headful           # tarayıcıyı göster (hata ayıklama)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn, execFile } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const PROXY_PORT = parseInt(process.env.SCRAPER_PROXY_PORT || '3456', 10);
const PROXY_URL = `http://localhost:${PROXY_PORT}`;

// ─── argümanlar ────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argVal = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const hasFlag = (name) => argv.includes(`--${name}`);

const OPTS = {
  categories: argVal('categories', 'all'),
  limit: parseInt(argVal('limit', '100000'), 10) || 100000,
  delay: parseInt(argVal('delay', '0'), 10) || 0,
  concurrency: parseInt(argVal('concurrency', '24'), 10) || 24,
  // VARSAYILAN: nokta atışı (her kategorinin en-yeni listesinden yalnız yeni
  // ürünler). --full-catalog yalnız sıfırdan kurulum/onarım için.
  newestOnly: !hasFlag('full-catalog'),
  newestPages: parseInt(argVal('newest-pages', '8'), 10) || 8,
  collectAll: hasFlag('full-catalog'),
  translate: !hasFlag('no-translate'),
  score: !hasFlag('no-score'),
  // --urls=a,b,c → HİÇ tarama yapma, yalnız bu adresleri çek (nabız izleyicisi
  // epey_watch.js buradan besler). Kategori URL yolundan çözülür.
  urls: String(argVal('urls', '')).split(',').map(s => s.trim()).filter(Boolean),
  // --translate-only=cat1,cat2 → scrape YOK, yalnız o kategorileri yeniden çevir
  translateOnly: argVal('translate-only', ''),
};
const HEADFUL = hasFlag('headful');
// Emniyet freni: koşu bu süreyi aşarsa tarayıcı kapatılır ve görev biter,
// yoksa asılı kalan bir sayfa ertesi geceki koşuyu da bloklar.
const MAX_RUN_MS = (parseInt(argVal('max-hours', '10'), 10) || 10) * 3600 * 1000;

function ts() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
function log(msg) { console.log(`[${ts()}] ${msg}`); }

// Süresiz bekleyen bir promise'i sınırla. Puppeteer'ın `page.evaluate`'i
// varsayılan olarak zaman aşımı TAŞIMAZ; donmuş bir renderer'da await sonsuza
// kadar bekler ve çağıran döngü bir daha hiç ilerlemez.
function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${Math.round(ms / 1000)} sn içinde yanıt yok`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// ─── .env ──────────────────────────────────────────────────────────
function readDotEnv(file) {
  try {
    return Object.fromEntries(
      fs.readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
        .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
    );
  } catch (_) { return {}; }
}
const env = { ...readDotEnv(path.join(rootDir, 'migration', '.env')), ...readDotEnv(path.join(rootDir, '.env')) };

// Admin paneli kendi PocketBase adresini pb_client.js'te sabit tutuyor.
// Token'ı ORAYA üretmeliyiz — .env başka bir kopyayı gösteriyorsa oturum
// geçersiz olur ve panel giriş ekranında takılır.
function adminPanelPbUrl() {
  try {
    const src = fs.readFileSync(path.join(rootDir, 'admin', 'js', 'pb_client.js'), 'utf8');
    const m = src.match(/const\s+PB_URL\s*=\s*['"]([^'"]+)['"]/);
    if (m && m[1]) return m[1].replace(/\/$/, '');
  } catch (_) { /* .env'e düş */ }
  return String(env.POCKETBASE_URL || '').replace(/\/$/, '');
}

// ─── küçük HTTP yardımcıları ───────────────────────────────────────
function request(method, url, body, headers = {}, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        Accept: 'application/json',
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
        resolve({ status: res.statusCode || 0, body: parsed });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── 1) scraper proxy ──────────────────────────────────────────────
async function proxyHealth() {
  try {
    const r = await request('GET', `${PROXY_URL}/health`, null, {}, 5000);
    return r.status === 200 && r.body && r.body.ok ? r.body : null;
  } catch (_) { return null; }
}

let proxyProc = null;
async function ensureProxy() {
  let health = await proxyHealth();
  if (health) {
    log(`proxy zaten çalışıyor (pid ${health.pid}, ${health.engine})`);
    return false;
  }
  log('proxy kapalı — başlatılıyor…');
  const logFile = path.join(process.env.USERPROFILE || process.env.HOME || rootDir, 'qorai-discovery-proxy.log');
  const out = fs.openSync(logFile, 'a');
  proxyProc = spawn(process.execPath, [path.join(rootDir, 'scripts', 'scraper-proxy.js'), String(PROXY_PORT)], {
    cwd: rootDir,
    stdio: ['ignore', out, out],
    windowsHide: true,
  });
  proxyProc.on('exit', (code) => { if (code) log(`proxy süreci çıktı (kod ${code}) — log: ${logFile}`); });

  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await sleep(2000);
    health = await proxyHealth();
    if (health) break;
  }
  if (!health) throw new Error('scraper proxy 180 sn içinde açılmadı — ' + logFile);
  // Chrome ayağa kalkmadan Epey isteği atmak ilk kategoriyi boş döndürüyor.
  const chromeDeadline = Date.now() + 120000;
  while (Date.now() < chromeDeadline && !health.browserConnected && !(health.flaresolverr && health.flaresolverr.available)) {
    await sleep(3000);
    health = (await proxyHealth()) || health;
  }
  log(`proxy hazır (${health.engine}${health.browserConnected ? ' · chrome bağlı' : ''})`);
  return true;
}

// ─── 1b) yerel çeviri worker'ı (GPU) ───────────────────────────────
// KÖK NEDEN (2026-08-05): worker kapalıyken ve DeepSeek bakiyesi bitikken
// çeviri SESSİZCE sözlüğe düşüyor; sözlükte olmayan atomlar TÜRKÇE kalıyor ve
// multiLangSpecs.en "dolu" göründüğü için ürün bir daha asla çevrilmiyordu.
// Sitede "Azami Baskı Resolution", "Charging Süresi" gibi yarım çeviriler
// bu yüzden oluştu. Artık koşu worker'ı kendisi ayağa kaldırıyor.
const XLATE_PORT = 8797;
let xlateProc = null;
async function xlateAlive() {
  try {
    const r = await request('GET', `http://127.0.0.1:${XLATE_PORT}/health`, null, {}, 4000);
    return r.status === 200;
  } catch (_) { return false; }
}
async function ensureTranslateWorker() {
  if (await xlateAlive()) { log('çeviri worker zaten çalışıyor (8797)'); return false; }
  const py = path.join(rootDir, 'scripts', 'translate-venv', 'Scripts', 'python.exe');
  const script = path.join(rootDir, 'scripts', 'nllb-translate-worker.py');
  if (!fs.existsSync(py) || !fs.existsSync(script)) {
    log('UYARI: çeviri worker kurulu değil — çeviri yalnız mevcut sözlükle yapılacak');
    return false;
  }
  log('çeviri worker kapalı — başlatılıyor (GPU)…');
  const logFile = path.join(process.env.USERPROFILE || process.env.HOME || rootDir, 'qorai-translate-worker.log');
  const out = fs.openSync(logFile, 'a');
  xlateProc = spawn(py, [script], { cwd: rootDir, stdio: ['ignore', out, out], windowsHide: true });
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await sleep(3000);
    if (await xlateAlive()) { log('çeviri worker hazır'); return true; }
  }
  log(`UYARI: çeviri worker 180 sn'de açılmadı — ${logFile}`);
  return false;
}
function stopTranslateWorker() {
  if (!xlateProc || xlateProc.killed) return;
  if (process.platform === 'win32') {
    try { execFile('taskkill', ['/pid', String(xlateProc.pid), '/T', '/F'], () => {}); } catch (_) { /* yok say */ }
  } else {
    try { xlateProc.kill('SIGTERM'); } catch (_) { /* yok say */ }
  }
}

function stopProxy() {
  if (!proxyProc || proxyProc.killed) return;
  // Proxy kendi Chrome'unu doğuruyor; ağaç halinde öldür yoksa arkada kalır.
  if (process.platform === 'win32') {
    try { execFile('taskkill', ['/pid', String(proxyProc.pid), '/T', '/F'], () => {}); } catch (_) { /* yok say */ }
  } else {
    try { process.kill(-proxyProc.pid, 'SIGTERM'); } catch (_) { try { proxyProc.kill('SIGTERM'); } catch (__) { /* yok say */ } }
  }
}

// ─── 2) PocketBase superuser oturumu ───────────────────────────────
async function pbSuperuserAuth(pbUrl) {
  const identity = env.POCKETBASE_ADMIN_EMAIL;
  const password = env.POCKETBASE_ADMIN_PASSWORD;
  if (!identity || !password) throw new Error('migration\\.env içinde POCKETBASE_ADMIN_EMAIL / _PASSWORD yok');
  const r = await request('POST', `${pbUrl}/api/collections/_superusers/auth-with-password`, { identity, password });
  if (r.status !== 200 || !r.body || !r.body.token) {
    throw new Error(`PB superuser girişi başarısız (${r.status}): ${JSON.stringify(r.body).slice(0, 300)}`);
  }
  return { token: r.body.token, record: r.body.record || r.body.admin || {} };
}

async function publishStatus(pbUrl, token, status) {
  try {
    const filter = encodeURIComponent('key="product_discovery_status"');
    const found = await request('GET', `${pbUrl}/api/collections/public_config/records?perPage=1&fields=id&filter=${filter}`, null, { Authorization: token });
    const rec = { key: 'product_discovery_status', value: status };
    if (found.status === 200 && found.body && found.body.items && found.body.items[0]) {
      await request('PATCH', `${pbUrl}/api/collections/public_config/records/${found.body.items[0].id}`, rec, { Authorization: token });
    } else {
      await request('POST', `${pbUrl}/api/collections/public_config/records`, rec, { Authorization: token });
    }
    log('durum public_config → product_discovery_status olarak yazıldı');
  } catch (e) {
    log(`durum yazılamadı (önemsiz): ${e.message}`);
  }
}

// ─── 3) başsız admin paneli ────────────────────────────────────────
async function runInBrowser(pbUrl, auth) {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    headless: HEADFUL ? false : 'new',
    // Uzun koşuda tek evaluate zaman aşımına düşmesin: yoklama yapıyoruz ama
    // yine de protokol zaman aşımını kapatıyoruz.
    protocolTimeout: 0,
    defaultViewport: { width: 1600, height: 1000 },
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
      '--window-size=1600,1000',
    ],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(180000);

    // Panelin girişi GitHub OAuth → superuser köprüsü; başsız koşuda OAuth
    // yapılamaz. Bunun yerine PocketBase SDK'sının okuduğu depoya geçerli
    // superuser oturumunu ÖNCEDEN koyuyoruz (SDK 0.21 `model`, 0.22+ `record`
    // anahtarını okur — ikisini de yazıyoruz).
    await page.evaluateOnNewDocument((token, record) => {
      try {
        localStorage.setItem('pocketbase_auth', JSON.stringify({ token, model: record, record }));
        sessionStorage.setItem('admin_email', String((record && record.email) || 'auto-run'));
      } catch (_) { /* yok say */ }
      window.qoraiHeadless = true;
    }, auth.token, auth.record);

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.startsWith('[auto-run]')) log(text);
      else if (msg.type() === 'error' && !/favicon|net::ERR_/i.test(text)) log(`  (sayfa hatası) ${text.slice(0, 300)}`);
    });
    page.on('pageerror', (err) => log(`  (js hatası) ${String(err && err.message || err).slice(0, 300)}`));

    log(`admin paneli açılıyor: ${PROXY_URL}/  ·  PB: ${pbUrl}`);
    await page.goto(`${PROXY_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.qoraiAutoRun === 'function', { timeout: 120000 });
    // Oturumun gerçekten yüklendiğini doğrula (paneli qoraiAutoRun açıyor —
    // bkz. auto_run.js ensureSession: sayfanın kendi DOMContentLoaded'ı
    // dinamik betik yükleyicisiyle yarıştığı için ona güvenilemiyor).
    const authed = await page.evaluate(() => {
      try { return !!(typeof getPb === 'function' && getPb().authStore && getPb().authStore.isValid); }
      catch (_) { return false; }
    });
    if (!authed) throw new Error('admin oturumu yüklenemedi — PB superuser token\'ı panelin PB adresine ait değil olabilir');
    log('admin oturumu hazır');

    // Koşuyu BAŞLAT ve bekleme; saatler sürebilir, tek evaluate'te asılı
    // kalmak yerine sonucu yokluyoruz.
    await page.evaluate((opts) => {
      window.qoraiAutoRunResult = null;
      window.qoraiAutoRunPromise = window.qoraiAutoRun(opts);
    }, OPTS);

    const started = Date.now();
    // Panel loglarını dosyaya akıt: scrape + puan `scraperLog`'a, çeviri ise
    // AYRI bir kutuya (`dictXlateLog`) yazıyor — ikisini de okumazsak gece
    // koşusunda çeviri adımı kör nokta kalıyor.
    const seen = { scraperLog: 0, dictXlateLog: 0 };
    // Yoklama HİÇ askıda kalmamalı. `page.evaluate` varsayılan olarak SÜRESİZ
    // bekler: renderer yanıt vermeyi bırakırsa (uzun koşuda log kutusu şişip
    // sekme donuyor) bu await asla dönmez, döngü aşağıdaki MAX_RUN_MS satırına
    // BİR DAHA hiç gelmez ve emniyet freni tam da yazıldığı arıza tipinde ölü
    // kod olur. 2026-08-09'da ölçüldü: panel son çıktısı 23:49, süreç 07:53'e
    // (8 sa 22 dk) kadar asılı kaldı, --max-hours=3 hiç devreye girmedi ve
    // haftalık zincirin bütün gününü yuttu.
    const POLL_TIMEOUT_MS = 90000;
    let stuckPolls = 0;
    for (;;) {
      await sleep(15000);
      const snap = await withTimeout(
        page.evaluate((prev) => {
          const read = (id, prevCount) => {
            const box = document.getElementById(id);
            const lines = box ? [...box.children].map((n) => n.textContent || '') : [];
            const from = Math.min(Math.max(prevCount, lines.length - 40), lines.length);
            return { total: lines.length, fresh: lines.slice(from) };
          };
          return {
            result: window.qoraiAutoRunResult || null,
            scraperLog: read('scraperLog', prev.scraperLog),
            dictXlateLog: read('dictXlateLog', prev.dictXlateLog),
          };
        }, seen),
        POLL_TIMEOUT_MS,
      ).catch((e) => {
        // Tek bir yavaş yoklama koşuyu öldürmesin; ÜST ÜSTE takılma öldürsün.
        if (++stuckPolls <= 4) {
          log(`  (uyarı) sayfa yoklaması yanıt vermedi (${stuckPolls}/4): ${e.message}`);
          return null;
        }
        throw new Error(`sayfa yanıt vermiyor: ${e.message}`);
      });

      // Zaman kontrolleri askıya DAYANMAYAN yerde: yoklama boş dönse de işler.
      if (Date.now() - started > MAX_RUN_MS) {
        throw new Error(`koşu ${Math.round(MAX_RUN_MS / 3600000)} saati aştı — durduruldu`);
      }
      if (!snap) continue;
      stuckPolls = 0;

      for (const key of ['scraperLog', 'dictXlateLog']) {
        for (const line of snap[key].fresh) {
          const t = String(line).trim();
          // [auto-run] satırları zaten console üzerinden geldi — tekrar basma.
          if (t && !t.includes('[auto-run]')) log(`  ${t}`);
        }
        seen[key] = snap[key].total;
      }

      if (snap.result) return snap.result;
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

// ─── ana akış ──────────────────────────────────────────────────────
(async () => {
  const startedAt = Date.now();
  log('═══ Qor AI — otomatik yeni ürün keşfi başlıyor ═══');
  log(OPTS.urls.length
    ? `ayarlar: HEDEFLİ ÇEKME · ${OPTS.urls.length} adres · çeviri=${OPTS.translate} · puan=${OPTS.score}`
    : `ayarlar: kategoriler=${OPTS.categories} · paralel=${OPTS.concurrency} · ` +
      `${OPTS.newestOnly ? `NOKTA ATIŞI (${OPTS.newestPages} sayfa/kategori)` : 'TAM KATALOG'} · ` +
      `çeviri=${OPTS.translate} · puan=${OPTS.score}`);

  const pbUrl = adminPanelPbUrl();
  if (!pbUrl) { log('HATA: PocketBase adresi bulunamadı (migration\\.env)'); process.exit(2); }

  let exitCode = 0;
  let result = null;
  let auth = null;
  let spawnedProxy = false;
  let spawnedXlate = false;
  try {
    auth = await pbSuperuserAuth(pbUrl);
    log('PocketBase superuser oturumu alındı');
    spawnedProxy = await ensureProxy();
    if (OPTS.translate) spawnedXlate = await ensureTranslateWorker();
    result = await runInBrowser(pbUrl, auth);
    if (!result.ok) exitCode = 1;
  } catch (e) {
    log(`HATA: ${e.message}`);
    result = { ok: false, error: e.message };
    exitCode = 1;
  } finally {
    if (spawnedProxy) { log("başlattığımız proxy kapatılıyor"); stopProxy(); }
    if (spawnedXlate) { log("başlattığımız çeviri worker kapatılıyor"); stopTranslateWorker(); }
  }

  const durationSec = Math.round((Date.now() - startedAt) / 1000);
  const scrape = (result && result.scrape) || {};
  log('───────────────────────────────────────────────');
  log(`ÖZET · ${durationSec}s · ${result && result.ok ? 'TAMAM' : 'HATA: ' + (result && result.error || '?')}`);
  log(`  yeni ürün       : ${scrape.added || 0}`);
  log(`  güncellenen     : ${scrape.updated || 0}`);
  log(`  zaten katalogda : ${scrape.skipped || 0}`);
  log(`  hata            : ${scrape.errors || 0}`);
  log(`  çeviri          : ${result && result.translated ? 'çalıştı' : 'atlandı'}`);
  log(`  puanlanan kat.  : ${(result && result.scoredCategories) || 0}`);
  log('═══ bitti ═══');

  if (auth) {
    await publishStatus(pbUrl, auth.token, {
      lastRunAt: new Date().toISOString(),
      ok: !!(result && result.ok),
      error: (result && result.error) || '',
      added: scrape.added || 0,
      updated: scrape.updated || 0,
      skipped: scrape.skipped || 0,
      errors: scrape.errors || 0,
      categories: scrape.categories || [],
      missingCategories: scrape.missingCats || [],
      translated: !!(result && result.translated),
      scoredCategories: (result && result.scoredCategories) || 0,
      durationSec,
      args: argv.join(' '),
    });
  }

  process.exit(exitCode);
})();
