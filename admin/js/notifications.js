// ═══════════════════════════════════════════════════════════
//  COMPAIR ADMIN — Notification System
// ═══════════════════════════════════════════════════════════

const NOTIF_TEMPLATES = [
  { id: 'new-feature', icon: '🚀', label: 'Yeni Özellik', type: 'feature',
    title: '🚀 Yeni Özellik Geldi!',
    body: "Compair'e yepyeni bir özellik ekledik! Uygulamayı aç ve hemen keşfet — daha akıllı karşılaştırmalar seni bekliyor." },
  { id: 'price-drop', icon: '📉', label: 'Fiyat Düştü', type: 'alert',
    title: '📉 Takip Ettiğin Üründe Fiyat Düştü!',
    body: "İlgilendiğin bir ürünün fiyatı düştü. Hemen Compair'i aç ve fırsatı kaçırma — en iyi fiyatları gör." },
  { id: 'premium-offer', icon: '👑', label: 'Premium Teklifi', type: 'promo',
    title: '👑 Premium %50 İndirimde!',
    body: "Sınırsız AI karşılaştırma, gelişmiş analiz ve reklamsız deneyim. Premium'a sadece bu hafta özel %50 indirimle geç." },
  { id: 'maintenance', icon: '🔧', label: 'Bakım', type: 'system',
    title: '🔧 Planlı Bakım Bildirimi',
    body: "Compair kısa süreli bakıma giriyor. Hizmet birkaç dakika kesintiye uğrayabilir. Sabrın için teşekkürler!" },
  { id: 'welcome-back', icon: '👋', label: 'Hoş Geldin', type: 'system',
    title: '👋 Seni Özledik!',
    body: "Son ziyaretinden bu yana yüzlerce yeni ürün ekledik. Tekrar aramıza hoş geldin — keşfetmeye devam et." },
  { id: 'review-request', icon: '⭐', label: 'Uygulamayı Puanla', type: 'system',
    title: '⭐ Compair\'i Beğeniyor musun?',
    body: "Uygulamamızı beğendiysen mağazada 5 yıldız ile puanlayarak destek olabilirsin. Geri bildiriminin değeri büyük!" },
  { id: 'weekly-summary', icon: '📊', label: 'Haftalık Özet', type: 'system',
    title: '📊 Haftalık Ürün Özetin Hazır',
    body: "Bu hafta ilgilendiğin kategorilerde öne çıkan 10 ürünü senin için derledik. Dokun ve incele!" },
  { id: 'tip', icon: '💡', label: 'İpucu', type: 'tip',
    title: '💡 Compair Pro İpucu',
    body: "Biliyor muydun? Herhangi bir ürün linkini yapıştırarak AI'dan saniyeler içinde detaylı analiz alabilirsin." },
  { id: 'announcement', icon: '📢', label: 'Duyuru', type: 'system',
    title: '📢 Heyecan Verici Bir Duyurumuz Var!',
    body: "Yakında çok özel bir şey paylaşacağız. Bildirimleri açık tut, sürpriz kaçırmasın!" },
  { id: 'security', icon: '🛡️', label: 'Güvenlik', type: 'alert',
    title: '🛡️ Güvenlik Güncellemesi',
    body: "Hesabını daha güvenli hale getirdik. Lütfen ayarlarını gözden geçir ve şifreni güçlendir." },
  { id: 'ai-pick', icon: '🤖', label: 'AI Önerisi', type: 'feature',
    title: '🤖 Sana Özel AI Önerisi',
    body: "Senin için en uygun 5 ürünü AI ile seçtik. Aç ve kişisel önerilerini gör — saniyeler içinde karar ver." },
  { id: 'compare-recap', icon: '⚖️', label: 'Karşılaştırma Özeti', type: 'system',
    title: '⚖️ Karşılaştırma Geçmişin Hazır',
    body: "Yaptığın son karşılaştırmaların özetini hazırladık. AI yorumları ile birlikte gözden geçir!" },
  { id: 'new-products', icon: '🆕', label: 'Yeni Ürünler', type: 'feature',
    title: '🆕 Bu Hafta Eklenen Yeni Ürünler',
    body: "Bu hafta veritabanımıza 200+ yeni ürün eklendi. Yeni nesil telefonlar, laptoplar, kulaklıklar ve daha fazlası seni bekliyor!" },
  { id: 'streak', icon: '🔥', label: 'Streak', type: 'tip',
    title: '🔥 Seri Bozulmasın!',
    body: "Compair'i 3 gündür kullanmadın. Hadi geri dön ve serini koru — yeni ürünler ve fırsatlar seni bekliyor." },
];

const NOTIF_TYPE_ICONS = {
  system: '⚙️', feature: '🚀', promo: '🎁', alert: '🔔', tip: '💡',
};

let _notifAllUsers = [];
let _notifBroadcastLog = [];

// ── INIT ──────────────────────────────────────────────────────

async function loadNotificationsView() {
  _renderTemplateGrid();
  _bindComposerListeners();
  await _loadUsers();
  await _loadBroadcastLog();
  _updateRecipientCount();
  _updateStats();
}

function _renderTemplateGrid() {
  const grid = document.getElementById('notifTemplateGrid');
  if (!grid || grid.dataset.rendered) return;
  grid.dataset.rendered = '1';

  grid.innerHTML = NOTIF_TEMPLATES.map(t => `
    <button class="notif-template-btn" onclick="applyTemplate('${t.id}')" title="${t.title}">
      <span style="font-size:20px;line-height:1">${t.icon}</span>
      <span style="font-size:11px;font-weight:600;color:var(--text2);margin-top:4px">${t.label}</span>
    </button>
  `).join('');

  // inject CSS if not already present
  if (!document.getElementById('notif-styles')) {
    const s = document.createElement('style');
    s.id = 'notif-styles';
    s.textContent = `
      .notif-template-btn {
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        gap:4px;padding:10px 8px;background:var(--bg3);border:1px solid var(--border);
        border-radius:10px;cursor:pointer;transition:all .15s;min-height:64px;
        font-family:inherit;
      }
      .notif-template-btn:hover { border-color:var(--accent);background:var(--bg4);transform:translateY(-1px); }
      .notif-template-btn.active { border-color:var(--accent);background:rgba(99,102,241,.12); }
      .notif-history-item {
        display:grid;grid-template-columns:40px 1fr auto;gap:12px;align-items:start;
        padding:14px 16px;border:1px solid var(--border);border-radius:10px;
        background:var(--bg2);margin-bottom:8px;
      }
      .notif-history-icon {
        width:40px;height:40px;border-radius:50%;display:flex;align-items:center;
        justify-content:center;font-size:18px;flex-shrink:0;
        background:rgba(99,102,241,.12);
      }
      .notif-badge {
        display:inline-flex;align-items:center;padding:2px 8px;border-radius:99px;
        font-size:11px;font-weight:600;
      }
      .notif-badge-all { background:rgba(99,102,241,.15);color:#818cf8; }
      .notif-badge-premium { background:rgba(245,158,11,.15);color:#f59e0b; }
      .notif-badge-free { background:rgba(16,185,129,.15);color:#10b981; }
      .notif-badge-specific { background:rgba(59,130,246,.15);color:#3b82f6; }
      .notif-progress { height:4px;background:var(--bg3);border-radius:2px;overflow:hidden;margin-top:8px; }
      .notif-progress-bar { height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:2px;transition:width .3s; }
    `;
    document.head.appendChild(s);
  }
}

function _bindComposerListeners() {
  const title = document.getElementById('notifTitle');
  const body = document.getElementById('notifBody');
  const type = document.getElementById('notifType');
  const recipient = document.getElementById('notifRecipient');

  if (title && !title.dataset.bound) {
    title.dataset.bound = '1';
    title.addEventListener('input', _updatePreview);
    body.addEventListener('input', _updatePreview);
    type.addEventListener('change', _updatePreview);
    recipient.addEventListener('change', () => {
      const specific = document.getElementById('notifSpecificUserField');
      if (specific) specific.style.display = recipient.value === 'specific' ? '' : 'none';
      _updateRecipientCount();
    });
  }
}

async function _loadUsers() {
  try {
    const pb = getPb();
    let page = 1;
    let allUsers = [];
    while (true) {
      const res = await pb.collection('users').getList(page, 200, {
        fields: 'id,email,isPremium',
        $autoCancel: false,
      });
      allUsers = allUsers.concat(res.items);
      if (page >= res.totalPages) break;
      page++;
    }
    _notifAllUsers = allUsers;
  } catch (e) {
    console.warn('[Notif] load users error:', e);
  }
}

async function _loadBroadcastLog() {
  try {
    const pb = getPb();
    const rec = await pb.collection('app_config').getFirstListItem('key="notification_broadcast_log"', { $autoCancel: false });
    _notifBroadcastLog = JSON.parse(rec.value || '[]');
  } catch {
    _notifBroadcastLog = [];
  }
  _renderBroadcastHistory();
}

async function _saveBroadcastLog() {
  try {
    const pb = getPb();
    const value = JSON.stringify(_notifBroadcastLog.slice(0, 50)); // keep last 50
    try {
      const rec = await pb.collection('app_config').getFirstListItem('key="notification_broadcast_log"', { $autoCancel: false });
      await pb.collection('app_config').update(rec.id, { value });
    } catch {
      await pb.collection('app_config').create({ key: 'notification_broadcast_log', value });
    }
  } catch (e) {
    console.warn('[Notif] save log error:', e);
  }
}

// ── TEMPLATES ─────────────────────────────────────────────────

function applyTemplate(id) {
  const tpl = NOTIF_TEMPLATES.find(t => t.id === id);
  if (!tpl) return;

  document.getElementById('notifTitle').value = tpl.title;
  document.getElementById('notifBody').value = tpl.body;
  document.getElementById('notifType').value = tpl.type;

  document.querySelectorAll('.notif-template-btn').forEach(b => b.classList.remove('active'));
  event.currentTarget.classList.add('active');

  _updatePreview();
}

// ── PREVIEW ───────────────────────────────────────────────────

function _updatePreview() {
  const title = document.getElementById('notifTitle')?.value || 'Notification Title';
  const body = document.getElementById('notifBody')?.value || 'Notification message.';
  const type = document.getElementById('notifType')?.value || 'system';

  const icon = NOTIF_TYPE_ICONS[type] || '🔔';
  document.getElementById('notifPreviewIcon').textContent = icon;
  document.getElementById('notifPreviewTitle').textContent = title;
  document.getElementById('notifPreviewBody').textContent = body;
}

// ── RECIPIENT COUNT ───────────────────────────────────────────

function _updateRecipientCount() {
  const mode = document.getElementById('notifRecipient')?.value || 'all';
  let count = 0;
  if (mode === 'all') count = _notifAllUsers.length;
  else if (mode === 'premium') count = _notifAllUsers.filter(u => u.isPremium).length;
  else if (mode === 'free') count = _notifAllUsers.filter(u => !u.isPremium).length;
  else if (mode === 'specific') count = 1;

  const el = document.getElementById('notifRecipientCount');
  if (el) el.textContent = count === 1 && mode === 'specific' ? '1 specific' : count.toLocaleString();
}

// ── SEND ──────────────────────────────────────────────────────

async function sendBroadcastNotification() {
  const title = document.getElementById('notifTitle')?.value?.trim();
  const body = document.getElementById('notifBody')?.value?.trim();
  const type = document.getElementById('notifType')?.value || 'system';
  const mode = document.getElementById('notifRecipient')?.value || 'all';

  if (!title) { toast('Please enter a notification title', 'w'); return; }
  if (!body) { toast('Please enter a notification message', 'w'); return; }

  let recipients = [];
  if (mode === 'all') recipients = _notifAllUsers;
  else if (mode === 'premium') recipients = _notifAllUsers.filter(u => u.isPremium);
  else if (mode === 'free') recipients = _notifAllUsers.filter(u => !u.isPremium);
  else if (mode === 'specific') {
    const query = document.getElementById('notifSpecificUser')?.value?.trim();
    if (!query) { toast('Please enter a user email or ID', 'w'); return; }
    const found = _notifAllUsers.find(u => u.email === query || u.id === query);
    if (!found) { toast('User not found', 'e'); return; }
    recipients = [found];
  }

  if (recipients.length === 0) {
    toast('No users match the selected recipient group', 'w');
    return;
  }

  const modeLabel = { all: 'All Users', premium: 'Premium Only', free: 'Free Users', specific: 'Specific User' }[mode];
  const confirmed = confirm(`Send "${title}" to ${recipients.length} ${modeLabel}?`);
  if (!confirmed) return;

  const btn = document.getElementById('notifSendBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-sm"></span> Sending...';

  // Add progress indicator
  const progressHtml = `
    <div id="notifSendProgress" style="margin-top:12px">
      <div style="font-size:12px;color:var(--text2);margin-bottom:6px">
        <span id="notifProgressText">Sending to 0 / ${recipients.length} users...</span>
      </div>
      <div class="notif-progress"><div class="notif-progress-bar" id="notifProgressBar" style="width:0%"></div></div>
    </div>
  `;
  document.getElementById('notifPreviewBox').insertAdjacentHTML('afterend', progressHtml);

  let sent = 0;
  let errors = 0;
  const BATCH = 10;
  let firstError = null;

  try {
    const pb = getPb();

    // Debug: verify auth state
    console.log('[Notif] auth valid:', pb.authStore.isValid, '| token prefix:', pb.authStore.token?.slice(0,20));

    for (let i = 0; i < recipients.length; i += BATCH) {
      const batch = recipients.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map(user =>
        pb.collection('notifications').create({
          recipientId: user.id,
          senderId: 'system',
          senderName: 'Compair Team',
          type,
          title,
          body,
          referenceId: '',
          read: false,
        }, { $autoCancel: false })
      ));

      for (const r of results) {
        if (r.status === 'fulfilled') {
          sent++;
        } else {
          errors++;
          if (!firstError) firstError = r.reason;
          console.error('[Notif] create error:', r.reason?.message || r.reason);
        }
      }

      const pct = Math.round(((sent + errors) / recipients.length) * 100);
      const progressEl = document.getElementById('notifProgressBar');
      const textEl = document.getElementById('notifProgressText');
      if (progressEl) progressEl.style.width = pct + '%';
      if (textEl) textEl.textContent = `Sending... ${sent + errors} / ${recipients.length} users`;
    }

    if (sent === 0 && errors > 0) {
      toast('Send failed: ' + (firstError?.message || firstError || 'PocketBase rejected all records'), 'e');
      return;
    }

    // Log the broadcast
    _notifBroadcastLog.unshift({
      id: Date.now().toString(36),
      timestamp: new Date().toISOString(),
      title,
      body,
      type,
      recipientType: mode,
      recipientLabel: modeLabel,
      count: sent,
      errors,
    });
    await _saveBroadcastLog();

    toast(`✅ Sent to ${sent} users${errors > 0 ? ` (${errors} errors)` : ''}`, 's');
    _renderBroadcastHistory();
    _updateStats();
    resetNotifComposer();
  } catch (e) {
    console.error('[Notif] sendBroadcast fatal error:', e);
    toast('Send failed: ' + (e.message || e), 'e');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px;vertical-align:-2px"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Send Notification';
    document.getElementById('notifSendProgress')?.remove();
  }
}

// ── HISTORY ───────────────────────────────────────────────────

function _renderBroadcastHistory() {
  const list = document.getElementById('notifHistoryList');
  if (!list) return;

  if (_notifBroadcastLog.length === 0) {
    list.innerHTML = '<div class="placeholder" style="padding:24px;text-align:center;color:var(--text3)">No notifications sent yet. Use the composer above to send your first broadcast.</div>';
    return;
  }

  list.innerHTML = _notifBroadcastLog.map(item => {
    const icon = NOTIF_TYPE_ICONS[item.type] || '🔔';
    const badgeClass = { all: 'notif-badge-all', premium: 'notif-badge-premium', free: 'notif-badge-free', specific: 'notif-badge-specific' }[item.recipientType] || 'notif-badge-all';
    const date = new Date(item.timestamp);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="notif-history-item">
        <div class="notif-history-icon">${icon}</div>
        <div style="min-width:0">
          <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:2px">${escHtml(item.title)}</div>
          <div style="font-size:13px;color:var(--text2);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(item.body)}</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="notif-badge ${badgeClass}">${item.recipientLabel}</span>
            <span style="font-size:11px;color:var(--text3)">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              ${item.count.toLocaleString()} recipients
            </span>
            ${item.errors > 0 ? `<span style="font-size:11px;color:var(--danger)">${item.errors} errors</span>` : ''}
          </div>
        </div>
        <div style="text-align:right;white-space:nowrap;flex-shrink:0">
          <div style="font-size:12px;font-weight:600;color:var(--text2)">${dateStr}</div>
          <div style="font-size:11px;color:var(--text3)">${timeStr}</div>
        </div>
      </div>
    `;
  }).join('');

  const countEl = document.getElementById('notifSentCount');
  if (countEl) countEl.textContent = _notifBroadcastLog.length;
}

function _updateStats() {
  const total = _notifBroadcastLog.reduce((acc, i) => acc + (i.count || 0), 0);
  document.getElementById('notifStatTotal').textContent = total.toLocaleString();

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount = _notifBroadcastLog.filter(i => i.timestamp?.startsWith(todayStr)).reduce((acc, i) => acc + (i.count || 0), 0);
  document.getElementById('notifStatToday').textContent = todayCount.toLocaleString();

  document.getElementById('notifStatUsers').textContent = _notifAllUsers.length.toLocaleString();
  document.getElementById('notifStatRead').textContent = '—';
}

// ── RESET ─────────────────────────────────────────────────────

function resetNotifComposer() {
  ['notifTitle', 'notifBody'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('notifType').value = 'system';
  document.getElementById('notifRecipient').value = 'all';
  document.getElementById('notifPreviewTitle').textContent = 'Notification Title';
  document.getElementById('notifPreviewBody').textContent = 'Notification message will appear here.';
  document.getElementById('notifPreviewIcon').textContent = '🔔';
  document.querySelectorAll('.notif-template-btn').forEach(b => b.classList.remove('active'));
}

// ── HELPERS ───────────────────────────────────────────────────
// escHtml is defined in app.js — use it directly
