import { useEffect, useState } from 'react';
import { askQorAi } from '../lib/ai';
import { analyzeLink, generateQuiz, enhancedAnalysis } from '../lib/linkAnalysis';
import { trackEvent } from '../lib/analytics';
import { saveLinkAnalysisHistory } from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth';
import { aiUserProfile } from '../lib/qorCoins';
import { useAiAccess } from '../lib/useAiAccess';
import AiText from '../components/AiText.jsx';
import QuizFlow from '../components/QuizFlow.jsx';
import Gauge, { techColor } from '../components/Gauge.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import HowItWorks from '../components/HowItWorks.jsx';
import Reveal from '../components/Reveal.jsx';
import PageHero from '../components/PageHero.jsx';
import { useSeo } from '../lib/seo';
import './LinkAnalysis.css';

const MAX_LINKS = 4;
const PENDING_LINK_KEY = 'qor.pendingLinkAnalysis';

// Compare mode keeps the app's "identify the exact product, never substitute"
// rule but runs as a single combined verdict (no per-link quiz).
function comparePrompt(urls, lang, userProfile = {}) {
  const profile = Object.keys(userProfile || {}).length
    ? `\n\nUser profile context:\n${JSON.stringify(userProfile)}`
    : '';
  return (
    "You are Qor AI's product comparison engine.\n" +
    'Analyze these product URLs exactly:\n' +
    urls.map((u, i) => `${i + 1}. ${u}`).join('\n') +
    '\n\nRules:\n' +
    '- Identify each exact product from its URL/domain/slug. Do not substitute nearby models.\n' +
    '- If any product is uncertain, keep it in the comparison and mark it uncertain.\n' +
    '- Compare only what can be reasonably inferred; do not invent live prices.\n' +
    '- End with a clear recommendation for different user types.\n' +
    '- Write a long-form report, not a short summary. Cover exact product identification, category fit, technical/practical differences, ownership risks, durability, community sentiment, value and final decision.\n' +
    profile +
    '\n\n' +
    'Output with **bold** headings: Products identified, Head-to-head, Strengths and weaknesses, Community/reviewer signal, Best fit scenarios, Qor AI verdict. ' +
    'Use several paragraphs under each heading and specific bullets where useful. ' +
    `Use "-" bullets. Reply ONLY in the language with ISO code: ${lang}.`
  );
}

function bandLabel(s, L) {
  return s >= 85 ? L('Excellent match', 'Mükemmel uyum', 'Exzellent')
    : s >= 70 ? L('Strong match', 'Güçlü uyum', 'Starke Übereinstimmung')
      : s >= 50 ? L('Fair match', 'Orta uyum', 'Mäßig')
        : L('Weak match', 'Zayıf uyum', 'Schwach');
}

function FactorBars({ factors = [] }) {
  if (!factors.length) return null;
  return (
    <div className="la-factors">
      {factors.map((f) => (
        <div className="la-factor" key={f.label}>
          <div className="la-factor-top">
            <span>{f.emoji} {f.label}</span>
            <b style={{ color: techColor(f.score) }}>{Math.round(f.score)}</b>
          </div>
          <div className="la-factor-bar"><i style={{ width: `${Math.max(4, Math.min(100, f.score))}%`, background: techColor(f.score) }} /></div>
        </div>
      ))}
    </div>
  );
}

function fallbackEnhancedResult(base) {
  return {
    base,
    enhancedScore: Number(base?.score) || 60,
    factors: [],
    verdict: String(base?.analysis || ''),
    prosForUser: [],
    consForUser: [],
    alternatives: [],
    personaScore: null,
    personaAnalysis: '',
    communityScore: null,
    communityAnalysis: '',
    overallVerdict: '',
  };
}

function LoadingWorkboard({ phase, isCompare, L, t }) {
  const [step, setStep] = useState(0);
  const copy = (() => {
    if (isCompare && phase === 'analyzing') {
      return {
        title: L('Comparing links', 'Linkler karşılaştırılıyor', 'Links werden verglichen'),
        detail: L('Qor AI is weighing each product side by side.',
          'Qor AI her ürünü yan yana tartıyor.',
          'Qor AI gewichtet jedes Produkt nebeneinander.'),
        steps: [
          L('Validating product links', 'Ürün linkleri doğrulanıyor', 'Produktlinks werden geprüft'),
          L('Identifying each exact product', 'Her ürün tek tek tanınıyor', 'Jedes Produkt wird erkannt'),
          L('Weighing strengths and trade-offs', 'Artılar, eksiler ve farklar tartılıyor', 'Stärken und Kompromisse werden abgewogen'),
          L('Writing the final recommendation', 'Nihai öneri yazılıyor', 'Empfehlung wird geschrieben'),
        ],
      };
    }
    if (phase === 'identifying') {
      return {
        title: L('Identifying the product', 'Ürün tanımlanıyor', 'Produkt wird erkannt'),
        detail: L('Qor AI reads the URL, store signal, and product slug first.',
          'Qor AI önce URL, mağaza ve ürün adı sinyallerini okuyor.',
          'Qor AI liest zuerst URL, Shop-Signal und Produktslug.'),
        steps: [
          L('Checking the link format', 'Bağlantı formatı kontrol ediliyor', 'Linkformat wird geprüft'),
          L('Reading store and product signals', 'Mağaza ve ürün sinyalleri okunuyor', 'Shop- und Produktsignale werden gelesen'),
          L('Detecting the category', 'Kategori algılanıyor', 'Kategorie wird erkannt'),
          L('Preparing the base analysis', 'Baz analiz hazırlanıyor', 'Basisanalyse wird vorbereitet'),
        ],
      };
    }
    if (phase === 'quizLoading') {
      return {
        title: L('Preparing your quiz', 'Quiz hazırlanıyor', 'Quiz wird vorbereitet'),
        detail: L('Questions are tuned to this product, not a generic profile form.',
          'Sorular genel profil formu değil, bu ürüne göre hazırlanıyor.',
          'Die Fragen werden auf dieses Produkt zugeschnitten.'),
        steps: [
          L('Product context is locked', 'Ürün bağlamı sabitlendi', 'Produktkontext ist fixiert'),
          L('Usage scenarios are mapped', 'Kullanım senaryoları çıkarılıyor', 'Nutzungsszenarien werden abgebildet'),
          L('Category-specific questions are written', 'Kategoriye özel sorular yazılıyor', 'Kategoriespezifische Fragen werden erstellt'),
          L('Answer choices are balanced', 'Cevap seçenekleri dengeleniyor', 'Antwortoptionen werden ausbalanciert'),
        ],
      };
    }
    return {
      title: t('la.loading'),
      detail: L('Qor AI turns your answers into a personal match report.',
        'Qor AI cevaplarını kişisel eşleşme raporuna çeviriyor.',
        'Qor AI macht aus deinen Antworten einen persönlichen Match-Bericht.'),
      steps: [
        L('Reading quiz answers', 'Quiz cevapları okunuyor', 'Quizantworten werden gelesen'),
        L('Scoring match factors', 'Uyum faktörleri puanlanıyor', 'Match-Faktoren werden bewertet'),
        L('Summarizing reviews and risks', 'Yorumlar ve riskler özetleniyor', 'Bewertungen und Risiken werden zusammengefasst'),
        L('Building the final verdict', 'Son karar hazırlanıyor', 'Endgültiges Fazit wird erstellt'),
      ],
    };
  })();

  useEffect(() => {
    setStep(0);
    const timer = setInterval(() => setStep((n) => (n + 1) % copy.steps.length), 1350);
    return () => clearInterval(timer);
  }, [phase, isCompare, copy.steps.length]);

  return (
    <div className="la-loading fade-up" role="status" aria-live="polite">
      <div className="la-load-orb" aria-hidden="true">
        <span className="la-load-ring" />
        <span className="la-load-core" />
      </div>
      <div className="la-load-copy">
        <strong>{copy.title}</strong>
        <span>{copy.detail}</span>
      </div>
      <div className="la-load-steps">
        {copy.steps.map((label, i) => (
          <div key={label} className={'la-load-step' + (i === step ? ' active' : '') + (i < step ? ' done' : '')}>
            <i aria-hidden="true">{i < step ? '✓' : i + 1}</i>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EnhancedResult({ data, L }) {
  const score = Math.round(data.enhancedScore || 0);
  // History entries saved by older builds may miss the array fields — guard so
  // opening them never crashes the page.
  const pros = Array.isArray(data.prosForUser) ? data.prosForUser : [];
  const cons = Array.isArray(data.consForUser) ? data.consForUser : [];
  const alts = Array.isArray(data.alternatives) ? data.alternatives : [];
  const base = data.base || {};
  return (
    <div className="la-result fade-up">
      <div className="la-result-head">
        <span>{L('Qor AI Analysis', 'Qor AI Analizi', 'Qor AI Analyse')}</span>
        <span className="la-result-title">{base.title}</span>
      </div>
      <div className="la-result-body">
        <div className="la-score-row">
          <Gauge value={score} size={92} stroke={8} color={techColor(score)} fontSize={26} />
          <div>
            <div className="la-score-band" style={{ color: techColor(score) }}>{bandLabel(score, L)}</div>
            <div className="la-score-sub">{L('Personalized match score', 'Kişiselleştirilmiş uyum skoru', 'Personalisierter Match-Score')}</div>
            {base.siteName && <div className="la-score-site">{base.siteName}</div>}
          </div>
        </div>

        <FactorBars factors={data.factors} />

        {data.verdict && (
          <section className="la-sec">
            <h4>📋 {L('Verdict', 'Değerlendirme', 'Fazit')}</h4>
            <div className="la-prose"><AiText text={data.verdict} /></div>
          </section>
        )}

        {(pros.length > 0 || cons.length > 0) && (
          <div className="la-poncons">
            {pros.length > 0 && (
              <div className="la-pc la-pc-pro">
                <h4>✓ {L('Good for you', 'Senin için iyi', 'Gut für dich')}</h4>
                <ul>{pros.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            {cons.length > 0 && (
              <div className="la-pc la-pc-con">
                <h4>⚠ {L('Watch outs', 'Dikkat edilmesi gerekenler', 'Nachteile')}</h4>
                <ul>{cons.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        {alts.length > 0 && (
          <section className="la-sec">
            <h4>🔀 {L('Alternatives', 'Alternatifler', 'Alternativen')}</h4>
            <div className="la-alts">{alts.map((a, i) => <span className="la-alt" key={i}>{a}</span>)}</div>
          </section>
        )}

        {data.personaAnalysis && (
          <section className="la-sec">
            <h4>👤 {L('How it fits you', 'Sana uyumu', 'Wie es zu dir passt')}{data.personaScore ? ` · ${Math.round(data.personaScore)}` : ''}</h4>
            <div className="la-prose"><AiText text={data.personaAnalysis} /></div>
          </section>
        )}

        {data.communityAnalysis && (
          <section className="la-sec">
            <h4>🌐 {L('Community reception', 'Topluluk yorumu', 'Community-Echo')}{data.communityScore ? ` · ${Math.round(data.communityScore)}` : ''}</h4>
            <div className="la-prose"><AiText text={data.communityAnalysis} /></div>
          </section>
        )}

        {data.overallVerdict && (
          <section className="la-sec la-sec-final">
            <h4>🏁 {L('Final verdict', 'Son karar', 'Endgültiges Fazit')}</h4>
            <div className="la-prose"><AiText text={data.overallVerdict} /></div>
          </section>
        )}
      </div>
    </div>
  );
}

export default function LinkAnalysis() {
  const { t, lang } = useI18n();
  const { user, openAuth } = useAuth();
  const requireAiAccess = useAiAccess(lang);
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  useSeo({ title: `${t('la.title')} — Qor AI`, description: t('la.subtitle'), path: '/link-analysis' });

  const [urls, setUrls] = useState(['']);
  // phase: input | identifying | quizLoading | quiz | analyzing | result
  const [phase, setPhase] = useState('input');
  const [base, setBase] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [enhanced, setEnhanced] = useState(null);
  const [compareText, setCompareText] = useState('');
  const [histRefresh, setHistRefresh] = useState(0);
  const [err, setErr] = useState('');

  // One link → analysis, two+ → comparison. Fields auto-grow as links are
  // pasted (a fresh empty row appears), so there is no single/compare toggle.
  function setUrl(i, val) {
    setUrls((u) => {
      let next = u.map((x, idx) => (idx === i ? val : x));
      if (next[next.length - 1].trim() && next.length < MAX_LINKS) next = [...next, ''];
      while (next.length > 1 && !next[next.length - 1].trim() && !next[next.length - 2].trim()) {
        next = next.slice(0, -1);
      }
      return next;
    });
  }
  function removeUrl(i) {
    setUrls((u) => {
      const next = u.filter((_, idx) => idx !== i);
      return next.length ? next : [''];
    });
  }

  function resetFlow() {
    setPhase('input'); setBase(null); setQuestions([]); setEnhanced(null); setCompareText(''); setErr('');
  }

  function savePending(list) {
    localStorage.setItem(PENDING_LINK_KEY, JSON.stringify({ urls: list, ts: Date.now() }));
  }

  // ── Single-link flow: identify → quiz → enhanced analysis ────────
  async function startSingle(url) {
    setErr(''); setEnhanced(null); setCompareText('');
    setPhase('identifying');
    trackEvent('link_analysis', { count: 1 });
    try {
      const access = await requireAiAccess('link_analysis', { onMessage: setErr, requireQuiz: false });
      if (!access.ok) { setPhase('input'); return; }
      const profile = aiUserProfile(user);
      const result = await analyzeLink(url, lang, profile);
      setBase(result);
      if (result.isProduct === false && !result.title) {
        setErr(t('la.errFail')); setPhase('input'); return;
      }
      let qs = [];
      setPhase('quizLoading');
      try {
        qs = await generateQuiz({ category: result.category, productTitle: result.title, url, language: lang, userProfile: profile });
      } catch { qs = []; }
      if (qs.length) { setQuestions(qs); setPhase('quiz'); }
      else { await runEnhanced(result, []); } // no quiz available → analyze directly
    } catch {
      setErr(t('la.errFail')); setPhase('input');
    }
  }

  async function runEnhanced(baseResult, answers) {
    setPhase('analyzing');
    try {
      const data = await enhancedAnalysis({ base: baseResult, answers, language: lang, userProfile: aiUserProfile(user) });
      setEnhanced(data);
      setPhase('result');
      await saveLinkAnalysisHistory({ urls: [baseResult.url], analysis: data.verdict, type: 'single', result: data });
      setHistRefresh((n) => n + 1);
    } catch {
      const fallback = fallbackEnhancedResult(baseResult);
      setEnhanced(fallback);
      setErr('');
      setPhase('result');
      await saveLinkAnalysisHistory({ urls: [baseResult.url], analysis: fallback.verdict, type: 'single', result: fallback });
      setHistRefresh((n) => n + 1);
    }
  }

  // ── Compare flow: combined verdict, no quiz ──────────────────────
  async function runCompare(list) {
    setErr(''); setEnhanced(null); setCompareText('');
    setPhase('analyzing');
    trackEvent('link_analysis', { count: list.length });
    try {
      const access = await requireAiAccess('link_compare', { onMessage: setErr, requireQuiz: false });
      if (!access.ok) { setPhase('input'); return; }
      const text = await askQorAi([{ role: 'user', text: comparePrompt(list, lang, aiUserProfile(user)) }]);
      setCompareText(text);
      setPhase('result');
      await saveLinkAnalysisHistory({ urls: list, analysis: text, type: 'compare' });
      setHistRefresh((n) => n + 1);
    } catch {
      setErr(t('la.errFail')); setPhase('input');
    }
  }

  function analyze(e) {
    e.preventDefault();
    const list = urls.map((u) => u.trim()).filter(Boolean).slice(0, MAX_LINKS);
    if (!list.length) return;
    if (list.some((u) => !/^https?:\/\//i.test(u))) { setErr(t('la.errUrl')); return; }
    if (!user) {
      savePending(list);
      setErr(L('Sign in to continue. Your links are saved.', 'Devam etmek için giriş yap. Linklerin kaybolmayacak.', 'Melde dich an, um fortzufahren. Deine Links bleiben erhalten.'));
      openAuth();
      return;
    }
    if (list.length > 1) runCompare(list);
    else startSingle(list[0]);
  }

  useEffect(() => {
    if (!user) return;
    const raw = localStorage.getItem(PENDING_LINK_KEY);
    if (!raw) return;
    localStorage.removeItem(PENDING_LINK_KEY);
    try {
      const pending = JSON.parse(raw);
      const list = Array.isArray(pending.urls) ? pending.urls.slice(0, MAX_LINKS).filter(Boolean) : [];
      if (!list.length) return;
      setUrls(list.length < MAX_LINKS ? [...list, ''] : list);
      if (list.length > 1) runCompare(list); else startSingle(list[0]);
    } catch { /* ignore stale pending payloads */ }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const filled = urls.filter((u) => u.trim()).length;
  const showForm = phase === 'input';

  const howItWorks = [
    { icon: '🔗', grad: 'linear-gradient(135deg, var(--brand-blue), var(--brand-deep))',
      title: L('Paste Link', 'Bağlantıyı Yapıştır', 'Link einfügen'),
      desc: L('Paste any product link from 100+ stores — Qor AI identifies it.',
        '100+ mağazadan herhangi bir ürün linkini yapıştır — Qor AI ürünü tanır.',
        'Füge einen Produktlink aus 100+ Shops ein — Qor AI erkennt ihn.') },
    { icon: '💬', grad: 'linear-gradient(135deg, var(--brand-cyan), var(--brand-blue))',
      title: L('Community Voice', 'İnternet Yorumları', 'Community-Stimmen'),
      desc: L('Real user opinions gathered from Reddit, YouTube and forums.',
        'Reddit, YouTube ve forumlardan gerçek kullanıcı görüşlerini toplar.',
        'Echte Nutzermeinungen von Reddit, YouTube und Foren.') },
    { icon: '🎯', grad: 'linear-gradient(135deg, var(--brand-sky), var(--brand-cyan))',
      title: L('Personal Quiz', 'Kişisel Quiz', 'Persönliches Quiz'),
      desc: L('A few quick questions — each answer sharpens your match.',
        'Birkaç kısa soru; her yanıt sana özel eşleşmeyi keskinleştirir.',
        'Ein paar kurze Fragen — jede Antwort schärft deinen Match.') },
    { icon: '✨', grad: 'linear-gradient(135deg, var(--brand-cyan), #10B981)',
      title: L('Match Score', 'Eşleşme Skoru', 'Match-Score'),
      desc: L('A compatibility score and detailed recommendation for your profile.',
        'Profiline göre kişisel uyum puanı ve detaylı öneri sunar.',
        'Ein Kompatibilitätsscore und eine detaillierte Empfehlung für dein Profil.') },
  ];

  return (
    <div className="la-page">
      <PageHero
        title={t('la.title')}
        subtitle={t('la.subtitle')}
        icon={(
          <svg width="31" height="31" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10.8" cy="10.8" r="5.7" />
            <path d="m15 15 4.4 4.4" />
            <path d="M18.2 3.4v3.2" />
            <path d="M16.6 5h3.2" />
            <path d="M5.2 18.2v2.4" />
            <path d="M4 19.4h2.4" />
          </svg>
        )}
      />

      <div className="container la-body">
      {showForm && (
        <>
          <Reveal className="la-stage">
            <form className="la-form" onSubmit={analyze}>
              <div className="la-form-head">
                <strong>{L('Paste product links', 'Ürün linklerini yapıştır', 'Produktlinks einfügen')}</strong>
                <span>{filled > 1
                  ? L('Comparison mode — analyzing side by side', 'Karşılaştırma modu — yan yana analiz', 'Vergleichsmodus — Seite an Seite')
                  : L('Add a second link to compare', 'Karşılaştırmak için ikinci link ekle', 'Zweiten Link zum Vergleichen hinzufügen')}</span>
              </div>
              <div className="la-rows">
                {urls.map((url, i) => (
                  <div className="la-row" key={i}>
                    <span className="la-row-no">{i + 1}</span>
                    <input type="url" value={url} onChange={(e) => setUrl(i, e.target.value)}
                      placeholder={t('la.placeholder')} />
                    {urls.length > 1 && url.trim() && (
                      <button type="button" className="la-row-x" onClick={() => removeUrl(i)} aria-label="Remove">×</button>
                    )}
                  </div>
                ))}
              </div>

              <div className="la-actions">
                <button type="submit" className="btn btn-grad btn-lg btn-shine la-go" disabled={!filled}>
                  {filled > 1 ? t('la.analyzeMany', { n: filled }) : L('Analyze with AI', 'AI ile Analiz Et', 'Mit KI analysieren')}
                </button>
              </div>
            </form>
          </Reveal>

          <Reveal delay={90}>
            <HowItWorks title={L('How it works', 'Nasıl çalışır', 'So funktioniert’s')} steps={howItWorks} />
          </Reveal>

          {user && (
            <Reveal delay={140} className="la-history">
              <HistoryPanel kind="link" lang={lang} refreshToken={histRefresh}
                onOpen={(it) => {
                  setUrls(it.urls.length ? it.urls.slice(0, MAX_LINKS) : ['']);
                  if (it.result && it.result.base) {
                    setEnhanced(it.result);
                    setCompareText('');
                  } else {
                    setEnhanced(null);
                    setCompareText(String(it.analysis || ''));
                  }
                  setErr('');
                  setPhase('result');
                }} />
            </Reveal>
          )}
        </>
      )}

      {err && <div className="la-err">{err}</div>}

      {(phase === 'identifying' || phase === 'quizLoading' || phase === 'analyzing') && (
        <LoadingWorkboard phase={phase} isCompare={filled > 1} L={L} t={t} />
      )}

      {phase === 'quiz' && base && questions.length > 0 && (
        <>
          <div className="la-identified">
            <span className="la-identified-tag">{L('Product', 'Ürün', 'Produkt')}</span>
            <strong>{base.title}</strong>
            {base.category && <span className="la-identified-cat">{base.category}</span>}
          </div>
          <QuizFlow
            questions={questions}
            busy={false}
            title={L('Tune the analysis', 'Analizi kişiselleştir', 'Analyse anpassen')}
            subtitle={L('Tell Qor AI how you would use it for a match score made for you.',
              'Qor AI’ya nasıl kullanacağını söyle, sana özel uyum skoru çıksın.',
              'Sag Qor AI, wie du es nutzt — für einen Score, der zu dir passt.')}
            onSubmit={(answers) => runEnhanced(base, answers)}
            onSkip={() => runEnhanced(base, [])}
          />
        </>
      )}

      {phase === 'result' && enhanced && <EnhancedResult data={enhanced} L={L} />}

      {phase === 'result' && compareText && (
        <div className="la-result fade-up">
          <div className="la-result-head"><span>{t('la.resultHead')}</span></div>
          <div className="la-result-body"><AiText text={compareText} /></div>
        </div>
      )}

      {phase === 'result' && (
        <div className="la-again">
          <button type="button" className="btn btn-ghost" onClick={resetFlow}>
            {L('Analyze another link', 'Başka bir link analiz et', 'Weiteren Link analysieren')}
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
