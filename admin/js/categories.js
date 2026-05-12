/**
 * Qor AI Category & Brand Definitions
 * All unique ?cat= IDs from kategoriler.txt mapped to English names.
 * 105 unique categories.
 */

window.QorAiCategories = {
  groups: [
    {
      name: 'Categories',
      categories: [
        { id: 'smartphones',           name: 'Smartphones',                geizhalsSlug: 'umtsover' },
        { id: 'graphics_cards',        name: 'Graphics Cards',             geizhalsSlug: 'gra16_512' },
        { id: 'monitors',              name: 'Monitors',                   geizhalsSlug: 'monlcd19wide' },
        { id: 'ssd',                   name: 'SSDs',                       geizhalsSlug: 'hdssd' },
        { id: 'external_ssd',          name: 'External SSDs',              geizhalsSlug: 'hde7s' },
        { id: 'hard_drives',           name: 'Hard Drives',                geizhalsSlug: 'hdx' },
        { id: 'external_hdd',          name: 'External Hard Drives',       geizhalsSlug: 'gehhd' },
        { id: 'hdd_docks',             name: 'HDD Docks',                  geizhalsSlug: 'hddocks' },
        { id: 'hdd_enclosures',        name: 'HDD Enclosures',             geizhalsSlug: 'gehwrahm' },
        { id: 'sata_cables',           name: 'SATA / SAS Cables',          geizhalsSlug: 'kabelfp' },
        { id: 'drive_adapters',        name: 'Drive Adapters',             geizhalsSlug: 'hdadko' },
        { id: 'storage_systems',       name: 'Storage Systems',            geizhalsSlug: 'hdesys' },
        { id: 'storage_accessories',   name: 'Storage Accessories',        geizhalsSlug: 'hdzub' },
        { id: 'notebooks',             name: 'Notebooks / Laptops',        geizhalsSlug: 'nb' },
        { id: 'cpu_amd_am4',           name: 'AMD AM4 CPUs',               geizhalsSlug: 'cpuamdam4' },
        { id: 'cpu_intel_1151',        name: 'Intel 1151 CPUs',            geizhalsSlug: 'cpu1151' },
        { id: 'cpu_server',            name: 'Server / Workstation CPUs',  geizhalsSlug: 'cpucoproz' },
        { id: 'motherboards',          name: 'Motherboards',               geizhalsSlug: 'mainboards' },
        { id: 'server_motherboards',   name: 'Server Motherboards',        geizhalsSlug: 'mbson' },
        { id: 'mb_cables',             name: 'Motherboard Cables',         geizhalsSlug: 'kabelmb' },
        { id: 'mice',                  name: 'Mice',                       geizhalsSlug: 'mouse' },
        { id: 'mouse_pads',            name: 'Mouse Pads',                 geizhalsSlug: 'egpads' },
        { id: 'trackballs',            name: 'Trackballs',                 geizhalsSlug: 'mousetrack' },
        { id: 'presentation_remotes',  name: 'Presentation Remotes',       geizhalsSlug: 'hweinpres' },
        { id: 'keyboards',             name: 'Keyboards',                  geizhalsSlug: 'kb' },
        { id: 'numeric_keypads',       name: 'Numeric Keypads',            geizhalsSlug: 'hweinnump' },
        { id: 'desktop_keyboards',     name: 'Desktop Keyboards',          geizhalsSlug: 'kbdesk' },
        { id: 'gamepads',              name: 'Gamepads',                   geizhalsSlug: 'eggamepad' },
        { id: 'racing_wheels',         name: 'Racing Wheels',              geizhalsSlug: 'egglenkr' },
        { id: 'joysticks',             name: 'Joysticks',                  geizhalsSlug: 'eggjoystick' },
        { id: 'drawing_tablets',       name: 'Drawing Tablets',            geizhalsSlug: 'pads' },
        { id: 'stylus_pens',           name: 'Stylus Pens',                geizhalsSlug: 'hweinstift' },
        { id: 'kvm_switches',          name: 'KVM Switches',               geizhalsSlug: 'kvmkon' },
        { id: 'switch_cables',         name: 'Switch Cables',              geizhalsSlug: 'kabelsw' },
        { id: 'keyboard_accessories',  name: 'Keyboard Accessories',       geizhalsSlug: 'hwkblumzb' },
        { id: 'soundbars',             name: 'Soundbars',                  geizhalsSlug: 'scnbar' },
        { id: 'gaming_accessories',    name: 'Gaming Accessories',         geizhalsSlug: 'egzub' },
        { id: 'pc_cases',              name: 'PC Cases',                   geizhalsSlug: 'gehatx' },
        { id: 'tablets',               name: 'Tablets',                    geizhalsSlug: 'nbtabl' },
        { id: 'ram',                   name: 'RAM',                        geizhalsSlug: 'ramddr3' },
        { id: 'pcie_nic',              name: 'PCIe Network Cards',         geizhalsSlug: 'nwpcie' },
        { id: 'network_switches',      name: 'Network Switches',           geizhalsSlug: 'switchgi' },
        { id: 'cordless_phones',       name: 'Cordless Phones',            geizhalsSlug: 'phonmdg' },
        { id: 'modem_routers',         name: 'Modem Routers',              geizhalsSlug: 'wlanroutmod' },
        { id: 'wifi_routers',          name: 'WiFi Routers',               geizhalsSlug: 'wlanrout' },
        { id: 'dsl_modems',            name: 'DSL Modems',                 geizhalsSlug: 'rdsl' },
        { id: 'routers',               name: 'Routers',                    geizhalsSlug: 'router' },
        { id: 'access_points',         name: 'Access Points',              geizhalsSlug: 'wlanap' },
        { id: 'wifi_repeaters',        name: 'WiFi Repeaters',             geizhalsSlug: 'wlanrepeat' },
        { id: 'firewalls',             name: 'Network Firewalls',          geizhalsSlug: 'nwfw' },
        { id: 'media_converters',      name: 'Media Converters',           geizhalsSlug: 'hwlanmedcon' },
        { id: 'wifi_antennas',         name: 'WiFi Antennas',              geizhalsSlug: 'wlanant' },
        { id: 'nas_servers',           name: 'NAS / Media Servers',        geizhalsSlug: 'mda' },
        { id: 'wifi_accessories',      name: 'WiFi Accessories',           geizhalsSlug: 'wlanzub' },
        { id: 'cpu_coolers',           name: 'CPU Coolers',                geizhalsSlug: 'cpucooler' },
        { id: 'gpu_coolers',           name: 'GPU Coolers',                geizhalsSlug: 'coolvga' },
        { id: 'm2_coolers',            name: 'M.2 Coolers',                geizhalsSlug: 'coolm2' },
        { id: 'thermal_paste',         name: 'Thermal Paste / Pads',       geizhalsSlug: 'coolchip' },
        { id: 'case_fans',             name: 'Case Fans',                  geizhalsSlug: 'coolfan' },
        { id: 'ram_coolers',           name: 'RAM Coolers',                geizhalsSlug: 'coolram' },
        { id: 'thermal_compounds',     name: 'Thermal Compounds',          geizhalsSlug: 'cooltc' },
        { id: 'cooling_cables',        name: 'Cooling Cables',             geizhalsSlug: 'coolkab' },
        { id: 'cooling_accessories',   name: 'Cooling Accessories',        geizhalsSlug: 'coolacc' },
        { id: 'psu',                   name: 'Power Supplies (PSU)',       geizhalsSlug: 'gehps' },
        { id: 'psu_cables',            name: 'PSU Cables',                 geizhalsSlug: 'gehpskab' },
        { id: 'ups',                   name: 'UPS',                        geizhalsSlug: 'gehups' },
        { id: 'pdu',                   name: 'PDUs',                       geizhalsSlug: 'gehpdu' },
        { id: 'ups_accessories',       name: 'UPS Accessories',            geizhalsSlug: 'gehupzub' },
        { id: 'server_psu',            name: 'Server PSUs',                geizhalsSlug: 'gehsysps' },
        { id: 'mini_pcs',              name: 'Mini PCs',                   geizhalsSlug: 'sysdiv' },
        { id: 'barebone_pcs',          name: 'Barebone PCs',               geizhalsSlug: 'barepc' },
        { id: 'nuc_pcs',               name: 'NUC / Compact PCs',          geizhalsSlug: 'sysnn' },
        { id: 'thin_clients',          name: 'Thin Clients',               geizhalsSlug: 'sysdivtc' },
        { id: 'rack19_barebones',      name: '19" Barebones',             geizhalsSlug: 'bare19' },
        { id: 'rack19_servers',        name: '19" Rack Servers',          geizhalsSlug: 'sys19rack' },
        { id: 'watercooling_kits',     name: 'Water Cooling Kits',         geizhalsSlug: 'coolwsets' },
        { id: 'water_reservoirs',      name: 'Water Reservoirs',           geizhalsSlug: 'coolwausgleich' },
        { id: 'watercooling_systems',  name: 'Water Cooling Systems',      geizhalsSlug: 'coolw' },
        { id: 'water_pumps',           name: 'Water Pumps',                geizhalsSlug: 'coolwpumpen' },
        { id: 'radiators',             name: 'Radiators',                  geizhalsSlug: 'coolwradia' },
        { id: 'water_fittings',        name: 'Water Fittings',             geizhalsSlug: 'coolwaanve' },
        { id: 'water_tubing',          name: 'Water Tubing',               geizhalsSlug: 'coolwaschla' },
        { id: 'water_coolant',         name: 'Water Coolant',              geizhalsSlug: 'hwcoolwclnt' },
        { id: 'watercooling_acc',      name: 'Water Cooling Accessories',  geizhalsSlug: 'coolwaglhzub' },
        { id: 'watercooling_zubeh',    name: 'Water Cooling Misc',         geizhalsSlug: 'coolwzubeh' },
        { id: 'smartwatches',          name: 'Smartwatches',               geizhalsSlug: 'uhrpm' },
        { id: 'ps5_consoles',          name: 'PlayStation 5 Consoles',     geizhalsSlug: 'conps5' },
        { id: 'ps5_games',             name: 'PS5 Games',                  geizhalsSlug: 'ps5g' },
        { id: 'ps5_accessories',       name: 'PS5 Accessories',            geizhalsSlug: 'ps5zub' },
        { id: 'switch2_consoles',      name: 'Nintendo Switch 2',          geizhalsSlug: 'connsw2' },
        { id: 'switch2_accessories',   name: 'Switch 2 Accessories',       geizhalsSlug: 'nsw2zub' },
        { id: 'switch2_games',         name: 'Switch 2 Games',             geizhalsSlug: 'nsw2g' },
        { id: 'xbox_series',           name: 'Xbox Series X/S',            geizhalsSlug: 'conxboxsx' },
        { id: 'xbox_one',              name: 'Xbox One',                   geizhalsSlug: 'conxone' },
        { id: 'xbox_accessories',      name: 'Xbox Accessories',           geizhalsSlug: 'xboxsxzub' },
        { id: 'tvs',                   name: 'TVs',                        geizhalsSlug: 'tvlcd' },
        { id: 'digital_cameras',       name: 'Digital Cameras',            geizhalsSlug: 'dcam' },
        { id: 'camera_lenses',         name: 'Camera Lenses',              geizhalsSlug: 'dcamsp' },
        { id: 'camera_objectives',     name: 'Camera Objectives',          geizhalsSlug: 'acamobjo' },
        { id: 'video_cameras',         name: 'Video Cameras',              geizhalsSlug: 'dvcam' },
        { id: 'action_cameras',        name: 'Action Cameras',             geizhalsSlug: 'dvcamac' },
        { id: 'film_cameras',          name: '35mm Film Cameras',          geizhalsSlug: 'acam35' },
        { id: 'headphones',            name: 'Headphones',                 geizhalsSlug: 'sphd' },
        { id: 'hifi_receivers',        name: 'HiFi Receivers',             geizhalsSlug: 'hifirec' },
        { id: 'surround_systems',      name: 'Surround Systems',           geizhalsSlug: 'hifisur' },
        { id: 'speakers',              name: 'Speakers',                   geizhalsSlug: 'hifibox' },
        { id: 'subwoofers',            name: 'Subwoofers',                 geizhalsSlug: 'hifisubw' },
        { id: 'compact_hifi',          name: 'Compact HiFi',               geizhalsSlug: 'hificom' },
        { id: 'multiroom_audio',       name: 'Multiroom Audio',            geizhalsSlug: 'hifimltlt' },
        { id: 'wireless_audio',        name: 'Wireless Audio',             geizhalsSlug: 'hifiwiar' },
        { id: 'amplifiers',            name: 'Amplifiers',                 geizhalsSlug: 'hifiamp' },
        { id: 'preamplifiers',         name: 'Preamplifiers',              geizhalsSlug: 'hifipre' },
        { id: 'power_amplifiers',      name: 'Power Amplifiers',           geizhalsSlug: 'hifiend' },
        { id: 'dj_turntables',         name: 'DJ Turntables',              geizhalsSlug: 'djtonab' },
        { id: 'dj_controllers',        name: 'DJ Controllers',             geizhalsSlug: 'djptylst' },
        { id: 'hifi_accessories',      name: 'HiFi Accessories',           geizhalsSlug: 'hifizub' },
        { id: 'tv_remotes',            name: 'TV Remotes',                 geizhalsSlug: 'tvfernbed' },
        { id: 'hifi_filters',          name: 'HiFi Filters / Studio',      geizhalsSlug: 'hifiltsst' },
      ]
    },
  ],

  getAll() {
    return this.groups.flatMap(g => g.categories);
  },

  getById(id) {
    return this.getAll().find(c => c.id === id);
  },

  getByGroup(groupName) {
    const g = this.groups.find(g => g.name === groupName);
    return g ? g.categories : [];
  },

  getCatUrl(id) {
    const cat = this.getById(id);
    if (!cat || !cat.geizhalsSlug) return null;
    return `https://geizhals.eu/?cat=${cat.geizhalsSlug}&pagesize=30`;
  }
};

window.QorAiBrands = [
  'Apple', 'Samsung', 'Xiaomi', 'Huawei', 'Oppo', 'Vivo', 'OnePlus', 'Realme', 'Honor',
  'Google', 'Sony', 'LG', 'Nokia', 'Motorola', 'Asus', 'Lenovo', 'HP', 'Dell', 'Acer',
  'MSI', 'Razer', 'Corsair', 'Logitech', 'HyperX', 'SteelSeries', 'JBL', 'Bose',
  'Sennheiser', 'Audio-Technica', 'Beyerdynamic', 'Marshall', 'Anker', 'Baseus',
  'Intel', 'AMD', 'Nvidia', 'Kingston', 'Crucial', 'Western Digital', 'Seagate',
  'Gigabyte', 'ASRock', 'EVGA', 'Cooler Master', 'NZXT', 'be quiet!', 'Thermaltake',
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

// ── PB product count cache ──
window._catCountCache = null;

async function _loadCategoryCounts() {
  const now = Date.now();
  if (window._catCountCache && (now - window._catCountCache.ts) < 60000) {
    return window._catCountCache.data;
  }
  const counts = {};
  try {
    const pb = getPb();
    if (!pb) return counts;
    const total = (await pb.collection('products').getList(1, 1, {})).totalItems;
    const pages = Math.ceil(total / 500);
    for (let page = 1; page <= pages; page++) {
      const res = await pb.collection('products').getList(page, 500, {});
      res.items.forEach(p => {
        const c = p.category;
        if (c) counts[c] = (counts[c] || 0) + 1;
      });
      if (res.items.length < 500) break;
    }
  } catch (e) {
    console.warn('[cat-count]', e.message);
  }
  window._catCountCache = { ts: now, data: counts };
  return counts;
}

async function populateScraperCategories() {
  if (typeof QorAiCategories === 'undefined' || !QorAiCategories.groups) return;

  const counts = await _loadCategoryCounts();

  let bulkOpts = '<option value="">Select Category</option>';
  let flatOpts = '<option value="">All Categories</option>';

  QorAiCategories.groups.forEach(group => {
    bulkOpts += `<optgroup label="${escHtml(group.name)}">`;
    group.categories.forEach(cat => {
      const cnt = counts[cat.id] || 0;
      const label = cnt > 0 ? ` (${cnt})` : '';
      bulkOpts += `<option value="${escHtml(cat.id)}">${escHtml(cat.name)}${label}</option>`;
      flatOpts += `<option value="${escHtml(cat.id)}">${escHtml(cat.name)}${label}</option>`;
    });
    bulkOpts += '</optgroup>';
  });

  const setSel = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

  setSel('scrapeCategory', bulkOpts);
  setSel('singleUrlCategory', flatOpts);
  setSel('scoreCategory', flatOpts);
  setSel('scoreEngineCategory', flatOpts);
  setSel('updateCategory', flatOpts);
  setSel('inventoryCategory', flatOpts);
  setSel('qualityScanCategory', flatOpts);
  setSel('categoryFilter', flatOpts);
}
