import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { getProduct, popularProducts, productMatchesRequestedCategory, searchProducts } from '../lib/typesense';
import { useCompare, COMPARE_MAX } from '../lib/compare';
import { saveComparisonAnalysisHistory, saveComparisonHistory } from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import { catMeta, categoryLabel, priceForCountry, formatPriceAmount, amazonUrlForProduct, scoreClass, scoreLabel } from '../lib/format';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import ProductImg from '../components/ProductImg.jsx';
import Gauge, { techColor } from '../components/Gauge.jsx';
import { useSeo } from '../lib/seo';
import { canonicalizeSpecMaps } from '../lib/specCanonical';
import { productPath } from '../lib/routes';
import { askQorAiGrounded, askQorAiRaw } from '../lib/ai';
import { generateCompareQuiz } from '../lib/linkAnalysis';
import { useAuth } from '../lib/auth';
import { aiUserProfile } from '../lib/qorCoins';
import { useAiAccess } from '../lib/useAiAccess';
import { useGeoCountry } from '../lib/geo';
import AiAnalysisView, { buildComparePrompt, buildCompareResearchPrompt, parseAiJson } from '../components/AiAnalysis.jsx';
import QuizFlow from '../components/QuizFlow.jsx';
import AiLoadingSteps from '../components/AiLoadingSteps.jsx';
import AmazonLogo from '../components/AmazonLogo.jsx';
import { calculateProfileMatchScore, hasProfileMatch } from '../lib/profileMatch';
import { isDisplayableSpec, localizedSpecLabel, localizedSpecValue } from '../lib/specDisplay';
import './Compare.css';

function flatSpecs(p) {
  const flat = {};
  const put = (obj) => {
    if (obj && typeof obj === 'object') {
      Object.entries(obj).forEach(([k, v]) => {
        if (v != null && String(v).trim() !== '' && isDisplayableSpec(k, v)) flat[k] = String(v);
      });
    }
  };
  const canonical = canonicalizeSpecMaps(p);
  put(canonical.keySpecs);
  put(canonical.specs);
  if (canonical.specSections && typeof canonical.specSections === 'object') {
    Object.values(canonical.specSections).forEach(put);
  }
  return flat;
}

// Specs where a smaller number is the better result.
const LOWER_BETTER = /(ağırlık|agirlik|weight|kalınlık|kalinlik|thickness|fiyat|price|gecikme|latency|response|tepki|ping|tüketim|tuketim|consumption|emisyon)/i;

function parseNum(s) {
  if (s == null) return null;
  const m = String(s).match(/-?\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(',', '.')) : null;
}

function formatOffer(offer, lang) {
  if (!offer || !Number(offer.price)) return '';
  try {
    return new Intl.NumberFormat(lang, {
      style: 'currency',
      currency: offer.currency || 'USD',
      maximumFractionDigits: 0,
    }).format(offer.price);
  } catch {
    return `${offer.currency || 'USD'} ${Number(offer.price).toLocaleString(lang, { maximumFractionDigits: 0 })}`;
  }
}

function splitSpecValue(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '—') return [];
  let lines = raw
    .split(/\r?\n|[•·]\s*|;\s*/g)
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (lines.length <= 1 && raw.length > 100 && /(camera|kamera|lens|zoom|ois|hdr|video|mp|optical|optik|digital|dijital|telephoto|telefoto|wide|geniş|f\/|f\d)/i.test(raw)) {
    lines = raw
      .replace(/\s+(?=(?:Yes|No|Var|Yok|OIS|HDR|LED|Laser|Lazer|Video|Optical|Optik|Digital|Dijital|Automatic|Otomatik|Hybrid|Hibrit|Phase|Faz|Telephoto|Telefoto|Periscope|Periskop|Ultra Wide|Ultra Geniş|Extra Wide|Ekstra Geniş|Wide Angle|Geniş Açı|Zoom|f\/\d|F\d|[0-9]+(?:\.[0-9]+)?\s*MP)\b)/g, '\n')
      .split(/\r?\n/g)
      .map((x) => x.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }
  return lines.length ? lines : [raw];
}

function SpecValue({ value, lang }) {
  const lines = splitSpecValue(localizedSpecValue(value, lang));
  if (!lines.length) return <span>—</span>;
  if (lines.length === 1) return <span>{lines[0]}</span>;
  return (
    <ul className="cmp-spec-list">
      {lines.map((line, i) => <li key={`${line}-${i}`}>{line}</li>)}
    </ul>
  );
}

function PlainAiText({ text }) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, i) => <p key={i}>{part}</p>);
}

function fallbackCompareQuiz(lang) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const rows = code === 'tr'
    ? [
        ['Bu ürünler arasında ana kullanım senaryon hangisi?', ['Günlük ve uzun ömürlü kullanım', 'Yoğun iş/üretkenlik', 'Performans odaklı kullanım', 'En risksiz seçim']],
        ['Karar verirken hangi fark daha önemli?', ['Ham performans farkı', 'Uyumluluk ve stabilite', 'Fiyat/performans dengesi', 'Marka/servis güveni']],
        ['Eksik veya zayıf bir özellik seni ne kadar etkiler?', ['Çok etkiler, sorun istemem', 'Kullanımıma bağlı', 'Güçlü taraflar telafi eder', 'Fark etmem muhtemel değil']],
        ['Topluluk yorumları seçiminde nasıl rol oynasın?', ['Belirleyici olsun', 'Dengeli değerlendirilsin', 'Teknik specs daha önemli', 'Az etkilesin']],
        ['Satın alma zamanında ne kadar esneksin?', ['Hemen almalıyım', 'İndirim beklerim', 'Yeni model beklerim', 'Fiyat sabitse alırım']],
        ['Uzun vadede en çok neyi önemserdin?', ['Performansın eskimemesi', 'Garanti/servis rahatlığı', 'Düşük sorun riski', 'Yükseltme/uyumluluk']],
        ['İki ürün yakın çıkarsa hangisi kazansın?', ['Daha güçlü olan', 'Daha güvenilir olan', 'Daha iyi fiyatlı olan', 'Daha yeni/gelecek odaklı olan']],
        ['Yanlış seçim yaparsan en büyük problem ne olur?', ['Para boşa gider', 'Cihazıma/sisteme uymaz', 'Beklediğim performansı vermez', 'İade/değişim uğraştırır']],
      ]
    : [
        ['What is your main use case between these products?', ['Everyday long-term use', 'Heavy work/productivity', 'Performance-focused use', 'Lowest-risk choice']],
        ['Which difference matters most?', ['Raw performance', 'Compatibility and stability', 'Value for money', 'Brand/service trust']],
        ['How much would a weak feature affect you?', ['A lot, I want no issues', 'Depends on the feature', 'Strengths can compensate', 'Probably not much']],
        ['How should community feedback influence the choice?', ['It should be decisive', 'Balanced with specs', 'Specs matter more', 'Only a little']],
        ['How flexible is your purchase timing?', ['I need it now', 'I can wait for a discount', 'I can wait for a successor', 'I buy if price is stable']],
        ['What matters most long term?', ['Performance aging well', 'Warranty/service comfort', 'Low issue risk', 'Upgrade/compatibility']],
        ['If the products are close, what wins?', ['More power', 'More reliability', 'Better price', 'Newer/future-proof design']],
        ['If you choose wrong, what is the biggest problem?', ['Wasted money', 'It will not fit my device/system', 'It will underperform', 'Returns will be annoying']],
      ];
  return rows.map(([text, options], i) => ({ id: `compare-fallback-${i}`, text, options }));
}

// Returns a boolean per cell — true marks the winning value(s) for the row.
function rowWinners(key, values) {
  const nums = values.map(parseNum);
  const valid = nums.filter((n) => n != null && Number.isFinite(n));
  if (valid.length < 2 || valid.every((n) => n === valid[0])) {
    return values.map(() => false);
  }
  const best = LOWER_BETTER.test(key) ? Math.min(...valid) : Math.max(...valid);
  return nums.map((n) => n != null && Number.isFinite(n) && n === best);
}

export default function Compare() {
  const { t, lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const [tab, setTab] = useState('specs');
  const { user } = useAuth();
  const guardAiAccess = useAiAccess(lang);
  useSeo({
    title: `${t('cmp.title')} — Qor AI`,
    description: L('Compare products side by side — add as many as you like.', 'Ürünleri yan yana karşılaştır — istediğin kadar ekle.', 'Produkte nebeneinander vergleichen — füge beliebig viele hinzu.'),
    path: '/compare',
  });
  const { ids, remove, clear, add } = useCompare();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [picking, setPicking] = useState(false);
  const [popular, setPopular] = useState([]);
  const [popularLoading, setPopularLoading] = useState(true);
  const [popularLimit, setPopularLimit] = useState(18);
  const [pickError, setPickError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiNotice, setAiNotice] = useState('');
  const [aiPhase, setAiPhase] = useState('idle');
  const [aiQuestions, setAiQuestions] = useState([]);
  const geoCountry = useGeoCountry();
  const boxRef = useRef(null);
  const compareCategory = products[0]?.category || '';
  const showMatchScore = hasProfileMatch(user);
  const ytQuery = products.map((p) => p.name).filter(Boolean).join(' vs ');
  const ytUrl = ytQuery
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${ytQuery} ${lang === 'tr' ? 'karşılaştırma' : lang === 'de' ? 'Vergleich' : 'comparison'}`)}`
    : '';

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all(ids.map((id) => getProduct(id).catch(() => null)))
      .then((list) => {
        if (!live) return;
        const clean = list.filter(Boolean);
        const baseCategory = clean[0]?.category || '';
        const valid = baseCategory
          ? clean.filter((p) => String(p.category || '') === String(baseCategory)
            && productMatchesRequestedCategory(p, baseCategory))
          : clean;
        clean.filter((p) => !valid.some((v) => v.id === p.id)).forEach((p) => remove(p.id));
        setProducts(valid);
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [ids.join(',')]); // eslint-disable-line

  useEffect(() => {
    let live = true;
    setPopularLoading(true);
    popularProducts(popularLimit, { category: compareCategory })
      .then((list) => { if (live) setPopular(list); })
      .catch(() => {})
      .finally(() => { if (live) setPopularLoading(false); });
    return () => { live = false; };
  }, [popularLimit, compareCategory]);

  useEffect(() => {
    if (products.length < 2) return;
    const tm = setTimeout(() => saveComparisonHistory(ids, products), 600);
    return () => clearTimeout(tm);
  }, [ids.join(','), products.length]); // eslint-disable-line

  useEffect(() => {
    setAiBusy(false);
    setAiText('');
    setAiNotice('');
    setAiPhase('idle');
    setAiQuestions([]);
  }, [ids.join(',')]); // eslint-disable-line

  useEffect(() => {
    const q = term.trim();
    if (!q) { setResults([]); return; }
    const tm = setTimeout(async () => {
      try {
        const found = await searchProducts(q, 12);
        setResults(compareCategory
          ? found.filter((p) => String(p.category || '') === String(compareCategory)
            && productMatchesRequestedCategory(p, compareCategory)).slice(0, 8)
          : found.slice(0, 8));
      } catch { setResults([]); }
    }, 250);
    return () => clearTimeout(tm);
  }, [term, compareCategory]);

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setPicking(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const specRows = useMemo(() => {
    if (products.length < 1) return [];
    const flats = products.map(flatSpecs);
    const keys = [];
    const seen = new Set();
    flats.forEach((f) => Object.keys(f).forEach((k) => {
      if (!seen.has(k)) { seen.add(k); keys.push(k); }
    }));
    return keys.map((k) => {
      const values = flats.map((f) => f[k] || '—');
      return { key: k, values, win: rowWinners(k, values) };
    });
  }, [products]);

  const matchScores = useMemo(() => {
    if (!showMatchScore) return {};
    return Object.fromEntries(products.map((p) => [p.id, calculateProfileMatchScore(user, p)]));
  }, [products, showMatchScore, user]);

  const bestScore = useMemo(() => {
    if (products.length < 2) return null;
    return Math.max(...products.map((p) => Number(p.techScore) || 0));
  }, [products]);

  function pick(p) {
    setPickError('');
    if (compareCategory && (String(p.category || '') !== String(compareCategory)
      || !productMatchesRequestedCategory(p, compareCategory))) {
      setPickError(t('cmp.sameCategoryOnly', { cat: categoryLabel(compareCategory, lang) }));
      setPicking(false);
      return;
    }
    if (!add(p.id)) alert(t('pd.maxAlert', { max: COMPARE_MAX }));
    setTerm(''); setResults([]); setPicking(false);
  }

  function buildAiComparePrompt(answers = [], research = '') {
    return buildComparePrompt(products, lang, aiUserProfile(user), { quizAnswers: answers, research });
  }

  async function startAiCompareQuiz() {
    setAiNotice('');
    if (products.length < 2) {
      setAiNotice(L('Add at least two products first.', 'Önce en az iki ürün ekle.', 'Füge zuerst mindestens zwei Produkte hinzu.'));
      return;
    }
    setAiPhase('quizLoading');
    setAiBusy(true);
    try {
      let questions = await generateCompareQuiz({
        products: products.map((p) => ({
          title: p.name,
          url: productPath(p),
          category: p.category,
          score: p.techScore,
          analysis: p.description || '',
        })),
        language: lang,
        userProfile: aiUserProfile(user),
      });
      if (!questions.length) questions = fallbackCompareQuiz(lang);
      setAiQuestions(questions);
      setAiPhase('quiz');
    } catch {
      setAiQuestions(fallbackCompareQuiz(lang));
      setAiPhase('quiz');
    } finally {
      setAiBusy(false);
    }
  }

  async function runAiCompare(answers = []) {
    setAiNotice('');
    if (products.length < 2) {
      setAiNotice(L('Add at least two products first.', 'Önce en az iki ürün ekle.', 'Füge zuerst mindestens zwei Produkte hinzu.'));
      return;
    }
    const access = await guardAiAccess('compare_ai', {
      onMessage: (message) => setAiNotice(message),
    });
    if (!access.ok) return;
    setAiBusy(true);
    setAiPhase('analyzing');
    try {
      let research = '';
      try {
        research = await askQorAiGrounded(buildCompareResearchPrompt(products, lang, { quizAnswers: answers }), {
          language: lang,
          maxOutputTokens: 4096,
        });
      } catch {
        research = '';
      }
      const text = await askQorAiRaw({
        system: `You are Qor AI. Return only valid JSON in ${lang}.`,
        user: buildAiComparePrompt(answers, research),
        maxOutputTokens: 12288,
        temperature: 0.45,
        jsonMode: true,
      });
      setAiText(text);
      setAiPhase('result');
      await saveComparisonAnalysisHistory({ products, analysis: text });
    } catch (e) {
      setAiNotice(L('AI analysis failed. Please try again.', 'AI analizi başarısız oldu. Tekrar dene.', 'KI-Analyse fehlgeschlagen. Bitte erneut versuchen.'));
      setAiPhase('quiz');
    } finally {
      setAiBusy(false);
    }
  }

  const slots = [...products];
  const canAdd = slots.length < COMPARE_MAX;

  // The standalone Compare page was removed from navigation — it's only reached
  // via the compare tray once products are queued. With nothing queued there is
  // no landing page to show, so send visitors home.
  if (!ids.length) return <Navigate to="/" replace />;

  return (
    <div className="cmp">
      <div className="cmp-hero">
        <div className="container">
          <h1>{t('cmp.title')}</h1>
          <p>{L('Compare products side by side — add as many as you like.', 'Ürünleri yan yana karşılaştır — istediğin kadar ekle.', 'Produkte nebeneinander vergleichen — füge beliebig viele hinzu.')}</p>
        </div>
      </div>

      <div className="container">
        <div className="cmp-addbar" ref={boxRef}>
          <div className="cmp-add-input">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={term}
              onChange={(e) => { setTerm(e.target.value); setPicking(true); }}
              onFocus={() => setPicking(true)}
              placeholder={canAdd ? t('cmp.addPlaceholder') : t('cmp.addFull', { max: COMPARE_MAX })}
              disabled={!canAdd}
            />
            {products.length > 0 && (
              <button className="cmp-clear" onClick={clear}>{t('cmp.clearAll')}</button>
            )}
          </div>
          {picking && results.length > 0 && (
            <div className="cmp-results">
              {results.map((r) => (
                <button key={r.id} className="cmp-result" onClick={() => pick(r)}
                  disabled={ids.includes(r.id)}>
                  <ProductImg src={r.imageUrl} alt="" size="thumb" />
                  <span className="cmp-result-name">{r.name}</span>
                  <span className={`score ${scoreClass(r.techScore)}`}>⚡ {scoreLabel(r.techScore)}</span>
                  {ids.includes(r.id) && <span className="cmp-result-in">{t('cmp.added')}</span>}
                </button>
              ))}
            </div>
          )}
          {pickError && <div className="cmp-pick-error">{pickError}</div>}
        </div>

        {loading && ids.length > 0 ? (
          <div className="cmp-loading"><div className="spinner" /> {t('cmp.loading')}</div>
        ) : products.length === 0 ? (
          <>
            <div className="cmp-empty">
              <div className="cmp-empty-icon">⚖️</div>
              <h3>{t('cmp.emptyTitle')}</h3>
              <p>{t('cmp.emptyDesc')}</p>
            </div>
            <section className="cmp-picks">
              <div className="cmp-picks-head">
                <h2>{t('cmp.popularTitle')}</h2>
                <span>{t('cmp.popularDesc')}</span>
              </div>
              <div className="card-grid">
                {popularLoading
                  ? Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
                  : popular.map((p) => (
                    <ProductCard key={p.id} product={p}
                      onClick={(e) => { e.preventDefault(); pick(p); }} />
                  ))}
              </div>
              {!popularLoading && popular.length >= popularLimit && (
                <button className="btn btn-ghost cmp-more" onClick={() => setPopularLimit((n) => n + 18)}>
                  {t('cmp.loadMore')}
                </button>
              )}
            </section>
          </>
        ) : (
          <>
            {/* product header cards with dual rings — app parity */}
            <div className="cmp-cards">
              {slots.map((p) => {
                const m = catMeta(p.category);
                const tech = Number(p.techScore) || 0;
                const match = matchScores[p.id] || 0;
                const isBest = bestScore != null && tech === bestScore;
                return (
                  <div className={'cmp-card' + (isBest && products.length > 1 ? ' best' : '')} key={p.id}>
                    <button className="cmp-remove" onClick={() => remove(p.id)} aria-label="✕">✕</button>
                    {isBest && products.length > 1 && (
                      <span className="cmp-best-tag">★ {L('Best', 'En İyi', 'Top')}</span>
                    )}
                    <Link to={productPath(p)} className="img-tile cmp-card-img">
                      <ProductImg src={p.imageUrl} alt={p.name} size="card" />
                    </Link>
                    {p.brand && <div className="cmp-card-brand">{p.brand}</div>}
                    <Link to={productPath(p)} className="cmp-card-name">{p.name}</Link>
                    <div className="cmp-card-cat">{m.icon} {categoryLabel(p.category, lang)}</div>
                    <div className="cmp-rings">
                      {showMatchScore && match > 0 && (
                        <span className="cmp-ring">
                          <Gauge value={match} size={46} stroke={4} color="var(--score-average)" fontSize={14} />
                          <small>{L('Match', 'Uyum', 'Match')}</small>
                        </span>
                      )}
                      {tech > 0 && (
                        <span className="cmp-ring">
                          <Gauge value={tech} size={46} stroke={4} color={techColor(tech)} fontSize={14} />
                          <small>{L('Tech', 'Tech', 'Tech')}</small>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {ytUrl && products.length >= 2 && (
              <div className="cmp-yt-row">
                <a className="cmp-yt-btn" href={ytUrl} target="_blank" rel="noopener">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.1 5 12 5 12 5s-6.1 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.9 19 12 19 12 19s6.1 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15V9l5.2 3Z" />
                  </svg>
                  {L('Watch this comparison on YouTube', 'Bu karşılaştırmayı YouTube\'da izle', 'Diesen Vergleich auf YouTube ansehen')}
                </a>
              </div>
            )}

            {/* Prices — independent block ABOVE the tabs, one card per product
                column, country-aware (visitor's detected market). */}
            <section className="cmp-prices-block">
              <h2 className="cmp-block-title">{L('Prices', 'Fiyatlar', 'Preise')}</h2>
              <div className="cmp-prices" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
                {slots.map((p) => {
                  const cp = priceForCountry(p, geoCountry);
                  const amz = amazonUrlForProduct(p, (geoCountry || 'US'));
                  return (
                    <div className="cmp-price-card" key={p.id}>
                      <Link to={productPath(p)} className="cmp-price-name">{p.name}</Link>
                      {cp ? <div className="cmp-price-amt">{formatPriceAmount(cp.price, cp.currency, lang)}</div>
                        : <div className="cmp-price-none">{L('No price in your region', 'Bölgende fiyat yok', 'Kein Preis in deiner Region')}</div>}
                      {amz && (
                        <a className="cmp-price-row-link" href={amz} target="_blank" rel="sponsored noopener">
                          <AmazonLogo height={20} /><span>{L('See price', 'Fiyata bak', 'Preis ansehen')}</span>
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* tabs — Specs · AI (centered) */}
            <div className="tabs cmp-tabs2">
              <button className={tab === 'specs' ? 'on' : ''} onClick={() => setTab('specs')}>
                {L('Specs', 'Özellikler', 'Eigenschaften')}
              </button>
              <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>
                {L('AI Analysis', 'AI Analizi', 'KI-Analyse')}
              </button>
            </div>

            <div style={{ marginTop: 18 }}>
              {tab === 'specs' && (
                <div className="cmp-table-wrap fade-up">
                  <table className="cmp-table">
                    <thead>
                      <tr>
                        <th className="cmp-th-spec">{t('cmp.specCol')}</th>
                        {slots.map((p) => (
                          <th key={p.id} className="cmp-th-prod cmp-th-compact">
                            <Link to={productPath(p)} className="cmp-th-name">{p.name}</Link>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="cmp-row-score">
                        <td className="cmp-td-spec">{t('cmp.scoreRow')}</td>
                        {slots.map((p) => {
                          const isBest = bestScore != null && (Number(p.techScore) || 0) === bestScore;
                          return (
                            <td key={p.id} className={isBest ? 'cmp-td-win' : ''}>
                              <span className={`score ${scoreClass(p.techScore)}`}>{scoreLabel(p.techScore)}</span>
                            </td>
                          );
                        })}
                      </tr>
                      {specRows.map((row) => (
                        <tr key={row.key}>
                          <td className="cmp-td-spec">{localizedSpecLabel(row.key, lang)}</td>
                          {row.values.map((v, i) => (
                            <td key={i}
                              className={v === '—' ? 'cmp-td-empty' : row.win[i] ? 'cmp-td-win' : ''}>
                              {v === '—' ? (
                                <span className="cmp-na" title={L('No data', 'Veri yok', 'Keine Daten')}>?</span>
                              ) : (
                                <>
                                  {row.win[i] && <span className="cmp-win-dot" aria-hidden="true">✓</span>}
                                  <SpecValue value={v} lang={lang} />
                                </>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {specRows.length === 0 && (
                        <tr>
                          <td className="cmp-td-spec">—</td>
                          {slots.map((p) => (
                            <td key={p.id} className="cmp-td-empty">{t('cmp.noSpecData')}</td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'ai' && (
                <div className="cmp-ai-layout fade-up">
                  <div className="card pad-lg cmp-ai">
                    {!aiText && aiPhase === 'idle' && (
                      <button className="btn btn-grad btn-lg" onClick={startAiCompareQuiz} disabled={aiBusy}>
                        {L('Start analysis', 'Analizi başlat', 'Analyse starten')}
                      </button>
                    )}
                    {!aiText && aiPhase === 'quizLoading' && (
                      <div className="cmp-ai-loading"><div className="spinner" /> {L('Preparing quiz...', 'Quiz hazırlanıyor...', 'Quiz wird vorbereitet...')}</div>
                    )}
                    {!aiText && aiPhase === 'quiz' && aiQuestions.length > 0 && (
                      <QuizFlow
                        questions={aiQuestions}
                        busy={aiBusy}
                        title={L('Tune the comparison', 'Karşılaştırmayı kişiselleştir', 'Vergleich anpassen')}
                        subtitle={L(
                          'Answer these before the report so each product is scored for your real use.',
                          'Rapor öncesi cevapla; her ürün gerçek kullanımına göre puanlansın.',
                          'Beantworte dies vor dem Bericht, damit jedes Produkt passend bewertet wird.',
                        )}
                        onSubmit={runAiCompare}
                      />
                    )}
                    {!aiText && aiPhase === 'analyzing' && (
                      <AiLoadingSteps lang={lang} mode="compare" />
                    )}
                    {aiNotice && <div className="cmp-ai-notice">{aiNotice}</div>}
                    {aiText && (
                      parseAiJson(aiText)
                        ? <div className="cmp-ai-result"><AiAnalysisView kind="compareFull" raw={aiText} lang={lang} /></div>
                        : <div className="cmp-ai-result"><PlainAiText text={aiText} /></div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <section className="cmp-picks cmp-picks-after">
              <div className="cmp-picks-head">
                <h2>{t('cmp.popularTitle')}</h2>
                <span>{compareCategory
                  ? t('cmp.sameCategoryHint', { cat: categoryLabel(compareCategory, lang) })
                  : t('cmp.popularDesc')}</span>
              </div>
              <div className="card-grid">
                {popularLoading
                  ? Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
                  : popular.filter((p) => !ids.includes(p.id)).map((p) => (
                    <ProductCard key={p.id} product={p}
                      onClick={(e) => { e.preventDefault(); pick(p); }} />
                  ))}
              </div>
              {!popularLoading && popular.length >= popularLimit && (
                <button className="btn btn-ghost cmp-more" onClick={() => setPopularLimit((n) => n + 18)}>
                  {t('cmp.loadMore')}
                </button>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
