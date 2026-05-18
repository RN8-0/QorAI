import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadAllProducts, searchProducts } from '../lib/typesense';
import { catMeta } from '../lib/format';
import { trackEvent } from '../lib/analytics';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import './Catalog.css';

const SORTS = [
  { id: 'score', label: 'En yüksek puan' },
  { id: 'name', label: 'A–Z' },
];
const PAGE = 30;

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState(params.get('cat') || 'all');
  const [sort, setSort] = useState('score');
  const [shown, setShown] = useState(PAGE);
  const [q, setQ] = useState(params.get('q') || '');
  const [hits, setHits] = useState(null); // Typesense results when searching
  const [searching, setSearching] = useState(false);

  // Full catalog — for browsing + category counts.
  useEffect(() => {
    let live = true;
    loadAllProducts((batch) => {
      if (live) { setAll(batch.filter((p) => p.name)); setLoading(false); }
    })
      .then((full) => { if (live) setAll(full.filter((p) => p.name)); })
      .catch(() => setLoading(false));
    return () => { live = false; };
  }, []);

  // Debounced Typesense search whenever the query changes.
  useEffect(() => {
    const term = q.trim();
    const next = new URLSearchParams(params);
    if (term) next.set('q', term); else next.delete('q');
    setParams(next, { replace: true });

    if (!term) { setHits(null); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchProducts(term, 200);
        setHits(r);
        trackEvent('catalog_search', { query: term });
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line

  const categories = useMemo(() => {
    const counts = {};
    all.forEach((p) => {
      const c = (p.category || 'other').toLowerCase();
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [all]);

  const view = useMemo(() => {
    let v = q.trim() ? hits || [] : all;
    if (cat !== 'all') v = v.filter((p) => (p.category || '').toLowerCase() === cat);
    v = [...v];
    if (sort === 'name') v.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));
    else v.sort((a, b) => (b.techScore || 0) - (a.techScore || 0));
    return v;
  }, [all, hits, cat, q, sort]);

  useEffect(() => { setShown(PAGE); }, [cat, q, sort]);

  const busy = q.trim() ? searching : loading;

  return (
    <div className="catalog">
      <div className="cat-hero">
        <div className="container">
          <h1>Kataloğu <span className="grad-text">Keşfet</span></h1>
          <p>AI puanlı teknoloji ürünleri — seç, karşılaştır, karar ver.</p>
          <div className="cat-search">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="İsim, marka veya özelliğe göre ara…" autoComplete="off" />
            {q && <button className="cat-clear" onClick={() => setQ('')} aria-label="Temizle">✕</button>}
          </div>
        </div>
      </div>

      <div className="container">
        <div className="cat-pills">
          <button className={'cat-pill' + (cat === 'all' ? ' active' : '')} onClick={() => setCat('all')}>
            Tümü <span>{all.length}</span>
          </button>
          {categories.map(([c, n]) => {
            const m = catMeta(c);
            return (
              <button key={c} className={'cat-pill' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>
                {m.icon} {m.label} <span>{n}</span>
              </button>
            );
          })}
        </div>

        <div className="cat-toolbar">
          <span className="cat-count">
            {busy ? 'Yükleniyor…' : `${view.length.toLocaleString('tr-TR')} ürün`}
            {q.trim() && !busy && <em> · "{q.trim()}" araması</em>}
          </span>
          <div className="cat-sort">
            {SORTS.map((s) => (
              <button key={s.id} className={sort === s.id ? 'active' : ''} onClick={() => setSort(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="cat-grid">
          {busy
            ? Array.from({ length: 9 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : view.slice(0, shown).map((p) => <ProductCard key={p.id} product={p} />)}
        </div>

        {!busy && view.length === 0 && (
          <div className="cat-empty">
            <div className="cat-empty-icon">🔍</div>
            <h3>Ürün bulunamadı</h3>
            <p>{q.trim()
              ? `"${q.trim()}" için sonuç yok. Farklı bir terim dene.`
              : 'Bu kategoride ürün yok.'}</p>
          </div>
        )}

        {!busy && shown < view.length && (
          <div className="cat-more">
            <button className="btn btn-ghost btn-lg" onClick={() => setShown((s) => s + PAGE)}>
              Daha fazla göster ({(view.length - shown).toLocaleString('tr-TR')} kaldı)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
