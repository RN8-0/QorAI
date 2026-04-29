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
    const tA = Date.parse(a?.repliedAt || a?.created || '') || 0;
    const tB = Date.parse(b?.repliedAt || b?.created || '') || 0;
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
  if (Array.isArray(raw) && raw.length) return raw;
  // Backwards compat
  const list = [];
  const msg = _normalizeSupportText(m.message);
  const reply = _normalizeSupportText(m.adminReply);
  if (msg) list.push({ role: m.status === 'admin_message' ? 'admin' : 'user', text: msg, ts: m.created || '' });
  if (reply) list.push({ role: 'admin', text: reply, ts: m.repliedAt || m.created || '' });
  return list;
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
  const visible = _supportMessages.filter(m => m.status !== 'admin_message');
  const openCount = visible.filter(m => m.status === 'open').length;
  const badge = document.getElementById('supportBadge');
  const countEl = document.getElementById('supportCount');
  if (badge) { badge.textContent = openCount; badge.style.display = openCount > 0 ? 'inline-block' : 'none'; }
  if (countEl) countEl.textContent = visible.length;
}

/* ──────────────────────────────────────────────
   RENDER LIST — Kullanıcıya göre gruplandırılmış
────────────────────────────────────────────── */
function renderSupportMessages() {
  const el = document.getElementById('supportMessagesList');
  if (!el) return;

  const filterVal = (document.getElementById('supportStatusFilter')?.value || '').trim();

  // Tüm mesajları filtrele
  let msgs = [..._supportMessages];
  if (filterVal) msgs = msgs.filter(m => m.status === filterVal);

  if (!msgs.length) {
    el.innerHTML = '<div class="placeholder">Mesaj bulunamadı.</div>';
    return;
  }

  // Kullanıcıya göre grupla
  const groups = new Map();
  for (const m of msgs) {
    const key = m.userId || _preferredSupportEmail(m) || m.id;
    if (!groups.has(key)) groups.set(key, { userId: m.userId, name: _preferredSupportName(m), email: _preferredSupportEmail(m), messages: [] });
    groups.get(key).messages.push(m);
  }

  let html = '';
  for (const [, group] of groups) {
    const latest = group.messages[0];
    const openCount = group.messages.filter(m => m.status === 'open').length;
    const allReplied = openCount === 0;
    const banned = group.messages.some(m => m.banned);
    const dateStr = (latest.repliedAt || latest.created) ? new Date(latest.repliedAt || latest.created).toLocaleString('tr-TR') : '—';

    html += `<div style="border-radius:10px;background:var(--surface-2);border:1px solid var(--border);margin-bottom:10px;overflow:hidden">
      <!-- Grup Başlığı -->
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">${escapeHtml(group.name.charAt(0).toUpperCase())}</div>
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--text)">${escapeHtml(group.name)}</div>
            <div style="font-size:11px;color:var(--text3)">${escapeHtml(group.email)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${banned ? '<span class="badge" style="background:rgba(239,68,68,.15);color:#ef4444">🚫 Banlı</span>' : ''}
          ${openCount > 0 ? `<span class="badge" style="background:rgba(245,158,11,.15);color:#f59e0b">${openCount} Açık</span>` : '<span class="badge" style="background:rgba(34,197,94,.15);color:#22c55e">Yanıtlandı</span>'}
          <span style="font-size:11px;color:var(--text3)">${group.messages.length} mesaj · ${dateStr}</span>
        </div>
      </div>
      <!-- Konuşmalar -->
      ${group.messages.map(m => {
        const chatMsgs = _parseChatMessages(m);
        const lastMsg = chatMsgs[chatMsgs.length - 1];
        const preview = lastMsg ? lastMsg.text.substring(0, 80) + (lastMsg.text.length > 80 ? '…' : '') : (m.message || '').substring(0, 80);
        const mDate = (m.repliedAt || m.created) ? new Date(m.repliedAt || m.created).toLocaleString('tr-TR') : '—';
        const isOpen = m.status === 'open';
        const isBanned = m.banned;
        return `<div style="padding:10px 16px;cursor:pointer;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:12px" onclick="openSupportChatModal('${m.id}')" onmouseover="this.style.background='var(--surface-3)'" onmouseout="this.style.background=''">
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">💬 ${escapeHtml(preview)}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">${chatMsgs.length} mesaj · ${mDate}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
            ${isBanned ? '<span class="badge" style="background:rgba(239,68,68,.15);color:#ef4444;font-size:10px">Banlı</span>' : ''}
            <span class="badge" style="background:${isOpen ? 'rgba(245,158,11,.15)' : 'rgba(34,197,94,.15)'};color:${isOpen ? '#f59e0b' : '#22c55e'};font-size:10px">${isOpen ? 'Açık' : 'Yanıtlandı'}</span>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  el.innerHTML = html;
}

/* ──────────────────────────────────────────────
   BULK DELETE — Yanıtlanan mesajları toplu sil
────────────────────────────────────────────── */
async function deleteRepliedSupportMessages() {
  const replied = _supportMessages.filter(m => m.status === 'replied');
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
  const isBanned = m.banned || false;
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
        ${isBanned ? '<span class="badge" style="background:rgba(239,68,68,.15);color:#ef4444">🚫 Banlı</span>' : ''}
        <button class="btn btn-sm ${isBanned ? 'btn-ghost' : 'btn-danger'}" onclick="toggleSupportBan('${messageId}',${!isBanned})">${isBanned ? '🔓 Banı Kaldır' : '🚫 Banla'}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteSupportMessage('${messageId}')">Sil</button>
      </div>
    </div>
    <!-- Thread -->
    <div id="supportChatThread" style="max-height:320px;overflow-y:auto;margin-bottom:16px;padding:4px">
      ${messagesHtml}
    </div>
    ${isBanned ? `<div style="padding:12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:8px;font-size:13px;color:#ef4444;text-align:center">Bu sohbet banlı — kullanıcı yanıt gönderemiyor.</div>` : `
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
    toast(ban ? 'Sohbet banlı.' : 'Ban kaldırıldı.', 's');
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
    // Mevcut chatMessages'a admin mesajı ekle
    let chatMsgs = _parseChatMessages(m || {});
    if (chatMsgs.length === 0 && m) {
      // Eski kayıttan dönüştür
      const msg = _normalizeSupportText(m.message);
      if (msg) chatMsgs.push({ role: m.status === 'admin_message' ? 'admin' : 'user', text: msg, ts: m.created || '' });
      const reply = _normalizeSupportText(m.adminReply);
      if (reply) chatMsgs.push({ role: 'admin', text: reply, ts: m.repliedAt || m.created || '' });
    }
    chatMsgs.push({ role: 'admin', text: replyText, ts: new Date().toISOString() });

    // DB güncelle
    await pbUpdateDoc('support_messages', messageId, {
      chatMessages: JSON.stringify(chatMsgs),
      status: 'replied',
      adminReply: replyText,
      repliedAt: new Date().toISOString(),
    });

    // Bildirim oluştur → FCM push
    await getPb().collection('notifications').create({
      recipientId: resolvedUserId,
      senderId: 'admin',
      senderName: 'Qor AI Destek',
      type: 'admin_message',
      title: 'Qor AI Destek\'ten yeni mesaj',
      body: replyText,
      referenceId: messageId,
      read: false,
    });

    // Local güncelle
    const idx = _supportMessages.findIndex(x => x.id === messageId);
    if (idx !== -1) {
      _supportMessages[idx] = {
        ..._supportMessages[idx],
        chatMessages: JSON.stringify(chatMsgs),
        status: 'replied',
        adminReply: replyText,
        repliedAt: new Date().toISOString(),
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
      chatMessages: JSON.stringify([{ role: 'admin', text: text.trim(), ts: new Date().toISOString() }]),
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
