import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getHomeFeed, searchProducts } from '../lib/typesense';
import { catMeta, scoreClass, scoreLabel, PLACEHOLDER_IMG } from '../lib/format';
import { saveSearchHistory } from '../lib/pbHistory';
import { useI18n } from '../i18n/index.jsx';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import AdSlot from '../components/AdSlot.jsx';
import { AD_SLOTS } from '../lib/ads';
import { useSeo, SITE_URL, DEFAULT_OG_IMAGE } from '../lib/seo';
import { getRecentProducts, getRecentCategories } from '../lib/recentViewed';
import './Home.css';

const CATEGORY_ORDER = [
  'smartphones', 'tablets', 'smartwatches', 'laptops', 'desktops',
  'speakers', 'soundbars', 'action_cameras', 'security_cameras', 'gaming_consoles',
  'headphones', 'monitors', 'gpus', 'cpus', 'motherboards', 'ram', 'powerbanks',
];

function StatItem({ n, l }) {
  return (
    <div className="stat">
      <div className="n"><span className="grad">{n}</span></div>
      <div className="l">{l}</div>
    </div>
  );
}

// A product section — title + optional "see all" + a rail / grid / list layout.
function Section({ title, products, loading, seeAllTo, t, layout = 'grid' }) {
  if (!loading && (!products || products.length === 0)) return null;
  const items = loading
    ? Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
    : products.map((p) => <ProductCard key={p.id} product={p} variant={layout === 'list' ? 'list' : 'card'} />);
  return (
    <>
      <div className="sec-head">
        <h2><span className="bar" /> {title}</h2>
        {seeAllTo && <Link to={seeAllTo} className="see-all">{t('common.seeAll')} →</Link>}
      </div>
      <div className={layout === 'rail' ? 'rail' : layout === 'list' ? 'h-trend-grid' : 'card-grid'}>
        {items}
      </div>
    </>
  );
}

export default function Home() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { t, lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const searchRef = useRef(null);

  const [feed, setFeed] = useState({ forYou: [], trending: [], newArrivals: [], categories: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [recent] = useState(() => getRecentProducts());

  const [q, setQ] = useState(() => params.get('q') || '');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [submitted, setSubmitted] = useState(() => (params.get('q') || '').trim());

  useSeo({
    title: `Qor AI — ${t('home.heroTitle')}`,
    description: t('seo.home'),
    path: '/',
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'Qor AI', url: `${SITE_URL}/`, logo: DEFAULT_OG_IMAGE },
        {
          '@type': 'WebSite', name: 'Qor AI', url: `${SITE_URL}/`,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${SITE_URL}/?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        },
      ],
    },
  });

  useEffect(() => {
    let live = true;
    getHomeFeed(getRecentCategories())
      .then((f) => { if (live) setFeed(f); })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const term = q.trim();
    let live = true;
    if (!term) { setSearchResults([]); setSearching(false); return () => { live = false; }; }
    setSearching(true);
    const tm = setTimeout(() => {
      searchProducts(term, 40)
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

  // Sync from the ?q query param so the header search works even when the
  // user is already on the home page (navigating to /?q=… won't remount).
  useEffect(() => {
    const qp = (params.get('q') || '').trim();
    setQ(qp);
    setSubmitted(qp);
  }, [params]);

  function search(e) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    saveSearchHistory(term);
    setSubmitted(term);
    setSuggestOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openProduct(product) {
    saveSearchHistory(q.trim(), product.id);
    setSuggestOpen(false);
    nav(`/product/${product.id}`);
  }

  function clearSearch() {
    setQ('');
    setSubmitted('');
    setSearchResults([]);
  }

  const categories = useMemo(() => {
    return [...(feed.categories || [])]
      .sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a.value);
        const bi = CATEGORY_ORDER.indexOf(b.value);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        return (b.count || 0) - (a.count || 0);
      })
      .slice(0, 8)
      .map((c) => ({ value: c.value, count: c.count || 0, meta: catMeta(c.value) }));
  }, [feed.categories]);

  const searchMode = submitted.length > 0;

  return (
    <div className="page">
      <div className="container">
        {/* HERO */}
        <section className="hero card glow" style={{ padding: 'clamp(26px,5vw,52px)' }}>
          <div className="hero-glow" />
          <div style={{ position: 'relative' }}>
            <span className="kicker">✨ <b>{L('AI-scored tech · instant comparison', 'AI puanlı teknoloji · anında karşılaştırma', 'KI-bewertete Technik · sofortiger Vergleich')}</b></span>
            <h1 style={{ marginTop: 18 }}>{t('home.heroTitle')}</h1>
            <p className="sub" style={{ marginTop: 14 }}>{t('home.heroSubFallback')}</p>

            {/* search */}
            <div className="h-search-wrap" ref={searchRef} style={{ maxWidth: 640, margin: '24px 0 0' }}>
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
                    <button type="button" className="h-suggest-item" key={p.id} onClick={() => openProduct(p)}>
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
            {searchMode && (
              <button className="h-clear" type="button" onClick={clearSearch} style={{ marginTop: 12 }}>
                {t('catalog.clear')}
              </button>
            )}

            {/* stats */}
            {feed.total > 0 && !searchMode && (
              <div className="row wrap" style={{ gap: 34, marginTop: 30 }}>
                <StatItem n={feed.total.toLocaleString(lang)} l={L('products', 'ürün', 'Produkte')} />
                <StatItem n={`${feed.categories.length}+`} l={L('categories', 'kategori', 'Kategorien')} />
                <StatItem n="3" l="TR · EN · DE" />
              </div>
            )}
          </div>
        </section>

        {/* SEARCH RESULTS */}
        {searchMode && (
          <>
            <div className="sec-head"><h2><span className="bar" /> {t('catalog.searchTag', { q: submitted })}</h2></div>
            {searching ? (
              <div className="card-grid">
                {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
              </div>
            ) : searchResults.length > 0 ? (
              <div className="card-grid">
                {searchResults.map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
            ) : (
              <div className="card pad" style={{ textAlign: 'center', color: 'var(--text-2)' }}>
                {t('catalog.emptySearch', { q: submitted })}
              </div>
            )}
          </>
        )}

        {!searchMode && (
          <>
            {/* CATEGORIES */}
            {categories.length > 0 && (
              <>
                <div className="sec-head">
                  <h2><span className="bar" /> {L('Categories', 'Kategoriler', 'Kategorien')}</h2>
                  <Link to="/category" className="see-all">{t('common.seeAll')} →</Link>
                </div>
                <div className="cat-grid">
                  {categories.map((c) => (
                    <Link key={c.value} to={`/category?cat=${encodeURIComponent(c.value)}`} className="cat-tile">
                      <span className="cat-ic" style={{ background: `linear-gradient(135deg, ${c.meta.color}, ${c.meta.color}cc)`, boxShadow: `0 8px 20px ${c.meta.color}33` }}>
                        {c.meta.icon}
                      </span>
                      <span className="cn">{c.meta.label}</span>
                      <span className="dim" style={{ fontSize: 11, fontWeight: 600 }}>{c.count.toLocaleString(lang)}</span>
                    </Link>
                  ))}
                </div>
              </>
            )}

            {/* FOR YOU */}
            <Section title={t('home.forYou')} products={feed.forYou} loading={loading} t={t} seeAllTo="/category" layout="rail" />

            {/* TRENDING */}
            <Section title={t('home.trendingToday')} products={feed.trending} loading={loading} t={t} layout="list" />

            <div style={{ marginTop: 24 }}><AdSlot slot={AD_SLOTS.home} /></div>

            {/* RECENTLY VIEWED */}
            {recent.length > 0 && (
              <Section title={t('home.recent')} products={recent} loading={false} t={t} layout="rail" />
            )}

            {/* NEW ARRIVALS */}
            <Section title={t('home.newArrivals')} products={feed.newArrivals} loading={loading} t={t} />
          </>
        )}
      </div>
    </div>
  );
}
