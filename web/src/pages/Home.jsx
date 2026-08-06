import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getHomeFeedCached, peekHomeFeed, homeFeedSignature, searchProducts, enrichThinCards } from '../lib/typesense';
import { catMeta, categoryLabel } from '../lib/format';
import { categoryPath } from '../lib/routes';
import { saveSearchHistory, readSearchHistory } from '../lib/pbHistory';
import { useAuth } from '../lib/auth';
import { useI18n } from '../i18n/index.jsx';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import ProductImg from '../components/ProductImg.jsx';
import { techColor } from '../components/Gauge.jsx';
import AdSlot from '../components/AdSlot.jsx';
import { AD_SLOTS } from '../lib/ads';
import { useSeo, SITE_URL, DEFAULT_OG_IMAGE, hreflangAlternates } from '../lib/seo';
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

// ── Home feed instant-paint cache ───────────────────────────────────────────
// Stale-while-revalidate: a refresh or return visit paints the last feed snapshot
// immediately instead of blocking on a fresh Typesense round-trip, so cards appear
// on the first frame on every device. We ALWAYS refetch in the background, so the
// cache only affects perceived speed, never correctness.
//
// Önbelleğin SAHİBİ artık lib/typesense.js (peekHomeFeed + getHomeFeedCached).
// Burada ikinci bir localStorage kopyası tutuluyordu: aynı akış iki ayrı yere,
// her yüklemede birkaç kez serileştiriliyordu ve anlık görüntü 733 KB'a çıkmıştı.
const EMPTY_FEED = { categorySections: [], forYou: [], trending: [], newArrivals: [], spotlight: null, heroPicks: [], categories: [], total: 0 };

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

// Google-style recent searches — shown when the search box is focused but empty.
// Pulls from the signed-in user's shared searchHistory (same field the app writes).
function RecentSearchList({ items, onPick, L }) {
  if (!items.length) return null;
  return (
    <div className="hero-suggest-panel">
      <div className="hero-recent-head">{L('Recent searches', 'Son aramalar', 'Letzte Suchen')}</div>
      {items.map((s, i) => (
        <button key={`${s.query}-${i}`} type="button" className="hero-suggest-row hero-recent-row"
          onMouseDown={(e) => { e.preventDefault(); onPick(s.query); }}>
          <span className="hero-recent-ic">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
            </svg>
          </span>
          <span className="hero-recent-q">{s.query}</span>
        </button>
      ))}
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

  // "For You" must reflect THIS account, not just this browser. Recent categories
  // live in shared localStorage (so a second account on the same browser saw the
  // first account's feed) — lead with the signed-in user's onboarding profile
  // (rebuilt from the persisted profileVector) so the feed is personalized and
  // refreshes when the account changes. Keyed as a STABLE STRING: the auth context
  // hands back a fresh `user` object on every tab focus even when nothing changed,
  // so depending on that object made the feed refetch and visibly "reload"; keying
  // on the derived category string means we only refetch when categories change.
  const feedKey = useMemo(() => {
    const prof = aiUserProfile(user);
    const profileCats = [prof.primaryCategory, ...(prof.interestCategories || [])]
      .filter(Boolean)
      .map(feedCategory);
    const prefCats = [...new Set([...profileCats, ...getRecentCategories().map(feedCategory)])];
    return prefCats.join('|');
  }, [user?.id, user?.profileVector]);

  // Instant paint on refresh / return visit: seed feed + loading from the last
  // cached snapshot for this key so cards render on the FIRST frame instead of
  // after a Typesense round-trip. The effect below revalidates in the background.
  // TEK okuma: eskiden aynı anlık görüntü mount başına üç kez (iki useState
  // başlatıcısı + effect) ayrıştırılıyordu.
  const prefCats = useMemo(() => (feedKey ? feedKey.split('|') : []), [feedKey]);
  const seeded = useMemo(() => peekHomeFeed(prefCats, lang), [feedKey, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const [feed, setFeed] = useState(() => seeded || EMPTY_FEED);
  const [loading, setLoading] = useState(() => !seeded);
  const [recent, setRecent] = useState(() => getRecentProducts());
  // Recently-viewed snapshots are LEAN (no `_raw`), so thin-token categories
  // (headphones, GPUs, SSDs…) can't reach four key specs from localStorage
  // alone. Enrich them the same way the home feed cards are enriched, so the
  // recent rail shows the same fixed four specs as every other card.
  const [recentCards, setRecentCards] = useState(recent);

  const [q, setQ] = useState(() => params.get('q') || '');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [submitted, setSubmitted] = useState(() => (params.get('q') || '').trim());

  // Progressive mount: the home feed is ~69 cards across 9 rails. Mounting them
  // all in one synchronous React pass is a ~700 ms main-thread block that freezes
  // scrolling for the first couple seconds. Only the hero + top two rails (For You,
  // Trending) are above the fold, so those render immediately; the below-the-fold
  // rails then stream in ONE PER IDLE TICK, so each mount is a small (~one rail)
  // task the thread yields between — scroll never freezes. They appear off-screen
  // (content-visibility skips their paint) so there is no visible pop. `belowShown`
  // always starts at 0 — even a warm cache benefits, since painting all 69 cards in
  // one pass was itself a ~330 ms block; the above-the-fold rails still paint on the
  // first frame from cache, only the below-the-fold ones stream in.
  const BELOW_RAIL_CEILING = 9; // 6 category rails + ad + recent + new arrivals
  const [belowShown, setBelowShown] = useState(0);
  useEffect(() => {
    if (belowShown >= BELOW_RAIL_CEILING) return undefined;
    const ric = window.requestIdleCallback || ((cb) => setTimeout(cb, 80));
    const cic = window.cancelIdleCallback || clearTimeout;
    const id = ric(() => setBelowShown((n) => n + 1), { timeout: 400 });
    return () => cic(id);
  }, [belowShown]);
  const catRailTotal = feed.categorySections?.length || 0;

  useSeo({
    title: `Qor AI — ${t('home.heroTitle')}`,
    description: t('seo.home'),
    path: '/',
    htmlLang: lang,
    alternates: hreflangAlternates('/'),
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

  // Revalidate the feed for the current personalization key. If we already have a
  // cached snapshot (mount seed, or the key changed mid-session), keep the visible
  // cards and refresh silently; only show skeletons when there's nothing cached.
  useEffect(() => {
    let live = true;
    // Mount tohumu zaten ekranda; bir daha setFeed ETME (aynı içerikle yapılan
    // her setState 66 kartlık tam bir yeniden render demekti).
    if (!seeded) setLoading(true);
    // Görünenle birebir aynı akışı yeniden basmayı engelle: ucuz id+fiyat imzası
    // eşleşiyorsa React'a hiç dokunmuyoruz.
    let shownSig = homeFeedSignature(seeded);
    const applyFeed = (f) => {
      if (!live || !f) return;
      const sig = homeFeedSignature(f);
      if (sig && sig === shownSig) return;
      shownSig = sig;
      setFeed(f);
    };
    getHomeFeedCached(prefCats, {
      lang,
      // Arka planda gelen TAZE akış: ekrandakiyle aynıysa hiç dokunma.
      onFresh: applyFeed,
      // Thin cards (monitors/TVs/GPUs/headphones…) upgrade to their full four key
      // specs a beat after first paint via background enrichment — with no layout
      // shift (the specs grid always reserves two rows). The cache layer stores the
      // upgraded feed itself, so return visits get the four-spec cards instantly.
      onEnriched: (enriched) => {
        if (!live) return;
        // Apply the upgraded feed when the main thread is idle so its re-render
        // never competes with an in-progress scroll (the timeout caps the wait so
        // it still lands promptly). memo(ProductCard) keeps this to the few cards
        // that actually changed. Enrichment DAİMA yeni etiket getirir, o yüzden
        // imza kapısını atlar.
        const apply = () => { if (live) { shownSig = homeFeedSignature(enriched); setFeed(enriched); } };
        if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(apply, { timeout: 800 });
        else setTimeout(apply, 0);
      },
    })
      .then(applyFeed)
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [feedKey, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    const base = recent.map((p) => ({ ...p }));
    setRecentCards(base); // show lean chips instantly, upgrade to four when ready
    enrichThinCards(base).then((enriched) => { if (live) setRecentCards([...enriched]); });
    return () => { live = false; };
  }, [recent.map((p) => p.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Recent searches (Google-style) for the signed-in user — newest first, deduped.
  const recentSearches = useMemo(() => {
    const seen = new Set();
    return readSearchHistory(user)
      .filter((s) => {
        const key = String(s?.query || '').trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }, [user]);

  function runSearch(term) {
    const s = String(term || '').trim();
    if (!s) return;
    setQ(s);
    saveSearchHistory(s);
    setSubmitted(s);
    setSuggestOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function search(e) {
    e.preventDefault();
    runSearch(q);
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
                    onFocus={() => setSuggestOpen(true)}
                    onChange={(e) => {
                      const value = e.target.value;
                      setQ(value);
                      setSubmitted('');
                      setSuggestOpen(true);
                    }}
                    placeholder={L('Search products by name…', 'Ürün adıyla ara…', 'Produkt nach Name suchen…')} autoComplete="off" />
                  <button type="submit" className="btn btn-grad btn-shine">{t('common.search')}</button>
                </form>
                {suggestOpen && (
                  q.trim()
                    ? <SearchSuggestionList products={searchResults} searching={searching} onOpen={openProduct} L={L} />
                    : <RecentSearchList items={recentSearches} onPick={runSearch} L={L} />
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
            {/* FOR YOU — top, 3×3 */}
            <Section title={t('home.forYou')} products={feed.forYou} loading={loading} t={t} dense />

            {/* TRENDING — top, 3×3 */}
            <Section title={t('home.trendingToday')} products={feed.trending} loading={loading} t={t} dense seeAllTo="/category/smartphones?sort=trend" />

            {/* Below-the-fold rails stream in one per idle tick (see belowShown)
                so no single mount blocks the thread and scroll never freezes. */}

            {/* PER-CATEGORY POPULAR RAILS — own title each, 3×2 = 6 products */}
            {(feed.categorySections || []).slice(0, belowShown).map((sec) => (
              <Section key={sec.category}
                title={categoryLabel(sec.category, lang)}
                products={sec.products}
                loading={loading}
                t={t}
                seeAllTo={categoryPath(sec.category)} />
            ))}

            {belowShown > catRailTotal && (
              <div style={{ marginTop: 24 }}><AdSlot slot={AD_SLOTS.home} /></div>
            )}

            {/* RECENTLY VIEWED — 3×3 */}
            {recent.length > 0 && belowShown > catRailTotal + 1 && (
              <Section title={t('home.recent')} products={recentCards.slice(0, 9)} loading={false} t={t} dense />
            )}

            {/* NEW ARRIVALS — 3×3 */}
            {belowShown > catRailTotal + 1 && (
              <Section title={t('home.newArrivals')} products={feed.newArrivals} loading={loading} t={t} dense />
            )}
          </>
        )}
      </div>
    </div>
  );
}
