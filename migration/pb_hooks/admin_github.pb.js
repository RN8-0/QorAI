/// <reference path="../pb_data/types.d.ts" />
// PocketBase JS hook: POST /api/admin/auth/github/exchange
// ------------------------------------------------------------
// Admin panel login flow:
// 1. Frontend authenticates with the `admins` auth collection via GitHub OAuth.
// 2. This hook validates the allowed GitHub username on the authenticated
//    `admins` record and upgrades the session to a PocketBase superuser token.
// ------------------------------------------------------------

const ADMINS_COLLECTION = "admins";

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

routerAdd("POST", "/api/admin/auth/github/exchange", (e) => {
  try {
    const authRecord = e.auth;
    if (!authRecord) {
      return e.json(401, { error: "auth_required" });
    }

    const collection = authRecord.collection();
    if (!collection || collection.name !== ADMINS_COLLECTION) {
      return e.json(403, { error: "invalid_admin_collection" });
    }

    const allowedUsername = normalizeValue(
      $os.getenv("COMPAIR_ADMIN_GITHUB_ALLOWED_USERNAME") || "RN8-0",
    );
    const githubUsername = normalizeValue(authRecord.get("githubUsername"));

    if (!githubUsername) {
      return e.json(403, { error: "missing_github_username" });
    }

    if (githubUsername !== allowedUsername) {
      return e.json(403, {
        error: "admin_not_allowed",
        username: githubUsername,
      });
    }

    const superuserEmail = normalizeValue($os.getenv("POCKETBASE_ADMIN_EMAIL"));
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
    const adminEmail = normalizeValue(authRecord.get("email")) || superuserEmail;
    const adminName =
      String(authRecord.get("name") || "").trim() ||
      githubUsername ||
      adminEmail.split("@")[0];

    return e.json(200, {
      token: token,
      record: {
        id: superuser.id,
        email: superuser.get("email"),
        collectionName: "_superusers",
      },
      adminEmail: adminEmail,
      adminName: adminName,
      githubUsername: githubUsername,
      picture: authRecord.get("githubAvatarUrl") || "",
    });
  } catch (fatalErr) {
    return e.json(500, { error: "hook_fatal", detail: String(fatalErr) });
  }
}, $apis.requireAuth(ADMINS_COLLECTION));
