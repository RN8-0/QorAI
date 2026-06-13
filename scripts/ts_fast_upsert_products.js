'use strict';

const fs = require('fs');
const path = require('path');
const { lowestPriceUsd } = require('./fx_rates');

const COL = 'products';
const PB_PAGE_SIZE = Number(process.env.TS_FAST_PAGE_SIZE || 500);
const CONCURRENCY = Number(process.env.TS_FAST_CONCURRENCY || 6);
const START_PAGE = Math.max(1, Number(process.env.TS_FAST_START_PAGE || 1));
const REQUEST_TIMEOUT_MS = Number(process.env.TS_FAST_TIMEOUT_MS || 90000);
// Targeted mode: only re-index these comma-separated record ids (used to repair
// specific products) instead of seeking the whole catalog.
const ONLY_IDS = (process.env.TS_FAST_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

const envFile = fs.readFileSync(path.join(__dirname, '..', 'migration', '.env'), 'utf8');
const env = Object.fromEntries(
  envFile
    .split(/\r?\n/)
    .filter(line => line && line.includes('=') && !line.trim().startsWith('#'))
    .map(line => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

let pbToken = null;

const PRODUCT_SCHEMA = {
  name: COL,
  fields: [
    { name: 'id', type: 'string' },
    { name: 'slug', type: 'string' },
    { name: 'name', type: 'string', infix: true },
    { name: 'nameSort', type: 'string', sort: true, optional: true },
    { name: 'brand', type: 'string', facet: true, optional: true },
    { name: 'category', type: 'string', facet: true },
    { name: 'subcategory', type: 'string', facet: true, optional: true },
    { name: 'source', type: 'string', optional: true },
    { name: 'imageUrl', type: 'string', optional: true, index: false },
    { name: 'techScore', type: 'float' },
    { name: 'trendScore', type: 'float', optional: true },
    { name: 'scrapedAtTs', type: 'int64', optional: true },
    { name: 'updatedAtTs', type: 'int64', optional: true },
    { name: 'price_segment', type: 'string', facet: true, optional: true },
    { name: 'lowestPriceUSD', type: 'float', optional: true },
    { name: 'specsCount', type: 'int32', optional: true },
    { name: 'keySpecsText', type: 'string', optional: true },
    { name: 'tags', type: 'string[]', optional: true, facet: true },
    { name: 'filterTokens', type: 'string[]', optional: true, facet: true },
    { name: 'screenSizeValue', type: 'float', optional: true },
    { name: 'batteryCapacityValue', type: 'int32', optional: true },
    { name: 'weightValueKg', type: 'float', optional: true },
    { name: '_raw', type: 'string', index: false, optional: true },
  ],
  default_sorting_field: 'techScore',
  token_separators: ['-', '_', '/', ' '],
};

async function fetchWithTimeout(url, options = {}, label = url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function pbAuth() {
  const res = await fetchWithTimeout(
    `${env.POCKETBASE_URL}/api/collections/_superusers/auth-with-password`,
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
    },
    'PB auth',
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PB auth ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  pbToken = body.token;
}

async function pbGet(pathname, label) {
  if (!pbToken) await pbAuth();
  let res = await fetchWithTimeout(
    `${env.POCKETBASE_URL}${pathname}`,
    { headers: { Accept: 'application/json', Authorization: pbToken } },
    label,
  );
  if (res.status === 401) {
    pbToken = null;
    await pbAuth();
    res = await fetchWithTimeout(
      `${env.POCKETBASE_URL}${pathname}`,
      { headers: { Accept: 'application/json', Authorization: pbToken } },
      label,
    );
  }
  const body = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  if (!res.ok) throw new Error(`${label}: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

async function tsPost(pathname, body, contentType, label) {
  const res = await fetchWithTimeout(
    `${env.TYPESENSE_URL}${pathname}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': contentType,
        'X-TYPESENSE-API-KEY': env.TYPESENSE_API_KEY,
      },
      body,
    },
    label,
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`${label}: ${res.status} ${text.slice(0, 300)}`);
  return text;
}

async function tsJson(method, pathname, body, label) {
  const res = await fetchWithTimeout(
    `${env.TYPESENSE_URL}${pathname}`,
    {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-TYPESENSE-API-KEY': env.TYPESENSE_API_KEY,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    label,
  );
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, body: data };
}

async function ensureCollection() {
  const existing = await withRetry(`TS collection ${COL}`, async () => {
    const response = await tsJson('GET', `/collections/${COL}`, null, `TS collection ${COL}`);
    if (response.status >= 500) {
      throw new Error(`TS collection ${COL}: ${response.status} ${JSON.stringify(response.body).slice(0, 200)}`);
    }
    return response;
  }, 12);
  if (existing.status === 200) {
    console.log(`[fast-ts] collection '${COL}' exists · docs=${existing.body?.num_documents ?? '-'}`);
    return;
  }
  if (existing.status !== 404) {
    throw new Error(`TS collection check: ${existing.status} ${JSON.stringify(existing.body).slice(0, 300)}`);
  }
  const created = await withRetry('TS create products collection', async () => {
    const response = await tsJson('POST', '/collections', PRODUCT_SCHEMA, 'TS create products collection');
    if (response.status >= 500) {
      throw new Error(`TS create products collection: ${response.status} ${JSON.stringify(response.body).slice(0, 200)}`);
    }
    return response;
  }, 12);
  if (created.status !== 201) {
    throw new Error(`TS collection create: ${created.status} ${JSON.stringify(created.body).slice(0, 300)}`);
  }
  console.log(`[fast-ts] collection '${COL}' created`);
}

function flattenKeySpecs(ks) {
  if (!ks) return '';
  if (Array.isArray(ks)) return ks.map(x => typeof x === 'object' ? Object.values(x).join(' ') : String(x)).join(' ');
  if (typeof ks === 'object') return Object.values(ks).join(' ');
  return String(ks);
}

function tsDate(value) {
  const t = value ? new Date(value).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
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

function extractSocketTokens(pb) {
  const texts = [pb?.name || ''];
  const pushMapValues = (value) => {
    if (!value || typeof value !== 'object') return;
    Object.values(value).forEach(v => {
      if (v && typeof v === 'object' && !Array.isArray(v)) pushMapValues(v);
      else if (v !== null && v !== undefined) texts.push(String(v));
    });
  };
  pushMapValues(pb?.specs || {});
  pushMapValues(pb?.keySpecs || {});
  pushMapValues(pb?.specSections || {});

  const tokens = new Set();
  texts.forEach(text => {
    const matches = String(text || '').toUpperCase().match(/(?:FC)?LGA\s*\d{3,4}|AM[345]|TRX\d+|STR\d+|TR\d+|WRX\d+|STRP\d+/g) || [];
    matches.flatMap(socketAliases).forEach(token => tokens.add(`socket:${token.toLowerCase()}`));
  });
  return Array.from(tokens);
}

function flattenBrowseSpecs(pb) {
  const flat = {};
  const add = (value) => {
    if (!value || typeof value !== 'object') return;
    Object.entries(value).forEach(([key, item]) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        add(item);
      } else if (item !== null && item !== undefined) {
        flat[String(key)] = String(item);
      }
    });
  };
  add(pb?.specs || {});
  add(pb?.keySpecs || {});
  add(pb?.specSections || {});
  return flat;
}

function normScreenKey(value) {
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

function isScreenSizeSpecKey(key) {
  const normalized = normScreenKey(key);
  if (!normalized) return false;
  if (/(width|height|genis|en\b|boy\b|area|alani|cm2|cm 2|m2|m 2|ratio|oran|displayport|usb|thunderbolt)/.test(normalized)) return false;
  const aliases = [
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
  if (aliases.includes(normalized)) return true;
  return aliases.some((alias) =>
    normalized.startsWith(`${alias} `) &&
    /\b(in|inc|inch|zoll|cm|diagonal|diagonale)\b/.test(normalized.slice(alias.length + 1))
  );
}

function numberFromText(value) {
  const match = String(value || '').match(/(\d+(?:[.,]\d+)?)/);
  return match ? parseFloat(match[1].replace(',', '.')) : null;
}

function screenSizeNumber(value, allowUnitless = false) {
  const raw = String(value || '').trim();
  const lower = raw.toLowerCase();
  if (!lower) return null;
  if (/(cm²|cm2|m²|m2|mm\b|piksel|pixel|px|mp\b|mah|hz|nit|ppi|cd\/m|display\s*port|usb|thunderbolt|%|x\s*\d)/i.test(lower)) return null;
  const number = numberFromText(raw);
  if (!Number.isFinite(number) || number <= 0) return null;
  if (/(inch|inç|zoll|"|″|\d+(?:[.,]\d+)?\s*in\b)/i.test(raw)) {
    return number >= 1 && number <= 120 ? number : null;
  }
  if (/\bcm\b/i.test(raw)) {
    const inches = number / 2.54;
    return inches >= 1 && inches <= 120 ? Math.round(inches * 10) / 10 : null;
  }
  return allowUnitless && number >= 1 && number <= 120 ? number : null;
}

function firstExactSpecValue(flat, aliases) {
  const normalizedAliases = aliases.map(normScreenKey);
  for (const [key, value] of Object.entries(flat || {})) {
    if (normalizedAliases.includes(normScreenKey(key))) return value;
  }
  return '';
}

function weightKg(value) {
  const number = numberFromText(value);
  if (!Number.isFinite(number)) return undefined;
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('kg')) return number;
  if (/\bg\b/.test(normalized)) return number / 1000;
  return number;
}

const BROWSE_CAT_SETS = {
  storage: new Set(['smartphones', 'tablets', 'laptops', 'desktops', 'gaming_consoles', 'consoles', 'media_players', 'vr_headsets', 'e_readers', 'e-readers', 'ssd', 'ssds', 'storage', 'flash_drives', 'smartwatches', 'tvs']),
  ram: new Set(['smartphones', 'tablets', 'laptops', 'desktops', 'gaming_consoles', 'consoles', 'media_players', 'vr_headsets', 'e_readers', 'e-readers', 'ram', 'smartwatches', 'tvs']),
  display: new Set(['monitors', 'tvs', 'projectors', 'smartphones', 'tablets', 'laptops', 'smartwatches', 'e_readers', 'e-readers', 'vr_headsets']),
  resolution: new Set(['monitors', 'tvs', 'projectors', 'smartphones', 'tablets', 'laptops']),
  displayInput: new Set(['monitors', 'tvs', 'projectors']),
  os: new Set(['smartphones', 'tablets', 'laptops', 'desktops', 'gaming_consoles', 'consoles', 'media_players', 'vr_headsets', 'e_readers', 'e-readers', 'smartwatches', 'tvs']),
  cpu: new Set(['smartphones', 'tablets', 'laptops', 'desktops', 'smartwatches', 'cpus']),
  gpu: new Set(['laptops', 'desktops']),
  socket: new Set(['cpus', 'motherboards', 'cpu_coolers']),
  connectivity: new Set(['smartphones', 'tablets', 'smartwatches', 'laptops', 'routers', 'wifi_routers', 'modem_routers']),
  mobile: new Set(['smartphones', 'tablets', 'smartwatches']),
  charging: new Set(['smartphones', 'tablets', 'laptops', 'smartwatches', 'headphones', 'earbuds', 'powerbanks']),
  water: new Set(['smartphones', 'smartwatches', 'headphones', 'earbuds', 'speakers']),
};

function browseCategory(pb) {
  return String(pb?.category || '').toLowerCase();
}

function allowBrowseToken(pb, group) {
  return BROWSE_CAT_SETS[group]?.has(browseCategory(pb));
}

function normBrowseText(value) {
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

function findBrowseSpecValues(keys, flat) {
  const out = [];
  const seen = new Set();
  const esc = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const key of keys) {
    if (flat[key] && !seen.has(flat[key])) { seen.add(flat[key]); out.push(flat[key]); }
    const nk = normBrowseText(key);
    const ck = nk.replace(/\s+/g, '');
    const short = nk.length <= 3;
    const word = new RegExp('(^| )' + esc(nk) + '( |$)');
    for (const [specKey, value] of Object.entries(flat || {})) {
      const nsk = normBrowseText(specKey);
      const csk = nsk.replace(/\s+/g, '');
      const matches = nsk === nk || csk === ck || (!short && (
        nsk.includes(nk) || nk.includes(nsk) || csk.includes(ck) || ck.includes(csk)
      )) || (short && word.test(nsk));
      if (matches && value && !seen.has(value)) { seen.add(value); out.push(value); }
    }
  }
  return out;
}

function firstBrowseValue(flat, keys) {
  const values = findBrowseSpecValues(keys, flat);
  return values.length ? String(values[0]) : '';
}

function browseBool(value) {
  const n = normBrowseText(value);
  if (!n) return null;
  if (['no', 'false', 'hayir', 'yok', 'n a', '-'].includes(n)) return false;
  return true;
}

function storageToken(value) {
  const n = normBrowseText(value);
  if (!n) return null;
  const tb = n.match(/(\d+(?:[.,]\d+)?)\s*tb\b/);
  if (tb) {
    const size = Math.round(parseFloat(tb[1].replace(',', '.')));
    return size > 0 && size <= 256 ? `${size}_tb` : null;
  }
  if (!/\d\s*gb\b/.test(n)) return null;
  const size = numberFromText(value);
  return size != null && size > 0 && size <= 262144 ? `${Math.round(size)}_gb` : null;
}

function ramTokenGb(value) {
  const n = normBrowseText(value);
  if (!n || !/\d\s*gb\b/.test(n) || /\d\s*tb\b/.test(n)) return null;
  const size = numberFromText(value);
  return size != null && size > 0 && size <= 256 ? Math.round(size) : null;
}

function ramSpeedMt(value) {
  const n = normBrowseText(value);
  if (!n || !/(mt|mhz)\b/.test(n)) return null;
  const size = numberFromText(value);
  return size != null && size >= 400 && size <= 10000 ? Math.round(size) : null;
}

function ramLatency(value) {
  const size = numberFromText(value);
  return size != null && size >= 1 && size <= 80 ? Math.round(size) : null;
}

function ramModuleToken(value) {
  const n = normBrowseText(value);
  if (!n) return null;
  if (/lrdimm|lr dimm/.test(n)) return 'lrdimm';
  if (/\brdimm\b|registered/.test(n)) return 'rdimm';
  if (/\budimm\b|unbuffered/.test(n)) return 'udimm';
  if (/so dimm|sodimm/.test(n)) return 'sodimm';
  if (/\bdimm\b/.test(n)) return 'dimm';
  return null;
}

function ramPlatformToken(value) {
  const n = normBrowseText(value);
  if (!n) return null;
  if (/masaustu|desktop|pc\b/.test(n)) return 'desktop';
  if (/dizustu|laptop|notebook/.test(n)) return 'laptop';
  if (/sunucu|server/.test(n)) return 'server';
  return null;
}

function ramKitToken(value) {
  const n = normBrowseText(value);
  const match = n.match(/\b([1-8])\s*(?:x|li|lu|modul|module|modules)\b/);
  return match ? `${match[1]}_modules` : null;
}

function ramEccToken(value) {
  const n = normBrowseText(value);
  if (!n || /non ecc|nonecc|no|hayir|yok/.test(n)) return false;
  return /\becc\b|error correction|hata duzelt/.test(n);
}

function bucket(raw, pairs) {
  const n = normBrowseText(raw);
  for (const [needle, value] of pairs) if (n.includes(needle)) return value;
  return null;
}

function osToken(value) {
  const n = normBrowseText(value);
  if (!n) return null;
  if (n.includes('chrome os') || n.includes('chromeos')) return 'chromeos';
  if (n.includes('ipad os') || n.includes('ipados')) return 'ipados';
  if (n.includes('mac os') || n.includes('macos') || n.includes('os x')) return 'macos';
  if (n.includes('windows')) return 'windows';
  if (n.includes('android')) return 'android';
  if (n.includes('linux')) return 'linux';
  if (n.includes('ios') || n.includes('iphone os')) return 'ios';
  return null;
}

function processorBrandToken(value) {
  const n = normBrowseText(value);
  if (!n) return null;
  if (n.includes('intel')) return 'intel';
  if (n.includes('amd')) return 'amd';
  if (n.includes('apple')) return 'apple';
  if (n.includes('qualcomm') || n.includes('snapdragon')) return 'qualcomm';
  if (n.includes('mediatek')) return 'mediatek';
  if (n.includes('exynos')) return 'exynos';
  return null;
}

function gpuTypeToken(value) {
  const n = normBrowseText(value);
  if (!n) return null;
  if (['rtx', 'gtx', 'geforce', 'radeon', 'arc', 'dedicated', 'discrete'].some(x => n.includes(x))) return 'dedicated';
  if (['integrated', 'shared', 'iris', 'uhd', 'intel hd', 'apple gpu'].some(x => n.includes(x))) return 'integrated';
  return null;
}

function resolutionToken(value) {
  const n = normBrowseText(value);
  const raw = String(value || '').toLowerCase();
  if (!n) return null;
  const match = raw.match(/(\d{3,5})\s*[x×]\s*(\d{3,5})/i);
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width >= 7000 || height >= 4000) return '8k';
    if (width >= 5000 || height >= 2500) return '5k';
    if (width >= 3800 || height >= 2000) return '4k';
    if (width >= 3300 && height >= 1300) return 'uwqhd';
    if (width >= 2500 || height >= 1400) return 'qhd';
    if (width >= 1900 || height >= 1000) return 'fhd';
    if (width >= 1200 || height >= 700) return 'hd';
  }
  if (/\b8k\b/.test(n)) return '8k';
  if (/\b5k\b/.test(n)) return '5k';
  if (/\b4k\b|ultra hd|uhd/.test(n)) return '4k';
  if (/uwqhd|ultrawide qhd|3440/.test(n)) return 'uwqhd';
  if (/\bwqhd\b|\bqhd\b|1440p|2k/.test(n)) return 'qhd';
  if (/full hd|\bfhd\b|1080p/.test(n)) return 'fhd';
  return null;
}

function displayInputTokens(flat) {
  const tokens = new Set();
  for (const [key, value] of Object.entries(flat || {})) {
    if (browseBool(value) === false) continue;
    const text = normBrowseText(`${key} ${value}`);
    if (/\bhdmi\b/.test(text)) tokens.add('hdmi');
    if (/display\s*port|displayport|\bdp\b/.test(text)) tokens.add('displayport');
    if (/usb c|usb type c|type c/.test(text)) tokens.add('usb_c');
    if (/thunderbolt/.test(text)) tokens.add('thunderbolt');
    if (/\bdvi\b/.test(text)) tokens.add('dvi');
    if (/\bvga\b/.test(text)) tokens.add('vga');
  }
  return Array.from(tokens);
}

function socketTokensFromText(value) {
  const matches = String(value || '').toUpperCase().match(/(?:FC)?LGA\s*\d{3,4}|AM[345]|TRX\d+|STR\d+|TR\d+|WRX\d+|STRP\d+/g) || [];
  return matches.flatMap(socketAliases);
}

function connectivityTokens(value) {
  const n = normBrowseText(value);
  const tokens = [];
  if (n.includes('wi fi') || n.includes('wifi')) tokens.push('wi-fi');
  if (n.includes('5g')) tokens.push('5g');
  if (n.includes('4g') || n.includes('cellular') || n.includes('lte')) tokens.push('4g');
  return tokens;
}

function extractBrowseFilterTokens(pb) {
  const flat = flattenBrowseSpecs(pb);
  const tokens = [];
  const seen = new Set();
  const add = (token) => { if (token && !seen.has(token)) { seen.add(token); tokens.push(token); } };
  const first = (keys) => firstBrowseValue(flat, keys);
  const exact = (keys) => {
    for (const key of keys) if (flat[key] != null && flat[key] !== '') return String(flat[key]);
    return first(keys);
  };
  const category = browseCategory(pb);
  const ramCapacityKeys = category === 'ram'
    ? ['Bellek Kapasitesi', 'Memory Capacity', 'RAM Capacity', 'Capacity', 'Kapasite', 'Speicherkapazitat', 'Speicherkapazität', 'Arbeitsspeicher Kapazitat', 'Arbeitsspeicher Kapazität']
    : ['Memory (RAM)', 'RAM', 'memory ram', 'Bellek (RAM)', 'Bellek', 'Arbeitsspeicher', 'Hauptspeicher'];

  if (allowBrowseToken(pb, 'ram')) {
    const ram = ramTokenGb(first(ramCapacityKeys)) || (category === 'ram' ? ramTokenGb(pb.name) : null);
    if (ram !== null) add(`ram:${ram}_gb`);
    const ramType = bucket(first(['RAM Type', 'Memory Type', 'Memory Technology', 'Bellek Tipi', 'Bellek Türü', 'Bellek Teknolojisi', 'Speichertyp', 'Speicherart', 'Speichertechnologie']), [['lpddr5x', 'lpddr5x'], ['lpddr5', 'lpddr5'], ['lpddr4x', 'lpddr4x'], ['ddr5', 'ddr5'], ['ddr4', 'ddr4'], ['ddr3', 'ddr3']]) || (category === 'ram' ? bucket(pb.name, [['lpddr5x', 'lpddr5x'], ['lpddr5', 'lpddr5'], ['lpddr4x', 'lpddr4x'], ['ddr5', 'ddr5'], ['ddr4', 'ddr4'], ['ddr3', 'ddr3']]) : null);
    if (ramType) add(`ram_type:${ramType}`);
    if (category === 'ram') {
      const speed = ramSpeedMt(first(['Bellek Hızı (OC)', 'Bellek Hızı', 'Memory Speed', 'RAM Speed', 'Speed', 'Speichertakt', 'Taktrate']));
      if (speed) add(`ram_speed:${speed}_mt`);
      const latency = ramLatency(first(['CL (Tepkime Süresi)', 'CAS Latency', 'CL', 'Latency', 'Latenz']));
      if (latency) add(`ram_latency:${latency}_cl`);
      const moduleType = ramModuleToken(first(['Bellek Modülü', 'Memory Module', 'Module Type', 'Form Factor', 'Bauform']));
      if (moduleType) add(`ram_module:${moduleType}`);
      const kit = ramKitToken(first(['Bellek Kiti', 'Memory Kit', 'Kit', 'Bellek Count', 'Module Count']));
      if (kit) add(`ram_kit:${kit}`);
      const platform = ramPlatformToken(first(['Platform', 'Kullanım Alanı', 'Kullanim Alani']));
      if (platform) add(`ram_platform:${platform}`);
      if (ramEccToken(first(['ECC', 'ECC Memory', 'SIMa Düzeltme', 'Hata Düzeltme', 'Error Correction']))) add('ecc:true');
      const lightingFlag = exact(['Işıklandırma', 'Isiklandirma', 'Lighting', 'LED']);
      const lightingDetail = exact(['Işıklandırma Özelliği', 'Isiklandirma Ozelligi', 'Lighting Type', 'RGB']);
      const lightingFlagBool = browseBool(lightingFlag);
      const lightingDetailText = normBrowseText(lightingDetail);
      if (lightingFlagBool === true || (lightingFlagBool !== false && lightingDetailText && !/^(no|false|hayir|yok|n a|-)$/.test(lightingDetailText))) add('lighting:true');
      if (lightingFlagBool !== false && /\brgb\b/.test(lightingDetailText)) add('rgb:true');
      const profileText = normBrowseText(first(['Specifications', 'Profile', 'Overclock Profile', 'Memory Profile', 'Profil']));
      if (/\bxmp\b/.test(profileText)) add('xmp:true');
      if (/\bexpo\b/.test(profileText)) add('expo:true');
    }
  }
  if (allowBrowseToken(pb, 'storage')) {
    const st = storageToken(first(['Hard Disk (SSD) Size', 'SSD Size', 'Internal Storage', 'internal storage', 'Storage Size', 'Storage Capacity', 'Total Storage Capacity', 'Capacity', 'storage', 'Storage', 'Dahili Depolama', 'Depolama', 'Kapasite', 'Speicherkapazitat', 'Speicherkapazität', 'Geratespeicher', 'Gerätespeicher']))
      || storageToken(pb.name);
    if (st) add(`storage:${st}`);
    const stType = bucket(first(['Storage Type', 'Storage Media', 'Disk Type', 'Interface', 'Schnittstelle', 'Depolama Tipi', 'SSD Type']), [['nvme', 'nvme'], ['sata', 'sata'], ['ufs', 'ufs'], ['emmc', 'emmc'], ['ssd', 'ssd'], ['hdd', 'hdd']]);
    if (stType) add(`storage_type:${stType}`);
  }
  if (allowBrowseToken(pb, 'os')) { const os = osToken(first(['Operating System', 'OS', 'Platform', 'İşletim Sistemi', 'Isletim Sistemi', 'Betriebssystem'])); if (os) add(`os:${os}`); }
  if (allowBrowseToken(pb, 'cpu')) { const cpu = processorBrandToken(first(['Processor Brand', 'Processor', 'CPU', 'Chip', 'Chipset', 'İşlemci', 'Islemci', 'İşlemci Markası', 'Yonga Seti', 'Prozessor'])); if (cpu) add(`processor_brand:${cpu}`); }
  if (allowBrowseToken(pb, 'socket')) socketTokensFromText(first(['Socket', 'CPU Socket', 'Processor Socket', 'Soket', 'Sockel', 'Compatible Sockets', 'Socket Support', 'Supported Socket', 'CPU-Sockel'])).forEach(t => add(`socket:${t.toLowerCase()}`));
  if (allowBrowseToken(pb, 'gpu')) { const gpu = gpuTypeToken(first(['GPU Model', 'Graphics Card', 'Graphics Card Type', 'External Graphics Processor (GPU)', 'Integrated Graphics Model', 'Video Card', 'Ekran Kartı', 'Grafik İşlemci', 'Grafik'])); if (gpu) add(`gpu_type:${gpu}`); }
  if (allowBrowseToken(pb, 'display')) {
    const panel = bucket(first(['Screen Technology', 'Display Type', 'Panel Type', 'Display Technology', 'Display', 'Ekran Teknolojisi', 'Panel Tipi', 'Paneltyp', 'Bildschirmtechnologie']), [['dynamic amoled', 'dynamic_amoled'], ['super amoled', 'super_amoled'], ['amoled', 'amoled'], ['ltpo', 'ltpo'], ['oled', 'oled'], ['ips', 'ips'], ['va', 'va'], ['tn', 'tn'], ['lcd', 'lcd']]);
    if (panel) add(`screen_tech:${panel}`);
    const rr = numberFromText(first(['Screen Refresh Rate', 'Refresh Rate', 'Display Refresh Rate', 'Ekran Yenileme Hızı', 'Yenileme Hızı', 'Bildwiederholfrequenz', 'Bildwiederholrate']));
    if (rr !== null) { const hz = Math.round(rr); if ([60, 75, 90, 100, 120, 144, 165, 180, 200, 240, 360, 480].includes(hz)) add(`refresh_rate:${hz}_hz`); }
    if (allowBrowseToken(pb, 'resolution')) {
      const res = resolutionToken(first(['Resolution', 'Screen Resolution', 'Display Resolution', 'Çözünürlük', 'Cozunurluk', 'Auflösung', 'Aufloesung']));
      if (res) add(`resolution:${res}`);
    }
  }
  if (allowBrowseToken(pb, 'displayInput')) displayInputTokens(flat).forEach(t => add(`display_input:${t}`));
  if (allowBrowseToken(pb, 'connectivity')) connectivityTokens(first(['Connectivity', 'Connection Type', '4G', '5G', 'Wi-Fi', 'Bağlantı', 'Baglanti', 'Konnektivitat', 'Konnektivität'])).forEach(t => add(`connectivity:${t}`));
  [['five_g', ['5G', '5G Desteği', '5G Destegi'], 'mobile'], ['nfc', ['NFC'], 'mobile'], ['wireless_charging', ['Wireless Charging', 'Kablosuz Şarj', 'Kablosuz Sarj'], 'mobile'], ['fast_charging', ['Fast Charging', 'Hızlı Şarj', 'Hizli Sarj'], 'charging'], ['fingerprint', ['Fingerprint Reader', 'fingerprint', 'Parmak İzi', 'Parmak Izi'], 'mobile'], ['water_resistance', ['Water Resistance', 'Suya Dayanıklılık', 'Suya Dayaniklilik', 'Wasserdicht'], 'water']].forEach(([token, keys, gate]) => {
    if (allowBrowseToken(pb, gate) && browseBool(first(keys)) === true) add(`${token}:true`);
  });
  return tokens;
}

function extractBrowseNumericFields(pb) {
  const flat = flattenBrowseSpecs(pb);
  let screenSizeValue;
  for (const [key, value] of Object.entries(flat)) {
    if (!isScreenSizeSpecKey(key)) continue;
    const parsed = screenSizeNumber(value, true);
    if (parsed !== null) { screenSizeValue = parsed; break; }
  }
  const batteryRaw = firstExactSpecValue(flat, [
    'Battery Capacity',
    'battery capacity',
    'Battery Capacity (Typical)',
    'Batarya Kapasitesi',
    'Batarya Kapasitesi (Tipik)',
    'Pil Kapasitesi',
  ]);
  // Require a mAh unit — the upstream "Battery capacity" field sometimes holds a
  // non-battery value (SSD "4 TB", lens "88 mm") that must not become "4 mAh".
  const batteryNum = /\d\s*mah\b/.test(String(batteryRaw || '').toLowerCase())
    ? numberFromText(batteryRaw) : null;
  const battery = (batteryNum != null && batteryNum > 0 && batteryNum <= 200000) ? batteryNum : null;
  const weightValueKg = weightKg(firstExactSpecValue(flat, ['Weight', 'Ağırlık', 'Agirlik']));
  return {
    ...(screenSizeValue != null ? { screenSizeValue } : {}),
    ...(battery != null ? { batteryCapacityValue: Math.round(battery) } : {}),
    ...(weightValueKg != null ? { weightValueKg } : {}),
  };
}

function toDoc(pb) {
  const raw = {
    ...pb,
    imageUrl: pb.imageUrl || pb.imageURL || '',
    imageURL: pb.imageURL || pb.imageUrl || '',
    nameTranslated: pb.nameTranslated || {},
    multiLangSpecs: pb.multiLangSpecs || {},
    multiLangSections: pb.multiLangSections || {},
    affiliateLinks: pb.affiliateLinks || {},
    affiliateLinksByCountry: pb.affiliateLinksByCountry || {},
  };
  const browseNumericFields = extractBrowseNumericFields(pb);
  return {
    id: pb.id,
    slug: pb.slug || '',
    name: pb.name || '',
    nameSort: String(pb.name || '').toLowerCase(),
    brand: pb.brand || '',
    category: pb.category || '',
    subcategory: pb.subcategory || '',
    source: pb.source || '',
    imageUrl: pb.imageUrl || pb.imageURL || '',
    techScore: typeof pb.techScore === 'number' ? pb.techScore : 0,
    trendScore: typeof pb.trendScore === 'number' ? pb.trendScore : 0,
    scrapedAtTs: tsDate(pb.scrapedAt || pb.created || pb.updated),
    updatedAtTs: tsDate(pb.updated || pb.scrapedAt || pb.created),
    price_segment: pb.price_segment || '',
    lowestPriceUSD: lowestPriceUsd(pb.prices),
    specsCount: pb.specsCount || 0,
    keySpecsText: flattenKeySpecs(pb.keySpecs),
    tags: Array.isArray(pb.tags) ? pb.tags : [],
    filterTokens: extractBrowseFilterTokens(pb),
    ...browseNumericFields,
    _raw: JSON.stringify(raw),
  };
}

// Seek pagination (sort=id + `id > lastId`) with skipTotal=1. The single
// RAM-constrained host returns a 400 "Something went wrong" when asked for a
// heavy page *and* a full COUNT(*) over ~95k rows while it's already saturated
// by the scraper. Seeking on the primary-key index with no count keeps every
// request light, so the backfill survives an overloaded host.
async function pbSeek(lastId) {
  const filterPart = lastId
    ? `&filter=${encodeURIComponent(`id > "${lastId}"`)}`
    : '';
  return withRetry(`PB seek after ${lastId || 'start'}`, async () => {
    return pbGet(
      `/api/collections/products/records?perPage=${PB_PAGE_SIZE}&page=1&sort=id&skipTotal=1${filterPart}`,
      `PB seek ${lastId || 'start'}`,
    );
  });
}

async function importDocs(items) {
  if (!items.length) return { ok: 0, fail: 0 };
  return withRetry(`TS import ${items[0]?.id || ''}`, async () => {
    const jsonl = items.map(p => JSON.stringify(toDoc(p))).join('\n');
    const body = await tsPost(`/collections/${COL}/documents/import?action=upsert`, jsonl, 'text/plain', `TS import ${items[0]?.id || ''}`);
    let ok = 0, fail = 0;
    for (const line of String(body || '').split('\n').filter(Boolean)) {
      try { JSON.parse(line).success ? ok++ : fail++; } catch { fail++; }
    }
    return { ok, fail };
  });
}

async function withRetry(label, fn, attempts = 6) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      const delay = Math.min(30000, 1000 * 2 ** (i - 1));
      console.warn(`[fast-ts] retry ${i}/${attempts} ${label}: ${e.message || e}`);
      if (i < attempts) await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw last;
}

async function main() {
  await ensureCollection();
  if (ONLY_IDS.length) {
    const filter = encodeURIComponent(ONLY_IDS.map(id => `id="${id}"`).join(' || '));
    const body = await pbGet(
      `/api/collections/products/records?perPage=${ONLY_IDS.length}&page=1&skipTotal=1&filter=${filter}`,
      'PB by-ids',
    );
    const items = body.items || [];
    const r = await importDocs(items);
    console.log(`[fast-ts] targeted ${items.length}/${ONLY_IDS.length} ids · ok=${r.ok} fail=${r.fail}`);
    return;
  }
  console.log(`[fast-ts] seek backfill · pageSize=${PB_PAGE_SIZE} · timeout=${REQUEST_TIMEOUT_MS}ms`);
  let lastId = '';
  let pages = 0;
  let seen = 0;
  let okTotal = 0;
  let failTotal = 0;
  const started = Date.now();

  // Seek by id until a short page signals the end. Sequential by nature, which
  // also keeps the load on the shared host gentle while it heals the index.
  while (true) {
    const body = await pbSeek(lastId);
    const items = body.items || [];
    if (!items.length) break;
    const r = await importDocs(items);
    okTotal += r.ok;
    failTotal += r.fail;
    seen += items.length;
    pages++;
    lastId = items[items.length - 1].id;
    const rate = Math.round(okTotal / ((Date.now() - started) / 1000 || 1));
    console.log(`[fast-ts] batch ${pages} (after ${lastId}) · seen=${seen} ok=${okTotal} fail=${failTotal} · ${rate}/s`);
    if (items.length < PB_PAGE_SIZE) break;
  }

  console.log(`[fast-ts] DONE seen=${seen} ok=${okTotal} fail=${failTotal} seconds=${((Date.now() - started) / 1000).toFixed(1)}`);
}

main().catch(e => {
  console.error('[fast-ts] FAIL', e);
  process.exit(1);
});
