// ─────────────────────────────────────────────────────────────────────────────
//  Re-compute Typesense browse filters (filterTokens + screenSizeValue +
//  batteryCapacityValue + weightValueKg) for every product.
//
//  Most products were bulk-indexed by ts_fast_upsert / admin ts_client, which
//  only emitted the `socket:` token — so category filtering had almost no data.
//  This ports the FULL extraction from pb_hooks/typesense_sync.pb.js and writes
//  the tokens straight into each Typesense document (partial update), so the
//  category sidebar can offer rich, epey-style filters across every category.
//
//  Usage:  node scripts/reindex_filter_tokens.mjs            # all categories
//          node scripts/reindex_filter_tokens.mjs --dry      # preview counts
//          node scripts/reindex_filter_tokens.mjs --cats smartphones,laptops
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', 'migration', '.env'), 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const K = ENV.TYPESENSE_API_KEY;
const HDR = { 'X-TYPESENSE-API-KEY': K };
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const CONC = (() => { const i = args.indexOf('--concurrency'); return i >= 0 ? Number(args[i + 1]) : 8; })();
const CAT_FILTER = (() => { const i = args.indexOf('--cats'); return i >= 0 ? args[i + 1].split(',').map((s) => s.trim()) : null; })();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── extraction (mirrors pb_hooks/typesense_sync.pb.js) ───────────────────────
const CAT_SETS = {
  storage: new Set(['smartphones', 'tablets', 'laptops', 'desktops', 'gaming_consoles', 'consoles', 'media_players', 'vr_headsets', 'e_readers', 'e-readers', 'ssd', 'ssds', 'storage', 'flash_drives', 'smartwatches', 'tvs']),
  ram: new Set(['smartphones', 'tablets', 'laptops', 'desktops', 'gaming_consoles', 'consoles', 'media_players', 'vr_headsets', 'e_readers', 'e-readers', 'ram', 'smartwatches', 'tvs']),
  display: new Set(['monitors', 'tvs', 'projectors', 'smartphones', 'tablets', 'laptops', 'smartwatches', 'e_readers', 'e-readers', 'vr_headsets']),
  resolution: new Set(['monitors', 'tvs', 'projectors', 'smartphones', 'tablets', 'laptops']),
  displayInput: new Set(['monitors', 'tvs', 'projectors']),
  os: new Set(['smartphones', 'tablets', 'laptops', 'desktops', 'gaming_consoles', 'consoles', 'media_players', 'vr_headsets', 'e_readers', 'e-readers', 'smartwatches', 'tvs']),
  cpu: new Set(['smartphones', 'tablets', 'laptops', 'desktops', 'smartwatches', 'cpus']),
  gpu: new Set(['laptops', 'desktops']),
  gpuBrand: new Set(['laptops', 'desktops', 'graphics_cards']),
  vram: new Set(['laptops', 'desktops', 'graphics_cards']),
  vramType: new Set(['graphics_cards']),
  socket: new Set(['cpus', 'motherboards', 'cpu_coolers']),
  connectivity: new Set(['smartphones', 'tablets', 'smartwatches', 'laptops', 'routers', 'wifi_routers', 'modem_routers']),
  mobile: new Set(['smartphones', 'tablets', 'smartwatches']),
  charging: new Set(['smartphones', 'tablets', 'laptops', 'smartwatches', 'headphones', 'earbuds', 'powerbanks']),
  wirelessCharging: new Set(['smartphones', 'smartwatches', 'earbuds', 'headphones', 'powerbanks']),
  water: new Set(['smartphones', 'smartwatches', 'headphones', 'earbuds', 'speakers']),
  // Input peripherals & audio.
  peripheralConn: new Set(['mice', 'keyboards', 'headphones', 'earbuds', 'speakers']),
  peripheralLight: new Set(['mice', 'keyboards']),
  dpi: new Set(['mice']),
  keyType: new Set(['keyboards']),
  headphoneType: new Set(['headphones']),
  anc: new Set(['headphones', 'earbuds']),
  // Power.
  psu: new Set(['psu']),
  pbCapacity: new Set(['powerbanks']),
};
const cat = (pb) => String(pb?.category || '').toLowerCase();
const allow = (pb, key) => CAT_SETS[key]?.has(cat(pb));

function _normalizeBrowseText(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[ıİ]/g, 'i')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[şŞ]/g, 's')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .replace(/[äÄ]/g, 'a')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
      const word = new RegExp('(^| )' + nk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( |$)');
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
  // Real storage always carries a GB unit; without it the number belongs to a
  // different spec (battery mAh, PSU watt, lens mm, router Mbps…) that leaked in.
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
function _cpuBrand(v) {
  const n = _normalizeBrowseText(v);
  if (!n) return null;
  if (n.includes('intel') || /\b(core i[3579]|celeron|pentium|xeon|core ultra)\b/.test(n)) return 'intel';
  if (n.includes('amd') || /\b(ryzen|athlon|threadripper|epyc)\b/.test(n)) return 'amd';
  if (n.includes('apple') || n.includes('bionic') || /\bm[1-5](\s*(pro|max|ultra))?\b/.test(n) || /\ba1[0-9]\b/.test(n)) return 'apple';
  if (n.includes('qualcomm') || n.includes('snapdragon')) return 'qualcomm';
  if (n.includes('mediatek') || n.includes('dimensity') || n.includes('helio')) return 'mediatek';
  if (n.includes('exynos') || n.includes('samsung')) return 'exynos';
  if (n.includes('tensor') || n.includes('google')) return 'google';
  if (n.includes('kirin') || n.includes('hisilicon')) return 'kirin';
  if (n.includes('unisoc') || n.includes('spreadtrum')) return 'unisoc';
  return null;
}
function _gpuType(v) { const n = _normalizeBrowseText(v); if (!n) return null; if (['rtx', 'gtx', 'geforce', 'radeon', 'arc', 'dedicated', 'discrete'].some((x) => n.includes(x))) return 'dedicated'; if (['integrated', 'shared', 'iris', 'uhd', 'intel hd', 'apple gpu'].some((x) => n.includes(x))) return 'integrated'; return null; }
function _gpuBrand(v) {
  const n = _normalizeBrowseText(v);
  if (!n) return null;
  if (/\bnvidia\b|geforce|\brtx\b|\bgtx\b|quadro|\bmx ?\d|tesla/.test(n)) return 'nvidia';
  if (/\bamd\b|radeon|\brx ?\d|\bvega\b|firepro/.test(n)) return 'amd';
  if (/\bintel\b|\barc\b|\biris\b|\buhd\b|intel hd|intel graphics/.test(n)) return 'intel';
  if (/\bapple\b|\bm[1-5]( ?(pro|max|ultra))?\b/.test(n)) return 'apple';
  return null;
}
// VRAM (graphics-card / discrete-GPU memory). GB required; capped well below RAM.
function _vramGb(v) {
  const n = _normalizeBrowseText(v);
  if (!n || !/\d\s*gb\b/.test(n) || /\d\s*tb\b/.test(n)) return null;
  const x = _num(v);
  if (x === null || x <= 0 || x > 128) return null;
  return Math.round(x);
}
function _vramType(v) {
  const n = _normalizeBrowseText(v);
  if (!n) return null;
  if (/gddr7/.test(n)) return 'gddr7';
  if (/gddr6x/.test(n)) return 'gddr6x';
  if (/gddr6/.test(n)) return 'gddr6';
  if (/gddr5x/.test(n)) return 'gddr5x';
  if (/gddr5/.test(n)) return 'gddr5';
  if (/gddr4/.test(n)) return 'gddr4';
  if (/hbm2/.test(n)) return 'hbm2';
  if (/\bhbm\b/.test(n)) return 'hbm';
  return null;
}
function _dpiVal(v) {
  const n = _normalizeBrowseText(v);
  if (!n || !/dpi|cpi/.test(n)) return null;
  const x = _num(v);
  if (x === null || x < 100 || x > 60000) return null;
  return Math.round(x);
}
function _headphoneType(v) {
  const n = _normalizeBrowseText(v);
  if (!n) return null;
  if (/cevreleyen|over ?ear|circumaural|tam boy|full size/.test(n)) return 'over_ear';
  if (/kulak ustu|on ?ear|supraaural/.test(n)) return 'on_ear';
  if (/kulak ici|in ?ear|kulakici|earbud|true wireless|\btws\b/.test(n)) return 'in_ear';
  return null;
}
function _psuWatt(v) {
  const n = _normalizeBrowseText(v);
  if (!n || !/\bw\b|watt/.test(n)) return null;
  const x = _num(v);
  if (x === null || x < 50 || x > 3000) return null;
  return Math.round(x);
}
function _psuEfficiency(v) {
  const n = _normalizeBrowseText(v);
  if (!n) return null;
  if (/titanium/.test(n)) return 'titanium';
  if (/platinum/.test(n)) return 'platinum';
  if (/\bgold\b/.test(n)) return 'gold';
  if (/\bsilver\b/.test(n)) return 'silver';
  if (/bronze/.test(n)) return 'bronze';
  if (/80 ?\+|80 ?plus/.test(n)) return '80plus';
  return null;
}
function _psuModular(v) {
  const n = _normalizeBrowseText(v);
  if (!n) return null;
  if (/yari modul|semi ?modul/.test(n)) return 'semi_modular';
  if (/moduler degil|non ?modul|sabit kablo|fixed|non modular/.test(n)) return 'non_modular';
  if (/tam modul|full ?modul|fully modul|modular|modul/.test(n)) return 'full_modular';
  return null;
}
function _pbCapacity(v) {
  const x = _batteryMah(v);
  if (x === null || x < 1000 || x > 200000) return null;
  return Math.round(x);
}
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
    const text = _normalizeBrowseText(`${key} ${value}`);
    const bool = _bool(value);
    if (bool === false) return;
    if (/\bhdmi\b/.test(text)) tokens.add('hdmi');
    if (/display\s*port|displayport|\bdp\b/.test(text)) tokens.add('displayport');
    if (/usb c|usb type c|type c/.test(text)) tokens.add('usb_c');
    if (/thunderbolt/.test(text)) tokens.add('thunderbolt');
    if (/\bdvi\b/.test(text)) tokens.add('dvi');
    if (/\bvga\b/.test(text)) tokens.add('vga');
  });
  return Array.from(tokens);
}
function _ramType(v) {
  // GDDR is graphics VRAM, never system RAM — don't let "GDDR5" match "ddr5".
  if (/gddr/i.test(String(v || ''))) return null;
  return _matchBucket(v, [['lpddr5x', 'lpddr5x'], ['lpddr5', 'lpddr5'], ['lpddr4x', 'lpddr4x'], ['ddr5', 'ddr5'], ['ddr4', 'ddr4'], ['ddr3', 'ddr3']]);
}
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

function extractBrowse(pb) {
  const flat = _flattenBrowseSpecs(pb);
  const tokens = [], seen = {};
  const addT = (t) => { if (t && !seen[t]) { seen[t] = true; tokens.push(t); } };
  const first = (keys) => { const v = _findBrowseSpecValues(keys, flat); return v.length ? String(v[0]) : ''; };
  const exact = (keys) => {
    for (const key of keys) if (flat[key] != null && flat[key] !== '') return String(flat[key]);
    return first(keys);
  };
  // Try the parser against EVERY spec value the keys fuzzy-match, returning the
  // first non-empty result. Fixes "wrong value first" — e.g. "Resolution" also
  // matches "Rear Camera Resolution", and "CPU" also matches "CPU cores", so
  // first() alone grabbed "48 MP" / "8" and the real token never got built.
  const firstValid = (keys, parse) => {
    for (const v of _findBrowseSpecValues(keys, flat)) {
      const r = parse(String(v));
      if (r) return r;
    }
    return null;
  };
  const category = cat(pb);
  const ramCapacityKeys = category === 'ram'
    ? ['Bellek Kapasitesi', 'Memory Capacity', 'RAM Capacity', 'Capacity', 'Kapasite', 'Speicherkapazitat', 'Speicherkapazität', 'Arbeitsspeicher Kapazitat', 'Arbeitsspeicher Kapazität']
    : ['Memory (RAM)', 'RAM', 'memory ram', 'Bellek (RAM)', 'Bellek', 'Arbeitsspeicher', 'Hauptspeicher'];

  if (allow(pb, 'ram')) {
    const ram = _ramGb(first(ramCapacityKeys)) || (category === 'ram' ? _ramGb(pb.name) : null);
    if (ram !== null) addT('ram:' + ram + '_gb');
    // firstValid (not first): "Bellek Türü" fuzzy-matches "RAM"="64 GB" too, and
    // first() grabbed that wrong value, leaving laptops/tablets with no ram_type.
    const rt = firstValid(['RAM Type', 'Memory Type', 'Memory Technology', 'Bellek Tipi', 'Bellek Türü', 'Bellek Teknolojisi', 'Speichertyp', 'Speicherart', 'Speichertechnologie'], _ramType) || (category === 'ram' ? _ramType(pb.name) : null);
    if (rt) addT('ram_type:' + rt);
    if (category === 'ram') {
      const speed = _ramSpeedMt(first(['Bellek Hızı (OC)', 'Bellek Hızı', 'Memory Speed', 'RAM Speed', 'Speed', 'Speichertakt', 'Taktrate']));
      if (speed) addT('ram_speed:' + speed + '_mt');
      const latency = _ramLatency(first(['CL (Tepkime Süresi)', 'CAS Latency', 'CL', 'Latency', 'Latenz']));
      if (latency) addT('ram_latency:' + latency + '_cl');
      const moduleType = _ramModule(first(['Bellek Modülü', 'Memory Module', 'Module Type', 'Form Factor', 'Bauform']));
      if (moduleType) addT('ram_module:' + moduleType);
      const kit = _ramKit(first(['Bellek Kiti', 'Memory Kit', 'Kit', 'Bellek Count', 'Module Count']));
      if (kit) addT('ram_kit:' + kit);
      const platform = _ramPlatform(first(['Platform', 'Kullanım Alanı', 'Kullanim Alani']));
      if (platform) addT('ram_platform:' + platform);
      if (_ramEcc(first(['ECC', 'ECC Memory', 'SIMa Düzeltme', 'Hata Düzeltme', 'Error Correction']))) addT('ecc:true');
      const lightingFlag = exact(['Işıklandırma', 'Isiklandirma', 'Lighting', 'LED']);
      const lightingDetail = exact(['Işıklandırma Özelliği', 'Isiklandirma Ozelligi', 'Lighting Type', 'RGB']);
      const lightingFlagBool = _bool(lightingFlag);
      const lightingDetailText = _normalizeBrowseText(lightingDetail);
      if (lightingFlagBool === true || (lightingFlagBool !== false && lightingDetailText && !/^(no|false|hayir|yok|n a|-)$/.test(lightingDetailText))) addT('lighting:true');
      if (lightingFlagBool !== false && /\brgb\b/.test(lightingDetailText)) addT('rgb:true');
      const profile = first(['Specifications', 'Profile', 'Overclock Profile', 'Memory Profile', 'Profil']);
      const profileText = _normalizeBrowseText(profile);
      if (/\bxmp\b/.test(profileText)) addT('xmp:true');
      if (/\bexpo\b/.test(profileText)) addT('expo:true');
    }
  }
  if (allow(pb, 'storage')) {
    const st = _storageToken(first(['Hard Disk (SSD) Size', 'SSD Size', 'Internal Storage', 'internal storage', 'Storage Size', 'Storage Capacity', 'Total Storage Capacity', 'Capacity', 'storage', 'Storage', 'Dahili Depolama', 'Depolama', 'Kapasite', 'Speicherkapazitat', 'Speicherkapazität', 'Geratespeicher', 'Gerätespeicher']))
      || _storageToken(pb.name);
    if (st) addT('storage:' + st);
    const sty = firstValid(['Storage Type', 'Storage Media', 'Disk Type', 'Interface', 'Schnittstelle', 'Depolama Tipi', 'Depolama Türü', 'SSD Type', 'Sabit Disk (SSD) Tipi', 'Sabit Disk Tipi', 'SSD Tipi', 'Disk Tipi', 'Disk Türü'], _storageType);
    if (sty) addT('storage_type:' + sty);
  }
  if (allow(pb, 'os')) {
    const os = _osToken(first(['Operating System', 'OS', 'Platform', 'İşletim Sistemi', 'Isletim Sistemi', 'Betriebssystem']));
    if (os) addT('os:' + os);
  }
  if (allow(pb, 'cpu')) {
    const cpu = firstValid(['Processor Brand', 'Processor Model', 'Processor', 'Ana İşlemci', 'Ana İşlemci (CPU)', 'SoC', 'Chipset', 'Chip Set', 'Yonga Seti (Chipset)', 'İşlemci Markası', 'İşlemci Modeli', 'İşlemci Tipi', 'İşlemci Ailesi', 'İşlemci', 'Islemci', 'Yonga Seti', 'Yonga (SoC)', 'Yonga', 'CPU', 'Chip', 'Prozessor', 'Prozessormodell'], _cpuBrand)
      || (category === 'cpus' ? _cpuBrand(pb.name) : null);
    if (cpu) addT('processor_brand:' + cpu);
  }
  if (allow(pb, 'socket')) {
    const socketTexts = [first(['Socket', 'CPU Socket', 'Processor Socket', 'Soket', 'Sockel', 'Compatible Sockets', 'Socket Support', 'Supported Socket', 'CPU-Sockel'])];
    socketTexts.forEach((v) => _socketFromText(v).forEach((tk) => addT('socket:' + tk.toLowerCase())));
  }
  if (allow(pb, 'gpu')) {
    const gpu = firstValid(['GPU Model', 'Graphics Card', 'Graphics Card Type', 'External Graphics Processor (GPU)', 'Integrated Graphics Model', 'Dedicated Graphics Model', 'Video Card', 'GPU', 'Ekran Kartı', 'Harici Ekran Kartı', 'Dahili Ekran Kartı', 'Grafik İşlemci', 'Grafik Kartı', 'Grafik', 'Grafikkarte'], _gpuType);
    if (gpu) addT('gpu_type:' + gpu);
  }
  if (allow(pb, 'gpuBrand')) {
    // Prefer the discrete-GPU keys; fall back to integrated/SoC graphics so
    // MacBooks (Apple) and integrated-only PCs still get a brand.
    const brand = firstValid([
      'GPU Markası', 'Display Kartı İşlemci Markası', 'İşlemci Üreticisi', 'GPU Üreticisi',
      'GPU Modeli', 'GPU Serisi', 'Display Kartı Modeli', 'GPU Model', 'GPU',
      'Grafik İşlemcisi', 'Grafik Kartı', 'Graphics Card', 'Ekran Kartı',
      'Dahili Grafik Modeli', 'Integrated Graphics Model', 'Graphics', 'Grafikkarte',
    ], _gpuBrand) || (category === 'graphics_cards' ? _gpuBrand(pb.name) : null);
    if (brand) addT('gpu_brand:' + brand);
  }
  if (allow(pb, 'vram')) {
    const vram = firstValid([
      'GPU Bellek Miktarı', 'Display Kartı Bellek Miktarı', 'Bellek Boyutu', 'Ekran Kartı Bellek Miktarı',
      'GPU Memory', 'Video Memory', 'VRAM', 'Grafikspeicher', 'Bellek Kapasitesi (GPU)',
    ], _vramGb);
    if (vram) addT('vram:' + vram + '_gb');
  }
  if (allow(pb, 'vramType')) {
    const vt = firstValid(['Bellek Türü', 'GPU Bellek Türü', 'Memory Type', 'Bellek Tipi', 'Speichertyp'], _vramType)
      || _vramType(pb.name);
    if (vt) addT('vram_type:' + vt);
  }
  if (allow(pb, 'peripheralConn')) {
    const bag = _normalizeBrowseText(first(['Bağlantı Şekli', 'Baglanti Sekli', 'Bağlantı Tipi', 'Bağlantı', 'Connection Type', 'Connection', 'Bağlantı Türü', 'Anschluss']));
    const bt = _bool(first(['Bluetooth', 'Bluetooth Desteği']));
    const wiredCap = _bool(first(['Kablolu Kullanabilme', 'Kablolu Kullanım', 'Kablo ile Kullanım']));
    const dongle = _bool(first(['2.4 GHz USB Alıcı', '2,4 GHz USB Alıcı', 'USB Alıcı', 'Kablosuz Alıcı']));
    if (/wireless|kablosuz|wi ?fi/.test(bag) || dongle === true || bt === true) addT('connection:wireless');
    if (/wired|kablolu/.test(bag) || wiredCap === true) addT('connection:wired');
    if (bt === true || /bluetooth/.test(bag)) addT('connection:bluetooth');
  }
  if (allow(pb, 'dpi')) {
    const dpi = firstValid(['Mouse Azami Hassasiyet', 'Maksimum DPI', 'Azami DPI', 'DPI', 'Hassasiyet', 'Çözünürlük (DPI)', 'Sensör Çözünürlüğü', 'Max DPI'], _dpiVal);
    if (dpi) addT('dpi:' + dpi + '_dpi');
  }
  if (allow(pb, 'keyType')) {
    const mechBool = _bool(first(['Mekanik Tuşlar', 'Mekanik Tuş', 'Mechanical Keys']));
    const switchText = _normalizeBrowseText(first(['Mekanik Tuş Specifications', 'Mekanik Tuş Özellikleri', 'Anahtar Tipi', 'Switch Type', 'Tuş Tipi', 'Klavye Tuş Tipi', 'Switch']) + ' ' + (pb.name || ''));
    if (/manyetik|magnetic|\bhall\b|optik|optical/.test(switchText)) addT('key_type:optical_switch');
    else if (mechBool === true || /mekanik|mechanical/.test(switchText)) addT('key_type:mechanical');
    else if (mechBool === false || /membran|membrane/.test(switchText)) addT('key_type:membrane');
  }
  if (allow(pb, 'headphoneType')) {
    const ht = firstValid(['Kulaklık Tipi', 'Kulaklik Tipi', 'Headphone Type', 'Kulaklık Türü', 'Kullanım Tipi', 'Form', 'Tip'], _headphoneType)
      || _headphoneType(pb.name);
    if (ht) addT('headphone_type:' + ht);
  }
  if (allow(pb, 'anc')) {
    const ancField = first(['Aktif Gürültü Engelleme (ANC)', 'Aktif Gürültü Engelleme', 'Active Noise Cancelling', 'Active Noise Cancellation', 'ANC']);
    const ancDetail = _normalizeBrowseText(first(['Gürültü Engelleme (Dinleme)', 'Gürültü Engelleme', 'Gürültü Önleme', 'Noise Cancellation', 'Noise Cancelling']));
    if (_bool(ancField) === true || /\banc\b|aktif gurultu|active noise/.test(ancDetail) || /\banc\b|aktif gurultu|active noise/.test(_normalizeBrowseText(ancField))) addT('anc:true');
  }
  if (allow(pb, 'peripheralLight')) {
    const lightFlag = _bool(first(['Aydınlatma', 'Mouse Aydınlatması', 'Klavye Aydınlatması', 'Işıklandırma', 'Lighting', 'RGB Aydınlatma', 'Backlight', 'Arka Aydınlatma']));
    const lightDetail = _normalizeBrowseText(first(['Aydınlatma Tipi', 'Mouse Aydınlatması Tipi', 'Klavye Aydınlatması Tipi', 'Işıklandırma Tipi', 'Lighting Type', 'RGB']));
    if (lightFlag === true || (lightDetail && !/^(no|false|hayir|yok|n a|-)$/.test(lightDetail))) addT('lighting:true');
    if (/\brgb\b|argb/.test(lightDetail) || /\brgb\b|argb/.test(_normalizeBrowseText(first(['Aydınlatma', 'Mouse Aydınlatması', 'Klavye Aydınlatması'])))) addT('rgb:true');
  }
  if (allow(pb, 'psu')) {
    const watt = firstValid(['Güç', 'Güç (W)', 'Maksimum Güç', 'Çıkış Gücü', 'Power', 'Wattage', 'Total Power', 'Leistung', 'Nennleistung'], _psuWatt);
    if (watt) addT('psu_wattage:' + watt + '_w');
    const eff = firstValid(['80 Plus Sertifikası', '80 Plus', 'Verimlilik Sertifikası', 'Sertifika', 'Verimlilik', 'Efficiency', 'Certification', 'Zertifizierung'], _psuEfficiency)
      || _psuEfficiency(pb.name);
    if (eff) addT('psu_efficiency:' + eff);
    const mod = firstValid(['Kablo Tipi', 'Kablo Yönetimi', 'Modülerlik', 'Modülerlik Tipi', 'Modularity', 'Cable Type', 'Kabeltyp', 'Kablo Yapısı'], _psuModular)
      || _psuModular(pb.name);
    if (mod) addT('psu_modular:' + mod);
  }
  if (allow(pb, 'pbCapacity')) {
    const cap = firstValid(['Kapasite', 'Battery Capacity', 'Pil Kapasitesi', 'Batarya Kapasitesi', 'Kapazität'], _pbCapacity);
    if (cap) addT('pb_capacity:' + cap + '_mah');
  }
  const PANEL_PAIRS = [['qd oled', 'qd_oled'], ['qd-oled', 'qd_oled'], ['mini led', 'mini_led'], ['miniled', 'mini_led'], ['micro led', 'micro_led'], ['microled', 'micro_led'],
    ['dynamic amoled', 'dynamic_amoled'], ['super amoled', 'super_amoled'], ['amoled', 'amoled'], ['ltpo', 'ltpo'], ['qled', 'qled'], ['woled', 'oled'], ['oled', 'oled'],
    ['nano ips', 'ips'], ['ips black', 'ips'], ['fast ips', 'ips'], ['ips', 'ips'], ['pls', 'ips'], ['va', 'va'], ['tn', 'tn'], ['retina', 'retina'], ['e ink', 'eink'], ['eink', 'eink'], ['lcd', 'lcd'], ['led', 'lcd']];
  if (allow(pb, 'display')) {
    const panel = firstValid(['Screen Technology', 'Display Type', 'Panel Type', 'Panel Technology', 'Display Technology', 'Display Teknolojisi', 'Ekran Teknolojisi', 'Ekran Tipi', 'Panel Tipi', 'Panel Teknolojisi', 'Ekran Paneli', 'Display', 'Paneltyp', 'Bildschirmtechnologie', 'Display-Technologie'], (v) => _matchBucket(v, PANEL_PAIRS));
    if (panel) addT('screen_tech:' + panel);
    const rr = _num(first(['Screen Refresh Rate', 'Refresh Rate', 'Display Refresh Rate', 'Display Yenileme Hızı', 'Maximum Refresh Rate', 'Max Refresh Rate', 'Ekran Yenileme Hızı', 'Yenileme Hızı', 'Maksimum Yenileme Hızı', 'Bildwiederholfrequenz', 'Bildwiederholrate']));
    if (rr !== null) { const hz = Math.round(rr); if ([60, 75, 90, 100, 120, 144, 160, 165, 170, 175, 180, 200, 240, 280, 300, 360, 480, 500].includes(hz)) addT('refresh_rate:' + hz + '_hz'); }
    if (allow(pb, 'resolution')) {
      // Exclude camera resolution keys so we never tag a phone's "48 MP" as a screen res.
      const resKeys = ['Display Resolution', 'Screen Resolution', 'Native Resolution', 'Panel Resolution', 'Ekran Çözünürlüğü', 'Çözünürlük Standardı', 'Maksimum Çözünürlük', 'Maximum Resolution', 'Max Resolution', 'Resolution', 'Çözünürlük', 'Cozunurluk', 'Auflösung', 'Aufloesung', 'Bildauflösung'];
      let res = null;
      for (const [k, v] of Object.entries(flat)) {
        if (/camera|kamera|webcam/i.test(k)) continue;
        if (!resKeys.some((rk) => _normalizeBrowseText(k).includes(_normalizeBrowseText(rk)) || _normalizeBrowseText(rk).includes(_normalizeBrowseText(k)))) continue;
        const r = _resolutionToken(v);
        if (r) { res = r; break; }
      }
      if (res) addT('resolution:' + res);
    }
    // Screen size as a range filter — the most-used display filter on epey.
    const inch = _screenSizeFromFlat(flat);
    if (inch && inch >= 1 && inch <= 120) addT('screen_size:' + (Math.round(inch * 10) / 10) + '_in');
  }
  if (allow(pb, 'displayInput')) {
    _displayInputTokens(flat).forEach((tk) => addT('display_input:' + tk));
  }
  if (allow(pb, 'connectivity')) {
    _connTokens(first(['Connectivity', 'Connection Type', '4G', '5G', 'Wi-Fi', 'Bağlantı', 'Baglanti', 'Konnektivitat', 'Konnektivität'])).forEach((tk) => addT('connectivity:' + tk));
  }
  [['five_g', ['5G', '5G Desteği', '5G Destegi'], 'mobile'], ['nfc', ['NFC'], 'mobile'], ['wireless_charging', ['Wireless Charging', 'Kablosuz Şarj', 'Kablosuz Sarj'], 'wirelessCharging'], ['fast_charging', ['Fast Charging', 'Hızlı Şarj', 'Hizli Sarj'], 'charging'], ['fingerprint', ['Fingerprint Reader', 'fingerprint', 'Parmak İzi', 'Parmak Izi'], 'mobile'], ['water_resistance', ['Water Resistance', 'Suya Dayanıklılık', 'Suya Dayaniklilik', 'Wasserdicht'], 'water']].forEach(([tok, keys, gate]) => { if (allow(pb, gate) && _bool(first(keys)) === true) addT(tok + ':true'); });

  const screen = _screenSizeFromFlat(flat);
  const battery = _batteryMah(first(['Battery Capacity', 'Battery Capacity (Typical)', 'Batarya Kapasitesi', 'Batarya Kapasitesi (Tipik)', 'Pil Kapasitesi']));
  return {
    tokens,
    screenSizeValue: screen || undefined,
    batteryCapacityValue: battery === null ? undefined : battery,
    weightValueKg: _weightKg(first(['Weight', 'Ağırlık'])) || undefined,
  };
}

// ── IO ───────────────────────────────────────────────────────────────────────
async function* listProducts() {
  const fr = await fetch(`${TS_URL}/collections/products/documents/search?q=*&query_by=name&per_page=0&facet_by=category&max_facet_values=400`, { headers: HDR });
  let cats = ((await fr.json())?.facet_counts?.[0]?.counts || []).map((c) => c.value).filter(Boolean);
  if (CAT_FILTER) cats = cats.filter((c) => CAT_FILTER.includes(c));
  console.log(`Categories: ${cats.length}`);
  for (const cat of cats) {
    let page = 1;
    for (;;) {
      const url = `${TS_URL}/collections/products/documents/search?q=*&query_by=name&filter_by=${encodeURIComponent('category:=`' + cat + '`')}&include_fields=id,_raw,screenSizeValue,batteryCapacityValue,weightValueKg,filterTokens&per_page=250&page=${page}`;
      let data; try { const r = await fetch(url, { headers: HDR, signal: AbortSignal.timeout(30000) }); if (!r.ok) break; data = await r.json(); } catch { break; }
      const hits = data?.hits || [];
      for (const h of hits) yield h.document;
      if (hits.length < 250 || page * 250 >= 240000) break;
      page++;
    }
  }
}
async function tsUpdate(id, fields) {
  const r = await fetch(`${TS_URL}/collections/products/documents/import?action=update`, {
    method: 'POST', headers: { ...HDR, 'Content-Type': 'text/plain' },
    body: JSON.stringify({ id, ...fields }), signal: AbortSignal.timeout(20000),
  });
  const t = await r.text();
  if (!r.ok || /"success":false/.test(t)) throw new Error(`TS ${r.status}: ${t.slice(0, 140)}`);
}

const stats = { scanned: 0, updated: 0, tokensAdded: 0, errors: 0 };
async function proc(doc) {
  let raw; try { raw = JSON.parse(doc._raw || '{}'); } catch { return; }
  stats.scanned++;
  try {
    const b = extractBrowse(raw);
    const prev = Array.isArray(doc.filterTokens)
      ? doc.filterTokens
      : (Array.isArray(raw.filterTokens) ? raw.filterTokens : []);
    const tokensChanged = b.tokens.length !== prev.length || b.tokens.some((t) => !prev.includes(t));
    const prevScreen = Number(doc.screenSizeValue);
    const nextScreen = b.screenSizeValue != null
      ? b.screenSizeValue
      : (Number.isFinite(prevScreen) && prevScreen > 120 ? 0 : undefined);
    const screenChanged = nextScreen !== undefined &&
      (!Number.isFinite(prevScreen) || Math.abs(prevScreen - nextScreen) > 0.05);
    const prevBattery = Number(doc.batteryCapacityValue);
    const nextBattery = b.batteryCapacityValue != null
      ? b.batteryCapacityValue
      : (Number.isFinite(prevBattery) && prevBattery > 0 ? 0 : undefined);
    const batteryChanged = nextBattery !== undefined &&
      (!Number.isFinite(prevBattery) || Math.round(prevBattery) !== nextBattery);
    const prevWeight = Number(doc.weightValueKg);
    const weightChanged = b.weightValueKg != null &&
      (!Number.isFinite(prevWeight) || Math.abs(prevWeight - b.weightValueKg) > 0.001);
    if (!tokensChanged && !screenChanged && !batteryChanged && !weightChanged) return;
    stats.tokensAdded += Math.max(0, b.tokens.length - prev.length);
    if (!DRY) {
      raw.filterTokens = b.tokens;
      const fields = {
        ...(tokensChanged ? { filterTokens: b.tokens } : {}),
        ...(nextScreen !== undefined ? { screenSizeValue: nextScreen } : {}),
        ...(nextBattery !== undefined ? { batteryCapacityValue: nextBattery } : {}),
        ...(b.weightValueKg != null ? { weightValueKg: b.weightValueKg } : {}),
        _raw: JSON.stringify(raw),
      };
      await tsUpdate(doc.id, fields);
    }
    stats.updated++;
    if (stats.updated % 200 === 0) console.log(`  … updated ${stats.updated} (scanned ${stats.scanned}, +${stats.tokensAdded} tokens)`);
  } catch (e) { stats.errors++; if (stats.errors % 50 === 1) console.log(`  ⚠ ${doc.id}: ${e.message}`); }
}

async function main() {
  if (!K) throw new Error('Missing TYPESENSE_API_KEY');
  console.log(`Filter-token reindex — ${DRY ? 'DRY' : 'LIVE'} · conc ${CONC}${CAT_FILTER ? ' · cats=' + CAT_FILTER.join(',') : ''}`);
  const pool = new Set();
  for await (const doc of listProducts()) {
    const task = proc(doc).finally(() => pool.delete(task));
    pool.add(task);
    if (pool.size >= CONC) await Promise.race(pool);
  }
  await Promise.allSettled(pool);
  console.log(`\nDone — updated ${stats.updated} (+${stats.tokensAdded} tokens), scanned ${stats.scanned}, errors ${stats.errors}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
