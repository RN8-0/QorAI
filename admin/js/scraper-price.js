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

/* ─── Otomatik İşler (haftalık bakım) — canlı durum + geçmiş ────────────
 * Kaynak: public_config/job_runs — scripts/job_status.js yazar, .cmd zinciri
 * her adımda çağırır. Amaç: kullanıcının terminal penceresine bakmak zorunda
 * kalmaması ("admin panele girişte terminalden yapılan işlemler gözükecek ve
 * geçmiş kayıtları olacak scraper sekmesinde").                              */
function jobRunsFmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function jobRunsFmtDuration(fromIso, toIso) {
  const a = Date.parse(fromIso || '');
  const b = Date.parse(toIso || '') || Date.now();
  if (!Number.isFinite(a)) return '';
  const sec = Math.max(0, Math.round((b - a) / 1000));
  if (sec < 60) return `${sec} sn`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} dk`;
  return `${Math.floor(min / 60)} sa ${min % 60} dk`;
}

const JOB_RUN_BADGE = {
  running:     { text: 'çalışıyor', color: '#2563eb' },
  ok:          { text: 'tamamlandı', color: '#16a34a' },
  error:       { text: 'hata', color: '#dc2626' },
  interrupted: { text: 'kesildi (PC kapandı)', color: '#d97706' },
};

async function jobRunsRefresh() {
  const box = document.getElementById('jobRunsList');
  if (!box) return;
  box.innerHTML = '<div class="text-muted">Yükleniyor…</div>';
  let value = null;
  try {
    const res = await getPb().collection('public_config').getList(1, 1, {
      filter: 'key="job_runs"', $autoCancel: false,
    });
    const item = res.items[0];
    value = item ? item.value : null;
    if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = null; } }
  } catch (e) {
    box.innerHTML = `<div class="text-muted">Kayıtlar okunamadı: ${String(e.message || e)}</div>`;
    return;
  }

  const runs = (value && Array.isArray(value.runs)) ? value.runs : [];
  const upd = document.getElementById('jobRunsUpdated');
  if (upd) upd.textContent = value && value.updatedAt ? `son kayıt: ${jobRunsFmtDate(value.updatedAt)}` : '';

  if (!runs.length) {
    box.innerHTML = '<div class="text-muted">Henüz koşu kaydı yok. İlk haftalık koşudan sonra burada görünecek.</div>';
    return;
  }

  box.innerHTML = runs.map((r) => {
    const badge = JOB_RUN_BADGE[r.status] || { text: r.status || '?', color: '#64748b' };
    const steps = Array.isArray(r.steps) ? r.steps : [];
    const stepRows = steps.map((s) => {
      const done = Boolean(s.finishedAt);
      return `<tr>
        <td style="padding:4px 10px 4px 0;white-space:nowrap">${done ? '✓' : '⏳'}</td>
        <td style="padding:4px 14px 4px 0">${(s.name || '').replace(/[<>&]/g, '')}</td>
        <td style="padding:4px 0;white-space:nowrap;color:#64748b">${jobRunsFmtDuration(s.startedAt, s.finishedAt)}</td>
      </tr>`;
    }).join('');
    return `<div style="border:1px solid var(--border,#e2e8f0);border-radius:10px;padding:12px 14px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <b>${(r.job || 'iş').replace(/[<>&]/g, '')}</b>
        <span style="background:${badge.color};color:#fff;border-radius:999px;padding:1px 9px;font-size:11px">${badge.text}</span>
        <span style="color:#64748b;font-size:12px">${jobRunsFmtDate(r.startedAt)}</span>
        <span style="color:#64748b;font-size:12px">· süre ${jobRunsFmtDuration(r.startedAt, r.finishedAt)}</span>
      </div>
      ${r.error ? `<div style="color:#dc2626;font-size:12px;margin-top:6px">${String(r.error).replace(/[<>&]/g, '')}</div>` : ''}
      ${stepRows ? `<table style="margin-top:8px;font-size:12px;border-collapse:collapse">${stepRows}</table>` : ''}
    </div>`;
  }).join('');
}
