/* ═══════════════════════════════════════════════════════════════
   Compair — app.js  (EPEY-style layout)
   ═══════════════════════════════════════════════════════════════ */

// Firebase config removed — using PocketBase (pb_client.js)

const CAT_META = {
  smartphones:  { icon: '📱', label: 'Telefonlar' },
  laptops:      { icon: '💻', label: 'Laptoplar' },
  tablets:      { icon: '📟', label: 'Tabletler' },
  headphones:   { icon: '🎧', label: 'Kulaklık' },
  gpus:         { icon: '⚙️', label: 'GPU' },
  monitors:     { icon: '🖥️', label: 'Monitör' },
  tvs:          { icon: '📺', label: 'TV' },
  smartwatches: { icon: '⌚', label: 'Akıllı Saat' },
  cameras:      { icon: '📷', label: 'Kamera' },
  speakers:     { icon: '🔊', label: 'Hoparlör' },
  keyboards:    { icon: '⌨️', label: 'Klavye' },
  mice:         { icon: '🖱️', label: 'Fare' },
};

const PLACEHOLDER_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 24 24' fill='none' stroke='%2355556a' stroke-width='1.5'%3E%3Crect x='2' y='2' width='20' height='20' rx='3'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E`;

let db = null;
let allProducts = [];
let filteredProducts = [];
let displayCount = 24;
let currentSort = 'score';
let currentCat = 'all';
let compareList = [];
let searchDebounce = null;
let activeFilters = {
  categories: [],
  prices: [],
  scores: []
};

/* ── Firebase Init (removed — using PocketBase) ─────────────── */
async function initFirebase() {
  try {
    db = {}; // stub for backward compat
    await loadProducts();
  } catch (e) {
    console.error('Init failed', e);
    showError('Bağlantı hatası. Lütfen sayfayı yenileyin.');
  }
}

/* ── Load Products ──────────────────────────────────────────────── */
async function loadProducts() {
  try {
    const items = await pbLoadProducts(500);
    allProducts = items
      .filter(p => p.name && p.imageUrl);
    allProducts.sort((a, b) => (b.techScore || 0) - (a.techScore || 0));
    filteredProducts = [...allProducts];
    buildCategoryFilters();
    renderProducts();
  } catch (e) {
    console.error('loadProducts failed', e);
    showError('Ürünler yüklenemedi. Lütfen tekrar deneyin.');
  }
}

/* ── Search ─────────────────────────────────────────────────────── */
async function doSearch(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    applyFilters();
    return;
  }

  const local = allProducts.filter(p => {
    const name  = (p.name     || '').toLowerCase();
    const brand = (p.brand    || '').toLowerCase();
    const cat   = (p.category || '').toLowerCase();
    return name.includes(q) || brand.includes(q) || cat.includes(q);
  });

  if (local.length < 5) {
    try {
      const remote = await pbSearchProducts(query, 50);
      const ids = new Set(local.map(p => p.id));
      remote.forEach(p => { if (!ids.has(p.id)) local.push(p); });
    } catch (e) {
      console.warn('Remote search failed', e);
    }
  }

  filteredProducts = local;
  displayCount = 24;
  renderProducts();
}

/* ── Apply Filters ───────────────────────────────────────────────── */
function applyFilters() {
  let results = [...allProducts];

  if (currentCat !== 'all') {
    results = results.filter(p => (p.category || '').toLowerCase() === currentCat);
  }

  if (activeFilters.categories.length > 0) {
    results = results.filter(p =>
      activeFilters.categories.includes((p.category || '').toLowerCase())
    );
  }

  if (activeFilters.prices.length > 0) {
    results = results.filter(p =>
      activeFilters.prices.includes(p.price_segment || '')
    );
  }

  if (activeFilters.scores.length > 0) {
    results = results.filter(p => {
      const s = p.techScore || 0;
      return activeFilters.scores.some(threshold => {
        const t = parseInt(threshold, 10);
        if (t === 80) return s >= 80;
        if (t === 60) return s >= 60 && s < 80;
        if (t === 0)  return s < 60;
        return false;
      });
    });
  }

  results = sortProducts(results, currentSort);
  filteredProducts = results;
  displayCount = 24;
  renderProducts();
}

/* ── Sort ───────────────────────────────────────────────────────── */
function sortProducts(arr, type) {
  const sorted = [...arr];
  switch (type) {
    case 'score':      sorted.sort((a, b) => (b.techScore  || 0) - (a.techScore  || 0)); break;
    case 'price-asc':  sorted.sort((a, b) => (a.price_raw  || 0) - (b.price_raw  || 0)); break;
    case 'price-desc': sorted.sort((a, b) => (b.price_raw  || 0) - (a.price_raw  || 0)); break;
    case 'name':       sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr')); break;
  }
  return sorted;
}

function sortBy(type) {
  currentSort = type;
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === type);
  });
  filteredProducts = sortProducts(filteredProducts, type);
  renderProducts();
}

/* ── Filter by Category (nav tabs) ─────────────────────────────── */
function filterByCategory(cat) {
  currentCat = cat;
  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.cat === cat);
  });
  applyFilters();
}

/* ── Build Sidebar Category Checkboxes ──────────────────────────── */
function buildCategoryFilters() {
  const container = document.getElementById('filter-categories');
  if (!container) return;

  const cats = [...new Set(allProducts.map(p => (p.category || '').toLowerCase()))].sort();
  container.innerHTML = cats.map(cat => {
    const meta = CAT_META[cat] || { icon: '📦', label: cat };
    return `<label class="filter-label">
      <input type="checkbox" class="cat-filter" value="${cat}">
      ${meta.icon} ${meta.label}
    </label>`;
  }).join('');

  container.querySelectorAll('.cat-filter').forEach(cb => {
    cb.addEventListener('change', () => {
      activeFilters.categories = [...container.querySelectorAll('.cat-filter:checked')].map(c => c.value);
      applyFilters();
    });
  });
}

/* ── Render Products ────────────────────────────────────────────── */
function renderProducts() {
  const grid = document.getElementById('product-grid');
  const countEl = document.getElementById('product-count');
  const loadMoreBtn = document.getElementById('load-more');

  if (!grid) return;

  const total = filteredProducts.length;
  const slice = filteredProducts.slice(0, displayCount);

  if (countEl) {
    countEl.textContent = total === 0
      ? 'Ürün bulunamadı'
      : `${total} ürün`;
  }

  if (total === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text3)">
      <div style="font-size:48px;margin-bottom:12px">🔍</div>
      <div style="font-size:16px;font-weight:600;color:var(--text2);margin-bottom:8px">Ürün bulunamadı</div>
      <div style="font-size:13px">Farklı bir arama terimi veya filtre deneyin.</div>
    </div>`;
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    return;
  }

  grid.innerHTML = slice.map(p => createProductCard(p)).join('');

  if (loadMoreBtn) {
    loadMoreBtn.style.display = displayCount < total ? 'inline-block' : 'none';
  }
}

/* ── Create Product Card ────────────────────────────────────────── */
function createProductCard(p) {
  const cat = (p.category || '').toLowerCase();
  const meta = CAT_META[cat] || { icon: '📦', label: cat || 'Diğer' };
  const score = p.techScore != null ? p.techScore : null;
  const inCompare = compareList.includes(p.id);

  return `<div class="product-card" onclick="openModal('${esc(p.id)}')">
    <div class="card-img-wrap">
      <img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy" onerror="this.src='${PLACEHOLDER_SVG}'">
    </div>
    <div class="card-body">
      <div class="card-cat-tag">${meta.icon} ${meta.label}</div>
      <div class="card-name">${esc(p.name)}</div>
      <div class="card-meta">${scoreBadgeHtml(score)}</div>
      ${formatPrice(p.price_raw) ? `<div class="card-price">${formatPrice(p.price_raw)}</div>` : ''}
      <button class="card-compare-btn${inCompare ? ' in-compare' : ''}"
        onclick="event.stopPropagation();toggleCompare('${esc(p.id)}','${esc(p.name)}')">
        ${inCompare ? '✓ Listede' : '+ Karşılaştır'}
      </button>
    </div>
  </div>`;
}

/* ── Load More ──────────────────────────────────────────────────── */
function loadMore() {
  displayCount += 24;
  renderProducts();
}

/* ── Open Modal ─────────────────────────────────────────────────── */
function openModal(productId) {
  const p = allProducts.find(x => x.id === productId)
         || filteredProducts.find(x => x.id === productId);
  if (!p) return;

  const cat = (p.category || '').toLowerCase();
  const meta = CAT_META[cat] || { icon: '📦', label: cat || 'Diğer' };
  const score = p.techScore != null ? p.techScore : null;
  const inCompare = compareList.includes(p.id);

  const topSpecs = buildTopSpecs(p);
  const accordionHtml = buildSpecAccordion(p);

  const html = `<div class="modal-product">
    <div class="modal-product-header">
      <img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" class="modal-product-img"
           onerror="this.src='${PLACEHOLDER_SVG}'">
      <div class="modal-product-info">
        <div class="modal-cat-tag">${meta.icon} ${meta.label}</div>
        <h2 class="modal-product-name">${esc(p.name)}</h2>
        <div class="modal-product-meta">
          ${scoreBadgeHtml(score, '16px', '6px 14px')}
          <span class="modal-price">${formatPrice(p.price_raw)}</span>
        </div>
        <div class="modal-actions">
          <button class="btn-compare" id="modal-compare-btn"
            onclick="toggleCompare('${esc(p.id)}','${esc(p.name)}');updateModalCompareBtn('${esc(p.id)}')">
            ${inCompare ? '✓ Listede' : '+ Karşılaştırmaya Ekle'}
          </button>
          <a href="compair://product/${esc(p.id)}" class="btn-app">📱 Uygulamada Aç</a>
        </div>
      </div>
    </div>
    ${topSpecs ? `<div class="modal-specs-grid">${topSpecs}</div>` : ''}
    <div class="modal-full-specs" id="modal-full-specs">${accordionHtml}</div>
  </div>`;

  const content = document.getElementById('modal-content');
  if (content) content.innerHTML = html;

  document.getElementById('product-modal-overlay')?.classList.add('open');
  document.getElementById('product-modal')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function updateModalCompareBtn(id) {
  const btn = document.getElementById('modal-compare-btn');
  if (!btn) return;
  const inCompare = compareList.includes(id);
  btn.textContent = inCompare ? '✓ Listede' : '+ Karşılaştırmaya Ekle';
}

function buildTopSpecs(p) {
  const keys = ['brand', 'processor', 'ram', 'storage', 'display', 'camera', 'battery', 'os',
                 'gpu', 'resolution', 'refresh_rate', 'weight', 'connectivity', 'price_segment'];
  const items = [];
  for (const k of keys) {
    if (p[k] != null && p[k] !== '') {
      items.push(`<div class="spec-item">
        <span class="spec-key">${labelFor(k)}</span>
        <span class="spec-val">${esc(String(p[k]))}</span>
      </div>`);
      if (items.length >= 8) break;
    }
  }
  return items.join('');
}

function buildSpecAccordion(p) {
  if (p.specSections && typeof p.specSections === 'object') {
    return Object.entries(p.specSections).map(([section, specs]) => {
      if (!specs || typeof specs !== 'object') return '';
      const rows = Object.entries(specs).map(([k, v]) =>
        `<div class="spec-accordion-row">
          <span class="spec-accordion-key">${esc(k)}</span>
          <span class="spec-accordion-val">${esc(String(v))}</span>
        </div>`
      ).join('');
      return `<div class="spec-accordion-item">
        <div class="spec-accordion-header" onclick="toggleAccordion(this)">
          <span>${esc(section)}</span>
          <span class="spec-accordion-arrow">▼</span>
        </div>
        <div class="spec-accordion-body">${rows}</div>
      </div>`;
    }).join('');
  }

  const skip = new Set(['id', 'name', 'imageUrl', 'category', 'techScore', 'price_raw',
                        'price_segment', 'specSections', 'trendScore', 'createdAt', 'updatedAt']);
  const rows = Object.entries(p)
    .filter(([k, v]) => !skip.has(k) && v != null && v !== '')
    .map(([k, v]) => `<div class="spec-accordion-row">
      <span class="spec-accordion-key">${esc(labelFor(k))}</span>
      <span class="spec-accordion-val">${esc(String(v))}</span>
    </div>`).join('');

  if (!rows) return '';
  return `<div class="spec-accordion-item open">
    <div class="spec-accordion-header" onclick="toggleAccordion(this)">
      <span>Tüm Özellikler</span>
      <span class="spec-accordion-arrow">▼</span>
    </div>
    <div class="spec-accordion-body">${rows}</div>
  </div>`;
}

function toggleAccordion(header) {
  header.closest('.spec-accordion-item')?.classList.toggle('open');
}

/* ── Close Modal ─────────────────────────────────────────────────── */
function closeModal() {
  document.getElementById('product-modal-overlay')?.classList.remove('open');
  document.getElementById('product-modal')?.classList.remove('open');
  document.body.style.overflow = '';
}

/* ── Toggle Compare ─────────────────────────────────────────────── */
function toggleCompare(id, name) {
  const idx = compareList.indexOf(id);
  if (idx === -1) {
    if (compareList.length >= 4) {
      alert('En fazla 4 ürün karşılaştırabilirsiniz.');
      return;
    }
    compareList.push(id);
  } else {
    compareList.splice(idx, 1);
  }

  const badge = document.getElementById('compare-badge');
  if (badge) {
    badge.textContent = compareList.length;
    badge.style.display = compareList.length > 0 ? 'flex' : 'none';
  }

  document.querySelectorAll('.product-card').forEach(card => {
    const btn = card.querySelector('.card-compare-btn');
    if (!btn) return;
    const onclick = card.getAttribute('onclick') || '';
    const match = onclick.match(/openModal\('([^']+)'\)/);
    if (!match) return;
    const cardId = match[1];
    const inList = compareList.includes(cardId);
    btn.textContent = inList ? '✓ Listede' : '+ Karşılaştır';
    btn.classList.toggle('in-compare', inList);
  });
}

/* ── Clear Filters ───────────────────────────────────────────────── */
function clearFilters() {
  activeFilters = { categories: [], prices: [], scores: [] };
  document.querySelectorAll('.cat-filter, .price-filter, .score-filter').forEach(cb => {
    cb.checked = false;
  });
  applyFilters();
}

/* ── Theme Toggle ────────────────────────────────────────────────── */
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  try { localStorage.setItem('compair-theme', next); } catch(e) {}
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = next === 'dark' ? '🌙' : '☀️';
}

/* ── Mobile Filters ──────────────────────────────────────────────── */
function toggleMobileFilters() {
  const sidebar = document.getElementById('filters-sidebar');
  const overlay = document.getElementById('filter-drawer-overlay');
  sidebar?.classList.toggle('open');
  overlay?.classList.toggle('open');
  document.body.style.overflow = sidebar?.classList.contains('open') ? 'hidden' : '';
}

/* ── Utilities ───────────────────────────────────────────────────── */
function formatPrice(raw) {
  if (raw == null || raw === '' || raw === 0) return '';
  const num = parseFloat(raw);
  if (isNaN(num) || num <= 0) return '';
  if (num >= 1000) {
    return '₺' + num.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  }
  return '₺' + num.toFixed(0);
}

function getScoreClass(score) {
  if (score >= 80) return 'score-high';
  if (score >= 60) return 'score-mid';
  return 'score-low';
}

function scoreBadgeHtml(score, fontSize, padding) {
  if (score == null) return '';
  const cls = getScoreClass(score);
  const fs  = fontSize ? `font-size:${fontSize};` : '';
  const pd  = padding  ? `padding:${padding};`    : '';
  return `<span class="score-badge ${cls}" style="${fs}${pd}">⚡ ${score}</span>`;
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function labelFor(key) {
  const labels = {
    brand: 'Marka', processor: 'İşlemci', ram: 'RAM', storage: 'Depolama',
    display: 'Ekran', camera: 'Kamera', battery: 'Batarya', os: 'İşletim Sistemi',
    gpu: 'GPU', resolution: 'Çözünürlük', refresh_rate: 'Yenileme Hızı',
    weight: 'Ağırlık', connectivity: 'Bağlantı', price_segment: 'Segment',
    techScore: 'Teknik Skor', price_raw: 'Fiyat',
  };
  return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function showError(msg) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text3)">
    <div style="font-size:48px;margin-bottom:12px">⚠️</div>
    <div style="font-size:15px;color:var(--text2)">${msg}</div>
  </div>`;
  const countEl = document.getElementById('product-count');
  if (countEl) countEl.textContent = '';
}

/* ── DOMContentLoaded ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();

  const theme = localStorage.getItem('compair-theme') || 'dark';
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.textContent = theme === 'dark' ? '🌙' : '☀️';

  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const val = searchInput.value;
      if (searchClear) searchClear.style.display = val ? 'block' : 'none';
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => doSearch(val), 300);
    });
  }

  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchClear.style.display = 'none';
      applyFilters();
      searchInput?.focus();
    });
  }

  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => filterByCategory(tab.dataset.cat));
  });

  document.querySelectorAll('.price-filter').forEach(cb => {
    cb.addEventListener('change', () => {
      activeFilters.prices = [...document.querySelectorAll('.price-filter:checked')].map(c => c.value);
      applyFilters();
    });
  });

  document.querySelectorAll('.score-filter').forEach(cb => {
    cb.addEventListener('change', () => {
      activeFilters.scores = [...document.querySelectorAll('.score-filter:checked')].map(c => c.value);
      applyFilters();
    });
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
});
