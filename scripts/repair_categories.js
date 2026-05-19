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
  robot_vacuums: 'vacuums',
  xbox_one: 'gaming_consoles', xbox_series: 'gaming_consoles',
  ps5_consoles: 'gaming_consoles', switch2_consoles: 'gaming_consoles',
  ps5_games: 'games', switch2_games: 'games',
  xbox_accessories: 'gaming_accessories', ps5_accessories: 'gaming_accessories', switch2_accessories: 'gaming_accessories',
  racing_wheels: 'gamepads', joysticks: 'gamepads',
  desktop_keyboards: 'keyboards', numeric_keypads: 'keyboards', keyboard_accessories: 'keyboards',
  mouse_pads: 'mice', trackballs: 'mice',
  monitor_accessories: 'monitors',
  tv_mounts: 'tvs', tv_remotes: 'tvs', signage_displays: 'tvs',
  camera_lenses: 'digital_cameras', camera_objectives: 'digital_cameras', lenses: 'digital_cameras',
  video_cameras: 'digital_cameras', film_cameras: 'digital_cameras',
  hifi_receivers: 'speakers', surround_systems: 'speakers', subwoofers: 'speakers', compact_hifi: 'speakers',
  multiroom_audio: 'speakers', wireless_audio: 'speakers', amplifiers: 'speakers', preamplifiers: 'speakers',
  power_amplifiers: 'speakers', dj_turntables: 'speakers', dj_controllers: 'speakers', hifi_accessories: 'speakers', hifi_filters: 'speakers',
  thin_clients: 'desktops', servers: 'desktops',
  barebone_pcs: 'mini_pcs', nuc_pcs: 'mini_pcs',
  rack19_barebones: 'desktops', rack19_servers: 'desktops',
  laptop_docks: 'laptops', handheld_computers: 'tablets',
  hdd_docks: 'hard_drives', hdd_enclosures: 'external_hdd', sata_cables: 'hard_drives',
  drive_adapters: 'hard_drives', storage_systems: 'hard_drives', storage_accessories: 'hard_drives',
  optical_drives: 'hard_drives', flash_drives: 'external_hdd', memory_cards: 'external_hdd', external_ssd: 'ssd',
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
  coffee_makers: 'small_appliances', dishwashers: 'small_appliances', microwaves: 'small_appliances',
  tumble_dryers: 'small_appliances', washing_machines: 'small_appliances', hobs: 'small_appliances',
  fridge_freezers: 'small_appliances', ovens: 'small_appliances',
  led_bulbs: 'smart_home',
};

const CANONICAL_NAMES = {
  smartphones: 'Smartphones', tablets: 'Tablets', smartwatches: 'Smartwatches', headphones: 'Headphones', powerbanks: 'Power Banks',
  laptops: 'Laptops', desktops: 'Desktop PCs', mini_pcs: 'Mini PCs', monitors: 'Monitors', webcams: 'Webcams',
  graphics_cards: 'Graphics Cards', cpus: 'Processors', motherboards: 'Motherboards', ram: 'RAM', ssd: 'SSDs',
  hard_drives: 'Hard Drives', external_hdd: 'External Hard Drives', pc_cases: 'PC Cases', psu: 'Power Supplies (PSU)',
  cpu_coolers: 'CPU Coolers', case_fans: 'Case Fans',
  keyboards: 'Keyboards', mice: 'Mice', printers: 'Printers', gamepads: 'Gamepads',
  tvs: 'TVs', projectors: 'Projectors', soundbars: 'Soundbars', speakers: 'Speakers',
  modem_routers: 'Modem Routers', wifi_routers: 'WiFi Routers', routers: 'Routers', network_switches: 'Network Switches',
  pcie_nic: 'PCIe Network Cards', wifi_repeaters: 'WiFi Repeaters',
  digital_cameras: 'Digital Cameras', action_cameras: 'Action Cameras', security_cameras: 'Security Cameras', drones: 'Drones',
  gaming_consoles: 'Game Consoles', gaming_accessories: 'Gaming Accessories', games: 'Games',
  vacuums: 'Vacuum Cleaners', ups: 'UPS', small_appliances: 'Small Appliances', smart_home: 'Smart Home',
  e_readers: 'E-Readers', electric_scooters: 'Electric Scooters',
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
