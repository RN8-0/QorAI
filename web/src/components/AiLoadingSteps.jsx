import { useEffect, useState } from 'react';
import './AiLoadingSteps.css';

// Animated, step-by-step "what Qor AI is doing right now" list shown while a
// product / compare analysis is running. Steps light up in sequence (the last
// one keeps spinning until the parent swaps in the real result).
const STEP_SETS = {
  quizProduct: [
    {
      title: ['Reading the product context', 'Ürün bağlamı okunuyor', 'Produktkontext wird gelesen'],
      detail: ['Category, specs and product type are used to avoid generic questions.', 'Genel sorulardan kaçınmak için kategori, özellikler ve ürün tipi okunuyor.', 'Kategorie, Daten und Produkttyp verhindern generische Fragen.'],
    },
    {
      title: ['Choosing decision trade-offs', 'Karar tavizleri seçiliyor', 'Entscheidungskompromisse werden gewählt'],
      detail: ['The quiz focuses on the choices that can actually change the recommendation.', 'Quiz, öneriyi gerçekten değiştirebilecek seçimlere odaklanıyor.', 'Der Quiz fokussiert auf Punkte, die die Empfehlung wirklich ändern.'],
    },
    {
      title: ['Writing scenario questions', 'Senaryo soruları yazılıyor', 'Szenariofragen werden erstellt'],
      detail: ['Questions are shaped around everyday use instead of abstract labels.', 'Sorular soyut etiketler yerine günlük kullanım senaryolarıyla şekilleniyor.', 'Fragen werden als Nutzungsszenarien statt abstrakter Labels formuliert.'],
    },
    {
      title: ['Balancing answer options', 'Cevap seçenekleri dengeleniyor', 'Antwortoptionen werden balanciert'],
      detail: ['Options are checked so each one represents a distinct buyer priority.', 'Her seçeneğin farklı bir alıcı önceliği taşıması kontrol ediliyor.', 'Jede Option soll eine klare Käuferpriorität abbilden.'],
    },
    {
      title: ['Preparing the quiz', 'Quiz hazırlanıyor', 'Quiz wird vorbereitet'],
      detail: ['The personalized report starts as soon as the answers are submitted.', 'Cevaplar gönderildiğinde kişisel rapor hemen başlayacak.', 'Der persönliche Bericht startet direkt nach dem Absenden.'],
    },
  ],
  quizCompare: [
    {
      title: ['Reading selected products', 'Seçili ürünler okunuyor', 'Ausgewählte Produkte werden gelesen'],
      detail: ['The quiz starts from the actual products in the comparison tray.', 'Quiz, karşılaştırma sepetindeki gerçek ürünlerden başlıyor.', 'Der Quiz nutzt die tatsächlich ausgewählten Produkte.'],
    },
    {
      title: ['Finding real differences', 'Gerçek farklar bulunuyor', 'Reale Unterschiede werden gesucht'],
      detail: ['Specs, class, weight, performance and ownership risks are turned into questions.', 'Özellikler, sınıf, ağırlık, performans ve sahiplik riskleri soruya çevriliyor.', 'Daten, Klasse, Gewicht, Leistung und Risiken werden zu Fragen.'],
    },
    {
      title: ['Building comparison scenarios', 'Karşılaştırma senaryoları kuruluyor', 'Vergleichsszenarien werden gebaut'],
      detail: ['Questions are written to reveal which trade-off matters more to you.', 'Sorular hangi tavizin senin için daha önemli olduğunu açığa çıkaracak şekilde yazılıyor.', 'Fragen zeigen, welcher Kompromiss dir wichtiger ist.'],
    },
    {
      title: ['Balancing answer options', 'Cevap seçenekleri dengeleniyor', 'Antwortoptionen werden balanciert'],
      detail: ['Each option maps to a different recommendation path.', 'Her seçenek farklı bir öneri yoluna bağlanıyor.', 'Jede Option führt zu einem anderen Empfehlungspfad.'],
    },
    {
      title: ['Preparing the quiz', 'Quiz hazırlanıyor', 'Quiz wird vorbereitet'],
      detail: ['Your answers will feed the final score matrix and verdict.', 'Cevapların final skor matrisi ve karara aktarılacak.', 'Deine Antworten fließen in Score-Matrix und Fazit ein.'],
    },
  ],
  product: [
    {
      title: ['Reading catalog specs', 'Katalog özellikleri okunuyor', 'Katalogdaten werden gelesen'],
      detail: ['Core specs, offer freshness, variants and source signals are being checked.', 'Temel özellikler, teklif tazeliği, varyantlar ve kaynak sinyalleri kontrol ediliyor.', 'Kerndaten, Angebotsfrische, Varianten und Quellen werden geprüft.'],
    },
    {
      title: ['Applying your profile & quiz answers', 'Profilin ve quiz cevapların uygulanıyor', 'Profil & Quiz werden angewendet'],
      detail: ['Your real use case is weighted before any score or verdict is written.', 'Her skor ve sonuçtan önce gerçek kullanım senaryon ağırlıklandırılıyor.', 'Dein Nutzungsszenario wird vor Score und Fazit gewichtet.'],
    },
    {
      title: ['Running current web research', 'Güncel web araştırması yapılıyor', 'Aktuelle Webrecherche läuft'],
      detail: ['Official pages, reviews, retailer signals and community discussion are cross-checked.', 'Resmi sayfalar, incelemeler, mağaza sinyalleri ve topluluk yorumları çapraz kontrol ediliyor.', 'Offizielle Seiten, Tests, Händlerdaten und Community-Signale werden abgeglichen.'],
    },
    {
      title: ['Checking alternatives and risks', 'Alternatifler ve riskler kontrol ediliyor', 'Alternativen und Risiken werden geprüft'],
      detail: ['Nearby catalog products are compared so the recommendation is not tunnel-visioned.', 'Öneri tek ürüne kilitlenmesin diye yakın katalog alternatifleri karşılaştırılıyor.', 'Nahe Katalogalternativen werden verglichen, damit die Empfehlung nicht einseitig wird.'],
    },
    {
      title: ['Estimating price timing', 'Fiyat zamanlaması hesaplanıyor', 'Preis-Timing wird eingeschätzt'],
      detail: ['Fresh offers, product age and market cycle signals are separated from guesses.', 'Güncel teklifler, ürün yaşı ve pazar döngüsü sinyalleri tahminden ayrıştırılıyor.', 'Aktuelle Angebote, Produktalter und Marktzyklus werden von Vermutungen getrennt.'],
    },
    {
      title: ['Composing your report', 'Raporun hazırlanıyor', 'Bericht wird erstellt'],
      detail: ['The final report is being checked for stale availability claims before it appears.', 'Son rapor görünmeden önce eski lansman/erişilebilirlik iddialarına karşı kontrol ediliyor.', 'Der Bericht wird vor der Anzeige auf veraltete Verfügbarkeitsaussagen geprüft.'],
    },
  ],
  compare: [
    {
      title: ['Reading selected products', 'Seçili ürünler okunuyor', 'Ausgewählte Produkte werden gelesen'],
      detail: ['Specs, scores, prices and availability signals are normalized product by product.', 'Özellikler, skorlar, fiyatlar ve bulunabilirlik sinyalleri ürün ürün normalize ediliyor.', 'Daten, Scores, Preise und Verfügbarkeit werden pro Produkt normalisiert.'],
    },
    {
      title: ['Applying your profile & quiz answers', 'Profilin ve quiz cevapların uygulanıyor', 'Profil & Quiz werden angewendet'],
      detail: ['The comparison is shaped around your answers, not a generic leaderboard.', 'Karşılaştırma genel bir sıralama yerine cevaplarına göre şekilleniyor.', 'Der Vergleich richtet sich nach deinen Antworten, nicht nach einer generischen Rangliste.'],
    },
    {
      title: ['Running current web research', 'Güncel web araştırması yapılıyor', 'Aktuelle Webrecherche läuft'],
      detail: ['Current status, review sentiment and market signals are checked for each product.', 'Her ürün için güncel durum, yorum eğilimi ve pazar sinyalleri kontrol ediliyor.', 'Aktueller Status, Review-Signale und Marktdaten werden je Produkt geprüft.'],
    },
    {
      title: ['Comparing specs head-to-head', 'Özellikler karşılıklı karşılaştırılıyor', 'Specs werden direkt verglichen'],
      detail: ['Strengths are judged inside the same category and size class.', 'Güçlü yönler aynı kategori ve boyut sınıfı içinde değerlendiriliyor.', 'Stärken werden innerhalb derselben Kategorie und Größenklasse bewertet.'],
    },
    {
      title: ['Scoring the best fit for you', 'Sana en uygunu puanlanıyor', 'Beste Wahl wird bewertet'],
      detail: ['Trade-offs, risks and long-term value are converted into the final score matrix.', 'Tavizler, riskler ve uzun vadeli değer final skor matrisine dönüştürülüyor.', 'Kompromisse, Risiken und Langzeitwert fließen in die finale Matrix ein.'],
    },
    {
      title: ['Composing the verdict', 'Sonuç hazırlanıyor', 'Fazit wird erstellt'],
      detail: ['The final recommendation is checked for freshness and consistency before display.', 'Final öneri görünmeden önce güncellik ve tutarlılık kontrolünden geçiyor.', 'Die Empfehlung wird vor der Anzeige auf Aktualität und Konsistenz geprüft.'],
    },
  ],
};

export default function AiLoadingSteps({ lang = 'en', mode = 'product' }) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const L = (s) => (code === 'tr' ? s[1] : code === 'de' ? s[2] : s[0]);
  const steps = STEP_SETS[mode] || STEP_SETS.product;
  const [active, setActive] = useState(0);
  const progress = Math.round(((active + 1) / steps.length) * 100);

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
        <div>
          <b>{code === 'tr' ? 'Qor AI raporu hazırlıyor' : code === 'de' ? 'Qor AI bereitet den Bericht vor' : 'Qor AI is preparing the report'}</b>
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
