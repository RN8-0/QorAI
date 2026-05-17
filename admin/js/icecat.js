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

  // CAT_MAP mirror — keep in sync with scripts/icecat_ingest.js. Used to
  // (1) show a checkbox per ingestable slug and (2) display nice labels.
  // The proxy /icecat/discover endpoint provides live product counts.
  const CAT_PRESET = [
    // group, slug, catId, label, defaultChecked
    ['Bilgisayar',        'laptops',                151,  'Laptops',                  true],
    ['Bilgisayar',        'desktops',               153,  'Masaüstü PC',             true],
    ['Bilgisayar',        'all-in-one-pcs',         2282, 'All-in-One PC',           true],
    ['Bilgisayar',        'servers',                156,  'Sunucular',                false],
    ['Bilgisayar',        'thin-clients',           896,  'Thin Client',              false],
    ['Bilgisayar',        'laptop-docks',           152,  'Laptop Dock',              false],
    ['Bilgisayar',        'handheld-computers',     154,  'El Bilgisayarı',           false],
    ['Bileşen',           'cpus',                   989,  'CPU / İşlemci',            true],
    ['Bileşen',           'ram',                    911,  'RAM / Bellek',             true],
    ['Bileşen',           'motherboards',           164,  'Anakart',                  false],
    ['Bileşen',           'cases',                  237,  'Kasa',                     false],
    ['Bileşen',           'psus',                   963,  'Güç Kaynağı',              false],
    ['Bileşen',           'coolers',                921,  'Soğutucu',                 false],
    ['Depolama',          'hdds',                   219,  'HDD (Dahili)',             true],
    ['Depolama',          'external-hdds',          1823, 'HDD (Harici)',             true],
    ['Depolama',          'ssds',                   1563, 'SSD (Dahili)',             true],
    ['Depolama',          'nas',                    932,  'NAS / Depolama',           false],
    ['Depolama',          'flash-drives',           1554, 'USB Flash',                false],
    ['Depolama',          'memory-cards',           902,  'Hafıza Kartı',             false],
    ['Depolama',          'optical-drives',         214,  'Optik Sürücü',             false],
    ['Ekran',             'monitors',               222,  'Monitör',                  true],
    ['Ekran',             'tvs',                    1584, 'TV',                       true],
    ['Ekran',             'signage-displays',       2672, 'Signage Ekran',            false],
    ['Ekran',             'projectors',             567,  'Projektör',                false],
    ['Ekran',             'monitor-accessories',    940,  'Monitör Aksesuarı',        false],
    ['Ekran',             'tv-mounts',              1056, 'TV Standı',                false],
    ['Mobil',             'smartphones',            1893, 'Akıllı Telefon',           true],
    ['Mobil',             'mobile-phones',          119,  'Tuşlu Telefon',            false],
    ['Mobil',             'tablets',                897,  'Tablet',                   true],
    ['Görüntüleme',       'cameras',                575,  'Dijital Kamera',           false],
    ['Görüntüleme',       'camcorders',             584,  'Video Kamera',             false],
    ['Görüntüleme',       'security-cameras',       1557, 'Güvenlik Kamerası',        false],
    ['Çevre Birimi',      'keyboards',              194,  'Klavye',                   false],
    ['Çevre Birimi',      'mice',                   195,  'Fare',                     false],
    ['Çevre Birimi',      'mobile-keyboards',       2813, 'Mobil Klavye',             false],
    ['Yazıcı',            'multifunction-printers', 304,  'Çok Fonksiyonlu Yazıcı',  false],
    ['Yazıcı',            'laser-printers',         235,  'Lazer Yazıcı',             false],
    ['Yazıcı',            'label-printers',         229,  'Etiket Yazıcı',            false],
    ['Ağ',                'network-switches',       258,  'Network Switch',           false],
    ['Ağ',                'routers',                3982, 'Router (Kablosuz)',        false],
    ['Ağ',                'network-cards',          182,  'Ağ Kartı',                 false],
    ['Güç',               'ups',                    817,  'UPS',                      false],
    ['Güç',               'pdus',                   984,  'PDU',                      false],
    ['Güç',               'power-adapters',         827,  'Adaptör',                  false],
    ['Ses',               'portable-speakers',      2315, 'Taşınabilir Hoparlör',     false],
    ['Beyaz Eşya',        'vacuums',                1234, 'Süpürge',                  false],
    ['Beyaz Eşya',        'coffee-makers',          1320, 'Kahve Makinesi',           false],
    ['Beyaz Eşya',        'dishwashers',            1324, 'Bulaşık Makinesi',         false],
    ['Beyaz Eşya',        'microwaves',             1325, 'Mikrodalga',               false],
    ['Beyaz Eşya',        'tumble-dryers',          1330, 'Kurutma Makinesi',         false],
    ['Beyaz Eşya',        'washing-machines',       1331, 'Çamaşır Makinesi',         false],
    ['Beyaz Eşya',        'hobs',                   1864, 'Ocak',                     false],
    ['Beyaz Eşya',        'fridge-freezers',        1873, 'Buzdolabı',                false],
    ['Beyaz Eşya',        'ovens',                  2286, 'Fırın',                    false],
    ['Aydınlatma',        'led-bulbs',              1661, 'LED Ampul',                false],
  ];

  // Live counts populated from /icecat/discover
  let CAT_COUNTS = null;

  function $(id) { return document.getElementById(id); }

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
    for (const row of CAT_PRESET) {
      const [g, slug, catId, label] = row;
      (groups[g] = groups[g] || []).push({ slug, catId, label });
    }

    const prev = ($('icecatCats').value || '').trim();
    let html = '<option value="">— Kategori seç —</option>';
    for (const [g, items] of Object.entries(groups)) {
      html += `<optgroup label="${g}">`;
      for (const it of items) {
        const count = (CAT_COUNTS && CAT_COUNTS[it.catId]) || 0;
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
      const row = CAT_PRESET.find(r => r[1] === slug);
      const count = (row && CAT_COUNTS) ? (CAT_COUNTS[row[2]] || 0) : 0;
      summary.textContent = slug
        ? `Seçili: ${row ? row[3] : slug}${count ? ` · ~${count.toLocaleString('tr-TR')} ürün` : ''}`
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
      workers: parseInt($('icecatWorkers').value) || 3,
      delay:   parseInt($('icecatDelay').value) || 600,
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
