/**
 * Qor AI Category & Brand Definitions
 * All unique ?cat= IDs from kategoriler.txt mapped to English names.
 * 105 unique categories + user-defined custom categories (localStorage).
 */

// ────────────────────────────────────────────────────────────────
// Custom Categories — user-managed, persisted in localStorage
// Stored as: [{ id, name, nameDe, LegacySlug, custom: true }]
// ────────────────────────────────────────────────────────────────
const _CUSTOM_CATS_KEY = 'qorai_custom_categories_v1';

window.QorAiCustomCategories = {
  _slugifyId(input) {
    return String(input || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 64);
  },
  // Accepts a full Legacy URL OR a raw ?cat= slug, returns the slug
  parseSlug(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    // Full URL?
    try {
      const u = new URL(raw);
      const cat = u.searchParams.get('cat');
      if (cat) return cat;
    } catch { /* not a URL */ }
    // Already a slug
    if (/^[a-z0-9_-]+$/i.test(raw)) return raw;
    return '';
  },
  getAll() {
    try {
      const raw = localStorage.getItem(_CUSTOM_CATS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  },
  save(list) {
    try {
      localStorage.setItem(_CUSTOM_CATS_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error('[custom-categories] save failed:', e);
      return false;
    }
  },
  add({ name, nameDe, LegacyInput }) {
    const slug = this.parseSlug(LegacyInput);
    if (!slug) throw new Error('Geçerli bir Legacy URL veya ?cat= değeri girin.');
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('İngilizce kategori adı zorunlu.');
    const id = this._slugifyId(cleanName) || `custom_${slug}`;
    const entry = {
      id,
      name: cleanName,
      nameDe: String(nameDe || '').trim() || undefined,
      LegacySlug: slug,
      custom: true,
    };
    const list = this.getAll().filter(c => c.id !== id && c.LegacySlug !== slug);
    list.push(entry);
    this.save(list);
    return entry;
  },
  remove(id) {
    const list = this.getAll().filter(c => c.id !== id);
    this.save(list);
  },
  clear() {
    localStorage.removeItem(_CUSTOM_CATS_KEY);
  },
};

const CATEGORY_ALIASES = Object.freeze({
  laptop: 'laptops',
  laptops: 'laptops',
  notebook: 'laptops',
  notebooks: 'laptops',
  notebooks_laptops: 'laptops',
  notebook_laptop: 'laptops',
  notebooks_laptop: 'laptops',
  all_in_one_pcs: 'desktops',
  all_in_one_pc: 'desktops',
  desktop: 'desktops',
  desktops: 'desktops',
  pc: 'desktops',
  pcs: 'desktops',
  cpu: 'cpus',
  processor: 'cpus',
  processors: 'cpus',
  ssds: 'ssd',
  internal_ssds: 'ssd',
  hdd: 'hard_drives',
  hdds: 'hard_drives',
  external_hdds: 'external_hdd',
  psus: 'psu',
  power_supplies: 'psu',
  cases: 'pc_cases',
  computer_cases: 'pc_cases',
  coolers: 'cpu_coolers',
  computer_cooling_systems: 'cpu_coolers',
  nas: 'nas_servers',
  network_cards: 'pcie_nic',
  mobile_phones: 'smartphones',
  cameras: 'digital_cameras',
  camcorders: 'video_cameras',
  portable_speakers: 'speakers',
  multifunction_printers: 'printers',
  laser_printers: 'printers',
  label_printers: 'printers',
  robot_vacuums: 'vacuums',
  xbox_one: 'gaming_consoles',
  xbox_series: 'gaming_consoles',
  ps5_consoles: 'gaming_consoles',
  switch2_consoles: 'gaming_consoles',
  ps5_games: 'games',
  switch2_games: 'games',
  xbox_accessories: 'gaming_accessories',
  ps5_accessories: 'gaming_accessories',
  switch2_accessories: 'gaming_accessories',
  racing_wheels: 'gamepads',
  joysticks: 'gamepads',
  desktop_keyboards: 'keyboards',
  numeric_keypads: 'keyboards',
  keyboard_accessories: 'keyboards',
  mouse_pads: 'mice',
  trackballs: 'mice',
  monitor_accessories: 'monitors',
  tv_mounts: 'tvs',
  tv_remotes: 'tvs',
  signage_displays: 'tvs',
  camera_lenses: 'digital_cameras',
  camera_objectives: 'digital_cameras',
  lenses: 'digital_cameras',
  video_cameras: 'digital_cameras',
  film_cameras: 'digital_cameras',
  hifi_receivers: 'speakers',
  surround_systems: 'speakers',
  subwoofers: 'speakers',
  compact_hifi: 'speakers',
  multiroom_audio: 'speakers',
  wireless_audio: 'speakers',
  amplifiers: 'speakers',
  preamplifiers: 'speakers',
  power_amplifiers: 'speakers',
  dj_turntables: 'speakers',
  dj_controllers: 'speakers',
  hifi_accessories: 'speakers',
  hifi_filters: 'speakers',
  thin_clients: 'desktops',
  servers: 'desktops',
  barebone_pcs: 'mini_pcs',
  nuc_pcs: 'mini_pcs',
  rack19_barebones: 'desktops',
  rack19_servers: 'desktops',
  laptop_docks: 'laptops',
  handheld_computers: 'tablets',
  hdd_docks: 'hard_drives',
  hdd_enclosures: 'external_hdd',
  sata_cables: 'hard_drives',
  drive_adapters: 'hard_drives',
  storage_systems: 'nas_servers',
  storage_accessories: 'hard_drives',
  optical_drives: 'hard_drives',
  flash_drives: 'external_hdd',
  memory_cards: 'external_hdd',
  external_ssd: 'ssd',
  cpu_amd_am4: 'cpus',
  cpu_intel_1151: 'cpus',
  cpu_server: 'cpus',
  server_motherboards: 'motherboards',
  mb_cables: 'motherboards',
  gpu_coolers: 'graphics_cards',
  m2_coolers: 'cpu_coolers',
  thermal_paste: 'cpu_coolers',
  ram_coolers: 'cpu_coolers',
  thermal_compounds: 'cpu_coolers',
  cooling_cables: 'cpu_coolers',
  cooling_accessories: 'cpu_coolers',
  watercooling_kits: 'cpu_coolers',
  water_reservoirs: 'cpu_coolers',
  watercooling_systems: 'cpu_coolers',
  water_pumps: 'cpu_coolers',
  radiators: 'cpu_coolers',
  water_fittings: 'cpu_coolers',
  water_tubing: 'cpu_coolers',
  water_coolant: 'cpu_coolers',
  watercooling_acc: 'cpu_coolers',
  watercooling_zubeh: 'cpu_coolers',
  psu_cables: 'psu',
  server_psu: 'psu',
  ups_accessories: 'ups',
  pdu: 'ups',
  power_adapters: 'powerbanks',
  dsl_modems: 'modem_routers',
  cordless_phones: 'smartphones',
  firewalls: 'network_switches',
  media_converters: 'network_switches',
  wifi_antennas: 'wifi_routers',
  wifi_accessories: 'wifi_routers',
  access_points: 'wifi_repeaters',
  coffee_makers: 'small_appliances',
  dishwashers: 'small_appliances',
  microwaves: 'small_appliances',
  tumble_dryers: 'small_appliances',
  washing_machines: 'small_appliances',
  hobs: 'small_appliances',
  fridge_freezers: 'small_appliances',
  ovens: 'small_appliances',
  led_bulbs: 'smart_home',
  switch2_consoles: 'gaming_consoles',
  switch2_accessories: 'gaming_accessories',
  switch2_games: 'games',
});

const EPEY_PATHS = Object.freeze({
  smartphones: 'akilli-telefonlar',
  tablets: 'tablet',
  laptops: 'laptop',
  desktops: 'masaustu-bilgisayar',
  mini_pcs: 'masaustu-bilgisayar',
  cpus: 'islemci',
  graphics_cards: 'ekran-karti',
  ram: 'bellek-ram',
  ssd: 'depolama/cihaz-sinifi/ssd',
  external_ssd: 'depolama/tasinabilir-ssd',
  hard_drives: 'depolama/cihaz-sinifi/hdd',
  external_hdd: 'depolama/cihaz-tipi/tasinabilir-disk',
  motherboards: 'anakart',
  psu: 'power-supply-psu',
  pc_cases: 'bilgisayar-kasasi',
  cpu_coolers: 'islemci-sogutucu',
  case_fans: 'kasa-fani',
  monitors: 'monitor',
  tvs: 'televizyon',
  projectors: 'projeksiyon-makinesi',
  headphones: 'kulaklik',
  speakers: 'ses-sistemi/urun-tipi/hoparlor',
  soundbars: 'ses-sistemi/urun-tipi/soundbar',
  smartwatches: 'akilli-saat',
  digital_cameras: 'fotograf-kamera',
  action_cameras: 'aksiyon-kamera',
  security_cameras: 'ip-kamera',
  gaming_consoles: 'oyun-konsolu',
  games: 'oyun',
  gamepads: 'oyun-kolu',
  keyboards: 'klavye-mouse/urun-tipi/klavye',
  mice: 'klavye-mouse/urun-tipi/mouse',
  printers: 'yazici',
  webcams: 'webcam',
  routers: 'router',
  modem_routers: 'modem',
  wifi_routers: 'router',
  network_switches: 'switch',
  pcie_nic: 'kablosuz-adaptor',
  access_points: 'menzil-genisletici',
  wifi_repeaters: 'menzil-genisletici',
  robot_vacuums: 'robot-supurge',
  vacuums: 'robot-supurge',
  powerbanks: 'powerbank',
  ups: 'ups',
  e_readers: 'e-kitap-okuyucu',
  drones: 'drone',
  electric_scooters: 'elektrikli-scooter',
});

const CANONICAL_EPEY_CATEGORY_GROUPS = Object.freeze([
  {
    name: 'Mobile',
    categories: [
      { id: 'smartphones',        name: 'Smartphones',              LegacySlug: 'umtsover' },
      { id: 'tablets',            name: 'Tablets',                  LegacySlug: 'nbtabl' },
      { id: 'smartwatches',       name: 'Smartwatches',             LegacySlug: 'uhrpm' },
      { id: 'headphones',         name: 'Headphones',               LegacySlug: 'sphd' },
      { id: 'powerbanks',         name: 'Power Banks',              LegacySlug: 'akkupw' },
    ],
  },
  {
    name: 'Computers',
    categories: [
      { id: 'laptops',            name: 'Laptops',                  LegacySlug: 'nb' },
      { id: 'desktops',           name: 'Desktop PCs',              LegacySlug: 'sysdiv' },
      { id: 'mini_pcs',           name: 'Mini PCs',                 LegacySlug: 'sysdiv' },
      { id: 'monitors',           name: 'Monitors',                 LegacySlug: 'monlcd19wide' },
      { id: 'webcams',            name: 'Webcams' },
    ],
  },
  {
    name: 'Components',
    categories: [
      { id: 'graphics_cards',     name: 'Graphics Cards',           LegacySlug: 'gra16_512' },
      { id: 'cpus',               name: 'Processors',               LegacySlug: 'cpu' },
      { id: 'motherboards',       name: 'Motherboards',             LegacySlug: 'mainboards' },
      { id: 'ram',                name: 'RAM',                      LegacySlug: 'ramddr3' },
      { id: 'ssd',                name: 'SSDs',                     LegacySlug: 'hdssd' },
      { id: 'hard_drives',        name: 'Hard Drives',              LegacySlug: 'hdx' },
      { id: 'external_hdd',       name: 'External Hard Drives',     LegacySlug: 'gehhd' },
      { id: 'pc_cases',           name: 'PC Cases',                 LegacySlug: 'gehatx' },
      { id: 'psu',                name: 'Power Supplies (PSU)',     LegacySlug: 'gehps' },
      { id: 'cpu_coolers',        name: 'CPU Coolers',              LegacySlug: 'cpucooler' },
      { id: 'case_fans',          name: 'Case Fans',                LegacySlug: 'coolfan' },
    ],
  },
  {
    name: 'Peripherals',
    categories: [
      { id: 'keyboards',          name: 'Keyboards',                LegacySlug: 'kb' },
      { id: 'mice',               name: 'Mice',                     LegacySlug: 'mouse' },
      { id: 'printers',           name: 'Printers',                 LegacySlug: 'pr' },
      { id: 'gamepads',           name: 'Gamepads',                 LegacySlug: 'eggamepad' },
    ],
  },
  {
    name: 'TV & Audio',
    categories: [
      { id: 'tvs',                name: 'TVs',                      LegacySlug: 'tvlcd' },
      { id: 'projectors',         name: 'Projectors' },
      { id: 'soundbars',          name: 'Soundbars',                LegacySlug: 'scnbar' },
      { id: 'speakers',           name: 'Speakers',                 LegacySlug: 'hifibox' },
    ],
  },
  {
    name: 'Networking',
    categories: [
      { id: 'modem_routers',      name: 'Modem Routers',            LegacySlug: 'wlanroutmod' },
      { id: 'wifi_routers',       name: 'WiFi Routers',             LegacySlug: 'wlanrout' },
      { id: 'routers',            name: 'Routers',                  LegacySlug: 'router' },
      { id: 'network_switches',   name: 'Network Switches',         LegacySlug: 'switchgi' },
      { id: 'pcie_nic',           name: 'PCIe Network Cards',       LegacySlug: 'nwpcie' },
      { id: 'wifi_repeaters',     name: 'WiFi Repeaters',           LegacySlug: 'wlanrepeat' },
    ],
  },
  {
    name: 'Photo & Video',
    categories: [
      { id: 'digital_cameras',    name: 'Digital Cameras',          LegacySlug: 'dcam' },
      { id: 'action_cameras',     name: 'Action Cameras',           LegacySlug: 'dvcamac' },
      { id: 'security_cameras',   name: 'Security Cameras' },
      { id: 'drones',             name: 'Drones' },
    ],
  },
  {
    name: 'Gaming',
    categories: [
      { id: 'gaming_consoles',    name: 'Game Consoles',            LegacySlug: 'con' },
      { id: 'gaming_accessories', name: 'Gaming Accessories',       LegacySlug: 'egzub' },
      { id: 'games',              name: 'Games',                    LegacySlug: 'games' },
    ],
  },
  {
    name: 'Smart Home',
    categories: [
      { id: 'vacuums',            name: 'Vacuum Cleaners',          LegacySlug: 'hsauger' },
      { id: 'ups',                name: 'UPS',                      LegacySlug: 'gehups' },
      { id: 'small_appliances',   name: 'Small Appliances' },
      { id: 'smart_home',         name: 'Smart Home' },
      { id: 'e_readers',          name: 'E-Readers' },
      { id: 'electric_scooters',  name: 'Electric Scooters',        LegacySlug: 'escooter' },
    ],
  },
]);

function normalizeCategoryId(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';
  const slug = raw
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return CATEGORY_ALIASES[slug] || slug;
}

window.QorAiCategories = {
  groups: [
    {
      name: 'Categories',
      categories: [
        { id: 'smartphones',           name: 'Smartphones',                LegacySlug: 'umtsover' },
        { id: 'graphics_cards',        name: 'Graphics Cards',             LegacySlug: 'gra16_512' },
        { id: 'monitors',              name: 'Monitors',                   LegacySlug: 'monlcd19wide' },
        { id: 'ssd',                   name: 'SSDs',                       LegacySlug: 'hdssd' },
        { id: 'external_ssd',          name: 'External SSDs',              LegacySlug: 'hde7s' },
        { id: 'hard_drives',           name: 'Hard Drives',                LegacySlug: 'hdx' },
        { id: 'external_hdd',          name: 'External Hard Drives',       LegacySlug: 'gehhd' },
        { id: 'hdd_docks',             name: 'HDD Docks',                  LegacySlug: 'hddocks' },
        { id: 'hdd_enclosures',        name: 'HDD Enclosures',             LegacySlug: 'gehwrahm' },
        { id: 'sata_cables',           name: 'SATA / SAS Cables',          LegacySlug: 'kabelfp' },
        { id: 'drive_adapters',        name: 'Drive Adapters',             LegacySlug: 'hdadko' },
        { id: 'storage_systems',       name: 'Storage Systems',            LegacySlug: 'hdesys' },
        { id: 'storage_accessories',   name: 'Storage Accessories',        LegacySlug: 'hdzub' },
        { id: 'flash_drives',          name: 'USB Flash Drives' },
        { id: 'memory_cards',          name: 'Memory Cards' },
        { id: 'optical_drives',        name: 'Optical Drives' },
        { id: 'laptops',               name: 'Laptops',                    LegacySlug: 'nb' },
        { id: 'desktops',              name: 'Desktop PCs',                LegacySlug: 'sysdiv' },
        { id: 'servers',               name: 'Servers' },
        { id: 'laptop_docks',          name: 'Laptop Docks' },
        { id: 'handheld_computers',    name: 'Handheld Mobile Computers' },
        { id: 'cpus',                  name: 'Processors',                 LegacySlug: 'cpu' },
        { id: 'cpu_amd_am4',           name: 'AMD AM4 CPUs',               LegacySlug: 'cpuamdam4' },
        { id: 'cpu_intel_1151',        name: 'Intel 1151 CPUs',            LegacySlug: 'cpu1151' },
        { id: 'cpu_server',            name: 'Server / Workstation CPUs',  LegacySlug: 'cpucoproz' },
        { id: 'motherboards',          name: 'Motherboards',               LegacySlug: 'mainboards' },
        { id: 'server_motherboards',   name: 'Server Motherboards',        LegacySlug: 'mbson' },
        { id: 'mb_cables',             name: 'Motherboard Cables',         LegacySlug: 'kabelmb' },
        { id: 'mice',                  name: 'Mice',                       LegacySlug: 'mouse' },
        { id: 'mouse_pads',            name: 'Mouse Pads',                 LegacySlug: 'egpads' },
        { id: 'trackballs',            name: 'Trackballs',                 LegacySlug: 'mousetrack' },
        { id: 'presentation_remotes',  name: 'Presentation Remotes',       LegacySlug: 'hweinpres' },
        { id: 'keyboards',             name: 'Keyboards',                  LegacySlug: 'kb' },
        { id: 'numeric_keypads',       name: 'Numeric Keypads',            LegacySlug: 'hweinnump' },
        { id: 'desktop_keyboards',     name: 'Desktop Keyboards',          LegacySlug: 'kbdesk' },
        { id: 'gamepads',              name: 'Gamepads',                   LegacySlug: 'eggamepad' },
        { id: 'racing_wheels',         name: 'Racing Wheels',              LegacySlug: 'egglenkr' },
        { id: 'joysticks',             name: 'Joysticks',                  LegacySlug: 'eggjoystick' },
        { id: 'webcams',               name: 'Webcams' },
        { id: 'drawing_tablets',       name: 'Drawing Tablets',            LegacySlug: 'pads' },
        { id: 'stylus_pens',           name: 'Stylus Pens',                LegacySlug: 'hweinstift' },
        { id: 'kvm_switches',          name: 'KVM Switches',               LegacySlug: 'kvmkon' },
        { id: 'switch_cables',         name: 'Switch Cables',              LegacySlug: 'kabelsw' },
        { id: 'keyboard_accessories',  name: 'Keyboard Accessories',       LegacySlug: 'hwkblumzb' },
        { id: 'soundbars',             name: 'Soundbars',                  LegacySlug: 'scnbar' },
        { id: 'gaming_accessories',    name: 'Gaming Accessories',         LegacySlug: 'egzub' },
        { id: 'gaming_consoles',       name: 'Game Consoles',              LegacySlug: 'con' },
        { id: 'games',                 name: 'Games',                      LegacySlug: 'games' },
        { id: 'pc_cases',              name: 'PC Cases',                   LegacySlug: 'gehatx' },
        { id: 'tablets',               name: 'Tablets',                    LegacySlug: 'nbtabl' },
        { id: 'ram',                   name: 'RAM',                        LegacySlug: 'ramddr3' },
        { id: 'pcie_nic',              name: 'PCIe Network Cards',         LegacySlug: 'nwpcie' },
        { id: 'network_switches',      name: 'Network Switches',           LegacySlug: 'switchgi' },
        { id: 'cordless_phones',       name: 'Cordless Phones',            LegacySlug: 'phonmdg' },
        { id: 'modem_routers',         name: 'Modem Routers',              LegacySlug: 'wlanroutmod' },
        { id: 'wifi_routers',          name: 'WiFi Routers',               LegacySlug: 'wlanrout' },
        { id: 'dsl_modems',            name: 'DSL Modems',                 LegacySlug: 'rdsl' },
        { id: 'routers',               name: 'Routers',                    LegacySlug: 'router' },
        { id: 'access_points',         name: 'Access Points',              LegacySlug: 'wlanap' },
        { id: 'wifi_repeaters',        name: 'WiFi Repeaters',             LegacySlug: 'wlanrepeat' },
        { id: 'firewalls',             name: 'Network Firewalls',          LegacySlug: 'nwfw' },
        { id: 'media_converters',      name: 'Media Converters',           LegacySlug: 'hwlanmedcon' },
        { id: 'wifi_antennas',         name: 'WiFi Antennas',              LegacySlug: 'wlanant' },
        { id: 'nas_servers',           name: 'NAS / Media Servers',        LegacySlug: 'mda' },
        { id: 'wifi_accessories',      name: 'WiFi Accessories',           LegacySlug: 'wlanzub' },
        { id: 'cpu_coolers',           name: 'CPU Coolers',                LegacySlug: 'cpucooler' },
        { id: 'gpu_coolers',           name: 'GPU Coolers',                LegacySlug: 'coolvga' },
        { id: 'm2_coolers',            name: 'M.2 Coolers',                LegacySlug: 'coolm2' },
        { id: 'thermal_paste',         name: 'Thermal Paste / Pads',       LegacySlug: 'coolchip' },
        { id: 'case_fans',             name: 'Case Fans',                  LegacySlug: 'coolfan' },
        { id: 'ram_coolers',           name: 'RAM Coolers',                LegacySlug: 'coolram' },
        { id: 'thermal_compounds',     name: 'Thermal Compounds',          LegacySlug: 'cooltc' },
        { id: 'cooling_cables',        name: 'Cooling Cables',             LegacySlug: 'coolkab' },
        { id: 'cooling_accessories',   name: 'Cooling Accessories',        LegacySlug: 'coolacc' },
        { id: 'psu',                   name: 'Power Supplies (PSU)',       LegacySlug: 'gehps' },
        { id: 'psu_cables',            name: 'PSU Cables',                 LegacySlug: 'gehpskab' },
        { id: 'ups',                   name: 'UPS',                        LegacySlug: 'gehups' },
        { id: 'pdu',                   name: 'PDUs',                       LegacySlug: 'gehpdu' },
        { id: 'ups_accessories',       name: 'UPS Accessories',            LegacySlug: 'gehupzub' },
        { id: 'server_psu',            name: 'Server PSUs',                LegacySlug: 'gehsysps' },
        { id: 'mini_pcs',              name: 'Mini PCs',                   LegacySlug: 'sysdiv' },
        { id: 'barebone_pcs',          name: 'Barebone PCs',               LegacySlug: 'barepc' },
        { id: 'nuc_pcs',               name: 'NUC / Compact PCs',          LegacySlug: 'sysnn' },
        { id: 'thin_clients',          name: 'Thin Clients',               LegacySlug: 'sysdivtc' },
        { id: 'rack19_barebones',      name: '19" Barebones',             LegacySlug: 'bare19' },
        { id: 'rack19_servers',        name: '19" Rack Servers',          LegacySlug: 'sys19rack' },
        { id: 'watercooling_kits',     name: 'Water Cooling Kits',         LegacySlug: 'coolwsets' },
        { id: 'water_reservoirs',      name: 'Water Reservoirs',           LegacySlug: 'coolwausgleich' },
        { id: 'watercooling_systems',  name: 'Water Cooling Systems',      LegacySlug: 'coolw' },
        { id: 'water_pumps',           name: 'Water Pumps',                LegacySlug: 'coolwpumpen' },
        { id: 'radiators',             name: 'Radiators',                  LegacySlug: 'coolwradia' },
        { id: 'water_fittings',        name: 'Water Fittings',             LegacySlug: 'coolwaanve' },
        { id: 'water_tubing',          name: 'Water Tubing',               LegacySlug: 'coolwaschla' },
        { id: 'water_coolant',         name: 'Water Coolant',              LegacySlug: 'hwcoolwclnt' },
        { id: 'watercooling_acc',      name: 'Water Cooling Accessories',  LegacySlug: 'coolwaglhzub' },
        { id: 'watercooling_zubeh',    name: 'Water Cooling Misc',         LegacySlug: 'coolwzubeh' },
        { id: 'smartwatches',          name: 'Smartwatches',               LegacySlug: 'uhrpm' },
        { id: 'ps5_consoles',          name: 'PlayStation 5 Consoles',     LegacySlug: 'conps5' },
        { id: 'ps5_games',             name: 'PS5 Games',                  LegacySlug: 'ps5g' },
        { id: 'ps5_accessories',       name: 'PS5 Accessories',            LegacySlug: 'ps5zub' },
        { id: 'xbox_series',           name: 'Xbox Series X/S',            LegacySlug: 'conxboxsx' },
        { id: 'xbox_one',              name: 'Xbox One',                   LegacySlug: 'conxone' },
        { id: 'xbox_accessories',      name: 'Xbox Accessories',           LegacySlug: 'xboxsxzub' },
        { id: 'tvs',                   name: 'TVs',                        LegacySlug: 'tvlcd' },
        { id: 'signage_displays',      name: 'Signage Displays' },
        { id: 'projectors',            name: 'Projectors' },
        { id: 'digital_cameras',       name: 'Digital Cameras',            LegacySlug: 'dcam' },
        { id: 'camera_lenses',         name: 'Camera Lenses',              LegacySlug: 'dcamsp' },
        { id: 'camera_objectives',     name: 'Camera Objectives',          LegacySlug: 'acamobjo' },
        { id: 'video_cameras',         name: 'Video Cameras',              LegacySlug: 'dvcam' },
        { id: 'action_cameras',        name: 'Action Cameras',             LegacySlug: 'dvcamac' },
        { id: 'security_cameras',      name: 'Security Cameras' },
        { id: 'film_cameras',          name: '35mm Film Cameras',          LegacySlug: 'acam35' },
        { id: 'headphones',            name: 'Headphones',                 LegacySlug: 'sphd' },
        { id: 'hifi_receivers',        name: 'HiFi Receivers',             LegacySlug: 'hifirec' },
        { id: 'surround_systems',      name: 'Surround Systems',           LegacySlug: 'hifisur' },
        { id: 'speakers',              name: 'Speakers',                   LegacySlug: 'hifibox' },
        { id: 'subwoofers',            name: 'Subwoofers',                 LegacySlug: 'hifisubw' },
        { id: 'compact_hifi',          name: 'Compact HiFi',               LegacySlug: 'hificom' },
        { id: 'multiroom_audio',       name: 'Multiroom Audio',            LegacySlug: 'hifimltlt' },
        { id: 'wireless_audio',        name: 'Wireless Audio',             LegacySlug: 'hifiwiar' },
        { id: 'amplifiers',            name: 'Amplifiers',                 LegacySlug: 'hifiamp' },
        { id: 'preamplifiers',         name: 'Preamplifiers',              LegacySlug: 'hifipre' },
        { id: 'power_amplifiers',      name: 'Power Amplifiers',           LegacySlug: 'hifiend' },
        { id: 'dj_turntables',         name: 'DJ Turntables',              LegacySlug: 'djtonab' },
        { id: 'dj_controllers',        name: 'DJ Controllers',             LegacySlug: 'djptylst' },
        { id: 'hifi_accessories',      name: 'HiFi Accessories',           LegacySlug: 'hifizub' },
        { id: 'tv_remotes',            name: 'TV Remotes',                 LegacySlug: 'tvfernbed' },
        { id: 'hifi_filters',          name: 'HiFi Filters / Studio',      LegacySlug: 'hifiltsst' },
        { id: 'printers',              name: 'Printers',                   LegacySlug: 'pr' },
        { id: 'vacuums',               name: 'Vacuum Cleaners',            LegacySlug: 'hsauger' },
        { id: 'powerbanks',            name: 'Power Banks',                LegacySlug: 'akkupw' },
        { id: 'e_readers',             name: 'E-Readers' },
        { id: 'drones',                name: 'Drones' },
        { id: 'power_adapters',        name: 'Power Adapters' },
        { id: 'coffee_makers',         name: 'Coffee Makers' },
        { id: 'dishwashers',           name: 'Dishwashers' },
        { id: 'microwaves',            name: 'Microwaves' },
        { id: 'tumble_dryers',         name: 'Tumble Dryers' },
        { id: 'washing_machines',      name: 'Washing Machines' },
        { id: 'hobs',                  name: 'Hobs' },
        { id: 'fridge_freezers',       name: 'Fridge-Freezers' },
        { id: 'ovens',                 name: 'Ovens' },
        { id: 'led_bulbs',             name: 'LED Bulbs' },
        { id: 'electric_scooters',     name: 'Electric Scooters',          LegacySlug: 'escooter' },
      ]
    },
  ],

  canonicalId(id) {
    return normalizeCategoryId(id);
  },

  getAll() {
    const base = this.groups.flatMap(g => g.categories);
    const custom = QorAiCustomCategories.getAll();
    const attachEpey = (c) => ({ ...c, epeyPath: c.epeyPath || EPEY_PATHS[c.id] || '' });
    if (!custom.length) return base.map(attachEpey);
    // Dedup by id and LegacySlug: custom entries can override built-ins
    const byKey = new Map();
    for (const c of [...base, ...custom]) {
      byKey.set(c.id, attachEpey(c));
    }
    return [...byKey.values()];
  },

  getById(id) {
    const canonical = this.canonicalId(id);
    return this.getAll().find(c => c.id === canonical || c.id === id);
  },

  getByGroup(groupName) {
    const g = this.groups.find(g => g.name === groupName);
    return g ? g.categories : [];
  },

  getCatUrl(id) {
    const cat = this.getById(id);
    if (!cat || !cat.epeyPath) return null;
    return `https://www.epey.com/${cat.epeyPath}/`;
  }
};

// Keep every admin surface on the same Epey-style top-level category list.
// The large legacy/Icecat-specific table above is retained only as alias input;
// UI, product filters, scraper, and dictionary all read this canonical list.
window.QorAiCategories.groups = CANONICAL_EPEY_CATEGORY_GROUPS.map(group => ({
  name: group.name,
  categories: group.categories.map(cat => ({ ...cat })),
}));

window.QorAiBrands = [
  'Apple', 'Samsung', 'Xiaomi', 'Huawei', 'Oppo', 'Vivo', 'OnePlus', 'Realme', 'Honor',
  'Google', 'Sony', 'LG', 'Nokia', 'Motorola', 'Asus', 'Lenovo', 'HP', 'Dell', 'Acer',
  'MSI', 'Razer', 'Corsair', 'Logitech', 'HyperX', 'SteelSeries', 'JBL', 'Bose',
  'Sennheiser', 'Audio-Technica', 'Beyerdynamic', 'Marshall', 'Anker', 'Baseus',
  'Intel', 'AMD', 'Nvidia', 'Kingston', 'Crucial', 'Western Digital', 'Seagate',
  'Gigabyte', 'ASRock', 'EVGA', 'Cooler Master', 'NZXT', 'Thermaltake',
  'BenQ', 'ViewSonic', 'AOC', 'Philips', 'TCL', 'Hisense', 'Vestel',
  'Canon', 'Nikon', 'Fujifilm', 'Panasonic', 'GoPro', 'DJI', 'Insta360',
  'Nintendo', 'Microsoft', 'Valve', 'Meta',
  'TP-Link', 'Netgear', 'Zyxel', 'iRobot', 'Roborock', 'Dreame', 'Ecovacs',
  'Kindle', 'Kobo', 'PocketBook'
];

// ── Helpers ──
function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _titleFromCategoryId(id) {
  return String(id || 'other')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, s => s.toUpperCase());
}

function _categoryIconFor(id) {
  const slug = normalizeCategoryId(id);
  if (/smartphone|phone/.test(slug)) return 'smartphone';
  if (/tablet/.test(slug)) return 'tablet';
  if (/laptop|notebook|desktop|pc|server|thin_client/.test(slug)) return 'computer';
  if (/watch/.test(slug)) return 'watch';
  if (/camera|lens|camcorder/.test(slug)) return 'camera';
  if (/headphone|speaker|audio|soundbar/.test(slug)) return 'headphones';
  if (/keyboard|mouse|pad|stylus/.test(slug)) return 'keyboard';
  if (/ssd|hdd|storage|nas|drive/.test(slug)) return 'hard-drive';
  if (/tv|monitor|display|projector/.test(slug)) return 'monitor';
  if (/router|network|wifi|switch/.test(slug)) return 'wifi';
  if (/cpu|ram|motherboard|graphics|psu|cool/.test(slug)) return 'cpu';
  return 'box';
}

function _categoryEmojiFor(id) {
  const slug = normalizeCategoryId(id);
  if (/smartphone|phone/.test(slug)) return '📱';
  if (/tablet/.test(slug)) return '▣';
  if (/laptop|notebook|desktop|pc|server/.test(slug)) return '💻';
  if (/watch/.test(slug)) return '⌚';
  if (/camera/.test(slug)) return '📷';
  if (/headphone|speaker|audio|soundbar/.test(slug)) return '🎧';
  if (/tv|monitor|display|projector/.test(slug)) return '🖥️';
  if (/cpu|ram|motherboard|graphics/.test(slug)) return '⚙️';
  return '📦';
}

function _categoryOrderFor(id) {
  const all = window.QorAiCategories?.getAll?.() || [];
  const idx = all.findIndex(c => c.id === normalizeCategoryId(id));
  return idx >= 0 ? idx + 1 : 1000;
}

function _safePbFilterValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function syncCategoryRecord(categoryId) {
  const slug = normalizeCategoryId(categoryId);
  if (!slug || typeof getPb !== 'function' || typeof pbSetDoc !== 'function') return null;
  const catDef = window.QorAiCategories?.getById?.(slug);
  const name = catDef?.name || _titleFromCategoryId(slug);
  let productCount = 0;
  try {
    const res = await getPb().collection('products').getList(1, 1, {
      filter: `category="${_safePbFilterValue(slug)}"`,
      $autoCancel: false,
    });
    productCount = Number(res.totalItems || 0);
  } catch (e) {
    console.warn('[category-sync] count failed:', slug, e.message || e);
  }
  const payload = {
    slug,
    name,
    nameEn: name,
    icon: _categoryIconFor(slug),
    emoji: _categoryEmojiFor(slug),
    order: _categoryOrderFor(slug),
    isActive: true,
    productCount,
    subcategories: [],
  };
  try {
    return await pbSetDoc('categories', slug, payload);
  } catch (e) {
    console.warn('[category-sync] upsert failed:', slug, e.message || e);
    return null;
  }
}

async function syncAllProductCategories() {
  if (typeof getPb !== 'function') return {};
  const counts = {};
  try {
    const pb = getPb();
    const total = (await pb.collection('products').getList(1, 1, { $autoCancel: false })).totalItems;
    const pages = Math.ceil(total / 500);
    for (let page = 1; page <= pages; page++) {
      // Only the category field is needed — never pull full records here.
      const res = await pb.collection('products').getList(page, 500, { $autoCancel: false, fields: 'id,category' });
      for (const p of res.items) {
        const slug = normalizeCategoryId(p.category);
        if (!slug) continue;
        counts[slug] = (counts[slug] || 0) + 1;
      }
      if (res.items.length < 500) break;
    }
    for (const slug of Object.keys(counts)) {
      await syncCategoryRecord(slug);
    }
    try {
      const existing = await pb.collection('categories').getFullList({ $autoCancel: false });
      await Promise.all(existing
        .filter(cat => cat.slug && !counts[normalizeCategoryId(cat.slug)])
        .map(cat => pb.collection('categories').update(cat.id, {
          productCount: 0,
          isActive: false,
        }, { $autoCancel: false }))
      );
    } catch (e) {
      console.warn('[category-sync] stale category update failed:', e.message || e);
    }
    window._catCountCache = null;
  } catch (e) {
    console.warn('[category-sync] full sync failed:', e.message || e);
  }
  return counts;
}

// ── PB product count cache ──
window._catCountCache = null;

async function _loadCategoryCounts(sourceFilter = '') {
  const now = Date.now();
  const cacheKey = sourceFilter || '__all__';
  if (
    window._catCountCache &&
    window._catCountCache[cacheKey] &&
    (now - window._catCountCache[cacheKey].ts) < 60000
  ) {
    return window._catCountCache[cacheKey].data;
  }
  const counts = {};
  try {
    const pb = getPb();
    if (!pb) return counts;
    const opts = sourceFilter === '__epey__'
      ? { filter: '(source="epey.com" || source="epey")', fields: 'id,category' }
      : sourceFilter
        ? { filter: `source="${String(sourceFilter).replace(/"/g, '\\"')}"`, fields: 'id,category' }
        : { fields: 'id,category' };
    const total = (await pb.collection('products').getList(1, 1, opts)).totalItems;
    const pages = Math.ceil(total / 500);
    for (let page = 1; page <= pages; page++) {
      const res = await pb.collection('products').getList(page, 500, opts);
      res.items.forEach(p => {
        const c = normalizeCategoryId(p.category);
        if (c) counts[c] = (counts[c] || 0) + 1;
      });
      if (res.items.length < 500) break;
    }
  } catch (e) {
    console.warn('[cat-count]', e.message);
  }
  window._catCountCache = {
    ...(window._catCountCache || {}),
    [cacheKey]: { ts: now, data: counts },
  };
  return counts;
}

function _scraperGroupForCat(cat) {
  const id = String(cat.id || '');
  if (/smartphone|tablet|watch|phone/.test(id)) return 'Mobile';
  if (/laptop|notebook|mini_pc|barebone|nuc|thin_client|server|rack19/.test(id)) return 'Computers';
  if (/graphics|cpu|motherboard|ram|pc_case|psu|cool|thermal|radiator|water/.test(id)) return 'Components';
  if (/ssd|hdd|drive|storage|sata|nas/.test(id)) return 'Storage';
  if (/mouse|keyboard|gamepad|joystick|wheel|kvm|pad|stylus/.test(id)) return 'Peripherals';
  if (/network|router|wifi|modem|switch|access_point|firewall|antenna|media_converter/.test(id)) return 'Networking';
  if (/tv|hifi|speaker|headphone|soundbar|audio|subwoofer|amplifier|remote|dj/.test(id)) return 'TV & Audio';
  if (/camera|lens|objective|video|action|film/.test(id)) return 'Photo & Video';
  if (/ps5|xbox|switch2|console|gaming/.test(id)) return 'Gaming';
  if (/ups|pdu|power/.test(id)) return 'Power';
  return 'Other';
}

function _buildScraperCategoryOptions(counts = {}, epeyCounts = {}, includeSynced = true) {
  let bulkOpts = '<option value="">Select Category</option><option value="__all_epey__">Tüm Epey kategorileri</option>';
  let dictOpts = '<option value="">Kategori seç</option>';
  let flatOpts = '<option value="">All Categories</option>';

  const grouped = {};
  const canonicalGroups = Array.isArray(QorAiCategories.groups) ? QorAiCategories.groups : [];
  canonicalGroups.forEach(group => {
    (group.categories || []).forEach(cat => {
      const full = QorAiCategories.getById?.(cat.id) || cat;
      (grouped[group.name] = grouped[group.name] || []).push(full);
    });
  });

  Object.entries(grouped).forEach(([groupName, cats]) => {
    // Bulk Scrape is Epey-only and category-based — list just the categories
    // that have an Epey path, and skip a group entirely if it has none.
    const epeyCats = cats.filter(c => c.epeyPath);
    if (epeyCats.length) {
      bulkOpts += `<optgroup label="${escHtml(groupName)}">`;
      epeyCats.forEach(cat => {
        const cnt = counts[cat.id] || 0;
        const label = cnt > 0 ? ` (${cnt})` : '';
        bulkOpts += `<option value="${escHtml(cat.id)}">${escHtml(cat.name)}${label}</option>`;
      });
      bulkOpts += '</optgroup>';
    }
    cats.forEach(cat => {
      const cnt = counts[cat.id] || 0;
      const ghCnt = epeyCounts[cat.id] || 0;
      const label = cnt > 0 ? ` (${cnt})` : '';
      flatOpts += `<option value="${escHtml(cat.id)}">${escHtml(cat.name)}${label}</option>`;
      if (ghCnt > 0) {
        dictOpts += `<option value="${escHtml(cat.id)}">${escHtml(cat.name)} (${ghCnt})</option>`;
      }
    });
  });

  const customs = QorAiCustomCategories.getAll();
  if (customs.length) {
    bulkOpts += `<optgroup label="Custom">`;
    customs.forEach(cat => {
      const cnt = counts[cat.id] || 0;
      const ghCnt = epeyCounts[cat.id] || 0;
      const label = cnt > 0 ? ` (${cnt})` : '';
      const de = cat.nameDe ? ` · ${escHtml(cat.nameDe)}` : '';
      bulkOpts += `<option value="${escHtml(cat.id)}">${escHtml(cat.name)}${de}${label}</option>`;
      flatOpts += `<option value="${escHtml(cat.id)}">${escHtml(cat.name)}${de}${label}</option>`;
      if (ghCnt > 0) {
        dictOpts += `<option value="${escHtml(cat.id)}">${escHtml(cat.name)}${de} (${ghCnt})</option>`;
      }
    });
    bulkOpts += '</optgroup>';
  }

  const knownIds = new Set(QorAiCategories.getAll().map(cat => cat.id));
  const syncedIds = includeSynced ? Object.keys(counts).filter(id => id && !knownIds.has(id)).sort() : [];
  if (syncedIds.length) {
    flatOpts += `<optgroup label="Synced">`;
    const dictSynced = [];
    syncedIds.forEach(id => {
      const cnt = counts[id] || 0;
      const ghCnt = epeyCounts[id] || 0;
      const name = _titleFromCategoryId(id);
      flatOpts += `<option value="${escHtml(id)}">${escHtml(name)}${cnt > 0 ? ` (${cnt})` : ''}</option>`;
      if (ghCnt > 0) {
        dictSynced.push(`<option value="${escHtml(id)}">${escHtml(name)} (${ghCnt})</option>`);
      }
    });
    flatOpts += '</optgroup>';
    if (dictSynced.length) {
      dictOpts += `<optgroup label="Synced">${dictSynced.join('')}</optgroup>`;
    }
  }

  return { bulkOpts, dictOpts, flatOpts };
}

function _applyScraperCategoryOptions({ bulkOpts, dictOpts, flatOpts }) {
  const setSel = (id, html) => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = html;
    if (prev && [...el.options].some(opt => opt.value === prev)) el.value = prev;
  };

  setSel('scrapeCategory', bulkOpts);
  setSel('singleUrlCategory', flatOpts);
  setSel('offersCategory', flatOpts);
  setSel('scoreCategory', flatOpts);
  setSel('scoreEngineCategory', flatOpts);
  setSel('dictXlateCategory', dictOpts);
  setSel('updateCategory', flatOpts);
  setSel('inventoryCategory', flatOpts);
  setSel('qualityScanCategory', flatOpts);
}

async function populateScraperCategories() {
  if (typeof QorAiCategories === 'undefined' || !QorAiCategories.groups) return;

  // First paint must be instant. Counts are nice-to-have metadata, not a
  // blocker for opening the scraper tab or selecting a category.
  _applyScraperCategoryOptions(_buildScraperCategoryOptions({}, {}, false));

  let counts = {};
  let epeyCounts = {};
  try {
    [counts, epeyCounts] = await Promise.all([
      _loadCategoryCounts(),
      // The Translate-Category panel only ever translates epey.com products
      // (Icecat already ships multilingual specs), so its dropdown must list
      // the categories that actually hold Epey products.
      _loadCategoryCounts('__epey__'),
    ]);
  } catch (e) {
    console.warn('[categories] count refresh failed:', e.message || e);
  }

  _applyScraperCategoryOptions(_buildScraperCategoryOptions(counts, epeyCounts, true));
}

// ────────────────────────────────────────────────────────────────
//  Custom Category UI (Bulk Scrape panel)
// ────────────────────────────────────────────────────────────────
function renderCustomCategoriesList() {
  const el = document.getElementById('customCategoriesList');
  if (!el) return;
  const customs = QorAiCustomCategories.getAll();
  if (!customs.length) {
    el.innerHTML = '<div class="text-muted" style="padding:8px 0;font-size:12px">Henüz özel kategori eklenmedi.</div>';
    return;
  }
  el.innerHTML = customs.map(c => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--surface-2,#1a1a1a);border-radius:6px;margin-bottom:6px;font-size:12px">
      <span style="flex:1">
        <strong>${escHtml(c.name)}</strong>
        ${c.nameDe ? `<span class="text-muted"> · ${escHtml(c.nameDe)}</span>` : ''}
        <span class="text-muted"> · ?cat=${escHtml(c.LegacySlug)}</span>
      </span>
      <button class="btn btn-sm btn-ghost" onclick="removeCustomCategory('${escHtml(c.id)}')">Sil</button>
    </div>
  `).join('');
}

async function addCustomCategory() {
  const nameEl = document.getElementById('newCatName');
  const deEl = document.getElementById('newCatNameDe');
  const urlEl = document.getElementById('newCatUrl');
  if (!nameEl || !urlEl) return;
  try {
    const entry = QorAiCustomCategories.add({
      name: nameEl.value,
      nameDe: deEl ? deEl.value : '',
      LegacyInput: urlEl.value,
    });
    nameEl.value = '';
    if (deEl) deEl.value = '';
    urlEl.value = '';
    // Clear count cache so UI refreshes
    window._catCountCache = null;
    await populateScraperCategories();
    renderCustomCategoriesList();
    if (typeof toast === 'function') {
      toast(`Kategori eklendi: ${entry.name} (?cat=${entry.LegacySlug})`, 's');
    }
    // Auto-select the newly added category in the bulk scrape select
    const sel = document.getElementById('scrapeCategory');
    if (sel) sel.value = entry.id;
  } catch (e) {
    if (typeof toast === 'function') toast(e.message, 'e');
    else alert(e.message);
  }
}

async function removeCustomCategory(id) {
  if (!confirm('Bu özel kategoriyi silmek istediğinize emin misiniz?')) return;
  QorAiCustomCategories.remove(id);
  window._catCountCache = null;
  await populateScraperCategories();
  renderCustomCategoriesList();
  if (typeof toast === 'function') toast('Kategori silindi', 'i');
}

// Bulk-import categories from kategoriler.txt style URL list (one per line)
async function importCategoriesFromText() {
  const ta = document.getElementById('bulkCatImport');
  if (!ta) return;
  const lines = (ta.value || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) { if (typeof toast === 'function') toast('Liste boş.', 'w'); return; }
  let added = 0, skipped = 0;
  for (const line of lines) {
    const slug = QorAiCustomCategories.parseSlug(line);
    if (!slug) { skipped++; continue; }
    const allExisting = QorAiCategories.getAll();
    if (allExisting.some(c => c.LegacySlug === slug)) { skipped++; continue; }
    try {
      QorAiCustomCategories.add({
        name: slug.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase()),
        LegacyInput: slug,
      });
      added++;
    } catch { skipped++; }
  }
  ta.value = '';
  window._catCountCache = null;
  await populateScraperCategories();
  renderCustomCategoriesList();
  if (typeof toast === 'function') toast(`${added} eklendi, ${skipped} atlandı`, added > 0 ? 's' : 'i');
}

// Expose to window for inline onclick handlers
window.addCustomCategory = addCustomCategory;
window.removeCustomCategory = removeCustomCategory;
window.importCategoriesFromText = importCategoriesFromText;
window.renderCustomCategoriesList = renderCustomCategoriesList;
window.QorAiCategorySync = { syncCategoryRecord, syncAllProductCategories };

window.addEventListener('qorai:product-saved', (event) => {
  const rawCategory = event?.detail?.product?.category || event?.detail?.category || '';
  const category = normalizeCategoryId(rawCategory);
  if (!category) return;
  window._catCountCache = null;
  syncCategoryRecord(category)
    .then(() => populateScraperCategories().catch(() => {}))
    .catch(e => console.warn('[category-sync] product-saved failed:', e.message || e));
});
