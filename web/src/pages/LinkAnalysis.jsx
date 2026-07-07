import { useEffect, useRef, useState } from 'react';
import { trackEvent } from '../lib/analytics';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth';
import { aiUserProfile } from '../lib/qorCoins';
import { useAiAccess } from '../lib/useAiAccess';
import {
  clearLinkAnalysisJob,
  startCompareLinkAnalysisJob,
  startSingleLinkAnalysisJob,
  submitLinkAnalysisJobAnswers,
  subscribeLinkAnalysisJob,
} from '../lib/linkAnalysisJobs';
import AiText from '../components/AiText.jsx';
import AmazonLogo from '../components/AmazonLogo.jsx';
import {
  BarFill,
  Collapsible,
  DecisionBadge,
  DistributionBar,
  SentimentDonut,
  factorDistribution,
  firstSentencesOf,
  normalizeSentiment,
} from '../components/AiCharts.jsx';
import QuizFlow from '../components/QuizFlow.jsx';
import AiWorkboard from '../components/AiWorkboard.jsx';
import Gauge, { techColor } from '../components/Gauge.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import HowItWorks from '../components/HowItWorks.jsx';
import Reveal from '../components/Reveal.jsx';
import PageHero from '../components/PageHero.jsx';
import { useSeo } from '../lib/seo';
import { amazonStorefrontsForLang, localizeAmazonUrl, safeExternalUrl } from '../lib/format';
import { useGeoCountry } from '../lib/geo';
import './LinkAnalysis.css';

const MAX_LINKS = 4;
const PENDING_LINK_KEY = 'qor.pendingLinkAnalysis';

// geo gates the affiliate tag: a cross-geo storefront button goes untagged so
// Amazon's server-side gg3 router can't bounce the click to another store.
function amazonCtaForUrl(url, lang, geo) {
  const raw = safeExternalUrl(url);
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (!/(^|\.)amazon\./i.test(u.hostname)) return null;
  } catch {
    return null;
  }
  const storefronts = amazonStorefrontsForLang(raw, lang, geo);
  const primary = storefronts[0] || { market: '', flag: '', url: localizeAmazonUrl(raw, lang, geo) };
  return { primary, extras: storefronts.slice(1) };
}

function StoreCta({ url, lang, L, compact = false }) {
  const geoCountry = useGeoCountry();
  const cta = amazonCtaForUrl(url, lang, geoCountry);
  if (!cta?.primary?.url) return null;
  const label = L('View on Amazon', 'Amazon’da gör', 'Bei Amazon ansehen');
  const click = (market) => trackEvent('affiliate_click', {
    source: 'link_analysis_result',
    store: 'amazon',
    market: market || String(lang || 'en').slice(0, 2),
  });
  return (
    <div className={'la-store-ctas' + (compact ? ' compact' : '')}>
      <a className="la-store-cta" href={cta.primary.url} target="_blank" rel="sponsored noopener"
        onClick={() => click(cta.primary.market)}>
        <AmazonLogo height={compact ? 14 : 16} className="la-store-logo" />
        <span>{label}</span>
        {cta.primary.flag && <i>{cta.primary.flag}</i>}
      </a>
      {cta.extras.map((s) => (
        <a key={`${s.market}-${s.url}`} className="la-store-flag" href={s.url} target="_blank"
          rel="sponsored noopener" aria-label={`${label} ${s.market}`} onClick={() => click(s.market)}>
          {s.flag || s.market}
        </a>
      ))}
    </div>
  );
}

function bandLabel(s, L) {
  return s >= 85 ? L('Excellent match', 'Mükemmel uyum', 'Exzellent')
    : s >= 70 ? L('Strong match', 'Güçlü uyum', 'Starke Übereinstimmung')
      : s >= 50 ? L('Fair match', 'Orta uyum', 'Mäßig')
        : L('Weak match', 'Zayıf uyum', 'Schwach');
}

// Spider/radar chart of the match factors — a visual "shape" of the fit that
// reads faster than a column of bars. Colour comes from the overall band.
function FactorRadar({ factors = [], size = 230 }) {
  const fs = (factors || []).filter((f) => f && Number.isFinite(Number(f.score)));
  if (fs.length < 3) return null;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 26;
  const N = fs.length;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / N;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = (vals) => vals.map((v, i) => pt(i, v).join(',')).join(' ');
  const clamp = (s) => Math.max(0, Math.min(100, Number(s) || 0));
  const dataPoly = poly(fs.map((f) => (clamp(f.score) / 100) * R));
  const avg = Math.round(fs.reduce((s, f) => s + clamp(f.score), 0) / N);
  const color = techColor(avg);
  return (
    <svg className="la-radar" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Factor radar">
      {[0.25, 0.5, 0.75, 1].map((g, i) => (
        <polygon key={i} points={poly(fs.map(() => g * R))} className="la-radar-ring" />
      ))}
      {fs.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="la-radar-axis" />; })}
      <polygon points={dataPoly} className="la-radar-area" style={{ fill: color, stroke: color }} />
      {fs.map((f, i) => { const [x, y] = pt(i, (clamp(f.score) / 100) * R); return <circle key={i} cx={x} cy={y} r="3.2" style={{ fill: color }} />; })}
      {fs.map((f, i) => {
        const [lx, ly] = pt(i, R + 13);
        return <text key={i} x={lx} y={ly} className="la-radar-emoji" textAnchor="middle" dominantBaseline="middle">{f.emoji}</text>;
      })}
    </svg>
  );
}

function FactorBars({ factors = [] }) {
  if (!factors.length) return null;
  // Skora göre azalan sıralı, 0→değer animasyonlu çubuklar (spec §4A).
  const rows = [...factors].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  return (
    <div className="la-factors">
      {rows.map((f, i) => (
        <div className="la-factor" key={f.label}>
          <div className="la-factor-top">
            <span>{f.emoji} {f.label}</span>
            <b style={{ color: techColor(f.score) }}>{Math.round(f.score)}</b>
          </div>
          <div className="la-factor-bar"><BarFill pct={Math.max(4, Math.min(100, f.score))} color={techColor(f.score)} delay={i * 60} /></div>
        </div>
      ))}
    </div>
  );
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
        <span className="la-load-core" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
            <path d="M18.5 14.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8.8-1.7z" />
          </svg>
        </span>
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

function EnhancedResult({ data, L, lang }) {
  const score = Math.round(data.enhancedScore || 0);
  // History entries saved by older builds may miss the array fields — guard so
  // opening them never crashes the page.
  const pros = Array.isArray(data.prosForUser) ? data.prosForUser : [];
  const cons = Array.isArray(data.consForUser) ? data.consForUser : [];
  const alts = Array.isArray(data.alternatives) ? data.alternatives : [];
  const factors = Array.isArray(data.factors) ? data.factors : [];
  const base = data.base || {};
  // Grafikler (spec §4, web+app senkron): topluluk sentiment donutu +
  // faktör dengesi dağılımı. sentimentBreakdown yoksa communityScore/score'dan
  // türetilir; dağılım faktör skorlarından hesaplanır (AI gerekmez).
  const sentiment = normalizeSentiment(
    data.sentimentBreakdown,
    Math.round(data.communityScore || score),
  );
  const dist = factorDistribution(factors);
  // Hero tek cümle: nihai karardan (yoksa değerlendirmeden) ilk cümle.
  const oneLiner = firstSentencesOf(data.overallVerdict || data.verdict, 1);
  const hasDetail = data.verdict || data.personaAnalysis || data.communityAnalysis
    || data.overallVerdict || alts.length > 0 || pros.length > 3 || cons.length > 3;
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
            <div className="la-hero-badge"><DecisionBadge score={score} L={L} /></div>
          </div>
          <StoreCta url={base.url || data.url} lang={lang} L={L} />
        </div>

        {oneLiner && <p className="aic-hero-line">{oneLiner}</p>}

        {factors.length > 0 && (
          <div className="la-factor-wrap">
            <FactorRadar factors={factors} />
            <div className="la-factor-bars-col"><FactorBars factors={factors} /></div>
          </div>
        )}

        <div className="aic-row">
          <SentimentDonut breakdown={sentiment} L={L} />
          <DistributionBar strong={dist.strong} balanced={dist.balanced} weak={dist.weak} L={L} />
        </div>

        {(pros.length > 0 || cons.length > 0) && (
          <div className="la-poncons">
            {pros.length > 0 && (
              <div className="la-pc la-pc-pro">
                <h4>✓ {L('Good for you', 'Senin için iyi', 'Gut für dich')}</h4>
                <ul>{pros.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            {cons.length > 0 && (
              <div className="la-pc la-pc-con">
                <h4>⚠ {L('Watch outs', 'Dikkat edilmesi gerekenler', 'Nachteile')}</h4>
                <ul>{cons.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        {/* Uzun metinler varsayılan kapalı — "tek bakışta anla" için (spec §5). */}
        {hasDetail && (
          <Collapsible label={`📖 ${L('Detailed analysis', 'Detaylı analiz', 'Detaillierte Analyse')}`}>
            {data.verdict && (
              <section className="la-sec">
                <h4>📋 {L('Verdict', 'Değerlendirme', 'Fazit')}</h4>
                <div className="la-prose"><AiText text={data.verdict} /></div>
              </section>
            )}

            {(pros.length > 3 || cons.length > 3) && (
              <div className="la-poncons">
                {pros.length > 3 && (
                  <div className="la-pc la-pc-pro">
                    <h4>✓ {L('Good for you', 'Senin için iyi', 'Gut für dich')}</h4>
                    <ul>{pros.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                )}
                {cons.length > 3 && (
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
          </Collapsible>
        )}
      </div>
    </div>
  );
}

function list(v) {
  return Array.isArray(v) ? v.filter((x) => x != null && String(x).trim()) : [];
}

function CompareScoreChart({ products = [], L }) {
  if (!products.length) return null;
  const max = Math.max(100, ...products.map((p) => Math.round(p.score || 0)));
  return (
    <section className="la-cmp-chart">
      <div className="la-cmp-section-title">📊 {L('Compatibility scores', 'Uyum puanları', 'Kompatibilitätswerte')}</div>
      <div className="la-cmp-chart-rows">
        {products.map((p, i) => {
          const score = Math.round(p.score || 0);
          const color = techColor(score);
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

function CompareFactorMatrix({ products = [], L }) {
  const labels = [...new Set(products.flatMap((p) => list(p.factors).map((f) => f.label)))];
  if (!labels.length || !products.length) return null;
  return (
    <section className="la-cmp-matrix">
      <div className="la-cmp-section-title">🧭 {L('Factor breakdown', 'Faktör kırılımı', 'Faktorvergleich')}</div>
      {labels.map((label) => (
        <div className="la-cmp-matrix-row" key={label}>
          <div className="la-cmp-matrix-label">{label}</div>
          <div className="la-cmp-matrix-bars">
            {products.map((p) => {
              const f = list(p.factors).find((x) => x.label === label);
              const score = Math.round(f?.score || 0);
              const color = techColor(score);
              return (
                <div className="la-cmp-mini" key={`${p.name}-${label}`}>
                  <span>{p.name}</span>
                  <div><BarFill pct={Math.max(4, score)} color={color} /></div>
                  <b style={{ color }}>{score}</b>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

function CompareProductCard({ product, isWinner, L, lang }) {
  const score = Math.round(product.score || 0);
  const pros = list(product.pros);
  const cons = list(product.cons);
  const risks = list(product.risks);
  const factors = list(product.factors);
  const specs = list(product.specHighlights);
  return (
    <article className={'la-cmp-card' + (isWinner ? ' winner' : '')}>
      {isWinner && <span className="la-cmp-win-pill">★ {L('Best fit', 'En iyi eşleşme', 'Beste Wahl')}</span>}
      <div className="la-cmp-card-top">
        <Gauge value={score} size={66} stroke={6} color={techColor(score)} fontSize={18} />
        <div className="la-cmp-card-id">
          <strong>{product.name}</strong>
          <span>{product.siteName || L('Product link', 'Ürün linki', 'Produktlink')}</span>
        </div>
      </div>
      <StoreCta url={product.url || product.link} lang={lang} L={L} compact />
      {product.bestFor && <p className="la-cmp-bestfor"><b>{L('Best for', 'Kime uygun', 'Ideal für')}:</b> {product.bestFor}</p>}
      {product.summary && <div className="la-prose la-cmp-summary"><AiText text={product.summary} /></div>}

      {factors.length > 0 && (
        <div className="la-cmp-factors">
          {factors.map((f) => (
            <div className="la-cmp-factor" key={f.label}>
              <div className="la-cmp-factor-top">
                <span>{f.emoji} {f.label}</span>
                <b style={{ color: techColor(f.score) }}>{Math.round(f.score || 0)}</b>
              </div>
              <div className="la-factor-bar"><BarFill pct={Math.max(4, Math.min(100, f.score || 0))} color={techColor(f.score)} /></div>
              {f.detail && <small>{f.detail}</small>}
            </div>
          ))}
        </div>
      )}

      {specs.length > 0 && (
        <div className="la-cmp-specs">
          {specs.slice(0, 6).map((s, i) => (
            <span key={i}><b>{s.label}</b>{s.value}</span>
          ))}
        </div>
      )}

      {(pros.length > 0 || cons.length > 0) && (
        <div className="la-poncons">
          {pros.length > 0 && (
            <div className="la-pc la-pc-pro">
              <h4>✓ {L('Strengths', 'Güçlü yanlar', 'Stärken')}</h4>
              <ul>{pros.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {cons.length > 0 && (
            <div className="la-pc la-pc-con">
              <h4>⚠ {L('Trade-offs', 'Eksiler', 'Nachteile')}</h4>
              <ul>{cons.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {risks.length > 0 && (
        <div className="la-cmp-risks">
          <h4>🛠 {L('Ownership risks', 'Sahiplik riskleri', 'Besitzrisiken')}</h4>
          <ul>{risks.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}

      {product.community && (
        <section className="la-sec">
          <h4>🌐 {L('Community signal', 'Topluluk sinyali', 'Community-Signal')}</h4>
          <div className="la-prose"><AiText text={product.community} /></div>
        </section>
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
  return (
    <div className="la-result la-cmp-result fade-up">
      <div className="la-result-head">
        <span>{L('Qor AI Comparison', 'Qor AI Karşılaştırması', 'Qor AI Vergleich')}</span>
        <span className="la-result-title">{products.map((p) => p.name).join(' vs ')}</span>
      </div>
      <div className="la-result-body">
        <section className="la-cmp-hero">
          <div className="la-cmp-trophy">🏆</div>
          <div className="la-cmp-hero-copy">
            <span>{L('Best match', 'En iyi eşleşme', 'Beste Wahl')}</span>
            <strong>{best.name}</strong>
            {(data?.winner?.reason || data?.recommendation) && (
              <div className="la-prose"><AiText text={data.winner?.reason || data.recommendation} /></div>
            )}
          </div>
          <Gauge value={best.score} size={92} stroke={8} color={techColor(best.score)} fontSize={26} />
        </section>

        <CompareScoreChart products={products} L={L} />
        <CompareFactorMatrix products={products} L={L} />

        <div className="la-cmp-grid">
          {products.map((p) => <CompareProductCard key={p.name} product={p} isWinner={p.name === best.name} L={L} lang={lang} />)}
        </div>

        {gap > 0 && (
          <div className="la-cmp-gap">
            {L('Score difference between best and weakest match', 'En iyi ve en zayıf eşleşme arasındaki puan farkı', 'Punktedifferenz zwischen bester und schwächster Wahl')}: <b>{gap}</b>
          </div>
        )}

        {(detailed.fit || detailed.performance || detailed.ownership
          || detailed.recommendation || data?.recommendation) && (
          <Collapsible label={`📖 ${L('Detailed comparison', 'Detaylı karşılaştırma', 'Detaillierter Vergleich')}`}>
            {detailed.fit && (
              <section className="la-sec">
                <h4>🎯 {L('Quiz-based fit', 'Quiz bazlı uyum', 'Quizbasierte Passung')}</h4>
                <div className="la-prose"><AiText text={detailed.fit} /></div>
              </section>
            )}
            {detailed.performance && (
              <section className="la-sec">
                <h4>⚡ {L('Performance and specs', 'Performans ve özellikler', 'Leistung und Ausstattung')}</h4>
                <div className="la-prose"><AiText text={detailed.performance} /></div>
              </section>
            )}
            {detailed.ownership && (
              <section className="la-sec">
                <h4>🛡 {L('Long-term ownership', 'Uzun vadeli kullanım', 'Langzeitnutzung')}</h4>
                <div className="la-prose"><AiText text={detailed.ownership} /></div>
              </section>
            )}
            {(detailed.recommendation || data?.recommendation) && (
              <section className="la-sec la-sec-final">
                <h4>🏁 {L('Final recommendation', 'Nihai öneri', 'Abschließende Empfehlung')}</h4>
                <div className="la-prose"><AiText text={detailed.recommendation || data.recommendation} /></div>
              </section>
            )}
          </Collapsible>
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
  const [compareBases, setCompareBases] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [enhanced, setEnhanced] = useState(null);
  const [compareResult, setCompareResult] = useState(null);
  const [compareText, setCompareText] = useState('');
  const [histRefresh, setHistRefresh] = useState(0);
  const [err, setErr] = useState('');
  const [activeJobId, setActiveJobId] = useState('');
  const [activeJobType, setActiveJobType] = useState('');
  const seenSavedJobRef = useRef('');

  useEffect(() => subscribeLinkAnalysisJob((job) => {
    if (!job) return;
    setActiveJobId(job.id || '');
    setActiveJobType(job.type || '');
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
    try {
      const access = await requireAiAccess('link_analysis', { onMessage: setErr });
      if (!access.ok) { setPhase('input'); return; }
      const profile = aiUserProfile(user);
      startSingleLinkAnalysisJob({ url, language: lang, userProfile: profile });
    } catch {
      setErr(t('la.errFail')); setPhase('input');
    }
  }

  // ── Compare flow: identify → comparison quiz → detailed verdict ──
  async function runCompare(list) {
    setErr(''); setEnhanced(null); setCompareResult(null); setCompareText('');
    trackEvent('link_analysis', { count: list.length });
    try {
      const access = await requireAiAccess('link_compare', { onMessage: setErr });
      if (!access.ok) { setPhase('input'); return; }
      startCompareLinkAnalysisJob({ urls: list, language: lang, userProfile: aiUserProfile(user) });
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
          <img className="la-hero-logo" src="/assets/qor_logo_512.png?v=20260605a" alt="" />
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

          {/* Warning shows right under the input form, where the user is looking. */}
          {err && <div className="la-err">{err}</div>}

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
                    setCompareResult(null);
                    setCompareText('');
                  } else if (it.result && (it.result.type === 'compare_structured' || Array.isArray(it.result.products))) {
                    setEnhanced(null);
                    setCompareResult(it.result);
                    setCompareText('');
                  } else {
                    setEnhanced(null);
                    setCompareResult(null);
                    setCompareText(String(it.analysis || ''));
                  }
                  setErr('');
                  setPhase('result');
                }} />
            </Reveal>
          )}
        </>
      )}

      {/* Fallback for non-input phases (the in-form one above covers input). */}
      {err && !showForm && <div className="la-err">{err}</div>}

      {(phase === 'identifying' || phase === 'quizLoading' || phase === 'analyzing') && (
        <AiWorkboard
          lang={lang}
          mode={phase === 'identifying' ? 'linkIdentify'
            : phase === 'quizLoading' ? 'linkQuiz'
              : filled > 1 ? 'linkCompare' : 'linkAnalyze'}
        />
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

      {phase === 'result' && enhanced && <EnhancedResult data={enhanced} L={L} lang={lang} />}

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
