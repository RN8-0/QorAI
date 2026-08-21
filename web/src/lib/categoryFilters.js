import { canonicalizeSpecMaps } from './specCanonical';
import { localizedSpecValue, isDisplayableSpec, isHiddenSpec } from './specDisplay';

const label = (en, tr) => [en, tr];

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
  { prefix: 'phone_type', label: label('Phone type', 'Telefon tipi'), categories: ['smartphones'] },
  { prefix: 'storage', kind: 'range', unit: 'capacity', label: label('Storage', 'Depolama'), categories: [...COMPUTING_CATS, 'ssd', 'ssds', 'storage', 'flash_drives'] },
  { prefix: 'ram', kind: 'range', unit: 'capacity', label: label('RAM', 'RAM'), categories: [...COMPUTING_CATS, 'ram'] },
  { prefix: 'ram_speed', kind: 'range', unit: 'mt', label: label('Memory speed', 'Bellek hızı'), categories: ['ram'] },
  { prefix: 'ram_latency', kind: 'range', unit: 'cl', label: label('CL latency', 'CL gecikme'), categories: ['ram'] },
  { prefix: 'screen_size', kind: 'range', unit: 'inch', label: label('Screen size', 'Ekran boyutu'), categories: DISPLAY_CATS },
  { prefix: 'refresh_rate', kind: 'range', unit: 'hz', label: label('Refresh rate', 'Yenileme hızı'), categories: DISPLAY_CATS },
  { prefix: 'screen_tech', label: label('Panel type', 'Panel tipi'), categories: DISPLAY_CATS },
  { prefix: 'resolution', label: label('Resolution', 'Çözünürlük'), categories: ['monitors', 'tvs', 'projectors', 'laptops', 'tablets', 'smartphones'] },
  { prefix: 'display_input', label: label('Inputs', 'Girişler'), categories: ['monitors', 'tvs', 'projectors'] },
  { prefix: 'os', label: label('Operating system', 'İşletim sistemi'), categories: [...COMPUTING_CATS, 'smartwatches', 'tvs'] },
  { prefix: 'processor_brand', label: label('Processor', 'İşlemci'), categories: ['smartphones', 'tablets', 'laptops', 'desktops', 'smartwatches', 'cpus'] },
  { prefix: 'gpu_type', label: label('Graphics', 'Ekran kartı'), categories: ['laptops', 'desktops'] },
  { prefix: 'gpu_brand', label: label('GPU brand', 'GPU markası'), categories: GPU_CATS },
  { prefix: 'vram', kind: 'range', unit: 'capacity', label: label('Video memory', 'Ekran kartı belleği'), categories: GPU_CATS },
  { prefix: 'vram_type', label: label('Memory type', 'Bellek tipi'), categories: ['graphics_cards'] },
  { prefix: 'ram_type', label: label('Memory type', 'Bellek tipi'), categories: ['ram', 'laptops', 'desktops', 'motherboards'] },
  { prefix: 'ram_module', label: label('Module type', 'Modül tipi'), categories: ['ram'] },
  { prefix: 'ram_kit', label: label('Kit', 'Kit'), categories: ['ram'] },
  { prefix: 'ram_platform', label: label('Platform', 'Platform'), categories: ['ram'] },
  { prefix: 'storage_type', label: label('Storage type', 'Depolama tipi'), categories: ['ssd', 'ssds', 'storage', 'laptops', 'desktops'] },
  { prefix: 'socket', label: label('Socket', 'Soket'), categories: ['cpus', 'motherboards', 'cpu_coolers'] },
  { prefix: 'connectivity', label: label('Connectivity', 'Bağlantı'), categories: [...MOBILE_CATS, 'laptops', 'routers', 'wifi_routers', 'modem_routers'] },
  // Input peripherals & audio.
  { prefix: 'connection', label: label('Connection', 'Bağlantı'), categories: PERIPHERAL_CONN_CATS },
  { prefix: 'dpi', kind: 'range', unit: 'dpi', label: label('Sensitivity (DPI)', 'Hassasiyet (DPI)'), categories: ['mice'] },
  { prefix: 'key_type', label: label('Key type', 'Tuş tipi'), categories: ['keyboards'] },
  { prefix: 'headphone_type', label: label('Type', 'Kulaklık tipi'), categories: ['headphones'] },
  // Power.
  { prefix: 'psu_wattage', kind: 'range', unit: 'w', label: label('Wattage', 'Güç'), categories: ['psu'] },
  { prefix: 'psu_efficiency', label: label('Efficiency', 'Verimlilik'), categories: ['psu'] },
  { prefix: 'psu_modular', label: label('Cabling', 'Kablo tipi'), categories: ['psu'] },
  { prefix: 'pb_capacity', kind: 'range', unit: 'mah', label: label('Capacity', 'Kapasite'), categories: ['powerbanks'] },
];

export const FEATURE_TOKENS = [
  { token: 'five_g:true', label: label('5G', '5G'), categories: MOBILE_CATS },
  { token: 'nfc:true', label: label('NFC', 'NFC'), categories: MOBILE_CATS },
  { token: 'wireless_charging:true', label: label('Wireless charging', 'Kablosuz şarj'), categories: ['smartphones', 'smartwatches', 'earbuds', 'headphones', 'powerbanks'] },
  { token: 'fast_charging:true', label: label('Fast charging', 'Hızlı şarj'), categories: ['smartphones', 'tablets', 'laptops', 'smartwatches', 'headphones', 'earbuds', 'powerbanks'] },
  { token: 'fingerprint:true', label: label('Fingerprint', 'Parmak izi'), categories: ['smartphones', 'tablets', 'laptops'] },
  { token: 'water_resistance:true', label: label('Water resistant', 'Suya dayanıklı'), categories: ['smartphones', 'smartwatches', 'headphones', 'earbuds', 'speakers'] },
  { token: 'anc:true', label: label('Noise cancelling (ANC)', 'Gürültü engelleme (ANC)'), categories: ['headphones', 'earbuds'] },
  { token: 'ecc:true', label: label('ECC', 'ECC'), categories: ['ram'] },
  { token: 'lighting:true', label: label('Lighting', 'Aydınlatma'), categories: PERIPHERAL_LIGHT_CATS },
  { token: 'rgb:true', label: label('RGB', 'RGB'), categories: PERIPHERAL_LIGHT_CATS },
  { token: 'xmp:true', label: label('Intel XMP', 'Intel XMP'), categories: ['ram'] },
  { token: 'expo:true', label: label('AMD EXPO', 'AMD EXPO'), categories: ['ram'] },
];

const TOKEN_VALUE_LABEL = {
  smart: label('Smartphone', 'Akıllı telefon'),
  feature: label('Feature phone', 'Tuşlu telefon'),
  amoled: 'AMOLED', super_amoled: 'Super AMOLED', dynamic_amoled: 'Dynamic AMOLED', oled: 'OLED', qd_oled: 'QD-OLED', qled: 'QLED', mini_led: 'Mini LED', micro_led: 'Micro LED', ltpo: 'LTPO', ips: 'IPS', lcd: 'LCD', va: 'VA', tn: 'TN', retina: 'Retina', eink: 'E-Ink',
  google: 'Google Tensor', kirin: 'Kirin', unisoc: 'UNISOC',
  fhd: 'Full HD', qhd: 'QHD', wqhd: 'WQHD', uwqhd: 'UWQHD', '4k': '4K', '5k': '5K', '8k': '8K', hd: 'HD',
  hdmi: 'HDMI', displayport: 'DisplayPort', usb_c: 'USB-C', thunderbolt: 'Thunderbolt', dvi: 'DVI', vga: 'VGA',
  windows: 'Windows', macos: 'macOS', ios: 'iOS', ipados: 'iPadOS', android: 'Android', chromeos: 'ChromeOS', linux: 'Linux',
  intel: 'Intel', amd: 'AMD', apple: 'Apple', qualcomm: 'Qualcomm', mediatek: 'MediaTek', exynos: 'Exynos',
  nvidia: 'NVIDIA',
  dedicated: label('Dedicated', 'Harici'), integrated: label('Integrated', 'Dahili'),
  gddr7: 'GDDR7', gddr6x: 'GDDR6X', gddr6: 'GDDR6', gddr5x: 'GDDR5X', gddr5: 'GDDR5', gddr4: 'GDDR4', hbm2: 'HBM2', hbm: 'HBM',
  wireless: label('Wireless', 'Kablosuz'), wired: label('Wired', 'Kablolu'), bluetooth: 'Bluetooth',
  mechanical: label('Mechanical', 'Mekanik'), membrane: label('Membrane', 'Membran'), optical_switch: label('Optical/Hall', 'Optik/Manyetik'),
  over_ear: label('Over-ear', 'Kulak çevreleyen'), on_ear: label('On-ear', 'Kulak üstü'), in_ear: label('In-ear', 'Kulak içi'),
  '80plus': '80+', bronze: '80+ Bronze', silver: '80+ Silver', gold: '80+ Gold', platinum: '80+ Platinum', titanium: '80+ Titanium',
  full_modular: label('Full modular', 'Tam modüler'), semi_modular: label('Semi-modular', 'Yarı modüler'), non_modular: label('Non-modular', 'Modüler değil'),
  ddr3: 'DDR3', ddr4: 'DDR4', ddr5: 'DDR5', lpddr4x: 'LPDDR4X', lpddr5: 'LPDDR5', lpddr5x: 'LPDDR5X',
  dimm: 'DIMM', sodimm: 'SO-DIMM', udimm: 'UDIMM', rdimm: 'RDIMM', lrdimm: 'LRDIMM',
  desktop: label('Desktop', 'Masaüstü'), laptop: label('Laptop', 'Dizüstü'), server: label('Server', 'Sunucu'),
  '1_modules': label('Single module', 'Tek modül'), '2_modules': label('2 modules', '2 modül'),
  '3_modules': label('3 modules', '3 modül'), '4_modules': label('4 modules', '4 modül'),
  '8_modules': label('8 modules', '8 modül'),
  ssd: 'SSD', hdd: 'HDD', nvme: 'NVMe', sata: 'SATA', emmc: 'eMMC', ufs: 'UFS',
  'wi-fi': 'Wi-Fi', '5g': '5G', '4g': '4G',
};

export function lbl(arr, lang) {
  return lang === 'tr' ? arr[1] : arr[0];
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
// Concept per card slot — used to dedupe against the rich-spec fallback so a
// phone never shows "12 GB RAM" (token) and then "RAM: 12 GB" (rich) twice.
// Concept for a (canonical, English) rich-spec key so we can align it with the
// token concepts above. Keeps the fallback from re-adding a spec a token chip
// already covered.
// KANONIK havuz — pahali (urunun 130+ spec etiketini kanonik adlara cevirir).
function richSpecPool(product) {
  const { keySpecs, specs } = canonicalizeSpecMaps(product);
  return buildPool([keySpecs, specs]);
}


function buildPool(maps) {
  const pool = [];
  const seen = new Set();
  for (const map of maps) {
    for (const [k, v] of Object.entries(map || {})) {
      const key = String(k || '').trim();
      if (!key || seen.has(key.toLowerCase())) continue;
      if (!isDisplayableSpec(key, v) || isHiddenSpec(key, v)) continue;
      seen.add(key.toLowerCase());
      pool.push([key, v]);
    }
  }
  return pool;
}

// ── Kategori başına SABİT kart etiketleri ──────────────────────────────────
// Buradaki liste artık bir "öncelik sırası" değil, KATEGORİNİN SABİT SLOTLARI.
// Eskiden bir slot doldurulamayınca yerini sıradaki spec kapıyordu; sonuç, aynı
// kategorideki iki kartın FARKLI spec türleri göstermesiydi (birinde ekran
// boyutu, diğerinde RAM). Artık slotlar sabit: her slot önce yalın veriden,
// sonra zengin spec'ten doldurulmaya çalışılır, doldurulamazsa YERİNİ KORUR
// (değeri "—" olur). Böylece bir kategorideki her kart aynı dört speci aynı
// sırada gösterir.
//
// Bazı slotlar yalnız zengin spec'ten gelir (token grubu yoktur) — bunlar
// SLOT_RICH_ONLY'de tanımlı ve etiketleri SLOT_FALLBACK_LABEL'dan okunur.
const CARD_SPEC_ORDER = {
  smartphones: ['screen', 'ram', 'storage', 'battery'],
  feature_phones: ['screen', 'ram', 'storage', 'battery'],
  tablets: ['screen', 'ram', 'storage', 'battery'],
  // Slotlar KATALOG KAPSAMINA göre seçildi (2026-08-06 ölçümü, kategori başına
  // en yüksek puanlı 100 ürün): `gpu_brand` token'ı laptop/masaüstünde HİÇ
  // üretilmiyor (laptop'ta `gpu_type` %84, masaüstünde `os` %64) — o slot
  // seçilince kartların çoğunda boş kalıyordu.
  laptops: ['screen', 'ram', 'storage', 'gpu_type'],
  desktops: ['processor_brand', 'ram', 'storage', 'os'],
  monitors: ['screen', 'resolution', 'screen_tech', 'refresh_rate'],
  tvs: ['screen', 'resolution', 'screen_tech', 'refresh_rate'],
  projectors: ['resolution', 'screen', 'refresh_rate', 'screen_tech'],
  graphics_cards: ['vram', 'gpu_brand', 'vram_type', 'gpu_clock'],
  cpus: ['processor_brand', 'socket', 'cpu_cores', 'cpu_clock'],
  motherboards: ['socket', 'ram_type', 'form_factor', 'chipset'],
  ram: ['ram', 'ram_type', 'ram_speed', 'ram_module'],
  ssd: ['storage', 'storage_type', 'read_speed', 'write_speed'],
  ssds: ['storage', 'storage_type', 'read_speed', 'write_speed'],
  storage: ['storage', 'storage_type', 'read_speed', 'write_speed'],
  flash_drives: ['storage', 'connection', 'read_speed', 'write_speed'],
  // smartwatches: processor_brand %41, battery %36 — yerine storage %98 / ram %64.
  smartwatches: ['screen', 'os', 'storage', 'ram'],
  gaming_consoles: ['storage', 'ram', 'resolution', 'os'],
  consoles: ['storage', 'ram', 'resolution', 'os'],
  headphones: ['headphone_type', 'connection', 'battery', 'driver'],
  earbuds: ['connection', 'battery', 'driver', 'weight'],
  earphones: ['connection', 'battery', 'driver', 'weight'],
  speakers: ['connection', 'battery', 'power_output', 'weight'],
  keyboards: ['key_type', 'connection', 'layout', 'lighting'],
  mice: ['dpi', 'connection', 'buttons', 'weight'],
  powerbanks: ['pb_capacity', 'power_output', 'connection', 'fast_charge'],
  chargers: ['pb_capacity', 'power_output', 'connection', 'fast_charge'],
  psu: ['psu_wattage', 'psu_modular', 'psu_efficiency', 'fan_size'],
  psus: ['psu_wattage', 'psu_modular', 'psu_efficiency', 'fan_size'],
  routers: ['connectivity', 'wifi_standard', 'ports', 'speed'],
  wifi_routers: ['connectivity', 'wifi_standard', 'ports', 'speed'],
  modem_routers: ['connectivity', 'wifi_standard', 'ports', 'speed'],
  e_readers: ['screen', 'storage', 'resolution', 'battery'],
  'e-readers': ['screen', 'storage', 'resolution', 'battery'],
  vr_headsets: ['screen', 'resolution', 'refresh_rate', 'weight'],
};

// Token grubu OLMAYAN, yalnız zengin spec'ten doldurulan slotlar. Değer,
// aşağıdaki takma adlarla eşleşen ilk spec anahtarından alınır.
// TAKMA ADLAR GERÇEK ANAHTARLARDAN TÜRETİLDİ. Katalog spec anahtarları
// Türkçe/İngilizce KARIŞIK ("Bellek Boyutu", "Display Teknolojisi",
// "Artırılmış Frequency", "Refresh rate") — yalnız İngilizce takma ad yazmak
// slotları boş bırakıyordu (ölçüm: ekran kartlarında 4 slotun 3'ü %0'dı).
// Değişiklikten sonra `web/slot_coverage.mjs` ile doluluk yeniden ölçülmeli.
const SLOT_RICH_ONLY = {
  gpu_clock: ['artırılmış frequency', 'boost clock', 'gpu clock', 'core clock', 'frequency', 'saat hızı'],
  cpu_cores: ['cpu cores', 'core count', 'çekirdek sayısı', 'number of cores', 'çekirdek'],
  cpu_clock: ['cpu frequency', 'base clock', 'frequency', 'işlemci hızı', 'saat hızı'],
  form_factor: ['form faktörü', 'form factor', 'boyut standardı'],
  chipset: ['chipset', 'yonga seti'],
  read_speed: ['read speed', 'sequential read', 'okuma hızı'],
  write_speed: ['write speed', 'sequential write', 'yazma hızı'],
  driver: ['sürücü çapı', 'driver size', 'driver', 'hoparlör çapı'],
  power_output: ['output akımı', 'power output', 'output power', 'çıkış gücü', 'rms'],
  layout: ['tuş dizilimi', 'keyboard layout', 'layout', 'düzen'],
  buttons: ['mouse tuşları', 'tuş sayısı', 'buttons', 'number of buttons'],
  weight: ['weight', 'ağırlık', 'gewicht'],
  wifi_standard: ['wi-fi', 'wifi', 'wireless standard', 'kablosuz standart'],
  fan_size: ['fan boyutu', 'fan size'],
  lighting: ['klavye aydınlatması', 'aydınlatma', 'lighting'],
  fast_charge: ['fast charging', 'hızlı şarj'],
  ports: ['output adedi', 'lan ports', 'port sayısı', 'ethernet', 'ports'],
  speed: ['bellek saat hızı', 'max speed', 'bandwidth', 'hızı'],
};

// Token slotlarının zengin-spec karşılıkları: yalın veri (filterTokens) o slotu
// dolduramadığında `_raw` taşıyan yüzeylerde (kategori/arama/detay) SLOT KENDİ
// karşılığından dolar — başka bir spec onun yerini KAPMAZ.
const SLOT_TOKEN_RICH_ALIASES = {
  screen: ['display boyutu', 'ekran boyutu', 'screen size', 'display size'],
  ram: ['ram', 'bellek kapasitesi', 'memory size'],
  storage: ['storage', 'depolama', 'rom'],
  battery: ['battery capacity', 'pil kapasitesi', 'kullanım süresi', 'use time', 'battery', 'pil', 'akku'],
  resolution: ['resolution', 'çözünürlük'],
  screen_tech: ['display teknolojisi', 'ekran teknolojisi', 'panel', 'display type', 'screen technology'],
  refresh_rate: ['refresh rate', 'yenileme hızı'],
  os: ['işletim sistemi', 'operating system'],
  gpu_brand: ['gpu mimarisi', 'işlemci üreticisi', 'gpu', 'graphics'],
  gpu_type: ['ekran kartı', 'graphics', 'gpu'],
  vram: ['bellek boyutu', 'bellek kapasitesi', 'video memory', 'vram', 'ekran kartı bellek'],
  vram_type: ['bellek türü', 'bellek teknolojisi', 'memory type', 'bellek tipi'],
  processor_brand: ['işlemci modeli', 'işlemci üreticisi', 'processor', 'chipset', 'işlemci'],
  socket: ['işlemci soketi', 'socket', 'soket'],
  ram_type: ['bellek teknolojisi', 'bellek türü', 'memory type', 'bellek tipi'],
  ram_speed: ['bellek hızı', 'bellek saat hızı', 'memory speed'],
  ram_latency: ['cl', 'latency', 'gecikme'],
  storage_type: ['depolama tipi', 'storage type', 'arayüz', 'interface'],
  connectivity: ['bağlantı şekli', 'connectivity', 'bağlantı', 'wireless'],
  connection: ['bağlantı şekli', 'connection', 'bağlantı', 'interface'],
  headphone_type: ['ürün tipi', 'kulaklık tip', 'form', 'bauform'],
  key_type: ['mekanik tuşlar', 'tuş tip', 'key type', 'switch'],
  dpi: ['azami hassasiyet', 'hassasiyet', 'dpi', 'sensitivity'],
  pb_capacity: ['battery capacity', 'kapasite', 'capacity'],
  psu_wattage: ['güç', 'wattage', 'power'],
  psu_efficiency: ['güç verimliliği', 'verimlilik', 'efficiency', '80 plus'],
  psu_modular: ['kablo tipi', 'modular', 'kablo'],
};

// Yalnız-zengin slotların ve yerine konamayan token slotlarının etiketi.
const SLOT_FALLBACK_LABEL = {
  gpu_clock: label('Clock', 'Hız'),
  cpu_cores: label('Cores', 'Çekirdek'),
  cpu_clock: label('Frequency', 'Frekans'),
  form_factor: label('Form factor', 'Form faktör'),
  chipset: label('Chipset', 'Yonga seti'),
  read_speed: label('Read', 'Okuma'),
  write_speed: label('Write', 'Yazma'),
  driver: label('Driver', 'Sürücü'),
  power_output: label('Power', 'Güç'),
  layout: label('Layout', 'Düzen'),
  buttons: label('Buttons', 'Tuş'),
  weight: label('Weight', 'Ağırlık'),
  wifi_standard: label('Wi-Fi', 'Wi-Fi'),
  fan_size: label('Fan', 'Fan'),
  lighting: label('Lighting', 'Aydınlatma'),
  fast_charge: label('Fast charge', 'Hızlı şarj'),
  ports: label('Ports', 'Port'),
  speed: label('Speed', 'Hız'),
  screen: label('Screen', 'Ekran'),
  battery: label('Battery', 'Batarya'),
};

// Categories with no explicit order fall back to their filter groups, with the
// screen shown natively and battery appended last.
function defaultCardOrder(category) {
  const prefixes = filterGroupsForCategory(category)
    .map((g) => g.prefix)
    .filter((p) => p !== 'screen_size' && p !== 'phone_type');
  return ['screen', ...prefixes, 'battery'];
}

// Up to `max` category-correct headline specs for a product card. Draws first
// from the LEAN payload (structured filterTokens + native screen/battery — the
// only data home rails have), then, when the card object also carries the rich
// `_raw` specs (category/search/detail surfaces), fills any empty slots from
// those so EVERY category reaches its fixed key specs. Each chip is
// { label, value }, already localized to `lang`.
//
// Wrapped by the memo below — call cardKeySpecs(), never this directly.
// Değeri bulunamayan slot için yer tutucu — slot YERİNİ KORUR ki aynı
// kategorideki kartlar hizalı kalsın.
const SLOT_EMPTY = '—';

function computeCardKeySpecs(product, lang = 'en', max = 4) {
  const category = catKey(product?.category);
  const tokens = Array.isArray(product?.filterTokens) ? product.filterTokens : [];
  const screen = Number(product?.screenSizeValue) || 0;
  const battery = Number(product?.batteryCapacityValue) || 0;

  const order = (CARD_SPEC_ORDER[category] || defaultCardOrder(category)).slice(0, max);

  // Slot etiketi: token grubu varsa onun etiketi, yoksa yalın/yedek etiket.
  const slotLabel = (slot) => {
    const group = TOKEN_GROUPS.find((g) => g.prefix === slot)
      || (slot === 'screen' ? TOKEN_GROUPS.find((g) => g.prefix === 'screen_size') : null);
    if (group) return lbl(group.label, lang);
    if (SLOT_FALLBACK_LABEL[slot]) return lbl(SLOT_FALLBACK_LABEL[slot], lang);
    return String(slot).replace(/_/g, ' ');
  };

  // 1) Yalın veri (indekslenmiş alanlar + filterTokens).
  const leanValue = (slot) => {
    if (slot === 'screen') {
      if (screen > 0 && screen <= 120) return `${screen % 1 === 0 ? screen : screen.toFixed(1)}"`;
      slot = 'screen_size';
    }
    if (slot === 'battery') return battery > 0 ? `${Math.round(battery)} mAh` : '';
    const tk = tokens.find((t) => t.startsWith(`${slot}:`));
    if (!tk) return '';
    return prettyTokenValue(tokenValue(tk, slot), lang) || '';
  };

  // 2) Zengin spec (yalnız `_raw` taşıyan yüzeylerde). Artık "boşluğu ne
  //    bulursam onunla doldur" DEĞİL: her slot yalnız KENDİ takma adlarıyla
  //    eşleşen spec'ten dolar, yoksa boş kalır.
  // TEMBEL HAVUZ (2026-08-18). Eskiden `richSpecPool(product)` KOŞULSUZ
  // çağrılıyordu; o da `canonicalizeSpecMaps` ile ürünün 130+ spec etiketini
  // kanonik adlara çeviriyordu — sadece 4 çip için. Oysa kartların çoğunda
  // dört slotun HEPSİ yalın veriden (filterTokens + indekslenmiş alanlar)
  // doluyor ve havuza HİÇ bakılmıyor. Artık havuz yalnız gerçekten gerekince
  // kuruluyor (CPU profilinde en pahalı kalem: containsWord 450 ms).
  //
  // ÖLÇÜLDÜ (kategori sayfası · 390x844 · 4x CPU · Yavaş 4G · eşleştirilmiş A/B):
  //   TBT medyan 1134 → 945 ms
  //
  // HAM etiketlerde ÖNCE arama da denendi (çok daha ucuz) ama GERİ ALINDI:
  // ham "Bağlantı Şekli" slot takma adına çarpıp kulaklıklarda "Connection"
  // çipini "—" yerine "Kablolu" yapıyordu. Performans çalışması ekranda
  // görünen metni DEĞİŞTİRMEMELİ (kanıt: scripts/_cip_denklik.mjs).
  const zengin = !!(product?.keySpecs || product?.specs || product?.specSections);
  let _pool = null;
  const getPool = () => (_pool || (_pool = zengin ? richSpecPool(product) : []));
  const richValue = (slot) => {
    if (!zengin) return '';
    const aliases = SLOT_RICH_ONLY[slot] || SLOT_TOKEN_RICH_ALIASES[slot] || [];
    if (!aliases.length) return '';
    const pool = getPool();
    if (!pool.length) return '';
    for (const alias of aliases) {
      const a = alias.toLowerCase();
      const hit = pool.find(([k]) => k.toLowerCase().includes(a));
      if (!hit) continue;
      const val = localizedSpecValue(hit[1], lang).split('\n')[0].trim();
      if (val && val.length <= 30) return val;
    }
    return '';
  };

  const out = order.map((slot) => ({
    label: String(slotLabel(slot) || slot).replace(/\s+/g, ' ').trim(),
    value: String(leanValue(slot) || richValue(slot) || SLOT_EMPTY).replace(/\s+/g, ' ').trim(),
  }));
  // Hiçbir slotu dolmayan kart (kategorisi tanımsız / verisi yok) için boş dön —
  // dört tane "—" basmaktansa hiç etiket göstermemek daha temiz.
  if (out.every((c) => c.value === SLOT_EMPTY)) return [];
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
