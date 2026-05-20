/// <reference path="../pb_data/types.d.ts" />
// PocketBase hook: POST /api/translate/google
// Server-side Google Cloud Translation Basic proxy for the admin dictionary
// translator. Uses a simple API key stored in public_config or env.

routerAdd("POST", "/api/translate/google", (e) => {
  function readConfigValue(key) {
    try {
      const rec = $app.findFirstRecordByData("public_config", "key", key);
      if (!rec) return "";
      const raw = rec.get("value");
      if (typeof raw !== "string") return raw == null ? "" : String(raw);
      try {
        const parsed = JSON.parse(raw);
        return parsed == null ? "" : String(parsed);
      } catch (_) {
        return raw;
      }
    } catch (_) {
      return "";
    }
  }

  function normalizeLangs(value) {
    const allowed = {
      en: true, de: true, es: true, fr: true, it: true, ja: true,
      nl: true, pl: true, pt: true, sv: true, ar: true, tr: true,
    };
    const arr = Array.isArray(value) ? value : String(value || "").split(",");
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const lang = String(arr[i] || "").trim().toLowerCase();
      if (allowed[lang] && out.indexOf(lang) < 0) out.push(lang);
    }
    return out.slice(0, 11);
  }

  try {
    if (!e.auth) return e.json(401, { error: "auth_required" });

    const body = e.requestInfo().body || {};
    const textsRaw = Array.isArray(body.texts) ? body.texts : [];
    const texts = [];
    for (let i = 0; i < textsRaw.length; i++) {
      const text = String(textsRaw[i] || "").trim();
      if (text) texts.push(text);
    }
    if (!texts.length) return e.json(400, { error: "texts_required" });
    if (texts.length > 100) return e.json(400, { error: "too_many_texts", max: 100 });

    const source = String(body.from || "tr").trim().toLowerCase() || "tr";
    const targets = normalizeLangs(body.to || body.targets);
    if (!targets.length) return e.json(400, { error: "targets_required" });

    let chars = 0;
    for (let i = 0; i < texts.length; i++) chars += texts[i].length;
    const requestChars = chars * targets.length;
    if (requestChars > 50000) {
      return e.json(400, { error: "request_too_large", chars: requestChars, max: 50000 });
    }

    const key = String(
      $os.getenv("GOOGLE_TRANSLATE_API_KEY") ||
      $os.getenv("QORAI_GOOGLE_TRANSLATE_API_KEY") ||
      readConfigValue("google_translate_api_key") ||
      ""
    ).trim();
    if (!key) return e.json(503, { error: "google_translate_not_configured" });

    const translations = {};
    for (let i = 0; i < texts.length; i++) translations[texts[i]] = {};

    for (let t = 0; t < targets.length; t++) {
      const target = targets[t];
      const res = $http.send({
        url: "https://translation.googleapis.com/language/translate/v2?key=" + encodeURIComponent(key),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          q: texts,
          source: source,
          target: target,
          format: "text",
        }),
        timeout: 20,
      });

      const payload = res.json != null ? res.json : JSON.parse(res.raw || "null");
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return e.json(res.statusCode || 502, {
          error: "google_translate_failed",
          target: target,
          detail: payload || res.raw || "",
        });
      }

      const rows = payload && payload.data && Array.isArray(payload.data.translations)
        ? payload.data.translations
        : [];
      for (let i = 0; i < texts.length; i++) {
        translations[texts[i]][target] = String((rows[i] && rows[i].translatedText) || "");
      }
    }

    return e.json(200, {
      provider: "google",
      from: source,
      to: targets,
      count: texts.length,
      chars: requestChars,
      translations: translations,
    });
  } catch (err) {
    return e.json(500, { error: "hook_fatal", detail: String(err) });
  }
});
