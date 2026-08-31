// ═══════════════════════════════════════════════════════════════════════════
// KOD-ONLY DAĞITIM — katalog taramadan yeni JS/CSS paketini yayına hazırlar.
//
// NEDEN VAR
// ---------
// Canlı site commit'li `website/` dizininden servis ediliyor ve ön-render
// edilmiş ~8.000 sayfanın HER BİRİ paketin İÇERİK-HASH'Lİ adını HTML'ine
// gömüyor:
//     <script type="module" crossorigin src="/spa/index-DX707upK.js"></script>
// Yani SADECE arayüz kodu değişse bile o satır yüzünden bütün sayfalar
// geçersiz oluyordu ve tek çıkar yol tam `npm run build` idi: 107.685 ürünü
// Typesense'ten çekip 7.504 ürün kabuğunu, 450 karşılaştırmayı ve sitemap'i
// baştan üretmek — ~10 dakika, ve ürün sayısıyla BÜYÜYEN bir süre. Bu,
// projenin kendi kuralına aykırı (CLAUDE.md → "build time grows with the
// product count is wrong for this project").
//
// Oysa bir KOD değişikliğinde sayfaların İÇERİĞİ değişmiyor; değişen tek şey
// o `<script src>` referansı. Bu betik tam olarak onu yapar:
//   1. eski manifest'i saklar
//   2. yalnız `vite build` koşar (yeni spa/ parçaları üretilir)
//   3. `git restore website/` ile BÜTÜN HTML'i commit'li hâline döndürür
//      (yeni parçalar izlenmediği için silinmez) — böylece seo.mjs'in head'e
//      yazdığı lang/hreflang/JSON-LD/font-preload KAYBOLMAZ ve sitemap'in
//      `lastmod` değerleri OLDUĞU GİBİ kalır (churn üretmez)
//   4. HTML'lerdeki eski parça adlarını yeni adlarla değiştirir
//   5. hiçbir HTML var olmayan ya da bayat bir parçaya işaret etmiyor mu diye
//      DOĞRULAR — beyaz ekranın ve "değişiklik canlıda yok"un tek sebebi budur
//
// NE ZAMAN KULLANILMAZ: içerik değiştiğinde (yeni ürün, yeni analiz, yeni blog
// yazısı, sitemap tazeleme). Onlar `npm run build` ya da gece 04:17 cron'unun
// işi. Bu betik yalnız KOD dağıtımı içindir.
// ═══════════════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webDir = join(here, '..');
const repoDir = join(webDir, '..');
const siteDir = join(repoDir, 'website');
const manifestPath = join(siteDir, '.vite', 'manifest.json');

const log = (...a) => console.log('[kod-deploy]', ...a);
const die = (msg) => { console.error('[kod-deploy] BAŞARISIZ:', msg); process.exit(1); };

// `git status --porcelain website/` 8.000 satır dönebiliyor ve execSync'in
// varsayılan 1 MB maxBuffer'ını aşıp ENOBUFS ile PATLIYOR (build_safe.mjs bu
// tuzağa bir kez düştü).
const git = (...args) => execFileSync('git', args, {
  cwd: repoDir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
});

// ── PARÇA KİMLİĞİ ─────────────────────────────────────────────────────────
// Dosya adının hash'siz ön eki KİMLİK DEĞİL: `_Analyses-<hash>.js` (paylaşılan
// chunk) ile `src/pages/Analyses.jsx` (rota parçası) ikisi de
// `spa/Analyses-<hash>.js` üretiyor — ölçüldü, ilk sürüm tam burada durdu.
// Kimlik manifest ANAHTARINDAN türer:
//   · gerçek kaynak yolu olan anahtar → `src:<yol>`
//   · anonim chunk (`_Ad-<hash>.js`)  → `chunk:<ad>`
// Yer tutuculu (`!~{...}~`) yalnız-CSS girdileri ATLANIR; o dosyalar zaten
// sahibinin `css` dizisinde duruyor.
const PLACEHOLDER = /!~\{/;

function identityOf(key, entry) {
  if (PLACEHOLDER.test(key)) return null;
  if (key.startsWith('_')) {
    const ad = entry.name || key.replace(/^_/, '').replace(/-[A-Za-z0-9_-]{8,}\.[a-z]+$/, '');
    return `chunk:${ad}`;
  }
  return `src:${key}`;
}

// kimlik → { file, css: [...] }
function indexByIdentity(manifest, etiket) {
  const map = new Map();
  for (const [key, entry] of Object.entries(manifest)) {
    const id = identityOf(key, entry);
    if (!id) continue;
    if (map.has(id)) die(`${etiket} manifest'inde "${id}" iki kez geçiyor — eşleme belirsiz`);
    map.set(id, { file: entry.file || '', css: entry.css || [] });
  }
  return map;
}

// Manifest'teki GÜNCEL dosyaların tamamı. `spa/` altında eski hash'li dosyalar
// birikiyor (emptyOutDir:false), o yüzden "diskteki dosyalar" güvenilir bir
// kaynak DEĞİL — manifest güncel kümedir.
function manifestFiles(manifest) {
  const out = new Set();
  for (const entry of Object.values(manifest)) {
    if (entry.file) out.add(entry.file);
    for (const c of entry.css || []) out.add(c);
    for (const a of entry.assets || []) out.add(a);
  }
  return out;
}

// Bir girdinin css dizisinde eskiyi yeniye bağlarken sıraya değil ADA bakılır
// (rollup sırayı korur ama garanti etmez).
const cssKey = (f) => String(f).replace(/^spa\//, '').replace(/-[A-Za-z0-9_-]{8,}\.css$/, '');

function htmlFilesUnder(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name === '.vite' || name === 'spa' || name === 'assets') continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.html')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

// ── 1. Ön koşullar ────────────────────────────────────────────────────────
const kirli = git('status', '--porcelain', '--', 'website/')
  .split('\n').filter((l) => l.trim() && !l.startsWith('??'));
if (kirli.length) {
  die(`website/ kirli (${kirli.length} izlenen dosya). Önce \`git restore website/\` koş.`);
}
if (!existsSync(manifestPath)) die('website/.vite/manifest.json yok — önce bir kez tam build gerekiyor.');

const eskiManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const eskiIndex = indexByIdentity(eskiManifest, 'eski');
log(`eski manifest: ${eskiIndex.size} kimlik`);

// ── 2. Yalnız vite ────────────────────────────────────────────────────────
log('vite build ...');
// vite'ın JS girişini DOĞRUDAN node ile koş. `npx.cmd` Node 20+ üzerinde
// kabuk olmadan spawn edilemiyor (EINVAL) ve `shell: true` ile koşmak da
// Windows'ta argüman kaçışını kabuğa bırakır — ikisine de gerek yok.
const viteBin = join(webDir, 'node_modules', 'vite', 'bin', 'vite.js');
if (!existsSync(viteBin)) die(`vite bulunamadı: ${viteBin} (web/ içinde npm ci gerekiyor)`);
execFileSync(process.execPath, [viteBin, 'build'], {
  cwd: webDir, stdio: 'inherit', maxBuffer: 256 * 1024 * 1024,
});

const yeniManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const yeniDosyalar = manifestFiles(yeniManifest);
const yeniIndex = indexByIdentity(yeniManifest, 'yeni');
log(`yeni manifest: ${yeniIndex.size} kimlik`);

// ── 3. HTML'i commit'li hâline döndür ─────────────────────────────────────
// vite `website/index.html`i KENDİ şablonundan üretir ve seo.mjs'in eklediği
// head (kök dil en, hreflang'ler, JSON-LD @graph, font preload) SESSİZCE
// kaybolur. Yeni parçalar izlenmediği için restore onlara dokunmaz.
// YALNIZ index.html geri alınır — 8.000 dosyayı restore etmeye gerek YOK.
// vite'ın `website/` altında dokunduğu tek HTML odur; ön-render edilmiş
// ürün/kategori/analiz sayfalarına ve sitemap'e hiç el sürmez. Tam
// `git restore website/` Windows'ta dakikalar alıyordu ve hiçbir şey
// kazandırmıyordu.
log("index.html commit'li hâline döndürülüyor ...");
git('restore', '--', 'website/index.html');

// ── 4. Referansları yeniden yaz ───────────────────────────────────────────
const eskidenYeniye = new Map();
for (const [id, eski] of eskiIndex) {
  const yeni = yeniIndex.get(id);
  if (!yeni) continue;
  if (eski.file && yeni.file && eski.file !== yeni.file) eskidenYeniye.set(eski.file, yeni.file);
  const yeniCss = new Map((yeni.css || []).map((f) => [cssKey(f), f]));
  for (const eskiCss of eski.css || []) {
    const es = yeniCss.get(cssKey(eskiCss));
    if (es && es !== eskiCss) eskidenYeniye.set(eskiCss, es);
  }
}
log(`hash'i değişen parça: ${eskidenYeniye.size}`);
if (!eskidenYeniye.size) {
  log('kodda paket düzeyinde değişiklik yok — yapacak bir şey kalmadı.');
  process.exit(0);
}
for (const [a, b] of eskidenYeniye) log(`  ${a} → ${b}`);

const htmlDosyalari = htmlFilesUnder(siteDir);
let dokunulan = 0;
for (const p of htmlDosyalari) {
  const once = readFileSync(p, 'utf8');
  let sonra = once;
  for (const [eski, yeni] of eskidenYeniye) sonra = sonra.split(eski).join(yeni);
  if (sonra !== once) { writeFileSync(p, sonra); dokunulan += 1; }
}
log(`${dokunulan}/${htmlDosyalari.length} HTML güncellendi`);

// Manifest yeni hâliyle kalmalı — bir sonraki tam build'de seo.mjs onu okuyor.
writeFileSync(manifestPath, JSON.stringify(yeniManifest, null, 2));

// ── 5. DOĞRULAMA ──────────────────────────────────────────────────────────
// Her HTML'in işaret ettiği /spa/ dosyası (a) diskte VAR olmalı — yoksa canlıda
// BEYAZ EKRAN; (b) YENİ manifest kümesinde olmalı — değilse sayfa eski kodu
// yükler ve değişiklik canlıda görünmez (sessiz başarısızlık).
const REF = /\/spa\/([A-Za-z0-9._-]+\.(?:js|css))/g;
const eksik = new Map();
const bayat = new Map();
for (const p of htmlDosyalari) {
  for (const m of readFileSync(p, 'utf8').matchAll(REF)) {
    const rel = `spa/${m[1]}`;
    if (!existsSync(join(siteDir, 'spa', m[1]))) eksik.set(rel, (eksik.get(rel) || 0) + 1);
    else if (!yeniDosyalar.has(rel)) bayat.set(rel, (bayat.get(rel) || 0) + 1);
  }
}
if (eksik.size) {
  for (const [f, n] of eksik) console.error(`  EKSİK ${f} (${n} sayfa)`);
  die('HTML var olmayan bir pakete işaret ediyor — bu canlıda BEYAZ EKRAN demek.');
}
if (bayat.size) {
  for (const [f, n] of bayat) console.error(`  BAYAT ${f} (${n} sayfa)`);
  die("HTML güncel manifest'te olmayan bir pakete işaret ediyor — değişiklik canlıda görünmez.");
}

const degisen = git('status', '--porcelain', '--', 'website/')
  .split('\n').filter((l) => l.trim() && !l.startsWith('??')).length;
log(`doğrulama temiz · ${degisen} izlenen dosya değişti`);
log('sıradaki: git add -A website/ && commit && git push origin HEAD:master && node scripts/deploy_coolify_static.js website');
