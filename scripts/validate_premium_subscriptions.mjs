// ═══════════════════════════════════════════════════════════════════════════
//  Premium subscription validator  (server-side anti-fraud for isPremium)
// ───────────────────────────────────────────────────────────────────────────
//  WHY: the app sets `users.isPremium = true` directly from the client after a
//  Google Play purchase. Because the PocketBase `users` updateRule lets an owner
//  write their own record, a user could open devtools and grant themselves
//  Premium for free. The frontend cannot prevent this — only the server can.
//
//  WHAT: this job is the server-side enforcement. For every account currently
//  flagged Premium it takes the Google Play `purchaseToken` the app now stores
//  in `userSubscriptionDetails.premium.purchaseToken` and asks Google whether
//  that subscription is actually real and active. If Google says it isn't
//  (expired / refunded / revoked / token unknown), it clears `isPremium`.
//
//  SAFETY:
//   - It only ever flips isPremium false→ (never grants), so it can't be abused.
//   - DRY_RUN=1 reports what it would do without writing anything. ALWAYS run a
//     DRY_RUN first and add real buyers to GRANDFATHER_EMAILS before going live.
//   - Transient/permission HTTP errors are inconclusive → never revoke on those.
//   - The Google service-account key is OPTIONAL: without it the job still
//     revokes token-less self-grants (NO-TOKEN-ONLY mode); with it, it also
//     verifies tokened subscriptions against Google.
//
//  RUN:  node scripts/validate_premium_subscriptions.mjs
//        DRY_RUN=1 node scripts/validate_premium_subscriptions.mjs        (review)
//        WATCH_INTERVAL_SEC=300 node scripts/...mjs                       (daemon)
//  ENV (migration/.env or process env):
//     POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD
//     GOOGLE_PLAY_SA_KEY   (optional) absolute path to a Google service-account
//                          JSON with the Android Publisher API enabled AND invited
//                          in Play Console (Users & permissions) with access to
//                          this app's financial data. Enables full verification.
//     STRICT_NO_TOKEN      default ON; set 0 to keep the old grandfather-all behavior
//     GRANDFATHER_EMAILS   comma-separated real pre-token buyers to never revoke
//     GRANDFATHER_IDS      same, by user id
//     WATCH_INTERVAL_SEC   >0 keeps running and re-checks on that interval (no cron)
//     ANDROID_PACKAGE      defaults to com.compair.app
//     DRY_RUN=1            report only, do not write
//
//  Run as a daemon (WATCH_INTERVAL_SEC) or on a system cron, like the FCM token
//  refresh, e.g. every 5 min:  */5 * * * * node /path/validate_premium_subscriptions.mjs
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import PocketBase from 'pocketbase';

const PKG = process.env.ANDROID_PACKAGE || 'com.compair.app';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

// STRICT_NO_TOKEN (default ON): an account flagged Premium with NO stored Google
// Play purchaseToken is a client self-grant (the devtools/PB-API abuse this job
// exists to stop) UNLESS it is a genuine pre-token-capture buyer listed in the
// grandfather allowlist. This check needs NO Google API access, so it closes the
// most common hole even before the service account is configured.
// IMPORTANT: run with DRY_RUN=1 once and add any REAL buyers (Play Console →
// financial data) to GRANDFATHER_EMAILS before going live, so you don't revoke a
// legitimate buyer whose token didn't surface on an old build.
const STRICT_NO_TOKEN = process.env.STRICT_NO_TOKEN !== '0' && process.env.STRICT_NO_TOKEN !== 'false';
const GRANDFATHER_IDS = new Set((process.env.GRANDFATHER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
const GRANDFATHER_EMAILS = new Set((process.env.GRANDFATHER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
// WATCH_INTERVAL_SEC > 0 keeps the process running and re-checks on that interval
// (shrinks the abuse window without needing a system cron). 0 = run once and exit.
const WATCH_INTERVAL_SEC = Math.max(0, parseInt(process.env.WATCH_INTERVAL_SEC || '0', 10) || 0);

// ── env loading (process env first, then migration/.env) ────────────────────
function loadEnv() {
  const env = { ...process.env };
  const candidates = [
    path.resolve(process.cwd(), 'migration/.env'),
    path.resolve(process.cwd(), '../migration/.env'),
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const i = line.indexOf('=');
        if (i < 0) continue;
        const k = line.slice(0, i).trim();
        if (!(k in env)) env[k] = line.slice(i + 1).trim();
      }
    } catch { /* ignore */ }
  }
  return env;
}

// ── Google Play access token from the service-account key (no extra deps) ────
// Mints a signed JWT and exchanges it for an OAuth2 access token scoped to the
// Android Publisher API. Uses Node's built-in crypto so it works on the host
// without `google-auth-library` installed.
import crypto from 'crypto';

async function playAccessToken(saKeyPath) {
  const sa = JSON.parse(fs.readFileSync(saKeyPath, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const signingInput = `${b64(header)}.${b64(claim)}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signingInput)
    .sign(sa.private_key)
    .toString('base64url');
  const assertion = `${signingInput}.${signature}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const json = await resp.json();
  if (!json.access_token) {
    throw new Error('Play token exchange failed: ' + JSON.stringify(json));
  }
  return json.access_token;
}

// Returns { valid: bool, state, expiry } for a subscription purchase token.
async function checkSubscription(accessToken, token) {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (resp.status === 404 || resp.status === 410) {
    // Unknown / no longer queryable token → not a real active subscription.
    return { valid: false, state: `HTTP_${resp.status}`, expiry: null };
  }
  if (!resp.ok) {
    // Transient/permission error — do NOT revoke on these; treat as inconclusive.
    return { valid: null, state: `HTTP_${resp.status}`, expiry: null, raw: await resp.text() };
  }
  const data = await resp.json();
  const state = data.subscriptionState || 'UNKNOWN';
  // Latest expiry across line items.
  let expiry = null;
  for (const li of data.lineItems || []) {
    const t = li.expiryTime ? Date.parse(li.expiryTime) : NaN;
    if (Number.isFinite(t) && (expiry == null || t > expiry)) expiry = t;
  }
  const future = expiry != null && expiry > Date.now();
  // Revoked/refunded is always invalid. Otherwise require an active-ish state
  // with a future expiry (CANCELED still entitles until it lapses).
  let valid;
  if (state === 'SUBSCRIPTION_STATE_REVOKED') valid = false;
  else if (['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'].includes(state)) valid = future;
  else valid = false; // EXPIRED, ON_HOLD, PAUSED, PENDING, UNKNOWN
  return { valid, state, expiry };
}

async function main() {
  const env = loadEnv();
  const saKey = env.GOOGLE_PLAY_SA_KEY;
  const haveSaKey = !!(saKey && fs.existsSync(saKey));
  if (!haveSaKey) {
    console.warn('[premium-validate] GOOGLE_PLAY_SA_KEY missing/not found — running in');
    console.warn('  NO-TOKEN-ONLY mode: self-grants without a purchaseToken are revoked,');
    console.warn('  but accounts WITH a token cannot be verified against Google (kept as');
    console.warn('  inconclusive). Set up the service account to enable full verification.');
  }

  const pb = new PocketBase(env.POCKETBASE_URL);
  pb.autoCancellation(false);
  try { await pb.collection('_superusers').authWithPassword(env.POCKETBASE_ADMIN_EMAIL, env.POCKETBASE_ADMIN_PASSWORD); }
  catch { await pb.admins.authWithPassword(env.POCKETBASE_ADMIN_EMAIL, env.POCKETBASE_ADMIN_PASSWORD); }

  const accessToken = haveSaKey ? await playAccessToken(saKey) : null;
  const premium = await pb.collection('users').getFullList({ filter: 'isPremium = true' });

  const summary = { checked: 0, kept: 0, revoked: 0, grandfathered: 0, inconclusive: 0, revokedEmails: [] };
  for (const u of premium) {
    const token = u?.userSubscriptionDetails?.premium?.purchaseToken;
    if (!token) {
      // No stored token. A genuine pre-token-capture buyer is grandfathered ONLY
      // if listed in the allowlist (read your real buyers in Play Console). Any
      // other Premium account with no token is a client self-grant → revoke.
      const allowed =
        GRANDFATHER_IDS.has(u.id) ||
        GRANDFATHER_EMAILS.has((u.email || '').toLowerCase());
      if (allowed || !STRICT_NO_TOKEN) { summary.grandfathered++; continue; }
      summary.revoked++; summary.revokedEmails.push(`${u.email} (NO_TOKEN_SELF_GRANT)`);
      if (!DRY_RUN) {
        const details = u.userSubscriptionDetails || {};
        details.premium = { ...(details.premium || {}), revokedAt: new Date().toISOString(), revokedReason: 'NO_TOKEN_SELF_GRANT' };
        try { await pb.collection('users').update(u.id, { isPremium: false, userSubscriptionDetails: details }); }
        catch (e) { console.error('  revoke failed', u.email, e.message); }
      }
      continue;
    }
    if (!accessToken) { summary.inconclusive++; continue; } // have token but no SA key to verify — keep
    summary.checked++;
    let res;
    try { res = await checkSubscription(accessToken, token); }
    catch (e) { summary.inconclusive++; console.warn('  check error', u.email, e.message); continue; }
    if (res.valid === null) { summary.inconclusive++; continue; } // transient — don't touch
    if (res.valid) { summary.kept++; continue; }
    // Invalid → revoke premium.
    summary.revoked++; summary.revokedEmails.push(`${u.email} (${res.state})`);
    if (!DRY_RUN) {
      const details = u.userSubscriptionDetails || {};
      details.premium = { ...(details.premium || {}), revokedAt: new Date().toISOString(), revokedReason: res.state };
      try { await pb.collection('users').update(u.id, { isPremium: false, userSubscriptionDetails: details }); }
      catch (e) { console.error('  revoke failed', u.email, e.message); }
    }
  }
  console.log('[premium-validate]' + (DRY_RUN ? ' (DRY_RUN)' : ''), JSON.stringify(summary, null, 2));
}

async function loop() {
  if (WATCH_INTERVAL_SEC > 0) {
    console.log(`[premium-validate] watch mode — re-checking every ${WATCH_INTERVAL_SEC}s (Ctrl+C to stop)`);
    for (;;) {
      try { await main(); }
      catch (e) { console.error('[premium-validate] run error (will retry):', e.message); }
      await new Promise((r) => setTimeout(r, WATCH_INTERVAL_SEC * 1000));
    }
  } else {
    await main();
  }
}
loop().catch((e) => { console.error('[premium-validate] fatal', e); process.exit(1); });
