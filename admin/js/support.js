/**
 * Qor AI Admin — Support Messages (v2 — Chat System)
 * - Sohbetler kullanıcıya göre gruplanır
 * - Her konuşma bir chat thread'i gösterir (chatMessages JSON)
 * - Admin yanıt verir, ban eder, toplu siler
 * - Bildirim → pb_hook FCM push gönderir
 */

let _supportMessages = [];
let _supportSubscriptionReady = false;
const _supportAccountProfiles = new Map();

/* ──────────────────────────────────────────────
   HELPERS
────────────────────────────────────────────── */
function _normalizeSupportText(value) { return String(value || '').trim(); }
function _normalizeSupportEmail(value) { return _normalizeSupportText(value).toLowerCase(); }

function _normalizeSupportAccount(record) {
  const email = _normalizeSupportEmail(record?.email || record?.googleEmail);
  const displayName = _normalizeSupportText(record?.displayName || record?.name);
  return { displayName: displayName || (email.includes('@') ? email.split('@')[0] : ''), email };
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
  if (!accountName && !accountEmail) return false;
  return accountName !== _normalizeSupportText(message?.displayName) ||
         accountEmail !== _normalizeSupportEmail(message?.email);
}
function _supportIdentityCaption(message) {
  if (!_hasSeparateSubmittedIdentity(message)) return '';
  return `<div style="font-size:11px;color:var(--text3);margin-top:6px">Formda: ${escapeHtml(_normalizeSupportText(message.displayName)||'İsimsiz')}${message.email?` &lt;${escapeHtml(_normalizeSupportEmail(message.email))}&gt;`:''}</div>`;
}
function _applySupportAccount(message) {
  const userId = _normalizeSupportText(message?.userId);
  if (!userId || !_supportAccountProfiles.has(userId)) return { ...message };
  const account = _supportAccountProfiles.get(userId);
  if (!account) return { ...message };
  return { ...message, accountDisplayName: account.displayName, accountEmail: account.email };
}
async function _ensureSupportAccountProfile(userId) {
  const id = _normalizeSupportText(userId);
  if (!id || _supportAccountProfiles.has(id)) return;
  try {
    const record = await getPb().collection('users').getOne(id, { fields: 'id,displayName,name,email,googleEmail', $autoCancel: false });
    _supportAccountProfiles.set(id, _normalizeSupportAccount(record));
  } catch (e) {
    _supportAccountProfiles.set(id, null);
  }
}
async function _hydrateSupportMessages(messages) {
  const items = Array.isArray(messages) ? messages : [];
  const userIds = [...new Set(items.map(i => _normalizeSupportText(i?.userId)).filter(Boolean))];
  await Promise.all(userIds.map(uid => _ensureSupportAccountProfile(uid)));
  _supportMessages = _sortSupportMessages(items.map(i => _applySupportAccount(i)));
}
function _sortSupportMessages(items) {
  return [...items].sort((a, b) => {
    const tA = _supportLastActivityAt(a);
    const tB = _supportLastActivityAt(b);
    return tB - tA;
  });
}
function _upsertSupportMessage(record) {
  const next = _supportMessages.filter(i => i.id !== record.id);
  next.push(record);
  _supportMessages = _sortSupportMessages(next);
}
function _removeSupportMessage(id) {
  _supportMessages = _supportMessages.filter(i => i.id !== id);
}

/** chatMessages JSON array'ini parse eder ya da eski alanlardan yeniden üretir */
function _parseChatMessages(m) {
  let raw = m.chatMessages;
  if (typeof raw === 'string' && raw) { try { raw = JSON.parse(raw); } catch (_) { raw = []; } }
  if (!Array.isArray(raw) && raw != null) { try { raw = JSON.parse(String(raw)); } catch (_) { raw = []; } }
  if (Array.isArray(raw) && raw.length) return raw;
  // Backwards compat
  const list = [];
  const msg = _normalizeSupportText(m.message);
  const reply = _normalizeSupportText(m.adminReply);
  if (msg) list.push({ role: m.status === 'admin_message' ? 'admin' : 'user', text: msg, ts: m.created || '' });
  if (reply) list.push({ role: 'admin', text: reply, ts: m.repliedAt || m.created || '' });
  return list;
}

function _supportLastActivityAt(message) {
  const chat = _parseChatMessages(message || {});
  const last = chat[chat.length - 1];
  return Date.parse(last?.ts || message?.repliedAt || message?.updated || message?.created || '') || 0;
}

function _isSupportClosed(message) { return message?.banned === true; }
function _needsAdminReply(message) {
  if (_isSupportClosed(message)) return false;
  const chat = _parseChatMessages(message || {});
  return chat.length > 0 && chat[chat.length - 1]?.role !== 'admin';
}

function _supportStatusBadge(message) {
  if (_isSupportClosed(message)) return '<span class="badge" style="background:rgba(239,68,68,.15);color:#ef4444;font-size:10px">Kapalı</span>';
  if (_needsAdminReply(message)) return '<span class="badge" style="background:rgba(245,158,11,.15);color:#f59e0b;font-size:10px">Yanıt bekliyor</span>';
  return '<span class="badge" style="background:rgba(34,197,94,.15);color:#22c55e;font-size:10px">Admin yazdı</span>';
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ──────────────────────────────────────────────
   LOAD & SUBSCRIBE
────────────────────────────────────────────── */
async function loadSupportMessages() {
  const el = document.getElementById('supportMessagesList');
  if (el) el.innerHTML = '<div class="placeholder">Yükleniyor...</div>';
  try {
    const records = await pbGetList('support_messages', 1, 300, { sort: '-created' });
    await _hydrateSupportMessages(records.items || records);
    renderSupportMessages();
    updateSupportBadge();
  } catch (e) {
    console.error('loadSupportMessages:', e);
    if (el) el.innerHTML = '<div class="placeholder">Yüklenemedi.</div>';
  }
}

async function initSupportInbox(options = {}) {
  if (options.forceReload || !_supportMessages.length) {
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
        _closeSupportChatModal();
      } else {
        await _ensureSupportAccountProfile(record.userId);
        const existing = _supportMessages.find(i => i.id === record.id);
        _upsertSupportMessage(_applySupportAccount(record));
        if (event.action === 'create' && !existing) {
          toast(`Yeni destek mesajı: ${_preferredSupportName(_applySupportAccount(record))}`, 'i');
        } else {
          // Refresh open chat modal if matches
          const modalId = document.getElementById('supportChatModal')?.dataset?.messageId;
          if (modalId === record.id) _renderChatModalThread(record.id);
        }
      }
      renderSupportMessages();
      updateSupportBadge();
    });
    _supportSubscriptionReady = true;
  } catch (e) { console.error('support subscribe:', e); }
}

async function disposeSupportInbox() {
  if (!_supportSubscriptionReady) return;
  try { await getPb().collection('support_messages').unsubscribe('*'); } catch (_) {}
  _supportSubscriptionReady = false;
}

/* ──────────────────────────────────────────────
   BADGE
────────────────────────────────────────────── */
function updateSupportBadge() {
  const openCount = _supportMessages.filter(_needsAdminReply).length;
  const badge = document.getElementById('supportBadge');
  const countEl = document.getElementById('supportCount');
  if (badge) { badge.textContent = openCount; badge.style.display = openCount > 0 ? 'inline-block' : 'none'; }
  if (countEl) countEl.textContent = _supportMessages.length;
}

/* ──────────────────────────────────────────────
   RENDER LIST — Tek kayıt, tek sohbet
────────────────────────────────────────────── */
function renderSupportMessages() {
  const el = document.getElementById('supportMessagesList');
  if (!el) return;

  const filterVal = (document.getElementById('supportStatusFilter')?.value || '').trim();

  let msgs = [..._supportMessages];
  if (filterVal === 'open') msgs = msgs.filter(_needsAdminReply);
  if (filterVal === 'replied') msgs = msgs.filter(m => !_isSupportClosed(m) && !_needsAdminReply(m));
  if (filterVal === 'closed') msgs = msgs.filter(_isSupportClosed);

  if (!msgs.length) {
    el.innerHTML = '<div class="placeholder">Mesaj bulunamadı.</div>';
    return;
  }

  el.innerHTML = msgs.map(m => {
    const chatMsgs = _parseChatMessages(m);
    const lastMsg = chatMsgs[chatMsgs.length - 1];
    const preferredName = _preferredSupportName(m);
    const preferredEmail = _preferredSupportEmail(m);
    const previewSource = lastMsg?.text || m.message || '';
    const preview = previewSource.substring(0, 120) + (previewSource.length > 120 ? '…' : '');
    const dateValue = _supportLastActivityAt(m);
    const dateStr = dateValue ? new Date(dateValue).toLocaleString('tr-TR') : '—';
    const initial = (preferredName || preferredEmail || '?').charAt(0).toUpperCase();

    return `<div style="border-radius:10px;background:var(--surface-2);border:1px solid var(--border);margin-bottom:10px;overflow:hidden;cursor:pointer" onclick="openSupportChatModal('${m.id}')" onmouseover="this.style.background='var(--surface-3)'" onmouseout="this.style.background='var(--surface-2)'">
      <div style="padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">${escapeHtml(initial)}</div>
          <div style="min-width:0">
            <div style="font-weight:700;font-size:14px;color:var(--text)">${escapeHtml(preferredName)}</div>
            <div style="font-size:11px;color:var(--text3)">${escapeHtml(preferredEmail || 'E-posta yok')}${m.userId ? ` · ID: ${escapeHtml(m.userId)}` : ''}</div>
            ${_supportIdentityCaption(m)}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${_supportStatusBadge(m)}
          <span style="font-size:11px;color:var(--text3)">${chatMsgs.length} mesaj · ${dateStr}</span>
        </div>
      </div>
      <div style="padding:0 16px 14px;color:var(--text2);font-size:12px;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(preview || 'Mesaj yok')}</div>
    </div>`;
  }).join('');
}

/* ──────────────────────────────────────────────
   BULK DELETE — Yanıtlanan mesajları toplu sil
────────────────────────────────────────────── */
async function deleteRepliedSupportMessages() {
  const replied = _supportMessages.filter(m => !_isSupportClosed(m) && !_needsAdminReply(m));
  if (!replied.length) { toast('Silinecek yanıtlanmış mesaj yok.', 'w'); return; }

  const ok = confirm(`${replied.length} adet yanıtlanmış destek mesajı silinsin mi? Bu işlem geri alınamaz.`);
  if (!ok) return;

  let deleted = 0;
  const errors = [];
  for (const m of replied) {
    try {
      await pbDeleteDoc('support_messages', m.id);
      _removeSupportMessage(m.id);
      deleted++;
    } catch (e) {
      errors.push(m.id);
    }
  }

  renderSupportMessages();
  updateSupportBadge();
  if (errors.length) {
    toast(`${deleted} mesaj silindi, ${errors.length} silinemedi.`, 'w');
  } else {
    toast(`${deleted} yanıtlanmış mesaj silindi.`, 's');
  }
}

/* ──────────────────────────────────────────────
   CHAT MODAL — Konuşma Detayı + Admin Yanıt
────────────────────────────────────────────── */
function openSupportChatModal(messageId) {
  const modal = document.getElementById('supportChatModal');
  if (!modal) return;
  modal.dataset.messageId = messageId;
  modal.style.display = 'flex';
  _renderChatModalThread(messageId);
}

function _closeSupportChatModal() {
  const modal = document.getElementById('supportChatModal');
  if (modal) { modal.style.display = 'none'; delete modal.dataset.messageId; }
}

function _renderChatModalThread(messageId) {
  const m = _supportMessages.find(x => x.id === messageId);
  if (!m) return;

  const chatMsgs = _parseChatMessages(m);
  const preferredName = _preferredSupportName(m);
  const preferredEmail = _preferredSupportEmail(m);
  const isClosed = _isSupportClosed(m);
  const lastIsUser = chatMsgs.length > 0 && chatMsgs[chatMsgs.length - 1].role === 'user';

  const titleEl = document.getElementById('supportChatModalTitle');
  if (titleEl) titleEl.textContent = `Sohbet — ${preferredName}`;

  const body = document.getElementById('supportChatModalBody');
  if (!body) return;

  const messagesHtml = chatMsgs.length === 0
    ? '<div style="text-align:center;padding:20px;color:var(--text3)">Henüz mesaj yok.</div>'
    : chatMsgs.map(msg => {
        const isAdmin = msg.role === 'admin';
        const timeStr = msg.ts ? new Date(msg.ts).toLocaleString('tr-TR') : '';
        return `<div style="display:flex;flex-direction:column;align-items:${isAdmin ? 'flex-start' : 'flex-end'};margin-bottom:12px">
          <div style="font-size:10px;color:var(--text3);margin-bottom:3px">${isAdmin ? '🛡️ Admin' : `👤 ${escapeHtml(preferredName)}`}${timeStr ? ` · ${timeStr}` : ''}</div>
          <div style="max-width:75%;padding:10px 14px;border-radius:${isAdmin ? '4px 14px 14px 14px' : '14px 4px 14px 14px'};background:${isAdmin ? 'rgba(124,58,237,.12)' : 'rgba(59,130,246,.10)'};border:1px solid ${isAdmin ? 'rgba(124,58,237,.2)' : 'rgba(59,130,246,.2)'};font-size:13px;color:var(--text);white-space:pre-wrap;line-height:1.5">${escapeHtml(msg.text)}</div>
        </div>`;
      }).join('');

  body.innerHTML = `
    <div style="background:var(--bg2);border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div>
        <div style="font-weight:600;font-size:13px">${escapeHtml(preferredName)}</div>
        <div style="font-size:11px;color:var(--text3)">${escapeHtml(preferredEmail)} · ${m.userId ? `ID: ${escapeHtml(m.userId)}` : 'ID yok'}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${_supportStatusBadge(m)}
        <button class="btn btn-sm ${isClosed ? 'btn-ghost' : 'btn-danger'}" onclick="toggleSupportBan('${messageId}',${!isClosed})">${isClosed ? 'Yeniden Aç' : 'Sohbeti Kapat'}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteSupportMessage('${messageId}')">Sil</button>
      </div>
    </div>
    <!-- Thread -->
    <div id="supportChatThread" style="max-height:320px;overflow-y:auto;margin-bottom:16px;padding:4px">
      ${messagesHtml}
    </div>
    ${isClosed ? `<div style="padding:12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:8px;font-size:13px;color:#ef4444;text-align:center">Bu sohbet kapalı — kullanıcı bu kayıt üzerinden yanıt gönderemez.</div>` : `
    <!-- Admin Yanıt -->
    <div>
      <label style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:6px">${lastIsUser ? 'Kullanıcı mesajına yanıt ver' : 'Yeni mesaj gönder'}</label>
      <textarea class="input" id="supportChatReplyText" rows="4" placeholder="Admin yanıtı..." style="resize:vertical;width:100%"></textarea>
      <div style="display:flex;justify-content:flex-end;margin-top:10px;gap:8px">
        <button class="btn btn-ghost" onclick="_closeSupportChatModal()">Kapat</button>
        <button class="btn btn-primary" onclick="sendSupportChatReply('${messageId}','${m.userId || ''}')">Gönder &amp; Bildirim</button>
      </div>
    </div>`}
  `;

  // Scroll to bottom
  setTimeout(() => {
    const thread = document.getElementById('supportChatThread');
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, 50);
}

/* ──────────────────────────────────────────────
   BAN / UNBAN
────────────────────────────────────────────── */
async function toggleSupportBan(messageId, ban) {
  try {
    await pbUpdateDoc('support_messages', messageId, { banned: ban });
    const idx = _supportMessages.findIndex(m => m.id === messageId);
    if (idx !== -1) _supportMessages[idx].banned = ban;
    _renderChatModalThread(messageId);
    renderSupportMessages();
    toast(ban ? 'Sohbet kapatıldı.' : 'Sohbet yeniden açıldı.', 's');
  } catch (e) {
    toast('İşlem başarısız: ' + (e.message || e), 'e');
  }
}

/* ──────────────────────────────────────────────
   SEND CHAT REPLY (yeni chat formatı)
────────────────────────────────────────────── */
async function sendSupportChatReply(messageId, userId) {
  const m = _supportMessages.find(x => x.id === messageId);
  let resolvedUserId = _normalizeSupportText(userId);

  // userId yoksa email ile bul
  if (!resolvedUserId && m) {
    const candidateEmail = _preferredSupportEmail(m);
    if (candidateEmail) {
      try {
        const found = await getPb().collection('users').getFirstListItem(
          `email = "${candidateEmail.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}" || googleEmail = "${candidateEmail.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`,
          { fields: 'id,displayName,name,email,googleEmail', $autoCancel: false }
        );
        if (found?.id) {
          resolvedUserId = found.id;
          try { await pbUpdateDoc('support_messages', messageId, { userId: found.id }); } catch (_) {}
        }
      } catch (_) {}
    }
  }

  const replyText = (document.getElementById('supportChatReplyText')?.value || '').trim();
  if (!replyText) { toast('Yanıt boş olamaz.', 'w'); return; }
  if (!resolvedUserId) { toast('Kullanıcı hesabı bulunamadı. Bildirim gönderilemez.', 'e'); return; }

  const btn = document.querySelector('#supportChatModalBody .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Gönderiliyor...'; }

  try {
    const latest = await getPb().collection('support_messages').getOne(messageId, { $autoCancel: false });
    const base = latest || m || {};
    const chatMsgs = _parseChatMessages(base);
    const now = new Date().toISOString();
    chatMsgs.push({ role: 'admin', text: replyText, ts: now });

    // DB güncelle
    await pbUpdateDoc('support_messages', messageId, {
      chatMessages: chatMsgs,
      status: 'replied',
      adminReply: replyText,
      repliedAt: now,
      userId: resolvedUserId,
    });

    // Local güncelle
    const idx = _supportMessages.findIndex(x => x.id === messageId);
    if (idx !== -1) {
      _supportMessages[idx] = {
        ..._supportMessages[idx],
        chatMessages: chatMsgs,
        status: 'replied',
        adminReply: replyText,
        repliedAt: now,
        userId: resolvedUserId,
      };
    }

    toast('Mesaj gönderildi!', 's');
    _renderChatModalThread(messageId);
    renderSupportMessages();
    updateSupportBadge();
  } catch (e) {
    console.error('sendSupportChatReply:', e);
    toast('Gönderim başarısız: ' + (e.message || e), 'e');
    if (btn) { btn.disabled = false; btn.textContent = 'Gönder & Bildirim'; }
  }
}

/* ──────────────────────────────────────────────
   LEGACY — Eski destek sayfası modal (mevcut modal'ı da destekle)
────────────────────────────────────────────── */
function openSupportMessage(id) { openSupportChatModal(id); }

function closeSupportModal() { _closeSupportChatModal(); }

async function deleteSupportMessage(messageId) {
  const message = _supportMessages.find(i => i.id === messageId);
  if (!message) return;
  if (!confirm(`Bu destek mesajı silinsin mi?\n${_preferredSupportName(message)} <${_preferredSupportEmail(message)}>`)) return;
  try {
    await pbDeleteDoc('support_messages', messageId);
    _removeSupportMessage(messageId);
    _closeSupportChatModal();
    renderSupportMessages();
    updateSupportBadge();
    toast('Silindi.', 's');
  } catch (e) {
    toast('Silinemedi: ' + (e.message || e), 'e');
  }
}

/* ──────────────────────────────────────────────
   KULLANICI PROFİLİ — Chat Baloncuğu
   openUserSupportChat(uid) → Destek sekmesine yönlendir
────────────────────────────────────────────── */
function openUserSupportChat(uid) {
  // Destek sayfasını aç ve kullanıcıya filtrele
  const navDestek = document.querySelector('[data-page="support"]');
  if (navDestek) navDestek.click();

  // Kullanıcıya ait ilk mesajı bul ve aç
  setTimeout(() => {
    const userMsgs = _supportMessages.filter(m => m.userId === uid);
    if (userMsgs.length > 0) {
      openSupportChatModal(userMsgs[0].id);
    } else {
      // Yeni admin_message oluştur
      _openNewAdminMessageForUser(uid);
    }
  }, 300);
}

async function _openNewAdminMessageForUser(uid) {
  const u = (typeof allUsers !== 'undefined') ? allUsers.find(x => x.uid === uid) : null;
  if (!u) { toast('Kullanıcı bulunamadı.', 'e'); return; }

  const text = prompt('Kullanıcıya gönderilecek mesaj:');
  if (!text || !text.trim()) return;

  const email = String(u.email || u.googleEmail || '').trim().toLowerCase();
  const displayName = String(u.displayName || u.name || email.split('@')[0] || 'Kullanıcı').trim();

  try {
    const rec = await pbAddDoc('support_messages', {
      userId: uid, displayName, email,
      message: text.trim(), status: 'admin_message',
      adminReply: '', repliedAt: new Date().toISOString(),
      chatMessages: [{ role: 'admin', text: text.trim(), ts: new Date().toISOString() }],
      banned: false,
    });
    await getPb().collection('notifications').create({
      recipientId: uid, senderId: 'admin', senderName: 'Qor AI Destek',
      type: 'admin_message', title: 'Qor AI Destek\'ten yeni mesaj', body: text.trim(),
      referenceId: rec.id, read: false,
    });
    toast('Mesaj gönderildi.', 's');
    await loadSupportMessages();
    openSupportChatModal(rec.id);
  } catch (e) {
    toast('Gönderilemedi: ' + (e.message || e), 'e');
  }
}