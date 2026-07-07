// ─────────────────────────────────────────────────────────────────────────
//  Qor AI — kategori-farkında fiyat mantık kontrolü.
//  Amaç: pahalı bir ürünün fiyat alanına AKSESUAR fiyatının sızmasını önlemek
//  (ör. Google Pixel 10 Pro TR'de satılmıyor → TR Amazon araması bir kılıfı
//  ₺199.98'e eşleyip telefonun fiyatı yapmıştı). Yalnızca pahalı kategorilere
//  taban uygular; ucuz/aksesuar kategorilerinde YOK (yanlış pozitif riski).
//  Tabanlar bilinçli olarak DÜŞÜK: gerçek bütçe ürünlerini elemez, yalnızca
//  aksesuar-fiyatı ($1–20) türü açık uyumsuzlukları yakalar.
// ─────────────────────────────────────────────────────────────────────────

// Minimum makul fiyat (USD), kategori bazında. Listede olmayan kategori → taban yok.
const CATEGORY_MIN_USD = Object.freeze({
  smartphones: 45,
  laptops: 120,
  tablets: 40,
  desktops: 120,
  monitors: 35,
  tvs: 60,
  gaming_consoles: 80,
  cameras: 60,
  camera_lenses: 45,
  gpus: 60,
  cpus: 35,
  av_receivers: 50,
  drones: 45,
  smartwatches: 25,
  e_readers: 30,
  '3d_printers': 90,
});

// Ülke kodu → para birimi (prices map anahtarları ülke, tutar o ülkenin birimi).
const COUNTRY_CURRENCY = Object.freeze({
  TR: 'TRY', DE: 'EUR', AT: 'EUR', NL: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR',
  BE: 'EUR', PT: 'EUR', GB: 'GBP', UK: 'GBP', US: 'USD', CA: 'CAD', BR: 'BRL',
  RU: 'RUB', MX: 'MXN',
});

function normCat(c) {
  return String(c || '').trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/_+/g, '_');
}

// Kategorinin USD tabanı (yoksa 0 = kontrol yok).
function categoryMinUsd(category) {
  const c = normCat(category);
  if (!c) return 0;
  if (CATEGORY_MIN_USD[c] != null) return CATEGORY_MIN_USD[c];
  // esnek: "smartphone" ↔ "smartphones" gibi kısmi eşleşme
  for (const k of Object.keys(CATEGORY_MIN_USD)) {
    if (c === k || c.includes(k) || k.includes(c)) return CATEGORY_MIN_USD[k];
  }
  return 0;
}

// Zaten USD olan bir teklif fiyatı bu kategori için makul mü?
// usd=0 (dönüştürülemeyen) → reddetme (muhafazakâr).
function isPlausibleUsd(category, usd) {
  const floor = categoryMinUsd(category);
  return !(floor > 0 && Number(usd) > 0 && Number(usd) < floor);
}

// Yerel para biriminde (ülke bazlı) bir fiyat makul mü? fxToUsd: {CUR: rate}.
function isPlausibleLocalPrice(category, amount, country, fxToUsd) {
  const floor = categoryMinUsd(category);
  const amt = Number(amount);
  if (!(floor > 0) || !(amt > 0)) return true;
  const cur = COUNTRY_CURRENCY[String(country || '').toUpperCase()];
  const rate = fxToUsd && cur ? fxToUsd[cur] : 0;
  if (!(rate > 0)) return true; // dönüştüremiyorsak reddetme
  return amt * rate >= floor;
}

module.exports = {
  CATEGORY_MIN_USD,
  COUNTRY_CURRENCY,
  categoryMinUsd,
  isPlausibleUsd,
  isPlausibleLocalPrice,
};
