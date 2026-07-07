import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscriptionCategory, subscriptionsMixCategories, validateSubscriptionInput } from '../lib/linkAnalysis';
import {
  clearSubscriptionAnalysisJob,
  startSubscriptionAnalysisJob,
  submitSubscriptionAnalysisJobAnswers,
  subscribeSubscriptionAnalysisJob,
} from '../lib/subscriptionAnalysisJobs';
import { trackEvent } from '../lib/analytics';
import { getRecentProducts } from '../lib/recentViewed';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth';
import { aiUserProfile, hasCompletedQuiz } from '../lib/qorCoins';
import { useAiAccess } from '../lib/useAiAccess';
import AiText from '../components/AiText.jsx';
import Gauge, { techColor } from '../components/Gauge.jsx';
import {
  BarFill,
  Collapsible,
  DecisionBadge,
  SentimentDonut,
  normalizeSentiment,
} from '../components/AiCharts.jsx';
import SubLogo from '../components/SubLogo.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import HowItWorks from '../components/HowItWorks.jsx';
import QuizFlow from '../components/QuizFlow.jsx';
import AiWorkboard from '../components/AiWorkboard.jsx';
import Reveal from '../components/Reveal.jsx';
import PageHero from '../components/PageHero.jsx';
import { useSeo } from '../lib/seo';
import './Subscriptions.css';

// Browsing history → compact signal the analysis can blend in (app parity:
// the recommendation factors in what you've actually been looking at).
function browsingSignal() {
  try {
    return getRecentProducts().slice(0, 10).map((p) => ({
      name: p.name, category: p.category, brand: p.brand,
    })).filter((x) => x.name);
  } catch { return []; }
}

// Every supported service in one flat list — no category tabs. Same-category
// enforcement still happens at analysis time (subscriptionsMixCategories), so a
// user can stack many services of one type and compare them all at once.
const PRESET_GROUPS = [
  { id: 'video', items: ['Netflix', 'Disney+', 'Amazon Prime', 'Apple TV+', 'HBO Max', 'BluTV', 'Exxen', 'Gain', 'MUBI', 'YouTube Premium', 'Crunchyroll', 'beIN Sports', 'TOD', 'Tabii', 'Paramount+', 'Peacock', 'Hulu'] },
  { id: 'music', items: ['Spotify', 'Apple Music', 'YouTube Music', 'Tidal', 'Deezer', 'Amazon Music', 'Fizy', 'SoundCloud Go'] },
  { id: 'ai', items: ['ChatGPT Plus', 'Claude Pro', 'Gemini Advanced', 'Perplexity', 'Microsoft Copilot', 'Midjourney', 'Grok', 'DeepSeek'] },
  { id: 'cloud', items: ['Microsoft 365', 'Google One', 'iCloud+', 'Dropbox', 'Notion', 'Canva', 'Google Workspace', 'pCloud'] },
  { id: 'gaming', items: ['Xbox Game Pass', 'PlayStation Plus', 'Nintendo Switch Online', 'GeForce Now', 'EA Play', 'Ubisoft+', 'Apple Arcade'] },
];
const PRESETS = [...new Set(PRESET_GROUPS.flatMap((g) => g.items))];
// Only the 20 most popular show as square logo tiles; anything else is added via
// the "Type a subscription" box.
const TOP20 = [
  'Netflix', 'Disney+', 'Amazon Prime', 'Apple TV+', 'HBO Max', 'YouTube Premium',
  'BluTV', 'Exxen', 'Crunchyroll', 'Spotify', 'Apple Music', 'YouTube Music',
  'Tidal', 'ChatGPT Plus', 'Claude Pro', 'Gemini Advanced', 'Perplexity', 'Midjourney',
  'Xbox Game Pass', 'PlayStation Plus', 'Microsoft 365', 'Google One', 'iCloud+',
  'Adobe Creative Cloud', 'Notion', 'Canva', 'Hostinger',
];
const PENDING_SUBS_KEY = 'qor.pendingSubscriptionAnalysis';

function list(v) {
  return Array.isArray(v) ? v.filter((x) => x != null && String(x).trim()) : [];
}

// Horizontal bar chart comparing each service's overall compatibility score —
// the "graph" the app shows above the per-service breakdown.
function ScoreChart({ services, L }) {
  const rows = (services || []).filter((s) => s && s.name).slice(0, 10);
  if (rows.length < 1) return null;
  const max = Math.max(100, ...rows.map((s) => Math.round(s.score || 0)));
  return (
    <div className="subs-chart">
      <div className="subs-chart-head">📊 {L('Compatibility scores', 'Uyum puanları', 'Kompatibilitätswerte')}</div>
      <div className="subs-chart-rows">
        {rows.map((s, i) => {
          const v = Math.round(s.score || 0);
          const col = techColor(v);
          return (
            <div className="subs-chart-row" key={s.name}>
              <span className="subs-chart-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
              <span className="subs-chart-label"><SubLogo name={s.name} size={20} radius={6} />{s.name}</span>
              <div className="subs-chart-track">
                <BarFill pct={Math.max(3, (v / max) * 100)} color={col} delay={i * 90} />
              </div>
              <b style={{ color: col }}>{v}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FactorMatrix({ services, L }) {
  const labels = [...new Set((services || []).flatMap((s) => list(s.factors).map((f) => f.label)))];
  if (!labels.length || !services?.length) return null;
  return (
    <div className="subs-matrix">
      <div className="subs-chart-head">🧭 {L('Factor breakdown', 'Faktör kırılımı', 'Faktorvergleich')}</div>
      {labels.map((label) => (
        <div className="subs-matrix-row" key={label}>
          <div className="subs-matrix-label">{label}</div>
          <div className="subs-matrix-bars">
            {services.map((s) => {
              const f = list(s.factors).find((x) => x.label === label);
              const score = Math.round(f?.score || 0);
              const color = techColor(score);
              return (
                <div className="subs-mini" key={`${s.name}-${label}`}>
                  <span><SubLogo name={s.name} size={18} radius={5} />{s.name}</span>
                  <div><BarFill pct={Math.max(4, Math.min(100, score))} color={color} /></div>
                  <b style={{ color }}>{score}</b>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ServiceCard({ s, isWinner, L }) {
  const score = Math.round(s.score || 0);
  // History entries saved by older builds may miss the array fields.
  const factors = list(s.factors);
  const pros = list(s.pros);
  const cons = list(s.cons);
  const risks = list(s.risks);
  const features = list(s.features);
  // Topluluk sentiment donutu — s.sentiment yoksa skordan türetilir (spec §4B).
  const sentiment = normalizeSentiment(s.sentiment, score);
  return (
    <div className={'subs-svc' + (isWinner ? ' winner' : '')}>
      {isWinner && <span className="subs-svc-win">★ {L('Best fit', 'En uygun', 'Beste Wahl')}</span>}
      <div className="subs-svc-top">
        <SubLogo name={s.name} size={46} radius={12} />
        <Gauge value={score} size={56} stroke={5} color={techColor(score)} fontSize={16} />
        <div className="subs-svc-id">
          <strong>{s.name}</strong>
          {s.category && <span>{s.category}</span>}
          <div className="la-hero-badge"><DecisionBadge score={score} L={L} /></div>
        </div>
      </div>
      {s.explanation && <p className="subs-svc-exp">{s.explanation}</p>}
      <div className="aic-row">
        {factors.length > 0 && (
          <div className="subs-svc-factors" style={{ flex: '1 1 220px' }}>
            {factors.map((f, i) => (
              <div className="subs-svc-factor" key={f.label}>
                <span>{f.emoji ? `${f.emoji} ` : ''}{f.label.replace(/_/g, ' ')}</span>
                <b style={{ color: techColor(f.score) }}>{Math.round(f.score || 0)}</b>
                <div className="subs-svc-fbar"><BarFill pct={Math.max(4, Math.min(100, f.score))} color={techColor(f.score)} delay={i * 60} /></div>
              </div>
            ))}
          </div>
        )}
        <SentimentDonut breakdown={sentiment} L={L} compact />
      </div>
      {features.length > 0 && (
        <div className="subs-svc-features">
          {features.slice(0, 6).map((x, i) => (
            <span key={i}><b>{x.label}</b>{x.value}</span>
          ))}
        </div>
      )}
      <div className="subs-svc-pc">
        {pros.length > 0 && (
          <div className="subs-svc-list subs-svc-pros">
            <h4>✓ {L('Strengths', 'Güçlü yanlar', 'Stärken')}</h4>
            <ul>{pros.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}
        {cons.length > 0 && (
          <div className="subs-svc-list subs-svc-cons">
            <h4>⚠ {L('Trade-offs', 'Eksiler', 'Nachteile')}</h4>
            <ul>{cons.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}
      </div>
      {s.bestFor && <p className="subs-svc-best">🎯 {s.bestFor}</p>}
      {/* Uzun topluluk metni + risk notları varsayılan kapalı (spec §5). */}
      {(s.community || risks.length > 0) && (
        <Collapsible label={`📖 ${L('Detailed analysis', 'Detaylı analiz', 'Detaillierte Analyse')}`}>
          {risks.length > 0 && (
            <div className="subs-svc-risks">
              <h4>🛡 {L('Risk notes', 'Risk notları', 'Risikohinweise')}</h4>
              <ul>{risks.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {s.community && (
            <section className="subs-svc-section">
              <h4>🌐 {L('Community signal', 'Topluluk sinyali', 'Community-Signal')}</h4>
              <AiText text={s.community} />
            </section>
          )}
        </Collapsible>
      )}
    </div>
  );
}

function SubsLoadingWorkboard({ phase, count, L, t }) {
  const [step, setStep] = useState(0);
  const copy = (() => {
    if (phase === 'quizLoading') {
      return {
        title: L('Preparing your subscription quiz', 'Abonelik quizin hazırlanıyor', 'Abo-Quiz wird vorbereitet'),
        detail: L('Qor AI is adapting the questions to the selected service type.',
          'Qor AI soruları seçilen abonelik türüne göre uyarlıyor.',
          'Qor AI passt die Fragen an den ausgewählten Diensttyp an.'),
        steps: [
          L('Reading selected services', 'Seçilen abonelikler okunuyor', 'Ausgewählte Dienste werden gelesen'),
          L('Detecting service category', 'Servis kategorisi algılanıyor', 'Dienstkategorie wird erkannt'),
          L('Mapping usage scenarios', 'Kullanım senaryoları çıkarılıyor', 'Nutzungsszenarien werden abgebildet'),
          L('Writing targeted questions', 'Hedefli sorular yazılıyor', 'Gezielte Fragen werden erstellt'),
          L('Balancing answer choices', 'Cevap seçenekleri dengeleniyor', 'Antwortoptionen werden ausbalanciert'),
        ],
      };
    }
    return {
      title: count > 1
        ? L('Comparing subscriptions', 'Abonelikler karşılaştırılıyor', 'Abos werden verglichen')
        : L('Analyzing subscription', 'Abonelik analiz ediliyor', 'Abo wird analysiert'),
      detail: L('Qor AI is turning your quiz answers into a detailed match report.',
        'Qor AI quiz cevaplarını detaylı eşleşme raporuna çeviriyor.',
        'Qor AI macht aus deinen Antworten einen detaillierten Match-Bericht.'),
      steps: [
        L('Reading quiz answers', 'Quiz cevapları okunuyor', 'Quizantworten werden gelesen'),
        L('Evaluating content and feature fit', 'İçerik ve özellik uyumu değerlendiriliyor', 'Inhalts- und Funktionsfit wird bewertet'),
        L('Reviewing community signals', 'İnternet yorum sinyalleri değerlendiriliyor', 'Community-Signale werden bewertet'),
        L('Scoring retention and risk factors', 'Tutma değeri ve risk faktörleri puanlanıyor', 'Bindung und Risiken werden bewertet'),
        L('Building the final recommendation', 'Nihai öneri hazırlanıyor', 'Empfehlung wird erstellt'),
      ],
    };
  })();

  useEffect(() => {
    setStep(0);
    const timer = setInterval(() => setStep((n) => (n + 1) % copy.steps.length), 1350);
    return () => clearInterval(timer);
  }, [phase, copy.steps.length]);

  return (
    <div className="subs-loading-board fade-up" role="status" aria-live="polite">
      <div className="subs-load-orb" aria-hidden="true">
        <span className="subs-load-ring" />
        <span className="subs-load-core" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
            <path d="M18.5 14.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8.8-1.7z" />
          </svg>
        </span>
      </div>
      <div className="subs-load-copy">
        <strong>{copy.title || t('subs.loading')}</strong>
        <span>{copy.detail}</span>
      </div>
      <div className="subs-load-steps">
        {copy.steps.map((label, i) => (
          <div key={label} className={'subs-load-step' + (i === step ? ' active' : '') + (i < step ? ' done' : '')}>
            <i aria-hidden="true">{i < step ? '✓' : i + 1}</i>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Subscriptions() {
  const { t, lang } = useI18n();
  const { user, openAuth } = useAuth();
  const nav = useNavigate();
  const requireAiAccess = useAiAccess(lang);
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  useSeo({ title: `${t('subs.title')} — Qor AI`, description: t('subs.subtitle'), path: '/subscriptions' });

  const [selected, setSelected] = useState([]);
  const [custom, setCustom] = useState('');
  // phase: select | quizLoading | quiz | analyzing | result | history
  const [phase, setPhase] = useState('select');
  const [questions, setQuestions] = useState([]);
  const [pendingItems, setPendingItems] = useState([]);
  const [result, setResult] = useState(null);
  const [histEntry, setHistEntry] = useState(null);
  const [histRefresh, setHistRefresh] = useState(0);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  // name -> category key, so we can enforce "same category only" at ADD time
  // (app parity) even for AI-validated services that aren't in the local catalog.
  const [catMap, setCatMap] = useState({});
  const [activeJobId, setActiveJobId] = useState('');
  const lastSavedAt = useRef('');

  function profile() {
    return { ...aiUserProfile(user), recentlyViewed: browsingSignal() };
  }
  function resetAnalysis() {
    if (activeJobId) clearSubscriptionAnalysisJob(activeJobId);
    setActiveJobId('');
    setPhase('select');
    setResult(null);
    setHistEntry(null);
    setQuestions([]);
    setPendingItems([]);
    setErr('');
  }
  function mixedCatMsg() {
    return L('Only services of the same type can be compared (e.g. Netflix vs Disney+).',
      'Yalnızca aynı tür servisler karşılaştırılabilir (ör. Netflix ile Disney+).',
      'Nur Dienste desselben Typs können verglichen werden (z. B. Netflix vs Disney+).');
  }
  // The category currently locked in by the selection (first known category).
  function activeCategory() {
    for (const n of selected) {
      const c = catMap[n] || subscriptionCategory(n);
      if (c) return c;
    }
    return null;
  }
  function toggle(name) {
    if (selected.includes(name)) {
      setSelected((s) => s.filter((x) => x !== name));
      setCatMap((m) => { const next = { ...m }; delete next[name]; return next; });
      resetAnalysis();
      return;
    }
    // Adding a preset tile (always a known service) — enforce same category.
    const cat = subscriptionCategory(name);
    const active = activeCategory();
    if (active && cat && cat !== active) { setErr(mixedCatMsg()); return; }
    setSelected((s) => [...s, name]);
    if (cat) setCatMap((m) => ({ ...m, [name]: cat }));
    resetAnalysis();
  }
  // App-parity validation: known services resolve locally; anything unknown is
  // classified by the AI so a random word / link / product is rejected instead
  // of being added as a fake subscription. Same-category is enforced here too,
  // so you can't mix e.g. Spotify with Canva.
  async function addCustom(e) {
    e.preventDefault();
    const v = custom.trim();
    if (!v || adding) return;
    setErr('');
    setAdding(true);
    try {
      const res = await validateSubscriptionInput(v, selected, lang);
      if (res.error) { setErr(res.error); return; }
      const name = res.displayName || v;
      if (selected.some((s) => s.trim().toLowerCase() === name.toLowerCase())) {
        setCustom('');
        return;
      }
      const cat = res.category || subscriptionCategory(name);
      const active = activeCategory();
      if (active && cat && cat !== active) { setErr(mixedCatMsg()); return; }
      setSelected((s) => [...s, name]);
      if (cat) setCatMap((m) => ({ ...m, [name]: cat }));
      setCustom('');
      resetAnalysis();
    } finally {
      setAdding(false);
    }
  }

  function savePending(items) {
    localStorage.setItem(PENDING_SUBS_KEY, JSON.stringify({ selected: items, custom, ts: Date.now() }));
  }

  // Step 1: validate access, then run the app-matching subscription analysis.
  async function startAnalysis(items = selected) {
    setErr('');
    if (items.length < 1) return;
    if (subscriptionsMixCategories(items)) {
      setErr(L('Only services of the same type can be compared (e.g. Netflix vs Disney+).',
        'Yalnızca aynı tür servisler karşılaştırılabilir (ör. Netflix ile Disney+).',
        'Nur Dienste desselben Typs können verglichen werden (z. B. Netflix vs Disney+).'));
      return;
    }
    if (!user) {
      savePending(items);
      openAuth();
      return;
    }
    if (!hasCompletedQuiz(user)) {
      savePending(items);
      setErr(L('Complete the profile quiz first. Your subscriptions are saved.',
        'Önce profil quizini tamamla. Abonelik seçimlerin kaydedildi.',
        'Schließe zuerst das Profil-Quiz ab. Deine Auswahl bleibt gespeichert.'));
      nav(`/quiz?required=1&next=${encodeURIComponent('/subscriptions')}`);
      return;
    }
    try {
      const access = await requireAiAccess('subscription_analysis', { onMessage: setErr });
      if (!access.ok) { setPhase('select'); return; }
      setPendingItems(items);
      trackEvent('subscription_compare', { count: items.length });
      const job = startSubscriptionAnalysisJob({ services: items, language: lang, userProfile: profile() });
      setActiveJobId(job?.id || '');
    } catch {
      setErr(t('la.errFail'));
      setPhase('select');
    }
  }

  useEffect(() => subscribeSubscriptionAnalysisJob((job) => {
    if (!job) return;
    setActiveJobId(job.id || '');
    setPendingItems(job.services || []);
    if (job.services?.length) setSelected(job.services);
    setQuestions(job.questions || []);
    setResult(job.result || null);
    setHistEntry(null);
    setPhase(job.phase || 'select');
    if (job.error === 'ANALYSIS_FAILED' || job.error === 'QUIZ_FAILED') {
      setErr(t('la.errFail'));
    } else {
      setErr('');
    }
    if (job.savedAt && job.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = job.savedAt;
      setHistRefresh((n) => n + 1);
    }
  }), [t]);

  useEffect(() => {
    if (!user || !hasCompletedQuiz(user)) return;
    const raw = localStorage.getItem(PENDING_SUBS_KEY);
    if (!raw) return;
    localStorage.removeItem(PENDING_SUBS_KEY);
    try {
      const pending = JSON.parse(raw);
      const items = Array.isArray(pending.selected) ? pending.selected.filter(Boolean) : [];
      if (!items.length) return;
      setSelected(items);
      setCustom(pending.custom || '');
      startAnalysis(items);
    } catch { /* ignore stale pending payloads */ }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const showPicker = phase === 'select';
  const winnerName = result?.winner?.best || result?.winner?.overall || '';

  const howItWorks = [
    { icon: '💬', grad: 'linear-gradient(135deg, var(--brand-cyan), var(--brand-blue))',
      title: L('Community Voice', 'İnternet Yorumları', 'Community-Stimmen'),
      desc: L('Real user feedback from Reddit, forums, and social media with a positive/negative summary.',
        'Reddit, forum ve sosyal medyadan gerçek kullanıcı yorumları — olumlu/olumsuz özet.',
        'Echtes Feedback aus Reddit, Foren und Social Media mit Positiv-/Negativ-Zusammenfassung.') },
    { icon: '🎯', grad: 'linear-gradient(135deg, var(--brand-sky), var(--brand-cyan))',
      title: L('Personal Quiz', 'Kişisel Quiz', 'Persönliches Quiz'),
      desc: L('AI tailors questions to your habits so every answer sharpens the match.',
        'AI alışkanlıklarına göre sorular hazırlar — her cevap eşleşmeyi keskinleştirir.',
        'Die KI passt Fragen an deine Gewohnheiten an und personalisiert so das Ergebnis.') },
    { icon: '✨', grad: 'linear-gradient(135deg, var(--brand-cyan), #10B981)',
      title: L('Smart Match', 'Akıllı Eşleşme', 'Smart Match'),
      desc: L('Compatibility score and a detailed recommendation tuned to your profile.',
        'Profiline göre uyum puanı ve sana özel detaylı öneri.',
        'Kompatibilitätsscore und detaillierte Empfehlung passend zu deinem Profil.') },
  ];

  return (
    <div className="subs-page">
      <PageHero
        title={t('subs.title')}
        subtitle={t('subs.subtitle')}
        icon={(
          <img className="subs-hero-logo-img" src="/assets/qor_logo_512.png?v=20260605a" alt="" />
        )}
      />

      <div className="container subs-body">
      {showPicker && (
        <>
          <Reveal as="section" className="subs-picker-panel">
            <div className="subs-grid">
              {TOP20.map((name) => {
                const on = selected.includes(name);
                return (
                  <button key={name} type="button" title={name} aria-label={name}
                    className={'subs-tile' + (on ? ' active' : '')}
                    onClick={() => toggle(name)}>
                    <SubLogo name={name} size={44} radius={12} />
                    {on && <span className="subs-tile-check pop-in" aria-hidden="true">✓</span>}
                  </button>
                );
              })}
            </div>

            <form className="subs-custom" onSubmit={addCustom}>
              <input value={custom} onChange={(e) => setCustom(e.target.value)}
                placeholder={t('subs.customPlaceholder')} disabled={adding} />
              <button type="submit" className="btn btn-ghost" disabled={adding || !custom.trim()}>
                {adding ? L('Checking…', 'Kontrol ediliyor…', 'Wird geprüft…') : t('subs.add')}
              </button>
            </form>

            {selected.length > 0 && (
              <div className="subs-selected">
                {selected.map((s) => (
                  <span key={s} className="subs-chip">
                    <SubLogo name={s} size={22} radius={6} />
                    {s}<button onClick={() => toggle(s)} aria-label="Remove">×</button>
                  </span>
                ))}
              </div>
            )}

            {err && <div className="subs-err">{err}</div>}

            <button className="btn btn-grad btn-lg btn-shine subs-go"
              onClick={() => startAnalysis()} disabled={selected.length < 1}>
              {selected.length < 1 ? t('subs.goMin') : L('Start Analysis', 'Analizi Başlat', 'Analyse starten')}
            </button>
          </Reveal>

          <Reveal delay={90}>
            <HowItWorks title={L('How it works', 'Nasıl çalışır', 'So funktioniert’s')} steps={howItWorks} />
          </Reveal>

          {user && (
            <Reveal delay={140} className="subs-history">
              <HistoryPanel kind="subscription" lang={lang} refreshToken={histRefresh}
                onOpen={(it) => {
                  if (activeJobId) clearSubscriptionAnalysisJob(activeJobId);
                  setActiveJobId('');
                  if (it.result && Array.isArray(it.result.services)) {
                    setSelected(it.services.length ? it.services : it.result.services.map((s) => s.name).filter(Boolean));
                    setResult(it.result);
                    setHistEntry(null);
                    setPhase('result');
                  } else {
                    setHistEntry(it);
                    setPhase('history');
                  }
                }} />
            </Reveal>
          )}
        </>
      )}

      {phase === 'quizLoading' && (
        <AiWorkboard lang={lang} mode="subQuiz" />
      )}

      {phase === 'quiz' && questions.length > 0 && (
        <>
          <div className="subs-quiz-for">
            {pendingItems.map((s) => (
              <span key={s} className="subs-chip subs-chip-static">
                <SubLogo name={s} size={22} radius={6} />{s}
              </span>
            ))}
          </div>
          <QuizFlow
            questions={questions}
            busy={false}
            title={L('Tune your match', 'Eşleşmeni kişiselleştir', 'Match anpassen')}
            subtitle={L('A few quick questions so Qor AI weighs the services for how you actually use them.',
              'Birkaç kısa soru — Qor AI servisleri senin gerçek kullanımına göre tartsın.',
              'Ein paar kurze Fragen, damit Qor AI die Dienste nach deiner Nutzung gewichtet.')}
            onSubmit={(answers) => submitSubscriptionAnalysisJobAnswers(activeJobId, answers, profile())}
            onSkip={() => submitSubscriptionAnalysisJobAnswers(activeJobId, [], profile())}
          />
        </>
      )}

      {phase === 'history' && histEntry && (
        <div className="subs-result fade-up">
          <div className="subs-hist-meta">
            <div className="subs-quiz-for">
              {(histEntry.services || []).map((s) => (
                <span key={s} className="subs-chip subs-chip-static">
                  <SubLogo name={s} size={22} radius={6} />{s}
                </span>
              ))}
            </div>
          </div>
          {Object.keys(histEntry.scores || {}).length > 0 && (
            <div className="subs-hist-scores">
              {Object.entries(histEntry.scores).map(([name, sc]) => (
                <div className="subs-svc-factor" key={name}>
                  <span><SubLogo name={name} size={20} radius={6} /> {name} — <b style={{ color: techColor(Number(sc) || 0) }}>{Math.round(Number(sc) || 0)}</b></span>
                  <div className="subs-svc-fbar"><i style={{ width: `${Math.max(4, Math.min(100, Number(sc) || 0))}%`, background: techColor(Number(sc) || 0) }} /></div>
                </div>
              ))}
            </div>
          )}
          {histEntry.analysis && (
            <div className="subs-reco">
              <div className="subs-reco-head">✨ {t('subs.resultHead')}</div>
              <div className="subs-reco-body"><AiText text={histEntry.analysis} /></div>
            </div>
          )}
          <div className="subs-again">
            <button type="button" className="btn btn-ghost" onClick={resetAnalysis}>
              ← {L('Back', 'Geri', 'Zurück')}
            </button>
          </div>
        </div>
      )}

      {phase === 'analyzing' && (
        <AiWorkboard lang={lang} mode={(pendingItems.length || selected.length) > 1 ? 'subCompare' : 'subAnalyze'} />
      )}

      {phase === 'result' && result && (
        <div className="subs-result fade-up">
          {(() => {
            const services = result.services || [];
            const best = services.find((s) => s.name === winnerName) || [...services].sort((a, b) => b.score - a.score)[0];
            if (!best) return null;
            return (
              <section className="subs-result-hero">
                <div className="subs-hero-logo"><SubLogo name={best.name} size={56} radius={14} /></div>
                <div className="subs-hero-copy">
                  <span>{L('Best match', 'En iyi eşleşme', 'Beste Wahl')}</span>
                  <strong>{best.name}</strong>
                  {(result?.winner?.reason || result?.winner?.recommendation || result?.recommendation) && (
                    <div className="subs-hero-text">
                      <AiText text={result.winner?.reason || result.winner?.recommendation || result.recommendation} />
                    </div>
                  )}
                </div>
                <Gauge value={best.score} size={90} stroke={8} color={techColor(best.score)} fontSize={25} />
              </section>
            );
          })()}

          {(result.services || []).length > 1 && <ScoreChart services={result.services} L={L} />}
          <FactorMatrix services={result.services || []} L={L} />

          <div className="subs-svc-grid">
            {(result.services || []).map((s) => (
              <ServiceCard key={s.name} s={s} isWinner={s.name === winnerName || (!result.isCompare && (result.services || []).length === 1)} L={L} />
            ))}
          </div>

          {result.detailed && (
            <div className="subs-detailed">
              {result.detailed.fit && (
                <section>
                  <h4>🎯 {L('Overall fit', 'Genel uyum', 'Gesamtpassung')}</h4>
                  <AiText text={result.detailed.fit} />
                </section>
              )}
              {result.detailed.features && (
                <section>
                  <h4>🧩 {L('Features and content', 'Özellikler ve içerik', 'Funktionen und Inhalte')}</h4>
                  <AiText text={result.detailed.features} />
                </section>
              )}
              {result.detailed.ux && (
                <section>
                  <h4>✨ {L('Experience', 'Deneyim', 'Erlebnis')}</h4>
                  <AiText text={result.detailed.ux} />
                </section>
              )}
              {result.detailed.community && (
                <section>
                  <h4>🌐 {L('Community and risk', 'Topluluk ve risk', 'Community und Risiko')}</h4>
                  <AiText text={result.detailed.community} />
                </section>
              )}
              {result.detailed.plan && (
                <section>
                  <h4>🗺 {L('Usage plan', 'Kullanım planı', 'Nutzungsplan')}</h4>
                  <AiText text={result.detailed.plan} />
                </section>
              )}
            </div>
          )}

          {result.recommendation && (
            <div className="subs-reco">
              <div className="subs-reco-head">✨ {t('subs.resultHead')}</div>
              <div className="subs-reco-body"><AiText text={result.recommendation} /></div>
            </div>
          )}

          <div className="subs-again">
            <button type="button" className="btn btn-ghost" onClick={resetAnalysis}>
              {L('New analysis', 'Yeni analiz', 'Neue Analyse')}
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
