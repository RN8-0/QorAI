'use strict';

/**
 * Top up existing epey.com products to 8 product-owned images.
 *
 * Usage:
 *   node scripts/repair_epey_images.js --dry
 *   node scripts/repair_epey_images.js --limit=200 --concurrency=8
 */

const { req } = require('../migration/pb');

const PROXY_URL = process.env.SCRAPER_PROXY_URL || 'http://localhost:3456';
const MAX_IMAGES = 8;

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const DRY = !!args.dry;
const LIMIT = Math.max(0, parseInt(args.limit || '0', 10) || 0);
const CONCURRENCY = Math.max(1, Math.min(16, parseInt(args.concurrency || '8', 10) || 8));

function escFilter(v) {
  return String(v || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizeEpeyProductUrl(url) {
  try {
    const u = new URL(url, 'https://www.epey.com');
    if (!/(^|\.)epey\.com$/i.test(u.hostname)) return '';
    if (!/\.html$/i.test(u.pathname) || /-resimleri\.html$/i.test(u.pathname)) return '';
    return `https://www.epey.com${u.pathname}`;
  } catch {
    return '';
  }
}

function slugFromUrl(url) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop().replace(/\.html$/i, '');
  } catch {
    return '';
  }
}

function galleryUrl(productUrl) {
  const u = normalizeEpeyProductUrl(productUrl);
  return u ? u.replace(/\.html$/i, '-resimleri.html') : '';
}

function normalizeImageUrl(url) {
  let u = String(url || '').trim()
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/^['"]|['"]$/g, '');
  if (u.startsWith('//')) u = `https:${u}`;
  if (!/^https?:\/\//i.test(u)) return '';
  u = u.split(/[?#]/)[0];
  if (!/resim\.epey\.com/i.test(u)) return '';
  if (/\/(?:tema|marka|kategori|logo|site|grup)\//i.test(u)) return '';
  if (/(favicon|yildiz|profil|yukleniyor|loading|placeholder)/i.test(u)) return '';
  if (!/\.(?:jpe?g|png|webp|avif)$/i.test(u)) return '';
  return u;
}

function imageKey(url) {
  return String(url || '').toLowerCase()
    .replace(/\/[a-z]_([^/]+)$/i, '/$1')
    .replace(/\.(jpe?g|png|webp|avif)$/i, '');
}

function ownImagePredicate(slug) {
  const tokens = String(slug || '')
    .toLowerCase()
    .replace(/-\d+(?:gb|tb|mb)\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !['html', 'resimleri'].includes(t));
  return (url) => {
    if (!tokens.length) return true;
    const lower = String(url || '').toLowerCase();
    const hits = tokens.filter(t => lower.includes(t)).length;
    return hits >= Math.min(2, tokens.length);
  };
}

function extractImages(html, slug) {
  const src = String(html || '').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  const own = ownImagePredicate(slug);
  const seen = new Set();
  const images = [];
  const imageFolder = (url) => (String(url || '').match(/resim\.epey\.com\/(\d+)\//i) || [])[1] || '';
  const re = /https?:\/\/resim\.epey\.com\/[^,"'()<>\s\\]+/gi;
  const matches = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const url = normalizeImageUrl(m[0]);
    if (url) matches.push(url);
  }
  const exactSlug = String(slug || '').toLowerCase();
  const push = (url) => {
    const key = imageKey(url);
    if (seen.has(key)) return;
    seen.add(key);
    images.push(url);
  };
  for (const url of matches) {
    if (images.length >= MAX_IMAGES) break;
    if (exactSlug && url.toLowerCase().includes(exactSlug)) push(url);
  }
  const allowedFolders = new Set(images.map(imageFolder).filter(Boolean));
  for (const url of matches) {
    if (images.length >= MAX_IMAGES) break;
    const folder = imageFolder(url);
    if (allowedFolders.size && !allowedFolders.has(folder)) continue;
    if (own(url)) push(url);
  }
  return images;
}

async function proxyHtml(url, referer = '') {
  const qs = `url=${encodeURIComponent(url)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
  const res = await fetch(`${PROXY_URL}/?${qs}`, { signal: AbortSignal.timeout(45000) });
  if (!res.ok) return '';
  return res.text();
}

async function getCandidates() {
  const out = [];
  const filterParts = ['(source ~ "epey" || sourceUrl ~ "epey.com")'];
  if (args.id) filterParts.push(`id = "${escFilter(args.id)}"`);
  if (args.category) filterParts.push(`category = "${escFilter(args.category)}"`);
  if (args.name) filterParts.push(`name ~ "${escFilter(args.name)}"`);
  const filter = encodeURIComponent(filterParts.join(' && '));
  for (let page = 1; page < 10000; page++) {
    const fields = encodeURIComponent('id,name,sourceUrl,imageUrl,images');
    const r = await req('GET', `/api/collections/products/records?page=${page}&perPage=200&sort=id&filter=${filter}&fields=${fields}`);
    if (r.status !== 200) throw new Error(`PB list failed: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    const items = r.body.items || [];
    for (const p of items) {
      const sourceUrl = normalizeEpeyProductUrl(p.sourceUrl || '');
      const current = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
      if (sourceUrl && (args.force || current.length < MAX_IMAGES)) out.push({ ...p, sourceUrl, current });
      if (LIMIT && out.length >= LIMIT) return out;
    }
    if (page >= (r.body.totalPages || 1)) break;
  }
  return out;
}

async function processProduct(p) {
  const slug = slugFromUrl(p.sourceUrl);
  const current = p.current || [];
  const byKey = new Map();
  if (!args.force) {
    for (const img of current) {
      const u = normalizeImageUrl(img);
      if (u) byKey.set(imageKey(u), u);
    }
  }

  const detailHtml = await proxyHtml(p.sourceUrl);
  for (const img of extractImages(detailHtml, slug)) {
    if (byKey.size >= MAX_IMAGES) break;
    byKey.set(imageKey(img), img);
  }
  if (byKey.size < MAX_IMAGES) {
    const g = galleryUrl(p.sourceUrl);
    if (g) {
      const galleryHtml = await proxyHtml(g, p.sourceUrl);
      for (const img of extractImages(galleryHtml, slug)) {
        if (byKey.size >= MAX_IMAGES) break;
        byKey.set(imageKey(img), img);
      }
    }
  }

  const images = [...byKey.values()].slice(0, MAX_IMAGES);
  const currentKey = current.map(imageKey).join('|');
  const nextKey = images.map(imageKey).join('|');
  if (images.length <= current.length && currentKey === nextKey) return { status: 'same', id: p.id, count: current.length };
  if (!DRY) {
    const body = { images, imageUrl: images[0] || p.imageUrl || '' };
    const r = await req('PATCH', `/api/collections/products/records/${p.id}`, body);
    if (r.status >= 300) throw new Error(`PB patch ${p.id} failed: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  }
  return { status: 'patched', id: p.id, name: p.name, before: current.length, after: images.length };
}

async function main() {
  const candidates = await getCandidates();
  console.log(`[epey-images] candidates=${candidates.length} dry=${DRY} concurrency=${CONCURRENCY}`);
  let cursor = 0, patched = 0, same = 0, failed = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const p = candidates[cursor++];
      try {
        const res = await processProduct(p);
        if (res.status === 'patched') {
          patched++;
          console.log(`  + ${res.before}->${res.after} ${res.name || res.id}`);
        } else {
          same++;
        }
      } catch (e) {
        failed++;
        console.warn(`  ! ${p.name || p.id}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker));
  console.log(`[epey-images] done patched=${patched} same=${same} failed=${failed}${DRY ? ' (dry)' : ''}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
