// ═══════════════════════════════════════════════════════════════════════════
//  Compute REAL "trending" from actual product views
// ───────────────────────────────────────────────────────────────────────────
//  Every product's `trendScore` was 0, so the home "Bugün Trend" rail was just
//  a techScore list. This turns it into a real popularity signal: it reads the
//  `recently_viewed` log (real user views, timestamped), gives each view a
//  weight that decays with age (24h half-life, so TODAY dominates), sums per
//  product, and writes that as `trendScore` to BOTH PocketBase (source of truth,
//  survives reindex) and Typesense (what the website sorts by).
//
//  Idempotent + self-decaying: each run first clears the previous trending set,
//  then writes the fresh one — old views fade out as new ones come in.
//
//  RUN:  node scripts/compute_trending.mjs --dry
//        node scripts/compute_trending.mjs
//  Schedule hourly on the host (like the FCM refresh) for a live "today" feel.
//  NOTE: recently_viewed only logs SIGNED-IN views (createRule needs auth); as
//  logins grow, the signal sharpens. Anonymous view logging is a later step.
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run');
const WINDOW_DAYS = 7;          // how far back to look
const HALF_LIFE_HOURS = 24;     // a view this old counts half — emphasises today

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
      const res = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }) });
      if (res.ok) return (await res.json()).token;
    } catch { /* next */ }
  }
  throw new Error('PB auth failed');
}

async function main() {
  const env = loadEnv();
  const PB = String(env.POCKETBASE_URL || '').replace(/\/$/, '');
  const TS = String(env.TYPESENSE_URL || env.TYPESENSE_HOST_URL || '').replace(/\/$/, '');
  const TSKEY = env.TYPESENSE_API_KEY || env.TYPESENSE_ADMIN_KEY;
  if (!PB || !TS || !TSKEY) { console.error('[trending] env missing'); process.exit(2); }
  const token = await pbAuth(PB, env.POCKETBASE_ADMIN_EMAIL, env.POCKETBASE_ADMIN_PASSWORD);
  const auth = { Authorization: token };
  const enc = encodeURIComponent;

  // 1) Pull recently_viewed within the window.
  const sinceMs = Date.now() - WINDOW_DAYS * 86400e3;
  const sinceStr = new Date(sinceMs).toISOString().replace('T', ' ');
  const views = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${PB}/api/collections/recently_viewed/records?page=${page}&perPage=500&fields=productId,viewedAt,created&filter=${enc(`created >= "${sinceStr}"`)}`, { headers: auth });
    if (!res.ok) throw new Error('PB recently_viewed read failed ' + res.status);
    const body = await res.json();
    (body.items || []).forEach((v) => views.push(v));
    if (page >= (body.totalPages || 1)) break;
  }

  // 2) Recency-weighted view score per product.
  const now = Date.now();
  const score = new Map();
  for (const v of views) {
    const pid = v.productId; if (!pid) continue;
    const t = Date.parse((v.viewedAt || v.created || '').replace(' ', 'T'));
    if (!Number.isFinite(t)) continue;
    const ageH = Math.max(0, (now - t) / 3600e3);
    const w = Math.pow(0.5, ageH / HALF_LIFE_HOURS);
    score.set(pid, (score.get(pid) || 0) + w);
  }
  const ranked = [...score.entries()].map(([id, s]) => ({ id, trendScore: Math.round(s * 1000) / 1000 })).sort((a, b) => b.trendScore - a.trendScore);
  console.log(`[trending]${DRY ? ' (DRY)' : ''} ${views.length} views (${WINDOW_DAYS}d) → ${ranked.length} products. Top:`);
  for (const r of ranked.slice(0, 8)) console.log(`  ${r.trendScore.toFixed(2)}  ${r.id}`);
  if (DRY) { console.log('[trending] dry run — no writes'); return; }

  // 3) Find the PREVIOUS trending set (trendScore>0) to clear what dropped out.
  const prevIds = new Set();
  {
    let page = 1;
    for (;;) {
      const res = await fetch(`${TS}/collections/products/documents/search?q=*&query_by=name&filter_by=${enc('trendScore:>0')}&page=${page}&per_page=250&include_fields=id`, { headers: { 'X-TYPESENSE-API-KEY': TSKEY } });
      const j = await res.json();
      (j.hits || []).forEach((h) => prevIds.add(h.document.id));
      if (page >= (j.found ? Math.ceil(j.found / 250) : 1)) break;
      page++;
    }
  }
  const newIds = new Set(ranked.map((r) => r.id));
  const resets = [...prevIds].filter((id) => !newIds.has(id)).map((id) => ({ id, trendScore: 0 }));

  // 4) Write to Typesense (bulk update) and PocketBase (persist for reindex).
  const tsLines = [...ranked, ...resets].map((r) => JSON.stringify({ id: r.id, trendScore: r.trendScore }));
  for (let i = 0; i < tsLines.length; i += 200) {
    const res = await fetch(`${TS}/collections/products/documents/import?action=update`, {
      method: 'POST', headers: { 'X-TYPESENSE-API-KEY': TSKEY, 'Content-Type': 'text/plain' },
      body: tsLines.slice(i, i + 200).join('\n'),
    });
    const txt = await res.text();
    const fails = txt.split('\n').filter((l) => l && !/"success":true/.test(l)).length;
    if (fails) console.warn('  TS import failures:', fails);
  }
  let pbOk = 0;
  for (const r of [...ranked, ...resets]) {
    try {
      const res = await fetch(`${PB}/api/collections/products/records/${r.id}`, {
        method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trendScore: r.trendScore }),
      });
      if (res.ok) pbOk++;
    } catch { /* skip */ }
  }
  console.log(`[trending] wrote ${ranked.length} trending + cleared ${resets.length} stale → TS + PB (${pbOk} PB ok)`);
}

main().catch((e) => { console.error('[trending] fatal', e); process.exit(1); });
