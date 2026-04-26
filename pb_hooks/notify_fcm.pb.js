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
    const body = record.get("body");
    const type = record.get("type") || "system";
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
          type: type,
          notificationId: notifId,
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

    // Skip if we already sent a notification for this support message
    try {
      $app.findFirstRecordByData('notifications', 'referenceId', record.id);
      return;
    } catch (_) {}

    const notifCol = $app.findCollectionByNameOrId('notifications');
    const notif = new Record(notifCol);
    notif.set('recipientId', userId);
    notif.set('senderId', 'admin');
    notif.set('senderName', 'Qor AI Destek');
    notif.set('type', 'system');
    notif.set('title', 'Mesajınıza yanıt geldi');
    notif.set('body', adminReply.length > 200 ? adminReply.substring(0, 197) + '...' : adminReply);
    notif.set('referenceId', record.id);
    notif.set('read', false);
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

    const collection = $app.findCollectionByNameOrId('support_messages');
    const record = new Record(collection);
    record.set('userId', userId);
    record.set('displayName', displayName);
    record.set('email', email);
    record.set('message', message);
    record.set('status', 'open');
    record.set('adminReply', '');
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

// ── FCM access token auto-refresh (every 50 minutes) ─────────────────────────
// Stores refresh_token in app_config under key 'google_refresh_token'.
// Uses Firebase CLI OAuth2 client to get a new access_token via Google.
cronAdd('fcm-token-refresh', '*/50 * * * *', function () {
  try {
    let refreshToken = '';
    try {
      const cfg = $app.findFirstRecordByData('app_config', 'key', 'google_refresh_token');
      refreshToken = (cfg.getString('value') || '').replace(/^"|"$/g, '');
    } catch (_) {}

    if (!refreshToken) {
      console.log('[fcm-cron] No google_refresh_token in app_config, skipping');
      return;
    }

    const body =
      'grant_type=refresh_token' +
      '&client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com' +
      '&client_secret=j9iVZfS8kkCEFUPaAeJV0sAi' +
      '&refresh_token=' + encodeURIComponent(refreshToken);

    const resp = $http.send({
      method: 'POST',
      url: 'https://oauth2.googleapis.com/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body,
      timeout: 15,
    });

    if (resp.statusCode !== 200) {
      console.log('[fcm-cron] Token refresh failed', resp.statusCode, resp.raw);
      return;
    }

    const result = JSON.parse(resp.raw);
    const newToken = result.access_token;
    if (!newToken) { console.log('[fcm-cron] No access_token in response'); return; }

    // Update app_config.fcm_access_token
    try {
      const tokenCfg = $app.findFirstRecordByData('app_config', 'key', 'fcm_access_token');
      tokenCfg.set('value', newToken);
      $app.save(tokenCfg);
    } catch (_) {
      const col = $app.findCollectionByNameOrId('app_config');
      const rec = new Record(col);
      rec.set('key', 'fcm_access_token');
      rec.set('value', newToken);
      $app.save(rec);
    }

    console.log('[fcm-cron] FCM access token refreshed successfully');
  } catch (err) {
    console.log('[fcm-cron] Error:', err);
  }
});
