/// <reference path="../pb_data/types.d.ts" />
// PocketBase JS hooks: Account deletion via email confirmation
// ─────────────────────────────────────────────────────────────
// Flow:
//   1. App/site call POST /api/users/request-delete (authenticated)
//      → generates a signed token, sends confirmation email
//   2. User clicks link in email: GET /api/users/confirm-delete?id=...&ts=...&sig=...
//      → validates token, deletes all user data, returns success page
//
// CRITICAL — PocketBase JSVM isolation: every routerAdd callback runs in its OWN
// isolated runtime, so FILE-LEVEL `const`/`function` declarations are NOT visible
// inside the callback (they throw "X is not defined"). That is exactly why
// deletion failed: `_getDeletionSecret()` / `PB_URL` etc. were file-level → the
// handler threw before sending → 500 → "Silme işlemi başlatılamadı". Everything
// the callbacks need is therefore declared INSIDE each callback.

// POST /api/users/request-delete — requires user auth
routerAdd('POST', '/api/users/request-delete', (e) => {
  try {
    const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';
    const FROM_NAME = 'Qor AI';
    // Send FROM the configured mail sender (proven working = contact@arain.digital,
    // the SMTP auth mailbox). Hardcoding noreply@qorai.net made Hostinger reject
    // the message. Fall back to the known-good address, never to noreply@.
    let senderName = FROM_NAME;
    let senderAddress = 'contact@arain.digital';
    try {
      const meta = $app.settings().meta;
      if (meta && meta.senderAddress) {
        senderAddress = meta.senderAddress;
        senderName = meta.senderName || FROM_NAME;
      }
    } catch (_) { /* keep the known-good fallback */ }

    const secret = $os.getenv('DELETION_SIGNING_SECRET')
      || $os.getenv('POCKETBASE_ADMIN_EMAIL')
      || 'qorai_delete_secret';

    const user = e.auth;
    if (!user) return e.json(401, { error: 'auth_required' });

    const email = String(user.get('email') || '').trim();
    if (!email) return e.json(400, { error: 'no_email', message: 'No email address on account.' });

    const ts = Math.floor(Date.now() / 1000);
    const data = user.id + '_' + ts;
    const sig = $security.hs256(data, secret);
    const confirmUrl =
      `${PB_URL}/api/users/confirm-delete?id=${encodeURIComponent(user.id)}&ts=${ts}&sig=${encodeURIComponent(sig)}`;

    const displayName = String(user.get('displayName') || user.get('name') || email.split('@')[0]);

    // Plain-text alternative. HTML-only transactional mail is a strong spam
    // signal (Gmail/Outlook penalise it), so we always ship a multipart
    // text+HTML message to improve inbox placement.
    const textBody =
      'Qor AI - Account deletion request\n\n' +
      'Hi ' + displayName + ',\n\n' +
      'We received a request to permanently delete your Qor AI account. ' +
      'If you did not request this, you can safely ignore this email - your account stays active.\n\n' +
      'WARNING: this action is permanent and cannot be undone.\n\n' +
      'To confirm deletion, open this link (valid for 24 hours):\n' +
      confirmUrl + '\n\n' +
      'Qor AI - qorai.net';

    const message = new MailerMessage({
      from: { name: senderName, address: senderAddress },
      to: [{ address: email }],
      subject: 'Confirm your Qor AI account deletion',
      text: textBody,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#0f0f0f;color:#f5f5f5;margin:0;padding:0">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:40px auto;background:#1a1a1a;border-radius:16px;overflow:hidden;border:1px solid #2a2a2a">
    <tr>
      <td style="background:linear-gradient(135deg,#00e5ff22,#1565c022);padding:32px 32px 24px;border-bottom:1px solid #2a2a2a;text-align:center">
        <div style="font-size:24px;font-weight:800;color:#f5f5f5">Qor AI</div>
        <div style="font-size:13px;color:#888;margin-top:4px">Account Deletion Request</div>
      </td>
    </tr>
    <tr>
      <td style="padding:32px">
        <p style="margin:0 0 16px;color:#ccc">Hi <strong style="color:#f5f5f5">${displayName}</strong>,</p>
        <p style="margin:0 0 20px;color:#ccc;line-height:1.6">
          We received a request to permanently delete your Qor AI account.
          If you did not request this, you can safely ignore this email — your account remains active.
        </p>
        <div style="background:#ef444422;border:1px solid #ef444440;border-radius:12px;padding:16px;margin:0 0 24px">
          <p style="margin:0;color:#ef4444;font-weight:600;font-size:14px">⚠️ This action is permanent and cannot be undone.</p>
          <p style="margin:8px 0 0;color:#fca5a5;font-size:13px">All your data, comparisons, reviews and account information will be deleted forever.</p>
        </div>
        <div style="text-align:center;margin:0 0 24px">
          <a href="${confirmUrl}" style="display:inline-block;background:#ef4444;color:#fff;font-weight:700;font-size:16px;padding:16px 40px;border-radius:12px;text-decoration:none">
            Delete My Account
          </a>
        </div>
        <p style="margin:0;color:#666;font-size:12px;text-align:center">
          This link expires in 24 hours.<br>
          If the button does not work, copy and paste this URL:<br>
          <span style="color:#888;word-break:break-all">${confirmUrl}</span>
        </p>
      </td>
    </tr>
    <tr>
      <td style="background:#111;padding:16px 32px;text-align:center;border-top:1px solid #2a2a2a">
        <p style="margin:0;color:#555;font-size:11px">© 2026 Qor AI · qorai.net</p>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });

    $app.newMailClient().send(message);

    return e.json(200, { message: 'Confirmation email sent.' });
  } catch (err) {
    return e.json(500, { error: 'hook_fatal', message: String(err), detail: String(err) });
  }
}, $apis.requireAuth());

// GET /api/users/confirm-delete — public, processes confirmation link
routerAdd('GET', '/api/users/confirm-delete', (e) => {
  const errorPage = (msg) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Error — Qor AI</title></head>
<body style="font-family:sans-serif;background:#0f0f0f;color:#f5f5f5;text-align:center;padding:60px 20px">
  <div style="max-width:440px;margin:0 auto">
    <div style="font-size:48px;margin-bottom:16px">❌</div>
    <h1 style="color:#ef4444;font-size:22px">Link Invalid or Expired</h1>
    <p style="color:#999;font-size:15px">${msg}</p>
    <p style="margin-top:32px"><a href="https://qorai.net" style="color:#00e5ff">← Back to Qor AI</a></p>
  </div>
</body></html>`;

  try {
    const TOKEN_TTL_SECONDS = 86400; // 24 hours
    const secret = $os.getenv('DELETION_SIGNING_SECRET')
      || $os.getenv('POCKETBASE_ADMIN_EMAIL')
      || 'qorai_delete_secret';

    const id = String(e.request.url.query().get('id') || '').trim();
    const ts = parseInt(String(e.request.url.query().get('ts') || '0'), 10);
    const sig = String(e.request.url.query().get('sig') || '').trim();

    if (!id || !ts || !sig) {
      return e.html(400, errorPage('Invalid deletion link.'));
    }

    // Verify expiry (24 hours)
    if (Math.floor(Date.now() / 1000) - ts > TOKEN_TTL_SECONDS) {
      return e.html(400, errorPage('This link has expired. Please request a new deletion email.'));
    }

    // Verify HMAC signature
    const data = id + '_' + ts;
    const expectedSig = $security.hs256(data, secret);
    if (sig !== expectedSig) {
      return e.html(400, errorPage('Invalid link signature.'));
    }

    // Find user
    let user = null;
    try {
      user = $app.findRecordById('users', id);
    } catch (_) {
      return e.html(404, errorPage('Account not found. It may have already been deleted.'));
    }

    // Delete related data first (best-effort, non-fatal)
    const relatedCollections = [
      { col: 'recently_viewed', field: 'userId' },
      { col: 'comparisons', field: 'userId' },
      { col: 'favorites', field: 'userId' },
      { col: 'saved_analyses', field: 'userId' },
      { col: 'comparison_reviews', field: 'userId' },
      { col: 'review_replies', field: 'userId' },
      { col: 'notifications', field: 'recipientId' },
      { col: 'support_messages', field: 'userId' },
    ];

    for (const rc of relatedCollections) {
      try {
        const records = $app.findRecordsByFilter(rc.col, `${rc.field} = "${id}"`, '', 0, 0);
        for (const rec of records) {
          try { $app.delete(rec); } catch (_) {}
        }
      } catch (_) {}
    }

    // Reviews: keep them as community content but anonymize the author so the
    // app can render "Deleted Account" in the UI.
    try {
      const reviews = $app.findRecordsByFilter('reviews', `userId = "${id}"`, '', 0, 0);
      for (const rec of reviews) {
        try {
          rec.set('userId', '');
          rec.set('authorDisplayName', '');
          rec.set('authorPhotoURL', '');
          $app.save(rec);
        } catch (_) {}
      }
    } catch (_) {}

    // Delete the user account
    $app.delete(user);

    const successPage = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Account Deleted — Qor AI</title></head>
<body style="font-family:sans-serif;background:#0f0f0f;color:#f5f5f5;text-align:center;padding:60px 20px">
  <div style="max-width:440px;margin:0 auto">
    <div style="font-size:48px;margin-bottom:16px">✅</div>
    <h1 style="color:#22c55e;font-size:22px">Account Deleted</h1>
    <p style="color:#999;font-size:15px;line-height:1.6">
      Your Qor AI account and all associated data have been permanently deleted.
      We're sorry to see you go.
    </p>
    <p style="margin-top:32px"><a href="https://qorai.net" style="color:#00e5ff">← Visit Qor AI</a></p>
  </div>
</body></html>`;

    return e.html(200, successPage);
  } catch (err) {
    return e.html(500, `<html><body style="font-family:sans-serif;background:#0f0f0f;color:#f5f5f5;text-align:center;padding:60px">
      <h1 style="color:#ef4444">Server Error</h1>
      <p style="color:#999">An error occurred: ${String(err)}</p>
    </body></html>`);
  }
});
