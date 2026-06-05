// ─────────────────────────────────────────────────────────────────────────────
//  Backfill the full Epey photo set onto already-saved products.
//
//  Old scrapes capped the gallery at 8 images even though Epey ships 20-30 on
//  the "-resimleri.html" page. Images are plain CDN URLs (resim.epey.com/…) —
//  nothing is downloaded — so we just need to store more of them.
//
//  This reads products straight from Typesense (what the website serves),
//  fetches each Epey gallery (+ main page fallback) directly, merges the new
//  photo URLs into the stored set (deduped by photo identity, reklam/junk
//  rejected, capped at 40), then writes back to BOTH PocketBase (source of
//  truth) and Typesense (what the site reads) so the change is immediate.
//
//  Usage (from repo root):
//    node scripts/backfill_epey_images.mjs --dry --limit 20      # preview
//    node scripts/backfill_epey_images.mjs --ids id1,id2         # specific
//    node scripts/backfill_epey_images.mjs --limit 50            # sample run
//    node scripts/backfill_epey_images.mjs                       # full run
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV = readEnv(path.join(__dirname, '..', 'migration', '.env'));

const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_ADMIN_KEY = ENV.TYPESENSE_API_KEY;
const PB_URL = (ENV.POCKETBASE_URL || '').replace(/\/$/, '');
const MAX_IMAGES = 40;
const MIN_TO_PROCESS = 9; // only top up products that still look capped (≤8)

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const LIMIT = numArg('--limit', Infinity);
const ONLY_IDS = strArg('--ids', '').split(',').map((s) => s.trim()).filter(Boolean);
const THROTTLE = numArg('--throttle', 150);

function readEnv(p) {
  return Object.fromEntries(
    fs.readFileSync(p, 'utf8').split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
  );
}
function numArg(flag, def) { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def; }
function strArg(flag, def) { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : def; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Epey image helpers (mirror admin/js/scraper.js) ──────────────────────────
function epeyOriginalUrl(u) { return String(u || '').replace(/(\/\d+\/)[a-z]_([^/]+)$/i, '$1$2'); }
function normalizeEpeyImageUrl(url) {
  let u = String(url || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) u = `https:${u}`;
  if (!/^https?:\/\//i.test(u)) return '';
  u = u.split(/[?#]/)[0];
  if (!/resim\.epey\.com/i.test(u)) return '';
  if (/\/(?:tema|marka|kategori|logo|site|grup)\//i.test(u)) return '';
  if (/(favicon|yildiz|profil|yukleniyor|loading|placeholder)/i.test(u)) return '';
  if (/(reklam|advert|\bads?\b|banner|kampanya|sponsor|promosyon|site-logo)/i.test(u)) return '';
  if (!/\.(?:jpe?g|png|webp|avif)$/i.test(u)) return '';
  return epeyOriginalUrl(u);
}
function epeyImageKey(u) {
  return String(u).toLowerCase().replace(/\/[a-z]_([^/]+)$/i, '/$1').replace(/\.(jpe?g|png|webp|avif)$/i, '');
}
function extractEpeyImages(html) {
  const $ = cheerio.load(html);
  const out = [];
  const seen = new Set();
  const consider = (raw) => {
    const u = normalizeEpeyImageUrl(raw);
    if (!u) return;
    const k = epeyImageKey(u);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(u);
  };
  $('img, a, source').each((_, el) => {
    for (const attr of ['src', 'data-src', 'data-lazy', 'data-original', 'data-zoom', 'data-big', 'data-full', 'data-image', 'data-url', 'href', 'srcset']) {
      const v = $(el).attr(attr);
      if (!v) continue;
      if (attr === 'srcset') { v.split(',').forEach((part) => consider(part.trim().split(/\s+/)[0])); }
      else consider(v);
    }
  });
  // og:image hero
  consider($('meta[property="og:image"]').attr('content'));
  return out;
}

function epeyGalleryUrl(productUrl) {
  const u = String(productUrl || '');
  if (!/\.html$/i.test(u)) return '';
  return u.replace(/\.html$/i, '-resimleri.html');
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
async function fetchEpey(url, referer) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer || 'https://www.epey.com/' }, signal: AbortSignal.timeout(25000) });
    if (!res.ok) return '';
    return await res.text();
  } catch { return ''; }
}
async function galleryImagesFor(sourceUrl) {
  let imgs = [];
  const gUrl = epeyGalleryUrl(sourceUrl);
  if (gUrl) {
    const html = await fetchEpey(gUrl, sourceUrl);
    if (html) imgs = extractEpeyImages(html);
  }
  // Fall back to / union with the main product page when the gallery page is
  // missing (some categories 404) or thin.
  if (imgs.length < 6) {
    const html = await fetchEpey(sourceUrl, 'https://www.epey.com/');
    if (html) {
      const seen = new Set(imgs.map(epeyImageKey));
      for (const u of extractEpeyImages(html)) { const k = epeyImageKey(u); if (!seen.has(k)) { seen.add(k); imgs.push(u); } }
    }
  }
  return imgs;
}

// ── PocketBase + Typesense IO ────────────────────────────────────────────────
let PB_TOKEN = '';
async function pbAuth() {
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: ENV.POCKETBASE_ADMIN_EMAIL, password: ENV.POCKETBASE_ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`PB auth failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  PB_TOKEN = (await res.json()).token;
}
async function pbPatchImages(id, images) {
  const res = await fetch(`${PB_URL}/api/collections/products/records/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: PB_TOKEN },
    body: JSON.stringify({ images }), signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`PB patch ${res.status}: ${(await res.text()).slice(0, 160)}`);
}
async function tsPartialUpdate(id, raw) {
  // action=update → only the provided fields change; everything else (name,
  // techScore, filterTokens, top-level imageUrl…) is preserved.
  const body = JSON.stringify({ id, _raw: JSON.stringify(raw) });
  const res = await fetch(`${TS_URL}/collections/products/documents/import?action=update`, {
    method: 'POST', headers: { 'X-TYPESENSE-API-KEY': TS_ADMIN_KEY, 'Content-Type': 'text/plain' }, body, signal: AbortSignal.timeout(20000),
  });
  const txt = await res.text();
  if (!res.ok || /"success":false/.test(txt)) throw new Error(`TS update ${res.status}: ${txt.slice(0, 160)}`);
}

// List products from Typesense, paginated per category. A single long export
// stream gets cut by the server after ~280 MB; category pagination keeps each
// request small and stays under the result-window limit (no category > ~10k),
// so the whole catalog is reachable and the run is fully resumable.
const TS_HDR = { 'X-TYPESENSE-API-KEY': TS_ADMIN_KEY };
async function* listProducts() {
  if (ONLY_IDS.length) {
    for (const id of ONLY_IDS) {
      const res = await fetch(`${TS_URL}/collections/products/documents/${encodeURIComponent(id)}`, { headers: TS_HDR });
      if (res.ok) yield await res.json();
    }
    return;
  }
  const facetRes = await fetch(`${TS_URL}/collections/products/documents/search?q=*&query_by=name&per_page=0&facet_by=category&max_facet_values=400`, { headers: TS_HDR });
  if (!facetRes.ok) throw new Error(`TS facet failed ${facetRes.status}`);
  let cats = ((await facetRes.json())?.facet_counts?.[0]?.counts || []).map((c) => c.value).filter(Boolean);
  // Process photo-rich categories first so the most visible products fill in
  // earliest (phones/tablets/laptops/cameras ship 15-30 gallery shots; PC parts
  // and accessories often only have 2-3, so they yield little and go last).
  const PRIORITY = ['smartphones', 'tablets', 'laptops', 'smartwatches', 'headphones', 'earphones', 'cameras', 'tvs', 'monitors', 'gaming_consoles', 'graphics_cards'];
  cats = cats.sort((a, b) => (PRIORITY.indexOf(a) + 1 || 99) - (PRIORITY.indexOf(b) + 1 || 99));
  console.log(`Categories: ${cats.length} → ${cats.slice(0, 6).join(', ')}…`);
  for (const cat of cats) {
    let page = 1;
    for (;;) {
      const url = `${TS_URL}/collections/products/documents/search?q=*&query_by=name&filter_by=${encodeURIComponent('category:=`' + cat + '`')}&include_fields=id,_raw&per_page=250&page=${page}`;
      let data;
      try { const res = await fetch(url, { headers: TS_HDR, signal: AbortSignal.timeout(30000) }); if (!res.ok) break; data = await res.json(); }
      catch { break; }
      const hits = data?.hits || [];
      for (const h of hits) yield h.document;
      if (hits.length < 250 || page * 250 >= 240000) break;
      page++;
    }
  }
}

const CONCURRENCY = numArg('--concurrency', 5);
const stats = { scanned: 0, updated: 0, added: 0, errors: 0, skippedNonEpey: 0 };

async function processDoc(doc) {
  let raw;
  try { raw = doc._raw ? JSON.parse(doc._raw) : doc; } catch { return; }
  const source = String(raw.source || '');
  if (!/epey/i.test(source)) { stats.skippedNonEpey++; return; }
  const sourceUrl = raw.sourceUrl || '';
  if (!sourceUrl) return;
  const existing = (Array.isArray(raw.images) ? raw.images : []).filter(Boolean)
    .map((u) => /resim\.epey\.com/i.test(u) ? (normalizeEpeyImageUrl(u) || u) : u)
    .filter((u, i, a) => a.indexOf(u) === i);
  if (!ONLY_IDS.length && existing.length >= MIN_TO_PROCESS) return;

  stats.scanned++;
  try {
    const gallery = await galleryImagesFor(sourceUrl);
    if (!gallery.length) return;
    const seen = new Set(existing.map(epeyImageKey));
    const merged = [...existing];
    for (const img of gallery) { const k = epeyImageKey(img); if (!seen.has(k)) { seen.add(k); merged.push(img); } if (merged.length >= MAX_IMAGES) break; }
    if (merged.length > existing.length) {
      stats.added += merged.length - existing.length;
      if (!DRY) {
        raw.images = merged;
        await pbPatchImages(doc.id, merged);   // PB after-update hook (now images-aware) re-syncs TS…
        await tsPartialUpdate(doc.id, raw);     // …and this guarantees the gallery lands even if it isn't.
      }
      stats.updated++;
      console.log(`  ✓ [${stats.updated}] ${raw.name?.slice(0, 44) || doc.id}: ${existing.length} → ${merged.length}`);
    }
  } catch (e) { stats.errors++; if (stats.errors % 20 === 1) console.log(`  ⚠ ${doc.id}: ${e.message}`); }
  await sleep(THROTTLE);
}

async function main() {
  if (!TS_ADMIN_KEY || !PB_URL) throw new Error('Missing TYPESENSE_API_KEY / POCKETBASE_URL in migration/.env');
  if (!DRY) await pbAuth();
  console.log(`Backfill start — ${DRY ? 'DRY RUN' : 'LIVE'} · min<${MIN_TO_PROCESS} · cap ${MAX_IMAGES} · conc ${CONCURRENCY}${ONLY_IDS.length ? ` · ids=${ONLY_IDS.length}` : ''}`);

  // Re-auth PB every ~20 min so the admin token never expires mid-run.
  const reauth = DRY ? null : setInterval(() => pbAuth().catch(() => {}), 18 * 60 * 1000);

  const pool = new Set();
  let streamed = 0;
  for await (const doc of listProducts()) {
    if (stats.updated >= LIMIT) break;
    streamed++;
    if (streamed % 1000 === 0) console.log(`  … streamed ${streamed} · scanned ${stats.scanned} · updated ${stats.updated}`);
    const task = processDoc(doc).finally(() => pool.delete(task));
    pool.add(task);
    if (pool.size >= CONCURRENCY) await Promise.race(pool);
  }
  await Promise.allSettled(pool);
  if (reauth) clearInterval(reauth);
  console.log(`\nDone — updated ${stats.updated} (+${stats.added} imgs), scanned ${stats.scanned}, errors ${stats.errors}, non-epey skipped ${stats.skippedNonEpey}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
