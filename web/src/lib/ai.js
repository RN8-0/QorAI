// ═══════════════════════════════════════════════════════════════
//  Qor AI chat — talks to the PocketBase Gemini proxy
//  (/api/ai/gemini) — the same endpoint the mobile app uses.
// ═══════════════════════════════════════════════════════════════

import { PB_URL } from './pocketbase';

const AI_URL = `${PB_URL}/api/ai/gemini`;
const MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT =
  'You are Qor AI — a friendly, expert technology product advisor on qorai.net. ' +
  'You help people choose phones, laptops, GPUs, headphones and other tech, and ' +
  'compare digital subscriptions. Be concise, practical and honest. Give clear ' +
  'recommendations with short reasoning. ALWAYS reply in the exact same language ' +
  'the user writes in. Keep answers brief unless asked for detail.';

// history: [{ role: 'user' | 'model', text: string }]
export async function askQorAi(history) {
  const body = {
    model: MODEL,
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
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
