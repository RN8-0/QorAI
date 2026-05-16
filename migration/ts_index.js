// Create Typesense 'products' collection and index all products from PocketBase.
// Typesense uses JSONL for bulk import (one JSON doc per line).
const http = require('http');
const { req: tsReq, BASE: TS_BASE } = require('./ts');
const { req: pbReq, BASE: PB_BASE } = require('./pb');
const { lowestPriceUsd } = require('../scripts/fx_rates');

const COL = 'products';
const BATCH = 2000;

const schema = {
  name: COL,
  fields: [
    { name: 'id', type: 'string' }, // PB record id
    { name: 'slug', type: 'string' },
    { name: 'name', type: 'string', infix: true },
    { name: 'brand', type: 'string', facet: true, optional: true },
    { name: 'category', type: 'string', facet: true },
    { name: 'subcategory', type: 'string', facet: true, optional: true },
    { name: 'source', type: 'string', optional: true },
    { name: 'imageUrl', type: 'string', optional: true, index: false },
    { name: 'techScore', type: 'float' },
    { name: 'trendScore', type: 'float', optional: true },
    { name: 'price_segment', type: 'string', facet: true, optional: true },
    // Lowest known price expressed in USD. Populated from the country/currency
    // keyed `prices` map via scripts/fx_rates.js. Used for server-side range
    // filters and price sorting in the Flutter catalog. 0 means unknown
    // (Typesense rejects nullable numeric facet/sort fields).
    { name: 'lowestPriceUSD', type: 'float', optional: true },
    { name: 'specsCount', type: 'int32', optional: true },
    { name: 'keySpecsText', type: 'string', optional: true },
    { name: 'tags', type: 'string[]', optional: true, facet: true },
    { name: 'filterTokens', type: 'string[]', optional: true, facet: true },
    { name: 'screenSizeValue', type: 'float', optional: true },
    { name: 'batteryCapacityValue', type: 'int32', optional: true },
    { name: 'weightValueKg', type: 'float', optional: true },
    // Full product data as JSON string — not indexed, just stored for hydration
    { name: '_raw', type: 'string', index: false, optional: true },
  ],
  default_sorting_field: 'techScore',
  token_separators: ['-', '_', '/', ' '],
};

async function ensureCollection() {
  const r = await tsReq('GET', `/collections/${COL}`);
  if (r.status === 200) {
    console.log(`[ts] collection '${COL}' exists, dropping to recreate`);
    await tsReq('DELETE', `/collections/${COL}`);
  }
  const c = await tsReq('POST', '/collections', schema);
  if (c.status !== 201) throw new Error('create: ' + JSON.stringify(c.body));
  console.log(`[ts] collection '${COL}' created`);
}

function flattenKeySpecs(ks) {
  if (!ks) return '';
  if (Array.isArray(ks)) return ks.map(x => typeof x === 'object' ? Object.values(x).join(' ') : String(x)).join(' ');
  if (typeof ks === 'object') return Object.values(ks).join(' ');
  return String(ks);
}

function toTsDoc(pb) {
  const browseFilters = extractBrowseFilters(pb);
  // Build _raw: full PB record for client-side hydration
  const raw = JSON.stringify(pb);
  return {
    id: pb.id,
    slug: pb.slug || '',
    name: pb.name || '',
    brand: pb.brand || '',
    category: pb.category || '',
    subcategory: pb.subcategory || '',
    source: pb.source || '',
    imageUrl: pb.imageUrl || pb.imageURL || '',
    techScore: typeof pb.techScore === 'number' ? pb.techScore : 0,
    trendScore: typeof pb.trendScore === 'number' ? pb.trendScore : 0,
    price_segment: pb.price_segment || '',
    lowestPriceUSD: lowestPriceUsd(pb.prices),
    specsCount: pb.specsCount || 0,
    keySpecsText: flattenKeySpecs(pb.keySpecs),
    tags: Array.isArray(pb.tags) ? pb.tags : [],
    filterTokens: browseFilters.tokens,
    screenSizeValue: browseFilters.screenSizeValue,
    batteryCapacityValue: browseFilters.batteryCapacityValue,
    weightValueKg: browseFilters.weightValueKg,
    _raw: raw,
  };
}

function normalizeBrowseText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenBrowseSpecs(pb) {
  const flat = {};
  const specs = pb.specs || {};
  Object.entries(specs).forEach(([key, value]) => {
    if (value !== null && value !== undefined) flat[String(key)] = String(value);
  });

  const keySpecs = pb.keySpecs || {};
  Object.entries(keySpecs).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim()) {
      flat[String(key)] = String(value);
    }
  });

  const specSections = pb.specSections || {};
  Object.values(specSections).forEach((section) => {
    if (!section || typeof section !== 'object') return;
    Object.entries(section).forEach(([key, value]) => {
      if (value !== null && value !== undefined) flat[String(key)] = String(value);
    });
  });

  return flat;
}

function findBrowseSpecValues(keys, flatSpecs) {
  const matches = [];
  const seen = new Set();
  keys.forEach((key) => {
    if (flatSpecs[key] && !seen.has(flatSpecs[key])) {
      seen.add(flatSpecs[key]);
      matches.push(flatSpecs[key]);
    }
    const normalizedKey = normalizeBrowseText(key);
    const compactKey = normalizedKey.replace(/\s+/g, '');
    Object.entries(flatSpecs).forEach(([specKey, value]) => {
      const normalizedSpecKey = normalizeBrowseText(specKey);
      const compactSpecKey = normalizedSpecKey.replace(/\s+/g, '');
      if (
        normalizedSpecKey === normalizedKey ||
        normalizedSpecKey.includes(normalizedKey) ||
        normalizedKey.includes(normalizedSpecKey) ||
        compactSpecKey === compactKey ||
        compactSpecKey.includes(compactKey) ||
        compactKey.includes(compactSpecKey)
      ) {
        if (value && !seen.has(value)) {
          seen.add(value);
          matches.push(value);
        }
      }
    });
  });
  return matches;
}

function extractFirstBrowseNumber(value) {
  const match = String(value || '').match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  return parseFloat(match[1].replace(',', '.'));
}

function extractBooleanBrowseValue(value) {
  const normalized = normalizeBrowseText(value);
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

function extractStorageToken(value) {
  const normalized = normalizeBrowseText(value);
  if (!normalized) return null;
  if (normalized.includes('2 tb') || normalized.includes('2tb')) return '2_tb';
  if (normalized.includes('1 tb') || normalized.includes('1tb')) return '1_tb';
  const number = extractFirstBrowseNumber(value);
  if (number === null) return null;
  return `${Math.round(number)}_gb`;
}

function extractOsToken(value) {
  const normalized = normalizeBrowseText(value);
  if (!normalized) return null;
  if (normalized.includes('chrome os') || normalized.includes('chromeos')) {
    return 'chromeos';
  }
  if (normalized.includes('ipad os') || normalized.includes('ipados')) {
    return 'ipados';
  }
  if (
    normalized.includes('mac os') ||
    normalized.includes('macos') ||
    normalized.includes('os x')
  ) {
    return 'macos';
  }
  if (normalized.includes('windows')) return 'windows';
  if (normalized.includes('android')) return 'android';
  if (normalized.includes('linux')) return 'linux';
  if (normalized.includes('ios') || normalized.includes('iphone os')) {
    return 'ios';
  }
  return null;
}

function extractProcessorBrandToken(value) {
  const normalized = normalizeBrowseText(value);
  if (!normalized) return null;
  if (normalized.includes('intel')) return 'intel';
  if (normalized.includes('amd')) return 'amd';
  if (normalized.includes('apple')) return 'apple';
  if (normalized.includes('qualcomm') || normalized.includes('snapdragon')) {
    return 'qualcomm';
  }
  return null;
}

function extractGpuTypeToken(value) {
  const normalized = normalizeBrowseText(value);
  if (!normalized) return null;
  if (
    normalized.includes('rtx') ||
    normalized.includes('gtx') ||
    normalized.includes('geforce') ||
    normalized.includes('radeon') ||
    normalized.includes('arc') ||
    normalized.includes('dedicated') ||
    normalized.includes('discrete')
  ) {
    return 'dedicated';
  }
  if (
    normalized.includes('integrated') ||
    normalized.includes('shared') ||
    normalized.includes('iris') ||
    normalized.includes('uhd') ||
    normalized.includes('intel hd') ||
    normalized.includes('apple gpu')
  ) {
    return 'integrated';
  }
  return null;
}

function extractConnectivityTokens(value) {
  const normalized = normalizeBrowseText(value);
  if (!normalized) return [];
  const tokens = [];
  if (normalized.includes('wi fi') || normalized.includes('wifi')) {
    tokens.push('wi-fi');
  }
  if (normalized.includes('5g')) tokens.push('5g');
  if (
    normalized.includes('4g') ||
    normalized.includes('cellular') ||
    normalized.includes('lte')
  ) {
    tokens.push('4g');
  }
  return tokens;
}

function extractWeightKg(value) {
  const normalized = normalizeBrowseText(value);
  const number = extractFirstBrowseNumber(value);
  if (number === null) return null;
  if (normalized.includes('kg')) return number;
  if (normalized.includes('g')) return number / 1000;
  return number;
}

function normalizeSocketToken(value) {
  let socket = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/SOCKET/g, '')
    .replace(/FCLGA/g, 'LGA')
    .replace(/[^A-Z0-9]/g, '');
  if (/^STR\d+$/.test(socket)) socket = socket.slice(1);
  return socket;
}

function socketAliases(socket) {
  const normalized = normalizeSocketToken(socket);
  if (!normalized) return [];
  const aliases = new Set([normalized]);
  if (normalized === 'TRX50' || normalized === 'WRX90') aliases.add('TR5');
  if (normalized === 'TRX40' || normalized === 'WRX80') aliases.add('TR4');
  return Array.from(aliases);
}

function extractSocketTokensFromText(value) {
  const text = String(value || '').toUpperCase();
  const matches = text.match(/(?:FC)?LGA\s*\d{3,4}|AM[345]|TRX\d+|STR\d+|TR\d+|WRX\d+|STRP\d+/g) || [];
  return matches.flatMap(socketAliases);
}

function extractBrowseFilters(pb) {
  const flatSpecs = flattenBrowseSpecs(pb);
  const tokens = [];
  const seen = new Set();

  const addToken = (token) => {
    if (!token || seen.has(token)) return;
    seen.add(token);
    tokens.push(token);
  };

  const firstValue = (keys) => {
    const values = findBrowseSpecValues(keys, flatSpecs);
    return values.length ? String(values[0]) : '';
  };

  const matchBucket = (rawValue, orderedPairs) => {
    const normalized = normalizeBrowseText(rawValue);
    for (const [needle, bucket] of orderedPairs) {
      if (normalized.includes(needle)) return bucket;
    }
    return null;
  };

  const ramValue = firstValue(['Memory (RAM)', 'RAM', 'memory ram']);
  const ramNumber = extractFirstBrowseNumber(ramValue);
  if (ramNumber !== null) addToken(`ram:${Math.round(ramNumber)}_gb`);

  const storageValue = firstValue([
    'Hard Disk (SSD) Size',
    'SSD Size',
    'Internal Storage',
    'internal storage',
    'Storage Size',
    'Storage Capacity',
    'storage',
    'Storage',
    'Capacity',
  ]);
  const storageToken = extractStorageToken(storageValue);
  if (storageToken != null) addToken(`storage:${storageToken}`);

  const osValue = firstValue([
    'Operating System',
    'OPERATING SYSTEM',
    'OS',
    'Platform',
    'Device Operating System',
    'Cihaz Isletim Sistemi',
    'Isletim Sistemi',
  ]);
  const osToken = extractOsToken(osValue);
  if (osToken != null) addToken(`os:${osToken}`);

  const processorBrandToken = extractProcessorBrandToken(
    firstValue([
      'Processor Brand',
      'processor brand',
      'Processor',
      'CPU',
      'Chip',
      'Chipset',
      'Processor Model',
      'Processor Type',
    ]),
  );
  if (processorBrandToken != null) {
    addToken(`processor_brand:${processorBrandToken}`);
  }

  const socketTexts = [
    pb.name,
    firstValue(['Socket', 'socket', 'CPU Socket', 'Processor Socket']),
    firstValue(['Compatible Sockets', 'Socket Support', 'Supported Socket']),
  ];
  Object.values(flatSpecs).forEach((value) => socketTexts.push(value));
  socketTexts
    .flatMap(extractSocketTokensFromText)
    .forEach((token) => addToken(`socket:${token.toLowerCase()}`));

  const gpuTypeToken = extractGpuTypeToken(
    firstValue([
      'GPU Model',
      'Graphics Card',
      'Graphics Card Type',
      'External Graphics Processor (GPU)',
      'Integrated Graphics Model',
      'Graphics Card Type',
      'Video Card',
    ]),
  );
  if (gpuTypeToken != null) addToken(`gpu_type:${gpuTypeToken}`);

  const screenTechValue = firstValue([
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
  ]);
  const screenTechBucket = matchBucket(screenTechValue, [
    ['dynamic amoled', 'dynamic_amoled'],
    ['super amoled', 'super_amoled'],
    ['amoled', 'amoled'],
    ['ltpo', 'ltpo'],
    ['oled', 'oled'],
    ['ips', 'ips'],
    ['lcd', 'lcd'],
  ]);
  if (screenTechBucket) addToken(`screen_tech:${screenTechBucket}`);

  const refreshRateValue = firstValue([
    'Screen Refresh Rate',
    'screen refresh rate',
    'Refresh Rate',
    'refresh rate',
    'Display Refresh Rate',
    'display refresh rate',
  ]);
  const refreshRateNumber = extractFirstBrowseNumber(refreshRateValue);
  if (refreshRateNumber !== null) {
    const hz = Math.round(refreshRateNumber);
    if ([60, 90, 120, 144, 165, 240].includes(hz)) {
      addToken(`refresh_rate:${hz}_hz`);
    }
  }

  extractConnectivityTokens(
    firstValue(['Connectivity', 'Connection Type', '4G', '5G', 'Wi-Fi']),
  ).forEach((token) => addToken(`connectivity:${token}`));

  const usbTypeValue = firstValue([
    'USB Connection Type',
    'USB Type',
    'USB Bağlantı Tipi',
  ]);
  const usbTypeBucket = matchBucket(usbTypeValue, [
    ['type c', 'type_c'],
    ['type-c', 'type_c'],
    ['micro usb', 'micro_usb'],
    ['micro-usb', 'micro_usb'],
    ['lightning', 'lightning'],
    ['mini usb', 'mini_usb'],
    ['mini-usb', 'mini_usb'],
  ]);
  if (usbTypeBucket) addToken(`usb_type:${usbTypeBucket}`);

  const usbVersionValue = firstValue(['USB Version', 'USB Versiyonu']);
  const usbVersionBucket = matchBucket(usbVersionValue, [
    ['3.2 gen 2', '3_2_gen_2'],
    ['3.2 gen 1', '3_2_gen_1'],
    ['3.1 gen 1', '3_1_gen_1'],
    ['3.0', '3_0'],
    ['2.0', '2_0'],
  ]);
  if (usbVersionBucket) addToken(`usb_version:${usbVersionBucket}`);

  const btVersionValue = firstValue([
    'Bluetooth Version',
    'Bluetooth Features',
    'Bluetooth Versiyonu',
  ]);
  const btVersionBucket = matchBucket(btVersionValue, [
    ['5.4', '5_4'],
    ['5.3', '5_3'],
    ['5.2', '5_2'],
    ['5.1', '5_1'],
    ['5.0', '5_0'],
    ['4.2', '4_2'],
    ['4.1', '4_1'],
    ['4.0', '4_0'],
  ]);
  if (btVersionBucket) addToken(`bluetooth_version:${btVersionBucket}`);

  [
    ['five_g', ['5G']],
    ['nfc', ['NFC']],
    ['wireless_charging', ['Wireless Charging']],
    ['fast_charging', ['Fast Charging']],
    ['fingerprint', ['Fingerprint Reader', 'fingerprint']],
    ['water_resistance', ['Water Resistance']],
  ].forEach(([token, keys]) => {
    const toggleValue = firstValue(keys);
    if (extractBooleanBrowseValue(toggleValue) === true) {
      addToken(`${token}:true`);
    }
  });

  const screenSizeValue = firstValue(['Screen Size', 'screen size']);
  const displaySizeValue = firstValue(['Display Size', 'display size']);
  const batteryValue = firstValue([
    'Battery Capacity',
    'battery capacity',
    'Battery Capacity (Typical)',
  ]);
  const weightValue = firstValue(['Weight']);

  return {
    tokens,
    screenSizeValue:
      extractFirstBrowseNumber(screenSizeValue) ??
      extractFirstBrowseNumber(displaySizeValue),
    batteryCapacityValue: (() => {
      const number = extractFirstBrowseNumber(batteryValue);
      return number === null ? undefined : Math.round(number);
    })(),
    weightValueKg: extractWeightKg(weightValue),
  };
}

async function importBatch(docs) {
  if (!docs.length) return { ok: 0, fail: 0 };
  // Typesense /documents/import expects JSONL
  const jsonl = docs.map(d => JSON.stringify(d)).join('\n');
  const r = await tsReq('POST', `/collections/${COL}/documents/import?action=upsert`, jsonl, 'text/plain');
  if (r.status !== 200) {
    console.error('import fail:', r.status, (r.body + '').slice(0, 300));
    return { ok: 0, fail: docs.length };
  }
  // Response is JSONL of per-doc results
  const lines = (r.body + '').split('\n').filter(Boolean);
  let ok = 0, fail = 0;
  for (const line of lines) {
    try { const j = JSON.parse(line); if (j.success) ok++; else { fail++; if (fail < 3) console.error('row fail:', line.slice(0, 200)); } }
    catch { fail++; }
  }
  return { ok, fail };
}

async function withRetries(label, fn, attempts = 5) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryableCodes = new Set(['EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']);
      if (!retryableCodes.has(error?.code) || i === attempts) break;
      const delayMs = Math.min(1000 * 2 ** (i - 1), 10000);
      console.warn(`\n[retry] ${label} failed (${error.code}); retry ${i}/${attempts - 1} in ${delayMs}ms`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function pbPage(page) {
  const r = await withRetries(
    `pb page ${page}`,
    () => pbReq('GET', `/api/collections/products/records?perPage=${BATCH}&page=${page}`),
  );
  if (r.status !== 200) throw new Error('pb list: ' + JSON.stringify(r.body));
  return r.body;
}

(async () => {
  await ensureCollection();
  const first = await pbPage(1);
  const total = first.totalItems;
  const pages = first.totalPages;
  console.log(`[pb] ${total} products across ${pages} pages`);
  if (total === 0) {
    console.log('[ts] DONE: 0 indexed, 0 failed in 0.0s');
    process.exit(0);
  }

  const t0 = Date.now();
  let okTotal = 0, failTotal = 0, processed = 0;

  async function handlePage(items) {
    const docs = items.map(toTsDoc);
    const r = await importBatch(docs);
    okTotal += r.ok; failTotal += r.fail; processed += items.length;
    const rate = (processed / ((Date.now() - t0) / 1000)).toFixed(0);
    process.stdout.write(`\r[ts] ${okTotal} indexed, ${failTotal} failed (${rate}/s)   `);
  }

  await handlePage(first.items);
  for (let p = 2; p <= pages; p++) {
    const page = await pbPage(p);
    await handlePage(page.items);
  }
  console.log(`\n[ts] DONE: ${okTotal} indexed, ${failTotal} failed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
