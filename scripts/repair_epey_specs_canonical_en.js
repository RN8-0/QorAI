#!/usr/bin/env node
/**
 * Convert existing Epey product specs from Turkish source text to canonical
 * English using admin/js/dictionary.js. This intentionally does not call AI.
 *
 * Usage:
 *   node scripts/repair_epey_specs_canonical_en.js --dry-run
 *   node scripts/repair_epey_specs_canonical_en.js --apply
 *   node scripts/repair_epey_specs_canonical_en.js --apply --category=smartphones
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { req: pbReq } = require('../migration/pb');

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const CATEGORY = (process.argv.find(a => a.startsWith('--category=')) || '').split('=')[1] || '';
const LIMIT = Number((process.argv.find(a => a.startsWith('--limit=')) || '').split('=')[1] || 0);

const EPEY_CATEGORIES = [
  'smartphones','tablets','laptops','desktops','cpus','gpus','ram','ssd',
  'motherboards','psu','cases','coolers','tvs','monitors','projectors',
  'headphones','speakers','soundbars','smartwatches','cameras','action-cameras',
  'security-cameras','consoles','gamepads','keyboards','mice','printers',
  'webcams','routers','robot-vacuums','powerbanks','e-readers','drones',
];

function loadDict() {
  const file = path.join(__dirname, '..', 'admin', 'js', 'dictionary.js');
  const code = fs.readFileSync(file, 'utf8');
  const sandbox = { window: {}, console };
  vm.runInNewContext(code, sandbox, { filename: file });
  if (!sandbox.window.QorAiDict) throw new Error('QorAiDict failed to load');
  return sandbox.window.QorAiDict;
}

const dict = loadDict();

function cleanCountryCodes(value) {
  return String(value || '')
    .replace(/-\d+(?:TR|TU)\b/gi, '')
    .replace(/\b\d+(?:TR|TU)\b/gi, '')
    .replace(/-(?:TR|TU)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const TR_LEFTOVER_FIXES = [
  [/Öne Çıkanlar/gi, 'Highlights'],
  [/Genel/gi, 'General'],
  [/Özellikler/gi, 'Specifications'],
  [/Çözünürlüğü|Çözünürlük/gi, 'Resolution'],
  [/Frekansı|Frekans/gi, 'Frequency'],
  [/Çekirdeği|Çekirdek/gi, 'Core'],
  [/Desteği|Destek/gi, 'Support'],
  [/Sayısı|Sayı/gi, 'Count'],
  [/Hızlı/gi, 'Fast'],
  [/Şarj/gi, 'Charging'],
  [/Kablosuz/gi, 'Wireless'],
  [/Kamera/gi, 'Camera'],
  [/Ses/gi, 'Audio'],
  [/Çıkışı|Çıkış/gi, 'Output'],
  [/Suya Dayanıklılık|Suya Dayanıklı/gi, 'Water Resistance'],
  [/Gövde/gi, 'Body'],
  [/Oranı|Oran/gi, 'Ratio'],
  [/Hat/gi, 'SIM'],
  [/Ekran/gi, 'Display'],
  [/Var/gi, 'Yes'],
  [/Yok/gi, 'No'],
  [/Siyah/gi, 'Black'],
  [/Beyaz/gi, 'White'],
  [/Kırmızı/gi, 'Red'],
  [/Mavi/gi, 'Blue'],
  [/Yeşil/gi, 'Green'],
  [/Gri/gi, 'Gray'],
  [/Altın/gi, 'Gold'],
  [/Gümüş/gi, 'Silver'],
];

function hasTurkishChars(text) {
  return /[ığşçöüİĞŞÇÖÜ]/.test(String(text || ''));
}

function fixTurkishLeftovers(text) {
  let out = String(text || '').replace(/:$/, '').trim();
  for (const [re, replacement] of TR_LEFTOVER_FIXES) {
    out = out.replace(re, replacement);
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

function safeCanonicalText(text, fallback = '') {
  const fixed = fixTurkishLeftovers(text);
  return hasTurkishChars(fixed) ? fallback : fixed;
}

function uniqueSpecKey(target, key) {
  const base = key || 'Specification';
  if (!Object.prototype.hasOwnProperty.call(target, base)) return base;
  let n = 2;
  while (Object.prototype.hasOwnProperty.call(target, `${base} ${n}`)) n++;
  return `${base} ${n}`;
}

function translateSpecsObject(rawSpecs) {
  const out = {};
  for (const [key, value] of Object.entries(rawSpecs || {})) {
    const k = cleanCountryCodes(safeCanonicalText(dict.translateKey(String(key || '').replace(/:$/, '')), 'Specification'));
    const v = cleanCountryCodes(safeCanonicalText(dict.translateValue(String(value || '')), ''));
    if (k && v) out[uniqueSpecKey(out, k)] = v;
  }
  return out;
}

function translateSections(rawSections) {
  const out = {};
  for (const [section, specs] of Object.entries(rawSections || {})) {
    if (!specs || typeof specs !== 'object' || Array.isArray(specs)) continue;
    const sectionName = cleanCountryCodes(safeCanonicalText(dict.translateKey(String(section || '').replace(/:$/, '')), 'General')) || 'General';
    out[sectionName] = translateSpecsObject(specs);
  }
  return out;
}

function canonicalName(name) {
  return cleanCountryCodes(dict.translateProductName(String(name || ''))) || String(name || '').trim();
}

function changed(a, b) {
  return JSON.stringify(a || {}) !== JSON.stringify(b || {});
}

function buildPatch(product) {
  const name = canonicalName(product.name);
  const specs = translateSpecsObject(product.specs || {});
  const specSections = translateSections(product.specSections || {});
  const keySpecs = translateSpecsObject(product.keySpecs || {});
  const patch = {};

  if (name && name !== product.name) patch.name = name;
  if (changed(specs, product.specs)) patch.specs = specs;
  if (changed(specSections, product.specSections)) patch.specSections = specSections;
  if (changed(keySpecs, product.keySpecs)) patch.keySpecs = keySpecs;

  patch.multiLangSpecs = { en: specs };
  patch.multiLangSections = { en: specSections };
  patch.nameTranslated = { en: name || product.name || '' };
  patch.specsCount = Object.keys(specs).length;

  return patch;
}

async function fetchEpeyProducts(category) {
  const cats = category ? [category] : EPEY_CATEGORIES;
  const fields = 'id,name,category,source,sourceUrl,specs,specSections,keySpecs,multiLangSpecs,multiLangSections,nameTranslated';
  const all = [];
  for (const cat of cats) {
    const filter = `category="${cat}" && source="epey.com"`;
    for (let page = 1; ; page++) {
      const url = `/api/collections/products/records?filter=${encodeURIComponent(filter)}&fields=${encodeURIComponent(fields)}&perPage=500&page=${page}&sort=id`;
      const r = await pbReq('GET', url);
      if (r.status !== 200) {
        console.warn(`[warn] ${cat} page ${page} failed: ${JSON.stringify(r.body).slice(0, 220)}`);
        break;
      }
      const items = r.body.items || [];
      if (!items.length) break;
      all.push(...items);
      if (LIMIT && all.length >= LIMIT) return all.slice(0, LIMIT);
      if (items.length < 500) break;
    }
  }
  return all;
}

(async () => {
  console.log(`[repair] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} category=${CATEGORY || 'all'} limit=${LIMIT || 'none'}`);
  const products = await fetchEpeyProducts(CATEGORY);
  console.log(`[repair] loaded ${products.length} Epey products`);

  let patched = 0;
  let unchanged = 0;
  for (const product of products) {
    const patch = buildPatch(product);
    const hasMeaningfulChange =
      patch.name !== undefined ||
      patch.specs !== undefined ||
      patch.specSections !== undefined ||
      patch.keySpecs !== undefined ||
      changed(patch.multiLangSpecs, product.multiLangSpecs) ||
      changed(patch.multiLangSections, product.multiLangSections) ||
      changed(patch.nameTranslated, product.nameTranslated);

    if (!hasMeaningfulChange) {
      unchanged++;
      continue;
    }

    patched++;
    if (patched <= 8 || patched % 100 === 0) {
      console.log(`[repair] ${APPLY ? 'patch' : 'would patch'} ${patched}: ${product.id} ${product.name}`);
    }
    if (APPLY) {
      const r = await pbReq('PATCH', `/api/collections/products/records/${product.id}`, patch);
      if (r.status < 200 || r.status >= 300) {
        throw new Error(`patch failed ${product.id}: ${r.status} ${JSON.stringify(r.body)}`);
      }
    }
  }

  console.log(`[repair] done. patched=${patched} unchanged=${unchanged}`);
  if (!APPLY) console.log('[repair] dry-run only. Re-run with --apply to write PocketBase.');
})().catch(err => {
  console.error('[repair] fatal:', err);
  process.exit(1);
});
