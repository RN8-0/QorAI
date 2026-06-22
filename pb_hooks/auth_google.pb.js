/// <reference path="../pb_data/types.d.ts" />
// PocketBase JS hook: POST /api/auth/google
// ------------------------------------------------------------
// Google Sign-In backend: Flutter / web sends an ID token obtained
// from Google (via `google_sign_in` package on mobile, GIS on web).
// We verify the token against Google's tokeninfo endpoint, then
// create-or-get a user in the `users` collection and return a PB
// auth token. No Firebase, no billing, no client secret on device.
//
// Request body:
//   { idToken: "<google-issued jwt>", audience?: "<clientId>" }
// Response:
//   { token: "<pb-jwt>", record: { id, email, name, avatar } }
// ------------------------------------------------------------

routerAdd("POST", "/api/auth/google", (e) => {
  try {
    // ---- Read request body ----
    // PocketBase v0.23+: DynamicModel + bindBody for JSON body reading.
    const bodyModel = new DynamicModel({ idToken: "", audience: "", platform: "", country: "" });
    let bindErr = null;
    try { e.bindBody(bodyModel); } catch (err) { bindErr = String(err); }
    let idToken = bodyModel.idToken;
    let audienceOverride = bodyModel.audience;
    let clientPlatform = bodyModel.platform;
    let clientCountry = bodyModel.country;
    // fallback: requestInfo().body
    if (!idToken) {
      try {
        const rb = e.requestInfo().body;
        if (rb) {
          idToken = rb.idToken || rb["idToken"] || "";
          audienceOverride = rb.audience || rb["audience"] || "";
          clientPlatform = clientPlatform || rb.platform || rb["platform"] || "";
          clientCountry = clientCountry || rb.country || rb["country"] || "";
        }
      } catch (_) {}
    }
    if (!idToken) {
      return e.json(400, { error: "missing_idToken", bindErr: bindErr });
    }

    // ---- Verify token via Google tokeninfo ----
    let info;
    try {
      const res = $http.send({
        method: "GET",
        url: "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
        timeout: 15,
      });
      if (res.statusCode !== 200) {
        return e.json(401, { error: "invalid_token", status: res.statusCode, detail: res.raw });
      }
      info = res.json || JSON.parse(res.raw || "{}");
    } catch (err) {
      return e.json(502, { error: "tokeninfo_failed", detail: String(err) });
    }

    // ---- Validate token claims ----
    const ALLOWED_AUDS = [
      "510980756238-budtd0gdrlk91jmim11frucvue5muhbg.apps.googleusercontent.com", // web
      "510980756238-369d7b3tst5k4aue0niai0g5tm7090c1.apps.googleusercontent.com", // ios
    ];
    if (audienceOverride && ALLOWED_AUDS.indexOf(audienceOverride) === -1) {
      ALLOWED_AUDS.push(audienceOverride);
    }
    if (ALLOWED_AUDS.indexOf(info.aud) === -1) {
      return e.json(401, { error: "audience_mismatch", aud: info.aud, allowed: ALLOWED_AUDS });
    }
    if (info.iss !== "https://accounts.google.com" && info.iss !== "accounts.google.com") {
      return e.json(401, { error: "issuer_mismatch", iss: info.iss });
    }
    if (!info.email || (info.email_verified !== "true" && info.email_verified !== true)) {
      return e.json(401, { error: "email_not_verified", email_verified: info.email_verified });
    }

    // ---- Find-or-create user ----
    const email = String(info.email).toLowerCase();
    const name = info.name || info.given_name || email.split("@")[0];
    const picture = info.picture || "";

    let user = null;
    try {
      user = $app.findFirstRecordByFilter("users", "email = {:email}", { email: email });
    } catch (_) {
      user = null;
    }

    if (!user) {
      const collection = $app.findCollectionByNameOrId("users");
      user = new Record(collection);
      user.set("email", email);
      user.set("name", name);
      user.set("emailVisibility", true);
      user.set("verified", true);
      const rand = $security.randomString(40);
      user.set("password", rand);
      user.set("passwordConfirm", rand);
      // Google users are verified accounts — mark quiz as completed so they
      // go directly to the home screen (not the onboarding quiz flow).
      try { user.set("quizCompleted", true); } catch (_) {}
      // NOTE: avatar is a file-type field in PB; we store the Google picture URL
      // in a separate text field "avatarUrl" if it exists, or skip it.
      try { if (picture) user.set("avatarUrl", picture); } catch (_) {}
      // Capture signup source + country here (this endpoint = the mobile app;
      // the web uses native PB OAuth2 and tags itself as "web" client-side).
      // The app later refines platform to android/ios via a profile update.
      try {
        const src = clientPlatform || "app";
        user.set("platform", src);
      } catch (_) {}
      try {
        let cc = String(clientCountry || "").toUpperCase();
        if (!cc) {
          // Geolocate the request IP (ipwho.is, keyless). Inlined because PB
          // hook callbacks can't see file-level helper functions.
          let ip = "";
          try {
            const hdrs = e.requestInfo().headers || {};
            const xff = hdrs["x_forwarded_for"] || hdrs["x-forwarded-for"] || "";
            if (xff) ip = String(xff).split(",")[0].trim();
          } catch (_) {}
          if (!ip) { try { ip = e.realIP(); } catch (_) {} }
          ip = String(ip || "").trim();
          const isPrivate = !ip || ip === "::1" || ip.indexOf("127.") === 0 ||
            ip.indexOf("10.") === 0 || ip.indexOf("192.168.") === 0 || ip.indexOf("172.16.") === 0;
          if (!isPrivate) {
            try {
              const res = $http.send({ method: "GET", url: "https://ipwho.is/" + encodeURIComponent(ip) + "?fields=country_code,success", timeout: 4 });
              const j = res.json || JSON.parse(res.raw || "{}");
              if (j && j.country_code) cc = String(j.country_code).toUpperCase();
            } catch (_) {}
          }
        }
        if (cc) user.set("country", cc);
      } catch (_) {}
      // bonusQCoins is intentionally NOT set here — the onRecordAfterCreateSuccess
      // hook below grants the admin-configured signup bonus (single source of truth).
      $app.save(user);
    } else {
      let dirty = false;
      if (!user.get("name") && name) { user.set("name", name); dirty = true; }
      if (!user.get("verified")) { user.set("verified", true); dirty = true; }
      if (dirty) $app.save(user);
    }

    // ---- Issue PB auth token ----
    const token = user.newAuthToken();
    return e.json(200, {
      token: token,
      record: {
        id: user.id,
        email: user.get("email"),
        name: user.get("name"),
        avatar: user.get("avatar") || "",
        verified: user.get("verified"),
        quizCompleted: user.get("quizCompleted") || false,
      },
    });
  } catch (fatalErr) {
    // Surface any unhandled exception as a JSON error (not PB's generic 500)
    return e.json(500, { error: "hook_fatal", detail: String(fatalErr) });
  }
});

// ════════════════════════════════════════════════════════════════════
//  Q COIN ECONOMY + SIGNUP ENRICHMENT
//  Folded into this already-mounted hook file on purpose: PocketBase
//  loads one bind-mount per hook file, and adding a brand-new file
//  requires a Coolify storage change. These handlers are universal —
//  they fire for EVERY signup path (mobile /api/auth/google, website
//  native OAuth2, email/password register) so the welcome bonus and
//  the spend ledger never depend on the client doing the right thing.
// ════════════════════════════════════════════════════════════════════

// ── Signup: grant the configured bonus (idempotent) for every create path ──
//    IMPORTANT: PocketBase's JSVM runs each hook callback in its OWN isolated
//    runtime — top-level functions/consts declared in this file are NOT visible
//    inside the callback (this is exactly why typesense_sync logs "tsUpsert is
//    not defined"). So every helper used here is declared INSIDE the callback.
//    Pattern matches notify_fcm/typesense_sync: plain `return`, no e.next().
//    Spends are logged into qcoin_transactions by the website / admin panel at
//    the point of spend (they know the exact feature); this hook owns the
//    authoritative server-side "grant" row so EVERY signup is accounted for.
onRecordAfterCreateSuccess(function (e) {
  const DEFAULT_BONUS = 20;
  function readSignupBonus() {
    try {
      const rec = $app.findFirstRecordByFilter("public_config", "key = {:k}", { k: "signup_bonus_q_coins" });
      if (!rec) return DEFAULT_BONUS;
      let raw = rec.get("value");
      if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch (_) {} }
      const n = Number(raw);
      return (isFinite(n) && n >= 0) ? Math.floor(n) : DEFAULT_BONUS;
    } catch (_) { return DEFAULT_BONUS; }
  }
  function ledger(userId, type, feature, amount, balanceAfter, source, note) {
    try {
      const col = $app.findCollectionByNameOrId("qcoin_transactions");
      const rec = new Record(col);
      rec.set("userId", String(userId || ""));
      rec.set("type", String(type || ""));
      rec.set("feature", String(feature || ""));
      rec.set("amount", Number(amount) || 0);
      rec.set("balanceAfter", Number(balanceAfter) || 0);
      rec.set("source", String(source || "server"));
      if (note) rec.set("note", String(note));
      $app.save(rec);
    } catch (err) { console.log("[qcoin] ledger write failed:", err); }
  }
  function welcomeNotification(userId, language, bonusAmount) {
    try {
      const col = $app.findCollectionByNameOrId("notifications");
      const n = new Record(col);
      n.set("recipientId", userId);
      n.set("senderId", "system");
      n.set("senderName", "Qor AI");
      n.set("type", "transactional");
      if (language === "tr") {
        n.set("title", "Qor AI'a hoş geldin!");
        n.set("body", "Hesabını oluşturduğun için teşekkürler. Hediye olarak " + bonusAmount +
          " Q Coin hesabına eklendi. Premium özellikleri keşfetmek için kullanabilirsin.");
      } else {
        n.set("title", "Welcome to Qor AI!");
        n.set("body", "Thanks for joining. We added " + bonusAmount +
          " Q Coins to your account as a welcome gift. Use them to explore premium features.");
      }
      n.set("referenceId", userId);
      n.set("read", false);
      try { n.set("language", language); } catch (_) {}
      $app.save(n);
    } catch (err) { console.log("[qcoin] welcome notification failed:", err); }
  }

  try {
    const r = e.record;
    if (!r) return;
    const email = String(r.get("email") || "").toLowerCase();
    if (email.endsWith("@qorai.local")) return; // anonymous guests exempt

    const existing = Number(r.get("bonusQCoins") || 0);
    if (existing > 0) return; // already credited (or client sent a balance) — skip

    const bonus = readSignupBonus();
    if (bonus <= 0) return;

    r.set("bonusQCoins", bonus);
    try { r.set("dailyAiCreditsUsed", 0); } catch (_) {}
    $app.save(r);

    ledger(r.id, "grant", "signup_bonus", bonus, bonus, r.get("platform") || "server", "Welcome signup bonus");
    const lang = String(r.get("language") || r.get("locale") || "").toLowerCase().indexOf("tr") === 0 ? "tr" : "en";
    welcomeNotification(r.id, lang, bonus);
    console.log("[qcoin] granted " + bonus + " Q to " + r.id + " (" + email + ")");
  } catch (err) {
    console.log("[qcoin] signup grant error:", err);
  }
}, "users");
