// scripts/add_translation_fields.js
// ─────────────────────────────────────────────────────────────────────────
// Non-destructive migration: adds the multi-language JSON fields the
// scraper writes to PocketBase. Without these fields PB silently strips
// translations on save → modal language picker shows everything as
// "(fallback)" because multiLangSpecs / nameTranslated never persist.
//
// SAFE TO RE-RUN: existing fields are left untouched, missing ones are
// appended. No product records are deleted.
// ─────────────────────────────────────────────────────────────────────────

const { req } = require('../migration/pb');

const NEW_FIELDS = [
  { name: 'multiLangSpecs',    type: 'json', maxSize: 5000000 },
  { name: 'multiLangSections', type: 'json', maxSize: 1000000 },
  { name: 'nameTranslated',    type: 'json', maxSize: 100000  },
  { name: 'specsEn',           type: 'json', maxSize: 2000000 },
  { name: 'sourceLang',        type: 'text', max: 10 },
  { name: 'sourceSpecs',       type: 'json', maxSize: 5000000 },
  { name: 'sourceSpecSections', type: 'json', maxSize: 5000000 },
  { name: 'sourceKeySpecs',    type: 'json', maxSize: 2000000 },
];

async function main() {
  const res = await req('GET', '/api/collections/products');
  if (res.status !== 200) {
    throw new Error(`Read collection failed: ${JSON.stringify(res.body)}`);
  }

  const collection = res.body;
  const existing = new Map((collection.fields || []).map(f => [f.name, f]));
  const toAdd = NEW_FIELDS.filter(f => !existing.has(f.name));

  if (toAdd.length === 0) {
    console.log('✅ All translation fields already present — nothing to do.');
    return;
  }

  console.log(`Adding ${toAdd.length} field(s):`, toAdd.map(f => f.name).join(', '));

  const merged = [...(collection.fields || []), ...toAdd];

  const patched = await req('PATCH', '/api/collections/products', {
    ...collection,
    fields: merged,
  });

  if (patched.status !== 200) {
    throw new Error(`Patch failed (${patched.status}): ${JSON.stringify(patched.body)}`);
  }

  console.log(`✅ products schema patched. Total fields: ${patched.body.fields.length}`);
  console.log('   New translation fields:', toAdd.map(f => f.name).join(', '));
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
