// END-TO-END test simulating the REAL save path
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

const src = fs.readFileSync(path.join(__dirname, '..', 'admin', 'js', 'scraper.js'), 'utf8');
const helpersStart = src.indexOf('function _uniqueSpecKey');
const sanitizerEnd = src.indexOf('function _deDictLookup');
eval(src.slice(helpersStart, sanitizerEnd));

const SCENARIOS = [
  {
    cat: 'smartphone', name: 'iPhone 12 Pro Max',
    sourceSpec: {
      'Ön Kamera Özellikleri': 'Portre modu, HDR, Yüz tanıma',
      'Çentikli Ekran': 'Var',
      'Eyesafe (göz sağlığı sertifikası)': 'Mevcut',
      'İşlemci': 'Apple A14 Bionic',
      'Pil Ömrü': '20 saat',
      'Aydınlatmalı Klavye': 'Yok',
      'Çıkarılabilir Pil': 'Hayır',
      'Şarj Hızı': '20W',
      'Bellek Boyutu': '6 GB',
      'Depolama Türü': 'NVMe',
      'Renkli Ekran': 'OLED',
      'Pusula': 'Var',
      'İvmeölçer': 'Var',
      'Yüksekliği': '160 mm',
      'Genişliği': '78 mm',
    },
  },
  {
    cat: 'laptop', name: 'Lenovo ThinkBook 16p G6',
    sourceSpec: {
      'İşlemci Çekirdek Sayısı': '24',
      'Verimlilik Çekirdek Frekansı': '2.10 GHz',
      'Klavye Arka Aydınlatması': 'Var',
      'Sanal Çekirdek Sayısı': '24',
      'Transistör Mesafesi': '3 nm',
      'Dahili Grafik Maksimum Frekansı': '1.9 GHz',
      'Sabit Disk (SSD) Tipi': 'NVMe M.2',
      'Arttırılmış Bellek': 'Var',
      'GPU Markası': 'NVIDIA',
      'İşlemci Markası': 'Intel',
      'Ürün Tipi': 'Laptop',
      'Çıkış Yılı': '2025',
      'Pil Gücü': '85 Wh',
      'Eyesafe (göz sağlığı sertifikası)': 'Var',
    },
  },
  {
    cat: 'monitor', name: 'Philips Evnia',
    sourceSpec: {
      'Panel Türü': 'WVA',
      'Tepki Süresi': '1 ms',
      'Yenileme Hızı': '300 Hz',
      'Görüş Açısı': '178 derece',
      'Parlaklık': '500 nit',
      'Kavisli': 'Var',
      'Yansımasız Mat Ekran': 'Var',
    },
  },
  {
    cat: 'headphones', name: 'Razer Barracuda X',
    sourceSpec: {
      'Aktif Gürültü Engelleme': 'Yok',
      'Sürücü Boyutu': '40 mm',
      'Empedans': '32 Ohm',
      'Frekans Tepkisi': '20Hz-20kHz',
      'Mikrofon Hassasiyeti': '-42 dB',
      'Kablosuz Şarj': 'Yok',
    },
  },
  {
    cat: 'gpu', name: 'NVIDIA RTX 5090',
    sourceSpec: {
      'Çekirdek Sayısı': '21760 CUDA',
      'Bellek Tipi': 'GDDR7',
      'Bellek Genişliği': '512 bit',
      'Güç Tüketimi': '575 W',
      'Üretim Teknolojisi': '4nm',
      'Çıkış Yılı': '2025',
      'GPU Markası': 'NVIDIA',
    },
  },
  {
    cat: 'cpu', name: 'AMD Ryzen 9950X',
    sourceSpec: {
      'Çekirdek Sayısı': '16',
      'İş Parçacığı Sayısı': '32',
      'Ön Bellek': '64 MB',
      'Üretim Teknolojisi': '4nm',
      'Termal Tasarım Gücü': '170 W',
      'İşlemci Markası': 'AMD',
      'Çıkış Yılı': '2024',
    },
  },
  {
    cat: 'router', name: 'TP-Link Archer BE230',
    sourceSpec: {
      'Wi-Fi Standartı': 'Wi-Fi 7',
      'Bant Sayısı': '3',
      'Çift Bant Desteği': 'Var',
      'Toplam Hız': '11000 Mbps',
      'LAN Hızı': '2.5 Gbps',
      'USB Bağlantısı': 'USB 3.0',
    },
  },
  {
    cat: 'tv', name: 'Samsung QN990F',
    sourceSpec: {
      'Ekran Boyutu': '98 inç',
      'Çözünürlük': '8K',
      'Yenileme Hızı': '240 Hz',
      'HDR Desteği': 'HDR10+',
      'Akıllı TV Özellikleri': 'Tizen',
      'Ses Çıkış Gücü': '70 W',
    },
  },
  {
    cat: 'smartwatch', name: 'Huawei Watch GT 6 Pro',
    sourceSpec: {
      'Ekran Tipi': 'AMOLED',
      'Kalp Atış Hızı Sensörü': 'Var',
      'Kan Oksijen Seviyesi': 'Var',
      'Adım Sayar': 'Var',
      'Uyku Takibi': 'Var',
      'Su Geçirmezlik': '5ATM',
      'Pil Ömrü': '14 gün',
      'Şarj Hızı': '15 W',
    },
  },
  {
    cat: 'tablet', name: 'Apple iPad Pro 13 M5',
    sourceSpec: {
      'İşlemci': 'Apple M5',
      'Ekran Boyutu': '13 inç',
      'Çözünürlük': '2752x2064',
      'Bellek Boyutu': '16 GB',
      'Depolama Türü': 'NVMe',
      'Ön Kamera': '12 MP',
      'Arka Kamera': '12 MP',
      'Kalem Desteği': 'Apple Pencil Pro',
      'Çıkış Yılı': '2025',
    },
  },
];

function fakeArgosTranslate(trText) {
  return String(trText)
    .replace(/Kamera Özellikleri/g, 'Camera Specifications')
    .replace(/Çekirdek Sayısı/g, 'Cekirdek Sayisi')
    .replace(/Verimlilik Çekirdek Frekansı/g, 'Productivity check.turbo frequency')
    .replace(/Klavye Arka Aydınlatması/g, 'Keyboard back lighting')
    .replace(/Sanal Çekirdek/g, 'Virtual core')
    .replace(/Transistör Mesafesi/g, 'Transistor distance')
    .replace(/Dahili Grafik/g, 'Built-in graphic')
    .replace(/Sabit Disk \(SSD\) Tipi/g, 'Hard disk (SSD) type')
    .replace(/Arttırılmış Bellek/g, 'Increased memory')
    .replace(/Eyesafe \(göz sağlığı sertifikası\)/g, 'Eyesafe (eye Sağlığı Sertifikasyonu)')
    .replace(/Li-Po \(lityum-polimer\)/g, 'Li-Po (lithium-Polimer)')
    .replace(/Çentikli Ekran/g, 'Çentikli (Notch)')
    .replace(/Ön Kamera/g, 'Ön Camera')
    .replace(/Arka Kamera/g, 'Arka Camera')
    .replace(/Pusula/g, 'Checkout')
    .replace(/İvmeölçer/g, 'Ivmeölç')
    .replace(/Çıkarılabilir Pil/g, 'Bulk battery')
    .replace(/Çıkış Yılı/g, 'Output year')
    .replace(/Markası/g, 'brand')
    .replace(/Çıkış/g, 'output')
    .replace(/Yılı/g, 'year')
    .replace(/Bellek Boyutu/g, 'Bellek Boyutu')
    .replace(/Depolama Türü/g, 'Depolama Type')
    .replace(/Renkli Ekran/g, 'Color display')
    .replace(/Tepki Süresi/g, 'Response Time')
    .replace(/Yenileme Hızı/g, 'Refresh rate')
    .replace(/Aydınlatmalı Klavye/g, 'Aydınlatmalı Keyboard')
    .replace(/Şarj Hızı/g, 'Charging speed')
    .replace(/NVIDIA/g, 'North')
    .replace(/Intel/g, 'Main')
    .replace(/Yüksekliği/g, 'Height')
    .replace(/Genişliği/g, 'Width')
    .replace(/Pil Ömrü/g, 'Battery Life')
    .replace(/Pil Gücü/g, 'Battery Power')
    .replace(/İşlemci Çekirdek Sayısı/g, 'Processor Cekirdek Sayisi')
    .replace(/İşlemci Markası/g, 'Processor brand')
    .replace(/GPU Markası/g, 'GPU brand')
    .replace(/Ürün Tipi/g, 'Product Type')
    .replace(/Görüş Açısı/g, 'Goruş Acisi')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u');
}

let totalProducts = 0;
let totalBadStrings = 0;

for (const sc of SCENARIOS) {
  totalProducts++;
  const product = {
    source: 'epey',
    sourceUrl: 'https://www.epey.com/' + sc.cat + '/' + sc.name.toLowerCase().replace(/\s+/g, '-') + '.html',
    name: sc.name,
    specs: {},
    specSections: { 'Main': {} },
    specsEn: {},
    keySpecs: {},
    multiLangSpecs: { en: {}, tr: {} },
    multiLangSections: { en: {}, tr: {} },
    nameTranslated: { en: sc.name, tr: sc.name },
  };

  for (const [k, v] of Object.entries(sc.sourceSpec)) {
    product.specs[k] = v;
    product.specSections['Main'][k] = v;
    const enK = fakeArgosTranslate(k);
    const enV = fakeArgosTranslate(v);
    product.specsEn[enK] = enV;
    product.multiLangSpecs.en[k] = enV;
    product.multiLangSpecs.en[enK] = enV;
  }

  try { _sanitizeEnglishPayload(product); }
  catch (e) { console.log('  Sanitizer threw for ' + sc.name + ': ' + e.message); }

  const residues = _englishPayloadResidues(product);
  if (residues.length) {
    totalBadStrings += residues.length;
    console.log('FAIL ' + sc.cat.padEnd(12) + ' ' + sc.name.padEnd(30) + ' -> ' + residues.length + ' bad strings:');
    for (const r of residues.slice(0, 5)) {
      console.log('     ' + r.path + ': ' + r.value.slice(0, 80));
    }
  } else {
    console.log('OK   ' + sc.cat.padEnd(12) + ' ' + sc.name.padEnd(30) + ' -> clean');
  }
}

console.log('');
console.log('=== EPEY TEST SUMMARY ===');
console.log('Products: ' + totalProducts);
console.log('Total bad strings: ' + totalBadStrings);
if (totalBadStrings === 0) console.log('SUCCESS: 0 leaks across 10 Epey products');
else console.log('FAIL: ' + totalBadStrings + ' leaks remain');
