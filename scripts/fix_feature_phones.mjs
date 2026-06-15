// ═══════════════════════════════════════════════════════════════════════════
//  Fix merged feature phones inside the `smartphones` category
// ───────────────────────────────────────────────────────────────────────────
//  After feature_phones was merged into smartphones, the old feature phones:
//    • kept an inflated techScore (they were scored top-of-class among feature
//      phones, e.g. 100) and now sit above real flagships, and
//    • carry no smart/feature marker, so they can't be filtered apart.
//
//  This finds them (their Typesense _raw still says category:"feature_phones"),
//  and for each:
//    • lowers techScore (scaled down, capped low) so basic phones rank LAST,
//    • adds the `phone_type:feature` filter token (real smartphones get
//      `phone_type:smart`) so the catalog can offer a Smart/Feature toggle,
//    • repairs the stale _raw (category → smartphones, records phoneType).
//  Real smartphones (everything else in the category) get `phone_type:smart`.
//
//  Updates BOTH Typesense (what the website reads) and PocketBase techScore.
//  RUN:  node scripts/fix_feature_phones.mjs --dry
//        node scripts/fix_feature_phones.mjs
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

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
      const res = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }) });
      if (res.ok) return (await res.json()).token;
    } catch { /* next */ }
  }
  throw new Error('PB auth failed');
}

// Lower a feature phone's score: scale down hard and cap into the low tier,
// preserving relative order among feature phones.
function downscore(old) {
  const n = Number(old) || 0;
  return Math.max(5, Math.min(40, Math.round(n * 0.35)));
}

async function main() {
  const env = loadEnv();
  const PB = String(env.POCKETBASE_URL || '').replace(/\/$/, '');
  const TS = String(env.TYPESENSE_URL || env.TYPESENSE_HOST_URL || '').replace(/\/$/, '');
  const TSKEY = env.TYPESENSE_API_KEY || env.TYPESENSE_ADMIN_KEY;
  if (!PB || !TS || !TSKEY) { console.error('[fix-fp] env missing'); process.exit(2); }
  const token = await pbAuth(PB, env.POCKETBASE_ADMIN_EMAIL, env.POCKETBASE_ADMIN_PASSWORD);

  // Scan smartphones, separate feature (stale _raw.category) from smart.
  const feature = []; // {id, techScore, filterTokens, raw}
  const smartIds = [];
  let page = 1;
  for (;;) {
    const params = new URLSearchParams({ q: '*', query_by: 'name', filter_by: 'category:=`smartphones`', sort_by: 'techScore:desc', page: String(page), per_page: '250', include_fields: 'id,techScore,filterTokens,_raw' });
    const res = await fetch(`${TS}/collections/products/documents/search?${params}`, { headers: { 'X-TYPESENSE-API-KEY': TSKEY } });
    const j = await res.json();
    const hits = j.hits || [];
    if (!hits.length) break;
    for (const h of hits) {
      const d = h.document || {};
      let rawCat = '';
      try { rawCat = (JSON.parse(d._raw || '{}').category || '').toLowerCase(); } catch { /* ignore */ }
      if (rawCat === 'feature_phones') feature.push({ id: d.id, techScore: d.techScore, filterTokens: Array.isArray(d.filterTokens) ? d.filterTokens : [], raw: d._raw });
      else smartIds.push(d.id);
    }
    if (page >= (j.found ? Math.ceil(j.found / 250) : 1)) break;
    page++;
  }
  console.log(`[fix-fp]${DRY ? ' (DRY)' : ''} feature phones: ${feature.length}, smart phones: ${smartIds.length}`);
  console.log('  sample feature scores →', feature.slice(0, 5).map((f) => `${f.techScore}->${downscore(f.techScore)}`).join(', '));
  if (DRY) { console.log('[fix-fp] dry run — no writes'); return; }

  // ── Typesense bulk update (action=update merges given fields) ──
  const tsImport = async (lines) => {
    if (!lines.length) return;
    const res = await fetch(`${TS}/collections/products/documents/import?action=update`, {
      method: 'POST', headers: { 'X-TYPESENSE-API-KEY': TSKEY, 'Content-Type': 'text/plain' },
      body: lines.join('\n'),
    });
    const txt = await res.text();
    const fails = txt.split('\n').filter((l) => l && !/"success":true/.test(l)).length;
    if (fails) console.warn('  TS import failures in batch:', fails, txt.split('\n').find((l) => l && !/"success":true/.test(l))?.slice(0, 140));
  };

  // Feature phones: rescore + tag + repair _raw.
  const featDocs = feature.map((f) => {
    const tokens = [...new Set([...f.filterTokens.filter((t) => !String(t).startsWith('phone_type:')), 'phone_type:feature'])];
    let raw = {};
    try { raw = JSON.parse(f.raw || '{}'); } catch { /* ignore */ }
    raw.category = 'smartphones';
    raw.phoneType = 'feature';
    raw.techScore = downscore(f.techScore);
    return JSON.stringify({ id: f.id, techScore: downscore(f.techScore), filterTokens: tokens, _raw: JSON.stringify(raw) });
  });
  for (let i = 0; i < featDocs.length; i += 100) await tsImport(featDocs.slice(i, i + 100));
  console.log(`[fix-fp] TS: rescored + tagged ${featDocs.length} feature phones`);

  // Smart phones: ensure phone_type:smart token (fetch current tokens in pages).
  let smartTagged = 0;
  for (let i = 0; i < smartIds.length; i += 100) {
    const batch = smartIds.slice(i, i + 100);
    const params = new URLSearchParams({ q: '*', query_by: 'name', filter_by: `id:[${batch.join(',')}]`, per_page: '100', include_fields: 'id,filterTokens' });
    const res = await fetch(`${TS}/collections/products/documents/search?${params}`, { headers: { 'X-TYPESENSE-API-KEY': TSKEY } });
    const j = await res.json();
    const lines = (j.hits || []).map((h) => {
      const d = h.document; const cur = Array.isArray(d.filterTokens) ? d.filterTokens : [];
      if (cur.includes('phone_type:smart')) return null;
      const tokens = [...new Set([...cur.filter((t) => !String(t).startsWith('phone_type:')), 'phone_type:smart'])];
      return JSON.stringify({ id: d.id, filterTokens: tokens });
    }).filter(Boolean);
    await tsImport(lines);
    smartTagged += lines.length;
  }
  console.log(`[fix-fp] TS: tagged ${smartTagged} smart phones (phone_type:smart)`);

  // PocketBase: lower techScore on the feature phones (source of truth for app).
  let pbOk = 0;
  for (const f of feature) {
    try {
      const r = await fetch(`${PB}/api/collections/products/records/${f.id}`, {
        method: 'PATCH', headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ techScore: downscore(f.techScore) }),
      });
      if (r.ok) pbOk++;
    } catch { /* skip */ }
  }
  console.log(`[fix-fp] PB: techScore lowered on ${pbOk}/${feature.length} feature phones`);
}

main().catch((e) => { console.error('[fix-fp] fatal', e); process.exit(1); });
