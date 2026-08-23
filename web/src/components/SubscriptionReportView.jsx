// ═══════════════════════════════════════════════════════════════════════════
//  ABONELIK RAPORU — PAYLASILAN GORUNUM
//
//  Bu govde ONCE pages/Subscriptions.jsx icinde, sayfanin ortasinda satir ici
//  yaziliydi. Yayinlanabilir analizler (`/analiz/<slug>`, kind='subscription')
//  ayni raporu cizmek zorunda oldugu icin buraya TASINDI (kopyalanmadi):
//  Subscriptions.jsx artik bu bileseni cagiriyor.
//
//  Neden ayri bilesen: urun ve link raporu zaten ortak sablonda
//  (components/AiReportView.jsx) birlesmisti; abonelik raporunun SEKLI farkli
//  (servis kartlari, servis basina bolumler, secim tablosu) ve ortak sekle
//  zorlanamaz. Ikinci bir kopya yazmak yerine tek bilesen iki yerden cagriliyor.
//
//  `onReset` yalnizca CANLI akista verilir; yayinlanmis sayfada "Yeni analiz"
//  butonu yoktur.
// ═══════════════════════════════════════════════════════════════════════════
import AiText from './AiText.jsx';
import Gauge from './Gauge.jsx';
import SubLogo from './SubLogo.jsx';
import {
  BarFill,
  Collapsible,
  CommunityThemes,
  CriticalPoints,
  DecisionBadge,
  DistributionBar,
  FactorList,
  ForumFindings,
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
} from './AiCharts.jsx';
// `subs-*` sinifları burada YASAR. Bilesen iki yerden cagriliyor (Abonelikler
// sayfasi ve yayinlanan analiz sayfasi); CSS'i sayfaya birakmak, ikinci
// cagirandan stilsiz cikmasi demekti — analiz sayfasinda tam olarak bu oldu.
import '../pages/Subscriptions.css';


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
  // Forum bulgulari: `cons` plan sayfasindan okunabilen takas, bunlar aylar
  // sonra cikan ve TEKRAR EDEN sorun. Ayni listeyi iki kez basmamak icin ayri.
  // bullets() KULLANILMIYOR: {title, detail} disini dusuruyor ve kronik
  // sorunun `frequency` rozeti kayboluyordu.
  const loved = s.lovedFeatures;
  const chronic = s.chronicIssues;
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
    forum: <ForumFindings loved={loved} chronic={chronic} L={L} />,
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
  'forwho', 'themes', 'forum', 'community', 'cancel', 'extras',
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

export default function SubscriptionReportView({ result, winnerName, L, t, hideQuiz = false, onReset = null }) {
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

      {!hideQuiz && <QuizImpact items={insights} L={L} />}

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

      {onReset && (
        <div className="subs-again">
          <button type="button" className="btn btn-ghost" onClick={onReset}>
            {L('New analysis', 'Yeni analiz')}
          </button>
        </div>
      )}
    </div>
  );
}

export { bullets as subscriptionBullets, Sec as SubscriptionSec };
