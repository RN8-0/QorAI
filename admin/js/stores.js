/* ═══════════════════════════════════════════════════════════════════════════
   MAĞAZA KONTROLÜ
   ---------------------------------------------------------------------------
   `offers` koleksiyonundaki mağazaları sayar ve her biri için aç/kapat anahtarı
   verir. Kapatılan mağazalar `public_config.store_settings.hidden` içine yazılır;
   web (`web/src/lib/offers.js`) ve uygulama (`lib/data/datasources/pb_ds.dart`)
   AYNI kaydı okuduğu için iki taraf da anında senkron olur.

   Not: `offers` on binlerce satır olabilir; tam liste çekmek yerine mağaza
   başına sayım için PB'nin `perPage=1 + totalItems` numarası kullanılır (tek
   sorguda toplam sayı döner, satırlar taşınmaz).
   ═══════════════════════════════════════════════════════════════════════════ */

const STORE_CFG_KEY = 'store_settings';

let storesState = { rows: [], hidden: new Set(), recordId: '', loading: false };

function storesEsc(v) {
  return String(v == null ? '' : v).replace(/[<>&"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]
  ));
}

function storesFilterEsc(v) {
  return String(v || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function storesReadConfig() {
  try {
    const res = await getPb().collection('public_config').getList(1, 1, {
      filter: `key="${STORE_CFG_KEY}"`, $autoCancel: false,
    });
    const item = res.items[0];
    if (!item) return { recordId: '', hidden: [] };
    let value = item.value;
    if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = null; } }
    return {
      recordId: item.id,
      hidden: Array.isArray(value && value.hidden) ? value.hidden : [],
    };
  } catch (e) {
    console.warn('[stores] config read failed', e);
    return { recordId: '', hidden: [] };
  }
}

// Mağaza adlarını topla. Son 30 günde güncellenen tekliflerden örnek çekilir;
// mağaza sayısı azdır (onlarca), teklif sayısı çoktur — örneklem yeterli.
async function storesCollectNames() {
  const names = new Map(); // key -> {label, lastSeen}
  let page = 1;
  const maxPages = 12; // 12 × 500 = 6000 satır örneklem
  while (page <= maxPages) {
    const res = await getPb().collection('offers').getList(page, 500, {
      sort: '-updated',
      fields: 'store,network,updated',
      $autoCancel: false,
    });
    for (const r of res.items) {
      const label = String(r.store || r.network || '').trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const prev = names.get(key);
      if (!prev || String(r.updated || '') > prev.lastSeen) {
        names.set(key, { label, lastSeen: String(r.updated || '') });
      }
    }
    if (page >= res.totalPages) break;
    page += 1;
  }
  return names;
}

async function storesCountFor(label) {
  try {
    const res = await getPb().collection('offers').getList(1, 1, {
      filter: `store="${storesFilterEsc(label)}"`,
      fields: 'id',
      skipTotal: false,
      $autoCancel: false,
    });
    return res.totalItems || 0;
  } catch {
    return 0;
  }
}

async function storesLoad() {
  const box = document.getElementById('storesList');
  if (!box || storesState.loading) return;
  storesState.loading = true;
  box.innerHTML = '<div class="text-muted">Mağazalar taranıyor…</div>';
  try {
    const cfg = await storesReadConfig();
    storesState.recordId = cfg.recordId;
    storesState.hidden = new Set(cfg.hidden.map((x) => String(x || '').trim().toLowerCase()));

    const names = await storesCollectNames();
    const rows = [];
    for (const [key, info] of names.entries()) {
      rows.push({ key, label: info.label, lastSeen: info.lastSeen, count: await storesCountFor(info.label) });
    }
    rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'tr'));
    storesState.rows = rows;
    storesRender();
  } catch (e) {
    box.innerHTML = `<div class="text-muted">Okunamadı: ${storesEsc(e.message || e)}</div>`;
  } finally {
    storesState.loading = false;
  }
}

function storesRender() {
  const box = document.getElementById('storesList');
  if (!box) return;
  const rows = storesState.rows;
  if (!rows.length) {
    box.innerHTML = '<div class="text-muted">Hiç teklif kaydı bulunamadı.</div>';
    return;
  }
  const hiddenCount = rows.filter((r) => storesState.hidden.has(r.key)).length;
  const head = `<div class="text-muted" style="margin-bottom:10px">
    ${rows.length} mağaza · ${hiddenCount} kapalı — kapatılan mağaza sitede ve uygulamada görünmez.
  </div>`;
  const list = rows.map((r) => {
    const off = storesState.hidden.has(r.key);
    return `<div style="display:flex;align-items:center;gap:12px;padding:9px 12px;border:1px solid var(--border,#e2e8f0);border-radius:10px;margin-bottom:8px;${off ? 'opacity:.55' : ''}">
      <b style="min-width:170px">${storesEsc(r.label)}</b>
      <span class="text-muted" style="font-size:12px">${r.count.toLocaleString('tr-TR')} teklif</span>
      <span class="text-muted" style="font-size:12px">son: ${storesEsc((r.lastSeen || '').slice(0, 10) || '—')}</span>
      <label style="margin-left:auto;display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px">
        <input type="checkbox" ${off ? '' : 'checked'} onchange="storesToggle('${storesEsc(r.key)}', this.checked)">
        <span>${off ? 'kapalı' : 'açık'}</span>
      </label>
    </div>`;
  }).join('');
  box.innerHTML = head + list;
}

function storesToggle(key, enabled) {
  if (enabled) storesState.hidden.delete(key);
  else storesState.hidden.add(key);
  storesRender();
}

async function storesSave() {
  const status = document.getElementById('storesSaveStatus');
  const payload = {
    hidden: [...storesState.hidden],
    updatedAt: new Date().toISOString(),
  };
  if (status) status.textContent = 'kaydediliyor…';
  try {
    const pb = getPb();
    if (storesState.recordId) {
      await pb.collection('public_config').update(storesState.recordId, { value: payload });
    } else {
      const rec = await pb.collection('public_config').create({ key: STORE_CFG_KEY, value: payload });
      storesState.recordId = rec.id;
    }
    if (status) status.textContent = `kaydedildi · ${payload.hidden.length} mağaza kapalı`;
  } catch (e) {
    if (status) status.textContent = `hata: ${e.message || e}`;
  }
}

window.storesLoad = storesLoad;
window.storesToggle = storesToggle;
window.storesSave = storesSave;
