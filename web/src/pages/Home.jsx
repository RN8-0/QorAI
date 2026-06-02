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

// One product section — title, optional "see all", responsive card grid.
function Section({ title, products, loading, seeAllTo, t }) {
  if (!loading && (!products || products.length === 0)) return null;
  return (
    <section className="container h-sec">
      <div className="h-sec-head">
        <h2>{title}</h2>
        {seeAllTo && (
          <Link to={seeAllTo} className="h-sec-all">{t('common.seeAll')} →</Link>
        )}
      </div>
      <div className="card-grid">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
          : products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
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

  // Home feed — same sections the mobile app's home screen shows.
  useEffect(() => {
    let live = true;
    getHomeFeed(getRecentCategories())
      .then((f) => { if (live) setFeed(f); })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  // Live typeahead search.
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

  // Top categories as a 4×3 grid (mirrors the app's category screen).
  const categories = useMemo(() => {
    return [...(feed.categories || [])]
      .sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a.value);
        const bi = CATEGORY_ORDER.indexOf(b.value);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        return (b.count || 0) - (a.count || 0);
      })
      .slice(0, 18)
      .map((c) => ({ value: c.value, meta: catMeta(c.value) }));
  }, [feed.categories]);

  const searchMode = submitted.length > 0;

  return (
    <div className="home">
      {/* SEARCH STRIP */}
      <section className="h-searchbar">
        <div className="container">
          <h1>{t('home.heroTitle')}</h1>
          <p>{t('home.heroSubFallback')}</p>
          {feed.total > 0 && (
            <div className="h-stats">
              <span><b>{feed.total.toLocaleString(lang)}</b> {L('products', 'ürün', 'Produkte')}</span>
              <span className="h-stats-dot" />
              <span><b>{feed.categories.length}</b> {L('categories', 'kategori', 'Kategorien')}</span>
              <span className="h-stats-dot" />
              <span><b>AI</b> {L('scored & ranked', 'puanlı & sıralı', 'bewertet')}</span>
            </div>
          )}
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
          {searchMode && (
            <button className="h-clear" type="button" onClick={clearSearch}>
              {t('catalog.clear')}
            </button>
          )}
        </div>
      </section>

      {/* SEARCH RESULTS */}
      {searchMode && (
        <section className="container h-sec h-results">
          <div className="h-sec-head">
            <h2>{t('catalog.searchTag', { q: submitted })}</h2>
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
            <div className="h-empty">{t('catalog.emptySearch', { q: submitted })}</div>
          )}
        </section>
      )}

      {!searchMode && (
        <>
          {/* Categories now live in the header mega-menu — the home page leads
              straight into curated product sections (versus-style). */}

          {/* FOR YOU */}
          <Section title={t('home.forYou')} products={feed.forYou} loading={loading} t={t} />

          {/* TRENDING TODAY */}
          <Section title={t('home.trendingToday')} products={feed.trending} loading={loading} t={t} />

          <AdSlot slot={AD_SLOTS.home} />

          {/* RECENTLY VIEWED */}
          {recent.length > 0 && (
            <Section title={t('home.recent')} products={recent} loading={false} t={t} />
          )}

          {/* NEW ARRIVALS */}
          <Section title={t('home.newArrivals')} products={feed.newArrivals} loading={loading} t={t} />
        </>
      )}
    </div>
  );
}
