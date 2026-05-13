/// pb_hooks/welcome_bonus.pb.js
/// PocketBase hook: when a new user record is created, grant the one-time
/// signup bonus Q Coins (configurable via public_config.signup_bonus_q_coins,
/// default 20) and create a welcome notification.
///
/// - Lifetime credit model: bonusQCoins is the user's only spendable balance
///   for free tier; there is no daily refresh.
/// - Anonymous guests (email ends with @qorai.local) are exempt.
/// - Idempotent: only credits when bonusQCoins is currently 0/unset to avoid
///   double-crediting if a record is re-saved by another hook.

const DEFAULT_SIGNUP_BONUS = 20;

function _readSignupBonusFromConfig() {
  try {
    const rec = $app.findFirstRecordByData("public_config", "key", "signup_bonus_q_coins");
    if (!rec) return DEFAULT_SIGNUP_BONUS;
    const raw = rec.get("value");
    // PB stores config values as JSON-encoded strings (e.g. "20" or 20).
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

function _detectLanguage(record) {
  try {
    const raw = String(record.get("language") || record.get("locale") || "").toLowerCase();
    return raw.indexOf("tr") === 0 ? "tr" : "en";
  } catch (_) {
    return "en";
  }
}

function _createWelcomeNotification(userId, language, bonusAmount) {
  try {
    const notifCol = $app.findCollectionByNameOrId("notifications");
    const notif = new Record(notifCol);
    notif.set("recipientId", userId);
    notif.set("senderId", "system");
    notif.set("senderName", "Qor AI");
    notif.set("type", "transactional");
    if (language === "tr") {
      notif.set("title", "Qor AI'a hoş geldin!");
      notif.set(
        "body",
        "Hesabını oluşturduğun için teşekkürler. Hediye olarak " +
          bonusAmount +
          " Q Coin hesabına eklendi. Premium özellikleri keşfetmek için kullanabilirsin."
      );
    } else {
      notif.set("title", "Welcome to Qor AI!");
      notif.set(
        "body",
        "Thanks for joining. We added " +
          bonusAmount +
          " Q Coins to your account as a welcome gift. Use them to explore premium features."
      );
    }
    notif.set("referenceId", userId);
    notif.set("read", false);
    try { notif.set("language", language); } catch (_) {}
    $app.save(notif);
  } catch (err) {
    console.log("[welcome_bonus] Could not create notification:", err);
  }
}

onRecordAfterCreateSuccess(function (e) {
  try {
    const record = e.record;
    if (!record) return;

    const email = String(record.get("email") || "").toLowerCase();
    if (email.endsWith("@qorai.local")) {
      // Anonymous guests are exempt from the signup bonus.
      return;
    }

    // Idempotency guard: only grant if the new record has no bonus yet.
    const existingBonus = Number(record.get("bonusQCoins") || 0);
    if (existingBonus > 0) {
      console.log("[welcome_bonus] Skipping " + record.id + " — already has bonusQCoins=" + existingBonus);
      return;
    }

    const bonus = _readSignupBonusFromConfig();
    if (bonus <= 0) {
      console.log("[welcome_bonus] Bonus configured as 0 — skipping");
      return;
    }

    record.set("bonusQCoins", bonus);
    // Daily counter fields are zeroed for back-compat with older clients.
    try { record.set("dailyAiCreditsUsed", 0); } catch (_) {}
    $app.save(record);

    const language = _detectLanguage(record);
    _createWelcomeNotification(record.id, language, bonus);

    console.log("[welcome_bonus] Granted " + bonus + " Q Coins to " + record.id + " (" + email + ")");
  } catch (err) {
    console.log("[welcome_bonus] Hook error:", err);
  }
}, "users");
