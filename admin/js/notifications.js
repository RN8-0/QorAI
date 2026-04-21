// ═══════════════════════════════════════════════════════════
//  COMPAIR ADMIN — Notification System
// ═══════════════════════════════════════════════════════════

const NOTIF_TEMPLATES = [
  { id: 'new-feature', icon: '🚀', label: 'New Feature', type: 'feature',
    title: '✨ New Feature Available!',
    body: "We just launched a new feature to make your experience even better. Open the app to check it out!" },
  { id: 'price-drop', icon: '📉', label: 'Price Drop', type: 'alert',
    title: '📉 Price Drop Alert!',
    body: "Great news! A product you might like just dropped in price. Open Compair to see the latest deals." },
  { id: 'premium-offer', icon: '👑', label: 'Premium Offer', type: 'promo',
    title: '🎁 Limited Offer: Go Premium',
    body: "Unlock unlimited AI comparisons and advanced features. Upgrade to Premium today!" },
  { id: 'maintenance', icon: '🔧', label: 'Maintenance', type: 'system',
    title: '🔧 Scheduled Maintenance',
    body: "Compair will undergo brief maintenance soon. The service may be temporarily unavailable. Thank you for your patience." },
  { id: 'welcome-back', icon: '👋', label: 'Welcome Back', type: 'system',
    title: '👋 Welcome Back!',
    body: "Great to see you again! Check out the latest products and AI comparisons we've added since your last visit." },
  { id: 'review-request', icon: '⭐', label: 'Rate the App', type: 'system',
    title: '⭐ Enjoying Compair?',
    body: "If Compair has been helpful, please take a moment to rate us. Your feedback helps us grow!" },
  { id: 'weekly-summary', icon: '📊', label: 'Weekly Digest', type: 'system',
    title: '📊 Your Weekly Product Digest',
    body: "Your personalized product comparison digest for this week is ready. See what's trending in your categories!" },
  { id: 'tip', icon: '💡', label: 'Pro Tip', type: 'tip',
    title: '💡 Compair Pro Tip',
    body: "Did you know? You can paste any product link and our AI will instantly analyze specs, pricing, and alternatives!" },
  { id: 'announcement', icon: '📢', label: 'Announcement', type: 'system',
    title: '📢 Big News Coming Soon!',
    body: "We have something exciting to share with you very soon. Stay tuned for a special announcement!" },
  { id: 'security', icon: '🛡️', label: 'Security Notice', type: 'alert',
    title: '🛡️ Security Update',
    body: "We've strengthened our security features. Please review your account settings to keep your data safe." },
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

  if (!title) { showToast('Please enter a notification title', 'warn'); return; }
  if (!body) { showToast('Please enter a notification message', 'warn'); return; }

  let recipients = [];
  if (mode === 'all') recipients = _notifAllUsers;
  else if (mode === 'premium') recipients = _notifAllUsers.filter(u => u.isPremium);
  else if (mode === 'free') recipients = _notifAllUsers.filter(u => !u.isPremium);
  else if (mode === 'specific') {
    const query = document.getElementById('notifSpecificUser')?.value?.trim();
    if (!query) { showToast('Please enter a user email or ID', 'warn'); return; }
    const found = _notifAllUsers.find(u => u.email === query || u.id === query);
    if (!found) { showToast('User not found', 'error'); return; }
    recipients = [found];
  }

  if (recipients.length === 0) {
    showToast('No users match the selected recipient group', 'warn');
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

  try {
    const pb = getPb();

    for (let i = 0; i < recipients.length; i += BATCH) {
      const batch = recipients.slice(i, i + BATCH);
      await Promise.all(batch.map(user =>
        pb.collection('notifications').create({
          recipientId: user.id,
          senderId: 'system',
          senderName: 'Compair Team',
          type,
          title,
          body,
          referenceId: '',
          read: false,
        }, { $autoCancel: false }).catch(() => { errors++; })
      ));
      sent += batch.length;

      const pct = Math.round((sent / recipients.length) * 100);
      const progressEl = document.getElementById('notifProgressBar');
      const textEl = document.getElementById('notifProgressText');
      if (progressEl) progressEl.style.width = pct + '%';
      if (textEl) textEl.textContent = `Sending... ${sent} / ${recipients.length} users`;
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

    showToast(`✅ Sent to ${sent} users${errors > 0 ? ` (${errors} errors)` : ''}`, 'success');
    _renderBroadcastHistory();
    _updateStats();
    resetNotifComposer();
  } catch (e) {
    showToast('Send failed: ' + (e.message || e), 'error');
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
