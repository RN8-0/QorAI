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

import { PB_URL } from './pocketbase';

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
  'You are Qor AI — a knowledgeable, friendly shopping and product advisor for ALL product ' +
  'categories (technology, audio, photo, home, fashion and more) on qorai.net.\n' +
  '- Warm and conversational, but honest about product weaknesses. Give rich, practical answers with clear sections when the question needs detail.\n' +
  '- Treat any product, comparison, page or link context you are given as the live, current Qor ' +
  'catalog state and the strongest source — trust it over older knowledge, and never claim a product ' +
  'does not exist or has not launched when it appears in that context.\n' +
  '- For product questions, first use Qor catalog context when provided: mention matched products, explain the relevant specs, compare trade-offs, and include product/store links from context when useful.\n' +
  '- If catalog context is missing or weak, answer from general public product knowledge without inventing exact live prices or availability. Say what should be verified on the official/store page.\n' +
  '- Give clear recommendations with reasoning and real trade-offs: specs, value, who it is for, who should avoid it, alternatives, and what to check before buying.\n' +
  '- Do not use Markdown heading markers (#, ##, ###), code fences, raw JSON, or table syntax in chat answers. Use plain section labels like "Camera:" / "Kamera:" / "Kamera:" and normal paragraphs or bullets.\n' +
  '- Never mention backend providers, model names or internal tooling; if asked what powers you, answer as Qor AI.\n' +
  '- Address the person directly ("you" / "sen" / "siz"), never "the user".';

function chatSystemPrompt(language = 'en', groundingContext = '', locale = {}) {
  const langName = languageLabel(language);
  const country = String(locale.country || '').toUpperCase();
  const currency = String(locale.currency || '').toUpperCase();
  const marketLine = country
    ? `\n- LOCAL MARKET: The person is in ${country}${currency ? ` and shops in ${currency}` : ''}. Whenever you mention a price, budget or value, use ${currency || 'their local currency'} and that market's typical pricing — NEVER quote another country's currency (e.g. do not give Turkish Lira to a non-Turkish user, or USD to a Turkish user). If you don't know the local price, say it should be checked on the local store instead of guessing in the wrong currency.`
    : '';
  return `${BASE_CHAT_PROMPT}
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
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
}) {
  let lastErr;
  // Gemini first (app parity). Retry the SAME provider only on a true 5xx; on a
  // 429/404 (the common case for the free key) fall straight through to DeepSeek
  // instead of sleeping 2s for nothing.
  for (let i = 0; i < 2; i++) {
    try { return await geminiOnce({ system, messages, maxOutputTokens, temperature, tools, jsonMode, timeoutMs }); }
    catch (e) { lastErr = e; if (!e.retryable || i === 1) break; await sleep(1200); }
  }
  // DeepSeek — the unlimited json_object workhorse — does the heavy lifting.
  for (let i = 0; i < 2; i++) {
    try { return await deepseekOnce({ system, messages, maxOutputTokens, temperature, jsonMode, timeoutMs }); }
    catch (e) { lastErr = e; if (!e.retryable || i === 1) break; await sleep(1200); }
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
  // Grounded search is Gemini-only (DeepSeek has no Google Search tool). Retry
  // only on a true 5xx; on a 429 give up fast so the optional research step does
  // not strand the user on "running web research" — the report runs without it.
  for (let i = 0; i < 2; i++) {
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
      if (!e.retryable || i === 1) break;
      await sleep(1200);
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
}) {
  return aiRequest({
    system,
    messages: [{ role: 'user', content: user }],
    maxOutputTokens,
    temperature,
    jsonMode,
    tools,
    timeoutMs,
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

// Tolerant JSON extraction — strips ```json fences, repairs common model
// formatting drift, and pulls the first balanced object out.
export function parseJsonLoose(text) {
  let t = cleanupJsonText(text);
  try { return JSON.parse(t); } catch { /* fall through */ }
  const balanced = cleanupJsonText(firstBalancedJsonObject(t));
  if (balanced) {
    try { return JSON.parse(balanced); } catch { /* fall through */ }
  }
  throw new Error('AI JSON parse failed');
}

export async function askQorAiJson({ system, user, maxOutputTokens = 4096 }) {
  const text = await askQorAiRaw({ system, user, maxOutputTokens, temperature: 0.6, jsonMode: true });
  return parseJsonLoose(text);
}
