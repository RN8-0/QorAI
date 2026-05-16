/// <reference path="../pb_data/types.d.ts" />
// PocketBase JS hook: POST /api/auth/apple
// ─────────────────────────────────────────────────────────────────────────────
// Native Sign In with Apple — exchanges Apple identity token for PB auth token.
//
// Flow:
//   1. Flutter app calls SignInWithApple.getAppleIDCredential() → identityToken
//   2. App POSTs identityToken + givenName + familyName to this endpoint
//   3. Hook decodes + validates JWT claims (iss, exp, aud)
//   4. Finds or creates user in PocketBase users collection
//   5. Returns PB auth token + record
// ─────────────────────────────────────────────────────────────────────────────

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_EXPECTED_AUD = "com.qorai.app"; // App Bundle ID
const DEFAULT_SIGNUP_BONUS = 20;

function _readSignupBonusFromConfig() {
  try {
    const rec = $app.findFirstRecordByData("public_config", "key", "signup_bonus_q_coins");
    if (!rec) return DEFAULT_SIGNUP_BONUS;
    const raw = rec.get("value");
    let parsed = raw;
    if (typeof raw === "string") {
      try { parsed = JSON.parse(raw); } catch (_) { parsed = raw; }
    }
    const n = Number(parsed);
    if (!isFinite(n) || n < 0) return DEFAULT_SIGNUP_BONUS;
    return Math.floor(n);
  } catch (_) {
    return DEFAULT_SIGNUP_BONUS;
  }
}

function _grantSignupBonusIfEmpty(userRecord) {
  try {
    const current = Number(userRecord.get("bonusQCoins") || 0);
    if (current > 0) return;
    const bonus = _readSignupBonusFromConfig();
    if (bonus <= 0) return;
    userRecord.set("bonusQCoins", bonus);
    try { userRecord.set("dailyAiCreditsUsed", 0); } catch (_) {}
  } catch (_) {}
}

// ── Pure-JS base64url → string decoder (goja has no atob) ───────────────────
const B64CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function _b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  const rem = str.length % 4;
  if (rem === 2) str += "==";
  else if (rem === 3) str += "=";

  let out = "";
  for (let i = 0; i < str.length; i += 4) {
    const e1 = B64CHARS.indexOf(str[i]);
    const e2 = B64CHARS.indexOf(str[i + 1]);
    const e3 = B64CHARS.indexOf(str[i + 2]);
    const e4 = B64CHARS.indexOf(str[i + 3]);
    const c1 = (e1 << 2) | (e2 >> 4);
    const c2 = ((e2 & 15) << 4) | (e3 >> 2);
    const c3 = ((e3 & 3) << 6) | e4;
    out += String.fromCharCode(c1);
    if (e3 !== 64) out += String.fromCharCode(c2);
    if (e4 !== 64) out += String.fromCharCode(c3);
  }
  return out;
}

function _decodeJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_jwt_format");
  return JSON.parse(_b64urlDecode(parts[1]));
}

// ── Random password for auto-created Apple accounts ─────────────────────────
function _randomPass(len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$";
  let r = "";
  for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

// ── Main route ───────────────────────────────────────────────────────────────
routerAdd("POST", "/api/auth/apple", (e) => {
  try {
    const body = e.requestInfo().body;
    const identityToken = String(body.identityToken || "").trim();
    const givenName     = String(body.givenName  || "").trim();
    const familyName    = String(body.familyName || "").trim();

    if (!identityToken) {
      return e.json(400, { error: "missing_identity_token" });
    }

    // ── Decode & validate JWT claims ──────────────────────────────────────
    let payload;
    try {
      payload = _decodeJwtPayload(identityToken);
    } catch (err) {
      return e.json(400, { error: "invalid_token", detail: String(err) });
    }

    const now = Math.floor(Date.now() / 1000);

    if (payload.iss !== APPLE_ISSUER) {
      return e.json(401, { error: "invalid_issuer", got: payload.iss });
    }
    if (payload.exp < now) {
      return e.json(401, { error: "token_expired" });
    }
    // Audience can be string or array
    const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audList.includes(APPLE_EXPECTED_AUD)) {
      return e.json(401, { error: "invalid_audience", aud: payload.aud });
    }

    const appleUserId = String(payload.sub || "").trim();
    if (!appleUserId) return e.json(400, { error: "missing_sub" });

    const appleEmail       = String(payload.email || "").trim();
    const effectiveEmail   = appleEmail || (appleUserId + "@privaterelay.appleid.com");
    const displayName      = [givenName, familyName].filter(Boolean).join(" ") ||
                             (appleEmail ? appleEmail.split("@")[0] : "Apple User");

    // ── 1. Lookup by appleId field (most reliable — stable Apple sub) ─────
    let userRecord = null;
    try {
      userRecord = $app.findFirstRecordByFilter(
        "users",
        "appleId = {:appleId}",
        { appleId: appleUserId },
      );
    } catch (_) { /* field might not exist yet */ }

    // ── 2. Fallback: lookup by real email ─────────────────────────────────
    if (!userRecord && appleEmail) {
      try {
        userRecord = $app.findFirstRecordByFilter(
          "users",
          "email = {:email}",
          { email: appleEmail },
        );
      } catch (_) {}
    }

    // ── 3. Create new user ────────────────────────────────────────────────
    if (!userRecord) {
      const col  = $app.findCollectionByNameOrId("users");
      userRecord = new Record(col);
      const pass = _randomPass(32);

      userRecord.set("email",           effectiveEmail);
      userRecord.set("password",        pass);
      userRecord.set("passwordConfirm", pass);
      userRecord.set("verified",        true);
      userRecord.set("name",            displayName);
      userRecord.set("displayName",     displayName);
      try { userRecord.set("appleId", appleUserId); } catch (_) {}
      _grantSignupBonusIfEmpty(userRecord);

      $app.save(userRecord);
    } else {
      // Back-fill appleId if missing
      try {
        if (!String(userRecord.get("appleId") || "").trim()) {
          userRecord.set("appleId", appleUserId);
          $app.save(userRecord);
        }
      } catch (_) {}

      // Back-fill displayName if empty and we received one from Apple
      try {
        const existingName = String(
          userRecord.get("displayName") || userRecord.get("name") || ""
        ).trim();
        if (!existingName && displayName) {
          userRecord.set("displayName", displayName);
          userRecord.set("name",        displayName);
          $app.save(userRecord);
        }
      } catch (_) {}
    }

    // ── Generate PocketBase auth token ────────────────────────────────────
    const token = userRecord.newAuthToken();

    return e.json(200, {
      token: token,
      record: {
        id:          userRecord.id,
        email:       userRecord.getString("email"),
        name:        userRecord.getString("name")        || displayName,
        displayName: userRecord.getString("displayName") || displayName,
        verified:    userRecord.getBool("verified"),
        created:     userRecord.getString("created"),
        updated:     userRecord.getString("updated"),
      },
    });

  } catch (err) {
    console.error("[apple_auth] Fatal:", String(err));
    return e.json(500, { error: "hook_fatal", detail: String(err) });
  }
});
