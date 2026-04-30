/**
 * Qor AI Admin - Contact Us inbox
 * Realtime support threads with admin replies and push notification records.
 */

let _supportMessages = [];
let _supportSubscriptionReady = false;
const _supportAccountProfiles = new Map();

function _supportText(value) { return String(value || '').trim(); }
function _supportEmail(value) { return _supportText(value).toLowerCase(); }

function _supportEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtml(value) {
  return _supportEscape(value);
}

function _supportNormalizeAccount(record) {
  const email = _supportEmail(record?.email || record?.googleEmail);
  const displayName = _supportText(record?.displayName || record?.name);
  return {
    displayName: displayName || (email.includes('@') ? email.split('@')[0] : ''),
    email,
    language: _supportText(record?.language || record?.locale || 'en').toLowerCase(),
  };
}

function _supportPreferredName(message) {
  return _supportText(message?.accountDisplayName || message?.displayName) || 'Unnamed';
}

function _supportPreferredEmail(message) {
  return _supportEmail(message?.accountEmail || message?.email);
}

function _supportPreferredLanguage(message) {
  return _supportText(message?.accountLanguage || message?.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

function _supportHasSeparateSubmittedIdentity(message) {
  const accountName = _supportText(message?.accountDisplayName);
  const accountEmail = _supportEmail(message?.accountEmail);
  if (!accountName && !accountEmail) return false;
  return accountName !== _supportText(message?.displayName) || accountEmail !== _supportEmail(message?.email);
}

function _supportIdentityCaption(message) {
  if (!_supportHasSeparateSubmittedIdentity(message)) return '';
  const name = _supportText(message?.displayName) || 'Unnamed';
  const email = _supportEmail(message?.email);
  return `<div style="font-size:11px;color:var(--text3);margin-top:6px">Submitted as: ${_supportEscape(name)}${email ? ` &lt;${_supportEscape(email)}&gt;` : ''}</div>`;
}

function _supportApplyAccount(message) {
  const userId = _supportText(message?.userId);
  if (!userId || !_supportAccountProfiles.has(userId)) return { ...message };
  const account = _supportAccountProfiles.get(userId);
  if (!account) return { ...message };
  return {
    ...message,
    accountDisplayName: account.displayName,
    accountEmail: account.email,
    accountLanguage: account.language,
  };
}

async function _supportEnsureAccountProfile(userId) {
  const id = _supportText(userId);
  if (!id || _supportAccountProfiles.has(id)) return;
  try {
    const record = await getPb().collection('users').getOne(id, {
      fields: 'id,displayName,name,email,googleEmail,language,locale',
      $autoCancel: false,
    });
    _supportAccountProfiles.set(id, _supportNormalizeAccount(record));
  } catch (_) {
    _supportAccountProfiles.set(id, null);
  }
}

async function _supportHydrateMessages(messages) {
  const items = Array.isArray(messages) ? messages : [];
  const userIds = [...new Set(items.map((item) => _supportText(item.userId)).filter(Boolean))];
  await Promise.all(userIds.map((userId) => _supportEnsureAccountProfile(userId)));
  _supportMessages = _supportSortMessages(items.map((item) => _supportApplyAccount(item)));
}

function _supportSortMessages(items) {
  return [...items].sort((a, b) => _supportLastActivityAt(b) - _supportLastActivityAt(a));
}

function _supportUpsertMessage(record) {
  const next = _supportMessages.filter((item) => item.id !== record.id);
  next.push(record);
  _supportMessages = _supportSortMessages(next);
}

function _supportRemoveMessage(id) {
  _supportMessages = _supportMessages.filter((item) => item.id !== id);
}

function _supportParseChatMessages(message) {
  let raw = message?.chatMessages;
  if (typeof raw === 'string' && raw) {
    try { raw = JSON.parse(raw); } catch (_) { raw = []; }
  }
  if (!Array.isArray(raw) && raw != null) {
    try { raw = JSON.parse(String(raw)); } catch (_) { raw = []; }
  }
  if (Array.isArray(raw) && raw.length) return raw;

  const fallback = [];
  const text = _supportText(message?.message);
  const reply = _supportText(message?.adminReply);
  if (text) fallback.push({ role: message?.status === 'admin_message' ? 'admin' : 'user', text, ts: message?.created || '' });
  if (reply) fallback.push({ role: 'admin', text: reply, ts: message?.repliedAt || message?.updated || message?.created || '' });
  return fallback;
}

function _supportLastActivityAt(message) {
  const chat = _supportParseChatMessages(message || {});
  const last = chat[chat.length - 1];
  return Date.parse(last?.ts || message?.repliedAt || message?.updated || message?.created || '') || 0;
}

function _supportIsClosed(message) { return message?.banned === true; }

function _supportNeedsAdminReply(message) {
  if (_supportIsClosed(message)) return false;
  const chat = _supportParseChatMessages(message || {});
  if (!chat.length) return true;
  return chat[chat.length - 1]?.role !== 'admin';
}

function _supportStatusBadge(message) {
  if (_supportIsClosed(message)) return '<span class="badge" style="background:rgba(239,68,68,.15);color:#ef4444;font-size:10px">Closed</span>';
  if (_supportNeedsAdminReply(message)) return '<span class="badge" style="background:rgba(245,158,11,.15);color:#f59e0b;font-size:10px">Needs reply</span>';
  return '<span class="badge" style="background:rgba(34,197,94,.15);color:#22c55e;font-size:10px">Admin replied</span>';
}

async function loadSupportMessages() {
  const list = document.getElementById('supportMessagesList');
  if (list) list.innerHTML = '<div class="placeholder">Loading...</div>';
  try {
    const records = await pbGetList('support_messages', 1, 300, { sort: '-created' });
    await _supportHydrateMessages(records.items || records);
    renderSupportMessages();
    updateSupportBadge();
  } catch (error) {
    console.error('loadSupportMessages:', error);
    if (list) list.innerHTML = '<div class="placeholder">Could not load messages.</div>';
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
        _supportRemoveMessage(record.id);
        const modalId = document.getElementById('supportChatModal')?.dataset?.messageId;
        if (modalId === record.id) _closeSupportChatModal();
      } else {
        await _supportEnsureAccountProfile(record.userId);
        const existing = _supportMessages.find((item) => item.id === record.id);
        const hydrated = _supportApplyAccount(record);
        _supportUpsertMessage(hydrated);
        if (event.action === 'create' && !existing) {
          toast(`New Contact Us message: ${_supportPreferredName(hydrated)}`, 'i');
        }
        const modalId = document.getElementById('supportChatModal')?.dataset?.messageId;
        if (modalId === record.id) _renderChatModalThread(record.id);
      }

      renderSupportMessages();
      updateSupportBadge();
    });
    _supportSubscriptionReady = true;
  } catch (error) {
    console.error('support subscribe:', error);
  }
}

async function disposeSupportInbox() {
  if (!_supportSubscriptionReady) return;
  try { await getPb().collection('support_messages').unsubscribe('*'); } catch (_) {}
  _supportSubscriptionReady = false;
}

function updateSupportBadge() {
  const openCount = _supportMessages.filter(_supportNeedsAdminReply).length;
  const badge = document.getElementById('supportBadge');
  const count = document.getElementById('supportCount');
  if (badge) {
    badge.textContent = openCount;
    badge.style.display = openCount > 0 ? 'inline-block' : 'none';
  }
  if (count) count.textContent = _supportMessages.length;
}

function renderSupportMessages() {
  const list = document.getElementById('supportMessagesList');
  if (!list) return;

  const filterValue = _supportText(document.getElementById('supportStatusFilter')?.value);
  let messages = [..._supportMessages];
  if (filterValue === 'open') messages = messages.filter(_supportNeedsAdminReply);
  if (filterValue === 'replied') messages = messages.filter((message) => !_supportIsClosed(message) && !_supportNeedsAdminReply(message));
  if (filterValue === 'closed') messages = messages.filter(_supportIsClosed);

  if (!messages.length) {
    list.innerHTML = '<div class="placeholder">No messages found.</div>';
    return;
  }

  list.innerHTML = messages.map((message) => {
    const chatMessages = _supportParseChatMessages(message);
    const lastMessage = chatMessages[chatMessages.length - 1];
    const name = _supportPreferredName(message);
    const email = _supportPreferredEmail(message);
    const source = lastMessage?.text || message.message || '';
    const preview = source.substring(0, 120) + (source.length > 120 ? '...' : '');
    const lastDate = _supportLastActivityAt(message);
    const dateText = lastDate ? new Date(lastDate).toLocaleString('en-US') : '-';
    const initial = (name || email || '?').charAt(0).toUpperCase();

    return `<div style="border-radius:10px;background:var(--surface-2);border:1px solid var(--border);margin-bottom:10px;overflow:hidden;cursor:pointer" onclick="openSupportChatModal('${message.id}')" onmouseover="this.style.background='var(--surface-3)'" onmouseout="this.style.background='var(--surface-2)'">
      <div style="padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">${_supportEscape(initial)}</div>
          <div style="min-width:0">
            <div style="font-weight:700;font-size:14px;color:var(--text)">${_supportEscape(name)}</div>
            <div style="font-size:11px;color:var(--text3)">${_supportEscape(email || 'No email')}${message.userId ? ` · ID: ${_supportEscape(message.userId)}` : ''}</div>
            ${_supportIdentityCaption(message)}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${_supportStatusBadge(message)}
          <span style="font-size:11px;color:var(--text3)">${chatMessages.length} messages · ${dateText}</span>
        </div>
      </div>
      <div style="padding:0 16px 14px;color:var(--text2);font-size:12px;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_supportEscape(preview || 'No message')}</div>
    </div>`;
  }).join('');
}

async function deleteRepliedSupportMessages() {
  const replied = _supportMessages.filter((message) => !_supportIsClosed(message) && !_supportNeedsAdminReply(message));
  if (!replied.length) { toast('No replied messages to delete.', 'w'); return; }

  if (!confirm(`Delete ${replied.length} replied Contact Us messages? This cannot be undone.`)) return;

  let deleted = 0;
  let failed = 0;
  for (const message of replied) {
    try {
      await pbDeleteDoc('support_messages', message.id);
      _supportRemoveMessage(message.id);
      deleted += 1;
    } catch (_) {
      failed += 1;
    }
  }

  renderSupportMessages();
  updateSupportBadge();
  toast(failed ? `${deleted} messages deleted, ${failed} failed.` : `${deleted} replied messages deleted.`, failed ? 'w' : 's');
}

function openSupportChatModal(messageId) {
  const modal = document.getElementById('supportChatModal');
  if (!modal) return;
  modal.dataset.messageId = messageId;
  modal.style.display = 'flex';
  _renderChatModalThread(messageId);
}

function _closeSupportChatModal() {
  const modal = document.getElementById('supportChatModal');
  if (!modal) return;
  modal.style.display = 'none';
  delete modal.dataset.messageId;
}

function _renderChatModalThread(messageId) {
  const message = _supportMessages.find((item) => item.id === messageId);
  if (!message) return;

  const chatMessages = _supportParseChatMessages(message);
  const name = _supportPreferredName(message);
  const email = _supportPreferredEmail(message);
  const isClosed = _supportIsClosed(message);
  const lastIsUser = chatMessages.length > 0 && chatMessages[chatMessages.length - 1]?.role !== 'admin';

  const title = document.getElementById('supportChatModalTitle');
  if (title) title.textContent = `Conversation - ${name}`;

  const body = document.getElementById('supportChatModalBody');
  if (!body) return;

  const messagesHtml = chatMessages.length === 0
    ? '<div style="text-align:center;padding:20px;color:var(--text3)">No messages yet.</div>'
    : chatMessages.map((item) => {
        const isAdmin = item.role === 'admin';
        const timeText = item.ts ? new Date(item.ts).toLocaleString('en-US') : '';
        const align = isAdmin ? 'flex-start' : 'flex-end';
        const radius = isAdmin ? '4px 14px 14px 14px' : '14px 4px 14px 14px';
        const bg = isAdmin ? 'rgba(124,58,237,.12)' : 'rgba(59,130,246,.10)';
        const border = isAdmin ? 'rgba(124,58,237,.2)' : 'rgba(59,130,246,.2)';
        return `<div style="display:flex;flex-direction:column;align-items:${align};margin-bottom:12px">
          <div style="font-size:10px;color:var(--text3);margin-bottom:3px">${isAdmin ? 'Admin' : _supportEscape(name)}${timeText ? ` · ${timeText}` : ''}</div>
          <div style="max-width:75%;padding:10px 14px;border-radius:${radius};background:${bg};border:1px solid ${border};font-size:13px;color:var(--text);white-space:pre-wrap;line-height:1.5">${_supportEscape(item.text)}</div>
        </div>`;
      }).join('');

  body.innerHTML = `
    <div style="background:var(--bg2);border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div>
        <div style="font-weight:600;font-size:13px">${_supportEscape(name)}</div>
        <div style="font-size:11px;color:var(--text3)">${_supportEscape(email || 'No email')} · ${message.userId ? `ID: ${_supportEscape(message.userId)}` : 'No ID'}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${_supportStatusBadge(message)}
        <button class="btn btn-sm ${isClosed ? 'btn-ghost' : 'btn-danger'}" onclick="toggleSupportBan('${messageId}',${!isClosed})">${isClosed ? 'Reopen' : 'Close'}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteSupportMessage('${messageId}')">Delete</button>
      </div>
    </div>
    <div id="supportChatThread" style="max-height:320px;overflow-y:auto;margin-bottom:16px;padding:4px">${messagesHtml}</div>
    ${isClosed ? '<div style="padding:12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:8px;font-size:13px;color:#ef4444;text-align:center">This conversation is closed. The user cannot reply in this thread.</div>' : `
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:6px">${lastIsUser ? 'Reply to user' : 'Send a new message'}</label>
        <textarea class="input" id="supportChatReplyText" rows="4" placeholder="Admin reply..." style="resize:vertical;width:100%"></textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:10px;gap:8px">
          <button class="btn btn-ghost" onclick="_closeSupportChatModal()">Close</button>
          <button class="btn btn-primary" onclick="sendSupportChatReply('${messageId}','${message.userId || ''}')">Send + Notify</button>
        </div>
      </div>`}
  `;

  setTimeout(() => {
    const thread = document.getElementById('supportChatThread');
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, 50);
}

async function toggleSupportBan(messageId, ban) {
  try {
    await pbUpdateDoc('support_messages', messageId, { banned: ban });
    const index = _supportMessages.findIndex((message) => message.id === messageId);
    if (index !== -1) _supportMessages[index].banned = ban;
    _renderChatModalThread(messageId);
    renderSupportMessages();
    updateSupportBadge();
    toast(ban ? 'Conversation closed.' : 'Conversation reopened.', 's');
  } catch (error) {
    toast('Action failed: ' + (error.message || error), 'e');
  }
}

async function _supportResolveUserId(message, userId) {
  const existing = _supportText(userId || message?.userId);
  if (existing) return existing;

  const email = _supportPreferredEmail(message);
  if (!email) return '';

  try {
    const safeEmail = email.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const found = await getPb().collection('users').getFirstListItem(
      `email = "${safeEmail}" || googleEmail = "${safeEmail}"`,
      { fields: 'id,displayName,name,email,googleEmail,language,locale', $autoCancel: false }
    );
    if (found?.id) {
      await _supportEnsureAccountProfile(found.id);
      try { await pbUpdateDoc('support_messages', message.id, { userId: found.id }); } catch (_) {}
      return found.id;
    }
  } catch (_) {}

  return '';
}

async function sendSupportChatReply(messageId, userId) {
  const message = _supportMessages.find((item) => item.id === messageId);
  const replyText = _supportText(document.getElementById('supportChatReplyText')?.value);
  if (!replyText) { toast('Reply cannot be empty.', 'w'); return; }

  const resolvedUserId = await _supportResolveUserId(message, userId);
  if (!resolvedUserId) { toast('User account not found. Notification cannot be sent.', 'e'); return; }

  const button = document.querySelector('#supportChatModalBody .btn-primary');
  if (button) { button.disabled = true; button.textContent = 'Sending...'; }

  try {
    const latest = await getPb().collection('support_messages').getOne(messageId, { $autoCancel: false });
    const base = latest || message || {};
    const chatMessages = _supportParseChatMessages(base);
    const now = new Date().toISOString();
    chatMessages.push({ role: 'admin', text: replyText, ts: now });

    await pbUpdateDoc('support_messages', messageId, {
      chatMessages,
      status: 'replied',
      adminReply: replyText,
      repliedAt: now,
      userId: resolvedUserId,
      banned: false,
    });

    const index = _supportMessages.findIndex((item) => item.id === messageId);
    if (index !== -1) {
      _supportMessages[index] = _supportApplyAccount({
        ..._supportMessages[index],
        chatMessages,
        status: 'replied',
        adminReply: replyText,
        repliedAt: now,
        userId: resolvedUserId,
        banned: false,
      });
    }

    toast('Message sent.', 's');
    _renderChatModalThread(messageId);
    renderSupportMessages();
    updateSupportBadge();
  } catch (error) {
    console.error('sendSupportChatReply:', error);
    toast('Send failed: ' + (error.message || error), 'e');
    if (button) { button.disabled = false; button.textContent = 'Send + Notify'; }
  }
}

function openSupportMessage(id) { openSupportChatModal(id); }
function closeSupportModal() { _closeSupportChatModal(); }

async function deleteSupportMessage(messageId) {
  const message = _supportMessages.find((item) => item.id === messageId);
  if (!message) return;
  if (!confirm(`Delete this Contact Us message?\n${_supportPreferredName(message)} <${_supportPreferredEmail(message)}>`)) return;
  try {
    await pbDeleteDoc('support_messages', messageId);
    _supportRemoveMessage(messageId);
    _closeSupportChatModal();
    renderSupportMessages();
    updateSupportBadge();
    toast('Message deleted.', 's');
  } catch (error) {
    toast('Delete failed: ' + (error.message || error), 'e');
  }
}

function openUserSupportChat(uid) {
  const navSupport = document.querySelector('[data-view="support"]');
  if (navSupport) navSupport.click();

  setTimeout(() => {
    const userMessages = _supportMessages.filter((message) => message.userId === uid);
    if (userMessages.length) {
      openSupportChatModal(userMessages[0].id);
    } else {
      _openNewAdminMessageForUser(uid);
    }
  }, 300);
}

async function _openNewAdminMessageForUser(uid) {
  const user = (typeof allUsers !== 'undefined') ? allUsers.find((item) => item.uid === uid || item.id === uid) : null;
  if (!user) { toast('User not found.', 'e'); return; }

  const text = prompt('Message to send to this user:');
  if (!text || !text.trim()) return;

  const email = _supportEmail(user.email || user.googleEmail);
  const displayName = _supportText(user.displayName || user.name || (email ? email.split('@')[0] : 'User'));
  const language = _supportText(user.language || user.locale || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en';
  const now = new Date().toISOString();

  try {
    const record = await pbAddDoc('support_messages', {
      userId: uid,
      displayName,
      email,
      message: text.trim(),
      status: 'admin_message',
      adminReply: '',
      repliedAt: now,
      chatMessages: [{ role: 'admin', text: text.trim(), ts: now }],
      banned: false,
    });

    await getPb().collection('notifications').create({
      recipientId: uid,
      senderId: 'admin',
      senderName: 'Qor AI Support',
      type: 'transactional',
      title: language === 'tr' ? 'Qor AI Destek yeni mesaj gönderdi' : 'New message from Qor AI Support',
      body: text.trim(),
      referenceId: record.id,
      read: false,
      language,
    });

    toast('Message sent.', 's');
    await loadSupportMessages();
    openSupportChatModal(record.id);
  } catch (error) {
    toast('Send failed: ' + (error.message || error), 'e');
  }
}