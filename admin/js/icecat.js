/**
 * Qor AI — Icecat Open Catalog Tab Controller
 *
 * Talks to the local scraper-proxy (port 3456) which spawns the
 * `node scripts/icecat_ingest.js` child process and exposes:
 *   POST /icecat/start  body: {cats, langs, limit, workers, delay, resume}
 *   GET  /icecat/status -> {running, progress, queueSize, logTail}
 *   POST /icecat/stop
 *   POST /icecat/reset  -> wipes queue + progress (for a clean Phase 1)
 *   GET  /icecat/discover -> returns scripts/icecat_cats_named.json
 *
 * The category picker is driven by the discover endpoint, which exposes the
 * real free-tier product counts per Icecat CategoryID. This keeps the UI in
 * sync with what the ingestor actually maps via CAT_MAP in icecat_ingest.js.
 */
(function () {
  'use strict';

  const PROXY = (typeof PROXY_URL !== 'undefined') ? PROXY_URL : 'http://localhost:3456';
  let pollHandle = null;
  const DISABLED_SLUGS = new Set([
    'vacuums',
    'small_appliances',
    'coffee_makers',
    'dishwashers',
    'microwaves',
    'tumble_dryers',
    'washing_machines',
    'hobs',
    'fridge_freezers',
    'ovens',
    'smart_home',
    'led_bulbs',
  ]);

  // Canonical QorAi category presets. A single QorAi category may map to
  // multiple Icecat CategoryIDs; the ingestor uses the same canonical slugs.
  const CAT_PRESET = [
    // group, slug, catIds, label
    ['Bilgisayar',        'laptops',              [151],        'Laptops'],
    ['Bilgisayar',        'desktops',             [153, 2282],  'Desktop PCs'],
    ['Bilgisayar',        'servers',              [156],        'Servers'],
    ['Bilgisayar',        'thin_clients',         [896],        'Thin Clients'],
    ['Bilgisayar',        'laptop_docks',         [152],        'Laptop Docks'],
    ['Bileşen',           'cpus',                 [989],        'Processors'],
    ['Bileşen',           'ram',                  [911],        'RAM'],
    ['Bileşen',           'motherboards',         [164],        'Motherboards'],
    ['Bileşen',           'pc_cases',             [237],        'PC Cases'],
    ['Bileşen',           'psu',                  [963],        'Power Supplies (PSU)'],
    ['Bileşen',           'cpu_coolers',          [921],        'CPU Coolers'],
    ['Depolama',          'hard_drives',          [219],        'Hard Drives'],
    ['Depolama',          'external_hdd',         [1823],       'External Hard Drives'],
    ['Depolama',          'ssd',                  [1563],       'SSDs'],
    ['Depolama',          'nas_servers',          [932],        'NAS / Media Servers'],
    ['Depolama',          'flash_drives',         [1554],       'USB Flash Drives'],
    ['Depolama',          'memory_cards',         [902],        'Memory Cards'],
    ['Depolama',          'optical_drives',       [214],        'Optical Drives'],
    ['Ekran',             'monitors',             [222],        'Monitors'],
    ['Ekran',             'tvs',                  [1584],       'TVs'],
    ['Ekran',             'signage_displays',     [2672],       'Signage Displays'],
    ['Ekran',             'projectors',           [567],        'Projectors'],
    ['Mobil',             'smartphones',          [1893, 119],  'Smartphones'],
    ['Mobil',             'tablets',              [897],        'Tablets'],
    ['Görüntüleme',       'digital_cameras',      [575],        'Digital Cameras'],
    ['Görüntüleme',       'video_cameras',        [584],        'Video Cameras'],
    ['Görüntüleme',       'security_cameras',     [1557],       'Security Cameras'],
    ['Çevre Birimi',      'keyboards',            [194, 2813],  'Keyboards'],
    ['Çevre Birimi',      'mice',                 [195],        'Mice'],
    ['Yazıcı',            'printers',             [304, 235, 229], 'Printers'],
    ['Ağ',                'network_switches',     [258],        'Network Switches'],
    ['Ağ',                'routers',              [3982],       'Routers'],
    ['Ağ',                'pcie_nic',             [182],        'PCIe Network Cards'],
    ['Gaming',            'games',                [94],         'Games'],
    ['Güç',               'ups',                  [817],        'UPS'],
    ['Güç',               'pdu',                  [984],        'PDUs'],
    ['Güç',               'power_adapters',       [827],        'Power Adapters'],
    ['Ses',               'speakers',             [2315],       'Speakers'],
    ['Beyaz Eşya',        'vacuums',              [1234],       'Vacuum Cleaners'],
    ['Beyaz Eşya',        'coffee_makers',        [1320],       'Coffee Makers'],
    ['Beyaz Eşya',        'dishwashers',          [1324],       'Dishwashers'],
    ['Beyaz Eşya',        'microwaves',           [1325],       'Microwaves'],
    ['Beyaz Eşya',        'tumble_dryers',        [1330],       'Tumble Dryers'],
    ['Beyaz Eşya',        'washing_machines',     [1331],       'Washing Machines'],
    ['Beyaz Eşya',        'hobs',                 [1864],       'Hobs'],
    ['Beyaz Eşya',        'fridge_freezers',      [1873],       'Fridge-Freezers'],
    ['Beyaz Eşya',        'ovens',                [2286],       'Ovens'],
    ['Aydınlatma',        'led_bulbs',            [1661],       'LED Bulbs'],
  ];

  // Live counts populated from /icecat/discover
  let CAT_COUNTS = null;

  function $(id) { return document.getElementById(id); }
  function catIdsOf(row) {
    if (Array.isArray(row?.catIds)) return row.catIds;
    return Array.isArray(row?.[2]) ? row[2] : [row?.[2]].filter(Boolean);
  }
  function countForRow(row) {
    if (!row || !CAT_COUNTS) return 0;
    return catIdsOf(row).reduce((sum, id) => sum + (Number(CAT_COUNTS[id]) || 0), 0);
  }
  function labelForSlug(slug, fallback) {
    return window.QorAiCategories?.getById?.(slug)?.name || fallback || slug;
  }
  function canonicalSlug(slug) {
    return window.QorAiCategories?.canonicalId?.(slug) || slug;
  }
  function canonicalGroupMap() {
    const map = new Map();
    for (const group of (window.QorAiCategories?.groups || [])) {
      for (const cat of (group.categories || [])) map.set(cat.id, group.name);
    }
    return map;
  }
  function canonicalPresetRows() {
    const canonicalIds = new Set((window.QorAiCategories?.getAll?.() || []).map(c => c.id));
    const groupById = canonicalGroupMap();
    const bySlug = new Map();
    for (const row of CAT_PRESET) {
      const [fallbackGroup, rawSlug, rawCatIds, fallbackLabel] = row;
      const slug = canonicalSlug(rawSlug);
      if (DISABLED_SLUGS.has(slug) || /beyaz eşya/i.test(fallbackGroup)) continue;
      if (canonicalIds.size && !canonicalIds.has(slug)) continue;
      const current = bySlug.get(slug) || {
        group: groupById.get(slug) || fallbackGroup,
        slug,
        catIds: [],
        label: labelForSlug(slug, fallbackLabel),
      };
      current.catIds.push(...catIdsOf([null, null, rawCatIds]));
      current.catIds = [...new Set(current.catIds)];
      bySlug.set(slug, current);
    }
    return [...bySlug.values()];
  }

  function setRunningUI(running) {
    const startBtn = $('btnIcecatStart');
    const stopBtn  = $('btnIcecatStop');
    const resumeBtn = $('btnIcecatResume');
    if (startBtn) startBtn.style.display = running ? 'none' : '';
    if (stopBtn)  stopBtn.style.display  = running ? '' : 'none';
    if (resumeBtn && running) resumeBtn.style.display = 'none';
    const status = $('icecatStatus');
    if (status) {
      status.textContent = running ? 'running…' : 'idle';
      status.style.color = running ? '#06b6d4' : '';
    }
  }

  async function loadDiscover() {
    if (CAT_COUNTS) return CAT_COUNTS;
    try {
      const r = await fetch(`${PROXY}/icecat/discover`);
      if (!r.ok) {
        CAT_COUNTS = {};
        return CAT_COUNTS;
      }
      const j = await r.json();
      CAT_COUNTS = {};
      for (const c of (j.categories || [])) CAT_COUNTS[c.catId] = c.count;
      return CAT_COUNTS;
    } catch {
      CAT_COUNTS = {};
      return CAT_COUNTS;
    }
  }

  // Single-category picker — one Icecat category at a time keeps each run
  // small, predictable and easy to verify before moving to the next one.
  async function icecatRenderCats() {
    const sel = $('icecatCatSelect');
    if (!sel) return;
    try {
      await loadDiscover();
    } catch {
      CAT_COUNTS = {};
    }

    const groups = {};
    for (const row of canonicalPresetRows()) {
      (groups[row.group] = groups[row.group] || []).push(row);
    }

    const prev = ($('icecatCats').value || '').trim();
    let html = '<option value="">— Kategori seç —</option>';
    for (const [g, items] of Object.entries(groups)) {
      html += `<optgroup label="${g}">`;
      for (const it of items) {
        const count = (it.catIds || []).reduce((sum, id) => sum + (Number(CAT_COUNTS?.[id]) || 0), 0);
        const countLabel = count ? ` (${count.toLocaleString('tr-TR')})` : '';
        html += `<option value="${it.slug}"${it.slug === prev ? ' selected' : ''}>${it.label}${countLabel}</option>`;
      }
      html += '</optgroup>';
    }
    sel.innerHTML = html;
    icecatSyncCats();
  }

  function icecatSyncCats() {
    const sel = $('icecatCatSelect');
    const slug = sel ? sel.value.trim() : '';
    $('icecatCats').value = slug;
    const summary = $('icecatCatSummary');
    if (summary) {
      const row = canonicalPresetRows().find(r => r.slug === slug);
      const count = countForRow(row);
      summary.textContent = slug
        ? `Seçili: ${row ? row.label : labelForSlug(slug, slug)}${count ? ` · ~${count.toLocaleString('tr-TR')} ürün` : ''}`
        : 'Tek kategori seç — düzgün, sistematik çekim için';
    }
  }

  async function icecatStart() {
    return icecatStartWithResume(!!$('icecatResume')?.checked);
  }

  async function icecatResume() {
    if ($('icecatResume')) $('icecatResume').checked = true;
    return icecatStartWithResume(true);
  }

  async function icecatStartWithResume(forceResume) {
    const slugs = $('icecatCats').value.trim();
    if (!slugs) {
      alert('Bir kategori seçin.');
      return;
    }
    const body = {
      cats:    slugs,
      brand:   ($('icecatBrand')?.value || '').trim(),
      langs:   $('icecatLangs').value.trim(),
      limit:   parseInt($('icecatLimit').value) || 0,
      minYear: parseInt($('icecatMinYear')?.value) || 2015,
      workers: parseInt($('icecatWorkers').value) || 3,
      delay:   parseInt($('icecatDelay').value) || 600,
      maxTotalProducts: 300000,
      resume:  !!forceResume,
    };
    try {
      const r = await fetch(`${PROXY}/icecat/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert('Start hatası: ' + (j.error || r.status));
        return;
      }
      setRunningUI(true);
      $('icecatLog').textContent = '';
      startPolling();
    } catch (e) {
      alert('Proxy ulaşılamıyor: ' + e.message + '\n\nÖnce: npm run scraper:proxy');
    }
  }

  async function icecatStop() {
    if (!confirm('Icecat ingestion durdurulsun mu? Mevcut ürün biter, sonra durur.')) return;
    try {
      await fetch(`${PROXY}/icecat/stop`, { method: 'POST' });
    } catch (e) {
      console.warn('Stop hatası:', e);
    }
    setTimeout(icecatRefreshStatus, 500);
  }

  async function icecatReset() {
    if (!confirm('Queue + progress dosyaları silinsin mi? PocketBase ürünleri korunur — sadece bir sonraki Start temiz Phase 1 ile başlar.')) return;
    try {
      const r = await fetch(`${PROXY}/icecat/reset`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { alert('Reset hatası: ' + (j.error || r.status)); return; }
      $('icecatQueueSize').textContent = '0';
      $('icecatDone').textContent     = '0';
      $('icecatCreated').textContent  = '0';
      $('icecatUpdated').textContent  = '0';
      $('icecatErrors').textContent   = '0';
      $('icecatProgressBar').style.width = '0%';
      $('icecatLog').textContent      = `[reset] silindi: ${(j.wiped || []).join(', ') || '(yok)'}\n`;
    } catch (e) {
      alert('Proxy ulaşılamıyor: ' + e.message);
    }
  }

  async function icecatRefreshStatus() {
    try {
      const r = await fetch(`${PROXY}/icecat/status`);
      if (!r.ok) return;
      const s = await r.json();

      setRunningUI(!!s.running);
      if (s.running && !pollHandle) startPolling();
      if (!s.running && pollHandle) stopPolling();

      const p = s.progress || {};
      // total = products in the selected category; doneOverall = those already
      // in PocketBase + processed this session. The ingestor reports these so
      // the bar tracks the real catalog state, not the 1.7M raw index.
      const total = p.total || s.queueSize || 0;
      const doneOverall = (p.alreadyDone || 0) + (p.done || 0);
      $('icecatQueueSize').textContent = total.toLocaleString();
      $('icecatDone').textContent     = doneOverall.toLocaleString();
      $('icecatCreated').textContent  = (p.created || 0).toLocaleString();
      $('icecatUpdated').textContent  = (p.updated || 0).toLocaleString();
      $('icecatErrors').textContent   = (p.errors  || 0).toLocaleString();

      const pct = total > 0 ? Math.min(100, (doneOverall / total) * 100) : 0;
      $('icecatProgressBar').style.width = pct.toFixed(1) + '%';
      const resumeBtn = $('btnIcecatResume');
      if (resumeBtn && !s.running) {
        resumeBtn.style.display = total > 0 && doneOverall < total ? '' : 'none';
      }
      if ($('icecatResume') && total > 0 && doneOverall < total && !s.running) {
        $('icecatResume').checked = true;
      }

      if (s.logTail) {
        const log = $('icecatLog');
        const wasAtBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
        log.textContent = s.logTail;
        if (wasAtBottom) log.scrollTop = log.scrollHeight;
      }
    } catch (_) {
      // proxy down — silent
    }
  }

  function startPolling() {
    if (pollHandle) return;
    pollHandle = setInterval(icecatRefreshStatus, 2000);
  }
  function stopPolling() {
    if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
  }

  // First-render hook — fires when the user switches to the Icecat tab.
  const originalRefresh = icecatRefreshStatus;
  async function bootstrap() {
    await icecatRenderCats();
    await originalRefresh();
  }

  // Expose globally for inline onclick handlers
  window.icecatStart           = icecatStart;
  window.icecatResume          = icecatResume;
  window.icecatStop            = icecatStop;
  window.icecatReset           = icecatReset;
  window.icecatRefreshStatus   = bootstrap; // tab-switch triggers bootstrap
  window.icecatRenderCats      = icecatRenderCats;
  window.icecatSyncCats        = icecatSyncCats;
})();
