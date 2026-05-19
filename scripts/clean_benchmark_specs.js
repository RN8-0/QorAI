/**
 * Remove volatile benchmark/rating specs from existing product records.
 *
 * These rows change over time and pollute product spec tables:
 * AnTuTu, DXOMARK, Geekbench, PassMark, 3DMark, PCMark, Cinebench, etc.
 *
 *   node scripts/clean_benchmark_specs.js        apply
 *   node scripts/clean_benchmark_specs.js --dry  preview
 */
'use strict';

const { req } = require('../migration/pb');

const DRY = process.argv.includes('--dry');
const QUIET = process.argv.includes('--quiet');
const BAD_RE = /\b(?:antutu|an\s*tu\s*tu|dxomark|dxo\s*mark|geekbench|benchmark|passmark|pcmark|3dmark|cinebench|basemark|gfxbench|ai\s*benchmark)\b/i;

const enc = encodeURIComponent;

function isBad(key, value) {
  return BAD_RE.test(`${key || ''} ${value || ''}`);
}

function cleanFlat(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { value: obj, removed: 0 };
  let removed = 0;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isBad(k, v)) { removed++; continue; }
    out[k] = v;
  }
  return { value: out, removed };
}

function cleanNested(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { value: obj, removed: 0 };
  let removed = 0;
  const out = {};
  for (const [section, values] of Object.entries(obj)) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      if (isBad(section, values)) removed++;
      else out[section] = values;
      continue;
    }
    const cleaned = cleanFlat(values);
    removed += cleaned.removed;
    if (Object.keys(cleaned.value || {}).length) out[section] = cleaned.value;
  }
  return { value: out, removed };
}

function buildPatch(p) {
  let removed = 0;
  const patch = {};
  for (const field of ['specs', 'keySpecs', 'specsEn']) {
    const cleaned = cleanFlat(p[field]);
    if (cleaned.removed) { patch[field] = cleaned.value; removed += cleaned.removed; }
  }
  for (const field of ['specSections', 'multiLangSections']) {
    const cleaned = cleanNested(p[field]);
    if (cleaned.removed) { patch[field] = cleaned.value; removed += cleaned.removed; }
  }
  if (p.multiLangSpecs && typeof p.multiLangSpecs === 'object' && !Array.isArray(p.multiLangSpecs)) {
    const ml = {};
    let changed = false;
    for (const [lang, map] of Object.entries(p.multiLangSpecs)) {
      const cleaned = cleanFlat(map);
      ml[lang] = cleaned.value;
      if (cleaned.removed) { removed += cleaned.removed; changed = true; }
    }
    if (changed) patch.multiLangSpecs = ml;
  }
  if (removed) {
    patch.specsCount = Object.keys(patch.specs || p.specs || {}).length;
  }
  return { patch, removed };
}

async function main() {
  console.log(`\n  Benchmark spec cleanup ${DRY ? '(DRY RUN)' : ''}\n`);
  let page = 1, touched = 0, removedTotal = 0, scanned = 0;
  for (;;) {
    const r = await req('GET',
      `/api/collections/products/records?perPage=100&page=${page}` +
      `&sort=id` +
      `&fields=${enc('id,name,specs,specSections,keySpecs,specsEn,multiLangSpecs,multiLangSections')}`);
    if (r.status !== 200) throw new Error(`products page ${page} failed: ${JSON.stringify(r.body).slice(0, 200)}`);
    const items = r.body.items || [];
    if (!items.length) break;
    for (const p of items) {
      scanned++;
      const { patch, removed } = buildPatch(p);
      if (!removed) continue;
      touched++;
      removedTotal += removed;
      if (!QUIET) console.log(`  • ${p.id} ${String(p.name || '').slice(0, 70)} — ${removed} removed`);
      if (!DRY) {
        const u = await req('PATCH', `/api/collections/products/records/${p.id}`, patch);
        if (u.status !== 200) console.log(`    ! patch failed ${u.status}: ${JSON.stringify(u.body).slice(0, 160)}`);
      }
    }
    if (page >= (r.body.totalPages || 1)) break;
    page++;
  }
  console.log(`\n  Done — scanned ${scanned}, touched ${touched}, removed ${removedTotal}.${DRY ? ' (dry run)' : ''}\n`);
}

main().catch(e => { console.error('  ✗', e.message); process.exit(1); });
