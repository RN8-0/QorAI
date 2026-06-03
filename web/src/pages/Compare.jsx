import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProduct, popularProducts, searchProducts } from '../lib/typesense';
import { useCompare, COMPARE_MAX } from '../lib/compare';
import { saveComparisonHistory } from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import { catMeta, offerForLang, scoreClass, scoreLabel } from '../lib/format';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import ProductImg from '../components/ProductImg.jsx';
import Gauge, { techColor } from '../components/Gauge.jsx';
import { useSeo } from '../lib/seo';
import { canonicalizeSpecMaps } from '../lib/specCanonical';
import './Compare.css';

function flatSpecs(p) {
  const flat = {};
  const put = (obj) => {
    if (obj && typeof obj === 'object') {
      Object.entries(obj).forEach(([k, v]) => {
        if (v != null && String(v).trim() !== '') flat[k] = String(v);
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

// Deterministic "fit" score (no per-user profile on the web) — mirrors the
// app's dual gauge. Same derivation ProductDetail uses.
function matchScore(p) {
  const s = Number(p.techScore) || 0;
  if (s <= 0) return 0;
  const id = String(p.id || '');
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 23;
  return Math.max(45, Math.min(96, Math.round(s * 0.82 + 10 + (h - 11) * 0.6)));
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
  useSeo({
    title: `${t('cmp.title')} — Qor AI`,
    description: t('cmp.subtitle', { max: COMPARE_MAX }),
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
  const boxRef = useRef(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all(ids.map((id) => getProduct(id).catch(() => null)))
      .then((list) => { if (live) setProducts(list.filter(Boolean)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [ids.join(',')]); // eslint-disable-line

  useEffect(() => {
    let live = true;
    popularProducts(12)
      .then((list) => { if (live) setPopular(list); })
      .catch(() => {})
      .finally(() => { if (live) setPopularLoading(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (products.length < 2) return;
    const tm = setTimeout(() => saveComparisonHistory(ids, products), 600);
    return () => clearTimeout(tm);
  }, [ids.join(','), products.length]); // eslint-disable-line

  useEffect(() => {
    const q = term.trim();
    if (!q) { setResults([]); return; }
    const tm = setTimeout(async () => {
      try { setResults(await searchProducts(q, 8)); } catch { setResults([]); }
    }, 250);
    return () => clearTimeout(tm);
  }, [term]);

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
    return keys.slice(0, 60).map((k) => {
      const values = flats.map((f) => f[k] || '—');
      return { key: k, values, win: rowWinners(k, values) };
    });
  }, [products]);

  const bestScore = useMemo(() => {
    if (products.length < 2) return null;
    return Math.max(...products.map((p) => Number(p.techScore) || 0));
  }, [products]);

  function pick(p) {
    if (!add(p.id)) alert(t('pd.maxAlert', { max: COMPARE_MAX }));
    setTerm(''); setResults([]); setPicking(false);
  }

  // Hand the comparison off to the floating AI assistant with a ready prompt.
  function openAiCompare() {
    const names = products.map((p) => p.name).join(' vs ');
    const prompt = L(
      `Compare these products and tell me which is the best choice and why: ${names}`,
      `Şu ürünleri karşılaştır ve hangisinin neden daha iyi olduğunu söyle: ${names}`,
      `Vergleiche diese Produkte und sag mir, welches die beste Wahl ist und warum: ${names}`,
    );
    window.dispatchEvent(new CustomEvent('qor-open-ai', { detail: prompt }));
  }

  const slots = [...products];
  const canAdd = slots.length < COMPARE_MAX;

  return (
    <div className="cmp">
      <div className="cmp-hero">
        <div className="container">
          <h1>{t('cmp.title')}</h1>
          <p>{t('cmp.subtitle', { max: COMPARE_MAX })}</p>
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
                  : popular.map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
            </section>
          </>
        ) : (
          <>
            {/* product header cards with dual rings — app parity */}
            <div className="cmp-cards">
              {slots.map((p) => {
                const m = catMeta(p.category);
                const tech = Number(p.techScore) || 0;
                const match = matchScore(p);
                const isBest = bestScore != null && tech === bestScore;
                return (
                  <div className={'cmp-card' + (isBest && products.length > 1 ? ' best' : '')} key={p.id}>
                    <button className="cmp-remove" onClick={() => remove(p.id)} aria-label="✕">✕</button>
                    {isBest && products.length > 1 && (
                      <span className="cmp-best-tag">★ {L('Best', 'En İyi', 'Top')}</span>
                    )}
                    <Link to={`/product/${p.id}`} className="img-tile cmp-card-img">
                      <ProductImg src={p.imageUrl} alt={p.name} size="card" />
                    </Link>
                    {p.brand && <div className="cmp-card-brand">{p.brand}</div>}
                    <Link to={`/product/${p.id}`} className="cmp-card-name">{p.name}</Link>
                    <div className="cmp-card-cat">{m.icon} {m.label}</div>
                    <div className="cmp-rings">
                      {match > 0 && (
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
                            <Link to={`/product/${p.id}`} className="cmp-th-name">{p.name}</Link>
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
                          <td className="cmp-td-spec">{row.key}</td>
                          {row.values.map((v, i) => (
                            <td key={i}
                              className={v === '—' ? 'cmp-td-empty' : row.win[i] ? 'cmp-td-win' : ''}>
                              {row.win[i] && <span className="cmp-win-dot" aria-hidden="true">✓</span>}
                              {v}
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
                    const price = Number(offer?.price || p.lowestPriceUSD) || 0;
                    const offerUrl = offer?.url || '';
                    return (
                      <div className="card pad cmp-price-card" key={p.id}>
                        <Link to={`/product/${p.id}`} className="cmp-price-name">{p.name}</Link>
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
                <div className="card pad-lg cmp-ai fade-up">
                  <div className="cmp-ai-icon">🤖</div>
                  <h3>{L('AI comparison analysis', 'AI karşılaştırma analizi', 'KI-Vergleichsanalyse')}</h3>
                  <p>{L(
                    'Let Qor AI weigh these products against each other and recommend the best fit for you.',
                    'Qor AI bu ürünleri birbirine karşı tartsın ve sana en uygun olanı önersin.',
                    'Lass Qor AI diese Produkte gegeneinander abwägen und das Beste empfehlen.',
                  )}</p>
                  <button className="btn btn-grad btn-lg" onClick={openAiCompare}>
                    ✨ {L('Analyze with AI', 'AI ile analiz et', 'Mit KI analysieren')}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
