/**
 * Qor AI — model family key
 *
 * variantGroup = the MODEL (e.g. "lenovo-ideacentre-a340-24iwl").
 * configKey    = the CONFIGURATION inside it (CPU/RAM/storage…).
 *
 * modelFamilyKey() must strip every config-level token (CPU, GPU, RAM,
 * storage, resolution, screen, connectivity, OS, colour…) so all
 * configurations of one model collapse to the same variantGroup. The grouped
 * product list then shows one card per model.
 *
 * Shared by scripts/icecat_ingest.js and scripts/repair_variant_groups.js.
 */
'use strict';

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}

// Reseller / refurbisher "brands" — the same hardware sold under a trader
// name. Their brand must NOT taint the model key, or a "Forza Refurbished
// iPhone 15" would never group with the real "Apple iPhone 15".
const REFURBISHER_BRANDS = new Set([
  't1a', 'teqcycle', 'upcycle it', 'flex it', 'forza refurbished',
  'circular computing', 'origin storage', 'bluechip', 'zolyd', 'renewd',
  'forza', 'greenpanda', 'circular', 'refurbed', 'asgoodasnew',
]);
const JUNK_BRANDS = new Set(['qa_test', 'test', 'heat', 'unknown', 'noname', 'no name', 'n/a', 'oem']);
const isRefurbisherBrand = b => REFURBISHER_BRANDS.has(String(b || '').trim().toLowerCase());
const isJunkBrand = b => JUNK_BRANDS.has(String(b || '').trim().toLowerCase());

// Model lines whose identifier is "<line> <code>" — matched first for accuracy.
const FAMILY_PATTERNS = [
  /\b(thinkpad\s+[a-z]\d+[a-z0-9]*(?:\s+gen\s+\d+)?)\b/i,
  /\b(thinkbook\s+\d+\s+g\d+[a-z]*(?:\s+[a-z]{2,4})?)\b/i,
  /\b(thinkbook\s+[a-z0-9]+(?:\s+gen\s+\d+)?)\b/i,
  /\b(thinkcentre\s+[a-z]+\d+[a-z0-9-]*)\b/i,
  /\b(thinkstation\s+[a-z]+\d+[a-z0-9-]*)\b/i,
  /\b(ideapad\s+\d+\s+pro)\b/i,
  /\b(ideapad\s+\d+\s+2[\s-]?in[\s-]?1)\b/i,
  /\b(ideapad\s+\d+\s+slim)\b/i,
  /\b(ideapad\s+\d+)\b/i,
  /\b(ideapad\s+[a-z0-9]+(?:\s+\d+[a-z0-9-]*)?(?:\s+gen\s+\d+)?)\b/i,
  /\b(v\d{2}\s+g\d+)\b/i,
  /\b(ideacentre\s+aio\s+\d+[a-z0-9]*)\b/i,
  /\b(ideacentre\s+[a-z]?\d{3})[-\s]?[a-z0-9]*\b/i,
  /\b(ideacentre\s+[a-z]*\d+[a-z0-9-]*)\b/i,
  /\b(legion\s+pro\s+\d+[a-z0-9-]*(?:\s+gen\s+\d+)?)\b/i,
  /\b(legion\s+[a-z0-9]+(?:\s+gen\s+\d+)?)\b/i,
  /\b(yoga\s+[a-z0-9]+(?:\s+gen\s+\d+)?)\b/i,
  /\b(elitebook\s+\d+\s*g\d+)\b/i,
  /\b(\d{3}\s+g\d+)\b/i,
  /\b(probook\s+\d+\s*g\d+)\b/i,
  /\b(zbook\s+[a-z0-9]+\s*g\d+)\b/i,
  /\b(pavilion\s+[a-z0-9-]+)\b/i,
  /\b(victus\s+[a-z0-9-]+)\b/i,
  /\b(omen\s+[a-z0-9-]+)\b/i,
  /\b((?:envy|spectre|omnibook)\s+[a-z0-9-]+)\b/i,
  /\b(latitude\s+\d+[a-z0-9-]*)\b/i,
  /\b((?:inspiron|vostro|precision)\s+\d+[a-z0-9-]*)\b/i,
  /\b(xps\s+\d+[a-z0-9-]*)\b/i,
  /\b(aspire\s+[a-z0-9-]+)\b/i,
  /\b((?:swift|spin|nitro|predator|travelmate|extensa)\s+[a-z0-9-]+)\b/i,
  /\b((?:vivobook|zenbook|expertbook|proart)\s+[a-z0-9-]+)\b/i,
  /\b(rog\s+[a-z0-9-]+)\b/i,
  // suffix may repeat ("S24 Ultra", "iPhone 15 Pro Max") — "+" is normalised
  // to " plus " before matching so S24 and S24+ never collapse together.
  /\b(galaxy\s+(?:s|z|a|m|tab|note|xcover)\s*\d+[a-z]*(?:\s+(?:ultra|plus|fe|fold|flip|edge))*)/i,
  /\b(iphone\s+(?:se\s+)?\d+[a-z]*(?:\s+(?:pro|max|plus|mini))*)/i,
  /\b(redmi\s+note\s+\d+[a-z]*(?:\s+(?:pro\s+plus|pro|plus|ultra|5g))*)/i,
  /\b(redmi\s+\d+[a-z]*(?:\s+(?:pro\s+plus|pro|plus|ultra|5g))*)/i,
  /\b(poco\s+[a-z]\d+[a-z]*(?:\s+(?:pro\s+plus|pro|plus|ultra|5g))*)/i,
  /\b(oppo\s+(?:reno\s*)?\d+[a-z]*(?:\s+(?:pro|se|plus|lite|5g))*)/i,
  /\b(oppo\s+a\d+[a-z]*(?:\s+(?:pro|se|plus|lite|5g))*)/i,
  /\b(honor\s+\d+[a-z]*(?:\s+(?:pro|lite|x|5g|max|plus))*)/i,
  /\b(spark\s+\d+[a-z]*(?:\s+(?:air|pro|plus|go|5g))*)/i,
  /\b(redmi\s+pad(?:\s+se)?(?:\s+\d+(?:[.,]\d+)?)?(?:\s+pro)?)/i,
  /\b(watch\s+s?\d+(?:\s+\d+\s*mm)?)/i,
  /\b(smart\s+band\s+\d+)/i,
  /\b(redmi\s+smart\s+band\s+\d+)/i,
  /\b(ipad\s+(?:pro|air|mini)?(?:\s+\d+(?:[.,]\d+)?)?(?:\s*-\s*\d+\.\s*generation)?(?:\s*\/\s*\d{4})?(?:\s+a\d+\s*pro)?)/i,
  /\b(surface\s+(?:pro|laptop|go|book|studio)?\s*\d*)\b/i,
  /\b(the\s+frame\s+pro)\b/i,
  /\b(the\s+frame)\b/i,
  /\b(go\s+\d+)(?:\s+(?:duo|mono|portable|speaker))*\b/i,
  /\b(clip\s+\d+)(?:\s+(?:portable|speaker))*\b/i,
  /\b(charge\s+\d+)(?:\s+(?:portable|speaker))*\b/i,
  /\b(flip\s+\d+)(?:\s+(?:portable|speaker))*\b/i,
  /\b(b760m\s+[a-z0-9]+(?:\s+[a-z0-9]+)?)\b/i,
];

// Config-level noise removed by the generic fallback.
const STRIP = [
  /\[([^\]]*)\]/g,
  /\((?:intel|amd|qualcomm|apple|nvidia)\)/gi,
  /\b\d+(?:[.,]\d+)?\s*cm\b/gi,
  /\(\s*\d+(?:[.,]\d+)?\s*(?:"|inch|zoll)\s*\)/gi,
  /\b\d+(?:[.,]\d+)?\s*(?:"|inch|zoll)\b/gi,
  /\b\d+\s*(?:gb|tb|mb)\b/gi,
  /\b\d+\s*\/\s*\d+\b/g,
  /\b\d+\s*mah\b/gi,
  // CPUs — Core Ultra, Core i3-i9, plus the bare model number Icecat repeats
  /\b(?:intel\s+)?core\s+(?:ultra\s+)?[3579]\s+[a-z0-9-]+\b/gi,
  /\b(?:intel\s+)?core\s+i[3579][- ]?[a-z0-9-]*\b/gi,
  /\b(?:intel\s+)?core\s+i[3579]\b/gi,
  /\bi[3579][- ]?\d{3,5}[a-z]*\b/gi,
  /\b(?:amd\s+)?ryzen\s+(?:ai\s+)?[3579]\s+(?:pro\s+)?[a-z0-9-]+\b/gi,
  /\b(?:intel\s+)?(?:celeron|pentium|xeon|atom)\s+[a-z]?\d+[a-z]*\b/gi,
  /\b(?:amd\s+)?athlon\s+[a-z0-9-]+\b/gi,
  /\b(?:intel\s+)?core\s+[3579]\s+\d{3,4}[a-z]*\b/gi,
  /\b(?:snapdragon|mediatek|dimensity|exynos|tensor)\s+[a-z0-9-]+\b/gi,
  // GPUs
  /\b(?:amd\s+)?radeon\s+[a-z0-9 ]*\d+[a-z0-9]*\b/gi,
  /\b(?:nvidia\s+)?(?:geforce\s+)?(?:gtx|rtx|mx)\s*\d+[a-z0-9 ]*\b/gi,
  /\b(?:intel\s+)?(?:iris\s+xe|uhd|hd)\s+graphics\b/gi,
  // memory / storage tech
  /\b(?:ddr\d|lpddr\d[x]?|sdram|ssd|hdd|nvme|emmc|wuxga|wqxga|wqhd|fhd\+?|uhd|qhd|hd\+)\b/gi,
  // resolution
  /\b\d{3,4}\s*[x×]\s*\d{3,4}\b/gi,
  /\bpixels?\b/gi,
  // screen / form factor
  /\b(?:touchscreen|touch|all[\s-]?in[\s-]?one|convertible|2[\s-]?in[\s-]?1)\b/gi,
  // connectivity
  /\b(?:dual\s*sim|single\s*sim|sim-free|usb\s*type[- ]?c|usb-?c|usb\s*\d|5g|4g|lte|wi-?fi\s*\d*[a-z]*|wlan|bluetooth)\b/gi,
  /\b802\.?11\s*[a-z/]*\b/gi,
  // OS
  /\bandroid\s*\d+(?:[.,]\d+)?\b/gi,
  /\b(?:windows|win)\s*\d+(?:[.,]\d+)?(?:\s*(?:pro|home|enterprise|s))?\b/gi,
  /\b(?:windows|macos|mac\s*os|linux|freebsd|free\s*dos|chrome\s*os|no\s*os)\b/gi,
  /\b(?:laptop|notebook|desktop|computer)\b/gi,
  // languages / colours / regions
  /\b(?:spanish|german|french|italian|english|turkish|dutch|polish|portuguese|swedish|arabic|japanese|ispanyolca|almanca|fransizca|fransızca|italyanca|ingilizce|turkce|türkçe)\b/gi,
  /\b(?:black|white|silver|gold|blue|navy|purple|violet|pink|red|green|gray|grey|cream|graphite|lavender|wood|bordeaux|midnight|starlight|titanium|anthracite|carbon|schwarz|weiß|weiss|silber|blau|grün|gruen|creme|grau|siyah|beyaz|yeşil|yesil|gri|mavi|kırmızı|kirmizi|mor|pembe|sarı|sari)\b/gi,
  /\b(?:orange|sand|camouflage|camo|beige|khaki|mint|aqua|turquoise|teal|coral|brown|bronze|copper|natural|ivory)\b/gi,
  /\b(?:de|uk|us|eu|pl|fr|it|es|gb|nl|be|at|ch)\b/gi,
  /\b\d+(?:[.,]\d+)?\s*w\b/gi,
  /\bcopilot\+?\s*pc\b/gi,
];

function modelFamilyKey({ name, brand, category }) {
  let s = String(name || '').toLowerCase();
  const b = String(brand || '').toLowerCase().trim();
  if (b) s = s.replace(new RegExp(`^${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '');

  // "+" carries meaning (S24 vs S24+) — turn it into a word so \b patterns see it.
  const probe = s.replace(/\+/g, ' plus ').replace(/[()[\],"'’]/g, ' ').replace(/\s+/g, ' ').trim();
  // Pattern names (thinkpad, iphone, ideacentre…) are brand-exclusive, so the
  // key needs no brand — and dropping it lets refurbisher rebrands collapse
  // into the real model.
  for (const re of FAMILY_PATTERNS) {
    const m = probe.match(re);
    if (m && m[1]) {
      const fam = slugify(m[1]);
      if (fam) return fam.slice(0, 180);
    }
  }
  if (b === 'oppo') {
    const m = probe.match(/\b((?:reno\s*)?\d+[a-z]*(?:\s+(?:pro|se|plus|lite|5g))*|a\d+[a-z]*(?:\s+(?:pro|se|plus|lite|5g))*)\b/i);
    if (m && m[1]) return slugify(`oppo ${m[1]}`).slice(0, 180);
  }
  // MacBook needs the chip kept (Air/Pro M1…M4 are distinct models).
  const mac = probe.match(/\b(macbook\s+(?:air|pro)(?:\s+\d+(?:[.,]\d+)?)?)/i);
  if (mac) {
    const chip = probe.match(/\b(m\d+(?:\s*(?:pro|max|ultra))?)\b/i);
    const fam = slugify(`${mac[1]} ${chip ? chip[1] : ''}`);
    if (fam) return fam.slice(0, 180);
  }

  for (const re of STRIP) s = s.replace(re, ' ');
  s = s
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  // Generic fallback keeps the brand (cleaned names can collide across
  // brands) — except for refurbishers, whose trader name must not taint it.
  const keyBrand = isRefurbisherBrand(b) ? '' : b;
  const base = [keyBrand, s].filter(Boolean).join('-').slice(0, 180);
  return base || slugify(name) || slugify(category);
}

module.exports = { modelFamilyKey, slugify, isRefurbisherBrand, isJunkBrand, REFURBISHER_BRANDS, JUNK_BRANDS };
