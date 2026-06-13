import { useEffect, useState } from 'react';
import './AiLoadingSteps.css';

// Animated, step-by-step "what Qor AI is doing right now" list shown while a
// product / compare analysis is running. Steps light up in sequence (the last
// one keeps spinning until the parent swaps in the real result).
const STEP_SETS = {
  product: [
    ['Reading catalog specs', 'Katalog özellikleri okunuyor', 'Katalogdaten werden gelesen'],
    ['Applying your profile & quiz answers', 'Profilin ve quiz cevapların uygulanıyor', 'Profil & Quiz werden angewendet'],
    ['Researching community reviews (Reddit, forums)', 'Topluluk yorumları araştırılıyor (Reddit, forumlar)', 'Community-Reviews werden recherchiert'],
    ['Scanning smart alternatives', 'Akıllı alternatifler taranıyor', 'Alternativen werden gescannt'],
    ['Estimating the price trend', 'Fiyat trendi hesaplanıyor', 'Preistrend wird geschätzt'],
    ['Composing your report', 'Raporun hazırlanıyor', 'Bericht wird erstellt'],
  ],
  compare: [
    ['Reading both products', 'Her iki ürün okunuyor', 'Beide Produkte werden gelesen'],
    ['Applying your profile & quiz answers', 'Profilin ve quiz cevapların uygulanıyor', 'Profil & Quiz werden angewendet'],
    ['Researching community reviews (Reddit, forums)', 'Topluluk yorumları araştırılıyor (Reddit, forumlar)', 'Community-Reviews werden recherchiert'],
    ['Comparing specs head-to-head', 'Özellikler karşılıklı karşılaştırılıyor', 'Specs werden direkt verglichen'],
    ['Scoring the best fit for you', 'Sana en uygunu puanlanıyor', 'Beste Wahl wird bewertet'],
    ['Composing the verdict', 'Sonuç hazırlanıyor', 'Fazit wird erstellt'],
  ],
};

export default function AiLoadingSteps({ lang = 'en', mode = 'product' }) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const L = (s) => (code === 'tr' ? s[1] : code === 'de' ? s[2] : s[0]);
  const steps = STEP_SETS[mode] || STEP_SETS.product;
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(0);
  }, [mode]);

  useEffect(() => {
    if (active >= steps.length - 1) return undefined;
    const id = setTimeout(() => setActive((i) => Math.min(steps.length - 1, i + 1)), active === 0 ? 650 : 1650);
    return () => clearTimeout(id);
  }, [active, steps.length]);

  return (
    <div className="ai-steps" role="status" aria-live="polite">
      <div className="ai-steps-head">
        <span className="ai-steps-orb"><i /><i /><i /></span>
        <b>{code === 'tr' ? 'Qor AI çalışıyor…' : code === 'de' ? 'Qor AI arbeitet…' : 'Qor AI is working…'}</b>
      </div>
      <ul className="ai-steps-list">
        {steps.map((s, i) => {
          const state = i < active ? 'done' : i === active ? 'active' : 'pending';
          return (
            <li key={i} className={`ai-step ai-step-${state}`}>
              <span className="ai-step-ic">
                {state === 'done' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                ) : state === 'active' ? (
                  <span className="ai-step-spin" />
                ) : (
                  <span className="ai-step-dot" />
                )}
              </span>
              <span className="ai-step-tx">{L(s)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
