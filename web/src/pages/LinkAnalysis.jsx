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
  firstSentencesOf,
  normalizeSentiment,
  scoreColor,
} from '../components/AiCharts.jsx';
import QuizFlow from '../components/QuizFlow.jsx';
import AiWorkboard from '../components/AiWorkboard.jsx';
import Gauge from '../components/Gauge.jsx';
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

// Eski kayıtlarda düz string, yeni kayıtlarda {title, detail} — tek şekle indir.
function bullets(v) {
  return (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === 'string'
      ? { title: x, detail: '' }
      : { title: String(x?.title || x?.name || ''), detail: String(x?.detail || x?.why || '') }))
    .filter((x) => x.title || x.detail);
}

// Rapor bölümü başlığı — görünür, numaralı, taranabilir.
function Sec({ icon, title, meta, children, tone = '' }) {
  return (
    <section className={`la-sec${tone ? ` ${tone}` : ''}`}>
      <h4>{icon} {title}{meta ? <em> · {meta}</em> : null}</h4>
      {children}
    </section>
  );
}

function FeatureMatchTable({ rows = [], L }) {
  if (!rows.length) return null;
  return (
    <div className="la-fm">
      {rows.map((f, i) => (
        <div className="la-fm-row" key={`${f.label}-${i}`}>
          <div className="la-fm-head">
            <strong>{f.label}</strong>
            <b style={{ color: scoreColor(f.score) }}>{Math.round(f.score || 0)}</b>
          </div>
          <div className="la-fm-track"><BarFill pct={Math.max(4, Math.min(100, f.score || 0))} color={scoreColor(f.score)} delay={i * 50} /></div>
          <div className="la-fm-cols">
            {f.productValue && <span><i>{L('Product', 'Üründe', 'Produkt')}</i>{f.productValue}</span>}
            {f.userNeed && <span><i>{L('You need', 'Senin ihtiyacın', 'Dein Bedarf')}</i>{f.userNeed}</span>}
          </div>
          {f.comment && <small>{f.comment}</small>}
        </div>
      ))}
    </div>
  );
}

function EnhancedResult({ data, L, lang }) {
  const score = Math.round(data.enhancedScore || 0);
  // History entries saved by older builds may miss the array fields — guard so
  // opening them never crashes the page.
  const pros = bullets(data.prosForUser);
  const cons = bullets(data.consForUser);
  const alts = bullets(data.alternatives);
  const factors = Array.isArray(data.factors) ? data.factors : [];
  const critical = Array.isArray(data.criticalPoints) ? data.criticalPoints : [];
  const insights = Array.isArray(data.quizInsights) ? data.quizInsights : [];
  const themes = Array.isArray(data.communityThemes) ? data.communityThemes : [];
  const praise = bullets(data.praisePoints);
  const complaints = bullets(data.complaintPoints);
  const reliability = bullets(data.reliabilityNotes);
  const verification = bullets(data.verificationNotes);
  const features = Array.isArray(data.featureMatches) ? data.featureMatches : [];
  const base = data.base || {};
  // Grafikler: topluluk sentiment donutu + faktör dengesi + radar profili.
  // sentimentBreakdown yoksa communityScore/score'dan türetilir.
  const sentiment = normalizeSentiment(
    data.sentimentBreakdown,
    Math.round(data.communityScore || score),
  );
  const dist = factorDistribution(factors);
  const headline = data.headline || firstSentencesOf(data.overallVerdict || data.verdict, 1);
  const trendLabel = {
    up: L('Rising', 'Yükselişte', 'Steigend'),
    down: L('Falling', 'Düşüşte', 'Fallend'),
    stable: L('Stable', 'Sabit', 'Stabil'),
  };
  return (
    <div className="la-result fade-up">
      <div className="la-result-head">
        <span>{L('Qor AI Analysis', 'Qor AI Analizi', 'Qor AI Analyse')}</span>
        <span className="la-result-title">{base.title}</span>
        {data.researched && (
          <span className="la-researched" title={L('Live web + community research was used', 'Canlı web + topluluk araştırması kullanıldı', 'Live-Web- und Community-Recherche verwendet')}>
            🌐 {L('Reviews scanned', 'Yorumlar tarandı', 'Bewertungen gescannt')}
          </span>
        )}
      </div>
      <div className="la-result-body">
        {/* ── Hero: skor + karar + tek cümle ── */}
        <section className={`la-hero-card ${data.decision || ''}`}>
          <Gauge value={score} size={104} stroke={9} color={scoreColor(score)} fontSize={30} />
          <div className="la-hero-main">
            <div className="la-hero-band" style={{ color: scoreColor(score) }}>{bandLabel(score, L)}</div>
            <div className="la-score-sub">{L('Personalized match score', 'Kişiselleştirilmiş uyum skoru', 'Personalisierter Match-Score')}</div>
            {headline && <p className="la-hero-line">{headline}</p>}
            <div className="la-hero-badges">
              <DecisionBadge score={data.decision === 'buy' ? 80 : data.decision === 'skip' ? 30 : data.decision === 'consider' ? 60 : score} L={L} />
              {base.siteName && <span className="la-hero-site">{base.siteName}</span>}
            </div>
          </div>
          <StoreCta url={base.url || data.url} lang={lang} L={L} />
        </section>

        <StatTiles items={[
          { icon: '🎯', label: L('Match', 'Uyum', 'Match'), value: score, color: scoreColor(score), hint: bandLabel(score, L) },
          data.personaScore ? { icon: '👤', label: L('Fits your life', 'Yaşamına uyum', 'Lebensfit'), value: Math.round(data.personaScore), color: scoreColor(data.personaScore) } : null,
          data.communityScore ? { icon: '🌐', label: L('Owner satisfaction', 'Kullanıcı memnuniyeti', 'Zufriedenheit'), value: Math.round(data.communityScore), color: scoreColor(data.communityScore) } : null,
          data.confidence ? { icon: '🔬', label: L('Evidence', 'Kanıt gücü', 'Beleglage'), value: `${Math.round(data.confidence)}%`, hint: data.researched ? L('web-researched', 'web taramalı', 'web-recherchiert') : L('model knowledge', 'model bilgisi', 'Modellwissen') } : null,
        ].filter(Boolean)} />

        {/* ── Grafikler ── */}
        <div className="aic-row">
          {factors.length >= 3 && <RadarChart factors={factors} L={L} color="var(--brand-blue)" />}
          <SentimentDonut breakdown={sentiment} L={L} />
          <DistributionBar strong={dist.strong} balanced={dist.balanced} weak={dist.weak} L={L} />
        </div>

        {factors.length > 0 && (
          <Sec icon="📊" title={L('Factor by factor', 'Faktör faktör', 'Faktor für Faktor')}>
            <FactorList factors={factors} />
          </Sec>
        )}

        <CriticalPoints items={critical} L={L} />

        <ProConList pros={pros} cons={cons} L={L} />

        <QuizImpact items={insights} L={L} />

        {(themes.length > 0 || data.communityAnalysis) && (
          <div className="la-community">
            <CommunityThemes themes={themes} L={L} />
            <SourceChips sources={data.sources} L={L} />
            {(praise.length > 0 || complaints.length > 0) && (
              <ProConList
                pros={praise} cons={complaints} L={L}
                titles={{
                  pro: L('What owners love', 'Kullanıcıların sevdiği', 'Was Nutzer lieben'),
                  con: L('What owners complain about', 'Kullanıcıların şikâyeti', 'Worüber Nutzer klagen'),
                }}
              />
            )}
            {data.communityAnalysis && (
              <Sec icon="🌐" title={L('Community reception', 'Topluluk yorumu', 'Community-Echo')}
                meta={data.communityScore ? `${Math.round(data.communityScore)}/100` : ''}>
                <div className="la-prose"><AiText text={data.communityAnalysis} /></div>
              </Sec>
            )}
            {reliability.length > 0 && (
              <Sec icon="🛠" title={L('Reliability and support', 'Güvenilirlik ve destek', 'Zuverlässigkeit und Support')}>
                <ul className="la-notes">{reliability.map((x, i) => <li key={i}>{x.title}{x.detail ? ` — ${x.detail}` : ''}</li>)}</ul>
              </Sec>
            )}
          </div>
        )}

        {data.verdict && (
          <Sec icon="📋" title={L('The full picture', 'Tam değerlendirme', 'Das ganze Bild')}>
            <div className="la-prose"><AiText text={data.verdict} /></div>
          </Sec>
        )}

        {data.personaAnalysis && (
          <Sec icon="👤" title={L('How it fits you', 'Sana uyumu', 'Wie es zu dir passt')}
            meta={data.personaScore ? `${Math.round(data.personaScore)}/100` : ''}>
            <div className="la-prose"><AiText text={data.personaAnalysis} /></div>
          </Sec>
        )}

        {(data.bestFor || data.notFor) && (
          <div className="la-forwho">
            {data.bestFor && (
              <div className="la-forwho-card good">
                <h5>👍 {L('Perfect for', 'Tam uygun', 'Perfekt für')}</h5>
                <p>{data.bestFor}</p>
              </div>
            )}
            {data.notFor && (
              <div className="la-forwho-card bad">
                <h5>👎 {L('Not for', 'Uygun değil', 'Nicht für')}</h5>
                <p>{data.notFor}</p>
              </div>
            )}
          </div>
        )}

        {features.length > 0 && (
          <Collapsible label={`🧩 ${L('Feature-by-need breakdown', 'Özellik–ihtiyaç eşleşmesi', 'Funktion-Bedarf-Abgleich')}`}>
            <FeatureMatchTable rows={features} L={L} />
          </Collapsible>
        )}

        {alts.length > 0 && (
          <Sec icon="🔀" title={L('Alternatives worth a look', 'Bakmaya değer alternatifler', 'Alternativen')}>
            <div className="la-alt-grid">
              {alts.map((a, i) => (
                <div className="la-alt-card" key={i}>
                  <strong>{a.title}</strong>
                  {a.detail && <span>{a.detail}</span>}
                </div>
              ))}
            </div>
          </Sec>
        )}

        {data.priceOutlook && (data.priceOutlook.note || data.priceOutlook.bestTime) && (
          <Sec icon="⏱" title={L('Timing and value', 'Zamanlama ve değer', 'Timing und Wert')}
            meta={trendLabel[data.priceOutlook.trend] || ''}>
            {data.priceOutlook.bestTime && <p className="la-timing">🗓 {data.priceOutlook.bestTime}</p>}
            {data.priceOutlook.note && <div className="la-prose"><AiText text={data.priceOutlook.note} /></div>}
          </Sec>
        )}

        {data.overallVerdict && (
          <Sec icon="🏁" title={L('Final verdict', 'Son karar', 'Endgültiges Fazit')} tone="la-sec-final">
            <div className="la-prose"><AiText text={data.overallVerdict} /></div>
          </Sec>
        )}

        {verification.length > 0 && (
          <div className="la-verify">
            <strong>🔍 {L('What is verified, what is not', 'Neyi doğruladık, neyi doğrulamadık', 'Was belegt ist')}</strong>
            <ul>{verification.map((x, i) => <li key={i}>{x.title}{x.detail ? ` — ${x.detail}` : ''}</li>)}</ul>
          </div>
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
      <div className="la-result-head">
        <span>{L('Qor AI Comparison', 'Qor AI Karşılaştırması', 'Qor AI Vergleich')}</span>
        <span className="la-result-title">{products.map((p) => p.name).join(' vs ')}</span>
        {data.researched && (
          <span className="la-researched">🌐 {L('Reviews scanned', 'Yorumlar tarandı', 'Bewertungen gescannt')}</span>
        )}
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
  const seenSavedJobRef = useRef('');

  useEffect(() => subscribeLinkAnalysisJob((job) => {
    if (!job) return;
    setActiveJobId(job.id || '');
    setActiveJobType(job.type || '');
    setStage(job.stage || null);
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

      {/* Fallback for non-input phases (the in-form one above covers input). */}
      {err && !showForm && <div className="la-err">{err}{errCode === 'INSUFFICIENT_QOR_COINS' && <> <a href="/premium">{L('See Premium', 'Premium’a bak', 'Premium ansehen')}</a></>}</div>}

      {(phase === 'identifying' || phase === 'quizLoading' || phase === 'analyzing') && (
        <AiWorkboard
          lang={lang}
          mode={phase === 'identifying' ? 'linkIdentify'
            : phase === 'quizLoading' ? 'linkQuiz'
              : filled > 1 ? 'linkCompare' : 'linkAnalyze'}
          stage={phase === 'analyzing' ? stage : null}
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
