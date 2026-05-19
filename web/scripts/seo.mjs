// ═══════════════════════════════════════════════════════════════
//  SEO build step — runs after vite build + postbuild.
//
//  Coolify serves website/ as plain static files with no SSR, so
//  non-JS crawlers (Facebook, WhatsApp, X, LinkedIn) only ever see
//  the raw HTML <head>. This script bakes per-page <title>, meta
//  description, canonical, Open Graph / Twitter cards and JSON-LD
//  into a real HTML file for every route and every product, then
//  emits sitemap.xml + robots.txt.
//
//  Googlebot still renders the SPA and picks up the same tags from
//  the runtime useSeo() hook — this guarantees parity for the rest.
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { catMeta } from '../src/lib/format.js';

const SITE = 'https://qorai.net';
const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', '..', 'website');
const templatePath = join(site, 'index.html');

// ── Typesense (read-only search key — same as web/src/lib/typesense.js) ──
const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_KEY = '9l6gsRj1V9NuXAagocxHJbhmaMgQex9GP7NRFqtT';
const TS_COLLECTION = 'products';

const DEFAULT_IMG = `${SITE}/assets/logo.png`;
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

// Renders the <head> SEO block injected between the seo markers.
function seoBlock({ title, description, url, image = DEFAULT_IMG, type = 'website', noindex = false, jsonLd = null }) {
  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow'}" />`,
    `<meta property="og:type" content="${esc(type)}" />`,
    '<meta property="og:site_name" content="Qor AI" />',
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
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

function writeHtml(routeDir, html) {
  const dir = routeDir ? join(site, routeDir) : site;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
}

// ── Typesense: pull the whole catalogue ─────────────────────────
async function fetchAllProducts() {
  const perPage = 250;
  const fields = 'id,name,brand,category,imageUrl,techScore,lowestPriceUSD';
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

// ── Per-product SEO ─────────────────────────────────────────────
function productSeo(d) {
  const name = d.name || 'Ürün';
  const category = d.category ? catMeta(d.category).label : '';
  const url = `${SITE}/product/${d.id}`;
  const image = d.imageUrl && /^https?:\/\//.test(d.imageUrl) ? d.imageUrl : DEFAULT_IMG;
  const score = Number(d.techScore) || 0;
  const title = category ? `${name} · ${category} — Qor AI` : `${name} — Qor AI`;
  const description = truncate(
    `${name}: ${d.brand ? `${d.brand}, ` : ''}${category || 'teknoloji ürünü'}. `
    + `${score > 0 ? `Qor AI teknik skoru ${score}/100. ` : ''}`
    + 'Özellikleri incele, karşılaştır ve yapay zekâ ile karar ver.',
  );
  const price = Number(d.lowestPriceUSD) || 0;
  const product = {
    '@type': 'Product',
    name,
    image,
    description,
    ...(d.brand ? { brand: { '@type': 'Brand', name: d.brand } } : {}),
    ...(category ? { category } : {}),
    ...(price > 0 ? {
      offers: {
        '@type': 'Offer', price: price.toFixed(2),
        priceCurrency: 'USD', url, availability: 'https://schema.org/InStock',
      },
    } : {}),
  };
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE}/` },
      ...(category ? [{ '@type': 'ListItem', position: 2, name: category, item: `${SITE}/` }] : []),
      { '@type': 'ListItem', position: category ? 3 : 2, name, item: url },
    ],
  };
  return {
    title, description, url, image, type: 'product',
    jsonLd: { '@context': 'https://schema.org', '@graph': [product, breadcrumb] },
  };
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
          { '@type': 'Organization', name: 'Qor AI', url: `${SITE}/`, logo: DEFAULT_IMG },
          {
            '@type': 'WebSite', name: 'Qor AI', url: `${SITE}/`,
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
    dir: 'quiz', path: '/quiz', changefreq: 'monthly', priority: '0.7',
    seo: {
      title: 'Kişisel Quiz — Qor AI',
      description: 'Birkaç soru yanıtla, Qor AI sana en uygun teknoloji ürününü önersin.',
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
  writeFileSync(
    join(site, '404.html'),
    renderPage(template, {
      title: 'Sayfa bulunamadı — Qor AI', description: 'Aradığın sayfa taşınmış olabilir.',
      url: `${SITE}/404`, noindex: true,
    }),
  );

  // 2) product pages
  let products = [];
  try {
    products = await fetchAllProducts();
    console.log(`[seo] fetched ${products.length} products from Typesense`);
  } catch (err) {
    console.warn(`[seo] product fetch failed (${err.message}) — skipping product prerender`);
  }

  for (const d of products) {
    if (!d || !d.id) continue;
    writeHtml(`product/${d.id}`, renderPage(template, productSeo(d)));
  }

  // 3) sitemap.xml
  const urls = [
    ...STATIC_ROUTES.filter((r) => !r.noindex).map((r) => ({
      loc: `${SITE}${r.path}`, changefreq: r.changefreq, priority: r.priority,
    })),
    ...products.filter((d) => d && d.id).map((d) => ({
      loc: `${SITE}/product/${d.id}`, changefreq: 'weekly', priority: '0.6',
    })),
  ];
  const sitemap =
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) =>
      `  <url><loc>${esc(u.loc)}</loc><lastmod>${NOW}</lastmod>`
      + `<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
    ).join('\n')
    + '\n</urlset>\n';
  writeFileSync(join(site, 'sitemap.xml'), sitemap);

  // 4) robots.txt
  writeFileSync(
    join(site, 'robots.txt'),
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /profile',
      '',
      `Sitemap: ${SITE}/sitemap.xml`,
      '',
    ].join('\n'),
  );

  console.log(`[seo] wrote ${STATIC_ROUTES.length} route shells, ${products.length} product pages, sitemap (${urls.length} urls), robots.txt`);
}

main().catch((err) => {
  console.error('[seo] fatal:', err);
  process.exit(1);
});
