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
  let body;
  try { body = e.requestInfo().body; } catch (_) { body = null; }
  if (!body || !body.idToken) {
    return e.json(400, { error: "missing 'idToken' in body" });
  }

  // Verify the ID token via Google's tokeninfo endpoint.
  // This is a free, unauthenticated Google endpoint that cryptographically
  // validates the signature and expiry and returns the payload.
  let info;
  try {
    const res = $http.send({
      method: "GET",
      url: "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(body.idToken),
      timeout: 15,
    });
    if (res.statusCode !== 200) {
      return e.json(401, { error: "invalid_token", detail: res.raw });
    }
    info = res.json || JSON.parse(res.raw || "{}");
  } catch (err) {
    return e.json(502, { error: "tokeninfo_failed", detail: String(err) });
  }

  // Allowed audiences — web, android (derived from SHA1/package), ios.
  // Any Google-signed id_token whose `aud` matches one of these is valid.
  const ALLOWED_AUDS = [
    "510980756238-budtd0gdrlk91jmim11frucvue5muhbg.apps.googleusercontent.com", // web
    "510980756238-369d7b3tst5k4aue0niai0g5tm7090c1.apps.googleusercontent.com", // ios
  ];
  if (body.audience && ALLOWED_AUDS.indexOf(body.audience) === -1) {
    ALLOWED_AUDS.push(body.audience);
  }
  if (ALLOWED_AUDS.indexOf(info.aud) === -1) {
    return e.json(401, { error: "audience_mismatch", aud: info.aud });
  }
  if (info.iss !== "https://accounts.google.com" && info.iss !== "accounts.google.com") {
    return e.json(401, { error: "issuer_mismatch", iss: info.iss });
  }
  if (!info.email || info.email_verified !== "true" && info.email_verified !== true) {
    return e.json(401, { error: "email_not_verified" });
  }

  // Find-or-create user.
  const email = String(info.email).toLowerCase();
  const name = info.name || info.given_name || email.split("@")[0];
  const picture = info.picture || "";

  let user;
  try {
    user = $app.findFirstRecordByFilter("users", `email = "${email.replace(/"/g, '\\"')}"`);
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
    // PB requires a password; generate a random one the user can't know.
    const rand = $security.randomString(40);
    user.set("password", rand);
    user.set("passwordConfirm", rand);
    if (picture) user.set("avatar", picture);
    $app.save(user);
  } else {
    let dirty = false;
    if (!user.get("name") && name) { user.set("name", name); dirty = true; }
    if (!user.get("verified")) { user.set("verified", true); dirty = true; }
    if (dirty) $app.save(user);
  }

  // Issue a PB auth token for this user.
  const token = user.newAuthToken();
  return e.json(200, {
    token: token,
    record: {
      id: user.id,
      email: user.get("email"),
      name: user.get("name"),
      avatar: user.get("avatar") || "",
      verified: user.get("verified"),
    },
  });
});
