// ═══════════════════════════════════════
//  💵 PRICE LAB — yerel IP'den elle fiyat koşuları
//  Scraper proxy'nin /price/* endpoint'lerini sürer (scripts/scraper-proxy.js).
//  Epey + Amazon arama sayfaları datacenter IP'lerini duvarladığı için bu
//  koşular admin makinesinde çalışır; kullanıcı günlük elle tetikler.
// ═══════════════════════════════════════
/* global PROXY_URL */
(() => {
  const PROXY = (typeof PROXY_URL === 'string' && PROXY_URL) || 'http://localhost:3456';
  let pollTimer = null;
  let jobsLoaded = false;

  const el = (id) => document.getElementById(id);

  async function jfetch(path, opts) {
    const res = await fetch(PROXY + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `${res.status}`);
    return data;
  }

  async function renderJobs() {
    if (jobsLoaded) return;
    const box = el('priceJobButtons');
    if (!box) return;
    try {
      const { jobs } = await jfetch('/price/jobs');
      box.innerHTML = '';
      for (const j of jobs) {
        const b = document.createElement('button');
        b.className = 'btn btn-primary btn-sm';
        b.textContent = `▶ ${j.label}`;
        b.dataset.job = j.key;
        b.onclick = () => runJob(j.key);
        box.appendChild(b);
      }
      jobsLoaded = true;
    } catch (e) {
      box.innerHTML = `<span class="text-muted" style="font-size:12px">Proxy kapalı görünüyor (${e.message}). Önce scraper proxy'yi başlat (npm run scraper:stack).</span>`;
    }
  }

  async function refreshCoverage() {
    const box = el('priceCoverage');
    if (!box) return;
    try {
      const c = await jfetch('/price/coverage');
      const t = new Date(c.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      box.innerHTML =
        `<b>${(c.pricedProducts || 0).toLocaleString('tr-TR')}</b> üründe fiyat · canlı offer: ` +
        `🇹🇷 <b>${c.live.TR}</b> · 🇩🇪 <b>${c.live.DE}</b> · 🇬🇧 <b>${c.live.GB}</b> · 🇺🇸 <b>${c.live.US}</b> ` +
        `<span style="opacity:.6">(${t})</span>`;
    } catch (e) {
      box.textContent = `Kapsam okunamadı: ${e.message}`;
    }
  }

  function setRunningUI(status) {
    const state = el('priceRunState');
    const stopBtn = el('btnPriceStop');
    const log = el('priceLogView');
    const running = !!(status && status.running);
    document.querySelectorAll('#priceJobButtons button').forEach((b) => { b.disabled = running; });
    if (stopBtn) stopBtn.style.display = running ? '' : 'none';
    if (state) {
      state.textContent = running
        ? `⏳ Çalışıyor: ${status.label || status.job} (başladı ${new Date(status.startedAt).toLocaleTimeString('tr-TR')})`
        : (status && status.job ? `✔ Son koşu: ${status.label || status.job}` : 'Boşta');
    }
    if (log) {
      const tail = (status && status.logTail || '').trim();
      log.style.display = tail ? '' : 'none';
      if (tail) {
        const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
        log.textContent = tail;
        if (atBottom) log.scrollTop = log.scrollHeight;
      }
    }
  }

  async function pollStatus() {
    try {
      const status = await jfetch('/price/status');
      setRunningUI(status);
      if (status.running) return; // keep polling
      stopPolling();
      refreshCoverage(); // koşu bitti — sayaçları tazele
    } catch {
      stopPolling();
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(pollStatus, 3000);
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  async function runJob(key) {
    try {
      await jfetch('/price/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job: key }),
      });
      startPolling();
      pollStatus();
    } catch (e) {
      alert(`Koşu başlatılamadı: ${e.message}`);
    }
  }

  window.priceStop = async () => {
    try { await jfetch('/price/stop', { method: 'POST' }); } catch {}
    pollStatus();
  };

  window.priceLabInit = () => {
    renderJobs();
    refreshCoverage();
    pollStatus().then(() => {
      // Sekme açıkken koşu sürüyorsa canlı takibe geç.
      jfetch('/price/status').then((s) => { if (s.running) startPolling(); }).catch(() => {});
    });
  };
})();
