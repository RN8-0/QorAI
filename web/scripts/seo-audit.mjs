import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', '..', 'website');
// Floor guards against a stripped/broken sitemap. The curated prerender emits a
// deduped subset (typically a few thousand), so 800 is a safe regression floor.
const minProductUrls = Number(process.env.SEO_MIN_PRODUCT_URLS || 800);

function read(rel) {
  const file = join(site, rel);
  if (!existsSync(file)) throw new Error(`${rel} is missing`);
  return readFileSync(file, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sitemapFiles(indexXml) {
  const fromIndex = [...indexXml.matchAll(/<loc>https:\/\/qorai\.net\/(sitemap-\d+\.xml)<\/loc>/g)].map((m) => m[1]);
  return fromIndex.length ? fromIndex : ['sitemap.xml'];
}

// #root prerender body — same boundary seo.mjs writes: the root div closes
// immediately before the first following <script> tag.
function rootBody(html) {
  // `</div>` ile `<script>` arasina HTML YORUMU girebilir (index.html'deki
  // aciklamalar). Eskiden desen buna izin vermiyordu ve tek bir yorum eklemek
  // TUM urun sayfalarini "prerender body is missing" diye hatali gosteriyordu.
  const m = html.match(/<div id="root">([\s\S]*?)<\/div>(?=(?:\s|<!--[\s\S]*?-->)*<script)/);
  return m ? m[1].trim() : '';
}

function h1Text(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  return m ? m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
}

function titleText(html) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

// First N subdirectories of website/<kind>/ that contain an index.html.
function sampleDirs(kind, n) {
  const root = join(site, kind);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, e.name, 'index.html')))
    .slice(0, n)
    .map((e) => `${kind}/${e.name}`);
}

function main() {
  const robots = read('robots.txt');
  assert(/Sitemap:\s*https:\/\/qorai\.net\/sitemap\.xml/.test(robots), 'robots.txt must reference sitemap.xml');
  assert(/Disallow:\s*\/go\b/.test(robots), 'robots.txt should block affiliate redirect crawling');

  // `product/index.html` id'siz `/product` yolunun BOŞ kabuğudur — hiçbir
  // içerik render etmez, sitemap'te de yoktur. Bu yüzden noindex OLMALI; aksi
  // halde Google onu bulup boş sayfa indeksliyordu. Indekslenebilirlik kontrolü
  // GERÇEK ürün sayfalarında yapılır (product/<slug>-<id>/index.html).
  const productPlaceholder = read('product/index.html');
  assert(
    /<meta name="robots" content="noindex/i.test(productPlaceholder),
    'empty /product placeholder must be noindex',
  );

  const realProductDirs = sampleDirs('product', 3);
  assert(realProductDirs.length > 0, 'no prerendered product pages found');
  for (const dir of realProductDirs) {
    const shell = read(`${dir}/index.html`);
    assert(!/<meta name="robots" content="noindex/i.test(shell), `${dir} must be indexable`);
    assert(/max-image-preview:large/.test(shell), `${dir} must allow large image previews`);
    assert(rootBody(shell).length > 200, `${dir} prerender body is missing or too small`);
  }

  // ── uniqueness guard ──────────────────────────────────────────────────────
  // The nightly cron runs seo.mjs without a vite build; a template-sanitisation
  // regression once made EVERY page inherit the homepage's #root body — ~7.8k
  // identical pages, which search engines classify as scaled/duplicate content
  // and suppress sitewide. Any recurrence must abort the run BEFORE the cron
  // commits/pushes/deploys (it runs this audit under `set -e`).
  const home = read('index.html');
  const homeRoot = rootBody(home);
  const homeH1 = h1Text(home);
  assert(homeRoot.length > 500, 'homepage #root prerender body is missing or too small');
  assert(homeH1, 'homepage prerender must carry an <h1>');

  const staticPages = ['about', 'privacy', 'terms', 'refund', 'cookies', 'contact', 'faq', 'premium', 'subscriptions', 'link-analysis', 'quiz', 'ai-chat', 'tr'];
  const samples = [
    ...staticPages,
    ...sampleDirs('product', 25),
    ...sampleDirs('compare', 10),
    ...sampleDirs('category', 10),
    ...sampleDirs('blog', 5),
  ];
  let checked = 0;
  for (const rel of samples) {
    const file = `${rel}/index.html`;
    if (!existsSync(join(site, file))) continue;
    const html = read(file);
    const body = rootBody(html);
    assert(body, `${rel}: #root prerender body is empty`);
    assert(body !== homeRoot, `${rel}: #root body is a clone of the homepage — template sanitisation regression`);
    const h1 = h1Text(html);
    assert(h1, `${rel}: prerender body has no <h1>`);
    if (rel !== 'en') {
      assert(h1 !== homeH1, `${rel}: <h1> equals the homepage h1 — page lost its own body`);
    }
    // Product/compare pages: <h1> (product name) must lead the <title>, so the
    // head and the prerendered body always describe the SAME product.
    if (rel.startsWith('product/') || rel.startsWith('compare/')) {
      const title = titleText(html);
      const probe = h1.slice(0, 12).toLowerCase();
      assert(probe && title.toLowerCase().includes(probe), `${rel}: <title> (“${title}”) does not match its <h1> (“${h1}”)`);
    }
    checked += 1;
  }
  assert(checked >= 20, `uniqueness guard sampled too few pages (${checked}) — prerender output looks incomplete`);

  // ── KALITE KAPILARI (2026-08-21) ──────────────────────────────────────────
  // Bu denetim bugune kadar YAPIYI kontrol ediyordu (kabuk var mi, noindex mi,
  // klon mu) ama METNIN KENDISINI hic okumuyordu. Uc kusur tam da bu yuzden
  // aylarca yayinda kaldi ve ancak elle sayilinca gorundu:
  //   · basliklarin %80,2'si (TR) kelime ortasinda `…` ile bitiyordu
  //   · EN aciklamalarin %64,2'sinde Turkce spec etiketi vardi
  //   · sayfalarin %60'i baslikta fiyat vaat edip govdede fiyat gostermiyordu
  // Uculu de artik derlemeyi KIRAR. Esikler "biraz bozuk kabul edilebilir"
  // demek degil; veri bosluklarina (orn. cevirisi olmayan urun adi) karsi
  // gurultu payi, ve asildiklarinda hata mesaji sayiyi soyler.
  const qaSamples = [
    ...sampleDirs('product', 120),
    ...sampleDirs('tr/product', 120),
    ...sampleDirs('de/product', 120),
    ...sampleDirs('compare', 60),
  ];
  assert(qaSamples.length >= 100, `quality gate sampled too few pages (${qaSamples.length})`);

  // Turkce'ye ozgu harf ya da sik gecen Turkce spec koku. Korunan teknik
  // atomlar (Wi-Fi, USB, RAM, NFC...) her iki dilde de ayni yazildigi icin
  // listede YOK — onlar sizinti degil.
  const TR_IZ = /[çğıİöşüÇĞŞÜÖ]|(^|[^a-zA-Z])(Var|Yok|Adet|Boyutu|Sayısı|Gücü|Hızı|Süresi|Kontrolü|Özellik|Ağırlık|Çözünürlük|Kapasite)([^a-zA-Z]|$)/;
  const EN_IZ = /(^|[^a-zA-Z])(Yes|No|Count|Charging|General|Specifications|Screen size|Battery capacity|Rear camera|Front camera|Operating system|Refresh rate|Storage|Weight|Number of|Resolution|Support)([^a-zA-Z]|$)/;
  // Para birimi: fmtMoney ciktisi — ₺33.999 · 33.999 € · $33,999
  const PARA = /[₺$€£]|\b(?:TRY|EUR|USD|GBP)\b/;

  let kesikBaslik = 0;
  let specSizinti = 0;
  let specKontrol = 0;
  let vaatAcik = 0;
  const ornek = { baslik: '', sizinti: '', vaat: '' };

  for (const dir of qaSamples) {
    const html = read(`${dir}/index.html`);
    const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    // Sayfanin dili yol onekinden: /tr/... = tr, digeri en.
    const lang = dir.startsWith('tr/') ? 'tr' : 'en';

    if (title.includes('…')) {
      kesikBaslik += 1;
      if (!ornek.baslik) ornek.baslik = `${dir} → ${title}`;
    }

    const body = rootBody(html);
    // Ön-render spec satirlari: productBody/compareBody <li> ve <td> uretir.
    // Urun ADI bilerek disarida: cevirisi olmayan ad ayri bir veri sorunu ve
    // bu kapinin olctugu sey degil.
    const urunSatirlari = [...body.matchAll(/<li><span style="color:#64748b">([\s\S]*?)<\/span>\s*<strong>([\s\S]*?)<\/strong><\/li>/g)]
      .map((m) => `${m[1]} ${m[2]}`);
    // Karsilastirma sayfasi ayni spec'leri <td> olarak basar (cmpRow). Bunlar
    // kapiya dahil DEGILDI; 3.864 compare sayfasi olcumsuz kaliyordu.
    const cmpSatirlari = [...body.matchAll(/<tr><td style="padding:7px 12px;color:#64748b[^"]*">([\s\S]*?)<\/td>([\s\S]*?)<\/tr>/g)]
      .map((m) => `${m[1]} ${m[2].replace(/<[^>]+>/g, ' ')}`);
    const specMetni = [...urunSatirlari, ...cmpSatirlari]
      .join(' | ')
      .replace(/<[^>]+>/g, ' ');
    if (specMetni.trim()) {
      specKontrol += 1;
      const kirli = lang === 'tr' ? EN_IZ.test(specMetni) : TR_IZ.test(specMetni);
      if (kirli) {
        specSizinti += 1;
        if (!ornek.sizinti) ornek.sizinti = `${dir} → ${specMetni.slice(0, 120)}`;
      }
    }

    // Baslikta fiyat vaadi varsa govdede gercek bir fiyat BULUNMALI.
    if (/\b(Fiyat|Fiyatı|Price|Preis)\b/.test(title) && !PARA.test(body)) {
      vaatAcik += 1;
      if (!ornek.vaat) ornek.vaat = `${dir} → ${title}`;
    }
  }

  assert(
    kesikBaslik === 0,
    `${kesikBaslik}/${qaSamples.length} <title> kelime ortasinda kesilmis (…). fitTitle() parca dusurmeli, kirpmamali. Ornek: ${ornek.baslik}`,
  );
  assert(
    vaatAcik === 0,
    `${vaatAcik}/${qaSamples.length} sayfa baslikta fiyat vaat edip govdede fiyat gostermiyor. Ornek: ${ornek.vaat}`,
  );
  const sizintiOran = specKontrol ? (specSizinti / specKontrol) * 100 : 0;
  assert(
    sizintiOran <= 5,
    `spec satirlarinin %${sizintiOran.toFixed(1)}'i yanlis dilde (${specSizinti}/${specKontrol}). `
    + `Ceviri admin/js/spec_i18n.js'ten gelmeli. Ornek: ${ornek.sizinti}`,
  );
  console.log(
    `[seo-audit] kalite: ${qaSamples.length} sayfa · kesik baslik 0 · fiyat vaadi acigi 0 · `
    + `spec dil sizintisi ${specSizinti}/${specKontrol} (%${sizintiOran.toFixed(1)})`,
  );

  const sitemapIndex = read('sitemap.xml');
  const files = sitemapFiles(sitemapIndex);
  let total = 0;
  let product = 0;
  let category = 0;
  let badAmp = 0;
  let todayStamps = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const file of files) {
    const xml = read(file);
    total += [...xml.matchAll(/<url>/g)].length;
    product += [...xml.matchAll(/<loc>https:\/\/qorai\.net\/product\//g)].length;
    category += [...xml.matchAll(/\/category\/[a-z0-9]/g)].length;
    badAmp += [...xml.matchAll(/<loc>[^<]*&(?!(?:amp|lt|gt|quot|apos);)[^<]*<\/loc>/g)].length;
    todayStamps += [...xml.matchAll(new RegExp(`<lastmod>${today}</lastmod>`, 'g'))].length;
  }

  assert(total > minProductUrls, `sitemap has too few URLs (${total})`);
  assert(product >= minProductUrls, `sitemap has too few product URLs (${product})`);
  assert(category >= 10, `sitemap has too few category URLs (${category})`);
  assert(badAmp === 0, 'sitemap contains unescaped ampersands');
  // lastmod must reflect real content changes. If most of the sitemap is stamped
  // with the BUILD DATE, the build is churning dates again and teaching crawlers
  // to ignore it (bu daha önce yaşandı).
  //
  // İSTİSNA — SEO_CONTENT_VERSION: ön-render çıktısı toplu değiştiğinde
  // (ör. 2026-08-05'te kök adresin dili TR→EN) her sayfa GERÇEKTEN o gün
  // değişmiştir ve lastmod bunu söylemelidir. O tarih seo.mjs'te SABİT bir
  // değerdir; ertesi gün build alınsa bile İLERLEMEZ, dolayısıyla churn
  // oluşturmaz. Churn = tarih her build'de bugüne kayar; taban = sabit kalır.
  // Bu yüzden yalnız "sabit taban BUGÜNE eşitse" muafiyet tanınıyor.
  let contentVersion = '';
  try {
    const seoSrc = readFileSync(join(here, 'seo.mjs'), 'utf8');
    contentVersion = (seoSrc.match(/SEO_CONTENT_VERSION\s*=\s*'(\d{4}-\d{2}-\d{2})'/) || [])[1] || '';
  } catch { /* seo.mjs okunamazsa muafiyet yok */ }
  const versionIsToday = contentVersion && contentVersion === today;
  assert(
    versionIsToday || todayStamps < total * 0.5,
    `sitemap stamps today's date on ${todayStamps}/${total} URLs — lastmod churn regression`
    + ` (SEO_CONTENT_VERSION=${contentVersion || 'yok'})`,
  );
  if (versionIsToday) {
    console.log(`[seo-audit] not: SEO_CONTENT_VERSION=${contentVersion} bugüne eşit — toplu lastmod bilinçli (churn değil)`);
  }

  // ── KIRIK PAKET REFERANSI DENETIMI (2026-08-18) ─────────────────────────
  // CANLI OLAY: /tr/compare BEYAZ EKRAN veriyordu. O kabuklar
  // aylar once elle eklenip bir daha uretilmemisti; icindeki
  // `spa/index-TkhoIV_k.js` silinmisti -> 404 -> SPA hic boot etmiyor.
  // Boyle bir kabugun canliya bir daha CIKMAMASI icin derleme burada durur.
  // (postbuild.mjs artik dil onekli kabuklari her derlemede yeniden yaziyor;
  // bu denetim o guvencenin BOZULMADIGINI dogrular.)
  const kirikKabuklar = [];
  const paketVar = new Map();
  const paketiKontrolEt = (rel) => {
    if (!paketVar.has(rel)) paketVar.set(rel, existsSync(join(site, rel)));
    return paketVar.get(rel);
  };
  const kabukGez = (dir, derinlik = 0) => {
    if (derinlik > 3) return;
    let girisler = [];
    try { girisler = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of girisler) {
      if (e.isDirectory()) {
        // urun/karsilastirma agaci on yuzlerce dizin — orada da ayni kabuk
        // kullanildigi icin ilk seviyeler yeterli kanit.
        if (['spa', 'assets', '.vite', 'guides', 'blog'].includes(e.name)) continue;
        kabukGez(join(dir, e.name), derinlik + 1);
      } else if (e.name === 'index.html') {
        let html = '';
        try { html = readFileSync(join(dir, e.name), 'utf8'); } catch { continue; }
        for (const ref of new Set(html.match(/spa\/[A-Za-z0-9_-]+\.js/g) || [])) {
          if (!paketiKontrolEt(ref)) kirikKabuklar.push(`${relative(site, join(dir, e.name))} -> ${ref}`);
        }
      }
    }
  };
  kabukGez(site);
  assert(
    kirikKabuklar.length === 0,
    `${kirikKabuklar.length} kabuk ARTIK VAR OLMAYAN bir pakete isaret ediyor `
    + `(canlida BEYAZ EKRAN): ${kirikKabuklar.slice(0, 10).join(' | ')}`,
  );

  console.log(`[seo-audit] ok: ${files.length} sitemap file(s), ${total} urls, ${product} products, ${category} categories, ${checked} unique-body samples, kirik kabuk 0`);
}

try {
  main();
} catch (err) {
  console.error(`[seo-audit] failed: ${err.message}`);
  process.exit(1);
}
