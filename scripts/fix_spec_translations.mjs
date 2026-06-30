// Fix machine-translation hallucinations in the PocketBase catalog so the
// admin panel, the website and the Flutter app all read clean specs.
//
// The Flutter app already repairs these at display time via
// lib/core/spec_corrections.dart — this script applies the SAME corrections to
// the stored data (multiLangSections / multiLangSpecs / nameTranslated). To
// avoid drift, the section / name / value glossaries are PARSED from that Dart
// file at runtime: it stays the single source of truth.
//
// Usage:
//   node scripts/fix_spec_translations.mjs              # dry-run, first 1 page
//   node scripts/fix_spec_translations.mjs --apply      # write, whole catalog
//   node scripts/fix_spec_translations.mjs --limit 3    # dry-run, 3 pages
//   FIX_START_PAGE=120 node scripts/fix_spec_translations.mjs --apply  # resume
//
// Env (migration/.env): POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const APPLY = process.argv.includes('--apply');
const limitIdx = process.argv.indexOf('--limit');
const PAGE_LIMIT = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : (APPLY ? Infinity : 1);
const PAGE_SIZE = 200;
const START_PAGE = Math.max(1, Number(process.env.FIX_START_PAGE || 1));
const LANGS = ['en']; // German spec translation removed (2026-06-30) — never write 'de'

// ── Load PocketBase credentials ──────────────────────────────────────────────
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, 'migration', '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const PB = env.POCKETBASE_URL;

// ── Parse the corrections glossaries from the Dart source ────────────────────
function parseDartGlossaries() {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'core', 'spec_corrections.dart'), 'utf8');

  function block(name) {
    const start = src.indexOf(name);
    if (start < 0) throw new Error(`glossary ${name} not found`);
    const open = src.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
    }
    throw new Error(`unterminated block ${name}`);
  }

  // Entries shaped:  'key': {'en': 'x', 'de': 'y'},
  function parseLangMap(text) {
    const out = {};
    const entry = /'((?:[^'\\]|\\.)*)'\s*:\s*\{([^}]*)\}/g;
    let m;
    while ((m = entry.exec(text))) {
      const key = m[1];
      const inner = {};
      const kv = /'(en|de)'\s*:\s*'((?:[^'\\]|\\.)*)'/g;
      let im;
      while ((im = kv.exec(m[2]))) inner[im[1]] = im[2].replace(/\\'/g, "'");
      out[key] = inner;
    }
    return out;
  }

  // Entries shaped:  'key': 'value',
  function parseFlatMap(text) {
    const out = {};
    const entry = /'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g;
    let m;
    while ((m = entry.exec(text))) out[m[1]] = m[2].replace(/\\'/g, "'");
    return out;
  }

  return {
    sections: parseLangMap(block('_sectionGlossary')),
    nameSuffix: parseLangMap(block('_nameSuffixGlossary')),
    valueExact: parseFlatMap(block('_valueExact')),
  };
}

const GLOSS = parseDartGlossaries();
const _dbg = [];

// ── Correction primitives (mirror spec_corrections.dart) ─────────────────────
const TR_MAP = { ı: 'i', İ: 'i', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ş: 's', Ş: 's', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c' };
function foldTr(s) {
  let t = String(s).trim();
  for (const k in TR_MAP) t = t.split(k).join(TR_MAP[k]);
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function correctedSectionHeader(turkishSource, lang) {
  const e = GLOSS.sections[foldTr(turkishSource)];
  if (!e) return null;
  return e[lang] || e.en || null;
}

const VALUE_REGEX_FIXES = [
  [/\b(\d+(?:[.,]\d+)?)\s*o\s*'?\s*clock\b/gi, '$1 hours'],
  [/\bjoystik\b/gi, 'joystick'],
];
function correctValueText(text) {
  const s = String(text ?? '');
  const ex = GLOSS.valueExact[foldTr(s)];
  if (ex) return ex;
  let out = s;
  for (const [re, rep] of VALUE_REGEX_FIXES) out = out.replace(re, rep);
  return out;
}

function correctedName(name, lang) {
  if (lang === 'tr') return name;
  const folded = foldTr(name).split(' ');
  for (let take = 3; take >= 1; take--) {
    if (folded.length < take) continue;
    const phrase = folded.slice(folded.length - take).join(' ');
    const hit = GLOSS.nameSuffix[phrase];
    if (hit) {
      const replacement = hit[lang] || hit.en;
      const orig = String(name).trim().split(/\s+/);
      if (orig.length >= take) {
        const head = orig.slice(0, orig.length - take).join(' ');
        return head ? `${head} ${replacement}` : replacement;
      }
    }
  }
  return name;
}

// ── PocketBase REST helpers ──────────────────────────────────────────────────
let token = null;
async function pbAuth() {
  const res = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
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

// ── Build the corrected patch for one product (null = nothing to change) ─────
function buildPatch(p) {
  const patch = {};

  // 1. Section name maps — rewrite hallucinated headers from the glossary.
  const mlSections = p.multiLangSections || {};
  for (const lang of LANGS) {
    const map = mlSections[lang];
    if (!map || typeof map !== 'object' || Array.isArray(map)) continue;
    let changed = false;
    const next = {};
    for (const [src, cur] of Object.entries(map)) {
      const fixed = typeof cur === 'string' ? correctedSectionHeader(src, lang) : null;
      if (fixed && fixed !== cur) {
        next[src] = fixed; changed = true;
        if (process.env.FIX_DEBUG && _dbg.length < 25) _dbg.push(`[${lang}] ${JSON.stringify(src)} : ${JSON.stringify(cur)} -> ${JSON.stringify(fixed)}`);
      } else next[src] = cur;
    }
    if (changed) { patch.multiLangSections = { ...(patch.multiLangSections || mlSections), [lang]: next }; }
  }

  // 2. Flat translation maps — repair mistranslated value atoms.
  const mlSpecs = p.multiLangSpecs || {};
  for (const lang of LANGS) {
    const map = mlSpecs[lang];
    if (!map || typeof map !== 'object' || Array.isArray(map)) continue;
    let changed = false;
    const next = {};
    for (const [src, cur] of Object.entries(map)) {
      if (typeof cur === 'string') {
        const fixed = correctValueText(cur);
        if (fixed !== cur) { next[src] = fixed; changed = true; } else next[src] = cur;
      } else next[src] = cur;
    }
    if (changed) { patch.multiLangSpecs = { ...(patch.multiLangSpecs || mlSpecs), [lang]: next }; }
  }

  // 3. Missing name translations — best-effort trailing category word.
  const nt = p.nameTranslated || {};
  const srcLang = String(p.sourceLang || 'tr').toLowerCase();
  if (srcLang === 'tr' && p.name) {
    let ntChanged = false;
    const nextNt = { ...nt };
    for (const lang of LANGS) {
      if (!nextNt[lang] || !String(nextNt[lang]).trim()) {
        const fixed = correctedName(p.name, lang);
        if (fixed && fixed !== p.name) { nextNt[lang] = fixed; ntChanged = true; }
      }
    }
    if (ntChanged) patch.nameTranslated = nextNt;
  }

  return Object.keys(patch).length ? patch : null;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[fix] glossary: ${Object.keys(GLOSS.sections).length} sections, ${Object.keys(GLOSS.valueExact).length} value-exacts, ${Object.keys(GLOSS.nameSuffix).length} name-suffixes`);
  console.log(`[fix] mode=${APPLY ? 'APPLY (writing)' : 'DRY-RUN'}  pageSize=${PAGE_SIZE}  startPage=${START_PAGE}  pageLimit=${PAGE_LIMIT}`);

  const fields = 'id,name,nameTranslated,sourceLang,multiLangSpecs,multiLangSections';
  let page = START_PAGE, pagesDone = 0, scanned = 0, changed = 0, written = 0, totalPages = Infinity;
  const samples = [];

  while (pagesDone < PAGE_LIMIT && page <= totalPages) {
    const res = await pbFetch(`/api/collections/products/records?perPage=${PAGE_SIZE}&page=${page}&fields=${encodeURIComponent(fields)}`);
    if (!res.ok) { console.error(`[fix] page ${page} fetch ${res.status}`); break; }
    const data = await res.json();
    totalPages = data.totalPages || 1;
    for (const p of (data.items || [])) {
      scanned++;
      const patch = buildPatch(p);
      if (!patch) continue;
      changed++;
      if (samples.length < 12) samples.push({ id: p.id, name: p.name, keys: Object.keys(patch) });
      if (APPLY) {
        const w = await pbFetch(`/api/collections/products/records/${p.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
        });
        if (w.ok) written++;
        else console.error(`[fix] PATCH ${p.id} -> ${w.status}: ${(await w.text()).slice(0, 160)}`);
      }
    }
    pagesDone++;
    if (page % 10 === 0 || pagesDone === 1) {
      console.log(`[fix] page ${page}/${totalPages}  scanned=${scanned}  changed=${changed}  written=${written}`);
    }
    page++;
  }

  console.log(`\n[fix] DONE. scanned=${scanned} changed=${changed} written=${written} (last page ${page - 1}/${totalPages})`);
  console.log('[fix] sample changes:');
  for (const s of samples) console.log('  ', s.id, '|', s.name, '->', s.keys.join(','));
  if (process.env.FIX_DEBUG) { console.log('\n[fix] sample section diffs:'); for (const l of _dbg) console.log('  ', l); }
  if (!APPLY) console.log('\n[fix] dry-run only — re-run with --apply to write. Resume mid-run with FIX_START_PAGE=<n>.');
}

main().catch((e) => { console.error(e); process.exit(1); });
