// ─────────────────────────────────────────────────────────────────────────────
//  Repair Epey (TR-source) product data that machine translation mangled.
//
//  Root problems found 2026-06-11 on apple/asus products (admin showed clean
//  English while the website leaked Turkish + bad casing):
//   1. nameTranslated.en/de = MT garbage ("Asus rog swift … is monitored",
//      lowercased "ROG Swift"). The Turkish SOURCE name (record.name) is the
//      canonical, properly-cased brand+model+category string. We regenerate
//      EN/DE from it: model preserved verbatim, trailing category noun
//      translated via a glossary. This OVERWRITES bad MT (the old
//      fix_spec_translations.mjs only filled EMPTY names).
//   2. Malformed duplicate spec keys with a dangling close-paren
//      ("Kullanım Kılavuzu)") — an Epey scrape parsing artifact. We strip the
//      stray paren and drop the resulting duplicate everywhere
//      (specs / specSections / specsEn / multiLangSpecs.* / keySpecs).
//   3. Document/manual VALUES are "<model> Monitör Kullanım Kılavuzu" — MT
//      mis-cased the model and half-translated the generic tail. We rebuild
//      EN/DE preserving the model verbatim and translating the generic phrase.
//
//  PB is patched, then the Typesense doc's embedded _raw is refreshed so the
//  website (which reads _raw) serves identical data to the admin (which reads
//  PB) and the app.
//
//  Usage:
//    node scripts/fix_epey_names_and_junk.mjs --slug rog-swift   # one product, dry
//    node scripts/fix_epey_names_and_junk.mjs --cat monitors --apply
//    node scripts/fix_epey_names_and_junk.mjs --apply             # whole catalog
//    FIX_START_PAGE=40 node scripts/fix_epey_names_and_junk.mjs --apply  # resume
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, 'migration', '.env'), 'utf8')
    .split(/\r?\n/).filter((l) => l && l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const PB = env.POCKETBASE_URL;
const TS = (env.TYPESENSE_URL || '').replace(/\/+$/, '');
const TS_KEY = env.TYPESENSE_API_KEY;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SLUG = (() => { const i = args.indexOf('--slug'); return i >= 0 ? args[i + 1] : null; })();
const CAT = (() => { const i = args.indexOf('--cat'); return i >= 0 ? args[i + 1] : null; })();
const START_PAGE = Math.max(1, Number(process.env.FIX_START_PAGE || 1));
const PAGE_SIZE = 200;

// ── Turkish fold (mirror spec_corrections.dart foldTr) ───────────────────────
const TRMAP = { ı: 'i', İ: 'i', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ş: 's', Ş: 's', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c' };
function foldTr(s) {
  let t = String(s);
  for (const k in TRMAP) t = t.split(k).join(TRMAP[k]);
  return t.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ── Trailing category-noun glossary (folded TR key → en/de) ──────────────────
const NAME_SUFFIX = {
  'monitor': { en: 'Monitor', de: 'Monitor' },
  'akilli monitor': { en: 'Smart Monitor', de: 'Smart Monitor' },
  'oyun monitoru': { en: 'Gaming Monitor', de: 'Gaming-Monitor' },
  'akilli telefon': { en: 'Smartphone', de: 'Smartphone' },
  'cep telefonu': { en: 'Smartphone', de: 'Smartphone' },
  'dizustu bilgisayar': { en: 'Laptop', de: 'Laptop' },
  'dizustu': { en: 'Laptop', de: 'Laptop' },
  'laptop': { en: 'Laptop', de: 'Laptop' },
  'tablet': { en: 'Tablet', de: 'Tablet' },
  'akilli saat': { en: 'Smartwatch', de: 'Smartwatch' },
  'kol saati': { en: 'Watch', de: 'Uhr' },
  'kulaklik': { en: 'Headphones', de: 'Kopfhörer' },
  'kablosuz kulaklik': { en: 'Wireless Headphones', de: 'Kabellose Kopfhörer' },
  'kulak ici kulaklik': { en: 'Earphones', de: 'In-Ear-Kopfhörer' },
  'klavye': { en: 'Keyboard', de: 'Tastatur' },
  'mouse': { en: 'Mouse', de: 'Maus' },
  'fare': { en: 'Mouse', de: 'Maus' },
  'oyun kolu': { en: 'Gamepad', de: 'Gamepad' },
  'ekran karti': { en: 'Graphics Card', de: 'Grafikkarte' },
  'anakart': { en: 'Motherboard', de: 'Mainboard' },
  'islemci': { en: 'Processor', de: 'Prozessor' },
  'televizyon': { en: 'TV', de: 'Fernseher' },
  'soguk cuzdan': { en: 'Hardware Wallet', de: 'Hardware-Wallet' },
  'yazici': { en: 'Printer', de: 'Drucker' },
  'projeksiyon': { en: 'Projector', de: 'Projektor' },
  'hoparlor': { en: 'Speaker', de: 'Lautsprecher' },
};

// Regenerate an EN/DE name from the Turkish source: brand+model preserved
// verbatim (correct casing), only a recognized trailing category phrase swapped.
function nameFromSource(sourceName, lang) {
  const name = String(sourceName || '').replace(/\s+/g, ' ').trim();
  if (!name || lang === 'tr') return name;
  const words = name.split(' ');
  for (let take = 3; take >= 1; take--) {
    if (words.length < take) continue;
    const phrase = foldTr(words.slice(-take).join(' '));
    const hit = NAME_SUFFIX[phrase];
    if (hit) {
      const head = words.slice(0, words.length - take).join(' ');
      return head ? `${head} ${hit[lang] || hit.en}` : (hit[lang] || hit.en);
    }
  }
  return name; // no category suffix → source is already the best EN/DE form
}

// ── Generic document/value phrase translation (model preserved) ──────────────
const VALUE_PHRASES = [
  [/\bmonitör\s+kullanım\s+kılavuzu\b/gi, { en: 'Monitor User Manual', de: 'Monitor-Benutzerhandbuch' }],
  [/\bkullanım\s+kılavuzu\b/gi, { en: 'User Manual', de: 'Benutzerhandbuch' }],
  [/\bkullanim\s+kilavuzu\b/gi, { en: 'User Manual', de: 'Benutzerhandbuch' }],
  [/\bkurulum\s+kılavuzu\b/gi, { en: 'Setup Guide', de: 'Installationsanleitung' }],
  [/\bhızlı\s+başlangıç\s+kılavuzu\b/gi, { en: 'Quick Start Guide', de: 'Schnellstartanleitung' }],
  [/\bürün\s+broşürü\b/gi, { en: 'Product Brochure', de: 'Produktbroschüre' }],
  [/\bteknik\s+özellikler\b/gi, { en: 'Specifications', de: 'Technische Daten' }],
];
function fixDocValue(value, lang) {
  let out = String(value || '');
  if (lang === 'tr') return out;
  for (const [re, map] of VALUE_PHRASES) out = out.replace(re, map[lang] || map.en);
  return out.replace(/\s+/g, ' ').trim();
}
// Is this value a document/manual string worth phrase-fixing?
const DOC_RE = /kılavuz|kilavuz|broşür|brosur|manual|guide|handbuch/i;

// ── Dangling-paren key normalization ─────────────────────────────────────────
function cleanKey(k) {
  let s = String(k || '').trim();
  // ")" with no "(" → scrape artifact. Strip stray closing parens.
  if (s.includes(')') && !s.includes('(')) s = s.replace(/\)+/g, '').replace(/\s+/g, ' ').trim();
  return s;
}
function cleanVal(v) {
  let s = String(v == null ? '' : v);
  // Same artifact bleeds into the value's last line.
  return s.split('\n').map((line) => {
    let t = line;
    if (t.includes(')') && !t.includes('(')) t = t.replace(/\)+\s*$/g, '').trim();
    return t;
  }).join('\n');
}

// Rewrite a flat {key:value} map: clean keys, drop dangling-paren duplicates,
// keep the first (cleaner) occurrence.
function cleanFlatMap(map, { fixDocs = false, lang = null, regenDocsFromKey = false } = {}) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return { map: map || {}, changed: false };
  const out = {};
  let changed = false;
  for (const [k, v] of Object.entries(map)) {
    const nk = cleanKey(k);
    let nv = cleanVal(v);
    // For atom maps {sourceAtom: translation}: a document VALUE keyed by a
    // Turkish doc atom must be regenerated FROM THE KEY so the model name is
    // preserved verbatim ("…Monitör Kullanım Kılavuzu" → "…Monitor User
    // Manual"); MT had lowercased the model ("…rog swift…use manual").
    if (regenDocsFromKey && lang && lang !== 'tr' && DOC_RE.test(nk)) {
      const regen = fixDocValue(cleanKey(k), lang);
      if (regen && regen !== nv) { nv = regen; changed = true; }
    } else if (fixDocs && typeof nv === 'string' && DOC_RE.test(nv)) {
      const fixed = fixDocValue(nv, lang);
      if (fixed !== nv) { nv = fixed; changed = true; }
    }
    if (nk !== k || nv !== v) changed = true;
    if (Object.prototype.hasOwnProperty.call(out, nk)) { changed = true; continue; } // drop dup
    out[nk] = nv;
  }
  return { map: out, changed };
}
function cleanSectionMap(sections, opts) {
  if (!sections || typeof sections !== 'object' || Array.isArray(sections)) return { map: sections || {}, changed: false };
  const out = {};
  let changed = false;
  for (const [sec, body] of Object.entries(sections)) {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const r = cleanFlatMap(body, opts);
      out[sec] = r.map;
      if (r.changed) changed = true;
    } else {
      out[sec] = body;
    }
  }
  return { map: out, changed };
}

// ── PB / TS plumbing ─────────────────────────────────────────────────────────
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
  let res = await fetch(`${PB}${pathname}`, { ...opts, headers: { Authorization: token, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (res.status === 401) { token = null; await pbAuth(); res = await fetch(`${PB}${pathname}`, { ...opts, headers: { Authorization: token, 'Content-Type': 'application/json', ...(opts.headers || {}) } }); }
  if (!res.ok) throw new Error(`PB ${pathname} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
async function tsPatch(id, partial) {
  const res = await fetch(`${TS}/collections/products/documents/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'X-TYPESENSE-API-KEY': TS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
  if (!res.ok && res.status !== 404) throw new Error(`TS ${id} -> ${res.status}`);
  return res.status !== 404;
}

// ── Build the patch for one product ──────────────────────────────────────────
function buildPatch(p) {
  if (String(p.sourceLang || 'tr').toLowerCase() !== 'tr') return null;
  const patch = {};
  let touched = false;

  // 1. Name regeneration (overwrite bad MT) from the Turkish source name.
  const src = String(p.name || '').trim();
  if (src) {
    const nt = { ...(p.nameTranslated || {}) };
    const en = nameFromSource(src, 'en');
    if (en && nt.en !== en) { nt.en = en; touched = true; }
    if (!nt.tr || nt.tr !== src) { nt.tr = src; touched = true; }
    // Almanca 2026-08-21'de kaldirildi. Burada `nameTranslated.de` de
    // yaziliyordu; bu betik 100k+ urune dokunuyor, yani bir kez calistirmak
    // Almanca adlari katalogun tamamina geri koyardi. Var olan `de` alani da
    // temizlenir — kalintiyi tasimanin anlami yok.
    if (nt.de !== undefined) { delete nt.de; touched = true; }
    if (touched) patch.nameTranslated = nt;
  }

  // 2 + 3. Structural cleanup + document-value fixes across every surface.
  const specsR = cleanFlatMap(p.specs, {});
  if (specsR.changed) { patch.specs = specsR.map; touched = true; }
  const specsEnR = cleanFlatMap(p.specsEn, {});
  if (specsEnR.changed) { patch.specsEn = specsEnR.map; touched = true; }
  const keyR = cleanFlatMap(p.keySpecs, {});
  if (keyR.changed) { patch.keySpecs = keyR.map; touched = true; }
  const secR = cleanSectionMap(p.specSections, {});
  if (secR.changed) { patch.specSections = secR.map; touched = true; }

  const ml = p.multiLangSpecs && typeof p.multiLangSpecs === 'object' ? { ...p.multiLangSpecs } : null;
  if (ml) {
    let mlChanged = false;
    for (const lang of Object.keys(ml)) {
      // .en/.de here are atom maps {turkishAtom: translation}: regenerate doc
      // values from the key. .tr is the Turkish source — only structural clean.
      const r = cleanFlatMap(ml[lang], { lang, regenDocsFromKey: lang !== 'tr' });
      if (r.changed) { ml[lang] = r.map; mlChanged = true; }
    }
    if (mlChanged) { patch.multiLangSpecs = ml; touched = true; }
  }
  const mlSec = p.multiLangSections && typeof p.multiLangSections === 'object' ? { ...p.multiLangSections } : null;
  if (mlSec) {
    let changed = false;
    for (const lang of Object.keys(mlSec)) {
      const node = mlSec[lang];
      // multiLangSections[lang] is a flat {sourceName: translation} map.
      const r = cleanFlatMap(node, { lang, regenDocsFromKey: lang !== 'tr' });
      if (r.changed) { mlSec[lang] = r.map; changed = true; }
    }
    if (changed) { patch.multiLangSections = mlSec; touched = true; }
  }

  return touched ? patch : null;
}

async function processOne(p, samples) {
  const patch = buildPatch(p);
  if (!patch) return { changed: false };
  if (samples.length < 6) {
    samples.push({ slug: p.slug, name: patch.nameTranslated || '(unchanged)', keys: Object.keys(patch) });
  }
  if (APPLY) {
    await pb(`/api/collections/products/records/${p.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    const fresh = await pb(`/api/collections/products/records/${p.id}`);
    await tsPatch(p.id, { name: fresh.name || '', nameSort: String(fresh.name || '').toLowerCase(), _raw: JSON.stringify(fresh) }).catch(() => {});
  }
  return { changed: true };
}

async function main() {
  const fields = 'id,slug,name,sourceLang,source,nameTranslated,specs,specsEn,keySpecs,specSections,multiLangSpecs,multiLangSections';
  console.log(`[epey-fix] mode=${APPLY ? 'APPLY' : 'DRY'} ${SLUG ? `slug~${SLUG}` : CAT ? `cat=${CAT}` : 'whole catalog'} startPage=${START_PAGE}`);
  const samples = [];
  let scanned = 0, changed = 0;

  if (SLUG) {
    const data = await pb(`/api/collections/products/records?perPage=10&filter=${encodeURIComponent(`slug~'${SLUG}'`)}&fields=${encodeURIComponent(fields)}`);
    for (const p of data.items || []) { scanned++; if ((await processOne(p, samples)).changed) changed++; }
  } else {
    const filter = CAT ? `&filter=${encodeURIComponent(`category='${CAT}'`)}` : '';
    let page = START_PAGE, totalPages = Infinity;
    while (page <= totalPages) {
      const data = await pb(`/api/collections/products/records?perPage=${PAGE_SIZE}&page=${page}${filter}&fields=${encodeURIComponent(fields)}`);
      totalPages = data.totalPages || 1;
      for (const p of data.items || []) { scanned++; if ((await processOne(p, samples)).changed) changed++; }
      if (page % 10 === 0 || page === START_PAGE) console.log(`[epey-fix] page ${page}/${totalPages} scanned=${scanned} changed=${changed}`);
      page++;
    }
  }
  console.log(`\n[epey-fix] DONE scanned=${scanned} changed=${changed} mode=${APPLY ? 'APPLY' : 'DRY'}`);
  console.log('[epey-fix] samples:');
  for (const s of samples) console.log('  ', s.slug, '|', s.keys.join(','), '|', JSON.stringify(s.name));
}
main().catch((e) => { console.error(e); process.exit(1); });
