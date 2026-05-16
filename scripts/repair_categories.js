/**
 * Qor AI — Category Collection Repair
 *
 * Cleans up the PocketBase `categories` collection after mixed-convention
 * ingestion left it with duplicate / stale records:
 *
 *   1. Re-tags products whose `category` is a non-canonical slug
 *      (hyphenated old Icecat slugs, "switch2_consoles", aliases…) to the
 *      single canonical slug. Mirrors canonicalCategory() in icecat_ingest.js
 *      and normalizeCategoryId() in admin/js/categories.js.
 *   2. Deletes the now-orphaned non-canonical category records.
 *   3. Recounts every remaining category against the live product catalog and
 *      writes the real productCount + isActive (empty => inactive).
 *
 * App-level categories (gaming/subscription/tech/travel) are left untouched.
 *
 *   node scripts/repair_categories.js            apply
 *   node scripts/repair_categories.js --dry      preview only
 */
'use strict';

const { req } = require('../migration/pb');

const DRY = process.argv.includes('--dry');

// Slugs that are app sections, not scraper product categories — never touch.
const SKIP_SLUGS = new Set(['gaming', 'subscription', 'tech', 'travel']);

// Alias table — keep in sync with admin/js/categories.js CATEGORY_ALIASES
// and scripts/icecat_ingest.js canonicalCategory().
const ALIASES = {
  laptop: 'laptops', notebook: 'laptops', notebooks: 'laptops',
  notebooks_laptops: 'laptops', notebook_laptop: 'laptops', notebooks_laptop: 'laptops',
  all_in_one_pcs: 'desktops', all_in_one_pc: 'desktops',
  desktop: 'desktops', pc: 'desktops', pcs: 'desktops',
  cpu: 'cpus', processor: 'cpus', processors: 'cpus',
  ssds: 'ssd', internal_ssds: 'ssd',
  hdd: 'hard_drives', hdds: 'hard_drives',
  external_hdds: 'external_hdd',
  psus: 'psu', power_supplies: 'psu',
  cases: 'pc_cases', computer_cases: 'pc_cases',
  coolers: 'cpu_coolers', computer_cooling_systems: 'cpu_coolers',
  nas: 'nas_servers',
  network_cards: 'pcie_nic',
  mobile_phones: 'smartphones',
  cameras: 'digital_cameras',
  camcorders: 'video_cameras',
  portable_speakers: 'speakers',
  multifunction_printers: 'printers', laser_printers: 'printers', label_printers: 'printers',
  switch2_consoles: 'gaming_consoles', switch2_accessories: 'gaming_accessories', switch2_games: 'games',
};

function canon(slug) {
  const s = String(slug || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return ALIASES[s] || s;
}

const enc = v => encodeURIComponent(v);
const filt = v => `category="${String(v).replace(/"/g, '\\"')}"`;

async function countProducts(category) {
  const r = await req('GET', `/api/collections/products/records?perPage=1&fields=id&filter=${enc(filt(category))}`);
  if (r.status !== 200) throw new Error(`count failed for ${category}: ${JSON.stringify(r.body).slice(0, 160)}`);
  return r.body.totalItems || 0;
}

// Re-tag every product carrying `from` so it becomes `to`. Returns count moved.
async function retagProducts(from, to) {
  let moved = 0;
  for (;;) {
    const r = await req('GET', `/api/collections/products/records?perPage=100&fields=id&filter=${enc(filt(from))}`);
    if (r.status !== 200) throw new Error(`product fetch failed: ${JSON.stringify(r.body).slice(0, 160)}`);
    const items = r.body.items || [];
    if (!items.length) break;
    for (const p of items) {
      if (DRY) { moved++; continue; }
      const u = await req('PATCH', `/api/collections/products/records/${p.id}`, { category: to });
      if (u.status === 200) moved++;
      else console.log(`   ! patch ${p.id} failed: ${JSON.stringify(u.body).slice(0, 120)}`);
    }
    if (DRY) break; // dry run: don't loop forever, totalItems already tells us
  }
  if (DRY) {
    const r = await req('GET', `/api/collections/products/records?perPage=1&fields=id&filter=${enc(filt(from))}`);
    moved = r.status === 200 ? (r.body.totalItems || 0) : 0;
  }
  return moved;
}

async function main() {
  console.log(`\n  Category repair ${DRY ? '(DRY RUN)' : ''}\n`);

  const catRes = await req('GET', '/api/collections/categories/records?perPage=500&sort=slug');
  if (catRes.status !== 200) throw new Error(`categories list failed: ${JSON.stringify(catRes.body).slice(0, 200)}`);
  const categories = catRes.body.items || [];
  console.log(`  ${categories.length} category records found\n`);

  const bySlug = new Map(categories.map(c => [c.slug, c]));
  const noncanonical = categories.filter(c => c.slug && !SKIP_SLUGS.has(c.slug) && canon(c.slug) !== c.slug);

  // ─── 1+2. Merge non-canonical categories into their canonical slug ──────────
  for (const cat of noncanonical) {
    const target = canon(cat.slug);
    const moved = await retagProducts(cat.slug, target);
    console.log(`  • ${cat.slug} → ${target}: ${moved} product(s) re-tagged`);

    if (moved > 0 && !bySlug.has(target)) {
      // Ensure the canonical category exists before we delete the old one.
      if (!DRY) {
        const create = await req('POST', '/api/collections/categories/records', {
          slug: target, name: target.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase()),
          nameEn: target.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase()),
          icon: 'box', emoji: '', order: 1000, isActive: true, subcategories: [],
        });
        if ([200, 201].includes(create.status)) bySlug.set(target, create.body);
      }
      console.log(`    + created canonical category "${target}"`);
    }

    if (!DRY) {
      const del = await req('DELETE', `/api/collections/categories/records/${cat.id}`);
      console.log(`    - deleted stale record "${cat.slug}" (${del.status})`);
    } else {
      console.log(`    - would delete stale record "${cat.slug}"`);
    }
    bySlug.delete(cat.slug);
  }

  // ─── 3. Recount + activate/deactivate every remaining category ─────────────
  console.log('\n  Recounting categories…');
  let active = 0, inactive = 0;
  for (const cat of bySlug.values()) {
    if (SKIP_SLUGS.has(cat.slug)) continue;
    const count = await countProducts(cat.slug);
    const isActive = count > 0;
    isActive ? active++ : inactive++;
    const patch = { productCount: count, isActive };
    // One-off: normalise the laptops display name.
    if (cat.slug === 'laptops' && cat.name !== 'Laptops') { patch.name = 'Laptops'; patch.nameEn = 'Laptops'; }
    if (!DRY) {
      const u = await req('PATCH', `/api/collections/categories/records/${cat.id}`, patch);
      if (u.status !== 200) console.log(`   ! recount patch ${cat.slug} failed: ${u.status}`);
    }
    console.log(`  · ${cat.slug.padEnd(22)} ${String(count).padStart(6)}  ${isActive ? 'active' : 'inactive'}`);
  }

  console.log(`\n  Done — ${active} active, ${inactive} inactive category records.${DRY ? ' (dry run, nothing written)' : ''}\n`);
}

main().catch(e => { console.error('  ✗', e.message); process.exit(1); });
