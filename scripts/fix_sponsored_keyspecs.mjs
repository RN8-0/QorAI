// ═══════════════════════════════════════════════════════════════
//  fix_sponsored_keyspecs.mjs — Epey sponsored-widget spec cleanup
//
//  The admin scraper's old page-wide `.cell` sweep harvested Epey's
//  SPONSORED product widgets into "Öne Çıkanlar"/keySpecs: a headphone
//  ended up with "Ekran: LED", "Çözünürlük Standardı: Ultra HD (4K)"
//  and the literal badge text "Ekran Boyutu: Sponsorlu". These junk
//  rows leaked into keySpecs, sourceKeySpecs, flat specs, the
//  Highlights/Öne Çıkanlar sections and multiLangSpecs.tr — and from
//  there into the product page hero grid AND the tech-score engine.
//
//  Repair rule (per epey product):
//    truth = union of rows in the REAL spec sections (everything except
//    Highlights / Öne Çıkanlar). A summary/highlight/flat entry survives
//    only if its key OR its value exists in truth (Epey's own top chips
//    always repeat table rows; ad rows never do). Anything mentioning
//    sponsorlu/sponsored/reklam dies unconditionally.
//
//  Usage:
//    node scripts/fix_sponsored_keyspecs.mjs [--dry] [--limit=N] [--cat=slug] [--no-ts]
// ═══════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const NO_TS = argv.includes('--no-ts');
const LIMIT = Number((argv.find(a => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const ONLY_CAT = (argv.find(a => a.startsWith('--cat=')) || '').split('=')[1] || '';

const envFile = readFileSync(path.join(ROOT, 'migration', '.env'), 'utf8');
const env = Object.fromEntries(envFile.split(/\r?\n/)
  .filter(l => l && l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const PB = env.POCKETBASE_URL;
let pbToken = '';

async function pbAuth() {
  const r = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
  });
  if (!r.ok) throw new Error(`PB auth ${r.status}`);
  pbToken = (await r.json()).token;
}

async function pbReq(method, url, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`${PB}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: pbToken },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (r.status === 401) { await pbAuth(); continue; }
      const data = await r.json().catch(() => ({}));
      return { status: r.status, body: data };
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise(res => setTimeout(res, 1200 * (attempt + 1)));
    }
  }
}

// ── normalization (mirror score_engine folding) ──
const fold = s => String(s || '')
  .replace(/İ/g, 'I').replace(/ı/g, 'i').replace(/Ş/g, 'S').replace(/ş/g, 's')
  .replace(/Ğ/g, 'G').replace(/ğ/g, 'g').replace(/Ü/g, 'U').replace(/ü/g, 'u')
  .replace(/Ö/g, 'O').replace(/ö/g, 'o').replace(/Ç/g, 'C').replace(/ç/g, 'c')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const normKey = s => fold(s).replace(/\s*:\s*$/, '').replace(/\s+/g, ' ').trim();
const normVal = s => fold(s).replace(/\s+/g, ' ').trim();
const SPONSOR_RE = /sponsorlu|sponsored/i;
const HIGHLIGHT_SEC_RE = /^(one cikanlar|highlights?)$/;

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

function truthFromSections(sections) {
  const keys = new Set(); const vals = new Set();
  if (!isObj(sections)) return { keys, vals };
  for (const [sec, rows] of Object.entries(sections)) {
    if (HIGHLIGHT_SEC_RE.test(normKey(sec))) continue;
    if (!isObj(rows)) continue;
    for (const [k, v] of Object.entries(rows)) {
      keys.add(normKey(k));
      const nv = normVal(v);
      if (nv) vals.add(nv);
      // multiline values → each line counts as a fact too
      String(v || '').split(/\r?\n/).forEach(line => { const nl = normVal(line); if (nl) vals.add(nl); });
    }
  }
  return { keys, vals };
}

// ── TR surfaces (verbatim scraper strings) — subset rule is reliable:
// an Öne Çıkanlar chip must repeat a row of the real TR spec table.
// With <3 truth keys we have no table to validate against: sponsor-only.
function cleanFlatTr(map, truth) {
  const out = {}; const removed = [];
  if (!isObj(map)) return { out: map, removed };
  for (const [k, v] of Object.entries(map)) {
    const val = String(v == null ? '' : v);
    if (SPONSOR_RE.test(k) || SPONSOR_RE.test(val)) { removed.push([k, val]); continue; }
    if (truth.keys.size >= 3) {
      const keyOk = truth.keys.has(normKey(k));
      const nv = normVal(val);
      const firstLine = normVal(val.split(/\r?\n/)[0]);
      const valOk = (nv && truth.vals.has(nv)) || (firstLine && truth.vals.has(firstLine));
      if (!keyOk && !valOk) { removed.push([k, val]); continue; }
    }
    out[k] = v;
  }
  return { out, removed };
}

// ── EN surfaces were machine-translated in INDEPENDENT passes (flat specs vs
// sections wording drifts: "Acoustic Structure" vs "Acoustic structure of…"),
// and PB re-sorts JSON keys alphabetically, so neither key-membership nor
// position can identify junk. Instead we anchor on the TR verdict: an EN row
// dies only if it carries sponsor text, or its VALUE equals a junk value the
// TR pass removed (ad values — "LED", "Ultra HD (4K)", "144 Hz" — survive MT
// verbatim) while its key is absent from the EN truth sections.
const VALUE_MT = new Map([
  ['var', 'yes'], ['yok', 'no'], ['kablosuz', 'wireless'], ['kablolu', 'wired'],
]);
function junkValSet(removedTr) {
  const s = new Set();
  for (const [, v] of removedTr) {
    for (const line of String(v || '').split(/\r?\n/)) {
      const nv = normVal(line);
      if (!nv) continue;
      s.add(nv);
      if (VALUE_MT.has(nv)) s.add(VALUE_MT.get(nv));
      s.add(nv.replace(/\binc\b/g, 'inch'));
    }
  }
  return s;
}
function cleanFlatEn(map, enTruth, junkVals) {
  const out = {}; const removed = [];
  if (!isObj(map)) return { out: map, removed };
  for (const [k, v] of Object.entries(map)) {
    const val = String(v == null ? '' : v);
    if (SPONSOR_RE.test(k) || SPONSOR_RE.test(val)) { removed.push([k, val]); continue; }
    if (junkVals.size) {
      const nv = normVal(val);
      const firstLine = normVal(val.split(/\r?\n/)[0]);
      const isJunkVal = (nv && junkVals.has(nv)) || (firstLine && junkVals.has(firstLine));
      const keyInTruth = enTruth.keys.has(normKey(k));
      if (isJunkVal && !keyInTruth) { removed.push([k, val]); continue; }
    }
    out[k] = v;
  }
  return { out, removed };
}

function cleanSections(sections, cleaner) {
  if (!isObj(sections)) return { out: sections, removed: [] };
  const out = {}; let removed = [];
  for (const [sec, rows] of Object.entries(sections)) {
    if (!isObj(rows)) { out[sec] = rows; continue; }
    if (!HIGHLIGHT_SEC_RE.test(normKey(sec))) { out[sec] = rows; continue; }
    const r = cleaner(rows);
    removed = removed.concat(r.removed);
    if (Object.keys(r.out).length) out[sec] = r.out;
  }
  return { out, removed };
}

const FIELDS = 'id,name,category,source,sourceLang,keySpecs,sourceKeySpecs,specs,sourceSpecs,specsEn,specSections,sourceSpecSections,multiLangSpecs,multiLangSections,specsCount';

async function* iterateProducts() {
  let lastId = '';
  for (;;) {
    const filters = ['source="epey.com"'];
    if (ONLY_CAT) filters.push(`category="${ONLY_CAT}"`);
    if (lastId) filters.push(`id>"${lastId}"`);
    const filter = encodeURIComponent(filters.join(' && '));
    const r = await pbReq('GET', `/api/collections/products/records?perPage=400&page=1&sort=id&skipTotal=1&fields=${FIELDS}&filter=${filter}`);
    if (r.status !== 200) throw new Error(`fetch: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    const items = r.body.items || [];
    for (const it of items) yield it;
    if (items.length < 400) return;
    lastId = items[items.length - 1].id;
  }
}

async function main() {
  console.log(`\nSponsored keySpecs repair ${DRY ? '(DRY RUN)' : ''}${ONLY_CAT ? ` [cat=${ONLY_CAT}]` : ''}\n`);
  await pbAuth();

  let scanned = 0, changed = 0, failed = 0, removedTotal = 0;
  const changedIds = [];
  const sampleLog = [];

  for await (const p of iterateProducts()) {
    scanned++;
    if (LIMIT && scanned > LIMIT) break;
    if (scanned % 5000 === 0) console.log(`  …scanned ${scanned} (changed ${changed})`);

    const trTruth = truthFromSections(p.sourceSpecSections);
    const enTruth = truthFromSections(p.specSections);

    const patch = {};
    let removed = [];
    const apply = (field, res) => {
      if (res.removed.length) { patch[field] = res.out; removed = removed.concat(res.removed); }
    };

    // Pass A — TR surfaces first; their removals define the junk value set
    // that anchors the EN cleanup.
    const trRemoved = [];
    const applyTr = (field, res) => { apply(field, res); trRemoved.push(...res.removed); };
    applyTr('sourceKeySpecs', cleanFlatTr(p.sourceKeySpecs, trTruth));
    applyTr('sourceSpecs', cleanFlatTr(p.sourceSpecs, trTruth));
    applyTr('sourceSpecSections', cleanSections(p.sourceSpecSections, rows => cleanFlatTr(rows, trTruth)));
    if (isObj(p.multiLangSpecs) && isObj(p.multiLangSpecs.tr)) {
      const r = cleanFlatTr(p.multiLangSpecs.tr, trTruth);
      if (r.removed.length) {
        patch.multiLangSpecs = { ...p.multiLangSpecs, tr: r.out };
        removed = removed.concat(r.removed);
        trRemoved.push(...r.removed);
      }
    }
    if (isObj(p.multiLangSections) && isObj(p.multiLangSections.tr)) {
      const r = cleanSections(p.multiLangSections.tr, rows => cleanFlatTr(rows, trTruth));
      if (r.removed.length) {
        patch.multiLangSections = { ...p.multiLangSections, tr: r.out };
        removed = removed.concat(r.removed);
        trRemoved.push(...r.removed);
      }
    }

    // Pass B — EN surfaces, anchored on the TR junk values.
    const junkVals = junkValSet(trRemoved);
    apply('keySpecs', cleanFlatEn(p.keySpecs, enTruth, junkVals));
    apply('specs', cleanFlatEn(p.specs, enTruth, junkVals));
    apply('specsEn', cleanFlatEn(p.specsEn, enTruth, junkVals));
    apply('specSections', cleanSections(p.specSections, rows => cleanFlatEn(rows, enTruth, junkVals)));

    if (!Object.keys(patch).length) continue;
    if (patch.specs) patch.specsCount = Object.keys(patch.specs).length;

    changed++;
    removedTotal += removed.length;
    if (sampleLog.length < 15) {
      sampleLog.push(`  • [${p.category}] ${p.name}: -${removed.length} → ${removed.slice(0, 4).map(([k, v]) => `${k}=${String(v).slice(0, 24)}`).join(' | ')}`);
    }

    if (!DRY) {
      const r = await pbReq('PATCH', `/api/collections/products/records/${p.id}`, patch);
      if (r.status === 200) changedIds.push(p.id);
      else { failed++; if (failed <= 8) console.log(`  ! PATCH ${p.id}: ${r.status} ${JSON.stringify(r.body).slice(0, 150)}`); }
    } else {
      changedIds.push(p.id);
    }
  }

  console.log(`\nScanned ${scanned} epey products → ${changed} cleaned (${removedTotal} junk rows)${failed ? `, ${failed} PATCH failures` : ''}`);
  sampleLog.forEach(l => console.log(l));

  const idsFile = path.join(ROOT, 'scripts', '.sponsored_repair_ids.json');
  writeFileSync(idsFile, JSON.stringify(changedIds, null, 0));
  console.log(`\nChanged ids saved: ${idsFile} (${changedIds.length})`);

  if (DRY || NO_TS || !changedIds.length) { console.log(DRY ? 'Dry run — no writes.' : 'TS sync skipped.'); return; }

  console.log('\nTypesense re-upsert (batches of 150)…');
  for (let i = 0; i < changedIds.length; i += 150) {
    const batch = changedIds.slice(i, i + 150);
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'ts_fast_upsert_products.js')], {
        env: { ...process.env, TS_FAST_IDS: batch.join(',') },
        stdio: ['ignore', 'inherit', 'inherit'],
        cwd: ROOT,
      });
    } catch (e) {
      console.log(`  ! TS batch ${i / 150 + 1} failed: ${e.message}`);
    }
  }
  console.log('\nDone.');
}

main().catch(e => { console.error('✗', e); process.exit(1); });
