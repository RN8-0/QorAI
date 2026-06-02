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
