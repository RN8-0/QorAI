'use strict';

const { req } = require('../migration/pb');
const { configKey } = require('./lib/config_key');

const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const YES = process.argv.includes('--yes');
const CONCURRENCY = 12;
const FIELDS = 'id,name,brand,category,source,configKey,variantGroup,specsCount,techScore,imageUrl,images,keySpecs,specs,specSections,icecatId';

function minSpecsForCategory(category) {
  if (['laptops', 'smartphones', 'tablets'].includes(category)) return 20;
  if (['tvs', 'monitors', 'desktops', 'digital_cameras'].includes(category)) return 15;
  return 8;
}

function rank(p) {
  return [
    p.imageUrl ? 1 : 0,
    Array.isArray(p.images) ? p.images.length : 0,
    Number(p.specsCount) || Object.keys(p.specs || {}).length || 0,
    Number(p.techScore) || 0,
    Number(p.icecatId) || 0,
  ];
}

function better(a, b) {
  const ra = rank(a), rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i] ? a : b;
  return String(a.id) <= String(b.id) ? a : b;
}

async function fetchIcecatProducts() {
  const out = [];
  let page = 1;
  for (;;) {
    const r = await withRetries(`fetch page ${page}`, () => req('GET',
      `/api/collections/products/records?perPage=500&page=${page}&sort=id&filter=${encodeURIComponent('source="icecat"')}&fields=${encodeURIComponent(FIELDS)}`));
    if (r.status !== 200) throw new Error(`fetch page ${page}: ${r.status} ${JSON.stringify(r.body).slice(0, 250)}`);
    out.push(...(r.body.items || []));
    if (page % 10 === 0) console.log(`loaded page ${page}/${r.body.totalPages || '?'} · ${out.length}`);
    if (page >= (r.body.totalPages || 1)) break;
    page++;
  }
  return out;
}

async function withRetries(label, fn, attempts = 5) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      const result = await fn();
      if (result.status < 500) return result;
      last = new Error(`${result.status} ${JSON.stringify(result.body).slice(0, 200)}`);
    } catch (error) {
      last = error;
    }
    const delay = Math.min(30000, 1000 * 2 ** (i - 1));
    console.warn(`retry ${i}/${attempts} ${label}: ${last.message || last}`);
    if (i < attempts) await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw last;
}

async function runPool(items, worker) {
  let i = 0;
  async function next() {
    while (i < items.length) await worker(items[i++]);
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next));
}

async function main() {
  if (!DRY_RUN && !YES) throw new Error('Refusing to delete without --yes. Use --dry-run first.');

  const products = await fetchIcecatProducts();
  console.log(`loaded source=icecat products: ${products.length}`);

  const deleteMap = new Map();
  const lowQuality = [];
  for (const p of products) {
    const specsCount = Number(p.specsCount) || Object.keys(p.specs || {}).length || 0;
    const min = minSpecsForCategory(p.category);
    const hasImage = !!p.imageUrl && (!Array.isArray(p.images) || p.images.length > 0);
    if (!hasImage || specsCount < min) {
      lowQuality.push(p);
      deleteMap.set(p.id, { product: p, reason: !hasImage ? 'no_image' : `low_specs_${specsCount}_lt_${min}` });
    }
  }

  const groups = new Map();
  for (const p of products) {
    if (deleteMap.has(p.id)) continue;
    const ck = p.configKey || configKey(p);
    if (!ck) continue;
    const key = `${p.category || ''}|${ck}`;
    const g = groups.get(key) || [];
    g.push(p);
    groups.set(key, g);
  }

  let duplicateGroups = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    duplicateGroups++;
    let keep = group[0];
    for (let i = 1; i < group.length; i++) keep = better(keep, group[i]);
    for (const p of group) {
      if (p.id !== keep.id) deleteMap.set(p.id, { product: p, reason: 'duplicate_config' });
    }
  }

  const toDelete = [...deleteMap.values()];
  const byReason = {};
  for (const item of toDelete) byReason[item.reason] = (byReason[item.reason] || 0) + 1;
  console.log(`low/no-spec/image rows: ${lowQuality.length}`);
  console.log(`duplicate config groups: ${duplicateGroups}`);
  console.log(`to delete: ${toDelete.length}`);
  console.log(byReason);
  for (const item of toDelete.slice(0, 12)) {
    const p = item.product;
    console.log(`  ${DRY_RUN ? 'would delete' : 'delete'} [${item.reason}] ${p.category} ${p.brand || ''} ${String(p.name || '').slice(0, 90)}`);
  }

  if (DRY_RUN || !toDelete.length) return;

  let ok = 0, fail = 0;
  await runPool(toDelete, async ({ product }) => {
    const r = await req('DELETE', `/api/collections/products/records/${product.id}`);
    if ([200, 204].includes(r.status)) ok++;
    else {
      fail++;
      if (fail <= 10) console.warn(`delete failed ${product.id}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    }
  });
  console.log(`deleted: ${ok}, failed: ${fail}`);
}

main().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
