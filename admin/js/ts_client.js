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
  function _normalizeBrowseText(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9+]+/g, ' ').replace(/\s+/g, ' ').trim(); }
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
        if (nsk === nk || nsk.indexOf(nk) !== -1 || nk.indexOf(nsk) !== -1 || csk === ck || csk.indexOf(ck) !== -1 || ck.indexOf(csk) !== -1) {
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

  return function extractBrowse(pb) {
    const flat = _flattenBrowseSpecs(pb);
    const tokens = [], seen = {};
    const addT = (t) => { if (t && !seen[t]) { seen[t] = true; tokens.push(t); } };
    const first = (keys) => { const v = _findBrowseSpecValues(keys, flat); return v.length ? String(v[0]) : ''; };

    const ram = _ramGb(first(['Memory (RAM)', 'RAM', 'memory ram', 'Bellek (RAM)', 'Bellek'])); if (ram !== null) addT('ram:' + ram + '_gb');
    const st = _storageToken(first(['Hard Disk (SSD) Size', 'SSD Size', 'Internal Storage', 'internal storage', 'Storage Size', 'Storage Capacity', 'storage', 'Storage', 'Dahili Depolama', 'Depolama'])); if (st) addT('storage:' + st);
    const os = _osToken(first(['Operating System', 'OS', 'Platform', 'İşletim Sistemi', 'Isletim Sistemi'])); if (os) addT('os:' + os);
    const cpu = _cpuBrand(first(['Processor Brand', 'Processor', 'CPU', 'Chip', 'Chipset', 'İşlemci', 'İşlemci Markası', 'Yonga Seti'])); if (cpu) addT('processor_brand:' + cpu);
    const socketTexts = [pb.name, first(['Socket', 'CPU Socket', 'Processor Socket', 'Soket']), first(['Compatible Sockets', 'Socket Support'])];
    Object.keys(flat).forEach((k) => socketTexts.push(flat[k]));
    socketTexts.forEach((v) => _socketFromText(v).forEach((tk) => addT('socket:' + tk.toLowerCase())));
    const gpu = _gpuType(first(['GPU Model', 'Graphics Card', 'Graphics Card Type', 'External Graphics Processor (GPU)', 'Integrated Graphics Model', 'Video Card', 'Ekran Kartı', 'Grafik İşlemci'])); if (gpu) addT('gpu_type:' + gpu);
    const panel = _matchBucket(first(['Screen Technology', 'Display Type', 'Panel Type', 'Display Technology', 'Display', 'Ekran Teknolojisi', 'Panel Tipi']), [['dynamic amoled', 'dynamic_amoled'], ['super amoled', 'super_amoled'], ['amoled', 'amoled'], ['ltpo', 'ltpo'], ['oled', 'oled'], ['ips', 'ips'], ['va', 'va'], ['tn', 'tn'], ['lcd', 'lcd']]); if (panel) addT('screen_tech:' + panel);
    const rr = _num(first(['Screen Refresh Rate', 'Refresh Rate', 'Display Refresh Rate', 'Ekran Yenileme Hızı', 'Yenileme Hızı'])); if (rr !== null) { const hz = Math.round(rr); if ([60, 75, 90, 120, 144, 165, 180, 240, 360].includes(hz)) addT('refresh_rate:' + hz + '_hz'); }
    _connTokens(first(['Connectivity', 'Connection Type', '4G', '5G', 'Wi-Fi', 'Bağlantı'])).forEach((tk) => addT('connectivity:' + tk));
    [['five_g', ['5G', '5G Desteği']], ['nfc', ['NFC']], ['wireless_charging', ['Wireless Charging', 'Kablosuz Şarj']], ['fast_charging', ['Fast Charging', 'Hızlı Şarj']], ['fingerprint', ['Fingerprint Reader', 'fingerprint', 'Parmak İzi']], ['water_resistance', ['Water Resistance', 'Suya Dayanıklılık']]].forEach(([tok, keys]) => { if (_bool(first(keys)) === true) addT(tok + ':true'); });

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
