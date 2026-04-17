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
    const bodyModel = new DynamicModel({ idToken: "", audience: "" });
    let bindErr = null;
    try { e.bindBody(bodyModel); } catch (err) { bindErr = String(err); }
    let idToken = bodyModel.idToken;
    let audienceOverride = bodyModel.audience;
    // fallback: requestInfo().body
    if (!idToken) {
      try {
        const rb = e.requestInfo().body;
        if (rb) {
          idToken = rb.idToken || rb["idToken"] || "";
          audienceOverride = rb.audience || rb["audience"] || "";
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
      // New Google users must complete the onboarding quiz before using the app.
      // quizCompleted defaults to false — do not override it here.
      // NOTE: avatar is a file-type field in PB; we store the Google picture URL
      // in a separate text field "avatarUrl" if it exists, or skip it.
      try { if (picture) user.set("avatarUrl", picture); } catch (_) {}
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
