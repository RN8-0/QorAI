import { canonicalizeSpecMaps } from './specCanonical';
import { localizedSpecLabel, localizedSpecValue, isDisplayableSpec, isHiddenSpec } from './specDisplay';

const label = (en, tr, de) => [en, tr, de];

const COMPUTING_CATS = [
  'smartphones', 'tablets', 'laptops', 'desktops', 'gaming_consoles', 'consoles',
  'media_players', 'vr_headsets', 'e_readers', 'e-readers',
];
const DISPLAY_CATS = [
  'monitors', 'tvs', 'projectors', 'smartphones', 'tablets', 'laptops',
  'smartwatches', 'e_readers', 'e-readers', 'vr_headsets',
];
const MOBILE_CATS = ['smartphones', 'tablets', 'smartwatches'];
// Categories that carry a discrete/dedicated GPU we can describe (brand + VRAM).
const GPU_CATS = ['laptops', 'desktops', 'graphics_cards'];
// Input peripherals & audio gear share a wired/wireless/Bluetooth connection axis.
const PERIPHERAL_CONN_CATS = ['mice', 'keyboards', 'headphones', 'earbuds', 'speakers'];
const PERIPHERAL_LIGHT_CATS = ['ram', 'mice', 'keyboards'];

export const TOKEN_GROUPS = [
  // Smart vs feature phones live in one `smartphones` category — this toggle
  // splits them back apart (every phone is tagged phone_type:smart|feature).
  { prefix: 'phone_type', label: label('Phone type', 'Telefon tipi', 'Telefontyp'), categories: ['smartphones'] },
  { prefix: 'storage', kind: 'range', unit: 'capacity', label: label('Storage', 'Depolama', 'Speicher'), categories: [...COMPUTING_CATS, 'ssd', 'ssds', 'storage', 'flash_drives'] },
  { prefix: 'ram', kind: 'range', unit: 'capacity', label: label('RAM', 'RAM', 'RAM'), categories: [...COMPUTING_CATS, 'ram'] },
  { prefix: 'ram_speed', kind: 'range', unit: 'mt', label: label('Memory speed', 'Bellek hızı', 'Speichertakt'), categories: ['ram'] },
  { prefix: 'ram_latency', kind: 'range', unit: 'cl', label: label('CL latency', 'CL gecikme', 'CL-Latenz'), categories: ['ram'] },
  { prefix: 'screen_size', kind: 'range', unit: 'inch', label: label('Screen size', 'Ekran boyutu', 'Bildschirmgröße'), categories: DISPLAY_CATS },
  { prefix: 'refresh_rate', kind: 'range', unit: 'hz', label: label('Refresh rate', 'Yenileme hızı', 'Bildrate'), categories: DISPLAY_CATS },
  { prefix: 'screen_tech', label: label('Panel type', 'Panel tipi', 'Panel'), categories: DISPLAY_CATS },
  { prefix: 'resolution', label: label('Resolution', 'Çözünürlük', 'Auflösung'), categories: ['monitors', 'tvs', 'projectors', 'laptops', 'tablets', 'smartphones'] },
  { prefix: 'display_input', label: label('Inputs', 'Girişler', 'Anschlüsse'), categories: ['monitors', 'tvs', 'projectors'] },
  { prefix: 'os', label: label('Operating system', 'İşletim sistemi', 'Betriebssystem'), categories: [...COMPUTING_CATS, 'smartwatches', 'tvs'] },
  { prefix: 'processor_brand', label: label('Processor', 'İşlemci', 'Prozessor'), categories: ['smartphones', 'tablets', 'laptops', 'desktops', 'smartwatches', 'cpus'] },
  { prefix: 'gpu_type', label: label('Graphics', 'Ekran kartı', 'Grafik'), categories: ['laptops', 'desktops'] },
  { prefix: 'gpu_brand', label: label('GPU brand', 'GPU markası', 'GPU-Marke'), categories: GPU_CATS },
  { prefix: 'vram', kind: 'range', unit: 'capacity', label: label('Video memory', 'Ekran kartı belleği', 'Grafikspeicher'), categories: GPU_CATS },
  { prefix: 'vram_type', label: label('Memory type', 'Bellek tipi', 'Speichertyp'), categories: ['graphics_cards'] },
  { prefix: 'ram_type', label: label('Memory type', 'Bellek tipi', 'Speichertyp'), categories: ['ram', 'laptops', 'desktops', 'motherboards'] },
  { prefix: 'ram_module', label: label('Module type', 'Modül tipi', 'Modultyp'), categories: ['ram'] },
  { prefix: 'ram_kit', label: label('Kit', 'Kit', 'Kit'), categories: ['ram'] },
  { prefix: 'ram_platform', label: label('Platform', 'Platform', 'Plattform'), categories: ['ram'] },
  { prefix: 'storage_type', label: label('Storage type', 'Depolama tipi', 'Speicherart'), categories: ['ssd', 'ssds', 'storage', 'laptops', 'desktops'] },
  { prefix: 'socket', label: label('Socket', 'Soket', 'Sockel'), categories: ['cpus', 'motherboards', 'cpu_coolers'] },
  { prefix: 'connectivity', label: label('Connectivity', 'Bağlantı', 'Konnektivität'), categories: [...MOBILE_CATS, 'laptops', 'routers', 'wifi_routers', 'modem_routers'] },
  // Input peripherals & audio.
  { prefix: 'connection', label: label('Connection', 'Bağlantı', 'Anschluss'), categories: PERIPHERAL_CONN_CATS },
  { prefix: 'dpi', kind: 'range', unit: 'dpi', label: label('Sensitivity (DPI)', 'Hassasiyet (DPI)', 'Empfindlichkeit (DPI)'), categories: ['mice'] },
  { prefix: 'key_type', label: label('Key type', 'Tuş tipi', 'Tastentyp'), categories: ['keyboards'] },
  { prefix: 'headphone_type', label: label('Type', 'Kulaklık tipi', 'Bauform'), categories: ['headphones'] },
  // Power.
  { prefix: 'psu_wattage', kind: 'range', unit: 'w', label: label('Wattage', 'Güç', 'Leistung'), categories: ['psu'] },
  { prefix: 'psu_efficiency', label: label('Efficiency', 'Verimlilik', 'Effizienz'), categories: ['psu'] },
  { prefix: 'psu_modular', label: label('Cabling', 'Kablo tipi', 'Kabelmanagement'), categories: ['psu'] },
  { prefix: 'pb_capacity', kind: 'range', unit: 'mah', label: label('Capacity', 'Kapasite', 'Kapazität'), categories: ['powerbanks'] },
];

export const FEATURE_TOKENS = [
  { token: 'five_g:true', label: label('5G', '5G', '5G'), categories: MOBILE_CATS },
  { token: 'nfc:true', label: label('NFC', 'NFC', 'NFC'), categories: MOBILE_CATS },
  { token: 'wireless_charging:true', label: label('Wireless charging', 'Kablosuz şarj', 'Kabelloses Laden'), categories: ['smartphones', 'smartwatches', 'earbuds', 'headphones', 'powerbanks'] },
  { token: 'fast_charging:true', label: label('Fast charging', 'Hızlı şarj', 'Schnellladen'), categories: ['smartphones', 'tablets', 'laptops', 'smartwatches', 'headphones', 'earbuds', 'powerbanks'] },
  { token: 'fingerprint:true', label: label('Fingerprint', 'Parmak izi', 'Fingerabdruck'), categories: ['smartphones', 'tablets', 'laptops'] },
  { token: 'water_resistance:true', label: label('Water resistant', 'Suya dayanıklı', 'Wasserfest'), categories: ['smartphones', 'smartwatches', 'headphones', 'earbuds', 'speakers'] },
  { token: 'anc:true', label: label('Noise cancelling (ANC)', 'Gürültü engelleme (ANC)', 'Geräuschunterdrückung (ANC)'), categories: ['headphones', 'earbuds'] },
  { token: 'ecc:true', label: label('ECC', 'ECC', 'ECC'), categories: ['ram'] },
  { token: 'lighting:true', label: label('Lighting', 'Aydınlatma', 'Beleuchtung'), categories: PERIPHERAL_LIGHT_CATS },
  { token: 'rgb:true', label: label('RGB', 'RGB', 'RGB'), categories: PERIPHERAL_LIGHT_CATS },
  { token: 'xmp:true', label: label('Intel XMP', 'Intel XMP', 'Intel XMP'), categories: ['ram'] },
  { token: 'expo:true', label: label('AMD EXPO', 'AMD EXPO', 'AMD EXPO'), categories: ['ram'] },
];

const TOKEN_VALUE_LABEL = {
  smart: label('Smartphone', 'Akıllı telefon', 'Smartphone'),
  feature: label('Feature phone', 'Tuşlu telefon', 'Feature Phone'),
  amoled: 'AMOLED', super_amoled: 'Super AMOLED', dynamic_amoled: 'Dynamic AMOLED', oled: 'OLED', qd_oled: 'QD-OLED', qled: 'QLED', mini_led: 'Mini LED', micro_led: 'Micro LED', ltpo: 'LTPO', ips: 'IPS', lcd: 'LCD', va: 'VA', tn: 'TN', retina: 'Retina', eink: 'E-Ink',
  google: 'Google Tensor', kirin: 'Kirin', unisoc: 'UNISOC',
  fhd: 'Full HD', qhd: 'QHD', wqhd: 'WQHD', uwqhd: 'UWQHD', '4k': '4K', '5k': '5K', '8k': '8K', hd: 'HD',
  hdmi: 'HDMI', displayport: 'DisplayPort', usb_c: 'USB-C', thunderbolt: 'Thunderbolt', dvi: 'DVI', vga: 'VGA',
  windows: 'Windows', macos: 'macOS', ios: 'iOS', ipados: 'iPadOS', android: 'Android', chromeos: 'ChromeOS', linux: 'Linux',
  intel: 'Intel', amd: 'AMD', apple: 'Apple', qualcomm: 'Qualcomm', mediatek: 'MediaTek', exynos: 'Exynos',
  nvidia: 'NVIDIA',
  dedicated: label('Dedicated', 'Harici', 'Dediziert'), integrated: label('Integrated', 'Dahili', 'Integriert'),
  gddr7: 'GDDR7', gddr6x: 'GDDR6X', gddr6: 'GDDR6', gddr5x: 'GDDR5X', gddr5: 'GDDR5', gddr4: 'GDDR4', hbm2: 'HBM2', hbm: 'HBM',
  wireless: label('Wireless', 'Kablosuz', 'Kabellos'), wired: label('Wired', 'Kablolu', 'Kabelgebunden'), bluetooth: 'Bluetooth',
  mechanical: label('Mechanical', 'Mekanik', 'Mechanisch'), membrane: label('Membrane', 'Membran', 'Membran'), optical_switch: label('Optical/Hall', 'Optik/Manyetik', 'Optisch/Hall'),
  over_ear: label('Over-ear', 'Kulak çevreleyen', 'Over-Ear'), on_ear: label('On-ear', 'Kulak üstü', 'On-Ear'), in_ear: label('In-ear', 'Kulak içi', 'In-Ear'),
  '80plus': '80+', bronze: '80+ Bronze', silver: '80+ Silver', gold: '80+ Gold', platinum: '80+ Platinum', titanium: '80+ Titanium',
  full_modular: label('Full modular', 'Tam modüler', 'Voll modular'), semi_modular: label('Semi-modular', 'Yarı modüler', 'Teilmodular'), non_modular: label('Non-modular', 'Modüler değil', 'Nicht modular'),
  ddr3: 'DDR3', ddr4: 'DDR4', ddr5: 'DDR5', lpddr4x: 'LPDDR4X', lpddr5: 'LPDDR5', lpddr5x: 'LPDDR5X',
  dimm: 'DIMM', sodimm: 'SO-DIMM', udimm: 'UDIMM', rdimm: 'RDIMM', lrdimm: 'LRDIMM',
  desktop: label('Desktop', 'Masaüstü', 'Desktop'), laptop: label('Laptop', 'Dizüstü', 'Laptop'), server: label('Server', 'Sunucu', 'Server'),
  '1_modules': label('Single module', 'Tek modül', '1 Modul'), '2_modules': label('2 modules', '2 modül', '2 Module'),
  '3_modules': label('3 modules', '3 modül', '3 Module'), '4_modules': label('4 modules', '4 modül', '4 Module'),
  '8_modules': label('8 modules', '8 modül', '8 Module'),
  ssd: 'SSD', hdd: 'HDD', nvme: 'NVMe', sata: 'SATA', emmc: 'eMMC', ufs: 'UFS',
  'wi-fi': 'Wi-Fi', '5g': '5G', '4g': '4G',
};

export function lbl(arr, lang) {
  return lang === 'tr' ? arr[1] : lang === 'de' ? arr[2] : arr[0];
}

function catKey(category) {
  return String(category || '').toLowerCase();
}

function inCatList(category, list) {
  const key = catKey(category);
  return !list || list.includes(key);
}

export function categoryAllowsPrefix(category, prefix) {
  const def = TOKEN_GROUPS.find((g) => g.prefix === prefix);
  return Boolean(def && inCatList(category, def.categories));
}

export function filterGroupsForCategory(category) {
  return TOKEN_GROUPS.filter((g) => inCatList(category, g.categories));
}

export function featureFiltersForCategory(category) {
  return FEATURE_TOKENS.filter((f) => inCatList(category, f.categories));
}

export function tokenValue(token, prefix) {
  const raw = String(token || '');
  const wanted = `${prefix}:`;
  return raw.startsWith(wanted) ? raw.slice(wanted.length) : raw;
}

export function capacityGbFromTokenValue(value) {
  const match = String(value || '').toLowerCase().match(/^(\d+(?:\.\d+)?)_(gb|tb)$/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return match[2] === 'tb' ? n * 1024 : n;
}

export function rangeNumberFromTokenValue(value, unit = 'capacity') {
  const raw = String(value || '').toLowerCase();
  if (unit === 'capacity') return capacityGbFromTokenValue(raw);
  if (unit === 'cl') {
    const cl = raw.match(/^(\d+(?:\.\d+)?)_cl$/);
    if (!cl) return null;
    const n = Number(cl[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (unit === 'inch') {
    const inch = raw.match(/^(\d+(?:\.\d+)?)_in$/);
    if (!inch) return null;
    const n = Number(inch[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (unit === 'w' || unit === 'mah' || unit === 'dpi') {
    const m = raw.match(new RegExp(`^(\\d+(?:\\.\\d+)?)_${unit}$`));
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const match = raw.match(/^(\d+(?:\.\d+)?)_(hz|mhz|mt|cl)$/);
  if (!match) return null;
  if (unit === 'hz' && match[2] !== 'hz') return null;
  if (unit === 'mt' && !['mt', 'mhz'].includes(match[2])) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function formatCapacityGb(gb) {
  const n = Number(gb);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1024 && n % 1024 === 0) return `${n / 1024} TB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1).replace(/\.0$/, '')} TB`;
  return `${Math.round(n)} GB`;
}

export function formatRangeValue(value, unit = 'capacity') {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (unit === 'capacity') return formatCapacityGb(n);
  if (unit === 'hz') return `${Math.round(n)} Hz`;
  if (unit === 'mt') return `${Math.round(n)} MT/s`;
  if (unit === 'cl') return `CL ${Math.round(n)}`;
  if (unit === 'inch') return `${n % 1 === 0 ? n : n.toFixed(1)}"`;
  if (unit === 'w') return `${Math.round(n)} W`;
  if (unit === 'mah') return `${Math.round(n)} mAh`;
  if (unit === 'dpi') return `${Math.round(n)} DPI`;
  return String(Math.round(n));
}

export function rangeInputSuffix(unit = 'capacity') {
  if (unit === 'hz') return 'Hz';
  if (unit === 'mt') return 'MT/s';
  if (unit === 'cl') return 'CL';
  if (unit === 'inch') return '"';
  if (unit === 'w') return 'W';
  if (unit === 'mah') return 'mAh';
  if (unit === 'dpi') return 'DPI';
  return 'GB';
}

export function rangeMetaForTokens(tokens, prefix, unit = 'capacity') {
  const values = (tokens || [])
    .map((tk) => ({ token: tk, value: rangeNumberFromTokenValue(tokenValue(tk, prefix), unit) }))
    .filter((x) => x.value != null)
    .sort((a, b) => a.value - b.value);
  const deduped = [];
  values.forEach((item) => {
    if (!deduped.some((x) => x.value === item.value)) deduped.push(item);
  });
  if (deduped.length < 2) return null;
  return {
    values: deduped.map((x) => x.value),
    min: deduped[0].value,
    max: deduped[deduped.length - 1].value,
  };
}

export function rangeTokens(tokens, prefix, range, unit = 'capacity') {
  const meta = rangeMetaForTokens(tokens, prefix, unit);
  if (!meta || !range) return [];
  const min = Math.max(meta.min, Math.min(Number(range.min) || meta.min, Number(range.max) || meta.max));
  const max = Math.min(meta.max, Math.max(Number(range.min) || meta.min, Number(range.max) || meta.max));
  if (min <= meta.min && max >= meta.max) return [];
  const selected = (tokens || []).filter((tk) => {
    const value = rangeNumberFromTokenValue(tokenValue(tk, prefix), unit);
    return value != null && value >= min && value <= max;
  });
  return selected.length ? selected : [`${prefix}:__none__`];
}

export function prettyTokenValue(value, lang) {
  const key = String(value || '').toLowerCase();
  const capacity = capacityGbFromTokenValue(key);
  if (capacity != null) return formatCapacityGb(capacity);
  const frequency = key.match(/^(\d+(?:\.\d+)?)_(hz|mhz|mt)$/);
  if (frequency) return `${Math.round(Number(frequency[1]))} ${frequency[2] === 'hz' ? 'Hz' : 'MT/s'}`;
  if (/^\d+(?:\.\d+)?_cl$/.test(key)) return formatRangeValue(parseFloat(key), 'cl');
  if (/^\d+(?:\.\d+)?_in$/.test(key)) return formatRangeValue(parseFloat(key), 'inch');
  if (/^\d+(?:\.\d+)?_w$/.test(key)) return formatRangeValue(parseFloat(key), 'w');
  if (/^\d+(?:\.\d+)?_mah$/.test(key)) return formatRangeValue(parseFloat(key), 'mah');
  if (/^\d+(?:\.\d+)?_dpi$/.test(key)) return formatRangeValue(parseFloat(key), 'dpi');
  const mapped = TOKEN_VALUE_LABEL[key];
  if (mapped) return Array.isArray(mapped) ? lbl(mapped, lang) : mapped;
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\bgb\b/i, 'GB').replace(/\btb\b/i, 'TB').replace(/\bmah\b/i, 'mAh')
    .replace(/\binch\b/i, '"').replace(/\bhz\b/i, 'Hz')
    .trim();
}

// ── Card key specs ─────────────────────────────────────────────────────────
// Every card (home/list/compare rails) has ONLY the lean Typesense payload:
// filterTokens + screenSizeValue + batteryCapacityValue (no heavy _raw specs).
// These are structured, unit-tagged and category-correct, so they are the right
// source for the fixed 4 headline specs the app shows on its cards. Per category
// we define a PRIORITY ORDER of slots; a slot is either a native field
// ('screen'/'battery') or a filterToken prefix. First up-to-4 present win, then
// boolean feature flags (5G, ANC, fast charge…) fill any remaining slots so
// token-thin categories still read like real spec cards — never the old
// "Güncel/Kategori" filler.
const CARD_NATIVE_LABEL = {
  screen: label('Screen', 'Ekran', 'Bildschirm'),
  battery: label('Battery', 'Batarya', 'Akku'),
};

// Concept per card slot — used to dedupe against the rich-spec fallback so a
// phone never shows "12 GB RAM" (token) and then "RAM: 12 GB" (rich) twice.
const SLOT_CONCEPT = {
  screen: 'screen', battery: 'battery', ram: 'ram', storage: 'storage',
  screen_tech: 'panel', refresh_rate: 'refresh', resolution: 'resolution',
  os: 'os', gpu_brand: 'gpu', gpu_type: 'gpu', vram: 'gpu', vram_type: 'gpu',
  processor_brand: 'cpu', socket: 'socket', ram_type: 'ram_type',
  ram_speed: 'ram_speed', ram_latency: 'ram_latency', storage_type: 'storage_type',
  connectivity: 'connectivity', connection: 'connectivity', dpi: 'dpi',
  key_type: 'key_type', headphone_type: 'form', pb_capacity: 'capacity',
  psu_wattage: 'wattage', psu_efficiency: 'efficiency', psu_modular: 'modular',
  screen_size: 'screen',
};

// Concept for a (canonical, English) rich-spec key so we can align it with the
// token concepts above. Keeps the fallback from re-adding a spec a token chip
// already covered.
function conceptForKey(key) {
  const k = String(key || '').toLowerCase();
  if (k.includes('screen size') || k.includes('display size') || k.includes('ekran boyut')) return 'screen';
  if (k === 'ram' || k.includes('memory ram') || k.includes('arbeitsspeicher')) return 'ram';
  if (k.includes('storage') || k.includes('depolama') || k === 'rom') return 'storage';
  if (k.includes('battery') || k.includes('pil') || k.includes('akku')) return 'battery';
  if (k.includes('resolution') || k.includes('cozunur') || k.includes('çözünür')) return 'resolution';
  if (k.includes('panel')) return 'panel';
  if (k.includes('refresh') || k.includes('yenileme')) return 'refresh';
  if (k.includes('operating') || k === 'os' || k.includes('isletim')) return 'os';
  if (k.includes('gpu') || k.includes('graphics') || k.includes('vram') || k.includes('grafik')) return 'gpu';
  if (k.includes('processor') || k.includes('cpu') || k.includes('chipset') || k.includes('islemci')) return 'cpu';
  if (k.includes('camera') || k.includes('kamera')) return 'camera';
  if (k.includes('weight') || k.includes('agirlik')) return 'weight';
  return k.replace(/[^a-z0-9]+/g, '_');
}

// App-parity category → priority spec-key aliases (port of the mobile app's
// core/category_key_specs.dart). Matched against the product's canonical rich
// specs to fill card slots for categories whose filterTokens are thin (routers,
// printers, cameras, coolers…). First alias that hits a pool key wins.
const CARD_RICH_ALIASES = {
  smartphones: [['Screen size', 'Display size'], ['RAM'], ['Storage', 'Internal storage'], ['Battery', 'Battery capacity'], ['Main camera', 'Camera'], ['Processor', 'Chipset', 'CPU']],
  tablets: [['Screen size', 'Display size'], ['RAM'], ['Storage', 'Internal storage'], ['Battery', 'Battery capacity'], ['Processor', 'Chipset'], ['Operating system', 'OS']],
  laptops: [['Screen size', 'Display size'], ['RAM', 'Internal memory'], ['Storage', 'SSD'], ['Processor', 'CPU'], ['GPU', 'Graphics'], ['Battery']],
  desktops: [['Processor', 'CPU'], ['RAM'], ['Storage', 'SSD'], ['GPU', 'Graphics'], ['Operating system'], ['Power supply', 'PSU']],
  cpus: [['CPU cores', 'Cores', 'Core count'], ['Thread count', 'Threads'], ['CPU frequency', 'Base clock', 'Base frequency'], ['Boost clock', 'Turbo'], ['TDP', 'Power'], ['Cache', 'L3 cache']],
  gpus: [['VRAM', 'Video memory'], ['GPU', 'Architecture', 'GPU chip'], ['TDP', 'Power'], ['Core clock', 'Base clock'], ['Boost clock'], ['Memory bandwidth']],
  graphics_cards: [['VRAM', 'Video memory'], ['GPU', 'Architecture'], ['TDP', 'Power'], ['Core clock', 'Base clock'], ['Boost clock'], ['Memory bandwidth']],
  ram: [['Capacity', 'RAM'], ['Type', 'DDR'], ['Speed', 'Clock', 'Memory speed'], ['Latency', 'CAS', 'CL'], ['Voltage'], ['Form factor']],
  ssd: [['Capacity', 'Storage'], ['Interface', 'Connection'], ['Read speed', 'Sequential read'], ['Write speed', 'Sequential write'], ['Form factor'], ['NAND type', 'Flash type']],
  ssds: [['Capacity', 'Storage'], ['Interface'], ['Read speed'], ['Write speed'], ['Form factor'], ['NAND type']],
  motherboards: [['Socket', 'CPU socket'], ['Chipset'], ['Form factor'], ['RAM slots', 'Memory slots', 'DIMM'], ['Max RAM', 'Maximum memory'], ['M.2 slots', 'M.2', 'NVMe']],
  psu: [['Wattage', 'Power'], ['Efficiency', '80 plus', 'Certification'], ['Modularity', 'Cabling'], ['Fan size', 'Fan'], ['Connectors', 'Cables'], ['Warranty']],
  cpu_coolers: [['Type', 'Cooling type'], ['Fan size', 'Fan'], ['TDP rating', 'TDP'], ['Noise level', 'dBA'], ['Socket', 'Socket compatibility'], ['RPM', 'Fan speed']],
  coolers: [['Type', 'Cooling type'], ['Fan size', 'Fan'], ['TDP rating', 'TDP'], ['Noise level'], ['Socket'], ['RPM']],
  case_fans: [['Fan size', 'Size'], ['RPM', 'Fan speed'], ['Airflow', 'CFM'], ['Noise level', 'dBA'], ['Connector', 'Pin'], ['RGB', 'Lighting']],
  tvs: [['Screen size', 'Display size'], ['Resolution'], ['Panel type', 'Panel'], ['Refresh rate'], ['HDR'], ['Operating system', 'Smart TV']],
  monitors: [['Screen size', 'Display size'], ['Resolution'], ['Panel type', 'Panel'], ['Refresh rate'], ['Response time'], ['HDR']],
  projectors: [['Resolution', 'Native resolution'], ['Brightness', 'Lumen', 'ANSI lumen'], ['Technology', 'DLP', 'LCD'], ['Contrast ratio', 'Contrast'], ['Throw distance'], ['Lamp life']],
  headphones: [['Type', 'Form'], ['Driver', 'Driver size'], ['Noise cancelling', 'ANC'], ['Battery', 'Battery life'], ['Connectivity', 'Connection'], ['Weight']],
  earbuds: [['Type', 'Form'], ['Driver'], ['Noise cancelling', 'ANC'], ['Battery', 'Battery life'], ['Connectivity'], ['Water resistance']],
  speakers: [['Power', 'Wattage', 'RMS'], ['Driver size', 'Driver'], ['Connectivity', 'Bluetooth'], ['Battery', 'Battery life'], ['Water resistance', 'IP rating'], ['Weight']],
  soundbars: [['Channels', 'Channel'], ['Power', 'Wattage', 'RMS'], ['Subwoofer', 'Bass'], ['Connectivity', 'HDMI'], ['Dolby atmos', 'Atmos'], ['Dimensions']],
  av_receivers: [['Channels', 'Channel'], ['Power', 'Wattage'], ['HDMI', 'Inputs'], ['Dolby atmos', 'Atmos'], ['Connectivity', 'Bluetooth'], ['Zones']],
  audio_systems: [['Power', 'Wattage', 'RMS'], ['Channels'], ['Connectivity', 'Bluetooth'], ['Driver'], ['Inputs'], ['Weight']],
  smartwatches: [['Screen size', 'Display size'], ['Battery', 'Battery life'], ['Operating system', 'OS'], ['Heart rate'], ['GPS'], ['Water resistance']],
  cameras: [['Sensor size', 'Sensor'], ['Megapixels', 'Resolution'], ['Video resolution', 'Video'], ['ISO'], ['Autofocus', 'AF'], ['Weight']],
  camera_lenses: [['Focal length'], ['Aperture', 'Max aperture'], ['Mount', 'Lens mount'], ['Stabilization', 'OIS'], ['Filter size'], ['Weight']],
  action_cameras: [['Video resolution', 'Max video'], ['Stabilization', 'EIS'], ['Waterproof', 'Water resistance'], ['Battery', 'Battery life'], ['Display', 'Screen'], ['Weight']],
  security_cameras: [['Resolution', 'Video resolution'], ['Night vision', 'IR'], ['Field of view', 'FOV'], ['Connectivity', 'WiFi'], ['Storage', 'SD card'], ['Weatherproof', 'IP rating']],
  ip_cameras: [['Resolution', 'Video resolution'], ['Night vision', 'IR'], ['Field of view', 'FOV'], ['Connectivity', 'WiFi'], ['Storage', 'SD card'], ['Weatherproof', 'IP rating']],
  dashcams: [['Resolution', 'Video resolution'], ['Field of view', 'FOV'], ['Night vision'], ['Storage', 'SD card'], ['GPS'], ['Display', 'Screen']],
  drones: [['Camera', 'Camera resolution'], ['Flight time', 'Battery life'], ['Range', 'Max range'], ['Video resolution', 'Max video'], ['GPS'], ['Weight']],
  gimbals: [['Payload', 'Max load'], ['Battery', 'Battery life'], ['Axes', 'Axis'], ['Connectivity', 'Bluetooth'], ['Weight'], ['Follow modes']],
  printers: [['Print technology', 'Type'], ['Max resolution', 'Resolution'], ['Print speed', 'Speed'], ['Connectivity'], ['Color print', 'Color'], ['Duplex']],
  '3d_printers': [['Build volume', 'Print volume'], ['Technology', 'Type'], ['Layer resolution', 'Resolution'], ['Print speed', 'Speed'], ['Connectivity'], ['Filament', 'Material']],
  webcams: [['Resolution', 'Video resolution'], ['Frame rate', 'FPS'], ['Autofocus', 'AF'], ['Microphone'], ['Field of view', 'FOV'], ['Connectivity', 'USB']],
  routers: [['WiFi standard', 'Wi-Fi'], ['Speed', 'Max speed'], ['Frequency', 'Band'], ['Ports', 'LAN ports'], ['Coverage', 'Range'], ['Antennas', 'Antenna']],
  wifi_routers: [['WiFi standard', 'Wi-Fi'], ['Speed', 'Max speed'], ['Frequency', 'Band'], ['Ports', 'LAN ports'], ['Coverage', 'Range'], ['Antennas']],
  modem_routers: [['WiFi standard', 'Wi-Fi'], ['Speed', 'Max speed'], ['Modem', 'DSL'], ['Ports', 'LAN ports'], ['Frequency', 'Band'], ['Coverage']],
  robot_vacuums: [['Suction power', 'Suction', 'Pa'], ['Battery', 'Battery life', 'Runtime'], ['Navigation', 'LiDAR'], ['Dustbin capacity', 'Dustbin'], ['Mopping', 'Mop'], ['Noise level']],
  powerbanks: [['Capacity', 'mAh'], ['Output power', 'Output'], ['Input power', 'Input'], ['Ports', 'USB'], ['Wireless', 'Wireless charging'], ['Fast charge', 'PD']],
  chargers: [['Output power', 'Output', 'Wattage'], ['Ports', 'USB'], ['Fast charge', 'PD'], ['Technology', 'GaN'], ['Input'], ['Weight']],
  e_readers: [['Screen size', 'Display size'], ['Resolution', 'PPI'], ['Storage', 'Internal storage'], ['Battery', 'Battery life'], ['Backlight', 'Front light'], ['Waterproof', 'IPX']],
  'e-readers': [['Screen size', 'Display size'], ['Resolution', 'PPI'], ['Storage'], ['Battery', 'Battery life'], ['Backlight'], ['Waterproof']],
  keyboards: [['Switch type', 'Switch'], ['Layout', 'Size'], ['Connectivity', 'Connection'], ['Backlighting', 'RGB'], ['Battery life', 'Battery'], ['Weight']],
  mice: [['DPI', 'Sensitivity'], ['Connectivity', 'Connection'], ['Sensor'], ['Battery', 'Battery life'], ['Polling rate'], ['Weight']],
  gamepads: [['Connectivity', 'Connection'], ['Compatibility', 'Platform'], ['Battery', 'Battery life'], ['Vibration', 'Haptic'], ['Buttons'], ['Weight']],
  gaming_consoles: [['Storage', 'SSD'], ['GPU', 'Graphics', 'TFLOPS'], ['CPU', 'Processor'], ['RAM', 'Memory'], ['Resolution', 'Max resolution'], ['Operating system']],
  consoles: [['Storage', 'SSD'], ['GPU', 'Graphics'], ['CPU', 'Processor'], ['RAM'], ['Resolution'], ['Disc drive', 'Optical']],
};

// Category aliases so an off-canon slug still resolves to a rich-alias set.
const RICH_CAT_ALIAS = {
  gpus: 'graphics_cards', gpu: 'graphics_cards', cpu: 'cpus', ssds: 'ssd',
  consoles: 'gaming_consoles', earphones: 'earbuds', 'e-readers': 'e_readers',
  laptop_coolers: 'cpu_coolers', coolers: 'cpu_coolers',
};

function resolveRichCategory(category) {
  const c = catKey(category);
  if (CARD_RICH_ALIASES[c]) return c;
  const alias = RICH_CAT_ALIAS[c];
  return alias && CARD_RICH_ALIASES[alias] ? alias : c;
}

// Build a flat, canonical, display-ready pool from the product's rich specs
// (present on category/search/detail payloads that include `_raw`). Same source
// the compare table renders, so labels/values stay consistent.
function richSpecPool(product) {
  const { keySpecs, specs } = canonicalizeSpecMaps(product);
  const pool = [];
  const seen = new Set();
  const take = (map) => {
    for (const [k, v] of Object.entries(map || {})) {
      const key = String(k || '').trim();
      if (!key || seen.has(key.toLowerCase())) continue;
      if (!isDisplayableSpec(key, v) || isHiddenSpec(key, v)) continue;
      seen.add(key.toLowerCase());
      pool.push([key, v]);
    }
  };
  take(keySpecs);
  take(specs);
  return pool;
}

const CARD_SPEC_ORDER = {
  smartphones: ['screen', 'ram', 'storage', 'battery'],
  feature_phones: ['screen', 'ram', 'storage', 'battery'],
  tablets: ['screen', 'ram', 'storage', 'battery'],
  laptops: ['screen', 'ram', 'storage', 'gpu_brand', 'os', 'resolution'],
  desktops: ['processor_brand', 'ram', 'storage', 'gpu_brand', 'os'],
  monitors: ['screen', 'resolution', 'screen_tech', 'refresh_rate'],
  tvs: ['screen', 'resolution', 'screen_tech', 'refresh_rate', 'os'],
  projectors: ['resolution', 'screen', 'refresh_rate', 'screen_tech'],
  graphics_cards: ['vram', 'gpu_brand', 'vram_type'],
  cpus: ['processor_brand', 'socket'],
  motherboards: ['socket', 'ram_type'],
  ram: ['ram', 'ram_type', 'ram_speed', 'ram_latency'],
  ssd: ['storage', 'storage_type'],
  ssds: ['storage', 'storage_type'],
  storage: ['storage', 'storage_type'],
  flash_drives: ['storage'],
  smartwatches: ['screen', 'os', 'processor_brand', 'connectivity'],
  gaming_consoles: ['screen', 'ram', 'storage', 'os'],
  consoles: ['screen', 'ram', 'storage', 'os'],
  headphones: ['headphone_type', 'connection', 'battery'],
  earbuds: ['connection', 'battery'],
  earphones: ['connection', 'battery'],
  speakers: ['connection', 'battery'],
  keyboards: ['key_type', 'connection'],
  mice: ['dpi', 'connection'],
  powerbanks: ['pb_capacity'],
  chargers: ['pb_capacity'],
  psu: ['psu_wattage', 'psu_efficiency', 'psu_modular'],
  psus: ['psu_wattage', 'psu_efficiency', 'psu_modular'],
  routers: ['connectivity'],
  wifi_routers: ['connectivity'],
  modem_routers: ['connectivity'],
  e_readers: ['screen', 'storage'],
  'e-readers': ['screen', 'storage'],
  vr_headsets: ['screen', 'resolution', 'refresh_rate'],
};

// Categories with no explicit order fall back to their filter groups, with the
// screen shown natively and battery appended last.
function defaultCardOrder(category) {
  const prefixes = filterGroupsForCategory(category)
    .map((g) => g.prefix)
    .filter((p) => p !== 'screen_size' && p !== 'phone_type');
  return ['screen', ...prefixes, 'battery'];
}

function checkLabel(lang) {
  return lang === 'tr' ? 'Var' : lang === 'de' ? 'Ja' : 'Yes';
}

// Up to `max` category-correct headline specs for a product card. Draws first
// from the LEAN payload (structured filterTokens + native screen/battery — the
// only data home rails have), then, when the card object also carries the rich
// `_raw` specs (category/search/detail surfaces), fills any empty slots from
// those so EVERY category reaches its fixed key specs. Each chip is
// { label, value }, already localized to `lang`.
//
// Wrapped by the memo below — call cardKeySpecs(), never this directly.
function computeCardKeySpecs(product, lang = 'en', max = 4) {
  const category = catKey(product?.category);
  const tokens = Array.isArray(product?.filterTokens) ? product.filterTokens : [];
  const screen = Number(product?.screenSizeValue) || 0;
  const battery = Number(product?.batteryCapacityValue) || 0;
  const out = [];
  const usedConcepts = new Set();

  // dedupeConcept is only for the RICH fallback — token/native slots are the
  // curated per-category set and must ALL show even when they share a concept
  // (e.g. GPU: VRAM + brand + memory-type all map to the "gpu" concept). They
  // still record their concept so the rich fallback won't re-add the same spec.
  const push = (value, labelText, concept, dedupeConcept = false) => {
    const v = String(value ?? '').replace(/\s+/g, ' ').trim();
    const l = String(labelText ?? '').replace(/\s+/g, ' ').trim();
    if (!v || !l || out.length >= max) return false;
    if (dedupeConcept && concept && usedConcepts.has(concept)) return false;
    if (out.some((c) => c.label === l || c.value === v)) return false;
    out.push({ label: l, value: v });
    if (concept) usedConcepts.add(concept);
    return true;
  };

  const addToken = (prefix) => {
    const group = TOKEN_GROUPS.find((g) => g.prefix === prefix);
    const tk = tokens.find((t) => t.startsWith(`${prefix}:`));
    if (!group || !tk) return;
    const val = prettyTokenValue(tokenValue(tk, prefix), lang);
    if (val) push(val, lbl(group.label, lang), SLOT_CONCEPT[prefix] || prefix);
  };

  const addSlot = (slot) => {
    if (slot === 'screen') {
      if (screen > 0 && screen <= 120) {
        push(`${screen % 1 === 0 ? screen : screen.toFixed(1)}"`, lbl(CARD_NATIVE_LABEL.screen, lang), 'screen');
      } else {
        addToken('screen_size');
      }
    } else if (slot === 'battery') {
      if (battery > 0) push(`${Math.round(battery)} mAh`, lbl(CARD_NATIVE_LABEL.battery, lang), 'battery');
    } else {
      addToken(slot);
    }
  };

  const order = CARD_SPEC_ORDER[category] || defaultCardOrder(category);
  for (const slot of order) {
    if (out.length >= max) break;
    addSlot(slot);
  }

  // Rich-spec fallback (only when the payload carries _raw specs): fill the
  // remaining slots with the category's priority specs so thin-token categories
  // (routers, printers, cameras, coolers…) still read as real spec cards.
  if (out.length < max && (product?.keySpecs || product?.specs || product?.specSections)) {
    const pool = richSpecPool(product);
    if (pool.length) {
      const firstLine = (v) => localizedSpecValue(v, lang).split('\n')[0].trim();
      const aliases = CARD_RICH_ALIASES[resolveRichCategory(category)] || [];
      const usedKeys = new Set();
      const tryKey = (key, value) => {
        if (usedKeys.has(key)) return;
        const concept = conceptForKey(key);
        const val = firstLine(value);
        if (!val || val.length > 30) return;
        if (push(val, localizedSpecLabel(key, lang), concept, true)) usedKeys.add(key);
      };
      // 1) category priority aliases
      for (const group of aliases) {
        if (out.length >= max) break;
        for (const alias of group) {
          const a = alias.toLowerCase();
          const hit = pool.find(([k]) => !usedKeys.has(k) && k.toLowerCase().includes(a));
          if (hit) { tryKey(hit[0], hit[1]); break; }
        }
      }
      // 2) any remaining displayable specs, concept-deduped
      for (const [k, v] of pool) {
        if (out.length >= max) break;
        tryKey(k, v);
      }
    }
  }

  // Last resort: boolean capability flags (5G, ANC, fast charge…) for categories
  // that still came up short and have no rich specs on this surface.
  if (out.length < max) {
    for (const f of featureFiltersForCategory(category)) {
      if (out.length >= max) break;
      if (tokens.includes(f.token)) push(checkLabel(lang), lbl(f.label, lang), f.token);
    }
  }
  return out;
}

// ── Kart etiketi önbelleği ─────────────────────────────────────────────────
// ÖLÇÜLDÜ (2026-08-06, canlı üretim derlemesi): bu hesap her render'da baştan
// koşuyordu ve `_raw` spec'i olan bir kartta ~80 ms sürüyor (canonicalizeSpecMaps
// + görüntülenebilirlik süzgeci + kategori takma-ad taraması). Ana sayfa akışı
// önbellekten zengin spec'li kartlarla dönünce ilk boyama tek başına 1795 ms ana
// thread'i kilitliyordu; aynı akış yalın kartlarla 173 ms sürüyor. Yani "site geç
// açılıyor / kaydırırken donuyor" şikayetinin kaynağı buydu.
//
// Sonuç YALNIZCA ürün nesnesine + dile bağlı, ürün nesneleri de değişmez
// (enrichment değişen karta YENİ referans verir), bu yüzden WeakMap ile
// nesne kimliğinden önbelleğe alınabilir; kart yeniden render olduğunda hesap
// tekrar etmez, nesne çöpe gidince kayıt da gider.
const chipMemo = new WeakMap();

// enrichThinCards() kartları YERİNDE zenginleştiriyor (nesne kimliği değişmiyor),
// dolayısıyla zenginleşmeden önce hesaplanmış etiketler bayat kalırdı. Mutasyonu
// yapan taraf bunu çağırıp kaydı düşürür.
export function invalidateCardChips(product) {
  if (product && typeof product === 'object') {
    chipMemo.delete(product);
    if (product.__chips) delete product.__chips;
  }
}

export function cardKeySpecs(product, lang = 'en', max = 4) {
  if (!product || typeof product !== 'object') return computeCardKeySpecs(product, lang, max);
  // Önceden hesaplanmış etiketler (akış önbelleği bunları saklar; bkz.
  // web/src/lib/typesense.js → freezeCardChips) — zengin spec taşımaya gerek
  // kalmadan kart dört etiketiyle ANINDA basılır.
  const pre = product.__chips;
  if (pre && pre.lang === lang && pre.max === max && Array.isArray(pre.chips)) return pre.chips;
  let byLang = chipMemo.get(product);
  if (!byLang) { byLang = new Map(); chipMemo.set(product, byLang); }
  const key = `${lang}|${max}`;
  const hit = byLang.get(key);
  if (hit) return hit;
  const out = computeCardKeySpecs(product, lang, max);
  byLang.set(key, out);
  return out;
}

export function compareTokenValues(prefix, a, b) {
  const av = tokenValue(a, prefix);
  const bv = tokenValue(b, prefix);
  const ag = capacityGbFromTokenValue(av);
  const bg = capacityGbFromTokenValue(bv);
  if (ag != null && bg != null) return ag - bg;
  const ar = rangeNumberFromTokenValue(av, 'hz') ?? rangeNumberFromTokenValue(av, 'mt') ?? rangeNumberFromTokenValue(av, 'cl');
  const br = rangeNumberFromTokenValue(bv, 'hz') ?? rangeNumberFromTokenValue(bv, 'mt') ?? rangeNumberFromTokenValue(bv, 'cl');
  if (ar != null && br != null) return ar - br;
  const an = parseFloat(av);
  const bn = parseFloat(bv);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}
