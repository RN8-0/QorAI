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
import { productPath } from '../lib/routes';
import Reveal from '../components/Reveal.jsx';
import './Home.css';

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

// Rotating spotlight of the strongest products — the hero's right-hand showcase.
function HeroSpotlight({ products, lang, L }) {
  const safe = (products || []).filter(Boolean).slice(0, 8);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (safe.length <= 1) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % safe.length), 4200);
    return () => clearInterval(id);
  }, [safe.length]);
  if (!safe.length) return null;
  const active = index % safe.length;
  return (
    <div className="hero-carousel" aria-label={L('Top picks', 'Öne çıkanlar', 'Top-Auswahl')}>
      <div className="hero-carousel-head">
        <span>{L('Spotlight', 'Vitrin', 'Vitrine')}</span>
        <b>{categoryLabel(safe[active]?.category, lang)}</b>
      </div>
      <div className="hero-carousel-viewport">
        <div className="hero-carousel-track" style={{ transform: `translateX(-${active * 100}%)` }}>
          {safe.map((p) => (
            <div className="hero-carousel-slide" key={p.id}><ProductCard product={p} /></div>
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

// Quick category chips built from the live Typesense facet counts.
function CategoryStrip({ categories, lang, L }) {
  const cats = (categories || [])
    .map((c) => ({ value: String(c.value || '').toLowerCase(), count: Number(c.count) || 0 }))
    .filter((c) => c.value)
    .sort((a, b) => b.count - a.count)
    .slice(0, 14);
  if (cats.length < 4) return null;
  return (
    <Reveal>
      <div className="home-chips" role="navigation" aria-label={L('Browse categories', 'Kategorilere göz at', 'Kategorien')}>
        {cats.map((c) => {
          const meta = catMeta(c.value);
          return (
            <Link key={c.value} to={`/category?cat=${encodeURIComponent(c.value)}`} className="home-chip">
              <span className="home-chip-ic">{meta.icon}</span>
              {categoryLabel(c.value, lang)}
            </Link>
          );
        })}
      </div>
    </Reveal>
  );
}

function StatsBand({ total, catCount, L, lang }) {
  const fmt = (n) => new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-US').format(n);
  const stats = [
    { n: total > 0 ? `${fmt(total)}+` : '—', l: L('scored products', 'puanlı ürün', 'bewertete Produkte') },
    { n: catCount > 0 ? `${catCount}` : '—', l: L('categories', 'kategori', 'Kategorien') },
    { n: '5', l: L('AI tools', 'AI aracı', 'KI-Tools') },
    { n: L('Free', 'Ücretsiz', 'Gratis'), l: L('to compare', 'karşılaştırma', 'Vergleich') },
  ];
  return (
    <Reveal>
      <div className="home-stats">
        {stats.map((s) => (
          <div className="home-stat" key={s.l}>
            <span className="home-stat-n grad">{s.n}</span>
            <span className="home-stat-l">{s.l}</span>
          </div>
        ))}
      </div>
    </Reveal>
  );
}

// Horizontal, rank-numbered rail — a different rhythm from the grid sections.
function TrendingRail({ title, products, loading, seeAllTo, t }) {
  const list = (products || []).filter(Boolean).slice(0, 12);
  if (!loading && list.length === 0) return null;
  return (
    <Reveal>
      <div className="sec-head">
        <h2><span className="bar" /> {title}</h2>
        {seeAllTo && <Link to={seeAllTo} className="see-all">{t('common.seeAll')} →</Link>}
      </div>
      <div className="home-rail">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <div className="home-rail-item" key={i}><ProductCardSkeleton /></div>)
          : list.map((p, i) => (
            <div className="home-rail-item" key={p.id}>
              <span className="home-rail-rank">{i + 1}</span>
              <ProductCard product={p} />
            </div>
          ))}
      </div>
    </Reveal>
  );
}

function ValueProps({ L }) {
  const items = [
    {
      to: '/compare', tone: 'a',
      title: L('Side-by-side compare', 'Yan yana karşılaştır', 'Direktvergleich'),
      desc: L('Specs, scores and prices, lined up.', 'Özellik, puan ve fiyat tek ekranda.', 'Specs, Scores und Preise nebeneinander.'),
      icon: (<><rect x="3" y="4" width="7.5" height="16" rx="2" /><rect x="13.5" y="4" width="7.5" height="16" rx="2" /></>),
    },
    {
      to: '/link-analysis', tone: 'b',
      title: L('Paste any link', 'Linki yapıştır', 'Link einfügen'),
      desc: L('Drop a product URL, get an instant AI read.', 'Ürün linkini yapıştır, anında AI analizi al.', 'Produkt-URL einfügen, sofortige KI-Analyse.'),
      icon: (<><path d="M9 15l6-6" /><path d="M11 6.5 12.5 5a4 4 0 0 1 5.7 5.7L16.5 12" /><path d="M13 17.5 11.5 19a4 4 0 0 1-5.7-5.7L7.5 12" /></>),
    },
    {
      to: '/quiz', tone: 'c',
      title: L('Personal AI picks', 'Sana özel AI seçimi', 'Persönliche KI-Tipps'),
      desc: L('Take the quiz once — Qor AI tailors everything.', 'Quizi bir kez çöz — Qor AI her şeyi sana göre ayarlar.', 'Quiz einmal machen — alles personalisiert.'),
      icon: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>),
    },
  ];
  return (
    <Reveal>
      <div className="home-values">
        {items.map((it) => (
          <Link key={it.to} to={it.to} className={`home-value tone-${it.tone}`}>
            <span className="home-value-ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg>
            </span>
            <span className="home-value-tx">
              <strong>{it.title}</strong>
              <span>{it.desc}</span>
            </span>
            <span className="home-value-go" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </Link>
        ))}
      </div>
    </Reveal>
  );
}

function GridSection({ title, products, loading, seeAllTo, t, dense = false }) {
  const list = Array.isArray(products) ? products.filter(Boolean) : [];
  const cols = 3;
  const keep = Math.floor(list.length / cols) * cols;
  const visible = keep >= cols ? list.slice(0, keep) : [];
  if (!loading && visible.length === 0) return null;
  const items = loading
    ? Array.from({ length: dense ? 6 : 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
    : visible.map((p) => <ProductCard key={p.id} product={p} />);
  return (
    <Reveal>
      <div className="sec-head">
        <h2><span className="bar" /> {title}</h2>
        {seeAllTo && <Link to={seeAllTo} className="see-all">{t('common.seeAll')} →</Link>}
      </div>
      <div className={`card-grid${dense ? ' card-grid-compact' : ''}`}>{items}</div>
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

  useEffect(() => {
    let live = true;
    getHomeFeed(getRecentCategories())
      .then((f) => { if (live) setFeed(f); })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

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
  const heroProducts = feed.heroPicks?.length ? feed.heroPicks : spotlight ? [spotlight] : [];
  const catCount = (feed.categories || []).filter((c) => Number(c.count) > 0).length;

  return (
    <div className="page">
      <div className="container">
        {/* HERO */}
        <section className="hero card glow aurora home-hero">
          <div className="hero-glow" />
          <div className="between wrap home-hero-inner">
            <div className="home-hero-copy">
              {user && (
                <div className="home-greet">{greetWord}, {displayName} 👋</div>
              )}
              <span className="home-hero-badge">{L('AI-scored tech catalog', 'AI puanlı teknoloji kataloğu', 'KI-bewerteter Katalog')}</span>
              <h1>
                {L('Compare anything.', 'Her şeyi karşılaştır.', 'Vergleiche alles.')}<br />
                <span className="grad grad-anim">{L('Buy with confidence.', 'Güvenle satın al.', 'Kaufe mit Vertrauen.')}</span>
              </h1>
              <p className="sub">
                {L(
                  'Real products scored by AI. Compare specs side by side, paste any link, and find the product that fits you.',
                  'Gerçek ürünler yapay zekâ ile puanlandı. Özellikleri yan yana karşılaştır, herhangi bir linki yapıştır ve sana en uygun ürünü bul.',
                  'Echte Produkte mit KI bewertet. Vergleiche Specs, füge einen Link ein und finde das passende Produkt.',
                )}
              </p>
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
            {heroProducts.length > 0 && (
              <div className="home-hero-spot">
                <HeroSpotlight products={heroProducts} lang={lang} L={L} />
              </div>
            )}
          </div>
        </section>

        {searchMode ? (
          <>
            <div className="sec-head"><h2><span className="bar" /> {t('catalog.searchTag', { q: submitted })}</h2></div>
            {searching ? (
              <div className="card-grid">{Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
            ) : searchResults.length > 0 ? (
              <div className="card-grid">{searchResults.map((p) => <ProductCard key={p.id} product={p} />)}</div>
            ) : (
              <div className="card pad" style={{ textAlign: 'center', color: 'var(--text-2)' }}>
                {t('catalog.emptySearch', { q: submitted })}
              </div>
            )}
          </>
        ) : (
          <>
            <CategoryStrip categories={feed.categories} lang={lang} L={L} />
            <StatsBand total={feed.total} catCount={catCount} L={L} lang={lang} />

            <TrendingRail title={t('home.trendingToday')} products={feed.trending} loading={loading} t={t}
              seeAllTo="/category?cat=smartphones&sort=trend" />

            <GridSection title={t('home.forYou')} products={feed.forYou} loading={loading} t={t} dense />

            <ValueProps L={L} />

            <div className="home-ad"><AdSlot slot={AD_SLOTS.home} /></div>

            {recent.length > 0 && (
              <GridSection title={t('home.recent')} products={recent} loading={false} t={t} />
            )}

            <GridSection title={t('home.newArrivals')} products={feed.newArrivals} loading={loading} t={t} dense />
          </>
        )}
      </div>
    </div>
  );
}
