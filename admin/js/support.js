/**
 * Qor AI Admin — Support Messages
 * Destek mesajlarını yükler, listeler ve yanıtlar.
 * Yanıt gönderince notifications koleksiyonuna kayıt oluşturur
 * → pb_hook (notify_fcm.pb.js) FCM push gönderir.
 */

let _supportMessages = [];

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
    _supportMessages = records.items || records;
    renderSupportMessages();
    updateSupportBadge();
  } catch (e) {
    console.error('loadSupportMessages:', e);
    if (el) el.innerHTML = '<div class="placeholder">Yüklenemedi. Koleksiyon mevcut değil olabilir.</div>';
  }
}

/* ──────────────────────────────────────────────
   BADGE (sidebar unread count)
────────────────────────────────────────────── */
function updateSupportBadge() {
  const openCount = _supportMessages.filter(m => m.status === 'open').length;
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
  if (countEl) countEl.textContent = _supportMessages.length;
}

/* ──────────────────────────────────────────────
   RENDER LIST
────────────────────────────────────────────── */
function renderSupportMessages() {
  const el = document.getElementById('supportMessagesList');
  if (!el) return;

  const filter = (document.getElementById('supportStatusFilter')?.value || '').trim();
  let msgs = _supportMessages;
  if (filter) msgs = msgs.filter(m => m.status === filter);

  if (!msgs.length) {
    el.innerHTML = '<div class="placeholder">Mesaj bulunamadı.</div>';
    return;
  }

  el.innerHTML = msgs.map(m => {
    const isOpen = m.status === 'open';
    const date = m.created ? new Date(m.created).toLocaleString('tr-TR') : '—';
    return `
    <div class="activity-log-item" style="cursor:pointer;border-left:3px solid ${isOpen ? 'var(--amber)' : 'var(--green,#22c55e)'};padding:12px 16px;margin-bottom:8px;border-radius:6px;background:var(--surface-2)" onclick="openSupportMessage('${m.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px;color:var(--text)">${escapeHtml(m.displayName || 'İsimsiz')} <span style="font-size:12px;font-weight:400;color:var(--text2)">&lt;${escapeHtml(m.email || '')}&gt;</span></div>
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

  const date = m.created ? new Date(m.created).toLocaleString('tr-TR') : '—';
  const repliedAt = m.repliedAt ? new Date(m.repliedAt).toLocaleString('tr-TR') : null;

  document.getElementById('supportModalTitle').textContent = `Mesaj — ${m.displayName || 'İsimsiz'}`;
  document.getElementById('supportModalBody').innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-size:12px;color:var(--text3);margin-bottom:4px">Gönderen</div>
      <div style="font-weight:600">${escapeHtml(m.displayName || 'İsimsiz')}</div>
      <div style="font-size:13px;color:var(--text2)">${escapeHtml(m.email || '')}</div>
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
        <button class="btn btn-ghost" onclick="closeSupportModal()">İptal</button>
        <button class="btn btn-primary" onclick="sendSupportReply('${m.id}','${m.userId || ''}')">
          Yanıtla &amp; Bildirim Gönder
        </button>
      </div>
    </div>` : `
    <div style="display:flex;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeSupportModal()">Kapat</button>
    </div>`}
  `;

  document.getElementById('supportModal').style.display = 'flex';
}

function closeSupportModal() {
  document.getElementById('supportModal').style.display = 'none';
}

/* ──────────────────────────────────────────────
   SEND REPLY
────────────────────────────────────────────── */
async function sendSupportReply(messageId, userId) {
  const replyText = (document.getElementById('supportReplyText')?.value || '').trim();
  if (!replyText) {
    toast('Yanıt metni boş olamaz.', 'w');
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
    if (userId) {
      const pb = getPb();
      await pb.collection('notifications').create({
        recipientId: userId,
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
    }
    renderSupportMessages();
    updateSupportBadge();
  } catch (e) {
    console.error('sendSupportReply:', e);
    toast('Yanıt gönderilemedi: ' + (e.message || e), 'e');
    if (btn) { btn.disabled = false; btn.textContent = 'Yanıtla & Bildirim Gönder'; }
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
