// ═══════════════════════════════════════════════════════════════
//  Qor AI chat — talks to the PocketBase Gemini proxy
//  (/api/ai/gemini) — the same endpoint the mobile app uses.
// ═══════════════════════════════════════════════════════════════

import { PB_URL } from './pocketbase';

const AI_URL = `${PB_URL}/api/ai/gemini`;
const MODEL = 'gemini-2.5-flash';

// Mirrors the mobile app's Qor AI chat persona (_chatSystemPrompt) so the web
// gives the same voice, scope and rules as the app.
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

// history: [{ role: 'user' | 'model', text: string }]
export async function askQorAi(history) {
  const body = {
    model: MODEL,
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const res = await fetch(AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI ${res.status}`);

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('AI boş yanıt döndü');
  return text.trim();
}

// Low-level call with a custom system instruction — used by the quiz / link /
// subscription engines that need their own prompt and a JSON reply (mirrors the
// app's DeepSeek _jsonRequest, but over the same Gemini proxy the web chat uses).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function askQorAiRaw({ system, user, maxOutputTokens = 4096, temperature = 0.7 }) {
  const body = {
    model: MODEL,
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature, maxOutputTokens, thinkingConfig: { thinkingBudget: 0 } },
  };
  // The Gemini free tier throttles hard (per-minute 429 bursts). Back off across
  // a wider window so the rate-limit slot frees up before we give up. NOTE: when
  // 429s are this frequent the real fix is a higher Gemini API quota server-side.
  const backoff = [0, 3000, 7000, 12000, 18000, 25000];
  let lastStatus = 0;
  for (let attempt = 0; attempt < backoff.length; attempt++) {
    if (attempt > 0) await sleep(backoff[attempt]);
    const res = await fetch(AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('AI boş yanıt döndü');
      return text.trim();
    }
    lastStatus = res.status;
    // Retry only the transient ones (rate limit / overloaded / 5xx).
    if (res.status !== 429 && res.status !== 503 && res.status < 500) {
      throw new Error(`AI ${res.status}`);
    }
  }
  throw new Error(`AI ${lastStatus}`);
}

// Tolerant JSON extraction — Gemini sometimes wraps JSON in ```json fences or
// adds a sentence before/after. Pull the first balanced object out.
export function parseJsonLoose(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* fall through */ }
  }
  throw new Error('AI JSON parse failed');
}

export async function askQorAiJson({ system, user, maxOutputTokens = 4096 }) {
  const text = await askQorAiRaw({ system, user, maxOutputTokens, temperature: 0.6 });
  return parseJsonLoose(text);
}
