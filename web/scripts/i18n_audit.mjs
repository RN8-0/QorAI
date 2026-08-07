// Eksik ceviri anahtari denetimi — `npm run build` icinde kosar.
//
// NEDEN VAR: `t()` bilinmeyen bir anahtarda ANAHTARIN KENDISINI donuyor
// (i18n/index.jsx: "if (s == null) return key"). Bu, gelistirirken eksigi
// gormek icin mantikli ama URUNDE sessiz bir hata: sozluge eklenmeyen anahtar
// kullaniciya ham metin olarak gorunuyor. 2026-08-07'de urun sayfasindaki
// yorum siralama butonlari tam olarak boyle "pd.revSortNew / pd.revSortTop /
// pd.revSortHigh / pd.revSortLow" yaziyordu.
//
// AYRICA `t('x') || 'yedek'` KALIBI CALISMAZ: t() bos degil, anahtari doner —
// yani yedek metin ASLA devreye girmez. Bu betik o kalibi de yakalar.
//
// Cikti: eksik anahtarlar + hangi dosyada kullanildiklari. Eksik varsa
// SIFIRDAN FARKLI kod doner, boylece derleme gurultulu bicimde uyarir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');          // web/
const SRC = path.join(root, 'src');

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p);
  }
})(SRC);

// Yorum satirlarini at (dokumantasyondaki ornek anahtarlar sayilmasin).
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
}

const KEY_RE = /\bt\(\s*['"`]([A-Za-z0-9_.]+)['"`]/g;
const FALLBACK_RE = /\bt\(\s*['"`][A-Za-z0-9_.]+['"`]\s*\)\s*\|\|/g;

const used = new Map();
const badFallbacks = [];
for (const f of files) {
  const src = stripComments(fs.readFileSync(f, 'utf8'));
  const rel = path.relative(root, f).replace(/\\/g, '/');
  let m;
  while ((m = KEY_RE.exec(src))) {
    const key = m[1];
    if (!key.includes('.')) continue;
    if (!used.has(key)) used.set(key, new Set());
    used.get(key).add(rel);
  }
  if (FALLBACK_RE.test(src)) badFallbacks.push(rel);
}

// KONTROL INGILIZCE SOZLUK UZERINDEN YAPILIR.
// t() sirasiyla (1) aktif dil, (2) INGILIZCE, (3) anahtarin kendisi doner.
// Yani bir anahtar yalnizca Turkce'de tanimliysa, Ingilizce/Almanca ziyaretci
// ekranda HAM ANAHTARI gorur. Tum dil dosyalarini tek havuza atmak bu hatayi
// gizliyordu (ilk surumde tam bu yuzden testi gecti). Referans sozluk `en`.
const DEF_RE = /^\s*['"]([A-Za-z0-9_.]+)['"]\s*:/gm;
function keysIn(text) {
  const out = new Set();
  let x;
  const re = new RegExp(DEF_RE.source, 'gm');
  while ((x = re.exec(text))) out.add(x[1]);
  return out;
}

const stringsSrc = fs.readFileSync(path.join(SRC, 'i18n/strings.js'), 'utf8');
// `const en = { ... }` blogunu ayikla (bir sonraki `const <ad> = {`e kadar).
const enStart = stringsSrc.search(/^const en\s*=\s*\{/m);
if (enStart < 0) { console.error('[i18n] strings.js icinde `const en = {` bulunamadi'); process.exit(1); }
const after = stringsSrc.slice(enStart + 1);
const nextBlock = after.search(/^const \w+\s*=\s*\{/m);
const enBlock = nextBlock < 0 ? after : after.slice(0, nextBlock);
const defined = keysIn(enBlock);

// Diger diller: eksikleri BILGI olarak raporlanir (Ingilizceye duserler).
const otherMissing = new Map();
const trStart = stringsSrc.search(/^const tr\s*=\s*\{/m);
if (trStart >= 0) {
  const trAfter = stringsSrc.slice(trStart + 1);
  const trNext = trAfter.search(/^const \w+\s*=\s*\{/m);
  const trKeys = keysIn(trNext < 0 ? trAfter : trAfter.slice(0, trNext));
  const miss = [...used.keys()].filter((k) => defined.has(k) && !trKeys.has(k));
  if (miss.length) otherMissing.set('tr', miss);
}
const localeDir = path.join(SRC, 'i18n/locales');
for (const f of fs.readdirSync(localeDir)) {
  const lang = f.replace(/\.js$/, '');
  const lk = keysIn(fs.readFileSync(path.join(localeDir, f), 'utf8'));
  const miss = [...used.keys()].filter((k) => defined.has(k) && !lk.has(k));
  if (miss.length) otherMissing.set(lang, miss);
}

const missing = [...used.keys()].filter((k) => !defined.has(k)).sort();

if (missing.length) {
  console.error(`\n[i18n] EKSIK CEVIRI ANAHTARI (Ingilizce sozlukte yok): ${missing.length}`);
  console.error('       Bu anahtarlar ekranda HAM METIN olarak gorunur.');
  for (const k of missing) {
    console.error(`  ${k}`);
    for (const f of used.get(k)) console.error(`      ${f}`);
  }
} else {
  console.log(`[i18n] ok: kullanilan ${used.size} anahtarin hepsi Ingilizce sozlukte (${defined.size} tanim)`);
}

// Diger diller Ingilizceye duser — hata degil ama gorunur olsun.
for (const [lang, keys] of otherMissing) {
  console.log(`[i18n] not: ${lang} icin ${keys.length} anahtar cevrilmemis (Ingilizce gosterilir)` +
    (keys.length <= 6 ? ` — ${keys.join(', ')}` : ''));
}

if (badFallbacks.length) {
  console.error(`\n[i18n] UYARI — "t('x') || 'yedek'" kalibi ISE YARAMAZ (t eksikte anahtari doner):`);
  for (const f of new Set(badFallbacks)) console.error(`      ${f}`);
}

if (missing.length) process.exitCode = 1;
