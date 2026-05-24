// Feed REAL data structure as built by _buildProductTranslations
const fs = require('fs');
const path = require('path');
global.localStorage = { _s: {}, getItem(k){return this._s[k]||null}, setItem(k,v){this._s[k]=v} };
global.window = {};
global.fetch = async () => ({ ok: true, json: async () => ({ translations: {} }) });
global.xlog = () => {}; global.slog = () => {}; global.toast = () => {};
global.AbortController = class { constructor() { this.signal = {}; } abort() {} };

const trSrc = fs.readFileSync(path.join(__dirname, '..', 'admin', 'js', 'scraper.js'), 'utf8');
eval(trSrc.slice(trSrc.indexOf('function _uniqueSpecKey'), trSrc.indexOf('function _deDictLookup')));

// REAL multiLangSpecs.en structure: {TR_source: EN_translation}
// Both keys and values go through dict; both can be Argos-mistranslated.
const lenovo = {
  source: 'epey',
  sourceUrl: 'https://www.epey.com/laptop/lenovo.html',
  name: 'Lenovo ThinkBook',
  // TR original specs
  specs: {
    'Kart Okuyucu Özellikleri': 'SD Kart Okuyucu',
    'Darbe Dayanıklılığı': 'Var',
    'Ana': 'MIL-STD-810H',
    'Paylaşım': 'Var',
    'Klavye Arka Aydınlatması': 'Var',
    'GPU': 'NVIDIA GeForce RTX 5060 115W',
    'GPU Markası': 'NVIDIA',
    'Transistör Mesafesi': '3 nm',
    'Dahili Grafik Modeli': 'AMD Radeon 610M',
    'Eyesafe (göz sağlığı sertifikası)': 'Var',
    'Ekran Genişlik Yükseklik Oranı': '16:10',
    'Mavi Işık': 'Var',
    'Ürün Kullanım Amacı': 'İş/Mobil',
    'Mevcut Bellek': '2 x 32 GB',
    'Sabit Disk (HDD)': 'Yok',
    'Sabit Disk (SSD) Tipi': 'NVMe M.2 (PCIe 4.0)',
    'Optik Okuyucu': 'Yok',
    'Toplam Bellek Yuvası': '2',
    'Kamera Özellikleri': '720p',
  },
  specSections: { 'Ana': {} },
  // English direct map (canonical English)
  specsEn: {
    'Card reader features': 'SD Card reader',
    'Endurance for bumps': 'Yes',
    'Main': 'MIL-STD-810H',
    'Shareholder': 'Yes',
    'Keyboard Rear Lighting': 'Yes',
    'GPU Brand': 'North',
    'GPU distance': '3 nm',
    'Eyesafe (food certification)': 'Yes',
    'Display width height': '16:10',
    'Low Blue': 'Yes',
    'Product Purpose': '/Mobile',
    'Available Memory': '2 x 32 GB',
    'Fixed Disk (HDD)': 'No',
    'Fixed Disk (SSD) Type': 'NVMe M.2 (PCIe 4.0)',
    'Optical Reader': 'No',
    'Total Memory': '2',
    'Camera Specifications': '720p ()',
  },
  keySpecs: {},
  // {TR source : EN translation} map
  multiLangSpecs: {
    en: {
      // Keys are TR; values are bad Argos translations
      'Kart Okuyucu Özellikleri': 'Card reader features',
      'Darbe Dayanıklılığı': 'Endurance for bumps',
      'Paylaşım': 'Shareholder',
      'Klavye Arka Aydınlatması': 'Keyboard Rear Lighting',
      'GPU Markası': 'North',
      'Transistör Mesafesi': 'GPU distance',
      'Eyesafe (göz sağlığı sertifikası)': 'Eyesafe (food certification)',
      'Ekran Genişlik Yükseklik Oranı': 'Display width height',
      'Mavi Işık': 'Low Blue',
      'Ürün Kullanım Amacı': '/Mobile',
      'Mevcut Bellek': 'Available Memory',
      'Sabit Disk (HDD)': 'Fixed Disk (HDD)',
      'Sabit Disk (SSD) Tipi': 'Fixed Disk (SSD) Type',
      'Optik Okuyucu': 'Optical Reader',
      'Toplam Bellek Yuvası': 'Total Memory',
      'Kamera Özellikleri': '720p ()',
      // also Argos sometimes stores English source = English-bad translation
      'Var': 'Yes',
      'Yok': 'No',
    },
  },
  multiLangSections: { en: { 'Ana': 'Main' } },
  nameTranslated: { en: 'Lenovo ThinkBook' },
};

console.log('=== BEFORE ===');
console.log('  specsEn["GPU Brand"]:', lenovo.specsEn['GPU Brand']);
console.log('  multiLangSpecs.en["GPU Markası"]:', lenovo.multiLangSpecs.en['GPU Markası']);
console.log('  multiLangSpecs.en["Darbe Dayanıklılığı"]:', lenovo.multiLangSpecs.en['Darbe Dayanıklılığı']);
console.log('  multiLangSpecs.en["Paylaşım"]:', lenovo.multiLangSpecs.en['Paylaşım']);

_sanitizeEnglishPayload(lenovo);

console.log('');
console.log('=== AFTER specsEn ===');
for (const [k, v] of Object.entries(lenovo.specsEn)) console.log('    "' + k + '": "' + v + '"');
console.log('');
console.log('=== AFTER multiLangSpecs.en (KEY=TR_source, VALUE=EN_translation) ===');
for (const [k, v] of Object.entries(lenovo.multiLangSpecs.en)) console.log('    "' + k + '" → "' + v + '"');

console.log('');
console.log('=== RESIDUE (assert level) ===');
const residues = _englishPayloadResidues(lenovo);
if (residues.length === 0) console.log('NO RESIDUES — assert would PASS ✓');
else {
  console.log('FAIL: ' + residues.length + ' residues:');
  for (const r of residues) console.log('   ' + r.path + ': ' + r.value);
}

console.log('');
console.log('=== USER-VISIBLE VALUES IN multiLangSpecs.en ===');
const badValues = ['North', 'Main', 'Shareholder', 'food certification', 'Fixed Disk',
  'Available Memory', 'GPU distance', 'Display width height', 'Endurance for bumps',
  'Card reader features', 'Optical Reader', 'Low Blue', '/Mobile', '720p ()',
  'Keyboard Rear Lighting'];
let stillBad = 0;
for (const [k, v] of Object.entries(lenovo.multiLangSpecs.en)) {
  for (const bad of badValues) {
    if (v && v.includes(bad)) {
      console.log('  ✗ value "' + v + '" still has "' + bad + '" (key was "' + k + '")');
      stillBad++;
    }
  }
}
if (stillBad === 0) console.log('  ✓ All translation VALUES clean');
