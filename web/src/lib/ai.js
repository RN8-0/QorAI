// ═══════════════════════════════════════════════════════════════
//  Qor AI — app-parity AI routing over the PocketBase proxies.
//
//  Mirrors the mobile app exactly:
//   · Link/subscription analysis flows use the GEMINI proxy first
//     (GeminiService in the app: /api/ai/gemini, gemini-2.5-flash,
//     retry with backoff on 429/5xx — _shouldFallbackModel).
//   · If Gemini stays rate-limited/down, we fall back to the DeepSeek
//     proxy (/api/ai/deepseek, deepseek-chat) — the app's own
//     "primary text intelligence" service — so the user gets a result
//     instead of "analysis failed".
// ═══════════════════════════════════════════════════════════════

import { PB_URL, pb } from './pocketbase';

// ── Admin prompt override (shared with the mobile app) ──────────────
// Reads PB `public_config.ai_prompts[key]` — the SAME keys the app's
// GeminiService.adminPrompt uses — so the admin panel can update a prompt for
// BOTH web and app WITHOUT shipping a new build. Falls back to the hardcoded
// default when there is no override (or PB is unreachable). Cached per session
// (5 min) so we don't refetch on every AI call.
let _aiPromptsCache = null;
let _aiPromptsAt = 0;
async function loadAiPrompts() {
  const now = Date.now();
  if (_aiPromptsCache && now - _aiPromptsAt < 5 * 60 * 1000) return _aiPromptsCache;
  try {
    const rec = await pb.collection('public_config').getFirstListItem('key = "ai_prompts"');
    const val = rec && rec.value;
    _aiPromptsCache = val && typeof val === 'object' ? val : {};
  } catch {
    _aiPromptsCache = {};
  }
  _aiPromptsAt = now;
  return _aiPromptsCache;
}
export async function adminPrompt(key, fallback) {
  try {
    const prompts = await loadAiPrompts();
    const v = prompts ? prompts[key] : null;
    const s = (v == null ? '' : String(v)).trim();
    if (s.length >= 40) return s;
  } catch { /* fall through to hardcoded default */ }
  return fallback;
}

const GEMINI_URL = `${PB_URL}/api/ai/gemini`;
const GEMINI_MODEL = 'gemini-2.5-flash'; // AppConstants.geminiModel
const DEEPSEEK_URL = `${PB_URL}/api/ai/deepseek`;
const DEEPSEEK_MODEL = 'deepseek-chat';
const DEEPSEEK_MAX_OUTPUT = 8192; // deepseek-chat (V3) output cap

// Full language set (parity with the app's AiReportService._langNames and
// AiAnalysis.jsx). Previously only tr/de were mapped and EVERY other language
// silently collapsed to English — so es/fr/it/pt/ru/… web users got English
// chat + grounded research even though the report honored their language.
const LANG_NAMES = {
  tr: 'Turkish', en: 'English', de: 'German', es: 'Spanish', fr: 'French',
  it: 'Italian', pt: 'Portuguese', ru: 'Russian', nl: 'Dutch', pl: 'Polish',
  sv: 'Swedish', ja: 'Japanese', ar: 'Arabic',
};
function languageLabel(code = 'en') {
  const key = String(code || 'en').slice(0, 2).toLowerCase();
  return LANG_NAMES[key] || 'English';
}

// Mirrors the mobile app's Qor AI chat persona so the web gives the same voice,
// scope and rules as the app.
const BASE_CHAT_PROMPT =
  'You are Qor AI — a friendly, sharp shopping and product advisor for ALL product ' +
  'categories (technology, audio, photo, home, fashion and more) on qorai.net.\n' +
  '- KEEP IT SHORT AND SCANNABLE. Lead with a one- or two-sentence direct answer, then at most 3-4 short bullets ONLY if they truly add value. No long essays, no restating the question, no filler. A simple question gets a simple 1-2 sentence reply.\n' +
  '- BE SPECIFIC, NOT GENERIC. When recommending, name real, current products/models (e.g. "Lenovo LOQ 15 (RTX 4060)") — NEVER answer with vague component advice like "look for an i7 with an RTX 4050". Give 2-3 concrete named picks, each with a one-line reason and, when the context provides it, an approximate current price. If you truly cannot name specific models, say so plainly instead of padding with generic advice.\n' +
  '- Any product, comparison, page, "QOR CATALOG DATA" or "LIVE WEB RESEARCH" context you are given is the CURRENT, live truth — trust it over your older memory. If a product appears there it EXISTS; NEVER say a product does not exist, is fake, or has not launched when it is in that context or in the web research.\n' +
  '- With QOR CATALOG DATA: answer from those exact Qor specs and the listed Qor price, and prefer recommending those on-site products (you may share their Qor page link). With LIVE WEB RESEARCH: use it for current launch status, specs, current prices and specific model names. If neither is given and you are unsure whether something exists or its current status, do NOT guess "not released" — say plainly what you are unsure about and what to check on the store/official page.\n' +
  '- Recommend with honest trade-offs: who it is for, who should skip it, and one or two alternatives when useful — briefly.\n' +
  '- Prices/availability change: never invent an exact price; use the Qor price or the LIVE WEB RESEARCH price when provided, otherwise say to check the local store.\n' +
  '- Plain text only: no Markdown headings (#, ##), no code fences, no tables, no raw JSON. Use short "Label:" lines and normal sentences or "- " bullets.\n' +
  '- Never mention backend providers, model names or internal tooling; if asked what powers you, answer as Qor AI.\n' +
  '- Address the person directly ("you" / "sen" / "siz"), never "the user".';

function chatSystemPrompt(language = 'en', groundingContext = '', locale = {}) {
  const langName = languageLabel(language);
  const today = new Date().toISOString().slice(0, 10);
  const country = String(locale.country || '').toUpperCase();
  const currency = String(locale.currency || '').toUpperCase();
  const marketLine = country
    ? `\n- LOCAL MARKET: The person is in ${country}${currency ? ` and shops in ${currency}` : ''}. Whenever you mention a price, budget or value, use ${currency || 'their local currency'} and that market's typical pricing — NEVER quote another country's currency (e.g. do not give Turkish Lira to a non-Turkish user, or USD to a Turkish user). If you don't know the local price, say it should be checked on the local store instead of guessing in the wrong currency.`
    : '';
  return `${BASE_CHAT_PROMPT}
- TODAY'S DATE is ${today}. Your own training knowledge is older than this and is stale for recent products, launches, subscription plans and prices. NEVER say something "doesn't exist", "isn't out yet", "hasn't launched" or "is only a rumor" from your own memory — a phone/product that would normally ship by ${today} is already out. Trust the QOR CATALOG DATA and LIVE WEB RESEARCH context for what is real and current; if neither covers it, say you'd verify the latest status rather than asserting it is unreleased.
- SITE LANGUAGE: Reply only in ${langName}. Keep official product and brand names as-is.
- If the person writes in another language, still answer in ${langName} because the site language is ${langName}.${marketLine}
${groundingContext ? `\nQOR CATALOG / PAGE CONTEXT:\n${groundingContext}` : ''}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Transient failures worth falling back on — mirrors the app's
// _shouldFallbackModel (404/429/5xx + quota wording).
function transientStatus(status) {
  return status === 404 || status === 429 || status === 500
    || status === 502 || status === 503 || status === 504;
}
// Worth RETRYING the SAME provider: only genuine server-side hiccups (5xx).
// A 429/404 means "this key is rate-limited / route missing" — retrying the
// same provider just burns 2-4s before the inevitable fallback, so we move to
// the next provider immediately instead. (The Gemini free key is frequently
// 429, so this is what made every AI call feel slow and flaky.)
function retryableStatus(status) {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

async function fetchJson(url, body, timeoutMs = 90000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // Forward the PocketBase auth token so the AI proxy can identify the signed-in
  // user and apply the higher per-user rate limit (instead of the stricter
  // anon-by-IP bucket) and attribute usage. Anonymous visitors still work — the
  // proxy just falls back to the IP bucket when there's no token. PB expects the
  // raw token in the Authorization header (no "Bearer" prefix).
  const headers = { 'Content-Type': 'application/json' };
  try { if (pb && pb.authStore && pb.authStore.token) headers.Authorization = pb.authStore.token; } catch (_) { /* ignore */ }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return res;
  } finally { clearTimeout(timer); }
}

// ── Gemini proxy (app's primary for link / subscription analysis) ──
async function geminiOnce({ system, messages, maxOutputTokens, temperature, tools, jsonMode, timeoutMs }) {
  const generationConfig = { temperature, maxOutputTokens, thinkingConfig: { thinkingBudget: 0 } };
  if (jsonMode) generationConfig.responseMimeType = 'application/json';
  const body = {
    model: GEMINI_MODEL,
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }],
    })),
    generationConfig,
  };
  if (Array.isArray(tools) && tools.length) body.tools = tools;
  const res = await fetchJson(GEMINI_URL, body, timeoutMs);
  if (!res.ok) {
    const err = new Error(`gemini ${res.status}`);
    err.transient = transientStatus(res.status);
    err.retryable = retryableStatus(res.status);
    throw err;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) { const e = new Error('gemini empty'); e.transient = true; throw e; }
  return text.trim();
}

// ── DeepSeek proxy (app's "primary text intelligence" — our fallback) ──
async function deepseekOnce({ system, messages, maxOutputTokens, temperature, jsonMode, timeoutMs }) {
  const body = {
    model: DEEPSEEK_MODEL,
    messages: [{ role: 'system', content: system }, ...messages],
    max_tokens: Math.min(maxOutputTokens, DEEPSEEK_MAX_OUTPUT),
    temperature,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const res = await fetchJson(DEEPSEEK_URL, body, timeoutMs);
  if (!res.ok) {
    const err = new Error(`deepseek ${res.status}`);
    err.transient = transientStatus(res.status);
    err.retryable = retryableStatus(res.status);
    throw err;
  }
  const data = await res.json();
  if (data && data.error) {
    const e = new Error(`deepseek ${data.error}`);
    e.transient = String(data.error) === 'rate_limited';
    throw e;
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) { const e = new Error('deepseek empty'); e.transient = true; throw e; }
  return content.trim();
}

// App-parity routing: Gemini first (2 tries with a short backoff, like the app's
// retry loop), then DeepSeek (2 tries). Throws only when both providers fail.
async function aiRequest({
  system,
  messages,
  maxOutputTokens = 4096,
  temperature = 0.7,
  jsonMode = false,
  tools = null,
  timeoutMs = 90000,
  // TOPLAM SÜRE BÜTÇESİ. Her denemenin kendi zaman aşımı vardı ama TOPLAM bir
  // sınır yoktu: yavaş (hata vermeyen, sadece geç dönen) bir sağlayıcıda tek
  // çağrı 4 sağlayıcı denemesi × 90 sn = 6 dakikaya kadar uzayabiliyordu ve
  // kullanıcı "analiz hiç bitmiyor, sürekli dönüyor" durumunda kalıyordu.
  budgetMs = null,
}) {
  const deadline = Date.now() + (budgetMs || timeoutMs * 2);
  const left = () => deadline - Date.now();
  let lastErr;
  // Gemini first (app parity). Retry the SAME provider only on a true 5xx; on a
  // 429/404 (the common case for the free key) fall straight through to DeepSeek
  // instead of sleeping 2s for nothing.
  for (let i = 0; i < 2; i++) {
    if (left() <= 2000) break;
    try {
      return await geminiOnce({
        system, messages, maxOutputTokens, temperature, tools, jsonMode,
        timeoutMs: Math.min(timeoutMs, left()),
      });
    } catch (e) { lastErr = e; if (!e.retryable || i === 1) break; await sleep(1200); }
  }
  // DeepSeek — the unlimited json_object workhorse — does the heavy lifting.
  for (let i = 0; i < 2; i++) {
    if (left() <= 2000) break;
    try {
      return await deepseekOnce({
        system, messages, maxOutputTokens, temperature, jsonMode,
        timeoutMs: Math.min(timeoutMs, left()),
      });
    } catch (e) { lastErr = e; if (!e.retryable || i === 1) break; await sleep(1200); }
  }
  throw lastErr || new Error('AI failed');
}

async function groundedGeminiRequest({
  system,
  user,
  maxOutputTokens = 4096,
  temperature = 0.2,
  timeoutMs = 35000,
}) {
  let lastErr;
  const messages = [{ role: 'user', content: user }];
  // Grounded search is Gemini-only (DeepSeek has no Google Search tool) and it is
  // now the CRITICAL path for current facts (specific models, launch status,
  // prices), so it is worth a couple of retries. The free key bursts 429s, so we
  // retry those too (short backoff) — a burst usually clears within a second. We
  // still cap the tries so a genuinely exhausted quota fails fast enough that the
  // chat can fall back to catalog options instead of hanging.
  for (let i = 0; i < 3; i++) {
    try {
      return await geminiOnce({
        system,
        messages,
        maxOutputTokens,
        temperature,
        tools: [{ googleSearch: {} }],
        jsonMode: false,
        timeoutMs,
      });
    } catch (e) {
      lastErr = e;
      // Retry on any transient (429/404/5xx); give up on hard errors.
      if (!e.transient || i === 2) break;
      await sleep(700 + i * 500);
    }
  }
  throw lastErr || new Error('grounded search failed');
}

// history: [{ role: 'user' | 'model', text: string }]
export async function askQorAi(history, opts = {}) {
  const messages = history.map((m) => ({
    role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user',
    content: m.text,
  }));
  return aiRequest({
    system: chatSystemPrompt(opts.language || opts.lang || 'en', opts.context || '', {
      country: opts.country || '',
      currency: opts.currency || '',
    }),
    messages,
    maxOutputTokens: 4096,
    temperature: 0.68,
  });
}

// Custom system + user — used by the quiz / link / subscription engines.
export async function askQorAiRaw({
  system,
  user,
  maxOutputTokens = 4096,
  temperature = 0.7,
  jsonMode = false,
  tools = null,
  timeoutMs,
  budgetMs,
}) {
  return aiRequest({
    system,
    messages: [{ role: 'user', content: user }],
    maxOutputTokens,
    temperature,
    jsonMode,
    tools,
    timeoutMs,
    budgetMs,
  });
}

export async function askQorAiGrounded(prompt, opts = {}) {
  const lang = opts.language || opts.lang || 'en';
  const today = new Date().toISOString().slice(0, 10);
  return groundedGeminiRequest({
    system:
      `You are Qor AI's web research assistant. Current date: ${today}. ` +
      'You MUST use the provided Google Search grounding tool for product status, official specs, market availability, review/community sentiment, and price-cycle signals. ' +
      'Do not answer from model memory for launch status or availability. If search evidence is thin, say exactly what is uncertain instead of guessing. ' +
      `Reply in ${languageLabel(lang)}. Summarize evidence, source types, current market status, and uncertainty. ` +
      'Do not invent quotes, exact prices, or review counts.',
    user: prompt,
    maxOutputTokens: opts.maxOutputTokens || 4096,
    temperature: 0.2,
    // Web research is optional context — the caller proceeds without it on
    // failure. Cap it tight so a slow/hanging grounded search can't strand the
    // user on the "running web research" step; the report stage keeps the full
    // timeout. Caller may override.
    timeoutMs: opts.timeoutMs || 35000,
  });
}

function cleanupJsonText(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
}

function firstBalancedJsonObject(text) {
  const src = String(text || '');
  const start = src.indexOf('{');
  if (start < 0) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

// KESİLMİŞ JSON KURTARMA. Derin analiz raporları büyük: model çıktı sınırına
// dayandığında JSON yarıda kesiliyor ve TÜM rapor çöpe gidiyordu (kullanıcı
// "analiz başarısız" görüyor). Burada açık kalan string kapatılır, yarım kalan
// son alan atılır ve açık parantezler kapatılır — böylece yazılabilmiş
// bölümler kurtarılır. Eksik alanları çağıran taraf zaten tolere ediyor.
function repairTruncatedJson(src) {
  const s = String(src || '');
  const start = s.indexOf('{');
  if (start < 0) return '';
  const stack = [];
  let inString = false;
  let escaped = false;
  // En son BÜTÜN değerin bittiği yer + o andaki açık parantezler. Yalnız string
  // dışındayken güncellenir, yani kesim noktası hiçbir zaman metnin ortasına
  // düşmez.
  let cut = -1;
  let cutStack = null;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') {
      stack.push(ch === '{' ? '}' : ']');
    } else if (ch === '}' || ch === ']') {
      stack.pop();
      cut = i + 1;
      cutStack = [...stack];
    } else if (ch === ',') {
      cut = i; // virgül DAHİL EDİLMEZ → önceki değer son eleman olur
      cutStack = [...stack];
    }
  }
  if (!stack.length || cut < 0 || !cutStack) return '';
  let out = s.slice(start, cut).replace(/,\s*$/, '');
  for (let i = cutStack.length - 1; i >= 0; i--) out += cutStack[i];
  return out;
}

// Tolerant JSON extraction — strips ```json fences, repairs common model
// formatting drift, and pulls the first balanced object out.
export function parseJsonLoose(text) {
  const t = cleanupJsonText(text);
  try { return JSON.parse(t); } catch { /* fall through */ }
  const balanced = cleanupJsonText(firstBalancedJsonObject(t));
  if (balanced) {
    try { return JSON.parse(balanced); } catch { /* fall through */ }
  }
  const repaired = repairTruncatedJson(t);
  if (repaired) {
    try { return JSON.parse(cleanupJsonText(repaired)); } catch { /* fall through */ }
  }
  throw new Error('AI JSON parse failed');
}

// SÜRE SINIRI (2026-08-08): varsayılan 90 sn zaman aşımı + sağlayıcı başına 2
// deneme, en kötü durumda TEK bir JSON çağrısını 6 dakikaya kadar uzatabiliyordu
// ("analiz sonuçlanmıyor, sürekli dönüyor"). Analiz çağrıları artık açık bir
// üst sınırla koşuyor; sınırı aşan sağlayıcı iptal edilip diğerine geçiliyor.
export async function askQorAiJson({
  system, user, maxOutputTokens = 4096, timeoutMs = 70000, budgetMs = 150000, temperature = 0.6,
}) {
  const text = await askQorAiRaw({
    system, user, maxOutputTokens, temperature, jsonMode: true, timeoutMs, budgetMs,
  });
  return parseJsonLoose(text);
}
