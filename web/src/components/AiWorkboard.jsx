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
// Steps light up in order and HOLD on the operation that is genuinely running
// (driven by the real pipeline `stage` when the caller has one) — it never loops
// back to the start "for decoration", so the label always reflects the actual
// current step. Every report flow now runs a real grounded internet-review scan,
// so that step is a REAL one in the list, not filler.
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
    detail: ['Questions are tuned to this product — and the review scan is already running in the background.', 'Sorular bu ürüne göre hazırlanıyor — yorum taraması da arka planda çoktan başladı.', 'Die Fragen werden zugeschnitten — der Bewertungs-Scan läuft schon im Hintergrund.'],
    steps: [
      ['Product context is locked', 'Ürün bağlamı sabitlendi', 'Produktkontext ist fixiert'],
      ['Usage scenarios are mapped', 'Kullanım senaryoları çıkarılıyor', 'Nutzungsszenarien werden abgebildet'],
      ['Category-specific questions are written', 'Kategoriye özel sorular yazılıyor', 'Kategoriespezifische Fragen werden erstellt'],
      ['Answer choices are balanced', 'Cevap seçenekleri dengeleniyor', 'Antwortoptionen werden ausbalanciert'],
    ],
  },
  linkAnalyze: {
    title: ['Building your report', 'Raporun hazırlanıyor', 'Bericht wird erstellt'],
    detail: ['Qor AI reads real owner reviews, then turns your answers into a personal match report.', 'Qor AI gerçek kullanıcı yorumlarını okuyup cevaplarını kişisel eşleşme raporuna çeviriyor.', 'Qor AI liest echte Nutzerbewertungen und macht daraus deinen Match-Bericht.'],
    steps: [
      ['Reading your quiz answers', 'Quiz cevapların okunuyor', 'Deine Quizantworten werden gelesen'],
      ['Applying your profile signals', 'Profil sinyallerin uygulanıyor', 'Deine Profilsignale werden angewendet'],
      ['Scanning internet reviews and forums', 'İnternet yorumları ve forumlar taranıyor', 'Bewertungen und Foren werden gescannt'],
      ['Scoring match factors', 'Uyum faktörleri puanlanıyor', 'Match-Faktoren werden bewertet'],
      ['Extracting critical points and risks', 'Kritik noktalar ve riskler çıkarılıyor', 'Kritische Punkte und Risiken werden extrahiert'],
      ['Composing your personal report', 'Kişisel raporun yazılıyor', 'Dein persönlicher Bericht wird geschrieben'],
    ],
  },
  linkCompare: {
    title: ['Comparing links', 'Linkler karşılaştırılıyor', 'Links werden verglichen'],
    detail: ['Qor AI weighs each product side by side against real owner feedback.', 'Qor AI her ürünü gerçek kullanıcı geri bildirimiyle yan yana tartıyor.', 'Qor AI gewichtet jedes Produkt anhand echter Rückmeldungen.'],
    steps: [
      ['Reading your quiz answers', 'Quiz cevapların okunuyor', 'Deine Quizantworten werden gelesen'],
      ['Locking each exact product', 'Her ürün tek tek sabitleniyor', 'Jedes Produkt wird fixiert'],
      ['Scanning internet reviews and forums', 'İnternet yorumları ve forumlar taranıyor', 'Bewertungen und Foren werden gescannt'],
      ['Weighing strengths and trade-offs', 'Artılar, eksiler ve farklar tartılıyor', 'Stärken und Kompromisse werden abgewogen'],
      ['Finding the decisive differences', 'Belirleyici farklar bulunuyor', 'Entscheidende Unterschiede werden gesucht'],
      ['Writing the final recommendation', 'Nihai öneri yazılıyor', 'Empfehlung wird geschrieben'],
    ],
  },
  // Subscription analysis flow
  subQuiz: {
    title: ['Preparing your subscription quiz', 'Abonelik quizin hazırlanıyor', 'Abo-Quiz wird vorbereitet'],
    detail: ['Questions adapt to the selected service type — the review scan already started.', 'Sorular seçilen abonelik türüne göre uyarlanıyor — yorum taraması çoktan başladı.', 'Die Fragen passen sich dem Diensttyp an — der Bewertungs-Scan läuft bereits.'],
    steps: [
      ['Reading the selected services', 'Seçilen abonelikler okunuyor', 'Ausgewählte Dienste werden gelesen'],
      ['Detecting the service category', 'Servis kategorisi algılanıyor', 'Dienstkategorie wird erkannt'],
      ['Mapping usage scenarios', 'Kullanım senaryoları çıkarılıyor', 'Nutzungsszenarien werden abgebildet'],
      ['Writing targeted questions', 'Hedefli sorular yazılıyor', 'Gezielte Fragen werden erstellt'],
    ],
  },
  subAnalyze: {
    title: ['Analyzing subscription', 'Abonelik analiz ediliyor', 'Abo wird analysiert'],
    detail: ['Qor AI reads what real subscribers say, then matches it to your habits.', 'Qor AI gerçek abonelerin ne dediğini okuyup alışkanlıklarınla eşleştiriyor.', 'Qor AI liest echte Abonnentenstimmen und gleicht sie mit deinen Gewohnheiten ab.'],
    steps: [
      ['Reading your quiz answers', 'Quiz cevapların okunuyor', 'Deine Quizantworten werden gelesen'],
      ['Applying your profile signals', 'Profil sinyallerin uygulanıyor', 'Deine Profilsignale werden angewendet'],
      ['Scanning subscriber reviews and forums', 'Abone yorumları ve forumlar taranıyor', 'Abonnentenbewertungen werden gescannt'],
      ['Evaluating content and feature fit', 'İçerik ve özellik uyumu değerlendiriliyor', 'Inhalts- und Funktionsfit wird bewertet'],
      ['Scoring retention and cancel risk', 'Tutma değeri ve iptal riski puanlanıyor', 'Bindung und Kündigungsrisiko werden bewertet'],
      ['Building your usage plan', 'Kullanım planın hazırlanıyor', 'Dein Nutzungsplan wird erstellt'],
    ],
  },
  subCompare: {
    title: ['Comparing subscriptions', 'Abonelikler karşılaştırılıyor', 'Abos werden verglichen'],
    detail: ['Qor AI reads what real subscribers say about each one, then picks your winner.', 'Qor AI her servis için gerçek abone yorumlarını okuyup sana uygun olanı seçiyor.', 'Qor AI liest echte Abonnentenstimmen und wählt deinen Gewinner.'],
    steps: [
      ['Reading your quiz answers', 'Quiz cevapların okunuyor', 'Deine Quizantworten werden gelesen'],
      ['Applying your profile signals', 'Profil sinyallerin uygulanıyor', 'Deine Profilsignale werden angewendet'],
      ['Scanning subscriber reviews and forums', 'Abone yorumları ve forumlar taranıyor', 'Abonnentenbewertungen werden gescannt'],
      ['Comparing catalogues and features', 'İçerik ve özellikler karşılaştırılıyor', 'Kataloge und Funktionen werden verglichen'],
      ['Finding the decisive differences', 'Belirleyici farklar bulunuyor', 'Entscheidende Unterschiede werden gesucht'],
      ['Building the final recommendation', 'Nihai öneri hazırlanıyor', 'Empfehlung wird erstellt'],
    ],
  },
};

// GERÇEK boru hattı aşaması → aydınlanabilecek EN İLERİ adım (orada BEKLER).
// Aşama bildirilmediğinde tahta son adıma kadar doldurup "%100" gösteriyordu:
// iş hâlâ sürerken ekran bitmiş gibi duruyordu ("animasyonlar sisteme göre
// değil, başını alıp giden döngü"). Artık aşama yoksa SON ADIMA GİRİLMEZ.
const STAGE_CEIL = { prep: 1, research: 2, report: 4, composing: 99, saving: 99 };

export default function AiWorkboard({
  lang = 'en', mode = 'product', stage = null, startedAt = null, note = '',
}) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const L = (a) => (code === 'tr' ? a[1] : code === 'de' ? a[2] : a[0]);
  const set = SETS[mode] || SETS.product;
  const steps = set.steps;
  const lastIdx = steps.length - 1;
  // With a real stage, cap progress at that phase so the lit step is the actual
  // current operation. Without one, hold one step SHORT of the end — the board
  // must never claim the work is finished while it is still running.
  const ceil = stage == null
    ? Math.max(0, lastIdx - 1)
    : Math.min(lastIdx, STAGE_CEIL[stage] ?? lastIdx);
  const [active, setActive] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const rootRef = useRef(null);
  // Yüzde de artık dürüst: iş sürerken %100 YAZILMAZ (en fazla %95).
  const rawPct = ((active + 1) / steps.length) * 100;
  const pct = Math.min(95, Math.round(rawPct));

  // GEÇEN SÜRE işin GERÇEK başlangıcından sayılır. Eskiden bileşen her monte
  // olduğunda sıfırlanıyordu; kullanıcı başka sayfaya gidip döndüğünde sayaç
  // "0 sn"den başlıyor ve analiz sanki yeni başlamış gibi görünüyordu —
  // "sayfaya gelene kadar iş ilerlemiyor" izleniminin asıl kaynağı buydu.
  const startMs = (() => {
    const n = startedAt ? Date.parse(startedAt) : NaN;
    return Number.isFinite(n) ? n : null;
  })();
  const startRef = useRef(startMs || Date.now());
  if (startMs && startRef.current !== startMs) startRef.current = startMs;
  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startRef.current) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startMs, mode]);

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

  const ringR = 26;
  const ringC = 2 * Math.PI * ringR;

  return (
    <div className="aiwb" role="status" aria-live="polite" ref={rootRef}>
      <span className="aiwb-edge" aria-hidden="true" />

      {/* Dönen kıvılcım küresi KALDIRILDI (2026-08-08): süs olmaktan öte bilgi
          taşımıyordu ve ekranın en dikkat çeken öğesi oydu. İlerlemeyi anlatan
          şeyler kaldı: yüzde halkası, çubuk, zaman çizelgesi, canlı adım. */}
      <div className="aiwb-head">
        <div className="aiwb-copy">
          <span className="aiwb-kicker">
            <i aria-hidden="true" />
            {L(['Qor AI is working', 'Qor AI çalışıyor', 'Qor AI arbeitet'])}
          </span>
          <strong>{L(set.title)}</strong>
          {/* ŞU AN NE YAPILIYOR — sabit tanıtım cümlesi yerine canlı iş adı.
              Kullanıcı "o an hangi işlemin yapıldığı yazmıyor" dedi. */}
          <span className="aiwb-detail">
            <b>{L(['Now', 'Şu an', 'Jetzt'])}:</b> {L(steps[Math.min(active, lastIdx)])}
          </span>
          {note ? <span className="aiwb-subnote">{note}</span> : null}
        </div>

        <div className="aiwb-gauge" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="64" height="64">
            <circle cx="32" cy="32" r={ringR} className="aiwb-gauge-track" />
            <circle
              cx="32" cy="32" r={ringR}
              className="aiwb-gauge-fill"
              strokeDasharray={ringC}
              strokeDashoffset={ringC - (pct / 100) * ringC}
            />
          </svg>
          <b>{pct}%</b>
        </div>
      </div>

      <div className="aiwb-meter" role="progressbar"
        aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={active + 1}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="aiwb-status">
        <span>{L(['Step', 'Adım', 'Schritt'])} {active + 1}/{steps.length}</span>
        <span className="aiwb-elapsed">
          {elapsed < 60 ? `${elapsed} ${L(['s', 'sn', 's'])}`
            : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`}
        </span>
      </div>

      <ol className="aiwb-steps">
        {steps.map((s, i) => (
          <li key={i} className={'aiwb-step' + (i === active ? ' active' : '') + (i < active ? ' done' : '')}>
            <span className="aiwb-dot" aria-hidden="true">
              {i < active ? (
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : i + 1}
            </span>
            <span className="aiwb-step-label">{L(s)}</span>
            {i === active && <span className="aiwb-live" aria-hidden="true"><i /><i /><i /></span>}
          </li>
        ))}
      </ol>

      {/* Ne geldiğinin önizlemesi: boş bir bekleme ekranı yerine raporun
          iskeleti. "Uzun sürüyor ama bir şey geliyor" hissini veren şey bu. */}
      <div className="aiwb-skeleton" aria-hidden="true">
        <div className="aiwb-sk-row">
          <span className="aiwb-sk-ring" />
          <div className="aiwb-sk-lines">
            <span className="aiwb-sk-line w70" />
            <span className="aiwb-sk-line w45" />
          </div>
        </div>
        <div className="aiwb-sk-bars">
          <span className="aiwb-sk-bar" style={{ '--w': '82%' }} />
          <span className="aiwb-sk-bar" style={{ '--w': '64%' }} />
          <span className="aiwb-sk-bar" style={{ '--w': '73%' }} />
          <span className="aiwb-sk-bar" style={{ '--w': '48%' }} />
        </div>
      </div>

      <p className="aiwb-note">
        {L([
          'You can keep browsing — this keeps running in the background and Qor AI will ping you when it is ready.',
          'Gezinmeye devam edebilirsin — analiz arka planda sürer, hazır olunca Qor AI seni uyarır.',
          'Du kannst weiter browsen — die Analyse läuft im Hintergrund weiter und Qor AI meldet sich.',
        ])}
      </p>
    </div>
  );
}
