// Shared formatting + category metadata helpers.

// Icon + display label per category. Labels are intentionally English
// here (category names are universal-ish); the icon is the main signal.
export const CATEGORY_META = {
  smartphones: { icon: '📱', label: 'Smartphones', tr: 'Akıllı Telefon', de: 'Smartphones', color: '#3B82F6' },
  feature_phones: { icon: '☎️', label: 'Feature Phones', tr: 'Tuşlu Telefon', de: 'Feature Phones', color: '#3B82F6' },
  smartwatches: { icon: '⌚', label: 'Smartwatches', tr: 'Akıllı Saat', de: 'Smartwatches', color: '#14B8A6' },
  smart_rings: { icon: '💍', label: 'Smart Rings', tr: 'Akıllı Yüzük', de: 'Smart Rings', color: '#14B8A6' },
  headphones: { icon: '🎧', label: 'Headphones', tr: 'Kulaklık', de: 'Kopfhörer', color: '#EC4899' },
  earbuds: { icon: '🎧', label: 'Earbuds', tr: 'Kulaklık', de: 'Earbuds', color: '#EC4899' },
  earphones: { icon: '🎧', label: 'Earphones', tr: 'Kulaklık', de: 'Kopfhörer', color: '#EC4899' },
  powerbanks: { icon: '🔋', label: 'Power Banks', tr: 'Powerbank', de: 'Powerbanks', color: '#22C55E' },
  chargers: { icon: '🔌', label: 'Chargers', tr: 'Şarj Aleti', de: 'Ladegeräte', color: '#22C55E' },

  laptops: { icon: '💻', label: 'Laptops', tr: 'Laptop', de: 'Laptops', color: '#6366F1' },
  desktops: { icon: '🖥️', label: 'Desktop PCs', tr: 'Masaüstü PC', de: 'Desktop-PCs', color: '#6366F1' },
  tablets: { icon: '📱', label: 'Tablets', tr: 'Tablet', de: 'Tablets', color: '#3B82F6' },
  e_readers: { icon: '📖', label: 'E-Readers', tr: 'E-Kitap Okuyucu', de: 'E-Reader', color: '#22C55E' },
  vr_headsets: { icon: '🥽', label: 'VR Headsets', tr: 'Sanal Gerçeklik', de: 'VR-Headsets', color: '#8B5CF6' },

  gpus: { icon: '🎮', label: 'Graphics Cards', tr: 'Ekran Kartı', de: 'Grafikkarten', color: '#8B5CF6' },
  graphics_cards: { icon: '🎮', label: 'Graphics Cards', tr: 'Ekran Kartı', de: 'Grafikkarten', color: '#8B5CF6' },
  cpus: { icon: '🧠', label: 'Processors', tr: 'İşlemci', de: 'Prozessoren', color: '#06B6D4' },
  motherboards: { icon: '🔲', label: 'Motherboards', tr: 'Anakart', de: 'Mainboards', color: '#06B6D4' },
  ram: { icon: '💾', label: 'RAM', tr: 'RAM', de: 'RAM', color: '#06B6D4' },
  storage: { icon: '💿', label: 'Storage', tr: 'Depolama', de: 'Speicher', color: '#06B6D4' },
  ssd: { icon: '💿', label: 'SSDs', tr: 'SSD', de: 'SSDs', color: '#06B6D4' },
  ssds: { icon: '💿', label: 'SSDs', tr: 'SSD', de: 'SSDs', color: '#06B6D4' },
  psu: { icon: '⚡', label: 'Power Supplies', tr: 'PSU', de: 'Netzteile', color: '#06B6D4' },
  psus: { icon: '⚡', label: 'Power Supplies', tr: 'PSU', de: 'Netzteile', color: '#06B6D4' },
  cases: { icon: '📦', label: 'PC Cases', tr: 'Kasa', de: 'PC-Gehäuse', color: '#06B6D4' },
  pc_cases: { icon: '📦', label: 'PC Cases', tr: 'Kasa', de: 'PC-Gehäuse', color: '#06B6D4' },
  ups: { icon: '🔋', label: 'UPS', tr: 'UPS', de: 'USV', color: '#22C55E' },
  flash_drives: { icon: '💾', label: 'USB Flash Drives', tr: 'USB Bellek', de: 'USB-Sticks', color: '#06B6D4' },

  cpu_coolers: { icon: '❄️', label: 'CPU Coolers', tr: 'İşlemci Soğutucu', de: 'CPU-Kühler', color: '#06B6D4' },
  laptop_coolers: { icon: '❄️', label: 'Laptop Coolers', tr: 'Laptop Soğutucu', de: 'Laptop-Kühler', color: '#06B6D4' },
  case_fans: { icon: '🌀', label: 'Case Fans', tr: 'Kasa Fanı', de: 'Gehäuselüfter', color: '#06B6D4' },
  coolers: { icon: '❄️', label: 'Coolers', tr: 'Soğutucular', de: 'Kühler', color: '#06B6D4' },

  keyboards: { icon: '⌨️', label: 'Keyboards', tr: 'Klavye', de: 'Tastaturen', color: '#0EA5E9' },
  mice: { icon: '🖱️', label: 'Mice', tr: 'Mouse', de: 'Mäuse', color: '#0EA5E9' },
  gamepads: { icon: '🎮', label: 'Gamepads', tr: 'Oyun Kolu', de: 'Gamepads', color: '#8B5CF6' },
  consoles: { icon: '🕹️', label: 'Consoles', tr: 'Oyun Konsolu', de: 'Konsolen', color: '#8B5CF6' },
  gaming_consoles: { icon: '🕹️', label: 'Game Consoles', tr: 'Oyun Konsolu', de: 'Spielkonsolen', color: '#8B5CF6' },
  webcams: { icon: '📹', label: 'Webcams', tr: 'Webcam', de: 'Webcams', color: '#0EA5E9' },
  microphones: { icon: '🎙️', label: 'Microphones', tr: 'Mikrofon', de: 'Mikrofone', color: '#EC4899' },
  printers: { icon: '🖨️', label: 'Printers', tr: 'Yazıcı', de: 'Drucker', color: '#0EA5E9' },
  '3d_printers': { icon: '🏭', label: '3D Printers', tr: '3D Yazıcı', de: '3D-Drucker', color: '#0EA5E9' },

  monitors: { icon: '🖥️', label: 'Monitors', tr: 'Monitör', de: 'Monitore', color: '#10B981' },
  tvs: { icon: '📺', label: 'TVs', tr: 'Televizyon', de: 'TVs', color: '#10B981' },
  projectors: { icon: '📽️', label: 'Projectors', tr: 'Projeksiyon', de: 'Projektoren', color: '#10B981' },
  speakers: { icon: '🔊', label: 'Speakers', tr: 'Hoparlör', de: 'Lautsprecher', color: '#EC4899' },
  audio_systems: { icon: '🎚️', label: 'Audio Systems', tr: 'Ses Sistemi', de: 'Audiosysteme', color: '#EC4899' },
  av_receivers: { icon: '🔌', label: 'AV Receivers', tr: 'AV Receiver', de: 'AV-Receiver', color: '#EC4899' },
  media_players: { icon: '▶️', label: 'Media Players', tr: 'Medya Oynatıcı', de: 'Mediaplayer', color: '#10B981' },
  soundbars: { icon: '🔊', label: 'Soundbars', tr: 'Soundbar', de: 'Soundbars', color: '#EC4899' },

  cameras: { icon: '📷', label: 'Cameras', tr: 'Kamera', de: 'Kameras', color: '#F97316' },
  camera_lenses: { icon: '📷', label: 'Camera Lenses', tr: 'Lens', de: 'Kameraobjektive', color: '#F97316' },
  action_cameras: { icon: '🎥', label: 'Action Cameras', tr: 'Aksiyon Kamera', de: 'Action-Kameras', color: '#F97316' },
  security_cameras: { icon: '🛡️', label: 'Security Cameras', tr: 'Güvenlik Kamerası', de: 'Sicherheitskameras', color: '#F97316' },
  ip_cameras: { icon: '📹', label: 'IP Cameras', tr: 'IP Kamera', de: 'IP-Kameras', color: '#F97316' },
  dashcams: { icon: '🚗', label: 'Dash Cameras', tr: 'Araç İçi Kamera', de: 'Dashcams', color: '#F97316' },
  gimbals: { icon: '🎥', label: 'Gimbals', tr: 'Gimbal', de: 'Gimbals', color: '#F97316' },
  drones: { icon: '🚁', label: 'Drones', tr: 'Drone', de: 'Drohnen', color: '#06B6D4' },

  routers: { icon: '📡', label: 'Routers', tr: 'Router', de: 'Router', color: '#3B82F6' },
  wifi_routers: { icon: '📡', label: 'WiFi Routers', tr: 'WiFi Router', de: 'WLAN-Router', color: '#3B82F6' },
  modem_routers: { icon: '🛰️', label: 'Modems', tr: 'Modem', de: 'Modems', color: '#3B82F6' },
  robot_vacuums: { icon: '🧹', label: 'Robot Vacuums', tr: 'Robot Süpürge', de: 'Saugroboter', color: '#F59E0B' },
  hardware_wallets: { icon: '🔐', label: 'Hardware Wallets', tr: 'Soğuk Cüzdan', de: 'Hardware-Wallets', color: '#22C55E' },
};

export const CANONICAL_CATEGORY_GROUPS = [
  { key: 'mobile', title: { en: 'Mobile', tr: 'Mobil', de: 'Mobil' }, cats: ['smartphones', 'feature_phones', 'smartwatches', 'smart_rings', 'headphones', 'powerbanks', 'chargers'] },
  { key: 'computing', title: { en: 'Computing', tr: 'Bilgisayar', de: 'Computer' }, cats: ['laptops', 'desktops', 'tablets', 'e_readers', 'vr_headsets'] },
  { key: 'components', title: { en: 'Components', tr: 'Bileşenler', de: 'Komponenten' }, cats: ['graphics_cards', 'cpus', 'motherboards', 'ram', 'ssd', 'psu', 'pc_cases', 'ups', 'flash_drives'] },
  { key: 'cooling', title: { en: 'Cooling', tr: 'Soğutma', de: 'Kühlung' }, cats: ['cpu_coolers', 'laptop_coolers', 'case_fans'] },
  { key: 'peripherals', title: { en: 'Peripherals', tr: 'Çevre Birimleri', de: 'Peripherie' }, cats: ['keyboards', 'mice', 'gamepads', 'gaming_consoles', 'webcams', 'microphones', 'printers', '3d_printers'] },
  { key: 'display_audio', title: { en: 'Display & Audio', tr: 'Ekran ve Ses', de: 'Display & Audio' }, cats: ['monitors', 'tvs', 'projectors', 'speakers', 'audio_systems', 'av_receivers', 'media_players'] },
  { key: 'photo_video', title: { en: 'Photo & Video', tr: 'Fotoğraf ve Video', de: 'Foto & Video' }, cats: ['camera_lenses', 'ip_cameras', 'dashcams', 'gimbals', 'drones'] },
  { key: 'network_home', title: { en: 'Network & Smart Home', tr: 'Ağ ve Akıllı Ev', de: 'Netzwerk & Smart Home' }, cats: ['routers', 'modem_routers', 'robot_vacuums', 'hardware_wallets'] },
];

export const CANONICAL_CATEGORY_ORDER = CANONICAL_CATEGORY_GROUPS.flatMap((g) => g.cats);

export function categoryLabel(category, lang = 'en') {
  const meta = catMeta(category);
  return lang === 'tr' ? (meta.tr || meta.label) : lang === 'de' ? (meta.de || meta.label) : meta.label;
}

// Turns an unknown slug like "cpu_coolers" into "Cpu Coolers".
function prettifySlug(slug) {
  return String(slug || 'Other')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function catMeta(category) {
  const key = (category || '').toLowerCase();
  return CATEGORY_META[key] || { icon: '📦', label: prettifySlug(category), color: '#2196F3' };
}

export function scoreClass(score) {
  const s = Number(score);
  if (!s || s <= 0) return 'score-na';
  if (s >= 75) return 'score-high';
  if (s >= 55) return 'score-mid';
  return 'score-low';
}

export function scoreLabel(score) {
  const s = Number(score);
  if (!s || s <= 0) return 'N/A';
  return Math.round(s);
}

export function formatCount(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M+';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K+';
  return String(n || 0);
}

// Lowest tracked price (USD). Returns '' when unknown so cards can hide it.
export function formatPrice(usd) {
  const n = Number(usd);
  if (!n || n <= 0) return '';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export const PRICE_COUNTRIES_BY_LANG = {
  tr: ['TR', 'DE', 'GB'],
  en: ['US', 'GB', 'CA', 'AU'],
  de: ['DE', 'AT', 'CH'],
  es: ['ES', 'MX', 'US'],
  fr: ['FR', 'BE', 'CA'],
  pt: ['PT', 'BR', 'ES', 'GB'],
  ru: ['RU', 'DE', 'GB'],
};

export const CURRENCY_BY_COUNTRY = {
  US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD',
  DE: 'EUR', AT: 'EUR', FR: 'EUR', BE: 'EUR', ES: 'EUR', IT: 'EUR', PT: 'EUR', NL: 'EUR',
  CH: 'CHF', PL: 'PLN', MX: 'MXN', BR: 'BRL', TR: 'TRY', RU: 'RUB',
};

export function safeExternalUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
  } catch {
    return '';
  }
}

function rollupPriceIsFresh(product) {
  const expires = Date.parse(product?.bestOfferExpiresAt || '');
  return Number.isFinite(expires) && expires > Date.now();
}

export function offerForLang(product, lang = 'en') {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const prices = product?.prices && typeof product.prices === 'object' ? product.prices : {};
  const links = product?.affiliateLinksByCountry && typeof product.affiliateLinksByCountry === 'object'
    ? product.affiliateLinksByCountry
    : {};
  const countries = PRICE_COUNTRIES_BY_LANG[code] || PRICE_COUNTRIES_BY_LANG.en;
  const priceFresh = rollupPriceIsFresh(product);
  for (const country of countries) {
    const price = Number(prices[country] ?? prices[country.toLowerCase()]);
    const stores = links[country] || links[country.toLowerCase()] || {};
    const link = Object.entries(stores).find(([, url]) => String(url || '').trim());
    if ((!price || price <= 0 || !priceFresh) && link) {
      return {
        price: 0,
        currency: CURRENCY_BY_COUNTRY[country] || 'USD',
        country,
        store: link[0] || product?.lowestOfferStore || '',
        url: safeExternalUrl(link[1] || product?.lowestOfferUrl || ''),
        stale: !priceFresh,
      };
    }
    if (!price || price <= 0 || !priceFresh) continue;
    return {
      price,
      currency: CURRENCY_BY_COUNTRY[country] || 'USD',
      country,
      store: link?.[0] || product?.lowestOfferStore || '',
      url: safeExternalUrl(link?.[1] || product?.lowestOfferUrl || ''),
    };
  }
  if (priceFresh && Number(product?.lowestPrice) > 0) {
    return {
      price: Number(product.lowestPrice),
      currency: product.lowestPriceCurrency || 'USD',
      country: '',
      store: product.lowestOfferStore || '',
      url: safeExternalUrl(product.lowestOfferUrl || ''),
    };
  }
  if (priceFresh && Number(product?.lowestPriceUSD) > 0) {
    return {
      price: Number(product.lowestPriceUSD),
      currency: 'USD',
      country: 'US',
      store: product.lowestOfferStore || '',
      url: safeExternalUrl(product.lowestOfferUrl || ''),
    };
  }
  return null;
}

export function formatLocalizedPrice(product, lang = 'en') {
  const offer = offerForLang(product, lang);
  if (!offer || !Number(offer.price)) return '';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: offer.currency || 'USD',
      maximumFractionDigits: 0,
    }).format(offer.price);
  } catch {
    return `${offer.currency || '$'} ${Number(offer.price || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
}

const clamp = (n) => Math.max(6, Math.min(100, Math.round(n)));

// Pulls the four headline specs (screen / RAM / storage / battery) from a
// product's Typesense fields — used for the epey-style inline spec rows.
// Each chip carries a 0–100 `pct` so cards can draw a relative mini bar.
export function keySpecChips(p) {
  const tokens = Array.isArray(p.filterTokens) ? p.filterTokens : [];
  const tokenVal = (prefix) => {
    const t = tokens.find((x) => x.startsWith(prefix));
    return t ? t.slice(prefix.length) : null;
  };
  const chips = [];

  if (p.screenSizeValue > 0) {
    chips.push({ labelKey: 'spec.screen', value: `${p.screenSizeValue}"`, pct: clamp((p.screenSizeValue / 7) * 100) });
  }

  const ram = tokenVal('ram:'); // e.g. "8_gb"
  if (ram) {
    const n = parseInt(ram, 10) || 0;
    chips.push({ labelKey: 'spec.ram', value: `${n} GB`, pct: clamp((n / 24) * 100) });
  }

  const storage = tokenVal('storage:'); // "256_gb" | "1_tb"
  if (storage) {
    const isTb = storage.includes('tb');
    const n = parseInt(storage, 10) || 0;
    const gb = isTb ? n * 1024 : n;
    chips.push({ labelKey: 'spec.storage', value: isTb ? `${n} TB` : `${n} GB`, pct: clamp((gb / 1024) * 100) });
  }

  if (p.batteryCapacityValue > 0) {
    chips.push({
      labelKey: 'spec.battery',
      value: `${p.batteryCapacityValue} mAh`,
      pct: clamp((p.batteryCapacityValue / 7000) * 100),
    });
  }
  return chips;
}

export const PLACEHOLDER_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2352525b' stroke-width='1.4'%3E%3Crect x='2' y='2' width='20' height='20' rx='3'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E";
