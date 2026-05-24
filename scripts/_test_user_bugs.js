// Test using EXACTLY the bad data the user reported
const fs = require('fs');
const path = require('path');
global.localStorage = { _s: {}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v} };
global.window = {};
global.fetch = async () => ({ ok: true, json: async () => ({ translations: {} }) });
global.xlog = () => {}; global.slog = () => {}; global.toast = () => {};
global.AbortController = class { constructor() { this.signal = {}; } abort() {} };

// TR scraper
const trSrc = fs.readFileSync(path.join(__dirname, '..', 'admin', 'js', 'scraper.js'), 'utf8');
const trH = trSrc.indexOf('function _uniqueSpecKey');
const trE = trSrc.indexOf('function _deDictLookup');
eval(trSrc.slice(trH, trE));

console.log('=== TURKISH (Lenovo ThinkBook actual user bugs) ===');
const userLenovo = {
  source: 'epey',
  sourceUrl: 'https://www.epey.com/laptop/lenovo-thinkbook-16p.html',
  name: 'Lenovo ThinkBook 16p G6',
  specs: {
    'GPU Markası': 'NVIDIA',
    'İşlemci Markası': 'AMD',
    'AMD Radeon 610M': 'Internal Graphics Model',
  },
  specSections: { 'Main': {} },
  specsEn: {
    'GPU Brand': 'North',
    'Processor Brand': 'Main',
    'Shareholder': 'Yes',
    'GPU distance': '3 nm',
    'Transistor distance': '3 nm',
    'Display width height': '16:10',
    'Product Purpose': '/Mobile',
    'Eyesafe (food certification)': 'Var',
    'Internal Graphics Other Specifications': 'AMD FreeSync',
  },
  keySpecs: {},
  multiLangSpecs: {
    en: {
      'GPU Markası': 'North',
      'İşlemci Markası': 'Main',
      'Transistör Mesafesi': 'Transistor distance',
      'Ürün Kullanım Amacı': '/Mobile',
      'Eyesafe (göz sağlığı sertifikası)': 'Eyesafe (food certification)',
      'Dayanıklılık': 'Shareholder',
      'Görüntü En Boy Oranı': 'Display width height',
    },
  },
  multiLangSections: { en: { 'Performans': 'Performance' } },
  nameTranslated: { en: 'Lenovo ThinkBook 16p G6' },
};

_sanitizeEnglishPayload(userLenovo);
const lenovoResidues = _englishPayloadResidues(userLenovo);
console.log('After sanitize:');
console.log('  specsEn:', JSON.stringify(userLenovo.specsEn, null, 2));
console.log('  multiLangSpecs.en:', JSON.stringify(userLenovo.multiLangSpecs.en, null, 2));
console.log('  Residues:', lenovoResidues.length);
if (lenovoResidues.length) {
  for (const r of lenovoResidues.slice(0, 10)) console.log('    ' + r.path + ': ' + r.value);
}

console.log('');
console.log('=== GERMAN (Samsung Watch8 actual user bugs) ===');

// Geizhals scraper
const deSrc = fs.readFileSync(path.join(__dirname, '..', 'admin', 'js', 'scraper-geizhals.js'), 'utf8');
const deH = deSrc.search(/function _uniqueSpecKey|const _DE_WORD_CHARS|function _normalizeDictSourceKey/);
const deE = deSrc.indexOf('function _deDictLookup');
eval(deSrc.slice(deH, deE));

const userWatch = {
  source: 'geizhals',
  sourceUrl: 'https://geizhals.eu/samsung-watch8.html',
  name: 'Samsung Galaxy Watch8',
  specs: {},
  specSections: {
    'Bracelets': { 'Bracelet': 'Black' },
    'General': { 'Features': 'features' },
  },
  specsEn: {
    'MIL-STD-810H-certified': 'Yes',
    '12/24h-display': 'Yes',
    'Bracelets': '',
  },
  keySpecs: {},
  multiLangSpecs: {
    en: {
      'Anzeige': '12/24h-display',
      'Armbänder': 'Bracelets',
      'MIL-STD-810H-zertifiziert': 'MIL-STD-810H-certified',
    },
  },
  multiLangSections: {
    en: { 'Armbänder': 'Bracelets', 'Allgemein': 'General' },
  },
  nameTranslated: { en: 'Samsung Galaxy Watch8' },
};

_sanitizeGermanEnglishPayload(userWatch);
const watchResidues = _germanEnglishPayloadResidues(userWatch);
console.log('After sanitize:');
console.log('  specsEn:', JSON.stringify(userWatch.specsEn, null, 2));
console.log('  specSections:', JSON.stringify(userWatch.specSections, null, 2));
console.log('  multiLangSpecs.en:', JSON.stringify(userWatch.multiLangSpecs.en, null, 2));
console.log('  multiLangSections.en:', JSON.stringify(userWatch.multiLangSections.en, null, 2));
console.log('  Residues:', watchResidues.length);
if (watchResidues.length) {
  for (const r of watchResidues.slice(0, 10)) console.log('    ' + r.path + ': ' + r.value);
}

console.log('');
console.log('=== ÖZET ===');
const lenoBad = lenovoResidues.length;
const watchBad = watchResidues.length;
console.log('Lenovo (TR): ' + (lenoBad === 0 ? 'CLEAN ✓' : 'DIRTY (' + lenoBad + ' residues)'));
console.log('Watch  (DE): ' + (watchBad === 0 ? 'CLEAN ✓' : 'DIRTY (' + watchBad + ' residues)'));

// Also check specific bug strings
const allStrings = JSON.stringify(userLenovo) + JSON.stringify(userWatch);
const bugs = [
  ['North'      , /\bNorth\b/.test(allStrings)],
  ['Main as brand', /:\s*"Main"/.test(allStrings)],
  ['Shareholder', /Shareholder/.test(allStrings)],
  ['food certification', /food certification/.test(allStrings)],
  ['12/24h-display', /12\/24h-display/.test(allStrings)],
  ['/Mobile (leading slash)', /:\s*"\/Mobile/.test(allStrings)],
  ['Display width height', /Display width height/.test(allStrings)],
  ['GPU distance', /"GPU distance"/.test(allStrings)],
  ['Transistor distance', /Transistor distance/.test(allStrings)],
  ['MIL-STD-810H-certified', /MIL-STD-810H-certified/.test(allStrings)],
];
let bugCount = 0;
console.log('');
console.log('=== SPESİFİK USER BUG\'LARI ===');
for (const [name, present] of bugs) {
  if (present) {
    bugCount++;
    console.log('  ✗ "' + name + '" hala var');
  } else {
    console.log('  ✓ "' + name + '" düzeltildi');
  }
}
console.log('');
console.log(bugCount === 0 ? 'TÜM USER BUG\'LARI DÜZELDİ ✓' : bugCount + ' BUG HALA VAR ✗');
