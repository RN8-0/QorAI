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

    // Record a 15-day re-signup cooldown for this email BEFORE deleting the user,
    // so the same person can't delete + immediately re-create the account to farm
    // a fresh Qor Coin welcome bonus. Stored as a non-reversible HMAC (no
    // plaintext PII) in a superuser-only collection. Best-effort — a cooldown
    // write failure must never block the deletion the user explicitly confirmed.
    try {
      const email = String(user.get('email') || '').toLowerCase().trim();
      if (email && email.indexOf('@qorai.local') === -1) {
        const COOLDOWN_DAYS = 15;
        const emailHash = $security.hs256(email, 'qorai_del_cd_v1');
        const nowSec = Math.floor(Date.now() / 1000);
        const expiresTs = nowSec + (COOLDOWN_DAYS * 86400);
        let rec = null;
        try { rec = $app.findFirstRecordByFilter('deleted_emails', 'emailHash = {:h}', { h: emailHash }); } catch (_) { rec = null; }
        if (!rec) {
          const col = $app.findCollectionByNameOrId('deleted_emails');
          rec = new Record(col);
          rec.set('emailHash', emailHash);
        }
        rec.set('expiresTs', expiresTs);
        rec.set('deletedAt', new Date().toISOString());
        $app.save(rec);
      }
    } catch (_) { /* cooldown is best-effort */ }

    // Delete the user account. Removing the record invalidates every auth token
    // that referenced it (its tokenKey is gone), so all sessions on all devices
    // are logged out server-side on their next request.
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

// ══════════════════════════════════════════════════════════════════════════
//  POLAR.SH ÖDEME ENTEGRASYONU
// ══════════════════════════════════════════════════════════════════════════
// NEDEN BU DOSYADA? PocketBase container'ında pb_hooks dosyaları TEK TEK
// bind-mount edilmiş; yeni bir dosya eklemek Coolify depolama ayarı gerektiriyor
// ve o panel API'si daha önce bozulup paneli kapatmıştı. Bu yüzden Polar uçları
// zaten mount'lu olan bu dosyaya eklendi (burası ayrıca HMAC kullanan tek dosya).
//
// AKIŞ
//   1. Site → POST /api/polar/checkout (oturum açık kullanıcı)
//      → Polar'da checkout session açar, `external_customer_id` = PocketBase
//        kullanıcı id'si. Eşleştirme e-postaya DEĞİL bu id'ye dayanır, yani
//        kullanıcı ödemede farklı e-posta yazsa bile doğru hesap premium olur.
//   2. Polar → POST /api/polar/webhook
//      → Standard Webhooks imzası doğrulanır, ardından premium yazılır/düşürülür.
//
// PREMIUM ALANLARI uygulamayla AYNI (lib/data/models/user_model.dart +
// web/src/lib/premium.js): `isPremium` (bool) ve
// `userSubscriptionDetails.premium = { productId, expiresAt }`.
// Bu yüzden Polar aboneliği, Play aboneliğiyle birebir aynı yoldan tanınır —
// mobil uygulamada TEK SATIR değişiklik gerekmez.
//
// JSVM İZOLASYONU: her callback KENDİ runtime'ında koşar; dosya seviyesindeki
// yardımcılar callback içinde GÖRÜNMEZ. Bu yüzden her şey callback İÇİNDE.

// POST /api/polar/checkout — oturum açık kullanıcı için ödeme oturumu açar
routerAdd('POST', '/api/polar/checkout', (e) => {
  try {
    const user = e.auth;
    if (!user) return e.json(401, { error: 'auth_required' });

    const token = $os.getenv('POLAR_ACCESS_TOKEN');
    if (!token) return e.json(500, { error: 'not_configured' });

    const MONTHLY = $os.getenv('POLAR_PRODUCT_MONTHLY');
    const YEARLY = $os.getenv('POLAR_PRODUCT_YEARLY');

    let body = {};
    try { body = e.requestInfo().body || {}; } catch (_) { body = {}; }
    const plan = String(body.plan || 'monthly').toLowerCase();
    const productId = plan === 'yearly' ? YEARLY : MONTHLY;
    if (!productId) return e.json(500, { error: 'product_not_configured', plan: plan });

    // PARA BİRİMİ: Polar checkout'u yalnız `products` verilince VARSAYILAN
    // (USD) fiyatla açıyor — müşteri ekranda para birimi seçemiyor. Ziyaretçinin
    // ülkesine uyan `product_price_id` ile açarsak checkout o para biriminde
    // gelir (doğrulandı: TRY fiyat id'siyle 14999 TRY). Fiyat kimlikleri panelde
    // değişebileceği için sabitlemiyoruz; ürünü çekip para biriminden buluyoruz.
    const cc = String((body && body.country) || '').toUpperCase();
    const EURO = ['DE', 'AT', 'BE', 'NL', 'FR', 'IT', 'ES', 'PT', 'IE', 'FI', 'GR',
      'SK', 'SI', 'EE', 'LV', 'LT', 'LU', 'MT', 'CY', 'HR'];
    let want = 'usd';
    if (cc === 'TR') want = 'try';
    else if (cc === 'GB') want = 'gbp';
    else if (EURO.indexOf(cc) >= 0) want = 'eur';

    // Fiyat kimliği DAİMA çözülür (yalnız yabancı para birimi için değil):
    // ürünün birden fazla fiyatı olduğunda sadece `products` göndermek Polar'da
    // 422 veriyor — hangi fiyatın kastedildiği belirsiz kalıyor. İstenen para
    // birimi yoksa USD'ye düşülür.
    let priceId = '';
    try {
      const pr = $http.send({
        url: 'https://api.polar.sh/v1/products/' + productId,
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token },
        timeout: 15,
      });
      if (pr.statusCode === 200 && pr.json && pr.json.prices) {
        const list = pr.json.prices;
        let usdId = '';
        for (let i = 0; i < list.length; i++) {
          if (list[i].is_archived) continue;
          const cur = String(list[i].price_currency || '').toLowerCase();
          if (cur === want && !priceId) priceId = String(list[i].id);
          if (cur === 'usd' && !usdId) usdId = String(list[i].id);
        }
        if (!priceId) priceId = usdId;
      }
    } catch (perr) {
      console.log('[polar] fiyat listesi alınamadı: ' + String(perr));
    }

    const payload = priceId ? {
      product_price_id: priceId,
      external_customer_id: user.id,
    } : {
      products: [productId],
      external_customer_id: user.id,
      customer_email: String(user.get('email') || ''),
      success_url: 'https://qorai.net/premium?polar=success',
      metadata: { plan: plan, pbUserId: user.id, source: 'web' },
    };
    payload.customer_email = String(user.get('email') || '');
    payload.success_url = 'https://qorai.net/premium?polar=success';
    // Polar metadata değerleri BOŞ OLAMAZ (422 "String should have at least 1
    // character"). Ülke tespit edilemediğinde alanı hiç göndermiyoruz.
    payload.metadata = { plan: plan, pbUserId: user.id, source: 'web' };
    if (cc) payload.metadata.country = cc;

    const res = $http.send({
      url: 'https://api.polar.sh/v1/checkouts/',
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      timeout: 20,
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      console.log('[polar] checkout failed ' + res.statusCode + ' ' + String(res.raw).slice(0, 300));
      return e.json(502, { error: 'checkout_failed', status: res.statusCode });
    }
    const data = res.json;
    return e.json(200, { url: data.url, id: data.id, amount: data.amount, currency: data.currency });
  } catch (err) {
    console.log('[polar] checkout error: ' + String(err));
    return e.json(500, { error: 'server_error', message: String(err) });
  }
});

// POST /api/polar/portal — oturum açık kullanıcı için Polar müşteri portalı
//
// NEDEN SUNUCU UCU: Polar'ın genel portal adresi (polar.sh/qorai/portal)
// kullanıcıdan e-posta isteyip sihirli link yolluyor. Kullanıcı ödemede farklı
// bir e-posta girmişse (checkout'ta `external_customer_id`=PB id yazdığımız için
// bu MÜMKÜN) kendi aboneliğini bulamaz. `customer-sessions` ile PB kullanıcısına
// bağlı OTURUMLU portal adresi üretiyoruz → profildeki butondan tek tıkla,
// e-posta sormadan iptal ekranına düşer.
routerAdd('POST', '/api/polar/portal', (e) => {
  try {
    const user = e.auth;
    if (!user) return e.json(401, { error: 'auth_required' });

    const token = $os.getenv('POLAR_ACCESS_TOKEN');
    if (!token) return e.json(500, { error: 'not_configured' });

    const res = $http.send({
      url: 'https://api.polar.sh/v1/customer-sessions/',
      method: 'POST',
      body: JSON.stringify({ external_customer_id: user.id }),
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      timeout: 20,
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      // 404 = bu kullanıcı Polar'da hiç müşteri olmamış (web'den hiç ödeme
      // yapmamış). Bu bir HATA DEĞİL: muhtemelen Play Store'dan abone.
      const notFound = res.statusCode === 404 || res.statusCode === 422;
      console.log('[polar] portal ' + res.statusCode + ' user=' + user.id +
        ' ' + String(res.raw).slice(0, 200));
      return e.json(notFound ? 404 : 502, {
        error: notFound ? 'no_web_subscription' : 'portal_failed',
        status: res.statusCode,
      });
    }
    const data = res.json || {};
    return e.json(200, { url: data.customer_portal_url || '' });
  } catch (err) {
    console.log('[polar] portal error: ' + String(err));
    return e.json(500, { error: 'server_error', message: String(err) });
  }
});

// POST /api/polar/webhook — Polar olay bildirimi (Standard Webhooks imzalı)
routerAdd('POST', '/api/polar/webhook', (e) => {
  try {
    const secret = $os.getenv('POLAR_WEBHOOK_SECRET') || '';

    // Ham gövde imza için ŞART (yeniden serileştirme imzayı bozar).
    let raw = '';
    try { raw = String(readerToString(e.request.body)); } catch (_) { raw = ''; }

    const hdrId = e.request.header.get('webhook-id') || '';
    const hdrTs = e.request.header.get('webhook-timestamp') || '';
    const hdrSig = e.request.header.get('webhook-signature') || '';

    const b64ToStr = (s) => {
      const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const clean = String(s).replace(/[^A-Za-z0-9+/]/g, '');
      let out = '';
      for (let i = 0; i < clean.length; i += 4) {
        const n = (A.indexOf(clean[i]) << 18) | (A.indexOf(clean[i + 1]) << 12)
          | ((A.indexOf(clean[i + 2]) & 63) << 6) | (A.indexOf(clean[i + 3]) & 63);
        out += String.fromCharCode((n >> 16) & 255);
        if (clean[i + 2] !== undefined) out += String.fromCharCode((n >> 8) & 255);
        if (clean[i + 3] !== undefined) out += String.fromCharCode(n & 255);
      }
      return out;
    };
    const hexToB64 = (hex) => {
      const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const bytes = [];
      for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));
      let out = '';
      for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i]; const b1 = bytes[i + 1]; const b2 = bytes[i + 2];
        out += A[b0 >> 2];
        out += A[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
        out += b1 === undefined ? '=' : A[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
        out += b2 === undefined ? '=' : A[b2 & 63];
      }
      return out;
    };

    // ── Standard Webhooks imza doğrulaması ────────────────────────────────
    // İmzalanan metin: "{webhook-id}.{webhook-timestamp}.{gövde}"
    // Beklenen: base64(HMAC_SHA256(sır, metin)). Sır `whsec_` öneki taşıyorsa
    // önek atılır ve kalan base64 ÇÖZÜLEREK anahtar olur (spec böyle diyor).
    if (secret) {
      if (!hdrId || !hdrTs || !hdrSig || !raw) {
        console.log('[polar] webhook imza başlıkları/gövde eksik — reddedildi');
        return e.json(401, { error: 'missing_signature' });
      }
      const keyRaw = secret.indexOf('whsec_') === 0 ? secret.slice(6) : secret;
      let key = keyRaw;
      try { const dec = b64ToStr(keyRaw); if (dec) key = dec; } catch (_) { key = keyRaw; }
      const expected = hexToB64($security.hs256(hdrId + '.' + hdrTs + '.' + raw, key));
      let ok = false;
      const parts = String(hdrSig).split(' ');
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i].indexOf(',') >= 0 ? parts[i].split(',')[1] : parts[i];
        if (p === expected) { ok = true; break; }
      }
      if (!ok) {
        console.log('[polar] webhook imzası UYUŞMADI — reddedildi');
        return e.json(401, { error: 'bad_signature' });
      }
    }

    // JSVM izolasyonu nedeniyle yardımcı callback İÇİNDE tanımlı.
    // PocketBase JSON alanları JSVM'e ya Go slice (bayt dizisi) ya da nesne
    // olarak gelir. Bayt dizisi gelirse UTF-8 çözüp ayrıştırmak GEREKİR: aksi
    // halde JSON.stringify onu "[123,34,...]" yapar, sonuç dizi çıkar ve
    // abonelik detayı sessizce SİLİNİR (iptal akışında bu yaşandı).
    const _asPlainObject = (v) => {
      if (!v || typeof v !== 'object') return {};
      let plain = null;
      // Bayt dizisi mi?
      let looksBytes = false;
      try {
        looksBytes = (typeof v.length === 'number' && v.length > 0);
        if (looksBytes) {
          for (let i = 0; i < v.length && i < 16; i++) {
            const b = v[i];
            if (typeof b !== 'number' || b < 0 || b > 255 || (b | 0) !== b) { looksBytes = false; break; }
          }
        }
      } catch (_) { looksBytes = false; }
      if (looksBytes) {
        let str = '';
        for (let i = 0; i < v.length; i++) {
          const c = v[i] & 0xFF;
          if (c < 0x80) str += String.fromCharCode(c);
          else if (c >= 0xC0 && c < 0xE0) str += String.fromCharCode(((c & 0x1F) << 6) | (v[++i] & 0x3F));
          else if (c >= 0xE0 && c < 0xF0) {
            const b2 = v[++i] & 0x3F; const b3 = v[++i] & 0x3F;
            str += String.fromCharCode(((c & 0x0F) << 12) | (b2 << 6) | b3);
          } else if (c >= 0xF0) {
            const d2 = v[++i] & 0x3F; const d3 = v[++i] & 0x3F; const d4 = v[++i] & 0x3F;
            const cp = (((c & 0x07) << 18) | (d2 << 12) | (d3 << 6) | d4) - 0x10000;
            str += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
          }
        }
        try { plain = JSON.parse(str); } catch (_) { plain = null; }
      }
      if (plain === null) {
        try { plain = JSON.parse(JSON.stringify(v)); } catch (_) { return {}; }
      }
      if (!plain || typeof plain !== 'object' || Array.isArray(plain)) return {};
      return plain;
    };

    let evt = {};
    try { evt = JSON.parse(raw); } catch (_) { evt = {}; }
    const type = String(evt.type || '');
    const d = evt.data || {};

    // Kullanıcıyı bul: önce external_customer_id (checkout'ta biz yazdık),
    // sonra metadata.pbUserId, en son e-posta.
    let extId = '';
    if (d.customer && d.customer.external_id) extId = String(d.customer.external_id);
    else if (d.external_customer_id) extId = String(d.external_customer_id);
    else if (d.metadata && d.metadata.pbUserId) extId = String(d.metadata.pbUserId);

    let rec = null;
    if (extId) { try { rec = $app.findRecordById('users', extId); } catch (_) { rec = null; } }
    if (!rec) {
      let email = '';
      if (d.customer && d.customer.email) email = String(d.customer.email);
      else if (d.customer_email) email = String(d.customer_email);
      email = email.trim();
      if (email) { try { rec = $app.findFirstRecordByData('users', 'email', email); } catch (_) { rec = null; } }
    }
    if (!rec) {
      // Kullanıcı bulunamasa da 200 dönüyoruz: aksi halde Polar 9 kez tekrar
      // dener ve kuyruğu boşuna doldurur. Olay loglanır, elle incelenir.
      console.log('[polar] webhook ' + type + ' — eşleşen kullanıcı yok (ext=' + extId + ')');
      return e.json(200, { ok: true, matched: false });
    }

    const GRANT = ['subscription.active', 'subscription.created', 'subscription.updated', 'order.paid'];
    const REVOKE = ['subscription.canceled', 'subscription.revoked'];

    if (GRANT.indexOf(type) >= 0) {
      const status = String(d.status || '');
      if (status && status !== 'active' && status !== 'trialing') {
        console.log('[polar] ' + type + ' status=' + status + ' — premium yazılmadı');
        return e.json(200, { ok: true, skipped: status });
      }
      const interval = String(d.recurring_interval || (d.product && d.product.recurring_interval) || '');
      let expiresAt = String(d.current_period_end || d.ends_at || '');
      if (!expiresAt) {
        const days = interval === 'year' ? 366 : 31;
        expiresAt = new Date(Date.now() + days * 86400000).toISOString();
      }
      const prod = String(d.product_id || (d.product && d.product.id) || '');
      // PocketBase'in JSON alani BOŞKEN JSVM'e Go slice (dizi) olarak geliyor ve
      // üzerine alan yazmak "Can't set property 'premium' on Go slice" hatası
      // veriyordu — gerçek ödemede premium HİÇ yazılamazdı. Değeri düz bir JS
      // nesnesine kopyalıyoruz; dizi/boş gelirse sıfırdan nesne kuruyoruz.
      const next = _asPlainObject(rec.get('userSubscriptionDetails'));
      next.premium = {
        productId: prod || (interval === 'year' ? 'polar_yearly' : 'polar_monthly'),
        expiresAt: expiresAt,
        source: 'polar',
        subscriptionId: String(d.id || ''),
        updatedAt: new Date().toISOString(),
      };
      rec.set('isPremium', true);
      rec.set('userSubscriptionDetails', next);
      $app.save(rec);
      console.log('[polar] premium VERİLDİ user=' + rec.id + ' type=' + type + ' bitis=' + expiresAt);
      return e.json(200, { ok: true, granted: true });
    }

    if (REVOKE.indexOf(type) >= 0) {
      const next = _asPlainObject(rec.get('userSubscriptionDetails'));
      // Polar iptalde dönem sonuna kadar erişimi sürdürür; bitiş ileri tarihliyse
      // premium HEMEN düşürülmez, yalnız bitiş tarihi işaretlenir.
      const endsAt = String(d.ends_at || d.current_period_end || '');
      const stillValid = endsAt && (new Date(endsAt).getTime() > Date.now());
      if (stillValid) {
        if (next.premium) { next.premium.expiresAt = endsAt; next.premium.canceled = true; }
        rec.set('userSubscriptionDetails', next);
        $app.save(rec);
        console.log('[polar] iptal — ' + endsAt + ' tarihine kadar geçerli user=' + rec.id);
        return e.json(200, { ok: true, endsAt: endsAt });
      }
      next.premium = null;
      rec.set('isPremium', false);
      rec.set('userSubscriptionDetails', next);
      $app.save(rec);
      console.log('[polar] premium DÜŞÜRÜLDÜ user=' + rec.id + ' type=' + type);
      return e.json(200, { ok: true, revoked: true });
    }

    return e.json(200, { ok: true, ignored: type });
  } catch (err) {
    console.log('[polar] webhook error: ' + String(err));
    // 200 dönmezsek Polar 9 kez tekrar dener; hatayı loglayıp kabul ediyoruz.
    return e.json(200, { ok: false, error: String(err) });
  }
});
