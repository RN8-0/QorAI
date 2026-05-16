/**
 * Qor AI — product configuration key
 *
 * Two Icecat products are the SAME comparable device when they differ only by
 * colour, reseller/brand rebrand, keyboard layout / language, region or OS
 * edition — but a DIFFERENT device when CPU, RAM, storage, GPU or screen
 * differ. configKey() collapses the former and keeps the latter, so the
 * catalog holds one row per real configuration (versus.com style).
 *
 * Shared by scripts/dedupe_configs.js and scripts/icecat_ingest.js — keep the
 * logic in one place so cleanup and live ingestion agree.
 */
'use strict';

// Reseller / refurbisher "brands" — the same hardware sold under a trader
// name. Treated as non-canonical so a real-manufacturer row always wins.
const REFURBISHER_BRANDS = new Set([
  't1a', 'teqcycle', 'upcycle it', 'flex it', 'forza refurbished',
  'circular computing', 'origin storage', 'bluechip', 'zolyd', 'renewd',
  'forza', 'greenpanda', 'circular', 'refurbed', 'asgoodasnew',
]);
const JUNK_BRANDS = new Set(['qa_test', 'test', 'heat', 'unknown', 'noname', 'no name', 'n/a', 'oem']);

// Cosmetic tokens that never make a device a different product.
const COSMETIC = [
  // colours (EN / DE / TR / common)
  'black','white','silver','gold','blue','navy','purple','violet','pink','red','green',
  'gray','grey','cream','graphite','lavender','wood','bordeaux','midnight','starlight',
  'titanium','anthracite','carbon','storm','cosmos','cosmic','abyss','aqua','beige','bronze',
  'schwarz','weiss','weiß','silber','blau','gruen','grün','creme','grau','rot','rosa','gelb',
  'siyah','beyaz','yesil','yeşil','gri','mavi','kirmizi','kırmızı','mor','pembe','sari','sarı',
  'altin','altın','gumus','gümüş','lacivert',
  // languages / keyboard layouts
  'spanish','german','french','italian','english','turkish','dutch','polish','portuguese',
  'swedish','arabic','japanese','nordic','danish','norwegian','finnish','czech','hungarian',
  'greek','romanian','bulgarian','slovak','slovenian','croatian','russian','ukrainian',
  'deutsch','espanol','español','francais','français','italiano','portugues','português',
  'svenska','nederlands','ispanyolca','almanca','fransizca','fransızca','italyanca',
  'ingilizce','turkce','türkçe','hollandaca','qwertz','azerty','qwerty',
  // region codes
  'de','uk','us','eu','pl','fr','it','es','se','gb','nl','be','at','ch','dk','no','fi',
  'cz','hu','emea','row','int','intl','ww',
  // reseller / refurbish noise
  'refurbished','refurb','renew','renewed','recertified','certified','pre-owned',
  'preowned','reconditioned','grade','bulk','oem',
];
const COSMETIC_RE = new RegExp('\\b(' + COSMETIC.join('|') + ')\\b', 'gi');
// OS phrases: "Windows 11 Pro", "Windows 10 Home", "Win11", "macOS"…
const OS_RE = /\b(windows|win|macos|mac os|chrome ?os|free ?dos|dos|ubuntu|linux)\s*\d*(\.\d+)?\s*(pro|home|enterprise|education|professional|s mode|n)?\b/gi;

/** Normalised configuration key — same string ⇒ same comparable device. */
function configKey(name, brand) {
  let s = String(name || '').toLowerCase();
  const b = String(brand || '').toLowerCase().trim();
  if (b) s = s.replace(new RegExp('^' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), '');
  s = s
    .replace(/[()\[\],"'’]/g, ' ')
    .replace(OS_RE, ' ')
    .replace(COSMETIC_RE, ' ')
    // standalone "wi-fi 6e (802.11ax)" style noise stays — it's model-level,
    // not config-level, and is identical across a family so it's harmless.
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.slice(0, 230);
}

function isRefurbisherBrand(brand) {
  return REFURBISHER_BRANDS.has(String(brand || '').trim().toLowerCase());
}
function isJunkBrand(brand) {
  return JUNK_BRANDS.has(String(brand || '').trim().toLowerCase());
}

module.exports = { configKey, isRefurbisherBrand, isJunkBrand, REFURBISHER_BRANDS, JUNK_BRANDS };
