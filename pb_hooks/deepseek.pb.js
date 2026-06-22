/// <reference path="../pb_data/types.d.ts" />
// PocketBase JS hook: /api/ai/deepseek proxy
// ------------------------------------------------------------
// Flutter -> PocketBase -> DeepSeek API
// - Key never leaves the server (stored in DEEPSEEK_API_KEY env)
// - Per-user rate limit: 300 req / 5 min  (unauth: 60 req / 5 min by IP)
// - OpenAI-compatible API format
// ------------------------------------------------------------

routerAdd("POST", "/api/ai/deepseek", (e) => {
  const DS_KEY = $os.getenv("DEEPSEEK_API_KEY");
  if (!DS_KEY) {
    return e.json(500, { error: "DEEPSEEK_API_KEY not configured on server" });
  }

  // ---- Rate limiting ------------------------------------------------
  const WIN_MS = 5 * 60 * 1000;
  const LIMIT_AUTH = 300;
  const LIMIT_ANON = 60;

  if (!$app.store().has("_dsRl")) $app.store().set("_dsRl", {});
  const buckets = $app.store().get("_dsRl");

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

  // ---- Parse + validate input ----------------------------------------
  let body;
  try { body = e.requestInfo().body; } catch (_) { body = null; }
  if (!body || !body.messages) {
    return e.json(400, { error: "missing 'messages' in body" });
  }

  const upstreamBody = {
    model: body.model || "deepseek-chat",
    messages: body.messages,
  };
  if (body.temperature !== undefined) upstreamBody.temperature = body.temperature;
  if (body.max_tokens !== undefined) upstreamBody.max_tokens = body.max_tokens;
  if (body.response_format) upstreamBody.response_format = body.response_format;
  if (body.stream !== undefined) upstreamBody.stream = body.stream;

  // ---- Upstream call -------------------------------------------------
  const url = "https://api.deepseek.com/chat/completions";
  try {
    const res = $http.send({
      method: "POST",
      url: url,
      body: JSON.stringify(upstreamBody),
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DS_KEY}`,
      },
      timeout: 90,
    });
    return e.json(res.statusCode, res.json || JSON.parse(res.raw || "{}"));
  } catch (err) {
    console.log("[deepseek proxy] upstream error:", err);
    return e.json(502, { error: "upstream_failed", detail: String(err) });
  }
});

// Health check
routerAdd("GET", "/api/ai/deepseek/health", (e) => {
  return e.json(200, {
    ok: true,
    hasKey: !!$os.getenv("DEEPSEEK_API_KEY"),
    ts: new Date().toISOString(),
  });
});