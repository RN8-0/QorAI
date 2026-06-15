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
//   - Accounts with NO stored token are GRANDFATHERED (left untouched) — these
//     predate the token-capturing app build, so we must not revoke them.
//   - DRY_RUN=1 reports what it would do without writing anything.
//   - It only ever flips isPremium false→ (never grants), so it can't be abused.
//
//  RUN:  node scripts/validate_premium_subscriptions.mjs
//  ENV (migration/.env or process env):
//     POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD
//     GOOGLE_PLAY_SA_KEY   absolute path to a Google service-account JSON that
//                          has the Android Publisher API enabled AND is invited
//                          in Play Console (Users & permissions) with access to
//                          this app's financial data.
//     ANDROID_PACKAGE      defaults to com.compair.app
//     DRY_RUN=1            report only, do not write
//
//  Intended to run on the host on a schedule (system cron, like the FCM token
//  refresh), e.g. hourly:  0 * * * * node /path/validate_premium_subscriptions.mjs
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import PocketBase from 'pocketbase';

const PKG = process.env.ANDROID_PACKAGE || 'com.compair.app';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

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
  if (!saKey || !fs.existsSync(saKey)) {
    console.error('[premium-validate] GOOGLE_PLAY_SA_KEY missing/not found:', saKey);
    console.error('  → Set up a Google service account with Android Publisher API access');
    console.error('    (Play Console → Users & permissions → invite the SA email),');
    console.error('    then point GOOGLE_PLAY_SA_KEY at its JSON key file.');
    process.exit(2);
  }

  const pb = new PocketBase(env.POCKETBASE_URL);
  pb.autoCancellation(false);
  try { await pb.collection('_superusers').authWithPassword(env.POCKETBASE_ADMIN_EMAIL, env.POCKETBASE_ADMIN_PASSWORD); }
  catch { await pb.admins.authWithPassword(env.POCKETBASE_ADMIN_EMAIL, env.POCKETBASE_ADMIN_PASSWORD); }

  const accessToken = await playAccessToken(saKey);
  const premium = await pb.collection('users').getFullList({ filter: 'isPremium = true' });

  const summary = { checked: 0, kept: 0, revoked: 0, grandfathered: 0, inconclusive: 0, revokedEmails: [] };
  for (const u of premium) {
    const token = u?.userSubscriptionDetails?.premium?.purchaseToken;
    if (!token) { summary.grandfathered++; continue; } // predates token capture — leave alone
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

main().catch((e) => { console.error('[premium-validate] fatal', e); process.exit(1); });
