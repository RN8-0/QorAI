/**
 * Qor AI Category & Brand Definitions
 * All unique ?cat= IDs from kategoriler.txt mapped to English names.
 * 105 unique categories + user-defined custom categories (localStorage).
 */

// ────────────────────────────────────────────────────────────────
// Custom Categories — user-managed, persisted in localStorage
// Stored as: [{ id, name, nameDe, geizhalsSlug, custom: true }]
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
  // Accepts a full geizhals URL OR a raw ?cat= slug, returns the slug
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
  add({ name, nameDe, geizhalsInput }) {
    const slug = this.parseSlug(geizhalsInput);
    if (!slug) throw new Error('Geçerli bir geizhals URL veya ?cat= değeri girin.');
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('İngilizce kategori adı zorunlu.');
    const id = this._slugifyId(cleanName) || `custom_${slug}`;
    const entry = {
      id,
      name: cleanName,
      nameDe: String(nameDe || '').trim() || undefined,
      geizhalsSlug: slug,
      custom: true,
    };
    const list = this.getAll().filter(c => c.id !== id && c.geizhalsSlug !== slug);
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
    const base = this.groups.flatMap(g => g.categories);
    const custom = QorAiCustomCategories.getAll();
    if (!custom.length) return base;
    // Dedup by id and geizhalsSlug: custom entries can override built-ins
    const byKey = new Map();
    for (const c of [...base, ...custom]) {
      byKey.set(c.id, c);
    }
    return [...byKey.values()];
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

  const groupForCat = (cat) => {
    const id = String(cat.id || '');
    if (/smartphone|tablet|watch|phone/.test(id)) return 'Mobile';
    if (/notebook|mini_pc|barebone|nuc|thin_client|server|rack19/.test(id)) return 'Computers';
    if (/graphics|cpu|motherboard|ram|pc_case|psu|cool|thermal|radiator|water/.test(id)) return 'Components';
    if (/ssd|hdd|drive|storage|sata|nas/.test(id)) return 'Storage';
    if (/mouse|keyboard|gamepad|joystick|wheel|kvm|pad|stylus/.test(id)) return 'Peripherals';
    if (/network|router|wifi|modem|switch|access_point|firewall|antenna|media_converter/.test(id)) return 'Networking';
    if (/tv|hifi|speaker|headphone|soundbar|audio|subwoofer|amplifier|remote|dj/.test(id)) return 'TV & Audio';
    if (/camera|lens|objective|video|action|film/.test(id)) return 'Photo & Video';
    if (/ps5|xbox|switch2|console|gaming/.test(id)) return 'Gaming';
    if (/ups|pdu|power/.test(id)) return 'Power';
    return 'Other';
  };

  const grouped = {};
  QorAiCategories.getAll().filter(cat => !cat.custom).forEach(cat => {
    const group = groupForCat(cat);
    (grouped[group] = grouped[group] || []).push(cat);
  });

  Object.entries(grouped).forEach(([groupName, cats]) => {
    bulkOpts += `<optgroup label="${escHtml(groupName)}">`;
    cats.forEach(cat => {
      const cnt = counts[cat.id] || 0;
      const label = cnt > 0 ? ` (${cnt})` : '';
      bulkOpts += `<option value="${escHtml(cat.id)}">${escHtml(cat.name)}${label}</option>`;
      flatOpts += `<option value="${escHtml(cat.id)}">${escHtml(cat.name)}${label}</option>`;
    });
    bulkOpts += '</optgroup>';
  });

  const customs = QorAiCustomCategories.getAll();
  if (customs.length) {
    bulkOpts += `<optgroup label="Custom">`;
    customs.forEach(cat => {
      const cnt = counts[cat.id] || 0;
      const label = cnt > 0 ? ` (${cnt})` : '';
      const de = cat.nameDe ? ` · ${escHtml(cat.nameDe)}` : '';
      bulkOpts += `<option value="${escHtml(cat.id)}">${escHtml(cat.name)}${de}${label}</option>`;
      flatOpts += `<option value="${escHtml(cat.id)}">${escHtml(cat.name)}${de}${label}</option>`;
    });
    bulkOpts += '</optgroup>';
  }

  const setSel = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

  setSel('scrapeCategory', bulkOpts);
  setSel('singleUrlCategory', flatOpts);
  setSel('scoreCategory', flatOpts);
  setSel('scoreEngineCategory', flatOpts);
  setSel('dictXlateCategory', bulkOpts);
  setSel('updateCategory', flatOpts);
  setSel('inventoryCategory', flatOpts);
  setSel('qualityScanCategory', flatOpts);
  setSel('categoryFilter', flatOpts);
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
        <span class="text-muted"> · ?cat=${escHtml(c.geizhalsSlug)}</span>
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
      geizhalsInput: urlEl.value,
    });
    nameEl.value = '';
    if (deEl) deEl.value = '';
    urlEl.value = '';
    // Clear count cache so UI refreshes
    window._catCountCache = null;
    await populateScraperCategories();
    renderCustomCategoriesList();
    if (typeof toast === 'function') {
      toast(`Kategori eklendi: ${entry.name} (?cat=${entry.geizhalsSlug})`, 's');
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
    if (allExisting.some(c => c.geizhalsSlug === slug)) { skipped++; continue; }
    try {
      QorAiCustomCategories.add({
        name: slug.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase()),
        geizhalsInput: slug,
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
