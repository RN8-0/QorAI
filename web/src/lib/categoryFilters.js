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
