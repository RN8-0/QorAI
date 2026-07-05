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
  { key: 'mobile', title: { en: 'Mobile', tr: 'Mobil', de: 'Mobil' }, cats: ['smartphones', 'smartwatches', 'smart_rings', 'headphones', 'powerbanks', 'chargers'] },
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

// Amazon storefront routing. CURL-PROVEN 2026-07-05 (no JS, no cookies, no
// Skimlinks): Amazon's server-side Earn Globally router 302s ANY amazon.* URL
// carrying our ?tag= to the storefront nearest the VISITOR's IP (a TR IP gets
// amazon.it + linkCode=gg3) — no matter which storefront the link names, even
// amazon.de → amazon.it. Untagged URLs are NEVER redirected. Therefore the
// selected storefront is enforced through TAG PRESENCE: the tag stays only
// when Amazon's router would leave this visitor's click alone (their own
// storefront, or Amazon's known redirect target for their country); on any
// other cross-geo pick the tag is dropped so the user lands EXACTLY on the
// storefront they chose. Strict country rule: landing correctness beats
// commission on mismatched clicks.
const AMAZON_DOMAIN = {
  US: 'www.amazon.com', GB: 'www.amazon.co.uk', DE: 'www.amazon.de',
  FR: 'www.amazon.fr', IT: 'www.amazon.it', ES: 'www.amazon.es',
  CA: 'www.amazon.ca', TR: 'www.amazon.com.tr',
  NL: 'www.amazon.nl', PL: 'www.amazon.pl', SE: 'www.amazon.se',
};
const AMAZON_FLAG = {
  US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', CA: '🇨🇦', TR: '🇹🇷',
  NL: '🇳🇱', PL: '🇵🇱', SE: '🇸🇪',
};
// All storefronts the qorai-20 store earns from via Earn Globally (plus the
// separate TR program). Drives the product-page ship-to selector.
export const AMAZON_ONELINK_COUNTRIES = ['TR', 'DE', 'GB', 'US', 'FR', 'IT', 'ES', 'NL', 'PL', 'SE', 'CA'];
export function countryDisplayName(code, lang = 'en') {
  try {
    const dn = new Intl.DisplayNames([lang === 'tr' ? 'tr' : lang === 'de' ? 'de' : 'en'], { type: 'region' });
    return dn.of(String(code || '').toUpperCase()) || code;
  } catch {
    return code;
  }
}
// Tag is per-program: amazon.com.tr is its own TR Associates program (qorai-21);
// every OneLink storefront rides the single qorai-20 store ID.
const AMAZON_TAG_BY_MARKET = { TR: 'qorai-21' };
const AMAZON_DEFAULT_TAG = 'qorai-20';
// Single-storefront redirect target per language (used by /go).
const AMAZON_MARKET_BY_LANG = {
  tr: 'DE', en: 'US', de: 'DE', fr: 'FR', it: 'IT', es: 'ES', pt: 'ES', ru: 'DE',
};
// Languages that surface MULTIPLE storefront buttons on the product page.
// Turkish gets both the local TR store (TL, domestic shipping) and DE (wider
// GTIN coverage, ships intl). Other languages use the single redirect below.
const AMAZON_STOREFRONTS_BY_LANG = { tr: ['TR', 'DE'] };

export function localizeAmazonUrl(url, lang = 'en', visitorCountry = '') {
  const raw = safeExternalUrl(url);
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    if (!/(^|\.)amazon\./i.test(u.hostname)) return raw;
    const code = String(lang || 'en').slice(0, 2).toLowerCase();
    const market = AMAZON_MARKET_BY_LANG[code] || 'US';
    if (AMAZON_DOMAIN[market]) u.hostname = AMAZON_DOMAIN[market];
    setAmazonTag(u, market, visitorCountry);
    return u.toString();
  } catch {
    return raw;
  }
}

// Keep an Amazon URL on the storefront it ALREADY points at and only decide
// the affiliate tag: set it when Amazon's geo-router will leave this visitor
// alone, strip it otherwise so the server-side gg3 302 cannot move the click
// to another country's storefront. Used by /go for stored offers — the offer's
// own domain IS the ship-to country its row was rendered under, so unlike
// localizeAmazonUrl the domain must never be rewritten here.
export function amazonTagUrl(url, visitorCountry = '') {
  const raw = safeExternalUrl(url);
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    if (!/(^|\.)amazon\./i.test(u.hostname)) return raw;
    const market = AMAZON_MARKET_BY_HOST[u.hostname.replace(/^www\./i, '').toLowerCase()] || '';
    setAmazonTag(u, market, visitorCountry);
    return u.toString();
  } catch {
    return raw;
  }
}

// Returns multiple storefront targets for languages configured with more than
// one (currently Turkish → [TR, DE]). Returns [] for single-storefront
// languages so callers fall back to the localizeAmazonUrl redirect.
export function amazonStorefrontsForLang(url, lang = 'en', visitorCountry = '') {
  const raw = safeExternalUrl(url);
  if (!raw) return [];
  let u;
  try { u = new URL(raw); } catch { return []; }
  if (!/(^|\.)amazon\./i.test(u.hostname)) return [];
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const markets = AMAZON_STOREFRONTS_BY_LANG[code];
  if (!markets || markets.length < 2) return [];
  return markets.map((m) => {
    const nu = new URL(raw);
    if (AMAZON_DOMAIN[m]) nu.hostname = AMAZON_DOMAIN[m];
    setAmazonTag(nu, m, visitorCountry);
    return { market: m, flag: AMAZON_FLAG[m] || '', url: nu.toString() };
  });
}

// Build an Amazon search query straight from the product (mirrors the offer
// connector's buildKeywordQuery). This lets EVERY product — primary or variant,
// with or without a GTIN — get a working Amazon link without depending on the
// offers collection (variants never get their own offer row).
function amazonQueryForProduct(p) {
  const gtin = String(p?.gtin || '').trim();
  if (gtin) return gtin;
  let name = String(p?.name || '').replace(/\s+/g, ' ').trim();
  const cut = name.search(/\s(?:\d+(?:[.,]\d+)?\s*(?:cm|mm|inch|gb|tb|ghz|mhz|mah|wh|w)\b|\(\d|dual\s*sim|single\s*sim|android|wi-?fi|bluetooth)/i);
  if (cut > 10) name = name.slice(0, cut).trim();
  const brand = String(p?.brand || '').trim();
  const brandFirst = brand.split(/\s+/)[0] || '';
  if (brandFirst && !name.toLowerCase().startsWith(brandFirst.toLowerCase())) {
    name = `${brand} ${name}`.trim();
  }
  return name.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function amazonMarketUrl(market, query, visitorCountry) {
  const host = AMAZON_DOMAIN[market] || AMAZON_DOMAIN.US;
  const base = `https://${host}/s?k=${encodeURIComponent(query)}&i=electronics`;
  if (!amazonTagAllowed(market, visitorCountry)) return base;
  const tag = AMAZON_TAG_BY_MARKET[market] || AMAZON_DEFAULT_TAG;
  return `${base}&tag=${encodeURIComponent(tag)}`;
}

// Storefront button(s) for a product. Turkish gets two (TR + DE); every other
// language gets the single storefront mapped to its locale.
export function amazonStorefrontsForProduct(product, lang = 'en') {
  const query = amazonQueryForProduct(product);
  if (!query) return [];
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const markets = AMAZON_STOREFRONTS_BY_LANG[code] || [AMAZON_MARKET_BY_LANG[code] || 'US'];
  return markets.map((m) => ({
    market: m,
    flag: AMAZON_FLAG[m] || '',
    url: amazonMarketUrl(m, query),
  }));
}

// Map a visitor country to the Amazon storefront we earn on. OneLink covers
// US/GB/DE/FR/IT/ES/CA on qorai-20; Turkey has its own program (qorai-21).
// Countries outside coverage fall back to the nearest in-coverage store.
const AMAZON_COUNTRY_TO_MARKET = {
  TR: 'TR', US: 'US', GB: 'GB', DE: 'DE', FR: 'FR', IT: 'IT', ES: 'ES', CA: 'CA',
  NL: 'NL', PL: 'PL', SE: 'SE',
  AT: 'DE', CH: 'DE', BE: 'FR', LU: 'FR', IE: 'GB', PT: 'ES',
  DK: 'SE', NO: 'SE', FI: 'SE', CZ: 'PL',
  AU: 'GB', NZ: 'GB', MX: 'US',
};

// Where Amazon's Earn-Globally router actually SENDS visitors from countries
// outside its marketplace set (curl-proven per entry, 2026-07-05: tagged
// amazon.it stays put for a TR IP while every other tagged storefront 302s
// there). A tagged link to this storefront survives for that visitor, so the
// tag — and the commission — can be kept.
const AMAZON_EG_TARGET = { TR: 'IT' };

// Hostname (minus www.) → market, for tagging stored offer URLs in place.
const AMAZON_MARKET_BY_HOST = Object.fromEntries(
  Object.entries(AMAZON_DOMAIN).map(([m, h]) => [h.replace(/^www\./, ''), m]),
);

// May a link to `market` carry our affiliate tag for this visitor WITHOUT the
// gg3 geo-router moving the click to another storefront? True when the
// visitor's own storefront (or Amazon's known redirect target for them) is the
// linked one. Unknown/blank geo keeps the tag: the probe almost never fails
// (Cloudflare trace + ipwho.is) and zeroing every commission on a failed probe
// is worse than one rare bounce. Unmapped exotic geos drop the tag — Amazon
// would bounce them somewhere we can't predict, and the landing storefront
// must stay deterministic.
export function amazonTagAllowed(market, visitorCountry) {
  const m = String(market || '').toUpperCase();
  const geo = String(visitorCountry || '').toUpperCase();
  if (!geo || !m) return true;
  return AMAZON_COUNTRY_TO_MARKET[geo] === m || AMAZON_EG_TARGET[geo] === m;
}

// Set or strip the ?tag= on an Amazon URL object per amazonTagAllowed.
function setAmazonTag(u, market, visitorCountry) {
  if (market && amazonTagAllowed(market, visitorCountry)) {
    u.searchParams.set('tag', AMAZON_TAG_BY_MARKET[market] || AMAZON_DEFAULT_TAG);
  } else {
    u.searchParams.delete('tag');
  }
}

// Single Amazon link for a product, routed to the visitor's country store.
export function amazonUrlForProduct(product, country = 'US') {
  const query = amazonQueryForProduct(product);
  if (!query) return '';
  const market = AMAZON_COUNTRY_TO_MARKET[String(country || 'US').toUpperCase()] || 'US';
  return amazonMarketUrl(market, query);
}

// Internal /go link for an Amazon search. Two reasons to never render a raw
// amazon.* href: (1) site-wide link rewriters (Skimlinks) can touch external
// hrefs, and (2) the TR→amazon.it bounce turned out to be Amazon's OWN
// server-side gg3 router triggered by the ?tag= param (curl-proven 2026-07-05,
// see the routing note above AMAZON_DOMAIN) — so /go must resolve the
// visitor's geo FIRST and only then emit a tagged or untagged URL for the
// chosen storefront.
export function amazonGoPath(product, country = 'US') {
  const query = amazonQueryForProduct(product);
  if (!query) return '';
  const market = AMAZON_COUNTRY_TO_MARKET[String(country || 'US').toUpperCase()] || 'US';
  return `/go?store=amazon&m=${encodeURIComponent(market)}&q=${encodeURIComponent(query)}`;
}

// Rebuild the Amazon URL on /go from whitelisted params (market must be a known
// storefront — guards against open-redirect since we never pass a raw URL).
// visitorCountry gates the affiliate tag (see amazonTagAllowed): cross-geo
// picks go untagged so Amazon's gg3 router can't override the chosen store.
export function amazonUrlFromParams(market, query, visitorCountry) {
  const m = String(market || '').toUpperCase();
  const q = String(query || '').trim();
  if (!AMAZON_DOMAIN[m] || !q) return '';
  return amazonMarketUrl(m, q, visitorCountry);
}

function rollupPriceIsFresh(product) {
  const expires = Date.parse(product?.bestOfferExpiresAt || '');
  return Number.isFinite(expires) && expires > Date.now();
}

// Price for ONE specific country (the visitor's detected country), used on
// list/home cards. Unlike offerForLang it never falls back to another market —
// a TR visitor only sees a price if the product actually has a fresh TR offer,
// never a DE price they can't order.
export function priceForCountry(product, country) {
  const cc = String(country || '').toUpperCase();
  if (!cc) return null;
  if (!rollupPriceIsFresh(product)) return null;
  const prices = product?.prices && typeof product.prices === 'object' ? product.prices : {};
  const raw = Number(prices[cc] ?? prices[cc.toLowerCase()]);
  if (!(raw > 0)) return null;
  return { price: raw, currency: CURRENCY_BY_COUNTRY[cc] || 'USD', country: cc };
}

export function formatPriceAmount(price, currency, lang = 'en') {
  const n = Number(price) || 0;
  if (n <= 0) return '';
  try {
    return new Intl.NumberFormat(lang, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency || 'USD'} ${n.toLocaleString(lang, { maximumFractionDigits: 0 })}`;
  }
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
// Categories where a generic "system RAM" / "system storage" chip is a real,
// meaningful spec. For COMPONENTS (a RAM module, an SSD, a CPU/GPU…) the
// filterToken-derived ram/storage chip is either nonsensical or wrong — e.g. a
// 48 GB RAM module was showing a bogus "1 GB RAM" chip — so we suppress it and
// let the product's real specs (Bellek Kapasitesi, Bellek Hızı…) show instead.
const RAM_CHIP_CATEGORIES = new Set([
  'smartphones', 'tablets', 'laptops', 'desktops', 'gaming_consoles', 'consoles',
  'smartwatches', 'e_readers', 'e-readers',
]);
const STORAGE_CHIP_CATEGORIES = new Set([
  'smartphones', 'tablets', 'laptops', 'desktops', 'gaming_consoles', 'consoles',
  'e_readers', 'e-readers', 'ssd', 'flash_drives',
]);

export function keySpecChips(p) {
  const tokens = Array.isArray(p.filterTokens) ? p.filterTokens : [];
  const category = String(p.category || '').toLowerCase();
  const tokenVal = (prefix) => {
    const t = tokens.find((x) => x.startsWith(prefix));
    return t ? t.slice(prefix.length) : null;
  };
  const chips = [];

  const screenSize = Number(p.screenSizeValue) || 0;
  if (screenSize > 0 && screenSize <= 120) {
    chips.push({ labelKey: 'spec.screen', value: `${screenSize}"`, pct: clamp((screenSize / 7) * 100) });
  }

  const ram = tokenVal('ram:'); // e.g. "8_gb"
  if (ram && RAM_CHIP_CATEGORIES.has(category)) {
    const n = parseInt(ram, 10) || 0;
    if (n > 0) chips.push({ labelKey: 'spec.ram', value: `${n} GB`, pct: clamp((n / 24) * 100) });
  }

  const storage = tokenVal('storage:'); // "256_gb" | "1_tb"
  if (storage && STORAGE_CHIP_CATEGORIES.has(category)) {
    const isTb = storage.includes('tb');
    const n = parseInt(storage, 10) || 0;
    const gb = isTb ? n * 1024 : n;
    if (n > 0) chips.push({ labelKey: 'spec.storage', value: isTb ? `${n} TB` : `${n} GB`, pct: clamp((gb / 1024) * 100) });
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
