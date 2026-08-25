/// pb_hooks/notify_fcm.pb.js
/// PocketBase hook: when a notifications record is created, send FCM push
/// notification to the recipient's device via Firebase Cloud Messaging v1 API.
///
/// Requires:
/// - users collection has fcmToken (text) field
/// - app_config collection has 'fcm_access_token' record (refreshed by cron)
/// - app_config collection has 'fcm_project_id' record (set once)

onRecordAfterCreateSuccess(function (e) {
  try {
    const record = e.record;
    if (!record) return;

    const recipientId = record.get("recipientId");
    const title = record.get("title");
    const body = record.get("body") || "";
    const type = record.get("type") || "transactional";
    const language = record.get("language") || "";
    const referenceId = record.get("referenceId") || "";
    const notifId = record.id;

    if (!recipientId || !title) return;

    // Get recipient's FCM token
    let user;
    try {
      user = $app.findRecordById("users", recipientId);
    } catch (err) {
      return;
    }

    const fcmToken = user.getString("fcmToken");
    if (!fcmToken) {
      return; // User hasn't logged in with the latest app version yet
    }

    // Get stored FCM access token from app_config
    let accessToken = "";
    let projectId = "qorai-99b6e";
    try {
      const tokenCfg = $app.findFirstRecordByData("app_config", "key", "fcm_access_token");
      accessToken = (tokenCfg.getString("value") || "").replace(/^"|"$/g, "");
    } catch (err) {
      console.log("[notify_fcm] No fcm_access_token in app_config:", err);
      return;
    }
    try {
      const projCfg = $app.findFirstRecordByData("app_config", "key", "fcm_project_id");
      projectId = (projCfg.getString("value") || "").replace(/^"|"$/g, "") || projectId;
    } catch (_) {}

    if (!accessToken) {
      console.log("[notify_fcm] Empty access token, skipping FCM");
      return;
    }

    // Build FCM v1 message
    const message = {
      message: {
        token: fcmToken,
        notification: {
          title: title,
          body: body,
        },
        data: {
          type: String(type),
          notificationId: String(notifId),
          referenceId: String(referenceId),
          language: String(language),
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
        android: {
          priority: "HIGH",
          notification: {
            channelId: "qor_ai_default",
            notificationPriority: "PRIORITY_HIGH",
            defaultSound: true,
            defaultVibrateTimings: true,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      },
    };

    // Send FCM v1 HTTP request
    const resp = $http.send({
      method: "POST",
      url: "https://fcm.googleapis.com/v1/projects/" + projectId + "/messages:send",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
      timeout: 10,
    });

    if (resp.statusCode === 200 || resp.statusCode === 201) {
      console.log("[notify_fcm] Sent to", recipientId, "- OK");
    } else {
      console.log("[notify_fcm] FCM error " + resp.statusCode + ":", resp.raw);
      const raw = String(resp.raw || "");
      if (raw.indexOf("UNREGISTERED") !== -1 || raw.indexOf("INVALID_ARGUMENT") !== -1 || raw.indexOf("NOT_FOUND") !== -1) {
        try {
          user.set("fcmToken", "");
          user.set("fcmTokenUpdatedAt", "");
          $app.save(user);
          console.log("[notify_fcm] Cleared invalid FCM token for", recipientId);
        } catch (clearErr) {
          console.log("[notify_fcm] Failed to clear invalid token:", clearErr);
        }
      }
    }
  } catch (e) {
    console.log("[notify_fcm] Fatal error:", e);
  }
}, "notifications");

// When admin sets adminReply on a support_messages record, create a notifications
// record for the user — this automatically triggers the FCM hook above.
onRecordAfterUpdateSuccess(function (e) {
  try {
    const record = e.record;
    if (!record) return;

    const status = record.getString('status');
    if (status !== 'replied' && status !== 'admin_message') return;

    const adminReply = record.getString('adminReply');
    if (!adminReply) return;

    const userId = record.getString('userId');
    if (!userId) return;

    const isAdminMessage = status === 'admin_message';
    const notifType = 'transactional';
    const notifBody = adminReply.length > 200 ? adminReply.substring(0, 197) + '...' : adminReply;
    let language = 'en';
    try {
      const user = $app.findRecordById('users', userId);
      const rawLang = String(user.get('language') || user.get('locale') || '').toLowerCase();
      language = rawLang.indexOf('tr') === 0 ? 'tr' : 'en';
    } catch (_) {}
    const notifTitle = language === 'tr'
      ? (isAdminMessage ? 'Qor AI Destek yeni mesaj gönderdi' : 'Qor AI Destek mesajınızı yanıtladı')
      : (isAdminMessage ? 'New message from Qor AI Support' : 'Qor AI Support replied to your message');

    // PocketBase hands a json field to the JSVM as `types.JSONRaw` — a Go
    // []byte — and Goja reports every Go slice as an array. So the old
    // `Array.isArray(value) return value` branch was TRUE for the raw bytes and
    // returned [123,34,114,...] as if it were the parsed thread. In the router
    // below that byte array then got an object pushed onto it and handed back to
    // `set()`, which answered `chatMessages: Must be a valid json value` — every
    // follow-up message from a user died there with a 500. Decode by hand: the
    // JSVM has no TextDecoder, and String.fromCharCode per byte mangles Turkish
    // (ı = 0xC4 0xB1). Same trap, same fix as pb_hooks/typesense_lib.js.
    // Defined inside the handler because PocketBase runs each one in an
    // isolated scope — top-level helpers are not visible here.
    const looksLikeBytes = (arr) => {
      if (!arr.length) return false;
      for (let i = 0; i < arr.length && i < 32; i++) {
        const v = arr[i];
        if (typeof v !== 'number' || v < 0 || v > 255 || (v | 0) !== v) return false;
      }
      return true;
    };
    const bytesToUtf8 = (arr) => {
      let s = '';
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i] & 0xFF;
        if (c < 0x80) {
          s += String.fromCharCode(c);
        } else if (c >= 0xC0 && c < 0xE0) {
          s += String.fromCharCode(((c & 0x1F) << 6) | (arr[++i] & 0x3F));
        } else if (c >= 0xE0 && c < 0xF0) {
          const b2 = arr[++i] & 0x3F, b3 = arr[++i] & 0x3F;
          s += String.fromCharCode(((c & 0x0F) << 12) | (b2 << 6) | b3);
        } else if (c >= 0xF0) {
          const d2 = arr[++i] & 0x3F, d3 = arr[++i] & 0x3F, d4 = arr[++i] & 0x3F;
          const cp = (((c & 0x07) << 18) | (d2 << 12) | (d3 << 6) | d4) - 0x10000;
          s += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
        }
      }
      return s;
    };
    const parseChatMessages = (value) => {
      try {
        if (value == null) return [];
        if (Array.isArray(value)) {
          if (!looksLikeBytes(value)) {
            // A genuine thread array. Copy it out of whatever backing store it
            // came from so a later push() cannot hit a typed Go slice.
            const out = [];
            for (let i = 0; i < value.length; i++) out.push(value[i]);
            return out;
          }
          const decoded = JSON.parse(bytesToUtf8(value));
          return Array.isArray(decoded) ? decoded : [];
        }
        if (typeof value === 'string') {
          if (!value.trim()) return [];
          const decoded = JSON.parse(value);
          return Array.isArray(decoded) ? decoded : [];
        }
        const decoded = JSON.parse(String(value));
        return Array.isArray(decoded) ? decoded : [];
      } catch (_) {}
      return [];
    };
    const lastAdminMessage = (rec) => {
      if (!rec) return null;
      const chat = parseChatMessages(rec.get('chatMessages'));
      for (let i = chat.length - 1; i >= 0; i--) {
        const item = chat[i] || {};
        if (String(item.role || '').toLowerCase() === 'admin') return item;
      }
      const fallbackText = rec.getString('adminReply');
      if (!fallbackText) return null;
      return { role: 'admin', text: fallbackText, ts: rec.getString('repliedAt') || rec.getString('updated') || '' };
    };
    const currentAdmin = lastAdminMessage(record);
    const previousAdmin = lastAdminMessage(e.originalRecord);
    if (previousAdmin && currentAdmin) {
      const currentKey = String(currentAdmin.text || '') + '|' + String(currentAdmin.ts || '');
      const previousKey = String(previousAdmin.text || '') + '|' + String(previousAdmin.ts || '');
      if (currentKey === previousKey) return;
    }

    const notifCol = $app.findCollectionByNameOrId('notifications');
    const notif = new Record(notifCol);
    notif.set('recipientId', userId);
    notif.set('senderId', 'admin');
    notif.set('senderName', 'Qor AI Support');
    notif.set('type', notifType);
    notif.set('title', notifTitle);
    notif.set('body', notifBody);
    notif.set('referenceId', record.id);
    notif.set('read', false);
    try { notif.set('language', language); } catch (_) {}
    $app.save(notif);

    console.log('[notify_fcm] Support reply notification created for user', userId);
  } catch (err) {
    console.log('[notify_fcm] Support reply hook error:', err);
  }
}, 'support_messages');

routerAdd('POST', '/api/support/contact', (e) => {
  try {
    const bodyModel = new DynamicModel({
      userId: '',
      displayName: '',
      email: '',
      message: '',
    });

    let bindErr = null;
    try { e.bindBody(bodyModel); } catch (err) { bindErr = String(err); }

    let requestBody = null;
    try { requestBody = e.requestInfo().body; } catch (_) {}

    const authRecord = e.auth;
    const normalize = (value) => String(value || '').trim();
    const inputUserId = normalize(bodyModel.userId || requestBody?.userId);
    const userId = normalize(authRecord?.id || inputUserId);
    const displayName = normalize(bodyModel.displayName || requestBody?.displayName);
    const email = normalize(bodyModel.email || requestBody?.email).toLowerCase();
    const message = normalize(bodyModel.message || requestBody?.message);
    const now = new Date().toISOString();

    // PocketBase hands a json field to the JSVM as `types.JSONRaw` — a Go
    // []byte — and Goja reports every Go slice as an array. So the old
    // `Array.isArray(value) return value` branch was TRUE for the raw bytes and
    // returned [123,34,114,...] as if it were the parsed thread. In the router
    // below that byte array then got an object pushed onto it and handed back to
    // `set()`, which answered `chatMessages: Must be a valid json value` — every
    // follow-up message from a user died there with a 500. Decode by hand: the
    // JSVM has no TextDecoder, and String.fromCharCode per byte mangles Turkish
    // (ı = 0xC4 0xB1). Same trap, same fix as pb_hooks/typesense_lib.js.
    // Defined inside the handler because PocketBase runs each one in an
    // isolated scope — top-level helpers are not visible here.
    const looksLikeBytes = (arr) => {
      if (!arr.length) return false;
      for (let i = 0; i < arr.length && i < 32; i++) {
        const v = arr[i];
        if (typeof v !== 'number' || v < 0 || v > 255 || (v | 0) !== v) return false;
      }
      return true;
    };
    const bytesToUtf8 = (arr) => {
      let s = '';
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i] & 0xFF;
        if (c < 0x80) {
          s += String.fromCharCode(c);
        } else if (c >= 0xC0 && c < 0xE0) {
          s += String.fromCharCode(((c & 0x1F) << 6) | (arr[++i] & 0x3F));
        } else if (c >= 0xE0 && c < 0xF0) {
          const b2 = arr[++i] & 0x3F, b3 = arr[++i] & 0x3F;
          s += String.fromCharCode(((c & 0x0F) << 12) | (b2 << 6) | b3);
        } else if (c >= 0xF0) {
          const d2 = arr[++i] & 0x3F, d3 = arr[++i] & 0x3F, d4 = arr[++i] & 0x3F;
          const cp = (((c & 0x07) << 18) | (d2 << 12) | (d3 << 6) | d4) - 0x10000;
          s += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
        }
      }
      return s;
    };
    const parseChatMessages = (value) => {
      try {
        if (value == null) return [];
        if (Array.isArray(value)) {
          if (!looksLikeBytes(value)) {
            // A genuine thread array. Copy it out of whatever backing store it
            // came from so a later push() cannot hit a typed Go slice.
            const out = [];
            for (let i = 0; i < value.length; i++) out.push(value[i]);
            return out;
          }
          const decoded = JSON.parse(bytesToUtf8(value));
          return Array.isArray(decoded) ? decoded : [];
        }
        if (typeof value === 'string') {
          if (!value.trim()) return [];
          const decoded = JSON.parse(value);
          return Array.isArray(decoded) ? decoded : [];
        }
        const decoded = JSON.parse(String(value));
        return Array.isArray(decoded) ? decoded : [];
      } catch (_) {}
      return [];
    };

    if (!displayName || !email || !message) {
      return e.json(400, {
        error: 'missing_fields',
        message: 'displayName, email and message are required.',
        bindErr: bindErr,
      });
    }

    if (email.indexOf('@') === -1) {
      return e.json(400, {
        error: 'invalid_email',
        message: 'A valid email address is required.',
      });
    }

    let record = null;
    const findActiveByFilter = (filter, params) => {
      try {
        return $app.findFirstRecordByFilter('support_messages', filter, params);
      } catch (_) {
        return null;
      }
    };

    if (userId) {
      record = findActiveByFilter(
        'userId = {:userId} && banned = false',
        { userId: userId },
      );
    }
    if (!record && email) {
      record = findActiveByFilter(
        'email = {:email} && banned = false',
        { email: email },
      );
    }

    if (record) {
      const chat = parseChatMessages(record.get('chatMessages'));
      if (chat.length === 0) {
        const existingMessage = normalize(record.getString('message'));
        const existingReply = normalize(record.getString('adminReply'));
        if (existingMessage) {
          chat.push({ role: 'user', text: existingMessage, ts: record.getString('created') || now });
        }
        if (existingReply) {
          chat.push({ role: 'admin', text: existingReply, ts: record.getString('repliedAt') || now });
        }
      }
      chat.push({ role: 'user', text: message, ts: now });
      record.set('userId', userId || record.getString('userId'));
      record.set('displayName', displayName);
      record.set('email', email);
      record.set('message', message);
      record.set('status', 'open');
      record.set('chatMessages', chat);
      record.set('repliedAt', now);
      $app.save(record);

      return e.json(200, {
        success: true,
        id: record.id,
        status: 'open',
        reused: true,
      });
    }

    const collection = $app.findCollectionByNameOrId('support_messages');
    record = new Record(collection);
    record.set('userId', userId);
    record.set('displayName', displayName);
    record.set('email', email);
    record.set('message', message);
    record.set('status', 'open');
    record.set('adminReply', '');
    record.set('chatMessages', [{ role: 'user', text: message, ts: now }]);
    $app.save(record);

    return e.json(200, {
      success: true,
      id: record.id,
      status: 'open',
    });
  } catch (err) {
    return e.json(500, {
      error: 'support_contact_failed',
      detail: String(err),
    });
  }
});

// ── FCM access token refresh ─────────────────────────────────────────────────
// REMOVED (2026-06-07): this used a leaked OAuth refresh_token + a hard-coded
// client_secret to mint the FCM access token. The token is now minted on the
// host by /root/refresh-fcm-token.sh (system cron, every 50 min) using the
// qorai-99b6e Firebase service account key — no refresh_token / client_secret
// in app_config or this file. The send handler above just reads
// app_config.fcm_access_token, which that cron keeps fresh.
