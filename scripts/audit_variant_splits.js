/**
 * Qor AI — variant split audit
 *
 * Finds products that look like the same model family but are currently split
 * across several variantGroup values. Read-only.
 *
 *   node scripts/audit_variant_splits.js
 */
'use strict';

const { req } = require('../migration/pb');
const { modelFamilyKey } = require('./lib/model_family');
const { configKey } = require('./lib/config_key');

const FIELDS = 'id,name,brand,category,variantGroup,configKey,variantPrimary,variantCount,keySpecs,specs,specSections';

function short(s, n = 92) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

async function fetchAll() {
  const byId = new Map();
  for (let page = 1;; page++) {
    const r = await req('GET', `/api/collections/products/records?perPage=500&page=${page}&sort=id&fields=${FIELDS}`);
    if (r.status !== 200) throw new Error(`fetch page ${page}: ${JSON.stringify(r.body).slice(0, 200)}`);
    for (const item of (r.body.items || [])) byId.set(item.id, item);
    if (page >= (r.body.totalPages || 1)) break;
  }
  return [...byId.values()];
}

function add(map, key, p) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(p);
}

async function main() {
  const products = await fetchAll();
  console.log(`\n  Variant split audit\n  ${products.length} products loaded\n`);

  const recomputeChanges = [];
  const recomputed = new Map();
  const configDupes = new Map();

  for (const p of products) {
    const nextGroup = modelFamilyKey(p);
    if (nextGroup && nextGroup !== p.variantGroup) {
      recomputeChanges.push({ p, nextGroup });
    }
    add(recomputed, `${p.category}|${nextGroup}`, p);
    add(configDupes, `${p.category}|${configKey(p)}`, p);
  }

  const splitFamilies = [...recomputed.entries()]
    .map(([key, items]) => ({
      key,
      items,
      groups: new Set(items.map(p => p.variantGroup || '')),
    }))
    .filter(x => x.items.length > 1 && x.groups.size > 1)
    .sort((a, b) => b.items.length - a.items.length || b.groups.size - a.groups.size);

  const duplicateConfigs = [...configDupes.entries()]
    .map(([key, items]) => ({ key, items }))
    .filter(x => x.items.length > 1)
    .sort((a, b) => b.items.length - a.items.length);

  console.log(`  Products whose stored variantGroup differs from current rules: ${recomputeChanges.length}`);
  console.log(`  Families still split across multiple stored variantGroups: ${splitFamilies.length}`);
  console.log(`  Duplicate real configurations by current configKey: ${duplicateConfigs.length}\n`);

  if (recomputeChanges.length) {
    console.log('  Sample records needing variantGroup repair:');
    for (const { p, nextGroup } of recomputeChanges.slice(0, 12)) {
      console.log(`   • ${short(p.name)}\n     ${p.variantGroup || '(empty)'} -> ${nextGroup}`);
    }
    console.log('');
  }

  if (splitFamilies.length) {
    console.log('  Sample split families:');
    for (const f of splitFamilies.slice(0, 12)) {
      console.log(`   • ${f.key} (${f.items.length} rows, ${f.groups.size} stored groups)`);
      for (const p of f.items.slice(0, 4)) {
        console.log(`     - [${p.variantGroup || '(empty)'}] ${short(p.name, 76)}`);
      }
    }
    console.log('');
  }

  if (duplicateConfigs.length) {
    console.log('  Sample duplicate configurations:');
    for (const f of duplicateConfigs.slice(0, 12)) {
      console.log(`   • ${f.key} (${f.items.length} rows)`);
      for (const p of f.items.slice(0, 4)) console.log(`     - ${short(p.name, 76)}`);
    }
    console.log('');
  }

  if (!recomputeChanges.length && !splitFamilies.length && !duplicateConfigs.length) {
    console.log('  Clean — no obvious variant split or config duplicate found.\n');
  }
}

main().catch(e => { console.error('  ✗', e.message); process.exit(1); });
