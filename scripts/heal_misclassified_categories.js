/**
 * Qor AI — One-shot heal for products mis-tagged by old scraper bugs.
 *
 * Pre-fix history (now resolved in scraper.js + categories.js):
 *
 *   • detectCategoryFromDoc used to override the explicit bulk categoryId
 *     for laptop_coolers (rebucketed as `laptops` because breadcrumb text
 *     contained the word "Laptop").
 *   • CATEGORY_ALIASES pointed the canonical id `camera_lenses` at the
 *     legacy `digital_cameras`, so every lens scrape landed in the wrong
 *     bucket. Same shape for flash_drives → external_hdd.
 *   • speakers + audio_systems shared epeyPath `ses-sistemi`; whichever
 *     ran first ate the whole listing.
 *
 * The verify-pass heal we added inside the admin scraper SHOULD update
 * these in-place on the next scrape, but PB rules can return
 * "Only superusers can perform this action" on update for the auth used
 * by the browser, leaving rows stuck.
 *
 * This script uses the migration admin token (raw PB API, superuser) and
 * patches products purely by sourceUrl pattern. Idempotent — safe to run
 * multiple times.
 *
 *   node scripts/heal_misclassified_categories.js          # apply
 *   node scripts/heal_misclassified_categories.js --dry    # preview only
 */
'use strict';

const { req } = require('../migration/pb');

const DRY = process.argv.includes('--dry');

// Each entry: any product whose sourceUrl matches `urlContains` should have
// the listed `target` category. Order matters — more specific patterns first.
const RULES = [
  // Photo & Video — Camera Lenses (was: digital_cameras)
  { urlContains: '/lens/',                            target: 'camera_lenses' },
  // Components — USB Flash Drives (was: external_hdd / hard_drives)
  { urlContains: '/usb-bellek/',                      target: 'flash_drives' },
  // Cooling — Laptop Coolers (was: laptops via detectCategoryFromDoc)
  { urlContains: '/laptop-sogutucu/',                 target: 'laptop_coolers' },
  // Display & Audio — Speakers (specific sub-path)
  { urlContains: '/ses-sistemi/urun-tipi/hoparlor/',  target: 'speakers' },
];

const enc = v => encodeURIComponent(v);
const escFilter = v => String(v).replace(/"/g, '\\"');

async function fetchPage(filter, page, perPage = 200) {
  const url = `/api/collections/products/records?page=${page}&perPage=${perPage}`
            + `&fields=id,sourceUrl,category&filter=${enc(filter)}`;
  const r = await req('GET', url);
  if (r.status !== 200) {
    throw new Error(`fetch failed (${r.status}): ${JSON.stringify(r.body).slice(0, 200)}`);
  }
  return r.body;
}

async function patchCategory(id, target) {
  const r = await req('PATCH', `/api/collections/products/records/${id}`, { category: target });
  if (r.status !== 200) {
    throw new Error(`patch ${id} failed (${r.status}): ${JSON.stringify(r.body).slice(0, 200)}`);
  }
}

async function runRule(rule) {
  const filter = `sourceUrl ~ "${escFilter(rule.urlContains)}" && category != "${escFilter(rule.target)}"`;
  let page = 1;
  let healed = 0;
  let scanned = 0;
  for (;;) {
    const body = await fetchPage(filter, page);
    const items = body.items || [];
    if (!items.length) break;
    scanned += items.length;
    for (const item of items) {
      if (DRY) {
        healed++;
        continue;
      }
      try {
        await patchCategory(item.id, rule.target);
        healed++;
      } catch (e) {
        console.log(`   ! ${item.id}: ${e.message}`);
      }
    }
    // We always start from page 1 next loop because freshly-patched rows fall
    // out of the filter; the remaining wrong rows get pulled up. This way we
    // don't skip anything when the page shifts under us.
    if (DRY) break;
    if (items.length < (body.perPage || 200)) break;
    page = 1;
  }
  return { scanned, healed };
}

async function main() {
  console.log(`\n  Category heal pass ${DRY ? '(DRY RUN)' : ''}\n`);
  for (const rule of RULES) {
    const { scanned, healed } = await runRule(rule);
    const verb = DRY ? 'would heal' : 'healed';
    console.log(`  • ${rule.urlContains.padEnd(36)} → ${rule.target.padEnd(18)} ${verb} ${healed} row(s)`);
  }
  console.log(`\n  Done.${DRY ? ' (no changes written)' : ''}\n`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
