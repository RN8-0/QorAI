import { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { getCategoryPage } from '../lib/typesense';
import { catMeta, categoryLabel } from '../lib/format';
import { trackEvent } from '../lib/analytics';
import { useI18n } from '../i18n/index.jsx';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import AdSlot from '../components/AdSlot.jsx';
import { AD_SLOTS } from '../lib/ads';
import { SITE_URL, useSeo } from '../lib/seo';
import './Category.css';

// Price sorts are intentionally gone — the site does not surface prices.
const SORTS = [
  { id: 'score', key: 'catalog.sortScore' },
  { id: 'trend', key: 'catalog.sortTrend' },
  { id: 'new', key: 'catalog.sortNew' },
];
const SCORES = [
  { id: 'high', key: 'catalog.scoreHigh' },
  { id: 'mid', key: 'catalog.scoreMid' },
  { id: 'low', key: 'catalog.scoreLow' },
];
const PER_PAGE = 24;
const COLLAPSED = 8;

// filterTokens look like "ram:8_gb" — the prefix drives the filter group.
// Multi-value groups render as checkbox lists in this order; only groups that
// actually have values in the category are shown, so each category surfaces its
// own relevant filters (epey-style) with no price filter.
const TOKEN_GROUPS = [
  { prefix: 'ram', label: ['RAM', 'RAM', 'RAM'] },
  { prefix: 'storage', label: ['Storage', 'Depolama', 'Speicher'] },
  { prefix: 'screen_tech', label: ['Panel type', 'Panel tipi', 'Panel'] },
  { prefix: 'refresh_rate', label: ['Refresh rate', 'Yenileme hızı', 'Bildrate'] },
  { prefix: 'os', label: ['Operating system', 'İşletim sistemi', 'Betriebssystem'] },
  { prefix: 'processor_brand', label: ['Processor', 'İşlemci', 'Prozessor'] },
  { prefix: 'gpu_type', label: ['Graphics', 'Ekran kartı', 'Grafik'] },
  { prefix: 'socket', label: ['Socket', 'Soket', 'Sockel'] },
  { prefix: 'connectivity', label: ['Connectivity', 'Bağlantı', 'Konnektivität'] },
];
const FEATURE_TOKENS = [
  { token: 'five_g:true', label: ['5G', '5G', '5G'] },
  { token: 'nfc:true', label: ['NFC', 'NFC', 'NFC'] },
  { token: 'wireless_charging:true', label: ['Wireless charging', 'Kablosuz şarj', 'Kabelloses Laden'] },
  { token: 'fast_charging:true', label: ['Fast charging', 'Hızlı şarj', 'Schnellladen'] },
  { token: 'fingerprint:true', label: ['Fingerprint', 'Parmak izi', 'Fingerabdruck'] },
  { token: 'water_resistance:true', label: ['Water resistant', 'Suya dayanıklı', 'Wasserfest'] },
];
const TOKEN_VALUE_LABEL = {
  amoled: 'AMOLED', super_amoled: 'Super AMOLED', dynamic_amoled: 'Dynamic AMOLED', oled: 'OLED', ltpo: 'LTPO', ips: 'IPS', lcd: 'LCD', va: 'VA', tn: 'TN',
  windows: 'Windows', macos: 'macOS', ios: 'iOS', ipados: 'iPadOS', android: 'Android', chromeos: 'ChromeOS', linux: 'Linux',
  intel: 'Intel', amd: 'AMD', apple: 'Apple', qualcomm: 'Qualcomm', mediatek: 'MediaTek', exynos: 'Exynos',
  dedicated: ['Dedicated', 'Harici', 'Dediziert'], integrated: ['Integrated', 'Dahili', 'Integriert'],
  'wi-fi': 'Wi-Fi', '5g': '5G', '4g': '4G',
};
function prettyTokenValue(v, lang) {
  const key = String(v || '').toLowerCase();
  const mapped = TOKEN_VALUE_LABEL[key];
  if (mapped) return Array.isArray(mapped) ? (lang === 'tr' ? mapped[1] : lang === 'de' ? mapped[2] : mapped[0]) : mapped;
  return String(v || '')
    .replace(/_/g, ' ')
    .replace(/\bgb\b/i, 'GB').replace(/\btb\b/i, 'TB').replace(/\bmah\b/i, 'mAh')
    .replace(/\binch\b/i, '"').replace(/\bhz\b/i, 'Hz')
    .trim();
}

function facetCounts(facets, field) {
  const f = (facets || []).find((x) => x.field_name === field);
  return f ? f.counts : [];
}

export default function Category() {
  const { t, lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const [params] = useSearchParams();
  const cat = (params.get('cat') || '').toLowerCase();
  const meta = catMeta(cat);
  const catTitle = categoryLabel(cat, lang);
  const categoryPath = cat ? `/category?cat=${encodeURIComponent(cat)}` : '/category';
  const categoryDescription = cat
    ? t('category.seo', { cat: catTitle })
    : L('Browse every product category on Qor AI.',
        'Qor AI üzerindeki tüm ürün kategorilerine göz at.',
        'Durchstöbere alle Produktkategorien auf Qor AI.');

  useSeo({
    title: cat
      ? `${catTitle} — Qor AI`
      : `${L('All Categories', 'Tüm Kategoriler', 'Alle Kategorien')} — Qor AI`,
    description: categoryDescription,
    path: categoryPath,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage',
          '@id': `${SITE_URL}${categoryPath}#webpage`,
          url: `${SITE_URL}${categoryPath}`,
          name: cat ? `${catTitle} — Qor AI` : 'Qor AI Categories',
          description: categoryDescription,
          inLanguage: lang || 'tr',
          isPartOf: { '@id': `${SITE_URL}/#website` },
        },
        {
          '@type': 'BreadcrumbList',
          '@id': `${SITE_URL}${categoryPath}#breadcrumb`,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: catTitle, item: `${SITE_URL}${categoryPath}` },
          ],
        },
      ],
    },
  });

  const [q, setQ] = useState('');
  const paramSort = params.get('sort') || '';
  const [sort, setSort] = useState(() => (SORTS.some((s) => s.id === paramSort) ? paramSort : 'score'));
  const [score, setScore] = useState('all');
  const [brands, setBrands] = useState([]);
  const [segments, setSegments] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [brandQuery, setBrandQuery] = useState('');
  const [brandsOpen, setBrandsOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  // The full facet universe for the category — stable option list.
  const [universe, setUniverse] = useState([]);
  // Live facet counts for the current filter selection.
  const [liveFacets, setLiveFacets] = useState([]);

  const filterKey = [q, score, sort, brands.join(','), segments.join(','), tokens.join(',')].join('|');

  // Load the stable facet universe whenever the category changes.
  useEffect(() => {
    if (!cat) return;
    let live = true;
    getCategoryPage({ category: cat, page: 1, perPage: 1, facets: true })
      .then((r) => { if (live) setUniverse(r.facets); })
      .catch(() => {});
    return () => { live = false; };
  }, [cat]);

  useEffect(() => {
    const next = params.get('sort') || '';
    if (SORTS.some((s) => s.id === next)) setSort(next);
  }, [params]);

  // Query the first page on any filter change.
  useEffect(() => {
    if (!cat) return;
    let live = true;
    setLoading(true);
    setPage(1);
    getCategoryPage({
      category: cat, q: q.trim(), brands, segment: segments[0], tokens,
      score, sort, page: 1, perPage: PER_PAGE, facets: true,
    })
      .then((r) => {
        if (!live) return;
        setItems(r.hits);
        setLiveFacets(r.facets);
        setHasMore(r.hits.length >= PER_PAGE && r.found > r.hits.length);
        if (q.trim()) trackEvent('category_search', { cat, query: q.trim() });
      })
      .catch(() => { if (live) { setItems([]); setHasMore(false); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [cat, filterKey]); // eslint-disable-line

  async function loadMore() {
    const next = page + 1;
    setMore(true);
    try {
      const r = await getCategoryPage({
        category: cat, q: q.trim(), brands, segment: segments[0], tokens,
        score, sort, page: next, perPage: PER_PAGE,
      });
      setItems((prev) => [...prev, ...r.hits]);
      setPage(next);
      setHasMore(r.hits.length >= PER_PAGE && r.found > next * PER_PAGE);
    } catch { /* keep current list */ }
    finally { setMore(false); }
  }

  // ── Facet option lists (stable universe + live counts) ──────────
  const countMap = (field) => {
    const m = {};
    facetCounts(liveFacets, field).forEach((c) => { m[c.value] = c.count; });
    return m;
  };
  const brandCounts = useMemo(() => countMap('brand'), [liveFacets]);
  const segCounts = useMemo(() => countMap('price_segment'), [liveFacets]);
  const tokenCounts = useMemo(() => countMap('filterTokens'), [liveFacets]);

  const brandList = useMemo(
    () => facetCounts(universe, 'brand').map((c) => c.value).sort((a, b) => a.localeCompare(b)),
    [universe],
  );
  const segmentList = useMemo(
    () => facetCounts(universe, 'price_segment').map((c) => c.value),
    [universe],
  );
  const lbl = (arr) => (lang === 'tr' ? arr[1] : lang === 'de' ? arr[2] : arr[0]);
  // filterTokens grouped by prefix → { ram: [...], storage: [...], five_g: [...] }
  const tokenGroups = useMemo(() => {
    const groups = {};
    facetCounts(universe, 'filterTokens').forEach((c) => {
      const i = String(c.value).indexOf(':');
      if (i < 1) return;
      const prefix = c.value.slice(0, i);
      (groups[prefix] = groups[prefix] || []).push(c.value);
    });
    return groups;
  }, [universe]);
  const availableFeatures = FEATURE_TOKENS.filter((f) => (tokenGroups[f.token.split(':')[0]] || []).includes(f.token));

  const hasFilters = q.trim() || brands.length || segments.length || tokens.length || score !== 'all';
  function clearFilters() {
    setQ(''); setBrands([]); setSegments([]); setTokens([]); setScore('all'); setBrandQuery('');
  }
  const toggle = (list, set, v) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const filteredBrands = brandList.filter(
    (b) => !brandQuery || b.toLowerCase().includes(brandQuery.toLowerCase()),
  );
  const visibleBrands = brandsOpen || brandQuery ? filteredBrands : filteredBrands.slice(0, COLLAPSED);

  if (!cat) {
    return <Navigate to="/" replace />;
  }

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
        <input className="cat-brand-search" value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('category.searchIn')} />
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

      {TOKEN_GROUPS.filter((g) => (tokenGroups[g.prefix] || []).length > 0).map((g) => (
        <div className="cat-fgroup" key={g.prefix}>
          <h4>{lbl(g.label)}</h4>
          {tokenGroups[g.prefix]
            .slice()
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map((tk) => (
              <label key={tk} className={'cat-check' + (tokens.includes(tk) ? ' on' : '')}>
                <input type="checkbox" checked={tokens.includes(tk)}
                  onChange={() => toggle(tokens, setTokens, tk)} />
                <span>{prettyTokenValue(tk.slice(g.prefix.length + 1), lang)}</span>
                {tokenCounts[tk] != null && <em>{tokenCounts[tk]}</em>}
              </label>
            ))}
        </div>
      ))}

      {availableFeatures.length > 0 && (
        <div className="cat-fgroup">
          <h4>{L('Features', 'Özellikler', 'Funktionen')}</h4>
          {availableFeatures.map((f) => (
            <label key={f.token} className={'cat-check' + (tokens.includes(f.token) ? ' on' : '')}>
              <input type="checkbox" checked={tokens.includes(f.token)}
                onChange={() => toggle(tokens, setTokens, f.token)} />
              <span>{lbl(f.label)}</span>
              {tokenCounts[f.token] != null && <em>{tokenCounts[f.token]}</em>}
            </label>
          ))}
        </div>
      )}

      {brandList.length > 1 && (
        <div className="cat-fgroup">
          <h4>{t('catalog.brand')}</h4>
          {brandList.length > COLLAPSED && (
            <input className="cat-brand-search" value={brandQuery}
              onChange={(e) => setBrandQuery(e.target.value)}
              placeholder={t('catalog.brandSearch')} />
          )}
          {visibleBrands.map((b) => (
            <label key={b} className={'cat-check' + (brands.includes(b) ? ' on' : '')}>
              <input type="checkbox" checked={brands.includes(b)}
                onChange={() => toggle(brands, setBrands, b)} />
              <span>{b}</span>
              {brandCounts[b] != null && <em>{brandCounts[b]}</em>}
            </label>
          ))}
          {!brandQuery && filteredBrands.length > COLLAPSED && (
            <button className="cat-brand-more" onClick={() => setBrandsOpen((o) => !o)}>
              {brandsOpen
                ? t('catalog.showLess')
                : t('catalog.showAllBrands', { n: filteredBrands.length - COLLAPSED })}
            </button>
          )}
        </div>
      )}
    </aside>
  );

  return (
    <div className="catalog">
      <div className="cat-hero">
        <div className="container">
          <h1 style={{ '--cat-color': meta.color }}>{catTitle}</h1>
          <p>{t('catalog.subtitle')}</p>
        </div>
      </div>

      <div className="container cat-body">
        {sidebar}
        {drawer && <div className="cat-side-backdrop" onClick={() => setDrawer(false)} />}

        <div className="cat-main">
          <div className="cat-toolbar">
            <button className="cat-filter-btn" onClick={() => setDrawer(true)}>
              ☰ {t('catalog.filters')}
              {hasFilters && <i className="cat-filter-dot" />}
            </button>
            <div className="cat-sort">
              {SORTS.map((s) => (
                <button key={s.id} className={sort === s.id ? 'active' : ''} onClick={() => setSort(s.id)}>
                  {t(s.key)}
                </button>
              ))}
            </div>
          </div>

          <div className="cat-list">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)
              : items.map((p, i) => (
                  <div key={p.id} className="cat-list-item" style={{ '--row': i }}>
                    <ProductCard product={p} />
                  </div>
                ))}
          </div>

          {!loading && items.length === 0 && (
            <div className="cat-empty">
              <div className="cat-empty-icon">🔍</div>
              <h3>{t('catalog.emptyTitle')}</h3>
              <p>{q.trim() ? t('catalog.emptySearch', { q: q.trim() }) : t('catalog.emptyCat')}</p>
            </div>
          )}

          {!loading && items.length > 0 && <AdSlot slot={AD_SLOTS.category} />}

          {!loading && hasMore && (
            <div className="cat-more">
              <button className="btn btn-ghost btn-lg" disabled={more} onClick={loadMore}>
                {more ? t('common.loading') : t('category.more')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
