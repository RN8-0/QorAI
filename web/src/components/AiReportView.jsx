// ═══════════════════════════════════════════════════════════════════════════
// ORTAK AI RAPOR GÖRÜNÜMÜ
//
// 2026-08-08: Link ve abonelik analizi bu düzenle çalışıyordu; ürün ve
// karşılaştırma analizleri ise KENDİ eski şablonlarını kullanıyordu (farklı
// başlıklar, farklı grafikler, kritik nokta / quiz etkisi / topluluk teması
// blokları hiç yok). Kullanıcı dört akışın da AYNI şablonu ve AYNI altyapıyı
// kullanmasını istedi. Bu dosya, eskiden LinkAnalysis.jsx içinde duran
// `EnhancedResult` bileşeninin paylaşılan hâlidir.
//
// Veri sözleşmesi (link analizi şeması): ürün ve karşılaştırma raporları
// `lib/reportAdapters.js` içindeki dönüştürücülerle bu şekle çevrilir.
// ═══════════════════════════════════════════════════════════════════════════
import AiText from './AiText.jsx';
import AmazonLogo from './AmazonLogo.jsx';
import Gauge from './Gauge.jsx';
import ProductImg from './ProductImg.jsx';
import { Link } from 'react-router-dom';
import {
  BarFill,
  Collapsible,
  CommunityThemes,
  CriticalPoints,
  DecisionBadge,
  DistributionBar,
  FactorList,
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
} from './AiCharts.jsx';
import { trackEvent } from '../lib/analytics';
import { useGeoCountry } from '../lib/geo';
import { productPath } from '../lib/routes';
import {
  amazonStorefrontsForLang, formatPrice, formatPriceAmount, localizeAmazonUrl, priceForCountry,
  safeExternalUrl,
} from '../lib/format';
import '../pages/LinkAnalysis.css';

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

export function StoreCta({ url, lang, L, compact = false, source = 'link_analysis_result' }) {
  const geoCountry = useGeoCountry();
  const cta = amazonCtaForUrl(url, lang, geoCountry);
  if (!cta?.primary?.url) return null;
  const label = L('View on Amazon', 'Amazon’da gör', 'Bei Amazon ansehen');
  const click = (market) => trackEvent('affiliate_click', {
    source,
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

export function bandLabel(s, L) {
  return s >= 85 ? L('Excellent match', 'Mükemmel uyum', 'Exzellent')
    : s >= 70 ? L('Strong match', 'Güçlü uyum', 'Starke Übereinstimmung')
      : s >= 50 ? L('Fair match', 'Orta uyum', 'Mäßig')
        : L('Weak match', 'Zayıf uyum', 'Schwach');
}

// Eski kayıtlarda düz string, yeni kayıtlarda {title, detail} — tek şekle indir.
export function bullets(v) {
  return (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === 'string'
      ? { title: x, detail: '' }
      : { title: String(x?.title || x?.name || ''), detail: String(x?.detail || x?.why || '') }))
    .filter((x) => x.title || x.detail);
}

export function list(v) {
  return Array.isArray(v) ? v.filter((x) => x != null && String(x).trim()) : [];
}

// Rapor bölümü başlığı — görünür, numaralı, taranabilir.
export function Sec({ icon, title, meta, children, tone = '' }) {
  return (
    <section className={`la-sec${tone ? ` ${tone}` : ''}`}>
      <h4>{icon} {title}{meta ? <em> · {meta}</em> : null}</h4>
      {children}
    </section>
  );
}

// Yapıştırılan ürün BİZDE de varsa: kendi sayfamıza bağlanan, fiyatı ve tech
// score'u gösteren kart. Kullanıcı kendi kataloğumuzdaki ürünü dışarıda
// aramak zorunda kalmasın.
export function CatalogMatchCard({ match, L, lang }) {
  const geoCountry = useGeoCountry();
  if (!match?.id) return null;
  const priced = priceForCountry(match, geoCountry);
  const to = productPath({ id: match.id, slug: match.slug, name: match.name });
  return (
    <Link className="la-catalog" to={to}>
      <span className="la-catalog-tag">✅ {L('This product is in the Qor catalog', 'Bu ürün Qor kataloğunda var', 'Dieses Produkt ist im Qor-Katalog')}</span>
      <div className="la-catalog-body">
        <ProductImg product={match} size="thumb" className="la-catalog-img" alt="" />
        <div className="la-catalog-copy">
          <strong>{match.name}</strong>
          <div className="la-catalog-meta">
            {match.techScore > 0 && (
              <span className="la-catalog-score" style={{ color: scoreColor(match.techScore) }}>
                {Math.round(match.techScore)}<i>/100</i>
              </span>
            )}
            {priced?.price > 0 ? (
              <span className="la-catalog-price">{formatPriceAmount(priced.price, priced.currency, lang)}</span>
            ) : match.lowestPriceUSD > 0 ? (
              <span className="la-catalog-price">{formatPrice(match.lowestPriceUSD)}</span>
            ) : null}
          </div>
        </div>
        <span className="la-catalog-cta">
          {L('Open product page', 'Ürün sayfasını aç', 'Produktseite öffnen')}
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </span>
      </div>
    </Link>
  );
}

export function FeatureMatchTable({ rows = [], L }) {
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

/**
 * Tek rapor şablonu. Link, abonelik, ürün ve karşılaştırma analizlerinin hepsi
 * bunu render eder.
 *
 * @param data          link-analizi şeklindeki normalize rapor
 * @param headerNode    hero'nun üstüne (kart içine) eklenecek özel içerik
 * @param heroExtra     hero kartının sağına (ör. mağaza butonu)
 * @param altNode       alternatifler bölümünün gövdesi (zengin kart ızgarası)
 * @param tailNode      raporun sonuna eklenecek içerik
 */
export default function AiReportView({
  data = {}, L, lang, headerNode = null, heroExtra = null, altNode = null, tailNode = null,
  showHead = true,
}) {
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
  const outlook = data.priceOutlook || {};
  const drivers = bullets(outlook.drivers);
  return (
    <div className="la-result fade-up">
      {showHead && (
        <div className="la-result-head">
          <span>{L('Qor AI Analysis', 'Qor AI Analizi', 'Qor AI Analyse')}</span>
          <span className="la-result-title">{base.title}</span>
          {data.researched && (
            <span className="la-researched" title={L('Live web + community research was used', 'Canlı web + topluluk araştırması kullanıldı', 'Live-Web- und Community-Recherche verwendet')}>
              🌐 {L('Reviews scanned', 'Yorumlar tarandı', 'Bewertungen gescannt')}
            </span>
          )}
        </div>
      )}
      <div className="la-result-body">
        {headerNode}

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
          {heroExtra !== null ? heroExtra : <StoreCta url={base.url || data.url} lang={lang} L={L} />}
        </section>

        <CatalogMatchCard match={data.catalogMatch} L={L} lang={lang} />

        <StatTiles items={[
          { icon: '🎯', label: L('Match', 'Uyum', 'Match'), value: score, color: scoreColor(score), hint: bandLabel(score, L) },
          data.personaScore ? { icon: '👤', label: L('Fits your life', 'Yaşamına uyum', 'Lebensfit'), value: Math.round(data.personaScore), color: scoreColor(data.personaScore) } : null,
          data.communityScore ? { icon: '🌐', label: L('Owner satisfaction', 'Kullanıcı memnuniyeti', 'Zufriedenheit'), value: Math.round(data.communityScore), color: scoreColor(data.communityScore) } : null,
          data.confidence ? { icon: '🔬', label: L('Evidence', 'Kanıt gücü', 'Beleglage'), value: `${Math.round(data.confidence)}%`, hint: data.researched ? L('web-researched', 'web taramalı', 'web-recherchiert') : L('model knowledge', 'model bilgisi', 'Modellwissen') } : null,
        ].filter(Boolean)} />

        {/* ── Grafikler ── */}
        <div className="aic-row">
          {factors.length >= 3 && <RadarChart factors={factors} L={L} color="var(--brand-blue)" />}
          <div className="aic-col">
            <SentimentDonut breakdown={sentiment} L={L} />
            <DistributionBar strong={dist.strong} balanced={dist.balanced} weak={dist.weak} L={L} />
          </div>
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

        {altNode || (alts.length > 0 && (
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
        ))}

        {(outlook.note || outlook.bestTime || drivers.length > 0) && (
          <Sec icon="⏱" title={L('Timing and value', 'Zamanlama ve değer', 'Timing und Wert')}
            meta={trendLabel[outlook.trend] || ''}>
            {outlook.bestTime && <p className="la-timing">🗓 {outlook.bestTime}</p>}
            {outlook.expectedChange && <p className="la-timing">📉 {outlook.expectedChange}</p>}
            {outlook.note && <div className="la-prose"><AiText text={outlook.note} /></div>}
            {drivers.length > 0 && (
              <ul className="la-notes">{drivers.map((x, i) => <li key={i}>{x.title}{x.detail ? ` — ${x.detail}` : ''}</li>)}</ul>
            )}
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

        {tailNode}
      </div>
    </div>
  );
}
