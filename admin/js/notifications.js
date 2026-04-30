// QOR AI ADMIN - Notification System

const NOTIF_TEMPLATES = [
  { id: 'new-feature', icon: '🚀', label: 'New Feature', type: 'marketing', title: { en: '🚀 New Feature Available', tr: '🚀 Yeni Özellik Geldi' }, body: { en: 'Qor AI has a new feature. Open the app and explore smarter comparisons.', tr: 'Qor AI yeni bir özellik ekledi. Uygulamayı aç ve daha akıllı karşılaştırmaları keşfet.' } },
  { id: 'price-drop', icon: '📉', label: 'Price Drop', type: 'alert', title: { en: '📉 A Product You Follow Dropped in Price', tr: '📉 Takip Ettiğin Üründe Fiyat Düştü' }, body: { en: 'A product you are interested in has a lower price. Open Qor AI to review the opportunity.', tr: 'İlgilendiğin bir ürünün fiyatı düştü. Fırsatı görmek için Qor AI’i aç.' } },
  { id: 'premium-offer', icon: '👑', label: 'Premium Offer', type: 'marketing', title: { en: '👑 Premium Offer', tr: '👑 Premium Teklifi' }, body: { en: 'Unlock unlimited AI comparisons, advanced analysis, and an ad-free experience.', tr: 'Sınırsız AI karşılaştırma, gelişmiş analiz ve reklamsız deneyimi aç.' } },
  { id: 'maintenance', icon: '🔧', label: 'Maintenance', type: 'alert', title: { en: '🔧 Scheduled Maintenance', tr: '🔧 Planlı Bakım' }, body: { en: 'Qor AI will enter short maintenance. Some services may be briefly unavailable.', tr: 'Qor AI kısa süreli bakıma girecek. Bazı servisler kısa süre erişilemeyebilir.' } },
  { id: 'welcome-back', icon: '👋', label: 'Welcome Back', type: 'transactional', title: { en: '👋 Welcome Back', tr: '👋 Tekrar Hoş Geldin' }, body: { en: 'New products have been added since your last visit. Continue exploring with Qor AI.', tr: 'Son ziyaretinden beri yeni ürünler eklendi. Qor AI ile keşfetmeye devam et.' } },
  { id: 'weekly-summary', icon: '📊', label: 'Weekly Summary', type: 'transactional', title: { en: '📊 Your Weekly Product Summary Is Ready', tr: '📊 Haftalık Ürün Özetin Hazır' }, body: { en: 'We prepared highlights from the categories you follow this week.', tr: 'Bu hafta ilgilendiğin kategorilerden öne çıkanları hazırladık.' } },
  { id: 'tip', icon: '💡', label: 'Tip', type: 'marketing', title: { en: '💡 Qor AI Tip', tr: '💡 Qor AI İpucu' }, body: { en: 'Paste any product link to get a detailed AI analysis in seconds.', tr: 'Herhangi bir ürün linkini yapıştırarak saniyeler içinde detaylı AI analizi alabilirsin.' } },
  { id: 'security', icon: '🛡️', label: 'Security', type: 'alert', title: { en: '🛡️ Security Update', tr: '🛡️ Güvenlik Güncellemesi' }, body: { en: 'We improved account security. Please review your settings when convenient.', tr: 'Hesap güvenliğini iyileştirdik. Uygun olduğunda ayarlarını gözden geçir.' } },
  { id: 'compare-recap', icon: '⚖️', label: 'Compare Recap', type: 'transactional', title: { en: '⚖️ Your Comparison Recap Is Ready', tr: '⚖️ Karşılaştırma Özetin Hazır' }, body: { en: 'Review your latest comparisons with AI notes.', tr: 'Son karşılaştırmalarını AI notlarıyla birlikte gözden geçir.' } },
  { id: 'new-products', icon: '🆕', label: 'New Products', type: 'marketing', title: { en: '🆕 New Products Added This Week', tr: '🆕 Bu Hafta Yeni Ürünler Eklendi' }, body: { en: 'New phones, laptops, audio products, and more are now in the catalog.', tr: 'Yeni telefonlar, laptoplar, ses ürünleri ve daha fazlası kataloğa eklendi.' } },
];

const NOTIF_TYPE_ICONS = { transactional: '✅', marketing: '📣', alert: '🔔', system: '⚙️', feature: '🚀', promo: '🎁', tip: '💡' };

let _notifAllUsers = [];
let _notifBroadcastLog = [];
let _notifSelectedTemplateId = '';

function _notifText(value, language = 'en') {
  if (value && typeof value === 'object') {
    const lang = String(language || 'en').toLowerCase();
    return value[lang] || value[lang.split('-')[0]] || value.en || value.tr || Object.values(value)[0] || '';
  }
  return String(value || '');
}

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
    <button class="notif-template-btn" onclick="applyTemplate('${t.id}')" title="${escHtml(_notifText(t.title, 'en'))}">
      <span style="font-size:20px;line-height:1">${t.icon}</span>
      <span style="font-size:11px;font-weight:600;color:var(--text2);margin-top:4px">${escHtml(t.label)}</span>
    </button>
  `).join('');

  if (!document.getElementById('notif-styles')) {
    const s = document.createElement('style');
    s.id = 'notif-styles';
    s.textContent = `.notif-template-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:10px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:all .15s;min-height:64px;font-family:inherit}.notif-template-btn:hover{border-color:var(--accent);background:var(--bg4);transform:translateY(-1px)}.notif-template-btn.active{border-color:var(--accent);background:rgba(99,102,241,.12)}.notif-history-item{display:grid;grid-template-columns:40px 1fr auto;gap:12px;align-items:start;padding:14px 16px;border:1px solid var(--border);border-radius:10px;background:var(--bg2);margin-bottom:8px}.notif-history-icon{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;background:rgba(99,102,241,.12)}.notif-badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:rgba(99,102,241,.15);color:#818cf8}.notif-progress{height:4px;background:var(--bg3);border-radius:2px;overflow:hidden;margin-top:8px}.notif-progress-bar{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:2px;transition:width .3s}`;
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
    title.addEventListener('input', () => { _notifSelectedTemplateId = ''; _updatePreview(); });
    body.addEventListener('input', () => { _notifSelectedTemplateId = ''; _updatePreview(); });
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
      const res = await pb.collection('users').getList(page, 200, { fields: 'id,email,isPremium,language,fcmToken', $autoCancel: false });
      allUsers = allUsers.concat(res.items);
      if (page >= res.totalPages) break;
      page++;
    }
    _notifAllUsers = allUsers;
  } catch (e) { console.warn('[Notif] load users error:', e); }
}

async function _loadBroadcastLog() {
  try {
    const pb = getPb();
    const rec = await pb.collection('app_config').getFirstListItem('key="notification_broadcast_log"', { $autoCancel: false });
    const raw = rec.value;
    _notifBroadcastLog = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
  } catch (_) { _notifBroadcastLog = []; }
  _renderBroadcastHistory();
}

async function _saveBroadcastLog() {
  try {
    const pb = getPb();
    const value = JSON.stringify(_notifBroadcastLog.slice(0, 50));
    try {
      const rec = await pb.collection('app_config').getFirstListItem('key="notification_broadcast_log"', { $autoCancel: false });
      await pb.collection('app_config').update(rec.id, { value });
    } catch (_) {
      await pb.collection('app_config').create({ key: 'notification_broadcast_log', value });
    }
  } catch (e) { console.warn('[Notif] save log error:', e); }
}

function applyTemplate(id) {
  const tpl = NOTIF_TEMPLATES.find(t => t.id === id);
  if (!tpl) return;
  _notifSelectedTemplateId = tpl.id;
  document.getElementById('notifTitle').value = _notifText(tpl.title, 'en');
  document.getElementById('notifBody').value = _notifText(tpl.body, 'en');
  document.getElementById('notifType').value = tpl.type;
  document.querySelectorAll('.notif-template-btn').forEach(b => b.classList.remove('active'));
  const activeTarget = typeof event !== 'undefined' ? event.currentTarget : null;
  if (activeTarget) activeTarget.classList.add('active');
  _updatePreview();
}

function _updatePreview() {
  const title = document.getElementById('notifTitle')?.value || 'Notification Title';
  const body = document.getElementById('notifBody')?.value || 'Notification message.';
  const type = document.getElementById('notifType')?.value || 'transactional';
  document.getElementById('notifPreviewIcon').textContent = NOTIF_TYPE_ICONS[type] || '🔔';
  document.getElementById('notifPreviewTitle').textContent = title;
  document.getElementById('notifPreviewBody').textContent = body;
}

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

async function sendBroadcastNotification() {
  const title = document.getElementById('notifTitle')?.value?.trim();
  const body = document.getElementById('notifBody')?.value?.trim();
  const type = document.getElementById('notifType')?.value || 'transactional';
  const mode = document.getElementById('notifRecipient')?.value || 'all';
  const template = NOTIF_TEMPLATES.find(t => t.id === _notifSelectedTemplateId);
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
  if (!recipients.length) { toast('No users match the selected recipient group', 'w'); return; }

  const modeLabel = { all: 'All Users', premium: 'Premium Only', free: 'Free Users', specific: 'Specific User' }[mode];
  if (!confirm(`Send "${title}" to ${recipients.length} ${modeLabel}?`)) return;

  const btn = document.getElementById('notifSendBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-sm"></span> Sending...';
  document.getElementById('notifPreviewBox').insertAdjacentHTML('afterend', `<div id="notifSendProgress" style="margin-top:12px"><div style="font-size:12px;color:var(--text2);margin-bottom:6px"><span id="notifProgressText">Sending to 0 / ${recipients.length} users...</span></div><div class="notif-progress"><div class="notif-progress-bar" id="notifProgressBar" style="width:0%"></div></div></div>`);

  let sent = 0;
  let errors = 0;
  let firstError = null;
  const BATCH = 10;
  try {
    const pb = getPb();
    for (let i = 0; i < recipients.length; i += BATCH) {
      const batch = recipients.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map(user => pb.collection('notifications').create({
        recipientId: user.id,
        senderId: 'system',
        senderName: 'Qor AI Team',
        type,
        title: template ? _notifText(template.title, user.language) : title,
        body: template ? _notifText(template.body, user.language) : body,
        referenceId: '',
        read: false,
      }, { $autoCancel: false })));

      for (const r of results) {
        if (r.status === 'fulfilled') sent++;
        else { errors++; if (!firstError) firstError = r.reason; console.error('[Notif] create error:', r.reason?.message || r.reason); }
      }
      const pct = Math.round(((sent + errors) / recipients.length) * 100);
      const progressEl = document.getElementById('notifProgressBar');
      const textEl = document.getElementById('notifProgressText');
      if (progressEl) progressEl.style.width = pct + '%';
      if (textEl) textEl.textContent = `Sending... ${sent + errors} / ${recipients.length} users`;
    }
    if (sent === 0 && errors > 0) { toast('Send failed: ' + (firstError?.message || firstError || 'PocketBase rejected all records'), 'e'); return; }
    _notifBroadcastLog.unshift({ id: Date.now().toString(36), timestamp: new Date().toISOString(), title, body, type, templateId: _notifSelectedTemplateId, recipientType: mode, recipientLabel: modeLabel, count: sent, errors });
    await _saveBroadcastLog();
    toast(`Sent to ${sent} users${errors > 0 ? ` (${errors} errors)` : ''}`, 's');
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

function _renderBroadcastHistory() {
  const list = document.getElementById('notifHistoryList');
  if (!list) return;
  if (!_notifBroadcastLog.length) {
    list.innerHTML = '<div class="placeholder" style="padding:24px;text-align:center;color:var(--text3)">No notifications sent yet. Use the composer above to send your first broadcast.</div>';
    return;
  }
  list.innerHTML = _notifBroadcastLog.map(item => {
    const icon = NOTIF_TYPE_ICONS[item.type] || '🔔';
    const date = new Date(item.timestamp);
    return `<div class="notif-history-item"><div class="notif-history-icon">${icon}</div><div style="min-width:0"><div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:2px">${escHtml(item.title)}</div><div style="font-size:13px;color:var(--text2);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(item.body)}</div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="notif-badge">${escHtml(item.recipientLabel || item.recipientType || 'Broadcast')}</span><span style="font-size:11px;color:var(--text3)">${Number(item.count || 0).toLocaleString()} recipients</span>${item.errors > 0 ? `<span style="font-size:11px;color:var(--danger)">${item.errors} errors</span>` : ''}</div></div><div style="text-align:right;white-space:nowrap"><div style="font-size:12px;font-weight:600;color:var(--text2)">${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div><div style="font-size:11px;color:var(--text3)">${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div></div></div>`;
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
  document.getElementById('notifStatRead').textContent = 'Live';
}

function resetNotifComposer() {
  ['notifTitle', 'notifBody'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('notifType').value = 'transactional';
  document.getElementById('notifRecipient').value = 'all';
  document.getElementById('notifPreviewTitle').textContent = 'Notification Title';
  document.getElementById('notifPreviewBody').textContent = 'Notification message will appear here.';
  document.getElementById('notifPreviewIcon').textContent = '🔔';
  _notifSelectedTemplateId = '';
  document.querySelectorAll('.notif-template-btn').forEach(b => b.classList.remove('active'));
}