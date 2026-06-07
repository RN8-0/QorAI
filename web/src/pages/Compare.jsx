import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProduct, popularProducts, productMatchesRequestedCategory, searchProducts } from '../lib/typesense';
import { useCompare, COMPARE_MAX } from '../lib/compare';
import { saveComparisonAnalysisHistory, saveComparisonHistory } from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import { catMeta, categoryLabel, offerForLang, scoreClass, scoreLabel } from '../lib/format';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import ProductImg from '../components/ProductImg.jsx';
import Gauge, { techColor } from '../components/Gauge.jsx';
import { useSeo } from '../lib/seo';
import { canonicalizeSpecMaps } from '../lib/specCanonical';
import { productPath } from '../lib/routes';
import { askQorAi } from '../lib/ai';
import { useAuth } from '../lib/auth';
import { aiUserProfile } from '../lib/qorCoins';
import { useAiAccess } from '../lib/useAiAccess';
import { searchYoutubeReviews } from '../lib/youtube';
import Reviews from '../components/Reviews.jsx';
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
  const [youtubeByProduct, setYoutubeByProduct] = useState({});
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const boxRef = useRef(null);
  const compareCategory = products[0]?.category || '';
  const showMatchScore = hasProfileMatch(user);

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

  useEffect(() => {
    if (tab !== 'ai' || products.length < 1) return undefined;
    let live = true;
    setYoutubeLoading(true);
    Promise.all(products.map(async (p) => {
      const videos = await searchYoutubeReviews(p.name, 2).catch(() => []);
      return [p.id, videos];
    }))
      .then((entries) => {
        if (!live) return;
        setYoutubeByProduct(Object.fromEntries(entries));
      })
      .finally(() => { if (live) setYoutubeLoading(false); });
    return () => { live = false; };
  }, [tab, products.map((p) => p.id).join('|')]); // eslint-disable-line

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

  function buildAiComparePrompt() {
    const names = products.map((p) => p.name).join(' vs ');
    const profile = JSON.stringify(aiUserProfile(user), null, 2);
    const productSummary = products.map((p) => (
      `${p.name}\nBrand: ${p.brand || '-'}\nCategory: ${p.category || '-'}\nQor AI score: ${scoreLabel(p.techScore)}`
    )).join('\n\n');
    const specTable = specRows.slice(0, 140)
      .map((row) => `${localizedSpecLabel(row.key, lang)}: ${row.values.map((v, i) => `${products[i]?.name || `Product ${i + 1}`}=${localizedSpecValue(v, lang)}`).join(' | ')}`)
      .join('\n');
    return L(
      `Compare these products for the signed-in user's profile. Products: ${names}\n\nUser profile:\n${profile}\n\nProducts:\n${productSummary}\n\nSpecs:\n${specTable}\n\nGive a clear verdict, best-for scenarios, strengths, weaknesses and final recommendation. Use only the provided catalog data when citing specs.`,
      `Bu ürünleri giriş yapan kullanıcının profiline göre karşılaştır. Ürünler: ${names}\n\nKullanıcı profili:\n${profile}\n\nÜrünler:\n${productSummary}\n\nTeknik özellikler:\n${specTable}\n\nNet karar, kime uygun olduğu, güçlü/zayıf yönler ve final öneri ver. Özellik söylerken sadece verilen katalog verisine dayan.`,
      `Vergleiche diese Produkte anhand des eingeloggten Nutzerprofils. Produkte: ${names}\n\nNutzerprofil:\n${profile}\n\nProdukte:\n${productSummary}\n\nSpecs:\n${specTable}\n\nGib Urteil, passende Szenarien, Stärken, Schwächen und finale Empfehlung. Nutze nur die angegebenen Katalogdaten für Specs.`,
    );
  }

  async function runAiCompare() {
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
    try {
      const text = await askQorAi([{ role: 'user', text: buildAiComparePrompt() }]);
      setAiText(text);
      await saveComparisonAnalysisHistory({ products, analysis: text });
    } catch (e) {
      setAiNotice(L('AI analysis failed. Please try again.', 'AI analizi başarısız oldu. Tekrar dene.', 'KI-Analyse fehlgeschlagen. Bitte erneut versuchen.'));
    } finally {
      setAiBusy(false);
    }
  }

  const slots = [...products];
  const canAdd = slots.length < COMPARE_MAX;

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

            {/* tabs — Specs · Prices · AI */}
            <div className="tabs">
              <button className={tab === 'specs' ? 'on' : ''} onClick={() => setTab('specs')}>
                {L('Specs', 'Özellikler', 'Eigenschaften')}
              </button>
              <button className={tab === 'prices' ? 'on' : ''} onClick={() => setTab('prices')}>
                {L('Prices', 'Fiyatlar', 'Preise')}
              </button>
              <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>
                {L('AI Analysis', 'AI Analizi', 'KI-Analyse')}
              </button>
              <button className={tab === 'reviews' ? 'on' : ''} onClick={() => setTab('reviews')}>
                {L('Reviews', 'Yorumlar', 'Bewertungen')}
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
                              {row.win[i] && <span className="cmp-win-dot" aria-hidden="true">✓</span>}
                              <SpecValue value={v} lang={lang} />
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

              {tab === 'prices' && (
                <div className="cmp-prices fade-up">
                  {slots.map((p) => {
                    const offer = offerForLang(p, lang);
                    const price = Number(offer?.price) || 0;
                    const offerUrl = offer?.url || '';
                    return (
                      <div className="card pad cmp-price-card" key={p.id}>
                        <Link to={productPath(p)} className="cmp-price-name">{p.name}</Link>
                        {price > 0
                          ? <div className="cmp-price-amt">{formatOffer(offer, lang) || `$${price.toLocaleString(lang)}`}</div>
                          : <div className="cmp-price-none">{L('No price yet', 'Henüz fiyat yok', 'Noch kein Preis')}</div>}
                        {offerUrl ? (
                          <a className="btn btn-buy btn-block" href={offerUrl} target="_blank" rel="sponsored noopener">
                            🛒 {L('Go to store', 'Mağazaya git', 'Zum Shop')}
                          </a>
                        ) : (
                          <button className="btn btn-buy btn-block"
                            onClick={() => window.dispatchEvent(new CustomEvent('qor-open-ai', {
                              detail: L(`Find the best offer for ${p.name}`, `${p.name} için en iyi teklifi bul`, `Finde das beste Angebot für ${p.name}`),
                            }))}>
                            🛒 {L('Find best offer', 'En iyi teklifi bul', 'Bestes Angebot')}
                          </button>
                        )}
                        <div className="cmp-aff-note">
                          {L('Store links may be affiliate links.', 'Mağaza linkleri affiliate olabilir.', 'Shop-Links können Affiliate-Links sein.')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {tab === 'ai' && (
                <div className="cmp-ai-layout fade-up">
                  <div className="card pad-lg cmp-ai">
                    <div className="cmp-ai-icon">🤖</div>
                    <h3>{L('AI comparison analysis', 'AI karşılaştırma analizi', 'KI-Vergleichsanalyse')}</h3>
                    <p>{L(
                      'Let Qor AI weigh these products against each other and recommend the best fit for you.',
                      'Qor AI bu ürünleri birbirine karşı tartsın ve sana en uygun olanı önersin.',
                      'Lass Qor AI diese Produkte gegeneinander abwägen und das Beste empfehlen.',
                    )}</p>
                    <button className="btn btn-grad btn-lg" onClick={runAiCompare} disabled={aiBusy}>
                      {aiBusy ? L('Analyzing...', 'Analiz ediliyor...', 'Analyse läuft...') : `✨ ${L('Analyze with AI', 'AI ile analiz et', 'Mit KI analysieren')}`}
                    </button>
                    {aiNotice && <div className="cmp-ai-notice">{aiNotice}</div>}
                    {aiText && <div className="cmp-ai-result"><PlainAiText text={aiText} /></div>}
                  </div>
                  {(youtubeLoading || Object.values(youtubeByProduct).some((items) => items?.length)) && (
                    <div className="card pad cmp-youtube">
                      <h3>{L('YouTube reviews', 'YouTube incelemeleri', 'YouTube-Reviews')}</h3>
                      {youtubeLoading ? <div className="muted">{L('Loading...', 'Yükleniyor...', 'Wird geladen...')}</div> : (
                        <div className="cmp-youtube-grid">
                          {slots.map((p) => (
                            <div key={p.id} className="cmp-youtube-product">
                              <h4>{p.name}</h4>
                              {(youtubeByProduct[p.id] || []).map((v) => (
                                <a key={v.id} href={v.url} target="_blank" rel="noopener noreferrer" className="cmp-video">
                                  {v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" />}
                                  <span><b>{v.title}</b><small>{v.channel}</small></span>
                                </a>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {tab === 'reviews' && (
                <div className="cmp-reviews-grid fade-up">
                  {slots.map((p) => (
                    <div className="card pad cmp-review-card" key={p.id}>
                      <Link to={productPath(p)} className="cmp-review-title">{p.name}</Link>
                      <Reviews productId={p.id} />
                    </div>
                  ))}
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
