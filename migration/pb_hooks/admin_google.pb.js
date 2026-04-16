/// <reference path="../pb_data/types.d.ts" />
// PocketBase JS hook: POST /api/admin/auth/google
// ------------------------------------------------------------
// Verifies a Google ID token, restricts access to the two allowed
// admin emails, then issues a PocketBase superuser auth token that
// the static admin panel can store in PocketBase authStore.
// ------------------------------------------------------------

routerAdd("POST", "/api/admin/auth/google", (e) => {
  try {
    const bodyModel = new DynamicModel({ idToken: "", audience: "" });
    let bindErr = null;
    try { e.bindBody(bodyModel); } catch (err) { bindErr = String(err); }

    let idToken = bodyModel.idToken;
    let audienceOverride = bodyModel.audience;

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

    const ALLOWED_AUDS = [
      "510980756238-budtd0gdrlk91jmim11frucvue5muhbg.apps.googleusercontent.com",
      "510980756238-369d7b3tst5k4aue0niai0g5tm7090c1.apps.googleusercontent.com",
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

    const adminEmail = String(info.email).toLowerCase();
    const allowedAdmins = [
      "arainunger@gmail.com",
      "araingamex@gmail.com",
    ];
    if (allowedAdmins.indexOf(adminEmail) === -1) {
      return e.json(403, { error: "admin_not_allowed", email: adminEmail });
    }

    const superuserEmail = String($os.getenv("POCKETBASE_ADMIN_EMAIL") || "").toLowerCase();
    if (!superuserEmail) {
      return e.json(500, { error: "missing_superuser_env" });
    }

    let superuser = null;
    try {
      superuser = $app.findFirstRecordByFilter("_superusers", "email = {:email}", {
        email: superuserEmail,
      });
    } catch (err) {
      return e.json(500, { error: "superuser_lookup_failed", detail: String(err) });
    }

    if (!superuser) {
      return e.json(500, { error: "superuser_not_found", email: superuserEmail });
    }

    const token = superuser.newAuthToken();
    return e.json(200, {
      token: token,
      record: {
        id: superuser.id,
        email: superuser.get("email"),
        collectionName: "_superusers",
      },
      adminEmail: adminEmail,
      adminName: info.name || info.given_name || adminEmail.split("@")[0],
      picture: info.picture || "",
    });
  } catch (fatalErr) {
    return e.json(500, { error: "hook_fatal", detail: String(fatalErr) });
  }
});
