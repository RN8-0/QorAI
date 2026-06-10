// ─────────────────────────────────────────────────────────────────────────────
//  Backfill Geizhals product galleries.
//
//  A product's OWN gallery images appear on its page as -n tier
//  (gzhls.at/pix/<a>/<b>/<hash>-n.webp); related-product carousels only use
//  -t/-m. Verified against PB: the Z Flip7 FE page lists exactly the 7 hashes
//  stored as its gallery. We fetch each product page (plain HTTPS — no
//  Cloudflare challenge for page GETs as of 2026-06), extract the -n set in
//  page order, store as -l tier (catalog standard), and patch PB + Typesense.
//
//  Usage:
//    node scripts/backfill_geizhals_images.mjs           # dry-run
//    node scripts/backfill_geizhals_images.mjs --apply
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const MAX_IMAGES = 12;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, 'migration', '.env'), 'utf8')
    .split(/\r?\n/).filter((l) => l && l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const PB = env.POCKETBASE_URL;
const TS = (env.TYPESENSE_URL || '').replace(/\/+$/, '');
const TS_KEY = env.TYPESENSE_API_KEY;

let token = null;
async function pbAuth() {
  const res = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
  });
  token = (await res.json()).token;
}
async function pb(pathname, opts = {}) {
  if (!token) await pbAuth();
  const res = await fetch(`${PB}${pathname}`, { ...opts, headers: { Authorization: token, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`PB ${pathname} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hashOf = (u) => (String(u).match(/pix\/([a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]+)-[a-z]\.webp/) || [])[1] || '';

async function galleryFromPage(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'de-DE,de;q=0.9' }, signal: ac.signal });
    if (!res.ok) return { error: `http ${res.status}` };
    const html = await res.text();
    if (/Just a moment|challenge-platform/i.test(html)) return { error: 'cloudflare' };
    const seen = new Set();
    const gallery = [];
    for (const m of html.matchAll(/https:\/\/gzhls\.at\/pix\/([a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]+)-n\.webp/g)) {
      if (!seen.has(m[1])) { seen.add(m[1]); gallery.push(`https://gzhls.at/pix/${m[1]}-l.webp`); }
    }
    return { gallery };
  } catch (e) {
    return { error: e.message };
  } finally {
    clearTimeout(t);
  }
}

const items = [];
let page = 1;
for (;;) {
  const data = await pb(`/api/collections/products/records?perPage=200&page=${page}&filter=${encodeURIComponent(`source~'geizhals'`)}&fields=${encodeURIComponent('id,slug,sourceUrl,images,imageUrl')}`);
  items.push(...(data.items || []));
  if (page >= (data.totalPages || 1)) break;
  page++;
}
console.log(`[backfill-img] products: ${items.length} · mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

let updated = 0, unchanged = 0, failed = 0;
for (const p of items) {
  if (!p.sourceUrl) { unchanged++; continue; }
  const r = await galleryFromPage(p.sourceUrl);
  await sleep(1200);
  if (r.error || !r.gallery || !r.gallery.length) {
    failed++;
    console.log(`  ⚠ ${p.slug}: ${r.error || 'no gallery found'}`);
    continue;
  }
  const stored = Array.isArray(p.images) ? p.images : [];
  const storedHashes = new Set(stored.map(hashOf).filter(Boolean));
  const pageHashes = r.gallery.map(hashOf);
  const fresh = r.gallery.filter((u) => !storedHashes.has(hashOf(u)));
  if (!fresh.length) { unchanged++; continue; }
  // Page order, primary (existing imageUrl) stays first if it is in the set.
  const merged = [];
  const mseen = new Set();
  for (const u of [...stored, ...r.gallery]) {
    const h = hashOf(u) || u.toLowerCase();
    if (mseen.has(h)) continue;
    mseen.add(h);
    merged.push(u);
    if (merged.length >= MAX_IMAGES) break;
  }
  console.log(`  + ${p.slug}: ${stored.length} → ${merged.length} images (page gallery ${pageHashes.length})`);
  if (APPLY) {
    const patch = { images: merged, imageUrl: merged[0] || p.imageUrl };
    await pb(`/api/collections/products/records/${p.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    const freshRec = await pb(`/api/collections/products/records/${p.id}`);
    try {
      await fetch(`${TS}/collections/products/documents/${encodeURIComponent(p.id)}`, {
        method: 'PATCH',
        headers: { 'X-TYPESENSE-API-KEY': TS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: freshRec.imageUrl || '', _raw: JSON.stringify(freshRec) }),
      });
    } catch (e) { console.warn(`  ⚠ TS patch failed ${p.slug}: ${e.message}`); }
    updated++;
  } else {
    updated++;
  }
}
console.log(`\n[backfill-img] DONE. wouldUpdate/updated=${updated} unchanged=${unchanged} failed=${failed}`);
