import { useEffect, useRef, useState } from 'react';
import { IconX } from '../components/GlyphIcons.jsx';
import { trackEvent } from '../lib/analytics';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth';
import { aiUserProfile } from '../lib/qorCoins';
import { useAiAccess } from '../lib/useAiAccess';
import { historyPayload } from '../lib/historyPayload';
import {
  clearLinkAnalysisJob,
  retryLinkAnalysisJob,
  startCompareLinkAnalysisJob,
  startSingleLinkAnalysisJob,
  submitLinkAnalysisJobAnswers,
  subscribeLinkAnalysisJob,
} from '../lib/linkAnalysisJobs';
import AiText from '../components/AiText.jsx';
import {
  BarFill,
  CommunityThemes,
  CriticalPoints,
  DecisionBadge,
  FactorList,
  HeatMatrix,
  ProConList,
  QuizImpact,
  RadarChart,
  SentimentDonut,
  StatTiles,
  normalizeSentiment,
  scoreColor,
} from '../components/AiCharts.jsx';
import QuizFlow from '../components/QuizFlow.jsx';
import AiWorkboard from '../components/AiWorkboard.jsx';
import AnalysisExitBar from '../components/AnalysisExitBar.jsx';
import Gauge from '../components/Gauge.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import HowItWorks from '../components/HowItWorks.jsx';
import Reveal from '../components/Reveal.jsx';
import PageHero from '../components/PageHero.jsx';
import { useSeo } from '../lib/seo';
import { safeExternalUrl } from '../lib/format';
import { Link } from 'react-router-dom';
import './LinkAnalysis.css';

const MAX_LINKS = 4;
const PENDING_LINK_KEY = 'qor.pendingLinkAnalysis';

// Rapor gövdesi, hero'su, grafikleri ve yardımcıları artık ORTAK bileşende:
// ürün ve karşılaştırma analizleri de birebir aynı şablonu kullanıyor.
import AiReportView, {
  CatalogMatchCard, FeatureMatchTable, Sec, StoreCta, bandLabel, bullets, list,
} from '../components/AiReportView.jsx';


function CompareScoreChart({ products = [], L }) {
  if (!products.length) return null;
  const max = Math.max(100, ...products.map((p) => Math.round(p.score || 0)));
  return (
    <section className="la-cmp-chart">
      <div className="la-cmp-section-title">📊 {L('Compatibility scores', 'Uyum puanları', 'Kompatibilitätswerte')}</div>
      <div className="la-cmp-chart-rows">
        {products.map((p, i) => {
          const score = Math.round(p.score || 0);
          const color = scoreColor(score);
          return (
            <div className="la-cmp-chart-row" key={`${p.name}-${i}`}>
              <span className="la-cmp-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
              <span className="la-cmp-chart-name">{p.name}</span>
              <div className="la-cmp-chart-track">
                <BarFill pct={Math.max(4, (score / max) * 100)} color={color} delay={i * 90} />
              </div>
              <b style={{ color }}>{score}</b>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CompareProductCard({ product, isWinner, L, lang }) {
  const score = Math.round(product.score || 0);
  const pros = bullets(product.pros);
  const cons = bullets(product.cons);
  const risks = bullets(product.risks);
  const critical = list(product.criticalPoints);
  const factors = list(product.factors);
  const specs = list(product.specHighlights);
  const themes = list(product.communityThemes);
  const sentiment = normalizeSentiment(product.sentiment, score);
  return (
    <article className={'la-cmp-card' + (isWinner ? ' winner' : '')}>
      {isWinner && <span className="la-cmp-win-pill">★ {L('Best fit', 'En iyi eşleşme', 'Beste Wahl')}</span>}
      <div className="la-cmp-card-top">
        <Gauge value={score} size={72} stroke={7} color={scoreColor(score)} fontSize={21} />
        <div className="la-cmp-card-id">
          <strong>{product.name}</strong>
          <span>{product.siteName || L('Product link', 'Ürün linki', 'Produktlink')}</span>
          <DecisionBadge score={score} L={L} />
        </div>
      </div>
      <StoreCta url={product.url || product.link} lang={lang} L={L} compact />
      {product.bestFor && <p className="la-cmp-bestfor"><b>{L('Best for', 'Kime uygun', 'Ideal für')}:</b> {product.bestFor}</p>}
      {product.summary && <div className="la-prose la-cmp-summary"><AiText text={product.summary} /></div>}

      {factors.length >= 3 && (
        <div className="aic-row la-cmp-charts">
          <RadarChart factors={factors} L={L} size={220} color="var(--brand-blue)" />
          <SentimentDonut breakdown={sentiment} L={L} compact />
        </div>
      )}

      {factors.length > 0 && <FactorList factors={factors} columns={1} />}

      {specs.length > 0 && (
        <div className="la-cmp-specs">
          {specs.slice(0, 6).map((s, i) => (
            <span key={i}><b>{s.label}</b>{s.value}</span>
          ))}
        </div>
      )}

      <ProConList
        pros={pros} cons={cons} L={L}
        titles={{
          pro: L('Strengths', 'Güçlü yanlar', 'Stärken'),
          con: L('Trade-offs', 'Eksiler', 'Nachteile'),
        }}
      />

      <CriticalPoints items={critical} L={L} />

      {risks.length > 0 && (
        <div className="la-cmp-risks">
          <h4>🛠 {L('Ownership risks', 'Sahiplik riskleri', 'Besitzrisiken')}</h4>
          <ul>{risks.map((x, i) => <li key={i}>{x.title}{x.detail ? ` — ${x.detail}` : ''}</li>)}</ul>
        </div>
      )}

      <CommunityThemes themes={themes} L={L} />

      {product.community && (
        <Sec icon="🌐" title={L('Community signal', 'Topluluk sinyali', 'Community-Signal')}>
          <div className="la-prose"><AiText text={product.community} /></div>
        </Sec>
      )}
    </article>
  );
}

function CompareResult({ data, L, lang }) {
  const products = list(data?.products)
    .map((p) => ({ ...p, score: Number(p.score) || 0 }))
    .sort((a, b) => (a.rank || 99) - (b.rank || 99) || b.score - a.score);
  if (!products.length) return null;
  const winnerName = data?.winner?.best || products[0]?.name || '';
  const best = products.find((p) => p.name === winnerName) || products[0];
  const gap = data?.winner?.scoreGap || (products.length > 1 ? Math.round((products[0].score || 0) - (products[products.length - 1].score || 0)) : 0);
  const detailed = data?.detailed || {};
  const diffs = bullets(data?.decisiveDifferences);
  const insights = Array.isArray(data?.quizInsights) ? data.quizInsights : [];
  return (
    <div className="la-result la-cmp-result fade-up">
      <div className="la-result-head la-result-head-cmp">
        <span>{L('Qor AI Comparison', 'Qor AI Karşılaştırması', 'Qor AI Vergleich')}</span>
        {data.researched && (
          <span className="la-researched">🌐 {L('Reviews scanned', 'Yorumlar tarandı', 'Bewertungen gescannt')}</span>
        )}
        {/* Ürün adları TEK SATIRDA birbirine giriyordu; artık numaralı,
            kırpılmış ve tıklanabilir satırlar. */}
        <ol className="la-cmp-names">
          {products.map((p, i) => (
            <li key={`${p.name}-${i}`}>
              <span className="la-cmp-no">{i + 1}</span>
              {safeExternalUrl(p.url) ? (
                <a href={safeExternalUrl(p.url)} target="_blank" rel="noopener" title={p.name}>{p.name}</a>
              ) : <span title={p.name}>{p.name}</span>}
              {p.siteName && <em>{p.siteName}</em>}
            </li>
          ))}
        </ol>
      </div>
      <div className="la-result-body">
        <section className="la-cmp-hero">
          <div className="la-cmp-trophy">🏆</div>
          <div className="la-cmp-hero-copy">
            <span>{L('Best match', 'En iyi eşleşme', 'Beste Wahl')}</span>
            {/* Kazananın adı ürünün kendi linkine gider. */}
            {safeExternalUrl(best.url) ? (
              <a className="la-cmp-winner-link" href={safeExternalUrl(best.url)} target="_blank" rel="noopener">
                <strong>{best.name}</strong>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></svg>
              </a>
            ) : <strong>{best.name}</strong>}
            {(data?.winner?.reason || data?.recommendation) && (
              <div className="la-prose"><AiText text={data.winner?.reason || data.recommendation} /></div>
            )}
            {data?.winner?.runnerUpCase && (
              <p className="la-cmp-runnerup">🔁 {data.winner.runnerUpCase}</p>
            )}
          </div>
          <Gauge value={best.score} size={100} stroke={9} color={scoreColor(best.score)} fontSize={29} />
        </section>

        <StatTiles items={[
          { icon: '🏆', label: L('Winner score', 'Kazanan puanı', 'Siegerwert'), value: Math.round(best.score), color: scoreColor(best.score) },
          gap > 0 ? { icon: '📐', label: L('Score gap', 'Puan farkı', 'Punktedifferenz'), value: gap } : null,
          { icon: '🔗', label: L('Products', 'Ürün', 'Produkte'), value: products.length },
          data.confidence ? { icon: '🔬', label: L('Evidence', 'Kanıt gücü', 'Beleglage'), value: `${Math.round(data.confidence)}%` } : null,
        ].filter(Boolean)} />

        <CompareScoreChart products={products} L={L} />
        <HeatMatrix products={products} L={L} />

        {diffs.length > 0 && (
          <Sec icon="⚔️" title={L('What actually decides it', 'Kararı belirleyen farklar', 'Was wirklich entscheidet')}>
            <div className="la-diffs">
              {diffs.map((d, i) => (
                <div className="la-diff" key={i} style={{ animationDelay: `${i * 60}ms` }}>
                  <strong>{d.title}</strong>
                  {d.detail && <p>{d.detail}</p>}
                </div>
              ))}
            </div>
          </Sec>
        )}

        <QuizImpact items={insights} L={L} />

        <div className="la-cmp-grid">
          {products.map((p) => <CompareProductCard key={p.name} product={p} isWinner={p.name === best.name} L={L} lang={lang} />)}
        </div>

        {detailed.fit && (
          <Sec icon="🎯" title={L('Quiz-based fit', 'Quiz bazlı uyum', 'Quizbasierte Passung')}>
            <div className="la-prose"><AiText text={detailed.fit} /></div>
          </Sec>
        )}
        {detailed.performance && (
          <Sec icon="⚡" title={L('Performance and specs', 'Performans ve özellikler', 'Leistung und Ausstattung')}>
            <div className="la-prose"><AiText text={detailed.performance} /></div>
          </Sec>
        )}
        {detailed.ownership && (
          <Sec icon="🛡" title={L('Long-term ownership', 'Uzun vadeli kullanım', 'Langzeitnutzung')}>
            <div className="la-prose"><AiText text={detailed.ownership} /></div>
          </Sec>
        )}
        {detailed.community && (
          <Sec icon="🌐" title={L('What owners of each report', 'Kullanıcılar ne diyor', 'Was Besitzer berichten')}>
            <div className="la-prose"><AiText text={detailed.community} /></div>
          </Sec>
        )}
        {(detailed.recommendation || data?.recommendation) && (
          <Sec icon="🏁" title={L('Final recommendation', 'Nihai öneri', 'Abschließende Empfehlung')} tone="la-sec-final">
            <div className="la-prose"><AiText text={detailed.recommendation || data.recommendation} /></div>
          </Sec>
        )}
      </div>
    </div>
  );
}

export default function LinkAnalysis() {
  const { t, lang } = useI18n();
  const { user, openAuth } = useAuth();
  const requireAiAccess = useAiAccess(lang);
  // Yetersiz bakiye mesajinin yanina Premium baglantisi cizebilmek icin
  // hata KODUNU da tutuyoruz (mesajin kendisi zaten aciklamayi tasiyor).
  const [errCode, setErrCode] = useState('');
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  useSeo({ title: `${t('la.title')} — Qor AI`, description: t('la.subtitle'), path: '/link-analysis' });

  const [urls, setUrls] = useState(['']);
  // phase: input | identifying | quizLoading | quiz | analyzing | result
  const [phase, setPhase] = useState('input');
  // Analiz başlatma sürerken butonu kilitler. Olmadığında butona iki kez basmak
  // Q'yu İKİ kez düşürüyordu (ücret analiz başlamadan önce alınıyor).
  const [starting, setStarting] = useState(false);
  const [base, setBase] = useState(null);
  const [compareBases, setCompareBases] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [enhanced, setEnhanced] = useState(null);
  const [compareResult, setCompareResult] = useState(null);
  const [compareText, setCompareText] = useState('');
  const [histRefresh, setHistRefresh] = useState(0);
  const [err, setErr] = useState('');
  const [activeJobId, setActiveJobId] = useState('');
  const [activeJobType, setActiveJobType] = useState('');
  // Gerçek boru hattı aşaması (research | report) — yükleniyor tahtası hangi
  // işin GERÇEKTEN koştuğunu göstersin diye.
  const [stage, setStage] = useState(null);
  // İşin İÇİNDE BULUNDUĞU FAZIN gerçek başlangıcı — yükleme tahtası geçen
  // süreyi buradan sayar, sayfa değiştirip dönünce sıfırlanmaz.
  const [phaseStartedAt, setPhaseStartedAt] = useState(null);
  const seenSavedJobRef = useRef('');

  useEffect(() => subscribeLinkAnalysisJob((job) => {
    if (!job) return;
    setActiveJobId(job.id || '');
    setActiveJobType(job.type || '');
    setStage(job.stage || null);
    setPhaseStartedAt(job.phaseStartedAt || job.startedAt || null);
    if (Array.isArray(job.urls) && job.urls.length) {
      setUrls(job.urls.length < MAX_LINKS ? [...job.urls, ''] : job.urls.slice(0, MAX_LINKS));
    }
    setPhase(job.phase || 'input');
    setBase(job.base || null);
    setCompareBases(Array.isArray(job.bases) ? job.bases : []);
    setQuestions(Array.isArray(job.questions) ? job.questions : []);
    setEnhanced(job.enhanced || null);
    setCompareResult(job.compareResult || null);
    setCompareText(job.compareText || '');
    if (job.error === 'NOT_PRODUCT') {
      setErr(t('la.errNotProduct'));
    } else if (job.error === 'ANALYSIS_FAILED' || job.error === 'COMPARE_FAILED') {
      setErr(t('la.errFail'));
    } else {
      setErr(job.error || '');
    }
    if (job.savedAt && seenSavedJobRef.current !== `${job.id}:${job.savedAt}`) {
      seenSavedJobRef.current = `${job.id}:${job.savedAt}`;
      setHistRefresh((n) => n + 1);
    }
  }), [t]);

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
  // Mobilde/masaüstünde "kopyaladım ama yapıştıramıyorum" sürtünmesini kaldırır.
  // İzin verilmezse sessizce hiçbir şey yapmaz — kullanıcı elle yapıştırır.
  async function pasteInto(i) {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) setUrl(i, text.trim());
    } catch { /* clipboard permission denied — manual paste still works */ }
  }

  function resetFlow() {
    clearLinkAnalysisJob(activeJobId);
    setPhase('input'); setBase(null); setCompareBases([]); setQuestions([]); setEnhanced(null); setCompareResult(null); setCompareText(''); setErr(''); setActiveJobId(''); setActiveJobType('');
  }

  function savePending(list) {
    localStorage.setItem(PENDING_LINK_KEY, JSON.stringify({ urls: list, ts: Date.now() }));
  }

  // ── Single-link flow: identify → quiz → enhanced analysis ────────
  async function startSingle(url) {
    setErr(''); setEnhanced(null); setCompareResult(null); setCompareText('');
    trackEvent('link_analysis', { count: 1 });
    setStarting(true);
    try {
      const access = await requireAiAccess('link_analysis', {
        onMessage: (m, code) => { setErr(m); setErrCode(code); },
      });
      if (!access.ok) { setPhase('input'); return; }
      const profile = aiUserProfile(user);
      startSingleLinkAnalysisJob({ url, language: lang, userProfile: profile });
    } catch {
      setErr(t('la.errFail')); setPhase('input');
    } finally {
      setStarting(false);
    }
  }

  // ── Compare flow: identify → comparison quiz → detailed verdict ──
  async function runCompare(list) {
    setErr(''); setEnhanced(null); setCompareResult(null); setCompareText('');
    trackEvent('link_analysis', { count: list.length });
    setStarting(true);
    try {
      const access = await requireAiAccess('link_compare', {
        onMessage: (m, code) => { setErr(m); setErrCode(code); },
      });
      if (!access.ok) { setPhase('input'); return; }
      startCompareLinkAnalysisJob({ urls: list, language: lang, userProfile: aiUserProfile(user) });
    } catch {
      setErr(t('la.errFail')); setPhase('input');
    } finally {
      setStarting(false);
    }
  }

  function analyze(e) {
    e.preventDefault();
    if (starting) return;
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
      {/* İkon ve alt yazı KALDIRILDI: logo zaten navbar'da, alt yazı da başlıkla
          birlikte ekranın üstünü şişiriyordu. Tek odak hareketli başlık. */}
      <PageHero animated title={t('la.title')} />

      <div className="container la-body">
      {showForm && (
        <>
          <Reveal className="la-stage">
            <form className="la-form" onSubmit={analyze}>
              <div className="la-form-head">
                <div className="la-form-title">
                  <strong>{L('Paste product links', 'Ürün linklerini yapıştır', 'Produktlinks einfügen')}</strong>
                  <span>{filled > 1
                    ? L('Comparison mode — analyzing side by side', 'Karşılaştırma modu — yan yana analiz', 'Vergleichsmodus — Seite an Seite')
                    : L('Add a second link to compare', 'Karşılaştırmak için ikinci link ekle', 'Zweiten Link zum Vergleichen hinzufügen')}</span>
                </div>
                <span className={'la-mode-pill' + (filled > 1 ? ' compare' : '')}>
                  {filled > 1
                    ? `⚖️ ${L('Compare', 'Karşılaştır', 'Vergleich')} · ${filled}`
                    : `🔎 ${L('Deep analysis', 'Derin analiz', 'Tiefenanalyse')}`}
                </span>
              </div>
              <div className="la-rows">
                {urls.map((url, i) => (
                  <div className="la-row" key={i}>
                    <span className="la-row-no">{i + 1}</span>
                    <input type="url" value={url} onChange={(e) => setUrl(i, e.target.value)}
                      placeholder={t('la.placeholder')} />
                    {!url.trim() && (
                      <button type="button" className="la-row-paste" onClick={() => pasteInto(i)}
                        aria-label={L('Paste', 'Yapıştır', 'Einfügen')} title={L('Paste from clipboard', 'Panodan yapıştır', 'Aus Zwischenablage einfügen')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="8" y="2" width="8" height="4" rx="1" />
                          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        </svg>
                      </button>
                    )}
                    {urls.length > 1 && url.trim() && (
                      <button type="button" className="la-row-x" onClick={() => removeUrl(i)} aria-label="Remove"><IconX size={13} width={2.6} /></button>
                    )}
                  </div>
                ))}
              </div>

              <div className="la-actions">
                <button type="submit" className="btn btn-grad btn-lg btn-shine la-go" disabled={!filled || starting}>
                  {filled > 1 ? t('la.analyzeMany', { n: filled }) : L('Analyze with AI', 'AI ile Analiz Et', 'Mit KI analysieren')}
                </button>
              </div>

              {/* Ne yapılacağının sözü — analizin gerçekten NE içerdiği. */}
              <ul className="la-promise">
                <li>🌐 {L('Real reviews from Reddit, YouTube, forums and stores', 'Reddit, YouTube, forum ve mağazalardan gerçek yorumlar', 'Echte Bewertungen aus Reddit, YouTube, Foren und Shops')}</li>
                <li>🧠 {L('A short quiz makes the score personally yours', 'Kısa bir quiz skoru sana özel yapar', 'Ein kurzes Quiz macht den Score persönlich')}</li>
                <li>🚨 {L('Critical points, risks and honest trade-offs', 'Kritik noktalar, riskler ve dürüst eksiler', 'Kritische Punkte, Risiken und ehrliche Nachteile')}</li>
              </ul>
            </form>
          </Reveal>

          {/* Warning shows right under the input form, where the user is looking. */}
          {err && <div className="la-err">{err}{errCode === 'INSUFFICIENT_QOR_COINS' && <> <a href="/premium">{L('See Premium', 'Premium’a bak', 'Premium ansehen')}</a></>}</div>}

          <Reveal delay={90}>
            <HowItWorks title={L('How it works', 'Nasıl çalışır', 'So funktioniert’s')} steps={howItWorks} />
          </Reveal>

          {user && (
            <Reveal delay={140} className="la-history">
              <HistoryPanel kind="link" lang={lang} refreshToken={histRefresh}
                onOpen={(it) => {
                  // GECMIS = CANLI SONUCLA AYNI EKRAN.
                  // Eskiden yalnizca `it.result` nesnesi varsa tam gorunum
                  // aciliyordu; yoksa `it.analysis` DUZ METIN sanilip paragraf
                  // olarak basiliyordu. Oysa tam rapor cogu kayitta `analysis`
                  // icinde JSON METNI olarak duruyor (olculdu: 33 KB,
                  // type=compare_full_report). historyPayload once yapisal
                  // veriyi arar, gercekten yoksa metne duser.
                  setUrls(it.urls.length ? it.urls.slice(0, MAX_LINKS) : ['']);
                  const payload = historyPayload(it);
                  if (payload && payload.kind === 'structured' && payload.data.base) {
                    setEnhanced(payload.data);
                    setCompareResult(null);
                    setCompareText('');
                  } else if (payload && payload.kind === 'structured') {
                    setEnhanced(null);
                    setCompareResult(payload.data);
                    setCompareText('');
                  } else {
                    setEnhanced(null);
                    setCompareResult(null);
                    setCompareText(payload ? payload.text : '');
                  }
                  setErr('');
                  setPhase('result');
                }} />
            </Reveal>
          )}
        </>
      )}

      {/* ÜST ÇIKIŞ ÇUBUĞU: quiz / yükleme / sonuç ekranlarında akıştan
          çıkmak için sayfanın en altına inmek gerekiyordu. */}
      {!showForm && (
        <AnalysisExitBar
          lang={lang}
          onExit={resetFlow}
          busy={phase === 'identifying' || phase === 'quizLoading' || phase === 'analyzing'}
          context={(() => {
            if (base?.title) return base.title;
            const names = compareBases.map((p) => p.title).filter(Boolean);
            if (names.length > 1) {
              return `${names.length} ${L('products', 'ürün', 'Produkte')} · ${names[0]}${names.length > 1 ? ` +${names.length - 1}` : ''}`;
            }
            return names[0] || urls.filter(Boolean).join(', ');
          })()}
        />
      )}

      {/* Fallback for non-input phases (the in-form one above covers input). */}
      {err && !showForm && <div className="la-err">{err}{errCode === 'INSUFFICIENT_QOR_COINS' && <> <a href="/premium">{L('See Premium', 'Premium’a bak', 'Premium ansehen')}</a></>}</div>}

      {(phase === 'identifying' || phase === 'quizLoading' || phase === 'analyzing') && (
        <AiWorkboard
          lang={lang}
          mode={phase === 'identifying' ? 'linkIdentify'
            : phase === 'quizLoading' ? 'linkQuiz'
              : filled > 1 ? 'linkCompare' : 'linkAnalyze'}
          stage={phase === 'analyzing' ? stage : null}
          startedAt={phaseStartedAt}
        />
      )}

      {/* HATA EKRANI: rapor uretilemedigunde kullaniciya BOS bir "analiz"
          gosterilmez (eskiden 60 puanlik, faktorsuz bir kabuk basiliyordu).
          Ayni cevaplarla tekrar denenir — yeni ucret alinmaz. */}
      {phase === 'error' && (
        <div className="la-failed fade-up">
          <span className="la-failed-icon" aria-hidden="true">!</span>
          <strong>{L('The report could not be generated',
            'Rapor oluşturulamadı',
            'Der Bericht konnte nicht erstellt werden')}</strong>
          <p>{L('Qor AI could not reach a complete result this time. Your answers are saved — try again without paying twice.',
            'Qor AI bu sefer eksiksiz bir sonuca ulaşamadı. Cevapların duruyor; ikinci kez ücret ödemeden tekrar deneyebilirsin.',
            'Qor AI konnte diesmal kein vollständiges Ergebnis erzielen. Deine Antworten sind gespeichert — versuche es erneut.')}</p>
          <div className="la-failed-actions">
            <button type="button" className="btn btn-grad btn-shine" onClick={() => retryLinkAnalysisJob()}>
              {L('Try again', 'Tekrar dene', 'Erneut versuchen')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={resetFlow}>
              {L('New analysis', 'Yeni analiz', 'Neue Analyse')}
            </button>
          </div>
        </div>
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
            onSubmit={(answers) => submitLinkAnalysisJobAnswers(activeJobId, answers, aiUserProfile(user))}
            onSkip={() => submitLinkAnalysisJobAnswers(activeJobId, [], aiUserProfile(user))}
          />
        </>
      )}

      {phase === 'quiz' && activeJobType === 'compare' && compareBases.length > 0 && questions.length > 0 && (
        <>
          <div className="la-identified la-identified-compare">
            <span className="la-identified-tag">{L('Compare', 'Karşılaştırma', 'Vergleich')}</span>
            <strong>{compareBases.map((p) => p.title || p.siteName || L('Product', 'Ürün', 'Produkt')).join(' vs ')}</strong>
          </div>
          <QuizFlow
            questions={questions}
            busy={false}
            title={L('Tune the comparison', 'Karşılaştırmayı kişiselleştir', 'Vergleich anpassen')}
            subtitle={L('Answer a few questions so Qor AI weighs these products like the app flow.',
              'Birkaç soruyu yanıtla; Qor AI bu ürünleri uygulamadaki akış gibi detaylı tartacak.',
              'Beantworte ein paar Fragen, damit Qor AI diese Produkte wie in der App detailliert gewichtet.')}
            onSubmit={(answers) => submitLinkAnalysisJobAnswers(activeJobId, answers, aiUserProfile(user))}
            onSkip={() => submitLinkAnalysisJobAnswers(activeJobId, [], aiUserProfile(user))}
          />
        </>
      )}

      {phase === 'result' && enhanced && <AiReportView data={enhanced} L={L} lang={lang} />}

      {phase === 'result' && compareResult && <CompareResult data={compareResult} L={L} lang={lang} />}

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
