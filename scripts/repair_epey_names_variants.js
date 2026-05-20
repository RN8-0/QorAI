/**
 * Cleans country/market code leakage in existing products and recomputes
 * variantGroup with the current same-model rules.
 *
 *   node scripts/repair_epey_names_variants.js --dry
 *   node scripts/repair_epey_names_variants.js
 */
'use strict';

const { req } = require('../migration/pb');
const { modelFamilyKey } = require('./lib/model_family');

const DRY = process.argv.includes('--dry');
const CONCURRENCY = 10;
const COUNTRY_CODES = [
  'TR','TU','US','UK','EU','DE','FR','IT','ES','PT','NL','PL','NO','DK','FI',
  'JP','CN','KR','AE','SA','AU','NZ','CA','MX','BR',
];
const EPEY_CATEGORY_PATHS = [
  ['akilli-telefonlar', 'smartphones'],
  ['tablet', 'tablets'],
  ['laptop', 'laptops'],
  ['masaustu-bilgisayar', 'desktops'],
  ['islemci', 'cpus'],
  ['ekran-karti', 'graphics_cards'],
  ['bellek-ram', 'ram'],
  ['anakart', 'motherboards'],
  ['power-supply-psu', 'psu'],
  ['bilgisayar-kasasi', 'pc_cases'],
  ['islemci-sogutucu', 'cpu_coolers'],
  ['kasa-fani', 'case_fans'],
  ['monitor', 'monitors'],
  ['televizyon', 'tvs'],
  ['projeksiyon-makinesi', 'projectors'],
  ['kulaklik', 'headphones'],
  ['akilli-saat', 'smartwatches'],
  ['fotograf-kamera', 'digital_cameras'],
  ['aynasiz-fotograf-makinesi', 'digital_cameras'],
  ['aksiyon-kamera', 'action_cameras'],
  ['ip-kamera', 'security_cameras'],
  ['oyun-konsolu', 'gaming_consoles'],
  ['oyun-kolu', 'gamepads'],
  ['yazici', 'printers'],
  ['webcam', 'webcams'],
  ['router', 'routers'],
  ['modem', 'modem_routers'],
  ['switch', 'network_switches'],
  ['kablosuz-adaptor', 'pcie_nic'],
  ['menzil-genisletici', 'wifi_repeaters'],
  ['robot-supurge', 'robot_vacuums'],
  ['powerbank', 'powerbanks'],
  ['e-kitap-okuyucu', 'e_readers'],
  ['drone', 'drones'],
];

// Epey lists keyboards and mice under the SAME top-level path
// `/klavye-mouse/...` so we cannot infer the category from the URL alone.
// Split them by the product name token Epey always prints — Klavye or Mouse.
function classifyMixedKlavyeMouse(name, currentCategory) {
  const n = String(name || '').toLowerCase();
  if (/\bklavye\b/.test(n)) return 'keyboards';
  if (/\bmouse\b|\bmice\b/.test(n)) return 'mice';
  return currentCategory;
}

function categoryFromSourceUrl(sourceUrl, currentCategory, name) {
  try {
    const first = new URL(sourceUrl).pathname.split('/').filter(Boolean)[0] || '';
    if (first === 'klavye-mouse') return classifyMixedKlavyeMouse(name, currentCategory);
    const hit = EPEY_CATEGORY_PATHS.find(([path]) => path === first);
    return hit ? hit[1] : currentCategory;
  } catch {
    return currentCategory;
  }
}

function cleanCountryCodes(value) {
  let s = String(value ?? '');
  if (!s) return '';
  const code = COUNTRY_CODES.join('|');
  s = s
    .replace(new RegExp(`\\b([A-Z0-9][A-Z0-9-]{2,}?-\\d{2,6})(${code})\\b`, 'g'), '$1')
    .replace(new RegExp(`(?:^|[\\s_/|,;()\\[\\]{}-])(${code})(?=$|[\\s_/|,;()\\[\\]{}-])`, 'g'), ' ')
    .replace(/\b(?:turkish|türkçe|turkce|türkiye|turkiye|german|deutsch|english|spanish|french|italian|portuguese|polish|swedish|japanese|chinese)\b/gi, ' ')
    .replace(/\s+([,;:|)])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\[\s*\]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+-\s*$/g, '')
    .trim();
  return s;
}

function cleanMap(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  const out = {};
  for (const [key, value] of Object.entries(map)) {
    const k = cleanCountryCodes(key);
    if (!k) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = cleanMap(value);
      if (Object.keys(nested).length) out[k] = nested;
    } else {
      const v = cleanCountryCodes(value);
      if (v) out[k] = v;
    }
  }
  return out;
}

async function fetchAll() {
  const out = [];
  for (let page = 1;; page++) {
    const r = await req('GET', `/api/collections/products/records?perPage=300&page=${page}&sort=id&fields=id,name,brand,category,sourceUrl,variantGroup,keySpecs,specs,specSections,specsCount`);
    if (r.status !== 200) throw new Error(`fetch ${page}: ${r.status} ${JSON.stringify(r.body).slice(0, 180)}`);
    out.push(...(r.body.items || []));
    if (page >= (r.body.totalPages || 1)) break;
  }
  return out;
}

async function runPool(items, worker) {
  let next = 0, done = 0;
  async function loop() {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
      if (++done % 500 === 0) console.log(`   ...${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, loop));
}

function diffProduct(p) {
  const name = cleanCountryCodes(p.name);
  const keySpecs = cleanMap(p.keySpecs);
  const specs = cleanMap(p.specs);
  const specSections = cleanMap(p.specSections);
  const category = categoryFromSourceUrl(p.sourceUrl, p.category, name || p.name);
  const variantGroup = modelFamilyKey({ name, brand: p.brand, category });
  const patch = {};
  if (name && name !== p.name) patch.name = name;
  if (category && category !== p.category) patch.category = category;
  if (variantGroup && variantGroup !== p.variantGroup) patch.variantGroup = variantGroup;
  if (JSON.stringify(keySpecs) !== JSON.stringify(p.keySpecs || {})) patch.keySpecs = keySpecs;
  if (JSON.stringify(specs) !== JSON.stringify(p.specs || {})) patch.specs = specs;
  if (JSON.stringify(specSections) !== JSON.stringify(p.specSections || {})) patch.specSections = specSections;
  const specCount = Object.keys(specs).length;
  if (specCount && specCount !== Number(p.specsCount || 0)) patch.specsCount = specCount;
  return patch;
}

async function main() {
  console.log(`\n  Epey/name/variant repair ${DRY ? '(DRY)' : ''}\n`);
  const products = await fetchAll();
  console.log(`  loaded ${products.length} products`);
  const updates = products.map(p => ({ id: p.id, patch: diffProduct(p), before: p }))
    .filter(x => Object.keys(x.patch).length);
  console.log(`  ${updates.length} products need cleanup`);
  updates.slice(0, 10).forEach(u => {
    if (u.patch.name || u.patch.variantGroup) {
      console.log(`   - ${u.before.name} -> ${u.patch.name || u.before.name} | vg=${u.patch.variantGroup || u.before.variantGroup}`);
    }
  });
  if (DRY || !updates.length) return;
  let ok = 0, fail = 0;
  await runPool(updates, async (u) => {
    const r = await req('PATCH', `/api/collections/products/records/${u.id}`, u.patch);
    if (r.status === 200) ok++;
    else { fail++; if (fail <= 10) console.log(`   ! ${u.id}: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`); }
  });
  console.log(`\n  done: ${ok} updated, ${fail} failed\n`);
}

main().catch(e => { console.error('  x', e.message); process.exit(1); });
