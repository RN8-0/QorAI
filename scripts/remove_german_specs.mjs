// ─────────────────────────────────────────────────────────────────────────────
//  Permanently delete the German ("de") SPEC views from the whole catalog.
//
//  The German spec translation was removed (2026-06-30) — most atoms were
//  mistranslated, broken or dropped. A German UI now reads specs in English
//  (handled in code: web specDisplay.js + app product_entity.dart). This script
//  removes the stored data so nothing German lingers:
//
//    • PocketBase: strip the `de` key from multiLangSpecs / multiLangSections.
//    • Typesense:  rewrite the doc's `_raw` (the embedded PB record) without it.
//
//  What is KEPT on purpose:
//    • nameTranslated.de   — product NAMES stay German.
//    • sourceSpecs / sourceSpecSections — the German SOURCE of Geizhals products
//      (needed to re-derive TR/EN; never displayed).
//
//  Usage:
//    node scripts/remove_german_specs.mjs                 # dry-run, 1 page
//    node scripts/remove_german_specs.mjs --limit 5       # dry-run, 5 pages
//    node scripts/remove_german_specs.mjs --apply         # write whole catalog
//    node scripts/remove_german_specs.mjs --apply --no-ts # PB only (TS later via reindex)
//    START_PAGE=120 node scripts/remove_german_specs.mjs --apply   # resume
//
//  Env (migration/.env): POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL,
//  POCKETBASE_ADMIN_PASSWORD, TYPESENSE_URL, TYPESENSE_API_KEY
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const APPLY = process.argv.includes('--apply');
const SKIP_TS = process.argv.includes('--no-ts');
const limitIdx = process.argv.indexOf('--limit');
const PAGE_LIMIT = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : (APPLY ? Infinity : 1);
const PAGE_SIZE = 200;
const START_PAGE = Math.max(1, Number(process.env.START_PAGE || 1));
const THROTTLE_MS = Number(process.env.THROTTLE_MS || 12); // gentle on the single host

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, 'migration', '.env'), 'utf8')
    .split(/\r?\n/).filter((l) => l && l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const PB = env.POCKETBASE_URL;
const TS = (env.TYPESENSE_URL || '').replace(/\/+$/, '');
const TS_KEY = env.TYPESENSE_API_KEY;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── PocketBase REST ──────────────────────────────────────────────────────────
let token = null;
async function pbAuth() {
  const res = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PB auth ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  token = body.token;
}
async function pbFetch(pathname, opts = {}) {
  if (!token) await pbAuth();
  let res = await fetch(`${PB}${pathname}`, { ...opts, headers: { Accept: 'application/json', Authorization: token, ...(opts.headers || {}) } });
  if (res.status === 401) { token = null; await pbAuth(); res = await fetch(`${PB}${pathname}`, { ...opts, headers: { Accept: 'application/json', Authorization: token, ...(opts.headers || {}) } }); }
  return res;
}

// ── Typesense ────────────────────────────────────────────────────────────────
async function tsPatchDoc(id, partial) {
  const res = await fetch(`${TS}/collections/products/documents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'X-TYPESENSE-API-KEY': TS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    if (res.status === 404) return { missing: true };
    throw new Error(`TS patch ${id} -> ${res.status}: ${text}`);
  }
  return res.json();
}

// `de` may legitimately appear with an empty value; treat present-key as removable.
function hasDe(obj) {
  return obj && typeof obj === 'object' && !Array.isArray(obj) && Object.prototype.hasOwnProperty.call(obj, 'de');
}
function withoutDe(obj) {
  if (!hasDe(obj)) return obj;
  const { de, ...rest } = obj;
  return rest;
}

async function main() {
  console.log(`[de-purge] mode=${APPLY ? 'APPLY (writing)' : 'DRY-RUN'}  typesense=${SKIP_TS ? 'SKIP' : 'ON'}  pageSize=${PAGE_SIZE}  startPage=${START_PAGE}  pageLimit=${PAGE_LIMIT}`);

  let page = START_PAGE, pagesDone = 0, totalPages = Infinity;
  let scanned = 0, hadDe = 0, pbWritten = 0, tsPatched = 0, tsMissing = 0, errors = 0;
  const samples = [];

  while (pagesDone < PAGE_LIMIT && page <= totalPages) {
    // Full records (no field filter) so the cleaned record can rebuild Typesense _raw.
    const res = await pbFetch(`/api/collections/products/records?perPage=${PAGE_SIZE}&page=${page}`);
    if (!res.ok) { console.error(`[de-purge] page ${page} fetch ${res.status}`); break; }
    const data = await res.json();
    totalPages = data.totalPages || 1;

    for (const rec of (data.items || [])) {
      scanned++;
      const specsHasDe = hasDe(rec.multiLangSpecs);
      const sectsHasDe = hasDe(rec.multiLangSections);
      if (!specsHasDe && !sectsHasDe) continue;
      hadDe++;

      const cleanedSpecs = withoutDe(rec.multiLangSpecs);
      const cleanedSections = withoutDe(rec.multiLangSections);
      if (samples.length < 12) samples.push({ id: rec.id, name: rec.name, specsDe: specsHasDe, sectionsDe: sectsHasDe });

      if (!APPLY) continue;

      try {
        const patch = {};
        if (specsHasDe) patch.multiLangSpecs = cleanedSpecs;
        if (sectsHasDe) patch.multiLangSections = cleanedSections;
        const w = await pbFetch(`/api/collections/products/records/${rec.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
        });
        if (!w.ok) { errors++; console.error(`[de-purge] PB PATCH ${rec.id} -> ${w.status}: ${(await w.text()).slice(0, 160)}`); continue; }
        pbWritten++;

        if (!SKIP_TS) {
          // Rebuild _raw from the locally-cleaned record (identical to PB except
          // de removed). The slightly-stale `updated` field is irrelevant to render.
          const cleanedRecord = { ...rec, multiLangSpecs: cleanedSpecs, multiLangSections: cleanedSections };
          try {
            const r = await tsPatchDoc(rec.id, { _raw: JSON.stringify(cleanedRecord) });
            if (r && r.missing) tsMissing++; else tsPatched++;
          } catch (e) {
            errors++;
            console.warn(`[de-purge] TS patch failed ${rec.id}: ${e.message}`);
          }
        }
      } catch (e) {
        errors++;
        console.error(`[de-purge] ${rec.id} failed: ${e.message}`);
      }
      if (THROTTLE_MS) await sleep(THROTTLE_MS);
    }

    pagesDone++;
    if (page % 10 === 0 || pagesDone === 1) {
      console.log(`[de-purge] page ${page}/${totalPages}  scanned=${scanned}  hadDe=${hadDe}  pbWritten=${pbWritten}  tsPatched=${tsPatched}  tsMissing=${tsMissing}  errors=${errors}`);
    }
    page++;
  }

  console.log(`\n[de-purge] DONE. scanned=${scanned} hadDe=${hadDe} pbWritten=${pbWritten} tsPatched=${tsPatched} tsMissing=${tsMissing} errors=${errors} (last page ${page - 1}/${totalPages})`);
  console.log('[de-purge] sample products with de spec maps:');
  for (const s of samples) console.log('  ', s.id, '|', s.name, '| specsDe=' + s.specsDe, 'sectionsDe=' + s.sectionsDe);
  if (!APPLY) console.log('\n[de-purge] dry-run only — re-run with --apply to write. Resume mid-run with START_PAGE=<n>.');
}

main().catch((e) => { console.error(e); process.exit(1); });
