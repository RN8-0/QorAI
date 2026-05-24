// Test Samsung TV bugs reported by user (Karasal, Rehberi, Yesiable, etc.)
const fs = require('fs');
const path = require('path');
global.localStorage = { _s: {}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v} };
global.window = {};
global.fetch = async () => ({ ok: true, json: async () => ({ translations: {} }) });
global.xlog = () => {}; global.slog = () => {}; global.toast = () => {};
global.AbortController = class { constructor() { this.signal = {}; } abort() {} };

const trSrc = fs.readFileSync(path.join(__dirname, '..', 'admin', 'js', 'scraper.js'), 'utf8');
eval(trSrc.slice(trSrc.indexOf('function _uniqueSpecKey'), trSrc.indexOf('function _deDictLookup')));

const samsungTV = {
  source: 'epey',
  sourceUrl: 'https://www.epey.com/lcd-led-tv/samsung-98qn990f.html',
  name: 'Samsung 98QN990F',
  specs: {},
  specSections: { 'Main': {} },
  specsEn: {
    'HD Karasal Receiver (DVB-T2)': 'Yes',
    'Karasal Receiver (DVB-T)': 'Yes',
    'Program Rehberi (EPG)': 'Yes',
    'Yesiable Refresh Rate (VRR)': 'Yes',
    'Save (pvr)': 'No',
    'Display Mirroring (Two Way)': 'Yes',
    'Digital Audio Output': 'Main',
    '3D': 'No',
    'Smart': 'Main',
    'HbbTV': 'Main',
  },
  keySpecs: {},
  multiLangSpecs: {
    en: {
      'HD Karasal Alıcı (DVB-T2)': 'HD Karasal Receiver (DVB-T2)',
      'Karasal Alıcı (DVB-T)': 'Karasal Receiver (DVB-T)',
      'Program Rehberi': 'Program Rehberi (EPG)',
      'Değişken Tazeleme Hızı': 'Yesiable Refresh Rate (VRR)',
      'Kayıt (PVR)': 'Save (pvr)',
      'Çift Yönlü Ekran Yansıtma': 'Display Mirroring (Two Way)',
    },
  },
  multiLangSections: { en: {} },
  nameTranslated: { en: 'Samsung 98QN990F' },
};

console.log('=== BEFORE ===');
console.log('  specsEn keys with bugs:');
for (const k of Object.keys(samsungTV.specsEn)) console.log('    "' + k + '"');

_sanitizeEnglishPayload(samsungTV);

console.log('');
console.log('=== AFTER specsEn ===');
for (const [k, v] of Object.entries(samsungTV.specsEn)) console.log('    "' + k + '" = "' + v + '"');
console.log('');
console.log('=== AFTER multiLangSpecs.en ===');
for (const [k, v] of Object.entries(samsungTV.multiLangSpecs.en)) console.log('    "' + k + '" → "' + v + '"');

console.log('');
console.log('=== USER BUG CHECKS ===');
const all = JSON.stringify(samsungTV);
const bugs = [
  ['"Karasal" leaks', /Karasal/.test(all)],
  ['"Rehberi" leaks', /Rehberi/.test(all)],
  ['"Yesiable" leaks', /Yesiable/.test(all)],
  ['"Save (pvr)" leaks', /Save\s*\(\s*pvr\s*\)/i.test(all)],
  ['"Two Way" leaks', /Two\s+Way/.test(all)],
  ['"Main" as value (Digital Audio)', /"Digital\s+Audio\s+Output"\s*:\s*"Main"/.test(all)],
];
let bad = 0;
for (const [name, present] of bugs) {
  if (present) { bad++; console.log('  ✗ ' + name); }
  else console.log('  ✓ ' + name + ' düzeltildi');
}
console.log('');
console.log(bad === 0 ? 'TÜM SAMSUNG TV BUG\'LARI DÜZELDİ ✓' : bad + ' BUG HALA VAR ✗');
