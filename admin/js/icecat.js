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
    ['Bilgisayar',        'all-in-one-pcs',         2282, 'All-in-One PC',           false],
    ['Bilgisayar',        'servers',                156,  'Sunucular',                false],
    ['Bilgisayar',        'thin-clients',           896,  'Thin Client',              false],
    ['Bilgisayar',        'laptop-docks',           152,  'Laptop Dock',              false],
    ['Bilgisayar',        'handheld-computers',     154,  'El Bilgisayarı',           false],
    ['Bileşen',           'cpus',                   989,  'CPU / İşlemci',            true],
    ['Bileşen',           'ram',                    911,  'RAM / Bellek',             true],
    ['Bileşen',           'motherboards',           164,  'Anakart',                  true],
    ['Bileşen',           'cases',                  237,  'Kasa',                     true],
    ['Bileşen',           'psus',                   963,  'Güç Kaynağı',              true],
    ['Bileşen',           'coolers',                921,  'Soğutucu',                 true],
    ['Depolama',          'hdds',                   219,  'HDD (Dahili)',             true],
    ['Depolama',          'external-hdds',          1823, 'HDD (Harici)',             true],
    ['Depolama',          'ssds',                   1563, 'SSD (Dahili)',             true],
    ['Depolama',          'nas',                    932,  'NAS / Depolama',           false],
    ['Depolama',          'flash-drives',           1554, 'USB Flash',                true],
    ['Depolama',          'memory-cards',           902,  'Hafıza Kartı',             true],
    ['Depolama',          'optical-drives',         214,  'Optik Sürücü',             false],
    ['Ekran',             'monitors',               222,  'Monitör',                  true],
    ['Ekran',             'tvs',                    1584, 'TV',                       true],
    ['Ekran',             'signage-displays',       2672, 'Signage Ekran',            false],
    ['Ekran',             'projectors',             567,  'Projektör',                true],
    ['Ekran',             'monitor-accessories',    940,  'Monitör Aksesuarı',        false],
    ['Ekran',             'tv-mounts',              1056, 'TV Standı',                false],
    ['Mobil',             'smartphones',            1893, 'Akıllı Telefon',           true],
    ['Mobil',             'mobile-phones',          119,  'Tuşlu Telefon',            false],
    ['Mobil',             'tablets',                897,  'Tablet',                   true],
    ['Görüntüleme',       'cameras',                575,  'Dijital Kamera',           true],
    ['Görüntüleme',       'camcorders',             584,  'Video Kamera',             true],
    ['Görüntüleme',       'security-cameras',       1557, 'Güvenlik Kamerası',        true],
    ['Çevre Birimi',      'keyboards',              194,  'Klavye',                   true],
    ['Çevre Birimi',      'mice',                   195,  'Fare',                     true],
    ['Çevre Birimi',      'mobile-keyboards',       2813, 'Mobil Klavye',             false],
    ['Yazıcı',            'multifunction-printers', 304,  'Çok Fonksiyonlu Yazıcı',  true],
    ['Yazıcı',            'laser-printers',         235,  'Lazer Yazıcı',             true],
    ['Yazıcı',            'label-printers',         229,  'Etiket Yazıcı',            false],
    ['Ağ',                'network-switches',       258,  'Network Switch',           true],
    ['Ağ',                'routers',                3982, 'Router (Kablosuz)',        true],
    ['Ağ',                'network-cards',          182,  'Ağ Kartı',                 false],
    ['Güç',               'ups',                    817,  'UPS',                      true],
    ['Güç',               'pdus',                   984,  'PDU',                      false],
    ['Güç',               'power-adapters',         827,  'Adaptör',                  false],
    ['Ses',               'portable-speakers',      2315, 'Taşınabilir Hoparlör',     true],
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
    if (startBtn) startBtn.style.display = running ? 'none' : '';
    if (stopBtn)  stopBtn.style.display  = running ? '' : 'none';
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
      if (!r.ok) return null;
      const j = await r.json();
      CAT_COUNTS = {};
      for (const c of (j.categories || [])) CAT_COUNTS[c.catId] = c.count;
      return CAT_COUNTS;
    } catch { return null; }
  }

  async function icecatRenderCats() {
    const host = $('icecatCatList');
    if (!host) return;
    await loadDiscover();

    // Group by category section
    const groups = {};
    for (const row of CAT_PRESET) {
      const [g, slug, catId, label, defChecked] = row;
      (groups[g] = groups[g] || []).push({ slug, catId, label, defChecked });
    }

    // Read previously-selected slugs (from hidden input) so re-renders preserve state
    const prevSelected = new Set(($('icecatCats').value || '').split(',').map(s => s.trim()).filter(Boolean));

    let html = '';
    for (const [g, items] of Object.entries(groups)) {
      html += `<div style="grid-column:1/-1;font-size:11px;color:var(--muted,#9aa);text-transform:uppercase;letter-spacing:.5px;margin:6px 0 2px">${g}</div>`;
      for (const it of items) {
        const count = (CAT_COUNTS && CAT_COUNTS[it.catId]) || 0;
        const isDefault = prevSelected.size ? prevSelected.has(it.slug) : it.defChecked;
        const countLabel = count ? ` <span style="opacity:.55">(${count.toLocaleString('tr-TR')})</span>` : '';
        html += `<label style="display:flex;align-items:center;gap:6px;padding:5px 7px;background:var(--surface-2,#171717);border-radius:4px;font-size:12px;cursor:pointer">
          <input type="checkbox" class="ic-cat-cb" value="${it.slug}" ${isDefault ? 'checked' : ''}>
          <span>${it.label}${countLabel}</span>
        </label>`;
      }
    }
    host.innerHTML = html;
    host.querySelectorAll('.ic-cat-cb').forEach(cb => cb.addEventListener('change', icecatSyncCats));
    icecatSyncCats();
  }

  function icecatSyncCats() {
    const cbs = document.querySelectorAll('.ic-cat-cb');
    const slugs = [];
    let totalCount = 0;
    cbs.forEach(cb => {
      if (cb.checked) {
        slugs.push(cb.value);
        const row = CAT_PRESET.find(r => r[1] === cb.value);
        if (row && CAT_COUNTS) totalCount += (CAT_COUNTS[row[2]] || 0);
      }
    });
    $('icecatCats').value = slugs.join(',');
    const summary = $('icecatCatSummary');
    if (summary) {
      summary.textContent = slugs.length
        ? `${slugs.length} kategori seçili · yaklaşık ${totalCount.toLocaleString('tr-TR')} ürün`
        : 'hiç kategori seçili değil';
    }
  }

  function icecatSelectAllCats() {
    document.querySelectorAll('.ic-cat-cb').forEach(cb => cb.checked = true);
    icecatSyncCats();
  }
  function icecatSelectNoneCats() {
    document.querySelectorAll('.ic-cat-cb').forEach(cb => cb.checked = false);
    icecatSyncCats();
  }

  async function icecatStart() {
    const slugs = $('icecatCats').value.trim();
    if (!slugs) {
      alert('En az bir kategori seçin.');
      return;
    }
    const body = {
      cats:    slugs,
      langs:   $('icecatLangs').value.trim(),
      limit:   parseInt($('icecatLimit').value) || 0,
      workers: parseInt($('icecatWorkers').value) || 3,
      delay:   parseInt($('icecatDelay').value) || 600,
      resume:  $('icecatResume').checked,
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

      $('icecatQueueSize').textContent = (s.queueSize || 0).toLocaleString();
      const p = s.progress || {};
      $('icecatDone').textContent     = (p.done    || 0).toLocaleString();
      $('icecatCreated').textContent  = (p.created || 0).toLocaleString();
      $('icecatUpdated').textContent  = (p.updated || 0).toLocaleString();
      $('icecatErrors').textContent   = (p.errors  || 0).toLocaleString();

      const total = s.queueSize || 0;
      const done  = p.done || 0;
      const pct   = total > 0 ? Math.min(100, (done / total) * 100) : 0;
      $('icecatProgressBar').style.width = pct.toFixed(1) + '%';

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
  window.icecatStop            = icecatStop;
  window.icecatReset           = icecatReset;
  window.icecatRefreshStatus   = bootstrap; // tab-switch triggers bootstrap
  window.icecatRenderCats      = icecatRenderCats;
  window.icecatSelectAllCats   = icecatSelectAllCats;
  window.icecatSelectNoneCats  = icecatSelectNoneCats;
})();
