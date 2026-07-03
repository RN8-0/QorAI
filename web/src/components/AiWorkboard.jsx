import { useEffect, useRef, useState } from 'react';
import './AiWorkboard.css';

// When a flow swaps the quiz out for the workboard (or kicks off quiz prep), the
// page is usually scrolled down where the Submit/Start button was — leaving the
// freshly-mounted board above the fold and the user staring at empty space. Pull
// the board just under the fixed navbar so the live progress is always in view.
function scrollIntoViewBelowNav(el) {
  if (!el) return;
  const nav = document.querySelector('.appbar');
  const offset = (nav ? nav.getBoundingClientRect().height : 60) + 14;
  const top = window.scrollY + el.getBoundingClientRect().top - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

// ── One shared "what Qor AI is doing right now" animation ────────────────────
// Same look as the link-analysis workboard (spinning orb + lit-up step list),
// reused for the onboarding-style quiz prep AND the report analysis on the
// product, compare, link and subscription flows. Steps light up in order and
// HOLD on the operation that is genuinely running (driven by the real pipeline
// `stage` when the caller has one) — it never loops back to the start "for
// decoration", so the label always reflects the actual current step.
const SETS = {
  // Quiz preparation
  quizProduct: {
    title: ['Preparing your quiz', 'Quiz hazırlanıyor', 'Quiz wird vorbereitet'],
    detail: ['Questions are tuned to this product, not a generic profile form.', 'Sorular genel profil formu değil, bu ürüne göre hazırlanıyor.', 'Die Fragen werden auf dieses Produkt zugeschnitten.'],
    steps: [
      ['Locking the product context', 'Ürün bağlamı sabitleniyor', 'Produktkontext wird fixiert'],
      ['Mapping usage scenarios', 'Kullanım senaryoları çıkarılıyor', 'Nutzungsszenarien werden abgebildet'],
      ['Writing category-specific questions', 'Kategoriye özel sorular yazılıyor', 'Kategoriespezifische Fragen werden erstellt'],
      ['Balancing the answer choices', 'Cevap seçenekleri dengeleniyor', 'Antwortoptionen werden ausbalanciert'],
    ],
  },
  quizCompare: {
    title: ['Preparing your quiz', 'Quiz hazırlanıyor', 'Quiz wird vorbereitet'],
    detail: ['Questions are built from the products in your comparison, not a generic form.', 'Sorular karşılaştırmandaki ürünlerden üretiliyor, genel form değil.', 'Die Fragen entstehen aus den verglichenen Produkten.'],
    steps: [
      ['Reading the selected products', 'Seçili ürünler okunuyor', 'Ausgewählte Produkte werden gelesen'],
      ['Finding the real differences', 'Gerçek farklar bulunuyor', 'Reale Unterschiede werden gesucht'],
      ['Writing comparison scenarios', 'Karşılaştırma senaryoları yazılıyor', 'Vergleichsszenarien werden erstellt'],
      ['Balancing the answer choices', 'Cevap seçenekleri dengeleniyor', 'Antwortoptionen werden ausbalanciert'],
    ],
  },
  // Report analysis (single product) — driven by a real stage: prep / research / report
  product: {
    title: ['Building your report', 'Raporun hazırlanıyor', 'Bericht wird erstellt'],
    detail: ['Qor AI turns your answers into a personal match report.', 'Qor AI cevaplarını kişisel eşleşme raporuna çeviriyor.', 'Qor AI macht aus deinen Antworten einen persönlichen Match-Bericht.'],
    steps: [
      ['Reading catalog specs', 'Katalog özellikleri okunuyor', 'Katalogdaten werden gelesen'],
      ['Applying your profile & answers', 'Profilin ve cevapların uygulanıyor', 'Profil & Antworten werden angewendet'],
      ['Running current web research', 'Güncel web araştırması yapılıyor', 'Aktuelle Webrecherche läuft'],
      ['Scoring match factors', 'Uyum faktörleri puanlanıyor', 'Match-Faktoren werden bewertet'],
      ['Checking alternatives and price timing', 'Alternatifler ve fiyat zamanlaması kontrol ediliyor', 'Alternativen und Preis-Timing werden geprüft'],
      ['Composing the final report', 'Son rapor hazırlanıyor', 'Der Bericht wird zusammengestellt'],
    ],
  },
  // Report analysis (compare) — same real stage mapping
  compare: {
    title: ['Building the comparison', 'Karşılaştırma hazırlanıyor', 'Vergleich wird erstellt'],
    detail: ['Qor AI scores every product for your real use, then picks a winner.', 'Qor AI her ürünü gerçek kullanımına göre puanlayıp bir kazanan seçiyor.', 'Qor AI bewertet jedes Produkt und wählt einen Sieger.'],
    steps: [
      ['Reading the selected products', 'Seçili ürünler okunuyor', 'Ausgewählte Produkte werden gelesen'],
      ['Applying your profile & answers', 'Profilin ve cevapların uygulanıyor', 'Profil & Antworten werden angewendet'],
      ['Running current web research', 'Güncel web araştırması yapılıyor', 'Aktuelle Webrecherche läuft'],
      ['Comparing specs head-to-head', 'Özellikler karşılıklı karşılaştırılıyor', 'Specs werden direkt verglichen'],
      ['Scoring the best fit for you', 'Sana en uygunu puanlanıyor', 'Beste Wahl wird bewertet'],
      ['Composing the verdict', 'Sonuç hazırlanıyor', 'Fazit wird erstellt'],
    ],
  },
  // Link analysis phases (no fine stage — steps step up and hold on the last)
  linkIdentify: {
    title: ['Identifying the product', 'Ürün tanımlanıyor', 'Produkt wird erkannt'],
    detail: ['Qor AI reads the URL, store signal, and product slug first.', 'Qor AI önce URL, mağaza ve ürün adı sinyallerini okuyor.', 'Qor AI liest zuerst URL, Shop-Signal und Produktslug.'],
    steps: [
      ['Checking the link format', 'Bağlantı formatı kontrol ediliyor', 'Linkformat wird geprüft'],
      ['Reading store and product signals', 'Mağaza ve ürün sinyalleri okunuyor', 'Shop- und Produktsignale werden gelesen'],
      ['Detecting the category', 'Kategori algılanıyor', 'Kategorie wird erkannt'],
      ['Preparing the base analysis', 'Baz analiz hazırlanıyor', 'Basisanalyse wird vorbereitet'],
    ],
  },
  linkQuiz: {
    title: ['Preparing your quiz', 'Quiz hazırlanıyor', 'Quiz wird vorbereitet'],
    detail: ['Questions are tuned to this product, not a generic profile form.', 'Sorular genel profil formu değil, bu ürüne göre hazırlanıyor.', 'Die Fragen werden auf dieses Produkt zugeschnitten.'],
    steps: [
      ['Product context is locked', 'Ürün bağlamı sabitlendi', 'Produktkontext ist fixiert'],
      ['Usage scenarios are mapped', 'Kullanım senaryoları çıkarılıyor', 'Nutzungsszenarien werden abgebildet'],
      ['Category-specific questions are written', 'Kategoriye özel sorular yazılıyor', 'Kategoriespezifische Fragen werden erstellt'],
      ['Answer choices are balanced', 'Cevap seçenekleri dengeleniyor', 'Antwortoptionen werden ausbalanciert'],
    ],
  },
  linkAnalyze: {
    title: ['Building your report', 'Raporun hazırlanıyor', 'Bericht wird erstellt'],
    detail: ['Qor AI turns your answers into a personal match report.', 'Qor AI cevaplarını kişisel eşleşme raporuna çeviriyor.', 'Qor AI macht aus deinen Antworten einen persönlichen Match-Bericht.'],
    steps: [
      ['Reading quiz answers', 'Quiz cevapları okunuyor', 'Quizantworten werden gelesen'],
      ['Scoring match factors', 'Uyum faktörleri puanlanıyor', 'Match-Faktoren werden bewertet'],
      ['Summarizing reviews and risks', 'Yorumlar ve riskler özetleniyor', 'Bewertungen und Risiken werden zusammengefasst'],
      ['Building the final verdict', 'Son karar hazırlanıyor', 'Endgültiges Fazit wird erstellt'],
    ],
  },
  linkCompare: {
    title: ['Comparing links', 'Linkler karşılaştırılıyor', 'Links werden verglichen'],
    detail: ['Qor AI is weighing each product side by side.', 'Qor AI her ürünü yan yana tartıyor.', 'Qor AI gewichtet jedes Produkt nebeneinander.'],
    steps: [
      ['Validating product links', 'Ürün linkleri doğrulanıyor', 'Produktlinks werden geprüft'],
      ['Identifying each exact product', 'Her ürün tek tek tanınıyor', 'Jedes Produkt wird erkannt'],
      ['Weighing strengths and trade-offs', 'Artılar, eksiler ve farklar tartılıyor', 'Stärken und Kompromisse werden abgewogen'],
      ['Writing the final recommendation', 'Nihai öneri yazılıyor', 'Empfehlung wird geschrieben'],
    ],
  },
  // Subscription analysis flow
  subQuiz: {
    title: ['Preparing your subscription quiz', 'Abonelik quizin hazırlanıyor', 'Abo-Quiz wird vorbereitet'],
    detail: ['The questions adapt to the selected service type.', 'Sorular seçilen abonelik türüne göre uyarlanıyor.', 'Die Fragen passen sich dem Diensttyp an.'],
    steps: [
      ['Reading the selected services', 'Seçilen abonelikler okunuyor', 'Ausgewählte Dienste werden gelesen'],
      ['Detecting the service category', 'Servis kategorisi algılanıyor', 'Dienstkategorie wird erkannt'],
      ['Mapping usage scenarios', 'Kullanım senaryoları çıkarılıyor', 'Nutzungsszenarien werden abgebildet'],
      ['Writing targeted questions', 'Hedefli sorular yazılıyor', 'Gezielte Fragen werden erstellt'],
    ],
  },
  subAnalyze: {
    title: ['Analyzing subscription', 'Abonelik analiz ediliyor', 'Abo wird analysiert'],
    detail: ['Qor AI turns your answers into a detailed match report.', 'Qor AI cevaplarını detaylı eşleşme raporuna çeviriyor.', 'Qor AI macht aus deinen Antworten einen Match-Bericht.'],
    steps: [
      ['Reading quiz answers', 'Quiz cevapları okunuyor', 'Quizantworten werden gelesen'],
      ['Evaluating content and feature fit', 'İçerik ve özellik uyumu değerlendiriliyor', 'Inhalts- und Funktionsfit wird bewertet'],
      ['Reviewing community signals', 'İnternet yorum sinyalleri değerlendiriliyor', 'Community-Signale werden bewertet'],
      ['Building the final recommendation', 'Nihai öneri hazırlanıyor', 'Empfehlung wird erstellt'],
    ],
  },
  subCompare: {
    title: ['Comparing subscriptions', 'Abonelikler karşılaştırılıyor', 'Abos werden verglichen'],
    detail: ['Qor AI turns your answers into a detailed match report.', 'Qor AI cevaplarını detaylı eşleşme raporuna çeviriyor.', 'Qor AI macht aus deinen Antworten einen Match-Bericht.'],
    steps: [
      ['Reading quiz answers', 'Quiz cevapları okunuyor', 'Quizantworten werden gelesen'],
      ['Evaluating content and feature fit', 'İçerik ve özellik uyumu değerlendiriliyor', 'Inhalts- und Funktionsfit wird bewertet'],
      ['Reviewing community signals', 'İnternet yorum sinyalleri değerlendiriliyor', 'Community-Signale werden bewertet'],
      ['Building the final recommendation', 'Nihai öneri hazırlanıyor', 'Empfehlung wird erstellt'],
    ],
  },
};

// A real coarse pipeline stage → the furthest step that may light up (then it
// HOLDS there). Used by the report flows that report prep → research → report.
const STAGE_CEIL = { prep: 1, research: 2, report: 99 };

export default function AiWorkboard({ lang = 'en', mode = 'product', stage = null }) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const L = (a) => (code === 'tr' ? a[1] : code === 'de' ? a[2] : a[0]);
  const set = SETS[mode] || SETS.product;
  const steps = set.steps;
  const lastIdx = steps.length - 1;
  // With a real stage, cap progress at that phase so the lit step is the actual
  // current operation. Without one, fall back to timed pacing that fills to the
  // end and stops (never loops back).
  const ceil = stage == null ? lastIdx : Math.min(lastIdx, STAGE_CEIL[stage] ?? lastIdx);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);

  // Bring the board into view whenever the step SET (mode) changes — i.e. on
  // quiz-prep start and again when the report analysis begins.
  useEffect(() => {
    const id = requestAnimationFrame(() => scrollIntoViewBelowNav(rootRef.current));
    return () => cancelAnimationFrame(id);
  }, [mode]);

  // Reset only when the step SET (mode) changes, never on an ordinary re-render.
  useEffect(() => { setActive(0); }, [mode]);

  // Step up toward the current ceiling; never move backwards, never wrap around.
  useEffect(() => {
    if (active >= ceil) return undefined;
    const id = setTimeout(() => setActive((i) => Math.min(ceil, i + 1)), active === 0 ? 500 : 1300);
    return () => clearTimeout(id);
  }, [active, ceil]);

  return (
    <div className="aiwb fade-up" role="status" aria-live="polite" ref={rootRef}>
      <div className="aiwb-orb" aria-hidden="true">
        <span className="aiwb-ring" />
        <span className="aiwb-core" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
            <path d="M18.5 14.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8.8-1.7z" />
          </svg>
        </span>
      </div>
      <div className="aiwb-copy">
        <strong>{L(set.title)}</strong>
        <span>{L(set.detail)}</span>
      </div>
      <div className="aiwb-steps">
        {steps.map((s, i) => (
          <div key={i} className={'aiwb-step' + (i === active ? ' active' : '') + (i < active ? ' done' : '')}>
            <i aria-hidden="true">{i < active ? '✓' : i + 1}</i>
            <span>{L(s)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
