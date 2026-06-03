import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getHomeFeed, searchProducts } from '../lib/typesense';
import { catMeta } from '../lib/format';
import { saveSearchHistory } from '../lib/pbHistory';
import { useAuth } from '../lib/auth';
import { useI18n } from '../i18n/index.jsx';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import ProductImg from '../components/ProductImg.jsx';
import Gauge, { techColor } from '../components/Gauge.jsx';
import AdSlot from '../components/AdSlot.jsx';
import { AD_SLOTS } from '../lib/ads';
import { useSeo, SITE_URL, DEFAULT_OG_IMAGE } from '../lib/seo';
import { getRecentProducts, getRecentCategories } from '../lib/recentViewed';
import { productPath } from '../lib/routes';
import './Home.css';

function StatItem({ n, l }) {
  return (
    <div className="stat">
      <div className="n"><span className="grad">{n}</span></div>
      <div className="l">{l}</div>
    </div>
  );
}

// Hero spotlight — a mini product-detail teaser (design's right column).
function HeroSpotlight({ p, L, lang }) {
  const score = Number(p.techScore) || 0;
  const meta = catMeta(p.category);
  const price = Number(p.lowestPriceUSD) || 0;
  return (
    <Link to={productPath(p.id)} className="card glow" style={{ overflow: 'hidden', display: 'block' }}>
      <div style={{ padding: 18, position: 'relative' }}>
        {score > 0 && (
          <span className="gauge-badge" style={{ position: 'absolute', top: 26, right: 26, zIndex: 2 }}>
            <Gauge value={score} size={32} stroke={3} color={techColor(score)} fontSize={12} />
          </span>
        )}
        <div className="img-tile" style={{ aspectRatio: '4 / 3' }}>
          {p.imageUrl
            ? <ProductImg src={p.imageUrl} alt={p.name} size="full" eager />
            : <div className="ph"><span style={{ fontSize: 44 }}>{meta.icon}</span><span className="lbl">{p.brand || meta.label}</span></div>}
        </div>
      </div>
      <div style={{ padding: '4px 18px 18px' }}>
        {p.brand && <div className="brand-k" style={{ color: 'var(--accent)' }}>{p.brand}</div>}
        <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.3, margin: '4px 0 12px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.name}</div>
        {price > 0 && (
          <div className="row" style={{ gap: 8 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>${price.toLocaleString(lang)}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

function SearchSuggestionList({ products, searching, onOpen, L }) {
  if (searching) {
    return (
      <div className="hero-suggest-panel">
        <div className="hero-suggest-state">{L('Searching products…', 'Ürünler aranıyor…', 'Produkte werden gesucht…')}</div>
      </div>
    );
  }
  if (!products.length) {
    return (
      <div className="hero-suggest-panel">
        <div className="hero-suggest-state">{L('No matching products yet.', 'Henüz eşleşen ürün yok.', 'Noch keine passenden Produkte.')}</div>
      </div>
    );
  }
  return (
    <div className="hero-suggest-panel">
      {products.slice(0, 7).map((p) => {
        const score = Number(p.techScore) || 0;
        return (
          <button key={p.id} type="button" className="hero-suggest-row"
            onMouseDown={(e) => { e.preventDefault(); onOpen(p); }}>
            <span className="hero-suggest-img">
              {p.imageUrl
                ? <ProductImg src={p.imageUrl} alt={p.name} size="thumb" />
                : <span>{catMeta(p.category).icon}</span>}
            </span>
            <span className="hero-suggest-copy">
              <b>{p.name}</b>
              <small>{p.brand || catMeta(p.category).label}</small>
            </span>
            {score > 0 && <span className="hero-suggest-score" style={{ color: techColor(score) }}>{Math.round(score)}</span>}
          </button>
        );
      })}
    </div>
  );
}

// A product section — title + optional "see all" + a rail / grid / list layout.
function Section({ title, products, loading, seeAllTo, t, layout = 'grid', dense = false }) {
  if (!loading && (!products || products.length === 0)) return null;
  const items = loading
    ? Array.from({ length: dense ? 21 : 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
    : products.map((p) => <ProductCard key={p.id} product={p} variant={layout === 'list' ? 'list' : 'card'} />);
  const cls = layout === 'rail' ? 'rail' : layout === 'list' ? 'h-trend-grid' : `card-grid${dense ? ' card-grid-compact' : ''}`;
  return (
    <>
      <div className="sec-head">
        <h2><span className="bar" /> {title}</h2>
        {seeAllTo && <Link to={seeAllTo} className="see-all">{t('common.seeAll')} →</Link>}
      </div>
      <div className={cls}>
        {items}
      </div>
    </>
  );
}

export default function Home() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const searchRef = useRef(null);

  // Time-of-day greeting for signed-in users (app parity).
  const hour = new Date().getHours();
  const greetWord = hour < 6 ? L('Good night', 'İyi geceler', 'Gute Nacht')
    : hour < 12 ? L('Good morning', 'Günaydın', 'Guten Morgen')
      : hour < 18 ? L('Good afternoon', 'İyi günler', 'Guten Tag')
        : L('Good evening', 'İyi akşamlar', 'Guten Abend');
  const displayName = user ? (user.name || user.email?.split('@')[0] || '') : '';

  const [feed, setFeed] = useState({ forYou: [], trending: [], newArrivals: [], spotlight: null, categories: [], total: 0 });
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
    nav(productPath(product.id));
  }

  function clearSearch() {
    setQ('');
    setSubmitted('');
    setSearchResults([]);
  }

  // Spotlight = the highest tech-scored smartphone from Typesense. If that
  // query ever fails, fall back to the best image-backed product from the feed.
  const spotlight = useMemo(() => {
    if (feed.spotlight) return feed.spotlight;
    const pool = [...(feed.forYou || []), ...(feed.trending || []), ...(feed.newArrivals || [])];
    if (!pool.length) return null;
    const FLAG = ['smartphones', 'laptops', 'tablets', 'gpus', 'headphones', 'smartwatches', 'cpus', 'monitors', 'tvs', 'cameras'];
    const best = (arr) => arr.reduce((b, p) => ((Number(p.techScore) || 0) > (Number(b.techScore) || 0) ? p : b), arr[0]);
    const flagship = pool.filter((p) => FLAG.includes(String(p.category || '').toLowerCase()) && (p.imageUrl || '').length > 0);
    if (flagship.length) return best(flagship);
    const withImg = pool.filter((p) => (p.imageUrl || '').length > 0);
    return best(withImg.length ? withImg : pool);
  }, [feed]);

  const searchMode = submitted.length > 0;

  return (
    <div className="page">
      <div className="container">
        {/* HERO — two columns: copy + spotlight (design parity) */}
        <section className="hero card glow" style={{ padding: 'clamp(28px,5vw,56px)' }}>
          <div className="hero-glow" />
          <div className="between wrap" style={{ position: 'relative', gap: 40, alignItems: 'center' }}>
            <div style={{ flex: '1 1 460px', minWidth: 0 }}>
              {user && (
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 12 }}>
                  {greetWord}, {displayName} 👋
                </div>
              )}
              <h1>
                {L('Compare anything.', 'Her şeyi karşılaştır.', 'Vergleiche alles.')}<br />
                <span className="grad">{L('Buy with confidence.', 'Güvenle satın al.', 'Kaufe mit Vertrauen.')}</span>
              </h1>
              <p className="sub" style={{ marginTop: 16 }}>
                {L(
                  'Real products scored by AI. Compare specs side by side, paste any link, and find the product that fits you.',
                  'Gerçek ürünler yapay zekâ ile puanlandı. Özellikleri yan yana karşılaştır, herhangi bir linki yapıştır ve ihtiyacına en uygun ürünü bul.',
                  'Echte Produkte mit KI bewertet. Vergleiche Specs, füge einen Link ein und finde das passende Produkt.',
                )}
              </p>

              {/* product search */}
              <div className="hero-search-wrap" ref={searchRef}>
                <form className="searchbox hero-search" onSubmit={search}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input value={q}
                    onFocus={() => { if (q.trim()) setSuggestOpen(true); }}
                    onChange={(e) => {
                      const value = e.target.value;
                      setQ(value);
                      setSubmitted('');
                      setSuggestOpen(Boolean(value.trim()));
                    }}
                    placeholder={L('Search products by name…', 'Ürün adıyla ara…', 'Produkt nach Name suchen…')} autoComplete="off" />
                  <button type="submit" className="btn btn-grad">{t('common.search')}</button>
                </form>
                {suggestOpen && q.trim() && (
                  <SearchSuggestionList products={searchResults} searching={searching} onOpen={openProduct} L={L} />
                )}
              </div>
            </div>

            {/* spotlight — highest-scored product from the live feed */}
            {spotlight && (
              <div style={{ flex: '0 1 360px', width: '100%', maxWidth: 380 }}>
                <HeroSpotlight p={spotlight} L={L} lang={lang} />
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
            {/* FOR YOU */}
            <Section title={t('home.forYou')} products={feed.forYou} loading={loading} t={t} dense />

            {/* TRENDING */}
            <Section title={t('home.trendingToday')} products={feed.trending} loading={loading} t={t} layout="list" />

            <div style={{ marginTop: 24 }}><AdSlot slot={AD_SLOTS.home} /></div>

            {/* RECENTLY VIEWED */}
            {recent.length > 0 && (
              <Section title={t('home.recent')} products={recent} loading={false} t={t} layout="rail" />
            )}

            {/* NEW ARRIVALS */}
            <Section title={t('home.newArrivals')} products={feed.newArrivals} loading={loading} t={t} dense />
          </>
        )}
      </div>
    </div>
  );
}
