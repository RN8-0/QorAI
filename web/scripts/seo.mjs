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
import { categoryLabel } from '../src/lib/format.js';

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
  // Clean, path-based URL: /product/<slug>-<id>. Must stay identical to the
  // SPA's productPath() in web/src/lib/routes.js so the prerendered file path,
  // its <link rel=canonical>, the runtime canonical and the sitemap <loc> all
  // agree on one URL per product.
  return slug ? `/product/${slug}-${id}` : `/product/${id}`;
}

// Collapses cosmetic SKU variants (colour / strap / storage, often in German
// from Geizhals) down to one representative model so the curated prerender set
// is real distinct models, not 50 near-identical pages of the same watch.
function modelKey(name) {
  let s = String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  s = s.replace(/\([^)]*\)/g, ' '); // drop "(512 GB)" etc.
  // colours, materials, straps/cases and connectivity tags — the cosmetic SKU
  // axes that produce near-identical pages of the same model (esp. watches).
  s = s.replace(/\b(schwarz|weiss|blau|rot|gruen|grun|grau|silber|gold|rosa|pink|lila|violett|braun|beige|titan|titanium|graphit|mitternacht|sternenlicht|polarstern|polar|space|grey|gray|black|white|blue|red|green|silver|midnight|starlight|purple|yellow|orange|olive|stone|seashell|mit|ohne|und|with|armband|sportarmband|sportband|band|loop|solo|braided|gehause|gehaeuse|case|alpine|trail|ocean|milanese|sport|nike|hermes|aluminium|alu|edelstahl|stainless|keramik|ceramic|leder|leather|nylon|dual|sim|edition|version|cellular|gps|wifi)\b/g, ' ');
  s = s.replace(/\b\d+\s?(gb|tb|mb)\b/g, ' '); // storage variants
  s = s.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  return s.split(' ').slice(0, 6).join(' ');
}

function specLi(label, value, unit) {
  const n = Number(value);
  if (value == null || value === '' || (!Number.isNaN(n) && n === 0)) return '';
  return `<li>${esc(label)}: ${esc(value)}${unit ? ` ${esc(unit)}` : ''}</li>`;
}

// Lightweight, factual content block baked inside #root. React (createRoot, pure
// CSR) wipes #root on mount, so users get the full SPA; non-JS crawlers and the
// pre-JS snapshot get real, unique text + an internal link to the category.
function productBody(d, label, categoryUrl) {
  const name = esc(d.name);
  const brand = d.brand ? esc(d.brand) : '';
  const score = Number(d.techScore) || 0;
  const specs = Number(d.specsCount) || 0;
  const img = /^https?:\/\//i.test(d.imageUrl || '') ? esc(d.imageUrl) : '';
  const lbl = esc(label);
  const items = [
    specLi('Ekran', d.screenSizeValue, 'inç'),
    specLi('Batarya', d.batteryCapacityValue, 'mAh'),
    specLi('Ağırlık', d.weightValueKg, 'kg'),
  ].filter(Boolean).join('');
  return `<main class="seo-prerender" style="max-width:880px;margin:0 auto;padding:24px 16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<nav style="font-size:13px;color:#64748b"><a href="/">Qor AI</a> › <a href="/category">Kategoriler</a> › <a href="${categoryUrl}">${lbl}</a></nav>`
    + `<h1 style="font-size:26px;margin:12px 0 4px">${name}</h1>`
    + `<p style="color:#475569;margin:0 0 12px">${brand ? `${brand} · ` : ''}${lbl}${score ? ` · Qor AI teknik skoru ${score}/100` : ''}</p>`
    + (img ? `<img src="${img}" alt="${name}" width="320" style="max-width:100%;height:auto;border-radius:12px" loading="lazy" />` : '')
    + (items ? `<ul style="margin:16px 0;line-height:1.7">${items}</ul>` : '')
    + `<p style="line-height:1.7;color:#334155">${name} özelliklerini${specs ? `, ${specs} teknik detayını` : ''} ve güncel fiyatlarını Qor AI yapay zekâ ile incele; benzer ${lbl.toLowerCase()} modelleriyle karşılaştır ve sana en uygununu seç.</p>`
    + `<p><a href="${categoryUrl}" style="color:#2563eb;font-weight:600">${lbl} karşılaştırma →</a></p>`
    + `</main>`;
}

// Per-product <head> SEO (unique title/description/canonical + Product,
// Breadcrumb & WebPage JSON-LD). No offers: price lives only in the heavy _raw
// field and is often stale/zero, and price markup that mismatches the page is a
// rich-result penalty — the runtime useSeo() hook adds live offers instead.
function productSeo(d, label) {
  const url = `${SITE}${productPath(d)}`;
  const categoryUrl = `${SITE}${categoryPath(d.category)}`;
  const score = Number(d.techScore) || 0;
  const specs = Number(d.specsCount) || 0;
  const img = /^https?:\/\//i.test(d.imageUrl || '') ? d.imageUrl : DEFAULT_IMG;
  const title = truncate(`${d.name} — Fiyat & Özellikler | Qor AI`, 68);
  const description = truncate(
    `${d.name}${d.brand ? ` (${d.brand})` : ''} — ${label}. `
    + `${score ? `Qor AI teknik skoru ${score}/100. ` : ''}`
    + `${specs ? `${specs} teknik özellik, ` : ''}`
    + 'güncel fiyatlar ve benzer modellerle Qor AI karşılaştırması.',
  );
  const webPage = {
    '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title,
    isPartOf: { '@id': `${SITE}/#website` }, primaryImageOfPage: img,
  };
  const product = {
    '@type': 'Product', '@id': `${url}#product`, name: d.name, image: [img], url,
    mainEntityOfPage: { '@id': `${url}#webpage` },
    ...(d.brand ? { brand: { '@type': 'Brand', name: d.brand } } : {}),
    category: label,
    ...(score ? { additionalProperty: [{ '@type': 'PropertyValue', name: 'Qor AI Teknik Skoru', value: `${score}/100` }] } : {}),
  };
  const breadcrumb = {
    '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: label, item: categoryUrl },
      { '@type': 'ListItem', position: 3, name: d.name, item: url },
    ],
  };
  return {
    title, description, url, image: img, imageAlt: d.name, type: 'product',
    jsonLd: { '@context': 'https://schema.org', '@graph': [webPage, product, breadcrumb] },
  };
}

function categoryPath(category) {
  const cat = String(category || '').trim().toLowerCase();
  return cat ? `/category/${cat}` : '';
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

function renderPage(template, seo, bodyHtml) {
  // Function replacers, not string replacers: product names flow into the SEO
  // block and body, and a literal "$&"/"$1" in a name would otherwise be
  // interpreted as a String.replace special pattern and corrupt the output.
  const block = `<!-- seo:start -->\n  ${seoBlock(seo)}\n  <!-- seo:end -->`;
  let out = template.replace(/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/, () => block);
  if (bodyHtml) out = out.replace('<div id="root"></div>', () => `<div id="root">${bodyHtml}</div>`);
  return out;
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
  const fields = 'id,name,slug,brand,category,subcategory,imageUrl,techScore,lowestPriceUSD,specsCount,screenSizeValue,batteryCapacityValue,weightValueKg,updatedAtTs,scrapedAtTs';
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
      description: 'Qor AI Premium fiyatlarını ve özelliklerini incele: AI Chat, görsel tarayıcı, link analizi, abonelik analizi ve premium öneriler.',
    },
  },
  {
    dir: 'terms', path: '/terms', changefreq: 'monthly', priority: '0.5',
    seo: {
      title: 'Kullanım Koşulları — Qor AI',
      description: 'Qor AI kullanım koşulları: Premium abonelikler, AI çıktıları, kabul edilebilir kullanım, iptal, hesap silme, ödeme ve hizmet sınırları.',
    },
  },
  {
    dir: 'privacy', path: '/privacy', changefreq: 'monthly', priority: '0.5',
    seo: {
      title: 'Gizlilik Politikası — Qor AI',
      description: 'Qor AI gizlilik politikası: hesap verileri, AI girdileri, ödeme ve abonelik verileri, hesap silme, çerezler, saklama ve kullanıcı hakları.',
    },
  },
  {
    dir: 'refund', path: '/refund', changefreq: 'monthly', priority: '0.5',
    seo: {
      title: 'İade Politikası — Qor AI',
      description: 'Qor AI iade politikası: Paddle web satın almaları, yenilemeler, mobil uygulama mağazası satın almaları ve iade talep süreci.',
    },
  },
  {
    dir: 'cookies', path: '/cookies', changefreq: 'monthly', priority: '0.4',
    seo: {
      title: 'Çerez Politikası — Qor AI',
      description: 'Qor AI çerez politikası: zorunlu depolama, tarayıcı dili, analiz, performans ve affiliate atıf çerezleri.',
    },
  },
  {
    dir: 'contact', path: '/contact', changefreq: 'monthly', priority: '0.5',
    seo: {
      title: 'Bize Ulaşın — Qor AI',
      description: 'Qor AI destek, ödeme, iade, gizlilik, hesap silme, ürün verisi, iş birliği ve basın talepleri için tek resmi iletişim adresi.',
    },
  },
  {
    dir: 'about', path: '/about', changefreq: 'monthly', priority: '0.5',
    seo: {
      title: 'Qor AI Hakkında',
      description: 'Qor AI nedir, kimler içindir, Premium ne satar, hesap silme nasıl yapılır, öneriler nasıl çalışır ve ödeme akışları nasıl yönetilir.',
    },
  },
  {
    dir: 'faq', path: '/faq', changefreq: 'monthly', priority: '0.5',
    seo: {
      title: 'SSS — Qor AI',
      description: 'Qor AI Premium, ödeme, iade, gizlilik, hesap silme, iletişim, AI doğruluğu ve ürün verileri hakkında sık sorulan sorular.',
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

  // 2) catalogue fetch — drives both the per-category landing shells and the
  //    curated per-product prerender below (step 2c). We bake a bounded,
  //    de-duplicated subset of top products (not all 106k), so the sitemap and
  //    the prerendered HTML stay in lock-step and Google gets real pages.
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

  // 2b) per-category landing shells — one crawlable HTML page per category with
  //     a keyword title, description and an ItemList of its top products. These
  //     are the highest-intent commercial pages ("akıllı telefon karşılaştırma"
  //     etc.), so unlike the 100k thin product pages they ARE worth baking as
  //     static HTML and carry an ItemList so Google can surface a list result.
  const byCategory = new Map();
  for (const d of products) {
    const cat = String(d?.category || '').trim().toLowerCase();
    if (!cat) continue;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(d);
  }
  let categoryShells = 0;
  for (const [cat, items] of byCategory) {
    const path = categoryPath(cat);
    if (!path) continue;
    const label = categoryLabel(cat, 'tr');
    const url = `${SITE}${path}`;
    // fetchAllProducts sorts by techScore:desc, so items are already best-first.
    const top = items.filter((d) => d?.id && d?.name).slice(0, 24);
    const heroImg = String(top[0]?.imageUrl || '');
    const itemList = {
      '@type': 'ItemList',
      '@id': `${url}#itemlist`,
      name: `${label} — Qor AI`,
      numberOfItems: top.length,
      itemListElement: top.map((d, i) => ({
        '@type': 'ListItem', position: i + 1, url: `${SITE}${productPath(d)}`, name: d.name,
      })),
    };
    const collection = {
      '@type': 'CollectionPage', '@id': `${url}#webpage`, url,
      name: `${label} — Qor AI`,
      isPartOf: { '@id': `${SITE}/#website` },
      mainEntity: { '@id': `${url}#itemlist` },
    };
    const breadcrumb = {
      '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: label, item: url },
      ],
    };
    writeHtml(path.replace(/^\//, ''), renderPage(template, {
      title: truncate(`${label} Karşılaştırma — Fiyat & Özellik | Qor AI`, 68),
      description: truncate(
        `${label} modellerini Qor AI ile karşılaştır: yapay zekâ teknik skoru, `
        + `özellikler ve güncel fiyatlar bir arada. En iyi ${label} modellerini `
        + 'keşfet, filtrele ve sana en uygununu saniyeler içinde seç.',
      ),
      url,
      image: /^https?:\/\//i.test(heroImg) ? heroImg : DEFAULT_IMG,
      type: 'website',
      jsonLd: { '@context': 'https://schema.org', '@graph': [collection, itemList, breadcrumb] },
    }));
    categoryShells += 1;
  }
  console.log(`[seo] wrote ${categoryShells} per-category landing shells`);

  // 2c) curated per-product prerender — the highest-techScore, de-duplicated
  //     models per category get a REAL static HTML file with a unique <head>
  //     (title/description/canonical + Product JSON-LD) and a small content
  //     block. This is what fixes indexing: previously every /product URL served
  //     one identical generic shell, so Google saw 100k duplicates and indexed
  //     none. We deliberately do NOT bake all 106k (a 100k-file git diff of thin
  //     near-duplicate SKUs that risks a scaled-content penalty); the long tail
  //     stays reachable via the SPA but is kept out of the sitemap.
  const PER_CAT = Number(process.env.SEO_PRODUCTS_PER_CATEGORY || 100);
  const MAX_PRODUCTS = Number(process.env.SEO_MAX_PRODUCTS || 8000);

  // Wipe stale product subdirs from the previous build (models that dropped out
  // of the curated set) so website/product/ never accumulates orphan shells.
  // Keep product/index.html — the generic /product fallback shell.
  const productRoot = join(site, 'product');
  if (existsSync(productRoot)) {
    for (const entry of readdirSync(productRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        try { rmSync(join(productRoot, entry.name), { recursive: true, force: true }); } catch (_) {}
      }
    }
  }

  const prerendered = [];
  for (const [cat, items] of byCategory) {
    const label = categoryLabel(cat, 'tr');
    const categoryUrl = `${SITE}${categoryPath(cat)}`;
    const seen = new Set();
    let n = 0;
    for (const d of items) {
      if (n >= PER_CAT || prerendered.length >= MAX_PRODUCTS) break;
      if (!d?.id || !d?.name) continue;
      const key = modelKey(d.name);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      const path = productPath(d);
      if (!path) continue;
      writeHtml(path.replace(/^\//, ''), renderPage(template, productSeo(d, label), productBody(d, label, categoryUrl)));
      prerendered.push({ d, path });
      n += 1;
    }
    if (prerendered.length >= MAX_PRODUCTS) break;
  }
  console.log(`[seo] wrote ${prerendered.length} curated product shells (<=${PER_CAT}/category, deduped)`);

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
  // Only the curated, prerendered products go in the sitemap. Listing all 106k
  // (which serve the generic SPA shell with no per-product HTML) is exactly what
  // wasted crawl budget and produced the duplicate signal that blocked indexing.
  const productUrls = prerendered.map(({ d, path }) => ({
    loc: `${SITE}${path}`, lastmod: lastmodFromTs(d.updatedAtTs || d.scrapedAtTs), changefreq: 'weekly', priority: '0.6',
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

  console.log(`[seo] wrote ${STATIC_ROUTES.length} route shells, ${prerendered.length} product shells, ${sitemapFiles} sitemap file(s) for ${allUrls.length} urls, robots.txt`);
}

main().catch((err) => {
  console.error('[seo] fatal:', err);
  process.exit(1);
});
