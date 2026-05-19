import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getStats, loadAllProducts, searchProducts } from '../lib/typesense';
import { catMeta, formatCount, scoreClass, scoreLabel, keySpecChips, PLACEHOLDER_IMG } from '../lib/format';
import { saveSearchHistory } from '../lib/pbHistory';
import { useT } from '../i18n/index.jsx';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import './Home.css';

const TOOLS = [
  { to: '/compare', emoji: '⚖️', t: 'home.tCompare', d: 'home.tCompareD' },
  { to: '/link-analysis', emoji: '🔗', t: 'home.tLink', d: 'home.tLinkD' },
  { to: '/subscriptions', emoji: '📺', t: 'home.tSubs', d: 'home.tSubsD' },
  { to: '/quiz', emoji: '🎯', t: 'home.tQuiz', d: 'home.tQuizD' },
];

function categoryGroup(cat, label) {
  const s = `${cat || ''} ${label || ''}`.toLowerCase();
  if (/(smart|phone|tablet|watch|headphone|earbud|wearable)/.test(s)) return 'mobile';
  if (/(laptop|desktop|monitor|printer|scanner|all-in-one|computer)/.test(s)) return 'computers';
  if (/(processor|motherboard|graphics|ram|ssd|hard|psu|case|cooler|fan|thermal)/.test(s)) return 'components';
  if (/(mouse|mice|keyboard|gamepad|speaker|microphone|webcam|accessor)/.test(s)) return 'peripherals';
  if (/(network|router|modem|adapter|switch|wi-fi|wifi)/.test(s)) return 'network';
  return 'other';
}

// ─── Auto-rotating featured carousel ─────────────────────────────
function Featured({ items, t }) {
  const [idx, setIdx] = useState(0);
  const n = items.length;

  useEffect(() => {
    if (n < 2) return;
    const tm = setInterval(() => setIdx((i) => (i + 1) % n), 5000);
    return () => clearInterval(tm);
  }, [n]);

  if (!n) return <div className="h-feat skel" style={{ height: 340 }} />;

  return (
    <div className="h-feat">
      <div className="h-feat-track" style={{ transform: `translateX(-${idx * 100}%)` }}>
        {items.map((p) => {
          const meta = catMeta(p.category);
          const chips = keySpecChips(p).slice(0, 4);
          return (
            <Link to={`/product/${p.id}`} className="h-feat-slide" key={p.id}>
              <div className="h-feat-img">
                <img src={p.imageUrl || PLACEHOLDER_IMG} alt={p.name}
                  onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMG; }} />
              </div>
              <div className="h-feat-info">
                <span className="h-feat-tag">⭐ {t('home.featured')}</span>
                {p.brand && <div className="h-feat-brand">{p.brand}</div>}
                <h3 className="h-feat-name">{p.name}</h3>
                <div className="h-feat-meta">
                  <span className={`score ${scoreClass(p.techScore)}`}>⚡ {scoreLabel(p.techScore)}</span>
                  <span className="h-feat-cat">{meta.icon} {meta.label}</span>
                </div>
                {chips.length > 0 && (
                  <div className="h-feat-specs">
                    {chips.map((c) => (
                      <span key={c.labelKey}><b>{c.value}</b> {t(c.labelKey)}</span>
                    ))}
                  </div>
                )}
                <span className="btn btn-primary h-feat-btn">{t('home.view')} →</span>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="h-feat-dots">
        {items.map((_, i) => (
          <button key={i} className={i === idx ? 'on' : ''}
            onClick={() => setIdx(i)} aria-label={`${i + 1}`} />
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const t = useT();
  const searchRef = useRef(null);
  const [stats, setStats] = useState({ total: 0, categories: 0, categoryCounts: [] });
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(() => params.get('q') || '');
  const [activeCat, setActiveCat] = useState(() => params.get('cat') || '');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);

  useEffect(() => {
    setQ(params.get('q') || '');
    setActiveCat(params.get('cat') || '');
  }, [params]);

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
    loadAllProducts((batch) => { setAll(batch); setLoading(false); })
      .then((full) => setAll(full))
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const term = q.trim();
    let live = true;
    if (!term) {
      setSearchResults([]);
      setSearching(false);
      return () => { live = false; };
    }
    setSearching(true);
    const tm = setTimeout(() => {
      searchProducts(term, 60)
        .then((res) => { if (live) setSearchResults(res); })
        .catch(() => { if (live) setSearchResults([]); })
        .finally(() => { if (live) setSearching(false); });
    }, 220);
    return () => { live = false; clearTimeout(tm); };
  }, [q]);

  useEffect(() => {
    const close = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSuggestOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function setHomeFilters(nextQ, nextCat, replace = false) {
    const next = new URLSearchParams();
    const term = (nextQ || '').trim();
    if (term) next.set('q', term);
    if (nextCat) next.set('cat', nextCat);
    setParams(next, { replace });
  }

  function search(e) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    saveSearchHistory(term);
    setActiveCat('');
    setHomeFilters(term, '', false);
    setSuggestOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openProduct(product) {
    saveSearchHistory(q.trim(), product.id);
    setSuggestOpen(false);
    nav(`/product/${product.id}`);
  }

  function pickCategory(cat) {
    setQ('');
    setActiveCat(cat);
    setHomeFilters('', cat, false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearFilters() {
    setQ('');
    setActiveCat('');
    setSearchResults([]);
    setHomeFilters('', '', false);
  }

  const featured = useMemo(() => all.filter((p) => p.imageUrl).slice(0, 10), [all]);
  const popular = useMemo(() => all.slice(0, 12), [all]);
  const groupedCategories = useMemo(() => {
    const map = new Map();
    stats.categoryCounts.forEach((c) => {
      const m = catMeta(c.value);
      const group = categoryGroup(c.value, m.label);
      if (!map.has(group)) map.set(group, []);
      map.get(group).push({ ...c, meta: m });
    });
    const order = ['mobile', 'computers', 'components', 'peripherals', 'network', 'other'];
    return order
      .filter((g) => map.has(g))
      .map((g) => [g, map.get(g).sort((a, b) => b.count - a.count)]);
  }, [stats.categoryCounts]);
  const activeCategoryProducts = useMemo(() => {
    if (!activeCat) return [];
    return all.filter((p) => (p.category || '').toLowerCase() === activeCat.toLowerCase());
  }, [all, activeCat]);
  const resultMode = Boolean(activeCat);
  const resultProducts = activeCategoryProducts;
  const resultTitle = activeCat
      ? catMeta(activeCat).label
      : '';
  const queryTerm = (params.get('q') || '').trim();
  const searchMode = queryTerm.length > 0;
  // Category sections — top 3 categories with their best products.
  const catSections = useMemo(() => {
    return stats.categoryCounts.slice(0, 3).map((c) => ({
      cat: c.value,
      count: c.count,
      products: all.filter((p) => (p.category || '').toLowerCase() === c.value).slice(0, 8),
    }));
  }, [stats, all]);

  return (
    <div className="home">
      {/* SEARCH STRIP */}
      <section className="h-searchbar">
        <div className="container">
          <h1>{t('home.heroTitle')}</h1>
          <p>{stats.total
            ? t('home.heroSub', { count: formatCount(stats.total) })
            : t('home.heroSubFallback')}</p>
          <div className="h-search-wrap" ref={searchRef}>
            <form className="h-search" onSubmit={search}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input value={q}
                onChange={(e) => { setQ(e.target.value); setSuggestOpen(true); }}
                onFocus={() => setSuggestOpen(true)}
                placeholder={t('home.searchPlaceholder')} autoComplete="off" />
              <button type="submit" className="btn btn-primary">{t('common.search')}</button>
            </form>
            {suggestOpen && q.trim().length > 0 && (
              <div className="h-suggest">
                {searching && <div className="h-suggest-state">{t('common.loading')}</div>}
                {!searching && searchResults.slice(0, 8).map((p) => (
                  <button type="button" className="h-suggest-item" key={p.id}
                    onClick={() => openProduct(p)}>
                    <img src={p.imageUrl || PLACEHOLDER_IMG} alt=""
                      onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMG; }} />
                    <span>
                      {p.brand && <small>{p.brand}</small>}
                      <b>{p.name}</b>
                    </span>
                    <i className={`score ${scoreClass(p.techScore)}`}>⚡ {scoreLabel(p.techScore)}</i>
                  </button>
                ))}
                {!searching && searchResults.length === 0 && (
                  <div className="h-suggest-state">{t('catalog.emptySearch', { q: q.trim() })}</div>
                )}
              </div>
            )}
          </div>
          {(resultMode || searchMode) && (
            <button className="h-clear" type="button" onClick={clearFilters}>
              {t('catalog.clear')}
            </button>
          )}
        </div>
      </section>

      {/* SEARCH RESULTS GRID */}
      {searchMode && (
        <section className="container h-sec h-results">
          <div className="h-sec-head">
            <h2>{t('catalog.searchTag', { q: queryTerm })}</h2>
            {!searching && (
              <span className="h-result-count">
                {t('catalog.count', { n: searchResults.length.toLocaleString() })}
              </span>
            )}
          </div>
          {searching ? (
            <div className="card-grid">
              {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          ) : searchResults.length > 0 ? (
            <div className="card-grid">
              {searchResults.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          ) : (
            <div className="h-empty">{t('catalog.emptySearch', { q: queryTerm })}</div>
          )}
        </section>
      )}

      {/* HERO ROW — featured carousel + categories */}
      {!searchMode && (
      <section className="container h-hero2">
        {loading ? <div className="h-feat skel" style={{ height: 340 }} /> : <Featured items={featured} t={t} />}
        <div className="h-cats-panel">
          <div className="h-cats-head">
            <h3>{t('home.categories')}</h3>
            <button type="button" onClick={clearFilters}>{t('catalog.all')}</button>
          </div>
          <div className="h-cat-groups">
            {groupedCategories.map(([group, items]) => (
              <div className="h-cat-group" key={group}>
                <div className="h-cat-group-title">{t(`home.group.${group}`)}</div>
                <div className="h-cats-grid">
                  {items.map((c) => (
                    <button key={c.value} type="button"
                      onClick={() => pickCategory(c.value)}
                      className={'h-cat-tile' + (activeCat === c.value ? ' active' : '')}>
                      <span className="h-cat-ic">{c.meta.icon}</span>
                      <span className="h-cat-tx">
                        <b>{c.meta.label}</b>
                        <small>{c.count}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {resultMode && (
        <section className="container h-sec h-results">
          <div className="h-sec-head">
            <h2>{resultTitle}</h2>
            <span className="h-result-count">
              {t('catalog.count', { n: resultProducts.length.toLocaleString() })}
            </span>
          </div>
          <div className="card-grid">
            {resultProducts.slice(0, 24).map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
          {resultProducts.length === 0 && (
            <div className="h-empty">{t('catalog.emptyCat')}</div>
          )}
        </section>
      )}

      {/* POPULAR PRODUCTS */}
      {!searchMode && (
      <section className="container h-sec">
        <div className="h-sec-head">
          <h2>{t('home.popular')}</h2>
          <button type="button" className="h-sec-all" onClick={clearFilters}>{t('common.seeAll')} →</button>
        </div>
        <div className="card-grid">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : popular.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>
      )}

      {/* CATEGORY SECTIONS */}
      {!loading && !searchMode && catSections.map((sec) => {
        const m = catMeta(sec.cat);
        if (!sec.products.length) return null;
        return (
          <section className="container h-sec" key={sec.cat}>
            <div className="h-sec-head">
              <h2>{m.icon} {m.label}</h2>
              <button type="button" className="h-sec-all" onClick={() => pickCategory(sec.cat)}>{t('common.seeAll')} →</button>
            </div>
            <div className="card-grid">
              {sec.products.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        );
      })}

      {/* TOOLS */}
      <section className="container h-sec">
        <div className="h-sec-head"><h2>{t('home.tools')}</h2></div>
        <div className="h-tools">
          {TOOLS.map((tool) => (
            <Link key={tool.to} to={tool.to} className="h-tool">
              <b>{tool.emoji} {t(tool.t)}</b>
              <span>{t(tool.d)}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
