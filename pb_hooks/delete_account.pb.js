/// <reference path="../pb_data/types.d.ts" />
// PocketBase JS hooks: Account deletion via email confirmation
// ─────────────────────────────────────────────────────────────
// Flow:
//   1. App calls POST /api/users/request-delete (authenticated)
//      → generates a signed token, sends confirmation email
//   2. User clicks link in email: GET /api/users/confirm-delete?id=...&ts=...&sig=...
//      → validates token, deletes all user data, returns success page

const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';
const FROM_EMAIL = 'noreply@qorai.net';
const FROM_NAME = 'Qor AI';
const TOKEN_TTL_SECONDS = 86400; // 24 hours

function _getDeletionSecret() {
  return $os.getenv('DELETION_SIGNING_SECRET') ||
    $os.getenv('POCKETBASE_ADMIN_EMAIL') ||
    'qorai_delete_secret';
}

// POST /api/users/request-delete — requires user auth
routerAdd('POST', '/api/users/request-delete', (e) => {
  try {
    const user = e.auth;
    if (!user) return e.json(401, { error: 'auth_required' });

    const email = String(user.get('email') || '').trim();
    if (!email) return e.json(400, { error: 'no_email', message: 'No email address on account.' });

    const ts = Math.floor(Date.now() / 1000);
    const data = user.id + '_' + ts;
    const sig = $security.hs256(data, _getDeletionSecret());
    const confirmUrl =
      `${PB_URL}/api/users/confirm-delete?id=${encodeURIComponent(user.id)}&ts=${ts}&sig=${encodeURIComponent(sig)}`;

    const displayName = String(user.get('displayName') || user.get('name') || email.split('@')[0]);

    const message = new MailerMessage({
      from: { name: FROM_NAME, address: FROM_EMAIL },
      to: [{ address: email }],
      subject: 'Confirm Account Deletion — Qor AI',
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
        <p style="margin:0;color:#555;font-size:11px">© 2025 Qor AI · qorai.net</p>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });

    $app.newMailClient().send(message);

    return e.json(200, { message: 'Confirmation email sent.' });
  } catch (err) {
    return e.json(500, { error: 'hook_fatal', detail: String(err) });
  }
}, $apis.requireAuth());

// GET /api/users/confirm-delete — public, processes confirmation link
routerAdd('GET', '/api/users/confirm-delete', (e) => {
  try {
    const id = String(e.request.url.query().get('id') || '').trim();
    const ts = parseInt(String(e.request.url.query().get('ts') || '0'), 10);
    const sig = String(e.request.url.query().get('sig') || '').trim();

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

    if (!id || !ts || !sig) {
      return e.html(400, errorPage('Invalid deletion link.'));
    }

    // Verify expiry (24 hours)
    if (Math.floor(Date.now() / 1000) - ts > TOKEN_TTL_SECONDS) {
      return e.html(400, errorPage('This link has expired. Please request a new deletion email from the app.'));
    }

    // Verify HMAC signature
    const data = id + '_' + ts;
    const expectedSig = $security.hs256(data, _getDeletionSecret());
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
      { col: 'notifications', field: 'recipientId' },
      { col: 'support_messages', field: 'userId' },
    ];

    for (const { col, field } of relatedCollections) {
      try {
        const records = $app.findRecordsByFilter(col, `${field} = "${id}"`, '', 0, 0);
        for (const rec of records) {
          try { $app.delete(rec); } catch (_) {}
        }
      } catch (_) {}
    }

    // Reviews: keep them as community content but anonymize the author so the
    // app can render "Silinen Hesap" / "Deleted Account" in the UI.
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
      <p style="color:#999">An error occurred. Please try again later.</p>
    </body></html>`);
  }
});
