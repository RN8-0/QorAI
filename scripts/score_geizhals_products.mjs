// Score the (techScore-less) Geizhals products with the SAME engine + category
// context the admin score runner uses: load the whole smartphones category,
// run ScoreEngine.scoreCategory, write techScore for Geizhals rows to PB and
// patch the Typesense docs (techScore + _raw).
//
//   node scripts/score_geizhals_products.mjs            # dry-run
//   node scripts/score_geizhals_products.mjs --apply
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ScoreEngine = require(path.join(ROOT, 'admin', 'js', 'scoring', 'score_engine.js'));
const APPLY = process.argv.includes('--apply');

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, 'migration', '.env'), 'utf8')
    .split(/\r?\n/).filter((l) => l && l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const PB = env.POCKETBASE_URL;
const TS = env.TYPESENSE_URL.replace(/\/+$/, '');

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
  if (!res.ok) throw new Error(`PB ${pathname} -> ${res.status}: ${(await res.text()).slice(0, 180)}`);
  return res.json();
}

const fields = 'id,slug,name,brand,category,source,specs,keySpecs,specSections,techScore,scrapedAt,created';
const all = [];
let page = 1;
for (;;) {
  const data = await pb(`/api/collections/products/records?perPage=200&page=${page}&filter=${encodeURIComponent(`category='smartphones'`)}&fields=${encodeURIComponent(fields)}`);
  all.push(...(data.items || []));
  if (page >= (data.totalPages || 1)) break;
  page++;
  if (page % 8 === 0) console.log(`  loading… ${all.length}`);
}
console.log(`[score] smartphones loaded: ${all.length}`);

const rows = ScoreEngine.scoreCategory(all);
const byId = new Map(rows.map((r) => [r.id, r]));
const targets = all.filter((p) => /geizhals/i.test(p.source || '') && !(Number(p.techScore) > 0));
console.log(`[score] geizhals targets without score: ${targets.length}`);

let written = 0;
for (const p of targets) {
  const row = byId.get(p.id);
  const score = row ? Math.round(Number(row.score) || 0) : 0;
  if (!(score >= 10 && score <= 100)) {
    console.log(`  ⚠ ${p.slug}: engine score invalid (${row ? row.score : 'no row'})`);
    continue;
  }
  console.log(`  ${p.slug} → ${score}`);
  if (APPLY) {
    await pb(`/api/collections/products/records/${p.id}`, { method: 'PATCH', body: JSON.stringify({ techScore: score }) });
    const fresh = await pb(`/api/collections/products/records/${p.id}`);
    await fetch(`${TS}/collections/products/documents/${encodeURIComponent(p.id)}`, {
      method: 'PATCH',
      headers: { 'X-TYPESENSE-API-KEY': env.TYPESENSE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ techScore: score, _raw: JSON.stringify(fresh) }),
    }).catch((e) => console.warn(`  ⚠ TS ${p.slug}: ${e.message}`));
    written++;
  }
}
console.log(`[score] DONE. written=${written} mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
