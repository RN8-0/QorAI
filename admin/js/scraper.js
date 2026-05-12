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
  // geizhals.eu category URL pattern: https://geizhals.eu/<cat-slug>
  try {
    const path = new URL(url).pathname;
    const parts = path.split('/').filter(Boolean);
    const catSlug = parts[0] || '';
    // Map geizhals slugs to QorAi category IDs
    if (typeof QorAiCategories !== 'undefined') {
      const all = QorAiCategories.getAll();
      const found = all.find(c => c.id === catSlug || (c.geizhalsSlug && c.geizhalsSlug === catSlug));
      if (found) return found;
    }
    return null;
  } catch { return null; }

}

function productMatchesCategory(product, categoryId) {
  if (!product || !categoryId) return true;
  const specs = product.specs && typeof product.specs === 'object' ? product.specs : {};
  const haystack = [
    product.sourceUrl,
    product.name,
    Object.keys(specs).join(' '),
    Object.values(specs).join(' '),
  ].join(' ').toLowerCase();
  const rules = {
    tablets: ['ipad', 'tablet', 'galaxy tab', 'matepad', 'xiaomi pad', 'surface pro'],
    smartwatches: ['watch', 'garmin', 'forerunner', 'fenix', 'pace', 'smartwatch'],
    smartphones: ['iphone', 'galaxy s', 'pixel', 'smartphone', 'handy'],
  };
  const required = rules[categoryId];
  return !required || required.some(term => haystack.includes(term));
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
        signal: AbortSignal.timeout(30000)
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

function populateScraperCategories() {
  if (typeof QorAiCategories === 'undefined' || !QorAiCategories.groups) return;

  // Build grouped options HTML for bulk scrape (value = category id)
  let bulkOpts = '<option value="">Select Category</option>';
  // Build flat options for other dropdowns (value = category id)
  let flatOpts = '<option value="">All Categories</option>';

  QorAiCategories.groups.forEach(group => {
    bulkOpts += `<optgroup label="${escHtml(group.name)}">`;
    group.categories.forEach(cat => {
      bulkOpts += `<option value="${escHtml(cat.id)}">${escHtml(cat.name)}</option>`;
      flatOpts += `<option value="${escHtml(cat.id)}">${escHtml(cat.name)}</option>`;
    });
    bulkOpts += '</optgroup>';
  });

  // Bulk Scrape category
  const bulkSel = document.getElementById('scrapeCategory');
  if (bulkSel) bulkSel.innerHTML = bulkOpts;

  // Single URL category
  const singleSel = document.getElementById('singleUrlCategory');
  if (singleSel) singleSel.innerHTML = flatOpts;

  // Score update category
  const scoreSel = document.getElementById('scoreCategory');
  if (scoreSel) scoreSel.innerHTML = flatOpts;

  // Score Engine v2 category (keep "All Categories" first option)
  const scoreEngSel = document.getElementById('scoreEngineCategory');
  if (scoreEngSel) {
    scoreEngSel.innerHTML = flatOpts;
  }

  // Product update category
  const updateSel = document.getElementById('updateCategory');
  if (updateSel) updateSel.innerHTML = flatOpts;

  // Inventory scan category
  const invSel = document.getElementById('inventoryCategory');
  if (invSel) invSel.innerHTML = flatOpts;

  // Quality scan category
  const qualSel = document.getElementById('qualityScanCategory');
  if (qualSel) qualSel.innerHTML = flatOpts;
}

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

function prepareProductPayload(product) {
  const payload = {
    slug: String(product.slug || product.id || '').trim().slice(0, 200),
    name: String(product.name || '').trim().slice(0, 500),
    brand: String(product.brand || '').trim().slice(0, 200),
    category: String(product.category || '').trim().slice(0, 100),
    source: String(product.source || 'geizhals.eu').trim().slice(0, 100),
    sourceUrl: product.sourceUrl || undefined,
    imageUrl: product.imageUrl || undefined,
    images: Array.isArray(product.images) ? product.images.filter(Boolean) : [],
    specs: product.specs && typeof product.specs === 'object' ? product.specs : {},
    specSections: product.specSections && typeof product.specSections === 'object' ? product.specSections : {},
    keySpecs: product.keySpecs && typeof product.keySpecs === 'object' ? product.keySpecs : {},
    techScore: Number.isFinite(Number(product.techScore)) ? Number(product.techScore) : undefined,
    specsCount: Number.isFinite(Number(product.specsCount)) ? Number(product.specsCount) : 0,
    variantGroup: String(product.variantGroup || '').trim().slice(0, 200),
    scrapedAt: product.scrapedAt || new Date().toISOString(),
  };

  if (!payload.slug) payload.slug = generateProductId(slugFromUrl(payload.sourceUrl || ''));
  if (!payload.name) throw new Error('Product name is empty');

  return typeof _clean === 'function' ? _clean(payload) : payload;
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

function extractImages(doc, productSlug) {
  if (typeof doc === 'string') doc = parseHTML(doc);

  function upgradeSize(url) {
    // Replace size prefixes: /k_, /s_, /m_, /t_, /c_ → /-n.webp
    return url.replace(/\/[ksmtc]_/g, '/-n.webp');
  }

  // Find the FIRST product image from gzhls.at/pix/
  // Priority: og:image > first img[src*="gzhls.at/pix/"]
  let firstImage = '';

  // 1. Try og:image first
  const ogImg = doc.querySelector('meta[property="og:image"]');
  if (ogImg) {
    const content = ogImg.getAttribute('content');
    if (content && content.includes('gzhls.at/pix')) {
      firstImage = upgradeSize(content.trim().split(/[?#]/)[0]);
    }
  }

  // 2. Fallback to first img with gzhls.at/pix/
  if (!firstImage) {
    const img = doc.querySelector('img[src*="gzhls.at/pix/"]');
    if (img) {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
      if (src) firstImage = upgradeSize(src.trim().split(/[?#]/)[0]);
    }
  }

  // 3. Fallback to any img with gzhls.at/pix in any attribute
  if (!firstImage) {
    const allImgs = doc.querySelectorAll('img');
    for (const img of allImgs) {
      for (const attr of ['src', 'data-src', 'data-lazy', 'data-original']) {
        const val = img.getAttribute(attr);
        if (val && val.includes('gzhls.at/pix')) {
          firstImage = upgradeSize(val.trim().split(/[?#]/)[0]);
          break;
        }
      }
      if (firstImage) break;
    }
  }

  return firstImage;
}

async function fetchGalleryImages(productSlug) {
  // No longer needed - we only use the first image
  return [];
}

// ═══════════════════════════════════════
//  11. SPEC PARSING
// ═══════════════════════════════════════

function parseSpecs(doc) {
  const specs = {};
  const specSections = {};
  const keySpecs = {};

  // ── PRIMARY: geizhals.eu dl.specs-grid ──
  // Only extract the FIRST specs-grid to avoid duplicate variants
  const firstGrid = doc.querySelector('dl.specs-grid');
  if (firstGrid) {
    const sectionName = 'General';
    specSections[sectionName] = {};

    firstGrid.querySelectorAll('.specs-grid__item').forEach(item => {
      const dt = item.querySelector('dt');
      const dd = item.querySelector('dd');
      if (!dt || !dd) return;
      const key = dt.textContent.trim();
      let value = dd.textContent.trim().replace(/\s+/g, ' ');
      if (key && value && key.length < 200 && value.length < 1000) {
        specs[key] = value;
        specSections[sectionName][key] = value;
      }
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

// Batch translate German texts → target language using DeepSeek v3
async function _deepSeekBatchTranslate(germanTexts, targetLang) {
  const token = getPb()?.authStore?.token;
  if (!token) {
    console.warn('[de-translate] No auth token');
    return {};
  }

  // Filter out already-cached texts
  const uncached = germanTexts.filter(t => !_deDictLookup(t, targetLang));
  if (!uncached.length) {
    // All cached — return from cache
    const result = {};
    germanTexts.forEach(t => { result[t] = _deDictLookup(t, targetLang); });
    return result;
  }

  const langNames = {
    en: 'English', tr: 'Turkish', es: 'Spanish', fr: 'French', it: 'Italian',
    ja: 'Japanese', nl: 'Dutch', pl: 'Polish', pt: 'Portuguese', sv: 'Swedish', ar: 'Arabic'
  };

  try {
    // DeepSeek v3 batch translation — send up to 50 texts at once
    const batch = uncached.slice(0, 50);
    const textsJson = JSON.stringify(batch);

    const response = await fetch(`${PB_URL}/api/ai/deepseek`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a technical product specification translator. Translate German tech specs to ${langNames[targetLang] || targetLang}.
Rules:
- Keep numbers, units, and technical abbreviations unchanged (e.g. "5G", "Wi-Fi 6E", "120 Hz", "GB", "mm").
- Product names/brands stay as-is.
- Return ONLY a JSON object mapping each German text to its ${langNames[targetLang] || targetLang} translation.
- Format: {"original german text": "translated text", ...}`
          },
          {
            role: 'user',
            content: `Translate these German product specification terms to ${langNames[targetLang] || targetLang}:\n${textsJson}\n\nReturn only the JSON object.`
          }
        ],
        max_tokens: 4000,
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

    // Store in cache
    const result = {};
    for (const t of germanTexts) {
      const cached = _deDictLookup(t, targetLang);
      if (cached) {
        result[t] = cached;
      } else if (translations[t]) {
        _deDictStore(t, targetLang, translations[t]);
        result[t] = translations[t];
      } else {
        // Fallback: keep original German text
        result[t] = t;
      }
    }

    // Save cache to PB after batch
    await _saveDeDict();
    return result;
  } catch (e) {
    console.warn(`[de-translate] ${targetLang} error:`, e.message);
    // Return cached + fallback
    const result = {};
    germanTexts.forEach(t => {
      result[t] = _deDictLookup(t, targetLang) || t;
    });
    return result;
  }
}

// Main function: translate German specs → all target languages
// Returns: { en: {specs}, tr: {specs}, ... }
async function translateGermanSpecs(germanSpecs, targetLangs = TARGET_LANGS) {
  await _loadDeDict();

  const allGermanTexts = new Set();
  for (const [k, v] of Object.entries(germanSpecs)) {
    if (k) allGermanTexts.add(k);
    if (v) allGermanTexts.add(String(v));
  }
  const germanTexts = [...allGermanTexts].filter(t => t.length > 0);

  const results = {};
  // Process languages sequentially to avoid rate limiting
  for (const lang of targetLangs) {
    slog(`Translating specs → ${lang.toUpperCase()}...`, 'info');
    results[lang] = await _deepSeekBatchTranslate(germanTexts, lang);
  }

  // Build multi-lang specs objects
  const multiLangSpecs = {};
  for (const lang of targetLangs) {
    multiLangSpecs[lang] = {};
    for (const [k, v] of Object.entries(germanSpecs)) {
      const translatedKey = results[lang]?.[k] || k;
      const translatedVal = results[lang]?.[String(v)] || v;
      multiLangSpecs[lang][translatedKey] = translatedVal;
    }
  }

  // Save dictionary after all translations
  await _saveDeDict();
  return multiLangSpecs;
}

// Translate single German product name to all languages
async function translateGermanName(germanName, targetLangs = TARGET_LANGS) {
  await _loadDeDict();
  const names = {};
  for (const lang of targetLangs) {
    const result = await _deepSeekBatchTranslate([germanName], lang);
    names[lang] = result[germanName] || germanName;
  }
  await _saveDeDict();
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
  // Single image: first product image from gzhls.at/pix/ in -n.webp format
  const imageUrl = extractImages(doc, productSlug);

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
    imageUrl: imageUrl || undefined,
    images: imageUrl ? [imageUrl] : [],
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
  // Only flag as challenge if the title clearly indicates a challenge page
  // Proxy now auto-solves challenges, so most pages should be real content
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : '';
  const isCh = title.includes('Nur einen Moment') ||
    title.includes('Just a moment') ||
    title.includes('Checking your browser') ||
    title.includes('Sichere Verbindung wird überprüft');
  if (isCh) {
    slog(`Challenge detected in title: "${title.substring(0, 50)}"`, 'warn');
  }
  return isCh;
}

function extractProductLinksFromDoc(doc, html) {
  const results = [];
  const seen = new Set();

  // Detect challenge page
  if (isChallengePage(html)) {
    return results;
  }

  // geizhals.eu product links: /path/product-name-a1234567.html OR /path/product-name-v1234567.html
  const productLinkRe = /-[av]\d+\.html$/i;

  // Search ALL links on page, filter by geizhals product pattern
  doc.querySelectorAll('a[href]').forEach(a => {
    let href = a.getAttribute('href') || '';
    if (!href) return;

    // Handle absolute URLs from geizhals.eu
    if (href.startsWith('https://geizhals.eu/') || href.startsWith('http://geizhals.eu/') ||
        href.startsWith('https://www.geizhals.eu/') || href.startsWith('https://geizhals.at/') ||
        href.startsWith('https://geizhals.de/')) {
      try { href = new URL(href).pathname; } catch { return; }
    }

    // Must match product pattern: ends with -aDIGITS.html
    if (!productLinkRe.test(href)) return;
    // Skip non-product pages
    if (href.includes('/en/') || href.includes('/about') || href.includes('/contact')) return;

    if (!href.startsWith('/')) href = '/' + href;
    const fullUrl = GEIZHALS_BASE + href;
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    results.push({ url: fullUrl, techScore: null });
  });

  return results;
}

async function collectProductUrls(categoryPath, maxPages = 50) {
  // Since geizhals.eu search/category pages are blocked by Cloudflare,
  // we use "similar products" chain discovery from a seed product.
  // Map category to a known seed product URL.
  const catDef = (typeof QorAiCategories !== 'undefined')
    ? QorAiCategories.getAll().find(c => c.id === categoryPath || c.geizhalsSlug === categoryPath)
    : null;
  const searchTerm = catDef ? catDef.name : categoryPath;

  slog(`Collecting product URLs via similar-products chain: "${searchTerm}"`);

  // Seed products by category - these are well-known products that should exist
  const SEED_PRODUCTS = {
    'smartphones': 'https://geizhals.eu/apple-iphone-16-128gb-schwarz-a3296281.html',
    'tablets': 'https://geizhals.eu/apple-ipad-air-11-2025-128gb-space-grau-a3458383.html',
    'laptops': 'https://geizhals.eu/apple-macbook-air-13-2024-m3-8gb-ram-256gb-ssd-midnight-a3015631.html',
    'desktops': 'https://geizhals.eu/apple-mac-mini-2024-m4-16gb-ram-256gb-ssd-a3015640.html',
    'cpus': 'https://geizhals.eu/intel-core-i9-14900k-a3015650.html',
    'gpus': 'https://geizhals.eu/nvidia-geforce-rtx-4090-a3015660.html',
    'ram': 'https://geizhals.eu/corsair-vengeance-32gb-ddr5-5600-a3015670.html',
    'ssd': 'https://geizhals.eu/samsung-990-pro-1tb-a3015680.html',
    'motherboards': 'https://geizhals.eu/asus-rog-strix-b650e-f-gaming-wifi-a2824307.html',
    'psu': 'https://geizhals.eu/be-quiet-straight-power-12-850w-atx-3-0-bn336-a2884016.html',
    'cases': 'https://geizhals.eu/fractal-design-north-charcoal-black-tg-dark-fd-c-nor1c-02-a2861685.html',
    'coolers': 'https://geizhals.eu/arctic-liquid-freezer-iii-360-acfre00136a-a3128757.html',
    'headphones': 'https://geizhals.eu/sony-wh-1000xm5-schwarz-a3015690.html',
    'soundbars': 'https://geizhals.eu/samsung-hw-q995gc-a2910894.html',
    'microphones': 'https://geizhals.eu/rode-nt-usb-mini-a2221815.html',
    'smartwatches': 'https://geizhals.eu/apple-watch-series-10-gps-46mm-aluminium-diamantschwarz-a3015700.html',
    'smart-rings': 'https://geizhals.eu/samsung-galaxy-ring-titanium-black-a3244177.html',
    'cameras': 'https://geizhals.eu/sony-alpha-7-iv-a3015710.html',
    'action-cameras': 'https://geizhals.eu/dji-osmo-action-4-standard-combo-a2992034.html',
    'ip-cameras': 'https://geizhals.eu/reolink-rlc-810a-a2478796.html',
    'dashcams': 'https://geizhals.eu/garmin-dash-cam-mini-2-a2516357.html',
    'gimbals': 'https://geizhals.eu/dji-osmo-mobile-6-a2825965.html',
    'tripods': 'https://geizhals.eu/manfrotto-befree-advanced-mkbfrta4bk-bh-a1827088.html',
    'lenses': 'https://geizhals.eu/sony-fe-24-70mm-2-8-gm-ii-sel2470gm2-a2711925.html',
    'consoles': 'https://geizhals.eu/sony-playstation-5-slim-a3015720.html',
    'gamepads': 'https://geizhals.eu/microsoft-xbox-wireless-controller-carbon-black-a2363416.html',
    'vr-headsets': 'https://geizhals.eu/meta-quest-3-128gb-a3033464.html',
    'tvs': 'https://geizhals.eu/lg-oled55c47la-a3015730.html',
    'monitors': 'https://geizhals.eu/dell-ultrasharp-u2723qe-a3015740.html',
    'projectors': 'https://geizhals.eu/benq-w2710i-a2914901.html',
    'media-players': 'https://geizhals.eu/apple-tv-4k-2022-128gb-mn893fd-a2818262.html',
    'keyboards': 'https://geizhals.eu/logitech-g-pro-x-a3015750.html',
    'mice': 'https://geizhals.eu/logitech-g-pro-x-superlight-a3015760.html',
    'printers': 'https://geizhals.eu/brother-mfc-l3770cdw-a1897282.html',
    'webcams': 'https://geizhals.eu/logitech-brio-4k-ultra-hd-pro-webcam-a1565066.html',
    'routers': 'https://geizhals.eu/asus-rt-ax86u-pro-a3015770.html',
    'robot-vacuums': 'https://geizhals.eu/roborock-s8-pro-ultra-schwarz-a2908213.html',
    'powerbanks': 'https://geizhals.eu/anker-737-power-bank-24000mah-a3015780.html',
    'e-readers': 'https://geizhals.eu/amazon-kindle-paperwhite-2024-16gb-schwarz-a3297997.html',
    'speakers': 'https://geizhals.eu/jbl-flip-6-schwarz-a3015790.html',
    'drones': 'https://geizhals.eu/dji-mini-4-pro-a3015800.html',
  };

  const seedUrl = SEED_PRODUCTS[categoryPath] || SEED_PRODUCTS['smartphones'];
  slog(`Using seed product: ${seedUrl}`, 'info');

  const allItems = [];
  const seenUrls = new Set();
  const queue = [seedUrl];
  let iterations = 0;
  const maxIterations = maxPages * 10;

  while (queue.length > 0 && allItems.length < maxPages * 10 && !scraperAbort && iterations < maxIterations) {
    iterations++;
    const url = queue.shift();
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    updateProgress(allItems.length, maxPages * 10, 'Discovering');

    try {
      slog(`Fetching: ${url.substring(0, 80)}...`, 'info');
      const html = await proxyFetch(url);
      
      if (!html) {
        slog(`  → Empty response from proxy`, 'warn');
        continue;
      }
      
      if (isChallengePage(html)) {
        slog(`  → Challenge page detected, skipping`, 'warn');
        continue;
      }

      const doc = parseHTML(html);

      // Extract product info to verify this is a valid product page
      const h1 = doc.querySelector('h1');
      if (!h1) {
        slog(`  → No h1 found, not a product page`, 'warn');
        continue;
      }

      const name = h1.textContent.trim();
      if (!name || name.length < 3) {
        slog(`  → Invalid product name`, 'warn');
        continue;
      }

      // Check for specs
      const hasSpecs = doc.querySelector('dl.specs-grid') !== null;
      if (!hasSpecs) {
        slog(`  → No specs found, skipping`, 'warn');
        continue;
      }

      // Add to results
      allItems.push({ url, techScore: null });
      slog(`Discovered: ${name.substring(0, 60)}`, 'success');

      // Extract similar products from "Top-10" section
      const htmlStr = html;
      const top10Start = htmlStr.indexOf('Top-10');
      if (top10Start !== -1) {
        const section = htmlStr.substring(top10Start, top10Start + 15000);
        const linkRe = /href=["']([^"']*-[av]\d+\.html)["']/gi;
        let m;
        let newLinks = 0;
        while ((m = linkRe.exec(section)) !== null) {
          let href = m[1];
          if (href.startsWith('https://geizhals.eu/') || href.startsWith('https://geizhals.at/') || href.startsWith('https://geizhals.de/')) {
            try { href = new URL(href).pathname; } catch { continue; }
          }
          if (!href.startsWith('/')) href = '/' + href;
          const fullUrl = GEIZHALS_BASE + href;
          if (!seenUrls.has(fullUrl) && !queue.includes(fullUrl)) {
            queue.push(fullUrl);
            newLinks++;
          }
        }
        if (newLinks > 0) {
          slog(`  +${newLinks} similar products queued (${queue.length} total in queue)`, 'info');
        }
      } else {
        slog(`  → No Top-10 section found`, 'warn');
      }

      await sleep(1500 + Math.random() * 1500);
    } catch (e) {
      slog(`Error discovering from ${url}: ${e.message}`, 'error');
    }
  }

  slog(`URL collection complete: ${allItems.length} unique product URLs`, 'success');
  return allItems;
}

// ═══════════════════════════════════════
//  15. 3-CHANNEL PARALLEL SCRAPING
// ═══════════════════════════════════════

async function parallelScrape(urlItems, categoryId, delayMs = 2000, channels = 3) {
  let index = 0;
  const mutex = {
    next() {
      return index < urlItems.length ? urlItems[index++] : null;
    }
  };
  const results = { added: 0, skipped: 0, errors: 0, updated: 0 };
  let errorStreak = 0;

  _scrapeStartTime = Date.now();
  _scrapeProductCount = 0;

  const workers = Array.from({ length: channels }, (_, ch) => (async () => {
    while (!scraperAbort) {
      const item = mutex.next();
      if (!item) break;

      // Stagger delay per channel
      await sleep(delayMs + ch * 500);

      _scrapeProductCount++;
      const productNum = _scrapeProductCount;
      const slug = slugFromUrl(item.url);
      updateProgress(productNum, urlItems.length, 'Products');

      try {
        slog(`[${productNum}/${urlItems.length}] ch${ch}: ${slug}`);
        const html = await proxyFetch(item.url);
        if (!html) {
          slog(`  → 404/gone: ${slug}`, 'warn');
          results.skipped++;
          continue;
        }

        if (isChallengePage(html)) {
          slog(`  → Challenge page, skipping: ${slug}`, 'warn');
          results.skipped++;
          continue;
        }

        const product = await scrapeProductDetail(html, item.url, categoryId);
        if (!product || product.name === 'Unknown Product' || product.specsCount === 0) {
          slog(`  → Skipped (no data): ${slug}`, 'warn');
          results.skipped++;
          continue;
        }
        if (!productMatchesCategory(product, categoryId)) {
          slog(`  → Skipped (category mismatch): ${product.name}`, 'warn');
          results.skipped++;
          continue;
        }

        // Use listing-page tech score if page didn't have one
        if (!product.techScore && item.techScore) {
          product.techScore = item.techScore;
        }

        // Save to PocketBase
        const clean = prepareProductPayload(product);
        const saved = await pbSetDoc('products', clean.slug || clean.id, clean);
        if (typeof allProducts !== 'undefined' && Array.isArray(allProducts)) {
          const item = { id: saved?.id || clean.slug, ...clean };
          const existingIndex = allProducts.findIndex(p => p.id === item.id || p.slug === item.slug);
          if (existingIndex >= 0) allProducts[existingIndex] = { ...allProducts[existingIndex], ...item };
          else allProducts.unshift(item);
          totalProductCount = Math.max(totalProductCount || 0, allProducts.length);
          if (typeof displayProducts !== 'undefined') displayProducts = allProducts;
          if (typeof renderProductsPage === 'function') renderProductsPage();
          const countEl = document.getElementById('productCount');
          if (countEl) countEl.textContent = String(totalProductCount || allProducts.length);
        }
        results.added++;
        errorStreak = 0;
        slog(`  → Added: ${product.name} (${product.specsCount} specs, score: ${product.techScore || '-'})`, 'success');

        // Periodically persist untranslated terms for later reuse
        if (results.added > 0 && results.added % 5 === 0) {
          triggerAITranslation();
        }
      } catch (e) {
        results.errors++;
        errorStreak++;
        const details = e.response?.data || e.data || {};
        slog(`  → Error: ${slug} — ${e.message}`, 'error');
        Object.entries(details).forEach(([k,v]) => {
          slog(`     ${k}: ${JSON.stringify(v).substring(0,200)}`, 'error');
        });

        // Exponential backoff on error streak
        if (errorStreak >= 3) {
          const backoff = Math.min(10000 * Math.pow(2, errorStreak - 3), 120000);
          slog(`Error streak (${errorStreak}), backing off ${(backoff / 1000).toFixed(0)}s...`, 'warn');
          await sleep(backoff);
        }
      }
    }
  })());

  await Promise.all(workers);
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
  slog(`Bulk scrape: ${catValue}, max ${maxProducts}`, 'info');

  try {
    // Phase 1: Collect product URLs via similar-products chain discovery
    slog('── Phase 1: Collecting product URLs ──', 'info');
    const urlItems = await collectProductUrls(catValue, Math.ceil(maxProducts / 10));
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

    // Phase 2: Scrape products in parallel (2 channels for bulk)
    const results = await parallelScrape(toScrape, catValue, delay, 2);

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
        await pbSetDoc('products', clean.slug || clean.id, clean);
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
        await pbSetDoc('products', clean.slug || clean.id, clean);
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
//  21. PRODUCT UPDATE (Full Re-scrape)
// ═══════════════════════════════════════

async function startProductUpdate() {
  if (scraperRunning) { toast('Scraper already running', 'w'); return; }
  if (!(await checkProxy())) { toast('Start the local proxy first', 'e'); return; }

  const cat = document.getElementById('updateCategory')?.value || '';
  const limitRaw = document.getElementById('updateLimit')?.value;
  const limit = limitRaw && limitRaw.trim() ? parseInt(limitRaw) : 0; // 0 = no limit
  const delay = parseInt(document.getElementById('updateDelay')?.value) || 2000;

  scraperRunning = true;
  scraperAbort = false;
  clearScraperLog();

  await loadLearnedTranslations();
  slog('Loading products for update...');

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

  slog(`Updating ${products.length} products...`);
  _scrapeStartTime = Date.now();

  let updated = 0, unchanged = 0, deleted = 0, failed = 0;

  for (let i = 0; i < products.length && !scraperAbort; i++) {
    const existing = products[i];
    try {
      updateProgress(i + 1, products.length, 'Updating');
      slog(`[${i + 1}/${products.length}] ${existing.name || existing.id}`);

      const html = await proxyFetch(existing.sourceUrl);

      // Detect garbage/redirect pages — auto-delete
      if (!html) {
        slog(`  → Page gone (404). Deleting from DB.`, 'warn');
        try {
          await pbDeleteDoc('products', existing.id);
          deleted++;
          if (typeof allProducts !== 'undefined') {
            const idx = allProducts.findIndex(p => p.id === existing.id);
            if (idx >= 0) allProducts.splice(idx, 1);
          }
        } catch {}
        continue;
      }

      if (isChallengePage(html)) {
        slog(`  → Challenge page, skipping update: ${existing.name || existing.id}`, 'warn');
        failed++;
        continue;
      }

      const freshProduct = await scrapeProductDetail(html, existing.sourceUrl, existing.category);
      if (!freshProduct || freshProduct.name === 'Unknown Product' || freshProduct.specsCount === 0) {
        slog(`  → Garbage page detected. Deleting from DB.`, 'warn');
        try {
          await pbDeleteDoc('products', existing.id);
          deleted++;
        } catch {}
        continue;
      }

      // Compare fields and build update object
      const changes = {};
      const compareFields = [
        'name', 'brand', 'techScore', 'imageUrl',
        'specsCount', 'variantGroup'
      ];
      for (const field of compareFields) {
        if (freshProduct[field] !== undefined &&
          JSON.stringify(freshProduct[field]) !== JSON.stringify(existing[field])) {
          changes[field] = freshProduct[field];
        }
      }

      // Deep compare objects
      const objFields = ['specs', 'specSections', 'keySpecs', 'images'];
      for (const field of objFields) {
        if (freshProduct[field] !== undefined &&
          JSON.stringify(freshProduct[field]) !== JSON.stringify(existing[field])) {
          changes[field] = freshProduct[field];
        }
      }

      if (Object.keys(changes).length > 0) {
        changes.updatedAt = new Date().toISOString();
        await pbUpdateDoc('products', existing.id, changes);
        const changedKeys = Object.keys(changes).filter(k => !k.startsWith('_') && k !== 'updatedAt');
        slog(`  → Updated: ${changedKeys.join(', ')}`, 'success');
        updated++;

        // Update in-memory
        if (typeof allProducts !== 'undefined') {
          const mem = allProducts.find(p => p.id === existing.id);
          if (mem) Object.assign(mem, changes);
        }
      } else {
        unchanged++;
      }

      await sleep(delay);
    } catch (e) {
      slog(`  → Error: ${e.message}`, 'error');
      failed++;
    }
  }

  triggerAITranslation();

  slog(`\n═══ Product update complete ═══`, 'success');
  slog(`Updated: ${updated} | Unchanged: ${unchanged} | Deleted: ${deleted} | Failed: ${failed}${scraperAbort ? ' | STOPPED' : ''}`,
    updated > 0 ? 'success' : 'info');
  finishScraping();
}

// ═══════════════════════════════════════
//  22. INVENTORY SCAN
// ═══════════════════════════════════════

async function startInventoryScan() {
  if (scraperRunning) { toast('Scraper already running', 'w'); return; }
  if (!(await checkProxy())) { toast('Start the local proxy first', 'e'); return; }

  const catSelect = document.getElementById('inventoryCategory');
  const catValue = catSelect ? catSelect.value : '';
  if (!catValue) { toast('Select a category', 'w'); return; }

  const cats = (window.QorAiCategories) ? window.QorAiCategories.getAll() : [];
  const catDef = cats.find(c => c.id === catValue || c.geizhalsSlug === catValue);
  const geizhalsPath = catDef ? (catDef.geizhalsSlug || catDef.id) : catValue;
  const categoryId = catDef ? catDef.id : catValue;

  const pages = parseInt(document.getElementById('inventoryPages')?.value) || 30;

  scraperRunning = true;
  scraperAbort = false;
  clearScraperLog();

  slog(`Scanning inventory: ${categoryId} (${geizhalsPath}), up to ${pages} pages`);

  // Get existing source URLs
  const existingUrls = new Set();
  if (typeof allProducts !== 'undefined' && allProducts.length > 0) {
    allProducts.filter(p => p.category === categoryId)
      .forEach(p => { if (p.sourceUrl) existingUrls.add(p.sourceUrl); });
  } else {
    try {
      const items = await pbGetAll('products', { filter: `category="${categoryId}"` });
      items.forEach(d => {
        const data = d.data();
        if (data.sourceUrl) existingUrls.add(data.sourceUrl);
      });
    } catch {}
  }

  slog(`Existing products in DB: ${existingUrls.size}`);

  // Crawl category pages
  const urlItems = await collectProductUrls(geizhalsPath, pages);

  if (scraperAbort) {
    slog('Scan stopped by user', 'warn');
    finishScraping();
    return;
  }

  const allUrls = urlItems.map(item => item.url);
  const newUrls = allUrls.filter(u => !existingUrls.has(u));
  const missingUrls = [...existingUrls].filter(u => !allUrls.includes(u));

  slog(`\n═══ Inventory scan complete ═══`, 'success');
  slog(`Total on geizhals.eu: ${allUrls.length}`);
  slog(`Already in database: ${allUrls.length - newUrls.length}`);
  slog(`New products found: ${newUrls.length}`, newUrls.length > 0 ? 'success' : 'info');
  if (missingUrls.length > 0) {
    slog(`Products in DB but not on site: ${missingUrls.length}`, 'warn');
  }

  if (newUrls.length > 0 && newUrls.length <= 50) {
    slog(`\nNew product URLs:`);
    newUrls.forEach(u => slog(`  → ${u}`));
  } else if (newUrls.length > 50) {
    slog(`\nShowing first 50 of ${newUrls.length} new URLs:`);
    newUrls.slice(0, 50).forEach(u => slog(`  → ${u}`));
    slog(`  ... and ${newUrls.length - 50} more`);
  }

  if (newUrls.length > 0) {
    slog(`\nUse Bulk Scrape to add these ${newUrls.length} products.`);
  }

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

// ═══════════════════════════════════════
//  24. UTILITY: DEEP DIFF FOR LOGGING
// ═══════════════════════════════════════

function shallowDiff(oldObj, newObj) {
  const changes = {};
  const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
  for (const key of allKeys) {
    if (JSON.stringify(oldObj?.[key]) !== JSON.stringify(newObj?.[key])) {
      changes[key] = { old: oldObj?.[key], new: newObj?.[key] };
    }
  }
  return changes;
}

// ═══════════════════════════════════════
//  25. QUALITY SCAN (Çift Katman Tarama)
// ═══════════════════════════════════════

// Normalize a product name for duplicate detection:
// removes storage/RAM sizes and trailing serial codes
function _normalizeForDedup(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\b\d+\s*gb(\s*ram)?\b/gi, '')
    .replace(/\b\d+\s*tb\b/gi, '')
    .replace(/\b\d+\s*mb\b/gi, '')
    .replace(/\b\d+\s*gb\s*\/\s*\d+\s*gb\b/gi, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Score a product's data quality (higher = better)
function _qualityScore(p) {
  return (p.specsCount || Object.keys(p.specs || {}).length) * 3
    + ((p.images || []).length) * 2
    + (p.techScore ? 10 : 0)
    + (p.brand ? 5 : 0)
    + (p.imageUrl || p.imageURL ? 5 : 0);
}

// Test whether an image URL is actually loadable (returns a visible image)
function testImageUrl(url) {
  return new Promise((resolve) => {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) { resolve(false); return; }
    const img = new Image();
    const timer = setTimeout(() => { img.src = ''; resolve(false); }, 6000);
    img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 0); };
    img.onerror = () => { clearTimeout(timer); resolve(false); };
    img.src = url;
  });
}

// Detect quality issues for a single product
function _qualityIssues(p, minSpecs, minImages) {
  const issues = [];
  const specCount = p.specsCount || Object.keys(p.specs || {}).length;
  const hasImage = !!(p.imageUrl || p.imageURL || (p.images && p.images.length > 0));
  const imageCount = (p.images || []).length + (hasImage ? 1 : 0);
  if (!hasImage) issues.push('görsel yok');
  else if (imageCount < minImages) issues.push(`sadece ${imageCount} görsel`);
  if (specCount < minSpecs) issues.push(`sadece ${specCount} spec`);
  return issues;
}

// Normalize a single image URL (upgrade size prefix + strip querystring + lowercase + drop extension for dedup key).
// We keep the actual URL but use a canonical key for de-duplication.
function _normImgUrl(u) {
  if (!u) return u;
  return u.replace(/\/[ksmtc]_/g, '/-n.webp').split(/[?#]/)[0].trim();
}
function _imgDedupKey(u) {
  if (!u) return '';
  // Lowercase + strip extension so .jpg/.webp/.jpeg of the same file collapse
  return _normImgUrl(u).toLowerCase().replace(/\.(jpe?g|png|webp|gif|avif)$/, '');
}

// Deduplicate + normalize + cap at 8 for a product's image list
function _cleanImgList(imgs) {
  const seen = new Set();
  const out = [];
  for (const raw of (imgs || [])) {
    const u = _normImgUrl(raw);
    const key = _imgDedupKey(u);
    if (u && key && !seen.has(key)) { seen.add(key); out.push(u); }
    if (out.length >= 8) break;
  }
  return out;
}

// One-shot bulk image cleanup: normalize URLs, remove duplicates, cap at 8
async function fixAllImages() {
  if (scraperRunning) { toast('Scraper is already running', 'w'); return; }
  scraperRunning = true;
  scraperAbort = false;
  document.getElementById('btnFixImages').style.display = 'none';
  document.getElementById('btnStopQuality').style.display = '';
  clearScraperLog();
  slog('══ Image Cleanup Started ══', 'info');
  slog('Scanning all products: normalize URLs + remove duplicates + max 8...', 'info');

  let products = [];
  try {
    const total = (await getPb().collection('products').getList(1, 1, {})).totalItems;
    const pages = Math.ceil(total / 500);
    slog(`Total ${total} products, ${pages} pages`, 'info');
    for (let page = 1; page <= pages && !scraperAbort; page++) {
      const r = await getPb().collection('products').getList(page, 500, {});
      products.push(...r.items);
      updateProgress(page, pages, 'Loading');
    }
  } catch(e) { slog('Load error: ' + e.message, 'error'); _finishQualityScan(); return; }

  slog(`✓ ${products.length} products loaded. Cleaning...`, 'success');

  let fixed = 0, skipped = 0;
  for (let i = 0; i < products.length && !scraperAbort; i++) {
    const p = products[i];
    updateProgress(i + 1, products.length, 'Cleaning');

    const cleaned = _cleanImgList(p.images);
    const cleanedUrl = _normImgUrl(p.imageUrl || p.imageURL || cleaned[0] || '');

    // Only update if something changed
    const needsUpdate = (cleaned.length !== (p.images || []).length)
      || cleaned.some((v, idx) => v !== (p.images || [])[idx])
      || cleanedUrl !== (p.imageUrl || p.imageURL || '');

    if (!needsUpdate) { skipped++; continue; }

    try {
      await pbUpdateDoc('products', p.id, {
        images: cleaned,
        imageUrl: cleanedUrl,
        imageURL: cleanedUrl,
      });
      fixed++;
      if (fixed <= 20 || fixed % 100 === 0) {
        slog(`  ✓ ${p.name || p.id}: ${(p.images||[]).length} → ${cleaned.length} images`, 'success');
      }
    } catch(e) {
      slog(`  ✗ ${p.name || p.id}: ${e.message}`, 'error');
    }
  }

  slog(`\n══ Completed ══`, 'success');
  slog(`✓ Fixed: ${fixed} | Already clean: ${skipped}`, 'success');
  _finishQualityScan();
  document.getElementById('btnFixImages').style.display = '';
}

async function startQualityScan() {
  if (scraperRunning) { toast('Scraper is already running', 'w'); return; }
  if (!(await checkProxy())) { toast('Start the proxy first', 'e'); return; }

  const cat = document.getElementById('qualityScanCategory')?.value || '';
  const minSpecs = parseInt(document.getElementById('qualityMinSpecs')?.value) || 5;
  const minImages = parseInt(document.getElementById('qualityMinImages')?.value) || 1;
  const doRescrape = document.getElementById('qualityRescrape')?.checked !== false;
  const doDedupe = document.getElementById('qualityDedupe')?.checked !== false;
  const doCheckImages = document.getElementById('qualityCheckImages')?.checked === true;
  const delay = parseInt(document.getElementById('qualityScanDelay')?.value) || 2000;

  scraperRunning = true;
  scraperAbort = false;
  document.getElementById('btnQualityScan').style.display = 'none';
  document.getElementById('btnStopQuality').style.display = '';
  clearScraperLog();
  await loadLearnedTranslations();

  slog('══ Quality Scan Started ══', 'info');
  slog(`Category: ${cat || 'All'} | Min specs: ${minSpecs} | Min images: ${minImages}`, 'info');

  // ── Load all products via pagination (PB perPage capped at 500) ──
  slog('\n[1/4] Loading products from PocketBase...', 'info');
  let products = [];
  try {
    const filter = cat ? `category="${cat}"` : '';
    const PER_PAGE = 500;
    const first = await getPb().collection('products').getList(1, PER_PAGE, { filter, sort: '-techScore' });
    const total = first.totalItems;
    const pages = Math.ceil(total / PER_PAGE);
    products.push(...first.items.map(d => ({ _docId: d.id, ...d })));
    slog(`Total ${total} products, ${pages} pages`, 'info');
    updateProgress(1, pages, 'Loading');
    for (let page = 2; page <= pages && !scraperAbort; page++) {
      const r = await getPb().collection('products').getList(page, PER_PAGE, { filter, sort: '-techScore' });
      products.push(...r.items.map(d => ({ _docId: d.id, ...d })));
      updateProgress(page, pages, 'Loading');
    }
    slog(`✓ ${products.length} products loaded`, 'success');
  } catch (e) {
    slog(`Products could not be loaded: ${e.message}`, 'error');
    _finishQualityScan();
    return;
  }

  // ── Phase 1: Detect quality issues ──
  slog(`\n[2/4] Running quality checks...`, 'info');
  const badProducts = [];
  const goodProducts = [];

  for (const p of products) {
    const issues = _qualityIssues(p, minSpecs, minImages);
    if (issues.length > 0 && p.sourceUrl) {
      badProducts.push({ ...p, _issues: issues });
    } else {
      goodProducts.push(p);
    }
  }

  slog(`✓ Clean: ${goodProducts.length} | ⚠️ Problematic: ${badProducts.length}`, badProducts.length > 0 ? 'warn' : 'success');
  if (badProducts.length > 0) {
    slog('Problematic products (first 30):', 'warn');
    badProducts.slice(0, 30).forEach(p => slog(`  ⚠️ ${p.name || p._docId}: ${p._issues.join(', ')}`, 'warn'));
    if (badProducts.length > 30) slog(`  ... and ${badProducts.length - 30} more products`, 'warn');
  }

  // ── Phase 1b: Broken image URL check (optional, parallel batched) ──
  if (doCheckImages && !scraperAbort) {
    slog(`\n[2b/4] Testing image URL reachability (${goodProducts.length + badProducts.length} products)...`, 'info');
    slog('Testing in parallel batches of 20...', 'info');
    let brokenCount = 0;
    const allToCheck = [...goodProducts];
    const BATCH = 20;
    let processed = 0;
    for (let i = 0; i < allToCheck.length && !scraperAbort; i += BATCH) {
      const slice = allToCheck.slice(i, i + BATCH);
      const results = await Promise.all(slice.map(p => {
        const url = p.imageUrl || p.imageURL || (p.images && p.images[0]) || '';
        if (!url) return Promise.resolve({ p, ok: true, skip: true });
        return testImageUrl(url).then(ok => ({ p, ok }));
      }));
      for (const { p, ok, skip } of results) {
        if (skip || ok) continue;
        if (!p.sourceUrl) continue;
        slog(`  🔴 Broken image: ${p.name || p._docId}`, 'warn');
        const alreadyBad = badProducts.some(b => b._docId === p._docId);
        if (!alreadyBad) {
          badProducts.push({ ...p, _issues: ['broken image URL'] });
          const idx = goodProducts.findIndex(g => g._docId === p._docId);
          if (idx !== -1) goodProducts.splice(idx, 1);
        } else {
          const existing = badProducts.find(b => b._docId === p._docId);
          if (existing && !existing._issues.includes('broken image URL')) {
            existing._issues.push('broken image URL');
          }
        }
        brokenCount++;
      }
      processed += slice.length;
      updateProgress(processed, allToCheck.length, 'Image Test');
    }
    slog(`✓ Broken image URL test complete: ${brokenCount} broken images found`, brokenCount > 0 ? 'warn' : 'success');
  }

  // ── Phase 1b: Re-scrape bad products ──
  if (doRescrape && badProducts.length > 0 && !scraperAbort) {
    slog(`\n[3/4] Re-scraping ${badProducts.length} problematic products...`, 'info');
    _scrapeStartTime = Date.now();
    let fixed = 0, failed = 0, deleted = 0;

    for (let i = 0; i < badProducts.length && !scraperAbort; i++) {
      const p = badProducts[i];
      updateProgress(i + 1, badProducts.length, 'Re-scrape');
      slog(`[${i + 1}/${badProducts.length}] ${p.name || p._docId} (${p._issues.join(', ')})`);

      try {
        const html = await proxyFetch(p.sourceUrl);
        if (!html) {
          slog(`  → 404/missing. Deleting...`, 'warn');
          await pbDeleteDoc('products', p._docId);
          deleted++;
          continue;
        }

        const fresh = await scrapeProductDetail(html, p.sourceUrl, p.category || cat);
        if (!fresh || (fresh.specsCount || 0) === 0) {
          slog(`  → Invalid page. Skipping.`, 'warn');
          failed++;
          continue;
        }

        const update = { qualityFixedAt: new Date().toISOString() };

        // Images: use helper to normalize + deduplicate + cap at 8
        const mergedSliced = _cleanImgList([...(fresh.images || []), ...(p.images || [])]);
        update.images = mergedSliced;
        update.imageUrl = mergedSliced[0] || '';
        update.imageURL = mergedSliced[0] || '';

        // Specs: use whichever has more
        const existingSpecCount = p.specsCount || Object.keys(p.specs || {}).length;
        const freshSpecCount = fresh.specsCount || 0;
        if (freshSpecCount >= existingSpecCount) {
          update.specs = fresh.specs;
          update.specSections = fresh.specSections;
          update.keySpecs = fresh.keySpecs;
          update.specsCount = freshSpecCount;
        }

        if (!p.techScore && fresh.techScore) update.techScore = fresh.techScore;
        if (!p.brand && fresh.brand) update.brand = fresh.brand;

        await pbUpdateDoc('products', p._docId, update);

        const improvements = [];
        if (update.images) improvements.push(`${mergedSliced.length} images`);
        if (update.specs) improvements.push(`${freshSpecCount} spec`);
        slog(`  → Fixed: ${improvements.join(', ')}`, 'success');
        fixed++;
      } catch (e) {
        slog(`  → Error: ${e.message}`, 'error');
        failed++;
      }

      await sleep(delay);
    }

    slog(`\nRe-scrape complete: Fixed ${fixed} | Failed ${failed} | Deleted ${deleted}`, 'success');
  } else if (!doRescrape) {
    slog('\n[3/4] Re-scrape skipped (option disabled)', 'info');
  }

  // ── Phase 2: Deduplication ──
  if (doDedupe && !scraperAbort) {
    slog('\n[4/4] Starting deduplication scan...', 'info');
    await _runDeduplication(products, cat);
  } else if (!doDedupe) {
    slog('\n[4/4] Deduplication scan skipped (option disabled)', 'info');
  }

  slog('\n═══ Quality Scan Complete ═══', 'success');
  triggerAITranslation();
  _finishQualityScan();
}

async function startDeduplicateOnly() {
  if (scraperRunning) { toast('Scraper is already running', 'w'); return; }

  const cat = document.getElementById('qualityScanCategory')?.value || '';

  scraperRunning = true;
  scraperAbort = false;
  document.getElementById('btnQualityScan').style.display = 'none';
  document.getElementById('btnStopQuality').style.display = '';
  clearScraperLog();

  slog('══ Deduplication Cleanup Started ══', 'info');
  slog(`Category: ${cat || 'All'}`, 'info');

  slog('\nLoading products from PocketBase...', 'info');
  let products = [];
  try {
    const filter = cat ? `category="${cat}"` : '';
    const PER_PAGE = 500;
    const first = await getPb().collection('products').getList(1, PER_PAGE, { filter, sort: '-techScore' });
    const total = first.totalItems;
    const pages = Math.ceil(total / PER_PAGE);
    products.push(...first.items.map(d => ({ _docId: d.id, ...d })));
    for (let page = 2; page <= pages && !scraperAbort; page++) {
      const r = await getPb().collection('products').getList(page, PER_PAGE, { filter, sort: '-techScore' });
      products.push(...r.items.map(d => ({ _docId: d.id, ...d })));
      updateProgress(page, pages, 'Loading');
    }
    slog(`✓ ${products.length} products loaded`, 'success');
  } catch (e) {
    slog(`Could not load: ${e.message}`, 'error');
    _finishQualityScan();
    return;
  }

  await _runDeduplication(products, cat);

  slog('\n═══ Deduplication Cleanup Complete ═══', 'success');
  _finishQualityScan();
}

async function _runDeduplication(products, categoryFilter) {
  // Step 1: Group by exact same sourceUrl (definitive duplicates)
  slog('\n— Checking duplicates with the same source URL...', 'info');
  const byUrl = new Map();
  for (const p of products) {
    if (categoryFilter && p.category !== categoryFilter) continue;
    const url = (p.sourceUrl || '').replace(/\?.*$/, '').replace(/\/$/, '').toLowerCase();
    if (!url) continue;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(p);
  }

  const urlDups = [...byUrl.values()].filter(g => g.length > 1);
  slog(`${urlDups.length} duplicate groups found by same URL`, urlDups.length > 0 ? 'warn' : 'success');

  let totalDeleted = 0;

  for (const group of urlDups) {
    if (scraperAbort) break;
    const sorted = group.slice().sort((a, b) => _qualityScore(b) - _qualityScore(a));
    const keeper = sorted[0];
    const toDelete = sorted.slice(1);
    slog(`\n[URL Dup] "${keeper.name || keeper._docId}"`, 'warn');
    slog(`  ✓ KEPT: ${keeper._docId} (score: ${_qualityScore(keeper)})`, 'success');
    for (const dup of toDelete) {
      slog(`  🗑️ DELETED: ${dup._docId} (score: ${_qualityScore(dup)})`, 'warn');
      try {
        await _mergeAndDelete(keeper, dup);
        totalDeleted++;
      } catch (e) {
        slog(`    Error: ${e.message}`, 'error');
      }
    }
  }

  // Step 2: Group by normalized name within category
  slog('\n— Checking duplicates by name similarity...', 'info');
  const byName = new Map();
  for (const p of products) {
    if (categoryFilter && p.category !== categoryFilter) continue;
    const normName = _normalizeForDedup(p.name);
    if (!normName || normName.length < 5) continue;
    const key = `${p.category || ''}::${normName}`;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(p);
  }

  const nameDups = [...byName.entries()].filter(([, g]) => g.length > 1);
  slog(`${nameDups.length} potential duplicate groups found by name`, nameDups.length > 0 ? 'warn' : 'success');

  for (const [key, group] of nameDups) {
    if (scraperAbort) break;

    // Skip if these products clearly differ (different spec counts by large margin = variants, not dups)
    const specCounts = group.map(p => p.specsCount || Object.keys(p.specs || {}).length);
    const maxSpec = Math.max(...specCounts);
    const minSpec = Math.min(...specCounts);
    // If specs vary greatly, they're likely different variants — keep all
    if (maxSpec > 0 && minSpec > 0 && maxSpec / minSpec > 2.5) continue;

    const sorted = group.slice().sort((a, b) => _qualityScore(b) - _qualityScore(a));
    const keeper = sorted[0];
    const toDelete = sorted.slice(1);

    slog(`\n[Name Dup] "${key.split('::')[1]}"`, 'warn');
    slog(`  ✓ KEPT: ${keeper.name || keeper._docId} (score: ${_qualityScore(keeper)}, specs: ${keeper.specsCount || 0})`, 'success');
    for (const dup of toDelete) {
      slog(`  🗑️ DELETED: ${dup.name || dup._docId} (score: ${_qualityScore(dup)}, specs: ${dup.specsCount || 0})`, 'warn');
      try {
        await _mergeAndDelete(keeper, dup);
        totalDeleted++;
      } catch (e) {
        slog(`    Error: ${e.message}`, 'error');
      }
    }
  }

  slog(`\nDeduplication complete: ${totalDeleted} records deleted`, 'success');
}

// Merge images from dup into keeper, then delete dup
async function _mergeAndDelete(keeper, dup) {
  const keeperImages = keeper.images || [];
  const dupImages = dup.images || [];
  const mergedImages = [...new Set([...keeperImages, ...dupImages])].filter(Boolean);

  if (mergedImages.length > keeperImages.length) {
    await pbUpdateDoc('products', keeper._docId, {
      images: mergedImages,
      imageUrl: mergedImages[0] || keeper.imageUrl || '',
      imageURL: mergedImages[0] || keeper.imageURL || '',
    });
    keeper.images = mergedImages;
    slog(`    + ${mergedImages.length - keeperImages.length} görsel taşındı`, 'info');
  }

  await pbDeleteDoc('products', dup._docId);
}

function _finishQualityScan() {
  scraperRunning = false;
  scraperAbort = false;
  _scrapeStartTime = null;
  _scrapeProductCount = 0;
  const pg = document.getElementById('scraperProgress');
  if (pg) pg.textContent = '';
  const btnStart = document.getElementById('btnQualityScan');
  const btnStop = document.getElementById('btnStopQuality');
  if (btnStart) btnStart.style.display = '';
  if (btnStop) btnStop.style.display = 'none';
}
