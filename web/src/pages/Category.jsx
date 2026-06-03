import { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { getCategoryPage } from '../lib/typesense';
import { catMeta } from '../lib/format';
import { trackEvent } from '../lib/analytics';
import { useI18n } from '../i18n/index.jsx';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import AdSlot from '../components/AdSlot.jsx';
import { AD_SLOTS } from '../lib/ads';
import { useSeo } from '../lib/seo';
import './Category.css';

const SORTS = [
  { id: 'score', key: 'catalog.sortScore' },
  { id: 'trend', key: 'catalog.sortTrend' },
  { id: 'priceUp', key: 'catalog.sortPriceUp' },
  { id: 'priceDown', key: 'catalog.sortPriceDown' },
];
const SCORES = [
  { id: 'high', key: 'catalog.scoreHigh' },
  { id: 'mid', key: 'catalog.scoreMid' },
  { id: 'low', key: 'catalog.scoreLow' },
];
const PER_PAGE = 24;
const COLLAPSED = 8;

// filterTokens look like "ram:8_gb" — prefix drives the filter group.
const TOKEN_GROUPS = {
  ram: 'spec.ram', storage: 'spec.storage', screen: 'spec.screen',
  battery: 'spec.battery', refresh: 'filter.refresh', os: 'filter.os',
};
function prettyTokenValue(v) {
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

  useSeo({
    title: cat
      ? `${meta.label} — Qor AI`
      : `${L('All Categories', 'Tüm Kategoriler', 'Alle Kategorien')} — Qor AI`,
    description: cat
      ? t('category.seo', { cat: meta.label })
      : L('Browse every product category on Qor AI.',
          'Qor AI üzerindeki tüm ürün kategorilerine göz at.',
          'Durchstöbere alle Produktkategorien auf Qor AI.'),
    path: cat ? `/category?cat=${encodeURIComponent(cat)}` : '/category',
  });

  const [q, setQ] = useState('');
  const [sort, setSort] = useState('score');
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
  // filterTokens grouped by prefix → { ram: [...], storage: [...] }
  const tokenGroups = useMemo(() => {
    const groups = {};
    facetCounts(universe, 'filterTokens').forEach((c) => {
      const i = String(c.value).indexOf(':');
      if (i < 1) return;
      const prefix = c.value.slice(0, i);
      if (!TOKEN_GROUPS[prefix]) return;
      (groups[prefix] = groups[prefix] || []).push(c.value);
    });
    return groups;
  }, [universe]);

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

      {segmentList.length > 1 && (
        <div className="cat-fgroup">
          <h4>{t('catalog.priceSegment')}</h4>
          {segmentList.map((s) => (
            <label key={s} className={'cat-check' + (segments.includes(s) ? ' on' : '')}>
              <input type="checkbox" checked={segments.includes(s)}
                onChange={() => toggle(segments, setSegments, s)} />
              <span>{prettyTokenValue(s)}</span>
              {segCounts[s] != null && <em>{segCounts[s]}</em>}
            </label>
          ))}
        </div>
      )}

      {Object.keys(tokenGroups).map((prefix) => (
        <div className="cat-fgroup" key={prefix}>
          <h4>{t(TOKEN_GROUPS[prefix])}</h4>
          {tokenGroups[prefix].map((tk) => (
            <label key={tk} className={'cat-check' + (tokens.includes(tk) ? ' on' : '')}>
              <input type="checkbox" checked={tokens.includes(tk)}
                onChange={() => toggle(tokens, setTokens, tk)} />
              <span>{prettyTokenValue(tk.slice(prefix.length + 1))}</span>
              {tokenCounts[tk] != null && <em>{tokenCounts[tk]}</em>}
            </label>
          ))}
        </div>
      ))}

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
          <h1><span style={{ '--cat-color': meta.color }}>{meta.icon}</span> {meta.label}</h1>
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
