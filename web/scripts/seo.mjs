// ═══════════════════════════════════════════════════════════════
//  SEO build step — runs after vite build + postbuild.
//
//  Coolify serves website/ as plain static files with no SSR, so
//  non-JS crawlers (Facebook, WhatsApp, X, LinkedIn) only ever see
//  the raw HTML <head>. This script bakes per-page <title>, meta
//  description, canonical, Open Graph / Twitter cards and JSON-LD
//  into a real HTML file for every route, then emits sitemap.xml + robots.txt.
//
//  Googlebot still renders the SPA and picks up the same tags from
//  the runtime useSeo() hook — this guarantees parity for the rest.
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, rmSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SITE = 'https://qorai.net';
const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', '..', 'website');
const templatePath = join(site, 'index.html');

// ── Typesense (read-only search key — same as web/src/lib/typesense.js) ──
const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_KEY = 'BFc7h2MZhq5yct2GxzkClzQtzzCglKIb';
const TS_COLLECTION = 'products';

const DEFAULT_IMG = `${SITE}/assets/qor_logo_512.png?v=20260605a`;
const NOW = new Date().toISOString().slice(0, 10);

// ── helpers ─────────────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function truncate(s, max = 158) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function slugifyProduct(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function productPath(product) {
  const id = String(product?.id || '').trim();
  if (!id) return '';
  const slug = slugifyProduct(product.slug || product.name || '');
  const qs = new URLSearchParams();
  if (slug) qs.set('slug', slug);
  qs.set('id', id);
  return `/product?${qs.toString()}`;
}

function categoryPath(category) {
  const cat = String(category || '').trim().toLowerCase();
  return cat ? `/category?cat=${encodeURIComponent(cat)}` : '';
}

function lastmodFromTs(value) {
  const n = Number(value) || 0;
  if (!n) return NOW;
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? NOW : d.toISOString().slice(0, 10);
}

// Renders the <head> SEO block injected between the seo markers.
function seoBlock({ title, description, url, image = DEFAULT_IMG, imageAlt = title, type = 'website', noindex = false, jsonLd = null }) {
  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'}" />`,
    `<meta property="og:type" content="${esc(type)}" />`,
    '<meta property="og:site_name" content="Qor AI" />',
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:alt" content="${esc(imageAlt)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    `<meta name="twitter:image:alt" content="${esc(imageAlt)}" />`,
  ];
  if (jsonLd) {
    lines.push(`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`);
  }
  return lines.join('\n  ');
}

function renderPage(template, seo) {
  return template.replace(
    /<!-- seo:start -->[\s\S]*?<!-- seo:end -->/,
    `<!-- seo:start -->\n  ${seoBlock(seo)}\n  <!-- seo:end -->`,
  );
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeTextFile(file, body, { optional = false } = {}) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  let lastErr = null;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      writeFileSync(tmp, body);
      try { rmSync(file, { force: true }); } catch (_) {}
      renameSync(tmp, file);
      return true;
    } catch (err) {
      lastErr = err;
      try { rmSync(tmp, { force: true }); } catch (_) {}
      if (!['UNKNOWN', 'EPERM', 'EBUSY', 'EACCES'].includes(err?.code) || attempt === 8) break;
      sleepSync(80 * attempt);
    }
  }
  if (optional) {
    console.warn(`[seo] skipped locked file ${file}: ${lastErr?.message || lastErr}`);
    return false;
  }
  throw lastErr;
}

function writeHtml(routeDir, html) {
  const dir = routeDir ? join(site, routeDir) : site;
  mkdirSync(dir, { recursive: true });
  writeTextFile(join(dir, 'index.html'), html);
}

// ── Typesense: pull the whole catalogue ─────────────────────────
async function fetchAllProducts() {
  const perPage = 250;
  const fields = 'id,name,slug,brand,category,imageUrl,techScore,lowestPriceUSD,specsCount,updatedAtTs,scrapedAtTs';
  const page = async (p) => {
    const qs = new URLSearchParams({
      q: '*', query_by: 'name', sort_by: 'techScore:desc',
      per_page: String(perPage), page: String(p), include_fields: fields,
    });
    const res = await fetch(
      `${TS_URL}/collections/${TS_COLLECTION}/documents/search?${qs}`,
      { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } },
    );
    if (!res.ok) throw new Error(`Typesense ${res.status}`);
    return res.json();
  };

  const first = await page(1);
  const total = first.found || 0;
  const out = (first.hits || []).map((h) => h.document);
  const lastPage = Math.ceil(total / perPage);
  for (let p = 2; p <= lastPage; p += 1) {
    const res = await page(p);
    (res.hits || []).forEach((h) => out.push(h.document));
  }
  return out;
}

// ── Static routes ───────────────────────────────────────────────
const STATIC_ROUTES = [
  {
    dir: '', path: '/', changefreq: 'daily', priority: '1.0',
    seo: {
      title: 'Qor AI — Yapay Zekâ Ürün Danışmanı',
      description: 'Teknoloji ürünlerini ve dijital abonelikleri yapay zekâ ile keşfet, karşılaştır ve karar ver. Telefonlar, laptoplar, GPU\'lar ve daha fazlası — Qor AI ile analiz edildi.',
      type: 'website',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'Organization', '@id': `${SITE}/#organization`, name: 'Qor AI', url: `${SITE}/`, logo: DEFAULT_IMG },
          {
            '@type': 'WebSite', '@id': `${SITE}/#website`, name: 'Qor AI', url: `${SITE}/`,
            publisher: { '@id': `${SITE}/#organization` },
            potentialAction: {
              '@type': 'SearchAction',
              target: `${SITE}/?q={search_term_string}`,
              'query-input': 'required name=search_term_string',
            },
          },
        ],
      },
    },
  },
  {
    dir: 'category', path: '/category', changefreq: 'daily', priority: '0.9',
    seo: {
      title: 'Kategoriler — Qor AI',
      description: 'AI puanlı teknoloji ürünlerini kategoriye göre keşfet. Marka, fiyat ve özelliklere göre filtrele; akıllı telefon, laptop, GPU ve daha fazlasını karşılaştır.',
    },
  },
  {
    dir: 'product', path: '/product', sitemap: false,
    seo: {
      title: 'Ürün özellikleri ve karşılaştırma — Qor AI',
      description: 'Qor AI ürün detay sayfası. Ürün özelliklerini, teknik skoru, görselleri ve karşılaştırma seçeneklerini incele.',
    },
  },
  {
    dir: 'compare', path: '/compare', changefreq: 'weekly', priority: '0.8',
    seo: {
      title: 'Ürün Karşılaştır — Qor AI',
      description: '4 ürüne kadar yan yana, özellik özellik karşılaştır. Qor AI skorları ve kazanan değer vurgusuyla doğru kararı ver.',
    },
  },
  {
    dir: 'link-analysis', path: '/link-analysis', changefreq: 'weekly', priority: '0.8',
    seo: {
      title: 'Link Analizi — Qor AI',
      description: 'Herhangi bir ürün bağlantısını yapıştır — Qor AI ürünü tanısın, artılarını ve eksilerini özetlesin, birden fazla linki karşılaştırsın.',
    },
  },
  {
    dir: 'subscriptions', path: '/subscriptions', changefreq: 'weekly', priority: '0.8',
    seo: {
      title: 'Abonelik Karşılaştırma — Qor AI',
      description: 'Netflix, Spotify, YouTube Premium ve daha fazlasını fiyat, özellik ve değer açısından yapay zekâ ile karşılaştır.',
    },
  },
  {
    dir: 'premium', path: '/premium', changefreq: 'weekly', priority: '0.8',
    seo: {
      title: 'Premium — Qor AI',
      description: 'Qor AI Premium planlarını karşılaştır: ücretsiz kullanım, Pro aylık ve Pro yıllık AI analiz özellikleri.',
    },
  },
  {
    dir: 'quiz', path: '/quiz', changefreq: 'monthly', priority: '0.7',
    seo: {
      title: 'Kişisel Quiz — Qor AI',
      description: 'Birkaç soru yanıtla, Qor AI sana en uygun teknoloji ürününü önersin.',
    },
  },
  {
    dir: 'go', path: '/go', noindex: true,
    seo: {
      title: 'Mağazaya yönlendiriliyor — Qor AI',
      description: 'Qor AI mağaza yönlendirme sayfası.',
      noindex: true,
    },
  },
  {
    dir: 'ai-chat', path: '/ai-chat', changefreq: 'monthly', priority: '0.7',
    seo: {
      title: 'Qor AI Sohbet — Yapay Zekâ Danışman',
      description: 'Telefon, laptop, kulaklık ya da abonelik — sorunu sor, Qor AI yapay zekâ danışmanından anında öneri al.',
    },
  },
  {
    dir: 'profile', path: '/profile', noindex: true,
    seo: { title: 'Profilim — Qor AI', description: 'Qor Coin bakiyen, karşılaştırmaların, analizlerin ve yorumların.', noindex: true },
  },
  {
    dir: 'settings', path: '/settings', noindex: true,
    seo: { title: 'Ayarlar — Qor AI', description: 'Tema, dil ve hesap ayarları.', noindex: true },
  },
];

// ── main ────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(templatePath)) {
    console.error('[seo] website/index.html not found — run vite build first');
    process.exit(1);
  }
  const template = readFileSync(templatePath, 'utf8');

  // 1) static route shells with real per-route meta
  for (const r of STATIC_ROUTES) {
    writeHtml(r.dir, renderPage(template, { ...r.seo, url: `${SITE}${r.path}` }));
  }
  // 404 shell — noindex, keeps deep-link fallback working
  writeTextFile(
    join(site, '404.html'),
    renderPage(template, {
      title: 'Sayfa bulunamadı — Qor AI', description: 'Aradığın sayfa taşınmış olabilir.',
      url: `${SITE}/404`, noindex: true,
    }),
  );

  // 2) catalogue fetch — for sitemap discovery only.
  //    We deliberately DO NOT prerender a static HTML file per product.
  //    Doing so wrote 100k+ tiny files into the repo (every build = a
  //    100k-file diff) for near-zero gain: Googlebot renders the SPA and
  //    reads the same per-product <head> from the runtime useSeo() hook.
  //    The sitemap below lists every product with a static-safe
  //    /product?slug=...&id=... URL that carries the product name.
  let products = [];
  try {
    products = await fetchAllProducts();
    console.log(`[seo] fetched ${products.length} products from Typesense`);
  } catch (err) {
    if (process.env.SEO_ALLOW_EMPTY_CATALOG === '1') {
      console.warn(`[seo] product fetch failed (${err.message}) — sitemap will list routes only because SEO_ALLOW_EMPTY_CATALOG=1`);
    } else {
      throw new Error(`product fetch failed; refusing to publish a stripped sitemap (${err.message})`);
    }
  }

  // 3) sitemap — chunked into <=45k-URL files (sitemaps cap at 50k) with a
  //    sitemap index. A single 106k-URL sitemap is invalid per the spec.
  const CHUNK = 45000;
  const routeUrls = STATIC_ROUTES.filter((r) => r.sitemap !== false && !r.noindex && !r.seo?.noindex).map((r) => ({
    loc: `${SITE}${r.path}`, changefreq: r.changefreq, priority: r.priority,
  }));
  const categoryUrls = [...new Set(products.map((d) => categoryPath(d?.category)).filter(Boolean))]
    .sort()
    .map((path) => ({
      loc: `${SITE}${path}`, changefreq: 'weekly', priority: '0.8',
    }));
  const productUrls = products.filter((d) => d?.id && d?.name).map((d) => ({
    loc: `${SITE}${productPath(d)}`, lastmod: lastmodFromTs(d.updatedAtTs || d.scrapedAtTs), changefreq: 'weekly', priority: '0.6',
  }));
  const allUrls = [...routeUrls, ...categoryUrls, ...productUrls];

  const renderUrlset = (items) =>
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + items.map((u) =>
      `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod || NOW}</lastmod>`
      + `<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
    ).join('\n')
    + '\n</urlset>\n';

  for (const file of readdirSync(site).filter((name) => /^sitemap-\d+\.xml$/.test(name))) {
    try { rmSync(join(site, file), { force: true }); } catch (_) {}
  }

  const chunks = [];
  for (let i = 0; i < allUrls.length; i += CHUNK) chunks.push(allUrls.slice(i, i + CHUNK));
  let sitemapFiles = 1;
  if (chunks.length <= 1) {
    writeTextFile(join(site, 'sitemap.xml'), renderUrlset(chunks[0] || []), { optional: true });
  } else {
    chunks.forEach((c, i) => {
      writeTextFile(join(site, `sitemap-${i + 1}.xml`), renderUrlset(c), { optional: true });
    });
    const index =
      '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + chunks.map((_, i) =>
        `  <sitemap><loc>${SITE}/sitemap-${i + 1}.xml</loc><lastmod>${NOW}</lastmod></sitemap>`,
      ).join('\n')
      + '\n</sitemapindex>\n';
    writeTextFile(join(site, 'sitemap.xml'), index, { optional: true });
    sitemapFiles = chunks.length + 1;
  }

  // 4) robots.txt
  writeTextFile(
    join(site, 'robots.txt'),
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /go',
      '',
      `Sitemap: ${SITE}/sitemap.xml`,
      '',
    ].join('\n'),
  );

  console.log(`[seo] wrote ${STATIC_ROUTES.length} route shells, ${sitemapFiles} sitemap file(s) for ${allUrls.length} urls (no per-product prerender), robots.txt`);
}

main().catch((err) => {
  console.error('[seo] fatal:', err);
  process.exit(1);
});
