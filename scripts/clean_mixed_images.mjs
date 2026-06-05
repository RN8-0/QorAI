// ─────────────────────────────────────────────────────────────────────────────
//  Remove cross-product images that leaked into a product's gallery.
//
//  backfill_epey_images.mjs grabbed EVERY resim.epey.com image on the Epey page
//  — including the "related / popular products" widgets — so some products ended
//  up with other products' photos (e.g. Samsung tablets inside an iPad gallery).
//
//  Epey names every photo after the product slug:
//      resim.epey.com/<folder>/m_apple-ipad-pro-11-m5-wi-fi-3.jpg
//  so the real photos all share the product's slug. This drops every Epey image
//  whose filename does not match the product's own slug (derived from sourceUrl,
//  falling back to the hero imageUrl). Non-Epey images are left untouched.
//
//  Fast — it only re-filters what's already stored (no Epey re-fetch) and writes
//  PocketBase + Typesense. Idempotent and resumable.
//
//  Usage:  node scripts/clean_mixed_images.mjs --dry            # preview
//          node scripts/clean_mixed_images.mjs --ids id1,id2    # specific
//          node scripts/clean_mixed_images.mjs                  # full run
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', 'migration', '.env'), 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const K = ENV.TYPESENSE_API_KEY;
const HDR = { 'X-TYPESENSE-API-KEY': K };
const PB_URL = (ENV.POCKETBASE_URL || '').replace(/\/$/, '');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const ONLY_IDS = (() => { const i = args.indexOf('--ids'); return i >= 0 ? args[i + 1].split(',').map((s) => s.trim()).filter(Boolean) : []; })();
const CONC = (() => { const i = args.indexOf('--concurrency'); return i >= 0 ? Number(args[i + 1]) : 8; })();

// ── slug helpers ─────────────────────────────────────────────────────────────
// Strip the tier prefix + extension and a trailing "-<n>" / "-buyuk" so every
// photo of one product collapses to the same slug base.
function imgSlug(url) {
  const m = String(url || '').match(/resim\.epey\.com\/\d+\/(?:[a-z]_)?(.+?)\.(?:jpe?g|png|webp|avif)$/i);
  if (!m) return '';
  return m[1].toLowerCase().replace(/-(?:\d+|buyuk|big|on|arka|yan|alt|ust)$/i, '');
}
function productSlug(raw) {
  const su = String(raw.sourceUrl || '');
  const m = su.match(/\/([^/]+?)(?:-resimleri)?\.html$/i);
  if (m && m[1]) return m[1].toLowerCase().replace(/-(?:\d+)$/i, '');
  return imgSlug(raw.imageUrl || raw.imageURL || '');
}
function sharePrefix(a, b) {
  if (!a || !b) return false;
  // Treat as the same product when one slug is a prefix of the other (handles
  // colour variants like "...-wi-fi-uzay-grisi"). Require a meaningful overlap.
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return short.length >= 5 && long.startsWith(short);
}
function isEpey(u) { return /resim\.epey\.com/i.test(String(u || '')); }

function cleanImages(raw) {
  const slug = productSlug(raw);
  const imgs = (Array.isArray(raw.images) ? raw.images : []).filter(Boolean);
  if (!slug) return imgs; // can't tell → leave alone
  const kept = imgs.filter((u) => (isEpey(u) ? sharePrefix(imgSlug(u), slug) : true));
  // Safety net: never strip a product down to nothing — if the filter killed
  // everything (bad slug), keep the original hero image at least.
  if (kept.length === 0) {
    const hero = raw.imageUrl || raw.imageURL;
    return hero ? [hero] : imgs;
  }
  return kept;
}

// ── IO ───────────────────────────────────────────────────────────────────────
let PB_TOKEN = '';
async function pbAuth() {
  const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: ENV.POCKETBASE_ADMIN_EMAIL, password: ENV.POCKETBASE_ADMIN_PASSWORD }),
  });
  if (!r.ok) throw new Error(`PB auth ${r.status}`);
  PB_TOKEN = (await r.json()).token;
}
async function pbPatch(id, images) {
  const r = await fetch(`${PB_URL}/api/collections/products/records/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: PB_TOKEN },
    body: JSON.stringify({ images }), signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`PB patch ${r.status}`);
}
async function tsUpdate(id, raw) {
  const r = await fetch(`${TS_URL}/collections/products/documents/import?action=update`, {
    method: 'POST', headers: { ...HDR, 'Content-Type': 'text/plain' },
    body: JSON.stringify({ id, imageUrl: raw.imageUrl || (raw.images || [])[0] || '', _raw: JSON.stringify(raw) }),
    signal: AbortSignal.timeout(20000),
  });
  const t = await r.text();
  if (!r.ok || /"success":false/.test(t)) throw new Error(`TS ${r.status}: ${t.slice(0, 120)}`);
}
async function* listProducts() {
  if (ONLY_IDS.length) {
    for (const id of ONLY_IDS) { const r = await fetch(`${TS_URL}/collections/products/documents/${id}`, { headers: HDR }); if (r.ok) yield await r.json(); }
    return;
  }
  const fr = await fetch(`${TS_URL}/collections/products/documents/search?q=*&query_by=name&per_page=0&facet_by=category&max_facet_values=400`, { headers: HDR });
  const cats = ((await fr.json())?.facet_counts?.[0]?.counts || []).map((c) => c.value).filter(Boolean);
  console.log(`Categories: ${cats.length}`);
  for (const cat of cats) {
    let page = 1;
    for (;;) {
      const url = `${TS_URL}/collections/products/documents/search?q=*&query_by=name&filter_by=${encodeURIComponent('category:=`' + cat + '`')}&include_fields=id,_raw&per_page=250&page=${page}`;
      let data; try { const r = await fetch(url, { headers: HDR, signal: AbortSignal.timeout(30000) }); if (!r.ok) break; data = await r.json(); } catch { break; }
      const hits = data?.hits || [];
      for (const h of hits) yield h.document;
      if (hits.length < 250 || page * 250 >= 240000) break;
      page++;
    }
  }
}

const stats = { scanned: 0, cleaned: 0, removed: 0, errors: 0 };
async function proc(doc) {
  let raw; try { raw = JSON.parse(doc._raw || '{}'); } catch { return; }
  if (!/epey/i.test(String(raw.source || ''))) return;
  stats.scanned++;
  const before = (Array.isArray(raw.images) ? raw.images : []).filter(Boolean);
  const after = cleanImages(raw);
  if (after.length === before.length && after.every((u, i) => u === before[i])) return;
  stats.removed += before.length - after.length;
  try {
    if (!DRY) {
      raw.images = after;
      raw.imageUrl = raw.imageUrl || after[0] || '';
      await pbPatch(doc.id, after);
      await tsUpdate(doc.id, raw);
    }
    stats.cleaned++;
    if (DRY || ONLY_IDS.length || stats.cleaned % 200 === 0) {
      console.log(`  ✓ ${raw.name?.slice(0, 44) || doc.id}: ${before.length} → ${after.length}`);
    }
  } catch (e) { stats.errors++; if (stats.errors % 50 === 1) console.log(`  ⚠ ${doc.id}: ${e.message}`); }
}

async function main() {
  if (!K || !PB_URL) throw new Error('Missing creds');
  if (!DRY) await pbAuth();
  const reauth = DRY ? null : setInterval(() => pbAuth().catch(() => {}), 18 * 60 * 1000);
  console.log(`Clean mixed images — ${DRY ? 'DRY' : 'LIVE'} · conc ${CONC}${ONLY_IDS.length ? ` · ids=${ONLY_IDS.length}` : ''}`);
  const pool = new Set();
  for await (const doc of listProducts()) {
    const task = proc(doc).finally(() => pool.delete(task));
    pool.add(task);
    if (pool.size >= CONC) await Promise.race(pool);
  }
  await Promise.allSettled(pool);
  if (reauth) clearInterval(reauth);
  console.log(`\nDone — cleaned ${stats.cleaned} products (removed ${stats.removed} stray images), scanned ${stats.scanned}, errors ${stats.errors}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
