// ─────────────────────────────────────────────────────────────────────────
//  AI analysis — web port of the mobile app's premium AI cards.
//  Same prompts (structured JSON) + same visuals: animated score ring,
//  strength/weakness bars, pros/cons cards, verdict, smart alternatives,
//  advisor and price prediction. Shared by the product detail + compare pages.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './AiAnalysis.css';
import ProductImg from './ProductImg.jsx';
import Gauge from './Gauge.jsx';
import { productPath } from '../lib/routes';
import { formatPrice, formatPriceAmount, priceForCountry } from '../lib/format';
import { getProduct, getProductBySlug } from '../lib/typesense';
import { useGeoCountry } from '../lib/geo';
import { displayProductName, cleanProductName } from '../lib/productNames';
import {
  BarFill,
  DistributionBar,
  DecisiveDifferences,
  HeatMatrix,
  ProseClause,
  ProseLine,
  RichProse,
  SentimentDonut,
  factorDistribution,
  sentencesOf,
  useCountUp,
  useDrawIn,
  usePrefersReducedMotion,
} from './AiCharts.jsx';
// Ürün ve karşılaştırma raporları da link/abonelik ile AYNI şablonu kullanır.
import AiReportView, { Sec, bullets } from './AiReportView.jsx';
import { compareProductToUnified, productReportToUnified } from '../lib/reportAdapters';
// Kalibrasyon TEK KAYNAK (admin/js/qor_ai_prompts.js). Karsilastirma seridi
// ile urun kartinin AYNI sayiyi gostermesinin garantisi ayni fonksiyon.
import { calibratedScore } from '../lib/aiPrompts.js';


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
  withFreshnessRetryInstruction, scrubSiblingResearch, crossModelLeaks,
  withModelIdentityRetryInstruction,
} from '../lib/aiPrompts.js';
// `parseAiJson` YUKARIDAKI re-export bloğunda da geçiyor ama oradan gelmiyor:
// `export { x } from 'y'` yerel bir bağ OLUŞTURMAZ, adı yalnızca dışarı taşır.
// Bu yüzden ayrıca burada import ediliyor — eksikken `raw` metinle çağrılan her
// rapor `ReferenceError: parseAiJson is not defined` ile sayfayı boşaltıyordu.
import { arr, firstSentences, parseAiJson } from '../lib/aiPrompts.js';

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
// Urun adi eslestirme — AI ayni urunu her cagride birebir ayni yazmiyor
// (kod, bosluk, buyuk/kucuk harf). Karsilastirmanin iki yerinde birden lazim
// (hukum seridi ve karar satirlari), o yuzden modul seviyesinde.
const norm = (s) => cleanProductName(String(s || '')).toLowerCase().replace(/\s+/g, ' ').trim();

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
// Rapor nesri TEK YOLDAN çizilir: `RichProse` (konu cümlesi vurgusu, mono
// sayılar, kademeli açılma). Burada eskiden kendi paragraf bölücüsü vardı ve
// karşılaştırma raporundaki metinler ortak şablondakilerden FARKLI
// görünüyordu — kullanıcının "analiz sistemi standart olmalı" dediği yer.
function Paragraphs({ text, L = (en) => en, clamp = 4 }) {
  return <RichProse text={text} L={L} clamp={clamp} />;
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
      <Paragraphs text={data.summary} L={L} />
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

// Alternatif kartinin fiyat satiri. Once secili ulkenin fiyati, yoksa USD
// yedek; ikisi de yoksa NULL (satir cizilmez — sifir yazmak yaniltici olur).
function altPrice(a, geoCountry, lang, canli) {
  const kaynak = canli || a;
  const pc = priceForCountry(kaynak, geoCountry);
  if (pc && pc.price > 0) {
    return <span className="ai-alt-price">{formatPriceAmount(pc.price, pc.currency, lang)}</span>;
  }
  if (Number(kaynak?.lowestPriceUSD) > 0) {
    return <span className="ai-alt-price">{formatPrice(kaynak.lowestPriceUSD)}</span>;
  }
  return null;
}

/* KATALOG ALTERNATIFLERININ FIYATI. Yeni uretilen raporlar fiyati kaydin
   icinde tasiyor (qor_ai_prompts.js -> resolveCatalogAlternatives), ama
   YAYINLANMIS eski kayitlarda yalnizca `productId` var. Onlar icin fiyat
   okuma aninda cekilir: en fazla 3 id, Typesense istemcisi zaten onbellekli. */
function useAlternativePrices(list) {
  const [map, setMap] = useState({});
  const ids = arr(list).map((a) => String(a?.productId || '')).filter(Boolean).join(',');
  useEffect(() => {
    if (!ids) { setMap({}); return undefined; }
    let live = true;
    const eksik = ids.split(',').filter((id) => !arr(list).some(
      (a) => String(a.productId) === id && a.prices && typeof a.prices === 'object',
    ));
    if (!eksik.length) return undefined;
    Promise.all(eksik.slice(0, 4).map((id) => getProduct(id).catch(() => null)))
      .then((rows) => {
        if (!live) return;
        const next = {};
        rows.forEach((r) => { if (r && r.id) next[r.id] = r; });
        setMap(next);
      });
    return () => { live = false; };
  }, [ids]);
  return map;
}

function AlternativeCards({ alternatives = [], L, lang = 'en' }) {
  const geoCountry = useGeoCountry();
  const list = arr(alternatives);
  const canliFiyat = useAlternativePrices(list);
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
              {/* FIYAT. Katalogda eslesen alternatif fiyatsiz ciziliyordu;
                  okuyucu "bu alternatif ne kadar" icin urun sayfasina
                  gitmek zorundaydi. PB'de fiyat YOKSA satir hic cizilmez —
                  sifir ya da "-" yazmak yaniltici olurdu. */}
              {altPrice(a, geoCountry, lang, canliFiyat[String(a.productId || '')])}
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
        // KATALOG URUNU ROTA ILE ACILIR. `<a href>` tam sayfa yenilemesi
        // yapiyordu ve BrowserRouter `basename` ile kurulu oldugu icin
        // Turkce sayfadaki bir alternatif Ingilizce agaca dusuyordu
        // (`/product/...` != `/tr/product/...`). Harici adres (http...)
        // eskisi gibi <a> ile acilir.
        const key = `${a.name}-${i}`;
        if (a.url && a.url.startsWith('/')) {
          return <Link key={key} to={a.url} className="ai-alt-link">{content}</Link>;
        }
        return a.url ? <a key={key} href={a.url} className="ai-alt-link" target="_blank" rel="noreferrer">{content}</a> : <div key={key}>{content}</div>;
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
export function ProductFullReport({ data, L, lang, hideQuiz = false, techScore = 0, priceInfo = null }) {
  // `lang` ve `techScore` KALIBRASYONA gidiyor: gosterilen puan
  // 0.60 x katalog teknik puani + 0.40 x ham uyum puani, segment etiketi ve
  // gerekce metni de dile gore yaziliyor (bkz. reportAdapters).
  // `techScore` propu YAYINLANMIS ESKI KAYITLAR icin sart: onlarin rapor
  // JSON'unda bu alan yok, deger kaydin kendisinde duruyor.
  const unified = productReportToUnified(data, { lang, techScore: techScore || data?.techScore });
  const alternatives = arr(data.alternatives);
  return (
    <AiReportView
      data={unified}
      L={L}
      lang={lang}
      showHead={false}
      hideQuiz={hideQuiz}
      priceInfo={priceInfo}
      heroExtra={null}
      altNode={alternatives.length > 0 ? (
        <Sec icon="🔀" title={L('Smart alternatives', 'Akıllı alternatifler')}>
          <AlternativeCards alternatives={alternatives} L={L} lang={lang} />
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

// ── Compare report — the AI overall comparison is shown first, then one
// clickable evaluation column per product (aligned with the spec-table columns).
// Each column opens a full-screen modal with that product's complete review, so
// the long per-product report stays out of the way until the user asks for it.
/* ── KARAR TAHTASI: TEK ÜRÜN, TEK KART ─────────────────────────────────
   Bir ürünün bilgisi eskiden üç ayrı blokta dağılıyordu (puan şeridi ·
   karşı karşıya · hangisini almalı); artık her ürün KENDİ kartında ve kart
   içinde her şey alt alta.

   2026-09-01 — İKİNCİ GEÇİŞ. Kart doğru bilgiyi taşıyordu ama okunmuyordu:
   artı/eksi maddeleri ortalama 105 karakterlik TEK cümleler hâlinde alt alta
   diziliyor, hepsi aynı gri ağırlıkta çıkıyordu ("çok uzun cümleler var,
   ayırt edici kısımlar yok"). Üç şey değişti:
     1. Her madde `ProseClause` ile İKİYE ayrılıyor — ölçüyü söyleyen ilk
        parça KOYU, hükmü söyleyen ikinci parça yumuşak. Metin bozulmuyor,
        yalnızca ağırlığı değişiyor.
     2. Artılar ve eksiler yan yana İKİ SÜTUN (dar ekranda alt alta): göz
        "iyi taraf / kötü taraf" ayrımını okumadan görüyor.
     3. Puan artık halka (sitenin imza öğesi) + GÖRELİ fark çubuğu. Çubuk
        0-100'de değil, karşılaştırmanın kendi tabanından başlıyor; 95/94/92
        0-100'de gözle aynı uzunluktaydı, yani çubuk hiçbir şey söylemiyordu.

   RENK SÖZLÜĞÜ SAYFA BOYUNCA TEK:
     yeşil = iyi · kırmızı = kötü · mavi = ÖLÇÜ (sayılar, bkz. .aic-num)
   Ürünü renk değil KARTIN KENDİSİ söyler. */
function CompareCard({ lane, L, names = null, enUcuzKey = '', lider = 0, taban = 0 }) {
  // Çubuk GÖRÜNÜNCE dolar; kart sayfanın ortasında ve mount'ta biten bir
  // animasyonu kimse görmüyordu (bkz. AiCharts → useDrawIn).
  const [kap, drawn, reduced] = useDrawIn();
  const fark = lider > 0 && lane.score > 0 ? lane.score - lider : 0;
  const pay = Math.max(1, lider - taban);
  const oran = lane.score > 0 ? Math.max(8, Math.min(100, ((lane.score - taban) / pay) * 100)) : 0;
  const renk = scoreColor(lane.score);
  const ucuz = lane.key === enUcuzKey;
  return (
    <article className={`ai-cmp-card${lane.win ? ' win' : ''}`} ref={kap}>
      <header className="ai-cmp-card-head">
        <span className="ai-cmp-card-no">{lane.win ? '★' : lane.rank}</span>
        {lane.image ? <ProductImg src={lane.image} alt={lane.name} size="thumb" /> : null}
        <div className="ai-cmp-card-id">
          {lane.win && <small>{L('AI pick', 'AI seçimi')}</small>}
          {/* FİYAT ADIN YANINDA — ayrı bir kutuda değil. Aynı kural raporun
              künyesinde de geçerli (.ai-cmp-report-price). */}
          <b>
            {lane.name}
            {lane.price ? (
              <span className="ai-cmp-card-price">
                {formatPriceAmount(lane.price.price, lane.price.currency, lane.lang)}
                {ucuz && <i>{L('cheapest', 'en ucuz')}</i>}
              </span>
            ) : null}
          </b>
        </div>
        {lane.score > 0 && (
          <div className="ai-cmp-card-score">
            <Gauge value={lane.score} size={58} stroke={6} color={renk} fontSize={19} />
            <small>{L('fit for you', 'sana uygunluk')}</small>
          </div>
        )}
      </header>

      {/* GÖRELİ FARK ÇUBUĞU — bu bölümün imza öğesi. Ölçek karşılaştırmanın
          kendi tabanından başlar; gerçek sayı halkada, fark burada yazıyor. */}
      {lane.score > 0 && lider > 0 && (
        <div className="ai-cmp-card-gap">
          <span className="ai-cmp-card-gap-tag">{L('vs leader', 'Lidere göre')}</span>
          <div className="ai-cmp-card-track">
            <i style={{
              width: `${drawn ? oran : 0}%`,
              background: renk,
              transition: reduced ? 'none' : `width .8s cubic-bezier(.22,.61,.36,1) ${Math.min(lane.rank * 90, 400)}ms`,
            }} />
          </div>
          <span className={'ai-cmp-card-delta' + (fark === 0 ? ' lead' : '')}>
            {fark === 0 ? `★ ${L('leader', 'lider')}` : fark}
          </span>
        </div>
      )}

      {lane.headline && (
        <p className="ai-cmp-card-lead">
          <ProseLine text={lane.headline} names={names} keyPrefix={`hl-${lane.key}`} />
        </p>
      )}

      {(lane.pros.length > 0 || lane.cons.length > 0) && (
        <div className="ai-cmp-card-split">
          {lane.pros.length > 0 && (
            <div className="ai-cmp-card-side for">
              <span className="ai-cmp-card-tag">✓ {L('Strengths', 'Artıları')}</span>
              <ul>{lane.pros.map((x, i) => (
                <li key={`p${i}`}>
                  <ProseClause text={x} names={names} keyPrefix={`pp-${lane.key}-${i}`} />
                </li>
              ))}</ul>
            </div>
          )}
          {lane.cons.length > 0 && (
            <div className="ai-cmp-card-side against">
              <span className="ai-cmp-card-tag">✕ {L('Weaknesses', 'Eksileri')}</span>
              <ul>{lane.cons.map((x, i) => (
                <li key={`c${i}`}>
                  <ProseClause text={x} names={names} keyPrefix={`cc-${lane.key}-${i}`} />
                </li>
              ))}</ul>
            </div>
          )}
        </div>
      )}

      {(lane.bestFor || lane.notFor) && (
        <div className="ai-cmp-card-who">
          {/* UZUN METİN CÜMLELERE BÖLÜNÜR. "Kime uygun" alanı iki-üç cümlelik
              tek paragraftı; her cümle kendi satırında okunur ve bölme noktası
              cümle sonu olduğu için metin bozulmuyor (bkz. sentencesOf). */}
          {lane.bestFor && (
            <div className="ai-cmp-who-row for">
              <span className="ai-cmp-who-tag">{L('Right for you if', 'Sana uygun')}</span>
              <ul>{sentencesOf(lane.bestFor).map((c, i) => (
                <li key={`bf${i}`}><ProseClause text={c} names={names} tone={false} keyPrefix={`bf-${lane.key}-${i}`} /></li>
              ))}</ul>
            </div>
          )}
          {lane.notFor && (
            <div className="ai-cmp-who-row against">
              <span className="ai-cmp-who-tag">{L('Not for you if', 'Sana uygun değil')}</span>
              <ul>{sentencesOf(lane.notFor).map((c, i) => (
                <li key={`nf${i}`}><ProseClause text={c} names={names} tone={false} keyPrefix={`nf-${lane.key}-${i}`} /></li>
              ))}</ul>
            </div>
          )}
        </div>
      )}

      {lane.anchor && (
        <a className="ai-cmp-card-more" href={`#${lane.anchor}`}>
          {L('Full review', 'Tam incelemesi')}
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
            strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </a>
      )}
    </article>
  );
}

function ComparisonOverview({ cmp = {}, L, names = null, lanes = [] }) {
  const hasContent = cmp.winner || lanes.length || arr(cmp.decisiveDifferences).length
    || String(cmp.recommendation || '').trim();
  if (!hasContent) return null;

  // EN UCUZ yalnizca AYNI para biriminde anlamlidir; kur cevirisi yapmiyoruz
  // (yapsak da gosterilen rakamla tutmazdi).
  const fiyatli = lanes.filter((l) => l.price && l.price.price > 0);
  const tekParaBirimi = new Set(fiyatli.map((l) => l.price.currency)).size === 1;
  const enUcuzKey = tekParaBirimi && fiyatli.length > 1
    ? fiyatli.reduce((a, b) => (a.price.price <= b.price.price ? a : b)).key
    : '';
  const puanlar = lanes.map((l) => l.score || 0).filter((v) => v > 0);
  const lider = Math.max(0, ...puanlar);
  const enAz = puanlar.length ? Math.min(...puanlar) : 0;
  // Çubuk tabanı: en düşük puanın biraz altı. Sıfırdan başlayan ölçek bu
  // bantta (95/94/92) hiçbir fark göstermiyordu.
  const taban = Math.max(0, Math.min(lider - 1, enAz - 3));
  const ikinci = puanlar.length > 1 ? [...puanlar].sort((a, b) => b - a)[1] : 0;
  const kazanan = lanes.find((l) => l.win) || null;

  return (
    <section className="ai-report-section ai-cmp-overview">
      <div className="ai-report-eyebrow">{L('AI overall comparison', 'AI genel karşılaştırma')}</div>
      <h4>{L('Which one wins for you', 'Senin için hangisi kazanıyor')}</h4>

      {/* SONUÇ ŞERİDİ — kartlara inmeden önce tek satırlık cevap: kaç ürün,
          hangisi önde, ikinciyle farkı ne. Kartlarla ÇAKIŞMAZ; kart "bu cihaz
          nasıl", şerit "yarış nasıl bitti" sorusunu yanıtlıyor. */}
      {lanes.length > 1 && (
        <div className="ai-cmp-sum">
          <span className="ai-cmp-sum-pill">
            <b>{lanes.length}</b> {L('products compared', 'ürün karşılaştırıldı')}
          </span>
          {kazanan && (
            <span className="ai-cmp-sum-pill win" title={kazanan.name}>
              ★<span className="ai-cmp-sum-name">{kazanan.name}</span>
            </span>
          )}
          {lider > 0 && ikinci > 0 && (
            <span className="ai-cmp-sum-pill">
              {L('gap to runner-up', 'ikinciyle fark')}
              <b>{lider - ikinci === 0 ? L('tie', 'berabere') : `+${lider - ikinci}`}</b>
            </span>
          )}
        </div>
      )}

      {/* KAZANAN BANDI YALNIZCA KART YILDIZLANAMADIGINDA. Band ile birinci
          kart AYNI seyi soyluyordu: ayni ad, ayni 95, ayni "sana uygunluk"
          etiketi — ust uste iki kez. Kart zaten yildiz + yesil kenar +
          "AI SECIMI" tasiyor. Band yalnizca hukumdeki ad hicbir urunle
          eslesmediginde (ad sapmasi) devreye girer; o zaman kartlarda yildiz
          olmaz ve kazanan bilgisi kaybolurdu. */}
      {cmp.winner && !lanes.some((l) => l.win) && (
        <div className="ai-cmp-winner">
          <span>★</span>
          <div><small>{L('Recommended pick', 'Önerilen seçim')}</small><b>{cleanProductName(cmp.winner)}</b></div>
          {lider > 0 && (
            <div className="ai-cmp-winner-score">
              <strong>{lider}</strong>
              <small>{L('fit for you', 'sana uygunluk')}</small>
            </div>
          )}
        </div>
      )}

      {lanes.length > 0 && (
        <div className="ai-cmp-cards">
          {lanes.map((l) => (
            <CompareCard key={l.key} lane={l} L={L} names={names}
              enUcuzKey={enUcuzKey} lider={lider} taban={taban} />
          ))}
        </div>
      )}

      {/* KARARI BELIRLEYEN FARKLAR karta girmez: bunlar tek bir urune ait
          degil, urunler ARASINDAKI olculer. Kartlar "bu cihaz nasil",
          bu blok "hangisi neyde onde" sorusunu yanitliyor. */}
      <DecisiveDifferences items={cmp.decisiveDifferences} names={names} L={L} />

      {String(cmp.recommendation || '').trim() && (
        /* Tek uzun metin, EN ALTTA ve kisaltilmis. Karar yukarida kartlarda
           verildi; bu metin onu aciklar, geciktirmemeli. Katlama RichProse'un
           kendi mekanizmasi — gizli paragraf DOM'da kalir (crawler gorur),
           `Collapsible` olsaydi hic basilmazdi. */
        <div className="ai-cmp-fold">
          <div className="ai-cmp-why">
            <div className="ai-cmp-why-head">
              <span aria-hidden="true">✓</span>
              <div>
                <small>{L('Why — the full reasoning', 'Kararın gerekçesi')}</small>
                {kazanan ? <b>{kazanan.name}</b> : cmp.winner ? <b>{cleanProductName(cmp.winner)}</b> : null}
              </div>
            </div>
            <RichProse text={cmp.recommendation} L={L}
              clamp={lanes.length ? 2 : 0} names={names} />
          </div>
        </div>
      )}
    </section>
  );
}

// One product's complete review — the SAME template the product-detail, link
// and subscription reports use, rendered inside the compare detail modal.
function CompareProductDetail({ data = {}, L, lang, hideQuiz = false, priceInfo = null, researched = false }) {
  // `hidePriceTile`: fiyat karşılaştırmada ürün ADININ YANINDA duruyor
  // (.ai-cmp-report-price); aynı sayıyı bir de "🏷 Fiyat" kutucuğunda
  // tekrarlamak kullanıcının kaldırılmasını istediği ikinci gösterimdi.
  // Tekli analizde kutucuk YERİNDE KALIR — orası fiyatın tek yeri.
  // `researched` KAYDIN KOKUNDE duruyor (admin/js/analyses.js), urun
  // girdisinde degil. Gecirilmezse "Kanit gucu" kutusu arastirma kosmus bir
  // raporda bile "model bilgisi" yaziyordu — okuyucuya YANLIS bilgi.
  return <AiReportView data={compareProductToUnified(data, { researched })} L={L} lang={lang}
    showHead={false} hideQuiz={hideQuiz} priceInfo={priceInfo} hidePriceTile />;
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
// Capa kimligi: id/ad degisken oldugu icin SIRA numarasi da girer, boylece
// ayni adli iki sutun ayni capayi paylasmaz.
const cmpAnchor = (key, i) => `cmp-report-${i + 1}-${String(key).replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)}`;

function CompareFullReport({ data, L, lang, products = [], hideQuiz = false, priceInfo = null }) {
  const geoCountry = useGeoCountry();
  const aiProducts = arr(data.products);
  const cmp = data.comparison || {};

  // Kolonları spec tablosundaki sırayla eşle: gerçek ürün listesi varsa onu
  // gez ve AI girdisini ADA göre bul (yoksa indekse düş).
  const columns = (products.length ? products : aiProducts).map((item, i) => {
    if (products.length) {
      const name = displayProductName(item, lang);
      const ai = aiProducts.find((ap) => norm(ap.name) === norm(name)) || aiProducts[i] || {};
      return { ai, image: item.imageUrl || ai.imageUrl || '', name, key: item.id || `${name}-${i}`, product: item };
    }
    const name = cleanProductName(item.name || '');
    return { ai: item, image: item.imageUrl || '', name, key: `${name}-${i}` };
  }).filter((c) => c.name || (c.ai && Object.keys(c.ai).length));

  // ── FIYAT ─────────────────────────────────────────────────────────────
  // Karsilastirma kaydi fiyat TASIMIYOR. Canli karsilastirma akisinda gercek
  // urun nesnesi elde (`c.product`), ama YAYINLANMIS analizde yalnizca AI
  // ciktisi var — ve orada tek katalog baglantisi `url: /product/<slug>`.
  // Slug BENZERSIZ (107.449 urun, 0 cakisma; bkz. lib/typesense.js), yani
  // eslesme kesin — ada gore aramak yanlis urun getirebilirdi.
  // Istek sayisi URUN SAYISI kadar (2-4), katalog buyuklugunden bagimsiz.
  const slugOf = (c) => {
    const m = String(c.ai?.url || '').match(/\/product\/([^/?#]+)/);
    return m ? m[1] : '';
  };
  const [fiyatlar, setFiyatlar] = useState({});
  const slugAnahtari = columns.map((c) => (c.product ? '' : slugOf(c))).join('|');
  useEffect(() => {
    let live = true;
    if (!geoCountry) return undefined;
    const hedefler = columns.filter((c) => !c.product && slugOf(c)).map((c) => [c.key, slugOf(c)]);
    if (!hedefler.length) return undefined;
    Promise.all(hedefler.map(([key, slug]) => getProductBySlug(slug)
      .then((prod) => [key, prod]).catch(() => [key, null])))
      .then((ciftler) => {
        if (!live) return;
        const out = {};
        for (const [key, prod] of ciftler) {
          if (!prod) continue;
          const pc = priceForCountry(prod, geoCountry);
          if (pc && pc.price > 0) out[key] = pc;
          else if (Number(prod.lowestPriceUSD) > 0) out[key] = { price: Number(prod.lowestPriceUSD), currency: 'USD' };
        }
        setFiyatlar(out);
      });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugAnahtari, geoCountry]);

  const winnerNorm = norm(cmp.winner || '');
  // TEK URUN, TEK PUAN. Kazanan seridindeki sayilar HUKUM cagrisinin ham
  // puanlariydi (92/88/88), urunun kendi kartindaki sayi ise kalibre edilmis
  // puan (95/94/...). Ayni urun icin sayfada IKI FARKLI puan goruunuyordu ve
  // okuyucu bunu "puanlar tutarsiz" diye okuyor. Serit artik urunlerin KENDI
  // kalibre puanindan turuyor (bkz. reportAdapters -> calibratedScore); hukum
  // cagrisindan yalnizca kisa GEREKCE metni aliniyor.
  const chart = columns.map((c) => {
    const ham = toInt(c.ai?.matchScore);
    const tech = toInt(c.ai?.techScore);
    const puan = calibratedScore(ham, tech) ?? ham;
    const satir = arr(cmp.chart).find((x) => norm(x?.name) === norm(c.name));
    return { name: c.name, score: puan, reason: satir?.reason || c.ai?.headline || '' };
  }).filter((x) => x.score > 0);
  // HeatMatrix her ürünün kendi faktörlerinden beslenir; AI ayrıca bir
  // factorMatrix döndürdüyse onu da aynı şekle çeviririz (tek çizim yolu).
  const heatProducts = columns.map((c) => ({
    name: c.name,
    factors: arr(c.ai?.factors)
      .filter((f) => f && f.label && Number.isFinite(Number(f.score)))
      .map((f) => ({ label: f.label, score: toInt(f.score) })),
  }));

  // ── URUN SERITLERI ────────────────────────────────────────────────────
  // Hukum bloklarinin tamami bu diziden besleniyor: her olgu, sahibi olan
  // urunun seridinde durur. Kaynak `products[]` girdisi — her urun icin AYRI
  // bir AI cagrisinda uretildi, yani atif YAPI GEREGI dogru; metinden urun
  // adi cikarmaya calisan hicbir tahmin yok (o yol bir kez denendi ve yanlis
  // atif uretti, bkz. AiCharts -> HeadToHead).
  const lanes = columns.map((c, i) => {
    const satir = chart.find((x) => norm(x.name) === norm(c.name)) || {};
    const puan = satir.score || 0;
    return {
      key: c.key,
      name: c.name,
      norm: norm(c.name),
      lang,
      image: c.image || '',
      rank: i + 1,
      score: puan,
      // Tek cumlelik hukum: once hukum cagrisinin kisa gerekcesi, yoksa
      // urunun kendi basligi. Kartin ustunde durur, kart neyi anlatiyorsa
      // onun ozeti.
      headline: localizeAiText(satir.reason || c.ai?.headline || '', L),
      price: (c.product ? priceForCountry(c.product, geoCountry) : fiyatlar[c.key]) || null,
      win: Boolean(winnerNorm && norm(c.name) === winnerNorm),
      // Arti/eksi maddeleri iki sekilde gelebiliyor: duz metin ya da
      // {title, detail}. `bullets()` ikisini de tek sekle indirger — String()
      // ile gecilseydi nesne maddesi ekranda "[object Object]" olurdu.
      // UC ARTI, IKI EKSI. Kart tek bakista okunmali; urunun TAM listesi
      // zaten asagida kendi raporunda duruyor (ProConList).
      pros: bullets(c.ai?.pros).slice(0, 3)
        .map((x) => localizeAiText([x.title, x.detail].filter(Boolean).join(' — '), L)),
      cons: bullets(c.ai?.cons).slice(0, 2)
        .map((x) => localizeAiText([x.title, x.detail].filter(Boolean).join(' — '), L)),
      bestFor: localizeAiText(c.ai?.bestFor, L),
      notFor: localizeAiText(c.ai?.notFor, L),
      // Karar satirindan urunun tam raporuna capa — rapor AYNI sayfada, altta.
      anchor: cmpAnchor(c.key, i),
    };
  });

  return (
    <div className="ai-report ai-report-compare">
      <ComparisonOverview cmp={cmp} L={L}
        names={columns.map((c) => c.name).filter(Boolean)} lanes={lanes} />

      {heatProducts.length >= 2 && (
        <HeatMatrix products={heatProducts} matrix={cmp.factorMatrix} L={L} />
      )}

      {columns.length > 0 && (
        <div className="ai-cmp-reports">
          {/* "Şuraya atla" şeridi KALDIRILDI (2026-09-01, kullanıcı isteği).
              Kartlardaki "Tam incelemesi" bağlantısı aynı çapaya gidiyor;
              şerit ikinci bir gezinme katmanıydı. `cmpAnchor` duruyor —
              çapaların kendisi hâlâ gerekli. */}
          {columns.map((c, i) => {
            const isWin = winnerNorm && norm(c.name) === winnerNorm;
            return (
              <section id={cmpAnchor(c.key, i)}
                className={'ai-cmp-report' + (isWin ? ' winner' : '')} key={c.key}>
                <header className="ai-cmp-report-head">
                  {isWin && <span className="ai-cmp-report-win">★ {L('AI pick', 'AI seçimi')}</span>}
                  <span className="ai-cmp-report-no">{i + 1}</span>
                  {c.image ? <ProductImg src={c.image} alt={c.name} size="thumb" /> : null}
                  <div className="ai-cmp-report-id">
                    <small>{L('Full AI review', 'Detaylı AI incelemesi')}</small>
                    {/* FİYAT ADIN YANINDA, AYRI KUTUDA DEĞİL. Kullanıcı
                        isteği (2026-09-01): karşılaştırmada fiyat ürün adının
                        yanında yazılmalı; aşağıdaki "🏷 Fiyat" kutucuğu
                        kaldırıldı (bkz. hidePriceTile). Adla aynı satırda
                        başlar, sığmazsa alta sarar. */}
                    <b>
                      {c.name}
                      {(() => {
                        const f = (c.product ? priceForCountry(c.product, geoCountry) : fiyatlar[c.key]) || null;
                        return f && f.price > 0 ? (
                          <span className="ai-cmp-report-price">
                            {formatPriceAmount(f.price, f.currency, lang)}
                          </span>
                        ) : null;
                      })()}
                    </b>
                  </div>
                </header>
                {/* FIYAT KUTUSU BURADA DA CIKMALI. Tekli analizde fiyat
                    `StatTiles` icinde "🏷 Fiyat" olarak duruyor; coklu
                    karsilastirmada AYNI sablon cizildigi halde kutu YOKTU,
                    cunku yayinlanmis kayitta `c.product` bos ve disaridan
                    gelen `priceInfo` null. Kart icin zaten cozdugumuz fiyat
                    (`fiyatlar[c.key]`) buraya da veriliyor — ek istek yok,
                    ve okuyucu fiyati tekli analizde gordugu YERDE goruyor. */}
                <CompareProductDetail data={c.ai} L={L} lang={lang} hideQuiz={hideQuiz}
                  researched={Boolean(data.researched)}
                  priceInfo={(c.product ? priceForCountry(c.product, geoCountry) : fiyatlar[c.key])
                    || priceInfo} />
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
export default function AiAnalysisView({ kind, raw, data: dataProp, lang, products, hideQuiz = false, priceInfo = null }) {
  const data = dataProp && typeof dataProp === 'object' ? dataProp : parseAiJson(raw);
  if (!data || typeof data !== 'object') return null;
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const L = (en, tr) => (code === 'tr' ? tr : en);
  if (kind === 'productFull' || data.type === 'product_full_report') return <ProductFullReport data={data} L={L} lang={lang} priceInfo={priceInfo} />;
  if (kind === 'compareFull' || data.type === 'compare_full_report') return <CompareFullReport data={data} L={L} lang={lang} products={products} hideQuiz={hideQuiz} priceInfo={priceInfo} />;
  if (kind === 'deep') return <DeepView data={data} L={L} />;
  if (kind === 'alts') return <AltView data={data} L={L} />;
  if (kind === 'advisor') return <AdvisorView data={data} L={L} />;
  if (kind === 'pred') return <PredictionView data={data} L={L} />;
  if (kind === 'compare') return <CompareView data={data} L={L} />;
  if (kind === 'forum') return <ForumView data={data} L={L} />;
  return null;
}
