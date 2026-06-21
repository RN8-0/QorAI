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
import { categoryLabel, amazonGoPath } from '../src/lib/format.js';

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

// Sanitise stored article HTML for the static shell: allow only the tags the
// generator/editor produces (defensive — body is our own content).
function safeBodyHtml(html) {
  return String(html || '').replace(/<(?!\/?(?:h2|h3|p|ul|ol|li|strong|em|br|a)\b)[^>]*>/gi, '');
}

function blogArticleBody(a, lang = 'tr') {
  const t = (f) => a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '';
  const title = esc(t('title'));
  const lead = esc(t('lead'));
  const cover = /^https?:\/\//i.test(a.cover || '') ? esc(a.cover) : '';
  const body = safeBodyHtml(t('body'));
  const products = Array.isArray(a.products) ? a.products.filter((p) => p && p.id && p.name) : [];
  const blocks = products.map((p, i) => {
    const slug = slugifyProduct(p.slug || p.name);
    const href = slug ? `/product/${slug}-${p.id}` : `/product/${p.id}`;
    const desc = esc(p[`desc_${lang}`] || p.desc_tr || p.desc_en || '');
    const img = /^https?:\/\//i.test(p.imageUrl || '') ? esc(p.imageUrl) : '';
    const buy = esc(amazonGoPath(p, 'TR'));
    return `<div style="display:flex;gap:18px;border:1px solid #e2e8f0;border-radius:18px;padding:18px;margin:16px 0;position:relative">`
      + `<div style="position:absolute;top:-10px;left:-10px;width:30px;height:30px;border-radius:50%;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px">${i + 1}</div>`
      + (img ? `<a href="${href}" style="flex:0 0 168px;height:168px;border:1px solid #eef2f7;border-radius:14px;display:flex;align-items:center;justify-content:center"><img src="${img}" alt="${esc(p.name)}" style="width:100%;height:100%;object-fit:contain;padding:12px" loading="lazy" /></a>` : '')
      + `<div style="flex:1;min-width:0">`
      + `<div style="display:flex;gap:10px;align-items:center;margin-bottom:4px">${p.brand ? `<span style="font-size:12px;font-weight:700;color:#2563eb;text-transform:uppercase">${esc(p.brand)}</span>` : ''}${p.techScore ? `<span style="font-size:12px;font-weight:700;color:#16a34a">${esc(p.techScore)}/100</span>` : ''}</div>`
      + `<a href="${href}" style="display:block;font-size:19px;font-weight:700;color:#0f172a;text-decoration:none;margin-bottom:6px">${esc(p.name)}</a>`
      + (desc ? `<p style="font-size:15px;color:#475569;line-height:1.65;margin:0 0 14px">${desc}</p>` : '')
      + `<div style="display:flex;flex-wrap:wrap;gap:10px">`
      + `<a href="${href}?ai=1" style="padding:9px 16px;border-radius:12px;font-size:14px;font-weight:700;text-decoration:none;background:#2563eb;color:#fff">✨ AI ile Analiz Et</a>`
      + `<a href="${buy}" rel="sponsored nofollow" style="padding:9px 16px;border-radius:12px;font-size:14px;font-weight:700;text-decoration:none;background:#ff9900;color:#1a1a1a">🛒 Satın Al</a>`
      + `<a href="${href}" style="padding:9px 16px;border-radius:12px;font-size:14px;font-weight:700;text-decoration:none;border:1px solid #cbd5e1;color:#334155">İncele</a>`
      + `</div></div></div>`;
  }).join('');
  const concl = safeBodyHtml(a[`conclusion_${lang}`] || a.conclusion_tr || '');
  const dateStr = (a.publishedAt || a.created) ? String(a.publishedAt || a.created).slice(0, 10) : '';
  return `<article class="seo-prerender" style="max-width:800px;margin:0 auto;padding:24px 16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<nav style="font-size:13px;color:#64748b"><a href="/">Qor AI</a> › <a href="/blog">Blog</a></nav>`
    + (dateStr ? `<p style="font-size:13px;color:#64748b;margin:8px 0 0">📅 ${esc(dateStr)}</p>` : '')
    + `<h1 style="font-size:33px;font-weight:800;line-height:1.18;margin:8px 0 12px">${title}</h1>`
    + (lead ? `<p style="font-size:19px;color:#475569;line-height:1.6;margin:0 0 20px">${lead}</p>` : '')
    + `<div style="font-size:16.5px;line-height:1.85">${body}</div>`
    + blocks
    + (concl ? `<section style="margin:30px 0;border-top:1px solid #e2e8f0;padding-top:20px"><h2 style="font-size:23px;margin:0 0 10px">Sonuç</h2><div style="font-size:16.5px;line-height:1.85">${concl}</div></section>` : '')
    + `<p style="margin-top:28px"><a href="/blog" style="color:#2563eb;font-weight:600">← Tüm rehberler</a></p>`
    + `</article>`;
}

function blogListBody(articles, lang = 'tr') {
  const t = (a, f) => a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '';
  const rows = articles.map((a) => {
    const cover = /^https?:\/\//i.test(a.cover || '') ? esc(a.cover) : '';
    return `<a href="/blog/${esc(a.slug)}" style="display:flex;gap:18px;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;text-decoration:none;color:inherit;margin:14px 0">`
      + (cover ? `<div style="flex:0 0 200px;background:#f8fafc;display:flex;align-items:center;justify-content:center"><img src="${cover}" alt="${esc(t(a, 'title'))}" style="width:100%;max-height:150px;object-fit:contain;padding:16px" loading="lazy" /></div>` : '')
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
// pre-JS snapshot get real, unique text + internal links (category + siblings).
// Internal links matter: Googlebot defers JS for hours-to-weeks, so the crawl
// path and content must exist in the raw HTML, not only after the SPA renders.
function productBody(d, label, categoryUrl, related = []) {
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
  const relLinks = related
    .filter((r) => r && r.name && r.path)
    .slice(0, 8)
    .map((r) => `<li><a href="${esc(r.path)}" style="color:#2563eb">${esc(r.name)}</a></li>`)
    .join('');
  return `<main class="seo-prerender" style="max-width:880px;margin:0 auto;padding:24px 16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<nav style="font-size:13px;color:#64748b"><a href="/">Qor AI</a> › <a href="/category">Kategoriler</a> › <a href="${categoryUrl}">${lbl}</a></nav>`
    + `<h1 style="font-size:26px;margin:12px 0 4px">${name}</h1>`
    + `<p style="color:#475569;margin:0 0 12px">${brand ? `${brand} · ` : ''}${lbl}${score ? ` · Qor AI teknik skoru ${score}/100` : ''}</p>`
    + (img ? `<img src="${img}" alt="${name}" width="320" style="max-width:100%;height:auto;border-radius:12px" loading="lazy" />` : '')
    + (items ? `<ul style="margin:16px 0;line-height:1.7">${items}</ul>` : '')
    + `<p style="line-height:1.7;color:#334155">${name} özelliklerini${specs ? `, ${specs} teknik detayını` : ''} ve güncel fiyatlarını Qor AI yapay zekâ ile incele; benzer ${lbl.toLowerCase()} modelleriyle karşılaştır ve sana en uygununu seç.</p>`
    + (relLinks ? `<h2 style="font-size:18px;margin:20px 0 8px">Benzer ${lbl} modelleri</h2><ul style="line-height:1.8">${relLinks}</ul>` : '')
    + `<p><a href="${categoryUrl}" style="color:#2563eb;font-weight:600">Tüm ${lbl} modellerini karşılaştır →</a></p>`
    + `</main>`;
}

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

function categoryBody(label, categoryUrl, items, guide) {
  const lbl = esc(label);
  const links = items
    .filter((d) => d && d.name && d.id)
    .map((d) => {
      const score = Number(d.techScore) || 0;
      return `<li style="margin:4px 0"><a href="${esc(productPath(d))}" style="color:#0f172a;text-decoration:none">`
        + `${esc(d.name)}${score ? ` <span style="color:#64748b;font-size:12px">· ${score}/100</span>` : ''}</a></li>`;
    })
    .join('');
  return `<main class="seo-prerender" style="max-width:980px;margin:0 auto;padding:24px 16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<nav style="font-size:13px;color:#64748b"><a href="/">Qor AI</a> › <a href="/category">Kategoriler</a> › ${lbl}</nav>`
    + `<h1 style="font-size:28px;margin:12px 0 6px">${lbl} Karşılaştırma</h1>`
    + `<p style="line-height:1.7;color:#334155;max-width:680px">En iyi ${lbl.toLowerCase()} modellerini Qor AI yapay zekâ teknik skoru, özellikleri ve güncel fiyatlarıyla karşılaştır. Aşağıdaki modellerden birini seç ya da filtreleyerek sana en uygununu saniyeler içinde bul.</p>`
    + (links ? `<ul style="columns:2;column-gap:32px;margin:18px 0;padding:0;list-style:none">${links}</ul>` : '')
    + guideHtml(guide)
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

function compareBody(a, b, label, categoryUrl) {
  const na = esc(a.name); const nb = esc(b.name); const lbl = esc(label);
  const pa = esc(productPath(a)); const pb = esc(productPath(b));
  const sa = Number(a.techScore) || 0; const sb = Number(b.techScore) || 0;
  const rows = [
    cmpRow('Qor AI teknik skoru', sa ? `${sa}/100` : '', sb ? `${sb}/100` : ''),
    cmpRow('Marka', a.brand, b.brand),
    cmpRow('Ekran', a.screenSizeValue, b.screenSizeValue, 'inç'),
    cmpRow('Batarya', a.batteryCapacityValue, b.batteryCapacityValue, 'mAh'),
    cmpRow('Ağırlık', a.weightValueKg, b.weightValueKg, 'kg'),
  ].filter(Boolean).join('');
  return `<main class="seo-prerender" style="max-width:880px;margin:0 auto;padding:24px 16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<nav style="font-size:13px;color:#64748b"><a href="/">Qor AI</a> › <a href="/category">Kategoriler</a> › <a href="${categoryUrl}">${lbl}</a></nav>`
    + `<h1 style="font-size:26px;margin:12px 0 6px">${na} <span style="color:#94a3b8">vs</span> ${nb}</h1>`
    + `<p style="line-height:1.7;color:#334155">${na} ile ${nb} karşılaştırması: Qor AI yapay zekâ teknik skoru, özellikler ve güncel fiyatlar yan yana. Hangisi sana daha uygun, saniyeler içinde gör.</p>`
    + `<table style="border-collapse:collapse;margin:18px 0;width:100%;max-width:680px">`
    + `<thead><tr><th></th>`
    + `<th style="padding:8px 12px;text-align:left"><a href="${pa}" style="color:#2563eb">${na}</a></th>`
    + `<th style="padding:8px 12px;text-align:left"><a href="${pb}" style="color:#2563eb">${nb}</a></th></tr></thead>`
    + `<tbody>${rows}</tbody></table>`
    + `<p><a href="${categoryUrl}" style="color:#2563eb;font-weight:600">Tüm ${lbl} modellerini karşılaştır →</a></p>`
    + `</main>`;
}

function compareSeo(a, b, label) {
  const url = `${SITE}${comparePath(a, b)}`;
  const categoryUrl = `${SITE}${categoryPath(a.category)}`;
  const imgA = /^https?:\/\//i.test(a.imageUrl || '') ? a.imageUrl : DEFAULT_IMG;
  const title = truncate(`${a.name} vs ${b.name} — Karşılaştırma | Qor AI`, 70);
  const description = truncate(
    `${a.name} ile ${b.name} karşılaştırması — ${label}. `
    + 'Qor AI teknik skoru, özellikler ve güncel fiyatlar yan yana; hangisi daha iyi?',
  );
  const webPage = {
    '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title,
    isPartOf: { '@id': `${SITE}/#website` },
  };
  const itemList = {
    '@type': 'ItemList', '@id': `${url}#itemlist`, numberOfItems: 2,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: a.name, url: `${SITE}${productPath(a)}` },
      { '@type': 'ListItem', position: 2, name: b.name, url: `${SITE}${productPath(b)}` },
    ],
  };
  const breadcrumb = {
    '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: label, item: categoryUrl },
      { '@type': 'ListItem', position: 3, name: `${a.name} vs ${b.name}`, item: url },
    ],
  };
  return {
    title, description, url, image: imgA, imageAlt: `${a.name} vs ${b.name}`, type: 'website',
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
    jsonLd: { '@context': 'https://schema.org', '@graph': [webPage, breadcrumb] },
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
  const fields = 'id,name,slug,brand,category,subcategory,imageUrl,techScore,trendScore,lowestPriceUSD,specsCount,screenSizeValue,batteryCapacityValue,weightValueKg,updatedAtTs,scrapedAtTs';
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

  // 2c) per-category landing shells — content-rich hubs: keyword title +
  //     ItemList JSON-LD + a crawlable <a> grid (categoryBody) to every curated
  //     product, so Google reaches product pages via internal links (home →
  //     category → product, ≤3 clicks) and the page isn't a thin head-only shell.
  let categoryShells = 0;
  for (const [cat, picked] of curatedByCat) {
    const path = categoryPath(cat);
    if (!path) continue;
    const label = categoryLabel(cat, 'tr');
    const url = `${SITE}${path}`;
    const guide = guides.get(cat);
    const faqLd = guideFaqLd(guide, url);
    const top = picked.slice(0, 24);
    const heroImg = String(top[0]?.imageUrl || '');
    const itemList = {
      '@type': 'ItemList', '@id': `${url}#itemlist`, name: `${label} — Qor AI`,
      numberOfItems: top.length,
      itemListElement: top.map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${productPath(d)}`, name: d.name })),
    };
    const collection = {
      '@type': 'CollectionPage', '@id': `${url}#webpage`, url, name: `${label} — Qor AI`,
      isPartOf: { '@id': `${SITE}/#website` }, mainEntity: { '@id': `${url}#itemlist` },
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
      jsonLd: { '@context': 'https://schema.org', '@graph': [collection, itemList, breadcrumb, ...(faqLd ? [faqLd] : [])] },
    }, categoryBody(label, url, picked, guide)));
    categoryShells += 1;
  }
  console.log(`[seo] wrote ${categoryShells} per-category landing shells (with internal product links)`);

  // 2d) curated per-product prerender — real static HTML per model: unique <head>
  //     (title/description/canonical + Product/Breadcrumb JSON-LD) + a content
  //     body with sibling-product links. Wipe stale product subdirs first so
  //     website/product/ never accumulates orphans. Keep product/index.html.
  const productRoot = join(site, 'product');
  if (existsSync(productRoot)) {
    for (const entry of readdirSync(productRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        try { rmSync(join(productRoot, entry.name), { recursive: true, force: true }); } catch (_) {}
      }
    }
  }
  const prerendered = [];
  for (const [cat, picked] of curatedByCat) {
    const label = categoryLabel(cat, 'tr');
    const categoryUrl = `${SITE}${categoryPath(cat)}`;
    picked.forEach((d, i) => {
      const related = [];
      for (let k = 1; k <= 8 && k < picked.length; k += 1) {
        const r = picked[(i + k) % picked.length];
        related.push({ name: r.name, path: productPath(r) });
      }
      const path = productPath(d);
      if (!path) return;
      writeHtml(path.replace(/^\//, ''), renderPage(template, productSeo(d, label), productBody(d, label, categoryUrl, related)));
      prerendered.push({ d, path });
    });
  }
  console.log(`[seo] wrote ${prerendered.length} curated product shells (<=${PER_CAT}/category, deduped, image-gated)`);

  // 2e) comparison ("X vs Y") pages — the highest-intent queries for a compare
  //     site. For each category we pair the top-K blended products (flagships +
  //     trending models), one static page per pair with a real side-by-side
  //     table + links to both products. The SPA's /compare/:pair route seeds the
  //     pool from the URL so the same page also renders live.
  //     We wipe website/compare here (not only in prebuild) so this step is
  //     self-sufficient when the scheduled CI job runs seo.mjs on its own.
  const compareRoot = join(site, 'compare');
  if (existsSync(compareRoot)) {
    for (const entry of readdirSync(compareRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        try { rmSync(join(compareRoot, entry.name), { recursive: true, force: true }); } catch (_) {}
      }
    }
  }
  const COMPARE_TOP = Number(process.env.SEO_COMPARE_TOP || 8);
  const compares = [];
  for (const [cat, picked] of curatedByCat) {
    const label = categoryLabel(cat, 'tr');
    const categoryUrl = `${SITE}${categoryPath(cat)}`;
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
        writeHtml(path.replace(/^\//, ''), renderPage(template, compareSeo(a, b, label), compareBody(a, b, label, categoryUrl)));
        compares.push({ a, b, path });
      }
    }
  }
  console.log(`[seo] wrote ${compares.length} comparison pages (top-${COMPARE_TOP}/category, distinct models)`);

  // 2f) blog — prerender /blog listing + /blog/<slug> articles from PB so they're
  //     crawlable HTML (the SPA also renders them live from PB). Wipe stale dirs.
  const articles = await fetchArticles();
  const blogRoot = join(site, 'blog');
  if (existsSync(blogRoot)) {
    for (const entry of readdirSync(blogRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) { try { rmSync(join(blogRoot, entry.name), { recursive: true, force: true }); } catch (_) {} }
    }
  }
  const blogUrls = [];
  if (articles.length) {
    writeHtml('blog', renderPage(template, {
      title: 'Alım Rehberleri & Blog — Qor AI',
      description: 'Telefon, laptop, kulaklık, TV ve daha fazlası için 2026 alım rehberleri — Qor AI ile puanlandı ve karşılaştırıldı.',
      url: `${SITE}/blog`, type: 'website',
      jsonLd: { '@context': 'https://schema.org', '@type': 'Blog', '@id': `${SITE}/blog#blog`, name: 'Qor AI Blog', url: `${SITE}/blog` },
    }, blogListBody(articles)));
    blogUrls.push({ loc: `${SITE}/blog`, changefreq: 'daily', priority: '0.7' });
    for (const a of articles) {
      if (!a.slug) continue;
      const url = `${SITE}/blog/${a.slug}`;
      const t = (f) => a[`${f}_tr`] || a[`${f}_en`] || '';
      const cover = /^https?:\/\//i.test(a.cover || '') ? a.cover : DEFAULT_IMG;
      const articleLd = {
        '@type': 'Article', '@id': `${url}#article`, headline: t('title'), description: t('lead'),
        image: [cover], datePublished: a.publishedAt || a.created, dateModified: a.updated,
        author: { '@type': 'Organization', name: 'Qor AI' },
        publisher: { '@type': 'Organization', name: 'Qor AI', logo: { '@type': 'ImageObject', url: DEFAULT_IMG } },
        mainEntityOfPage: url,
      };
      writeHtml(`blog/${a.slug}`, renderPage(template, {
        title: truncate(`${t('title')} | Qor AI`, 70), description: truncate(t('lead')),
        url, image: cover, imageAlt: t('title'), type: 'article',
        jsonLd: { '@context': 'https://schema.org', '@graph': [articleLd] },
      }, blogArticleBody(a)));
      blogUrls.push({ loc: url, lastmod: String(a.publishedAt || a.updated || '').slice(0, 10) || NOW, changefreq: 'weekly', priority: '0.7' });
    }
  }
  console.log(`[seo] wrote ${Math.max(0, blogUrls.length - 1)} blog article shells`);

  // 3) sitemap — chunked into <=45k-URL files (sitemaps cap at 50k) with a
  //    sitemap index. A single 106k-URL sitemap is invalid per the spec.
  const CHUNK = 45000;
  const routeUrls = STATIC_ROUTES.filter((r) => r.sitemap !== false && !r.noindex && !r.seo?.noindex).map((r) => ({
    loc: `${SITE}${r.path}`, changefreq: r.changefreq, priority: r.priority,
  }));
  // Only categories we actually generated a content shell for (curatedByCat).
  const categoryUrls = [...curatedByCat.keys()]
    .map((cat) => categoryPath(cat)).filter(Boolean)
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
  const compareUrls = compares.map(({ path }) => ({
    loc: `${SITE}${path}`, changefreq: 'monthly', priority: '0.5',
  }));
  const allUrls = [...routeUrls, ...categoryUrls, ...productUrls, ...compareUrls, ...blogUrls];

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

  // 5) IndexNow key file (served at https://qorai.net/<key>.txt) — proves
  //    ownership so the scheduled refresh can push changed URLs to IndexNow.
  writeTextFile(join(site, `${INDEXNOW_KEY}.txt`), `${INDEXNOW_KEY}\n`);

  console.log(`[seo] wrote ${STATIC_ROUTES.length} route shells, ${prerendered.length} product shells, ${sitemapFiles} sitemap file(s) for ${allUrls.length} urls, robots.txt, indexnow key`);
}

main().catch((err) => {
  console.error('[seo] fatal:', err);
  process.exit(1);
});
