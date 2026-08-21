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
import { historyPayload } from '../lib/historyPayload';
import AiText from '../components/AiText.jsx';
import Gauge from '../components/Gauge.jsx';
import {
  BarFill,
  Collapsible,
  CommunityThemes,
  CriticalPoints,
  DecisionBadge,
  DistributionBar,
  FactorList,
  HeatMatrix,
  ProConList,
  QuizImpact,
  RadarChart,
  SentimentDonut,
  SourceChips,
  StatTiles,
  factorDistribution,
  normalizeSentiment,
  scoreColor,
} from '../components/AiCharts.jsx';
import SubLogo from '../components/SubLogo.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import HowItWorks from '../components/HowItWorks.jsx';
import QuizFlow from '../components/QuizFlow.jsx';
import AiWorkboard from '../components/AiWorkboard.jsx';
import AnalysisExitBar from '../components/AnalysisExitBar.jsx';
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
// Sık kullanılanlar kare logo kutusu olarak gösterilir; listede olmayan her şey
// "Abonelik adı yaz ve ekle" kutusundan eklenir.
// Sayı 32'ye tamamlandı (2026-08-08): 27 kutu son satırda 3 tane bırakıp
// asimetrik duruyordu; 32, masaüstündeki 8'li ızgarada tam 4 satır yapar.
const TOP_SERVICES = [
  'Netflix', 'Disney+', 'Amazon Prime', 'Apple TV+', 'HBO Max', 'YouTube Premium',
  'BluTV', 'Exxen', 'Crunchyroll', 'Spotify', 'Apple Music', 'YouTube Music',
  'Tidal', 'Amazon Music', 'Deezer', 'ChatGPT Plus', 'Claude Pro', 'Gemini Advanced',
  'Perplexity', 'Midjourney', 'Xbox Game Pass', 'PlayStation Plus', 'GeForce Now',
  'Nintendo Switch Online', 'Microsoft 365', 'Google One', 'iCloud+', 'Dropbox',
  'Adobe Creative Cloud', 'Notion', 'Canva', 'Hostinger',
];
const PENDING_SUBS_KEY = 'qor.pendingSubscriptionAnalysis';

function list(v) {
  return Array.isArray(v) ? v.filter((x) => x != null && String(x).trim()) : [];
}

// Eski kayıtlarda düz string, yeni kayıtlarda {title, detail}.
function bullets(v) {
  return (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === 'string'
      ? { title: x, detail: '' }
      : { title: String(x?.title || x?.name || ''), detail: String(x?.detail || x?.why || '') }))
    .filter((x) => x.title || x.detail);
}

function Sec({ icon, title, meta, children, tone = '' }) {
  return (
    <section className={`subs-sec${tone ? ` ${tone}` : ''}`}>
      <h4>{icon} {title}{meta ? <em> · {meta}</em> : null}</h4>
      {children}
    </section>
  );
}

// Horizontal bar chart comparing each service's overall compatibility score —
// the "graph" the app shows above the per-service breakdown.
function ScoreChart({ services, L }) {
  const rows = (services || []).filter((s) => s && s.name).slice(0, 10);
  if (rows.length < 1) return null;
  const max = Math.max(100, ...rows.map((s) => Math.round(s.score || 0)));
  return (
    <div className="subs-chart">
      <div className="subs-chart-head">📊 {L('Compatibility scores', 'Uyum puanları')}</div>
      <div className="subs-chart-rows">
        {rows.map((s, i) => {
          const v = Math.round(s.score || 0);
          const col = scoreColor(v);
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

// Bir servisin rapor BÖLÜMLERİ. Tek tek kart olarak da, karşılaştırmada
// satır satır hizalı ızgara olarak da aynı parçalar kullanılır — böylece iki
// servis yan yanayken "biri yukarıda biri aşağıda" kalmaz.
function serviceSections(s, L) {
  const score = Math.round(s.score || 0);
  const factors = list(s.factors);
  const pros = bullets(s.pros);
  const cons = bullets(s.cons);
  const risks = bullets(s.risks);
  const critical = list(s.criticalPoints);
  const themes = list(s.communityThemes);
  const cancelReasons = bullets(s.cancelReasons);
  const features = list(s.features);
  const sentiment = normalizeSentiment(s.sentiment, score);
  const dist = factorDistribution(factors);
  return {
    explanation: s.explanation ? <p className="subs-svc-exp">{s.explanation}</p> : null,
    charts: (
      <div className="aic-row">
        {factors.length >= 3 && <RadarChart factors={factors} L={L} size={220} color="var(--brand-blue)" />}
        <div className="aic-col">
          <SentimentDonut breakdown={sentiment} L={L} compact />
          <DistributionBar strong={dist.strong} balanced={dist.balanced} weak={dist.weak} L={L} />
        </div>
      </div>
    ),
    factors: factors.length > 0 ? <FactorList factors={factors} columns={1} /> : null,
    proscons: (pros.length || cons.length) ? (
      <ProConList
        pros={pros} cons={cons} L={L}
        titles={{
          pro: L('Strengths', 'Güçlü yanlar'),
          con: L('Trade-offs', 'Eksiler'),
        }}
      />
    ) : null,
    critical: critical.length ? <CriticalPoints items={critical} L={L} /> : null,
    forwho: (s.bestFor || s.notFor) ? (
      <div className="subs-forwho">
        {s.bestFor && <p className="subs-forwho-good">🎯 <b>{L('Great for', 'Tam uygun')}:</b> {s.bestFor}</p>}
        {s.notFor && <p className="subs-forwho-bad">🚫 <b>{L('Skip if', 'Şu durumda geç')}:</b> {s.notFor}</p>}
      </div>
    ) : null,
    themes: themes.length ? (
      <>
        <CommunityThemes themes={themes} L={L} />
        <SourceChips sources={s.sources} L={L} />
      </>
    ) : null,
    community: s.community ? (
      <Sec icon="🌐" title={L('What subscribers say', 'Aboneler ne diyor')}>
        <div className="la-prose"><AiText text={s.community} /></div>
      </Sec>
    ) : null,
    cancel: cancelReasons.length ? (
      <div className="subs-svc-risks">
        <h4>🚪 {L('Why people cancel', 'İnsanlar neden iptal ediyor')}</h4>
        <ul>{cancelReasons.map((x, i) => <li key={i}>{x.title}{x.detail ? ` — ${x.detail}` : ''}</li>)}</ul>
      </div>
    ) : null,
    extras: (features.length || risks.length) ? (
      <Collapsible label={`📖 ${L('Features and risk notes', 'Özellikler ve risk notları')}`}>
        {features.length > 0 && (
          <div className="subs-svc-features">
            {features.slice(0, 6).map((x, i) => (<span key={i}><b>{x.label}</b>{x.value}</span>))}
          </div>
        )}
        {risks.length > 0 && (
          <div className="subs-svc-risks">
            <h4>🛡 {L('Risk notes', 'Risk notları')}</h4>
            <ul>{risks.map((x, i) => <li key={i}>{x.title}{x.detail ? ` — ${x.detail}` : ''}</li>)}</ul>
          </div>
        )}
      </Collapsible>
    ) : null,
  };
}

const SECTION_ORDER = [
  'explanation', 'charts', 'factors', 'proscons', 'critical',
  'forwho', 'themes', 'community', 'cancel', 'extras',
];

function ServiceHeader({ s, isWinner, L }) {
  const score = Math.round(s.score || 0);
  return (
    <div className="subs-svc-top">
      {isWinner && <span className="subs-svc-win">★ {L('Best fit', 'En uygun')}</span>}
      <SubLogo name={s.name} size={50} radius={14} />
      <Gauge value={score} size={62} stroke={6} color={scoreColor(score)} fontSize={18} />
      <div className="subs-svc-id">
        <strong>{s.name}</strong>
        {s.category && <span>{s.category}</span>}
        <div className="la-hero-badge"><DecisionBadge score={score} L={L} /></div>
      </div>
    </div>
  );
}

function ServiceCard({ s, isWinner, L }) {
  const sec = serviceSections(s, L);
  return (
    <div className={'subs-svc' + (isWinner ? ' winner' : '')}>
      <ServiceHeader s={s} isWinner={isWinner} L={L} />
      {SECTION_ORDER.map((k) => (sec[k] ? <div key={k}>{sec[k]}</div> : null))}
    </div>
  );
}

export default function Subscriptions() {
  const { t, lang } = useI18n();
  const { user, openAuth } = useAuth();
  const nav = useNavigate();
  const requireAiAccess = useAiAccess(lang);
  const [errCode, setErrCode] = useState('');
  const L = (en, tr) => (lang === 'tr' ? tr : en);
  useSeo({ title: `${t('subs.title')} — Qor AI`, description: t('subs.subtitle'), path: '/subscriptions' });

  const [selected, setSelected] = useState([]);
  const [custom, setCustom] = useState('');
  const customRef = useRef(null); // "Ekle" input — eklemeden sonra odakta kalsın
  // phase: select | quizLoading | quiz | analyzing | result | history
  const [phase, setPhase] = useState('select');
  const [starting, setStarting] = useState(false);
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
  // Gerçek boru hattı aşaması (research | report) — tahta hangi işin
  // GERÇEKTEN koştuğunu göstersin diye.
  const [stage, setStage] = useState(null);
  const [phaseStartedAt, setPhaseStartedAt] = useState(null);
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
      'Yalnızca aynı tür servisler karşılaştırılabilir (ör. Netflix ile Disney+).');
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
      const res = await validateSubscriptionInput(v, selected, lang, activeCategory() || '');
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
      customRef.current?.focus(); // eklemeden sonra imleç input'ta kalsın
    }
  }

  function savePending(items) {
    localStorage.setItem(PENDING_SUBS_KEY, JSON.stringify({ selected: items, custom, ts: Date.now() }));
  }

  // Step 1: validate access, then run the app-matching subscription analysis.
  async function startAnalysis(items = selected) {
    setErr('');
    if (items.length < 1) return;
    // Ücret analiz başlamadan alınıyor → butona iki kez basmak Q'yu İKİ kez
    // düşürüyordu. Kilit her şeyden önce kurulur, çıkışta serbest bırakılır.
    if (starting) return;
    setStarting(true);
    try {
      await _startAnalysis(items);
    } finally {
      setStarting(false);
    }
  }

  async function _startAnalysis(items) {
    if (subscriptionsMixCategories(items)) {
      setErr(L('Only services of the same type can be compared (e.g. Netflix vs Disney+).',
        'Yalnızca aynı tür servisler karşılaştırılabilir (ör. Netflix ile Disney+).'));
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
        'Önce profil quizini tamamla. Abonelik seçimlerin kaydedildi.'));
      nav(`/quiz?required=1&next=${encodeURIComponent('/subscriptions')}`);
      return;
    }
    try {
      const access = await requireAiAccess('subscription_analysis', {
        onMessage: (m, code) => { setErr(m); setErrCode(code); },
      });
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
    setStage(job.stage || null);
    setPhaseStartedAt(job.phaseStartedAt || job.startedAt || null);
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

  // 32 kutucugun HEPSI ilk render'da SubLogo ciziyordu ve sayfanin hero
  // paragrafinin BOYANMASI bu isin arkasinda kaliyordu. Olculdu (yavas 4G +
  // 4x CPU): icerik 4211 ms'de DOM'a giriyor ama LCP 5244 ms'de fire ediyor —
  // arada ana is parcacigi 32 logoyu cozmekle mesgul.
  // Logolar ILK BOYAMADAN SONRA baglanir. Kutucugun kendisi ve ismi hemen
  // cizilir; logo yeri 44x44 ayrilir, yani yerlesim degismez (CLS 0).
  const [logosReady, setLogosReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setLogosReady(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  const showPicker = phase === 'select';
  const winnerName = result?.winner?.best || result?.winner?.overall || '';

  const howItWorks = [
    { icon: '💬', grad: 'linear-gradient(135deg, var(--brand-cyan), var(--brand-blue))',
      title: L('Community Voice', 'İnternet Yorumları'),
      desc: L('Real user feedback from Reddit, forums, and social media with a positive/negative summary.',
        'Reddit, forum ve sosyal medyadan gerçek kullanıcı yorumları — olumlu/olumsuz özet.') },
    { icon: '🎯', grad: 'linear-gradient(135deg, var(--brand-sky), var(--brand-cyan))',
      title: L('Personal Quiz', 'Kişisel Quiz'),
      desc: L('AI tailors questions to your habits so every answer sharpens the match.',
        'AI alışkanlıklarına göre sorular hazırlar — her cevap eşleşmeyi keskinleştirir.') },
    { icon: '✨', grad: 'linear-gradient(135deg, var(--brand-cyan), #10B981)',
      title: L('Smart Match', 'Akıllı Eşleşme'),
      desc: L('Compatibility score and a detailed recommendation tuned to your profile.',
        'Profiline göre uyum puanı ve sana özel detaylı öneri.') },
  ];

  return (
    <div className="subs-page">
      {/* İkon ve alt yazı KALDIRILDI — bkz. LinkAnalysis: tek odak başlık. */}
      <PageHero
        kicker={t('subs.heroKicker')}
        title={t('subs.heroTitle')}
        accent={t('subs.heroAccent')}
        titleAfter={t('subs.heroTitleAfter')}
        lead={t('subs.heroLead')}
      />

      <div className="container subs-body">
      {showPicker && (
        <>
          <Reveal as="section" className="subs-picker-panel">
            <div className="subs-picker-head">
              <div className="subs-picker-title">
                <strong>{L('Pick your subscriptions', 'Aboneliklerini seç')}</strong>
                <span>{selected.length > 1
                  ? L('Comparison mode — same category only', 'Karşılaştırma modu — yalnız aynı tür')
                  : L('Add a second one to compare them side by side', 'Yan yana karşılaştırmak için ikinci bir tane ekle')}</span>
              </div>
              <span className={'subs-mode-pill' + (selected.length > 1 ? ' compare' : '')}>
                {selected.length > 1
                  ? `⚖️ ${L('Compare', 'Karşılaştır')} · ${selected.length}`
                  : `🔎 ${L('Deep analysis', 'Derin analiz')}`}
              </span>
            </div>

            <div className="subs-grid">
              {TOP_SERVICES.map((name) => {
                const on = selected.includes(name);
                return (
                  <button key={name} type="button" title={name} aria-label={name}
                    aria-pressed={on}
                    className={'subs-tile' + (on ? ' active' : '')}
                    onClick={() => toggle(name)}>
                    {logosReady
                      ? <SubLogo name={name} size={44} radius={12} />
                      : <span style={{ width: 44, height: 44, display: 'block', flexShrink: 0 }} aria-hidden="true" />}
                    <span className="subs-tile-name">{name}</span>
                    {on && <span className="subs-tile-check pop-in" aria-hidden="true">✓</span>}
                  </button>
                );
              })}
            </div>

            <form className="subs-custom" onSubmit={addCustom}>
              <input ref={customRef} value={custom} onChange={(e) => setCustom(e.target.value)}
                placeholder={t('subs.customPlaceholder')} />
              <button type="submit" className="btn btn-ghost" disabled={adding || !custom.trim()}>
                {adding ? L('Checking…', 'Kontrol ediliyor…') : t('subs.add')}
              </button>
            </form>

            {selected.length > 0 && (
              <div className="subs-selected">
                <span className="subs-selected-label">{L('Selected', 'Seçilenler')} · {selected.length}</span>
                {selected.map((s) => (
                  <span key={s} className="subs-chip">
                    <SubLogo name={s} size={22} radius={6} />
                    {s}
                    <button type="button" onClick={() => toggle(s)} aria-label="Remove">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6 18 18M18 6 6 18" /></svg>
                    </button>
                  </span>
                ))}
              </div>
            )}

            {err && <div className="subs-err">{err}{errCode === 'INSUFFICIENT_QOR_COINS' && <> <a href="/premium">{L('See Premium', 'Premium’a bak')}</a></>}</div>}

            <button className="btn btn-grad btn-lg btn-shine subs-go"
              onClick={() => startAnalysis()} disabled={selected.length < 1 || starting}>
              {selected.length < 1
                ? t('subs.goMin')
                : selected.length > 1
                  ? `${L('Compare', 'Karşılaştır')} · ${selected.length}`
                  : L('Start Analysis', 'Analizi Başlat')}
            </button>

            <ul className="subs-promise">
              <li>🌐 {L('Real subscriber reviews from Reddit, forums and app stores', 'Reddit, forum ve uygulama mağazalarından gerçek abone yorumları')}</li>
              <li>🧠 {L('A short quiz makes the verdict personally yours', 'Kısa bir quiz kararı sana özel yapar')}</li>
              <li>🚪 {L('Why people cancel, what to watch for, and a usage plan', 'İnsanlar neden iptal ediyor, nelere dikkat etmeli ve kullanım planı')}</li>
            </ul>
          </Reveal>

          <Reveal delay={90}>
            <HowItWorks title={L('How it works', 'Nasıl çalışır')} steps={howItWorks} />
          </Reveal>

          {user && (
            <Reveal delay={140} className="subs-history">
              <HistoryPanel kind="subscription" lang={lang} refreshToken={histRefresh}
                onOpen={(it) => {
                  // GECMIS = CANLI SONUCLA AYNI EKRAN. Yapisal veri varsa
                  // (kaydedilmis `result` ya da `analysis` icindeki JSON) tam
                  // sonuc gorunumu acilir; yalnizca gercekten duz metin olan
                  // ESKI kayitlar ozet gorunumune duser.
                  if (activeJobId) clearSubscriptionAnalysisJob(activeJobId);
                  setActiveJobId('');
                  const payload = historyPayload(it);
                  const data = payload && payload.kind === 'structured' ? payload.data : null;
                  if (data && Array.isArray(data.services)) {
                    setSelected(it.services.length ? it.services : data.services.map((s) => s.name).filter(Boolean));
                    setResult(data);
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

      {!showPicker && (
        <AnalysisExitBar
          lang={lang}
          onExit={resetAnalysis}
          busy={phase === 'quizLoading' || phase === 'analyzing'}
          context={(pendingItems.length ? pendingItems : selected).join(' · ')}
        />
      )}

      {phase === 'quizLoading' && (
        <AiWorkboard lang={lang} mode="subQuiz" startedAt={phaseStartedAt} />
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
            title={L('Tune your match', 'Eşleşmeni kişiselleştir')}
            subtitle={L('A few quick questions so Qor AI weighs the services for how you actually use them.',
              'Birkaç kısa soru — Qor AI servisleri senin gerçek kullanımına göre tartsın.')}
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
                  <span><SubLogo name={name} size={20} radius={6} /> {name} — <b style={{ color: scoreColor(Number(sc) || 0) }}>{Math.round(Number(sc) || 0)}</b></span>
                  <div className="subs-svc-fbar"><i style={{ width: `${Math.max(4, Math.min(100, Number(sc) || 0))}%`, background: scoreColor(Number(sc) || 0) }} /></div>
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
              ← {L('Back', 'Geri')}
            </button>
          </div>
        </div>
      )}

      {phase === 'analyzing' && (
        <AiWorkboard lang={lang} mode={(pendingItems.length || selected.length) > 1 ? 'subCompare' : 'subAnalyze'} stage={stage} startedAt={phaseStartedAt} />
      )}

      {phase === 'result' && result && (() => {
        const services = result.services || [];
        const best = services.find((s) => s.name === winnerName) || [...services].sort((a, b) => b.score - a.score)[0];
        const diffs = bullets(result.decisiveDifferences);
        const insights = Array.isArray(result.quizInsights) ? result.quizInsights : [];
        const gap = result?.winner?.scoreGap
          || (services.length > 1 ? Math.round(Math.max(...services.map((s) => s.score || 0)) - Math.min(...services.map((s) => s.score || 0))) : 0);
        return (
          <div className="subs-result fade-up">
            {result.researched && (
              <div className="subs-researched">🌐 {L('Subscriber reviews and forums were scanned live', 'Abone yorumları ve forumlar canlı tarandı')}</div>
            )}

            {best && (
              <section className="subs-result-hero">
                <div className="subs-hero-logo"><SubLogo name={best.name} size={56} radius={14} /></div>
                <div className="subs-hero-copy">
                  <span>{services.length > 1 ? L('Best match', 'En iyi eşleşme') : L('Your match', 'Senin eşleşmen')}</span>
                  <strong>{best.name}</strong>
                  {(result?.winner?.reason || result?.winner?.recommendation || result?.recommendation) && (
                    <div className="subs-hero-text">
                      <AiText text={result.winner?.reason || result.winner?.recommendation || result.recommendation} />
                    </div>
                  )}
                  {result?.winner?.runnerUpCase && (
                    <p className="subs-runnerup">🔁 {result.winner.runnerUpCase}</p>
                  )}
                </div>
                <Gauge value={best.score} size={96} stroke={9} color={scoreColor(best.score)} fontSize={27} />
              </section>
            )}

            <StatTiles items={[
              best ? { icon: '🎯', label: L('Match', 'Uyum'), value: Math.round(best.score), color: scoreColor(best.score) } : null,
              gap > 0 ? { icon: '📐', label: L('Score gap', 'Puan farkı'), value: gap } : null,
              { icon: '📺', label: L('Services', 'Servis'), value: services.length },
              result.confidence ? { icon: '🔬', label: L('Evidence', 'Kanıt gücü'), value: `${Math.round(result.confidence)}%` } : null,
            ].filter(Boolean)} />

            {services.length > 1 && <ScoreChart services={services} L={L} />}
            <HeatMatrix products={services} L={L} />

            {diffs.length > 0 && (
              <Sec icon="⚔️" title={L('What actually decides it', 'Kararı belirleyen farklar')}>
                <div className="subs-diffs">
                  {diffs.map((d, i) => (
                    <div className="subs-diff" key={i} style={{ animationDelay: `${i * 60}ms` }}>
                      <strong>{d.title}</strong>
                      {d.detail && <p>{d.detail}</p>}
                    </div>
                  ))}
                </div>
              </Sec>
            )}

            <QuizImpact items={insights} L={L} />

            <div className="subs-svc-grid">
              {services.map((s) => (
                <ServiceCard key={s.name} s={s} isWinner={services.length === 1 || s.name === winnerName} L={L} />
              ))}
            </div>

            {result.detailed && (
              <div className="subs-detailed">
                {result.detailed.fit && (
                  <section>
                    <h4>🎯 {L('Overall fit', 'Genel uyum')}</h4>
                    <AiText text={result.detailed.fit} />
                  </section>
                )}
                {result.detailed.features && (
                  <section>
                    <h4>🧩 {L('Features and content', 'Özellikler ve içerik')}</h4>
                    <AiText text={result.detailed.features} />
                  </section>
                )}
                {result.detailed.ux && (
                  <section>
                    <h4>✨ {L('Experience', 'Deneyim')}</h4>
                    <AiText text={result.detailed.ux} />
                  </section>
                )}
                {result.detailed.community && (
                  <section>
                    <h4>🌐 {L('Community and risk', 'Topluluk ve risk')}</h4>
                    <AiText text={result.detailed.community} />
                  </section>
                )}
                {result.detailed.plan && (
                  <section className="subs-plan">
                    <h4>🗺 {L('Your usage plan', 'Kullanım planın')}</h4>
                    <AiText text={result.detailed.plan} />
                  </section>
                )}
              </div>
            )}

            {result.recommendation && (
              <div className="subs-reco">
                <div className="subs-reco-head">{t('subs.resultHead')}</div>
                <div className="subs-reco-body"><AiText text={result.recommendation} /></div>
              </div>
            )}

            <div className="subs-again">
              <button type="button" className="btn btn-ghost" onClick={resetAnalysis}>
                {L('New analysis', 'Yeni analiz')}
              </button>
            </div>
          </div>
        );
      })()}
      </div>
    </div>
  );
}
