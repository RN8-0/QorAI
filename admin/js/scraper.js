// ═══════════════════════════════════════════════════════════════════
//  QOR AI SCRAPER MODULE — Full-Featured Browser Scraper
//  Scrapes products from epey.com via local CORS proxy.
//  Translates Turkish → English using QorAiDict (dictionary.js).
//  Uses QorAiCategories / QorAiBrands (categories.js).
//  Persists to PocketBase via pb_client.js helpers.
// ═══════════════════════════════════════════════════════════════════

const PROXY_URL = 'http://localhost:3456';
const EPEY_BASE = 'https://www.epey.com';
const PROXY_START_COMMAND = 'npm run scraper:proxy';

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
    toast('Proxy baslatma komutu panoya kopyalandi.', 's');
  } catch (_) {
    toast(`Komutu elle calistir: ${PROXY_START_COMMAND}`, 'i', 6000);
  }
}

function openLocalProxyHealth() {
  window.open(`${PROXY_URL}/health`, '_blank', 'noopener');
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

  // Build grouped options HTML for bulk scrape (value = epeyPath)
  let bulkOpts = '<option value="">— Kategori Seçin —</option>';
  // Build flat options for other dropdowns (value = category id)
  let flatOpts = '<option value="">Tüm Kategoriler</option>';

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
    scoreEngSel.innerHTML = '<option value="">Tüm Kategoriler</option>' + flatOpts;
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

  // Priority 1: #puan element
  const puan = doc.querySelector('#puan');
  if (puan) {
    const s = parseScore(puan.textContent);
    if (s) return s;
  }

  // Priority 2: .circliful
  const circ = doc.querySelector('.circliful');
  if (circ) {
    const s = parseScore(circ.textContent);
    if (s) return s;
  }

  // Priority 3: data attributes
  const attrEl = doc.querySelector('[data-teknikpuan]') || doc.querySelector('[data-tpuan]');
  if (attrEl) {
    const val = attrEl.getAttribute('data-teknikpuan') || attrEl.getAttribute('data-tpuan');
    const s = parseScore(val);
    if (s) return s;
  }

  // Priority 4: ID-based elements
  for (const id of ['teknikpuan', 'tekpuan', 'tpuan']) {
    const el = doc.getElementById(id);
    if (el) {
      const s = parseScore(el.textContent);
      if (s) return s;
    }
  }

  // Priority 5: class-based
  for (const sel of ['.teknikpuan', '.puan_deger', '.puan', '.teknik-puan']) {
    const el = doc.querySelector(sel);
    if (el) {
      const s = parseScore(el.textContent);
      if (s) return s;
    }
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

function extractPrice(doc) {
  if (typeof doc === 'string') doc = parseHTML(doc);

  const PRICE_SELECTORS = [
    '.fiyat', '.price', '[data-price]', '.urun-fiyat',
    '.urun-fiyat strong', '.epey-fiyat', '.en-dusuk-fiyat',
    '.product-price', '.current-price', '.sale-price',
    '#fiyat', '#price', '.fiyat-bilgi'
  ];

  function parsePrice(text) {
    if (!text) return null;
    let cleaned = text
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '.')
      .replace(/[^\d.]/g, '');
    const num = parseFloat(cleaned);
    if (isNaN(num) || num <= 0 || num >= 1000000000) return null;
    return num;
  }

  // data-price attribute
  const dpEl = doc.querySelector('[data-price]');
  if (dpEl) {
    const p = parsePrice(dpEl.getAttribute('data-price'));
    if (p) return p;
  }

  // CSS selectors
  for (const sel of PRICE_SELECTORS) {
    const el = doc.querySelector(sel);
    if (el) {
      const p = parsePrice(el.textContent);
      if (p) return p;
    }
  }

  // Fallback: scan all leaf text nodes for TL / ₺
  const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.trim();
    if ((text.includes('TL') || text.includes('₺')) && text.length < 50) {
      const p = parsePrice(text);
      if (p) return p;
    }
  }

  return null;
}

// ═══════════════════════════════════════
//  10. IMAGE EXTRACTION
// ═══════════════════════════════════════

function extractImages(doc, productSlug) {
  if (typeof doc === 'string') doc = parseHTML(doc);
  const seen = new Set();
  const images = [];

  function isValid(url) {
    if (!url || typeof url !== 'string') return false;
    if (!url.includes('resim.epey.com')) return false;
    if (url.includes('/tema/') || url.includes('/marka/') || url.includes('/kategori/')) return false;
    return true;
  }

  function upgradeSize(url) {
    // Replace size prefixes: /k_, /s_, /m_, /t_, /c_ → /b_
    return url.replace(/\/[ksmtc]_/g, '/b_');
  }

  function addImage(url) {
    if (!url) return;
    let u = url.trim();
    if (u.startsWith('//')) u = 'https:' + u;
    if (!u.startsWith('http')) return;
    u = upgradeSize(u).split(/[?#]/)[0];
    if (!isValid(u)) return;
    const key = u.toLowerCase().replace(/\.(jpe?g|png|webp|gif|avif)$/, '');
    if (seen.has(key)) return;
    if (images.length >= 8) return;
    seen.add(key);
    images.push(u);
  }

  function extractDataAttrs(el) {
    for (const attr of ['data-src', 'data-zoom', 'data-big', 'data-full',
      'data-image', 'data-url', 'data-original', 'data-lazy', 'src', 'href']) {
      const val = el.getAttribute(attr);
      if (val && val.includes('resim.epey.com')) addImage(val);
    }
  }

  // 1. Main image: #resimBuyuk
  const mainImg = doc.querySelector('#resimBuyuk');
  if (mainImg) {
    extractDataAttrs(mainImg);
    // Also check child img/a
    mainImg.querySelectorAll('img, a').forEach(child => extractDataAttrs(child));
  }

  // 2. Thumbnails: #resimk
  const thumbContainer = doc.querySelector('#resimk');
  if (thumbContainer) {
    thumbContainer.querySelectorAll('*').forEach(el => {
      extractDataAttrs(el);
      // onclick URL extraction
      const onclick = el.getAttribute('onclick') || '';
      const onclickMatch = onclick.match(/['"]([^'"]*resim\.epey\.com[^'"]*)['"]/);
      if (onclickMatch) addImage(onclickMatch[1]);
    });
  }

  // 3. Page-wide data attributes with slug filter
  const dataSelectors = '[data-zoom], [data-big], [data-full], [data-src], [data-image], [data-url]';
  doc.querySelectorAll(dataSelectors).forEach(el => {
    for (const attr of ['data-zoom', 'data-big', 'data-full', 'data-src', 'data-image', 'data-url']) {
      const val = el.getAttribute(attr);
      if (val && val.includes('resim.epey.com')) {
        if (!productSlug || val.toLowerCase().includes(productSlug.toLowerCase().replace(/\.html$/i, ''))) {
          addImage(val);
        }
      }
    }
  });

  // 4. All <img> with lazy attributes
  doc.querySelectorAll('img').forEach(img => {
    for (const attr of ['data-src', 'data-lazy', 'data-original', 'src']) {
      const val = img.getAttribute(attr);
      if (val && val.includes('resim.epey.com')) {
        if (!productSlug || val.toLowerCase().includes(productSlug.toLowerCase().replace(/\.html$/i, ''))) {
          addImage(val);
        }
      }
    }
  });

  // 5. og:image fallback
  const ogImg = doc.querySelector('meta[property="og:image"]');
  if (ogImg) {
    const content = ogImg.getAttribute('content');
    if (content && content.includes('resim.epey.com')) {
      // Insert at front if not already present
      const upgraded = upgradeSize(content.trim().split(/[?#]/)[0]);
      const key = upgraded.toLowerCase().replace(/\.(jpe?g|png|webp|gif|avif)$/, '');
      if (!seen.has(key) && images.length < 8) {
        images.unshift(upgraded);
        seen.add(key);
      }
    }
  }

  // Carousel guard: drop last if it matches first
  if (images.length > 1 && images[images.length - 1] === images[0]) {
    images.pop();
  }

  return images.slice(0, 8);
}

async function fetchGalleryImages(productSlug) {
  if (!productSlug) return [];
  const galleryUrl = `${EPEY_BASE}/${productSlug}-resimleri.html`;
  try {
    const html = await proxyFetch(galleryUrl);
    if (!html) return [];
    const doc = parseHTML(html);
    const imgs = [];
    doc.querySelectorAll('img[src*="resim.epey.com"]').forEach(img => {
      const src = img.getAttribute('src') || '';
      if (src.includes('/b_')) imgs.push(src);
      else {
        const upgraded = src.replace(/\/[ksmtc]_/g, '/b_');
        if (upgraded.includes('/b_')) imgs.push(upgraded);
      }
    });
    return imgs;
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════
//  11. SPEC PARSING
// ═══════════════════════════════════════

function parseSpecs(doc) {
  const specs = {};
  const specSections = {};
  const keySpecs = {};

  // ── PRIMARY: #ozellikler section ──
  const ozellikler = doc.querySelector('#ozellikler');
  if (ozellikler) {

    // Helper: parse all li items from a UL and add to specs
    function parseLiList(ul, sectionName) {
      if (!specSections[sectionName]) specSections[sectionName] = {};
      ul.querySelectorAll('li').forEach(li => {
        const strong = li.querySelector('strong');
        if (!strong) return;
        const key = strong.textContent.trim();
        if (!key) return;

        let value = '';
        const cellSpan = li.querySelector('span.cell');
        if (cellSpan) {
          const anchors = cellSpan.querySelectorAll('a');
          if (anchors.length > 0) {
            value = Array.from(anchors).map(a => a.textContent.trim()).filter(Boolean).join('\n');
          }
          if (!value) {
            const innerSpans = cellSpan.querySelectorAll('span');
            if (innerSpans.length > 1) {
              value = Array.from(innerSpans).map(s => s.textContent.trim()).filter(Boolean).join('\n');
            }
          }
          if (!value) value = cellSpan.textContent.trim();
        } else {
          const clone = li.cloneNode(true);
          const sc = clone.querySelector('strong');
          if (sc) sc.remove();
          value = clone.textContent.trim();
        }

        if (key && value && key.length < 200 && value.length < 1000) {
          specs[key] = value;
          specSections[sectionName][key] = value;
        }
      });
    }

    // Strategy 1: masonry-brick layout (e.g. epey.com)
    // Each brick contains one h3 (section) + one ul (specs list)
    const bricks = ozellikler.querySelectorAll('.masonry-brick');
    if (bricks.length > 0) {
      bricks.forEach(brick => {
        const h3 = brick.querySelector('h3');
        const sectionName = h3
          ? (h3.querySelector('span')?.textContent.trim() || h3.textContent.trim())
          : 'General';
        const ul = brick.querySelector('ul');
        if (ul) parseLiList(ul, sectionName);
      });
    }

    // Strategy 2: flat children walk (h3 followed by ul as siblings)
    if (Object.keys(specs).length === 0) {
      let currentSection = 'General';
      const walk = (parent) => {
        for (const child of parent.children) {
          if (child.tagName === 'H3') {
            currentSection = child.querySelector('span')?.textContent.trim()
              || child.textContent.trim();
            if (!specSections[currentSection]) specSections[currentSection] = {};
          } else if (child.tagName === 'UL') {
            parseLiList(child, currentSection);
          } else if (child.children.length > 0) {
            // Recurse one level into wrapper divs
            for (const sub of child.children) {
              if (sub.tagName === 'H3') {
                currentSection = sub.querySelector('span')?.textContent.trim()
                  || sub.textContent.trim();
                if (!specSections[currentSection]) specSections[currentSection] = {};
              } else if (sub.tagName === 'UL') {
                parseLiList(sub, currentSection);
              }
            }
          }
        }
      };
      walk(ozellikler);
    }
  }

  // ── FALLBACK: table-based specs ──
  if (Object.keys(specs).length === 0) {
    const tables = doc.querySelectorAll('#bilgiler tr, .spec-table tr, table.specs tr, table tr');
    let currentSection = 'General';

    tables.forEach(tr => {
      // Section header row (th spanning columns or single th)
      const th = tr.querySelector('th');
      if (th && tr.querySelectorAll('td').length === 0) {
        currentSection = th.textContent.trim();
        if (!specSections[currentSection]) specSections[currentSection] = {};
        return;
      }

      const tds = tr.querySelectorAll('td');
      if (tds.length >= 2) {
        const key = tds[0].textContent.trim();
        const val = tds[1].textContent.trim();
        if (key && val && key.length < 200 && val.length < 1000) {
          specs[key] = val;
          if (!specSections[currentSection]) specSections[currentSection] = {};
          specSections[currentSection][key] = val;
        }
      }
    });
  }

  // ── KEY SPECS: "Temel Özellikler" box ──
  // .cell .row1 (label) + .cell .row2 (value) outside #ozellikler
  doc.querySelectorAll('.cell').forEach(cell => {
    if (ozellikler && ozellikler.contains(cell)) return;
    const row1 = cell.querySelector('.row1');
    const row2 = cell.querySelector('.row2');
    if (row1 && row2) {
      const k = row1.textContent.trim();
      const v = row2.textContent.trim();
      if (k && v) keySpecs[k] = v;
    }
  });

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
//  13. PRODUCT DETAIL SCRAPING
// ═══════════════════════════════════════

async function scrapeProductDetail(html, url, categoryId) {
  if (!html) return null;
  const doc = parseHTML(html);
  const dict = getDict();

  // Detect garbage / redirect pages
  const bodyText = (doc.body ? doc.body.textContent : '').trim();
  if (bodyText.length < 100) return null;

  // ── Name ──
  let originalName = '';
  const h1a = doc.querySelector('h1 > a');
  if (h1a) {
    originalName = h1a.textContent.trim();
  } else {
    const h1 = doc.querySelector('h1');
    if (h1) originalName = h1.textContent.trim();
  }
  if (!originalName) return null;

  const name = dict ? dict.translateProductName(originalName) : originalName;

  // ── URL slug & ID ──
  const productSlug = slugFromUrl(url);
  const id = generateProductId(productSlug);

  // ── Specs ──
  const { specs: rawSpecs, specSections: rawSections, keySpecs: rawKeySpecs } = parseSpecs(doc);

  // Translate
  const translatedSpecs = translateSpecsObject(rawSpecs);
  const translatedSections = translateSections(rawSections);
  const translatedKeySpecs = translateKeySpecs(rawKeySpecs);

  // Filter Turkish-language specs
  const filtered = filterSpecs(translatedSpecs, translatedSections);
  const finalSpecs = filtered.specs || translatedSpecs;
  const finalSections = filtered.sections || translatedSections;

  // ── Brand ──
  const brand = extractBrand(name, { ...rawSpecs, ...finalSpecs });

  // ── Category ──
  let category = categoryId || '';
  if (!category) {
    const catSlug = categorySlugFromUrl(url);
    const cats = (typeof window !== 'undefined' && window.QorAiCategories)
      ? window.QorAiCategories.getAll() : [];
    const found = cats.find(c => c.epeyPath === catSlug || c.epeyPath.split('/')[0] === catSlug);
    category = found ? found.id : catSlug;
  }

  // ── Tech Score ──
  const techScore = extractTechScore(doc);

  // ── Price ──
  const price_raw = extractPrice(doc);

  // ── Images ──
  let images = extractImages(doc, productSlug);
  // Try gallery page for extra images
  if (images.length < 4 && productSlug) {
    try {
      const galleryImgs = await fetchGalleryImages(productSlug);
      const seenKeys = new Set(images.map(u => (u || '').toLowerCase().replace(/\.(jpe?g|png|webp|gif|avif)$/, '').split(/[?#]/)[0]));
      for (const giRaw of galleryImgs) {
        if (images.length >= 8) break;
        const gi = (giRaw || '').split(/[?#]/)[0];
        const key = gi.toLowerCase().replace(/\.(jpe?g|png|webp|gif|avif)$/, '');
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          images.push(gi);
        }
      }
    } catch {}
  }

  // ── Variant Group ──
  const variantGroup = normalizeVariantGroupFromSlug(productSlug);

  // ── Collect untranslated Turkish terms for free backlog sync ──
  if (dict && dict.collectUntranslatedTerms) {
    dict.collectUntranslatedTerms({
      name: originalName,
      specs: rawSpecs,
      specSections: rawSections,
      keySpecs: rawKeySpecs
    });
  }

  return {
    id,
    slug: productSlug || id,
    name: name || 'Unknown Product',
    brand,
    category,
    source: 'epey',
    sourceUrl: url,
    imageUrl: images[0] || '',
    images,
    specs: finalSpecs,
    specSections: finalSections,
    keySpecs: translatedKeySpecs,
    techScore: techScore || null,
    price_raw: price_raw || null,
    specsCount: Object.keys(finalSpecs).length,
    variantGroup,
    scrapedAt: new Date().toISOString(),
    _originalName: originalName,
    _originalSpecs: rawSpecs,
    _originalSections: rawSections,
    _originalKeySpecs: rawKeySpecs,
  };
}

// ═══════════════════════════════════════
//  14. PRODUCT URL COLLECTION
// ═══════════════════════════════════════

function extractProductLinksFromDoc(doc) {
  const results = [];
  const seen = new Set();

  // Try #listele container first, then other known containers
  let container = doc.querySelector('#listele') || doc.querySelector('.urunler') || doc.querySelector('.listele') || doc.querySelector('.urun-listesi');
  const searchRoot = container || doc;

  // Relaxed pattern: any link with a category-like path and .html ending
  const productLinkRe = /^\/[a-z0-9][a-z0-9\/-]*\/[a-z0-9][a-z0-9._-]*\.html$/i;

  // Strategy 1: Standard .html links
  searchRoot.querySelectorAll('a[href]').forEach(a => {
    let href = a.getAttribute('href') || '';
    if (!href) return;

    // Handle absolute URLs from epey.com
    if (href.startsWith('https://www.epey.com/') || href.startsWith('http://www.epey.com/')) {
      try { href = new URL(href).pathname; } catch { return; }
    }

    // Must end with .html and match product pattern
    if (!href.endsWith('.html')) return;
    if (!productLinkRe.test(href)) return;
    if (href.includes('/en/') || href.includes('/sayfa/') || href.includes('/karsilastir/')) return;
    // Skip non-product pages (about, contact, etc)
    if (href.startsWith('/yardim') || href.startsWith('/hakkimizda') || href.startsWith('/iletisim')) return;

    const fullUrl = EPEY_BASE + href;
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    // Try extracting tech score from parent card
    let techScore = null;
    const card = a.closest('.urun, .urun-k, .liste-urun, [class*="product"], [class*="urun"], li, div.row, tr');
    if (card) techScore = extractListingTechScore(card);

    results.push({ url: fullUrl, techScore });
  });

  // Strategy 2: data-href or onclick links (some pages use JS for navigation)
  if (results.length === 0) {
    searchRoot.querySelectorAll('[data-href], [data-url], [onclick]').forEach(el => {
      let href = el.getAttribute('data-href') || el.getAttribute('data-url') || '';
      if (!href) {
        const onclick = el.getAttribute('onclick') || '';
        const m = onclick.match(/['"](\/?[a-z0-9-]+\/[a-z0-9-]+\.html)['"]/i);
        if (m) href = m[1];
      }
      if (!href || !href.endsWith('.html')) return;
      if (!href.startsWith('/')) href = '/' + href;
      if (!productLinkRe.test(href)) return;
      const fullUrl = EPEY_BASE + href;
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);
      results.push({ url: fullUrl, techScore: null });
    });
  }

  return results;
}

async function collectProductUrls(epeyPath, maxPages = 50) {
  const baseUrl = `${EPEY_BASE}/${epeyPath}/`;
  slog(`Collecting product URLs from: ${epeyPath}`);

  const allItems = [];
  const seenUrls = new Set();
  let emptyCount = 0;
  let dupePages = 0;

  for (let page = 1; page <= maxPages && !scraperAbort; page++) {
    // Try ?sayfa=N parameter
    const pageUrl = page === 1 ? baseUrl : `${baseUrl}?sayfa=${page}`;
    updateProgress(page, maxPages, 'Listing pages');

    try {
      const html = await proxyFetch(pageUrl);
      if (!html) {
        emptyCount++;
        if (emptyCount >= 2) {
          slog(`2 consecutive empty pages, stopping at page ${page}`, 'info');
          break;
        }
        continue;
      }

      const doc = parseHTML(html);
      const items = extractProductLinksFromDoc(doc);

      // Debug: log page structure info on first page if no results
      if (items.length === 0 && page === 1) {
        const allLinks = doc.querySelectorAll('a[href]').length;
        const htmlLinks = doc.querySelectorAll('a[href$=".html"]').length;
        const hasListele = !!doc.querySelector('#listele');
        const title = doc.querySelector('title')?.textContent || '';
        slog(`Debug: ${allLinks} links total, ${htmlLinks} .html links, #listele: ${hasListele}, title: "${title.slice(0,60)}"`, 'warn');
        // Check if it's a Cloudflare challenge
        if (title.includes('Just a moment') || title.includes('Checking') || html.length < 2000) {
          slog('⚠️ Cloudflare challenge not bypassed. Proxy may need update.', 'error');
        }
      }

      if (items.length === 0) {
        emptyCount++;
        if (emptyCount >= 2) {
          slog(`2 consecutive empty pages, stopping at page ${page}`, 'info');
          break;
        }
        // Try filter URL pattern
        const filterUrl = `${EPEY_BASE}/e/${epeyPath}/${page}/`;
        try {
          const filterHtml = await proxyFetch(filterUrl);
          if (filterHtml) {
            const filterDoc = parseHTML(filterHtml);
            const filterItems = extractProductLinksFromDoc(filterDoc);
            if (filterItems.length > 0) {
              emptyCount = 0;
              let newCount = 0;
              for (const item of filterItems) {
                if (!seenUrls.has(item.url)) {
                  seenUrls.add(item.url);
                  allItems.push(item);
                  newCount++;
                }
              }
              slog(`Page ${page} (filter): ${filterItems.length} products (${newCount} new)`, 'success');
              continue;
            }
          }
        } catch {}
        continue;
      }

      emptyCount = 0;
      let newCount = 0;
      for (const item of items) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          allItems.push(item);
          newCount++;
        }
      }

      if (newCount === 0) {
        dupePages++;
        slog(`Page ${page}: all ${items.length} duplicates (${dupePages}/3)`, 'warn');
        if (dupePages >= 3) {
          slog('3 all-duplicate pages, stopping pagination', 'info');
          break;
        }
      } else {
        dupePages = 0;
        slog(`Page ${page}: ${items.length} products (${newCount} new, ${allItems.length} total)`, 'success');
      }

      if (page < maxPages) await sleep(1500 + Math.random() * 1000);
    } catch (e) {
      slog(`Page ${page} error: ${e.message}`, 'error');
      emptyCount++;
      if (emptyCount >= 2) break;
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

        const product = await scrapeProductDetail(html, item.url, categoryId);
        if (!product || product.name === 'Unknown Product' || product.specsCount === 0) {
          slog(`  → Skipped (no data): ${slug}`, 'warn');
          results.skipped++;
          continue;
        }

        // Use listing-page tech score if page didn't have one
        if (!product.techScore && item.techScore) {
          product.techScore = item.techScore;
        }

        // Save to PocketBase
        await pbSetDoc('products', product.slug || product.id, product);
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
        slog(`  → Error: ${slug} — ${e.message}`, 'error');

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
  slog(`Computing price segments for: ${categoryId}`);

  let products;
  try {
    const items = await pbGetAll('products', { filter: `category="${categoryId}"` });
    products = items
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.price_raw && p.price_raw > 0);
  } catch (e) {
    slog(`Failed to load products for segments: ${e.message}`, 'error');
    return;
  }

  if (products.length < 2) {
    slog(`Not enough products with prices (${products.length}) for segments`, 'warn');
    return;
  }

  products.sort((a, b) => a.price_raw - b.price_raw);
  let updated = 0;
  const toUpdate = [];

  for (let i = 0; i < products.length; i++) {
    const percentile = i / (products.length - 1);
    let segment;
    if (percentile < 0.25) segment = 'budget';
    else if (percentile < 0.60) segment = 'mid_range';
    else if (percentile < 0.85) segment = 'premium';
    else segment = 'flagship';

    if (products[i].priceSegment !== segment) {
      toUpdate.push({ id: products[i].id, segment });
      updated++;
    }
  }

  if (updated > 0) {
    try {
      await Promise.all(toUpdate.map(({ id, segment }) => pbUpdateDoc('products', id, { priceSegment: segment })));
      slog(`Updated ${updated} price segments (${products.length} products)`, 'success');
    } catch (e) {
      slog(`Failed to update price segments: ${e.message}`, 'error');
    }
  } else {
    slog('Price segments unchanged', 'info');
  }
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

  // Parse category: catValue can be a category ID or an epeyPath
  const cats = (window.QorAiCategories) ? window.QorAiCategories.getAll() : [];
  const catDef = cats.find(c => c.id === catValue || c.epeyPath === catValue);
  const epeyPath = catDef ? catDef.epeyPath : catValue;
  const categoryId = catDef ? catDef.id : catValue;

  const pageStart = parseInt(document.getElementById('scrapePageStart')?.value) || 1;
  const pageEnd = parseInt(document.getElementById('scrapePageEnd')?.value) || 50;
  const maxProducts = parseInt(document.getElementById('scrapeMaxProducts')?.value) || 500;
  const delay = parseInt(document.getElementById('scrapeDelay')?.value) || 2000;
  const channelCount = parseInt(document.getElementById('scrapeChannels')?.value) || 3;

  scraperRunning = true;
  scraperAbort = false;
  const btnBulk = document.getElementById('btnBulkScrape');
  const btnStop = document.getElementById('btnStopScrape');
  if (btnBulk) btnBulk.style.display = 'none';
  if (btnStop) btnStop.style.display = '';

  clearScraperLog();
  slog(`Bulk scrape: ${categoryId} (${epeyPath}), pages 1-${pageEnd}, max ${maxProducts}, ${channelCount} channels`, 'info');

  // Load learned translations at start
  await loadLearnedTranslations();

  // Phase 1: Collect product URLs
  slog('── Phase 1: Collecting product URLs ──', 'info');
  const urlItems = await collectProductUrls(epeyPath, pageEnd);

  if (scraperAbort) {
    slog('Scrape stopped by user during URL collection', 'warn');
    finishScraping();
    return;
  }

  if (urlItems.length === 0) {
    slog('No product URLs found. Check the category path.', 'error');
    finishScraping();
    return;
  }

  // Check existing products
  const existingUrls = new Set();
  if (typeof allProducts !== 'undefined' && allProducts.length > 0) {
    allProducts.forEach(p => { if (p.sourceUrl) existingUrls.add(p.sourceUrl); });
  } else {
    try {
      const items = await pbGetAll('products', { filter: `category="${categoryId}"` });
      items.forEach(d => {
        const data = d.data();
        if (data.sourceUrl) existingUrls.add(data.sourceUrl);
      });
    } catch {}
  }

  const newItems= urlItems.filter(item => !existingUrls.has(item.url));
  slog(`Found ${urlItems.length} total, ${newItems.length} new (${urlItems.length - newItems.length} existing)`);

  const toScrape = newItems.slice(0, maxProducts);
  if (toScrape.length === 0) {
    slog('No new products to scrape', 'info');
    finishScraping();
    return;
  }

  // Phase 2: Parallel scrape
  slog(`── Phase 2: Scraping ${toScrape.length} products (${channelCount} channels) ──`, 'info');
  const results = await parallelScrape(toScrape, categoryId, delay, channelCount);

  // Phase 3: Price segments
  if (results.added > 0) {
    slog('── Phase 3: Computing price segments ──', 'info');
    await computePriceSegments(categoryId);
  }

  // Final untranslated backlog flush
  triggerAITranslation();

  slog(`\n═══ Bulk scrape complete ═══`, 'success');
  slog(`Added: ${results.added} | Skipped: ${results.skipped} | Errors: ${results.errors}${scraperAbort ? ' | STOPPED BY USER' : ''}`,
    results.added > 0 ? 'success' : 'warn');

  finishScraping();
}

// ═══════════════════════════════════════
//  19. SINGLE URL SCRAPE
// ═══════════════════════════════════════

async function scrapeByUrl() {
  const urlInput = document.getElementById('scrapeUrl');
  const url = urlInput ? urlInput.value.trim() : '';
  if (!url) { toast('Enter a URL', 'w'); return; }
  if (!url.includes('epey.com')) { toast('Only epey.com URLs are supported', 'e'); return; }
  if (!(await checkProxy())) { toast('Start the local proxy first', 'e'); return; }

  clearScraperLog();
  slog(`Scraping: ${url}`);

  try {
    await loadLearnedTranslations();

    const html = await proxyFetch(url);
    if (!html) {
      slog('Page not found (404)', 'error');
      toast('Page not found', 'e');
      return;
    }

    const product = await scrapeProductDetail(html, url);
    if (!product) {
      slog('Failed to parse product. The page may have redirected or has no content.', 'error');
      toast('Failed to parse product', 'e');
      return;
    }

    if (product.specsCount === 0) {
      slog('No specs found. The page might have a different structure.', 'warn');
    }

    slog(`Name: ${product.name}`);
    slog(`Brand: ${product.brand} | Category: ${product.category}`);
    slog(`Specs: ${product.specsCount} | Score: ${product.techScore || '-'}`);
    slog(`Images: ${product.images.length} | Price: ${product.price_raw || '-'}`);
    slog(`ID: ${product.id}`);

    // Check if product already exists — merge missing data
    const lookupKey = product.slug || product.id;
    const existingDoc = await pbGetDoc('products', lookupKey);
    if (existingDoc.exists) {
      const existing = existingDoc.data();
      slog('⚡ Product already exists — merging missing data...', 'info');

      // Merge images: normalize URLs (upgrade size prefix) before dedup
      const _normImg = u => u ? u.replace(/\/[ksmtc]_/g, '/b_').trim() : u;
      const existingImages = (existing.images || []).map(_normImg).filter(Boolean);
      const newImages = (product.images || []).map(_normImg).filter(Boolean);
      const seenImgs = new Set(existingImages);
      const mergedImages = [...existingImages];
      for (const img of newImages) {
        if (!seenImgs.has(img)) { seenImgs.add(img); mergedImages.push(img); }
      }
      const mergedSliced = mergedImages.slice(0, 8);
      product.images = mergedSliced;
      if (product.imageUrl) product.imageUrl = _normImg(product.imageUrl);
      if (product.imageURL) product.imageURL = _normImg(product.imageURL);
      if (mergedImages.length > existingImages.length) {
        slog(`  + ${mergedImages.length - existingImages.length} new images added (total: ${mergedImages.length})`, 'success');
      }

      // Merge specs: add new specs that don't exist
      const existingSpecs = existing.specs || {};
      const newSpecs = product.specs || {};
      const mergedSpecs = { ...existingSpecs };
      let addedSpecs = 0;
      for (const [k, v] of Object.entries(newSpecs)) {
        if (!mergedSpecs[k]) { mergedSpecs[k] = v; addedSpecs++; }
      }
      product.specs = mergedSpecs;
      product.specsCount = Object.keys(mergedSpecs).length;
      if (addedSpecs > 0) slog(`  + ${addedSpecs} new specs added (total: ${product.specsCount})`, 'success');

      // Merge specSections
      const existingSections = existing.specSections || {};
      const newSections = product.specSections || {};
      const mergedSections = { ...existingSections };
      for (const [sec, specObj] of Object.entries(newSections)) {
        if (!mergedSections[sec]) { mergedSections[sec] = specObj; }
        else {
          for (const [k, v] of Object.entries(specObj)) {
            if (!mergedSections[sec][k]) mergedSections[sec][k] = v;
          }
        }
      }
      product.specSections = mergedSections;

      // Keep existing fields that new scrape might miss
      if (!product.techScore && existing.techScore) product.techScore = existing.techScore;
      if (!product.price_raw && existing.price_raw) product.price_raw = existing.price_raw;
      if (!product.brand && existing.brand) product.brand = existing.brand;

      // Keep first scrape date
      if (existing.scrapedAt) product.firstScrapedAt = existing.scrapedAt;

      slog('Merging complete — saving updated product', 'info');
    }

    const saved = await pbSetDoc('products', lookupKey, product);
    if (saved?.id) product.id = saved.id;
    if (saved?.slug) product.slug = saved.slug;
    slog('Product saved to PocketBase!', 'success');
    toast(`${existingDoc?.exists ? 'Updated' : 'Added'}: ${product.name}`, 's');

    // Persist untranslated terms after single-item scrape
    triggerAITranslation();

    // Refresh in-memory list
    if (typeof allProducts !== 'undefined') {
      const idx = allProducts.findIndex(p => p.id === product.id);
      if (idx >= 0) allProducts[idx] = product;
      else allProducts.push(product);
    }
  } catch (e) {
    slog(`Error: ${e.message}`, 'error');
    toast('Scrape failed: ' + e.message, 'e');
  }
}

// ═══════════════════════════════════════
//  20. SCORE UPDATE
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
      products = allProducts.filter(p => p.sourceUrl && p.sourceUrl.includes('epey.com'));
    } else {
      const items = await pbGetAll('products', { filter: `source="epey" || source="epey.com"` });
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
      const score = extractTechScore(html);
      if (score !== null && score !== p.techScore) {
        await pbUpdateDoc('products', p.id, {
          techScore: score,
          scoreUpdatedAt: new Date().toISOString()
        });
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
      products = allProducts.filter(p => p.sourceUrl && p.sourceUrl.includes('epey.com'));
    } else {
      const items = await pbGetAll('products', { filter: `source="epey" || source="epey.com"` });
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
        'name', 'brand', 'techScore', 'price_raw', 'imageUrl',
        'specsCount', 'variantGroup'
      ];
      for (const field of compareFields) {
        if (freshProduct[field] !== undefined &&
          JSON.stringify(freshProduct[field]) !== JSON.stringify(existing[field])) {
          changes[field] = freshProduct[field];
        }
      }

      // Deep compare objects
      const objFields = ['specs', 'specSections', 'keySpecs', 'images',
        '_originalSpecs', '_originalSections', '_originalKeySpecs'];
      for (const field of objFields) {
        if (freshProduct[field] !== undefined &&
          JSON.stringify(freshProduct[field]) !== JSON.stringify(existing[field])) {
          changes[field] = freshProduct[field];
        }
      }

      if (Object.keys(changes).length > 0) {
        changes.updatedAt = new Date().toISOString();
        changes._originalName = freshProduct._originalName;
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
  const catDef = cats.find(c => c.id === catValue || c.epeyPath === catValue);
  const epeyPath = catDef ? catDef.epeyPath : catValue;
  const categoryId = catDef ? catDef.id : catValue;

  const pages = parseInt(document.getElementById('inventoryPages')?.value) || 30;

  scraperRunning = true;
  scraperAbort = false;
  clearScraperLog();

  slog(`Scanning inventory: ${categoryId} (${epeyPath}), up to ${pages} pages`);

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
  const urlItems = await collectProductUrls(epeyPath, pages);

  if (scraperAbort) {
    slog('Scan stopped by user', 'warn');
    finishScraping();
    return;
  }

  const allUrls = urlItems.map(item => item.url);
  const newUrls = allUrls.filter(u => !existingUrls.has(u));
  const missingUrls = [...existingUrls].filter(u => !allUrls.includes(u));

  slog(`\n═══ Inventory scan complete ═══`, 'success');
  slog(`Total on epey.com: ${allUrls.length}`);
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
  return u.replace(/\/[ksmtc]_/g, '/b_').split(/[?#]/)[0].trim();
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
  if (scraperRunning) { toast('Scraper zaten çalışıyor', 'w'); return; }
  scraperRunning = true;
  scraperAbort = false;
  document.getElementById('btnFixImages').style.display = 'none';
  document.getElementById('btnStopQuality').style.display = '';
  clearScraperLog();
  slog('══ Görsel Temizleme Başladı ══', 'info');
  slog('Tüm ürünler taranıyor: URL normalize + duplikat kaldır + max 8...', 'info');

  let products = [];
  try {
    const total = (await getPb().collection('products').getList(1, 1, {})).totalItems;
    const pages = Math.ceil(total / 500);
    slog(`Toplam ${total} ürün, ${pages} sayfa`, 'info');
    for (let page = 1; page <= pages && !scraperAbort; page++) {
      const r = await getPb().collection('products').getList(page, 500, {});
      products.push(...r.items);
      updateProgress(page, pages, 'Yükleniyor');
    }
  } catch(e) { slog('Yükleme hatası: ' + e.message, 'error'); _finishQualityScan(); return; }

  slog(`✓ ${products.length} ürün yüklendi. Temizleniyor...`, 'success');

  let fixed = 0, skipped = 0;
  for (let i = 0; i < products.length && !scraperAbort; i++) {
    const p = products[i];
    updateProgress(i + 1, products.length, 'Temizleniyor');

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
        slog(`  ✓ ${p.name || p.id}: ${(p.images||[]).length} → ${cleaned.length} görsel`, 'success');
      }
    } catch(e) {
      slog(`  ✗ ${p.name || p.id}: ${e.message}`, 'error');
    }
  }

  slog(`\n══ Tamamlandı ══`, 'success');
  slog(`✓ Düzeltildi: ${fixed} | Zaten temiz: ${skipped}`, 'success');
  _finishQualityScan();
  document.getElementById('btnFixImages').style.display = '';
}

async function startQualityScan() {
  if (scraperRunning) { toast('Scraper zaten çalışıyor', 'w'); return; }
  if (!(await checkProxy())) { toast('Önce proxy\'yi başlatın', 'e'); return; }

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

  slog('══ Kalite Taraması Başladı ══', 'info');
  slog(`Kategori: ${cat || 'Tümü'} | Min spec: ${minSpecs} | Min görsel: ${minImages}`, 'info');

  // ── Load all products via pagination (PB perPage capped at 500) ──
  slog('\n[1/4] PocketBase\'den ürünler yükleniyor...', 'info');
  let products = [];
  try {
    const filter = cat ? `category="${cat}"` : '';
    const PER_PAGE = 500;
    const first = await getPb().collection('products').getList(1, PER_PAGE, { filter, sort: '-techScore' });
    const total = first.totalItems;
    const pages = Math.ceil(total / PER_PAGE);
    products.push(...first.items.map(d => ({ _docId: d.id, ...d })));
    slog(`Toplam ${total} ürün, ${pages} sayfa`, 'info');
    updateProgress(1, pages, 'Yükleniyor');
    for (let page = 2; page <= pages && !scraperAbort; page++) {
      const r = await getPb().collection('products').getList(page, PER_PAGE, { filter, sort: '-techScore' });
      products.push(...r.items.map(d => ({ _docId: d.id, ...d })));
      updateProgress(page, pages, 'Yükleniyor');
    }
    slog(`✓ ${products.length} ürün yüklendi`, 'success');
  } catch (e) {
    slog(`Ürünler yüklenemedi: ${e.message}`, 'error');
    _finishQualityScan();
    return;
  }

  // ── Phase 1: Detect quality issues ──
  slog(`\n[2/4] Kalite kontrolü yapılıyor...`, 'info');
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

  slog(`✓ Sorunsuz: ${goodProducts.length} | ⚠️ Sorunlu: ${badProducts.length}`, badProducts.length > 0 ? 'warn' : 'success');
  if (badProducts.length > 0) {
    slog('Sorunlu ürünler (ilk 30):', 'warn');
    badProducts.slice(0, 30).forEach(p => slog(`  ⚠️ ${p.name || p._docId}: ${p._issues.join(', ')}`, 'warn'));
    if (badProducts.length > 30) slog(`  ... ve ${badProducts.length - 30} ürün daha`, 'warn');
  }

  // ── Phase 1b: Broken image URL check (optional, parallel batched) ──
  if (doCheckImages && !scraperAbort) {
    slog(`\n[2b/4] Görsel URL erişilebilirlik testi yapılıyor (${goodProducts.length + badProducts.length} ürün)...`, 'info');
    slog('Paralel 20\'şer batch ile test ediliyor...', 'info');
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
        slog(`  🔴 Kırık görsel: ${p.name || p._docId}`, 'warn');
        const alreadyBad = badProducts.some(b => b._docId === p._docId);
        if (!alreadyBad) {
          badProducts.push({ ...p, _issues: ['kırık görsel URL'] });
          const idx = goodProducts.findIndex(g => g._docId === p._docId);
          if (idx !== -1) goodProducts.splice(idx, 1);
        } else {
          const existing = badProducts.find(b => b._docId === p._docId);
          if (existing && !existing._issues.includes('kırık görsel URL')) {
            existing._issues.push('kırık görsel URL');
          }
        }
        brokenCount++;
      }
      processed += slice.length;
      updateProgress(processed, allToCheck.length, 'Görsel Test');
    }
    slog(`✓ Kırık görsel URL testi tamamlandı: ${brokenCount} kırık görsel bulundu`, brokenCount > 0 ? 'warn' : 'success');
  }

  // ── Phase 1b: Re-scrape bad products ──
  if (doRescrape && badProducts.length > 0 && !scraperAbort) {
    slog(`\n[3/4] ${badProducts.length} sorunlu ürün yeniden scrape ediliyor...`, 'info');
    _scrapeStartTime = Date.now();
    let fixed = 0, failed = 0, deleted = 0;

    for (let i = 0; i < badProducts.length && !scraperAbort; i++) {
      const p = badProducts[i];
      updateProgress(i + 1, badProducts.length, 'Yeniden Scrape');
      slog(`[${i + 1}/${badProducts.length}] ${p.name || p._docId} (${p._issues.join(', ')})`);

      try {
        const html = await proxyFetch(p.sourceUrl);
        if (!html) {
          slog(`  → 404/yok. Siliniyor...`, 'warn');
          await pbDeleteDoc('products', p._docId);
          deleted++;
          continue;
        }

        const fresh = await scrapeProductDetail(html, p.sourceUrl, p.category || cat);
        if (!fresh || (fresh.specsCount || 0) === 0) {
          slog(`  → Geçersiz sayfa. Atlanıyor.`, 'warn');
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
        if (update.images) improvements.push(`${mergedSliced.length} görsel`);
        if (update.specs) improvements.push(`${freshSpecCount} spec`);
        slog(`  → Düzeltildi: ${improvements.join(', ')}`, 'success');
        fixed++;
      } catch (e) {
        slog(`  → Hata: ${e.message}`, 'error');
        failed++;
      }

      await sleep(delay);
    }

    slog(`\nYeniden scrape tamamlandı: Düzeltilen ${fixed} | Başarısız ${failed} | Silinen ${deleted}`, 'success');
  } else if (!doRescrape) {
    slog('\n[3/4] Yeniden scrape atlandı (seçenek kapalı)', 'info');
  }

  // ── Phase 2: Deduplication ──
  if (doDedupe && !scraperAbort) {
    slog('\n[4/4] Duplikasyon taraması başlıyor...', 'info');
    await _runDeduplication(products, cat);
  } else if (!doDedupe) {
    slog('\n[4/4] Duplikasyon taraması atlandı (seçenek kapalı)', 'info');
  }

  slog('\n═══ Kalite Taraması Tamamlandı ═══', 'success');
  triggerAITranslation();
  _finishQualityScan();
}

async function startDeduplicateOnly() {
  if (scraperRunning) { toast('Scraper zaten çalışıyor', 'w'); return; }

  const cat = document.getElementById('qualityScanCategory')?.value || '';

  scraperRunning = true;
  scraperAbort = false;
  document.getElementById('btnQualityScan').style.display = 'none';
  document.getElementById('btnStopQuality').style.display = '';
  clearScraperLog();

  slog('══ Duplikasyon Temizliği Başladı ══', 'info');
  slog(`Kategori: ${cat || 'Tümü'}`, 'info');

  slog('\nPocketBase\'den ürünler yükleniyor...', 'info');
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
      updateProgress(page, pages, 'Yükleniyor');
    }
    slog(`✓ ${products.length} ürün yüklendi`, 'success');
  } catch (e) {
    slog(`Yüklenemedi: ${e.message}`, 'error');
    _finishQualityScan();
    return;
  }

  await _runDeduplication(products, cat);

  slog('\n═══ Duplikasyon Temizliği Tamamlandı ═══', 'success');
  _finishQualityScan();
}

async function _runDeduplication(products, categoryFilter) {
  // Step 1: Group by exact same sourceUrl (definitive duplicates)
  slog('\n— Aynı kaynak URL\'ye sahip duplikatlar kontrol ediliyor...', 'info');
  const byUrl = new Map();
  for (const p of products) {
    if (categoryFilter && p.category !== categoryFilter) continue;
    const url = (p.sourceUrl || '').replace(/\?.*$/, '').replace(/\/$/, '').toLowerCase();
    if (!url) continue;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(p);
  }

  const urlDups = [...byUrl.values()].filter(g => g.length > 1);
  slog(`Aynı URL'den ${urlDups.length} duplikat grup bulundu`, urlDups.length > 0 ? 'warn' : 'success');

  let totalDeleted = 0;

  for (const group of urlDups) {
    if (scraperAbort) break;
    const sorted = group.slice().sort((a, b) => _qualityScore(b) - _qualityScore(a));
    const keeper = sorted[0];
    const toDelete = sorted.slice(1);
    slog(`\n[URL Dup] "${keeper.name || keeper._docId}"`, 'warn');
    slog(`  ✓ TUTULAN: ${keeper._docId} (score: ${_qualityScore(keeper)})`, 'success');
    for (const dup of toDelete) {
      slog(`  🗑️ SİLİNDİ: ${dup._docId} (score: ${_qualityScore(dup)})`, 'warn');
      try {
        await _mergeAndDelete(keeper, dup);
        totalDeleted++;
      } catch (e) {
        slog(`    Hata: ${e.message}`, 'error');
      }
    }
  }

  // Step 2: Group by normalized name within category
  slog('\n— İsim benzerliğine göre duplikatlar kontrol ediliyor...', 'info');
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
  slog(`İsim bazlı ${nameDups.length} potansiyel duplikat grup bulundu`, nameDups.length > 0 ? 'warn' : 'success');

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

    slog(`\n[İsim Dup] "${key.split('::')[1]}"`, 'warn');
    slog(`  ✓ TUTULAN: ${keeper.name || keeper._docId} (score: ${_qualityScore(keeper)}, specs: ${keeper.specsCount || 0})`, 'success');
    for (const dup of toDelete) {
      slog(`  🗑️ SİLİNDİ: ${dup.name || dup._docId} (score: ${_qualityScore(dup)}, specs: ${dup.specsCount || 0})`, 'warn');
      try {
        await _mergeAndDelete(keeper, dup);
        totalDeleted++;
      } catch (e) {
        slog(`    Hata: ${e.message}`, 'error');
      }
    }
  }

  slog(`\nDuplikasyon tamamlandı: ${totalDeleted} kayıt silindi`, 'success');
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
