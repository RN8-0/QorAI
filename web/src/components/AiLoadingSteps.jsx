import { useEffect, useState } from 'react';
import './AiLoadingSteps.css';

// Animated, step-by-step "what Qor AI is doing right now" list shown while a
// product / compare analysis is running. Steps light up in sequence (the last
// one keeps spinning until the parent swaps in the real result).
const STEP_SETS = {
  quizProduct: [
    {
      title: ['Reading the product context', 'Ürün bağlamı okunuyor'],
      detail: ['Category, specs and product type are used to avoid generic questions.', 'Genel sorulardan kaçınmak için kategori, özellikler ve ürün tipi okunuyor.'],
    },
    {
      title: ['Choosing decision trade-offs', 'Karar tavizleri seçiliyor'],
      detail: ['The quiz focuses on the choices that can actually change the recommendation.', 'Quiz, öneriyi gerçekten değiştirebilecek seçimlere odaklanıyor.'],
    },
    {
      title: ['Writing scenario questions', 'Senaryo soruları yazılıyor'],
      detail: ['Questions are shaped around everyday use instead of abstract labels.', 'Sorular soyut etiketler yerine günlük kullanım senaryolarıyla şekilleniyor.'],
    },
    {
      title: ['Balancing answer options', 'Cevap seçenekleri dengeleniyor'],
      detail: ['Options are checked so each one represents a distinct buyer priority.', 'Her seçeneğin farklı bir alıcı önceliği taşıması kontrol ediliyor.'],
    },
    {
      title: ['Preparing the quiz', 'Quiz hazırlanıyor'],
      detail: ['The personalized report starts as soon as the answers are submitted.', 'Cevaplar gönderildiğinde kişisel rapor hemen başlayacak.'],
    },
  ],
  quizCompare: [
    {
      title: ['Reading selected products', 'Seçili ürünler okunuyor'],
      detail: ['The quiz starts from the actual products in the comparison tray.', 'Quiz, karşılaştırma sepetindeki gerçek ürünlerden başlıyor.'],
    },
    {
      title: ['Finding real differences', 'Gerçek farklar bulunuyor'],
      detail: ['Specs, class, weight, performance and ownership risks are turned into questions.', 'Özellikler, sınıf, ağırlık, performans ve sahiplik riskleri soruya çevriliyor.'],
    },
    {
      title: ['Building comparison scenarios', 'Karşılaştırma senaryoları kuruluyor'],
      detail: ['Questions are written to reveal which trade-off matters more to you.', 'Sorular hangi tavizin senin için daha önemli olduğunu açığa çıkaracak şekilde yazılıyor.'],
    },
    {
      title: ['Balancing answer options', 'Cevap seçenekleri dengeleniyor'],
      detail: ['Each option maps to a different recommendation path.', 'Her seçenek farklı bir öneri yoluna bağlanıyor.'],
    },
    {
      title: ['Preparing the quiz', 'Quiz hazırlanıyor'],
      detail: ['Your answers will feed the final score matrix and verdict.', 'Cevapların final skor matrisi ve karara aktarılacak.'],
    },
  ],
  product: [
    {
      title: ['Reading catalog specs', 'Katalog özellikleri okunuyor'],
      detail: ['Core specs, offer freshness, variants and source signals are being checked.', 'Temel özellikler, teklif tazeliği, varyantlar ve kaynak sinyalleri kontrol ediliyor.'],
    },
    {
      title: ['Applying your profile & quiz answers', 'Profilin ve quiz cevapların uygulanıyor'],
      detail: ['Your real use case is weighted before any score or verdict is written.', 'Her skor ve sonuçtan önce gerçek kullanım senaryon ağırlıklandırılıyor.'],
    },
    {
      title: ['Running current web research', 'Güncel web araştırması yapılıyor'],
      detail: ['Official pages, reviews, retailer signals and community discussion are cross-checked.', 'Resmi sayfalar, incelemeler, mağaza sinyalleri ve topluluk yorumları çapraz kontrol ediliyor.'],
    },
    {
      title: ['Checking alternatives and risks', 'Alternatifler ve riskler kontrol ediliyor'],
      detail: ['Nearby catalog products are compared so the recommendation is not tunnel-visioned.', 'Öneri tek ürüne kilitlenmesin diye yakın katalog alternatifleri karşılaştırılıyor.'],
    },
    {
      title: ['Estimating price timing', 'Fiyat zamanlaması hesaplanıyor'],
      detail: ['Fresh offers, product age and market cycle signals are separated from guesses.', 'Güncel teklifler, ürün yaşı ve pazar döngüsü sinyalleri tahminden ayrıştırılıyor.'],
    },
    {
      title: ['Composing your report', 'Raporun hazırlanıyor'],
      detail: ['The final report is being checked for stale availability claims before it appears.', 'Son rapor görünmeden önce eski lansman/erişilebilirlik iddialarına karşı kontrol ediliyor.'],
    },
  ],
  compare: [
    {
      title: ['Reading selected products', 'Seçili ürünler okunuyor'],
      detail: ['Specs, scores, prices and availability signals are normalized product by product.', 'Özellikler, skorlar, fiyatlar ve bulunabilirlik sinyalleri ürün ürün normalize ediliyor.'],
    },
    {
      title: ['Applying your profile & quiz answers', 'Profilin ve quiz cevapların uygulanıyor'],
      detail: ['The comparison is shaped around your answers, not a generic leaderboard.', 'Karşılaştırma genel bir sıralama yerine cevaplarına göre şekilleniyor.'],
    },
    {
      title: ['Running current web research', 'Güncel web araştırması yapılıyor'],
      detail: ['Current status, review sentiment and market signals are checked for each product.', 'Her ürün için güncel durum, yorum eğilimi ve pazar sinyalleri kontrol ediliyor.'],
    },
    {
      title: ['Comparing specs head-to-head', 'Özellikler karşılıklı karşılaştırılıyor'],
      detail: ['Strengths are judged inside the same category and size class.', 'Güçlü yönler aynı kategori ve boyut sınıfı içinde değerlendiriliyor.'],
    },
    {
      title: ['Scoring the best fit for you', 'Sana en uygunu puanlanıyor'],
      detail: ['Trade-offs, risks and long-term value are converted into the final score matrix.', 'Tavizler, riskler ve uzun vadeli değer final skor matrisine dönüştürülüyor.'],
    },
    {
      title: ['Composing the verdict', 'Sonuç hazırlanıyor'],
      detail: ['The final recommendation is checked for freshness and consistency before display.', 'Final öneri görünmeden önce güncellik ve tutarlılık kontrolünden geçiyor.'],
    },
  ],
};

// Maps the parent's coarse pipeline phase to the furthest step the list may
// reach. The list steps UP to this ceiling and then HOLDS there — so it stays
// on the operation that is genuinely running (web research is the long one)
// rather than racing to the end and idling, or restarting on a re-render.
const STAGE_CEIL = { prep: 1, research: 2, report: 99 };

export default function AiLoadingSteps({ lang = 'en', mode = 'product', stage = null }) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const L = (s) => (code === 'tr' ? s[1] : s[0]);
  const steps = STEP_SETS[mode] || STEP_SETS.product;
  const lastIdx = steps.length - 1;
  // With a real stage, cap progress at that phase so the highlighted step is
  // the actual current operation. Without one (quiz prep), fall back to timed
  // pacing that fills to the end.
  const ceil = stage == null ? lastIdx : Math.min(lastIdx, STAGE_CEIL[stage] ?? lastIdx);
  const [active, setActive] = useState(0);
  const progress = Math.round(((active + 1) / steps.length) * 100);

  // Reset only when the step SET changes (quiz prep → analysis), never on an
  // ordinary re-render — that reset is what made the list look like it "loops
  // back to the start".
  useEffect(() => {
    setActive(0);
  }, [mode]);

  // Step up toward the current ceiling; never move backwards. When the parent
  // advances to the next phase the ceiling rises and stepping resumes.
  useEffect(() => {
    if (active >= ceil) return undefined;
    const id = setTimeout(() => setActive((i) => Math.min(ceil, i + 1)), active === 0 ? 600 : 1400);
    return () => clearTimeout(id);
  }, [active, ceil]);

  return (
    <div className="ai-steps" role="status" aria-live="polite">
      <div className="ai-steps-head">
        <span className="ai-steps-orb"><i /><i /><i /></span>
        <div>
          <b>{code === 'tr' ? 'Qor AI raporu hazırlıyor' : 'Qor AI is preparing the report'}</b>
          <small>{progress}%</small>
        </div>
      </div>
      <div className="ai-steps-progress"><i style={{ width: `${progress}%` }} /></div>
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
              <span className="ai-step-tx">
                <b>{L(s.title)}</b>
                {state === 'active' && <small>{L(s.detail)}</small>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
