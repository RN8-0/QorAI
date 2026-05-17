/**
 * Qor AI — product configuration key
 *
 * Two products are the SAME comparable device when they differ only by colour
 * / reseller / language / region / OS — and a DIFFERENT device when CPU, RAM
 * or storage differ.
 *
 * The key is built ADDITIVELY from the axes that matter:
 *
 *     configKey = <variantGroup> | r<RAM> | s<STORAGE> | c<CPU> | g<GPU> | d<DISPLAY> | res<RESOLUTION>
 *
 * Because colour/language/region are never *added*, they can never leak — no
 * blocklist to keep up with (Samsung invents colour names like "Marble Gray",
 * "Amber Yellow", "Cobalt Violet" every season).
 *
 * Products with no RAM/storage in the name (monitors, accessories…) fall back
 * to a conservative subtractive key so unrelated items are never merged.
 *
 * Shared by scripts/dedupe_configs.js and scripts/icecat_ingest.js.
 */
'use strict';

const { modelFamilyKey, isRefurbisherBrand, isJunkBrand } = require('./model_family');

function _slug(s, max = 60) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, max);
}

function _flattenSpecs(raw, prefix = '') {
  const out = [];
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    const key = prefix ? `${prefix} ${k}` : String(k);
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(..._flattenSpecs(v, key));
    else if (v !== undefined && v !== null && String(v).trim()) out.push([key.toLowerCase(), String(v)]);
  }
  return out;
}

function _specEntries(p) {
  return [
    ..._flattenSpecs(p.keySpecs),
    ..._flattenSpecs(p.specs),
    ..._flattenSpecs(p.specSections),
  ];
}

function _pickSpec(p, include, exclude = []) {
  for (const [key, val] of _specEntries(p)) {
    if (exclude.some(re => re.test(key))) continue;
    if (include.some(re => re.test(key))) return val;
  }
  return '';
}

function _pickSpecPriority(p, include, exclude = []) {
  const entries = _specEntries(p);
  for (const re of include) {
    const found = entries.find(([key]) => !exclude.some(x => x.test(key)) && re.test(key));
    if (found) return found[1];
  }
  return '';
}

function _capacityGbFromText(text, mode = 'largest') {
  const caps = [...String(text || '').matchAll(/\b(\d+(?:[.,]\d+)?)\s*(TB|GB|MB)\b/gi)].map(m => {
    const n = parseFloat(String(m[1]).replace(',', '.')) || 0;
    const unit = m[2].toUpperCase();
    const gb = unit === 'TB' ? n * 1024 : unit === 'MB' ? n / 1024 : n;
    return { n, unit, gb };
  }).filter(c => c.gb > 0);
  if (!caps.length) return 0;
  const picked = mode === 'smallest'
    ? caps.reduce((a, b) => a.gb <= b.gb ? a : b)
    : caps.reduce((a, b) => a.gb >= b.gb ? a : b);
  return Math.round(picked.gb);
}

function _capacitiesFromSpecs(p) {
  const ramText = _pickSpecPriority(
    p,
    [/^memory \(ram\)$/, /^internal memory$/, /^system memory$/, /\bram\b/, /\bmemory\b/],
    [/\bgraphics\b/, /\bstorage\b/, /\bslot\b/, /\bmaximum\b/, /\bmax\b/, /\btype\b/, /\bspeed\b/]
  );
  const storageText = _pickSpecPriority(
    p,
    [
      /^total storage capacity$/,
      /^internal storage$/,
      /^hard disk \(ssd\) size$/,
      /^ssd capacity$/,
      /^total ssds capacity$/,
      /^hdd capacity$/,
      /\bstorage capacity\b/,
      /\bflash memory\b/,
      /\bcapacity\b/,
    ],
    [/\bbattery\b/, /\bram\b/, /\bmemory \(ram\)\b/, /\bgraphics\b/, /\bcache\b/, /\bslot\b/]
  );
  return {
    ram: _capacityGbFromText(ramText, 'smallest'),
    storage: _capacityGbFromText(storageText, 'largest'),
  };
}

/** RAM (GB) + storage (GB) read from the capacity tokens in the name/specs. */
function _capacities(product) {
  const name = product && typeof product === 'object' ? product.name : product;
  const specCaps = product && typeof product === 'object' ? _capacitiesFromSpecs(product) : { ram: 0, storage: 0 };
  const caps = [...String(name || '').matchAll(/\b(\d+)\s*(TB|GB)\b/gi)].map(m => {
    const n = parseInt(m[1], 10) || 0;
    const unit = m[2].toUpperCase();
    return { n, unit, gb: unit === 'TB' ? n * 1024 : n };
  });
  let storage = null;
  for (const c of caps) if (!storage || c.gb > storage.gb) storage = c;
  let ram = null;
  for (const c of caps) {
    if (c === storage || c.unit !== 'GB' || c.n > 64) continue; // RAM ≤ 64 GB
    if (!ram || c.n > ram.n) ram = c;
  }
  return {
    ram: specCaps.ram || (ram ? ram.n : 0),
    storage: specCaps.storage || (storage ? storage.gb : 0),
  };
}

/** Distinctive CPU token (empty for phones — chipset is omitted from names). */
function _cpuToken(product) {
  const p = product && typeof product === 'object' ? product : { name: product };
  const specCpu = [
    _pickSpecPriority(p, [/^processor family$/, /\bprocessor family\b/]),
    _pickSpecPriority(p, [/^processor model$/, /\bcpu model\b/, /\bprocessor model\b/]),
  ].filter(Boolean).join(' ') || _pickSpec(p, [/\bprocessor\b/], [/\bcores?\b/, /\bthreads?\b/, /\bfrequency\b/, /\bcache\b/]);
  const t = `${p.name || ''} ${specCpu}`;
  const m = t.match(/\b(?:core\s+)?ultra\s+[3579]\s+\w+/i)
    || t.match(/\bi[3579]-\w+/i)
    || t.match(/\bcore\s+[3579]\s+\d{3,4}[a-z]*\b/i)
    || t.match(/\b(?:amd\s+)?ryzen[™®]?\s+(?:ai\s+)?[3579]\s+(?:pro\s+)?[a-z0-9-]+/i)
    || t.match(/\b(?:celeron|pentium|xeon|athlon)\s+[a-z]?\w+/i)
    || t.match(/\bcore\s+i[3579]\b/i)
    || t.match(/\b(?:snapdragon|dimensity|exynos|tensor)\s+[a-z0-9-]+\b/i)
    || t.match(/\b(?:apple\s+)?m[1-9]\s*(?:pro|max|ultra)?\b/i);
  return m ? m[0].toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

function _gpuToken(product) {
  const p = product || {};
  const specGpu = _pickSpec(
    p,
    [/\bgraphics card\b/, /\bgraphics adapter model\b/, /\bdiscrete graphics\b/, /\bgpu\b/, /\bgraphics processor\b/],
    [/\bmemory\b/, /\binterface\b/, /\bports?\b/]
  );
  const t = `${p.name || ''} ${specGpu}`;
  const m = t.match(/\b(?:nvidia\s+)?(?:geforce\s+)?(?:rtx|gtx|mx)\s*\d{3,5}(?:\s*(?:ti|super|laptop))?\b/i)
    || t.match(/\b(?:amd\s+)?radeon\s+(?:rx\s*)?\d{3,5}(?:\s*(?:xt|m|mobile|graphics))?\b/i)
    || t.match(/\b(?:intel\s+)?(?:arc\s+[a-z]\d+|iris\s+xe|uhd|hd)\s+graphics\b/i)
    || t.match(/\bapple\s+m[1-9]\s*(?:pro|max|ultra)?\s*gpu\b/i);
  return m ? _slug(m[0], 50) : (specGpu ? _slug(specGpu, 50) : '');
}

function _displaySizeToken(product) {
  const p = product || {};
  const text = `${p.name || ''} ${_pickSpec(p, [/\bdisplay diagonal\b/, /\bscreen size\b/, /\bdiagonal\b/])}`;
  const inch = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:"|inch|inches|zoll)\b/i)
    || text.match(/\(\s*(\d+(?:[.,]\d+)?)\s*(?:"|inch|inches|zoll)\s*\)/i);
  if (inch) return String(Math.round(parseFloat(inch[1].replace(',', '.')) * 10));
  const cm = text.match(/\b(\d+(?:[.,]\d+)?)\s*cm\b/i);
  if (cm) return String(Math.round((parseFloat(cm[1].replace(',', '.')) / 2.54) * 10));
  return '';
}

function _resolutionToken(product) {
  const p = product || {};
  const text = `${p.name || ''} ${_pickSpec(p, [/\bdisplay resolution\b/, /\bresolution\b/])}`;
  const m = text.match(/\b(\d{3,5})\s*[x×]\s*(\d{3,5})\b/i);
  return m ? `${m[1]}x${m[2]}` : '';
}

function _refreshToken(product) {
  const val = _pickSpec(product || {}, [/\brefresh rate\b/, /\bscreen refresh\b/]);
  const m = String(val).match(/\b(\d{2,4})\s*hz\b/i);
  return m ? m[1] : '';
}

function _panelToken(product) {
  const val = _pickSpec(product || {}, [/\bpanel type\b/, /\bdisplay technology\b/]);
  const m = String(val).match(/\b(oled|amoled|ips|va|tn|mini led|qled|lcd)\b/i);
  return m ? _slug(m[1], 20) : '';
}

// Conservative fallback for products whose name has no RAM/storage tokens.
const COSMETIC_RE = /\b(black|white|silver|gold|blue|navy|purple|violet|pink|red|green|gray|grey|cream|graphite|lavender|midnight|starlight|titanium|carbon|yellow|amber|marble|onyx|cobalt|sapphire|jade|sandstone|orange|sand|camouflage|camo|beige|bronze|khaki|mint|aqua|turquoise|teal|coral|brown|copper|natural|ivory|schwarz|weiss|weiß|silber|blau|grau|siyah|beyaz|gri|mavi|colour|color|spanish|german|french|italian|english|turkish|refurbished|refurb|renewed|recertified)\b/gi;
function _legacyKey(name, brand) {
  let s = String(name || '').toLowerCase();
  const b = String(brand || '').toLowerCase().trim();
  if (b) s = s.replace(new RegExp(`^${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '');
  s = s
    .replace(COSMETIC_RE, ' ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `legacy:${s}`.slice(0, 230);
}

/**
 * @param {{name?:string, brand?:string, variantGroup?:string, category?:string}} product
 * @returns {string} configuration key
 */
function configKey(product) {
  const p = product || {};
  const name = String(p.name || '');
  const vg = p.variantGroup
    || modelFamilyKey({ name, brand: p.brand, category: p.category });
  const { ram, storage } = _capacities(p);
  const cpu = _cpuToken(p);
  const gpu = _gpuToken(p);
  const display = _displaySizeToken(p);
  const resolution = _resolutionToken(p);
  const refresh = _refreshToken(p);
  const panel = _panelToken(p);
  const axes = [
    ram ? `r${ram}` : '',
    storage ? `s${storage}` : '',
    cpu ? `c${cpu}` : '',
    gpu ? `g${gpu}` : '',
    display ? `d${display}` : '',
    resolution ? `res${resolution}` : '',
    refresh ? `hz${refresh}` : '',
    panel ? `p${panel}` : '',
  ].filter(Boolean);
  if (axes.length) {
    return `${vg}|${axes.join('|')}`.slice(0, 230);
  }
  return _legacyKey(name, p.brand);
}

module.exports = { configKey, isRefurbisherBrand, isJunkBrand };
