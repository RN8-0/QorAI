const trMap = { ı: 'i', İ: 'i', ç: 'c', ğ: 'g', ö: 'o', ş: 's', ü: 'u' };
const deMap = { ä: 'a', ö: 'o', ü: 'u', ß: 'ss' };

// `normSpec` ve `canonicalSpecKey` bir ürün sayfasında yüzlerce kez, üstelik
// AYNI girdilerle çağrılıyor (her spec × her alias × her render). Ölçümde
// containsWord 263 ms, normSpec 92 ms, canonicalSpecKey 66 ms self-time
// gösterdi (4x CPU kısıtlı mobil). İkisi de saf → ezberlenir.
const _normCache = new Map();
const _keyCache = new Map();
const _CACHE_MAX = 4000;

export function normSpec(text) {
  if (typeof text === 'string' && text.length <= 200) {
    const hit = _normCache.get(text);
    if (hit !== undefined) return hit;
    const out = normSpecUncached(text);
    if (_normCache.size >= _CACHE_MAX) _normCache.clear();
    _normCache.set(text, out);
    return out;
  }
  return normSpecUncached(text);
}

function normSpecUncached(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[ıİçğöşü]/g, (c) => trMap[c] || c)
    .replace(/[äöüß]/g, (c) => deMap[c] || c)
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const sectionRules = [
  ['Display', ['display', 'screen', 'ekran', 'anzeige', 'bildschirm', 'diagonale', 'auflosung']],
  ['Battery', ['battery', 'batarya', 'pil', 'akku', 'akkulaufzeit', 'akkukapazitat', 'charging', 'laden', 'schnellladen', 'sarj']],
  ['Camera', ['camera', 'kamera', 'photo', 'foto', 'video', 'kamera hinten', 'kamera vorne', 'hauptkamera', 'frontkamera']],
  ['Performance', ['processor', 'cpu', 'prozessor', 'islemci', 'chipset', 'yonga', 'gpu', 'graphics', 'grafik', 'leistung']],
  ['Memory and storage', ['memory', 'ram', 'arbeitsspeicher', 'bellek', 'storage', 'speicher', 'speicherplatz', 'depolama', 'ssd', 'hdd']],
  ['Connectivity', ['wi fi', 'wifi', 'wlan', 'bluetooth', 'network', 'netzwerk', 'anschluss', 'anschlusse', 'baglanti', 'usb', 'nfc', 'sim', '5g', '4g']],
  ['Design', ['design', 'tasarim', 'body', 'gehaeuse', 'gehause', 'dimension', 'abmessungen', 'masse', 'maße', 'weight', 'gewicht', 'agirlik', 'thickness', 'dicke', 'kalinlik']],
  ['Audio', ['audio', 'sound', 'speaker', 'lautsprecher', 'ses', 'hoparlor']],
  ['Software', ['software', 'operating system', 'betriebssystem', 'isletim', 'os', 'windows', 'android', 'ios']],
  ['Sensors', ['sensor', 'sensoren', 'fingerprint', 'fingerabdruck', 'gps', 'gyro']],
  ['General', ['general', 'allgemein', 'genel', 'basic', 'temel', 'highlight', 'one cikan']],
];

const keyRules = [
  ['Battery capacity', ['battery capacity', 'battery capacity typical', 'battery capacity mah', 'batarya kapasitesi', 'pil kapasitesi', 'akkukapazitat', 'akku kapazitat', 'batteriekapazitat']],
  ['Battery cycle life', ['battery endurance in cycles', 'battery cycle count', 'battery cycles', 'ladezyklen', 'akkuzyklen']],
  ['Charging port', ['charging port', 'charge connector', 'usb connection type', 'usb connector type', 'usb type', 'ladeanschluss', 'anschluss laden', 'usb baglanti tipi']],
  ['Fast charging', ['fast charging', 'fast charge', 'schnellladen', 'schnellladung', 'hizli sarj']],
  ['Fast charging features', ['fast charging features', 'schnellladefunktionen', 'hizli sarj ozellikleri']],
  ['Fast charging power', ['fast charging power max', 'fast charging power', 'charging power', 'ladeleistung', 'max ladeleistung', 'hizli sarj gucu']],
  ['Wireless charging', ['wireless charging', 'kabelloses laden', 'induktives laden', 'kablosuz sarj']],
  ['Removable battery', ['removable battery', 'wechselbarer akku', 'austauschbarer akku', 'degisir batarya']],
  ['Video playback', ['video playback', 'videowiedergabe', 'video oynatma']],
  ['Screen size', ['screen size', 'display size', 'display diagonal', 'screen diagonal', 'bildschirmgroesse', 'bildschirmgrosse', 'bildschirmdiagonale', 'displaygroesse', 'displaygrosse', 'diagonale', 'zoll', 'ekran boyutu']],
  ['Resolution', ['resolution', 'display resolution', 'screen resolution', 'auflosung', 'bildschirmauflosung', 'displayauflosung', 'ekran cozunurlugu']],
  ['Panel type', ['panel type', 'display type', 'screen technology', 'display technology', 'paneltyp', 'display typ', 'bildschirmtechnologie', 'ekran teknolojisi']],
  ['Refresh rate', ['refresh rate', 'screen refresh rate', 'bildwiederholrate', 'bildwiederholfrequenz', 'aktualisierungsrate', 'yenileme hizi']],
  ['Pixel density', ['pixel density', 'pixeldichte', 'ppi', 'piksel yogunlugu']],
  ['Brightness', ['brightness', 'screen brightness', 'helligkeit', 'bildschirmhelligkeit', 'displayhelligkeit', 'parlaklik']],
  ['Processor', ['processor', 'processor model', 'cpu', 'cpu model', 'prozessor', 'prozessormodell', 'islemci modeli', 'ana islemci']],
  ['Processor family', ['processor family', 'cpu family', 'prozessorfamilie', 'cpu familie', 'islemci ailesi']],
  ['CPU cores', ['processor cores', 'cpu cores', 'core count', 'number of cores', 'kerne', 'cpu kerne', 'anzahl kerne', 'cekirdek sayisi']],
  ['CPU frequency', ['processor frequency', 'cpu frequency', 'base frequency', 'taktfrequenz', 'prozessortakt', 'cpu takt']],
  ['Chipset', ['chipset', 'soc', 'yonga seti']],
  ['GPU', ['gpu', 'graphics processor', 'graphics card', 'gpu model', 'grafikprozessor', 'ekran karti']],
  ['RAM', ['ram', 'memory ram', 'internal memory', 'arbeitsspeicher', 'hauptspeicher', 'bellek ram', 'memory capacity']],
  ['RAM type', ['ram type', 'memory type', 'internal memory type', 'speichertyp ram']],
  // NOTE: 'flash speicher' removed — the camera "Flash" spec (value "LED")
  // word-matched it and rendered as "Storage"/"Depolama: LED".
  ['Storage', ['storage', 'internal storage', 'total storage capacity', 'interner speicher', 'speicherplatz', 'gesamtspeicher', 'ssd', 'sabit disk ssd boyutu', 'dahili hafiza', 'dahili depolama']],
  ['Storage type', ['storage media', 'storage type', 'disk type', 'speicherart']],
  ['Main camera', ['main camera', 'main camera resolution', 'rear camera', 'camera resolution', 'kamera hinten', 'ruckkamera', 'rueckkamera', 'hauptkamera', 'arka kamera', 'ana kamera']],
  ['Front camera', ['front camera', 'front camera resolution', 'selfie camera', 'kamera vorne', 'frontkamera', 'selfie kamera', 'on kamera']],
  ['Camera aperture', ['aperture', 'main camera aperture', 'blende', 'diyafram acikligi']],
  ['Video recording', ['video recording', 'video resolution', 'videoaufnahme', 'videoaufzeichnung', 'video kayit']],
  ['Wi-Fi', ['wi fi', 'wi fi standards', 'wifi', 'wireless', 'wlan', 'kablosuz baglanti']],
  ['Bluetooth', ['bluetooth', 'bluetooth version']],
  ['NFC', ['nfc']],
  // 4G BEFORE 5G: "4.5G Desteği" normalizes to "4 5g destegi" and would
  // otherwise match the 5G alias "5g destegi" → 4.5G and 5G collapsed into one
  // "5G" row, merging a Var with a Yok ("5G: Var, Yok"). Matching 4G first via
  // "4 5g" keeps them separate.
  ['4G', ['4g', 'lte', '4g lte', '4 5g', '4 5g destegi', '4 5g support']],
  ['5G', ['5g', '5g support', '5g destegi']],
  ['SIM', ['sim', 'sim type', 'sim card type', 'line count', 'hat sayisi']],
  ['USB', ['usb', 'usb version', 'usb versiyonu']],
  ['Operating system', ['operating system', 'os', 'betriebssystem', 'isletim sistemi', 'software']],
  ['Weight', ['weight', 'gewicht', 'agirlik']],
  ['Dimensions', ['dimensions', 'dimension', 'abmessungen', 'masse', 'maße', 'boyutlar']],
  ['Thickness', ['thickness', 'dicke', 'tiefe', 'kalinlik']],
  ['Width', ['width', 'breite', 'en']],
  ['Height', ['height', 'hohe', 'höhe', 'boy', 'length']],
  ['Water resistance', ['water resistance', 'waterproof', 'wasserdicht', 'schutzart', 'ip zertifizierung', 'suya dayaniklilik']],
  ['Color', ['color', 'colour', 'farbe', 'color options', 'renk', 'renk secenekleri']],
  ['Sensors', ['sensors', 'sensoren', 'sensorler']],
  ['Speakers', ['speakers', 'speaker features', 'lautsprecher', 'hoparlor']],
];

const exact = new Map(keyRules.flatMap(([canonical, aliases]) => aliases.map((a) => [normSpec(a), canonical])));

// Aliases are static, but canonicalSpecKey used to re-run normSpec() on every one
// of them for every spec it looked up — thousands of regex passes per product.
// Pre-normalise once (dropping the ≤3-char aliases the matcher skips anyway) so
// the hot loop just compares strings. This alone turns canonicalSpecKey (and thus
// the card key-specs / compare table it feeds) from ~18 ms/product into ~2 ms.
const keyRulesNorm = keyRules.map(([canonical, aliases]) => [
  canonical,
  aliases.map((a) => normSpec(a)).filter((a) => a.length > 3),
]);

// Whole-word containment so short keys can't false-match inside longer aliases.
// Without this, "flaş" (normSpec "flas") matched Storage's alias "flash
// speicher" via `alias.includes(key)` → camera Flash rendered as "Storage".
// The compiled RegExp is cached per needle — building a fresh one on every call
// (dozens of aliases × every spec) was a big chunk of the canonicalisation cost.
const wordReCache = new Map();
function wordRe(needle) {
  let re = wordReCache.get(needle);
  if (!re) {
    re = new RegExp(`(^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`);
    wordReCache.set(needle, re);
  }
  return re;
}
function containsWord(haystack, needle) {
  if (!needle || !haystack) return false;
  return wordRe(needle).test(haystack);
}

function cleanValue(value) {
  return String(value == null ? '' : value).replace(/\r/g, '\n').split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

function mergeValue(a, b) {
  const left = cleanValue(a);
  const right = cleanValue(b);
  if (!left) return right;
  if (!right || normSpec(left) === normSpec(right)) return left;
  if (normSpec(left).includes(normSpec(right))) return left;
  if (normSpec(right).includes(normSpec(left))) return right;
  const lines = left.split('\n');
  right.split('\n').forEach((line) => {
    if (!lines.some((x) => normSpec(x) === normSpec(line))) lines.push(line);
  });
  return lines.join('\n');
}

export function canonicalSpecKey(key, value = '') {
  const ck = typeof key === 'string' && key.length <= 200 && typeof value === 'string' && value.length <= 200
    ? `${key} ${value}`
    : null;
  if (ck !== null) {
    const hit = _keyCache.get(ck);
    if (hit !== undefined) return hit;
    const out = canonicalSpecKeyUncached(key, value);
    if (_keyCache.size >= _CACHE_MAX) _keyCache.clear();
    _keyCache.set(ck, out);
    return out;
  }
  return canonicalSpecKeyUncached(key, value);
}

function canonicalSpecKeyUncached(key, value = '') {
  const k = normSpec(key);
  const v = normSpec(value);
  if (!k) return 'Specification';
  if (k.includes('required charging power') || k.includes('charging power')) return 'Fast charging power';
  if (k.includes('usb type c charging port') && /^(yes|no|var|yok|true|false)$/i.test(String(value || '').trim())) {
    return 'USB-C charging';
  }
  if (exact.has(k)) return exact.get(k);
  if (k === 'charging' || k === 'charge') {
    return /\b(usb|type c|typec|lightning|micro usb)\b/.test(v) ? 'Charging port' : 'Charging';
  }
  for (const [canonical, aliases] of keyRulesNorm) {
    // aliases are pre-normalised (see keyRulesNorm). Word-boundary match both ways
    // (alias as whole-word in key, or a generic key as whole-word in alias) —
    // never a raw substring, which mis-mapped "flas"⊂"flash speicher", "en"⊂
    // "breite en", etc.
    if (aliases.some((a) => k === a || containsWord(k, a) || (k.length >= 4 && containsWord(a, k)))) {
      return canonical;
    }
  }
  return String(key || '').replace(/:$/, '').replace(/\s+/g, ' ').trim();
}

export function canonicalSpecSection(section, key = '') {
  const hay = `${normSpec(section)} ${normSpec(key)}`;
  for (const [canonical, needles] of sectionRules) {
    if (needles.some((needle) => hay.includes(needle))) return canonical;
  }
  return String(section || 'General').replace(/:$/, '').replace(/\s+/g, ' ').trim() || 'General';
}

// Per-product memo: canonicalising a full spec map is the single most expensive
// thing the card/compare rendering does, and the same product object is asked for
// its specs many times (every card re-render, the compare table, the detail page).
// Products are immutable within a session and enrichment hands back a NEW object
// when specs change, so a WeakMap keyed by the product object is always correct.
const canonCache = new WeakMap();

export function canonicalizeSpecMaps(product = {}) {
  const cacheable = product && typeof product === 'object';
  if (cacheable) {
    const hit = canonCache.get(product);
    if (hit) return hit;
  }
  const specs = {};
  const specSections = {};
  const add = (section, key, value) => {
    const v = cleanValue(value);
    if (!v || v === '?' || v.toLowerCase() === 'null') return;
    const k = canonicalSpecKey(key, v);
    const s = canonicalSpecSection(section, k);
    specs[k] = mergeValue(specs[k], v);
    specSections[s] = specSections[s] || {};
    specSections[s][k] = mergeValue(specSections[s][k], v);
  };
  Object.entries(product.specSections || {}).forEach(([section, body]) => {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      Object.entries(body).forEach(([key, value]) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          Object.entries(value).forEach(([subKey, subValue]) => add(section, subKey, subValue));
        } else {
          add(section, key, value);
        }
      });
    }
  });
  Object.entries(product.specsEn || product.specs || {}).forEach(([key, value]) => {
    const v = cleanValue(value);
    if (!v || v === '?' || v.toLowerCase() === 'null') return;
    const k = canonicalSpecKey(key, v);
    if (Object.prototype.hasOwnProperty.call(specs, k)) {
      specs[k] = mergeValue(specs[k], v);
    } else {
      add('General', key, value);
    }
  });
  const keySpecs = {};
  Object.entries(product.keySpecs || {}).forEach(([key, value]) => {
    const v = cleanValue(value);
    if (!v) return;
    const k = canonicalSpecKey(key, v);
    keySpecs[k] = mergeValue(keySpecs[k], v);
  });
  const result = { specs, specSections, keySpecs };
  if (cacheable) canonCache.set(product, result);
  return result;
}
