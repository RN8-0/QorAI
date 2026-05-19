import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProduct, loadAllProducts, searchProducts } from '../lib/typesense';
import { useCompare, COMPARE_MAX } from '../lib/compare';
import { saveComparisonHistory } from '../lib/pbHistory';
import { useT } from '../i18n/index.jsx';
import { catMeta, scoreClass, scoreLabel, PLACEHOLDER_IMG } from '../lib/format';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
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
  put(p.keySpecs);
  put(p.specs);
  if (p.specSections && typeof p.specSections === 'object') {
    Object.values(p.specSections).forEach(put);
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
  const t = useT();
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
    loadAllProducts((batch) => {
      if (live) { setPopular(batch.slice(0, 12)); setPopularLoading(false); }
    })
      .then((full) => { if (live) setPopular(full.slice(0, 12)); })
      .catch(() => { if (live) setPopularLoading(false); });
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
                  <img src={r.imageUrl || PLACEHOLDER_IMG} alt=""
                    onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMG; }} />
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
          <div className="cmp-table-wrap">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th className="cmp-th-spec">{t('cmp.specCol')}</th>
                  {slots.map((p) => {
                    const m = catMeta(p.category);
                    return (
                      <th key={p.id} className="cmp-th-prod">
                        <button className="cmp-remove" onClick={() => remove(p.id)} aria-label="✕">✕</button>
                        <Link to={`/product/${p.id}`} className="cmp-th-img">
                          <img src={p.imageUrl || PLACEHOLDER_IMG} alt={p.name}
                            onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMG; }} />
                        </Link>
                        {p.brand && <div className="cmp-th-brand">{p.brand}</div>}
                        <Link to={`/product/${p.id}`} className="cmp-th-name">{p.name}</Link>
                        <div className="cmp-th-cat">{m.icon} {m.label}</div>
                      </th>
                    );
                  })}
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
      </div>
    </div>
  );
}
