import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getStats, loadAllProducts } from '../lib/typesense';
import { catMeta, formatCount } from '../lib/format';
import { useT } from '../i18n/index.jsx';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import './Home.css';

const TOOLS = [
  { to: '/compare', emoji: '⚖️', t: 'home.tCompare', d: 'home.tCompareD' },
  { to: '/ai-chat', emoji: '💬', t: 'home.tAi', d: 'home.tAiD' },
  { to: '/pc-builder', emoji: '🖥️', t: 'home.tPc', d: 'home.tPcD' },
  { to: '/link-analysis', emoji: '🔗', t: 'home.tLink', d: 'home.tLinkD' },
  { to: '/subscriptions', emoji: '📺', t: 'home.tSubs', d: 'home.tSubsD' },
  { to: '/quiz', emoji: '🎯', t: 'home.tQuiz', d: 'home.tQuizD' },
];

export default function Home() {
  const nav = useNavigate();
  const t = useT();
  const [stats, setStats] = useState({ total: 0, categories: 0, categoryCounts: [] });
  const [popular, setPopular] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
    loadAllProducts((batch) => {
      setPopular(batch.slice(0, 12));
      setTrending(
        [...batch].sort((a, b) => (b.trendScore || 0) - (a.trendScore || 0)).slice(0, 6),
      );
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  function search(e) {
    e.preventDefault();
    const term = q.trim();
    nav(term ? `/catalog?q=${encodeURIComponent(term)}` : '/catalog');
  }

  return (
    <div className="home">
      <section className="h-hero">
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
          <div className="h-cats">
            {stats.categoryCounts.slice(0, 8).map((c) => {
              const m = catMeta(c.value);
              return (
                <Link key={c.value} to={`/catalog?cat=${c.value}`} className="h-cat">
                  <span className="h-cat-icon">{m.icon}</span>
                  <span className="h-cat-name">{m.label}</span>
                  <span className="h-cat-count">{c.count}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

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

      {!loading && trending.length > 0 && (
        <section className="container h-sec">
          <div className="h-sec-head">
            <h2>{t('home.trending')}</h2>
            <Link to="/catalog" className="h-sec-all">{t('common.seeAll')} →</Link>
          </div>
          <div className="card-grid">
            {trending.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

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
