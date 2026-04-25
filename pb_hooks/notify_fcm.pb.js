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
