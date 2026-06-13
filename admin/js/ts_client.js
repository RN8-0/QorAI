// ═══════════════════════════════════════════════════════════════
//  QOR AI ADMIN — Typesense Client (browser)
//  Mirrors techScore + other indexed fields from PocketBase to
//  the Typesense `products` collection so the Flutter app shows
//  the same value everywhere.
// ═══════════════════════════════════════════════════════════════

const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
// Admin-side API key — scoped to documents:* on `products` only (NOT the
// Typesense bootstrap key). Admin panel is basic-auth protected; even if this
// leaks it cannot manage API keys or touch other collections.
const TS_KEY = 'eyrKnk9DUJyTYqUD0nJFJvewhg27vAYu';
const TS_COLLECTION = 'products';

function _tsHeaders() {
  return {
    'X-TYPESENSE-API-KEY': TS_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

async function tsRequest(method, path, body) {
  const res = await fetch(`${TS_URL}${path}`, {
    method,
    headers: _tsHeaders(),
    body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  const text = await res.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch {}
  if (!res.ok) {
    const err = new Error(`Typesense ${method} ${path} → ${res.status}: ${typeof parsed === 'string' ? parsed.slice(0, 200) : (parsed.message || JSON.stringify(parsed))}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

// Build the same shape used by migration/ts_index.js so the
// document stays compatible with the existing schema.
// Currency conversion table (mirrored from scripts/fx_rates.js — keep in sync).
// Browser bundle has no Node `require`, so the table is duplicated inline.
const FX_TO_USD = Object.freeze({
  US: 1.00, USD: 1.00,
  CA: 0.73, CAD: 0.73, MX: 0.058, MXN: 0.058,
  DE: 1.08, AT: 1.08, NL: 1.08, BE: 1.08, FR: 1.08, IT: 1.08, ES: 1.08,
  PT: 1.08, IE: 1.08, FI: 1.08, GR: 1.08, EU: 1.08, EUR: 1.08,
  UK: 1.27, GB: 1.27, GBP: 1.27,
  PL: 0.25, PLN: 0.25, CH: 1.13, CHF: 1.13,
  SE: 0.094, SEK: 0.094, NO: 0.092, NOK: 0.092, DK: 0.145, DKK: 0.145,
  TR: 0.0286, TRY: 0.0286, AE: 0.272, AED: 0.272, SA: 0.267, SAR: 0.267,
  IN: 0.0120, INR: 0.0120, JP: 0.0067, JPY: 0.0067, CN: 0.14, CNY: 0.14,
  KR: 0.00072, KRW: 0.00072, SG: 0.74, SGD: 0.74, HK: 0.128, HKD: 0.128,
  AU: 0.65, AUD: 0.65, NZ: 0.60, NZD: 0.60,
  BR: 0.20, BRL: 0.20, AR: 0.0011, ARS: 0.0011,
});

function _lowestPriceUsd(prices) {
  if (!prices || typeof prices !== 'object') return 0;
  let lowest = Infinity;
  for (const [rawKey, rawValue] of Object.entries(prices)) {
    const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(value) || value <= 0) continue;
    const fx = FX_TO_USD[String(rawKey || '').toUpperCase()];
    if (!fx) continue;
    const usd = value * fx;
    if (usd < lowest) lowest = usd;
  }
  return lowest === Infinity ? 0 : Math.round(lowest * 100) / 100;
}

function _flattenKeySpecs(ks) {
  if (!ks) return '';
  if (Array.isArray(ks)) return ks.map(x => typeof x === 'object' ? Object.values(x).join(' ') : String(x)).join(' ');
  if (typeof ks === 'object') return Object.values(ks).join(' ');
  return String(ks);
}

function _normalizeSocketToken(value) {
  let socket = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/SOCKET/g, '')
    .replace(/FCLGA/g, 'LGA')
    .replace(/[^A-Z0-9]/g, '');
  if (/^STR\d+$/.test(socket)) socket = socket.slice(1);
  return socket;
}

function _socketAliases(socket) {
  const normalized = _normalizeSocketToken(socket);
  if (!normalized) return [];
  const aliases = new Set([normalized]);
  if (normalized === 'TRX50' || normalized === 'WRX90') aliases.add('TR5');
  if (normalized === 'TRX40' || normalized === 'WRX80') aliases.add('TR4');
  return Array.from(aliases);
}

function _extractSocketTokens(pb) {
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
    matches.flatMap(_socketAliases).forEach(token => tokens.add(`socket:${token.toLowerCase()}`));
  });
  return Array.from(tokens);
}

function _flattenBrowseSpecs(pb) {
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

function _normScreenKey(value) {
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
  const normalized = _normScreenKey(key);
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

function _numberFromText(value) {
  const match = String(value || '').match(/(\d+(?:[.,]\d+)?)/);
  return match ? parseFloat(match[1].replace(',', '.')) : null;
}

function _screenSizeNumber(value, allowUnitless = false) {
  const raw = String(value || '').trim();
  const lower = raw.toLowerCase();
  if (!lower) return null;
  if (/(cm²|cm2|m²|m2|mm\b|piksel|pixel|px|mp\b|mah|hz|nit|ppi|cd\/m|display\s*port|usb|thunderbolt|%|x\s*\d)/i.test(lower)) return null;
  const number = _numberFromText(raw);
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

function _firstSpecValue(flat, aliases) {
  const normalizedAliases = aliases.map(_normScreenKey);
  for (const [key, value] of Object.entries(flat || {})) {
    const normalizedKey = _normScreenKey(key);
    if (normalizedAliases.includes(normalizedKey)) return value;
  }
  return '';
}

function _weightKg(value) {
  const number = _numberFromText(value);
  if (!Number.isFinite(number)) return undefined;
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('kg')) return number;
  if (/\bg\b/.test(normalized)) return number / 1000;
  return number;
}

function _extractBrowseNumericFields(pb) {
  const flat = _flattenBrowseSpecs(pb);
  let screenSizeValue;
  for (const [key, value] of Object.entries(flat)) {
    if (!_isScreenSizeSpecKey(key)) continue;
    const parsed = _screenSizeNumber(value, true);
    if (parsed !== null) { screenSizeValue = parsed; break; }
  }
  const battery = _numberFromText(_firstSpecValue(flat, [
    'Battery Capacity',
    'battery capacity',
    'Battery Capacity (Typical)',
    'Batarya Kapasitesi',
    'Batarya Kapasitesi (Tipik)',
    'Pil Kapasitesi',
  ]));
  const weightValueKg = _weightKg(_firstSpecValue(flat, ['Weight', 'Ağırlık', 'Agirlik']));
  return {
    ...(screenSizeValue != null ? { screenSizeValue } : {}),
    ...(battery != null ? { batteryCapacityValue: Math.round(battery) } : {}),
    ...(weightValueKg != null ? { weightValueKg } : {}),
  };
}

// Full browse-filter extraction (filterTokens + screenSizeValue +
// batteryCapacityValue + weightValueKg). Ported VERBATIM from
// scripts/reindex_filter_tokens.mjs (which itself ports
// pb_hooks/typesense_sync.pb.js) and wrapped in an IIFE so its helpers can't
// collide with the admin's other spec helpers.
//
// Before this, tsBuildDoc emitted ONLY the `socket:` token, so every product
// the admin touched (edit, image delete, re-scrape) was re-indexed without its
// ram/storage/os/screen_tech/… tokens and silently dropped out of the website +
// app browse filters until the next reindex job. Using the same rich extraction
// the reindex job uses keeps admin edits non-destructive.
const _fbExtractBrowse = (() => {
  const CAT_SETS = {
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
  const cat = (pb) => String(pb?.category || '').toLowerCase();
  const allow = (pb, key) => CAT_SETS[key]?.has(cat(pb));
  const esc = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function _normalizeBrowseText(v) {
    return String(v || '').toLowerCase()
      .replace(/[ıİ]/g, 'i').replace(/[ğĞ]/g, 'g').replace(/[üÜ]/g, 'u')
      .replace(/[şŞ]/g, 's').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c')
      .replace(/[äÄ]/g, 'a').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9+]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function _flattenBrowseSpecs(pb) {
    const flat = {};
    const add = (o) => o && Object.keys(o).forEach((k) => { const v = o[k]; if (v != null) flat[String(k)] = String(v); });
    add(pb.specs); add(pb.keySpecs);
    const sec = pb.specSections || {};
    Object.keys(sec).forEach((s) => { if (sec[s] && typeof sec[s] === 'object') add(sec[s]); });
    return flat;
  }
  function _findBrowseSpecValues(keys, flat) {
    const out = [], seen = {};
    keys.forEach((key) => {
      if (flat[key] && !seen[flat[key]]) { seen[flat[key]] = true; out.push(flat[key]); }
      const nk = _normalizeBrowseText(key), ck = nk.replace(/\s+/g, '');
      Object.keys(flat).forEach((sk) => {
        const nsk = _normalizeBrowseText(sk), csk = nsk.replace(/\s+/g, '');
        const short = nk.length <= 3;
        const word = new RegExp('(^| )' + esc(nk) + '( |$)');
        const matches = nsk === nk || csk === ck || (!short && (
          nsk.indexOf(nk) !== -1 || nk.indexOf(nsk) !== -1 || csk.indexOf(ck) !== -1 || ck.indexOf(csk) !== -1
        )) || (short && word.test(nsk));
        if (matches) {
          const v = flat[sk]; if (v && !seen[v]) { seen[v] = true; out.push(v); }
        }
      });
    });
    return out;
  }
  function _num(v) { const m = String(v || '').match(/(\d+(?:[.,]\d+)?)/); return m ? parseFloat(m[1].replace(',', '.')) : null; }
  function _normScreenKey(v) {
    return String(v || '')
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
    const n = _normScreenKey(key);
    if (!n) return false;
    if (/(width|height|genis|en\b|boy\b|area|alani|cm2|cm 2|m2|m 2|ratio|oran|displayport|usb|thunderbolt)/.test(n)) return false;
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
    if (aliases.includes(n)) return true;
    return aliases.some((alias) =>
      n.startsWith(`${alias} `) &&
      /\b(in|inc|inch|zoll|cm|diagonal|diagonale)\b/.test(n.slice(alias.length + 1))
    );
  }
  function _screenSizeNumber(value, allowUnitless = false) {
    const raw = String(value || '').trim();
    const v = raw.toLowerCase();
    if (!v) return null;
    if (/(cm²|cm2|m²|m2|mm\b|piksel|pixel|px|mp\b|mah|hz|nit|ppi|cd\/m|display\s*port|usb|thunderbolt|%|x\s*\d)/i.test(v)) return null;
    const m = raw.match(/(\d+(?:[.,]\d+)?)/);
    if (!m) return null;
    const num = parseFloat(m[1].replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0) return null;
    if (/(inch|inç|zoll|"|″|\d+(?:[.,]\d+)?\s*in\b)/i.test(raw)) {
      return num >= 1 && num <= 120 ? num : null;
    }
    if (/\bcm\b/i.test(raw)) {
      const inches = num / 2.54;
      return inches >= 1 && inches <= 120 ? Math.round(inches * 10) / 10 : null;
    }
    return allowUnitless && num >= 1 && num <= 120 ? num : null;
  }
  function _screenSizeFromFlat(flat) {
    for (const [key, value] of Object.entries(flat || {})) {
      if (!_isScreenSizeSpecKey(key)) continue;
      const parsed = _screenSizeNumber(value, true);
      if (parsed !== null) return parsed;
    }
    return null;
  }
  function _bool(v) { const n = _normalizeBrowseText(v); if (!n) return null; if (['no', 'false', 'hayir', 'yok', 'n a', '-'].includes(n)) return false; return true; }
  function _storageToken(v) {
    const n = _normalizeBrowseText(v);
    if (!n) return null;
    const tb = n.match(/(\d+(?:[.,]\d+)?)\s*tb\b/);
    if (tb) { const t = Math.round(parseFloat(tb[1].replace(',', '.'))); return t > 0 && t <= 256 ? t + '_tb' : null; }
    if (!/\d\s*gb\b/.test(n)) return null;
    const x = _num(v);
    if (x === null || x <= 0 || x > 262144) return null;
    return Math.round(x) + '_gb';
  }
  function _ramGb(v) {
    const n = _normalizeBrowseText(v);
    if (!n || !/\d\s*gb\b/.test(n) || /\d\s*tb\b/.test(n)) return null;
    const x = _num(v);
    if (x === null || x <= 0 || x > 256) return null;
    return Math.round(x);
  }
  function _batteryMah(v) {
    const n = _normalizeBrowseText(v);
    if (!n || !/\d\s*mah\b/.test(n)) return null;
    const x = _num(v);
    if (x === null || x <= 0 || x > 200000) return null;
    return Math.round(x);
  }
  function _osToken(v) { const n = _normalizeBrowseText(v); if (!n) return null; if (n.includes('chrome os') || n.includes('chromeos')) return 'chromeos'; if (n.includes('ipad os') || n.includes('ipados')) return 'ipados'; if (n.includes('mac os') || n.includes('macos') || n.includes('os x')) return 'macos'; if (n.includes('windows')) return 'windows'; if (n.includes('android')) return 'android'; if (n.includes('linux')) return 'linux'; if (n.includes('ios') || n.includes('iphone os')) return 'ios'; return null; }
  function _cpuBrand(v) { const n = _normalizeBrowseText(v); if (!n) return null; if (n.includes('intel')) return 'intel'; if (n.includes('amd')) return 'amd'; if (n.includes('apple')) return 'apple'; if (n.includes('qualcomm') || n.includes('snapdragon')) return 'qualcomm'; if (n.includes('mediatek')) return 'mediatek'; if (n.includes('exynos')) return 'exynos'; return null; }
  function _gpuType(v) { const n = _normalizeBrowseText(v); if (!n) return null; if (['rtx', 'gtx', 'geforce', 'radeon', 'arc', 'dedicated', 'discrete'].some((x) => n.includes(x))) return 'dedicated'; if (['integrated', 'shared', 'iris', 'uhd', 'intel hd', 'apple gpu'].some((x) => n.includes(x))) return 'integrated'; return null; }
  function _connTokens(v) { const n = _normalizeBrowseText(v); const t = []; if (n.includes('wi fi') || n.includes('wifi')) t.push('wi-fi'); if (n.includes('5g')) t.push('5g'); if (n.includes('4g') || n.includes('cellular') || n.includes('lte')) t.push('4g'); return t; }
  function _weightKg(v) { const n = _normalizeBrowseText(v), x = _num(v); if (x === null) return null; if (n.includes('kg')) return x; if (n.includes('g')) return x / 1000; return x; }
  function _normSocket(v) { let s = String(v || '').trim().toUpperCase().replace(/SOCKET/g, '').replace(/FCLGA/g, 'LGA').replace(/[^A-Z0-9]/g, ''); if (/^STR\d+$/.test(s)) s = s.slice(1); return s; }
  function _socketAliases(s) { const n = _normSocket(s); if (!n) return []; const a = [n]; if (n === 'TRX50' || n === 'WRX90') a.push('TR5'); if (n === 'TRX40' || n === 'WRX80') a.push('TR4'); return a; }
  function _socketFromText(v) { const text = String(v || '').toUpperCase(); const m = text.match(/(?:FC)?LGA\s*\d{3,4}|AM[345]|TRX\d+|STR\d+|TR\d+|WRX\d+|STRP\d+/g) || []; const t = []; m.forEach((x) => _socketAliases(x).forEach((a) => t.push(a))); return t; }
  function _matchBucket(raw, pairs) { const n = _normalizeBrowseText(raw); for (const [k, v] of pairs) if (n.indexOf(k) !== -1) return v; return null; }
  function _resolutionToken(v) {
    const n = _normalizeBrowseText(v);
    const raw = String(v || '').toLowerCase();
    if (!n) return null;
    const m = raw.match(/(\d{3,5})\s*[x×]\s*(\d{3,5})/i);
    if (m) {
      const w = Number(m[1]), h = Number(m[2]);
      if (w >= 7000 || h >= 4000) return '8k';
      if (w >= 5000 || h >= 2500) return '5k';
      if (w >= 3800 || h >= 2000) return '4k';
      if (w >= 3300 && h >= 1300) return 'uwqhd';
      if (w >= 2500 || h >= 1400) return 'qhd';
      if (w >= 1900 || h >= 1000) return 'fhd';
      if (w >= 1200 || h >= 700) return 'hd';
    }
    if (/\b8k\b/.test(n)) return '8k';
    if (/\b5k\b/.test(n)) return '5k';
    if (/\b4k\b|ultra hd|uhd/.test(n)) return '4k';
    if (/uwqhd|ultrawide qhd|3440/.test(n)) return 'uwqhd';
    if (/\bwqhd\b|\bqhd\b|1440p|2k/.test(n)) return 'qhd';
    if (/full hd|\bfhd\b|1080p/.test(n)) return 'fhd';
    return null;
  }
  function _displayInputTokens(flat) {
    const tokens = new Set();
    Object.entries(flat || {}).forEach(([key, value]) => {
      if (_bool(value) === false) return;
      const text = _normalizeBrowseText(`${key} ${value}`);
      if (/\bhdmi\b/.test(text)) tokens.add('hdmi');
      if (/display\s*port|displayport|\bdp\b/.test(text)) tokens.add('displayport');
      if (/usb c|usb type c|type c/.test(text)) tokens.add('usb_c');
      if (/thunderbolt/.test(text)) tokens.add('thunderbolt');
      if (/\bdvi\b/.test(text)) tokens.add('dvi');
      if (/\bvga\b/.test(text)) tokens.add('vga');
    });
    return Array.from(tokens);
  }
  function _ramType(v) { return _matchBucket(v, [['lpddr5x', 'lpddr5x'], ['lpddr5', 'lpddr5'], ['lpddr4x', 'lpddr4x'], ['ddr5', 'ddr5'], ['ddr4', 'ddr4'], ['ddr3', 'ddr3']]); }
  function _storageType(v) { return _matchBucket(v, [['nvme', 'nvme'], ['sata', 'sata'], ['ufs', 'ufs'], ['emmc', 'emmc'], ['ssd', 'ssd'], ['hdd', 'hdd']]); }
  function _ramSpeedMt(v) {
    const n = _normalizeBrowseText(v);
    if (!n || !/(mt|mhz)\b/.test(n)) return null;
    const x = _num(v);
    return x !== null && x >= 400 && x <= 10000 ? Math.round(x) : null;
  }
  function _ramLatency(v) {
    const x = _num(v);
    return x !== null && x >= 1 && x <= 80 ? Math.round(x) : null;
  }
  function _ramModule(v) {
    const n = _normalizeBrowseText(v);
    if (!n) return null;
    if (/lrdimm|lr dimm/.test(n)) return 'lrdimm';
    if (/\brdimm\b|registered/.test(n)) return 'rdimm';
    if (/\budimm\b|unbuffered/.test(n)) return 'udimm';
    if (/so dimm|sodimm/.test(n)) return 'sodimm';
    if (/\bdimm\b/.test(n)) return 'dimm';
    return null;
  }
  function _ramPlatform(v) {
    const n = _normalizeBrowseText(v);
    if (!n) return null;
    if (/masaustu|desktop|pc\b/.test(n)) return 'desktop';
    if (/dizustu|laptop|notebook/.test(n)) return 'laptop';
    if (/sunucu|server/.test(n)) return 'server';
    return null;
  }
  function _ramKit(v) {
    const n = _normalizeBrowseText(v);
    const m = n.match(/\b([1-8])\s*(?:x|li|lu|modul|module|modules)\b/);
    return m ? m[1] + '_modules' : null;
  }
  function _ramEcc(v) {
    const n = _normalizeBrowseText(v);
    if (!n || /non ecc|nonecc|no|hayir|yok/.test(n)) return false;
    return /\becc\b|error correction|hata duzelt/.test(n);
  }

  return function extractBrowse(pb) {
    const flat = _flattenBrowseSpecs(pb);
    const tokens = [], seen = {};
    const addT = (t) => { if (t && !seen[t]) { seen[t] = true; tokens.push(t); } };
    const first = (keys) => { const v = _findBrowseSpecValues(keys, flat); return v.length ? String(v[0]) : ''; };
    const exact = (keys) => {
      for (const key of keys) if (flat[key] != null && flat[key] !== '') return String(flat[key]);
      return first(keys);
    };
    const category = cat(pb);
    const ramCapacityKeys = category === 'ram'
      ? ['Bellek Kapasitesi', 'Memory Capacity', 'RAM Capacity', 'Capacity', 'Kapasite', 'Speicherkapazitat', 'Speicherkapazität', 'Arbeitsspeicher Kapazitat', 'Arbeitsspeicher Kapazität']
      : ['Memory (RAM)', 'RAM', 'memory ram', 'Bellek (RAM)', 'Bellek', 'Arbeitsspeicher', 'Hauptspeicher'];

    if (allow(pb, 'ram')) {
      const ram = _ramGb(first(ramCapacityKeys)) || (category === 'ram' ? _ramGb(pb.name) : null); if (ram !== null) addT('ram:' + ram + '_gb');
      const rt = _ramType(first(['RAM Type', 'Memory Type', 'Memory Technology', 'Bellek Tipi', 'Bellek Türü', 'Bellek Teknolojisi', 'Speichertyp', 'Speicherart', 'Speichertechnologie'])) || (category === 'ram' ? _ramType(pb.name) : null); if (rt) addT('ram_type:' + rt);
      if (category === 'ram') {
        const speed = _ramSpeedMt(first(['Bellek Hızı (OC)', 'Bellek Hızı', 'Memory Speed', 'RAM Speed', 'Speed', 'Speichertakt', 'Taktrate'])); if (speed) addT('ram_speed:' + speed + '_mt');
        const latency = _ramLatency(first(['CL (Tepkime Süresi)', 'CAS Latency', 'CL', 'Latency', 'Latenz'])); if (latency) addT('ram_latency:' + latency + '_cl');
        const moduleType = _ramModule(first(['Bellek Modülü', 'Memory Module', 'Module Type', 'Form Factor', 'Bauform'])); if (moduleType) addT('ram_module:' + moduleType);
        const kit = _ramKit(first(['Bellek Kiti', 'Memory Kit', 'Kit', 'Bellek Count', 'Module Count'])); if (kit) addT('ram_kit:' + kit);
        const platform = _ramPlatform(first(['Platform', 'Kullanım Alanı', 'Kullanim Alani'])); if (platform) addT('ram_platform:' + platform);
        if (_ramEcc(first(['ECC', 'ECC Memory', 'SIMa Düzeltme', 'Hata Düzeltme', 'Error Correction']))) addT('ecc:true');
        const lightingFlag = exact(['Işıklandırma', 'Isiklandirma', 'Lighting', 'LED']);
        const lightingDetail = exact(['Işıklandırma Özelliği', 'Isiklandirma Ozelligi', 'Lighting Type', 'RGB']);
        const lightingFlagBool = _bool(lightingFlag);
        const lightingDetailText = _normalizeBrowseText(lightingDetail);
        if (lightingFlagBool === true || (lightingFlagBool !== false && lightingDetailText && !/^(no|false|hayir|yok|n a|-)$/.test(lightingDetailText))) addT('lighting:true');
        if (lightingFlagBool !== false && /\brgb\b/.test(lightingDetailText)) addT('rgb:true');
        const profileText = _normalizeBrowseText(first(['Specifications', 'Profile', 'Overclock Profile', 'Memory Profile', 'Profil']));
        if (/\bxmp\b/.test(profileText)) addT('xmp:true');
        if (/\bexpo\b/.test(profileText)) addT('expo:true');
      }
    }
    if (allow(pb, 'storage')) {
      const st = _storageToken(first(['Hard Disk (SSD) Size', 'SSD Size', 'Internal Storage', 'internal storage', 'Storage Size', 'Storage Capacity', 'Total Storage Capacity', 'Capacity', 'storage', 'Storage', 'Dahili Depolama', 'Depolama', 'Kapasite', 'Speicherkapazitat', 'Speicherkapazität', 'Geratespeicher', 'Gerätespeicher'])) || _storageToken(pb.name); if (st) addT('storage:' + st);
      const sty = _storageType(first(['Storage Type', 'Storage Media', 'Disk Type', 'Interface', 'Schnittstelle', 'Depolama Tipi', 'SSD Type'])); if (sty) addT('storage_type:' + sty);
    }
    if (allow(pb, 'os')) { const os = _osToken(first(['Operating System', 'OS', 'Platform', 'İşletim Sistemi', 'Isletim Sistemi', 'Betriebssystem'])); if (os) addT('os:' + os); }
    if (allow(pb, 'cpu')) { const cpu = _cpuBrand(first(['Processor Brand', 'Processor', 'CPU', 'Chip', 'Chipset', 'İşlemci', 'Islemci', 'İşlemci Markası', 'Yonga Seti', 'Prozessor'])); if (cpu) addT('processor_brand:' + cpu); }
    if (allow(pb, 'socket')) {
      const socketText = first(['Socket', 'CPU Socket', 'Processor Socket', 'Soket', 'Sockel', 'Compatible Sockets', 'Socket Support', 'Supported Socket', 'CPU-Sockel']);
      _socketFromText(socketText).forEach((tk) => addT('socket:' + tk.toLowerCase()));
    }
    if (allow(pb, 'gpu')) { const gpu = _gpuType(first(['GPU Model', 'Graphics Card', 'Graphics Card Type', 'External Graphics Processor (GPU)', 'Integrated Graphics Model', 'Video Card', 'Ekran Kartı', 'Grafik İşlemci', 'Grafik'])); if (gpu) addT('gpu_type:' + gpu); }
    if (allow(pb, 'display')) {
      const panel = _matchBucket(first(['Screen Technology', 'Display Type', 'Panel Type', 'Display Technology', 'Display', 'Ekran Teknolojisi', 'Panel Tipi', 'Paneltyp', 'Bildschirmtechnologie']), [['dynamic amoled', 'dynamic_amoled'], ['super amoled', 'super_amoled'], ['amoled', 'amoled'], ['ltpo', 'ltpo'], ['oled', 'oled'], ['ips', 'ips'], ['va', 'va'], ['tn', 'tn'], ['lcd', 'lcd']]); if (panel) addT('screen_tech:' + panel);
      const rr = _num(first(['Screen Refresh Rate', 'Refresh Rate', 'Display Refresh Rate', 'Ekran Yenileme Hızı', 'Yenileme Hızı', 'Bildwiederholfrequenz', 'Bildwiederholrate'])); if (rr !== null) { const hz = Math.round(rr); if ([60, 75, 90, 100, 120, 144, 165, 180, 200, 240, 360, 480].includes(hz)) addT('refresh_rate:' + hz + '_hz'); }
      if (allow(pb, 'resolution')) { const res = _resolutionToken(first(['Resolution', 'Screen Resolution', 'Display Resolution', 'Çözünürlük', 'Cozunurluk', 'Auflösung', 'Aufloesung'])); if (res) addT('resolution:' + res); }
    }
    if (allow(pb, 'displayInput')) _displayInputTokens(flat).forEach((tk) => addT('display_input:' + tk));
    if (allow(pb, 'connectivity')) _connTokens(first(['Connectivity', 'Connection Type', '4G', '5G', 'Wi-Fi', 'Bağlantı', 'Baglanti', 'Konnektivitat', 'Konnektivität'])).forEach((tk) => addT('connectivity:' + tk));
    [['five_g', ['5G', '5G Desteği', '5G Destegi'], 'mobile'], ['nfc', ['NFC'], 'mobile'], ['wireless_charging', ['Wireless Charging', 'Kablosuz Şarj', 'Kablosuz Sarj'], 'mobile'], ['fast_charging', ['Fast Charging', 'Hızlı Şarj', 'Hizli Sarj'], 'charging'], ['fingerprint', ['Fingerprint Reader', 'fingerprint', 'Parmak İzi', 'Parmak Izi'], 'mobile'], ['water_resistance', ['Water Resistance', 'Suya Dayanıklılık', 'Suya Dayaniklilik', 'Wasserdicht'], 'water']].forEach(([tok, keys, gate]) => { if (allow(pb, gate) && _bool(first(keys)) === true) addT(tok + ':true'); });

    const screen = _screenSizeFromFlat(flat);
    const battery = _batteryMah(first(['Battery Capacity', 'Battery Capacity (Typical)', 'Batarya Kapasitesi', 'Batarya Kapasitesi (Tipik)', 'Pil Kapasitesi']));
    return {
      tokens,
      screenSizeValue: screen || undefined,
      batteryCapacityValue: battery === null ? undefined : battery,
      weightValueKg: _weightKg(first(['Weight', 'Ağırlık'])) || undefined,
    };
  };
})();

function tsBuildDoc(pb) {
  const tsDate = (value) => {
    const t = value ? new Date(value).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  };
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
  const browse = _fbExtractBrowse(pb);
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
    lowestPriceUSD: _lowestPriceUsd(pb.prices),
    specsCount: pb.specsCount || 0,
    keySpecsText: _flattenKeySpecs(pb.keySpecs),
    tags: Array.isArray(pb.tags) ? pb.tags : [],
    filterTokens: browse.tokens,
    ...(browse.screenSizeValue != null ? { screenSizeValue: browse.screenSizeValue } : {}),
    ...(browse.batteryCapacityValue != null ? { batteryCapacityValue: browse.batteryCapacityValue } : {}),
    ...(browse.weightValueKg != null ? { weightValueKg: browse.weightValueKg } : {}),
    _raw: JSON.stringify(raw),
  };
}

// Upsert a single full document (use after big edits / first scrape).
async function tsUpsertDoc(pbRecord) {
  if (!pbRecord || !pbRecord.id) return false;
  const doc = tsBuildDoc(pbRecord);
  try {
    await tsRequest('POST', `/collections/${TS_COLLECTION}/documents?action=upsert`, doc);
    return true;
  } catch (e) {
    console.warn('[ts] upsert failed', pbRecord.id, e.message);
    return false;
  }
}

// Patch only specific fields on an existing TS document.
// Falls back to full upsert when the doc isn't there yet.
async function tsPatchDoc(id, partial, fallbackPbRecord) {
  if (!id || !partial) return false;
  try {
    await tsRequest('PATCH', `/collections/${TS_COLLECTION}/documents/${encodeURIComponent(id)}`, partial);
    return true;
  } catch (e) {
    if (e.status === 404 && fallbackPbRecord) {
      return tsUpsertDoc(fallbackPbRecord);
    }
    console.warn('[ts] patch failed', id, e.message);
    return false;
  }
}

// Bulk import: array of full PB records → JSONL upsert.
// Returns { ok, fail } counts. Chunked at 500 docs per request.
async function tsBulkUpsert(pbRecords, onProgress) {
  const out = { ok: 0, fail: 0 };
  const CHUNK = 500;
  for (let i = 0; i < pbRecords.length; i += CHUNK) {
    const slice = pbRecords.slice(i, i + CHUNK);
    const jsonl = slice.map(p => JSON.stringify(tsBuildDoc(p))).join('\n');
    try {
      const res = await fetch(`${TS_URL}/collections/${TS_COLLECTION}/documents/import?action=upsert`, {
        method: 'POST',
        headers: { ...(_tsHeaders()), 'Content-Type': 'text/plain' },
        body: jsonl,
      });
      const text = await res.text();
      const lines = text.split('\n').filter(Boolean);
      for (const line of lines) {
        try { const j = JSON.parse(line); j.success ? out.ok++ : out.fail++; }
        catch { out.fail++; }
      }
    } catch (e) {
      out.fail += slice.length;
      console.warn('[ts] bulk chunk failed:', e.message);
    }
    if (typeof onProgress === 'function') onProgress(Math.min(i + CHUNK, pbRecords.length), pbRecords.length);
  }
  return out;
}

// Full-text search — fast and typo-tolerant. Returns the raw Typesense
// response ({ found, hits:[{document}], … }); each document carries `_raw`
// (the full PocketBase record JSON) so callers get complete product objects.
async function tsSearch(query, opts = {}) {
  const params = new URLSearchParams({
    q: String(query || '').trim() || '*',
    query_by: 'name,brand,category,keySpecsText',
    query_by_weights: '5,3,2,1',
    sort_by: opts.sortBy || (String(query || '').trim() ? '_text_match:desc,techScore:desc' : 'techScore:desc'),
    per_page: String(Math.min(250, Math.max(1, opts.perPage || 100))),
    page: String(opts.page || 1),
    num_typos: '2',
    typo_tokens_threshold: '1',
    drop_tokens_threshold: '2',
    prefix: 'true',
  });
  if (opts.filterBy) params.set('filter_by', opts.filterBy);
  if (opts.includeFields) params.set('include_fields', opts.includeFields);
  return tsRequest('GET', `/collections/${TS_COLLECTION}/documents/search?${params.toString()}`);
}

// Public surface
window.TsClient = {
  upsertDoc: tsUpsertDoc,
  patchDoc: tsPatchDoc,
  bulkUpsert: tsBulkUpsert,
  buildDoc: tsBuildDoc,
  search: tsSearch,
  request: tsRequest,
  COLLECTION: TS_COLLECTION,
  URL: TS_URL,
};
