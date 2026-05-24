// END-TO-END test for Geizhals save path
const fs = require('fs');
const path = require('path');
global.localStorage = {
  _s: {},
  getItem: function(k) { return this._s[k] || null; },
  setItem: function(k, v) { this._s[k] = v; },
};
global.window = {};
global.fetch = async () => ({ ok: true, json: async () => ({ translations: {} }) });
global.xlog = () => {};
global.slog = () => {};
global.toast = () => {};
global.AbortController = class { constructor() { this.signal = {}; } abort() {} };

const src = fs.readFileSync(path.join(__dirname, '..', 'admin', 'js', 'scraper-geizhals.js'), 'utf8');

// Find ranges
const helpersStart = src.search(/function _uniqueSpecKey|const _DE_WORD_CHARS|function _normalizeDictSourceKey/);
const sanitizerEnd = src.indexOf('function _deDictLookup');
console.log('helpersStart:', helpersStart, 'sanitizerEnd:', sanitizerEnd);

eval(src.slice(helpersStart, sanitizerEnd));

const SCENARIOS = [
  {
    name: 'Apple iPhone 15 Pro',
    sourceSpec: {
      'Akkukapazität': '3274 mAh',
      'Bildschirmgröße': '6.1 Zoll',
      'Auflösung': '2556 x 1179 Pixel',
      'Helligkeit': '2000 cd/m²',
      'Bildwiederholrate': '120 Hz',
      'Reaktionszeit': '1 ms',
      'Annäherungssensor': 'Ja',
      'Lichtsensor': 'Ja',
      'Beschleunigungssensor': 'Ja',
      'Gehäusematerial': 'Titan',
      'Wasserdicht': 'IP68',
      'Schnellladen': 'Ja, 27 W',
      'Kabelloses Laden': 'MagSafe 15W',
      'Anschlüsse': 'USB-C',
      'Höhe': '146.6 mm',
    },
  },
  {
    name: 'Apple iPad Pro M4',
    sourceSpec: {
      'Bildschirmdiagonale': '13 Zoll',
      'Prozessor': 'Apple M4',
      'Arbeitsspeicher': '8 GB',
      'Gerätespeicher': '256 GB',
      'Akkulaufzeit': '10 Stunden',
      'Gewicht': '579 g',
      'Abmessungen': '281x215x5.1 mm',
      'Anschlüsse': 'USB-C (Thunderbolt)',
    },
  },
  {
    name: 'Lenovo ThinkPad X1 Carbon',
    sourceSpec: {
      'Prozessor': 'Intel Core Ultra 7',
      'Arbeitsspeicher': '32 GB',
      'Festplatte': '1 TB NVMe SSD',
      'Bildschirmdiagonale': '14 Zoll',
      'Auflösung': '2240 x 1400',
      'Akkulaufzeit': '12 Stunden',
      'Tastatur': 'Beleuchtet, deutsches Layout',
      'Schnittstellen': 'Thunderbolt 4, USB-A, HDMI',
      'Gewicht': '1.09 kg',
      'Gehäusematerial': 'Magnesium-Aluminium',
    },
  },
  {
    name: 'NVIDIA GeForce RTX 5090',
    sourceSpec: {
      'Speicher': '32 GB GDDR7',
      'Speichertyp': 'GDDR7',
      'Stromverbrauch': '575 W',
      'Anschlüsse': '3x DisplayPort 2.1, 1x HDMI 2.1',
      'Kühlung': 'Triple-Fan',
    },
  },
  {
    name: 'AMD Ryzen 9 9950X',
    sourceSpec: {
      'Kerne': '16',
      'Threads': '32',
      'Taktfrequenz': '4.3 GHz',
      'Boost-Takt': '5.7 GHz',
      'Cache': '80 MB',
      'Fertigung': '4 nm',
      'TDP': '170 W',
    },
  },
  {
    name: 'MSI Monitor 32 Zoll',
    sourceSpec: {
      'Bildschirmgröße': '32 Zoll',
      'Auflösung': '3840 x 2160',
      'Aktualisierungsrate': '144 Hz',
      'Reaktionszeit': '1 ms',
      'Helligkeit': '600 cd/m²',
      'Panel': 'IPS',
      'Anschlüsse': 'HDMI 2.1, DisplayPort 1.4',
    },
  },
  {
    name: 'Sony WH-1000XM5',
    sourceSpec: {
      'Bauform': 'Over-Ear',
      'Geräuschunterdrückung': 'Aktiv',
      'Akkulaufzeit': '30 Stunden',
      'Schnellladen': '3 Minuten = 3 Stunden',
      'Bluetooth-Version': '5.2',
      'Gewicht': '250 g',
    },
  },
  {
    name: 'Garmin Fenix 8',
    sourceSpec: {
      'Bildschirmdiagonale': '1.4 Zoll',
      'Akkulaufzeit': '21 Tage',
      'Wasserdicht': '10 ATM',
      'Sensoren': 'GPS, Beschleunigungssensor, Höhenmesser, Kompass, Barometer',
      'Messfunktionen': 'Schritte, Schlafüberwachung, Pulsmessung, Blutsauerstoff',
      'Schnittstellen': 'Wi-Fi, Bluetooth, NFC',
    },
  },
  {
    name: 'Samsung QN95F TV',
    sourceSpec: {
      'Bildschirmgröße': '65 Zoll',
      'Auflösung': '8K (7680 x 4320)',
      'Bildwiederholrate': '120 Hz',
      'HDR': 'HDR10+, Dolby Vision',
      'Smart-TV-Plattform': 'Tizen',
      'Anschlüsse': '4x HDMI 2.1',
    },
  },
  {
    name: 'Anker PowerCore 26800',
    sourceSpec: {
      'Akkukapazität': '26800 mAh',
      'Schnellladen': '30W USB-C PD',
      'Anschlüsse': '2x USB-A, 1x USB-C',
      'Gewicht': '495 g',
      'Abmessungen': '180x80x22 mm',
    },
  },
];

function fakeArgosTranslate(deText) {
  return String(deText)
    .replace(/Akkukapazität/g, 'Battery capacity')
    .replace(/Bildschirmgröße/g, 'Bildschirmgröße')  // not translated
    .replace(/Bildschirmdiagonale/g, 'Bildschirmdiagonale')
    .replace(/Bildwiederholrate/g, 'Bildwiederholrate')
    .replace(/Aktualisierungsrate/g, 'Aktualisierungsrate')
    .replace(/Reaktionszeit/g, 'Reaktionszeit')
    .replace(/Annäherungssensor/g, 'Annäherungssensor')
    .replace(/Lichtsensor/g, 'Lichtsensor')
    .replace(/Beschleunigungssensor/g, 'Beschleunigungssensor')
    .replace(/Höhenmesser/g, 'Höhenmesser')
    .replace(/Geräuschunterdrückung/g, 'Geräuschunterdrückung')
    .replace(/Stromverbrauch/g, 'Stromverbrauch')
    .replace(/Akkulaufzeit/g, 'Akkulaufzeit')
    .replace(/Schnellladen/g, 'Schnellladen')
    .replace(/Kabelloses Laden/g, 'Kabelloses Laden')
    .replace(/Schnittstellen/g, 'Schnittstellen')
    .replace(/Anschlüsse/g, 'Anschlüsse')
    .replace(/Arbeitsspeicher/g, 'Arbeitsspeicher')
    .replace(/Gerätespeicher/g, 'Gerätespeicher')
    .replace(/Gehäusematerial/g, 'Gehäusematerial')
    .replace(/Tastatur/g, 'Tastatur')
    .replace(/Helligkeit/g, 'Helligkeit')
    .replace(/Auflösung/g, 'Auflösung')
    .replace(/Schlafüberwachung/g, 'Schlafüberwac')   // truncated
    .replace(/Pulsmessung/g, 'Pulsmessung')
    .replace(/Wasserdicht/g, 'Wasserdicht')
    .replace(/Sensoren/g, 'Sensoren')
    .replace(/Messfunktionen/g, 'Messfunktionen')
    .replace(/Gewicht/g, 'Gewicht')
    .replace(/Abmessungen/g, 'Abmessungen')
    .replace(/Höhe/g, 'Höhe')
    .replace(/Speicher/g, 'Speicher')
    .replace(/Speichertyp/g, 'Speichertyp')
    .replace(/Kühlung/g, 'Kühlung')
    .replace(/Kerne/g, 'Kerne')
    .replace(/Threads/g, 'Threads')
    .replace(/Taktfrequenz/g, 'Taktfrequenz')
    .replace(/Boost-Takt/g, 'Boost-Takt')
    .replace(/Cache/g, 'Cache')
    .replace(/Fertigung/g, 'Fertigung')
    .replace(/Panel/g, 'Panel')
    .replace(/Bluetooth-Version/g, 'Bluetooth-Version')
    .replace(/Bauform/g, 'Bauform')
    .replace(/Stunden/g, 'hours')
    .replace(/Minuten/g, 'minutes')
    .replace(/Tage/g, 'days')
    .replace(/Zoll/g, 'inch')
    .replace(/Ja/g, 'Yes').replace(/Nein/g, 'No')
    .replace(/zertifiziert/g, 'zertifiziert');
}

let totalProducts = 0;
let totalBadStrings = 0;

for (const sc of SCENARIOS) {
  totalProducts++;
  const product = {
    source: 'geizhals',
    sourceUrl: 'https://geizhals.eu/' + sc.name.toLowerCase().replace(/\s+/g, '-') + '.html',
    name: sc.name,
    specs: {},
    specSections: { 'Hauptmerkmale': {} },
    specsEn: {},
    keySpecs: {},
    multiLangSpecs: { en: {}, de: {} },
    multiLangSections: { en: {}, de: {} },
    nameTranslated: { en: sc.name, de: sc.name },
  };

  for (const [k, v] of Object.entries(sc.sourceSpec)) {
    product.specs[k] = v;
    product.specSections['Hauptmerkmale'][k] = v;
    const enK = fakeArgosTranslate(k);
    const enV = fakeArgosTranslate(v);
    product.specsEn[enK] = enV;
    product.multiLangSpecs.en[k] = enV;
    product.multiLangSpecs.en[enK] = enV;
  }

  try { _sanitizeGermanEnglishPayload(product); }
  catch (e) { console.log('  Sanitizer threw for ' + sc.name + ': ' + e.message); }

  const residues = _germanEnglishPayloadResidues(product);
  if (residues.length) {
    totalBadStrings += residues.length;
    console.log('FAIL ' + sc.name.padEnd(30) + ' -> ' + residues.length + ' bad strings:');
    for (const r of residues.slice(0, 5)) {
      console.log('     ' + r.path + ': ' + r.value.slice(0, 80));
    }
  } else {
    console.log('OK   ' + sc.name.padEnd(30) + ' -> clean');
  }
}

console.log('');
console.log('=== GEIZHALS TEST SUMMARY ===');
console.log('Products: ' + totalProducts);
console.log('Total bad strings: ' + totalBadStrings);
if (totalBadStrings === 0) console.log('SUCCESS: 0 leaks across 10 Geizhals products');
else console.log('FAIL: ' + totalBadStrings + ' leaks remain');
