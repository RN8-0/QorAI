import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadAllProducts, searchProducts } from '../lib/typesense';
import { catMeta } from '../lib/format';
import { trackEvent } from '../lib/analytics';
import { useT } from '../i18n/index.jsx';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import { useSeo } from '../lib/seo';
import './Catalog.css';

const SORTS = [
  { id: 'score', key: 'catalog.sortScore' },
  { id: 'name', key: 'catalog.sortName' },
];
const SCORES = [
  { id: 'high', key: 'catalog.scoreHigh', test: (s) => s >= 80 },
  { id: 'mid', key: 'catalog.scoreMid', test: (s) => s >= 60 && s < 80 },
  { id: 'low', key: 'catalog.scoreLow', test: (s) => s > 0 && s < 60 },
];
const PAGE = 24;

export default function Catalog() {
  const t = useT();
  useSeo({ title: `${t('catalog.title')} — Qor AI`, description: t('catalog.subtitle'), path: '/catalog' });
  const [params, setParams] = useSearchParams();
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState(params.get('cat') || 'all');
  const [sort, setSort] = useState('score');
  const [score, setScore] = useState('all');
  const [brand, setBrand] = useState('all');
  const [shown, setShown] = useState(PAGE);
  const [q, setQ] = useState(params.get('q') || '');
  const [hits, setHits] = useState(null);
  const [searching, setSearching] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    let live = true;
    loadAllProducts((batch) => {
      if (live) { setAll(batch.filter((p) => p.name)); setLoading(false); }
    })
      .then((full) => { if (live) setAll(full.filter((p) => p.name)); })
      .catch(() => setLoading(false));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const term = q.trim();
    const next = new URLSearchParams(params);
    if (term) next.set('q', term); else next.delete('q');
    setParams(next, { replace: true });
    if (!term) { setHits(null); setSearching(false); return; }
    setSearching(true);
    const tm = setTimeout(async () => {
      try { setHits(await searchProducts(term, 200)); trackEvent('catalog_search', { query: term }); }
      catch { setHits([]); }
      finally { setSearching(false); }
    }, 280);
    return () => clearTimeout(tm);
  }, [q]); // eslint-disable-line

  const categories = useMemo(() => {
    const c = {};
    all.forEach((p) => { const k = (p.category || 'other').toLowerCase(); c[k] = (c[k] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [all]);

  const brands = useMemo(() => {
    const c = {};
    all.forEach((p) => { if (p.brand) c[p.brand] = (c[p.brand] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 14);
  }, [all]);

  const view = useMemo(() => {
    let v = q.trim() ? hits || [] : all;
    if (cat !== 'all') v = v.filter((p) => (p.category || '').toLowerCase() === cat);
    if (brand !== 'all') v = v.filter((p) => p.brand === brand);
    if (score !== 'all') {
      const rule = SCORES.find((s) => s.id === score);
      if (rule) v = v.filter((p) => rule.test(Number(p.techScore) || 0));
    }
    v = [...v];
    if (sort === 'name') v.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else v.sort((a, b) => (b.techScore || 0) - (a.techScore || 0));
    return v;
  }, [all, hits, cat, brand, score, q, sort]);

  useEffect(() => { setShown(PAGE); }, [cat, brand, score, q, sort]);

  const busy = q.trim() ? searching : loading;
  const hasFilters = cat !== 'all' || brand !== 'all' || score !== 'all';
  function clearFilters() { setCat('all'); setBrand('all'); setScore('all'); }

  const sidebar = (
    <aside className={'cat-side' + (drawer ? ' open' : '')}>
      <div className="cat-side-head">
        <h3>{t('catalog.filters')}</h3>
        {hasFilters && (
          <button className="cat-side-clear" onClick={clearFilters}>{t('catalog.clearFilters')}</button>
        )}
        <button className="cat-side-x" onClick={() => setDrawer(false)} aria-label="✕">✕</button>
      </div>

      <div className="cat-fgroup">
        <h4>{t('catalog.category')}</h4>
        <button className={'cat-fopt' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}>
          {t('catalog.all')} <span>{all.length}</span>
        </button>
        {categories.map(([c, n]) => {
          const m = catMeta(c);
          return (
            <button key={c} className={'cat-fopt' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>
              {m.icon} {m.label} <span>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="cat-fgroup">
        <h4>{t('catalog.score')}</h4>
        <button className={'cat-fopt' + (score === 'all' ? ' on' : '')} onClick={() => setScore('all')}>
          {t('catalog.all')}
        </button>
        {SCORES.map((s) => (
          <button key={s.id} className={'cat-fopt' + (score === s.id ? ' on' : '')}
            onClick={() => setScore(s.id)}>
            ⚡ {t(s.key)}
          </button>
        ))}
      </div>

      {brands.length > 1 && (
        <div className="cat-fgroup">
          <h4>{t('catalog.brand')}</h4>
          <button className={'cat-fopt' + (brand === 'all' ? ' on' : '')} onClick={() => setBrand('all')}>
            {t('catalog.all')}
          </button>
          {brands.map(([b, n]) => (
            <button key={b} className={'cat-fopt' + (brand === b ? ' on' : '')} onClick={() => setBrand(b)}>
              {b} <span>{n}</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );

  return (
    <div className="catalog">
      <div className="cat-hero">
        <div className="container">
          <h1>{t('catalog.title')}</h1>
          <p>{t('catalog.subtitle')}</p>
          <div className="cat-search">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={t('catalog.searchPlaceholder')} autoComplete="off" />
            {q && <button className="cat-clear" onClick={() => setQ('')} aria-label={t('catalog.clear')}>✕</button>}
          </div>
        </div>
      </div>

      <div className="container cat-body">
        {sidebar}
        {drawer && <div className="cat-side-backdrop" onClick={() => setDrawer(false)} />}

        <div className="cat-main">
          <div className="cat-toolbar">
            <button className="cat-filter-btn" onClick={() => setDrawer(true)}>
              ☰ {t('catalog.filters')}
            </button>
            <span className="cat-count">
              {busy ? t('common.loading') : t('catalog.count', { n: view.length.toLocaleString() })}
            </span>
            <div className="cat-sort">
              {SORTS.map((s) => (
                <button key={s.id} className={sort === s.id ? 'active' : ''} onClick={() => setSort(s.id)}>
                  {t(s.key)}
                </button>
              ))}
            </div>
          </div>

          <div className="cat-grid">
            {busy
              ? Array.from({ length: 9 }).map((_, i) => <ProductCardSkeleton key={i} />)
              : view.slice(0, shown).map((p) => <ProductCard key={p.id} product={p} />)}
          </div>

          {!busy && view.length === 0 && (
            <div className="cat-empty">
              <div className="cat-empty-icon">🔍</div>
              <h3>{t('catalog.emptyTitle')}</h3>
              <p>{q.trim() ? t('catalog.emptySearch', { q: q.trim() }) : t('catalog.emptyCat')}</p>
            </div>
          )}

          {!busy && shown < view.length && (
            <div className="cat-more">
              <button className="btn btn-ghost btn-lg" onClick={() => setShown((s) => s + PAGE)}>
                {t('catalog.showMore', { n: (view.length - shown).toLocaleString() })}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
