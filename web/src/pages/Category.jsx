import { useEffect, useMemo, useState } from 'react';
import { IconX } from '../components/GlyphIcons.jsx';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { getCategoryPage } from '../lib/typesense';
import { useGeoCountry } from '../lib/geo';
import { catMeta, categoryLabel } from '../lib/format';
import { categoryPath } from '../lib/routes';
import { usePageContext } from '../lib/pageContext';
import { trackEvent } from '../lib/analytics';
import { useI18n } from '../i18n/index.jsx';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import AdSlot from '../components/AdSlot.jsx';
import { AD_SLOTS } from '../lib/ads';
import { SITE_URL, useSeo, hreflangAlternates } from '../lib/seo';
import {
  compareTokenValues,
  featureFiltersForCategory,
  filterGroupsForCategory,
  formatRangeValue,
  lbl,
  prettyTokenValue,
  rangeInputSuffix,
  rangeMetaForTokens,
  rangeTokens,
  tokenValue,
} from '../lib/categoryFilters';
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

function facetCounts(facets, field) {
  const f = (facets || []).find((x) => x.field_name === field);
  return f ? f.counts : [];
}

export default function Category() {
  const { t, lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const [params] = useSearchParams();
  const routeParams = useParams();
  // Accept both the clean path URL (/category/smartphones) and the legacy query
  // URL (/category?cat=smartphones); the canonical always points to the path one.
  const cat = (routeParams.cat || params.get('cat') || '').toLowerCase();
  const meta = catMeta(cat);
  const catTitle = categoryLabel(cat, lang);
  const catPath = categoryPath(cat);
  const categoryDescription = cat
    ? t('category.seo', { cat: catTitle })
    : L('Browse every product category on Qor AI.',
        'Qor AI üzerindeki tüm ürün kategorilerine göz at.',
        'Durchstöbere alle Produktkategorien auf Qor AI.');

  usePageContext(
    cat
      ? `${lang === 'tr' ? 'Kategori sayfası' : lang === 'de' ? 'Kategorieseite' : 'Category page'}: ${catTitle}`
      : `${lang === 'tr' ? 'Tüm kategoriler sayfası' : lang === 'de' ? 'Alle Kategorien' : 'All categories page'}`,
    cat
      ? { kind: 'category', title: catTitle, category: cat }
      : { kind: 'categories', title: '' },
  );

  useSeo({
    title: cat
      ? L(
          `Best ${catTitle} — Compare Specs & Prices | Qor AI`,
          `${catTitle} Karşılaştırma — Fiyat & Özellik | Qor AI`,
          `${catTitle} Vergleich — Preise & Specs | Qor AI`,
        )
      : `${L('All Categories', 'Tüm Kategoriler', 'Alle Kategorien')} — Qor AI`,
    description: categoryDescription,
    path: catPath,
    htmlLang: lang,
    alternates: hreflangAlternates(catPath),
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage',
          '@id': `${SITE_URL}${catPath}#webpage`,
          url: `${SITE_URL}${catPath}`,
          name: cat ? `${catTitle} — Qor AI` : 'Qor AI Categories',
          description: categoryDescription,
          inLanguage: lang || 'tr',
          isPartOf: { '@id': `${SITE_URL}/#website` },
        },
        {
          '@type': 'BreadcrumbList',
          '@id': `${SITE_URL}${catPath}#breadcrumb`,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: catTitle, item: `${SITE_URL}${catPath}` },
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
  const [rangeFilters, setRangeFilters] = useState({});
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

  // ── Facet option lists (stable universe + live counts) ──────────
  const countMap = (field) => {
    const m = {};
    facetCounts(liveFacets, field).forEach((c) => { m[c.value] = c.count; });
    return m;
  };
  const brandCounts = useMemo(() => countMap('brand'), [liveFacets]);
  const tokenCounts = useMemo(() => countMap('filterTokens'), [liveFacets]);

  const brandList = useMemo(
    () => facetCounts(universe, 'brand').map((c) => c.value).sort((a, b) => a.localeCompare(b)),
    [universe],
  );
  // filterTokens grouped by prefix -> { ram: [...], storage: [...], five_g: [...] }.
  // The category schema removes dirty cross-category tokens from the visible UI.
  const tokenGroups = useMemo(() => {
    const allowed = new Set(filterGroupsForCategory(cat).map((g) => g.prefix));
    featureFiltersForCategory(cat).forEach((f) => allowed.add(f.token.split(':')[0]));
    const groups = {};
    facetCounts(universe, 'filterTokens').forEach((c) => {
      const value = String(c.value || '');
      const i = value.indexOf(':');
      if (i < 1) return;
      const prefix = value.slice(0, i);
      if (!allowed.has(prefix)) return;
      (groups[prefix] = groups[prefix] || []).push(value);
    });
    Object.keys(groups).forEach((prefix) => {
      groups[prefix].sort((a, b) => compareTokenValues(prefix, a, b));
    });
    return groups;
  }, [cat, universe]);
  const filterGroups = useMemo(
    () => filterGroupsForCategory(cat).filter((g) => (tokenGroups[g.prefix] || []).length > 0),
    [cat, tokenGroups],
  );
  const availableFeatures = featureFiltersForCategory(cat)
    .filter((f) => (tokenGroups[f.token.split(':')[0]] || []).includes(f.token));
  const rangeFilterTokens = useMemo(() => (
    filterGroups.flatMap((g) => (
      g.kind === 'range'
        ? rangeTokens(tokenGroups[g.prefix] || [], g.prefix, rangeFilters[g.prefix], g.unit)
        : []
    ))
  ), [filterGroups, rangeFilters, tokenGroups]);
  const apiTokens = useMemo(
    () => [...new Set([...tokens, ...rangeFilterTokens])],
    [tokens, rangeFilterTokens],
  );
  const hasActiveRange = filterGroups.some((g) => {
    if (g.kind !== 'range') return false;
    const meta = rangeMetaForTokens(tokenGroups[g.prefix] || [], g.prefix, g.unit);
    const selected = rangeFilters[g.prefix];
    if (!meta || !selected) return false;
    const min = Math.max(meta.min, Math.min(Number(selected.min) || meta.min, Number(selected.max) || meta.max));
    const max = Math.min(meta.max, Math.max(Number(selected.min) || meta.min, Number(selected.max) || meta.max));
    return min > meta.min || max < meta.max;
  });

  // Ziyaretçinin ülkesi — fiyat sıralamasını GÖSTERİLEN yerli fiyata göre yapar.
  const geoCountry = useGeoCountry();

  const filterKey = [
    q, score, sort, brands.join(','), segments.join(','), apiTokens.join(','),
    JSON.stringify(rangeFilters), geoCountry,
  ].join('|');

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
    setQ('');
    setBrands([]);
    setSegments([]);
    setTokens([]);
    setRangeFilters({});
    setBrandQuery('');
    setBrandsOpen(false);
  }, [cat]);

  useEffect(() => {
    const visible = new Set(Object.values(tokenGroups).flat());
    setTokens((prev) => prev.filter((tk) => visible.has(tk)));
  }, [tokenGroups]);

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
      category: cat, q: q.trim(), brands, segment: segments[0], tokens: apiTokens,
      score, sort, page: 1, perPage: PER_PAGE, facets: true, country: geoCountry,
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
        category: cat, q: q.trim(), brands, segment: segments[0], tokens: apiTokens,
        score, sort, page: next, perPage: PER_PAGE, country: geoCountry,
      });
      setItems((prev) => [...prev, ...r.hits]);
      setPage(next);
      setHasMore(r.hits.length >= PER_PAGE && r.found > next * PER_PAGE);
    } catch { /* keep current list */ }
    finally { setMore(false); }
  }

  const hasFilters = q.trim() || brands.length || segments.length || tokens.length || hasActiveRange || score !== 'all';
  function clearFilters() {
    setQ(''); setBrands([]); setSegments([]); setTokens([]); setRangeFilters({}); setScore('all'); setBrandQuery('');
  }
  const toggle = (list, set, v) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const setRangeValue = (prefix, meta, next) => {
    setRangeFilters((prev) => {
      const current = prev[prefix] || { min: meta.min, max: meta.max };
      let min = Number(next.min ?? current.min);
      let max = Number(next.max ?? current.max);
      if (!Number.isFinite(min)) min = meta.min;
      if (!Number.isFinite(max)) max = meta.max;
      min = Math.max(meta.min, Math.min(meta.max, min));
      max = Math.max(meta.min, Math.min(meta.max, max));
      if (min > max) [min, max] = [max, min];
      if (min <= meta.min && max >= meta.max) {
        const copy = { ...prev };
        delete copy[prefix];
        return copy;
      }
      return { ...prev, [prefix]: { min, max } };
    });
  };

  const nearestRangeIndex = (values, value) => {
    const n = Number(value);
    let best = 0;
    values.forEach((candidate, index) => {
      if (Math.abs(candidate - n) < Math.abs(values[best] - n)) best = index;
    });
    return best;
  };

  const renderRangeGroup = (g) => {
    const groupTokens = tokenGroups[g.prefix] || [];
    const meta = rangeMetaForTokens(groupTokens, g.prefix, g.unit);
    if (!meta) return null;
    const selected = rangeFilters[g.prefix] || { min: meta.min, max: meta.max };
    const min = Math.max(meta.min, Math.min(Number(selected.min) || meta.min, Number(selected.max) || meta.max));
    const max = Math.min(meta.max, Math.max(Number(selected.min) || meta.min, Number(selected.max) || meta.max));
    const minIndex = nearestRangeIndex(meta.values, min);
    const maxIndex = nearestRangeIndex(meta.values, max);
    const selectedTokens = rangeTokens(groupTokens, g.prefix, { min, max }, g.unit);
    const effectiveTokens = selectedTokens.length ? selectedTokens : groupTokens;
    const count = effectiveTokens.reduce((sum, tk) => sum + (Number(tokenCounts[tk]) || 0), 0);
    return (
      <div className="cat-fgroup" key={g.prefix}>
        <h4>{lbl(g.label, lang)}</h4>
        <div className="cat-range-values">
          <strong>{formatRangeValue(min, g.unit)}</strong>
          <span>{formatRangeValue(max, g.unit)}</span>
          {count > 0 && <em>{count}</em>}
        </div>
        <div className="cat-range-slider">
          <input type="range" min="0" max={meta.values.length - 1} value={minIndex}
            onChange={(e) => setRangeValue(g.prefix, meta, { min: meta.values[Number(e.target.value)] })} />
          <input type="range" min="0" max={meta.values.length - 1} value={maxIndex}
            onChange={(e) => setRangeValue(g.prefix, meta, { max: meta.values[Number(e.target.value)] })} />
        </div>
        <div className="cat-range-inputs">
          <label>
            <input type="number" min={meta.min} max={meta.max} value={Math.round(min)}
              onChange={(e) => setRangeValue(g.prefix, meta, { min: e.target.value })} />
            <span>{rangeInputSuffix(g.unit)}</span>
          </label>
          <label>
            <input type="number" min={meta.min} max={meta.max} value={Math.round(max)}
              onChange={(e) => setRangeValue(g.prefix, meta, { max: e.target.value })} />
            <span>{rangeInputSuffix(g.unit)}</span>
          </label>
        </div>
      </div>
    );
  };

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
        <button className="cat-side-x" onClick={() => setDrawer(false)} aria-label="✕"><IconX size={14} width={2.4} /></button>
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

      {filterGroups.map((g) => {
        const groupTokens = tokenGroups[g.prefix] || [];
        if (g.kind === 'range' && rangeMetaForTokens(groupTokens, g.prefix, g.unit)) {
          return renderRangeGroup(g);
        }
        return (
          <div className="cat-fgroup" key={g.prefix}>
            <h4>{lbl(g.label, lang)}</h4>
            {groupTokens.map((tk) => (
              <label key={tk} className={'cat-check' + (tokens.includes(tk) ? ' on' : '')}>
                <input type="checkbox" checked={tokens.includes(tk)}
                  onChange={() => toggle(tokens, setTokens, tk)} />
                <span>{prettyTokenValue(tokenValue(tk, g.prefix), lang)}</span>
                {tokenCounts[tk] != null && <em>{tokenCounts[tk]}</em>}
              </label>
            ))}
          </div>
        );
      })}

      {availableFeatures.length > 0 && (
        <div className="cat-fgroup">
          <h4>{L('Features', 'Özellikler', 'Funktionen')}</h4>
          {availableFeatures.map((f) => (
            <label key={f.token} className={'cat-check' + (tokens.includes(f.token) ? ' on' : '')}>
              <input type="checkbox" checked={tokens.includes(f.token)}
                onChange={() => toggle(tokens, setTokens, f.token)} />
              <span>{lbl(f.label, lang)}</span>
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
                    <ProductCard product={p} priority={i < 4} />
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
