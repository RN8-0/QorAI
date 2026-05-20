/// <reference path="../pb_data/types.d.ts" />
// PocketBase hook: POST /api/translate/azure
// Server-side Azure AI Translator proxy for the admin dictionary translator.
// Keeps the Azure key out of the browser bundle and lets the scraper batch
// many Turkish spec atoms into one multi-target translation request.

routerAdd("POST", "/api/translate/azure", (e) => {
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

    const from = String(body.from || "tr").trim().toLowerCase() || "tr";
    const targets = normalizeLangs(body.to || body.targets);
    if (!targets.length) return e.json(400, { error: "targets_required" });

    let chars = 0;
    for (let i = 0; i < texts.length; i++) chars += texts[i].length;
    const requestChars = chars * targets.length;
    if (requestChars > 50000) {
      return e.json(400, { error: "request_too_large", chars: requestChars, max: 50000 });
    }

    const key = String(
      $os.getenv("AZURE_TRANSLATOR_KEY") ||
      $os.getenv("QORAI_AZURE_TRANSLATOR_KEY") ||
      readConfigValue("azure_translator_key") ||
      ""
    ).trim();
    if (!key) return e.json(503, { error: "azure_not_configured" });

    const region = String(
      $os.getenv("AZURE_TRANSLATOR_REGION") ||
      $os.getenv("QORAI_AZURE_TRANSLATOR_REGION") ||
      readConfigValue("azure_translator_region") ||
      ""
    ).trim();

    let qs = "api-version=3.0&from=" + encodeURIComponent(from);
    for (let i = 0; i < targets.length; i++) qs += "&to=" + encodeURIComponent(targets[i]);

    const headers = {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    if (region && region.toLowerCase() !== "global") {
      headers["Ocp-Apim-Subscription-Region"] = region;
    }

    const res = $http.send({
      url: "https://api.cognitive.microsofttranslator.com/translate?" + qs,
      method: "POST",
      headers: headers,
      body: JSON.stringify(texts.map((text) => ({ Text: text }))),
      timeout: 20,
    });

    const payload = res.json != null ? res.json : JSON.parse(res.raw || "null");
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return e.json(res.statusCode || 502, {
        error: "azure_translate_failed",
        detail: payload || res.raw || "",
      });
    }

    const translations = {};
    for (let i = 0; i < texts.length; i++) {
      const row = payload && payload[i] ? payload[i] : {};
      const entry = {};
      const tx = Array.isArray(row.translations) ? row.translations : [];
      for (let j = 0; j < tx.length; j++) {
        const lang = String(tx[j].to || "").toLowerCase();
        if (lang) entry[lang] = String(tx[j].text || "");
      }
      translations[texts[i]] = entry;
    }

    return e.json(200, {
      provider: "azure",
      from: from,
      to: targets,
      count: texts.length,
      chars: requestChars,
      translations: translations,
    });
  } catch (err) {
    return e.json(500, { error: "hook_fatal", detail: String(err) });
  }
});
