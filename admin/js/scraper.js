// ═══════════════════════════════════════════════════════════════════
//  QOR AI SCRAPER MODULE — geizhals.eu Scraper
//  Scrapes products from geizhals.eu via local Puppeteer proxy.
//  Translates German → 12 languages using DeepSeek v3 + dictionary cache.
//  Uses QorAiCategories / QorAiBrands (categories.js).
//  Persists to PocketBase via pb_client.js helpers.
// ═══════════════════════════════════════════════════════════════════

const PROXY_URL = 'http://localhost:3456';
const GEIZHALS_BASE = 'https://geizhals.eu';
const PROXY_START_COMMAND = 'npm run scraper:proxy';
const SCRAPER_BUILD = '20260513v11-perline-atoms-dictui';
// EU-wide listing: matches kategoriler.txt format, maximises inventory and
// reduces per-country Cloudflare gatekeeping that was causing 502 loops.
const GEIZHALS_LISTING_EXTRA = 'pagesize=30&hloc=at&hloc=de&hloc=eu&hloc=pl&hloc=uk';
const DEEPSEEK_URL = '/api/ai/deepseek';
const DEEPSEEK_MODEL = 'deepseek-chat'; // v3 model for cost-effective translation
const SUPPORTED_LANGS = ['en','de','tr','es','fr','it','ja','nl','pl','pt','sv','ar'];
// Languages to translate German specs into (skip de since source is German)
const TARGET_LANGS = ['en','tr','es','fr','it','ja','nl','pl','pt','sv','ar'];

let scraperRunning = false;
let scraperAbort = false;
let _scrapeStartTime = null;
let _scrapeProductCount = 0;
let _proxyPollTimer = null;

// Pending untranslated Turkish terms (shared with dictionary.js collectUntranslatedTerms)
const _pendingAITerms = new Set();

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════
//  1. LOGGING & PROGRESS
// ═══════════════════════════════════════

function slog(msg, type = 'info') {
  const el = document.getElementById('scraperLog');
  if (!el) { console.log(`[scraper:${type}]`, msg); return; }
  const ts = new Date().toLocaleTimeString();
  const colors = {
    info: 'var(--text2)', success: 'var(--green)',
    error: 'var(--red)', warn: 'var(--amber)'
  };
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' };
  const escaped = escHtml(msg);
  el.innerHTML += `<div class="slog-line" style="color:${colors[type] || colors.info}">[${ts}] ${icons[type] || ''} ${escaped}</div>`;
  el.scrollTop = el.scrollHeight;
}

function clearScraperLog() {
  const el = document.getElementById('scraperLog');
  if (el) el.innerHTML = '<div class="text-muted" style="padding:12px">Log cleared.</div>';
  const pg = document.getElementById('scraperProgress');
  if (pg) pg.textContent = '';
}

function updateProgress(current, total, label) {
  const pg = document.getElementById('scraperProgress');
  if (!pg) return;
  let eta = '';
  if (_scrapeStartTime && current > 1 && total > 1) {
    const elapsed = (Date.now() - _scrapeStartTime) / 1000;
    const avgPer = elapsed / (current - 1);
    const remaining = avgPer * (total - current);
    if (remaining > 60) {
      eta = ` · ETA ${(remaining / 60).toFixed(1)}m`;
    } else {
      eta = ` · ETA ${remaining.toFixed(0)}s`;
    }
  }
  pg.textContent = `${label}: ${current}/${total}${eta}`;
}

// ═══════════════════════════════════════
//  2. HELPERS
// ═══════════════════════════════════════

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function parseHTML(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function slugFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const parts = path.split('/').filter(Boolean);
    let last = parts[parts.length - 1] || '';
    last = last.replace(/\.html$/i, '');
    return last;
  } catch { return ''; }
}

function categorySlugFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const parts = path.split('/').filter(Boolean);
    return parts[0] || '';
  } catch { return ''; }
}

function normalizeCategoryToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\.html$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function findCategoryByGeizhalsUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url, GEIZHALS_BASE);
    // New ?cat= format
    const catParam = u.searchParams.get('cat');
    if (catParam && typeof QorAiCategories !== 'undefined') {
      const all = QorAiCategories.getAll();
      const found = all.find(c => c.geizhalsSlug === catParam);
      if (found) return found;
    }
    // Old path format: https://geizhals.eu/<cat-slug>
    const parts = u.pathname.split('/').filter(Boolean);
    const catSlug = parts[0] || '';
    if (typeof QorAiCategories !== 'undefined') {
      const all = QorAiCategories.getAll();
      const found = all.find(c => c.id === catSlug || (c.geizhalsSlug && c.geizhalsSlug === catSlug));
      if (found) return found;
    }
    return null;
  } catch { return null; }
}

function productUrlMatchesCategory(url, categoryId) {
  if (!url || !categoryId) return false;
  const slug = categorySlugFromUrl(url);
  const catDef = (typeof QorAiCategories !== 'undefined')
    ? QorAiCategories.getAll().find(c => c.id === categoryId || c.geizhalsSlug === categoryId)
    : null;
  const expected = catDef?.geizhalsSlug || categoryId;
  return slug === expected;
}

function normalizeGeizhalsProductUrl(url) {
  try {
    const u = new URL(url, GEIZHALS_BASE);
    return `${GEIZHALS_BASE}${u.pathname}`;
  } catch {
    return '';
  }
}


// ═══════════════════════════════════════
//  3. PROXY FETCH WITH RETRY
// ═══════════════════════════════════════

async function checkProxy() {
  const el = document.getElementById('proxyStatus');
  const card = document.getElementById('proxyInfoCard');
  try {
    const res = await fetch(`${PROXY_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      if (el) el.innerHTML = '<span style="color:var(--green)">● Proxy: Connected</span>';
      if (card) card.style.display = 'none';
      return true;
    }
  } catch {}
  if (el) el.innerHTML = '<span style="color:var(--red)">● Proxy: Offline</span>';
  if (card) card.style.display = '';
  return false;
}

async function copyProxyCommand() {
  try {
    await navigator.clipboard.writeText(PROXY_START_COMMAND);
    toast('Proxy start command copied to clipboard.', 's');
  } catch (_) {
    toast(`Run this command manually: ${PROXY_START_COMMAND}`, 'i', 6000);
  }
}

function openLocalProxyHealth() {
  window.open(`${PROXY_URL}/health`, '_blank', 'noopener');
}

async function startProxyFromBrowser() {
  // Try to start the proxy by calling a local endpoint
  // Since browsers can't spawn Node processes directly, we try multiple methods
  slog('Attempting to start proxy...', 'info');
  
  // Method 1: Try to fetch a local endpoint that might trigger the proxy
  try {
    const res = await fetch(`${PROXY_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      slog('Proxy is already running!', 'success');
      checkProxy();
      return;
    }
  } catch {}
  
  // Method 2: Try to open the .bat file via a hidden iframe (Windows only)
  slog('Proxy not running. Please start it manually:', 'warn');
  slog(`Command: ${PROXY_START_COMMAND}`, 'info');
  
  // Show the proxy info card with instructions
  const card = document.getElementById('proxyInfoCard');
  if (card) card.style.display = '';
  
  // Copy command to clipboard
  try {
    await navigator.clipboard.writeText(PROXY_START_COMMAND);
    toast('Proxy command copied! Paste in terminal and run.', 's');
  } catch (_) {
    toast(`Run: ${PROXY_START_COMMAND}`, 'i', 8000);
  }
}

function ensureProxyPolling() {
  if (_proxyPollTimer) return;
  _proxyPollTimer = window.setInterval(() => {
    if (document.getElementById('scraperView')?.classList.contains('active')) {
      checkProxy();
    }
  }, 5000);
}

async function proxyFetch(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${PROXY_URL}/?url=${encodeURIComponent(url)}`, {
        // 120s: covers proxy 45s nav + 15s challenge wait + one internal fresh-page retry
        signal: AbortSignal.timeout(120000)
      });
      if (res.status === 429) {
        const delay = Math.min(15000 * Math.pow(2, attempt), 120000) + Math.random() * 5000;
        slog(`Rate limited, waiting ${(delay / 1000).toFixed(0)}s...`, 'warn');
        await sleep(delay);
        continue;
      }
      if (res.status === 404 || res.status === 410) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt === retries) throw e;
      const delay = Math.min(5000 * Math.pow(2, attempt), 60000) + Math.random() * 3000;
      slog(`Retry ${attempt + 1}/${retries}: ${e.message}, waiting ${(delay / 1000).toFixed(0)}s...`, 'warn');
      await sleep(delay);
    }
  }
}

// ═══════════════════════════════════════
//  4. SCRAPER TABS & CATEGORY UI
// ═══════════════════════════════════════

function switchScraperTab(btn) {
  document.querySelectorAll('.scraper-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.scraper-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const panel = document.getElementById(btn.dataset.tab + 'Panel');
  if (panel) panel.classList.add('active');
}

// _loadCategoryCounts() and populateScraperCategories() are defined in categories.js

// ═══════════════════════════════════════
//  5. ID GENERATION (from URL slug)
// ═══════════════════════════════════════

function generateProductId(slug) {
  if (!slug) return `product-${Date.now()}`;
  const id = slug
    .toLowerCase()
    .replace(/\.html$/i, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
  return id || `product-${Date.now()}`;
}

function normalizeProductDedupText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b\d+\s*(?:gb|tb|mb)\b/gi, '')
    .replace(/\b\d+\s*\/\s*\d+\b/g, '')
    .replace(/\b(?:wi-fi|wifi|cellular|5g|lte)\b/gi, '')
    .replace(/\b(?:black|white|silver|gold|blue|purple|pink|red|green|gray|grey|titanium|starlight|midnight|schwarz|weiß|weiss|silber|blau|grün|gruen)\b/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 140);
}

function productDedupKey(product) {
  const variant = normalizeProductDedupText(product?.variantGroup);
  if (variant) return variant;
  const name = normalizeProductDedupText(product?.name);
  if (name) return name;
  return generateProductId(slugFromUrl(product?.sourceUrl || product?.slug || ''));
}

function prepareProductPayload(product) {
  const sanitized = sanitizeProductSpecs(product.specs || {}, product.specSections || {});

  // Enforce hard cap of 4 product images, dedup, all in -l.webp tier
  const rawImages = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
  const seenImg = new Set();
  const images = [];
  for (const url of rawImages) {
    const mid = typeof imgMedium === 'function' ? imgMedium(url) : url;
    const key = mid.replace(/-[a-z]\.webp$/i, '').toLowerCase();
    if (mid && !seenImg.has(key)) {
      seenImg.add(key);
      images.push(mid);
    }
    if (images.length >= 4) break;
  }
  const primary = images[0] || product.imageUrl || '';

  const payload = {
    slug: String(product.slug || product.id || productDedupKey(product) || '').trim().slice(0, 200),
    name: String(product.name || '').trim().slice(0, 500),
    brand: String(product.brand || '').trim().slice(0, 200),
    category: String(product.category || '').trim().slice(0, 100),
    source: String(product.source || 'geizhals.eu').trim().slice(0, 100),
    sourceUrl: product.sourceUrl || undefined,
    imageUrl: primary || undefined,            // medium tier (-l.webp)
    imageUrlThumb: primary ? imgThumb(primary) : undefined, // -m.webp
    imageUrlHQ: primary ? imgHQ(primary) : undefined,       // -n.webp
    images,
    specs: sanitized.specs,
    specSections: sanitized.sections,
    keySpecs: product.keySpecs && typeof product.keySpecs === 'object' ? product.keySpecs : {},
    techScore: Number.isFinite(Number(product.techScore)) ? Number(product.techScore) : undefined,
    specsCount: Object.keys(sanitized.specs).length,
    variantGroup: String(product.variantGroup || productDedupKey(product) || '').trim().slice(0, 200),
    scrapedAt: product.scrapedAt || new Date().toISOString(),
  };

  // Multilingual payload (only if translation pipeline ran inline)
  if (product.multiLangSpecs && typeof product.multiLangSpecs === 'object') {
    payload.multiLangSpecs = product.multiLangSpecs;
  }
  if (product.multiLangSections && typeof product.multiLangSections === 'object') {
    payload.multiLangSections = product.multiLangSections;
  }
  if (product.nameTranslated && typeof product.nameTranslated === 'object') {
    payload.nameTranslated = product.nameTranslated;
  }

  if (!payload.slug) payload.slug = generateProductId(slugFromUrl(payload.sourceUrl || ''));
  if (!payload.name) throw new Error('Product name is empty');

  return typeof _clean === 'function' ? _clean(payload) : payload;
}

function isBlockedSpec(key, value) {
  const text = `${key || ''} ${value || ''}`.toLowerCase();
  return [
    'letztes preisupdate',
    'preisupdate',
    'price update',
    'last price',
    'preisvergleich',
    'preise',
    'angebote',
    'shops',
    'händler',
    'lieferzeit',
    'versand',
    'ean',
    'mpn',
  ].some(term => text.includes(term));
}

// Split a string on commas / semicolons, but ONLY at depth 0 — i.e. ignore
// any separator that sits inside parentheses, brackets or braces. This way
// "1x DisplayPort 1.4 (240Hz@2560x1440), 2x HDMI 2.1 (240Hz@2560x1440)" is
// split into 2 facts, while "Adaptive Sync (40-240Hz via DP, 40-240Hz via
// HDMI)" stays as ONE fact.
function _splitTopLevel(str, separators = /[,;]/) {
  const out = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    if (depth === 0 && separators.test(ch)) {
      // Numeric decimal protection: don't break "1,5" or "12.5,3"
      const prev = str[i - 1], next = str[i + 1];
      if (/\d/.test(prev || '') && /\d/.test(next || '')) {
        buf += ch;
        continue;
      }
      out.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function normalizeSpecValue(value) {
  // The DOM tree comes in pre-broken as raw HTML — caller now passes a
  // string that already has \n between sibling block elements (parseSpecs
  // does this with a <br>/<li>/<p> → \n preprocessor). On top of that we
  // also break on TOP-LEVEL commas / semicolons so each fact gets its own
  // line — parenthesised qualifications stay attached to the parent fact.
  const cleaned = String(value || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n');

  // Process each existing line separately so the \n boundaries are respected,
  // then expand top-level commas inside each line.
  const lines = [];
  for (const ln of cleaned.split('\n')) {
    for (const part of _splitTopLevel(ln)) {
      const trimmed = part.replace(/\s+/g, ' ').trim();
      if (trimmed && !isBlockedSpec('', trimmed)) lines.push(trimmed);
    }
  }
  return lines.join('\n');
}

// Reference-only spec detector. Geizhals occasionally emits rows like
//   <dt>USB-Schreibweise</dt><dd><a href="...">Link</a></dd>
// pointing to an external Wikipedia / standards article. These rows are
// not real product specs and just pollute the modal — drop them.
const _REFERENCE_WORDS = /^(link|liste|mehr|details|more|see|show|info|wikipedia|datenblatt|spec[- ]?sheet)$/i;

function _isReferenceLinkDd(dd) {
  if (!dd) return false;
  // Strip whitespace-only children
  const meaningfulChildren = Array.from(dd.childNodes).filter(n => {
    if (n.nodeType === 3) return n.textContent.trim().length > 0; // text node
    return n.nodeType === 1; // element node
  });
  // dd that contains nothing but a single anchor with a reference word
  if (meaningfulChildren.length === 1) {
    const only = meaningfulChildren[0];
    if (only.nodeType === 1 && only.tagName && only.tagName.toLowerCase() === 'a') {
      const text = (only.textContent || '').trim();
      if (_REFERENCE_WORDS.test(text)) return true;
    }
  }
  return false;
}

// Convert an HTML element to plain text while preserving line breaks for
// the common block-level / list separators Geizhals uses.
function _htmlToLinedText(el) {
  if (!el) return '';
  const clone = el.cloneNode(true);
  // Hard newline markers
  clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  // Block-level separators (treat as line break before AND after)
  clone.querySelectorAll('li, p, div, dd > span').forEach(node => {
    node.insertAdjacentText('beforebegin', '\n');
    node.insertAdjacentText('afterend', '\n');
  });
  return clone.textContent || '';
}

function sanitizeProductSpecs(rawSpecs, rawSections) {
  const specs = {};
  const sections = {};
  const add = (section, key, value) => {
    const cleanKey = String(key || '').trim();
    if (!cleanKey || cleanKey.length > 120 || isBlockedSpec(cleanKey, value)) return;
    const cleanValue = normalizeSpecValue(value);
    if (!cleanValue || cleanValue.length > 1200) return;
    specs[cleanKey] = cleanValue;
    const sec = String(section || 'General').trim() || 'General';
    if (!sections[sec]) sections[sec] = {};
    sections[sec][cleanKey] = cleanValue;
  };
  if (rawSections && typeof rawSections === 'object' && Object.keys(rawSections).length) {
    Object.entries(rawSections).forEach(([section, values]) => {
      if (!values || typeof values !== 'object') return;
      Object.entries(values).forEach(([key, value]) => add(section, key, value));
    });
  } else if (rawSpecs && typeof rawSpecs === 'object') {
    Object.entries(rawSpecs).forEach(([key, value]) => add('General', key, value));
  }
  return { specs, sections };
}

// ═══════════════════════════════════════
//  6. VARIANT GROUPING
// ═══════════════════════════════════════

function normalizeVariantGroup(name) {
  if (!name) return '';
  let g = name
    .replace(/\b\d+\s*gb\b/gi, '')
    .replace(/\b\d+\s*tb\b/gi, '')
    .replace(/\b\d+\s*mb\b/gi, '')
    .replace(/\b\d+\s*gb\s*ram\b/gi, '')
    .replace(/\b\d+\s*gb\s*\/\s*\d+\s*gb\b/gi, '')
    .replace(/\b\d+\s*gb\s*\+\s*\d+\s*gb\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return g;
}

function normalizeVariantGroupFromSlug(slug) {
  if (!slug) return '';
  let s = slug.toLowerCase().replace(/\.html$/i, '');
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s
      .replace(/-\d+gb-ram$/, '')
      .replace(/-\d+gb$/, '')
      .replace(/-\d+tb$/, '')
      .replace(/-\d+mb$/, '')
      .replace(/-\d+gb-\d+gb$/, '')
      .replace(/-\d+gb-\d+gb-ram$/, '');
  }
  return s;
}

// ═══════════════════════════════════════
//  7. BRAND DETECTION
// ═══════════════════════════════════════

function extractBrand(name, specs) {
  if (!name) return '';

  // Try specs first
  if (specs) {
    const brandVal = specs['Brand'] || specs['Marka'] || specs['brand'] || specs['marka'];
    if (brandVal) {
      const cleaned = brandVal.trim();
      if (cleaned.length > 0 && cleaned.length < 50) return cleaned;
    }
  }

  // Use QorAiBrands if available
  const brandList = (typeof window !== 'undefined' && window.QorAiBrands)
    ? window.QorAiBrands
    : ['Samsung', 'Apple', 'Xiaomi', 'Huawei', 'OnePlus', 'Google', 'Sony', 'LG',
      'Oppo', 'Vivo', 'Realme', 'Motorola', 'Nokia', 'Asus', 'Lenovo', 'HP', 'Dell',
      'Acer', 'MSI', 'Razer', 'Logitech', 'JBL', 'Bose', 'Marshall', 'Sennheiser',
      'Canon', 'Nikon', 'DJI', 'GoPro', 'Anker', 'Baseus', 'TP-Link', 'Dyson',
      'iRobot', 'Roborock', 'TCL', 'Hisense', 'Philips', 'Panasonic', 'Garmin',
      'Fitbit', 'Nothing', 'Honor', 'Poco', 'Redmi', 'Infinix', 'Tecno', 'ZTE',
      'BenQ', 'ViewSonic', 'AOC', 'Gigabyte', 'Corsair', 'SteelSeries', 'HyperX',
      'Epson', 'Brother', 'Vestel', 'Arçelik', 'Beko', 'Grundig', 'Intel', 'AMD',
      'Nvidia', 'Kingston', 'Crucial', 'Western Digital', 'Seagate', 'ASRock',
      'Cooler Master', 'NZXT', 'be quiet!', 'Thermaltake', 'Audio-Technica',
      'Beyerdynamic', 'Fujifilm', 'Insta360', 'Nintendo', 'Microsoft', 'Valve',
      'Meta', 'Netgear', 'Zyxel', 'Dreame', 'Ecovacs', 'Kindle', 'Kobo'];

  const lower = name.toLowerCase();
  // Try multi-word brands first (sorted by length desc)
  const sorted = [...brandList].sort((a, b) => b.length - a.length);
  for (const b of sorted) {
    if (lower.startsWith(b.toLowerCase() + ' ') || lower === b.toLowerCase()) {
      return b;
    }
  }
  // Fallback: first word
  return name.split(/\s+/)[0] || '';
}

// ═══════════════════════════════════════
//  8. TECH SCORE EXTRACTION
// ═══════════════════════════════════════

function extractTechScore(doc) {
  if (typeof doc === 'string') doc = parseHTML(doc);

  function parseScore(text) {
    if (!text) return null;
    const m = text.match(/(\d{1,3})/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 100) return n;
    }
    return null;
  }

  // geizhals.eu doesn't have native tech scores; check for rating elements
  const ratingEl = doc.querySelector('[class*="rating"], [class*="score"], [class*="bewertung"]');
  if (ratingEl) {
    const s = parseScore(ratingEl.textContent);
    if (s) return s;
  }

  return null;
}

// Listing-page tech score from product card element
function extractListingTechScore(cardEl) {
  if (!cardEl) return null;

  function parseScore(val) {
    if (!val) return null;
    const n = parseInt(val, 10);
    return (n >= 1 && n <= 100) ? n : null;
  }

  // data-attributes on the card
  const tp = cardEl.getAttribute('data-teknikpuan') || cardEl.getAttribute('data-puan');
  if (tp) {
    const s = parseScore(tp);
    if (s) return s;
  }

  // Inner elements
  for (const sel of ['.teknikpuan', '.puan', '.teknik-puan', '.score']) {
    const el = cardEl.querySelector(sel);
    if (el) {
      const s = parseScore(el.textContent.trim());
      if (s) return s;
    }
  }
  return null;
}

// ═══════════════════════════════════════
//  9. PRICE EXTRACTION
// ═══════════════════════════════════════

// ═══════════════════════════════════════
//  10. IMAGE EXTRACTION
// ═══════════════════════════════════════

// Max images per product (user requirement: first 4 product-only images)
const MAX_IMAGES_PER_PRODUCT = 4;

// Geizhals CDN exposes the same image in multiple sizes via prefix:
//   /-n.webp = original (~1280px, 80-120 KB)
//   /-l.webp = large    (~640px,  40-60 KB)  ← default product view
//   /-m.webp = medium   (~320px,  15 KB)     ← list / thumbnail
// We keep the medium URL as canonical and derive the others on the fly.
function _imgTier(url, tier /* 'm' | 'l' | 'n' */) {
  if (!url) return '';
  // Replace any -k.webp, -s.webp, -m.webp, -l.webp, -n.webp suffix or
  // /[ksmt]_ prefix path with the requested tier.
  return url
    .replace(/\/[ksmtc]_/g, `/-${tier}.webp`)
    .replace(/-(?:k|s|m|t|c|l|n)\.webp(\.\w+)?$/i, `-${tier}.webp`);
}
function imgThumb(url) { return _imgTier(url, 'm'); }
function imgMedium(url) { return _imgTier(url, 'l'); }
function imgHQ(url)     { return _imgTier(url, 'n'); }

function extractImages(doc /*, productSlug */) {
  if (typeof doc === 'string') doc = parseHTML(doc);

  // Canonical form: -l.webp (mid-quality, web/mobile-friendly).
  // Storing only the medium URL keeps the DB lean; the app can derive
  // thumb / HQ on demand by string replacement.
  function canonicalize(url) {
    return _imgTier(url.trim().split(/[?#]/)[0], 'l');
  }

  const images = [];
  const seen = new Set();
  function addImg(url) {
    if (!url) return;
    const u = canonicalize(url);
    // Dedup on a key that ignores the size tier so we don't keep the same
    // image in 3 different sizes
    const key = u.replace(/-[a-z]\.webp$/i, '').toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      images.push(u);
    }
  }

  // 1. og:image (always the product's hero image)
  const ogImg = doc.querySelector('meta[property="og:image"]');
  if (ogImg) {
    const content = ogImg.getAttribute('content');
    if (content && content.includes('gzhls.at/pix')) addImg(content);
  }

  // 2. <img> tags inside the product gallery only
  //    Geizhals wraps gallery images in `.product-gallery`, `.gallery`,
  //    `#productGallery` containers; restricting to these avoids carousel
  //    "related products" leaking in.
  const galleryScopes = doc.querySelectorAll(
    '.product-gallery, .productgallery, .gallery, #productGallery, [data-testid="product-gallery"], .swiper-wrapper'
  );
  const imgScopes = galleryScopes.length ? Array.from(galleryScopes) : [doc];
  for (const scope of imgScopes) {
    scope.querySelectorAll('img').forEach(img => {
      for (const attr of ['src', 'data-src', 'data-lazy', 'data-original']) {
        const val = img.getAttribute(attr);
        if (val && val.includes('gzhls.at/pix')) {
          addImg(val);
          break;
        }
      }
    });
  }

  // 3. Direct anchors to the original-size image (lightbox links)
  doc.querySelectorAll('a[href*="gzhls.at/pix/"]').forEach(a => {
    const href = a.getAttribute('href');
    if (href) addImg(href);
  });

  return images.slice(0, MAX_IMAGES_PER_PRODUCT);
}

async function fetchGalleryImages(productSlug) {
  return [];
}

// ═══════════════════════════════════════
//  11. SPEC PARSING
// ═══════════════════════════════════════

// Categorize a raw German spec key into a logical section. Order matters:
// first match wins. Falls back to 'General' for unmatched keys.
// Section names are kept short & language-neutral so the dictionary layer
// can localise them later without breaking lookups.
// Order matters: first match wins. Most specific rules MUST come first.
// CRITICAL: 'Battery / Power' must precede 'AI / Performance' because
// "Leistungsaufnahme" starts with "Leistung" and we want it to land in
// Battery, not Performance.
const _SPEC_SECTION_RULES = [
  // Power-related — covers everything that talks about consumption / supply
  ['Battery / Power',    /^(akku|batterie|stromverbrauch|leistungsaufnahme|leistungsa|netzteil|netzanschluss|wattzahl|^watt$|laden|ladegerät|usv|effizienz|energieeffizienz|energieverbrauch)/i],

  // Chip-internal specs — match BEFORE AI / Performance to avoid "Chip-Funktionen"
  // accidentally falling into Features.
  ['Chip / Processor',   /^(chip|cpu|prozessor|prozessoren|sockel|kern|thread|takt|boost|tdp|tgp|cache|fertigung|architektur|vcn|transcoding|encoding|decoding|temel tempo)/i],

  ['Graphics',           /^(grafik|gpu|grafikspeicher|raytracing|api[- ]unterstützung|shader|directx|vulkan|opengl|opencl|multi[- ]gpu|slotblende|bauform)/i],

  // Be strict about AI: only the explicit AI compute keys, not anything
  // starting with "Leistung".
  ['AI / Performance',   /^(ai[- ]?rechenleistung|ai[- ]?leistung|tops|tflops|fp\d|int\d|benchmark|punkte|yapay zeka)/i],

  // Display — heavily expanded for monitors, TVs and phones
  ['Display',            /^(display|bildschirm|auflösung|bildwiederhol|helligkeit|kontrast|hdr|reaktionszeit|panel|seitenverhältnis|pixeldichte|zoll|diagonale|blickwinkel|farbtiefe|farbraum|dci[- ]p3|rec\.?\s*2020|srgb|adobe[- ]?rgb|lut|hintergrundbeleuchtung|variable synchronisierung|screen[- ]to[- ]body|krümmung|curvature|backlight|gamut|color depth)/i],

  ['Memory',             /^(speicher|memory|ram|gddr|ddr|speichertyp|speichergeschwindigkeit|hafıza)/i],
  ['Storage',            /^(festplatte|ssd|hdd|nvme|m\.2|sata|kapazität|lese|schreib|iops)/i],

  // Connectivity / I/O — also catches monitor signal bandwidth like "Bandbreite"
  // and bus interfaces like "Anbindung", "PCIe", since those are usually I/O.
  ['Connectivity / I/O', /^(anschlüsse|anschluss|hdmi|displayport|usb|thunderbolt|stromanschluss|netzwerk|lan|ethernet|wlan|wi[- ]?fi|bluetooth|nfc|gps|antenne|bandbreite|anbindung|pcie|bus|signal|bağlantı|bağlantılar)/i],

  ['Audio',              /^(audio|lautsprecher|kopfhörer|mikrofon|klang|sound|dolby|dts)/i],
  ['Camera',             /^(kamera|sensor|objektiv|optisch|fokus|blende|brennweite|iso|video[- ]aufnahme)/i],
  ['Software / OS',      /^(betriebssystem|software|os|treiber|firmware|ohne smart)/i],

  // Physical / mechanical — VESA mount, color, stand, ergonomic adjustability
  ['Dimensions',         /^(abmessungen|gewicht|breite|höhe|länge|tiefe|maße|vesa|^farbe$|standfuß|^form$|ergonomie|verstellbarkeit|pivot|drehbar|neigbar|halterung)/i],

  ['Cooling',            /^(kühlung|lüfter|wasserkühlung|radiator)/i],

  // Catch-all for "extras / certifications / control method"
  ['Features',           /^(funktionen|features|bedienung|besonderheiten|funktion$|zertifizierungen|chip[- ]funktionen|extras)/i],

  ['Release & Pricing',  /^(veröffentlichung|ankündigung|uvp|garantie|hersteller|ean|upc|modell|marke|serie|^typ$|gelistet|listed since|veröffentl)/i],
];

function _classifySpecKey(key) {
  for (const [section, re] of _SPEC_SECTION_RULES) {
    if (re.test(key)) return section;
  }
  return 'General';
}

function parseSpecs(doc) {
  const specs = {};
  const specSections = {};
  const keySpecs = {};

  // ── PRIMARY: geizhals.eu dl.specs-grid ──
  // Only extract the FIRST specs-grid to avoid duplicate variants.
  // Each spec is auto-classified into a logical section so admin/app
  // can render organised accordions instead of one giant flat list.
  const firstGrid = doc.querySelector('dl.specs-grid');
  if (firstGrid) {
    firstGrid.querySelectorAll('.specs-grid__item').forEach(item => {
      const dt = item.querySelector('dt');
      const dd = item.querySelector('dd');
      if (!dt || !dd) return;
      const key = dt.textContent.trim();
      // Skip reference-only rows: when the <dd> wraps a single anchor like
      // <a>Link</a> (e.g. "USB-Schreibweise: Link" pointing to a Wikipedia
      // page) — these are NOT real spec data, just a footnote link.
      if (_isReferenceLinkDd(dd)) return;
      // Use the line-preserving extractor so <br>, <li>, <p> become \n
      // BEFORE normalizeSpecValue runs its comma/semicolon split.
      const value = normalizeSpecValue(_htmlToLinedText(dd));
      if (!key || !value || key.length >= 200 || value.length >= 1000) return;
      if (isBlockedSpec(key, value)) return;
      // Final safety: drop values that resolve to bare reference words.
      if (_REFERENCE_WORDS.test(value)) return;

      specs[key] = value;
      const section = _classifySpecKey(key);
      if (!specSections[section]) specSections[section] = {};
      specSections[section][key] = value;
    });
  }

  return { specs, specSections, keySpecs };
}

// ═══════════════════════════════════════
//  12. TRANSLATION HELPERS
// ═══════════════════════════════════════

function getDict() {
  return (typeof window !== 'undefined' && window.QorAiDict) ? window.QorAiDict : null;
}

function translateSpecsObject(rawSpecs) {
  const dict = getDict();
  if (!dict) return rawSpecs;
  const translated = {};
  for (const [k, v] of Object.entries(rawSpecs)) {
    const tk = dict.translateKey(k);
    const tv = dict.translateValue(v, k);
    translated[tk] = tv;
  }
  return translated;
}

function translateSections(rawSections) {
  const dict = getDict();
  if (!dict) return rawSections;
  const translated = {};
  for (const [section, specObj] of Object.entries(rawSections)) {
    const ts = dict.translateKey(section);
    translated[ts] = {};
    for (const [k, v] of Object.entries(specObj)) {
      const tk = dict.translateKey(k);
      const tv = dict.translateValue(v, k);
      translated[ts][tk] = tv;
    }
  }
  return translated;
}

function translateKeySpecs(rawKeySpecs) {
  const dict = getDict();
  if (!dict) return rawKeySpecs;
  const translated = {};
  for (const [k, v] of Object.entries(rawKeySpecs)) {
    const tk = dict.translateKey(k);
    const tv = dict.translateValue(v, k);
    translated[tk] = tv;
  }
  return translated;
}

function filterSpecs(specs, sections) {
  const dict = getDict();
  if (!dict || !dict.filterTurkishLanguageSpecs) return { specs, sections };
  return dict.filterTurkishLanguageSpecs(specs, sections);
}

// ═══════════════════════════════════════
//  12b. GERMAN → MULTI-LANG TRANSLATION (DeepSeek v3 + Dictionary Cache)
// ═══════════════════════════════════════

// In-memory DE→target dictionary cache (lazy-loaded from PB)
const _deDictCache = {}; // { 'some german text': { en: '...', tr: '...', ... } }
let _deDictLoaded = false;
let _deDictDirty = false;
const DE_DICT_PB_KEY = 'de_translation_dict';

async function _loadDeDict() {
  if (_deDictLoaded) return;
  try {
    const doc = await pbGetDoc('public_config', DE_DICT_PB_KEY);
    if (doc.exists) {
      const data = typeof doc.data === 'function' ? doc.data() : doc;
      const stored = data?.value || data || {};
      if (typeof stored === 'object' && !Array.isArray(stored)) {
        Object.assign(_deDictCache, stored);
      }
    }
  } catch (e) {
    console.warn('[de-dict] load failed:', e.message);
  }
  _deDictLoaded = true;
}

async function _saveDeDict() {
  if (!_deDictDirty) return;
  _deDictDirty = false;
  try {
    await pbSetDoc('public_config', DE_DICT_PB_KEY, {
      key: DE_DICT_PB_KEY,
      value: _deDictCache,
      updatedAt: new Date().toISOString()
    });
  } catch (e) {
    console.warn('[de-dict] save failed:', e.message);
    _deDictDirty = true; // retry next time
  }
}

// Lookup German text in cache for a specific target language
function _deDictLookup(germanText, targetLang) {
  const key = germanText.toLowerCase().trim();
  const entry = _deDictCache[key];
  if (entry && entry[targetLang]) return entry[targetLang];
  return null;
}

// Store translation in cache
function _deDictStore(germanText, targetLang, translation) {
  const key = germanText.toLowerCase().trim();
  if (!_deDictCache[key]) _deDictCache[key] = {};
  if (_deDictCache[key][targetLang] !== translation) {
    _deDictCache[key][targetLang] = translation;
    _deDictDirty = true;
  }
}

// ── Public dictionary API (used by the Dictionary admin tab) ────────────
//
// Browser globals — keep them lean and explicit so the UI module doesn't
// reach into private internals. `forceSave` bypasses the dirty flag so the
// admin can persist edits even if no _deDictStore call was made (e.g. the
// admin only edited an existing entry).
window.QorAiDict = {
  load:    () => _loadDeDict(),
  cache:   () => _deDictCache,
  set:     (germanText, lang, translation) => _deDictStore(germanText, lang, translation),
  remove:  (germanText) => {
    const key = String(germanText || '').toLowerCase().trim();
    if (_deDictCache[key]) { delete _deDictCache[key]; _deDictDirty = true; }
  },
  save:    () => { _deDictDirty = true; return _saveDeDict(); },
  langs:   () => SUPPORTED_LANGS,
};

// Batch translate German texts → ALL target languages in ONE DeepSeek call.
// Response shape: { "german text": { en: "...", tr: "...", ... }, ... }
// This collapses what used to be 11 sequential API hits per product into a
// single round-trip: ~11x faster AND ~11x cheaper (token overlap on the
// system prompt + single network latency).
const _LANG_NAMES = {
  en: 'English', tr: 'Turkish', es: 'Spanish', fr: 'French', it: 'Italian',
  ja: 'Japanese', nl: 'Dutch', pl: 'Polish', pt: 'Portuguese', sv: 'Swedish', ar: 'Arabic'
};

async function _deepSeekAllLangsBatch(germanTexts, targetLangs) {
  const token = getPb()?.authStore?.token;
  if (!token) {
    console.warn('[de-translate] No auth token');
    return {};
  }

  // Build the set of (text, lang) pairs that are NOT in cache yet
  const missingByText = new Map(); // text → Set<lang>
  for (const t of germanTexts) {
    const missing = targetLangs.filter(l => !_deDictLookup(t, l));
    if (missing.length) missingByText.set(t, missing);
  }
  if (missingByText.size === 0) return; // everything cached — no API hit

  const uncached = [...missingByText.keys()];
  // DeepSeek context cap safety: split into chunks of 30 terms × 11 langs
  // (each chunk ≈ 4-6KB JSON request, ~10-20KB response, well under 64K)
  const CHUNK = 30;
  for (let i = 0; i < uncached.length; i += CHUNK) {
    const batch = uncached.slice(i, i + CHUNK);
    const textsJson = JSON.stringify(batch);
    const langCodes = targetLangs.join(',');

    try {
      const response = await fetch(`${PB_URL}/api/ai/deepseek`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            {
              role: 'system',
              content: `You are a technical product specification translator. For each German tech spec term, return a JSON object mapping the original German text to translations in the following languages: ${langCodes}.
Rules:
- Keep numbers, units, sizes and technical abbreviations unchanged (e.g. "5G", "Wi-Fi 6E", "120 Hz", "GB", "mm").
- Product names / brand names stay as-is.
- Preserve newlines (\\n) inside multi-line values.
- Return ONLY a single JSON object of the form:
  {"<german text>": {"en":"...", "tr":"...", "es":"...", ...}, ...}
- The inner object MUST contain exactly these language codes: ${langCodes}.`
            },
            {
              role: 'user',
              content: `Translate these ${batch.length} German product specification terms into ${targetLangs.length} languages (${langCodes}):\n${textsJson}\n\nReturn only the JSON object.`
            }
          ],
          max_tokens: 6000,
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        throw new Error(data.message || data.error || 'DeepSeek API error');
      }

      const content = data.choices?.[0]?.message?.content || '{}';
      let translations;
      try {
        translations = JSON.parse(content);
      } catch {
        const match = String(content).match(/\{[\s\S]*\}/);
        translations = match ? JSON.parse(match[0]) : {};
      }

      // Store every returned translation in cache
      for (const t of batch) {
        const entry = translations[t];
        if (!entry || typeof entry !== 'object') continue;
        for (const lang of targetLangs) {
          if (typeof entry[lang] === 'string' && entry[lang].trim()) {
            _deDictStore(t, lang, entry[lang]);
          }
        }
      }
    } catch (e) {
      console.warn('[de-translate] all-langs batch error:', e.message);
      // Don't break the loop — cache misses will fall back to original text
    }
  }

  await _saveDeDict();
}

// Main function: translate German specs → all target languages
// Returns: { en: {specs}, tr: {specs}, ... }
//
// EFFICIENCY MODEL (atom + product-patch):
//   1) All German texts → looked up in the shared `_deDictCache` (atom dict).
//   2) Only MISSING atoms hit DeepSeek (batched, 1 call per language max 50 atoms).
//   3) New translations are stored back in the atom dict for reuse.
//   4) Final per-product multiLangSpecs is built from dict lookups only.
// On a category with repeating spec keys, a 5K product run will hit DeepSeek
// only a few hundred times instead of 5K × 24 × 11 ≈ 1.3M.
async function translateGermanSpecs(germanSpecs, targetLangs = TARGET_LANGS) {
  await _loadDeDict();

  // Atomize EVERY translatable string. Spec values often arrive as multi-line
  // bullet blobs ("3692mAh\nfest verbaut\nkabelloses Laden") — DeepSeek does
  // a poor job translating them as one chunk, so we additionally enqueue each
  // individual line as its own atom. The renderer can then resolve any line
  // independently of the whole-block lookup.
  const allGermanTexts = new Set();
  function _enqueue(text) {
    const t = String(text || '').trim();
    if (!t) return;
    allGermanTexts.add(t);
    if (t.includes('\n')) {
      for (const line of t.split('\n')) {
        const tl = line.trim();
        if (tl) allGermanTexts.add(tl);
      }
    }
  }
  for (const [k, v] of Object.entries(germanSpecs)) {
    _enqueue(k);
    _enqueue(v);
  }
  const germanTexts = [...allGermanTexts].filter(t => t.length > 0);

  // Cache-aware logging
  const newTerms = germanTexts.filter(t => targetLangs.some(l => !_deDictLookup(t, l)));
  if (newTerms.length > 0) {
    slog(`  · ${newTerms.length}/${germanTexts.length} new terms → DeepSeek (1 call · all langs)`, 'info');
  } else {
    slog(`  · ${germanTexts.length}/${germanTexts.length} cached — no API call`, 'success');
  }

  // ONE API call covers all 11 languages
  await _deepSeekAllLangsBatch(germanTexts, targetLangs);

  // Build a FLAT german→localized lookup map per language. The renderer
  // does `ml[germanKey]` and `ml[germanValue]` so the keys here MUST stay
  // as the original German text, not the translated text.
  //
  // Previous (buggy) layout stored `{ translatedKey: translatedVal }`,
  // which made the lookup miss every time and the modal silently fell back
  // to German for every locale — looking exactly like the translation
  // pipeline had never run.
  const multiLangSpecs = {};
  for (const lang of targetLangs) {
    const map = {};
    function _add(text) {
      const t = String(text || '').trim();
      if (!t) return;
      const tx = _deDictLookup(t, lang);
      if (tx && tx !== t) map[t] = tx;
    }
    for (const [k, v] of Object.entries(germanSpecs)) {
      _add(k);
      const vs = String(v);
      _add(vs);
      // Per-line atoms so the renderer can localize bullet rows even when
      // the whole-block translation is missing or incomplete.
      if (vs.includes('\n')) {
        for (const line of vs.split('\n')) _add(line);
      }
    }
    multiLangSpecs[lang] = map;
  }
  return multiLangSpecs;
}

// Translate the spec section names (German/EN → 12 langs) once and cache.
// Section names are a tiny set (~15 strings); first product fills the cache.
async function translateSpecSections(specSections, targetLangs = TARGET_LANGS) {
  await _loadDeDict();
  const sectionNames = Object.keys(specSections || {});
  if (!sectionNames.length) return {};
  await _deepSeekAllLangsBatch(sectionNames, targetLangs);
  const out = {};
  for (const lang of targetLangs) {
    out[lang] = {};
    for (const sn of sectionNames) out[lang][sn] = _deDictLookup(sn, lang) || sn;
  }
  return out;
}

// Translate single German product name to all languages (single API call)
async function translateGermanName(germanName, targetLangs = TARGET_LANGS) {
  await _loadDeDict();
  await _deepSeekAllLangsBatch([germanName], targetLangs);
  const names = {};
  for (const lang of targetLangs) {
    names[lang] = _deDictLookup(germanName, lang) || germanName;
  }
  return names;
}

// ═══════════════════════════════════════
//  13. PRODUCT DETAIL SCRAPING
// ═══════════════════════════════════════

async function scrapeProductDetail(html, url, categoryId) {
  if (!html) return null;

  // Detect Cloudflare challenge pages
  if (isChallengePage(html)) {
    slog(`Challenge page detected, skipping: ${url}`, 'warn');
    return null;
  }

  const doc = parseHTML(html);

  // Detect garbage / redirect pages
  const bodyText = (doc.body ? doc.body.textContent : '').trim();
  if (bodyText.length < 100) return null;

  // ── Name (German original) ──
  let originalName = '';
  const h1 = doc.querySelector('h1');
  if (h1) {
    // geizhals.eu: product name is in h1, sometimes with nested spans
    const clone = h1.cloneNode(true);
    clone.querySelectorAll('small, .subtitle, .variant').forEach(el => el.remove());
    originalName = clone.textContent.trim();
  }
  if (!originalName) return null;

  // ── URL slug & ID ──
  const productSlug = slugFromUrl(url);
  const id = generateProductId(productSlug);

  // ── Specs (German) ──
  const { specs: rawSpecs, specSections: rawSections, keySpecs: rawKeySpecs } = parseSpecs(doc);

  // ── Brand ──
  const brand = extractBrand(originalName, rawSpecs);

  // ── Category ──
  let category = categoryId || '';
  if (!category) {
    const found = findCategoryByGeizhalsUrl(url);
    category = found ? found.id : categorySlugFromUrl(url);
  }

  // ── Tech Score ──
  const techScore = extractTechScore(doc);

  // ── Images ──
  // All product images from gzhls.at/pix/ in -n.webp format
  const images = extractImages(doc, productSlug);

  // ── Variant Group ──
  const variantGroup = normalizeVariantGroupFromSlug(productSlug);

  return {
    id,
    slug: productSlug || id,
    name: originalName || 'Unknown Product', // German original
    brand,
    category,
    source: 'geizhals.eu',
    sourceUrl: url,
    imageUrl: images[0] || undefined,
    images,
    specs: rawSpecs,          // German specs
    specSections: rawSections, // German sections
    keySpecs: rawKeySpecs,
    techScore: techScore ?? undefined,
    specsCount: Object.keys(rawSpecs).length,
    variantGroup,
    scrapedAt: new Date().toISOString(),
  };
}

// After scraping, translate specs to all target languages using DeepSeek v3
async function translateScrapedProduct(product) {
  if (!product || !product.specs || !Object.keys(product.specs).length) return product;

  slog(`Translating German specs for: ${product.name?.substring(0, 50)}...`, 'info');

  try {
    // Translate specs to all languages
    const multiLangSpecs = await translateGermanSpecs(product.specs);
    product.multiLangSpecs = multiLangSpecs;

    // Translate product name
    const names = await translateGermanName(product.name);
    product.nameTranslated = names;

    // Use English as primary display spec
    if (multiLangSpecs.en) {
      product.specsEn = multiLangSpecs.en;
    }

    slog(`✅ Translated to ${Object.keys(multiLangSpecs).length} languages`, 'success');
  } catch (e) {
    slog(`⚠️ Translation skipped: ${e.message}`, 'warn');
  }

  return product;
}

// ═══════════════════════════════════════
//  14. PRODUCT URL COLLECTION
// ═══════════════════════════════════════

function isChallengePage(html) {
  if (!html) return true;

  // Title-based detection (fast path)
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : '';
  const challengeTitleRe = /Nur einen Moment|Just a moment|Checking your browser|Sichere Verbindung|Einen Moment|Verbindung wird|Attention Required|Access denied|403 Forbidden|Enable JavaScript|Please Wait|DDoS-Guard/i;
  if (challengeTitleRe.test(title)) {
    slog(`Challenge detected (title): "${title.substring(0, 60)}"`, 'warn');
    return true;
  }

  // DOM fingerprint detection (Cloudflare Turnstile & variants)
  const cfFingerprints = [
    'cf-browser-verification',
    'cf_challenge',
    'cf-turnstile',
    '__cf_chl',
    'jschl-answer',
    'cdn-cgi/challenge-platform',
    'Checking if the site connection is secure',
    'Überprüfung ob die Verbindung',
  ];
  for (const fp of cfFingerprints) {
    if (html.includes(fp)) {
      slog(`Challenge detected (fingerprint: ${fp})`, 'warn');
      return true;
    }
  }

  return false;
}

function extractProductLinksFromDoc(doc, html) {
  const results = [];
  const seen = new Set();

  if (isChallengePage(html)) return results;

  const productLinkRe = /-[av]\d+\.html$/i;

  function addLink(href) {
    if (!href) return;
    if (href.startsWith('https://geizhals.eu/') || href.startsWith('http://geizhals.eu/') ||
        href.startsWith('https://www.geizhals.eu/') || href.startsWith('https://geizhals.at/') ||
        href.startsWith('https://geizhals.de/')) {
      try { href = new URL(href).pathname; } catch { return; }
    }
    if (!productLinkRe.test(href)) return;
    if (href.includes('/en/') || href.includes('/about') || href.includes('/contact')) return;
    if (!href.startsWith('/')) href = '/' + href;
    const fullUrl = GEIZHALS_BASE + href;
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);
    results.push({ url: fullUrl, techScore: null });
  }

  // CRITICAL FIX: STRICT selectors — only look inside known main listing containers.
  // NEVER scan the entire page (prevents "kaykay" / sidebar / carousel / Top-10 contamination).
  const containers = doc.querySelectorAll(
    '#productlist, .productlist, .productlist__item, .offer-list, [data-testid="product-list"]'
  );

  if (containers.length > 0) {
    for (const container of containers) {
      container.querySelectorAll('a[href]').forEach(a => {
        addLink(a.getAttribute('href') || '');
      });
    }
  } else {
    // Fallback: only the main content area, NEVER the whole body
    const main = doc.querySelector('main') || doc.querySelector('#content') || doc.querySelector('.content') || doc.body;
    if (main) {
      main.querySelectorAll('a[href]').forEach(a => {
        addLink(a.getAttribute('href') || '');
      });
    }
  }

  return results;
}

async function collectProductUrls(categoryPath, maxProducts = 200) {
  let catDef = (typeof QorAiCategories !== 'undefined')
    ? QorAiCategories.getById(categoryPath)
    : null;
  if (!catDef && typeof QorAiCategories !== 'undefined') {
    catDef = QorAiCategories.getAll().find(c => c.geizhalsSlug === categoryPath);
  }

  if (!catDef || !catDef.geizhalsSlug) {
    slog(`No real ?cat= ID found for category: ${categoryPath}`, 'error');
    return [];
  }

  const catParam = catDef.geizhalsSlug;
  const categoryId = catDef.id;
  slog(`Collecting from category listing: ?cat=${catParam} (${catDef.name})`);

  const allItems = [];
  const seenUrls = new Set();
  // Geizhals only honours the `pg` pagination param. Cycling through other
  // names wasted requests and multiplied CF pressure; stick with `pg`.
  {
    const pageParam = 'pg';
    let page = 1;
    let emptyCount = 0;

    while (allItems.length < maxProducts && !scraperAbort && emptyCount < 2) {
      const listingUrl = `${GEIZHALS_BASE}/?cat=${catParam}&${GEIZHALS_LISTING_EXTRA}&${pageParam}=${page}`;
      slog(`Fetching listing [${pageParam}=${page}]: ${listingUrl.substring(0, 80)}...`, 'info');

      try {
        // PRIMARY: use proxy's strict /category-links endpoint (prevents Kaykay bug)
        let links = [];
        let cloudflareBlocked = false;
        try {
          const res = await fetch(`${PROXY_URL}/category-links?url=${encodeURIComponent(listingUrl)}`, {
            // 90s: proxy nav (45s) + challenge wait (15s) + selector wait (10s) + overhead
            signal: AbortSignal.timeout(90000)
          });

          // Check Content-Type before parsing — Cloudflare HTML will NOT be application/json
          const contentType = res.headers.get('content-type') || '';
          const isJson = contentType.includes('application/json');

          if (res.ok && isJson) {
            let data;
            try {
              data = await res.json();
            } catch (jsonErr) {
              slog(`  → JSON parse failed (Cloudflare HTML?)`, 'error');
              cloudflareBlocked = true;
            }
            if (data) {
              if (data.error === 'cloudflare_challenge') {
                slog(`  → Cloudflare aşılamadı.`, 'error');
                cloudflareBlocked = true;
              } else {
                links = (data.links || []).map(url => ({ url, techScore: null }));
              }
            }
          } else if (!isJson) {
            // Response is NOT JSON — likely Cloudflare HTML challenge page
            slog(`  → Proxy returned non-JSON response (Cloudflare HTML)`, 'error');
            cloudflareBlocked = true;
          } else if (res.status === 503) {
            // 503 = cloudflare_challenge from proxy
            try {
              const errData = await res.json();
              if (errData.error === 'cloudflare_challenge') {
                slog(`  → Cloudflare aşılamadı. (503)`, 'error');
                cloudflareBlocked = true;
              }
            } catch {}
          } else {
            slog(`  → Proxy /category-links returned ${res.status}`, 'warn');
          }
        } catch (proxyErr) {
          slog(`  → Proxy /category-links error: ${proxyErr.message}`, 'warn');
        }

        // FAIL-FAST: if Cloudflare blocked, stop immediately — don't paginate
        if (cloudflareBlocked) {
          slog(`🛑 Hata: Cloudflare güvenlik duvarı geçilemedi. İşlem güvenli bir şekilde durduruldu.`, 'error');
          scraperAbort = true;
          return allItems;
        }

        // FALLBACK: strict client-side parsing if proxy endpoint fails
        if (links.length === 0 && !cloudflareBlocked) {
          const html = await proxyFetch(listingUrl);
          if (!html) { emptyCount++; page++; continue; }
          if (isChallengePage(html)) {
            slog(`🛑 Hata: Cloudflare güvenlik duvarı geçilemedi. İşlem güvenli bir şekilde durduruldu.`, 'error');
            scraperAbort = true;
            return allItems;
          }
          const doc = parseHTML(html);
          links = extractProductLinksFromDoc(doc, html);
        }

        if (links.length === 0) {
          emptyCount++;
          slog(`  → No products on page ${page} (param: ${pageParam})`, 'warn');
        } else {
          emptyCount = 0;
          let newCount = 0;
          for (const item of links) {
            if (!seenUrls.has(item.url)) {
              seenUrls.add(item.url);
              allItems.push({ url: item.url, techScore: item.techScore, category: categoryId });
              newCount++;
            }
          }
          slog(`  +${newCount} products (total unique: ${allItems.length})`, 'success');
        }

        page++;
        await sleep(2000 + Math.random() * 1500);
      } catch (e) {
        slog(`Error fetching listing: ${e.message}`, 'error');
        emptyCount++;
        page++;
      }
    }
  }

  slog(`URL collection complete: ${allItems.length} unique product URLs`, 'success');
  return allItems;
}

// ═══════════════════════════════════════
//  15. SEQUENTIAL SCRAPING (NO parallel / NO Promise.all)
// ═══════════════════════════════════════

// ── Checkpoint helpers (Resume after interruption) ──
const _CHECKPOINT_KEY = 'qorai_scraper_checkpoint_v1';
function _saveCheckpoint(urlItems, nextIndex, categoryId, results) {
  try {
    localStorage.setItem(_CHECKPOINT_KEY, JSON.stringify({
      ts: Date.now(),
      categoryId,
      nextIndex,
      total: urlItems.length,
      results,
      // Save URLs only — re-collecting links can pick fresh prices but loses
      // resume position; instead reuse what we already discovered.
      remainingUrls: urlItems.slice(nextIndex).map(u => ({ url: u.url, techScore: u.techScore })),
    }));
  } catch (e) {
    console.warn('[checkpoint] save failed:', e.message);
  }
}
function _clearCheckpoint() {
  try { localStorage.removeItem(_CHECKPOINT_KEY); } catch {}
}
function getScraperCheckpoint() {
  try {
    const raw = localStorage.getItem(_CHECKPOINT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
window.getScraperCheckpoint = getScraperCheckpoint;
window.clearScraperCheckpoint = _clearCheckpoint;

// Resume from a previously interrupted bulk scrape
async function resumeBulkScrape() {
  const cp = getScraperCheckpoint();
  if (!cp || !Array.isArray(cp.remainingUrls) || cp.remainingUrls.length === 0) {
    toast('Devam edilecek aktif scrape bulunamadı', 'w');
    return;
  }
  if (scraperRunning) { toast('Scraper zaten çalışıyor', 'w'); return; }
  if (!(await checkProxy())) { toast('Önce proxy başlat', 'e'); return; }
  const delay = parseInt(document.getElementById('scrapeDelay')?.value) || 3000;
  scraperRunning = true; scraperAbort = false;
  const btn = document.getElementById('btnBulkScrape'); if (btn) btn.style.display = 'none';
  const stp = document.getElementById('btnStopScrape'); if (stp) stp.style.display = '';
  clearScraperLog();
  slog(`▶ Resuming scrape: ${cp.remainingUrls.length} of ${cp.total} remaining (category: ${cp.categoryId})`, 'info');
  const results = await sequentialScrape(cp.remainingUrls, cp.categoryId, delay);
  slog(`═══ Resume done: ${results.added} added | ${results.skipped} skipped | ${results.errors} errors ═══`, 'success');
  _clearCheckpoint();
  finishScraping();
}
window.resumeBulkScrape = resumeBulkScrape;

// Show/hide Resume button + hint based on stored checkpoint
function updateResumeUI() {
  const cp = getScraperCheckpoint();
  const btn = document.getElementById('btnResumeScrape');
  const clr = document.getElementById('btnClearCheckpoint');
  const hint = document.getElementById('resumeHint');
  if (!btn || !hint) return;
  if (cp && cp.remainingUrls?.length) {
    btn.style.display = '';
    if (clr) clr.style.display = '';
    const when = new Date(cp.ts).toLocaleString();
    hint.style.display = '';
    hint.textContent = `📌 Kaydedilmiş scrape: ${cp.categoryId} · ${cp.remainingUrls.length}/${cp.total} kaldı · ${when}`;
  } else {
    btn.style.display = 'none';
    if (clr) clr.style.display = 'none';
    hint.style.display = 'none';
  }
}
window.updateResumeUI = updateResumeUI;

// ── Skip-existing: pull every product URL already stored in PB for this
// category and drop them from the scrape list. This makes resume "free":
// even after a PC restart, the next run skips everything already saved
// and continues with brand-new URLs.
async function _loadExistingSourceUrls(categoryId) {
  try {
    const docs = await pbGetAll('products', {
      filter: `category="${String(categoryId).replace(/"/g, '\\"')}"`,
      sort: '-created',
    });
    const set = new Set();
    for (const d of docs) {
      const data = typeof d.data === 'function' ? d.data() : (d.data || d);
      if (data?.sourceUrl) set.add(String(data.sourceUrl).trim());
    }
    return set;
  } catch (e) {
    slog(`  (existing-URL preload failed: ${e.message})`, 'warn');
    return new Set();
  }
}

async function sequentialScrape(urlItems, categoryId, delayMs = 2000) {
  const results = { added: 0, skipped: 0, errors: 0, updated: 0 };
  let errorStreak = 0;
  let challengeStreak = 0;
  // Adaptive rate-limit: track last 20 outcomes; if success rate drops below
  // 60% we pause for a long cool-down and slow down per-product delay.
  const recent = []; // 'ok' | 'err' | 'cf'
  const _MAX_CONSEC_ERRORS = 10; // hard abort threshold

  // PRE-PASS: drop URLs that are already in the database.
  // This is the durable "resume" — survives full PC shutdown because the
  // truth lives in PB, not localStorage.
  slog(`Preloading existing products for category "${categoryId}"...`, 'info');
  const existingUrls = await _loadExistingSourceUrls(categoryId);
  const beforeCount = urlItems.length;
  urlItems = urlItems.filter(it => !existingUrls.has(it.url));
  const skippedCount = beforeCount - urlItems.length;
  if (skippedCount > 0) {
    slog(`⏭  Skipped ${skippedCount} already-saved products → ${urlItems.length} new to scrape`, 'success');
    results.skipped += skippedCount;
  } else {
    slog(`No existing products for this category — scraping all ${urlItems.length}`, 'info');
  }
  if (urlItems.length === 0) {
    slog('Nothing new to scrape — category is fully up to date.', 'success');
    return results;
  }

  _scrapeStartTime = Date.now();
  _scrapeProductCount = 0;

  // PRE-FETCH OVERLAP: while product i is being translated (heavy CPU on
  // server + DeepSeek round-trip, ~30-60s) the local browser sits idle.
  // We use it to fetch product i+1's HTML in the background, so by the
  // time the translation finishes the next HTML is already in hand.
  // This roughly cuts wall-clock by 30-40% on translation-heavy batches.
  let nextHtmlPromise = null;
  const prefetchNext = (idx) => {
    if (idx >= urlItems.length || scraperAbort) return null;
    return proxyFetch(urlItems[idx].url).catch(err => {
      // Keep the rejection so the consumer can react; we don't want to lose it.
      return { __error: err };
    });
  };

  for (let i = 0; i < urlItems.length && !scraperAbort; i++) {
    const item = urlItems[i];
    _scrapeProductCount++;
    const productNum = _scrapeProductCount;
    const slug = slugFromUrl(item.url);
    updateProgress(productNum, urlItems.length, 'Products');

    // Apply user delay BEFORE each fetch (except the very first).
    // If we already have a prefetched HTML in flight we keep the delay
    // shorter — the browser has been working in the background.
    if (i > 0 && !nextHtmlPromise) {
      const recentSlice = recent.slice(-20);
      const okCount = recentSlice.filter(x => x === 'ok').length;
      const successRate = recentSlice.length ? okCount / recentSlice.length : 1;
      const adaptiveDelay = successRate < 0.6 ? delayMs * 2 : delayMs;
      await sleep(adaptiveDelay);
    } else if (i > 0) {
      // Light delay even with prefetch to be polite to Cloudflare
      await sleep(Math.min(delayMs, 500));
    }

    try {
      slog(`[${productNum}/${urlItems.length}] ${slug}`);
      // Take prefetched HTML if available, otherwise fetch now
      let html;
      if (nextHtmlPromise) {
        const res = await nextHtmlPromise;
        nextHtmlPromise = null;
        if (res && res.__error) throw res.__error;
        html = res;
      } else {
        html = await proxyFetch(item.url);
      }
      if (!html) {
        slog(`  → 404/gone: ${slug}`, 'warn');
        results.skipped++;
        nextHtmlPromise = prefetchNext(i + 1);
        continue;
      }

      if (isChallengePage(html)) {
        challengeStreak++;
        recent.push('cf');
        slog(`  → Challenge page: ${slug}`, 'warn');
        if (challengeStreak >= 3) {
          // Cool-down before hard abort: many CF blocks are transient
          slog(`⏸  3 ardışık CF — 60 saniye soğuma...`, 'warn');
          await sleep(60000);
          challengeStreak = 0;
          continue;
        }
        results.skipped++;
        nextHtmlPromise = prefetchNext(i + 1);
        continue;
      }
      challengeStreak = 0;

      const product = await scrapeProductDetail(html, item.url, categoryId);
      if (!product || product.name === 'Unknown Product' || product.specsCount === 0) {
        slog(`  → Skipped (no data): ${slug}`, 'warn');
        results.skipped++;
        nextHtmlPromise = prefetchNext(i + 1);
        continue;
      }
      if (!product.techScore && item.techScore) {
        product.techScore = item.techScore;
      }

      // ── Kick off prefetch of the NEXT product's HTML in parallel with
      // translation. The proxy & DeepSeek hit different servers so they
      // don't contend for the same resource. ──
      nextHtmlPromise = prefetchNext(i + 1);

      // ── Phase D: Translate German specs → 12 languages (dict-cached) ──
      try {
        await translateScrapedProduct(product);
      } catch (txErr) {
        slog(`  → Translation skipped: ${txErr.message}`, 'warn');
      }

      const clean = prepareProductPayload(product);
      const saved = await pbSetDoc('products', clean.sourceUrl || clean.slug || clean.id, clean);
      window.dispatchEvent(new CustomEvent('qorai:product-saved', { detail: { id: saved?.id || clean.slug, product: clean } }));
      results.added++;
      errorStreak = 0;
      recent.push('ok');
      slog(`  → Added: ${product.name} (${product.specsCount} specs, score: ${product.techScore || '-'})`, 'success');

      // Adaptive checkpoint every 25 products
      if (results.added > 0 && results.added % 25 === 0) {
        _saveCheckpoint(urlItems, i + 1, categoryId, results);
      }
      if (results.added > 0 && results.added % 5 === 0) {
        triggerAITranslation();
      }
    } catch (e) {
      results.errors++;
      errorStreak++;
      recent.push('err');
      const details = e.response?.data || e.data || {};
      slog(`  → Error: ${slug} — ${e.message}`, 'error');
      Object.entries(details).forEach(([k,v]) => {
        slog(`     ${k}: ${JSON.stringify(v).substring(0,200)}`, 'error');
      });

      // HARD ABORT: too many consecutive errors → likely IP-banned / browser dead
      if (errorStreak >= _MAX_CONSEC_ERRORS) {
        slog(`🛑 ${_MAX_CONSEC_ERRORS} ardışık hata. Scrape durduruldu. Checkpoint kaydedildi — Resume ile devam edebilirsin.`, 'error');
        _saveCheckpoint(urlItems, i + 1, categoryId, results);
        scraperAbort = true;
        break;
      }

      if (errorStreak >= 3) {
        const backoff = Math.min(10000 * Math.pow(2, errorStreak - 3), 120000);
        slog(`Error streak (${errorStreak}), backing off ${(backoff / 1000).toFixed(0)}s...`, 'warn');
        await sleep(backoff);
      }
    }
  }

  // Final checkpoint clear (success path)
  if (!scraperAbort) _clearCheckpoint();
  return results;
}

// ═══════════════════════════════════════
//  16. PRICE SEGMENT COMPUTATION
// ═══════════════════════════════════════

async function computePriceSegments(categoryId) {
  slog(`Price segment computation skipped for ${categoryId}: prices are not scraped.`, 'info');
}

// ═══════════════════════════════════════
//  17. FREE TRANSLATION BACKLOG
// ═══════════════════════════════════════

async function persistTranslationBacklog(terms) {
  if (!terms || terms.length === 0) return {};
  const batch = [...new Set(terms.map(t => String(t || '').trim()).filter(Boolean))].slice(0, 200);
  if (batch.length === 0) return {};

  try {
    const existingDoc = await pbGetDoc('app_config', 'translation_backlog');
    const existing = existingDoc.exists ? existingDoc.data() : {};
    const existingTerms = Array.isArray(existing.terms) ? existing.terms : [];
    const mergedTerms = [...new Set([...existingTerms, ...batch])].sort((a, b) => a.localeCompare(b, 'tr'));

    await pbSetDoc('app_config', 'translation_backlog', {
      terms: mergedTerms,
      count: mergedTerms.length,
      mode: 'free-dictionary',
      updatedAt: new Date().toISOString(),
    });

    slog(`Saved ${batch.length} untranslated terms to PocketBase backlog (${mergedTerms.length} total)`, 'info');
  } catch (e) {
    console.warn('Failed to persist translation backlog:', e);
    slog(`Translation backlog save failed: ${e.message}`, 'warn');
  }
  return {};
}

async function loadLearnedTranslations() {
  try {
    const doc = await pbGetDoc('app_config', 'learned_translations');
    if (doc.exists) {
      const translations = doc.data();
      const dict = getDict();
      if (dict && dict.TR_EN) {
        let count = 0;
        for (const [tr, en] of Object.entries(translations)) {
          if (!dict.TR_EN[tr.toLocaleLowerCase('tr')]) {
            dict.TR_EN[tr.toLocaleLowerCase('tr')] = en;
            count++;
          }
        }
        if (count > 0) slog(`Loaded ${count} learned translations from PocketBase`, 'info');
      }
    }
  } catch (e) {
    console.warn('Failed to load learned translations:', e);
  }
}

function triggerAITranslation() {
  if (_pendingAITerms.size === 0) return;
  const terms = [..._pendingAITerms].slice(0, 100);
  _pendingAITerms.clear();
  // Free mode: persist unknown Turkish terms for later review/reuse.
  persistTranslationBacklog(terms).catch(e => {
    console.warn('Translation backlog background error:', e);
  });
}

// ═══════════════════════════════════════
//  18. BULK SCRAPE (Main Entry Point)
// ═══════════════════════════════════════

async function startBulkScrape() {
  if (scraperRunning) { toast('Scraper already running', 'w'); return; }
  if (!(await checkProxy())) { toast('Start the local proxy first', 'e'); return; }

  const catSelect = document.getElementById('scrapeCategory');
  const catValue = catSelect ? catSelect.value : '';
  if (!catValue) { toast('Select a category', 'w'); return; }

  const maxProducts = parseInt(document.getElementById('scrapeMaxProducts')?.value) || 200;
  const delay = parseInt(document.getElementById('scrapeDelay')?.value) || 2000;

  scraperRunning = true; scraperAbort = false;
  document.getElementById('btnBulkScrape').style.display = 'none';
  document.getElementById('btnStopScrape').style.display = '';

  clearScraperLog();
  slog(`Scraper build: ${SCRAPER_BUILD}`, 'info');
  slog(`Bulk scrape: ${catValue}, max ${maxProducts}`, 'info');

  try {
    // Phase 1: Collect product URLs via similar-products chain discovery
    slog('── Phase 1: Collecting product URLs ──', 'info');
    const urlItems = await collectProductUrls(catValue, maxProducts);
    slog(`Found ${urlItems.length} product URLs`, urlItems.length > 0 ? 'success' : 'warn');

    if (scraperAbort) {
      slog(`Scraping stopped by user. ${urlItems.length} URLs were collected.`, 'warn');
      finishScraping();
      return;
    }

    if (!urlItems.length) {
      slog('No product URLs found. Try a different category or check proxy.', 'error');
      finishScraping();
      return;
    }

    // Limit to maxProducts
    const toScrape = urlItems.slice(0, maxProducts);
    slog(`── Phase 2: Scraping ${toScrape.length} products ──`, 'info');

    // Phase 2: Scrape products sequentially (NO parallel / NO Promise.all)
    const results = await sequentialScrape(toScrape, catValue, delay);

    slog(`\n═══ Done: ${results.added} added | ${results.skipped} skipped | ${results.errors} errors ═══`, 'success');
    if (results.added > 0 && typeof loadProducts === 'function') {
      await loadProducts();
      slog('Products view refreshed.', 'success');
    }
  } catch (e) {
    slog(`Fatal error: ${e.message}`, 'error');
  }

  finishScraping();
}

// ═══════════════════════════════════════
//  19. SINGLE URL SCRAPE
// ═══════════════════════════════════════

async function scrapeByUrl() {
  const nameInput = document.getElementById('scrapeUrl');
  const inputVal = nameInput ? nameInput.value.trim() : '';
  if (!inputVal) { toast('Enter a product name or geizhals.eu URL', 'w'); return; }
  if (!(await checkProxy())) { toast('Start the local proxy first', 'e'); return; }

  clearScraperLog();

  // Check if input is a URL or a product name
  let url, name;
  if (inputVal.startsWith('http')) {
    // Direct URL mode
    url = inputVal;
    slog(`Fetching URL: ${url}`);
  } else {
    // Product name search mode
    name = inputVal;
    slog(`Searching: ${name}`);
  }

  try {
    const cat = document.getElementById('singleUrlCategory')?.value || 'smartphones';

    if (url) {
      // Direct URL scrape via proxy
      const html = await proxyFetch(url);
      if (!html) { slog('❌ Page not found or blocked', 'error'); return; }
      if (isChallengePage(html)) { slog('❌ Cloudflare challenge, cannot scrape this URL', 'error'); return; }

      const product = await scrapeProductDetail(html, url, cat);
      if (!product) { slog('❌ Could not parse product data', 'error'); return; }

      slog(`✅ ${product.name}`, 'success');
      slog(`  Specs: ${product.specsCount}`, 'info');
      slog(`  Image: ${product.imageUrl ? 'yes' : 'no'}`, 'info');
      Object.entries(product.specs).slice(0, 10).forEach(([k,v]) => slog(`  ${k}: ${String(v).substring(0,100)}`));

      try {
        const clean = prepareProductPayload(product);
        const saved = await pbSetDoc('products', clean.sourceUrl || clean.slug || clean.id, clean);
        window.dispatchEvent(new CustomEvent('qorai:product-saved', { detail: { id: saved?.id || clean.slug, product: clean } }));
        slog(`💾 Saved: ${clean.slug?.substring(0,15) || clean.id?.substring(0,10)}`, 'success');
      } catch(saveErr) {
        const details = saveErr.response?.data || saveErr.data || {};
        slog(`❌ Save failed: ${saveErr.message}`, 'error');
        slog(`   Status: ${saveErr.status || 'N/A'}`, 'error');
        if (product) {
          slog(`   Slug: ${product.slug?.substring(0,30)}`, 'error');
          slog(`   Category: ${product.category}`, 'error');
          slog(`   Specs count: ${product.specsCount}`, 'error');
        }
        Object.entries(details).forEach(([k,v]) => {
          slog(`   ${k}: ${JSON.stringify(v).substring(0,200)}`, 'error');
        });
        console.error('[scrapeByUrl] Full save error:', saveErr);
        return;
      }
    } else {
      // Product name search via geizhals search page
      slog(`Searching geizhals.eu for: ${name}`);
      const searchUrl = `${GEIZHALS_BASE}/?fs=${encodeURIComponent(name)}`;
      const searchHtml = await proxyFetch(searchUrl);
      if (!searchHtml || isChallengePage(searchHtml)) {
        slog('❌ Search blocked or no results', 'error');
        return;
      }

      const searchDoc = parseHTML(searchHtml);
      const links = extractProductLinksFromDoc(searchDoc, searchHtml);
      if (links.length === 0) {
        slog('❌ No products found for this search', 'error');
        return;
      }

      slog(`Found ${links.length} products, scraping first...`, 'info');
      const firstUrl = links[0].url;
      const productHtml = await proxyFetch(firstUrl);
      if (!productHtml || isChallengePage(productHtml)) {
        slog('❌ Product page blocked', 'error');
        return;
      }

      const product = await scrapeProductDetail(productHtml, firstUrl, cat);
      if (!product) { slog('❌ Could not parse product data', 'error'); return; }

      slog(`✅ ${product.name}`, 'success');
      slog(`  Specs: ${product.specsCount}`, 'info');
      slog(`  Image: ${product.imageUrl ? 'yes' : 'no'}`, 'info');
      Object.entries(product.specs).slice(0, 10).forEach(([k,v]) => slog(`  ${k}: ${String(v).substring(0,100)}`));

      try {
        const clean = prepareProductPayload(product);
        const saved = await pbSetDoc('products', clean.sourceUrl || clean.slug || clean.id, clean);
        window.dispatchEvent(new CustomEvent('qorai:product-saved', { detail: { id: saved?.id || clean.slug, product: clean } }));
        slog(`💾 Saved: ${clean.slug?.substring(0,15) || clean.id?.substring(0,10)}`, 'success');
      } catch(saveErr) {
        const details = saveErr.response?.data || saveErr.data || {};
        slog(`❌ Save failed: ${saveErr.message}`, 'error');
        slog(`   Status: ${saveErr.status || 'N/A'}`, 'error');
        if (product) {
          slog(`   Slug: ${product.slug?.substring(0,30)}`, 'error');
          slog(`   Category: ${product.category}`, 'error');
          slog(`   Specs count: ${product.specsCount}`, 'error');
        }
        Object.entries(details).forEach(([k,v]) => {
          slog(`   ${k}: ${JSON.stringify(v).substring(0,200)}`, 'error');
        });
        console.error('[scrapeByUrl] Full save error:', saveErr);
        return;
      }
    }
  } catch(e) {
    slog(`Error: ${e.message}`, 'error');
    console.error('[scrapeByUrl] Outer catch:', e);
  }
}

// ═══════════════════════════════════════
//  20. UPDATE PRODUCTS
// ═══════════════════════════════════════

async function startScoreUpdate() {
  if (scraperRunning) { toast('Scraper already running', 'w'); return; }
  if (!(await checkProxy())) { toast('Start the local proxy first', 'e'); return; }

  const cat = document.getElementById('scoreCategory')?.value || '';
  const limitRaw = document.getElementById('scoreLimit')?.value;
  const limit = limitRaw && limitRaw.trim() ? parseInt(limitRaw) : 0; // 0 = no limit
  const delay = parseInt(document.getElementById('scoreDelay')?.value) || 1500;

  scraperRunning = true;
  scraperAbort = false;
  clearScraperLog();

  slog('Loading products for score update...');

  let products;
  try {
    if (typeof allProducts !== 'undefined' && allProducts.length > 0) {
      products = allProducts.filter(p => p.sourceUrl && p.sourceUrl.includes('geizhals.eu'));
    } else {
      const items = await pbGetAll('products', { filter: `source="geizhals.eu"` });
      products = items.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (e) {
    slog(`Failed to load products: ${e.message}`, 'error');
    finishScraping();
    return;
  }

  if (cat) products = products.filter(p => p.category === cat);
  if (limit > 0) products = products.slice(0, limit);

  slog(`Updating scores for ${products.length} products...`);
  _scrapeStartTime = Date.now();

  let updated = 0, unchanged = 0, failed = 0;
  for (let i = 0; i < products.length && !scraperAbort; i++) {
    const p = products[i];
    try {
      updateProgress(i + 1, products.length, 'Scores');
      const html = await proxyFetch(p.sourceUrl);
      if (!html) {
        slog(`${p.name || p.id}: page not found`, 'warn');
        failed++;
        continue;
      }
      if (isChallengePage(html)) {
        slog(`${p.name || p.id}: challenge page, skipping`, 'warn');
        failed++;
        continue;
      }
      const score = extractTechScore(html);
      if (score !== null && score !== p.techScore) {
        await pbUpdateDoc('products', p.id, { techScore: score });
        slog(`${p.name || p.id}: ${p.techScore || 0} → ${score}`, 'success');
        updated++;
        // Update in-memory
        if (typeof allProducts !== 'undefined') {
          const mem = allProducts.find(x => x.id === p.id);
          if (mem) mem.techScore = score;
        }
      } else {
        unchanged++;
        if (i % 10 === 0) slog(`${p.name || p.id}: no change (${p.techScore || 0})`);
      }
      await sleep(delay);
    } catch (e) {
      slog(`${p.name || p.id}: error — ${e.message}`, 'error');
      failed++;
    }
  }

  slog(`\n═══ Score update complete ═══`, 'success');
  slog(`Updated: ${updated} | Unchanged: ${unchanged} | Failed: ${failed}${scraperAbort ? ' | STOPPED' : ''}`,
    updated > 0 ? 'success' : 'info');
  finishScraping();
}

// ═══════════════════════════════════════
//  23. CONTROL FUNCTIONS
// ═══════════════════════════════════════

function stopScraping() {
  scraperAbort = true;
  slog('Stopping... (will finish current requests)', 'warn');
}

function finishScraping() {
  scraperRunning = false;
  scraperAbort = false;
  _scrapeStartTime = null;
  _scrapeProductCount = 0;

  const btnBulk = document.getElementById('btnBulkScrape');
  const btnStop = document.getElementById('btnStopScrape');
  if (btnBulk) btnBulk.style.display = '';
  if (btnStop) btnStop.style.display = 'none';

  // Also reset quality scan buttons if visible
  const btnQuality = document.getElementById('btnQualityScan');
  const btnStopQuality = document.getElementById('btnStopQuality');
  if (btnQuality) btnQuality.style.display = '';
  if (btnStopQuality) btnStopQuality.style.display = 'none';

  const pg = document.getElementById('scraperProgress');
  if (pg) pg.textContent = '';
}

function downloadScraperLog() {
  const el = document.getElementById('scraperLog');
  if (!el) return;
  const text = el.innerText || el.textContent || '';
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scraper-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

