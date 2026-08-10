import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
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

  const staticPages = ['about', 'privacy', 'terms', 'refund', 'cookies', 'contact', 'faq', 'premium', 'subscriptions', 'link-analysis', 'quiz', 'ai-chat', 'tr', 'de'];
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
    if (rel !== 'en' && rel !== 'de') {
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

  console.log(`[seo-audit] ok: ${files.length} sitemap file(s), ${total} urls, ${product} products, ${category} categories, ${checked} unique-body samples`);
}

try {
  main();
} catch (err) {
  console.error(`[seo-audit] failed: ${err.message}`);
  process.exit(1);
}
