// Test for turn-3 user bugs (Gemini-found)
const fs = require('fs');
const path = require('path');
global.localStorage = { _s: {}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v} };
global.window = {};
global.fetch = async () => ({ ok: true, json: async () => ({ translations: {} }) });
global.xlog = () => {}; global.slog = () => {}; global.toast = () => {};
global.AbortController = class { constructor() { this.signal = {}; } abort() {} };

const trSrc = fs.readFileSync(path.join(__dirname, '..', 'admin', 'js', 'scraper.js'), 'utf8');
const trH = trSrc.indexOf('function _uniqueSpecKey');
const trE = trSrc.indexOf('function _deDictLookup');
eval(trSrc.slice(trH, trE));

console.log('=== TURN-3 BUGS (Lenovo Memory section) ===');
const product = {
  source: 'epey',
  sourceUrl: 'https://www.epey.com/laptop/lenovo.html',
  name: 'Lenovo ThinkBook',
  specs: {},
  specSections: { 'Main': {} },
  specsEn: {
    'Available Memory': '2 x 32 GB',
    'Fixed Disk (HDD)': 'No',
    'Fixed Disk (SSD) Type': 'NVMe M.2 (PCIe 4.0)',
    'Total Memory': '2',
    'Optical Reader': 'No',
    'Low Blue': 'Yes',
    'Endurance for bumps': 'Yes',
    'Card reader features': 'SD Card reader',
    'Camera Specifications': '720p ()',
  },
  keySpecs: {},
  multiLangSpecs: {
    en: {
      'Mevcut Bellek': 'Available Memory',
      'Sabit Disk (SSD) Tipi': 'Fixed Disk (SSD) Type',
      'Toplam Bellek Yuvası': 'Total Memory',
      'Optik Okuyucu': 'Optical Reader',
      'EKG Sensörü': 'EKG Sensor',
    },
  },
  multiLangSections: { en: {} },
  nameTranslated: { en: 'Lenovo ThinkBook' },
};

_sanitizeEnglishPayload(product);
const r = _englishPayloadResidues(product);
console.log('After sanitize:');
console.log('  specsEn:', JSON.stringify(product.specsEn, null, 2));
console.log('  multiLangSpecs.en:', JSON.stringify(product.multiLangSpecs.en, null, 2));

const all = JSON.stringify(product);
const bugs = [
  ['Fixed Disk',                /\bFixed\s+Disk\b/.test(all)],
  ['Available Memory',          /\bAvailable\s+Memory\b/.test(all)],
  ['Total Memory: 2 (sayısız)', /"Total\s+Memory"\s*:\s*"2"/.test(all)],
  ['EKG (should be ECG)',       /\bEKG\b/.test(all)],
  ['Optical Reader',            /\bOptical\s+Reader\b/.test(all)],
  ['Low Blue (no light)',       /\bLow\s+Blue\b(?!\s+light)/.test(all)],
  ['720p ()',                   /\b720p\s*\(\s*\)/.test(all)],
  ['Card reader features',      /\bCard\s+reader\s+features\b/.test(all)],
  ['Endurance for bumps',       /\bEndurance\s+for\s+bumps\b/.test(all)],
];

console.log('');
console.log('=== TURN-3 BUG STATUS ===');
let bad = 0;
for (const [name, present] of bugs) {
  if (present) { bad++; console.log('  ✗ "' + name + '" hala var'); }
  else console.log('  ✓ "' + name + '" düzeltildi');
}
console.log('');
console.log(bad === 0 ? 'TÜM TURN-3 BUG\'LARI DÜZELDİ ✓' : bad + ' BUG HALA VAR ✗');

console.log('');
console.log('=== CAPITALIZATION ===');
let lowerCount = 0;
function walk(o, p) {
  if (o == null) return;
  if (typeof o === 'string') {
    if (o && /^[a-z]/.test(o) && !/^[0-9]/.test(o) && !/^[a-z]?USB|^iPhone|^macOS|^iOS|^iPadOS/.test(o)) {
      lowerCount++;
      console.log('  lowercase first: ' + p + ' = "' + o.slice(0, 50) + '"');
    }
    return;
  }
  if (typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) walk(v, p ? p + '.' + k : k);
  }
}
walk(product.specsEn, 'specsEn');
walk(product.multiLangSpecs.en, 'multiLangSpecs.en');
console.log('Lowercase-start values: ' + lowerCount);

// DE side test
console.log('');
console.log('=== GEIZHALS TURN-3 BUGS ===');
const deSrc = fs.readFileSync(path.join(__dirname, '..', 'admin', 'js', 'scraper-geizhals.js'), 'utf8');
const deH = deSrc.search(/function _uniqueSpecKey|const _DE_WORD_CHARS|function _normalizeDictSourceKey/);
const deE = deSrc.indexOf('function _deDictLookup');
eval(deSrc.slice(deH, deE));

const watch = {
  source: 'geizhals',
  sourceUrl: 'https://geizhals.eu/watch.html',
  name: 'Samsung Watch',
  specs: {},
  specSections: { 'Bracelets': {} },
  specsEn: {
    'Bracelets': 'Black',
    'EKG support': 'Yes',
    'pulse measurement': 'integrated (optical, EKG)',
  },
  keySpecs: {},
  multiLangSpecs: { en: { 'Armbänder': 'Bracelets', 'EKG': 'EKG' } },
  multiLangSections: { en: { 'Armbänder': 'Bracelets' } },
  nameTranslated: { en: 'Samsung Watch' },
};
_sanitizeGermanEnglishPayload(watch);
console.log('  specsEn:', JSON.stringify(watch.specsEn, null, 2));
console.log('  specSections:', JSON.stringify(watch.specSections, null, 2));

const watchAll = JSON.stringify(watch);
const deBugs = [
  ['EKG (should be ECG)',  /\bEKG\b/.test(watchAll)],
  ['Bracelets',            /\bBracelets?\b/.test(watchAll)],
];
let deBad = 0;
for (const [name, present] of deBugs) {
  if (present) { deBad++; console.log('  ✗ DE "' + name + '" hala var'); }
  else console.log('  ✓ DE "' + name + '" düzeltildi');
}
console.log('');
console.log(deBad === 0 ? 'TÜM DE TURN-3 BUG\'LARI DÜZELDİ ✓' : deBad + ' DE BUG HALA VAR ✗');
