/// <reference path="../pb_data/types.d.ts" />
// PocketBase JS hook: Serve password reset page at GET /reset-password
// Configure PocketBase → Settings → Emails → Password Reset URL to:
//   https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io/reset-password

const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';

routerAdd('GET', '/reset-password', (e) => {
  const token = String(e.request.url.query().get('token') || '');

  const hasToken = token.length > 0;
  const invalidHtml = hasToken ? '' : `
    <div class="msg error" style="display:block">
      This password reset link is invalid or has expired.<br>
      Please request a new password reset from the Qor AI app.
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reset Password — Qor AI</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a; color: #f5f5f5;
      min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 20px; padding: 40px 36px; width: 100%; max-width: 440px; }
    .logo { font-size: 22px; font-weight: 800; color: #00e5ff; margin-bottom: 6px; }
    .title { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    .subtitle { font-size: 14px; color: #888; margin-bottom: 28px; line-height: 1.5; }
    .field { margin-bottom: 16px; }
    label { display: block; font-size: 12px; font-weight: 600; color: #aaa; margin-bottom: 6px; letter-spacing: 0.4px; text-transform: uppercase; }
    input { width: 100%; background: #111; border: 1.5px solid #2a2a2a; border-radius: 12px; padding: 14px 16px; color: #f5f5f5; font-size: 15px; outline: none; transition: border-color 0.2s; }
    input:focus { border-color: #00e5ff; }
    .hint { font-size: 12px; color: #666; margin-top: 5px; }
    .btn { width: 100%; background: #00e5ff; color: #000; font-size: 16px; font-weight: 700; border: none; border-radius: 12px; padding: 16px; cursor: pointer; margin-top: 8px; transition: opacity 0.2s; }
    .btn:hover:not(:disabled) { opacity: 0.85; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .msg { border-radius: 12px; padding: 14px 16px; font-size: 14px; line-height: 1.5; margin-bottom: 20px; display: none; }
    .msg.error { background: #ef444420; border: 1px solid #ef444440; color: #fca5a5; display: block; }
    .msg.success { background: #22c55e20; border: 1px solid #22c55e40; color: #86efac; display: block; }
    .back { display: block; text-align: center; color: #555; font-size: 13px; margin-top: 20px; text-decoration: none; }
    .back:hover { color: #00e5ff; }
    .spinner { display: inline-block; width: 18px; height: 18px; border: 2.5px solid rgba(0,0,0,0.3); border-top-color: #000; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; margin-right: 8px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Qor AI</div>
    <div class="title" id="pageTitle">${hasToken ? 'Reset Password' : 'Invalid Link'}</div>
    <p class="subtitle" id="pageSubtitle">${hasToken ? 'Enter your new password below.' : 'This link is invalid or has expired.'}</p>
    <div class="msg" id="msgBox">${hasToken ? '' : 'Please request a new password reset from the Qor AI app.'}</div>
    ${hasToken ? `
    <form id="resetForm">
      <div class="field">
        <label>New Password</label>
        <input type="password" id="newPassword" placeholder="Minimum 8 characters" autocomplete="new-password">
        <p class="hint">At least 8 characters</p>
      </div>
      <div class="field">
        <label>Confirm Password</label>
        <input type="password" id="confirmPassword" placeholder="Repeat new password" autocomplete="new-password">
      </div>
      <button type="submit" class="btn" id="submitBtn">Reset Password</button>
    </form>` : ''}
    <a class="back" href="https://qorai.net">← Back to Qor AI</a>
  </div>
  ${hasToken ? `
  <script>
    const TOKEN = ${JSON.stringify(token)};
    const PB = ${JSON.stringify(PB_URL)};
    function showMsg(t, c) { const el = document.getElementById('msgBox'); el.textContent = t; el.className = 'msg ' + c; el.style.display = 'block'; }
    document.getElementById('resetForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = document.getElementById('newPassword').value;
      const cp = document.getElementById('confirmPassword').value;
      if (pw.length < 8) { showMsg('Password must be at least 8 characters.', 'error'); return; }
      if (pw !== cp) { showMsg('Passwords do not match.', 'error'); return; }
      const btn = document.getElementById('submitBtn');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Resetting...';
      try {
        const res = await fetch(PB + '/api/collections/users/confirm-password-reset', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({token: TOKEN, password: pw, passwordConfirm: cp})
        });
        if (res.ok) {
          document.getElementById('resetForm').style.display = 'none';
          document.getElementById('pageTitle').textContent = 'Password Updated!';
          document.getElementById('pageSubtitle').textContent = 'Your password has been reset. Open the Qor AI app to sign in.';
          showMsg('✓ Password reset successfully. You can now sign in to Qor AI.', 'success');
        } else {
          const d = await res.json().catch(() => ({}));
          showMsg(d.message || 'This link may have expired. Please request a new reset.', 'error');
          btn.disabled = false; btn.textContent = 'Reset Password';
        }
      } catch(err) {
        showMsg('Network error. Please try again.', 'error');
        btn.disabled = false; btn.textContent = 'Reset Password';
      }
    });
  <\/script>` : ''}
</body>
</html>`;

  return e.html(200, html);
});
