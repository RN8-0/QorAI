#!/usr/bin/env node
/**
 * Canonicalize PocketBase product specs across Icecat/Epey source labels.
 *
 * Usage:
 *   node scripts/repair_specs_canonical.js --dry --category=smartphones
 *   node scripts/repair_specs_canonical.js --apply --category=smartphones
 *   node scripts/repair_specs_canonical.js --apply --ids=id1,id2
 *   node scripts/repair_specs_canonical.js --apply --all
 */
'use strict';

const path = require('path');
const { req: pbReq } = require('../migration/pb');
const { req: tsReq } = require('../migration/ts');
// spec_i18n ONCE yuklenmeli: spec_canonical yarim cevrilmis etiketleri
// ("Diger Specifications", "Display Boyutu") tamamlamak icin OPSIYONEL
// olarak globalThis.QorAiSpecI18n'i arar. Yuklenmezse sessizce atlar --
// yani bu satir olmadan onarim etiketleri DUZELTMEZ, hata da vermez.
require(path.join(__dirname, '..', 'admin', 'js', 'spec_i18n.js'));
const Canon = require(path.join(__dirname, '..', 'admin', 'js', 'spec_canonical.js'));

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const DRY = argv.includes('--dry') || !APPLY;
const ALL = argv.includes('--all');
const NO_TS = argv.includes('--no-ts');
const CATEGORY = (argv.find(a => a.startsWith('--category=')) || '').split('=')[1] || '';
const IDS = ((argv.find(a => a.startsWith('--ids=')) || '').split('=')[1] || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const LIMIT = Number((argv.find(a => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const CONCURRENCY = Math.max(1, Number((argv.find(a => a.startsWith('--concurrency=')) || '').split('=')[1] || 8));

const FIELDS = [
  'id', 'name', 'brand', 'category', 'source', 'sourceUrl', 'slug',
  'imageUrl', 'images', 'techScore', 'specs', 'specSections', 'keySpecs',
  'specsEn', 'multiLangSpecs', 'multiLangSections', 'nameTranslated',
  'specsCount',
].join(',');

// ANAHTAR SIRASI FARKI DEGISIKLIK DEGILDIR.
//
// PocketBase JSON alanlarini Go map'i olarak isliyor ve SIRALI anahtarlarla
// geri veriyor; kanoniklestirici ise EKLEME sirasinda uretiyor. Duz
// JSON.stringify karsilastirmasi sirayla ilgilendigi icin ICERIK AYNI olsa
// bile her kayit "degisti" cikiyordu. Olculdu 2026-08-30 (desktops, 5 kayit):
//   PB ilk 5 : Bellek Turu | Cache | Color | Dahili Grafik Modeli | Display
//   yeni ilk5: Diger Baglantilar | Ethernet (Ag) | HDMI | USB A | VGA
//   ayni anahtar KUMESI: true · sayilar esit
//
// Sonucu iki kat zararliydi: (1) her kosu 107k kaydi PB'ye ve Typesense'e
// GEREKSIZ yere yeniden yaziyordu -- tek host icin agir; (2) her PATCH
// kaydin `updated` alanina dokundugu icin `updatedAtTs` seliyle ana
// sayfadaki "Yeni" rayi zehirleniyordu (bkz. project_updatedat_is_not_new).
//
// Karsilastirma artik anahtar sirasindan BAGIMSIZ.
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function jsonEq(a, b) {
  return stableStringify(a || {}) === stableStringify(b || {});
}

function buildPatch(product) {
  const canonical = Canon.canonicalizeProduct(product);
  const patch = {};
  if (!jsonEq(canonical.specs, product.specs)) patch.specs = canonical.specs;
  if (!jsonEq(canonical.specSections, product.specSections)) patch.specSections = canonical.specSections;
  if (!jsonEq(canonical.keySpecs, product.keySpecs)) patch.keySpecs = canonical.keySpecs;
  if (!jsonEq(canonical.specsEn, product.specsEn)) patch.specsEn = canonical.specsEn;

  const multiLangSpecs = { ...(product.multiLangSpecs || {}), en: canonical.specs };
  const multiLangSections = { ...(product.multiLangSections || {}), en: canonical.specSections };
  if (!jsonEq(multiLangSpecs, product.multiLangSpecs)) patch.multiLangSpecs = multiLangSpecs;
  if (!jsonEq(multiLangSections, product.multiLangSections)) patch.multiLangSections = multiLangSections;

  const count = Object.keys(canonical.specs || {}).length;
  if ((Number(product.specsCount) || 0) !== count) patch.specsCount = count;
  return patch;
}

function keySpecsText(product, patch) {
  const chunks = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === 'object') Object.entries(value).forEach(([k, v]) => { chunks.push(k); visit(v); });
    else chunks.push(String(value));
  };
  visit(patch.keySpecs || product.keySpecs);
  visit(patch.specs || product.specs);
  visit(patch.specSections || product.specSections);
  return chunks.join(' ').replace(/\s+/g, ' ').trim().slice(0, 60000);
}

async function fetchByIds(ids) {
  const out = [];
  for (const id of ids) {
    const r = await pbReq('GET', `/api/collections/products/records/${encodeURIComponent(id)}?fields=${encodeURIComponent(FIELDS)}`);
    if (r.status === 200) out.push(r.body);
    else console.warn(`[warn] id ${id} failed: ${r.status}`);
  }
  return out;
}

async function fetchProducts() {
  if (IDS.length) return fetchByIds(IDS);
  if (!CATEGORY && !ALL) {
    throw new Error('Pass --category=<slug>, --ids=id1,id2 or --all.');
  }
  const out = [];
  let lastId = '';
  let page = 1;
  for (;;) {
    const filters = [];
    if (CATEGORY) filters.push(`category = "${CATEGORY.replace(/"/g, '\\"')}"`);
    if (lastId) filters.push(`id > "${lastId.replace(/"/g, '\\"')}"`);
    const filter = filters.length ? `&filter=${encodeURIComponent(filters.join(' && '))}` : '';
    const url = `/api/collections/products/records?perPage=500&page=1&sort=id&skipTotal=1&fields=${encodeURIComponent(FIELDS)}${filter}`;
    const r = await pbReq('GET', url);
    if (r.status !== 200) throw new Error(`fetch page ${page}: ${r.status} ${JSON.stringify(r.body).slice(0, 220)}`);
    const items = r.body.items || [];
    out.push(...items);
    if (items.length) lastId = items[items.length - 1].id;
    console.log(`[load] page ${page}: ${items.length} · total ${out.length}`);
    if ((LIMIT && out.length >= LIMIT) || items.length < 500) break;
    page++;
  }
  return LIMIT ? out.slice(0, LIMIT) : out;
}

async function patchTypesense(product, patch, saved) {
  const raw = { ...product, ...patch, ...(saved || {}) };
  delete raw.collectionId;
  delete raw.collectionName;
  const tsPatch = {
    _raw: JSON.stringify(raw),
    keySpecsText: keySpecsText(product, patch),
    specsCount: patch.specsCount != null ? patch.specsCount : product.specsCount,
  };
  const r = await tsReq('PATCH', `/collections/products/documents/${encodeURIComponent(product.id)}`, tsPatch);
  return r.status >= 200 && r.status < 300;
}

async function runPool(items, worker) {
  let index = 0;
  let done = 0;
  async function next() {
    for (;;) {
      const item = items[index++];
      if (!item) break;
      await worker(item);
      done++;
      if (done % 500 === 0) console.log(`[canonical] progress ${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length || 1) }, next));
}

(async () => {
  console.log(`[canonical] version=${Canon.VERSION}`);
  console.log(`[canonical] mode=${DRY ? 'DRY' : 'APPLY'} category=${CATEGORY || 'n/a'} ids=${IDS.length || 0} all=${ALL} concurrency=${CONCURRENCY}`);
  const products = await fetchProducts();
  console.log(`[canonical] loaded ${products.length} products`);

  let changed = 0, unchanged = 0, pbOk = 0, pbFail = 0, tsOk = 0, tsFail = 0;
  await runPool(products, async (product) => {
    const patch = buildPatch(product);
    if (!Object.keys(patch).length) {
      unchanged++;
      return;
    }
    changed++;
    if (changed <= 10 || changed % 250 === 0) {
      console.log(`[canonical] ${DRY ? 'would patch' : 'patch'} ${changed}: ${product.id} ${product.name}`);
    }
    if (DRY) return;
    const r = await pbReq('PATCH', `/api/collections/products/records/${product.id}`, patch);
    if (r.status >= 200 && r.status < 300) {
      pbOk++;
      if (!NO_TS) {
        try {
          if (await patchTypesense(product, patch, r.body)) tsOk++;
          else tsFail++;
        } catch (e) {
          tsFail++;
          if (tsFail <= 5) console.warn(`[warn] TS ${product.id}: ${e.message}`);
        }
      }
    } else {
      pbFail++;
      if (pbFail <= 10) console.warn(`[warn] PB ${product.id}: ${r.status} ${JSON.stringify(r.body).slice(0, 220)}`);
    }
  });

  console.log(`[canonical] done changed=${changed} unchanged=${unchanged} pb=${pbOk}/${pbFail} ts=${NO_TS ? 'skipped' : `${tsOk}/${tsFail}`}`);
  if (DRY) console.log('[canonical] dry run only; add --apply to write PB.');
  process.exit(pbFail || tsFail ? 1 : 0);
})().catch(err => {
  console.error('[canonical] fatal:', err);
  process.exit(1);
});
