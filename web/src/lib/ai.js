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

// Mirrors the mobile app's Qor AI chat persona so the web gives the same voice,
// scope and rules as the app.
const SYSTEM_PROMPT =
  'You are Qor AI — a knowledgeable, friendly shopping and product advisor for ALL product ' +
  'categories (technology, audio, photo, home, fashion and more) on qorai.net.\n' +
  '- Warm and conversational, but honest about product weaknesses; concise (max 3-4 short paragraphs).\n' +
  '- Treat any product, comparison, page or link context you are given as the live, current Qor ' +
  'catalog state and the strongest source — trust it over older knowledge, and never claim a product ' +
  'does not exist or has not launched when it appears in that context.\n' +
  '- Give clear recommendations with short reasoning and real trade-offs (specs, value, who it is for).\n' +
  '- Never mention backend providers, model names or internal tooling; if asked what powers you, answer as Qor AI.\n' +
  '- Address the person directly ("you" / "sen" / "siz"), never "the user".\n' +
  '- ALWAYS reply in the exact same language the user writes in.';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Transient failures worth retrying / falling back on — mirrors the app's
// _shouldFallbackModel (404/429/5xx + quota wording).
function transientStatus(status) {
  return status === 404 || status === 429 || status === 500
    || status === 502 || status === 503 || status === 504;
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
async function geminiOnce({ system, messages, maxOutputTokens, temperature }) {
  const body = {
    model: GEMINI_MODEL,
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }],
    })),
    generationConfig: { temperature, maxOutputTokens, thinkingConfig: { thinkingBudget: 0 } },
  };
  const res = await fetchJson(GEMINI_URL, body);
  if (!res.ok) {
    const err = new Error(`gemini ${res.status}`);
    err.transient = transientStatus(res.status);
    throw err;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) { const e = new Error('gemini empty'); e.transient = true; throw e; }
  return text.trim();
}

// ── DeepSeek proxy (app's "primary text intelligence" — our fallback) ──
async function deepseekOnce({ system, messages, maxOutputTokens, temperature, jsonMode }) {
  const body = {
    model: DEEPSEEK_MODEL,
    messages: [{ role: 'system', content: system }, ...messages],
    max_tokens: Math.min(maxOutputTokens, DEEPSEEK_MAX_OUTPUT),
    temperature,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const res = await fetchJson(DEEPSEEK_URL, body);
  if (!res.ok) {
    const err = new Error(`deepseek ${res.status}`);
    err.transient = transientStatus(res.status);
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
async function aiRequest({ system, messages, maxOutputTokens = 4096, temperature = 0.7, jsonMode = false }) {
  let lastErr;
  for (let i = 0; i < 2; i++) {
    if (i > 0) await sleep(2000);
    try { return await geminiOnce({ system, messages, maxOutputTokens, temperature }); }
    catch (e) { lastErr = e; if (!e.transient) break; }
  }
  for (let i = 0; i < 2; i++) {
    if (i > 0) await sleep(2500);
    try { return await deepseekOnce({ system, messages, maxOutputTokens, temperature, jsonMode }); }
    catch (e) { lastErr = e; if (!e.transient) break; }
  }
  throw lastErr || new Error('AI failed');
}

// history: [{ role: 'user' | 'model', text: string }]
export async function askQorAi(history) {
  const messages = history.map((m) => ({
    role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user',
    content: m.text,
  }));
  return aiRequest({ system: SYSTEM_PROMPT, messages, maxOutputTokens: 2048, temperature: 0.7 });
}

// Custom system + user — used by the quiz / link / subscription engines.
export async function askQorAiRaw({ system, user, maxOutputTokens = 4096, temperature = 0.7, jsonMode = false }) {
  return aiRequest({
    system,
    messages: [{ role: 'user', content: user }],
    maxOutputTokens,
    temperature,
    jsonMode,
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
