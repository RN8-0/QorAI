import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getHomeFeed, searchProducts } from '../lib/typesense';
import { catMeta, categoryLabel } from '../lib/format';
import { saveSearchHistory } from '../lib/pbHistory';
import { useAuth } from '../lib/auth';
import { useI18n } from '../i18n/index.jsx';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import ProductImg from '../components/ProductImg.jsx';
import { techColor } from '../components/Gauge.jsx';
import AdSlot from '../components/AdSlot.jsx';
import { AD_SLOTS } from '../lib/ads';
import { useSeo, SITE_URL, DEFAULT_OG_IMAGE } from '../lib/seo';
import { getRecentProducts, getRecentCategories } from '../lib/recentViewed';
import { aiUserProfile } from '../lib/qorCoins';
import { productPath } from '../lib/routes';

// Onboarding category slugs whose Typesense `category` value differs, so the
// home "For You" feed actually finds products for them. Mirrors the quiz visuals.
const FEED_CAT_ALIAS = {
  gpus: 'graphics_cards', consoles: 'gaming_consoles', 'media-players': 'media_players',
  'smart-rings': 'smart_rings', 'action-cameras': 'dashcams', 'security-cameras': 'ip_cameras',
  'ip-cameras': 'ip_cameras', 'vr-headsets': 'vr_headsets', 'robot-vacuums': 'robot_vacuums',
  'e-readers': 'e_readers', cases: 'pc_cases', coolers: 'cpu_coolers', speakers: 'audio_systems',
  soundbars: 'audio_systems', cameras: 'camera_lenses', lenses: 'camera_lenses', tripods: 'gimbals',
};
const feedCategory = (c) => FEED_CAT_ALIAS[c] || c;
import Reveal from '../components/Reveal.jsx';
import './Home.css';

function StatItem({ n, l }) {
  return (
    <div className="stat">
      <div className="n"><span className="grad">{n}</span></div>
      <div className="l">{l}</div>
    </div>
  );
}

function HeroSpotlight({ products, lang, L }) {
  const safe = (products || []).filter(Boolean).slice(0, 10);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (safe.length <= 1) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % safe.length), 4200);
    return () => clearInterval(id);
  }, [safe.length]);

  if (!safe.length) return null;
  const active = index % safe.length;
  return (
    <div className="hero-carousel" aria-label={L('Top category picks', 'Popüler kategori seçkisi', 'Top-Kategorie-Auswahl')}>
      <div className="hero-carousel-head">
        <span>{L('Top categories', 'Popüler kategoriler', 'Top-Kategorien')}</span>
        <b>{categoryLabel(safe[active]?.category, lang)}</b>
      </div>
      <div className="hero-carousel-viewport">
        <div className="hero-carousel-track" style={{ transform: `translateX(-${active * 100}%)` }}>
          {safe.map((p) => (
            <div className="hero-carousel-slide" key={p.id}>
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      </div>
      {safe.length > 1 && (
        <div className="hero-carousel-dots" aria-hidden="true">
          {safe.map((p, i) => (
            <button key={p.id} type="button" className={i === active ? 'on' : ''}
              onClick={() => setIndex(i)} tabIndex={-1} />
          ))}
        </div>
      )}
    </div>
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
function fullRows(products, columns = 3) {
  const list = Array.isArray(products) ? products.filter(Boolean) : [];
  const keep = Math.floor(list.length / columns) * columns;
  return keep >= columns ? list.slice(0, keep) : [];
}

function Section({ title, products, loading, seeAllTo, t, dense = false }) {
  const visibleProducts = fullRows(products);
  if (!loading && visibleProducts.length === 0) return null;
  const items = loading
    ? Array.from({ length: dense ? 21 : 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
    : visibleProducts.map((p) => <ProductCard key={p.id} product={p} />);
  const cls = `card-grid${dense ? ' card-grid-compact' : ''}`;
  return (
    <Reveal>
      <div className="sec-head">
        <h2><span className="bar" /> {title}</h2>
        {seeAllTo && <Link to={seeAllTo} className="see-all">{t('common.seeAll')} →</Link>}
      </div>
      <div className={cls}>
        {items}
      </div>
    </Reveal>
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

  const [feed, setFeed] = useState({ forYou: [], trending: [], newArrivals: [], spotlight: null, heroPicks: [], categories: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState(() => getRecentProducts());

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
        { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: 'Qor AI', url: `${SITE_URL}/`, logo: DEFAULT_OG_IMAGE },
        {
          '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: 'Qor AI', url: `${SITE_URL}/`,
          publisher: { '@id': `${SITE_URL}/#organization` },
          potentialAction: {
            '@type': 'SearchAction',
            target: `${SITE_URL}/?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        },
      ],
    },
  });

  // "For You" must reflect THIS account, not just this browser. Recent
  // categories live in shared localStorage (so a second account on the same
  // browser saw the first account's feed) — lead with the signed-in user's
  // onboarding profile (rebuilt from the persisted profileVector) so the feed
  // is personalized and refreshes when the account changes.
  // Personalization key as a STABLE STRING. The auth context hands back a fresh
  // `user` object (and a new profileVector reference) on every tab focus even
  // when nothing changed — depending on that object made the feed refetch and
  // visibly "reload" each time the user came back to the tab. Keying on the
  // derived category string means we only refetch when the categories change.
  const feedKey = useMemo(() => {
    const prof = aiUserProfile(user);
    const profileCats = [prof.primaryCategory, ...(prof.interestCategories || [])]
      .filter(Boolean)
      .map(feedCategory);
    const prefCats = [...new Set([...profileCats, ...getRecentCategories().map(feedCategory)])];
    return prefCats.join('|');
  }, [user?.id, user?.profileVector]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const prefCats = feedKey ? feedKey.split('|') : [];
    getHomeFeed(prefCats)
      .then((f) => { if (live) setFeed(f); })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [feedKey]);

  useEffect(() => {
    const refreshRecent = () => setRecent(getRecentProducts());
    window.addEventListener('focus', refreshRecent);
    window.addEventListener('storage', refreshRecent);
    document.addEventListener('visibilitychange', refreshRecent);
    return () => {
      window.removeEventListener('focus', refreshRecent);
      window.removeEventListener('storage', refreshRecent);
      document.removeEventListener('visibilitychange', refreshRecent);
    };
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
    nav(productPath(product));
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
  const heroProducts = feed.heroPicks?.length
    ? feed.heroPicks
    : spotlight
      ? [spotlight]
      : [];

  return (
    <div className="page">
      <div className="container">
        {/* HERO — two columns: copy + spotlight (design parity) */}
        <section className="hero card glow aurora" style={{ padding: 'clamp(28px,5vw,56px)' }}>
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
                <span className="grad grad-anim">{L('Buy with confidence.', 'Güvenle satın al.', 'Kaufe mit Vertrauen.')}</span>
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
                  <button type="submit" className="btn btn-grad btn-shine">{t('common.search')}</button>
                </form>
                {suggestOpen && q.trim() && (
                  <SearchSuggestionList products={searchResults} searching={searching} onOpen={openProduct} L={L} />
                )}
              </div>
            </div>

            {/* spotlight — highest-scored product from the live feed */}
            {heroProducts.length > 0 && (
              <div style={{ flex: '0 1 360px', width: '100%', maxWidth: 380 }}>
                <HeroSpotlight products={heroProducts} lang={lang} L={L} />
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
            <Section title={t('home.trendingToday')} products={feed.trending} loading={loading} t={t} seeAllTo="/category?cat=smartphones&sort=trend" />

            <div style={{ marginTop: 24 }}><AdSlot slot={AD_SLOTS.home} /></div>

            {/* RECENTLY VIEWED */}
            {recent.length > 0 && (
              <Section title={t('home.recent')} products={recent} loading={false} t={t} />
            )}

            {/* NEW ARRIVALS */}
            <Section title={t('home.newArrivals')} products={feed.newArrivals} loading={loading} t={t} dense />
          </>
        )}
      </div>
    </div>
  );
}
