import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadAllProducts } from '../lib/typesense';
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
  const [cat, setCat] = useState('all');
  const [sort, setSort] = useState('score');
  const [shown, setShown] = useState(PAGE);
  const [q, setQ] = useState(params.get('q') || '');

  useEffect(() => {
    let live = true;
    loadAllProducts((batch) => {
      if (!live) return;
      setAll(batch.filter((p) => p.name));
      setLoading(false);
    })
      .then((full) => { if (live) setAll(full.filter((p) => p.name)); })
      .catch(() => setLoading(false));
    return () => { live = false; };
  }, []);

  // Keep the URL ?q= in sync so searches are shareable.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (q.trim()) next.set('q', q.trim());
      else next.delete('q');
      setParams(next, { replace: true });
      if (q.trim()) trackEvent('catalog_search', { query: q.trim() });
    }, 250);
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
    let v = all;
    if (cat !== 'all') v = v.filter((p) => (p.category || '').toLowerCase() === cat);
    const term = q.trim().toLowerCase();
    if (term) {
      v = v.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(term) ||
          (p.brand || '').toLowerCase().includes(term) ||
          (p.keySpecsText || '').toLowerCase().includes(term),
      );
    }
    v = [...v];
    if (sort === 'name') v.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));
    else v.sort((a, b) => (b.techScore || 0) - (a.techScore || 0));
    return v;
  }, [all, cat, q, sort]);

  useEffect(() => { setShown(PAGE); }, [cat, q, sort]);

  return (
    <div className="catalog">
      <div className="cat-hero">
        <div className="container">
          <h1>Kataloğu Keşfet</h1>
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
            {loading ? 'Yükleniyor…' : `${view.length.toLocaleString('tr-TR')} ürün`}
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
          {loading
            ? Array.from({ length: 12 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : view.slice(0, shown).map((p) => <ProductCard key={p.id} product={p} />)}
        </div>

        {!loading && view.length === 0 && (
          <div className="cat-empty">
            <div className="cat-empty-icon">🔍</div>
            <h3>Ürün bulunamadı</h3>
            <p>Farklı bir arama terimi ya da kategori dene.</p>
          </div>
        )}

        {!loading && shown < view.length && (
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
