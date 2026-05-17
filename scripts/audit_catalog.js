/**
 * Qor AI — catalog audit
 *
 * Read-only health check of the products collection: duplicate detection,
 * image / spec quality, brand & category spread, variant-group integrity.
 *
 *   node scripts/audit_catalog.js
 */
'use strict';

const { req, auth } = require('../migration/pb');

async function fetchAll() {
  const out = [];
  let page = 1;
  for (;;) {
    const r = await req('GET',
      `/api/collections/products/records?perPage=500&page=${page}&sort=id` +
      `&fields=id,name,brand,category,source,configKey,variantGroup,variantPrimary,` +
      `gtin,mpn,icecatId,specsCount,imageUrl,images,techScore`);
    if (r.status !== 200) throw new Error(`list page ${page}: ${r.status}`);
    out.push(...(r.body.items || []));
    if (page >= (r.body.totalPages || 1)) break;
    page++;
  }
  return out;
}

function tally(arr, keyFn) {
  const m = {};
  for (const x of arr) { const k = keyFn(x); if (k == null) continue; m[k] = (m[k] || 0) + 1; }
  return m;
}

function dupGroups(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return [...m.entries()].filter(([, v]) => v.length > 1);
}

(async () => {
  console.log('\nQor AI — catalog audit\n');
  await auth();
  const P = await fetchAll();
  console.log(`Total products: ${P.length}\n`);

  // ── Source / category / brand spread ──
  console.log('By source:');
  for (const [k, v] of Object.entries(tally(P, p => p.source || '(none)')).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(16)} ${v}`);
  }
  console.log('\nBy category:');
  for (const [k, v] of Object.entries(tally(P, p => p.category || '(none)')).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(16)} ${v}`);
  }
  const brands = Object.entries(tally(P, p => (p.brand || '(none)').trim())).sort((a, b) => b[1] - a[1]);
  console.log(`\nBrands: ${brands.length} distinct. Top 20:`);
  for (const [k, v] of brands.slice(0, 20)) console.log(`  ${k.padEnd(22)} ${v}`);

  // ── Duplicate detection ──
  console.log('\n── DUPLICATE CHECK ──');

  const ckDup = dupGroups(P, p => p.configKey ? `${p.category}|${p.configKey}` : '');
  console.log(`\nSame category+configKey (should be 1 each): ${ckDup.length} groups`);
  for (const [k, v] of ckDup.slice(0, 10)) console.log(`  ${v.length}×  ${v[0].name?.slice(0, 60)}`);

  const gtinDup = dupGroups(P.filter(p => p.gtin && /\d{8}/.test(p.gtin)), p => p.gtin.trim());
  console.log(`\nSame GTIN: ${gtinDup.length} groups`);
  for (const [k, v] of gtinDup.slice(0, 10)) console.log(`  ${v.length}×  GTIN ${k} — ${v[0].name?.slice(0, 50)}`);

  const mpnDup = dupGroups(P.filter(p => p.mpn && p.brand), p => `${p.brand.toLowerCase().trim()}|${p.mpn.trim()}`);
  console.log(`\nSame brand+MPN: ${mpnDup.length} groups`);
  for (const [k, v] of mpnDup.slice(0, 10)) console.log(`  ${v.length}×  ${v[0].brand} ${v[0].mpn} — ${v[0].name?.slice(0, 45)}`);

  const nameDup = dupGroups(P, p => `${p.category}|${(p.name || '').toLowerCase().replace(/\s+/g, ' ').trim()}`);
  console.log(`\nIdentical name+category: ${nameDup.length} groups`);
  for (const [k, v] of nameDup.slice(0, 10)) console.log(`  ${v.length}×  ${v[0].name?.slice(0, 60)}`);

  const icDup = dupGroups(P.filter(p => p.icecatId), p => String(p.icecatId));
  console.log(`\nSame Icecat ID (hard duplicate): ${icDup.length} groups`);

  // ── Image / spec quality ──
  console.log('\n── QUALITY CHECK ──');
  const imgCount = p => Array.isArray(p.images) ? p.images.length : 0;
  const noImg = P.filter(p => !p.imageUrl && imgCount(p) === 0);
  const imgHist = tally(P, p => `${Math.min(imgCount(p), 8)} img`);
  console.log(`\nProducts with NO image: ${noImg.length}`);
  console.log('Image-count distribution:');
  for (const [k, v] of Object.entries(imgHist).sort()) console.log(`  ${k.padEnd(8)} ${v}`);

  const lowSpec = P.filter(p => (p.specsCount || 0) < 10);
  console.log(`\nProducts with <10 specs: ${lowSpec.length}`);
  const noScore = P.filter(p => !p.techScore);
  console.log(`Products with no techScore: ${noScore.length}`);

  // ── Variant integrity ──
  console.log('\n── VARIANT CHECK ──');
  const vgGroups = dupGroups(P, p => p.variantGroup ? `${p.category}|${p.variantGroup}` : '');
  let noPrimary = 0, multiPrimary = 0;
  for (const [, v] of vgGroups) {
    const primaries = v.filter(p => p.variantPrimary).length;
    if (primaries === 0) noPrimary++;
    if (primaries > 1) multiPrimary++;
  }
  const noVg = P.filter(p => !p.variantGroup).length;
  console.log(`Variant families (>1 SKU): ${vgGroups.length}`);
  console.log(`  families with NO primary:    ${noPrimary}`);
  console.log(`  families with >1 primary:    ${multiPrimary}`);
  console.log(`Products with no variantGroup:  ${noVg}`);

  console.log('\nDone.\n');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
