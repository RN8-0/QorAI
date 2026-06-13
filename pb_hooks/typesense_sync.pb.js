/// pb_hooks/typesense_sync.pb.js
/// PocketBase server-side hook: keeps Typesense `products` index in sync
/// with PocketBase `products` collection.
///
/// Fires on every create / update / delete — even when the change is made
/// directly in PocketBase's built-in admin UI (/_/), not just via the
/// Qor AI admin web panel.

const TS_URL        = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_KEY        = '5wnpGrWLYeq8IKV9x96q80i1oDMvc4hjhq0HnnrWCSFB';
const TS_COLLECTION = 'products';

// ─── helpers ────────────────────────────────────────────────────────────────

// Currency conversion table (mirrored from scripts/fx_rates.js — keep in sync).
// PB JSVM cannot require external modules so the table is duplicated inline.
// Bump FX_VERSION when rates drift > 5% and trigger a TS backfill afterwards.
var FX_VERSION = '2026.05';
var FX_TO_USD = {
  US: 1.00, USD: 1.00,
  CA: 0.73, CAD: 0.73,
  MX: 0.058, MXN: 0.058,
  DE: 1.08, AT: 1.08, NL: 1.08, BE: 1.08, FR: 1.08, IT: 1.08, ES: 1.08,
  PT: 1.08, IE: 1.08, FI: 1.08, GR: 1.08, EU: 1.08, EUR: 1.08,
  UK: 1.27, GB: 1.27, GBP: 1.27,
  PL: 0.25, PLN: 0.25,
  CH: 1.13, CHF: 1.13,
  SE: 0.094, SEK: 0.094,
  NO: 0.092, NOK: 0.092,
  DK: 0.145, DKK: 0.145,
  TR: 0.0286, TRY: 0.0286,
  AE: 0.272, AED: 0.272,
  SA: 0.267, SAR: 0.267,
  IN: 0.0120, INR: 0.0120,
  JP: 0.0067, JPY: 0.0067,
  CN: 0.14, CNY: 0.14,
  KR: 0.00072, KRW: 0.00072,
  SG: 0.74, SGD: 0.74,
  HK: 0.128, HKD: 0.128,
  AU: 0.65, AUD: 0.65,
  NZ: 0.60, NZD: 0.60,
  BR: 0.20, BRL: 0.20,
  AR: 0.0011, ARS: 0.0011,
};

function _lowestPriceUsd(prices) {
  if (!prices || typeof prices !== 'object') return 0;
  var lowest = Infinity;
  var keys = Object.keys(prices);
  for (var i = 0; i < keys.length; i++) {
    var rawKey = keys[i];
    var rawValue = prices[rawKey];
    var value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!isFinite(value) || value <= 0) continue;
    var fx = FX_TO_USD[String(rawKey || '').toUpperCase()];
    if (!fx) continue;
    var usd = value * fx;
    if (usd < lowest) lowest = usd;
  }
  if (lowest === Infinity) return 0;
  return Math.round(lowest * 100) / 100;
}

function _tsHeaders() {
  return {
    'X-TYPESENSE-API-KEY': TS_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

function _flattenKeySpecs(ks) {
  if (!ks) return '';
  if (Array.isArray(ks)) {
    return ks
      .map(function(x) { return typeof x === 'object' ? Object.values(x).join(' ') : String(x); })
      .join(' ');
  }
  if (typeof ks === 'object') return Object.values(ks).join(' ');
  return String(ks);
}

function _tsDate(value) {
  var t = value ? new Date(value).getTime() : 0;
  return isFinite(t) ? t : 0;
}

// Returns null if the field value can't be JSON-parsed — returns raw string.
function _parseJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (_) { return raw; }
}

/// Build a Typesense document from a PocketBase record.
/// Must match the shape produced by admin/js/ts_client.js :: tsBuildDoc().
function buildTsDoc(record) {
  var keySpecs = _parseJson(record.get('keySpecs'));
  var tags     = _parseJson(record.get('tags'));
  if (!Array.isArray(tags)) tags = [];

  var techScore  = parseFloat(record.get('techScore'))  || 0;
  var trendScore = parseFloat(record.get('trendScore')) || 0;
  var specsCount = parseInt(record.get('specsCount'), 10) || 0;

  // Parse the full spec/price fields so _raw contains everything the Flutter
  // app needs for local filtering (FilterApplier checks specs + specSections).
  var specs        = _parseJson(record.get('specs'))        || {};
  var specSections = _parseJson(record.get('specSections')) || {};
  var multiLangSpecs = _parseJson(record.get('multiLangSpecs')) || {};
  var multiLangSections = _parseJson(record.get('multiLangSections')) || {};
  var nameTranslated = _parseJson(record.get('nameTranslated')) || {};
  var prices       = _parseJson(record.get('prices'))       || {};
  var affiliateLinks = _parseJson(record.get('affiliateLinks')) || {};
  var affiliateLinksByCountry = _parseJson(record.get('affiliateLinksByCountry')) || {};

  // Full _raw snapshot — matches the shape stored by admin/js/ts_client.js
  // and migration/ts_index.js so FilterApplier has specs/specSections to work with.
  var pbData = {
    id:            record.id,
    slug:          record.get('slug')         || '',
    name:          record.get('name')         || '',
    brand:         record.get('brand')        || '',
    category:      record.get('category')     || '',
    subcategory:   record.get('subcategory')  || '',
    source:        record.get('source')       || '',
    sourceUrl:     record.get('sourceUrl')    || '',
    imageUrl:      record.get('imageUrl') || record.get('imageURL') || '',
    imageURL:      record.get('imageURL') || record.get('imageUrl') || '',
    // The product gallery array MUST be carried into _raw — the app + website
    // read product.images for the photo modal. Omitting it here meant every
    // PocketBase update silently stripped the gallery down to the single hero
    // image in Typesense.
    images:        (function () { var v = _parseJson(record.get('images')); return Array.isArray(v) ? v : []; })(),
    techScore:     techScore,
    trendScore:    trendScore,
    price_segment: record.get('price_segment') || '',
    specsCount:    specsCount,
    keySpecs:      keySpecs,
    tags:          tags,
    specs:         specs,
    specSections:  specSections,
    multiLangSpecs: multiLangSpecs,
    multiLangSections: multiLangSections,
    nameTranslated: nameTranslated,
    prices:        prices,
    affiliateLinks: affiliateLinks,
    affiliateLinksByCountry: affiliateLinksByCountry,
    lowestPrice:   parseFloat(record.get('lowestPrice')) || 0,
    lowestPriceCurrency: record.get('lowestPriceCurrency') || '',
    lowestPriceUSD: parseFloat(record.get('lowestPriceUSD')) || 0,
    lowestOfferUrl: record.get('lowestOfferUrl') || '',
    lowestOfferStore: record.get('lowestOfferStore') || '',
    offerCount:    parseInt(record.get('offerCount'), 10) || 0,
    pricedOfferCount: parseInt(record.get('pricedOfferCount'), 10) || 0,
    bestOfferId:   record.get('bestOfferId') || '',
    bestOfferCheckedAt: record.get('bestOfferCheckedAt') || '',
    bestOfferExpiresAt: record.get('bestOfferExpiresAt') || '',
    description:   record.get('description') || '',
    variantGroup:  record.get('variantGroup') || '',
    variantCount:  parseInt(record.get('variantCount'), 10) || 0,
    variantPrimary: record.get('variantPrimary'),
    gtin:          record.get('gtin') || '',
    mpn:           record.get('mpn') || '',
    icecatId:      parseInt(record.get('icecatId'), 10) || 0,
    isActive:      record.get('isActive') !== false,
    // PocketBase uses 'created'/'updated'; ProductModel.fromMap reads
    // 'createdAt'/'lastUpdated' so add both so date fields work correctly.
    created:       record.get('created') || '',
    updated:       record.get('updated') || '',
    createdAt:     record.get('created') || '',
    lastUpdated:   record.get('updated') || '',
  };

  var browseFilters = _extractBrowseFilters(pbData);

  return {
    id:            record.id,
    slug:          pbData.slug,
    name:          pbData.name,
    nameSort:      String(pbData.name || '').toLowerCase(),
    brand:         pbData.brand,
    category:      pbData.category,
    subcategory:   pbData.subcategory,
    source:        pbData.source,
    imageUrl:      pbData.imageUrl,
    techScore:     techScore,
    trendScore:    trendScore,
    scrapedAtTs:   _tsDate(record.get('scrapedAt') || pbData.created || pbData.updated),
    updatedAtTs:   _tsDate(pbData.updated || record.get('scrapedAt') || pbData.created),
    price_segment: pbData.price_segment,
    lowestPriceUSD: _lowestPriceUsd(prices),
    specsCount:    specsCount,
    keySpecsText:  _flattenKeySpecs(keySpecs),
    tags:          tags,
    filterTokens:  browseFilters.tokens,
    screenSizeValue: browseFilters.screenSizeValue,
    batteryCapacityValue: browseFilters.batteryCapacityValue,
    weightValueKg: browseFilters.weightValueKg,
    _raw:          JSON.stringify(pbData),
  };
}

function _normalizeBrowseText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[ıİ]/g, 'i')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[şŞ]/g, 's')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .replace(/[äÄ]/g, 'a')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

var BROWSE_FILTER_CATEGORIES = {
  storage: ['smartphones', 'tablets', 'laptops', 'desktops', 'gaming_consoles', 'consoles', 'media_players', 'vr_headsets', 'e_readers', 'e-readers', 'ssd', 'ssds', 'storage', 'flash_drives', 'smartwatches', 'tvs'],
  ram: ['smartphones', 'tablets', 'laptops', 'desktops', 'gaming_consoles', 'consoles', 'media_players', 'vr_headsets', 'e_readers', 'e-readers', 'ram', 'smartwatches', 'tvs'],
  display: ['monitors', 'tvs', 'projectors', 'smartphones', 'tablets', 'laptops', 'smartwatches', 'e_readers', 'e-readers', 'vr_headsets'],
  resolution: ['monitors', 'tvs', 'projectors', 'smartphones', 'tablets', 'laptops'],
  displayInput: ['monitors', 'tvs', 'projectors'],
  os: ['smartphones', 'tablets', 'laptops', 'desktops', 'gaming_consoles', 'consoles', 'media_players', 'vr_headsets', 'e_readers', 'e-readers', 'smartwatches', 'tvs'],
  cpu: ['smartphones', 'tablets', 'laptops', 'desktops', 'smartwatches', 'cpus'],
  gpu: ['laptops', 'desktops'],
  socket: ['cpus', 'motherboards', 'cpu_coolers'],
  connectivity: ['smartphones', 'tablets', 'smartwatches', 'laptops', 'routers', 'wifi_routers', 'modem_routers'],
  mobile: ['smartphones', 'tablets', 'smartwatches'],
  charging: ['smartphones', 'tablets', 'laptops', 'smartwatches', 'headphones', 'earbuds', 'powerbanks'],
  water: ['smartphones', 'smartwatches', 'headphones', 'earbuds', 'speakers'],
};

function _browseCategory(pbData) {
  return String((pbData && pbData.category) || '').toLowerCase();
}

function _allowBrowseFilter(pbData, key) {
  var list = BROWSE_FILTER_CATEGORIES[key] || [];
  return list.indexOf(_browseCategory(pbData)) !== -1;
}

function _escapeBrowseRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _flattenBrowseSpecs(pbData) {
  var flat = {};
  var specs = pbData.specs || {};
  Object.keys(specs).forEach(function(key) {
    var value = specs[key];
    if (value !== null && value !== undefined) flat[String(key)] = String(value);
  });

  var keySpecs = pbData.keySpecs || {};
  Object.keys(keySpecs).forEach(function(key) {
    var value = keySpecs[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      flat[String(key)] = String(value);
    }
  });

  var specSections = pbData.specSections || {};
  Object.keys(specSections).forEach(function(sectionKey) {
    var section = specSections[sectionKey];
    if (!section || typeof section !== 'object') return;
    Object.keys(section).forEach(function(key) {
      var value = section[key];
      if (value !== null && value !== undefined) flat[String(key)] = String(value);
    });
  });

  return flat;
}

function _findBrowseSpecValues(keys, flatSpecs) {
  var matches = [];
  var seen = {};
  keys.forEach(function(key) {
    if (flatSpecs[key] && !seen[flatSpecs[key]]) {
      seen[flatSpecs[key]] = true;
      matches.push(flatSpecs[key]);
    }
    var normalizedKey = _normalizeBrowseText(key);
    var compactKey = normalizedKey.replace(/\s+/g, '');
    Object.keys(flatSpecs).forEach(function(specKey) {
      var normalizedSpecKey = _normalizeBrowseText(specKey);
      var compactSpecKey = normalizedSpecKey.replace(/\s+/g, '');
      var shortKey = normalizedKey.length <= 3;
      var wordRe = new RegExp('(^| )' + _escapeBrowseRegex(normalizedKey) + '( |$)');
      var isMatch =
        normalizedSpecKey === normalizedKey ||
        compactSpecKey === compactKey ||
        (!shortKey && (
          normalizedSpecKey.indexOf(normalizedKey) !== -1 ||
          normalizedKey.indexOf(normalizedSpecKey) !== -1 ||
          compactSpecKey.indexOf(compactKey) !== -1 ||
          compactKey.indexOf(compactSpecKey) !== -1
        )) ||
        (shortKey && wordRe.test(normalizedSpecKey));
      if (isMatch) {
        var value = flatSpecs[specKey];
        if (value && !seen[value]) {
          seen[value] = true;
          matches.push(value);
        }
      }
    });
  });
  return matches;
}

function _extractFirstBrowseNumber(value) {
  var match = String(value || '').match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  return parseFloat(match[1].replace(',', '.'));
}

function _normalizeScreenSizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[ıİ]/g, 'i')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[şŞ]/g, 's')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _isScreenSizeSpecKey(key) {
  var normalized = _normalizeScreenSizeKey(key);
  if (!normalized) return false;
  if (/(width|height|genis|en\b|boy\b|area|alani|cm2|cm 2|m2|m 2|ratio|oran|displayport|usb|thunderbolt)/.test(normalized)) {
    return false;
  }
  var aliases = [
    'screen size',
    'display size',
    'display diagonal',
    'screen diagonal',
    'diagonal',
    'ekran boyutu',
    'display boyutu',
    'bildschirmgrosse',
    'bildschirmgroesse',
    'bildschirmdiagonale',
  ];
  for (var i = 0; i < aliases.length; i++) {
    var alias = aliases[i];
    if (normalized === alias) return true;
    if (
      normalized.indexOf(alias + ' ') === 0 &&
      /\b(in|inc|inch|zoll|cm|diagonal|diagonale)\b/.test(normalized.slice(alias.length + 1))
    ) {
      return true;
    }
  }
  return false;
}

function _extractScreenSizeNumber(value, allowUnitless) {
  var raw = String(value || '').trim();
  var lower = raw.toLowerCase();
  if (!lower) return null;
  if (/(cm²|cm2|m²|m2|mm\b|piksel|pixel|px|mp\b|mah|hz|nit|ppi|cd\/m|display\s*port|usb|thunderbolt|%|x\s*\d)/i.test(lower)) {
    return null;
  }
  var match = raw.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  var number = parseFloat(match[1].replace(',', '.'));
  if (!isFinite(number) || number <= 0) return null;
  if (/(inch|inç|zoll|"|″|\d+(?:[.,]\d+)?\s*in\b)/i.test(raw)) {
    return number >= 1 && number <= 120 ? number : null;
  }
  if (/\bcm\b/i.test(raw)) {
    var inches = number / 2.54;
    return inches >= 1 && inches <= 120 ? Math.round(inches * 10) / 10 : null;
  }
  return allowUnitless && number >= 1 && number <= 120 ? number : null;
}

function _extractScreenSizeFromFlat(flatSpecs) {
  var keys = Object.keys(flatSpecs || {});
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (!_isScreenSizeSpecKey(key)) continue;
    var parsed = _extractScreenSizeNumber(flatSpecs[key], true);
    if (parsed !== null) return parsed;
  }
  return undefined;
}

function _extractBooleanBrowseValue(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized) return null;
  if (
    normalized === 'no' ||
    normalized === 'false' ||
    normalized === 'hayir' ||
    normalized === 'yok' ||
    normalized === 'n a' ||
    normalized === '-'
  ) {
    return false;
  }
  return true;
}

function _extractStorageToken(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized) return null;
  // Generalized TB (1/2/4/8 … TB) so "4 tb" no longer collapses to "4_gb".
  var tbMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*tb\b/);
  if (tbMatch) {
    var tb = Math.round(parseFloat(tbMatch[1].replace(',', '.')));
    return tb > 0 && tb <= 256 ? tb + '_tb' : null;
  }
  // Real storage always carries a GB unit. Without it the number belongs to a
  // different spec (battery mAh, PSU watt, lens mm, router Mbps, sensor count …)
  // that leaked in through a fuzzy key match — reject it instead of mislabeling
  // it as "N GB". This is what produced "174 GB" smartwatches, "1000 GB" PSUs,
  // "30000 GB" powerbanks and "88 GB" camera lenses.
  if (!/\d\s*gb\b/.test(normalized)) return null;
  var number = _extractFirstBrowseNumber(value);
  if (number === null || number <= 0 || number > 262144) return null;
  return Math.round(number) + '_gb';
}

function _extractRamGb(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized) return null;
  // RAM is reported in GB. No GB unit (or a TB/other unit) means the value is
  // really storage / VRAM-bus-width / memory-speed / a "programmable" count that
  // leaked through the 3-letter "ram" substring match — drop it.
  if (!/\d\s*gb\b/.test(normalized) || /\d\s*tb\b/.test(normalized)) return null;
  var number = _extractFirstBrowseNumber(value);
  if (number === null || number <= 0 || number > 256) return null;
  return Math.round(number);
}

function _extractOsToken(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized) return null;
  if (normalized.indexOf('chrome os') !== -1 || normalized.indexOf('chromeos') !== -1) {
    return 'chromeos';
  }
  if (normalized.indexOf('ipad os') !== -1 || normalized.indexOf('ipados') !== -1) {
    return 'ipados';
  }
  if (
    normalized.indexOf('mac os') !== -1 ||
    normalized.indexOf('macos') !== -1 ||
    normalized.indexOf('os x') !== -1
  ) {
    return 'macos';
  }
  if (normalized.indexOf('windows') !== -1) return 'windows';
  if (normalized.indexOf('android') !== -1) return 'android';
  if (normalized.indexOf('linux') !== -1) return 'linux';
  if (normalized.indexOf('ios') !== -1 || normalized.indexOf('iphone os') !== -1) {
    return 'ios';
  }
  return null;
}

function _extractProcessorBrandToken(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized) return null;
  if (normalized.indexOf('intel') !== -1) return 'intel';
  if (normalized.indexOf('amd') !== -1) return 'amd';
  if (normalized.indexOf('apple') !== -1) return 'apple';
  if (
    normalized.indexOf('qualcomm') !== -1 ||
    normalized.indexOf('snapdragon') !== -1
  ) {
    return 'qualcomm';
  }
  if (normalized.indexOf('mediatek') !== -1) return 'mediatek';
  if (normalized.indexOf('exynos') !== -1) return 'exynos';
  return null;
}

function _extractGpuTypeToken(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized) return null;
  if (
    normalized.indexOf('rtx') !== -1 ||
    normalized.indexOf('gtx') !== -1 ||
    normalized.indexOf('geforce') !== -1 ||
    normalized.indexOf('radeon') !== -1 ||
    normalized.indexOf('arc') !== -1 ||
    normalized.indexOf('dedicated') !== -1 ||
    normalized.indexOf('discrete') !== -1
  ) {
    return 'dedicated';
  }
  if (
    normalized.indexOf('integrated') !== -1 ||
    normalized.indexOf('shared') !== -1 ||
    normalized.indexOf('iris') !== -1 ||
    normalized.indexOf('uhd') !== -1 ||
    normalized.indexOf('intel hd') !== -1 ||
    normalized.indexOf('apple gpu') !== -1
  ) {
    return 'integrated';
  }
  return null;
}

function _extractConnectivityTokens(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized) return [];
  var tokens = [];
  if (normalized.indexOf('wi fi') !== -1 || normalized.indexOf('wifi') !== -1) {
    tokens.push('wi-fi');
  }
  if (normalized.indexOf('5g') !== -1) tokens.push('5g');
  if (
    normalized.indexOf('4g') !== -1 ||
    normalized.indexOf('cellular') !== -1 ||
    normalized.indexOf('lte') !== -1
  ) {
    tokens.push('4g');
  }
  return tokens;
}

function _extractWeightKg(value) {
  var normalized = _normalizeBrowseText(value);
  var number = _extractFirstBrowseNumber(value);
  if (number === null) return null;
  if (normalized.indexOf('kg') !== -1) return number;
  if (normalized.indexOf('g') !== -1) return number / 1000;
  return number;
}

function _normalizeSocketToken(value) {
  var socket = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/SOCKET/g, '')
    .replace(/FCLGA/g, 'LGA')
    .replace(/[^A-Z0-9]/g, '');
  if (/^STR\d+$/.test(socket)) socket = socket.slice(1);
  return socket;
}

function _socketAliases(socket) {
  var normalized = _normalizeSocketToken(socket);
  if (!normalized) return [];
  var aliases = [normalized];
  if (normalized === 'TRX50' || normalized === 'WRX90') aliases.push('TR5');
  if (normalized === 'TRX40' || normalized === 'WRX80') aliases.push('TR4');
  return aliases;
}

function _extractSocketTokensFromText(value) {
  var text = String(value || '').toUpperCase();
  var matches = text.match(/(?:FC)?LGA\s*\d{3,4}|AM[345]|TRX\d+|STR\d+|TR\d+|WRX\d+|STRP\d+/g) || [];
  var tokens = [];
  matches.forEach(function(match) {
    _socketAliases(match).forEach(function(alias) { tokens.push(alias); });
  });
  return tokens;
}

function _extractResolutionToken(value) {
  var normalized = _normalizeBrowseText(value);
  var raw = String(value || '').toLowerCase();
  if (!normalized) return null;
  var match = raw.match(/(\d{3,5})\s*[x×]\s*(\d{3,5})/i);
  if (match) {
    var width = Number(match[1]);
    var height = Number(match[2]);
    if (width >= 7000 || height >= 4000) return '8k';
    if (width >= 5000 || height >= 2500) return '5k';
    if (width >= 3800 || height >= 2000) return '4k';
    if (width >= 3300 && height >= 1300) return 'uwqhd';
    if (width >= 2500 || height >= 1400) return 'qhd';
    if (width >= 1900 || height >= 1000) return 'fhd';
    if (width >= 1200 || height >= 700) return 'hd';
  }
  if (/\b8k\b/.test(normalized)) return '8k';
  if (/\b5k\b/.test(normalized)) return '5k';
  if (/\b4k\b|ultra hd|uhd/.test(normalized)) return '4k';
  if (/uwqhd|ultrawide qhd|3440/.test(normalized)) return 'uwqhd';
  if (/\bwqhd\b|\bqhd\b|1440p|2k/.test(normalized)) return 'qhd';
  if (/full hd|\bfhd\b|1080p/.test(normalized)) return 'fhd';
  return null;
}

function _extractDisplayInputTokens(flatSpecs) {
  var out = {};
  Object.keys(flatSpecs || {}).forEach(function(key) {
    var value = flatSpecs[key];
    if (_extractBooleanBrowseValue(value) === false) return;
    var text = _normalizeBrowseText(key + ' ' + value);
    if (/\bhdmi\b/.test(text)) out.hdmi = true;
    if (/display\s*port|displayport|\bdp\b/.test(text)) out.displayport = true;
    if (/usb c|usb type c|type c/.test(text)) out.usb_c = true;
    if (/thunderbolt/.test(text)) out.thunderbolt = true;
    if (/\bdvi\b/.test(text)) out.dvi = true;
    if (/\bvga\b/.test(text)) out.vga = true;
  });
  return Object.keys(out);
}

function _extractRamTypeToken(value) {
  return _matchBrowseBucket(value, [
    ['lpddr5x', 'lpddr5x'],
    ['lpddr5', 'lpddr5'],
    ['lpddr4x', 'lpddr4x'],
    ['ddr5', 'ddr5'],
    ['ddr4', 'ddr4'],
    ['ddr3', 'ddr3'],
  ]);
}

function _extractRamSpeedMt(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized || !/(mt|mhz)\b/.test(normalized)) return null;
  var number = _extractFirstBrowseNumber(value);
  return number !== null && number >= 400 && number <= 10000 ? Math.round(number) : null;
}

function _extractRamLatency(value) {
  var number = _extractFirstBrowseNumber(value);
  return number !== null && number >= 1 && number <= 80 ? Math.round(number) : null;
}

function _extractRamModuleToken(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized) return null;
  if (/lrdimm|lr dimm/.test(normalized)) return 'lrdimm';
  if (/\brdimm\b|registered/.test(normalized)) return 'rdimm';
  if (/\budimm\b|unbuffered/.test(normalized)) return 'udimm';
  if (/so dimm|sodimm/.test(normalized)) return 'sodimm';
  if (/\bdimm\b/.test(normalized)) return 'dimm';
  return null;
}

function _extractRamPlatformToken(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized) return null;
  if (/masaustu|desktop|pc\b/.test(normalized)) return 'desktop';
  if (/dizustu|laptop|notebook/.test(normalized)) return 'laptop';
  if (/sunucu|server/.test(normalized)) return 'server';
  return null;
}

function _extractRamKitToken(value) {
  var normalized = _normalizeBrowseText(value);
  var match = normalized.match(/\b([1-8])\s*(?:x|li|lu|modul|module|modules)\b/);
  return match ? match[1] + '_modules' : null;
}

function _extractRamEccToken(value) {
  var normalized = _normalizeBrowseText(value);
  if (!normalized || /non ecc|nonecc|no|hayir|yok/.test(normalized)) return false;
  return /\becc\b|error correction|hata duzelt/.test(normalized);
}

function _extractStorageTypeToken(value) {
  return _matchBrowseBucket(value, [
    ['nvme', 'nvme'],
    ['sata', 'sata'],
    ['ufs', 'ufs'],
    ['emmc', 'emmc'],
    ['ssd', 'ssd'],
    ['hdd', 'hdd'],
  ]);
}

function _matchBrowseBucket(rawValue, orderedPairs) {
  var normalized = _normalizeBrowseText(rawValue);
  for (var i = 0; i < orderedPairs.length; i++) {
    if (normalized.indexOf(orderedPairs[i][0]) !== -1) {
      return orderedPairs[i][1];
    }
  }
  return null;
}

function _extractBrowseFilters(pbData) {

  var flatSpecs = _flattenBrowseSpecs(pbData);
  var tokens = [];
  var seen = {};

  function addToken(token) {
    if (!token || seen[token]) return;
    seen[token] = true;
    tokens.push(token);
  }

  function firstValue(keys) {
    var values = _findBrowseSpecValues(keys, flatSpecs);
    return values.length ? String(values[0]) : '';
  }
  function exactValue(keys) {
    for (var i = 0; i < keys.length; i++) {
      if (flatSpecs[keys[i]] !== null && flatSpecs[keys[i]] !== undefined && flatSpecs[keys[i]] !== '') {
        return String(flatSpecs[keys[i]]);
      }
    }
    return firstValue(keys);
  }
  var category = _browseCategory(pbData);
  var ramCapacityKeys = category === 'ram'
    ? ['Bellek Kapasitesi', 'Memory Capacity', 'RAM Capacity', 'Capacity', 'Kapasite', 'Speicherkapazitat', 'Speicherkapazität', 'Arbeitsspeicher Kapazitat', 'Arbeitsspeicher Kapazität']
    : ['Memory (RAM)', 'RAM', 'memory ram', 'Bellek (RAM)', 'Bellek', 'Arbeitsspeicher', 'Hauptspeicher'];

  function matchBucket(rawValue, orderedPairs) {
    var normalized = _normalizeBrowseText(rawValue);
    for (var i = 0; i < orderedPairs.length; i++) {
      if (normalized.indexOf(orderedPairs[i][0]) !== -1) {
        return orderedPairs[i][1];
      }
    }
    return null;
  }

  if (_allowBrowseFilter(pbData, 'ram')) {
    var ramValue = firstValue(ramCapacityKeys);
    var ramGb = _extractRamGb(ramValue) || (category === 'ram' ? _extractRamGb(pbData && pbData.name) : null);
    if (ramGb !== null) addToken('ram:' + ramGb + '_gb');
    var ramTypeToken = _extractRamTypeToken(firstValue(['RAM Type', 'Memory Type', 'Memory Technology', 'Bellek Tipi', 'Bellek Türü', 'Bellek Teknolojisi', 'Speichertyp', 'Speicherart', 'Speichertechnologie'])) ||
      (category === 'ram' ? _extractRamTypeToken(pbData && pbData.name) : null);
    if (ramTypeToken) addToken('ram_type:' + ramTypeToken);
    if (category === 'ram') {
      var speed = _extractRamSpeedMt(firstValue(['Bellek Hızı (OC)', 'Bellek Hızı', 'Memory Speed', 'RAM Speed', 'Speed', 'Speichertakt', 'Taktrate']));
      if (speed) addToken('ram_speed:' + speed + '_mt');
      var latency = _extractRamLatency(firstValue(['CL (Tepkime Süresi)', 'CAS Latency', 'CL', 'Latency', 'Latenz']));
      if (latency) addToken('ram_latency:' + latency + '_cl');
      var moduleType = _extractRamModuleToken(firstValue(['Bellek Modülü', 'Memory Module', 'Module Type', 'Form Factor', 'Bauform']));
      if (moduleType) addToken('ram_module:' + moduleType);
      var kit = _extractRamKitToken(firstValue(['Bellek Kiti', 'Memory Kit', 'Kit', 'Bellek Count', 'Module Count']));
      if (kit) addToken('ram_kit:' + kit);
      var platform = _extractRamPlatformToken(firstValue(['Platform', 'Kullanım Alanı', 'Kullanim Alani']));
      if (platform) addToken('ram_platform:' + platform);
      if (_extractRamEccToken(firstValue(['ECC', 'ECC Memory', 'SIMa Düzeltme', 'Hata Düzeltme', 'Error Correction']))) addToken('ecc:true');
      var lightingFlag = exactValue(['Işıklandırma', 'Isiklandirma', 'Lighting', 'LED']);
      var lightingDetail = exactValue(['Işıklandırma Özelliği', 'Isiklandirma Ozelligi', 'Lighting Type', 'RGB']);
      var lightingFlagBool = _extractBooleanBrowseValue(lightingFlag);
      var lightingDetailText = _normalizeBrowseText(lightingDetail);
      if (lightingFlagBool === true || (lightingFlagBool !== false && lightingDetailText && !/^(no|false|hayir|yok|n a|-)$/.test(lightingDetailText))) addToken('lighting:true');
      if (lightingFlagBool !== false && /\brgb\b/.test(lightingDetailText)) addToken('rgb:true');
      var profileText = _normalizeBrowseText(firstValue(['Specifications', 'Profile', 'Overclock Profile', 'Memory Profile', 'Profil']));
      if (/\bxmp\b/.test(profileText)) addToken('xmp:true');
      if (/\bexpo\b/.test(profileText)) addToken('expo:true');
    }
  }

  if (_allowBrowseFilter(pbData, 'storage')) {
    var storageValue = firstValue([
      'Hard Disk (SSD) Size',
      'SSD Size',
      'Internal Storage',
      'internal storage',
      'Storage Size',
      'Storage Capacity',
      'Total Storage Capacity',
      'Capacity',
      'storage',
      'Storage',
      'Dahili Depolama',
      'Depolama',
      'Kapasite',
      'Speicherkapazitat',
      'Speicherkapazität',
      'Geratespeicher',
      'Gerätespeicher',
    ]);
    var storageToken = _extractStorageToken(storageValue) || _extractStorageToken(pbData.name);
    if (storageToken !== null) addToken('storage:' + storageToken);
    var storageTypeToken = _extractStorageTypeToken(firstValue(['Storage Type', 'Storage Media', 'Disk Type', 'Interface', 'Schnittstelle', 'Depolama Tipi', 'SSD Type']));
    if (storageTypeToken) addToken('storage_type:' + storageTypeToken);
  }

  if (_allowBrowseFilter(pbData, 'os')) {
    var osValue = firstValue([
      'Operating System',
      'OPERATING SYSTEM',
      'OS',
      'Platform',
      'Device Operating System',
      'Cihaz Isletim Sistemi',
      'Isletim Sistemi',
      'İşletim Sistemi',
      'Betriebssystem',
    ]);
    var osToken = _extractOsToken(osValue);
    if (osToken !== null) addToken('os:' + osToken);
  }

  if (_allowBrowseFilter(pbData, 'cpu')) {
    var processorBrandToken = _extractProcessorBrandToken(
      firstValue([
        'Processor Brand',
        'processor brand',
        'Processor',
        'CPU',
        'Chip',
        'Chipset',
        'Processor Model',
        'Processor Type',
        'İşlemci',
        'Islemci',
        'Yonga Seti',
        'Prozessor',
      ]),
    );
    if (processorBrandToken !== null) {
      addToken('processor_brand:' + processorBrandToken);
    }
  }

  if (_allowBrowseFilter(pbData, 'socket')) {
    var socketTexts = [
      firstValue(['Socket', 'socket', 'CPU Socket', 'Processor Socket', 'Soket', 'Sockel', 'Compatible Sockets', 'Socket Support', 'Supported Socket', 'CPU-Sockel']),
    ];
    socketTexts.forEach(function(value) {
      _extractSocketTokensFromText(value).forEach(function(token) {
        addToken('socket:' + token.toLowerCase());
      });
    });
  }

  if (_allowBrowseFilter(pbData, 'gpu')) {
    var gpuTypeToken = _extractGpuTypeToken(
      firstValue([
        'GPU Model',
        'Graphics Card',
        'Graphics Card Type',
        'External Graphics Processor (GPU)',
        'Integrated Graphics Model',
        'Video Card',
        'Ekran Kartı',
        'Grafik İşlemci',
        'Grafik',
      ]),
    );
    if (gpuTypeToken !== null) addToken('gpu_type:' + gpuTypeToken);
  }

  if (_allowBrowseFilter(pbData, 'display')) {
    var screenTechValue = firstValue([
      'Screen Technology',
      'screen technology',
      'Display Type',
      'display type',
      'Panel Type',
      'panel type',
      'Display Technology',
      'display technology',
      'Display',
      'Type',
      'Ekran Teknolojisi',
      'Panel Tipi',
      'Paneltyp',
      'Bildschirmtechnologie',
    ]);
    var screenTechBucket = matchBucket(screenTechValue, [
      ['dynamic amoled', 'dynamic_amoled'],
      ['super amoled', 'super_amoled'],
      ['amoled', 'amoled'],
      ['ltpo', 'ltpo'],
      ['oled', 'oled'],
      ['ips', 'ips'],
      ['va', 'va'],
      ['tn', 'tn'],
      ['lcd', 'lcd'],
    ]);
    if (screenTechBucket) addToken('screen_tech:' + screenTechBucket);

    var refreshRateValue = firstValue([
      'Screen Refresh Rate',
      'screen refresh rate',
      'Refresh Rate',
      'refresh rate',
      'Display Refresh Rate',
      'display refresh rate',
      'Ekran Yenileme Hızı',
      'Yenileme Hızı',
      'Bildwiederholfrequenz',
      'Bildwiederholrate',
    ]);
    var refreshRateNumber = _extractFirstBrowseNumber(refreshRateValue);
    if (refreshRateNumber !== null) {
      var hz = Math.round(refreshRateNumber);
      if ([60, 75, 90, 100, 120, 144, 165, 180, 200, 240, 360, 480].indexOf(hz) !== -1) {
        addToken('refresh_rate:' + hz + '_hz');
      }
    }

    if (_allowBrowseFilter(pbData, 'resolution')) {
      var resolutionToken = _extractResolutionToken(firstValue(['Resolution', 'Screen Resolution', 'Display Resolution', 'Çözünürlük', 'Cozunurluk', 'Auflösung', 'Aufloesung']));
      if (resolutionToken) addToken('resolution:' + resolutionToken);
    }
  }

  if (_allowBrowseFilter(pbData, 'displayInput')) {
    _extractDisplayInputTokens(flatSpecs).forEach(function(token) {
      addToken('display_input:' + token);
    });
  }

  if (_allowBrowseFilter(pbData, 'connectivity')) {
    _extractConnectivityTokens(
      firstValue(['Connectivity', 'Connection Type', '4G', '5G', 'Wi-Fi', 'Bağlantı', 'Baglanti', 'Konnektivitat', 'Konnektivität']),
    ).forEach(function(token) {
      addToken('connectivity:' + token);
    });
  }

  [
    ['five_g', ['5G', '5G Desteği', '5G Destegi'], 'mobile'],
    ['nfc', ['NFC'], 'mobile'],
    ['wireless_charging', ['Wireless Charging', 'Kablosuz Şarj', 'Kablosuz Sarj'], 'mobile'],
    ['fast_charging', ['Fast Charging', 'Hızlı Şarj', 'Hizli Sarj'], 'charging'],
    ['fingerprint', ['Fingerprint Reader', 'fingerprint', 'Parmak İzi', 'Parmak Izi'], 'mobile'],
    ['water_resistance', ['Water Resistance', 'Suya Dayanıklılık', 'Suya Dayaniklilik', 'Wasserdicht'], 'water'],
  ].forEach(function(entry) {
    if (!_allowBrowseFilter(pbData, entry[2])) return;
    var toggleValue = firstValue(entry[1]);
    if (_extractBooleanBrowseValue(toggleValue) === true) {
      addToken(entry[0] + ':true');
    }
  });

  var batteryValue = firstValue([
    'Battery Capacity',
    'battery capacity',
    'Battery Capacity (Typical)',
  ]);
  var weightValue = firstValue(['Weight']);

  return {
    tokens: tokens,
    screenSizeValue: _extractScreenSizeFromFlat(flatSpecs),
    batteryCapacityValue: (function() {
      // Require a mAh unit so the bogus upstream "Battery capacity" that holds an
      // SSD's "4 TB" or a lens's "88 mm" can't surface as "4 mAh" / "88 mAh".
      var normalized = _normalizeBrowseText(batteryValue);
      if (!/\d\s*mah\b/.test(normalized)) return undefined;
      var number = _extractFirstBrowseNumber(batteryValue);
      return (number === null || number <= 0 || number > 200000) ? undefined : Math.round(number);
    })(),
    weightValueKg: _extractWeightKg(weightValue),
  };
}

/// Upsert a document to Typesense.
function tsUpsert(record) {
  try {
    var doc  = buildTsDoc(record);
    var resp = $http.send({
      method:  'POST',
      url:     TS_URL + '/collections/' + TS_COLLECTION + '/documents?action=upsert',
      headers: _tsHeaders(),
      body:    JSON.stringify(doc),
      timeout: 15,
    });
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      console.log('[typesense_sync] upsert OK — id=' + record.id);
    } else {
      console.log('[typesense_sync] upsert WARN ' + resp.statusCode + ' — id=' + record.id + ' body=' + resp.raw.slice(0, 200));
    }
  } catch (err) {
    console.log('[typesense_sync] upsert ERROR — id=' + record.id + ':', err);
  }
}

/// Delete a document from Typesense.
function tsDelete(recordId) {
  try {
    var resp = $http.send({
      method:  'DELETE',
      url:     TS_URL + '/collections/' + TS_COLLECTION + '/documents/' + encodeURIComponent(recordId),
      headers: _tsHeaders(),
      timeout: 10,
    });
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      console.log('[typesense_sync] delete OK — id=' + recordId);
    } else if (resp.statusCode === 404) {
      console.log('[typesense_sync] delete SKIP (not found) — id=' + recordId);
    } else {
      console.log('[typesense_sync] delete WARN ' + resp.statusCode + ' — id=' + recordId);
    }
  } catch (err) {
    console.log('[typesense_sync] delete ERROR — id=' + recordId + ':', err);
  }
}

// ─── hooks ──────────────────────────────────────────────────────────────────

onRecordAfterCreateSuccess(function (e) {
  try { tsUpsert(e.record); } catch (err) {
    console.log('[typesense_sync] create hook error:', err);
  }
}, 'products');

onRecordAfterUpdateSuccess(function (e) {
  try { tsUpsert(e.record); } catch (err) {
    console.log('[typesense_sync] update hook error:', err);
  }
}, 'products');

onRecordAfterDeleteSuccess(function (e) {
  try { tsDelete(e.record.id); } catch (err) {
    console.log('[typesense_sync] delete hook error:', err);
  }
}, 'products');
