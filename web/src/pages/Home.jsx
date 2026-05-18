import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getStats, loadAllProducts } from '../lib/typesense';
import { catMeta, formatCount, scoreClass, scoreLabel, keySpecChips, PLACEHOLDER_IMG } from '../lib/format';
import { useT } from '../i18n/index.jsx';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import './Home.css';

const TOOLS = [
  { to: '/compare', emoji: '⚖️', t: 'home.tCompare', d: 'home.tCompareD' },
  { to: '/link-analysis', emoji: '🔗', t: 'home.tLink', d: 'home.tLinkD' },
  { to: '/subscriptions', emoji: '📺', t: 'home.tSubs', d: 'home.tSubsD' },
  { to: '/quiz', emoji: '🎯', t: 'home.tQuiz', d: 'home.tQuizD' },
];

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
  const t = useT();
  const [stats, setStats] = useState({ total: 0, categories: 0, categoryCounts: [] });
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
    loadAllProducts((batch) => { setAll(batch); setLoading(false); })
      .then((full) => setAll(full))
      .catch(() => setLoading(false));
  }, []);

  function search(e) {
    e.preventDefault();
    const term = q.trim();
    nav(term ? `/catalog?q=${encodeURIComponent(term)}` : '/catalog');
  }

  const featured = useMemo(() => all.filter((p) => p.imageUrl).slice(0, 10), [all]);
  const popular = useMemo(() => all.slice(0, 12), [all]);
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
          <form className="h-search" onSubmit={search}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={t('home.searchPlaceholder')} autoComplete="off" />
            <button type="submit" className="btn btn-primary">{t('common.search')}</button>
          </form>
        </div>
      </section>

      {/* HERO ROW — featured carousel + categories */}
      <section className="container h-hero2">
        {loading ? <div className="h-feat skel" style={{ height: 340 }} /> : <Featured items={featured} t={t} />}
        <div className="h-cats-panel">
          <h3>{t('home.categories')}</h3>
          <div className="h-cats-grid">
            {stats.categoryCounts.slice(0, 10).map((c) => {
              const m = catMeta(c.value);
              return (
                <Link key={c.value} to={`/catalog?cat=${c.value}`} className="h-cat-tile">
                  <span className="h-cat-ic">{m.icon}</span>
                  <span className="h-cat-tx">
                    <b>{m.label}</b>
                    <small>{c.count}</small>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* POPULAR PRODUCTS */}
      <section className="container h-sec">
        <div className="h-sec-head">
          <h2>{t('home.popular')}</h2>
          <Link to="/catalog" className="h-sec-all">{t('common.seeAll')} →</Link>
        </div>
        <div className="card-grid">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : popular.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* CATEGORY SECTIONS */}
      {!loading && catSections.map((sec) => {
        const m = catMeta(sec.cat);
        if (!sec.products.length) return null;
        return (
          <section className="container h-sec" key={sec.cat}>
            <div className="h-sec-head">
              <h2>{m.icon} {m.label}</h2>
              <Link to={`/catalog?cat=${sec.cat}`} className="h-sec-all">{t('common.seeAll')} →</Link>
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
