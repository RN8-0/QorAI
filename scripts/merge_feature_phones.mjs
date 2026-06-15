// ═══════════════════════════════════════════════════════════════════════════
//  One-time migration: merge `feature_phones` → `smartphones`
// ───────────────────────────────────────────────────────────────────────────
//  Feature phones are being collapsed into a single phone category everywhere
//  (web menu, app menu, scraper taxonomy). This re-tags the existing product
//  records so they live under `smartphones` in BOTH sources of truth:
//    1. PocketBase `products.category`  (canonical store)
//    2. Typesense `products` index      (what the website actually reads)
//
//  The PB hooks that would normally mirror PB→Typesense are not live here, so we
//  update both explicitly. Safe + idempotent: re-running finds 0 to move.
//  Dependency-free (PB + Typesense REST via fetch) so it runs from anywhere.
//
//  RUN:  node scripts/merge_feature_phones.mjs --dry   (preview, no writes)
//        node scripts/merge_feature_phones.mjs         (apply)
//  ENV (migration/.env): POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL/PASSWORD,
//        TYPESENSE_URL (or TYPESENSE_HOST_URL), TYPESENSE_API_KEY (admin/master).
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

const FROM = 'feature_phones';
const TO = 'smartphones';
const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run');

function loadEnv() {
  const env = { ...process.env };
  for (const p of [path.resolve(process.cwd(), 'migration/.env'), path.resolve(process.cwd(), '../migration/.env')]) {
    try {
      if (!fs.existsSync(p)) continue;
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const i = line.indexOf('='); if (i < 0) continue;
        const k = line.slice(0, i).trim(); if (!(k in env)) env[k] = line.slice(i + 1).trim();
      }
    } catch { /* ignore */ }
  }
  return env;
}

async function pbAuth(base, email, password) {
  for (const p of ['/api/collections/_superusers/auth-with-password', '/api/admins/auth-with-password']) {
    try {
      const res = await fetch(base + p, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: email, password }),
      });
      if (res.ok) return (await res.json()).token;
    } catch { /* try next */ }
  }
  throw new Error('PB superuser auth failed');
}

async function main() {
  const env = loadEnv();
  const PB = String(env.POCKETBASE_URL || '').replace(/\/$/, '');
  const TS = String(env.TYPESENSE_URL || env.TYPESENSE_HOST_URL || '').replace(/\/$/, '');
  const TSKEY = env.TYPESENSE_API_KEY || env.TYPESENSE_ADMIN_KEY;
  if (!PB) { console.error('[merge] POCKETBASE_URL missing'); process.exit(2); }
  if (!TS || !TSKEY) { console.error('[merge] Typesense URL/key missing'); process.exit(2); }

  const token = await pbAuth(PB, env.POCKETBASE_ADMIN_EMAIL, env.POCKETBASE_ADMIN_PASSWORD);
  const auth = { Authorization: token };
  const enc = encodeURIComponent;
  const filt = `category="${FROM}"`;

  // Collect all feature_phones product ids (paged).
  const ids = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${PB}/api/collections/products/records?page=${page}&perPage=200&fields=id&filter=${enc(filt)}`, { headers: auth });
    if (!res.ok) throw new Error('PB list failed ' + res.status);
    const body = await res.json();
    (body.items || []).forEach((p) => ids.push(p.id));
    if (page >= (body.totalPages || 1)) break;
  }
  console.log(`[merge]${DRY ? ' (DRY)' : ''} ${FROM} → ${TO}: ${ids.length} product(s) to move`);
  if (DRY) { console.log('[merge] dry run — no writes'); return; }

  let pbOk = 0, pbErr = 0, tsOk = 0, tsErr = 0;
  for (const id of ids) {
    try {
      const r = await fetch(`${PB}/api/collections/products/records/${id}`, {
        method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: TO }),
      });
      if (r.ok) pbOk++; else { pbErr++; console.warn('  PB patch', id, r.status); }
    } catch (e) { pbErr++; console.warn('  PB patch error', id, e?.message); }
    try {
      const r = await fetch(`${TS}/collections/products/documents/${enc(id)}`, {
        method: 'PATCH', headers: { 'X-TYPESENSE-API-KEY': TSKEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: TO }),
      });
      if (r.ok) tsOk++; else { tsErr++; console.warn('  TS patch', id, r.status, (await r.text()).slice(0, 100)); }
    } catch (e) { tsErr++; console.warn('  TS patch error', id, e?.message); }
  }
  console.log(`[merge] PB updated ${pbOk}/${ids.length} (err ${pbErr}); TS updated ${tsOk}/${ids.length} (err ${tsErr})`);

  const left = await fetch(`${PB}/api/collections/products/records?perPage=1&fields=id&filter=${enc(filt)}`, { headers: auth });
  if (left.ok) console.log(`[merge] remaining PB ${FROM}: ${(await left.json()).totalItems}`);
}

main().catch((e) => { console.error('[merge] fatal', e); process.exit(1); });
