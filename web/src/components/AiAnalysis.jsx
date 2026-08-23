// ─────────────────────────────────────────────────────────────────────────
//  AI analysis — web port of the mobile app's premium AI cards.
//  Same prompts (structured JSON) + same visuals: animated score ring,
//  strength/weakness bars, pros/cons cards, verdict, smart alternatives,
//  advisor and price prediction. Shared by the product detail + compare pages.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import './AiAnalysis.css';
import ProductImg from './ProductImg.jsx';
import { productPath } from '../lib/routes';
import { displayProductName, cleanProductName } from '../lib/productNames';
import {
  BarFill,
  Collapsible,
  DecisionBadge,
  DistributionBar,
  HeatMatrix,
  SentimentDonut,
  factorDistribution,
  useCountUp,
  usePrefersReducedMotion,
} from './AiCharts.jsx';
// Ürün ve karşılaştırma raporları da link/abonelik ile AYNI şablonu kullanır.
import AiReportView, { Sec } from './AiReportView.jsx';
import { compareProductToUnified, productReportToUnified } from '../lib/reportAdapters';


// ─── Prompt'lar ve ad/adres yardimcilari: TEK KAYNAK ────────────────────────
// Quiz + rapor prompt'lari, urun adi temizligi, urun adresi ve `parseAiJson`
// ARTIK BURADA DEGIL: admin/js/qor_ai_prompts.js icinde yasiyorlar ve admin
// paneli de AYNI dosyayi calistiriyor. Analiz iki yerden (site ve admin)
// baslatilabildigi icin prompt metninin tek kopya olmasi sart; ikinci kopya
// kacinilmaz olarak ayrisir (proje bu dersi spec cevirisinde bir kez odedi).
//
// Buradan RE-EXPORT ediliyorlar cunku mevcut cagiranlar
// (lib/productAnalysisJobs.js, lib/compareAnalysisJobs.js, pages/Compare.jsx)
// bu modulden ice aktariyor ve o zincir bilerek TEMBEL: prompt'lari statik
// import etmek AiCharts'i (109 KB) urun sayfasinin acilis yoluna geri sokardi.
export {
  buildDeepPrompt, buildAltPrompt, buildAdvisorPrompt, buildPredictionPrompt,
  buildForumPrompt, buildProductResearchPrompt, buildCompareResearchPrompt,
  buildFullPrompt, buildComparePrompt, buildCompareProductPrompt,
  buildCompareVerdictPrompt, parseAiJson, hasStaleAvailabilityClaims,
  withFreshnessRetryInstruction,
} from '../lib/aiPrompts.js';
import { arr, firstSentences } from '../lib/aiPrompts.js';

function localizeAiText(value, L) {
  const raw = String(value || '').trim();
  const key = raw.toLowerCase();
  const exact = {
    'quiz answers': L('quiz answers', 'quiz cevapları'),
    'qor catalog specs': L('Qor catalog specs', 'Qor katalog özellikleri'),
    'community/review research': L('community/review research', 'topluluk ve yorum araştırması'),
    'similar products': L('similar products', 'benzer ürünler'),
    'reddit': 'Reddit',
    'youtube reviews': L('YouTube reviews', 'YouTube incelemeleri'),
    'retailer reviews': L('retailer reviews', 'mağaza yorumları'),
    'specialist sources': L('specialist sources', 'uzman kaynaklar'),
    'source types': L('source types', 'kaynak türleri'),
    buy: L('buy', 'satın al'),
    wait: L('wait', 'bekle'),
    watch: L('watch', 'takip et'),
  };
  return exact[key] || cleanProductName(raw);
}

function localizedAiList(items, L) {
  return arr(items).map((x) => localizeAiText(x, L));
}

const toInt = (v) => { const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; };
const toNum = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };

// ─── Shared visual atoms ────────────────────────────────────────────────────
function scoreColor(n) { return n >= 80 ? '#22c55e' : n >= 60 ? '#f59e0b' : '#f43f5e'; }

function ScoreRing({ value, max = 100, suffix = '/ 100' }) {
  const v = Math.max(0, Math.min(max, Number(value) || 0));
  const col = scoreColor((v / max) * 100);
  const R = 44, C = 2 * Math.PI * R;
  // Açılışta 0'dan hedefe süpür + sayıyı count-up'la (reduced-motion'da anında).
  const reduced = usePrefersReducedMotion();
  const [drawn, setDrawn] = useState(reduced);
  useEffect(() => {
    if (reduced) { setDrawn(true); return undefined; }
    const id = setTimeout(() => setDrawn(true), 40);
    return () => clearTimeout(id);
  }, [reduced]);
  const pct = (drawn ? v : 0) / max;
  const shown = useCountUp(v, { duration: 900 });
  return (
    <div className="ai-ring">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={R} fill="none" stroke={col} strokeOpacity="0.14" strokeWidth="8" />
        <circle cx="50" cy="50" r={R} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 50 50)"
          style={{ transition: reduced ? 'none' : 'stroke-dashoffset .9s cubic-bezier(.22,.61,.36,1)' }} />
      </svg>
      <div className="ai-ring-t" style={{ color: col }}>
        <b>{Math.round(shown)}</b><small>{suffix}</small>
      </div>
    </div>
  );
}

function AttrBar({ name, score, detail, color }) {
  const v = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <div className="ai-attr">
      <div className="ai-attr-top">
        <span className="ai-attr-name">{name}</span>
        <span className="ai-attr-score" style={{ color }}>{v}</span>
      </div>
      <div className="ai-attr-track" style={{ background: `${color}1f` }}>
        <BarFill pct={v} color={color} gradient />
      </div>
      {detail ? <small className="ai-attr-detail">{detail}</small> : null}
    </div>
  );
}

function ProCon({ icon, title, items, color }) {
  if (!items.length) return null;
  return (
    <div className="ai-procon" style={{ borderColor: `${color}33`, background: `${color}0d` }}>
      <h5 style={{ color }}>{icon} {title}</h5>
      <ul>{items.map((x, i) => <li key={i}><span style={{ color }}>{icon === '✓' ? '✓' : '•'}</span>{x}</li>)}</ul>
    </div>
  );
}

function SectionLabel({ icon, label, color }) {
  return <div className="ai-seclabel" style={{ color }}>{icon} {label}</div>;
}

// ─── DEEP ANALYSIS ──────────────────────────────────────────────────────────
function DeepView({ data, L }) {
  const overall = toInt(data.overallScore);
  const strengths = arr(data.strengths).map((s) => ({ name: s.name || '', score: toInt(s.score), detail: s.detail || '' }));
  const weaknesses = arr(data.weaknesses).map((s) => ({ name: s.name || '', score: toInt(s.score), detail: s.detail || '' }));
  const pros = arr(data.pros).map(String);
  const cons = arr(data.cons).map(String);
  const verdict = String(data.verdict || '').trim();
  return (
    <div className="ai-deep">
      {overall > 0 && <div className="ai-center"><ScoreRing value={overall} /></div>}
      {strengths.length > 0 && (
        <>
          <SectionLabel icon="📈" label={L('Strengths', 'Güçlü Yönler')} color="#22c55e" />
          {strengths.map((s, i) => <AttrBar key={i} {...s} color="#22c55e" />)}
        </>
      )}
      {weaknesses.length > 0 && (
        <>
          <SectionLabel icon="📉" label={L('Weaknesses', 'Zayıf Yönler')} color="#f43f5e" />
          {weaknesses.map((s, i) => <AttrBar key={i} {...s} color="#f43f5e" />)}
        </>
      )}
      {(pros.length > 0 || cons.length > 0) && (
        <div className="ai-procon-row">
          <ProCon icon="✓" title={L('Pros', 'Artılar')} items={pros} color="#22c55e" />
          <ProCon icon="✕" title={L('Cons', 'Eksiler')} items={cons} color="#f43f5e" />
        </div>
      )}
      {verdict && <div className="ai-verdict"><span>💡</span><p>{verdict}</p></div>}
    </div>
  );
}

// ─── SMART ALTERNATIVES ─────────────────────────────────────────────────────
function AltView({ data, L }) {
  const alts = arr(data.alternatives);
  if (!alts.length) return null;
  return (
    <div className="ai-alts">
      {alts.map((a, i) => (
        <div className="ai-alt" key={i}>
          <div className="ai-alt-name">{cleanProductName(a.name)}</div>
          {a.whyBetter && <div className="ai-alt-why">★ {a.whyBetter}</div>}
          <div className="ai-alt-grid">
            {a.advantage && <div className="ai-alt-cell ai-alt-adv"><b>{L('Advantage', 'Avantaj')}</b><span>{a.advantage}</span></div>}
            {a.tradeoff && <div className="ai-alt-cell ai-alt-trade"><b>{L('Trade-off', 'Dezavantaj')}</b><span>{a.tradeoff}</span></div>}
            {a.priceComparison && <div className="ai-alt-cell"><b>{L('Price', 'Fiyat')}</b><span>{a.priceComparison}</span></div>}
            {a.bestFor && <div className="ai-alt-cell"><b>{L('Best for', 'Kime uygun')}</b><span>{a.bestFor}</span></div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── ADVISOR ────────────────────────────────────────────────────────────────
function AdvisorView({ data, L }) {
  const rating = toNum(data.valueRating);
  const buy = arr(data.reasonsToBuy).map(String);
  const skip = arr(data.reasonsToSkip).map(String);
  const tips = arr(data.proTips).map(String);
  return (
    <div className="ai-advisor">
      {rating > 0 && (
        <div className="ai-center"><ScoreRing value={rating} max={10} suffix="/ 10" /></div>
      )}
      {String(data.ratingExplanation || '').trim() && <p className="ai-advisor-exp">{data.ratingExplanation}</p>}
      {String(data.whoShouldBuy || '').trim() && (
        <div className="ai-advisor-box ai-good"><b>👍 {L('Who should buy', 'Kime uygun')}</b><p>{data.whoShouldBuy}</p></div>
      )}
      {String(data.whoShouldAvoid || '').trim() && (
        <div className="ai-advisor-box ai-bad"><b>👎 {L('Who should avoid', 'Kime uygun değil')}</b><p>{data.whoShouldAvoid}</p></div>
      )}
      {(buy.length > 0 || skip.length > 0) && (
        <div className="ai-procon-row">
          <ProCon icon="✓" title={L('Reasons to buy', 'Alma sebepleri')} items={buy} color="#22c55e" />
          <ProCon icon="✕" title={L('Reasons to skip', 'Almama sebepleri')} items={skip} color="#f43f5e" />
        </div>
      )}
      {tips.length > 0 && (
        <div className="ai-tips"><b>💡 {L('Pro tips', 'İpuçları')}</b><ul>{tips.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      )}
    </div>
  );
}

// ─── PRICE PREDICTION ───────────────────────────────────────────────────────
function PredictionView({ data, L }) {
  const trend = String(data.trend || 'stable').toLowerCase();
  const pct = toInt(data.trendPercentage);
  const buyWait = String(data.buyOrWait || 'buy').toLowerCase();
  const arrow = trend === 'down' ? '↓' : trend === 'up' ? '↑' : '→';
  const tColor = trend === 'down' ? '#22c55e' : trend === 'up' ? '#f43f5e' : '#f59e0b';
  return (
    <div className="ai-pred">
      <div className="ai-pred-head">
        <div className="ai-pred-trend" style={{ color: tColor }}>
          <span className="ai-pred-arrow">{arrow}</span>
          <div><b>{trend === 'down' ? L('Falling', 'Düşüyor') : trend === 'up' ? L('Rising', 'Yükseliyor') : L('Stable', 'Sabit')}</b>{pct > 0 && <small>~{pct}%</small>}</div>
        </div>
        <div className={'ai-pred-verdict ' + (buyWait === 'wait' ? 'wait' : 'buy')}>
          {buyWait === 'wait' ? `⏳ ${L('Wait', 'Bekle')}` : `✓ ${L('Buy now', 'Şimdi al')}`}
        </div>
      </div>
      <div className="ai-pred-grid">
        {String(data.bestTimeToBuy || '').trim() && <div className="ai-pred-cell"><b>{L('Best time', 'En iyi zaman')}</b><span>{data.bestTimeToBuy}</span></div>}
        {String(data.expectedDrop || '').trim() && <div className="ai-pred-cell"><b>{L('Expected drop', 'Beklenen indirim')}</b><span>{data.expectedDrop}</span></div>}
      </div>
      {String(data.reasoning || '').trim() && <p className="ai-pred-reason">{data.reasoning}</p>}
    </div>
  );
}

// ─── COMPARE ────────────────────────────────────────────────────────────────
function CompareView({ data, L }) {
  const winner = cleanProductName(data.winner || '');
  const products = arr(data.products).map((p) => ({
    name: cleanProductName(p.name || ''), score: toInt(p.score), bestFor: p.bestFor || '',
    pros: arr(p.pros).map(String), cons: arr(p.cons).map(String),
  }));
  if (!products.length) return null;
  const max = Math.max(1, ...products.map((p) => p.score));
  return (
    <div className="ai-cmp">
      {winner && (
        <div className="ai-cmp-winner"><span>🏆</span><div><small>{L('AI pick', 'AI seçimi')}</small><b>{winner}</b></div></div>
      )}
      {String(data.verdict || '').trim() && <p className="ai-cmp-verdict">{data.verdict}</p>}
      <div className="ai-cmp-products">
        {products.map((p, i) => {
          const isWin = winner && p.name.toLowerCase() === winner.toLowerCase();
          const col = isWin ? '#22c55e' : '#3b82f6';
          return (
            <div className={'ai-cmp-prod' + (isWin ? ' win' : '')} key={i}>
              <div className="ai-cmp-prod-top">
                <span className="ai-cmp-prod-name">{isWin ? '★ ' : ''}{p.name}</span>
                <span className="ai-cmp-prod-score" style={{ color: col }}>{p.score}</span>
              </div>
              <div className="ai-attr-track" style={{ background: `${col}1f` }}>
                <i style={{ width: `${(p.score / max) * 100}%`, background: `linear-gradient(90deg, ${col}80, ${col})` }} />
              </div>
              {p.bestFor && <div className="ai-cmp-bestfor">{L('Best for', 'Kime uygun')}: <b>{p.bestFor}</b></div>}
              {(p.pros.length > 0 || p.cons.length > 0) && (
                <div className="ai-procon-row">
                  <ProCon icon="✓" title={L('Pros', 'Artılar')} items={p.pros} color="#22c55e" />
                  <ProCon icon="✕" title={L('Cons', 'Eksiler')} items={p.cons} color="#f43f5e" />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {String(data.recommendation || '').trim() && (
        <div className="ai-verdict"><span>💡</span><p>{data.recommendation}</p></div>
      )}
    </div>
  );
}

// ─── FORUM / COMMUNITY SATISFACTION ─────────────────────────────────────────
function ForumView({ data, L }) {
  const sat = toInt(data.satisfaction);
  const praise = arr(data.praise).map(String);
  const complaints = arr(data.complaints).map(String);
  const sources = localizedAiList(data.sources, L);
  return (
    <div className="ai-forum">
      {sat > 0 && (
        <div className="ai-forum-gauge">
          <ScoreRing value={sat} suffix="%" />
          <div className="ai-forum-gauge-t">
            <b>{L('Community satisfaction', 'Topluluk memnuniyeti')}</b>
            <small>{L('Synthesised from public forums & reviews', 'Açık forum ve yorumlardan derlendi')}</small>
          </div>
        </div>
      )}
      {String(data.summary || '').trim() && <p className="ai-forum-summary">{data.summary}</p>}
      {(praise.length > 0 || complaints.length > 0) && (
        <div className="ai-procon-row">
          <ProCon icon="✓" title={L('People love', 'Beğenilenler')} items={praise} color="#22c55e" />
          <ProCon icon="✕" title={L('Common complaints', 'Şikayetler')} items={complaints} color="#f43f5e" />
        </div>
      )}
      {sources.length > 0 && (
        <div className="ai-forum-sources">
          <small>{L('Sources', 'Kaynaklar')}:</small>
          {sources.map((s, i) => <span key={i} className="ai-forum-src">{s}</span>)}
        </div>
      )}
      {String(data.verdict || '').trim() && <div className="ai-verdict"><span>👥</span><p>{data.verdict}</p></div>}
    </div>
  );
}

// ─── FULL REPORTS ──────────────────────────────────────────────────────────
function Paragraphs({ text }) {
  const raw = String(text || '').trim();
  let parts = raw
    .split(/\n{2,}/g)
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    const sentences = raw
      .split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9])/g)
      .map((x) => x.trim())
      .filter(Boolean);
    parts = [];
    for (let i = 0; i < sentences.length; i += 2) {
      parts.push(sentences.slice(i, i + 2).join(' '));
    }
  }
  if (!parts.length) return null;
  return <div className="ai-report-prose">{parts.map((p, i) => <p key={i}>{p}</p>)}</div>;
}

function BulletList({ items, tone = 'neutral' }) {
  const list = arr(items).map(String);
  if (!list.length) return null;
  return (
    <ul className={'ai-report-list ' + tone}>
      {list.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}


function ReportFactors({ factors = [], L }) {
  const list = arr(factors).map((f) => ({
    label: f.label || f.name || '',
    score: toInt(f.score),
    detail: f.detail || '',
  })).filter((f) => f.label)
    .sort((a, b) => b.score - a.score); // skora göre azalan (spec §4A)
  if (!list.length) return null;
  return (
    <div className="ai-report-factors">
      {list.map((f, i) => {
        const color = scoreColor(f.score);
        return <AttrBar key={`${f.label}-${i}`} name={f.label} score={f.score} detail={f.detail} color={color} />;
      })}
      <small className="ai-report-hint">{L('Scores combine quiz answers, profile signals and catalog specs.', 'Puanlar quiz cevapları, profil sinyalleri ve katalog özellikleriyle hesaplandı.')}</small>
    </div>
  );
}


function CommunityBlock({ data = {}, L }) {
  if (!data || typeof data !== 'object') return null;
  const sat = toInt(data.satisfaction);
  const sources = localizedAiList(data.sources, L);
  const notes = arr(data.verificationNotes).map(String);
  return (
    <div className="ai-community-full">
      <div className="ai-community-head">
        {sat > 0 && <ScoreRing value={sat} suffix="%" />}
        <div>
          <b>{L('Internet satisfaction', 'İnternet memnuniyet oranı')}</b>
          <span>{L('Reddit, YouTube, retailer reviews and specialist sources are synthesized together.', 'Reddit, YouTube, alışveriş yorumları ve uzman kaynaklar birlikte özetlenir.')}</span>
        </div>
      </div>
      <Paragraphs text={data.summary} />
      <div className="ai-procon-row">
        <ProCon icon="✓" title={L('Common positives', 'Öne çıkan artılar')} items={arr(data.pros).map(String)} color="#22c55e" />
        <ProCon icon="✕" title={L('Common negatives', 'Öne çıkan eksiler')} items={arr(data.cons).map(String)} color="#f43f5e" />
      </div>
      {sources.length > 0 && (
        <div className="ai-source-row">
          <small>{L('Source types', 'Kaynak türleri')}</small>
          {sources.map((s, i) => <span key={`${s}-${i}`}>{s}</span>)}
        </div>
      )}
      {notes.length > 0 && <BulletList items={notes} tone="notes" />}
    </div>
  );
}

function AlternativeCards({ alternatives = [], L }) {
  const list = arr(alternatives);
  if (!list.length) return null;
  return (
    <div className="ai-alt-cards">
      {list.map((a, i) => {
        const specs = arr(a.keySpecs);
        const content = (
          <article className="ai-alt-card">
            <div className="ai-alt-media">
              {a.imageUrl ? <ProductImg src={a.imageUrl} alt={cleanProductName(a.name || '')} size="thumb" /> : <span>{i + 1}</span>}
            </div>
            <div className="ai-alt-copy">
              <div className="ai-alt-card-top">
                <b>{cleanProductName(a.name)}</b>
                <small>{a.source === 'qor_catalog' ? L('Qor catalog', 'Qor kataloğu') : L('External', 'Harici')}</small>
              </div>
              {a.shortComment && <p>{a.shortComment}</p>}
              {a.difference && <p className="ai-alt-diff">{a.difference}</p>}
              {specs.length > 0 && (
                <div className="ai-alt-specs">
                  {specs.slice(0, 4).map((s, j) => (
                    <span key={j}><small>{s.label}</small><b>{s.value}</b></span>
                  ))}
                </div>
              )}
            </div>
          </article>
        );
        return a.url ? <a key={`${a.name}-${i}`} href={a.url} className="ai-alt-link">{content}</a> : <div key={`${a.name}-${i}`}>{content}</div>;
      })}
    </div>
  );
}


// Spec yerleşimi: 1) hero (animasyonlu skor + karar rozeti + tek cümle özet)
// 2) faktör çubukları 3) donut + dağılım çubuğu yan yana 4) kısa pro/con
// 5) "Detaylı analiz ▾" (varsayılan kapalı) — tüm uzun metinler orada.
// Ürün raporu artık link/abonelik analiziyle AYNI şablonu render eder.
// (Eskiden kendi düzeni vardı: kritik noktalar, quiz etkisi, topluluk temaları
// ve radar grafiği hiç görünmüyordu. Kullanıcı dört akışın da aynı olmasını
// istedi; şema `lib/reportAdapters.js` ile ortak şekle çevriliyor.)
// `export`: /analiz/<slug> sayfasi da AYNI bileseni cizer. Yayinlanan analiz,
// urun sayfasinda calisan analizin BIREBIR AYNISI gorunmek zorunda — ikinci bir
// gorunum yazmak iki tasarimin ayrismasi demek.
export function ProductFullReport({ data, L, lang, hideQuiz = false }) {
  const unified = productReportToUnified(data);
  const alternatives = arr(data.alternatives);
  return (
    <AiReportView
      data={unified}
      L={L}
      lang={lang}
      showHead={false}
      hideQuiz={hideQuiz}
      heroExtra={null}
      altNode={alternatives.length > 0 ? (
        <Sec icon="🔀" title={L('Smart alternatives', 'Akıllı alternatifler')}>
          <AlternativeCards alternatives={alternatives} L={L} />
        </Sec>
      ) : null}
      tailNode={arr(data.product?.reviewedInputs).length > 0 ? (
        <div className="la-verify">
          <strong>🧾 {L('Inputs used', 'Kullanılan girdiler')}</strong>
          <ul>{localizedAiList(data.product.reviewedInputs, L).map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      ) : null}
    />
  );
}

function CompareScoreChartFull({ chart = [], L }) {
  const rows = arr(chart).map((x) => ({ name: cleanProductName(x.name || ''), score: toInt(x.score), reason: x.reason || '' }))
    .filter((x) => x.name)
    .sort((a, b) => b.score - a.score);
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((r) => r.score));
  return (
    <div className="ai-compare-chart">
      {rows.map((r, i) => {
        const color = scoreColor(r.score);
        return (
          <div className="ai-compare-chart-row" key={`${r.name}-${i}`}>
            <span>{r.name}</span>
            <div><BarFill pct={Math.max(4, (r.score / max) * 100)} color={color} delay={i * 90} /></div>
            <b style={{ color }}>{r.score}</b>
            {r.reason && <small>{r.reason}</small>}
          </div>
        );
      })}
      <small className="ai-report-hint">{L('Final scores are personalized to the comparison quiz.', 'Final puanlar karşılaştırma quizine göre kişiselleştirildi.')}</small>
    </div>
  );
}

function FactorMatrix({ rows = [] }) {
  const list = arr(rows).filter((x) => x?.label && Array.isArray(x.scores));
  if (!list.length) return null;
  return (
    <div className="ai-factor-matrix">
      {list.map((row, i) => (
        <div className="ai-factor-matrix-row" key={`${row.label}-${i}`}>
          <b>{row.label}</b>
          <div>
            {row.scores.map((s, j) => {
              const score = toInt(s.score);
              return <span key={`${s.name}-${j}`}><small>{cleanProductName(s.name)}</small><i style={{ width: `${Math.max(4, score)}%`, background: scoreColor(score) }} /><strong>{score}</strong></span>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Compare report — the AI overall comparison is shown first, then one
// clickable evaluation column per product (aligned with the spec-table columns).
// Each column opens a full-screen modal with that product's complete review, so
// the long per-product report stays out of the way until the user asks for it.
function ComparisonOverview({ cmp = {}, L }) {
  const hasContent = cmp.winner || arr(cmp.chart).length || arr(cmp.factorMatrix).length
    || arr(cmp.decisiveDifferences).length || String(cmp.headToHead || '').trim()
    || String(cmp.recommendation || '').trim();
  if (!hasContent) return null;
  return (
    <section className="ai-report-section ai-cmp-overview">
      <div className="ai-report-eyebrow">{L('AI overall comparison', 'AI genel karşılaştırma')}</div>
      <h4>{L('Which one wins for you', 'Senin için hangisi kazanıyor')}</h4>
      {cmp.winner && (
        <div className="ai-cmp-winner">
          <span>★</span>
          <div><small>{L('Recommended pick', 'Önerilen seçim')}</small><b>{cleanProductName(cmp.winner)}</b></div>
          {/* Sayı ETİKETSİZ duruyordu: kullanıcı ürün adının yanındaki "90"ın
              ne olduğunu anlamıyordu ("ne alaka?"). Bu, sayfadaki "Qor AI
              Skoru" (teknik puan) ile de karışıyordu — bunlar FARKLI şeyler:
              teknik puan üründen gelir, bu ise quiz cevaplarına göre hesaplanan
              SANA UYGUNLUK puanıdır. Artık adı yazıyor. */}
          {toInt(cmp.winnerScore) > 0 && (
            <div className="ai-cmp-winner-score">
              <strong>{toInt(cmp.winnerScore)}</strong>
              <small>{L('fit for you', 'sana uygunluk')}</small>
            </div>
          )}
        </div>
      )}
      <CompareScoreChartFull chart={cmp.chart} L={L} />
      <FactorMatrix rows={cmp.factorMatrix} />
      {(arr(cmp.decisiveDifferences).length > 0 || String(cmp.headToHead || '').trim() || String(cmp.recommendation || '').trim()) && (
        <Collapsible label={`📖 ${L('Detailed analysis', 'Detaylı analiz')}`}>
          <BulletList items={cmp.decisiveDifferences} tone="notes" />
          <Paragraphs text={cmp.headToHead} />
          {String(cmp.recommendation || '').trim() && (
            <div className="ai-verdict"><span>✓</span><div><Paragraphs text={cmp.recommendation} /></div></div>
          )}
        </Collapsible>
      )}
    </section>
  );
}

// One product's complete review — the SAME template the product-detail, link
// and subscription reports use, rendered inside the compare detail modal.
function CompareProductDetail({ data = {}, L, lang, hideQuiz = false }) {
  return <AiReportView data={compareProductToUnified(data)} L={L} lang={lang} showHead={false} hideQuiz={hideQuiz} />;
}

// Full-screen modal — portaled to <body> so a transformed/filtered ancestor
// can't collapse the fixed overlay (a known web-app pitfall). Holds one
// product's complete review; Esc / backdrop / ✕ all close it.

// Karşılaştırma sonucu — ABONELİK ANALİZİYLE AYNI DÜZEN.
//
// Eski hâli: kazanan bandı, çirkin bir faktör matrisi, mini donut şeridi ve
// "her ürünün detaylı incelemesini aç" tıklama ızgarası. Yani analiz bittiği
// anda karşılayan ekran tabloydu; asıl rapor ancak bir ürüne TIKLAYINCA
// modalde açılıyordu. Kullanıcı "analiz bittikten sonra hemen gelen ekran çok
// çirkin, abonelik analizi gibi olsun, tıklamak gerekmesin" dedi.
//
// Artık: kazanan hükmü + tek bir hizalı faktör karşılaştırması (HeatMatrix),
// ardından HER ÜRÜNÜN tam raporu kart içinde ALT ALTA — abonelikteki
// `subs-svc-grid` düzeninin birebir karşılığı. Modal ve tıklama kalktı.
function CompareFullReport({ data, L, lang, products = [], hideQuiz = false }) {
  const aiProducts = arr(data.products);
  const cmp = data.comparison || {};

  const norm = (s) => cleanProductName(String(s || '')).toLowerCase().replace(/\s+/g, ' ').trim();
  // Kolonları spec tablosundaki sırayla eşle: gerçek ürün listesi varsa onu
  // gez ve AI girdisini ADA göre bul (yoksa indekse düş).
  const columns = (products.length ? products : aiProducts).map((item, i) => {
    if (products.length) {
      const name = displayProductName(item, lang);
      const ai = aiProducts.find((ap) => norm(ap.name) === norm(name)) || aiProducts[i] || {};
      return { ai, image: item.imageUrl || ai.imageUrl || '', name, key: item.id || `${name}-${i}` };
    }
    const name = cleanProductName(item.name || '');
    return { ai: item, image: item.imageUrl || '', name, key: `${name}-${i}` };
  }).filter((c) => c.name || (c.ai && Object.keys(c.ai).length));

  const winnerNorm = norm(cmp.winner || '');
  // HeatMatrix her ürünün kendi faktörlerinden beslenir; AI ayrıca bir
  // factorMatrix döndürdüyse onu da aynı şekle çeviririz (tek çizim yolu).
  const heatProducts = columns.map((c) => ({
    name: c.name,
    factors: arr(c.ai?.factors).map((f) => ({ label: f?.label, score: toInt(f?.score) })),
  })).filter((p) => p.factors.length > 0);

  return (
    <div className="ai-report ai-report-compare">
      <ComparisonOverview cmp={cmp} L={L} />

      {heatProducts.length >= 2 && <HeatMatrix products={heatProducts} L={L} />}

      {columns.length > 0 && (
        <div className="ai-cmp-reports">
          {columns.map((c, i) => {
            const isWin = winnerNorm && norm(c.name) === winnerNorm;
            return (
              <section className={'ai-cmp-report' + (isWin ? ' winner' : '')} key={c.key}>
                <header className="ai-cmp-report-head">
                  {isWin && <span className="ai-cmp-report-win">★ {L('AI pick', 'AI seçimi')}</span>}
                  <span className="ai-cmp-report-no">{i + 1}</span>
                  {c.image ? <ProductImg src={c.image} alt={c.name} size="thumb" /> : null}
                  <div className="ai-cmp-report-id">
                    <small>{L('Full AI review', 'Detaylı AI incelemesi')}</small>
                    <b>{c.name}</b>
                  </div>
                </header>
                <CompareProductDetail data={c.ai} L={L} lang={lang} hideQuiz={hideQuiz} />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────
// kind: 'deep' | 'alts' | 'advisor' | 'pred'. Returns null when JSON is unusable
// so the caller can fall back to plain text.
export default function AiAnalysisView({ kind, raw, data: dataProp, lang, products, hideQuiz = false }) {
  const data = dataProp && typeof dataProp === 'object' ? dataProp : parseAiJson(raw);
  if (!data || typeof data !== 'object') return null;
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const L = (en, tr) => (code === 'tr' ? tr : en);
  if (kind === 'productFull' || data.type === 'product_full_report') return <ProductFullReport data={data} L={L} lang={lang} />;
  if (kind === 'compareFull' || data.type === 'compare_full_report') return <CompareFullReport data={data} L={L} lang={lang} products={products} hideQuiz={hideQuiz} />;
  if (kind === 'deep') return <DeepView data={data} L={L} />;
  if (kind === 'alts') return <AltView data={data} L={L} />;
  if (kind === 'advisor') return <AdvisorView data={data} L={L} />;
  if (kind === 'pred') return <PredictionView data={data} L={L} />;
  if (kind === 'compare') return <CompareView data={data} L={L} />;
  if (kind === 'forum') return <ForumView data={data} L={L} />;
  return null;
}
