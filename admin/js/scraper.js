// ═══════════════════════════════════════════════════════════════════
//  QOR AI SCRAPER MODULE — epey.com Scraper
//  Scrapes products from epey.com via local Puppeteer proxy.
//  Stores Epey Turkish specs as English canonical specs via the local dictionary.
//  Uses QorAiCategories / QorAiBrands (categories.js).
//  Persists to PocketBase via pb_client.js helpers.
// ═══════════════════════════════════════════════════════════════════

const PROXY_URL = 'http://localhost:3456';
const EPEY_BASE = 'https://www.epey.com';
const LEGACY_BASE = EPEY_BASE;
const LEGACY_LISTING_EXTRA = '';
const PROXY_START_COMMAND = 'npm run scraper:proxy';
const SCRAPER_BUILD = '20260526-epey-tr-source-fields';
const LOCAL_DEEPSEEK_URL = `${PROXY_URL}/ai/deepseek`;
const LOCAL_TRANSLATE_URL = 'http://127.0.0.1:8797/translate';
const DEEPSEEK_MODEL = 'deepseek-chat'; // Official compatibility alias for DeepSeek's non-thinking chat model.
// EU pivot (2026-05-23): app supports TR/EN/DE/FR/ES/PT/RU only.
const SUPPORTED_LANGS = ['tr','en','de','es','fr','pt','ru'];
// Languages to translate Turkish specs into (skip TR — that's the source).
const TARGET_LANGS = ['en','de','es','fr','pt','ru'];
// Epey product pages usually expose only 2-3 inline images. The full product
// photo set lives on the "-resimleri.html" gallery page, so keep this enabled
// to satisfy the catalog requirement of up to 8 product-owned images.
const EPEY_FETCH_GALLERY_IMAGES = true;
const SCRAPER_LOG_MAX_LINES = 900;
// Epey has no Cloudflare, so detail-page concurrency is bounded only by the
// proxy + epey.com's request budget. 20 workers @ 50ms = ~400 req/s peak.
// In practice epey serves ~100-150 req/s comfortably; the proxy throttles
// the rest, so 20 keeps the pipeline saturated without burning errors.
const EPEY_DETAIL_CONCURRENCY_DEFAULT = 20;
const EPEY_DETAIL_CONCURRENCY_MAX = 32;
const EPEY_PB_WRITE_CONCURRENCY = 4;
const EPEY_PB_SAVE_RETRIES = 4;

let scraperRunning = false;
let scraperAbort = false;
let _scrapeStartTime = null;
let _scrapeProductCount = 0;
let _proxyPollTimer = null;

// Global flag (`window.qoraiScrapeActive`) is checked by Score Engine and the
// products-list event listener to pause expensive work during a scrape.
if (typeof window !== 'undefined') window.qoraiScrapeActive = false;
// Technical scores are run from the dedicated Score Engine tab. Product saves
// from scraper/import flows must not enqueue an automatic score run.
if (typeof window !== 'undefined') window.qoraiAutoScoreSuppressed = true;

function getEpeyDetailConcurrency() {
  const raw = parseInt(document.getElementById('scrapeConcurrency')?.value || '', 10);
  const n = Number.isFinite(raw) && raw > 0 ? raw : EPEY_DETAIL_CONCURRENCY_DEFAULT;
  return Math.max(1, Math.min(EPEY_DETAIL_CONCURRENCY_MAX, n));
}

function createAsyncLimiter(maxActive = 1) {
  const max = Math.max(1, parseInt(maxActive, 10) || 1);
  const queue = [];
  let active = 0;
  const pump = () => {
    if (active >= max || !queue.length) return;
    const job = queue.shift();
    active++;
    Promise.resolve()
      .then(job.fn)
      .then(job.resolve, job.reject)
      .finally(() => {
        active--;
        pump();
      });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    pump();
  });
}

const _epeyPbWriteLimit = createAsyncLimiter(EPEY_PB_WRITE_CONCURRENCY);

// In-flight AbortControllers — flipped by stopScraping() so the Stop button
// drops the current proxy fetches immediately instead of waiting up to 120s
// for the per-request timeout.
const _scrapeAbortControllers = new Set();
function _newScrapeAbortController() {
  const ac = new AbortController();
  _scrapeAbortControllers.add(ac);
  return ac;
}
function _disposeScrapeAbortController(ac) {
  if (ac) _scrapeAbortControllers.delete(ac);
}
function _abortAllScrapeControllers() {
  for (const ac of _scrapeAbortControllers) {
    try { ac.abort(); } catch (_) {}
  }
  _scrapeAbortControllers.clear();
}

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

// Batched log writer — `slog` used to do a synchronous DOM append + forced
// reflow (`scrollTop = scrollHeight`) on every call. Bursts of >1000 calls
// (e.g. the 2134 skipped-product lines) froze the main thread for many
// seconds and made the Stop button unresponsive. We now buffer entries and
// flush them inside a single requestAnimationFrame, building one
// DocumentFragment so the browser does at most ONE layout per frame.
const _SLOG_COLORS = {
  info: 'var(--text2)', success: 'var(--green)',
  error: 'var(--red)', warn: 'var(--amber)',
};
const _SLOG_ICONS = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' };
const _slogBuffer = [];
let _slogFlushScheduled = false;
function _flushSlog() {
  _slogFlushScheduled = false;
  const el = document.getElementById('scraperLog');
  if (!el || !_slogBuffer.length) { _slogBuffer.length = 0; return; }
  const frag = document.createDocumentFragment();
  // Drain the buffer in one shot (the array may have grown while we waited
  // for rAF — drain whatever is there, leave new arrivals for the next tick).
  const drained = _slogBuffer.splice(0, _slogBuffer.length);
  for (const entry of drained) {
    const line = document.createElement('div');
    line.className = 'slog-line';
    line.style.color = _SLOG_COLORS[entry.type] || _SLOG_COLORS.info;
    line.textContent = `[${entry.ts}] ${_SLOG_ICONS[entry.type] || ''} ${entry.msg}`;
    frag.appendChild(line);
  }
  el.appendChild(frag);
  // Trim from the top in a single pass instead of one removeChild per line.
  const over = el.children.length - SCRAPER_LOG_MAX_LINES;
  if (over > 0) {
    for (let i = 0; i < over; i++) {
      const first = el.firstElementChild;
      if (!first) break;
      el.removeChild(first);
    }
  }
  // One reflow per frame is plenty.
  el.scrollTop = el.scrollHeight;
}
function slog(msg, type = 'info') {
  const el = typeof document !== 'undefined' ? document.getElementById('scraperLog') : null;
  if (!el) { console.log(`[scraper:${type}]`, msg); return; }
  _slogBuffer.push({ msg: String(msg), type, ts: new Date().toLocaleTimeString() });
  if (!_slogFlushScheduled) {
    _slogFlushScheduled = true;
    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16))(_flushSlog);
  }
}

function clearScraperLog() {
  _slogBuffer.length = 0;
  const el = document.getElementById('scraperLog');
  if (el) el.innerHTML = '<div class="text-muted" style="padding:12px">Log cleared.</div>';
  const xl = document.getElementById('xlateLog');
  if (xl) xl.innerHTML = '<div class="text-muted" style="padding:12px">Log cleared.</div>';
  const pg = document.getElementById('scraperProgress');
  if (pg) pg.textContent = '';
  if (typeof updateResumeUI === 'function') updateResumeUI();
}

// Translation log — separate panel from scrape log so the user can watch the
// dict-first/DeepSeek pipeline in parallel with the scrape stream.
const _xlogBuffer = [];
let _xlogFlushScheduled = false;
function _flushXlog() {
  _xlogFlushScheduled = false;
  if (!_xlogBuffer.length) return;
  const el = document.getElementById('xlateLog');
  if (!el) { _xlogBuffer.length = 0; return; }
  const placeholder = el.querySelector('.text-muted');
  if (placeholder && el.children.length === 1) placeholder.remove();
  const frag = document.createDocumentFragment();
  for (const { msg, type, ts } of _xlogBuffer) {
    const line = document.createElement('div');
    line.className = `log-line log-${type}`;
    line.innerHTML = `<span class="log-time">${ts}</span> ${msg}`;
    frag.appendChild(line);
  }
  el.appendChild(frag);
  _xlogBuffer.length = 0;
  // Trim — keep last 600 lines.
  while (el.children.length > 600) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}
function xlog(msg, type = 'info') {
  const el = typeof document !== 'undefined' ? document.getElementById('xlateLog') : null;
  if (!el) { console.log(`[xlate:${type}]`, msg); return; }
  _xlogBuffer.push({ msg: String(msg), type, ts: new Date().toLocaleTimeString() });
  if (!_xlogFlushScheduled) {
    _xlogFlushScheduled = true;
    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16))(_flushXlog);
  }
}
if (typeof window !== 'undefined') window.xlog = xlog;

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

// Interruptible sleep — wakes immediately on scraperAbort so the Stop button
// no longer has to wait through a 15s "proactive cooldown" before returning.
// Falls back to plain setTimeout when the scraper is not running.
function sleep(ms) {
  return new Promise(resolve => {
    if (ms <= 0) { resolve(); return; }
    if (!scraperRunning) { setTimeout(resolve, ms); return; }
    let done = false;
    const POLL = 100;
    const deadline = Date.now() + ms;
    const tick = () => {
      if (done) return;
      if (scraperAbort) { done = true; resolve(); return; }
      const remaining = deadline - Date.now();
      if (remaining <= 0) { done = true; resolve(); return; }
      setTimeout(tick, Math.min(POLL, remaining));
    };
    tick();
  });
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

function _proxyHealthLabel(data) {
  if (!data || typeof data !== 'object') return 'Connected';
  const bits = ['Connected'];
  if (data.version) bits.push(`v${data.version}`);
  if (data.pid) bits.push(`PID ${data.pid}`);
  return bits.join(' · ');
}

function _proxyHealthTitle(data) {
  if (!data || typeof data !== 'object') return PROXY_URL;
  return [
    `URL: ${PROXY_URL}`,
    data.pid ? `PID: ${data.pid}` : '',
    data.port ? `Port: ${data.port}` : '',
    data.engine ? `Engine: ${data.engine}` : '',
    Number.isFinite(data.requests) ? `Requests: ${data.requests}` : '',
    Number.isFinite(data.uptimeSec) ? `Uptime: ${Math.round(data.uptimeSec)}s` : '',
  ].filter(Boolean).join('\n');
}

async function checkProxy(manual = false) {
  const el = document.getElementById('proxyStatus');
  const card = document.getElementById('proxyInfoCard');
  if (el) {
    el.innerHTML = '<span style="color:var(--amber,#f59e0b)">● Proxy: Checking...</span>';
    el.title = PROXY_URL;
  }
  try {
    const res = await fetch(`${PROXY_URL}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.status === 'ok' || data.ok === true)) {
      const label = _proxyHealthLabel(data);
      if (el) {
        el.innerHTML = `<span style="color:var(--green)">● Proxy: ${label}</span>`;
        el.title = _proxyHealthTitle(data);
      }
      if (card) card.style.display = 'none';
      if (manual && typeof toast === 'function') toast(`Proxy aktif: ${label}`, 's');
      return true;
    }
    throw new Error(data.error || `HTTP ${res.status}`);
  } catch (e) {
    const msg = e?.name === 'TimeoutError' ? 'timeout' : (e?.message || 'unreachable');
    if (manual && typeof toast === 'function') toast(`Proxy kapalı/ulaşılamıyor: ${msg}`, 'e');
  }
  if (el) el.innerHTML = '<span style="color:var(--red)">● Proxy: Offline</span>';
  if (el) el.title = `Cannot reach ${PROXY_URL}`;
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
      checkProxy(true);
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

async function proxyFetch(url, retries = 3, referer = '') {
  const refQuery = referer ? `&referer=${encodeURIComponent(referer)}` : '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (scraperAbort) throw new Error('aborted');
    // Combine the per-request timeout with the user-controlled abort signal so
    // pressing Stop tears down the in-flight fetch instead of waiting 120s.
    const ac = _newScrapeAbortController();
    const timeoutId = setTimeout(() => { try { ac.abort(); } catch (_) {} }, 120000);
    try {
      const res = await fetch(`${PROXY_URL}/?url=${encodeURIComponent(url)}${refQuery}`, {
        signal: ac.signal,
      });
      if (res.status === 429) {
        const delay = Math.min(15000 * Math.pow(2, attempt), 120000) + Math.random() * 5000;
        slog(`Rate limited, waiting ${(delay / 1000).toFixed(0)}s...`, 'warn');
        await sleep(delay);
        if (scraperAbort) throw new Error('aborted');
        continue;
      }
      if (res.status === 404 || res.status === 410) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      // If the user stopped the scrape, propagate immediately — no retry,
      // no backoff, no further logs that the user has to wait through.
      if (scraperAbort || e.name === 'AbortError') throw new Error('aborted');
      if (attempt === retries) throw e;
      const delay = Math.min(5000 * Math.pow(2, attempt), 60000) + Math.random() * 3000;
      slog(`Retry ${attempt + 1}/${retries}: ${e.message}, waiting ${(delay / 1000).toFixed(0)}s...`, 'warn');
      await sleep(delay);
    } finally {
      clearTimeout(timeoutId);
      _disposeScrapeAbortController(ac);
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
    hint.textContent = 'Kategori seç → o kategorideki TÜM Epey ürünleri çekilir. "Tüm Epey kategorileri" seçilirse ürün limiti kategori başına uygulanır.';
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

const COUNTRY_CODE_TOKENS = [
  'TR','TU','US','UK','EU','DE','FR','IT','ES','PT','NL','PL','NO','DK','FI',
  'JP','CN','KR','IN','AE','SA','AU','NZ','CA','MX','BR'
];

function cleanCountryCodes(value) {
  let s = String(value ?? '');
  if (!s) return '';
  const code = COUNTRY_CODE_TOKENS.join('|');
  const skuTail = new RegExp(`\\b([A-Z0-9][A-Z0-9-]{2,}?-\\d{2,6})(${code})\\b`, 'g');
  s = s
    // MSI Raider B2WI-021TR -> MSI Raider B2WI-021
    .replace(skuTail, '$1')
    // Standalone country/market markers.
    .replace(new RegExp(`(?:^|[\\s_/|,;()\\[\\]{}-])(${code})(?=$|[\\s_/|,;()\\[\\]{}-])`, 'g'), ' ')
    // Common language/market words that leak into product names.
    .replace(/\b(?:turkish|türkçe|turkce|türkiye|turkiye|german|deutsch|english|spanish|french|italian|portuguese|polish|swedish|japanese|chinese)\b/gi, ' ')
    .replace(/\s+([,;:|)])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\[\s*\]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+-\s*$/g, '')
    .trim();
  return s;
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
    /\b(latitude\s+\d+)\b/i,
    /\b((?:inspiron|vostro|precision)\s+\d+[a-z0-9-]*)\b/i,
    /\b(xps\s+\d+[a-z0-9-]*)\b/i,
    /\b(thinkbook\s+[a-z0-9]+(?:\s+gen\s+\d+)?)\b/i,
    /\b(galaxy\s+(?:s|z|a|m|tab|note|xcover)\s*\d+[a-z]*(?:\s+(?:ultra|plus|fe|fold|flip|edge))*)/i,
    /\b(iphone\s+\d+[a-z]*(?:\s+(?:pro\s+max|pro|max|plus|mini|air|e))?)\b/i,
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
  if (b === 'oppo') {
    const m = familyProbe.match(/\b((?:reno\s*)?\d+[a-z]*(?:\s+(?:pro|se|plus|lite|5g))*|a\d+[a-z]*(?:\s+(?:pro|se|plus|lite|5g))*)\b/i);
    if (m && m[1]) {
      const fam = normalizeProductDedupText(`oppo ${m[1]}`);
      if (fam) return fam.slice(0, 180);
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
    .replace(/\b(?:windows|macos|linux|freebsd|home|laptop|notebook|computer|pc|spanish|german|french|italian|english|turkish|ispanyolca|almanca|fransizca|fransızca|italyanca|ingilizce|turkce|türkçe)\b/gi, ' ')
    .replace(/\b(?:black|white|silver|gold|blue|purple|violet|pink|red|green|gray|grey|cream|graphite|lavender|wood|bordeaux|midnight|starlight|titanium|stone\s*colour|dark\s*blue|dark\s*green|orange|sand|camouflage|camo|beige|khaki|mint|aqua|turquoise|teal|coral|brown|natural|ivory|schwarz|weiß|weiss|silber|blau|grün|gruen|creme|siyah|beyaz|yeşil|yesil|gri|mavi|kırmızı|kirmizi|mor|pembe|sarı|sari)\b/gi, ' ')
    .replace(/\b(?:de|uk|us|eu|pl|fr|it|es|gb)\b/gi, ' ')
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

function _cloneSourceSpecObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try { return JSON.parse(JSON.stringify(value)); } catch { return { ...value }; }
}

function _sourceLangForProduct(product) {
  const marker = String(product?.source || product?.sourceUrl || '');
  if (/geizhals/i.test(marker)) return 'de';
  if (/epey/i.test(marker)) return 'tr';
  return '';
}

function _sourceSnapshotForProduct(product) {
  const sourceLang = _sourceLangForProduct(product);
  return {
    sourceLang,
    sourceName: String(product?.name || '').trim(),
    sourceSpecs: _cloneSourceSpecObject(product?.sourceSpecs || product?.specs),
    sourceSpecSections: _cloneSourceSpecObject(product?.sourceSpecSections || product?.specSections),
    sourceKeySpecs: _cloneSourceSpecObject(product?.sourceKeySpecs || product?.keySpecs),
  };
}

function _applySourceSnapshot(payload, snapshot) {
  if (!payload || !snapshot?.sourceLang) return payload;
  payload.sourceLang = snapshot.sourceLang;
  payload.sourceSpecs = snapshot.sourceSpecs || {};
  payload.sourceSpecSections = snapshot.sourceSpecSections || {};
  payload.sourceKeySpecs = snapshot.sourceKeySpecs || {};
  if (snapshot.sourceLang === 'tr') {
    payload.multiLangSpecs = { ...(payload.multiLangSpecs || {}), tr: payload.sourceSpecs };
    payload.multiLangSections = { ...(payload.multiLangSections || {}), tr: payload.sourceSpecSections };
    payload.nameTranslated = { ...(payload.nameTranslated || {}), tr: snapshot.sourceName || payload.name };
  }
  return payload;
}

function prepareProductPayload(product) {
  const sourceSnapshot = _sourceSnapshotForProduct(product);
  const sourceProduct = canonicalizeEpeySpecsToEnglish(product);
  const sanitized = sanitizeProductSpecs(sourceProduct.specs || {}, sourceProduct.specSections || {});
  const canonicalizer = typeof window !== 'undefined' ? window.QorAiSpecCanonical : null;
  const canonical = canonicalizer && typeof canonicalizer.canonicalizeProduct === 'function'
    ? canonicalizer.canonicalizeProduct({
        ...sourceProduct,
        specs: sanitized.specs,
        specSections: sanitized.sections,
        keySpecs: sourceProduct.keySpecs || {},
      })
    : {
        specs: sanitized.specs,
        specSections: sanitized.sections,
        keySpecs: sourceProduct.keySpecs || {},
        specsEn: sanitized.specs,
      };
  const cleanName = cleanCountryCodes(sourceProduct.name || '');
  let category = window.QorAiCategories?.canonicalId
    ? window.QorAiCategories.canonicalId(sourceProduct.category || '')
    : String(sourceProduct.category || '').trim();
  if (/klavye-mouse/i.test(String(sourceProduct.sourceUrl || ''))) {
    const n = String(cleanName || sourceProduct.name || '').toLocaleLowerCase('tr');
    if (/\bklavye\b/.test(n)) category = 'keyboards';
    else if (/\bmouse\b|\bmice\b|\bfare\b/.test(n)) category = 'mice';
  }
  if (/islemci-sogutucu/i.test(String(sourceProduct.sourceUrl || ''))) {
    category = 'cpu_coolers';
  }

  // Enforce image cap, dedup, and keep the native CDN format for Epey.
  const rawImages = Array.isArray(sourceProduct.images) ? sourceProduct.images.filter(Boolean) : [];
  const isEpeySource = /epey/i.test(String(sourceProduct.source || sourceProduct.sourceUrl || ''));
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
  const primary = images[0] || sourceProduct.imageUrl || '';

  const variantGroup = String(
    modelFamilyKey({ name: cleanName, brand: sourceProduct.brand, category }) ||
    sourceProduct.variantGroup ||
    productDedupKey({ ...sourceProduct, name: cleanName }) ||
    ''
  ).trim().slice(0, 200);
  const payload = {
    slug: String(sourceProduct.slug || sourceProduct.id || productDedupKey(sourceProduct) || '').trim().slice(0, 200),
    name: cleanName.slice(0, 500),
    brand: String(sourceProduct.brand || '').trim().slice(0, 200),
    category: String(category || '').trim().slice(0, 100),
    source: String(sourceProduct.source || 'epey.com').trim().slice(0, 100),
    sourceUrl: sourceProduct.sourceUrl || undefined,
    imageUrl: primary || undefined,
    imageUrlThumb: primary && !isEpeySource && typeof imgThumb === 'function' ? imgThumb(primary) : primary || undefined,
    imageUrlHQ: primary && !isEpeySource && typeof imgHQ === 'function' ? imgHQ(primary) : primary || undefined,
    images,
    specs: canonical.specs || sanitized.specs,
    specSections: canonical.specSections || sanitized.sections,
    specsEn: canonical.specsEn || canonical.specs || sanitized.specs,
    keySpecs: canonical.keySpecs && typeof canonical.keySpecs === 'object'
      ? Object.fromEntries(Object.entries(canonical.keySpecs)
          .map(([k, v]) => [cleanCountryCodes(k), cleanCountryCodes(v)])
          .filter(([k, v]) => k && v && !isBlockedSpec(k, v)))
      : {},
    techScore: Number.isFinite(Number(sourceProduct.techScore)) ? Number(sourceProduct.techScore) : undefined,
    specsCount: Object.keys(canonical.specs || sanitized.specs).length,
    variantGroup,
    configKey: String(sourceProduct.configKey || configKeyFromProduct(sourceProduct, variantGroup) || '').trim().slice(0, 255),
    scrapedAt: sourceProduct.scrapedAt || new Date().toISOString(),
  };

  if (sourceProduct.gtin) payload.gtin = String(sourceProduct.gtin).trim().slice(0, 200);
  if (sourceProduct.mpn) payload.mpn = String(sourceProduct.mpn).trim().slice(0, 200);
  if (sourceProduct.price_raw) payload.price_raw = String(sourceProduct.price_raw).trim().slice(0, 200);

  // Canonical English payload. Other languages are resolved at render time.
  if (sourceProduct.multiLangSpecs && typeof sourceProduct.multiLangSpecs === 'object') {
    payload.multiLangSpecs = sourceProduct.multiLangSpecs;
  }
  if (sourceProduct.multiLangSections && typeof sourceProduct.multiLangSections === 'object') {
    payload.multiLangSections = sourceProduct.multiLangSections;
  }
  if (sourceProduct.nameTranslated && typeof sourceProduct.nameTranslated === 'object') {
    payload.nameTranslated = sourceProduct.nameTranslated;
  }
  payload.multiLangSpecs = { ...(payload.multiLangSpecs || {}), en: payload.specs };
  payload.multiLangSections = { ...(payload.multiLangSections || {}), en: payload.specSections };
  _applySourceSnapshot(payload, sourceSnapshot);
  _sanitizeEnglishPayload(payload);

  if (!payload.slug) payload.slug = generateProductId(slugFromUrl(payload.sourceUrl || ''));
  if (!payload.name) throw new Error('Product name is empty');

  return typeof _clean === 'function' ? _clean(payload) : payload;
}

function isBlockedSpec(key, value) {
  const text = `${key || ''} ${value || ''}`.toLowerCase();
  if (/\b(?:antutu|an\s*tu\s*tu|dxomark|dxo\s*mark|geekbench|benchmark|passmark|pcmark|3dmark|cinebench|basemark|gfxbench|ai\s*benchmark)\b/i.test(text)) {
    return true;
  }
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
    const cleanKey = cleanCountryCodes(key || '');
    if (!cleanKey || cleanKey.length > 120 || isBlockedSpec(cleanKey, value)) return;
    const cleanValue = cleanCountryCodes(normalizeSpecValue(value));
    if (!cleanValue || cleanValue.length > 1200) return;
    specs[cleanKey] = cleanValue;
    const sec = cleanCountryCodes(section || 'General') || 'General';
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
  const dict = (typeof window !== 'undefined')
    ? (window.QorAiStaticDict || window.QorAiDict) : null;
  if (!dict) return null;
  // EU pivot (2026-05-23): the static dictionary.js module that used to
  // expose translateKey/translateValue was removed. Several legacy spec
  // pre-cleaners (translateSpecsObject/translateSections/translateKeySpecs)
  // still rely on those methods. Wrap with identity stubs so they no-op
  // safely — actual TR→EN canonicalization now happens later, via
  // QorAiSpecCanonical.canonicalizeProduct() inside prepareProductPayload().
  if (typeof dict.translateKey !== 'function' || typeof dict.translateValue !== 'function') {
    const wrap = {};
    for (const k of Object.keys(dict)) wrap[k] = dict[k];
    wrap.translateKey   = (k) => String(k || '').trim() || 'Specification';
    wrap.translateValue = (v) => String(v == null ? '' : v).trim();
    return wrap;
  }
  return dict;
}

const TR_LEFTOVER_FIXES = [
  [/Öne Çıkanlar/gi, 'Highlights'],
  [/Genel/gi, 'General'],
  [/Özellikler/gi, 'Specifications'],
  [/Çözünürlüğü|Çözünürlük/gi, 'Resolution'],
  [/Frekansı|Frekans/gi, 'Frequency'],
  [/Çekirdeği|Çekirdek/gi, 'Core'],
  [/Desteği|Destek/gi, 'Support'],
  [/Sayısı|Sayı/gi, 'Count'],
  [/Hızlı/gi, 'Fast'],
  [/Şarj/gi, 'Charging'],
  [/Kablosuz/gi, 'Wireless'],
  [/Kamera/gi, 'Camera'],
  [/Ses/gi, 'Audio'],
  [/Çıkışı|Çıkış/gi, 'Output'],
  [/Suya Dayanıklılık|Suya Dayanıklı/gi, 'Water Resistance'],
  [/Gövde/gi, 'Body'],
  [/Oranı|Oran/gi, 'Ratio'],
  [/Hat/gi, 'SIM'],
  [/Ekran/gi, 'Display'],
  [/Var/gi, 'Yes'],
  [/Yok/gi, 'No'],
  [/Siyah/gi, 'Black'],
  [/Beyaz/gi, 'White'],
  [/Kırmızı/gi, 'Red'],
  [/Mavi/gi, 'Blue'],
  [/Yeşil/gi, 'Green'],
  [/Gri/gi, 'Gray'],
  [/Altın/gi, 'Gold'],
  [/Gümüş/gi, 'Silver'],
];

function _hasTurkishChars(text) {
  const dict = getDict();
  if (dict?.hasTurkishChars) return dict.hasTurkishChars(String(text || ''));
  return /[ığşçöüİĞŞÇÖÜ]/.test(String(text || ''));
}

function _fixTurkishLeftovers(text) {
  let out = String(text || '').replace(/:$/, '').trim();
  for (const [re, replacement] of TR_LEFTOVER_FIXES) {
    out = out.replace(re, replacement);
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

function _safeCanonicalSpecText(text, fallback = '') {
  // EU pivot fix (2026-05-23): dictionary.js used to translate TR→EN here,
  // so any leftover Turkish characters meant "no translation available" →
  // fall through to the generic "Specification" label. That label is now
  // catastrophic — every Turkish-keyed spec collapsed to
  // "Specification, Specification 2, Specification 3, …" (user saw 42/125
  // specs with mangled names).
  //
  // Now: dictionary.js is gone, QorAiSpecCanonical.canonicalizeProduct()
  // runs LATER in prepareProductPayload and handles TR→EN canonicalisation
  // via its KEY_RULES table. This helper just trims and passes through;
  // empty inputs use the supplied fallback. Turkish characters survive
  // and reach the canonicaliser intact.
  const fixed = _fixTurkishLeftovers(text);
  return fixed && fixed.trim() ? fixed : fallback;
}

function _uniqueSpecKey(target, key) {
  let out = key || 'Specification';
  if (!Object.prototype.hasOwnProperty.call(target, out)) return out;
  let n = 2;
  while (Object.prototype.hasOwnProperty.call(target, `${out} ${n}`)) n++;
  return `${out} ${n}`;
}

function translateSpecsObject(rawSpecs) {
  const dict = getDict();
  if (!dict) return rawSpecs;
  const translated = {};
  for (const [k, v] of Object.entries(rawSpecs)) {
    const tk = _safeCanonicalSpecText(dict.translateKey(String(k || '').replace(/:$/, '')), 'Specification');
    const tv = _safeCanonicalSpecText(dict.translateValue(String(v || '')), '');
    if (!tk || !tv) continue;
    translated[_uniqueSpecKey(translated, tk)] = tv;
  }
  return translated;
}

function translateSections(rawSections) {
  const dict = getDict();
  if (!dict) return rawSections;
  const translated = {};
  for (const [section, specObj] of Object.entries(rawSections)) {
    const ts = _safeCanonicalSpecText(dict.translateKey(String(section || '').replace(/:$/, '')), 'General') || 'General';
    translated[ts] = {};
    for (const [k, v] of Object.entries(specObj)) {
      const tk = _safeCanonicalSpecText(dict.translateKey(String(k || '').replace(/:$/, '')), 'Specification');
      const tv = _safeCanonicalSpecText(dict.translateValue(String(v || '')), '');
      if (!tk || !tv) continue;
      translated[ts][_uniqueSpecKey(translated[ts], tk)] = tv;
    }
  }
  return translated;
}

function translateKeySpecs(rawKeySpecs) {
  const dict = getDict();
  if (!dict) return rawKeySpecs;
  const translated = {};
  for (const [k, v] of Object.entries(rawKeySpecs)) {
    const tk = _safeCanonicalSpecText(dict.translateKey(String(k || '').replace(/:$/, '')), 'Specification');
    const tv = _safeCanonicalSpecText(dict.translateValue(String(v || '')), '');
    if (!tk || !tv) continue;
    translated[_uniqueSpecKey(translated, tk)] = tv;
  }
  return translated;
}

function filterSpecs(specs, sections) {
  const dict = getDict();
  if (!dict || !dict.filterTurkishLanguageSpecs) return { specs, sections };
  return dict.filterTurkishLanguageSpecs(specs, sections);
}

function canonicalizeEpeySpecsToEnglish(product) {
  const isEpeySource = /epey/i.test(String(product?.source || product?.sourceUrl || ''));
  const dict = getDict();
  if (!isEpeySource || !dict) return product;

  const translatedSpecs = translateSpecsObject(product.specs || {});
  const translatedSections = translateSections(product.specSections || {});
  const translatedKeySpecs = translateKeySpecs(product.keySpecs || {});
  const translatedName = dict.translateProductName
    ? dict.translateProductName(product.name || '')
    : product.name;

  return {
    ...product,
    name: translatedName || product.name,
    specs: translatedSpecs,
    specSections: translatedSections,
    keySpecs: translatedKeySpecs,
    // Keep a tiny English payload for readers that prefer localized fields,
    // but do not generate/store slow per-language translations at scrape time.
    multiLangSpecs: { en: translatedSpecs },
    multiLangSections: { en: translatedSections },
    nameTranslated: translatedName ? { en: translatedName } : {},
  };
}

// ═══════════════════════════════════════
//  12b. TURKISH → MULTI-LANG TRANSLATION (DeepSeek v3 + Dictionary Cache)
// ═══════════════════════════════════════

// Keep the large static TR→EN dictionary from dictionary.js. The async
// PocketBase cache below adds admin-editable translations, but should not
// hide the old translateKey / translateValue helpers from scraper code.
const _staticQorAiDict = (typeof window !== 'undefined' && window.QorAiDict) ? window.QorAiDict : null;
if (typeof window !== 'undefined' && _staticQorAiDict && !window.QorAiStaticDict) {
  window.QorAiStaticDict = _staticQorAiDict;
}

// In-memory TR→target dictionary cache (lazy-loaded from PB)
const _deDictCache = {}; // { 'some turkish text': { en: '...', de: '...', ... } }
const _deDictFailedThisRun = new Set();
const _deDictInflight = new Map(); // normalized source atom -> shared DeepSeek promise
let _deDictLoaded = false;
let _deDictLoadPromise = null;
let _deDictDirty = false;
let _deDictSavePromise = null;
const DE_DICT_PB_KEY = 'tr_translation_dict';
const DE_DICT_MANIFEST_KEY = `${DE_DICT_PB_KEY}_manifest`;
const DE_DICT_SHARD_PREFIX = `${DE_DICT_PB_KEY}__part_`;
const DE_DICT_SHARD_MAX_BYTES = 180000;

function _dictDocValue(doc) {
  const data = typeof doc?.data === 'function' ? doc.data() : doc;
  return data?.value || {};
}

function _isDictEntry(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.values(value).some(v => typeof v === 'string' && v.trim());
}

function _mergeDictObject(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return 0;
  const terms = source.terms && typeof source.terms === 'object' ? source.terms : source;
  let merged = 0;
  for (const [rawKey, rawEntry] of Object.entries(terms)) {
    const key = _normalizeDictSourceKey(rawKey);
    if (!key || !_isDictEntry(rawEntry)) continue;
    if (!_isWordOnlyDictSource(key)) continue;
    if (!_deDictCache[key]) _deDictCache[key] = {};
    for (const [lang, value] of Object.entries(rawEntry)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const trimmed = value.trim();
      // Skip stale pass-through entries written by the old narrow filter.
      // They make _deDictLookup return Turkish text for English/German/etc.
      // We accept genuine language-neutral pass-throughs (model codes,
      // brand names) detected via _shouldPreserve.
      if (lang !== 'tr' && _looksLikePassThroughDuringLoad(key, trimmed)) continue;
      _deDictCache[key][lang] = trimmed;
    }
    if (Object.keys(_deDictCache[key]).length === 0) delete _deDictCache[key];
    else merged++;
  }
  return merged;
}

function _looksLikePassThroughDuringLoad(srcKey, storedValue) {
  if (String(srcKey).toLowerCase() !== String(storedValue).toLowerCase()) return false;
  // Pass-through is OK when the source is genuinely language-neutral: every
  // alphabetic word is a preserve token (acronym, unit, brand, model code).
  const wordTokens = (srcKey.match(/[a-zA-ZÀ-ÿığşçöüİĞŞÇÖÜ]{2,}/g) || []);
  if (!wordTokens.length) return false;
  for (const w of wordTokens) {
    if (!_shouldPreserve(w)) return true; // real word that wasn't translated → stale
  }
  return false;
}

function _normalizeDictSourceKey(text) {
  return String(text || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

const _TR_TRANSLATABLE_WORD_RE = /\b(yıl|yil|güncelleme|guncelleme|güvenlik|guvenlik|güvenliği|guvenligi|garanti|garantisi|artırma|artirma|sanal|ters|şarj|sarj|soğutma|sogutma|odaklama|kayıt|kayit|açı|aci|geniş|genis|yardımcı|yardimci|işlemci|islemci|parlaklık|parlaklik|çözünürlük|cozunurluk|ekstra|makro|portre)\b/i;
const _TECH_VALUE_WORDS = new Set([
  'inch','inç','inc','piksel','pixel','pixels','fps','hz','khz','mhz','ghz',
  'mah','wh','w','v','a','gb','mb','kb','tb','nm','nit','nits','cd','mm','cm',
  'mp','mpx','lte','gps','a-gps','bds','glonass','galileo','qzss','usb',
]);

function _wordTokens(text) {
  return String(text || '').match(/[a-zA-ZÀ-ÿığşçöüİĞŞÇÖÜ-]+/g) || [];
}

function _meaningfulWordTokens(text) {
  return _wordTokens(text)
    .map(w => w.toLowerCase().replace(/^-+|-+$/g, ''))
    .filter(w => w.length >= 2 && !_TECH_VALUE_WORDS.has(w));
}

function _isWordOnlyDictSource(text) {
  const s = _normalizeDictSourceKey(text);
  if (!s || s.length < 2) return false;
  // Need at least one 2+ char alphabetic word — rejects pure technical
  // measurements like "1200x2608" or "F1.67" while accepting numeric+word
  // atoms like "1000 Döngü", "53 saat", "41 Dakika".
  if (!/[a-zA-ZÀ-ÿığşçöüİĞŞÇÖÜ]{2,}/.test(s)) return false;
  return true;
}

function _buildDictShards(snapshot) {
  const entries = Object.entries(snapshot)
    .filter(([key]) => _isWordOnlyDictSource(key))
    .sort(([a], [b]) => a.localeCompare(b));
  const shards = [];
  let shard = {};
  let shardBytes = 2;

  for (const [key, value] of entries) {
    const nextBytes = BufferLikeJsonSize({ [key]: value }) + 1;
    if (Object.keys(shard).length && shardBytes + nextBytes > DE_DICT_SHARD_MAX_BYTES) {
      shards.push(shard);
      shard = {};
      shardBytes = 2;
    }
    shard[key] = value;
    shardBytes += nextBytes;
  }
  if (Object.keys(shard).length || !shards.length) shards.push(shard);
  return shards;
}

function BufferLikeJsonSize(value) {
  return new Blob([JSON.stringify(value)]).size;
}

async function _mergeActiveDeDictFromPocketBase() {
  const doc = await pbGetDoc('public_config', DE_DICT_PB_KEY);
  let merged = 0;
  if (doc.exists) {
    const stored = _dictDocValue(doc);
    if (!stored?.sharded) merged += _mergeDictObject(stored);
  }

  const manifestDoc = await pbGetDoc('public_config', DE_DICT_MANIFEST_KEY).catch(() => ({ exists: false }));
  if (!manifestDoc.exists) return merged;
  const manifest = _dictDocValue(manifestDoc);
  const batchId = manifest?.batchId || '';
  if (!manifest?.sharded || !batchId) return merged;

  const docs = await pbGetAll('public_config', {
    filter: `key~"${DE_DICT_SHARD_PREFIX}"`,
    fields: 'key,value',
    batch: 200,
  }).catch(() => []);

  for (const doc of docs.sort((a, b) => String(a.data().key || '').localeCompare(String(b.data().key || '')))) {
    const value = _dictDocValue(doc);
    if (value?.batchId !== batchId) continue;
    merged += _mergeDictObject(value.terms || {});
  }
  return merged;
}

function _seedStaticEnglishDict() {
  const staticDict = (typeof window !== 'undefined' && (window.QorAiStaticDict || _staticQorAiDict)) || null;
  const trEn = staticDict?.TR_EN;
  if (!trEn || typeof trEn !== 'object') return;
  for (const [rawKey, rawValue] of Object.entries(trEn)) {
    const key = _normalizeDictSourceKey(rawKey);
    const value = String(rawValue || '').trim();
    if (!key || !value) continue;
    if (!_isWordOnlyDictSource(key)) continue;
    if (!_deDictCache[key]) _deDictCache[key] = {};
    if (!_deDictCache[key].en) _deDictCache[key].en = _applyTitleCase(value);
  }
}

async function _loadDeDict() {
  if (_deDictLoaded) return;
  if (_deDictLoadPromise) return _deDictLoadPromise;
  _deDictLoadPromise = (async () => {
    try {
      await _mergeActiveDeDictFromPocketBase();
    } catch (e) {
      console.warn('[de-dict] load failed:', e.message);
      throw e;
    } finally {
      _seedStaticEnglishDict();
    }
    _deDictLoaded = true;
  })();
  try {
    await _deDictLoadPromise;
  } finally {
    _deDictLoadPromise = null;
  }
}

// Throttle dict saves: each save uploads the entire sharded dict to
// PocketBase (~9k entries, multi-MB). Previously we did this on every
// product scrape => 5-15s per product. Now we coalesce dirty saves and
// only actually upload if the last upload was >30s ago. The bulk-scrape
// path calls _flushDeDictBeforeExit() at the end to guarantee final save.
let _deDictLastSavedAt = 0;
const _DE_DICT_SAVE_MIN_INTERVAL_MS = 30000;
let _deDictPendingSave = null;
async function _flushDeDictBeforeExit() {
  if (_deDictPendingSave) clearTimeout(_deDictPendingSave);
  _deDictPendingSave = null;
  _deDictLastSavedAt = 0; // force
  return _saveDeDictNow();
}
async function _saveDeDict() {
  if (!_deDictDirty) return;
  const elapsed = Date.now() - _deDictLastSavedAt;
  if (elapsed < _DE_DICT_SAVE_MIN_INTERVAL_MS && _deDictLastSavedAt) {
    // Schedule a debounced flush
    if (_deDictPendingSave) clearTimeout(_deDictPendingSave);
    _deDictPendingSave = setTimeout(() => {
      _deDictPendingSave = null;
      _saveDeDictNow().catch(() => {});
    }, _DE_DICT_SAVE_MIN_INTERVAL_MS - elapsed);
    return;
  }
  return _saveDeDictNow();
}
async function _saveDeDictNow() {
  if (!_deDictDirty) return;
  if (_deDictSavePromise) {
    await _deDictSavePromise;
    if (!_deDictDirty) return;
  }
  _deDictLastSavedAt = Date.now();
  _deDictSavePromise = (async () => {
    let failure = null;
    while (_deDictDirty) {
      _deDictDirty = false;
      // Snapshot the cache so overlapping chunk completions cannot mutate the
      // payload while PocketBase is serializing it. If new terms arrive during
      // the request, _deDictDirty flips back to true and the loop writes again.
      try {
        // Never save a half-loaded browser cache over the canonical PB shards.
        // The Dictionary tab may render a static fallback while PB is slow; a
        // Stop/Save from that state used to overwrite the full remote dict.
        await _loadDeDict();
        await _mergeActiveDeDictFromPocketBase();
        const snapshot = JSON.parse(JSON.stringify(_deDictCache));
        const shards = _buildDictShards(snapshot);
        const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const updatedAt = new Date().toISOString();
        for (let i = 0; i < shards.length; i++) {
          const key = `${DE_DICT_SHARD_PREFIX}${String(i).padStart(4, '0')}`;
          await pbSetDoc('public_config', key, {
            key,
            value: {
              sharded: true,
              batchId,
              index: i,
              total: shards.length,
              terms: shards[i],
            },
            updatedAt,
          });
        }
        await pbSetDoc('public_config', DE_DICT_MANIFEST_KEY, {
          key: DE_DICT_MANIFEST_KEY,
          value: {
            sharded: true,
            batchId,
            totalShards: shards.length,
            totalTerms: Object.keys(snapshot).length,
            updatedAt,
          },
          updatedAt,
        });
        await pbSetDoc('public_config', DE_DICT_PB_KEY, {
          key: DE_DICT_PB_KEY,
          value: {
            sharded: true,
            manifestKey: DE_DICT_MANIFEST_KEY,
            totalShards: shards.length,
            totalTerms: Object.keys(snapshot).length,
            updatedAt,
          },
          updatedAt,
        });
      } catch (e) {
        console.warn('[de-dict] save failed:', e.message);
        _deDictDirty = true; // retry next time
        failure = e;
        break;
      }
    }
    if (failure) throw failure;
  })();
  try {
    await _deDictSavePromise;
  } finally {
    _deDictSavePromise = null;
  }
}

function _knownTurkishRuleTranslation(sourceText, targetLang) {
  const raw = String(sourceText || '').trim();
  const lang = targetLang || 'en';
  if (_isProtectedTechnicalAtom(raw)) return raw;
  const s = _normalizeDictSourceKey(raw)
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
  const n = (s.match(/\d+(?:[.,]\d+)?/) || [''])[0].replace(',', '.');
  const suffix = raw.match(/\([^)]*\)\s*$/)?.[0] || '';
  const phrase = {
    minute: { en: 'minutes', de: 'Minuten', es: 'minutos', fr: 'minutes', pt: 'minutos', ru: 'минут' },
    hour: { en: 'hours', de: 'Stunden', es: 'horas', fr: 'heures', pt: 'horas', ru: 'часов' },
    cycle: { en: 'cycles', de: 'Zyklen', es: 'ciclos', fr: 'cycles', pt: 'ciclos', ru: 'циклов' },
    billion: { en: 'billion', de: 'Milliarden', es: 'mil millones', fr: 'milliards', pt: 'bilhoes', ru: 'млрд' },
    gram: { en: 'grams', de: 'Gramm', es: 'gramos', fr: 'grammes', pt: 'gramas', ru: 'грамм' },
    onlyEsim: { en: 'eSIM only', de: 'nur eSIM', es: 'solo eSIM', fr: 'eSIM uniquement', pt: 'somente eSIM', ru: 'только eSIM' },
    digitalZoom: { en: 'digital zoom', de: 'Digitalzoom', es: 'zoom digital', fr: 'zoom numerique', pt: 'zoom digital', ru: 'цифровой зум' },
    elementLens: { en: 'element lens', de: 'Element-Objektiv', es: 'lente de elementos', fr: 'lentille a elements', pt: 'lente de elementos', ru: 'элементный объектив' },
    technology: { en: 'Technology', de: 'Technologie', es: 'Tecnologia', fr: 'Technologie', pt: 'Tecnologia', ru: 'Технология' },
    specifications: { en: 'Specifications', de: 'Spezifikationen', es: 'Especificaciones', fr: 'Specifications', pt: 'Especificacoes', ru: 'Характеристики' },
  };
  const p = (key) => phrase[key]?.[lang] || phrase[key]?.en;
  if (/^usb\s*3\.x\s*adedi$/.test(s)) {
    return ({
      en: 'USB 3.x count', de: 'USB 3.x Anzahl', es: 'Cantidad USB 3.x',
      fr: 'Nombre USB 3.x', pt: 'Quantidade USB 3.x', ru: 'Количество USB 3.x',
    })[lang] || 'USB 3.x count';
  }
  if (/^pil\s+(ozellikleri|specifications)$/.test(s)) {
    return ({
      en: 'Battery specifications', de: 'Akku-Spezifikationen',
      es: 'Especificaciones de la batería', fr: 'Spécifications de la batterie',
      pt: 'Especificações da bateria', ru: 'Характеристики батареи',
    })[lang] || 'Battery specifications';
  }
  if (/^li-?po\s*\(\s*lityum-polymer\s*\)$/.test(s)) {
    return ({
      en: 'Li-Po (lithium polymer)', de: 'Li-Po (Lithium-Polymer)',
      es: 'Li-Po (polímero de litio)', fr: 'Li-Po (lithium-polymère)',
      pt: 'Li-Po (polímero de lítio)', ru: 'Li-Po (литий-полимер)',
    })[lang] || 'Li-Po (lithium polymer)';
  }
  const q = s.match(/^(\d{4})\s+([1-4])\.?\s*ceyrek$/);
  if (q) {
    return ({
      en: `${q[1]} Q${q[2]}`, de: `${q[1]} Q${q[2]}`,
      es: `${q[1]} T${q[2]}`, fr: `${q[1]} T${q[2]}`,
      pt: `${q[1]} T${q[2]}`, ru: `${q[1]} ${q[2]} кв.`,
    })[lang] || `${q[1]} Q${q[2]}`;
  }
  if (/\bgoz\b/.test(s) && /(health|saglik|certification|sertifika)/.test(s)) {
    return ({
      en: raw.replace(/g[öo]z/ig, 'eye').replace(/sağlığı|sagligi/ig, 'health').replace(/sertifikası|sertifikasi/ig, 'certification'),
      de: raw.replace(/Eyesafe\s*/i, 'Eyesafe ').replace(/g[öo]z\s*(health|sağlığı|sagligi)?\s*(certification|sertifikası|sertifikasi)?/ig, 'Augengesundheitszertifizierung'),
      es: raw.replace(/g[öo]z\s*(health|sağlığı|sagligi)?\s*(certification|sertifikası|sertifikasi)?/ig, 'certificación de salud ocular'),
      fr: raw.replace(/g[öo]z\s*(health|sağlığı|sagligi)?\s*(certification|sertifikası|sertifikasi)?/ig, 'certification de santé oculaire'),
      pt: raw.replace(/g[öo]z\s*(health|sağlığı|sagligi)?\s*(certification|sertifikası|sertifikasi)?/ig, 'certificação de saúde ocular'),
      ru: raw.replace(/g[öo]z\s*(health|sağlığı|sagligi)?\s*(certification|sertifikası|sertifikasi)?/ig, 'сертификация защиты зрения'),
    })[lang] || raw.replace(/g[öo]z/ig, 'eye');
  }
  if (/^hizli$/.test(s)) {
    return ({
      en: 'Fast charging', de: 'Schnellladen', es: 'Carga rápida',
      fr: 'Charge rapide', pt: 'Carregamento rápido', ru: 'Быстрая зарядка',
    })[lang] || 'Fast charging';
  }
  if (/^(parlamayan\s+)?mat\s+(ekran|display)$/.test(s) || /^non-flammable\s+mat\s+display$/i.test(raw)) {
    return ({
      en: 'Anti-glare matte display', de: 'Entspiegeltes mattes Display',
      es: 'Pantalla mate antirreflejo', fr: 'Écran mat antireflet',
      pt: 'Tela fosca antirreflexo', ru: 'Матовый антибликовый дисплей',
    })[lang] || 'Anti-glare matte display';
  }
  if (/^\d+(?:[.,]\d+)?\s*adet$/.test(s)) return n;
  if (/^\d+\s*x\s*\d+\s*piksel$/.test(s)) {
    return ({
      en: raw.replace(/piksel/ig, 'pixels'),
      de: raw.replace(/piksel/ig, 'Pixel'),
      es: raw.replace(/piksel/ig, 'píxeles'),
      fr: raw.replace(/piksel/ig, 'pixels'),
      pt: raw.replace(/piksel/ig, 'pixels'),
      ru: raw.replace(/piksel/ig, 'пикселей'),
    })[lang] || raw.replace(/piksel/ig, 'pixels');
  }
  if (/^kart\s+okuyucu\s+specifications$/.test(s)) {
    return ({
      en: 'Card reader specifications', de: 'Kartenleser-Spezifikationen',
      es: 'Especificaciones del lector de tarjetas',
      fr: 'Spécifications du lecteur de carte',
      pt: 'Especificações do leitor de cartão',
      ru: 'Характеристики кардридера',
    })[lang] || 'Card reader specifications';
  }
  if (/^klavye\s+specifications$/.test(s)) {
    return ({
      en: 'Keyboard specifications', de: 'Tastatur-Spezifikationen',
      es: 'Especificaciones del teclado', fr: 'Spécifications du clavier',
      pt: 'Especificações do teclado', ru: 'Характеристики клавиатуры',
    })[lang] || 'Keyboard specifications';
  }
  if (/^minirsel\s+processing\s*\(npu\)$/.test(s)) {
    return ({
      en: 'Neural processing (NPU)', de: 'Neuronale Verarbeitung (NPU)',
      es: 'Procesamiento neuronal (NPU)', fr: 'Traitement neuronal (NPU)',
      pt: 'Processamento neural (NPU)', ru: 'Нейронная обработка (NPU)',
    })[lang] || 'Neural processing (NPU)';
  }
  if (/^npu\s*\(sinirsel\s+trading\s+unit\)\s+name$/.test(s)) {
    return ({
      en: 'NPU (neural processing unit) name',
      de: 'NPU-Name (neuronale Verarbeitungseinheit)',
      es: 'Nombre de NPU (unidad de procesamiento neuronal)',
      fr: 'Nom du NPU (unité de traitement neuronal)',
      pt: 'Nome da NPU (unidade de processamento neural)',
      ru: 'Название NPU (нейронного процессорного блока)',
    })[lang] || 'NPU (neural processing unit) name';
  }
  if (/^\d+(?:[.,]\d+)?\s*dakika$/.test(s)) return `${n} ${p('minute')}`;
  if (/^\d+(?:[.,]\d+)?\s*saat$/.test(s)) return `${n} ${p('hour')}`;
  if (/^\d+(?:[.,]\d+)?\s*dongu$/.test(s)) return `${n} ${p('cycle')}`;
  if (/^\d+(?:[.,]\d+)?\s*milyar$/.test(s)) return `${n} ${p('billion')}`;
  if (/^\d+(?:[.,]\d+)?\s*gram$/.test(s)) return `${n} ${p('gram')}`;
  if (/^\d+(?:[.,]\d+)?x\s*dijital\s+zoom$/.test(s)) return `${n}x ${p('digitalZoom')}`;
  if (/^\d+\s*elementli\s+lens$/.test(s)) return `${n}-${p('elementLens')}`;
  if (/^yalnizca\s+esim$/.test(s)) return p('onlyEsim');
  if (/\byalnizca\s+esim\b/.test(s)) return raw.replace(/yaln[ıi]zca\s+esim/ig, p('onlyEsim'));
  if (/\bspecificationsi\b/i.test(raw)) return raw.replace(/\bspecificationsi\b/ig, p('specifications'));
  if (/\bteknolojisi\b/i.test(raw)) return raw.replace(/\bteknolojisi\b/ig, p('technology'));
  if (!n) return null;
  const maps = {
    updateWarranty: {
      en: `${n}-Year Update Guarantee`,
      de: `${n} Jahre Update-Garantie`,
      es: `Garantia De Actualizaciones De ${n} Anos`,
      fr: `Garantie De Mises A Jour De ${n} Ans`,
      pt: `Garantia De Atualizacoes De ${n} Anos`,
      ru: `${n}-Летняя Гарантия Обновлений`,
    },
    securityWarranty: {
      en: `${n}-Year Security Update Guarantee`,
      de: `${n} Jahre Sicherheitsupdate-Garantie`,
      es: `Garantia De Actualizaciones De Seguridad De ${n} Anos`,
      fr: `Garantie De Mises A Jour De Securite De ${n} Ans`,
      pt: `Garantia De Atualizacoes De Seguranca De ${n} Anos`,
      ru: `${n}-Летняя Гарантия Обновлений Безопасности`,
    },
    virtualRam: {
      en: `Virtual RAM Expansion${suffix ? ` ${suffix}` : ''}`,
      de: `Virtuelle RAM-Erweiterung${suffix ? ` ${suffix}` : ''}`,
      es: `Expansion De RAM Virtual${suffix ? ` ${suffix}` : ''}`,
      fr: `Extension De RAM Virtuelle${suffix ? ` ${suffix}` : ''}`,
      pt: `Expansao De RAM Virtual${suffix ? ` ${suffix}` : ''}`,
      ru: `Расширение Виртуальной RAM${suffix ? ` ${suffix}` : ''}`,
    },
    cooling: {
      en: raw.replace(/soğutma|sogutma/i, 'Cooling'),
      de: raw.replace(/soğutma|sogutma/i, 'Kühlung'),
      es: raw.replace(/soğutma|sogutma/i, 'Refrigeracion'),
      fr: raw.replace(/soğutma|sogutma/i, 'Refroidissement'),
      pt: raw.replace(/soğutma|sogutma/i, 'Resfriamento'),
      ru: raw.replace(/soğutma|sogutma/i, 'Охлаждение'),
    },
    reverseCharging: {
      en: `Reverse Charging${suffix ? ` ${suffix}` : ''}`,
      de: `Reverse Charging${suffix ? ` ${suffix}` : ''}`,
      es: `Carga Inversa${suffix ? ` ${suffix}` : ''}`,
      fr: `Charge Inverse${suffix ? ` ${suffix}` : ''}`,
      pt: `Carregamento Reverso${suffix ? ` ${suffix}` : ''}`,
      ru: `Обратная Зарядка${suffix ? ` ${suffix}` : ''}`,
    },
  };
  if (/^\d+\s*yil\s+guvenlik\s+guncellemesi\s+garantisi$/.test(s)) return maps.securityWarranty[targetLang] || null;
  if (/^\d+\s*yil\s+guncelleme\s+garantisi$/.test(s)) return maps.updateWarranty[targetLang] || null;
  if (/sanal\s+ram\s+artirma/.test(s)) return maps.virtualRam[targetLang] || null;
  if (/ters\s+(charging|sarj)/.test(s)) return maps.reverseCharging[targetLang] || null;
  if (/sogutma/.test(s) && /\d|iceloop|vapor|buhar/i.test(s)) return maps.cooling[targetLang] || null;
  return null;
}

function _isProtectedTechnicalAtom(text) {
  const raw = String(text || '').trim();
  if (!raw || /[çğıİöşüÇĞŞÜ]/.test(raw)) return false;
  const exact = raw.toLowerCase();
  const protectedExact = new Set([
    'nvidia', 'amd', 'intel', 'apple', 'samsung', 'qualcomm', 'mediatek',
    'microsoft', 'windows', 'android', 'ios', 'wear os', 'directx', 'opengl',
    'opencl', 'vulkan', 'dlss', 'nvidia reflex', 'nvidia gpu boost',
    'pci express', 'resizable bar', 'gddr7', 'gddr6', 'ddr5', 'ddr4',
    'wi-fi', 'wifi', 'bluetooth', 'hdmi', 'displayport', 'usb', 'usb-c',
    'thunderbolt', 'nfc', 'gps', 'glonass', 'galileo', 'beidou', 'bds',
    'oled', 'ips', 'wva', 'qhd', 'qhd+', 'uhd', 'uhd+', 'fhd', 'fhd+',
    'rtx', 'gtx', 'geforce', 'geforce rtx', 'radeon', 'ryzen', 'core ultra',
  ]);
  if (protectedExact.has(exact)) return true;
  if (/^(?:NVIDIA\s+)?GeForce\s+RTX\b/i.test(raw)) return true;
  if (/^(?:AMD\s+)?Radeon\b/i.test(raw)) return true;
  if (/^(?:AMD\s+)?Ryzen\b/i.test(raw)) return true;
  if (/^(?:Intel\s+)?Core(?:\s+Ultra)?\b/i.test(raw)) return true;
  if (/^(?:RTX|GTX)\s*\d/i.test(raw)) return true;
  if (/^USB(?:-C)?(?:\s|\d|$)/i.test(raw)) return true;
  if (/^HDMI(?:\s|\d|$)/i.test(raw)) return true;
  if (/^DisplayPort(?:\s|\d|$)/i.test(raw)) return true;
  if (/^Thunderbolt(?:\s|\d|$)/i.test(raw)) return true;
  return false;
}

function _foldSourceResidueText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();
}

function _translationHasTurkishResidue(targetLang, translation, sourceText = '') {
  if (targetLang === 'tr') return false;
  // NUCLEAR: any Turkish-only character (ç,ğ,ı,İ,ö,ş,ü) in a non-TR translation
  // is automatic rejection — no exceptions. Once this fires, the cached entry
  // is deleted and re-translated. This catches every future leak without
  // needing a per-word rule.
  if (/[çğıİöşüÇĞŞÜÖ]/.test(translation)) return true;
  const folded = _foldSourceResidueText(translation);
  if (!folded) return false;
  const residue = [
    'batarya', 'sarj', 'dakika', 'saat', 'dongu', 'adet', 'adedi',
    'piksel', 'pil', 'lityum', 'ceyrek', 'goz', 'hizli',
    'uretim', 'uretimi', 'teknoloji', 'teknolojisi',
    'ozellik', 'ozellikleri', 'kamera ozellikleri', 'on kamera',
    'arka kamera', 'ikinci arka', 'ucuncu arka', 'kart okuyucu',
    'klavye', 'minirsel', 'sinirsel', 'yalnizca', 'milyon',
    'guvenlik guncellemesi', 'sogutma', 'navigasyon',
    // 2026-05-24 batch — words still leaking into EN output
    'arka', 'ikinci', 'ucuncu', 'dorduncu', 'besinci', 'birinci',
    'cift', 'hucreli', 'hucre', 'ivmeolc', 'ivmeolcer',
    'parmak', 'izi', 'okuyucu', 'aydinlatma', 'aydinlatmali',
    'tepki', 'suresi', 'ocak', 'subat', 'mart', 'nisan', 'mayis',
    'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik',
    'cikis', 'yili', 'ahirpasaglik',
    // Argos mistranslations that look English but mean something else
    'aauppercase', 'business system', 'curtain speed', 'bulk battery',
    'heavy duty shooting', 'multipiece', 'heart shooting',
  ];
  const hasTerm = (term) => new RegExp(`(^|[^a-z0-9])${_escapeRegExp(term)}([^a-z0-9]|$)`, 'i').test(folded);
  if (residue.some(hasTerm)) return true;

  // Root guard: if a source-side Turkish token survives unchanged into a
  // non-TR translation, reject it before it can become a permanent cache hit.
  // This catches future category terms without adding one-off render patches.
  const sourceFolded = _foldSourceResidueText(sourceText);
  const sourceTokens = sourceFolded.match(/[a-z0-9]+/g) || [];
  const protectedTokens = new Set([
    'usb','type','display','port','displayport','hdmi','wi','fi','wifi','bluetooth',
    'ethernet','nfc','gps','hdr','hdr10','oled','amoled','ips','led','mini','sim',
    'esim','nano','ram','rom','cpu','gpu','npu','ssd','hdd','pcie','pci','m2',
    'windows','android','ios','apple','samsung','intel','amd','nvidia','rtx','gtx',
    'dolby','vision','directx','directml','opencl','opengl','vulkan','dlss',
  ]);
  const sourceHasTurkishChars = /[çğıöşü]/i.test(sourceText);
  for (const token of sourceTokens) {
    if (token.length < 4 || protectedTokens.has(token) || /^\d+$/.test(token)) continue;
    const turkishish = residue.includes(token) ||
      (sourceHasTurkishChars && /(lar|ler|lari|leri|sinin|inin|unun|ligi|lıgı|li|lii|si|ci|cu|sel|sal)$/.test(token));
    if (turkishish && hasTerm(token)) return true;
  }
  return false;
}

// JS `\b` is ASCII-only and does NOT recognize Turkish letters (Ö, ç, ş, İ…)
// as word characters. So `\bÖn\b` silently never matches "Ön" at the start
// of a string or surrounded by other Turkish letters. We replace `\b` with
// explicit Unicode lookarounds via a small helper that builds a RegExp with
// negative lookbehind/lookahead for the union of ASCII letters + Turkish
// letters. Use _tb (turkish boundary) instead of \b throughout this module.
const _TR_WORD_CHARS = "A-Za-zÇĞİÖŞÜçğıöşü0-9_";
function _tb(body, flags = 'g') {
  return new RegExp(
    `(?<![${_TR_WORD_CHARS}])(?:${body})(?![${_TR_WORD_CHARS}])`,
    flags
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  FINAL-PASS TRANSLATOR — Turkish word dictionary
//
//  Argos sometimes passes Turkish words through verbatim into the EN
//  output. POST_FIX rules cover the ones we've seen, but every new product
//  category leaks new words. This dictionary covers the long tail.
//  After all POST_FIX rules run, _finalPassTurkishCleanup() walks the
//  output token by token: any token containing TR-only chars (çğıİöşü) is
//  looked up here; if found, replaced with the EN form; otherwise the
//  Turkish chars are transliterated (ç→c, ş→s) so AT LEAST no Turkish
//  letter survives in non-TR output.
// ─────────────────────────────────────────────────────────────────────────
const _TR_WORD_DICT = {
  // pronouns / positions
  'ön': 'front', 'arka': 'rear', 'üst': 'top', 'alt': 'bottom',
  'sol': 'left', 'sağ': 'right', 'iç': 'inner', 'dış': 'outer',
  'ana': 'main', 'yan': 'side', 'orta': 'middle',
  // ordinals
  'birinci': 'first', 'ikinci': 'second', 'üçüncü': 'third', 'dördüncü': 'fourth',
  'beşinci': 'fifth', 'altıncı': 'sixth', 'yedinci': 'seventh',
  // numbers (when written out)
  'bir': 'one', 'iki': 'two', 'üç': 'three', 'dört': 'four', 'beş': 'five',
  'altı': 'six', 'yedi': 'seven', 'sekiz': 'eight', 'dokuz': 'nine', 'on': 'ten',
  'yüz': 'hundred', 'bin': 'thousand', 'milyon': 'million', 'milyar': 'billion',
  // common spec nouns
  'kamera': 'camera', 'ekran': 'screen', 'pil': 'battery', 'batarya': 'battery',
  'şarj': 'charging', 'klavye': 'keyboard', 'fare': 'mouse', 'işlemci': 'processor',
  'bellek': 'memory', 'depolama': 'storage', 'hoparlör': 'speaker',
  'mikrofon': 'microphone', 'kulaklık': 'headphone', 'sensör': 'sensor',
  'sensörler': 'sensors', 'sensörü': 'sensor', 'çekirdek': 'core', 'çekirdekli': 'core',
  'işlem': 'process', 'görüntü': 'image', 'video': 'video', 'ses': 'audio',
  'müzik': 'music', 'film': 'movie', 'oyun': 'game', 'uygulama': 'application',
  'sistem': 'system', 'ağ': 'network', 'bağlantı': 'connection',
  'parmak': 'finger', 'izi': 'print', 'yüz': 'face', 'göz': 'eye', 'kalp': 'heart',
  'okuyucu': 'reader', 'tarayıcı': 'scanner', 'gösterge': 'indicator',
  'düğme': 'button', 'tuş': 'key', 'dokunmatik': 'touch', 'fiş': 'plug', 'jak': 'jack',
  'soket': 'socket', 'kablo': 'cable', 'kablosuz': 'wireless', 'kablolu': 'wired',
  'tip': 'type', 'tipi': 'type', 'türü': 'type', 'şekil': 'shape', 'biçim': 'form',
  'boyut': 'size', 'boyutu': 'size', 'boyutlar': 'dimensions', 'boyutları': 'dimensions',
  'ağırlık': 'weight', 'ağırlığı': 'weight', 'renk': 'color', 'rengi': 'color',
  'renkler': 'colors', 'malzeme': 'material', 'malzemesi': 'material',
  'kapasite': 'capacity', 'kapasitesi': 'capacity', 'hız': 'speed', 'hızı': 'speed',
  'hızlı': 'fast', 'yavaş': 'slow', 'güç': 'power', 'gücü': 'power',
  'verim': 'efficiency', 'verimlilik': 'efficiency', 'performans': 'performance',
  'kalite': 'quality', 'kalitesi': 'quality',
  // display
  'piksel': 'pixel', 'çözünürlük': 'resolution', 'parlaklık': 'brightness',
  'kontrast': 'contrast', 'yenileme': 'refresh', 'tepki': 'response',
  'süresi': 'time', 'süre': 'time', 'oran': 'ratio', 'oranı': 'ratio',
  'genişlik': 'width', 'yükseklik': 'height', 'derinlik': 'depth',
  'inç': 'inch', 'çentik': 'notch', 'çentikli': 'notched', 'kavisli': 'curved',
  'düz': 'flat', 'yuvarlak': 'round', 'kare': 'square',
  // camera
  'odak': 'focus', 'odaklama': 'focus', 'optik': 'optical', 'dijital': 'digital',
  'analog': 'analog', 'yakınlaştırma': 'zoom', 'açı': 'angle', 'açılı': 'angle',
  'geniş': 'wide', 'dar': 'narrow', 'derin': 'deep', 'yüzeysel': 'shallow',
  'diyafram': 'aperture', 'perde': 'shutter', 'pozlama': 'exposure',
  'kare': 'frame', 'çekim': 'shooting', 'kayıt': 'recording', 'kayıtlı': 'recorded',
  'düzeltme': 'correction', 'düzeltmesi': 'correction',
  // network
  'gezgin': 'mobile', 'taşınabilir': 'portable', 'sabit': 'fixed',
  'frekans': 'frequency', 'frekansı': 'frequency', 'bant': 'band',
  'bandı': 'band', 'kanal': 'channel', 'sinyal': 'signal',
  'navigasyon': 'navigation', 'pusula': 'compass', 'konum': 'location',
  // power
  'döngü': 'cycle', 'döngüsü': 'cycle', 'döngüleri': 'cycles',
  'dakika': 'minute', 'saat': 'hour', 'gün': 'day', 'hafta': 'week',
  'ay': 'month', 'yıl': 'year', 'saniye': 'second',
  // os / software
  'sürüm': 'version', 'sürümü': 'version', 'güncelleme': 'update',
  'güncellemesi': 'update', 'güvenlik': 'security', 'güvenli': 'secure',
  'arayüz': 'interface', 'arayüzü': 'interface',
  // misc
  'çift': 'dual', 'tek': 'single', 'hücre': 'cell', 'hücreli': 'cell',
  'çoklu': 'multi', 'tekli': 'single', 'çift': 'dual',
  'destek': 'support', 'destekli': 'supported', 'destekleyen': 'supporting',
  'standart': 'standard', 'özel': 'special', 'genel': 'general',
  'evet': 'yes', 'hayır': 'no', 'var': 'yes', 'yok': 'no',
  'mevcut': 'available', 'gerekli': 'required',
  'aydınlatma': 'lighting', 'aydınlatmalı': 'backlit',
  'soğutma': 'cooling', 'ısıtma': 'heating', 'buhar': 'steam',
  'ivme': 'acceleration', 'ivmeölçer': 'accelerometer',
  'ivmeölç': 'accelerometer', 'jiroskop': 'gyroscope', 'pusula': 'compass',
  'barometre': 'barometer', 'termometre': 'thermometer',
  'sertifika': 'certificate', 'sertifikası': 'certificate', 'sertifikalı': 'certified',
  'garanti': 'warranty', 'garantisi': 'warranty',
  // measurement adjectives
  'yüksek': 'high', 'düşük': 'low', 'maksimum': 'maximum', 'minimum': 'minimum',
  'ortalama': 'average', 'toplam': 'total', 'kısmi': 'partial',
  // brand value collisions seen in real data
  'çentikli (notch)': 'notch',
  // months
  'ocak': 'january', 'şubat': 'february', 'mart': 'march', 'nisan': 'april',
  'mayıs': 'may', 'haziran': 'june', 'temmuz': 'july', 'ağustos': 'august',
  'eylül': 'september', 'ekim': 'october', 'kasım': 'november', 'aralık': 'december',
  // common verbs / actions
  'çıkış': 'release', 'yılı': 'year', 'duyuru': 'announcement',
  'tarihi': 'date', 'tarih': 'date',
  // ASCII Turkish forms (no special chars) — also need to translate
  'cikis': 'release', 'yili': 'year', 'sayisi': 'count', 'sayi': 'count',
  'turu': 'type', 'cozunurlugu': 'resolution', 'cozunurluk': 'resolution',
  'genisligi': 'width', 'yuksekligi': 'height', 'derinligi': 'depth',
  'agirligi': 'weight', 'agirlik': 'weight', 'buyukluk': 'size',
  'parlaklik': 'brightness', 'aydinlatma': 'lighting', 'aydinlatmali': 'backlit',
  'kalitesi': 'quality', 'kalite': 'quality', 'hizi': 'speed', 'hiz': 'speed',
  'omru': 'life', 'gucu': 'power', 'guvenligi': 'security',
  'sicakligi': 'temperature', 'sicaklik': 'temperature',
  'kayitli': 'recorded', 'kayit': 'recording', 'kontrolu': 'control',
  'isleme': 'processing', 'islem': 'process', 'islemi': 'process',
  'donanim': 'hardware', 'yazilim': 'software',
  'gosterici': 'indicator', 'sistemi': 'system', 'birimi': 'unit',
  'ozelligi': 'feature', 'durumu': 'status', 'modulu': 'module',
  'yuzeyi': 'surface', 'kapagi': 'cover', 'koruyucu': 'protective',
  'gosterimi': 'display', 'gosterim': 'display', 'gosterge': 'indicator',
  'koruma': 'protection', 'sinifi': 'class', 'seviyesi': 'level',
  'sinyali': 'signal', 'sinyal': 'signal', 'bilgisi': 'info',
  'numarasi': 'number', 'numara': 'number', 'kodu': 'code', 'kod': 'code',
  'agi': 'network', 'kademesi': 'tier', 'kademe': 'tier',
  'kameralar': 'cameras', 'arabulucu': 'mediator',
  'olcumu': 'measurement', 'olcum': 'measurement', 'sayaci': 'counter',
  'sayim': 'count', 'sicakligi': 'temperature',
  'frekansi': 'frequency', 'frekans': 'frequency', 'bandi': 'band',
  'donus': 'rotation', 'donme': 'rotation',
  'arttirma': 'expansion', 'artirma': 'expansion', 'genisleme': 'expansion',
  'genisletme': 'extension', 'ekleme': 'addition',
  'cikartilabilir': 'removable', 'cikarilabilir': 'removable',
  'takilabilir': 'attachable', 'sokulebilir': 'detachable',
  'desteklenen': 'supported', 'desteklemeyen': 'unsupported',
  'gosterim': 'display', 'engelleyici': 'blocker',
  'azaltma': 'reduction', 'arttirici': 'amplifier',
  'erisim': 'access', 'erisimi': 'access',
  'islemci': 'processor', 'islemcisi': 'processor', 'islemciler': 'processors',
  'cekirdek': 'core', 'cekirdeginin': 'core', 'cekirdekleri': 'cores',
  'verimlilik': 'efficiency', 'verim': 'efficiency',
  'performansi': 'performance', 'performans': 'performance',
  'cikisi': 'output', 'cikislari': 'outputs',
  'girisi': 'input', 'girisleri': 'inputs', 'giris': 'input',
  'baglantisi': 'connection', 'baglanti': 'connection', 'baglantilar': 'connections',
  'baglantilari': 'connections', 'soketi': 'socket', 'soket': 'socket',
  'kabloyla': 'wired', 'kablosuz': 'wireless', 'kablosuza': 'wireless',
  'klavye': 'keyboard', 'klavyesi': 'keyboard',
  'fare': 'mouse', 'faresi': 'mouse',
  'pil': 'battery', 'pili': 'battery', 'pilin': 'battery',
  'batarya': 'battery', 'bataryasi': 'battery', 'bataryanin': 'battery',
  'depolama': 'storage', 'depolamasi': 'storage', 'depo': 'storage',
  'bellek': 'memory', 'bellegi': 'memory', 'bellegin': 'memory',
  'sogutma': 'cooling', 'sogutucu': 'cooler', 'sogutmali': 'cooled',
  'isitma': 'heating', 'isitici': 'heater',
  'buhar': 'steam', 'buharli': 'steam',
  'mavi': 'blue', 'siyah': 'black', 'beyaz': 'white', 'gri': 'gray',
  'kirmizi': 'red', 'yesil': 'green', 'sari': 'yellow', 'turuncu': 'orange',
  'mor': 'purple', 'pembe': 'pink', 'kahverengi': 'brown',
  'gumus': 'silver', 'altin': 'gold',
  'parlak': 'glossy', 'mat': 'matte', 'metalik': 'metallic',
  'plastik': 'plastic', 'cam': 'glass', 'metal': 'metal',
  'silikon': 'silicon', 'karbon': 'carbon', 'aluminyum': 'aluminum',
  'celik': 'steel', 'titanyum': 'titanium',
  'genel': 'general', 'temel': 'basic', 'gelismis': 'advanced',
  'sade': 'simple', 'karmasik': 'complex',
  'olcusu': 'size', 'olcu': 'measure', 'olcekli': 'scalable',
  'paket': 'package', 'paketi': 'package',
  'kutu': 'box', 'kutusu': 'box', 'icerigi': 'content', 'icerik': 'content',
  'icerikli': 'with content',
  'firma': 'company', 'firmasi': 'company',
  'marka': 'brand', 'markasi': 'brand',
  'model': 'model', 'modeli': 'model',
  'seri': 'series', 'serisi': 'series', 'serinin': 'series',
  'urun': 'product', 'urunler': 'products', 'urunun': 'product',
  // broad Epey suffix forms seen across real category scrapes
  'ozellik': 'feature', 'ozelligi': 'feature', 'ozellikleri': 'features',
  'detay': 'detail', 'detayi': 'detail', 'detaylari': 'details',
  'yogunluk': 'density', 'yogunlugu': 'density',
  'alan': 'area', 'alani': 'area',
  'dayaniklilik': 'durability', 'dayanikliligi': 'durability',
  'dayanikli': 'resistant', 'direnc': 'resistance', 'direnci': 'resistance',
  'destegi': 'support', 'desteği': 'support',
  'versiyon': 'version', 'versiyonu': 'version',
  'kanal': 'channel', 'kanali': 'channel', 'kanallari': 'channels',
  'kapak': 'cover', 'kapagi': 'cover',
  'govde': 'body', 'govdesi': 'body',
  'cerceve': 'frame', 'cercevesi': 'frame', 'cercevesiz': 'frameless',
  'tasarim': 'design', 'tasarimi': 'design',
  'uzay': 'space', 'uzayi': 'space',
  'derinlik': 'depth', 'derinligi': 'depth',
  'hassasiyet': 'accuracy', 'hassasiyeti': 'accuracy',
  'yaricap': 'radius', 'yaricapi': 'radius',
  'tarafli': 'sided', 'kaplamali': 'coated',
  'yansimasiz': 'anti-glare', 'yansitma': 'mirroring',
  'uzaktan': 'remote', 'kumanda': 'control',
  'dusuk': 'low', 'yuksek': 'high',
  'kavis': 'curve', 'kavisli': 'curved',
  'kisisellestirilebilir': 'customizable',
  'sert': 'hard', 'maks': 'max', 'maksimum': 'maximum',
  'islak': 'wet', 'parmak': 'finger', 'algilama': 'detection',
  'cizilmeye': 'scratch', 'direncli': 'resistant',
  'surekli': 'continuous', 'acik': 'on', 'icinde': 'inside',
  'dokunma': 'touch', 'dokunarak': 'tapping',
  'renk': 'color', 'rengi': 'color', 'renkleri': 'colors',
  'renkli': 'color', 'tonlu': 'tone',
  'sabitleyici': 'stabilizer', 'sabitleme': 'stabilization',
  'portre': 'portrait', 'modu': 'mode', 'mod': 'mode',
  'sahne': 'scene', 'yapay': 'artificial', 'zeka': 'intelligence',
  'otomatik': 'automatic', 'sesli': 'voice', 'sesle': 'voice',
  'komut': 'command', 'kontrol': 'control', 'kontrolu': 'control',
  'lazer': 'laser', 'yapabilme': 'support', 'zamanlayici': 'timer',
  'elementli': 'element', 'acili': 'angle', 'ekstra': 'extra',
  'makro': 'macro', 'telefoto': 'telephoto', 'degisken': 'variable',
  'sanal': 'virtual', 'iyilestirme': 'enhancement',
  'dijital': 'digital', 'goruntu': 'image', 'goruntulu': 'video',
  'cekirdegi': 'core', 'cekirdek': 'core', 'cekirdekleri': 'cores',
  'yardimci': 'auxiliary', 'mimari': 'architecture', 'mimarisi': 'architecture',
  'onbellek': 'cache', 'teknolojileri': 'technologies',
  'artirilmis': 'boost', 'azami': 'maximum', 'temel': 'base',
  'markasi': 'brand', 'marka': 'brand',
  'modeli': 'model', 'serisi': 'series',
  'dahili': 'internal', 'bicim': 'format', 'bicimi': 'format',
  'karti': 'card', 'kart': 'card',
  'kalinlik': 'thickness', 'en': 'width', 'boy': 'height',
  'malzemesi': 'material', 'paslanmaz': 'stainless',
  'frekanslari': 'frequencies', 'frekans': 'frequency',
  'isletim': 'operating', 'sistemi': 'system',
  'lansman': 'launch', 'arayuz': 'interface',
  'kizilotesi': 'infrared', 'radyo': 'radio',
  'suya': 'water', 'toza': 'dust',
  'seviyesi': 'level', 'sinifi': 'class',
  'konusma': 'calling', 'bildirim': 'notification',
  'isigi': 'light', 'bas': 'head', 'vucut': 'body',
  'servis': 'services', 'uygulamalar': 'applications',
  'baska': 'other', 'cihazlari': 'devices', 'edebilme': 'support',
  'karanlik': 'dark', 'tek': 'single', 'elde': 'hand',
  'kullanim': 'use', 'ters': 'reverse',
  'tanimlama': 'identification', 'yuz': 'face',
  'icerigi': 'content', 'cikartma': 'eject', 'ignesi': 'pin',
  'hat': 'line', 'duyurulma': 'announcement',
  'kullanım': 'use', 'kilavuzu': 'manual',
  'secenekleri': 'options', 'secenek': 'option',
  'degeri': 'value', 'puan': 'score', 'puani': 'score',
  'flas': 'flash', 'acikligi': 'aperture',
  'uzakligi': 'distance',
  'degisir': 'removable', 'agir': 'slow',
  'hafiza': 'memory', 'diger': 'other', 'ozellikler': 'features',
  'grafik': 'graphics', 'gurultu': 'noise', 'engelleme': 'cancellation',
  'dinleme': 'listening', 'pasif': 'passive', 'onleme': 'prevention',
  'yakinlik': 'proximity', 'ortam': 'ambient', 'isigi': 'light',
  'cihaz': 'device', 'cihazlari': 'devices',
  'uyum': 'compatibility', 'uyumu': 'compatibility',
  'yonlu': 'way', 'alici': 'receiver', 'ile': 'with',
  'resim': 'image', 'oynatma': 'playback',
  'akilli': 'smart', 'bildirimler': 'notifications',
  'calar': 'player', 'telefonumu': 'my phone', 'bul': 'find',
  'kumandasi': 'control', 'takvim': 'calendar',
  'medya': 'media', 'oynatici': 'player',
  'hatirlaticilar': 'reminders', 'harita': 'map', 'haritalar': 'maps',
  'hesap': 'calculator', 'makinesi': 'machine',
  'gelen': 'incoming', 'aramalari': 'calls', 'yonetme': 'management',
  'eslesme': 'pairing', 'asistan': 'assistant',
  'arama': 'call', 'gecmisi': 'history',
  'goruntusu': 'image', 'alma': 'capture',
  'fonksiyonel': 'functional', 'yanit': 'reply',
  'konumlandirma': 'positioning', 'not': 'note', 'notu': 'note',
  'gonderme': 'sending', 'cagri': 'call', 'reddetme': 'rejection',
  'cevrimdisi': 'offline',
  'saglik': 'health', 'sagligi': 'health',
  'sertifikasyon': 'certification', 'sertifikasyonu': 'certification',
  'sertifikasi': 'certification', 'goz': 'eye',
  'polimer': 'polymer',
  'eyesafe': 'Eyesafe', 'tüv': 'TÜV', 'tuv': 'TÜV', 'rheinland': 'Rheinland',
  'uretici': 'manufacturer', 'verisi': 'data',
  'sonrasi': 'after', 'parlakligi': 'brightness',
  'aramasi': 'calling', 'aralik': 'range', 'araligi': 'range',
  'izleme': 'viewing', 'acisi': 'angle', 'yatay': 'horizontal', 'dikey': 'vertical',
  'titresim': 'flicker', 'titresimi': 'flicker', 'filtresi': 'filter',
  'yaninda': 'beside', 'uyumlu': 'compatible',
  'amac': 'purpose', 'amaci': 'purpose',
  'tusu': 'key', 'tuslari': 'keys', 'oyuncu': 'gaming',
  'guvenilir': 'trusted', 'platform': 'platform', 'modulu': 'module',
  'ayarlanabilir': 'adjustable', 'kafa': 'head', 'bandi': 'band',
  'yastik': 'cushion', 'yastigi': 'cushion',
  'guclu': 'powerful', 'degisebilir': 'replaceable',
  'kulak': 'ear', 'hafizali': 'memory foam', 'tekstil': 'fabric',
};

function _lookupTurkishWord(lower, folded) {
  const direct = _TR_WORD_DICT[lower] || _TR_WORD_DICT[folded];
  if (direct) return direct;
  const f = String(folded || '');
  const variants = new Set();
  const add = (v) => { if (v && v.length >= 3) variants.add(v); };
  // Common Turkish possessed/adjectival suffixes after ASCII folding.
  if (/(ligi|ligi|lugu|lugu|ligi)$/.test(f)) {
    add(f.replace(/ligi$/, 'lik'));
    add(f.replace(/lugu$/, 'luk'));
    add(f.replace(/ligi$/, 'lik'));
  }
  if (/(gı|gi|gu|gu|i|u|si|sı|su|sü)$/.test(f)) {
    add(f.replace(/(si|sı|su|sü)$/u, ''));
    add(f.replace(/[iu]$/u, ''));
    add(f.replace(/g[ıiuu]$/u, 'k'));
  }
  if (/(lari|leri|lar|ler)$/.test(f)) add(f.replace(/(lari|leri|lar|ler)$/, ''));
  if (/(masi|mesi)$/.test(f)) add(f.replace(/(masi|mesi)$/, 'ma'));
  if (/(tici|tici|ici|ucu|ucu)$/.test(f)) add(f.replace(/(ici|ucu)$/, ''));
  for (const v of variants) {
    if (_TR_WORD_DICT[v]) return _TR_WORD_DICT[v];
  }
  return null;
}

// Simple ASCII transliteration for Turkish-only chars. Last-resort safety net:
// if a word isn't in _TR_WORD_DICT, at least replace Turkish characters so
// the output has no foreign letters.
function _trToAscii(text) {
  return String(text || '')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u');
}

function _applyCaseLike(sourceWord, replacement) {
  const rep = String(replacement || '');
  if (!rep) return sourceWord;
  if (sourceWord === sourceWord.toUpperCase()) return rep.toUpperCase();
  if (sourceWord[0] === sourceWord[0].toUpperCase()) return rep[0].toUpperCase() + rep.slice(1);
  return rep;
}

function _sourceAwareTurkishWordMap(sourceText) {
  const map = new Map();
  const tokens = String(sourceText || '').match(/[A-Za-zÇĞİÖŞÜçğıöşü]+/g) || [];
  const protectedAscii = new Set([
    'a','an','and','as','at','by','for','from','in','into','not','of','on','or','the','to','with',
    'always','display','touch','sampling','rate','sensor','camera','video','audio','hdr',
    'usb','type','hdmi','bluetooth','wi','fi','wifi','nfc','gps','ram','rom','cpu','gpu','npu',
    'dolby','vision','freesync','sync','nvidia','amd','intel','microsoft','windows','apple',
    'samsung','huawei','qualcomm','snapdragon','mediatek','razer','tp','link','sony','philips',
    'hdr10','oled','ltpo','dci','p3','mimo','mlo','airplay','bixby','knox','smartthings',
    'true','tone','prores','promotion','retina','xdr','displayport','thunderbolt',
    'eyesafe','tuv','tüv','rheinland','x','rite',
  ]);
  const sourceHasTurkishChars = /[çğıİöşüÇĞŞÜÖ]/.test(sourceText || '');
  for (const token of tokens) {
    const lower = token.toLowerCase();
    const hasTrChars = /[çğıİöşüÇĞŞÜÖ]/.test(token);
    const folded = _foldSourceResidueText(token);
    if (protectedAscii.has(lower) || protectedAscii.has(folded)) continue;
    const exact = _lookupTurkishWord(lower, folded);
    const foldedHit = exact;
    if (exact) map.set(folded, exact);
    else if (foldedHit) map.set(folded, foldedHit);
    else if (hasTrChars && folded.length >= 4 && !protectedAscii.has(folded)) {
      map.set(folded, '');
    } else if (
      sourceHasTurkishChars &&
      folded.length >= 4 &&
      !protectedAscii.has(folded) &&
      /(ligi|lugu|leri|lari|masi|mesi|sayi|sayisi|boyutu|bellegi|islemci|islemcisi|ozellik|ozellikleri|sertifika|sertifikasyon|saglik|sagligi|polimer|azami)$/i.test(folded)
    ) {
      map.set(folded, '');
    }
  }
  return map;
}

// Walk the translation token-by-token. For any token containing Turkish-only
// chars, look it up in _TR_WORD_DICT. If found, swap. Otherwise transliterate
// so no Turkish letter survives. It also handles ASCII-looking Turkish words
// ("Bellek", "Ana", "Pil", "Boyutu") when the same source token survived
// into the English output. Preserves case heuristically.
// Words seen during the current session that have TR chars but no dict entry.
// Drained at scrape end by _flushUnknownTurkishWords() which sends them to
// Argos as single-word translation requests, then permanently adds the
// results to _TR_WORD_DICT + the PocketBase dictionary. THIS is the
// self-healing loop: any new TR word the system encounters is auto-learned.
const _unknownTrWords = new Set();

// Common English short words that happen to collide with Turkish dict keys —
// must never be auto-translated. Add aggressively; safer to skip a Turkish
// match than to mangle real English text.
const _ENGLISH_PROTECTED_ASCII = new Set([
  'on','off','an','as','at','be','by','do','el','ev','go','he','if','in','is',
  'it','me','my','no','of','or','so','to','up','us','we','am','old','new','low',
  'high','top','bot','one','two','six','ten','red','car','bag','bar','can','set',
  'led','box','arm','air','net','run','use','out','for','our','any','add','all',
  'and','but','not','put','say','see','sit','sub','tap','the','try','vue','was',
  'who','win','you','your','from','this','that','with','have','here','more','some',
  'when','what','will','time','than','also','date','data','very','were','make',
  'most','only','over','such','take','than','them','well','many','main','same',
  'side','full','last','next','open','play','show','step','tone','type','user',
  'view','wait','wake','wave','week','wide','wild','wind','work','year','your',
  'zone','life','line','live','look','lose','love','lock','long','loop','lost',
  'mode','need','note','past','pole','pop','part','past','play','plus','port',
  'post','rain','rare','rate','read','real','rear','ride','ring','rock','rose',
  'safe','save','seem','sell','send','sent','sent','sing','size','skin','slow',
  'small','smell','soft','sold','solid','song','sort','sound','span','spec',
  'speed','spin','spot','star','start','state','stay','step','stop','sure',
  'swim','tab','take','talk','tape','task','tax','test','text','thin','this',
  'tier','tile','tip','tire','too','total','tour','town','town','tray','tree',
  'turn','type','unit','unix','upon','wall','want','war','ward','warm','way',
  'wear','what','when','win','wing','wire','wise','wish','wood','wool','wood',
  'word','work','yard','year','yes','yet','your',
]);

function _finalPassTurkishCleanup(text, sourceText = '') {
  if (!text) return text;
  const sourceMap = _sourceAwareTurkishWordMap(sourceText);
  const sourceHasTurkish = /[çğıİöşüÇĞŞÜÖ]/.test(sourceText || '');
  // ALWAYS run if any TR chars in output OR any TR chars in source — Argos
  // emits ASCII-folded Turkish ("Sertifikasyonu") even when source had ş/ğ/ı.
  if (!/[çğıİöşüÇĞŞÜÖ]/.test(text) && !sourceMap.size && !sourceHasTurkish) return text;
  return String(text).replace(/[A-Za-zÇĞİÖŞÜçğıöşü]+/g, (word) => {
    const lower = word.toLowerCase();
    const folded = _foldSourceResidueText(word);
    const hasTrChars = /[çğıİöşüÇĞŞÜÖ]/.test(word);
    // Hands-off: known English short words (length < 5) that could collide
    // with the Turkish dictionary. Only protect ASCII tokens — Turkish-char
    // tokens are always Turkish.
    if (!hasTrChars && _ENGLISH_PROTECTED_ASCII.has(lower)) return word;
    const sourceHit = sourceMap.has(folded) ? sourceMap.get(folded) : undefined;
    // Try dict for BOTH TR-char and ASCII words. ASCII Turkish words like
    // "Sertifikasyonu", "Bellek", "Boyutu" are now caught even without
    // sourceMap entry.
    const dictHit = _lookupTurkishWord(lower, folded);
    const hit = dictHit ?? sourceHit;
    if (hit !== undefined) {
      if (!hit) return '';
      return _applyCaseLike(word, hit);
    }
    if (!hasTrChars) return word;
    // No dict entry: queue for background learning AND drop the token so
    // we never ship Turkish letters. Next scrape, the queued translation
    // will produce a real English word.
    if (lower.length >= 3) _unknownTrWords.add(lower);
    return '';
  });
}

// Send every queued unknown Turkish word to the Argos worker as a single-word
// translation. Word-level translation is far more accurate than embedding the
// word inside a mixed phrase. Results are merged into _TR_WORD_DICT in-memory
// AND persisted to localStorage so they survive page reloads. Call this at
// the end of every scrape (already wired into the bulk + single paths).
async function _flushUnknownTurkishWords() {
  if (!_unknownTrWords.size) return { learned: 0, failed: 0 };
  const words = [..._unknownTrWords];
  _unknownTrWords.clear();
  let learned = 0, failed = 0;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30000);
    const response = await fetch(LOCAL_TRANSLATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'tr', texts: words, to: ['en'] }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    const data = await response.json().catch(() => ({}));
    const map = data?.translations || {};
    for (const w of words) {
      const en = map[w]?.en;
      if (en && typeof en === 'string' && !/[çğıİöşüÇĞŞÜÖ]/.test(en) && en.trim() && en.toLowerCase() !== w) {
        _TR_WORD_DICT[w] = en.trim();
        learned++;
      } else {
        failed++;
      }
    }
    if (learned) {
      try {
        const stored = JSON.parse(localStorage.getItem('_TR_LEARNED_DICT') || '{}');
        for (const [k, v] of Object.entries(_TR_WORD_DICT)) stored[k] = v;
        localStorage.setItem('_TR_LEARNED_DICT', JSON.stringify(stored));
      } catch {}
      try { xlog(`📚 Sözlük büyüdü · ${learned} yeni TR kelime öğrenildi · toplam dict ${Object.keys(_TR_WORD_DICT).length}`, 'success'); } catch {}
    }
  } catch (e) {
    try { console.warn('[unknown-words] flush failed:', e.message); } catch {}
    failed = words.length;
  }
  return { learned, failed };
}

// Restore previously learned words from localStorage on module load.
try {
  const stored = JSON.parse(localStorage.getItem('_TR_LEARNED_DICT') || '{}');
  for (const [k, v] of Object.entries(stored)) {
    if (typeof v === 'string' && v && !_TR_WORD_DICT[k]) _TR_WORD_DICT[k] = v;
  }
} catch {}

// Expose for ad-hoc inspection / manual flush.
if (typeof window !== 'undefined') {
  window.QorAiLearnedWords = {
    queued: () => [..._unknownTrWords],
    flush:  () => _flushUnknownTurkishWords(),
    dict:   () => _TR_WORD_DICT,
    size:   () => Object.keys(_TR_WORD_DICT).length,
  };
}

function _normalizeTurkishSourceTranslation(sourceText, targetLang, translation) {
  let out = String(translation || '').trim();
  if (!out) return '';
  if (targetLang === 'en') {
    const reps = [
      // ── Battery / power ──
      [_tb('Çift\\s+Hücreli\\s+Battery', 'gi'), 'Dual-cell battery'],
      [_tb('Çift\\s+Hücreli', 'gi'), 'Dual-cell'],
      [_tb('Hücreli', 'gi'), 'cell'],
      [_tb('Hücre', 'gi'), 'cell'],
      [_tb('Çift', 'g'), 'Dual'],
      [_tb('Batarya', 'gi'), 'Battery'],
      [_tb('Pil\\s+Specifications', 'gi'), 'Battery specifications'],
      [_tb('Pil\\s+Ömrü', 'gi'), 'Battery life'],
      [_tb('Pil', 'gi'), 'Battery'],
      [/Li-?po\s*\(\s*lityum-polymer\s*\)/gi, 'Li-Po (lithium polymer)'],
      [_tb('lityum', 'gi'), 'lithium'],
      [_tb('Battery\\s+time\\s+after\\s+charging', 'gi'), 'Battery life after charging'],
      [_tb('Charging\\s+loop\\s+count', 'gi'), 'Charging cycle count'],
      [/Charging\s+cycle\s+count\s*\(\s*ab\s*\)/gi, 'Charging cycle count'],
      [_tb('Bulk\\s+battery', 'gi'), 'Removable battery'],

      // ── Camera ──
      [_tb('Heavy\\s+duty\\s+shooting\\s+recording\\s+options', 'gi'), 'Slow motion video recording options'],
      [_tb('Heavy\\s+duty\\s+shooting', 'gi'), 'Slow motion'],
      [_tb('Slow\\s+shooting\\s+video\\s+recording', 'gi'), 'Slow motion video recording'],
      [/Slow\s+shooting\s+\(\s*slow\s+motion\s*\)\s+video\s+recording/gi, 'Slow motion video recording'],
      [/Curtain\s+speed\s*\(\s*shutter\s+speed\s*\)\s*control/gi, 'Shutter speed control'],
      [_tb('Curtain\\s+speed', 'gi'), 'Shutter speed'],
      [/Series\s+shooting\s*\(\s*burst\s*\)\s*mode/gi, 'Burst shooting mode'],
      [/Heart\s+shooting\s+speed\s+sensor/gi, 'Heart rate sensor'],
      [/Kalp\s+atış\s+hızı\s+sensörü/gi, 'Heart rate sensor'],

      // ── Position / ordinals (CRITICAL — these never worked before) ──
      [_tb('İkinci\\s+Arka\\s+Camera', 'gi'), 'Second rear camera'],
      [_tb('Üçüncü\\s+Arka\\s+Camera', 'gi'), 'Third rear camera'],
      [_tb('Dördüncü\\s+Arka\\s+Camera', 'gi'), 'Fourth rear camera'],
      [_tb('Ön\\s+Camera', 'gi'), 'Front camera'],
      [_tb('Arka\\s+Camera', 'gi'), 'Rear camera'],
      [_tb('Ana\\s+Camera', 'gi'), 'Main camera'],
      [_tb('İkinci\\s+Rear', 'gi'), 'Second rear'],
      [_tb('Üçüncü\\s+Rear', 'gi'), 'Third rear'],
      [_tb('Dördüncü\\s+Rear', 'gi'), 'Fourth rear'],
      [_tb('Ön\\s+Rear', 'gi'), 'Front'],
      [_tb('Arka\\s+Rear', 'gi'), 'Rear'],
      // Section titles like "Ön Camera Specifications"
      [/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Ön\s+([A-Z][a-z]+\s+Specifications)(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, 'Front $1'],
      [/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Arka\s+([A-Z][a-z]+\s+Specifications)(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, 'Rear $1'],
      [/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Üçüncü\s+([A-Z][a-z]+\s+camera\s+Specifications)(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'Third $1'],
      [/(?<![A-Za-zÇĞİÖŞÜçğıöşü])İkinci\s+([A-Z][a-z]+\s+camera\s+Specifications)(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'Second $1'],
      [_tb('Ön', 'g'), 'Front'],
      [_tb('Arka', 'gi'), 'Rear'],
      [_tb('İkinci', 'gi'), 'Second'],
      [_tb('Üçüncü', 'gi'), 'Third'],
      [_tb('Birinci', 'gi'), 'First'],
      [_tb('Dördüncü', 'gi'), 'Fourth'],
      [_tb('Beşinci', 'gi'), 'Fifth'],
      [/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Ana(?=\s+[A-Z])/g, 'Main'],

      // ── Sensor / fingerprint ──
      [_tb('Parmak\\s+izi\\s+Okuyucu\\s+Specifications', 'gi'), 'Fingerprint reader specifications'],
      [_tb('Parmak\\s+izi\\s+okuyucu', 'gi'), 'Fingerprint reader'],
      [_tb('Parmak\\s+İzi\\s+Okuyucu', 'gi'), 'Fingerprint reader'],
      [_tb('Parmak\\s+izi', 'gi'), 'Fingerprint'],
      [_tb('Parmak\\s+İzi', 'gi'), 'Fingerprint'],
      [_tb('Ivmeölçer', 'gi'), 'Accelerometer'],
      [_tb('İvmeölçer', 'gi'), 'Accelerometer'],
      [_tb('Ivmeölç', 'gi'), 'Accelerometer'],
      [_tb('İvmeölç', 'gi'), 'Accelerometer'],
      [_tb('Ivme', 'gi'), 'Acceleration'],
      [_tb('İvme', 'gi'), 'Acceleration'],
      [_tb('Sensörler', 'gi'), 'Sensors'],
      [_tb('Sensörü', 'gi'), 'Sensor'],
      [_tb('Sensör', 'gi'), 'Sensor'],

      // ── Section headers (anchored — only exact match) ──
      [/^Tags$/i, 'Sensors'],
      [/^Multipiece$/i, 'Multimedia'],
      [/^Business\s+system$/i, 'Operating system'],
      [/^Business\s+System$/i, 'Operating System'],
      [/^Specific$/i, 'Special features'],
      [/^News$/i, 'Stereo'],
      [_tb('Multipiece', 'g'), 'Multimedia'],
      [_tb('Business\\s+system', 'gi'), 'Operating system'],

      // ── Dates / years ──
      [_tb('Output\\s+year', 'gi'), 'Release year'],
      [_tb('Output\\s+Year', 'g'), 'Release Year'],
      [_tb('Çıkış\\s+yılı', 'gi'), 'Release year'],
      [_tb('Çıkış\\s+Yılı', 'g'), 'Release Year'],
      [_tb('Duyuru\\s+tarihi', 'gi'), 'Announcement date'],
      [_tb('Ocak', 'g'), 'January'],
      [_tb('Şubat', 'g'), 'February'],
      [_tb('Mart', 'g'), 'March'],
      [_tb('Nisan', 'g'), 'April'],
      [_tb('Mayıs', 'g'), 'May'],
      [_tb('Haziran', 'g'), 'June'],
      [_tb('Temmuz', 'g'), 'July'],
      [_tb('Ağustos', 'g'), 'August'],
      [_tb('Eylül', 'g'), 'September'],
      [_tb('Ekim', 'g'), 'October'],
      [_tb('Kasım', 'g'), 'November'],
      [_tb('Aralık', 'g'), 'December'],

      // ── Lighting / display ──
      [_tb('Aydınlatmalı', 'gi'), 'Backlit'],
      [_tb('Aydınlatma', 'gi'), 'Lighting'],
      [_tb('Tepki\\s+Süresi', 'gi'), 'Response Time'],
      [_tb('Tepki', 'gi'), 'Response'],
      [_tb('Süresi', 'gi'), 'Time'],

      // ── Existing rules (with proper boundaries) ──
      [/(\d{4})\s+([1-4])\.?\s*Çeyrek/gi, '$1 Q$2'],
      [_tb('göz\\s+health\\s+certification', 'gi'), 'eye health certification'],
      [_tb('göz', 'gi'), 'eye'],
      [_tb('Non-flammable\\s+mat\\s+display', 'gi'), 'Anti-glare matte display'],
      [/^Faster$/i, 'Fast charging'],
      [/^Supply ability:\s*low frequency$/i, 'Efficiency core base frequency'],
      [_tb('Navigasyon', 'gi'), 'Navigation'],
      [_tb('Kart\\s+Okuyucu', 'gi'), 'Card reader'],
      [_tb('Klavye', 'gi'), 'Keyboard'],
      [_tb('Adedi', 'gi'), 'count'],
      [_tb('Adet', 'gi'), ''],
      [_tb('Piksel', 'gi'), 'pixels'],
      [_tb('Minirsel', 'gi'), 'Neural'],
      [_tb('sinirsel\\s+trading\\s+unit', 'gi'), 'neural processing unit'],
      [_tb('sinirsel', 'gi'), 'neural'],
      [_tb('CPU\\s+Üretim\\s+Technology', 'gi'), 'CPU manufacturing technology'],
      [_tb('Üretim\\s+Technology', 'gi'), 'Manufacturing technology'],
      [_tb('Üretim', 'gi'), 'Manufacturing'],
      [_tb('Specificationsi', 'gi'), 'Specifications'],
      [_tb('Technologyi', 'gi'), 'Technology'],
      [_tb('Teknolojisi', 'gi'), 'Technology'],
      [_tb('Teknoloji', 'gi'), 'Technology'],
      [_tb('Milyon', 'gi'), 'million'],
      [_tb('Milyar', 'gi'), 'billion'],
      [/(\d+(?:[.,]\d+)?)\s*Dakika/gi, '$1 minutes'],
      [/(\d+(?:[.,]\d+)?)\s*Saat/gi, '$1 hours'],
      [/(\d+(?:[.,]\d+)?)\s*Saniye/gi, '$1 seconds'],
      [/(\d+(?:[.,]\d+)?)\s*Döngü/gi, '$1 cycles'],
      [/(\d+)\s*Elementli\s+Lens/gi, '$1-element lens'],
      [_tb('Yalnızca\\s+eSIM', 'gi'), 'eSIM only'],
      [_tb('Evet', 'gi'), 'Yes'],
      [_tb('Hayır', 'gi'), 'No'],
      [_tb('Hayir', 'gi'), 'No'],
      [/Volte\s*\(\s*⁇\s*over\s*LTE\s*\)\s*support/gi, 'VoLTE (voice over LTE) support'],
      [/G\.p\.d\./gi, 'DisplayPort'],
      [/m\.a\./gi, 'max.'],
      [/^\s*⁇\s*$/g, ''],

      // ── Missing TR words ──
      [_tb('Düzeltme(?:si)?', 'gi'), 'Correction'],
      [_tb('düzeltme(?:si)?', 'gi'), 'correction'],
      [/Red eye \(Red-eye\) Düzeltme/gi, 'Red-eye correction'],
      [/red eye \(red-eye\) düzeltme/gi, 'red-eye correction'],
      [/Çentikli \(Notch\)/gi, 'Notch'],
      [_tb('Çentikli', 'gi'), 'Notched'],
      [_tb('çentikli', 'gi'), 'notched'],
      [_tb('Pusula', 'gi'), 'Compass'],
      [_tb('pusula', 'gi'), 'compass'],
      // Argos mistranslation: "Pusula" → "Checkout" (totally wrong)
      [/^Checkout$/, 'Compass'],
      // Animoji — Apple proper noun, OK as-is

      // ── Argos sense errors that look English but mean wrong thing ──
      [/Productivity check\.turbo frequency/gi, 'Efficiency core turbo frequency'],
      [/Productivity check\.base frequency/gi, 'Efficiency core base frequency'],
      [/Processor increased frequency/gi, 'Processor boost frequency'],
      [/Increased memory/gi, 'Expandable memory'],
      [/Increased frequency/gi, 'Boost frequency'],
      [/Keyboard back lighting/gi, 'Keyboard backlight'],
      [/Transistor distance/gi, 'Process node'],
      [/Built-in graphic max frequency/gi, 'Integrated graphics max frequency'],
      [/Built-in graphic basic frequency/gi, 'Integrated graphics base frequency'],
      [/Built-in graphic/gi, 'Integrated graphics'],
      [/External graphics processor/gi, 'Discrete graphics'],
      [/Hard disk \(SSD\) type/gi, 'SSD type'],
      [/Virtual core/gi, 'Logical cores'],
      [/Color display/gi, 'Color screen'],
      [/Dual mice/gi, 'Dual microphone'],   // Çift mikrofon mistranslation
      [_tb('Aauppercase', 'g'), 'macOS'],
      [/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Face\s+ıdentification(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'Face identification'],
      [/(?<![A-Za-zÇĞİÖŞÜçğıöşü])phone\s+ıdentification(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'Face identification'],
    ];

    for (const [pat, rep] of reps) out = out.replace(pat, rep);
    out = out.replace(/\s{2,}/g, ' ').trim();
    // FINAL PASS — token-by-token dict lookup + transliteration fallback.
    // Guarantees no Turkish letter (ç, ğ, ı, İ, ö, ş, ü) survives in EN output.
    out = _finalPassTurkishCleanup(out, sourceText);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
//  ARGOS OUTPUT VALIDATION (Seçenek B — root-cause defense)
//
//  Argos randomly produces "English-shaped but semantically wrong" output
//  for some inputs (e.g. NVIDIA→North, Pusula→Checkout, Variable→Yesiable,
//  Çıkarılabilir→Bulk, Dayanıklılık→Shareholder, Sağlığı→food, Perde→Curtain).
//  These never have Turkish characters, so the residue detector misses them.
//
//  Rather than enumerating fixes one by one forever, we maintain a BLOCKLIST
//  of known-bad Argos outputs. If a translation produces one of these terms,
//  it's rejected. The atom logs to `_rejectedArgosAtoms` (persisted to
//  localStorage) so the user can review them in DevTools and decide how to
//  translate them properly.
// ─────────────────────────────────────────────────────────────────────────
const _ARGOS_BAD_OUTPUTS = new Set([
  // Standalone-value hallucinations
  'shareholder', 'shareholders', 'checkout',
  // Mistranslated brand atoms
  // ('north' and 'main' alone are already coerced to NVIDIA/Intel — kept here
  //  for completeness so the rejection logger sees them too)
  // Suspicious compound English that Argos invented for TR/DE phrases
  'yesiable', 'yesiable refresh rate', 'yesiable refresh rate (vrr)',
  'bulk battery', 'bulk batteries',
  'curtain speed', 'curtain speeds',
  'heavy duty shooting', 'heavy duty shooting recording options',
  'food certification', 'eyesafe (food certification)',
  'fixed disk', 'fixed disk (hdd)', 'fixed disk (ssd) type',
  'available memory',
  'gpu distance', 'transistor distance',
  'display width height', 'screen width height',
  'keyboard rear lighting', 'rear lighting',
  'optical reader',
  'productivity check.turbo frequency', 'productivity check.base frequency',
  'processor increased frequency', 'increased memory',
  'built-in graphic',
  'multipiece', 'business system',
  'two way mirroring', 'display mirroring (two way)',
  'save (pvr)',
  'endurance for bumps',
  'card reader features',
  'low blue',
  '720p ()',
]);

// Per-session list of (source, badOutput) pairs that we suppressed. Surfaces
// via window.QorAiRejectedAtoms so the user can periodically inspect them.
const _rejectedArgosAtoms = [];
try {
  const stored = JSON.parse(localStorage.getItem('_TR_REJECTED_ATOMS') || '[]');
  if (Array.isArray(stored)) for (const e of stored) _rejectedArgosAtoms.push(e);
} catch {}

function _logRejectedAtom(source, badOutput, lang = 'en') {
  const entry = { source: String(source || '').slice(0, 200), bad: String(badOutput || '').slice(0, 200), lang, at: Date.now() };
  _rejectedArgosAtoms.push(entry);
  if (_rejectedArgosAtoms.length > 500) _rejectedArgosAtoms.shift();
  try { localStorage.setItem('_TR_REJECTED_ATOMS', JSON.stringify(_rejectedArgosAtoms.slice(-500))); } catch {}
}

function _isArgosOutputBad(text) {
  if (!text) return false;
  const lower = String(text).trim().toLowerCase();
  if (!lower) return false;
  if (_ARGOS_BAD_OUTPUTS.has(lower)) return true;
  // Check if any blocklist phrase appears as substring (catches "Eyesafe (food certification)" inside a longer string)
  for (const bad of _ARGOS_BAD_OUTPUTS) {
    if (bad.length >= 8 && lower.includes(bad)) return true;
  }
  return false;
}

if (typeof window !== 'undefined') {
  window.QorAiRejectedAtoms = {
    list:  () => _rejectedArgosAtoms.slice(),
    clear: () => { _rejectedArgosAtoms.length = 0; try { localStorage.removeItem('_TR_REJECTED_ATOMS'); } catch {} },
    count: () => _rejectedArgosAtoms.length,
    isBad: (text) => _isArgosOutputBad(text),
  };
}

function _sanitizeEnglishSpecText(text, sourceText = '') {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return '';
  let out = _normalizeTurkishSourceTranslation(sourceText || raw, 'en', raw);
  // Last-mile fixes for dirty values that can enter through canonicalizer,
  // old cache merge, or already-English render paths instead of dict lookup.
  out = out
    .replace(/\beye\s+Sağlığı\s+Sertifikasyonu\b/gi, 'eye health certification')
    .replace(/\bGöz\s+Sağlığı\s+Sertifikasyonu\b/gi, 'eye health certification')
    .replace(/\blithium-Polimer\b/gi, 'lithium polymer')
    .replace(/\blithium-Polymer\b/g, 'lithium polymer')
    .replace(/\bLi-Po\s*\(\s*lithium[-\s]*Polimer\s*\)/gi, 'Li-Po (lithium polymer)')
    .replace(/\bLi-Po\s*\(\s*lithium[-\s]*Polymer\s*\)/g, 'Li-Po (lithium polymer)')
    .replace(/\beye\s+Health\s+Certification\b/g, 'eye health certification')
    .replace(/^\(\s*eye\s+health\s+certification\s*\)$/gi, 'Eyesafe (eye health certification)')
    .replace(/\bEyesafe\s*\(\s*eye\s+health\s+certification\s*\)/gi, 'Eyesafe (eye health certification)')
    .replace(/\bAzami\s+(\d)/gi, 'up to $1')
    .replace(/\bHeat spread capacity\s*\(\s*TDP\s*\)/gi, 'Thermal design power (TDP)')
    .replace(/\bHard disk\s*\(\s*SSD\s*\)\s*type\b/gi, 'SSD type')
    .replace(/\bKeyboard back lighting\b/gi, 'Keyboard backlight')
    .replace(/\bVirtual core\b/gi, 'Logical cores')
    .replace(/\bTransistor distance\b/gi, 'Process node')
    .replace(/\bProductivity check\.turbo frequency\b/gi, 'Efficiency core turbo frequency')
    .replace(/\bProcessor increased frequency\b/gi, 'Processor boost frequency')
    .replace(/\bBuilt-in graphic max frequency\b/gi, 'Integrated graphics max frequency')
    .replace(/\bBuilt-in graphic basic frequency\b/gi, 'Integrated graphics base frequency')
    .replace(/\bBuilt-in graphic\b/gi, 'Integrated graphics')
    // ── Catch user-reported bugs at the text-level too so multiLangSpecs.en
    //    (which goes through _sanitizeEnglishSpecText, NOT _sanitizeEnglishSpecMap)
    //    also gets these fixes. ─────────────────────────────────────────────
    .replace(/\bEyesafe\s*\(\s*food\s+certification\s*\)/gi, 'Eyesafe (eye health certification)')
    .replace(/\bfood\s+certification\b/gi, 'eye health certification')
    .replace(/\b12\/24h-display\b/gi, '12/24h format')
    .replace(/\b12\/24h-Anzeige\b/gi, '12/24h format')
    .replace(/\b(MIL-STD-\d+[A-Z]?)-certified\b/g, '$1 certified')
    .replace(/\b(MIL-STD-\d+[A-Z]?)-zertifiziert\b/g, '$1 certified')
    .replace(/\bDisplay\s+width\s+height\b/gi, 'Aspect ratio')
    .replace(/\bGPU\s+distance\b/gi, 'GPU process node')
    .replace(/^\/(?=Mobile|Gaming|Business)/i, 'Business/')
    .replace(/^Shareholders?$/i, '')
    // ── NEW (2026-05-24 turn-3) ──
    // Sabit Disk -> Hard disk / SSD (Argos: "Fixed Disk")
    .replace(/\bFixed\s+Disk\s*\(\s*SSD\s*\)\s*Type\b/gi, 'SSD type')
    .replace(/\bFixed\s+Disk\s*\(\s*HDD\s*\)\b/gi, 'Hard disk (HDD)')
    .replace(/\bFixed\s+Disk\b/gi, 'Hard disk')
    // Klavye Arka Aydınlatması -> Keyboard backlight (Argos: "Keyboard Rear Lighting")
    .replace(/\bKeyboard\s+Rear\s+Lighting\b/gi, 'Keyboard backlight')
    .replace(/\bRear\s+Lighting\b/gi, 'Backlight')
    .replace(/\b(?:Display\s+|Screen\s+)?(?:Width\s+Height|Genişlik\s+Yükseklik|Yükseklik\s+Genişlik)\s+(?:Ratio|Oranı)?\b/gi, 'Aspect ratio')
    // ── 2026-05-24 turn-4 (Samsung TV) ──────────────────────────────────
    // 'Karasal' (terrestrial broadcast) — pure TR word leaked verbatim
    .replace(/\bKarasal\s+Receiver\b/gi, 'Terrestrial receiver')
    .replace(/\bHD\s+Karasal\s+Receiver\b/gi, 'HD terrestrial receiver')
    .replace(/\bKarasal\b/g, 'Terrestrial')
    // 'Rehberi' (guide) — EPG context
    .replace(/\bProgram\s+Rehberi\s*\(\s*EPG\s*\)/gi, 'Program Guide (EPG)')
    .replace(/\bRehberi\b/g, 'Guide')
    .replace(/\bRehber\b/g, 'Guide')
    // Yesiable Refresh Rate — Argos took 'Var' out of 'Variable' and made
    // it 'Yes' then put 'iable' back. Catches both word and standalone.
    .replace(/\bYesiable\s+Refresh\s+Rate\b/gi, 'Variable refresh rate')
    .replace(/\bYesiable\b/g, 'Variable')
    // 'Save (pvr)' — TR 'Kaydetme' wrongly mapped to file-save
    .replace(/\bSave\s*\(\s*pvr\s*\)/gi, 'PVR Recording')
    .replace(/\bSave\s*\(\s*PVR\s*\)/g, 'PVR Recording')
    // Two Way Mirroring — keep as bi-directional
    .replace(/\bDisplay\s+Mirroring\s*\(\s*Two\s+Way\s*\)/gi, '2-way screen mirroring')
    .replace(/\bDisplay\s+Mirroring\b(?!\s*\()/gi, 'Screen mirroring')
    // "Main" as a standalone value when it's clearly NOT a brand context
    // (Audio output, Digital Audio Output, Sensors section, etc.).
    // We can't safely auto-rename "Main" everywhere because some contexts
    // legitimately use "Main". But the standalone TR "Ana" / "Dahili" leak
    // for sensor-type / output-mode rows is a known pattern: replace bare
    // "Main" → "Built-in" only when the value position is exactly "Main".
    // (Done at the _sanitizeEnglishSpecMap level — see below.)
    // Mevcut Bellek -> Memory layout / Memory configuration
    .replace(/\bAvailable\s+Memory\b/gi, 'Memory layout')
    // Toplam Bellek (Yuvası) -> Total memory slots
    .replace(/\bTotal\s+Memory\b(?!\s+(?:slots?|capacity|size))/gi, 'Total memory slots')
    // EKG (German/Turkish abbrev) -> ECG (English standard)
    .replace(/\bEKG\b/g, 'ECG')
    // Display Size: "16.0" (no unit) → keep as is — UI shows separately
    // Empty parens artifact: "720p ()" -> "720p"
    .replace(/(\b\d+p)\s*\(\s*\)/g, '$1')
    // Low Blue (orphan) -> "Low blue light"
    .replace(/\bLow\s+Blue\b(?!\s+light)/gi, 'Low blue light')
    // Optical Reader (Turkish "Optik Okuyucu") -> Optical drive
    .replace(/\bOptical\s+Reader\b/gi, 'Optical drive')
    // Card Reader features rename
    .replace(/\bCard\s+reader\s+features\b/gi, 'Card reader')
    // Endurance for bumps -> Drop test / Endurance rating
    .replace(/\bEndurance\s+for\s+bumps\b/gi, 'Drop test certified')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // CAPITALIZATION: first character upper (English convention for spec labels).
  if (out && /^[a-z]/.test(out) && !/^(?:[gma]?USB|[ie]?Phone|i[A-Z]|nano|micro|pro|max|m[Aa]h)/.test(out)) {
    out = out[0].toUpperCase() + out.slice(1);
  }
  return out;
}

function _sanitizeEnglishSpecMap(map) {
  if (!map || typeof map !== 'object') return map || {};
  const out = {};
  const context = Object.entries(map)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const inferredProcessorBrand = /\bAMD\s+Ryzen\b|\bRyzen\b/i.test(context)
    ? 'AMD'
    : (/\bIntel\s+Core\b|\bCore\s+Ultra\b|\bIntel\b/i.test(context) ? 'Intel' : '');
  // Detect dominant GPU brand from context to clean stray "North"
  const inferredGpuBrand = /\bGeForce\b|\bRTX\b|\bGTX\b|\bNVIDIA\b/i.test(context)
    ? 'NVIDIA'
    : (/\bRadeon\b|\bRX\b/i.test(context) ? 'AMD' : 'NVIDIA');
  for (const [k, v] of Object.entries(map)) {
    let nk = _sanitizeEnglishSpecText(k, k);
    let nv = _sanitizeEnglishSpecText(v, v);
    const rawValue = String(v ?? '').trim();
    // Brand value coercion: NVIDIA mistranslations
    if (/^(?:GPU\s+brand|Graphics\s+brand|Display\s+chip\s+brand)$/i.test(nk) && /^(?:North|Main)$/i.test(rawValue)) {
      nv = inferredGpuBrand;
    }
    if (/^(?:Processor\s+brand|CPU\s+brand)$/i.test(nk) && /^(?:Main|North)$/i.test(rawValue)) {
      nv = inferredProcessorBrand || 'Intel';
    }
    // Generic 'Main' value coercion: when the SPEC KEY refers to a feature
    // that has Var/Yok/Yes/No semantics (Smart, Sensors, Built-in receivers,
    // Audio output type), Argos sometimes emits 'Main' for TR 'Dahili'/'Ana'.
    // For those keys we coerce 'Main' value to 'Built-in' (or 'Yes' when the
    // key is a binary feature flag like '3D').
    if (/^Main$/i.test(rawValue)) {
      if (/^(?:Digital\s+Audio\s+Output|Audio\s+Output|Output|Receiver|Tuner|Antenna|Input|Smart|Internal|Built-in)/i.test(nk)) {
        nv = 'Built-in';
      } else if (/^(?:3D|HDR|HbbTV|PVR|Smart\s*TV|HDMI|USB|Wi-?Fi|Bluetooth|NFC|GPS|Camera|Sensor|Network)$/i.test(nk)) {
        nv = 'Yes';
      }
    }
    if (/^Product purpose$/i.test(nk) && /^Game$/i.test(rawValue)) nv = 'Gaming';
    if (/^Product family$/i.test(nk) && /^Monster hunter$/i.test(rawValue)) nv = 'Monster';
    // Drop the bogus "Shareholder" spec entirely — Argos hallucinates this
    // from "Standart"-style military-grade rating atoms; the actual info is
    // already in the adjacent "Endurance Standard" / "MIL-STD" row.
    if (/^(?:Shareholder|Shareholders|Shareholding)$/i.test(nk)) continue;
    // "/Mobile" or "Game/Mobile" leading slash artifact -> normalize
    if (typeof nv === 'string' && /^\/\w/.test(nv)) nv = 'Business' + nv;
    // 12/24h-display -> 12/24h format (DE source artifact survives the dash)
    nv = String(nv).replace(/\b12\/24h-display\b/gi, '12/24h format');
    // Aspect ratio normalization: "Display width height" -> "Aspect ratio"
    if (/^(?:Display\s+width\s+height|Display\s+aspect\s+ratio\s+\(aspect\s+ratio\)|Aspect\s+ratio\s+\(aspect\s+ratio\))$/i.test(nk)) nk = 'Aspect ratio';
    // "GPU distance" lost a word: it's the process node
    if (/^GPU\s+distance$/i.test(nk)) nk = 'GPU process node';
    if (/^Transistor\s+distance$/i.test(nk)) nk = 'Process node';
    // Eyesafe absurdities: Argos sometimes maps "sağlığı" to "food"
    if (typeof nv === 'string') {
      nv = nv.replace(/\bEyesafe\s*\(\s*food\s+certification\s*\)/gi, 'Eyesafe (eye health certification)')
             .replace(/\bfood\s+certification\b/gi, 'eye health certification');
    }
    if (!nk || !nv) continue;
    out[_uniqueSpecKey(out, nk)] = nv;
  }
  return out;
}

function _sanitizeEnglishSectionMap(sections) {
  if (!sections || typeof sections !== 'object') return sections || {};
  const out = {};
  for (const [section, body] of Object.entries(sections)) {
    const ns = _sanitizeEnglishSpecText(section, section) || 'General';
    out[ns] = _sanitizeEnglishSpecMap(body || {});
  }
  return out;
}

function _sanitizeEnglishTranslationMap(map, inferredProcessorBrand = '') {
  if (!map || typeof map !== 'object') return map || {};
  const out = {};
  for (const [source, tx] of Object.entries(map)) {
    let clean = (tx && typeof tx === 'object')
      ? _sanitizeEnglishSpecText(source, source)
      : _sanitizeEnglishSpecText(tx, source);
    const rawSource = String(source || '').trim();
    const rawTx = String(tx == null ? '' : tx).trim();
    if (_isProtectedTechnicalAtom(rawSource)) {
      if (/^(North|Main)$/i.test(rawTx) || !clean || clean !== rawSource) clean = rawSource;
    }
    if (/^NVIDIA$/i.test(rawSource) && /^North$/i.test(clean)) clean = 'NVIDIA';

    // GENERAL BRAND-VALUE FIX: when the source LOOKS like a brand spec key
    // (contains "brand", "marka", "üretici", "manufacturer") AND the value
    // is "North" or "Main", infer the correct brand from context. Argos
    // consistently mistranslates NVIDIA -> "North" and Intel/AMD -> "Main".
    if (/^North$/i.test(clean) && /(?:^|\s)(?:brand|marka(?:s[ıi])?|marca|marke|producer|manufacturer|üretici|uretici|gpu)(?:\s|$)/i.test(rawSource)) {
      clean = 'NVIDIA';
    }
    if (/^Main$/i.test(clean) && /(?:^|\s)(?:brand|marka(?:s[ıi])?|işlemci|cpu|processor)(?:\s|$)/i.test(rawSource)) {
      clean = inferredProcessorBrand || 'Intel';
    }
    // Standalone bare "North"/"Main" anywhere in translation map values is
    // ALWAYS a sanitizer miss for a brand atom; coerce to NVIDIA/Intel.
    if (/^North$/i.test(clean)) clean = 'NVIDIA';
    if (/^Main$/i.test(clean)) clean = inferredProcessorBrand || 'Intel';

    if (clean) out[source] = clean;
  }
  return out;
}

function _sanitizeEnglishPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  payload.specs = _sanitizeEnglishSpecMap(payload.specs || {});
  payload.specSections = _sanitizeEnglishSectionMap(payload.specSections || {});
  payload.specsEn = _sanitizeEnglishSpecMap(payload.specsEn || payload.specs || {});
  payload.keySpecs = _sanitizeEnglishSpecMap(payload.keySpecs || {});
  payload.multiLangSpecs = payload.multiLangSpecs && typeof payload.multiLangSpecs === 'object'
    ? { ...payload.multiLangSpecs }
    : {};
  payload.multiLangSections = payload.multiLangSections && typeof payload.multiLangSections === 'object'
    ? { ...payload.multiLangSections }
    : {};
  // Infer the right processor brand from the full payload context so the
  // translation map can rewrite stray "Main"/"North" values.
  const ctxString = JSON.stringify(payload.specs || {}) + ' ' + JSON.stringify(payload.specsEn || {});
  const inferredCpu = /\bAMD\s+Ryzen\b|\bRyzen\b/i.test(ctxString) ? 'AMD'
    : (/\bIntel\b|\bCore\s+Ultra\b/i.test(ctxString) ? 'Intel' : '');
  payload.multiLangSpecs.en = _sanitizeEnglishTranslationMap(payload.multiLangSpecs.en || payload.specs || {}, inferredCpu);
  payload.multiLangSections.en = _sanitizeEnglishTranslationMap(payload.multiLangSections.en || payload.specSections || {}, inferredCpu);
  return payload;
}

function _walkEnglishPayloadStrings(value, path, out) {
  if (value == null) return out;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    out.push({ path, value: String(value) });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => _walkEnglishPayloadStrings(v, `${path}[${i}]`, out));
    return out;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push({ path: `${path}.{key}`, value: String(k) });
      _walkEnglishPayloadStrings(v, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

function _englishPayloadResidues(payload) {
  const roots = {
    specs: payload?.specs || {},
    specSections: payload?.specSections || {},
    specsEn: payload?.specsEn || {},
    keySpecs: payload?.keySpecs || {},
  };
  const entries = _walkEnglishPayloadStrings(roots, '', []);
  for (const [source, value] of Object.entries(payload?.multiLangSpecs?.en || {})) {
    _walkEnglishPayloadStrings(value, `multiLangSpecsEn.${source}`, entries);
  }
  for (const [source, value] of Object.entries(payload?.multiLangSections?.en || {})) {
    _walkEnglishPayloadStrings(value, `multiLangSectionsEn.${source}`, entries);
  }
  const residueRe = /[çğıİöşüÇĞŞÜÖ]|\b(?:Azami|Polimer|Polimerli|Sağlığı|Sağlık|Sertifikasyonu|Sertifikasyon|Sertifikasi|Sertifikası|Monster hunter|Keyboard back lighting|Virtual core|Transistor distance|Productivity check\.[a-z]+ frequency|Processor increased frequency|Built-in graphic|Hard disk \(SSD\) type|Increased memory|Heat spread capacity|Ozellik(?:leri|leriri)?|Bellek\b|Boyut(?:u|lari|lar)?|Sayisi|Sayisi|Cozunurluk(?:u)?|Cozunurlugu|Genisligi|Yuksekligi|Derinligi|Agirligi|Hizi|Hizli|Sicakligi|Kalitesi|Frekansi|Frekans(?:i)?|Cekirdek|Cekirdegi|Cekirdekleri|Islemci(?:si)?|Sertifikali|Sertifikadan|Cikis(?:i)?|Cikar(?:ilabilir|tilabilir)|Aydinlatma(?:li)?|Goz\b|Sertifika|Performans(?:i)?|Verimlilik(?:i)?)\b/i;
  return entries.filter(({ value }) => {
    const s = String(value || '').trim();
    if (!s) return false;
    const probe = s.replace(/\bTÜV\b/g, 'TUV');
    if (/^North$/i.test(s)) return true;
    return residueRe.test(probe);
  });
}

function _assertCleanEnglishPayload(payload, label = 'product') {
  _sanitizeEnglishPayload(payload);
  const residues = _englishPayloadResidues(payload);
  if (residues.length) {
    const sample = residues.slice(0, 8).map(r => `${r.path}: ${r.value}`).join(' | ');
    throw new Error(`English spec residue after final sanitizer (${label}): ${sample}`);
  }
  return payload;
}

// Lookup Turkish text in cache for a specific target language.
// Stale pass-through entries are filtered out at load time, so a cache hit
// here is always honoured (no second-guessing → no infinite retry loop).
function _deDictLookup(turkishText, targetLang) {
  const key = _normalizeDictSourceKey(turkishText);
  const rule = _knownTurkishRuleTranslation(turkishText, targetLang);
  if (rule) {
    _deDictStore(turkishText, targetLang, rule);
    return _deDictCache[key]?.[targetLang] || rule;
  }
  const entry = _deDictCache[key];
  if (entry && entry[targetLang]) {
    const normalized = _normalizeTurkishSourceTranslation(turkishText, targetLang, entry[targetLang]);
    if (_translationHasTurkishResidue(targetLang, normalized, turkishText)) {
      delete entry[targetLang];
      _deDictDirty = true;
      return null;
    }
    // Argos output validation (Seçenek B): if cached translation matches a
    // known-bad Argos hallucination, evict it and log for review. Caller
    // gets null and will render the source text as a safe fallback.
    if (targetLang !== 'tr' && _isArgosOutputBad(normalized)) {
      _logRejectedAtom(turkishText, normalized, targetLang);
      delete entry[targetLang];
      _deDictDirty = true;
      return null;
    }
    if (normalized !== entry[targetLang]) {
      entry[targetLang] = normalized;
      _deDictDirty = true;
    }
    return normalized;
  }
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
  'DISPLAYPORT','MINI-DISPLAYPORT','THUNDERBOLT','ETHERNET','RJ45','VGA','DVI',
  'HDCP','ARC','EARC','DSC','VRR','ALLM','HFR','NIT','NITS','NTSC',
  'DCI-P3','SRGB','ADOBE','DOLBY','DTS','HI-RES','HIRES','TWS',
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
  if (!/[a-zA-ZÀ-ÿığşçöüİĞŞÇÖÜ]/.test(s)) return false;
  if (/^\d{8,14}$/.test(s)) return false; // GTIN/EAN/UPC
  if (/^[\d\s.,:+/()°%'"-]+$/.test(s)) return false;
  if (/^(ean|gtin|upc|mpn|sku|id)$/i.test(s)) return false;

  // If EVERY token in the atom is a preserve-token (acronym, unit, model
  // code, pure number), skip — there is nothing to translate. Otherwise the
  // atom is fair game: even "1000 Döngü" has the non-preserve word "Döngü"
  // and must reach the translator. "63 hours 4 minutes" has "hours" /
  // "minutes" — same logic.
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length && tokens.every(t => _shouldPreserve(t.replace(/^[^\w]+|[^\w]+$/g, '')))) {
    return false;
  }

  // Pure model-code strings such as "SM-S918BZKQXSP" or "0/1/10 (B550)"
  // are better preserved verbatim.
  const compact = s.replace(/[\s._/-]+/g, '');
  if (/[A-Z]/.test(s) && /\d/.test(s) && compact.length <= 32 && /^[A-Z0-9]+$/i.test(compact)) {
    return false;
  }
  return true;
}

function _shouldTranslateProductName(name) {
  const s = String(name || '').trim();
  if (!s) return false;
  // Product names are usually brand/model identifiers and should stay as-is
  // across languages. Only spend AI budget when the name actually contains
  // Turkish wording such as "akıllı saat" or "oyuncu monitörü".
  if (/[çğıöşüÇĞİÖŞÜ]/.test(s)) return true;
  return /\b(akilli|akıllı|oyuncu|kablolu|kablosuz|sarj|şarj|kulaklik|kulaklık|telefon|saat|monitor|monitör|kamera|yazici|yazıcı)\b/i.test(s);
}

const _TECH_PROTECTED_TERMS = new Set([
  'DISPLAYPORT','MINI-DISPLAYPORT','USB','USB-C','HDMI','THUNDERBOLT','ETHERNET',
  'WI-FI','WIFI','BLUETOOTH','NFC','LTE','OLED','AMOLED','QLED','LCD','LED',
  'HDR','HDR10','HDR10+','DOLBY','DTS','PCIE','PCI-E','UFS','SSD','HDD','RAM',
  'ROM','CPU','GPU','IP68','IP67','IP69','DCI-P3','SRGB','ADOBE','RTX','GTX'
]);

function _escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _shouldProtectTranslatorToken(token) {
  const core = String(token || '').trim();
  if (!core) return false;
  const up = core.toUpperCase();
  if (_TECH_PROTECTED_TERMS.has(up)) return true;
  if (_shouldPreserve(core)) return true;
  if (/[A-Z]/.test(core) && /[a-z]/.test(core) && /[A-Z].*[A-Z]/.test(core)) return true; // DisplayPort-style camel tech terms
  return false;
}

function _protectTranslatorText(text) {
  const restore = [];
  let n = 0;
  const protectedText = String(text || '').replace(/[A-Za-z][A-Za-z0-9.+#/-]*/g, (token) => {
    if (!_shouldProtectTranslatorToken(token)) return token;
    const placeholder = `ZXQOR${n++}ZX`;
    restore.push([placeholder, token]);
    return placeholder;
  });
  return { text: protectedText, restore };
}

function _restoreTranslatorText(translated, restore) {
  let out = String(translated || '');
  for (const [placeholder, original] of restore || []) {
    out = out.replace(new RegExp(_escapeRegExp(placeholder), 'gi'), original);
  }
  return out;
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
  const key = _normalizeDictSourceKey(turkishText);
  if (!_isWordOnlyDictSource(key)) return;
  const cleaned = _normalizeTurkishSourceTranslation(turkishText, targetLang, translation);
  if (_translationHasTurkishResidue(targetLang, cleaned, turkishText)) return;
  // Argos output validation: reject bad outputs at storage time so they
  // NEVER enter the cache. The atom will fall back to source text in UI.
  if (targetLang !== 'tr' && _isArgosOutputBad(cleaned)) {
    _logRejectedAtom(turkishText, cleaned, targetLang);
    return;
  }
  const normalized = _applyTitleCase(cleaned);
  if (!normalized) return;
  if (!_deDictCache[key]) _deDictCache[key] = {};
  if (_deDictCache[key][targetLang] !== normalized) {
    _deDictCache[key][targetLang] = normalized;
    _deDictFailedThisRun.delete(key);
    _deDictDirty = true;
  }
}

const _LOCAL_TRANSLATE_LANGS = new Set(['tr','en','de','es','fr','pt','ru']);
let _localTranslateDisabledUntil = 0;

function _localTranslationLooksUseful(sourceText, targetLang, translation) {
  // Accept Argos output, including pass-through: the atom may already be in
  // the target language (e.g. "Resolution" stored under a TR source key is
  // legitimately "Resolution" in EN). Rejecting pass-through made the
  // pipeline fall back to DeepSeek for ~90% of atoms, blowing latency and
  // cost. Only reject empty output and a few NLLB-era garbage patterns.
  const src = String(sourceText || '').trim();
  const tx = String(translation || '').trim();
  if (!tx) return false;
  if (tx.length > Math.max(120, src.length * 6)) return false; // bizarre expansion
  if (/\b(other, of a kind|manufacture of goods|among the|services)\b/i.test(tx)) return false;
  if (_translationHasTurkishResidue(targetLang, _normalizeTurkishSourceTranslation(sourceText, targetLang, tx), sourceText)) return false;
  return true;
}

async function _localTranslateAllLangsBatch(sourceTexts, targetLangs, onProgress, opts = {}) {
  const now = Date.now();
  if (now < _localTranslateDisabledUntil) {
    if (typeof onProgress === 'function') {
      try { onProgress({ provider: 'local-nllb', phase: 'skipped', pass: 0, chunkIndex: 0, totalChunks: 0, batchSize: sourceTexts.length, reason: 'cooldown' }); } catch {}
    }
    return { ok: false, skipped: true };
  }
  const from = opts.from || 'tr';
  const langs = targetLangs.filter(l => _LOCAL_TRANSLATE_LANGS.has(l) && l !== from);
  if (!langs.length) return { ok: true, stored: 0 };

  const uncached = [...new Set(sourceTexts.filter(_shouldTranslateAtom))]
    .filter(t => langs.some(l => !_deDictLookup(t, l)));
  if (!uncached.length) return { ok: true, stored: 0 };
  if (typeof onProgress === 'function') {
    try { onProgress({ provider: 'local-nllb', phase: 'start', pass: 0, chunkIndex: 0, totalChunks: Math.ceil(uncached.length / Math.max(1, Math.min(250, opts.chunkSize || 120))), batchSize: uncached.length, sample: uncached.slice(0, 3) }); } catch {}
  }

  // Larger default chunk + parallel chunk dispatch. The Argos worker batches
  // internally up to BATCH_SIZE=64 and uses a ThreadPoolExecutor across
  // target langs, so 3 concurrent HTTP requests keep its pipeline saturated
  // without saturating CTranslate2's GPU queue. With chunk=180 + parallel=3
  // we move ~540 atoms in flight at a time — typical 5K-product run that
  // used to take 90s of translate idle drops to ~30s.
  const CHUNK = Math.max(1, Math.min(250, opts.chunkSize || 180));
  const PARALLEL = Math.max(1, Math.min(4, opts.parallelChunks || 3));
  const totalChunks = Math.ceil(uncached.length / CHUNK);
  let storedTotal = 0;
  let aborted = false;
  let firstError = null;
  const report = (phase, idx, extra) => {
    if (typeof onProgress !== 'function') return;
    try { onProgress({ provider: 'local-nllb', phase, pass: 0, chunkIndex: idx, totalChunks, chunkSize: CHUNK, ...extra }); } catch {}
  };

  const chunks = [];
  for (let i = 0; i < uncached.length; i += CHUNK) {
    chunks.push({ idx: Math.floor(i / CHUNK), batch: uncached.slice(i, i + CHUNK) });
  }

  const processOne = async ({ idx: chunkIdx, batch }) => {
    if (aborted) return;
    const started = Date.now();
    report('chunk-start', chunkIdx, { batchSize: batch.length, sample: batch.slice(0, 3) });
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs || 180000);
    try {
      const response = await fetch(LOCAL_TRANSLATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, texts: batch, to: langs }),
        signal: ac.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        throw new Error(data.detail || data.error || 'local_translate_failed');
      }
      let storedForChunk = 0;
      const translations = data.translations || {};
      const residueSet = new Set(Array.isArray(data.residueAtoms) ? data.residueAtoms : []);
      for (const t of batch) {
        const entry = translations[t];
        if (!entry || typeof entry !== 'object') continue;
        for (const lang of langs) {
          if (typeof entry[lang] === 'string' && _localTranslationLooksUseful(t, lang, entry[lang])) {
            _deDictStore(t, lang, entry[lang]);
            storedForChunk++;
          }
        }
      }
      storedTotal += storedForChunk;
      if (residueSet.size) {
        _localResidueBuffer = _localResidueBuffer || new Set();
        for (const t of residueSet) _localResidueBuffer.add(t);
      }
      report('chunk-done', chunkIdx, {
        batchSize: batch.length,
        stored: storedForChunk,
        dictSize: Object.keys(_deDictCache).length,
        elapsedMs: Date.now() - started,
        residue: residueSet.size,
      });
    } catch (e) {
      _localTranslateDisabledUntil = Date.now() + 5000;
      report('chunk-error', chunkIdx, { error: e.message || String(e), elapsedMs: Date.now() - started });
      if (!firstError) firstError = e;
      aborted = true;
    } finally {
      clearTimeout(timer);
    }
  };

  // Run chunks with bounded parallelism — PARALLEL workers pull from a shared
  // queue. First error sets `aborted` and the rest no-op out fast.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, chunks.length) }, async () => {
      while (cursor < chunks.length && !aborted) {
        const c = chunks[cursor++];
        await processOne(c);
      }
    })
  );
  if (aborted && firstError) {
    return { ok: false, error: firstError.message || String(firstError), stored: storedTotal };
  }
  if (storedTotal > 0) await _saveDeDict().catch(() => {});
  const residue = _localResidueBuffer ? [..._localResidueBuffer] : [];
  _localResidueBuffer = null;
  return { ok: true, stored: storedTotal, residueAtoms: residue };
}

// Module-level buffer for residue atoms aggregated across chunks of a single
// _localTranslateAllLangsBatch call. Cleared at the end of that call.
let _localResidueBuffer = null;

// ── Public dictionary API (used by the Dictionary admin tab) ────────────
//
// Browser globals — keep them lean and explicit so the UI module doesn't
// reach into private internals. `forceSave` bypasses the dirty flag so the
// admin can persist edits even if no _deDictStore call was made (e.g. the
// admin only edited an existing entry).
window.QorAiDict = {
  ...(_staticQorAiDict || {}),
  load:    () => _loadDeDict(),
  cache:   () => _deDictCache,
  size:    () => Object.keys(_deDictCache).length,
  isDirty: () => _deDictDirty,
  set:     (turkishText, lang, translation) => _deDictStore(turkishText, lang, translation),
  remove:  (turkishText) => {
    const key = String(turkishText || '').toLowerCase().trim();
    if (_deDictCache[key]) { delete _deDictCache[key]; _deDictDirty = true; }
  },
  save:    () => { _deDictDirty = true; return _saveDeDict(); },
  langs:   () => SUPPORTED_LANGS,
  resetFailures: () => _deDictFailedThisRun.clear(),

  /**
   * Sweep the entire local dict cache, re-run normalize + residue detection,
   * and DELETE every entry that still has Turkish residue. Call this from
   * DevTools after pulling new POST_FIX rules:
   *   await QorAiDict.purgeBad()
   * Returns { scanned, fixed, deleted }.
   */
  async purgeBad() {
    await _loadDeDict();
    let scanned = 0, fixed = 0, deleted = 0;
    for (const [key, entry] of Object.entries(_deDictCache)) {
      if (!entry || typeof entry !== 'object') continue;
      for (const lang of Object.keys(entry)) {
        if (lang === 'tr') continue;
        scanned++;
        const v = entry[lang];
        if (typeof v !== 'string') continue;
        const normalized = _normalizeTurkishSourceTranslation(key, lang, v);
        if (_translationHasTurkishResidue(lang, normalized, key)) {
          delete entry[lang];
          deleted++;
        } else if (normalized !== v) {
          entry[lang] = normalized;
          fixed++;
        }
      }
      if (Object.keys(entry).length === 0) delete _deDictCache[key];
    }
    _deDictDirty = true;
    await _saveDeDict();
    const msg = `[QorAiDict.purgeBad] scanned=${scanned} · normalized=${fixed} · deleted=${deleted}`;
    console.log(msg);
    if (typeof toast === 'function') toast(msg, deleted ? 'w' : 's');
    return { scanned, fixed, deleted };
  },

  /** Nuclear: wipe the entire local dict cache. Forces full re-translation
   *  on next scrape. Use when you want a guaranteed clean slate. */
  async purgeAll() {
    await _loadDeDict();
    const count = Object.keys(_deDictCache).length;
    for (const key of Object.keys(_deDictCache)) delete _deDictCache[key];
    _deDictDirty = true;
    await _saveDeDict();
    const msg = `[QorAiDict.purgeAll] deleted ${count} entries`;
    console.log(msg);
    if (typeof toast === 'function') toast(msg, 's');
    return { deleted: count };
  },
};

// Batch translate Turkish texts → ALL target languages in ONE DeepSeek call.
// Response shape: { "turkish text": { en: "...", de: "...", ... }, ... }
// One round-trip per atom covers all 6 target languages (TR is the source).
// The longer list of language names that used to live here (it/ja/nl/pl/sv/ar)
// is gone — those target geographies are not part of the active rollout and
// translating into them only burns dictionary cache for languages no
// downstream UI ever renders.
const _LANG_NAMES = {
  tr: 'Turkish', en: 'English', de: 'German', es: 'Spanish', fr: 'French', pt: 'Portuguese', ru: 'Russian'
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

async function _deepSeekAllLangsBatch(germanTexts, targetLangs, onProgress, shouldAbort, opts = {}) {
  const token = getPb()?.authStore?.token;
  if (!token) {
    console.warn('[tr-translate] No auth token');
    return {};
  }

  // Build the set of (text, lang) pairs that are NOT in cache yet
  const missingByText = new Map(); // text → Set<lang>
  for (const t of germanTexts.filter(_shouldTranslateAtom)) {
    if (_deDictFailedThisRun.has(_normalizeDictSourceKey(t))) continue;
    const missing = targetLangs.filter(l => !_deDictLookup(t, l));
    if (missing.length) missingByText.set(t, missing);
  }
  if (missingByText.size === 0) return; // everything cached — no API hit

  let uncached = [...missingByText.keys()];
  if (!uncached.length) return;
  const local = await _localTranslateAllLangsBatch(uncached, targetLangs, onProgress, { from: 'tr' });
  uncached = uncached.filter(t => targetLangs.some(l => !_deDictLookup(t, l)));
  if (!uncached.length) {
    await _saveDeDict();
    return;
  }
  // Hybrid fallback: when Argos succeeds, only the atoms it left as residue
  // (source-language fragments detected by the worker) fall through to
  // DeepSeek. Clean atoms — typically 95%+ of every product — skip the
  // API hop entirely. This keeps per-product latency low while AI still
  // catches the handful Argos can't translate, so we don't need a manual
  // post-fix rule for every new word.
  if (local.ok) {
    // DeepSeek is a REMOTE API — it cannot use the local GPU. Per user request
    // (2026-05-24): skip DeepSeek entirely. Argos+beam=4+POST_FIX glossary
    // covers 99% cleanly; the last 1% gets fixed by adding POST_FIX entries
    // on the fly. Latency saved: 60-90s per product on failed DeepSeek calls.
    for (const t of uncached) _deDictFailedThisRun.add(_normalizeDictSourceKey(t));
    await _saveDeDict();
    if (typeof onProgress === 'function') {
      try { onProgress({ provider: 'local-nllb', phase: 'fallback-skipped', pass: 0, chunkIndex: 0, totalChunks: 0, batchSize: uncached.length, sample: uncached.slice(0, 3), reason: 'deepseek-disabled' }); } catch {}
    }
    return;
  }
  const langCodes = targetLangs.join(',');
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const isRateLimit = (msg) => /rate|limit|300 requests|try later/i.test(String(msg || ''));

  async function runPass(passNo, passAtoms, CHUNK, CONCURRENCY) {
    const totalChunks = Math.ceil(passAtoms.length / CHUNK);
    const report = (phase, idx, extra) => {
      if (typeof onProgress !== 'function') return;
      try { onProgress({ provider: 'deepseek', phase, pass: passNo, chunkIndex: idx, totalChunks, chunkSize: CHUNK, ...extra }); } catch {}
    };

    const jobs = [];
    for (let i = 0; i < passAtoms.length; i += CHUNK) {
      jobs.push({ chunkIdx: Math.floor(i / CHUNK), batch: passAtoms.slice(i, i + CHUNK) });
    }

    async function processChunk(chunkIdx, batch) {
      if (typeof shouldAbort === 'function' && shouldAbort()) {
        report('chunk-error', chunkIdx, { error: 'aborted', elapsedMs: 0 });
        return;
      }
      report('chunk-start', chunkIdx, { batchSize: batch.length, sample: batch.slice(0, 3) });
      const chunkStart = Date.now();
      const textsJson = JSON.stringify(batch);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch(LOCAL_DEEPSEEK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: DEEPSEEK_MODEL,
              messages: [
                {
                  role: 'system',
                  content: `You are a technical product specification translator. For each Turkish, English, or mixed-language tech spec term, return a JSON object mapping the original text to translations in the following languages: ${langCodes}.
Rules:
- Keep numbers, units, sizes and technical abbreviations unchanged (e.g. "5G", "Wi-Fi 6E", "120 Hz", "GB", "mm").
- Product names / brand names stay as-is.
- If the requested target language is the same as the input language, return the clean original text for that language.
- Translate Turkish warranty/support phrases such as "6 Yıl Güvenlik Güncellemesi Garantisi" into natural English/German/etc.; do not leave them in Turkish.
- Preserve newlines (\\n) inside multi-line values.
- Return ONLY a single JSON object of the form:
  {"<source text>": {"en":"...", "de":"...", "es":"...", ...}, ...}
- The inner object MUST contain exactly these language codes: ${langCodes}.`
                },
                {
                  role: 'user',
                  content: `Translate these ${batch.length} product specification terms into ${targetLangs.length} languages (${langCodes}):\n${textsJson}\n\nReturn only the JSON object.`
                }
              ],
              max_tokens: 8000,
              temperature: 0.1,
              response_format: { type: 'json_object' }
            })
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok || data.error) {
            const detail = data.message || data.error || data.detail || 'DeepSeek API error';
            throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
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
          if (storedForChunk === 0) {
            throw new Error('DeepSeek returned no usable translations');
          }
          let pbSaved = true;
          if (storedForChunk > 0) {
            pbSaved = false;
            for (let saveAttempt = 0; saveAttempt < 4; saveAttempt++) {
              await _saveDeDict();
              if (!_deDictDirty) { pbSaved = true; break; }
              await sleep(1000 + saveAttempt * 1500);
            }
          }
          report('chunk-done', chunkIdx, {
            batchSize: batch.length,
            stored: storedForChunk,
            dictSize: Object.keys(_deDictCache).length,
            pbSaved,
            elapsedMs: Date.now() - chunkStart,
          });
          return;
        } catch (e) {
          const msg = e.message || (typeof e === 'string' ? e : JSON.stringify(e));
          if (attempt === 0 && isRateLimit(msg)) {
            report('chunk-error', chunkIdx, { error: `${msg} · waiting 305s then retrying`, elapsedMs: Date.now() - chunkStart });
            await sleep(305000);
            continue;
          }
          console.warn('[tr-translate] all-langs batch error:', msg);
          report('chunk-error', chunkIdx, { error: msg, elapsedMs: Date.now() - chunkStart });
          return;
        }
      }
    }

    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        if (typeof shouldAbort === 'function' && shouldAbort()) break;
        const job = jobs[cursor++];
        await processChunk(job.chunkIdx, job.batch);
      }
    });
    await Promise.all(workers);
    await _saveDeDict();
  }

  const passes = (Array.isArray(opts.passes) && opts.passes.length) ? opts.passes : [
    { size: 40, concurrency: 3 },
    { size: 25, concurrency: 2 },
    { size: 12, concurrency: 1 },
  ];
  for (let pass = 0; pass < passes.length; pass++) {
    const current = uncached.filter(t => targetLangs.some(l => !_deDictLookup(t, l)));
    if (!current.length) break;
    await runPass(pass + 1, current, passes[pass].size, passes[pass].concurrency);
  }
  const remaining = uncached.filter(t => targetLangs.some(l => !_deDictLookup(t, l)));
  for (const t of remaining) _deDictFailedThisRun.add(_normalizeDictSourceKey(t));

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
    if (t.includes('\n')) {
      for (const line of t.split('\n')) {
        const tl = line.trim();
        if (tl) allGermanTexts.add(tl);
      }
      return;
    }
    allGermanTexts.add(t);
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
  if (!_shouldTranslateProductName(germanName)) {
    return Object.fromEntries(targetLangs.map(lang => [lang, germanName]));
  }
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
// build per-product multiLangSpecs / multiLangSections / nameTranslated from
// dictionary lookups only — no further API calls. This is the engine behind
// the Dictionary tab's "Translate Category" panel.
function _isEpeyTranslateProduct(p) {
  return /epey/i.test(String(p?.source || p?.sourceUrl || ''));
}

function _translationSourceProduct(p) {
  if (!_isEpeyTranslateProduct(p)) return p;
  const sourceLang = String(p?.sourceLang || '').toLowerCase();
  if (sourceLang !== 'tr') return p;
  const specs = p.sourceSpecs && typeof p.sourceSpecs === 'object' ? p.sourceSpecs : p.specs;
  const specSections = p.sourceSpecSections && typeof p.sourceSpecSections === 'object' ? p.sourceSpecSections : p.specSections;
  const keySpecs = p.sourceKeySpecs && typeof p.sourceKeySpecs === 'object' ? p.sourceKeySpecs : p.keySpecs;
  return { ...p, specs: specs || {}, specSections: specSections || {}, keySpecs: keySpecs || {} };
}

function _collectAtomsFromProduct(p, sink) {
  if (!_isEpeyTranslateProduct(p)) return;
  const add = (t) => {
    const s = String(t || '').trim();
    if (!s) return;
    if (s.includes('\n')) {
      for (const line of s.split('\n')) {
        const l = line.trim();
        if (l) sink.add(l);
      }
      return;
    }
    sink.add(s);
  };
  if (_shouldTranslateProductName(p.name)) add(p.name);

  // Only translate product name + Epey spec content. Category names and
  // scraper metadata are intentionally left out so this panel stays fast.
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
  if (!_isEpeyTranslateProduct(p)) {
    return { multiLangSpecs: {}, multiLangSections: {}, nameTranslated: {} };
  }

  // For each lang, build flat source→localized map covering only Epey spec
  // keys/values and atomized sub-lines, plus the product name.
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
    for (const body of Object.values(p.specSections || {})) {
      if (body && typeof body === 'object') {
        for (const [k, v] of Object.entries(body)) {
          addToMap(k);
          const vs = String(v);
          addToMap(vs);
          if (vs.includes('\n')) for (const line of vs.split('\n')) addToMap(line);
        }
      }
    }
    multiLangSpecs[lang] = map;

    const secMap = {};
    for (const secName of Object.keys(p.specSections || {})) {
      secMap[secName] = _deDictLookup(secName, lang) || secName;
    }
    multiLangSections[lang] = secMap;

    nameTranslated[lang] = _shouldTranslateProductName(p.name) ? (_deDictLookup(p.name, lang) || p.name) : p.name;
  }
  return { multiLangSpecs, multiLangSections, nameTranslated };
}

// Inline per-product translation hook used by the scraper save path.
// Idempotent: re-running on an already-translated product is cheap because
// every atom hits the dictionary cache.
//
// Flow per product:
//   1. Make sure the dictionary is loaded once per session.
//   2. Collect translatable atoms (spec keys, values, name, sub-lines).
//   3. Ask DeepSeek for whatever atoms are still missing — chunked.
//      Translation failures DO NOT block the save: a partial
//      multiLangSpecs is acceptable; missing langs fall back to TR.
//   4. Build the multiLangSpecs / multiLangSections / nameTranslated maps
//      from the (now warmer) dictionary and merge them into the product.
async function _translateProductInline(product) {
  if (!product) return product;
  const productLabel = String(product.name || product.slug || '?').slice(0, 60);
  try {
    if (!_isEpeyTranslateProduct(product)) return product;
    const startedAt = Date.now();
    xlog(`▶ ${productLabel} — sözlük yükleniyor`, 'info');
    await _loadDeDict();
    const sink = new Set();
    const translationSource = _translationSourceProduct(product);
    _collectAtomsFromProduct(translationSource, sink);
    const unique = [...sink].filter(_shouldTranslateAtom);
    let missing = unique.filter(
      t => !_deDictFailedThisRun.has(_normalizeDictSourceKey(t)) &&
        TARGET_LANGS.some(l => !_deDictLookup(t, l))
    );
    const sharedWaits = [...new Set(
      missing
        .map(t => _deDictInflight.get(_normalizeDictSourceKey(t)))
        .filter(Boolean)
    )];
    if (sharedWaits.length) {
      xlog(`  · ${sharedWaits.length} mevcut DeepSeek işi bekleniyor (aynı atom tekrar istenmeyecek)`, 'info');
      await Promise.allSettled(sharedWaits);
      missing = unique.filter(
        t => !_deDictFailedThisRun.has(_normalizeDictSourceKey(t)) &&
          TARGET_LANGS.some(l => !_deDictLookup(t, l))
      );
    }
    const cached = unique.length - missing.length;
    if (missing.length === 0) {
      xlog(`✓ ${productLabel} — ${cached} atom dict cache (0 API)`, 'success');
    } else {
      xlog(`⟳ ${productLabel} — ${cached}/${unique.length} cached, ${missing.length} yeni atom → DeepSeek (sözlükte olanlar için 0 API)`, 'info');
      const t0 = Date.now();
      try {
        const inFlight = new Map();
        const translatePromise = _deepSeekAllLangsBatch(missing, TARGET_LANGS, (ev) => {
          const key = `${ev.pass || 1}:${ev.chunkIndex}`;
          const provider = ev.provider === 'local-nllb' ? 'GPU Argos' : 'DeepSeek';
          if (ev.phase === 'start' && ev.provider === 'local-nllb') {
            xlog(`  ⚡ GPU çeviri başlıyor (Argos+CT2) · ${ev.batchSize} atom · ${ev.totalChunks} chunk`, 'info');
          } else if (ev.phase === 'skipped' && ev.provider === 'local-nllb') {
            xlog(`  ⏭ GPU worker atlandı (cooldown=${ev.reason}) · ${ev.batchSize} atom → DeepSeek`, 'warn');
          } else if (ev.phase === 'chunk-start') {
            inFlight.set(key, Date.now());
            const sample = (ev.sample || []).map(s => s.length > 28 ? `${s.slice(0, 26)}…` : s).join(', ');
            xlog(`  → ${provider} pass ${ev.pass || 1} chunk ${ev.chunkIndex + 1}/${ev.totalChunks} · ${ev.batchSize} atom · ${sample || '...'}`, 'info');
          } else if (ev.phase === 'chunk-done') {
            inFlight.delete(key);
            const tag = ev.provider === 'local-nllb' ? 'GPU' : 'DeepSeek';
            xlog(`  ✓ ${tag} chunk ${ev.chunkIndex + 1}/${ev.totalChunks}: ${ev.stored} çeviri · ${(ev.elapsedMs / 1000).toFixed(1)}s · dict ${ev.dictSize}`, 'success');
          } else if (ev.phase === 'chunk-error') {
            inFlight.delete(key);
            xlog(`  ⚠ ${provider} chunk ${ev.chunkIndex + 1}/${ev.totalChunks}: ${ev.error}`, 'warn');
          } else if (ev.phase === 'fallback') {
            xlog(`  → GPU Argos sonrası ${ev.batchSize} atom DeepSeek fallback'e kaldı`, 'info');
          }
        }, null, { passes: [{ size: 24, concurrency: 2 }] });
        for (const t of missing) _deDictInflight.set(_normalizeDictSourceKey(t), translatePromise);
        const heartbeat = setInterval(() => {
          if (!inFlight.size) return;
          const oldest = Math.min(...inFlight.values());
          xlog(`  … DeepSeek çalışıyor · ${inFlight.size} chunk aktif · en eski ${Math.round((Date.now() - oldest) / 1000)}s`, 'info');
        }, 5000);
        try {
          await translatePromise;
        } finally {
          clearInterval(heartbeat);
          for (const t of missing) {
            const key = _normalizeDictSourceKey(t);
            if (_deDictInflight.get(key) === translatePromise) _deDictInflight.delete(key);
          }
        }
        const dt = Date.now() - t0;
        xlog(`  ✓ ${missing.length} atom işlendi (${(dt / 1000).toFixed(1)}s)`, 'success');
      } catch (e) {
        xlog(`  ⚠ DeepSeek failed (${missing.length} atom): ${e.message}`, 'warn');
        slog(`  ⚠ inline translate failed (${missing.length} atoms): ${e.message}`, 'warn');
      }
    }
    const payload = _buildProductTranslations(translationSource, TARGET_LANGS);
    if (payload && typeof payload === 'object') {
      product.multiLangSpecs = { ...(product.multiLangSpecs || {}), ...(payload.multiLangSpecs || {}) };
      product.multiLangSections = { ...(product.multiLangSections || {}), ...(payload.multiLangSections || {}) };
      product.nameTranslated = { ...(product.nameTranslated || {}), ...(payload.nameTranslated || {}) };
    }
    if (String(product.sourceLang || '').toLowerCase() === 'tr') {
      const trSpecs = product.sourceSpecs && typeof product.sourceSpecs === 'object' ? product.sourceSpecs : translationSource.specs;
      const trSections = product.sourceSpecSections && typeof product.sourceSpecSections === 'object' ? product.sourceSpecSections : translationSource.specSections;
      product.multiLangSpecs = { ...(product.multiLangSpecs || {}), tr: trSpecs || {} };
      product.multiLangSections = { ...(product.multiLangSections || {}), tr: trSections || {} };
      product.nameTranslated = { ...(product.nameTranslated || {}), tr: product.nameTranslated?.tr || product.name || productLabel };
    }
    _sanitizeEnglishPayload(product);
    // Persist the (possibly grown) dictionary lazily — _saveDeDict is throttled.
    _deDictDirty = true;
    await _saveDeDict().catch(() => {});
    xlog(`✓ ${productLabel} — çeviri payload hazır · toplam ${((Date.now() - startedAt) / 1000).toFixed(1)}s · dict ${Object.keys(_deDictCache).length}`, 'success');
  } catch (e) {
    xlog(`✗ ${productLabel} — error: ${e.message}`, 'error');
    slog(`  ⚠ inline translate error: ${e.message}`, 'warn');
  }
  return product;
}

// Public API consumed by app.js category translator panel
window.QorAiBulkTranslate = {
  isEpeyProduct: _isEpeyTranslateProduct,
  // Pre-load dictionary
  loadDict: () => _loadDeDict(),
  // Collect unique atoms across a batch of products
  collectAtoms(products) {
    const sink = new Set();
    for (const p of products || []) _collectAtomsFromProduct(_translationSourceProduct(p), sink);
    return [...sink].filter(_shouldTranslateAtom);
  },
  // Return only the atoms that are missing for at least one target lang
  missingAtoms(atoms, targetLangs = TARGET_LANGS) {
    return atoms.filter(t => _shouldTranslateAtom(t) && !_deDictFailedThisRun.has(_normalizeDictSourceKey(t)) && targetLangs.some(l => !_deDictLookup(t, l)));
  },
  // Hit DeepSeek for the supplied (already filtered) atoms. Chunked & batched.
  // `onProgress` receives { phase, chunkIndex, totalChunks, ... } per chunk so
  // the UI can render a live progress bar and ETA.
  translateAtoms(atoms, targetLangs = TARGET_LANGS, onProgress, shouldAbort) {
    return _deepSeekAllLangsBatch(atoms, targetLangs, onProgress, shouldAbort);
  },
  // Build the per-product translation payload from dict only (no API calls).
  buildPayload(product, targetLangs = TARGET_LANGS) {
    return _buildProductTranslations(_translationSourceProduct(product), targetLangs);
  },
  sanitizeEnglishSpecMap: (map) => _sanitizeEnglishSpecMap(map),
  sanitizeEnglishSectionMap: (sections) => _sanitizeEnglishSectionMap(sections),
  sanitizeEnglishTranslationMap: (map) => _sanitizeEnglishTranslationMap(map),
  sanitizeEnglishText: (text, sourceText) => _sanitizeEnglishSpecText(text, sourceText),
  sanitizeEnglishPayload: (payload) => _sanitizeEnglishPayload(payload),
  assertCleanEnglishPayload: (payload, label) => _assertCleanEnglishPayload(payload, label),
  // Persist the dictionary cache to PocketBase (force-save)
  saveDict() { _deDictDirty = true; return _saveDeDict(); },
  targetLangs: () => TARGET_LANGS.slice(),
  // Estimated chunk count for progress reporting; must match the first
  // DeepSeek depot pass size above. Keep chunks modest: one request returns
  // 11 languages, so 150 atoms routinely overflows/truncates the JSON.
  CHUNK_SIZE: 40,
  CONCURRENCY: 3,
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
  if (!_isEpeyTranslateProduct(product)) return product;

  slog(`Translating Epey name/specs for: ${product.name?.substring(0, 50)}...`, 'info');

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
        // Adaptive — if no recent Cloudflare pushback, run faster. Baseline
        // drops from 4-6s to 2-3.5s when the session is healthy.
        const baseMs  = consecCloudflareFails > 0 ? 4000 : 2000;
        const jitter  = consecCloudflareFails > 0 ? 2000 : 1500;
        await sleep(baseMs + Math.random() * jitter);
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
//  15. BULK DETAIL SCRAPING (parallel workers + checkpoint resume)
// ═══════════════════════════════════════

// ── Checkpoint helpers (Resume after interruption) ──
const _CHECKPOINT_KEY = 'qorai_scraper_checkpoint_v1';
function _saveCheckpoint(urlItems, nextIndex, categoryId, results, retryUrls = []) {
  try {
    const remaining = [];
    const seen = new Set();
    const pushRemaining = (u) => {
      if (!u || !u.url) return;
      const key = normalizeScrapeUrlKey(u.url) || String(u.url || '').trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      remaining.push({ url: u.url, techScore: u.techScore });
    };
    (Array.isArray(retryUrls) ? retryUrls : []).forEach(pushRemaining);
    urlItems.slice(nextIndex).forEach(pushRemaining);
    localStorage.setItem(_CHECKPOINT_KEY, JSON.stringify({
      ts: Date.now(),
      categoryId,
      nextIndex,
      total: urlItems.length,
      results,
      // Save URLs only — re-collecting links can pick fresh prices but loses
      // resume position; instead reuse what we already discovered.
      remainingUrls: remaining,
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
  const concurrency = getEpeyDetailConcurrency();
  scraperRunning = true; scraperAbort = false;
  if (typeof window !== 'undefined') window.qoraiScrapeActive = true;
  if (typeof window !== 'undefined') {
    window.qoraiAutoScoreSuppressed = true;
  }
  const btn = document.getElementById('btnBulkScrape'); if (btn) btn.style.display = 'none';
  const stp = document.getElementById('btnStopScrape'); if (stp) stp.style.display = '';
  clearScraperLog();
  slog(`▶ Resuming scrape: ${cp.remainingUrls.length} of ${cp.total} remaining (category: ${cp.categoryId})`, 'info');
  const results = await sequentialScrape(cp.remainingUrls, cp.categoryId, delay, concurrency);
  slog(`═══ Resume done: ${results.added} eklendi | ${results.updated} güncellendi | ${results.skipped} atlandı | ${results.errors} hata ═══`, 'success');
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

function _isTransientPocketBaseError(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const msg = String(error?.message || '').toLowerCase();
  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  return /something went wrong|timeout|timed out|network|failed to fetch|fetch failed|rate|busy|locked|connection/i.test(msg);
}

async function _saveProductWithRetry(clean, label = '') {
  const id = clean.sourceUrl || clean.slug || clean.id;
  const title = String(label || clean.name || clean.slug || id || '').slice(0, 120);
  return _epeyPbWriteLimit(async () => {
    let lastError = null;
    for (let attempt = 1; attempt <= EPEY_PB_SAVE_RETRIES; attempt++) {
      try {
        if (scraperAbort) throw new Error('aborted');
        return await pbSetDoc('products', id, clean);
      } catch (e) {
        lastError = e;
        if (scraperAbort || !_isTransientPocketBaseError(e) || attempt >= EPEY_PB_SAVE_RETRIES) break;
        const delay = Math.min(1500 * Math.pow(2, attempt - 1), 12000) + Math.random() * 750;
        slog(`  ↻ PB save retry ${attempt}/${EPEY_PB_SAVE_RETRIES}: ${title} — ${e.message || e}`, 'warn');
        await sleep(delay);
      }
    }
    throw lastError;
  });
}

// Skip-existing: see the active _loadExistingSourceUrls() in the EPEY.COM
// OVERRIDES section below — it preloads what is already in the catalog so the
// bulk scrape can skip it. This makes resume "free": even after a PC restart
// the next run skips everything already saved and continues with new URLs.

async function sequentialScrape(urlItems, categoryId, delayMs = 2000, concurrencyArg = 0) {
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
  const { urls: existingUrls, slugs: existingSlugs, byVariantGroup: existingByVG } = await _loadExistingSourceUrls(categoryId);
  const beforeCount = urlItems.length;
  const existingUrlKeys = new Set([...existingUrls].map(normalizeScrapeUrlKey).filter(Boolean));
  const existingSlugKeys = new Set([...(existingSlugs || [])].map(v => String(v || '').trim()).filter(Boolean));
  const freshItems = [];
  const skippedExisting = [];
  for (const item of urlItems) {
    const key = normalizeScrapeUrlKey(item.url);
    const slug = slugFromUrl(item.url) || '';
    const idLike = slug ? generateProductId(slug) : '';
    if ((key && existingUrlKeys.has(key)) ||
        (slug && existingSlugKeys.has(slug)) ||
        (idLike && existingSlugKeys.has(idLike))) {
      skippedExisting.push(item);
      continue;
    }
    freshItems.push(item);
  }

  // SECOND-CHANCE VERIFICATION: the bulk preload (`_loadExistingSourceUrls`)
  // can return an incomplete set when PocketBase paginates a large
  // `getFullList` and a single page comes back short — the SDK then stops
  // early. The symptom we hit IRL: a category with 4061 products in PB
  // only matched 2041, so the other ~2000 URLs were treated as "new" and
  // re-fetched on every run.
  //
  // To make skip behaviour reliable, we batch-verify supposedly-fresh
  // items directly against PB. The match is OR'd across THREE keys:
  //   1. sourceUrl  — exact saved-URL match (post-fix records)
  //   2. slug       — URL slug match (works even if sourceUrl drifts:
  //                    http vs https, www vs no-www, trailing slash…)
  //   3. id         — slug → id transform via generateProductId, since
  //                    the document key in PB is sometimes that id.
  // If PB returns ANY of those, the item is treated as already-saved.
  // Batch of 25 keeps the OR-filter URL safely below PB's request size
  // limits even when each predicate is repeated three ways per row.
  if (freshItems.length > 0 && freshItems.length <= 1000) {
    try {
      const VERIFY_BATCH = 25;
      let verifiedExtraSkips = 0;
      const escFV = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      for (let bi = 0; bi < freshItems.length && !scraperAbort; bi += VERIFY_BATCH) {
        const slice = freshItems.slice(bi, bi + VERIFY_BATCH);
        const sliceMeta = []; // parallel to slice with computed keys
        const orParts = [];
        for (const item of slice) {
          const norm = normalizeEpeyProductUrl(item.url) || normalizeScrapeUrlKey(item.url);
          const slug = slugFromUrl(item.url) || '';
          const idLike = slug ? generateProductId(slug) : '';
          sliceMeta.push({ url: norm, slug, idLike });
          if (norm) orParts.push(`sourceUrl="${escFV(norm)}"`);
          if (slug) orParts.push(`slug="${escFV(slug)}"`);
          if (idLike && idLike !== slug) orParts.push(`slug="${escFV(idLike)}"`);
        }
        if (!orParts.length) continue;
        try {
          const found = await _pbGetAllPaged('products', {
            filter: orParts.join(' || '),
            sort: 'id',
            fields: 'id,sourceUrl,slug',
          }, 100, 30000);
          if (!found.length) continue;
          const foundUrlKeys = new Set();
          const foundSlugs = new Set();
          for (const d of found) {
            const data = typeof d.data === 'function' ? d.data() : (d.data || d);
            const rawUrl = String(data?.sourceUrl || '').trim();
            if (rawUrl) {
              const k = normalizeScrapeUrlKey(rawUrl);
              if (k) foundUrlKeys.add(k);
            }
            const slug = String(data?.slug || '').trim();
            if (slug) foundSlugs.add(slug);
          }
          // Move any matched item to skipped.
          const stillFresh = [];
          for (let si = 0; si < slice.length; si++) {
            const item = slice[si];
            const meta = sliceMeta[si];
            const matched =
              (meta.url && foundUrlKeys.has(meta.url)) ||
              (meta.slug && foundSlugs.has(meta.slug)) ||
              (meta.idLike && foundSlugs.has(meta.idLike));
            if (matched) {
              skippedExisting.push(item);
              if (meta.url) existingUrlKeys.add(meta.url);
              verifiedExtraSkips++;
            } else {
              stillFresh.push(item);
            }
          }
          freshItems.splice(bi, slice.length, ...stillFresh);
          bi -= (slice.length - stillFresh.length);
        } catch (e) {
          slog(`  (verify batch ${bi}+ failed: ${e.message})`, 'warn');
        }
      }
      if (verifiedExtraSkips > 0) {
        slog(`🔎 Verify pass caught ${verifiedExtraSkips} extra already-saved products the preload missed`, 'success');
      } else {
        slog(`🔎 Verify pass: 0 extra hits — preload was already complete`, 'info');
      }
    } catch (e) {
      slog(`  (URL verification pass failed: ${e.message})`, 'warn');
    }
  } else if (freshItems.length > 1000) {
    slog(`🔎 Verify pass skipped for ${freshItems.length} fresh URLs; paged preload already handled existing products.`, 'info');
  }

  urlItems = freshItems;
  const skippedCount = beforeCount - urlItems.length;
  if (skippedCount > 0) {
    // Log only a small head+tail sample of skipped slugs — the previous code
    // appended ALL skipped lines to the DOM synchronously, which froze the
    // main thread for several seconds on big categories (2134 lines = ~3s
    // of layout work + 2134 reflows). The user still has the full list in
    // PocketBase; the log just needs to show that skipping happened.
    const SAMPLE = 5;
    const head = skippedExisting.slice(0, SAMPLE);
    const tail = skippedExisting.slice(-SAMPLE);
    head.forEach((item, idx) => {
      const slug = slugFromUrl(item.url) || normalizeScrapeUrlKey(item.url);
      slog(`  ⏭ Skipped [${idx + 1}/${skippedCount}]: ${slug}`, 'warn');
    });
    if (skippedCount > SAMPLE * 2) {
      slog(`  ⏭ … (${skippedCount - SAMPLE * 2} ürün daha) …`, 'warn');
    }
    if (skippedCount > SAMPLE) {
      tail.forEach((item, idx) => {
        const slug = slugFromUrl(item.url) || normalizeScrapeUrlKey(item.url);
        const realIdx = skippedCount - tail.length + idx + 1;
        slog(`  ⏭ Skipped [${realIdx}/${skippedCount}]: ${slug}`, 'warn');
      });
    }
    slog(`⏭  Skipped ${skippedCount} already-saved products → ${urlItems.length} new to scrape`, 'success');
    results.skipped += skippedCount;
  } else {
    const knownExisting = Math.max(existingUrlKeys.size, existingSlugKeys.size, existingByVG?.size || 0);
    if (knownExisting > 0) {
      slog(`Existing catalog preload found ${knownExisting} keys, but none overlap this URL batch/resume slice — scraping all ${urlItems.length}`, 'info');
    } else {
      slog(`No existing products for this category — scraping all ${urlItems.length}`, 'info');
    }
  }
  if (urlItems.length === 0) {
    slog('Nothing new to scrape — category is fully up to date.', 'success');
    return results;
  }

  _scrapeStartTime = Date.now();
  _scrapeProductCount = 0;

  const concurrency = Math.max(1, Math.min(EPEY_DETAIL_CONCURRENCY_MAX, parseInt(concurrencyArg, 10) || getEpeyDetailConcurrency()));
  let cursor = 0;
  let completed = 0;
  let lastSummary = 0;
  const retryLaterByKey = new Map();
  const retryKeyFor = (item) => normalizeScrapeUrlKey(item?.url) || String(item?.url || '').trim();
  const markRetryLater = (item) => {
    const key = retryKeyFor(item);
    if (key) retryLaterByKey.set(key, item);
  };
  const clearRetryLater = (item) => {
    const key = retryKeyFor(item);
    if (key) retryLaterByKey.delete(key);
  };
  const retryLaterItems = () => Array.from(retryLaterByKey.values());
  // Aggressive low cap (was 250ms) — Cloudflare clearance + 8-24 worker pool
  // Epey has no Cloudflare — drop the inter-request sleep entirely. Workers
  // are naturally paced by the proxy queue + HTTP round-trip latency.
  const effectiveDelayMs = 0;
  slog(`⚡ Paralel detay çekimi: ${concurrency} işçi · delay ${effectiveDelayMs}ms/işçi`, 'info');

  const scrapeOne = async (item, index) => {
    const productNum = index + 1;
    const slug = slugFromUrl(item.url);
    if (scraperAbort) return;
    try {
      slog(`[${productNum}/${urlItems.length}] ${slug}`);
      const html = await proxyFetch(item.url, 1);
      if (!html) {
        slog(`  → 404/gone: ${slug}`, 'warn');
        results.skipped++;
        clearRetryLater(item);
        return;
      }

      if (isChallengePage(html)) {
        challengeStreak++;
        recent.push('cf');
        results.skipped++;
        slog(`  → Challenge page: ${slug} (streak ${challengeStreak})`, 'warn');
        if (challengeStreak >= _CF_STREAK_BEFORE_RESET) {
          slog(`🛑 ${challengeStreak} ardışık challenge. Paralel çekim durduruldu; proxy'i yenileyip Resume kullan.`, 'error');
          markRetryLater(item);
          _saveCheckpoint(urlItems, Math.min(cursor, urlItems.length), categoryId, results, retryLaterItems());
          scraperAbort = true;
          _abortAllScrapeControllers();
        }
        return;
      }
      challengeStreak = 0;

      const product = await scrapeProductDetail(html, item.url, categoryId);
      if (!product || product.name === 'Unknown Product' || product.specsCount === 0) {
        slog(`  → Skipped (no data): ${slug}`, 'warn');
        results.skipped++;
        clearRetryLater(item);
        return;
      }

      const clean = prepareProductPayload(product);
      // Inline translation hook (EU pivot): every scraped product gets the
      // full 7-language package (source + 6 target languages) before PB write.
      await _translateProductInline(clean);
      _assertCleanEnglishPayload(clean, clean.name || clean.slug || item.url);

      // Cross-source dedup: same variantGroup already in PB?
      //   • SAME source  → skip (slug-level dedup handled elsewhere already)
      //   • OTHER source → MERGE specs into existing record (specs union
      //     across TR + DE), keep the existing record's id/source/affiliate
      //     fields, never create a duplicate.
      const mergeKey = clean.variantGroup;
      const existing = mergeKey ? existingByVG.get(mergeKey) : null;
      if (existing && existing.source && existing.source !== clean.source) {
        const merged = await _mergeIntoExistingRecord(existing.id, clean);
        if (merged) {
          window.dispatchEvent(new CustomEvent('qorai:product-saved', { detail: { id: existing.id, product: merged } }));
          results.updated++;
          errorStreak = 0;
          recent.push('ok');
          slog(`  ↻ Cross-source merge: ${product.name} → existing ${existing.id} (${existing.source})`, 'info');
          if ((results.added + results.updated) % 50 === 0) {
            _saveCheckpoint(urlItems, Math.min(cursor, urlItems.length), categoryId, results, retryLaterItems());
          }
          clearRetryLater(item);
          return;
        }
      }

      const saved = await _saveProductWithRetry(clean, product.name || clean.name || clean.slug);
      // Register the new record in the in-memory VG map so subsequent
      // products from a different source merge into THIS one.
      if (mergeKey && saved?.id) {
        existingByVG.set(mergeKey, { id: saved.id, source: clean.source, name: clean.name });
      }
      window.dispatchEvent(new CustomEvent('qorai:product-saved', { detail: { id: saved?.id || clean.slug, product: clean } }));
      results.added++;
      errorStreak = 0;
      recent.push('ok');
      slog(`  → Eklendi: ${product.name} (${product.specsCount} özellik, ${product.images.length} görsel)`, 'success');
      clearRetryLater(item);

      // Adaptive checkpoint every 50 saved products. In parallel mode the
      // cursor may be ahead of completed workers; durable skip-existing makes
      // Resume safe even if a few in-flight URLs are retried later.
      if ((results.added + results.updated) > 0 && (results.added + results.updated) % 50 === 0) {
        _saveCheckpoint(urlItems, Math.min(cursor, urlItems.length), categoryId, results, retryLaterItems());
      }
    } catch (e) {
      if (scraperAbort || e.message === 'aborted') return;
      results.errors++;
      errorStreak++;
      recent.push('err');
      markRetryLater(item);
      const details = e.response?.data || e.data || {};
      slog(`  → Error: ${slug} — ${e.message}`, 'error');
      Object.entries(details).forEach(([k,v]) => {
        slog(`     ${k}: ${JSON.stringify(v).substring(0,200)}`, 'error');
      });

      // HARD ABORT: too many consecutive errors → likely IP-banned / browser dead
      if (errorStreak >= _MAX_CONSEC_ERRORS) {
        slog(`🛑 ${_MAX_CONSEC_ERRORS} ardışık hata. Scrape durduruldu. Checkpoint kaydedildi — Resume ile devam edebilirsin.`, 'error');
        _saveCheckpoint(urlItems, Math.min(cursor, urlItems.length), categoryId, results, retryLaterItems());
        scraperAbort = true;
        _abortAllScrapeControllers();
        return;
      }

      if (errorStreak >= 3) {
        const backoff = Math.min(2000 * Math.pow(2, errorStreak - 3), 15000);
        slog(`Error streak (${errorStreak}), backing off ${(backoff / 1000).toFixed(0)}s...`, 'warn');
        await sleep(backoff);
      }
    }
  };

  const worker = async () => {
    while (!scraperAbort) {
      const index = cursor++;
      if (index >= urlItems.length) return;
      await scrapeOne(urlItems[index], index);
      completed++;
      _scrapeProductCount = completed;
      updateProgress(completed, urlItems.length, 'Products');
      if (completed - lastSummary >= 100 || completed === urlItems.length) {
        lastSummary = completed;
        slog(`  ↳ progress ${completed}/${urlItems.length} · added ${results.added} · updated ${results.updated} · skipped ${results.skipped} · errors ${results.errors}`, 'info');
      }
      if (effectiveDelayMs > 0 && !scraperAbort) await sleep(effectiveDelayMs);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, urlItems.length) }, () => worker());
  await Promise.all(workers);
  if (scraperAbort) _saveCheckpoint(urlItems, Math.min(cursor, urlItems.length), categoryId, results, retryLaterItems());

  // Self-healing: any TR word that hit the transliteration fallback during
  // this run is now sent to Argos for a real translation and added to the
  // dictionary so the SAME word never falls through again.
  try { await _flushUnknownTurkishWords(); } catch {}
  // Force a final dict save: throughout the scrape we throttle saves to
  // every ~30s. At the end we must flush whatever's pending.
  try { await _flushDeDictBeforeExit(); } catch {}

  // Final checkpoint clear (success path). If a few products failed while the
  // rest completed, keep just those URLs for Resume instead of dropping them.
  if (!scraperAbort && retryLaterByKey.size > 0) {
    _saveCheckpoint(urlItems, urlItems.length, categoryId, results, retryLaterItems());
    slog(`↻ ${retryLaterByKey.size} hatalı ürün Resume için checkpoint'e geri koyuldu.`, 'warn');
  } else if (!scraperAbort) {
    _clearCheckpoint();
  }
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

  const maxProducts = parseInt(document.getElementById('scrapeMaxProducts')?.value) || 6000;
  const delay = parseInt(document.getElementById('scrapeDelay')?.value) || 2000;

  scraperRunning = true; scraperAbort = false;
  if (typeof window !== 'undefined') window.qoraiScrapeActive = true;
  if (typeof window !== 'undefined') {
    window.qoraiAutoScoreSuppressed = true;
  }
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

    slog(`\n═══ Done: ${results.added} eklendi | ${results.updated} güncellendi | ${results.skipped} atlandı | ${results.errors} hata ═══`, 'success');
    if ((results.added > 0 || results.updated > 0) && typeof loadProducts === 'function') {
      await loadProducts();
      slog('Products view refreshed.', 'success');
    }
  } catch (e) {
    slog(`Fatal error: ${e.message}`, 'error');
  }

  finishScraping();
}

// ═══════════════════════════════════════
//  19. SINGLE URL SCRAPE — defined further down (line ~4961).
//  An older definition lived here and silently shadowed the newer one,
//  so the inline-translation hook added here was dead code. Keep the
//  single source of truth in the second definition.
// ═══════════════════════════════════════

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
  if (typeof window !== 'undefined') {
    window.qoraiAutoScoreSuppressed = true;
    try { window.qoraiCancelQueuedScoreUpdates?.(); } catch (_) {}
    try { window.stopScoreEngine?.(); } catch (_) {}
  }
  // Abort every in-flight proxy fetch immediately. Without this the user had
  // to wait for the 120s per-request timeout — Stop felt unresponsive.
  _abortAllScrapeControllers();
  slog('Stopping... (aborting in-flight scrape + score queue)', 'warn');
}

function finishScraping() {
  scraperRunning = false;
  scraperAbort = false;
  if (typeof window !== 'undefined') {
    window.qoraiScrapeActive = false;
    window.qoraiAutoScoreSuppressed = true;
  }
  _abortAllScrapeControllers();
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

function normalizeScrapeUrlKey(url) {
  const epey = normalizeEpeyProductUrl(url);
  if (epey) return epey;
  try {
    const u = new URL(url, EPEY_BASE);
    return `${u.origin}${u.pathname}`.replace(/\/+$/g, '');
  } catch {
    return String(url || '').trim().split(/[?#]/)[0].replace(/\/+$/g, '');
  }
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

  // Some Epey gallery pages keep the extra product photos in inline JS or
  // escaped HTML fragments instead of regular <img> nodes. Use a slug-aware
  // fallback so we can reach 8 images without pulling unrelated recommendations.
  if (byKey.size < MAX_IMAGES_PER_PRODUCT && productSlug) {
    const html = String(doc.documentElement?.innerHTML || '')
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&');
    const exactSlug = String(productSlug || '').toLowerCase();
    const slugTokens = exactSlug
      .replace(/-\d+(?:gb|tb|mb)\b/g, '')
      .split(/[^a-z0-9]+/)
      .filter(t => t.length >= 3 && !['html', 'resimleri'].includes(t));
    const isLikelyOwnImage = (url) => {
      const lower = String(url || '').toLowerCase();
      if (!slugTokens.length) return false;
      const hits = slugTokens.filter(t => lower.includes(t)).length;
      return hits >= Math.min(2, slugTokens.length);
    };
    const imageFolder = (url) => (String(url || '').match(/resim\.epey\.com\/(\d+)\//i) || [])[1] || '';
    const re = /https?:\/\/resim\.epey\.com\/[^,"'()<>\s\\]+/gi;
    const matches = [];
    let m;
    while ((m = re.exec(html)) !== null) {
      matches.push(m[0].replace(/&quot;.*/i, '').replace(/['"].*$/i, ''));
    }
    for (const url of matches) {
      if (byKey.size >= MAX_IMAGES_PER_PRODUCT) break;
      if (exactSlug && String(url).toLowerCase().includes(exactSlug)) consider(url);
    }
    const allowedFolders = new Set([...byKey.values()].map(v => imageFolder(v.url)).filter(Boolean));
    for (const url of matches) {
      if (byKey.size >= MAX_IMAGES_PER_PRODUCT) break;
      const folder = imageFolder(url);
      if (allowedFolders.size && !allowedFolders.has(folder)) continue;
      if (isLikelyOwnImage(url)) consider(url);
    }
  }

  return [...byKey.values()].map(v => v.url).slice(0, MAX_IMAGES_PER_PRODUCT);
}

// Epey's full photo set lives on a separate gallery page. Its URL is the
// product URL with "-resimleri" inserted before ".html" AND it keeps the
// category path (epey.com/akilli-telefonlar/honor-magic7-pro-resimleri.html).
// The page also 404s unless the request carries a Referer to the product page.
function epeyGalleryUrl(productUrl) {
  const u = normalizeEpeyProductUrl(productUrl) || String(productUrl || '');
  if (!/\.html$/i.test(u)) return '';
  return u.replace(/\.html$/i, '-resimleri.html');
}

async function fetchGalleryImages(productUrl) {
  const galleryUrl = epeyGalleryUrl(productUrl);
  if (!galleryUrl) return [];
  try {
    // retries=1: the gallery is a best-effort image top-up, not worth 3 retries.
    const html = await proxyFetch(galleryUrl, 1, productUrl);
    if (!html || isChallengePage(html)) return [];
    return extractImages(parseHTML(html), slugFromUrl(productUrl));
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
  const urlCategory = findCategoryByEpeyUrl(url)?.id || detectCategoryFromDoc(doc, categorySlugFromUrl(url)) || categorySlugFromUrl(url);
  let category = urlCategory || categoryId || '';

  let images = extractImages(doc, productSlug);
  if (EPEY_FETCH_GALLERY_IMAGES && images.length < MAX_IMAGES_PER_PRODUCT) {
    const gallery = await fetchGalleryImages(url);
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
    // techScore is intentionally NOT scraped — Epey's "teknik puan" is
    // replaced by the admin panel's own Score Engine, run after import.
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

// Collect product URLs for an Epey category (and optionally a brand/term).
//
// CATEGORY mode (categoryId given) = Epey's category listing
// (`epey.com/<epeyPath>/`) — every product in that category. With a search
// term it narrows to that brand inside the category (`…/<epeyPath>/<brand>/`).
//
// SEARCH mode (no categoryId) = Epey site search (`/ara/?ara=<term>`), used by
// the "Add by URL" lookup.
async function collectSearchProductUrls(searchTerm, maxProducts = 200, categoryId = '') {
  const term = String(searchTerm || '').trim();
  if (!term && !categoryId) return [];
  const allItems = [];
  const seen = new Set();
  let expectedCategoryTotal = 0;

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

  // Batched Epey AJAX listing pages. `pages` is [1,2,3,...,12] — the proxy
  // fires them all in parallel inside ONE page.evaluate. The Puppeteer
  // browser is HTTP/2 capable when Epey supports it, so we can push past
  // the HTTP/1.1 six-connection limit. 12 measured ~140 ms/page from the
  // proxy on a warm session (verified 2026-05-26 against laptop catalog).
  const PAGINATE_BATCH = 12;
  const fetchAjaxPagesBatch = async (ajax, pageNumbers, filterValues = []) => {
    let qs = `kid=${encodeURIComponent(ajax.kategoriId)}` +
      `&limit=${encodeURIComponent(ajax.limit)}` +
      `&pages=${encodeURIComponent(pageNumbers.join(','))}` +
      `&base=${encodeURIComponent(ajax.base)}` +
      `&prefix=${encodeURIComponent(ajax.prefix || '')}`;
    if (ajax.cerez) qs += `&cerez=${encodeURIComponent(ajax.cerez)}`;
    for (const v of filterValues) qs += `&fv=${encodeURIComponent(v)}`;
    const res = await fetch(`${PROXY_URL}/listing-ajax-batch?${qs}`, { signal: AbortSignal.timeout(60000) });
    return res.ok ? await res.json() : null;
  };

  // Page one listing stream 1,2,3,… to the end via parallel batches. A page
  // thinner than the page size is the last page; two consecutive no-new-product
  // pages also end the stream. `onPage(pageNo, added, total)` is called for
  // each page after its batch arrives.
  const paginateStream = async (ajax, filterValues, onPage) => {
    const pageSize = Number(ajax.limit) || 31;
    const startCount = allItems.length;
    let emptyStreak = 0;
    let transientStreak = 0;
    const maxEmptyStreak = filterValues && filterValues.length ? 5 : 4;
    let nextPage = 1;
    const HARD_PAGE_CAP = 500;
    while (nextPage <= HARD_PAGE_CAP && allItems.length < maxProducts && !scraperAbort) {
      const batchPages = [];
      for (let i = 0; i < PAGINATE_BATCH && nextPage + i <= HARD_PAGE_CAP; i++) {
        batchPages.push(nextPage + i);
      }
      let batchResp = null;
      for (let attempt = 1; attempt <= 3 && !scraperAbort; attempt++) {
        try {
          batchResp = await fetchAjaxPagesBatch(ajax, batchPages, filterValues);
          if (batchResp && Array.isArray(batchResp.pages)) break;
          if (attempt < 3) await sleep(1500 * attempt);
        } catch (e) {
          if (attempt >= 3) {
            slog(`  ⚠️ batch pages ${batchPages[0]}-${batchPages[batchPages.length-1]} hatası: ${e.message}`, 'warn');
          } else {
            await sleep(1500 * attempt);
          }
        }
      }
      if (!batchResp || !Array.isArray(batchResp.pages)) break;
      let lastPageHit = false;
      for (const p of batchResp.pages) {
        if (scraperAbort || allItems.length >= maxProducts) break;
        if (Number(p?.status || 0) === 0) {
          transientStreak++;
          if (typeof onPage === 'function') onPage(p.page, 0, allItems.length);
          continue;
        }
        transientStreak = 0;
        const added = pushItems(Array.isArray(p.links) ? p.links.map(u => ({ url: u, techScore: null })) : []);
        if (typeof onPage === 'function') onPage(p.page, added, allItems.length);
        if (added === 0) { if (++emptyStreak >= maxEmptyStreak) { lastPageHit = true; break; } }
        else emptyStreak = 0;
        const returnedCount = Number(p?.count) || 0;
        if (returnedCount > 0 && returnedCount < pageSize) { lastPageHit = true; break; }
      }
      if (transientStreak >= 12) {
        slog(`  ⚠️ ${transientStreak} geçici boş AJAX sayfası üst üste geldi; bu stream bırakıldı.`, 'warn');
        break;
      }
      if (lastPageHit) break;
      nextPage += PAGINATE_BATCH;
      // Yield to the event loop so Chrome can paint and process Stop.
      await sleep(0);
    }
    return allItems.length - startCount;
  };

  const paginatePartitions = async (ajax, partitions, labelFor, onPage) => {
    const list = Array.isArray(partitions) ? partitions : [];
    let totalAdded = 0;
    for (let pi = 0; pi < list.length && allItems.length < maxProducts && !scraperAbort; pi++) {
      const part = list[pi];
      const value = typeof part === 'string' ? part : part?.value;
      if (!value) continue;
      const label = typeof labelFor === 'function' ? labelFor(part, pi) : (part?.name || value);
      const before = allItems.length;
      if (label) slog(`  • Partition ${pi + 1}/${list.length}: ${label}${part?.count ? ` (~${part.count})` : ''}`, 'info');
      if (part && part.url) {
        try {
          const brandData = await fetchLinks(part.url);
          const firstAdded = pushItems(itemsFromData(brandData));
          if (typeof onPage === 'function') onPage(part, 1, firstAdded, allItems.length);
          const brandAjax = brandData?.ajax && brandData.ajax.kategoriId ? brandData.ajax : null;
          if (brandAjax && allItems.length < maxProducts && !scraperAbort) {
            await paginateStream(brandAjax, [], (pageNo, added, total) => {
              if (pageNo === 1 && firstAdded) return;
              if (typeof onPage === 'function') onPage(part, pageNo, added, total);
            });
          }
        } catch (e) {
          slog(`    ↳ ${label}: marka sayfası alınamadı (${e.message})`, 'warn');
        }
      } else {
        await paginateStream(ajax, [value], (pageNo, added, total) => {
          if (typeof onPage === 'function') onPage(part, pageNo, added, total);
        });
      }
      const added = allItems.length - before;
      totalAdded += added;
      if (label) slog(`    ↳ ${label}: +${added} yeni URL`, added ? 'success' : 'warn');
      if (pi % 6 === 5) await sleep(0);
    }
    return totalAdded;
  };

  // ── CATEGORY mode: every product in the Epey category listing ──
  const catDef = categoryId && typeof QorAiCategories !== 'undefined'
    ? (QorAiCategories.getById?.(categoryId) || QorAiCategories.getAll().find(c => c.id === categoryId))
    : null;
  const epeyPath = catDef && catDef.epeyPath ? String(catDef.epeyPath).replace(/^\/|\/$/g, '') : '';
  if (categoryId) {
    if (!epeyPath) {
      slog(`Category "${categoryId}" has no Epey path — cannot scrape it.`, 'error');
      return [];
    } else {
      const brandSlug = term ? normalizeCategoryToken(term) : '';
      const baseUrl = brandSlug
        ? `${EPEY_BASE}/${epeyPath}/${brandSlug}/`
        : `${EPEY_BASE}/${epeyPath}/`;
      slog(`📂 Kategori taranıyor: ${catDef.name || categoryId}${term ? ` · "${term}"` : ''}`, 'info');
      slog(`   ${baseUrl}`, 'info');

      // The static category page is used for AJAX tokens and the partition
      // filter. URL collection itself is driven through /kat/listele/ with
      // limit=31 so every listing page is collected before detail scraping.
      const t0 = Date.now();
      let data;
      try {
        data = await fetchLinks(baseUrl);
      } catch (e) {
        slog(`  ❌ Kategori sayfası alınamadı: ${e.message}`, 'error');
        return [];
      }
      const ajax = data?.ajax && data.ajax.kategoriId ? data.ajax : null;
      const filter = data?.filter && Array.isArray(data.filter.values) && data.filter.values.length
        ? data.filter : null;
      // Fallback partition filters. When the primary `filter` under-counts
      // (e.g. smartphones: primary partition only covers ~70% of the catalog
      // because Epey's default listing hides discontinued items) we iterate
      // through the next-best filter groups (RAM, screen size, year, …) to
      // pull additional slices. Each filter group selects a different cut
      // of the catalog so their union maximises coverage. De-dup is handled
      // by `pushItems`/`seenUrls`.
      const filtersTopK = Array.isArray(data?.filtersTopK)
        ? data.filtersTopK.filter(f => f && Array.isArray(f.values) && f.values.length)
        : (filter ? [filter] : []);
      const brandFilter = data?.brandFilter && Array.isArray(data.brandFilter.values) && data.brandFilter.values.length
        ? data.brandFilter : null;
      // Use max across ALL filter group totals — not just the primary.
      // The Satıştakiler default suppresses discontinued items, so the
      // primary filter's "total" can be 5-10x smaller than reality. Once
      // any filter is active Epey returns the full catalog, and the
      // largest group's total reflects that better.
      expectedCategoryTotal = Math.max(
        Number(filter?.total) || 0,
        Number(brandFilter?.total) || 0,
        Number(data?.count) || 0,
        ...filtersTopK.map(f => Number(f?.total) || 0),
      );
      // Bump the user-supplied limit when the discovered catalog is larger.
      // expectedCategoryTotal is read from the SATIŞTAKILER-filtered HTML,
      // so it can undershoot the real total by 3-6x (laptops: HTML says
      // ~8 753 in stock, but the real catalog is ~48 810). Add generous
      // headroom so the multi-axis union can collect everything.
      if (expectedCategoryTotal > maxProducts) {
        const previousLimit = maxProducts;
        maxProducts = Math.min(150000, Math.max(expectedCategoryTotal * 6, expectedCategoryTotal + 1000));
        slog(`  ⚠️ Ürün limiti (${previousLimit}) Epey tahmininden düşük (${expectedCategoryTotal}). Gerçek katalog daha büyük olabileceğinden hedef ${maxProducts} URL'ye yükseltildi.`, 'warn');
      }
      const logPage = (pageNo, added, total) =>
        slog(`  ✓ Sayfa ${pageNo}: +${added} ürün → toplam ${total}`, added ? 'success' : 'warn');
      const staticFirstPageItems = itemsFromData(data);

      if (ajax) {
        slog(`  ✓ Kategori metadata alındı (${((Date.now() - t0) / 1000).toFixed(1)}s)`, 'success');
      }

      if (ajax && allItems.length < maxProducts) {
        // FULL CATALOG COVERAGE — multi-axis union (Epey caps per-query at
        // ~2.5k even on filtered listings, so a SINGLE "select-all" group is
        // never enough for a 48k-laptop catalogue). We union three layers:
        //
        //   (1) filter-group "select-all" — every value of one filter group
        //       sent as filtrele[]. Any non-empty filter selection disables
        //       Epey's Satıştakiler default and exposes out-of-stock items.
        //       We DO NOT early-terminate on filter `total` because that
        //       number is read from the Satıştakiler-filtered HTML and
        //       always underestimates reality. Run ALL fallback groups.
        //
        //   (2) brand partition — per-brand `marka:NN` filter. Each brand
        //       returns at most ~1-2k products so per-query cap is moot.
        //       Brands union to the entire catalogue including discontinued.
        //
        //   (3) plain listing — the unfiltered AJAX stream as last resort.
        //
        // All three feed `pushItems`/`seenUrls`; de-dup is automatic.
        // NOTE: /kat/listele/ filtrele[]= AJAX is silently ignored by Epey
        // (deprecated). Tested 2026-05-26: sending all 37 filter values via
        // fv= returns the same 1115 in-stock default products as no filter.
        // Real coverage comes from brand-URL partition below. Filter group
        // iteration kept as a no-op safety net but no longer waste-paginates.

        // Brand partition — URL navigation (NOT fv= AJAX). Each brand has
        // its own dedicated listing URL like /laptop/lenovo/. The brand
        // page exposes a SEPARATE ajax (kid + cerez + base) that paginates
        // brand-filtered results correctly. Sending fv=marka:NN to /kat/listele/
        // is silently ignored (Epey deprecated that interface).
        if (brandFilter && Array.isArray(brandFilter.values) && brandFilter.values.length &&
            allItems.length < maxProducts && !scraperAbort) {
          slog(`  ⏩ Marka partisyonu başlıyor (${brandFilter.values.length} marka · ~${brandFilter.total} toplam)`, 'info');
          const beforeBrand = allItems.length;
          for (let bi = 0; bi < brandFilter.values.length; bi++) {
            if (allItems.length >= maxProducts || scraperAbort) break;
            const b = brandFilter.values[bi];
            const brandUrl   = typeof b === 'string' ? b : b?.value;
            const brandName  = typeof b === 'string' ? b : (b?.name || brandUrl);
            const brandCount = typeof b === 'object' ? (b?.count || 0) : 0;
            if (!brandUrl || !/^https?:/i.test(String(brandUrl))) continue;
            const beforeOne = allItems.length;
            // Fetch the brand page metadata — its own kategoriId/cerez set.
            let brandData;
            try { brandData = await fetchLinks(brandUrl); }
            catch (e) { slog(`    ↳ ${brandName}: meta hatası (${e.message})`, 'warn'); continue; }
            const brandAjax = brandData?.ajax && brandData.ajax.kategoriId ? brandData.ajax : null;
            // Push the inline first-page links so we don't miss them.
            pushItems(itemsFromData(brandData));
            if (brandAjax) {
              await paginateStream(brandAjax, [], () => {});
            }
            const gained = allItems.length - beforeOne;
            slog(`    ↳ ${brandName} (~${brandCount}): +${gained} yeni → toplam ${allItems.length}`, gained ? 'success' : 'warn');
          }
          const brandGained = allItems.length - beforeBrand;
          slog(`  ✓ Marka partisyonu bitti: +${brandGained} yeni URL (kümülatif ${allItems.length})`, brandGained ? 'success' : 'warn');
        }

        // Plain listing as the last layer — always run as a safety net.
        if (allItems.length < maxProducts && !scraperAbort) {
          slog(`  ⏩ Düz kategori sayfalaması yedeği başlıyor (${ajax.limit}/sayfa)`, 'info');
          const beforePlain = allItems.length;
          await paginateStream(ajax, [], logPage);
          const plainGained = allItems.length - beforePlain;
          if (plainGained === 0) {
            slog(`  ⚠️ Düz kategori AJAX yeni ürün getirmedi (filtre/marka katmanları zaten kapsamış)`, 'info');
          } else {
            slog(`  ✓ Düz katman bitti: +${plainGained} yeni URL → toplam ${allItems.length}`, 'success');
          }
        }

        const firstPageAdded = pushItems(staticFirstPageItems);
        if (firstPageAdded) {
          slog(`  ✓ İlk sayfa yedek liste: +${firstPageAdded} ürün → toplam ${allItems.length}`, 'success');
        }
      } else if (!ajax) {
        const firstPageAdded = pushItems(staticFirstPageItems);
        slog(`  ✓ Kategori sayfası: +${firstPageAdded} ürün (${((Date.now() - t0) / 1000).toFixed(1)}s)`, firstPageAdded ? 'success' : 'warn');
        slog(`  ⚠️ Kategori AJAX bilgisi bulunamadı — sadece 1. sayfa alındı.`, 'warn');
      }

      if (expectedCategoryTotal && allItems.length < Math.floor(expectedCategoryTotal * 0.95) && !scraperAbort) {
        slog(`  ⚠️ Eksik URL şüphesi: Epey tahmini ${expectedCategoryTotal}, toplanan ${allItems.length}. Bu kategori için proxy/partition tekrar denenmeli.`, 'warn');
      }
      slog(`📦 Toplam ${allItems.length} ürün URL'si toplandı (${((Date.now() - t0) / 1000).toFixed(1)}s)`, 'success');
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

async function _pbGetAllPaged(collection, options = {}, perPage = 500, timeoutMs = 120000) {
  const started = Date.now();
  const docs = [];
  for (let page = 1; ; page++) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`paged query ${Math.round(timeoutMs / 1000)}s zaman aşımı`);
    }
    const res = await pbGetList(collection, page, perPage, options);
    docs.push(...(res.docs || []));
    if (!res.docs?.length || page >= (res.totalPages || page)) break;
    if (page % 5 === 0) await sleep(0);
  }
  return docs;
}

// Loads what is ALREADY in the catalog for a category so the bulk scrape can
// reconcile against it. Returns:
//   urls         — every sourceUrl on record (URL-level skip for re-runs)
//   slugs        — saved slug/id keys (survives sourceUrl drift)
//   byVariantGroup — Map(variantGroup → { id, source, name }). variantGroup
//                  is the cross-source identity key (modelFamilyKey) used to
//                  reconcile records that already exist for the same model.
// Lookup PB for an existing record with the given variantGroup. Returns
// { id, source, name } or null. Used by both scrapers for cross-source dedup
// (without preloading a per-category VG map, which would be expensive on
// brand-search runs that touch many categories).
async function _findExistingByVariantGroup(variantGroup) {
  const vg = String(variantGroup || '').trim();
  if (!vg) return null;
  try {
    const r = await pb.collection('products').getList(1, 1, {
      filter: `variantGroup = "${vg.replace(/"/g, '\\"')}"`,
      fields: 'id,source,name',
      $autoCancel: false,
    });
    const item = (r?.items || [])[0];
    if (!item) return null;
    return { id: item.id, source: item.source || '', name: item.name || '' };
  } catch {
    return null;
  }
}

// Merge incoming `clean` payload into an existing PB product record.
// Used by cross-source dedup so an Epey TR record gets enriched with
// Geizhals DE specs (and vice versa) instead of creating a duplicate.
//
// Strategy:
//   • Fetch existing record's specs / multiLangSpecs / images
//   • Union both spec maps under canonical English keys (already
//     normalised by prepareProductPayload's canonicalizer)
//   • Union multiLangSpecs at the language-pair level
//   • Keep the existing record's source, sourceUrl, gtin/mpn,
//     affiliateLinks, techScore — incoming wins ONLY for keys it
//     newly provides (never overwrites a populated value with empty)
//   • Bump images: union, capped at 8
//   • PATCH back to PB; return merged payload for the saved event
async function _mergeIntoExistingRecord(existingId, incoming) {
  if (!existingId || !incoming) return null;
  try {
    const got = await pb.collection('products').getOne(existingId, { $autoCancel: false });
    const oldData = (typeof got?.data === 'function' ? got.data() : got) || {};

    const specs = { ...(oldData.specs || {}) };
    for (const [k, v] of Object.entries(incoming.specs || {})) {
      if (v == null || v === '') continue;
      if (!specs[k] || String(specs[k]).trim() === '') specs[k] = v;
    }

    const specSections = { ...(oldData.specSections || {}) };
    for (const [section, body] of Object.entries(incoming.specSections || {})) {
      if (!body || typeof body !== 'object') continue;
      const merged = { ...(specSections[section] || {}) };
      for (const [k, v] of Object.entries(body)) {
        if (v == null || v === '') continue;
        if (!merged[k] || String(merged[k]).trim() === '') merged[k] = v;
      }
      specSections[section] = merged;
    }

    const keySpecs = { ...(oldData.keySpecs || {}) };
    for (const [k, v] of Object.entries(incoming.keySpecs || {})) {
      if (v && (!keySpecs[k] || keySpecs[k] === '')) keySpecs[k] = v;
    }

    const multiLangSpecs = { ...(oldData.multiLangSpecs || {}) };
    for (const [lang, map] of Object.entries(incoming.multiLangSpecs || {})) {
      if (!map || typeof map !== 'object') continue;
      multiLangSpecs[lang] = { ...(multiLangSpecs[lang] || {}), ...map };
    }
    const multiLangSections = { ...(oldData.multiLangSections || {}) };
    for (const [lang, map] of Object.entries(incoming.multiLangSections || {})) {
      if (!map || typeof map !== 'object') continue;
      multiLangSections[lang] = { ...(multiLangSections[lang] || {}), ...map };
    }
    const nameTranslated = { ...(oldData.nameTranslated || {}) };
    for (const [lang, name] of Object.entries(incoming.nameTranslated || {})) {
      if (name && !nameTranslated[lang]) nameTranslated[lang] = name;
    }

    const existingImages = Array.isArray(oldData.images) ? [...oldData.images] : [];
    const seenImg = new Set(existingImages);
    for (const url of (incoming.images || [])) {
      if (url && !seenImg.has(url)) { existingImages.push(url); seenImg.add(url); }
      if (existingImages.length >= 8) break;
    }

    // Track every source that contributed to this record so the catalog can
    // tell at a glance that a row was enriched cross-source.
    const sourcesArr = Array.isArray(oldData.sources)
      ? [...oldData.sources]
      : (oldData.source ? [oldData.source] : []);
    if (incoming.source && !sourcesArr.includes(incoming.source)) {
      sourcesArr.push(incoming.source);
    }

    const merged = {
      specs,
      specSections,
      keySpecs,
      multiLangSpecs,
      multiLangSections,
      nameTranslated,
      images: existingImages.slice(0, 8),
      specsCount: Object.keys(specs).length,
      // Affiliate / identity fields: only fill if missing on the existing record.
      ...(oldData.gtin || !incoming.gtin ? {} : { gtin: incoming.gtin }),
      ...(oldData.mpn  || !incoming.mpn  ? {} : { mpn:  incoming.mpn  }),
      // Preserve original source as the primary; record additional sources
      // for audit. The first scraper to write a model owns its "home" url.
      sources: sourcesArr,
    };
    _assertCleanEnglishPayload(merged, merged.name || existingId);

    await pb.collection('products').update(existingId, merged, { $autoCancel: false });
    return merged;
  } catch (e) {
    slog(`  ⚠ cross-source merge failed for ${existingId}: ${e.message}`, 'warn');
    return null;
  }
}

if (typeof window !== 'undefined') {
  window._findExistingByVariantGroup = _findExistingByVariantGroup;
  window._mergeIntoExistingRecord = _mergeIntoExistingRecord;
}

async function _loadExistingSourceUrls(categoryId) {
  const empty = { urls: new Set(), slugs: new Set(), byVariantGroup: new Map() };
  const isScrapedRecord = (record = {}) => {
    const src = String(record.source || '').toLowerCase();
    return /(epey|geizhals)/.test(src) ||
      /(^|\.)(epey\.com|geizhals\.eu)\//.test(String(record.sourceUrl || ''));
  };
  try {
    const safeCategory = String(categoryId || '').replace(/"/g, '\\"');
    const categoryFilter = safeCategory ? `category = "${safeCategory}"` : '';
    const sourceFilter = `(source = "epey.com" || source = "epey" || source = "geizhals.eu" || source = "geizhals")`;
    const filter = categoryFilter || sourceFilter;
    const docs = await _pbGetAllPaged('products', {
      filter,
      sort: 'id',
      fields: 'id,name,sourceUrl,slug,variantGroup,source',
    }, 500, safeCategory ? 120000 : 45000);
    const urls = new Set();
    const slugs = new Set();
    const byVariantGroup = new Map();
    for (const d of docs) {
      const data = typeof d.data === 'function' ? d.data() : (d.data || d);
      const isScraped = isScrapedRecord(data);
      if (isScraped && data?.sourceUrl) {
        const rawUrl = String(data.sourceUrl).trim();
        urls.add(rawUrl);
        const normalized = normalizeScrapeUrlKey(rawUrl);
        if (normalized) urls.add(normalized);
        const urlSlug = slugFromUrl(rawUrl);
        if (urlSlug) slugs.add(urlSlug);
      }
      if (isScraped && d.id) slugs.add(String(d.id));
      const savedSlug = String(data?.slug || '').trim();
      if (isScraped && savedSlug) slugs.add(savedSlug);
      const vg = String(data?.variantGroup || '').trim();
      if (vg && d.id) {
        const rec = { id: d.id, source: String(data?.source || ''), name: String(data?.name || '') };
        if (!byVariantGroup.has(vg)) byVariantGroup.set(vg, rec);
      }
    }
    slog(`  preload OK: ${docs.length} kayıt, ${urls.size} URL key, ${slugs.size} slug key`, 'success');
    return { urls, slugs, byVariantGroup };
  } catch (e) {
    slog(`  (existing-product preload failed: ${e.message})`, 'warn');
    return empty;
  }
}

function getAllEpeyScrapeCategories() {
  const all = (typeof QorAiCategories !== 'undefined' && QorAiCategories.getAll)
    ? QorAiCategories.getAll()
    : [];
  const byId = new Map();
  for (const cat of all) {
    const id = String(cat?.id || '').trim();
    if (!id || !cat?.epeyPath || cat?.scrapeDisabled || byId.has(id)) continue;
    byId.set(id, cat);
  }
  return [...byId.values()];
}

function getCheckedEpeyScrapeCategories() {
  if (typeof document === 'undefined' || typeof QorAiCategories === 'undefined') return [];
  const ids = [...document.querySelectorAll('#scrapeCategoryChecklist input[type="checkbox"]:checked')]
    .map(cb => String(cb.value || '').trim())
    .filter(Boolean);
  const byId = new Map();
  ids.forEach(id => {
    const cat = QorAiCategories.getById?.(id);
    if (!cat?.id || !cat.epeyPath || cat.scrapeDisabled || byId.has(cat.id)) return;
    byId.set(cat.id, cat);
  });
  return [...byId.values()];
}

async function startBulkScrape() {
  if (scraperRunning) { toast('Scraper already running', 'w'); return; }
  if (!(await checkProxy())) { toast('Start the local proxy first', 'e'); return; }

  const categoryId = document.getElementById('scrapeCategory')?.value?.trim() || '';
  const checkedCats = getCheckedEpeyScrapeCategories();
  if (!categoryId && !checkedCats.length) { toast('En az bir kategori seç', 'w'); return; }
  const selectedCat = categoryId !== '__all_epey__' && typeof QorAiCategories !== 'undefined'
    ? QorAiCategories.getById?.(categoryId)
    : null;
  if (selectedCat?.scrapeDisabled) {
    toast('Bu kategori Epey scrape için kapalı; Desktop PCs ile aynı kaynağa gidiyor.', 'w');
    return;
  }
  const maxProducts = parseInt(document.getElementById('scrapeMaxProducts')?.value) || 6000;
  const delay = parseInt(document.getElementById('scrapeDelay')?.value) || 300;
  const concurrency = getEpeyDetailConcurrency();

  scraperRunning = true; scraperAbort = false;
  if (typeof window !== 'undefined') window.qoraiScrapeActive = true;
  if (typeof window !== 'undefined') {
    window.qoraiAutoScoreSuppressed = true;
  }
  document.getElementById('btnBulkScrape').style.display = 'none';
  document.getElementById('btnStopScrape').style.display = '';
  clearScraperLog();
  slog(`Scraper build: ${SCRAPER_BUILD}`, 'info');
  const isAllCategories = categoryId === '__all_epey__';
  const catsForRun = isAllCategories
    ? getAllEpeyScrapeCategories()
    : (checkedCats.length ? checkedCats : (selectedCat ? [selectedCat] : []));
  slog(
    isAllCategories
      ? `Epey import: TÜM kategoriler · max ${maxProducts}/kategori`
      : catsForRun.length > 1
        ? `Epey import: ${catsForRun.length} seçili kategori · max ${maxProducts}/kategori`
        : `Epey import: category=${catsForRun[0]?.id || categoryId} · max ${maxProducts}`,
    'info'
  );

  try {
    if (catsForRun.length !== 1 || isAllCategories) {
      const cats = catsForRun;
      if (!cats.length) {
        slog('No Epey-enabled categories found.', 'error');
        finishScraping();
        return;
      }
      const totals = { added: 0, updated: 0, skipped: 0, errors: 0, missingCats: [] };
      // Surface admin categories that have NO epeyPath so the user knows
      // up front which ones can never be scraped from Epey.
      try {
        const allAdminCats = (typeof QorAiCategories !== 'undefined' && QorAiCategories.getAll)
          ? QorAiCategories.getAll() : [];
        const noEpey = allAdminCats.filter(c => c?.id && !c?.epeyPath).map(c => c.id);
        if (noEpey.length) {
          slog(`ℹ️ Epey path tanımlı olmayan ${noEpey.length} kategori atlanıyor: ${noEpey.join(', ')}`, 'info');
        }
      } catch (_) { /* non-fatal logging */ }
      slog(`📚 ${cats.length} Epey kategorisi var. Önce TÜMÜNÜN URL'leri toplanacak, sonra çekme aşaması başlayacak.`, 'info');
      slog(`   Sıralama: ${cats.map(c => c.id).join(' → ')}`, 'info');

      // ── PHASE 1: collect every category's URLs upfront ────────────
      // This way the user sees the full workload before any scraping
      // burns proxy quota, and a single bad category cannot abort the
      // collection for the rest.
      const collected = []; // [{ cat, items }]
      let totalUrls = 0;
      const collectStart = Date.now();
      slog(`\n┏━━ PHASE 1 / 2 — URL TOPLAMA (${cats.length} kategori) ━━┓`, 'info');
      for (let ci = 0; ci < cats.length && !scraperAbort; ci++) {
        const cat = cats[ci];
        slog(`\n[Toplama ${ci + 1}/${cats.length}] ${cat.name || cat.id} (${cat.id})`, 'info');
        let items = [];
        try {
          items = await collectSearchProductUrls('', maxProducts, cat.id);
        } catch (e) {
          slog(`  ❌ ${cat.id} URL toplama hatası: ${e.message}`, 'error');
          totals.errors++;
          totals.missingCats.push(cat.id);
          continue;
        }
        if (!items || !items.length) {
          slog(`  ⚠️ ${cat.id}: 0 URL (kategori boş veya Epey path eksik)`, 'warn');
          totals.missingCats.push(cat.id);
          continue;
        }
        const trimmed = items.slice(0, maxProducts);
        collected.push({ cat, items: trimmed });
        totalUrls += trimmed.length;
        slog(`  ✓ ${cat.id}: ${trimmed.length} URL toplandı (kümülatif ${totalUrls})`, 'success');
      }
      const collectSec = ((Date.now() - collectStart) / 1000).toFixed(1);
      slog(`\n┗━━ PHASE 1 tamam: ${collected.length}/${cats.length} kategori, toplam ${totalUrls} URL (${collectSec}s) ━━┛`, 'success');
      if (totals.missingCats.length) {
        slog(`⚠️ Atlanan kategoriler: ${totals.missingCats.join(', ')}`, 'warn');
      }

      if (scraperAbort) {
        slog('Stopped during URL collection.', 'warn');
        finishScraping();
        return;
      }
      if (!collected.length) {
        slog('No URLs collected from any category.', 'error');
        finishScraping();
        return;
      }

      // ── PHASE 2: scrape each category's collected URLs ────────────
      slog(`\n┏━━ PHASE 2 / 2 — ÇEKME (${collected.length} kategori, ${totalUrls} URL) ━━┓`, 'info');
      let processed = 0;
      for (let ci = 0; ci < collected.length && !scraperAbort; ci++) {
        const { cat, items } = collected[ci];
        slog(`\n━━━ [Çekme ${ci + 1}/${collected.length}] ${cat.name || cat.id} (${cat.id}) — ${items.length} URL ━━━`, 'info');
        const res = await sequentialScrape(items, cat.id, delay, concurrency);
        totals.added += res.added || 0;
        totals.updated += res.updated || 0;
        totals.skipped += res.skipped || 0;
        totals.errors += res.errors || 0;
        processed += items.length;
        slog(`━━━ ${cat.id} done: ${res.added} eklendi | ${res.updated} güncellendi | ${res.skipped} atlandı | ${res.errors} hata · ilerleme ${processed}/${totalUrls} URL ━━━`, 'success');
        if (ci < collected.length - 1 && !scraperAbort) await sleep(Math.max(1000, Math.min(delay * 3, 5000)));
      }

      slog(`\n═══ All categories done: ${totals.added} eklendi | ${totals.updated} güncellendi | ${totals.skipped} atlandı | ${totals.errors} hata${scraperAbort ? ' | STOPPED' : ''} ═══`, scraperAbort ? 'warn' : 'success');
      if ((totals.added > 0 || totals.updated > 0) && typeof loadProducts === 'function') await loadProducts();
      finishScraping();
      return;
    }

    const singleCat = catsForRun[0];
    const urlItems = await collectSearchProductUrls('', maxProducts, singleCat?.id || categoryId);
    slog(`Found ${urlItems.length} Epey product URLs`, urlItems.length ? 'success' : 'warn');
    if (!urlItems.length) {
      slog('No product URLs found. Check the category or proxy.', 'error');
      finishScraping();
      return;
    }
    const results = await sequentialScrape(urlItems.slice(0, maxProducts), singleCat?.id || categoryId, delay, concurrency);
    slog(`\n═══ Done: ${results.added} eklendi | ${results.updated} güncellendi | ${results.skipped} atlandı | ${results.errors} hata ═══`, 'success');
    if ((results.added > 0 || results.updated > 0) && typeof loadProducts === 'function') await loadProducts();
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
      if (!url) {
        let isEpeyUrl = false;
        try { isEpeyUrl = /(^|\.)epey\.com$/i.test(new URL(inputVal).hostname); } catch {}
        if (!isEpeyUrl) { toast('Epey veya Geizhals URL destekleniyor', 'e'); return; }
        slog(`Epey liste/filtre URL çözümleniyor: ${inputVal}`, 'info');
        const res = await fetch(
          `${PROXY_URL}/category-links?url=${encodeURIComponent(inputVal)}&max=5`,
          { signal: AbortSignal.timeout(120000) }
        );
        const data = res.ok ? await res.json() : null;
        const items = Array.isArray(data?.items)
          ? data.items
          : (Array.isArray(data?.links) ? data.links.map(x => typeof x === 'string' ? { url: x } : x) : []);
        url = normalizeEpeyProductUrl(items[0]?.url || '');
        if (!url) {
          slog('Bu Epey URL ürün sayfası değil ve içinden ürün linki bulunamadı.', 'error');
          toast('Epey ürün linki bulunamadı', 'e');
          return;
        }
        slog(`İlk Epey ürün linki: ${url}`, 'info');
      } else {
        slog(`Direct Epey product URL: ${url}`, 'info');
      }
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
    // Single-URL path mirrors bulk-scrape: inline translation + cross-source
    // dedup so manually-added products are indistinguishable from bulk-scraped ones.
    await _translateProductInline(clean);
    _assertCleanEnglishPayload(clean, clean.name || clean.slug || url);
    if (clean.variantGroup) {
      const existing = await _findExistingByVariantGroup(clean.variantGroup);
      if (existing && existing.source && existing.source !== clean.source) {
        const merged = await _mergeIntoExistingRecord(existing.id, clean);
        if (merged) {
          window.dispatchEvent(new CustomEvent('qorai:product-saved', { detail: { id: existing.id, product: merged } }));
          slog(`↻ Cross-source merge into ${existing.id} (${existing.source})`, 'info');
          if (typeof loadProducts === 'function') await loadProducts();
          return;
        }
      }
    }
    const saved = await _saveProductWithRetry(clean, clean.name || clean.slug || url);
    window.dispatchEvent(new CustomEvent('qorai:product-saved', { detail: { id: saved?.id || clean.slug, product: clean } }));
    const langCount = Object.keys(clean.multiLangSpecs || {}).length;
    slog(`Saved: ${clean.name} (${clean.specsCount} specs, ${clean.images?.length || 0} images, ${langCount} dilde çeviri)`, 'success');
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

// ═══════════════════════════════════════════════════════════════════════════
//  LIVE DICTIONARY COUNTERS
//  The TR (Epey) and DE (Geizhals) dictionaries grow as new atoms hit
//  DeepSeek. The header badge polls both sources every second so the user
//  can watch the cache warm up.
// ═══════════════════════════════════════════════════════════════════════════
function _getDictSizes() {
  let tr = 0, de = 0;
  try { tr = window.QorAiDict?.size?.() ?? Object.keys(window.QorAiDict?.cache?.() || {}).length; } catch {}
  try {
    const g = window.QorAiGeizhals?.dict;
    de = g?.size?.() ?? Object.keys(g?.cache?.() || {}).length;
  } catch {}
  return { tr, de };
}

function _refreshDictCounter() {
  const { tr, de } = _getDictSizes();
  const text = `TR ${tr.toLocaleString()} · DE ${de.toLocaleString()}`;
  const headerEl = document.getElementById('dictCounterText');
  if (headerEl) headerEl.textContent = text;
  const trEl = document.getElementById('dictCountTr');
  if (trEl) trEl.textContent = tr.toLocaleString();
  const deEl = document.getElementById('dictCountDe');
  if (deEl) deEl.textContent = de.toLocaleString();
}

// Pre-load both dicts on first scraper view, then poll for live changes.
let _dictCounterStarted = false;
async function _startDictCounter() {
  if (_dictCounterStarted) return;
  _dictCounterStarted = true;
  // Warm up TR dict (Epey scraper)
  try { await _loadDeDict(); } catch {}
  // Warm up DE dict (Geizhals scraper, if loaded)
  try { await window.QorAiGeizhals?.dict?.load?.(); } catch {}
  _refreshDictCounter();
  setInterval(_refreshDictCounter, 1000);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _startDictCounter);
  } else {
    _startDictCounter();
  }
}

window.showDictCounterPopup = function () {
  _refreshDictCounter();
  const el = document.getElementById('dictCounterPopup');
  if (!el) return;
  const opening = el.style.display === 'none';
  el.style.display = opening ? 'block' : 'none';
  if (opening && typeof window.openDictionaryPanel === 'function') {
    window.openDictionaryPanel();
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  SOURCE-AWARE SCRAPER ROUTER (Epey | Geizhals)
//
//  The HTML wires startBulkScrape() / scrapeByUrl() onto its buttons.
//  We intercept those globals AFTER scraper.js has finished loading so the
//  buttons route to either the Epey path (this file) or the Geizhals path
//  (admin/js/scraper-geizhals.js → window.QorAiGeizhals).
//
//  Both sources share:
//   - the same 49 PB category ids (categories.js whitelist)
//   - the same inline translation pipeline (window.QorAiBulkTranslate)
//   - the same dictionary (public_config.tr_translation_dict)
// ═══════════════════════════════════════════════════════════════════════════

// Stash the Epey entry points BEFORE we reassign the globals.
const _epeyStartBulkScrape = startBulkScrape;
const _epeyScrapeByUrl = scrapeByUrl;

function _resolveScrapeSource() {
  return document.getElementById('scrapeSource')?.value || 'epey';
}

function _detectSourceFromUrl(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (/(^|\.)geizhals\.(eu|at|de|com)$/i.test(host)) return 'geizhals';
    if (/(^|\.)epey\.com$/i.test(host)) return 'epey';
  } catch {}
  const u = raw.toLowerCase();
  if (/geizhals\.(eu|at|de|com)(?:[/?#]|$)/.test(u)) return 'geizhals';
  if (/(?:^|\/\/|\.)epey\.com(?:[/?#]|$)/.test(u)) return 'epey';
  return null;
}

window.startBulkScrape = async function () {
  const src = _resolveScrapeSource();
  if (src === 'geizhals') {
    if (!window.QorAiGeizhals?.startBulkScrape) {
      if (typeof toast === 'function') toast('Geizhals scraper not loaded', 'e');
      return;
    }
    return window.QorAiGeizhals.startBulkScrape();
  }
  return _epeyStartBulkScrape();
};

window.scrapeByUrl = async function () {
  const inputVal = document.getElementById('scrapeUrl')?.value?.trim() || '';
  // URL takes precedence: a geizhals.eu link always routes to the Geizhals
  // scraper, regardless of the bulk-scrape dropdown selection. Plain search
  // terms (no http://) fall back to the Bulk Scrape dropdown.
  const fromUrl = inputVal.startsWith('http') ? _detectSourceFromUrl(inputVal) : null;
  const src = fromUrl || _resolveScrapeSource();
  if (src === 'geizhals') {
    if (!window.QorAiGeizhals?.scrapeByUrl) {
      if (typeof toast === 'function') toast('Geizhals scraper not loaded', 'e');
      return;
    }
    return window.QorAiGeizhals.scrapeByUrl();
  }
  return _epeyScrapeByUrl();
};

// Source-aware speed defaults. Epey has no Cloudflare so we run flat-out:
// 100k limit, 0 delay, 20 parallel workers (max 32). Geizhals fronted by
// Cloudflare so we throttle: 30k limit, 800 ms delay, 6 parallel workers
// (max 12). When the user picks a source we overwrite the three inputs
// unless the user has manually customised them this session.
const _SCRAPE_PRESETS = {
  epey:     { max: 100000, delay: 0,    concurrency: 20, concurrencyMax: 32 },
  geizhals: { max: 30000,  delay: 800,  concurrency: 6,  concurrencyMax: 12 },
};
let _scrapeUserOverride = { max: false, delay: false, concurrency: false };
function _bindScrapeOverrideListeners() {
  const tag = (id, key) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.overrideBound) return;
    el.dataset.overrideBound = '1';
    el.addEventListener('input', () => { _scrapeUserOverride[key] = true; });
  };
  tag('scrapeMaxProducts', 'max');
  tag('scrapeDelay', 'delay');
  tag('scrapeConcurrency', 'concurrency');
}
window.updateScrapeSourceUI = function () {
  const src = _resolveScrapeSource();
  const hint = document.getElementById('scrapeSourceHint');
  const preset = _SCRAPE_PRESETS[src] || _SCRAPE_PRESETS.epey;
  _bindScrapeOverrideListeners();
  const maxEl = document.getElementById('scrapeMaxProducts');
  const delayEl = document.getElementById('scrapeDelay');
  const concEl = document.getElementById('scrapeConcurrency');
  if (maxEl && !_scrapeUserOverride.max) maxEl.value = preset.max;
  if (delayEl && !_scrapeUserOverride.delay) delayEl.value = preset.delay;
  if (concEl) {
    concEl.max = String(preset.concurrencyMax);
    if (!_scrapeUserOverride.concurrency) concEl.value = preset.concurrency;
  }
  if (hint) {
    hint.textContent = src === 'geizhals'
      ? `Geizhals.eu: Cloudflare korumalı — temkinli (${preset.concurrency} worker, ${preset.delay} ms delay). Almanca specs, AB fiyatları.`
      : `Epey.com: Cloudflare yok — tam hız (${preset.concurrency} worker, ${preset.delay} ms delay). Türkçe specs ve isimler.`;
  }
};
// Apply initial preset on DOM ready so the UI matches the pre-selected source.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.updateScrapeSourceUI(), { once: true });
  } else {
    setTimeout(() => window.updateScrapeSourceUI(), 0);
  }
}
