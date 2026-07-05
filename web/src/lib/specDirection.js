// ─────────────────────────────────────────────────────────────────────────
//  Spec Direction & Component Ranking — faithful JS port of the mobile app's
//  lib/services/spec_direction_service.dart so the web compare table highlights
//  the SAME "better" value the app does.
//
//  Decides, per spec row, which product value wins:
//    1. Boolean specs        (Yes/Var/Evet/Ja … > No/Yok/Hayır …)
//    2. Qualitative quality   (OLED>IPS>LCD>TN, NVMe>UFS>eMMC>HDD,
//                              Wi-Fi 7>6E>6>5, LDAC>aptX>AAC>SBC, ANC>passive)
//    3. Component ranking      (CPU/GPU model tables, e.g. M3 > M2, RTX 5090 …)
//    4. Numeric (unit-aware)   (GB/TB, kg/g/lb, resolution, frequency range) +
//                              direction (higher/lower/neutral)
//
//  NOTE: the app also layers admin-editable PocketBase `spec_directions`
//  overrides on top of this static base. Those are an optional extra; the
//  deterministic base map + heuristics below is the shared algorithm.
// ─────────────────────────────────────────────────────────────────────────

// Keys are normalized to lowercase ascii with single spaces (see normKey).
const STATIC_DIRECTIONS = {
  // ─ Processor / CPU
  'cpu frequency': 'higher',
  'cpu core': 'higher',
  'processor cores': 'higher',
  'thread count': 'higher',
  cache: 'higher',
  'passmark score': 'higher',
  cinebench: 'higher',
  geekbench: 'higher',
  antutu: 'higher',
  'cpu manufacturing technology': 'lower', // smaller nm = better
  'manufacturing technology': 'lower',
  'process node': 'lower',
  tdp: 'lower',

  // ─ Memory
  'memory ram': 'higher',
  ram: 'higher',
  'internal storage': 'higher',
  'storage capacity': 'higher',
  'memory bandwidth': 'higher',
  'memory speed': 'higher',
  'memory clock': 'higher',
  'cache size': 'higher',
  vram: 'higher',
  'video memory': 'higher',

  // ─ Display
  'screen size': 'higher',
  'pixel density': 'higher',
  'screen refresh rate': 'higher',
  'refresh rate': 'higher',
  brightness: 'higher',
  'color count': 'higher',
  'color accuracy': 'higher',
  'screen area': 'higher',
  'screen to body ratio': 'higher',
  'response time': 'lower',
  'input lag': 'lower',

  // ─ Battery
  'battery capacity': 'higher',
  'battery capacity typical': 'higher',
  'video playback': 'higher',
  'music playback': 'higher',
  'battery life': 'higher',
  'fast charging power max': 'higher',
  'charging power': 'higher',
  'wireless charging power': 'higher',
  'removable battery': 'neutral',

  // ─ Camera
  'camera resolution': 'higher',
  'second rear camera resolution': 'higher',
  'third rear camera resolution': 'higher',
  'front camera resolution': 'higher',
  aperture: 'lower', // lower f-number = wider aperture = better
  'second rear camera aperture': 'lower',
  'third rear camera aperture': 'lower',
  'front camera aperture': 'lower',
  'camera sensor size': 'neutral',
  'video fps value': 'higher',
  'front camera fps value': 'higher',
  'video recording': 'higher',
  'video recording resolution': 'higher',
  'video resolution': 'higher',
  'screen resolution': 'higher',
  'display resolution': 'higher',
  dxomark: 'higher',
  'optical zoom': 'higher',
  'digital zoom': 'higher',
  'focal length': 'neutral',

  // ─ GPU / Graphics
  'gpu clock': 'higher',
  'graphics clock': 'higher',
  'shader processors': 'higher',
  'texture units': 'higher',
  'render outputs': 'higher',
  'memory bus': 'higher',
  'memory bandwidth gpu': 'higher',
  tflops: 'higher',
  'shader model': 'higher',
  directx: 'higher',
  opengl: 'higher',

  // ─ Design / Physical
  weight: 'lower',
  height: 'neutral',
  width: 'neutral',
  thickness: 'lower',
  depth: 'lower',

  // ─ Network / Connectivity
  '4g download': 'higher',
  '4g upload': 'higher',
  '5g download': 'higher',
  '5g upload': 'higher',
  'wifi speed': 'higher',
  'bluetooth version': 'higher',
  'bluetooth standard': 'higher',
  bluetooth: 'higher',
  'wi fi standard': 'higher',
  'wifi standard': 'higher',
  'wireless standard': 'higher',
  'usb version': 'higher',
  'usb standard': 'higher',
  'number of lines': 'higher',

  // ─ Safety / SAR — LOWER IS BETTER (radiation exposure)
  'sar value': 'lower',
  'sar value 10g head': 'lower',
  'sar value 10g body': 'lower',
  'sar value 1g head': 'lower',
  'sar value 1g body': 'lower',
  sar: 'lower',

  // ─ Audio
  'frequency response': 'higher',
  sensitivity: 'higher',
  'driver size': 'higher',
  'frequency response low': 'lower',
  'frequency response high': 'higher',
  thd: 'lower', // total harmonic distortion, lower = cleaner
  'noise isolation': 'higher',
  'noise cancellation': 'higher',

  // ─ Power / PSU
  wattage: 'neutral',
  efficiency: 'higher',
  'power consumption': 'lower',
  'idle power': 'lower',
  'load power': 'lower',

  // ─ General scores
  score: 'higher',
  benchmark: 'higher',
  rating: 'higher',
  'release year': 'higher',

  // ─ Price
  price: 'lower',
  msrp: 'lower',

  // ─ Turkish spec labels (the compare table renders LOCALIZED labels).
  diyafram: 'lower', // f-number; lower = wider = better
  agirlik: 'lower',
  kalinlik: 'lower',
  'kamera sensor boyutu': 'neutral',
  'pil kapasitesi': 'higher',
  'batarya kapasitesi': 'higher',
  'sarj sonrasi pil suresi': 'higher',
  'video oynatma': 'higher',
  'muzik dinleme': 'higher',
  'ekran boyutu': 'higher',
  'piksel yogunlugu': 'higher',
  'ekran yenileme hizi': 'higher',
  'yenileme hizi': 'higher',
  parlaklik: 'higher',
  'ekran alani': 'higher',
  'ekran cozunurlugu': 'higher',
  cozunurluk: 'higher',
  'dahili depolama': 'higher',
  'ram kapasitesi': 'higher',
  'kamera cozunurlugu': 'higher',
  'on kamera cozunurlugu': 'higher',
  'optik zoom': 'higher',
  'dijital zoom': 'higher',
  'sarj gucu': 'higher',
  'hizli sarj gucu': 'higher',
  'kablosuz sarj gucu': 'higher',
  'sar degeri': 'lower',
};

// Score 0-100; higher = better component. Used for string CPU/GPU model values.
const PROCESSOR_RANKINGS = {
  a8: 20, a8x: 22,
  a9: 25, a9x: 27,
  'a10 fusion': 30, 'a10x fusion': 32,
  'a11 bionic': 38,
  'a12 bionic': 44, 'a12x bionic': 46, 'a12z bionic': 47,
  'a13 bionic': 52,
  'a14 bionic': 60,
  'a15 bionic': 70,
  'a16 bionic': 80,
  'a17 pro': 90, 'a17 bionic': 90,
  a18: 95, 'a18 pro': 97,
  'apple m1': 78, 'apple m2': 85, 'apple m3': 92, 'apple m4': 96,
  'snapdragon 660': 30,
  'snapdragon 670': 32,
  'snapdragon 710': 34,
  'snapdragon 720g': 36,
  'snapdragon 730': 35,
  'snapdragon 730g': 37,
  'snapdragon 732g': 38,
  'snapdragon 765g': 42,
  'snapdragon 778g': 50,
  'snapdragon 780g': 52,
  'snapdragon 855': 55,
  'snapdragon 855+': 57,
  'snapdragon 860': 56,
  'snapdragon 865': 62,
  'snapdragon 865+': 64,
  'snapdragon 870': 65,
  'snapdragon 888': 72,
  'snapdragon 888+': 74,
  'snapdragon 8 gen 1': 78,
  'snapdragon 8+ gen 1': 80,
  'snapdragon 8 gen 2': 88,
  'snapdragon 8 gen 3': 94,
  'snapdragon 8 elite': 98,
  'snapdragon 4 gen 1': 28,
  'snapdragon 4 gen 2': 32,
  'snapdragon 6 gen 1': 40,
  'snapdragon 6s gen 3': 38,
  'dimensity 700': 28,
  'dimensity 810': 33,
  'dimensity 900': 40,
  'dimensity 1000': 55,
  'dimensity 1080': 52,
  'dimensity 1100': 58,
  'dimensity 1200': 62,
  'dimensity 1300': 64,
  'dimensity 2000': 75,
  'dimensity 8020': 58,
  'dimensity 8100': 68,
  'dimensity 8200': 72,
  'dimensity 8300': 78,
  'dimensity 9000': 82,
  'dimensity 9200': 88,
  'dimensity 9300': 93,
  'dimensity 9400': 97,
  'exynos 990': 60,
  'exynos 2100': 70,
  'exynos 2200': 75,
  'exynos 2300': 78,
  'exynos 2400': 88,
  'core i3': 35,
  'core i5': 55,
  'core i7': 75,
  'core i9': 90,
  'core ultra 5': 70,
  'core ultra 7': 82,
  'core ultra 9': 92,
  'ryzen 3': 38,
  'ryzen 5': 58,
  'ryzen 7': 78,
  'ryzen 9': 92,
  athlon: 20,
  epyc: 95,
  threadripper: 97,
  m1: 78, 'm1 pro': 83, 'm1 max': 86, 'm1 ultra': 90,
  m2: 85, 'm2 pro': 89, 'm2 max': 92, 'm2 ultra': 95,
  m3: 91, 'm3 pro': 94, 'm3 max': 96, 'm3 ultra': 98,
  m4: 96, 'm4 pro': 98,
};

const GPU_RANKINGS = {
  'rtx 2060': 55,
  'rtx 2070': 62,
  'rtx 2080': 70,
  'rtx 3060': 65,
  'rtx 3070': 75,
  'rtx 3080': 85,
  'rtx 3090': 91,
  'rtx 4060': 72,
  'rtx 4070': 82,
  'rtx 4080': 92,
  'rtx 4090': 99,
  'rtx 5070': 87,
  'rtx 5080': 95,
  'rtx 5090': 100,
  'gtx 1060': 35,
  'gtx 1070': 42,
  'gtx 1080': 50,
  'gtx 1650': 28,
  'gtx 1660': 38,
  'rx 6600': 60,
  'rx 6700': 70,
  'rx 6800': 80,
  'rx 6900': 88,
  'rx 7600': 68,
  'rx 7700': 75,
  'rx 7800': 82,
  'rx 7900': 92,
  'adreno 730': 55,
  'adreno 740': 65,
  'adreno 750': 75,
  'adreno 830': 85,
  'mali-g710': 52,
  'mali-g715': 62,
  'mali-g720': 72,
  'immortalis-g715': 65,
  'immortalis-g720': 75,
  'apple gpu': 70,
  'intel iris xe': 45,
  'intel arc': 60,
};

const RESOLUTION_ALIASES = [
  ['8k', 7680 * 4320],
  ['uhd 8k', 7680 * 4320],
  ['5k', 5120 * 2880],
  ['4k', 3840 * 2160],
  ['uhd', 3840 * 2160],
  ['ultra hd', 3840 * 2160],
  ['qhd', 2560 * 1440],
  ['2k', 2560 * 1440],
  ['wqhd', 2560 * 1440],
  ['fhd+', 2400 * 1080],
  ['fhd', 1920 * 1080],
  ['full hd', 1920 * 1080],
  ['1080p', 1920 * 1080],
  ['hd+', 1600 * 900],
  ['hd', 1280 * 720],
  ['720p', 1280 * 720],
];

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// Mirrors Dart _normalizeKey: lowercase, fold Turkish letters, collapse to
// single-spaced [a-z0-9].
function normKey(key) {
  return String(key == null ? '' : key)
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/\u0307/g, '') // İ.toLowerCase() leaves a combining dot — drop it
    .replace(/[_\-/]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Whole-word containment so "ram" can't match inside "diyafram".
function containsWord(haystack, needle) {
  if (!needle || !haystack) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^| )${escaped}( |$)`).test(haystack);
}

function isMissingSpecValue(value) {
  const t = String(value == null ? '' : value).trim().toLowerCase();
  return (
    t === '' || t === '—' || t === '-' || t === '?' || t === 'null'
    || t === '{}' || t === '[]' || t === 'n/a' || t === 'na'
  );
}

function boolScore(value) {
  const v = String(value == null ? '' : value).trim().toLowerCase();
  if (
    v.startsWith('✓') || v === 'yes' || v === 'var' || v === 'evet'
    || v === 'true' || v === 'available' || v === 'ja' || v === 'oui'
    || v === 'sí' || v === 'si' || v === 'sim' || v === 'tak'
  ) return 1;
  if (
    v.startsWith('✗') || v.startsWith('×') || v === 'no' || v === 'yok'
    || v === 'hayır' || v === 'hayir' || v === 'false' || v === 'not available'
    || v === 'nein' || v === 'non' || v === 'não' || v === 'nao' || v === 'nie'
  ) return 0;
  return null;
}

function scoreWirelessStandard(key, value) {
  const isWireless = key.includes('wifi') || key.includes('wi fi')
    || key.includes('wireless') || key.includes('bluetooth')
    || key.includes('standard') || key.includes('connect') || key.includes('baglanti');
  if (!isWireless) return null;
  if (value.includes('wi fi 7') || value.includes('wifi 7')) return 97;
  if (value.includes('802 11be')) return 97;
  if (value.includes('wi fi 6e') || value.includes('wifi 6e')) return 90;
  if (value.includes('wi fi 6') || value.includes('wifi 6')) return 84;
  if (value.includes('802 11ax')) return 84;
  if (value.includes('wi fi 5') || value.includes('wifi 5')) return 72;
  if (value.includes('802 11ac')) return 72;
  if (value.includes('802 11n')) return 54;
  return null;
}

function scoreAudioCodec(key, value) {
  const isCodec = key.includes('codec') || key.includes('audio')
    || key.includes('ses') || key.includes('bluetooth');
  if (!isCodec) return null;
  if (value.includes('ldac') || value.includes('aptx lossless')) return 96;
  if (value.includes('aptx adaptive')) return 90;
  if (value.includes('aptx hd')) return 84;
  if (value.includes('aptx')) return 76;
  if (value.includes('aac')) return 66;
  if (value.includes('sbc')) return 48;
  return null;
}

function scoreListRichness(key, value) {
  const isRich = key.includes('feature') || key.includes('ozellik')
    || key.includes('profile') || key.includes('codec') || key.includes('sensor')
    || key.includes('port') || key.includes('standard');
  if (!isRich) return null;
  const parts = new Set(
    String(value).split(/[,;/|]\s*|\n+/).map((p) => p.trim()).filter(Boolean),
  );
  return parts.size > 1 ? parts.size : null;
}

// Text-only feature quality (ANC > passive, OLED > LCD, NVMe > SATA/HDD, …).
function scoreQualitativeValue(specKey, value) {
  const key = normKey(specKey);
  const v = normKey(value);
  if (!v) return null;

  const b = boolScore(value);
  if (b !== null) return b;

  const isNoise = key.includes('noise') || key.includes('gurultu')
    || key.includes('cancellation') || key.includes('engelleme') || key.includes('anc');
  if (isNoise) {
    if (v.includes('adaptive') || v.includes('hybrid') || v.includes('active')
      || v.includes('aktif') || v.includes('anc')) return 100;
    if (v.includes('passive') || v.includes('pasif') || v.includes('pnc')) return 45;
    if (v.includes('none') || v.includes('no ') || v.includes('yok')) return 0;
  }

  const isDisplay = key.includes('display') || key.includes('screen')
    || key.includes('ekran') || key.includes('panel');
  if (isDisplay) {
    if (v.includes('micro led')) return 98;
    if (v.includes('mini led')) return 94;
    if (v.includes('oled') || v.includes('amoled')) return 90;
    if (v.includes('ips')) return 66;
    if (v.includes('lcd') || v.includes('led')) return 50;
    if (v.includes('tn')) return 30;
  }

  const isStorage = key.includes('storage') || key.includes('depolama')
    || key.includes('disk') || key.includes('ssd') || key.includes('hdd');
  if (isStorage) {
    if (v.includes('nvme') || v.includes('pcie')) return 95;
    if (v.includes('ufs 4')) return 90;
    if (v.includes('ufs 3')) return 82;
    if (v.includes('ssd')) return 74;
    if (v.includes('ufs')) return 68;
    if (v.includes('emmc')) return 44;
    if (v.includes('hdd')) return 32;
  }

  const wireless = scoreWirelessStandard(key, v);
  if (wireless !== null) return wireless;

  const codec = scoreAudioCodec(key, v);
  if (codec !== null) return codec;

  const list = scoreListRichness(key, value);
  if (list !== null) return list;

  return null;
}

function extractNumber(value) {
  const cleaned = value.replace(/,/g, '.').replace(/[^0-9.]/g, ' ').trim();
  const m = cleaned.match(/\d+\.?\d*/);
  return m ? parseFloat(m[0]) : null;
}

// A value is a single comparable quantity only when it is one line and carries
// at most ONE number (optionally with a unit): "5000 mAh", "120 Hz", "6.9 inch".
// Free-text descriptions ("6x 2.0 GHz ARM Cortex-A55 · Mali-G57 · 2x 2.2 GHz ·
// 64-bit", triple-camera "50 MP + 12 MP + 10 MP") carry several numbers, so the
// old generic extractNumber() grabbed the FIRST one (a core count) and crowned
// the wrong product. Those are rejected here so no bogus winner is declared.
function isSingleQuantity(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return false;
  if (/[\n\r]/.test(raw)) return false;
  const tokens = raw.match(/\d+(?:[.,]\d+)?/g) || [];
  return tokens.length <= 1;
}

function extractResolutionScore(key, value) {
  const looksLikeResolution = key.includes('resolution') || key.includes('cozunurluk')
    || key.includes('video recording') || key.includes('recording')
    || key.includes('display') || key.includes('ekran') || key.includes('screen')
    || /\d+\s*[kp]\b/i.test(value) || /\d{3,5}\s*[x×]\s*\d{3,5}/i.test(value);
  if (!looksLikeResolution) return null;
  const m = value.match(/(\d{3,5})\s*[x×]\s*(\d{3,5})/i);
  if (m) {
    const w = parseFloat(m[1]);
    const h = parseFloat(m[2]);
    if (Number.isFinite(w) && Number.isFinite(h)) return w * h;
  }
  for (const [alias, score] of RESOLUTION_ALIASES) {
    if (value.includes(alias)) return score;
  }
  return null;
}

function extractStorageInGb(key, value) {
  const looksLikeStorage = key.includes('storage') || key.includes('depolama')
    || key.includes('memory') || key.includes('bellek') || key.includes('ram')
    || key.includes('onbellek') || key.includes('cache') || key.includes('vram');
  if (!looksLikeStorage) return null;
  const m = value.match(/(\d+(?:\.\d+)?)\s*(tb|gb|mb)/i);
  if (!m) return null;
  const amount = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (!Number.isFinite(amount)) return null;
  if (unit === 'tb') return amount * 1024;
  if (unit === 'gb') return amount;
  if (unit === 'mb') return amount / 1024;
  return null;
}

function extractWeightInGrams(key, value) {
  if (!key.includes('weight') && !key.includes('agirlik')) return null;
  const m = value.match(/(\d+(?:\.\d+)?)\s*(kg|g|lb|lbs|oz)/i);
  if (!m) return null;
  const amount = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (!Number.isFinite(amount)) return null;
  if (unit === 'kg') return amount * 1000;
  if (unit === 'g') return amount;
  if (unit === 'lb' || unit === 'lbs') return amount * 453.59237;
  if (unit === 'oz') return amount * 28.3495;
  return null;
}

function extractFrequencyRangeScore(key, value) {
  const looksLikeFrequency = key.includes('frequency response')
    || key.includes('frekans tepkisi') || key.includes('frequency range')
    || key.includes('frekans araligi');
  if (!looksLikeFrequency) return null;
  const matches = [...value.matchAll(/(\d+(?:[.,]\d+)?)\s*(hz|khz)?/gi)];
  if (matches.length < 2) return null;
  const asHz = (m) => {
    const amount = parseFloat(m[1].replace(',', '.'));
    if (!Number.isFinite(amount)) return null;
    return (m[2] || '').toLowerCase() === 'khz' ? amount * 1000 : amount;
  };
  const first = asHz(matches[0]);
  const last = asHz(matches[matches.length - 1]);
  if (first == null || last == null || last <= first) return null;
  return last - first;
}

function extractComparableNumber(specKey, value) {
  const key = normKey(specKey);
  const v = String(value).toLowerCase().trim();

  const freq = extractFrequencyRangeScore(key, v);
  if (freq != null) return freq;
  const res = extractResolutionScore(key, v);
  if (res != null) return res;
  const storage = extractStorageInGb(key, v);
  if (storage != null) return storage;
  const weight = extractWeightInGrams(key, v);
  if (weight != null) return weight;
  // The unit-aware extractors above already handled every multi-number pattern
  // we understand (WxH, storage, weight, frequency range). Anything left that
  // still carries several numbers is a free-text spec, not a quantity — do NOT
  // guess a winner from its leading digit.
  if (!isSingleQuantity(v)) return null;
  return extractNumber(v);
}

function lookupRanking(table, value) {
  const v = String(value).toLowerCase().trim();
  if (has(table, v)) return table[v];
  for (const [k, score] of Object.entries(table)) {
    if (v.includes(k) || k.includes(v)) return score;
  }
  return 0;
}

// Returns the index (into `values`) of the best component, or -1 if undecidable.
function compareByComponentRanking(specKey, values) {
  const key = normKey(specKey);
  const isProcessor = key.includes('processor') || key.includes('chipset')
    || key.includes('cpu') || key.includes('chip') || key.includes('soc')
    || key.includes('islemci') || key.includes('yonga') || key.includes('prozessor');
  const isGpu = key.includes('gpu') || key.includes('graphics')
    || key.includes('grafik') || key.includes('ekran karti');
  let table = null;
  if (isProcessor) table = PROCESSOR_RANKINGS;
  if (isGpu) table = GPU_RANKINGS;
  if (!table) return -1;
  const scores = values.map((v) => lookupRanking(table, v));
  // If ANY contender is an unknown model (score 0), the ranking is unreliable:
  // the unknown one could be the fastest (e.g. a brand-new Apple A19 Pro that
  // isn't in the table yet would score 0 and wrongly "lose" to a listed
  // mid-range chip). Refuse to pick a winner rather than crown the wrong one.
  if (scores.some((s) => s === 0)) return -1;
  if (scores.every((s) => s === scores[0])) return -1;
  const maxScore = Math.max(...scores);
  return scores.indexOf(maxScore);
}

function matchesLowerBetter(key) {
  const kws = ['weight', 'agirlik', 'thickness', 'kalinlik', 'price', 'fiyat',
    'watt', 'tdp', 'rms noise', 'noise', 'gurultu', 'latency', 'gecikme',
    'response time', 'tepki', 'heat', 'temperature', 'sicaklik', 'lag',
    'power consumption', 'guc tuketimi', 'idle', 'nm', 'nanometre', 'sar',
    'radiation', 'thd', 'distortion', 'delay'];
  return kws.some((kw) => key.includes(kw));
}

function matchesHigherBetter(key) {
  const kws = ['score', 'puan', 'version', 'versiyon', 'standard', 'standardi',
    'bluetooth', 'wifi', 'wi fi', 'usb', 'generation', 'nesil', 'speed', 'hiz',
    'capacity', 'kapasite', 'resolution', 'cozunurluk', 'frequency', 'frekans',
    'rate', 'oran', 'yenileme', 'bandwidth', 'bant genisligi', 'core', 'cekirdek',
    'thread', 'is parcacigi', 'izlek', 'cache', 'onbellek', 'memory', 'bellek',
    'storage', 'depolama', 'battery', 'batarya', 'pil', 'playback', 'camera',
    'kamera', 'zoom', 'fps', 'benchmark', 'ratio', 'kapsam', 'boyut', 'boyutu',
    'density', 'parlaklik', 'renk'];
  return kws.some((kw) => key.includes(kw));
}

// ─── Public API ──────────────────────────────────────────────────────────

export function getDirection(specKey) {
  const normalized = normKey(specKey);

  // 1. Exact match
  if (has(STATIC_DIRECTIONS, normalized)) return STATIC_DIRECTIONS[normalized];

  // 2. Partial match — WORD-BOUNDARY only (prevents "ram" ⊂ "diyafram").
  for (const [k, dir] of Object.entries(STATIC_DIRECTIONS)) {
    if (containsWord(normalized, k)) return dir;
  }
  // 2b. Reverse: a generic label whole-word inside a longer key.
  if (normalized.length >= 4) {
    for (const [k, dir] of Object.entries(STATIC_DIRECTIONS)) {
      if (containsWord(k, normalized)) return dir;
    }
  }

  // 3. Keyword heuristics
  if (matchesLowerBetter(normalized)) return 'lower';
  if (matchesHigherBetter(normalized)) return 'higher';

  return 'neutral';
}

// Returns a Set of winning indexes (into `values`). Empty when undecidable.
// Two products can share the best value (3-4 way compares).
export function findBetterIndexes(specKey, values) {
  if (!Array.isArray(values) || values.length < 2) return new Set();

  const indexed = [];
  values.forEach((v, i) => {
    if (!isMissingSpecValue(v)) indexed.push({ key: i, value: String(v) });
  });
  if (indexed.length < 2) return new Set();

  const comparable = indexed.map((e) => e.value);
  const normalizedSet = new Set(comparable.map((v) => v.trim().toLowerCase()));
  if (normalizedSet.size === 1) return new Set();

  const collect = (scores) => {
    const max = Math.max(...scores);
    const out = new Set();
    scores.forEach((s, i) => { if (s === max) out.add(indexed[i].key); });
    return out;
  };

  // 1. Boolean
  const bools = comparable.map(boolScore);
  if (bools.every((s) => s !== null) && new Set(bools).size > 1) {
    return collect(bools);
  }

  // 2. Qualitative quality
  const qual = comparable.map((v) => scoreQualitativeValue(specKey, v));
  if (qual.every((s) => s !== null) && new Set(qual).size > 1) {
    return collect(qual);
  }

  // 3. Component ranking (CPU/GPU model names)
  const comp = compareByComponentRanking(specKey, comparable);
  if (comp >= 0) return new Set([indexed[comp].key]);

  // 4. Numeric (unit-aware) + direction
  const nums = comparable.map((v) => extractComparableNumber(specKey, v));
  if (nums.every((n) => n != null)) {
    const maxVal = Math.max(...nums);
    const minVal = Math.min(...nums);
    if (maxVal === minVal) return new Set();
    const direction = getDirection(specKey);
    let target = null;
    if (direction === 'higher') target = maxVal;
    else if (direction === 'lower') target = minVal;
    else return new Set();
    const out = new Set();
    nums.forEach((n, i) => { if (n === target) out.add(indexed[i].key); });
    return out;
  }

  return new Set();
}

// Convenience for the compare table: a boolean per cell, true = winner.
export function rowWinners(specKey, values) {
  const winners = findBetterIndexes(specKey, values);
  if (!winners.size) return values.map(() => false);
  return values.map((_, i) => winners.has(i));
}
