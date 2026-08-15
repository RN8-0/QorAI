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
// UI metinleri TEK KAYNAKTAN: kabuga gomulen hero yazilari SPA ile birebir ayni olmali.
import { STRINGS } from '../src/i18n/strings.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { categoryLabel, amazonGoPath } from '../src/lib/format.js';
import { META as LEGAL_META, COPY as LEGAL_COPY } from '../src/lib/legalContent.js';

const SITE = 'https://qorai.net';
const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', '..', 'website');
const templatePath = join(site, 'index.html');

// ── Typesense (read-only search key — same as web/src/lib/typesense.js) ──
const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_KEY = 'BFc7h2MZhq5yct2GxzkClzQtzzCglKIb';
const TS_COLLECTION = 'products';

const DEFAULT_IMG = `${SITE}/assets/qor_logo_512.png?v=20260605a`;

// IndexNow key — lets Bing / Yandex / DuckDuckGo / Copilot crawl new & changed
// URLs within hours instead of waiting weeks. The key is proven by hosting
// <key>.txt at the site root; the scheduled refresh then POSTs changed URLs to
// the IndexNow API (see web/scripts/indexnow.mjs).
const INDEXNOW_KEY = '2c03809d550d2c5ae87a65ed1f0fcd1e';
const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';

// Published blog articles (public read — listRule is status="published"). Drives
// the prerendered /blog listing + /blog/<slug> article pages.
async function fetchArticles() {
  try {
    const r = await fetch(`${PB_URL}/api/collections/articles/records?filter=${encodeURIComponent('status="published"')}&sort=-updated&perPage=200`);
    if (!r.ok) return [];
    return ((await r.json()).items) || [];
  } catch (_) { return []; }
}

// LIVE prices for blog products, keyed by id → the product's per-country `prices`
// rollup (public read). Blog prices must NOT be baked into the article at write
// time (they'd freeze the day it was generated); we look them up here so every
// nightly prerender — which runs AFTER the 03:10 price cron — shows the current
// Amazon price. The SPA does the same lookup live (BlogPost.jsx).
async function fetchBlogPrices(ids) {
  const byId = new Map();
  const uniq = [...new Set((ids || []).filter(Boolean))];
  const BATCH = 40;
  for (let i = 0; i < uniq.length; i += BATCH) {
    const slice = uniq.slice(i, i + BATCH);
    const filter = slice.map((id) => `id="${id}"`).join(' || ');
    try {
      const r = await fetch(`${PB_URL}/api/collections/products/records?perPage=${slice.length}&fields=id,prices,lowestPrice,lowestPriceCurrency&filter=${encodeURIComponent(filter)}`);
      if (!r.ok) continue;
      const j = await r.json();
      for (const it of (j.items || [])) byId.set(it.id, it);
    } catch (_) {}
  }
  return byId;
}

const PRICE_CURRENCY = { TR: 'TRY', DE: 'EUR', AT: 'EUR', GB: 'GBP', UK: 'GBP', US: 'USD' };
const PRICE_LOCALE = { TR: 'tr-TR', DE: 'de-DE', AT: 'de-DE', GB: 'en-GB', UK: 'en-GB', US: 'en-US' };
function fmtMoney(amount, country = 'TR') {
  const cc = String(country || 'TR').toUpperCase();
  const currency = PRICE_CURRENCY[cc] || 'USD';
  try {
    return new Intl.NumberFormat(PRICE_LOCALE[cc] || 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch { return `${Math.round(amount)} ${currency}`; }
}
// Current price for a product record in the given country (TR for the TR blog).
function livePriceFor(rec, country = 'TR') {
  if (!rec) return '';
  const cc = String(country || 'TR').toUpperCase();
  const amt = Number(rec.prices && rec.prices[cc]) || 0;
  if (amt > 0) return fmtMoney(amt, cc);
  // fallback: the rollup's cheapest offer, only if it's already in this currency
  if (Number(rec.lowestPrice) > 0 && rec.lowestPriceCurrency === (PRICE_CURRENCY[cc] || '')) {
    return fmtMoney(Number(rec.lowestPrice), cc);
  }
  return '';
}

// Sanitise stored article HTML for the static shell: allow only the tags the
// generator/editor produces (defensive — body is our own content).
function safeBodyHtml(html) {
  return String(html || '').replace(/<(?!\/?(?:h2|h3|p|ul|ol|li|strong|em|br|a|blockquote|img|u|s)\b)[^>]*>/gi, '');
}

function articleCoverUrl(a) {
  if (/^https?:\/\//i.test(a.cover || '')) return a.cover;
  if (a.coverFile) return `${PB_URL}/api/files/articles/${a.id}/${a.coverFile}`;
  const p0 = (Array.isArray(a.products) ? a.products : [])[0] || {};
  const pi = p0.image || p0.imageUrl || '';
  return /^https?:\/\//i.test(pi) ? pi : '';
}
const BLOG_LBL = {
  tr: { ai: 'AI Analizi', amz: "Amazon'da Gör", prod: 'Ürüne Git', verdict: 'Sonuç', all: '← Tüm rehberler' },
  en: { ai: 'AI analysis', amz: 'View on Amazon', prod: 'Product', verdict: 'Verdict', all: '← All guides' },
  de: { ai: 'KI-Analyse', amz: 'Bei Amazon ansehen', prod: 'Produkt', verdict: 'Fazit', all: '← Alle Ratgeber' },
};
function blogArticleBody(a, lang = 'tr', priceMap = null) {
  const lbl = BLOG_LBL[lang] || BLOG_LBL.tr;
  const t = (f) => a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '';
  const title = esc(t('title'));
  const lead = esc(t('lead'));
  const body = safeBodyHtml(t('body'));
  const products = Array.isArray(a.products) ? a.products.filter((p) => p && p.id && p.name) : [];
  const IMG_H = { s: 190, m: 290, l: 420 };
  const blocks = products.map((p, i) => {
    const slug = slugifyProduct(p.slug || p.name);
    const href = slug ? `/product/${slug}-${p.id}` : `/product/${p.id}`;
    const d1 = esc(p[`desc_${lang}`] || p.desc_tr || p.desc_en || '');
    const d2 = esc(p[`desc2_${lang}`] || p.desc2_tr || p.desc2_en || '');
    const imgSrc = p.image || p.imageUrl || '';
    const img = /^https?:\/\//i.test(imgSrc) ? esc(imgSrc) : '';
    const buy = esc(amazonGoPath(p, 'TR'));
    // Live TR price (from the nightly rollup) wins over any stale baked value.
    const livePrice = priceMap ? livePriceFor(priceMap.get(p.id), 'TR') : '';
    const shownPrice = livePrice || (p.price || '');
    const layout = p.layout || 'split';
    const maxH = IMG_H[p.imgSize] || IMG_H.m;
    const dEl = (d) => (d ? `<p style="font-size:17px;line-height:1.8;color:#334155;margin:0 0 14px;max-width:760px">${d}</p>` : '');
    const imgEl = img ? `<a href="${href}" style="display:block;margin:8px 0 16px"><img src="${img}" alt="${esc(p.name)}" style="display:block;max-width:100%;max-height:${maxH}px;object-fit:contain;border-radius:12px;mix-blend-mode:multiply" loading="lazy" /></a>` : '';
    let inner;
    if (layout === 'text' || !img) inner = dEl(d1) + dEl(d2);
    else if (layout === 'top') inner = imgEl + dEl(d1) + dEl(d2);
    else if (layout === 'left' || layout === 'right') {
      const imgCol = `<div style="flex:0 0 40%">${imgEl}</div>`;
      const txtCol = `<div style="flex:1;min-width:0">${dEl(d1)}${dEl(d2)}</div>`;
      inner = `<div style="display:flex;gap:24px;align-items:center;flex-direction:${layout === 'right' ? 'row-reverse' : 'row'}">${imgCol}${txtCol}</div>`;
    } else inner = dEl(d1) + imgEl + dEl(d2); // split
    const btnsHtml = `<div style="display:flex;flex-wrap:wrap;gap:14px;font-size:12.5px;font-weight:600;flex:0 0 auto">`
      + `<a href="${href}?ai=1" style="color:#64748b;text-decoration:none">✨ ${lbl.ai}</a>`
      + `<a href="${buy}" rel="sponsored nofollow" aria-label="Amazon" style="color:#64748b;text-decoration:none;display:inline-flex;align-items:center;gap:6px"><img src="/assets/amazon.svg" alt="Amazon" style="height:14px;width:auto"/>${shownPrice ? `<b style="color:#0f172a">${esc(shownPrice)}</b>` : ''}</a>`
      + `<a href="${href}" style="color:#64748b;text-decoration:none">→ ${lbl.prod}</a></div>`;
    const titleHtml = `<a href="${href}" style="font-size:27px;font-weight:800;color:#0f172a;text-decoration:none;line-height:1.2;flex:1 1 auto"><span style="color:#2563eb">${i + 1}.</span> ${esc(p.name)}</a>`;
    return `<div style="padding:30px 0;border-top:1px solid #e8edf3">`
      + `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:12px">${titleHtml}${btnsHtml}</div>`
      + inner
      + `</div>`;
  }).join('');
  const concl = safeBodyHtml(a[`conclusion_${lang}`] || a.conclusion_tr || '');
  const DLOC = { tr: 'tr-TR', en: 'en-US', de: 'de-DE' };
  const dRaw = a.publishedAt || a.created;
  let dateStr = '';
  if (dRaw) { try { dateStr = new Date(String(dRaw).replace(' ', 'T')).toLocaleDateString(DLOC[lang] || 'tr-TR', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (_) { dateStr = String(dRaw).slice(0, 10); } }
  const author = esc((a.author || '').trim());
  const tags = String(a[`tags_${lang}`] || a.tags_tr || a.tags || '').split(',').map((s) => s.trim()).filter(Boolean);
  const tagsHtml = tags.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:24px 0">${tags.map((tg) => `<a href="/blog?tag=${encodeURIComponent(tg)}" style="font-size:13px;font-weight:600;color:#2563eb;background:#2563eb14;padding:5px 12px;border-radius:999px;text-decoration:none">#${esc(tg)}</a>`).join('')}</div>`
    : '';
  return `<article class="seo-prerender" style="max-width:920px;margin:0 auto;padding:24px 24px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<nav style="font-size:13px;color:#64748b"><a href="/">Qor AI</a> › <a href="/blog">Blog</a></nav>`
    + (() => { const ml = [dateStr ? `📅 ${esc(dateStr)}` : '', author ? `✍ ${author}` : ''].filter(Boolean).join(' · '); return ml ? `<p style="font-size:14px;color:#64748b;margin:10px 0 0">${ml}</p>` : ''; })()
    + `<h1 style="font-size:40px;font-weight:800;line-height:1.12;margin:6px 0 14px">${title}</h1>`
    + (lead ? `<p style="font-size:20px;color:#475569;line-height:1.6;margin:0 0 24px">${lead}</p>` : '')
    + `<div style="font-size:17.5px;line-height:1.85">${body}</div>`
    + blocks
    + (concl ? `<div style="font-size:17.5px;line-height:1.85;margin-top:16px">${concl}</div>` : '')
    + tagsHtml
    + `</article>`;
}

function blogListBody(articles, lang = 'tr') {
  const t = (a, f) => a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '';
  const rows = articles.map((a) => {
    const cover = esc(articleCoverUrl(a));
    return `<a href="/blog/${esc(a.slug)}" style="display:flex;gap:18px;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;text-decoration:none;color:inherit;margin:14px 0">`
      + (cover ? `<div style="flex:0 0 200px;background:#f8fafc;display:flex;align-items:center;justify-content:center"><img src="${cover}" alt="${esc(t(a, 'title'))}" style="width:100%;max-height:150px;object-fit:contain;padding:16px;mix-blend-mode:multiply" loading="lazy" /></div>` : '')
      + `<div style="padding:18px 20px"><h2 style="font-size:20px;font-weight:700;margin:0 0 6px">${esc(t(a, 'title'))}</h2>`
      + `<p style="font-size:15px;color:#64748b;margin:0 0 8px;line-height:1.6">${esc(t(a, 'lead'))}</p>`
      + `<span style="font-size:14px;font-weight:600;color:#2563eb">Rehberi oku →</span></div></a>`;
  }).join('');
  return `<main class="seo-prerender" style="max-width:1000px;margin:0 auto;padding:24px 16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<nav style="font-size:13px;color:#64748b"><a href="/">Qor AI</a> › Blog</nav>`
    + `<h1 style="font-size:32px;font-weight:800;margin:10px 0 6px">Alım Rehberleri</h1>`
    + `<p style="color:#475569;margin:0 0 18px">2026'nın en iyi modelleri — puanlandı, karşılaştırıldı ve anlatıldı.</p>`
    + rows
    + `</main>`;
}

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

// Collapses cosmetic SKU variants (colour / strap / storage) down to one
// representative model so the curated prerender set
// is real distinct models, not 50 near-identical pages of the same watch.
function modelKey(name) {
  let s = String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  s = s.replace(/\([^)]*\)/g, ' '); // drop "(512 GB)" etc.
  // colours, materials, straps/cases and connectivity tags — the cosmetic SKU
  // axes that produce near-identical pages of the same model (esp. watches).
  s = s.replace(/\b(schwarz|weiss|blau|rot|gruen|grun|grau|silber|gold|rosa|pink|lila|violett|braun|beige|titan|titanium|titanyum|graphit|mitternacht|sternenlicht|polarstern|polar|space|grey|gray|black|white|blue|red|green|silver|midnight|starlight|purple|yellow|orange|olive|stone|seashell|mit|ohne|und|with|ve|armband|sportarmband|sportband|band|loop|solo|braided|gehause|gehaeuse|case|kasa|kordon|alpine|trail|ocean|milanese|milano|sport|nike|hermes|aluminium|aluminyum|alu|edelstahl|stainless|paslanmaz|celik|keramik|ceramic|leder|leather|deri|nylon|dual|sim|edition|version|cellular|gps|wifi|smartwatch)\b/g, ' ');
  s = s.replace(/\b\d+\s?(gb|tb|mb)\b/g, ' '); // storage variants
  s = s.replace(/\b\d{2,3}\s?mm\b/g, ' '); // watch case sizes (42mm/46mm SKUs of the same model)
  s = s.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  return s.split(' ').slice(0, 6).join(' ');
}

function specLi(label, value, unit) {
  const n = Number(value);
  if (value == null || value === '' || (!Number.isNaN(n) && n === 0)) return '';
  return `<li>${esc(label)}: ${esc(value)}${unit ? ` ${esc(unit)}` : ''}</li>`;
}

// Placeholder / junk spec values that carry no information for a reader.
const SPEC_VALUE_SKIP = /^(sponsorlu|sponsored|reklam|yok|none|-{1,2}|—|n\/?a|null|undefined|0|false)$/i;

// Turn a product's keySpecs map ({label: value}, Turkish, from _raw) into clean
// [label, value] rows. This is what makes each product page substantive and
// UNIQUE — the old shell baked only 3 phone-only fields (screen/battery/weight),
// so every non-phone page was a near-duplicate template with zero real content
// (exactly the thin/"scaled content" pattern Google + Bing flag and suppress).
function keySpecRows(keySpecs, limit = 16) {
  if (!keySpecs || typeof keySpecs !== 'object') return [];
  const rows = [];
  for (const [k, v] of Object.entries(keySpecs)) {
    const label = String(k == null ? '' : k).replace(/\s+/g, ' ').trim();
    const value = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (!label || !value || value.length > 64 || label.length > 48) continue;
    if (SPEC_VALUE_SKIP.test(value)) continue;
    rows.push([label, value]);
    if (rows.length >= limit) break;
  }
  return rows;
}

// Lightweight, factual content block baked inside #root. React (createRoot, pure
// CSR) wipes #root on mount, so users get the full SPA; non-JS crawlers and the
// pre-JS snapshot get real, unique text + internal links (category + siblings).
// Internal links matter: Googlebot defers JS for hours-to-weeks, so the crawl
// path and content must exist in the raw HTML, not only after the SPA renders.
function productBody(d, label, categoryUrl, related = [], keySpecs = null, lang = SEO_DEFAULT_LOCALE) {
  const name = esc(localizedName(d, lang));
  const brand = d.brand ? esc(d.brand) : '';
  const score = Number(d.techScore) || 0;
  const specs = Number(d.specsCount) || 0;
  const img = /^https?:\/\//i.test(d.imageUrl || '') ? esc(d.imageUrl) : '';
  const lbl = esc(label);
  // Real labeled specs from keySpecs (from _raw). Fall back to the 3 phone-only
  // fields only when a product has no keySpecs map at all.
  const rows = keySpecRows(keySpecs);
  const items = rows.length
    ? rows.map(([k, v]) => `<li><span style="color:#64748b">${esc(k)}:</span> <strong>${esc(v)}</strong></li>`).join('')
    : [
      specLi('Ekran', d.screenSizeValue, 'inç'),
      specLi('Batarya', d.batteryCapacityValue, 'mAh'),
      specLi('Ağırlık', d.weightValueKg, 'kg'),
    ].filter(Boolean).join('');
  // Weave 2-3 real spec values into the intro so the opening sentence differs
  // per product instead of being an identical template across thousands of pages.
  const highlights = rows.slice(0, 3).map(([k, v]) => `${esc(k.toLowerCase())} ${esc(v)}`).join(', ');
  const relLinks = related
    .filter((r) => r && r.name && r.path)
    .slice(0, 8)
    .map((r) => `<li><a href="${esc(r.path)}" style="color:#2563eb">${esc(r.name)}</a></li>`)
    .join('');
  const tx = PROD_BODY_TEXT[lang] || PROD_BODY_TEXT[SEO_DEFAULT_LOCALE];
  const pfx = localePrefix(lang);
  return `<main class="seo-prerender" style="max-width:880px;margin:0 auto;padding:24px 16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<nav style="font-size:13px;color:#64748b"><a href="${pfx || '/'}">Qor AI</a> › <a href="${pfx}/category">${tx.cats}</a> › <a href="${categoryUrl}">${lbl}</a></nav>`
    + `<h1 style="font-size:26px;margin:12px 0 4px">${name}</h1>`
    + `<p style="color:#475569;margin:0 0 12px">${brand ? `${brand} · ` : ''}${lbl}${score ? ` · ${tx.score(score)}` : ''}</p>`
    + (img ? `<img src="${img}" alt="${name}" width="320" style="max-width:100%;height:auto;border-radius:12px" loading="lazy" />` : '')
    + `<p style="line-height:1.7;color:#334155">${tx.intro(name, highlights, lbl, specs)}</p>`
    + (items ? `<h2 style="font-size:18px;margin:22px 0 8px">${tx.specsH}</h2><ul style="margin:8px 0;line-height:1.8;list-style:none;padding:0">${items}</ul>` : '')
    + (relLinks ? `<h2 style="font-size:18px;margin:22px 0 8px">${tx.relH(lbl)}</h2><ul style="line-height:1.8">${relLinks}</ul>` : '')
    + `<p style="margin-top:16px"><a href="${categoryUrl}" style="color:#2563eb;font-weight:600">${tx.cta(lbl)} →</a></p>`
    + `</main>`;
}

// Ürün gövdesi metinleri (kök adres İngilizce olduğu için varsayılan 'en').
const PROD_BODY_TEXT = {
  en: {
    cats: 'Categories',
    score: (s) => `Qor AI tech score ${s}/100`,
    specsH: 'Key Specifications',
    relH: (l) => `Similar models in ${l}`,
    cta: (l) => `Compare all ${l}`,
    intro: (n, hi, l, sp) => `${n}${hi ? ` key features: ${hi}.` : ` — ${l}.`} Review ${n}'s ${sp ? `${sp} technical specs` : 'specifications'}, its Qor AI tech score and how it compares with similar models in ${l.toLowerCase()} below.`,
  },
  tr: {
    cats: 'Kategoriler',
    score: (s) => `Qor AI teknik skoru ${s}/100`,
    specsH: 'Öne Çıkan Teknik Özellikler',
    relH: (l) => `Benzer ${l} modelleri`,
    cta: (l) => `Tüm ${l} modellerini karşılaştır`,
    intro: (n, hi, l, sp) => `${n}${hi ? ` öne çıkan özellikleri: ${hi}.` : ` — ${l}.`} ${n}${sp ? ` ${sp} teknik özelliğini` : ' özelliklerini'}, Qor AI teknik skorunu ve benzer ${l.toLowerCase()} modelleriyle karşılaştırmasını aşağıda incele.`,
  },
  de: {
    cats: 'Kategorien',
    score: (s) => `Qor AI Techscore ${s}/100`,
    specsH: 'Wichtige technische Daten',
    relH: (l) => `Ähnliche ${l}-Modelle`,
    cta: (l) => `Alle ${l}-Modelle vergleichen`,
    intro: (n, hi, l, sp) => `${n}${hi ? ` Highlights: ${hi}.` : ` — ${l}.`} Sieh dir unten ${sp ? `${sp} technische Merkmale` : 'die Merkmale'} von ${n}, den Qor AI Techscore und den Vergleich mit ähnlichen ${l}-Modellen an.`,
  },
};

// Crawlable body for a category landing page: H1 + intro + a real <a> grid to
// every curated product in the category. This is the spine of internal linking
// (home → category → product, all within 3 clicks) and turns category pages from
// head-only shells into content-rich hubs Google can crawl without running JS.
// Renders the AI buying guide as static HTML (mirrors CategoryGuide.jsx) so
// non-JS crawlers + first paint see it too. The SPA re-renders the same guide.
function guideHtml(guide) {
  if (!guide || !guide.lead) return '';
  const secs = (guide.sections || []).map((s) =>
    `<h3 style="font-size:18px;margin:18px 0 6px">${esc(s.h)}</h3><p style="line-height:1.7;color:#334155">${esc(s.body)}</p>`).join('');
  const picks = (guide.picks || []).filter((p) => p && p.id && p.name).map((p) =>
    `<li style="margin:6px 0"><a href="/product/${esc(p.slug)}-${esc(p.id)}" style="color:#2563eb;font-weight:600">${esc(p.name)}</a>${p.why ? ` <span style="color:#64748b">— ${esc(p.why)}</span>` : ''}</li>`).join('');
  const faq = (guide.faq || []).map((f) =>
    `<h4 style="font-size:15px;margin:14px 0 4px">${esc(f.q)}</h4><p style="line-height:1.7;color:#475569">${esc(f.a)}</p>`).join('');
  return `<section style="margin-top:28px;border-top:1px solid #e2e8f0;padding-top:20px">`
    + `<h2 style="font-size:24px;font-weight:800;margin:0 0 8px">${esc(guide.title)}</h2>`
    + `<p style="line-height:1.7;color:#475569;margin:0 0 14px">${esc(guide.lead)}</p>`
    + secs
    + (picks ? `<h3 style="font-size:18px;margin:18px 0 6px">Öne çıkan ${esc(guide.label)} modelleri</h3><ul style="line-height:1.9">${picks}</ul>` : '')
    + (faq ? `<h3 style="font-size:18px;margin:18px 0 6px">Sık sorulan sorular</h3>${faq}` : '')
    + `</section>`;
}

// Per-language copy for the category landing prerender. h1/intro take the label.
const CAT_BODY_TEXT = {
  tr: { cats: 'Kategoriler', h1: (l) => `${l} Karşılaştırma`, intro: (l) => `En iyi ${l.toLowerCase()} modellerini Qor AI yapay zekâ teknik skoru, özellikleri ve güncel fiyatlarıyla karşılaştır. Aşağıdaki modellerden birini seç ya da filtreleyerek sana en uygununu saniyeler içinde bul.` },
  en: { cats: 'Categories', h1: (l) => `${l} Comparison`, intro: (l) => `Compare the best ${l.toLowerCase()} models with Qor AI: AI tech score, key features and current prices together. Pick one of the models below or filter to find the one that fits you best in seconds.` },
  de: { cats: 'Kategorien', h1: (l) => `${l} Vergleich`, intro: (l) => `Vergleiche die besten ${l.toLowerCase()}-Modelle mit Qor AI: KI-Techscore, wichtige Merkmale und aktuelle Preise zusammen. Wähle eines der Modelle unten oder filtere, um in Sekunden das passende zu finden.` },
};

function categoryBody(label, categoryUrl, items, guide, lang = 'tr') {
  const tx = CAT_BODY_TEXT[lang] || CAT_BODY_TEXT.tr;
  const lbl = esc(label);
  // İç linkler AYNI DİL AĞACINDA kalmalı: /de/category sayfası öneksiz
  // /product/… adreslerine bağlanırsa Googlebot /de/ ve /tr/ ürün sayfalarına
  // yalnız sitemap'ten ulaşır, iç link yoluyla hiç ulaşamaz.
  const pfx = localePrefix(lang);
  const links = items
    .filter((d) => d && d.name && d.id)
    .map((d) => {
      const score = Number(d.techScore) || 0;
      return `<li style="margin:4px 0"><a href="${esc(pfx + productPath(d))}" style="color:#0f172a;text-decoration:none">`
        + `${esc(localizedName(d, lang))}${score ? ` <span style="color:#64748b;font-size:12px">· ${score}/100</span>` : ''}</a></li>`;
    })
    .join('');
  return `<main class="seo-prerender" style="max-width:980px;margin:0 auto;padding:24px 16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<nav style="font-size:13px;color:#64748b"><a href="${pfx || '/'}">Qor AI</a> › <a href="${pfx}/category">${esc(tx.cats)}</a> › ${lbl}</nav>`
    + `<h1 style="font-size:28px;margin:12px 0 6px">${esc(tx.h1(label))}</h1>`
    + `<p style="line-height:1.7;color:#334155;max-width:680px">${esc(tx.intro(label))}</p>`
    + (links ? `<ul style="columns:2;column-gap:32px;margin:18px 0;padding:0;list-style:none">${links}</ul>` : '')
    + `</main>`;
}

// Load all generated buying guides keyed by category.
function loadGuides() {
  const dir = join(here, '..', 'public', 'guides');
  const map = new Map();
  if (!existsSync(dir)) return map;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    try { const g = JSON.parse(readFileSync(join(dir, f), 'utf8')); if (g && g.category) map.set(g.category, g); } catch (_) {}
  }
  return map;
}

// FAQPage JSON-LD from a guide's FAQ — eligible for the FAQ rich result.
function guideFaqLd(guide, url) {
  if (!guide || !Array.isArray(guide.faq) || !guide.faq.length) return null;
  return {
    '@type': 'FAQPage', '@id': `${url}#faq`,
    mainEntity: guide.faq.map((f) => ({
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

// ── comparison ("X vs Y") pages ─────────────────────────────────
// The clean URL is /compare/<slugA>-<idA>-vs-<slugB>-<idB>. Each id is a 15-char
// token, so the SPA's /compare/:pair route recovers both ids (split on the first
// "-vs-", extractProductId each side). Must mirror comparePath() in routes.js.
function compareToken(d) {
  // Cap the slug hard: a compare path joins TWO slugs + two 15-char ids + "-vs-",
  // and two full 90-char slugs blow past the Windows 260-char path limit (the
  // build writes website/compare/<token>/index.html). 40 keeps URLs clean and
  // the id stays the trailing 15 chars so parseComparePair() still recovers it.
  const slug = slugifyProduct(d.slug || d.name || '').slice(0, 40).replace(/-+$/, '');
  return slug ? `${slug}-${d.id}` : String(d.id);
}
function comparePath(a, b) {
  return `/compare/${compareToken(a)}-vs-${compareToken(b)}`;
}

function cmpRow(label, va, vb, unit) {
  const fmt = (v) => {
    const n = Number(v);
    if (v == null || v === '' || (!Number.isNaN(n) && n === 0)) return '—';
    return `${esc(v)}${unit ? ` ${esc(unit)}` : ''}`;
  };
  const fa = fmt(va); const fb = fmt(vb);
  if (fa === '—' && fb === '—') return '';
  return `<tr><td style="padding:7px 12px;color:#64748b;border-top:1px solid #e2e8f0">${esc(label)}</td>`
    + `<td style="padding:7px 12px;font-weight:600;border-top:1px solid #e2e8f0">${fa}</td>`
    + `<td style="padding:7px 12px;font-weight:600;border-top:1px solid #e2e8f0">${fb}</td></tr>`;
}

// Side-by-side spec rows from two products' keySpecs (from _raw). Every label
// either product carries, A's order first. Turns the compare page from a 3-field
// stub into a real spec-by-spec table — the whole point of a comparison page.
function compareSpecRows(ksA, ksB) {
  const a = (ksA && typeof ksA === 'object') ? ksA : {};
  const b = (ksB && typeof ksB === 'object') ? ksB : {};
  const labels = [];
  const seen = new Set();
  for (const k of [...Object.keys(a), ...Object.keys(b)]) {
    const label = String(k == null ? '' : k).replace(/\s+/g, ' ').trim();
    if (!label || label.length > 48 || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  const clean = (v) => {
    const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    return (!s || s.length > 44 || SPEC_VALUE_SKIP.test(s)) ? '' : s;
  };
  const out = [];
  for (const label of labels) {
    const ca = clean(a[label]); const cb = clean(b[label]);
    if (!ca && !cb) continue;
    const row = cmpRow(label, ca, cb);
    if (row) out.push(row);
    if (out.length >= 16) break;
  }
  return out.join('');
}

// Karşılaştırma sayfası metinleri (kök adres İngilizce → varsayılan 'en').
const CMP_TEXT = {
  en: {
    cats: 'Categories', score: 'Qor AI tech score', brand: 'Brand',
    screen: 'Screen', batt: 'Battery', weight: 'Weight', inch: 'in',
    title: (a, b) => `${a} vs ${b} — Comparison | Qor AI`,
    desc: (a, b, l) => `${a} vs ${b} comparison — ${l}. Qor AI tech score and specs side by side; which one fits you better?`,
    intro: (a, b) => `${a} vs ${b} comparison: Qor AI tech score and specifications side by side. See which one suits you better in the table below.`,
    cta: (l) => `Compare all ${l}`,
  },
  tr: {
    cats: 'Kategoriler', score: 'Qor AI teknik skoru', brand: 'Marka',
    screen: 'Ekran', batt: 'Batarya', weight: 'Ağırlık', inch: 'inç',
    title: (a, b) => `${a} vs ${b} — Karşılaştırma | Qor AI`,
    desc: (a, b, l) => `${a} ile ${b} karşılaştırması — ${l}. Qor AI teknik skoru ve teknik özellikleri yan yana; hangisi sana daha uygun?`,
    intro: (a, b) => `${a} ile ${b} karşılaştırması: Qor AI yapay zekâ teknik skoru ve teknik özellikleri yan yana. Hangisi sana daha uygun, aşağıdaki tabloda saniyeler içinde gör.`,
    cta: (l) => `Tüm ${l} modellerini karşılaştır`,
  },
  de: {
    cats: 'Kategorien', score: 'Qor AI Techscore', brand: 'Marke',
    screen: 'Display', batt: 'Akku', weight: 'Gewicht', inch: 'Zoll',
    title: (a, b) => `${a} vs ${b} — Vergleich | Qor AI`,
    desc: (a, b, l) => `${a} vs ${b} Vergleich — ${l}. Qor AI Techscore und technische Daten nebeneinander; welches passt besser zu dir?`,
    intro: (a, b) => `${a} vs ${b} Vergleich: Qor AI Techscore und technische Daten nebeneinander. Sieh in der Tabelle unten, welches besser zu dir passt.`,
    cta: (l) => `Alle ${l}-Modelle vergleichen`,
  },
};

function compareBody(a, b, label, categoryUrl, ksA = null, ksB = null, lang = SEO_DEFAULT_LOCALE) {
  const tx = CMP_TEXT[lang] || CMP_TEXT[SEO_DEFAULT_LOCALE];
  const pfx = localePrefix(lang);
  const na = esc(localizedName(a, lang)); const nb = esc(localizedName(b, lang));
  const lbl = esc(label);
  const pa = esc(pfx + productPath(a)); const pb = esc(pfx + productPath(b));
  const sa = Number(a.techScore) || 0; const sb = Number(b.techScore) || 0;
  const base = [
    cmpRow(tx.score, sa ? `${sa}/100` : '', sb ? `${sb}/100` : ''),
    cmpRow(tx.brand, a.brand, b.brand),
  ].filter(Boolean).join('');
  const specRows = compareSpecRows(ksA, ksB);
  const fallback = [
    cmpRow(tx.screen, a.screenSizeValue, b.screenSizeValue, tx.inch),
    cmpRow(tx.batt, a.batteryCapacityValue, b.batteryCapacityValue, 'mAh'),
    cmpRow(tx.weight, a.weightValueKg, b.weightValueKg, 'kg'),
  ].filter(Boolean).join('');
  const rows = base + (specRows || fallback);
  return `<main class="seo-prerender" style="max-width:880px;margin:0 auto;padding:24px 16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<nav style="font-size:13px;color:#64748b"><a href="${pfx || '/'}">Qor AI</a> › <a href="${pfx}/category">${tx.cats}</a> › <a href="${categoryUrl}">${lbl}</a></nav>`
    + `<h1 style="font-size:26px;margin:12px 0 6px">${na} <span style="color:#94a3b8">vs</span> ${nb}</h1>`
    + `<p style="line-height:1.7;color:#334155">${tx.intro(na, nb)}</p>`
    + `<table style="border-collapse:collapse;margin:18px 0;width:100%;max-width:680px">`
    + `<thead><tr><th></th>`
    + `<th style="padding:8px 12px;text-align:left"><a href="${pa}" style="color:#2563eb">${na}</a></th>`
    + `<th style="padding:8px 12px;text-align:left"><a href="${pb}" style="color:#2563eb">${nb}</a></th></tr></thead>`
    + `<tbody>${rows}</tbody></table>`
    + `<p><a href="${categoryUrl}" style="color:#2563eb;font-weight:600">${tx.cta(lbl)} →</a></p>`
    + `</main>`;
}

function compareSeo(a, b, label, lang = SEO_DEFAULT_LOCALE) {
  const tx = CMP_TEXT[lang] || CMP_TEXT[SEO_DEFAULT_LOCALE];
  // DİL ÖNEKİ ŞART: öneksiz kurulan canonical, /tr/compare/… ve /de/compare/…
  // sayfalarını İngilizce adrese kanonikleştiriyordu — yani Google'a "bu üç
  // sayfa aslında tek sayfa, İngilizcesini al" demiş oluyorduk ve Türkçe/Almanca
  // karşılaştırma sayfaları indexe hiç girmiyordu.
  const prefix = localePrefix(lang);
  const url = `${SITE}${prefix}${comparePath(a, b)}`;
  const categoryUrl = `${SITE}${prefix}${categoryPath(a.category)}`;
  const imgA = /^https?:\/\//i.test(a.imageUrl || '') ? a.imageUrl : DEFAULT_IMG;
  const na = localizedName(a, lang);
  const nb = localizedName(b, lang);
  const title = truncate(tx.title(na, nb), 70);
  const description = truncate(
    tx.desc(na, nb, label),
  );
  const webPage = {
    '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title,
    isPartOf: { '@id': `${SITE}/#website` },
  };
  const itemList = {
    '@type': 'ItemList', '@id': `${url}#itemlist`, numberOfItems: 2,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: na, url: `${SITE}${prefix}${productPath(a)}` },
      { '@type': 'ListItem', position: 2, name: nb, url: `${SITE}${prefix}${productPath(b)}` },
    ],
  };
  const breadcrumb = {
    '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE}${prefix}/` },
      { '@type': 'ListItem', position: 2, name: label, item: categoryUrl },
      { '@type': 'ListItem', position: 3, name: `${na} vs ${nb}`, item: url },
    ],
  };
  return {
    title, description, url, lang, image: imgA, imageAlt: `${na} vs ${nb}`, type: 'website',
    jsonLd: { '@context': 'https://schema.org', '@graph': [webPage, itemList, breadcrumb] },
  };
}

// Per-product <head> SEO: WebPage + Breadcrumb JSON-LD only. We deliberately do
// NOT emit a `Product` node here: Google requires a Product to carry offers,
// review or aggregateRating to be valid, and the static build has no reliable
// price (it lives in the heavy _raw field, lowestPriceUSD is ~always 0) and no
// real ratings/reviews. Emitting a Product without those just produces "invalid
// Product snippet" errors in Search Console for zero gain. The runtime
// useSeo() hook DOES add a valid Product+offers once the live price loads (and
// only then), so products that actually have a price still get the rich result.
// Ürün sayfası SEO metinleri. Kök adres İngilizce olduğu için varsayılan 'en'.
const PROD_SEO_TEXT = {
  en: {
    title: (n) => `${n} — Specs & Comparison | Qor AI`,
    score: (s) => `Qor AI tech score ${s}/100. `,
    specs: (n) => `${n} technical specs. `,
    tail: 'Qor AI analysis and comparison with similar models.',
  },
  tr: {
    title: (n) => `${n} — Özellikler & Karşılaştırma | Qor AI`,
    score: (s) => `Qor AI teknik skoru ${s}/100. `,
    specs: (n) => `${n} teknik özellik. `,
    tail: 'Qor AI yapay zekâ analizi ve benzer modellerle karşılaştırması.',
  },
  de: {
    title: (n) => `${n} — Specs & Vergleich | Qor AI`,
    score: (s) => `Qor AI Techscore ${s}/100. `,
    specs: (n) => `${n} technische Merkmale. `,
    tail: 'Qor AI Analyse und Vergleich mit ähnlichen Modellen.',
  },
};

function productSeo(d, label, keySpecs = null, lang = SEO_DEFAULT_LOCALE) {
  const tx = PROD_SEO_TEXT[lang] || PROD_SEO_TEXT[SEO_DEFAULT_LOCALE];
  const url = `${SITE}${localePrefix(lang)}${productPath(d)}`;
  const categoryUrl = `${SITE}${localePrefix(lang)}${categoryPath(d.category)}`;
  const score = Number(d.techScore) || 0;
  const specs = Number(d.specsCount) || 0;
  const img = /^https?:\/\//i.test(d.imageUrl || '') ? d.imageUrl : DEFAULT_IMG;
  // Ürün adı DİLE GÖRE — kaynak `name` Türkçedir, İngilizce/Almanca sayfada
  // Türkçe başlık göstermek tam da "İngilizce arıyorum Türkçe çıkıyor"
  // şikayetinin sebebiydi.
  const dispName = localizedName(d, lang);
  const title = truncate(tx.title(dispName), 68);
  // Lead the description with a few REAL spec values so it is unique per product
  // and long enough (Bing flagged descriptions as too short + too templated).
  const rows = keySpecRows(keySpecs, 4);
  const specHi = rows.map(([k, v]) => `${k}: ${v}`).join(', ');
  const description = truncate(
    `${dispName}${d.brand ? ` (${d.brand})` : ''} — ${label}. `
    + `${specHi ? `${specHi}. ` : ''}`
    + `${score ? tx.score(score) : ''}`
    + `${specs ? tx.specs(specs) : ''}`
    + tx.tail,
  );
  const webPage = {
    '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title,
    isPartOf: { '@id': `${SITE}/#website` }, primaryImageOfPage: img,
  };
  const breadcrumb = {
    '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE}${localePrefix(lang)}/` },
      { '@type': 'ListItem', position: 2, name: label, item: categoryUrl },
      { '@type': 'ListItem', position: 3, name: dispName, item: url },
    ],
  };
  return {
    title, description, url, lang, image: img, imageAlt: dispName, type: 'product',
    jsonLd: { '@context': 'https://schema.org', '@graph': [webPage, breadcrumb] },
  };
}

function categoryPath(category) {
  const cat = String(category || '').trim().toLowerCase();
  return cat ? `/category/${cat}` : '';
}

// Real modification date or NOTHING. Defaulting to "today" stamped every URL
// with a fresh lastmod on every nightly run, which teaches Google/Bing that the
// site's lastmod is meaningless noise — they then ignore it and crawl stale.
// ÖN-RENDER İÇERİK SÜRÜMÜ — sitemap `lastmod`'unun tabanı.
//
// NEDEN VAR: `lastmod` şimdiye kadar YALNIZ ürün verisinin zaman damgasından
// üretiliyordu. Ama sayfanın gördüğü metin ürün verisi değişmeden de
// değişebiliyor: şablon, kopya, ya da 2026-08-05'teki gibi SAYFANIN DİLİ.
// O gün 7867 adresin tamamı Türkçeden İngilizceye döndü, buna rağmen
// sitemap'te yalnız 1582'sinde güncel tarih vardı; kalan ~6200 sayfa Google'a
// "temmuzdan beri değişmedim" diyordu ve yeniden taranmıyordu.
//
// Bu tarih, ön-render ÇIKTISI anlamlı biçimde değiştiğinde ELLE yükseltilir.
// Uydurma tazelik değildir: sayfa gerçekten o gün değişmiştir.
const SEO_CONTENT_VERSION = '2026-08-07'; // ürün adları artık dile göre (en/de sayfalarda Türkçe ad kalmıyor)

function lastmodFromTs(value) {
  const n = Number(value) || 0;
  if (!n) return SEO_CONTENT_VERSION;
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return SEO_CONTENT_VERSION;
  const iso = d.toISOString().slice(0, 10);
  // Veri tarihi ile içerik sürümünden HANGİSİ YENİYSE o.
  return iso > SEO_CONTENT_VERSION ? iso : SEO_CONTENT_VERSION;
}

// Ham tarih string'leri (blog `updated` gibi) için aynı taban.
function lastmodAtLeastVersion(value) {
  const iso = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso > SEO_CONTENT_VERSION ? iso : SEO_CONTENT_VERSION;
}

// Renders the <head> SEO block injected between the seo markers.
// LCP gorseli icin on-yukleme URL'i. SPA'nin GERCEKTEN isteyecegi varyanti
// uretmek ZORUNDA: og:image ham (oneksiz) URL'i tasiyor ama kart slotu `m_`,
// urun galerisi `b_` varyantini istiyor. Yanlis varyanti preload etmek iki ayri
// indirme demek — yani duzeltmek yerine ISI BOZAR.
// TEK DOGRULUK KAYNAGI: web/src/lib/imageUrl.js -> epeyVariants().
// Burada yalnizca oradaki iki kural yansitiliyor; o dosya degisirse burasi da
// guncellenmeli.
function lcpVariant(url, slot) {
  const clean = String(url || '').trim();
  if (!/^https?:\/\//i.test(clean) || !/resim\.epey\.com|(^|\.)epey\.com/i.test(clean)) return '';
  if (slot === 'full') {
    return clean
      .replace(/\/m_([^/?#]+)([?#].*)?$/i, '/b_$1$2')
      .replace(/\/s_([^/?#]+)([?#].*)?$/i, '/b_$1$2')
      .replace(/\/k_([^/?#]+)([?#].*)?$/i, '/b_$1$2');
  }
  return clean
    .replace(/\/b_([^/?#]+)([?#].*)?$/i, '/m_$1$2')
    .replace(/\/s_([^/?#]+)([?#].*)?$/i, '/m_$1$2')
    .replace(/\/k_([^/?#]+)([?#].*)?$/i, '/m_$1$2')
    .replace(/(\/\d+\/)([^/?#]+)$/i, (m, folder, file) => (/^[a-z]_/i.test(file) ? m : `${folder}m_${file}`));
}


// ── Rota chunk'ini ONDEN yukle ──────────────────────────────────────────────
// Tembel rotalarda zincir suydu: index.js indi -> AYRISTI -> React lazy import'a
// ULASTI -> ancak O ZAMAN rota chunk'i istendi. Yani rota kodu, ana paket
// calisana kadar aga hic cikmiyordu. Olculdu (yavas 4G + 4x CPU): sayfanin
// lead paragrafi (LCP elemani) /subscriptions'ta 4828 ms'de boyaniyordu.
// modulepreload ile rota chunk'i ana paketle PARALEL iniyor.
// Dosya adlari hash'li oldugu icin vite manifest'inden okunuyor. Gece cron'u
// seo.mjs'i vite'siz kosuyor; o durumda manifest bir onceki build'e ait ve
// website/spa altindaki dosyalar da degismedigi icin dogru kalir.
let VITE_MANIFEST = null;
function manifest() {
  if (VITE_MANIFEST) return VITE_MANIFEST;
  const f = join(site, '.vite', 'manifest.json');
  try { VITE_MANIFEST = JSON.parse(readFileSync(f, 'utf8')); }
  catch { VITE_MANIFEST = {}; console.warn('[seo] vite manifest okunamadi — rota on-yuklemesi atlandi'); }
  return VITE_MANIFEST;
}
// Rota dizini -> kaynak dosya. Ana sayfa (dir '') EAGER, on-yukleme gerekmez.
const ROUTE_ENTRY = {
  category: 'src/pages/Category.jsx',
  product: 'src/pages/ProductDetail.jsx',
  compare: 'src/pages/Compare.jsx',
  'link-analysis': 'src/pages/LinkAnalysis.jsx',
  subscriptions: 'src/pages/Subscriptions.jsx',
  premium: 'src/pages/Premium.jsx',
  quiz: 'src/pages/Quiz.jsx',
  profile: 'src/pages/Profile.jsx',
  go: 'src/pages/Go.jsx',
  blog: 'src/pages/Blog.jsx',
  blogpost: 'src/pages/BlogPost.jsx',
  terms: 'src/pages/Legal.jsx', privacy: 'src/pages/Legal.jsx', refund: 'src/pages/Legal.jsx',
  cookies: 'src/pages/Legal.jsx', contact: 'src/pages/Legal.jsx', about: 'src/pages/Legal.jsx',
  faq: 'src/pages/Legal.jsx',
  'ai-chat': 'src/pages/AiChat.jsx',
};
function routePreloadTags(routeKey) {
  const src = ROUTE_ENTRY[routeKey];
  if (!src) return [];
  const e = manifest()[src];
  if (!e || !e.file) return [];
  const tags = [`<link rel="modulepreload" crossorigin fetchpriority="low" href="/${e.file}" />`];
  // Rota CSS'i: `as="style"` ile onden cekilir. Stylesheet olarak eklemek
  // render-blocking yapardi — amac tam tersi.
  for (const c of e.css || []) tags.push(`<link rel="preload" as="style" fetchpriority="low" href="/${c}" />`);
  return tags;
}

function seoBlock({ title, description, url, image = DEFAULT_IMG, imageAlt = title, type = 'website', noindex = false, jsonLd = null, alternates = null, preloadImage = '', routeKey = '' }) {
  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    ...((alternates || []).map((alt) => `<link rel="alternate" hreflang="${esc(alt.hreflang)}" href="${esc(alt.href)}" />`)),
    `<meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'}" />`,
    `<meta property="og:type" content="${esc(type)}" />`,
    '<meta property="og:site_name" content="Qor AI" />',
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    // LCP gorseli: HTML ile BIRLIKTE inmeye baslar. Bu olmadan zincir
    // HTML -> JS -> Typesense -> render -> gorsel seklinde UC ardisik gidis-donus
    // oluyordu (olculdu: kategori LCP 9,5 sn / urun 7,5 sn, yavas 4G).
    ...(preloadImage ? [`<link rel="preload" as="image" href="${esc(preloadImage)}" fetchpriority="high" />`] : []),
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

// Crawlable body for the legal / policy / about / FAQ pages (privacy, terms,
// refund, cookies, contact, about, faq). Mirrors LegalPage's render
// (web/src/pages/Legal.jsx) from the SAME content source (legalContent.js), so
// the static HTML the AdSense reviewer + non-JS crawlers read is the FULL
// policy text — not the empty #root shell that got the site rejected twice.
// React wipes #root on mount, so real visitors still get the live SPA.
function legalBody(kind, lang = 'tr') {
  const copy = LEGAL_COPY[lang] || LEGAL_COPY.en;
  const meta = LEGAL_META[kind];
  if (!meta || !copy[kind]) return '';
  const common = copy.common;
  const [title, desc] = meta[lang] || meta.en;
  const sections = copy[kind];
  const toc = sections
    .map(([h], i) => `<a href="#s${i + 1}" style="color:#2563eb;text-decoration:none;margin:0 12px 6px 0;display:inline-block">${i + 1}. ${esc(h)}</a>`)
    .join('');
  const body = sections.map(([h, paras], i) =>
    `<section id="s${i + 1}" style="margin:22px 0">`
    + `<h2 style="font-size:20px;margin:0 0 8px">${esc(h)}</h2>`
    + paras.map((p) => `<p style="line-height:1.7;color:#334155;margin:8px 0">${esc(p)}</p>`).join('')
    + '</section>').join('');
  const related = ['terms', 'privacy', 'refund', 'cookies', 'about', 'faq', 'contact']
    .filter((k) => k !== kind && LEGAL_META[k])
    .map((k) => { const m = LEGAL_META[k]; const t = (m[lang] || m.en)[0]; return `<a href="${esc(m.path)}" style="color:#2563eb;margin:0 12px 6px 0;display:inline-block">${esc(t)}</a>`; })
    .join('');
  return '<main class="seo-prerender" style="max-width:880px;margin:0 auto;padding:24px 16px;font-family:\'Plus Jakarta Sans\',system-ui,sans-serif;color:#0f172a">'
    + `<nav style="font-size:13px;color:#64748b"><a href="/" style="color:#64748b">${esc(common.home)}</a> › ${esc(title)}</nav>`
    + `<h1 style="font-size:28px;margin:14px 0 6px">${esc(title)}</h1>`
    + `<p style="color:#475569;line-height:1.6">${esc(desc)}</p>`
    + `<p style="font-size:13px;color:#94a3b8;margin:6px 0 0">${esc(common.updated)}</p>`
    + `<div style="background:#f1f5f9;border-radius:12px;padding:14px 16px;margin:16px 0"><strong>Qor AI</strong><p style="line-height:1.7;color:#334155;margin:6px 0 0">${esc(common.legalBrand)}</p></div>`
    + (toc ? `<nav style="margin:16px 0;font-size:14px">${toc}</nav>` : '')
    + body
    + `<div style="margin:24px 0;font-size:14px"><strong>${esc(common.quickLinks)}:</strong><br/>${related}</div>`
    + `<p style="font-size:14px;margin:8px 0"><a href="mailto:${esc(common.email)}" style="color:#2563eb">${esc(common.contact)}: ${esc(common.email)}</a></p>`
    + '</main>';
}

// Crawlable homepage body: H1 + a real description of the service + an internal
// link grid to every category landing page and the main tools. Turns the root
// "/" from an empty SPA shell into a content-bearing hub — the first page the
// AdSense reviewer and Googlebot hit. React wipes #root on mount.
// Homepage prerender copy in all three served languages (tr=root, en=/en, de=/de).
const HOME_TEXT = {
  tr: {
    h1: 'Qor AI — Yapay Zekâ Ürün Danışmanı',
    p1: 'Qor AI; telefon, laptop, ekran kartı, kulaklık, televizyon, akıllı saat ve PC bileşenlerinden dijital aboneliklere kadar binlerce ürünü yapay zekâ ile inceleyip karşılaştırmanı sağlayan bir alışveriş ve ürün karar asistanıdır. Ürünleri ara, yan yana karşılaştır, bir ürün linkini yapıştırıp anında AI analizini al, abonelikleri değerlendir ve sana en uygun seçeneği saniyeler içinde bul.',
    p2: 'Her üründe Qor AI teknik skoru, güncel fiyatlar, öne çıkan özellikler ve benzer modellerle karşılaştırma bir arada sunulur. Aşağıdan kategorilere göz at ya da bir aracı seç.',
    cats: 'Kategoriler', tools: 'Araçlar',
    toolLinks: [['/category', 'Tüm Kategoriler'], ['/subscriptions', 'Abonelik Karşılaştır'], ['/link-analysis', 'Link Analizi'], ['/ai-chat', 'Qor AI Sohbet'], ['/quiz', 'Kişisel Quiz'], ['/blog', 'Blog & Alım Rehberleri'], ['/premium', 'Premium'], ['/about', 'Hakkımızda']],
  },
  en: {
    h1: 'Qor AI — AI Product & Subscription Advisor',
    p1: 'Qor AI is a shopping and product-decision assistant that uses AI to research and compare thousands of products — phones, laptops, GPUs, headphones, TVs, smartwatches and PC components — as well as digital subscriptions. Search products, compare them side by side, paste a product link for an instant AI analysis, evaluate subscriptions and find the option that fits you best in seconds.',
    p2: 'Every product shows the Qor AI tech score, current prices, key features and a comparison with similar models. Browse the categories below or pick a tool.',
    cats: 'Categories', tools: 'Tools',
    toolLinks: [['/category', 'All categories'], ['/subscriptions', 'Compare subscriptions'], ['/link-analysis', 'Link analysis'], ['/ai-chat', 'Qor AI Chat'], ['/quiz', 'Personal quiz'], ['/blog', 'Blog & buying guides'], ['/premium', 'Premium'], ['/about', 'About']],
  },
  de: {
    h1: 'Qor AI — KI-Produkt- und Abo-Berater',
    p1: 'Qor AI ist ein Einkaufs- und Produktentscheidungs-Assistent, der mit KI Tausende Produkte recherchiert und vergleicht — Smartphones, Laptops, Grafikkarten, Kopfhörer, Fernseher, Smartwatches und PC-Komponenten — sowie digitale Abos. Suche Produkte, vergleiche sie nebeneinander, füge einen Produktlink für eine sofortige KI-Analyse ein, bewerte Abos und finde in Sekunden die beste Option für dich.',
    p2: 'Zu jedem Produkt gibt es den Qor-AI-Techscore, aktuelle Preise, wichtige Merkmale und einen Vergleich mit ähnlichen Modellen. Stöbere unten in den Kategorien oder wähle ein Tool.',
    cats: 'Kategorien', tools: 'Tools',
    toolLinks: [['/category', 'Alle Kategorien'], ['/subscriptions', 'Abos vergleichen'], ['/link-analysis', 'Link-Analyse'], ['/ai-chat', 'Qor AI Chat'], ['/quiz', 'Persönliches Quiz'], ['/blog', 'Blog & Kaufratgeber'], ['/premium', 'Premium'], ['/about', 'Über uns']],
  },
};

function homeBody(guides, lang = 'tr') {
  const tx = HOME_TEXT[lang] || HOME_TEXT.tr;
  const cats = [...guides.keys()]
    .map((cat) => ({ href: categoryPath(cat), label: categoryLabel(cat, lang) }))
    .filter((c) => c.href && c.label)
    .sort((a, b) => a.label.localeCompare(b.label, lang));
  const catLinks = cats
    .map((c) => `<li style="margin:4px 0"><a href="${esc(c.href)}" style="color:#2563eb;text-decoration:none">${esc(c.label)}</a></li>`)
    .join('');
  const tools = tx.toolLinks
    .map(([h, t]) => `<li style="margin:4px 0"><a href="${h}" style="color:#2563eb;text-decoration:none">${esc(t)}</a></li>`).join('');
  return '<main class="seo-prerender" style="max-width:1000px;margin:0 auto;padding:24px 16px;font-family:\'Plus Jakarta Sans\',system-ui,sans-serif;color:#0f172a">'
    + `<h1 style="font-size:30px;margin:0 0 10px">${esc(tx.h1)}</h1>`
    + `<p style="line-height:1.7;color:#334155;max-width:760px">${esc(tx.p1)}</p>`
    + `<p style="line-height:1.7;color:#334155;max-width:760px">${esc(tx.p2)}</p>`
    + `<h2 style="font-size:20px;margin:24px 0 8px">${esc(tx.cats)}</h2>`
    + `<ul style="columns:2;-webkit-columns:2;list-style:none;padding:0;margin:0">${catLinks}</ul>`
    + `<h2 style="font-size:20px;margin:24px 0 8px">${esc(tx.tools)}</h2>`
    + `<ul style="list-style:none;padding:0;margin:0">${tools}</ul>`
    + '</main>';
}

// Shared category link grid (used by the homepage + the /category landing).
function categoryLinkGrid(guides, lang = 'tr') {
  const cats = [...guides.keys()]
    .map((cat) => ({ href: categoryPath(cat), label: categoryLabel(cat, lang) }))
    .filter((c) => c.href && c.label)
    .sort((a, b) => a.label.localeCompare(b.label, 'tr'));
  return '<ul style="columns:2;-webkit-columns:2;list-style:none;padding:0;margin:0">'
    + cats.map((c) => `<li style="margin:4px 0"><a href="${esc(c.href)}" style="color:#2563eb;text-decoration:none">${esc(c.label)}</a></li>`).join('')
    + '</ul>';
}

// Descriptive, crawlable bodies for the main navigable landing pages that
// otherwise ship an empty #root — i.e. every nav target a reviewer clicks
// (Kategoriler, Abonelikler, Link Analizi, Premium) plus AI Chat and Quiz. No
// nav destination should be a blank page. Accurate to CURRENT features only
// (no removed PC Builder). React wipes #root on mount.
const LANDING = {
  category: {
    h1: 'Kategoriler',
    paras: [
      'Qor AI kataloğundaki teknoloji ürünlerini kategoriye göre keşfet: telefonlar, laptoplar, ekran kartları, işlemciler, kulaklıklar, televizyonlar, akıllı saatler, monitörler, PC bileşenleri ve daha fazlası. Her kategoride yapay zekâ teknik skoru, güncel fiyatlar ve öne çıkan özellikler bir arada sunulur.',
      'Bir kategoriye gir, modelleri filtrele, yan yana karşılaştır ve sana en uygun olanı seç. Aşağıdaki kategorilerden başlayabilirsin.',
    ],
    grid: true,
    links: [['/', 'Ana Sayfa'], ['/blog', 'Blog & Alım Rehberleri']],
  },
  subscriptions: {
    h1: 'Abonelik Karşılaştırma',
    paras: [
      'Netflix, Spotify, YouTube Premium, Disney+, Amazon Prime, ChatGPT Plus, Game Pass ve daha fazla dijital aboneliği fiyat, içerik ve değer açısından yapay zekâ ile karşılaştır. Hangi platform sana daha çok değer sağlıyor, hangisi bütçene uygun — Qor AI yan yana gösterir.',
      'Müzik, dizi-film, oyun ve yapay zekâ aboneliklerini tek ekranda değerlendir; ihtiyacına en uygun paketi seç, gereksiz aboneliklerden kurtul.',
    ],
    links: [['/subscriptions', 'Abonelikleri karşılaştır'], ['/premium', 'Premium'], ['/blog', 'Rehberler']],
  },
  'link-analysis': {
    h1: 'Link Analizi',
    paras: [
      'Herhangi bir ürün bağlantısını yapıştır — Qor AI ürünü tanısın, özelliklerini çıkarsın, artılarını ve eksilerini özetlesin. Birden fazla linki aynı anda yapıştırıp ürünleri karşılaştırabilirsin.',
      'Mağaza sayfaları arasında kaybolmadan, bir ürünün gerçekten değer verip vermediğini yapay zekâ destekli analizle saniyeler içinde gör.',
    ],
    links: [['/link-analysis', 'Link analizine başla'], ['/category', 'Kategoriler'], ['/ai-chat', 'Qor AI Sohbet']],
  },
  premium: {
    h1: 'Premium',
    paras: [
      'Qor AI Premium, daha kapsamlı yapay zekâ kullanımı açar: Qor AI Sohbet, görsel tarayıcı, ürün AI analizi, link analizi, link karşılaştırma, abonelik analizi, premium öneriler ve genişletilmiş fiyat geçmişi.',
      'Güncel fiyatlar, deneme bilgisi ve plan ayrıntıları bu sayfada listelenir. Premium şu an yalnızca Google Play üzerinden satın alınabilir; web ödemeleri yakında eklenecek. İptal ve iade koşulları için İade Politikası\'na göz atabilirsin.',
    ],
    links: [['/premium', 'Premium planları'], ['/refund', 'İade Politikası'], ['/terms', 'Kullanım Koşulları']],
  },
  'ai-chat': {
    h1: 'Qor AI Sohbet',
    paras: [
      'Telefon, laptop, kulaklık ya da abonelik — aklındaki ürün sorusunu sor, Qor AI yapay zekâ danışmanından anında, tarafsız öneri al. "Bu bütçeye hangi laptop?", "Bu iki telefondan hangisi?" gibi soruları doğrudan sorabilirsin.',
      'Qor AI Sohbet bir araştırma asistanıdır; alternatifleri açıklar ve doğru soruları görünür kılar. Önemli özellik ve fiyatları satın almadan önce satıcı kaynağından doğrula.',
    ],
    links: [['/ai-chat', 'Sohbete başla'], ['/category', 'Kategoriler'], ['/quiz', 'Kişisel Quiz']],
  },
  quiz: {
    h1: 'Kişisel Quiz',
    paras: [
      'Birkaç soruyu yanıtla, Qor AI sana en uygun teknoloji ürününü önersin. Bütçeni, kullanım amacını ve önceliklerini belirt; yapay zekâ profiline göre kişiselleştirilmiş öneriler getirsin.',
      'Quiz, ne aradığından emin olmayanlar için hızlı bir başlangıç noktasıdır; sonrasında önerilen ürünleri karşılaştırıp inceleyebilirsin.',
    ],
    links: [['/quiz', 'Quizi başlat'], ['/category', 'Kategoriler'], ['/ai-chat', 'Qor AI Sohbet']],
  },
};

// en/de copy for the landing/feature pages (tr lives in LANDING above). Only h1 +
// paras + link labels are translated; hrefs are shared and get language-prefixed
// by localizeBodyLinks. Falls back to the tr entry if a key is missing.
const GRID_HEADING = { tr: 'Tüm kategoriler', en: 'All categories', de: 'Alle Kategorien' };
const LANDING_I18N = {
  en: {
    category: {
      h1: 'Categories',
      paras: [
        'Explore the tech products in the Qor AI catalogue by category: phones, laptops, GPUs, CPUs, headphones, TVs, smartwatches, monitors, PC components and more. Each category combines the AI tech score, current prices and key features.',
        'Open a category, filter the models, compare them side by side and pick the one that fits you best. Start from the categories below.',
      ],
      links: [['/', 'Home'], ['/blog', 'Blog & buying guides']],
    },
    subscriptions: {
      h1: 'Subscription Comparison',
      paras: [
        'Compare Netflix, Spotify, YouTube Premium, Disney+, Amazon Prime, ChatGPT Plus, Game Pass and more digital subscriptions by price, content and value with AI. Which platform gives you the most value, which one fits your budget — Qor AI shows them side by side.',
        'Evaluate music, streaming, gaming and AI subscriptions on one screen, pick the plan that fits your needs and drop the ones you don’t use.',
      ],
      links: [['/subscriptions', 'Compare subscriptions'], ['/premium', 'Premium'], ['/blog', 'Guides']],
    },
    'link-analysis': {
      h1: 'Link Analysis',
      paras: [
        'Paste any product link — Qor AI identifies the product, extracts its specs and summarizes its pros and cons. Paste several links at once to compare products.',
        'Without getting lost across store pages, see in seconds whether a product is really worth it with AI-powered analysis.',
      ],
      links: [['/link-analysis', 'Start link analysis'], ['/category', 'Categories'], ['/ai-chat', 'Qor AI Chat']],
    },
    premium: {
      h1: 'Premium',
      paras: [
        'Qor AI Premium unlocks deeper AI use: Qor AI Chat, visual scanner, product AI analysis, link analysis, link comparison, subscription analysis, premium recommendations and extended price history.',
        'Current prices, trial details and plan information are listed on this page. Premium can currently be purchased only through Google Play; web payments are coming soon. See the Refund Policy for cancellation and refund terms.',
      ],
      links: [['/premium', 'Premium plans'], ['/refund', 'Refund Policy'], ['/terms', 'Terms of Use']],
    },
    'ai-chat': {
      h1: 'Qor AI Chat',
      paras: [
        'Phone, laptop, headphones or a subscription — ask your product question and get instant, unbiased advice from the Qor AI assistant. Ask things like “which laptop for this budget?” or “which of these two phones?”.',
        'Qor AI Chat is a research assistant; it explains the alternatives and surfaces the right questions. Verify key features and prices from the seller before buying.',
      ],
      links: [['/ai-chat', 'Start chatting'], ['/category', 'Categories'], ['/quiz', 'Personal quiz']],
    },
    quiz: {
      h1: 'Personal Quiz',
      paras: [
        'Answer a few questions and let Qor AI recommend the tech product that fits you best. State your budget, use case and priorities; the AI brings personalized recommendations based on your profile.',
        'The quiz is a quick starting point for anyone unsure what to look for; afterwards you can compare and review the recommended products.',
      ],
      links: [['/quiz', 'Start the quiz'], ['/category', 'Categories'], ['/ai-chat', 'Qor AI Chat']],
    },
  },
  de: {
    category: {
      h1: 'Kategorien',
      paras: [
        'Entdecke die Technikprodukte im Qor-AI-Katalog nach Kategorie: Smartphones, Laptops, Grafikkarten, Prozessoren, Kopfhörer, Fernseher, Smartwatches, Monitore, PC-Komponenten und mehr. Jede Kategorie vereint KI-Techscore, aktuelle Preise und wichtige Merkmale.',
        'Öffne eine Kategorie, filtere die Modelle, vergleiche sie nebeneinander und wähle das passende aus. Starte mit den Kategorien unten.',
      ],
      links: [['/', 'Startseite'], ['/blog', 'Blog & Kaufratgeber']],
    },
    subscriptions: {
      h1: 'Abo-Vergleich',
      paras: [
        'Vergleiche Netflix, Spotify, YouTube Premium, Disney+, Amazon Prime, ChatGPT Plus, Game Pass und weitere digitale Abos nach Preis, Inhalt und Wert mit KI. Welche Plattform bietet dir den meisten Wert, welche passt zu deinem Budget — Qor AI zeigt sie nebeneinander.',
        'Bewerte Musik-, Streaming-, Gaming- und KI-Abos auf einem Bildschirm, wähle das passende Paket und kündige, was du nicht nutzt.',
      ],
      links: [['/subscriptions', 'Abos vergleichen'], ['/premium', 'Premium'], ['/blog', 'Ratgeber']],
    },
    'link-analysis': {
      h1: 'Link-Analyse',
      paras: [
        'Füge einen beliebigen Produktlink ein — Qor AI erkennt das Produkt, extrahiert die Spezifikationen und fasst Vor- und Nachteile zusammen. Füge mehrere Links gleichzeitig ein, um Produkte zu vergleichen.',
        'Sieh in Sekunden mit KI-Analyse, ob ein Produkt wirklich sein Geld wert ist — ohne dich zwischen Shop-Seiten zu verlieren.',
      ],
      links: [['/link-analysis', 'Link-Analyse starten'], ['/category', 'Kategorien'], ['/ai-chat', 'Qor AI Chat']],
    },
    premium: {
      h1: 'Premium',
      paras: [
        'Qor AI Premium schaltet tiefere KI-Nutzung frei: Qor AI Chat, visueller Scanner, Produkt-KI-Analyse, Link-Analyse, Link-Vergleich, Abo-Analyse, Premium-Empfehlungen und erweiterte Preishistorie.',
        'Aktuelle Preise, Testdetails und Planinformationen sind auf dieser Seite aufgeführt. Premium ist derzeit nur über Google Play erhältlich; Web-Zahlungen folgen in Kürze. Kündigungs- und Erstattungsbedingungen findest du in der Erstattungsrichtlinie.',
      ],
      links: [['/premium', 'Premium-Pläne'], ['/refund', 'Erstattungsrichtlinie'], ['/terms', 'Nutzungsbedingungen']],
    },
    'ai-chat': {
      h1: 'Qor AI Chat',
      paras: [
        'Smartphone, Laptop, Kopfhörer oder ein Abo — stelle deine Produktfrage und erhalte sofort unvoreingenommene Beratung vom Qor-AI-Assistenten. Frage z. B. „Welcher Laptop für dieses Budget?“ oder „Welches dieser beiden Smartphones?“.',
        'Qor AI Chat ist ein Recherche-Assistent; er erklärt die Alternativen und macht die richtigen Fragen sichtbar. Überprüfe wichtige Merkmale und Preise vor dem Kauf beim Händler.',
      ],
      links: [['/ai-chat', 'Chat starten'], ['/category', 'Kategorien'], ['/quiz', 'Persönliches Quiz']],
    },
    quiz: {
      h1: 'Persönliches Quiz',
      paras: [
        'Beantworte ein paar Fragen und lass Qor AI das passende Technikprodukt empfehlen. Gib Budget, Einsatzzweck und Prioritäten an; die KI liefert personalisierte Empfehlungen anhand deines Profils.',
        'Das Quiz ist ein schneller Einstieg, wenn du unsicher bist, wonach du suchen sollst; danach kannst du die empfohlenen Produkte vergleichen und ansehen.',
      ],
      links: [['/quiz', 'Quiz starten'], ['/category', 'Kategorien'], ['/ai-chat', 'Qor AI Chat']],
    },
  },
};

function landingBody(kind, guides, lang = 'tr') {
  const base = LANDING[kind];
  if (!base) return '';
  const tr = lang === 'tr' ? base : { ...base, ...((LANDING_I18N[lang] || {})[kind] || {}) };
  const paras = tr.paras.map((t) => `<p style="line-height:1.7;color:#334155;max-width:760px;margin:10px 0">${esc(t)}</p>`).join('');
  const grid = base.grid ? `<h2 style="font-size:20px;margin:24px 0 8px">${esc(GRID_HEADING[lang] || GRID_HEADING.tr)}</h2>${categoryLinkGrid(guides, lang)}` : '';
  const links = (tr.links && tr.links.length)
    ? `<p style="margin:18px 0;font-size:14px">${tr.links.map(([h, t]) => `<a href="${h}" style="color:#2563eb;margin-right:14px">${esc(t)}</a>`).join('')}</p>`
    : '';
  return '<main class="seo-prerender" style="max-width:980px;margin:0 auto;padding:24px 16px;font-family:\'Plus Jakarta Sans\',system-ui,sans-serif;color:#0f172a">'
    + `<h1 style="font-size:28px;margin:0 0 10px">${esc(tr.h1)}</h1>`
    + paras + grid + links
    + '</main>';
}


// ── Acilis kabugunun LCP blogu ──────────────────────────────────────────────
// Kabuk FCP'de (~1,7 sn) boyaniyor. Icerigi iskelet oldugunda LCP ADAYI yok:
// en buyuk icerik React mount + rota chunk'i bekliyor. Olculdu (/subscriptions,
// yavas 4G + 4x CPU): icerik 4211 ms'de DOM'a giriyor, LCP 5244 ms.
// Ana sayfada gercek hero'yu kabuga koymak LCP'yi 3932 -> 2488 yapmisti; ayni
// sey rota sayfalari icin de gecerli. FARK: her sayfa KENDI metnini tasir —
// ana sayfanin basligini 23 bin sayfaya kopyalamak "olcekli icerik" sinyali
// olurdu, o yuzden reddedilmisti.
// Metinler i18n'den OKUNUR, kopyalanmaz: iki yerde tutulsa ayrisir ve kabuk
// kalkarken kullanici metnin degistigini GORUR.
const T = (lang, key) => (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || '';
const BOOT_LANGS = ['en', 'tr', 'de'];

function bootSkeleton() {
  return '<div class="qb-skel">'
    + '<div class="qb-sk" style="height:210px"></div>'
    + '<div class="qb-sk" style="height:52px;border-radius:999px"></div>'
    + '<div class="qb-sk" style="height:150px"></div></div>';
}

// PageHero'nun (subscriptions / link-analysis / premium) kabuk karsiligi.
function pageHeroBlock(lang, kicker, title, accent, after, lead) {
  return `<div class="qb-hero" data-l="${lang}"><section class="page-hero has-lead">`
    + '<div class="container page-hero-inner">'
    + (kicker ? `<span class="page-hero-kicker">${esc(kicker)}</span>` : '')
    + `<div class="qb-ph-title">${esc(title)}${accent ? `<span class="page-hero-accent">${esc(accent)}</span>` : ''}${esc(after || '')}</div>`
    + `<p class="page-hero-lead">${esc(lead)}</p>`
    + '</div></section></div>';
}

// Kategori sayfasinin kendi basligi (.cat-hero).
function catHeroBlock(lang, label) {
  return `<div class="qb-hero" data-l="${lang}"><div class="cat-hero"><div class="container">`
    + `<div class="qb-cat-title">${esc(label)}</div>`
    + `<p>${esc(T(lang, 'catalog.subtitle'))}</p>`
    + '</div></div></div>';
}

// routeKey -> uc dilde kabuk hero'su. Bos donerse iskelet kullanilir.
function bootHero(routeKey, extra = {}) {
  if (routeKey === 'subscriptions') {
    return BOOT_LANGS.map((l) => pageHeroBlock(l, T(l, 'subs.heroKicker'), T(l, 'subs.heroTitle'),
      T(l, 'subs.heroAccent'), T(l, 'subs.heroTitleAfter'), T(l, 'subs.heroLead'))).join('');
  }
  if (routeKey === 'link-analysis') {
    return BOOT_LANGS.map((l) => pageHeroBlock(l, T(l, 'la.heroKicker'), T(l, 'la.heroTitle'),
      T(l, 'la.heroAccent'), T(l, 'la.heroTitleAfter'), T(l, 'la.heroLead'))).join('');
  }
  if (routeKey === 'category' && extra.labels) {
    return BOOT_LANGS.map((l) => catHeroBlock(l, extra.labels[l] || extra.labels.en || '')).join('');
  }
  return '';
}

function renderPage(template, seo, bodyHtml) {
  // Function replacers, not string replacers: product names flow into the SEO
  // block and body, and a literal "$&"/"$1" in a name would otherwise be
  // interpreted as a String.replace special pattern and corrupt the output.
  const block = `<!-- seo:start -->\n  ${seoBlock(seo)}\n  <!-- seo:end -->`;
  let out = template.replace(/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/, () => block);
  // Match the <html lang> attribute to the page language so a crawler that never
  // runs JS doesn't see e.g. German content under lang="tr". tr is a no-op.
  const lang = seo.lang || SEO_DEFAULT_LOCALE;
  if (lang !== 'tr') out = out.replace(/<html lang="[a-z-]+"/i, () => `<html lang="${lang}"`);
  if (bodyHtml) out = out.replace('<div id="root"></div>', () => `<div id="root">${bodyHtml}</div>`);
  // Acilis kabugundaki hero metni YALNIZCA ana sayfada kalir. Sablonda duruyor
  // cunku kabuk statik; diger rotalarda buradan SILINIR. Aksi halde ana
  // sayfanin uc dildeki basligi 23 bin sayfaya kopyalanir — bu sitenin daha
  // once yandigi "olcekli/kopya icerik" sinyalinin ta kendisi. Silinince kabuk
  // notr iskelete duser (.qb-skel).
  // Kabuktaki LCP blogu: ana sayfa sablondaki kendi hero'sunu KORUR; diger
  // rotalar kendi hero'suyla degistirilir; geri kalanlar iskelete duser.
  if (seo.isHome) {
    // Ana sayfanin hero'su sablonda duruyor (metni Home.jsx'te satir ici, i18n
    // anahtari yok). Yalnizca iskeleti cikar: aksi halde hero'nun ALTINDA bos
    // iskelet cubuklari da cizilir.
    out = out.replace(/<div class="qb-skel">[\s\S]*?<\/div>\s*<!--\/qb-hero-->/, '<!--/qb-hero-->');
  } else {
    const blok = bootHero(seo.routeKey || '', seo.bootExtra || {}) || bootSkeleton();
    out = out.replace(/<!--qb-hero-->[\s\S]*?<!--\/qb-hero-->/, () => `<!--qb-hero-->${blok}<!--/qb-hero-->`);
  }
  // Rota on-yuklemesi head'in EN SONUNA, yani vite'in giris modulunden SONRA.
  // Ilk denemede seo blogunun icindeydi (head'in basi) ve OLCUM ONCELIK
  // TERSLENMESI gosterdi: rota chunk'i 1585 ms'de indi ama ona BAGIMLI olan
  // vendor+index 2366 ms'e itildi — yani on-yukleme LCP'yi iyilestirmek yerine
  // kotulestiriyordu. Ayrica fetchpriority=low: bos bant genisligini kullansin,
  // kritik paketin onune gecmesin.
  const rp = routePreloadTags(seo.routeKey || '');
  if (rp.length) out = out.replace('</head>', () => `  ${rp.join('\n  ')}\n</head>`);
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
  const fields = 'id,name,slug,brand,category,subcategory,imageUrl,techScore,trendScore,lowestPriceUSD,specsCount,screenSizeValue,batteryCapacityValue,weightValueKg,updatedAtTs,scrapedAtTs';
  // Katalog ~430 sayfada cekiliyor. Tek bir sayfanin gecici olarak dusmesi TUM
  // build'i iptal ediyordu — ve prebuild website/'i coktan bosalttigi icin geriye
  // gutted bir agac kaliyordu. 2026-08-15: Hetzner'a giden yol %40 paket kaybina
  // dustu; kapiyi gecen (3/3 agir sorgu) bir kosu bile sayfalama ortasinda
  // oluyordu. Yuzlerce ardisik istekte tek seferlik hata KACINILMAZ, dolayisiyla
  // dogru davranis "yeniden dene", "pes et" degil.
  const page = async (p) => {
    const qs = new URLSearchParams({
      q: '*', query_by: 'name', sort_by: 'techScore:desc',
      per_page: String(perPage), page: String(p), include_fields: fields,
    });
    const url = `${TS_URL}/collections/${TS_COLLECTION}/documents/search?${qs}`;
    let son = null;
    for (let deneme = 1; deneme <= 5; deneme += 1) {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 45000);
        try {
          const res = await fetch(url, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY }, signal: ctrl.signal });
          if (!res.ok) throw new Error(`Typesense ${res.status}`);
          return await res.json();
        } finally { clearTimeout(to); }
      } catch (err) {
        son = err;
        if (deneme === 5) break;
        // Artan bekleme: 1,5 / 3 / 6 / 12 sn. Yol dalgali oldugu icin beklemek
        // tekrar denemekten daha etkili.
        await new Promise((r) => setTimeout(r, 1500 * (2 ** (deneme - 1))));
      }
    }
    throw new Error(`sayfa ${p} 5 denemede alinamadi: ${son?.message || son}`);
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

// The clean labeled keySpecs map lives ONLY inside `_raw` (a ~25-70 KB blob per
// doc), so we never pull it for the whole 106k catalogue. Instead we fetch `_raw`
// just for the ~few-thousand CURATED products that get a static shell, in id
// batches, and return id → keySpecs. This is what upgrades each product page from
// a thin near-duplicate template to a page with real, unique spec content.
async function fetchKeySpecsByIds(ids) {
  const byId = new Map();
  const BATCH = 90;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH).filter(Boolean);
    if (!slice.length) continue;
    const qs = new URLSearchParams({
      q: '*', query_by: 'name',
      filter_by: `id:[${slice.join(',')}]`,
      per_page: String(slice.length), include_fields: 'id,_raw',
    });
    let res;
    try {
      res = await fetch(
        `${TS_URL}/collections/${TS_COLLECTION}/documents/search?${qs}`,
        { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } },
      );
    } catch (_) { continue; }
    if (!res || !res.ok) continue;
    let j;
    try { j = await res.json(); } catch (_) { continue; }
    for (const h of (j.hits || [])) {
      const doc = h.document || {};
      if (!doc.id || !doc._raw) continue;
      try {
        const raw = JSON.parse(doc._raw);
        if (raw && raw.keySpecs && typeof raw.keySpecs === 'object' && Object.keys(raw.keySpecs).length) {
          byId.set(doc.id, raw.keySpecs);
        }
        // ÜRÜN ADININ ÇEVİRİSİ — 2026-08-07.
        // `name` alanı Epey'den geldiği için TÜRKÇE ("… Bilgisayar Kasası") ve
        // ön-render üç dilde de onu basıyordu: İngilizce arayan kullanıcı
        // Google'da Türkçe başlık görüyordu. Çeviri zaten veride var
        // (`nameTranslated.en`), ama yalnız `_raw` içinde — Typesense'te üst
        // seviye alan değil. Zaten burada `_raw` çekiliyor, adı da alıyoruz.
        // Web istemcisi (lib/productNames.js displayProductName) aynı alanı
        // kullanıyor; böylece ön-render ile SPA aynı adı gösterir.
        const nt = raw && raw.nameTranslated;
        if (nt && typeof nt === 'object') nameById.set(doc.id, nt);
      } catch (_) {}
    }
  }
  return byId;
}

// Ürünün BİR DİLDEKİ görünen adı. Almanca ad üretilmiyor (specs yalnız TR+EN
// tutuluyor) → de, en'e düşer; en yoksa kaynak ad (Türkçe) kalır.
const nameById = new Map();
function localizedName(d, lang) {
  const nt = nameById.get(d?.id);
  const pick = (code) => {
    const v = nt && nt[code];
    return v && String(v).trim() ? String(v).trim() : '';
  };
  if (lang === 'tr') return pick('tr') || String(d?.name || '');
  if (lang === 'de') return pick('de') || pick('en') || String(d?.name || '');
  return pick('en') || String(d?.name || '');
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
          {
            '@type': 'Organization', '@id': `${SITE}/#organization`, name: 'Qor AI', url: `${SITE}/`, logo: DEFAULT_IMG,
            description: 'Yapay zekâ destekli ürün ve dijital abonelik danışmanı.',
            sameAs: ['https://play.google.com/store/apps/details?id=com.compair.app'],
          },
          {
            '@type': 'WebSite', '@id': `${SITE}/#website`, name: 'Qor AI', url: `${SITE}/`,
            publisher: { '@id': `${SITE}/#organization` },
            potentialAction: {
              '@type': 'SearchAction',
              target: `${SITE}/?q={search_term_string}`,
              'query-input': 'required name=search_term_string',
            },
          },
          {
            // Declares Qor AI to Google as an AI-powered product-analysis app (not
            // just another listing site). Every feature below is real and visible
            // in the live UI, so this is an honest machine-readable declaration —
            // not cloaking. This is the strongest signal that the site IS an AI tool.
            '@type': 'WebApplication', '@id': `${SITE}/#webapp`, name: 'Qor AI',
            url: `${SITE}/`, applicationCategory: 'ShoppingApplication',
            operatingSystem: 'Web, Android', inLanguage: ['tr', 'en', 'de'],
            description: 'Teknoloji ürünlerini ve dijital abonelikleri yapay zekâ ile '
              + 'analiz eden, karşılaştıran ve kişiye özel öneren AI ürün danışmanı.',
            featureList: [
              'Yapay zekâ ürün analizi',
              'Yapay zekâ ile ürün karşılaştırma',
              'Ürün linki analizi — linki yapıştır, AI tanısın ve analiz etsin',
              'Dijital abonelik karşılaştırma (Netflix, Spotify, YouTube Premium…)',
              'AI teknik skoru (0–100)',
              'Kişiye özel ürün önerisi',
              'AI sohbet danışmanı',
            ],
            publisher: { '@id': `${SITE}/#organization` },
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          },
        ],
      },
    },
  },
  {
    dir: 'category', path: '/category', changefreq: 'daily', priority: '0.9',
    seo: {
      title: 'Tüm Teknoloji Kategorileri — Karşılaştır ve Keşfet | Qor AI',
      description: 'Akıllı telefon, laptop, ekran kartı, kulaklık ve TV dahil 40+ kategoride AI puanlı ürünleri keşfet; marka, fiyat ve özellik filtreleriyle yan yana karşılaştır.',
    },
  },
  {
    // `/compare` KABUĞU ŞART — yoksa sayfa 403 veriyordu.
    // website/compare/ dizini 1288 ön-render karşılaştırma sayfası tutuyor ama
    // dizinin KENDİ index.html'i yoktu. nginx bu durumda `/compare` isteğini
    // `/compare/`ye 301'liyor, orada da dizin listeleme kapalı olduğu için
    // 403 Forbidden dönüyordu. Yani karşılaştırma ekranında SAYFA YENİLEMEK
    // ya da adresi doğrudan açmak her seferinde 403'tü; SPA içi gezinmede
    // sorun görünmediği için gözden kaçmıştı. Diğer tüm rotaların (category,
    // product, blog…) kabuğu vardı, yalnız compare atlanmıştı.
    // Ürünsüz `/compare` boş bir seçim ekranıdır → noindex, sitemap dışı.
    dir: 'compare', path: '/compare', sitemap: false, noindex: true,
    seo: {
      title: 'Ürün Karşılaştır — Qor AI',
      description: 'Ürünleri yan yana karşılaştır: teknik skor, özellikler ve güncel fiyatlar tek ekranda.',
      noindex: true,
    },
  },
  {
    // `/product` (id'siz) yalnızca derin-link geri dönüşü için duran BOŞ bir
    // kabuktur — hiçbir içerik render etmez. sitemap'te değildi ama noindex de
    // almıyordu; Google dış bir linkle bulursa BOŞ sayfa indeksliyordu
    // (AdSense "düşük değerli içerik" sinyali). Artık noindex.
    dir: 'product', path: '/product', sitemap: false, noindex: true,
    seo: {
      title: 'Ürün özellikleri ve karşılaştırma — Qor AI',
      description: 'Qor AI ürün detay sayfası. Ürün özelliklerini, teknik skoru, görselleri ve karşılaştırma seçeneklerini incele.',
      noindex: true,
    },
  },
  {
    dir: 'link-analysis', path: '/link-analysis', changefreq: 'weekly', priority: '0.8',
    seo: {
      title: 'Link Analizi — Linki Yapıştır, Yapay Zekâ Analiz Etsin | Qor AI',
      description: 'Herhangi bir ürün bağlantısını yapıştır: Qor AI ürünü tanır, teknik özelliklerini çıkarır, artı ve eksilerini özetler. Birden fazla linki aynı anda karşılaştır.',
    },
  },
  {
    dir: 'subscriptions', path: '/subscriptions', changefreq: 'weekly', priority: '0.8',
    seo: {
      title: 'Abonelik Karşılaştırma — Netflix, Spotify, YouTube | Qor AI',
      description: 'Netflix, Spotify, YouTube Premium, Disney+, Game Pass ve ChatGPT Plus aboneliklerini fiyat, içerik ve değer açısından yapay zekâ ile yan yana karşılaştır.',
    },
  },
  {
    dir: 'premium', path: '/premium', changefreq: 'weekly', priority: '0.8',
    seo: {
      title: 'Qor AI Premium — Fiyatlar, Planlar ve Premium Özellikler',
      description: 'Qor AI Premium ile daha kapsamlı yapay zekâ: AI sohbet, görsel tarayıcı, ürün ve link analizi, abonelik analizi, premium öneriler ve genişletilmiş fiyat geçmişi.',
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
      description: 'Qor AI iade politikası: Polar web ödemeleri, 3 günlük ücretsiz deneme, aboneliği iptal etme, yenilemeler, mobil uygulama mağazası satın almaları ve iade talep süreci.',
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
      title: 'Kişisel Quiz — Sana En Uygun Teknoloji Ürününü Bul | Qor AI',
      description: 'Bütçeni, kullanım amacını ve önceliklerini söyle; Qor AI yapay zekâ profiline göre sana en uygun telefonu, laptopu veya diğer teknoloji ürününü önersin.',
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
      title: 'Qor AI Sohbet — Yapay Zekâ Teknoloji ve Alışveriş Danışmanı',
      description: 'Telefon, laptop, kulaklık ya da abonelik — sorunu yaz, Qor AI yapay zekâ danışmanından anında tarafsız öneri al; alternatifleri birlikte değerlendirin.',
    },
  },
  {
    dir: 'profile', path: '/profile', noindex: true,
    seo: { title: 'Profilim — Qor AI', description: 'Qor Coin bakiyen, karşılaştırmaların, analizlerin ve yorumların.', noindex: true },
  },
];

// ── Multilingual SEO (tr=root, en=/en, de=/de) ──────────────────────────────
// KÖK ADRESİN DİLİ = İNGİLİZCE (2026-08-05). Eskiden kök Türkçeydi: Google'da
// "qorai iphone specs" arayan bir İngiliz/Alman kullanıcıya Türkçe başlık ve
// açıklama çıkıyordu. Site dili GERÇEK ziyaretçi için hâlâ tarayıcıdan
// belirleniyor (bkz. web/src/main.jsx) — burada değişen yalnız arama
// motorlarının indekslediği ÖN-RENDER HTML'in dili.
// Adresler: /...  = en · /tr/... = tr · /de/... = de · x-default → kök (en)
const SEO_DEFAULT_LOCALE = 'en';
const SEO_LOCALES = ['en', 'tr', 'de'];
const localePrefix = (lang) => (lang === SEO_DEFAULT_LOCALE ? '' : `/${lang}`);

// A static route gets en/de variants only when it is indexable AND has real,
// translatable content: the homepage, the legal pages (legalBody is lang-aware)
// and the landing/feature pages (LANDING_I18N). /go and the /product placeholder
// stay tr-only. Products/compare are NOT multiplied by language — a 3× explosion
// of thin shells is exactly the crawl-budget/“scaled content” trap to avoid.
const isMultilangRoute = (r) =>
  !r.noindex && !r.seo?.noindex && (r.dir === '' || !!LEGAL_META[r.dir] || !!LANDING[r.dir]);

// hreflang cluster for a path that has no language prefix. x-default → tr (root).
function hreflangAlts(basePath) {
  const p = basePath === '/' ? '' : basePath;
  const alts = SEO_LOCALES.map((l) => ({ hreflang: l, href: `${SITE}${localePrefix(l)}${p || '/'}` }));
  alts.push({ hreflang: 'x-default', href: `${SITE}${p || '/'}` });
  return alts;
}

// Prefix a prerendered body's in-site links so a crawler/visitor on /tr stays in
// /tr (the default-locale body is returned unchanged). ONLY links whose root
// actually has per-language prerenders are prefixed — blog (slug-based i18n),
// /ai-chat and /go are left alone so we never point at a page that doesn't exist.
//
// DÜZELTİLDİ (2026-08-06): kapı `lang === 'tr'` idi — kök adres Türkçeyken doğru
// olan bu kontrol, kök İngilizceye döndükten sonra TERSİNE dönmüştü: Türkçe
// sayfaların İÇ LİNKLERİ öneksiz (yani İngilizce) sayfalara gidiyordu, üstelik
// Almanca sayfalar prefixlenirken. Kapı artık VARSAYILAN dile bakıyor.
const MULTILANG_LINK_RE = /href="(\/(?:category|product|compare|link-analysis|subscriptions|premium|quiz|terms|privacy|refund|cookies|contact|about|faq)(?:[/?#][^"]*)?|\/)"/g;
function localizeBodyLinks(html, lang) {
  if (lang === SEO_DEFAULT_LOCALE || !html) return html;
  return html.replace(MULTILANG_LINK_RE, (_m, p) => `href="/${lang}${p}"`);
}

// en/de <title>/<description> for the indexable content routes. Legal routes are
// resolved from LEGAL_META instead; tr uses the route's own seo. Missing → tr.
const STATIC_SEO_I18N = {
  en: {
    '': { title: 'Qor AI — AI Product & Subscription Advisor', description: 'Discover, compare and decide on tech products and digital subscriptions with AI. Phones, laptops, GPUs and more — analyzed by Qor AI.' },
    category: { title: 'All Tech Categories — Compare & Discover | Qor AI', description: 'Explore AI-scored products across 40+ categories including phones, laptops, GPUs, headphones and TVs; filter by brand, price and specs and compare side by side.' },
    'link-analysis': { title: 'Link Analysis — Paste a Product Link, Let AI Review It | Qor AI', description: 'Paste any product link: Qor AI identifies the product, extracts its specs and summarizes pros and cons. Paste several links at once to compare products with AI.' },
    subscriptions: { title: 'Subscription Comparison — Netflix, Spotify, YouTube | Qor AI', description: 'Compare Netflix, Spotify, YouTube Premium, Disney+, Game Pass and ChatGPT Plus subscriptions by price, content and value with AI — side by side in seconds.' },
    premium: { title: 'Qor AI Premium — Prices, Plans and Premium Features', description: 'Qor AI Premium unlocks deeper AI: AI chat, visual scanner, product and link analysis, subscription analysis, premium recommendations and extended price history.' },
    quiz: { title: 'Personal Quiz — Find the Tech Product That Fits You | Qor AI', description: 'Tell us your budget, use case and priorities; Qor AI recommends the phone, laptop or other tech product that fits your profile best — in a few quick questions.' },
    'ai-chat': { title: 'Qor AI Chat — AI Tech & Shopping Advisor', description: 'Phone, laptop, headphones or a subscription — ask your question and get instant, unbiased advice from the Qor AI assistant; weigh the alternatives together.' },
  },
  de: {
    '': { title: 'Qor AI — KI-Produkt- und Abo-Berater', description: 'Technikprodukte und digitale Abos mit KI entdecken, vergleichen und entscheiden. Smartphones, Laptops, GPUs und mehr — analysiert von Qor AI.' },
    category: { title: 'Alle Technik-Kategorien — Vergleichen & Entdecken | Qor AI', description: 'Entdecke KI-bewertete Produkte in 40+ Kategorien — Smartphones, Laptops, Grafikkarten, Kopfhörer und Fernseher; nach Marke, Preis und Specs filtern und vergleichen.' },
    'link-analysis': { title: 'Link-Analyse — Produktlink einfügen, KI analysiert | Qor AI', description: 'Füge einen Produktlink ein: Qor AI erkennt das Produkt, extrahiert die Spezifikationen und fasst Vor- und Nachteile zusammen. Mehrere Links gleichzeitig vergleichen.' },
    subscriptions: { title: 'Abo-Vergleich — Netflix, Spotify, YouTube & mehr | Qor AI', description: 'Vergleiche Netflix, Spotify, YouTube Premium, Disney+, Game Pass und ChatGPT Plus nach Preis, Inhalt und Wert mit KI — nebeneinander in Sekunden.' },
    premium: { title: 'Qor AI Premium — Preise, Pläne und Premium-Funktionen', description: 'Qor AI Premium schaltet tiefere KI frei: KI-Chat, visueller Scanner, Produkt- und Link-Analyse, Abo-Analyse, Premium-Empfehlungen und erweiterte Preishistorie.' },
    quiz: { title: 'Persönliches Quiz — Finde dein passendes Technikprodukt | Qor AI', description: 'Nenne Budget, Einsatzzweck und Prioritäten; Qor AI empfiehlt das Smartphone, den Laptop oder das Technikprodukt, das am besten zu deinem Profil passt.' },
    'ai-chat': { title: 'Qor AI Chat — KI-Technik- und Einkaufsberater', description: 'Smartphone, Laptop, Kopfhörer oder Abo — stelle deine Frage und erhalte sofort unvoreingenommene Beratung vom Qor-AI-Assistenten; Alternativen gemeinsam abwägen.' },
  },
};

// Per-language meta override for a static route. tr keeps the route's own seo.
function localizedRouteMeta(r, lang) {
  if (lang === 'tr') return {};
  if (LEGAL_META[r.dir]) {
    const m = LEGAL_META[r.dir]; const t = m[lang] || m.en;
    return t ? { title: t[0], description: t[1] } : {};
  }
  const o = (STATIC_SEO_I18N[lang] || {})[r.dir];
  return o ? { title: o.title, description: o.description } : {};
}

// ── main ────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(templatePath)) {
    console.error('[seo] website/index.html not found — run vite build first');
    process.exit(1);
  }
  // The scheduled refresh runs seo.mjs WITHOUT a vite build, so website/index.html
  // — the "template" — is the PREVIOUS run's homepage output with the prerendered
  // body already baked inside #root. Left as-is, renderPage() never finds the
  // empty `<div id="root"></div>` marker, so EVERY generated page keeps the
  // homepage body: ~7.8k identical pages — the exact duplicate/"scaled content"
  // signal that got the whole site suppressed. Always strip #root back to empty
  // before rendering (a fresh vite template is a no-op), and refuse to run if the
  // shell doesn't look right rather than mass-produce broken pages.
  // Lookahead, #root kapanisi ile ilk <script> arasinda HTML YORUMU olmasina da
  // izin verir. Eskiden yalnizca bosluk kabul ediyordu: 2026-08-10 gecesi oraya
  // bir aciklama yorumu girdigi icin regex eslesmedi, sanitize basarisiz sayildi
  // ve 04:17 cron'u SESSIZCE iptal etti — o gece hicbir yeni urun SEO sayfasi
  // almadi ve tek belirti log'da bir satirdi. Koruma zayiflamiyor: asagidaki iki
  // sart (bos #root + seo isaretcileri) hala kosuluyor.
  const template = readFileSync(templatePath, 'utf8')
    .replace(/<div id="root">[\s\S]*?<\/div>(?=(?:\s|<!--[\s\S]*?-->)*<script)/, '<div id="root"></div>');
  if (!template.includes('<div id="root"></div>') || !/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/.test(template)) {
    console.error('[seo] template sanitisation failed (no empty #root or seo markers) — aborting instead of regenerating every page from a dirty shell');
    process.exit(1);
  }

  // Buying guides drive the per-category landing pages AND the homepage's
  // internal-link grid, so load them up front (pure local file read, no network)
  // before the static shells are rendered.
  const guides = loadGuides();
  if (guides.size) {
    // Mirror guides into the served website/guides/ too. vite copies public/ on a
    // full build, but the scheduled cron runs seo.mjs alone — this keeps the SPA's
    // /guides/<cat>.json fetch in sync without a vite build.
    const gOut = join(site, 'guides');
    mkdirSync(gOut, { recursive: true });
    for (const [cat, g] of guides) writeTextFile(join(gOut, `${cat}.json`), JSON.stringify(g));
    console.log(`[seo] loaded + mirrored ${guides.size} buying guides`);
  }

  // 1) static route shells. The homepage + every legal/policy page ALSO get a
  //    real, crawlable #root body; the rest carry per-route meta only (category /
  //    product / blog get their rich bodies in later steps). This is the fix for
  //    the empty <div id="root"></div> that the AdSense reviewer kept rejecting.
  for (const r of STATIC_ROUTES) {
    const multilang = isMultilangRoute(r);
    // Tek dilli rotalar VARSAYILAN dile yazılır (kök adres). Burada 'tr'
    // sabitken varsayılan İngilizceye çevrilince /product yer tutucusu
    // /tr/product'a kaymış ve kökteki eski (indexlenebilir) kopya kalmıştı —
    // seo-audit bunu yakaladı.
    const locales = multilang ? SEO_LOCALES : [SEO_DEFAULT_LOCALE];
    for (const lang of locales) {
      let body = '';
      if (r.dir === '') body = homeBody(guides, lang);
      else if (LEGAL_META[r.dir]) body = legalBody(r.dir, lang);
      else if (LANDING[r.dir]) body = landingBody(r.dir, guides, lang);
      body = localizeBodyLinks(body, lang);
      const prefix = localePrefix(lang);
      const dir = `${prefix}${r.path}`.replace(/^\//, '');
      writeHtml(dir, renderPage(template, {
        ...r.seo, ...localizedRouteMeta(r, lang),
        url: `${SITE}${prefix}${r.path}`,
        lang,
        // Kabuktaki hero metni yalnizca ana sayfada kalsin (bkz. renderPage).
        isHome: r.dir === '',
        routeKey: r.dir,
        alternates: multilang ? hreflangAlts(r.path) : null,
      }, body));
    }
  }
  // 404 shell — noindex, keeps deep-link fallback working
  writeTextFile(
    join(site, '404.html'),
    renderPage(template, {
      // Kök adresin dili İngilizce; 404 kabuğu da öyle olmalı (metin SABİT
      // TÜRKÇEYDİ, üstelik `<html lang="en">` ile birlikte servis ediliyordu).
      title: 'Page not found — Qor AI', description: 'The page you are looking for may have moved.',
      url: `${SITE}/404`, lang: SEO_DEFAULT_LOCALE, noindex: true,
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

  // 2b) curated selection — pick the top-N de-duplicated, image-bearing models
  //     per category UP FRONT. This one list drives both the category landing
  //     page internal links (2c) and the per-product shells (2d). We bake a
  //     bounded, quality subset (not all 106k): a 100k-file dump of thin,
  //     near-duplicate scraped-spec SKUs is exactly the "scaled content" Google
  //     penalises, and a new domain's crawl budget can't absorb it anyway. The
  //     long tail stays reachable via the SPA but is kept out of the sitemap.
  const PER_CAT = Number(process.env.SEO_PRODUCTS_PER_CATEGORY || 150);
  const MAX_PRODUCTS = Number(process.env.SEO_MAX_PRODUCTS || 12000);
  const byCategory = new Map();
  for (const d of products) {
    const cat = String(d?.category || '').trim().toLowerCase();
    if (!cat) continue;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(d);
  }
  // Rank within each category by a blend of technical quality (techScore, 0-100)
  // and live demand/popularity (trendScore, 0-1). Pure techScore surfaced only
  // spec-flagships and MISSED hugely-searched mid-rangers (e.g. Redmi Note 15:
  // trendScore 0.98 but techScore ~54). The blend keeps flagships AND the models
  // people actually search; categories with no trend data fall back to techScore.
  const TREND_W = Number(process.env.SEO_TREND_WEIGHT || 60);
  const blendedScore = (d) => (Number(d.techScore) || 0) + (Number(d.trendScore) || 0) * TREND_W;
  for (const arr of byCategory.values()) arr.sort((a, b) => blendedScore(b) - blendedScore(a));
  const curatedByCat = new Map();
  let curatedTotal = 0;
  for (const [cat, items] of byCategory) {
    if (curatedTotal >= MAX_PRODUCTS) break;
    const seen = new Set();
    const picked = [];
    for (const d of items) {
      if (picked.length >= PER_CAT || curatedTotal >= MAX_PRODUCTS) break;
      if (!d?.id || !d?.name) continue;
      if (!/^https?:\/\//i.test(d.imageUrl || '')) continue; // image-less = thin page, skip
      const key = modelKey(d.name);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      picked.push(d);
      curatedTotal += 1;
    }
    if (picked.length) curatedByCat.set(cat, picked);
  }

  // Temiz etiketli key-specs'i (ve ürün adının ÇEVİRİLERİNİ) yalnız seçilmiş
  // küme için `_raw`'dan çekiyoruz. Bu adım kategori sayfalarından ÖNCE olmak
  // zorunda: `localizedName` sözlüğü burada doluyor ve kategori sayfalarındaki
  // ürün linkleri de dile göre adlandırılıyor (önce aşağıda, ürün sayfalarından
  // hemen önce yapılıyordu → kategori sayfaları Türkçe adlarla kalıyordu).
  const curatedIds = [];
  for (const picked of curatedByCat.values()) {
    for (const d of picked) if (d?.id) curatedIds.push(d.id);
  }
  let keySpecsById = new Map();
  try {
    keySpecsById = await fetchKeySpecsByIds(curatedIds);
    console.log(`[seo] fetched key-specs for ${keySpecsById.size}/${curatedIds.length} curated products · ${nameById.size} translated names`);
  } catch (err) {
    console.warn(`[seo] key-specs fetch failed (${err.message}) — product shells fall back to lean fields`);
  }

  // 2c) per-category landing shells — content-rich hubs: keyword title +
  //     ItemList JSON-LD + a crawlable <a> grid (categoryBody) to every curated
  //     product, so Google reaches product pages via internal links (home →
  //     category → product, ≤3 clicks) and the page isn't a thin head-only shell.
  // Per-language <title>/<description> for the category landings.
  const CAT_SEO_TEXT = {
    tr: { title: (l) => `${l} Karşılaştırma — Fiyat & Özellik | Qor AI`, desc: (l) => `${l} modellerini Qor AI ile karşılaştır: yapay zekâ teknik skoru, özellikler ve güncel fiyatlar bir arada. En iyi ${l} modellerini keşfet, filtrele ve sana en uygununu saniyeler içinde seç.` },
    en: { title: (l) => `${l} Comparison — Price & Specs | Qor AI`, desc: (l) => `Compare ${l} models with Qor AI: AI tech score, features and current prices together. Discover the best ${l} models, filter and pick the one that fits you in seconds.` },
    de: { title: (l) => `${l} Vergleich — Preis & Specs | Qor AI`, desc: (l) => `Vergleiche ${l}-Modelle mit Qor AI: KI-Techscore, Merkmale und aktuelle Preise zusammen. Entdecke die besten ${l}-Modelle, filtere und wähle in Sekunden das passende.` },
  };
  let categoryShells = 0;
  for (const [cat, picked] of curatedByCat) {
    const path = categoryPath(cat);
    if (!path) continue;
    const guide = guides.get(cat);
    const top = picked.slice(0, 24);
    const heroImg = String(top[0]?.imageUrl || '');
    // Category landings are the prime "best <X>" English/German query targets, so
    // generate them in all three languages with hreflang. Products in the JSON-LD
    // itemList stay on their tr-canonical URLs (there is one product page per model).
    for (const lang of SEO_LOCALES) {
      const label = categoryLabel(cat, lang);
      const prefix = localePrefix(lang);
      const url = `${SITE}${prefix}${path}`;
      const faqLd = lang === 'tr' ? guideFaqLd(guide, url) : null; // guide FAQ is tr-only copy
      const itemList = {
        '@type': 'ItemList', '@id': `${url}#itemlist`, name: `${label} — Qor AI`,
        numberOfItems: top.length,
        itemListElement: top.map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${prefix}${productPath(d)}`, name: localizedName(d, lang) })),
      };
      const collection = {
        '@type': 'CollectionPage', '@id': `${url}#webpage`, url, name: `${label} — Qor AI`,
        isPartOf: { '@id': `${SITE}/#website` }, mainEntity: { '@id': `${url}#itemlist` },
      };
      const breadcrumb = {
        '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE}${prefix}/` },
          { '@type': 'ListItem', position: 2, name: label, item: url },
        ],
      };
      const tx = CAT_SEO_TEXT[lang] || CAT_SEO_TEXT.tr;
      writeHtml(`${prefix}${path}`.replace(/^\//, ''), renderPage(template, {
        title: truncate(tx.title(label), 68),
        description: truncate(tx.desc(label)),
        url,
        lang,
        image: /^https?:\/\//i.test(heroImg) ? heroImg : DEFAULT_IMG,
        preloadImage: lcpVariant(heroImg, 'card'),
        routeKey: 'category',
        // Kabuktaki hero her dilde kendi kategori adini gostersin.
        bootExtra: { labels: Object.fromEntries(SEO_LOCALES.map((l) => [l, categoryLabel(cat, l)])) },
        type: 'website',
        alternates: hreflangAlts(path),
        jsonLd: { '@context': 'https://schema.org', '@graph': [collection, itemList, breadcrumb, ...(faqLd ? [faqLd] : [])] },
      }, localizeBodyLinks(categoryBody(label, url, picked, guide, lang), lang)));
      categoryShells += 1;
    }
  }
  console.log(`[seo] wrote ${categoryShells} per-category landing shells (tr/en/de, with internal product links)`);

  // 2d) curated per-product prerender — real static HTML per model: unique <head>
  //     (title/description/canonical + Product/Breadcrumb JSON-LD) + a content
  //     body with sibling-product links. Wipe stale product subdirs first so
  //     website/product/ never accumulates orphans. Keep product/index.html.
  for (const lang of SEO_LOCALES) {
    const productRoot = join(site, ...(localePrefix(lang) ? [lang] : []), 'product');
    if (!existsSync(productRoot)) continue;
    for (const entry of readdirSync(productRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        try { rmSync(join(productRoot, entry.name), { recursive: true, force: true }); } catch (_) {}
      }
    }
  }
  // ÜRÜN SAYFALARI ARTIK ÜÇ DİLDE (2026-08-06). Öncesinde yalnız kök adreste
  // (varsayılan dil) üretiliyor ve HİÇ hreflang taşımıyorlardı: sitede üç dil
  // desteklenmesine rağmen Google'da bir ürünü hangi dilde ararsa arasın herkes
  // TEK dildeki başlığı görüyordu (önce Türkçe, 08-05'ten sonra İngilizce).
  // Adresler değişmedi — `/product/<slug>` hâlâ İngilizce; yanına `/tr/product/…`
  // ve `/de/product/…` eklendi ve üçü hreflang ile birbirine bağlandı, böylece
  // arama motoru ziyaretçinin diline uygun olanı gösterir. Ziyaretçinin gerçek
  // dili HÂLÂ tarayıcıdan belirlenir; önek yalnız ön-render HTML'in dilini sabitler.
  const prerendered = [];
  for (const [cat, picked] of curatedByCat) {
    const categoryPathStr = categoryPath(cat);
    picked.forEach((d, i) => {
      const path = productPath(d);
      if (!path) return;
      const ks = keySpecsById.get(d.id) || null;
      const alternates = hreflangAlts(path);
      for (const lang of SEO_LOCALES) {
        const prefix = localePrefix(lang);
        const label = categoryLabel(cat, lang);
        const categoryUrl = `${SITE}${prefix}${categoryPathStr}`;
        const related = [];
        for (let k = 1; k <= 8 && k < picked.length; k += 1) {
          const r = picked[(i + k) % picked.length];
          // Benzer ürün linkleri de kendi dil ağacında kalsın (aksi halde
          // /tr/ ve /de/ ürün sayfaları arası hiç iç link olmuyor).
          related.push({ name: localizedName(r, lang), path: `${prefix}${productPath(r)}` });
        }
        writeHtml(
          `${prefix}${path}`.replace(/^\//, ''),
          renderPage(
            template,
            { ...productSeo(d, label, ks, lang), alternates, preloadImage: lcpVariant(d.imageUrl, 'full'), routeKey: 'product' },
            localizeBodyLinks(productBody(d, label, categoryUrl, related, ks, lang), lang),
          ),
        );
      }
      prerendered.push({ d, path });
    });
  }
  console.log(`[seo] wrote ${prerendered.length} curated products × ${SEO_LOCALES.length} languages = ${prerendered.length * SEO_LOCALES.length} product shells (<=${PER_CAT}/category, deduped, image-gated, hreflang-linked)`);

  // 2e) comparison ("X vs Y") pages — the highest-intent queries for a compare
  //     site. For each category we pair the top-K blended products (flagships +
  //     trending models), one static page per pair with a real side-by-side
  //     table + links to both products. The SPA's /compare/:pair route seeds the
  //     pool from the URL so the same page also renders live.
  //     We wipe website/compare here (not only in prebuild) so this step is
  //     self-sufficient when the scheduled CI job runs seo.mjs on its own.
  for (const lang of SEO_LOCALES) {
    const compareRoot = join(site, ...(localePrefix(lang) ? [lang] : []), 'compare');
    if (!existsSync(compareRoot)) continue;
    for (const entry of readdirSync(compareRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        try { rmSync(join(compareRoot, entry.name), { recursive: true, force: true }); } catch (_) {}
      }
    }
  }
  const COMPARE_TOP = Number(process.env.SEO_COMPARE_TOP || 8);
  const compares = [];
  for (const [cat, picked] of curatedByCat) {
    const categoryPathStr = categoryPath(cat);
    // Distinct MODELS only for pairing — never "Watch Ultra 3 vs Watch Ultra 3
    // Milano Loop". modelKey collapses cosmetic colour/strap/storage variants.
    const topK = [];
    const seenModels = new Set();
    for (const d of picked) {
      if (topK.length >= COMPARE_TOP) break;
      const k = modelKey(d.name);
      if (k && seenModels.has(k)) continue;
      if (k) seenModels.add(k);
      topK.push(d);
    }
    for (let i = 0; i < topK.length; i += 1) {
      for (let j = i + 1; j < topK.length; j += 1) {
        const a = topK[i]; const b = topK[j];
        const path = comparePath(a, b);
        const alternates = hreflangAlts(path);
        const ksA = keySpecsById.get(a.id) || null;
        const ksB = keySpecsById.get(b.id) || null;
        // "X vs Y" en yüksek niyetli sorgu; ürün sayfalarıyla aynı gerekçeyle
        // üç dilde üretilir ve hreflang ile bağlanır.
        for (const lang of SEO_LOCALES) {
          const prefix = localePrefix(lang);
          const label = categoryLabel(cat, lang);
          const categoryUrl = `${SITE}${prefix}${categoryPathStr}`;
          writeHtml(
            `${prefix}${path}`.replace(/^\//, ''),
            renderPage(
              template,
              { ...compareSeo(a, b, label, lang), alternates },
              localizeBodyLinks(compareBody(a, b, label, categoryUrl, ksA, ksB, lang), lang),
            ),
          );
        }
        compares.push({ a, b, path });
      }
    }
  }
  console.log(`[seo] wrote ${compares.length} comparisons × ${SEO_LOCALES.length} languages = ${compares.length * SEO_LOCALES.length} pages (top-${COMPARE_TOP}/category, distinct models, hreflang-linked)`);

  // 2f) blog — prerender /blog listing + /blog/<slug> articles from PB so they're
  //     crawlable HTML (the SPA also renders them live from PB). Wipe stale dirs.
  const articles = await fetchArticles();
  // Live prices for every product referenced by any article — looked up now (the
  // nightly cron runs this after the 03:10 price refresh), so blog prices track
  // the current Amazon price instead of a value frozen at article-write time.
  const blogProductIds = [];
  for (const a of articles) {
    for (const p of (Array.isArray(a.products) ? a.products : [])) {
      if (p && p.id && (p.kind || 'product') === 'product') blogProductIds.push(p.id);
    }
  }
  const blogPriceMap = await fetchBlogPrices(blogProductIds);
  console.log(`[seo] fetched live prices for ${blogPriceMap.size}/${new Set(blogProductIds).size} blog products`);
  const blogRoot = join(site, 'blog');
  if (existsSync(blogRoot)) {
    for (const entry of readdirSync(blogRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) { try { rmSync(join(blogRoot, entry.name), { recursive: true, force: true }); } catch (_) {} }
    }
  }
  // BLOG LİSTESİ ÜÇ DİLDE (2026-08-06). Öncesinde yalnız `/blog` vardı ve metni
  // SABİT TÜRKÇEYDİ — üstelik kök adres İngilizceye döndüğü için sayfa
  // `<html lang="en">` deyip Türkçe başlık basıyordu. Daha kötüsü, `/tr/` veya
  // `/de/` önekindeki bir ziyaretçi menüden Blog'a tıkladığında SPA `/tr/blog`
  // adresine gidiyor ve orada ön-render bulunmadığı için 404 kabuğu (noindex,
  // canonical → /404) servis ediliyordu.
  const BLOG_LIST_TEXT = {
    en: { title: 'Buying Guides & Blog — Qor AI', desc: '2026 buying guides for phones, laptops, headphones, TVs and more — scored and compared by Qor AI.' },
    tr: { title: 'Alım Rehberleri & Blog — Qor AI', desc: 'Telefon, laptop, kulaklık, TV ve daha fazlası için 2026 alım rehberleri — Qor AI ile puanlandı ve karşılaştırıldı.' },
    de: { title: 'Kaufberatung & Blog — Qor AI', desc: 'Kaufratgeber 2026 für Smartphones, Laptops, Kopfhörer, Fernseher und mehr — von Qor AI bewertet und verglichen.' },
  };
  const blogUrls = [];
  if (articles.length) {
    const blogListLastmod = lastmodAtLeastVersion(articles[0]?.updated);
    for (const lang of SEO_LOCALES) {
      const prefix = localePrefix(lang);
      const tx = BLOG_LIST_TEXT[lang] || BLOG_LIST_TEXT[SEO_DEFAULT_LOCALE];
      const url = `${SITE}${prefix}/blog`;
      writeHtml(`${prefix}/blog`.replace(/^\//, ''), renderPage(template, {
        title: tx.title, description: tx.desc, url, lang, type: 'website',
        routeKey: 'blog',
        alternates: hreflangAlts('/blog'),
        jsonLd: { '@context': 'https://schema.org', '@type': 'Blog', '@id': `${url}#blog`, name: 'Qor AI Blog', url },
      }, localizeBodyLinks(blogListBody(articles), lang)));
      blogUrls.push({
        loc: url, lastmod: blogListLastmod, changefreq: 'daily',
        priority: lang === SEO_DEFAULT_LOCALE ? '0.7' : '0.6',
      });
    }
    const BLOG_LANGS = ['tr', 'en', 'de'];
    for (const a of articles) {
      if (!a.slug) continue;
      const cover = articleCoverUrl(a) || DEFAULT_IMG;
      const slugs = { tr: a.slug_tr || a.slug, en: a.slug_en || a.slug, de: a.slug_de || a.slug };
      // hreflang map (+ x-default → VARSAYILAN dil, artık EN) so a TR/EN/DE searcher lands on the
      // matching-language URL and Google treats them as one translated article.
      const alternates = BLOG_LANGS.map((l) => ({ hreflang: l, href: `${SITE}/blog/${slugs[l]}` }));
      alternates.push({ hreflang: 'x-default', href: `${SITE}/blog/${slugs[SEO_DEFAULT_LOCALE] || slugs.tr}` });
      const written = new Set();
      for (const lang of BLOG_LANGS) {
        const s = slugs[lang];
        if (!s || written.has(s)) continue; // skip when a language reuses the canonical slug
        written.add(s);
        const url = `${SITE}/blog/${s}`;
        const t = (f) => a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '';
        const authorName = (a.author || '').trim() || 'Qor AI';
        const metaT = (a[`metaTitle_${lang}`] || a.metaTitle_tr || a.metaTitle || '').trim();
        const metaD = (a[`metaDescription_${lang}`] || a.metaDescription_tr || a.metaDescription || '').trim();
        const kw = (a[`tags_${lang}`] || a.tags_tr || a.tags || '').trim();
        const articleLd = {
          '@type': 'Article', '@id': `${url}#article`, headline: t('title'), description: metaD || t('lead'),
          image: [cover], datePublished: a.publishedAt || a.created, dateModified: a.updated,
          inLanguage: lang,
          ...(kw ? { keywords: kw } : {}),
          author: { '@type': 'Organization', name: authorName },
          publisher: { '@type': 'Organization', name: 'Qor AI', logo: { '@type': 'ImageObject', url: DEFAULT_IMG } },
          mainEntityOfPage: url,
        };
        writeHtml(`blog/${s}`, renderPage(template, {
          title: metaT || truncate(`${t('title')} | Qor AI`, 70), description: truncate(metaD || t('lead')),
          url, image: cover, imageAlt: t('title'), type: 'article', alternates,
          routeKey: 'blogpost',
          // <html lang> bu sayfanin GERCEK dili olsun: JS calistirmayan bir
          // tarayici/tarayici-botu Ingilizce govdeyi lang="tr" altinda
          // gormesin (2026-07-27: uc dil de lang="tr" ile yayindaydi).
          lang,
          jsonLd: { '@context': 'https://schema.org', '@graph': [articleLd] },
        }, blogArticleBody(a, lang, blogPriceMap)));
        blogUrls.push({ loc: url, lastmod: lastmodAtLeastVersion(a.updated || a.publishedAt), changefreq: 'weekly', priority: '0.7' });
      }
    }
  }
  console.log(`[seo] wrote ${Math.max(0, blogUrls.length - 1)} blog article shells`);

  // 3) sitemap — chunked into <=45k-URL files (sitemaps cap at 50k) with a
  //    sitemap index. A single 106k-URL sitemap is invalid per the spec.
  const CHUNK = 45000;
  const routeUrls = [];
  for (const r of STATIC_ROUTES.filter((x) => x.sitemap !== false && !x.noindex && !x.seo?.noindex)) {
    routeUrls.push({ loc: `${SITE}${r.path}`, lastmod: SEO_CONTENT_VERSION, changefreq: r.changefreq, priority: r.priority });
    // Mirror the en/de variants we actually prerendered (isMultilangRoute) so the
    // language pages get crawled, not just discovered via hreflang.
    if (isMultilangRoute(r)) {
      for (const l of SEO_LOCALES.filter((x) => x !== SEO_DEFAULT_LOCALE)) {
        routeUrls.push({ loc: `${SITE}/${l}${r.path}`, lastmod: SEO_CONTENT_VERSION, changefreq: r.changefreq, priority: r.priority });
      }
    }
  }
  // Only categories we actually generated a content shell for (curatedByCat),
  // including the en/de variants we now prerender alongside tr. lastmod = the
  // newest product in the category — a real change signal, not the build date.
  const categoryUrls = [];
  const prodTs = (d) => Number(d.updatedAtTs || d.scrapedAtTs) || 0;
  for (const [cat, picked] of [...curatedByCat.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const p = categoryPath(cat);
    if (!p) continue;
    const lastmod = lastmodFromTs(Math.max(0, ...picked.map(prodTs)));
    categoryUrls.push({ loc: `${SITE}${p}`, lastmod, changefreq: 'weekly', priority: '0.8' });
    for (const l of SEO_LOCALES.filter((x) => x !== SEO_DEFAULT_LOCALE)) categoryUrls.push({ loc: `${SITE}/${l}${p}`, lastmod, changefreq: 'weekly', priority: '0.8' });
  }
  // Only the curated, prerendered products go in the sitemap. Listing all 106k
  // (which serve the generic SPA shell with no per-product HTML) is exactly what
  // wasted crawl budget and produced the duplicate signal that blocked indexing.
  // Üç dilin de ön-render'ı üretildiği için üçü de sitemap'e girer — aksi halde
  // dil varyantları yalnız hreflang üzerinden keşfedilir ve taranmaları gecikir.
  const productUrls = prerendered.flatMap(({ d, path }) => {
    const lastmod = lastmodFromTs(d.updatedAtTs || d.scrapedAtTs);
    return SEO_LOCALES.map((l) => ({
      loc: `${SITE}${localePrefix(l)}${path}`, lastmod, changefreq: 'weekly',
      priority: l === SEO_DEFAULT_LOCALE ? '0.6' : '0.5',
    }));
  });
  const compareUrls = compares.flatMap(({ a, b, path }) => {
    const lastmod = lastmodFromTs(Math.max(prodTs(a), prodTs(b)));
    return SEO_LOCALES.map((l) => ({
      loc: `${SITE}${localePrefix(l)}${path}`, lastmod, changefreq: 'monthly',
      priority: l === SEO_DEFAULT_LOCALE ? '0.5' : '0.4',
    }));
  });
  const allUrls = [...routeUrls, ...categoryUrls, ...productUrls, ...compareUrls, ...blogUrls];

  const renderUrlset = (items) =>
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + items.map((u) =>
      `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}`
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
        `  <sitemap><loc>${SITE}/sitemap-${i + 1}.xml</loc></sitemap>`,
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

  // 5) llms.txt — llmstxt.org convention: a concise machine-readable site guide
  //    for AI answer engines (ChatGPT, Perplexity, Copilot, Claude). They already
  //    crawl the site (robots allows *); this tells them what Qor AI is and where
  //    the high-value pages live, improving citation/mention odds in AI answers.
  writeTextFile(join(site, 'llms.txt'), [
    '# Qor AI',
    '',
    '> Qor AI (qorai.net), teknoloji ürünlerini ve dijital abonelikleri yapay zekâ ile analiz eden,',
    '> karşılaştıran ve kişiye özel öneren ürün karar asistanıdır. AI product & subscription advisor:',
    '> compare tech products side by side, paste any product link for an instant AI analysis, and get',
    '> an AI tech score (0-100). Languages: Turkish (/), English (/en), German (/de). Also on Android.',
    '',
    '## Ana bölümler / Main sections',
    `- [Kategoriler / Categories](${SITE}/category): ${curatedByCat.size} teknoloji kategorisinde AI puanlı ürünler`,
    `- [Abonelik Karşılaştırma / Subscriptions](${SITE}/subscriptions): Netflix, Spotify, YouTube Premium, ChatGPT Plus…`,
    `- [Link Analizi / Link Analysis](${SITE}/link-analysis): ürün linki yapıştır, AI analiz etsin`,
    `- [Qor AI Sohbet / AI Chat](${SITE}/ai-chat)`,
    `- [Blog & Alım Rehberleri / Buying guides](${SITE}/blog)`,
    '',
    '## Veri / Data',
    `- [Sitemap](${SITE}/sitemap.xml): ${allUrls.length} sayfa — ürün (/product/<slug>-<id>), karşılaştırma (/compare/<a>-vs-<b>), kategori, rehber`,
    '- Her ürün sayfası: teknik özellik tablosu + Qor AI teknik skoru + benzer model linkleri',
    '',
    '## Politikalar / Policies',
    `- [Hakkında / About](${SITE}/about), [Gizlilik / Privacy](${SITE}/privacy), [Koşullar / Terms](${SITE}/terms), [İletişim / Contact](${SITE}/contact)`,
    '',
  ].join('\n'));

  // 6) IndexNow key file (served at https://qorai.net/<key>.txt) — proves
  //    ownership so the scheduled refresh can push changed URLs to IndexNow.
  writeTextFile(join(site, `${INDEXNOW_KEY}.txt`), `${INDEXNOW_KEY}\n`);

  // 7) 403 SÜPÜRMESİ — kendi index.html'i olmayan HER ara dizine kabuk yaz.
  //
  // nginx bir dizin isteğini `/dir/`ye 301'ler; dizinde index.html yoksa
  // (dizin listeleme kapalı) **403 Forbidden** döner. `website/compare/`
  // 1288 ön-render sayfa tutuyordu ama kendi index.html'i yoktu → karşılaştırma
  // ekranında SAYFA YENİLEMEK her seferinde 403 veriyordu. Aynı durum
  // `/tr/product/`, `/de/product/`, `/tr/compare/`, `/de/compare/` için de
  // geçerliydi: tek dilli rota kabukları yalnız varsayılan dile yazılıyor ama
  // ürün/karşılaştırma sayfaları her dile yazılıyor.
  //
  // Tek tek rota eklemek yerine çıktı ağacını tarayıp eksik olanı dolduruyoruz;
  // ileride yeni bir ön-render kökü eklenirse kendiliğinden kapsanır.
  {
    let patched = 0;
    const skip = new Set(['spa', 'assets']);
    const sweep = (dir) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      const subdirs = entries.filter((e) => e.isDirectory() && !skip.has(e.name));
      const hasIndex = entries.some((e) => e.isFile() && e.name === 'index.html');
      if (subdirs.length && !hasIndex) {
        const rel = dir.slice(site.length).replace(/\\/g, '/').replace(/^\//, '');
        const lang = SEO_LOCALES.find((l) => rel === l || rel.startsWith(`${l}/`)) || SEO_DEFAULT_LOCALE;
        writeHtml(rel, renderPage(template, {
          title: 'Qor AI', description: 'Qor AI', noindex: true,
          url: `${SITE}/${rel}`, lang,
        }, ''));
        patched += 1;
      }
      for (const s of subdirs) sweep(join(dir, s.name));
    };
    sweep(site);
    if (patched) console.log(`[seo] 403-süpürmesi: ${patched} dizine eksik index.html yazıldı`);
  }

  console.log(`[seo] wrote ${STATIC_ROUTES.length} route shells, ${prerendered.length} product shells, ${sitemapFiles} sitemap file(s) for ${allUrls.length} urls, robots.txt, indexnow key`);
}

main().catch((err) => {
  console.error('[seo] fatal:', err);
  process.exit(1);
});
