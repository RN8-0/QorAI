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
 *   2. Clears products assigned to categories outside the current whitelist
 *      and deletes the stale category records.
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
const { deleteOffersForProductNetwork, refreshProductRollup } = require('./lib/offers');

const DRY = process.argv.includes('--dry');
const OFFER_NETWORKS_TO_CLEAR = ['ebay', 'amazon', 'awin', 'direct'];

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
  external_hdd: 'flash_drives', external_hdds: 'flash_drives',
  psus: 'psu', power_supplies: 'psu',
  cases: 'pc_cases', computer_cases: 'pc_cases',
  coolers: 'cpu_coolers', computer_cooling_systems: 'cpu_coolers',
  nas: 'nas_servers',
  network_cards: 'pcie_nic',
  mobile_phones: 'smartphones',
  cameras: 'camera_lenses',
  digital_cameras: 'camera_lenses',
  camcorders: 'camera_lenses',
  video_cameras: 'camera_lenses',
  film_cameras: 'camera_lenses',
  camera_objectives: 'camera_lenses',
  lenses: 'camera_lenses',
  action_cameras: 'camera_lenses',
  security_cameras: 'camera_lenses',
  portable_speakers: 'speakers',
  multifunction_printers: 'printers', laser_printers: 'printers', label_printers: 'printers',
  vacuums: 'robot_vacuums',
  xbox_one: 'gaming_consoles', xbox_series: 'gaming_consoles',
  ps5_consoles: 'gaming_consoles', switch2_consoles: 'gaming_consoles',
  ps5_games: 'games', switch2_games: 'games',
  xbox_accessories: 'gaming_accessories', ps5_accessories: 'gaming_accessories', switch2_accessories: 'gaming_accessories',
  racing_wheels: 'gamepads', joysticks: 'gamepads',
  tv_remotes: 'tvs', signage_displays: 'tvs',
  camera_lenses: 'camera_lenses', camera_objectives: 'camera_lenses', lenses: 'camera_lenses',
  video_cameras: 'camera_lenses', film_cameras: 'camera_lenses',
  hifi_receivers: 'speakers', surround_systems: 'speakers', subwoofers: 'speakers', compact_hifi: 'speakers',
  multiroom_audio: 'speakers', wireless_audio: 'speakers', amplifiers: 'speakers', preamplifiers: 'speakers',
  power_amplifiers: 'speakers', dj_turntables: 'speakers', dj_controllers: 'speakers', hifi_accessories: 'speakers', hifi_filters: 'speakers',
  thin_clients: 'desktops', servers: 'desktops',
  barebone_pcs: 'mini_pcs', nuc_pcs: 'mini_pcs',
  rack19_barebones: 'desktops', rack19_servers: 'desktops',
  handheld_computers: 'tablets',
  hdd_docks: 'hard_drives', hdd_enclosures: 'external_hdd', sata_cables: 'hard_drives',
  drive_adapters: 'hard_drives', storage_systems: 'hard_drives', storage_accessories: 'hard_drives',
  optical_drives: 'hard_drives', flash_drives: 'flash_drives', memory_cards: 'flash_drives', external_ssd: 'ssd',
  cpu_amd_am4: 'cpus', cpu_intel_1151: 'cpus', cpu_server: 'cpus',
  server_motherboards: 'motherboards', mb_cables: 'motherboards',
  gpu_coolers: 'graphics_cards',
  m2_coolers: 'cpu_coolers', thermal_paste: 'cpu_coolers', ram_coolers: 'cpu_coolers',
  thermal_compounds: 'cpu_coolers', cooling_cables: 'cpu_coolers', cooling_accessories: 'cpu_coolers',
  watercooling_kits: 'cpu_coolers', water_reservoirs: 'cpu_coolers', watercooling_systems: 'cpu_coolers',
  water_pumps: 'cpu_coolers', radiators: 'cpu_coolers', water_fittings: 'cpu_coolers',
  water_tubing: 'cpu_coolers', water_coolant: 'cpu_coolers', watercooling_acc: 'cpu_coolers', watercooling_zubeh: 'cpu_coolers',
  psu_cables: 'psu', server_psu: 'psu',
  pdu: 'ups', power_adapters: 'powerbanks', ups_accessories: 'ups',
  dsl_modems: 'modem_routers', cordless_phones: 'smartphones',
  firewalls: 'network_switches', media_converters: 'network_switches', wifi_antennas: 'wifi_routers', wifi_accessories: 'wifi_routers',
  access_points: 'wifi_repeaters',
  led_bulbs: 'smart_home',
};

const CANONICAL_NAMES = {
  smartphones: 'Smartphones',
  feature_phones: 'Feature Phones',
  smartwatches: 'Smartwatches',
  smart_rings: 'Smart Rings',
  headphones: 'Headphones',
  powerbanks: 'Power Banks',
  chargers: 'Chargers',
  laptops: 'Laptops',
  desktops: 'Desktop PCs',
  tablets: 'Tablets',
  e_readers: 'E-Readers',
  vr_headsets: 'VR Headsets',
  graphics_cards: 'Graphics Cards',
  cpus: 'Processors',
  motherboards: 'Motherboards',
  ram: 'RAM',
  ssd: 'SSDs',
  psu: 'Power Supplies (PSU)',
  pc_cases: 'PC Cases',
  ups: 'UPS',
  flash_drives: 'USB Flash Drives',
  cpu_coolers: 'CPU Coolers',
  laptop_coolers: 'Laptop Coolers',
  case_fans: 'Case Fans',
  keyboards: 'Keyboards',
  mice: 'Mice',
  gamepads: 'Gamepads',
  gaming_consoles: 'Game Consoles',
  webcams: 'Webcams',
  microphones: 'Microphones',
  printers: 'Printers',
  '3d_printers': '3D Printers',
  monitors: 'Monitors',
  tvs: 'TVs',
  projectors: 'Projectors',
  speakers: 'Speakers',
  audio_systems: 'Audio Systems',
  av_receivers: 'AV Receivers',
  media_players: 'Media Players',
  camera_lenses: 'Camera Lenses',
  ip_cameras: 'IP Cameras',
  dashcams: 'Dash Cameras',
  gimbals: 'Gimbals',
  drones: 'Drones',
  routers: 'Routers',
  modem_routers: 'Modems',
  robot_vacuums: 'Robot Vacuums',
  hardware_wallets: 'Hardware Wallets',
};

const CANONICAL_SLUGS = new Set(Object.keys(CANONICAL_NAMES));

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

// Remove a category assignment from products whose category is no longer in
// the catalog whitelist. The products stay in PB; they just stop belonging to
// a scraper/admin category.
async function clearProductsCategory(from) {
  let cleared = 0;
  let offersDeleted = 0;
  for (;;) {
    const r = await req('GET', `/api/collections/products/records?perPage=100&fields=id,offerCount&filter=${enc(filt(from))}`);
    if (r.status !== 200) throw new Error(`product fetch failed: ${JSON.stringify(r.body).slice(0, 160)}`);
    const items = r.body.items || [];
    if (!items.length) break;
    for (const p of items) {
      if (DRY) { cleared++; continue; }
      for (const network of OFFER_NETWORKS_TO_CLEAR) {
        const res = await deleteOffersForProductNetwork(p.id, network, { refresh: false });
        offersDeleted += res.deleted || 0;
      }
      const u = await req('PATCH', `/api/collections/products/records/${p.id}`, { category: '' });
      if (u.status === 200) cleared++;
      else console.log(`   ! clear ${p.id} failed: ${JSON.stringify(u.body).slice(0, 120)}`);
      await refreshProductRollup(p.id);
    }
    if (DRY) break;
  }
  if (DRY) {
    const r = await req('GET', `/api/collections/products/records?perPage=1&fields=id&filter=${enc(filt(from))}`);
    cleared = r.status === 200 ? (r.body.totalItems || 0) : 0;
  }
  return { cleared, offersDeleted };
}

async function main() {
  console.log(`\n  Category repair ${DRY ? '(DRY RUN)' : ''}\n`);

  const catRes = await req('GET', '/api/collections/categories/records?perPage=500&sort=slug');
  if (catRes.status !== 200) throw new Error(`categories list failed: ${JSON.stringify(catRes.body).slice(0, 200)}`);
  const categories = catRes.body.items || [];
  console.log(`  ${categories.length} category records found\n`);

  const bySlug = new Map(categories.map(c => [c.slug, c]));
  const noncanonical = categories.filter(c => {
    if (!c.slug || SKIP_SLUGS.has(c.slug)) return false;
    const target = canon(c.slug);
    return target && CANONICAL_SLUGS.has(target) && target !== c.slug;
  });
  const unsupported = categories.filter(c => {
    if (!c.slug || SKIP_SLUGS.has(c.slug)) return false;
    const target = canon(c.slug);
    return !CANONICAL_SLUGS.has(target);
  });

  // ─── 1+2. Merge non-canonical categories into their canonical slug ──────────
  for (const cat of noncanonical) {
    const target = canon(cat.slug);
    const moved = await retagProducts(cat.slug, target);
    console.log(`  • ${cat.slug} → ${target}: ${moved} product(s) re-tagged`);

    if (moved > 0 && !bySlug.has(target)) {
      // Ensure the canonical category exists before we delete the old one.
      if (!DRY) {
        const create = await req('POST', '/api/collections/categories/records', {
          slug: target, name: CANONICAL_NAMES[target] || target.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase()),
          nameEn: CANONICAL_NAMES[target] || target.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase()),
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

  for (const cat of unsupported) {
    const { cleared, offersDeleted } = await clearProductsCategory(cat.slug);
    const offerText = !DRY && offersDeleted ? `, ${offersDeleted} offer(s) deleted` : '';
    console.log(`  • ${cat.slug}: ${cleared} product category value(s) cleared${offerText}; category record ${DRY ? 'would be deleted' : 'deleted'}`);
    if (!DRY) {
      const del = await req('DELETE', `/api/collections/categories/records/${cat.id}`);
      if (![200, 204].includes(del.status)) {
        console.log(`   ! delete ${cat.slug} failed: ${JSON.stringify(del.body).slice(0, 120)}`);
      }
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
    if (CANONICAL_NAMES[cat.slug]) {
      patch.name = CANONICAL_NAMES[cat.slug];
      patch.nameEn = CANONICAL_NAMES[cat.slug];
    }
    if (!DRY) {
      const u = await req('PATCH', `/api/collections/categories/records/${cat.id}`, patch);
      if (u.status !== 200) console.log(`   ! recount patch ${cat.slug} failed: ${u.status}`);
    }
    console.log(`  · ${cat.slug.padEnd(22)} ${String(count).padStart(6)}  ${isActive ? 'active' : 'inactive'}`);
  }

  console.log(`\n  Done — ${active} active, ${inactive} inactive category records.${DRY ? ' (dry run, nothing written)' : ''}\n`);
}

main().catch(e => { console.error('  ✗', e.message); process.exit(1); });
