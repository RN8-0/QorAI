/**
 * Qor AI — product configuration key
 *
 * Two products are the SAME comparable device when they differ only by colour
 * / reseller / language / region / OS — and a DIFFERENT device when CPU, RAM
 * or storage differ.
 *
 * The key is built ADDITIVELY from the axes that matter:
 *
 *     configKey = <variantGroup> | r<RAM> | s<STORAGE> | c<CPU>
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

/** RAM (GB) + storage (GB) read from the capacity tokens in the name. */
function _capacities(name) {
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
  return { ram: ram ? ram.n : 0, storage: storage ? storage.gb : 0 };
}

/** Distinctive CPU token (empty for phones — chipset is omitted from names). */
function _cpuToken(name) {
  const t = String(name || '');
  const m = t.match(/\b(?:core\s+)?ultra\s+[3579]\s+\w+/i)
    || t.match(/\bi[3579]-\w+/i)
    || t.match(/\bryzen(?:\s+ai)?\s+[3579]\s+(?:pro\s+)?\w+/i)
    || t.match(/\b(?:celeron|pentium|xeon|athlon)\s+[a-z]?\w+/i)
    || t.match(/\bcore\s+i[3579]\b/i)
    || t.match(/\b(?:apple\s+)?m[1-9]\s*(?:pro|max|ultra)?\b/i);
  return m ? m[0].toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

// Conservative fallback for products whose name has no RAM/storage tokens.
const COSMETIC_RE = /\b(black|white|silver|gold|blue|navy|purple|violet|pink|red|green|gray|grey|cream|graphite|lavender|midnight|starlight|titanium|carbon|yellow|amber|marble|onyx|cobalt|sapphire|jade|sandstone|orange|beige|bronze|schwarz|weiss|weiß|silber|blau|grau|siyah|beyaz|gri|mavi|colour|color|spanish|german|french|italian|english|turkish|refurbished|refurb|renewed|recertified)\b/gi;
function _legacyKey(name, brand) {
  let s = String(name || '').toLowerCase();
  const b = String(brand || '').toLowerCase().trim();
  if (b) s = s.replace(new RegExp(`^${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '');
  s = s.replace(COSMETIC_RE, ' ').replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim();
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
  const { ram, storage } = _capacities(name);
  if (ram || storage) {
    return `${vg}|r${ram}|s${storage}|c${_cpuToken(name)}`.slice(0, 230);
  }
  return _legacyKey(name, p.brand);
}

module.exports = { configKey, isRefurbisherBrand, isJunkBrand };
