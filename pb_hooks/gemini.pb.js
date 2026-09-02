/// <reference path="../pb_data/types.d.ts" />
// PocketBase JS hook: /api/ai/gemini proxy
// ------------------------------------------------------------
// Flutter / web / admin -> PocketBase -> Gemini AI Studio
// - Key never leaves the server (stored in GEMINI_API_KEY env)
// - Per-user rate limit: 60 req / 5 min  (unauth: 20 req / 5 min by IP)
// - Payload is passed through mostly verbatim to `generateContent`
//
// Request body shape:
//   { model?: string, contents: [...], generationConfig?: {...}, systemInstruction?: {...} }
//
// Response: the raw Gemini JSON (or {error} with the same status)
// ------------------------------------------------------------

routerAdd("POST", "/api/ai/gemini", (e) => {
  const GEMINI_KEY = $os.getenv("GEMINI_API_KEY");
  if (!GEMINI_KEY) {
    return e.json(500, { error: "GEMINI_API_KEY not configured on server" });
  }

  // ---- Rate limiting (in-memory, per-process) --------------------
  // NOTE: PB is single-process, so this is fine. If you scale out,
  // swap _rlBuckets for a KV table.
  const WIN_MS = 5 * 60 * 1000;
  const LIMIT_AUTH = 60;
  const LIMIT_ANON = 20;

  if (!$app.store().has("_gemRl")) $app.store().set("_gemRl", {});
  const buckets = $app.store().get("_gemRl");

  const authRecord = e.auth;
  const key = authRecord ? `u:${authRecord.id}` : `ip:${e.realIP()}`;
  const limit = authRecord ? LIMIT_AUTH : LIMIT_ANON;
  const now = Date.now();
  const b = buckets[key] || { start: now, count: 0 };
  if (now - b.start > WIN_MS) { b.start = now; b.count = 0; }
  b.count++;
  buckets[key] = b;
  if (b.count > limit) {
    return e.json(429, {
      error: "rate_limited",
      message: `Max ${limit} requests per 5 min. Try later.`,
    });
  }

  // ---- Parse + validate input ------------------------------------
  let body;
  try { body = e.requestInfo().body; } catch (_) { body = null; }
  if (!body || !body.contents) {
    return e.json(400, { error: "missing 'contents' in body" });
  }

  const model = (body.model || "gemini-2.5-flash").replace(/[^a-z0-9.\-]/gi, "");
  const upstreamBody = {
    contents: body.contents,
  };
  if (body.generationConfig) upstreamBody.generationConfig = body.generationConfig;
  if (body.systemInstruction) upstreamBody.systemInstruction = body.systemInstruction;
  if (body.safetySettings) upstreamBody.safetySettings = body.safetySettings;
  if (body.tools) upstreamBody.tools = body.tools;

  // ---- Upstream call ---------------------------------------------
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
  try {
    const res = $http.send({
      method: "POST",
      url: url,
      body: JSON.stringify(upstreamBody),
      headers: { "Content-Type": "application/json" },
      timeout: 60, // seconds
    });
    return e.json(res.statusCode, res.json || JSON.parse(res.raw || "{}"));
  } catch (err) {
    // ANAHTAR GUNLUGE YAZILMAZ.
    // Olculdu 2026-09-02: Go'nun hata metni istegin TAM URL'sini tasiyor ve
    // URL'de `?key=...` var. Yani her yukari-akis hatasi Gemini API
    // anahtarini konteyner gunlugune duz metin olarak basiyordu
    // (`docker logs` ile okunabilir durumdaydi).
    var temiz = String(err).replace(/([?&]key=)[^&"\s]+/gi, "$1[REDACTED]");
    console.log("[gemini proxy] upstream error:", temiz);
    return e.json(502, { error: "upstream_failed", detail: temiz });
  }
});

// Optional: lightweight health check so Flutter can detect downtime
routerAdd("GET", "/api/ai/health", (e) => {
  return e.json(200, {
    ok: true,
    hasKey: !!$os.getenv("GEMINI_API_KEY"),
    ts: new Date().toISOString(),
  });
});