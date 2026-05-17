// ═══════════════════════════════════════════════════════════════════
//  QOR AI SCRAPER MODULE — epey.com Scraper
//  Scrapes products from epey.com via local Puppeteer proxy.
//  Translates Turkish → 12 languages using DeepSeek v3 + dictionary cache.
//  Uses QorAiCategories / QorAiBrands (categories.js).
//  Persists to PocketBase via pb_client.js helpers.
// ═══════════════════════════════════════════════════════════════════

const PROXY_URL = 'http://localhost:3456';
const EPEY_BASE = 'https://www.epey.com';
const LEGACY_BASE = EPEY_BASE;
const LEGACY_LISTING_EXTRA = '';
const PROXY_START_COMMAND = 'npm run scraper:proxy';
const SCRAPER_BUILD = '20260517v3-epey-balanced-cats';
const DEEPSEEK_URL = '/api/ai/deepseek';
const DEEPSEEK_MODEL = 'deepseek-chat'; // v3 model for cost-effective translation
const SUPPORTED_LANGS = ['tr','en','de','es','fr','it','ja','nl','pl','pt','sv','ar'];
// Languages to translate Turkish specs into (skip tr since source is Turkish)
const TARGET_LANGS = ['en','de','es','fr','it','ja','nl','pl','pt','sv','ar'];

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

function findCategoryByLegacyUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url, LEGACY_BASE);
    // New ?cat= format
    const catParam = u.searchParams.get('cat');
    if (catParam && typeof QorAiCategories !== 'undefined') {
      const all = QorAiCategories.getAll();
      const found = all.find(c => c.LegacySlug === catParam);
      if (found) return found;
    }
    // Old path format: https://Legacy.eu/<cat-slug>
    const parts = u.pathname.split('/').filter(Boolean);
    const catSlug = parts[0] || '';
    if (typeof QorAiCategories !== 'undefined') {
      const all = QorAiCategories.getAll();
      const found = all.find(c => c.id === catSlug || (c.LegacySlug && c.LegacySlug === catSlug));
      if (found) return found;
    }
    return null;
  } catch { return null; }
}

function findCategoryByLegacySlug(slug) {
  const token = String(slug || '').trim();
  if (!token || typeof QorAiCategories === 'undefined') return null;
  return QorAiCategories.getAll().find(c => c.LegacySlug === token || c.id === token) || null;
}

function detectCategoryFromDoc(doc, fallbackCategory = '') {
  if (!doc || typeof QorAiCategories === 'undefined') return fallbackCategory || '';
  const links = Array.from(doc.querySelectorAll('a[href*="cat="]'));
  for (const a of links) {
    try {
      const href = a.getAttribute('href') || '';
      const u = new URL(href, LEGACY_BASE);
      const cat = u.searchParams.get('cat');
      const found = findCategoryByLegacySlug(cat);
      if (found) return found.id;
    } catch {}
  }

  const text = (doc.body?.textContent || '').toLowerCase();
  const all = QorAiCategories.getAll();
  const sorted = [...all].sort((a, b) => b.name.length - a.name.length);
  for (const c of sorted) {
    const name = String(c.name || '').toLowerCase();
    const de = String(c.nameDe || '').toLowerCase();
    if ((name && text.includes(name)) || (de && text.includes(de))) return c.id;
  }
  return fallbackCategory || '';
}

function extractProductIdentifiers(doc) {
  const ids = { gtin: '', mpn: '' };
  const scan = (key, value) => {
    const k = String(key || '').toLowerCase();
    const v = String(value || '').replace(/\s+/g, ' ').trim();
    if (!v) return;
    if (!ids.gtin && /\b(ean|gtin|upc)\b/i.test(k)) {
      const m = v.match(/\b\d{8,14}\b/);
      if (m) ids.gtin = m[0];
    }
    if (!ids.mpn && /(mpn|manufacturer.*part|part.*number|hersteller.*nr|herstellernummer|artikelnummer|modellnummer)/i.test(k)) {
      ids.mpn = v.split(/\s*[|,;]\s*/)[0].slice(0, 200);
    }
  };

  doc.querySelectorAll('dl.specs-grid .specs-grid__item').forEach(item => {
    scan(item.querySelector('dt')?.textContent, item.querySelector('dd')?.textContent);
  });
  doc.querySelectorAll('table tr').forEach(row => {
    const cells = row.querySelectorAll('th,td');
    if (cells.length >= 2) scan(cells[0].textContent, cells[1].textContent);
  });
  return ids;
}

function productUrlMatchesCategory(url, categoryId) {
  if (!url || !categoryId) return false;
  const slug = categorySlugFromUrl(url);
  const catDef = (typeof QorAiCategories !== 'undefined')
    ? QorAiCategories.getAll().find(c => c.id === categoryId || c.LegacySlug === categoryId)
    : null;
  const expected = catDef?.LegacySlug || categoryId;
  return slug === expected;
}

function normalizeLegacyProductUrl(url) {
  try {
    const u = new URL(url, LEGACY_BASE);
    return `${LEGACY_BASE}${u.pathname}`;
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

/**
 * Forces the local proxy to drop its current Puppeteer browser, cookies and
 * User-Agent fingerprint and start a fresh one on the next request. This is
 * the ONLY reliable way to recover from a sticky Cloudflare challenge: the
 * decision is per-session, so any amount of sleeping won't help unless we
 * rotate the fingerprint. Used by both Phase 1 (URL collection) and Phase 2
 * (product detail scrape).
 */
async function resetProxySessionShared(reason) {
  try {
    slog(`🧹 Resetting proxy session (${reason}) — fresh browser + cookies + UA`, 'warn');
    const r = await fetch(`${PROXY_URL}/reset-session`, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) slog(`  ⚠️ reset-session HTTP ${r.status}`, 'warn');
  } catch (e) {
    slog(`  ⚠️ reset-session failed: ${e.message}`, 'warn');
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
  // The category dropdowns live in panels that may render before the category
  // catalog finishes loading. Re-populate them whenever a tab is opened so the
  // "Add by URL" / "Bulk Scrape" selects are never empty.
  if (['singleUrl', 'bulkScrape', 'offers'].includes(btn.dataset.tab)
      && typeof populateScraperCategories === 'function') {
    populateScraperCategories().catch(() => {});
  }
}

function updateScrapeModeUI() {
  const searchField = document.getElementById('scrapeSearchField');
  const catField = document.getElementById('scrapeCategoryField');
  const hint = document.getElementById('scrapeModeHint');
  if (searchField) searchField.style.display = '';
  if (catField) catField.style.display = 'none';
  if (hint) {
    hint.textContent = 'Marka + kategori seç (ör. Apple → Akıllı Telefon) → sadece o markanın o kategorideki ürünleri gelir, alakasız sonuç yok. Kategori boş bırakılırsa tüm Epey araması yapılır (karışık sonuç).';
  }
}
window.updateScrapeModeUI = updateScrapeModeUI;
document.addEventListener('DOMContentLoaded', updateScrapeModeUI);

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
    .replace(/\b(?:black|white|silver|gold|blue|purple|violet|pink|red|green|gray|grey|titanium|starlight|midnight|orange|sand|camouflage|camo|beige|khaki|mint|aqua|turquoise|teal|coral|brown|natural|ivory|schwarz|weiß|weiss|silber|blau|grün|gruen)\b/gi, '')
    .replace(/\b\d+(?:[.,]\d+)?\s*w\b/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 140);
}

function modelFamilyKey({ name, brand, category }) {
  let s = String(name || '').toLowerCase();
  const b = String(brand || '').toLowerCase().trim();
  if (b) s = s.replace(new RegExp(`^${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '');
  const familyProbe = s
    .replace(/[()[\],"'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const familyPatterns = [
    /\b(thinkpad\s+[a-z]\d+[a-z0-9]*(?:\s+gen\s+\d+)?)\b/i,
    /\b(thinkcentre\s+[a-z]+\d+[a-z0-9-]*)\b/i,
    /\b(thinkstation\s+[a-z]+\d+[a-z0-9-]*)\b/i,
    /\b(ideapad\s+\d+\s+pro)\b/i,
    /\b(ideapad\s+\d+\s+2[\s-]?in[\s-]?1)\b/i,
    /\b(ideapad\s+\d+\s+slim)\b/i,
    /\b(ideapad\s+\d+)\b/i,
    /\b(ideapad\s+[a-z0-9]+(?:\s+gen\s+\d+)?)\b/i,
    /\b(v\d{2}\s+g\d+)\b/i,
    /\b(ideacentre\s+aio\s+\d+[a-z0-9]*)\b/i,
    /\b(ideacentre\s+[a-z]?\d{3})[-\s]?[a-z0-9]*\b/i,
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
    /\b(latitude\s+\d+)\b/i,
    /\b((?:inspiron|vostro|precision)\s+\d+[a-z0-9-]*)\b/i,
    /\b(xps\s+\d+[a-z0-9-]*)\b/i,
    /\b(thinkbook\s+[a-z0-9]+(?:\s+gen\s+\d+)?)\b/i,
    /\b(galaxy\s+(?:s|z|a|m|tab|note|xcover)\s*\d+[a-z]*(?:\s+(?:ultra|plus|fe|fold|flip|edge))*)/i,
    /\b(iphone\s+\d+[a-z]*(?:\s+(?:pro|max|plus|mini))?)\b/i,
    /\b(redmi\s+note\s+\d+[a-z]*(?:\s+(?:pro\s+plus|pro|plus|ultra|5g))*)/i,
    /\b(redmi\s+\d+[a-z]*(?:\s+(?:pro\s+plus|pro|plus|ultra|5g))*)/i,
    /\b(poco\s+[a-z]\d+[a-z]*(?:\s+(?:pro\s+plus|pro|plus|ultra|5g))*)/i,
    /\b(redmi\s+pad(?:\s+se)?(?:\s+\d+(?:[.,]\d+)?)?(?:\s+pro)?)/i,
    /\b(watch\s+s?\d+(?:\s+\d+\s*mm)?)/i,
    /\b(smart\s+band\s+\d+)/i,
    /\b(redmi\s+smart\s+band\s+\d+)/i,
    /\b(ipad\s+(?:pro|air|mini)?(?:\s+\d+(?:[.,]\d+)?)?(?:\s*-\s*\d+\.\s*generation)?(?:\s*\/\s*\d{4})?(?:\s+a\d+\s*pro)?)/i,
    /\b(the\s+frame\s+pro)\b/i,
    /\b(the\s+frame)\b/i,
    /\b(go\s+\d+)(?:\s+(?:duo|mono|portable|speaker))*\b/i,
    /\b(clip\s+\d+)(?:\s+(?:portable|speaker))*\b/i,
    /\b(charge\s+\d+)(?:\s+(?:portable|speaker))*\b/i,
    /\b(flip\s+\d+)(?:\s+(?:portable|speaker))*\b/i,
    /\b(b760m\s+[a-z0-9]+(?:\s+[a-z0-9]+)?)\b/i,
  ];
  for (const re of familyPatterns) {
    const m = familyProbe.match(re);
    if (m && m[1]) {
      const fam = normalizeProductDedupText(m[1]);
      if (fam) return [b, fam].filter(Boolean).join('-').slice(0, 180);
    }
  }
  const mac = familyProbe.match(/\b(macbook\s+(?:air|pro)(?:\s+\d+(?:[.,]\d+)?)?)/i);
  if (mac) {
    const chip = familyProbe.match(/\b(m\d+(?:\s*(?:pro|max|ultra))?)\b/i);
    const fam = normalizeProductDedupText(`${mac[1]} ${chip ? chip[1] : ''}`);
    if (fam) return [b, fam].filter(Boolean).join('-').slice(0, 180);
  }
  s = s
    .replace(/\[([^\]]*)\]/g, ' $1 ')
    .replace(/\((?:intel|amd|qualcomm|apple)\)/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*cm\b/gi, ' ')
    .replace(/\(\s*\d+(?:[.,]\d+)?\s*(?:"|inch|zoll)\s*\)/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:"|inch|zoll)\b/gi, ' ')
    .replace(/\b\d+\s*(?:gb|tb|mb)\b/gi, ' ')
    .replace(/\b\d+\s*\/\s*\d+\b/g, ' ')
    .replace(/\b\d+\s*mah\b/gi, ' ')
    .replace(/\b(?:intel\s+)?core\s+(?:ultra\s+)?[3579]\s+[a-z0-9-]+\b/gi, ' ')
    .replace(/\b(?:intel\s+)?core\s+i[3579][- ]?[a-z0-9-]*\b/gi, ' ')
    .replace(/\b(?:intel\s+)?core\s+[3579]\s+\d{3,4}[a-z]*\b/gi, ' ')
    .replace(/\bi[3579][- ]?\d{3,5}[a-z]*\b/gi, ' ')
    .replace(/\b(?:amd\s+)?ryzen\s+(?:ai\s+)?[3579]\s+[a-z0-9-]+\b/gi, ' ')
    .replace(/\b(?:nvidia\s+)?(?:geforce\s+)?(?:gtx|rtx|mx)\s*\d+[a-z0-9 ]*\b/gi, ' ')
    .replace(/\b(?:amd\s+)?radeon\s+(?:rx\s*)?\d{3,5}(?:\s*(?:xt|m|mobile|graphics))?\b/gi, ' ')
    .replace(/\b(?:ddr\d|lpddr\d[x]?|sdram|ssd|hdd|nvme|wuxga|fhd|uhd|qhd)\b/gi, ' ')
    .replace(/\b(?:dual\s*sim|single\s*sim|sim-free|usb\s*type[- ]?c|usb-c|5g|4g|lte|wi-fi|wifi|wlan|bluetooth)\b/gi, ' ')
    .replace(/\bandroid\s*\d+(?:[.,]\d+)?\b/gi, ' ')
    .replace(/\b(?:windows|macos)\s*\d+(?:[.,]\d+)?(?:\s*pro)?\b/gi, ' ')
    .replace(/\b(?:windows|macos|linux|freebsd|pro|home|laptop|notebook|computer|pc|spanish|german|french|italian|english|turkish|ispanyolca|almanca|fransizca|fransızca|italyanca|ingilizce|turkce|türkçe)\b/gi, ' ')
    .replace(/\b(?:black|white|silver|gold|blue|purple|violet|pink|red|green|gray|grey|cream|graphite|lavender|wood|bordeaux|midnight|starlight|titanium|stone\s*colour|dark\s*blue|dark\s*green|orange|sand|camouflage|camo|beige|khaki|mint|aqua|turquoise|teal|coral|brown|natural|ivory|schwarz|weiß|weiss|silber|blau|grün|gruen|creme|siyah|beyaz|yeşil|yesil|gri|mavi|kırmızı|kirmizi|mor|pembe|sarı|sari)\b/gi, ' ')
    .replace(/\b(?:de|uk|us|eu|pl|fr|it|es|se|gb)\b/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*w\b/gi, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const base = [b, s].filter(Boolean).join('-').slice(0, 180);
  return base || normalizeProductDedupText(name) || normalizeProductDedupText(category);
}

function productDedupKey(product) {
  const variant = normalizeProductDedupText(product?.variantGroup);
  if (variant) return variant;
  const name = normalizeProductDedupText(product?.name);
  if (name) return name;
  return generateProductId(slugFromUrl(product?.sourceUrl || product?.slug || ''));
}

function _flatProductText(product) {
  const vals = [];
  const visit = value => {
    if (!value) return;
    if (typeof value === 'object') Object.values(value).forEach(visit);
    else vals.push(String(value));
  };
  visit(product?.keySpecs);
  visit(product?.specs);
  visit(product?.specSections);
  return `${product?.name || ''} ${vals.join(' ')}`;
}

function configKeyFromProduct(product, variantGroup) {
  const text = _flatProductText(product);
  const axes = [];
  const caps = [...text.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(TB|GB|MB)\b/gi)]
    .map(m => {
      const n = parseFloat(String(m[1]).replace(',', '.')) || 0;
      const unit = m[2].toUpperCase();
      return { n, unit, gb: unit === 'TB' ? n * 1024 : unit === 'MB' ? n / 1024 : n };
    })
    .filter(x => x.gb > 0);
  const storage = caps.reduce((best, x) => !best || x.gb > best.gb ? x : best, null);
  const ram = caps.filter(x => x.unit === 'GB' && x.n <= 64 && x !== storage)
    .reduce((best, x) => !best || x.n > best.n ? x : best, null);
  if (ram) axes.push(`r${Math.round(ram.n)}`);
  if (storage) axes.push(`s${Math.round(storage.gb)}`);
  const cpu = text.match(/\b(?:core\s+)?ultra\s+[3579]\s+\w+/i)
    || text.match(/\bi[3579]-\w+/i)
    || text.match(/\bcore\s+[3579]\s+\d{3,4}[a-z]*\b/i)
    || text.match(/\bryzen(?:\s+ai)?\s+[3579]\s+(?:pro\s+)?\w+/i)
    || text.match(/\b(?:apple\s+)?m[1-9]\s*(?:pro|max|ultra)?\b/i);
  if (cpu) axes.push(`c${normalizeProductDedupText(cpu[0]).replace(/-/g, '')}`);
  const gpu = text.match(/\b(?:geforce\s+)?(?:rtx|gtx|mx)\s*\d{3,5}(?:\s*(?:ti|super|laptop))?\b/i)
    || text.match(/\bradeon\s+(?:rx\s*)?\d{3,5}(?:\s*(?:xt|m|mobile|graphics))?\b/i);
  if (gpu) axes.push(`g${normalizeProductDedupText(gpu[0]).replace(/-/g, '')}`);
  const inch = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:"|inch|inches|zoll)\b/i);
  const cm = text.match(/\b(\d+(?:[.,]\d+)?)\s*cm\b/i);
  if (inch) axes.push(`d${Math.round(parseFloat(inch[1].replace(',', '.')) * 10)}`);
  else if (cm) axes.push(`d${Math.round((parseFloat(cm[1].replace(',', '.')) / 2.54) * 10)}`);
  const res = text.match(/\b(\d{3,5})\s*[x×]\s*(\d{3,5})\b/i);
  if (res) axes.push(`res${res[1]}x${res[2]}`);
  return `${variantGroup || productDedupKey(product)}${axes.length ? `|${axes.join('|')}` : ''}`.slice(0, 230);
}

function prepareProductPayload(product) {
  const sanitized = sanitizeProductSpecs(product.specs || {}, product.specSections || {});
  const category = window.QorAiCategories?.canonicalId
    ? window.QorAiCategories.canonicalId(product.category || '')
    : String(product.category || '').trim();

  // Enforce image cap, dedup, and keep the native CDN format for Epey.
  const rawImages = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
  const isEpeySource = /epey/i.test(String(product.source || product.sourceUrl || ''));
  const seenImg = new Set();
  const images = [];
  for (const url of rawImages) {
    const mid = isEpeySource
      ? normalizeEpeyImageUrl(url)
      : (typeof imgMedium === 'function' ? imgMedium(url) : url);
    const key = isEpeySource
      ? (typeof _epeyImageKey === 'function' ? _epeyImageKey(mid) : String(mid || '').toLowerCase())
      : String(mid || '').replace(/-[a-z]\.webp$/i, '').toLowerCase();
    if (mid && !seenImg.has(key)) {
      seenImg.add(key);
      images.push(mid);
    }
    if (images.length >= 8) break;
  }
  const primary = images[0] || product.imageUrl || '';

  const variantGroup = String(product.variantGroup || productDedupKey(product) || '').trim().slice(0, 200);
  const payload = {
    slug: String(product.slug || product.id || productDedupKey(product) || '').trim().slice(0, 200),
    name: String(product.name || '').trim().slice(0, 500),
    brand: String(product.brand || '').trim().slice(0, 200),
    category: String(category || '').trim().slice(0, 100),
    source: String(product.source || 'epey.com').trim().slice(0, 100),
    sourceUrl: product.sourceUrl || undefined,
    imageUrl: primary || undefined,
    imageUrlThumb: primary && !isEpeySource && typeof imgThumb === 'function' ? imgThumb(primary) : primary || undefined,
    imageUrlHQ: primary && !isEpeySource && typeof imgHQ === 'function' ? imgHQ(primary) : primary || undefined,
    images,
    specs: sanitized.specs,
    specSections: sanitized.sections,
    keySpecs: product.keySpecs && typeof product.keySpecs === 'object' ? product.keySpecs : {},
    techScore: Number.isFinite(Number(product.techScore)) ? Number(product.techScore) : undefined,
    specsCount: Object.keys(sanitized.specs).length,
    variantGroup,
    configKey: String(product.configKey || configKeyFromProduct(product, variantGroup) || '').trim().slice(0, 255),
    scrapedAt: product.scrapedAt || new Date().toISOString(),
  };

  if (product.gtin) payload.gtin = String(product.gtin).trim().slice(0, 200);
  if (product.mpn) payload.mpn = String(product.mpn).trim().slice(0, 200);
  if (product.price_raw) payload.price_raw = String(product.price_raw).trim().slice(0, 200);

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

// Reference-only spec detector. Legacy occasionally emits rows like
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
// the common block-level / list separators Legacy uses.
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

  // Legacy.eu doesn't have native tech scores; check for rating elements
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
const MAX_IMAGES_PER_PRODUCT = 8;

// Legacy CDN exposes the same image in multiple sizes via prefix:
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
  //    Legacy wraps gallery images in `.product-gallery`, `.gallery`,
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

  // ── PRIMARY: Legacy.eu dl.specs-grid ──
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
//  12b. TURKISH → MULTI-LANG TRANSLATION (DeepSeek v3 + Dictionary Cache)
// ═══════════════════════════════════════

// In-memory TR→target dictionary cache (lazy-loaded from PB)
const _deDictCache = {}; // { 'some turkish text': { en: '...', de: '...', ... } }
let _deDictLoaded = false;
let _deDictDirty = false;
const DE_DICT_PB_KEY = 'tr_translation_dict';

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

// Lookup Turkish text in cache for a specific target language
function _deDictLookup(turkishText, targetLang) {
  const key = turkishText.toLowerCase().trim();
  const entry = _deDictCache[key];
  if (entry && entry[targetLang]) return entry[targetLang];
  return null;
}

// ── Title-Case post-processing ─────────────────────────────────────────
// DeepSeek output is inconsistent in capitalization. We normalize every
// stored translation so the UI shows consistently capitalized text across
// languages: first letter of every word uppercase, while keeping units,
// brands and technical abbreviations untouched.
const _ACRONYMS = new Set([
  'AF','AI','AMOLED','ANC','AOSS','API','APP','ARM','BLE','CPU','DDR','DLNA',
  'DNS','DSP','EU','FHD','GHZ','GPS','GPU','HDD','HDMI','HDR','HSPA','HZ','IO',
  'IP','IP54','IP55','IP65','IP66','IP67','IP68','IP69','IPS','IR','ISO','LCD',
  'LED','LTE','MAH','MEMS','MIMO','MP','MS','NFC','OIS','OLED','OS','PD','PWM',
  'QHD','QLED','RAM','RGB','ROM','SIM','SD','SDR','SOC','SSD','SSID','TFT','TPU',
  'UFS','UHD','USB','USB-C','UV','UWB','VPN','VR','WAN','WI-FI','WLAN','WPA',
  'WPA2','WPA3','WUXGA','YUV','3D','4G','5G','6E','8K','4K','2K','HD','LDAC',
  'AAC','LDAC','SBC','APT-X','APTX','EDR','BT','CCT','HDR10','HDR10+','XDR',
  'PIN','UV','IPX','IPX4','IPX5','IPX7','IPX8','RTX','GTX','AMD','MTK','SOC',
  'F','G','MB','GB','TB','KB','KHZ','MHZ','BAR','DPI','TDP','TBW','PCIE','PCI',
  'M.2','M2','MM','CM','SDXC','SDHC','VA','W','V','A','KW','KWH'
]);

// Pattern fragments worth keeping as-is (units stuck to numbers, ratios, etc.)
const _PRESERVE_PATTERNS = [
  /^\d+(\.\d+)?(mm|cm|m|kg|g|mg|mah|wh|w|v|a|hz|khz|mhz|ghz|mp|gb|tb|mb|kb|nm|bar|°c|°f|fps|dpi|ms|s|h|x)$/i,
  /^\d+(\.\d+)?$/,                                  // pure numbers
  /^f\/\d+(\.\d+)?$/i,                              // aperture f/1.6
  /^\d+x\d+$/,                                      // 2340x1080
  /^\d+x$/,                                         // 3x, 1000x
  /^\d+x\d+(\.\d+)?(mm|cm|m)?$/i,                   // 146.9x70.5x7.2mm
  /^@\d+/,                                          // @60fps etc.
  /^\d+(\.\d+)?(p|i)$/i,                            // 2160p, 1080i
  /^[A-Z]+-?\d+[A-Z0-9-]*$/,                        // model codes
];

function _shouldPreserve(token) {
  if (!token) return true;
  if (_ACRONYMS.has(token.toUpperCase())) return true;
  for (const re of _PRESERVE_PATTERNS) if (re.test(token)) return true;
  // Tokens containing digits and letters (e.g. 4320p, 12.0MP, IP68): preserve
  if (/\d/.test(token) && /[a-zA-Z]/.test(token)) return true;
  return false;
}

function _shouldTranslateAtom(text) {
  const s = String(text || '').trim();
  if (!s || s.length < 2) return false;
  if (!/[a-zA-ZÀ-ÿ]/.test(s)) return false;
  if (/^\d{8,14}$/.test(s)) return false; // GTIN/EAN/UPC
  if (/^[\d\s.,:+/()°%'"-]+$/.test(s)) return false;
  if (/^(ean|gtin|upc|mpn|sku|id)$/i.test(s)) return false;
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length && tokens.every(t => _shouldPreserve(t.replace(/^[^\w]+|[^\w]+$/g, '')))) {
    return false;
  }
  // Model-code-heavy values such as "0/1/10 (B550)" or "SM-S918BZKQXSP"
  // are better preserved verbatim and should not spend DeepSeek calls.
  const compact = s.replace(/[\s._/-]+/g, '');
  if (/[A-Z]/.test(s) && /\d/.test(s) && compact.length <= 32 && /^[A-Z0-9]+$/i.test(compact)) {
    return false;
  }
  return true;
}

// Title-case a single token while keeping acronyms / units intact.
function _titleCaseToken(token) {
  if (!token) return token;
  if (_shouldPreserve(token)) return token;
  // Hyphenated word: title-case each part (e.g. "wi-fi" → "Wi-Fi" via acronym
  // table; "phasenvergleich-af" → "Phasenvergleich-AF").
  if (token.includes('-')) {
    return token.split('-').map(_titleCaseToken).join('-');
  }
  // Slashed word: same idea ("on/off" → "On/Off")
  if (token.includes('/')) {
    return token.split('/').map(_titleCaseToken).join('/');
  }
  // Lowercase first, then capitalize first letter (handles "GYROSKOP" → "Gyroskop")
  const lower = token.toLocaleLowerCase();
  return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
}

// Apply SENTENCE case to a full string: the first non-acronym word starts
// with an uppercase letter, every subsequent non-acronym word is lowercased.
// Acronyms / units / brands (detected by `_shouldPreserve`) are kept exactly
// as-is so e.g. "Energy efficiency HDR (A to G)" stays correct, not "Energy
// Efficiency Hdr (a To G)" (old title-case behaviour).
function _applyTitleCase(text) {
  if (typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (!trimmed) return text;
  // Multi-line: sentence-case each line independently
  if (trimmed.includes('\n')) {
    return text.split('\n').map(_applyTitleCase).join('\n');
  }
  let firstWordSeen = false;
  return trimmed.replace(/\S+/g, (token) => {
    // Strip leading + trailing punctuation so brackets/quotes/commas don't
    // confuse the case logic.
    const m = token.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
    if (!m) return token;
    const [, pre, core, post] = m;
    if (!core) return token;
    if (_shouldPreserve(core)) {
      // Acronyms / units / brand stylings stay exactly as the source. If this
      // is the first significant token of the string we still count it as
      // "seen" so the next real word goes lowercase.
      firstWordSeen = true;
      return pre + core + post;
    }
    const lower = core.toLocaleLowerCase();
    const reshaped = firstWordSeen
      ? lower
      : lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
    firstWordSeen = true;
    return pre + reshaped + post;
  });
}

// Expose for tests / dictionary tab "Reformat" button
window._qorAiTitleCase = _applyTitleCase;

// Store translation in cache (normalized via title-case)
function _deDictStore(turkishText, targetLang, translation) {
  const key = turkishText.toLowerCase().trim();
  const normalized = _applyTitleCase(String(translation || '').trim());
  if (!normalized) return;
  if (!_deDictCache[key]) _deDictCache[key] = {};
  if (_deDictCache[key][targetLang] !== normalized) {
    _deDictCache[key][targetLang] = normalized;
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
  set:     (turkishText, lang, translation) => _deDictStore(turkishText, lang, translation),
  remove:  (turkishText) => {
    const key = String(turkishText || '').toLowerCase().trim();
    if (_deDictCache[key]) { delete _deDictCache[key]; _deDictDirty = true; }
  },
  save:    () => { _deDictDirty = true; return _saveDeDict(); },
  langs:   () => SUPPORTED_LANGS,
};

// Batch translate Turkish texts → ALL target languages in ONE DeepSeek call.
// Response shape: { "turkish text": { en: "...", de: "...", ... }, ... }
// This collapses what used to be 11 sequential API hits per product into a
// single round-trip: ~11x faster AND ~11x cheaper (token overlap on the
// system prompt + single network latency).
const _LANG_NAMES = {
  en: 'English', de: 'German', tr: 'Turkish', es: 'Spanish', fr: 'French', it: 'Italian',
  ja: 'Japanese', nl: 'Dutch', pl: 'Polish', pt: 'Portuguese', sv: 'Swedish', ar: 'Arabic'
};

// Best-effort recovery from a truncated DeepSeek JSON response. Walks the
// raw text and extracts every top-level "key": { … } pair whose inner object
// is structurally complete. Anything past the last complete pair is dropped.
// This rescues ~80-95% of a 12-atom batch whose tail got chopped.
function _salvageTruncatedJson(raw) {
  const text = String(raw || '');
  const out = {};
  // Strip wrapping noise: find first "{ and last … so we don't trip on the
  // outer object braces.
  const firstBrace = text.indexOf('{');
  if (firstBrace < 0) return out;
  const inner = text.slice(firstBrace + 1);
  let i = 0;
  while (i < inner.length) {
    // Skip whitespace + commas between pairs
    while (i < inner.length && /[\s,]/.test(inner[i])) i++;
    if (i >= inner.length || inner[i] === '}') break;
    if (inner[i] !== '"') break;
    // Parse the key (a double-quoted JSON string).
    const keyStart = i;
    i++;
    while (i < inner.length) {
      if (inner[i] === '\\') { i += 2; continue; }
      if (inner[i] === '"') { i++; break; }
      i++;
    }
    const keyRaw = inner.slice(keyStart, i);
    let key;
    try { key = JSON.parse(keyRaw); } catch { break; }
    // Skip whitespace + colon
    while (i < inner.length && /\s/.test(inner[i])) i++;
    if (inner[i] !== ':') break;
    i++;
    while (i < inner.length && /\s/.test(inner[i])) i++;
    // Expect an object value.
    if (inner[i] !== '{') break;
    // Walk to the matching closing brace, tracking strings.
    const valStart = i;
    let depth = 0;
    let inStr = false;
    let closed = false;
    while (i < inner.length) {
      const c = inner[i];
      if (inStr) {
        if (c === '\\') { i += 2; continue; }
        if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { i++; closed = true; break; } }
      }
      i++;
    }
    if (!closed) break; // truncated mid-value → stop salvaging.
    const valRaw = inner.slice(valStart, i);
    try {
      out[key] = JSON.parse(valRaw);
    } catch {
      break;
    }
  }
  return out;
}

async function _deepSeekAllLangsBatch(germanTexts, targetLangs, onProgress) {
  const token = getPb()?.authStore?.token;
  if (!token) {
    console.warn('[tr-translate] No auth token');
    return {};
  }

  // Build the set of (text, lang) pairs that are NOT in cache yet
  const missingByText = new Map(); // text → Set<lang>
  for (const t of germanTexts.filter(_shouldTranslateAtom)) {
    const missing = targetLangs.filter(l => !_deDictLookup(t, l));
    if (missing.length) missingByText.set(t, missing);
  }
  if (missingByText.size === 0) return; // everything cached — no API hit

  const uncached = [...missingByText.keys()];
  // DeepSeek output cap: each atom × 11 langs can be large, so keep chunks
  // moderate. The atom filter above removes model codes/numbers first, which
  // lets us safely use a slightly larger batch than the old 12.
  const CHUNK = 18;
  const totalChunks = Math.ceil(uncached.length / CHUNK);
  const report = (phase, idx, extra) => {
    if (typeof onProgress !== 'function') return;
    try { onProgress({ phase, chunkIndex: idx, totalChunks, chunkSize: CHUNK, ...extra }); } catch {}
  };
  const langCodes = targetLangs.join(',');

  // Process a single chunk: send → parse → store. Self-contained so we can
  // run multiple chunks concurrently without races (each chunk owns its own
  // Date.now() timer and writes to the shared dict via the idempotent
  // _deDictStore — last-write-wins, but identical inputs produce identical
  // output so this is safe).
  async function processChunk(chunkIdx, batch) {
    report('chunk-start', chunkIdx, { batchSize: batch.length, sample: batch.slice(0, 3) });
    const chunkStart = Date.now();
    const textsJson = JSON.stringify(batch);
    try {
      const response = await fetch(`${PB_URL}/api/ai/deepseek`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            {
              role: 'system',
              content: `You are a technical product specification translator. For each Turkish tech spec term, return a JSON object mapping the original Turkish text to translations in the following languages: ${langCodes}.
Rules:
- Keep numbers, units, sizes and technical abbreviations unchanged (e.g. "5G", "Wi-Fi 6E", "120 Hz", "GB", "mm").
- Product names / brand names stay as-is.
- Preserve newlines (\\n) inside multi-line values.
- Return ONLY a single JSON object of the form:
  {"<turkish text>": {"en":"...", "de":"...", "es":"...", ...}, ...}
- The inner object MUST contain exactly these language codes: ${langCodes}.`
            },
            {
              role: 'user',
              content: `Translate these ${batch.length} Turkish product specification terms into ${targetLangs.length} languages (${langCodes}):\n${textsJson}\n\nReturn only the JSON object.`
            }
          ],
          max_tokens: 8000,
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
      try { translations = JSON.parse(content); }
      catch { translations = _salvageTruncatedJson(content); }

      let storedForChunk = 0;
      for (const t of batch) {
        const entry = translations[t];
        if (!entry || typeof entry !== 'object') continue;
        for (const lang of targetLangs) {
          if (typeof entry[lang] === 'string' && entry[lang].trim()) {
            _deDictStore(t, lang, entry[lang]);
            storedForChunk++;
          }
        }
      }
      report('chunk-done', chunkIdx, {
        batchSize: batch.length,
        stored: storedForChunk,
        elapsedMs: Date.now() - chunkStart,
      });
    } catch (e) {
      console.warn('[tr-translate] all-langs batch error:', e.message);
      report('chunk-error', chunkIdx, { error: e.message, elapsedMs: Date.now() - chunkStart });
    }
  }

  // Build the list of (chunkIdx, batch) jobs.
  const jobs = [];
  for (let i = 0; i < uncached.length; i += CHUNK) {
    jobs.push({ chunkIdx: Math.floor(i / CHUNK), batch: uncached.slice(i, i + CHUNK) });
  }

  // Concurrency-limited worker pool. DeepSeek's standard tier accepts ~60
  // req/min — at 4 in-flight requests with ~15-30s latency we stay well
  // below that ceiling. End-to-end runtime drops from N×latency to
  // (N/CONCURRENCY)×latency, so a 9-chunk run goes from ~225s → ~60s.
  const CONCURRENCY = 4;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      await processChunk(job.chunkIdx, job.batch);
    }
  });
  await Promise.all(workers);

  await _saveDeDict();
}

// Main function: translate Turkish specs → all target languages
// Returns: { en: {specs}, tr: {specs}, ... }
//
// EFFICIENCY MODEL (atom + product-patch):
//   1) All Turkish texts → looked up in the shared `_deDictCache` (atom dict).
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

  // Build a FLAT Turkish→localized lookup map per language. The renderer
  // does `ml[germanKey]` and `ml[germanValue]` so the keys here MUST stay
  // as the original Turkish text, not the translated text.
  //
  // Previous (buggy) layout stored `{ translatedKey: translatedVal }`,
  // which made the lookup miss every time and the modal silently fell back
  // to the source language for every locale — looking exactly like the translation
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

// Translate single Turkish product name to all languages (single API call)
async function translateGermanName(germanName, targetLangs = TARGET_LANGS) {
  await _loadDeDict();
  await _deepSeekAllLangsBatch([germanName], targetLangs);
  const names = {};
  for (const lang of targetLangs) {
    names[lang] = _deDictLookup(germanName, lang) || germanName;
  }
  return names;
}

// ── Bulk Category Translation API ───────────────────────────────────────
// Atomize every translatable string across a list of products, hit DeepSeek
// ONCE for the union of missing atoms (chunked), persist the dictionary, then
// build per-product multiLangSpecs / nameTranslated / multiLangSections from
// dictionary lookups only — no further API calls. This is the engine behind
// the Dictionary tab's "Translate Category" panel.
function _collectAtomsFromProduct(p, sink) {
  const add = (t) => {
    const s = String(t || '').trim();
    if (!s) return;
    sink.add(s);
    if (s.includes('\n')) {
      for (const line of s.split('\n')) {
        const l = line.trim();
        if (l) sink.add(l);
      }
    }
  };
  if (p.name) add(p.name);
  const specs = p.specs || {};
  for (const [k, v] of Object.entries(specs)) { add(k); add(v); }
  const sections = p.specSections || {};
  for (const [secName, body] of Object.entries(sections)) {
    add(secName);
    if (body && typeof body === 'object') {
      for (const [k, v] of Object.entries(body)) { add(k); add(v); }
    }
  }
  const keySpecs = p.keySpecs || {};
  for (const [k, v] of Object.entries(keySpecs)) { add(k); add(v); }
}

function _buildProductTranslations(p, targetLangs) {
  // For each lang, build flat source→localized map covering specs keys/values
  // and atomized sub-lines, plus product name + section names.
  const multiLangSpecs = {};
  const multiLangSections = {};
  const nameTranslated = {};

  for (const lang of targetLangs) {
    const map = {};
    const addToMap = (text) => {
      const t = String(text || '').trim();
      if (!t) return;
      const tx = _deDictLookup(t, lang);
      if (tx && tx !== t) map[t] = tx;
    };
    for (const [k, v] of Object.entries(p.specs || {})) {
      addToMap(k);
      const vs = String(v);
      addToMap(vs);
      if (vs.includes('\n')) for (const line of vs.split('\n')) addToMap(line);
    }
    for (const [k, v] of Object.entries(p.keySpecs || {})) {
      addToMap(k); addToMap(v);
    }
    multiLangSpecs[lang] = map;

    const secMap = {};
    for (const secName of Object.keys(p.specSections || {})) {
      secMap[secName] = _deDictLookup(secName, lang) || secName;
    }
    multiLangSections[lang] = secMap;

    nameTranslated[lang] = _deDictLookup(p.name, lang) || p.name;
  }
  return { multiLangSpecs, multiLangSections, nameTranslated };
}

// Public API consumed by app.js category translator panel
window.QorAiBulkTranslate = {
  // Pre-load dictionary
  loadDict: () => _loadDeDict(),
  // Collect unique atoms across a batch of products
  collectAtoms(products) {
    const sink = new Set();
    for (const p of products || []) _collectAtomsFromProduct(p, sink);
    return [...sink].filter(_shouldTranslateAtom);
  },
  // Return only the atoms that are missing for at least one target lang
  missingAtoms(atoms, targetLangs = TARGET_LANGS) {
    return atoms.filter(t => _shouldTranslateAtom(t) && targetLangs.some(l => !_deDictLookup(t, l)));
  },
  // Hit DeepSeek for the supplied (already filtered) atoms. Chunked & batched.
  // `onProgress` receives { phase, chunkIndex, totalChunks, ... } per chunk so
  // the UI can render a live progress bar and ETA.
  translateAtoms(atoms, targetLangs = TARGET_LANGS, onProgress) {
    return _deepSeekAllLangsBatch(atoms, targetLangs, onProgress);
  },
  // Build the per-product translation payload from dict only (no API calls).
  buildPayload(product, targetLangs = TARGET_LANGS) {
    return _buildProductTranslations(product, targetLangs);
  },
  // Persist the dictionary cache to PocketBase (force-save)
  saveDict() { _deDictDirty = true; return _saveDeDict(); },
  targetLangs: () => TARGET_LANGS.slice(),
  // Estimated chunk count for progress reporting
  CHUNK_SIZE: 18,
  CONCURRENCY: 4,
};

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
    // Legacy.eu: product name is in h1, sometimes with nested spans
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
    const found = findCategoryByLegacyUrl(url);
    category = found ? found.id : categorySlugFromUrl(url);
  }
  category = detectCategoryFromDoc(doc, category);
  if (window.QorAiCategories?.canonicalId) {
    category = window.QorAiCategories.canonicalId(category);
  }

  // ── EAN/GTIN + MPN ──
  // Keep affiliate-matching identifiers as fields, but do not keep shop,
  // price or merchant metadata from Legacy.
  const identifiers = extractProductIdentifiers(doc);

  // ── Tech Score ──
  const techScore = extractTechScore(doc);

  // ── Images ──
  // All product images from gzhls.at/pix/ in -n.webp format
  const images = extractImages(doc, productSlug);

  // ── Variant Group ──
  const variantGroup = modelFamilyKey({
    name: originalName,
    brand,
    category,
  }) || normalizeVariantGroupFromSlug(productSlug);

  return {
    id,
    slug: productSlug || id,
    name: originalName || 'Unknown Product', // German original
    brand,
    category,
    source: 'Legacy.eu',
    sourceUrl: url,
    imageUrl: images[0] || undefined,
    images,
    specs: rawSpecs,          // German specs
    specSections: rawSections, // German sections
    keySpecs: rawKeySpecs,
    techScore: techScore ?? undefined,
    specsCount: Object.keys(rawSpecs).length,
    variantGroup,
    gtin: identifiers.gtin || undefined,
    mpn: identifiers.mpn || undefined,
    scrapedAt: new Date().toISOString(),
  };
}

// After scraping, translate specs to all target languages using DeepSeek v3
async function translateScrapedProduct(product) {
  if (!product || !product.specs || !Object.keys(product.specs).length) return product;

  slog(`Translating Turkish specs for: ${product.name?.substring(0, 50)}...`, 'info');

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
    if (href.startsWith('https://Legacy.eu/') || href.startsWith('http://Legacy.eu/') ||
        href.startsWith('https://www.Legacy.eu/') || href.startsWith('https://Legacy.at/') ||
        href.startsWith('https://Legacy.de/')) {
      try { href = new URL(href).pathname; } catch { return; }
    }
    if (!productLinkRe.test(href)) return;
    if (href.includes('/en/') || href.includes('/about') || href.includes('/contact')) return;
    if (!href.startsWith('/')) href = '/' + href;
    const fullUrl = LEGACY_BASE + href;
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
    catDef = QorAiCategories.getAll().find(c => c.LegacySlug === categoryPath);
  }

  if (!catDef || !catDef.LegacySlug) {
    slog(`No real ?cat= ID found for category: ${categoryPath}`, 'error');
    return [];
  }

  const catParam = catDef.LegacySlug;
  const categoryId = catDef.id;
  slog(`Collecting from category listing: ?cat=${catParam} (${catDef.name})`);

  const allItems = [];
  const seenUrls = new Set();
  // Legacy only honours the `pg` pagination param. Cycling through other
  // names wasted requests and multiplied CF pressure; stick with `pg`.
  {
    const pageParam = 'pg';
    let page = 1;
    let emptyCount = 0;
    let noNewCount = 0;

    // Fetch a single listing page through the proxy, returning either
    // { ok: true, links: [...] } or { ok: false, cloudflare: bool, reason }.
    // Self-contained so the outer loop can decide between retry / skip / abort.
    async function fetchListingPage(url) {
      let links = [];
      let cloudflareBlocked = false;
      let reason = '';
      try {
        const res = await fetch(`${PROXY_URL}/category-links?url=${encodeURIComponent(url)}`, {
          signal: AbortSignal.timeout(90000)
        });
        const contentType = res.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        if (res.ok && isJson) {
          let data;
          try { data = await res.json(); }
          catch { cloudflareBlocked = true; reason = 'json-parse'; }
          if (data) {
            if (data.error === 'cloudflare_challenge') { cloudflareBlocked = true; reason = 'cf-challenge'; }
            else links = (data.links || []).map(u => ({ url: u, techScore: null }));
          }
        } else if (!isJson) {
          cloudflareBlocked = true; reason = 'non-json-response';
        } else if (res.status === 503) {
          cloudflareBlocked = true; reason = 'cf-503';
        } else {
          reason = `http-${res.status}`;
        }
      } catch (e) {
        reason = `network-${e.message}`;
      }
      // Client-side fallback if proxy returned 0 links without a CF flag.
      if (!cloudflareBlocked && links.length === 0) {
        try {
          const html = await proxyFetch(url);
          if (html) {
            if (isChallengePage(html)) { cloudflareBlocked = true; reason = 'cf-fallback-html'; }
            else {
              const doc = parseHTML(html);
              links = extractProductLinksFromDoc(doc, html);
            }
          }
        } catch (e) {
          reason = reason || `fallback-${e.message}`;
        }
      }
      return { ok: !cloudflareBlocked, cloudflare: cloudflareBlocked, reason, links };
    }

    // Per-page retry budget (Cloudflare gives transient blocks; a 30-60s
    // breather usually clears them). Only after THIS budget is exhausted
    // do we count the page as a hard failure against `consecCloudflareFails`.
    const MAX_RETRIES_PER_PAGE = 3;
    const RETRY_BACKOFF_MS = [20000, 45000, 90000]; // 20s, 45s, 90s
    // Stop scraping only after 3 consecutive pages have BOTH exhausted their
    // retry budget AND still failed. This means a long but recoverable CF wave
    // (e.g. 2 pages in a row + 90s sleep) no longer kills a 5K-URL run.
    let consecCloudflareFails = 0;
    const MAX_CONSEC_FAILS = 3;
    // Cloudflare stops flagging this session token only when we hand it a
    // brand-new fingerprint. The proxy's /reset-session endpoint kills the
    // browser, drops cookies, and rotates the UA. We hit it (a) after every
    // N successful pages as a proactive cooldown, and (b) whenever a page
    // burns its retry budget so the next page starts fresh.
    const PROACTIVE_RESET_EVERY = 30; // pages
    const PROACTIVE_COOLDOWN_MS = 45000; // 45s after each reset
    const POST_RESET_RECOVERY_MS = 60000; // 60s after a forced reset
    let pagesSinceReset = 0;

    async function resetProxySession(reason) {
      try {
        slog(`🧹 Resetting proxy session (${reason}) — fresh browser + cookies + UA`, 'warn');
        const r = await fetch(`${PROXY_URL}/reset-session`, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) slog(`  ⚠️ reset-session HTTP ${r.status}`, 'warn');
      } catch (e) {
        slog(`  ⚠️ reset-session failed: ${e.message}`, 'warn');
      }
    }

    while (allItems.length < maxProducts && !scraperAbort && emptyCount < 2) {
      const listingUrl = `${LEGACY_BASE}/?cat=${catParam}&${LEGACY_LISTING_EXTRA}&${pageParam}=${page}`;
      slog(`Fetching listing [${pageParam}=${page}]: ${listingUrl.substring(0, 80)}...`, 'info');

      let pageResult = null;
      for (let attempt = 0; attempt <= MAX_RETRIES_PER_PAGE && !scraperAbort; attempt++) {
        pageResult = await fetchListingPage(listingUrl);
        if (pageResult.ok) break;
        if (!pageResult.cloudflare) {
          // Non-CF failure (network, http-500…): one retry, no backoff
          if (attempt === 0) { slog(`  → ${pageResult.reason}, quick retry…`, 'warn'); continue; }
          break;
        }
        if (attempt >= MAX_RETRIES_PER_PAGE) break;
        const wait = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)];
        slog(`  → Cloudflare engeli (${pageResult.reason}). ${(wait / 1000)|0}s bekleyip tekrar deneyeceğim (deneme ${attempt + 1}/${MAX_RETRIES_PER_PAGE})…`, 'warn');
        await sleep(wait);
      }

      if (scraperAbort) break;

      if (!pageResult || !pageResult.ok) {
        consecCloudflareFails++;
        slog(`  ✗ Sayfa ${page} ${MAX_RETRIES_PER_PAGE} denemeden sonra geçilemedi (${pageResult?.reason || 'unknown'}). Ardışık fail: ${consecCloudflareFails}/${MAX_CONSEC_FAILS}.`, 'error');
        if (consecCloudflareFails >= MAX_CONSEC_FAILS) {
          slog(`🛑 ${MAX_CONSEC_FAILS} sayfa üst üste Cloudflare'i geçemedi. Şimdiye kadar toplanan ${allItems.length} URL ile devam edebilirsin — Resume desteğiyle daha sonra kaldığın yerden çekersin.`, 'error');
          break;
        }
        // Force a fingerprint reset before the next page — retrying with the
        // same flagged session is what kept us looping in the previous build.
        await resetProxySession(`page ${page} burned retry budget`);
        pagesSinceReset = 0;
        slog(`  💤 Cooldown ${(POST_RESET_RECOVERY_MS / 1000) | 0}s before page ${page + 1}…`, 'info');
        await sleep(POST_RESET_RECOVERY_MS);
        // Skip this page and try the next one — sort=t is stable so we lose
        // ~30 URLs but the run continues.
        page++;
        continue;
      }

      // Page fetched successfully — reset the consecutive-fail counter.
      consecCloudflareFails = 0;
      pagesSinceReset++;
      const links = pageResult.links;
      if (links.length === 0) {
        emptyCount++;
        noNewCount++;
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
        if (newCount === 0) {
          noNewCount++;
          slog(`  → Page ${page} only repeated known products (${noNewCount}/2).`, 'warn');
        } else {
          noNewCount = 0;
        }
      }

      if (noNewCount >= 2) {
        slog(`No new products on ${noNewCount} consecutive pages. URL collection is complete; starting scrape with ${allItems.length} collected products.`, 'warn');
        break;
      }

      page++;
      // Proactive cooldown: every N successful pages we throw away the
      // browser fingerprint before Cloudflare gets a chance to flag it.
      // This is the single biggest win against the ~50-page wall we used
      // to hit on long bulk runs.
      if (pagesSinceReset >= PROACTIVE_RESET_EVERY && allItems.length < maxProducts && !scraperAbort) {
        await resetProxySession(`proactive after ${PROACTIVE_RESET_EVERY} pages`);
        pagesSinceReset = 0;
        slog(`  ❄️ Proactive cooldown ${(PROACTIVE_COOLDOWN_MS / 1000) | 0}s…`, 'info');
        await sleep(PROACTIVE_COOLDOWN_MS);
      } else {
        // Per-page delay widened from 2-3.5s → 4-6s. Legacy' Cloudflare
        // edge gets noisier when requests come in faster than ~12/min.
        await sleep(4000 + Math.random() * 2000);
      }
    }
  }

  slog(`URL collection complete: ${allItems.length} unique product URLs`, 'success');
  return allItems;
}

async function collectSearchProductUrls(searchTerm, maxProducts = 200) {
  const term = String(searchTerm || '').trim();
  if (!term) return [];
  slog(`Collecting from Legacy search: "${term}"`);

  const allItems = [];
  const seenUrls = new Set();
  let page = 1;
  let emptyCount = 0;
  let noNewCount = 0;
  let failCount = 0;
  const SEARCH_BLOCK_RECOVERY_MS = 10000;

  async function fetchSearchPage(url) {
    let links = [];
    let blocked = false;
    let reason = '';
    try {
      const res = await fetch(`${PROXY_URL}/category-links?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(90000)
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json().catch(() => null);
        links = (data?.links || []).map(u => ({ url: u, techScore: null }));
      } else {
        blocked = res.status === 503 || !contentType.includes('application/json');
        reason = `http-${res.status}`;
      }
    } catch (e) {
      reason = e.message;
    }
    if (!blocked && links.length === 0) {
      try {
        const html = await proxyFetch(url);
        if (html) {
          if (isChallengePage(html)) { blocked = true; reason = 'challenge'; }
          else links = extractProductLinksFromDoc(parseHTML(html), html);
        }
      } catch (e) {
        reason = reason || e.message;
      }
    }
    return { links, blocked, reason };
  }

  while (allItems.length < maxProducts && !scraperAbort && emptyCount < 2 && failCount < 3) {
    const url = `${LEGACY_BASE}/?fs=${encodeURIComponent(term)}&${LEGACY_LISTING_EXTRA}&pg=${page}`;
    slog(`Fetching search page ${page}: ${url.substring(0, 90)}...`, 'info');
    const result = await fetchSearchPage(url);
    if (result.blocked) {
      failCount++;
      slog(`  → Search page blocked (${result.reason || 'unknown'}). Fresh session and short cooldown, then next page.`, 'warn');
      await resetProxySessionShared(`search page ${page} blocked`);
      await sleep(SEARCH_BLOCK_RECOVERY_MS);
      page++;
      continue;
    }
    failCount = 0;
    if (!result.links.length) {
      emptyCount++;
      noNewCount++;
      slog(`  → No products on search page ${page}`, 'warn');
    } else {
      emptyCount = 0;
      let newCount = 0;
      for (const item of result.links) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          allItems.push({ url: item.url, techScore: item.techScore, category: '' });
          newCount++;
        }
        if (allItems.length >= maxProducts) break;
      }
      slog(`  +${newCount} products (total unique: ${allItems.length})`, 'success');
      if (newCount === 0) {
        noNewCount++;
        slog(`  → Search page ${page} only repeated known products (${noNewCount}/2).`, 'warn');
      } else {
        noNewCount = 0;
      }
    }

    if (noNewCount >= 2) {
      slog(`No new search products on ${noNewCount} consecutive pages. URL collection is complete; starting scrape with ${allItems.length} collected products.`, 'warn');
      break;
    }
    page++;
    await sleep(2500 + Math.random() * 1500);
  }

  slog(`Search URL collection complete: ${allItems.length} unique product URLs`, allItems.length ? 'success' : 'warn');
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
  if (!categoryId) return new Set();
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
  const isBrandSearch = !String(categoryId || '').trim();
  let errorStreak = 0;
  let challengeStreak = 0;
  // Adaptive rate-limit: track last 20 outcomes; if success rate drops below
  // 60% we pause for a long cool-down and slow down per-product delay.
  const recent = []; // 'ok' | 'err' | 'cf'
  const _MAX_CONSEC_ERRORS = 10; // hard abort threshold
  // CF guards: once the proxy session is burned by Cloudflare every subsequent
  // request returns the "Nur einen Moment…" interstitial. The fix is to (a)
  // rotate the browser fingerprint on the proxy whenever we see a CF streak,
  // (b) periodically rotate proactively (mirrors Phase-1 behaviour), and (c)
  // hard-abort if even rotation cannot recover so the scraper checkpoints
  // instead of silently burning the entire URL list.
  const _CF_STREAK_BEFORE_RESET = 3;
  const _CF_HARD_ABORT_STREAK = 12;
  const _PROACTIVE_RESET_EVERY = isBrandSearch ? 150 : 80; // products
  const _PROACTIVE_COOLDOWN_MS = isBrandSearch ? 5000 : 15000;
  const _CF_RECOVERY_MS = isBrandSearch ? 15000 : 45000;
  let productsSinceReset = 0;
  let cfRetryUrl = null; // URL to retry once immediately after a session reset

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

  // PRE-FETCH OVERLAP: while product i is being parsed + persisted to PB,
  // we fetch product i+1's HTML in the background so the next iteration
  // does not pay the proxy round-trip cost again. Translation is no longer
  // in this loop (see Dictionary → "Translate Category"), so this overlap
  // mostly hides the PB write + parse cost (~200-400ms).
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
        slog(`  → Challenge page: ${slug} (streak ${challengeStreak})`, 'warn');

        // Hard abort: rotating the session has stopped helping, the proxy or
        // upstream IP pool is fully burned. Checkpoint so the user can
        // Resume later with a fresh proxy restart.
        if (challengeStreak >= _CF_HARD_ABORT_STREAK) {
          slog(`🛑 ${_CF_HARD_ABORT_STREAK} ardışık Cloudflare bloğu. Proxy/IP havuzu yandı. Checkpoint kaydedildi — proxy'i yeniden başlatıp Resume kullan.`, 'error');
          _saveCheckpoint(urlItems, i, categoryId, results);
          scraperAbort = true;
          break;
        }

        // Recovery flow: rotate browser fingerprint, wait briefly for the
        // edge to "forget" us, then re-attempt the SAME URL once. Only count
        // the product as skipped if even the post-reset retry fails — this
        // keeps us from leaking the entire CF-streak window into the
        // skipped list (which previously caused 20+ products to be silently
        // dropped while the scraper looked busy).
        if (challengeStreak >= _CF_STREAK_BEFORE_RESET && cfRetryUrl !== item.url) {
          await resetProxySessionShared(`${challengeStreak} ardışık CF`);
          productsSinceReset = 0;
          slog(`❄️ Recovery cooldown ${(_CF_RECOVERY_MS / 1000).toFixed(0)}s — aynı ürün tekrar denenecek…`, 'info');
          await sleep(_CF_RECOVERY_MS);
          // Drop any in-flight prefetch — its session is the old, burned one.
          nextHtmlPromise = null;
          cfRetryUrl = item.url;
          i--; // re-iterate the same product index
          _scrapeProductCount--; // un-count the failed attempt
          continue;
        }

        results.skipped++;
        cfRetryUrl = null;
        nextHtmlPromise = prefetchNext(i + 1);
        continue;
      }
      challengeStreak = 0;
      cfRetryUrl = null;
      productsSinceReset++;

      // Proactive rotation mirrors Phase-1's "every N pages" rule. Doing it
      // BEFORE Cloudflare retaliates is far cheaper than the recovery path
      // above (no wasted product attempts).
      if (productsSinceReset >= _PROACTIVE_RESET_EVERY) {
        productsSinceReset = 0;
        await resetProxySessionShared(`proactive after ${_PROACTIVE_RESET_EVERY} products`);
        slog(`❄️ Proactive cooldown ${(_PROACTIVE_COOLDOWN_MS / 1000).toFixed(0)}s…`, 'info');
        await sleep(_PROACTIVE_COOLDOWN_MS);
        nextHtmlPromise = null;
      }

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
      // PocketBase save. Translation is intentionally DECOUPLED from the
      // scrape loop — products are persisted with German specs only, and
      // the admin runs the Dictionary → "Translate Category" action when
      // ready. This keeps scrape at network-bound speed (~1-2s/product). ──
      nextHtmlPromise = prefetchNext(i + 1);

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

  const mode = document.getElementById('scrapeMode')?.value || 'brand';
  const searchTerm = document.getElementById('scrapeSearchTerm')?.value?.trim() || '';
  const catSelect = document.getElementById('scrapeCategory');
  const catValue = catSelect ? catSelect.value : '';
  if (mode === 'brand' && !searchTerm) { toast('Enter a brand or search term', 'w'); return; }
  if (mode === 'category' && !catValue) { toast('Select a category', 'w'); return; }

  const maxProducts = parseInt(document.getElementById('scrapeMaxProducts')?.value) || 200;
  const delay = parseInt(document.getElementById('scrapeDelay')?.value) || 2000;

  scraperRunning = true; scraperAbort = false;
  document.getElementById('btnBulkScrape').style.display = 'none';
  document.getElementById('btnStopScrape').style.display = '';

  clearScraperLog();
  slog(`Scraper build: ${SCRAPER_BUILD}`, 'info');
  slog(`Bulk scrape: ${mode === 'brand' ? `"${searchTerm}"` : catValue}, max ${maxProducts}`, 'info');

  try {
    // Phase 1: Collect product URLs from brand search or category listing
    slog('── Phase 1: Collecting product URLs ──', 'info');
    const urlItems = mode === 'brand'
      ? await collectSearchProductUrls(searchTerm, maxProducts)
      : await collectProductUrls(catValue, maxProducts);
    slog(`Found ${urlItems.length} product URLs`, urlItems.length > 0 ? 'success' : 'warn');

    if (scraperAbort) {
      // Don't throw away the URLs. If we already have a meaningful batch,
      // keep scraping the products that ARE in hand instead of silently
      // returning. Otherwise an interrupted Phase-1 (e.g. stop button or
      // 3-consec CF fails) wastes the 200-500 URLs that were already
      // collected. The user can still hard-stop after Phase 2 starts.
      if (urlItems.length > 0) {
        slog(`Phase 1 interrupted with ${urlItems.length} URLs collected. Proceeding to Phase 2 with what we have…`, 'warn');
        scraperAbort = false; // re-enable the loop for Phase 2
      } else {
        slog(`Scraping stopped by user. 0 URLs were collected.`, 'warn');
        finishScraping();
        return;
      }
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
    const results = await sequentialScrape(toScrape, mode === 'brand' ? '' : catValue, delay);

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
  if (!inputVal) { toast('Enter a product name or Legacy.eu URL', 'w'); return; }
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
      // Product name search via Legacy search page
      slog(`Searching Legacy.eu for: ${name}`);
      const searchUrl = `${LEGACY_BASE}/?fs=${encodeURIComponent(name)}`;
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
      products = allProducts.filter(p => String(p.source || '').toLowerCase().includes('epey') || (p.sourceUrl && p.sourceUrl.includes('epey.com')));
    } else {
      const items = await pbGetAll('products', { filter: `(source="epey.com" || source="epey")` });
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

// ═══════════════════════════════════════
//  EPEY.COM OVERRIDES
//  Keep these at the end so they replace the retired Legacy implementations.
// ═══════════════════════════════════════

function normalizeEpeyImageUrl(url) {
  let u = String(url || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) u = `https:${u}`;
  if (!/^https?:\/\//i.test(u)) return '';
  u = u.split(/[?#]/)[0];
  if (!/resim\.epey\.com/i.test(u)) return '';
  if (/\/(?:tema|marka|kategori|logo|site|grup)\//i.test(u)) return '';
  if (/(favicon|yildiz|profil|yukleniyor|loading|placeholder)/i.test(u)) return '';
  if (!/\.(?:jpe?g|png|webp|avif)$/i.test(u)) return '';
  return u;
}

function isEpeyProductUrl(url) {
  try {
    const u = new URL(url, EPEY_BASE);
    return /(^|\.)epey\.com$/i.test(u.hostname)
      && /\.html$/i.test(u.pathname)
      && !/-resimleri\.html$/i.test(u.pathname)
      && !/\/(karsilastir|sayfa|yardim|hakkimizda|iletisim)\//i.test(u.pathname);
  } catch { return false; }
}

function normalizeEpeyProductUrl(url) {
  try {
    const u = new URL(url, EPEY_BASE);
    if (!isEpeyProductUrl(u.href)) return '';
    return `${EPEY_BASE}${u.pathname}`;
  } catch { return ''; }
}

function findCategoryByEpeyUrl(url) {
  if (!url || typeof QorAiCategories === 'undefined') return null;
  try {
    const parts = new URL(url, EPEY_BASE).pathname.split('/').filter(Boolean);
    const first = normalizeCategoryToken(parts[0] || '');
    const path = parts.slice(0, -1).join('/').toLowerCase();
    const all = QorAiCategories.getAll();
    return all.find(c => normalizeCategoryToken(c.id) === first)
      || all.find(c => c.epeyPath && path.startsWith(String(c.epeyPath).toLowerCase()))
      || null;
  } catch { return null; }
}

function extractProductIdentifiersFromSpecs(specs) {
  const ids = { gtin: '', mpn: '' };
  for (const [key, value] of Object.entries(specs || {})) {
    const k = String(key || '').toLocaleLowerCase('tr');
    const v = String(value || '').replace(/\s+/g, ' ').trim();
    if (!ids.gtin && /\b(ean|gtin|barkod|upc)\b/i.test(k)) {
      const m = v.match(/\b\d{8,14}\b/);
      if (m) ids.gtin = m[0];
    }
    if (!ids.mpn && /(mpn|üretici kodu|urun kodu|ürün kodu|model kodu|parca numarasi|parça numarası|part number)/i.test(k)) {
      ids.mpn = v.split(/\s*[|,;]\s*/)[0].slice(0, 200);
    }
  }
  return ids;
}

function extractPrice(doc) {
  if (typeof doc === 'string') doc = parseHTML(doc);
  const candidates = [
    '#fiyat', '.fiyat', '.urun_fiyat', '.urun-fiyat',
    '[class*="fiyat"]', '[itemprop="price"]'
  ];
  for (const sel of candidates) {
    const el = doc.querySelector(sel);
    const txt = el?.getAttribute('content') || el?.textContent || '';
    const m = txt.replace(/\s+/g, ' ').match(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?)\s*(?:TL|₺)/i);
    if (m) return m[0].trim();
  }
  return '';
}

function extractTechScore(doc) {
  if (typeof doc === 'string') doc = parseHTML(doc);
  const parseScore = (text) => {
    const m = String(text || '').match(/(\d{1,3})/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1 && n <= 100 ? n : null;
  };
  for (const sel of ['#puan', '.teknikpuan', '.teknik-puan', '.puan', '[data-teknikpuan]', '[data-puan]', '.circliful']) {
    const el = doc.querySelector(sel);
    if (!el) continue;
    const s = parseScore(el.getAttribute('data-teknikpuan') || el.getAttribute('data-puan') || el.getAttribute('data-percent') || el.textContent);
    if (s) return s;
  }
  return null;
}

// Epey serves the same photo in several size tiers, encoded as a one-letter
// filename prefix: z=zoom/huge (~1MB), m=medium (~80-150KB, gallery display),
// s/t/c/k=thumbnails. We keep the MEDIUM tier — sharp enough for the product
// gallery, small enough to not bloat PocketBase storage — and fall back to the
// next-best tier only when m_ is missing.
const _EPEY_TIER_RANK = { m: 0, b: 1, l: 2, o: 3, z: 4, t: 5, c: 6, s: 7, k: 8 };
function _epeyImageKey(u) {
  // Strip the size-tier prefix + extension so every tier of one photo collapses
  // to a single identity (…/934802/m_huawei-…-18.png → …/934802/huawei-…-18).
  return String(u).toLowerCase()
    .replace(/\/[a-z]_([^/]+)$/i, '/$1')
    .replace(/\.(jpe?g|png|webp|avif)$/i, '');
}
function _epeyImageTier(u) {
  const m = String(u).match(/\/([a-z])_[^/]+\.(?:jpe?g|png|webp|avif)$/i);
  return m ? m[1].toLowerCase() : 'z';
}

function extractImages(doc, productSlug = '') {
  if (typeof doc === 'string') doc = parseHTML(doc);
  // Group candidates by photo identity; for each, keep the best (medium) tier.
  // A Map preserves first-seen order, so the og:image / first gallery thumb
  // stays the hero image.
  const byKey = new Map(); // key -> { url, rank }
  const consider = (raw) => {
    const u = normalizeEpeyImageUrl(raw);
    if (!u) return;
    const key = _epeyImageKey(u);
    const rank = _EPEY_TIER_RANK[_epeyImageTier(u)] ?? 9;
    const prev = byKey.get(key);
    if (!prev || rank < prev.rank) {
      // Keep the original insertion slot when upgrading the tier.
      byKey.set(key, { url: u, rank });
    }
  };

  const ogImage = doc.querySelector('meta[property="og:image"], meta[name="twitter:image"], link[rel="image_src"]');
  consider(ogImage?.getAttribute('content') || ogImage?.getAttribute('href'));

  doc.querySelectorAll('#resimBuyuk img, #resimBuyuk a, #resimk img, #resimk a, .galerim img, .galerik img, .bresim, [id^="rtab"] img, [id^="modal-galeri"] img, a[href*="-resimleri.html"]').forEach(el => {
    for (const attr of ['data-src', 'data-lazy', 'data-original', 'data-zoom', 'data-big', 'data-full', 'data-image', 'data-url', 'src', 'href']) {
      const val = el.getAttribute(attr);
      if (val && /resim\.epey\.com/i.test(val)) consider(val);
    }
    const style = el.getAttribute('style') || '';
    const sm = style.match(/url\((['"]?)([^'")]+resim\.epey\.com[^'")]+)\1\)/i);
    if (sm) consider(sm[2]);
    const onclick = el.getAttribute('onclick') || '';
    const om = onclick.match(/['"]([^'"]*resim\.epey\.com[^'"]*)['"]/i);
    if (om) consider(om[1]);
  });

  return [...byKey.values()].map(v => v.url).slice(0, MAX_IMAGES_PER_PRODUCT);
}

async function fetchGalleryImages(productSlug) {
  if (!productSlug) return [];
  try {
    const html = await proxyFetch(`${EPEY_BASE}/${productSlug}-resimleri.html`);
    if (!html || isChallengePage(html)) return [];
    return extractImages(parseHTML(html), productSlug);
  } catch { return []; }
}

function parseSpecs(doc) {
  const specs = {};
  const specSections = {};
  const keySpecs = {};

  const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const cleanValueText = (value) => String(value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  const nodeOwnText = (node) => {
    if (!node) return '';
    return Array.from(node.childNodes || [])
      .map(child => child.nodeType === 3 ? child.textContent : '')
      .join(' ');
  };
  const valueFromCell = (cell) => {
    if (!cell) return '';
    const values = [];
    const entries = cell.querySelectorAll('a, span, div');
    entries.forEach(el => {
      if (el.querySelector('a, span, div')) return;
      const t = cleanText(el.textContent);
      if (t && !values.includes(t)) values.push(t);
    });
    const own = cleanText(nodeOwnText(cell));
    if (own && !values.includes(own)) values.unshift(own);
    if (values.length) return values.join('\n');
    return cleanValueText(cell.textContent);
  };
  const addSpec = (section, key, value) => {
    const k = cleanText(key).replace(/:$/, '');
    const v = cleanValueText(value);
    if (!k || !v || k.length > 180 || v.length > 1200) return;
    if (!specSections[section]) specSections[section] = {};
    specs[k] = v;
    specSections[section][k] = v;
  };

  const parseList = (root, section) => {
    root.querySelectorAll('li').forEach(li => {
      const strong = li.querySelector('strong, b, .baslik, .cell:first-child');
      if (!strong) return;
      let value = valueFromCell(li.querySelector('span.cell, .cell:not(:first-child)'));
      if (!value) {
        const clone = li.cloneNode(true);
        clone.querySelectorAll('strong, b, .baslik, .cell:first-child, script, style').forEach(x => x.remove());
        value = cleanValueText(clone.textContent);
      }
      addSpec(section, strong.textContent, value);
    });
  };

  const ozellikler = doc.querySelector('#ozellikler, .ozellikler');
  if (ozellikler) {
    ozellikler.querySelectorAll('.masonry-brick, .ozellik-grup, .detay, section, .liste').forEach(block => {
      const h = block.querySelector('h2, h3, h4, .baslik');
      const section = cleanText(h?.querySelector('span')?.textContent || h?.textContent || 'Genel');
      parseList(block, section || 'Genel');
      block.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('th,td');
        if (cells.length >= 2) addSpec(section || 'Genel', cells[0].textContent, valueFromCell(cells[1]));
      });
    });

    if (Object.keys(specs).length === 0) {
      let section = 'Genel';
      ozellikler.querySelectorAll('h2,h3,h4,li,tr').forEach(el => {
        if (/^H[234]$/i.test(el.tagName)) {
          section = cleanText(el.textContent) || section;
          return;
        }
        if (el.tagName === 'LI') parseList(el.parentElement || el, section);
        if (el.tagName === 'TR') {
          const cells = el.querySelectorAll('th,td');
          if (cells.length >= 2) addSpec(section, cells[0].textContent, valueFromCell(cells[1]));
        }
      });
    }
  }

  if (Object.keys(specs).length === 0) {
    doc.querySelectorAll('table tr').forEach(row => {
      const cells = row.querySelectorAll('th,td');
      if (cells.length >= 2) addSpec('Genel', cells[0].textContent, valueFromCell(cells[1]));
    });
  }

  doc.querySelectorAll('.cell, .ozet .row, .row1, .row2').forEach(el => {
    const key = cleanText(el.querySelector('.row1, strong, b')?.textContent);
    const value = cleanText(el.querySelector('.row2, span:last-child')?.textContent);
    if (key && value && !specs[key]) {
      keySpecs[key] = value;
      addSpec('Öne Çıkanlar', key, value);
    }
  });

  return { specs, specSections, keySpecs };
}

async function scrapeProductDetail(html, url, categoryId = '') {
  if (!html || isChallengePage(html)) return null;
  const doc = parseHTML(html);
  const bodyText = (doc.body?.textContent || '').trim();
  if (bodyText.length < 100) return null;

  const h1 = doc.querySelector('h1 > a') || doc.querySelector('h1');
  const originalName = String(h1?.textContent || '').replace(/\s+/g, ' ').trim();
  if (!originalName) return null;

  const productSlug = slugFromUrl(url);
  const { specs: rawSpecs, specSections: rawSections, keySpecs: rawKeySpecs } = parseSpecs(doc);
  const ids = extractProductIdentifiersFromSpecs(rawSpecs);
  const brand = extractBrand(originalName, rawSpecs);
  let category = categoryId || findCategoryByEpeyUrl(url)?.id || detectCategoryFromDoc(doc, categorySlugFromUrl(url)) || categorySlugFromUrl(url);

  let images = extractImages(doc, productSlug);
  if (images.length < MAX_IMAGES_PER_PRODUCT) {
    const gallery = await fetchGalleryImages(productSlug);
    const seen = new Set(images.map(x => _epeyImageKey(x)));
    for (const img of gallery) {
      if (images.length >= MAX_IMAGES_PER_PRODUCT) break;
      const k = _epeyImageKey(img);
      if (!seen.has(k)) { seen.add(k); images.push(img); }
    }
  }
  images = images.slice(0, MAX_IMAGES_PER_PRODUCT);

  const variantGroup = modelFamilyKey({ name: originalName, brand, category })
    || normalizeVariantGroupFromSlug(productSlug);

  return {
    id: generateProductId(productSlug || originalName),
    slug: productSlug || generateProductId(originalName),
    name: originalName,
    brand,
    category,
    source: 'epey.com',
    sourceUrl: normalizeEpeyProductUrl(url) || url,
    specs: rawSpecs,
    specSections: rawSections,
    keySpecs: rawKeySpecs,
    specsCount: Object.keys(rawSpecs).length,
    images,
    imageUrl: images[0] || '',
    techScore: extractTechScore(doc),
    price_raw: extractPrice(doc),
    gtin: ids.gtin,
    mpn: ids.mpn,
    variantGroup,
    scrapedAt: new Date().toISOString(),
  };
}

function extractProductLinksFromDoc(doc) {
  if (typeof doc === 'string') doc = parseHTML(doc);
  const results = [];
  const seen = new Set();
  const roots = [
    doc.querySelector('#listele'),
    doc.querySelector('.urunler'),
    doc.querySelector('.listele'),
    doc.querySelector('.urun-listesi'),
    doc.querySelector('main'),
    doc.body,
  ].filter(Boolean);

  for (const root of roots) {
    root.querySelectorAll('a[href], [data-href], [data-url], [onclick]').forEach(el => {
      let href = el.getAttribute('href') || el.getAttribute('data-href') || el.getAttribute('data-url') || '';
      if (!href) {
        const m = String(el.getAttribute('onclick') || '').match(/['"]([^'"]+\.html)['"]/i);
        if (m) href = m[1];
      }
      const full = normalizeEpeyProductUrl(href);
      if (!full || seen.has(full)) return;
      seen.add(full);
      const card = el.closest('.urun, .urun-k, .liste-urun, [class*="urun"], li, tr, div');
      results.push({ url: full, techScore: card ? extractListingTechScore(card) : null });
    });
    if (results.length) break;
  }
  return results;
}

function epeySearchUrls(term, page = 1) {
  const q = encodeURIComponent(term);
  const slug = normalizeCategoryToken(term);
  const suffix = page > 1 ? `&sayfa=${page}` : '';
  return [
    `${EPEY_BASE}/ara/?ara=${q}${suffix}`,
    `${EPEY_BASE}/arama/?q=${q}${suffix}`,
    `${EPEY_BASE}/arama/?s=${q}${suffix}`,
    `${EPEY_BASE}/arama/${slug}/${page > 1 ? `?sayfa=${page}` : ''}`,
    `${EPEY_BASE}/?q=${q}${suffix}`,
  ];
}

function epeyBrandCategoryUrls(term) {
  const brandSlug = normalizeCategoryToken(term);
  if (!brandSlug || /\d/.test(brandSlug)) return [];
  const cats = (typeof QorAiCategories !== 'undefined' ? QorAiCategories.getAll() : [])
    .filter(c => c.epeyPath)
    .map(c => ({ id: c.id, url: `${EPEY_BASE}/${String(c.epeyPath).replace(/^\/|\/$/g, '')}/${brandSlug}/` }));
  const priority = [
    'laptops','smartphones','tablets','desktops','monitors','tvs','ssd','motherboards',
    'graphics_cards','cpus','ram','printers','headphones','speakers','smartwatches'
  ];
  const score = (id) => {
    const i = priority.indexOf(id);
    return i >= 0 ? i : 999;
  };
  const seen = new Set();
  return cats
    .sort((a, b) => score(a.id) - score(b.id))
    .filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
}

// Collect product URLs for a brand / search term.
//
// CATEGORY-SCOPED (categoryId given) = Epey's per-category brand listing
// (`epey.com/<epeyPath>/<brand>/`) — e.g. Apple → Akıllı Telefon returns ONLY
// Apple phones, zero junk (no perfume / baby-food rows that an "apple" site
// search drags in).
//
// NO CATEGORY = Epey site search (`/ara/?ara=<term>`): brand-based across
// every category, in site order. Useful but can include unrelated products.
async function collectSearchProductUrls(searchTerm, maxProducts = 200, categoryId = '') {
  const term = String(searchTerm || '').trim();
  if (!term) return [];
  const allItems = [];
  const seen = new Set();

  const itemsFromData = (data) => Array.isArray(data?.items)
    ? data.items
    : (Array.isArray(data?.links) ? data.links.map(x => typeof x === 'string' ? { url: x } : x) : []);

  const pushItems = (items) => {
    let added = 0;
    for (const item of items || []) {
      if (allItems.length >= maxProducts) break;
      const full = normalizeEpeyProductUrl(item.url || item);
      if (!full || seen.has(full)) continue;
      seen.add(full);
      allItems.push({ url: full, techScore: item.techScore || null });
      added++;
    }
    return added;
  };

  const fetchLinks = async (url) => {
    const res = await fetch(
      `${PROXY_URL}/category-links?url=${encodeURIComponent(url)}&max=${encodeURIComponent(maxProducts)}`,
      { signal: AbortSignal.timeout(120000) }
    );
    return res.ok ? await res.json() : null;
  };

  // ── CATEGORY-SCOPED: brand + category → clean per-category brand listing ──
  const catDef = categoryId && typeof QorAiCategories !== 'undefined'
    ? (QorAiCategories.getById?.(categoryId) || QorAiCategories.getAll().find(c => c.id === categoryId))
    : null;
  const epeyPath = catDef && catDef.epeyPath ? String(catDef.epeyPath).replace(/^\/|\/$/g, '') : '';
  if (categoryId) {
    if (!epeyPath) {
      slog(`Category "${categoryId}" has no Epey path — falling back to site-wide search.`, 'warn');
    } else {
      const brandSlug = normalizeCategoryToken(term);
      const baseUrl = `${EPEY_BASE}/${epeyPath}/${brandSlug}/`;
      slog(`Collecting "${term}" in ${catDef.name || categoryId} — ${baseUrl}`, 'info');
      const pages = [baseUrl];
      const seenPages = new Set();
      for (let pi = 0; pi < pages.length && pi < 40 && allItems.length < maxProducts && !scraperAbort; pi++) {
        const pageUrl = pages[pi];
        if (seenPages.has(pageUrl)) continue;
        seenPages.add(pageUrl);
        try {
          const data = await fetchLinks(pageUrl);
          const added = pushItems(itemsFromData(data));
          if (pi === 0 || added) slog(`  +${added} (${allItems.length}/${maxProducts})`, allItems.length ? 'success' : 'warn');
          for (const next of (Array.isArray(data?.pages) ? data.pages : [])) {
            if (next && !seenPages.has(next) && !pages.includes(next)) pages.push(next);
          }
        } catch (e) {
          slog(`  category page failed: ${e.message}`, 'warn');
        }
      }
      return allItems.slice(0, maxProducts);
    }
  }

  // ── NO CATEGORY: Epey site search ──────────────────────────────────────
  slog(`Collecting Epey products for brand/search: "${term}"`);
  slog(`  searching Epey for "${term}" (site order, all categories)`, 'info');
  for (const searchUrl of epeySearchUrls(term)) {
    if (scraperAbort || allItems.length >= maxProducts) break;
    try {
      const data = await fetchLinks(searchUrl);
      const items = itemsFromData(data);
      if (!items.length) continue;
      const added = pushItems(items);
      slog(`  search "${term}": +${added} (${allItems.length}/${maxProducts})`, 'success');
      // Follow numbered pagination if the proxy reported it and we still
      // need more (AJAX pagination usually already covered this).
      const pages = Array.isArray(data?.pages) ? data.pages : [];
      for (const pg of pages) {
        if (scraperAbort || allItems.length >= maxProducts) break;
        try {
          const more = pushItems(itemsFromData(await fetchLinks(pg)));
          if (more) slog(`  +${more} more (${allItems.length}/${maxProducts})`);
        } catch { /* page failed — keep going */ }
      }
      break; // a working search endpoint was found — don't try alternates
    } catch (e) {
      slog(`  search endpoint failed: ${e.message}`, 'warn');
    }
  }
  if (allItems.length >= maxProducts) return allItems.slice(0, maxProducts);

  // ── FALLBACK: per-category brand listings, round-robin merged ──────────
  if (!allItems.length) {
    const brandUrls = epeyBrandCategoryUrls(term);
    if (brandUrls.length) {
      slog(`  site search empty — scanning ${brandUrls.length} brand listings`, 'info');
      const buckets = [];
      for (const brandPage of brandUrls) {
        if (scraperAbort) break;
        const bucket = [];
        try {
          const pages = [brandPage.url];
          const seenPages = new Set();
          for (let pi = 0; pi < pages.length && pi < 25 && bucket.length < maxProducts && !scraperAbort; pi++) {
            const pageUrl = pages[pi];
            if (seenPages.has(pageUrl)) continue;
            seenPages.add(pageUrl);
            const data = await fetchLinks(pageUrl);
            for (const item of itemsFromData(data)) {
              const full = normalizeEpeyProductUrl(item.url);
              if (!full || seen.has(full)) continue;
              seen.add(full);
              bucket.push({ url: full, techScore: item.techScore || null });
              if (bucket.length >= maxProducts) break;
            }
            for (const next of (Array.isArray(data?.pages) ? data.pages : [])) {
              if (!next || seenPages.has(next) || pages.includes(next)) continue;
              pages.push(next);
            }
          }
        } catch { /* brand listing may not exist for this section */ }
        if (bucket.length) {
          slog(`  ${brandPage.id}: +${bucket.length}`);
          buckets.push(bucket);
        }
      }
      let exhausted = false;
      for (let idx = 0; !exhausted && allItems.length < maxProducts; idx++) {
        exhausted = true;
        for (const bucket of buckets) {
          if (idx >= bucket.length) continue;
          exhausted = false;
          allItems.push(bucket[idx]);
          if (allItems.length >= maxProducts) break;
        }
      }
    }
  }

  return allItems.slice(0, maxProducts);
}

async function _loadExistingSourceUrls(categoryId) {
  try {
    const safeCategory = String(categoryId || '').replace(/"/g, '\\"');
    const filter = safeCategory
      ? `category="${safeCategory}" && (source="epey.com" || source="epey")`
      : `(source="epey.com" || source="epey")`;
    const docs = await pbGetAll('products', { filter, sort: '-created' });
    const set = new Set();
    for (const d of docs) {
      const data = typeof d.data === 'function' ? d.data() : (d.data || d);
      if (data?.sourceUrl) set.add(String(data.sourceUrl).trim());
    }
    return set;
  } catch (e) {
    slog(`  (existing Epey URL preload failed: ${e.message})`, 'warn');
    return new Set();
  }
}

async function startBulkScrape() {
  if (scraperRunning) { toast('Scraper already running', 'w'); return; }
  if (!(await checkProxy())) { toast('Start the local proxy first', 'e'); return; }

  const searchTerm = document.getElementById('scrapeSearchTerm')?.value?.trim() || '';
  if (!searchTerm) { toast('Marka veya arama terimi gir', 'w'); return; }
  const categoryId = document.getElementById('scrapeCategory')?.value?.trim() || '';
  const maxProducts = parseInt(document.getElementById('scrapeMaxProducts')?.value) || 200;
  const delay = parseInt(document.getElementById('scrapeDelay')?.value) || 300;

  scraperRunning = true; scraperAbort = false;
  document.getElementById('btnBulkScrape').style.display = 'none';
  document.getElementById('btnStopScrape').style.display = '';
  clearScraperLog();
  slog(`Scraper build: ${SCRAPER_BUILD}`, 'info');
  slog(`Epey import: "${searchTerm}"${categoryId ? ` · category=${categoryId}` : ' · all categories'} · max ${maxProducts}`, 'info');

  try {
    const urlItems = await collectSearchProductUrls(searchTerm, maxProducts, categoryId);
    slog(`Found ${urlItems.length} Epey product URLs`, urlItems.length ? 'success' : 'warn');
    if (!urlItems.length) {
      slog('No product URLs found. Try a more exact brand/model term or check proxy.', 'error');
      finishScraping();
      return;
    }
    const results = await sequentialScrape(urlItems.slice(0, maxProducts), categoryId, delay);
    slog(`\n═══ Done: ${results.added} added | ${results.skipped} skipped | ${results.errors} errors ═══`, 'success');
    if (results.added > 0 && typeof loadProducts === 'function') await loadProducts();
  } catch (e) {
    slog(`Fatal error: ${e.message}`, 'error');
  }
  finishScraping();
}

async function scrapeByUrl() {
  const inputVal = document.getElementById('scrapeUrl')?.value?.trim() || '';
  if (!inputVal) { toast('Epey URL veya ürün adı gir', 'w'); return; }
  if (scraperRunning) { toast('Scraper already running', 'w'); return; }
  if (!(await checkProxy())) { toast('Start the local proxy first', 'e'); return; }

  clearScraperLog();
  scraperRunning = true;
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('onclick') === 'scrapeByUrl()');
  if (btn) btn.disabled = true;
  let url = '';
  try {
    if (/^https?:\/\//i.test(inputVal)) {
      url = normalizeEpeyProductUrl(inputVal);
      if (!url) { toast('Sadece epey.com ürün URL destekleniyor', 'e'); return; }
      slog(`Direct Epey product URL: ${url}`, 'info');
    } else {
      slog(`Searching Epey: ${inputVal}`);
      const links = await collectSearchProductUrls(inputVal, 1);
      url = links[0]?.url || '';
      if (!url) { slog('No Epey result found', 'error'); return; }
      slog(`First Epey match: ${url}`, 'info');
    }

    const html = await proxyFetch(url);
    if (!html || isChallengePage(html)) { slog('Page not found or blocked', 'error'); return; }
    const product = await scrapeProductDetail(html, url, document.getElementById('singleUrlCategory')?.value || '');
    if (!product) { slog('Could not parse product data', 'error'); return; }
    const clean = prepareProductPayload(product);
    const saved = await pbSetDoc('products', clean.sourceUrl || clean.slug || clean.id, clean);
    window.dispatchEvent(new CustomEvent('qorai:product-saved', { detail: { id: saved?.id || clean.slug, product: clean } }));
    slog(`Saved: ${clean.name} (${clean.specsCount} specs, ${clean.images?.length || 0} images)`, 'success');
    if (typeof loadProducts === 'function') await loadProducts();
  } catch (e) {
    slog(`Error: ${e.message}`, 'error');
  } finally {
    scraperRunning = false;
    if (btn) btn.disabled = false;
  }
}

// ═══════════════════════════════════════
//  AFFILIATE OFFER SYNC (eBay) — admin tab
//  Spawns scripts/sync_offers.js via the local proxy and streams its log.
// ═══════════════════════════════════════
let _offersPollTimer = null;

async function offersStartSync() {
  if (!(await checkProxy())) { toast('Önce local proxy başlat', 'e'); return; }
  const cat = document.getElementById('offersCategory')?.value || '';
  const limit = parseInt(document.getElementById('offersLimit')?.value) || 0;
  const missingOnly = document.getElementById('offersMissingOnly')?.checked !== false;
  try {
    const r = await fetch(`${PROXY_URL}/offers/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cat, limit, missingOnly }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast('Başlatılamadı: ' + (j.error || r.status), 'e'); return; }
    document.getElementById('btnOffersSync').style.display = 'none';
    document.getElementById('btnOffersStop').style.display = '';
    document.getElementById('offersLog').textContent = 'Başlatıldı — eBay kotası hesaplanıyor…\n';
    _offersStartPolling();
  } catch (e) {
    toast('Proxy ulaşılamadı: ' + e.message, 'e');
  }
}

async function offersStop() {
  try { await fetch(`${PROXY_URL}/offers/stop`, { method: 'POST' }); } catch {}
  setTimeout(offersRefreshStatus, 400);
}

async function offersRefreshStatus() {
  try {
    const r = await fetch(`${PROXY_URL}/offers/status`);
    if (!r.ok) return;
    const s = await r.json();
    const running = !!s.running;
    const startBtn = document.getElementById('btnOffersSync');
    const stopBtn = document.getElementById('btnOffersStop');
    if (startBtn) startBtn.style.display = running ? 'none' : '';
    if (stopBtn) stopBtn.style.display = running ? '' : 'none';
    const st = document.getElementById('offersStatus');
    if (st) { st.textContent = running ? 'çalışıyor…' : 'idle'; st.style.color = running ? '#06b6d4' : ''; }
    if (s.logTail) {
      const log = document.getElementById('offersLog');
      if (log) {
        const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
        log.textContent = s.logTail;
        if (atBottom) log.scrollTop = log.scrollHeight;
      }
    }
    if (running && !_offersPollTimer) _offersStartPolling();
    if (!running && _offersPollTimer) { clearInterval(_offersPollTimer); _offersPollTimer = null; }
  } catch { /* proxy down — silent */ }
}

function _offersStartPolling() {
  if (_offersPollTimer) return;
  _offersPollTimer = window.setInterval(offersRefreshStatus, 2000);
}

window.offersStartSync = offersStartSync;
window.offersStop = offersStop;
window.offersRefreshStatus = offersRefreshStatus;
