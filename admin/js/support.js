/**
 * Qor AI Admin — Support Messages
 * Destek mesajlarını yükler, listeler ve yanıtlar.
 * Yanıt gönderince notifications koleksiyonuna kayıt oluşturur
 * → pb_hook (notify_fcm.pb.js) FCM push gönderir.
 */

let _supportMessages = [];
let _supportSubscriptionReady = false;
const _supportAccountProfiles = new Map();

function _normalizeSupportText(value) {
  return String(value || '').trim();
}

function _normalizeSupportEmail(value) {
  return _normalizeSupportText(value).toLowerCase();
}

function _normalizeSupportAccount(record) {
  const email = _normalizeSupportEmail(record?.email || record?.googleEmail);
  const displayName = _normalizeSupportText(record?.displayName || record?.name);
  return {
    displayName: displayName || (email.includes('@') ? email.split('@')[0] : ''),
    email,
  };
}

function _preferredSupportName(message) {
  return _normalizeSupportText(message?.accountDisplayName || message?.displayName) || 'İsimsiz';
}

function _preferredSupportEmail(message) {
  return _normalizeSupportEmail(message?.accountEmail || message?.email);
}

function _hasSeparateSubmittedIdentity(message) {
  const accountName = _normalizeSupportText(message?.accountDisplayName);
  const accountEmail = _normalizeSupportEmail(message?.accountEmail);
  const submittedName = _normalizeSupportText(message?.displayName);
  const submittedEmail = _normalizeSupportEmail(message?.email);
  if (!accountName && !accountEmail) return false;
  return accountName !== submittedName || accountEmail !== submittedEmail;
}

function _supportIdentityCaption(message) {
  if (!_hasSeparateSubmittedIdentity(message)) return '';
  return `
    <div style="font-size:11px;color:var(--text3);margin-top:6px">
      Formda girilen: ${escapeHtml(_normalizeSupportText(message.displayName) || 'İsimsiz')}
      ${message.email ? `&lt;${escapeHtml(_normalizeSupportEmail(message.email))}&gt;` : ''}
    </div>`;
}

function _applySupportAccount(message) {
  const userId = _normalizeSupportText(message?.userId);
  if (!userId || !_supportAccountProfiles.has(userId)) return { ...message };
  const account = _supportAccountProfiles.get(userId);
  if (!account) return { ...message };
  return {
    ...message,
    accountDisplayName: account.displayName,
    accountEmail: account.email,
  };
}

async function _ensureSupportAccountProfile(userId) {
  const normalizedUserId = _normalizeSupportText(userId);
  if (!normalizedUserId || _supportAccountProfiles.has(normalizedUserId)) return;

  try {
    const record = await getPb().collection('users').getOne(normalizedUserId, {
      fields: 'id,displayName,name,email,googleEmail',
      $autoCancel: false,
    });
    _supportAccountProfiles.set(normalizedUserId, _normalizeSupportAccount(record));
  } catch (e) {
    console.warn('support account lookup:', normalizedUserId, e);
    _supportAccountProfiles.set(normalizedUserId, null);
  }
}

async function _hydrateSupportMessages(messages) {
  const items = Array.isArray(messages) ? messages : [];
  const userIds = [...new Set(items.map((item) => _normalizeSupportText(item?.userId)).filter(Boolean))];
  await Promise.all(userIds.map((userId) => _ensureSupportAccountProfile(userId)));
  _supportMessages = _sortSupportMessages(items.map((item) => _applySupportAccount(item)));
}

function _sortSupportMessages(items) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left?.repliedAt || left?.created || '') || 0;
    const rightTime = Date.parse(right?.repliedAt || right?.created || '') || 0;
    return rightTime - leftTime;
  });
}

function _upsertSupportMessage(record) {
  const next = _supportMessages.filter((item) => item.id !== record.id);
  next.push(record);
  _supportMessages = _sortSupportMessages(next);
}

function _removeSupportMessage(id) {
  _supportMessages = _supportMessages.filter((item) => item.id !== id);
}

/* ──────────────────────────────────────────────
   LOAD
────────────────────────────────────────────── */
async function loadSupportMessages() {
  const el = document.getElementById('supportMessagesList');
  if (el) el.innerHTML = '<div class="placeholder">Yükleniyor...</div>';

  try {
    const records = await pbGetList('support_messages', 1, 200, {
      sort: '-created',
    });
    await _hydrateSupportMessages(records.items || records);
    renderSupportMessages();
    updateSupportBadge();
  } catch (e) {
    console.error('loadSupportMessages:', e);
    if (el) el.innerHTML = '<div class="placeholder">Yüklenemedi. Koleksiyon mevcut değil olabilir.</div>';
  }
}

async function initSupportInbox(options = {}) {
  const forceReload = !!options.forceReload;
  if (forceReload || !_supportMessages.length) {
    await loadSupportMessages();
  } else {
    renderSupportMessages();
    updateSupportBadge();
  }

  if (_supportSubscriptionReady) return;

  try {
    await getPb().collection('support_messages').subscribe('*', async (event) => {
      const record = event?.record;
      if (!record?.id) return;

      if (event.action === 'delete') {
        _removeSupportMessage(record.id);
        closeSupportModal(record.id);
      } else {
        await _ensureSupportAccountProfile(record.userId);
        const existing = _supportMessages.find((item) => item.id === record.id);
        _upsertSupportMessage(_applySupportAccount(record));
        if (event.action === 'create' && !existing) {
          toast(`Yeni destek mesajı: ${_preferredSupportName(_applySupportAccount(record))}`, 'i');
        }
      }

      renderSupportMessages();
      updateSupportBadge();
    });
    _supportSubscriptionReady = true;
  } catch (e) {
    console.error('support subscribe:', e);
  }
}

async function disposeSupportInbox() {
  if (!_supportSubscriptionReady) return;
  try {
    await getPb().collection('support_messages').unsubscribe('*');
  } catch (e) {
    console.warn('support unsubscribe:', e);
  }
  _supportSubscriptionReady = false;
}

/* ──────────────────────────────────────────────
   BADGE (sidebar unread count)
────────────────────────────────────────────── */
function updateSupportBadge() {
  const visibleMessages = _supportMessages.filter((m) => m.status !== 'admin_message');
  const openCount = visibleMessages.filter(m => m.status === 'open').length;
  const badge = document.getElementById('supportBadge');
  const countEl = document.getElementById('supportCount');
  if (badge) {
    if (openCount > 0) {
      badge.textContent = openCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
  if (countEl) countEl.textContent = visibleMessages.length;
}

/* ──────────────────────────────────────────────
   RENDER LIST
────────────────────────────────────────────── */
function renderSupportMessages() {
  const el = document.getElementById('supportMessagesList');
  if (!el) return;

  const filter = (document.getElementById('supportStatusFilter')?.value || '').trim();
  let msgs = _supportMessages.filter((m) => m.status !== 'admin_message');
  if (filter) msgs = msgs.filter(m => m.status === filter);

  if (!msgs.length) {
    el.innerHTML = '<div class="placeholder">Mesaj bulunamadı.</div>';
    return;
  }

  el.innerHTML = msgs.map(m => {
    const isOpen = m.status === 'open';
    const date = (m.repliedAt || m.created) ? new Date(m.repliedAt || m.created).toLocaleString('tr-TR') : '—';
    const preferredName = _preferredSupportName(m);
    const preferredEmail = _preferredSupportEmail(m);
    return `
    <div class="activity-log-item" style="cursor:pointer;border-left:3px solid ${isOpen ? 'var(--amber)' : 'var(--green,#22c55e)'};padding:12px 16px;margin-bottom:8px;border-radius:6px;background:var(--surface-2)" onclick="openSupportMessage('${m.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px;color:var(--text)">${escapeHtml(preferredName)} <span style="font-size:12px;font-weight:400;color:var(--text2)">&lt;${escapeHtml(preferredEmail)}&gt;</span></div>
          ${_supportIdentityCaption(m)}
          <div style="font-size:13px;color:var(--text2);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml((m.message || '').substring(0, 120))}${(m.message || '').length > 120 ? '…' : ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
          <span class="badge" style="background:${isOpen ? 'rgba(245,158,11,.15)' : 'rgba(34,197,94,.15)'};color:${isOpen ? '#f59e0b' : '#22c55e'}">${isOpen ? 'Açık' : 'Yanıtlandı'}</span>
          <span style="font-size:11px;color:var(--text3)">${date}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ──────────────────────────────────────────────
   DETAIL / REPLY MODAL
────────────────────────────────────────────── */
function openSupportMessage(id) {
  const m = _supportMessages.find(x => x.id === id);
  if (!m) return;

  const date = (m.repliedAt || m.created) ? new Date(m.repliedAt || m.created).toLocaleString('tr-TR') : '—';
  const repliedAt = m.repliedAt ? new Date(m.repliedAt).toLocaleString('tr-TR') : null;
  const preferredName = _preferredSupportName(m);
  const preferredEmail = _preferredSupportEmail(m);
  const submittedName = _normalizeSupportText(m.displayName);
  const submittedEmail = _normalizeSupportEmail(m.email);

  document.getElementById('supportModalTitle').textContent = `Mesaj — ${preferredName}`;
  document.getElementById('supportModalBody').innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-size:12px;color:var(--text3);margin-bottom:4px">Hesaba Kayıtlı Bilgi</div>
      <div style="font-weight:600">${escapeHtml(preferredName)}</div>
      <div style="font-size:13px;color:var(--text2)">${escapeHtml(preferredEmail)}</div>
      ${_hasSeparateSubmittedIdentity(m) ? `
      <div style="font-size:12px;color:var(--text3);margin-top:12px;margin-bottom:4px">Formda Girilen Bilgi</div>
      <div style="font-weight:600">${escapeHtml(submittedName || 'İsimsiz')}</div>
      <div style="font-size:13px;color:var(--text2)">${escapeHtml(submittedEmail)}</div>` : ''}
      <div style="font-size:12px;color:var(--text3);margin-top:4px">${date}</div>
    </div>
    <div style="margin-bottom:20px;background:var(--bg3);border-radius:8px;padding:14px">
      <div style="font-size:12px;font-weight:600;color:var(--text3);margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em">Mesaj</div>
      <div style="font-size:14px;color:var(--text);white-space:pre-wrap;line-height:1.6">${escapeHtml(m.message || '')}</div>
    </div>
    ${m.status === 'replied' ? `
    <div style="margin-bottom:20px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:8px;padding:14px">
      <div style="font-size:12px;font-weight:600;color:#22c55e;margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em">Yanıtınız</div>
      <div style="font-size:14px;color:var(--text);white-space:pre-wrap;line-height:1.6">${escapeHtml(m.adminReply || '')}</div>
      ${repliedAt ? `<div style="font-size:11px;color:var(--text3);margin-top:8px">${repliedAt}</div>` : ''}
    </div>` : ''}
    ${m.status !== 'replied' ? `
    <div>
      <label style="font-size:12px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:8px">Yanıt Yaz</label>
      <textarea class="input" id="supportReplyText" rows="5" placeholder="Kullanıcıya gönderilecek yanıt..." style="resize:vertical;width:100%"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:12px">
        <button class="btn btn-danger" onclick="deleteSupportMessage('${m.id}')">Sil</button>
        <button class="btn btn-ghost" onclick="closeSupportModal()">İptal</button>
        <button class="btn btn-primary" onclick="sendSupportReply('${m.id}','${m.userId || ''}')">
          Yanıtla &amp; Bildirim Gönder
        </button>
      </div>
    </div>` : `
    <div style="display:flex;justify-content:flex-end">
      <button class="btn btn-danger" style="margin-right:10px" onclick="deleteSupportMessage('${m.id}')">Sil</button>
      <button class="btn btn-ghost" onclick="closeSupportModal()">Kapat</button>
    </div>`}
  `;

  document.getElementById('supportModal').style.display = 'flex';
}

function closeSupportModal() {
  const modal = document.getElementById('supportModal');
  if (modal) modal.style.display = 'none';
}

/* ──────────────────────────────────────────────
   SEND REPLY
────────────────────────────────────────────── */
async function sendSupportReply(messageId, userId) {
  const message = _supportMessages.find((item) => item.id === messageId) || null;
  let resolvedUserId = _normalizeSupportText(userId);
  if (!resolvedUserId && message) {
    const candidateEmail = _preferredSupportEmail(message);
    if (candidateEmail) {
      try {
        const found = await getPb().collection('users').getFirstListItem(
          `email = "${candidateEmail.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" || googleEmail = "${candidateEmail.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
          {
            fields: 'id,displayName,name,email,googleEmail',
            $autoCancel: false,
          },
        );
        if (found?.id) {
          resolvedUserId = found.id;
          _supportAccountProfiles.set(found.id, _normalizeSupportAccount(found));
          const idx = _supportMessages.findIndex((item) => item.id === messageId);
          if (idx !== -1) {
            _supportMessages[idx] = _applySupportAccount({
              ..._supportMessages[idx],
              userId: found.id,
            });
          }
          try {
            await pbUpdateDoc('support_messages', messageId, { userId: found.id });
          } catch (_) {}
        }
      } catch (_) {}
    }
  }

  const replyText = (document.getElementById('supportReplyText')?.value || '').trim();
  if (!replyText) {
    toast('Yanıt metni boş olamaz.', 'w');
    return;
  }
  if (!resolvedUserId) {
    toast('Bu mesaj kullanıcı hesabına bağlı değil. Cihaz bildirimi gönderilemez.', 'e');
    return;
  }

  const btn = document.querySelector('#supportModalBody .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Gönderiliyor...'; }

  try {
    // 1) support_messages güncelle
    await pbUpdateDoc('support_messages', messageId, {
      status: 'replied',
      adminReply: replyText,
      repliedAt: new Date().toISOString(),
    });

    // 2) notification oluştur → pb_hook FCM push atar
    if (resolvedUserId) {
      const pb = getPb();
      await pb.collection('notifications').create({
        recipientId: resolvedUserId,
        senderId: 'admin',
        senderName: 'Qor AI Destek',
        type: 'system',
        title: 'Mesajınıza yanıt geldi',
        body: replyText,
        referenceId: messageId,
        read: false,
      });
    }

    toast('Yanıt gönderildi!', 's');
    closeSupportModal();

    // Local state güncelle
    const idx = _supportMessages.findIndex(m => m.id === messageId);
    if (idx !== -1) {
      _supportMessages[idx].status = 'replied';
      _supportMessages[idx].adminReply = replyText;
      _supportMessages[idx].repliedAt = new Date().toISOString();
      _supportMessages[idx].userId = resolvedUserId;
    }
    renderSupportMessages();
    updateSupportBadge();
  } catch (e) {
    try {
      await pbUpdateDoc('support_messages', messageId, {
        status: 'open',
        adminReply: '',
        repliedAt: '',
      });
    } catch (_) {}
    console.error('sendSupportReply:', e);
    toast('Yanıt gönderilemedi: ' + (e.message || e), 'e');
    if (btn) { btn.disabled = false; btn.textContent = 'Yanıtla & Bildirim Gönder'; }
  }
}

async function deleteSupportMessage(messageId) {
  const message = _supportMessages.find((item) => item.id === messageId);
  if (!message) return;

  const confirmed = confirm(`Bu destek mesajı silinsin mi?\n\n${_preferredSupportName(message)} <${_preferredSupportEmail(message)}>`);
  if (!confirmed) return;

  const buttons = Array.from(document.querySelectorAll('#supportModalBody button'));
  buttons.forEach((button) => { button.disabled = true; });

  try {
    await pbDeleteDoc('support_messages', messageId);
    _removeSupportMessage(messageId);
    renderSupportMessages();
    updateSupportBadge();
    closeSupportModal();
    toast('Destek mesajı silindi.', 's');
  } catch (e) {
    console.error('deleteSupportMessage:', e);
    toast('Destek mesajı silinemedi: ' + (e.message || e), 'e');
    buttons.forEach((button) => { button.disabled = false; });
  }
}

/* ──────────────────────────────────────────────
   HELPER
────────────────────────────────────────────── */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
